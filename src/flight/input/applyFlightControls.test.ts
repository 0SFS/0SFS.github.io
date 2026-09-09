import { describe, expect, it, vi } from "vitest";
import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { applyFlightControls } from "./applyFlightControls";

describe("applyFlightControls", () => {
  it("applies all normalized controls directly, converting yaw exactly once", () => {
    const setPropertyValue = vi.fn();
    applyFlightControls({ setPropertyValue } as unknown as JSBSimSdk, {
      elevator: -0.32, aileron: 0.45, rudder: 0.6,
      throttle: 0.83, pitchTrim: -0.16, flaps: 0.33, brake: 0.8,
    });
    expect(setPropertyValue.mock.calls).toEqual([
      ["fcs/elevator-cmd-norm", -0.32],
      ["fcs/aileron-cmd-norm", 0.45],
      ["fcs/rudder-cmd-norm", -0.6],
      ["fcs/throttle-cmd-norm", 0.83],
      ["fcs/pitch-trim-cmd-norm", -0.16],
      ["fcs/flap-cmd-norm", 0.33],
      ["fcs/brake-cmd-norm", 0.8],
      ["fcs/left-brake-cmd-norm", 0.8],
      ["fcs/right-brake-cmd-norm", 0.8],
    ]);
  });
});
