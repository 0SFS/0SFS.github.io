// @vitest-environment jsdom
import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSettingsRegistry, getAppSettings, resetAppSettings, validateValue } from "foss-earth/settings";
import { FLIGHT_SECTION_TITLES, flightParameterDefaults, OSFS_PARAMETERS } from "./flightParameters";
import { FLIGHT_PRESETS } from "./flightPresets";
import { registerFlightSettings } from "./registerFlightSettings";

afterEach(() => { vi.unstubAllGlobals(); resetAppSettings(); });

/** Sections 0sfs adds parameters to that FOSS Earth owns and titles. */
const FOSS_EARTH_SECTIONS = new Set(["map/detail", "controls/orbit"]);

describe("flight parameter catalogue", () => {
  it("bounds sound sources by their actual counts without unused grain controls", () => {
    const settings = createSettingsRegistry({ storage: null });
    settings.register(OSFS_PARAMETERS);
    for (const [tier, maximum] of [["low", 5], ["med", 6], ["high", 8]] as const) {
      const id = `osfs.sound.${tier}.noiseBands`;
      expect(settings.get(id)).toBe(maximum);
      expect(settings.inspect(id).bounds).toMatchObject({ min: 0, max: maximum });
      expect(settings.set(id, maximum + 1).ok).toBe(false);
    }
    expect(OSFS_PARAMETERS.some(spec => /\.sound\.high\.(grains|grainStarts)$/.test(spec.id))).toBe(false);
  });

  it("registers in a FOSS Earth registry with every default valid, and the same defaults in memory", () => {
    const registry = createSettingsRegistry({ storage: null });
    registry.register(OSFS_PARAMETERS);
    const defaults = flightParameterDefaults();
    for (const spec of OSFS_PARAMETERS) {
      const state = registry.inspect(spec.id);
      expect(validateValue(state.spec, state.value, state.bounds, state.choices), spec.id).toBeNull();
      expect(registry.get(spec.id), spec.id).toEqual(defaults.get(spec.id));
    }
  });

  it("names each parameter under osfs., with a unit, a reason, a titled home and a source that exists", () => {
    const titled = new Set(FLIGHT_SECTION_TITLES.map(([tab, section]) => `${tab}/${section}`));
    for (const spec of OSFS_PARAMETERS) {
      expect(spec.id, spec.id).toMatch(/^osfs\.[a-zA-Z]+\.[a-zA-Z.]+$/);
      expect(spec.description.length, spec.id).toBeGreaterThan(10);
      expect(spec.defaultReason.length, spec.id).toBeGreaterThan(5);
      const home = `${spec.home.tab}/${spec.home.section}`;
      expect(titled.has(home) || FOSS_EARTH_SECTIONS.has(home), `${spec.id} in ${home}`).toBe(true);
      expect(existsSync(spec.source), `${spec.id}: ${spec.source}`).toBe(true);
      if (spec.kind === "number" || spec.kind === "range") expect("bounds" in spec, spec.id).toBe(true);
    }
    expect(new Set(OSFS_PARAMETERS.map(spec => spec.id)).size).toBe(OSFS_PARAMETERS.length);
  });

  it("moves every old key's saved value into the registry once, and leaves the old keys for rollback", () => {
    const old: Record<string, string> = {
      "osfs.flight-terrain-requirement": "8192",
      "osfs.terrain-detail-anchor": "camera",
      "osfs.attitude-renderer": "canvas2d",
      "osfs.arcade-ground-launches": "on",
      "osfs.auto-trim": "off",
      "osfs.auto-roll-trim": "off",
      "osfs.gamepad-polling-rate": "60",
      "osfs.gamepad-response": JSON.stringify({ mode: "direct", responseTimeSec: 0.5, deadzoneMode: "scaled" }),
      "osfs.keyboard-stick": JSON.stringify({ mode: "rate", expo: 0.25, rateTimeToFull: 1.2 }),
      "osfs.autopilot.v1": JSON.stringify({ version: 1, backend: "ardupilot", axes: { gear: false }, throttleMode: "hold" }),
      "osfs.phone-camera-tuning": JSON.stringify({ send: "batch", present: "playout", bufferMs: 16, catchUp: 0, chaseFrame: "heading" }),
      "osfs.audio.settings.v1": JSON.stringify({ version: 1, requested: "low", masterVolume: 0.4 }),
      "osfs.engineMonitor.v1": JSON.stringify({ open: { all: true }, flowUnit: "gal/h" }),
      "osfs.ground-interaction.v1": JSON.stringify({ version: 1, rotation: "inertia", tireAudio: "slip", locked: { haptics: true } }),
      "osfs.aircraft": "cirrus-vision-jet-g2",
      "flight-sim.aircraft": "cessna-172",
      "osfs.aircraft-generation": "g2+",
      "osfs.aircraft-lod": "hd",
    };
    const storage = new Map(Object.entries(old));
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    });
    const settings = getAppSettings();
    registerFlightSettings(settings);
    expect(Object.fromEntries([
      "osfs.flight.minimum", "map.focus.refineFrom", "osfs.renderer.attitudeIndicator", "osfs.ground.arcadeLaunches",
      "osfs.assist.autoTrim", "osfs.assist.autoRollTrim", "osfs.input.gamepadPollingRate", "osfs.input.gamepadResponse",
      "osfs.input.gamepadResponseTime", "osfs.input.gamepadDeadzoneMode", "osfs.input.keyboard.mode",
      "osfs.input.keyboard.expo", "osfs.input.keyboard.rateTimeToFull", "osfs.autopilot.backend",
      "osfs.autopilot.axes.gear", "osfs.autopilot.throttleMode", "osfs.camera.phone.send", "osfs.camera.phone.bufferMs",
      "osfs.camera.phone.catchUp", "osfs.camera.chaseFrame", "osfs.sound.quality", "osfs.sound.masterVolume",
      "osfs.engineMonitor.fuelFlowUnit", "osfs.ground.rotation", "osfs.ground.tireAudio", "osfs.ground.lock.haptics",
      "osfs.aircraft.id", "osfs.aircraft.generation", "osfs.aircraft.lod",
    ].map(id => [id, settings.get(id)]))).toEqual({
      "osfs.flight.minimum": 8192, "map.focus.refineFrom": "camera", "osfs.renderer.attitudeIndicator": "canvas2d",
      "osfs.ground.arcadeLaunches": true, "osfs.assist.autoTrim": false, "osfs.assist.autoRollTrim": false,
      "osfs.input.gamepadPollingRate": 60, "osfs.input.gamepadResponse": "direct", "osfs.input.gamepadResponseTime": 0.5,
      "osfs.input.gamepadDeadzoneMode": "scaled", "osfs.input.keyboard.mode": "rate", "osfs.input.keyboard.expo": 0.25,
      "osfs.input.keyboard.rateTimeToFull": 1.2, "osfs.autopilot.backend": "ardupilot", "osfs.autopilot.axes.gear": false,
      "osfs.autopilot.throttleMode": "hold", "osfs.camera.phone.send": "batch", "osfs.camera.phone.bufferMs": 16,
      "osfs.camera.phone.catchUp": "jump", "osfs.camera.chaseFrame": "heading", "osfs.sound.quality": "low",
      "osfs.sound.masterVolume": 0.4, "osfs.engineMonitor.fuelFlowUnit": "gal/h", "osfs.ground.rotation": "inertia",
      "osfs.ground.tireAudio": "slip", "osfs.ground.lock.haptics": true,
      // The newer key wins over the older one.
      "osfs.aircraft.id": "cirrus-vision-jet-g2", "osfs.aircraft.generation": "g2+", "osfs.aircraft.lod": "hd",
    });
    for (const [key, value] of Object.entries(old)) expect(storage.get(key), key).toBe(value);

    // A second start migrates nothing again, so an edit made since is kept.
    settings.set("osfs.flight.minimum", 1024);
    resetAppSettings();
    const again = getAppSettings();
    registerFlightSettings(again);
    expect(again.get("osfs.flight.minimum")).toBe(1024);
  });

  it("has presets whose every value the app takes, named and described, the defaults among them", () => {
    const settings = getAppSettings();
    registerFlightSettings(settings);
    expect(new Set(FLIGHT_PRESETS.map(preset => preset.id)).size).toBe(FLIGHT_PRESETS.length);
    for (const preset of FLIGHT_PRESETS) {
      expect(preset.id, preset.id).toMatch(/^osfs-[a-z-]+$/);
      expect(preset.description.length, preset.id).toBeGreaterThan(20);
      expect(settings.diffPreset(preset).rejected, preset.id).toEqual([]);
      expect(settings.listPresets().some(listed => listed.id === preset.id), preset.id).toBe(true);
    }
    // A fresh flight matches the presets that stand for the defaults.
    expect(settings.matchingPreset({ tab: "aircraft", section: "ground" })?.id).toBe("osfs-ground-minimal");
    expect(settings.matchingPreset({ tab: "remote", section: "camera", prefix: "osfs.camera.phone." })?.id).toBe("osfs-phone-camera-original");
  });

  it("persists live afterburner and viewpoint controls with one Sound home and fraction bounds", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    });
    const settings = getAppSettings();
    registerFlightSettings(settings);
    expect(settings.inspect("osfs.sound.engineVolume").bounds).toMatchObject({ min: 0, max: 8 });
    expect(settings.get("osfs.sound.masterVolume")).toBe(2);
    expect(settings.inspect("osfs.sound.masterVolume").bounds).toMatchObject({ min: 0, max: 8 });
    settings.set("osfs.sound.masterVolume", 6);
    settings.set("osfs.sound.engineVolume", 4);
    for (const [id, value] of [["osfs.sound.afterburnerVolume", 0.2], ["osfs.sound.listenerCockpitBlend", 0.65]] as const) {
      const inspected = settings.inspect(id);
      expect(inspected.spec.home).toMatchObject({ tab: "sound", section: "sound" });
      expect(inspected.spec).toMatchObject({ unit: "fraction", kind: "number", appliesLive: true });
      expect(inspected.bounds).toMatchObject({ min: 0, max: 1 });
      expect(validateValue(inspected.spec, -0.01, inspected.bounds, inspected.choices)).not.toBeNull();
      expect(validateValue(inspected.spec, 1.01, inspected.bounds, inspected.choices)).not.toBeNull();
      settings.set(id, value);
    }
    resetAppSettings();
    const reloaded = getAppSettings();
    registerFlightSettings(reloaded);
    expect(reloaded.get("osfs.sound.masterVolume")).toBe(6);
    expect(reloaded.get("osfs.sound.engineVolume")).toBe(4);
    expect(reloaded.get("osfs.sound.afterburnerVolume")).toBe(0.2);
    expect(reloaded.get("osfs.sound.listenerCockpitBlend")).toBe(0.65);
  });
});
