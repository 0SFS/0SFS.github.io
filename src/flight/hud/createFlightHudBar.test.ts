// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BabylonRuntimeStatus } from "foss-earth/runtime";
import { getAppSettings, resetAppSettings } from "foss-earth/settings";
import { createMapDetailController } from "foss-earth/shell";
import { createFlightHudBar, type FlightHudBarOptions } from "./createFlightHudBar";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    clear: () => values.clear(),
  });
});
// The input mode lives in the app's settings registry: each test starts a fresh one.
afterEach(() => { document.body.replaceChildren(); window.localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); resetAppSettings(); });

function createTestHud(overrides: Partial<FlightHudBarOptions> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const hud = createFlightHudBar(container, {
    renderActivity: {
      getMapDownloadBytesPerSecond: () => 0,
      onMapDownloadRateChange: () => vi.fn(),
      isStreamingTiles: () => false,
      onTilesStreamingChange: () => vi.fn(),
      isRendering: () => false,
      onActiveRenderChange: () => vi.fn(),
    },
    rendererMode: "webgl2",
    runtimeStatus: {
      mode: "raster-basemap",
      terrainSource: { id: "mapterhorn", label: "Mapterhorn Terrain" },
      rasterQuality: { setting: "auto", activeProfile: "balanced" },
    } as BabylonRuntimeStatus,
    onPausedChange: vi.fn(),
    mapDetail: createMapDetailController({ storage: null }),
    onSettingsClick: vi.fn(), onDebugClick: vi.fn(), onInputMethodClick: vi.fn(),
    onRendererClick: vi.fn(), onMapClick: vi.fn(), onStatusClick: vi.fn(),
    onInputModeChange: vi.fn(), onInputSensitivityChange: vi.fn(),
    ...overrides,
  });
  return { container, hud };
}

