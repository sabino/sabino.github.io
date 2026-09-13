import { drawSignSymbol, type WorldSign } from './world-signs.ts';
import { atlasScreen, type AtlasView } from './atlas.ts';
import type { Point } from './types.ts';
import type { Stichos } from './session.ts';
export interface SurfaceSignMarker extends Point {
  id: string;
  size: number;
  sign: WorldSign;
}
/** Only real, already-seen signs become chart symbols. No town/road positions are inferred. */
export function surfaceSignMarkers(
  signs: readonly WorldSign[],
  view: AtlasView,
  width: number,
  height: number,
  explored: (x: number, y: number) => boolean,
  player?: Point,
  displayScale = 1,
): SurfaceSignMarker[] {
  if (
    ![view.x, view.y, view.scale, width, height, displayScale].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    displayScale <= 0 ||
    view.scale / displayScale < 0.5
  )
    return [];
  const size = Math.round(Math.max(14, Math.min(42, 14 * displayScale))),
    margin = size / 2 + 2,
    candidates = signs
      .slice(0, 128)
      .filter(
        (sign) =>
          sign.spaceId === 'surface' &&
          Number.isFinite(sign.x) &&
          Number.isFinite(sign.y) &&
          explored(sign.x, sign.y),
      )
      .map((sign) => ({ ...atlasScreen(view, sign, width, height), id: sign.id, size, sign }))
      .filter(
        (marker) =>
          marker.x >= margin &&
          marker.y >= margin &&
          marker.x <= width - margin &&
          marker.y <= height - margin,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - width / 2, a.y - height / 2) -
            Math.hypot(b.x - width / 2, b.y - height / 2) || a.id.localeCompare(b.id),
      ),
    result: SurfaceSignMarker[] = [],
    playerScreen = player ? atlasScreen(view, player, width, height) : null;
  for (const candidate of candidates) {
    if (
      playerScreen &&
      Math.hypot(candidate.x - playerScreen.x, candidate.y - playerScreen.y) <
        size / 2 + 7 * displayScale
    )
      continue;
    if (
      result.some(
        (other) =>
          Math.abs(other.x - candidate.x) < size + 3 && Math.abs(other.y - candidate.y) < size + 3,
      )
    )
      continue;
    result.push(candidate);
    if (result.length >= 32) break;
  }
  return result;
}
/** Call after the existing atlas painter, for both minimap and full atlas. Returns hit-test/label data. */
export function drawSurfaceMapSigns(
  canvas: HTMLCanvasElement,
  game: Pick<Stichos, 'spaceId' | 'livingSystemsFrame' | 'explored' | 'player'>,
  view: AtlasView,
): SurfaceSignMarker[] {
  if (game.spaceId !== 'surface') return [];
  const markers = surfaceSignMarkers(
      game.livingSystemsFrame?.signs ?? [],
      view,
      canvas.width,
      canvas.height,
      (x, y) => game.explored(x, y),
      game.player,
      Math.max(1, canvas.width / (canvas.clientWidth || canvas.width)),
    ),
    c = canvas.getContext('2d');
  if (!c) return [];
  c.save();
  c.imageSmoothingEnabled = false;
  for (const marker of markers)
    drawSignSymbol(
      c,
      marker.sign.mapSymbol,
      Math.round(marker.x - marker.size / 2),
      Math.round(marker.y - marker.size / 2),
      marker.size,
      '#f0dfab',
      '#172a35',
    );
  c.restore();
  return markers;
}
