// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { afterEach, describe, expect, it } from "vitest";
import type { AircraftId } from "../aircraft/aircraftIds";
import { bootstrapAircraft } from "./bootstrapC172";
import { discoverFuelTanks, readFuelTanks, writeFuelTanks } from "./fuelTanks";
import { resolveAircraftDataFiles } from "./hydrateJsbsimData";
import { resetFlightLocation } from "./resetFlightLocation";
import { readExternalFuelTanks, setExternalFuelTankAttached } from "./externalFuelTanks";
import { getExternalTankDefinitions } from "../aircraft/externalTankDefinitions";
import { applySavedControls, captureSavedFlight, parseSavedFlight, restoreSavedFlight } from "./savedFlight";
import { FIXED_DT } from "../physics/fixedStepLoop";
import { captureSimulation, restoreSimulation } from "../physics/safeFlightState";

const instances: JSBSimSdk[] = [];

afterEach(() => {
  for (const sdk of instances.splice(0)) sdk.destroy();
});

async function boot(aircraftId: AircraftId) {
  const sdk = await JSBSimSdk.create({
    moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false },
  });
  instances.push(sdk);
  const manifest: unknown = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8"));
  for (const file of resolveAircraftDataFiles(manifest, aircraftId)) sdk.writeDataFile(file, readFileSync("public/jsbsim-data/" + file, "utf8"));
  await bootstrapAircraft(sdk, aircraftId, { altFt: 3000, airspeedKts: 120 });
  return sdk;
}

