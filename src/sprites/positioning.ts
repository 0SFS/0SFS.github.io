import { Ray, Vector3, type AbstractMesh, type Scene } from "@babylonjs/core";
import { smoothSurfaceEcef } from "../terrain/smoothElevation";

export const DEFAULT_POI_HEIGHT_REFINEMENT_MAX_ZOOM_M = 120_000;
export const DEFAULT_POI_HEIGHT_REFINEMENT_PROBE_UP_M = 20_000;
export const DEFAULT_POI_HEIGHT_REFINEMENT_PROBE_DOWN_M = 40_000;

export function smoothPointPosition(latDeg: number, lonDeg: number, offsetMeters: number): Vector3 {
  const pos = smoothSurfaceEcef(latDeg, lonDeg, offsetMeters);
  return new Vector3(pos.x, pos.y, pos.z);
}

export function isEligiblePoiHeightMesh(mesh: AbstractMesh): boolean {
  if (!mesh.isEnabled() || !mesh.isVisible || !mesh.isPickable) return false;
  if (mesh.name.startsWith("orbit-compass") || mesh.name === "fallback-globe") return false;
  return true;
}

/**
 * Ray-casts straight down through the terrain meshes at the given lat/lng to
 * find a refined surface position. Returns null if no mesh was hit.
 */
export function samplePoiMeshPosition(
  scene: Scene,
  latDeg: number,
  lonDeg: number,
  offsetMeters: number,
  probeUpMeters: number = DEFAULT_POI_HEIGHT_REFINEMENT_PROBE_UP_M,
  probeDownMeters: number = DEFAULT_POI_HEIGHT_REFINEMENT_PROBE_DOWN_M,
): Vector3 | null {
  const base = smoothPointPosition(latDeg, lonDeg, 0);
  const up = base.normalizeToNew();
  const origin = base.add(up.scale(probeUpMeters));
  const ray = new Ray(origin, up.scale(-1), probeUpMeters + probeDownMeters);
  const pick = scene.pickWithRay(ray, isEligiblePoiHeightMesh, false);
  if (!pick?.hit || !pick.pickedPoint) return null;
  return pick.pickedPoint.add(up.scale(offsetMeters));
}

export function poiRefinementLod(
  zoomMeters: number,
  maxZoomMeters: number = DEFAULT_POI_HEIGHT_REFINEMENT_MAX_ZOOM_M,
): number | null {
  if (zoomMeters > maxZoomMeters) return null;
  if (zoomMeters <= 5_000) return 17;
  if (zoomMeters <= 20_000) return 16;
  if (zoomMeters <= 60_000) return 15;
  return 14;
}

export function poiRefinementTileRadius(zoomMeters: number): number {
  if (zoomMeters <= 10_000) return 1;
  if (zoomMeters <= 45_000) return 2;
  return 3;
}

export function lonLatToTile(
  latDeg: number,
  lonDeg: number,
  zoom: number,
): { x: number; y: number; key: string } {
  const latRad = Math.max(-85.05112878, Math.min(85.05112878, latDeg)) * Math.PI / 180;
  const n = 2 ** zoom;
  const x = Math.max(0, Math.min(n - 1, Math.floor(((lonDeg + 180) / 360) * n)));
  const y = Math.max(
    0,
    Math.min(
      n - 1,
      Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n),
    ),
  );
  return { x, y, key: `${zoom}/${x}/${y}` };
}

export function wrapTileX(x: number, zoom: number): number {
  const n = 2 ** zoom;
  return ((x % n) + n) % n;
}

export function makeTileKey(zoom: number, x: number, y: number): string | null {
  const n = 2 ** zoom;
  if (y < 0 || y >= n) return null;
  return `${zoom}/${wrapTileX(x, zoom)}/${y}`;
}

export function buildPoiTileIndex<T extends { lat: number; lng: number }>(
  points: Iterable<T>,
  zoom: number,
): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const point of points) {
    const tile = lonLatToTile(point.lat, point.lng, zoom);
    const bucket = index.get(tile.key);
    if (bucket) bucket.push(point);
    else index.set(tile.key, [point]);
  }
  return index;
}

export function distanceScoreMetersSq(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const latScale = 111_320;
  const lngScale = latScale * Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
  const dy = (aLat - bLat) * latScale;
  const dx = (aLng - bLng) * lngScale;
  return dx * dx + dy * dy;
}
