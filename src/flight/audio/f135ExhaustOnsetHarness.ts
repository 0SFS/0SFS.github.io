// Node-only validation: 0sfs owns this aircraft audio/optics integration harness.
import { readFileSync } from "node:fs";
import { LoadAssetContainerAsync, NullEngine, Scene } from "@babylonjs/core";
import "@babylonjs/loaders/glTF/index.js";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { bindEngineGasSupport, F135_ENGINE_GAS_SUPPORT } from "../aircraft/engineGasSupport";
import { evaluateEngineGasOptics, type EngineGasOpticalInputs } from "../aircraft/engineGasOptics";
import { bindEngineNozzleRig } from "../aircraft/engineNozzleRig";
import { F135_ENGINE_GEOMETRY } from "../aircraft/generated/f135EngineData";
import { f135ExhaustOpticalData } from "../aircraft/generated/f135ExhaustOpticalData";
import { bootstrapAircraft } from "../jsbsim/bootstrapC172";
import { createEngineControl } from "../jsbsim/engineControl";
import { getFdmProfile } from "../jsbsim/fdmProfiles";
import { resolveAircraftDataFiles } from "../jsbsim/hydrateJsbsimData";
import { getAircraftAudioInstallation, getAircraftAudioProfile, resolveAircraftAudioInstallation } from "./aircraftAudioProfiles";
import { createDspHarness, difference, rms, type DspHarness } from "./dspHarness";
import { createJsbsimAudioAdapter, toSnapshot, type AudioAdapterReading } from "./jsbsimAudioAdapter";

export interface F135OnsetObservation {
  timeSeconds: number;
  reading: AudioAdapterReading;
  opticalInput: EngineGasOpticalInputs;
  linerTemperatureKelvin: number;
  /** Evaluated native dry tables at the same N2, atmosphere and bleed. Diagnostic only. */
  referenceDryThrustLbf: number;
}

export interface F135OnsetTrace {
  name: "cold-first-running" | "cold-then-hot-dry" | "warm-running-shortcut";
  before: F135OnsetObservation;
  observations: F135OnsetObservation[];
  firstSelected: F135OnsetObservation;
  firstBurned: F135OnsetObservation;
}

