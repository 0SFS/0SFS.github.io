import "@babylonjs/loaders/glTF";
import { readFileSync } from "node:fs";
import { LoadAssetContainerAsync, NullEngine, Quaternion, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { describe, expect, it, vi } from "vitest";
import { bindEngineNozzleRig } from "./engineNozzleRig";
import { F135_ENGINE_GEOMETRY as g } from "./generated/f135EngineData";
import { bindEngineGasSupport, engineGasSectionPoint, engineGasSectionVolume, F135_ENGINE_GAS_SUPPORT, sampleEngineGasSection, sampleEngineGasSupport } from "./engineGasSupport";
import { validEngineGasFlowDomain } from "./engineGasOptics";

describe("rigid engine interior/exterior gas support", () => {
  it("skips section reconstruction before transforming rings when its physical inputs are unchanged", () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    const placement = new TransformNode("placement", scene);
    const root = new TransformNode("root", scene), pivot = new TransformNode("pivot", scene);
    const duct = new TransformNode("duct", scene), nozzle = new TransformNode("nozzle", scene);
    root.parent = placement; pivot.parent = root; duct.parent = pivot; nozzle.parent = duct; nozzle.position.z = 1;
    const support = bindEngineGasSupport(root, {
      rootNode: root.name, nozzleNode: nozzle.name, nozzleInletRadiusMeters: 0.5,
      nozzleSegmentCount: 16, nozzleSealHalfWidthMeters: 0.05,
      ducts: [{ id: "interior", attachmentNode: duct.name,
        start: { center: [0, 0, 0], radialU: [1, 0, 0], radialV: [0, 1, 0], radiusMeters: 0.5 },
        end: { center: [0, 0, 1], radialU: [1, 0, 0], radialV: [0, 1, 0], radiusMeters: 0.5 } }],
    });
    const aperture = { throatRadius: 0.35, throatZ: 0.2, exitRadius: 0.4, exitZ: 0.5 };
    const initial = support.update(aperture, 6, 0.07);
    const transform = vi.spyOn(Vector3, "TransformCoordinates");
    try {
      for (let i = 0; i < 3; i++) expect(support.update({ ...aperture }, 6, 0.07)).toBe(initial);
      root.position.set(20, 100, -50); root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), 0.6);
      expect(support.update(aperture, 6, 0.07)).toBe(initial);
      expect(transform).not.toHaveBeenCalled();

      // An intermediate ancestor need not itself own a support section to move it.
      pivot.rotation.x = 0.3;
      let changed = support.update(aperture, 6, 0.07);
      expect(changed.revision).toBe(initial.revision + 1);
      expect(changed.sections[0].endCenter).not.toEqual(initial.sections[0].endCenter);
      expect(transform).toHaveBeenCalled();
      transform.mockClear();
      expect(support.update(aperture, 6, 0.07)).toBe(changed);
      expect(transform).not.toHaveBeenCalled();

      // Every physical aperture coordinate, support length and spread invalidates immediately.
      for (const key of ["throatRadius", "throatZ", "exitRadius", "exitZ"] as const) {
        aperture[key] += 0.01;
        const next = support.update(aperture, 6, 0.07);
        expect(next.revision).toBe(changed.revision + 1);
        changed = next;
      }
      const longer = support.update(aperture, 7, 0.07), wider = support.update(aperture, 7, 0.08);
      expect(longer.revision).toBe(changed.revision + 1);
      expect(longer.sections.at(-1)!.endDistance).toBeCloseTo(7, 12);
      expect(wider.revision).toBe(longer.revision + 1);
      expect(wider.sections.at(-1)!.endRadius).toBeGreaterThan(longer.sections.at(-1)!.endRadius);

      nozzle.parent = root;
      const reparented = support.update(aperture, 7, 0.08);
      expect(reparented.revision).toBe(wider.revision + 1);
      expect(reparented.sections[1].startCenter).not.toEqual(wider.sections[1].startCenter);
      nozzle.parent = null;
      expect(() => support.update(aperture, 7, 0.08)).toThrow("outside its engine root");
      nozzle.parent = root;
      placement.scaling.setAll(2);
      expect(() => support.update(aperture, 7, 0.08)).toThrow("metre-scale");
      placement.scaling.setAll(1);
      expect(support.update(aperture, 7, 0.08)).toBe(reparented);
      root.scaling.setAll(2);
      expect(() => support.update(aperture, 7, 0.08)).toThrow("metre-scale");
    } finally { transform.mockRestore(); scene.dispose(); engine.dispose(); }
  });

  it("joins actual exported sections through aperture and vector motion, with identical full/installed domains", async () => {
    const engine = new NullEngine(), scene = new Scene(engine); scene.useRightHandedSystem = true;
    try {
      const containers = await Promise.all(g.assets.slice(0, 2).map(asset => LoadAssetContainerAsync(new Uint8Array(readFileSync(`public/${asset.path}`)), scene, { pluginExtension: ".glb" })));
      const handles = containers.map(container => {
        container.addAllToScene();
        const nodes = container.transformNodes.concat(container.meshes), root = nodes.find(node => node.name === "F135_Engine")!;
        return { root, nodes, rig: bindEngineNozzleRig(nodes, { bearingNames: ["F135_Bearing1", "F135_Bearing2", "F135_Bearing3"], bearingInclinationRad: g.bearingTiltDegrees * Math.PI / 180, apertureMechanism: g.aperture }), support: bindEngineGasSupport(root, F135_ENGINE_GAS_SUPPORT) };
      });
      const physicalDomains = new Map<number, string>();
      for (const pitch of [0, 0.8, Math.PI / 2, 95 * Math.PI / 180]) for (const yaw of [-0.17, 0, 0.17]) for (const aperture of [0, 0.5, 1]) {
        const snapshots = handles.map(({ rig, support, nodes }) => {
          rig.update(pitch, yaw, aperture);
          const transforms = nodes.map(node => [...node.position.asArray(), ...node.scaling.asArray(), ...(node.rotationQuaternion?.asArray() ?? [])]);
          const snapshot = support.update(rig.apertureGeometry, 6, 0.07);
          expect(nodes.map(node => [...node.position.asArray(), ...node.scaling.asArray(), ...(node.rotationQuaternion?.asArray() ?? [])])).toEqual(transforms);
          expect(support.update(rig.apertureGeometry, 6, 0.07)).toBe(snapshot);
          expect(validEngineGasFlowDomain(snapshot.flowDomain)).toBe(true);
          expect(snapshot.sections).toHaveLength(7);
          for (const [index, section] of snapshot.sections.entries()) {
            expect(engineGasSectionVolume(section)).toBeGreaterThan(0);
            for (const t of [0.05, 0.5, 0.95]) for (const angle of [0, 0.3, 1.4, 2.8, 4, 5.5]) {
              const point = engineGasSectionPoint(section, t, 0.8, angle), sample = sampleEngineGasSection(section, point);
              expect(sample, `${section.id} t=${t}`).not.toBeNull();
              expect(sample!.fraction).toBeCloseTo(t, 5);
              expect(sample!.radialFraction).toBeCloseTo(0.8, 5);
              expect(sampleEngineGasSection(section, engineGasSectionPoint(section, t, 1.02, angle))).toBeNull();
            }
            if (index < snapshot.sections.length - 1) {
              const next = snapshot.sections[index + 1];
              expect(Math.hypot(...section.endCenter.map((value, i) => value - next.startCenter[i]))).toBeLessThan(1e-6);
              for (let i = 0; i < 16; i++) {
                const point = engineGasSectionPoint(section, 1, 0.8, i * Math.PI / 8), sample = sampleEngineGasSection(next, point);
                expect(sample, `${section.id} -> ${next.id}`).not.toBeNull();
                expect(sample!.fraction).toBeCloseTo(0, 5);
                expect(sample!.distanceMeters).toBeCloseTo(section.endDistance, 5);
              }
            }
          }
          expect(sampleEngineGasSupport(snapshot, [0, 0, -0.4])).toBeNull();
          expect(sampleEngineGasSupport(snapshot, [0.4, 0, -0.4])?.sectionIndex).toBe(0);
          expect(snapshot.sections[6].startDistance).toBe(0);
          expect(snapshot.sections[6].endDistance).toBeCloseTo(6, 6);
          return snapshot;
        });
        expect(snapshots[0]).toEqual(snapshots[1]);
        const physicalDomain = JSON.stringify(snapshots[0].flowDomain);
        if (physicalDomains.has(aperture)) expect(physicalDomain).toBe(physicalDomains.get(aperture));
        else physicalDomains.set(aperture, physicalDomain);
      }
      const { root, rig, support } = handles[0], before = support.update(rig.apertureGeometry, 6, 0.07);
      root.position.addInPlace(new Vector3(20, 100, -50)); root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), 0.6);
      expect(support.update(rig.apertureGeometry, 6, 0.07)).toBe(before);
      root.scaling.setAll(2);
      expect(() => support.update(rig.apertureGeometry, 6, 0.07)).toThrow("metre-scale");
      containers.forEach(container => container.dispose());
    } finally { scene.dispose(); engine.dispose(); }
  });
});
