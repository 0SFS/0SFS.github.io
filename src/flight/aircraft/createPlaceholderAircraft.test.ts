import { NullEngine, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { describe, expect, it } from "vitest";
import { flightAttitudeToQuaternion } from "../bridge/ecefBridge";
import { createPlaceholderAircraft } from "./createPlaceholderAircraft";

describe("aircraft chase camera", () => {
  it.each([0, Math.PI / 2, Math.PI, 3 * Math.PI / 2])("keeps both cameras facing heading %s with east on the correct side", (heading) => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    const origin = new TransformNode("origin", scene);
    origin.rotationQuaternion = flightAttitudeToQuaternion(0, 0, heading);
    const aircraft = createPlaceholderAircraft(scene, origin);
    const forward = new Vector3(Math.sin(heading), 0, -Math.cos(heading));
    const right = new Vector3(Math.cos(heading), 0, Math.sin(heading));
    for (const camera of [aircraft.firstPersonCamera, aircraft.thirdPersonCamera]) {
      const view = camera.getViewMatrix(true);
      expect(Vector3.TransformNormal(forward, view).z).toBeLessThan(-0.9);
      expect(Vector3.TransformNormal(right, view).x).toBeCloseTo(1, 5);
    }
    aircraft.dispose(); scene.dispose(); engine.dispose();
  });

  it("orbits locally, clamps pitch/distance, and ignores gestures in cockpit view", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const origin = new TransformNode("origin", scene);
    const aircraft = createPlaceholderAircraft(scene, origin);
    const camera = aircraft.thirdPersonCamera;
    aircraft.orbitChaseCamera(Math.PI / 2, 100);
    expect(camera.position.x).toBeGreaterThan(0);
    expect(Math.asin(camera.position.y / camera.position.length())).toBeCloseTo(Math.PI * 0.45);
    aircraft.zoomChaseCamera(1e6);
    expect(camera.position.length()).toBeCloseTo(500);
    aircraft.zoomChaseCamera(1e-6);
    expect(camera.position.length()).toBeCloseTo(8);
    const localPosition = camera.position.clone();
    origin.position.set(10000, 20000, 30000);
    expect(camera.position.equals(localPosition)).toBe(true);
    expect(camera.parent).toBe(aircraft.root);
    aircraft.setViewMode("first");
    aircraft.orbitChaseCamera(1, 1);
    aircraft.zoomChaseCamera(2);
    expect(camera.position.equals(localPosition)).toBe(true);
    expect(scene.activeCamera).toBe(aircraft.firstPersonCamera);
    aircraft.dispose(); scene.dispose(); engine.dispose();
  });
});
