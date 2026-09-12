import { describe, expect, it, vi } from "vitest";
import { FlightModelDriver, type FlightInitialConditions, type FlightDynamicsBackend } from "./flightModelDriver";

const initial: FlightInitialConditions = {
  latitudeDeg: 34, longitudeDeg: -118, altitudeMslFt: 1000, terrainElevationFt: 0,
  calibratedAirspeedKts: 85, headingDeg: 0, pitchDeg: 3, flightPathAngleDeg: -3, fuelLb: [750, 750],
  controls: { elevatorNorm: 0, aileronNorm: 0, rudderNorm: 0, throttleNorm: 0.35,
    flapsNorm: 1, gearDown: true, leftBrakeNorm: 0, rightBrakeNorm: 0 },
};

function backendFixture(omit = "") {
  const properties: Record<string, number> = Object.fromEntries([
    "position/lat-geod-deg", "position/long-gc-deg", "position/h-sl-ft", "position/h-agl-ft",
    "velocities/vc-kts", "velocities/vg-fps",
    "velocities/v-north-fps", "velocities/v-east-fps", "velocities/v-down-fps",
 "attitude/phi-deg", "attitude/theta-deg", "attitude/psi-deg",
    "velocities/p-rad_sec", "velocities/q-rad_sec", "velocities/r-rad_sec", "inertia/weight-lbs",
    "fcs/elevator-cmd-norm", "fcs/aileron-cmd-norm", "fcs/rudder-cmd-norm", "fcs/throttle-cmd-norm",
    "fcs/flap-cmd-norm", "fcs/left-brake-cmd-norm", "fcs/right-brake-cmd-norm",
    "fcs/throttle-pos-norm", "flight-path/gamma-deg",
    "gear/gear-cmd-norm", "gear/gear-pos-norm", "fcs/flap-pos-norm",
    "ic/lat-geod-deg", "ic/long-gc-deg", "ic/h-sl-ft", "ic/terrain-elevation-ft", "ic/vc-kts",
    "ic/psi-true-deg", "ic/theta-deg", "ic/gamma-deg", "ic/alpha-deg", "ic/phi-deg", "atmosphere/delta-T",
    "atmosphere/wind-north-fps", "atmosphere/wind-east-fps", "atmosphere/wind-down-fps",
    "propulsion/set-running", "gear/unit/WOW",
    "propulsion/tank/contents-lbs", "propulsion/tank[1]/contents-lbs",
  ].map(path => [path, 0]));
  properties["atmosphere/T-R"] = 518.67;
  delete properties[omit];
  let dt = 0;
  let time = 0;
  const backend: FlightDynamicsBackend = {
    writeDataFile: vi.fn(path => path),
    loadModelOrThrow: vi.fn(() => true),
    queryPropertyCatalog: () => Object.keys(properties).map(path => path + " (RW)").join("\n"),
    getPropertyValue: path => properties[path] ?? 0,
    setPropertyValue: vi.fn((path, value) => {
      properties[path] = value;
      // Model the relevant native IC coupling rather than independent fields.
      if (path === "ic/gamma-deg" || path === "ic/alpha-deg") {
        properties["ic/theta-deg"] = properties["ic/gamma-deg"]! + properties["ic/alpha-deg"]!;
      }
      if (path === "propulsion/set-running" && "propulsion/engine/thrust-lbs" in properties) {
        properties["propulsion/engine/thrust-lbs"] = 1800;
      }
    }),
    setDt: value => { dt = value; },
    getDeltaT: () => dt,
    getSimTime: () => time,
    resetToInitialConditions: () => { time = 0; },
    runIc: vi.fn(() => {
      properties["position/lat-geod-deg"] = properties["ic/lat-geod-deg"]!;
      properties["position/long-gc-deg"] = properties["ic/long-gc-deg"]!;
      properties["attitude/theta-deg"] = properties["ic/theta-deg"]!;
      properties["flight-path/gamma-deg"] = properties["ic/gamma-deg"]!;
      properties["fcs/throttle-pos-norm"] = properties["fcs/throttle-cmd-norm"]!;
      if ("propulsion/engine/thrust-lbs" in properties) {
        properties["propulsion/engine/thrust-lbs"] = 90 + 1710 * properties["fcs/throttle-pos-norm"]!;
      }
      return true;
    }),
    run: vi.fn(() => { time += dt; return true; }),
    setHoldDown: vi.fn(),
    destroy: vi.fn(),
  };
  return { backend, properties };
}

