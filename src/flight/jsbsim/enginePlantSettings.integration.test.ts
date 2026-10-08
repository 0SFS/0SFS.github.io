// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { afterEach, describe, expect, it } from "vitest";
import type { AircraftId } from "../aircraft/aircraftIds";
import { bootstrapAircraft } from "./bootstrapC172";
import { applyEnginePlantSettings, enginePlantSettingsPrefixes, readEnginePlantSettings } from "./enginePlantSettings";
import { resolveAircraftDataFiles } from "./hydrateJsbsimData";
import { flightParameterDefaults } from "../settings/flightParameters";
import { FIXED_DT } from "../physics/fixedStepLoop";

const instances: JSBSimSdk[] = [];
afterEach(() => { for (const sdk of instances.splice(0)) sdk.destroy(); });

async function boot(aircraftId: AircraftId) {
  const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false } });
  instances.push(sdk);
  const manifest: unknown = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8"));
  for (const file of resolveAircraftDataFiles(manifest, aircraftId)) sdk.writeDataFile(file, readFileSync("public/jsbsim-data/" + file, "utf8"));
  await bootstrapAircraft(sdk, aircraftId);
  return sdk;
}

const defaults = readEnginePlantSettings(flightParameterDefaults());

describe("coupled engine plant compute settings", () => {
  it("defaults to what JSBSim's plant itself defaults to", async () => {
    const sdk = await boot("f-35b");
    const [prefix] = enginePlantSettingsPrefixes(sdk);
    expect(enginePlantSettingsPrefixes(sdk)).toHaveLength(1);
    expect({
      algorithm: sdk.getPropertyValue(prefix + "algorithm") === 0 ? "component" : "reduced",
      iterationCap: sdk.getPropertyValue(prefix + "iteration-cap"),
      subdivisionCap: sdk.getPropertyValue(prefix + "subdivision-cap"),
      tolerance: sdk.getPropertyValue(prefix + "tolerance"),
      closureBudgetKiB: sdk.getPropertyValue(prefix + "closure-budget-bytes") / 1024,
    }).toEqual(defaults);
  });

  it("applies every setting to the F135 and steps with the component reference", async () => {
    const sdk = await boot("f-35b");
    const settings = { algorithm: "component" as const, iterationCap: 32, subdivisionCap: 8, tolerance: 1e-8, closureBudgetKiB: 128 };
    expect(applyEnginePlantSettings(sdk, settings)).toEqual([settings]);
    for (let step = 0; step < 0.5 / FIXED_DT; step++) expect(sdk.run()).toBe(true);
    const plant = enginePlantSettingsPrefixes(sdk)[0]!.replace(/settings\/$/, "");
    expect(sdk.getPropertyValue(plant + "numerics/algorithm")).toBe(0);
    expect(sdk.getPropertyValue(plant + "numerics/failure")).toBe(0);
    // An out-of-range value is refused by the engine and the last valid one kept.
    expect(applyEnginePlantSettings(sdk, { ...settings, iterationCap: 99 })).toEqual([settings]);
  });

  it("leaves aircraft with empirical engines untouched", async () => {
    const sdk = await boot("cessna-172");
    expect(enginePlantSettingsPrefixes(sdk)).toEqual([]);
    expect(applyEnginePlantSettings(sdk, defaults)).toEqual([]);
    expect(sdk.getPropertyCatalog().some(line => line.includes("/plant/"))).toBe(false);
  });
});
