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
  type RendererMode,
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
  createFlightPerformanceCapture,
  isFlightPerformanceCaptureEnabled,
  setActiveFlightPerformanceCapture,
} from "./diagnostics/flightPerformanceCapture";
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
import { applyFlightControls } from "./input/applyFlightControls";
import type { PhoneControlSession } from "./remote/createPhoneControlSession";
import type { PhonePairingDialog } from "./hud/createPhonePairingDialog";
import { createFlightInputManager } from "./input/flightInputManager";
import { createJsbsimRuntime } from "./jsbsim/createJsbsimRuntime";
import { createFixedStepPhysicsLoop } from "./physics/fixedStepLoop";
import { createFlightLoadingScreen, type FlightLoadingScreen } from "../loading/createFlightLoadingScreen";
import { DEFAULT_FLIGHT_START, START_ALTITUDE_AGL_METERS } from "./jsbsim/bootstrapC172";

export interface FlightSimAppOptions {
  loadingScreen?: FlightLoadingScreen;
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

const AIRCRAFT_PREFERENCE_KEY = "osfs.aircraft";
const AIRCRAFT_LOD_PREFERENCE_KEY = "osfs.aircraft-lod";
// Opt-in levels are a per-user decision, so the choice persists like the rest.
// It has no legacy key: nothing before this stored it.
const AIRCRAFT_OPT_IN_PREFERENCE_KEY = "osfs.aircraft-opt-in-lods";
const LEGACY_AIRCRAFT_PREFERENCE_KEY = "flight-sim.aircraft";
const LEGACY_AIRCRAFT_LOD_PREFERENCE_KEY = "flight-sim.aircraft-lod";
const WORLD_DETAIL_PREFERENCE_KEY = "osfs.world-detail-target";
const FLIGHT_TERRAIN_REQUIREMENT_PREFERENCE_KEY = "osfs.flight-terrain-requirement";
const MIN_WORLD_DETAIL_TARGET = 1;
const MAX_WORLD_DETAIL_TARGET = 524_288;
const DEFAULT_FLIGHT_TERRAIN_REQUIREMENT = 4_096;

function readPreference<T>(key: string, legacyKey: string, isValid: (value: unknown) => value is T, fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key) ?? window.localStorage.getItem(legacyKey);
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

function isWorldDetailTarget(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_WORLD_DETAIL_TARGET && value <= MAX_WORLD_DETAIL_TARGET;
}

function readWorldDetailTargetPreference(): number | null {
  const stored = readPreference(
    WORLD_DETAIL_PREFERENCE_KEY, WORLD_DETAIL_PREFERENCE_KEY,
    (value): value is string => typeof value === "string", "auto",
  );
  if (stored === "auto") return null;
  const value = Number(stored);
  return isWorldDetailTarget(value) ? value : null;
}

function readFlightTerrainRequirementPreference(): number {
  const stored = readPreference(
    FLIGHT_TERRAIN_REQUIREMENT_PREFERENCE_KEY, FLIGHT_TERRAIN_REQUIREMENT_PREFERENCE_KEY,
    (value): value is string => typeof value === "string", String(DEFAULT_FLIGHT_TERRAIN_REQUIREMENT),
  );
  const value = Number(stored);
  return isWorldDetailTarget(value) ? value : DEFAULT_FLIGHT_TERRAIN_REQUIREMENT;
}

/**
 * Choose a conservative first-run target without a GPU performance benchmark.
 * CPU and memory hints alone cannot prove that 1 px tile refinement is
 * sustainable, so 2^0 = 1 px remains an explicit pilot choice in Settings.
 */
function chooseAutomaticWorldDetailTarget(rendererMode: RendererMode): number {
  const cores = Math.max(1, navigator.hardwareConcurrency ?? 4);
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const hasRoom = deviceMemory === undefined || deviceMemory >= 8;
  if (rendererMode === "webgpu" && cores >= 12 && hasRoom) return 16;
  if (cores >= 8 && hasRoom) return 32;
  if (cores >= 4) return 64;
  return 128;
}

function zoomMetersFromAltitude(altMeters: number): number {
  return Math.max(250, Math.min(altMeters * 1.5, 12_000));
}

export async function createFlightSimApp(
  rootElement: HTMLElement,
  options: FlightSimAppOptions = {},
): Promise<FlightSimAppHandle> {
  const loading = options.loadingScreen ?? createFlightLoadingScreen();
  loading.show();
  loading.setPhase("app", { state: "ready" });
  loading.setPhase("world", { state: "loading", detail: "Preparing the map renderer" });
  loading.setPhase("flight", { state: "loading", detail: "Loading flight physics" });
  const mapConfig = resolveMapRuntimeConfig({
    googleApiKey: options.googleApiKey,
    baseMap: options.baseMap,
    preferGoogleTiles: options.preferGoogleTiles,
  });
  // `null` means follow the local automatic recommendation. A manual target
  // remains in local storage and is reapplied before terrain preparation
  // starts, including when Google Tiles are selected after launch.
  let worldDetailTarget = readWorldDetailTargetPreference();
  let automaticWorldDetailTarget = 16;
  let flightTerrainRequirement = readFlightTerrainRequirementPreference();

  async function prepareFlightTerrain(
    runtime: BabylonRuntime,
    request: Parameters<BabylonRuntime["prepareTerrain"]>[0],
    allowCoarserTerrain = false,
  ) {
    let terrain = await runtime.prepareTerrain(request);
    const distanceToTerrain = terrain.altitudeMeters - terrain.groundHeightMeters;
    const detail = runtime.getGoogleTerrainDetailState();
    const needsFlightDetail = runtime.status.mode === "google-tiles"
      && !allowCoarserTerrain
      && distanceToTerrain < 100
      && detail !== null
      && detail.errorTarget > flightTerrainRequirement;
    if (!needsFlightDetail) return terrain;

    // A low spawn needs the pilot's selected flight minimum. Refine once
    // during preparation, then hand the established ground height to JSBSim;
    // no equivalent readiness gate runs while the aircraft is flying.
    worldDetailTarget = flightTerrainRequirement;
    writePreference(WORLD_DETAIL_PREFERENCE_KEY, String(worldDetailTarget));
    runtime.setGoogleTerrainDetailTarget(worldDetailTarget);
    terrain = await runtime.prepareTerrain(request);
    return terrain;
  }

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

  let bootstrapFailed = false;
  const bootResources: { runtime?: BabylonRuntime; jsbsim?: Awaited<ReturnType<typeof createJsbsimRuntime>> } = {};
  const startupAbort = new AbortController();
  const runtimePromise = createBabylonRuntime(canvas, {
    googleApiKey: mapConfig.googleApiKey,
    preferGoogleTiles: mapConfig.preferGoogleTiles,
    rasterBaseMap: mapConfig.rasterBaseMap,
    terrainSource: mapConfig.terrainSource,
    rasterQuality: mapConfig.rasterQuality,
    rendererForce: getRendererForceFromUrl(),
    simMode: true,
  }).then(runtime => {
    if (bootstrapFailed) { runtime.destroy(); throw new Error("Startup cancelled."); }
    bootResources.runtime = runtime;
    automaticWorldDetailTarget = chooseAutomaticWorldDetailTarget(runtime.renderer.mode);
    runtime.setGoogleTerrainDetailTarget(worldDetailTarget ?? automaticWorldDetailTarget);
    runtime.setSimRunning(false);
    runtime.setSimViewState({ ...DEFAULT_FLIGHT_START, zoomMeters: START_ALTITUDE_AGL_METERS * 1.5 });
    loading.setPhase("world", { state: "ready" });
    return runtime;
  });
  // Start local terrain selection as soon as the renderer exists. WASM and its
  // aircraft data are loading independently; no simulator work blocks this.
  const terrainReady = runtimePromise.then(runtime => prepareFlightTerrain(runtime, {
    ...DEFAULT_FLIGHT_START,
    altitudeAboveGroundMeters: START_ALTITUDE_AGL_METERS,
    radiusMeters: 1000,
    clearanceMeters: 1000,
    signal: startupAbort.signal,
    onProgress: progress => loading.setPhase("terrain", {
      state: progress.phase === "ready" ? "ready" : "loading",
      detail: progress.message, progress: progress.progress,
    }),
  }));
  // The full readiness join happens after the visual assets have started too.
  void terrainReady.catch(() => {});
  const jsbsimPromise = createJsbsimRuntime({
    dataBaseUrl: options.dataBaseUrl,
    onProgress: progress => loading.setPhase("flight", {
      state: "loading", detail: progress.message, progress: progress.progress,
    }),
    onLog: (stream, message) => {
      if (stream === "stderr") {
        console.warn("[jsbsim]", message);
      }
    },
  }).then(jsbsim => {
    if (bootstrapFailed) { jsbsim.dispose(); throw new Error("Startup cancelled."); }
    bootResources.jsbsim = jsbsim;
    loading.setPhase("flight", { state: "ready" });
    return jsbsim;
  });
  let runtime: BabylonRuntime;
  let jsbsim: Awaited<ReturnType<typeof createJsbsimRuntime>>;
  try {
    [runtime, jsbsim] = await Promise.all([runtimePromise, jsbsimPromise]);
  } catch (error) {
    bootstrapFailed = true;
    startupAbort.abort();
    bootResources.runtime?.destroy();
    bootResources.jsbsim?.dispose();
    loading.fail("Flight could not load. Check your connection and try again.");
    throw error;
  }
  if (runtime.geospatialCamera) {
    runtime.geospatialCamera.detachControl();
    runtime.geospatialCamera.setEnabled(false);
  }
  let worldLoading = true;
  let placementAbort = startupAbort;

  let phoneSession: PhoneControlSession | null = null;
  let phoneDialog: PhonePairingDialog | null = null;
  let phoneLoading: Promise<void> | null = null;
  let detachPhoneStatus: (() => void) | null = null;
  const inputManager = createFlightInputManager({
    onPausedChange: (paused) => syncSimulationPaused(paused),
    onLocalInput: () => phoneSession?.takeControl(),
  });
  let appliedControls = inputManager.getControls();
  const detachInput = inputManager.attach(window);
  const physicsLoop = createFixedStepPhysicsLoop(jsbsim.sdk);
  const terrainContact = createTerrainContact(jsbsim.sdk, runtime.surface);
  const visibleMeshCollision = createVisibleMeshCollision(jsbsim.sdk, runtime.surface);
  // This stays completely out of the normal render loop unless someone opts
  // in through the URL. It makes a stutter reproducible with numbers instead
  // of trying to infer its source from a single FPS reading.
  const flightPerformance = isFlightPerformanceCaptureEnabled()
    ? createFlightPerformanceCapture() : null;
  if (flightPerformance) setActiveFlightPerformanceCapture(flightPerformance);
  const flightHud: FlightHudHandle = createFlightHud(hudRoot, {
    onThrottleChange: (value) => { inputManager.setThrottle(value); runtime.requestRender(); },
    onPitchTrimChange: (value) => { inputManager.setPitchTrim(value); runtime.requestRender(); },
    onStickChange: (aileron, elevator) => { inputManager.setStick(aileron, elevator); runtime.requestRender(); },
  });

  let floatingOrigin: FloatingOriginHandle | null = null;
  let aircraft: ReturnType<typeof createPlaceholderAircraft> | null = null;
  let aircraftModel: AircraftModelHandle | null = null;
  let aircraftId: AircraftId = readPreference(AIRCRAFT_PREFERENCE_KEY, LEGACY_AIRCRAFT_PREFERENCE_KEY, isAircraftId, "cessna-172");
  let aircraftLodId: AircraftLodId = readPreference(AIRCRAFT_LOD_PREFERENCE_KEY, LEGACY_AIRCRAFT_LOD_PREFERENCE_KEY, isAircraftLodId, "auto");
  let optInLodsEnabled = readPreference(
    AIRCRAFT_OPT_IN_PREFERENCE_KEY, AIRCRAFT_OPT_IN_PREFERENCE_KEY,
    (value): value is "on" | "off" => value === "on" || value === "off", "off",
  ) === "on";
  let modelState: AircraftModelState = {
    aircraftId, lodId: aircraftLodId, activeLodId: null,
    optInEnabled: optInLodsEnabled,
    status: "placeholder", triangles: null, error: null,
  };
  let controlPanel: FlightControlPanelHandle | null = null;
  let hudBar: FlightHudBarHandle | null = null;
  let statusOverlay: FlightStatusOverlayHandle | null = null;
  // A missing terrain sample stops the loop from stepping without raising a
  // fault, so track how long that has been true to tell a stall from a hitch.
  let terrainBlockedSinceMs: number | null = null;
  let terrainBlockedReason: ReturnType<typeof terrainContact.getBlockReason> = null;
  // A pilot can temporarily waive their own flight requirement. This is never
  // persisted, so reopening the game returns to the selected safety policy.
  let allowCoarserTerrainThisSession = false;
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

  loading.setPhase("assets", { state: "loading", detail: "Loading your aircraft" });
  const onModelState = (state: AircraftModelState): void => {
    modelState = state;
    aircraft?.setModelLoaded(state.status === "ready");
    if (state.status === "ready") {
      loading.setPhase("assets", { state: "ready" });
    } else if (state.status === "placeholder") {
      // The placeholder is a complete, flyable aircraft. A visual mesh should
      // never keep a safely prepared flight from starting.
      loading.setPhase("assets", { state: "ready", detail: "Using the flight-ready fallback aircraft" });
    } else if (state.status === "error") {
      loading.setPhase("assets", { state: "ready", detail: "Aircraft mesh unavailable; using the flight-ready fallback" });
    }
  };
  const mountFlightWorld = (): void => {
    const worldRoot = runtime.getWorldRoot();
    if (!worldRoot || floatingOrigin) return;

    floatingOrigin = createFloatingOrigin(runtime.scene, worldRoot);
    floatingOrigin.aircraftRoot.setEnabled(false);
    aircraft = createPlaceholderAircraft(runtime.scene, floatingOrigin.aircraftRoot);
    aircraft.setViewMode("third");
    aircraftModel = createAircraftModel(runtime.scene, aircraft.modelRoot, {
      aircraftId,
      lodId: aircraftLodId,
      optInEnabled: optInLodsEnabled,
      getChaseDistanceMeters: () => aircraft?.getChaseDistanceMeters() ?? 0,
      onStateChange: (state) => {
        onModelState(state);
        if (controlPanel) controlPanel.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
        runtime.requestRender();
      },
    });

    onModelState(aircraftModel.getState());
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
    phoneSession?.syncStatus();
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
    googleTerrainDetail: runtime.getGoogleTerrainDetailState(),
    worldDetailIsAutomatic: worldDetailTarget === null,
    automaticWorldDetailTarget,
    flightTerrainRequirement,
    allowCoarserTerrainThisSession,
    aircraftId,
    lodId: aircraftLodId,
    optInLodsEnabled,
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
    phoneSession?.cancelHandoff();
    physicsLoop.setPaused(paused || worldLoading);
    runtime.setSimRunning(!paused && !worldLoading);
    skipResumeDelta = !paused;
    const state = physicsLoop.getLatestState() ?? initialState;
    controlPanel?.update(createPanelSnapshot(state));
    hudBar?.update(state, runtime.status, paused ? null : measuredFps, paused);
    phoneSession?.syncStatus();
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
    placementAbort.abort();
    const abort = placementAbort = new AbortController();
    worldLoading = true;
    physicsLoop.setPaused(true);
    runtime.setSimRunning(false);
    floatingOrigin?.aircraftRoot.setEnabled(false);
    phoneSession?.reset();
    inputManager.adoptControls(inputManager.getControls());
    loading.show({ title: "Preparing your destination", reset: true });
    for (const phase of ["app", "world", "flight", "assets"] as const) loading.setPhase(phase, { state: "ready" });
    const prior = physicsLoop.getLatestState() ?? initialState;
    const preview = { ...prior, ...location, altMeters: location.altMeters ?? prior.altMeters };
    floatingOrigin?.apply(preview);
    runtime.setSimViewState({ ...location, zoomMeters: zoomMetersFromAltitude(preview.altMeters) });
    void prepareFlightTerrain(runtime, {
      latDeg: location.latDeg, lonDeg: location.lonDeg,
      altitudeMeters: preview.altMeters,
      radiusMeters: 1000,
      clearanceMeters: location.flightPreset ? 0 : 1000,
      signal: abort.signal,
      onProgress: progress => {
        if (!abort.signal.aborted) loading.setPhase("terrain", {
          state: progress.phase === "ready" ? "ready" : "loading",
          detail: progress.message, progress: progress.progress,
        });
      },
    }, allowCoarserTerrainThisSession).then(terrain => {
      if (disposed || abort.signal.aborted) return;
      const destination = { ...location, altMeters: terrain.altitudeMeters };
      const state = resetFlightLocation(jsbsim.sdk, destination, terrain.groundHeightMeters);
      terrainContact.reset();
      visibleMeshCollision.reset();
      if (location.flightPreset) {
        inputManager.resetControls(location.flightPreset.mode === "departure" ? 0 : 0.35);
        if (location.flightPreset.mode === "departure") setSimulationPaused(true);
      }
      appliedControls = inputManager.getControls();
      physicsLoop.reset();
      applyWeather(weather);
      floatingOrigin?.apply(state);
      runtime.setSimViewState({
        latDeg: state.latDeg, lonDeg: state.lonDeg,
        zoomMeters: zoomMetersFromAltitude(state.altMeters - terrain.groundHeightMeters),
        headingDeg: state.headingRad * 180 / Math.PI,
      });
      worldLoading = false;
      floatingOrigin?.aircraftRoot.setEnabled(true);
      aircraft?.setViewMode(aircraft.getViewMode());
      physicsLoop.setPaused(inputManager.isPaused());
      runtime.setSimRunning(!inputManager.isPaused());
      skipResumeDelta = true;
      phoneSession?.syncStatus();
      flightHud.update(state, inputManager.getControls().pitchTrim);
      controlPanel?.update(createPanelSnapshot(state));
      hudBar?.update(state, runtime.status, measuredFps, inputManager.isPaused());
      loading.hide();
      runtime.requestRender();
    }).catch(() => {
      if (disposed || abort.signal.aborted) return;
      loading.fail("The destination terrain is not ready. Check your connection and map access, then retry.", () => teleportToLocation(location));
    });
  };

  const openPhoneController = (): void => {
    if (phoneDialog) { phoneDialog.open(); return; }
    if (phoneLoading) return;
    hudBar?.setPhoneStatus?.("Connecting phone…");
    phoneLoading = Promise.all([
      import("./remote/createPhoneControlSession"), import("./hud/createPhonePairingDialog"),
    ]).then(([{ createPhoneControlSession }, { createPhonePairingDialog }]) => {
      if (disposed) return;
      phoneSession = createPhoneControlSession({
        getStatus: () => {
          const state = physicsLoop.getLatestState() ?? initialState;
          return {
            owner: phoneSession?.getSnapshot().owner ?? "local",
            paused: inputManager.isPaused(), viewMode: aircraft?.getViewMode() ?? "third",
            controls: phoneSession?.getSnapshot().owner === "phone" ? { ...appliedControls } : inputManager.getControls(),
            airspeedKts: state.airspeedKts, altitudeFt: state.altMeters / 0.3048,
            headingDeg: (state.headingRad * 180 / Math.PI + 360) % 360,
          };
        },
        hasActiveLocalInput: () => inputManager.hasActiveFlightInput(),
        isPageVisible: () => !document.hidden,
        onOwnershipChange: (owner, controls) => {
          inputManager.adoptControls(controls);
          inputManager.setRemoteOwned(owner === "phone");
          appliedControls = { ...controls };
          runtime.requestRender();
        },
        setPaused: setSimulationPaused,
        setViewMode: mode => { aircraft?.setViewMode(mode); runtime.requestRender(); },
      });
      detachPhoneStatus = phoneSession.subscribe(() => {
        const state = phoneSession!.getSnapshot();
        hudBar?.setPhoneStatus?.(state.owner === "phone" ? "Phone controls" : state.phase === "paired" ? "Phone paired · Desktop controls" : "Phone controller");
      });
      phoneDialog = createPhonePairingDialog(rootElement, phoneSession);
      phoneDialog.open();
    }).catch(() => { if (!disposed) hudBar?.setPhoneStatus?.("Phone unavailable · Retry"); })
      .finally(() => { phoneLoading = null; });
  };
  const onVisibilityChange = () => { if (document.hidden) phoneSession?.onHidden(); };
  document.addEventListener("visibilitychange", onVisibilityChange);

  controlPanel = createFlightControlPanel(panelRoot, createPanelSnapshot(), {
    initialWeather: weather,
    onLocationApply: teleportToLocation,
    locationSearchProvider: options.locationSearchProvider,
    onWeatherChange: applyWeather,
    onPausedChange: setSimulationPaused,
    onViewModeChange: (mode) => { aircraft?.setViewMode(mode); phoneSession?.syncStatus(); runtime.requestRender(); },
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
    onOptInLodsChange: (enabled) => {
      optInLodsEnabled = enabled;
      writePreference(AIRCRAFT_OPT_IN_PREFERENCE_KEY, enabled ? "on" : "off");
      aircraftModel?.setOptInEnabled(enabled);
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
      runtime.requestRender();
    },
    onGoogleTerrainDetailChange: (errorTarget) => {
      worldDetailTarget = errorTarget;
      writePreference(WORLD_DETAIL_PREFERENCE_KEY, String(errorTarget));
      runtime.setGoogleTerrainDetailTarget(errorTarget);
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
      runtime.requestRender();
    },
    onAutomaticGoogleTerrainDetailChange: () => {
      worldDetailTarget = null;
      writePreference(WORLD_DETAIL_PREFERENCE_KEY, "auto");
      runtime.setGoogleTerrainDetailTarget(automaticWorldDetailTarget);
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
      runtime.requestRender();
    },
    onFlightTerrainRequirementChange: (errorTarget) => {
      flightTerrainRequirement = errorTarget;
      writePreference(FLIGHT_TERRAIN_REQUIREMENT_PREFERENCE_KEY, String(errorTarget));
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
      runtime.requestRender();
    },
    onTerrainDetailOverrideChange: (enabled) => {
      allowCoarserTerrainThisSession = enabled;
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
      teleportToLocation(physicsLoop.getLatestState() ?? initialState);
    },
    onTerrainSourceChange: (sourceId) => {
      runtime.setTerrainSource(resolveTerrainSource(sourceId));
      setTerrainSourcePreference(sourceId);
      teleportToLocation(physicsLoop.getLatestState() ?? initialState);
    },
    onQualityChange: (setting) => {
      runtime.setRasterQuality(setting);
      setRasterQualityPreference(setting);
    },
    onPhoneControlClick: openPhoneController,
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
        state = terrainBlockedReason === "coarse"
          ? {
              kind: "waiting", message: "World detail is too coarse for flight", heldSeconds,
              detail: `Flight requires World detail 2^${Math.log2(flightTerrainRequirement).toFixed(2)} or finer. Choose a smaller World detail target, or allow coarser terrain for this session.`,
            }
          : {
              kind: "waiting", message: "Waiting for terrain height data", heldSeconds,
              detail: "No reliable terrain height is available under the aircraft yet, so the simulation is holding rather than guessing one.",
            };
      }
    }
    statusOverlay?.update(state);
  };

