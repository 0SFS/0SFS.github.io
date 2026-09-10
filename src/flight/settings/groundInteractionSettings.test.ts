import { describe, expect, it } from "vitest";
import {
  applyGroundPreset, createGroundSettingsStore, DEFAULT_GROUND_INTERACTION_SETTINGS, GROUND_PROFILES_STORAGE_KEY,
  GROUND_SETTINGS_STORAGE_KEY, MAX_IMPORT_BYTES, MAX_NAMED_PROFILES, parseGroundInteractionSettings, patchGroundSettings,
  PROFILE_EXPORT_FORMAT, resolveGroundInteraction, type GroundCapabilities, type GroundInteractionSettingsV1,
} from "./groundInteractionSettings";

const CAPABILITIES: GroundCapabilities = {
  contactBridgeUnavailable: "installed JSBSim WASM has no per-wheel contact packet",
  audioUnavailable: null,
};

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return { map, getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); } };
}

const base = (): GroundInteractionSettingsV1 => ({ ...DEFAULT_GROUND_INTERACTION_SETTINGS, locked: {} });

describe("settings migration", () => {
  it("defaults to Minimal: manual, no wheel feedback, JSBSim/shared terrain on CPU", () => {
    const store = createGroundSettingsStore(memoryStorage());
    expect(store.settings).toMatchObject({ version: 1, profile: "minimal", selection: "manual", rotation: "off",
      forceModel: "jsbsim", contactModel: "shared", backend: "auto", tireAudio: "off", haptics: "off", wheelVisuals: "off" });
    expect(resolveGroundInteraction(store.settings, CAPABILITIES).active.backend).toBe("cpu-js");
  });

  it("migrates unversioned and partial data field-by-field to safe values and rewrites it", () => {
    const storage = memoryStorage({ [GROUND_SETTINGS_STORAGE_KEY]: JSON.stringify({
      rotation: "inertia", tireAudio: "slip", tireAudioVolume: 7, haptics: "vibrate-everything", locked: { rotation: true, bogus: true },
    }) });
    const store = createGroundSettingsStore(storage);
    expect(store.settings).toMatchObject({ version: 1, rotation: "inertia", tireAudio: "slip", tireAudioVolume: 1,
      haptics: "off", selection: "manual", forceModel: "jsbsim", profile: "landing-feedback", locked: { rotation: true } });
    expect(store.settings.locked).not.toHaveProperty("bogus");
    expect(JSON.parse(storage.map.get(GROUND_SETTINGS_STORAGE_KEY)!).version).toBe(1);
  });

  it("never downgrades data from a newer version and keeps changes session-only", () => {
    const newer = JSON.stringify({ version: 2, rotation: "inertia", futureField: true });
    const storage = memoryStorage({ [GROUND_SETTINGS_STORAGE_KEY]: newer });
    const store = createGroundSettingsStore(storage);
    expect(store.settings.rotation).toBe("off");
    expect(store.readOnlyReason).toMatch(/newer version/);
    store.set(applyGroundPreset(store.settings, "landing-feedback"));
    expect(store.settings.rotation).toBe("inertia");
    expect(storage.map.get(GROUND_SETTINGS_STORAGE_KEY)).toBe(newer);
  });

  it("recovers from corrupt JSON and storage exceptions without throwing", () => {
    expect(createGroundSettingsStore(memoryStorage({ [GROUND_SETTINGS_STORAGE_KEY]: "{nope" })).settings.profile).toBe("minimal");
    const failing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("full"); } };
    const store = createGroundSettingsStore(failing);
    expect(() => store.set(applyGroundPreset(store.settings, "landing-feedback"))).not.toThrow();
    expect(store.settings.profile).toBe("landing-feedback");
    expect(store.saveProfile("Laptop")).toMatch(/storage/);
    expect(store.profiles).toHaveLength(0);
    expect(createGroundSettingsStore(null).settings.profile).toBe("minimal");
  });

  it("derives the profile instead of trusting a stored label", () => {
    const parsed = parseGroundInteractionSettings({ ...base(), profile: "landing-feedback" });
    expect(parsed.ok && parsed.settings.profile).toBe("minimal");
    expect(parsed.ok && parsed.migrated).toBe(true);
  });
});

