import { describe, expect, it } from "vitest";
import { createSettingsRegistry } from "foss-earth/settings";
import { flightParameterDefaults, OSFS_PARAMETERS } from "./flightParameters";
import {
  createGroundSettingsStore, DEFAULT_GROUND_INTERACTION_SETTINGS, GROUND_PROFILES_STORAGE_KEY, groundProfilesMigration,
  migrateGroundSettings, parseGroundInteractionSettings, patchGroundSettings, resolveGroundInteraction,
  type GroundCapabilities, type GroundInteractionSettingsV1,
} from "./groundInteractionSettings";

const CAPABILITIES: GroundCapabilities = {
  contactBridgeUnavailable: "installed JSBSim WASM has no per-wheel contact packet",
  audioUnavailable: null,
};

/** The choices of the Ground: Landing feedback preset. */
const LANDING_FEEDBACK = { rotation: "inertia", tireAudio: "slip" } as const;
/** Choices none of which run today: footprint contact, and what needs it. */
const ROUGH_TERRAIN = {
  rotation: "inertia", forceModel: "coupled-rigid", contactModel: "footprint", tireAudio: "geometry", haptics: "roughness",
} as const;

const base = (): GroundInteractionSettingsV1 => ({ ...DEFAULT_GROUND_INTERACTION_SETTINGS, locked: {} });

describe("settings migration", () => {
  it("defaults to the least work: manual, no wheel feedback, JSBSim/shared terrain on CPU", () => {
    const store = createGroundSettingsStore(flightParameterDefaults());
    expect(store.settings).toMatchObject({ version: 1, selection: "manual", rotation: "off",
      forceModel: "jsbsim", contactModel: "shared", backend: "auto", tireAudio: "off", haptics: "off", wheelVisuals: "off" });
    expect(resolveGroundInteraction(store.settings, CAPABILITIES).active.backend).toBe("cpu-js");
  });

  it("migrates an unversioned, partial record field by field to safe values", () => {
    const parameters = flightParameterDefaults(migrateGroundSettings(JSON.stringify({
      rotation: "inertia", tireAudio: "slip", tireAudioVolume: 7, haptics: "vibrate-everything", locked: { rotation: true, bogus: true },
    }))!);
    const store = createGroundSettingsStore(parameters);
    expect(store.settings).toMatchObject({ version: 1, rotation: "inertia", tireAudio: "slip", tireAudioVolume: 1,
      haptics: "off", selection: "manual", forceModel: "jsbsim", locked: { rotation: true } });
    expect(store.settings.locked).not.toHaveProperty("bogus");
    expect(parameters.get("osfs.ground.lock.rotation")).toBe(true);
  });

  it("never migrates a record from a newer version, or a corrupt one", () => {
    expect(migrateGroundSettings(JSON.stringify({ version: 2, rotation: "inertia", futureField: true }))).toBeNull();
    expect(migrateGroundSettings("{nope")).toBeNull();
  });

  it("keeps the settings in the osfs.ground parameters", () => {
    const parameters = flightParameterDefaults();
    const store = createGroundSettingsStore(parameters);
    store.set(patchGroundSettings(store.settings, LANDING_FEEDBACK));
    expect(parameters.get("osfs.ground.rotation")).toBe("inertia");
    expect(createGroundSettingsStore(parameters).settings).toMatchObject(LANDING_FEEDBACK);
  });

  it("ignores a stored profile label: named sets are presets now", () => {
    const parsed = parseGroundInteractionSettings({ ...base(), profile: "landing-feedback" });
    expect(parsed.ok && parsed.settings).not.toHaveProperty("profile");
  });
});

describe("requested → active → reason", () => {
  it("leaves unimplemented Manual requests inactive with a plain dependency", () => {
    const resolution = resolveGroundInteraction(patchGroundSettings(base(), ROUGH_TERRAIN), CAPABILITIES);
    expect(resolution.active).toMatchObject({ forceModel: "jsbsim", contactModel: "shared", tireAudio: "off", haptics: "off" });
    expect(resolution.entries.forceModel.reason).toMatch(/native per-wheel contact.*no per-wheel contact packet/);
    expect(resolution.entries.contactModel.reason).toMatch(/per-wheel ground support/);
    expect(resolution.entries.tireAudio.reason).toBe("Requires footprint contact");
    expect(resolution.entries.haptics).toMatchObject({ requested: "roughness", active: "off", reason: "Requires footprint contact" });
  });

  it("lets Auto fall back only for unlocked choices, and never to a higher tier", () => {
    const rough = { ...patchGroundSettings(base(), ROUGH_TERRAIN), selection: "auto" as const };
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
    const noAudio = resolveGroundInteraction(patchGroundSettings(base(), LANDING_FEEDBACK),
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
    const requested = patchGroundSettings(base(), LANDING_FEEDBACK);
    const resolution = resolveGroundInteraction(requested, CAPABILITIES, base());
    expect(resolution.entries.rotation).toMatchObject({ requested: "inertia", active: "off", pending: true });
    expect(resolution.entries.tireAudio).toMatchObject({ active: "off", reason: "Requires Finite inertia wheel response" });
    expect(resolveGroundInteraction(requested, CAPABILITIES, requested).active.tireAudio).toBe("slip");
  });
});

describe("named profiles", () => {
  it("become presets of the pilot's, once, with every ground value each held, and the old key stays", () => {
    const valid = { name: "  VR,   silent ", settings: { ...patchGroundSettings(base(), LANDING_FEEDBACK), tireAudioVolume: 0.3, locked: { haptics: true } } };
    const stored = JSON.stringify([{ name: "", settings: base() }, { name: "Bad", settings: "x" }, valid, { ...valid, name: "VR, silent" }]);
    const data = new Map([[GROUND_PROFILES_STORAGE_KEY, stored]]);
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const start = () => {
      const registry = createSettingsRegistry({ storage });
      registry.register(OSFS_PARAMETERS);
      registry.migrateLegacy([groundProfilesMigration(registry)]);
      return registry;
    };
    const registry = start();
    const presets = registry.listPresets();
    expect(presets.map(preset => preset.name)).toEqual(["VR, silent"]);
    expect(presets[0].values).toMatchObject({
      "osfs.ground.rotation": "inertia", "osfs.ground.tireAudio": "slip", "osfs.ground.tireAudioVolume": 0.3,
      "osfs.ground.lock.haptics": true, "osfs.ground.selection": "manual",
    });
    expect(registry.diffPreset(presets[0]).rejected).toEqual([]);
    expect(start().listPresets()).toHaveLength(1);
    expect(data.get(GROUND_PROFILES_STORAGE_KEY)).toBe(stored);
  });
});
