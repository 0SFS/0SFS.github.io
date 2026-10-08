import "foss-earth/shell.css";
import { Vector3, type WebGPUEngine } from "@babylonjs/core";
import { bindFrameProfileSettings, FRAME_PROFILING_IDS } from "foss-earth/perf";
import { setActiveFrameProfile } from "./diagnostics/frameProfile";
import { getAppSettings } from "foss-earth/settings";
import { createMeshInspector } from "foss-earth/diagnostics";
import { describeAttitudeRendererStatus } from "./hud/attitudeRenderer";
import { AIRCRAFT_FOCUS_POINT, registerFlightSettings } from "./settings/registerFlightSettings";
import { flightParameterSpec, type FlightParameterStore } from "./settings/flightParameters";
import {
  AIRCRAFT_SELECTION_PARAMETER_IDS,
  aircraftSelectionValues,
  readAircraftSelection,
} from "./aircraft/aircraftSelectionSetting";
import "foss-earth/windowing.css";
import type { LocationSearchProvider, GeodeticLocation } from "foss-earth/windowing";
import { resetFlightLocation } from "./jsbsim/resetFlightLocation";
import { readFuelTanks, writeFuelTanks } from "./jsbsim/fuelTanks";
import { readExternalFuelTanks, setExternalFuelTankAttached } from "./jsbsim/externalFuelTanks";
import { getExternalTankDefinitions } from "./aircraft/externalTankDefinitions";
import { createExternalTankVisuals } from "./aircraft/createExternalTankVisuals";
import { createEngineControl } from "./jsbsim/engineControl";
import {
  applySavedControls,
  captureSavedFlight,
  createSavedFlightStore,
  restoreSavedFlight,
  savedFlightTerrainRequest,
  type SavedFlight,
} from "./jsbsim/savedFlight";
import { createStartupPause } from "./input/startupPause";
import { createTerrainContact } from "./physics/terrainContact";
import { createFrameSurfaceQuery } from "./physics/frameSurfaceQuery";
import { createVisibleMeshCollision } from "./physics/visibleMeshCollision";
import { loadInputModePreference, loadInputSensitivityPreference } from "foss-earth/input";
import "../styles/flight.css";
import "@felipegalind0/gamepad-tools/styles.css";
import { controlTakesKey, createBrowserInputSource } from "@felipegalind0/gamepad-tools/browser";
import {
  BindingRuntime,
  createProfileStore,
} from "@felipegalind0/gamepad-tools/core";
import { mountBindingEditor } from "@felipegalind0/gamepad-tools/ui";

