/**
 * Persistent Ground interaction preferences (proposal: GroundInteractionSettingsV1).
 *
 * Stores only what the user requested. What actually runs is resolved at
 * runtime against implemented capabilities, so a saved profile never silently
 * changes its request; it reports the active fallback and the reason instead.
 */
export type GroundProfileId = "minimal" | "landing-feedback" | "ground-handling" | "rough-terrain" | "custom";
export type GroundPresetId = Exclude<GroundProfileId, "custom">;
export type GroundSelection = "auto" | "manual";
export type WheelRotationModel = "off" | "instant" | "inertia";
export type GroundForceModel = "jsbsim" | "coupled-rigid" | "combined-slip" | "compliant-soil";
export type GroundContactModel = "shared" | "per-wheel-point" | "footprint" | "swept";
export type GroundComputeBackend = "auto" | "cpu-js" | "cpu-wasm" | "worker" | "gpu";
export type TireAudioModel = "off" | "slip" | "contact" | "geometry" | "detailed";
export type HapticsModel = "off" | "landing" | "roughness";
export type WheelVisualsModel = "off" | "asset";

export interface GroundInteractionSettingsV1 {
  version: 1;
  profile: GroundProfileId;
  selection: GroundSelection;
  rotation: WheelRotationModel;
  forceModel: GroundForceModel;
  contactModel: GroundContactModel;
  backend: GroundComputeBackend;
  tireAudio: TireAudioModel;
  /** 0..1 */
  tireAudioVolume: number;
  haptics: HapticsModel;
  /** 0..1 */
  hapticStrength: number;
  wheelVisuals: WheelVisualsModel;
  locked: Partial<Record<GroundLockableKey, boolean>>;
}

export const GROUND_LOCKABLE_KEYS = [
  "rotation", "forceModel", "contactModel", "backend", "tireAudio", "haptics", "wheelVisuals",
] as const;
export type GroundLockableKey = typeof GROUND_LOCKABLE_KEYS[number];

/** Choices that reset or replace contact/wheel state; applied only at a paused/reset boundary. */
export const GROUND_BOUNDARY_KEYS = ["rotation", "forceModel", "contactModel", "backend"] as const;
export type GroundBoundaryKey = typeof GROUND_BOUNDARY_KEYS[number];

export const GROUND_CHOICES = {
  rotation: ["off", "instant", "inertia"],
  forceModel: ["jsbsim", "coupled-rigid", "combined-slip", "compliant-soil"],
  contactModel: ["shared", "per-wheel-point", "footprint", "swept"],
  backend: ["auto", "cpu-js", "cpu-wasm", "worker", "gpu"],
  tireAudio: ["off", "slip", "contact", "geometry", "detailed"],
  haptics: ["off", "landing", "roughness"],
  wheelVisuals: ["off", "asset"],
} as const satisfies { [K in GroundLockableKey]: readonly GroundInteractionSettingsV1[K][] };

type PresetFields = Pick<GroundInteractionSettingsV1, GroundLockableKey>;

/** Preset identity ignores volume, strength, locks and selection. */
export const GROUND_PRESETS: Record<GroundPresetId, PresetFields> = {
  "minimal": { rotation: "off", forceModel: "jsbsim", contactModel: "shared", backend: "auto",
    tireAudio: "off", haptics: "off", wheelVisuals: "off" },
  "landing-feedback": { rotation: "inertia", forceModel: "jsbsim", contactModel: "shared", backend: "auto",
    tireAudio: "slip", haptics: "off", wheelVisuals: "off" },
  "ground-handling": { rotation: "inertia", forceModel: "coupled-rigid", contactModel: "shared", backend: "auto",
    tireAudio: "slip", haptics: "landing", wheelVisuals: "off" },
  "rough-terrain": { rotation: "inertia", forceModel: "coupled-rigid", contactModel: "footprint", backend: "auto",
    tireAudio: "geometry", haptics: "roughness", wheelVisuals: "off" },
};

export const DEFAULT_GROUND_INTERACTION_SETTINGS: Readonly<GroundInteractionSettingsV1> = Object.freeze({
  version: 1, profile: "minimal", selection: "manual", ...GROUND_PRESETS.minimal,
  tireAudioVolume: 0.7, hapticStrength: 0.6, locked: {},
});

