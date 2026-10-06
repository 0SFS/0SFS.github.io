import { Matrix, Quaternion, Vector3, type Camera, type TransformNode } from "@babylonjs/core";

/**
 * Turns the scene's camera and aircraft transforms into the listener-local
 * pose the DSP core consumes.
 *
 * Two traps in this scene graph make the naive version wrong:
 *
 * 1. The aircraft root is pinned to the origin while the world shifts beneath
 *    it (floatingOrigin.ts), so the derivative of anything's Babylon position
 *    is NOT its velocity. Velocities come from JSBSim instead.
 * 2. The cameras are parented transforms with their own offsets, orbit and
 *    zoom. Their view matrices supply the actual camera and pilot-eye poses.
 *    Blend world position and quaternion orientation before transforming the
 *    source, rather than averaging two different listener-local coordinates.
 */

export interface ListenerPose {
  /** Source position in listener-local metres: +X right, +Y up, +Z forward. */
  source: [number, number, number];
  /** Unit exhaust-flow direction, or undefined when native orientation is unavailable. */
  sourceAxis?: [number, number, number];
  sourceAxisValid?: boolean;
  sourceVelocity: [number, number, number];
  listenerVelocity: [number, number, number];
  /** 0 cockpit, 1 exterior; fractional values crossfade the installation. */
  exterior: number;
  /** Ground-image path difference in metres, or -1 when terrain is unknown. */
  groundReflectionM: number;
  valid: boolean;
}

// Allocated on first use, not at import: nothing in the audio path should build
// Babylon objects just because a module was loaded.
let scratch: {
  world: Vector3; local: Vector3; velocity: Vector3; view: Matrix;
  cameraWorld: Matrix; cockpitWorld: Matrix;
  cameraPosition: Vector3; cockpitPosition: Vector3; listenerPosition: Vector3;
  cameraRotation: Quaternion; cockpitRotation: Quaternion; listenerRotation: Quaternion;
  unitScale: Vector3;
} | null = null;

function finite(vector: Vector3): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

function refreshCameraParent(camera: Camera): void {
  const parent = camera.parent;
  // Babylon's cached matrix getters skip dirty ancestors when renderId has
  // not advanced. Force only a stale parent chain, preserving unchanged views.
  if (parent && !parent.isSynchronized()) parent.computeWorldMatrix(true);
}

export interface ListenerPoseInput {
  camera: Camera;
  /** Actual pilot-eye camera, including its body offset and current look. */
  cockpitCamera?: Camera;
  /** 0 active camera, 1 cockpit. Camera-only low-level callers omit this. */
  listenerCockpitBlend?: number;
  aircraftRoot: TransformNode;
  /** Engine acoustic centre in the aircraft visual frame, metres. */
  sourceOffset: readonly [number, number, number];
  /** Exhaust-flow direction in the aircraft visual frame; never inferred from velocity. */
  sourceAxis?: readonly [number, number, number];
  /** Aircraft velocity in the Babylon world frame (east / up / south), m/s. */
  velocityWorld: readonly [number, number, number];
  exterior: number;
  /** Height above terrain in metres, or null when terrain is unavailable. */
  heightAboveGroundM: number | null;
}

