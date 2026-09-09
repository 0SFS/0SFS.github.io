import "foss-earth/shell.css";
import "foss-earth/windowing.css";
import type { LocationSearchProvider, GeodeticLocation } from "foss-earth/windowing";
import { resetFlightLocation } from "./jsbsim/resetFlightLocation";
import { createTerrainContact } from "./physics/terrainContact";
import { createVisibleMeshCollision } from "./physics/visibleMeshCollision";
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
import {
  isAircraftId,
  isAircraftLodId,
  type AircraftId,
  type AircraftLodId,
} from "./aircraft/aircraftCatalog";
import { applyAircraftRig, readControlSurfaceState } from "./aircraft/aircraftAnimation";
import { flightLog } from "./diagnostics/flightLog";
import {
  createAircraftModel,
  type AircraftModelHandle,
  type AircraftModelState,
} from "./aircraft/createAircraftModel";
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
import { createFlightStatusOverlay, type FlightStatusOverlayHandle } from "./hud/createFlightStatusOverlay";
import type { FlightStatusOverlayState } from "./hud/FlightStatusOverlay";
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

const AIRCRAFT_PREFERENCE_KEY = "flight-sim.aircraft";
const AIRCRAFT_LOD_PREFERENCE_KEY = "flight-sim.aircraft-lod";