function isChoice<K extends GroundLockableKey>(key: K, value: unknown): value is GroundInteractionSettingsV1[K] {
  return (GROUND_CHOICES[key] as readonly unknown[]).includes(value);
}

function unit(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

export function matchingProfile(settings: PresetFields): GroundProfileId {
  for (const [id, preset] of Object.entries(GROUND_PRESETS) as [GroundPresetId, PresetFields][]) {
    if (GROUND_LOCKABLE_KEYS.every(key => settings[key] === preset[key])) return id;
  }
  return "custom";
}

export type GroundSettingsParse =
  | { ok: true; settings: GroundInteractionSettingsV1; migrated: boolean }
  | { ok: false; reason: string };

/**
 * Validates or migrates one settings object. Unversioned (pre-V1) objects and
 * missing/invalid fields fall back to Minimal's safe values. A newer version is
 * rejected, never downgraded.
 */
export function parseGroundInteractionSettings(value: unknown): GroundSettingsParse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "Settings must be an object." };
  }
  const input = value as Record<string, unknown>;
  if (input.version !== undefined && input.version !== 1) {
    return { ok: false, reason: typeof input.version === "number" && input.version > 1
      ? "Saved by a newer version of the game." : "Unknown settings version." };
  }
  let migrated = input.version === undefined;
  const settings = { ...DEFAULT_GROUND_INTERACTION_SETTINGS, locked: {} } as GroundInteractionSettingsV1;
  for (const key of GROUND_LOCKABLE_KEYS) {
    if (isChoice(key, input[key])) (settings as unknown as Record<string, unknown>)[key] = input[key];
    else migrated = true;
  }
  settings.selection = input.selection === "auto" || input.selection === "manual" ? input.selection : "manual";
  settings.tireAudioVolume = unit(input.tireAudioVolume, DEFAULT_GROUND_INTERACTION_SETTINGS.tireAudioVolume);
  settings.hapticStrength = unit(input.hapticStrength, DEFAULT_GROUND_INTERACTION_SETTINGS.hapticStrength);
  if (input.selection !== settings.selection || input.tireAudioVolume !== settings.tireAudioVolume
    || input.hapticStrength !== settings.hapticStrength) migrated = true;
  if (typeof input.locked === "object" && input.locked !== null && !Array.isArray(input.locked)) {
    for (const key of GROUND_LOCKABLE_KEYS) {
      if ((input.locked as Record<string, unknown>)[key] === true) settings.locked[key] = true;
    }
  }
  // The profile is derived, so a hand-edited file cannot claim a preset it does not match.
  settings.profile = matchingProfile(settings);
  if (input.profile !== settings.profile) migrated = true;
  return { ok: true, settings, migrated };
}

export function applyGroundPreset(settings: GroundInteractionSettingsV1, preset: GroundPresetId): GroundInteractionSettingsV1 {
  return { ...settings, ...GROUND_PRESETS[preset], profile: preset, locked: { ...settings.locked } };
}

/** Applies user edits and re-derives the profile (Custom whenever no preset matches). */
export function patchGroundSettings(
  settings: GroundInteractionSettingsV1, patch: Partial<Omit<GroundInteractionSettingsV1, "version" | "profile">>,
): GroundInteractionSettingsV1 {
  const next = { ...settings, ...patch, locked: { ...(patch.locked ?? settings.locked) }, version: 1 as const };
  const parsed = parseGroundInteractionSettings(next);
  return parsed.ok ? parsed.settings : settings;
}

/* ---------------------------------------------------------------- Resolution */

export interface GroundCapabilities {
  /** Why the native per-wheel contact/impulse bridge is unavailable, or null. */
  contactBridgeUnavailable: string | null;
  /** Why Web Audio cannot run here, or null. */
  audioUnavailable: string | null;
}

export interface GroundResolutionEntry<K extends GroundLockableKey = GroundLockableKey> {
  key: K;
  requested: GroundInteractionSettingsV1[K];
  active: GroundInteractionSettingsV1[K];
  /** Why active differs from requested (or why the request is inactive). */
  reason: string | null;
  /** Requested value is waiting for a paused/reset boundary. */
  pending: boolean;
}

export type ActiveGroundInteraction = Pick<GroundInteractionSettingsV1, GroundLockableKey> & {
  /** Backend resolved to an implementation; "auto" is never active. */
  backend: Exclude<GroundComputeBackend, "auto">;
};

