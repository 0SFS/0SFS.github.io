import { describe, expect, it } from "vitest";
import {
  AUDIO_SETTINGS_STORAGE_KEY, DEFAULT_AUDIO_SETTINGS, createAudioSettingsStore,
  parseAudioSettings, patchAudioSettings, type AudioSettingsStorage,
} from "./audioSettings";

function memoryStorage(initial?: unknown): AudioSettingsStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) {
    data.set(AUDIO_SETTINGS_STORAGE_KEY, typeof initial === "string" ? initial : JSON.stringify(initial));
  }
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}

const stored = (storage: { data: Map<string, string> }): unknown =>
  JSON.parse(storage.data.get(AUDIO_SETTINGS_STORAGE_KEY) ?? "null");

describe("audio settings", () => {
  it("starts disabled on Auto, because a saved preference cannot satisfy autoplay", () => {
    const store = createAudioSettingsStore(memoryStorage());
    expect(store.settings).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(store.settings.enabled).toBe(false);
    expect(store.settings.requested).toBe("auto");
  });

  it("round-trips through storage", () => {
    const storage = memoryStorage();
    expect(createAudioSettingsStore(storage)
      .update({ enabled: true, requested: "low", engineVolume: 0.3, engineMuted: true })).toBeNull();
    expect(createAudioSettingsStore(storage).settings)
      .toMatchObject({ enabled: true, requested: "low", engineVolume: 0.3, engineMuted: true });
  });

  it("migrates an unversioned entry and clamps out-of-range volumes", () => {
    const storage = memoryStorage({ enabled: true, masterVolume: 4, engineVolume: -1 });
    expect(createAudioSettingsStore(storage).settings)
      .toMatchObject({ version: 1, enabled: true, masterVolume: 1, engineVolume: 0 });
    expect(stored(storage)).toMatchObject({ version: 1, masterVolume: 1, engineVolume: 0 });
  });

  it("falls back to defaults on corrupt JSON instead of blocking the flight", () => {
    expect(createAudioSettingsStore(memoryStorage("{not json")).settings).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it("never overwrites settings saved by a newer version", () => {
    const newer = { version: 2, enabled: true, requested: "high", futureField: 1 };
    const storage = memoryStorage(newer);
    const store = createAudioSettingsStore(storage);
    expect(store.readOnlyReason).toMatch(/newer version/);
    expect(store.update({ masterVolume: 0.1 })).toMatch(/this session only/);
    expect(store.settings.masterVolume).toBe(0.1);
    expect(stored(storage)).toEqual(newer);
  });

  it("reports a storage failure as session-only rather than throwing", () => {
    const store = createAudioSettingsStore({
      getItem: () => null,
      setItem: () => { throw new Error("quota"); },
    });
    expect(store.update({ enabled: true })).toMatch(/Could not save/);
    expect(store.settings.enabled).toBe(true);
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
