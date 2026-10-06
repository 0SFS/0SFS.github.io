import { createMapDownloadMeter } from "./mapDownloadMeter";
import { setMapCacheLimits } from "../../terrain/mapCache";
import { createSurfaceQuery, type SurfaceQuery } from "../../terrain/surfaceQuery";
import { resolveTerrainSource, type TerrainSource } from "../../terrain/terrainTiles";
import { evaluateTerrainReadiness, terrainReadinessSamples, validateTerrainPreparation,
  type TerrainPreparationOptions, type TerrainPreparationResult } from "../../terrain/terrainReadiness";
import {
  Color3,
  Color4,
  ComputeYawPitchFromLookAtToRef,
  Engine,
  GeospatialCamera,
  HemisphericLight,
  type AbstractMesh,
  type Camera,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  UniversalCamera,
  Vector2,
  Vector3,
  WebGPUEngine,
} from "@babylonjs/core";
import { GeospatialClippingBehavior } from "@babylonjs/core/Behaviors/Cameras/geospatialClippingBehavior";

import { bootstrapGlobeRenderer, type RendererMode, type RendererSelection } from "./createRendererMode";
import {
  createGoogleTilesRuntime,
  type GoogleTerrainDetailState,
  type GoogleTilesRuntime,
} from "./createTilesRuntime";
import { createRasterTilesRuntime, type RasterDetailFeedback, type RasterTilesRuntime } from "./createRasterTilesRuntime";
import { DEFAULT_RASTER_IMAGERY } from "./resolveMapRuntimeConfig";
import { isKnownRasterBaseMapId, resolveRasterBaseMapSource, withSourceKey, type RasterBaseMapSource } from "./rasterBaseMaps";
import { getAppSettings } from "../../settings/appSettings";
import type { SettingsRegistry } from "../../settings/registry";
import type { AutoDetailDecision } from "../../terrain/autoDetail";
import { createTerrainPerformanceCapture, type TerrainPerformanceCapture } from "../../terrain/terrainPerformanceCapture";

declare global {
  interface Window {
    fossTerrainPerformance?: TerrainPerformanceCapture;
    __fossMapDebug?: {
      readonly runtimeMode: RuntimeMode;
      readonly sceneMeshCount: number;
      readonly enabledMeshCount: number;
      readonly rasterVisibleTiles: number;
      readonly rasterActiveTiles: number;
      readonly fallbackEnabled: boolean;
      readonly activeCamera: string | null;
      readonly schedulerActive: boolean;
      readonly pendingTextureCount: number;
      readonly readyTextureCount: number;
      readonly recentEvents: readonly MapDebugEvent[];
    };
  }
}
import { createRenderScheduler, type RenderScheduler } from "./renderScheduler";
import { createSceneUpdates } from "./sceneUpdates";
import { createPresentationCandidates } from "./presentationCandidates";
import { geodeticToEcef, ecefToGeodetic, DEG_TO_RAD, RAD_TO_DEG } from "../../camera/cameraMath";
import { orbitCenterOnSight, orbitGlideRates, withinTilt, type GlideVec3 } from "../../camera/cameraGlide";
import { CameraController, DEFAULT_CAMERA_LIMITS, type CameraLimits, type GroundFollow, type OrbitTargetHeightOptions } from "../../camera/cameraState";
import { createInputController, type InputController, type InputHandback } from "../../input/createInputController";
import { createInertialCameraController, DEFAULT_INERTIA_DECAY_PER_FRAME, MAX_ZOOM_LOG_DELTA_PER_FRAME, type InertialCameraController } from "../../input/inertialCameraController";
import type { CameraHandling } from "../../camera/cameraLimits";
import type { GlobeNavigationIntentFrame } from "../../input/globeNavigation";
import { DEFAULT_INPUT_RATES, type InputModePreference, type InputRates, type InputSensitivitySettings } from "../../input/inputSettings";
import { INPUT_RATE_IDS, RENDERER_EXPERIMENT_IDS } from "../../settings/catalogue";
import { createFrameProfileSession, type FrameProfileSession } from "../../perf/frameProfileSession";
import { isNumberRange } from "../../settings/values";
import type { GlobeViewState } from "../types";
import {
  createNavigationOwner,
  NAVIGATION_PRESENTATION_LAYER,
  type EcefVector,
  type NavigationAcquisition,
  type NavigationGlide,
  type NavigationLease,
  type NavigationPresentation,
  type NavigationRequest,
  type NavigationSnapshot,
  type NavigationState,
} from "./navigationLease";
import type { ActionIntentFrame } from "@felipegalind0/gamepad-tools/core";

export { NAVIGATION_PRESENTATION_LAYER };

const PLANET_RADIUS_METERS = 6_378_137;
const DEFAULT_FALLBACK_BACKGROUND = new Color4(0.01, 0.02, 0.05, 1);
const DEFAULT_GOOGLE_BACKGROUND = new Color4(0.04, 0.05, 0.07, 1);
const DEFAULT_CAMERA_LAT_DEG = 44.977753;
const DEFAULT_CAMERA_LON_DEG = -93.265011;
const DEFAULT_CAMERA_ALTITUDE_METERS = 600;
const DEFAULT_CAMERA_YAW_RAD = -0.2513281792775774;
const DEFAULT_CAMERA_PITCH_RAD = 1.167625429373872;

export interface BabylonRuntimeOptions {
  googleApiKey?: string | null;
  /** Whether Google 3D Tiles should be the initial active source when keyed. */
  preferGoogleTiles?: boolean;
  rasterBaseMap?: RasterBaseMapSource | null;
  getSurfaceHeightMeters?: (latDeg: number, lonDeg: number) => number | null;
  terrainSource?: TerrainSource;
  /**
   * @deprecated The quality profiles are retired: terrain detail is
   * `map.detail.terrain.*`, adjusted by `map.auto.*`; `?terrainQuality` sets
   * them for a visit. Ignored.
   */
  rasterQuality?: unknown;
  /** How 2D basemap imagery is selected and drawn. */
  rasterImagery?: "atlas" | "legacy";
  /** Explicit opt-in; no per-query timings or capture buffers by default. */
  terrainPerformanceCapture?: TerrainPerformanceCapture;
  rendererForce?: RendererMode | null;
  onStatusChange?: (status: BabylonRuntimeStatus) => void;
  /** Enable a consumer-driven simulation camera and frame callback. */
  simMode?: boolean;
  /**
   * The registry the runtime reads its parameters from and follows: the
   * renderer, the map source and elevation, provider keys, the imagery path
   * and where Google refines from. The app's when omitted.
   */
  settings?: SettingsRegistry;
}

export type { RendererMode };

export type RuntimeMode = "google-tiles" | "raster-basemap" | "fallback";

export interface BabylonRuntimeStatus {
  mode: RuntimeMode;
  message: string;
  googleApiKeyProvided: boolean;
  rasterBaseMap: RasterBaseMapSource | null;
  /**
   * The basemap whose imagery is on screen. During a switch it stays the old
   * one until the new source can cover the globe, so its credit stays shown.
   */
  displayedRasterBaseMap?: RasterBaseMapSource | null;
  terrainSource: TerrainSource | null;
  lastError: string | null;
}

export interface BabylonTileMetrics {
  visibleTiles: number;
  activeTiles: number;
}

export type { GoogleTerrainDetailState };

/**
 * Where Google 3D Tiles measure distance when choosing mesh detail: the
 * camera or the selected focus point, which in a simulation is its floating
 * origin unless the host registers another. `map.focus.refineFrom` chooses.
 */
export type GoogleTerrainDetailAnchor = "camera" | "focus-point";

/**
 * A point the map can be loaded around (`map.focus.point`), such as an
 * aircraft. Its position is read at most once per rendered frame.
 */
export interface FocusPoint {
  /** Stable: saved as the parameter's value. */
  id: string;
  label: string;
  /** ECEF metres, or null while it is not known. */
  getPosition(): { x: number; y: number; z: number } | null;
}

/** Levels as the adjustment reports them: "0.5 levels", "1 level". */
function formatLevels(levels: number): string {
  const rounded = Math.round(levels * 100) / 100;
  return `${rounded} level${rounded === 1 ? "" : "s"}`;
}

/** The parameters that decide the focus region, read by both maps each frame. */
const FOCUS_PARAMETER_IDS = [
  "map.focus.mode",
  "map.focus.point",
  "map.focus.radius",
  "map.focus.horizonCull",
  "map.focus.detailBelow.imagery",
  "map.focus.detailBelow.google",
] as const;

interface MapDebugEvent {
  at: number;
  event: string;
  detail?: Record<string, unknown>;
}

