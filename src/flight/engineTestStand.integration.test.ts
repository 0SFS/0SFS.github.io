// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { afterEach, describe, expect, it } from "vitest";
import { engineTestStandBootstrapOptions, type EngineTestStandInitialState } from "./engineTestStand";
import type { AircraftId } from "./aircraft/aircraftIds";
import { bootstrapAircraft } from "./jsbsim/bootstrapC172";
import { createEngineControl, type EngineControl } from "./jsbsim/engineControl";
import { getFdmProfile } from "./jsbsim/fdmProfiles";
import { resolveAircraftDataFiles } from "./jsbsim/hydrateJsbsimData";
import { resetFlightLocation } from "./jsbsim/resetFlightLocation";
import { FIXED_DT } from "./physics/fixedStepLoop";

const instances: JSBSimSdk[] = [];
afterEach(() => {
  for (const sdk of instances.splice(0)) sdk.destroy();
});

async function boot(aircraftId: AircraftId, initialState: EngineTestStandInitialState = "running"): Promise<JSBSimSdk> {
  const sdk = await JSBSimSdk.create({
    moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false },
  });
  instances.push(sdk);
  const manifest: unknown = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8"));
  for (const file of resolveAircraftDataFiles(manifest, aircraftId)) {
    sdk.writeDataFile(file, readFileSync("public/jsbsim-data/" + file, "utf8"));
  }
  await bootstrapAircraft(sdk, aircraftId, engineTestStandBootstrapOptions(initialState));
  return sdk;
}

function advance(sdk: JSBSimSdk, seconds: number, control?: EngineControl): void {
  for (let step = 0; step < Math.round(seconds / FIXED_DT); step++) {
    control?.step(false);
    expect(sdk.run()).toBe(true);
  }
}

function position(sdk: JSBSimSdk): { latDeg: number; lonDeg: number; altFt: number } {
  return {
    latDeg: sdk.getPropertyValue("position/lat-geod-deg"),
    lonDeg: sdk.getPropertyValue("position/long-gc-deg"),
    altFt: sdk.getPropertyValue("position/h-sl-ft"),
  };
}

