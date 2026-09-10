// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  applyStickExpo,
  createKeyboardAxisState,
  stepKeyboardAxis,
} from "./keyboardStickResponse";
import {
  DEFAULT_KEYBOARD_STICK_SETTINGS,
  normalizeKeyboardStickSettings,
  type KeyboardStickSettings,
} from "./keyboardStickSettings";
import { createFlightInputManager } from "./flightInputManager";

function settings(partial: Partial<KeyboardStickSettings>): KeyboardStickSettings {
  return normalizeKeyboardStickSettings({ ...DEFAULT_KEYBOARD_STICK_SETTINGS, ...partial });
}

describe("keyboard stick response", () => {
  it("applies expo without changing endpoints", () => {
    expect(applyStickExpo(0, 0.5)).toBe(0);
    expect(applyStickExpo(1, 0.5)).toBe(1);
    expect(applyStickExpo(-1, 1)).toBe(-1);
    expect(Math.abs(applyStickExpo(0.5, 0.5))).toBeLessThan(0.5);
  });

  it("snaps immediately in direct mode", () => {
    const next = stepKeyboardAxis(
      "aileron",
      createKeyboardAxisState(),
      1,
      1 / 60,
      settings({ mode: "direct" }),
      null,
    );
    expect(next.position).toBe(1);
  });

  it("ramps at a constant base rate", () => {
    let state = createKeyboardAxisState();
    const cfg = settings({
      mode: "rate",
      rateTimeToFull: 1,
      rateAccelAfterSec: 10,
      rateMaxDeflection: 1,
    });
    for (let i = 0; i < 30; i += 1) {
      state = stepKeyboardAxis("elevator", state, 1, 0.01, cfg, null);
    }
    expect(state.position).toBeCloseTo(0.3, 2);
  });

  it("accelerates after a long hold in rate mode", () => {
    const cfg = settings({
      mode: "rate",
      rateTimeToFull: 1,
      rateAccelAfterSec: 0.1,
      rateAccelMultiplier: 3,
      rateMaxDeflection: 1,
    });
    let slow = createKeyboardAxisState();
    let fast = createKeyboardAxisState();
    for (let i = 0; i < 10; i += 1) {
      slow = stepKeyboardAxis("aileron", slow, 1, 0.01, { ...cfg, rateAccelAfterSec: 10 }, null);
      fast = stepKeyboardAxis("aileron", fast, 1, 0.01, cfg, null);
    }
    // After accel starts, the accelerated stick should pull ahead.
    for (let i = 0; i < 20; i += 1) {
      slow = stepKeyboardAxis("aileron", slow, 1, 0.01, { ...cfg, rateAccelAfterSec: 10 }, null);
      fast = stepKeyboardAxis("aileron", fast, 1, 0.01, cfg, null);
    }
    expect(fast.position).toBeGreaterThan(slow.position);
  });

  it("uses PID output in assist mode", () => {
    const cfg = settings({
      mode: "assist",
      assistRollRateDeg: 57.2957795, // 1 rad/s
      assistKp: 1,
      assistKi: 0,
      assistKd: 0,
      assistMaxDeflection: 1,
    });
    const next = stepKeyboardAxis(
      "aileron",
      createKeyboardAxisState(),
      1,
      0.1,
      cfg,
      { rollRateRad: 0, pitchRateRad: 0, yawRateRad: 0 },
    );
    expect(next.position).toBeCloseTo(1, 5);
  });
});

describe("flightInputManager keyboard modes", () => {
  it("preserves legacy smooth response as the default", () => {
    const input = createFlightInputManager();
    const detach = input.attach(window);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));
    expect(input.poll(1).aileron).toBeCloseTo(1, 2);
    detach();
  });

  it("centers instantly in direct mode", () => {
    const input = createFlightInputManager({
      keyboardStickSettings: settings({ mode: "direct" }),
    });
    const detach = input.attach(window);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    expect(input.poll(0).elevator).toBe(1);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
    expect(input.poll(0).elevator).toBe(0);
    detach();
  });

  it("updates settings live", () => {
    const input = createFlightInputManager({
      keyboardStickSettings: settings({ mode: "direct" }),
    });
    const detach = input.attach(window);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA" }));
    expect(input.poll(0).aileron).toBe(-1);
    input.setKeyboardStickSettings(settings({
      mode: "rate",
      rateTimeToFull: 1,
      rateAccelAfterSec: 10,
    }));
    // Mode change keeps current position, then rate continues from there.
    expect(input.poll(0.1).aileron).toBeCloseTo(-1, 2);
    detach();
  });
});
