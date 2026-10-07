import type { HudInputMode, InputSensitivitySettings } from "foss-earth/input";
import "foss-earth/shell.css";
import "foss-earth/input-mode.css";

import { attachFullscreenButton, attachRendererActivity, createInputModeHud, createHudBar, createMapSourceHud, createPositionReadout, getRendererLabel, type HudBarHandle, type MapDetailController, type RenderActivitySource, type TileStreamingSource, type MapDownloadSource } from "foss-earth/shell";
import type { BabylonRuntimeStatus, RendererMode } from "foss-earth/runtime";
import { getAppSettings } from "foss-earth/settings";
import { headingDegFromRad, type FlightState } from "../physics/flightState";
import { LOADING_LIVE_ATTRIBUTE } from "../../loading/createFlightLoadingScreen";

export interface FlightHudBarOptions {
  renderActivity: RenderActivitySource & TileStreamingSource & MapDownloadSource;
  rendererMode: RendererMode;
  runtimeStatus: BabylonRuntimeStatus;
  onInputModeChange(mode: HudInputMode): void;
  onInputSensitivityChange(settings: InputSensitivitySettings): void;
  onPausedChange(paused: boolean): void;
  /** The shared detail controller behind the rail beside the basemap and the Map tab's Detail group. */
  mapDetail: MapDetailController;
  onSettingsClick(): void;
  /** The FPS chip toggles the Debug tab. */
  onDebugClick(): void;
  /** The input-method button toggles the Controls tab, the settings' one home. */
  onInputMethodClick(): void;
  /** The renderer chip toggles the Renderer tab, where the renderer is chosen. */
  onRendererClick(): void;
  /** The basemap's name, at the bar's right end, toggles the Map tab. */
  onMapClick(): void;
  /** The position readout toggles the Location tab. */
  onStatusClick(): void;
  /** Opens or closes the game log history; returns whether it is now open. */
  onLogToggle?(): boolean;
}

export interface FlightHudBarHandle {
  /**
   * `groundHeightMeters` is the terrain's height under the aircraft, or null
   * while none has loaded there: what the altitude above ground is measured from.
   */
  update(state: FlightState, status: BabylonRuntimeStatus, fps: number | null, paused: boolean, groundHeightMeters?: number | null): void;
  /** Draws the Input method section into the Controls tab. Returns an unmount. */
  mountInputMethod(container: HTMLElement): () => void;
  destroy(): void;
}

