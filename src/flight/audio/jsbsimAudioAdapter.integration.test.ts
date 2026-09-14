// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { afterEach, describe, expect, it } from "vitest";
import type { AircraftId } from "../aircraft/aircraftIds";
import { bootstrapAircraft } from "../jsbsim/bootstrapC172";
import { getFdmProfile } from "../jsbsim/fdmProfiles";
import { resolveAircraftDataFiles } from "../jsbsim/hydrateJsbsimData";
import { AVAILABILITY } from "./audioSnapshot";
import { createJsbsimAudioAdapter, decideCombustion, toSnapshot } from "./jsbsimAudioAdapter";

/**
 * The adapter against the REAL packaged JSBSim and the shipped aircraft data:
 * the mapping and state rules are checked on the model the app flies.
 */

const instances: JSBSimSdk[] = [];
afterEach(() => { for (const sdk of instances.splice(0)) sdk.destroy(); });

async function boot(aircraftId: AircraftId): Promise<JSBSimSdk> {
  const sdk = await JSBSimSdk.create({
    moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false },
  });
  instances.push(sdk);
  const manifest: unknown = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8"));
  for (const path of resolveAircraftDataFiles(manifest, aircraftId)) {
    sdk.writeDataFile(path, readFileSync("public/jsbsim-data/" + path, "utf8"));
  }
  await bootstrapAircraft(sdk, aircraftId, {});
  return sdk;
}

function run(sdk: JSBSimSdk, seconds: number): void {
  for (let step = Math.round(seconds * 120); step > 0; step -= 1) {
    if (!sdk.run()) throw new Error("JSBSim step failed");
  }
}

const adapterFor = (sdk: JSBSimSdk, aircraftId: AircraftId) =>
  createJsbsimAudioAdapter(sdk, { gearHeightMetres: getFdmProfile(aircraftId).stance.staticMeters });

describe("JSBSim audio adapter on the real SF50 model", () => {
  it("finds every audio property in the catalog and places the engine from the model's geometry", async () => {
    const sdk = await boot("cirrus-vision-jet");
    const adapter = adapterFor(sdk, "cirrus-vision-jet");
    expect(adapter.diagnostics.missing).toEqual([]);
    expect(adapter.diagnostics.combustionSource).toBe("fuel-flow");
    // evidence/audio/sf50-geometry-2026-09-14.txt: engine (225, 0, 6) in, CG (159.56, 0, -39.12) in,
    // static stance 1.12 m. A geometric reading of the model, not a measured acoustic centre.
    const [x, y, z] = adapter.diagnostics.sourceOffset;
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo((6 + 39.12) * 0.0254 + 1.12, 2);
    expect(z).toBeCloseTo(-(225 - 159.56) * 0.0254, 2);
    adapter.dispose();
  });

  it("reads a running engine with every telemetry availability bit set, and no pose bit", async () => {
    const sdk = await boot("cirrus-vision-jet");
    const adapter = adapterFor(sdk, "cirrus-vision-jet");
    run(sdk, 0.5);
    const reading = adapter.read();
    const telemetry = AVAILABILITY.N1 | AVAILABILITY.N2 | AVAILABILITY.THRUST | AVAILABILITY.FUEL_FLOW
      | AVAILABILITY.COMBUSTION | AVAILABILITY.RUNNING | AVAILABILITY.COMMANDS
      | AVAILABILITY.AIRSPEED | AVAILABILITY.CONFIG;
    expect(reading.availability & telemetry).toBe(telemetry);
    expect(reading.availability & AVAILABILITY.POSE).toBe(0);
    expect(reading.simTimeS).toBeCloseTo(0.5, 6);
    expect(reading.n1Pct).toBeGreaterThan(20);
    expect(reading).toMatchObject({ combustion: true, running: true });
    expect(reading.soundSpeedMps).toBeGreaterThan(300);
    expect(reading.soundSpeedMps).toBeLessThan(350);
    adapter.dispose();
  });

  it("calls a fueled start burning while native running is still false (the recorded start trace)", async () => {
    const sdk = await boot("cirrus-vision-jet");
    const adapter = adapterFor(sdk, "cirrus-vision-jet");
    // Same procedure as evidence/audio/sf50-start-trace-2026-09-14.txt.
    sdk.setPropertyValue("fcs/throttle-cmd-norm", 0);
    sdk.setPropertyValue("propulsion/cutoff_cmd", 1);
    sdk.setPropertyValue("propulsion/engine[0]/set-running", 0);
    run(sdk, 0.5);
    sdk.setPropertyValue("propulsion/starter_cmd", 1);
    run(sdk, 2.5);
    let reading = adapter.read();
    // Motoring on the starter with cutoff commanded: rotating, not burning.
    expect(reading).toMatchObject({ starter: true, cutoff: true, combustion: false, running: false });
    expect(reading.fuelFlowPps).toBe(0);
    expect(reading.n2Pct).toBeGreaterThan(10);

    sdk.setPropertyValue("propulsion/cutoff_cmd", 0);
    run(sdk, 1);
    reading = adapter.read();
    expect(reading.fuelFlowPps).toBeGreaterThan(1e-4);
    expect(reading).toMatchObject({ cutoff: false, combustion: true, running: false });
    adapter.dispose();
  });

  it("drops combustion on the step fuel is cut while the shafts keep turning (shutdown)", async () => {
    const sdk = await boot("cirrus-vision-jet");
    const adapter = adapterFor(sdk, "cirrus-vision-jet");
    run(sdk, 1);
    expect(adapter.read()).toMatchObject({ combustion: true, running: true });
    sdk.setPropertyValue("propulsion/cutoff_cmd", 1);
    run(sdk, 0.5);
    const reading = adapter.read();
    expect(reading.fuelFlowPps).toBe(0);
    expect(reading).toMatchObject({ cutoff: true, combustion: false });
    // Coasting, not stopped: the rotating tones stay while the burner goes.
    expect(reading.n2Pct).toBeGreaterThan(5);
    adapter.dispose();
  });

  it("drops combustion when a start is aborted before native running latches", async () => {
    const sdk = await boot("cirrus-vision-jet");
    const adapter = adapterFor(sdk, "cirrus-vision-jet");
    sdk.setPropertyValue("fcs/throttle-cmd-norm", 0);
    sdk.setPropertyValue("propulsion/cutoff_cmd", 1);
    sdk.setPropertyValue("propulsion/engine[0]/set-running", 0);
    run(sdk, 0.5);
    sdk.setPropertyValue("propulsion/starter_cmd", 1);
    run(sdk, 2.5);
    sdk.setPropertyValue("propulsion/cutoff_cmd", 0);
    run(sdk, 1);
    expect(adapter.read()).toMatchObject({ combustion: true, running: false });
    sdk.setPropertyValue("propulsion/cutoff_cmd", 1);
    run(sdk, 0.25);
    const reading = adapter.read();
    expect(reading.fuelFlowPps).toBe(0);
    expect(reading).toMatchObject({ combustion: false, running: false });
    adapter.dispose();
  });

  it("releases its property batch once and reads nothing afterwards", async () => {
    const sdk = await boot("cirrus-vision-jet");
    const adapter = adapterFor(sdk, "cirrus-vision-jet");
    run(sdk, 0.25);
    const before = adapter.read().simTimeS;
    adapter.dispose();
    adapter.dispose();
    run(sdk, 0.25);
    expect(adapter.read().simTimeS).toBe(before);
  });
});

