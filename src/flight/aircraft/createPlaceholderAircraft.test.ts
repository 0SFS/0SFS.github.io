import { NullEngine, Scene, TransformNode } from "@babylonjs/core";
import { describe, expect, it } from "vitest";
import { createPlaceholderAircraft } from "./createPlaceholderAircraft";

describe("aircraft chase camera", () => {
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