/** Actual installed native engine and authored flow support; NullEngine draws nothing. */
export async function captureF135Onset(name: F135OnsetTrace["name"]): Promise<F135OnsetTrace> {
  const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false } });
  const engine = new NullEngine();
  let adapter: ReturnType<typeof createJsbsimAudioAdapter> | undefined;
  try {
    const manifest: unknown = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8"));
    for (const file of resolveAircraftDataFiles(manifest, "f-35b"))
      sdk.writeDataFile(file, readFileSync("public/jsbsim-data/" + file, "utf8"));
    const cold = name !== "warm-running-shortcut";
    await bootstrapAircraft(sdk, "f-35b", { engineRunning: !cold, holdDown: true,
      latDeg: 0, lonDeg: 0, altFt: 0, airspeedKts: 0, throttleNorm: .99 });
    const step = (): void => { if (!sdk.run()) throw new Error("Native F135 step failed"); };
    if (cold) {
      const control = createEngineControl(sdk, getFdmProfile("f-35b"));
      for (let i = 0; i < 60 * 120; i++) {
        control.step(true); step();
        if (sdk.getPropertyValue("propulsion/engine/set-running")) break;
      }
      if (!sdk.getPropertyValue("propulsion/engine/set-running")) throw new Error("Cold engine did not start");
    }
    const settleSeconds = name === "cold-then-hot-dry" ? 120 : cold ? 0 : 5;
    for (let i = 0; i < settleSeconds * 120; i++) step();
    const admission = resolveAircraftAudioInstallation(getAircraftAudioInstallation("f-35b"));
    if (!admission.supported) throw new Error(admission.reason);
    adapter = createJsbsimAudioAdapter(sdk, { gearHeightMetres: getFdmProfile("f-35b").stance.staticMeters,
      source: admission.source });
    const scene = new Scene(engine); scene.useRightHandedSystem = true;
    const g = F135_ENGINE_GEOMETRY;
    const container = await LoadAssetContainerAsync(new Uint8Array(readFileSync("public/" + g.assets[0].path)),
      scene, { pluginExtension: ".glb" });
    container.addAllToScene();
    const nodes = container.transformNodes.concat(container.meshes);
    const root = nodes.find(node => node.name === "F135_Engine");
    if (!root) throw new Error("Missing F135 authored engine root");
    root.position.setAll(0);
    const rig = bindEngineNozzleRig(nodes, { bearingNames: ["F135_Bearing1", "F135_Bearing2", "F135_Bearing3"],
      bearingInclinationRad: g.bearingTiltDegrees * Math.PI / 180, apertureMechanism: g.aperture });
    const binding = bindEngineGasSupport(root, F135_ENGINE_GAS_SUPPORT);
    const xml = readFileSync("public/jsbsim-data/aircraft/F-35B-jsbsim/Engines/F135-PW-600.xml", "utf8");
    const scalar = (tag: string): number => {
      const value = Number(new RegExp(`<${tag}>\\s*([^<]+)\\s*</${tag}>`).exec(xml)?.[1]);
      if (!Number.isFinite(value)) throw new Error("Missing native fixture scalar " + tag);
      return value;
    };
    const milThrust = scalar("milthrust"), idleN2 = scalar("idlen2"), maxN2 = scalar("maxn2");
    const get = (property: string): number => sdk.getPropertyValue(property);
    const read = (timeSeconds: number): F135OnsetObservation => {
      const reading = { ...adapter!.read() };
      rig.update(get("fcs/nozzle-pitch-rad"), get("fcs/nozzle-yaw-rad"), get("propulsion/engine/nozzle-pos-norm"));
      const support = binding.update(rig.apertureGeometry, 6, f135ExhaustOpticalData.gasEmission.spatialField.spreadingSlope);
      const idleThrust = milThrust * get("propulsion/engine/IdleThrust");
      const dryIncrement = (milThrust - idleThrust) * get("propulsion/engine/MilThrust");
      const n2Norm = (reading.n2Pct - idleN2) / (maxN2 - idleN2);
      return { timeSeconds, reading, linerTemperatureKelvin: get("propulsion/engine/thermal/metal-temperature-k"),
        referenceDryThrustLbf: (idleThrust + dryIncrement * n2Norm ** 2) * (1 - get("propulsion/engine/bleed-factor")),
        opticalInput: { temperatureKelvin: get("propulsion/engine/thermal/nozzle-gas-temperature-k"),
          upstreamGasTemperatureKelvin: get("propulsion/engine/egt-degc") + 273.15,
          ambientTemperatureKelvin: get("atmosphere/T-R") * 5 / 9,
          ambientPressurePascal: get("atmosphere/P-psf") * 47.88025898033584,
          augmentation: reading.augmentation, fuelFlowKgPerSecond: reading.fuelFlowPps * .45359237,
          afterburnerBurnedFuelFlowKgPerSecond: reading.afterburnerBurnedFuelFlowKgSec,
          radiusMeters: rig.apertureGeometry.exitRadius, lengthMeters: 6, flowDomain: support.flowDomain } };
    };
    const before = read(-1 / 120), observations: F135OnsetObservation[] = [];
    sdk.setPropertyValue("fcs/throttle-cmd-norm", 1);
    for (let i = 0; i <= 12 * 120; i++) { step(); observations.push(read(i / 120)); }
    const firstSelected = observations.find(row => row.reading.augmentation);
    const firstBurned = observations.find(row => row.reading.afterburnerBurnedFuelFlowKgSec! > 0);
    if (!firstSelected || !firstBurned) throw new Error("Bounded native AB capture missed selection or burning");
    return { name, before, observations, firstSelected, firstBurned };
  } finally { adapter?.dispose(); sdk.destroy(); engine.dispose(); }
}

