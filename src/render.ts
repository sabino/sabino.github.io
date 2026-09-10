import type { Game, GameState, Entity, Vec2 } from './game';

const WORLD_W = 1600;
const WORLD_H = 1000;
const TAU = Math.PI * 2;
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
};

/** An authored pixel-art world with live actors, light, weather and game effects. */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private background = new Image();
  private biomes = [this.background, new Image(), new Image()];
  private selectedBiome = 0;
  private creatures = new Image();
  private hero = new Image();
  private heroReady = false;
  private particles: Particle[] = [];
  private width = 1600;
  private height = 1000;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private lastPosition = { x: 795, y: 525 };
  private moving = 0;
  private shake = 0;
  private clock = 0;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private ambient = Array.from({ length: 100 }, (_, i) => ({
    x: (i * 593 + 127) % 1600,
    y: (i * 313 + 87) % 1000,
    speed: 3 + (i % 7),
    phase: i * 0.67,
    size: i % 6 === 0 ? 2 : 1,
  }));
  ready: Promise<void>;
  loaded = false;
  fps = 60;
  private frames = 0;
  private frameTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.ready = Promise.all([
      this.load(this.background, './art/verge.png'),
      this.load(this.creatures, './art/species.png'),
      this.load(this.biomes[1], './art/archive.png'),
      this.load(this.biomes[2], './art/witness.png'),
    ]).then(() => {
      this.loaded = true;
    });
    this.hero.onload = () => {
      this.heroReady = true;
    };
    this.hero.src = './art/explorer-alpha.png';
    this.resize();
  }

  private load(image: HTMLImageElement, path: string) {
    return new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Unable to load ${path}`));
      image.src = path;
    });
  }

  resize() {
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.imageSmoothingEnabled = false;
  }

  toWorld(x: number, y: number): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (x - r.left - this.offsetX) / this.scale,
      y: (y - r.top - this.offsetY) / this.scale,
    };
  }

  toScreen(point: Vec2): Vec2 {
    return { x: point.x * this.scale + this.offsetX, y: point.y * this.scale + this.offsetY };
  }

  emit(kind: string, x = 795, y = 525, value = 1) {
    const colors: Record<string, string> = {
      scanned: '#a7fff2',
      scan: '#87ece8',
      hurt: '#ff8d74',
      heal: '#caf7a5',
      'enemy-death': '#f7b05e',
      death: '#effaff',
      relay: '#9ffcff',
      dash: '#b6e4ec',
      pulse: '#91f5ff',
      blade: '#e7ffff',
      complete: '#e7e6b5',
      portal: '#8ffff0',
    };
    const color = colors[kind];
    if (!color) return;
    const count = kind === 'scanned' || kind === 'enemy-death' ? 30 : kind === 'dash' ? 12 : 16;
    if (kind === 'hurt' && !this.reducedMotion) this.shake = 5;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const speed = 20 + Math.random() * 65;
      const life = 0.4 + Math.random() * 0.7;
      this.particles.push({
        x,
        y: y - 20,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed * 0.6 - 20,
        life,
        max: life,
        color,
        size: Math.random() < 0.2 ? 3 : 2,
      });
    }
    void value;
  }

  draw(game: Game, dt: number, paused = false) {
    const s = game.state;
    this.selectedBiome = s.mission % 3;
    const c = this.ctx;
    const dpr = this.canvas.width / this.width;
    this.clock += this.reducedMotion || paused ? 0 : dt;
    this.frames++;
    this.frameTime += dt;
    if (this.frameTime >= 0.5) {
      this.fps = this.frames / this.frameTime;
      this.frames = 0;
      this.frameTime = 0;
    }
    this.scale = Math.max(this.width / WORLD_W, this.height / WORLD_H);
    if (this.width < 650 && this.height > this.width) this.scale = this.height / WORLD_H;
    this.offsetX = (this.width - WORLD_W * this.scale) / 2;
    this.offsetY = (this.height - WORLD_H * this.scale) / 2;
    if (this.width < 650 && this.height > this.width) {
      this.offsetX = Math.max(
        this.width - WORLD_W * this.scale,
        Math.min(0, this.width / 2 - s.player.x * this.scale),
      );
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#031b24';
    c.fillRect(0, 0, this.width, this.height);
    c.translate(this.offsetX, this.offsetY);
    c.scale(this.scale, this.scale);
    if (this.shake > 0.1) {
      c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.shake *= 0.83;
    }
    if (this.loaded) c.drawImage(this.biomes[this.selectedBiome], 0, 0, WORLD_W, WORLD_H);
    else {
      c.fillStyle = '#082e36';
      c.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    this.drawAtmosphere(s);
    this.drawPortal(s);
    const travel = Math.hypot(s.player.x - this.lastPosition.x, s.player.y - this.lastPosition.y);
    this.moving = travel > 0.05 ? 1 : 0;
    this.lastPosition = { x: s.player.x, y: s.player.y };
    const actors: { y: number; draw: () => void }[] = s.entities
      .filter((e) => e.kind !== 'portal')
      .map((e) => ({ y: e.y, draw: () => this.drawEntity(e, s) }));
    actors.push({ y: s.player.y, draw: () => this.drawPlayer(s) });
    for (const pillar of [0, 1])
      actors.push({ y: pillar === 0 ? 606 : 590, draw: () => this.drawOcclusion(pillar) });
    actors.sort((a, b) => a.y - b.y).forEach((a) => a.draw());
    // Foreground pillars participate in the same depth order as the actors.
    this.drawProjectiles(s);
    this.drawEffects(s);
    this.drawParticles(dt, paused);
    this.drawAim(game);
    if (s.player.hp < s.player.maxHp * 0.3) {
      const low = c.createRadialGradient(800, 500, 180, 800, 500, 900);
      low.addColorStop(0, '#800a1800');
      low.addColorStop(1, '#800a1855');
      c.fillStyle = low;
      c.fillRect(0, 0, 1600, 1000);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawAtmosphere(state: GameState) {
    const c = this.ctx,
      t = this.clock;
    for (const p of this.ambient) {
      const x = p.x + Math.sin(t * 0.18 + p.phase) * 14;
      const y = (p.y - t * p.speed + 2000) % 1000;
      c.globalAlpha = 0.25 + Math.sin(t * 0.7 + p.phase) * 0.18;
      c.fillStyle = p.y < 720 && p.y > 350 ? '#dcebac' : '#8cffff';
      c.fillRect(Math.round(x), Math.round(y), p.size, p.size);
    }
    c.globalAlpha = 1;
    // Mist drifts through the abyss; the land and its readable paths stay clear.
    const mist = c.createLinearGradient(0, 740, 0, 1000);
    mist.addColorStop(0, '#063b4100');
    mist.addColorStop(1, '#072c4155');
    c.fillStyle = mist;
    c.fillRect(0, 740, 1600, 260);
    c.globalCompositeOperation = 'screen';
    for (const [x, y, h] of [
      [516, 748, 250],
      [1340, 706, 274],
    ]) {
      c.globalAlpha = 0.12;
      c.strokeStyle = '#a8fff4';
      c.lineWidth = 1;
      for (let i = 0; i < 9; i++) {
        const yy = y + ((t * (46 + i * 3) + i * 27) % h);
        c.beginPath();
        c.moveTo(x + i * 2, yy);
        c.lineTo(x + i * 2, yy + 12 + (i % 9));
        c.stroke();
      }
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    for (const p of [
      { x: 600, y: 374 },
      { x: 1258, y: 638 },
    ])
      this.glow(p.x, p.y, 37 + Math.sin(t * 8) * 3, '#ffb24b', 0.12);
  }

  private drawPortal(s: GameState) {
    const c = this.ctx,
      t = this.clock;
    const done = !!s.entities.find((e) => e.kind === 'portal')?.active;
    this.glow(1047, 275, done ? 125 : 95, '#39eee8', done ? 0.14 : 0.07);
    c.save();
    c.globalCompositeOperation = 'screen';
    c.strokeStyle = '#aafff4';
    for (let i = 0; i < 4; i++) {
      const p = (t * 0.14 + i / 4) % 1;
      c.globalAlpha = (1 - p) * (done ? 0.35 : 0.13);
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(1050, 259, 28 + p * 19, 72 + p * 51, -0.09, 0, TAU);
      c.stroke();
    }
    for (let i = 0; i < 24; i++) {
      const a = i * 2.4 + t * 0.4;
      const x = 1050 + Math.cos(a) * (30 + (i % 4) * 6);
      const y = 260 + Math.sin(a) * (80 + (i % 3) * 12);
      c.globalAlpha = 0.35 + Math.sin(t * 2 + i) * 0.25;
      c.fillStyle = '#b5fff9';
      c.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
    c.restore();
    if (done) {
      c.fillStyle = '#b9fff0';
      c.font = '12px monospace';
      c.textAlign = 'center';
      c.fillText('RIFT SYNCHRONIZED', 1037, 402);
    }
  }

  private drawEntity(e: Entity, s: GameState) {
    const c = this.ctx,
      t = this.clock;
    if (e.kind === 'species') {
      const name = `${e.subtype} ${e.name}`.toLowerCase();
      let index =
        name.includes('deer') || name.includes('hart') || name.includes('stag')
          ? 0
          : name.includes('crystal') || name.includes('bloom') || name.includes('flower')
            ? 2
            : 1;
      const w = index === 0 ? 114 : index === 1 ? 100 : 128;
      const h = index === 0 ? 116 : index === 1 ? 98 : 124;
      this.shadow(e.x, e.y, w * 0.35, 10, 0.26);
      this.glow(e.x, e.y - 25, 55, index === 1 ? '#ffa33e' : '#63daff', 0.08);
      c.save();
      if (e.hp !== undefined && e.hp <= 0) c.globalAlpha = 0.42;
      this.creature(index, e.x, e.y + (index === 0 ? Math.sin(t * 2 + e.x) * 1.1 : 0), w, h);
      c.restore();
      if (!e.scanned) this.marker(e.x, e.y - h - 6, false);
      else this.marker(e.x, e.y - h - 6, true);
    } else if (e.kind === 'enemy') {
      if ((e.hp ?? 1) <= 0) return;
      const bob =
        e.state === 'pursuing' || e.state === 'windup'
          ? Math.sin(t * 16 + e.x) * 2
          : Math.sin(t * 2) * 1.2;
      this.shadow(e.x, e.y, 26, 9, 0.35);
      this.creature(3, e.x, e.y + bob, 90, 88);
      this.glow(e.x - 10, e.y - 45 + bob, 20, '#ff684a', 0.12);
      const hp = (e.hp ?? 1) / (e.maxHp ?? 1);
      c.fillStyle = '#061c24';
      c.fillRect(e.x - 21, e.y - 102, 42, 5);
      c.fillStyle = '#ee7259';
      c.fillRect(e.x - 20, e.y - 101, Math.max(0, 40 * hp), 3);
      if (e.state === 'windup') {
        c.strokeStyle = '#ff8a5b';
        c.lineWidth = 2;
        c.beginPath();
        c.ellipse(e.x, e.y, 50, 28, 0, 0, TAU);
        c.stroke();
      }
    } else if (e.kind === 'relay') {
      const active = e.active;
      this.shadow(e.x, e.y, 20, 9, 0.3);
      this.polygon(
        [
          [e.x - 18, e.y - 4],
          [e.x, e.y + 6],
          [e.x + 18, e.y - 4],
          [e.x, e.y - 14],
        ],
        '#647777',
      );
      this.polygon(
        [
          [e.x - 13, e.y - 9],
          [e.x - 13, e.y - 52],
          [e.x, e.y - 44],
          [e.x, e.y],
        ],
        '#6b817c',
      );
      this.polygon(
        [
          [e.x, e.y],
          [e.x, e.y - 44],
          [e.x + 14, e.y - 51],
          [e.x + 14, e.y - 7],
        ],
        '#344e50',
      );
      this.polygon(
        [
          [e.x - 13, e.y - 52],
          [e.x, e.y - 60],
          [e.x + 14, e.y - 51],
          [e.x, e.y - 44],
        ],
        '#c4ccb0',
      );
      this.glow(e.x, e.y - 39, 34, active ? '#9effe0' : '#8fc7df', active ? 0.22 : 0.1);
      c.strokeStyle = active ? '#b3ffe9' : '#82b4bd';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(e.x - 6, e.y - 39);
      c.lineTo(e.x - 2, e.y - 32);
      c.lineTo(e.x - 6, e.y - 25);
      c.lineTo(e.x - 10, e.y - 32);
      c.closePath();
      c.stroke();
      c.font = 'bold 14px monospace';
      c.textAlign = 'center';
      c.fillStyle = active ? '#b3ffdc' : '#ede6cc';
      c.fillText(['I', 'II', 'III'][(e.order ?? 0) % 3], e.x, e.y - 75);
      this.marker(e.x, e.y - 90, !!active);
    } else if (e.kind === 'survivor') {
      this.shadow(e.x, e.y, 16, 6, 0.25);
      c.save();
      c.translate(e.x, e.y);
      c.globalAlpha = 0.85;
      c.fillStyle = '#122f42';
      c.fillRect(-9, -36, 18, 29);
      c.fillStyle = '#a4bfd4';
      c.fillRect(-7, -50, 14, 14);
      c.fillStyle = '#e0e2cf';
      c.fillRect(-6, -43, 12, 10);
      c.fillStyle = '#d3a285';
      c.fillRect(-6, -29, 12, 5);
      c.fillStyle = '#0b1925';
      c.fillRect(-8, -9, 6, 9);
      c.fillRect(3, -9, 6, 9);
      c.restore();
      this.glow(e.x, e.y - 20, 35, '#a8d6ff', 0.1);
      this.marker(e.x, e.y - 66, !!e.active);
    } else if (e.kind === 'drop') {
      this.glow(e.x, e.y - 10, 32, '#efb468', 0.2);
      c.fillStyle = '#eeb865';
      c.fillRect(e.x - 8, e.y - 18, 16, 15);
      c.fillStyle = '#523a26';
      c.fillRect(e.x - 8, e.y - 12, 16, 3);
      this.marker(e.x, e.y - 38, false);
    }
  }

  private creature(index: number, x: number, y: number, w: number, h: number) {
    if (!this.creatures.complete || !this.creatures.naturalWidth) return;
    const crops = [
      [120, 35, 485, 560],
      [745, 150, 445, 455],
      [124, 665, 503, 490],
      [730, 650, 485, 500],
    ];
    const [sx, sy, sw, sh] = crops[index];
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.ctx.drawImage(
      this.creatures,
      sx,
      sy,
      sw,
      sh,
      Math.round(x - w / 2),
      Math.round(y - h),
      w,
      h,
    );
    this.ctx.imageSmoothingEnabled = false;
  }

  private drawPlayer(s: GameState) {
    const c = this.ctx,
      p = s.player,
      t = this.clock;
    if (s.phase === 'dead') {
      this.glow(p.x, p.y - 25, 35, '#b4e5ea', 0.2);
      return;
    }
    this.shadow(p.x, p.y, 19, 7, 0.38);
    c.save();
    if (p.invulnerable > 0 && Math.floor(t * 18) % 2) c.globalAlpha = 0.55;
    if (p.dashing > 0) c.globalAlpha = 0.75;
    const flip = p.facing.x < -0.1;
    c.translate(Math.round(p.x), Math.round(p.y));
    if (flip) c.scale(-1, 1);
    if (this.heroReady) {
      const col = this.moving ? 1 + (Math.floor(t * 9) % 2) : 0;
      const row = p.facing.y < -0.1 ? 1 : 0;
      const cellW = this.hero.naturalWidth / 3,
        cellH = this.hero.naturalHeight / 2;
      const anchors = [
        [282, 459],
        [265, 459],
        [268, 459],
        [270, 430],
        [263, 430],
        [251, 434],
      ];
      const anchor = anchors[row * 3 + col];
      const size = 104;
      c.drawImage(
        this.hero,
        col * cellW,
        row * cellH,
        cellW,
        cellH,
        (-anchor[0] / 512) * size,
        (-anchor[1] / 512) * size,
        size,
        size,
      );
    } else {
      const step = this.moving ? Math.sin(t * 13) * 4 : 0;
      c.fillStyle = '#091421';
      c.fillRect(-10, -20, 8, 18 + step);
      c.fillRect(3, -20, 8, 18 - step);
      c.fillStyle = '#694e36';
      c.fillRect(-11, -5 + step, 11, 5);
      c.fillRect(3, -5 - step, 12, 5);
      this.polygon(
        [
          [-11, -47],
          [9, -47],
          [15, -20],
          [7, -12],
          [-4, -18],
          [-14, -19],
        ],
        '#15344d',
      );
      c.fillStyle = '#466177';
      c.fillRect(-8, -41, 4, 20);
      c.fillStyle = '#dbd2b1';
      c.fillRect(-1, -40, 5, 17);
      this.polygon(
        [
          [-8, -47],
          [-22, -41],
          [-31, -40 - Math.sin(t * 5) * 3],
          [-24, -34],
          [-11, -40],
          [9, -40],
          [9, -46],
        ],
        '#d95729',
      );
      c.fillStyle = '#f9bf8a';
      c.fillRect(-4, -60, 15, 15);
      c.fillStyle = '#080e21';
      c.fillRect(7, -56, 3, 4);
      this.polygon(
        [
          [-10, -56],
          [-13, -64],
          [-8, -64],
          [-9, -70],
          [-2, -68],
          [3, -73],
          [7, -69],
          [14, -69],
          [15, -62],
          [11, -55],
          [9, -62],
          [4, -58],
          [1, -64],
          [-2, -59],
        ],
        '#e3f1f4',
      );
      c.fillStyle = '#92abbf';
      c.fillRect(-10, -59, 5, 7);
      c.fillStyle = '#e6b98c';
      c.fillRect(10, -31, 6, 8);
      c.strokeStyle = '#0c2134';
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(13, -25);
      c.lineTo(46, -7);
      c.stroke();
      c.strokeStyle = '#87f9f9';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(17, -23);
      c.lineTo(46, -7);
      c.stroke();
      c.strokeStyle = '#e5ffff';
      c.lineWidth = 1;
      c.stroke();
    }
    c.restore();
    this.glow(p.x + 23, p.y - 16, 25, '#9cf9ef', 0.06);
  }

  private drawOcclusion(index: number) {
    if (!this.loaded) return;
    const c = this.ctx;
    const pillars = [
      {
        x: 625,
        y: 606,
        polygon: [
          [615, 520],
          [637, 506],
          [658, 517],
          [661, 587],
          [636, 612],
          [615, 599],
        ],
      },
      {
        x: 960,
        y: 590,
        polygon: [
          [948, 519],
          [968, 507],
          [984, 516],
          [985, 570],
          [962, 591],
          [949, 580],
        ],
      },
    ];
    for (const oc of [pillars[index]]) {
      {
        c.save();
        c.beginPath();
        oc.polygon.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.closePath();
        c.clip();
        c.drawImage(this.biomes[this.selectedBiome], 0, 0, 1600, 1000);
        c.restore();
      }
    }
  }

  private drawProjectiles(s: GameState) {
    const c = this.ctx;
    for (const p of s.projectiles) {
      const color = p.owner === 'player' ? '#acffff' : '#ff906d';
      this.glow(p.x, p.y - 16, 22, color, 0.3);
      c.strokeStyle = color;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(p.x - p.vx * 0.035, p.y - 16 - p.vy * 0.035);
      c.lineTo(p.x, p.y - 16);
      c.stroke();
      c.fillStyle = '#fffce3';
      c.fillRect(p.x - 2, p.y - 18, 4, 4);
    }
  }

  private drawEffects(s: GameState) {
    const c = this.ctx;
    for (const e of s.effects) {
      const progress = 1 - e.life / e.maxLife;
      c.save();
      c.globalAlpha = Math.min(1, (e.life / e.maxLife) * 2);
      if (e.kind === 'blade') {
        c.translate(e.x, e.y - 25);
        c.scale(1, 0.6);
        c.rotate(e.angle ?? 0);
        c.strokeStyle = '#c7ffff';
        c.lineWidth = 5 * (1 - progress) + 1;
        c.beginPath();
        c.arc(0, 0, 30 + progress * 60, -1.2 + progress * 0.5, 1.2 + progress * 0.5);
        c.stroke();
      } else if (e.kind === 'scan' || e.kind === 'scanned' || e.kind === 'relay') {
        c.strokeStyle = '#9afdf2';
        c.lineWidth = 1.5;
        c.setLineDash(e.kind === 'scan' ? [9, 7] : []);
        c.beginPath();
        c.ellipse(
          e.x,
          e.y,
          Math.max(4, e.radius * progress),
          Math.max(2, e.radius * progress * 0.55),
          0,
          0,
          TAU,
        );
        c.stroke();
      } else if (e.kind === 'heal' || e.kind === 'mend') {
        this.glow(e.x, e.y - 25, 60, '#ccffbb', 0.25);
        c.fillStyle = '#ceffc3';
        c.font = '18px monospace';
        c.textAlign = 'center';
        c.fillText('+', e.x, e.y - 65 - progress * 25);
      } else if (e.text) {
        c.fillStyle = e.kind === 'damage' ? '#ffd7af' : '#b2fff0';
        c.font = 'bold 15px monospace';
        c.textAlign = 'center';
        c.fillText(e.text, e.x, e.y - 65 - progress * 35);
      }
      c.restore();
    }
  }

  private drawParticles(dt: number, paused: boolean) {
    const c = this.ctx;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (!paused) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 15 * dt;
      }
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      c.globalAlpha = Math.min(1, (p.life / p.max) * 1.5);
      c.fillStyle = p.color;
      c.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    c.globalAlpha = 1;
  }

  private drawAim(game: Game) {
    const nearest = game.getInteraction();
    if (!nearest) return;
    const c = this.ctx;
    c.strokeStyle = '#bcfff070';
    c.lineWidth = 1;
    c.setLineDash([3, 5]);
    c.beginPath();
    c.ellipse(nearest.x, nearest.y, 35, 18, 0, 0, TAU);
    c.stroke();
    c.setLineDash([]);
  }

  private marker(x: number, y: number, complete: boolean) {
    const c = this.ctx;
    c.save();
    c.translate(Math.round(x), Math.round(y + Math.sin(this.clock * 2 + x) * 2));
    c.strokeStyle = complete ? '#b5d49c99' : '#9ce9e8';
    c.lineWidth = 1.5;
    if (complete) {
      c.beginPath();
      c.moveTo(-4, 0);
      c.lineTo(-1, 3);
      c.lineTo(5, -3);
      c.stroke();
    } else {
      for (const [a, b] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        c.beginPath();
        c.moveTo(a * 5, b * 11);
        c.lineTo(a * 11, b * 11);
        c.lineTo(a * 11, b * 5);
        c.stroke();
      }
      c.strokeRect(-3, -3, 6, 6);
    }
    c.restore();
  }

  private glow(x: number, y: number, r: number, color: string, opacity: number) {
    const c = this.ctx;
    c.save();
    c.globalCompositeOperation = 'screen';
    c.globalAlpha = opacity;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, color + '00');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
    c.restore();
  }
  private shadow(x: number, y: number, rx: number, ry: number, alpha: number) {
    const c = this.ctx;
    c.fillStyle = `rgba(1,14,22,${alpha})`;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, TAU);
    c.fill();
  }
  private polygon(points: number[][], fill: string) {
    const c = this.ctx;
    c.fillStyle = fill;
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fill();
  }
}
