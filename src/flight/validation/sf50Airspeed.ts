import { SF50_AIRSPEED_CORRECTION } from "./sf50AfmData.ts";

/**
 * Piecewise-linear estimate from AFM 5-14. No extrapolation, no invented
 * intermediate-flap chart. Its stated power condition remains a limitation
 * when used for takeoff or idle-thrust landing.
 */
function convert(value: number, flapsNorm: number, inverse: boolean): number | null {
  if (!Number.isFinite(value)) throw new RangeError("Airspeed must be finite.");
  const key = String(flapsNorm) as keyof typeof SF50_AIRSPEED_CORRECTION;
  const points = SF50_AIRSPEED_CORRECTION[key];
  if (!points) return null;
  const x = inverse ? 1 : 0;
  const y = inverse ? 0 : 1;
  for (let index = 0; index < points.length; index++) {
    const point = points[index]!;
    if (value === point[x]) return point[y];
    const next = points[index + 1];
    if (next && value > point[x] && value < next[x]) {
      return point[y] + (next[y] - point[y]) * (value - point[x]) / (next[x] - point[x]);
    }
  }
  return null;
}

export function sf50KiasToKcas(kias: number, flapsNorm: number): number | null {
  return convert(kias, flapsNorm, false);
}

export function sf50KcasToKias(kcas: number, flapsNorm: number): number | null {
  return convert(kcas, flapsNorm, true);
}
