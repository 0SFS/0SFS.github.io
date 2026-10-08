// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapAircraft } from "./bootstrapC172";
import { ENGINE_MODEL_IDS, getFdmProfile, type EngineModelId } from "./fdmProfiles";
import { resolveAircraftDataFiles } from "./hydrateJsbsimData";
import { captureSavedFlight, parseSavedFlight, restoreSavedFlight } from "./savedFlight";
import { readFlightState } from "../bridge/ecefBridge";
import { createAircraftForceReader } from "../diagnostics/aircraftForces";
import { discoverReadableProperties, ENGINE_SECTIONS } from "../hud/engineMonitorModel";
import { validFlightState } from "../physics/safeFlightState";

// The F-35B's two engine models, each through the app's own consumers of it.
const instances: JSBSimSdk[] = [];
afterEach(() => { for (const sdk of instances.splice(0)) sdk.destroy(); });

const manifest: unknown = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8"));

async function boot(engineModel: EngineModelId, options: Parameters<typeof bootstrapAircraft>[2] = {}) {
  const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false } });
  instances.push(sdk);
  const profile = getFdmProfile("f-35b", engineModel);
  for (const file of resolveAircraftDataFiles(manifest, profile.dataPackage ?? "f-35b")) {
    sdk.writeDataFile(file, readFileSync("public/jsbsim-data/" + file, "utf8"));
  }
  await bootstrapAircraft(sdk, "f-35b", { ...options, engineModel });
  return { sdk, profile };
}

const engineCount = (sdk: JSBSimSdk) => sdk.queryPropertyCatalog("propulsion/engine").split(/\r?\n/)
  .filter(line => /^propulsion\/engine(?:\[\d+\])?\/thrust-lbs\s/.test(line.trim())).length;
const plantRows = ENGINE_SECTIONS.find(section => section.id === "plant")!.rows;

describe.each(ENGINE_MODEL_IDS)("the F-35B's %s engine model", engineModel => {
  it("loads its own engine layout, which Debug → Forces and the engine monitor read in full", async () => {
    const { sdk, profile } = await boot(engineModel);
    const plant = engineModel === "plant";
    // One engine whose plant drives the lift fan and posts, or the main engine and three force carriers.
    expect(sdk.getPropertyValue("propulsion/engine/thrust-lbs")).toBeGreaterThan(1000);
    expect(Object.keys(profile.forceEngineLabels!).map(Number)).toEqual(plant ? [0] : [0, 1, 2, 3]);
    expect(engineCount(sdk)).toBe(plant ? 1 : 4);
    const readable = new Set(discoverReadableProperties(sdk));
    expect(plantRows.filter(row => readable.has(row.path)).map(row => row.label))
      .toEqual(plant ? plantRows.map(row => row.label) : []);
    const forces = createAircraftForceReader(sdk, profile.forceEngineLabels, [], profile.forceExternalForces).read();
    expect(forces.unavailable).toEqual([]);
  });
});

describe("switching the F-35B's engine model", () => {
  it.each([["plant", "empirical"], ["empirical", "plant"]] as const)("resumes a flight saved under %s under %s", async (from, to) => {
    const first = await boot(from, { throttleNorm: 0.7 });
    for (let step = 0; step < 240; step++) expect(first.sdk.run()).toBe(true);
    const before = readFlightState(first.sdk);
    const saved = parseSavedFlight(JSON.stringify(captureSavedFlight(first.sdk, "f-35b", false)))!;

    // The reload that flies the other engine model starts elsewhere, on its defaults.
    const second = await boot(to, { latDeg: 10, lonDeg: 20, throttleNorm: 0.4 });
    const after = restoreSavedFlight(second.sdk, saved, "f-35b", {
      groundHeightMeters: 0, altitudeMeters: saved.aboveGroundMeters ?? saved.altMeters,
    });
    expect(validFlightState(after)).toBe(true);
    expect(after.latDeg).toBeCloseTo(before.latDeg, 7);
    expect(after.lonDeg).toBeCloseTo(before.lonDeg, 7);
    expect(after.airspeedKts).toBeCloseTo(before.airspeedKts, 0);
    expect(second.sdk.getPropertyValue("fcs/throttle-cmd-norm")).toBeCloseTo(0.7, 6);
    expect(second.sdk.getPropertyValue("propulsion/engine/set-running")).toBe(1);
    for (let step = 0; step < 120; step++) expect(second.sdk.run()).toBe(true);
    expect(validFlightState(readFlightState(second.sdk))).toBe(true);
    expect(second.sdk.getPropertyValue("propulsion/engine/thrust-lbs")).toBeGreaterThan(1000);
    if (to === "plant") expect(second.sdk.getPropertyValue("propulsion/engine/plant/numerics/failure")).toBe(0);
  });
});
