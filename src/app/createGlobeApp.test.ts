// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GlobeViewState } from "../engine/types";

// Node 26+ ships an experimental localStorage global that is undefined when
// --localStorage-file is not provided, shadowing jsdom's own implementation.
// Replacing it with an in-memory Map lets beforeEach call .clear() safely.
const _lsStore = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => _lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => { _lsStore.set(k, String(v)); },
  removeItem: (k: string) => { _lsStore.delete(k); },
  clear: () => { _lsStore.clear(); },
  key: (i: number) => Array.from(_lsStore.keys())[i] ?? null,
  get length() { return _lsStore.size; },
});

const mockState = vi.hoisted(() => ({
  frameCallback: null as (() => void) | null,
  removeObserver: vi.fn(),
  createBabylonRuntime: vi.fn(),
  runtimeDestroy: vi.fn(),
  getViewState: vi.fn(),
  setViewState: vi.fn(),
  setOrbitMode: vi.fn(),
  configureOrbitTargetHeight: vi.fn(),
  runtimeGetTileMetrics: vi.fn(),
  poiExitTracking: vi.fn(),
  poiGetOrbitTarget: vi.fn(),
  poiDestroy: vi.fn(),
  registryAddLayer: vi.fn(),
  registryRemoveLayer: vi.fn(),
  registryDestroy: vi.fn(),
  compassUpdate: vi.fn(),
  compassDestroy: vi.fn(),
  cullingUpdate: vi.fn(),
  cullingGetStats: vi.fn(),
  cullingDestroy: vi.fn(),
  compassSetScaleParams: vi.fn(),
  perfUpdate: vi.fn(),
  perfFormat: vi.fn(),
  resolveAnchorHeight: vi.fn(),
  resolveAnchorHeightMeters: vi.fn(),
  clearAnchorHeights: vi.fn(),
}));

vi.mock("../engine/babylon/createBabylonRuntime", () => ({
  createBabylonRuntime: mockState.createBabylonRuntime,
}));

vi.mock("../layers/poiTracking", () => ({
  createPoiTracking: () => ({
    setPois: vi.fn(),
    enterTracking: vi.fn(),
    exitTracking: mockState.poiExitTracking,
    isTracking: vi.fn(() => false),
    getOrbitTarget: mockState.poiGetOrbitTarget,
    destroy: mockState.poiDestroy,
  }),
}));

vi.mock("../layers/layerRegistry", () => ({
  createLayerRegistry: () => ({
    addLayer: mockState.registryAddLayer,
    removeLayer: mockState.registryRemoveLayer,
    destroy: mockState.registryDestroy,
  }),
}));

vi.mock("../visualization/orbitCompass", () => ({
  DEFAULT_ORBIT_COMPASS_SCALE_PARAMS: {
    radiusScale: 0.035,
    minRadius: 750,
    maxRadius: 240_000,
    labelSizeScale: 0.16,
  },
  createOrbitCompass: () => ({
    update: mockState.compassUpdate,
    setScaleParams: mockState.compassSetScaleParams,
    isMesh: vi.fn(() => false),
    destroy: mockState.compassDestroy,
  }),
}));

vi.mock("../perf/culling", () => ({
  createHemisphereCulling: () => ({
    setCullables: vi.fn(),
    update: mockState.cullingUpdate,
    getStats: mockState.cullingGetStats,
    destroy: mockState.cullingDestroy,
  }),
}));

vi.mock("../perf/metrics", () => ({
  createPerformanceMetrics: () => ({
    update: mockState.perfUpdate,
    getSnapshot: vi.fn(),
    format: mockState.perfFormat,
  }),
}));

vi.mock("../terrain/anchorHeight", () => ({
  createAnchorHeightResolver: () => ({
    resolve: mockState.resolveAnchorHeight,
    resolveHeight: mockState.resolveAnchorHeightMeters,
    setSample: vi.fn(),
    getCachedHeight: vi.fn(() => null),
    clear: mockState.clearAnchorHeights,
    setHeightOffset: vi.fn(),
  }),
}));

const viewState: GlobeViewState = {
  latDeg: 44.977753,
  lonDeg: -93.265011,
  headingDeg: 17,
  pitchDeg: 71,
  zoomMeters: 600,
};

