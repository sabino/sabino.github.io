import type { Stichos } from './session.ts';
import type { Effect, Npc, Point, Prop, Tile } from './types.ts';
import { random, deriveSeed } from '../procedural/random.ts';
import { StichosArt, color, drawHumanoid, line, poly, rect } from './art.ts';
import type { Sprite } from './art.ts';

interface Building {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  clan: number;
  cathedral: boolean;
}
interface Roof {
  sprite: Sprite;
  width: number;
  height: number;
}
const TAU = Math.PI * 2;
const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x));
const fract = (x: number) => x - Math.floor(x);
const cardinal = (angle: number) => (((Math.round(angle / (Math.PI / 2)) + 1) % 4) + 4) % 4;
const terrainClass = (terrain: Tile['terrain']) =>
  terrain === 'wall' || terrain === 'floor' ? 'road' : terrain;

/** Square ground coordinates with upright pixel sprites. Rendering never mutates simulation. */
export class StichosRenderer {
  private ctx: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private ratio = 1;
  private viewZoom = 1;
  private camera: Point = { x: 0, y: 5 };
  private art = new StichosArt();
  private roofs = new Map<string, Roof>();
  private buildingBounds = new Map<string, Building>();
  private chunkBuildings = new Map<string, Building[]>();
  private lightSprites = new Map<string, HTMLCanvasElement>();
  private atmosphereLayer: HTMLCanvasElement | null = null;
  private grounds = new Map<string, HTMLCanvasElement>();
  private worldSeed = -1;
  private lastTime = -1;
  private npcPrevious = new Map<string, Point>();
  private npcWalking = new Map<string, boolean>();
  private footsteps: { x: number; y: number; age: number; side: number; heading: number }[] = [];
  private previousPlayer: Point | null = null;
  private footDistance = 0;
  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resize(canvas.clientWidth || 1000, canvas.clientHeight || 700);
  }
  resize(width: number, height: number, dpr = 1) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.ratio = clamp(dpr, 1, 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.atmosphereLayer = null;
  }
  get zoom() {
    return this.viewZoom;
  }
  setZoom(value: number) {
    if (Number.isFinite(value)) this.viewZoom = clamp(value, 0.65, 1.8);
  }
  private get unit() {
    return 36 * this.viewZoom;
  }
  worldToScreen(p: Point): Point {
    return {
      x: this.width / 2 + (p.x - this.camera.x) * this.unit,
      y: this.height * 0.53 + (p.y - this.camera.y) * this.unit,
    };
  }
  screenToWorld(p: Point): Point {
    return {
      x: (p.x - this.width / 2) / this.unit + this.camera.x,
      y: (p.y - this.height * 0.53) / this.unit + this.camera.y,
    };
  }

  draw(
    game: Stichos,
    options: { reducedMotion?: boolean; transfer?: number; pointer?: Point | null } = {},
  ) {
    const ctx = this.ctx,
      unit = this.unit,
      scale = unit / 32;
    const dt = this.lastTime < 0 ? 0 : clamp(game.time - this.lastTime, 0, 0.05);
    this.lastTime = game.time;
    if (this.worldSeed !== game.world.seed) {
      this.worldSeed = game.world.seed;
      this.camera = { x: game.player.x, y: game.player.y };
      this.roofs.clear();
      this.buildingBounds.clear();
      this.chunkBuildings.clear();
      this.grounds.clear();
      this.footsteps = [];
      this.previousPlayer = null;
      this.npcPrevious.clear();
    }
    const follow = options.reducedMotion
      ? 1
      : this.previousPlayer === null
        ? 1
        : 1 - Math.exp(-Math.max(dt, 0.016) * 12);
    this.camera.x += (game.player.x - this.camera.x) * follow;
    this.camera.y += (game.player.y - this.camera.y) * follow;
    // Quantized camera preserves crisp pixel clusters without resampling the art.
    this.camera.x = Math.round(this.camera.x * unit) / unit;
    this.camera.y = Math.round(this.camera.y * unit) / unit;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#b8cada';
    ctx.fillRect(0, 0, this.width, this.height);
    const left = Math.floor(this.camera.x - this.width / unit / 2) - 2,
      right = Math.ceil(this.camera.x + this.width / unit / 2) + 2;
    const top = Math.floor(this.camera.y - (this.height * 0.53) / unit) - 8,
      bottom = Math.ceil(this.camera.y + (this.height * 0.47) / unit) + 7;
    const buildings = new Map<string, Building>();
    this.drawGround(game);
    for (let cy = Math.floor(top / 16); cy <= Math.floor(bottom / 16); cy++)
      for (let cx = Math.floor(left / 16); cx <= Math.floor(right / 16); cx++) {
        const chunkKey = `${cx},${cy}`;
        const cached = this.chunkBuildings.get(chunkKey);
        if (cached) {
          for (const building of cached) buildings.set(building.id, building);
          continue;
        }
        const inChunk = new Map<string, Building>();
        for (const tile of game.world.chunk(cx, cy).tiles) {
          const { x, y } = tile;
          if (tile.building && !buildings.has(tile.building)) {
            let b = this.buildingBounds.get(tile.building);
            if (!b) {
              // Resolve the full generated rectangle even when only its edge is visible.
              // This keeps roof geometry stable while scrolling into a settlement.
              b = {
                id: tile.building,
                minX: x,
                maxX: x,
                minY: y,
                maxY: y,
                clan: tile.clan ?? 0,
                cathedral: tile.building.endsWith(':hall'),
              };
              while (game.world.tile(b.minX - 1, y).building === b.id && x - b.minX < 32) b.minX--;
              while (game.world.tile(b.maxX + 1, y).building === b.id && b.maxX - x < 32) b.maxX++;
              while (game.world.tile(x, b.minY - 1).building === b.id && y - b.minY < 32) b.minY--;
              while (game.world.tile(x, b.maxY + 1).building === b.id && b.maxY - y < 32) b.maxY++;
              this.buildingBounds.set(b.id, b);
              while (this.buildingBounds.size > 128)
                this.buildingBounds.delete(this.buildingBounds.keys().next().value!);
            }
            buildings.set(tile.building, b);
          }
          if (tile.building && buildings.has(tile.building))
            inChunk.set(tile.building, buildings.get(tile.building)!);
        }
        this.chunkBuildings.set(chunkKey, [...inChunk.values()]);
        while (this.chunkBuildings.size > 128)
          this.chunkBuildings.delete(this.chunkBuildings.keys().next().value!);
      }
    this.drawFootprints(game, dt);
    const radius = Math.hypot(this.width / unit / 2, this.height / unit / 2) + 10;
    const props = game.world.propsAround(this.camera.x, this.camera.y, radius).filter((p) => {
      if (game.removed.has(p.id)) return false;
      const screen = this.worldToScreen(p);
      // Cull before generating or looking up any sprite, shadow or glow.
      return (
        screen.x > -3 * unit &&
        screen.x < this.width + 3 * unit &&
        screen.y > -unit &&
        screen.y < this.height + 5 * unit
      );
    });
    for (const prop of props) {
      const p = this.worldToScreen(prop);
      if (prop.kind === 'lamp') this.glow(p.x, p.y - 5 * scale, 55 * scale, '#edb768', 0.32);
      if (['cequin', 'heartleaf', 'emberroot'].includes(prop.kind))
        this.glow(
          p.x,
          p.y - 9 * scale,
          23 * scale,
          prop.kind === 'heartleaf' ? '#a79de5' : prop.kind === 'emberroot' ? '#da967a' : '#84c7bd',
          0.13,
        );
      if (prop.kind === 'pine' || prop.kind === 'rock')
        this.shadow(
          p,
          (prop.kind === 'pine' ? 28 : 18) * scale,
          (prop.kind === 'pine' ? 12 : 7) * scale,
          0.12,
        );
    }
    const drawables: { depth: number; draw: () => void }[] = [];
    for (const b of buildings.values())
      drawables.push({ depth: b.maxY + 0.38, draw: () => this.building(game, b) });
    for (const prop of props)
      drawables.push({
        depth: prop.y + (prop.kind === 'door' ? 0.45 : 0),
        draw: () => this.prop(game, prop),
      });
    const playerScreen = this.worldToScreen(game.player);
    for (const npc of game.npcs) {
      if (npc.id === game.occupiedNpcId) continue;
      if (
        Math.abs(npc.x - this.camera.x) > this.width / unit / 2 + 3 ||
        Math.abs(npc.y - this.camera.y) > this.height / unit + 5
      )
        continue;
      const prior = this.npcPrevious.get(npc.id);
      if (dt > 0 && prior)
        this.npcWalking.set(npc.id, Math.hypot(npc.x - prior.x, npc.y - prior.y) > 0.002);
      this.npcPrevious.set(npc.id, { x: npc.x, y: npc.y });
      drawables.push({ depth: npc.y, draw: () => this.person(game, npc, false) });
    }
    drawables.push({ depth: game.player.y, draw: () => this.person(game, game.player, true) });
    drawables.sort((a, b) => a.depth - b.depth).forEach((item) => item.draw());
    for (const prop of props) {
      const p = this.worldToScreen(prop);
      if (prop.kind === 'lamp') this.glow(p.x, p.y - 51 * scale, 18 * scale, '#ffcf8b', 0.25);
      if (prop.kind === 'radio') {
        rect(ctx, p.x + 3 * scale, p.y - 21 * scale, 2 * scale, scale, '#c2f1d3');
      }
    }
    for (const effect of game.effects) this.effect(effect);
    if (options.pointer && !options.transfer) this.pointer(game, options.pointer);
    this.atmosphere(game, !!options.reducedMotion);
    if (options.transfer) this.transfer(playerScreen, options.transfer);
    this.previousPlayer = { x: game.player.x, y: game.player.y };
    if (this.npcPrevious.size > 256) {
      const visible = new Set(game.npcs.map((n) => n.id));
      for (const id of this.npcPrevious.keys())
        if (!visible.has(id)) {
          this.npcPrevious.delete(id);
          this.npcWalking.delete(id);
        }
    }
  }

  private drawGround(game: Stichos) {
    const u = this.unit,
      minX = Math.floor((this.camera.x - this.width / u / 2 - 1) / 16),
      maxX = Math.floor((this.camera.x + this.width / u / 2 + 1) / 16);
    const minY = Math.floor((this.camera.y - (this.height * 0.53) / u - 1) / 16),
      maxY = Math.floor((this.camera.y + (this.height * 0.47) / u + 1) / 16);
    for (let cy = minY; cy <= maxY; cy++)
      for (let cx = minX; cx <= maxX; cx++) {
        const key = `${cx},${cy}`;
        let canvas = this.grounds.get(key);
        if (!canvas) {
          canvas = document.createElement('canvas');
          canvas.width = canvas.height = 512;
          const ctx = canvas.getContext('2d', { alpha: false })!,
            tiles: Tile[] = [];
          ctx.imageSmoothingEnabled = false;
          for (let dy = -1; dy <= 16; dy++)
            for (let dx = -1; dx <= 16; dx++) {
              const tile = game.world.tile(cx * 16 + dx, cy * 16 + dy);
              tiles.push(tile);
              ctx.drawImage(this.art.ground(tile).image, dx * 32, dy * 32);
            }
          for (const tile of tiles) {
            const p = { x: (tile.x - cx * 16) * 32 + 16, y: (tile.y - cy * 16) * 32 + 16 };
            this.transition(game, tile, ctx, 32, p);
            if (tile.terrain === 'grass' && tile.biome === 'settlement')
              this.garden(game, tile, ctx, 32, p);
          }
          this.grounds.set(key, canvas);
          while (this.grounds.size > 64) this.grounds.delete(this.grounds.keys().next().value!);
        } else {
          this.grounds.delete(key);
          this.grounds.set(key, canvas);
        }
        const p = this.worldToScreen({ x: cx * 16 - 0.5, y: cy * 16 - 0.5 });
        this.ctx.drawImage(
          canvas,
          Math.round(p.x),
          Math.round(p.y),
          Math.ceil(u * 16),
          Math.ceil(u * 16),
        );
      }
  }

  private transition(
    game: Stichos,
    tile: Tile,
    ctx = this.ctx,
    u = this.unit,
    p = this.worldToScreen(tile),
  ) {
    const type = terrainClass(tile.terrain);
    if (type === 'snow' || tile.building) return;
    const rng = random(deriveSeed(tile.seed, 'edge'));
    const s = u / 32;
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const neighbor = game.world.tile(tile.x + dx, tile.y + dy);
      if (
        neighbor.terrain !== 'snow' &&
        !(neighbor.terrain === 'grass' && ['road', 'ice', 'water'].includes(type))
      )
        continue;
      for (let i = 0; i < 9; i++) {
        const along = -u / 2 + (i * u) / 8;
        const x = p.x + (dx ? dx * (u / 2 - rng() * 3 * s) : along);
        const y = p.y + (dy ? dy * (u / 2 - rng() * 3 * s) : along);
        rect(
          ctx,
          x - (dx ? 2 : 3) * s,
          y - (dy ? 2 : 3) * s,
          (3 + rng() * 3) * s,
          (2 + rng() * 3) * s,
          rng() > 0.5 ? '#d0dce9' : '#afc3d9',
        );
      }
    }
    if (type === 'water' || type === 'ice') {
      ctx.globalAlpha = 0.2;
      const y = p.y + Math.sin(game.time * 0.7 + tile.x) * u * 0.2;
      rect(ctx, p.x - u * 0.2, y, u * 0.4, s, '#d6e5ed');
      ctx.globalAlpha = 1;
    }
  }

  private garden(
    game: Stichos,
    tile: Tile,
    ctx = this.ctx,
    u = this.unit,
    p = this.worldToScreen(tile),
  ) {
    const s = u / 32;
    for (let i = -10; i <= 10; i += 7)
      line(ctx, p.x - u * 0.4, p.y + i * s, p.x + u * 0.4, p.y + i * s, '#354f56', Math.max(1, s));
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ])
      if (game.world.tile(tile.x + dx, tile.y + dy).terrain !== 'grass') {
        const x = p.x + (dx * u) / 2,
          y = p.y + (dy * u) / 2;
        rect(
          ctx,
          dx ? x - 2 * s : p.x - u / 2,
          dy ? y - 4 * s : p.y - u / 2,
          dx ? 4 * s : u,
          dy ? 5 * s : u,
          '#685f4f',
        );
        rect(
          ctx,
          dx ? x - s : p.x - u / 2,
          dy ? y - 5 * s : p.y - u / 2,
          dx ? 2 * s : u,
          dy ? 2 * s : u,
          '#c6d6e4',
        );
      }
  }

  private drawFootprints(game: Stichos, dt: number) {
    if (this.previousPlayer) {
      const distance = Math.hypot(
        game.player.x - this.previousPlayer.x,
        game.player.y - this.previousPlayer.y,
      );
      this.footDistance += distance;
      if (
        distance < 1 &&
        this.footDistance > 0.3 &&
        game.world.tile(game.player.x, game.player.y).terrain === 'snow'
      ) {
        this.footDistance = 0;
        this.footsteps.push({
          x: game.player.x,
          y: game.player.y,
          age: 0,
          side: this.footsteps.length % 2 ? 1 : -1,
          heading: game.player.heading,
        });
      }
    }
    for (const foot of this.footsteps) {
      foot.age += dt;
      const p = this.worldToScreen(foot),
        s = this.unit / 32;
      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(foot.heading + Math.PI / 2);
      this.ctx.globalAlpha = Math.max(0, 0.3 * (1 - foot.age / 35));
      rect(this.ctx, foot.side * 3 * s, -s, 2 * s, 5 * s, '#6f8eac');
      this.ctx.restore();
    }
    this.footsteps = this.footsteps.filter((f) => f.age < 35).slice(-120);
  }

  private prop(game: Stichos, prop: Prop) {
    const p = this.worldToScreen(prop),
      s = (this.unit / 32) * (prop.kind === 'door' && prop.building?.endsWith(':hall') ? 2.2 : 1);
    if (prop.kind === 'door') p.y += this.unit * 0.5;
    if (p.x < -96 * s || p.x > this.width + 96 * s || p.y < -32 * s || p.y > this.height + 160 * s)
      return;
    const sprite = this.art.prop(
      prop.kind,
      prop.seed,
      game.opened.has(prop.id),
      game.world.clans[prop.clan ?? 0]?.color ?? '#68837c',
    );
    const x = p.x - sprite.x * s,
      y = p.y - sprite.y * s;
    if (
      x > this.width + 30 ||
      x + sprite.image.width * s < -30 ||
      y > this.height + 30 ||
      y + sprite.image.height * s < -30
    )
      return;
    const player = this.worldToScreen(game.player);
    const occludes =
      prop.kind === 'pine' &&
      prop.y > game.player.y &&
      Math.abs(player.x - p.x) < 42 * s &&
      player.y > y + 15 * s &&
      player.y < p.y + 2 * s;
    this.ctx.save();
    this.ctx.globalAlpha = occludes ? 0.32 : 1;
    this.ctx.drawImage(
      sprite.image,
      Math.round(x),
      Math.round(y),
      Math.round(sprite.image.width * s),
      Math.round(sprite.image.height * s),
    );
    this.ctx.restore();
  }

  private shadow(p: Point, width: number, height: number, alpha: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#1d3850';
    ctx.beginPath();
    ctx.ellipse(p.x + 4, p.y + 2, width, height, -0.1, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  private person(game: Stichos, person: Npc | Stichos['player'], player: boolean) {
    const p = this.worldToScreen(person),
      s = this.unit / 32,
      ctx = this.ctx;
    if (person.hp <= 0) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(-0.7);
      rect(ctx, -7 * s, -4 * s, 16 * s, 7 * s, '#485663');
      rect(ctx, 7 * s, -3 * s, 5 * s, 4 * s, '#a88c7b');
      ctx.restore();
      return;
    }
    this.shadow(p, 7 * s, 3 * s, 0.27);
    if (player) {
      ctx.strokeStyle = '#d9cda2a0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 10 * s, 5 * s, 0, 0, TAU);
      ctx.stroke();
    }
    const walking = player
      ? !!this.previousPlayer &&
        Math.hypot(person.x - this.previousPlayer.x, person.y - this.previousPlayer.y) > 0.002
      : (this.npcWalking.get((person as Npc).id) ?? false);
    const cooldown = player ? game.player.attackCooldown : (person as Npc).cooldown;
    const attack = cooldown > 0.25 ? clamp((cooldown - 0.25) / 0.4, 0, 1) : 0;
    drawHumanoid(
      ctx,
      person.appearance,
      p.x,
      p.y,
      s,
      cardinal(person.heading),
      person.phase,
      walking,
      attack,
      player,
    );
    const near = Math.hypot(person.x - game.player.x, person.y - game.player.y) < 4;
    if (player || near || (person as Npc).hostile) {
      const label = player ? 'Theo' : person.name.split(' ')[0];
      ctx.font = `${Math.max(9, Math.round(9 * Math.sqrt(this.viewZoom)))}px Georgia,serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const labelY = p.y - 44 * s * person.appearance.height;
      ctx.fillStyle = '#172e40bb';
      ctx.fillRect(
        Math.round(p.x - ctx.measureText(label).width / 2 - 4),
        Math.round(labelY - 11),
        Math.ceil(ctx.measureText(label).width + 8),
        13,
      );
      ctx.fillStyle = player ? '#f0e7c9' : (person as Npc).hostile ? '#efb9a9' : '#d8e1d8';
      ctx.fillText(label, Math.round(p.x), Math.round(labelY));
      if (person.hp < person.maxHp || player) {
        rect(ctx, p.x - 11 * s, labelY + 3, 22 * s, 3, '#253746');
        rect(
          ctx,
          p.x - 10 * s,
          labelY + 4,
          (20 * s * person.hp) / person.maxHp,
          1,
          player ? '#b86f65' : '#a2c0a3',
        );
      }
    }
    const breath = fract(game.time * 0.36 + (person.appearance.seed % 13));
    if (breath < 0.4) {
      ctx.save();
      ctx.globalAlpha = 0.22 * Math.sin((breath / 0.4) * Math.PI);
      const side = Math.cos(person.heading),
        yy = Math.sin(person.heading);
      for (let i = 0; i < 5; i++)
        rect(
          ctx,
          p.x + side * (5 + breath * 24 + i * 2) * s,
          p.y - (31 - yy * 3 + breath * 8) * s,
          (2 + (i % 2)) * s,
          2 * s,
          '#edf5f5',
        );
      ctx.restore();
    }
  }

  private building(game: Stichos, b: Building) {
    const ctx = this.ctx,
      s = this.unit / 32,
      u = this.unit;
    const playerTile = game.world.tile(game.player.x, game.player.y),
      inside = playerTile.building === b.id;
    const left = this.worldToScreen({ x: b.minX - 0.5, y: b.minY - 0.5 }),
      right = this.worldToScreen({ x: b.maxX + 0.5, y: b.maxY + 0.5 });
    const rows = b.maxY - b.minY + 1,
      cols = b.maxX - b.minX + 1;
    if (cols < 2 || rows < 2) return;
    const key = `${game.world.seed}:${b.id}:${cols}:${rows}`;
    let roof = this.roofs.get(key);
    if (!roof) {
      roof = this.makeRoof(b, game.world.seed);
      this.roofs.set(key, roof);
      while (this.roofs.size > 28) this.roofs.delete(this.roofs.keys().next().value!);
    }
    // Foundations and steps use the same ground footprint as collision geometry.
    for (let step = 2; step >= 0; step--) {
      const width = (b.cathedral ? 3 : 1.6) * u + step * 7 * s,
        x = (left.x + right.x - width) / 2,
        y = right.y + step * 3 * s;
      rect(ctx, x, y, width, 3 * s, '#8a9cab');
      rect(ctx, x, y, width, s, '#d2dee7');
    }
    if (!inside) {
      ctx.globalAlpha = 1;
      ctx.drawImage(
        roof.sprite.image,
        Math.round(left.x - roof.sprite.x * s),
        Math.round(left.y - roof.sprite.y * s),
        Math.round(roof.width * s),
        Math.round(roof.height * s),
      );
      if (b.cathedral) {
        const center = (left.x + right.x) / 2;
        for (const side of [-1, 1]) {
          this.glow(center + side * 60 * s, right.y - 52 * s, 33 * s, '#f0b765', 0.24);
          this.glow(center + side * 60 * s, right.y + 4 * s, 39 * s, '#f0b765', 0.1);
        }
      }
    } else {
      // Roof lifted: preserve the north wall and side walls, lower/fade the near wall.
      for (let y = b.minY; y <= b.maxY; y++)
        for (let x = b.minX; x <= b.maxX; x++) {
          if (game.world.tile(x, y).terrain !== 'wall') continue;
          const p = this.worldToScreen({ x, y });
          ctx.globalAlpha = y > game.player.y ? 0.28 : 0.95;
          this.wall(
            p.x - u / 2,
            p.y + u / 2,
            u,
            (b.cathedral ? 53 : 34) * s,
            deriveSeed(game.world.seed, b.id, x, y),
            x % 2 === 0,
          );
        }
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.drawImage(
        roof.sprite.image,
        left.x - roof.sprite.x * s,
        left.y - roof.sprite.y * s,
        roof.width * s,
        roof.height * s,
      );
      ctx.restore();
    }
    if (b.cathedral && !inside)
      for (const dx of [-2.9, 2.9]) {
        const p = this.worldToScreen({ x: (b.minX + b.maxX) / 2 + dx, y: b.maxY });
        this.glow(p.x, p.y - 41 * s, 29 * s, '#e6aa65', 0.15);
      }
  }

  private wall(
    x: number,
    foot: number,
    width: number,
    height: number,
    seed: number,
    window: boolean,
  ) {
    const ctx = this.ctx,
      rng = random(seed),
      s = this.unit / 32;
    rect(ctx, x, foot - height, width, height, '#374a5b');
    for (let row = 0; row < Math.ceil(height / (6 * s)); row++)
      for (let col = -1; col < 4; col++) {
        const bx = x + col * 10 * s + (row % 2) * 5 * s,
          by = foot - row * 6 * s;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, foot - height, width, height);
        ctx.clip();
        const c = ['#5f7081', '#6a7b8c', '#4e6173', '#7b8996'][Math.floor(rng() * 4)];
        rect(ctx, bx + s, by - 5 * s, 9 * s, 5 * s, c);
        rect(ctx, bx + 2 * s, by - 5 * s, 7 * s, s, color(c, 15));
        ctx.restore();
      }
    rect(ctx, x, foot - height, width, 3 * s, '#b5c6d8');
    rect(ctx, x, foot - 3 * s, width, 3 * s, '#9aa9b3');
    if (window)
      this.window(
        ctx,
        x + width / 2,
        foot - 12 * s,
        10 * s,
        Math.min(31 * s, height - 12 * s),
        seed,
      );
  }

  private window(
    ctx: CanvasRenderingContext2D,
    cx: number,
    bottom: number,
    width: number,
    height: number,
    seed: number,
  ) {
    const rng = random(seed),
      s = width / 12;
    ctx.save();
    const warmth = ctx.createRadialGradient(
      cx,
      bottom - height * 0.4,
      width * 0.1,
      cx,
      bottom - height * 0.4,
      height * 0.6,
    );
    warmth.addColorStop(0, '#efbd693c');
    warmth.addColorStop(1, '#efbd6900');
    ctx.fillStyle = warmth;
    ctx.fillRect(cx - height * 0.6, bottom - height * 1.1, height * 1.2, height * 1.2);
    ctx.restore();
    const points = [
      [cx - width / 2, bottom],
      [cx - width / 2, bottom - height * 0.65],
      [cx, bottom - height],
      [cx + width / 2, bottom - height * 0.65],
      [cx + width / 2, bottom],
    ];
    poly(ctx, points, '#233b4e');
    ctx.save();
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.clip();
    for (let y = bottom - height; y < bottom; y += 3 * s)
      for (let x = cx - width / 2; x < cx + width / 2; x += 3 * s)
        rect(
          ctx,
          x + s,
          y + s,
          2 * s,
          2 * s,
          ['#e9bd6b', '#ffe0a0', '#dca664', '#b98c64', '#ebc184'][Math.floor(rng() * 5)],
        );
    line(ctx, cx, bottom - height + 4 * s, cx, bottom, '#b3a079', s);
    line(
      ctx,
      cx - width / 2,
      bottom - height / 3,
      cx + width / 2,
      bottom - height / 3,
      '#b3a079',
      s,
    );
    ctx.restore();
    for (let i = 1; i < points.length; i++)
      line(
        ctx,
        points[i - 1][0],
        points[i - 1][1],
        points[i][0],
        points[i][1],
        '#aeb9ba',
        Math.max(1, s),
      );
    rect(ctx, cx - width * 0.65, bottom, width * 1.3, 3 * s, '#cad5df');
  }

  private makeCathedral(b: Building, worldSeed: number): Roof {
    const w = (b.maxX - b.minX + 1) * 32,
      h = (b.maxY - b.minY + 1) * 32;
    const canvas = document.createElement('canvas');
    canvas.width = w + 112;
    canvas.height = h + 338;
    const ctx = canvas.getContext('2d')!,
      rng = random(deriveSeed(worldSeed, b.id, 'cathedral'));
    const x = 56,
      top = 320,
      front = top + h,
      mid = x + w / 2;
    const naveWidth = Math.min(232, w * 0.54),
      naveX = mid - naveWidth / 2;
    const wall = (left: number, foot: number, width: number, height: number) => {
      rect(ctx, left, foot - height, width, height, '#263e52');
      for (let row = 0; row < height / 9; row++)
        for (let col = -1; col < width / 17; col++) {
          const bx = left + col * 17 + (row % 2) * 8,
            by = foot - height + row * 9;
          const clippedX = Math.max(left, bx + 1),
            end = Math.min(left + width, bx + 16);
          if (end <= clippedX) continue;
          const c = ['#485f74', '#50677c', '#3f586e', '#536b7f', '#455e73'][Math.floor(rng() * 5)];
          rect(ctx, clippedX, by + 1, end - clippedX, 8, c);
          if (rng() > 0.32)
            rect(ctx, clippedX + 1, by + 1, Math.max(1, end - clippedX - 3), 1, color(c, 9));
          if (rng() > 0.8) rect(ctx, clippedX + 2, by + 5, 3, 1, color(c, -9));
        }
      rect(ctx, left, foot - 9, width, 9, '#334d63');
      rect(ctx, left - 2, foot - height - 3, width + 4, 5, '#adc2d7');
      for (let i = 0; i < width / 9; i++) {
        const bx = left + rng() * width;
        rect(ctx, bx, foot - height - 5, 3 + rng() * 8, 3, '#d4e0ed');
        if (rng() > 0.6) rect(ctx, bx + 2, foot - height - 1, 1, 3 + rng() * 6, '#adc8df');
      }
    };
    const buttress = (bx: number, height: number, width = 16) => {
      rect(ctx, bx - width / 2 - 4, front - height, width + 8, height, '#1e3549');
      rect(ctx, bx - width / 2, front - height, width, height, '#61798d');
      rect(ctx, bx + 2, front - height, width / 2 - 2, height, '#344f67');
      for (let yy = front - 4; yy > front - height; yy -= 34) {
        rect(ctx, bx - width / 2 - 2, yy, width + 4, 4, '#8198aa');
        rect(ctx, bx - width / 2 - 2, yy, width + 3, 1, '#a6bccd');
      }
      poly(
        ctx,
        [
          [bx - width / 2 - 5, front - height],
          [bx, front - height - 29],
          [bx + width / 2 + 5, front - height],
        ],
        '#3c566e',
      );
      line(ctx, bx - width / 2 - 5, front - height, bx, front - height - 29, '#d0dfee', 3);
      rect(ctx, bx - 1, front - height - 40, 2, 12, '#a3ac9d');
      rect(ctx, bx - 5, front - height - 36, 10, 2, '#a3ac9d');
    };
    // The side aisles retain a lower roof and wall; the center rises as a separate nave.
    wall(x, front, w, 168);
    for (const side of [-1, 1]) {
      const a = side < 0 ? x : naveX + naveWidth,
        end = side < 0 ? naveX : x + w;
      poly(
        ctx,
        [
          [a - 4, top - 18],
          [end + 4, top - 18],
          [end + 4, front - 169],
          [a - 4, front - 169],
        ],
        '#29485f',
      );
      for (let yy = top - 14; yy < front - 176; yy += 8)
        for (let xx = a; xx < end; xx += 13) {
          rect(ctx, xx, yy, 12, 6, rng() > 0.5 ? '#385971' : '#315169');
        }
      for (let i = 0; i < 5; i++) {
        const xx = a + rng() * (end - a),
          yy = top + rng() * (front - 178 - top);
        poly(
          ctx,
          [
            [xx - 7, yy],
            [xx + 20, yy - 4],
            [xx + 38, yy + 2],
            [xx + 31, yy + 8],
            [xx - 4, yy + 6],
          ],
          '#bccfe2',
        );
      }
      line(ctx, a - 5, front - 172, end + 4, front - 172, '#c9d9e7', 5);
      const bayCount = Math.max(1, Math.floor((end - a) / 52));
      for (let i = 0; i < bayCount; i++) {
        const bx = a + ((i + 0.5) * (end - a)) / bayCount;
        this.window(ctx, bx, front - 25, 25, 113, deriveSeed(worldSeed, b.id, side, i));
      }
      buttress(side < 0 ? x + 3 : x + w - 3, 199, 21);
      // Flying arches connect the lower outer aisle to the taller central structure.
      const outer = side < 0 ? x + 21 : x + w - 21,
        inner = mid + side * (naveWidth / 2 - 4);
      poly(
        ctx,
        [
          [outer, front - 172],
          [outer, front - 191],
          [inner, front - 249],
          [inner, front - 228],
        ],
        '#607b91',
      );
      line(ctx, outer, front - 191, inner, front - 249, '#c5d7e7', 4);
    }
    wall(naveX, front, naveWidth, 259);
    poly(
      ctx,
      [
        [naveX - 4, front - 259],
        [mid, front - 345],
        [naveX + naveWidth + 4, front - 259],
      ],
      '#3a536a',
    );
    for (let row = 0; row < 9; row++) {
      const yy = front - 337 + row * 9,
        half = (((yy - (front - 345)) / 86) * naveWidth) / 2;
      line(ctx, mid - half + 5, yy, mid + half - 5, yy, '#617a8f');
    }
    line(ctx, naveX - 7, front - 259, mid, front - 349, '#c6d7e6', 5);
    line(ctx, mid, front - 349, naveX + naveWidth + 7, front - 259, '#8faec5', 5);
    buttress(naveX + 5, 285, 22);
    buttress(naveX + naveWidth - 5, 285, 22);
    for (const side of [-1, 1])
      this.window(
        ctx,
        mid + side * 70,
        front - 24,
        25,
        187,
        deriveSeed(worldSeed, b.id, 'nave', side),
      );
    // Rose glass, lead tracery and a botanical rosette above the recessed portal.
    const roseY = front - 213;
    ctx.fillStyle = '#263b50';
    ctx.beginPath();
    ctx.arc(mid, roseY, 31, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#8da3b5';
    ctx.lineWidth = 5;
    ctx.stroke();
    for (let petal = 0; petal < 8; petal++) {
      const a = (petal / 8) * TAU;
      poly(
        ctx,
        [
          [mid + Math.cos(a) * 6, roseY + Math.sin(a) * 6],
          [mid + Math.cos(a - 0.22) * 23, roseY + Math.sin(a - 0.22) * 23],
          [mid + Math.cos(a) * 27, roseY + Math.sin(a) * 27],
          [mid + Math.cos(a + 0.22) * 23, roseY + Math.sin(a + 0.22) * 23],
        ],
        petal % 2 ? '#eac074' : '#c68d64',
      );
    }
    rect(ctx, mid - 3, roseY - 3, 6, 6, '#ffe5a2');
    this.window(ctx, mid, front - 273, 25, 48, deriveSeed(worldSeed, b.id, 'upper'));
    // Concentric stone archivolts give the entrance visible thickness and shadow.
    for (let layer = 0; layer < 5; layer++) {
      const half = 55 - layer * 5,
        peak = 151 - layer * 7;
      poly(
        ctx,
        [
          [mid - half, front],
          [mid - half, front - peak * 0.63],
          [mid, front - peak],
          [mid + half, front - peak * 0.63],
          [mid + half, front],
        ],
        ['#233b50', '#8ca2b4', '#405b72', '#738b9e', '#132b3d'][layer],
      );
    }
    line(ctx, mid - 59, front - 99, mid, front - 159, '#d7e2ec', 5);
    line(ctx, mid, front - 159, mid + 59, front - 99, '#a4bfd5', 4);
    // Cloth standards sit against blank stone, leaving the glass and central door clear.
    for (const side of [-1, 1]) {
      const bx = mid + side * (naveWidth / 2 + 31),
        by = front - 143;
      rect(ctx, bx - 17, by - 6, 35, 3, '#a88e5e');
      poly(
        ctx,
        [
          [bx - 14, by],
          [bx + 14, by],
          [bx + 14, by + 78],
          [bx, by + 90],
          [bx - 14, by + 78],
        ],
        '#213f4a',
      );
      line(ctx, bx - 12, by + 2, bx - 12, by + 76, '#b39a65');
      line(ctx, bx + 12, by + 2, bx + 12, by + 76, '#b39a65');
      line(ctx, bx - 12, by + 76, bx, by + 87, '#b39a65');
      line(ctx, bx, by + 87, bx + 12, by + 76, '#b39a65');
      line(ctx, bx, by + 19, bx, by + 65, '#c1ac7d', 2);
      for (let j = 0; j < 5; j++)
        for (const s of [-1, 1])
          line(ctx, bx, by + 57 - j * 7, bx + s * (8 - j * 0.7), by + 50 - j * 7, '#c1ac7d');
      rect(ctx, bx - 18, by - 8, 33, 2, '#d0e0ed');
    }
    // Warm wall lanterns are architectural fixtures, independent of ground collision.
    for (const side of [-1, 1]) {
      const bx = mid + side * 60;
      rect(ctx, bx - 2, front - 62, 4, 22, '#1c303f');
      rect(ctx, bx - 5, front - 61, 10, 15, '#bf9864');
      rect(ctx, bx - 3, front - 58, 6, 10, '#ffe1a0');
      rect(ctx, bx - 6, front - 64, 12, 3, '#536478');
      rect(ctx, bx - 5, front - 46, 10, 3, '#283b4d');
    }
    for (let step = 0; step < 5; step++) {
      const sw = 113 + step * 12;
      rect(ctx, mid - sw / 2, front + step * 3, sw, 3, '#5b7389');
      rect(ctx, mid - sw / 2, front + step * 3, sw, 1, '#b7ccdd');
    }
    return { sprite: { image: canvas, x: 56, y: 320 }, width: canvas.width, height: canvas.height };
  }

  private makeRoof(b: Building, worldSeed: number): Roof {
    if (b.cathedral) return this.makeCathedral(b, worldSeed);
    const cols = b.maxX - b.minX + 1,
      rows = b.maxY - b.minY + 1,
      width = cols * 32 + 48,
      extra = b.cathedral ? 214 : 76,
      height = rows * 32 + extra + 16;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!,
      rng = random(deriveSeed(worldSeed, b.id, 'architecture'));
    const x = 24,
      y = extra,
      w = cols * 32,
      h = rows * 32,
      front = y + h,
      facade = b.cathedral ? 202 : 58;
    rect(ctx, x - 3, y - 35, w + 6, h + 35, '#30475a');
    // Stone foundation side faces and roof slate have independent texture layers.
    for (let row = 0; row < h / 6 + 10; row++)
      for (let col = 0; col < w / 11 + 1; col++) {
        const bx = x + col * 11 + (row % 2) * 5,
          by = y - 35 + row * 6;
        if (bx >= x + w || by >= front) continue;
        const c = ['#4d6276', '#657889', '#748696', '#536a7d'][Math.floor(rng() * 4)];
        rect(ctx, bx + 1, by + 1, Math.min(10, x + w - bx), 5, c);
        rect(ctx, bx + 2, by + 1, Math.min(8, x + w - bx), 1, color(c, 13));
      }
    const roofTop = y - 43,
      roofBottom = front - facade,
      mid = x + w / 2;
    poly(
      ctx,
      [
        [x - 8, roofTop + 13],
        [mid, roofTop - 22],
        [x + w + 8, roofTop + 13],
        [x + w + 8, roofBottom],
        [mid, roofBottom - 28],
        [x - 8, roofBottom],
      ],
      '#314b60',
    );
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - 8, roofTop + 13);
    ctx.lineTo(mid, roofTop - 22);
    ctx.lineTo(x + w + 8, roofTop + 13);
    ctx.lineTo(x + w + 8, roofBottom);
    ctx.lineTo(mid, roofBottom - 28);
    ctx.lineTo(x - 8, roofBottom);
    ctx.closePath();
    ctx.clip();
    for (let row = 0; row < (roofBottom - roofTop) / 6 + 10; row++)
      for (let col = -1; col < w / 9 + 3; col++) {
        const xx = x + col * 9 + (row % 2) * 4,
          yy = roofTop - 25 + row * 6;
        rect(
          ctx,
          xx,
          yy,
          8,
          5,
          ['#3b5368', '#3e586d', '#354d62', '#405a70'][Math.floor(rng() * 4)],
        );
        rect(ctx, xx + 1, yy, 6, 1, '#4b6378');
        if (rng() > 0.97) {
          rect(ctx, xx, yy, 9, 2, '#bacddd');
          rect(ctx, xx + 2, yy - 1, 5, 2, '#dce5ed');
        }
      }
    poly(
      ctx,
      [
        [mid, roofTop - 22],
        [x + w + 8, roofTop + 13],
        [x + w + 8, roofBottom],
        [mid, roofBottom - 28],
      ],
      '#112d4836',
    );
    for (let i = 0; i < w / 24; i++) {
      const xx = x + rng() * w,
        yy = roofTop + rng() * Math.max(1, roofBottom - roofTop);
      const span = 32 + rng() * 55;
      poly(
        ctx,
        [
          [xx - 8, yy + 7],
          [xx, yy],
          [xx + span * 0.32, yy - 4],
          [xx + span * 0.66, yy],
          [xx + span, yy - 2],
          [xx + span + 4, yy + 9],
          [xx + span * 0.64, yy + 14],
          [xx + span * 0.3, yy + 11],
          [xx - 5, yy + 13],
        ],
        '#aabfd6',
      );
      poly(
        ctx,
        [
          [xx - 4, yy + 5],
          [xx + 3, yy],
          [xx + span * 0.32, yy - 3],
          [xx + span * 0.63, yy + 2],
          [xx + span - 3, yy],
          [xx + span, yy + 6],
          [xx + span * 0.66, yy + 9],
          [xx + span * 0.3, yy + 6],
        ],
        '#d7e2ec',
      );
    }
    // The ridge holds a continuous windward snow load, not white slate-shaped speckles.
    for (let yy = roofTop - 15; yy < roofBottom - 25; yy += 10) {
      const span = 7 + rng() * 12;
      poly(
        ctx,
        [
          [mid - span, yy + 4],
          [mid - 5, yy - 3],
          [mid + 6, yy - 2],
          [mid + span * 0.65, yy + 9],
          [mid + 4, yy + 13],
          [mid - span * 0.8, yy + 11],
        ],
        '#cfdfec',
      );
    }
    ctx.restore();
    line(ctx, mid, roofTop - 22, mid, roofBottom - 28, '#d5e0e8', 4);
    line(ctx, x - 8, roofBottom, mid, roofBottom - 28, '#d2deea', 4);
    line(ctx, mid, roofBottom - 28, x + w + 8, roofBottom, '#acbfd2', 4);
    // Front-facing Gothic bays. Each bay reuses a masonry/window module.
    for (let col = 0; col < cols; col++) {
      const bx = x + col * 32;
      for (let row = 0; row < facade / 6; row++)
        for (let brick = 0; brick < 4; brick++) {
          const xx = bx + brick * 9 + (row % 2) * 4,
            yy = front - facade + row * 6;
          if (xx > bx + 30) continue;
          const c = ['#788590', '#5e7081', '#88949e', '#667786'][Math.floor(rng() * 4)];
          rect(ctx, xx, yy, Math.min(8, bx + 32 - xx), 5, c);
          rect(ctx, xx + 1, yy, Math.min(6, bx + 31 - xx), 1, color(c, 17));
        }
      if (Math.abs(col - (cols - 1) / 2) > 1)
        this.window(
          ctx,
          bx + 16,
          front - 15,
          b.cathedral ? 18 : 13,
          b.cathedral ? 154 : 33,
          deriveSeed(worldSeed, b.id, col),
        );
      if (col % 2 === 0 || col === cols - 1) {
        rect(ctx, bx - 4, front - facade - 5, 11, facade + 5, '#425a70');
        rect(ctx, bx - 3, front - facade - 5, 5, facade + 3, '#8b9daa');
        for (let j = 0; j < facade; j += 14) rect(ctx, bx - 4, front - j, 12, 4, '#a7b6bf');
        rect(ctx, bx - 4, front - facade - 7, 12, 3, '#e2e8ed');
      }
    }
    // Central pointed portal and snowed entrance pediment, with transparent arcade.
    const doorHalf = b.cathedral ? 33 : 17,
      doorHeight = b.cathedral ? 110 : 42;
    poly(
      ctx,
      [
        [mid - doorHalf - 5, front],
        [mid - doorHalf - 5, front - doorHeight * 0.66],
        [mid, front - doorHeight - 13],
        [mid + doorHalf + 5, front - doorHeight * 0.66],
        [mid + doorHalf + 5, front],
      ],
      '#a0aeb7',
    );
    poly(
      ctx,
      [
        [mid - doorHalf, front],
        [mid - doorHalf, front - doorHeight * 0.62],
        [mid, front - doorHeight - 6],
        [mid + doorHalf, front - doorHeight * 0.62],
        [mid + doorHalf, front],
      ],
      '#344a5c',
    );
    poly(
      ctx,
      [
        [mid - doorHalf + 4, front],
        [mid - doorHalf + 4, front - doorHeight * 0.6],
        [mid, front - doorHeight + 1],
        [mid + doorHalf - 4, front - doorHeight * 0.6],
        [mid + doorHalf - 4, front],
      ],
      '#142c3e',
    );
    line(
      ctx,
      mid - doorHalf - 8,
      front - doorHeight * 0.66,
      mid,
      front - doorHeight - 16,
      '#dce6ec',
      4,
    );
    line(
      ctx,
      mid,
      front - doorHeight - 16,
      mid + doorHalf + 8,
      front - doorHeight * 0.66,
      '#c5d5e4',
      4,
    );
    if (b.cathedral) {
      // Suspended clan standards, buttress shoulders and a second gallery make
      // the front read as monumental architecture, separate from its slate roof.
      for (const side of [-1, 1]) {
        const bx = mid + side * 71,
          by = front - facade + 35;
        rect(ctx, bx - 13, by - 6, 27, 3, '#b9a377');
        poly(
          ctx,
          [
            [bx - 11, by - 3],
            [bx + 11, by - 3],
            [bx + 11, by + 100],
            [bx, by + 111],
            [bx - 11, by + 100],
          ],
          '#294954',
        );
        line(ctx, bx - 10, by, bx - 10, by + 98, '#b89f70');
        line(ctx, bx + 10, by, bx + 10, by + 98, '#b89f70');
        line(ctx, bx - 10, by + 98, bx, by + 108, '#b89f70');
        line(ctx, bx, by + 108, bx + 10, by + 98, '#b89f70');
        line(ctx, bx, by + 25, bx, by + 76, '#d0b886', 2);
        for (let j = 0; j < 6; j++)
          for (const branch of [-1, 1])
            line(ctx, bx, by + 64 - j * 6, bx + branch * (7 - j * 0.5), by + 58 - j * 6, '#c5af83');
        rect(ctx, bx - 13, by - 8, 24, 2, '#d8e3ec');
      }
      for (const side of [-1, 1]) {
        const bx = side < 0 ? x - 14 : x + w + 5;
        poly(
          ctx,
          [
            [bx, front],
            [bx, front - 82],
            [bx + side * 7, front - 107],
            [bx + side * 9, front - 159],
            [bx + side * 15, front - 161],
            [bx + side * 15, front - 96],
            [bx + side * 8, front - 75],
            [bx + side * 8, front],
          ],
          '#667c8f',
        );
        line(ctx, bx, front - 82, bx + side * 7, front - 107, '#c0d1df', 3);
        rect(ctx, Math.min(bx, bx + side * 15), front - 162, 16, 3, '#d3e1ed');
      }
      const gableTop = front - facade - 67;
      poly(
        ctx,
        [
          [mid - 57, front - facade],
          [mid, gableTop],
          [mid + 57, front - facade],
        ],
        '#566e81',
      );
      line(ctx, mid - 59, front - facade, mid, gableTop - 3, '#c9d8e5', 4);
      line(ctx, mid, gableTop - 3, mid + 59, front - facade, '#aabed1', 4);
      this.window(ctx, mid, front - facade - 7, 24, 44, deriveSeed(worldSeed, b.id, 'rose'));
      for (const side of [-1, 1]) {
        const tx = side < 0 ? x - 2 : x + w - 22,
          top = front - facade - 83;
        rect(ctx, tx, top, 25, facade + 82, '#53697c');
        rect(ctx, tx + 2, top, 7, facade + 80, '#8c9cab');
        rect(ctx, tx + 21, top, 3, facade + 80, '#2b4559');
        for (let j = 0; j < facade + 80; j += 12) {
          rect(ctx, tx - 3, top + j, 30, 3, '#a5b5c4');
          rect(ctx, tx - 3, top + j - 1, 29, 1, '#d5e1e9');
        }
        poly(
          ctx,
          [
            [tx - 5, top],
            [tx + 12, top - 38],
            [tx + 30, top],
          ],
          '#344f67',
        );
        line(ctx, tx - 5, top, tx + 12, top - 38, '#d3e1ec', 3);
        line(ctx, tx + 12, top - 38, tx + 30, top, '#a9bed2', 2);
        rect(ctx, tx + 11, top - 49, 2, 12, '#a7aca0');
        rect(ctx, tx + 7, top - 45, 10, 2, '#a7aca0');
        this.window(ctx, tx + 13, top + 55, 11, 32, deriveSeed(worldSeed, b.id, side));
      }
    } else {
      const chimneyX = x + w * 0.76;
      rect(ctx, chimneyX, roofTop - 14, 19, 39, '#667785');
      for (let j = 0; j < 6; j++) rect(ctx, chimneyX + 1, roofTop - 12 + j * 6, 17, 1, '#9daeb8');
      rect(ctx, chimneyX - 3, roofTop - 15, 25, 4, '#d6e2eb');
      rect(ctx, chimneyX + 2, roofTop - 17, 14, 2, '#263f52');
    }
    // Snow breaks straight architectural edges and collects in cornices.
    for (let i = 0; i < cols * 4; i++) {
      const xx = x + rng() * w,
        yy = front - facade - 2;
      rect(ctx, xx, yy, 3 + rng() * 8, 2 + rng() * 3, '#d8e3ed');
      if (rng() > 0.6) rect(ctx, xx + 2, yy + 2, 1, 3 + rng() * 6, '#bbd0e1');
    }
    rect(ctx, x - 2, front - 3, w + 4, 3, '#b2c4d4');
    return { sprite: { image: canvas, x: 24, y: extra }, width, height };
  }

  private glow(x: number, y: number, radius: number, tint: string, alpha: number) {
    const ctx = this.ctx;
    let sprite = this.lightSprites.get(tint);
    if (!sprite) {
      sprite = document.createElement('canvas');
      sprite.width = sprite.height = 128;
      const light = sprite.getContext('2d')!,
        g = light.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, tint);
      g.addColorStop(0.35, tint + '8a');
      g.addColorStop(1, tint + '00');
      light.fillStyle = g;
      light.fillRect(0, 0, 128, 128);
      this.lightSprites.set(tint, sprite);
      while (this.lightSprites.size > 16)
        this.lightSprites.delete(this.lightSprites.keys().next().value!);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  private effect(effect: Effect) {
    const ctx = this.ctx,
      p = this.worldToScreen(effect),
      s = this.unit / 32,
      t = clamp(effect.age / effect.duration, 0, 1);
    ctx.save();
    ctx.translate(p.x, p.y - 10 * s);
    ctx.globalAlpha = 1 - t;
    if (effect.kind === 'slash') {
      const angle = effect.heading ?? 0;
      ctx.rotate(angle);
      poly(
        ctx,
        [
          [8 * s, -18 * s],
          [(20 + t * 12) * s, -15 * s],
          [(28 + t * 14) * s, 0],
          [20 * s, 20 * s],
          [26 * s, 0],
        ],
        effect.color,
      );
      line(ctx, 10 * s, -19 * s, 31 * s, -2 * s, '#f3ead0', Math.max(1, s));
    } else if (effect.kind === 'arrow') {
      ctx.rotate(effect.heading ?? 0);
      line(ctx, -14 * s, 0, 10 * s, 0, '#c9ae7b', 2 * s);
      poly(
        ctx,
        [
          [12 * s, 0],
          [6 * s, -3 * s],
          [6 * s, 3 * s],
        ],
        '#dbe7e8',
      );
    } else if (effect.kind === 'ward' || effect.kind === 'mind') {
      const r = (12 + t * 55) * s;
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.ellipse(0, 10 * s, r, r * 0.55, 0, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + t * 0.8;
        rect(ctx, Math.cos(a) * r, 10 * s + Math.sin(a) * r * 0.55, 2 * s, 3 * s, '#d8f0df');
      }
    } else {
      const rng = random(effect.id * 8191);
      for (let i = 0; i < 10; i++) {
        const angle = rng() * TAU,
          d = (6 + t * 20) * s,
          y = Math.sin(angle) * d * 0.5 - t * 20 * s;
        rect(ctx, Math.cos(angle) * d, y, (1 + rng() * 2) * s, 2 * s, effect.color);
      }
      if (effect.kind === 'heal') {
        rect(ctx, -s, -14 * t * s - 10 * s, 2 * s, 8 * s, '#cfeec2');
        rect(ctx, -4 * s, -14 * t * s - 7 * s, 8 * s, 2 * s, '#cfeec2');
      }
    }
    if (effect.text) {
      ctx.fillStyle = effect.color;
      ctx.font = `${11 * s}px Georgia,serif`;
      ctx.textAlign = 'center';
      ctx.fillText(effect.text, 0, -24 * s - t * 16 * s);
    }
    ctx.restore();
  }

  private pointer(game: Stichos, pointer: Point) {
    const world = this.screenToWorld(pointer),
      tile = game.world.tile(world.x, world.y),
      p = this.worldToScreen(tile),
      u = this.unit;
    if (Math.hypot(world.x - game.player.x, world.y - game.player.y) > 18) return;
    const blocked = game.world.blocked(tile.x, tile.y, game.removed);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = blocked ? '#c18b82' : '#e0d3a8';
    ctx.lineWidth = 1;
    const d = u * 0.29,
      k = u * 0.14;
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(p.x + sx * (d - k), p.y + sy * d);
        ctx.lineTo(p.x + sx * d, p.y + sy * d);
        ctx.lineTo(p.x + sx * d, p.y + sy * (d - k));
        ctx.stroke();
      }
    ctx.restore();
  }

  private atmosphere(game: Stichos, reduced: boolean) {
    const ctx = this.ctx;
    ctx.save();
    if (!this.atmosphereLayer) {
      const canvas = document.createElement('canvas');
      canvas.width = this.width;
      canvas.height = this.height;
      const layer = canvas.getContext('2d')!;
      layer.fillStyle = '#1837580b';
      layer.fillRect(0, 0, this.width, this.height);
      const vignette = layer.createRadialGradient(
        this.width * 0.5,
        this.height * 0.5,
        Math.min(this.width, this.height) * 0.16,
        this.width * 0.5,
        this.height * 0.5,
        Math.max(this.width, this.height) * 0.72,
      );
      vignette.addColorStop(0, '#0a203900');
      vignette.addColorStop(0.6, '#18314905');
      vignette.addColorStop(1, '#08203868');
      layer.fillStyle = vignette;
      layer.fillRect(0, 0, this.width, this.height);
      layer.globalAlpha = 0.04;
      for (let i = 0; i < 3; i++) {
        const x = this.width * (0.13 + i * 0.36),
          y = this.height * (0.25 + i * 0.26),
          r = this.width * 0.27;
        const fog = layer.createRadialGradient(x, y, 0, x, y, r);
        fog.addColorStop(0, '#c2dce5');
        fog.addColorStop(1, '#c2dce500');
        layer.fillStyle = fog;
        layer.fillRect(x - r, y - r / 3, r * 2, (r * 2) / 3);
      }
      this.atmosphereLayer = canvas;
    }
    ctx.drawImage(this.atmosphereLayer, 0, 0, this.width, this.height);
    const time = reduced ? 0 : game.time;
    const rng = random(deriveSeed(game.world.seed, 'snowfall'));
    for (let i = 0; i < Math.min(220, (this.width * this.height) / 5400); i++) {
      const depth = 0.45 + rng() * 0.85,
        speed = 8 + rng() * 13;
      const x =
        fract(
          rng() +
            (time * speed * 0.32) / this.width -
            (this.camera.x * this.unit * depth) / this.width,
        ) * this.width;
      const y =
        fract(
          rng() + (time * speed) / this.height - (this.camera.y * this.unit * depth) / this.height,
        ) * this.height;
      ctx.globalAlpha = 0.16 + depth * 0.35;
      rect(ctx, x, y, depth > 1 ? 2 : 1, depth > 1 ? 3 : 1, '#eff6fa');
    }
    ctx.restore();
  }

  private transfer(p: Point, progress: number) {
    const ctx = this.ctx,
      t = clamp(progress, 0, 1),
      alpha = Math.sin(t * Math.PI);
    ctx.save();
    ctx.globalAlpha = alpha * 0.65;
    ctx.fillStyle = '#112233';
    ctx.fillRect(0, 0, this.width, this.height);
    for (let i = 0; i < 7; i++) {
      const radius = (t * this.width * 0.8 + i * 58) % (this.width * 0.8);
      ctx.strokeStyle = i % 2 ? '#93d4d6' : '#d4bfa1';
      ctx.globalAlpha = alpha * 0.18;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 25, radius, radius * 0.72, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}
