import { describe, expect, it } from "vitest";
import { flightParameterDefaults } from "../settings/flightParameters";
import {
  DEFAULT_AUDIO_SETTINGS, createAudioSettingsStore, migrateAudioSettings,
  parseAudioSettings, patchAudioSettings, readSoundTierLimits,
} from "./audioSettings";

describe("audio settings", () => {
  it("defaults to the actual source counts and preserves explicitly saved noise limits", () => {
    expect(readSoundTierLimits(flightParameterDefaults()).map(({ noiseBands }) => noiseBands)).toEqual([5, 6, 8]);
    const saved = flightParameterDefaults({
      "osfs.sound.low.noiseBands": 4, "osfs.sound.med.noiseBands": 5, "osfs.sound.high.noiseBands": 3,
    });
    expect(readSoundTierLimits(saved).map(({ noiseBands }) => noiseBands)).toEqual([4, 5, 3]);
    expect(readSoundTierLimits(saved)[2]).toMatchObject({ grains: 0, startsPerSecond: 0 });
  });

  it("starts disabled, because a saved preference cannot satisfy autoplay, and on Med", () => {
    const store = createAudioSettingsStore(flightParameterDefaults());
    expect(store.settings).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(store.settings.enabled).toBe(false);
    expect(store.settings.requested).toBe("med");
    expect(store.settings.masterVolume).toBe(2);
    expect(store.settings.afterburnerVolume).toBe(0.5);
    expect(store.settings.listenerCockpitBlend).toBe(1);
  });

  it("lives in the osfs.sound parameters, with no downgrade kept as none", () => {
    const parameters = flightParameterDefaults();
    const store = createAudioSettingsStore(parameters);
    expect(store.update({ enabled: true, requested: "low", engineVolume: 0.3, engineMuted: true, downgradedFrom: "med" })).toBeNull();
    expect(parameters.get("osfs.sound.quality")).toBe("low");
    expect(parameters.get("osfs.sound.downgradedFrom")).toBe("med");
    expect(createAudioSettingsStore(parameters).settings)
      .toMatchObject({ enabled: true, requested: "low", engineVolume: 0.3, engineMuted: true, downgradedFrom: "med" });
    store.update({ downgradedFrom: null });
    expect(parameters.get("osfs.sound.downgradedFrom")).toBe("none");
  });

  it("migrates an unversioned record, clamping out-of-range volumes, and ignores a newer or corrupt one", () => {
    expect(migrateAudioSettings(JSON.stringify({ enabled: true, masterVolume: 9, engineVolume: -1 })))
      .toMatchObject({ "osfs.sound.enabled": true, "osfs.sound.masterVolume": 8, "osfs.sound.engineVolume": 0 });
    expect(migrateAudioSettings(JSON.stringify({ version: 2, enabled: true, requested: "high", futureField: 1 }))).toBeNull();
    expect(migrateAudioSettings("{not json")).toBeNull();
  });

  it("reports a change that will not survive a reload as session-only", () => {
    const parameters = { ...flightParameterDefaults(), storageError: () => "Settings could not be saved in this browser." };
    const store = createAudioSettingsStore(parameters);
    expect(store.update({ enabled: true })).toMatch(/this session only/);
    expect(store.readOnlyReason).toMatch(/could not be saved/);
  });

  it("keeps afterburner and viewpoint controls in their saved Sound parameters", () => {
    const parameters = flightParameterDefaults();
    const store = createAudioSettingsStore(parameters);
    expect(store.update({ afterburnerVolume: 0.2, listenerCockpitBlend: 0.35 })).toBeNull();
    expect(parameters.get("osfs.sound.afterburnerVolume")).toBe(0.2);
    expect(parameters.get("osfs.sound.listenerCockpitBlend")).toBe(0.35);
    expect(createAudioSettingsStore(parameters).settings).toMatchObject({ afterburnerVolume: 0.2, listenerCockpitBlend: 0.35 });
    expect(store.settings.engineVolume).toBe(DEFAULT_AUDIO_SETTINGS.engineVolume);
  });

  it("gives older records the quieter afterburner and Cockpit defaults without discarding their volumes", () => {
    const previous = { version: 1, requested: "low", masterVolume: 0.4, engineVolume: 0.3, airframeVolume: 0.2 };
    expect(parseAudioSettings(previous)).toMatchObject({ ok: true, migrated: true,
      settings: { afterburnerVolume: 0.5, listenerCockpitBlend: 1, masterVolume: 0.4, engineVolume: 0.3 } });
    expect(migrateAudioSettings(JSON.stringify(previous))).toMatchObject({
      "osfs.sound.afterburnerVolume": 0.5, "osfs.sound.listenerCockpitBlend": 1, "osfs.sound.engineVolume": 0.3,
    });
  });

  it("bounds both live controls and keeps the current values on invalid patches", () => {
    expect(parseAudioSettings({ afterburnerVolume: -1, listenerCockpitBlend: 2 })).toMatchObject({ ok: true,
      settings: { afterburnerVolume: 0, listenerCockpitBlend: 1 } });
    const current = { ...DEFAULT_AUDIO_SETTINGS, afterburnerVolume: 0.25, listenerCockpitBlend: 0.75 };
    expect(patchAudioSettings(current, { afterburnerVolume: Number.NaN, listenerCockpitBlend: Number.POSITIVE_INFINITY }))
      .toMatchObject({ afterburnerVolume: 0.25, listenerCockpitBlend: 0.75 });
    expect(patchAudioSettings(current, { afterburnerVolume: 2, listenerCockpitBlend: -1 }))
      .toMatchObject({ afterburnerVolume: 1, listenerCockpitBlend: 0 });
  });

  it("keeps engine boost above 100% through parse, migration and the parameter store", () => {
    expect(parseAudioSettings({ version: 1, engineVolume: 4 })).toMatchObject({ ok: true, settings: { engineVolume: 4 } });
    expect(migrateAudioSettings(JSON.stringify({ version: 1, engineVolume: 4 })))
      .toMatchObject({ "osfs.sound.engineVolume": 4 });
    expect(parseAudioSettings({ engineVolume: 9 })).toMatchObject({ ok: true, settings: { engineVolume: 8 } });
    const parameters = flightParameterDefaults();
    const store = createAudioSettingsStore(parameters);
    expect(store.update({ engineVolume: 4 })).toBeNull();
    expect(createAudioSettingsStore(parameters).settings.engineVolume).toBe(4);
    expect(store.settings.afterburnerVolume).toBe(0.5);
    expect(store.settings.masterVolume).toBe(DEFAULT_AUDIO_SETTINGS.masterVolume);
    expect(DEFAULT_AUDIO_SETTINGS.engineVolume).toBe(0.8);
  });

  it("preserves saved master gains and supports the expanded range through parse, migration and storage", () => {
    for (const masterVolume of [0, 0.7, 1, 2, 8]) {
      expect(parseAudioSettings({ version: 1, masterVolume })).toMatchObject({ ok: true, settings: { masterVolume } });
      expect(migrateAudioSettings(JSON.stringify({ version: 1, masterVolume })))
        .toMatchObject({ "osfs.sound.masterVolume": masterVolume });
      const parameters = flightParameterDefaults();
      const store = createAudioSettingsStore(parameters);
      expect(store.update({ masterVolume })).toBeNull();
      expect(createAudioSettingsStore(parameters).settings.masterVolume).toBe(masterVolume);
    }
    expect(parseAudioSettings({ masterVolume: 99 })).toMatchObject({ ok: true, settings: { masterVolume: 8 } });
  });

  it("keeps the current value when a patch field is invalid", () => {
    const current = {
      ...DEFAULT_AUDIO_SETTINGS, requested: "low" as const, masterVolume: 0.4, airframeVolume: 0.2, engineMuted: true,
    };
    expect(patchAudioSettings(current, {
      requested: "ultra" as never, masterVolume: Number.NaN, airframeVolume: Number.NaN, engineMuted: "yes" as never,
    })).toMatchObject({ requested: "low", masterVolume: 0.4, airframeVolume: 0.2, engineMuted: true });
  });

  it("rejects non-objects and unknown versions", () => {
    expect(parseAudioSettings(null)).toMatchObject({ ok: false });
    expect(parseAudioSettings([])).toMatchObject({ ok: false });
    expect(parseAudioSettings({ version: 0 })).toMatchObject({ ok: false });
  });
});
