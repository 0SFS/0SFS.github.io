import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { describe, expect, it, vi } from "vitest";
import { createFixedStepPhysicsLoop, FIXED_DT } from "./fixedStepLoop";

describe("fixedStepPhysicsLoop pause", () => {
  it("does not advance JSBSim while paused", () => {
    const run = vi.fn(() => true);
    const sdk = {
      run,
      getPropertyValue: vi.fn((key: string) => key === "position/h-sl-ft" ? 1000 : 0),
    } as unknown as JSBSimSdk;
    const loop = createFixedStepPhysicsLoop(sdk);

    const runningState = loop.update(FIXED_DT, vi.fn());
    loop.setPaused(true);
    const pausedState = loop.update(FIXED_DT * 4, vi.fn());

    expect(run).toHaveBeenCalledTimes(1);
    expect(pausedState.altMeters).toBe(runningState.altMeters);
    expect(pausedState.latDeg).toBe(runningState.latDeg);
  });
});

it("seeds interpolation with the new position on reset, including while paused", () => {
  let latitude = 10;
  const sdk = { run: () => true, getPropertyValue: (key: string) => key === "position/lat-geod-deg" ? latitude : key === "position/h-sl-ft" ? 1000 : 0 } as unknown as JSBSimSdk;
  const loop = createFixedStepPhysicsLoop(sdk);
  loop.update(FIXED_DT, () => {});
  latitude = 46.7867;
  loop.reset();
  expect(loop.update(0, () => {}).latDeg).toBe(latitude);
  loop.setPaused(true);
  expect(loop.update(10, () => {}).latDeg).toBe(latitude);
});