async function createAppUnderTest() {
  const { createGlobeApp } = await import("./createGlobeApp");
  const root = document.createElement("div");
  document.body.append(root);
  const app = await createGlobeApp(root);
  return { app, root };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState.frameCallback = null;
  document.body.replaceChildren();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({ object: { sha: "8b0ab4ed380c4c57f87a1f0da8830e19e305df70" } }),
  })));

  mockState.getViewState.mockReturnValue(viewState);
  mockState.runtimeGetTileMetrics.mockReturnValue({ visibleTiles: 3, activeTiles: 5 });
  mockState.poiGetOrbitTarget.mockReturnValue(null);
  mockState.cullingUpdate.mockReturnValue({ total: 4, visible: 3, hidden: 1 });
  mockState.cullingGetStats.mockReturnValue({ total: 4, visible: 3, hidden: 1 });
  mockState.perfUpdate.mockReturnValue({
    fps: 60,
    frameMs: 16.7,
    p95FrameMs: 18.2,
    activeMeshes: 42,
    drawCalls: null,
    memoryMb: 43,
    tiles: { visibleTiles: 3, activeTiles: 5 },
    culling: { total: 4, visible: 3, hidden: 1 },
  });
  mockState.perfFormat.mockReturnValue("unused");
  mockState.resolveAnchorHeight.mockReturnValue({ x: 9, y: 0, z: 0 });
  mockState.resolveAnchorHeightMeters.mockReturnValue(264);
  mockState.createBabylonRuntime.mockResolvedValue({
    engine: {
      getFps: () => 60,
      getRenderingCanvas: () => null,
      getRenderWidth: () => 800,
      getRenderHeight: () => 600,
    },
    scene: {
      onBeforeRenderObservable: {
        add: vi.fn((callback: () => void) => {
          mockState.frameCallback = callback;
          return { id: "before-render" };
        }),
        remove: mockState.removeObserver,
      },
    },
    renderer: { mode: "webgl", requested: "auto" },
    status: {
      mode: "raster-basemap",
      message: "USGS Imagery Topo raster basemap active.",
      googleApiKeyProvided: false,
      rasterBaseMap: {
        id: "usgs-imagery-topo",
        label: "USGS Imagery Topo",
        provider: "USGS The National Map",
        protocol: "arcgis-tile",
        urlTemplate: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}",
        attribution: "USGS The National Map",
      },
      lastError: null,
    },
    geospatialCamera: {
      center: { x: 1, y: 0, z: 0 },
      globalPosition: { x: 2, y: 0, z: 0 },
      radius: 600,
    },
    getViewState: mockState.getViewState,
    setViewState: mockState.setViewState,
    setOrbitMode: mockState.setOrbitMode,
    configureOrbitTargetHeight: mockState.configureOrbitTargetHeight,
    getTileMetrics: mockState.runtimeGetTileMetrics,
    requestRender: vi.fn(),
    beginContinuous: vi.fn(),
    endContinuous: vi.fn(),
    setPaused: vi.fn(),
    isRendering: vi.fn(() => false),
    onActiveRenderChange: vi.fn(() => vi.fn()),
    isStreamingTiles: vi.fn(() => false),
    onTilesStreamingChange: vi.fn(() => vi.fn()),
    destroy: mockState.runtimeDestroy,
  });
});

