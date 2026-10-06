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
  it("rotates the native exhaust axis with the aircraft and listener, independently of their positions", () => {
    const { camera, root } = world();
    root.position.set(200, 10, 800);
    root.rotation.y = Math.PI / 2;
    const base = input({ camera, aircraftRoot: root }, { sourceAxis: [0, 0, -1] });
    const pose = computeListenerPose(base, createListenerPose());
    expect(pose.sourceAxisValid).toBe(true);
    expect(pose.sourceAxis![0]).toBeCloseTo(-1, 5);
    expect(pose.sourceAxis![1]).toBeCloseTo(0, 5);
    expect(pose.sourceAxis![2]).toBeCloseTo(0, 5);
    camera.rotation.y = Math.PI / 2;
    computeListenerPose(base, pose);
    expect(pose.sourceAxis![0]).toBeCloseTo(0, 5);
    expect(pose.sourceAxis![2]).toBeCloseTo(-1, 5);
    computeListenerPose({ ...base, sourceAxis: [0, -1, 0] }, pose);
    expect(pose.sourceAxis![1]).toBeCloseTo(-1, 5);
    expect(Math.hypot(...pose.sourceAxis!)).toBeCloseTo(1, 5);
  });

  it("withdraws directionality when the native axis disappears without invalidating position", () => {
    const { camera, root } = world();
    const base = input({ camera, aircraftRoot: root }, { sourceAxis: [0, 0, -1] });
    const pose = computeListenerPose(base, createListenerPose());
    expect(pose.sourceAxisValid).toBe(true);
    for (const sourceAxis of [undefined, [0, 0, 0], [Number.NaN, 0, -1]] as const) {
      computeListenerPose({ ...base, sourceAxis }, pose);
      expect(pose.valid).toBe(true);
      expect(pose.sourceAxisValid).toBe(false);
    }
  });

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

  it("uses the true cockpit endpoint by default even while chase is active", () => {
    const { camera, root } = world();
    const cockpit = new TransformNode("pilot-eye", root.getScene());
    cockpit.parent = root;
    cockpit.position.set(0, 2, 4);
    const cockpitCamera = new FreeCamera("cockpit-listener", Vector3.Zero(), root.getScene());
    cockpitCamera.parent = cockpit;
    root.getScene().activeCamera = camera;
    root.position.set(50, 8, -20);
    const base = input({ camera, aircraftRoot: root }, { cockpitCamera, sourceOffset: [0, 0, -3], velocityWorld: [40, 0, 0] });
    const pose = computeListenerPose(base, createListenerPose());
    expect(pose.valid).toBe(true);
    expect(pose.source).toEqual([0, -2, -7]);
    expect(pose.exterior).toBe(0);

    // No scene.render(): inactive camera parents must still refresh after the
    // aircraft and floating-origin frame have moved and rotated.
    root.position.set(120, 30, 900);
    root.rotation.y = Math.PI / 2;
    computeListenerPose(base, pose);
    expect(pose.source[0]).toBeCloseTo(0, 4);
    expect(pose.source[1]).toBeCloseTo(-2, 4);
    expect(pose.source[2]).toBeCloseTo(-7, 4);
    expect(pose.sourceVelocity[2]).toBeCloseTo(40, 4);
    expect(pose.listenerVelocity).toEqual(pose.sourceVelocity);
    expect(root.getScene().activeCamera).toBe(camera);
  });

  it("matches exact camera endpoints and ignores chase changes at full cockpit blend", () => {
    const { camera, root } = world();
    root.position.z = 10;
    camera.position.set(-5, 0, -10);
    const cockpitCamera = new FreeCamera("pilot-listener", new Vector3(2, 1, 2), root.getScene());
    cockpitCamera.rotation.y = Math.PI / 2;
    const base = input({ camera, aircraftRoot: root }, { cockpitCamera });
    const cameraPose = computeListenerPose({ ...base, listenerCockpitBlend: 0 }, createListenerPose());
    expect(cameraPose.source).toEqual([5, 0, 20]);
    expect(cameraPose.exterior).toBe(1);
    const cockpitPose = computeListenerPose({ ...base, listenerCockpitBlend: 1 }, createListenerPose());
    expect(cockpitPose.source[0]).toBeCloseTo(-8, 5);
    expect(cockpitPose.source[1]).toBeCloseTo(-1, 5);
    expect(cockpitPose.source[2]).toBeCloseTo(-2, 5);
    const before = [...cockpitPose.source];
    camera.position.set(300, 80, -140);
    camera.rotation.y = -Math.PI;
    computeListenerPose({ ...base, listenerCockpitBlend: 1 }, cockpitPose);
    expect(cockpitPose.source).toEqual(before);
  });

  it("slerps orientation without collapsing source distance at an opposed-view midpoint", () => {
    const { camera, root } = world();
    root.position.z = 10;
    const cockpitCamera = new FreeCamera("opposed-listener", Vector3.Zero(), root.getScene());
    cockpitCamera.rotation.y = Math.PI;
    const pose = computeListenerPose(input({ camera, aircraftRoot: root }, {
      cockpitCamera, listenerCockpitBlend: 0.5, velocityWorld: [0, 0, 60],
    }), createListenerPose());
    expect(pose.valid).toBe(true);
    expect(Math.hypot(...pose.source)).toBeCloseTo(10, 5);
    expect(pose.source[0]).toBeCloseTo(-10, 5);
    expect(pose.source[2]).toBeCloseTo(0, 5);
    expect(pose.exterior).toBe(0.5);
    expect(pose.listenerVelocity).toEqual(pose.sourceVelocity);
  });

  it("blends world position and orientation into one physical listener frame", () => {
    const { camera, root } = world();
    root.position.set(20, 5, 10);
    camera.position.z = -20;
    const cockpitCamera = new FreeCamera("pilot-listener", new Vector3(8, 2, 4), root.getScene());
    cockpitCamera.rotation.y = Math.PI / 2;
    const pose = computeListenerPose(input({ camera, aircraftRoot: root }, {
      cockpitCamera, listenerCockpitBlend: 0.5, velocityWorld: [30, 2, 40],
    }), createListenerPose());
    expect(pose.source[0]).toBeCloseTo((16 - 18) / Math.SQRT2, 4);
    expect(pose.source[1]).toBeCloseTo(4, 4);
    expect(pose.source[2]).toBeCloseTo((16 + 18) / Math.SQRT2, 4);
    expect(Math.hypot(...pose.source)).toBeCloseTo(Math.hypot(16, 4, 18), 4);
    expect(pose.listenerVelocity).toEqual(pose.sourceVelocity);
  });

  it("bounds the blend and refuses a missing cockpit endpoint or non-finite blend", () => {
    const { camera, root } = world();
    const cockpitCamera = new FreeCamera("pilot-listener", new Vector3(0, 0, 5), root.getScene());
    const base = input({ camera, aircraftRoot: root }, { cockpitCamera });
    expect(computeListenerPose({ ...base, listenerCockpitBlend: 3 }, createListenerPose()).exterior).toBe(0);
    expect(computeListenerPose({ ...base, listenerCockpitBlend: -1 }, createListenerPose()).exterior).toBe(1);
    expect(computeListenerPose({ ...base, listenerCockpitBlend: Number.NaN }, createListenerPose()).valid).toBe(false);
    expect(computeListenerPose({ ...base, cockpitCamera: undefined, listenerCockpitBlend: 0.5 }, createListenerPose()).valid).toBe(false);
  });

  it("does not emit camera-view changes when listener endpoints have not moved", () => {
    const { camera, root } = world();
    camera.parent = root;
    camera.position.z = -14;
    const cockpit = new TransformNode("pilot-eye", root.getScene());
    cockpit.parent = root;
    cockpit.position.set(0, 2, 4);
    const cockpitCamera = new FreeCamera("pilot-listener", Vector3.Zero(), root.getScene());
    cockpitCamera.parent = cockpit;
    let changes = 0;
    let rootChanges = 0;
    root.onAfterWorldMatrixUpdateObservable.add(() => { rootChanges++; });
    camera.onViewMatrixChangedObservable.add(() => { changes++; });
    cockpitCamera.onViewMatrixChangedObservable.add(() => { changes++; });
    const base = input({ camera, aircraftRoot: root }, { cockpitCamera, listenerCockpitBlend: 0.5 });
    const pose = computeListenerPose(base, createListenerPose());
    const initial = changes;
    expect(initial).toBeGreaterThan(0);
    expect(rootChanges).toBe(1);
    computeListenerPose(base, pose);
    expect(changes).toBe(initial);
    expect(rootChanges).toBe(1);
    root.rotation.y = Math.PI / 4;
    computeListenerPose(base, pose);
    expect(changes).toBeGreaterThan(initial);
    expect(rootChanges).toBe(2);
  });
});
