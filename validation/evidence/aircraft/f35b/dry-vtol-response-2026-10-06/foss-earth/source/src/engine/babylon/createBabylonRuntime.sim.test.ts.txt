// @vitest-environment jsdom

import { FreeCamera, MeshBuilder, NullEngine, PointLight, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAppSettings } from "../../settings/appSettings";

const mocks = vi.hoisted(() => ({
  createInputController: vi.fn(),
  createGoogleTilesRuntime: vi.fn(),
  createRasterTilesRuntime: vi.fn(),
}));

vi.mock("./createRendererMode", async (importOriginal) => {
  const original = await importOriginal<typeof import("./createRendererMode")>();
  return {
    ...original,
    bootstrapGlobeRenderer: vi.fn(async () => {
      const engine = new NullEngine();
      return {
        renderer: { requested: "auto" as const, mode: "webgl2" as const, engine },
        scene: new Scene(engine),
      };
    }),
  };
});

vi.mock("../../input/createInputController", () => ({
  createInputController: mocks.createInputController,
}));

vi.mock("./createTilesRuntime", () => ({
  createGoogleTilesRuntime: mocks.createGoogleTilesRuntime,
}));

vi.mock("./createRasterTilesRuntime", () => ({
  createRasterTilesRuntime: mocks.createRasterTilesRuntime,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createRasterTilesRuntime.mockImplementation((options: { source: { id: string } }) => ({
    source: options.source,
    update: vi.fn(),
    setSource: vi.fn(),
    setTerrainSource: vi.fn(),
    getMetrics: () => ({ visibleTiles: 1, activeTiles: 1 }),
    getRevision: () => 0,
    sample: () => null,
    getQualityState: () => ({ setting: "auto", activeProfile: "balanced" }),
    setQuality: vi.fn(),
    setDetailTarget: vi.fn(),
    getDetailFeedback: () => ({ support: "unavailable", pending: false, limits: [], effectiveTarget: null }),
    getImageryDiagnostics: () => ({ mode: "legacy", atlas: null }),
    getDisplayedSourceId: () => options.source.id,
    reportFrame: vi.fn(),
    setSuspended: vi.fn(),
    dispose: vi.fn(),
  }));
});

describe("createBabylonRuntime simulation mode", () => {
  it("applies explicit exposure and relative fill, including later lights, without changing local emitters or adding a postprocess", async () => {
    let scheduledFrame: FrameRequestCallback | null = null;
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const settings = getAppSettings();
    settings.setMany({ "renderer.exposureEV": 2, "renderer.ambientFillMultiplier": 0.5 });
    mocks.createGoogleTilesRuntime.mockReturnValue({
      tiles: { visibleTiles: new Set(), activeTiles: new Set(), group: {} },
      update: vi.fn(), setSuspended: vi.fn(), dispose: vi.fn(),
    });
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const runtime = await createBabylonRuntime(document.createElement("canvas"), {
      googleApiKey: "test", preferGoogleTiles: false, simMode: true, settings,
    });
    const config = runtime.scene.imageProcessingConfiguration;
    try {
      const camera = new FreeCamera("flight-camera", new Vector3(0, 0, -10), runtime.scene);
      runtime.scene.activeCamera = camera;
      const localLight = new PointLight("local-emitter", Vector3.Zero(), runtime.scene);
      localLight.intensity = 17;
      expect(config.exposure).toBe(4);
      expect(config.applyByPostProcess).toBe(false);
      expect(config.toneMappingEnabled).toBe(false);
      expect(runtime.scene.getLightByName("sim-light")!.intensity).toBeCloseTo(0.55);
      const background = runtime.scene.clearColor.clone();
      runtime.setSimRunning(false);
      const flush = () => {
        const callback = scheduledFrame;
        scheduledFrame = null;
        callback?.(performance.now());
      };
      flush();
      await Promise.resolve();
      flush();
      expect(runtime.isRendering()).toBe(false);
      requestFrame.mockClear();
      settings.setMany({ "renderer.exposureEV": -1, "renderer.ambientFillMultiplier": 0 });
      expect(config.exposure).toBe(0.5);
      expect(runtime.scene.getLightByName("sim-light")!.intensity).toBe(0);
      expect(localLight.intensity).toBe(17);
      expect(runtime.scene.clearColor.equals(background)).toBe(true);
      expect(requestFrame).toHaveBeenCalledOnce();
      flush();
      requestFrame.mockClear();
      settings.setMany({ "renderer.exposureEV": -1, "renderer.ambientFillMultiplier": 0 });
      expect(requestFrame).not.toHaveBeenCalled();
      runtime.setMapSource("google");
      expect(runtime.scene.getLightByName("google-tiles-light")!.intensity).toBe(0);
      expect(runtime.scene.getLightByName("fallback-light")!.intensity).toBe(0);
      settings.set("renderer.ambientFillMultiplier", 2);
      expect(runtime.scene.getLightByName("sim-light")!.intensity).toBeCloseTo(2.2);
      expect(runtime.scene.getLightByName("google-tiles-light")!.intensity).toBe(2);
      expect(runtime.scene.getLightByName("fallback-light")!.intensity).toBeCloseTo(1.9);
      expect(localLight.intensity).toBe(17);
      expect(camera._postProcesses.filter(Boolean)).toHaveLength(0);
    } finally { runtime.destroy(); }
    settings.set("renderer.exposureEV", 3);
    expect(config.exposure).toBe(0.5);
  });

  it("publishes Google surface revisions to flight contact queries", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    let revision = 1;
    mocks.createGoogleTilesRuntime.mockReturnValue({
      tiles: { visibleTiles: new Set(), activeTiles: new Set(), group: {} },
      getRevision: () => revision,
      update: vi.fn(), setSuspended: vi.fn(), dispose: vi.fn(),
    });
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const runtime = await createBabylonRuntime(document.createElement("canvas"), { googleApiKey: "test", simMode: true });
    try {
      const wall = MeshBuilder.CreateBox("surface", { size: 2 }, runtime.scene);
      wall.metadata = { mapSurface: true };
      wall.position.x = 5;
      wall.parent = runtime.getWorldRoot();
      wall.computeWorldMatrix(true);
      const cast = () => runtime.surface.raycast({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 10);
      expect(cast()?.revision).toBe(1);
      revision = 2;
      expect(cast()?.revision).toBe(2);
    } finally { runtime.destroy(); }
  });
  it("releases streaming and startup holds after Google tiles fail into fallback", async () => {
    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    mocks.createGoogleTilesRuntime.mockReturnValue({
      tiles: { visibleTiles: new Set(), activeTiles: new Set(), group: {} },
      update: vi.fn(), setSuspended: vi.fn(), dispose: vi.fn(),
    });
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const runtime = await createBabylonRuntime(document.createElement("canvas"), { googleApiKey: "test", simMode: true });
    runtime.setSimRunning(false);
    const callbacks = mocks.createGoogleTilesRuntime.mock.calls[0][0] as {
      onLoadStart(): void;
      onLoadError(error: Error, url: string): void;
    };
    callbacks.onLoadStart();
    expect(runtime.isStreamingTiles()).toBe(true);
    callbacks.onLoadError(new Error("test failure"), "test-tile");
    const frame = scheduledFrame as FrameRequestCallback | null;
    frame?.(performance.now());
    expect(runtime.status.mode).toBe("fallback");
    expect(runtime.isStreamingTiles()).toBe(false);
    expect(runtime.isRendering()).toBe(false);
    runtime.destroy();
  });

  it("exposes a world root, simulated view state, and frame tick without globe input", async () => {
    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const runtime = await createBabylonRuntime(document.createElement("canvas"), { simMode: true });
    const tick = vi.fn();
    runtime.setSimTick(tick);
    runtime.setSimViewState({ latDeg: 12, lonDeg: 34, zoomMeters: 900 });

    expect(runtime.getWorldRoot()?.name).toBe("sim-world-root");
    expect(runtime.getViewState()).toMatchObject({ latDeg: 12, lonDeg: 34, zoomMeters: 900 });
    expect(mocks.createInputController).not.toHaveBeenCalled();

    const frame = scheduledFrame as FrameRequestCallback | null;
    expect(frame).not.toBeNull();
    frame?.(performance.now());
    expect(tick).toHaveBeenCalledOnce();
    expect(tick.mock.calls[0]?.[0]).toBeGreaterThan(0);
    expect(runtime.isRendering()).toBe(true);
    runtime.setSimRunning(false);
    const flush = () => {
      const callback = scheduledFrame;
      scheduledFrame = null;
      callback?.(performance.now());
    };
    flush();
    expect(runtime.isRendering()).toBe(false);
    expect(scheduledFrame).toBeNull();
    runtime.requestRender(); // camera movement or asynchronously loaded content
    expect(runtime.isRendering()).toBe(true);
    flush();
    expect(runtime.isRendering()).toBe(false);
    runtime.setSimRunning(true);
    flush();
    expect(runtime.isRendering()).toBe(true);
    expect(scheduledFrame).not.toBeNull();

    runtime.destroy();
  });

  it("draws a model that was not ready on its first frame once it is, without the camera moving, and draws nothing meanwhile", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const runtime = await createBabylonRuntime(document.createElement("canvas"), { simMode: true });
    try {
      runtime.scene.activeCamera = new FreeCamera("flight-camera", new Vector3(0, 0, -10), runtime.scene);
      runtime.setSimRunning(false);
      const frames = vi.fn();
      runtime.setSimTick(frames);
      const flush = () => {
        const callback = scheduledFrame;
        scheduledFrame = null;
        callback?.(performance.now());
      };
      flush();
      await vi.advanceTimersByTimeAsync(5);
      flush();
      frames.mockClear();
      expect(runtime.isRendering()).toBe(false);

      // A model arrives between frames whose material is still compiling.
      let ready = false;
      const model = MeshBuilder.CreateBox("aircraft", { size: 2 }, runtime.scene);
      // Geometry is there; only the complete check, which the material answers, fails.
      vi.spyOn(model, "isReady").mockImplementation((completeCheck?: boolean) => !completeCheck || ready);
      // Babylon reports it a millisecond later; that asks for one frame.
      await vi.advanceTimersByTimeAsync(5);
      expect(scheduledFrame).not.toBeNull();
      flush();
      expect(frames).toHaveBeenCalledOnce();
      const active = runtime.scene.getActiveMeshes();
      expect(active.data.slice(0, active.length)).toContain(model);
      expect(runtime.isRendering()).toBe(false);

      // It could not be drawn: no frame is drawn while it compiles...
      await vi.advanceTimersByTimeAsync(1_000);
      expect(scheduledFrame).toBeNull();
      // ...and exactly one once it is ready.
      ready = true;
      await vi.advanceTimersByTimeAsync(300);
      expect(scheduledFrame).not.toBeNull();
      flush();
      expect(frames).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(scheduledFrame).toBeNull();
    } finally {
      runtime.destroy();
      vi.useRealTimers();
    }
  });

  it("keeps the flight camera active through paused raster and Google map switches", async () => {
    mocks.createGoogleTilesRuntime.mockReturnValue({
      tiles: { visibleTiles: new Set(), activeTiles: new Set(), group: {} },
      update: vi.fn(), setSuspended: vi.fn(), dispose: vi.fn(),
    });
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const runtime = await createBabylonRuntime(document.createElement("canvas"), { googleApiKey: "test", simMode: true });
    const flightCamera = new FreeCamera("flight-camera", Vector3.Zero(), runtime.scene);
    runtime.scene.activeCamera = flightCamera;
    runtime.setSimRunning(false);

    runtime.setMapSource({ id: "test-raster", label: "Test raster", provider: "test", urlTemplate: "https://example.test/{z}/{x}/{y}.png", attribution: "test" });
    expect(runtime.scene.activeCamera).toBe(flightCamera);

    runtime.setMapSource("google");
    expect(runtime.scene.activeCamera).toBe(flightCamera);
    runtime.destroy();
  });

  it("retains visible Google coverage until replacement raster coverage is ready", async () => {
    const googleRuntime = {
      tiles: { visibleTiles: new Set(["google-tile"]), activeTiles: new Set(["google-tile"]), group: {} },
      update: vi.fn(), setSuspended: vi.fn(), dispose: vi.fn(),
    };
    mocks.createGoogleTilesRuntime.mockReturnValue(googleRuntime);
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const runtime = await createBabylonRuntime(document.createElement("canvas"), { googleApiKey: "test", simMode: true });

    runtime.setMapSource({ id: "test-raster", label: "Test raster", provider: "test", urlTemplate: "https://example.test/{z}/{x}/{y}.png", attribution: "test" });
    expect(googleRuntime.dispose).not.toHaveBeenCalled();

    const callbacks = mocks.createRasterTilesRuntime.mock.calls.at(-1)?.[0] as { onLoadEnd(visibleTiles: number, activeTiles: number): void };
    callbacks.onLoadEnd(1, 1);
    expect(googleRuntime.dispose).toHaveBeenCalledOnce();
    runtime.destroy();
  });

  it("keeps fallback illumination out of incoming Google materials before they compile", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    mocks.createGoogleTilesRuntime.mockReturnValue({
      tiles: { visibleTiles: new Set(), activeTiles: new Set(), group: {} },
      update: vi.fn(), setSuspended: vi.fn(), dispose: vi.fn(),
    });
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const runtime = await createBabylonRuntime(document.createElement("canvas"), { googleApiKey: "test", simMode: true });
    try {
      const incoming = MeshBuilder.CreatePlane("incoming-google-ground", { size: 2 }, runtime.scene);
      incoming.setEnabled(false);
      const fallbackLight = runtime.scene.getLightByName("fallback-light")!;
      const fallbackGlobe = runtime.scene.getMeshByName("fallback-globe")!;
      expect(fallbackLight.canAffectMesh(fallbackGlobe)).toBe(true);
      expect(fallbackLight.canAffectMesh(incoming)).toBe(false);
      const incomingLights = [...incoming.lightSources];
      fallbackLight.setEnabled(false);
      expect(incoming.lightSources).toEqual(incomingLights);
    } finally { runtime.destroy(); }
  });

  it.each([false, true])("removes the previous ground in the first Google frame while loading continues (raster: %s)", async (fromRaster) => {
    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const visibleTiles = new Set<string>();
    const googleRuntime = {
      tiles: { visibleTiles, activeTiles: visibleTiles, group: {} },
      update: vi.fn(), setSuspended: vi.fn(), dispose: vi.fn(),
    };
    mocks.createGoogleTilesRuntime.mockReturnValue(googleRuntime);
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const runtime = await createBabylonRuntime(document.createElement("canvas"), { googleApiKey: "test", simMode: true });
    try {
      let raster: { update: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> } | null = null;
      if (fromRaster) {
        runtime.setMapSource({ id: "test-raster", label: "Test raster", provider: "test", urlTemplate: "https://example.test/{z}/{x}/{y}.png", attribution: "test" });
        raster = mocks.createRasterTilesRuntime.mock.results.at(-1)!.value;
        runtime.setMapSource("google");
        expect(raster!.dispose).not.toHaveBeenCalled();
      }
      const callbacks = mocks.createGoogleTilesRuntime.mock.calls.at(-1)![0] as { onLoadStart(): void };
      callbacks.onLoadStart();
      // The tileset can keep streaming for the whole flight: load-end is not
      // the moment its first replacement surface becomes drawable.
      googleRuntime.update.mockImplementation(() => visibleTiles.add("ready-google-ground"));
      raster?.update.mockClear();
      const render = vi.spyOn(runtime.scene, "render").mockImplementation(() => {
        expect(runtime.scene.getMeshByName("fallback-globe")?.isEnabled()).toBe(false);
        if (raster) expect(raster.dispose).toHaveBeenCalledOnce();
      });
      (scheduledFrame as FrameRequestCallback | null)?.(performance.now());
      expect(render).toHaveBeenCalledOnce();
      expect(runtime.isStreamingTiles()).toBe(true);
      // Retired raster coverage must also stop traversing and requesting work.
      if (raster) expect(raster.update).not.toHaveBeenCalled();
    } finally { runtime.destroy(); }
  });

  it("retires Google on the first raster frame without waiting for streaming to finish", async () => {
    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const googleRuntime = {
      tiles: { visibleTiles: new Set(["ready-google-ground"]), activeTiles: new Set(["ready-google-ground"]), group: {} },
      update: vi.fn(), setSuspended: vi.fn(), dispose: vi.fn(),
    };
    mocks.createGoogleTilesRuntime.mockReturnValue(googleRuntime);
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const runtime = await createBabylonRuntime(document.createElement("canvas"), { googleApiKey: "test", simMode: true });
    try {
      runtime.setMapSource({ id: "test-raster", label: "Test raster", provider: "test", urlTemplate: "https://example.test/{z}/{x}/{y}.png", attribution: "test" });
      expect(googleRuntime.dispose).not.toHaveBeenCalled();
      const callbacks = mocks.createRasterTilesRuntime.mock.calls.at(-1)![0] as { onLoadStart(): void };
      callbacks.onLoadStart();
      const render = vi.spyOn(runtime.scene, "render").mockImplementation(() => {
        expect(googleRuntime.dispose).toHaveBeenCalledOnce();
        expect(runtime.scene.getMeshByName("fallback-globe")?.isEnabled()).toBe(false);
      });
      const now = performance.now();
      (scheduledFrame as FrameRequestCallback | null)?.(now);
      expect(render).toHaveBeenCalledOnce();
      expect(runtime.isStreamingTiles()).toBe(true);
      googleRuntime.update.mockClear();
      (scheduledFrame as FrameRequestCallback | null)?.(now + 20);
      expect(googleRuntime.update).not.toHaveBeenCalled();
    } finally { runtime.destroy(); }
  });

  it("exposes Google terrain detail controls and refines from the simulation origin once flight attaches it", async () => {
    const setTerrainDetailTarget = vi.fn();
    const detail = { defaultErrorTarget: 20, errorTarget: 20, overrideErrorTarget: null };
    mocks.createGoogleTilesRuntime.mockReturnValue({
      tiles: { visibleTiles: new Set(), activeTiles: new Set(), group: {} },
      getTerrainDetailState: () => detail,
      setTerrainDetailTarget,
      update: vi.fn(), setSuspended: vi.fn(), dispose: vi.fn(),
    });
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const { getAppSettings } = await import("../../settings/appSettings");
    // A flight refines from its focus point, the simulation origin.
    getAppSettings().setHostDefault("map.focus.refineFrom", "focus", "the flight");
    const runtime = await createBabylonRuntime(document.createElement("canvas"), { googleApiKey: "test", simMode: true });

    expect(runtime.getGoogleTerrainDetailState()).toEqual(detail);
    runtime.setGoogleTerrainDetailTarget(48);
    expect(setTerrainDetailTarget).toHaveBeenCalledWith(48);
    expect(runtime.getGoogleTerrainDetailAnchor()).toBe("focus-point");

    const callbacks = mocks.createGoogleTilesRuntime.mock.calls[0][0] as {
      getTerrainDetailAnchor(): Vector3 | null;
    };
    expect(callbacks.getTerrainDetailAnchor()).toBeNull();
    runtime.getWorldRoot()!.parent = new TransformNode("world-shift", runtime.scene);
    expect(callbacks.getTerrainDetailAnchor()).toEqual(Vector3.Zero());

    getAppSettings().set("map.focus.refineFrom", "camera");
    expect(runtime.getGoogleTerrainDetailAnchor()).toBe("camera");
    expect(callbacks.getTerrainDetailAnchor()).toBeNull();
    runtime.destroy();
  });

  it("publishes loaded Google detail changes without render polling and unsubscribes on teardown", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const detail = { defaultErrorTarget: 20, errorTarget: 5, overrideErrorTarget: 5, loadedErrorTarget: 100 };
    mocks.createGoogleTilesRuntime.mockReturnValue({
      tiles: { visibleTiles: new Set(), activeTiles: new Set(), group: {} },
      getTerrainDetailState: () => detail,
      update: vi.fn(), setSuspended: vi.fn(), dispose: vi.fn(),
    });
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const runtime = await createBabylonRuntime(document.createElement("canvas"), { googleApiKey: "test", simMode: true });
    const callbacks = mocks.createGoogleTilesRuntime.mock.calls[0][0] as { onDetailFeedback(): void };
    const values: Array<number | null> = [];
    const stop = runtime.onGoogleDetailFeedback(() => values.push(runtime.getGoogleTerrainDetailState()!.loadedErrorTarget));
    detail.loadedErrorTarget = 10;
    callbacks.onDetailFeedback();
    expect(values).toEqual([10]);
    expect(runtime.getGoogleTerrainDetailState()!.errorTarget).toBe(5);
    stop();
    callbacks.onDetailFeedback();
    expect(values).toEqual([10]);
    const afterDestroy = vi.fn();
    runtime.onGoogleDetailFeedback(afterDestroy);
    runtime.destroy();
    callbacks.onDetailFeedback();
    expect(afterDestroy).not.toHaveBeenCalled();
  });

  it("lists a host's focus points and hands the selected one's region to the map", async () => {
    mocks.createGoogleTilesRuntime.mockReturnValue({
      tiles: { visibleTiles: new Set(), activeTiles: new Set(), group: {} },
      update: vi.fn(), setSuspended: vi.fn(), dispose: vi.fn(),
    });
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const { getAppSettings } = await import("../../settings/appSettings");
    const settings = getAppSettings();
    const runtime = await createBabylonRuntime(document.createElement("canvas"), { googleApiKey: "test", simMode: true });
    const google = mocks.createGoogleTilesRuntime.mock.calls[0][0] as {
      getTerrainDetailAnchor(): Vector3 | null;
      getFocus(): { mode: string; position: { x: number; y: number; z: number }; radiusMeters: number; finestErrorPx: number | null; horizonCull: boolean } | null;
    };
    const choices = () => settings.inspect("map.focus.point")?.choices.map(choice => choice.id);
    expect(choices()).toEqual(["orbit-target"]);

    let position: { x: number; y: number; z: number } | null = { x: 6_378_137, y: 10, z: 20 };
    const getPosition = vi.fn(() => position);
    const unregister = runtime.registerFocusPoint({ id: "aircraft", label: "Aircraft", getPosition });
    expect(choices()).toEqual(["orbit-target", "aircraft"]);
    // Before flight attaches the floating origin, the simulation origin is not known.
    expect(runtime.getFocusPosition()).toBeNull();
    settings.set("map.focus.point", "aircraft");
    expect(runtime.getFocusPosition()).toEqual(position);

    // The view alone decides what loads until the mode asks for a region.
    expect(google.getFocus()).toBeNull();
    settings.set("map.focus.mode", "around");
    settings.set("map.focus.radius", 5000);
    settings.set("map.focus.detailBelow.google", 64);
    expect(google.getFocus()).toEqual({ mode: "around", position, radiusMeters: 5000, finestErrorPx: 64, horizonCull: true });

    // Mesh detail can be measured from the same point; the world root is not shifted, so scene is ECEF.
    settings.set("map.focus.refineFrom", "focus");
    expect(google.getTerrainDetailAnchor()).toEqual(new Vector3(6_378_137, 10, 20));

    // A point that cannot say where it is gives no region, rather than a wrong one.
    position = { x: Number.NaN, y: 0, z: 0 };
    expect(google.getFocus()).toBeNull();
    getPosition.mockImplementation(() => { throw new Error("no aircraft"); });
    expect(runtime.getFocusPosition()).toBeNull();

    // Removed, the saved choice waits for the point to come back.
    unregister();
    expect(choices()).toEqual(["orbit-target"]);
    expect(settings.get("map.focus.point")).toBe("orbit-target");
    runtime.registerFocusPoint({ id: "aircraft", label: "Aircraft", getPosition: () => ({ x: 1, y: 2, z: 3 }) });
    expect(settings.get("map.focus.point")).toBe("aircraft");
    expect(() => runtime.registerFocusPoint({ id: "orbit-target", label: "Mine", getPosition: () => null })).toThrow();
    runtime.destroy();
  });

  it("reads the focus point once per frame and gives 2D imagery its finest offset", async () => {
    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const { resolveRasterBaseMapSource } = await import("./rasterBaseMaps");
    const { getAppSettings } = await import("../../settings/appSettings");
    const settings = getAppSettings();
    const runtime = await createBabylonRuntime(document.createElement("canvas"), {
      preferGoogleTiles: false, rasterBaseMap: resolveRasterBaseMapSource("usgs-topo"), simMode: true,
    });
    const raster = mocks.createRasterTilesRuntime.mock.calls[0][0] as {
      getFocus(): { mode: string; position: { x: number; y: number; z: number }; offsetCap: number | null } | null;
    };
    const getPosition = vi.fn(() => ({ x: 6_378_137, y: 0, z: 0 }));
    runtime.registerFocusPoint({ id: "aircraft", label: "Aircraft", getPosition });
    settings.set("map.focus.point", "aircraft");
    settings.set("map.focus.mode", "both");
    // "As the detail setting" leaves the offset to the view.
    expect(raster.getFocus()).toMatchObject({ mode: "both", offsetCap: null });
    settings.set("map.focus.detailBelow.imagery", -1);
    expect(raster.getFocus()).toMatchObject({ offsetCap: -1 });

    // Within a frame both maps see one position; the tick reads it once.
    const rasterRuntime = mocks.createRasterTilesRuntime.mock.results[0].value as { update: ReturnType<typeof vi.fn> };
    rasterRuntime.update.mockImplementation(() => { raster.getFocus(); raster.getFocus(); });
    getPosition.mockClear();
    runtime.requestRender();
    (scheduledFrame as FrameRequestCallback | null)?.(performance.now());
    expect(getPosition).toHaveBeenCalledOnce();
    runtime.destroy();
  });

  it("follows the map source and elevation parameters wherever they change", async () => {
    mocks.createGoogleTilesRuntime.mockReturnValue({
      tiles: { visibleTiles: new Set(), activeTiles: new Set(), group: {} },
      update: vi.fn(), setSuspended: vi.fn(), dispose: vi.fn(),
    });
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const { resolveRasterBaseMapSource } = await import("./rasterBaseMaps");
    const { getAppSettings } = await import("../../settings/appSettings");
    const settings = getAppSettings();
    const runtime = await createBabylonRuntime(document.createElement("canvas"), {
      googleApiKey: "test", preferGoogleTiles: false, rasterBaseMap: resolveRasterBaseMapSource("usgs-topo"), simMode: true,
    });
    expect(runtime.status.mode).toBe("raster-basemap");
    settings.set("map.source.basemap", "google");
    expect(runtime.status.mode).toBe("google-tiles");
    settings.set("map.source.basemap", "osm-standard");
    expect(runtime.status.rasterBaseMap?.id).toBe("osm-standard");
    settings.set("map.source.elevation", "aws-terrarium");
    expect(runtime.status.terrainSource?.id).toBe("aws-terrarium");
    runtime.destroy();
    settings.set("map.source.basemap", "usgs-topo");
    expect(runtime.status.rasterBaseMap?.id).toBe("osm-standard");
  });

  it("requests a keyed source with the provider's key, and follows key changes", async () => {
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const { resolveRasterBaseMapSource } = await import("./rasterBaseMaps");
    const { getAppSettings } = await import("../../settings/appSettings");
    const settings = getAppSettings();
    const runtime = await createBabylonRuntime(document.createElement("canvas"), {
      preferGoogleTiles: false, rasterBaseMap: resolveRasterBaseMapSource("carto-positron"), simMode: true,
    });
    const created = mocks.createRasterTilesRuntime.mock.calls[0][0] as { source: { urlTemplate: string } };
    expect(created.source.urlTemplate).not.toContain("api_key");
    settings.set("map.source.cartoKey", "k 1");
    const raster = mocks.createRasterTilesRuntime.mock.results[0].value as { setSource: ReturnType<typeof vi.fn> };
    expect(raster.setSource).toHaveBeenLastCalledWith(expect.objectContaining({ id: "carto-positron", urlTemplate: expect.stringMatching(/\?api_key=k%201$/) }));
    // The rest of the app never sees the key.
    expect(runtime.status.rasterBaseMap?.urlTemplate).not.toContain("api_key");
    runtime.destroy();
  });

  it("uses an overhead camera to select normal Google tiles while terrain is preparing", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    mocks.createGoogleTilesRuntime.mockReturnValue({
      tiles: { visibleTiles: new Set(), activeTiles: new Set(), group: {} },
      update: vi.fn(), setSuspended: vi.fn(), dispose: vi.fn(),
    });
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const runtime = await createBabylonRuntime(document.createElement("canvas"), { googleApiKey: "test", simMode: true });
    const flightCamera = new FreeCamera("flight-camera", Vector3.Zero(), runtime.scene);
    runtime.scene.activeCamera = flightCamera;
    const worldShift = new TransformNode("world-shift", runtime.scene);
    runtime.getWorldRoot()!.parent = worldShift;
    const abort = new AbortController();
    const preparation = runtime.prepareTerrain({ latDeg: 45, lonDeg: -93, radiusMeters: 1000, signal: abort.signal });

    expect(runtime.scene.activeCamera?.name).toBe("terrain-preparation-camera");
    abort.abort();
    await expect(preparation).rejects.toMatchObject({ name: "AbortError" });
    expect(runtime.scene.activeCamera).toBe(flightCamera);
    runtime.destroy();
  });

  it("on Google, waits until the renderer has loaded what it chose before taking its surface as ground", async () => {
    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const loading = { cachedTiles: 10, cachedBytes: 0, queued: 3, downloading: 2, parsing: 1, waitingToParse: 1, preparingChildren: 0 };
    mocks.createGoogleTilesRuntime.mockReturnValue({
      tiles: { visibleTiles: new Set(), activeTiles: new Set(), group: {} },
      getLoadingState: () => loading,
      update: vi.fn(), setSuspended: vi.fn(), dispose: vi.fn(),
    });
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const runtime = await createBabylonRuntime(document.createElement("canvas"), { googleApiKey: "test", simMode: true });
    // A coarse tile's surface, kilometres above the ground, until the renderer refines.
    const sample = vi.spyOn(runtime.surface, "sample").mockReturnValue({
      point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, distanceMeters: 1,
      heightMeters: 4200, meshId: "terrain", revision: 1, quality: 10, geometricErrorMeters: 20_000,
    });
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const preparation = runtime.prepareTerrain({ latDeg: 45, lonDeg: -93, radiusMeters: 1000 });
    let settled = false;
    void preparation.then(() => { settled = true; }, () => { settled = true; });
    const frame = async () => {
      clock += 250;
      const callback = scheduledFrame;
      scheduledFrame = null;
      callback?.(clock);
      await Promise.resolve();
    };
    for (let i = 0; i < 4; i++) await frame();
    expect(settled).toBe(false);
    // Nothing downloading, but children still being prepared: finer tiles are yet to be asked for.
    Object.assign(loading, { queued: 0, downloading: 0, parsing: 0, waitingToParse: 0, preparingChildren: 4 });
    for (let i = 0; i < 4; i++) await frame();
    expect(settled).toBe(false);
    // Loaded: the refined surface is the ground, once two checks agree the renderer is idle.
    Object.assign(loading, { preparingChildren: 0 });
    sample.mockReturnValue({
      point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, distanceMeters: 1,
      heightMeters: 300, meshId: "terrain", revision: 2, quality: 10, geometricErrorMeters: 4,
    });
    await frame();
    expect(settled).toBe(false);
    await frame();
    await expect(preparation).resolves.toEqual({ groundHeightMeters: 300, altitudeMeters: 1824 });
    runtime.destroy();
  });

  it("starts once one complete displayed-terrain snapshot is available", async () => {
    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    mocks.createGoogleTilesRuntime.mockReturnValue({
      tiles: { visibleTiles: new Set(), activeTiles: new Set(), group: {} },
      update: vi.fn(), setSuspended: vi.fn(), dispose: vi.fn(),
    });
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const runtime = await createBabylonRuntime(document.createElement("canvas"), { googleApiKey: "test", simMode: true });
    vi.spyOn(runtime.surface, "sample").mockReturnValue({
      point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, distanceMeters: 1,
      heightMeters: 300, meshId: "terrain", revision: 1, quality: 10, geometricErrorMeters: 500_000,
    });
    const progress = vi.fn();
    const preparation = runtime.prepareTerrain({ latDeg: 45, lonDeg: -93, radiusMeters: 1000, onProgress: progress });

    scheduledFrame?.(0);
    await expect(preparation).resolves.toEqual({ groundHeightMeters: 300, altitudeMeters: 1824 });
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "ready", progress: 1 }));
    expect(runtime.geospatialCamera?.isEnabled()).toBe(true);
    runtime.destroy();
  });
});

