import { describe, expect, it, vi } from "vitest";
import {
  createWheelSpinState, stepWheelSpin, WHEEL_SPIN_CONFIGS,
  type WheelSpinInput,
} from "./wheelSpin";
import { createWheelSpinExperiment } from "./createWheelSpinExperiment";

const main = WHEEL_SPIN_CONFIGS[1];
const input = (overrides: Partial<WheelSpinInput> = {}): WheelSpinInput => ({
  onGround: true, rollMetersSec: 20, normalLoadNewtons: 2_000,
  compressionMeters: 0.04, steeringRad: 0, brake: 0, ...overrides,
});

describe("wheel spin feedback", () => {
  it("turns contact work into the expected virtual wheel energy without overshooting rolling speed", () => {
    const state = createWheelSpinState();
    // A deliberately long step forces the solver to cross the rolling target
    // in one call. It must stop there rather than oscillate past it.
    stepWheelSpin(state, main, input(), 0.25, "inertia");
    const target = 20 / main.radiusMeters;
    const rotationalEnergy = 0.5 * main.inertiaKgMetersSquared * target ** 2;
    expect(state.omegaRadSec).toBeCloseTo(target, 10);
    expect(state.slipMetersSec).toBeCloseTo(0, 10);
    // With prescribed contact speed and no brake, the dissipated virtual
    // slip energy equals the wheel's increase in rotational kinetic energy.
    expect(state.slipPowerWatts * 0.25).toBeCloseTo(rotationalEnergy, 6);
    expect(state.angleRad).toBeGreaterThanOrEqual(0);
    expect(state.angleRad).toBeLessThan(2 * Math.PI);
  });

  it("gives baseline A immediate rolling with no spin-up slip or cue", () => {
    const state = createWheelSpinState();
    stepWheelSpin(state, main, input(), 1 / 120, "instant");
    expect(state.omegaRadSec).toBeCloseTo(20 / main.radiusMeters, 12);
    expect(state.slipMetersSec).toBe(0);
    expect(state.slipPowerWatts).toBe(0);
  });

  it("uses load to control spin-up time and remains finite for invalid input", () => {
    const lowLoad = createWheelSpinState();
    const highLoad = createWheelSpinState();
    for (let step = 0; step < 3; step += 1) {
      stepWheelSpin(lowLoad, main, input({ normalLoadNewtons: 100 }), 1 / 120, "inertia");
      stepWheelSpin(highLoad, main, input({ normalLoadNewtons: 4_000 }), 1 / 120, "inertia");
    }
    expect(highLoad.omegaRadSec).toBeGreaterThan(lowLoad.omegaRadSec);
    const invalid = createWheelSpinState();
    stepWheelSpin(invalid, { ...main, radiusMeters: NaN, inertiaKgMetersSquared: Infinity },
      input({ rollMetersSec: NaN, normalLoadNewtons: Infinity, compressionMeters: Infinity, steeringRad: NaN }), Infinity, "inertia");
    expect(invalid).toEqual(createWheelSpinState());
  });

  it("retains rotation through a bounce and brakes to rest without reversing", () => {
    const state = createWheelSpinState();
    stepWheelSpin(state, main, input(), 0.25, "inertia");
    const rolling = state.omegaRadSec;
    stepWheelSpin(state, main, input({ onGround: false, brake: 0 }), 0.1, "inertia");
    expect(state.onGround).toBe(false);
    expect(state.omegaRadSec).toBeGreaterThan(0);
    expect(state.omegaRadSec).toBeLessThan(rolling);
    stepWheelSpin(state, main, input({ onGround: false, brake: 1 }), 0.25, "inertia");
    expect(state.omegaRadSec).toBeGreaterThanOrEqual(0);
    for (let step = 0; step < 4; step += 1) {
      stepWheelSpin(state, main, input({ onGround: false, brake: 1 }), 0.25, "inertia");
    }
    expect(state.omegaRadSec).toBe(0);
  });

  it("keeps a braking wheel locked when available friction cannot overcome brake torque", () => {
    const state = createWheelSpinState();
    stepWheelSpin(state, { ...main, maxBrakeTorqueNewtonMeters: 10_000 }, input({ brake: 1 }), 0.25, "inertia");
    expect(state.omegaRadSec).toBe(0);
    expect(state.slipMetersSec).toBe(20);
    expect(state.slipPowerWatts).toBeGreaterThan(0);
  });
});

describe("JSBSim wheel-spin adapter", () => {
  it("only reads contact telemetry, ignores airborne velocity, and estimates load from the C172 strut", () => {
    const values: Record<string, number> = {
      "fcs/left-brake-cmd-norm": 0, "fcs/right-brake-cmd-norm": 0,
      "gear/unit[0]/WOW": 0, "gear/unit[1]/WOW": 1, "gear/unit[2]/WOW": 0,
      "gear/unit[1]/compression-ft": 0.1, "gear/unit[1]/compression-velocity-fps": 0,
      "gear/unit[1]/wheel-speed-fps": 60,
    };
    const getPropertyValue = vi.fn((name: string) => values[name] ?? 0);
    const experiment = createWheelSpinExperiment({ getPropertyValue } as never);
    experiment.step(1 / 120, "inertia");
    const [nose, left, right] = experiment.getStates();
    expect(nose.onGround).toBe(false);
    expect(nose.omegaRadSec).toBe(0);
    expect(right.onGround).toBe(false);
    expect(left.onGround).toBe(true);
    expect(left.compressionMeters).toBeCloseTo(0.03048, 8);
    expect(left.omegaRadSec).toBeGreaterThan(0);
    expect(getPropertyValue).not.toHaveBeenCalledWith("gear/unit[0]/wheel-speed-fps");
    expect(getPropertyValue).not.toHaveBeenCalledWith("gear/unit[2]/wheel-speed-fps");
  });
});
