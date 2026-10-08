import { FreeCamera, NullEngine, PointLight, RawTexture, Scene, ShaderMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import { expect, it, vi } from "vitest";
import { createEngineExhaust } from "./createEngineExhaust";
import { getEngineExhaustOpticalProfile } from "./engineExhaustProfiles";
import { evaluateEngineGasOptics } from "./engineGasOptics";
import type { EngineGasSupportSnapshot, EngineGasSection } from "./engineGasSupport";

vi.mock("foss-earth/runtime", () => ({ whenMeshesReady: async () => {} }));

it("renders one shared interior/exterior field, updates posed support without rebaking and lights only from the exterior bound", async () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  scene.activeCamera = new FreeCamera("camera", new Vector3(0, 0, 12), scene);
  const root = new TransformNode("engine", scene), exit = new TransformNode("exit", scene); exit.parent = root;
  const section = (start: number, end: number, a: number, b: number): EngineGasSection => ({
    id: String(start), startCenter: [0, 0, start], endCenter: [0, 0, end], startU: [1, 0, 0], endU: [1, 0, 0], radialV: [0, 1, 0],
    startRadius: a, endRadius: b, startDistance: start, endDistance: end, startAreaFactor: 1, endAreaFactor: 1, innerRadiusKnots: [], nozzleSealClip: false,
  });
  let support: EngineGasSupportSnapshot = { revision: 1, sections: [section(-1, 0, 0.4, 0.4), section(0, 6, 0.4, 0.82)],
    bounds: { min: [-0.82, -0.82, -1], max: [0.82, 0.82, 6] }, nozzleSegmentCount: 16, nozzleSealHalfWidthMeters: 0.05,
    flowDomain: { axialDistanceRangeMeters: [-1, 6], sections: [{ distanceMeters: -1, radiusMeters: 0.4 }, { distanceMeters: 0, radiusMeters: 0.4 }, { distanceMeters: 6, radiusMeters: 0.82 }] } };
  const profile = getEngineExhaustOpticalProfile("f135-visible-approximation-v1")!;
  const settings = { enabled: true, sampleCount: 32, maxDistanceMeters: 2000, intensity: 1, surfaceReferenceNits: 1000,
    gasReferenceNits: 1000, lightEnabled: true, lightGain: 1, lightRangeMeters: 10 };
  const state = { running: true, augmentation: false, powerNorm: 1, gasTemperatureKelvin: 1003, ambientTemperatureKelvin: 288.15,
    fuelFlowKgPerSecond: 4.42, afterburnerBurnedFuelFlowKgPerSecond: 0, simulationTimeSeconds: 1 };
  const handle = createEngineExhaust(scene, { attachment: exit, exitPosition: [0, 0, 0], direction: [0, 0, 1],
    closedRadiusMeters: 0.4, openRadiusMeters: 0.6, lengthMeters: 6, opticalProfile: profile, settings,
    flowSupport: { root, snapshot: () => support }, whenReady: async () => {} });
  try {
    await handle.ready; handle.update(state);
    expect(handle.mesh.parent).toBe(root);
    expect(handle.mesh.position.z).toBe(2.5);
    expect(handle.mesh.scaling.z).toBe(7);
    const material = handle.mesh.material as ShaderMaterial;
    expect(material.serialize().vectors4.flowSettings[0]).toBe(2);
    const field = scene.textures.find(t => t.name === "engine-exhaust-source-field") as RawTexture;
    const evaluated = evaluateEngineGasOptics(profile, { temperatureKelvin: state.gasTemperatureKelvin,
      ambientTemperatureKelvin: state.ambientTemperatureKelvin, augmentation: false, fuelFlowKgPerSecond: state.fuelFlowKgPerSecond,
      radiusMeters: 0.4, lengthMeters: 6, flowDomain: support.flowDomain });
    expect(field.getInternalTexture()!._bufferView).toEqual(evaluated.field!.rgba);
    const light = scene.lights.find(light => light instanceof PointLight)!;
    expect(light.intensity).toBeCloseTo(Math.max(...evaluated.exteriorIsotropicIntensityRgbCd) / settings.gasReferenceNits, 12);
    expect(light.intensity).toBeLessThan(Math.max(...evaluated.isotropicIntensityRgbCd) / settings.gasReferenceNits);
    const upload = vi.spyOn(field, "update");
    const baselineLight = light.intensity;
    const baselineGain = material.serialize().floats.intensity;
    for (const multiplier of [0.5, 1, 3, 10]) {
      handle.update(state, { ...settings, dryIntensity: multiplier });
      expect(material.serialize().floats.intensity).toBeCloseTo(baselineGain * multiplier, 12);
      expect(light.intensity).toBeCloseTo(baselineLight * multiplier, 12);
      expect(field.getInternalTexture()!._bufferView).toEqual(evaluated.field!.rgba);
      expect(upload).not.toHaveBeenCalled();
    }
    // AB has its own modeled output; adjusting dry presentation cannot boost it.
    handle.update({ ...state, augmentation: true }, { ...settings, dryIntensity: 10 });
    expect(material.serialize().floats.intensity).toBe(baselineGain);
    expect(light.intensity).toBeCloseTo(baselineLight, 12);
    expect(upload).not.toHaveBeenCalled();
    support = { ...support, revision: 2, bounds: { min: [-0.82, -1.82, -1], max: [0.82, 0.82, 6] } };
    handle.update(state);
    expect(handle.mesh.position.y).toBe(-0.5);
    expect(upload).not.toHaveBeenCalled();
    handle.update({ ...state, augmentation: true });
    expect(upload).not.toHaveBeenCalled();
  } finally { handle.dispose(); scene.dispose(); engine.dispose(); }
});
