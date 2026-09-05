import { Ray, Vector3 } from "@babylonjs/core";
import type { AbstractMesh, Scene } from "@babylonjs/core";
import { DEG_TO_RAD, ecefToGeodetic, geodeticToEcef } from "../camera/cameraMath";
import type { AnchorHeightProvider } from "./anchorHeight";

export interface TileHeightProviderOptions {
  probeHeightMeters?: number;
  probeDepthMeters?: number;
  /** Radius for the local low-envelope sample around the compass anchor. */
  sampleRadiusMeters?: number;
}

const DEFAULT_PROBE_HEIGHT_METERS = 20_000;
const DEFAULT_PROBE_DEPTH_METERS = 40_000;
const DEFAULT_SAMPLE_RADIUS_METERS = 90;

function isEligibleHeightMesh(mesh: AbstractMesh): boolean {
  if (!mesh.isEnabled() || !mesh.isVisible || !mesh.isPickable) {
    return false;
  }

  if (mesh.name.startsWith("orbit-compass") || mesh.name === "fallback-globe") {
    return false;
  }

  return true;
}

export function createTileHeightProvider(
  scene: Scene,
  options: TileHeightProviderOptions = {},
): AnchorHeightProvider {
  const probeHeightMeters = options.probeHeightMeters ?? DEFAULT_PROBE_HEIGHT_METERS;
  const probeDepthMeters = options.probeDepthMeters ?? DEFAULT_PROBE_DEPTH_METERS;
  const sampleRadiusMeters = options.sampleRadiusMeters ?? DEFAULT_SAMPLE_RADIUS_METERS;

  function sampleHeight(surfacePoint: Vector3): number | null {
    const up = surfacePoint.normalizeToNew();
    const origin = surfacePoint.add(up.scale(probeHeightMeters));
    const ray = new Ray(origin, up.scale(-1), probeHeightMeters + probeDepthMeters);
    const pick = scene.pickWithRay(ray, isEligibleHeightMesh, false);

    if (!pick?.hit || !pick.pickedPoint) {
      return null;
    }

    const { altMeters } = ecefToGeodetic(pick.pickedPoint.x, pick.pickedPoint.y, pick.pickedPoint.z);
    return Number.isFinite(altMeters) ? altMeters : null;
  }

  return (latDeg: number, lonDeg: number): number | null => {
    const surface = geodeticToEcef(latDeg * DEG_TO_RAD, lonDeg * DEG_TO_RAD, 0);
    const surfacePoint = new Vector3(surface.x, surface.y, surface.z);
    const up = surfacePoint.normalizeToNew();
    const poleSafeAxis = Math.abs(Vector3.Dot(up, Vector3.Up())) > 0.98 ? Vector3.Right() : Vector3.Up();
    const east = Vector3.Cross(poleSafeAxis, up).normalize();
    const north = Vector3.Cross(up, east).normalize();
    const offsets: Array<[number, number]> = [
      [0, 0],
      [sampleRadiusMeters, 0],
      [-sampleRadiusMeters, 0],
      [0, sampleRadiusMeters],
      [0, -sampleRadiusMeters],
    ];
    let lowestHeight: number | null = null;

    for (const [eastMeters, northMeters] of offsets) {
      const samplePoint = surfacePoint
        .add(east.scale(eastMeters))
        .add(north.scale(northMeters));
      const height = sampleHeight(samplePoint);
      if (height !== null && (lowestHeight === null || height < lowestHeight)) {
        lowestHeight = height;
      }
    }

    return lowestHeight;
  };
}