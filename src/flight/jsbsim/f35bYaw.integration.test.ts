// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapAircraft } from "./bootstrapC172";
import { getFdmProfile } from "./fdmProfiles";
import { setExternalFuelTankAttached } from "./externalFuelTanks";
import { resolveAircraftDataFiles } from "./hydrateJsbsimData";
import { applyFlightControls } from "../input/applyFlightControls";
import { FIXED_DT } from "../physics/fixedStepLoop";
import { captureSimulation, restoreSimulation } from "../physics/safeFlightState";
import { resetFlightLocation } from "./resetFlightLocation";

const profile = getFdmProfile("f-35b");
const instances: JSBSimSdk[] = [];
afterEach(() => { for (const sdk of instances.splice(0)) sdk.destroy(); });

async function boot(speed: number, conversion: number, disturbance: "rate" | "release") {
  const sdk = await JSBSimSdk.create({
    moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false },
  });
  instances.push(sdk);
  const manifest: unknown = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8"));
  for (const file of resolveAircraftDataFiles(manifest, "f-35b")) sdk.writeDataFile(file, readFileSync("public/jsbsim-data/" + file, "utf8"));
  await bootstrapAircraft(sdk, "f-35b", { airspeedKts: speed, altFt: conversion === 1 ? 1000 : 5000 });
  // Preserve the clean-aircraft yaw fixtures; attached stores have their own checks.
  for (const index of [2, 3]) setExternalFuelTankAttached(sdk, "f-35b", index, false);
  const controls = {
    elevator: 0, aileron: 0, rudder: 0, throttle: conversion > 0 ? 0.98 : profile.initialThrottleNorm,
    pitchTrim: conversion > 0 ? 0 : profile.initialProperties!["fcs/pitch-trim-cmd-norm"], rollTrim: 0, flaps: 0, brake: 0,
  };
  const apply = (rudder = 0) => applyFlightControls(sdk, { ...controls, rudder }, 0, profile.rudderSign, {
    commandProperty: profile.stovl!.commandProperty, commandNorm: conversion,
  });
  const initialize = () => {
    apply();
    // Partial conversion is an untrimmed control-law disturbance fixture,
    // not a landing/transition test. Exclude ground forces from yaw metrics.
    sdk.setPropertyValue("ic/terrain-elevation-ft", -100000);
    sdk.setPropertyValue("ic/r-rad_sec", disturbance === "rate" ? 0.05 : 0);
    sdk.setPropertyValue("fcs/stovl-pos-norm", conversion);
    if (conversion > 0) {
      for (const property of ["ic/theta-deg", "ic/alpha-deg", "ic/gamma-deg"]) sdk.setPropertyValue(property, 0);
    }
  };
  initialize();
  expect(sdk.runIc()).toBe(true);
  if (conversion > 0) {
    sdk.setPropertyValue("propulsion/set-running", -1);
    initialize();
    expect(sdk.runIc()).toBe(true);
  }
  return { sdk, apply };
}

