import { Vector3, type Camera, type Node } from "@babylonjs/core";
import type { AttitudeView } from "./attitudeIndicator";

/** A camera's own forward: Babylon's cameras look along -z in a right-handed scene and +z in a left-handed one. */
const FORWARD_RIGHT_HANDED = new Vector3(0, 0, -1);
const FORWARD_LEFT_HANDED = new Vector3(0, 0, 1);

type Vec3 = [number, number, number];

function normalized([x, y, z]: Vec3): Vec3 | null {
  const length = Math.hypot(x, y, z);
  return length > 1e-9 ? [x / length, y / length, z / length] : null;
}

/**
 * The 3D camera's frame as the attitude indicator draws from it (Renderer →
 * Instruments → Attitude indicator view): its forward, right and down
 * directions in local north/east/down, the columns of a row-major 3×3, as
 * `bodyToLocal` gives the aircraft's. The flight's world is east/up/south at
 * the aircraft (floatingOrigin.ts), so north is -z, east x and down -y. Null
 * without a camera, or for one whose up lies along its view.
 */
export function cameraAttitudeView(camera: Camera | null | undefined): AttitudeView | null {
  if (!camera) return null;
  // The aircraft the flight cameras hang from moved this frame, after Babylon last placed them: their parents first.
  const parents: Node[] = [];
  for (let node = camera.parent; node; node = node.parent) parents.unshift(node);
  for (const node of parents) (node as Node & { computeWorldMatrix?(force?: boolean): unknown }).computeWorldMatrix?.(true);
  camera.getViewMatrix(true);
  const world = camera.getWorldMatrix();
  const forward = Vector3.TransformNormal(camera.getScene().useRightHandedSystem ? FORWARD_RIGHT_HANDED : FORWARD_LEFT_HANDED, world);
  const up = Vector3.TransformNormal(Vector3.Up(), world);
  const f = normalized([-forward.z, forward.x, -forward.y]);
  if (!f) return null;
  // Down is the camera's down made square to its forward.
  const below: Vec3 = [up.z, -up.x, up.y];
  const along = below[0] * f[0] + below[1] * f[1] + below[2] * f[2];
  const d = normalized([below[0] - along * f[0], below[1] - along * f[1], below[2] - along * f[2]]);
  if (!d) return null;
  // Right is down × forward, as y is z × x in the aircraft's axes.
  const r: Vec3 = [d[1] * f[2] - d[2] * f[1], d[2] * f[0] - d[0] * f[2], d[0] * f[1] - d[1] * f[0]];
  return [f[0], r[0], d[0], f[1], r[1], d[1], f[2], r[2], d[2]];
}
