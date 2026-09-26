import {
  flightParameterDefaults,
  flightParameterSpec,
  type FlightParameterId,
  type FlightParameters,
  type FlightParameterValues,
} from "../settings/flightParameters";

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

const NUMBER_FIELDS = [
  "expo", "smoothResponseSec", "smoothReturnSec", "rateTimeToFull", "rateTimeToCenter",
  "rateAccelAfterSec", "rateAccelMultiplier", "rateMaxDeflection", "assistRollRateDeg",
  "assistPitchRateDeg", "assistYawRateDeg", "assistKp", "assistKi", "assistKd", "assistMaxDeflection",
] as const satisfies readonly (keyof KeyboardStickSettings)[];

type NumberField = (typeof NUMBER_FIELDS)[number];

/** The osfs.input.keyboard.* parameter that holds a field. */
export function keyboardStickParameterId<Field extends keyof KeyboardStickSettings>(field: Field) {
  return `osfs.input.keyboard.${field}` as const;
}

/** Every osfs.input.keyboard.* id, for the section that edits them. */
export const KEYBOARD_STICK_PARAMETER_IDS: readonly FlightParameterId[] = [
  keyboardStickParameterId("mode"),
  ...NUMBER_FIELDS.map(keyboardStickParameterId),
];

/** The keyboard stick as the osfs.input.keyboard.* parameters set it. */
export function readKeyboardStickSettings(parameters: FlightParameters): KeyboardStickSettings {
  const settings = { mode: parameters.get(keyboardStickParameterId("mode")) } as KeyboardStickSettings;
  for (const field of NUMBER_FIELDS) settings[field] = parameters.get(keyboardStickParameterId(field));
  return settings;
}

/** Settings as parameter values, to write with `setMany`. */
export function keyboardStickParameterValues(settings: Partial<KeyboardStickSettings>): Partial<FlightParameterValues> {
  const values: Partial<Record<FlightParameterId, unknown>> = {};
  for (const [field, value] of Object.entries(settings)) {
    if (value !== undefined) values[keyboardStickParameterId(field as keyof KeyboardStickSettings)] = value;
  }
  return values as Partial<FlightParameterValues>;
}

/** The catalogue's defaults, which reproduce the previous hardcoded exponential filter (rate ≈ 8). */
export const DEFAULT_KEYBOARD_STICK_SETTINGS: KeyboardStickSettings = readKeyboardStickSettings(flightParameterDefaults());

const MODES = new Set<KeyboardStickMode>(["direct", "smooth", "rate", "assist"]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(field: NumberField, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_KEYBOARD_STICK_SETTINGS[field];
  const spec = flightParameterSpec(keyboardStickParameterId(field));
  const bounds = "bounds" in spec ? spec.bounds() : null;
  return bounds ? clamp(value, bounds.min, bounds.max) : value;
}

/** Fills missing fields with the defaults and keeps numbers inside the parameters' bounds. */
export function normalizeKeyboardStickSettings(
  partial: Partial<KeyboardStickSettings> | null | undefined,
): KeyboardStickSettings {
  const mode = partial?.mode && MODES.has(partial.mode) ? partial.mode : DEFAULT_KEYBOARD_STICK_SETTINGS.mode;
  const settings = { mode } as KeyboardStickSettings;
  for (const field of NUMBER_FIELDS) settings[field] = finite(field, partial?.[field]);
  return settings;
}
