import { DEG_TO_RAD } from "foss-earth/cameraMath";

export interface FlightState {
  latDeg: number;
  lonDeg: number;
  altMeters: number;
  rollRad: number;
  pitchRad: number;
  headingRad: number;
  airspeedKts: number;
  verticalSpeedFps: number;
  throttleNorm: number;
}

export const EMPTY_FLIGHT_STATE: FlightState = {
  latDeg: 0,
  lonDeg: 0,
  altMeters: 0,
  rollRad: 0,
  pitchRad: 0,
  headingRad: 0,
  airspeedKts: 0,
  verticalSpeedFps: 0,
  throttleNorm: 0,
};

export function interpolateFlightState(
  prev: FlightState | null,
  curr: FlightState | null,
  alpha: number,
): FlightState {
  if (!curr) return prev ?? EMPTY_FLIGHT_STATE;
  if (!prev) return curr;

  const t = Math.min(1, Math.max(0, alpha));
  const lerp = (a: number, b: number): number => a + (b - a) * t;
  const lerpAngle = (a: number, b: number): number => {
    const delta = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return a + delta * t;
  };

  return {
    latDeg: lerp(prev.latDeg, curr.latDeg),
    lonDeg: lerp(prev.lonDeg, curr.lonDeg),
    altMeters: lerp(prev.altMeters, curr.altMeters),
    rollRad: lerpAngle(prev.rollRad, curr.rollRad),
    pitchRad: lerpAngle(prev.pitchRad, curr.pitchRad),
    headingRad: lerpAngle(prev.headingRad, curr.headingRad),
    airspeedKts: lerp(prev.airspeedKts, curr.airspeedKts),
    verticalSpeedFps: lerp(prev.verticalSpeedFps, curr.verticalSpeedFps),
    throttleNorm: lerp(prev.throttleNorm, curr.throttleNorm),
  };
}

export function headingDegFromRad(rad: number): number {
  return ((rad * (180 / Math.PI)) % 360 + 360) % 360;
}

export function feetToMeters(ft: number): number {
  return ft * 0.3048;
}

export function degreesToRadians(deg: number): number {
  return deg * DEG_TO_RAD;
}
