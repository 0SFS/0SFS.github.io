import { Matrix, Vector3, type Camera, type TransformNode } from "@babylonjs/core";

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
 *    zoom. Rather than reconstruct that by hand, the source is pushed through
 *    the camera's view matrix, which already accounts for all of it — and
 *    keeps working for first person, chase, panel and phone view changes alike.
 */

export interface ListenerPose {
  /** Source position in listener-local metres: +X right, +Y up, +Z forward. */
  source: [number, number, number];
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
let scratch: { world: Vector3; local: Vector3; velocity: Vector3; view: Matrix } | null = null;

function finite(vector: Vector3): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

export interface ListenerPoseInput {
  camera: Camera;
  aircraftRoot: TransformNode;
  /** Engine acoustic centre in the aircraft visual frame, metres. */
  sourceOffset: readonly [number, number, number];
  /** Aircraft velocity in the Babylon world frame (east / up / south), m/s. */
  velocityWorld: readonly [number, number, number];
  exterior: number;
  /** Height above terrain in metres, or null when terrain is unavailable. */
  heightAboveGroundM: number | null;
}

export function computeListenerPose(input: ListenerPoseInput, target: ListenerPose): ListenerPose {
  target.valid = false;
  const root = input.aircraftRoot;
  const camera = input.camera;
  if (!root || !camera) return target;
  scratch ??= { world: new Vector3(), local: new Vector3(), velocity: new Vector3(), view: new Matrix() };
  const { world: scratchWorld, local: scratchLocal, velocity: scratchVelocity, view: scratchView } = scratch;

  root.computeWorldMatrix(true);
  scratchWorld.set(input.sourceOffset[0], input.sourceOffset[1], input.sourceOffset[2]);
  Vector3.TransformCoordinatesToRef(scratchWorld, root.getWorldMatrix(), scratchWorld);

  // The view matrix is world -> camera-local, which is exactly the frame the
  // snapshot is defined in.
  scratchView.copyFrom(camera.getViewMatrix());
  Vector3.TransformCoordinatesToRef(scratchWorld, scratchView, scratchLocal);
  if (!finite(scratchLocal)) return target;
  target.source[0] = scratchLocal.x;
  target.source[1] = scratchLocal.y;
  target.source[2] = scratchLocal.z;

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

  target.exterior = Math.min(1, Math.max(0, input.exterior));
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
    sourceVelocity: [0, 0, 0],
    listenerVelocity: [0, 0, 0],
    exterior: 0,
    groundReflectionM: -1,
    valid: false,
  };
}
