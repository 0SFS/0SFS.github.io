import type { JSBSimSdk } from "@felipegalind0/jsbsim";
import { describe, expect, it, vi } from "vitest";
import { bootstrapAircraft, bootstrapC172p } from "./bootstrapC172";
import { FIXED_DT } from "../physics/fixedStepLoop";

describe("bootstrapC172p", () => {
  it("starts the engine and re-evaluates requested controls before returning", async () => {
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
    expect(events.slice(-2)).toEqual(["fcs/throttle-cmd-norm=0.65", "runIc"]);
    expect(sdk.runIc).toHaveBeenCalledTimes(2);
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

describe("native model capabilities", () => {
  function sdkWithCatalog(catalog: string[]) {
    return {
      configurePaths: vi.fn(), loadModel: vi.fn(() => true),
      setDt: vi.fn(), getDeltaT: vi.fn(() => FIXED_DT),
      getPropertyCatalog: vi.fn(() => catalog),
      runIc: vi.fn(() => true), setPropertyValue: vi.fn(),
    };
  }

  it.each([
    { catalog: [] },
    { catalog: ["propulsion/engine/body-force-z-lbs (RW)"] },
    { catalog: ["propulsion/engine[1]/body-force-z-lbs (R)"] },
  ])("rejects absent or writable substitutes before evaluating the aircraft: $catalog", async ({ catalog }) => {
    const sdk = sdkWithCatalog(catalog);
    await expect(bootstrapAircraft(sdk as unknown as JSBSimSdk, "f-35b"))
      .rejects.toThrow("Install a compatible JSBSim SDK and matching aircraft data");
    expect(sdk.setDt).not.toHaveBeenCalled();
    expect(sdk.setPropertyValue).not.toHaveBeenCalled();
    expect(sdk.runIc).not.toHaveBeenCalled();
  });

  it.each(["propulsion/engine/body-force-z-lbs", "propulsion/engine[0]/body-force-z-lbs"])(
    "accepts the native read-only engine-zero spelling %s", async path => {
      const sdk = sdkWithCatalog([`${path} (R)`]);
      await bootstrapAircraft(sdk as unknown as JSBSimSdk, "f-35b");
      expect(sdk.runIc).toHaveBeenCalledTimes(2);
    },
  );
});
