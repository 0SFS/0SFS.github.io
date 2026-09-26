import { describe, expect, it } from "vitest";
import { flightParameterDefaults } from "../settings/flightParameters";
import {
  createAutoTrimState,
  readAutoTrimTuning,
  setAutoTrimEnabled,
  stepPitchAutoTrim,
  stepRollAutoTrim,
  type PitchAutoTrimInput,
  type RollAutoTrimInput,
} from "./autoTrim";

const CRUISE = { qbarPsf: 50, vtFps: 220 };
const TUNING = readAutoTrimTuning(flightParameterDefaults());

const PITCH_HOLD: PitchAutoTrimInput = {
  dt: 1 / 120,
  pitchAccelRad: 0,
  pitchRateRad: 0,
  elevator: 0,
  pitchTrim: 0.1,
  onGround: false,
  ...CRUISE,
};

const ROLL_HOLD: RollAutoTrimInput = {
  dt: 1 / 120,
  rollAccelRad: 0,
  rollRateRad: 0,
  aileron: 0,
  rollTrim: 0.1,
  onGround: false,
  ...CRUISE,
};

function stepPitch(state = createAutoTrimState(true), input: Partial<PitchAutoTrimInput> = {}) {
  return stepPitchAutoTrim(state, { ...PITCH_HOLD, ...input }, TUNING);
}

function stepRoll(state = createAutoTrimState(true), input: Partial<RollAutoTrimInput> = {}) {
  return stepRollAutoTrim(state, { ...ROLL_HOLD, ...input }, TUNING);
}

describe("pitch auto-trim", () => {
  it("leaves the wheel alone when disabled, and forgets any captured trim", () => {
    const armed = stepPitch().state;
    const next = stepPitch(setAutoTrimEnabled(armed, false), { pitchTrim: -0.4, pitchAccelRad: 0.3 });
    expect(next.pitchTrim).toBe(-0.4);
    expect(next.state).toEqual(createAutoTrimState(false));
  });

  it("adopts the current wheel position the first time it runs", () => {
    const next = stepPitch(createAutoTrimState(true), { pitchTrim: 0.22 });
    expect(next.state.trim).toBe(0.22);
    expect(next.pitchTrim).toBe(0.22);
  });

  it("moves trim nose-down (positive) when leftover qdot is nose-up", () => {
    const next = stepPitch(createAutoTrimState(true), { pitchAccelRad: 0.25, pitchTrim: 0.1 });
    expect(next.pitchTrim).toBeGreaterThan(0.1);
  });

  it("moves trim nose-up (negative) when leftover qdot is nose-down", () => {
    const next = stepPitch(createAutoTrimState(true), { pitchAccelRad: -0.25, pitchTrim: 0 });
    expect(next.pitchTrim).toBeLessThan(0);
  });

  it("still cancels leftover pitch acceleration while the stick is deflected", () => {
    const elevator = 0.45;
    const stickQdot = -0.03 * 50 * elevator;
    const matched = stepPitch(createAutoTrimState(true), {
      elevator, pitchAccelRad: stickQdot, pitchTrim: 0.1,
    });
    const leftover = stepPitch(createAutoTrimState(true), {
      elevator, pitchAccelRad: stickQdot + 0.3, pitchTrim: 0.1,
    });
    expect(matched.pitchTrim).toBeCloseTo(0.1, 3);
    expect(leftover.pitchTrim).toBeGreaterThan(0.1);
  });

  it("does not chase a pitch attitude when angular acceleration is already zero", () => {
    const held = stepPitch(createAutoTrimState(true), { pitchTrim: 0.18 });
    const next = stepPitch(held.state, { pitchAccelRad: 0, pitchTrim: held.pitchTrim });
    expect(next.pitchTrim).toBeCloseTo(held.pitchTrim, 8);
  });

  it("does not trim on the ground", () => {
    const held = stepPitch(createAutoTrimState(true), { pitchTrim: -0.15 });
    const next = stepPitch(held.state, {
      onGround: true,
      pitchAccelRad: 0.4,
      pitchTrim: held.pitchTrim,
    });
    expect(next.pitchTrim).toBe(held.pitchTrim);
  });

  it("clamps the wheel to the trim range", () => {
    let result = stepPitch(createAutoTrimState(true), { pitchTrim: 0.99 });
    for (let i = 0; i < 240; i += 1) {
      result = stepPitch(result.state, { pitchAccelRad: 0.5, pitchTrim: result.pitchTrim });
    }
    expect(result.pitchTrim).toBe(1);
  });

  it("cancels a steady nose-down moment to the same wheel whether or not the stick is held", () => {
    const dt = 1 / 120;
    const L = -1.5;
    const D = 0.5;
    const moment = 0.35;
    const plant = (elevator: number) => {
      let q = 0;
      let trim = 0;
      let state = createAutoTrimState(true);
      for (let i = 0; i < 720; i += 1) {
        const qdot = L * (elevator + trim) - D * q - moment;
        const next = stepPitchAutoTrim(state, {
          dt,
          pitchAccelRad: qdot,
          pitchRateRad: q,
          elevator,
          pitchTrim: trim,
          onGround: false,
          ...CRUISE,
        }, TUNING);
        state = next.state;
        trim = next.pitchTrim;
        q += qdot * dt;
      }
      return { q, trim };
    };

    const handsOff = plant(0);
    const flying = plant(0.4);
    expect(handsOff.trim).toBeLessThan(-0.1);
    expect(Math.abs(flying.trim - handsOff.trim)).toBeLessThan(0.08);
    expect(Math.abs(flying.trim - (handsOff.trim + 0.4))).toBeGreaterThan(0.2);
  });

  it("takes a smaller trim step for the same leftover qdot at dive qbar than at cruise", () => {
    const cruise = stepPitch(createAutoTrimState(true), {
      pitchAccelRad: 0.3, pitchTrim: 0, qbarPsf: 50, vtFps: 220,
    });
    const dive = stepPitch(createAutoTrimState(true), {
      pitchAccelRad: 0.3, pitchTrim: 0, qbarPsf: 140, vtFps: 370,
    });
    expect(Math.abs(dive.pitchTrim)).toBeLessThan(Math.abs(cruise.pitchTrim));
  });
});

