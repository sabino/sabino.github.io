import { planetAt, sectorPlanets, type Planet, type KnownWorld } from './universe';
/** Pan/zoom exploration with native buttons for keyboard and touch access. */
export function mountGalaxy(
  canvas: HTMLCanvasElement,
  worlds: KnownWorld[],
  current: number,
  onSelect: (planet: Planet) => void,
) {
  const known = new Set(worlds.map((w) => w.seed));
  known.add(current);
  let sector = 0,
    scale = 0.42,
    cx = 0,
    cy = 0;
  let selectedSeed = current;
  let hoveredSeed: number | null = null;
  let planets: Planet[] = [],
    drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
  function catalogue() {
    const list = sectorPlanets(sector),
      seen = new Set(list.map((p) => p.seed));
    for (const w of worlds)
      if (!seen.has(w.seed)) {
        list.push(planetAt(w.seed, w.generation));
        seen.add(w.seed);
      }
    if (!seen.has(current)) list.push(planetAt(current));
    planets = list;
  }
  function draw() {
    const bounds = canvas.getBoundingClientRect();
    canvas.width = Math.max(280, Math.round(bounds.width));
    canvas.height = Math.max(200, Math.round(bounds.height));
    const ctx = canvas.getContext('2d')!,
      w = canvas.width,
      h = canvas.height;
    ctx.fillStyle = '#0c1b29';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 320; i++) {
      const x = (((i * 1037 + sector * 17) % 2339) / 2339) * w,
        y = (((i * 877 + 23) % 1549) / 1549) * h;
      ctx.fillStyle = i % 7 ? '#536472' : '#a9b6b9';
      ctx.fillRect(x, y, i % 7 ? 1 : 2, 1);
    }
    ctx.strokeStyle = '#1d3343';
    ctx.lineWidth = 1;
    for (let x = w / 2 - cx * scale; x < w; x += 100 * scale) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = h / 2 - cy * scale; y < h; y += 100 * scale) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    const labels: { x: number; y: number; w: number }[] = [];
    for (const p of [...planets].sort(
      (a, b) =>
        Number(b.seed === selectedSeed) - Number(a.seed === selectedSeed) ||
        Number(known.has(b.seed)) - Number(known.has(a.seed)),
    )) {
      const x = w / 2 + (p.x - cx) * scale,
        y = h / 2 + (p.y - cy) * scale;
      if (x < 0 || x > w || y < 0 || y > h) continue;
      const r = Math.max(4, p.radius * Math.sqrt(scale));
      ctx.fillStyle = known.has(p.seed) ? p.color : '#354858';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#0c1b2966';
      ctx.fillRect(x, y - r, r, r * 2);
      ctx.fillStyle = '#d9ead333';
      ctx.fillRect(x - r, y - r / 3, r * 1.7, 2);
      ctx.restore();
      if (p.seed === selectedSeed) {
        ctx.strokeStyle = '#e0c488';
        ctx.strokeRect(x - r - 4, y - r - 4, r * 2 + 8, r * 2 + 8);
      }
      ctx.fillStyle = known.has(p.seed) ? '#d5dedb' : '#81929f';
      ctx.font = '12px "Courier New", monospace';
      ctx.textAlign = 'center';
      if (known.has(p.seed) || p.seed === selectedSeed || p.seed === hoveredSeed || scale > 1.2) {
        const label =
          known.has(p.seed) || p.seed === selectedSeed
            ? p.name
            : `Signal ${p.seed.toString(36).slice(0, 4).toUpperCase()}`;
        const width = ctx.measureText(label).width,
          ly = y + r + 17;
        if (
          !labels.some((l) => Math.abs(l.y - ly) < 17 && Math.abs(l.x - x) < (l.w + width) / 2 + 8)
        ) {
          ctx.fillText(label, x, ly);
          labels.push({ x, y: ly, w: width });
        }
      }
    }
    ctx.fillStyle = '#b8c9c9';
    ctx.textAlign = 'left';
    ctx.font = '12px Courier New';
    ctx.fillText(`Sector ${sector} · ${Math.round(scale * 100)}%`, 12, 22);
  }
  catalogue();
  const start = planetAt(current);
  cx = start.x;
  cy = start.y;
  draw();
  canvas.onpointerdown = (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, cx, cy, moved: false };
  };
  canvas.onpointermove = (e) => {
    if (!drag) {
      const b = canvas.getBoundingClientRect(),
        x = (e.clientX - b.left - canvas.width / 2) / scale + cx,
        y = (e.clientY - b.top - canvas.height / 2) / scale + cy;
      const nearby = planets.find((p) => Math.hypot(p.x - x, p.y - y) < 20 / scale);
      if (hoveredSeed !== (nearby?.seed ?? null)) {
        hoveredSeed = nearby?.seed ?? null;
        draw();
      }
      return;
    }
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 5) drag.moved = true;
    cx = drag.cx - dx / scale;
    cy = drag.cy - dy / scale;
    draw();
  };
  canvas.onpointerup = (e) => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (moved) return;
    const b = canvas.getBoundingClientRect(),
      x = (e.clientX - b.left - canvas.width / 2) / scale + cx,
      y = (e.clientY - b.top - canvas.height / 2) / scale + cy;
    const p = planets
      .map((p) => ({ p, d: Math.hypot(p.x - x, p.y - y) }))
      .sort((a, b) => a.d - b.d)[0];
    if (p && p.d < 30 / scale) {
      selectedSeed = p.p.seed;
      onSelect(p.p);
      draw();
    }
  };
  canvas.onwheel = (e) => {
    e.preventDefault();
    scale = Math.max(0.18, Math.min(1.8, scale * Math.exp(-e.deltaY * 0.001)));
    draw();
  };
  const observer = new ResizeObserver(draw);
  observer.observe(canvas);
  return {
    zoom(factor: number) {
      scale = Math.max(0.18, Math.min(1.8, scale * factor));
      draw();
    },
    sector(delta: number) {
      sector += delta;
      catalogue();
      cx = cy = 0;
      const local = sectorPlanets(sector).sort(
        (a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y),
      )[0];
      selectedSeed = local.seed;
      onSelect(local);
      draw();
    },
    focus(seed: number) {
      const p = planetAt(seed);
      selectedSeed = p.seed;
      cx = p.x;
      cy = p.y;
      draw();
      onSelect(p);
    },
    dispose() {
      observer.disconnect();
      canvas.onpointerdown = canvas.onpointermove = canvas.onpointerup = canvas.onwheel = null;
    },
  };
}
