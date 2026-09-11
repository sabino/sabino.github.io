import { readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

// Native pixel composition of the existing icon.svg mark; no image service,
// package dependency, font rasterizer, network access or platform-specific tool.
const source = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8');
const colors = [...source.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1]);
if (colors.length !== 3 || !source.includes('viewBox="0 0 64 64"'))
  throw Error('Review icon.svg before regenerating its pixel mark.');
const rgb = (hex) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
const [background, frame, heart] = colors.map(rgb);
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function chunk(type, data) {
  const payload = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of payload) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  const length = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, payload, checksum]);
}
function png(size, maskable) {
  const rows = Buffer.alloc(size * (size * 4 + 1));
  let maxMarkRadius = 0;
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    for (let x = 0; x < size; x++) {
      const scale = maskable ? 0.78 : 1;
      const px = (Math.floor(((x + 0.5) * 64) / size) + 0.5 - 32) / scale;
      const py = (Math.floor(((y + 0.5) * 64) / size) + 0.5 - 32) / scale;
      const diamond = Math.abs(px) + Math.abs(py);
      const color = diamond <= 9 ? heart : diamond >= 21.2 && diamond <= 26.8 ? frame : background;
      if (color !== background)
        maxMarkRadius = Math.max(maxMarkRadius, Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2));
      const at = row + 1 + x * 4;
      rows[at] = color[0];
      rows[at + 1] = color[1];
      rows[at + 2] = color[2];
      rows[at + 3] = 255;
    }
  }
  // https://web.dev/articles/maskable-icon: essential artwork stays inside radius 40%.
  if (maskable && maxMarkRadius > size * 0.4)
    throw Error('The mark escaped the maskable safe circle.');
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6; // Eight-bit RGBA, opaque in every pixel.
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-192.png', 192, true],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
  ['favicon-32.png', 32, false],
]) {
  const data = png(size, maskable);
  await writeFile(new URL(`../public/${name}`, import.meta.url), data);
  console.log(
    `${name}: ${size}×${size}, opaque RGBA${maskable ? ', safe-circle verified' : ''}, ${data.length} bytes`,
  );
}
