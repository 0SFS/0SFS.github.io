import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { describe, expect, it, vi } from "vitest";
import { createFixedStepPhysicsLoop, FIXED_DT } from "./fixedStepLoop";

describe("fixedStepPhysicsLoop pause", () => {
  it("does not advance JSBSim while paused", () => {
    const run = vi.fn(() => true);
    const sdk = {
      run,
      getPropertyValue: vi.fn(() => 0),
    } as unknown as JSBSimSdk;
    const loop = createFixedStepPhysicsLoop(sdk);

    const runningState = loop.update(FIXED_DT, vi.fn());
    loop.setPaused(true);
    const pausedState = loop.update(FIXED_DT * 4, vi.fn());

    expect(run).toHaveBeenCalledTimes(1);
    expect(pausedState).toEqual(runningState);
  });
});