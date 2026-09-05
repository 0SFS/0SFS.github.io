import { Vector3 } from "@babylonjs/core";
import type { GeospatialCamera } from "@babylonjs/core";
import type { GlobeViewState } from "../engine/types";
import {
  geodeticToEcef,
  ecefToGeodetic,
  DEG_TO_RAD,
  RAD_TO_DEG,
  normalizeHeadingDeg,
  WGS84_A,
} from "./cameraMath";

// ─── Camera State Limits ────────────────────────────────────────────

/** Minimum pitch: 1° prevents a perfectly horizontal view that can flip the camera. */
export const MIN_PITCH_DEG = 1;
/** Maximum pitch: 89° prevents a perfectly vertical view that loses heading reference. */
export const MAX_PITCH_DEG = 89;
/** Minimum orbit radius (metres) — prevents clipping into tile geometry. */
export const MIN_ZOOM_METERS = 25;
/** Maximum orbit radius (metres) — keeps the globe in frame. */
export const MAX_ZOOM_METERS = 80_000_000;
const ORBIT_TARGET_OFFSET_ZOOM_STEP_METERS = 750;
const MAX_ORBIT_SURFACE_HEIGHT_SPEED_METERS_PER_SECOND = 160;
const MAX_ORBIT_HEIGHT_SMOOTHING_DELTA_MS = 100;

export interface OrbitTargetHeightOptions {
  resolveSurfaceHeightMeters: (latDeg: number, lonDeg: number) => number | null;
  initialOffsetMeters?: number;
}

// ─── Pitch Conversion ───────────────────────────────────────────────
//
// Public API convention (matches foss-earth / Cesium):
//   pitchDeg = 0   → looking at the horizon
//   pitchDeg = 90  → looking straight down at the surface
//
// Babylon GeospatialCamera convention:
//   pitch = 0      → looking straight down (toward planet centre)
//   pitch = π/2    → looking at the horizon
//
// Conversion: babylonPitch = (π/2) × (1 − pitchDeg / 90)

function babylonPitchToSurfacePitchDeg(babylonPitch: number): number {
  return 90 * (1 - babylonPitch / (Math.PI / 2));
}

function surfacePitchDegToBabylonPitch(pitchDeg: number): number {
  return (Math.PI / 2) * (1 - pitchDeg / 90);
}

function clampPitchDeg(pitchDeg: number): number {
  return Math.max(MIN_PITCH_DEG, Math.min(MAX_PITCH_DEG, pitchDeg));
}

function clampZoomMeters(zoom: number): number {
  return Math.max(MIN_ZOOM_METERS, Math.min(MAX_ZOOM_METERS, zoom));
}

// ─── Camera Controller ───────────────────────────────────────────────

/**
 * State-driven camera controller wrapping a Babylon `GeospatialCamera`.
 *
 * Maintains a canonical `GlobeViewState` (lat / lon / heading / pitch / zoom)
 * and provides two-way sync with the underlying Babylon camera so that all
 * input handlers can work on the canonical state rather than raw pointer deltas.
 */
export class CameraController {
  private readonly camera: GeospatialCamera;
  private resolveSurfaceHeightMeters: ((latDeg: number, lonDeg: number) => number | null) | null = null;
  private orbitTargetOffsetMeters = 0;
  private smoothedSurfaceHeightMeters: number | null = null;
  private lastSurfaceHeightResolveMs: number | null = null;

  constructor(camera: GeospatialCamera) {
    this.camera = camera;
  }

  configureOrbitTargetHeight(options: OrbitTargetHeightOptions | null): void {
    this.resolveSurfaceHeightMeters = options?.resolveSurfaceHeightMeters ?? null;
    this.orbitTargetOffsetMeters = Math.max(0, options?.initialOffsetMeters ?? 0);
    this.smoothedSurfaceHeightMeters = null;
    this.lastSurfaceHeightResolveMs = null;
    this.applyViewState(this.syncFromCamera());
  }

