import { describe, expect, it } from "vitest";
import { invalidFlightStateReasons, validFlightState } from "./safeFlightState";
import type { FlightState } from "./flightState";

const ok: FlightState = {
  latDeg: 37.6, lonDeg: -122.4, altMeters: 500, rollRad: 0, pitchRad: 0,
  headingRad: 0, airspeedKts: 90, verticalSpeedFps: 0, throttleNorm: 0.5,
};

describe("invalid flight state reasons", () => {
  it("says nothing about a state inside the envelope", () => {
    expect(invalidFlightStateReasons(ok)).toEqual([]);
    expect(validFlightState(ok)).toBe(true);
  });

  it("names the field that went non-finite", () => {
    const reasons = invalidFlightStateReasons({ ...ok, airspeedKts: NaN });
    expect(reasons).toContain("airspeedKts is NaN");
    expect(validFlightState({ ...ok, airspeedKts: NaN })).toBe(false);
  });

  it("names each envelope breach with its value", () => {
    expect(invalidFlightStateReasons({ ...ok, latDeg: 120 })[0]).toMatch(/latDeg 120\.0000 outside/);
    expect(invalidFlightStateReasons({ ...ok, altMeters: 250000 })[0]).toMatch(/altMeters 250000\.0 beyond/);
    expect(invalidFlightStateReasons({ ...ok, airspeedKts: 2000 })[0]).toMatch(/airspeedKts 2000\.0 beyond/);
    expect(invalidFlightStateReasons({ ...ok, verticalSpeedFps: -9000 })[0]).toMatch(/verticalSpeedFps -9000\.0 beyond/);
  });

  it("reports every breach, not only the first", () => {
    const reasons = invalidFlightStateReasons({ ...ok, latDeg: 120, airspeedKts: 9000 });
    expect(reasons).toHaveLength(2);
  });
});