export function computeListenerPose(input: ListenerPoseInput, target: ListenerPose): ListenerPose {
  target.valid = false;
  target.sourceAxisValid = false;
  const root = input.aircraftRoot;
  const camera = input.camera;
  if (!root || !camera) return target;
  const blend = input.listenerCockpitBlend ?? (input.cockpitCamera ? 1 : 0);
  if (!Number.isFinite(blend) || !Number.isFinite(input.exterior)) return target;
  const cockpitBlend = Math.min(1, Math.max(0, blend));
  const cockpit = input.cockpitCamera;
  if (cockpitBlend > 0 && !cockpit) return target;
  scratch ??= {
    world: new Vector3(), local: new Vector3(), velocity: new Vector3(), view: new Matrix(),
    cameraWorld: new Matrix(), cockpitWorld: new Matrix(),
    cameraPosition: new Vector3(), cockpitPosition: new Vector3(), listenerPosition: new Vector3(),
    cameraRotation: new Quaternion(), cockpitRotation: new Quaternion(), listenerRotation: new Quaternion(),
    unitScale: Vector3.One(),
  };
  const { world: scratchWorld, local: scratchLocal, velocity: scratchVelocity, view: scratchView } = scratch;

  // Refresh dirty parents even when the cockpit camera is inactive. Forcing
  // an unchanged camera view would emit unnecessary view-change notifications.
  if (cockpitBlend === 0) {
    refreshCameraParent(camera);
    scratchView.copyFrom(camera.getViewMatrix());
  } else if (cockpitBlend === 1) {
    refreshCameraParent(cockpit!);
    scratchView.copyFrom(cockpit!.getViewMatrix());
  } else {
    refreshCameraParent(cockpit!);
    refreshCameraParent(camera);
    camera.getViewMatrix().invertToRef(scratch.cameraWorld);
    cockpit!.getViewMatrix().invertToRef(scratch.cockpitWorld);
    if (!scratch.cameraWorld.decompose(undefined, scratch.cameraRotation, scratch.cameraPosition)
      || !scratch.cockpitWorld.decompose(undefined, scratch.cockpitRotation, scratch.cockpitPosition)) return target;
    Vector3.LerpToRef(scratch.cameraPosition, scratch.cockpitPosition, cockpitBlend, scratch.listenerPosition);
    Quaternion.SlerpToRef(scratch.cameraRotation, scratch.cockpitRotation, cockpitBlend, scratch.listenerRotation);
    Matrix.ComposeToRef(scratch.unitScale, scratch.listenerRotation, scratch.listenerPosition, scratch.cameraWorld);
    scratch.cameraWorld.invertToRef(scratchView);
  }
  // Cockpit-parent refresh already updates the aircraft ancestor; do not
  // compute it again. A detached camera still needs the source root refreshed.
  if (!root.isSynchronized()) root.computeWorldMatrix(true);
  scratchWorld.set(input.sourceOffset[0], input.sourceOffset[1], input.sourceOffset[2]);
  Vector3.TransformCoordinatesToRef(scratchWorld, root.getWorldMatrix(), scratchWorld);
  Vector3.TransformCoordinatesToRef(scratchWorld, scratchView, scratchLocal);
  if (!finite(scratchLocal)) return target;
  target.source[0] = scratchLocal.x;
  target.source[1] = scratchLocal.y;
  target.source[2] = scratchLocal.z;

  const axis = input.sourceAxis;
  if (axis) {
    scratchLocal.set(axis[0], axis[1], axis[2]);
    Vector3.TransformNormalToRef(scratchLocal, root.getWorldMatrix(), scratchLocal);
    Vector3.TransformNormalToRef(scratchLocal, scratchView, scratchLocal);
    const length = scratchLocal.length();
    if (finite(scratchLocal) && length > 1e-9) {
      target.sourceAxis ??= [0, 0, 0];
      target.sourceAxis[0] = scratchLocal.x / length;
      target.sourceAxis[1] = scratchLocal.y / length;
      target.sourceAxis[2] = scratchLocal.z / length;
      target.sourceAxisValid = true;
    }
  }

  scratchVelocity.set(input.velocityWorld[0], input.velocityWorld[1], input.velocityWorld[2]);
  Vector3.TransformNormalToRef(scratchVelocity, scratchView, scratchVelocity);
  if (!finite(scratchVelocity)) return target;
  target.sourceVelocity[0] = scratchVelocity.x;
  target.sourceVelocity[1] = scratchVelocity.y;
  target.sourceVelocity[2] = scratchVelocity.z;

  // Both cameras are rigidly parented to the aircraft, so the listener shares
  // the aircraft's velocity and the Doppler ratio is 1 — which is what a
  // cockpit or a locked chase camera should hear. The general formula still
  // runs, so a future detached camera needs no special case.
  target.listenerVelocity[0] = scratchVelocity.x;
  target.listenerVelocity[1] = scratchVelocity.y;
  target.listenerVelocity[2] = scratchVelocity.z;

  target.exterior = Math.min(1, Math.max(0, input.exterior)) * (1 - cockpitBlend);
  // Ground-image path difference for a source and listener at similar height:
  // the reflected ray is longer by roughly 2 * height * sin(elevation). With
  // terrain unknown the tap is switched off rather than guessed.
  const height = input.heightAboveGroundM;
  target.groundReflectionM = height === null || !Number.isFinite(height) || height < 0
    ? -1
    : Math.min(200, 2 * Math.max(0, height));
  target.valid = true;
  return target;
}

export function createListenerPose(): ListenerPose {
  return {
    source: [0, 0, 0],
    sourceAxis: [0, 0, 0],
    sourceAxisValid: false,
    sourceVelocity: [0, 0, 0],
    listenerVelocity: [0, 0, 0],
    exterior: 0,
    groundReflectionM: -1,
    valid: false,
  };
}
