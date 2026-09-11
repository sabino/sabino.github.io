import type { Peer } from './multiplayer-protocol';
import type { Stichos } from './session.ts';
import type { Effect, Npc, Point, Prop, Tile } from './types.ts';
import { random, deriveSeed } from '../procedural/random.ts';
import {
  StichosArt,
  color,
  drawHumanoid,
  humanoidDirection,
  line,
  makeCivilBuilding,
  poly,
  rect,
} from './art.ts';
import type { CivilBuildingKind, Sprite } from './art.ts';
import { drawHomeDecoration, homeDecorations } from './progression-art.ts';
import { effectActor } from './actor-motion.ts';
import type { HumanoidAction, HumanoidActionKind } from './actor-motion.ts';

interface Building {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  clan: number;
  cathedral: boolean;
  kind?: CivilBuildingKind | 'church';
}
interface Roof {
  sprite: Sprite;
  width: number;
  height: number;
}
const TAU = Math.PI * 2;
const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x));
const fract = (x: number) => x - Math.floor(x);
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
  private chunkSiteWalls = new Map<string, Tile[]>();
  private siteWalls = new Map<string, Sprite>();
  private siteTopology = new Map<string, [number, number]>();
  private playerSite: string | undefined;
  private lightSprites = new Map<string, HTMLCanvasElement>();
  private atmosphereLayer: HTMLCanvasElement | null = null;
  private contactTexture: HTMLCanvasElement | null = null;
  private grounds = new Map<string, HTMLCanvasElement>();
  private worldSeed = -1;
  private worldGeneration = -1;
  private lastTime = -1;
  private npcPrevious = new Map<string, Point>();
  private npcWalking = new Map<string, boolean>();
  private footsteps: { x: number; y: number; age: number; side: number; heading: number }[] = [];
  private previousPlayer: Point | null = null;
  private footDistance = 0;
  private effectActors = new Map<number, { id: string; kind: HumanoidActionKind }>();
  private actorActions = new Map<string, HumanoidAction>();
  private reducedMotion = false;
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
    // pointer is an optional destination in world tile coordinates, like player/NPC positions.
    options: {
      reducedMotion?: boolean;
      transfer?: number;
      pointer?: Point | null;
      peers?: readonly Peer[];
      playerAppearance?: Stichos['player']['appearance'];
      emotes?: ReadonlyMap<string, { text: string; until: number }>;
    } = {},
  ) {
    const ctx = this.ctx,
      unit = this.unit,
      scale = unit / 32;
    const dt = this.lastTime < 0 ? 0 : clamp(game.time - this.lastTime, 0, 0.05);
    if (this.lastTime > game.time) this.effectActors.clear();
    this.reducedMotion = !!options.reducedMotion;
    this.lastTime = game.time;
    if (this.worldSeed !== game.world.seed || this.worldGeneration !== game.world.generation) {
      this.worldSeed = game.world.seed;
      this.worldGeneration = game.world.generation;
      this.camera = { x: game.player.x, y: game.player.y };
      this.roofs.clear();
      this.buildingBounds.clear();
      this.chunkBuildings.clear();
      this.chunkSiteWalls.clear();
      this.siteWalls.clear();
      this.siteTopology.clear();
      this.art = new StichosArt();
      this.grounds.clear();
      this.footsteps = [];
      this.previousPlayer = null;
      this.npcPrevious.clear();
      this.npcWalking.clear();
      this.effectActors.clear();
    }
    this.actorActions.clear();
    const motionActors = [
      { id: '$player', x: game.player.x, y: game.player.y, player: true },
      ...game.npcs
        .filter((n) => n.id !== game.occupiedNpcId)
        .map((n) => ({ id: n.id, x: n.x, y: n.y, player: false })),
    ];
    const activeEffects = new Set(game.effects.map((effect) => effect.id));
    for (const id of this.effectActors.keys())
      if (!activeEffects.has(id)) this.effectActors.delete(id);
    for (const effect of game.effects) {
      let owner = this.effectActors.get(effect.id);
      if (!owner) {
        const assigned = effectActor(effect, motionActors);
        if (assigned) {
          this.effectActors.set(effect.id, assigned);
          owner = assigned;
        }
      }
      if (!owner || effect.age >= effect.duration) continue;
      const prior = this.actorActions.get(owner.id);
      if (prior?.kind === 'hurt' && owner.kind !== 'hurt') continue;
      this.actorActions.set(owner.id, {
        kind: owner.kind,
        progress: effect.age / Math.max(0.01, effect.duration),
        reduced: this.reducedMotion,
        tool: effect.tool,
      });
    }
    const follow = options.reducedMotion
      ? 1
      : this.previousPlayer === null
        ? 1
        : 1 - Math.exp(-Math.max(dt, 0.016) * 12);
    this.playerSite = game.world.tile(game.player.x, game.player.y).site;
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
    const buildings = new Map<string, Building>(),
      siteWalls: Tile[] = [];
    this.drawGround(game);
    for (let cy = Math.floor(top / 16); cy <= Math.floor(bottom / 16); cy++)
      for (let cx = Math.floor(left / 16); cx <= Math.floor(right / 16); cx++) {
        const chunkKey = `${cx},${cy}`;
        const cached = this.chunkBuildings.get(chunkKey);
        if (cached) {
          for (const building of cached) buildings.set(building.id, building);
          siteWalls.push(...(this.chunkSiteWalls.get(chunkKey) ?? []));
          continue;
        }
        const inChunk = new Map<string, Building>(),
          walls: Tile[] = [];
        for (const tile of game.world.chunk(cx, cy).tiles) {
          const { x, y } = tile;
          if (tile.site && tile.terrain === 'wall' && !tile.building) walls.push(tile);
          if (tile.building && !buildings.has(tile.building)) {
            let b = this.buildingBounds.get(tile.building);
            if (!b) {
              // Resolve the full generated rectangle even when only its edge is visible.
              // This keeps roof geometry stable while scrolling into a settlement.
              const kind = tile.buildingKind;
              b = {
                id: tile.building,
                minX: x,
                maxX: x,
                minY: y,
                maxY: y,
                clan: tile.clan ?? 0,
                // Legacy geography had a cathedral under every :hall ID. Gen3
                // explicitly distinguishes a city church from a small civic hall.
                cathedral:
                  kind === 'church' ||
                  (game.world.generation < 3 && tile.building.endsWith(':hall')),
                kind: kind ?? (game.world.generation >= 3 ? 'house' : undefined),
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
        this.chunkSiteWalls.set(chunkKey, walls);
        siteWalls.push(...walls);
        while (this.chunkBuildings.size > 128) {
          const old = this.chunkBuildings.keys().next().value!;
          this.chunkBuildings.delete(old);
          this.chunkSiteWalls.delete(old);
        }
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
      if (prop.kind === 'rock') this.shadow(p, 18 * scale, 7 * scale, 0.12);
      if (prop.kind === 'workbench') {
        this.shadow({ x: p.x + 4 * scale, y: p.y }, 23 * scale, 7 * scale, 0.23);
        this.glow(p.x + 14 * scale, p.y + 3 * scale, 48 * scale, '#ecc080', 0.16);
      }
    }
    const drawables: { depth: number; draw: () => void }[] = [];
    for (const b of buildings.values())
      drawables.push({ depth: b.maxY + 0.38, draw: () => this.building(game, b) });
    for (const tile of siteWalls) {
      const p = this.worldToScreen(tile);
      if (p.x < -unit || p.x > this.width + unit || p.y < -unit || p.y > this.height + unit * 2)
        continue;
      drawables.push({ depth: tile.y + 0.42, draw: () => this.siteWall(game, tile) });
    }
    for (const prop of props)
      drawables.push({
        depth: prop.y + (prop.kind === 'door' ? 0.45 : 0),
        draw: () => this.prop(game, prop),
      });
    for (const home of game.progression.homes) {
      if (Math.hypot(home.x - this.camera.x, home.y - this.camera.y) > radius + 16) continue;
      for (const decoration of homeDecorations(home, game.time, game.world)) {
        const p = this.worldToScreen(decoration);
        if (
          p.x < -unit * 2 ||
          p.x > this.width + unit * 2 ||
          p.y < -unit ||
          p.y > this.height + unit * 3
        )
          continue;
        drawables.push({
          depth: decoration.y,
          draw: () =>
            drawHomeDecoration(
              ctx,
              decoration,
              p.x,
              p.y,
              scale,
              game.time,
              !!options.reducedMotion,
            ),
        });
      }
    }
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
    drawables.push({
      depth: game.player.y,
      draw: () =>
        this.person(
          game,
          options.playerAppearance
            ? { ...game.player, appearance: options.playerAppearance }
            : game.player,
          true,
        ),
    });
    for (const peer of options.peers ?? []) {
      if (Math.hypot(peer.x - game.player.x, peer.y - game.player.y) > radius) continue;
      drawables.push({
        depth: peer.y,
        draw: () => this.remotePerson(peer, options.emotes?.get(peer.id)),
      });
    }
    drawables.sort((a, b) => a.depth - b.depth).forEach((item) => item.draw());
    for (const prop of props) {
      const p = this.worldToScreen(prop);
      if (prop.kind === 'lamp') this.glow(p.x, p.y - 51 * scale, 18 * scale, '#ffcf8b', 0.25);
      if (prop.kind === 'workbench')
        this.glow(p.x + 14 * scale, p.y - 26 * scale, 19 * scale, '#f1c783', 0.22);
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
    const s = u / 32,
      rng = random(deriveSeed(tile.seed, 'cultivation'));
    rect(ctx, p.x - u / 2, p.y - u / 2, u, u, '#344f57');
    for (let i = -10; i <= 10; i += 7) {
      line(
        ctx,
        p.x - u * 0.4,
        p.y + i * s,
        p.x + u * 0.4,
        p.y + i * s,
        '#213a45',
        Math.max(1, s * 2),
      );
      line(
        ctx,
        p.x - u * 0.4,
        p.y + (i - 2) * s,
        p.x + u * 0.4,
        p.y + (i - 2) * s,
        '#556a68',
        Math.max(1, s),
      );
    }
    for (let clod = 0; clod < 23; clod++) {
      const x = p.x + (rng() - 0.5) * u * 0.88,
        y = p.y + (rng() - 0.5) * u * 0.87;
      rect(ctx, x, y, (1 + rng() * 2) * s, s, rng() > 0.5 ? '#647a72' : '#2a424b');
      if (rng() > 0.84) {
        line(ctx, x, y, x - 2 * s, y - 3 * s, '#75a48b');
        line(ctx, x, y, x + 3 * s, y - 4 * s, '#92b398');
      }
    }
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ])
      if (game.world.tile(tile.x + dx, tile.y + dy).terrain !== 'grass') {
        const x = p.x + (dx * u) / 2,
          y = p.y + (dy * u) / 2;
        if (dy === 1) rect(ctx, p.x - u / 2 + 3 * s, y + 4 * s, u, 4 * s, '#17395060');
        if (dx === 1) rect(ctx, x + 4 * s, p.y - u / 2 + 3 * s, 3 * s, u, '#18385155');
        rect(
          ctx,
          dx ? x - 2 * s : p.x - u / 2,
          dy ? y - 4 * s : p.y - u / 2,
          dx ? 6 * s : u,
          dy ? 9 * s : u,
          '#344b60',
        );
        rect(
          ctx,
          dx ? x - s : p.x - u / 2,
          dy ? y - 5 * s : p.y - u / 2,
          dx ? 4 * s : u,
          dy ? 3 * s : u,
          '#94adc5',
        );
        for (let stone = 0; stone < 4; stone++) {
          const offset = (-16 + stone * 8) * s;
          if (dy) {
            rect(ctx, p.x + offset, y - 2 * s, 7 * s, 4 * s, stone % 2 ? '#566f83' : '#627b8d');
            rect(ctx, p.x + offset, y - 4 * s, (5 + rng() * 2) * s, 2 * s, '#d0deea');
          } else {
            rect(ctx, x - 2 * s, p.y + offset, 4 * s, 7 * s, '#637c8d');
            rect(ctx, x - 3 * s, p.y + offset, 2 * s, 6 * s, '#c8d8e5');
          }
        }
      }
  }

  private siteWall(game: Stichos, tile: Tile) {
    const address = `${tile.x},${tile.y}`;
    let topology = this.siteTopology.get(address);
    if (!topology) {
      let floor = 0,
        edge = 0;
      const offsets = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ];
      for (let i = 0; i < offsets.length; i++) {
        const n = game.world.tile(tile.x + offsets[i][0], tile.y + offsets[i][1]);
        if (n.terrain === 'floor' && n.site === tile.site) floor |= 1 << i;
        if (n.terrain !== 'wall' || n.site !== tile.site) edge |= 1 << i;
      }
      topology = [floor, edge];
      this.siteTopology.set(address, topology);
      while (this.siteTopology.size > 4096)
        this.siteTopology.delete(this.siteTopology.keys().next().value!);
    }
    const [floor, edge] = topology;
    const cutaway =
      this.playerSite === tile.site &&
      tile.y > game.player.y &&
      tile.y - game.player.y < 2.5 &&
      Math.abs(tile.x - game.player.x) < 1.45;
    const variant = tile.seed % 8,
      key = `${floor}:${edge}:${variant}:${cutaway}`;
    let sprite = this.siteWalls.get(key);
    if (!sprite) {
      const canvas = document.createElement('canvas');
      canvas.width = 40;
      canvas.height = 84;
      const ctx = canvas.getContext('2d')!,
        rng = random(deriveSeed(variant, floor, edge, 'exposed-vault'));
      const height = cutaway ? 10 : 31,
        top = 48 - height,
        front = 80 - height;
      // Warm-weather erosion is absent here: frost splits broad blue stone faces.
      if (edge & 4) {
        rect(ctx, 4, front, 32, height, '#213b53');
        for (let row = 0; row < height / 8; row++)
          for (let col = 0; col < 3; col++) {
            const x = 4 + col * 11 + (row % 2 ? 4 : 0),
              y = front + row * 8;
            if (x >= 36) continue;
            rect(
              ctx,
              x + 1,
              y + 1,
              Math.min(9, 35 - x),
              Math.min(7, 80 - y),
              row % 2 ? '#3e5a73' : '#47637b',
            );
            rect(ctx, x + 1, y + 1, Math.min(8, 35 - x), 1, '#627e95');
            if (rng() > 0.6) rect(ctx, x + 2, y + 4, 3, 1, '#2a455f');
          }
        rect(ctx, 4, 79, 32, 2, '#162e46');
      }
      rect(ctx, 4, top, 32, 32, '#536f89');
      for (let i = 0; i < 25; i++) {
        const x = 5 + rng() * 28,
          y = top + 1 + rng() * 28;
        rect(ctx, x, y, 2 + rng() * 5, 1 + rng() * 3, rng() > 0.45 ? '#6e88a0' : '#3f5c78');
      }
      for (let crack = 0; crack < 2; crack++) {
        const x = 9 + rng() * 20,
          y = top + 3 + rng() * 10;
        line(ctx, x, y, x - 3, y + 8, '#324d69');
        line(ctx, x - 3, y + 8, x + 2, y + 13, '#3e5974');
      }
      if (edge & 1) {
        rect(ctx, 4, top, 32, 2, '#bacde0');
        rect(ctx, 4, top + 2, 32, 1, '#819db8');
      }
      if (edge & 2) {
        rect(ctx, 32, top, 4, 32, '#344f6b');
        rect(ctx, 35, top, 1, 32, '#a4bfd4');
      }
      if (edge & 8) {
        rect(ctx, 4, top, 3, 32, '#9ab3cb');
        rect(ctx, 7, top, 1, 32, '#6f8da7');
      }
      if (edge & 4) {
        rect(ctx, 4, front - 3, 32, 3, '#b5cbe0');
        for (let i = 0; i < 6; i++)
          rect(ctx, 4 + i * 5, front - 5 + rng() * 2, 4 + rng() * 2, 3, '#d2e1ed');
        if (floor & 4 && variant % 3 === 0 && !cutaway) {
          line(ctx, 20, front + 6, 20, front + 19, '#89b7b1');
          line(ctx, 20, front + 11, 15, front + 7, '#799fad');
          line(ctx, 20, front + 15, 25, front + 10, '#7aa6ae');
        }
      }
      if (variant % 3 === 0) {
        poly(
          ctx,
          [
            [7, top + 5],
            [18, top + 2],
            [31, top + 8],
            [27, top + 12],
            [13, top + 10],
          ],
          '#b6cce2',
        );
        rect(ctx, 10, top + 4, 8, 2, '#d6e3ee');
      }
      sprite = { image: canvas, x: 20, y: 64 };
      this.siteWalls.set(key, sprite);
      while (this.siteWalls.size > 256) this.siteWalls.delete(this.siteWalls.keys().next().value!);
    }
    const p = this.worldToScreen(tile),
      s = this.unit / 32;
    this.ctx.globalAlpha = cutaway ? 0.58 : 1;
    this.ctx.drawImage(
      sprite.image,
      Math.round(p.x - sprite.x * s),
      Math.round(p.y - sprite.y * s),
      Math.round(sprite.image.width * s),
      Math.round(sprite.image.height * s),
    );
    this.ctx.globalAlpha = 1;
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
    const building = prop.building ? this.buildingBounds.get(prop.building) : undefined;
    const monumentalDoor =
      building?.cathedral ?? (game.world.generation < 3 && !!prop.building?.endsWith(':hall'));
    const p = this.worldToScreen(prop),
      s = (this.unit / 32) * (prop.kind === 'door' && monumentalDoor ? 2.2 : 1);
    if (prop.kind === 'door') p.y += this.unit * 0.5;
    if (p.x < -96 * s || p.x > this.width + 96 * s || p.y < -32 * s || p.y > this.height + 160 * s)
      return;
    const sprite = this.art.prop(
      prop.kind,
      prop.seed,
      game.opened.has(prop.id),
      game.world.clans[prop.clan ?? 0]?.color ?? '#68837c',
      prop.kind === 'door' ? building?.kind : undefined,
      game.world.generation >= 3 && /:ore:\d+$/.test(prop.id),
    );
    // These planted resource trees are visibly pruned, with the same trunk footprint.
    const verticalScale = s * (prop.kind === 'pine' && /:timber:\d+$/.test(prop.id) ? 0.65 : 1);
    const x = p.x - sprite.x * s,
      y = p.y - sprite.y * verticalScale;
    if (
      x > this.width + 30 ||
      x + sprite.image.width * s < -30 ||
      y > this.height + 30 ||
      y + sprite.image.height * verticalScale < -30
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
      Math.round(sprite.image.height * verticalScale),
    );
    if (prop.kind === 'workbench') {
      rect(this.ctx, p.x + 11 * s, p.y - 29 * s, 6 * s, 9 * s, '#8d7956');
      rect(this.ctx, p.x + 12 * s, p.y - 28 * s, 4 * s, 6 * s, '#f2cd8b');
      rect(this.ctx, p.x + 10 * s, p.y - 30 * s, 8 * s, 2 * s, '#384954');
      rect(this.ctx, p.x + 11 * s, p.y - 21 * s, 6 * s, s, '#b89b67');
    }
    this.ctx.restore();
  }

  private shadow(p: Point, width: number, height: number, alpha: number) {
    const ctx = this.ctx;
    if (!this.contactTexture) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const shade = canvas.getContext('2d')!;
      shade.scale(1, 0.5);
      const gradient = shade.createRadialGradient(28, 29, 2, 32, 32, 31);
      gradient.addColorStop(0, '#102a49');
      gradient.addColorStop(0.35, '#173750dd');
      gradient.addColorStop(0.75, '#24455c54');
      gradient.addColorStop(1, '#24455c00');
      shade.fillStyle = gradient;
      shade.fillRect(0, 0, 64, 64);
      this.contactTexture = canvas;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.contactTexture, p.x - width + 4, p.y - height + 2, width * 2, height * 2);
    ctx.restore();
  }
  private remotePrevious = new Map<string, Point & { last: number }>();
  private remotePerson(peer: Peer, emote?: { text: string; until: number }) {
    const time = performance.now();
    let shown = this.remotePrevious.get(peer.id);
    if (!shown || Math.hypot(shown.x - peer.x, shown.y - peer.y) > 8)
      shown = { ...peer, last: time };
    const elapsed = Math.min(0.1, Math.max(0, (time - shown.last) / 1000));
    const walking = Math.hypot(shown.x - peer.x, shown.y - peer.y) > 0.02;
    const blend = 1 - Math.exp(-elapsed * 18);
    shown.x += (peer.x - shown.x) * blend;
    shown.y += (peer.y - shown.y) * blend;
    shown.last = time;
    this.remotePrevious.set(peer.id, shown);
    if (this.remotePrevious.size > 24)
      this.remotePrevious.delete(this.remotePrevious.keys().next().value!);
    const p = this.worldToScreen(shown),
      scale = (this.unit / 32) * 1.35,
      ctx = this.ctx;
    this.shadow(p, 7 * scale, 3 * scale, 0.38);
    ctx.strokeStyle = '#84c9c7';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 10 * scale, 5 * scale, 0, 0, TAU);
    ctx.stroke();
    const facing = humanoidDirection(peer.heading);
    drawHumanoid(
      ctx,
      peer.appearance,
      p.x,
      p.y,
      scale,
      facing.face,
      peer.phase,
      walking,
      0,
      false,
      facing.weaponBehindBody,
    );
    const label = emote && emote.until > time ? `${peer.name} · ${emote.text}` : peer.name;
    ctx.font = '11px Georgia,serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const y = p.y - 48 * scale * peer.appearance.height;
    const width = ctx.measureText(label).width + 12;
    ctx.fillStyle = '#102e39e8';
    ctx.fillRect(p.x - width / 2, y - 14, width, 17);
    ctx.fillStyle = '#abe2dc';
    ctx.fillText(label, p.x, y);
  }
  private person(game: Stichos, person: Npc | Stichos['player'], player: boolean) {
    const p = this.worldToScreen(person),
      s = (this.unit / 32) * 1.35,
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
    this.shadow(p, 7 * s, 3 * s, 0.38);
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
    const action = this.actorActions.get(player ? '$player' : (person as Npc).id) ?? null;
    const attack = action ? 0 : cooldown > 0.25 ? clamp((cooldown - 0.25) / 0.4, 0, 1) : 0;
    const facing = humanoidDirection(person.heading);
    const appearance = player
      ? person.appearance
      : game.appearanceForBody(person.appearance, (person as Npc).id);
    drawHumanoid(
      ctx,
      appearance,
      p.x,
      p.y,
      s,
      facing.face,
      person.phase,
      walking,
      attack,
      player,
      facing.weaponBehindBody,
      action,
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
    const breath = this.reducedMotion
      ? 0.5
      : fract(game.time * 0.36 + (person.appearance.seed % 13));
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
    const key = `${game.world.seed}:${game.world.generation}:${b.id}:${b.kind ?? 'legacy'}:${cols}:${rows}`;
    let roof = this.roofs.get(key);
    if (!roof) {
      roof = this.makeRoof(b, game.world.seed);
      this.roofs.set(key, roof);
      while (this.roofs.size > 28) this.roofs.delete(this.roofs.keys().next().value!);
    }
    // Foundations and steps use the same ground footprint as collision geometry.
    for (let step = b.cathedral ? -1 : 2; step >= 0; step--) {
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
          this.glow(center + side * 60 * s, right.y - 52 * s, 29 * s, '#f0b765', 0.29);
          this.glow(center + side * 49 * s, right.y + 20 * s, 63 * s, '#eeb970', 0.19);
        }
        this.glow(center, right.y + 23 * s, 87 * s, '#edc58d', 0.13);
      } else if (b.kind && b.kind !== 'greenhouse' && b.kind !== 'storehouse') {
        const center = (left.x + right.x) / 2;
        this.glow(center - 27 * s, right.y - 37 * s, 19 * s, '#edc38a', 0.17);
        this.glow(
          center - 27 * s,
          right.y + 5 * s,
          37 * s,
          '#e9bc7e',
          b.kind === 'inn' ? 0.16 : 0.1,
        );
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
      top = bottom - height;
    const arch = (grow: number) => {
      const half = width / 2 + grow,
        peak = top - grow,
        rise = Math.min(height * 0.35, width * 0.86 + grow);
      const pts: number[][] = [
        [cx - half, bottom + grow],
        [cx - half, peak + rise],
      ];
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        pts.push([cx - half + half * t * t, peak + rise * (1 - 1.5 * t + 0.5 * t * t)]);
      }
      for (let i = 7; i >= 0; i--) {
        const t = i / 8;
        pts.push([cx + half - half * t * t, peak + rise * (1 - 1.5 * t + 0.5 * t * t)]);
      }
      pts.push([cx + half, bottom + grow]);
      return pts;
    };
    const outer = arch(7),
      inner = arch(3),
      glass = arch(0);
    poly(ctx, arch(9), '#172e43');
    poly(ctx, outer, '#70869c');
    poly(ctx, inner, '#29445b');
    // Individual wedged arch stones follow the curve; no giant triangular window cap.
    for (let i = 1; i < outer.length - 2; i++) {
      poly(
        ctx,
        [outer[i], outer[i + 1], inner[i + 1], inner[i]],
        ['#8095a8', '#657f96', '#91a4b4'][i % 3],
      );
      line(ctx, outer[i][0], outer[i][1], inner[i][0], inner[i][1], '#304b64');
    }
    for (const side of [-1, 1])
      for (let yy = bottom - 8; yy > top + width; yy -= 15) {
        rect(ctx, cx + side * (width / 2 + 5) - 2, yy, 4, 12, side < 0 ? '#6c879d' : '#415e79');
        rect(ctx, cx + side * (width / 2 + 5) - 3, yy, 6, 1, '#879faf');
      }
    ctx.save();
    ctx.beginPath();
    glass.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.clip();
    const light = ctx.createLinearGradient(0, top, 0, bottom);
    light.addColorStop(0, '#d8a35e');
    light.addColorStop(0.36, '#f4cc7a');
    light.addColorStop(1, '#9f6c47');
    ctx.fillStyle = light;
    ctx.fillRect(cx - width / 2, top, width, height);
    for (let i = 0; i < (height * width) / 32; i++)
      rect(
        ctx,
        cx - width / 2 + rng() * width,
        top + rng() * height,
        1 + rng() * 2,
        1,
        rng() > 0.5 ? '#f9dda075' : '#7c5f454a',
      );
    // Two living stems replace checkerboard glass: leaf-shaped panes and thin lead veins.
    for (const column of [-1, 1]) {
      const stem = cx + column * width * 0.22;
      line(ctx, stem, bottom - 2, stem, top + width * 0.6, '#694f38');
      for (let yy = bottom - 7; yy > top + width * 0.6; yy -= Math.max(11, width * 0.44))
        for (const side of [-1, 1]) {
          const leaf = width * 0.18,
            peak = yy - width * 0.33;
          const leafPoints = [
            [stem, yy],
            [stem + side * leaf, yy - width * 0.19],
            [stem + side * leaf * 0.77, peak],
            [stem + side * leaf * 0.18, peak + 1],
          ];
          poly(
            ctx,
            leafPoints,
            Math.floor(yy) % 3 === 0 ? '#ffe4a6' : column === side ? '#d8955f' : '#e6bd70',
          );
          for (let j = 0; j < leafPoints.length; j++) {
            const a = leafPoints[j],
              b = leafPoints[(j + 1) % leafPoints.length];
            line(ctx, a[0], a[1], b[0], b[1], '#77553c');
          }
          line(ctx, stem, yy, stem + side * leaf * 0.77, peak, '#fff0b477');
        }
    }
    line(ctx, cx, bottom, cx, top + width * 0.7, '#31475a', Math.max(1, width / 19));
    for (let yy = bottom - 25; yy > top + width; yy -= 41)
      line(ctx, cx - width / 2, yy, cx + width / 2, yy, '#8b7952');
    const budY = top + width * 0.42;
    for (const side of [-1, 1])
      poly(
        ctx,
        [
          [cx, budY + width * 0.2],
          [cx + side * width * 0.22, budY],
          [cx + side * width * 0.06, budY - width * 0.17],
        ],
        '#ffe5a6',
      );
    // Stepped cool bands set the glass behind its stone reveal without flattening its gold center.
    const reveal = Math.max(1, width * 0.045),
      shades = ['#112c48b3', '#112c4870', '#112c483b', '#112c4818'];
    for (let band = 0; band < shades.length; band++) {
      rect(ctx, cx - width / 2 + band * reveal, top, reveal, height, shades[band]);
      rect(ctx, cx + width / 2 - (band + 1) * reveal, top, reveal, height, shades[band]);
      rect(ctx, cx - width / 2, top + band * width * 0.16, width, width * 0.16, shades[band]);
    }
    ctx.restore();
    for (let i = 1; i < glass.length; i++)
      line(ctx, glass[i - 1][0], glass[i - 1][1], glass[i][0], glass[i][1], '#8a947b');
    rect(ctx, cx - width * 0.69, bottom + 3, width * 1.38, 5, '#3e5a74');
    rect(ctx, cx - width * 0.7, bottom + 2, width * 1.4, 2, '#bacfe0');
    for (let i = 0; i < width / 4; i++)
      rect(
        ctx,
        cx - width * 0.6 + rng() * width * 1.2,
        bottom + rng() * 2,
        2 + rng() * 4,
        2,
        '#d8e6ef',
      );
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const warmth = ctx.createRadialGradient(
      cx,
      bottom - height * 0.42,
      width * 0.1,
      cx,
      bottom - height * 0.42,
      height * 0.48,
    );
    warmth.addColorStop(0, '#efb86325');
    warmth.addColorStop(1, '#efb86300');
    ctx.fillStyle = warmth;
    ctx.fillRect(cx - height * 0.48, bottom - height * 0.9, height * 0.96, height * 0.96);
    ctx.restore();
  }

  private makeCathedral(b: Building, worldSeed: number): Roof {
    const w = (b.maxX - b.minX + 1) * 32,
      h = (b.maxY - b.minY + 1) * 32;
    const canvas = document.createElement('canvas');
    canvas.width = w + 112;
    canvas.height = h + 378;
    const ctx = canvas.getContext('2d')!,
      rng = random(deriveSeed(worldSeed, b.id, 'cathedral'));
    const x = 56,
      top = 320,
      front = top + h,
      mid = x + w / 2;
    const naveWidth = Math.min(288, w * 0.54),
      naveX = mid - naveWidth / 2;
    const wall = (left: number, foot: number, width: number, height: number) => {
      rect(ctx, left, foot - height, width, height, '#1b334b');
      for (let row = 0; row < height / 9; row++)
        for (let col = -1; col < width / 17; col++) {
          const bx = left + col * 17 + (row % 2) * 8,
            by = foot - height + row * 9;
          const clippedX = Math.max(left, bx + 1),
            end = Math.min(left + width, bx + 16);
          if (end <= clippedX) continue;
          const c = ['#344e67', '#3c576e', '#2e4862', '#405b73', '#36526b'][Math.floor(rng() * 5)];
          rect(ctx, clippedX, by + 1, end - clippedX, 8, c);
          if (rng() > 0.32)
            rect(ctx, clippedX + 1, by + 1, Math.max(1, end - clippedX - 3), 1, color(c, 9));
          if (rng() > 0.8) rect(ctx, clippedX + 2, by + 5, 3, 1, color(c, -9));
          if (rng() > 0.45) {
            const xx = clippedX + rng() * Math.max(1, end - clippedX - 4);
            rect(ctx, xx, by + 3, 2 + rng() * 4, 2, color(c, rng() > 0.5 ? 5 : -8));
            rect(ctx, xx + 1, by + 5, 2, 1, color(c, -6));
          }
          if (rng() > 0.98) {
            line(ctx, clippedX + 6, by + 1, clippedX + 8, by + 3, '#172f48');
            line(ctx, clippedX + 8, by + 3, clippedX + 6, by + 7, '#1d3851');
          }
        }
      for (let patch = 0; patch < width / 10; patch++) {
        const px = left + rng() * width,
          py = foot - rng() * height;
        for (let chip = 0; chip < 6; chip++)
          rect(
            ctx,
            Math.min(left + width - 2, px + rng() * 5),
            py + rng() * 9,
            1 + rng() * 2,
            1,
            rng() > 0.5 ? '#71838e55' : '#1a354a55',
          );
      }
      rect(ctx, left, foot - 9, width, 9, '#283f58');
      rect(ctx, left - 2, foot - height - 3, width + 4, 5, '#adc2d7');
      for (let i = 0; i < width / 9; i++) {
        const bx = left + rng() * width;
        rect(ctx, bx, foot - height - 5, 3 + rng() * 8, 3, '#d4e0ed');
        if (rng() > 0.6) rect(ctx, bx + 2, foot - height - 1, 1, 3 + rng() * 6, '#adc8df');
      }
    };
    const buttress = (bx: number, height: number, width = 16) => {
      // Upper-left cold light: masonry throws a quiet shadow to its right and underfoot.
      poly(
        ctx,
        [
          [bx + width / 2, front - height + 2],
          [bx + width / 2 + 9, front - height + 13],
          [bx + width / 2 + 16, front],
          [bx + width / 2, front],
        ],
        '#0d29436b',
      );
      poly(
        ctx,
        [
          [bx - width / 2, front - 1],
          [bx + width / 2 + 8, front + 1],
          [bx + width / 2 + 17, front + 8],
          [bx - width / 2 + 7, front + 6],
        ],
        '#16395165',
      );
      rect(ctx, bx - width / 2 - 4, front - height, width + 8, height, '#1e3549');
      rect(ctx, bx - width / 2, front - height, width, height, '#566e84');
      rect(ctx, bx + 2, front - height, width / 2 - 2, height, '#2c465f');
      for (let i = 0; i < height / 10; i++) {
        const yy = front - height + i * 10;
        rect(ctx, bx - width / 2 + 1, yy, Math.max(1, width / 2 - 2), 1, '#728b9d');
        if (rng() > 0.7) rect(ctx, bx - width / 2 + 2, yy + 2, 3, 4, '#3e5870');
      }
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
    // Attached chapels rise in steps toward the nave. Each has its own roof depth,
    // stone gable, lancet glass, rain-shadow and snow-loaded connecting buttress.
    wall(x, front, w, 142);
    for (const side of [-1, 1]) {
      const wingLeft = side < 0 ? x : naveX + naveWidth,
        wingRight = side < 0 ? naveX : x + w;
      const count = Math.max(1, Math.floor((wingRight - wingLeft) / 70)),
        bay = (wingRight - wingLeft) / count;
      for (let chapel = 0; chapel < count; chapel++) {
        const left = wingLeft + chapel * bay,
          right = left + bay,
          middle = (left + right) / 2;
        const towardNave = side < 0 ? chapel : count - chapel - 1,
          height = 145 + towardNave * 18;
        const roofFront = front - height,
          roofBack = top - 24;
        poly(
          ctx,
          [
            [left - 5, roofBack + 8],
            [middle, roofBack - 12],
            [right + 5, roofBack + 8],
            [right + 5, roofFront],
            [middle, roofFront - 29],
            [left - 5, roofFront],
          ],
          '#1e3952',
        );
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(left - 5, roofBack + 8);
        ctx.lineTo(middle, roofBack - 12);
        ctx.lineTo(right + 5, roofBack + 8);
        ctx.lineTo(right + 5, roofFront);
        ctx.lineTo(middle, roofFront - 29);
        ctx.lineTo(left - 5, roofFront);
        ctx.closePath();
        ctx.clip();
        for (let yy = roofBack - 12; yy < roofFront; yy += 7)
          for (let xx = left - 7; xx < right + 7; xx += 9) {
            poly(
              ctx,
              [
                [xx, yy],
                [xx + 8, yy],
                [xx + 8, yy + 4],
                [xx + 4, yy + 7],
                [xx, yy + 4],
              ],
              rng() > 0.5 ? '#2a485f' : '#304f66',
            );
            line(ctx, xx + 1, yy, xx + 7, yy, '#456278');
          }
        poly(
          ctx,
          [
            [middle, roofBack - 12],
            [right + 5, roofBack + 8],
            [right + 5, roofFront],
            [middle, roofFront - 29],
          ],
          '#102c432a',
        );
        for (let load = 0; load < 5; load++) {
          const xx = left + rng() * bay,
            yy = roofBack + rng() * (roofFront - roofBack),
            span = 13 + rng() * 25;
          poly(
            ctx,
            [
              [xx - 3, yy + 3],
              [xx + 5, yy - 1],
              [xx + span * 0.7, yy + 1],
              [xx + span, yy - 2],
              [xx + span + 3, yy + 5],
              [xx + 6, yy + 8],
            ],
            '#93afcb',
          );
          poly(
            ctx,
            [
              [xx - 2, yy + 1],
              [xx + 6, yy - 3],
              [xx + span * 0.7, yy - 1],
              [xx + span, yy - 3],
              [xx + span, yy + 2],
              [xx + 6, yy + 5],
            ],
            '#ccdeed',
          );
        }
        ctx.restore();
        wall(left, front, bay, height);
        poly(
          ctx,
          [
            [left - 3, roofFront],
            [middle, roofFront - 34],
            [right + 3, roofFront],
          ],
          '#314c65',
        );
        for (let yy = roofFront - 26; yy < roofFront; yy += 7) {
          const half = (((yy - (roofFront - 34)) / 34) * bay) / 2;
          line(ctx, middle - half + 3, yy, middle + half - 3, yy, '#567084');
        }
        line(ctx, left - 5, roofFront, middle, roofFront - 36, '#c5d8e8', 4);
        line(ctx, middle, roofFront - 36, right + 5, roofFront, '#819fba', 4);
        const windowWidth = Math.min(35, bay * 0.41);
        this.window(
          ctx,
          middle,
          front - 25,
          windowWidth,
          height - 44,
          deriveSeed(worldSeed, b.id, 'chapel', side, chapel),
        );
        buttress(left + 3, height + 7, 11);
        for (let icicle = 0; icicle < 4; icicle++)
          rect(ctx, left + 10 + rng() * (bay - 20), roofFront + 1, 1, 4 + rng() * 7, '#a9c6de');
      }
      buttress(side < 0 ? x + 3 : x + w - 3, 188, 21);
      const outer = side < 0 ? x + 18 : x + w - 18,
        inner = mid + side * (naveWidth / 2 - 3);
      poly(
        ctx,
        [
          [outer, front - 175],
          [outer, front - 194],
          [inner, front - 249],
          [inner, front - 230],
        ],
        '#4f6c84',
      );
      line(ctx, outer, front - 194, inner, front - 249, '#bbd0e1', 4);
      line(ctx, outer, front - 175, inner, front - 230, '#1a344b', 3);
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
        mid + side * naveWidth * 0.34,
        front - 24,
        Math.min(37, naveWidth * 0.14),
        191,
        deriveSeed(worldSeed, b.id, 'nave', side),
      );
    // Concentric stone voussoirs, a leaded floral wheel and smaller petal panes.
    const roseY = front - 215,
      roseR = Math.min(40, naveWidth * 0.23);
    ctx.fillStyle = '#1b3047';
    ctx.beginPath();
    ctx.arc(mid, roseY, roseR + 8, 0, TAU);
    ctx.fill();
    for (let stone = 0; stone < 24; stone++) {
      const a = (stone / 24) * TAU,
        b = ((stone + 0.88) / 24) * TAU;
      poly(
        ctx,
        [
          [mid + Math.cos(a) * (roseR + 7), roseY + Math.sin(a) * (roseR + 7)],
          [mid + Math.cos(b) * (roseR + 7), roseY + Math.sin(b) * (roseR + 7)],
          [mid + Math.cos(b) * (roseR + 2), roseY + Math.sin(b) * (roseR + 2)],
          [mid + Math.cos(a) * (roseR + 2), roseY + Math.sin(a) * (roseR + 2)],
        ],
        stone % 3 ? '#6f879d' : '#8da2b4',
      );
    }
    ctx.strokeStyle = '#a7a078';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mid, roseY, roseR, 0, TAU);
    ctx.stroke();
    for (let petal = 0; petal < 12; petal++) {
      const a = (petal / 12) * TAU,
        r = roseR;
      const points = [
        [0.28, 0],
        [0.59, -0.14],
        [0.86, -0.1],
        [0.96, 0],
        [0.86, 0.1],
        [0.59, 0.14],
      ].map(([radius, offset]) => [
        mid + Math.cos(a + offset) * r * radius,
        roseY + Math.sin(a + offset) * r * radius,
      ]);
      poly(ctx, points, petal % 3 ? '#e9ba70' : '#f2d292');
      for (let j = 0; j < points.length; j++) {
        const u = points[j],
          v = points[(j + 1) % points.length];
        line(ctx, u[0], u[1], v[0], v[1], '#a18151');
      }
      line(
        ctx,
        mid + Math.cos(a) * r * 0.36,
        roseY + Math.sin(a) * r * 0.36,
        mid + Math.cos(a) * r * 0.86,
        roseY + Math.sin(a) * r * 0.86,
        '#ffe2a0',
      );
      const c = a + Math.PI / 12;
      poly(
        ctx,
        [
          [mid + Math.cos(c) * r * 0.64, roseY + Math.sin(c) * r * 0.64],
          [mid + Math.cos(c - 0.065) * r * 0.83, roseY + Math.sin(c - 0.065) * r * 0.83],
          [mid + Math.cos(c) * r * 0.91, roseY + Math.sin(c) * r * 0.91],
          [mid + Math.cos(c + 0.065) * r * 0.83, roseY + Math.sin(c + 0.065) * r * 0.83],
        ],
        '#b58258',
      );
    }
    ctx.strokeStyle = '#bc9c63';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mid, roseY, roseR * 0.3, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      poly(
        ctx,
        [
          [mid, roseY],
          [mid + Math.cos(a - 0.3) * 9, roseY + Math.sin(a - 0.3) * 9],
          [mid + Math.cos(a) * 12, roseY + Math.sin(a) * 12],
          [mid + Math.cos(a + 0.3) * 9, roseY + Math.sin(a + 0.3) * 9],
        ],
        '#ffe5a4',
      );
    }
    rect(ctx, mid - 2, roseY - 2, 4, 4, '#fff2bd');
    this.window(ctx, mid, front - 273, 25, 48, deriveSeed(worldSeed, b.id, 'upper'));
    // Concentric stone archivolts give the entrance visible thickness and shadow.
    poly(
      ctx,
      [
        [mid - 60, front],
        [mid - 60, front - 100],
        [mid, front - 166],
        [mid + 70, front - 94],
        [mid + 77, front + 4],
        [mid + 48, front + 8],
      ],
      '#0b243e88',
    );
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
        ['#1a324a', '#839caf', '#2a465e', '#617e95', '#0d2339'][layer],
      );
    }
    line(ctx, mid - 59, front - 99, mid, front - 159, '#d7e2ec', 5);
    line(ctx, mid, front - 159, mid + 59, front - 99, '#a4bfd5', 4);
    for (const side of [-1, 1]) {
      const xx = mid + side * 36;
      rect(ctx, xx - (side > 0 ? 0 : 4), front - 87, 4, 86, side > 0 ? '#081c31' : '#1e3a52');
      rect(ctx, xx - (side > 0 ? 0 : 2), front - 82, 2, 81, '#071d32');
    }
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
    // A broad shallow landing remains within the clear approach to the existing door.
    // It changes the surface illustration, never the world collision or elevation.
    poly(
      ctx,
      [
        [mid - 121, front + 37],
        [mid + 127, front + 37],
        [mid + 134, front + 47],
        [mid - 111, front + 46],
      ],
      '#17334c55',
    );
    for (let step = 7; step >= 0; step--) {
      const sw = 122 + step * 15,
        y = front + step * 5;
      rect(ctx, mid - sw / 2, y, sw, 5, step % 2 ? '#61798b' : '#698091');
      rect(ctx, mid - sw / 2 + 1, y, sw - 2, 1, '#a9c0d2');
      rect(ctx, mid - sw / 2, y + 4, sw, 1, '#29475f');
      for (let slab = 0; slab < sw / 24; slab++) {
        const xx = mid - sw / 2 + slab * 24 + (step % 2) * 9;
        if (xx < mid + sw / 2 - 2) rect(ctx, xx, y + 1, 1, 3, '#405c73');
      }
      for (const side of [-1, 1]) {
        const xx = mid + side * (sw / 2 - 9);
        rect(ctx, xx - 5, y - 1, 10, 2, '#d3e0e9');
        rect(ctx, xx - 3, y + 1, 6, 1, '#a7bfd3');
      }
    }
    return { sprite: { image: canvas, x: 56, y: 320 }, width: canvas.width, height: canvas.height };
  }

  private makeRoof(b: Building, worldSeed: number): Roof {
    if (b.cathedral) return this.makeCathedral(b, worldSeed);
    if (b.kind && b.kind !== 'church') {
      const sprite = makeCivilBuilding(
        b.kind,
        deriveSeed(worldSeed, b.id),
        b.maxX - b.minX + 1,
        b.maxY - b.minY + 1,
      );
      return { sprite, width: sprite.image.width, height: sprite.image.height };
    }
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
    if (
      p.x < -100 * s ||
      p.x > this.width + 100 * s ||
      p.y < -100 * s ||
      p.y > this.height + 100 * s
    )
      return;
    const motionT = this.reducedMotion ? 0.35 : t;
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
      const r = (12 + motionT * 55) * s;
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.ellipse(0, 10 * s, r, r * 0.55, 0, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + motionT * 0.8;
        rect(ctx, Math.cos(a) * r, 10 * s + Math.sin(a) * r * 0.55, 2 * s, 3 * s, '#d8f0df');
      }
    } else if (effect.kind === 'harvest') {
      const craft = this.effectActors.get(effect.id)?.kind === 'craft';
      const count = this.reducedMotion ? 3 : 7;
      for (let i = 0; i < count; i++) {
        const a = i * 2.399 + (effect.id % 7),
          reach = (craft ? 6 : 4) + motionT * (craft ? 12 : 15),
          x = Math.cos(a) * reach * s,
          y =
            ((craft ? -12 : -3) +
              Math.sin(a) * reach * 0.3 -
              motionT * 13 +
              motionT * motionT * 10) *
            s;
        if (craft) {
          rect(ctx, x, y, s, 3 * s, i % 2 ? '#d8d8a5' : '#b4cbb5');
          rect(ctx, x - s, y + s, 3 * s, s, '#e2dbb4');
        } else {
          line(ctx, x - s, y + 2 * s, x + 2 * s, y - s, '#719a88', s);
          rect(ctx, x, y - s, 3 * s, 2 * s, i % 2 ? '#b6c99f' : effect.color);
        }
      }
    } else if (effect.kind === 'hurt') {
      for (let i = 0; i < (this.reducedMotion ? 2 : 5); i++) {
        const side = i % 2 ? 1 : -1;
        const x = side * (4 + i + motionT * (9 + i)) * s;
        const y = (-10 - i * 2 - motionT * 8 + motionT * motionT * 16) * s;
        rect(ctx, x, y, 2 * s, s, i % 2 ? '#e4ceb5' : effect.color);
      }
    } else {
      const rng = random(effect.id * 8191);
      for (let i = 0; i < 10; i++) {
        const angle = rng() * TAU,
          d = (6 + motionT * 20) * s,
          y = Math.sin(angle) * d * 0.5 - motionT * 20 * s;
        rect(ctx, Math.cos(angle) * d, y, (1 + rng() * 2) * s, 2 * s, effect.color);
      }
      if (effect.kind === 'heal') {
        rect(ctx, -s, -14 * motionT * s - 10 * s, 2 * s, 8 * s, '#cfeec2');
        rect(ctx, -4 * s, -14 * motionT * s - 7 * s, 8 * s, 2 * s, '#cfeec2');
      }
    }
    if (effect.text) {
      ctx.fillStyle = effect.color;
      ctx.font = `${11 * s}px Georgia,serif`;
      ctx.textAlign = 'center';
      ctx.fillText(effect.text, 0, -24 * s - motionT * 16 * s);
    }
    ctx.restore();
  }

  private pointer(game: Stichos, pointer: Point) {
    const world = pointer,
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
