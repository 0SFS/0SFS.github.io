import { NullEngine, Scene, TransformNode } from "@babylonjs/core";
import { expect, it, vi } from "vitest";
import { WHEEL_SPIN_CONFIGS, createWheelSpinState } from "../physics/wheelSpin";
import { C172_GROUND_CONTACTS, groundContactBodyPosition } from "../physics/collisionGeometry";
import { createWheelSpinDebugOverlay } from "./createWheelSpinDebugOverlay";

it("places spinning outlines above the contact references and disposes their resources", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const parent = new TransformNode("aircraft", scene);
    const cg = { xIn: 42, yIn: 0, zIn: 38 };
    const sdk = { getPropertyValue: vi.fn((key: string) => ({ "inertia/cg-x-in": cg.xIn,
      "inertia/cg-y-in": cg.yIn, "inertia/cg-z-in": cg.zIn })[key]) };
    const states = WHEEL_SPIN_CONFIGS.map(() => createWheelSpinState());
    states[0].compressionMeters = 0.03;
    states[0].steeringRad = 0.1;
    states[0].angleRad = 1.2;
    const overlay = createWheelSpinDebugOverlay(scene, parent, sdk as never, () => states);
    expect(scene.meshes).toHaveLength(0);
    expect(sdk.getPropertyValue).not.toHaveBeenCalled();
    const materialCount = scene.materials.length;
    overlay.setEnabled(true);
    expect(scene.meshes).toHaveLength(3);
    expect(scene.meshes.every(mesh => !mesh.isPickable && mesh.metadata.collisionDebug.kind === "wheel-spin")).toBe(true);
    const axle = scene.getTransformNodeByName("wheel-spin-debug/NOSE/axle")!;
    const rotor = scene.getTransformNodeByName("wheel-spin-debug/NOSE/rotor")!;
    const contact = groundContactBodyPosition(C172_GROUND_CONTACTS[0], cg);
    expect(axle.position.y).toBeCloseTo(contact.up + 0.18 + 0.03);
    expect(axle.position.z).toBeCloseTo(contact.forward);
    expect(axle.rotation.y).toBe(-0.1);
    expect(rotor.rotation.x).toBe(1.2);
    states[0].angleRad = 2.3;
    overlay.update();
    expect(rotor.rotation.x).toBe(2.3);
    overlay.setEnabled(false);
    sdk.getPropertyValue.mockClear();
    overlay.update();
    expect(sdk.getPropertyValue).not.toHaveBeenCalled();
    expect(axle.isEnabled()).toBe(false);
    overlay.dispose();
    overlay.dispose();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toHaveLength(materialCount);
    expect(scene.transformNodes).toEqual([parent]);
  } finally { engine.dispose(); }
});
