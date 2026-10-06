// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { FreeCamera, NullEngine, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapAircraft } from "../jsbsim/bootstrapC172";
import { createEngineControl } from "../jsbsim/engineControl";
import { getFdmProfile } from "../jsbsim/fdmProfiles";
import { resolveAircraftDataFiles } from "../jsbsim/hydrateJsbsimData";
import { getAircraftAudioInstallation, getAircraftAudioProfile, resolveAircraftAudioInstallation } from "./aircraftAudioProfiles";
import { AVAILABILITY } from "./audioSnapshot";
import { computeListenerPose, createListenerPose } from "./audioPose";
import { createDspHarness, peak, rms, TIER } from "./dspHarness";
import { createJsbsimAudioAdapter, toSnapshot, type AudioAdapter, type AudioAdapterReading } from "./jsbsimAudioAdapter";

const profile = getAircraftAudioProfile("f-35b")!;
const admission = resolveAircraftAudioInstallation(getAircraftAudioInstallation("f-35b"));
if (!admission.supported) throw new Error(admission.reason);
const source = admission.source;
const stance = getFdmProfile("f-35b").stance.staticMeters;
const instances: JSBSimSdk[] = [];
const adapters: AudioAdapter[] = [];
const sceneEngines: NullEngine[] = [];
afterEach(() => {
  for (const adapter of adapters.splice(0)) adapter.dispose();
  for (const sdk of instances.splice(0)) sdk.destroy();
  for (const engine of sceneEngines.splice(0)) engine.dispose();
});

async function boot(throttleNorm = 0.48, engineRunning = true) {
  const sdk = await JSBSimSdk.create({
    moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false },
  });
  instances.push(sdk);
  const manifest: unknown = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8"));
  for (const file of resolveAircraftDataFiles(manifest, "f-35b")) sdk.writeDataFile(file, readFileSync("public/jsbsim-data/" + file, "utf8"));
  await bootstrapAircraft(sdk, "f-35b", { throttleNorm, engineRunning,
    ...(engineRunning ? {} : { airspeedKts: 0, altFt: 1000 }) });
  const adapter = createJsbsimAudioAdapter(sdk, { gearHeightMetres: stance, source });
  adapters.push(adapter);
  return { sdk, adapter };
}

function run(sdk: JSBSimSdk, seconds: number) {
  for (let step = 0; step < Math.round(seconds * 120); step++) expect(sdk.run()).toBe(true);
}

async function renderEngine(sampleRate: number, tier: number, throttleNorm = 0.48) {
  const { sdk, adapter } = await boot(throttleNorm);
  const engine = new NullEngine();
  sceneEngines.push(engine);
  const scene = new Scene(engine);
  const aircraft = new TransformNode("f35-aircraft", scene);
  const camera = new FreeCamera("chase-listener", new Vector3(0, stance, -15), scene);
  camera.setTarget(new Vector3(0, stance, 0));
  const reading = adapter.read();
  const pose = computeListenerPose({
    camera, aircraftRoot: aircraft, sourceOffset: adapter.diagnostics.sourceOffset,
    velocityWorld: reading.velocity, sourceAxis: reading.sourceAxis, exterior: 1, heightAboveGroundM: null,
  }, createListenerPose());
  expect(pose.valid).toBe(true);
  const core = await createDspHarness({ sampleRate });
  core.setProfile(profile);
  core.exports.osfs_audio_set_tier(tier);
  core.exports.osfs_audio_set_gains(1, 1, 0, 0, 0); // Main engine alone, no tire or airframe proxy.
  core.anchor(1, reading.simTimeS);
  let nextTelemetry = 0;
  let sequence = 0;
  const output = core.renderSeconds(1.2, frame => {
    const time = frame / sampleRate;
    if (time + 1e-9 < nextTelemetry) return;
    while (sdk.getSimTime() < time - 1e-9) expect(sdk.run()).toBe(true);
    const current = adapter.read();
    core.pushSnapshot(toSnapshot(current, {
      sequence: sequence++, epoch: 1, source: pose.source,
      sourceVelocity: pose.sourceVelocity, listenerVelocity: pose.listenerVelocity,
      exterior: pose.exterior, groundReflectionM: pose.groundReflectionM, poseValid: pose.valid,
      sourceAxis: pose.sourceAxis, sourceAxisValid: pose.sourceAxisValid,
    }));
    nextTelemetry += 1 / 60;
  });
  return { output, stats: core.stats() };
}

