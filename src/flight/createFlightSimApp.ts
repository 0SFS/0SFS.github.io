import "foss-earth/shell.css";
import "foss-earth/windowing.css";
import type { LocationSearchProvider, GeodeticLocation } from "foss-earth/windowing";
import { resetFlightLocation } from "./jsbsim/resetFlightLocation";
import { createTerrainContact } from "./physics/terrainContact";
import { loadInputModePreference, loadInputSensitivityPreference } from "foss-earth/input";
import "../styles/flight.css";

import {
  createBabylonRuntime,
  RASTER_BASE_MAP_SOURCES,
  TERRAIN_SOURCES,
  resolveTerrainSource,
  resolveRasterBaseMapSource,
  resolveMapRuntimeConfig,
  setMapSourcePreference,
  setRasterQualityPreference,
  setTerrainSourcePreference,
  type BabylonRuntime,
  type RasterBaseMapSource,
} from "foss-earth/runtime";
import { createPlaceholderAircraft } from "./aircraft/createPlaceholderAircraft";
import { readFlightState } from "./bridge/ecefBridge";
import { createFloatingOrigin, type FloatingOriginHandle } from "./bridge/floatingOrigin";
import {
  type FlightControlPanelHandle,
  type FlightControlPanelSnapshot,
  type FlightWeatherState,
} from "./hud/FlightControlPanel";
import { createFlightControlPanel } from "./hud/createFlightControlPanel";
import { createFlightHud, type FlightHudHandle } from "./hud/flightHud";
import { createFlightHudBar, type FlightHudBarHandle } from "./hud/createFlightHudBar";
import { attachFlightCameraInput } from "./input/flightCameraInput";
import { createFlightInputManager } from "./input/flightInputManager";
import { createJsbsimRuntime } from "./jsbsim/createJsbsimRuntime";
import { createFixedStepPhysicsLoop } from "./physics/fixedStepLoop";

export interface FlightSimAppOptions {
  googleApiKey?: string | null;
  baseMap?: string | RasterBaseMapSource | null;
  preferGoogleTiles?: boolean;
  dataBaseUrl?: string;
  locationSearchProvider?: LocationSearchProvider;
}

export interface FlightSimAppHandle {
  runtime: BabylonRuntime;
  destroy(): void;
}

type FlightRendererForce = "webgl" | "webgl2" | "webgpu";

function getRendererForceFromUrl(): FlightRendererForce | null {
  const force = new URLSearchParams(window.location.search).get("renderer");
  if (force === "webgl" || force === "webgl2" || force === "webgpu") return force;
  return null;
}

function setRendererForce(force: FlightRendererForce | null): void {
  const url = new URL(window.location.href);
  if (force) url.searchParams.set("renderer", force);
  else url.searchParams.delete("renderer");
  window.location.assign(url.toString());
}

function zoomMetersFromAltitude(altMeters: number): number {
  return Math.max(250, Math.min(altMeters * 1.5, 12_000));
}