describe("createBabylonRuntime camera and input parameters", () => {
  it("gives the globe camera and its input their parameters, and follows changes", async () => {
    const setRates = vi.fn();
    mocks.createInputController.mockReturnValue({ setRates, destroy: vi.fn() });
    const { getAppSettings } = await import("../../settings/appSettings");
    const settings = getAppSettings();
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const runtime = await createBabylonRuntime(document.createElement("canvas"));
    const camera = runtime.geospatialCamera!;
    try {
      // Unchanged by default: Babylon's field of view, and the old limits.
      expect(camera.fov).toBeCloseTo(0.8, 9);
      expect(camera.limits.radiusMin).toBe(25);
      expect(setRates).toHaveBeenLastCalledWith(expect.objectContaining({ mouseOrbitDegPerPx: 0.03, touchPanRate: 0.48 }));

      settings.set("camera.fieldOfView", 60);
      expect(camera.fov).toBeCloseTo(Math.PI / 3, 9);

      runtime.setViewState({ zoomMeters: 5_000_000, pitchDeg: 80 });
      settings.set("camera.zoomLimits", { min: 100, max: 1_000_000 });
      settings.set("camera.pitchLimits", { min: 10, max: 60 });
      expect(camera.limits.radiusMin).toBe(100);
      // A view outside new limits moves inside them at once.
      expect(runtime.getViewState()).toMatchObject({ zoomMeters: 1_000_000, pitchDeg: expect.closeTo(60, 6) });

      settings.set("input.touch.panRate", 1.2);
      expect(setRates).toHaveBeenLastCalledWith(expect.objectContaining({ touchPanRate: 1.2, mouseOrbitDegPerPx: 0.03 }));
    } finally {
      for (const id of ["camera.fieldOfView", "camera.zoomLimits", "camera.pitchLimits", "input.touch.panRate"]) settings.reset(id);
      runtime.destroy();
    }
  });
});

