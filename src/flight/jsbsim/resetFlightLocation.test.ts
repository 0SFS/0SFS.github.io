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
  it("rejects invalid input before mutating JSBSim and reports RunIC failure", () => {
    const sdk = setup(false);
    expect(() => resetFlightLocation(sdk as unknown as JSBSimSdk, { latDeg: NaN, lonDeg: 0 })).toThrow("Invalid");
    expect(sdk.setPropertyValue).not.toHaveBeenCalled();
    expect(() => resetFlightLocation(sdk as unknown as JSBSimSdk, { latDeg: 45, lonDeg: 0 })).toThrow("JSBSim");
  });
});