export interface BabylonRuntime {
  /** Stream and refine a destination before creating or relocating an aircraft. */
  prepareTerrain(options: TerrainPreparationOptions): Promise<TerrainPreparationResult>;
  /** Collision and placement queries against the currently displayed map mesh. */
  surface: SurfaceQuery;
  engine: Engine | WebGPUEngine;
  scene: Scene;
  renderer: RendererSelection;
  status: BabylonRuntimeStatus;
  /**
    * The active GeospatialCamera. Fallback mode uses the same geospatial scale
    * as Google mode so layers can render ECEF-positioned primitives in both modes.
   * Use this to wire POI tracking or other camera-direct integrations.
   */
  geospatialCamera: GeospatialCamera | null;
    /** Return the current camera state. */
    getViewState(): GlobeViewState | null;
    /** Merge partial overrides into the current camera state. */
  setViewState(partial: Partial<GlobeViewState>): void;
  /** Configure the surface height and starting offset used by the camera orbit target. */
  configureOrbitTargetHeight(options: OrbitTargetHeightOptions | null): void;
  /** Return current base-map tile counts, or null when no tile runtime is active. */
  getTileMetrics(): BabylonTileMetrics | null;
  /** Google requested and camera-visible loaded geometric detail, in pixels. */
  getGoogleTerrainDetailState(): GoogleTerrainDetailState | null;
  /** Called when loaded Google detail changes after selection or a camera move. */
  onGoogleDetailFeedback(listener: () => void): () => void;
  /**
   * Override the Google renderer's screen-space-error target for this session.
   * A larger number displays a coarser mesh. `null` restores the renderer's
   * normal adaptive target.
   */
  setGoogleTerrainDetailTarget(errorTarget: number | null): void;
  /**
   * Adds a point the map can be loaded around, listed in Map → Detail's Focus
   * point. Returns a function that removes it.
   */
  registerFocusPoint(point: FocusPoint): () => void;
  /** The selected focus point in ECEF metres, or null while it is not known. */
  getFocusPosition(): { x: number; y: number; z: number } | null;
  /** Return the point used to choose Google mesh detail. */
  getGoogleTerrainDetailAnchor(): GoogleTerrainDetailAnchor;
  /**
   * Choose the point used to refine Google mesh detail. Visibility remains
   * based on the active view camera in either mode.
   */
  setGoogleTerrainDetailAnchor(anchor: GoogleTerrainDetailAnchor): void;
  /**
   * Request raster imagery detail as a signed offset in binary resolution
   * steps, positive for finer imagery. Only imagery changes; elevation and
   * terrain geometry do not.
   */
  setRasterDetailTarget(offset: number): void;
  /** Whether raster detail is supported and what limits its delivery; null without a raster basemap. */
  getRasterDetailFeedback(): RasterDetailFeedback | null;
  /** Called when raster detail delivery changes. Returns an unsubscribe fn. */
  onRasterDetailFeedback(listener: () => void): () => void;
  /** Called after every status change, while paused too. Returns an unsubscribe fn. */
  subscribeStatus(listener: (status: BabylonRuntimeStatus) => void): () => void;
  /** Switch imagery without reloading the application or resetting consumers. */
  setRasterBaseMap(source: RasterBaseMapSource): void;
  /** Switch between Google 3D Tiles and a raster basemap without a page reload. */
  setMapSource(source: "google" | RasterBaseMapSource): void;
  /** Switch the elevation stream used by raster basemaps. */
  setTerrainSource(source: TerrainSource): void;
  /**
   * Called when automatic adjustment moves 2D basemap detail (`map.auto.*`),
   * with the frame time that caused it, for a host's log. Returns a function
   * that stops it.
   */
  onDetailAdjusted(listener: (decision: AutoDetailDecision) => void): () => void;
  /**
   * Tell the input system whether the camera is currently locked to a POI.
   * When true, two-finger trackpad swipe orbits instead of panning.
   */
  setOrbitMode(active: boolean): void;
  /** Force or auto-detect the active input mode used by wheel/pointer controllers. */
  setInputMode(mode: InputModePreference): void;
  /** The input mode wheel and gesture events are read with; a navigation lease's input reads them the same way. */
  getInputMode(): InputModePreference;
  /** Set movement sensitivity multipliers for mouse, trackpad, and touch. */
  setInputSensitivity(sensitivity: Partial<InputSensitivitySettings>): void;
  /**
   * Apply host-owned, normalized navigation rates through the same inertial
   * camera path used by pointer input. This avoids repeated setViewState calls
   * that would cancel existing inertia.
   */
  applyGlobeNavigationIntents(frame: GlobeNavigationIntentFrame): void;
  /** Toggle anchor-based globe drag pan (grabbed surface point follows cursor). */
  setGlobeAnchorRotation(enabled: boolean): void;
  getGlobeAnchorRotation(): boolean;
  /**
   * Render-on-demand controls: a frame is drawn only when one is asked for.
   * Meshes and lights entering or leaving the scene ask for theirs, and so does
   * a frame that skipped a mesh still compiling or loading, once it is ready
   * (sceneUpdates.ts). Any other change to what the scene shows - moving,
   * showing, hiding or recolouring something already in it - must call
   * requestRender() to be seen.
   */
  requestRender(): void;
  beginContinuous(): void;
  endContinuous(): void;
  /** Pause the scheduler (e.g. when the tab is hidden). */
  setPaused(paused: boolean): void;
  /** True while the scheduler is pumping frames (rAF in flight or continuous). */
  isRendering(): boolean;
  /** Subscribe to render-active transitions. Returns an unsubscribe fn. */
  onActiveRenderChange(listener: (active: boolean) => void): () => void;
  /** True while at least one Google tile load is in flight. */
  isStreamingTiles(): boolean;
  /** Rolling one-second map payload rate; cached responses may contribute. */
  getMapDownloadBytesPerSecond(): number;
  onMapDownloadRateChange(listener: (bytesPerSecond: number) => void): () => void;
  /** Subscribe to tile-streaming transitions. Returns an unsubscribe fn. */
  onTilesStreamingChange(listener: (streaming: boolean) => void): () => void;
  /** Root for world content that must follow a simulation's floating origin. */
  getWorldRoot(): TransformNode | null;
  /** Update the geospatial position used to select raster tiles in simulation mode. */
  setSimViewState(partial: Partial<GlobeViewState>): void;
  /** Set the simulation callback invoked before each rendered frame. */
  /** Hold continuous rendering only while the simulation is running. Defaults to true in simMode. */
  setSimRunning(running: boolean): void;
  setSimTick(callback: ((deltaSeconds: number) => void) | null): void;
  /**
   * Takes navigation for one owner, such as a panorama scene: the globe's
   * input, point tracking and map selection pause until the lease ends.
   * Busy while another owner or a simulation holds the camera.
   */
  acquireNavigation(request: NavigationRequest): NavigationAcquisition;
  getNavigationState(): NavigationState | null;
  onNavigationChange(listener: (state: NavigationState | null) => void): () => void;
  /** The globe camera's whole state now, or null before it exists or in a simulation. */
  captureNavigationSnapshot(): NavigationSnapshot | null;
  /**
   * Puts the globe camera back exactly as captured: the orbit target's ECEF
   * position is used as saved, not re-derived from the surface. Refused
   * (false) while a lease other than `lease` holds navigation.
   */
  restoreNavigationSnapshot(snapshot: NavigationSnapshot, lease?: NavigationLease): boolean;
  /**
   * While `lease` holds navigation, puts the globe camera's eye at the view's
   * position, looking along its forward with its up and field of view: nearer
   * than the zoom limit, at any pitch and through the ground, as a flight into
   * a panorama's orb needs. The camera's limits and collisions return when a
   * snapshot is restored or the lease ends. Refused (false) otherwise.
   */
  placeNavigationCamera(lease: NavigationLease, view: NavigationPresentation): boolean;
  /**
   * What the globe camera holds to on its own: its tilt and distance limits
   * (`camera.pitchLimits`, `camera.zoomLimits`) and how much speed a glide
   * keeps each 60 Hz frame (`camera.inertiaDecay`). An owner that placed the
   * camera and hands it back moving brakes and settles it by these.
   */
  getCameraHandling(): CameraHandling;
  /**
   * Hands a placed camera back to the globe moving, before `lease` ends: at
   * `view`'s eye and look, orbiting the point where its line of sight comes
   * down to the orbit target's height near `pivot`, and gliding on at
   * `motion`'s velocity and turn as after a flick, slowing by
   * `camera.inertiaDecay`. Nearer that point than `camera.zoomLimits`
   * allows, it may come as near as its glide takes it, until it is out past
   * the limit. A tilt beyond `camera.pitchLimits` comes inside at once and
   * the roll levels; the field of view eases to `motion.fovRad` at the
   * glide's rate. When the lease ends, input begun since `motion.inputSince`
   * goes on moving the camera. Refused (false) unless `lease` holds navigation.
   */
  glideNavigationCamera(lease: NavigationLease, view: NavigationPresentation, pivot: EcefVector, motion: NavigationGlide): boolean;
  /** The current lease's presented view, or null while the globe camera's view is drawn. */
  getPresentationView(): NavigationPresentation | null;
  /**
   * Where controller intents go in a context other than "globe": the lease
   * holder's handler. Returns a function that removes it.
   */
  setNavigationIntentHandler(lease: NavigationLease, handler: (frame: ActionIntentFrame) => void): () => void;
  applyNavigationIntents(frame: ActionIntentFrame): void;
  /**
   * Increases on every WebGPU device loss. Resources made for an earlier
   * generation are gone; after `onDeviceRestored` they can be made again.
   */
  getDeviceGeneration(): number;
  onDeviceLost(listener: () => void): () => void;
  onDeviceRestored(listener: () => void): () => void;
  /**
   * The runtime's frame profiling, off until switched on. The runtime closes
   * each frame and times its own map work; a host adds its sections to
   * `frameProfile.profiler`. See foss-earth/perf.
   */
  frameProfile: FrameProfileSession;
  destroy(): void;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

interface FallbackExperience {
  globeMesh: AbstractMesh;
  light: HemisphericLight;
}

function createFallbackExperience(scene: Scene, worldRoot: TransformNode | null, ambientFillMultiplier: number): FallbackExperience {
  scene.clearColor = DEFAULT_FALLBACK_BACKGROUND;

  const light = new HemisphericLight("fallback-light", new Vector3(0, 1, 0), scene);
  light.intensity = 0.95 * ambientFillMultiplier;

  const globeMesh = MeshBuilder.CreateSphere(
    "fallback-globe",
    { diameter: PLANET_RADIUS_METERS * 2, segments: 96 },
    scene,
  );
  globeMesh.isPickable = false;
  // Incoming tiles compile while the fallback is still visible. Its light
  // must not enter their material variants, then disappear at the handoff.
  light.includedOnlyMeshes = [globeMesh];
  if (worldRoot) {
    globeMesh.parent = worldRoot;
  }

  const globeMaterial = new StandardMaterial("fallback-globe-material", scene);
  globeMaterial.diffuseColor = Color3.FromHexString("#355f8f");
  globeMaterial.specularColor = Color3.FromHexString("#1f2937");
  globeMesh.material = globeMaterial;

  return { globeMesh, light };
}

function createGeospatialCamera(scene: Scene): GeospatialCamera {
  const camera = new GeospatialCamera("geo-camera", scene, {
    planetRadius: PLANET_RADIUS_METERS,
  });
  // Remove Babylon's built-in pointer + wheel inputs. We drive the camera entirely
  // through our own InputController (wheel/touch/mouse/safariGestures); leaving
  // Babylon's GeospatialCameraPointersInput and GeospatialCameraMouseWheelInput
  // attached makes every gesture get processed twice (ours + Babylon's pinch/drag),
  // producing the jumpy "camera moves in other ways while zooming" behavior on touch.
  camera.inputs.removeByType("GeospatialCameraPointersInput");
  camera.inputs.removeByType("GeospatialCameraMouseWheelInput");
  camera.attachControl(true);

  const { x: cx, y: cy, z: cz } = geodeticToEcef(
    DEFAULT_CAMERA_LAT_DEG * DEG_TO_RAD,
    DEFAULT_CAMERA_LON_DEG * DEG_TO_RAD,
    0,
  );
  camera.center = new Vector3(cx, cy, cz);
  camera.radius = DEFAULT_CAMERA_ALTITUDE_METERS;
  camera.yaw = DEFAULT_CAMERA_YAW_RAD;
  camera.pitch = DEFAULT_CAMERA_PITCH_RAD;
  camera.checkCollisions = true;

  return camera;
}

export async function createBabylonRuntime(
  canvas: HTMLCanvasElement,
  options: BabylonRuntimeOptions = {},
): Promise<BabylonRuntime> {
  const settings = options.settings ?? getAppSettings();
  const savedGoogleKey = settings.get("map.source.googleKey");
  const normalizedApiKey = options.googleApiKey?.trim() || (typeof savedGoogleKey === "string" ? savedGoogleKey.trim() : "");
  const mapDebugEnabled = new URLSearchParams(window.location.search).get("mapDebug") === "1";
  const mapDebugEvents: MapDebugEvent[] = [];
  const recordMapDebugEvent = (event: string, detail?: Record<string, unknown>): void => {
    if (!mapDebugEnabled) return;
    mapDebugEvents.push({ at: performance.now(), event, detail });
    if (mapDebugEvents.length > 100) mapDebugEvents.shift();
  };
  const hasGoogleApiKey = normalizedApiKey.length > 0;
  const shouldStartGoogle = hasGoogleApiKey && options.preferGoogleTiles !== false;
  const simMode = options.simMode === true;
  const backend = settings.get("renderer.backend");
  const { renderer, scene } = await bootstrapGlobeRenderer(canvas, {
    force: options.rendererForce ?? (backend === "webgpu" || backend === "webgl2" || backend === "webgl" ? backend : null),
    antialias: settings.get("renderer.antialias") !== false,
  });
  // Relative display controls preserve the existing material-processing path.
  // They neither change physical source emission nor introduce a postprocess.
  scene.imageProcessingConfiguration.exposure = 2 ** settings.get<number>("renderer.exposureEV");
  let ambientFillMultiplier = settings.get<number>("renderer.ambientFillMultiplier");
  // One profiler per runtime; off, it leaves nothing attached to the scene.
  const frameProfile = createFrameProfileSession({ scene, engine: renderer.engine });
  const presentationCandidates = createPresentationCandidates(scene, NAVIGATION_PRESENTATION_LAYER);
  const applyPresentationCandidates = (): void => presentationCandidates.setEnabled(
    settings.has(RENDERER_EXPERIMENT_IDS.presentationCandidates) && settings.get(RENDERER_EXPERIMENT_IDS.presentationCandidates) === true,
  );
  applyPresentationCandidates();
  const { profiler } = frameProfile;
  // Defaults and bounds that depend on the renderer can now be resolved.
  settings.setDeviceContext({
    rendererMode: renderer.mode,
    maxTextureSize: (renderer.engine.getCaps() as { maxTextureSize?: number }).maxTextureSize ?? null,
    rendererDevicePixels: renderer.devicePixels ?? null,
  });
  if (renderer.antialias === false && settings.get("renderer.antialias") !== false) {
    settings.setNote("renderer.antialias", "Off: WebGPU could only start without it on this device.");
  }
  /** Pixels drawn per device pixel: `renderer.resolutionScale`, which the canvas follows on every resize. */
  const applyResolutionScale = (): void => {
    const scale = settings.get("renderer.resolutionScale");
    const ratio = (window.devicePixelRatio || 1) * (typeof scale === "number" && scale > 0 ? scale : 1);
    renderer.engine.setHardwareScalingLevel(1 / ratio);
  };
  applyResolutionScale();
  const captureFromUrl = new URLSearchParams(window.location.search).get("terrainCapture") === "1";
  const terrainCapture = options.terrainPerformanceCapture ?? (captureFromUrl ? createTerrainPerformanceCapture() : undefined);
  const previousCapture = window.fossTerrainPerformance;
  if (captureFromUrl) window.fossTerrainPerformance = terrainCapture;

  let simLight: HemisphericLight | null = null;
  if (simMode) {
    scene.clearColor = new Color4(0.45, 0.65, 0.92, 1);
    simLight = new HemisphericLight("sim-light", new Vector3(0, 1, 0), scene);
    simLight.intensity = 1.1 * ambientFillMultiplier;
  }

  const downloadMeter = createMapDownloadMeter();
  let tilesRuntime: GoogleTilesRuntime | null = null;
  let googleTerrainDetailTarget: number | null = null;
  const anchorForRefinement = (value: unknown): GoogleTerrainDetailAnchor => (value === "focus" ? "focus-point" : "camera");
  let googleTerrainDetailAnchor: GoogleTerrainDetailAnchor = anchorForRefinement(settings.get("map.focus.refineFrom"));
  let rasterTilesRuntime: RasterTilesRuntime | null = null;
  let googleTilesStartupWatchdog: number | null = null;
  let fallbackExperienceCreated = false;
  let fallbackExperience: FallbackExperience | null = null;
  let googleLight: HemisphericLight | null = null;
  let geospatialCamera: GeospatialCamera | null = null;
  let cameraController: CameraController | null = null;
  let inertialCameraController: InertialCameraController | null = null;
  let inputController: InputController | null = null;
  let orbitModeActive = false;
  let simRunning = simMode;
  let simTick: ((deltaSeconds: number) => void) | null = null;
  let simViewState: GlobeViewState | null = null;
  let preparationViewState: GlobeViewState | null = null;
  let preparationRadiusMeters = 0;
  let preparationCamera: UniversalCamera | null = null;
  let activePreparationCamera: Camera | null = null;
  let preparationPreviousCamera: Camera | null = null;
  let preparationTick: ((now: number) => void) | null = null;
  let cancelPreparation: ((error: Error) => void) | null = null;
  let activeRasterBaseMap = options.rasterBaseMap ?? null;
  // Focus points: the built-in orbit target and those a host registers.
  const focusPoints = new Map<string, FocusPoint>();
  const syncFocusChoices = (): void => settings.setChoices("map.focus.point", [
    { id: "orbit-target", label: simMode ? "Simulation origin" : "Orbit target" },
    ...[...focusPoints.values()].map(point => ({ id: point.id, label: point.label })),
  ]);
  syncFocusChoices();
  const worldMatrix = (): ReturnType<TransformNode["computeWorldMatrix"]> | null => (worldRoot ? worldRoot.computeWorldMatrix(true) : null);
  const ecefToScene = (ecef: { x: number; y: number; z: number }): Vector3 => {
    const world = worldMatrix();
    const point = new Vector3(ecef.x, ecef.y, ecef.z);
    return world ? Vector3.TransformCoordinates(point, world) : point;
  };
  /** The orbit target in ECEF: the globe camera's target, or a simulation's floating origin. */
  const orbitTarget = (): { x: number; y: number; z: number } | null => {
    if (worldRoot) {
      if (!worldRoot.parent) return null;
      const origin = Vector3.TransformCoordinates(Vector3.Zero(), worldRoot.computeWorldMatrix(true).clone().invert());
      return { x: origin.x, y: origin.y, z: origin.z };
    }
    const center = geospatialCamera?.center;
    return center ? { x: center.x, y: center.y, z: center.z } : null;
  };
  // Both maps' updates in one frame see the same focus position; outside a
  // frame, such as a host's own update, it is read fresh.
  let inFrame = false;
  // From the start of a tick until its render: meshes added now are drawn by
  // that render, so they ask for no frame of their own (sceneUpdates.ts).
  let preparingFrame = false;
  let focusCache: { value: { x: number; y: number; z: number } | null } | null = null;
  /** The selected focus point, read at most once per rendered frame. */
  const focusPosition = (): { x: number; y: number; z: number } | null => {
    if (inFrame && focusCache) return focusCache.value;
    const id = String(settings.get("map.focus.point"));
    const point = focusPoints.get(id);
    let value: { x: number; y: number; z: number } | null = null;
    try { value = point ? point.getPosition() : orbitTarget(); } catch { value = null; }
    value = value && [value.x, value.y, value.z].every(Number.isFinite) ? { x: value.x, y: value.y, z: value.z } : null;
    if (inFrame) focusCache = { value };
    return value;
  };
  /** The region to load around the focus point, when the focus mode asks for one. */
  const focusRequest = (): { mode: "around" | "both"; position: { x: number; y: number; z: number }; radiusMeters: number; horizonCull: boolean } | null => {
    const mode = settings.get("map.focus.mode");
    if (mode !== "around" && mode !== "both") return null;
    const position = focusPosition();
    if (!position) return null;
    const radius = settings.get("map.focus.radius");
    return { mode, position, radiusMeters: typeof radius === "number" ? radius : 0, horizonCull: settings.get("map.focus.horizonCull") !== false };
  };

  // A provider's key goes into its requests only: the source the rest of the app sees has none.
  const keyedSource = (source: RasterBaseMapSource): RasterBaseMapSource => {
    const key = source.apiKey ? settings.get(source.apiKey.parameter) : "";
    return withSourceKey(source, typeof key === "string" ? key : "");
  };
  let activeTerrainSource = resolveTerrainSource(options.terrainSource);
  const detailAdjustedListeners = new Set<(decision: AutoDetailDecision) => void>();
  let lastRasterFrameAt = performance.now();
  const worldRoot = simMode ? new TransformNode("sim-world-root", scene) : null;

  // Held while Google tiles are initializing so the scheduler pumps
  // tiles.update() every frame even when the user hasn't moved the camera.
  // Without this the render-on-demand scheduler idles after the very first
  // frame and the tile-load loop stalls until a camera gesture wakes it.
  let startupHeld = false;
  const releaseStartupHold = (): void => {
    if (!startupHeld) return;
    startupHeld = false;
    scheduler.endContinuous();
  };

  // Streaming signal: shared between the tiles event wiring (which sets it via
  // beginStreaming/endStreaming) and the public onTilesStreamingChange API.
  const streamingListenersRef = new Set<(streaming: boolean) => void>();
  const streamingActiveRef = { value: false };

  // Render-on-demand scheduler. The tick runs inertial decay, tiles streaming,
  // and the scene render in that order; the scheduler keeps pumping while
  // inertia is still active or while a continuous-mode caller (e.g. tile load)
  // holds a reference, and idles otherwise.
  const status: BabylonRuntimeStatus = {
    mode: shouldStartGoogle ? "google-tiles" : "fallback",
    message: shouldStartGoogle
      ? "Google Photorealistic 3D Tiles are initializing."
      : "Fallback mode active.",
    googleApiKeyProvided: hasGoogleApiKey,
    rasterBaseMap: activeRasterBaseMap,
    terrainSource: activeTerrainSource,
    lastError: null,
  };
  /** Everything a frame does before its render, the host's simulation last. */
  const prepareFrame = (frameNow: number): void => {
    // The frame boundary: everything below, the host's simulation included, is this frame's.
    frameProfile.frame(frameNow);
    profiler.tag("engine frame", renderer.engine.frameId);
    terrainCapture?.beginFrame(frameNow);
    let started = profiler.clock();
    if (!simMode) {
      inertialCameraController?.update();
      stepFovReturn(frameNow);
    }
    updateTerrainPreparationCamera();
    profiler.add("map/camera", started);
    started = profiler.clock();
    tilesRuntime?.update();
    adoptGoogleCoverage();
    profiler.add("map/google tiles", started);
    started = profiler.clock();
    // Frames drawn while a lease holds navigation are not map frames.
    rasterTilesRuntime?.reportFrame(frameNow, frameNow - lastRasterFrameAt, document.hidden || mapsSuspended);
    lastRasterFrameAt = frameNow;
    rasterTilesRuntime?.update();
    profiler.add("map/raster tiles", started);
    adoptRasterCoverage();
    // beginFrame/endFrame are normally invoked by engine.runRenderLoop's
    // internal _processFrame. We bypass that loop, so we must bracket the
    // render ourselves — WebGPU only presents the swap chain inside
    // endFrame(), and engine.getFps() / frameId are only updated in
    // beginFrame(). Without this the canvas stays black on WebGPU.
    renderer.engine.beginFrame();
    const deltaSeconds = Math.max(renderer.engine.getDeltaTime() / 1000, 1 / 240);
    simTick?.(deltaSeconds);
  };
  const scheduler: RenderScheduler = createRenderScheduler({
    tick: () => {
      inFrame = true;
      focusCache = null;
      const frameNow = performance.now();
      preparingFrame = true;
      try {
        prepareFrame(frameNow);
      } finally {
        preparingFrame = false;
      }
      scene.render();
      renderer.engine.endFrame();
      // Sampling after render observes current mesh transforms, including the
      // simulation's floating origin. Refinement keeps running with no aircraft.
      const started = profiler.clock();
      preparationTick?.(frameNow);
      profiler.add("map/terrain preparation", started);
      terrainCapture?.endFrame();
      inFrame = false;
      focusCache = null;
      if (mapDebugEnabled) {
        recordMapDebugEvent("scene-render", { mode: status.mode, enabledMeshes: scene.meshes.filter(mesh => mesh.isEnabled()).length });
      }
    },
    shouldKeepRendering: () => simRunning || (inertialCameraController?.isActive() ?? false) || fovReturn !== null,
    minFrameIntervalMs: () => {
      const cap = settings.get("renderer.frameRateCap");
      return typeof cap === "number" && cap > 0 ? 1000 / cap : 0;
    },
  });

  // Frames for what enters or leaves the scene, and one more after a frame
  // that skipped something not yet ready to draw (sceneUpdates.ts). It judges a
  // frame when the scheduler goes idle after it; one about to run makes any
  // wait moot. A hidden page draws nothing, and draws once on its return.
  const sceneUpdates = createSceneUpdates({
    scene,
    requestRender: () => scheduler.requestRender(),
    isPreparingFrame: () => preparingFrame,
  });
  const stopSettling = scheduler.onActiveChange(active => {
    if (active) sceneUpdates.cancelSettle();
    else if (!document.hidden) sceneUpdates.settle();
  });

  // Credits are the shell's to show: the map source HUD links the basemap's,
  // and the Map tab the elevation provider's.
  const statusListeners = new Set<(status: BabylonRuntimeStatus) => void>();
  const rasterDetailListeners = new Set<() => void>();
  const googleDetailListeners = new Set<() => void>();
  let rasterDetailOffset = 0;
  const emitStatus = (): void => {
    options.onStatusChange?.({ ...status });
    for (const listener of [...statusListeners]) listener({ ...status });
  };
  const knownRasterBaseMaps = new Map<string, RasterBaseMapSource>();
  const emitRasterDetailFeedback = (): void => {
    const displayedId = rasterTilesRuntime?.getDisplayedSourceId() ?? null;
    const displayed = displayedId ? knownRasterBaseMaps.get(displayedId) ?? status.rasterBaseMap : null;
    if (status.mode === "raster-basemap" && displayed && status.displayedRasterBaseMap?.id !== displayed.id) {
      status.displayedRasterBaseMap = displayed;
      emitStatus();
    }
    for (const listener of [...rasterDetailListeners]) listener();
  };

  function clearGoogleWatchdog(): void {
    if (googleTilesStartupWatchdog !== null) {
      window.clearTimeout(googleTilesStartupWatchdog);
      googleTilesStartupWatchdog = null;
    }
  }

  let streamingHeld = false;
  // While a lease holds navigation the maps start nothing, so a load in
  // progress would hold continuous rendering until the lease ends.
  let mapsSuspended = false;
  const beginStreaming = (): void => {
    if (streamingHeld || mapsSuspended) return;
    streamingHeld = true;
    streamingActiveRef.value = true;
    scheduler.beginContinuous();
    for (const listener of streamingListenersRef) listener(true);
  };
  const endStreaming = (): void => {
    if (!streamingHeld) return;
    streamingHeld = false;
    streamingActiveRef.value = false;
    scheduler.endContinuous();
    for (const listener of streamingListenersRef) listener(false);
  };

  // The globe camera and its input follow `camera.*` and the device rates.
  function cameraFieldOfViewRad(): number {
    return settings.get<number>("camera.fieldOfView") * DEG_TO_RAD;
  }
  function cameraLimits(): CameraLimits {
    const pitch = settings.get("camera.pitchLimits");
    const zoom = settings.get("camera.zoomLimits");
    return {
      pitchDeg: isNumberRange(pitch) ? pitch : DEFAULT_CAMERA_LIMITS.pitchDeg,
      zoomMeters: isNumberRange(zoom) ? zoom : DEFAULT_CAMERA_LIMITS.zoomMeters,
    };
  }
  function groundFollow(): GroundFollow {
    return {
      speedMetersPerSecond: settings.get<number>("camera.surfaceFollowSpeed"),
      zoomStepMeters: settings.get<number>("camera.orbitTargetZoomStep"),
      retryMs: settings.get<number>("camera.surfaceRetry"),
    };
  }
  function inputRates(): InputRates {
    const rates = { ...DEFAULT_INPUT_RATES };
    for (const [field, id] of Object.entries(INPUT_RATE_IDS) as Array<[keyof InputRates, string]>) {
      const value = settings.get(id);
      if (typeof value === "number") rates[field] = value;
    }
    return rates;
  }

  /**
   * `renderer.clipping`: Babylon's geospatial clipping sets the near and far
   * planes from the camera's height each frame; fixed, they are the range's ends.
   */
  let clippingBehavior: GeospatialClippingBehavior | null = null;
  function applyClipping(): void {
    const camera = geospatialCamera;
    if (!camera) return;
    if (settings.get("renderer.clipping") === "fixed") {
      if (clippingBehavior) camera.removeBehavior(clippingBehavior);
      clippingBehavior = null;
      const range = settings.get("renderer.clipping.fixed");
      if (isNumberRange(range)) {
        camera.minZ = range.min;
        camera.maxZ = range.max;
      }
    } else if (!clippingBehavior) {
      clippingBehavior = new GeospatialClippingBehavior();
      camera.addBehavior(clippingBehavior);
    }
  }

  function ensureGeospatialCamera(): GeospatialCamera {
    if (geospatialCamera) {
      // Flight mode owns scene.activeCamera with its cockpit/chase camera.
      // Map transitions only need the geospatial camera to exist; activating it
      // here replaces that flight camera (which has been disabled) and renders
      // an empty scene.
      if (!simMode || !scene.activeCamera) scene.activeCamera = geospatialCamera;
      return geospatialCamera;
    }

    geospatialCamera = createGeospatialCamera(scene);
    geospatialCamera.fov = cameraFieldOfViewRad();
    applyClipping();
    if (!simMode || !scene.activeCamera) scene.activeCamera = geospatialCamera;
    cameraController = new CameraController(geospatialCamera);
    cameraController.setLimits(cameraLimits());
    cameraController.setGroundFollow(groundFollow());
    const baseInertial = createInertialCameraController(cameraController, {
      decayPerFrame: () => settings.get<number>("camera.inertiaDecay"),
    });
    // Every input gesture goes through the inertial controller. Wrap its input
    // methods so each one wakes the on-demand scheduler. The wrapped methods
    // delegate to the underlying controller, which queues velocity; the
    // scheduler then pumps frames until the velocity decays under threshold
    // (via shouldKeepRendering -> isActive()).
    inertialCameraController = {
      panBy(dx, dy, h) {
        baseInertial.panBy(dx, dy, h);
        scheduler.requestRender();
      },
      orbitBy(p, h) {
        baseInertial.orbitBy(p, h);
        scheduler.requestRender();
      },
      zoomBy(f) {
        baseInertial.zoomBy(f);
        scheduler.requestRender();
      },
      beginAnchorPan(pick) {
        baseInertial.cancel();
        return cameraController!.beginAnchorPan(pick);
      },
      panAnchorTo(pick, sensitivity) {
        const moved = cameraController!.panAnchorTo(pick, sensitivity);
        if (moved) {
          scheduler.requestRender();
        }
        return moved;
      },
      getAnchorPanScreenError(pick) {
        return cameraController!.getAnchorPanScreenError(pick);
      },
      endAnchorPan() {
        cameraController!.endAnchorPan();
      },
      update: baseInertial.update,
      /** Stop inertial velocity only — does not end an active anchor-pan grab. */
      cancelInertial() {
        baseInertial.cancel();
      },
      cancel() {
        baseInertial.cancel();
        cameraController?.endAnchorPan();
      },
      isActive: baseInertial.isActive,
    };
    inputController = simMode
      ? null
      : createInputController(canvas, inertialCameraController, { isOrbitMode: () => orbitModeActive });
    inputController?.setRates(inputRates());

    return geospatialCamera;
  }

  /**
   * Preparation must select the same tiles a camera would normally select.
   * The flight camera can be aimed at the horizon (or temporarily absent), so
   * use an overhead view only while the loading overlay is present. This is a
   * camera change, not a tile traversal or download-priority override.
   */
  function updateTerrainPreparationCamera(): void {
    if (!preparationViewState) return;

    let camera: Camera;
    if (simMode && worldRoot?.parent) {
      if (!preparationCamera) {
        preparationCamera = new UniversalCamera("terrain-preparation-camera", Vector3.Zero(), scene);
        preparationCamera.fov = 1.05;
        preparationCamera.minZ = 1;
        preparationCamera.maxZ = 250_000;
      }
      const altitudeMeters = Math.max(3000, preparationRadiusMeters * 3);
      preparationCamera.position.set(0, altitudeMeters, 0);
      preparationCamera.setTarget(Vector3.Zero());
      preparationCamera.setEnabled(true);
      camera = preparationCamera;
    } else {
      const geospatial = ensureGeospatialCamera();
      if (activePreparationCamera !== geospatial) {
        const center = geodeticToEcef(
          preparationViewState.latDeg * DEG_TO_RAD,
          preparationViewState.lonDeg * DEG_TO_RAD,
          0,
        );
        geospatial.center = new Vector3(center.x, center.y, center.z);
        geospatial.radius = Math.max(3000, preparationRadiusMeters * 3);
        geospatial.yaw = 0;
        geospatial.pitch = 0;
      }
      // Prepare the destination once. Later input and its inertia must remain
      // visible to the caller so it can cancel preparation without losing motion.
      geospatial.setEnabled(true);
      camera = geospatial;
    }

    if (activePreparationCamera !== camera) {
      activePreparationCamera = camera;
    }
    scene.activeCamera = camera;
  }

  function beginTerrainPreparationCamera(): void {
    preparationPreviousCamera = scene.activeCamera;
    updateTerrainPreparationCamera();
  }

  function endTerrainPreparationCamera(): void {
    const camera = activePreparationCamera;
    activePreparationCamera = null;
    if (camera && scene.activeCamera === camera) {
      scene.activeCamera = preparationPreviousCamera;
    }
    preparationPreviousCamera = null;
    preparationCamera?.setEnabled(false);
  }

  function ensureFallbackExperience(): void {
    if (fallbackExperienceCreated) {
      scene.clearColor = DEFAULT_FALLBACK_BACKGROUND;
      fallbackExperience?.globeMesh.setEnabled(true);
      fallbackExperience?.light.setEnabled(true);
      recordMapDebugEvent("fallback-show");
      return;
    }

    fallbackExperience = createFallbackExperience(scene, worldRoot, ambientFillMultiplier);
    fallbackExperienceCreated = true;
    recordMapDebugEvent("fallback-create");
  }

  function hideFallbackExperience(): void {
    fallbackExperience?.globeMesh.setEnabled(false);
    fallbackExperience?.light.setEnabled(false);
    recordMapDebugEvent("fallback-hide");
  }

  function adoptGoogleCoverage(): void {
    if (status.mode !== "google-tiles" || !tilesRuntime?.tiles.visibleTiles.size) return;
    if (!startupHeld && !rasterTilesRuntime && !fallbackExperience?.globeMesh.isEnabled()) return;
    // Selection publishes drawable Google content before loading finishes.
    // Retire the previous surface in this same frame: retaining it until
    // load-end draws overlapping ground throughout ongoing streaming.
    hideFallbackExperience();
    if (rasterTilesRuntime) {
      recordMapDebugEvent("raster-runtime-dispose");
      rasterTilesRuntime.dispose();
      rasterTilesRuntime = null;
    }
    clearGoogleWatchdog();
    releaseStartupHold();
  }

  function adoptRasterCoverage(): void {
    if (status.mode !== "raster-basemap" || (rasterTilesRuntime?.getMetrics().visibleTiles ?? 0) === 0) return;
    if (!tilesRuntime && !fallbackExperience?.globeMesh.isEnabled()) return;
    hideFallbackExperience();
    if (tilesRuntime) {
      recordMapDebugEvent("google-runtime-dispose");
      tilesRuntime.dispose();
      tilesRuntime = null;
      googleLight?.dispose();
      googleLight = null;
    }
  }

  function enableFallbackMode(reason: string): void {
    recordMapDebugEvent("fallback-mode-select", { reason });
    releaseStartupHold();
    endStreaming();

    if (activeRasterBaseMap) {
      enableRasterBaseMapMode(reason);
      return;
    }

    if (status.mode === "fallback" && fallbackExperienceCreated) {
      status.lastError = reason;
      status.message = "Fallback mode active due to Google tiles load failure.";
      emitStatus();
      return;
    }

    clearGoogleWatchdog();

    if (tilesRuntime) recordMapDebugEvent("google-runtime-dispose");
    tilesRuntime?.dispose();
    tilesRuntime = null;
    if (rasterTilesRuntime) recordMapDebugEvent("raster-runtime-dispose");
    rasterTilesRuntime?.dispose();
    rasterTilesRuntime = null;

    if (googleLight) {
      googleLight.dispose();
      googleLight = null;
    }

    status.mode = "fallback";
    status.lastError = reason;
    status.message = "Fallback mode active due to Google tiles load failure.";

    ensureGeospatialCamera();
    ensureFallbackExperience();

    console.warn("[runtime] Switching to fallback mode", { reason });
    emitStatus();
  }

  function enableRasterBaseMapMode(reason: string | null, recreate = false): void {
    recordMapDebugEvent("raster-mode-select", { source: activeRasterBaseMap?.id ?? null, reason, recreate });
    const retainRasterCoverage = status.mode === "raster-basemap"
      && (rasterTilesRuntime?.getMetrics().visibleTiles ?? 0) > 0;
    const retainGoogleCoverage = status.mode === "google-tiles"
      && (tilesRuntime?.tiles.visibleTiles.size ?? 0) > 0;
    releaseStartupHold();
    endStreaming();
    clearGoogleWatchdog();

    // Keep visible Google geometry until raster coverage has been adopted.
    // A pending Google runtime has no useful coverage and must not leave stale
    // callbacks that can later change the selected raster mode.
    if (!retainGoogleCoverage) {
      if (tilesRuntime) recordMapDebugEvent("google-runtime-dispose");
      tilesRuntime?.dispose();
      tilesRuntime = null;
      googleLight?.dispose();
      googleLight = null;
    }

    ensureGeospatialCamera();
    ensureFallbackExperience();
    // Switching from Google (or a failed raster load) has no raster coverage
    // yet. Keep the simple globe visible until actual raster tiles arrive;
    // otherwise the canvas is just the clear colour during the handoff.
    if (retainRasterCoverage || retainGoogleCoverage) hideFallbackExperience();

    const rasterBaseMap = activeRasterBaseMap;
    if (!rasterBaseMap) {
      enableFallbackMode(reason ?? "No raster basemap was configured.");
      return;
    }

    if (recreate || !rasterTilesRuntime) {
      if (rasterTilesRuntime) recordMapDebugEvent("raster-runtime-dispose");
      rasterTilesRuntime?.dispose();
      rasterTilesRuntime = createRasterTilesRuntime({
        onDownloadBytes: downloadMeter.addBytes,
        scene,
        source: keyedSource(rasterBaseMap),
        settings,
        getFocus: () => {
          const request = focusRequest();
          if (!request) return null;
          const finest = settings.get("map.focus.detailBelow.imagery");
          return { ...request, offsetCap: typeof finest === "number" ? finest : null };
        },
        worldRoot: worldRoot ?? undefined,
        getSurfaceHeightMeters: options.getSurfaceHeightMeters,
        terrainSource: activeTerrainSource,
        detailOffset: rasterDetailOffset,
        onDetailAdjusted: decision => {
          const why = decision.reason === "settings" ? "automatic-adjustment settings changed"
            : `frames averaged ${decision.meanFrameMs.toFixed(1)} ms against a ${decision.goalMs.toFixed(1)} ms goal`;
          const text = `${decision.to > decision.from ? "Coarsened" : "Refined"} 2D map detail to ${formatLevels(decision.to)} below the request: ${why}.`;
          console.info("[map auto]", text);
          recordMapDebugEvent("detail-adjusted", { ...decision });
          for (const listener of detailAdjustedListeners) listener(decision);
        },
        imagery: options.rasterImagery ?? (settings.get("map.detail.imageryPath") === "legacy" ? "legacy" : DEFAULT_RASTER_IMAGERY),
        onDetailFeedback: emitRasterDetailFeedback,
        performanceCapture: terrainCapture,
        requestRender: () => scheduler.requestRender(),
        onDebugEvent: recordMapDebugEvent,
        onLoadStart: () => {
          recordMapDebugEvent("raster-load-start");
          status.message = `${activeRasterBaseMap?.label ?? "Raster"} tiles are loading.`;
          beginStreaming();
          emitStatus();
        },
        onLoadEnd: (visibleTiles, activeTiles) => {
          recordMapDebugEvent("raster-load-end", { visibleTiles, activeTiles });
          status.message = `${activeRasterBaseMap?.label ?? "Raster"} active (visible: ${visibleTiles}, active: ${activeTiles}).`;
          if (visibleTiles > 0) {
            adoptRasterCoverage();
          }
          endStreaming();
          scheduler.requestRender();
          emitStatus();
        },
        onLoadError: (error, url) => {
          recordMapDebugEvent("raster-load-error", { error: error.message, url });
          status.lastError = `${error.message} (${url})`;
          status.message = `${activeRasterBaseMap?.label ?? "Raster"} reported tile load errors.`;
          emitStatus();
        },
      });
    } else if (rasterTilesRuntime.source.id !== rasterBaseMap.id) {
      rasterTilesRuntime.setSource(keyedSource(rasterBaseMap));
    }
    rasterTilesRuntime.setSuspended(mapsSuspended);

    status.mode = "raster-basemap";
    status.rasterBaseMap = rasterBaseMap;
    knownRasterBaseMaps.set(rasterBaseMap.id, rasterBaseMap);
    const displayedId = rasterTilesRuntime.getDisplayedSourceId();
    status.displayedRasterBaseMap = knownRasterBaseMaps.get(displayedId) ?? rasterBaseMap;
    status.terrainSource = activeTerrainSource;
    status.lastError = reason;
    status.message = reason
      ? `${rasterBaseMap.label} active after Google tiles failed.`
      : `${rasterBaseMap.label} raster basemap active.`;
    rasterTilesRuntime.update();
    scheduler.requestRender();

    console.info("[runtime] Raster basemap runtime initialized", { source: rasterBaseMap.id, terrain: activeTerrainSource.id, reason });
    emitStatus();
  }

  function enableGoogleTilesMode(): void {
    recordMapDebugEvent("google-mode-select");
    releaseStartupHold();
    endStreaming();
    clearGoogleWatchdog();
    const retainRasterCoverage = (rasterTilesRuntime?.getMetrics().visibleTiles ?? 0) > 0;
    // Preserve the last usable raster surface until Google has visible tiles.
    if (!retainRasterCoverage) {
      if (rasterTilesRuntime) recordMapDebugEvent("raster-runtime-dispose");
      rasterTilesRuntime?.dispose();
      rasterTilesRuntime = null;
    }
    if (!hasGoogleApiKey) {
      if (activeRasterBaseMap) enableRasterBaseMapMode("Google 3D Tiles need an API key.");
      else enableFallbackMode("Google 3D Tiles need an API key.");
      return;
    }
    tilesRuntime?.dispose();
    tilesRuntime = null;
    googleLight?.dispose();
    googleLight = null;

    try {
      scene.clearColor = DEFAULT_GOOGLE_BACKGROUND;

      ensureGeospatialCamera();
      ensureFallbackExperience();
      if (retainRasterCoverage) hideFallbackExperience();
      scene.clearColor = DEFAULT_GOOGLE_BACKGROUND;

      googleLight = new HemisphericLight("google-tiles-light", new Vector3(0, 1, 0), scene);
      googleLight.intensity = ambientFillMultiplier;

      // Hold a continuous-render reference from startup until the first tiles
      // become visible. This ensures tiles.update() is called every frame so
      // the tile-load loop progresses without requiring a camera gesture.
      startupHeld = true;
      scheduler.beginContinuous();

      tilesRuntime = createGoogleTilesRuntime({
        onDownloadBytes: downloadMeter.addBytes,
        scene,
        apiKey: normalizedApiKey,
        onDetailFeedback: () => {
          if (status.mode === "google-tiles") for (const listener of [...googleDetailListeners]) listener();
        },
        // Flight attaches the simulation world to a floating-origin parent.
        // Before that happens, terrain preparation owns the active camera and
        // its normal camera-based detail selection remains the safe behavior.
        settings,
        getTerrainDetailAnchor: () => {
          if (googleTerrainDetailAnchor === "focus-point") {
            const focus = focusPosition();
            return focus ? ecefToScene(focus) : null;
          }
          return null;
        },
        getFocus: () => {
          const request = focusRequest();
          if (!request) return null;
          const finest = settings.get("map.focus.detailBelow.google");
          return { ...request, finestErrorPx: typeof finest === "number" ? finest : null };
        },
        onLoadError: (error, url) => {
          if (status.mode !== "google-tiles") return;
          recordMapDebugEvent("google-load-error", { error: error.message, url });
          status.lastError = error.message;
          status.message = "Google tiles reported load errors.";
          emitStatus();

          if (!tilesRuntime || tilesRuntime.tiles.visibleTiles.size === 0) {
            enableFallbackMode(
              `Google 3D tiles could not be loaded (${error.message}). Check key permissions and API access for tile.googleapis.com.`,
            );
          }
        },
        onLoadStart: () => {
          if (status.mode !== "google-tiles") return;
          recordMapDebugEvent("google-load-start");
          status.message = "Google tiles are loading.";
          beginStreaming();
          emitStatus();
        },
        onLoadEnd: (visibleTiles, activeTiles) => {
          if (status.mode !== "google-tiles") return;
          recordMapDebugEvent("google-load-end", { visibleTiles, activeTiles });
          status.lastError = null;
          status.message = `Google tiles loaded (visible: ${visibleTiles}, active: ${activeTiles}).`;
          endStreaming();
          scheduler.requestRender();
          emitStatus();

          if (visibleTiles > 0) {
            adoptGoogleCoverage();
          }
        },
      });

      if (googleTerrainDetailTarget !== null) {
        tilesRuntime.setTerrainDetailTarget(googleTerrainDetailTarget);
      }
      tilesRuntime.setSuspended(mapsSuspended);

      tilesRuntime.tiles.checkCollisions = true;
      if (worldRoot) {
        tilesRuntime.tiles.group.parent = worldRoot;
      }

      status.mode = "google-tiles";
      status.message = "Google Photorealistic 3D Tiles mode active.";
      status.lastError = null;
      emitStatus();

      googleTilesStartupWatchdog = window.setTimeout(() => {
        if (status.mode !== "google-tiles") {
          return;
        }

        if (!tilesRuntime || tilesRuntime.tiles.visibleTiles.size === 0) {
          enableFallbackMode(
            "No Google tiles became visible after startup. Confirm your API key is valid, Maps Tiles API is enabled, and localhost is allowed in key restrictions.",
          );
        }
      }, simMode ? 120_000 : 10_000);

      console.info("[runtime] Google tiles runtime initialized");
    } catch (error) {
      console.error("[runtime] Google tiles initialization failed, entering fallback mode", error);
      enableFallbackMode(getErrorMessage(error));
    }
  }

  emitStatus();

  if (shouldStartGoogle) {
    enableGoogleTilesMode();
  } else {
    if (activeRasterBaseMap) {
      enableRasterBaseMapMode(null);
    } else {
      ensureGeospatialCamera();
      ensureFallbackExperience();
      status.message = "Fallback mode active: missing Google Maps API key.";
      emitStatus();
    }

    console.warn("[runtime] No Google Maps API key found. Starting without Google 3D tiles.");
  }

  function applyMapSource(source: "google" | RasterBaseMapSource): void {
    recordMapDebugEvent("map-source-selection", { source });
    if (source === "google") {
      if (status.mode !== "google-tiles") enableGoogleTilesMode();
      return;
    }
    if (activeRasterBaseMap?.id === source.id && status.mode === "raster-basemap") return;
    activeRasterBaseMap = source;
    enableRasterBaseMapMode(null);
  }

  function applyTerrainSource(source: TerrainSource): void {
    const nextSource = resolveTerrainSource(source);
    if (activeTerrainSource.id === nextSource.id) return;
    activeTerrainSource = nextSource;
    status.terrainSource = nextSource;
    if (status.mode === "raster-basemap") {
      rasterTilesRuntime?.setTerrainSource(nextSource);
      scheduler.requestRender();
    }
    emitStatus();
  }

  // The runtime follows its parameters wherever they change: the Map tab, Show
  // all parameters, an import, a preset or another tab.
  const stopWatchingSettings = [
    settings.subscribe(changed => {
      let visibleChange = false;
      if (changed.has("renderer.exposureEV")) {
        const exposure = 2 ** settings.get<number>("renderer.exposureEV");
        if (scene.imageProcessingConfiguration.exposure !== exposure) {
          scene.imageProcessingConfiguration.exposure = exposure;
          visibleChange = true;
        }
      }
      if (changed.has("renderer.ambientFillMultiplier")) {
        ambientFillMultiplier = settings.get<number>("renderer.ambientFillMultiplier");
        // These relative baselines retain the established lighting across map
        // modes. Application-owned lights, including emitters, are untouched.
        for (const [light, baseline] of [[simLight, 1.1], [googleLight, 1], [fallbackExperience?.light, 0.95]] as const) {
          if (!light || light.intensity === baseline * ambientFillMultiplier) continue;
          light.intensity = baseline * ambientFillMultiplier;
          visibleChange ||= light.isEnabled();
        }
      }
      // Imports/presets can change both controls together: draw that change once.
      if (visibleChange) scheduler.requestRender();
    }),
    settings.watch("map.source.basemap", value => {
      const id = String(value);
      if (id === "google") applyMapSource("google");
      else if (isKnownRasterBaseMapId(id)) applyMapSource(resolveRasterBaseMapSource(id));
    }),
    settings.watch("map.source.elevation", value => applyTerrainSource(resolveTerrainSource(String(value)))),
    settings.watch("map.focus.refineFrom", value => {
      googleTerrainDetailAnchor = anchorForRefinement(value);
      scheduler.requestRender();
    }),
    settings.watch("map.source.cartoKey", () => {
      const source = activeRasterBaseMap;
      if (status.mode !== "raster-basemap" || !source?.apiKey || !rasterTilesRuntime) return;
      rasterTilesRuntime.setSource(keyedSource(source));
      scheduler.requestRender();
    }),
    // Both maps read the focus region each frame; a change needs one drawn.
    ...FOCUS_PARAMETER_IDS.map(id => settings.watch(id, () => {
      focusCache = null;
      scheduler.requestRender();
    })),
    settings.watch("renderer.resolutionScale", () => {
      applyResolutionScale();
      renderer.engine.resize();
      scheduler.requestRender();
    }),
    // A lower cap takes effect from the next frame; a higher one needs a frame to start from.
    settings.watch("renderer.frameRateCap", () => scheduler.requestRender()),
    ...(settings.has(RENDERER_EXPERIMENT_IDS.presentationCandidates) ? [settings.watch(RENDERER_EXPERIMENT_IDS.presentationCandidates, () => {
      applyPresentationCandidates();
      scheduler.requestRender();
    })] : []),
    ...["renderer.clipping", "renderer.clipping.fixed"].map(id => settings.watch(id, () => {
      applyClipping();
      scheduler.requestRender();
    })),
    settings.watch("camera.fieldOfView", () => {
      fovReturn = null;
      if (geospatialCamera) geospatialCamera.fov = cameraFieldOfViewRad();
      scheduler.requestRender();
    }),
    ...["camera.pitchLimits", "camera.zoomLimits"].map(id => settings.watch(id, () => {
      cameraController?.setLimits(cameraLimits());
      scheduler.requestRender();
    })),
    ...["camera.surfaceFollowSpeed", "camera.orbitTargetZoomStep"].map(id => settings.watch(id, () => cameraController?.setGroundFollow(groundFollow()))),
    ...Object.values(INPUT_RATE_IDS).map(id => settings.watch(id, () => inputController?.setRates(inputRates()))),
  ];

  // The HTTP tile cache is shared by every map on the page; its limits are parameters.
  const MiB = 1024 * 1024;
  const settingNumber = (id: string): number => {
    const value = settings.get(id);
    return typeof value === "number" ? value : 0;
  };
  const applyMapCacheLimits = (): void => setMapCacheLimits({
    maxBytes: settingNumber("map.cache.httpBytes") * MiB,
    maxEntries: Math.round(settingNumber("map.cache.httpEntries")),
    maxTileBytes: settingNumber("map.cache.maxTileBytes") * MiB,
  });
  applyMapCacheLimits();
  stopWatchingSettings.push(
    settings.watch("map.cache.httpBytes", applyMapCacheLimits),
    settings.watch("map.cache.httpEntries", applyMapCacheLimits),
    settings.watch("map.cache.maxTileBytes", applyMapCacheLimits),
  );

  // Each budget shows what it bounds, read while its section is on screen.
  const mebibytes = (bytes: number): string => `${bytes >= 10 * MiB ? Math.round(bytes / MiB) : (bytes / MiB).toFixed(1)} MiB`;
  const imagery = () => (status.mode === "raster-basemap" ? rasterTilesRuntime?.getImageryDiagnostics().atlas ?? null : null);
  let uploadSample: { at: number; bytes: number } | null = null;
  const google = () => (status.mode === "google-tiles" ? tilesRuntime?.getLoadingState?.() ?? null : null);
  const raster = () => (status.mode === "raster-basemap" ? rasterTilesRuntime : null);
  const formatPx = (px: number): string => `${px >= 10 ? Math.round(px) : px.toFixed(1)} px`;
  const because = (decision: AutoDetailDecision | null): string => (decision
    ? decision.reason === "settings" ? ", since automatic-adjustment settings changed"
      : `, since frames averaged ${decision.meanFrameMs.toFixed(1)} ms against a ${decision.goalMs.toFixed(1)} ms goal`
    : "");
  const readings: Array<[string, () => string | null]> = [
    ["map.imagery.gpuBudget", () => {
      const atlas = imagery()?.atlas;
      return atlas ? `${mebibytes(atlas.estimatedGpuBytes)} allocated, ${atlas.capacity - atlas.freeSlots} of ${atlas.capacity} pages in use` : null;
    }],
    ["map.imagery.stagingBudget", () => {
      const residency = imagery()?.residency;
      return residency ? `${mebibytes(residency.stagedBytes + residency.inFlightReservedBytes)} waiting` : null;
    }],
    ["map.imagery.concurrentRequests", () => {
      const residency = imagery()?.residency;
      return residency ? `${residency.inFlight} in flight` : null;
    }],
    ["map.imagery.queuedRequests", () => {
      const residency = imagery()?.residency;
      return residency ? `${residency.queued} queued${residency.overflow > 0 ? `, ${residency.overflow} left out` : ""}` : null;
    }],
    ["map.imagery.uploadPerFrame", () => {
      const counters = imagery()?.counters;
      if (!counters) return null;
      const at = performance.now();
      const previous = uploadSample;
      uploadSample = { at, bytes: counters.uploadBytes };
      if (!previous || at <= previous.at) return null;
      return `${mebibytes(((counters.uploadBytes - previous.bytes) * 1000) / (at - previous.at))}/s uploaded`;
    }],
    ["map.imagery.selectionTimePerFrame", () => {
      const plan = imagery()?.plan;
      return plan ? `the last choice took ${plan.cpuMs.toFixed(1)} ms over ${plan.nodesEvaluated} regions` : null;
    }],
    ["map.imagery.maxNodes", () => {
      const plan = imagery()?.plan;
      return plan ? `${plan.nodesEvaluated} examined${plan.truncated ? ", limit reached" : ""}` : null;
    }],
    ["map.focus.radius", () => {
      const diagnostics = imagery();
      const focus = diagnostics?.focus;
      if (!focus) return null;
      const limited = diagnostics.plan?.limits.includes("memory") ? "; the GPU budget limits its detail" : "";
      return `${focus.pages} imagery pages in the region, about ${focus.estimatedPages} expected from this view${limited}`;
    }],
    ["map.detail.terrain.default", () => {
      const terrain = raster()?.getTerrainState();
      return terrain ? `${formatPx(terrain.targetPx)} in use${terrain.targetPx !== terrain.requestedTargetPx ? `, ${formatPx(terrain.requestedTargetPx)} asked for` : ""}` : null;
    }],
    ["map.terrain.maxTiles", () => {
      const terrain = raster()?.getTerrainState();
      return terrain ? `${terrain.selectedTiles} chosen, ${terrain.neededTiles} in view or around the focus point${terrain.truncated ? ", limit reached" : ""}` : null;
    }],
    ["map.auto.terrainDetail", () => {
      const runtime = raster();
      const auto = runtime?.getAutoDetailState();
      if (!runtime || !auto?.terrainEnabled) return null;
      const terrain = runtime.getTerrainState();
      return auto.adjustment > 0 && terrain.targetPx > terrain.requestedTargetPx
        ? `${formatPx(terrain.targetPx)}, coarser than the ${formatPx(terrain.requestedTargetPx)} asked for${because(auto.lastDecision)}`
        : "At the detail asked for";
    }],
    ["map.auto.imageryDetail", () => {
      const auto = raster()?.getAutoDetailState();
      if (!auto?.imageryEnabled) return null;
      return auto.offset < auto.requestedOffset
        ? `${formatLevels(auto.requestedOffset - auto.offset)} coarser than asked for${because(auto.lastDecision)}`
        : "At the detail asked for";
    }],
    ["map.auto.frameTimeGoal", () => {
      const auto = raster()?.getAutoDetailState();
      if (!auto || auto.goalMs === null) return null;
      return `${auto.goalMs.toFixed(1)} ms in use${auto.lastMeanMs !== null ? `; the last window averaged ${auto.lastMeanMs.toFixed(1)} ms` : ""}`;
    }],
    ["map.terrain.cachedTiles", () => {
      const metrics = status.mode === "raster-basemap" ? rasterTilesRuntime?.getMetrics() : null;
      return metrics ? `${metrics.activeTiles} kept, ${metrics.visibleTiles} shown` : null;
    }],
    ["map.google.cacheTiles", () => { const state = google(); return state ? `${state.cachedTiles} kept` : null; }],
    ["map.google.cacheBytes", () => { const state = google(); return state ? `${mebibytes(state.cachedBytes)} kept` : null; }],
    ["map.google.downloads", () => { const state = google(); return state ? `${state.downloading} downloading` : null; }],
    ["map.google.parses", () => { const state = google(); return state ? `${state.parsing} parsing` : null; }],
  ];
  const removeReadings = readings.map(([id, read]) => settings.setReadingSource(id, read));

  const handleResize = () => {
    // The device pixel ratio changes between displays and with browser zoom.
    applyResolutionScale();
    renderer.engine.resize();
    scheduler.requestRender();
  };
  window.addEventListener("resize", handleResize);

  const handleVisibility = () => {
    scheduler.setPaused(document.hidden);
  };
  document.addEventListener("visibilitychange", handleVisibility);

  if (mapDebugEnabled) {
    window.__fossMapDebug = {
      get runtimeMode() { return status.mode; },
      get sceneMeshCount() { return scene.meshes.length; },
      get enabledMeshCount() { return scene.meshes.filter(mesh => mesh.isEnabled()).length; },
      get rasterVisibleTiles() { return rasterTilesRuntime?.getMetrics().visibleTiles ?? 0; },
      get rasterActiveTiles() { return rasterTilesRuntime?.getMetrics().activeTiles ?? 0; },
      get fallbackEnabled() { return fallbackExperience?.globeMesh.isEnabled() ?? false; },
      get activeCamera() { return scene.activeCamera?.name ?? null; },
      get schedulerActive() { return scheduler.isActive(); },
      get pendingTextureCount() { return scene.textures.filter(texture => !texture.isReady()).length; },
      get readyTextureCount() { return scene.textures.filter(texture => texture.isReady()).length; },
      get recentEvents() { return mapDebugEvents; },
    };
    recordMapDebugEvent("debug-ready");
  }

  // Kick the first frame so initial scene state paints.
  scheduler.requestRender();

  const surface = createSurfaceQuery(scene, () => worldRoot, mesh => Boolean(mesh.metadata?.mapSurface)
    || Boolean(tilesRuntime && mesh.isDescendantOf(tilesRuntime.tiles.group)),
    () => status.mode === "google-tiles" ? tilesRuntime?.getRevision() ?? 0 : rasterTilesRuntime?.getRevision() ?? 0,
    (lat, lon) => status.mode === "raster-basemap" ? rasterTilesRuntime?.sample(lat, lon) : undefined);

  function prepareTerrain(request: TerrainPreparationOptions): Promise<TerrainPreparationResult> {
    try { validateTerrainPreparation(request); } catch (error) { return Promise.reject(error); }
    cancelPreparation?.(new DOMException("Terrain preparation was replaced by another destination.", "AbortError"));
    if (request.signal?.aborted) return Promise.reject(new DOMException("Terrain preparation cancelled.", "AbortError"));
    const sourceMode = status.mode;
    if (sourceMode === "fallback") {
      if (status.lastError) return Promise.reject(new Error(status.lastError));
      const groundHeightMeters = options.getSurfaceHeightMeters?.(request.latDeg, request.lonDeg) ?? 0;
      request.onProgress?.({ phase: "ready", readySamples: 1, totalSamples: 1, progress: 1, message: "World ready." });
      return Promise.resolve({ groundHeightMeters, altitudeMeters: Math.max(request.altitudeMeters ?? -Infinity,
        groundHeightMeters + (request.altitudeAboveGroundMeters ?? (request.altitudeMeters === undefined ? 1524 : 0)),
        groundHeightMeters + (request.clearanceMeters ?? 1000)) });
    }
    const radiusMeters = request.radiusMeters ?? 1000;
    preparationRadiusMeters = radiusMeters;
    preparationViewState = { latDeg: request.latDeg, lonDeg: request.lonDeg, headingDeg: 0, pitchDeg: 90,
      zoomMeters: Math.max(2000, radiusMeters * 2) };
    beginTerrainPreparationCamera();
    const points = terrainReadinessSamples(request.latDeg, request.lonDeg, radiusMeters);
    const preparationStartedAt = performance.now();
    let lastTerrainProgressAt = preparationStartedAt;
    let lastTerrainSignature = "";
    let centerQuality: number | null = null;
    let settledChecks = 0;
    /**
     * Google tiles with work left: queued, downloading, parsing or with
     * children being prepared, which is all the renderer's own idle test
     * counts. Null when not on Google or not known.
     */
    const googlePendingTiles = (): number | null => {
      if (sourceMode !== "google-tiles") return null;
      const loading = tilesRuntime?.getLoadingState?.();
      return loading
        ? loading.queued + loading.downloading + loading.parsing + loading.waitingToParse + loading.preparingChildren
        : null;
    };
    let latestProgress: Parameters<NonNullable<TerrainPreparationOptions["onProgress"]>>[0] = {
      phase: "loading", readySamples: 0, totalSamples: points.length, progress: 0,
      message: "Waiting for terrain to cover the aircraft's location.",
    };
    const publishPreparationProgress = (progress: typeof latestProgress, failure?: Error): void => {
      const now = performance.now();
      const raster = sourceMode === "raster-basemap" ? rasterTilesRuntime : null;
      const requests = raster?.getLoadingDiagnostics?.();
      const visibleTiles = raster?.getMetrics().visibleTiles ?? tilesRuntime?.tiles.visibleTiles.size ?? 0;
      // Queue churn and retries are activity, not improvement in usable ground.
      const signature = `${progress.readySamples}/${centerQuality}/${visibleTiles}`;
      if (signature !== lastTerrainSignature) {
        lastTerrainSignature = signature;
        lastTerrainProgressAt = now;
      }
      const stalledForMs = now - lastTerrainProgressAt;
      // Provider errors can contain signed URLs or API keys. Reports retain
      // the endpoint and error, never URL credentials or query strings.
      const lastError = (failure?.message ?? status.lastError)?.replace(/https?:\/\/[^\s)]+/g, value => {
        try { const url = new URL(value); return url.origin + url.pathname; }
        catch { return "[provider URL]"; }
      }) ?? null;
      latestProgress = {
        ...progress,
        diagnostics: {
          status: failure ? "failed" : progress.phase === "ready" ? "ready" : stalledForMs >= 15_000 ? "stalled" : "loading",
          provider: sourceMode === "google-tiles" ? "Google 3D Tiles" : activeTerrainSource.label,
          elapsedMs: now - preparationStartedAt,
          stalledForMs,
          timeoutMs: request.timeoutMs ?? 120_000,
          activeElevationRequests: requests?.activeElevationRequests ?? null,
          queuedElevationRequests: requests?.queuedElevationRequests ?? null,
          pendingTiles: requests?.pendingTiles ?? googlePendingTiles(),
          visibleTiles,
          centerQuality,
          requiredQuality: sourceMode === "google-tiles" ? null : 10,
          lastError,
        },
      };
      request.onProgress?.(latestProgress);
    };
    scheduler.beginContinuous();
    return new Promise<TerrainPreparationResult>((resolve, reject) => {
      let settled = false;
      let lastSampleAt = -Infinity;
      const abort = () => finish(new DOMException("Terrain preparation cancelled.", "AbortError"));
      const timeout = window.setTimeout(() => finish(new Error("Terrain near the destination did not become ready. Check the map connection and retry.")), request.timeoutMs ?? 120_000);
      function finish(error: Error | null, result?: TerrainPreparationResult): void {
        if (settled) return;
        settled = true;
        if (error) publishPreparationProgress({ ...latestProgress, message: error.message }, error);
        window.clearTimeout(timeout);
        request.signal?.removeEventListener("abort", abort);
        preparationTick = null;
        cancelPreparation = null;
        endTerrainPreparationCamera();
        preparationViewState = null;
        preparationRadiusMeters = 0;
        scheduler.endContinuous();
        if (error) reject(error);
        else resolve(result!);
      }
      cancelPreparation = error => finish(error);
      request.signal?.addEventListener("abort", abort, { once: true });
      preparationTick = now => {
        if (sourceMode !== status.mode) {
          finish(new Error(status.lastError ?? "Map source changed while preparing the destination. Retry with the selected map."));
          return;
        }
        if (now - lastSampleAt < 200) return;
        lastSampleAt = now;
        const samples = points.map(point => surface.sample(point.latDeg, point.lonDeg));
        centerQuality = samples[0]?.quality ?? null;
        // Google is ready once its renderer has loaded what it chose for the
        // preparation view, on two checks in a row: before that, its surface
        // can be a coarse tile far from the ground.
        const pending = googlePendingTiles();
        settledChecks = pending === 0 ? settledChecks + 1 : 0;
        const evaluation = evaluateTerrainReadiness(request, samples, sourceMode === "google-tiles", pending === null || settledChecks >= 2);
        const result = evaluation.result;
        // A complete sample set is a coherent snapshot of displayed terrain.
        // Waiting for subsequent samples made normal tile eviction reset the
        // loading bar from 95% to zero before a flight could begin.
        if (result) {
          publishPreparationProgress({ ...evaluation.progress, phase: "ready", progress: 1, message: "Terrain ready for flight." });
          finish(null, result);
          return;
        }
        publishPreparationProgress(evaluation.progress);
      };
      publishPreparationProgress(latestProgress);
      scheduler.requestRender();
    });
  }