describe("createBabylonRuntime navigation camera", () => {
  it("keeps globe input and momentum during terrain preparation, and initializes each new destination", async () => {
    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    mocks.createInputController.mockReturnValue({ setRates: vi.fn(), destroy: vi.fn() });
    mocks.createGoogleTilesRuntime.mockReturnValue({
      tiles: { visibleTiles: new Set(), activeTiles: new Set(), group: {} },
      update: vi.fn(), setSuspended: vi.fn(), dispose: vi.fn(),
    });
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const runtime = await createBabylonRuntime(document.createElement("canvas"), { googleApiKey: "test" });
    vi.spyOn(runtime.surface, "sample").mockReturnValue(null);
    const camera = runtime.geospatialCamera!;
    const first = new AbortController();
    const second = new AbortController();
    const frame = () => {
      const callback = scheduledFrame;
      scheduledFrame = null;
      callback?.(performance.now());
    };
    try {
      const preparation = runtime.prepareTerrain({ latDeg: 45, lonDeg: -93, radiusMeters: 1000, signal: first.signal }).catch(error => error);
      const destination = camera.center.clone();
      const preparationPitch = camera.pitch;
      expect(camera.radius).toBe(3000);
      runtime.applyGlobeNavigationIntents({ dt: 1 / 60, intents: [
        { actionId: "globe.panX", value: 1 },
        { actionId: "globe.orbitHeading", value: 1 },
        { actionId: "globe.orbitPitch", value: 1 },
        { actionId: "globe.zoom", value: 1 },
      ] });
      frame();
      expect(Vector3.Distance(camera.center, destination)).toBeGreaterThan(0);
      expect(camera.yaw).toBeGreaterThan(0);
      expect(camera.pitch).toBeGreaterThan(0);
      expect(camera.radius).toBeLessThan(3000);
      const movingYaw = camera.yaw;
      frame();
      expect(camera.yaw).toBeGreaterThan(movingYaw);
      const interruptedYaw = camera.yaw;
      const interruptedRadius = camera.radius;
      first.abort();
      await expect(preparation).resolves.toMatchObject({ name: "AbortError" });
      expect(camera.yaw).toBe(interruptedYaw);
      expect(camera.radius).toBe(interruptedRadius);
      frame();
      expect(camera.yaw).toBeGreaterThan(interruptedYaw);
      expect(camera.radius).toBeLessThan(interruptedRadius);

      const next = runtime.prepareTerrain({ latDeg: 46, lonDeg: -92, radiusMeters: 2000, signal: second.signal }).catch(error => error);
      expect(camera.radius).toBe(6000);
      expect(camera.yaw).toBe(0);
      expect(camera.pitch).toBe(preparationPitch);
      expect(Vector3.Distance(camera.center, destination)).toBeGreaterThan(1000);
      second.abort();
      await expect(next).resolves.toMatchObject({ name: "AbortError" });
    } finally {
      first.abort();
      second.abort();
      runtime.destroy();
    }
  });

  it("puts the globe camera anywhere while a lease holds it, and gives back its limits and collisions", async () => {
    mocks.createInputController.mockReturnValue({ setRates: vi.fn(), setSuspended: vi.fn(), destroy: vi.fn() });
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const { enuDirection, enuFrame, geodeticPoint, add, scale, cross, normalize } = await import("../../scenes/panoramaMath");
    const runtime = await createBabylonRuntime(document.createElement("canvas"));
    const camera = runtime.geospatialCamera!;
    // Right-handed, as the app's renderer makes its scene.
    runtime.scene.useRightHandedSystem = true;
    try {
      const acquired = runtime.acquireNavigation({ owner: "test", inputContext: "panorama" });
      if (!acquired.ok) throw new Error(acquired.message);
      const { lease } = acquired;
      // 3 m above the ground, looking 20° above the horizon, rolled 5°: nearer than the zoom limit and above the pitch limit.
      const frame = enuFrame(-93.235, 44.974);
      const toEcef = (v: readonly [number, number, number]) => add(add(scale(frame.east, v[0]), scale(frame.north, v[1])), scale(frame.up, v[2]));
      const position = geodeticPoint(-93.235, 44.974, 253);
      const forward = toEcef(enuDirection(70, 20));
      const level = toEcef(enuDirection(70, 110));
      const roll = (5 * Math.PI) / 180;
      const up = add(scale(level, Math.cos(roll)), scale(normalize(cross(forward, level)), Math.sin(roll)));
      const view = { position: { x: position[0], y: position[1], z: position[2] }, forward: { x: forward[0], y: forward[1], z: forward[2] }, up: { x: up[0], y: up[1], z: up[2] }, verticalFovRad: 1.2 };

      expect(runtime.placeNavigationCamera(lease, view)).toBe(true);
      const m = camera.getViewMatrix(true).m;
      [camera.position.x, camera.position.y, camera.position.z].forEach((value, i) => expect(value).toBeCloseTo(position[i], 6));
      [-m[2], -m[6], -m[10]].forEach((value, i) => expect(value).toBeCloseTo(forward[i], 6));
      [m[1], m[5], m[9]].forEach((value, i) => expect(value).toBeCloseTo(up[i], 6));
      expect(camera.fov).toBe(1.2);
      expect(camera.checkCollisions).toBe(false);

      expect(runtime.restoreNavigationSnapshot(lease.overview, lease)).toBe(true);
      expect(camera.checkCollisions).toBe(true);
      expect(camera.limits.radiusMin).toBe(25);
      expect(camera.limits.pitchMax).toBeCloseTo(Math.PI / 2 - 0.01, 9);
      expect(camera.radius).toBeCloseTo(lease.overview.camera.radius, 6);

      // Placed again, the lease's end gives the limits back too; without the lease, nothing moves.
      expect(runtime.placeNavigationCamera(lease, view)).toBe(true);
      lease.release("exit");
      expect(camera.checkCollisions).toBe(true);
      expect(camera.limits.radiusMin).toBe(25);
      expect(runtime.placeNavigationCamera(lease, view)).toBe(false);
    } finally {
      runtime.destroy();
    }
  });

  it("hands a placed camera back moving: the eye where it was, gliding on, as near as it was, and input begun since carrying on", async () => {
    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const setSuspended = vi.fn();
    mocks.createInputController.mockReturnValue({ setRates: vi.fn(), setSuspended, destroy: vi.fn() });
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const { enuDirection, enuFrame, geodeticPoint, add, scale, sub, dot, length, cross, normalize } = await import("../../scenes/panoramaMath");
    const runtime = await createBabylonRuntime(document.createElement("canvas"));
    const camera = runtime.geospatialCamera!;
    runtime.scene.useRightHandedSystem = true;
    const frames = (count: number) => {
      for (let i = 0; i < count; i++) {
        const run = scheduledFrame;
        scheduledFrame = null;
        run?.(performance.now());
      }
    };
    try {
      expect(runtime.getCameraHandling()).toMatchObject({ pitchDeg: { min: 1, max: 89 }, zoomMeters: { min: 25 }, glideKeepPerFrame: 0.82 });
      // The orbit target sits at the orb's height here, as ground following keeps it.
      runtime.configureOrbitTargetHeight({ resolveSurfaceHeightMeters: () => 252 });
      const acquired = runtime.acquireNavigation({ owner: "test", inputContext: "panorama" });
      if (!acquired.ok) throw new Error(acquired.message);
      const { lease } = acquired;
      // 3 m from an orb, looking 30° down at it, rolled, with a wide view: nearer than the zoom limit.
      const frame = enuFrame(-93.235, 44.974);
      const toEcef = (v: readonly [number, number, number]) => add(add(scale(frame.east, v[0]), scale(frame.north, v[1])), scale(frame.up, v[2]));
      const marker = geodeticPoint(-93.235, 44.974, 252);
      const forward = toEcef(enuDirection(70, -30));
      const position = add(marker, scale(forward, -3));
      const up = normalize(cross(normalize(cross(forward, frame.up)), forward));
      const ecefOf = (v: readonly number[]) => ({ x: v[0], y: v[1], z: v[2] });
      const view = { position: ecefOf(position), forward: ecefOf(forward), up: ecefOf(up), verticalFovRad: 1.2 };
      expect(runtime.placeNavigationCamera(lease, view)).toBe(true);
      // Backing away from the orb at 20 m/s, as a flight out does.
      const motion = { velocity: ecefOf(scale(forward, -20)), turn: ecefOf([0, 0, 0]), fovRad: 0.8, inputSince: 123, press: null };
      expect(runtime.glideNavigationCamera(lease, view, ecefOf(marker), motion)).toBe(true);
      const m = camera.getViewMatrix(true).m;
      [camera.position.x, camera.position.y, camera.position.z].forEach((value, i) => expect(value).toBeCloseTo(position[i], 6));
      [-m[2], -m[6], -m[10]].forEach((value, i) => expect(value).toBeCloseTo(forward[i], 6));
      // Orbiting the orb 3 m off, which the zoom limit would not allow, with the view's field of view for now.
      expect(camera.radius).toBeCloseTo(3, 6);
      expect(camera.limits.radiusMin).toBeCloseTo(3, 6);
      expect(camera.fov).toBe(1.2);
      expect(camera.checkCollisions).toBe(true);
      lease.release("cancelled");
      expect(setSuspended).toHaveBeenLastCalledWith(false, { keepWheelSince: 123, press: null });
      // The glide carries it on outward, and the field of view goes back to the globe's.
      frames(5);
      expect(camera.radius).toBeGreaterThan(3.5);
      expect(dot(sub([camera.position.x, camera.position.y, camera.position.z], position), scale(forward, -1))).toBeGreaterThan(0.5);
      expect(camera.fov).toBeLessThan(1.2);
      expect(camera.fov).toBeGreaterThan(0.8);
      expect(length(sub([camera.center.x, camera.center.y, camera.center.z], marker))).toBeLessThan(1e-6);
    } finally {
      runtime.destroy();
    }
  });
});