describe("createGlobeApp smoke behavior", () => {
  it("boots the raster basemap shell and updates HUD/perf state on the frame callback", async () => {
    const { root } = await createAppUnderTest();

    expect(mockState.createBabylonRuntime).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      expect.objectContaining({ googleApiKey: null }),
    );
    expect(root.querySelector("#runtimeModePill")?.textContent).toBe("USGS Imagery Topo");
    expect(Array.from(root.querySelector(".hud-bar")?.children ?? []).slice(0, 3).map((el) => el.id)).toEqual([
      "northButton",
      "helpButton",
      "settingsButton",
    ]);
    expect(root.querySelector("#settingsBuildLine")?.textContent).toMatch(
      /^Build: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
    expect(root.querySelector("#settingsSourceLine")?.textContent).toMatch(/^Source: [\w.-]+$/);
    expect(root.querySelector("#settingsBundleLine")?.textContent).toMatch(/^Bundle: (dev|index-[\w-]+\.js)$/);
    await vi.waitFor(() => {
      expect(root.querySelector("#settingsDeployLine")?.textContent).toBe("Deploy: 8b0ab4ed380c");
    });
    expect(mockState.configureOrbitTargetHeight).toHaveBeenCalledWith({
      resolveSurfaceHeightMeters: mockState.resolveAnchorHeightMeters,
      initialOffsetMeters: 0,
    });

    mockState.frameCallback?.();

    expect(root.querySelector("#hudStatus")?.textContent).toBe("44.9778°N 93.2650°W h017° p71° z600m");
    expect(Array.from(root.querySelectorAll("#perfMetricsPill .perf-chip")).map((el) => el.textContent)).toEqual([
      "60fps",
      "43MB",
    ]);
    expect(root.querySelector('#perfMetricsPill [data-perf-metric="activeMeshes"]')).toBeNull();
    expect(root.querySelector('#perfMetricsPill [data-perf-metric="tiles"]')).toBeNull();
    expect(root.querySelector<HTMLElement>('#perfMetricsPill [data-perf-metric="memory"]')?.title).toBe(
      "Approximate JavaScript heap memory currently used by the page.",
    );
    expect(mockState.resolveAnchorHeight).toHaveBeenCalledWith({ x: 1, y: 0, z: 0 });
    expect(mockState.compassUpdate).toHaveBeenCalledWith({ x: 9, y: 0, z: 0 }, 600);
  });

  it("toggles hidden performance metrics from settings", async () => {
    const { root } = await createAppUnderTest();
    const activeMeshesInput = root.querySelector<HTMLInputElement>('[data-perf-metric="activeMeshes"]');
    const tilesInput = root.querySelector<HTMLInputElement>('[data-perf-metric="tiles"]');

    expect(activeMeshesInput?.checked).toBe(false);
    expect(tilesInput?.checked).toBe(false);

    mockState.frameCallback?.();
    expect(root.querySelector('#perfMetricsPill [data-perf-metric="activeMeshes"]')).toBeNull();
    expect(root.querySelector('#perfMetricsPill [data-perf-metric="tiles"]')).toBeNull();

    if (activeMeshesInput) activeMeshesInput.checked = true;
    activeMeshesInput?.dispatchEvent(new Event("change", { bubbles: true }));
    if (tilesInput) tilesInput.checked = true;
    tilesInput?.dispatchEvent(new Event("change", { bubbles: true }));

    expect(Array.from(root.querySelectorAll("#perfMetricsPill .perf-chip")).map((el) => el.textContent)).toContain("42⬟");
    expect(Array.from(root.querySelectorAll("#perfMetricsPill .perf-chip")).map((el) => el.textContent)).toContain("3/5t");
    expect(root.querySelector<HTMLElement>('#perfMetricsPill [data-perf-metric="activeMeshes"]')?.title).toBe(
      "Babylon meshes currently active in the scene.",
    );
  });

  it("opens the map source menu from the source chip", async () => {
    const { root } = await createAppUnderTest();
    const sourceChip = root.querySelector<HTMLButtonElement>("#runtimeModePill");
    const menu = root.querySelector<HTMLElement>("#mapSourceMenu");

    expect(menu?.hidden).toBe(true);
    sourceChip?.click();

    expect(menu?.hidden).toBe(false);
    expect(sourceChip?.getAttribute("aria-expanded")).toBe("true");
  });

  it("shows and applies the compass scale tuner from settings", async () => {
    const { root } = await createAppUnderTest();
    const toggle = root.querySelector<HTMLInputElement>("#compassScaleTunerToggle");
    const tuner = root.querySelector<HTMLElement>(".compass-scale-tuner");

    expect(toggle?.checked).toBe(false);
    expect(tuner?.hidden).toBe(true);

    if (toggle) toggle.checked = true;
    toggle?.dispatchEvent(new Event("change", { bubbles: true }));

    expect(tuner?.hidden).toBe(false);

    const radiusScaleInput = root.querySelector<HTMLInputElement>('.compass-scale-tuner input[data-field="radiusScale"]');
    const applyButton = root.querySelector<HTMLButtonElement>(".compass-scale-tuner .poi-sprite-tuner-apply");

    if (radiusScaleInput) radiusScaleInput.value = "0.05";
    radiusScaleInput?.dispatchEvent(new Event("input", { bubbles: true }));
    expect(applyButton?.hidden).toBe(false);

    applyButton?.click();

    expect(mockState.compassSetScaleParams).toHaveBeenCalledWith({
      radiusScale: 0.05,
      minRadius: 750,
      maxRadius: 240_000,
      labelSizeScale: 0.16,
    });
  });

  it("passes URL API keys through runtime startup", async () => {
    window.history.replaceState(null, "", "/?key=test-key");

    await createAppUnderTest();

    expect(mockState.createBabylonRuntime).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      expect.objectContaining({ googleApiKey: "test-key" }),
    );
  });

  it("lets the map source preference force a raster basemap", async () => {
    window.history.replaceState(null, "", "/?key=test-key&mapSource=usgs-topo");

    await createAppUnderTest();

    expect(mockState.createBabylonRuntime).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      expect.objectContaining({
        googleApiKey: null,
        rasterBaseMap: expect.objectContaining({ id: "usgs-topo" }),
      }),
    );
  });

  it("exits POI tracking before north-up reset", async () => {
    const { root } = await createAppUnderTest();

    root.querySelector<HTMLButtonElement>("#northButton")?.click();

    expect(mockState.poiExitTracking).toHaveBeenCalledTimes(1);
    expect(mockState.setViewState).toHaveBeenCalledWith({ headingDeg: 0, pitchDeg: 89 });
  });

  it("delegates layer lifecycle through the registry", async () => {
    const { app } = await createAppUnderTest();
    const layer = {
      id: "smoke-layer",
      setup: vi.fn(() => ({})),
      destroy: vi.fn(),
    };

    app.addLayer(layer);
    app.removeLayer("smoke-layer");

    expect(mockState.registryAddLayer).toHaveBeenCalledWith(layer);
    expect(mockState.registryRemoveLayer).toHaveBeenCalledWith("smoke-layer");
  });

  it("tears down observers, feature handles, runtime, and DOM", async () => {
    const { app, root } = await createAppUnderTest();

    app.destroy();

    expect(mockState.removeObserver).toHaveBeenCalledWith({ id: "before-render" });
    expect(mockState.poiDestroy).toHaveBeenCalledTimes(1);
    expect(mockState.registryDestroy).toHaveBeenCalledTimes(1);
    expect(mockState.cullingDestroy).toHaveBeenCalledTimes(1);
    expect(mockState.compassDestroy).toHaveBeenCalledTimes(1);
    expect(mockState.runtimeDestroy).toHaveBeenCalledTimes(1);
    expect(root.childElementCount).toBe(0);
  });
});