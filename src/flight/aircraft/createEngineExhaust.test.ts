import {
  FreeCamera, NullEngine, Quaternion, RawTexture, Scene, ShaderLanguage, ShaderMaterial,
  TransformNode, Vector3,
} from "@babylonjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngineExhaust, type EngineExhaustOptions, type EngineExhaustSettings, type EngineExhaustState } from "./createEngineExhaust";
import type { EngineExhaustOpticalProfile } from "./engineExhaustProfiles";

vi.mock("foss-earth/runtime", () => ({ whenMeshesReady: async () => {} }));

const settings: EngineExhaustSettings = { enabled: true, sampleCount: 8, maxDistanceMeters: 2_000, intensity: 1 };
const running: EngineExhaustState = { running: true, augmentation: false, powerNorm: 0.8, nozzlePositionNorm: 0, simulationTimeSeconds: 10 };
const profile: EngineExhaustOpticalProfile = {
  id: "test-linear-emission", textureUrl: "test.png", provenanceUrl: "test.json", width: 2, height: 4,
  colorSpace: "linear-srgb", dry: { firstRow: 0, rowCount: 2 }, afterburner: { firstRow: 2, rowCount: 2 }, hudAccentHex: "#ff9450",
};
const engines: NullEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); });

function fixture(overrides: Partial<EngineExhaustOptions> = {}, webGpu = false) {
  const engine = new NullEngine();
  engines.push(engine);
  if (webGpu) Object.defineProperty(engine, "isWebGPU", { value: true });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new FreeCamera("camera", new Vector3(0, 0, 20), scene);
  scene.activeCamera = camera;
  camera.computeWorldMatrix();
  const attachment = new TransformNode("vectoring-nozzle", scene);
  const requestRender = vi.fn();
  const texture = RawTexture.CreateRGBATexture(new Uint8Array(2 * 4 * 4).fill(255), 2, 4, scene, false, false);
  const options: EngineExhaustOptions = {
    attachment, exitPosition: [0, 0, 1], direction: [0, 0, 1], closedRadiusMeters: 0.4,
    openRadiusMeters: 0.6, lengthMeters: 6, opticalProfile: profile, settings, requestRender,
    createTexture: () => texture, whenReady: async () => {}, ...overrides,
  };
  const handle = createEngineExhaust(scene, options);
  const material = handle.mesh.material as ShaderMaterial;
  return { scene, camera, attachment: options.attachment, requestRender, texture, handle, material };
}

function materialData(material: ShaderMaterial): {
  floats: Record<string, number>; ints: Record<string, number>;
  vectors2: Record<string, number[]>; vectors3: Record<string, number[]>;
} {
  return material.serialize();
}

