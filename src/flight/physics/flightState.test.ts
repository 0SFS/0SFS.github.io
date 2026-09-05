import { describe, expect, it } from "vitest";
import { interpolateFlightState } from "./flightState";

describe("interpolateFlightState", () => {
  it("returns current state when previous is null", () => {
    const curr = {
      latDeg: 45,
      lonDeg: -93,
      altMeters: 300,
      rollRad: 0,
      pitchRad: 0.1,
      headingRad: 1,
      airspeedKts: 90,
      verticalSpeedFps: 5,
      throttleNorm: 0.5,
    };
    expect(interpolateFlightState(null, curr, 0.5)).toEqual(curr);
  });

  it("interpolates scalars and shortest-angle rotation at alpha=0.5", () => {
    const prev = {
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
    const curr = {
      latDeg: 10,
      lonDeg: 20,
      altMeters: 1000,
      rollRad: 0,
      pitchRad: 0.2,
      headingRad: Math.PI / 2,
      airspeedKts: 100,
      verticalSpeedFps: 10,
      throttleNorm: 1,
    };
    const mid = interpolateFlightState(prev, curr, 0.5);
    expect(mid.latDeg).toBeCloseTo(5);
    expect(mid.altMeters).toBeCloseTo(500);
    expect(mid.headingRad).toBeCloseTo(Math.PI / 4);
    expect(mid.airspeedKts).toBeCloseTo(50);
  });
});
