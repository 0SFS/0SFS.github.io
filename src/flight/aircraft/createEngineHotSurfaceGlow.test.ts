import { Color3, MeshBuilder, MultiMaterial, NullEngine, PBRMaterial, Scene, TransformNode } from "@babylonjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngineHotSurfaceGlow } from "./createEngineHotSurfaceGlow";
import type { EngineExhaustOpticalProfile } from "./engineExhaustProfiles";

vi.mock("foss-earth/runtime", () => ({ whenMeshesReady: async () => {} }));
const engines: NullEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); });
const profile: EngineExhaustOpticalProfile = {
  id: "thermal-test", textureUrl: "x.png", provenanceUrl: "x.json", width: 2, height: 4, colorSpace: "linear-srgb",
  dry: { firstRow: 0, rowCount: 2 }, afterburner: { firstRow: 2, rowCount: 2 }, hudAccentHex: "#ff9450",
  surfaceEmission: { samples: [[0.02, 0.002, 0.0001], [0.25, 0.05, 0.001]] },
};
function fixture(multi = false) {
  const engine = new NullEngine(); engines.push(engine);
  const scene = new Scene(engine);
  const nozzle = new TransformNode("nozzle", scene);
  const liner = MeshBuilder.CreateCylinder("liner", {}, scene); liner.parent = nozzle;
  const material = new PBRMaterial("dark-metal", scene);
  material.albedoColor = new Color3(0.06, 0.06, 0.06); material.roughness = 0.5;
  const elsewhere = MeshBuilder.CreateBox("gear", {}, scene); elsewhere.material = material;
  const outer = new PBRMaterial("airframe-paint", scene);
  if (multi) {
    const all = new MultiMaterial("nozzle-parts", scene); all.subMaterials = [material, outer]; liner.material = all;
  } else liner.material = material;
  return { scene, nozzle, liner, material, elsewhere, outer };
}

describe("declared engine hot hardware", () => {
  it("prepares every declared geometry using a shared clone before an atomic binding change", async () => {
    const t = fixture();
    const second = MeshBuilder.CreateBox("second-liner", {}, t.scene); second.parent = t.nozzle; second.material = t.material;
    const releases: (() => void)[] = [];
    const compile = vi.fn(() => new Promise<void>(resolve => { releases.push(resolve); }));
    const handle = createEngineHotSurfaceGlow(t.nozzle, ["dark-metal"], profile, { compile });
    handle.activate();
    expect(t.liner.material).toBe(t.material);
    expect(second.material).toBe(t.material);
    expect(compile).toHaveBeenCalledTimes(2);
    for (const release of releases) release();
    await handle.ready; handle.activate();
    expect(second.material).toBe(t.liner.material);
    expect(second.material).not.toBe(t.material);
    handle.dispose();
  });
  it("glows without AB while preserving shared airframe shading and every geometry buffer", async () => {
    const t = fixture(); const geometry = t.liner.geometry; const meshCount = t.scene.meshes.length;
    const original = t.liner.material;
    const handle = createEngineHotSurfaceGlow(t.nozzle, ["dark-metal"], profile, { compile: async () => {} });
    expect(t.liner.material).toBe(original);
    await handle.ready; handle.activate();
    const hot = t.liner.material as PBRMaterial;
    expect(hot).not.toBe(t.material);
    expect(hot.albedoColor.equals(t.material.albedoColor)).toBe(true);
    expect(hot.roughness).toBe(0.5);
    expect(t.scene.meshes).toHaveLength(meshCount);
    expect(t.liner.geometry).toBe(geometry);
    expect(handle.update(0.5, true, 1)).toBe(true);
    expect(hot.emissiveColor.r).toBeCloseTo(0.135);
    expect(hot.emissiveColor.r).toBeGreaterThan(hot.emissiveColor.g);
    expect(t.material.emissiveColor.equals(Color3.Black())).toBe(true);
    expect(t.elsewhere.material).toBe(t.material);
    expect(handle.update(0.5, true, 1)).toBe(false);
    handle.update(0.5, false, 1);
    expect(hot.emissiveColor.equals(Color3.Black())).toBe(true);
    handle.dispose(); handle.dispose();
    expect(t.liner.material).toBe(original);
    expect(t.elsewhere.material).toBe(t.material);
  });

  it("replaces only selected submaterials and restores their original MultiMaterial binding", async () => {
    const t = fixture(true); const original = t.liner.material as MultiMaterial;
    const handle = createEngineHotSurfaceGlow(t.nozzle, ["dark-metal"], profile, { compile: async () => {} });
    await handle.ready; handle.activate();
    const hot = t.liner.material as MultiMaterial;
    expect(hot).not.toBe(original);
    expect(hot.subMaterials[1]).toBe(t.outer);
    expect(hot.subMaterials[0]).not.toBe(t.material);
    handle.update(1, true, 1);
    expect((hot.subMaterials[0] as PBRMaterial).emissiveColor.r).toBe(0.25);
    handle.update(Number.NaN, true, 1);
    expect((hot.subMaterials[0] as PBRMaterial).emissiveColor.equals(Color3.Black())).toBe(true);
    handle.dispose();
    expect(t.liner.material).toBe(original);
    expect(original.subMaterials).toHaveLength(2);
    expect(original.subMaterials[0]).toBe(t.material);
    expect(original.subMaterials[1]).toBe(t.outer);
  });

  it("cancels preparation without replacing a visible material or leaving a hung readiness promise", async () => {
    const t = fixture(); let release!: () => void;
    const handle = createEngineHotSurfaceGlow(t.nozzle, ["dark-metal"], profile,
      { compile: () => new Promise(resolve => { release = resolve; }) });
    handle.dispose();
    await handle.ready;
    handle.activate(); release();
    expect(t.liner.material).toBe(t.material);
    expect(t.scene.materials.filter(material => material.name.endsWith("engine-thermal"))).toEqual([]);
  });

  it("refuses missing thermal data or wrong attachment material declarations", () => {
    const t = fixture();
    expect(() => createEngineHotSurfaceGlow(t.nozzle, ["dark-metal"], { ...profile, surfaceEmission: undefined })).toThrow("baked thermal");
    expect(() => createEngineHotSurfaceGlow(t.nozzle, ["unrelated-material"], profile)).toThrow("No declared");
    expect(t.liner.material).toBe(t.material);
  });
});
