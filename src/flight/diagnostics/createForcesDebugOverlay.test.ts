import { NullEngine, Scene, TransformNode } from "@babylonjs/core";
import type { JSBSimSdk } from "@felipegalind0/jsbsim";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POUND_FOOT_TO_NEWTON_METERS } from "./aircraftForces";
import { createForcesDebugOverlay } from "./createForcesDebugOverlay";

const engines: NullEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); });
const settings = {
  enabled: false, newtonsPerMeter: 1000, maxArrowMeters: 20, labels: false, labelRefreshHz: 5,
  controlSurfaces: true, newtonMetersPerDegree: 100, arcRadiusMeters: 3, maxArcDegrees: 300,
};
const ELEVATOR = { id: "elevator", label: "Elevator", terms: { lift: "aero/coefficient/CLde", pitch: "aero/coefficient/Cmde" } };

function fixture() {
  const engine = new NullEngine(); engines.push(engine);
  const scene = new Scene(engine), aircraft = new TransformNode("aircraft", scene);
  const values = new Map<string, number>([["simulation/sim-time-sec", 1]]);
  for (const path of ["inertia/cg-x-in", "inertia/cg-y-in", "inertia/cg-z-in", "aero/alpha-rad", "aero/beta-rad"]) values.set(path, 0);
  for (const kind of ["aero-rp", "aero-cg", "aero", "prop", "weight", "total"]) {
    for (const axis of ["x", "y", "z"]) values.set(`forces/fb${axis}-${kind}-lbs`, 0);
  }
  for (const axis of ["x", "y", "z"]) {
    values.set(`aero/rp-body-${axis}-ft`, axis === "x" ? 1 : 0);
    values.set(`propulsion/engine[0]/body-force-${axis}-lbs`, axis === "x" ? 1000 : 0);
    values.set(`propulsion/engine[0]/${axis}-position`, axis === "x" ? 100 : 0);
  }
  for (const axis of ["l", "m", "n"]) values.set(`moments/${axis}-aero-lbsft`, axis === "m" ? -500 : 0);
  values.set("aero/coefficient/CLde", -40); values.set("aero/coefficient/Cmde", 2000);
  const batches: { read: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[] = [];
  const createPropertyBatch = vi.fn((paths: readonly string[]) => {
    const batch = { read: vi.fn((target: Float64Array) => {
      paths.forEach((path, index) => { target[index] = values.get(path) ?? Number.NaN; }); return target;
    }), dispose: vi.fn() };
    batches.push(batch); return batch;
  });
  const queryPropertyCatalog = vi.fn(() => "propulsion/engine/thrust-lbs (R)");
  const sdk = { createPropertyBatch, queryPropertyCatalog } as unknown as JSBSimSdk;
  const requestRender = vi.fn(), onUnavailable = vi.fn();
  const overlay = createForcesDebugOverlay(scene, aircraft, sdk, {
    settings, engineLabels: { 0: "Main engine" }, controlSurfaces: [ELEVATOR], requestRender, onUnavailable, whenReady: async () => {},
  });
  return { scene, values, batches, createPropertyBatch, queryPropertyCatalog, requestRender, onUnavailable, overlay };
}

describe("flight forces overlay lifecycle", () => {
  it("does no native work while disabled, releases resources, and reacquires a fresh observer on enable", async () => {
    const t = fixture();
    t.overlay.update();
    expect(t.createPropertyBatch).not.toHaveBeenCalled(); expect(t.queryPropertyCatalog).not.toHaveBeenCalled();
    expect(t.scene.meshes).toHaveLength(0);
    t.overlay.setSettings({ ...settings, enabled: true }); await t.overlay.ready;
    expect(t.createPropertyBatch).toHaveBeenCalledOnce(); expect(t.batches[0].read).toHaveBeenCalledOnce();
    expect(t.overlay.getSnapshot()!.forces.find(force => force.id === "engine-0")!.label).toBe("Main engine");
    const glyph = t.scene.getTransformNodeByName("vector-debug/engine-0")!;
    expect(glyph.position.asArray()).toEqual([0, 0, -2.54]);
    expect(glyph.metadata.debugVector.vector).toEqual([-0, -0, 4448.2216152605]);
    t.overlay.setSettings(settings); t.overlay.update();
    expect(t.batches[0].dispose).toHaveBeenCalledOnce(); expect(t.batches[0].read).toHaveBeenCalledOnce();
    expect(t.scene.meshes).toHaveLength(0); expect(t.overlay.getSnapshot()).toBeNull();
    t.overlay.setSettings({ ...settings, enabled: true }); await t.overlay.ready;
    expect(t.createPropertyBatch).toHaveBeenCalledTimes(2);
    t.overlay.dispose(); t.overlay.dispose(); t.overlay.update();
    expect(t.batches[1].dispose).toHaveBeenCalledOnce(); expect(t.scene.meshes).toHaveLength(0);
  });

  it("draws control-surface forces as arrows and moments as arcs, and stops reading surfaces turned off", async () => {
    const t = fixture();
    t.overlay.setSettings({ ...settings, enabled: true }); await t.overlay.ready;
    expect(t.onUnavailable).not.toHaveBeenCalled();
    const node = (id: string) => t.scene.getTransformNodeByName(`vector-debug/${id}`)!;
    // The reference point 1 ft ahead of CG, in display left/up/forward metres.
    const rp = [-0, -0, 0.3048];
    expect(node("surface-elevator").metadata.debugVector).toMatchObject({ label: "Elevator", anchor: rp });
    expect(node("surface-elevator").metadata.debugVector.shape).toBeUndefined();
    // Native pitch moment about body Y (starboard) turns about display left.
    expect(node("surface-elevator-moment").metadata.debugVector).toMatchObject({
      shape: "arc", anchor: rp, vector: [-2000 * POUND_FOOT_TO_NEWTON_METERS, -0, 0], capped: false });
    expect(node("surface-elevator-moment").metadata.debugVector.sweepDegrees).toBeCloseTo(2000 * POUND_FOOT_TO_NEWTON_METERS / 100, 9);
    expect(node("aero-moment").metadata.debugVector).toMatchObject({ shape: "arc", anchor: [0, 0, 0] });
    expect(t.createPropertyBatch.mock.calls[0][0]).toContain("aero/coefficient/Cmde");
    t.overlay.setSettings({ ...settings, enabled: true, controlSurfaces: false });
    expect(t.batches[0].dispose).toHaveBeenCalledOnce();
    expect(t.createPropertyBatch.mock.calls[1][0]).not.toContain("aero/coefficient/Cmde");
    expect(node("surface-elevator-moment").isEnabled()).toBe(false);
    expect(node("aero-moment").isEnabled()).toBe(true);
    t.overlay.dispose();
  });

  it("holds paused state and suppresses extra render requests within scheduled simulation frames", async () => {
    const t = fixture();
    t.overlay.setSettings({ ...settings, enabled: true }); await t.overlay.ready;
    t.requestRender.mockClear();
    t.overlay.update(); t.overlay.update(); expect(t.requestRender).not.toHaveBeenCalled();
    t.values.set("propulsion/engine[0]/body-force-x-lbs", 2000);
    t.overlay.update(true); expect(t.requestRender).not.toHaveBeenCalled();
    t.overlay.setSettings({ ...settings, enabled: true, newtonsPerMeter: 2000 });
    expect(t.requestRender).toHaveBeenCalledOnce();
    t.overlay.dispose();
  });

  it("warns once about absent native components and never guesses their vector", async () => {
    const t = fixture();
    t.values.delete("propulsion/engine[0]/body-force-z-lbs");
    t.overlay.setSettings({ ...settings, enabled: true }); await t.overlay.ready;
    t.overlay.update();
    expect(t.onUnavailable).toHaveBeenCalledOnce();
    expect(t.onUnavailable).toHaveBeenCalledWith(expect.stringContaining("Main engine"));
    expect(t.overlay.getSnapshot()!.forces.map(force => force.id)).not.toContain("engine-0");
    expect(t.overlay.getSnapshot()!.forces.find(force => force.id === "propulsion")!.label).toContain("CG display anchor");
    t.overlay.dispose();
  });
});
