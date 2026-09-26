import {
  flightParameterDefaults,
  type FlightParameterId,
  type FlightParameters,
  type FlightParameterStore,
  type FlightParameterValues,
} from "../settings/flightParameters";

/**
 * Validated sound settings, kept in the osfs.sound.* parameters.
 *
 * Two rules come straight from sound.md §6 and shape everything here: a stored
 * preference must never restore louder sound than the pilot last heard, and a
 * downgrade persists until an explicit re-test. So `requested` is the pilot's
 * ask, `effective` is a runtime fact that is never stored, and `enabled`
 * defaults off because a saved preference cannot satisfy autoplay anyway.
 */

/** Auto starts at Low and only moves up to a qualified tier. */
export type AudioQualityId = "off" | "low" | "med" | "high" | "auto";

export const AUDIO_QUALITY_IDS: readonly AudioQualityId[] = ["off", "low", "med", "high", "auto"];

export const AUDIO_QUALITY_LABELS: Record<AudioQualityId, string> = {
  off: "Off",
  low: "Low",
  med: "Med",
  high: "High",
  auto: "Auto",
};

export interface AudioSettingsV1 {
  version: 1;
  /** Master switch. Off releases DSP resources and silences engine and tire. */
  enabled: boolean;
  requested: AudioQualityId;
  masterVolume: number;
  engineVolume: number;
  /** Airframe wind and gear/flap turbulence, independent of engine volume and mute. */
  airframeVolume: number;
  // Tire volume keeps its existing home, ground-interaction `tireAudioVolume`:
  // one control rather than two that could disagree.
  engineMuted: boolean;
  reducedDynamicRange: boolean;
  /** Set when a fallback dropped the tier; cleared only by an explicit re-test. */
  downgradedFrom: AudioQualityId | null;
}


export type AudioSettingsParse =
  | { ok: true; settings: AudioSettingsV1; migrated: boolean }
  | { ok: false; reason: string };

const isQuality = (value: unknown): value is AudioQualityId =>
  typeof value === "string" && (AUDIO_QUALITY_IDS as readonly string[]).includes(value);

const unit = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

export function parseAudioSettings(value: unknown): AudioSettingsParse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "Settings must be an object." };
  }
  const input = value as Record<string, unknown>;
  if (input.version !== undefined && input.version !== 1) {
    return {
      ok: false,
      reason: typeof input.version === "number" && input.version > 1
        ? "Saved by a newer version of the game." : "Unknown settings version.",
    };
  }
  let migrated = input.version === undefined;
  const settings: AudioSettingsV1 = { ...DEFAULT_AUDIO_SETTINGS };

  if (typeof input.enabled === "boolean") settings.enabled = input.enabled;
  else if (input.enabled !== undefined) migrated = true;

  if (isQuality(input.requested)) settings.requested = input.requested;
  else if (input.requested !== undefined) migrated = true;

  settings.masterVolume = unit(input.masterVolume, DEFAULT_AUDIO_SETTINGS.masterVolume);
  settings.engineVolume = unit(input.engineVolume, DEFAULT_AUDIO_SETTINGS.engineVolume);
  settings.airframeVolume = unit(input.airframeVolume, DEFAULT_AUDIO_SETTINGS.airframeVolume);
  if (input.masterVolume !== settings.masterVolume || input.engineVolume !== settings.engineVolume
    || input.airframeVolume !== settings.airframeVolume) migrated = true;

  settings.engineMuted = input.engineMuted === true;
  settings.reducedDynamicRange = input.reducedDynamicRange === true;
  settings.downgradedFrom = isQuality(input.downgradedFrom) ? input.downgradedFrom : null;

  return { ok: true, settings, migrated };
}

export function patchAudioSettings(
  settings: AudioSettingsV1, patch: Partial<Omit<AudioSettingsV1, "version">>,
): AudioSettingsV1 {
  const parsed = parseAudioSettings({ ...settings, ...patch, version: 1 });
  if (!parsed.ok) return settings;
  const next = parsed.settings;
  // Parsing falls back to DEFAULTS for an invalid field. A patch falls back to
  // the CURRENT value instead: bad input changes nothing rather than resetting
  // a volume the pilot chose.
  const input = patch as Record<string, unknown>;
  if ("enabled" in input && typeof input.enabled !== "boolean") next.enabled = settings.enabled;
  if ("requested" in input && !isQuality(input.requested)) next.requested = settings.requested;
  if ("engineMuted" in input && typeof input.engineMuted !== "boolean") {
    next.engineMuted = settings.engineMuted;
  }
  if ("reducedDynamicRange" in input && typeof input.reducedDynamicRange !== "boolean") {
    next.reducedDynamicRange = settings.reducedDynamicRange;
  }
  if ("downgradedFrom" in input && input.downgradedFrom !== null && !isQuality(input.downgradedFrom)) {
    next.downgradedFrom = settings.downgradedFrom;
  }
  for (const key of ["masterVolume", "engineVolume", "airframeVolume"] as const) {
    const value = input[key];
    if (key in input && !(typeof value === "number" && Number.isFinite(value))) next[key] = settings[key];
  }
  return next;
}

