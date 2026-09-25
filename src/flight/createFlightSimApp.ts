import "foss-earth/shell.css";
import type { WebGPUEngine } from "@babylonjs/core";
import { canTimeGpuFrames, createFrameProfiler, profileBabylonScene } from "foss-earth/perf";
import { setActiveFrameProfile } from "./diagnostics/frameProfile";
import { attitudeRendererSetting } from "./settings/attitudeRendererSetting";
import "foss-earth/windowing.css";
import type { LocationSearchProvider, GeodeticLocation } from "foss-earth/windowing";
import { resetFlightLocation } from "./jsbsim/resetFlightLocation";
import { createTerrainContact } from "./physics/terrainContact";
import { createFrameSurfaceQuery } from "./physics/frameSurfaceQuery";
import { createVisibleMeshCollision } from "./physics/visibleMeshCollision";
import { loadInputModePreference, loadInputSensitivityPreference } from "foss-earth/input";
import "../styles/flight.css";
import "@felipegalind0/gamepad-tools/styles.css";
import { createBrowserInputSource } from "@felipegalind0/gamepad-tools/browser";
import {
  BindingRuntime,
  createProfileStore,
} from "@felipegalind0/gamepad-tools/core";
import { mountBindingEditor } from "@felipegalind0/gamepad-tools/ui";

import {
  createBabylonRuntime,
  RASTER_BASE_MAP_SOURCES,
  TERRAIN_SOURCES,
  resolveTerrainSource,
  resolveRasterBaseMapSource,
  resolveMapRuntimeConfig,
  setMapSourcePreference,
  setTerrainSourcePreference,
  type BabylonRuntime,
  type GoogleTerrainDetailAnchor,
  type RasterBaseMapSource,
} from "foss-earth/runtime";
import { readDeviceHints } from "foss-earth/mapDetailPolicy";
import { createPlaceholderAircraft } from "./aircraft/createPlaceholderAircraft";
import {
  isAircraftId,
  isAircraftLodId,
  getAircraftFamilyForAircraft,
  normalizeAircraftSelection,
  type AircraftId,
  type AircraftLodId,
  type AircraftSelection,
} from "./aircraft/aircraftCatalog";
import { applyAircraftRig, readControlSurfaceState } from "./aircraft/aircraftAnimation";
import { flightLog } from "./diagnostics/flightLog";
import { createFlightRecorder } from "./diagnostics/flightRecorder";
import { createEvaluationInstruments } from "./hud/evaluationInstruments";
import {
  bindRecorderMarkHotkey,
  downloadCsv,
  type LoggingAction,
  type LoggingPanelState,
} from "./hud/LoggingPanel";
import { createEngineMonitor } from "./hud/engineMonitor";
import { toEngineStatus } from "./remote/engineStatus";
import { createCollisionDebugOverlay } from "./diagnostics/createCollisionDebugOverlay";
import { createWheelSpinDebugOverlay } from "./diagnostics/createWheelSpinDebugOverlay";
import { createWheelSpinExperiment } from "./physics/createWheelSpinExperiment";
import type { WheelSpinMode } from "./physics/wheelSpin";
import { createTireAudio } from "./audio/createTireAudio";
import { createFlightAudio } from "./audio/createFlightAudio";
import { createAudioSettingsStore } from "./audio/audioSettings";
import { createJsbsimAudioAdapter } from "./audio/jsbsimAudioAdapter";
import { WHEEL_SPIN_CONFIGS } from "./physics/wheelSpin";
import { probeWheelContactCapability } from "./physics/wheelContact";
import { createSlipAudioSink, createWheelCueBus, type WheelCueResetReason } from "./feedback/wheelCueBus";
import { createGamepadHapticOutput, createHapticsController, type HapticOutput } from "./feedback/haptics";
import {
  applyGroundPreset,
  createGroundSettingsStore,
  GROUND_CHOICE_LABELS,
  GROUND_BOUNDARY_KEYS,
  patchGroundSettings,
  resolveGroundInteraction,
  type GroundBoundaryKey,
  type GroundCapabilities,
  type GroundInteractionSettingsV1,
} from "./settings/groundInteractionSettings";
import type { GroundInteractionAction, GroundInteractionPanelState } from "./hud/GroundInteractionSettingsPanel";
import {
  createFlightPerformanceCapture,
  isFlightPerformanceCaptureEnabled,
  setActiveFlightPerformanceCapture,
} from "./diagnostics/flightPerformanceCapture";
import {
  createPhoneCameraTrace,
  isPhoneCameraTraceEnabled,
  setActivePhoneCameraTrace,
} from "./diagnostics/phoneCameraTrace";
import {
  createAircraftModel,
  type AircraftModelHandle,
  type AircraftModelState,
} from "./aircraft/createAircraftModel";
import { flightAttitudeToQuaternion, readFlightState } from "./bridge/ecefBridge";
import type { FlightState } from "./physics/flightState";
import { createFloatingOrigin, type FloatingOriginHandle } from "./bridge/floatingOrigin";
import {
  type FlightControlPanelHandle,
  type FlightControlPanelSnapshot,
  type FlightTerrainDetailAnchor,
  type FlightWeatherState,
} from "./hud/FlightControlPanel";
import { createFlightControlPanel } from "./hud/createFlightControlPanel";
import { createFlightHud, type FlightHudHandle, type FlightHudMasterAp } from "./hud/flightHud";
import { createFlightHudBar, type FlightHudBarHandle } from "./hud/createFlightHudBar";
import { createFlightStatusOverlay, type FlightStatusOverlayHandle } from "./hud/createFlightStatusOverlay";
import type { FlightStatusOverlayState } from "./hud/FlightStatusOverlay";
import { attachFlightCameraInput } from "./input/flightCameraInput";
import { applyFlightControls } from "./input/applyFlightControls";
import { createAutoTrimState, setAutoTrimEnabled, stepPitchAutoTrim, stepRollAutoTrim } from "./input/autoTrim";
import {
  createAutopilotSettingsStore,
  type AutopilotSettingsV1,
} from "./autopilot/autopilotSettings";
import { DISCONNECTED_ARDUPILOT_STATUS } from "./autopilot/ardupilotStatus";
import {
  autopilotEngageBlockReason,
  createControlArbiterState,
  idleAutopilotOwners,
  resetArbiterHold,
  setArbiterEngaged,
  stepControlArbiter,
  type ControlArbiterResult,
} from "./autopilot/controlArbiter";
import type { PhoneControlSession } from "./remote/createPhoneControlSession";
import type { CameraAim } from "../remote/protocol";
import {
  describePhoneCameraTuning,
  loadPhoneCameraTuning,
  savePhoneCameraTuning,
  type PhoneCameraTuning,
} from "./remote/phoneCameraTuning";
import type { MountPhonePairing } from "./hud/RemoteControlTab";
import { createFlightInputManager } from "./input/flightInputManager";
import {
  createFlightGamepadAdapter,
  createLegacyFlightProfile,
  createStandardFlightProfile,
} from "./input/gamepadToolsAdapter";
import {
  loadKeyboardStickSettings,
  saveKeyboardStickSettings,
} from "./input/keyboardStickSettings";
import { createGamepadPollingController } from "./input/gamepadPolling";
import { loadOrbitInvertSettings, saveOrbitInvertSettings } from "foss-earth/input";
import { createJsbsimRuntime } from "./jsbsim/createJsbsimRuntime";
import { getFdmProfile } from "./jsbsim/fdmProfiles";
import { createFixedStepPhysicsLoop, FIXED_DT } from "./physics/fixedStepLoop";
import { createFlightLoadingScreen, type FlightLoadingScreen } from "../loading/createFlightLoadingScreen";
import {
  connectMapDetailRuntime,
  createGameLog,
  createMapDetailController,
  createMapSourcePanel,
  createRendererPanel,
  type GameLog,
  type MapDetailController,
} from "foss-earth/shell";
import {
  createFlightDetailRequirements,
  FLIGHT_TERRAIN_REQUIREMENT_KEY,
  importLegacyWorldDetail,
  isErrorTarget,
  LOW_SPAWN_METERS,
  readFlightTerrainRequirement,
} from "./worldDetail";
import { appHref } from "../appRoute";
import { DEFAULT_FLIGHT_START, START_ALTITUDE_AGL_METERS } from "./jsbsim/bootstrapC172";

export interface FlightSimAppOptions {
  loadingScreen?: FlightLoadingScreen;
  /** Shared with the page's first-paint log; created here when absent. */
  log?: GameLog;
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
const AIRCRAFT_GENERATION_PREFERENCE_KEY = "osfs.aircraft-generation";
// Opt-in levels are a per-user decision, so the choice persists like the rest.
// It has no legacy key: nothing before this stored it.
const AIRCRAFT_OPT_IN_PREFERENCE_KEY = "osfs.aircraft-opt-in-lods";
const LEGACY_AIRCRAFT_PREFERENCE_KEY = "flight-sim.aircraft";
const LEGACY_AIRCRAFT_LOD_PREFERENCE_KEY = "flight-sim.aircraft-lod";
const TERRAIN_DETAIL_ANCHOR_PREFERENCE_KEY = "osfs.terrain-detail-anchor";
const ARCADE_GROUND_LAUNCHES_PREFERENCE_KEY = "osfs.arcade-ground-launches";
const AUTO_TRIM_PREFERENCE_KEY = "osfs.auto-trim";
const AUTO_ROLL_TRIM_PREFERENCE_KEY = "osfs.auto-roll-trim";
const CAMERA_ORBIT_PITCH_MIN = -Math.PI / 3;
const CAMERA_ORBIT_PITCH_MAX = Math.PI * 0.45;
const CAMERA_ORBIT_RESTORE_PITCH = Math.atan2(2.2, 14);
const CAMERA_ORBIT_RESTORE_YAW = 0;
const CAMERA_ORBIT_RETURN_SECONDS = 0.45;
/**
 * The phone sends a swipe in CSS pixels scaled by 1/1000, so this works out at
 * 0.005 rad per pixel — the same rate a mouse drag on the desktop canvas uses,
 * which is why a swipe there and a swipe on the phone feel like one gesture.
 */
const PHONE_SWIPE_RADIANS = 5;

function readPreference<T>(key: string, legacyKey: string, isValid: (value: unknown) => value is T, fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key) ?? window.localStorage.getItem(legacyKey);
    return isValid(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

function preferenceStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Preference persistence is best-effort; private mode must not break the sim.
  }
}