describe("flight HUD fullscreen and log buttons", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "fullscreenEnabled");
    Reflect.deleteProperty(document.documentElement, "requestFullscreen");
  });

  it("hides fullscreen where the browser has none and pins the game log", () => {
    let pinned = false;
    const { container, hud } = createTestHud({ onLogToggle: () => (pinned = !pinned) });
    expect(container.querySelector<HTMLButtonElement>("#flightFullscreenButton")!.hidden).toBe(true);
    const logButton = container.querySelector<HTMLButtonElement>("#flightLogButton")!;
    expect(logButton.hidden).toBe(false);

    logButton.click();
    expect(logButton.getAttribute("aria-pressed")).toBe("true");
    logButton.click();
    expect(logButton.getAttribute("aria-pressed")).toBe("false");
    hud.destroy();
  });

  it("requests fullscreen without browser navigation UI", () => {
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
    const requestFullscreen = vi.fn(async () => {});
    document.documentElement.requestFullscreen = requestFullscreen;
    const { container, hud } = createTestHud();
    const button = container.querySelector<HTMLButtonElement>("#flightFullscreenButton")!;
    expect(button.hidden).toBe(false);
    expect(container.querySelector<HTMLButtonElement>("#flightLogButton")!.hidden).toBe(true);

    button.click();
    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: "hide" });
    hud.destroy();
  });
});
describe("flight input method selector", () => {
  it("toggles Controls from the button, and the section loads, offers and persists the pointer mode", () => {
    window.localStorage.setItem("foss-earth.inputMode", "mouse");
    const container = document.createElement("div");
    document.body.append(container);
    const onInputModeChange = vi.fn();
    const mapDetail = createMapDetailController({ storage: null });
    mapDetail.setRecommendationContext({ rendererDefaultErrorPx: 20, rendererMode: "webgl2" });
    const onSettingsClick = vi.fn();
    const onDebugClick = vi.fn();
    const onInputMethodClick = vi.fn();
    const onRendererClick = vi.fn();
    const onMapClick = vi.fn();
    const onStatusClick = vi.fn();
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
      rendererMode: "webgl2",
      runtimeStatus: {
        mode: "raster-basemap",
        rasterBaseMap: { id: "usgs-imagery", label: "USGS Imagery" },
        terrainSource: { id: "mapterhorn", label: "Mapterhorn Terrain" },
        rasterQuality: { setting: "auto", activeProfile: "balanced" },
      } as BabylonRuntimeStatus,
      onPausedChange: vi.fn(),
      mapDetail,
      onSettingsClick,
      onDebugClick,
      onInputMethodClick,
      onRendererClick,
      onMapClick,
      onStatusClick,
      onInputModeChange, onInputSensitivityChange: vi.fn(),
    });
    expect(onInputModeChange).toHaveBeenLastCalledWith("mouse");
    expect(container.querySelector("#flightControlsButton")).toBeNull();
    const button = container.querySelector<HTMLButtonElement>("#inputModeButton")!;
    button.click();
    expect(onInputMethodClick).toHaveBeenCalledOnce();
    expect(container.querySelector("#inputModeMenu")).toBeNull();
    // jsdom has a fine pointer and no touchscreen: a desktop, so no Touch part.
    const section = document.createElement("div");
    const unmountSection = hud.mountInputMethod(section);
    expect(Array.from(section.querySelectorAll(".input-mode-heading"), (el) => el.textContent)).toEqual(["Mouse or trackpad"]);
    expect(section.querySelectorAll(".input-mode-toggle-option")).toHaveLength(2);
    expect(section.querySelector("[data-mode=touch]")).toBeNull();
    expect(section.querySelectorAll(".gesture-card")).toHaveLength(2);
    section.querySelector<HTMLButtonElement>(".input-mode-toggle-option[data-mode=trackpad]")!.click();
    expect(onInputModeChange).toHaveBeenLastCalledWith("trackpad");
    expect(getAppSettings().get("input.mode")).toBe("trackpad");
    expect(button.getAttribute("aria-label")).toBe("Trackpad mode. Show or hide input settings");
    expect(section.querySelector('[aria-label="Two-finger swipe to orbit"]')).not.toBeNull();
    unmountSection();
    expect(section.childElementCount).toBe(0);
    const rendererButton = container.querySelector<HTMLElement>("#flightRendererButton")!;
    expect(rendererButton.classList.contains("is-rendering")).toBe(true);
    activityListener(false);
    expect(rendererButton.dataset.renderState).toBe("idle");
    expect(rendererButton.classList.contains("is-rendering")).toBe(false);
    activityListener(true);
    expect(rendererButton.dataset.renderState).toBe("rendering");
    // The World detail rail, then the download speed and basemap as one
    // button, then its credit link end the bar, at the bottom-right corner.
    const hudBar = container.querySelector(".hud-bar")!;
    const mapSource = hudBar.lastElementChild!;
    expect(mapSource.id).toBe("flightMapSourceSlot");
    const mapChip = mapSource.querySelector<HTMLElement>(".map-source-hud__chip")!;
    const mapButton = mapChip.querySelector<HTMLButtonElement>(".map-source-hud__provider")!;
    expect(Array.from(mapChip.children, (child) => child.className)).toEqual([
      "map-source-hud__provider",
      "map-source-hud__credit",
    ]);
    expect(mapButton.firstElementChild?.className).toBe("map-download-speed");
    expect(mapChip.querySelector(".map-download-speed")?.textContent).toBe("000MB/s");
    expect(mapChip.previousElementSibling?.classList.contains("map-detail-control")).toBe(true);
    expect(mapChip.nextElementSibling).toBeNull();
    expect(mapButton.querySelector(".map-source-label")?.textContent).toBe("USGS Imagery");
    // Pairing a phone lives in the panel's Remote Control tab, not in the bar.
    expect(container.querySelector("#flightPhoneButton")).toBeNull();
    // The renderer, basemap and position chips toggle their tabs; none pops up a menu.
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.querySelector("[aria-haspopup]")).toBeNull();
    rendererButton.click();
    expect(onRendererClick).toHaveBeenCalledOnce();
    mapButton.click();
    expect(onMapClick).toHaveBeenCalledOnce();
    const status = container.querySelector<HTMLButtonElement>("#flightShellStatus")!;
    expect(status).toBeInstanceOf(HTMLButtonElement);
    status.click();
    expect(onStatusClick).toHaveBeenCalledOnce();
    expect(mapChip.classList.contains("is-streaming")).toBe(true);
    activityListener(false);
    expect(mapChip.classList.contains("is-streaming")).toBe(true);
    streamingListener(false);
    expect(mapChip.classList.contains("is-streaming")).toBe(false);
    streamingListener(true);
    expect(mapChip.classList.contains("is-streaming")).toBe(true);
    hud.update({ latDeg: 0, lonDeg: 0, headingRad: 0 } as never, {
      mode: "raster-basemap",
      terrainSource: { id: "mapterhorn", label: "Mapterhorn Terrain" },
      rasterQuality: { setting: "auto", activeProfile: "balanced" },
    } as BabylonRuntimeStatus, 59.6, false);
    expect(container.querySelector("#flightFps")?.textContent).toBe("FPS 60");
    expect(container.querySelector("#flightFps")).toBeInstanceOf(HTMLButtonElement);
    expect(container.querySelector(".hud-bar #flightFps")).toBe(container.querySelector("#flightFps"));
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
    hud.update({ latDeg: 0, lonDeg: 0, headingRad: 0 } as never, {
      mode: "google-tiles",
      terrainSource: { id: "mapterhorn", label: "Mapterhorn Terrain" },
    } as BabylonRuntimeStatus, 60, false);
    expect(mapButton.querySelector(".map-source-label")?.textContent).toBe("Google 3D Tiles");
    expect(status.textContent).toBe("0.0000°N 0.0000°E h000°");
    // The rail is the shared one, driven by the app's detail controller.
    mapDetail.setActiveSource({ key: "google", availability: "ready" });
    mapDetail.updatePolicy({ kind: "google", finestErrorPx: 16, coarsestErrorPx: 4096, defaultValue: 16 });
    const terrainDetailSlider = container.querySelector<HTMLInputElement>(".map-detail-control__slider")!;
    expect(terrainDetailSlider.getAttribute("aria-label")).toBe("World detail for this session");
    expect(terrainDetailSlider.value).toBe("4");
    terrainDetailSlider.value = "10";
    terrainDetailSlider.dispatchEvent(new Event("input"));
    expect(mapDetail.getState()).toMatchObject({ sessionOverride: 1024, requestedTarget: 1024 });
    // The coarse end is a value like any other, not a reset.
    terrainDetailSlider.value = "12";
    terrainDetailSlider.dispatchEvent(new Event("input"));
    expect(mapDetail.getState()).toMatchObject({ sessionOverride: 4096 });
    hud.destroy();
    expect(unsubscribeStreaming).toHaveBeenCalledOnce();
    expect(mapChip.classList.contains("is-streaming")).toBe(false);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(container.children).toHaveLength(0);
  });
});
