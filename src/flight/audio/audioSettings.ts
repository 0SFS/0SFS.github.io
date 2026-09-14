/**
 * Validated, versioned persistence for the sound settings.
 *
 * Two rules come straight from sound.md §6 and shape everything here: a stored
 * preference must never restore louder sound than the pilot last heard, and a
 * downgrade persists until an explicit re-test. So `requested` is the pilot's
 * ask, `effective` is a runtime fact that is never stored, and `enabled`
 * defaults off because a saved preference cannot satisfy autoplay anyway.
 */

export const AUDIO_SETTINGS_STORAGE_KEY = "osfs.audio.settings.v1";

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

export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioSettingsV1> = Object.freeze({
  version: 1,
  enabled: false,
  requested: "auto",
  masterVolume: 0.7,
  engineVolume: 0.8,
  airframeVolume: 0.6,
  engineMuted: false,
  reducedDynamicRange: false,
  downgradedFrom: null,
});

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

export interface AudioSettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AudioSettingsStore {
  readonly settings: AudioSettingsV1;
  /** Null on success, otherwise the reason the change is session-only. */
  update(patch: Partial<Omit<AudioSettingsV1, "version">>): string | null;
  readonly readOnlyReason: string | null;
}

export function createAudioSettingsStore(storage: AudioSettingsStorage | null): AudioSettingsStore {
  let settings: AudioSettingsV1 = { ...DEFAULT_AUDIO_SETTINGS };
  let readOnlyReason: string | null = null;

  let stored: unknown;
  try {
    const text = storage?.getItem(AUDIO_SETTINGS_STORAGE_KEY) ?? null;
    stored = text === null ? undefined : JSON.parse(text) as unknown;
  } catch {
    // A corrupt or unreadable entry must not stop the flight from starting.
    stored = undefined;
  }

  const write = (value: AudioSettingsV1): string | null => {
    if (readOnlyReason) return readOnlyReason;
    try { storage?.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(value)); return null; }
    catch { return "Could not save; browser storage is unavailable or full."; }
  };

  if (stored !== undefined) {
    const parsed = parseAudioSettings(stored);
    if (parsed.ok) {
      settings = parsed.settings;
      if (parsed.migrated) write(settings);
    } else if (stored && typeof stored === "object"
      && typeof (stored as { version?: unknown }).version === "number"
      && (stored as { version: number }).version > 1) {
      // Keep newer data intact rather than overwrite it with a downgrade.
      readOnlyReason = "Sound settings were saved by a newer version; changes apply to this session only.";
    }
  }

  return {
    get settings() { return settings; },
    get readOnlyReason() { return readOnlyReason; },
    update(patch) {
      const next = patchAudioSettings(settings, patch);
      settings = next;
      return write(next);
    },
  };
}
