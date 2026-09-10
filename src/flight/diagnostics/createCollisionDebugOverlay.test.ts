import { NullEngine, Quaternion, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { C172_GROUND_CONTACTS, groundContactBodyPosition } from "../physics/collisionGeometry";
import { createCollisionDebugOverlay } from "./createCollisionDebugOverlay";

const INCHES_PER_METER = 1 / 0.0254;

function createSdk(cg = { xIn: 42.117, yIn: -1.34, zIn: 37.739 }) {
  const values: Record<string, number> = {
    "inertia/cg-x-in": cg.xIn,
    "inertia/cg-y-in": cg.yIn,
    "inertia/cg-z-in": cg.zIn,
  };
  return {
    values,
    sdk: { getPropertyValue: vi.fn((property: string) => values[property]) },
  };
}

describe("collision debug overlay", () => {
  const engines: NullEngine[] = [];
  afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); });

  function createScene() {
    const engine = new NullEngine();
    engines.push(engine);
    return new Scene(engine);
  }

  it("allocates and reads nothing until enabled, then renders the shared physical points", () => {
    const scene = createScene();
    const aircraft = new TransformNode("aircraft", scene);
    const { sdk } = createSdk();
    const overlay = createCollisionDebugOverlay(scene, aircraft, sdk as never);

    expect(scene.meshes).toHaveLength(0);
    expect(sdk.getPropertyValue).not.toHaveBeenCalled();

    overlay.setEnabled(true);
    expect(scene.getMeshByName("collision-debug/body/nose")?.position.asArray()).toEqual([0, 0.7, 4.5]);
    expect(scene.getMeshByName("collision-debug/cg/center-of-gravity")?.position.asArray()).toEqual([0, 0, 0]);
    expect(scene.getMeshByName("collision-debug/guides")?.isPickable).toBe(false);
    expect(scene.meshes).toHaveLength(14);
    expect(sdk.getPropertyValue).toHaveBeenCalledTimes(3);
    expect(scene.meshes.every((mesh) => mesh.isPickable === false)).toBe(true);
    expect(scene.meshes.every((mesh) => mesh.metadata?.collisionDebug)).toBe(true);

    overlay.setEnabled(false);
    overlay.update();
    expect(sdk.getPropertyValue).toHaveBeenCalledTimes(3);
    overlay.dispose();
    expect(scene.meshes).toHaveLength(0);
  });

  it("follows the aircraft transform and uses the current JSBSim CG for contacts", () => {
    const scene = createScene();
    const aircraft = new TransformNode("aircraft", scene);
    aircraft.position.set(10, 20, 30);
    aircraft.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI / 2);
    const { sdk, values } = createSdk();
    const overlay = createCollisionDebugOverlay(scene, aircraft, sdk as never);
    overlay.setEnabled(true);

    const nose = scene.getMeshByName("collision-debug/body/nose")!;
    nose.computeWorldMatrix(true);
    const nosePosition = nose.getAbsolutePosition();
    // Babylon's world transform is Float32; centimetre-level geometry does
    // not need double-precision assertions here.
    expect(nosePosition.x).toBeCloseTo(14.5, 5);
    expect(nosePosition.y).toBeCloseTo(20.7, 5);
    expect(nosePosition.z).toBeCloseTo(30, 5);

    const contact = C172_GROUND_CONTACTS[1];
    const marker = scene.getMeshByName(`collision-debug/wheel/${contact.name}`)!;
    const expected = groundContactBodyPosition(contact, {
      xIn: values["inertia/cg-x-in"], yIn: values["inertia/cg-y-in"], zIn: values["inertia/cg-z-in"],
    });
    expect(marker.position.asArray()).toEqual([expected.left, expected.up, expected.forward]);

    values["inertia/cg-x-in"] += INCHES_PER_METER;
    overlay.update();
    expect(marker.position.z).toBeCloseTo(expected.forward + 1, 12);
  });
});
