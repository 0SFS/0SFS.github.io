import { describe, expect, it } from "vitest";
import { Vector3 } from "@babylonjs/core";
import type { GeospatialCamera } from "@babylonjs/core";
import { DEG_TO_RAD, ecefToGeodetic, geodeticToEcef } from "./cameraMath";
import { CameraController, MIN_ZOOM_METERS } from "./cameraState";

function createCamera(latDeg: number, lonDeg: number, heightMeters: number, radius = 600): GeospatialCamera {
  const center = geodeticToEcef(latDeg * DEG_TO_RAD, lonDeg * DEG_TO_RAD, heightMeters);
  return {
    center: new Vector3(center.x, center.y, center.z),
    yaw: 0,
    pitch: 0,
    radius,
    fov: 0.8,
  } as GeospatialCamera;
}

function centerHeight(camera: GeospatialCamera): number {
  return ecefToGeodetic(camera.center.x, camera.center.y, camera.center.z).altMeters;
}

describe("CameraController orbit target height", () => {
  it("moves the camera orbit center to resolved surface height plus initial offset", () => {
    const camera = createCamera(44.977753, -93.265011, 0);
    const controller = new CameraController(camera);

    controller.configureOrbitTargetHeight({
      resolveSurfaceHeightMeters: () => 264,
      initialOffsetMeters: 1_000,
    });

    expect(centerHeight(camera)).toBeCloseTo(1_264, 1);
  });

  it("lowers orbit target offset instead of zooming past the minimum radius", () => {
    const camera = createCamera(44.977753, -93.265011, 0, MIN_ZOOM_METERS);
    const controller = new CameraController(camera);
    controller.configureOrbitTargetHeight({
      resolveSurfaceHeightMeters: () => 264,
      initialOffsetMeters: 1_000,
    });

    controller.zoomBy(0.5);

    expect(camera.radius).toBe(MIN_ZOOM_METERS);
    expect(centerHeight(camera)).toBeGreaterThan(264);
    expect(centerHeight(camera)).toBeLessThan(1_264);

    controller.zoomBy(0.5);
    controller.zoomBy(0.5);

    expect(camera.radius).toBe(MIN_ZOOM_METERS);
    expect(centerHeight(camera)).toBeCloseTo(264, 1);
  });

  it("preserves orbit center height while panning across changing city heights", () => {
    let surfaceHeightMeters = 264;
    const camera = createCamera(44.977753, -93.265011, 0, 80);
    const controller = new CameraController(camera);
    controller.configureOrbitTargetHeight({
      resolveSurfaceHeightMeters: () => surfaceHeightMeters,
      initialOffsetMeters: 1_000,
    });
    const initialHeight = centerHeight(camera);

    surfaceHeightMeters = 420;
    controller.panBy(12, 8, 800);

    expect(centerHeight(camera)).toBeCloseTo(initialHeight, 1);
  });

  it("preserves orbit center height while orbiting", () => {
    let surfaceHeightMeters = 264;
    const camera = createCamera(44.977753, -93.265011, 0, 80);
    const controller = new CameraController(camera);
    controller.configureOrbitTargetHeight({
      resolveSurfaceHeightMeters: () => surfaceHeightMeters,
      initialOffsetMeters: 1_000,
    });
    const initialHeight = centerHeight(camera);

    surfaceHeightMeters = 420;
    controller.orbitBy(4, 7);

    expect(centerHeight(camera)).toBeCloseTo(initialHeight, 1);
  });
});