function create(backend: FlightDynamicsBackend) {
  return FlightModelDriver.create(backend, {
    modelName: "sf50", fixedDtSec: 1 / 120, rudderSign: 1,
    flapPosition: { property: "fcs/flap-pos-norm", fullTravel: 1 },
  }, { "aircraft/sf50/sf50.xml": "<fixture />" });
}

describe("private flight model driver", () => {
  it("initializes positive pitch on a descending path at idle without advancing time", () => {
    const { backend, properties } = backendFixture();
    properties["propulsion/engine/thrust-lbs"] = 0;
    const driver = create(backend);
    const observation = driver.initialize({ ...initial, controls: { ...initial.controls, throttleNorm: 0 } });
    expect(observation.pitchDeg).toBe(3);
    expect(observation.flightPathAngleDeg).toBe(-3);
    expect(observation.throttleCommandNorm).toBe(0);
    expect(observation.throttlePositionNorm).toBe(0);
    expect(observation.thrustLb).toBe(90);
    expect(observation.simTimeSec).toBe(0);
    expect(observation.fuelLb).toEqual([750, 750]);
    expect(backend.run).not.toHaveBeenCalled();
    expect(backend.runIc).toHaveBeenCalledTimes(2);
    driver.dispose();
  });

  it("does not expose a full-power transient when resetting from takeoff to landing", () => {
    const { backend, properties } = backendFixture();
    properties["propulsion/engine/thrust-lbs"] = 0;
    const driver = create(backend);
    driver.initialize({ ...initial, pitchDeg: 0, flightPathAngleDeg: 0,
      controls: { ...initial.controls, throttleNorm: 1 } });
    driver.step();
    const observation = driver.initialize({ ...initial, controls: { ...initial.controls, throttleNorm: 0 } });
    expect(observation.pitchDeg).toBe(3);
    expect(observation.flightPathAngleDeg).toBe(-3);
    expect(observation.thrustLb).toBe(90);
    expect(observation.simTimeSec).toBe(0);
    driver.dispose();
  });

  it("advances native time only through accepted steps", () => {
    const { backend } = backendFixture();
    const driver = create(backend);
    driver.initialize(initial);
    for (let displayFrame = 0; displayFrame < 120; displayFrame++) driver.observe();
    expect(backend.run).not.toHaveBeenCalled();
    expect(driver.step().simTimeSec).toBeCloseTo(1 / 120);
    driver.dispose();
  });
  it("returns immutable copies and represents absent optional capabilities as null", () => {
    const { backend, properties } = backendFixture();
    const driver = create(backend);
    const observation = driver.initialize(initial);
    expect(observation.thrustLb).toBeNull();
    expect(observation.fuelLb).toEqual([750, 750]);
    properties["propulsion/tank/contents-lbs"] = 700;
    expect(observation.fuelLb[0]).toBe(750);
    expect(driver.observe().fuelLb[0]).toBe(700);
    expect(Object.isFrozen(observation)).toBe(true);
    expect(Object.isFrozen(observation.fuelLb)).toBe(true);
    expect("exec" in driver).toBe(false);
    expect("sdk" in driver).toBe(false);
    driver.dispose();
  });
  it("requires a real property capability instead of accepting a missing-property zero", () => {
    const { backend } = backendFixture("gear/gear-pos-norm");
    expect(() => create(backend)).toThrow(/capability is absent/);
    expect(backend.destroy).toHaveBeenCalledOnce();
  });
  it("validates commands before making any property writes", () => {
    const { backend } = backendFixture();
    const driver = create(backend);
    driver.initialize(initial);
    vi.mocked(backend.setPropertyValue).mockClear();
    expect(() => driver.applyControls({ ...initial.controls, throttleNorm: Number.NaN })).toThrow(/finite/);
    expect(backend.setPropertyValue).not.toHaveBeenCalled();
    driver.dispose();
  });
  it("owns disposal and rejects further use", () => {
    const { backend } = backendFixture();
    const driver = create(backend);
    driver.initialize(initial);
    driver.dispose();
    driver.dispose();
    expect(backend.destroy).toHaveBeenCalledOnce();
    expect(() => driver.observe()).toThrow(/disposed/);
    expect(() => driver.step()).toThrow(/disposed/);
  });
  it("preserves physical configuration and discovers tank count on initialization", () => {
    const { backend, properties } = backendFixture();
    const driver = create(backend);
    driver.initialize(initial);
    expect(properties["gear/gear-pos-norm"]).toBe(1);
    expect(properties["fcs/flap-pos-norm"]).toBe(1);
    expect(properties["fcs/throttle-cmd-norm"]).toBe(0.35);
    expect(() => driver.initialize({ ...initial, fuelLb: [500] })).toThrow(/every discovered tank/);
    driver.dispose();
  });
});