function normalizeAngle(angle: number): number {
  const fullTurn = 2 * Math.PI;
  const normalized = angle % fullTurn;
  if (normalized > Math.PI) return normalized - fullTurn;
  if (normalized < -Math.PI) return normalized + fullTurn;
  return normalized;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function approach(current: number, target: number, deltaSeconds: number, halfLife: number): number {
  return current + (target - current) * (1 - Math.exp(-deltaSeconds / halfLife));
}

/** Commit the complete aircraft choice before a reload can activate it. */
function writeAircraftSelectionPreference(selection: AircraftSelection): string | null {
  const preferences: (null | [string, string])[] = [
    [AIRCRAFT_LOD_PREFERENCE_KEY, selection.lodId],
    [AIRCRAFT_OPT_IN_PREFERENCE_KEY, selection.optInLodsEnabled ? "on" : "off"],
    selection.generationId !== undefined ? [AIRCRAFT_GENERATION_PREFERENCE_KEY, selection.generationId] : null,
    // Identity is last: the next boot must never read a new package with
    // presentation preferences that failed to save.
    [AIRCRAFT_PREFERENCE_KEY, selection.aircraftId],
  ];
  const savedPreferences = preferences.filter((preference): preference is [string, string] => preference !== null);
  let storage: Storage;
  let previous: [string, string | null][];
  try {
    storage = window.localStorage;
    previous = savedPreferences.map(([key]) => [key, storage.getItem(key)]);
  } catch {
    return "Could not access browser storage. Allow storage and apply your aircraft choice again.";
  }

  let writtenCount = 0;
  try {
    for (const [key, value] of savedPreferences) {
      storage.setItem(key, value);
      writtenCount += 1;
    }
    return null;
  } catch {
    let restored = true;
    for (let index = writtenCount - 1; index >= 0; index -= 1) {
      const [key, value] = previous[index];
      try {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      } catch {
        restored = false;
      }
    }
    return restored
      ? "Could not save your aircraft choice. The active aircraft is unchanged. Check browser storage and try Apply again."
      : "Could not save your aircraft choice or restore every saved setting. The active aircraft is unchanged. Allow browser storage, then apply again.";
  }
}

function readTerrainDetailAnchorPreference(): FlightTerrainDetailAnchor {
  return readPreference(
    TERRAIN_DETAIL_ANCHOR_PREFERENCE_KEY, TERRAIN_DETAIL_ANCHOR_PREFERENCE_KEY,
    (value): value is FlightTerrainDetailAnchor => value === "aircraft" || value === "camera",
    "aircraft",
  );
}

function runtimeTerrainDetailAnchor(anchor: FlightTerrainDetailAnchor): GoogleTerrainDetailAnchor {
  return anchor === "aircraft" ? "simulation-origin" : "camera";
}

function zoomMetersFromAltitude(altMeters: number): number {
  return Math.max(250, Math.min(altMeters * 1.5, 12_000));
}

export async function createFlightSimApp(
  rootElement: HTMLElement,
  options: FlightSimAppOptions = {},
): Promise<FlightSimAppHandle> {
  const log = options.log ?? createGameLog();
  const loading = options.loadingScreen ?? createFlightLoadingScreen(log);
  loading.show();
  loading.setPhase("app", { state: "ready" });
  loading.setPhase("world", { state: "loading", detail: "Preparing the map renderer" });
  loading.setPhase("flight", { state: "loading", detail: "Loading flight physics" });
  const mapConfig = resolveMapRuntimeConfig({
    googleApiKey: options.googleApiKey,
    baseMap: options.baseMap,
    preferGoogleTiles: options.preferGoogleTiles,
  });
  const initialAircraftSelection = normalizeAircraftSelection({
    aircraftId: readPreference(
      AIRCRAFT_PREFERENCE_KEY, LEGACY_AIRCRAFT_PREFERENCE_KEY,
      isAircraftId, "cessna-172",
    ),
    generationId: readPreference(
      AIRCRAFT_GENERATION_PREFERENCE_KEY, AIRCRAFT_GENERATION_PREFERENCE_KEY,
      (value): value is string => typeof value === "string" && value.length > 0,
      "",
    ),
    lodId: readPreference(
      AIRCRAFT_LOD_PREFERENCE_KEY, LEGACY_AIRCRAFT_LOD_PREFERENCE_KEY,
      isAircraftLodId, "auto",
    ),
    optInLodsEnabled: readPreference(
      AIRCRAFT_OPT_IN_PREFERENCE_KEY, AIRCRAFT_OPT_IN_PREFERENCE_KEY,
      (value): value is "on" | "off" => value === "on" || value === "off", "off",
    ) === "on",
  });
  const initialAircraftId: AircraftId = initialAircraftSelection.aircraftId;
  // World detail's saved range, default and HUD rail belong to the shared
  // detail controller, created with the renderer. The flight keeps its
  // minimum for low spawns, the detail anchor and the session waiver.
  let flightTerrainRequirement = readFlightTerrainRequirement(preferenceStorage());
  let terrainDetailAnchor = readTerrainDetailAnchorPreference();
  // Assigned once the renderer exists; typed wide so failure paths may use it.
  let mapDetail = null as MapDetailController | null;
  let disconnectMapDetail: () => void = () => {};
  let detailRequirements: ReturnType<typeof createFlightDetailRequirements> | null = null;

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
      && distanceToTerrain < LOW_SPAWN_METERS
      && detail !== null
      && detail.errorTarget > flightTerrainRequirement;
    if (!needsFlightDetail || !detailRequirements) {
      detailRequirements?.supersede();
      return terrain;
    }

    // A low spawn needs the pilot's flight minimum. Hold Google mesh at least
    // that fine through preparation and the first moments of flight, without
    // touching the saved World detail; departure releases it.
    const lease = detailRequirements.begin(flightTerrainRequirement);
    try {
      terrain = await runtime.prepareTerrain(request);
    } catch (error) {
      lease.cancel();
      throw error;
    }
    if (request.signal?.aborted) {
      lease.cancel();
      return terrain;
    }
    lease.complete();
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
    rasterImagery: mapConfig.rasterImagery,
    rendererForce: getRendererForceFromUrl(),
    simMode: true,
  }).then(runtime => {
    if (bootstrapFailed) { runtime.destroy(); throw new Error("Startup cancelled."); }
    bootResources.runtime = runtime;
    // The controller is the one writer of the renderer's detail target. The
    // flight's old World detail is imported into it once.
    mapDetail = createMapDetailController({ googleRecommendation: "device-hints" });
    const imported = importLegacyWorldDetail(mapDetail, preferenceStorage(), {
      rendererMode: runtime.renderer.mode,
      deviceHints: readDeviceHints(),
    });
    if (imported === "retry") flightLog.warn("terrain", "World detail settings could not be saved; they apply until reload");
    detailRequirements = createFlightDetailRequirements(mapDetail);
    disconnectMapDetail = connectMapDetailRuntime(mapDetail, runtime);
    runtime.setGoogleTerrainDetailAnchor(runtimeTerrainDetailAnchor(terrainDetailAnchor));
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
      detail: progress.message, terrain: progress,
    }),
  }));
  // The full readiness join happens after the visual assets have started too.
  void terrainReady.catch(() => {});
  const jsbsimPromise = createJsbsimRuntime({
    dataBaseUrl: options.dataBaseUrl,
    aircraftId: initialAircraftId,
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
    flightLog.info("jsbsim", "Runtime build identified", { identity: jsbsim.identity });
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
    disconnectMapDetail();
    mapDetail?.dispose();
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
  let phonePairing: Promise<MountPhonePairing> | null = null;
  const inputManager = createFlightInputManager({
    initialThrottle: jsbsim.sdk.getPropertyValue("fcs/throttle-cmd-norm"),
    initialGearDown: jsbsim.sdk.getPropertyValue("gear/gear-cmd-norm") > 0.5,
    rudderSign: getFdmProfile(initialAircraftId).rudderSign,
    onPausedChange: (paused) => syncSimulationPaused(paused),
    // The HUD's gear button follows the G key. Repainting here rather than
    // waiting for the next frame is what keeps the two in step while the
    // simulation is paused and the render loop is idle.
    onGearChange: (down) => { flightHud.setGearDown(down); runtime.requestRender(); },
    onLocalInput: () => phoneSession?.takeControl(),
    keyboardStickSettings: loadKeyboardStickSettings(),
    getBodyRates: () => ({
      rollRateRad: jsbsim.sdk.getPropertyValue("velocities/p-rad_sec"),
      pitchRateRad: jsbsim.sdk.getPropertyValue("velocities/q-rad_sec"),
      yawRateRad: jsbsim.sdk.getPropertyValue("velocities/r-rad_sec"),
    }),
  });
  let appliedControls = inputManager.getControls();
  const detachInput = inputManager.attach(window);
  let arcadeGroundLaunches = readPreference(
    ARCADE_GROUND_LAUNCHES_PREFERENCE_KEY, ARCADE_GROUND_LAUNCHES_PREFERENCE_KEY,
    (value): value is "on" | "off" => value === "on" || value === "off", "off",
  ) === "on";
  let pitchAutoTrim = createAutoTrimState(readPreference(
    AUTO_TRIM_PREFERENCE_KEY, AUTO_TRIM_PREFERENCE_KEY,
    (value): value is "on" | "off" => value === "on" || value === "off", "on",
  ) === "on");
  let rollAutoTrim = createAutoTrimState(readPreference(
    AUTO_ROLL_TRIM_PREFERENCE_KEY, AUTO_ROLL_TRIM_PREFERENCE_KEY,
    (value): value is "on" | "off" => value === "on" || value === "off", "on",
  ) === "on");
  const ardupilotStatus = DISCONNECTED_ARDUPILOT_STATUS;
  const autopilotStore = createAutopilotSettingsStore((() => {
    try { return window.localStorage; } catch { return null; }
  })());
  let autopilotSettings: AutopilotSettingsV1 = autopilotStore.settings;
  let arbiterState = createControlArbiterState(
    inputManager.getGearDownNorm(),
    inputManager.getControls().flaps,
    inputManager.getControls().throttle,
  );
  let lastApResult: ControlArbiterResult = {
    engaged: false,
    blockedReason: autopilotEngageBlockReason(autopilotSettings, ardupilotStatus),
    owners: idleAutopilotOwners(),
    controls: inputManager.getControls(),
    gearDownNorm: inputManager.getGearDownNorm(),
  };
  const autopilotBlockReason = () => autopilotEngageBlockReason(autopilotSettings, ardupilotStatus);
  const hudMasterAp = (): FlightHudMasterAp => ({
    engaged: lastApResult.engaged,
    canEngage: autopilotBlockReason() === null,
    blockedReason: autopilotBlockReason(),
    ownsPitch: lastApResult.owners.pitch !== "pilot",
    ownsRoll: lastApResult.owners.roll !== "pilot",
    ownsGear: lastApResult.owners.gear !== "pilot",
    ownsFlaps: lastApResult.owners.flaps !== "pilot",
  });
  const aircraftOnGround = (): boolean => [0, 1, 2].some((index) => {
    const wow = jsbsim.sdk.getPropertyValue(`gear/unit[${index}]/WOW`);
    return Number.isFinite(wow) && wow > 0.5;
  });
  const readArbiterFlight = (dt: number) => ({
    dt,
    onGround: aircraftOnGround(),
    rollRad: jsbsim.sdk.getPropertyValue("attitude/phi-deg") * Math.PI / 180,
    rollRateRad: jsbsim.sdk.getPropertyValue("velocities/p-rad_sec"),
    pitchRad: jsbsim.sdk.getPropertyValue("attitude/theta-deg") * Math.PI / 180,
    pitchRateRad: jsbsim.sdk.getPropertyValue("velocities/q-rad_sec"),
    headingRad: jsbsim.sdk.getPropertyValue("attitude/psi-deg") * Math.PI / 180,
    yawRateRad: jsbsim.sdk.getPropertyValue("velocities/r-rad_sec"),
    airspeedKts: jsbsim.sdk.getPropertyValue("velocities/vc-kts"),
  });
  const syncArbiter = (pilot = inputManager.getControls()): ControlArbiterResult => {
    const stepped = stepControlArbiter(arbiterState, {
      settings: autopilotSettings,
      ardupilot: ardupilotStatus,
      pilot,
      gearDownNorm: inputManager.getGearDownNorm(),
      flight: readArbiterFlight(FIXED_DT),
    });
    arbiterState = stepped.state;
    lastApResult = stepped.result;
    return lastApResult;
  };
  const setAutopilotEngaged = (engaged: boolean): void => {
    if (engaged && autopilotBlockReason()) {
      runtime.requestRender();
      return;
    }
    arbiterState = setArbiterEngaged(arbiterState, engaged);
    syncArbiter();
    runtime.requestRender();
  };
  const applyAutopilotSettings = (next: AutopilotSettingsV1): void => {
    autopilotStore.set(next);
    autopilotSettings = autopilotStore.settings;
    if (autopilotBlockReason()) arbiterState = setArbiterEngaged(arbiterState, false);
    syncArbiter();
    runtime.requestRender();
  };
  // Ground interaction: persistent requests resolve to what can actually run.
  // The Debug A/B experiment is a session-only override layered on top.
  const groundStore = createGroundSettingsStore((() => {
    try { return window.localStorage; } catch { return null; }
  })());
  const contactCapability = probeWheelContactCapability(jsbsim.sdk);
  const groundCapabilities: GroundCapabilities = {
    // Even a detected bridge stays unavailable until the coupled solver is integrated with it.
    contactBridgeUnavailable: contactCapability.available
      ? "the coupled solver is not yet integrated with the native bridge" : contactCapability.reason,
    audioUnavailable: (globalThis as { AudioContext?: unknown; webkitAudioContext?: unknown }).AudioContext
      || (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext ? null : "Web Audio is unavailable in this browser",
  };
  const boundaryOf = (settings: GroundInteractionSettingsV1) => Object.fromEntries(
    GROUND_BOUNDARY_KEYS.map(key => [key, settings[key]])) as Pick<GroundInteractionSettingsV1, GroundBoundaryKey>;
  // A new flight is a safe boundary: saved wheel/force/contact choices start applied.
  let appliedGroundBoundary = boundaryOf(groundStore.settings);
  let groundResolution = resolveGroundInteraction(groundStore.settings, groundCapabilities, appliedGroundBoundary);
  let wheelExperiment: { rotation: WheelSpinMode | "off" | null; tireSound: boolean | null } = { rotation: null, tireSound: null };
  let groundMessage: GroundInteractionPanelState["message"] = null;
  let groundExportText: string | null = null;
  let wheelSpinMode: WheelSpinMode | "off" = "off";
  let tireSoundEnabled = false;
  let hapticsActive = false;
  let acceptedWheelSteps = 0;
  let groundRevision = 0;
  const wheelSpin = createWheelSpinExperiment(jsbsim.sdk);
  // One sound owner for the engine and the tire cue: one context, one worklet,
  // one limiter, one set of holds (sound.md §2). Nothing is allocated until a
  // gesture asks for sound.
  const audioSettingsStore = createAudioSettingsStore((() => {
    try { return window.localStorage; } catch { return null; }
  })());
  // Status can change before the panel exists (a restored tire cue arms its
  // unlock during startup), so refreshes wait until there is a panel to refresh.
  let audioPanelReady = false;
  const flightAudio = createFlightAudio({
    settings: audioSettingsStore,
    onStatusChange: () => {
      if (audioPanelReady) controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
    },
  });
  if (getAircraftFamilyForAircraft(initialAircraftId).id === "cirrus-vision-jet") {
    // Engine sound is SF50-only: the C172 is not a turbofan, and keeps its tire cue.
    try {
      flightAudio.attachAdapter(createJsbsimAudioAdapter(jsbsim.sdk, {
        gearHeightMetres: getFdmProfile(initialAircraftId).stance.staticMeters,
      }));
    } catch (error) {
      flightLog.warn("sim", "Engine sound telemetry is unavailable; the tire cue still plays", {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const tireAudio = createTireAudio({ audio: flightAudio });
  tireAudio.setPaused(true);
  // Engine sound is held for pause and world loading only. Blocked terrain and
  // contact faults hold the tire cue alone (through tireAudio); the engine
  // follows its telemetry, so a flickering contact cannot chop it.
  flightAudio.setHeld(true, "loading");
  // Accepted fixed steps only; presentation consumers can never feed back into forces.
  const wheelCues = createWheelCueBus(WHEEL_SPIN_CONFIGS.map(config => config.name), error => {
    flightLog.warn("sim", "A wheel feedback consumer failed and was detached", {
      reason: error instanceof Error ? error.message : String(error),
    });
  });
  const slipAudio = createSlipAudioSink();
  wheelCues.subscribe(slipAudio);
  const gamepadHaptics = createGamepadHapticOutput({
    getSelectedSlot: () => inputManager.getSelectedGamepadSlot(),
    onChange: () => haptics.cancel(),
  });
  const phoneHaptics: HapticOutput = {
    // Coarse on/off pulses: magnitude maps to pulse length, not intensity.
    play: envelope => phoneSession?.setHapticFeedback(Math.min(envelope.durationMs,
      Math.round(10 + 50 * Math.max(envelope.strong, envelope.weak)))),
    cancel: () => phoneSession?.setHapticFeedback(0),
  };
  const haptics = createHapticsController([gamepadHaptics, phoneHaptics]);
  wheelCues.subscribe(haptics);
  const resetWheelSpin = (reason: WheelCueResetReason = "reset"): void => {
    wheelSpin.reset();
    wheelCues.invalidate(reason);
    tireAudio.update(0);
  };
  const physicsLoop = createFixedStepPhysicsLoop(jsbsim.sdk, () => {
    // Ahead of the wheel guard: engine sound must not depend on a wheel experiment.
    flightAudio.publishStep();
    if (wheelSpinMode === "off") return;
    wheelSpin.step(FIXED_DT, wheelSpinMode);
    acceptedWheelSteps += 1;
    wheelCues.publish(acceptedWheelSteps * FIXED_DT, FIXED_DT, wheelSpin.getStates());
  }, {
    getArcadeGroundLaunches: () => arcadeGroundLaunches,
  });
  const flightSurface = createFrameSurfaceQuery(runtime.surface);
  const terrainContact = createTerrainContact(jsbsim.sdk, flightSurface, getFdmProfile(initialAircraftId).stance);
  const visibleMeshCollision = createVisibleMeshCollision(jsbsim.sdk, flightSurface, {
    bodyProbes: getFdmProfile(initialAircraftId).bodyCollisionProbes,
    getRestitution: () => arcadeGroundLaunches ? 1.35 : 0.25,
  });
  // This stays completely out of the normal render loop unless someone opts
  // in through the URL. It makes a stutter reproducible with numbers instead
  // of trying to infer its source from a single FPS reading.
  const flightPerformance = isFlightPerformanceCaptureEnabled()
    ? createFlightPerformanceCapture() : null;
  if (flightPerformance) setActiveFlightPerformanceCapture(flightPerformance);
  // Where each frame's time goes (Debug → Frame budget). `flightPerf=1` starts
  // it on; otherwise it is off until the Debug tab switches it on. Off, it
  // leaves nothing attached to the scene.
  const frameProfiler = createFrameProfiler();
  let stopSceneProfiling: (() => void) | null = null;
  const setFrameProfiling = (enabled: boolean): void => {
    frameProfiler.enabled = enabled;
    if (enabled && !stopSceneProfiling) stopSceneProfiling = profileBabylonScene(frameProfiler, runtime.scene, runtime.engine);
    if (!enabled && stopSceneProfiling) {
      stopSceneProfiling();
      stopSceneProfiling = null;
    }
  };
  setActiveFrameProfile({
    profiler: frameProfiler,
    setEnabled: setFrameProfiling,
    gpuTimed: () => canTimeGpuFrames(runtime.engine),
  });
  if (flightPerformance) setFrameProfiling(true);
  // The same idea for the phone's camera trackpad (`phoneCameraTrace=1`): every
  // hop from the phone's touch to the orbit drawn here, with both clocks.
  const phoneCameraTrace = isPhoneCameraTraceEnabled()
    ? createPhoneCameraTrace({
      getSettings: () => ({ recenterMode: orbitInvert.recenterMode, phoneSwipeRadians: PHONE_SWIPE_RADIANS, tuning: { ...phoneCameraTuning } }),
    }) : null;
  if (phoneCameraTrace) setActivePhoneCameraTrace(phoneCameraTrace);
  const flightHud: FlightHudHandle = createFlightHud(hudRoot, {
    onGearChange: (down) => { inputManager.setGearDown(down); runtime.requestRender(); },
    onThrottleChange: (value) => { inputManager.setThrottle(value); runtime.requestRender(); },
    onPitchTrimChange: (value) => { inputManager.setPitchTrim(value); runtime.requestRender(); },
    onRollTrimChange: (value) => { inputManager.setRollTrim(value); runtime.requestRender(); },
    onPitchAutoTrimChange: (enabled) => {
      pitchAutoTrim = setAutoTrimEnabled(pitchAutoTrim, enabled);
      writePreference(AUTO_TRIM_PREFERENCE_KEY, enabled ? "on" : "off");
      runtime.requestRender();
    },
    onRollAutoTrimChange: (enabled) => {
      rollAutoTrim = setAutoTrimEnabled(rollAutoTrim, enabled);
      writePreference(AUTO_ROLL_TRIM_PREFERENCE_KEY, enabled ? "on" : "off");
      runtime.requestRender();
    },
    onAutopilotEngageChange: (engaged) => { setAutopilotEngaged(engaged); },
    onFlapsChange: (value) => { inputManager.setFlaps(value); runtime.requestRender(); },
    onRudderChange: (value) => { inputManager.setRudder(value); runtime.requestRender(); },
    onStickChange: (aileron, elevator) => { inputManager.setStick(aileron, elevator); runtime.requestRender(); },
    pitchAutoTrim: pitchAutoTrim.enabled,
    rollAutoTrim: rollAutoTrim.enabled,
    autopilotEngaged: lastApResult.engaged,
    // Babylon keeps its device on an internal field. Sharing it puts the
    // instrument on the globe's queue instead of opening a second device.
    gpuDevice: runtime.renderer.mode === "webgpu" ? (runtime.renderer.engine as WebGPUEngine)._device : null,
    attitudeRenderer: attitudeRendererSetting.getState().preference,
    onAttitudeStatus: status => {
      attitudeRendererSetting.publishStatus(status);
      if (!status.backend) return;
      flightLog.info("hud", `Attitude indicator draws with ${status.backend === "webgpu" ? "WebGPU" : "Canvas 2D"}`,
        { preference: status.preference, renderer: runtime.renderer.mode, ...(status.reason ? { reason: status.reason } : {}) });
    },
    profiler: frameProfiler,
  });
  const stopAttitudeSetting = attitudeRendererSetting.subscribe(() => {
    flightHud.setAttitudeRenderer(attitudeRendererSetting.getState().preference);
    runtime.requestRender();
  });

  let floatingOrigin: FloatingOriginHandle | null = null;
  let aircraft: ReturnType<typeof createPlaceholderAircraft> | null = null;
  let aircraftModel: AircraftModelHandle | null = null;
  let controlPanel: FlightControlPanelHandle | null = null;
  // Pilot evaluation: engine, AoA and CAS on the HUD. Flight recording lives in
  // the Logging tab and stays off until the pilot starts it.
  const flightRecorder = createFlightRecorder({
    metadata: {
      build: __SOURCE_VERSION__,
      built: __BUILD_TIME__,
      aircraft: initialAircraftId,
      generation: initialAircraftSelection.generationId ?? "",
      jsbsim: JSON.stringify(jsbsim.identity),
    },
  });
  const recordingFileName = () =>
    `0sfs-${initialAircraftId}-${__SOURCE_VERSION__}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const loggingSnapshot = (): LoggingPanelState => ({
    recording: flightRecorder.isRecording(),
    sampleCount: flightRecorder.getSampleCount(),
    durationSec: flightRecorder.getDurationSec(),
    markCount: flightRecorder.getMarks().length,
  });
  const handleLoggingAction = (action: LoggingAction): void => {
    if (action.type === "start") flightRecorder.start();
    else if (action.type === "stop") flightRecorder.stop();
    else if (action.type === "mark") flightRecorder.mark();
    else if (action.type === "clear") {
      flightRecorder.stop();
      flightRecorder.clear();
    } else if (action.type === "save" && flightRecorder.getSampleCount() > 0) {
      downloadCsv(`${recordingFileName()}.csv`, flightRecorder.toCsv());
    }
    controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
  };
  const unbindRecorderMark = bindRecorderMarkHotkey(flightRecorder);
  const evaluationInstruments = createEvaluationInstruments(
    hudRoot.querySelector<HTMLElement>(".flight-hud__eval") ?? hudRoot,
  );
  const engineMonitor = createEngineMonitor(
    hudRoot.querySelector<HTMLElement>(".flight-hud__engine") ?? hudRoot,
    {
      soundStatus: () => flightAudio.getStatus(),
      onOpen: () => controlPanel?.openOrSelectTab("engine"),
    },
  );
  // Session-only debug opt-in: no overlay meshes or SDK reads until enabled.
  let collisionDebugEnabled = false;
  let collisionDebugOverlay: ReturnType<typeof createCollisionDebugOverlay> | null = null;
  let wheelSpinDebugOverlay: ReturnType<typeof createWheelSpinDebugOverlay> | null = null;
  const syncCollisionDebugOverlay = (): void => {
    if (collisionDebugEnabled && aircraft && !collisionDebugOverlay) {
      collisionDebugOverlay = createCollisionDebugOverlay(runtime.scene, aircraft.root, jsbsim.sdk);
    }
    collisionDebugOverlay?.setEnabled(collisionDebugEnabled);
    const showWheels = collisionDebugEnabled && wheelSpinMode !== "off";
    if (showWheels && aircraft && !wheelSpinDebugOverlay) {
      wheelSpinDebugOverlay = createWheelSpinDebugOverlay(runtime.scene, aircraft.root, jsbsim.sdk, wheelSpin.getStates);
    }
    wheelSpinDebugOverlay?.setEnabled(showWheels);
  };
  /** Applies the resolved settings plus any Debug override; boundary choices only change when applied. */
  const applyGroundRuntime = (): void => {
    groundResolution = resolveGroundInteraction(groundStore.settings, groundCapabilities, appliedGroundBoundary);
    const active = groundResolution.active;
    const nextMode = wheelExperiment.rotation ?? active.rotation;
    if (nextMode !== wheelSpinMode) {
      wheelSpinMode = nextMode;
      resetWheelSpin("mode");
    }
    const nextSound = wheelSpinMode !== "off" && (wheelExperiment.tireSound ?? active.tireAudio === "slip");
    if (nextSound !== tireSoundEnabled) {
      tireSoundEnabled = nextSound;
      tireAudio.setEnabled(nextSound);
    }
    tireAudio.setVolume(groundStore.settings.tireAudioVolume);
    const nextHaptics = wheelSpinMode !== "off" && active.haptics === "landing";
    if (nextHaptics !== hapticsActive) {
      hapticsActive = nextHaptics;
      haptics.setEnabled(nextHaptics);
    }
    haptics.setStrength(groundStore.settings.hapticStrength);
    syncCollisionDebugOverlay();
  };
  /** Paused, loading and reset states are safe boundaries for wheel/force/contact choices. */
  const applyGroundBoundary = (): void => {
    appliedGroundBoundary = boundaryOf(groundStore.settings);
    applyGroundRuntime();
  };
  applyGroundRuntime();
  const aircraftId: AircraftId = initialAircraftId;
  let aircraftLodId: AircraftLodId = initialAircraftSelection.lodId;
  let aircraftGenerationId: string = initialAircraftSelection.generationId ?? getAircraftFamilyForAircraft(aircraftId).variants[0]?.id ?? "cessna-172";
  let optInLodsEnabled = initialAircraftSelection.optInLodsEnabled;
  let aircraftReloadRequested = false;
  let modelState: AircraftModelState = {
    aircraftId, lodId: aircraftLodId, activeLodId: null,
    optInEnabled: optInLodsEnabled,
    status: "placeholder", triangles: null, error: null,
  };
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
  let orbitInvert = loadOrbitInvertSettings();
  // The phone trackpad's A/B settings (Remote Control tab). Read live by the
  // phone session and each frame, so a change is felt on the next swipe.
  let phoneCameraTuning: PhoneCameraTuning = loadPhoneCameraTuning();
  let phoneCameraVariant = describePhoneCameraTuning(phoneCameraTuning);
  let chaseFrameApplied: PhoneCameraTuning["chaseFrame"] = "attitude";
  let orbitStateYaw = CAMERA_ORBIT_RESTORE_YAW;
  let orbitStatePitch = CAMERA_ORBIT_RESTORE_PITCH;
  type OrbitInputSource = "gamepad" | "manual" | "phone";
  const orbitInputSources = new Set<OrbitInputSource>();
  const setOrbitInputActive = (source: OrbitInputSource, active: boolean): void => {
    if (active) orbitInputSources.add(source);
    else orbitInputSources.delete(source);
  };
  const isOrbitInputActive = (): boolean => orbitInputSources.size > 0;
  const applyOrbitDelta = (yaw: number, pitch: number): void => {
    if (!aircraft || aircraft.getViewMode() !== "third") return;
    orbitStateYaw = normalizeAngle(orbitStateYaw + yaw);
    orbitStatePitch = clamp(orbitStatePitch + pitch, CAMERA_ORBIT_PITCH_MIN, CAMERA_ORBIT_PITCH_MAX);
    aircraft.orbitChaseCamera(yaw, pitch);
    runtime.requestRender();
  };
  const applyCameraZoom = (factor: number): void => {
    if (!aircraft || aircraft.getViewMode() !== "third") return;
    aircraft.zoomChaseCamera(factor);
    aircraftModel?.refreshAutoLod();
    runtime.requestRender();
  };
  /**
   * The phone controller's camera trackpad. It sends what the fingers did —
   * a swipe as a fraction of the pad, a pinch as a spread ratio — so this is a
   * one-to-one gesture like the mouse drag, not something integrated over time.
   * A full-pad swipe is a little over a third of a turn before sensitivity.
   */
  const applyPhoneCameraAim = (): CameraAim | null => {
    setOrbitInputActive("phone", phoneSession?.isCameraActive() ?? false);
    const aim = phoneSession?.takeCameraAim() ?? null;
    if (!aim) return null;
    // Deliberately not the desktop's pointer sensitivity: that setting belongs
    // to a mouse or a laptop trackpad, and a phone is neither.
    if (aim.yaw !== 0 || aim.pitch !== 0) {
      applyOrbitDelta(
        aim.yaw * PHONE_SWIPE_RADIANS * (orbitInvert.invertYaw ? -1 : 1),
        aim.pitch * PHONE_SWIPE_RADIANS * (orbitInvert.invertPitch ? -1 : 1),
      );
    }
    // A pinch apart brings the aircraft closer, which is a smaller distance.
    if (aim.zoom !== undefined && aim.zoom !== 1) applyCameraZoom(1 / aim.zoom);
    return aim;
  };
  /** Keeps the chase camera out of whichever aircraft rotations the setting leaves out. */
  const applyChaseFrame = (state: FlightState): void => {
    const frame = phoneCameraTuning.chaseFrame;
    if (!aircraft || (frame === "attitude" && chaseFrameApplied === "attitude")) return;
    chaseFrameApplied = frame;
    aircraft.setChaseFrame(frame === "attitude" ? null : flightAttitudeToQuaternion(
      0, frame === "no-roll" ? state.pitchRad : 0, state.headingRad,
    ));
  };
  const recenterOrbit = (deltaSeconds: number): void => {
    if (!aircraft || aircraft.getViewMode() !== "third") return;
    if (deltaSeconds <= 0) return;
    if (orbitInvert.recenterMode !== "recenter") return;
    if (isOrbitInputActive()) return;
    const targetYaw = CAMERA_ORBIT_RESTORE_YAW;
    const targetPitch = CAMERA_ORBIT_RESTORE_PITCH;
    const deltaYaw = -normalizeAngle(orbitStateYaw - targetYaw);
    const deltaPitch = targetPitch - orbitStatePitch;
    if (Math.abs(deltaYaw) <= 0.00005 && Math.abs(deltaPitch) <= 0.00005) return;
    const nextYaw = approach(orbitStateYaw, targetYaw, deltaSeconds, CAMERA_ORBIT_RETURN_SECONDS);
    const nextPitch = approach(orbitStatePitch, targetPitch, deltaSeconds, CAMERA_ORBIT_RETURN_SECONDS);
    applyOrbitDelta(nextYaw - orbitStateYaw, nextPitch - orbitStatePitch);
  };
  const detachCameraInput = attachFlightCameraInput(canvas, {
    getMode: () => inputMode,
    getSensitivity: () => inputSensitivity,
    getOrbitInvert: () => orbitInvert,
    orbit: (yaw, pitch) => {
      applyOrbitDelta(yaw, pitch);
    },
    onOrbitActive: (active) => setOrbitInputActive("manual", active),
    zoom: applyCameraZoom,
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
    orbitStateYaw = CAMERA_ORBIT_RESTORE_YAW;
    orbitStatePitch = Math.asin(
      clamp(aircraft.thirdPersonCamera.position.y / aircraft.thirdPersonCamera.position.length(), CAMERA_ORBIT_PITCH_MIN, CAMERA_ORBIT_PITCH_MAX),
    );
    syncCollisionDebugOverlay();
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
    if (inputManager.isBindingCaptureActive() || inputManager.isGamepadToolsActive()) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    toggleCameraView();
    phoneSession?.syncStatus();
  };

  window.addEventListener("keydown", onViewKeyDown);

  const flightGamepadSource = createBrowserInputSource({ target: window });
  const flightGamepadPolling = createGamepadPollingController();
  const flightGamepadResponse = inputManager.getGamepadResponseController();
  const flightGamepadRuntime = new BindingRuntime({
    defaultAxisDeadzone: 0.08,
    getAxisDeadzoneMode: () => flightGamepadResponse.getSettings().deadzoneMode,
    adapter: createFlightGamepadAdapter(inputManager, {
      onViewToggle: () => {
        toggleCameraView();
        phoneSession?.syncStatus();
      },
      onCameraOrbitActive: (active) => setOrbitInputActive("gamepad", active),
      onCameraOrbit: (yaw, pitch, dt) => {
        const inversion = orbitInvert;
        applyOrbitDelta(
          yaw * dt * 1.5 * (inversion.invertYaw ? -1 : 1),
          pitch * dt * 1.15 * (inversion.invertPitch ? -1 : 1),
        );
      },
    }),
    profile: createStandardFlightProfile(flightGamepadSource.getSelectedDevice()?.slot ?? 0),
  });
  const flightGamepadStore = createProfileStore();
  inputManager.setGamepadToolsActive(true);
  const detachGamepadProfileInput = flightGamepadSource.subscribe((frame) => {
    inputManager.setSelectedGamepadSlot(flightGamepadSource.getSelectedDevice()?.slot ?? 0);
    flightGamepadRuntime.dispatch(frame);
  });
  // The flight step owns active-flight sampling. Poll separately only while
  // it is idle so controller pause/resume and binding capture still work.
  flightGamepadSource.start({
    useAnimationFrame: true,
    shouldPoll: flightGamepadPolling.claimIdleFrame,
  });
  let flightBindingSignature = JSON.stringify(flightGamepadRuntime.getProfile().bindings);
  const gamepadBindings = {
    polling: flightGamepadPolling,
    response: flightGamepadResponse,
    mount(root: HTMLElement): { destroy(): void } {
      return mountBindingEditor({
        root,
        runtime: flightGamepadRuntime,
        source: flightGamepadSource,
        store: flightGamepadStore,
        builtInProfiles: [
          {
            id: "legacy",
            label: "Classic",
            previousNames: ["Legacy 0sfs compatibility"],
            create: () => createLegacyFlightProfile(inputManager.getSelectedGamepadSlot()),
          },
          {
            id: "standard",
            label: "Xbox",
            previousNames: ["Standard Xbox / PlayStation flight"],
            create: () => createStandardFlightProfile(inputManager.getSelectedGamepadSlot()),
          },
        ],
        onProfileChange: (profile) => {
          const signature = JSON.stringify(profile.bindings);
          if (signature === flightBindingSignature) return;
          flightBindingSignature = signature;
          inputManager.setGamepadToolsActive(false);
          inputManager.setGamepadToolsActive(true);
          // Prime neutral/held inputs at the switch so the next movement
          // reaches the next flight step, without a first-input wait.
          flightGamepadSource.tick();
        },
      });
    },
  };

  mountFlightWorld();
  const initialState = readFlightState(jsbsim.sdk);
  const describeWheelExperiment = (): string | null => {
    const parts: string[] = [];
    if (wheelExperiment.rotation !== null) parts.push(`wheel response ${GROUND_CHOICE_LABELS.rotation[wheelExperiment.rotation]}`);
    if (wheelExperiment.tireSound !== null) parts.push(`tire sound ${wheelExperiment.tireSound ? "on" : "off"}`);
    return parts.length > 0 ? parts.join(", ") : null;
  };
  const handleGroundAction = (action: GroundInteractionAction): void => {
    groundMessage = null;
    const safeBoundary = inputManager.isPaused() || worldLoading;
    const commit = (settings: GroundInteractionSettingsV1) => {
      groundStore.set(settings);
      if (safeBoundary) applyGroundBoundary();
      else applyGroundRuntime();
    };
    const report = (error: string | null, success: string) => {
      groundMessage = error ? { text: error, error: true } : { text: success, error: false };
    };
    switch (action.type) {
      case "preset": commit(applyGroundPreset(groundStore.settings, action.preset)); break;
      case "set": commit(patchGroundSettings(groundStore.settings, action.patch)); break;
      case "lock":
        commit(patchGroundSettings(groundStore.settings, { locked: { ...groundStore.settings.locked, [action.key]: action.locked } }));
        break;
      case "save-profile": report(groundStore.saveProfile(action.name), "Profile saved."); break;
      case "load-profile": {
        const error = groundStore.loadProfile(action.name);
        report(error, "Profile applied.");
        if (safeBoundary) applyGroundBoundary(); else applyGroundRuntime();
        break;
      }
      case "delete-profile": groundStore.deleteProfile(action.name); report(null, "Profile deleted."); break;
      case "export": groundExportText = groundStore.exportProfile(); report(null, "Copy this text to keep or share the profile."); break;
      case "import": report(groundStore.importProfile(action.text), "Profile imported. Choose it under Saved profiles."); break;
      case "keep-experiment": {
        const patch: Partial<GroundInteractionSettingsV1> = {};
        if (wheelExperiment.rotation !== null) patch.rotation = wheelExperiment.rotation;
        if (wheelExperiment.tireSound !== null) patch.tireAudio = wheelExperiment.tireSound ? "slip" : "off";
        groundStore.set(patchGroundSettings(groundStore.settings, patch));
        // Already running, so keeping it is not a mid-flight change.
        if (wheelExperiment.rotation !== null) appliedGroundBoundary = { ...appliedGroundBoundary, rotation: wheelExperiment.rotation };
        wheelExperiment = { rotation: null, tireSound: null };
        applyGroundRuntime();
        report(null, "Experiment choices saved to Ground interaction.");
        break;
      }
      case "discard-experiment":
        wheelExperiment = { rotation: null, tireSound: null };
        applyGroundRuntime();
        break;
    }
  };
  const createPanelSnapshot = (flightState = initialState): FlightControlPanelSnapshot => {
    return {
      flightState,
      fps: runtime.engine.getFps(),
      paused: inputManager.isPaused(),
      viewMode: aircraft?.getViewMode() ?? "third",
      runtimeStatus: { ...runtime.status },
      rendererMode: runtime.renderer.mode,
      flightTerrainRequirement,
      flightTerrainRequirementHeld: detailRequirements?.isHeld() ?? false,
      allowCoarserTerrainThisSession,
      terrainDetailAnchor,
      aircraftId,
      generationId: aircraftGenerationId,
      lodId: aircraftLodId,
      optInLodsEnabled,
      modelStatus: modelState.status,
      modelActiveLodId: modelState.activeLodId,
      modelTriangles: modelState.triangles,
      modelError: modelState.error,
      keyboardStick: inputManager.getKeyboardStickSettings(),
      orbitInvert,
      phoneCameraTuning,
      arcadeGroundLaunches,
      collisionDebugEnabled,
      wheelSpinMode,
      tireSoundEnabled,
      tireAudioStatus: tireAudio.getStatus(),
      sound: flightAudio.getStatus(),
      wheelSpinStates: wheelSpinMode === "off" ? [] : wheelSpin.getStates().map(wheel => ({ ...wheel })),
      groundInteraction: {
        settings: groundStore.settings,
        resolution: groundResolution,
        capabilities: groundCapabilities,
        profiles: groundStore.profiles.map(profile => profile.name),
        readOnlyReason: groundStore.readOnlyReason,
        message: groundMessage,
        exportText: groundExportText,
        experimentOverride: describeWheelExperiment(),
        hapticDevices: {
          gamepad: gamepadHaptics.describe(),
          phone: phoneSession ? "Uses the phone's Haptics switch where its browser supports vibration" : "Not paired",
        },
      },
      autopilot: {
        settings: autopilotSettings,
        engaged: lastApResult.engaged,
        owners: lastApResult.owners,
        ardupilot: ardupilotStatus,
        blockedReason: autopilotBlockReason(),
        readOnlyReason: autopilotStore.readOnlyReason,
      },
      logging: loggingSnapshot(),
    };
  };

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
      resetWheelSpin("fault");
    }
    // Pausing discards partial feedback windows and is a safe settings boundary.
    if (paused) {
      wheelCues.invalidate("pause");
      applyGroundBoundary();
    }
    phoneSession?.cancelHandoff();
    physicsLoop.setPaused(paused || worldLoading);
    tireAudio.setPaused(paused || worldLoading);
    flightAudio.setHeld(paused, "pause");
    runtime.setSimRunning(!paused && !worldLoading);
    skipResumeDelta = !paused;
    const state = physicsLoop.getLatestState() ?? initialState;
    controlPanel?.update(createPanelSnapshot(state));
    hudBar?.update(state, runtime.status, measuredFps, paused);
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
    tireAudio.setPaused(true);
    flightAudio.setHeld(true, "loading");
    resetWheelSpin("teleport");
    applyGroundBoundary();
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
          detail: progress.message, terrain: progress,
        });
      },
    }, allowCoarserTerrainThisSession).then(terrain => {
      if (disposed || abort.signal.aborted) return;
      const destination = { ...location, altMeters: terrain.altitudeMeters };
      const state = resetFlightLocation(jsbsim.sdk, destination, terrain.groundHeightMeters, aircraftId);
      terrainContact.reset();
      visibleMeshCollision.reset();
      if (location.flightPreset) {
        inputManager.resetControls(state.throttleNorm);
        inputManager.setFlaps(getFdmProfile(aircraftId).runwayPresets[location.flightPreset.mode].flapsNorm);
        inputManager.setGearDown(true);
        if (location.flightPreset.mode === "departure") setSimulationPaused(true);
      }
      appliedControls = inputManager.getControls();
      physicsLoop.reset();
      // A reposition is a discontinuity: new timeline, cleared queues, a fade.
      flightAudio.beginEpoch();
      applyWeather(weather);
      pitchAutoTrim = createAutoTrimState(pitchAutoTrim.enabled);
      rollAutoTrim = createAutoTrimState(rollAutoTrim.enabled);
      arbiterState = resetArbiterHold(arbiterState);
      lastApResult = { ...lastApResult, owners: idleAutopilotOwners() };
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
      tireAudio.setPaused(inputManager.isPaused());
      flightAudio.setHeld(false, "loading");
      runtime.setSimRunning(!inputManager.isPaused());
      skipResumeDelta = true;
      phoneSession?.syncStatus();
      flightHud.update(state, inputManager.getControls(), inputManager.getGearDownNorm() > 0, {
        pitch: pitchAutoTrim.enabled, roll: rollAutoTrim.enabled,
      }, hudMasterAp());
      controlPanel?.update(createPanelSnapshot(state));
      hudBar?.update(state, runtime.status, measuredFps, inputManager.isPaused());
      loading.hide();
      runtime.requestRender();
    }).catch(() => {
      if (disposed || abort.signal.aborted) return;
      loading.fail("The destination terrain is not ready. Check your connection and map access, then retry.", () => teleportToLocation(location));
    });
  };

  /**
   * Pairing loads with the Remote Control tab, not with the flight: PeerJS and
   * the QR encoder are fetched only for a pilot who opens it. The session is
   * made once and outlives the tab, so switching tabs keeps the phone.
   */
  const loadPhonePairing = (): Promise<MountPhonePairing> => phonePairing ??= Promise.all([
    import("./remote/createPhoneControlSession"), import("./hud/createPhonePairingPanel"),
  ]).then(([{ createPhoneControlSession }, { createPhonePairingPanel }]): MountPhonePairing => {
    if (disposed) throw new Error("The flight has closed.");
    const session = phoneSession ??= createPhoneControlSession({
      getStatus: () => {
        const state = physicsLoop.getLatestState() ?? initialState;
        return {
          owner: phoneSession?.getSnapshot().owner ?? "local",
          paused: inputManager.isPaused(), viewMode: aircraft?.getViewMode() ?? "third",
          controls: phoneSession?.getSnapshot().owner === "phone" ? { ...appliedControls } : inputManager.getControls(),
          airspeedKts: state.airspeedKts, altitudeFt: state.altMeters / 0.3048,
          headingDeg: (state.headingRad * 180 / Math.PI + 360) % 360,
          // Presence of this field is what tells the phone it may offer a G button.
          gearDown: inputManager.getGearDownNorm() > 0,
          // The same reading the HUD's engine chip is drawing from, so both
          // screens show one engine rather than two sampled at two times.
          engine: toEngineStatus(engineMonitor.getReading()),
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
      // A paused simulation renders only on request; keep frames coming while
      // the phone is orbiting, the way a mouse drag does.
      onCameraAim: () => runtime.requestRender(),
      getCameraTuning: () => phoneCameraTuning,
      ...(phoneCameraTrace ? { trace: phoneCameraTrace } : {}),
      // Same path the HUD's G button and the G key take, so the three stay in step.
      setGearDown: down => { inputManager.setGearDown(down); flightHud.setGearDown(down); runtime.requestRender(); },
    });
    return (host, panelOptions) => createPhonePairingPanel(host, session, panelOptions);
  }).catch((error: unknown) => { phonePairing = null; throw error; });
  const onVisibilityChange = () => {
    if (!document.hidden) return;
    haptics.cancel();
    phoneSession?.onHidden();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  // The renderer and basemap choices each have a tab; their HUD chips toggle it.
  const rendererPanel = createRendererPanel({ renderer: runtime.renderer, onChange: setRendererForce });
  const mapPanel = createMapSourcePanel({
    detail: mapDetail ?? undefined,
    rasterSources: RASTER_BASE_MAP_SOURCES,
    terrainSources: TERRAIN_SOURCES,
    onMapSourceChange: (sourceId) => {
      // One 2D basemap for another changes imagery only; the elevation and
      // the surface under the aircraft stay, so there is nothing to prepare.
      const imageryOnly = runtime.status.mode === "raster-basemap" && sourceId !== "google";
      runtime.setMapSource(sourceId === "google" ? "google" : resolveRasterBaseMapSource(sourceId));
      setMapSourcePreference(sourceId);
      if (!imageryOnly) teleportToLocation(physicsLoop.getLatestState() ?? initialState);
    },
    onTerrainSourceChange: (sourceId) => {
      runtime.setTerrainSource(resolveTerrainSource(sourceId));
      setTerrainSourcePreference(sourceId);
      teleportToLocation(physicsLoop.getLatestState() ?? initialState);
    },
  });
  controlPanel = createFlightControlPanel(panelRoot, createPanelSnapshot(), {
    mapTab: mapPanel.element,
    rendererTab: rendererPanel.element,
    initialWeather: weather,
    gamepadBindings,
    onLocationApply: teleportToLocation,
    locationSearchProvider: options.locationSearchProvider,
    onWeatherChange: applyWeather,
    onPausedChange: setSimulationPaused,
    onViewModeChange: (mode) => { aircraft?.setViewMode(mode); phoneSession?.syncStatus(); runtime.requestRender(); },
    onAircraftApply: (selection) => {
      if (aircraftReloadRequested) return null;
      const next = normalizeAircraftSelection(selection);
      const saveError = writeAircraftSelectionPreference(next);
      if (saveError) return saveError;
      if (next.aircraftId !== aircraftId) {
        // Package, control convention, contact geometry, gauges and visuals
        // change together on boot. Staged model settings never touch the
        // current aircraft while another complete identity is being chosen.
        aircraftReloadRequested = true;
        try {
          window.location.reload();
          return null;
        } catch {
          aircraftReloadRequested = false;
          return "Your aircraft choice was saved, but the app could not reload. Reload the page to activate it.";
        }
      }
      aircraftLodId = next.lodId;
      aircraftGenerationId = next.generationId
        ?? getAircraftFamilyForAircraft(next.aircraftId).variants[0]?.id
        ?? "cessna-172";
      optInLodsEnabled = next.optInLodsEnabled;
      aircraftModel?.setPresentation(next.lodId, next.optInLodsEnabled);
      if (aircraftModel) modelState = aircraftModel.getState();
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
      runtime.requestRender();
      return null;
    },
    onFlightTerrainRequirementChange: (errorTarget) => {
      if (!isErrorTarget(errorTarget)) return;
      flightTerrainRequirement = errorTarget;
      // A held low-spawn requirement follows the edit at once; otherwise the
      // new minimum applies to the next preparation. The saved range is untouched.
      detailRequirements?.setRequirement(errorTarget);
      writePreference(FLIGHT_TERRAIN_REQUIREMENT_KEY, String(errorTarget));
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
      runtime.requestRender();
    },
    onTerrainDetailOverrideChange: (enabled) => {
      allowCoarserTerrainThisSession = enabled;
      // The waiver ends any requirement a low spawn is holding.
      if (enabled) detailRequirements?.releaseAll();
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
      runtime.requestRender();
    },
    onTerrainDetailAnchorChange: (anchor) => {
      terrainDetailAnchor = anchor;
      writePreference(TERRAIN_DETAIL_ANCHOR_PREFERENCE_KEY, anchor);
      runtime.setGoogleTerrainDetailAnchor(runtimeTerrainDetailAnchor(anchor));
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
      runtime.requestRender();
    },
    onKeyboardStickSettingsChange: (settings) => {
      inputManager.setKeyboardStickSettings(settings);
      saveKeyboardStickSettings(inputManager.getKeyboardStickSettings());
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
      runtime.requestRender();
    },
    onOrbitInvertChange: (settings) => {
      orbitInvert = settings;
      saveOrbitInvertSettings(settings);
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
      runtime.requestRender();
    },
    onPhoneCameraTuningChange: (tuning) => {
      phoneCameraTuning = tuning;
      phoneCameraVariant = describePhoneCameraTuning(tuning);
      savePhoneCameraTuning(tuning);
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
      runtime.requestRender();
    },
    onCollisionDebugChange: (enabled) => {
      collisionDebugEnabled = enabled;
      syncCollisionDebugOverlay();
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
      runtime.requestRender();
    },
    // Debug A/B remains immediate and session-only; Settings can keep it explicitly.
    onWheelSpinModeChange: (mode) => {
      wheelExperiment = { rotation: mode, tireSound: mode === "off" ? false : wheelExperiment.tireSound };
      resetWheelSpin("mode");
      applyGroundRuntime();
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
      runtime.requestRender();
    },
    onTireSoundChange: (enabled) => {
      // Synchronous inside the checkbox gesture so audio can unlock.
      wheelExperiment = { ...wheelExperiment, tireSound: enabled && wheelSpinMode !== "off" };
      applyGroundRuntime();
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
      runtime.requestRender();
    },
    onSoundAction: (action) => {
      // Synchronous inside the control's gesture so audio can unlock.
      switch (action.type) {
        case "enable": flightAudio.setEnabled(action.enabled); break;
        case "quality": flightAudio.setQuality(action.quality); break;
        case "settings": flightAudio.patchSettings(action.patch); break;
        case "retest": flightAudio.retest(); break;
        case "allow-unvalidated": flightAudio.setAllowUnvalidated(action.allowed); break;
      }
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
      runtime.requestRender();
    },
    onGroundInteractionAction: (action) => {
      handleGroundAction(action);
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
      runtime.requestRender();
    },
    onAutopilotSettingsChange: (settings) => {
      applyAutopilotSettings(settings);
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
    },
    onAutopilotEngageChange: (engaged) => {
      setAutopilotEngaged(engaged);
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
    },
    attachEngineDetails: (host) => engineMonitor.attachDetails(host),
    // The HUD bar is built later in this same synchronous setup, and the tab
    // only renders once opened, so the bar exists by the time this runs.
    attachInputMethod: (host) => hudBar?.mountInputMethod(host) ?? (() => {}),
    onLoggingAction: handleLoggingAction,
    flightRecorder,
    loadPhonePairing,
    // A clean /rc/: nothing the simulator was opened with means anything there.
    onUseAsRemote: () => window.location.assign(appHref("rc", new URL(window.location.origin))),
    onArcadeGroundLaunchesChange: (enabled) => {
      arcadeGroundLaunches = enabled;
      writePreference(ARCADE_GROUND_LAUNCHES_PREFERENCE_KEY, enabled ? "on" : "off");
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
      runtime.requestRender();
    },
  });
  audioPanelReady = true;
  hudBar = createFlightHudBar(shellRoot, {
    renderActivity: runtime,
    rendererMode: runtime.renderer.mode,
    runtimeStatus: runtime.status,
    onInputModeChange: (mode) => { inputMode = mode; },
    onInputSensitivityChange: (settings) => { inputSensitivity = settings; },
    onPausedChange: setSimulationPaused,
    mapDetail: mapDetail!,
    onSettingsClick: () => panelRoot.querySelector<HTMLButtonElement>('[aria-label="Open right panel"]')?.click(),
    onDebugClick: () => controlPanel?.toggleTab("debug"),
    onInputMethodClick: () => controlPanel?.toggleTab("controls"),
    onRendererClick: () => controlPanel?.toggleTab("renderer"),
    onMapClick: () => controlPanel?.toggleTab("map"),
    onStatusClick: () => controlPanel?.toggleTab("location"),
    onLogToggle: () => {
      log.setOpen(!log.isOpen());
      return log.isOpen();
    },
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
              detail: `Flight requires World detail 2^${Math.log2(flightTerrainRequirement).toFixed(2)} or finer. Choose finer World detail on the rail or in the Map tab, or allow coarser terrain for this session.`,
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
  mapPanel.update(runtime.status);

  const ensureWorld = (): void => {
    mountFlightWorld();
  };

  runtime.setSimTick((deltaSeconds) => {
    if (disposed || worldLoading) return;
    flightSurface.beginFrame();
    const frameIntervalMs = deltaSeconds * 1000;
    // One frame per sim tick; Babylon's render of the tick lands in the same frame.
    frameProfiler.frame();
    const flightTickStarted = frameProfiler.clock();
    let sectionStarted = flightTickStarted;
    // Do not integrate the time spent idle when resuming the simulation.
    deltaSeconds = skipResumeDelta ? 0 : Math.min(deltaSeconds, 0.1);
    skipResumeDelta = false;
    const phoneAimAt = phoneCameraTrace ? performance.now() : 0;
    const phoneAim = applyPhoneCameraAim();
    // Paced playout draws over several frames; a paused view renders only on request.
    if (phoneSession?.hasPendingCameraAim()) runtime.requestRender();
    recenterOrbit(deltaSeconds);

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
    frameProfiler.add("flight/camera", sectionStarted);
    sectionStarted = frameProfiler.clock();
    if (!physicsLoop.getFault()
      && terrainContact.update(false, googleTiles, true, true) === "reset") {
      physicsLoop.reset();
      visibleMeshCollision.reset();
      wheelCues.setGroundRevision(++groundRevision);
    }
    frameProfiler.add("flight/terrain", sectionStarted);

    sectionStarted = frameProfiler.clock();
    physicsLoop.setPaused(inputManager.isPaused());
    if (flightGamepadPolling.claimFlightFrame()) flightGamepadSource.tick();
    const controls = inputManager.poll(deltaSeconds);
    frameProfiler.add("flight/input", sectionStarted);
    let terrainBlocked = false;
    const physicsStarted = frameProfiler.clock();
    const displayState = physicsLoop.update(deltaSeconds, () => {
      const contactStarted = frameProfiler.clock();
      const contact = terrainContact.update(false, googleTiles, true, true);
      frameProfiler.add("flight/physics/terrain contact", contactStarted);
      if (contact === false) {
        terrainBlocked = true;
        terrainBlockedReason = terrainContact.getBlockReason();
        return false;
      }
      // A terrain correction is a placement, not a swept flight trajectory.
      // Discard the old probe positions before testing the next movement.
      // Surface refinement adjusts placement but must preserve tire momentum.
      if (contact === "reset") {
        visibleMeshCollision.reset();
        wheelCues.setGroundRevision(++groundRevision);
      }
      const collisionStarted = frameProfiler.clock();
      const collisionReset = visibleMeshCollision.update();
      frameProfiler.add("flight/physics/collision", collisionStarted);
      // Terrain/collision work can consume the remaining input lease. Check
      // authority immediately before allowing this step to advance physics.
      const selected = phoneSession?.beforeStep(controls) ?? controls;
      if (selected === false || inputManager.isPaused()) return false;
      if (collisionReset) { resetWheelSpin("reset"); return "reset"; }
      const ap = syncArbiter(selected);
      const onGround = aircraftOnGround();
      const qbarPsf = jsbsim.sdk.getPropertyValue("aero/qbar-psf");
      const vtFps = jsbsim.sdk.getPropertyValue("velocities/vt-fps");
      const commanded = { ...ap.controls };
      if (ap.owners.pitch === "pilot") {
        const pusher = getFdmProfile(aircraftId).sf50VariantId
          ? jsbsim.sdk.getPropertyValue("fcs/pusher-cmd-norm") : 0;
        const pitched = stepPitchAutoTrim(pitchAutoTrim, {
          dt: FIXED_DT,
          pitchAccelRad: jsbsim.sdk.getPropertyValue("accelerations/qdot-rad_sec2"),
          pitchRateRad: jsbsim.sdk.getPropertyValue("velocities/q-rad_sec"),
          elevator: selected.elevator + (Number.isFinite(pusher) ? pusher : 0),
          pitchTrim: commanded.pitchTrim,
          qbarPsf,
          vtFps,
          onGround,
        });
        pitchAutoTrim = pitched.state;
        commanded.pitchTrim = pitched.pitchTrim;
        inputManager.replacePitchTrim(pitched.pitchTrim);
      }
      if (ap.owners.roll === "pilot") {
        const rolled = stepRollAutoTrim(rollAutoTrim, {
          dt: FIXED_DT,
          rollAccelRad: jsbsim.sdk.getPropertyValue("accelerations/pdot-rad_sec2"),
          rollRateRad: jsbsim.sdk.getPropertyValue("velocities/p-rad_sec"),
          aileron: selected.aileron,
          rollTrim: commanded.rollTrim,
          qbarPsf,
          vtFps,
          onGround,
        });
        rollAutoTrim = rolled.state;
        commanded.rollTrim = rolled.rollTrim;
        inputManager.replaceRollTrim(rolled.rollTrim);
      }
      applyFlightControls(
        jsbsim.sdk,
        commanded,
        ap.gearDownNorm,
        getFdmProfile(aircraftId).rudderSign,
      );
      appliedControls = { ...commanded };
      return contact;
    });
    frameProfiler.add("flight/physics", physicsStarted);
    sectionStarted = frameProfiler.clock();
    const feedbackHeld = inputManager.isPaused() || terrainBlocked || !!physicsLoop.getFault();
    tireAudio.setPaused(feedbackHeld);
    const slipPowerWatts = slipAudio.takeMeanPowerWatts();
    if (slipPowerWatts !== null) tireAudio.update(slipPowerWatts);
    haptics.tick(performance.now(), !feedbackHeld && !document.hidden);
    frameProfiler.add("flight/feedback", sectionStarted);

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

    sectionStarted = frameProfiler.clock();
    const sampledSurfaceHeight = flightSurface.sample(displayState.latDeg, displayState.lonDeg)?.heightMeters ?? null;
    const surfaceHeight = sampledSurfaceHeight ?? 0;
    frameProfiler.add("flight/terrain", sectionStarted);
    // A low spawn's detail requirement ends after a second of simulated flight
    // at least 100 m above the surface sampled under the aircraft this tick.
    detailRequirements?.observe({
      deltaSeconds,
      paused: inputManager.isPaused() || terrainBlocked || Boolean(physicsLoop.getFault()),
      aboveGroundMeters: sampledSurfaceHeight === null ? null : displayState.altMeters - sampledSurfaceHeight,
    });

    sectionStarted = frameProfiler.clock();
    runtime.setSimViewState({
      latDeg: displayState.latDeg,
      lonDeg: displayState.lonDeg,
      zoomMeters: zoomMetersFromAltitude(displayState.altMeters - surfaceHeight),
      headingDeg: (displayState.headingRad * 180) / Math.PI,
    });

    floatingOrigin?.apply(displayState);
    applyChaseFrame(displayState);
    const audioCamera = runtime.scene.activeCamera;
    if (aircraft && audioCamera && flightAudio.isEngineActive()) {
      flightAudio.updateView({
        camera: audioCamera,
        aircraftRoot: aircraft.root,
        exterior: aircraft.getViewMode() === "third" ? 1 : 0,
        // Unknown terrain switches the ground reflection off rather than guessing it.
        heightAboveGroundM: sampledSurfaceHeight === null ? null : displayState.altMeters - sampledSurfaceHeight,
      });
    }
    if (collisionDebugEnabled) collisionDebugOverlay?.update();
    if (collisionDebugEnabled && wheelSpinMode !== "off") wheelSpinDebugOverlay?.update();
    const rig = aircraftModel?.getRig();
    if (rig) applyAircraftRig(rig, readControlSurfaceState(jsbsim.sdk), deltaSeconds, { simulationHeld: feedbackHeld });
    frameProfiler.add("flight/view", sectionStarted);
    sectionStarted = frameProfiler.clock();
    const phoneOwned = phoneSession?.getSnapshot().owner === "phone";
    flightHud.update(
      displayState,
      phoneOwned || lastApResult.engaged ? appliedControls : controls,
      lastApResult.engaged ? lastApResult.gearDownNorm > 0 : inputManager.getGearDownNorm() > 0,
      { pitch: pitchAutoTrim.enabled, roll: rollAutoTrim.enabled },
      hudMasterAp(),
    );
    frameProfiler.add("flight/hud", sectionStarted);
    const now = performance.now();
    if (now - lastPanelUpdateMs >= 100) {
      sectionStarted = frameProfiler.clock();
      lastPanelUpdateMs = now;
      controlPanel?.update(createPanelSnapshot(displayState));
      hudBar?.update(displayState, runtime.status, measuredFps, inputManager.isPaused());
      mapPanel.update(runtime.status);
      frameProfiler.add("flight/panels", sectionStarted);
    }
    sectionStarted = frameProfiler.clock();
    flightRecorder.sample(jsbsim.sdk);
    evaluationInstruments.update(jsbsim.sdk);
    engineMonitor.update(jsbsim.sdk);
    frameProfiler.add("flight/instruments", sectionStarted);
    phoneCameraTrace?.renderFrame({
      at: phoneAimAt, intervalMs: frameIntervalMs,
      dxPx: (phoneAim?.yaw ?? 0) * 1000, dyPx: (phoneAim?.pitch ?? 0) * 1000, zoom: phoneAim?.zoom ?? 1,
      gestureActive: phoneSession?.isCameraActive() ?? false,
      orbitYaw: orbitStateYaw, orbitPitch: orbitStatePitch, variant: phoneCameraVariant,
      rollDeg: displayState.rollRad * 180 / Math.PI, pitchDeg: displayState.pitchRad * 180 / Math.PI,
      headingDeg: displayState.headingRad * 180 / Math.PI,
      viewMode: aircraft?.getViewMode() ?? "third",
      mapDownloadBytesPerSecond: runtime.getMapDownloadBytesPerSecond(),
    });
    frameProfiler.add("flight", flightTickStarted);
    if (flightPerformance) {
      const tileMetrics = runtime.getTileMetrics();
      flightPerformance.record({
        frameIntervalMs,
        flightTickCpuMs: frameProfiler.current("flight"),
        terrainQueryCpuMs: frameProfiler.current("flight/terrain") + frameProfiler.current("flight/physics/terrain contact"),
        collisionCpuMs: frameProfiler.current("flight/physics/collision"),
        physicsLoopCpuMs: frameProfiler.current("flight/physics"),
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
      if (!preserveLoadingScreen) {
        loading.destroy();
        if (!options.log) log.destroy();
      }
      phoneSession?.destroy();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      unbindRecorderMark();
      runtime.setSimTick(null);
      window.removeEventListener("keydown", onViewKeyDown);
      flightGamepadSource.stop();
      detachGamepadProfileInput();
      flightGamepadRuntime.dispose();
      flightGamepadSource.dispose();
      detachCameraInput();
      detachInput();
      if (flightPerformance) setActiveFlightPerformanceCapture(null);
      stopAttitudeSetting();
      setFrameProfiling(false);
      setActiveFrameProfile(null);
      if (phoneCameraTrace) setActivePhoneCameraTrace(null);
      hudBar?.destroy();
      statusOverlay?.destroy();
      controlPanel?.destroy();
      mapPanel.destroy();
      detailRequirements?.releaseAll();
      disconnectMapDetail();
      mapDetail?.dispose();
      rendererPanel.destroy();
      evaluationInstruments.destroy();
      engineMonitor.destroy();
      flightHud.destroy();
      collisionDebugOverlay?.dispose();
      wheelSpinDebugOverlay?.dispose();
      haptics.dispose();
      gamepadHaptics.dispose();
      wheelCues.invalidate("dispose");
      tireAudio.dispose();
      // Before jsbsim.dispose(): the audio adapter's property batch must not outlive the SDK.
      flightAudio.dispose();
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
    }, terrain.groundHeightMeters, aircraftId);
    terrainContact.reset();
    visibleMeshCollision.reset();
    physicsLoop.reset();
    revealAircraft(state);
    runtime.setSimViewState({ ...DEFAULT_FLIGHT_START, zoomMeters: START_ALTITUDE_AGL_METERS * 1.5 });
    worldLoading = false;
    physicsLoop.setPaused(inputManager.isPaused());
    tireAudio.setPaused(inputManager.isPaused());
    flightAudio.setHeld(inputManager.isPaused(), "pause");
    flightAudio.setHeld(false, "loading");
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