describe("F-35B native yaw damping after disturbance/control release", () => {
  it.each([160, 300, 450, 600].flatMap(speed => [
    { speed, conversion: 0, disturbance: "rate" as const },
    { speed, conversion: 0, disturbance: "release" as const },
  ]).concat([
    { speed: 160, conversion: 0.5, disturbance: "release" as const },
    { speed: 0, conversion: 1, disturbance: "rate" as const },
    { speed: 0, conversion: 1, disturbance: "release" as const },
  ]))("damps $disturbance at $speed kt and $conversion conversion without actuator hunting", async configuration => {
    const { sdk, apply } = await boot(configuration.speed, configuration.conversion, configuration.disturbance);
    let peakRate = 0;
    let peakBeta = 0;
    let lateSquares = 0;
    let lateSamples = 0;
    let lateSaturations = 0;
    for (let step = 0; step < 24 / FIXED_DT; step++) {
      const time = step * FIXED_DT;
      apply(configuration.disturbance === "release" && time >= 1.5 && time < 2 ? 0.5 : 0);
      expect(sdk.run()).toBe(true);
      const rate = sdk.getPropertyValue("velocities/r-rad_sec");
      const beta = sdk.getPropertyValue("aero/beta-rad");
      expect(Number.isFinite(rate) && Number.isFinite(beta)).toBe(true);
      peakRate = Math.max(peakRate, Math.abs(rate));
      if (configuration.conversion === 0) peakBeta = Math.max(peakBeta, Math.abs(beta));
      if (time >= 19) {
        lateSquares += rate * rate;
        lateSamples++;
        if (Math.abs(sdk.getPropertyValue("fcs/yaw-scheduler")) > 0.99) lateSaturations++;
      }
    }
    // Development stability limits, not F-35 handling specifications. The
    // previous source loop reached 1.2–2.4 rad/s and repeatedly saturated at
    // 450/600 kt from a 0.05 rad/s disturbance or a half-second rudder pulse.
    expect(peakRate).toBeLessThan(0.15);
    expect(Math.sqrt(lateSquares / lateSamples)).toBeLessThan(0.005);
    expect(lateSaturations / lateSamples).toBeLessThan(0.01);
    if (configuration.conversion === 0) expect(peakBeta).toBeLessThan(0.1);
  });

  it("resolves Auto/Manual/FBW natively and keeps pilot commands separate from surface feedback", async () => {
    const { sdk } = await boot(300, 0, "rate");
    const commands = { elevator: 0, aileron: 0, rudder: 0, throttle: 0.48, pitchTrim: 0, rollTrim: 0, flaps: 0, brake: 0 };
    const select = (mode: "auto" | "manual" | "fly-by-wire") => applyFlightControls(sdk, commands, 0, profile.rudderSign,
      { commandProperty: profile.stovl!.commandProperty, commandNorm: 0 },
      { commandProperty: profile.controlLaw!.commandProperty, mode });
    select("auto");
    expect(sdk.run()).toBe(true);
    expect(sdk.getPropertyValue("fcs/fbw-enabled")).toBe(1);
    expect(Math.abs(sdk.getPropertyValue("fcs/yaw-scheduler"))).toBeGreaterThan(0.01);
    expect(Math.abs(sdk.getPropertyValue("fcs/rudder-cmd-norm"))).toBe(0);
    select("manual");
    for (let step = 0; step < 0.7 / FIXED_DT; step++) expect(sdk.run()).toBe(true);
    expect(sdk.getPropertyValue("fcs/fbw-enabled")).toBe(0);
    expect(Math.abs(sdk.getPropertyValue("fcs/yaw-scheduler"))).toBe(0);
    expect(sdk.getPropertyValue("fcs/rudder-pos-rad")).toBeCloseTo(0, 3);
    expect(Math.abs(sdk.getPropertyValue("fcs/elevator-pos-norm"))).toBe(0);
    expect(Math.abs(sdk.getPropertyValue("fcs/left-aileron-pos-rad"))).toBe(0);
    expect(Math.abs(sdk.getPropertyValue("fcs/roll-i"))).toBe(0);
    expect(Math.abs(sdk.getPropertyValue("fcs/g-load-i"))).toBe(0);
    select("fly-by-wire");
    let peak = 0;
    for (let step = 0; step < 8 / FIXED_DT; step++) {
      expect(sdk.run()).toBe(true);
      peak = Math.max(peak, Math.abs(sdk.getPropertyValue("velocities/r-rad_sec")));
    }
    expect(sdk.getPropertyValue("fcs/control-law-mode")).toBe(2);
    expect(sdk.getPropertyValue("fcs/fbw-enabled")).toBe(1);
    expect(peak).toBeLessThan(0.15);
    expect(Math.abs(sdk.getPropertyValue("velocities/r-rad_sec"))).toBeLessThan(0.005);
    for (const property of ["fcs/elevator-cmd-norm", "fcs/aileron-cmd-norm", "fcs/rudder-cmd-norm"]) expect(Math.abs(sdk.getPropertyValue(property))).toBe(0);
  });

  it.each(["relocation", "snapshot"] as const)("preserves Manual through %s and conversion without enabling hover damping", async operation => {
    const { sdk } = await boot(0, 1, "rate");
    sdk.setPropertyValue("fcs/control-law-mode", 1);
    expect(sdk.runIc()).toBe(true);
    if (operation === "relocation") resetFlightLocation(sdk, { latDeg: 35, lonDeg: -110, altMeters: 500 }, undefined, "f-35b");
    else restoreSimulation(sdk, captureSimulation(sdk));
    expect(sdk.getPropertyValue("fcs/control-law-mode")).toBe(1);
    expect(sdk.getPropertyValue("fcs/fbw-enabled")).toBe(0);
    expect(sdk.getPropertyValue("fcs/stovl-pos-norm")).toBe(1);
    expect(Math.abs(sdk.getPropertyValue("fcs/nozzle-yaw-rad"))).toBe(0);
    expect(Math.abs(sdk.getPropertyValue("fcs/stovl-pitch-control"))).toBe(0);
    expect(Math.abs(sdk.getPropertyValue("fcs/stovl-roll-control"))).toBe(0);
    sdk.setPropertyValue("fcs/stovl-cmd-norm", 0.5);
    for (let step = 0; step < 0.5 / FIXED_DT; step++) expect(sdk.run()).toBe(true);
    expect(sdk.getPropertyValue("fcs/stovl-pos-norm")).toBeCloseTo(0.8, 8);
    expect(sdk.getPropertyValue("fcs/fbw-enabled")).toBe(0);
    expect(sdk.getPropertyValue("fcs/control-law-mode")).toBe(1);
    expect(Math.abs(sdk.getPropertyValue("fcs/nozzle-yaw-rad"))).toBe(0);
  });

  it.each(["departure", "arrival"] as const)("preserves Manual through the %s runway preset", async mode => {
    const { sdk } = await boot(300, 0, "rate");
    sdk.setPropertyValue("fcs/control-law-mode", 1);
    expect(sdk.runIc()).toBe(true);
    resetFlightLocation(sdk, {
      latDeg: 35, lonDeg: -110, altMeters: mode === "departure" ? 300 : 700,
      flightPreset: { mode, headingDeg: 90, groundElevationMeters: 300, flightPathDeg: mode === "arrival" ? -3 : 0 },
    }, 300, "f-35b");
    // Initialization only: this checks mode ownership, not ground handling.
    expect(sdk.getPropertyValue("fcs/control-law-mode")).toBe(1);
    expect(sdk.getPropertyValue("fcs/fbw-enabled")).toBe(0);
    expect(sdk.getPropertyValue("fcs/stovl-pos-norm")).toBe(0);
  });

  it("uses direct stick plus trim in Manual and pilot flaps when Auto flaps is disabled", async () => {
    const { sdk } = await boot(300, 0, "rate");
    sdk.setPropertyValue("fcs/yaw-trim-cmd-norm", 0.05);
    sdk.setPropertyValue("fcs/flaps-auto-enabled", 0);
    applyFlightControls(sdk, {
      elevator: 0.2, aileron: 0.2, rudder: 0.2, throttle: 0.48,
      pitchTrim: -0.05, rollTrim: 0.1, flaps: 0.4, brake: 0,
    }, 0, profile.rudderSign, { commandProperty: profile.stovl!.commandProperty, commandNorm: 0 },
    { commandProperty: profile.controlLaw!.commandProperty, mode: "manual" });
    for (let step = 0; step < 0.7 / FIXED_DT; step++) expect(sdk.run()).toBe(true);
    expect(sdk.getPropertyValue("fcs/elevator-pos-norm")).toBeCloseTo(0.15, 8);
    expect(sdk.getPropertyValue("fcs/left-aileron-pos-rad")).toBeCloseTo(0.3 * 0.4, 8);
    expect(sdk.getPropertyValue("fcs/rudder-pos-rad")).toBeCloseTo((-0.2 + 0.05) * 0.524, 3);
    expect(sdk.getPropertyValue("fcs/flap-pos-norm")).toBeCloseTo(0.4, 8);
    expect(sdk.getPropertyValue("fcs/lef-pos-rad")).toBe(0);
  });
});