describe("shared engine exhaust renderer", () => {
  it("prepares one static visual-only volume hidden and reveals it with one frame when ready", async () => {
    let release!: () => void;
    const t = fixture({ whenReady: () => new Promise(resolve => { release = resolve; }) });
    t.handle.update(running);
    await Promise.resolve();
    expect(t.handle.mesh.isEnabled()).toBe(false);
    expect(t.requestRender).not.toHaveBeenCalled();
    expect(t.handle.mesh.getTotalIndices() / 3).toBe(12);
    expect(t.handle.mesh.isPickable).toBe(false);
    expect(t.handle.mesh.receiveShadows).toBe(false);
    expect(t.handle.mesh.metadata.aircraftVisualOnly).toBe(true);
    expect(t.material.disableDepthWrite).toBe(true);
    expect(t.texture.gammaSpace).toBe(false);
    release();
    await t.handle.ready;
    expect(t.handle.mesh.isEnabled()).toBe(true);
    expect(t.requestRender).toHaveBeenCalledTimes(1);
    const geometry = t.handle.mesh.geometry;
    t.handle.update({ ...running, augmentation: true, powerNorm: 1, nozzlePositionNorm: 1 });
    expect(t.handle.mesh.geometry).toBe(geometry);
    expect(t.handle.mesh.getTotalIndices()).toBe(36);
  });

  it("selects dry emission without augmentation and AB emission only from the native boolean", async () => {
    const t = fixture();
    await t.handle.ready;
    t.handle.update({ ...running, powerNorm: 1 });
    expect(materialData(t.material).vectors2.lutBank).toEqual([0, 2]);
    expect(materialData(t.material).vectors3.volumeMeters.slice(0, 2)).toEqual([0.4, 0.4]);
    expect(materialData(t.material).vectors3.volumeMeters[2]).toBeCloseTo(1.2);
    t.handle.update({ ...running, augmentation: true });
    expect(materialData(t.material).vectors2.lutBank).toEqual([2, 2]);
    expect(materialData(t.material).vectors3.volumeMeters[2]).toBeCloseTo(5.64);
    t.handle.update({ ...running, augmentation: true, running: false });
    expect(t.handle.mesh.isEnabled()).toBe(false);
    // A live dry engine remains visible through the faint, smooth dry bank.
    t.handle.update(running);
    expect(t.handle.mesh.isEnabled()).toBe(true);
    expect(materialData(t.material).vectors2.lutBank).toEqual([0, 2]);
  });

  it("preserves physical metre dimensions and follows vectoring/floating-origin transforms", async () => {
    const t = fixture();
    const root = new TransformNode("converted-model", t.scene);
    root.scaling.setAll(0.83305745);
    t.attachment.parent = root;
    // Recreate after the authored conversion scale is established.
    t.handle.dispose();
    const handle = createEngineExhaust(t.scene, {
      attachment: t.attachment, exitPosition: [0, 0, 1], direction: [0, 0, 1],
      closedRadiusMeters: 0.4, openRadiusMeters: 0.6, lengthMeters: 6, opticalProfile: profile,
      settings, createTexture: () => RawTexture.CreateRGBATexture(new Uint8Array(32), 2, 4, t.scene, false, false), whenReady: async () => {},
    });
    await handle.ready;
    t.attachment.rotationQuaternion = Quaternion.RotationAxis(Vector3.Right(), Math.PI / 2);
    handle.update({ ...running, augmentation: true, powerNorm: 1, nozzlePositionNorm: 1 });
    const matrix = handle.mesh.computeWorldMatrix(true);
    const inlet = Vector3.TransformCoordinates(new Vector3(0, 0, -0.5), matrix);
    const outlet = Vector3.TransformCoordinates(new Vector3(0, 0, 0.5), matrix);
    expect(Vector3.Distance(inlet, outlet)).toBeCloseTo(6, 5);
    expect(Vector3.TransformNormal(Vector3.Right(), matrix).length()).toBeCloseTo(0.6, 5);
    expect(outlet.y).toBeLessThan(inlet.y - 5.99);
    expect(Math.abs(outlet.z - inlet.z)).toBeLessThan(1e-5);
    root.position.set(300, 200, -100);
    handle.update({ ...running, augmentation: true, powerNorm: 1, nozzlePositionNorm: 1 });
    const shifted = Vector3.TransformCoordinates(new Vector3(0, 0, 0.5), handle.mesh.computeWorldMatrix(true));
    expect(Vector3.Distance(shifted.subtract(outlet), root.position)).toBeLessThan(1e-4);
  });

  it("bounds shader work, rejects invalid telemetry, and culls outside the explicit distance", async () => {
    const t = fixture();
    await t.handle.ready;
    t.handle.update({ ...running, powerNorm: 2 }, { ...settings, sampleCount: 100, intensity: 100 });
    expect(materialData(t.material).ints.sampleCount).toBe(32);
    expect(materialData(t.material).floats.intensity).toBe(8);
    expect(materialData(t.material).floats.powerNorm).toBe(1);
    t.handle.update(running, { ...settings, sampleCount: -2 });
    expect(materialData(t.material).ints.sampleCount).toBe(4);
    t.handle.update({ ...running, powerNorm: Number.NaN });
    expect(t.handle.mesh.isEnabled()).toBe(false);
    t.handle.update({ ...running, simulationTimeSeconds: Number.NaN });
    expect(t.handle.mesh.isEnabled()).toBe(false);
    t.handle.update(running, { ...settings, maxDistanceMeters: 1 });
    expect(t.handle.mesh.isEnabled()).toBe(false);
    t.handle.update(running, settings);
    expect(t.handle.mesh.isEnabled()).toBe(true);
    t.handle.update(running, { ...settings, enabled: false });
    expect(t.handle.mesh.isEnabled()).toBe(false);
  });

  it("retains last observed aperture and does not draw unchanged clock-only or hidden updates", async () => {
    const t = fixture();
    await t.handle.ready;
    t.handle.update({ ...running, nozzlePositionNorm: 0.5 });
    const scale = t.handle.mesh.scaling.clone();
    t.requestRender.mockClear();
    t.handle.update({ ...running, nozzlePositionNorm: undefined, simulationTimeSeconds: 11 });
    expect(t.handle.mesh.scaling.equals(scale)).toBe(true);
    expect(t.requestRender).not.toHaveBeenCalled();
    t.handle.update({ ...running, running: false });
    expect(t.requestRender).toHaveBeenCalledTimes(1);
    t.requestRender.mockClear();
    t.handle.update({ ...running, running: false, powerNorm: 0.2 });
    expect(t.requestRender).not.toHaveBeenCalled();
  });

  it("interpolates the baked temporal envelope from native time and holds while paused", async () => {
    const t = fixture({ opticalProfile: { ...profile, temporalEmission: { periodSeconds: 1, samples: [1, 1.04, 1, 0.96] } } });
    await t.handle.ready;
    t.handle.update({ ...running, augmentation: true, simulationTimeSeconds: 0.125 });
    expect(materialData(t.material).floats.intensity).toBeCloseTo(1.02);
    t.requestRender.mockClear();
    // Updating presentation while the native simulation clock is held does
    // not advance the plume or schedule another frame.
    t.handle.update({ ...running, augmentation: true, simulationTimeSeconds: 0.125 });
    expect(materialData(t.material).floats.intensity).toBeCloseTo(1.02);
    expect(t.requestRender).not.toHaveBeenCalled();
    t.handle.update({ ...running, augmentation: true, simulationTimeSeconds: 0.75 });
    expect(materialData(t.material).floats.intensity).toBeCloseTo(0.96);
    expect(t.requestRender).toHaveBeenCalledTimes(1);
    t.handle.update({ ...running, augmentation: true, simulationTimeSeconds: -0.25 });
    expect(materialData(t.material).floats.intensity).toBeCloseTo(0.96);
    expect(t.requestRender).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("chooses an explicit compatible shader language (WebGPU=%s)", async webGpu => {
    const t = fixture({}, webGpu);
    await t.handle.ready;
    expect(t.material.shaderLanguage).toBe(webGpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL);
  });

  it("uploads the current camera to the bound effect without a frame of view lag", async () => {
    const t = fixture();
    await t.handle.ready;
    t.handle.update({ ...running, augmentation: true, powerNorm: 1 });
    const setVector3 = vi.fn();
    vi.spyOn(t.material, "getEffect").mockReturnValue({ setVector3 } as ReturnType<ShaderMaterial["getEffect"]>);
    for (const position of [new Vector3(0, 0, 20), new Vector3(10, 4, -2)]) {
      t.camera.position.copyFrom(position);
      t.camera.computeWorldMatrix();
      t.material.onBindObservable.notifyObservers(t.material);
      const expected = Vector3.TransformCoordinates(position, t.handle.mesh.computeWorldMatrix(true).clone().invert());
      expected.z += 0.5;
      const [name, actual] = setVector3.mock.lastCall!;
      expect(name).toBe("cameraLocal");
      expect(Vector3.Distance(actual, expected)).toBeLessThan(1e-5);
    }
  });

  it.each(["handle", "attachment", "mesh"])("cancels async reveal and releases owned GPU resources on %s disposal", async owner => {
    let release!: () => void;
    let signal!: AbortSignal;
    const t = fixture({ whenReady: (_meshes, nextSignal) => {
      signal = nextSignal;
      return new Promise(resolve => { release = resolve; });
    } });
    const textureDisposed = vi.spyOn(t.texture, "dispose");
    const materialDisposed = vi.spyOn(t.material, "dispose");
    t.handle.update(running);
    await Promise.resolve();
    if (owner === "handle") t.handle.dispose();
    else if (owner === "attachment") t.attachment.dispose();
    else t.handle.mesh.dispose();
    await t.handle.ready;
    expect(signal.aborted).toBe(true);
    expect(t.handle.mesh.isDisposed()).toBe(true);
    expect(textureDisposed).toHaveBeenCalledTimes(1);
    expect(materialDisposed).toHaveBeenCalledTimes(1);
    release();
    await Promise.resolve();
    t.handle.update(running);
    t.handle.dispose();
    expect(t.requestRender).not.toHaveBeenCalled();
    expect(textureDisposed).toHaveBeenCalledTimes(1);
  });

  it("rejects preparation failures and shader failures without revealing partial content", async () => {
    const preparation = fixture({ whenReady: async () => { throw new Error("missing LUT"); } });
    preparation.handle.update(running);
    await expect(preparation.handle.ready).rejects.toThrow("missing LUT");
    expect(preparation.handle.mesh.isDisposed()).toBe(true);
    const shader = fixture({ whenReady: () => new Promise(() => {}) });
    shader.handle.update(running);
    shader.material.onError?.(null!, "incompatible shader");
    await expect(shader.handle.ready).rejects.toThrow("incompatible shader");
    expect(shader.handle.mesh.isDisposed()).toBe(true);
    expect(shader.requestRender).not.toHaveBeenCalled();
  });

  it("rejects invalid dimensions, bank bounds and nonuniform model scale rather than fabricate geometry", () => {
    expect(() => fixture({ lengthMeters: Number.NaN })).toThrow("finite positive");
    expect(() => fixture({ opticalProfile: { ...profile, afterburner: { firstRow: 3, rowCount: 2 } } })).toThrow("optical data");
    const t = fixture();
    t.handle.dispose();
    t.attachment.scaling.set(1, 2, 1);
    expect(() => createEngineExhaust(t.scene, {
      attachment: t.attachment, exitPosition: [0, 0, 0], direction: [0, 0, 1],
      closedRadiusMeters: 0.4, openRadiusMeters: 0.6, lengthMeters: 6,
      opticalProfile: profile, settings,
    })).toThrow("uniform unsheared");
  });
});