function readPreference<T>(key: string, isValid: (value: unknown) => value is T, fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key);
    return isValid(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Preference persistence is best-effort; private mode must not break the sim.
  }
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
      <div class="flight-status-root"></div>
      <div class="flight-shell-root"></div>
      <div class="flight-panel-root"></div>
    </div>
  `;

  const canvas = rootElement.querySelector<HTMLCanvasElement>(".flight-app__canvas");
  const hudRoot = rootElement.querySelector<HTMLElement>(".flight-hud-root");
  const statusRoot = rootElement.querySelector<HTMLElement>(".flight-status-root");
  const shellRoot = rootElement.querySelector<HTMLElement>(".flight-shell-root");
  const panelRoot = rootElement.querySelector<HTMLElement>(".flight-panel-root");
  if (!canvas || !hudRoot || !statusRoot || !shellRoot || !panelRoot) {
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
  const visibleMeshCollision = createVisibleMeshCollision(jsbsim.sdk, runtime.surface);
  const flightHud: FlightHudHandle = createFlightHud(hudRoot, {
    onThrottleChange: (value) => { inputManager.setThrottle(value); runtime.requestRender(); },
    onPitchTrimChange: (value) => { inputManager.setPitchTrim(value); runtime.requestRender(); },
  });

  let floatingOrigin: FloatingOriginHandle | null = null;
  let aircraft: ReturnType<typeof createPlaceholderAircraft> | null = null;
  let aircraftModel: AircraftModelHandle | null = null;
  let aircraftId: AircraftId = readPreference(AIRCRAFT_PREFERENCE_KEY, isAircraftId, "cessna-172");
  let aircraftLodId: AircraftLodId = readPreference(AIRCRAFT_LOD_PREFERENCE_KEY, isAircraftLodId, "auto");
  let modelState: AircraftModelState = {
    aircraftId, lodId: aircraftLodId, activeLodId: null,
    status: "placeholder", triangles: null, error: null,
  };
  let controlPanel: FlightControlPanelHandle | null = null;
  let hudBar: FlightHudBarHandle | null = null;
  let statusOverlay: FlightStatusOverlayHandle | null = null;
  // A missing terrain sample stops the loop from stepping without raising a
  // fault, so track how long that has been true to tell a stall from a hitch.
  let terrainBlockedSinceMs: number | null = null;
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
      aircraftModel?.refreshAutoLod();
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
    aircraftModel = createAircraftModel(runtime.scene, aircraft.modelRoot, {
      aircraftId,
      lodId: aircraftLodId,
      getChaseDistanceMeters: () => aircraft?.getChaseDistanceMeters() ?? 0,
      onStateChange: (state) => {
        modelState = state;
        aircraft?.setModelLoaded(state.status === "ready");
        controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
        runtime.requestRender();
      },
    });

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
    aircraftId,
    lodId: aircraftLodId,
    modelStatus: modelState.status,
    modelActiveLodId: modelState.activeLodId,
    modelTriangles: modelState.triangles,
    modelError: modelState.error,
  });

  const syncSimulationPaused = (paused: boolean): void => {
    const priorFault = physicsLoop.getFault();
    flightLog.info("sim", paused ? "Paused" : "Resume requested",
      priorFault ? { clearingFault: priorFault } : undefined);
    if (!paused && priorFault) {
      // The fixed-step loop restores its last valid pre-fault state. Resume is
      // therefore a recovery action as well as a pause toggle; teleport is not
      // required merely to clear a transient terrain-contact fault.
      try {
        physicsLoop.reset();
      } catch (error) {
        // Resume is also the recovery action, so a failed reset is exactly the
        // case where the aircraft cannot be recovered without repositioning.
        flightLog.error("sim", "Resume failed: physics could not be reset", {
          reason: error instanceof Error ? error.message : String(error),
        });
      }
      terrainContact.reset();
      visibleMeshCollision.reset();
    }
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
    visibleMeshCollision.reset();
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
    onAircraftChange: (nextId) => {
      aircraftId = nextId;
      writePreference(AIRCRAFT_PREFERENCE_KEY, nextId);
      aircraftModel?.setAircraft(nextId);
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
      runtime.requestRender();
    },
    onLodChange: (nextLod) => {
      aircraftLodId = nextLod;
      writePreference(AIRCRAFT_LOD_PREFERENCE_KEY, nextLod);
      aircraftModel?.setLod(nextLod);
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
      runtime.requestRender();
    },
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
  statusOverlay = createFlightStatusOverlay(statusRoot, {
    onResume: () => setSimulationPaused(false),
  });

  /** Reasons recorded alongside the most recent physics fault. */
  const latestFaultReasons = (): string[] => {
    const entry = flightLog.entries().find(
      (candidate) => candidate.level === "error" && candidate.source === "physics",
    );
    const failed = entry?.detail?.failed;
    return Array.isArray(failed) ? failed.map(String) : [];
  };

  const updateStatusOverlay = (fault: string | null, nowMs: number): void => {
    let state: FlightStatusOverlayState = null;
    if (fault) {
      state = { kind: "fault", message: fault, failed: latestFaultReasons() };
    } else if (terrainBlockedSinceMs !== null) {
      const heldSeconds = (nowMs - terrainBlockedSinceMs) / 1000;
      // Single-frame misses are normal while tiles stream in; only say
      // something once the aircraft has actually stopped moving.
      if (heldSeconds >= 0.4) {
        state = { kind: "waiting", message: "Waiting for terrain height data", heldSeconds };
      }
    }
    statusOverlay?.update(state);
  };

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
    const blockOnMissingSurface = runtime.status.mode === "raster-basemap";
    if (!physicsLoop.getFault() && terrainContact.update(blockOnMissingSurface) === "reset") {
      physicsLoop.reset();
    }

    physicsLoop.setPaused(inputManager.isPaused());
    const controls = inputManager.poll(deltaSeconds);
    let terrainBlocked = false;
    const displayState = physicsLoop.update(deltaSeconds, () => {
      const contact = terrainContact.update(blockOnMissingSurface);
      if (contact === false) {
        terrainBlocked = true;
        return false;
      }
      if (visibleMeshCollision.update()) return "reset";
      inputManager.apply(jsbsim.sdk, controls);
      return contact;
    });

    const tickNowMs = performance.now();
    if (terrainBlocked) {
      if (terrainBlockedSinceMs === null) {
        terrainBlockedSinceMs = tickNowMs;
        flightLog.warn("terrain", "Holding: no terrain height under the aircraft", {
          latDeg: Number(displayState.latDeg.toFixed(5)),
          lonDeg: Number(displayState.lonDeg.toFixed(5)),
          mapMode: runtime.status.mode,
        });
      }
    } else if (terrainBlockedSinceMs !== null) {
      flightLog.info("terrain", "Terrain height available again; physics resuming", {
        heldSeconds: Number(((tickNowMs - terrainBlockedSinceMs) / 1000).toFixed(2)),
      });
      terrainBlockedSinceMs = null;
    }

    const fault = physicsLoop.getFault();
    updateStatusOverlay(fault, tickNowMs);
    if (fault) {
      runtime.status.lastError = fault;
      runtime.status.message = fault;
      if (!inputManager.isPaused()) {
        // The fault detail was logged where it was raised; this records that
        // the fault is what took the simulator out of the user's hands.
        flightLog.warn("sim", "Pausing: physics reported a fault", { fault });
        setSimulationPaused(true);
      }
    }

    const surfaceHeight = runtime.surface.sample(displayState.latDeg, displayState.lonDeg)?.heightMeters ?? 0;

    runtime.setSimViewState({
      latDeg: displayState.latDeg,
      lonDeg: displayState.lonDeg,
      zoomMeters: zoomMetersFromAltitude(displayState.altMeters - surfaceHeight),
      headingDeg: (displayState.headingRad * 180) / Math.PI,
    });

    floatingOrigin?.apply(displayState);
    const rig = aircraftModel?.getRig();
    if (rig) applyAircraftRig(rig, readControlSurfaceState(jsbsim.sdk), deltaSeconds);
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
      statusOverlay?.destroy();
      controlPanel?.destroy();
      flightHud.destroy();
      aircraftModel?.dispose();
      aircraft?.dispose();
      floatingOrigin?.dispose();
      jsbsim.dispose();
      runtime.destroy();
      rootElement.innerHTML = "";
    },
  };
}
