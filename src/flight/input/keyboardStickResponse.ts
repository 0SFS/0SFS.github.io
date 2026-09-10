import type { KeyboardStickSettings } from "./keyboardStickSettings";

export type KeyboardAxis = "aileron" | "elevator" | "rudder";

export interface BodyRatesRad {
  rollRateRad: number;
  pitchRateRad: number;
  yawRateRad: number;
}

/** Linear stick integrator state for one keyboard axis. */
export interface KeyboardAxisState {
  position: number;
  holdTime: number;
  integral: number;
  lastError: number;
}

export function createKeyboardAxisState(position = 0): KeyboardAxisState {
  return { position, holdTime: 0, integral: 0, lastError: 0 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function moveToward(current: number, goal: number, maxDelta: number): number {
  const delta = goal - current;
  if (Math.abs(delta) <= maxDelta) return goal;
  return current + Math.sign(delta) * maxDelta;
}

/** Map linear stick amount through an RC-style expo curve. */
export function applyStickExpo(value: number, expo: number): number {
  const e = clamp(expo, 0, 1);
  if (e === 0 || value === 0) return value;
  const x = clamp(value, -1, 1);
  return x * (1 - e) + x * x * x * e;
}

/**
 * Convert a "seconds to ~95%" slider into an exponential approach rate.
 * Three time constants ≈ 95% of a step response.
 */
function approachRate(secondsTo95: number): number {
  return 3 / Math.max(0.05, secondsTo95);
}

function commandedAssistRate(
  axis: KeyboardAxis,
  direction: number,
  settings: KeyboardStickSettings,
): number {
  const deg = axis === "aileron" ? settings.assistRollRateDeg
    : axis === "elevator" ? settings.assistPitchRateDeg
      : settings.assistYawRateDeg;
  return direction * deg * (Math.PI / 180);
}

function measuredAssistRate(axis: KeyboardAxis, rates: BodyRatesRad | null): number {
  if (!rates) return 0;
  // Elevator +1 is nose-down, which is negative body pitch rate in JSBSim.
  // Flip q so positive measured rate aligns with positive stick.
  if (axis === "aileron") return rates.rollRateRad;
  if (axis === "elevator") return -rates.pitchRateRad;
  return rates.yawRateRad;
}

/**
 * Advance one keyboard stick axis.
 * `direction` is -1, 0, or +1 from the currently held keys.
 * Returns linear position; callers apply expo at the output boundary.
 */
export function stepKeyboardAxis(
  axis: KeyboardAxis,
  state: KeyboardAxisState,
  direction: number,
  dt: number,
  settings: KeyboardStickSettings,
  rates: BodyRatesRad | null,
): KeyboardAxisState {
  const dir = direction < 0 ? -1 : direction > 0 ? 1 : 0;
  const safeDt = Math.max(0, dt);

  if (settings.mode === "direct") {
    return {
      position: dir,
      holdTime: dir === 0 ? 0 : state.holdTime + safeDt,
      integral: 0,
      lastError: 0,
    };
  }

  if (settings.mode === "smooth") {
    const goal = dir;
    const rate = approachRate(dir === 0 ? settings.smoothReturnSec : settings.smoothResponseSec);
    const position = state.position + (goal - state.position) * Math.min(1, rate * safeDt);
    return {
      position,
      holdTime: dir === 0 ? 0 : state.holdTime + safeDt,
      integral: 0,
      lastError: 0,
    };
  }

  if (settings.mode === "rate") {
    const maxDef = settings.rateMaxDeflection;
    let position = clamp(state.position, -maxDef, maxDef);
    let holdTime = state.holdTime;

    if (dir === 0) {
      holdTime = 0;
      position = moveToward(position, 0, (1 / Math.max(0.05, settings.rateTimeToCenter)) * safeDt);
    } else {
      holdTime += safeDt;
      let speed = 1 / Math.max(0.1, settings.rateTimeToFull);
      if (holdTime > settings.rateAccelAfterSec) {
        const blend = Math.min(
          1,
          (holdTime - settings.rateAccelAfterSec) / Math.max(0.2, settings.rateAccelAfterSec || 0.2),
        );
        speed *= 1 + (settings.rateAccelMultiplier - 1) * blend;
      }
      // Reversing through center should feel snappy, not mushy.
      if (position !== 0 && Math.sign(position) !== dir) {
        speed = Math.max(speed, 1 / Math.max(0.05, settings.rateTimeToCenter));
      }
      position = clamp(position + dir * speed * safeDt, -maxDef, maxDef);
    }

    return { position, holdTime, integral: 0, lastError: 0 };
  }

  // Flight assist: keys command a body rate; PID writes stick deflection.
  const maxDef = settings.assistMaxDeflection;
  const commanded = commandedAssistRate(axis, dir, settings);
  const measured = measuredAssistRate(axis, rates);
  const error = commanded - measured;
  const integral = clamp(state.integral + error * safeDt, -2, 2);
  const derivative = safeDt > 0 ? (error - state.lastError) / safeDt : 0;
  const raw = settings.assistKp * error
    + settings.assistKi * integral
    + settings.assistKd * derivative;
  const position = clamp(raw, -maxDef, maxDef);

  return {
    position,
    holdTime: dir === 0 ? 0 : state.holdTime + safeDt,
    integral: dir === 0 && Math.abs(error) < 0.02 ? integral * 0.9 : integral,
    lastError: error,
  };
}