  // ─── Navigation ownership ─────────────────────────────────────────
  const captureNavigationSnapshot = (): NavigationSnapshot | null => {
    const camera = geospatialCamera;
    const view = cameraController?.getViewState();
    if (simMode || !camera || !view) return null;
    const { x, y, z } = camera.center;
    // A field of view on its way back is the one it returns to.
    return { version: 1, view, camera: { center: { x, y, z }, yaw: camera.yaw, pitch: camera.pitch, radius: camera.radius, fov: fovReturn?.target ?? camera.fov } };
  };
  const restoreNavigationSnapshot = (snapshot: NavigationSnapshot, lease?: NavigationLease): boolean => {
    const current = navigation.current();
    const camera = geospatialCamera;
    if ((current && current !== lease) || !camera || simMode) return false;
    inertialCameraController?.cancel();
    fovReturn = null;
    const { center, yaw, pitch, radius, fov } = snapshot.camera;
    // A view saved nearer than the zoom limit, after a handback, is kept as near.
    cameraController?.allowNearer(radius);
    // From a placed view, the camera reaches the orbit with collisions still
    // off: each of the steps below moves the eye, and the steps between are
    // not places it passes through.
    camera.center = new Vector3(center.x, center.y, center.z);
    camera.yaw = yaw;
    camera.pitch = pitch;
    camera.radius = radius;
    camera.fov = fov;
    restoreCameraLimits();
    scheduler.requestRender();
    return true;
  };
  // A placed camera's lifted limits and collisions, until a snapshot is restored or the lease ends.
  let liftedCameraLimits: { collisions: boolean; pitchMin: number; pitchMax: number } | null = null;
  function restoreCameraLimits(): void {
    const camera = geospatialCamera;
    if (!liftedCameraLimits || !camera) return;
    camera.checkCollisions = liftedCameraLimits.collisions;
    camera.limits.pitchMin = liftedCameraLimits.pitchMin;
    camera.limits.pitchMax = liftedCameraLimits.pitchMax;
    // The zoom limit may have changed meanwhile; its setting is the source.
    camera.limits.radiusMin = cameraController?.zoomMinMeters() ?? cameraLimits().zoomMeters.min;
    liftedCameraLimits = null;
  }
  /** Metres from a placed eye to the orbit centre it turns about: any point on its line of sight. */
  const PLACED_REACH_METERS = 1;
  /** The frame `camera.inertiaDecay` is given per. */
  const GLIDE_FRAME_MS = 1000 / 60;
  /** A field of view within this of the globe's, radians, has returned to it. */
  const FOV_RETURNED_RAD = 1e-4;
  const placeNavigationCamera = (lease: NavigationLease, view: NavigationPresentation): boolean => {
    const camera = geospatialCamera;
    if (navigation.current() !== lease || lease.released || !camera || simMode) return false;
    inertialCameraController?.cancel();
    if (!liftedCameraLimits) {
      liftedCameraLimits = { collisions: camera.checkCollisions, pitchMin: camera.limits.pitchMin, pitchMax: camera.limits.pitchMax };
      camera.checkCollisions = false;
      camera.limits.radiusMin = 0;
      camera.limits.pitchMin = 0;
      camera.limits.pitchMax = Math.PI;
    }
    const forward = new Vector3(view.forward.x, view.forward.y, view.forward.z).normalize();
    const center = new Vector3(view.position.x, view.position.y, view.position.z).addInPlace(forward.scale(PLACED_REACH_METERS));
    const angles = ComputeYawPitchFromLookAtToRef(forward, center, scene.useRightHandedSystem, camera.yaw, new Vector2());
    camera.center = center;
    camera.yaw = angles.x;
    // Straight up or down would wrap; stay just inside.
    camera.pitch = Math.min(Math.PI - 1e-6, Math.max(1e-6, angles.y));
    camera.radius = PLACED_REACH_METERS;
    camera.fov = view.verticalFovRad;
    // Babylon keeps its own up level; a placed view may roll. Set after the
    // orientation, before the view matrix is built from it again.
    camera.upVector.set(view.up.x, view.up.y, view.up.z);
    // A collision offset left from before could alias Babylon's scratch vectors; placed, there is none.
    camera.perFrameCollisionOffset = new Vector3();
    scheduler.requestRender();
    return true;
  };
  // A handed-back camera's field of view easing to the globe's, at the glide's rate.
  let fovReturn: { target: number; lastMs: number | null } | null = null;
  // Input already under way that goes on to the globe when the lease ends.
  let pendingHandback: InputHandback | null = null;
  function glideKeepPerFrame(): number {
    const decay = settings.get("camera.inertiaDecay");
    return Math.max(0, Math.min(0.999, typeof decay === "number" ? decay : DEFAULT_INERTIA_DECAY_PER_FRAME));
  }
  function stepFovReturn(nowMs: number): void {
    const camera = geospatialCamera;
    if (!fovReturn || !camera || navigation.current()) return;
    const dt = fovReturn.lastMs === null ? GLIDE_FRAME_MS : Math.max(0, Math.min(100, nowMs - fovReturn.lastMs));
    fovReturn.lastMs = nowMs;
    camera.fov = fovReturn.target + (camera.fov - fovReturn.target) * Math.pow(glideKeepPerFrame(), dt / GLIDE_FRAME_MS);
    if (Math.abs(camera.fov - fovReturn.target) < FOV_RETURNED_RAD) {
      camera.fov = fovReturn.target;
      fovReturn = null;
    }
  }
  const glideNavigationCamera = (lease: NavigationLease, view: NavigationPresentation, pivot: EcefVector, motion: NavigationGlide): boolean => {
    const camera = geospatialCamera;
    const controller = cameraController;
    if (navigation.current() !== lease || lease.released || !camera || !controller || simMode) return false;
    inertialCameraController?.cancel();
    const vector = (value: EcefVector): GlideVec3 => [value.x, value.y, value.z];
    const unit = (value: GlideVec3): GlideVec3 => { const size = Math.hypot(...value); return [value[0] / size, value[1] / size, value[2] / size]; };
    const eye = vector(view.position);
    const at = vector(pivot);
    const forward = withinTilt(unit(vector(view.forward)), unit(at), controller.getLimits().pitchDeg, vector(view.up));
    const place = ecefToGeodetic(pivot.x, pivot.y, pivot.z);
    const center = orbitCenterOnSight(eye, forward, at, controller.orbitTargetHeightAt(place.latRad * RAD_TO_DEG, place.lonRad * RAD_TO_DEG));
    const radius = Math.hypot(center[0] - eye[0], center[1] - eye[1], center[2] - eye[2]);
    const anglesOf = (look: GlideVec3, about: GlideVec3): { yaw: number; pitch: number } => {
      const angles = ComputeYawPitchFromLookAtToRef(new Vector3(...look), new Vector3(...about), scene.useRightHandedSystem, camera.yaw, new Vector2());
      return { yaw: angles.x, pitch: angles.y };
    };
    const angles = anglesOf(forward, center);
    const canvasHeightPx = Math.max(1, canvas.clientHeight || canvas.height || 1);
    const rates = orbitGlideRates({ center, forward, radius, verticalFovRad: view.verticalFovRad, canvasHeightPx }, vector(motion.velocity), vector(motion.turn), anglesOf);
    const frame = GLIDE_FRAME_MS / 1000;
    // As near as the glide's zoom takes it: each frame's step, capped as the glide caps it, summed as the glide slows.
    const zoomStep = Math.max(-MAX_ZOOM_LOG_DELTA_PER_FRAME, Math.min(MAX_ZOOM_LOG_DELTA_PER_FRAME, rates.zoomLog * frame));
    controller.allowNearer(radius * Math.exp(Math.min(0, zoomStep) / (1 - glideKeepPerFrame())));
    // Collisions are still off from the placement, so the steps below are not swept through the ground.
    camera.center = new Vector3(...center);
    camera.yaw = angles.yaw;
    camera.pitch = angles.pitch;
    camera.radius = radius;
    camera.fov = view.verticalFovRad;
    controller.followGroundFromHere();
    restoreCameraLimits();
    fovReturn = motion.fovRad !== view.verticalFovRad ? { target: motion.fovRad, lastMs: null } : null;
    pendingHandback = { keepWheelSince: motion.inputSince, press: motion.press ?? null };
    inertialCameraController?.panBy(rates.panPx.x * frame, rates.panPx.y * frame, canvasHeightPx);
    inertialCameraController?.orbitBy(rates.orbitDeg.pitch * frame, rates.orbitDeg.heading * frame);
    inertialCameraController?.zoomBy(Math.exp(rates.zoomLog * frame));
    scheduler.requestRender();
    return true;
  };
  let presentationMaskBefore: number | null = null;
  let streamingBeforeSuspension = false;
  let startupHoldBeforeSuspension = false;
  let intentHandler: { lease: NavigationLease; handler: (frame: ActionIntentFrame) => void } | null = null;
  const navigation = createNavigationOwner({
    unavailable: () => (simMode ? "A simulation owns the camera." : geospatialCamera ? null : "The globe camera is not ready."),
    snapshot: captureNavigationSnapshot,
    suspend() {
      inputController?.setSuspended(true);
      inertialCameraController?.cancel();
      // A field of view on its way back arrives at once: the lease's overview has it.
      if (fovReturn && geospatialCamera) geospatialCamera.fov = fovReturn.target;
      fovReturn = null;
      mapsSuspended = true;
      streamingBeforeSuspension = streamingHeld;
      startupHoldBeforeSuspension = startupHeld;
      endStreaming();
      releaseStartupHold();
      tilesRuntime?.setSuspended(true);
      rasterTilesRuntime?.setSuspended(true);
    },
    resume() {
      intentHandler = null;
      restoreCameraLimits();
      mapsSuspended = false;
      tilesRuntime?.setSuspended(false);
      rasterTilesRuntime?.setSuspended(false);
      inputController?.setSuspended(false, pendingHandback ?? undefined);
      pendingHandback = null;
      // Continue a load the lease interrupted, if it still has work.
      const google = tilesRuntime?.getLoadingState();
      const googlePending = google ? google.queued + google.downloading + google.parsing + google.waitingToParse > 0 : false;
      const rasterPending = (rasterTilesRuntime?.getLoadingDiagnostics?.().pendingTiles ?? 0) > 0;
      if (streamingBeforeSuspension && (googlePending || rasterPending)) beginStreaming();
      if (startupHoldBeforeSuspension && tilesRuntime && tilesRuntime.tiles.visibleTiles.size === 0 && !startupHeld) {
        startupHeld = true;
        scheduler.beginContinuous();
      }
      streamingBeforeSuspension = false;
      startupHoldBeforeSuspension = false;
    },
    present(view) {
      const camera = geospatialCamera;
      if (!camera) return;
      if (view) {
        if (presentationMaskBefore === null) presentationMaskBefore = camera.layerMask;
        camera.layerMask = NAVIGATION_PRESENTATION_LAYER;
      } else if (presentationMaskBefore !== null) {
        camera.layerMask = presentationMaskBefore;
        presentationMaskBefore = null;
      }
    },
    requestRender: () => scheduler.requestRender(),
    beginContinuous: () => scheduler.beginContinuous(),
    endContinuous: () => scheduler.endContinuous(),
  });

