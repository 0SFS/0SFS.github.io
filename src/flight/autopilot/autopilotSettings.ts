/**
 * Autopilot preferences, kept in the osfs.autopilot.* parameters. The HUD
 * Autopilot button engages this package; it does not pick axes. Axis
 * ownership is decided here, then the control arbiter applies it each physics
 * step.
 */

import {
  flightParameterDefaults,
  type FlightParameterId,
  type FlightParameters,
  type FlightParameterStore,
  type FlightParameterValues,
} from "../settings/flightParameters";

export type AutopilotBackend = "ours" | "ardupilot";
export type AutopilotThrottleMode = "airspeed" | "hold";
export type AutopilotAxisId = "roll" | "pitch" | "yaw" | "throttle" | "gear" | "flaps";

export interface AutopilotAxes {
  roll: boolean;
  pitch: boolean;
  yaw: boolean;
  throttle: boolean;
  gear: boolean;
  flaps: boolean;
}

export interface AutopilotSettingsV1 {
  version: 1;
  backend: AutopilotBackend;
  axes: AutopilotAxes;
  throttleMode: AutopilotThrottleMode;
}

export const AUTOPILOT_AXIS_IDS = [
  "roll", "pitch", "yaw", "throttle", "gear", "flaps",
] as const satisfies readonly AutopilotAxisId[];

export const AUTOPILOT_AXIS_COPY: Record<AutopilotAxisId, { label: string; hint: string }> = {
  roll: { label: "Roll", hint: "Stabilizes bank with the ailerons." },
  pitch: { label: "Pitch", hint: "Holds pitch attitude with the elevator." },
  yaw: { label: "Yaw / rudder", hint: "Yaw damper and heading hold with the rudder." },
  throttle: { label: "Throttle", hint: "Auto-throttle using the behaviour below." },
  gear: { label: "Landing gear", hint: "Holds the gear lever while AP is engaged." },
  flaps: { label: "Flaps", hint: "Holds flap position while AP is engaged." },
};

const axisParameterId = (axis: AutopilotAxisId) => `osfs.autopilot.axes.${axis}` as const;

/** Every osfs.autopilot.* parameter the Autopilot tab's own controls edit. */
export const AUTOPILOT_PARAMETER_IDS: readonly FlightParameterId[] = [
  "osfs.autopilot.backend",
  ...AUTOPILOT_AXIS_IDS.map(axisParameterId),
  "osfs.autopilot.throttleMode",
];

/** The package as its parameters set it. */
export function readAutopilotSettings(parameters: FlightParameters): AutopilotSettingsV1 {
  const axes = {} as AutopilotAxes;
  for (const id of AUTOPILOT_AXIS_IDS) axes[id] = parameters.get(axisParameterId(id));
  return {
    version: 1,
    backend: parameters.get("osfs.autopilot.backend"),
    axes,
    throttleMode: parameters.get("osfs.autopilot.throttleMode"),
  };
}

/** Settings as parameter values, to write with `setMany`. */
export function autopilotParameterValues(settings: AutopilotSettingsV1): Partial<FlightParameterValues> {
  const values: Partial<Record<FlightParameterId, unknown>> = {
    "osfs.autopilot.backend": settings.backend,
    "osfs.autopilot.throttleMode": settings.throttleMode,
  };
  for (const id of AUTOPILOT_AXIS_IDS) values[axisParameterId(id)] = settings.axes[id];
  return values as Partial<FlightParameterValues>;
}

export const DEFAULT_AUTOPILOT_SETTINGS: Readonly<AutopilotSettingsV1> = Object.freeze(readAutopilotSettings(flightParameterDefaults()));
export const DEFAULT_AUTOPILOT_AXES: Readonly<AutopilotAxes> = Object.freeze({ ...DEFAULT_AUTOPILOT_SETTINGS.axes });

export type AutopilotSettingsParse =
  | { ok: true; settings: AutopilotSettingsV1; migrated: boolean }
  | { ok: false; reason: string };

function isBackend(value: unknown): value is AutopilotBackend {
  return value === "ours" || value === "ardupilot";
}

