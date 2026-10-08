import { createSettingsRegistry, FOSS_EARTH_PARAMETERS } from "foss-earth/settings";
import { describe, expect, it } from "vitest";
import { applySlowDeviceSkyDefaults, offerViewpointSurfaceLighting, verySlowDeviceReason } from "./skyDefaults";

const FAST = { rendererMode: "webgl2", deviceMemoryGiB: 8, hardwareConcurrency: 10 } as const;

describe("the flight's sky defaults", () => {
  it("counts a device very slow by what it reports of itself, never by its name", () => {
    expect(verySlowDeviceReason(FAST)).toBeNull();
    expect(verySlowDeviceReason({ ...FAST, rendererMode: "webgpu" })).toBeNull();
    // Unknown is not slow.
    expect(verySlowDeviceReason({ rendererMode: null, deviceMemoryGiB: null, hardwareConcurrency: null })).toBeNull();
    expect(verySlowDeviceReason({ ...FAST, rendererMode: "webgl" })).toBe("its WebGL 1 renderer");
    expect(verySlowDeviceReason({ ...FAST, deviceMemoryGiB: 2 })).toBe("its 2 GiB of memory");
    expect(verySlowDeviceReason({ ...FAST, hardwareConcurrency: 2 })).toBe("its 2 processor threads");
  });

  it("offers imagery lit as at the aircraft, and makes it the default only on a very slow device", () => {
    const settings = createSettingsRegistry({ storage: null });
    settings.register(FOSS_EARTH_PARAMETERS);
    // FOSS Earth alone lights the planet by each point's own Sun, and offers nothing else lit.
    expect(settings.inspect("sky.surface.lighting").choices.map(choice => choice.id)).toEqual(["daylight", "photograph"]);
    offerViewpointSurfaceLighting(settings);
    expect(settings.inspect("sky.surface.lighting").choices.map(choice => choice.id)).toEqual(["daylight", "photograph", "viewpoint"]);
    settings.setDeviceContext(FAST);
    applySlowDeviceSkyDefaults(settings);
    expect(settings.inspect("sky.surface.lighting")).toMatchObject({ value: "daylight", provenance: "default" });
    settings.setDeviceContext({ rendererMode: "webgl" });
    applySlowDeviceSkyDefaults(settings);
    expect(settings.inspect("sky.surface.lighting")).toMatchObject({ value: "viewpoint", provenance: "host-default" });
    // A pilot's own choice still wins.
    settings.set("sky.surface.lighting", "daylight");
    expect(settings.get("sky.surface.lighting")).toBe("daylight");
  });

  it("renders the light from the ground for a flight, and takes it as one colour on a very slow device", () => {
    const settings = createSettingsRegistry({ storage: null });
    settings.register(FOSS_EARTH_PARAMETERS);
    // The flight's own default and choice, as its app sets them at start.
    settings.setHostDefault("sky.groundLight.mode", "rendered", "a flight lights the aircraft from the ground below it as it is drawn");
    offerViewpointSurfaceLighting(settings);
    settings.setDeviceContext(FAST);
    applySlowDeviceSkyDefaults(settings);
    expect(settings.get("sky.groundLight.mode")).toBe("rendered");
    settings.setDeviceContext({ hardwareConcurrency: 2 });
    applySlowDeviceSkyDefaults(settings);
    expect(settings.inspect("sky.groundLight.mode")).toMatchObject({ value: "uniform", provenance: "host-default" });
    expect(settings.inspect("sky.groundLight.mode").layers.hostDefault?.derivedFrom).toContain("its 2 processor threads");
    settings.set("sky.groundLight.mode", "rendered");
    expect(settings.get("sky.groundLight.mode")).toBe("rendered");
  });
});
