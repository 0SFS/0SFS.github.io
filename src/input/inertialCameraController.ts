export interface CameraInputTarget {
  panBy(screenDxPx: number, screenDyPx: number, canvasHeight: number): void;
  orbitBy(pitchDeltaDeg: number, headingDeltaDeg: number): void;
  zoomBy(factor: number): void;
  cancel?(): void;
}

export interface InertialCameraController extends CameraInputTarget {
  update(nowMs?: number): void;
  cancel(): void;
  /** True while any velocity component is above its stop epsilon. */
  isActive(): boolean;
}

const FRAME_MS = 1000 / 60;
const DECAY_PER_FRAME = 0.82;
const STOP_EPSILON_PX = 0.01;
const STOP_EPSILON_DEG = 0.002;
const STOP_EPSILON_ZOOM_LOG = 0.00005;
const MAX_PAN_DELTA_PER_FRAME_PX = 80;
const MAX_ORBIT_DELTA_PER_FRAME_DEG = 12;
const MAX_ZOOM_LOG_DELTA_PER_FRAME = 0.14;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function decayForDeltaTime(deltaMs: number): number {
  return Math.pow(DECAY_PER_FRAME, deltaMs / FRAME_MS);
}

export function createInertialCameraController(target: CameraInputTarget): InertialCameraController {
  let lastUpdateMs: number | null = null;
  let panVelocityX = 0;
  let panVelocityY = 0;
  let panCanvasHeight = 1;
  let orbitVelocityPitch = 0;
  let orbitVelocityHeading = 0;
  let zoomLogVelocity = 0;

  function cancel(): void {
    panVelocityX = 0;
    panVelocityY = 0;
    orbitVelocityPitch = 0;
    orbitVelocityHeading = 0;
    zoomLogVelocity = 0;
  }

  function panBy(screenDxPx: number, screenDyPx: number, canvasHeight: number): void {
    panCanvasHeight = Math.max(1, canvasHeight);
    panVelocityX = clamp(panVelocityX + screenDxPx, -MAX_PAN_DELTA_PER_FRAME_PX, MAX_PAN_DELTA_PER_FRAME_PX);
    panVelocityY = clamp(panVelocityY + screenDyPx, -MAX_PAN_DELTA_PER_FRAME_PX, MAX_PAN_DELTA_PER_FRAME_PX);
  }

  function orbitBy(pitchDeltaDeg: number, headingDeltaDeg: number): void {
    orbitVelocityPitch = clamp(
      orbitVelocityPitch + pitchDeltaDeg,
      -MAX_ORBIT_DELTA_PER_FRAME_DEG,
      MAX_ORBIT_DELTA_PER_FRAME_DEG,
    );
    orbitVelocityHeading = clamp(
      orbitVelocityHeading + headingDeltaDeg,
      -MAX_ORBIT_DELTA_PER_FRAME_DEG,
      MAX_ORBIT_DELTA_PER_FRAME_DEG,
    );
  }

  function zoomBy(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) {
      return;
    }
    zoomLogVelocity = clamp(
      zoomLogVelocity + Math.log(factor),
      -MAX_ZOOM_LOG_DELTA_PER_FRAME,
      MAX_ZOOM_LOG_DELTA_PER_FRAME,
    );
  }

  function update(nowMs = performance.now()): void {
    const deltaMs = lastUpdateMs === null ? FRAME_MS : Math.max(0, Math.min(100, nowMs - lastUpdateMs));
    lastUpdateMs = nowMs;

    if (Math.abs(panVelocityX) > STOP_EPSILON_PX || Math.abs(panVelocityY) > STOP_EPSILON_PX) {
      target.panBy(panVelocityX, panVelocityY, panCanvasHeight);
    }

    if (Math.abs(orbitVelocityPitch) > STOP_EPSILON_DEG || Math.abs(orbitVelocityHeading) > STOP_EPSILON_DEG) {
      target.orbitBy(orbitVelocityPitch, orbitVelocityHeading);
    }

    if (Math.abs(zoomLogVelocity) > STOP_EPSILON_ZOOM_LOG) {
      target.zoomBy(Math.exp(zoomLogVelocity));
    }

    const decay = decayForDeltaTime(deltaMs || FRAME_MS);
    panVelocityX *= decay;
    panVelocityY *= decay;
    orbitVelocityPitch *= decay;
    orbitVelocityHeading *= decay;
    zoomLogVelocity *= decay;
  }

  function isActive(): boolean {
    return (
      Math.abs(panVelocityX) > STOP_EPSILON_PX ||
      Math.abs(panVelocityY) > STOP_EPSILON_PX ||
      Math.abs(orbitVelocityPitch) > STOP_EPSILON_DEG ||
      Math.abs(orbitVelocityHeading) > STOP_EPSILON_DEG ||
      Math.abs(zoomLogVelocity) > STOP_EPSILON_ZOOM_LOG
    );
  }

  return { panBy, orbitBy, zoomBy, update, cancel, isActive };
}