  private smoothSurfaceHeightMeters(targetHeightMeters: number): number {
    const now = performance.now();
    if (this.smoothedSurfaceHeightMeters === null || this.lastSurfaceHeightResolveMs === null) {
      this.smoothedSurfaceHeightMeters = targetHeightMeters;
      this.lastSurfaceHeightResolveMs = now;
      return targetHeightMeters;
    }

    const deltaMs = Math.max(0, Math.min(MAX_ORBIT_HEIGHT_SMOOTHING_DELTA_MS, now - this.lastSurfaceHeightResolveMs));
    this.lastSurfaceHeightResolveMs = now;
    const maxStep = MAX_ORBIT_SURFACE_HEIGHT_SPEED_METERS_PER_SECOND * (deltaMs / 1000);
    const delta = targetHeightMeters - this.smoothedSurfaceHeightMeters;
    if (Math.abs(delta) <= maxStep) {
      this.smoothedSurfaceHeightMeters = targetHeightMeters;
      return this.smoothedSurfaceHeightMeters;
    }

    this.smoothedSurfaceHeightMeters += Math.sign(delta) * maxStep;
    return this.smoothedSurfaceHeightMeters;
  }

  private resolveOrbitTargetHeightMeters(latDeg: number, lonDeg: number): number {
    const surfaceHeightMeters = this.smoothSurfaceHeightMeters(this.resolveSurfaceHeightMeters?.(latDeg, lonDeg) ?? 0);
    return surfaceHeightMeters + this.orbitTargetOffsetMeters;
  }

  private getCurrentCenterHeightMeters(): number {
    return ecefToGeodetic(this.camera.center.x, this.camera.center.y, this.camera.center.z).altMeters;
  }

  /**
   * Read the current `GlobeViewState` from the live camera properties.
   * This is the single source of truth — call this before every state mutation.
   */
  syncFromCamera(): GlobeViewState {
    const c = this.camera.center;
    const { latRad, lonRad } = ecefToGeodetic(c.x, c.y, c.z);

    const headingDeg = normalizeHeadingDeg(this.camera.yaw * RAD_TO_DEG);
    const pitchDeg = clampPitchDeg(babylonPitchToSurfacePitchDeg(this.camera.pitch));
    const zoomMeters = clampZoomMeters(this.camera.radius);

    return {
      latDeg: latRad * RAD_TO_DEG,
      lonDeg: lonRad * RAD_TO_DEG,
      headingDeg,
      pitchDeg,
      zoomMeters,
    };
  }

  /** Return the current view state (reads from live camera). */
  getViewState(): GlobeViewState {
    return this.syncFromCamera();
  }

  /**
   * Merge partial overrides into the current camera state and apply.
   * Only the supplied fields change; everything else is preserved.
   */
  setViewState(partial: Partial<GlobeViewState>): void {
    const next: GlobeViewState = { ...this.syncFromCamera(), ...partial };
    this.applyViewState(next);
  }

  /**
   * Write a complete `GlobeViewState` to the camera.
   * Clamps pitch and zoom to safe limits before applying.
   */
  applyViewState(state: GlobeViewState, targetHeightOverrideMeters?: number): void {
    const targetHeightMeters = targetHeightOverrideMeters
      ?? this.resolveOrbitTargetHeightMeters(state.latDeg, state.lonDeg);
    const { x, y, z } = geodeticToEcef(state.latDeg * DEG_TO_RAD, state.lonDeg * DEG_TO_RAD, targetHeightMeters);
    this.camera.center = new Vector3(x, y, z);
    this.camera.yaw = normalizeHeadingDeg(state.headingDeg) * DEG_TO_RAD;
    this.camera.pitch = surfacePitchDegToBabylonPitch(clampPitchDeg(state.pitchDeg));
    this.camera.radius = clampZoomMeters(state.zoomMeters);
  }

  /**
   * Reset the camera to north-up orientation.
   * Preserves current lat / lon / zoom / pitch — only heading changes.
   */
  resetNorthUp(): void {
    this.setViewState({ headingDeg: 0 });
  }

