import type { HudInputMode, InputSensitivitySettings } from "foss-earth/input";
import "foss-earth/shell.css";
import "foss-earth/input-mode.css";

import { attachRendererActivity, attachTileStreamingActivity, attachMapDownloadSpeed, setMapSourceLabel, createInputModeHud, createHudBar, type HudBarHandle, type RenderActivitySource, type TileStreamingSource, type MapDownloadSource } from "foss-earth/shell";
import type { BabylonRuntimeStatus, RasterBaseMapSource, RendererMode, TerrainSource } from "foss-earth/runtime";
import { headingDegFromRad, type FlightState } from "../physics/flightState";

export interface FlightTerrainDetailState {
  /** Google Tiles is the only map mode with a screen-space-error target. */
  available: boolean;
  /** Finest target included in the saved World-detail range. */
  minErrorTarget: number;
  /** Coarsest target included in the saved World-detail range. */
  maxErrorTarget: number;
  /** The session-only target selected from the HUD, if any. */
  overrideErrorTarget: number | null;
  /** The target currently applied to the Google Tiles renderer. */
  activeErrorTarget: number | null;
}

export interface FlightHudBarOptions {
  renderActivity: RenderActivitySource & TileStreamingSource & MapDownloadSource;
  rendererMode: RendererMode;
  rendererForce: RendererMode | null;
  runtimeStatus: BabylonRuntimeStatus;
  rasterSources: readonly RasterBaseMapSource[];
  terrainSources: readonly TerrainSource[];
  onInputModeChange(mode: HudInputMode): void;
  onInputSensitivityChange(settings: InputSensitivitySettings): void;
  onPausedChange(paused: boolean): void;
  onRendererChange(mode: RendererMode | null): void;
  onMapSourceChange(sourceId: string): void;
  onTerrainSourceChange(sourceId: string): void;
  getTerrainDetailState(): FlightTerrainDetailState;
  /** Set a session-only detail target; null restores the saved World detail. */
  onTerrainDetailChange(errorTarget: number | null): void;
  onSettingsClick(): void;
  onPhoneControlClick?(): void;
}

export interface FlightHudBarHandle {
  setPhoneStatus?(text: string): void;
  update(state: FlightState, status: BabylonRuntimeStatus, fps: number | null, paused: boolean): void;
  destroy(): void;
}

function rendererLabel(mode: RendererMode): string {
  if (mode === "webgpu") return "WebGPU";
  if (mode === "webgl2") return "WebGL2";
  return "WebGL";
}

function mapSourceLabel(status: BabylonRuntimeStatus): string {
  if (status.mode === "google-tiles") return "Google 3D Tiles";
  if (status.mode === "raster-basemap") return status.rasterBaseMap?.label ?? "Raster Basemap";
  return "Fallback Globe";
}

function setMenuOpen(menu: HTMLElement, button: HTMLButtonElement, open: boolean): void {
  menu.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
}

function terrainDetailExponent(errorTarget: number): number {
  return Math.log2(Math.max(1, errorTarget));
}

function formatTerrainDetailTarget(errorTarget: number): string {
  const exponent = terrainDetailExponent(errorTarget);
  return `2^${Number.isInteger(exponent) ? exponent : exponent.toFixed(2)}`;
}

function terrainDetailRangePercent(errorTarget: number, minErrorTarget: number, maxErrorTarget: number): number {
  const minExponent = terrainDetailExponent(minErrorTarget);
  const maxExponent = terrainDetailExponent(maxErrorTarget);
  if (Math.abs(maxExponent - minExponent) < 0.001) return 50;
  return Math.max(0, Math.min(100, ((terrainDetailExponent(errorTarget) - minExponent) / (maxExponent - minExponent)) * 100));
}