export interface GroundResolution {
  active: ActiveGroundInteraction;
  entries: { [K in GroundLockableKey]: GroundResolutionEntry<K> };
}

const FORCE_REQUIREMENTS: Record<Exclude<GroundForceModel, "jsbsim">, string> = {
  "coupled-rigid": "Requires a native per-wheel contact and accepted-impulse interface",
  "combined-slip": "Requires validated coupled rigid wheels first",
  "compliant-soil": "Requires footprint contact and validated combined slip",
};

/** Why a value cannot run with the given (already active) dependencies, or null. */
export function groundChoiceUnavailable<K extends GroundLockableKey>(
  key: K, value: GroundInteractionSettingsV1[K], context: Partial<ActiveGroundInteraction>, capabilities: GroundCapabilities,
): string | null {
  switch (key) {
    case "rotation": return null;
    case "forceModel":
      if (value === "jsbsim") return null;
      if (value === "coupled-rigid" && capabilities.contactBridgeUnavailable) {
        return `${FORCE_REQUIREMENTS["coupled-rigid"]}: ${capabilities.contactBridgeUnavailable}`;
      }
      return FORCE_REQUIREMENTS[value as keyof typeof FORCE_REQUIREMENTS];
    case "contactModel":
      if (value === "shared") return null;
      return value === "swept" ? "Requires footprint support and finite wheel sweep queries"
        : "Requires per-wheel ground support in the native contact interface";
    case "backend":
      return value === "auto" || value === "cpu-js" ? null
        : "No validated implementation exists behind this backend";
    case "tireAudio":
      if (value === "off") return null;
      if (capabilities.audioUnavailable) return capabilities.audioUnavailable;
      if (value === "slip") return context.rotation === "inertia" ? null : "Requires Finite inertia wheel response";
      if (value === "contact") return "Contact resonators are not implemented yet";
      if (value === "geometry") return "Requires footprint contact";
      return "Research only; not implemented";
    case "haptics":
      if (value === "off") return null;
      if (value === "roughness") return "Requires footprint contact";
      return context.rotation === "off" ? "Requires a wheel response (Instant or Finite inertia)" : null;
    case "wheelVisuals":
      return value === "off" ? null : "Asset wheel rotation is not implemented; Debug outlines remain available";
  }
  return null;
}

/** Auto's fallback order: the nearest cheaper implemented choice. */
const AUTO_FALLBACK: { [K in GroundLockableKey]: readonly GroundInteractionSettingsV1[K][] } = {
  rotation: ["off"],
  forceModel: ["jsbsim"],
  contactModel: ["shared"],
  backend: ["cpu-js"],
  tireAudio: ["slip", "off"],
  haptics: ["landing", "off"],
  wheelVisuals: ["off"],
};
/** Manual/locked requests stay inactive; this is what runs meanwhile. */
const INACTIVE: PresetFields = { rotation: "off", forceModel: "jsbsim", contactModel: "shared",
  backend: "cpu-js", tireAudio: "off", haptics: "off", wheelVisuals: "off" };
// Dependencies first: audio/haptics need the active wheel response.
const RESOLUTION_ORDER: readonly GroundLockableKey[] = [
  "backend", "rotation", "forceModel", "contactModel", "tireAudio", "haptics", "wheelVisuals",
];

/**
 * requested → active → reason. `applied` holds the boundary choices currently
 * running; differing requests are reported as pending rather than applied.
 */
