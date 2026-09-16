// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapAircraft, type C172BootstrapOptions } from "./bootstrapC172";
import { getFdmProfile } from "./fdmProfiles";
import { resolveAircraftDataFiles } from "./hydrateJsbsimData";
import { resetFlightLocation } from "./resetFlightLocation";
import { readFlightState } from "../bridge/ecefBridge";
import { readControlSurfaceState } from "../aircraft/aircraftAnimation";
import { createFlightInputManager } from "../input/flightInputManager";
import { applyFlightControls } from "../input/applyFlightControls";
import { createAutoTrimState, stepPitchAutoTrim, type AutoTrimState } from "../input/autoTrim";
import { createFixedStepPhysicsLoop, FIXED_DT } from "../physics/fixedStepLoop";
import { groundContactClearanceMeters } from "../physics/groundContactClearance";
import { captureSimulation, restoreSimulation, validFlightState } from "../physics/safeFlightState";

const aircraftId = "cirrus-vision-jet";
const profile = getFdmProfile(aircraftId);
const instances: JSBSimSdk[] = [];

beforeEach(() => {
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
});

afterEach(() => {
  for (const sdk of instances.splice(0)) {
    const exec = sdk.exec as typeof sdk.exec & { isDeleted(): boolean };
    sdk.destroy();
    expect(exec.isDeleted()).toBe(true);
    expect(() => sdk.destroy()).not.toThrow();
  }
  vi.restoreAllMocks();
});

async function createSf50(options: C172BootstrapOptions = {}) {
  const sdk = await JSBSimSdk.create({
    moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false },
  });
  instances.push(sdk);
  const manifest: unknown = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8"));
  for (const path of resolveAircraftDataFiles(manifest, aircraftId)) {
    sdk.writeDataFile(path, readFileSync("public/jsbsim-data/" + path, "utf8"));
  }
  await bootstrapAircraft(sdk, aircraftId, options);
  return sdk;
}

function advance(sdk: JSBSimSdk, steps: number) {
  for (let step = 0; step < steps; step += 1) expect(sdk.run()).toBe(true);
  expect(validFlightState(readFlightState(sdk))).toBe(true);
}