  /**
   * Pan the camera by a screen-space pixel delta.
   * Translates the lat/lon anchor point while preserving heading, pitch, and zoom.
   * @param screenDxPx Positive = right (east when heading=0)
   * @param screenDyPx Positive = down (south when heading=0)
   * @param canvasHeight Canvas height in CSS pixels
   */
  panBy(screenDxPx: number, screenDyPx: number, canvasHeight: number): void {
    const state = this.syncFromCamera();
    // camera.fov is the vertical FOV in radians (inherited from Babylon Camera, default 0.8)
    const fovY = (this.camera as unknown as { fov: number }).fov ?? 0.8;
    const metersPerPixel = (2 * state.zoomMeters * Math.tan(fovY * 0.5)) / Math.max(canvasHeight, 1);

    const headingRad = state.headingDeg * DEG_TO_RAD;
    const latRad = state.latDeg * DEG_TO_RAD;
    const forwardM = -screenDyPx * metersPerPixel;
    const rightM = screenDxPx * metersPerPixel;
    const cosH = Math.cos(headingRad);
    const sinH = Math.sin(headingRad);
    const northM = forwardM * cosH - rightM * sinH;
    const eastM = forwardM * sinH + rightM * cosH;

    const cosLat = Math.max(Math.cos(latRad), 0.01);
    const latDeltaDeg = (northM / WGS84_A) * RAD_TO_DEG;
    const lonDeltaDeg = (eastM / (WGS84_A * cosLat)) * RAD_TO_DEG;

    const newLatDeg = Math.max(-89.999, Math.min(89.999, state.latDeg + latDeltaDeg));
    const newLonDeg = ((state.lonDeg + lonDeltaDeg + 180) % 360 + 360) % 360 - 180;
    this.applyViewState({ ...state, latDeg: newLatDeg, lonDeg: newLonDeg }, this.getCurrentCenterHeightMeters());
  }

  /**
   * Orbit the camera by a heading/pitch delta.
   * Moves around the current anchor point without changing lat/lon or zoom.
   * @param pitchDeltaDeg Positive = look more downward (toward surface)
   * @param headingDeltaDeg Positive = rotate clockwise (eastward)
   */
  orbitBy(pitchDeltaDeg: number, headingDeltaDeg: number): void {
    const DEADZONE_DEG = 0.02;
    const ep = Math.abs(pitchDeltaDeg) >= DEADZONE_DEG ? pitchDeltaDeg : 0;
    const eh = Math.abs(headingDeltaDeg) >= DEADZONE_DEG ? headingDeltaDeg : 0;
    if (ep === 0 && eh === 0) return;
    const state = this.syncFromCamera();
    this.applyViewState(
      {
        ...state,
        pitchDeg: clampPitchDeg(state.pitchDeg + ep),
        headingDeg: normalizeHeadingDeg(state.headingDeg + eh),
      },
      this.getCurrentCenterHeightMeters(),
    );
  }

  /**
   * Zoom by multiplying the orbit radius by `factor`.
   * factor < 1 = zoom in (move closer), factor > 1 = zoom out (move farther).
   */
  zoomBy(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) {
      return;
    }

    const state = this.syncFromCamera();
    const requestedZoomMeters = state.zoomMeters * factor;

    if (requestedZoomMeters >= MIN_ZOOM_METERS || factor >= 1 || this.orbitTargetOffsetMeters <= 0) {
      this.setViewState({ zoomMeters: clampZoomMeters(requestedZoomMeters) });
      return;
    }

    const offsetStepMeters = Math.max(1, Math.abs(Math.log(factor)) * ORBIT_TARGET_OFFSET_ZOOM_STEP_METERS);
    this.orbitTargetOffsetMeters = Math.max(0, this.orbitTargetOffsetMeters - offsetStepMeters);
    this.applyViewState({ ...state, zoomMeters: MIN_ZOOM_METERS });
  }
}