import {
  applyRendererChoice,
  createBabylonRuntime,
  RASTER_BASE_MAP_SOURCES,
  TERRAIN_SOURCES,
  resolveMapRuntimeConfig,
  setMapSourcePreference,
  setTerrainSourcePreference,
  type BabylonRuntime,
  type RasterBaseMapSource,
} from "foss-earth/runtime";
import { readDeviceHints } from "foss-earth/mapDetailPolicy";
import { createPlaceholderAircraft } from "./aircraft/createPlaceholderAircraft";
import {
  getAircraftDefinition,
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
import { createGMeter } from "./hud/gMeter";
import { createGVisionOverlay } from "./hud/gVisionOverlay";
import type { LoggingAction, LoggingPanelState } from "./hud/LoggingPanel";
import { bindRecorderMarkHotkey, downloadCsv } from "./hud/loggingTab";
import { createEngineMonitor } from "./hud/engineMonitor";
import { toEngineStatus } from "./remote/engineStatus";
import { createCollisionDebugOverlay } from "./diagnostics/createCollisionDebugOverlay";
import { createForcesDebugOverlay } from "./diagnostics/createForcesDebugOverlay";
import { createWheelSpinDebugOverlay } from "./diagnostics/createWheelSpinDebugOverlay";
import { createWheelSpinExperiment } from "./physics/createWheelSpinExperiment";
import type { WheelSpinMode } from "./physics/wheelSpin";
import { createTireAudio } from "./audio/createTireAudio";
import { createFlightAudio } from "./audio/createFlightAudio";
import { AUDIO_PARAMETER_IDS, createAudioSettingsStore, readSoundTierLimits, SOUND_TIER_LIMIT_IDS } from "./audio/audioSettings";
import { createJsbsimAudioAdapter } from "./audio/jsbsimAudioAdapter";
import { getAircraftAudioInstallation, resolveAircraftAudioInstallation } from "./audio/aircraftAudioProfiles";
import { WHEEL_SPIN_CONFIGS } from "./physics/wheelSpin";
import { probeWheelContactCapability } from "./physics/wheelContact";
import { createSlipAudioSink, createWheelCueBus, type WheelCueResetReason } from "./feedback/wheelCueBus";
import { createGamepadHapticOutput, createHapticsController, readHapticTuning, type HapticOutput } from "./feedback/haptics";
import {
  createGroundSettingsStore,
  GROUND_CHOICE_LABELS,
  GROUND_BOUNDARY_KEYS,
  GROUND_PARAMETER_IDS,
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
  type FlightWeatherState,
} from "./hud/FlightControlPanel";
import { createFlightControlPanel } from "./hud/createFlightControlPanel";
import { createFlightHud, type FlightHudHandle, type FlightHudMasterAp } from "./hud/flightHud";
import { createFlightHudBar, type FlightHudBarHandle } from "./hud/createFlightHudBar";
import { createFlightStatusOverlay, type FlightStatusOverlayHandle } from "./hud/createFlightStatusOverlay";
import type { FlightStatusOverlayState } from "./hud/FlightStatusOverlay";
import { attachFlightCameraInput } from "./input/flightCameraInput";
import { applyFlightControls } from "./input/applyFlightControls";
import { automaticFlapCommand } from "./input/autoFlaps";
import { createAutoTrimState, readAutoTrimTuning, setAutoTrimEnabled, stepPitchAutoTrim, stepRollAutoTrim } from "./input/autoTrim";
import {
  AUTOPILOT_PARAMETER_IDS,
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
  PHONE_CAMERA_PARAMETER_IDS,
  readPhoneCameraTuning,
  type PhoneCameraTuning,
} from "./remote/phoneCameraTuning";
import { CONTROL_SHARING_PARAMETER_IDS, readControlSharing, type ControlSharing } from "./remote/controlSharing";
import { createControlBlend, type ControlBlend } from "./remote/controlBlend";
import type { MountPhonePairing } from "./hud/RemoteControlTab";
import { createFlightInputManager } from "./input/flightInputManager";
import {
  createFlightGamepadAdapter,
  createLegacyFlightProfile,
  createStandardFlightProfile,
} from "./input/gamepadToolsAdapter";
import { KEYBOARD_STICK_PARAMETER_IDS, readKeyboardStickSettings } from "./input/keyboardStickSettings";
import { createGamepadPollingController } from "./input/gamepadPolling";
import type { OrbitInvertSettings } from "foss-earth/input";
import { createJsbsimRuntime } from "./jsbsim/createJsbsimRuntime";
import { CONTROL_LAW_MODE_VALUES, getFdmProfile } from "./jsbsim/fdmProfiles";
import { createAircraftEngineVisuals } from "./aircraft/createAircraftEngineVisuals";
import { createFixedStepPhysicsLoop, FIXED_DT } from "./physics/fixedStepLoop";
import { ALERT_PILOT, readPilotG, stepPilot, type GVisionSettings, type PassOutSettings } from "./physics/gForce";
import { cameraAttitudeView } from "./hud/cameraAttitudeView";
import type { AttitudeView } from "./hud/attitudeIndicator";
import { createFlightLoadingScreen, type FlightLoadingScreen } from "../loading/createFlightLoadingScreen";
import {
  connectMapDetailLog,
  connectMapDetailRuntime,
  createAboutPanel,
  createGameLog,
  createMapDetailController,
  createMapSourcePanel,
  createParameterSection,
  createPresetsSection,
  createRendererPanel,
  createSavedSettingsSection,
  type GameLog,
  type GameLogLine,
  type MapDetailController,
  type PanelSection,
} from "foss-earth/shell";
import { createFlightDetailRequirements, importLegacyWorldDetail } from "./worldDetail";
import { appHref } from "../appRoute";
import { engineTestStandBootstrapOptions, engineTestStandInitialState, isEngineTestStandRequested, makeEngineTestStandUrl } from "./engineTestStand";

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

const RADIANS_PER_DEGREE = Math.PI / 180;
/** The Flight minimum's colour on the detail track and the HUD rail: the coarse end of the detail ramp. */
const FLIGHT_MINIMUM_COLOUR = "#ff6b6b";
/**
 * The phone sends a swipe in CSS pixels scaled by 1/1000, so this works out at
 * 0.005 rad per pixel — the same rate a mouse drag on the desktop canvas uses,
 * which is why a swipe there and a swipe on the phone feel like one gesture.
 */
const PHONE_SWIPE_RADIANS = 5;

function preferenceStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
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

/**
 * Commit the complete aircraft choice before a reload can activate it: all of
 * it is saved, or none of it, and a choice that would not survive the reload
 * is taken back.
 */
function writeAircraftSelection(parameters: FlightParameterStore, selection: AircraftSelection): string | null {
  const previous = readAircraftSelection(parameters);
  const result = parameters.setMany(aircraftSelectionValues(selection));
  if (!result.ok) return `Could not apply your aircraft choice: ${result.reason}`;
  if (parameters.storageError() === null) return null;
  parameters.setMany(aircraftSelectionValues(previous));
  return "Could not save your aircraft choice. The active aircraft is unchanged. Allow browser storage, then apply again.";
}

function zoomMetersFromAltitude(altMeters: number): number {
  return Math.max(250, Math.min(altMeters * 1.5, 12_000));
}

export async function createFlightSimApp(
  rootElement: HTMLElement,
  options: FlightSimAppOptions = {},
): Promise<FlightSimAppHandle> {
  const log = options.log ?? createGameLog();
  // One registry for the page: FOSS Earth's parameters and the flight's.
  const settings = getAppSettings();
  const parameters = registerFlightSettings(settings);
  const engineTest = isEngineTestStandRequested(window.location.search);
  const engineInitialState = engineTestStandInitialState(window.location.search);
  const benchBootstrap = engineTest ? engineTestStandBootstrapOptions(engineInitialState) : null;
  const stopWatching: (() => void)[] = [];
  const startLocation = () => ({ latDeg: parameters.get("osfs.start.latitude"), lonDeg: parameters.get("osfs.start.longitude") });
  const startHeightMeters = parameters.get("osfs.start.heightAboveGround");
  const loading = options.loadingScreen ?? createFlightLoadingScreen(log);
  loading.show();
  loading.setPhase("app", { state: "ready" });
  loading.setPhase("world", { state: "loading", detail: "Preparing the map renderer" });
  loading.setPhase("flight", { state: "loading", detail: "Loading flight physics" });
  // The last saved flight carries on where it was, unless resuming is off or
  // the page address chose a start position.
  const savedFlights = createSavedFlightStore(preferenceStorage());
  const addressedStart = (["osfs.start.latitude", "osfs.start.longitude"] as const)
    .some(id => settings.inspect(id).provenance === "url");
  const resumeFlight = !engineTest && parameters.get("osfs.start.resume") && !addressedStart ? savedFlights.read() : null;
  const spawn = benchBootstrap ? { latDeg: benchBootstrap.latDeg!, lonDeg: benchBootstrap.lonDeg! }
    : resumeFlight ? { latDeg: resumeFlight.latDeg, lonDeg: resumeFlight.lonDeg } : startLocation();
  if (resumeFlight) {
    log.print({ text: `Resuming the flight saved ${new Date(resumeFlight.savedAtMs).toLocaleString()}${resumeFlight.paused ? ", paused" : ""}` });
  }
  // Pause works from the first moment of loading. The flight's own input,
  // which needs the simulator, takes it over once it exists.
  const flightGamepadPolling = createGamepadPollingController(parameters);
  let startupPauseLine: GameLogLine | null = null;
  const startupPause = createStartupPause({
    paused: resumeFlight?.paused ?? false,
    shouldPoll: flightGamepadPolling.claimIdleFrame,
    onChange: paused => {
      const entry = { text: paused ? "The flight will start paused." : "The flight will start running." };
      if (startupPauseLine) startupPauseLine.update(entry);
      else startupPauseLine = log.print(entry);
    },
  });
  const mapConfig = resolveMapRuntimeConfig({
    googleApiKey: options.googleApiKey,
    baseMap: options.baseMap,
    preferGoogleTiles: options.preferGoogleTiles,
  });
  const initialAircraftSelection = readAircraftSelection(parameters);
  const initialAircraftId: AircraftId = initialAircraftSelection.aircraftId;
  // World detail's saved range, default and HUD rail belong to the shared
  // detail controller, created with the renderer. The flight keeps its low-
  // spawn hold: the osfs.flight.* parameters, and a marker on the Google track.
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
    const flightMinimum = parameters.get("osfs.flight.minimum");
    const needsFlightDetail = runtime.status.mode === "google-tiles"
      && !allowCoarserTerrain
      && distanceToTerrain < parameters.get("osfs.flight.holdBelow")
      && detail !== null
      && detail.errorTarget > flightMinimum;
    if (!needsFlightDetail || !detailRequirements) {
      detailRequirements?.supersede();
      return terrain;
    }

    // A low spawn needs the pilot's flight minimum. Hold Google mesh at least
    // that fine through preparation and the first moments of flight, without
    // touching the saved World detail; departure releases it.
    const lease = detailRequirements.begin(flightMinimum);
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
      <div class="flight-g-vision-root"></div>
      <div class="flight-hud-root"></div>
      <div class="flight-status-root"></div>
      <div class="flight-shell-root"></div>
      <div class="flight-panel-root"></div>
    </div>
  `;

  const canvas = rootElement.querySelector<HTMLCanvasElement>(".flight-app__canvas");
  const gVisionRoot = rootElement.querySelector<HTMLElement>(".flight-g-vision-root");
  const hudRoot = rootElement.querySelector<HTMLElement>(".flight-hud-root");
  const statusRoot = rootElement.querySelector<HTMLElement>(".flight-status-root");
  const shellRoot = rootElement.querySelector<HTMLElement>(".flight-shell-root");
  const panelRoot = rootElement.querySelector<HTMLElement>(".flight-panel-root");
  if (!canvas || !gVisionRoot || !hudRoot || !statusRoot || !shellRoot || !panelRoot) {
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
    rasterImagery: mapConfig.rasterImagery,
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
      flightMinimum: parameters.get("osfs.flight.minimum"),
    });
    if (imported === "retry") flightLog.warn("terrain", "World detail settings could not be saved; they apply until reload");
    detailRequirements = createFlightDetailRequirements(mapDetail, parameters);
    const disconnectDetailRuntime = connectMapDetailRuntime(mapDetail, runtime);
    const disconnectDetailLog = connectMapDetailLog(runtime, log);
    disconnectMapDetail = () => { disconnectDetailRuntime(); disconnectDetailLog(); };
    runtime.setSimRunning(false);
    runtime.setSimViewState({ ...spawn, zoomMeters: zoomMetersFromAltitude(resumeFlight?.aboveGroundMeters ?? startHeightMeters) });
    loading.setPhase("world", { state: "ready" });
    return runtime;
  });
  // Start local terrain selection as soon as the renderer exists. WASM and its
  // aircraft data are loading independently; no simulator work blocks this.
  const terrainReady = runtimePromise.then(runtime => prepareFlightTerrain(runtime, {
    ...(benchBootstrap
      ? { ...spawn, altitudeMeters: benchBootstrap.altFt! * 0.3048, clearanceMeters: 0 }
      : resumeFlight
      ? savedFlightTerrainRequest(resumeFlight)
      : { ...spawn, altitudeAboveGroundMeters: startHeightMeters, clearanceMeters: 1000 }),
    radiusMeters: 1000,
    signal: startupAbort.signal,
    onProgress: progress => loading.setPhase("terrain", {
      state: progress.phase === "ready" ? "ready" : "loading",
      detail: progress.message, terrain: progress,
    }),
  }));
  // The full readiness join happens after the visual assets have started too.
  void terrainReady.catch(() => {});
  // Each aircraft starts at its own profile's throttle unless the pilot chose one.
  settings.setHostDefault("osfs.start.throttle", getFdmProfile(initialAircraftId).initialThrottleNorm,
    `the ${initialAircraftId} profile`);
  settings.setHostDefault("osfs.start.airspeed",
    getFdmProfile(initialAircraftId).initialAirspeedKts ?? flightParameterSpec("osfs.start.airspeed").default,
    `the ${initialAircraftId} profile`);
  const jsbsimPromise = createJsbsimRuntime({
    dataBaseUrl: options.dataBaseUrl,
    aircraftId: initialAircraftId,
    bootstrap: benchBootstrap ?? {
      ...spawn,
      headingDeg: resumeFlight?.headingDeg ?? parameters.get("osfs.start.heading"),
      airspeedKts: parameters.get("osfs.start.airspeed"),
      throttleNorm: parameters.get("osfs.start.throttle"),
    },
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
    // Before the pilot's controls are made from the simulator's. A saved
    // flight that cannot be applied must not stop the flight from starting.
    if (resumeFlight) {
      try {
        applySavedControls(jsbsim.sdk, resumeFlight, initialAircraftId);
      } catch (error) {
        flightLog.warn("sim", "The saved flight's controls could not be applied", {
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
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
    startupPause.dispose();
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

  // Map → Detail: the Flight minimum is a red marker on the Google track, and
  // Allow coarser terrain a switch beside it that hollows the marker. While a
  // low spawn holds detail, the HUD rail shows the marker too.
  let flightMinimumOnRail = false;
  let removeFlightMinimumMarker: () => void = () => {};
  const showFlightMinimum = (): void => {
    if (!mapDetail) return;
    flightMinimumOnRail = detailRequirements?.isHeld() ?? false;
    removeFlightMinimumMarker = mapDetail.setTrackMarker({
      id: "osfs.flight.minimum",
      kind: "google",
      value: parameters.get("osfs.flight.minimum"),
      colour: FLIGHT_MINIMUM_COLOUR,
      label: "Flight minimum",
      ariaLabel: "Flight minimum",
      draggable: true,
      hollow: parameters.get("osfs.flight.allowCoarserThisSession"),
      requirement: true,
      onRail: flightMinimumOnRail,
      onChange: value => { parameters.set("osfs.flight.minimum", value); },
    });
  };
  showFlightMinimum();
  stopWatching.push(
    parameters.watch("osfs.flight.minimum", value => {
      // A held low-spawn requirement follows the edit at once; otherwise the
      // new minimum applies to the next preparation. The saved range is untouched.
      detailRequirements?.setRequirement(value);
      showFlightMinimum();
      runtime.requestRender();
    }),
    parameters.watch("osfs.flight.allowCoarserThisSession", allowed => {
      // The waiver ends any requirement a low spawn is holding.
      if (allowed) detailRequirements?.releaseAll();
      showFlightMinimum();
      runtime.requestRender();
    }),
  );

  let phoneSession: PhoneControlSession | null = null;
  let phonePairing: Promise<MountPhonePairing> | null = null;
  /** A phone flying together with this computer (Remote Control → Sharing the controls: Blend both). */
  let controlBlend: ControlBlend | null = null;
  const pausedAtStart = startupPause.isPaused();
  startupPause.dispose();
  const inputManager = createFlightInputManager({
    parameters,
    initialThrottle: jsbsim.sdk.getPropertyValue("fcs/throttle-cmd-norm"),
    initialGearDown: jsbsim.sdk.getPropertyValue("gear/gear-cmd-norm") > 0.5,
    initialPaused: pausedAtStart,
    rudderSign: getFdmProfile(initialAircraftId).rudderSign,
    onPausedChange: (paused) => syncSimulationPaused(paused),
    // The HUD's gear button follows the G key. Repainting here rather than
    // waiting for the next frame is what keeps the two in step while the
    // simulation is paused and the render loop is idle.
    onGearChange: (down) => { flightHud.setGearDown(down); runtime.requestRender(); },
    onLocalInput: () => phoneSession?.noteLocalInput(),
    keyboardStickSettings: readKeyboardStickSettings(parameters),
    getBodyRates: () => ({
      rollRateRad: jsbsim.sdk.getPropertyValue("velocities/p-rad_sec"),
      pitchRateRad: jsbsim.sdk.getPropertyValue("velocities/q-rad_sec"),
      yawRateRad: jsbsim.sdk.getPropertyValue("velocities/r-rad_sec"),
    }),
  });
  // Keep the aircraft's initialized trim when the input owner takes over. The
  // aircraft holds roll trim scaled by osfs.aircraft.rollTrimRange: the wheel's
  // position is the command over the range, or a resumed flight's trim would
  // shrink by the range at every reload.
  inputManager.replacePitchTrim(jsbsim.sdk.getPropertyValue("fcs/pitch-trim-cmd-norm"));
  const heldRollTrim = jsbsim.sdk.getPropertyValue("fcs/roll-trim-cmd-norm") / parameters.get("osfs.aircraft.rollTrimRange");
  inputManager.replaceRollTrim(Number.isFinite(heldRollTrim) ? Math.max(-1, Math.min(1, heldRollTrim)) : 0);
  // A resumed flight's flap lever starts where it was left.
  if (resumeFlight) {
    const flaps = jsbsim.sdk.getPropertyValue("fcs/flap-cmd-norm");
    if (Number.isFinite(flaps)) inputManager.replaceFlaps(flaps);
  }
  let appliedControls = inputManager.getControls();
  const readActualFlaps = (): number => {
    const flap = getFdmProfile(initialAircraftId).flapPosition;
    return jsbsim.sdk.getPropertyValue(flap.property) / flap.fullTravel;
  };
  let actualFlaps = readActualFlaps();
  let lastLocalFlapsRevision = inputManager.getFlapsInputRevision();
  let lastRemoteFlaps: number | null = null;
  let takingFlapsManually = false;
  const takeFlapsManually = (): void => {
    takingFlapsManually = true;
    try { parameters.set("osfs.assist.autoFlaps", false); }
    finally { takingFlapsManually = false; }
  };
  const noticeLocalFlaps = (): void => {
    const revision = inputManager.getFlapsInputRevision();
    if (revision === lastLocalFlapsRevision) return;
    lastLocalFlapsRevision = revision;
    takeFlapsManually();
  };
  const noticeRemoteFlaps = (value: number): void => {
    const previous = lastRemoteFlaps;
    lastRemoteFlaps = value;
    if (previous !== null && value !== previous) takeFlapsManually();
  };
  const detachInput = inputManager.attach(window);
  for (const id of KEYBOARD_STICK_PARAMETER_IDS) {
    stopWatching.push(parameters.watch(id, () => inputManager.setKeyboardStickSettings(readKeyboardStickSettings(parameters))));
  }
  const arcadeGroundLaunches = (): boolean => parameters.get("osfs.ground.arcadeLaunches");
  let pitchAutoTrim = createAutoTrimState(parameters.get("osfs.assist.autoTrim"));
  let rollAutoTrim = createAutoTrimState(parameters.get("osfs.assist.autoRollTrim"));
  // The HUD's TRIM squares and Aircraft → Assists edit the same parameters.
  stopWatching.push(
    parameters.watch("osfs.assist.autoTrim", enabled => { pitchAutoTrim = setAutoTrimEnabled(pitchAutoTrim, enabled); runtime.requestRender(); }),
    parameters.watch("osfs.assist.autoRollTrim", enabled => { rollAutoTrim = setAutoTrimEnabled(rollAutoTrim, enabled); runtime.requestRender(); }),
  );
  const ardupilotStatus = DISCONNECTED_ARDUPILOT_STATUS;
  const autopilotStore = createAutopilotSettingsStore(parameters);
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
  const autopilotBlockReason = () => engineTest ? "The engine test stand uses manual throttle." : autopilotEngageBlockReason(autopilotSettings, ardupilotStatus);
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
      stickOverride: parameters.get("osfs.autopilot.stickOverride"),
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
    if (engaged && parameters.get("osfs.assist.autoFlaps") && Number.isFinite(actualFlaps)) {
      inputManager.replaceFlaps(actualFlaps);
    }
    arbiterState = setArbiterEngaged(arbiterState, engaged);
    syncArbiter();
    runtime.requestRender();
  };
  // The Autopilot tab and its Show all parameters list edit the same parameters.
  const followAutopilotSettings = (): void => {
    if (autopilotSettings === autopilotStore.settings) return;
    autopilotSettings = autopilotStore.settings;
    if (autopilotBlockReason()) arbiterState = setArbiterEngaged(arbiterState, false);
    syncArbiter();
    controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
    runtime.requestRender();
  };
  for (const id of AUTOPILOT_PARAMETER_IDS) stopWatching.push(parameters.watch(id, followAutopilotSettings));
  const applyAutopilotSettings = (next: AutopilotSettingsV1): void => {
    autopilotStore.set(next);
    followAutopilotSettings();
  };
  // Ground interaction: persistent requests resolve to what can actually run.
  // The Debug A/B experiment is a session-only override layered on top.
  const groundStore = createGroundSettingsStore(parameters);
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
  let wheelSpinMode: WheelSpinMode | "off" = "off";
  let tireSoundEnabled = false;
  let hapticsActive = false;
  let acceptedWheelSteps = 0;
  let groundRevision = 0;
  const wheelSpin = createWheelSpinExperiment(jsbsim.sdk);
  // One sound owner for the engine and the tire cue: one context, one worklet,
  // one limiter, one set of holds (sound.md §2). Nothing is allocated until a
  // gesture asks for sound.
  const audioSettingsStore = createAudioSettingsStore(parameters);
  // Status can change before the panel exists (a restored tire cue arms its
  // unlock during startup), so refreshes wait until there is a panel to refresh.
  let audioPanelReady = false;
  const flightAudio = createFlightAudio({
    settings: audioSettingsStore,
    tierLimits: () => readSoundTierLimits(parameters),
    onStatusChange: () => {
      if (audioPanelReady) controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
    },
  });
  // The Sound tab's own controls go through flightAudio; Show all parameters
  // and imports change the parameters directly, and the sound follows.
  for (const id of [...AUDIO_PARAMETER_IDS, ...SOUND_TIER_LIMIT_IDS]) {
    stopWatching.push(parameters.watch(id, () => flightAudio.followSettings()));
  }
  // Beside each tier limit: what the running tier uses, and whether shedding lowered it.
  const TIER_NAMES = ["off", "low", "med", "high"];
  const RUNNING_FIELDS = {
    partials: "partials", noiseBands: "noiseBands", grains: "grains", grainStarts: "startsPerSecond", irMs: "irMilliseconds",
  } as const;
  for (const id of SOUND_TIER_LIMIT_IDS) {
    const [, , tier, field] = id.split(".") as [string, string, string, keyof typeof RUNNING_FIELDS];
    stopWatching.push(settings.setReadingSource(id, () => {
      const running = flightAudio.getStatus().running;
      if (!running || TIER_NAMES[running.tier] !== tier) return null;
      const value = running[RUNNING_FIELDS[field]];
      return running.shed > 0 ? `Running ${value}, shed ${running.shed} stages under load` : `Running ${value}`;
    }));
  }
  const audioInstallation = getAircraftAudioInstallation(initialAircraftId);
  if (audioInstallation) {
    try {
      const admitted = resolveAircraftAudioInstallation(audioInstallation);
      if (!admitted.supported) throw new Error(admitted.reason);
      flightAudio.attachAdapter(createJsbsimAudioAdapter(jsbsim.sdk, {
        gearHeightMetres: getFdmProfile(initialAircraftId).stance.staticMeters,
        source: admitted.source,
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
  const hapticTuning = () => readHapticTuning(parameters);
  const gamepadHaptics = createGamepadHapticOutput({
    getSelectedSlot: () => inputManager.getSelectedGamepadSlot(),
    onChange: () => haptics.cancel(),
    getTuning: hapticTuning,
  });
  const phoneHaptics: HapticOutput = {
    // Coarse on/off pulses: magnitude maps to pulse length, not intensity.
    play: envelope => phoneSession?.setHapticFeedback(Math.min(envelope.durationMs,
      Math.round(10 + 50 * Math.max(envelope.strong, envelope.weak)))),
    cancel: () => phoneSession?.setHapticFeedback(0),
  };
  const haptics = createHapticsController([gamepadHaptics, phoneHaptics], hapticTuning);
  wheelCues.subscribe(haptics);
  const resetWheelSpin = (reason: WheelCueResetReason = "reset"): void => {
    wheelSpin.reset();
    wheelCues.invalidate(reason);
    tireAudio.update(0);
  };
  let externalTankStepSeconds = 0;
  let gVisionStepSeconds = 0;
  const physicsLoop = createFixedStepPhysicsLoop(jsbsim.sdk, () => {
    externalTankStepSeconds += FIXED_DT;
    gVisionStepSeconds += FIXED_DT;
    // Ahead of the wheel guard: engine sound must not depend on a wheel experiment.
    flightAudio.publishStep();
    if (engineTest || wheelSpinMode === "off") return;
    wheelSpin.step(FIXED_DT, wheelSpinMode);
    acceptedWheelSteps += 1;
    wheelCues.publish(acceptedWheelSteps * FIXED_DT, FIXED_DT, wheelSpin.getStates());
  }, {
    getArcadeGroundLaunches: arcadeGroundLaunches,
  });
  const flightSurface = createFrameSurfaceQuery(runtime.surface);
  /** The terrain's height under the aircraft, which the HUD bar's altitude above ground is measured from; null while none has loaded there. */
  const groundHeightUnder = (state: FlightState): number | null =>
    runtime.surface.sample(state.latDeg, state.lonDeg)?.heightMeters ?? null;
  const terrainContact = createTerrainContact(jsbsim.sdk, flightSurface, getFdmProfile(initialAircraftId).stance);
  const visibleMeshCollision = createVisibleMeshCollision(jsbsim.sdk, flightSurface, {
    bodyProbes: getFdmProfile(initialAircraftId).bodyCollisionProbes,
    getRestitution: () => arcadeGroundLaunches() ? 1.35 : 0.25,
  });
  // This stays completely out of the normal render loop unless someone opts
  // in through the URL. It makes a stutter reproducible with numbers instead
  // of trying to infer its source from a single FPS reading.
  const flightPerformance = isFlightPerformanceCaptureEnabled()
    ? createFlightPerformanceCapture() : null;
  if (flightPerformance) setActiveFlightPerformanceCapture(flightPerformance);
  // Where each frame's time goes (Debug → Frame budget). The runtime owns the
  // profiler and closes each frame; the flight adds its sections. `flightPerf=1`
  // starts it on; otherwise it is off until the Debug tab switches it on. Off,
  // it leaves nothing attached to the scene.
  const frameProfile = runtime.frameProfile;
  const frameProfiler = frameProfile.profiler;
  const unbindFrameProfile = bindFrameProfileSettings(settings, frameProfile);
  const setFrameProfiling = (enabled: boolean): void => { settings.set(FRAME_PROFILING_IDS.enabled, enabled); };
  setActiveFrameProfile({
    profiler: frameProfiler,
    session: frameProfile,
    setEnabled: setFrameProfiling,
    gpuTimed: () => frameProfile.gpuTimed(),
  });
  if (flightPerformance) setFrameProfiling(true);
  // The same idea for the phone's camera trackpad (`phoneCameraTrace=1`): every
  // hop from the phone's touch to the orbit drawn here, with both clocks.
  const phoneCameraTrace = isPhoneCameraTraceEnabled()
    ? createPhoneCameraTrace({
      getSettings: () => ({ recenterMode: orbitInvert().recenterMode, phoneSwipeRadians: PHONE_SWIPE_RADIANS, tuning: { ...phoneCameraTuning } }),
    }) : null;
  if (phoneCameraTrace) setActivePhoneCameraTrace(phoneCameraTrace);
  const vtolProfile = getFdmProfile(initialAircraftId).stovl;
  const aircraftPresentation = getAircraftDefinition(initialAircraftId);
  const afterburnerProfile = aircraftPresentation.afterburner;
  const readExhaustSettings = () => ({
    enabled: parameters.get("osfs.exhaust.enabled"),
    sampleCount: parameters.get("osfs.exhaust.sampleCount"),
    axialFieldSamples: parameters.get("osfs.exhaust.axialFieldSamples"),
    radialFieldSamples: parameters.get("osfs.exhaust.radialFieldSamples"),
    depthOcclusionEnabled: parameters.get("osfs.exhaust.depthOcclusionEnabled"),
    depthResolutionScale: parameters.get("osfs.exhaust.depthResolutionScale"),
    maxDistanceMeters: parameters.get("osfs.exhaust.maxDistanceMeters"),
    intensity: parameters.get("osfs.exhaust.intensity"),
    dryIntensity: parameters.get("osfs.exhaust.dryIntensity"),
    contributionView: parameters.get("osfs.exhaust.contributionView"),
    gasReferenceNits: parameters.get("osfs.exhaust.gasReferenceNits"),
    surfaceReferenceNits: parameters.get("osfs.exhaust.surfaceReferenceNits"),
    lightEnabled: parameters.get("osfs.exhaust.light.enabled"),
    lightGain: parameters.get("osfs.exhaust.light.gain"),
    lightRangeMeters: parameters.get("osfs.exhaust.light.rangeMeters"),
  });
  const engineVisuals = createAircraftEngineVisuals(jsbsim.sdk, runtime.scene, aircraftPresentation, {
    settings: readExhaustSettings(), requestRender: () => runtime.requestRender(),
    smokeSettings: readSmokeSettings(),
    getWorldFromEcef: () => floatingOrigin?.getWorldFromEcef() ?? null,
    onError: message => flightLog.warn("aircraft", message),
  });
  stopWatching.push(() => engineVisuals.dispose());
  for (const id of ["osfs.exhaust.enabled", "osfs.exhaust.sampleCount", "osfs.exhaust.maxDistanceMeters", "osfs.exhaust.intensity", "osfs.exhaust.surfaceReferenceNits",
    "osfs.exhaust.dryIntensity", "osfs.exhaust.axialFieldSamples", "osfs.exhaust.radialFieldSamples",
    "osfs.exhaust.depthOcclusionEnabled", "osfs.exhaust.depthResolutionScale",
    "osfs.exhaust.contributionView", "osfs.exhaust.gasReferenceNits",
    "osfs.exhaust.light.enabled", "osfs.exhaust.light.gain", "osfs.exhaust.light.rangeMeters"] as const) {
    stopWatching.push(parameters.watch(id, () => engineVisuals.setSettings(readExhaustSettings())));
  }
  function readSmokeSettings() {
    return {
      enabled: parameters.get("osfs.exhaust.smoke.enabled"),
      maxParticles: parameters.get("osfs.exhaust.smoke.maxParticles"),
      emissionPerSecond: parameters.get("osfs.exhaust.smoke.emissionPerSecond"),
      lifetimeSeconds: parameters.get("osfs.exhaust.smoke.lifetimeSeconds"),
      maxDistanceMeters: parameters.get("osfs.exhaust.smoke.maxDistanceMeters"),
      opacity: parameters.get("osfs.exhaust.smoke.opacity"),
    };
  }
  for (const id of ["osfs.exhaust.smoke.enabled", "osfs.exhaust.smoke.maxParticles", "osfs.exhaust.smoke.emissionPerSecond",
    "osfs.exhaust.smoke.lifetimeSeconds", "osfs.exhaust.smoke.maxDistanceMeters", "osfs.exhaust.smoke.opacity"] as const) {
    stopWatching.push(parameters.watch(id, () => engineVisuals.setSmokeSettings(readSmokeSettings())));
  }
  const controlLawProfile = getFdmProfile(initialAircraftId).controlLaw;
  const followControlLaw = (): void => {
    if (!controlLawProfile) return;
    const mode = parameters.get("osfs.aircraft.controlLaw");
    jsbsim.sdk.setPropertyValue(controlLawProfile.commandProperty, CONTROL_LAW_MODE_VALUES[mode]);
  };
  followControlLaw();
  if (controlLawProfile) {
    stopWatching.push(parameters.watch("osfs.aircraft.controlLaw", () => {
      followControlLaw();
      runtime.requestRender();
    }));
    stopWatching.push(settings.setReadingSource("osfs.aircraft.controlLaw", () => {
      const enabled = jsbsim.sdk.getPropertyValue(controlLawProfile.enabledProperty) > 0.5;
      return `Active: ${enabled ? "Fly-by-wire" : "Manual"}${parameters.get("osfs.aircraft.controlLaw") === "auto" ? " (aircraft default)" : ""}`;
    }));
  }
  // The throttle lever starts and stops the engine, on this screen and the phone's.
  const engineControl = createEngineControl(jsbsim.sdk, getFdmProfile(initialAircraftId));
  let localStartHeld = false;
  const flightHud: FlightHudHandle = createFlightHud(hudRoot, {
    onGearChange: (down) => { inputManager.setGearDown(down); runtime.requestRender(); },
    onThrottleChange: (value) => { inputManager.setThrottle(value); runtime.requestRender(); },
    engine: {
      getReading: () => engineControl.reading(),
      // Holding the lever is pilot input, like moving it: it takes the controls back from a phone.
      onStartHold: (held) => {
        if (held) phoneSession?.noteLocalInput();
        localStartHeld = held;
      },
      onShutdown: () => {
        phoneSession?.noteLocalInput();
        engineControl.shutdown();
      },
    },
    afterburner: afterburnerProfile ? {
      accentColor: afterburnerProfile.accentColor,
      getActive: engineVisuals.afterburnerActive,
    } : undefined,
    vtolConversion: vtolProfile ? {
      getCommandNorm: () => parameters.get("osfs.aircraft.stovlConversion"),
      getPositionNorm: () => {
        try { return jsbsim.sdk.getPropertyValue(vtolProfile.positionProperty); }
        catch { return Number.NaN; }
      },
      onCommandChange: value => { parameters.set("osfs.aircraft.stovlConversion", value); },
    } : undefined,
    onPitchTrimChange: (value) => { inputManager.setPitchTrim(value); runtime.requestRender(); },
    onRollTrimChange: (value) => { inputManager.setRollTrim(value); runtime.requestRender(); },
    onPitchAutoTrimChange: (enabled) => { parameters.set("osfs.assist.autoTrim", enabled); },
    onRollAutoTrimChange: (enabled) => { parameters.set("osfs.assist.autoRollTrim", enabled); },
    onAutopilotEngageChange: (engaged) => { setAutopilotEngaged(engaged); },
    onFlapsChange: (value) => { inputManager.setFlaps(value); noticeLocalFlaps(); runtime.requestRender(); },
    flapAutomation: {
      getEnabled: () => parameters.get("osfs.assist.autoFlaps"),
      onEnabledChange: enabled => { parameters.set("osfs.assist.autoFlaps", enabled); },
      getPositionNorm: () => actualFlaps,
      minPositionNorm: getFdmProfile(initialAircraftId).flapPosition.minNorm,
    },
    onRudderChange: (value) => { inputManager.setRudder(value); runtime.requestRender(); },
    onStickChange: (aileron, elevator) => { inputManager.setStick(aileron, elevator); runtime.requestRender(); },
    pitchAutoTrim: pitchAutoTrim.enabled,
    rollAutoTrim: rollAutoTrim.enabled,
    autopilotEngaged: lastApResult.engaged,
    // Babylon keeps its device on an internal field. Sharing it puts the
    // instrument on the globe's queue instead of opening a second device.
    gpuDevice: runtime.renderer.mode === "webgpu" ? (runtime.renderer.engine as WebGPUEngine)._device : null,
    attitudeRenderer: parameters.get("osfs.renderer.attitudeIndicator"),
    onAttitudeStatus: status => {
      // What actually draws, under the choice in Renderer → Instruments.
      settings.setNote("osfs.renderer.attitudeIndicator", describeAttitudeRendererStatus(status));
      if (!status.backend) return;
      flightLog.info("hud", `Attitude indicator draws with ${status.backend === "webgpu" ? "WebGPU" : "Canvas 2D"}`,
        { preference: status.preference, renderer: runtime.renderer.mode, ...(status.reason ? { reason: status.reason } : {}) });
    },
    profiler: frameProfiler,
  });
  stopWatching.push(parameters.watch("osfs.renderer.attitudeIndicator", preference => {
    flightHud.setAttitudeRenderer(preference);
    runtime.requestRender();
  }));
  /** Renderer → Instruments → Attitude indicator view: the 3D camera's frame, or null for the aircraft's. */
  const attitudeView = (): AttitudeView | null => (
    parameters.get("osfs.renderer.attitudeView") === "camera" ? cameraAttitudeView(runtime.scene.activeCamera) : null
  );
  stopWatching.push(parameters.watch("osfs.renderer.attitudeView", () => runtime.requestRender()));
  if (vtolProfile) stopWatching.push(parameters.watch("osfs.aircraft.stovlConversion", () => {
    flightHud.refreshVtolConversion();
    runtime.requestRender();
  }));
  const syncNativeAutoFlaps = (): void => {
    const auto = getFdmProfile(initialAircraftId).automaticFlaps;
    if (auto.kind === "native") jsbsim.sdk.setPropertyValue(auto.commandProperty,
      Number(parameters.get("osfs.assist.autoFlaps") && lastApResult.owners.flaps === "pilot"));
  };
  syncNativeAutoFlaps();
  stopWatching.push(parameters.watch("osfs.assist.autoFlaps", enabled => {
    if (!enabled && !takingFlapsManually && Number.isFinite(actualFlaps)) {
      inputManager.replaceFlaps(actualFlaps);
    }
    syncNativeAutoFlaps();
    flightHud.refreshFlaps();
    runtime.requestRender();
  }));

  let floatingOrigin: FloatingOriginHandle | null = null;
  // Map → Detail can load the ground around the aircraft, so that turning the
  // chase camera loads nothing new. The floating origin is the aircraft.
  stopWatching.push(runtime.registerFocusPoint({
    id: AIRCRAFT_FOCUS_POINT,
    label: "Aircraft",
    getPosition: () => floatingOrigin?.getOriginEcef() ?? null,
  }));
  let aircraft: ReturnType<typeof createPlaceholderAircraft> | null = null;
  let aircraftModel: AircraftModelHandle | null = null;
  let externalTankVisuals: ReturnType<typeof createExternalTankVisuals> | null = null;
  stopWatching.push(parameters.watch("osfs.externalTanks.debrisLifetimeSeconds", seconds => {
    externalTankVisuals?.setLifetimeSeconds(seconds);
  }));
  stopWatching.push(parameters.watch("osfs.externalTanks.maxDetachedTanks", count => {
    externalTankVisuals?.setMaxDetachedTanks(count);
  }));
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
  // G-forces: the load at the pilot's seat is read once a frame, for the
  // indicator, for the vignettes it closes over the view and for the pilot
  // passing out. All of it is DOM, so none of it asks the globe for a frame.
  const gMeter = createGMeter(hudRoot.querySelector<HTMLElement>(".flight-hud__g") ?? hudRoot, {
    onToggleTab: () => controlPanel?.toggleTab("gforces"),
  });
  const gVisionOverlay = createGVisionOverlay(gVisionRoot);
  const readGVisionSettings = (): GVisionSettings => ({
    blackout: parameters.get("osfs.gForce.blackoutRange"),
    redout: parameters.get("osfs.gForce.redoutRange"),
    onsetSeconds: parameters.get("osfs.gForce.onsetTime"),
    recoverySeconds: parameters.get("osfs.gForce.recoveryTime"),
  });
  const readPassOutSettings = (): PassOutSettings | null => parameters.get("osfs.gForce.passOut") ? {
    meanSeconds: parameters.get("osfs.gForce.unconsciousTime"),
    spreadSeconds: parameters.get("osfs.gForce.unconsciousSpread"),
  } : null;
  let gIndicatorShown = parameters.get("osfs.gForce.indicator");
  let gVisionEnabled = parameters.get("osfs.gForce.vision");
  let gVisionSettings = readGVisionSettings();
  let passOutSettings = readPassOutSettings();
  let pilot = ALERT_PILOT;
  const pilotOut = (): boolean => pilot.secondsOut > 0;
  const showGVision = (): void => {
    // A pilot who is out sees nothing, in every view and at any strength.
    if (pilotOut()) { gVisionOverlay.show(1, 0); return; }
    const drawn = gVisionEnabled
      && (parameters.get("osfs.gForce.visionViews") === "all" || aircraft?.getViewMode() === "first");
    const strength = drawn ? parameters.get("osfs.gForce.visionStrength") : 0;
    gVisionOverlay.show(pilot.vision.blackout * strength, pilot.vision.redout * strength);
  };
  const clearGVision = (): void => {
    pilot = ALERT_PILOT;
    gVisionStepSeconds = 0;
    showGVision();
  };
  const coverGVision = (): void => gVisionOverlay.cover(parameters.get("osfs.gForce.visionLayer") === "everything");
  gMeter.setVisible(gIndicatorShown);
  coverGVision();
  stopWatching.push(
    parameters.watch("osfs.gForce.indicator", shown => {
      gIndicatorShown = shown;
      gMeter.setVisible(shown);
      if (shown) gMeter.update(readPilotG(jsbsim.sdk));
    }),
    // Off forgets the load so far: sight is clear when it is turned on again.
    // The load is still followed while passing out is on, to pass out by.
    parameters.watch("osfs.gForce.vision", enabled => {
      gVisionEnabled = enabled;
      if (!enabled && !passOutSettings) clearGVision();
      else showGVision();
    }),
    parameters.watch("osfs.gForce.passOut", () => {
      passOutSettings = readPassOutSettings();
      if (passOutSettings) return;
      // Off wakes a pilot who is out, with their sight coming back from black.
      if (pilotOut()) flightLog.info("pilot", "Pilot came to: passing out was turned off");
      pilot = { vision: pilot.vision, secondsOut: 0 };
      if (gVisionEnabled) showGVision();
      else clearGVision();
    }),
    parameters.watch("osfs.gForce.visionLayer", coverGVision),
  );
  for (const id of ["osfs.gForce.unconsciousTime", "osfs.gForce.unconsciousSpread"] as const) {
    stopWatching.push(parameters.watch(id, () => { passOutSettings = readPassOutSettings(); }));
  }
  for (const id of ["osfs.gForce.blackoutRange", "osfs.gForce.redoutRange", "osfs.gForce.onsetTime",
    "osfs.gForce.recoveryTime", "osfs.gForce.visionStrength", "osfs.gForce.visionViews"] as const) {
    stopWatching.push(parameters.watch(id, () => { gVisionSettings = readGVisionSettings(); showGVision(); }));
  }
  const engineMonitor = createEngineMonitor(
    hudRoot.querySelector<HTMLElement>(".flight-hud__engine") ?? hudRoot,
    {
      definition: {
        kind: getFdmProfile(initialAircraftId).engine, maxRpm: getFdmProfile(initialAircraftId).maxEngineRpm,
        rotorBlades: getFdmProfile(initialAircraftId).rotorBlades,
      },
      gpuDevice: runtime.renderer.mode === "webgpu" ? (runtime.renderer.engine as WebGPUEngine)._device : null,
      onOrbStatus: status => settings.setNote("osfs.renderer.engineOrbs", status.backend
        ? `Drawing with ${status.backend}.${status.reason ? ` ${status.reason}` : ""}` : "Preparing shaft indicators…"),
      soundStatus: () => flightAudio.getStatus(),
      afterburner: afterburnerProfile ? {
        accentColor: afterburnerProfile.accentColor,
        getActive: engineVisuals.afterburnerActive,
      } : undefined,
      parameters,
      testStand: {
        active: engineTest,
        description: getAircraftDefinition(initialAircraftId).engineAssets
          ? "Complete engine reconstruction on Earth at MSP runway 35; move it using Location. Use THR, VTOL and the normal start/stop control. Gas, core-facing metal and cooled nozzle histories use simulation time. Geometry and thermal coefficients are provisional."
          : getAircraftDefinition(initialAircraftId).engineTestNodeNames?.length
          ? "Stationary native engine test with the declared nozzle assembly isolated on Earth. Starts at MSP runway 35; move it using Location. The asset has no complete engine casing or internal turbine model. Use THR, VTOL and the normal start/stop control; plots below record simulation time."
          : "Stationary native engine test on Earth, starting at MSP runway 35. Move it using Location. This aircraft has no declared isolated engine geometry; the stand shows readings without an aircraft mesh.",
        onChange: active => {
          saveFlight();
          window.location.assign(makeEngineTestStandUrl(new URL(window.location.href), active).href);
        },
        initialization: { state: engineInitialState, onStart: state => {
          saveFlight();
          const next = makeEngineTestStandUrl(new URL(window.location.href), true, state);
          if (next.href === window.location.href) window.location.reload();
          else window.location.assign(next.href);
        } },
      },
      onOpen: () => controlPanel?.openOrSelectTab("engine"),
    },
  );
  // Session-only debug opt-in: no overlay meshes or SDK reads until enabled.
  let collisionDebugEnabled = false;
  let collisionDebugOverlay: ReturnType<typeof createCollisionDebugOverlay> | null = null;
  let wheelSpinDebugOverlay: ReturnType<typeof createWheelSpinDebugOverlay> | null = null;
  let forcesDebugOverlay: ReturnType<typeof createForcesDebugOverlay> | null = null;
  const meshInspector = createMeshInspector(runtime.scene, { requestRender: () => runtime.requestRender() });
  meshInspector.setEnabled(parameters.get("osfs.aircraft.wireframe"));
  stopWatching.push(parameters.watch("osfs.aircraft.wireframe", enabled => meshInspector.setEnabled(enabled)));
  const readForcesSettings = () => ({
    enabled: parameters.get("osfs.forces.enabled"),
    newtonsPerMeter: parameters.get("osfs.forces.newtonsPerMeter"),
    maxArrowMeters: parameters.get("osfs.forces.maxArrowMeters"),
    labels: parameters.get("osfs.forces.labels"),
    labelRefreshHz: parameters.get("osfs.forces.labelRefreshHz"),
    controlSurfaces: parameters.get("osfs.forces.controlSurfaces"),
    newtonMetersPerDegree: parameters.get("osfs.forces.newtonMetersPerDegree"),
    arcRadiusMeters: parameters.get("osfs.forces.arcRadiusMeters"),
    maxArcDegrees: parameters.get("osfs.forces.maxArcDegrees"),
  });
  const syncForcesDebugOverlay = (): void => {
    const settings = readForcesSettings();
    if (!forcesDebugOverlay && aircraft && settings.enabled) {
      forcesDebugOverlay = createForcesDebugOverlay(runtime.scene, aircraft.root, jsbsim.sdk, {
        settings,
        engineLabels: getFdmProfile(initialAircraftId).forceEngineLabels,
        controlSurfaces: getFdmProfile(initialAircraftId).forceControlSurfaces,
        requestRender: () => runtime.requestRender(),
        onUnavailable: message => flightLog.warn("forces", message),
      });
    } else forcesDebugOverlay?.setSettings(settings);
  };
  for (const id of ["osfs.forces.enabled", "osfs.forces.newtonsPerMeter", "osfs.forces.maxArrowMeters",
    "osfs.forces.labels", "osfs.forces.labelRefreshHz", "osfs.forces.controlSurfaces", "osfs.forces.newtonMetersPerDegree",
    "osfs.forces.arcRadiusMeters", "osfs.forces.maxArcDegrees"] as const) {
    stopWatching.push(parameters.watch(id, syncForcesDebugOverlay));
  }
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
  // Show all parameters and imports change the ground parameters directly:
  // apply them the way the section's own controls are applied.
  const followGroundSettings = (): void => {
    if (inputManager.isPaused() || worldLoading) applyGroundBoundary();
    else applyGroundRuntime();
    controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
  };
  for (const id of GROUND_PARAMETER_IDS) stopWatching.push(parameters.watch(id, followGroundSettings));
  const aircraftId: AircraftId = initialAircraftId;
  let aircraftLodId: AircraftLodId = initialAircraftSelection.lodId;
  let aircraftGenerationId: string = initialAircraftSelection.generationId ?? getAircraftFamilyForAircraft(aircraftId).variants[0]?.id ?? "cessna-172";
  // The model and its detail change live, from the chooser or Show all
  // parameters; another aircraft loads on the next start.
  const followAircraftPresentation = (): void => {
    const next = readAircraftSelection(parameters);
    if (next.aircraftId !== aircraftId) return;
    const generationId = next.generationId ?? aircraftGenerationId;
    if (next.lodId === aircraftLodId && generationId === aircraftGenerationId) return;
    aircraftLodId = next.lodId;
    aircraftGenerationId = generationId;
    // The model asks for its own frames, and only when what it shows changes.
    aircraftModel?.setLod(next.lodId);
    if (aircraftModel) modelState = aircraftModel.getState();
    controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
  };
  for (const id of AIRCRAFT_SELECTION_PARAMETER_IDS) stopWatching.push(parameters.watch(id, followAircraftPresentation));
  let aircraftReloadRequested = false;
  let modelState: AircraftModelState = {
    aircraftId, lodId: aircraftLodId, activeLodId: null,
    status: "placeholder", triangles: null, error: null, download: null,
  };
  let hudBar: FlightHudBarHandle | null = null;
  let statusOverlay: FlightStatusOverlayHandle | null = null;
  // A missing terrain sample stops the loop from stepping without raising a
  // fault, so track how long that has been true to tell a stall from a hitch.
  let terrainBlockedSinceMs: number | null = null;
  let terrainBlockedReason: ReturnType<typeof terrainContact.getBlockReason> = null;
  let inputMode = loadInputModePreference(new Set(["mouse", "trackpad"]));
  let inputSensitivity = loadInputSensitivityPreference();
  // FOSS Earth's orbit inversion, shared with the globe's camera.
  const orbitInvert = (): OrbitInvertSettings => ({
    invertYaw: settings.get<boolean>("input.orbit.invertYaw"),
    invertPitch: settings.get<boolean>("input.orbit.invertPitch"),
    recenterMode: settings.get<OrbitInvertSettings["recenterMode"]>("input.orbit.recenterMode"),
  });
  // The chase camera's orbit, in radians, from the osfs.camera.* parameters.
  const orbitPitchLimits = (): { min: number; max: number } => {
    const limits = parameters.get("osfs.camera.orbitPitchLimits");
    return { min: limits.min * RADIANS_PER_DEGREE, max: limits.max * RADIANS_PER_DEGREE };
  };
  const orbitRestoreYaw = (): number => parameters.get("osfs.camera.orbitRestoreYaw") * RADIANS_PER_DEGREE;
  const orbitRestorePitch = (): number =>
    Math.atan2(parameters.get("osfs.camera.chaseHeight"), parameters.get("osfs.camera.chaseDistance"));
  // The phone trackpad's A/B settings (Remote Control tab). Read live by the
  // phone session and each frame, so a change is felt on the next swipe.
  let phoneCameraTuning: PhoneCameraTuning = readPhoneCameraTuning(parameters);
  let phoneCameraVariant = describePhoneCameraTuning(phoneCameraTuning);
  for (const id of PHONE_CAMERA_PARAMETER_IDS) {
    stopWatching.push(parameters.watch(id, () => {
      phoneCameraTuning = readPhoneCameraTuning(parameters);
      phoneCameraVariant = describePhoneCameraTuning(phoneCameraTuning);
      runtime.requestRender();
    }));
  }
  // Who flies when a paired phone and this computer both could (Remote Control
  // tab). Read live by the phone session at every decision.
  let controlSharing: ControlSharing = readControlSharing(parameters);
  for (const id of CONTROL_SHARING_PARAMETER_IDS) {
    stopWatching.push(parameters.watch(id, () => { controlSharing = readControlSharing(parameters); }));
  }
  let chaseFrameApplied: PhoneCameraTuning["chaseFrame"] = "attitude";
  let orbitStateYaw = orbitRestoreYaw();
  let orbitStatePitch = orbitRestorePitch();
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
    const limits = orbitPitchLimits();
    orbitStatePitch = clamp(orbitStatePitch + pitch, limits.min, limits.max);
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
      const inversion = orbitInvert();
      applyOrbitDelta(
        aim.yaw * PHONE_SWIPE_RADIANS * (inversion.invertYaw ? -1 : 1),
        aim.pitch * PHONE_SWIPE_RADIANS * (inversion.invertPitch ? -1 : 1),
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
    if (orbitInvert().recenterMode !== "recenter") return;
    if (isOrbitInputActive()) return;
    const targetYaw = orbitRestoreYaw();
    const targetPitch = orbitRestorePitch();
    const deltaYaw = -normalizeAngle(orbitStateYaw - targetYaw);
    const deltaPitch = targetPitch - orbitStatePitch;
    if (Math.abs(deltaYaw) <= 0.00005 && Math.abs(deltaPitch) <= 0.00005) return;
    const returnSeconds = parameters.get("osfs.camera.orbitReturnTime");
    const nextYaw = approach(orbitStateYaw, targetYaw, deltaSeconds, returnSeconds);
    const nextPitch = approach(orbitStatePitch, targetPitch, deltaSeconds, returnSeconds);
    applyOrbitDelta(nextYaw - orbitStateYaw, nextPitch - orbitStatePitch);
  };
  const detachCameraInput = attachFlightCameraInput(canvas, {
    getMode: () => inputMode,
    getSensitivity: () => inputSensitivity,
    getOrbitInvert: orbitInvert,
    orbit: (yaw, pitch) => {
      applyOrbitDelta(yaw, pitch);
    },
    onOrbitActive: (active) => setOrbitInputActive("manual", active),
    zoom: applyCameraZoom,
    getTouchWheelCooldownMs: () => parameters.get("osfs.input.touchWheelCooldown"),
  });
  let skipResumeDelta = false;
  let disposed = false;
  let lastPanelUpdateMs = 0;
  let fpsSampleStartedMs = performance.now();
  let fpsSampleFrames = 0;
  let measuredFps: number | null = null;
  const weather: FlightWeatherState = { windDirectionDeg: 0, windSpeedKts: 0 };

  loading.setPhase("assets", { state: "loading", detail: "Loading your aircraft" });
  // The placeholder blocks stand in only when there is no mesh to show: none
  // exists for the airframe, or it failed to load. While a chosen mesh loads
  // nothing stands in, and the log carries its progress.
  let blocksStandIn: boolean | null = null;
  const onModelState = (state: AircraftModelState): void => {
    modelState = state;
    const standIn = state.status === "placeholder" || state.status === "error";
    if (standIn !== blocksStandIn) {
      blocksStandIn = standIn;
      aircraft?.setModelLoaded(engineTest || !standIn);
      runtime.requestRender();
    }
    const download = state.download;
    if (state.status === "loading" && download?.chosen) {
      const label = getAircraftDefinition(state.aircraftId).lods.find(lod => lod.id === download.lodId)?.label ?? download.lodId;
      const megabytes = (bytes: number) => (bytes / 1_000_000).toFixed(1);
      loading.setPhase("assets", {
        state: "loading",
        detail: download.total ? `Loading ${label}, ${megabytes(download.loaded)} of ${megabytes(download.total)} MB` : `Loading ${label}`,
        progress: download.total ? download.loaded / download.total : null,
      });
    } else if (state.status === "ready") {
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
    const definition = getAircraftDefinition(aircraftId);
    aircraft = createPlaceholderAircraft(runtime.scene, floatingOrigin.aircraftRoot, parameters, {
      cockpitOffset: definition.cockpitOffset,
      showModelInCockpit: definition.cockpitMesh,
      ...(engineTest ? {
        chaseTargetOffset: definition.engineTestFocusOffset,
        chaseDistanceMeters: parameters.get("osfs.engineTest.viewDistanceMeters"),
        chaseZoomLimits: () => parameters.get("osfs.engineTest.zoomLimits"),
      } : {}),
    });
    if (engineTest) aircraft.setModelLoaded(true);
    aircraft.setViewMode("third");
    const externalTanks = getExternalTankDefinitions(aircraftId);
    if (!engineTest && externalTanks.length > 0) {
      externalTankVisuals = createExternalTankVisuals(runtime.scene, aircraft.modelRoot, externalTanks, {
        requestRender: () => runtime.requestRender(),
        getWorldFromEcef: () => floatingOrigin?.getWorldFromEcef() ?? null,
        lifetimeSeconds: parameters.get("osfs.externalTanks.debrisLifetimeSeconds"),
        maxDetachedTanks: parameters.get("osfs.externalTanks.maxDetachedTanks"),
      });
      externalTankVisuals.sync(readExternalFuelTanks(jsbsim.sdk, aircraftId));
      void externalTankVisuals.ready.catch((error: unknown) => {
        if (!disposed) flightLog.warn("aircraft", "External tank models could not be prepared", {
          reason: error instanceof Error ? error.message : String(error),
        });
      });
    }
    const limits = orbitPitchLimits();
    orbitStateYaw = orbitRestoreYaw();
    orbitStatePitch = engineTest ? orbitRestorePitch() : Math.asin(
      clamp(aircraft.thirdPersonCamera.position.y / aircraft.thirdPersonCamera.position.length(), limits.min, limits.max),
    );
    syncCollisionDebugOverlay();
    aircraftModel = createAircraftModel(runtime.scene, aircraft.modelRoot, {
      aircraftId,
      lodId: aircraftLodId,
      renderStowedGear: parameters.get("osfs.debug.renderStowedGear"),
      engineOnly: engineTest,
      onMeshRootsChange: roots => meshInspector.setRoots(roots),
      getChaseDistanceMeters: () => aircraft?.getChaseDistanceMeters() ?? 0,
      onStateChange: (state) => {
        onModelState(state);
        if (controlPanel) controlPanel.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
      },
      requestRender: () => runtime.requestRender(),
    });
    aircraftModel.updateGearVisibility(readControlSurfaceState(jsbsim.sdk, aircraftId).gearDownNorm);
    syncForcesDebugOverlay();

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

  stopWatching.push(parameters.watch("osfs.debug.renderStowedGear", enabled => {
    aircraftModel?.setRenderStowedGear(enabled);
  }));

  stopWatching.push(parameters.watch("osfs.camera.fieldOfView", degrees => {
    aircraft?.setFieldOfView(degrees);
    runtime.requestRender();
  }));
  stopWatching.push(parameters.watch("osfs.camera.nearClipMeters", meters => {
    aircraft?.setNearClipMeters(meters);
    runtime.requestRender();
  }));

  const toggleCameraView = (): void => {
    if (engineTest) return;
    aircraft?.toggleViewMode();
    runtime.requestRender();
  };

  const onViewKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "KeyV" || event.repeat) return;
    if (controlTakesKey(event.target, event.key)) return;
    if (inputManager.isBindingCaptureActive() || inputManager.isGamepadToolsActive()) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    toggleCameraView();
    phoneSession?.syncStatus();
  };

  // Capture, like the flight keys, so a Ctrl chord with V is not handed on by
  // an embedding browser's own window listener.
  window.addEventListener("keydown", onViewKeyDown, { capture: true });

  const flightGamepadSource = createBrowserInputSource({ target: window });
  const flightGamepadResponse = inputManager.getGamepadResponseController();
  const flightGamepadRuntime = new BindingRuntime({
    defaultAxisDeadzone: parameters.get("osfs.input.stickDeadzone"),
    getAxisDeadzoneMode: () => flightGamepadResponse.getSettings().deadzoneMode,
    adapter: createFlightGamepadAdapter(inputManager, {
      onViewToggle: () => {
        toggleCameraView();
        phoneSession?.syncStatus();
      },
      onCameraOrbitActive: (active) => setOrbitInputActive("gamepad", active),
      onCameraOrbit: (yaw, pitch, dt) => {
        const inversion = orbitInvert();
        applyOrbitDelta(
          yaw * dt * parameters.get("osfs.camera.gamepadOrbitYawRate") * RADIANS_PER_DEGREE * (inversion.invertYaw ? -1 : 1),
          pitch * dt * parameters.get("osfs.camera.gamepadOrbitPitchRate") * RADIANS_PER_DEGREE * (inversion.invertPitch ? -1 : 1),
        );
      },
    }),
    profile: createStandardFlightProfile(flightGamepadSource.getSelectedDevice()?.slot ?? 0, parameters.get("osfs.input.stickDeadzone")),
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
            create: () => createLegacyFlightProfile(inputManager.getSelectedGamepadSlot(), parameters.get("osfs.input.stickDeadzone")),
          },
          {
            id: "standard",
            label: "Xbox",
            previousNames: ["Standard Xbox / PlayStation flight"],
            create: () => createStandardFlightProfile(inputManager.getSelectedGamepadSlot(), parameters.get("osfs.input.stickDeadzone")),
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
      case "set": commit(patchGroundSettings(groundStore.settings, action.patch)); break;
      case "lock":
        commit(patchGroundSettings(groundStore.settings, { locked: { ...groundStore.settings.locked, [action.key]: action.locked } }));
        break;
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
  // The flight in progress, saved for the next session to resume: every
  // osfs.start.saveInterval seconds of flight, on pause, after a placement,
  // and when the page is hidden or left. A faulted or loading flight is not
  // one to come back to, so the previous save stands.
  let savingFlight = true;
  let flightSaveRefused = false;
  let lastSavedFlight: SavedFlight | null = resumeFlight;
  let secondsSinceSave = 0;
  const saveFlight = (): void => {
    secondsSinceSave = 0;
    if (engineTest || !savingFlight || worldLoading || physicsLoop.getFault() || !parameters.get("osfs.start.resume")) return;
    const flight = captureSavedFlight(jsbsim.sdk, aircraftId, inputManager.isPaused());
    if (!flight) return;
    if (savedFlights.write(flight)) {
      lastSavedFlight = flight;
      flightSaveRefused = false;
    } else if (!flightSaveRefused) {
      flightSaveRefused = true;
      flightLog.warn("sim", "The flight could not be saved: the browser refused its storage. The next session starts at the start position.");
    }
  };
  /** Discards the saved flight and reloads, so the flight starts again at the start position. */
  const startNewFlight = (): void => {
    if (engineTest) { window.location.reload(); return; }
    externalTankVisuals?.resetDetached();
    savingFlight = false;
    savedFlights.clear();
    lastSavedFlight = null;
    try {
      window.location.reload();
    } catch {
      savingFlight = true;
    }
  };
  stopWatching.push(parameters.watch("osfs.start.resume", resume => {
    if (engineTest) return;
    if (resume) {
      saveFlight();
    } else {
      savedFlights.clear();
      lastSavedFlight = null;
    }
    controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
  }));
  const createPanelSnapshot = (flightState = initialState): FlightControlPanelSnapshot => {
    return {
      flightState,
      fps: runtime.engine.getFps(),
      paused: inputManager.isPaused(),
      savedFlight: lastSavedFlight === null ? null : {
        savedAtMs: lastSavedFlight.savedAtMs, latDeg: lastSavedFlight.latDeg, lonDeg: lastSavedFlight.lonDeg,
      },
      viewMode: aircraft?.getViewMode() ?? "third",
      runtimeStatus: { ...runtime.status },
      rendererMode: runtime.renderer.mode,
      aircraftId,
      generationId: aircraftGenerationId,
      lodId: aircraftLodId,
      modelStatus: modelState.status,
      modelActiveLodId: modelState.activeLodId,
      modelTriangles: modelState.triangles,
      modelError: modelState.error,
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
        readOnlyReason: groundStore.readOnlyReason,
        message: groundMessage,
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
      fuel: { familyId: getAircraftFamilyForAircraft(aircraftId).id, tanks: readFuelTanks(jsbsim.sdk) },
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
      saveFlight();
    }
    phoneSession?.cancelHandoff();
    physicsLoop.setPaused(paused || worldLoading);
    tireAudio.setPaused(paused || worldLoading);
    flightAudio.setHeld(paused, "pause");
    runtime.setSimRunning(!paused && !worldLoading);
    engineMonitor.update(jsbsim.sdk, paused || worldLoading);
    skipResumeDelta = !paused;
    const state = physicsLoop.getLatestState() ?? initialState;
    controlPanel?.update(createPanelSnapshot(state));
    hudBar?.update(state, runtime.status, measuredFps, paused, groundHeightUnder(state));
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

  const placeAircraftAtLocation = (location: GeodeticLocation, terrainHeightMeters: number): FlightState =>
    engineTest
      ? resetFlightLocation(jsbsim.sdk, location, terrainHeightMeters, aircraftId, { holdDown: true })
      : resetFlightLocation(jsbsim.sdk, location, terrainHeightMeters, aircraftId);

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
    engineMonitor.update(jsbsim.sdk, true);
    // Detached stores use scene coordinates; clear them before the preview rebase,
    // including when destination terrain preparation fails or is cancelled.
    externalTankVisuals?.resetDetached();
    externalTankStepSeconds = 0;
    clearGVision();
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
      clearanceMeters: engineTest || location.flightPreset ? 0 : 1000,
      signal: abort.signal,
      onProgress: progress => {
        if (!abort.signal.aborted) loading.setPhase("terrain", {
          state: progress.phase === "ready" ? "ready" : "loading",
          detail: progress.message, terrain: progress,
        });
      },
    }, parameters.get("osfs.flight.allowCoarserThisSession")).then(terrain => {
      if (disposed || abort.signal.aborted) return;
      const destination = { ...location, altMeters: terrain.altitudeMeters };
      const state = placeAircraftAtLocation(destination, terrain.groundHeightMeters);
      aircraftModel?.updateGearVisibility(readControlSurfaceState(jsbsim.sdk, aircraftId).gearDownNorm, true);
      followControlLaw();
      terrainContact.reset();
      visibleMeshCollision.reset();
      if (!engineTest && location.flightPreset) {
        inputManager.resetControls(state.throttleNorm);
        inputManager.replaceFlaps(getFdmProfile(aircraftId).runwayPresets[location.flightPreset.mode].flapsNorm);
        inputManager.setGearDown(true);
        if (location.flightPreset.mode === "departure") setSimulationPaused(true);
      }
      appliedControls = inputManager.getControls();
      physicsLoop.reset();
      // A reposition is a discontinuity: new timeline, cleared queues, a fade.
      flightAudio.beginEpoch();
      engineVisuals.resetSmoke();
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
      actualFlaps = readActualFlaps();
      lastLocalFlapsRevision = inputManager.getFlapsInputRevision();
      lastRemoteFlaps = null;
      syncNativeAutoFlaps();
      flightHud.update(state, inputManager.getControls(), inputManager.getGearDownNorm() > 0, {
        pitch: pitchAutoTrim.enabled, roll: rollAutoTrim.enabled,
      }, hudMasterAp(), attitudeView());
      saveFlight();
      controlPanel?.update(createPanelSnapshot(state));
      hudBar?.update(state, runtime.status, measuredFps, inputManager.isPaused(), groundHeightUnder(state));
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
          // Blending, the levers are where the pilots put them, before automation: what both sets of levers show.
          controls: phoneSession?.getSnapshot().owner === "phone"
            ? { ...appliedControls, ...controlBlend?.levers() } : inputManager.getControls(),
          airspeedKts: state.airspeedKts, altitudeFt: state.altMeters / 0.3048,
          headingDeg: (state.headingRad * 180 / Math.PI + 360) % 360,
          // Presence of this field is what tells the phone it may offer a G button.
          gearDown: inputManager.getGearDownNorm() > 0,
          // The same reading the HUD's engine chip is drawing from, so both
          // screens show one engine rather than two sampled at two times.
          engine: toEngineStatus(engineMonitor.getReading(), engineControl.reading()),
        };
      },
      hasActiveLocalInput: () => inputManager.hasActiveFlightInput() || localStartHeld || flightHud.isPilotHolding(),
      isPageVisible: () => !document.hidden,
      getSharing: () => controlSharing,
      onOwnershipChange: (owner, controls, blend) => {
        // Blending, this computer's controls stay live and mix with the phone's,
        // so a phone joining or leaving changes only where the levers are.
        if (blend) inputManager.adoptLevers(controls);
        else inputManager.adoptControls(controls);
        inputManager.setRemoteOwned(owner === "phone" && !blend);
        controlBlend = owner === "phone" && blend ? createControlBlend(controls, inputManager.getFlapsInputRevision()) : null;
        lastLocalFlapsRevision = inputManager.getFlapsInputRevision();
        lastRemoteFlaps = owner === "phone" ? controls.flaps : null;
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
      // The same path the HUD lever's ring takes.
      shutdownEngine: () => engineControl.shutdown(),
    });
    return (host, panelOptions) => createPhonePairingPanel(host, session, panelOptions);
  }).catch((error: unknown) => { phonePairing = null; throw error; });
  const onVisibilityChange = () => {
    if (!document.hidden) return;
    haptics.cancel();
    phoneSession?.onHidden();
    saveFlight();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  // Leaving or reloading the page, where a browser does not hide it first.
  window.addEventListener("pagehide", saveFlight);

  // The renderer and basemap choices each have a tab; their HUD chips toggle it.
  // The choice is renderer.backend, which the runtime reads when it starts.
  const rendererPanel = createRendererPanel({ renderer: runtime.renderer, onChange: applyRendererChoice, settings });
  // A switch between Google and a 2D basemap, or of elevation provider, changes
  // the ground under the aircraft, so its terrain is prepared again. One 2D
  // basemap for another changes imagery only. A switch can come from the Map
  // tab, Show all parameters or an import; the runtime reports each one.
  const mapGround = (status: Pick<BabylonRuntime["status"], "mode" | "terrainSource">): string | null =>
    status.mode === "raster-basemap" ? `raster:${status.terrainSource?.id ?? ""}`
      : status.mode === "google-tiles" ? "google" : null;
  let preparedGround = mapGround(runtime.status);
  stopWatching.push(runtime.subscribeStatus(status => {
    const ground = mapGround(status);
    if (ground === null || ground === preparedGround) return;
    preparedGround = ground;
    teleportToLocation(physicsLoop.getLatestState() ?? initialState);
  }));
  const mapPanel = createMapSourcePanel({
    detail: mapDetail ?? undefined,
    rasterSources: RASTER_BASE_MAP_SOURCES,
    terrainSources: TERRAIN_SOURCES,
    // Saving a choice switches the map: the runtime follows map.source.*.
    onMapSourceChange: setMapSourcePreference,
    onTerrainSourceChange: setTerrainSourcePreference,
  });
  // Settings holds what spans every tab, the presets and the saved record; the
  // Interface tab the position readout, the log and place search, which the
  // flight uses as the globe does. The globe's toolbar and theme are not the
  // flight's, so they stay out.
  const presetsSection = createPresetsSection(settings);
  const savedSettingsSection = createSavedSettingsSection(settings);
  const interfaceParameterSections = (["position", "log", "search"] as const)
    .map(section => ({ section, handle: createParameterSection(settings, { tab: "interface", section }) }));
  const settingsSections: PanelSection[] = [
    { id: "presets", title: "Presets", element: presetsSection.element },
    { id: "saved-settings", title: "Saved settings", element: savedSettingsSection.element },
  ];
  // Which version runs, and everything it is built from, read from the page itself.
  const about = createAboutPanel({ site: __REPOSITORY_SLUG__ || undefined });
  const interfaceSections: PanelSection[] = interfaceParameterSections.map(({ section, handle }) => ({
    id: section, title: settings.getSectionTitle("interface", section), element: handle.element,
  }));
  controlPanel = createFlightControlPanel(panelRoot, createPanelSnapshot(), {
    settings,
    parameters,
    meshInspector,
    mapTab: mapPanel.element,
    rendererTab: rendererPanel.element,
    settingsSections,
    aboutTab: about.element,
    interfaceSections,
    initialWeather: weather,
    gamepadBindings,
    onLocationApply: teleportToLocation,
    locationSearchProvider: options.locationSearchProvider,
    onWeatherChange: applyWeather,
    onPausedChange: setSimulationPaused,
    onNewFlight: startNewFlight,
    onViewModeChange: (mode) => { aircraft?.setViewMode(mode); phoneSession?.syncStatus(); runtime.requestRender(); },
    onAircraftApply: (selection) => {
      if (aircraftReloadRequested) return null;
      const next = normalizeAircraftSelection(selection);
      const saveError = writeAircraftSelection(parameters, next);
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
      followAircraftPresentation();
      return null;
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
    onFuelChange: (contentsLbs) => {
      writeFuelTanks(jsbsim.sdk, contentsLbs);
      // A paused flight is saved again only when it resumes; keep the new load now.
      if (inputManager.isPaused()) saveFlight();
      controlPanel?.update(createPanelSnapshot(physicsLoop.getLatestState() ?? initialState));
    },
    onFuelAttachmentChange: (index, attached) => {
      if (!setExternalFuelTankAttached(jsbsim.sdk, aircraftId, index, attached)) return;
      if (!attached) {
        const state = physicsLoop.getLatestState() ?? initialState;
        // Scene axes are east/up/south; retain the aircraft's ground-relative momentum.
        externalTankVisuals?.jettison(index, new Vector3(
          state.eastVelocityFps * 0.3048,
          state.verticalSpeedFps * 0.3048,
          -state.northVelocityFps * 0.3048,
        ));
      }
      externalTankVisuals?.sync(readExternalFuelTanks(jsbsim.sdk, aircraftId));
      saveFlight();
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
              detail: `Flight requires World detail 2^${Math.log2(parameters.get("osfs.flight.minimum")).toFixed(2)} or finer. Choose finer World detail on the rail or in Map → Detail, or allow coarser terrain for this session there.`,
            }
          : {
              kind: "waiting", message: "Waiting for terrain height data", heldSeconds,
              detail: "No reliable terrain height is available under the aircraft yet, so the simulation is holding rather than guessing one.",
            };
      }
    }
    statusOverlay?.update(state);
  };

  hudBar.update(initialState, runtime.status, measuredFps, inputManager.isPaused(), groundHeightUnder(initialState));
  mapPanel.update(runtime.status);

  const ensureWorld = (): void => {
    mountFlightWorld();
  };

  runtime.setSimTick((deltaSeconds) => {
    if (disposed || worldLoading) return;
    flightSurface.beginFrame();
    const frameIntervalMs = deltaSeconds * 1000;
    // The runtime has closed the previous frame; this tick and Babylon's render of it land in the new one.
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
    if (!engineTest && !physicsLoop.getFault()
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
    // A manual key/controller move also takes over while physics is paused.
    noticeLocalFlaps();
    frameProfiler.add("flight/input", sectionStarted);
    let terrainBlocked = false;
    const physicsStarted = frameProfiler.clock();
    const displayState = physicsLoop.update(deltaSeconds, () => {
      const contactStarted = frameProfiler.clock();
      const contact = engineTest ? true : terrainContact.update(false, googleTiles, true, true);
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
      const collisionReset = !engineTest && visibleMeshCollision.update();
      frameProfiler.add("flight/physics/collision", collisionStarted);
      // Terrain/collision work can consume the remaining input lease. Check
      // authority immediately before allowing this step to advance physics.
      const fromPhone = phoneSession?.beforeStep(controls) ?? controls;
      if (fromPhone === false || inputManager.isPaused()) return false;
      const blended = controlBlend && phoneSession?.isBlending()
        ? controlBlend.step(fromPhone, controls, inputManager.getFlapsInputRevision(), controlSharing.priority) : fromPhone;
      // This computer's levers continue from where the two pilots left them.
      if (controlBlend && phoneSession?.isBlending()) inputManager.adoptLevers(blended);
      // A pilot who has passed out lets go of the stick, the pedals and the brakes.
      const selected = pilotOut() ? { ...blended, elevator: 0, aileron: 0, rudder: 0, brake: 0 } : blended;
      if (collisionReset) { resetWheelSpin("reset"); return "reset"; }
      if (phoneSession?.getSnapshot().owner === "phone") noticeRemoteFlaps(selected.flaps);
      else noticeLocalFlaps();
      const ap = engineTest ? { ...lastApResult, engaged: false, controls: selected, owners: idleAutopilotOwners() } : syncArbiter(selected);
      const onGround = aircraftOnGround();
      const qbarPsf = jsbsim.sdk.getPropertyValue("aero/qbar-psf");
      const vtFps = jsbsim.sdk.getPropertyValue("velocities/vt-fps");
      const trimTuning = readAutoTrimTuning(parameters);
      const commanded = { ...ap.controls };
      const profile = getFdmProfile(aircraftId);
      // The pilot's roll rate shapes the stick only; an autopilot flies the source gradient.
      const fullStickRollRate = profile.fullStickRollRate && {
        property: profile.fullStickRollRate.property,
        degPerSec: ap.owners.roll === "pilot"
          ? parameters.get("osfs.aircraft.fullStickRollRate") : profile.fullStickRollRate.sourceDegPerSec,
      };
      // A fly-by-wire roll-rate law holds bank itself, and there roll trim commands a roll rate.
      const lawHoldsBank = !!fullStickRollRate && !!profile.controlLaw
        && jsbsim.sdk.getPropertyValue(profile.controlLaw.enabledProperty) > 0.5;
      // An engine that is off holds the throttle at idle until the lever is held to start it.
      const engine = engineControl.step(phoneSession?.getSnapshot().owner === "phone"
        ? phoneSession.isStarterHeld() || (localStartHeld && phoneSession.isBlending()) : localStartHeld);
      if (engine.state === "stopped") {
        commanded.throttle = 0;
        inputManager.replaceThrottle(0);
      }
      if (!engineTest && ap.owners.pitch === "pilot") {
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
        }, trimTuning);
        pitchAutoTrim = pitched.state;
        commanded.pitchTrim = pitched.pitchTrim;
        inputManager.replacePitchTrim(pitched.pitchTrim);
      }
      if (lawHoldsBank) {
        // Waiting: the assist adopts the wheel again if the law lets go.
        if (rollAutoTrim.trim !== null) rollAutoTrim = createAutoTrimState(rollAutoTrim.enabled);
      } else if (!engineTest && ap.owners.roll === "pilot") {
        const rolled = stepRollAutoTrim(rollAutoTrim, {
          dt: FIXED_DT,
          rollAccelRad: jsbsim.sdk.getPropertyValue("accelerations/pdot-rad_sec2"),
          rollRateRad: jsbsim.sdk.getPropertyValue("velocities/p-rad_sec"),
          aileron: selected.aileron,
          rollTrim: commanded.rollTrim,
          qbarPsf,
          vtFps,
          onGround,
        }, trimTuning);
        rollAutoTrim = rolled.state;
        commanded.rollTrim = rolled.rollTrim;
        inputManager.replaceRollTrim(rolled.rollTrim);
      }
      const autoFlapsEnabled = !engineTest && parameters.get("osfs.assist.autoFlaps") && ap.owners.flaps === "pilot";
      if (autoFlapsEnabled && profile.automaticFlaps.kind === "assist") {
        commanded.flaps = automaticFlapCommand(profile.automaticFlaps, {
          airspeedKts: jsbsim.sdk.getPropertyValue("velocities/vc-kts"),
          throttleNorm: commanded.throttle,
          gearDown: ap.gearDownNorm > 0.5,
          onGround,
          currentCommand: appliedControls.flaps,
        });
      }
      applyFlightControls(
        jsbsim.sdk,
        commanded,
        ap.gearDownNorm,
        profile.rudderSign,
        profile.stovl ? {
          commandProperty: profile.stovl.commandProperty,
          commandNorm: parameters.get("osfs.aircraft.stovlConversion"),
        } : undefined,
        profile.controlLaw ? {
          commandProperty: profile.controlLaw.commandProperty,
          mode: parameters.get("osfs.aircraft.controlLaw"),
        } : undefined,
        profile.automaticFlaps.kind === "native" ? {
          commandProperty: profile.automaticFlaps.commandProperty,
          enabled: autoFlapsEnabled,
        } : undefined,
        fullStickRollRate,
        parameters.get("osfs.aircraft.rollTrimRange"),
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
    if (!feedbackHeld) {
      secondsSinceSave += deltaSeconds;
      if (secondsSinceSave >= parameters.get("osfs.start.saveInterval")) saveFlight();
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
    if ((detailRequirements?.isHeld() ?? false) !== flightMinimumOnRail) showFlightMinimum();

    sectionStarted = frameProfiler.clock();
    runtime.setSimViewState({
      latDeg: displayState.latDeg,
      lonDeg: displayState.lonDeg,
      zoomMeters: zoomMetersFromAltitude(displayState.altMeters - surfaceHeight),
      headingDeg: (displayState.headingRad * 180) / Math.PI,
    });

    floatingOrigin?.apply(displayState);
    externalTankVisuals?.sync(readExternalFuelTanks(jsbsim.sdk, aircraftId));
    externalTankVisuals?.update(externalTankStepSeconds);
    externalTankStepSeconds = 0;
    applyChaseFrame(displayState);
    const audioCamera = runtime.scene.activeCamera;
    if (aircraft && audioCamera && flightAudio.isEngineActive()) {
      flightAudio.updateView({
        camera: audioCamera,
        cockpitCamera: aircraft.firstPersonCamera,
        aircraftRoot: aircraft.root,
        exterior: aircraft.getViewMode() === "third" ? 1 : 0,
        // Unknown terrain switches the ground reflection off rather than guessing it.
        heightAboveGroundM: sampledSurfaceHeight === null ? null : displayState.altMeters - sampledSurfaceHeight,
      });
    }
    if (collisionDebugEnabled) collisionDebugOverlay?.update();
    forcesDebugOverlay?.update(true);
    if (collisionDebugEnabled && wheelSpinMode !== "off") wheelSpinDebugOverlay?.update();
    engineVisuals.read();
    const rig = aircraftModel?.getRig();
    if (aircraftModel) {
      const surfaceState = readControlSurfaceState(jsbsim.sdk, aircraftId, {
        nozzlePositionNorm: engineVisuals.nozzlePositionNorm(),
      });
      if (rig) applyAircraftRig(rig, surfaceState, deltaSeconds, { simulationHeld: feedbackHeld });
      aircraftModel.updateGearVisibility(surfaceState.gearDownNorm, true);
    }
    engineVisuals.updateRig(rig ?? null, true);
    frameProfiler.add("flight/view", sectionStarted);
    sectionStarted = frameProfiler.clock();
    const phoneOwned = phoneSession?.getSnapshot().owner === "phone";
    actualFlaps = readActualFlaps();
    if (parameters.get("osfs.assist.autoFlaps") && lastApResult.owners.flaps === "pilot" && Number.isFinite(actualFlaps)) {
      inputManager.replaceFlaps(actualFlaps);
    }
    flightHud.update(
      displayState,
      phoneOwned || lastApResult.engaged || pilotOut() ? appliedControls : controls,
      lastApResult.engaged ? lastApResult.gearDownNorm > 0 : inputManager.getGearDownNorm() > 0,
      { pitch: pitchAutoTrim.enabled, roll: rollAutoTrim.enabled },
      hudMasterAp(),
      attitudeView(),
    );
    frameProfiler.add("flight/hud", sectionStarted);
    const now = performance.now();
    if (now - lastPanelUpdateMs >= 100) {
      sectionStarted = frameProfiler.clock();
      lastPanelUpdateMs = now;
      controlPanel?.update(createPanelSnapshot(displayState));
      hudBar?.update(displayState, runtime.status, measuredFps, inputManager.isPaused(), sampledSurfaceHeight);
      mapPanel.update(runtime.status);
      frameProfiler.add("flight/panels", sectionStarted);
    }
    sectionStarted = frameProfiler.clock();
    flightRecorder.sample(jsbsim.sdk);
    evaluationInstruments.update(jsbsim.sdk);
    if (gIndicatorShown || gVisionEnabled || passOutSettings) {
      const pilotG = readPilotG(jsbsim.sdk);
      if (gIndicatorShown) gMeter.update(pilotG);
      if (gVisionEnabled || passOutSettings) {
        const wasOut = pilotOut();
        pilot = stepPilot(pilot, pilotG, gVisionStepSeconds, gVisionSettings, passOutSettings);
        if (!wasOut && pilotOut()) {
          flightLog.info("pilot", "Pilot passed out", {
            loadG: Number(pilotG.toFixed(1)), secondsOut: Number(pilot.secondsOut.toFixed(1)),
          });
        } else if (wasOut && !pilotOut()) {
          flightLog.info("pilot", "Pilot came to", { loadG: Number(pilotG.toFixed(1)) });
        }
      }
    }
    gVisionStepSeconds = 0;
    // Every frame: a change of camera view changes what is drawn without a step.
    showGVision();
    engineMonitor.update(jsbsim.sdk, feedbackHeld || worldLoading);
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
    aircraftModel?.updateGearVisibility(readControlSurfaceState(jsbsim.sdk, aircraftId).gearDownNorm, true);
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
      window.removeEventListener("pagehide", saveFlight);
      unbindRecorderMark();
      runtime.setSimTick(null);
      window.removeEventListener("keydown", onViewKeyDown, { capture: true });
      flightGamepadSource.stop();
      detachGamepadProfileInput();
      flightGamepadRuntime.dispose();
      flightGamepadSource.dispose();
      detachCameraInput();
      detachInput();
      if (flightPerformance) setActiveFlightPerformanceCapture(null);
      for (const stop of stopWatching.splice(0)) stop();
      removeFlightMinimumMarker();
      inputManager.dispose();
      unbindFrameProfile();
      setActiveFrameProfile(null);
      if (phoneCameraTrace) setActivePhoneCameraTrace(null);
      hudBar?.destroy();
      statusOverlay?.destroy();
      controlPanel?.destroy();
      presetsSection.destroy();
      savedSettingsSection.destroy();
      about.dispose();
      for (const { handle } of interfaceParameterSections) handle.destroy();
      mapPanel.destroy();
      detailRequirements?.releaseAll();
      disconnectMapDetail();
      mapDetail?.dispose();
      rendererPanel.destroy();
      evaluationInstruments.destroy();
      gMeter.destroy();
      gVisionOverlay.destroy();
      engineMonitor.destroy();
      flightHud.destroy();
      collisionDebugOverlay?.dispose();
      wheelSpinDebugOverlay?.dispose();
      forcesDebugOverlay?.dispose();
      meshInspector.dispose();
      haptics.dispose();
      gamepadHaptics.dispose();
      wheelCues.invalidate("dispose");
      tireAudio.dispose();
      // Before jsbsim.dispose(): the audio adapter's property batch must not outlive the SDK.
      flightAudio.dispose();
      externalTankVisuals?.dispose();
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
    let state: FlightState | null = null;
    if (resumeFlight && terrain) {
      try {
        state = restoreSavedFlight(jsbsim.sdk, resumeFlight, aircraftId, terrain);
      } catch (error) {
        flightLog.warn("sim", "The saved flight could not be restored; it starts level where it was", {
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (!state && terrain) state = placeAircraftAtLocation({
      ...spawn, altMeters: engineTest ? terrain.groundHeightMeters : terrain.altitudeMeters,
    }, terrain.groundHeightMeters);
    if (!state) throw new Error("Missing initial engine or flight state.");
    followControlLaw();
    // RunIC/saved restoration may restore the native scheduler flag. The
    // persisted assist request owns it, while feedback remains observational.
    noticeLocalFlaps();
    syncNativeAutoFlaps();
    actualFlaps = readActualFlaps();
    const restoredFlapCommand = jsbsim.sdk.getPropertyValue("fcs/flap-cmd-norm");
    if (parameters.get("osfs.assist.autoFlaps") && lastApResult.owners.flaps === "pilot" && Number.isFinite(actualFlaps)) {
      inputManager.replaceFlaps(actualFlaps);
    } else if (Number.isFinite(restoredFlapCommand)) inputManager.replaceFlaps(restoredFlapCommand);
    lastLocalFlapsRevision = inputManager.getFlapsInputRevision();
    flightHud.update(state, inputManager.getControls(), inputManager.getGearDownNorm() > 0, {
      pitch: pitchAutoTrim.enabled, roll: rollAutoTrim.enabled,
    }, hudMasterAp(), attitudeView());
    terrainContact.reset();
    visibleMeshCollision.reset();
    physicsLoop.reset();
    revealAircraft(state);
    runtime.setSimViewState({ ...spawn, zoomMeters: zoomMetersFromAltitude(state.altMeters - (terrain?.groundHeightMeters ?? 0)) });
    worldLoading = false;
    physicsLoop.setPaused(inputManager.isPaused());
    tireAudio.setPaused(inputManager.isPaused());
    flightAudio.setHeld(inputManager.isPaused(), "pause");
    flightAudio.setHeld(false, "loading");
    runtime.setSimRunning(!inputManager.isPaused());
    loading.hide();
    if (engineTest) controlPanel?.openOrSelectTab("engine");
    runtime.requestRender();
    return app;
  } catch (error) {
    preserveLoadingScreen = true;
    app.destroy();
    loading.fail("Flight could not start safely. Check your connection and map access, then retry.");
    throw error;
  }
}