export function createFlightHudBar(container: HTMLElement, options: FlightHudBarOptions): FlightHudBarHandle {
  const hudBar: HudBarHandle = createHudBar(container, {
    ariaLabel: "Flight simulator controls",
    items: [
      { kind: "button", id: "flightPauseButton", title: "Pause simulation", ariaLabel: "Pause simulation", className: "flight-shell-pause-button", text: "Ⅱ" },
      { kind: "button", id: "flightFps", title: "Rendered frames per second. Click to show or hide the Debug tab.", ariaLabel: "Frame rate. Show or hide Debug", ariaLive: "polite", appearance: "chip", className: "hud-chip-button", text: "FPS —" },
      { kind: "button", id: "flightRendererButton", title: "GPU renderer API. Click to show or hide the Renderer tab.", ariaLabel: "GPU renderer API", appearance: "chip", className: "hud-chip-button hud-chip--gpu", text: getRendererLabel(options.rendererMode) },
      { kind: "button", id: "flightSettingsButton", title: "Open flight settings", ariaLabel: "Open flight settings", className: "settings-button", text: "⚙" },
      { kind: "button", id: "flightFullscreenButton", title: "Enter fullscreen", ariaLabel: "Enter fullscreen", className: "flight-fullscreen-button", text: "⛶" },
      { kind: "button", id: "flightLogButton", title: "Show the game log history", ariaLabel: "Show the game log history", className: "flight-log-button", text: "☰" },
      { kind: "button", id: "flightShellStatus", appearance: "chip", className: "hud-chip-button hud-status-text", ariaLive: "polite", ariaLabel: "Aircraft position", title: "Latitude, longitude, altitude and heading. Click to show or hide the Location tab." },
      { kind: "slot", id: "flightMapSourceSlot", className: "map-source-hud-slot" },
    ],
  });

  const pauseButton = hudBar.getElement<HTMLButtonElement>("flightPauseButton");
  const fpsButton = hudBar.getElement<HTMLButtonElement>("flightFps");
  const rendererButton = hudBar.getElement<HTMLButtonElement>("flightRendererButton");
  const mapSourceSlot = hudBar.getElement("flightMapSourceSlot");
  const settingsButton = hudBar.getElement<HTMLButtonElement>("flightSettingsButton");
  const statusElement = hudBar.getElement<HTMLButtonElement>("flightShellStatus");
  if (!pauseButton || !fpsButton || !rendererButton || !mapSourceSlot || !settingsButton || !statusElement) {
    hudBar.destroy();
    throw new Error("Flight HUD bar failed to mount.");
  }
  // Pausing works while the world loads too; the flight then starts paused.
  pauseButton.setAttribute(LOADING_LIVE_ATTRIBUTE, "");

  // The World detail rail, then the download speed and basemap as one button,
  // then its credit link, sit at the bar's right end, shared with FOSS Earth.
  const mapSource = createMapSourceHud(mapSourceSlot, {
    activity: options.renderActivity,
    onProviderClick: options.onMapClick,
    detail: { controller: options.mapDetail, name: "World detail" },
  });
  const detachRendererActivity = attachRendererActivity(rendererButton, options.renderActivity);
  // FOSS Earth's readout: Interface → Position readout says how it is written.
  const position = createPositionReadout(statusElement, getAppSettings());
  // The device decides what the section offers: Touch on a touchscreen, and the
  // mouse or trackpad choice where there is a pointer; a touch laptop gets both.
  const inputHud = createInputModeHud(container, pauseButton, {
    movements: ["orbit", "zoom"],
    trackpadOrbitGesture: "swipe",
    gestureDescription: (mode, movement) => movement === "orbit"
      ? (mode === "mouse" ? "Right-click drag to orbit" : mode === "touch" ? "Two-finger drag to orbit" : "Two-finger swipe to orbit")
      : (mode === "mouse" ? "Mouse wheel to zoom" : "Pinch to zoom"),
    onModeChange: options.onInputModeChange,
    onSensitivityChange: options.onInputSensitivityChange,
    onToggle: options.onInputMethodClick,
  });

  rendererButton.classList.toggle("hud-chip--good", options.rendererMode === "webgpu");
  rendererButton.classList.toggle("hud-chip--bad", options.rendererMode !== "webgpu");

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

  const fullscreenButton = hudBar.getElement<HTMLButtonElement>("flightFullscreenButton");
  const logButton = hudBar.getElement<HTMLButtonElement>("flightLogButton");
  const detachFullscreen = fullscreenButton ? attachFullscreenButton(fullscreenButton) : () => {};
  const onLogClick = (): void => { logButton?.setAttribute("aria-pressed", String(options.onLogToggle?.() ?? false)); };
  if (logButton) {
    logButton.hidden = !options.onLogToggle;
    logButton.setAttribute("aria-pressed", "false");
  }
  logButton?.addEventListener("click", onLogClick);

  pauseButton.addEventListener("click", onPauseClick);
  rendererButton.addEventListener("click", options.onRendererClick);
  statusElement.addEventListener("click", options.onStatusClick);
  settingsButton.addEventListener("click", options.onSettingsClick);
  fpsButton.addEventListener("click", options.onDebugClick);
  mapSource.update(options.runtimeStatus);

  return {
    mountInputMethod: (host) => inputHud.mountInline(host),
    update(state, runtimeStatus, fps, nextPaused, groundHeightMeters = null): void {
      updatePauseState(nextPaused);
      mapSource.update(runtimeStatus);
      const heading = String(Math.round(headingDegFromRad(state.headingRad))).padStart(3, "0");
      fpsButton.textContent = fps === null ? "FPS —" : `FPS ${Math.round(fps)}`;
      position.update({ latDeg: state.latDeg, lonDeg: state.lonDeg, altitudeMeters: state.altMeters, groundHeightMeters, rest: `h${heading}°` });
    },
    destroy(): void {
      logButton?.removeEventListener("click", onLogClick);
      detachFullscreen();
      pauseButton.removeEventListener("click", onPauseClick);
      rendererButton.removeEventListener("click", options.onRendererClick);
      statusElement.removeEventListener("click", options.onStatusClick);
      settingsButton.removeEventListener("click", options.onSettingsClick);
      fpsButton.removeEventListener("click", options.onDebugClick);
      mapSource.destroy();
      detachRendererActivity();
      position.destroy();
      inputHud.destroy();
      hudBar.destroy();
    },
  };
}
