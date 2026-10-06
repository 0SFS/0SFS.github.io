import { DepthRenderer, FreeCamera, MeshBuilder, MultiMaterial, NullEngine, Scene, StandardMaterial, SubMesh, Vector3 } from "@babylonjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngineExhaustDepth } from "./engineExhaustDepth";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function fixture() {
  vi.useFakeTimers();
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const plume = MeshBuilder.CreateBox("plume", {}, scene);
  const hardware = MeshBuilder.CreateBox("opaque-hardware", {}, scene);
  const material = new StandardMaterial("opaque-metal", scene);
  hardware.material = material;
  const requestRender = vi.fn();
  const depth = createEngineExhaustDepth(scene, plume, requestRender);
  cleanups.push(() => { depth.dispose(); engine.dispose(); });
  const mainPass = engine.createRenderPassId("main-pass-for-readiness-check");
  engine.currentRenderPassId = mainPass;
  // NullEngine also schedules texture/effect work. Observe only this helper's
  // 50 ms readiness polling rather than counting unrelated Babylon timers.
  const schedules = vi.spyOn(globalThis, "setTimeout");
  const pollSchedules = () => schedules.mock.calls.filter(([, delay]) => delay === 50);
  return { engine, scene, hardware, material, requestRender, depth, mainPass, pollSchedules };
}

