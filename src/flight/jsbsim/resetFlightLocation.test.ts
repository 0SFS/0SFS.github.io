import { describe, expect, it, vi } from "vitest";
import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { resetFlightLocation } from "./resetFlightLocation";

describe("resetFlightLocation", () => {
  function setup(success = true) {
    const values: Record<string, number> = {
      "position/lat-geod-deg": 1, "position/long-gc-deg": 2,
      "position/h-sl-ft": 10000, "velocities/vc-kts": 120, "attitude/psi-deg": 300,
      "fcs/throttle-cmd-norm": 0.65,
    };
    const sdk = {
      resetToInitialConditions: vi.fn(),
      getPropertyValue: (key: string) => values[key] ?? 0,
      setPropertyValue: vi.fn((key: string, value: number) => { values[key] = value; }),
      runIc: vi.fn(() => {
        values["position/lat-geod-deg"] = values["ic/lat-geod-deg"];
        values["position/long-gc-deg"] = values["ic/long-gc-deg"];
        return success;
      }),
    };
    return sdk;
  }
  it("resets the loaded aircraft using geodetic latitude and retains altitude/speed", () => {
    const sdk = setup();
    const state = resetFlightLocation(sdk as unknown as JSBSimSdk, { latDeg: 46.7867, lonDeg: -92.1005 });
    expect(sdk.setPropertyValue).toHaveBeenCalledWith("ic/lat-geod-deg", 46.7867);
    expect(sdk.setPropertyValue).toHaveBeenCalledWith("ic/long-gc-deg", -92.1005);
    expect(sdk.setPropertyValue).toHaveBeenCalledWith("ic/h-sl-ft", 10000);
    expect(sdk.setPropertyValue).toHaveBeenCalledWith("ic/vc-kts", 120);
    expect(sdk.runIc).toHaveBeenCalledOnce();
    expect(state).toMatchObject({ latDeg: 46.7867, lonDeg: -92.1005, altMeters: 3048 });
  });
  it("sets runway departure heading, ground elevation, gear, brakes and zero ground speed", () => {
    const sdk = setup();
    resetFlightLocation(sdk as unknown as JSBSimSdk, { latDeg: 45, lonDeg: -93, altMeters: 300,
      flightPreset: { mode: "departure", headingDeg: 90, groundElevationMeters: 300, flightPathDeg: 0 } });
    expect(sdk.setPropertyValue).toHaveBeenCalledWith("ic/terrain-elevation-ft", 300 / 0.3048);
    expect(sdk.setPropertyValue).toHaveBeenCalledWith("ic/h-sl-ft", 301.5 / 0.3048);
    expect(sdk.setPropertyValue).toHaveBeenCalledWith("ic/psi-true-deg", 90);
    expect(sdk.setPropertyValue).toHaveBeenCalledWith("ic/vg-fps", 0);
    expect(sdk.setPropertyValue).toHaveBeenCalledWith("fcs/left-brake-cmd-norm", 1);
    expect(sdk.setPropertyValue).toHaveBeenCalledWith("fcs/throttle-cmd-norm", 0);
  });
  it("sets arrival altitude and C172 approach speed, releasing the departure brakes", () => {
    const sdk = setup();
    resetFlightLocation(sdk as unknown as JSBSimSdk, { latDeg: 45, lonDeg: -93, altMeters: 800,
      flightPreset: { mode: "arrival", headingDeg: 270, groundElevationMeters: 300, flightPathDeg: -3 } });
    expect(sdk.setPropertyValue).toHaveBeenCalledWith("ic/h-sl-ft", 800 / 0.3048);
    expect(sdk.setPropertyValue).toHaveBeenCalledWith("ic/vc-kts", 75);
    expect(sdk.setPropertyValue).toHaveBeenCalledWith("ic/gamma-deg", -3);
    expect(sdk.setPropertyValue).toHaveBeenCalledWith("fcs/left-brake-cmd-norm", 0);
    expect(sdk.setPropertyValue).toHaveBeenCalledWith("fcs/throttle-cmd-norm", 0.35);
  });
  it("rejects invalid input before mutating JSBSim and reports RunIC failure", () => {
    const sdk = setup(false);
    expect(() => resetFlightLocation(sdk as unknown as JSBSimSdk, { latDeg: NaN, lonDeg: 0 })).toThrow("Invalid");
    expect(sdk.setPropertyValue).not.toHaveBeenCalled();
    expect(() => resetFlightLocation(sdk as unknown as JSBSimSdk, { latDeg: 45, lonDeg: 0 })).toThrow("JSBSim");
  });
});
