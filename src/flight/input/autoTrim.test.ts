import { describe, expect, it } from "vitest";
import {
  createAutoTrimState,
  setAutoTrimEnabled,
  stepPitchAutoTrim,
  stepRollAutoTrim,
  STICK_DEADBAND,
  type PitchAutoTrimInput,
  type RollAutoTrimInput,
} from "./autoTrim";

const PITCH_HOLD: PitchAutoTrimInput = {
  dt: 1 / 120,
  pitchRad: 0.08,
  pitchRateRad: 0,
  rollRad: 0,
  elevator: 0,
  pitchTrim: 0.1,
  onGround: false,
};

const ROLL_HOLD: RollAutoTrimInput = {
  dt: 1 / 120,
  rollRad: 0.2,
  rollRateRad: 0,
  aileron: 0,
  rollTrim: 0.1,
  onGround: false,
};

function stepPitch(state = createAutoTrimState(true), input: Partial<PitchAutoTrimInput> = {}) {
  return stepPitchAutoTrim(state, { ...PITCH_HOLD, ...input });
}

function stepRoll(state = createAutoTrimState(true), input: Partial<RollAutoTrimInput> = {}) {
  return stepRollAutoTrim(state, { ...ROLL_HOLD, ...input });
}

describe("pitch auto-trim", () => {
  it("leaves the wheel alone when disabled, and forgets any captured target", () => {
    const armed = stepPitch().state;
    const next = stepPitch(setAutoTrimEnabled(armed, false), { pitchTrim: -0.4, pitchRad: 0.3 });
    expect(next.pitchTrim).toBe(-0.4);
    expect(next.state).toEqual(createAutoTrimState(false));
  });

  it("adopts the current wheel position the first time it runs", () => {
    const next = stepPitch(createAutoTrimState(true), { pitchTrim: 0.22 });
    expect(next.state.trim).toBe(0.22);
    expect(next.pitchTrim).toBe(0.22);
  });

  it("captures the current pitch when enabled with the stick centered", () => {
    const next = stepPitch(createAutoTrimState(true), { pitchRad: 0.12 });
    expect(next.state.hasTarget).toBe(true);
    expect(next.state.targetRad).toBe(0.12);
  });

  it("moves trim nose-down (positive) when the nose is above the target", () => {
    const held = stepPitch(createAutoTrimState(true), { pitchRad: 0.1 });
    const next = stepPitch(held.state, { pitchRad: 0.18, pitchTrim: held.pitchTrim });
    expect(next.pitchTrim).toBeGreaterThan(held.pitchTrim);
  });

  it("moves trim nose-up (negative) when the nose is below the target", () => {
    const held = stepPitch(createAutoTrimState(true), { pitchRad: 0.1, pitchTrim: 0 });
    const next = stepPitch(held.state, { pitchRad: 0.02, pitchTrim: held.pitchTrim });
    expect(next.pitchTrim).toBeLessThan(held.pitchTrim);
  });

  it("does not move the wheel while the stick is flying the pitch", () => {
    const held = stepPitch(createAutoTrimState(true), { pitchRad: 0.1, pitchTrim: 0.2 });
    const next = stepPitch(held.state, {
      elevator: STICK_DEADBAND + 0.01,
      pitchRad: 0.25,
      pitchTrim: held.pitchTrim,
    });
    expect(next.pitchTrim).toBe(held.pitchTrim);
    expect(next.state.targetRad).toBe(0.25);
  });

  it("does not trim on the ground", () => {
    const held = stepPitch(createAutoTrimState(true), { pitchRad: 0.1, pitchTrim: -0.15 });
    const next = stepPitch(held.state, { onGround: true, pitchRad: 0.4, pitchTrim: held.pitchTrim });
    expect(next.pitchTrim).toBe(held.pitchTrim);
    expect(next.state.hasTarget).toBe(false);
  });

  it("clamps the wheel to the trim range", () => {
    let result = stepPitch(createAutoTrimState(true), { pitchRad: 0, pitchTrim: 0.99 });
    for (let i = 0; i < 240; i += 1) {
      result = stepPitch(result.state, { pitchRad: 0.5, pitchTrim: result.pitchTrim });
    }
    expect(result.pitchTrim).toBe(1);
  });

  it("holds pitch against a steady nose-down moment better than a frozen wheel", () => {
    const dt = 1 / 120;
    const speedMoment = 0.35;
    const plant = (auto: boolean) => {
      let pitch = 0.1;
      let rate = 0;
      let trim = 0;
      let state = createAutoTrimState(auto);
      for (let i = 0; i < 600; i += 1) {
        const next = stepPitchAutoTrim(state, {
          dt, pitchRad: pitch, pitchRateRad: rate, rollRad: 0,
          elevator: 0, pitchTrim: trim, onGround: false,
        });
        state = next.state;
        trim = next.pitchTrim;
        rate += (-2.8 * trim - 4 * rate - speedMoment) * dt;
        pitch += rate * dt;
      }
      return { pitch, trim };
    };

    const frozen = plant(false);
    const held = plant(true);
    expect(Math.abs(held.pitch - 0.1)).toBeLessThan(Math.abs(frozen.pitch - 0.1) * 0.35);
    expect(held.trim).toBeLessThan(0);
  });
});

describe("roll auto-trim", () => {
  it("moves trim right-wing-down (positive) when the bank is left of the target", () => {
    const held = stepRoll(createAutoTrimState(true), { rollRad: 0.2 });
    const next = stepRoll(held.state, { rollRad: 0.05, rollTrim: held.rollTrim });
    expect(next.rollTrim).toBeGreaterThan(held.rollTrim);
  });

  it("moves trim left-wing-down (negative) when the bank is right of the target", () => {
    const held = stepRoll(createAutoTrimState(true), { rollRad: 0.2, rollTrim: 0 });
    const next = stepRoll(held.state, { rollRad: 0.35, rollTrim: held.rollTrim });
    expect(next.rollTrim).toBeLessThan(held.rollTrim);
  });

  it("does not move the wheel while aileron is flying the bank", () => {
    const held = stepRoll(createAutoTrimState(true), { rollRad: 0.2, rollTrim: 0.15 });
    const next = stepRoll(held.state, {
      aileron: STICK_DEADBAND + 0.01,
      rollRad: 0.5,
      rollTrim: held.rollTrim,
    });
    expect(next.rollTrim).toBe(held.rollTrim);
    expect(next.state.targetRad).toBe(0.5);
  });

  it("holds bank against a steady left-rolling moment better than a frozen wheel", () => {
    const dt = 1 / 120;
    const spiral = 0.35;
    const plant = (auto: boolean) => {
      let roll = 0.25;
      let rate = 0;
      let trim = 0;
      let state = createAutoTrimState(auto);
      for (let i = 0; i < 600; i += 1) {
        const next = stepRollAutoTrim(state, {
          dt, rollRad: roll, rollRateRad: rate, aileron: 0, rollTrim: trim, onGround: false,
        });
        state = next.state;
        trim = next.rollTrim;
        rate += (2.8 * trim - 4 * rate - spiral) * dt;
        roll += rate * dt;
      }
      return { roll, trim };
    };

    const frozen = plant(false);
    const held = plant(true);
    expect(Math.abs(held.roll - 0.25)).toBeLessThan(Math.abs(frozen.roll - 0.25) * 0.35);
    expect(held.trim).toBeGreaterThan(0);
  });
});