  hudBar.update(initialState, runtime.status, measuredFps, inputManager.isPaused());

  const ensureWorld = (): void => {
    mountFlightWorld();
  };

  runtime.setSimTick((deltaSeconds) => {
    if (disposed || worldLoading) return;
    const frameIntervalMs = deltaSeconds * 1000;
    const flightTickStartedMs = flightPerformance ? performance.now() : 0;
    let terrainQueryCpuMs = 0;
    let collisionCpuMs = 0;
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

    // Spawn preparation is the only terrain-readiness gate. Once it has
    // placed the aircraft on known ground, streaming may update contact but
    // can never pause an already-running flight.
    const googleTiles = runtime.status.mode === "google-tiles";
    const preContactStartedMs = flightPerformance ? performance.now() : 0;
    if (!physicsLoop.getFault()
      && terrainContact.update(false, googleTiles, true, true) === "reset") {
      physicsLoop.reset();
    }
    if (flightPerformance) terrainQueryCpuMs += performance.now() - preContactStartedMs;

    physicsLoop.setPaused(inputManager.isPaused());
    const controls = inputManager.poll(deltaSeconds);
    let terrainBlocked = false;
    const physicsStartedMs = flightPerformance ? performance.now() : 0;
    const displayState = physicsLoop.update(deltaSeconds, () => {
      const contactStartedMs = flightPerformance ? performance.now() : 0;
      const contact = terrainContact.update(false, googleTiles, true, true);
      if (flightPerformance) terrainQueryCpuMs += performance.now() - contactStartedMs;
      if (contact === false) {
        terrainBlocked = true;
        terrainBlockedReason = terrainContact.getBlockReason();
        return false;
      }
      const collisionStartedMs = flightPerformance ? performance.now() : 0;
      const collisionReset = visibleMeshCollision.update();
      if (flightPerformance) collisionCpuMs += performance.now() - collisionStartedMs;
      // Terrain/collision work can consume the remaining input lease. Check
      // authority immediately before allowing this step to advance physics.
      const selected = phoneSession?.beforeStep(controls) ?? controls;
      if (selected === false || inputManager.isPaused()) return false;
      if (collisionReset) return "reset";
      applyFlightControls(jsbsim.sdk, selected);
      appliedControls = { ...selected };
      return contact;
    });
    const physicsLoopCpuMs = flightPerformance ? performance.now() - physicsStartedMs : 0;

    const tickNowMs = performance.now();
    if (terrainBlocked) {
      if (terrainBlockedSinceMs === null) {
        terrainBlockedSinceMs = tickNowMs;
        flightLog.warn("terrain", terrainBlockedReason === "coarse"
          ? "Holding: World detail is below the flight requirement"
          : "Holding: no terrain height under the aircraft", {
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
      terrainBlockedReason = null;
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
    flightHud.update(displayState, phoneSession?.getSnapshot().owner === "phone" ? appliedControls.pitchTrim : controls.pitchTrim);
    const now = performance.now();
    if (now - lastPanelUpdateMs >= 100) {
      lastPanelUpdateMs = now;
      controlPanel?.update(createPanelSnapshot(displayState));
      hudBar?.update(displayState, runtime.status, inputManager.isPaused() ? null : measuredFps, inputManager.isPaused());
    }
    if (flightPerformance) {
      const tileMetrics = runtime.getTileMetrics();
      flightPerformance.record({
        frameIntervalMs,
        flightTickCpuMs: performance.now() - flightTickStartedMs,
        terrainQueryCpuMs,
        collisionCpuMs,
        physicsLoopCpuMs,
        streamingTiles: runtime.isStreamingTiles(),
        mapDownloadBytesPerSecond: runtime.getMapDownloadBytesPerSecond(),
        visibleTiles: tileMetrics?.visibleTiles ?? null,
        activeTiles: tileMetrics?.activeTiles ?? null,
      });
    }
  });

  const revealAircraft = (state: ReturnType<typeof readFlightState>): void => {
    floatingOrigin?.apply(state);
    floatingOrigin?.aircraftRoot.setEnabled(true);
    aircraft?.setViewMode(aircraft.getViewMode());
  };
  let preserveLoadingScreen = false;
  const app: FlightSimAppHandle = {
    runtime,
    destroy(): void {
      if (disposed) return;
      disposed = true;
      placementAbort.abort();
      if (!preserveLoadingScreen) loading.destroy();
      detachPhoneStatus?.();
      phoneDialog?.destroy();
      phoneSession?.destroy();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      runtime.setSimTick(null);
      window.removeEventListener("keydown", onViewKeyDown);
      detachCameraInput();
      detachInput();
      if (flightPerformance) setActiveFlightPerformanceCapture(null);
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
  try {
    const terrain = await terrainReady;
    const state = resetFlightLocation(jsbsim.sdk, {
      ...DEFAULT_FLIGHT_START, altMeters: terrain.altitudeMeters,
    }, terrain.groundHeightMeters);
    terrainContact.reset();
    visibleMeshCollision.reset();
    physicsLoop.reset();
    revealAircraft(state);
    runtime.setSimViewState({ ...DEFAULT_FLIGHT_START, zoomMeters: START_ALTITUDE_AGL_METERS * 1.5 });
    worldLoading = false;
    physicsLoop.setPaused(inputManager.isPaused());
    runtime.setSimRunning(!inputManager.isPaused());
    loading.hide();
    runtime.requestRender();
    return app;
  } catch (error) {
    preserveLoadingScreen = true;
    app.destroy();
    loading.fail("Flight could not start safely. Check your connection and map access, then retry.");
    throw error;
  }
}