describe("fuel tanks in JSBSim", () => {
  it.each([
    ["cessna-172", [[185, 100, 56, -112], [185, 100, 56, 112]]],
    ["cirrus-vision-jet", [[2001, 1000, 158, 0]]],
    ["f-35b", [[6550, 2500, 368.52, 40], [6550, 2500, 368.52, -40], [2991, 0, 368.52, 127.952756], [2991, 0, 368.52, -127.952756]]],
  ] as const)("finds each %s tank's capacity and place and leaves its fuel alone", async (aircraftId, expected) => {
    const sdk = await boot(aircraftId);
    expect(readFuelTanks(sdk).map(tank => [tank.capacityLbs, tank.contentsLbs, tank.xIn, tank.yIn]))
      .toEqual(expected.map(tank => [...tank]));
    for (const tank of discoverFuelTanks(sdk)) expect(tank.densityLbsPerGal).toBeGreaterThan(5);
    expect(sdk.getPropertyValue("propulsion/total-fuel-lbs")).toBeCloseTo(expected.reduce((sum, tank) => sum + tank[1], 0), 6);
  });

  it("keeps fuel in every tank through recovery, a relocation and a runway start", async () => {
    const sdk = await boot("f-35b");
    writeFuelTanks(sdk, new Map([[0, 1000], [1, 2000], [2, 1500], [3, 500]]));
    // The mass model follows the new load on the next step, which burns a little of it.
    expect(sdk.run()).toBe(true);
    expect(sdk.getPropertyValue("propulsion/total-fuel-lbs")).toBeCloseTo(5000, 0);
    const loaded = readFuelTanks(sdk).map(tank => tank.contentsLbs);
    expect(loaded.map(Math.round)).toEqual([1000, 2000, 1500, 500]);

    restoreSimulation(sdk, captureSimulation(sdk));
    expect(readFuelTanks(sdk).map(tank => tank.contentsLbs)).toEqual(loaded);
    resetFlightLocation(sdk, { latDeg: 35, lonDeg: -110, altMeters: 1500 }, 300, "f-35b");
    expect(readFuelTanks(sdk).map(tank => tank.contentsLbs)).toEqual(loaded);
    resetFlightLocation(sdk, {
      latDeg: 35, lonDeg: -110, altMeters: 300,
      flightPreset: { mode: "departure", headingDeg: 90, groundElevationMeters: 300, flightPathDeg: 0 },
    }, 300, "f-35b");
    expect(readFuelTanks(sdk).map(tank => tank.contentsLbs)).toEqual(loaded);
    for (let step = 0; step < 1 / FIXED_DT; step++) expect(sdk.run()).toBe(true);
    expect(readFuelTanks(sdk).every((tank, i) => tank.contentsLbs <= loaded[i]!)).toBe(true);
  });

  it("releases fuel, mass and drag, blocks absent-tank filling and attaches an empty replacement", async () => {
    const sdk = await boot("f-35b");
    expect(readExternalFuelTanks(sdk, "f-35b").map(tank => tank.attached)).toEqual([true, true]);
    const definitions = getExternalTankDefinitions("f-35b");
    for (const [store, definition] of definitions.entries()) {
      expect(sdk.getPropertyValue(`inertia/pointmass-weight-lbs[${store}]`)).toBe(definition.dryWeightLbs);
      expect(sdk.getPropertyValue(`propulsion/tank[${definition.index}]/z-position`)).toBe(definition.locationIn.z);
    }
    writeFuelTanks(sdk, new Map([[2, 1500], [3, 500]]));
    expect(sdk.runIc()).toBe(true);
    const loadedWeight = sdk.getPropertyValue("inertia/weight-lbs");
    const loadedDrag = -sdk.getPropertyValue("forces/fbx-external-lbs");
    expect(loadedDrag).toBeGreaterThan(0);
    expect(setExternalFuelTankAttached(sdk, "f-35b", 2, false)).toBe(true);
    expect(setExternalFuelTankAttached(sdk, "f-35b", 2, false)).toBe(false);
    writeFuelTanks(sdk, new Map([[2, 2991]]));
    expect(sdk.getPropertyValue("propulsion/tank[2]/contents-lbs")).toBe(0);
    expect(readFuelTanks(sdk)[2]).toMatchObject({ attached: false, capacityLbs: 2991, contentsLbs: 0 });
    expect(sdk.runIc()).toBe(true);
    expect(sdk.getPropertyValue("inertia/weight-lbs")).toBeCloseTo(loadedWeight - 1800, 6);
    expect(-sdk.getPropertyValue("forces/fbx-external-lbs")).toBeCloseTo(loadedDrag / 2, 6);
    expect(sdk.getPropertyValue("propulsion/tank[2]/priority")).toBe(0);
    // One remaining left store applies drag at its own lateral arm about the current CG.
    const leftArmFt = (definitions[1]!.locationIn.y - sdk.getPropertyValue("inertia/cg-y-in")) / 12;
    expect(sdk.getPropertyValue("moments/n-external-lbsft")).toBeLessThan(0);
    expect(sdk.getPropertyValue("moments/n-external-lbsft"))
      .toBeCloseTo(-leftArmFt * sdk.getPropertyValue("forces/fbx-external-lbs"), 6);

    // The native model also rejects fuel injected into a detached tank outside the host API.
    sdk.setPropertyValue("propulsion/tank[2]/contents-lbs", 1000);
    expect(sdk.run()).toBe(true);
    expect(sdk.getPropertyValue("propulsion/tank[2]/contents-lbs")).toBe(0);
    expect(setExternalFuelTankAttached(sdk, "f-35b", 2, true)).toBe(true);
    expect(readFuelTanks(sdk)[2]).toMatchObject({ attached: true, contentsLbs: 0 });
    writeFuelTanks(sdk, new Map([[2, 1000]]));
    expect(readFuelTanks(sdk)[2]!.contentsLbs).toBe(1000);
    expect(setExternalFuelTankAttached(sdk, "f-35b", 0, false)).toBe(false);
  });

  it("feeds the running engine from an attached external tank", async () => {
    const sdk = await boot("f-35b");
    writeFuelTanks(sdk, new Map([[0, 0], [1, 0], [2, 1000], [3, 0]]));
    for (let step = 0; step < 1 / FIXED_DT; step++) expect(sdk.run()).toBe(true);
    expect(readFuelTanks(sdk)[2]!.contentsLbs).toBeLessThan(1000);
    expect(sdk.getPropertyValue("propulsion/engine[0]/thrust-lbs")).toBeGreaterThan(0);
  });

  it("keeps attachment, fuel and pilot controls through recovery, relocation and a new session", async () => {
    const source = await boot("f-35b");
    setExternalFuelTankAttached(source, "f-35b", 2, false);
    writeFuelTanks(source, new Map([[0, 1200], [1, 1800], [3, 750]]));
    source.setPropertyValue("fcs/throttle-cmd-norm", 0.65);
    source.setPropertyValue("fcs/pitch-trim-cmd-norm", 0.04);
    source.setPropertyValue("fcs/control-law-mode", 1);
    const snapshot = captureSimulation(source);
    restoreSimulation(source, snapshot);
    expect(captureSimulation(source).controls).toEqual(snapshot.controls);
    resetFlightLocation(source, { latDeg: 35, lonDeg: -110, altMeters: 1500 }, 300, "f-35b");
    expect(readExternalFuelTanks(source, "f-35b").map(tank => tank.attached)).toEqual([false, true]);
    expect(readFuelTanks(source).map(tank => tank.contentsLbs)).toEqual([1200, 1800, 0, 750]);
    const saved = parseSavedFlight(JSON.stringify(captureSavedFlight(source, "f-35b", true)))!;
    expect(saved).not.toBeNull();
    const sdk = await boot("f-35b");
    applySavedControls(sdk, saved, "f-35b");
    expect(readExternalFuelTanks(sdk, "f-35b").map(tank => tank.attached)).toEqual([false, true]);
    restoreSavedFlight(sdk, saved, "f-35b", { groundHeightMeters: 0, altitudeMeters: saved.altMeters });
    expect(captureSimulation(sdk).controls).toEqual(saved.simulation.controls);
    expect(readFuelTanks(sdk).map(tank => tank.contentsLbs)).toEqual([1200, 1800, 0, 750]);
  });

  it("resumes an older save without attachment flags using attached empty-store defaults", async () => {
    const sdk = await boot("f-35b");
    const saved = captureSavedFlight(sdk, "f-35b", true)!;
    for (const path of Object.keys(saved.simulation.controls)) {
      if (path.startsWith("stores/")) delete saved.simulation.controls[path];
    }
    saved.simulation.controls["propulsion/tank[0]/contents-lbs"] = 6650;
    saved.simulation.controls["propulsion/tank[2]/contents-lbs"] = 500;
    restoreSavedFlight(sdk, saved, "f-35b", { groundHeightMeters: 0, altitudeMeters: saved.altMeters });
    expect(readExternalFuelTanks(sdk, "f-35b").map(tank => tank.attached)).toEqual([true, true]);
    expect(readFuelTanks(sdk).map(tank => tank.contentsLbs)).toEqual([6550, 2500, 500, 0]);
  });

  it.each(["departure", "arrival"] as const)("keeps a released tank absent on a runway %s reset", async mode => {
    const sdk = await boot("f-35b");
    writeFuelTanks(sdk, new Map([[0, 1000], [1, 2000], [2, 1500], [3, 500]]));
    setExternalFuelTankAttached(sdk, "f-35b", 2, false);
    resetFlightLocation(sdk, {
      latDeg: 35, lonDeg: -110, altMeters: mode === "departure" ? 300 : 1500,
      flightPreset: { mode, headingDeg: 90, groundElevationMeters: 300, flightPathDeg: mode === "departure" ? 0 : -3 },
    }, 300, "f-35b");
    expect(readExternalFuelTanks(sdk, "f-35b").map(tank => tank.attached)).toEqual([false, true]);
    expect(readFuelTanks(sdk).map(tank => tank.contentsLbs)).toEqual([1000, 2000, 0, 500]);
    expect(sdk.getPropertyValue("inertia/pointmass-weight-lbs[0]")).toBe(0);
    expect(sdk.getPropertyValue("inertia/pointmass-weight-lbs[1]")).toBe(300);
    expect(sdk.getPropertyValue("propulsion/tank[2]/priority")).toBe(0);
    writeFuelTanks(sdk, new Map([[2, 2991]]));
    expect(sdk.getPropertyValue("propulsion/tank[2]/contents-lbs")).toBe(0);
  });
});