describe("createBabylonRuntime renderer parameters", () => {
  it("draws at renderer.resolutionScale and clips the globe camera as renderer.clipping says", async () => {
    mocks.createInputController.mockReturnValue({ setRates: vi.fn(), destroy: vi.fn() });
    const { getAppSettings } = await import("../../settings/appSettings");
    const settings = getAppSettings();
    const { createBabylonRuntime } = await import("./createBabylonRuntime");
    const runtime = await createBabylonRuntime(document.createElement("canvas"));
    const camera = runtime.geospatialCamera!;
    const dpr = window.devicePixelRatio || 1;
    // The null engine always reports 1; what it is asked for is what a real one draws at.
    const scaling = vi.spyOn(runtime.engine, "setHardwareScalingLevel");
    try {
      settings.set("renderer.resolutionScale", 0.5);
      expect(scaling).toHaveBeenLastCalledWith(expect.closeTo(2 / dpr, 9));
      window.dispatchEvent(new Event("resize"));
      expect(scaling).toHaveBeenLastCalledWith(expect.closeTo(2 / dpr, 9));

      // Automatic: Babylon's geospatial clipping behaviour sets the planes.
      const clipping = () => camera.behaviors.filter(behavior => behavior.name === "GeospatialClipping").length;
      expect(clipping()).toBe(1);
      settings.set("renderer.clipping.fixed", { min: 5, max: 2e6 });
      settings.set("renderer.clipping", "fixed");
      expect(clipping()).toBe(0);
      expect([camera.minZ, camera.maxZ]).toEqual([5, 2e6]);
      settings.set("renderer.clipping", "automatic");
      expect(clipping()).toBe(1);
    } finally {
      for (const id of ["renderer.resolutionScale", "renderer.clipping", "renderer.clipping.fixed"]) settings.reset(id);
      runtime.destroy();
    }
  });
});