describe("JSBSim audio adapter on a model without a turbofan", () => {
  it("marks absent engine properties unavailable instead of reading JSBSim's zero", async () => {
    const sdk = await boot("cessna-172");
    const adapter = adapterFor(sdk, "cessna-172");
    run(sdk, 0.1);
    const reading = adapter.read();
    expect(adapter.diagnostics.missing).toEqual(
      expect.arrayContaining(["propulsion/engine[0]/n1", "propulsion/engine[0]/n2"]));
    expect(reading.availability & AVAILABILITY.N1).toBe(0);
    expect(reading.availability & AVAILABILITY.N2).toBe(0);
    adapter.dispose();
  });
});

describe("combustion decision", () => {
  it.each([
    ["fuel burning while running is false", { fuelFlowAvailable: true, fuelFlowPps: 0.0103, runningAvailable: true, running: false }, true, "fuel-flow"],
    ["no fuel, not running", { fuelFlowAvailable: true, fuelFlowPps: 0, runningAvailable: true, running: false }, false, "fuel-flow"],
    ["non-finite fuel but running", { fuelFlowAvailable: true, fuelFlowPps: Number.NaN, runningAvailable: true, running: true }, true, "fuel-flow"],
    ["running flag only", { fuelFlowAvailable: false, fuelFlowPps: 0, runningAvailable: true, running: true }, true, "running-only"],
    ["no signal at all", { fuelFlowAvailable: false, fuelFlowPps: 0, runningAvailable: false, running: true }, false, "unavailable"],
  ] as const)("%s", (_name, input, combustion, source) => {
    expect(decideCombustion(input)).toEqual({ combustion, source });
  });

  it("adds the pose bit only for a valid pose", () => {
    const reading = {
      simTimeS: 1, availability: AVAILABILITY.N1, n1Pct: 30, n2Pct: 60, thrustLbf: 0, fuelFlowPps: 0,
      throttleNorm: 0, combustion: false, running: false, starter: false, cutoff: true, kias: 0,
      gearNorm: 1, flapNorm: 0, velocity: [0, 0, 0] as [number, number, number], soundSpeedMps: 340,
    };
    const pose = {
      sequence: 4, epoch: 2, source: [1, 2, 3] as const, sourceVelocity: [0, 0, 0] as const,
      listenerVelocity: [0, 0, 0] as const, exterior: 1, groundReflectionM: 5,
    };
    expect(toSnapshot(reading, { ...pose, poseValid: true }).availability).toBe(AVAILABILITY.N1 | AVAILABILITY.POSE);
    expect(toSnapshot(reading, { ...pose, poseValid: false }))
      .toMatchObject({ availability: AVAILABILITY.N1, epoch: 2, sequence: 4, soundSpeedMps: 340 });
  });
});
