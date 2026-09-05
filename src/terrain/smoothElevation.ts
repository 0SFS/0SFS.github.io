import { DEG_TO_RAD, geodeticToEcef, type EcefCoord } from "../camera/cameraMath";
import { SMOOTH_ELEVATION_FEATURES } from "./smoothElevationCoefficients";

export interface SmoothElevationOptions {
  clampMinMeters?: number;
  clampMaxMeters?: number;
}

const DEFAULT_MIN_HEIGHT_METERS = -500;
const DEFAULT_MAX_HEIGHT_METERS = 6_500;

function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.min(maxValue, Math.max(minValue, value));
}

function normalizeLonDeg(lonDeg: number): number {
  return ((lonDeg + 180) % 360 + 360) % 360 - 180;
}

function angularDistanceRad(firstLatDeg: number, firstLonDeg: number, secondLatDeg: number, secondLonDeg: number): number {
  const firstLatRad = firstLatDeg * DEG_TO_RAD;
  const secondLatRad = secondLatDeg * DEG_TO_RAD;
  const latDeltaRad = (secondLatDeg - firstLatDeg) * DEG_TO_RAD;
  const lonDeltaRad = normalizeLonDeg(secondLonDeg - firstLonDeg) * DEG_TO_RAD;
  const sinHalfLat = Math.sin(latDeltaRad / 2);
  const sinHalfLon = Math.sin(lonDeltaRad / 2);
  const haversine = sinHalfLat * sinHalfLat
    + Math.cos(firstLatRad) * Math.cos(secondLatRad) * sinHalfLon * sinHalfLon;
  return 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
}

export function smoothSurfaceHeightMeters(
  latDeg: number,
  lonDeg: number,
  options: SmoothElevationOptions = {},
): number {
  if (!Number.isFinite(latDeg) || !Number.isFinite(lonDeg)) return 0;

  const clampedLatDeg = clamp(latDeg, -90, 90);
  const normalizedLonDeg = normalizeLonDeg(lonDeg);
  let heightMeters = 0;

  for (const feature of SMOOTH_ELEVATION_FEATURES) {
    const radiusRad = Math.max(0.001, feature.radiusDeg * DEG_TO_RAD);
    const distanceRad = angularDistanceRad(clampedLatDeg, normalizedLonDeg, feature.latDeg, feature.lonDeg);
    const normalizedDistance = distanceRad / radiusRad;
    heightMeters += feature.heightMeters * Math.exp(-0.5 * normalizedDistance * normalizedDistance);
  }

  return clamp(
    heightMeters,
    options.clampMinMeters ?? DEFAULT_MIN_HEIGHT_METERS,
    options.clampMaxMeters ?? DEFAULT_MAX_HEIGHT_METERS,
  );
}

export function smoothSurfaceEcef(latDeg: number, lonDeg: number, offsetMeters = 0): EcefCoord {
  const heightMeters = smoothSurfaceHeightMeters(latDeg, lonDeg) + offsetMeters;
  return geodeticToEcef(latDeg * DEG_TO_RAD, lonDeg * DEG_TO_RAD, heightMeters);
}
