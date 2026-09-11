import { describe, expect, it } from "vitest";
import {
  createCoupledWheelState, createWheelForceResult, kineticEnergy, MAX_COUPLED_ITERATIONS, solveCoupledRigidWheels,
  type CoupledWheelParams, type RigidBodyVelocityState,
} from "./coupledRigidWheels";
import { probeWheelContactCapability, wheelContactProblem, type NativeWheelContactBridge, type Vec3, type WheelContact } from "./wheelContact";

// Reference harness only: prescribed normal loads, no gravity/aero/JSBSim.
const NAMES = ["NOSE", "LEFT_MAIN", "RIGHT_MAIN"] as const;
const DT = 1 / 120;
const MASS = 1_000;
const INERTIA = [1_300, 1_800, 2_600];
const AXLES: Vec3[] = [{ x: 1.2, y: 0, z: -0.9 }, { x: -0.4, y: 1.0, z: -0.9 }, { x: -0.4, y: -1.0, z: -0.9 }];
const RADII = [0.18, 0.22, 0.22];
const LOADS = [1_400, 4_200, 4_200];
const PARAMS: CoupledWheelParams[] = [
  { inertiaKgM2: 0.052, frictionCoefficient: 0.7, maxBrakeTorqueNm: 0, bearingDragTorqueNm: 0 },
  { inertiaKgM2: 0.124, frictionCoefficient: 0.7, maxBrakeTorqueNm: 1_200, bearingDragTorqueNm: 0 },
  { inertiaKgM2: 0.124, frictionCoefficient: 0.7, maxBrakeTorqueNm: 1_200, bearingDragTorqueNm: 0 },
];

/**
 * `attitudeHeld` emulates the unmodeled normal contacts that stop braking below
 * the CG from pitching a free body; the default free body exercises coupling.
 */
function world(speed: number, spin = (index: number) => speed / RADII[index], attitudeHeld = false) {
  const inertia = INERTIA.map(value => attitudeHeld ? value * 1e6 : value);
  const body: RigidBodyVelocityState = {
    massKg: MASS, inverseInertiaWorld: [1 / inertia[0], 0, 0, 0, 1 / inertia[1], 0, 0, 0, 1 / inertia[2]],
    velocity: { x: speed, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 },
  };
  const wheels = NAMES.map((_, index) => ({ ...createCoupledWheelState(), spinRadSec: spin(index) }));
  const results = NAMES.map(() => createWheelForceResult());
  return { body, wheels, results };
}

function contact(index: number, epoch = 1, load = LOADS[index]): WheelContact {
  return {
    wheel: NAMES[index], axleOffsetM: { ...AXLES[index] },
    normalWorld: { x: 0, y: 0, z: 1 }, forwardWorld: { x: 1, y: 0, z: 0 }, lateralWorld: { x: 0, y: 1, z: 0 },
    wheelCenterVelocityMps: { x: 0, y: 0, z: 0 }, groundVelocityMps: { x: 0, y: 0, z: 0 },
    normalLoadN: load, compressionM: 0.04, steeringRad: 0, radiusM: RADII[index], groundRevision: 0, contactEpoch: epoch,
  };
}

const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });

/** Angular momentum about the instantaneous CG: airframe I w plus absolute wheel spin about a = n × t = +y. */
function angularMomentum(state: ReturnType<typeof world>): Vec3 {
  const w = state.body.angularVelocity;
  const inverse = state.body.inverseInertiaWorld;
  let L = { x: w.x / inverse[0], y: w.y / inverse[4], z: w.z / inverse[8] };
  state.wheels.forEach((wheel, index) => { L = add(L, { x: 0, y: PARAMS[index].inertiaKgM2 * wheel.spinRadSec, z: 0 }); });
  return L;
}

function step(state: ReturnType<typeof world>, contacts: WheelContact[], brakes = [0, 0, 0], options = {}) {
  const momentumBefore = scale(state.body.velocity, MASS);
  const angularBefore = angularMomentum(state);
  const report = solveCoupledRigidWheels(state.body, NAMES, state.wheels, PARAMS, contacts, brakes, DT, state.results, options);
  // Linear: Σ ground impulses. Angular about CG: Σ r_contact × J (contact = axle − R n).
  let external = { x: 0, y: 0, z: 0 };
  let torque = { x: 0, y: 0, z: 0 };
  contacts.forEach(active => {
    const index = NAMES.indexOf(active.wheel);
    const J = state.results[index].bodyImpulseNs;
    external = add(external, J);
    torque = add(torque, cross(add(active.axleOffsetM, scale(active.normalWorld, -active.radiusM)), J));
  });
  const momentumAfter = scale(state.body.velocity, MASS);
  for (const axis of ["x", "y", "z"] as const) {
    expect(momentumAfter[axis] - momentumBefore[axis]).toBeCloseTo(external[axis], 6);
    expect(angularMomentum(state)[axis] - angularBefore[axis]).toBeCloseTo(torque[axis], 6);
  }
  expect(report.kineticEnergyAfterJ).toBeLessThanOrEqual(report.kineticEnergyBeforeJ * (1 + 1e-12) + 1e-9);
  const dissipated = state.results.reduce((sum, result) => sum + result.dissipatedJ, 0);
  expect(dissipated).toBeCloseTo(report.kineticEnergyBeforeJ - report.kineticEnergyAfterJ, 4);
  return report;
}

