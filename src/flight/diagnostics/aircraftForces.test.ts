import { describe, expect, it, vi } from "vitest";
import type { JSBSimSdk } from "@felipegalind0/jsbsim";
import {
  bodyForceToDisplay, createAircraftForceReader, POUND_FOOT_TO_NEWTON_METERS, POUND_FORCE_TO_NEWTONS,
  structuralPointToDisplay, windForceToBody, type ControlSurfaceTerms, type ForceVector,
} from "./aircraftForces";

const SURFACES: readonly ControlSurfaceTerms[] = [
  { id: "elevator", label: "Elevator", terms: { drag: "aero/coefficient/CDde", lift: "aero/coefficient/CLde", pitch: "aero/coefficient/Cmde" } },
  { id: "rudder", label: "Rudder", terms: { side: "aero/coefficient/CYdr", roll: "aero/coefficient/Cldr", yaw: "aero/coefficient/Cndr" } },
  { id: "ailerons", label: "Ailerons", terms: { roll: "aero/coefficient/Clda" } },
];

function fixture(controlSurfaces: readonly ControlSurfaceTerms[] = []) {
  const values = new Map<string, number>([
    ["simulation/sim-time-sec", 42], ["aero/alpha-rad", 0], ["aero/beta-rad", 0],
  ]);
  const triple = (names: readonly string[], vector: ForceVector) => names.forEach((path, index) => values.set(path, vector[index]));
  const force = (kind: string, vector: ForceVector) => triple(["x", "y", "z"].map(axis => `forces/fb${axis}-${kind}-lbs`), vector);
  triple(["inertia/cg-x-in", "inertia/cg-y-in", "inertia/cg-z-in"], [300, 2, -10]);
  triple(["aero/rp-body-x-ft", "aero/rp-body-y-ft", "aero/rp-body-z-ft"], [2, 3, -4]);
  force("aero-rp", [-100, 20, -1000]); force("aero-cg", [3, 4, 5]); force("aero", [-97, 24, -995]);
  force("prop", [2000, 0, -700]); force("weight", [0, 0, 1500]); force("total", [1903, 24, -1695]);
  triple(["moments/l-aero-lbsft", "moments/m-aero-lbsft", "moments/n-aero-lbsft"], [10, -2000, 30]);
  for (const [name, value] of [["CDde", 4], ["CLde", -60], ["Cmde", 900], ["CYdr", 25], ["Cldr", 7], ["Cndr", -150], ["Clda", -1200]] as const) {
    values.set(`aero/coefficient/${name}`, value);
  }
  for (const index of [0, 1]) {
    const base = `propulsion/engine[${index}]/`;
    triple(["x-position", "y-position", "z-position"].map(path => base + path), index === 0 ? [500, 2, -10] : [100, 22, 10]);
    triple(["x", "y", "z"].map(axis => base + `body-force-${axis}-lbs`), index === 0 ? [2000, 0, 0] : [0, 0, -700]);
  }
  const batch = { read: vi.fn(), dispose: vi.fn() };
  const createPropertyBatch = vi.fn((paths: readonly string[]) => {
    batch.read.mockImplementation((target: Float64Array) => {
      paths.forEach((path, index) => { target[index] = values.get(path) ?? Number.NaN; });
      return target;
    });
    return batch;
  });
  const queryPropertyCatalog = vi.fn(() => "propulsion/engine/thrust-lbs (R)\npropulsion/engine[0]/x-position (RW)\npropulsion/engine[1]/thrust-lbs (R)");
  const sdk = { createPropertyBatch, queryPropertyCatalog } as unknown as JSBSimSdk;
  const reader = createAircraftForceReader(sdk, { 0: "Main engine", 1: "Lift fan" }, controlSurfaces);
  return { values, force, triple, batch, createPropertyBatch, queryPropertyCatalog, reader };
}

