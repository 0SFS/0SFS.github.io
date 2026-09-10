/** How WASD/QE move the simulated stick. */
export type KeyboardStickMode = "direct" | "smooth" | "rate" | "assist";

export interface KeyboardStickSettings {
  mode: KeyboardStickMode;
  /** Softens small keyboard deflections; 0 = linear, 1 = strong cubic expo. */
  expo: number;
  /** Smooth: approximate seconds from center to ~95% of a held deflection. */
  smoothResponseSec: number;
  /** Smooth: approximate seconds from full deflection back to center. */
  smoothReturnSec: number;
  /** Rate: seconds from center to full at the base hold rate. */
  rateTimeToFull: number;
  /** Rate: seconds from full back to center after release. */
  rateTimeToCenter: number;
  /** Rate: hold duration before acceleration begins. */
  rateAccelAfterSec: number;
  /** Rate: peak rate multiplier after a long hold. */
  rateAccelMultiplier: number;
  /** Rate: maximum |deflection| keyboard may reach. */
  rateMaxDeflection: number;
  /** Assist: commanded roll rate at full aileron key, deg/s. */
  assistRollRateDeg: number;
  /** Assist: commanded pitch rate at full elevator key, deg/s. */
  assistPitchRateDeg: number;
  /** Assist: commanded yaw rate at full rudder key, deg/s. */
  assistYawRateDeg: number;
  assistKp: number;
  assistKi: number;
  assistKd: number;
  assistMaxDeflection: number;
}

export const KEYBOARD_STICK_MODES: readonly {
  id: KeyboardStickMode;
  label: string;
  description: string;
}[] = [
  {
    id: "direct",
    label: "Direct",
    description: "Keys snap the stick to full deflection immediately.",
  },
  {
    id: "smooth",
    label: "Smooth target",
    description: "Keys set a target; the stick eases toward it exponentially.",
  },
  {
    id: "rate",
    label: "Rate ramp",
    description: "Keys move the stick at a tunable rate that can accelerate with hold time.",
  },
  {
    id: "assist",
    label: "Flight assist",
    description: "Keys command pitch/roll/yaw rates; a PID drives the stick to match them.",
  },
];

/** Defaults reproduce the previous hardcoded exponential filter (rate ≈ 8). */
export const DEFAULT_KEYBOARD_STICK_SETTINGS: KeyboardStickSettings = {
  mode: "smooth",
  expo: 0,
  smoothResponseSec: 0.375,
  smoothReturnSec: 0.375,
  rateTimeToFull: 0.6,
  rateTimeToCenter: 0.25,
  rateAccelAfterSec: 0.35,
  rateAccelMultiplier: 2.5,
  rateMaxDeflection: 1,
  assistRollRateDeg: 45,
  assistPitchRateDeg: 20,
  assistYawRateDeg: 20,
  assistKp: 0.8,
  assistKi: 0.15,
  assistKd: 0.02,
  assistMaxDeflection: 1,
};

const PREFERENCE_KEY = "osfs.keyboard-stick";

const MODES = new Set<KeyboardStickMode>(["direct", "smooth", "rate", "assist"]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

export function normalizeKeyboardStickSettings(
  partial: Partial<KeyboardStickSettings> | null | undefined,
): KeyboardStickSettings {
  const d = DEFAULT_KEYBOARD_STICK_SETTINGS;
  const mode = partial?.mode && MODES.has(partial.mode) ? partial.mode : d.mode;
  return {
    mode,
    expo: finite(partial?.expo, d.expo, 0, 1),
    smoothResponseSec: finite(partial?.smoothResponseSec, d.smoothResponseSec, 0.05, 3),
    smoothReturnSec: finite(partial?.smoothReturnSec, d.smoothReturnSec, 0.05, 3),
    rateTimeToFull: finite(partial?.rateTimeToFull, d.rateTimeToFull, 0.1, 5),
    rateTimeToCenter: finite(partial?.rateTimeToCenter, d.rateTimeToCenter, 0.05, 3),
    rateAccelAfterSec: finite(partial?.rateAccelAfterSec, d.rateAccelAfterSec, 0, 3),
    rateAccelMultiplier: finite(partial?.rateAccelMultiplier, d.rateAccelMultiplier, 1, 8),
    rateMaxDeflection: finite(partial?.rateMaxDeflection, d.rateMaxDeflection, 0.1, 1),
    assistRollRateDeg: finite(partial?.assistRollRateDeg, d.assistRollRateDeg, 5, 180),
    assistPitchRateDeg: finite(partial?.assistPitchRateDeg, d.assistPitchRateDeg, 5, 90),
    assistYawRateDeg: finite(partial?.assistYawRateDeg, d.assistYawRateDeg, 5, 90),
    assistKp: finite(partial?.assistKp, d.assistKp, 0, 5),
    assistKi: finite(partial?.assistKi, d.assistKi, 0, 2),
    assistKd: finite(partial?.assistKd, d.assistKd, 0, 1),
    assistMaxDeflection: finite(partial?.assistMaxDeflection, d.assistMaxDeflection, 0.1, 1),
  };
}

export function loadKeyboardStickSettings(): KeyboardStickSettings {
  try {
    const raw = window.localStorage.getItem(PREFERENCE_KEY);
    if (!raw) return { ...DEFAULT_KEYBOARD_STICK_SETTINGS };
    return normalizeKeyboardStickSettings(JSON.parse(raw) as Partial<KeyboardStickSettings>);
  } catch {
    return { ...DEFAULT_KEYBOARD_STICK_SETTINGS };
  }
}

export function saveKeyboardStickSettings(settings: KeyboardStickSettings): void {
  try {
    window.localStorage.setItem(PREFERENCE_KEY, JSON.stringify(normalizeKeyboardStickSettings(settings)));
  } catch {
    // Preference persistence is best-effort.
  }
}
