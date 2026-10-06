import { FreeCamera, Mesh, NullEngine, RawTexture, Scene, ShaderLanguage, ShaderMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngineSmoke, type EngineSmokeFrame, type EngineSmokeOptions, type EngineSmokeSettings } from "./createEngineSmoke";
import type { EngineExhaustState } from "./createEngineExhaust";
import type { EngineSmokeProfile } from "./engineSmokeProfiles";

vi.mock("foss-earth/runtime", () => ({ whenMeshesReady: async () => {} }));
const settings: EngineSmokeSettings = { enabled: true, maxParticles: 8, emissionPerSecond: 4, lifetimeSeconds: 2, maxDistanceMeters: 1000, opacity: 0.025 };
const running: EngineExhaustState = { running: true, augmentation: false, powerNorm: 0.8, simulationTimeSeconds: 0 };
const profile: EngineSmokeProfile = { id: "test-aerosol", textureUrl: "x.png", provenanceUrl: "x.json", width: 4, height: 4,
  columns: 2, rows: 2, initialRadiusMeters: 0.1, finalRadiusMeters: 0.5, exitSpeedMetersPerSecond: 5, colorLinear: [0.3, 0.3, 0.3] };
const engines: NullEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); vi.restoreAllMocks(); });
const identity: EngineSmokeFrame = { m: new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) };

function fixture(overrides: Partial<EngineSmokeOptions> = {}, webGpu = false) {
  const engine = new NullEngine(); engines.push(engine);
  if (webGpu) Object.defineProperty(engine, "isWebGPU", { value: true });
  const scene = new Scene(engine); scene.useRightHandedSystem = true;
  const camera = new FreeCamera("camera", new Vector3(0, 0, 20), scene); scene.activeCamera = camera; camera.computeWorldMatrix();
  const attachment = new TransformNode("nozzle", scene);
  const requestRender = vi.fn();
  const texture = RawTexture.CreateRGBATexture(new Uint8Array(4 * 4 * 4).fill(255), 4, 4, scene, false, false);
  const bufferSpy = vi.spyOn(Mesh.prototype, "thinInstanceSetBuffer");
  const handle = createEngineSmoke(scene, { attachment, exitPosition: [0, 0, 0], direction: [0, 0, 1], profile, settings,
    getWorldFromEcef: () => identity, createTexture: () => texture, whenReady: async () => {}, requestRender, ...overrides });
  return { scene, camera, attachment, handle, requestRender, texture, bufferSpy, material: handle.mesh.material as ShaderMaterial };
}
const matrixData = (t: ReturnType<typeof fixture>) => t.bufferSpy.mock.calls.filter(call => call[0] === "matrix").at(-1)![1] as Float32Array;
const center = (t: ReturnType<typeof fixture>, index = 0) => {
  const m = matrixData(t);
  return new Vector3(m[index * 16 + 12], m[index * 16 + 13], m[index * 16 + 14]);
};

