// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppSettings, resetAppSettings } from "foss-earth/settings";
import { DEFAULT_PHONE_SETTINGS } from "../../remote/phoneSettingsStore";
import { flightParameterDefaults, flightParameterStore } from "../settings/flightParameters";
import { registerFlightSettings } from "../settings/registerFlightSettings";
import {
  DEFAULT_PHONE_CONTROLLER_SETTINGS, PHONE_CONTROLLER_PARAMETER_IDS, mergePairedPhoneSettings,
  phoneControllerSettingsValues, readPhoneControllerSettings,
} from "./phoneControllerSettings";

afterEach(() => { vi.unstubAllGlobals(); resetAppSettings(); });

describe("phone controller settings", () => {
  it("have the defaults a phone that was never paired uses", () => {
    expect(DEFAULT_PHONE_CONTROLLER_SETTINGS).toEqual(DEFAULT_PHONE_SETTINGS);
  });

  it("live in the osfs.phone parameters", () => {
    const parameters = flightParameterDefaults();
    const settings = { grid: "top", yawRelease: "hold", yawReturnMs: 350, haptics: true } as const;
    parameters.setMany(phoneControllerSettingsValues(settings));
    expect(readPhoneControllerSettings(parameters)).toEqual(settings);
    expect(Object.keys(phoneControllerSettingsValues(settings)).sort()).toEqual([...PHONE_CONTROLLER_PARAMETER_IDS].sort());
  });

  it("are in this computer's export, in Remote Control → Phone controller", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    });
    const registry = getAppSettings();
    registerFlightSettings(registry);
    const parameters = flightParameterStore(registry);
    expect(parameters.setMany(phoneControllerSettingsValues({ ...DEFAULT_PHONE_CONTROLLER_SETTINGS, grid: "top", yawReturnMs: 300 })).ok).toBe(true);
    expect(registry.export({ tab: "remote", section: "phone" }).values)
      .toEqual({ "osfs.phone.gridPosition": "top", "osfs.phone.yawReturnMs": 300 });
  });

  it("at pairing keep this computer's, except where it still has the default and the phone has chosen", () => {
    const phone = { grid: "top", yawRelease: "hold", yawReturnMs: 500, haptics: true } as const;
    // An imported setup reaches the phone; the phone's own choices fill what was never set here.
    expect(mergePairedPhoneSettings({ ...DEFAULT_PHONE_CONTROLLER_SETTINGS, yawReturnMs: 300 }, phone))
      .toEqual({ grid: "top", yawRelease: "hold", yawReturnMs: 300, haptics: true });
    expect(mergePairedPhoneSettings(DEFAULT_PHONE_CONTROLLER_SETTINGS, DEFAULT_PHONE_CONTROLLER_SETTINGS))
      .toEqual(DEFAULT_PHONE_CONTROLLER_SETTINGS);
  });
});
