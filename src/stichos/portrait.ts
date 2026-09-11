import type { Appearance } from './types';

/** A close portrait assembled from the same inherited features as the world sprite. */
export function drawPortrait(ctx: CanvasRenderingContext2D, a: Appearance) {
  const shade = (hex: string, amount: number) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${[n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, v + amount))).join(',')})`;
  };
  const shape = (fill: string, points: number[][]) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  };
  const box = (fill: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  };
  const narrow = (a.seed % 5) - 2;
  const skinShadow = shade(a.skin, -46),
    skinDark = shade(a.skin, -70);
  const coatDark = shade(a.coat, -27),
    coatLight = shade(a.coat, 17);
  ctx.imageSmoothingEnabled = false;
  box('#0b1720', 0, 0, 96, 112);
  for (let y = 0; y < 112; y += 5)
    for (let x = 0; x < 96; x += 5) {
      if (((x * 19 + y * 13 + a.seed) >>> 0) % 11 < 3) box('#162832', x, y, 3, 4);
    }
  shape(coatDark, [
    [4, 112],
    [9, 83],
    [24, 74],
    [27, 41],
    [26, 22],
    [39, 8],
    [64, 9],
    [78, 26],
    [77, 60],
    [74, 76],
    [88, 89],
    [95, 112],
  ]);
  shape(a.coat, [
    [7, 110],
    [15, 87],
    [33, 76],
    [67, 75],
    [84, 89],
    [91, 112],
  ]);
  shape(coatLight, [
    [10, 107],
    [19, 89],
    [32, 83],
    [36, 92],
    [27, 112],
  ]);
  shape(coatDark, [
    [63, 80],
    [72, 84],
    [86, 112],
    [58, 112],
  ]);
  shape(skinDark, [
    [36, 69],
    [61, 67],
    [64, 87],
    [51, 94],
    [37, 85],
  ]);
  shape(skinShadow, [
    [40, 70],
    [57, 69],
    [60, 83],
    [48, 88],
    [40, 82],
  ]);
  shape(a.skin, [
    [29 + narrow, 33],
    [38, 21],
    [60, 23],
    [70 - narrow, 38],
    [68, 62],
    [58, 77],
    [46, 79],
    [33, 69],
    [28, 51],
  ]);
  shape(skinShadow, [
    [29 + narrow, 34],
    [34, 36],
    [34, 53],
    [40, 69],
    [50, 77],
    [44, 79],
    [33, 68],
    [28, 51],
  ]);
  shape(skinDark, [
    [65, 36],
    [70 - narrow, 39],
    [68, 61],
    [58, 77],
    [54, 75],
    [61, 63],
    [63, 46],
  ]);
  shape(shade(a.skin, 15), [
    [36, 37],
    [43, 31],
    [54, 33],
    [58, 40],
    [53, 48],
    [40, 46],
  ]);
  shape(skinShadow, [
    [50, 43],
    [54, 46],
    [58, 60],
    [49, 63],
    [48, 59],
    [52, 57],
  ]);
  box(shade(a.skin, 22), 49, 48, 3, 10);
  box(skinDark, 49, 60, 7, 2);
  shape(shade(a.hair, -26), [
    [30, 36],
    [30, 26],
    [38, 17],
    [58, 18],
    [68, 28],
    [68, 45],
    [63, 38],
    [59, 28],
    [46, 28],
    [37, 34],
    [33, 45],
  ]);
  for (let i = 0; i < 7; i++) {
    const x = 34 + i * 4;
    const drop = ((a.seed >>> (i * 3)) & 7) + (a.hairStyle % 3) * 2;
    shape(shade(a.hair, i % 2 ? 7 : -10), [
      [x, 24],
      [x + 5, 25],
      [x + 2, 34 + drop],
      [x - 1, 36 + drop],
    ]);
  }
  box(shade(a.hair, -16), 36, 43, 9, 3);
  box(shade(a.hair, -25), 56, 43, 8, 3);
  box(skinShadow, 35, 46, 11, 5);
  box(skinDark, 54, 46, 11, 5);
  box('#c0c5ad', 37, 47, 7, 2);
  box('#c0c5ad', 56, 47, 6, 2);
  box('#26383d', 40, 47, 3, 3);
  box('#26383d', 57, 47, 3, 3);
  box('#d2d4bd', 40, 47, 1, 1);
  box('#d2d4bd', 57, 47, 1, 1);
  shape(skinShadow, [
    [36, 55],
    [43, 55],
    [42, 59],
    [35, 62],
  ]);
  box(shade(a.skin, -60), 45, 67, 13, 2);
  box(shade(a.skin, 7), 47, 70, 9, 2);
  if (a.hairStyle % 2 === 0) {
    shape(shade(a.hair, -17), [
      [34, 59],
      [38, 63],
      [44, 69],
      [55, 69],
      [63, 60],
      [62, 71],
      [56, 79],
      [46, 80],
      [37, 72],
    ]);
    for (let i = 0; i < 10; i++)
      box(shade(a.hair, i % 3 ? -3 : 15), 38 + ((i * 7) % 23), 67 + ((i * 3) % 11), 2, 3);
    box(skinShadow, 47, 66, 9, 2);
  }
  if (a.cloak || a.hat > 1) {
    shape(a.coat, [
      [18, 79],
      [23, 30],
      [37, 9],
      [58, 7],
      [72, 18],
      [80, 38],
      [77, 80],
      [68, 71],
      [70, 35],
      [60, 23],
      [40, 24],
      [30, 38],
      [27, 74],
    ]);
    shape(coatLight, [
      [23, 38],
      [29, 24],
      [39, 14],
      [56, 12],
      [45, 18],
      [35, 29],
      [28, 47],
      [25, 71],
      [20, 79],
    ]);
    shape(coatDark, [
      [59, 12],
      [69, 19],
      [76, 39],
      [73, 74],
      [68, 71],
      [70, 37],
      [62, 24],
    ]);
    shape(shade(a.coat, 36), [
      [28, 31],
      [35, 21],
      [42, 17],
      [37, 24],
      [29, 40],
    ]);
    for (let i = 0; i < 6; i++) box(a.trim, 26 - i, 48 + i * 5, 1, 2);
  }
  shape(coatDark, [
    [30, 80],
    [46, 91],
    [67, 80],
    [73, 85],
    [50, 104],
    [26, 86],
  ]);
  shape(coatLight, [
    [29, 81],
    [46, 91],
    [66, 81],
    [63, 86],
    [48, 96],
    [32, 89],
  ]);
  box(a.trim, 45, 94, 7, 6);
  box(shade(a.trim, 35), 47, 95, 3, 3);
  box('#070f1799', 0, 107, 96, 5);
}
