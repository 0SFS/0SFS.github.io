// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapAircraft } from "../jsbsim/bootstrapC172";
import { resolveAircraftDataFiles } from "../jsbsim/hydrateJsbsimData";
import { deriveEnginePhase, discoverReadableProperties, ENGINE_PATHS, readEngineSample } from "./engineMonitorModel";

/**
 * The monitor's derived phase against the REAL packaged JSBSim SF50: the
 * labels must describe what the flight model is actually doing.
 */

const instances: JSBSimSdk[] = [];
afterEach(() => { for (const sdk of instances.splice(0)) sdk.destroy(); });

async function bootSf50(): Promise<JSBSimSdk> {
  const sdk = await JSBSimSdk.create({
    moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl, persistence: { enabled: false }, log: { console: false },
  });
  instances.push(sdk);
  const manifest: unknown = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8"));
  for (const path of resolveAircraftDataFiles(manifest, "cirrus-vision-jet")) {
    sdk.writeDataFile(path, readFileSync(`public/jsbsim-data/${path}`, "utf8"));
  }
  await bootstrapAircraft(sdk, "cirrus-vision-jet", {});
  return sdk;
}

function run(sdk: JSBSimSdk, seconds: number): void {
  for (let step = Math.round(seconds * 120); step > 0; step -= 1) {
    if (!sdk.run()) throw new Error("JSBSim step failed");
  }
}

describe("engine monitor phase on the real SF50 model", () => {
  it("finds every property its summary and phase rules read, and none that are write-only", async () => {
    const sdk = await bootSf50();
    const available = new Set(discoverReadableProperties(sdk));
    for (const [key, path] of Object.entries(ENGINE_PATHS)) {
      // Crankshaft speed belongs to piston engines only.
      if (key !== "rpm") expect(available.has(path), path).toBe(true);
    }
    expect(available.has("propulsion/set-running")).toBe(false);
  });

  it("follows a cold start: windmilling, motoring, starting while running is false, then running", async () => {
    const sdk = await bootSf50();
    const available = new Set(discoverReadableProperties(sdk));
    const phase = () => deriveEnginePhase(readEngineSample(sdk, available)).phase;
    expect(phase()).toBe("running");

    sdk.setPropertyValue("fcs/throttle-cmd-norm", 0);
    sdk.setPropertyValue("propulsion/cutoff_cmd", 1);
    sdk.setPropertyValue("propulsion/engine[0]/set-running", 0);
    run(sdk, 0.5);
    expect(phase()).toBe("windmilling");

    sdk.setPropertyValue("propulsion/starter_cmd", 1);
    run(sdk, 2.5);
    expect(phase()).toBe("motoring");

    sdk.setPropertyValue("propulsion/cutoff_cmd", 0);
    run(sdk, 1);
    expect(phase()).toBe("starting");

    let seconds = 0;
    while (phase() !== "running" && seconds < 40) {
      run(sdk, 0.5);
      seconds += 0.5;
    }
    expect(phase()).toBe("running");
  }, 60_000);

  it("lets a stopped engine's spools settle toward airspeed, as JSBSim's Off() does", async () => {
    const sdk = await bootSf50();
    const available = new Set(discoverReadableProperties(sdk));
    sdk.setPropertyValue("propulsion/cutoff_cmd", 1);
    sdk.setPropertyValue("propulsion/engine[0]/set-running", 0);
    run(sdk, 10);
    const sample = readEngineSample(sdk, available);
    expect(deriveEnginePhase(sample).phase).toBe("windmilling");
    const target = sample.qbarPsf! / 10;
    expect(sample.n1Pct!).toBeGreaterThan(target * 0.5);
    expect(sample.n1Pct!).toBeLessThan(target * 2 + 1);
  }, 60_000);
});
