import "@babylonjs/loaders/glTF";
import { readFileSync } from "node:fs";
import { LoadAssetContainerAsync, NullEngine, Quaternion, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { describe, expect, it, vi } from "vitest";
import { bindEngineNozzleRig, threeBearingAngles, nozzleApertureGeometry } from "./engineNozzleRig";
import { F135_ENGINE_GEOMETRY } from "./generated/f135EngineData";

const beta = F135_ENGINE_GEOMETRY.bearingTiltDegrees * Math.PI / 180;
const Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);

describe("three-bearing engine nozzle", () => {
  it("poses the actual full and installed GLBs identically and preserves rigid shape and attachments throughout motion", async () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    try {
      const loaded = await Promise.all(F135_ENGINE_GEOMETRY.assets.slice(0, 2).map(asset =>
        LoadAssetContainerAsync(new Uint8Array(readFileSync(`public/${asset.path}`)), scene, { pluginExtension: ".glb" })));
      const rigs = loaded.map(container => {
        container.addAllToScene();
        const nodes = container.transformNodes.concat(container.meshes);
        const rig = bindEngineNozzleRig(nodes, { bearingNames: ["F135_Bearing1", "F135_Bearing2", "F135_Bearing3"],
          bearingInclinationRad: beta, apertureMechanism: F135_ENGINE_GEOMETRY.aperture });
        const exit = nodes.find(node => node.name === "F135_Exhaust")!;
        expect(container.meshes.every(mesh => !mesh.morphTargetManager)).toBe(true);
        expect(nodes.every(node => node.scaling.equalsWithEpsilon(Vector3.One()))).toBe(true);
        const p = F135_ENGINE_GEOMETRY.aperture;
        for (const aperture of [0, .1, .3, .5, .7, .9, 1]) {
          rig.update(0, 0, aperture);
          for (let index = 1; index <= p.segmentCount; index++) {
            const suffix = String(index).padStart(2, "0");
            const convergent = nodes.find(node => node.name === `F135_Convergent_${suffix}`)!;
            const divergent = nodes.find(node => node.name === `F135_Divergent_${suffix}`)!;
            const tip = Vector3.TransformCoordinates(new Vector3(0, 0, p.convergentLength), convergent.computeWorldMatrix(true));
            const hinge = Vector3.TransformCoordinates(Vector3.Zero(), divergent.computeWorldMatrix(true));
            expect(Vector3.Distance(tip, hinge)).toBeLessThan(1e-6);
            const length = Vector3.Distance(hinge, Vector3.TransformCoordinates(new Vector3(0, 0, p.divergentLength), divergent.computeWorldMatrix(true)));
            expect(length).toBeCloseTo(p.divergentLength, 6);
          }
          expect(exit.position.z).toBeCloseTo(rig.apertureGeometry.exitZ, 12);
        }
        return { rig, exit };
      });
      for (const pitch of [0, .4, 1, Math.PI / 2, 95 * Math.PI / 180]) for (const yaw of [-.17, 0, .17]) {
        for (const { rig } of rigs) rig.update(pitch, yaw, .5);
        const positions = rigs.map(({ exit }) => Vector3.TransformCoordinates(Vector3.Zero(), exit.computeWorldMatrix(true)));
        expect(Vector3.Distance(positions[0], positions[1])).toBeLessThan(1e-6);
        for (const { exit } of rigs) {
          const direction = Vector3.TransformNormal(Z, exit.computeWorldMatrix(true)).normalize();
          const expected = new Vector3(-Math.sin(pitch) * Math.sin(yaw), -Math.sin(pitch) * Math.cos(yaw), Math.cos(pitch));
          expect(Vector3.Distance(direction, expected)).toBeLessThan(1e-6);
        }
      }
      loaded.forEach(container => container.dispose());
    } finally { scene.dispose(); engine.dispose(); }
  });

  it("follows native pitch/yaw through full conversion with coupled circular-bearing roll", () => {
    for (const pitchDeg of [0, 1, 15, 45, 75, 90, 95]) for (const yawDeg of [-10, 0, 10]) {
      const pitch = pitchDeg * Math.PI / 180, yaw = yawDeg * Math.PI / 180;
      const [a, b, c] = threeBearingAngles(pitch, yaw, beta);
      const actual = Quaternion.RotationAxis(Z, a).multiply(Quaternion.RotationAxis(Y, beta))
        .multiply(Quaternion.RotationAxis(Z, b)).multiply(Quaternion.RotationAxis(Y, -2 * beta))
        .multiply(Quaternion.RotationAxis(Z, c)).multiply(Quaternion.RotationAxis(Y, beta));
      expect(c).toBe(-b);
      const direction = Z.applyRotationQuaternion(actual);
      // Babylon's vector path uses its float32 matrix storage.
      expect(direction.x).toBeCloseTo(-Math.sin(pitch) * Math.sin(yaw), 6);
      expect(direction.y).toBeCloseTo(-Math.sin(pitch) * Math.cos(yaw), 6);
      expect(direction.z).toBeCloseTo(Math.cos(pitch), 6);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(Math.PI);
    }
  });

  it("binds rigid parts once and preserves unavailable or repeated observations", () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const bearings = ["first", "second", "third"].map(name => new TransformNode(name, scene));
      bearings[1].rotationQuaternion = Quaternion.RotationAxis(Y, beta);
      bearings[2].rotationQuaternion = Quaternion.RotationAxis(Y, -2 * beta);
      const parts = Array.from({ length: 16 }, (_, i) => ["Convergent", "Divergent", "ConvergentSeal", "DivergentSeal", "ConvergentSealShoe", "Fairing", "FairingSeal"].map(role => new TransformNode(`F135_${role}_${String(i + 1).padStart(2, "0")}`, scene))).flat();
      const exit = new TransformNode("F135_Exhaust", scene);
      const rig = bindEngineNozzleRig([...bearings, ...parts, exit], {
        bearingNames: ["first", "second", "third"], bearingInclinationRad: beta, apertureMechanism: F135_ENGINE_GEOMETRY.aperture,
      });
      const setter = vi.spyOn(parts[0].position, "set");
      rig.update(Math.PI / 2, 0.1, 0.5);
      const rotations = [...bearings, ...parts].map(node => node.rotationQuaternion);
      expect(rig.partCount).toBe(112);
      rig.update(Math.PI / 2, 0.1, 0.5);
      rig.update(undefined, undefined, Number.NaN);
      expect(setter).toHaveBeenCalledOnce();
      [...bearings, ...parts].forEach((node, index) => expect(node.rotationQuaternion).toBe(rotations[index]));
      rig.update(0, 0, 10);
      expect(rig.apertureGeometry.exitRadius).toBeCloseTo(.565, 10);
      expect(nozzleApertureGeometry(-1, F135_ENGINE_GEOMETRY.aperture)).toEqual(nozzleApertureGeometry(Number.NaN, F135_ENGINE_GEOMETRY.aperture));
      expect(nozzleApertureGeometry(2, F135_ENGINE_GEOMETRY.aperture)).toEqual(nozzleApertureGeometry(1, F135_ENGINE_GEOMETRY.aperture));
    } finally { scene.dispose(); engine.dispose(); }
  });
});