describe("presets and custom edits", () => {
  it("marks any mode change away from a preset as Custom, but not volume or strength", () => {
    const landing = applyGroundPreset(base(), "landing-feedback");
    expect(patchGroundSettings(landing, { tireAudioVolume: 0.2, hapticStrength: 0.1 }).profile).toBe("landing-feedback");
    expect(patchGroundSettings(landing, { tireAudio: "off" }).profile).toBe("custom");
    expect(patchGroundSettings(patchGroundSettings(landing, { tireAudio: "off" }), { tireAudio: "slip" }).profile).toBe("landing-feedback");
  });
});

describe("requested → active → reason", () => {
  it("leaves unimplemented Manual requests inactive with a plain dependency", () => {
    const resolution = resolveGroundInteraction(applyGroundPreset(base(), "rough-terrain"), CAPABILITIES);
    expect(resolution.active).toMatchObject({ forceModel: "jsbsim", contactModel: "shared", tireAudio: "off", haptics: "off" });
    expect(resolution.entries.forceModel.reason).toMatch(/native per-wheel contact.*no per-wheel contact packet/);
    expect(resolution.entries.contactModel.reason).toMatch(/per-wheel ground support/);
    expect(resolution.entries.tireAudio.reason).toBe("Requires footprint contact");
    expect(resolution.entries.haptics).toMatchObject({ requested: "roughness", active: "off", reason: "Requires footprint contact" });
  });

  it("lets Auto fall back only for unlocked choices, and never to a higher tier", () => {
    const rough = { ...applyGroundPreset(base(), "rough-terrain"), selection: "auto" as const };
    const auto = resolveGroundInteraction(rough, CAPABILITIES);
    expect(auto.active).toMatchObject({ forceModel: "jsbsim", tireAudio: "slip", haptics: "landing" });
    expect(auto.entries.tireAudio.reason).toBe("Auto: requires footprint contact");
    const locked = resolveGroundInteraction({ ...rough, locked: { tireAudio: true } }, CAPABILITIES);
    expect(locked.active.tireAudio).toBe("off");
    expect(locked.entries.tireAudio.reason).toBe("Requires footprint contact");
  });

  it("checks dependencies against the active wheel response, not the request", () => {
    const slipWithoutInertia = patchGroundSettings(base(), { rotation: "instant", tireAudio: "slip", haptics: "landing" });
    const resolution = resolveGroundInteraction(slipWithoutInertia, CAPABILITIES);
    expect(resolution.entries.tireAudio).toMatchObject({ active: "off", reason: "Requires Finite inertia wheel response" });
    expect(resolution.entries.haptics.active).toBe("landing");
    const noAudio = resolveGroundInteraction(applyGroundPreset(base(), "landing-feedback"),
      { ...CAPABILITIES, audioUnavailable: "Web Audio is unavailable in this browser" });
    expect(noAudio.entries.tireAudio.reason).toBe("Web Audio is unavailable in this browser");
    expect(noAudio.active.rotation).toBe("inertia");
  });

  it("does not offer GPU, worker or WASM backends without validated implementations", () => {
    for (const backend of ["gpu", "worker", "cpu-wasm"] as const) {
      const manual = resolveGroundInteraction(patchGroundSettings(base(), { backend }), CAPABILITIES);
      expect(manual.active.backend).toBe("cpu-js");
      expect(manual.entries.backend.reason).toMatch(/No validated implementation/);
    }
  });

  it("reports boundary choices as pending until applied, while immediate choices change now", () => {
    const requested = applyGroundPreset(base(), "landing-feedback");
    const resolution = resolveGroundInteraction(requested, CAPABILITIES, base());
    expect(resolution.entries.rotation).toMatchObject({ requested: "inertia", active: "off", pending: true });
    expect(resolution.entries.tireAudio).toMatchObject({ active: "off", reason: "Requires Finite inertia wheel response" });
    expect(resolveGroundInteraction(requested, CAPABILITIES, requested).active.tireAudio).toBe("slip");
  });
});