describe("native aircraft force observations", () => {
  it("converts body and structural axes without changing magnitudes or inventing anchors", () => {
    expect(bodyForceToDisplay([1, 2, 3])).toEqual([-2, -3, 1]);
    expect(structuralPointToDisplay([500, 22, 10], [300, 2, -10])).toEqual([-0.508, 0.508, -5.08]);
    const transformed = windForceToBody([-100, 20, -1000], 0.4, -0.2);
    expect(Math.hypot(...transformed)).toBeCloseTo(Math.hypot(-100, 20, -1000), 10);
  });

  it("uses one noncreating batch, deduplicates engine0 aliases, and reads resolved acting points", () => {
    const t = fixture();
    try {
      const snapshot = t.reader.read();
      const paths = t.createPropertyBatch.mock.calls[0][0];
      expect(new Set(paths).size).toBe(paths.length);
      expect(t.createPropertyBatch).toHaveBeenCalledWith(paths, { create: false });
      expect(t.batch.read).toHaveBeenCalledOnce();
      expect(snapshot.simulationTimeSeconds).toBe(42);
      expect(snapshot.unavailable).toEqual([]);
      expect(snapshot.forces.filter(force => force.id.startsWith("engine-"))).toEqual([
        expect.objectContaining({ id: "engine-0", label: "Main engine", anchorMeters: [0, 0, -5.08], bodyNewtons: [2000 * POUND_FORCE_TO_NEWTONS, 0, 0] }),
        expect.objectContaining({ id: "engine-1", label: "Lift fan", anchorMeters: [-0.508, 0.508, 5.08], bodyNewtons: [0, 0, -700 * POUND_FORCE_TO_NEWTONS] }),
      ]);
      t.values.set("inertia/cg-x-in", 310);
      expect(t.reader.read().forces.find(force => force.id === "engine-0")!.anchorMeters[2]).toBeCloseTo(-4.826);
      expect(t.createPropertyBatch).toHaveBeenCalledOnce();
    } finally { t.reader.dispose(); }
    expect(t.batch.dispose).toHaveBeenCalledOnce();
  });

  it("separates native RP and CG aero forces and exactly reconstructs rotated RP components", () => {
    const t = fixture();
    try {
      t.values.set("aero/alpha-rad", 0.4); t.values.set("aero/beta-rad", -0.2);
      const wind: ForceVector = [-100, 20, -1000];
      const body = windForceToBody(wind, 0.4, -0.2);
      t.force("aero-rp", body);
      const snapshot = t.reader.read();
      const components = snapshot.forces.filter(force => /^aero-[012]$/.test(force.id));
      expect(components).toHaveLength(3);
      for (const force of components) expect(force.anchorMeters).toEqual([-0.9144000000000001, 1.2192, 0.6096]);
      for (let axis = 0; axis < 3; axis++) {
        expect(components.reduce((sum, force) => sum + force.bodyNewtons[axis], 0)).toBeCloseTo(body[axis] * POUND_FORCE_TO_NEWTONS, 9);
      }
      expect(snapshot.forces.find(force => force.id === "aero-cg")).toEqual(expect.objectContaining({
        anchorMeters: [0, 0, 0], bodyNewtons: [3, 4, 5].map(value => value * POUND_FORCE_TO_NEWTONS),
      }));
    } finally { t.reader.dispose(); }
  });

  it("keeps raw native totals and sums same-frame applied forces plus gravity for net", () => {
    const t = fixture();
    try {
      const snapshot = t.reader.read();
      expect(snapshot.nativeAppliedBodyPounds).toEqual([1903, 24, -1695]);
      expect(snapshot.nativeWeightBodyPounds).toEqual([0, 0, 1500]);
      expect(snapshot.forces.find(force => force.id === "applied")!.label).toContain("excludes gravity");
      expect(snapshot.forces.find(force => force.id === "net")!.bodyNewtons).toEqual([1903, 24, -195].map(value => value * POUND_FORCE_TO_NEWTONS));
      t.force("weight", [1, 2, 3]); t.reader.read();
      expect(snapshot.nativeWeightBodyPounds).toEqual([0, 0, 1500]); // Owned snapshot does not alias batch memory.
    } finally { t.reader.dispose(); }
  });

  it("marks unavailable resolved observations and uses explicitly labeled aggregate display anchors", () => {
    const t = fixture();
    try {
      t.values.delete("aero/rp-body-x-ft");
      t.values.set("propulsion/engine[1]/body-force-z-lbs", Number.NaN);
      const snapshot = t.reader.read();
      expect(snapshot.unavailable).toContain("Resolved aerodynamic components");
      expect(snapshot.unavailable).toContain("Lift fan");
      expect(snapshot.forces.map(force => force.id)).not.toContain("engine-1");
      expect(snapshot.forces.find(force => force.id === "aero-total")!.label).toContain("CG display anchor");
      expect(snapshot.forces.find(force => force.id === "propulsion")!.label).toContain("CG display anchor");
      t.values.delete("forces/fbz-weight-lbs");
      expect(t.reader.read().forces.map(force => force.id)).not.toContain("net");
      expect(t.reader.read().unavailable).toContain("Net force (with gravity)");
    } finally { t.reader.dispose(); }
  });

  it("reads the native aerodynamic moment about CG in N·m", () => {
    const t = fixture();
    try {
      expect(t.reader.read().moments).toEqual([expect.objectContaining({ id: "aero-moment", anchorMeters: [0, 0, 0],
        bodyNewtonMeters: [10, -2000, 30].map(value => value * POUND_FOOT_TO_NEWTON_METERS) })]);
      t.values.delete("moments/m-aero-lbsft");
      expect(t.reader.read().moments).toEqual([]);
      expect(t.reader.read().unavailable).toContain("Aero moment about CG");
    } finally { t.reader.dispose(); }
  });

  it("draws each surface's own terms at the reference point: wind-frame forces into body axes, body moments as they are", () => {
    const t = fixture(SURFACES);
    try {
      t.values.set("aero/alpha-rad", 0.3); t.values.set("aero/beta-rad", 0.1);
      const snapshot = t.reader.read();
      expect(snapshot.unavailable).toEqual([]);
      const rp = snapshot.forces.find(force => force.id === "aero-0")!.anchorMeters;
      // JSBSim reports drag aft and lift up; its wind axes point forward and down.
      expect(snapshot.forces.find(force => force.id === "surface-elevator")).toEqual({
        id: "surface-elevator", label: "Elevator", color: expect.any(String), anchorMeters: rp,
        bodyNewtons: windForceToBody([-4, 0, 60], 0.3, 0.1).map(value => value * POUND_FORCE_TO_NEWTONS),
      });
      expect(snapshot.moments.find(moment => moment.id === "surface-elevator-moment")).toEqual(expect.objectContaining({
        anchorMeters: rp, bodyNewtonMeters: [0, 900, 0].map(value => value * POUND_FOOT_TO_NEWTON_METERS) }));
      expect(snapshot.forces.find(force => force.id === "surface-rudder")!.bodyNewtons).toEqual(
        windForceToBody([-0, 25, -0], 0.3, 0.1).map(value => value * POUND_FORCE_TO_NEWTONS));
      expect(snapshot.moments.find(moment => moment.id === "surface-rudder-moment")!.bodyNewtonMeters).toEqual(
        [7, 0, -150].map(value => value * POUND_FOOT_TO_NEWTON_METERS));
      // A surface the model gives only a moment has no force to draw.
      expect(snapshot.forces.map(force => force.id)).not.toContain("surface-ailerons");
      expect(snapshot.moments.find(moment => moment.id === "surface-ailerons-moment")!.bodyNewtonMeters[0]).toBeCloseTo(-1200 * POUND_FOOT_TO_NEWTON_METERS, 9);
      expect(new Set([...snapshot.forces, ...snapshot.moments].filter(item => item.id.startsWith("surface-elevator")).map(item => item.color)).size).toBe(1);
      expect(t.createPropertyBatch).toHaveBeenCalledOnce();
    } finally { t.reader.dispose(); }
  });

  it("skips a surface whose term or reference point is unavailable rather than drawing part of it", () => {
    const t = fixture(SURFACES);
    try {
      t.values.delete("aero/coefficient/Cndr");
      let snapshot = t.reader.read();
      expect(snapshot.unavailable).toEqual(["Rudder"]);
      expect([...snapshot.forces, ...snapshot.moments].map(item => item.id).filter(id => id.includes("rudder"))).toEqual([]);
      t.values.delete("aero/rp-body-z-ft");
      snapshot = t.reader.read();
      expect(snapshot.unavailable).toEqual(expect.arrayContaining(["Elevator", "Rudder", "Ailerons"]));
      expect([...snapshot.forces, ...snapshot.moments].map(item => item.id).filter(id => id.startsWith("surface-"))).toEqual([]);
    } finally { t.reader.dispose(); }
  });

  it("disposes the native observer once and rejects subsequent reads", () => {
    const t = fixture();
    t.reader.dispose(); t.reader.dispose();
    expect(t.batch.dispose).toHaveBeenCalledOnce();
    expect(() => t.reader.read()).toThrow(/disposed/);
  });
});