export async function createFlightSimApp(
  rootElement: HTMLElement,
  options: FlightSimAppOptions = {},
): Promise<FlightSimAppHandle> {
  const mapConfig = resolveMapRuntimeConfig({
    googleApiKey: options.googleApiKey,
    baseMap: options.baseMap,
    preferGoogleTiles: options.preferGoogleTiles,
  });

  rootElement.innerHTML = `
    <div class="flight-app">
      <canvas class="flight-app__canvas" aria-label="Flight simulator viewport"></canvas>
      <div class="flight-hud-root"></div>
      <div class="flight-shell-root"></div>
      <div class="flight-panel-root"></div>
    </div>
  `;

  const canvas = rootElement.querySelector<HTMLCanvasElement>(".flight-app__canvas");
  const hudRoot = rootElement.querySelector<HTMLElement>(".flight-hud-root");
  const shellRoot = rootElement.querySelector<HTMLElement>(".flight-shell-root");
  const panelRoot = rootElement.querySelector<HTMLElement>(".flight-panel-root");
  if (!canvas || !hudRoot || !shellRoot || !panelRoot) {
    throw new Error("Flight sim shell failed to mount.");
  }

  const runtime = await createBabylonRuntime(canvas, {
    googleApiKey: mapConfig.googleApiKey,
    preferGoogleTiles: mapConfig.preferGoogleTiles,
    rasterBaseMap: mapConfig.rasterBaseMap,
    terrainSource: mapConfig.terrainSource,
    rasterQuality: mapConfig.rasterQuality,
    rendererForce: getRendererForceFromUrl(),
    simMode: true,
  });

  if (runtime.geospatialCamera) {
    runtime.geospatialCamera.detachControl();
    runtime.geospatialCamera.setEnabled(false);
  }

  const jsbsim = await createJsbsimRuntime({
    dataBaseUrl: options.dataBaseUrl,
    onLog: (stream, message) => {
      if (stream === "stderr") {
        console.warn("[jsbsim]", message);
      }
    },
  });

  const inputManager = createFlightInputManager({ onPausedChange: (paused) => syncSimulationPaused(paused) });
  const detachInput = inputManager.attach(window);
  const physicsLoop = createFixedStepPhysicsLoop(jsbsim.sdk);
  const terrainContact = createTerrainContact(jsbsim.sdk, runtime.surface);
  const flightHud: FlightHudHandle = createFlightHud(hudRoot, {
    onThrottleChange: (value) => { inputManager.setThrottle(value); runtime.requestRender(); },
    onPitchTrimChange: (value) => { inputManager.setPitchTrim(value); runtime.requestRender(); },
  });

  let floatingOrigin: FloatingOriginHandle | null = null;
  let aircraft: ReturnType<typeof createPlaceholderAircraft> | null = null;
  let controlPanel: FlightControlPanelHandle | null = null;
  let hudBar: FlightHudBarHandle | null = null;
  let inputMode = loadInputModePreference(new Set(["mouse", "trackpad"]));
  let inputSensitivity = loadInputSensitivityPreference();
  const detachCameraInput = attachFlightCameraInput(canvas, {
    getMode: () => inputMode,
    getSensitivity: () => inputSensitivity,
    orbit: (yaw, pitch) => {
      if (!aircraft || aircraft.getViewMode() !== "third") return;
      aircraft.orbitChaseCamera(yaw, pitch);
      runtime.requestRender();
    },
    zoom: (factor) => {
      if (!aircraft || aircraft.getViewMode() !== "third") return;
      aircraft.zoomChaseCamera(factor);
      runtime.requestRender();
    },
  });
  let skipResumeDelta = false;
  let disposed = false;
  let lastPanelUpdateMs = 0;
  let fpsSampleStartedMs = performance.now();
  let fpsSampleFrames = 0;
  let measuredFps: number | null = null;
  const weather: FlightWeatherState = { windDirectionDeg: 0, windSpeedKts: 0 };

  const mountFlightWorld = (): void => {
    const worldRoot = runtime.getWorldRoot();
    if (!worldRoot || floatingOrigin) return;

    floatingOrigin = createFloatingOrigin(runtime.scene, worldRoot);
    aircraft = createPlaceholderAircraft(runtime.scene, floatingOrigin.aircraftRoot);
    aircraft.setViewMode("third");

    const initialState = readFlightState(jsbsim.sdk);
    floatingOrigin.apply(initialState);
    runtime.setSimViewState({
      latDeg: initialState.latDeg,
      lonDeg: initialState.lonDeg,
      zoomMeters: zoomMetersFromAltitude(initialState.altMeters),
      headingDeg: (initialState.headingRad * 180) / Math.PI,
    });
  };

  const toggleCameraView = (): void => {
    aircraft?.toggleViewMode();
    runtime.requestRender();
  };

  const onViewKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "KeyV" || event.repeat) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    toggleCameraView();
  };

  window.addEventListener("keydown", onViewKeyDown);

  mountFlightWorld();
  const initialState = readFlightState(jsbsim.sdk);
  const createPanelSnapshot = (flightState = initialState): FlightControlPanelSnapshot => ({
    flightState,
    fps: runtime.engine.getFps(),
    paused: inputManager.isPaused(),
    viewMode: aircraft?.getViewMode() ?? "third",
    runtimeStatus: { ...runtime.status },
    rendererMode: runtime.renderer.mode,
  });

  const syncSimulationPaused = (paused: boolean): void => {
    physicsLoop.setPaused(paused);
    runtime.setSimRunning(!paused);
    skipResumeDelta = !paused;
    const state = physicsLoop.getLatestState() ?? initialState;
    controlPanel?.update(createPanelSnapshot(state));
    hudBar?.update(state, runtime.status, paused ? null : measuredFps, paused);
  };
  const setSimulationPaused = (paused: boolean): void => inputManager.setPaused(paused);

  const applyWeather = (nextWeather: FlightWeatherState): void => {
    weather.windDirectionDeg = nextWeather.windDirectionDeg;
    weather.windSpeedKts = nextWeather.windSpeedKts;
    const directionRad = (nextWeather.windDirectionDeg * Math.PI) / 180;
    const speedFps = nextWeather.windSpeedKts * 1.68781;
    jsbsim.sdk.setPropertyValue("atmosphere/wind-north-fps", -Math.cos(directionRad) * speedFps);
    jsbsim.sdk.setPropertyValue("atmosphere/wind-east-fps", -Math.sin(directionRad) * speedFps);
  };

  const teleportToLocation = (location: GeodeticLocation): void => {
    if (disposed) return;
    const ground = runtime.status.mode === "raster-basemap" ? runtime.surface.sample(location.latDeg, location.lonDeg)?.heightMeters : undefined;
    const state = resetFlightLocation(jsbsim.sdk, location, ground);
    terrainContact.reset();
    if (location.flightPreset) {
      inputManager.resetControls(location.flightPreset.mode === "departure" ? 0 : 0.35);
      if (location.flightPreset.mode === "departure") setSimulationPaused(true);
    }
    physicsLoop.reset();
    skipResumeDelta = true;
    applyWeather(weather);
    // Aircraft and chase camera stay at the local origin; shift the ECEF world
    // into the new ENU frame before requesting the first destination frame.
    mountFlightWorld();
    floatingOrigin?.apply(state);
    runtime.setSimViewState({
      latDeg: state.latDeg, lonDeg: state.lonDeg,
      zoomMeters: zoomMetersFromAltitude(state.altMeters),
      headingDeg: state.headingRad * 180 / Math.PI,
    });
    flightHud.update(state, inputManager.poll(0).pitchTrim);
    controlPanel?.update(createPanelSnapshot(state));
    hudBar?.update(state, runtime.status, measuredFps, inputManager.isPaused());
    runtime.requestRender();
  };

  controlPanel = createFlightControlPanel(panelRoot, createPanelSnapshot(), {
    initialWeather: weather,
    onLocationApply: teleportToLocation,
    locationSearchProvider: options.locationSearchProvider,
    onWeatherChange: applyWeather,
    onPausedChange: setSimulationPaused,
    onViewModeChange: (mode) => { aircraft?.setViewMode(mode); runtime.requestRender(); },
  });
  const rendererForce = getRendererForceFromUrl();
  hudBar = createFlightHudBar(shellRoot, {
    renderActivity: runtime,
    rendererMode: runtime.renderer.mode,
    rendererForce,
    runtimeStatus: runtime.status,
    rasterSources: RASTER_BASE_MAP_SOURCES,
    terrainSources: TERRAIN_SOURCES,
    onInputModeChange: (mode) => { inputMode = mode; },
    onInputSensitivityChange: (settings) => { inputSensitivity = settings; },
    onPausedChange: setSimulationPaused,
    onRendererChange: setRendererForce,
    onMapSourceChange: (sourceId) => {
      runtime.setMapSource(sourceId === "google" ? "google" : resolveRasterBaseMapSource(sourceId));
      setMapSourcePreference(sourceId);
    },
    onTerrainSourceChange: (sourceId) => {
      runtime.setTerrainSource(resolveTerrainSource(sourceId));
      setTerrainSourcePreference(sourceId);
    },
    onQualityChange: (setting) => {
      runtime.setRasterQuality(setting);
      setRasterQualityPreference(setting);
    },
    onSettingsClick: () => panelRoot.querySelector<HTMLButtonElement>('[aria-label="Open right panel"]')?.click(),
  });
  hudBar.update(initialState, runtime.status, measuredFps, inputManager.isPaused());

  const ensureWorld = (): void => {
    mountFlightWorld();
  };

  runtime.setSimTick((deltaSeconds) => {
    if (disposed) return;
    // Do not integrate the time spent idle when resuming the simulation.
    deltaSeconds = skipResumeDelta ? 0 : Math.min(deltaSeconds, 0.1);
    skipResumeDelta = false;

    fpsSampleFrames += 1;
    const frameNow = performance.now();
    const fpsSampleElapsedMs = frameNow - fpsSampleStartedMs;
    if (fpsSampleElapsedMs >= 500) {
      measuredFps = (fpsSampleFrames * 1000) / fpsSampleElapsedMs;
      fpsSampleStartedMs = frameNow;
      fpsSampleFrames = 0;
    }

    ensureWorld();

    // Refinement can arrive while paused, including when resting on a runway.
    if (!physicsLoop.getFault() && runtime.status.mode === "raster-basemap" && terrainContact.update() === "reset") {
      physicsLoop.reset();
    }

    physicsLoop.setPaused(inputManager.isPaused());
    const controls = inputManager.poll(deltaSeconds);
    const displayState = physicsLoop.update(deltaSeconds, () => {
      const contact = runtime.status.mode === "raster-basemap" ? terrainContact.update() : true;
      if (contact === false) return false;
      inputManager.apply(jsbsim.sdk, controls);
      return contact;
    });

    const fault = physicsLoop.getFault();
    if (fault) {
      runtime.status.lastError = fault;
      runtime.status.message = fault;
      if (!inputManager.isPaused()) setSimulationPaused(true);
    }

    const surfaceHeight = runtime.status.mode === "raster-basemap"
      ? runtime.surface.sample(displayState.latDeg, displayState.lonDeg)?.heightMeters ?? 0 : 0;

    runtime.setSimViewState({
      latDeg: displayState.latDeg,
      lonDeg: displayState.lonDeg,
      zoomMeters: zoomMetersFromAltitude(displayState.altMeters - surfaceHeight),
      headingDeg: (displayState.headingRad * 180) / Math.PI,
    });

    floatingOrigin?.apply(displayState);
    flightHud.update(displayState, controls.pitchTrim);
    const now = performance.now();
    if (now - lastPanelUpdateMs >= 100) {
      lastPanelUpdateMs = now;
      controlPanel?.update(createPanelSnapshot(displayState));
      hudBar?.update(displayState, runtime.status, inputManager.isPaused() ? null : measuredFps, inputManager.isPaused());
    }
  });

  return {
    runtime,
    destroy(): void {
      if (disposed) return;
      disposed = true;
      runtime.setSimTick(null);
      window.removeEventListener("keydown", onViewKeyDown);
      detachCameraInput();
      detachInput();
      hudBar?.destroy();
      controlPanel?.destroy();
      flightHud.destroy();
      aircraft?.dispose();
      floatingOrigin?.dispose();
      jsbsim.dispose();
      runtime.destroy();
      rootElement.innerHTML = "";
    },
  };
}
