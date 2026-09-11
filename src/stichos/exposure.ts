import type { Tile } from './types.ts';
import type { CivilizationAxes } from './civilization.ts';
export interface Exposure {
  temperature: number;
  sheltered: boolean;
  coldStress: number;
  heatStress: number;
  altitudeStress: number;
  pollution: number;
  breathRate: number;
  warmthRate: number;
  label: string;
  detail: string;
}
const clamp = (v: number) => Math.max(0, Math.min(1, v));
/** Physiology is driven by local climate and actual construction, not a universal winter timer. */
export function exposureAt(
  tile: Tile,
  axes?: CivilizationAxes,
  protectedBreath = false,
  running = false,
): Exposure {
  const sheltered = !!tile.building && tile.terrain === 'floor';
  const coldStress = sheltered ? 0 : clamp((-tile.temperature - 1) / 27);
  const heatStress = sheltered ? 0 : clamp((tile.temperature - 34) / 24);
  const altitudeStress = clamp(((tile.ecology?.elevation ?? 0.5) - 0.73) / 0.24);
  const industry =
    tile.biome === 'settlement'
      ? clamp(((axes?.industry ?? 0) - 0.55) / 0.45) * (1 - (axes?.organics ?? 0) * 0.7)
      : 0;
  const volcanic = tile.biome === 'volcanic' ? (tile.ecology?.geothermal ?? 0) * 0.68 : 0;
  const pollution = clamp(industry + volcanic) * (sheltered ? 0.2 : 1);
  const burden = coldStress * 0.95 + altitudeStress + pollution + heatStress * 0.18;
  const breathRate = protectedBreath ? 0.3 : burden > 0.07 ? -0.02 - burden * 0.2 : 0.18;
  const warmthRate = sheltered
    ? 1.2
    : coldStress > 0
      ? -coldStress * (running ? 0.045 : 0.15)
      : heatStress > 0
        ? -heatStress * (running ? 0.15 : 0.075)
        : 0.22;
  const conditions = [
    coldStress > 0.1 ? 'Freezing air' : '',
    heatStress > 0.1 ? 'Extreme heat' : '',
    altitudeStress > 0.1 ? 'Thin air' : '',
    pollution > 0.1 ? (volcanic > industry ? 'Volcanic dust' : 'Industrial haze') : '',
  ].filter(Boolean);
  const label = sheltered ? 'Sheltered' : conditions.join(' · ') || 'Breathable air';
  return {
    temperature: tile.temperature,
    sheltered,
    coldStress,
    heatStress,
    altitudeStress,
    pollution,
    breathRate,
    warmthRate,
    label,
    detail: `${tile.temperature.toFixed(1)}°C · ${protectedBreath ? 'respiratory protection active' : breathRate >= 0 ? 'breath recovers naturally' : 'respiratory protection recommended'}${warmthRate < 0 ? ' · thermal stress' : ''}`,
  };
}