export function createFlightHudBar(container: HTMLElement, options: FlightHudBarOptions): FlightHudBarHandle {
  const hudBar: HudBarHandle = createHudBar(container, {
    ariaLabel: "Flight simulator controls",
    items: [
      { kind: "button", id: "flightPhoneButton", title: "Connect a phone controller", ariaLabel: "Phone controller", appearance: "chip", text: "Phone controller" },
      { kind: "button", id: "flightPauseButton", title: "Pause simulation", ariaLabel: "Pause simulation", className: "flight-shell-pause-button", text: "Ⅱ" },
      {
        kind: "menu",
        id: "flightRendererControl",
        className: "renderer-control",
        button: { kind: "button", id: "flightRendererButton", title: "GPU renderer API. Click to change.", ariaLabel: "GPU renderer API", appearance: "chip", className: "hud-chip-button hud-chip--gpu", text: rendererLabel(options.rendererMode) },
        menuId: "flightRendererMenu",
        menuClassName: "renderer-menu",
        optionClassName: "renderer-option",
        optionDataAttribute: "renderer",
        options: [
          { id: "", label: "Auto-detect" },
          { id: "webgpu", label: "Force WebGPU" },
          { id: "webgl2", label: "Force WebGL2" },
          { id: "webgl", label: "Force WebGL" },
        ],
      },
      {
        kind: "menu",
        id: "flightMapSourceControl",
        className: "map-source-control",
        button: { kind: "button", id: "flightMapSourceButton", title: "Map data source. Click to change.", ariaLabel: "Map data source", appearance: "chip", className: "hud-chip-button hud-chip--source", text: mapSourceLabel(options.runtimeStatus) },
        menuId: "flightMapSourceMenu",
        menuClassName: "map-source-menu",
        optionClassName: "map-source-option",
        optionDataAttribute: "mapSource",
        options: [{ id: "google", label: "Google 3D Tiles" }, ...options.rasterSources],
      },
      {
        kind: "menu",
        id: "flightTerrainSourceControl",
        className: "map-source-control",
        button: { kind: "button", id: "flightTerrainSourceButton", title: "Elevation data source. Click to change.", ariaLabel: "Elevation data source", appearance: "chip", className: "hud-chip-button hud-chip--source", text: "Elevation" },
        menuId: "flightTerrainSourceMenu",
        menuClassName: "map-source-menu",
        optionClassName: "map-source-option",
        optionDataAttribute: "terrainSource",
        options: options.terrainSources,
      },
      { kind: "slot", id: "flightFps", className: "hud-chip hud-status-text", ariaLive: "polite", ariaLabel: "Frame rate", title: "Rendered frames per second" },
      { kind: "button", id: "flightSettingsButton", title: "Open flight settings", ariaLabel: "Open flight settings", className: "settings-button", text: "⚙" },
      { kind: "slot", id: "flightShellStatus", className: "hud-chip hud-status-text", ariaLive: "polite", ariaLabel: "Flight status" },
    ],
  });

  const phoneButton = hudBar.getElement<HTMLButtonElement>("flightPhoneButton");
  const onPhoneClick = () => options.onPhoneControlClick?.();
  phoneButton?.addEventListener("click", onPhoneClick);
  const pauseButton = hudBar.getElement<HTMLButtonElement>("flightPauseButton");
  const rendererButton = hudBar.getElement<HTMLButtonElement>("flightRendererButton");
  const rendererMenu = hudBar.getElement("flightRendererMenu");
  const mapButton = hudBar.getElement<HTMLButtonElement>("flightMapSourceButton");
  const mapMenu = hudBar.getElement("flightMapSourceMenu");
  const terrainSourceButton = hudBar.getElement<HTMLButtonElement>("flightTerrainSourceButton");
  const terrainSourceMenu = hudBar.getElement("flightTerrainSourceMenu");
  const fpsElement = hudBar.getElement("flightFps");
  const settingsButton = hudBar.getElement<HTMLButtonElement>("flightSettingsButton");
  const statusElement = hudBar.getElement("flightShellStatus");
  if (!pauseButton || !rendererButton || !rendererMenu || !mapButton || !mapMenu || !terrainSourceButton || !terrainSourceMenu || !fpsElement || !settingsButton || !statusElement) {
    hudBar.destroy();
    throw new Error("Flight HUD bar failed to mount.");
  }

  const terrainDetailControl = document.createElement("span");
  terrainDetailControl.className = "flight-terrain-detail-control";
  terrainDetailControl.setAttribute("aria-label", "World detail override");
  const terrainDetailRail = document.createElement("span");
  terrainDetailRail.className = "flight-terrain-detail-control__rail";
  const terrainDetailValidRange = document.createElement("span");
  terrainDetailValidRange.className = "flight-terrain-detail-control__valid-range";
  terrainDetailValidRange.setAttribute("aria-hidden", "true");
  const terrainDetailActiveMarker = document.createElement("span");
  terrainDetailActiveMarker.className = "flight-terrain-detail-control__active-marker";
  terrainDetailActiveMarker.setAttribute("aria-hidden", "true");
  const terrainDetailSlider = document.createElement("input");
  terrainDetailSlider.id = "flightTerrainDetailSlider";
  terrainDetailSlider.className = "flight-terrain-detail-control__slider";
  terrainDetailSlider.type = "range";
  terrainDetailSlider.step = "0.05";
  terrainDetailSlider.setAttribute("aria-label", "Temporary World detail override");
  terrainDetailRail.append(terrainDetailValidRange, terrainDetailActiveMarker, terrainDetailSlider);
  terrainDetailControl.append(terrainDetailRail);

  const detachDownloadSpeed = attachMapDownloadSpeed(mapButton, options.renderActivity);
  const mapDownloadSpeed = mapButton.querySelector<HTMLElement>(".map-download-speed");
  const mapControl = mapButton.parentElement;
  if (!mapDownloadSpeed || !mapControl) {
    hudBar.destroy();
    throw new Error("Flight HUD map detail control failed to mount.");
  }
  // Download speed remains part of the basemap button. Only the temporary
  // detail rail sits beside it, outside that click target.
  mapControl.insertBefore(terrainDetailControl, mapMenu);
  const detachTileStreaming = attachTileStreamingActivity(mapButton, options.renderActivity);
  const detachRendererActivity = attachRendererActivity(rendererButton, options.renderActivity);
  const inputHud = createInputModeHud(container, pauseButton, {
    availableModes: new Set(["mouse", "trackpad"]),
    movements: ["orbit", "zoom"],
    trackpadOrbitGesture: "swipe",
    gestureDescription: (mode, movement) => movement === "orbit"
      ? (mode === "mouse" ? "Right-click drag to orbit" : "Two-finger swipe to orbit")
      : (mode === "mouse" ? "Mouse wheel to zoom" : "Pinch to zoom"),
    onModeChange: options.onInputModeChange,
    onSensitivityChange: options.onInputSensitivityChange,
  });

  rendererButton.classList.toggle("hud-chip--good", options.rendererMode === "webgpu");
  rendererButton.classList.toggle("hud-chip--bad", options.rendererMode !== "webgpu");
  rendererMenu.querySelectorAll<HTMLElement>("[data-renderer]").forEach((button) => {
    button.classList.toggle("is-active", (button.dataset.renderer ?? "") === (options.rendererForce ?? ""));
  });

  const updateMapState = (status: BabylonRuntimeStatus): void => {
    setMapSourceLabel(mapButton, mapSourceLabel(status));
    mapButton.classList.toggle("hud-chip--fallback", status.mode === "fallback");
    mapButton.classList.toggle("hud-chip--raster", status.mode === "raster-basemap");
    const activeSource = status.mode === "google-tiles" ? "google" : status.rasterBaseMap?.id;
    mapMenu.querySelectorAll<HTMLElement>("[data-map-source]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mapSource === activeSource);
    });
  };
  const updateTerrainState = (status: BabylonRuntimeStatus): void => {
    const terrain = status.terrainSource;
    terrainSourceButton.textContent = terrain ? `Elev: ${terrain.label}` : "Elevation";
    terrainSourceButton.classList.toggle("hud-chip--fallback", status.mode !== "raster-basemap");
    terrainSourceMenu.querySelectorAll<HTMLElement>("[data-terrain-source]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.terrainSource === terrain?.id);
    });
  };

  const updateTerrainDetailState = (): void => {
    const detail = options.getTerrainDetailState();
    const minErrorTarget = Math.min(detail.minErrorTarget, detail.maxErrorTarget);
    const maxErrorTarget = Math.max(detail.minErrorTarget, detail.maxErrorTarget);
    const minExponent = terrainDetailExponent(minErrorTarget);
    const maxExponent = terrainDetailExponent(maxErrorTarget);
    const selectedTarget = detail.overrideErrorTarget ?? maxErrorTarget;

    terrainDetailControl.classList.toggle("is-unavailable", !detail.available);
    terrainDetailSlider.disabled = !detail.available;
    terrainDetailSlider.min = String(minExponent);
    terrainDetailSlider.max = String(maxExponent);
    terrainDetailSlider.value = String(Math.max(minExponent, Math.min(maxExponent, terrainDetailExponent(selectedTarget))));
    terrainDetailSlider.style.left = "0";
    terrainDetailSlider.style.width = "100%";
    terrainDetailValidRange.style.left = "0";
    terrainDetailValidRange.style.width = "100%";

    const activeTarget = detail.activeErrorTarget;
    const hasActiveTarget = detail.available && activeTarget !== null;
    terrainDetailActiveMarker.hidden = !hasActiveTarget;
    if (activeTarget !== null) {
      terrainDetailActiveMarker.style.left = `${terrainDetailRangePercent(activeTarget, minErrorTarget, maxErrorTarget)}%`;
      terrainDetailActiveMarker.title = `Renderer target: ${formatTerrainDetailTarget(activeTarget)}`;
    }

    terrainDetailSlider.title = detail.available
      ? "Move left for more detail during this flight. Move to the far right to restore the saved World-detail setting."
      : "World detail is available with Google 3D Tiles.";
    terrainDetailControl.title = !detail.available
      ? "World detail is available with Google 3D Tiles."
      : activeTarget === null
        ? "Blue marker: waiting for a Google renderer target."
        : `Blue marker: renderer target ${formatTerrainDetailTarget(activeTarget)}.`;
  };

  let paused = false;
  const updatePauseState = (nextPaused: boolean): void => {
    paused = nextPaused;
    pauseButton.textContent = paused ? "▶" : "Ⅱ";
    pauseButton.title = paused ? "Resume simulation" : "Pause simulation";
    pauseButton.setAttribute("aria-label", pauseButton.title);
    pauseButton.setAttribute("aria-pressed", String(paused));
    pauseButton.classList.toggle("is-active", paused);
  };
  const onPauseClick = () => {
    updatePauseState(!paused);
    options.onPausedChange(paused);
  };
  const onRendererClick = (event: MouseEvent) => {
    event.stopPropagation();
    setMenuOpen(rendererMenu, rendererButton, rendererMenu.hidden);
    setMenuOpen(mapMenu, mapButton, false);
    setMenuOpen(terrainSourceMenu, terrainSourceButton, false);
  };
  const onMapClick = (event: MouseEvent) => {
    event.stopPropagation();
    setMenuOpen(mapMenu, mapButton, mapMenu.hidden);
    setMenuOpen(rendererMenu, rendererButton, false);
    setMenuOpen(terrainSourceMenu, terrainSourceButton, false);
  };
  const onTerrainSourceClick = (event: MouseEvent) => {
    event.stopPropagation();
    setMenuOpen(terrainSourceMenu, terrainSourceButton, terrainSourceMenu.hidden);
    setMenuOpen(rendererMenu, rendererButton, false);
    setMenuOpen(mapMenu, mapButton, false);
  };
  const onRendererMenuClick = (event: MouseEvent) => {
    const selected = (event.target as HTMLElement).closest<HTMLElement>("[data-renderer]")?.dataset.renderer ?? "";
    setMenuOpen(rendererMenu, rendererButton, false);
    options.onRendererChange(selected === "webgpu" || selected === "webgl2" || selected === "webgl" ? selected : null);
  };
  const onMapMenuClick = (event: MouseEvent) => {
    const selected = (event.target as HTMLElement).closest<HTMLElement>("[data-map-source]")?.dataset.mapSource;
    if (!selected) return;
    setMenuOpen(mapMenu, mapButton, false);
    options.onMapSourceChange(selected);
  };
  const onTerrainSourceMenuClick = (event: MouseEvent) => {
    const selected = (event.target as HTMLElement).closest<HTMLElement>("[data-terrain-source]")?.dataset.terrainSource;
    if (!selected) return;
    setMenuOpen(terrainSourceMenu, terrainSourceButton, false);
    options.onTerrainSourceChange(selected);
  };
  const onTerrainDetailInput = (): void => {
    const detail = options.getTerrainDetailState();
    if (!detail.available) return;
    const maxExponent = terrainDetailExponent(Math.max(detail.minErrorTarget, detail.maxErrorTarget));
    const errorTarget = Math.round(2 ** Number(terrainDetailSlider.value));
    // The rightmost position is deliberately a no-op override: it leaves the
    // saved World-detail setting in charge until the pilot moves the slider.
    options.onTerrainDetailChange(Math.abs(Number(terrainDetailSlider.value) - maxExponent) < 0.001 ? null : errorTarget);
    updateTerrainDetailState();
  };
  const onDocumentPointerDown = (event: PointerEvent) => {
    if (!rendererButton.contains(event.target as Node) && !rendererMenu.contains(event.target as Node)) {
      setMenuOpen(rendererMenu, rendererButton, false);
    }
    if (!mapButton.contains(event.target as Node) && !mapMenu.contains(event.target as Node)) {
      setMenuOpen(mapMenu, mapButton, false);
    }
    if (!terrainSourceButton.contains(event.target as Node) && !terrainSourceMenu.contains(event.target as Node)) {
      setMenuOpen(terrainSourceMenu, terrainSourceButton, false);
    }
  };

  pauseButton.addEventListener("click", onPauseClick);
  rendererButton.addEventListener("click", onRendererClick);
  rendererMenu.addEventListener("click", onRendererMenuClick);
  mapButton.addEventListener("click", onMapClick);
  mapMenu.addEventListener("click", onMapMenuClick);
  terrainSourceButton.addEventListener("click", onTerrainSourceClick);
  terrainSourceMenu.addEventListener("click", onTerrainSourceMenuClick);
  terrainDetailSlider.addEventListener("input", onTerrainDetailInput);
  settingsButton.addEventListener("click", options.onSettingsClick);
  document.addEventListener("pointerdown", onDocumentPointerDown);
  updateMapState(options.runtimeStatus);
  updateTerrainState(options.runtimeStatus);
  updateTerrainDetailState();

  return {
    setPhoneStatus(text) { if (phoneButton) phoneButton.textContent = text; },
    update(state, runtimeStatus, fps, nextPaused): void {
      updatePauseState(nextPaused);
      updateMapState(runtimeStatus);
      updateTerrainState(runtimeStatus);
      updateTerrainDetailState();
      const heading = String(Math.round(headingDegFromRad(state.headingRad))).padStart(3, "0");
      fpsElement.textContent = nextPaused ? "FPS paused" : fps === null ? "FPS —" : `FPS ${Math.round(fps)}`;
      statusElement.textContent = `${Math.abs(state.latDeg).toFixed(4)}°${state.latDeg >= 0 ? "N" : "S"} ${Math.abs(state.lonDeg).toFixed(4)}°${state.lonDeg >= 0 ? "E" : "W"} h${heading}°`;
    },
    destroy(): void {
      phoneButton?.removeEventListener("click", onPhoneClick);
      pauseButton.removeEventListener("click", onPauseClick);
      rendererButton.removeEventListener("click", onRendererClick);
      rendererMenu.removeEventListener("click", onRendererMenuClick);
      mapButton.removeEventListener("click", onMapClick);
      mapMenu.removeEventListener("click", onMapMenuClick);
      terrainSourceButton.removeEventListener("click", onTerrainSourceClick);
      terrainSourceMenu.removeEventListener("click", onTerrainSourceMenuClick);
      terrainDetailSlider.removeEventListener("input", onTerrainDetailInput);
      settingsButton.removeEventListener("click", options.onSettingsClick);
      document.removeEventListener("pointerdown", onDocumentPointerDown);
      detachDownloadSpeed();
      detachTileStreaming();
      detachRendererActivity();
      inputHud.destroy();
      hudBar.destroy();
    },
  };
}
