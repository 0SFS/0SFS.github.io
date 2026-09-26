import type {
  FlightParameterId,
  FlightParameters,
  FlightParameterStore,
  FlightParameterValues,
} from "./flightParameters";

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

/** Each choice's name, for its row and its parameter. */
export const GROUND_FIELD_LABELS: Record<GroundLockableKey, string> = {
  rotation: "Wheel response", forceModel: "Ground forces", contactModel: "Ground contact",
  tireAudio: "Tire audio", haptics: "Haptics", wheelVisuals: "Wheel visuals", backend: "Compute backend",
};

/** Pilot-facing names shared by Ground handling, Debug and status text. */
export const GROUND_CHOICE_LABELS: { [K in GroundLockableKey]: Record<GroundInteractionSettingsV1[K], string> } = {
  rotation: { off: "Off", instant: "Instant rolling", inertia: "Finite inertia" },
  forceModel: { "jsbsim": "Existing JSBSim", "coupled-rigid": "Coupled rigid wheel",
    "combined-slip": "Combined-slip tire", "compliant-soil": "Compliant tire and soil" },
  contactModel: { "shared": "Shared terrain", "per-wheel-point": "Per-wheel support",
    "footprint": "Wheel footprint", "swept": "Swept wheel shape" },
  backend: { "auto": "Auto (CPU today)", "cpu-js": "CPU · JavaScript", "cpu-wasm": "CPU · WASM",
    "worker": "Worker", "gpu": "GPU" },
  tireAudio: { off: "Off", slip: "Slip cue", contact: "Contact cues", geometry: "Geometry rolling", detailed: "Detailed" },
  haptics: { off: "Off", landing: "Landing cues", roughness: "Roughness" },
  wheelVisuals: { off: "Off", asset: "Asset wheel rotation" },
};

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

/** The record the settings used before the registry; migrated once, and kept for rollback. */
export const GROUND_SETTINGS_STORAGE_KEY = "osfs.ground-interaction.v1";
/**
 * Named profiles are saved sets of the settings, kept in their own key until
 * the settings registry's presets can hold them.
 */
export const GROUND_PROFILES_STORAGE_KEY = "osfs.ground-interaction-profiles.v1";
export const MAX_NAMED_PROFILES = 12;
export const MAX_PROFILE_NAME_LENGTH = 40;
export const MAX_PROFILE_BYTES = 1024;
export const MAX_IMPORT_BYTES = 4096;
export const PROFILE_EXPORT_FORMAT = "osfs-ground-interaction";

const lockParameterId = (key: GroundLockableKey) => `osfs.ground.lock.${key}` as const;
const choiceParameterId = (key: GroundLockableKey) => `osfs.ground.${key}` as const;

/** Every osfs.ground.* parameter the Ground handling section's own controls edit. */
export const GROUND_PARAMETER_IDS: readonly FlightParameterId[] = [
  "osfs.ground.selection",
  ...GROUND_LOCKABLE_KEYS.map(choiceParameterId),
  "osfs.ground.tireAudioVolume",
  "osfs.ground.hapticStrength",
  ...GROUND_LOCKABLE_KEYS.map(lockParameterId),
];

/** The settings as their osfs.ground.* parameters set them; the profile is derived. */
export function readGroundSettings(parameters: FlightParameters): GroundInteractionSettingsV1 {
  const locked: Partial<Record<GroundLockableKey, boolean>> = {};
  for (const key of GROUND_LOCKABLE_KEYS) if (parameters.get(lockParameterId(key))) locked[key] = true;
  const raw: Record<string, unknown> = {
    version: 1,
    selection: parameters.get("osfs.ground.selection"),
    tireAudioVolume: parameters.get("osfs.ground.tireAudioVolume"),
    hapticStrength: parameters.get("osfs.ground.hapticStrength"),
    locked,
  };
  for (const key of GROUND_LOCKABLE_KEYS) raw[key] = parameters.get(choiceParameterId(key));
  const parsed = parseGroundInteractionSettings(raw);
  return parsed.ok ? parsed.settings : { ...DEFAULT_GROUND_INTERACTION_SETTINGS, locked: {} };
}

/** Settings as parameter values, to write with `setMany`. */
export function groundSettingsValues(settings: GroundInteractionSettingsV1): Partial<FlightParameterValues> {
  const values: Partial<Record<FlightParameterId, unknown>> = {
    "osfs.ground.selection": settings.selection,
    "osfs.ground.tireAudioVolume": settings.tireAudioVolume,
    "osfs.ground.hapticStrength": settings.hapticStrength,
  };
  for (const key of GROUND_LOCKABLE_KEYS) {
    values[choiceParameterId(key)] = settings[key];
    values[lockParameterId(key)] = settings.locked[key] === true;
  }
  return values as Partial<FlightParameterValues>;
}