describe("SF50 runtime contracts (not performance calibration)", () => {
  it("boots only its own dependency closure, at the requested coordinates and timestep", async () => {
    const sdk = await createSf50({ latDeg: 46.7867, lonDeg: -92.1005, altFt: 8500, airspeedKts: 130 });
    expect(sdk.module.FS.analyzePath("/runtime/engine/direct.xml").exists).toBe(true);
    expect(sdk.module.FS.analyzePath("/runtime/aircraft/c172p/c172p.xml").exists).toBe(false);
    expect(sdk.getPropertyValue("gear/num-units")).toBe(3);
    expect(sdk.getDeltaT()).toBeCloseTo(FIXED_DT, 12);
    const state = readFlightState(sdk);
    expect(state.latDeg).toBeCloseTo(46.7867, 8);
    expect(state.lonDeg).toBeCloseTo(-92.1005, 8);
    expect(state.altMeters).toBeCloseTo(8500 * 0.3048, 6);
    expect(state.airspeedKts).toBeCloseTo(130, 6);
    expect(sdk.getPropertyValue("gear/gear-cmd-norm")).toBe(0);
    expect(sdk.getPropertyValue("gear/gear-pos-norm")).toBe(0);
    expect(sdk.queryPropertyCatalog("ic/gear-gear-pos-norm")).not.toContain("ic/gear-gear-pos-norm (");
    advance(sdk, 120);
    expect(sdk.getPropertyValue("simulation/sim-time-sec")).toBeCloseTo(1, 10);
  });

  it.each(["bootstrap", "location reset", "snapshot restore"] as const)(
    "evaluates running turbine state at the selected throttle before returning from %s", async operation => {
      const sdk = await createSf50();
      if (operation === "location reset") resetFlightLocation(sdk, { latDeg: 45, lonDeg: -93, altMeters: 1500 }, undefined, aircraftId);
      if (operation === "snapshot restore") restoreSimulation(sdk, captureSimulation(sdk));
      expect(sdk.getPropertyValue("fcs/throttle-cmd-norm")).toBe(profile.initialThrottleNorm);
      expect(sdk.getPropertyValue("simulation/sim-time-sec")).toBe(0);
      const properties = ["propulsion/engine[0]/n1", "propulsion/engine[0]/n2", "propulsion/engine[0]/thrust-lbs"];
      const returned = properties.map(property => sdk.getPropertyValue(property));
      // Re-evaluating the same zero-time conditions must not repair a stale
      // full-power initial sample. This checks initialization, not aircraft fit.
      expect(sdk.runIc()).toBe(true);
      properties.forEach((property, index) => expect(returned[index], property).toBeCloseTo(sdk.getPropertyValue(property), 8));
      advance(sdk, 1);
      expect(sdk.getPropertyValue("fcs/throttle-cmd-norm")).toBe(profile.initialThrottleNorm);
    },
  );

  it("keeps the selected aircraft's throttle and gear through the first input step", async () => {
    const sdk = await createSf50();
    const input = createFlightInputManager({
      initialThrottle: sdk.getPropertyValue("fcs/throttle-cmd-norm"),
      initialGearDown: sdk.getPropertyValue("gear/gear-cmd-norm") > 0.5,
      rudderSign: profile.rudderSign,
    });
    input.apply(sdk, input.poll(FIXED_DT));
    advance(sdk, 1);
    expect(sdk.getPropertyValue("fcs/throttle-cmd-norm")).toBe(profile.initialThrottleNorm);
    expect(sdk.getPropertyValue("gear/gear-cmd-norm")).toBe(0);
    expect(sdk.getPropertyValue("gear/gear-pos-norm")).toBe(0);
  });

  it.each([-1, 1])("yaws in the pilot's requested direction %s", async direction => {
    const sdk = await createSf50({ engineRunning: false });
    const heading = readFlightState(sdk).headingRad;
    applyFlightControls(sdk, {
      elevator: 0, aileron: 0, rudder: direction * 0.5, throttle: 0,
      pitchTrim: 0, rollTrim: 0, flaps: 0, brake: 0,
    }, 0, profile.rudderSign);
    advance(sdk, 60);
    const difference = readFlightState(sdk).headingRad - heading;
    expect(Math.atan2(Math.sin(difference), Math.cos(difference)) * direction).toBeGreaterThan(0.001);
  });

  it.each([-1, 1])("rolls in the pilot's requested direction %s", async direction => {
    const sdk = await createSf50({ engineRunning: false });
    sdk.setPropertyValue("fcs/aileron-cmd-norm", direction * 0.5);
    advance(sdk, 60);
    expect(readFlightState(sdk).rollRad * direction).toBeGreaterThan(0.001);
  });

  it.each([[1, 1], [1, -1], [-1, 1], [-1, -1]])(
    "uses clipped physical ruddervators for pitch=%s and yaw=%s", async (pitch, yaw) => {
      const sdk = await createSf50({ engineRunning: false });
      sdk.setPropertyValue("fcs/elevator-cmd-norm", pitch);
      sdk.setPropertyValue("fcs/rudder-cmd-norm", yaw);
      expect(sdk.runIc()).toBe(true);
      const state = readControlSurfaceState(sdk);
      expect(Math.abs(state.ruddervatorLeftRad)).toBeLessThanOrEqual(0.35);
      expect(Math.abs(state.ruddervatorRightRad)).toBeLessThanOrEqual(0.35);
      expect(Math.max(Math.abs(state.ruddervatorLeftRad), Math.abs(state.ruddervatorRightRad))).toBeCloseTo(0.35, 12);
      expect((state.ruddervatorLeftRad - state.ruddervatorRightRad) * yaw).toBeGreaterThan(0);
      expect((state.ruddervatorLeftRad + state.ruddervatorRightRad) * pitch).toBeGreaterThan(0);
      expect(sdk.getPropertyValue("moments/m-aero-lbsft") * pitch).toBeLessThan(0);
      expect(sdk.getPropertyValue("moments/n-aero-lbsft") * yaw).toBeGreaterThan(0);
    },
  );

  it("drives physical and observed gear travel over eight simulated seconds", async () => {
    const sdk = await createSf50({ engineRunning: false });
    sdk.setPropertyValue("gear/gear-cmd-norm", 1);
    advance(sdk, 480);
    expect(sdk.getPropertyValue("gear/gear-pos-norm")).toBeCloseTo(0.5, 10);
    expect(readControlSurfaceState(sdk).gearDownNorm).toBeCloseTo(0.5, 10);
    expect(groundContactClearanceMeters(sdk, 0, 0)).toBe(0);
    advance(sdk, 480);
    expect(sdk.getPropertyValue("gear/gear-pos-norm")).toBeCloseTo(1, 10);
    const expectedClearance = (sdk.getPropertyValue("inertia/cg-z-in") + 84) * 0.0254;
    expect(groundContactClearanceMeters(sdk, 0, 0)).toBeCloseTo(expectedClearance, 8);
  });

  it.each(["location reset", "snapshot restore"] as const)("preserves a partly extended gear and its lever across %s", async operation => {
    const sdk = await createSf50();
    sdk.setPropertyValue("gear/gear-cmd-norm", 1);
    advance(sdk, 240);
    const position = sdk.getPropertyValue("gear/gear-pos-norm");
    if (operation === "location reset") resetFlightLocation(sdk, { latDeg: 47, lonDeg: -92, altMeters: 2000 }, 300, aircraftId);
    else restoreSimulation(sdk, captureSimulation(sdk));
    expect(sdk.getPropertyValue("gear/gear-cmd-norm")).toBe(1);
    expect(sdk.getPropertyValue("gear/gear-pos-norm")).toBeCloseTo(position, 10);
    expect(sdk.getPropertyValue("simulation/sim-time-sec"))
      .toBeCloseTo(operation === "snapshot restore" ? 2 : 0, 10);
    expect(sdk.getDeltaT()).toBeCloseTo(FIXED_DT, 12);
    advance(sdk, 1);
    expect(sdk.getPropertyValue("gear/gear-pos-norm")).toBeGreaterThan(position);
  });

  it.each(["departure", "arrival"] as const)("initializes a coherent %s runway configuration", async mode => {
    const sdk = await createSf50();
    const state = resetFlightLocation(sdk, {
      latDeg: 45, lonDeg: -93, altMeters: mode === "departure" ? 300 : 800,
      flightPreset: { mode, headingDeg: 90, groundElevationMeters: 300, flightPathDeg: mode === "arrival" ? -3 : 0 },
    }, 300, aircraftId);
    const config = profile.runwayPresets[mode];
    expect(state.airspeedKts).toBeCloseTo(config.airspeedKts, 6);
    expect(state.throttleNorm).toBe(config.throttleNorm);
    expect(sdk.getPropertyValue("gear/gear-pos-norm")).toBe(1);
    expect(sdk.getPropertyValue("gear/gear-cmd-norm")).toBe(1);
    expect(sdk.getPropertyValue("fcs/flap-cmd-norm")).toBe(config.flapsNorm);
    expect(sdk.getPropertyValue("fcs/flap-pos-norm")).toBe(config.flapsNorm);
    expect(readControlSurfaceState(sdk).flapRad).toBeCloseTo(config.flapsNorm * 35 * Math.PI / 180, 10);
    expect(sdk.queryPropertyCatalog("propulsion/magneto_cmd")).not.toContain("propulsion/magneto_cmd (");
    advance(sdk, mode === "departure" ? 1200 : 120);
    if (mode === "departure") {
      expect(sdk.getPropertyValue("gear/wow")).toBe(1);
      expect(readFlightState(sdk).altMeters).toBeGreaterThan(300);
      expect(readFlightState(sdk).altMeters).toBeLessThan(302);
    }
  });

  it("increases turbine thrust with throttle and consumes fuel", async () => {
    const sdk = await createSf50();
    sdk.setPropertyValue("fcs/throttle-cmd-norm", 0);
    advance(sdk, 600);
    const idleThrust = sdk.getPropertyValue("propulsion/engine/thrust-lbs");
    const idleN1 = sdk.getPropertyValue(profile.gauges.primary);
    const fuel = sdk.getPropertyValue("propulsion/tank/contents-lbs");
    sdk.setPropertyValue("fcs/throttle-cmd-norm", 1);
    advance(sdk, 600);
    expect(sdk.getPropertyValue("propulsion/engine/thrust-lbs")).toBeGreaterThan(idleThrust + 100);
    expect(sdk.getPropertyValue(profile.gauges.primary)).toBeGreaterThan(idleN1);
    expect(sdk.getPropertyValue(profile.gauges.secondary!)).toBeGreaterThan(0);
    expect(sdk.getPropertyValue("propulsion/tank/contents-lbs")).toBeLessThan(fuel);
  });

  it("applies dorsal engine thrust above the CG with a nose-down pitching moment", async () => {
    const sdk = await createSf50();
    advance(sdk, 1);
    expect(sdk.getPropertyValue("forces/fbx-prop-lbs")).toBeGreaterThan(0);
    expect(sdk.getPropertyValue("moments/m-prop-lbsft")).toBeLessThan(0);
  });

  it("stops a deep SF50 wheel penetration before advancing the ground springs", async () => {
    const sdk = await createSf50({ engineRunning: false });
    for (const [property, value] of Object.entries({
      "ic/terrain-elevation-ft": 300 / 0.3048, "ic/h-sl-ft": 300.2 / 0.3048,
      "ic/vc-kts": 0, "gear/gear-cmd-norm": 1, "gear/gear-pos-norm": 1,
    })) sdk.setPropertyValue(property, value);
    expect(sdk.runIc()).toBe(true);
    const run = vi.spyOn(sdk, "run");
    const loop = createFixedStepPhysicsLoop(sdk);
    loop.update(FIXED_DT, () => true);
    expect(loop.getFault()).toContain("Hard ground impact");
    expect(run).not.toHaveBeenCalled();
  });

  it("produces the same accepted states under 10/30/60/120 FPS display schedules", async () => {
    let reference: number[] | undefined;
    for (const fps of [120, 60, 30, 10]) {
      const sdk = await createSf50({ engineRunning: false });
      let accepted = 0;
      const loop = createFixedStepPhysicsLoop(sdk, () => { accepted += 1; });
      for (let frame = 0; frame < 500 && accepted < 240; frame += 1) {
        loop.update(1 / fps, () => { sdk.setPropertyValue("fcs/aileron-cmd-norm", 0.1); });
      }
      expect(loop.getFault()).toBeNull();
      expect(accepted).toBe(240);
      const sample = ["position/h-sl-ft", "velocities/vc-kts", "attitude/phi-rad", "simulation/sim-time-sec"]
        .map(property => sdk.getPropertyValue(property));
      if (reference) sample.forEach((value, index) => expect(value).toBeCloseTo(reference![index], 8));
      else reference = sample;
    }
  });

  it("cancels a pitch moment on the trim wheel without copying a held stick onto it", async () => {
    const sdk = await createSf50({ latDeg: 46.7867, lonDeg: -92.1005, altFt: 8500, airspeedKts: 130 });
    const idle = {
      elevator: 0, aileron: 0, rudder: 0, throttle: profile.initialThrottleNorm,
      pitchTrim: 0, rollTrim: 0, flaps: 0, brake: 0,
    };
    const sensors = () => ({
      pitchAccelRad: sdk.getPropertyValue("accelerations/qdot-rad_sec2"),
      pitchRateRad: sdk.getPropertyValue("velocities/q-rad_sec"),
      qbarPsf: sdk.getPropertyValue("aero/qbar-psf"),
      vtFps: sdk.getPropertyValue("velocities/vt-fps"),
    });
    const stepAssist = (elevator: number, trim: number, state: AutoTrimState) => {
      const next = stepPitchAutoTrim(state, {
        dt: FIXED_DT, elevator, pitchTrim: trim, onGround: false, ...sensors(),
      });
      applyFlightControls(sdk, { ...idle, elevator, pitchTrim: next.pitchTrim }, 0, profile.rudderSign);
      expect(sdk.run()).toBe(true);
      return next;
    };

    applyFlightControls(sdk, idle, 0, profile.rudderSign);
    advance(sdk, 30);
    applyFlightControls(sdk, { ...idle, pitchTrim: 0.35 }, 0, profile.rudderSign);
    advance(sdk, 12);
    const disturbedQdot = sensors().pitchAccelRad;
    expect(disturbedQdot).toBeLessThan(-0.04);

    let trim = 0.35;
    let state = createAutoTrimState(true);
    for (let i = 0; i < 360; i += 1) {
      const next = stepAssist(0, trim, state);
      state = next.state;
      trim = next.pitchTrim;
    }
    expect(validFlightState(readFlightState(sdk))).toBe(true);
    expect(trim).toBeLessThan(0.25);
    expect(trim).toBeGreaterThan(-0.2);
    expect(Math.abs(sensors().pitchAccelRad)).toBeLessThan(Math.abs(disturbedQdot) * 0.5);

    const beforePulse = trim;
    for (let i = 0; i < 24; i += 1) {
      const next = stepAssist(0.25, trim, state);
      state = next.state;
      trim = next.pitchTrim;
    }
    expect(Math.abs(trim - beforePulse)).toBeLessThan(0.06);
  });
});

describe("aircraft dependency selection", () => {
  it.each([null, {}, { files: ["aircraft/c172p/c172p.xml"] }, { aircraft: { "cirrus-vision-jet": [] } }])(
    "rejects a missing aircraft package instead of falling back to C172", manifest => {
      expect(() => resolveAircraftDataFiles(manifest, aircraftId)).toThrow("No valid JSBSim package");
    },
  );
  it("rejects paths outside the package root", () => {
    expect(() => resolveAircraftDataFiles({ aircraft: { [aircraftId]: ["../engine.xml"] } }, aircraftId)).toThrow();
  });
});