describe("coupled rigid wheel reference solver", () => {
  it("leaves free rolling untouched", () => {
    const state = world(30);
    const energy = kineticEnergy(state.body, state.wheels, PARAMS);
    for (let index = 0; index < 120; index++) step(state, [0, 1, 2].map(wheel => contact(wheel)));
    expect(state.body.velocity.x).toBeCloseTo(30, 10);
    expect(kineticEnergy(state.body, state.wheels, PARAMS)).toBeCloseTo(energy, 6);
  });

  it("spins wheels up at touchdown from airframe momentum without overshooting slip", () => {
    const state = world(30, () => 0);
    const mainSlip: number[] = [];
    for (let index = 0; index < 60; index++) {
      step(state, [1, 2].map(wheel => contact(wheel)));
      mainSlip.push(state.results[1].longitudinalSlipMps);
    }
    expect(mainSlip[0]).toBeGreaterThan(0);
    expect(mainSlip.every(slip => slip >= -1e-9)).toBe(true);
    expect(Math.abs(mainSlip.at(-1)!)).toBeLessThan(1e-6);
    // Tread speed matches the axle's ground speed: t·(v + w × r_axle).
    const w = state.body.angularVelocity;
    expect(state.wheels[1].spinRadSec * RADII[1]).toBeCloseTo(state.body.velocity.x + w.y * -0.9 - w.z * 1.0, 6);
    // Spin-up drag comes out of the aircraft, not from nowhere.
    expect(state.body.velocity.x).toBeLessThan(30);
    expect(state.body.velocity.x).toBeGreaterThan(29.8);
    expect(state.body.angularVelocity.y).not.toBe(0); // pitching moment from drag below the CG
  });

  it("locks braked wheels without exceeding the Coulomb limit or pushing the aircraft forward", () => {
    const state = world(20, undefined, true);
    let previous = state.body.velocity.x;
    for (let index = 0; index < 240; index++) {
      step(state, [0, 1, 2].map(wheel => contact(wheel)), [0, 1, 1]);
      const deceleration = (previous - state.body.velocity.x) / DT;
      expect(deceleration).toBeGreaterThanOrEqual(-1e-9);
      expect(deceleration).toBeLessThanOrEqual(0.7 * (LOADS[1] + LOADS[2] + LOADS[0]) / MASS + 1e-6);
      previous = state.body.velocity.x;
    }
    // Locked: the tread slides at the aircraft's speed and friction owns the deceleration.
    expect(state.results[1].longitudinalSlipMps).toBeCloseTo(state.body.velocity.x, 3);
    expect(state.body.velocity.x).toBeLessThan(20 - 0.9 * 0.7 * 9_800 / MASS * 2 * 0.95);
  });

  it("yaws toward a single dragging main wheel with exact angular momentum accounting", () => {
    const state = world(30, () => 0);
    for (let index = 0; index < 12; index++) step(state, [contact(1)]);
    expect(state.body.angularVelocity.z).toBeGreaterThan(0);
    expect(Number.isFinite(state.body.angularVelocity.x)).toBe(true);
  });

  it("never gains energy through repeated bounces and clears warm starts on each contact epoch", () => {
    const state = world(25, () => 0);
    let epoch = 0;
    let energy = kineticEnergy(state.body, state.wheels, PARAMS);
    for (let index = 0; index < 2_000; index++) {
      const inContact = Math.floor(index / 5) % 2 === 0;
      if (inContact && index % 5 === 0) epoch += 1;
      const load = inContact ? 2_000 + 6_000 * Math.abs(Math.sin(index)) : 0;
      step(state, inContact ? [1, 2].map(wheel => contact(wheel, epoch, load)) : [], [0, index % 7 === 0 ? 1 : 0, 0]);
      if (!inContact) expect(state.wheels[1].warmTangentNs).toBe(0);
      const next = kineticEnergy(state.body, state.wheels, PARAMS);
      expect(next).toBeLessThanOrEqual(energy * (1 + 1e-12) + 1e-9);
      energy = next;
    }
  });

  it("handles reverse taxi symmetrically", () => {
    const state = world(-5, () => 0);
    for (let index = 0; index < 60; index++) step(state, [0, 1, 2].map(wheel => contact(wheel)));
    expect(state.wheels[1].spinRadSec).toBeLessThan(0);
    expect(state.body.velocity.x).toBeGreaterThan(-5);
    expect(state.body.velocity.x).toBeLessThan(0);
  });

  it("bounds a high-speed hard impact and rejects non-finite packets without applying impulses", () => {
    const state = world(80, () => 0);
    const report = step(state, [contact(1, 1, 200_000)]);
    expect(Math.abs(state.results[1].bodyImpulseNs.x)).toBeLessThanOrEqual(0.7 * 200_000 * DT + 1e-9);
    expect(Object.values(state.body.velocity).every(Number.isFinite)).toBe(true);
    expect(report.rejectedContacts).toBe(0);
    const bad = { ...contact(2), normalWorld: { x: NaN, y: 0, z: 1 } };
    const clean = world(30, () => 0);
    const rejected = solveCoupledRigidWheels(clean.body, NAMES, clean.wheels, PARAMS, [bad], [0, 0, 0], DT, clean.results);
    expect(rejected.rejectedContacts).toBe(1);
    expect(clean.body.velocity.x).toBe(30);
    expect(clean.results[2].bodyImpulseNs.x).toBe(0);
  });

  it("cannot launch the aircraft: a spinning wheel transfers at most its stored energy", () => {
    const state = world(0, index => index === 1 ? 400 : 0);
    const stored = 0.5 * PARAMS[1].inertiaKgM2 * 400 ** 2;
    for (let index = 0; index < 240; index++) step(state, [contact(1)]);
    expect(state.body.velocity.x).toBeGreaterThan(0);
    expect(0.5 * MASS * state.body.velocity.x ** 2).toBeLessThanOrEqual(stored);
  });

  it("discards an energy-adding warm start and solves cold", () => {
    const state = world(10);
    // Stale pushes from a different contact state, same epoch, too few iterations to undo them.
    state.wheels.forEach(wheel => { wheel.contactEpoch = 1; wheel.warmTangentNs = 24; });
    const report = step(state, [0, 1, 2].map(wheel => contact(wheel)), [0, 0, 0], { iterations: 1 });
    expect(report.coldRetry).toBe(true);
    expect(report.kineticEnergyAfterJ).toBeLessThanOrEqual(report.kineticEnergyBeforeJ);
  });

  it("clamps the timestep and iteration count and replays deterministically", () => {
    const run = () => {
      const state = world(30, () => 0);
      const report = solveCoupledRigidWheels(state.body, NAMES, state.wheels, PARAMS,
        [0, 1, 2].map(wheel => contact(wheel)), [0, 0.5, 0.5], 1, state.results, { iterations: 1_000 });
      return { report, velocity: { ...state.body.velocity }, spins: state.wheels.map(wheel => wheel.spinRadSec) };
    };
    const first = run();
    expect(first.report.iterations).toBe(MAX_COUPLED_ITERATIONS);
    expect(run()).toEqual(first);
    const zero = world(30, () => 0);
    solveCoupledRigidWheels(zero.body, NAMES, zero.wheels, PARAMS, [contact(1)], [0, 0, 0], NaN, zero.results);
    expect(zero.body.velocity.x).toBe(30);
  });
});

