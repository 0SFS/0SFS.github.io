import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { describe, expect, it, vi } from "vitest";
import { readContactDiagnostics } from "./contactDiagnostics";
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

describe("contact diagnostics", () => {
  it("reports the terrain the gear was standing on and how deep it was through it", () => {
    // A gear-spring launch and an aerodynamic divergence both end as an
    // impossible airspeed; only the terrain elevation tells them apart.
    const properties: Record<string, number> = {
      "position/terrain-elevation-asl-ft": 3500 / 0.3048,
      "gear/unit[0]/compression-ft": 240 / 0.3048,
      "gear/unit[0]/WOW": 1,
    };
    const sdk = {
      getPropertyValue: vi.fn((property: string) => properties[property] ?? 0),
    } as unknown as JSBSimSdk;

    const contact = readContactDiagnostics(sdk, 3260, 3400);
    expect(contact.terrainElevationMeters).toBeCloseTo(3500, 2);
    expect(contact.aglBeforeMeters).toBeCloseTo(-240, 2);
    expect(contact.aglAfterMeters).toBeCloseTo(-100, 2);
    expect(contact.gearCompressionMeters[0]).toBeCloseTo(240, 2);
    expect(contact.weightOnWheels).toEqual([true, false, false]);
  });
});