describe("named profiles", () => {
  it("saves, loads, overwrites and deletes named profiles separately from the active settings", () => {
    const storage = memoryStorage();
    const store = createGroundSettingsStore(storage);
    store.set(applyGroundPreset(store.settings, "landing-feedback"));
    expect(store.saveProfile("  Laptop,   runway  ")).toBeNull();
    store.set(applyGroundPreset(store.settings, "minimal"));
    expect(store.saveProfile("Laptop, runway")).toBeNull();
    expect(store.profiles).toHaveLength(1);
    expect(store.loadProfile("Laptop, runway")).toBeNull();
    expect(store.settings.profile).toBe("minimal");
    const reloaded = createGroundSettingsStore(storage);
    expect(reloaded.profiles.map(profile => profile.name)).toEqual(["Laptop, runway"]);
    reloaded.deleteProfile("Laptop, runway");
    expect(createGroundSettingsStore(storage).profiles).toEqual([]);
  });

  it("caps profile count and rejects invalid names", () => {
    const store = createGroundSettingsStore(memoryStorage());
    expect(store.saveProfile("")).toMatch(/name/);
    expect(store.saveProfile("x".repeat(41))).toMatch(/name/);
    expect(store.saveProfile("badname")).toMatch(/name/);
    for (let index = 0; index < MAX_NAMED_PROFILES; index++) expect(store.saveProfile(`P${index}`)).toBeNull();
    expect(store.saveProfile("one more")).toMatch(/At most/);
    expect(store.saveProfile("P0")).toBeNull();
  });

  it("ignores malformed stored profiles and truncates an oversized list", () => {
    const valid = { name: "VR, silent", settings: applyGroundPreset(base(), "landing-feedback") };
    const stored = [{ name: "", settings: base() }, { name: "Bad", settings: "x" }, valid, valid,
      ...Array.from({ length: 20 }, (_, index) => ({ name: `Extra ${index}`, settings: base() }))];
    const store = createGroundSettingsStore(memoryStorage({ [GROUND_PROFILES_STORAGE_KEY]: JSON.stringify(stored) }));
    expect(store.profiles.length).toBeLessThanOrEqual(MAX_NAMED_PROFILES);
    expect(store.profiles[0]).toEqual(valid);
  });

  it("round-trips export/import and validates enums, numbers, format and version before writing", () => {
    const storage = memoryStorage();
    const store = createGroundSettingsStore(storage);
    store.set(applyGroundPreset(store.settings, "landing-feedback"));
    const exported = store.exportProfile();
    const fresh = createGroundSettingsStore(memoryStorage());
    expect(fresh.importProfile(exported)).toBeNull();
    expect(fresh.profiles[0].settings.rotation).toBe("inertia");

    const envelope = JSON.parse(exported);
    const cases: [unknown, RegExp][] = [
      ["not json", /valid JSON/],
      [{ ...envelope, format: "other" }, /Not an OSFS/],
      [{ ...envelope, version: 2 }, /Unsupported profile version/],
      [{ ...envelope, settings: { ...envelope.settings, version: undefined } }, /missing a version/],
      [{ ...envelope, settings: { ...envelope.settings, forceModel: "fea" } }, /forceModel/],
      [{ ...envelope, settings: { ...envelope.settings, hapticStrength: 3 } }, /hapticStrength/],
      [{ ...envelope, settings: { ...envelope.settings, tireAudioVolume: "loud" } }, /tireAudioVolume/],
      [{ ...envelope, settings: { ...envelope.settings, selection: "yolo" } }, /selection/],
      [{ ...envelope, padding: "x".repeat(MAX_IMPORT_BYTES) }, /too large/],
    ];
    const before = storage.map.get(GROUND_PROFILES_STORAGE_KEY);
    for (const [input, error] of cases) {
      expect(store.importProfile(typeof input === "string" ? input : JSON.stringify(input))).toMatch(error);
    }
    expect(storage.map.get(GROUND_PROFILES_STORAGE_KEY)).toBe(before);
    expect(envelope.format).toBe(PROFILE_EXPORT_FORMAT);
  });
});
