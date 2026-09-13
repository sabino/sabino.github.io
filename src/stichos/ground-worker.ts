import { paintRegionalGround, regionalGroundColor } from './biome-art.ts';
import type { Tile } from './types.ts';

// One request at a time, owned by the renderer. No simulation state or randomness
// crosses back into the game: this worker only rasterizes immutable tile snapshots.
const tiles = new Map<string, OffscreenCanvas>();
const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};
scope.onmessage = ({
  data,
}: MessageEvent<{ id: number; tiles: Tile[]; cx: number; cy: number }>) => {
  try {
    const started = performance.now();
    const canvas = new OffscreenCanvas(512, 512);
    const ctx = canvas.getContext('2d', { alpha: false })!;
    for (const tile of data.tiles) {
      const key = `${tile.terrain}:${tile.seed}:${regionalGroundColor(tile)}:${tile.architecture?.wallMaterial}:${!!tile.building}`;
      let sprite = tiles.get(key);
      if (!sprite) {
        sprite = new OffscreenCanvas(32, 32);
        paintRegionalGround(sprite.getContext('2d')! as unknown as CanvasRenderingContext2D, tile);
        tiles.set(key, sprite);
        if (tiles.size > 768) tiles.delete(tiles.keys().next().value!);
      }
      ctx.drawImage(sprite, (tile.x - data.cx * 16) * 32, (tile.y - data.cy * 16) * 32);
    }
    const bitmap = canvas.transferToImageBitmap();
    scope.postMessage({ id: data.id, bitmap, ms: performance.now() - started }, [bitmap]);
  } catch {
    scope.postMessage({ id: data.id, failed: true }, []);
  }
};
