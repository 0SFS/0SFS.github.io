// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { createFlightInputManager } from "./flightInputManager";

describe("flightInputManager keyboard roll", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: vi.fn(() => []),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["KeyA", 1],
    ["KeyD", -1],
  ])("maps %s to the expected JSBSim aileron sign", (code, expectedSign) => {
    const input = createFlightInputManager();
    const detach = input.attach(window);

    window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    const controls = input.poll(1);

    expect(Math.sign(controls.aileron)).toBe(expectedSign);
    detach();
  });

  it.each(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])("ignores %s", (code) => {
    const input = createFlightInputManager();
    const detach = input.attach(window);

    window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    const controls = input.poll(1);

    expect(controls.elevator).toBe(0);
    expect(controls.aileron).toBe(0);
    detach();
  });

  it("starts at the C172 bootstrap throttle and writes it to JSBSim", () => {
    const input = createFlightInputManager();
    const setPropertyValue = vi.fn();
    const sdk = { setPropertyValue } as unknown as JSBSimSdk;

    const controls = input.poll(1 / 60);
    input.apply(sdk, controls);

    expect(controls.throttle).toBe(0.65);
    expect(setPropertyValue).toHaveBeenCalledWith("fcs/throttle-cmd-norm", 0.65);
  });

  it.each([
    [-0.5, 0],
    [0.72, 0.72],
    [1.5, 1],
  ])("clamps slider throttle %s to %s", (requested, expected) => {
    const input = createFlightInputManager();

    input.setThrottle(requested);

    expect(input.poll(1 / 60).throttle).toBe(expected);
  });

  it("raises throttle while Shift is held", () => {
    const input = createFlightInputManager();
    const detach = input.attach(window);

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ShiftLeft" }));
    const controls = input.poll(0.5);

    expect(controls.throttle).toBeCloseTo(0.9);
    detach();
  });
});