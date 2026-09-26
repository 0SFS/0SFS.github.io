import { describe, expect, it } from "vitest";
import { flightParameterDefaults } from "../settings/flightParameters";
import {
  DEFAULT_AUDIO_SETTINGS, createAudioSettingsStore, migrateAudioSettings,
  parseAudioSettings, patchAudioSettings,
} from "./audioSettings";

describe("audio settings", () => {
  it("starts disabled on Auto, because a saved preference cannot satisfy autoplay", () => {
    const store = createAudioSettingsStore(flightParameterDefaults());
    expect(store.settings).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(store.settings.enabled).toBe(false);
    expect(store.settings.requested).toBe("auto");
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
    expect(migrateAudioSettings(JSON.stringify({ enabled: true, masterVolume: 4, engineVolume: -1 })))
      .toMatchObject({ "osfs.sound.enabled": true, "osfs.sound.masterVolume": 1, "osfs.sound.engineVolume": 0 });
    expect(migrateAudioSettings(JSON.stringify({ version: 2, enabled: true, requested: "high", futureField: 1 }))).toBeNull();
    expect(migrateAudioSettings("{not json")).toBeNull();
  });

  it("reports a change that will not survive a reload as session-only", () => {
    const parameters = { ...flightParameterDefaults(), storageError: () => "Settings could not be saved in this browser." };
    const store = createAudioSettingsStore(parameters);
    expect(store.update({ enabled: true })).toMatch(/this session only/);
    expect(store.readOnlyReason).toMatch(/could not be saved/);
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
