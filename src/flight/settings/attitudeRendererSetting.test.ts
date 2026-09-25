import { describe, expect, it, vi } from "vitest";
import { createAttitudeRendererSetting } from "./attitudeRendererSetting";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    values,
  };
}

describe("attitude renderer setting", () => {
  it("starts on Auto, and on whatever was saved before", () => {
    expect(createAttitudeRendererSetting(memoryStorage()).getState().preference).toBe("auto");
    expect(createAttitudeRendererSetting(memoryStorage({ "osfs.attitude-renderer": "canvas2d" })).getState().preference).toBe("canvas2d");
    expect(createAttitudeRendererSetting(memoryStorage({ "osfs.attitude-renderer": "vulkan" })).getState().preference).toBe("auto");
  });

  it("saves a choice and tells subscribers", () => {
    const storage = memoryStorage();
    const setting = createAttitudeRendererSetting(storage);
    const listener = vi.fn();
    setting.subscribe(listener);
    setting.setPreference("webgpu");
    expect(storage.values.get("osfs.attitude-renderer")).toBe("webgpu");
    expect(setting.getState().preference).toBe("webgpu");
    setting.setPreference("webgpu");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("carries what the instrument actually draws with, without saving it", () => {
    const storage = memoryStorage();
    const setting = createAttitudeRendererSetting(storage);
    setting.publishStatus({ preference: "webgpu", backend: "canvas2d", reason: "no device" });
    expect(setting.getState().status).toEqual({ preference: "webgpu", backend: "canvas2d", reason: "no device" });
    expect(storage.values.size).toBe(0);
  });

  it("works without storage", () => {
    const setting = createAttitudeRendererSetting({ getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } });
    setting.setPreference("canvas2d");
    expect(setting.getState().preference).toBe("canvas2d");
  });
});