export function resolveGroundInteraction(
  requested: GroundInteractionSettingsV1,
  capabilities: GroundCapabilities,
  applied: Pick<GroundInteractionSettingsV1, GroundBoundaryKey> = requested,
): GroundResolution {
  const active = {} as Record<GroundLockableKey, string>;
  const entries = {} as Record<GroundLockableKey, GroundResolutionEntry>;
  for (const key of RESOLUTION_ORDER) {
    const wanted = requested[key];
    const boundary = (GROUND_BOUNDARY_KEYS as readonly string[]).includes(key);
    const pending = boundary && applied[key as GroundBoundaryKey] !== wanted;
    const candidate = pending ? applied[key as GroundBoundaryKey] : wanted;
    const context = active as Partial<ActiveGroundInteraction>;
    const unavailable = groundChoiceUnavailable(key, candidate as never, context, capabilities);
    let value: string = candidate;
    let reason: string | null = pending ? "Applies when the simulation is paused or reset" : null;
    if (unavailable) {
      reason = unavailable;
      value = INACTIVE[key];
      if (requested.selection === "auto" && !requested.locked[key]) {
        const fallback = AUTO_FALLBACK[key].find(option => option !== candidate
          && !groundChoiceUnavailable(key, option as never, context, capabilities));
        if (fallback) { value = fallback; reason = `Auto: ${unavailable.charAt(0).toLowerCase()}${unavailable.slice(1)}`; }
      }
    }
    if (key === "backend" && value === "auto") value = "cpu-js";
    active[key] = value;
    entries[key] = { key, requested: wanted, active: value, reason, pending } as GroundResolutionEntry;
  }
  return { active: active as unknown as ActiveGroundInteraction, entries: entries as GroundResolution["entries"] };
}

/* --------------------------------------------------------------- Persistence */

export const GROUND_SETTINGS_STORAGE_KEY = "osfs.ground-interaction.v1";
export const GROUND_PROFILES_STORAGE_KEY = "osfs.ground-interaction-profiles.v1";
export const MAX_NAMED_PROFILES = 12;
export const MAX_PROFILE_NAME_LENGTH = 40;
export const MAX_PROFILE_BYTES = 1024;
export const MAX_IMPORT_BYTES = 4096;
export const PROFILE_EXPORT_FORMAT = "osfs-ground-interaction";

export interface GroundStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface NamedGroundProfile { name: string; settings: GroundInteractionSettingsV1 }

function byteLength(text: string): number { return new TextEncoder().encode(text).length; }

export function normalizeProfileName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 && trimmed.length <= MAX_PROFILE_NAME_LENGTH && !/[ -]/.test(trimmed) ? trimmed : null;
}

export interface GroundSettingsStore {
  readonly settings: GroundInteractionSettingsV1;
  readonly profiles: readonly NamedGroundProfile[];
  /** Non-null when saving is disabled, e.g. data from a newer version. */
  readonly readOnlyReason: string | null;
  set(settings: GroundInteractionSettingsV1): void;
  saveProfile(name: string): string | null;
  loadProfile(name: string): string | null;
  deleteProfile(name: string): void;
  exportProfile(name?: string): string;
  importProfile(text: string): string | null;
}

/**
 * Best-effort localStorage persistence with capped named profiles. Returns an
 * error string from mutating calls instead of throwing, so the sim keeps flying
 * in private mode or with full storage.
 */