/** The parameters the settings are kept in, by field. */
const PARAMETER_IDS = {
  enabled: "osfs.sound.enabled",
  requested: "osfs.sound.quality",
  masterVolume: "osfs.sound.masterVolume",
  engineVolume: "osfs.sound.engineVolume",
  airframeVolume: "osfs.sound.airframeVolume",
  engineMuted: "osfs.sound.engineMuted",
  reducedDynamicRange: "osfs.sound.reducedDynamicRange",
  downgradedFrom: "osfs.sound.downgradedFrom",
} as const satisfies Record<Exclude<keyof AudioSettingsV1, "version">, FlightParameterId>;

export const AUDIO_PARAMETER_IDS: readonly FlightParameterId[] = Object.values(PARAMETER_IDS);

/** The settings as their osfs.sound.* parameters set them. */
export function readAudioSettings(parameters: FlightParameters): AudioSettingsV1 {
  const downgradedFrom = parameters.get(PARAMETER_IDS.downgradedFrom);
  return {
    version: 1,
    enabled: parameters.get(PARAMETER_IDS.enabled),
    requested: parameters.get(PARAMETER_IDS.requested),
    masterVolume: parameters.get(PARAMETER_IDS.masterVolume),
    engineVolume: parameters.get(PARAMETER_IDS.engineVolume),
    airframeVolume: parameters.get(PARAMETER_IDS.airframeVolume),
    engineMuted: parameters.get(PARAMETER_IDS.engineMuted),
    reducedDynamicRange: parameters.get(PARAMETER_IDS.reducedDynamicRange),
    downgradedFrom: downgradedFrom === "none" ? null : downgradedFrom,
  };
}

/** The catalogue's defaults. */
export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioSettingsV1> = Object.freeze(readAudioSettings(flightParameterDefaults()));

/** Settings as parameter values, to write with `setMany`. */
export function audioSettingsValues(settings: Partial<AudioSettingsV1>): Partial<FlightParameterValues> {
  const values: Partial<Record<FlightParameterId, unknown>> = {};
  for (const [field, value] of Object.entries(settings) as [keyof typeof PARAMETER_IDS, unknown][]) {
    if (!(field in PARAMETER_IDS) || value === undefined) continue;
    values[PARAMETER_IDS[field]] = field === "downgradedFrom" && value === null ? "none" : value;
  }
  return values as Partial<FlightParameterValues>;
}

/** The record the settings used before the registry; migrated once, and kept for rollback. */
export const AUDIO_SETTINGS_STORAGE_KEY = "osfs.audio.settings.v1";

/** The parameters an old record held, or null when it means nothing here, as from a newer version. */
export function migrateAudioSettings(raw: string): Partial<FlightParameterValues> | null {
  let stored: unknown;
  try { stored = JSON.parse(raw) as unknown; } catch { return null; }
  const parsed = parseAudioSettings(stored);
  return parsed.ok ? audioSettingsValues(parsed.settings) : null;
}

export interface AudioSettingsStore {
  readonly settings: AudioSettingsV1;
  /** Null on success, otherwise the reason the change is session-only. */
  update(patch: Partial<Omit<AudioSettingsV1, "version">>): string | null;
  readonly readOnlyReason: string | null;
}

/** The settings over their parameters: a stable snapshot until one of them changes. */
export function createAudioSettingsStore(parameters: FlightParameterStore): AudioSettingsStore {
  let settings = readAudioSettings(parameters);
  const current = (): AudioSettingsV1 => {
    const next = readAudioSettings(parameters);
    if (JSON.stringify(next) !== JSON.stringify(settings)) settings = next;
    return settings;
  };
  return {
    get settings() { return current(); },
    get readOnlyReason() { return parameters.storageError(); },
    update(patch) {
      const result = parameters.setMany(audioSettingsValues(patchAudioSettings(current(), patch)));
      if (!result.ok) return result.reason;
      return parameters.storageError() === null ? null : "Could not save; the change applies to this session only.";
    },
  };
}