/** The parameters an old record held, or null when it means nothing here, as from a newer version. */
export function migrateGroundSettings(raw: string): Partial<FlightParameterValues> | null {
  let stored: unknown;
  try { stored = JSON.parse(raw) as unknown; } catch { return null; }
  const parsed = parseGroundInteractionSettings(stored);
  return parsed.ok ? groundSettingsValues(parsed.settings) : null;
}

export interface GroundStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface NamedGroundProfile { name: string; settings: GroundInteractionSettingsV1 }

function byteLength(text: string): number { return new TextEncoder().encode(text).length; }

export function normalizeProfileName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.replace(/\s+/g, " ").trim();
  const control = [...trimmed].some(character => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f);
  return trimmed.length > 0 && trimmed.length <= MAX_PROFILE_NAME_LENGTH && !control ? trimmed : null;
}

export interface GroundSettingsStore {
  readonly settings: GroundInteractionSettingsV1;
  readonly profiles: readonly NamedGroundProfile[];
  /** Non-null when changes will not survive a reload. */
  readonly readOnlyReason: string | null;
  set(settings: GroundInteractionSettingsV1): void;
  saveProfile(name: string): string | null;
  loadProfile(name: string): string | null;
  deleteProfile(name: string): void;
  exportProfile(name?: string): string;
  importProfile(text: string): string | null;
}

/**
 * The settings over their parameters, and capped named profiles in storage.
 * Mutating calls return an error string instead of throwing, so the sim keeps
 * flying in private mode or with full storage.
 */
export function createGroundSettingsStore(parameters: FlightParameterStore, storage: GroundStorage | null): GroundSettingsStore {
  let settings = readGroundSettings(parameters);
  const current = (): GroundInteractionSettingsV1 => {
    const next = readGroundSettings(parameters);
    if (JSON.stringify(next) !== JSON.stringify(settings)) settings = next;
    return settings;
  };
  const save = (next: GroundInteractionSettingsV1): string | null => {
    const result = parameters.setMany(groundSettingsValues(next));
    if (!result.ok) return result.reason;
    return parameters.storageError() === null ? null : "Could not save; the change applies to this session only.";
  };
  let profiles: NamedGroundProfile[] = [];

  const read = (key: string): unknown => {
    try {
      const text = storage?.getItem(key) ?? null;
      return text === null ? undefined : JSON.parse(text) as unknown;
    } catch { return null; }
  };
  const write = (key: string, value: unknown): string | null => {
    try { storage?.setItem(key, JSON.stringify(value)); return null; }
    catch { return "Could not save; browser storage is unavailable or full."; }
  };

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
    get settings() { return current(); },
    get profiles() { return profiles; },
    get readOnlyReason() { return parameters.storageError(); },
    set(next) {
      const parsed = parseGroundInteractionSettings(next);
      if (!parsed.ok) return;
      save(parsed.settings);
    },
    saveProfile(rawName) {
      const name = normalizeProfileName(rawName);
      if (!name) return `Use a name of 1–${MAX_PROFILE_NAME_LENGTH} characters.`;
      const existing = profiles.findIndex(profile => profile.name === name);
      if (existing < 0 && profiles.length >= MAX_NAMED_PROFILES) return `At most ${MAX_NAMED_PROFILES} profiles can be saved.`;
      const now = current();
      const entry = { name, settings: { ...now, locked: { ...now.locked } } };
      if (byteLength(JSON.stringify(entry)) > MAX_PROFILE_BYTES) return "Profile is too large to save.";
      const previous = profiles;
      profiles = existing < 0 ? [...profiles, entry] : profiles.map((profile, index) => index === existing ? entry : profile);
      const error = persistProfiles();
      if (error) profiles = previous;
      return error;
    },
    loadProfile(name) {
      const profile = profiles.find(candidate => candidate.name === name);
      if (!profile) return "Profile not found.";
      return save({ ...profile.settings, locked: { ...profile.settings.locked } });
    },
    deleteProfile(name) {
      profiles = profiles.filter(profile => profile.name !== name);
      persistProfiles();
    },
    exportProfile(name) {
      const profile = name === undefined ? null : profiles.find(candidate => candidate.name === name);
      return JSON.stringify({ format: PROFILE_EXPORT_FORMAT, version: 1,
        name: profile?.name ?? "Current settings", settings: profile?.settings ?? current() });
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
      if (error) profiles = previous;
      return error;
    },
  };
}