describe("bounded native-time aircraft smoke", () => {
  it("uses one static nonpickable quad batch, sparse births and explicit capacity", async () => {
    const t = fixture(); await t.handle.ready;
    expect(t.handle.mesh.isEnabled()).toBe(false);
    expect(t.handle.mesh.getTotalIndices()).toBe(6);
    expect(t.handle.mesh.isPickable).toBe(false);
    expect(t.handle.mesh.metadata.aircraftVisualOnly).toBe(true);
    expect(t.material.disableDepthWrite).toBe(true);
    expect(t.texture.gammaSpace).toBe(false);
    const geometry = t.handle.mesh.geometry;
    t.handle.update(running);
    t.handle.update({ ...running, simulationTimeSeconds: 0.25 });
    expect(t.handle.mesh.thinInstanceCount).toBe(1);
    expect(t.handle.mesh.isEnabled()).toBe(true);
    t.handle.update({ ...running, simulationTimeSeconds: 1 });
    expect(t.handle.mesh.thinInstanceCount).toBe(4);
    t.handle.update({ ...running, simulationTimeSeconds: 2 });
    expect(t.handle.mesh.thinInstanceCount).toBeLessThanOrEqual(8);
    expect(t.handle.mesh.geometry).toBe(geometry);
    expect(center(t, 0).z).toBeCloseTo(8.75);
    t.handle.dispose(); t.handle.dispose();
    expect(t.texture.isReady()).toBe(false);
  });

  it("holds emissions/ages exactly at a paused native clock and interpolates births along aircraft motion", async () => {
    const t = fixture(); await t.handle.ready;
    t.handle.update(running);
    t.attachment.position.x = 4;
    t.handle.update({ ...running, simulationTimeSeconds: 1 });
    expect(t.handle.mesh.thinInstanceCount).toBe(4);
    expect(center(t, 0).x).toBeCloseTo(1);
    expect(center(t, 3).x).toBeCloseTo(4);
    const before = [...matrixData(t)];
    t.requestRender.mockClear();
    t.handle.update({ ...running, simulationTimeSeconds: 1 });
    expect([...matrixData(t)]).toEqual(before);
    expect(t.requestRender).not.toHaveBeenCalled();
    t.handle.update({ ...running, running: false, simulationTimeSeconds: 1.5 });
    expect(t.handle.mesh.thinInstanceCount).toBe(4); // old aerosol dissipates, no new births
    t.handle.update({ ...running, running: false, simulationTimeSeconds: 3 });
    expect(t.handle.mesh.thinInstanceCount).toBe(0);
    expect(t.handle.mesh.isEnabled()).toBe(false);
  });

  it("reprojects retained Earth-radius ECEF history through changed translation and rotation without rounding births", async () => {
    const origin = [6378137.123456, 932412.125678, -1243111.456789];
    const frameAt = (yaw: number, offset: readonly number[]): EngineSmokeFrame => {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      return { m: new Float64Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0,
        -(c * offset[0] + s * offset[2]), -offset[1], s * offset[0] - c * offset[2], 1]) };
    };
    let frame = frameAt(0.35, origin);
    const t = fixture({ getWorldFromEcef: () => frame }); await t.handle.ready;
    t.attachment.position.set(0.031, 0.047, -0.019);
    t.handle.update(running); t.handle.update({ ...running, simulationTimeSeconds: 0.25 });
    expect(Vector3.Distance(center(t), t.attachment.position)).toBeLessThan(1e-6);
    const ecef = [origin[0] + Math.cos(0.35) * 0.031 - Math.sin(0.35) * -0.019,
      origin[1] + 0.047, origin[2] + Math.sin(0.35) * 0.031 + Math.cos(0.35) * -0.019];
    const movedOrigin = [origin[0] + 0.051, origin[1] - 0.023, origin[2] + 0.077];
    frame = frameAt(0.91, movedOrigin);
    const m = frame.m;
    const expected = new Vector3(m[0] * ecef[0] + m[8] * ecef[2] + m[12], ecef[1] + m[13], m[2] * ecef[0] + m[10] * ecef[2] + m[14]);
    t.handle.update({ ...running, simulationTimeSeconds: 0.25 });
    expect(Vector3.Distance(center(t), expected)).toBeLessThan(1e-6);
    expect(t.handle.mesh.thinInstanceCount).toBe(1);
  });

  it("resets relocation, backwards/large time jumps, missing frame and unavailable observations", async () => {
    let frame: EngineSmokeFrame | null = identity;
    const t = fixture({ getWorldFromEcef: () => frame }); await t.handle.ready;
    for (const clear of [() => t.handle.resetEpoch(), () => t.handle.update({ ...running, simulationTimeSeconds: -1 }),
      () => t.handle.update({ ...running, simulationTimeSeconds: 10 }), () => { frame = null; t.handle.update(running); },
      () => t.handle.update({ ...running, powerNorm: Number.NaN })]) {
      frame = identity; t.handle.resetEpoch(); t.handle.update(running); t.handle.update({ ...running, simulationTimeSeconds: 0.5 });
      expect(t.handle.mesh.isEnabled()).toBe(true); clear();
      expect(t.handle.mesh.isEnabled()).toBe(false);
      expect(t.handle.mesh.thinInstanceCount).toBe(0);
    }
  });

  it("caps memory/births at the explicit budget and clears hidden work for zero/distant/disabled settings", async () => {
    const t = fixture(); await t.handle.ready;
    const limited = { ...settings, maxParticles: 10000, emissionPerSecond: 10000, lifetimeSeconds: 10 };
    t.handle.update(running, limited); t.handle.update({ ...running, simulationTimeSeconds: 5 }, limited);
    expect(t.handle.mesh.thinInstanceCount).toBe(512);
    for (const change of [{ maxParticles: 0 }, { opacity: 0 }, { enabled: false }, { maxDistanceMeters: 1 }]) {
      t.handle.update(running, settings); t.handle.update({ ...running, simulationTimeSeconds: 0.5 }, settings);
      t.handle.update({ ...running, simulationTimeSeconds: 0.5 }, { ...settings, ...change });
      expect(t.handle.mesh.isEnabled()).toBe(false);
      expect(t.handle.mesh.thinInstanceCount).toBe(0);
    }
  });

  it.each([false, true])("selects GLSL/WGSL and current camera axes without a frame of lag (%s)", async webGpu => {
    const t = fixture({}, webGpu); await t.handle.ready;
    expect(t.material.shaderLanguage).toBe(webGpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL);
    expect(t.material.options.attributes).toEqual(["position", "uv", "ageOpacity"]);
    const setVector3 = vi.fn();
    vi.spyOn(t.material, "getEffect").mockReturnValue({ setVector3 } as ReturnType<ShaderMaterial["getEffect"]>);
    t.camera.rotation.y = 0.6; t.camera.computeWorldMatrix();
    t.material.onBindObservable.notifyObservers(t.material);
    expect(setVector3).toHaveBeenCalledWith("cameraRight", expect.any(Vector3));
    expect(setVector3).toHaveBeenCalledWith("cameraUp", expect.any(Vector3));
  });

  it("cancels hidden readiness and external attachment disposal without leaving GPU resources", async () => {
    let release!: () => void;
    const t = fixture({ whenReady: () => new Promise(resolve => { release = resolve; }) });
    await Promise.resolve(); t.attachment.dispose(); await t.handle.ready;
    release(); await Promise.resolve();
    expect(t.handle.mesh.isDisposed()).toBe(true);
    t.handle.update(running); t.handle.resetEpoch(); t.handle.dispose();
    expect(t.scene.meshes).toHaveLength(0);
  });
});