  // A lost WebGPU device ends navigation; its owner rebuilds after restoration.
  let deviceGeneration = 0;
  const deviceLostListeners = new Set<() => void>();
  const deviceRestoredListeners = new Set<() => void>();
  const deviceLostObserver = renderer.engine.onContextLostObservable.add(() => {
    deviceGeneration += 1;
    navigation.end("device-lost");
    for (const listener of [...deviceLostListeners]) listener();
  });
  const deviceRestoredObserver = renderer.engine.onContextRestoredObservable.add(() => {
    for (const listener of [...deviceRestoredListeners]) listener();
    scheduler.requestRender();
  });

  const applyGlobeNavigationIntents = (frame: GlobeNavigationIntentFrame): void => {
    if (simMode || !inertialCameraController || navigation.current()) {
      return;
    }
    const dt = Number.isFinite(frame.dt) ? Math.max(0, Math.min(0.1, frame.dt)) : 0;
    if (dt === 0) {
      return;
    }
    const canvasHeight = Math.max(1, canvas.clientHeight || canvas.height || 1);
    for (const intent of frame.intents) {
      const value = Number.isFinite(intent.value) ? Math.max(-1, Math.min(1, intent.value)) : 0;
      switch (intent.actionId) {
        case "globe.panX":
          inertialCameraController.panBy(value * 900 * dt, 0, canvasHeight);
          break;
        case "globe.panY":
          inertialCameraController.panBy(0, -value * 900 * dt, canvasHeight);
          break;
        case "globe.orbitHeading":
          inertialCameraController.orbitBy(0, value * 75 * dt);
          break;
        case "globe.orbitPitch":
          inertialCameraController.orbitBy(value * 65 * dt, 0);
          break;
        case "globe.zoom":
          inertialCameraController.zoomBy(Math.exp(-value * 1.5 * dt));
          break;
      }
    }
  };

