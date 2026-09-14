/**
 * Persistent Autopilot preferences. The HUD Autopilot button engages this
 * package; it does not pick axes. Axis ownership is decided here, then the
 * control arbiter applies it each physics step.
 */

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

export const DEFAULT_AUTOPILOT_AXES: Readonly<AutopilotAxes> = Object.freeze({
  roll: true,
  pitch: true,
  yaw: true,
  throttle: true,
  gear: true,
  flaps: true,
});

export const DEFAULT_AUTOPILOT_SETTINGS: Readonly<AutopilotSettingsV1> = Object.freeze({
  version: 1,
  backend: "ours",
  axes: { ...DEFAULT_AUTOPILOT_AXES },
  throttleMode: "airspeed",
});

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

export interface AutopilotStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const AUTOPILOT_SETTINGS_STORAGE_KEY = "osfs.autopilot.v1";

export interface AutopilotSettingsStore {
  readonly settings: AutopilotSettingsV1;
  /** Non-null when saving is disabled, e.g. data from a newer version. */
  readonly readOnlyReason: string | null;
  set(settings: AutopilotSettingsV1): void;
}

/**
 * Best-effort localStorage persistence. Mutating calls never throw, so private
 * mode and full storage keep the sim flying.
 */
export function createAutopilotSettingsStore(storage: AutopilotStorage | null): AutopilotSettingsStore {
  let readOnlyReason: string | null = null;
  let settings: AutopilotSettingsV1 = {
    ...DEFAULT_AUTOPILOT_SETTINGS,
    axes: { ...DEFAULT_AUTOPILOT_AXES },
  };

  const read = (): unknown => {
    try {
      const text = storage?.getItem(AUTOPILOT_SETTINGS_STORAGE_KEY) ?? null;
      return text === null ? undefined : JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  };
  const write = (value: AutopilotSettingsV1): void => {
    if (readOnlyReason) return;
    try {
      storage?.setItem(AUTOPILOT_SETTINGS_STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Persistence is best-effort.
    }
  };

  const stored = read();
  if (stored !== undefined) {
    const parsed = parseAutopilotSettings(stored);
    if (parsed.ok) {
      settings = parsed.settings;
      if (parsed.migrated) write(settings);
    } else if (
      stored
      && typeof stored === "object"
      && typeof (stored as { version?: unknown }).version === "number"
      && (stored as { version: number }).version > 1
    ) {
      readOnlyReason = "Autopilot settings were saved by a newer version; changes apply to this session only.";
    }
  }

  return {
    get settings() { return settings; },
    get readOnlyReason() { return readOnlyReason; },
    set(next) {
      const parsed = parseAutopilotSettings(next);
      if (!parsed.ok) return;
      settings = parsed.settings;
      write(settings);
    },
  };
}
