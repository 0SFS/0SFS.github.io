import { describe, expect, it } from "vitest";
import {
  AUTOPILOT_SETTINGS_STORAGE_KEY,
  createAutopilotSettingsStore,
  DEFAULT_AUTOPILOT_SETTINGS,
  parseAutopilotSettings,
  patchAutopilotSettings,
  withAllAutopilotAxes,
  type AutopilotSettingsV1,
} from "./autopilotSettings";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
  };
}

const base = (): AutopilotSettingsV1 => ({
  ...DEFAULT_AUTOPILOT_SETTINGS,
  axes: { ...DEFAULT_AUTOPILOT_SETTINGS.axes },
});

describe("autopilot settings parse", () => {
  it("defaults to our AP owning every axis, with airspeed auto-throttle", () => {
    const parsed = parseAutopilotSettings({ version: 1 });
    expect(parsed).toEqual({
      ok: true,
      migrated: true,
      settings: DEFAULT_AUTOPILOT_SETTINGS,
    });
    expect(parsed.ok && parsed.settings.axes).toEqual({
      roll: true, pitch: true, yaw: true, throttle: true, gear: true, flaps: true,
    });
  });

  it("keeps valid fields and fills missing axes from the default package", () => {
    const parsed = parseAutopilotSettings({
      version: 1,
      backend: "ardupilot",
      throttleMode: "hold",
      axes: { roll: false, yaw: false },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.migrated).toBe(true);
    expect(parsed.settings.backend).toBe("ardupilot");
    expect(parsed.settings.throttleMode).toBe("hold");
    expect(parsed.settings.axes).toEqual({
      roll: false, pitch: true, yaw: false, throttle: true, gear: true, flaps: true,
    });
  });

  it("rejects a newer version instead of downgrading it", () => {
    expect(parseAutopilotSettings({ version: 2, backend: "ours" })).toEqual({
      ok: false,
      reason: "Saved by a newer version of the game.",
    });
  });

  it("rejects non-objects", () => {
    expect(parseAutopilotSettings("ours").ok).toBe(false);
    expect(parseAutopilotSettings(null).ok).toBe(false);
  });
});

describe("autopilot settings persist", () => {
  it("rewrites partial stored JSON and later edits", () => {
    const storage = memoryStorage({
      [AUTOPILOT_SETTINGS_STORAGE_KEY]: JSON.stringify({ backend: "ours", axes: { roll: false } }),
    });
    const store = createAutopilotSettingsStore(storage);
    expect(store.settings.axes.roll).toBe(false);
    expect(store.settings.axes.pitch).toBe(true);
    expect(JSON.parse(storage.map.get(AUTOPILOT_SETTINGS_STORAGE_KEY)!).version).toBe(1);
    store.set(patchAutopilotSettings(store.settings, { throttleMode: "hold" }));
    expect(JSON.parse(storage.map.get(AUTOPILOT_SETTINGS_STORAGE_KEY)!).throttleMode).toBe("hold");
  });

  it("never overwrites a newer saved blob, and keeps session edits local", () => {
    const newer = JSON.stringify({ version: 2, backend: "ardupilot", future: true });
    const storage = memoryStorage({ [AUTOPILOT_SETTINGS_STORAGE_KEY]: newer });
    const store = createAutopilotSettingsStore(storage);
    expect(store.readOnlyReason).toMatch(/newer version/);
    store.set(patchAutopilotSettings(store.settings, { backend: "ours" }));
    expect(store.settings.backend).toBe("ours");
    expect(storage.map.get(AUTOPILOT_SETTINGS_STORAGE_KEY)).toBe(newer);
  });

  it("recovers from corrupt JSON and storage exceptions", () => {
    expect(createAutopilotSettingsStore(memoryStorage({
      [AUTOPILOT_SETTINGS_STORAGE_KEY]: "{nope",
    })).settings.backend).toBe("ours");
    const failing = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("full"); },
    };
    const store = createAutopilotSettingsStore(failing);
    expect(() => store.set(patchAutopilotSettings(store.settings, { backend: "ardupilot" }))).not.toThrow();
    expect(store.settings.backend).toBe("ardupilot");
    expect(createAutopilotSettingsStore(null).settings).toEqual(base());
  });

  it("restores the full our-AP package without changing backend", () => {
    const partial = patchAutopilotSettings(base(), { backend: "ardupilot", axes: { roll: false, gear: false } });
    expect(withAllAutopilotAxes(partial).axes).toEqual(DEFAULT_AUTOPILOT_SETTINGS.axes);
    expect(withAllAutopilotAxes(partial).backend).toBe("ardupilot");
  });
});