describe("F-35B procedural sound (real JSBSim and shipped DSP, no physical route qualification)", () => {
  it("separates native cold-start motoring from lightoff in every sound tier", async () => {
    const { sdk, adapter } = await boot(0, false);
    const control = createEngineControl(sdk, getFdmProfile("f-35b"));
    const captured: Partial<Record<"firstRotation" | "motoring" | "lightoff" | "running", AudioAdapterReading>> = {};
    for (let step = 0; step < 40 * 120; step++) {
      control.step(true);
      expect(sdk.run()).toBe(true);
      const reading = adapter.read();
      if (reading.n2Pct > 0 && !captured.firstRotation) captured.firstRotation = { ...reading };
      if (reading.n2Pct >= 10 && !reading.combustion && !captured.motoring) captured.motoring = { ...reading };
      if (reading.combustion && !captured.lightoff) captured.lightoff = { ...reading };
      if (reading.running) { captured.running = { ...reading }; break; }
    }
    expect(captured.firstRotation).toMatchObject({ running: false, combustion: false, fuelFlowPps: 0, thrustLbf: 0 });
    expect(captured.firstRotation!.n2Pct).toBeLessThan(0.1);
    expect(captured.motoring).toMatchObject({ running: false, combustion: false, fuelFlowPps: 0, thrustLbf: 0 });
    expect(captured.lightoff).toMatchObject({ running: false, combustion: true });
    expect(captured.lightoff!.fuelFlowPps).toBeGreaterThan(1e-4);
    expect(captured.running).toMatchObject({ running: true, combustion: true });
    expect(adapter.diagnostics.combustionSource).toBe("fuel-flow");

    for (const tier of [TIER.low, TIER.med, TIER.high]) {
      const levels: number[] = [];
      for (const reading of [captured.firstRotation!, captured.motoring!, captured.lightoff!, captured.running!]) {
        const core = await createDspHarness();
        core.setProfile(profile);
        core.exports.osfs_audio_set_tier(tier);
        core.exports.osfs_audio_set_gains(1, 1, 0, 0, 0);
        core.anchor(1, 0);
        let next = 0, sequence = 0;
        const output = core.renderSeconds(0.8, frame => {
          while (next <= frame / core.sampleRate + 0.1) {
            core.pushSnapshot(toSnapshot({ ...reading, simTimeS: next }, {
              sequence: ++sequence, epoch: 1, source: [0, 0, -1], sourceVelocity: [0, 0, 0],
              listenerVelocity: [0, 0, 0], exterior: 1, groundReflectionM: -1, poseValid: true,
            }));
            next += 1 / 60;
          }
        });
        const tail = output.left.subarray(24_000);
        expect(tail.every(Number.isFinite)).toBe(true);
        levels.push(rms(tail));
        if (reading === captured.firstRotation) expect(peak(tail)).toBeLessThan(1e-4);
      }
      expect(levels[1]).toBeGreaterThan(levels[0] * 100);
      expect(levels[2]).toBeGreaterThan(levels[1]);
      expect(levels[3]).toBeGreaterThan(levels[1] * 4);
    }
  });

  it("observes only the main F135 and places its source at the installed nozzle force point", async () => {
    const { sdk, adapter } = await boot();
    expect(adapter.diagnostics.profile?.id).toBe("f135-approximation");
    expect(adapter.diagnostics).toMatchObject({ engineIndex: 0, sourceId: "main-exhaust", telemetryAvailable: true });
    expect(adapter.diagnostics.missing).toEqual([]);
    const [left, up, forward] = adapter.diagnostics.sourceOffset;
    expect(left).toBeCloseTo(0, 8);
    expect(up).toBeCloseTo(stance, 8);
    expect(forward).toBeCloseTo(-(544.28127087 - 368.52) * 0.0254, 8);
    sdk.setPropertyValue("fcs/stovl-cmd-norm", 1);
    sdk.setPropertyValue("fcs/stovl-pos-norm", 1);
    sdk.setPropertyValue("fcs/throttle-cmd-norm", 0.98);
    expect(sdk.runIc()).toBe(true);
    sdk.setPropertyValue("propulsion/set-running", -1);
    sdk.setPropertyValue("fcs/throttle-cmd-norm", 0.98);
    expect(sdk.runIc()).toBe(true);
    const reading = adapter.read();
    expect(reading.availability & AVAILABILITY.N1).toBe(AVAILABILITY.N1);
    expect(reading.thrustLbf).toBe(sdk.getPropertyValue("propulsion/engine[0]/thrust-lbs"));
    expect(reading.fuelFlowPps).toBe(sdk.getPropertyValue("propulsion/engine[0]/fuel-flow-rate-pps"));
    const auxiliaryThrust = [1, 2, 3].reduce((sum, index) => sum + sdk.getPropertyValue(`propulsion/engine[${index}]/thrust-lbs`), 0);
    expect(auxiliaryThrust).toBeGreaterThan(1000);
    // Leave zero-time engine initialization before issuing a shutdown, as in
    // the SF50 shutdown fixture. Audio observes the resulting native state.
    run(sdk, 0.1);
    sdk.setPropertyValue("propulsion/active_engine", -1);
    sdk.setPropertyValue("propulsion/cutoff_cmd", 1);
    run(sdk, 0.5);
    const cutoff = adapter.read();
    expect(cutoff).toMatchObject({ running: false, thrustLbf: 0 });
    // The global command getter aggregates the main engine and three lift
    // force surrogates; it is not a main-engine cutoff observer.
    expect(cutoff.availability & AVAILABILITY.COMMANDS).toBe(0);
    // Native Off() seeks fuel flow down at 10,000 lbm/h/s. At F135-scale
    // flow it takes several seconds; the audio adapter does not mask that
    // FDM state or substitute a fabricated immediate zero.
    run(sdk, 3);
    expect(adapter.read()).toMatchObject({ combustion: false, fuelFlowPps: 0 });
  });

  it.each([[44_100, TIER.low], [44_100, TIER.med], [44_100, TIER.high],
    [48_000, TIER.low], [48_000, TIER.med], [48_000, TIER.high]])(
    "renders finite non-silent main-engine audio at %s Hz, tier %s", async (sampleRate, tier) => {
      const { output, stats } = await renderEngine(sampleRate, tier);
      expect(output.left.every(Number.isFinite)).toBe(true);
      expect(output.right.every(Number.isFinite)).toBe(true);
      expect(rms(output.left, sampleRate / 2)).toBeGreaterThan(1e-4);
      expect(rms(output.right, sampleRate / 2)).toBeGreaterThan(1e-4);
      expect(stats.nonFinite).toBe(0);
      expect(stats.staleFades).toBe(0);
      expect(stats.partials).toBe(tier === TIER.low ? 4 : 12);
    },
  );

  it("responds to main-engine power without saturating at the SF50 reference thrust", async () => {
    const idle = await renderEngine(48_000, TIER.med, 0);
    const powered = await renderEngine(48_000, TIER.med, 0.8);
    expect(rms(powered.output.left, 24_000)).toBeGreaterThan(rms(idle.output.left, 24_000) * 1.2);
  });

  it("leaves the C172 without turbine sound", () => {
    expect(getAircraftAudioProfile("cessna-172")).toBeUndefined();
  });

  it("reads genuine main augmentation through dry, afterburning, converted and cutoff states", async () => {
    const { sdk, adapter } = await boot(1);
    run(sdk, 0.1);
    let reading = adapter.read();
    expect(reading.availability & AVAILABILITY.AUGMENTATION).toBe(AVAILABILITY.AUGMENTATION);
    expect(reading.augmentation).toBe(true);
    expect(sdk.getPropertyValue("propulsion/engine[0]/augmentation")).toBe(1);
    expect(reading.thrustLbf).toBe(sdk.getPropertyValue("propulsion/engine[0]/thrust-lbs"));
    sdk.setPropertyValue("fcs/throttle-cmd-norm", 0.98);
    run(sdk, 0.1);
    expect(adapter.read().augmentation).toBe(false);
    sdk.setPropertyValue("fcs/throttle-cmd-norm", 1);
    sdk.setPropertyValue("fcs/stovl-cmd-norm", 1);
    run(sdk, 3);
    expect(sdk.getPropertyValue("fcs/stovl-pos-norm")).toBeCloseTo(1, 8);
    // The physical FCS prevents AB while conversion is deployed; audio reads
    // that native result, without reproducing the command mask.
    expect(adapter.read().augmentation).toBe(false);
    const convertedAxis = adapter.read().sourceAxis!;
    expect(convertedAxis[1]).toBeLessThan(-0.95);
    expect(Math.hypot(...convertedAxis)).toBeCloseTo(1, 8);
    sdk.setPropertyValue("fcs/stovl-cmd-norm", 0);
    run(sdk, 3);
    expect(adapter.read().augmentation).toBe(true);
    expect(adapter.read().sourceAxis![2]).toBeCloseTo(-1, 6);
    sdk.setPropertyValue("propulsion/cutoff_cmd", 1);
    run(sdk, 0.1);
    reading = adapter.read();
    expect(reading.augmentation).toBe(false);
    expect(reading.fuelFlowPps).toBe(sdk.getPropertyValue("propulsion/engine[0]/fuel-flow-rate-pps"));
  });
});
