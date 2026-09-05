export type InputModePreference = "auto" | "mouse" | "trackpad" | "touch";

export interface MovementSensitivity {
  pan: number;
  orbit: number;
  zoom: number;
}

export interface InputSensitivitySettings {
  mouse: MovementSensitivity;
  trackpad: MovementSensitivity;
  touch: MovementSensitivity;
}

export interface InputSettings {
  mode: InputModePreference;
  sensitivity: InputSensitivitySettings;
}

export const DEFAULT_INPUT_SENSITIVITY: InputSensitivitySettings = {
  mouse: { pan: 1, orbit: 1, zoom: 1 },
  trackpad: { pan: 1, orbit: 1, zoom: 1 },
  touch: { pan: 1, orbit: 1, zoom: 1 },
};

export const MOVEMENT_SENSITIVITY_BASE = 0.1;

export const DEFAULT_INPUT_SETTINGS: InputSettings = {
  mode: "auto",
  sensitivity: DEFAULT_INPUT_SENSITIVITY,
};

export function clampSensitivity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.1, Math.min(10, value));
}

export function normalizeSensitivitySettings(
  settings: Partial<InputSensitivitySettings>,
): InputSensitivitySettings {
  return {
    mouse: {
      pan: clampSensitivity(settings.mouse?.pan ?? DEFAULT_INPUT_SENSITIVITY.mouse.pan),
      orbit: clampSensitivity(settings.mouse?.orbit ?? DEFAULT_INPUT_SENSITIVITY.mouse.orbit),
      zoom: clampSensitivity(settings.mouse?.zoom ?? DEFAULT_INPUT_SENSITIVITY.mouse.zoom),
    },
    trackpad: {
      pan: clampSensitivity(settings.trackpad?.pan ?? DEFAULT_INPUT_SENSITIVITY.trackpad.pan),
      orbit: clampSensitivity(settings.trackpad?.orbit ?? DEFAULT_INPUT_SENSITIVITY.trackpad.orbit),
      zoom: clampSensitivity(settings.trackpad?.zoom ?? DEFAULT_INPUT_SENSITIVITY.trackpad.zoom),
    },
    touch: {
      pan: clampSensitivity(settings.touch?.pan ?? DEFAULT_INPUT_SENSITIVITY.touch.pan),
      orbit: clampSensitivity(settings.touch?.orbit ?? DEFAULT_INPUT_SENSITIVITY.touch.orbit),
      zoom: clampSensitivity(settings.touch?.zoom ?? DEFAULT_INPUT_SENSITIVITY.touch.zoom),
    },
  };
}