import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { Color3, Constants, MeshBuilder, TransformNode, Vector3, type Scene } from "@babylonjs/core";
import { C172_GROUND_CONTACTS, groundContactBodyPosition } from "../physics/collisionGeometry";
import { WHEEL_SPIN_CONFIGS, type WheelSpinState } from "../physics/wheelSpin";

/** Tire outlines illustrate the scalar spin experiment, not a new collision hull.
 * Axles use the uncompressed contact references plus radius and vertical stroke.
 * Sloped ground/strut flex are intentionally not reconstructed here.
 */
export function createWheelSpinDebugOverlay(scene: Scene, parent: TransformNode, sdk: JSBSimSdk,
  getStates: () => readonly WheelSpinState[]) {
  let enabled = false;
  let disposed = false;
  let root: TransformNode | null = null;
  const axles: TransformNode[] = [];
  const rotors: TransformNode[] = [];

  function createGeometry(): void {
    root = new TransformNode("wheel-spin-debug", scene);
    root.parent = parent;
    root.doNotSerialize = true;
    for (const config of WHEEL_SPIN_CONFIGS) {
      const axle = new TransformNode(`wheel-spin-debug/${config.name}/axle`, scene);
      axle.parent = root;
      axle.doNotSerialize = true;
      axles.push(axle);
      const rotor = new TransformNode(`wheel-spin-debug/${config.name}/rotor`, scene);
      rotor.parent = axle;
      rotor.doNotSerialize = true;
      rotors.push(rotor);
      const lines: Vector3[][] = [];
      for (const side of [-1, 1]) {
        const x = side * config.widthMeters / 2;
        const ring = Array.from({ length: 33 }, (_, i) => new Vector3(x,
          Math.cos(i * Math.PI / 16) * config.radiusMeters, Math.sin(i * Math.PI / 16) * config.radiusMeters));
        lines.push(ring, [new Vector3(x, 0, 0), ring[0]]);
      }
      lines.push([new Vector3(-config.widthMeters / 2, 0, 0), new Vector3(config.widthMeters / 2, 0, 0)]);
      const mesh = MeshBuilder.CreateLineSystem(`wheel-spin-debug/${config.name}/tire`, { lines }, scene);
      mesh.parent = rotor;
      mesh.color = Color3.FromHexString("#ffbb46");
      mesh.alpha = 0.95;
      mesh.alphaIndex = 10002;
      mesh.isPickable = false;
      mesh.doNotSerialize = true;
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.metadata = { collisionDebug: { kind: "wheel-spin", name: config.name } };
      if (mesh.material) {
        mesh.material.depthFunction = Constants.ALWAYS;
        mesh.material.disableDepthWrite = true;
      }
    }
  }

  function update(): void {
    if (!enabled || disposed || !root) return;
    const cg = { xIn: sdk.getPropertyValue("inertia/cg-x-in"), yIn: sdk.getPropertyValue("inertia/cg-y-in"),
      zIn: sdk.getPropertyValue("inertia/cg-z-in") };
    const valid = Object.values(cg).every(Number.isFinite);
    const states = getStates();
    for (let i = 0; i < axles.length; i++) {
      const state = states[i];
      const usable = valid && state && [state.compressionMeters, state.angleRad, state.steeringRad].every(Number.isFinite);
      axles[i].setEnabled(!!usable);
      if (!usable) continue;
      const contact = groundContactBodyPosition(C172_GROUND_CONTACTS[i], cg);
      axles[i].position.set(contact.left, contact.up + WHEEL_SPIN_CONFIGS[i].radiusMeters + state.compressionMeters, contact.forward);
      // JSBSim positive steering turns right; body +X here points left.
      axles[i].rotation.y = -state.steeringRad;
      rotors[i].rotation.x = state.angleRad;
    }
  }

  return {
    setEnabled(value: boolean): void {
      if (disposed || enabled === value) return;
      enabled = value;
      if (enabled && !root) createGeometry();
      root?.setEnabled(enabled);
      if (enabled) update();
    },
    update,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      root?.dispose(false, true);
      root = null;
    },
  };
}