describe("native contact capability", () => {
  const bridge = (overrides: Partial<NativeWheelContactBridge> = {}) => ({
    contractVersion: 1, exclusiveLongitudinalFriction: true, readContacts: () => 0, applyAcceptedImpulses: () => true, ...overrides,
  });

  it("reports the installed SDK as unavailable and refuses bridges that leave JSBSim friction active", () => {
    expect(probeWheelContactCapability({ getPropertyValue: () => 0 })).toMatchObject({ available: false,
      reason: expect.stringMatching(/no per-wheel contact packet/) });
    expect(probeWheelContactCapability({ wheelContactBridge: bridge({ exclusiveLongitudinalFriction: false }) }))
      .toMatchObject({ available: false, reason: expect.stringMatching(/double-count/) });
    expect(probeWheelContactCapability({ wheelContactBridge: bridge({ contractVersion: 2 as 1 }) })).toMatchObject({ available: false });
    expect(probeWheelContactCapability({ wheelContactBridge: { ...bridge(), readContacts: undefined } })).toMatchObject({ available: false });
    expect(probeWheelContactCapability({ wheelContactBridge: bridge() }).available).toBe(true);
  });

  it("validates packet bounds and frames before any solve", () => {
    expect(wheelContactProblem(contact(1))).toBeNull();
    expect(wheelContactProblem({ ...contact(1), normalLoadN: -1 })).toMatch(/normalLoadN/);
    expect(wheelContactProblem({ ...contact(1), forwardWorld: { x: 0.9, y: 0, z: 0 } })).toMatch(/unit/);
    expect(wheelContactProblem({ ...contact(1), forwardWorld: { x: 0, y: 0, z: 1 } })).toMatch(/orthogonal/);
    expect(wheelContactProblem({ ...contact(1), contactEpoch: 1.5 })).toMatch(/contactEpoch/);
    expect(wheelContactProblem({ ...contact(1), groundVelocityMps: { x: 1e6, y: 0, z: 0 } })).toMatch(/velocity/);
  });
});
