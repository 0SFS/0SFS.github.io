import { FreeCamera, NullEngine, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { afterEach, describe, expect, it } from "vitest";
import { computeListenerPose, createListenerPose, type ListenerPoseInput } from "./audioPose";

const engines: NullEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); });

function world() {
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  return { camera: new FreeCamera("listener", Vector3.Zero(), scene), root: new TransformNode("aircraft", scene) };
}

function input(base: Pick<ListenerPoseInput, "camera" | "aircraftRoot">, overrides: Partial<ListenerPoseInput> = {}) {
  return {
    ...base, sourceOffset: [0, 0, 0] as const, velocityWorld: [0, 0, 0] as const,
    exterior: 1, heightAboveGroundM: null, ...overrides,
  };
}

describe("listener pose", () => {
  it("puts the source in listener-local metres: +X right, +Y up, +Z forward", () => {
    const { camera, root } = world();
    root.position.set(0, 0, 10);
    const pose = computeListenerPose(input({ camera, aircraftRoot: root }, { sourceOffset: [2, 1, -3] }),
      createListenerPose());
    expect(pose.valid).toBe(true);
    expect(pose.source[0]).toBeCloseTo(2, 5);
    expect(pose.source[1]).toBeCloseTo(1, 5);
    expect(pose.source[2]).toBeCloseTo(7, 5);
  });

  it("follows the camera's orientation, so turning the view moves the source", () => {
    const { camera, root } = world();
    camera.rotation.y = Math.PI / 2;  // now facing world +X
    root.position.set(10, 0, 0);
    const pose = computeListenerPose(input({ camera, aircraftRoot: root }, { velocityWorld: [50, 0, 0] }),
      createListenerPose());
    expect(pose.source[0]).toBeCloseTo(0, 5);
    expect(pose.source[2]).toBeCloseTo(10, 5);
    expect(pose.sourceVelocity[2]).toBeCloseTo(50, 5);
    // A camera rigidly attached to the aircraft shares its velocity: no Doppler.
    expect(pose.listenerVelocity).toEqual(pose.sourceVelocity);
  });

  it("switches the ground reflection off when terrain is unknown, and bounds it", () => {
    const { camera, root } = world();
    const base = { camera, aircraftRoot: root };
    expect(computeListenerPose(input(base), createListenerPose()).groundReflectionM).toBe(-1);
    expect(computeListenerPose(input(base, { heightAboveGroundM: 5 }), createListenerPose()).groundReflectionM)
      .toBe(10);
    expect(computeListenerPose(input(base, { heightAboveGroundM: 500 }), createListenerPose()).groundReflectionM)
      .toBe(200);
    expect(computeListenerPose(input(base, { heightAboveGroundM: -3 }), createListenerPose()).groundReflectionM)
      .toBe(-1);
  });

  it("clamps the exterior crossfade and refuses to publish a NaN pose", () => {
    const { camera, root } = world();
    const base = { camera, aircraftRoot: root };
    expect(computeListenerPose(input(base, { exterior: 3 }), createListenerPose()).exterior).toBe(1);
    expect(computeListenerPose(input(base, { exterior: -1 }), createListenerPose()).exterior).toBe(0);
    expect(computeListenerPose(input(base, { sourceOffset: [Number.NaN, 0, 0] }), createListenerPose()).valid)
      .toBe(false);
  });
});
