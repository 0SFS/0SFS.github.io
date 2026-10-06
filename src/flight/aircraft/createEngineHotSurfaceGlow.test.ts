import { Color3, MeshBuilder, MultiMaterial, NullEngine, PBRMaterial, Scene, TransformNode } from "@babylonjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngineHotSurfaceGlow } from "./createEngineHotSurfaceGlow";
import type { EngineExhaustOpticalProfile } from "./engineExhaustProfiles";

vi.mock("foss-earth/runtime", () => ({ whenMeshesReady: async () => {} }));
const engines: NullEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); });
const profile: EngineExhaustOpticalProfile = {
  id: "thermal-test", textureUrl: "x.png", provenanceUrl: "x.json", width: 2, height: 4, colorSpace: "linear-srgb",
  dry: { firstRow: 0, rowCount: 2, temperatureKelvinRange: [300, 1400] },
  afterburner: { firstRow: 2, rowCount: 2, temperatureKelvinRange: [1000, 3000] }, hudAccentHex: "#ff9450",
  surfaceEmission: { temperatureKelvinRange: [300, 1400], unit: "cd/m2", samples: [[0, 0, 0], [250, 50, 1]] },
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
    expect(handle.update(850, true, 1, 1000)).toBe(true);
    expect(hot.emissiveColor.r).toBeCloseTo(0.125);
    expect(hot.emissiveColor.r).toBeGreaterThan(hot.emissiveColor.g);
    expect(t.material.emissiveColor.equals(Color3.Black())).toBe(true);
    expect(t.elsewhere.material).toBe(t.material);
    expect(handle.update(850, true, 1, 1000)).toBe(false);
    handle.update(850, false, 1, 1000);
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
    handle.update(1400, true, 1, 1000);
    expect((hot.subMaterials[0] as PBRMaterial).emissiveColor.r).toBe(0.25);
    handle.update(Number.NaN, true, 1, 1000);
    expect((hot.subMaterials[0] as PBRMaterial).emissiveColor.equals(Color3.Black())).toBe(true);
    handle.dispose();
    expect(t.liner.material).toBe(original);
    expect(original.subMaterials).toHaveLength(2);
    expect(original.subMaterials[0]).toBe(t.material);
    expect(original.subMaterials[1]).toBe(t.outer);
  });

  it("follows absolute temperature heating/cooling without an operating switch or another clock", async () => {
    const t = fixture();
    t.material.emissiveColor.set(0.001, 0.002, 0.003);
    const baseline = t.material.emissiveColor.clone();
    const handle = createEngineHotSurfaceGlow(t.nozzle, ["dark-metal"], profile, { compile: async () => {} });
    await handle.ready; handle.activate();
    const hot = t.liner.material as PBRMaterial;
    handle.update(300, true, 1, 1000);
    expect(hot.emissiveColor.equals(baseline)).toBe(true);
    const heating: number[] = [];
    for (const kelvin of [600, 850, 1100, 1400]) {
      handle.update(kelvin, true, 1, 1000);
      heating.push(hot.emissiveColor.r - baseline.r);
    }
    expect(heating.every((value, index) => index === 0 || value > heating[index - 1])).toBe(true);
    expect(heating.at(-1)).toBeCloseTo(0.25);
    // A cooling observation remains luminous; no running/fuel switch exists
    // in this interface and the renderer cannot invent a thermal time step.
    handle.update(1100, true, 1, 1000);
    expect(hot.emissiveColor.r - baseline.r).toBeCloseTo(heating[2]);
    expect(handle.update(1100, true, 1, 1000)).toBe(false);
    handle.update(850, true, 1, 1000);
    expect(hot.emissiveColor.r - baseline.r).toBeCloseTo(heating[1]);
    handle.update(300, true, 1, 1000);
    expect(hot.emissiveColor.equals(baseline)).toBe(true);
    handle.dispose();
  });

  it("interpolates continuously in Kelvin, clamps the declared range and clears missing observations", async () => {
    const t = fixture();
    const handle = createEngineHotSurfaceGlow(t.nozzle, ["dark-metal"], profile, { compile: async () => {} });
    await handle.ready; handle.activate();
    const hot = t.liner.material as PBRMaterial;
    handle.update(849, true, 1, 1000); const before = hot.emissiveColor.r;
    handle.update(851, true, 1, 1000);
    expect(hot.emissiveColor.r - before).toBeCloseTo(0.25 * 2 / 1100, 10);
    handle.update(1600, true, 1, 1000);
    expect(hot.emissiveColor.r).toBe(0.25);
    for (const temperature of [299, -1, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      handle.update(1400, true, 1, 1000);
      handle.update(temperature, true, 1, 1000);
      expect(hot.emissiveColor.equals(Color3.Black())).toBe(true);
    }
    handle.update(1400, true, 0.5, 1000);
    expect(hot.emissiveColor.r).toBe(0.125);
    handle.dispose();
  });

  it("reports visible warm-material restoration even without a running plume", async () => {
    const t = fixture();
    const original = t.liner.material;
    const handle = createEngineHotSurfaceGlow(t.nozzle, ["dark-metal"], profile, { compile: async () => {} });
    await handle.ready; handle.activate();
    handle.update(1100, true, 1, 1000);
    expect(handle.dispose()).toBe(true);
    expect(t.liner.material).toBe(original);
    expect(handle.dispose()).toBe(false);
  });

  it("maps declared cd/m2 through the exposed display reference without changing temperature", async () => {
    const t = fixture();
    const handle = createEngineHotSurfaceGlow(t.nozzle, ["dark-metal"], profile, { compile: async () => {} });
    await handle.ready; handle.activate();
    const hot = t.liner.material as PBRMaterial;
    handle.update(1400, true, 1, 1000);
    expect(hot.emissiveColor.asArray()).toEqual([0.25, 0.05, 0.001]);
    handle.update(1400, true, 1, 250);
    expect(hot.emissiveColor.asArray()).toEqual([1, 0.2, 0.004]);
    // Equivalent intensity/reference ratios produce identical output and do
    // not trigger repeated interpolation or material changes during pause.
    expect(handle.update(1400, true, 2, 500)).toBe(false);
    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MIN_VALUE, 1e-308]) {
      handle.update(1400, true, 1, 1000);
      handle.update(1400, true, 1, invalid);
      expect(hot.emissiveColor.equals(Color3.Black())).toBe(true);
    }
    handle.dispose();
  });

  it("reports no visible emission removal for cold, hidden or unactivated bindings", async () => {
    for (const kind of ["cold", "hidden", "inactive"] as const) {
      const t = fixture();
      const handle = createEngineHotSurfaceGlow(t.nozzle, ["dark-metal"], profile, { compile: async () => {} });
      await handle.ready;
      if (kind !== "inactive") handle.activate();
      handle.update(kind === "cold" ? 300 : 1100, true, 1, 1000);
      if (kind === "hidden") t.liner.isVisible = false;
      expect(handle.dispose()).toBe(false);
      expect(t.liner.material).toBe(t.material);
    }
  });

  it("skips the baked lookup for unchanged, clamped or hidden effective observations", async () => {
    const t = fixture();
    let reads = 0;
    const samples = new Proxy(profile.surfaceEmission!.samples, {
      get(target, key, receiver) {
        if (key === "0" || key === "1") reads += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    const handle = createEngineHotSurfaceGlow(t.nozzle, ["dark-metal"], {
      ...profile, surfaceEmission: { ...profile.surfaceEmission!, samples },
    }, { compile: async () => {} });
    await handle.ready; handle.activate();
    reads = 0;
    handle.update(850, true, 1, 1000);
    expect(reads).toBeGreaterThan(0);
    reads = 0;
    expect(handle.update(850, true, 1, 1000)).toBe(false);
    expect(reads).toBe(0);
    handle.update(1600, true, 1, 1000);
    reads = 0;
    expect(handle.update(2000, true, 1, 1000)).toBe(false);
    expect(reads).toBe(0);
    handle.update(850, false, 1, 1000);
    reads = 0;
    expect(handle.update(1400, false, 1, 1000)).toBe(false);
    expect(reads).toBe(0);
    handle.dispose();
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
    expect(() => createEngineHotSurfaceGlow(t.nozzle, ["dark-metal"], {
      ...profile, surfaceEmission: { ...profile.surfaceEmission!, unit: "display-rgb" as "cd/m2" },
    })).toThrow("cd/m2");
    for (const range of [[1400, 300], [300, 300], [300, Number.NaN], [-1, 1400]] as const) {
      expect(() => createEngineHotSurfaceGlow(t.nozzle, ["dark-metal"], {
        ...profile, surfaceEmission: { ...profile.surfaceEmission!, temperatureKelvinRange: range },
      })).toThrow("Kelvin bounds");
    }
    expect(() => createEngineHotSurfaceGlow(t.nozzle, ["unrelated-material"], profile)).toThrow("No declared");
    expect(t.liner.material).toBe(t.material);
  });
});
