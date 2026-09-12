import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { describe, expect, it, vi } from "vitest";
import { bootstrapC172p } from "./bootstrapC172";
import { FIXED_DT } from "../physics/fixedStepLoop";

describe("bootstrapC172p", () => {
  it("starts the engine with mixture and throttle after RunIC", async () => {
    const events: string[] = [];
    const sdk = {
      configurePaths: vi.fn(),
      loadModel: vi.fn(() => true),
      setDt: vi.fn(),
      getDeltaT: vi.fn(() => FIXED_DT),
      runIc: vi.fn(() => {
        events.push("runIc");
        return true;
      }),
      setPropertyValue: vi.fn((property: string, value: number) => {
        if (property === "fcs/mixture-cmd-norm" || property === "fcs/throttle-cmd-norm" || property === "propulsion/magneto_cmd" || property === "propulsion/set-running") {
          events.push(`${property}=${value}`);
        }
      }),
    } as unknown as JSBSimSdk;

    await bootstrapC172p(sdk);

    expect(sdk.setPropertyValue).toHaveBeenCalledWith("ic/h-sl-ft", 5000);
    expect(sdk.setDt).toHaveBeenCalledWith(FIXED_DT);
    expect(sdk.getDeltaT).toHaveBeenCalled();
    expect(sdk.setPropertyValue).toHaveBeenCalledWith("ic/lat-geod-deg", 44.977753);
    expect(events.slice(0, 4)).toEqual([
      "runIc",
      "fcs/throttle-cmd-norm=0.65",
      "propulsion/set-running=-1",
      "propulsion/magneto_cmd=3",
    ]);
    expect(Number(events[4]?.split("=")[1])).toBeCloseTo(1, 3);
  });

  it("fails clearly when the SDK cannot configure dt", async () => {
    const sdk = {
      configurePaths: vi.fn(),
      loadModel: vi.fn(() => true),
      runIc: vi.fn(() => true),
      setPropertyValue: vi.fn(),
    } as unknown as JSBSimSdk;

    await expect(bootstrapC172p(sdk)).rejects.toThrow("missing setDt");
    expect(sdk.setPropertyValue).not.toHaveBeenCalled();
  });
});
