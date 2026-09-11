/**
 * Casual auto-trim: when that axis's stick is centered, drive the matching
 * trim wheel so the aircraft holds the last hands-off attitude. Trim is
 * summed with the stick in the C172 FCS, so the wheel can take the speed-
 * change and spiral-stability loads without turning the stick into an autopilot.
 *
 * Signs follow the stick: positive elevator / pitch-trim pitches the nose
 * down, so a nose-high error reduces pitch trim. Positive aileron / roll-trim
 * rolls right, so a left-of-target bank increases roll trim.
 */

export interface AutoTrimState {
  enabled: boolean;
  hasTarget: boolean;
  targetRad: number;
  /** Owned trim while enabled; null means adopt the incoming wheel position. */
  trim: number | null;
}

export const STICK_DEADBAND = 0.05;
/** Full-scale trim travel in about three seconds. */
const MAX_TRIM_RATE = 0.35;
/** Trim units / s per radian of attitude error. */
const AXIS_KP = 1.8;
/** Trim units / s per rad/s of rate, opposing the error. */
const AXIS_KD = 0.35;
const MAX_ERROR = 30 * Math.PI / 180;

export function createAutoTrimState(enabled: boolean): AutoTrimState {
  return { enabled, hasTarget: false, targetRad: 0, trim: null };
}

export function setAutoTrimEnabled(state: AutoTrimState, enabled: boolean): AutoTrimState {
  if (state.enabled === enabled) return state;
  return createAutoTrimState(enabled);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wrapAngle(value: number): number {
  return ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function stepAutoTrimAxis(
  state: AutoTrimState,
  input: {
    dt: number;
    measuredRad: number;
    rateRad: number;
    stick: number;
    trim: number;
    onGround: boolean;
    /** +1 if positive trim increases `measuredRad`. */
    trimSign: number;
    authority: number;
  },
): { state: AutoTrimState; trim: number } {
  const incoming = clamp(finite(input.trim), -1, 1);
  if (!state.enabled) {
    return { state: createAutoTrimState(false), trim: incoming };
  }

  const dt = Math.max(0, finite(input.dt));
  const measuredRad = finite(input.measuredRad);
  const rateRad = finite(input.rateRad);
  const stick = finite(input.stick);
  const trim = state.trim === null ? incoming : clamp(finite(state.trim), -1, 1);
  const stickOut = Math.abs(stick) > STICK_DEADBAND;

  if (dt === 0 || input.onGround || stickOut) {
    return {
      state: {
        enabled: true,
        hasTarget: !input.onGround,
        targetRad: measuredRad,
        trim,
      },
      trim,
    };
  }

  const targetRad = state.hasTarget ? state.targetRad : measuredRad;
  const error = clamp(wrapAngle(targetRad - measuredRad), -MAX_ERROR, MAX_ERROR);
  const authority = clamp(finite(input.authority, 1), 0, 1);
  const alongMeasured = (AXIS_KP * error - AXIS_KD * rateRad) * authority;
  const delta = clamp(input.trimSign * alongMeasured * dt, -MAX_TRIM_RATE * dt, MAX_TRIM_RATE * dt);
  const nextTrim = clamp(trim + delta, -1, 1);

  return {
    state: {
      enabled: true,
      hasTarget: true,
      targetRad,
      trim: nextTrim,
    },
    trim: nextTrim,
  };
}

export interface PitchAutoTrimInput {
  dt: number;
  pitchRad: number;
  pitchRateRad: number;
  rollRad: number;
  elevator: number;
  pitchTrim: number;
  onGround: boolean;
}

export function stepPitchAutoTrim(state: AutoTrimState, input: PitchAutoTrimInput): {
  state: AutoTrimState;
  pitchTrim: number;
} {
  const next = stepAutoTrimAxis(state, {
    dt: input.dt,
    measuredRad: input.pitchRad,
    rateRad: input.pitchRateRad,
    stick: input.elevator,
    trim: input.pitchTrim,
    onGround: input.onGround,
    trimSign: -1,
    // Banked flight needs back-pressure that should not be trimmed in.
    authority: Math.cos(finite(input.rollRad)) ** 2,
  });
  return { state: next.state, pitchTrim: next.trim };
}

export interface RollAutoTrimInput {
  dt: number;
  rollRad: number;
  rollRateRad: number;
  aileron: number;
  rollTrim: number;
  onGround: boolean;
}

export function stepRollAutoTrim(state: AutoTrimState, input: RollAutoTrimInput): {
  state: AutoTrimState;
  rollTrim: number;
} {
  const next = stepAutoTrimAxis(state, {
    dt: input.dt,
    measuredRad: input.rollRad,
    rateRad: input.rollRateRad,
    stick: input.aileron,
    trim: input.rollTrim,
    onGround: input.onGround,
    trimSign: 1,
    authority: 1,
  });
  return { state: next.state, rollTrim: next.trim };
}