describe("roll auto-trim", () => {
  it("moves trim left-wing-down (negative) when leftover pdot is rolling right", () => {
    const next = stepRoll(createAutoTrimState(true), { rollAccelRad: 0.25, rollTrim: 0.1 });
    expect(next.rollTrim).toBeLessThan(0.1);
  });

  it("moves trim right-wing-down (positive) when leftover pdot is rolling left", () => {
    const next = stepRoll(createAutoTrimState(true), { rollAccelRad: -0.25, rollTrim: 0 });
    expect(next.rollTrim).toBeGreaterThan(0);
  });

  it("still cancels leftover roll acceleration while aileron is deflected", () => {
    const aileron = 0.4;
    const stickPdot = 0.02 * 50 * aileron;
    const matched = stepRoll(createAutoTrimState(true), {
      aileron, rollAccelRad: stickPdot, rollTrim: 0.05,
    });
    const leftover = stepRoll(createAutoTrimState(true), {
      aileron, rollAccelRad: stickPdot - 0.3, rollTrim: 0.05,
    });
    expect(matched.rollTrim).toBeCloseTo(0.05, 3);
    expect(leftover.rollTrim).toBeGreaterThan(0.05);
  });

  it("does not chase bank when roll acceleration is already zero", () => {
    const held = stepRoll(createAutoTrimState(true), { rollTrim: 0.2 });
    const next = stepRoll(held.state, { rollAccelRad: 0, rollTrim: held.rollTrim });
    expect(next.rollTrim).toBeCloseTo(held.rollTrim, 8);
  });

  it("cancels a steady left-rolling moment without oscillating as qbar rises", () => {
    const dt = 1 / 120;
    const spiral = 0.35;
    let p = 0;
    let trim = 0;
    let state = createAutoTrimState(true);
    let flips = 0;
    let lastDelta = 0;
    for (let i = 0; i < 900; i += 1) {
      const qbarPsf = 40 + i * 0.12;
      const vtFps = 200 + i * 0.2;
      const L = 0.02 * Math.max(qbarPsf, 20);
      const D = 2.5 * Math.max(qbarPsf, 20) / Math.max(vtFps, 80);
      const pdot = L * trim - D * p - spiral;
      const next = stepRollAutoTrim(state, {
        dt, rollAccelRad: pdot, rollRateRad: p, aileron: 0, rollTrim: trim,
        qbarPsf, vtFps, onGround: false,
      }, TUNING);
      const delta = next.rollTrim - trim;
      if (i > 120 && lastDelta !== 0 && Math.sign(delta) !== 0 && Math.sign(delta) !== Math.sign(lastDelta)) {
        flips += 1;
      }
      lastDelta = delta;
      state = next.state;
      trim = next.rollTrim;
      p += pdot * dt;
    }
    expect(trim).toBeGreaterThan(0.1);
    expect(Math.abs(p)).toBeLessThan(0.15);
    expect(flips).toBeLessThan(6);
  });
});