describe("engine test stand on the installed JSBSim SDK", () => {
  it("opens cold and stopped without fuel or warm initialization, then starts through the normal engine control", async () => {
    const sdk = await boot("f-35b", "cold");
    const control = createEngineControl(sdk, getFdmProfile("f-35b"));
    const ambient = sdk.getPropertyValue("atmosphere/T-R") * 5 / 9;
    expect(sdk.getPropertyValue("propulsion/engine/set-running")).toBe(0);
    advance(sdk, 1, control);
    expect(sdk.getPropertyValue("propulsion/engine/fuel-flow-rate-pps")).toBe(0);
    for (const prefix of ["thermal/", "thermal/core/"]) {
      expect(sdk.getPropertyValue(`propulsion/engine/${prefix}metal-temperature-k`)).toBeCloseTo(ambient, 6);
    }
    for (let step = 0; step < 60 / FIXED_DT; step++) { control.step(true); expect(sdk.run()).toBe(true); }
    expect(sdk.getPropertyValue("propulsion/engine/set-running")).toBe(1);
    expect(sdk.getPropertyValue("forces/hold-down")).toBe(1);
    expect(sdk.getPropertyValue("propulsion/engine/thermal/core/metal-temperature-k")).toBeGreaterThan(ambient);
  }, 30000);

  it("keeps hold-down, stopped engine, fuel and native hot metal through runway moves and subsequent steps", async () => {
    const sdk = await boot("f-35b");
    const control = createEngineControl(sdk, getFdmProfile("f-35b"));
    const metal = "propulsion/engine/thermal/metal-temperature-k";
    const core = "propulsion/engine/thermal/core/metal-temperature-k";
    const ambient = sdk.getPropertyValue("atmosphere/T-R") * 5 / 9;
    sdk.setPropertyValue("fcs/throttle-cmd-norm", 1);
    advance(sdk, 30, control);
    expect(sdk.getPropertyValue(metal)).toBeGreaterThan(ambient + 100);
    control.shutdown();
    sdk.setPropertyValue("fcs/throttle-cmd-norm", 0);
    advance(sdk, 10, control);
    for (const mode of ["departure", "arrival"] as const) {
      const wall = sdk.getPropertyValue(metal);
      const coreWall = sdk.getPropertyValue(core);
      const fuel = sdk.getPropertyValue("propulsion/total-fuel-lbs");
      const headingDeg = mode === "departure" ? 350 : 120;
      const state = resetFlightLocation(sdk, { latDeg: 46.8, lonDeg: -92.1, altMeters: 800,
        flightPreset: { mode, headingDeg, groundElevationMeters: 300, flightPathDeg: mode === "arrival" ? -3 : 0 },
      }, 300, "f-35b", { holdDown: true });
      expect(state.latDeg).toBeCloseTo(46.8, 8);
      expect(state.lonDeg).toBeCloseTo(-92.1, 8);
      expect(sdk.getPropertyValue("attitude/psi-deg")).toBeCloseTo(headingDeg, 6);
      expect(sdk.getPropertyValue("forces/hold-down")).toBe(1);
      expect(sdk.getPropertyValue("propulsion/engine/set-running")).toBe(0);
      expect(sdk.getPropertyValue("fcs/throttle-cmd-norm")).toBe(0);
      expect(sdk.getPropertyValue("propulsion/total-fuel-lbs")).toBeCloseTo(fuel, 8);
      expect(sdk.getPropertyValue(metal)).toBeCloseTo(wall, 10);
      expect(sdk.getPropertyValue(core)).toBeCloseTo(coreWall, 10);
      advance(sdk, 1, control);
      expect(sdk.getPropertyValue("propulsion/engine/set-running")).toBe(0);
      expect(sdk.getPropertyValue("propulsion/engine/thrust-lbs")).toBe(0);
      expect(sdk.getPropertyValue(metal)).toBeLessThan(wall);
      expect(sdk.getPropertyValue(core)).toBeLessThan(coreWall);
      expect(sdk.getPropertyValue(core)).toBeGreaterThan(ambient);
      expect(sdk.getPropertyValue(metal)).toBeGreaterThan(ambient);
      expect(Math.abs(sdk.getPropertyValue("position/h-sl-ft") * 0.3048 - state.altMeters)).toBeLessThan(0.1);
    }
  }, 30000);

  it.each(["cirrus-vision-jet", "f-35b"] as const)(
    "advances %s engine dynamics and fuel at zero airspeed without moving the aircraft", async aircraftId => {
      const sdk = await boot(aircraftId);
      expect(sdk.getPropertyValue("forces/hold-down")).toBe(1);
      expect(sdk.getDeltaT()).toBe(FIXED_DT);
      expect(sdk.getPropertyValue("fcs/throttle-cmd-norm")).toBe(0);
      const start = position(sdk);
      const startTime = sdk.getPropertyValue("simulation/sim-time-sec");
      const initialFuel = sdk.getPropertyValue("propulsion/tank/contents-lbs");
      // Warm startup may begin with the native steady-state spool. Let idle
      // settle before comparing throttle response; no application spool model.
      advance(sdk, 30);
      const idleN2 = sdk.getPropertyValue("propulsion/engine/n2");
      const idleThrust = sdk.getPropertyValue("propulsion/engine/thrust-lbs");
      const idleFlow = sdk.getPropertyValue("propulsion/engine/fuel-flow-rate-pps");
      const metalProperty = "propulsion/engine/thermal/metal-temperature-k";
      const hasMetal = sdk.getPropertyCatalog().some(entry =>
        entry.replaceAll("[0]", "").trim() === `${metalProperty} (R)`);
      const idleMetal = hasMetal ? sdk.getPropertyValue(metalProperty) : undefined;

      sdk.setPropertyValue("fcs/throttle-cmd-norm", 0.99);
      advance(sdk, 30);
      expect(sdk.getPropertyValue("propulsion/engine/n2")).toBeGreaterThan(idleN2 + 5);
      expect(sdk.getPropertyValue("propulsion/engine/thrust-lbs")).toBeGreaterThan(idleThrust);
      expect(sdk.getPropertyValue("propulsion/engine/fuel-flow-rate-pps")).toBeGreaterThan(idleFlow);
      expect(sdk.getPropertyValue("propulsion/tank/contents-lbs")).toBeLessThan(initialFuel);
      expect(sdk.getPropertyValue("simulation/sim-time-sec") - startTime).toBeCloseTo(60, 7);
      expect(sdk.getPropertyValue("velocities/vc-kts")).toBeLessThan(0.05);
      if (idleMetal !== undefined) {
        const metal = sdk.getPropertyValue(metalProperty);
        expect(sdk.getPropertyValue("propulsion/engine/thermal/valid")).toBe(1);
        expect(sdk.getPropertyValue("propulsion/engine/thermal/initialized")).toBe(1);
        expect(Number.isFinite(metal)).toBe(true);
        expect(Math.abs(metal - idleMetal)).toBeGreaterThan(0.1);
      }

      const end = position(sdk);
      const northMeters = (end.latDeg - start.latDeg) * 111320;
      const eastMeters = (end.lonDeg - start.lonDeg) * 111320 * Math.cos(start.latDeg * Math.PI / 180);
      expect(Math.hypot(northMeters, eastMeters)).toBeLessThan(0.5);
      expect(Math.abs(end.altFt - start.altFt) * 0.3048).toBeLessThan(0.5);
      expect(sdk.getPropertyValue("forces/hold-down")).toBe(1);
    }, 30000,
  );
});
