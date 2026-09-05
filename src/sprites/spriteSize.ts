import type { Scene } from "@babylonjs/core";
import { EARTH_RADIUS_METERS } from "./types";

/**
 * Returns the size sprites should have at the current zoom level. Uses the
 * orbit-camera's distance-to-target (`zoomMeters`) when available — that value
 * is invariant under orbit/pitch around a focal point, so sprites don't resize
 * when the user merely rotates around what they're looking at. Falls back to
 * the camera's radial altitude (varies with pitch) when `zoomMeters` isn't
 * provided.
 */
export function currentSpriteSize(
  scene: Scene,
  maxSize: number,
  minSize: number,
  minRefZoomMeters: number,
  maxRefZoomMeters: number,
  zoomMeters?: number,
  earthRadiusMeters: number = EARTH_RADIUS_METERS,
): number {
  let distanceMeters: number;
  if (typeof zoomMeters === "number" && Number.isFinite(zoomMeters)) {
    distanceMeters = Math.max(0, zoomMeters);
  } else {
    const cam = scene.activeCamera;
    if (!cam) return maxSize;
    distanceMeters = Math.max(0, cam.position.length() - earthRadiusMeters);
  }
  const range = maxRefZoomMeters - minRefZoomMeters;
  const t = range > 0 ? Math.min(1, Math.max(0, (distanceMeters - minRefZoomMeters) / range)) : 1;
  return minSize + t * (maxSize - minSize);
}
