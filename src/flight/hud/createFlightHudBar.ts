import "foss-earth/shell.css";

import { createHudBar, type HudBarHandle } from "foss-earth/shell";
import type { BabylonRuntimeStatus, RasterBaseMapSource, RendererMode } from "foss-earth/runtime";
import { headingDegFromRad, type FlightState } from "../physics/flightState";

export interface FlightHudBarOptions {
  rendererMode: RendererMode;
  rendererForce: RendererMode | null;
  runtimeStatus: BabylonRuntimeStatus;
  rasterSources: readonly RasterBaseMapSource[];
  onControlsClick(): void;
  onPausedChange(paused: boolean): void;
  onRendererChange(mode: RendererMode | null): void;
  onMapSourceChange(sourceId: string): void;
}

export interface FlightHudBarHandle {
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

export function createFlightHudBar(container: HTMLElement, options: FlightHudBarOptions): FlightHudBarHandle {
  const hudBar: HudBarHandle = createHudBar(container, {
    ariaLabel: "Flight simulator controls",
    items: [
      { kind: "button", id: "flightControlsButton", title: "Flight controls", ariaLabel: "Flight controls", className: "flight-shell-controls-button", text: "✈" },
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
      { kind: "slot", id: "flightShellStatus", className: "hud-chip hud-status-text", ariaLive: "polite", ariaLabel: "Flight status" },
    ],
  });

  const controlsButton = hudBar.getElement<HTMLButtonElement>("flightControlsButton");
  const pauseButton = hudBar.getElement<HTMLButtonElement>("flightPauseButton");
  const rendererButton = hudBar.getElement<HTMLButtonElement>("flightRendererButton");
  const rendererMenu = hudBar.getElement("flightRendererMenu");
  const mapButton = hudBar.getElement<HTMLButtonElement>("flightMapSourceButton");
  const mapMenu = hudBar.getElement("flightMapSourceMenu");
  const statusElement = hudBar.getElement("flightShellStatus");
  if (!controlsButton || !pauseButton || !rendererButton || !rendererMenu || !mapButton || !mapMenu || !statusElement) {
    hudBar.destroy();
    throw new Error("Flight HUD bar failed to mount.");
  }

  rendererButton.classList.toggle("hud-chip--good", options.rendererMode === "webgpu");
  rendererButton.classList.toggle("hud-chip--bad", options.rendererMode !== "webgpu");
  rendererMenu.querySelectorAll<HTMLElement>("[data-renderer]").forEach((button) => {
    button.classList.toggle("is-active", (button.dataset.renderer ?? "") === (options.rendererForce ?? ""));
  });

  const updateMapState = (status: BabylonRuntimeStatus): void => {
    mapButton.textContent = mapSourceLabel(status);
    mapButton.classList.toggle("hud-chip--fallback", status.mode === "fallback");
    mapButton.classList.toggle("hud-chip--raster", status.mode === "raster-basemap");
    const activeSource = status.mode === "google-tiles" ? "google" : status.rasterBaseMap?.id;
    mapMenu.querySelectorAll<HTMLElement>("[data-map-source]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mapSource === activeSource);
    });
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
  const onControlsClick = () => options.onControlsClick();
  const onPauseClick = () => {
    updatePauseState(!paused);
    options.onPausedChange(paused);
  };
  const onRendererClick = (event: MouseEvent) => {
    event.stopPropagation();
    setMenuOpen(rendererMenu, rendererButton, rendererMenu.hidden);
    setMenuOpen(mapMenu, mapButton, false);
  };
  const onMapClick = (event: MouseEvent) => {
    event.stopPropagation();
    setMenuOpen(mapMenu, mapButton, mapMenu.hidden);
    setMenuOpen(rendererMenu, rendererButton, false);
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
  const onDocumentPointerDown = (event: PointerEvent) => {
    if (!rendererButton.contains(event.target as Node) && !rendererMenu.contains(event.target as Node)) {
      setMenuOpen(rendererMenu, rendererButton, false);
    }
    if (!mapButton.contains(event.target as Node) && !mapMenu.contains(event.target as Node)) {
      setMenuOpen(mapMenu, mapButton, false);
    }
  };

  controlsButton.addEventListener("click", onControlsClick);
  pauseButton.addEventListener("click", onPauseClick);
  rendererButton.addEventListener("click", onRendererClick);
  rendererMenu.addEventListener("click", onRendererMenuClick);
  mapButton.addEventListener("click", onMapClick);
  mapMenu.addEventListener("click", onMapMenuClick);
  document.addEventListener("pointerdown", onDocumentPointerDown);
  updateMapState(options.runtimeStatus);

  return {
    update(state, runtimeStatus, fps, nextPaused): void {
      updatePauseState(nextPaused);
      updateMapState(runtimeStatus);
      const heading = String(Math.round(headingDegFromRad(state.headingRad))).padStart(3, "0");
      const frameRate = fps === null ? "" : ` ${Math.round(fps)}fps`;
      statusElement.textContent = `${Math.abs(state.latDeg).toFixed(4)}°${state.latDeg >= 0 ? "N" : "S"} ${Math.abs(state.lonDeg).toFixed(4)}°${state.lonDeg >= 0 ? "E" : "W"} h${heading}°${frameRate}`;
    },
    destroy(): void {
      controlsButton.removeEventListener("click", onControlsClick);
      pauseButton.removeEventListener("click", onPauseClick);
      rendererButton.removeEventListener("click", onRendererClick);
      rendererMenu.removeEventListener("click", onRendererMenuClick);
      mapButton.removeEventListener("click", onMapClick);
      mapMenu.removeEventListener("click", onMapMenuClick);
      document.removeEventListener("pointerdown", onDocumentPointerDown);
      hudBar.destroy();
    },
  };
}