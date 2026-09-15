/**
 * Casual trim assist: move the matching trim wheel so leftover pitch/roll
 * moment stays near zero — including while the stick is flying that axis.
 *
 * Stick and trim sum in the FCS, so JSBSim has no separate "imbalance"
 * property. The leftover acceleration is reconstructed from the current
 * `pdot`/`qdot` after removing the stick's control power and the aero rate
 * damping. Driving that residual to zero is the trim definition: with the
 * stick released the aircraft is not trying to rotate. Control power scales
 * with `qbar`, so a dive does not suddenly gain loop authority.
 *
 * This is not attitude hold and not the HUD Autopilot. Master AP lives in
 * `src/flight/autopilot/` and drives surfaces/throttle when engaged. These
 * TRIM squares only run while AP does not own that axis.
 *
 * Signs follow the stick: positive elevator / pitch-trim pitches the nose
 * down (negative qdot). Positive aileron / roll-trim rolls right (positive
 * pdot).
 */

export interface AutoTrimState {
  enabled: boolean;
  /** Owned trim while enabled; null means adopt the incoming wheel position. */
  trim: number | null;
  /** Filtered leftover acceleration, rad/s²; null until the first airborne sample. */
  filteredHandsOff: number | null;
}

export const STICK_DEADBAND = 0.05;
/** Full-scale trim travel in about three seconds. */
const MAX_TRIM_RATE = 0.35;
/** Inverse seconds: fraction of the leftover acceleration to cancel per second. */
const NEWTON = 1.25;
const ACCEL_DEADBAND = 0.04;
const FILTER_TAU = 0.08;
const QBAR_AUTHORITY_PSF = 20;
const MIN_VT_FPS = 80;
/**
 * |∂(rad/s²)/∂trim| per psf. SF50 pitch is about 0.028, roll about 0.018;
 * a slightly high estimate makes the Newton step conservative.
 */
const PITCH_POWER_PER_PSF = 0.03;
const ROLL_POWER_PER_PSF = 0.02;
/**
 * Rate damping D in `accel += -D * rate`, with D = coeff * qbar / vt.
 * Slightly under the SF50 Cmq/Clp values so a sustained rate is not fought.
 */
const PITCH_DAMPING_QBAR_OVER_VT = 2.2;
const ROLL_DAMPING_QBAR_OVER_VT = 2.5;

export function createAutoTrimState(enabled: boolean): AutoTrimState {
  return { enabled, trim: null, filteredHandsOff: null };
}

export function setAutoTrimEnabled(state: AutoTrimState, enabled: boolean): AutoTrimState {
  if (state.enabled === enabled) return state;
  return createAutoTrimState(enabled);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function stepAutoTrimAxis(
  state: AutoTrimState,
  input: {
    dt: number;
    accelRad: number;
    rateRad: number;
    stick: number;
    trim: number;
    qbarPsf: number;
    vtFps: number;
    onGround: boolean;
    /** +1 if positive trim increases the measured acceleration. */
    trimSign: number;
    powerPerPsf: number;
    dampingQbarOverVt: number;
  },
): { state: AutoTrimState; trim: number } {
  const incoming = clamp(finite(input.trim), -1, 1);
  if (!state.enabled) {
    return { state: createAutoTrimState(false), trim: incoming };
  }

  const dt = Math.max(0, finite(input.dt));
  const trim = state.trim === null ? incoming : clamp(finite(state.trim), -1, 1);
  const accelRad = finite(input.accelRad);
  const hold = {
    state: { enabled: true, trim, filteredHandsOff: state.filteredHandsOff } satisfies AutoTrimState,
    trim,
  };
  if (dt === 0 || input.onGround) return hold;

  const qbar = Math.max(0, finite(input.qbarPsf));
  const authority = clamp(qbar / QBAR_AUTHORITY_PSF, 0, 1);
  if (authority === 0) {
    return {
      state: { enabled: true, trim, filteredHandsOff: accelRad },
      trim,
    };
  }

  const vt = Math.max(finite(input.vtFps), MIN_VT_FPS);
  const qbarEff = Math.max(qbar, QBAR_AUTHORITY_PSF);
  const power = input.trimSign * input.powerPerPsf * qbarEff;
  const damping = Math.max(0, finite(input.dampingQbarOverVt)) * qbarEff / vt;
  const stick = clamp(finite(input.stick), -1, 1);
  const rawHandsOff = accelRad - power * stick + damping * finite(input.rateRad);
  const previous = state.filteredHandsOff;
  const blend = 1 - Math.exp(-dt / FILTER_TAU);
  const filtered = previous === null ? rawHandsOff : previous + (rawHandsOff - previous) * blend;
  const leftover = Math.abs(filtered) < ACCEL_DEADBAND ? 0 : filtered;
  const delta = clamp(
    -NEWTON * authority * leftover / power * dt,
    -MAX_TRIM_RATE * dt,
    MAX_TRIM_RATE * dt,
  );
  const nextTrim = clamp(trim + delta, -1, 1);

  return {
    state: {
      enabled: true,
      trim: nextTrim,
      filteredHandsOff: filtered,
    },
    trim: nextTrim,
  };
}

export interface PitchAutoTrimInput {
  dt: number;
  pitchAccelRad: number;
  pitchRateRad: number;
  elevator: number;
  pitchTrim: number;
  qbarPsf: number;
  vtFps: number;
  onGround: boolean;
}

export function stepPitchAutoTrim(state: AutoTrimState, input: PitchAutoTrimInput): {
  state: AutoTrimState;
  pitchTrim: number;
} {
  const next = stepAutoTrimAxis(state, {
    dt: input.dt,
    accelRad: input.pitchAccelRad,
    rateRad: input.pitchRateRad,
    stick: input.elevator,
    trim: input.pitchTrim,
    qbarPsf: input.qbarPsf,
    vtFps: input.vtFps,
    onGround: input.onGround,
    trimSign: -1,
    powerPerPsf: PITCH_POWER_PER_PSF,
    dampingQbarOverVt: PITCH_DAMPING_QBAR_OVER_VT,
  });
  return { state: next.state, pitchTrim: next.trim };
}

export interface RollAutoTrimInput {
  dt: number;
  rollAccelRad: number;
  rollRateRad: number;
  aileron: number;
  rollTrim: number;
  qbarPsf: number;
  vtFps: number;
  onGround: boolean;
}

export function stepRollAutoTrim(state: AutoTrimState, input: RollAutoTrimInput): {
  state: AutoTrimState;
  rollTrim: number;
} {
  const next = stepAutoTrimAxis(state, {
    dt: input.dt,
    accelRad: input.rollAccelRad,
    rateRad: input.rollRateRad,
    stick: input.aileron,
    trim: input.rollTrim,
    qbarPsf: input.qbarPsf,
    vtFps: input.vtFps,
    onGround: input.onGround,
    trimSign: 1,
    powerPerPsf: ROLL_POWER_PER_PSF,
    dampingQbarOverVt: ROLL_DAMPING_QBAR_OVER_VT,
  });
  return { state: next.state, rollTrim: next.trim };
}