export function createGroundSettingsStore(storage: GroundStorage | null): GroundSettingsStore {
  let readOnlyReason: string | null = null;
  let settings: GroundInteractionSettingsV1 = { ...DEFAULT_GROUND_INTERACTION_SETTINGS, locked: {} };
  let profiles: NamedGroundProfile[] = [];

  const read = (key: string): unknown => {
    try {
      const text = storage?.getItem(key) ?? null;
      return text === null ? undefined : JSON.parse(text) as unknown;
    } catch { return null; }
  };
  const write = (key: string, value: unknown): string | null => {
    if (readOnlyReason) return readOnlyReason;
    try { storage?.setItem(key, JSON.stringify(value)); return null; }
    catch { return "Could not save; browser storage is unavailable or full."; }
  };

  const stored = read(GROUND_SETTINGS_STORAGE_KEY);
  if (stored !== undefined) {
    const parsed = parseGroundInteractionSettings(stored);
    if (parsed.ok) {
      settings = parsed.settings;
      if (parsed.migrated) write(GROUND_SETTINGS_STORAGE_KEY, settings);
    } else if (stored && typeof stored === "object" && typeof (stored as { version?: unknown }).version === "number"
      && (stored as { version: number }).version > 1) {
      // Keep the newer data intact rather than overwrite it with a downgrade.
      readOnlyReason = "Ground interaction settings were saved by a newer version; changes apply to this session only.";
    }
  }
  const storedProfiles = read(GROUND_PROFILES_STORAGE_KEY);
  if (Array.isArray(storedProfiles)) {
    for (const entry of storedProfiles.slice(0, MAX_NAMED_PROFILES)) {
      const name = normalizeProfileName((entry as { name?: unknown })?.name);
      const parsed = parseGroundInteractionSettings((entry as { settings?: unknown })?.settings);
      if (name && parsed.ok && !profiles.some(profile => profile.name === name)) profiles.push({ name, settings: parsed.settings });
    }
  }

  const persistProfiles = () => write(GROUND_PROFILES_STORAGE_KEY, profiles);

  return {
    get settings() { return settings; },
    get profiles() { return profiles; },
    get readOnlyReason() { return readOnlyReason; },
    set(next) {
      const parsed = parseGroundInteractionSettings(next);
      if (!parsed.ok) return;
      settings = parsed.settings;
      write(GROUND_SETTINGS_STORAGE_KEY, settings);
    },
    saveProfile(rawName) {
      const name = normalizeProfileName(rawName);
      if (!name) return `Use a name of 1–${MAX_PROFILE_NAME_LENGTH} characters.`;
      const existing = profiles.findIndex(profile => profile.name === name);
      if (existing < 0 && profiles.length >= MAX_NAMED_PROFILES) return `At most ${MAX_NAMED_PROFILES} profiles can be saved.`;
      const entry = { name, settings: { ...settings, locked: { ...settings.locked } } };
      if (byteLength(JSON.stringify(entry)) > MAX_PROFILE_BYTES) return "Profile is too large to save.";
      const previous = profiles;
      profiles = existing < 0 ? [...profiles, entry] : profiles.map((profile, index) => index === existing ? entry : profile);
      const error = persistProfiles();
      if (error && !readOnlyReason) profiles = previous;
      return error;
    },
    loadProfile(name) {
      const profile = profiles.find(candidate => candidate.name === name);
      if (!profile) return "Profile not found.";
      settings = { ...profile.settings, locked: { ...profile.settings.locked } };
      return write(GROUND_SETTINGS_STORAGE_KEY, settings);
    },
    deleteProfile(name) {
      profiles = profiles.filter(profile => profile.name !== name);
      persistProfiles();
    },
    exportProfile(name) {
      const profile = name === undefined ? null : profiles.find(candidate => candidate.name === name);
      return JSON.stringify({ format: PROFILE_EXPORT_FORMAT, version: 1,
        name: profile?.name ?? "Current settings", settings: profile?.settings ?? settings });
    },
    importProfile(text) {
      if (typeof text !== "string" || byteLength(text) > MAX_IMPORT_BYTES) return "Profile text is empty or too large.";
      let value: unknown;
      try { value = JSON.parse(text); } catch { return "Profile text is not valid JSON."; }
      const envelope = value as { format?: unknown; version?: unknown; name?: unknown; settings?: unknown };
      if (typeof value !== "object" || value === null || envelope.format !== PROFILE_EXPORT_FORMAT) {
        return "Not an OSFS Ground interaction profile.";
      }
      if (envelope.version !== 1) return "Unsupported profile version.";
      // Imports must be complete; migration defaults are for our own older data only.
      const raw = envelope.settings as Record<string, unknown> | undefined;
      if (!raw || typeof raw !== "object" || raw.version !== 1) return "Profile settings are missing a version.";
      for (const key of GROUND_LOCKABLE_KEYS) if (!isChoice(key, raw[key])) return `Invalid value for ${key}.`;
      for (const key of ["tireAudioVolume", "hapticStrength"] as const) {
        if (typeof raw[key] !== "number" || !Number.isFinite(raw[key]) || (raw[key] as number) < 0 || (raw[key] as number) > 1) {
          return `Invalid value for ${key}.`;
        }
      }
      if (raw.selection !== "auto" && raw.selection !== "manual") return "Invalid value for selection.";
      const parsed = parseGroundInteractionSettings(raw);
      if (!parsed.ok) return parsed.reason;
      const name = normalizeProfileName(envelope.name) ?? "Imported profile";
      const existing = profiles.findIndex(profile => profile.name === name);
      if (existing < 0 && profiles.length >= MAX_NAMED_PROFILES) return `At most ${MAX_NAMED_PROFILES} profiles can be saved.`;
      const entry = { name, settings: parsed.settings };
      const previous = profiles;
      profiles = existing < 0 ? [...profiles, entry] : profiles.map((profile, index) => index === existing ? entry : profile);
      const error = persistProfiles();
      if (error && !readOnlyReason) profiles = previous;
      return error;
    },
  };
}