function isThrottleMode(value: unknown): value is AutopilotThrottleMode {
  return value === "airspeed" || value === "hold";
}

function isBoolean(value: unknown): value is boolean {
  return value === true || value === false;
}

export function allAutopilotAxesEnabled(axes: AutopilotAxes): boolean {
  return AUTOPILOT_AXIS_IDS.every((id) => axes[id]);
}

export function parseAutopilotSettings(value: unknown): AutopilotSettingsParse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "Settings must be an object." };
  }
  const input = value as Record<string, unknown>;
  if (input.version !== undefined && input.version !== 1) {
    return {
      ok: false,
      reason: typeof input.version === "number" && input.version > 1
        ? "Saved by a newer version of the game."
        : "Unknown settings version.",
    };
  }
  let migrated = input.version === undefined;
  const axes = { ...DEFAULT_AUTOPILOT_AXES };
  const rawAxes = input.axes;
  if (typeof rawAxes === "object" && rawAxes !== null && !Array.isArray(rawAxes)) {
    for (const id of AUTOPILOT_AXIS_IDS) {
      const flag = (rawAxes as Record<string, unknown>)[id];
      if (isBoolean(flag)) axes[id] = flag;
      else migrated = true;
    }
  } else {
    migrated = true;
  }
  const backend = isBackend(input.backend) ? input.backend : DEFAULT_AUTOPILOT_SETTINGS.backend;
  if (input.backend !== backend) migrated = true;
  const throttleMode = isThrottleMode(input.throttleMode)
    ? input.throttleMode
    : DEFAULT_AUTOPILOT_SETTINGS.throttleMode;
  if (input.throttleMode !== throttleMode) migrated = true;
  return {
    ok: true,
    settings: { version: 1, backend, axes, throttleMode },
    migrated,
  };
}

export function patchAutopilotSettings(
  settings: AutopilotSettingsV1,
  patch: Partial<Omit<AutopilotSettingsV1, "version">>,
): AutopilotSettingsV1 {
  const next = {
    ...settings,
    ...patch,
    axes: { ...settings.axes, ...(patch.axes ?? {}) },
    version: 1 as const,
  };
  const parsed = parseAutopilotSettings(next);
  return parsed.ok ? parsed.settings : settings;
}

export function withAllAutopilotAxes(settings: AutopilotSettingsV1): AutopilotSettingsV1 {
  return patchAutopilotSettings(settings, { axes: { ...DEFAULT_AUTOPILOT_AXES } });
}

/** The record the settings used before the registry; migrated once, and kept for rollback. */
export const AUTOPILOT_SETTINGS_STORAGE_KEY = "osfs.autopilot.v1";

/** The parameters an old record held, or null when it means nothing here, as from a newer version. */
export function migrateAutopilotSettings(raw: string): Partial<FlightParameterValues> | null {
  let stored: unknown;
  try { stored = JSON.parse(raw) as unknown; } catch { return null; }
  const parsed = parseAutopilotSettings(stored);
  return parsed.ok ? autopilotParameterValues(parsed.settings) : null;
}

export interface AutopilotSettingsStore {
  readonly settings: AutopilotSettingsV1;
  /** Non-null when changes will not survive a reload. */
  readonly readOnlyReason: string | null;
  set(settings: AutopilotSettingsV1): void;
}

/** The package over its parameters: a stable snapshot until one of them changes. */
export function createAutopilotSettingsStore(parameters: FlightParameterStore): AutopilotSettingsStore {
  let settings = readAutopilotSettings(parameters);
  const current = (): AutopilotSettingsV1 => {
    const next = readAutopilotSettings(parameters);
    if (JSON.stringify(next) !== JSON.stringify(settings)) settings = next;
    return settings;
  };
  return {
    get settings() { return current(); },
    get readOnlyReason() { return parameters.storageError(); },
    set(next) {
      const parsed = parseAutopilotSettings(next);
      if (!parsed.ok) return;
      parameters.setMany(autopilotParameterValues(parsed.settings));
    },
  };
}
