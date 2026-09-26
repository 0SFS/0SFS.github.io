import { describe, expect, it } from "vitest";
import { flightParameterDefaults } from "../settings/flightParameters";
import {
  createAutopilotSettingsStore,
  migrateAutopilotSettings,
  DEFAULT_AUTOPILOT_SETTINGS,
  parseAutopilotSettings,
  patchAutopilotSettings,
  withAllAutopilotAxes,
  type AutopilotSettingsV1,
} from "./autopilotSettings";

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

describe("autopilot settings persist in their parameters", () => {
  it("reads and writes the osfs.autopilot.* parameters", () => {
    const parameters = flightParameterDefaults();
    const store = createAutopilotSettingsStore(parameters);
    expect(store.settings).toEqual(base());
    store.set(patchAutopilotSettings(store.settings, { throttleMode: "hold", axes: { roll: false } }));
    expect(parameters.get("osfs.autopilot.throttleMode")).toBe("hold");
    expect(parameters.get("osfs.autopilot.axes.roll")).toBe(false);
    expect(store.settings.axes).toEqual({ ...base().axes, roll: false });
  });

  it("keeps one snapshot until a parameter changes elsewhere", () => {
    const parameters = flightParameterDefaults();
    const store = createAutopilotSettingsStore(parameters);
    const first = store.settings;
    expect(store.settings).toBe(first);
    parameters.set("osfs.autopilot.backend", "ardupilot");
    expect(store.settings).not.toBe(first);
    expect(store.settings.backend).toBe("ardupilot");
  });

  it("migrates the old record, filling what it left out, and ignores a newer or corrupt one", () => {
    expect(migrateAutopilotSettings(JSON.stringify({ backend: "ours", axes: { roll: false } }))).toEqual({
      "osfs.autopilot.backend": "ours",
      "osfs.autopilot.throttleMode": "airspeed",
      "osfs.autopilot.axes.roll": false,
      "osfs.autopilot.axes.pitch": true,
      "osfs.autopilot.axes.yaw": true,
      "osfs.autopilot.axes.throttle": true,
      "osfs.autopilot.axes.gear": true,
      "osfs.autopilot.axes.flaps": true,
    });
    expect(migrateAutopilotSettings(JSON.stringify({ version: 2, backend: "ardupilot", future: true }))).toBeNull();
    expect(migrateAutopilotSettings("{nope")).toBeNull();
  });

  it("restores the full our-AP package without changing backend", () => {
    const partial = patchAutopilotSettings(base(), { backend: "ardupilot", axes: { roll: false, gear: false } });
    expect(withAllAutopilotAxes(partial).axes).toEqual(DEFAULT_AUTOPILOT_SETTINGS.axes);
    expect(withAllAutopilotAxes(partial).backend).toBe("ardupilot");
  });
});