  return {
    surface,
    prepareTerrain,
    engine: renderer.engine,
    scene,
    renderer,
    status,
    get geospatialCamera(): GeospatialCamera | null {
      return geospatialCamera;
    },
    getViewState(): GlobeViewState | null {
      if (simMode && simViewState) return simViewState;
      return cameraController?.getViewState() ?? null;
    },
    setViewState(partial: Partial<GlobeViewState>): void {
      inertialCameraController?.cancel();
      cameraController?.setViewState(partial);
      scheduler.requestRender();
    },
    configureOrbitTargetHeight(options: OrbitTargetHeightOptions | null): void {
      inertialCameraController?.cancel();
      cameraController?.configureOrbitTargetHeight(options);
      scheduler.requestRender();
    },
    getTileMetrics(): BabylonTileMetrics | null {
      if (tilesRuntime) {
        return {
          visibleTiles: tilesRuntime.tiles.visibleTiles.size,
          activeTiles: tilesRuntime.tiles.activeTiles.size,
        };
      }
      return rasterTilesRuntime?.getMetrics() ?? null;
    },
    getGoogleTerrainDetailState(): GoogleTerrainDetailState | null {
      return tilesRuntime?.getTerrainDetailState() ?? null;
    },
    onGoogleDetailFeedback(listener): () => void {
      googleDetailListeners.add(listener);
      return () => { googleDetailListeners.delete(listener); };
    },
    setGoogleTerrainDetailTarget(errorTarget: number | null): void {
      googleTerrainDetailTarget = errorTarget;
      tilesRuntime?.setTerrainDetailTarget(errorTarget);
      scheduler.requestRender();
    },
    registerFocusPoint(point: FocusPoint): () => void {
      if (point.id === "orbit-target") throw new Error("The focus point id orbit-target is built in.");
      focusPoints.set(point.id, point);
      syncFocusChoices();
      focusCache = null;
      scheduler.requestRender();
      return () => {
        if (focusPoints.get(point.id) !== point) return;
        focusPoints.delete(point.id);
        syncFocusChoices();
        focusCache = null;
        scheduler.requestRender();
      };
    },
    getFocusPosition: focusPosition,
    getGoogleTerrainDetailAnchor(): GoogleTerrainDetailAnchor {
      return googleTerrainDetailAnchor;
    },
    setGoogleTerrainDetailAnchor(anchor: GoogleTerrainDetailAnchor): void {
      googleTerrainDetailAnchor = anchor;
      scheduler.requestRender();
    },
    setRasterDetailTarget(offset: number): void {
      if (!Number.isFinite(offset) || offset === rasterDetailOffset) return;
      rasterDetailOffset = offset;
      rasterTilesRuntime?.setDetailTarget(offset);
      scheduler.requestRender();
    },
    getRasterDetailFeedback(): RasterDetailFeedback | null {
      return status.mode === "raster-basemap" ? rasterTilesRuntime?.getDetailFeedback() ?? null : null;
    },
    onRasterDetailFeedback(listener: () => void): () => void {
      rasterDetailListeners.add(listener);
      return () => { rasterDetailListeners.delete(listener); };
    },
    subscribeStatus(listener: (status: BabylonRuntimeStatus) => void): () => void {
      statusListeners.add(listener);
      return () => { statusListeners.delete(listener); };
    },
    setRasterBaseMap(source): void {
      if (activeRasterBaseMap?.id === source.id && status.mode === "raster-basemap") return;
      activeRasterBaseMap = source;
      enableRasterBaseMapMode(null);
    },
    setMapSource: applyMapSource,
    setTerrainSource: applyTerrainSource,
    onDetailAdjusted(listener): () => void {
      detailAdjustedListeners.add(listener);
      return () => { detailAdjustedListeners.delete(listener); };
    },
    setOrbitMode(active: boolean): void {
      orbitModeActive = active;
    },
    setInputMode(mode: InputModePreference): void {
      inputController?.setMode(mode);
    },
    getInputMode(): InputModePreference {
      return inputController?.getMode() ?? "auto";
    },
    setInputSensitivity(sensitivity: Partial<InputSensitivitySettings>): void {
      inputController?.setSensitivity(sensitivity);
    },
    applyGlobeNavigationIntents,
    setGlobeAnchorRotation(enabled: boolean): void {
      inputController?.setGlobeAnchorRotation(enabled);
    },
    getGlobeAnchorRotation(): boolean {
      return inputController?.getGlobeAnchorRotation() ?? false;
    },
    requestRender(): void {
      scheduler.requestRender();
    },
    beginContinuous(): void {
      scheduler.beginContinuous();
    },
    endContinuous(): void {
      scheduler.endContinuous();
    },
    setPaused(paused: boolean): void {
      scheduler.setPaused(paused);
    },
    isRendering(): boolean {
      return scheduler.isActive();
    },
    onActiveRenderChange(listener): () => void {
      return scheduler.onActiveChange(listener);
    },
    getMapDownloadBytesPerSecond: downloadMeter.getBytesPerSecond,
    onMapDownloadRateChange: downloadMeter.subscribe,
    isStreamingTiles(): boolean {
      return streamingActiveRef.value;
    },
    onTilesStreamingChange(listener): () => void {
      streamingListenersRef.add(listener);
      return () => {
        streamingListenersRef.delete(listener);
      };
    },
    getWorldRoot(): TransformNode | null {
      return worldRoot;
    },
    setSimViewState(partial: Partial<GlobeViewState>): void {
      if (!simMode) return;
      const current = simViewState ?? {
        latDeg: DEFAULT_CAMERA_LAT_DEG,
        lonDeg: DEFAULT_CAMERA_LON_DEG,
        headingDeg: 0,
        pitchDeg: 0,
        zoomMeters: DEFAULT_CAMERA_ALTITUDE_METERS,
      };
      simViewState = { ...current, ...partial };
      rasterTilesRuntime?.update();
    },
    setSimRunning(running): void {
      if (!simMode || simRunning === running) return;
      simRunning = running;
      scheduler.requestRender();
    },
    setSimTick(callback: ((deltaSeconds: number) => void) | null): void {
      simTick = callback;
    },
    acquireNavigation: request => navigation.acquire(request),
    getNavigationState: () => navigation.state(),
    onNavigationChange: listener => navigation.subscribe(listener),
    captureNavigationSnapshot,
    restoreNavigationSnapshot,
    placeNavigationCamera,
    glideNavigationCamera,
    getCameraHandling(): CameraHandling {
      const decay = settings.get("camera.inertiaDecay");
      return { ...(cameraController?.getLimits() ?? cameraLimits()), glideKeepPerFrame: typeof decay === "number" ? decay : DEFAULT_INERTIA_DECAY_PER_FRAME };
    },
    getPresentationView: () => navigation.current()?.getPresentationView() ?? null,
    setNavigationIntentHandler(lease, handler) {
      if (navigation.current() !== lease || lease.released) return () => {};
      const entry = { lease, handler };
      intentHandler = entry;
      return () => { if (intentHandler === entry) intentHandler = null; };
    },
    applyNavigationIntents(frame) {
      const entry = intentHandler;
      if (entry && navigation.current() === entry.lease) entry.handler(frame);
    },
    getDeviceGeneration: () => deviceGeneration,
    onDeviceLost(listener) {
      deviceLostListeners.add(listener);
      return () => { deviceLostListeners.delete(listener); };
    },
    onDeviceRestored(listener) {
      deviceRestoredListeners.add(listener);
      return () => { deviceRestoredListeners.delete(listener); };
    },
    frameProfile,
    destroy() {
      frameProfile.dispose();
      presentationCandidates.dispose();
      navigation.dispose();
      renderer.engine.onContextLostObservable.remove(deviceLostObserver);
      renderer.engine.onContextRestoredObservable.remove(deviceRestoredObserver);
      deviceLostListeners.clear();
      deviceRestoredListeners.clear();
      for (const stop of stopWatchingSettings) stop();
      for (const remove of removeReadings) remove();
      cancelPreparation?.(new DOMException("Map runtime destroyed.", "AbortError"));
      if (captureFromUrl && window.fossTerrainPerformance === terrainCapture) {
        if (previousCapture) window.fossTerrainPerformance = previousCapture;
        else delete window.fossTerrainPerformance;
      }
      statusListeners.clear();
      rasterDetailListeners.clear();
      googleDetailListeners.clear();
      downloadMeter.destroy();
      // Before the scheduler stops: stopping goes idle, which would settle.
      stopSettling();
      sceneUpdates.dispose();
      scheduler.stop();
      clearGoogleWatchdog();

      tilesRuntime?.dispose();
      tilesRuntime = null;

      rasterTilesRuntime?.dispose();
      rasterTilesRuntime = null;

      inputController?.destroy();
      inputController = null;

      inertialCameraController?.cancel();
      inertialCameraController = null;

      if (googleLight) {
        googleLight.dispose();
        googleLight = null;
      }
      if (simLight) {
        simLight.dispose();
        simLight = null;
      }

      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("resize", handleResize);
      scene.dispose();
      renderer.engine.dispose();
    },
  };
}
