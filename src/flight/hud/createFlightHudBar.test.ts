// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BabylonRuntimeStatus } from "foss-earth/runtime";
import { createFlightHudBar } from "./createFlightHudBar";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    clear: () => values.clear(),
  });
});
afterEach(() => { document.body.replaceChildren(); window.localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("flight input method selector", () => {
  it("loads the shared preference, offers only supported modes and persists selection", () => {
    window.localStorage.setItem("foss-earth.inputMode", "mouse");
    const container = document.createElement("div");
    document.body.append(container);
    const onInputModeChange = vi.fn();
    const onTerrainSourceChange = vi.fn();
    const onMapSourceChange = vi.fn();
    let terrainDetailOverride: number | null = null;
    let activeTerrainDetail = 16;
    const onTerrainDetailChange = vi.fn((errorTarget: number | null) => {
      terrainDetailOverride = errorTarget;
      activeTerrainDetail = errorTarget ?? 16;
    });
    const onSettingsClick = vi.fn();
    const onDebugClick = vi.fn();
    let activityListener: (active: boolean) => void = () => {};
    const unsubscribe = vi.fn();
    const unsubscribeStreaming = vi.fn();
    let streamingListener: (streaming: boolean) => void = () => {};
    const hud = createFlightHudBar(container, {
      renderActivity: {
        getMapDownloadBytesPerSecond: () => 0,
        onMapDownloadRateChange: () => vi.fn(),
        isStreamingTiles: () => true,
        onTilesStreamingChange: (listener) => { streamingListener = listener; return unsubscribeStreaming; },
        isRendering: () => true,
        onActiveRenderChange: (listener) => { activityListener = listener; return unsubscribe; },
      },
      rendererMode: "webgl2", rendererForce: null,
      runtimeStatus: {
        mode: "raster-basemap",
        terrainSource: { id: "mapterhorn", label: "Mapterhorn Terrain" },
        rasterQuality: { setting: "auto", activeProfile: "balanced" },
      } as BabylonRuntimeStatus,
      rasterSources: [{
        id: "usgs-imagery",
        label: "USGS Imagery",
        provider: "USGS",
        protocol: "xyz",
        urlTemplate: "",
        attribution: "",
      }],
      terrainSources: [{ id: "mapterhorn", label: "Mapterhorn Terrain", provider: "Mapterhorn", urlTemplate: "", maxZoom: 15, attribution: "" }],
      onPausedChange: vi.fn(), onRendererChange: vi.fn(), onMapSourceChange, onTerrainSourceChange,
      getTerrainDetailState: () => ({
        available: true,
        minErrorTarget: 16,
        maxErrorTarget: 4096,
        overrideErrorTarget: terrainDetailOverride,
        activeErrorTarget: activeTerrainDetail,
      }),
      onTerrainDetailChange,
      onSettingsClick,
      onDebugClick,
      onInputModeChange, onInputSensitivityChange: vi.fn(),
    });
    expect(onInputModeChange).toHaveBeenLastCalledWith("mouse");
    expect(container.querySelector("#flightControlsButton")).toBeNull();
    const button = container.querySelector<HTMLButtonElement>("#inputModeButton")!;
    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelectorAll("[data-mode]")).toHaveLength(2);
    expect(container.querySelector("[data-mode=touch]")).toBeNull();
    expect(container.querySelectorAll(".gesture-card")).toHaveLength(2);
    container.querySelector<HTMLButtonElement>("[data-mode=trackpad]")!.click();
    expect(onInputModeChange).toHaveBeenLastCalledWith("trackpad");
    expect(window.localStorage.getItem("foss-earth.inputMode")).toBe("trackpad");
    expect(button.getAttribute("aria-label")).toBe("Trackpad mode");
    expect(container.querySelector('[aria-label="Two-finger swipe to orbit"]')).not.toBeNull();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(button.getAttribute("aria-expanded")).toBe("false");
    const rendererButton = container.querySelector<HTMLElement>("#flightRendererButton")!;
    expect(rendererButton.classList.contains("is-rendering")).toBe(true);
    activityListener(false);
    expect(rendererButton.dataset.renderState).toBe("idle");
    expect(rendererButton.classList.contains("is-rendering")).toBe(false);
    activityListener(true);
    expect(rendererButton.dataset.renderState).toBe("rendering");
    const mapButton = container.querySelector<HTMLElement>("#flightMapSourceButton")!;
    const mapControl = mapButton.parentElement!;
    const mapDownloadSpeed = mapControl.querySelector(".map-download-speed")!;
    const terrainDetailControl = mapControl.querySelector(".flight-terrain-detail-control")!;
    const mapMenu = container.querySelector<HTMLElement>("#flightMapSourceMenu")!;
    const threeDToggle = mapMenu.querySelector<HTMLButtonElement>('[data-basemap-section="3d"]')!;
    const twoDToggle = mapMenu.querySelector<HTMLButtonElement>('[data-basemap-section="2d"]')!;
    const twoDContent = mapMenu.querySelector<HTMLElement>("#flightBasemap2DContent")!;
    const elevationProviders = mapMenu.querySelector<HTMLElement>(".flight-basemap-menu__elevation-providers")!;
    expect(mapDownloadSpeed.textContent).toBe("000MB/s");
    expect(mapDownloadSpeed.parentElement).toBe(mapButton);
    expect([...mapControl.children].indexOf(terrainDetailControl)).toBeGreaterThan([...mapControl.children].indexOf(mapButton));
    expect(container.querySelector("#flightTerrainSourceButton")).toBeNull();
    expect(Array.from(mapMenu.querySelectorAll(".flight-basemap-menu__section-toggle .flight-basemap-menu__heading"), (heading) => heading.textContent))
      .toEqual(["3D basemaps", "2D basemaps"]);
    expect(mapMenu.querySelector('[data-map-source="google"]')?.textContent).toBe("Google 3D Tiles");
    expect(mapMenu.querySelector('[data-map-source="usgs-imagery"]')?.textContent).toBe("USGS Imagery");
    expect(threeDToggle.getAttribute("aria-expanded")).toBe("false");
    expect(twoDToggle.getAttribute("aria-expanded")).toBe("true");
    expect(elevationProviders.hidden).toBe(false);
    twoDToggle.click();
    expect(twoDContent.hidden).toBe(true);
    twoDToggle.click();
    expect(twoDContent.hidden).toBe(false);
    expect(mapButton.classList.contains("is-streaming")).toBe(true);
    activityListener(false);
    expect(mapButton.classList.contains("is-streaming")).toBe(true);
    streamingListener(false);
    expect(mapButton.classList.contains("is-streaming")).toBe(false);
    streamingListener(true);
    expect(mapButton.classList.contains("is-streaming")).toBe(true);
    hud.update({ latDeg: 0, lonDeg: 0, headingRad: 0 } as never, {
      mode: "raster-basemap",
      terrainSource: { id: "mapterhorn", label: "Mapterhorn Terrain" },
      rasterQuality: { setting: "auto", activeProfile: "balanced" },
    } as BabylonRuntimeStatus, 59.6, false);
    expect(container.querySelector("#flightFps")?.textContent).toBe("FPS 60");
    expect(container.querySelector("#flightFps")).toBeInstanceOf(HTMLButtonElement);
    expect(container.querySelector("#flightFps")?.classList.contains("flight-fps-button")).toBe(true);
    expect(container.querySelector(".hud-bar #flightFps")).toBeNull();
    hud.update({ latDeg: 0, lonDeg: 0, headingRad: 0 } as never, {
      mode: "raster-basemap",
      terrainSource: { id: "mapterhorn", label: "Mapterhorn Terrain" },
      rasterQuality: { setting: "auto", activeProfile: "balanced" },
    } as BabylonRuntimeStatus, 59.6, true);
    expect(container.querySelector("#flightFps")?.textContent).toBe("FPS 60");
    container.querySelector<HTMLButtonElement>("#flightFps")!.click();
    expect(onDebugClick).toHaveBeenCalledOnce();
    container.querySelector<HTMLButtonElement>("#flightSettingsButton")!.click();
    expect(onSettingsClick).toHaveBeenCalledOnce();
    container.querySelector<HTMLButtonElement>("[data-map-source=usgs-imagery]")!.click();
    expect(onMapSourceChange).toHaveBeenCalledWith("usgs-imagery");
    container.querySelector<HTMLButtonElement>("[data-terrain-source=mapterhorn]")!.click();
    expect(onTerrainSourceChange).toHaveBeenCalledWith("mapterhorn");
    hud.update({ latDeg: 0, lonDeg: 0, headingRad: 0 } as never, {
      mode: "google-tiles",
      terrainSource: { id: "mapterhorn", label: "Mapterhorn Terrain" },
    } as BabylonRuntimeStatus, 60, false);
    expect(elevationProviders.hidden).toBe(true);
    expect(threeDToggle.getAttribute("aria-expanded")).toBe("true");
    expect(twoDToggle.getAttribute("aria-expanded")).toBe("false");
    expect(mapMenu.querySelector(".flight-basemap-menu__notice")?.textContent)
      .toBe("Terrain is included. No elevation provider is used.");
    const terrainDetailSlider = container.querySelector<HTMLInputElement>("#flightTerrainDetailSlider")!;
    expect(terrainDetailSlider.value).toBe("12");
    const terrainDetailMarker = container.querySelector<HTMLElement>(".flight-terrain-detail-control__active-marker")!;
    expect(terrainDetailMarker.hidden).toBe(false);
    expect(terrainDetailMarker.title).toBe("Renderer target: 2^4");
    terrainDetailSlider.value = "10";
    terrainDetailSlider.dispatchEvent(new Event("input"));
    expect(onTerrainDetailChange).toHaveBeenCalledWith(1024);
    expect(terrainDetailSlider.value).toBe("10");
    expect(terrainDetailMarker.title).toBe("Renderer target: 2^10");
    terrainDetailSlider.value = "12";
    terrainDetailSlider.dispatchEvent(new Event("input"));
    expect(onTerrainDetailChange).toHaveBeenLastCalledWith(null);
    hud.destroy();
    expect(unsubscribeStreaming).toHaveBeenCalledOnce();
    expect(mapButton.classList.contains("is-streaming")).toBe(false);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(container.children).toHaveLength(0);
  });
});