describe("engine exhaust opaque-depth readiness", () => {
  it("restricts depth draws and compilation to possible screen-space occluders while retaining foreground and camera-crossing geometry", () => {
    const t = fixture();
    const camera = new FreeCamera("camera", new Vector3(0, 0, -10), t.scene);
    camera.setTarget(Vector3.Zero()); t.scene.activeCamera = camera;
    const outside = MeshBuilder.CreateBox("outside-plume-rays", {}, t.scene);
    outside.position.x = 100; outside.material = t.material;
    const foreground = MeshBuilder.CreateBox("foreground", {}, t.scene);
    foreground.position.z = -5; foreground.material = t.material;
    const crossing = MeshBuilder.CreateBox("camera-crossing", {}, t.scene);
    crossing.position.set(100, 0, -10); crossing.material = t.material;
    const background = MeshBuilder.CreateBox("behind-whole-plume", {}, t.scene);
    background.position.z = 100; background.material = t.material;
    const checked = vi.spyOn(DepthRenderer.prototype, "isReady").mockReturnValue(true);
    t.depth.setActive(true, 1);
    expect(t.depth.texture.renderList?.map(mesh => mesh.name)).toEqual([t.hardware.name, foreground.name, crossing.name]);
    expect(checked.mock.calls.map(([sub]) => sub.getMesh())).not.toContain(outside);
    expect(t.depth.ready).toBe(true);

    // Moving scenery/camera changes the conservative candidate set immediately.
    outside.position.x = 0;
    t.scene.onBeforeRenderObservable.notifyObservers(t.scene);
    expect(t.depth.texture.renderList).toContain(outside);
    outside.setEnabled(false);
    t.scene.onBeforeRenderObservable.notifyObservers(t.scene);
    expect(t.depth.texture.renderList).not.toContain(outside);
  });

  it("checks the depth pass and restores the main pass during activation, polling and a frame", () => {
    const t = fixture();
    const checkedPasses: number[] = [];
    let compiled = false;
    const isReady = vi.spyOn(DepthRenderer.prototype, "isReady").mockImplementation(() => {
      checkedPasses.push(t.engine.currentRenderPassId);
      return compiled;
    });

    expect(t.depth.texture.renderPassId).not.toBe(t.mainPass);
    t.depth.setActive(true, 1);
    expect(t.depth.ready).toBe(false);
    expect(t.engine.currentRenderPassId).toBe(t.mainPass);
    expect(t.pollSchedules()).toHaveLength(1);

    compiled = true;
    vi.advanceTimersByTime(50);
    expect(t.depth.ready).toBe(true);
    expect(t.requestRender).toHaveBeenCalledOnce();
    expect(t.engine.currentRenderPassId).toBe(t.mainPass);
    expect(t.pollSchedules()).toHaveLength(1);
    vi.advanceTimersByTime(100);
    expect(isReady).toHaveBeenCalledTimes(2);
    expect(t.requestRender).toHaveBeenCalledOnce();

    t.scene.onBeforeRenderObservable.notifyObservers(t.scene);
    expect(isReady).toHaveBeenCalledTimes(3);
    expect(checkedPasses).toEqual(Array(3).fill(t.depth.texture.renderPassId));
    expect(t.engine.currentRenderPassId).toBe(t.mainPass);
  });

  it("restores the caller's render pass even when readiness throws", () => {
    const t = fixture();
    const failure = new Error("depth compilation failed");
    const isReady = vi.spyOn(DepthRenderer.prototype, "isReady").mockImplementation(() => {
      expect(t.engine.currentRenderPassId).toBe(t.depth.texture.renderPassId);
      throw failure;
    });

    expect(() => t.depth.setActive(true, 1)).toThrow(failure);
    expect(t.engine.currentRenderPassId).toBe(t.mainPass);
    expect(t.requestRender).not.toHaveBeenCalled();
    t.depth.dispose();
    expect(t.scene.customRenderTargets).toHaveLength(0);
    expect(t.pollSchedules()).toHaveLength(0);
    vi.advanceTimersByTime(100);
    expect(isReady).toHaveBeenCalledOnce();
  });

  it("ignores skipped MultiMaterial submeshes and waits only for the actual opaque submaterial", () => {
    const t = fixture();
    const disabled = new StandardMaterial("no-depth-write", t.scene);
    disabled.disableDepthWrite = true;
    const blended = new StandardMaterial("transparent", t.scene);
    blended.alpha = 0.5;
    const materials = new MultiMaterial("mixed-hardware", t.scene);
    materials.subMaterials = [null, disabled, blended, t.material, t.material];
    t.hardware.material = materials;
    t.hardware.releaseSubMeshes();
    const vertices = t.hardware.getTotalVertices();
    new SubMesh(0, 0, vertices, 0, 6, t.hardware);
    new SubMesh(1, 0, vertices, 6, 6, t.hardware);
    new SubMesh(2, 0, vertices, 12, 6, t.hardware);
    new SubMesh(3, 0, 0, 18, 0, t.hardware);
    const isReady = vi.spyOn(DepthRenderer.prototype, "isReady").mockReturnValue(false);

    t.depth.setActive(true, 1);
    expect(isReady).not.toHaveBeenCalled();
    expect(t.depth.ready).toBe(true);
    expect(t.pollSchedules()).toHaveLength(0);

    // Parent flags must not replace the submaterial's actual depth eligibility.
    materials.disableDepthWrite = true;
    materials.alpha = 0.5;
    const opaque = new SubMesh(4, 0, vertices, 24, 6, t.hardware);
    t.scene.onBeforeRenderObservable.notifyObservers(t.scene);
    expect(isReady).toHaveBeenCalledExactlyOnceWith(opaque, false);
    expect(opaque.getMaterial()).toBe(t.material);
    expect(t.depth.ready).toBe(false);
    expect(t.pollSchedules()).toHaveLength(1);

    isReady.mockImplementation(sub => {
      expect(sub).toBe(opaque);
      expect(sub.getMaterial()).toBe(t.material);
      return true;
    });
    vi.advanceTimersByTime(50);
    expect(t.depth.ready).toBe(true);
    expect(isReady).toHaveBeenCalledTimes(2);
    expect(t.pollSchedules()).toHaveLength(1);
    vi.advanceTimersByTime(100);
    expect(isReady).toHaveBeenCalledTimes(2);
    expect(t.requestRender).toHaveBeenCalledOnce();
    expect(t.engine.currentRenderPassId).toBe(t.mainPass);
  });
});