export function evaluateF135OnsetSource(row: F135OnsetObservation) {
  return evaluateEngineGasOptics(f135ExhaustOpticalData, row.opticalInput);
}

/** Actual WASM paired samples isolate deliberate AB and native thrust independently. */
export async function renderF135OnsetAudio(trace: F135OnsetTrace, tier: number, sampleRate = 48_000) {
  const output: Float32Array[] = [], harnesses: DspHarness[] = [];
  const memoryBytes: { beforeRender: number; afterRender: number }[] = [];
  const prefixSeconds = .25;
  for (const mode of ["actual", "ab-muted", "dry-thrust-reference"] as const) {
    const core = await createDspHarness({ sampleRate });
    harnesses.push(core);
    core.setProfile(getAircraftAudioProfile("f-35b"));
    core.exports.osfs_audio_set_tier(tier);
    core.exports.osfs_audio_set_gains(1, 1, 0, 0, 0);
    core.exports.osfs_audio_set_afterburner_volume(mode === "actual" ? 1 : 0);
    core.anchor(1, 0);
    let sequence = 0;
    const beforeRender = core.exports.memory.buffer.byteLength;
    const rendered = core.renderSeconds(trace.firstBurned.timeSeconds + .5 + prefixSeconds, frame => {
      // Integer tick division preserves the exactly representable .25 s
      // command boundary; accumulated 1/60 skipped that first state by roundoff.
      while (sequence / 60 <= frame / sampleRate + .1) {
        const next = sequence / 60;
        const nativeTime = next - prefixSeconds;
        const observation = nativeTime < 0 ? trace.before
          : trace.observations[Math.min(trace.observations.length - 1, Math.round(nativeTime * 120))];
        const reading = { ...observation.reading, simTimeS: next };
        // Counterfactual for diagnosis only: no app source rewrites native thrust.
        if (mode === "dry-thrust-reference" && reading.augmentation)
          reading.thrustLbf = observation.referenceDryThrustLbf;
        core.pushSnapshot(toSnapshot(reading, { sequence: sequence++, epoch: 1,
          source: [0, 0, -1], sourceVelocity: [0, 0, 0], listenerVelocity: [0, 0, 0],
          exterior: 1, groundReflectionM: -1, poseValid: true }));
      }
    });
    if (!rendered.left.every(Number.isFinite) || !rendered.right.every(Number.isFinite))
      throw new Error("Nonfinite shipped DSP output in onset validation");
    memoryBytes.push({ beforeRender, afterRender: core.exports.memory.buffer.byteLength });
    output.push(rendered.left);
  }
  const deliberateDifference = difference(output[0], output[1]);
  const thrustDifference = difference(output[1], output[2]);
  const first = (samples: Float32Array): number | null => {
    const index = samples.findIndex(sample => sample !== 0);
    return index < 0 ? null : index / sampleRate - prefixSeconds;
  };
  const windowRms = (samples: Float32Array, start: number, end: number): number => rms(samples,
    Math.max(0, Math.round((start + prefixSeconds) * sampleRate)),
    Math.min(samples.length, Math.round((end + prefixSeconds) * sampleRate)));
  return { sampleRate, tier, prefixSeconds, deliberateDifference, thrustDifference,
    firstDeliberateDifferenceSeconds: first(deliberateDifference),
    firstThrustDifferenceSeconds: first(thrustDifference),
    preBurnThrustDifferenceRms: windowRms(thrustDifference, trace.firstSelected.timeSeconds, trace.firstBurned.timeSeconds),
    preBurnDeliberateDifferenceRms: windowRms(deliberateDifference, trace.firstSelected.timeSeconds, trace.firstBurned.timeSeconds),
    postBurnDeliberateDifferenceRms: windowRms(deliberateDifference, trace.firstBurned.timeSeconds + .1, trace.firstBurned.timeSeconds + .3),
    stats: harnesses.map(core => core.stats()), memoryBytes };
}
