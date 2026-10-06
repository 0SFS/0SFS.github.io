#!/usr/bin/env node
// 0sfs owns this aircraft optical diagnostic. No engine, browser or GPU run.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newOutputDirectory } from "../../outputDirectory.mjs";
import { bakeGasSpatialField, parseObserverCsv } from "../../exhaustOptics/bake.mjs";
import { referencePhotometricRgb, luminance } from "../../exhaustOptics/reference.mjs";
import { evaluateEngineGasOptics } from "../../../src/flight/aircraft/engineGasOptics.ts";

assert.equal(process.argv.length, 2, "This diagnostic uses retained, hashed observations; no positional options.");
const root = fileURLToPath(new URL("../../../", import.meta.url));
const out = newOutputDirectory("validation", "dry-exhaust-visibility");
const paths = [
  "src/flight/aircraft/generated/f135-exhaust-lut.manifest.json",
  "validation/evidence/aircraft/f35b/exhaust-response-2026-10-06/application/source/f135-exhaust-lut.manifest.json.txt",
  "validation/evidence/aircraft/f35b/exhaust-correction-2026-10-06/numerical/report.json",
  "scripts/exhaustOptics/data/CIE_xyz_1931_2deg.csv",
  "src/flight/aircraft/engineGasOptics.ts", "src/flight/aircraft/engineReactionEmission.ts",
  "scripts/exhaustOptics/bake.mjs", "scripts/exhaustOptics/reference.mjs",
  "scripts/exhaustOptics/f135-visible-approximation.json",
  "scripts/validation/f35b/analyze-dry-exhaust-visibility.mjs",
];
const bytes = paths.map(file => readFileSync(path.join(root, file)));
const inputs = paths.map((file, i) => {
  const snapshot = `source-${i}-${path.basename(file)}.txt`;
  writeFileSync(path.join(out, snapshot), bytes[i]);
  return { file, snapshot, sha256: createHash("sha256").update(bytes[i]).digest("hex") };
});
const current = JSON.parse(bytes[0]).profile;
const previous = JSON.parse(bytes[1]).profile;
const retained = JSON.parse(bytes[2]);
const observer = parseObserverCsv(bytes[3]);
const powered = retained.cases.find(c => c.name === "powered-lift");
assert.equal(powered.native.burnedAbKgSec, 0);
assert.equal(powered.native.augmentation, 0);
const input = { ...powered.input, upstreamGasTemperatureKelvin: powered.native.egtC + 273.15,
  ambientPressurePascal: powered.native.pressurePsf * 47.88025898033584 };
const before = evaluateEngineGasOptics(previous, input), after = evaluateEngineGasOptics(current, input);
assert.ok(before.valid && after.valid);
assert.equal(after.chPowerW, 0);
assert.equal(after.c2PowerW, 0);
assert.equal(after.sourceBoundaryTemperatureKelvin, input.temperatureKelvin);
assert.ok(after.totalSourcePowerUpperBoundW <= after.allowedPowerW);

// Independent endpoint bilinear sampling and transverse transfer, exterior only.
// Rays integrate a fixed section at s metres; no production sampler/ray helper.
function local(field, distance, radialFraction, values = field.rgba, channels = 4) {
  const [lo, hi] = field.axialDistanceRangeMeters;
  const x = (distance - lo) / (hi - lo) * (field.width - 1), y = radialFraction * (field.height - 1);
  const i = Math.min(field.width - 2, Math.floor(x)), j = Math.min(field.height - 2, Math.floor(y));
  const fx = x - i, fy = y - j, result = Array(channels).fill(0);
  for (const [dx, dy, weight] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)],
    [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    for (let c = 0; c < channels; c++) result[c] += weight * values[((j + dy) * field.width + i + dx) * channels + c];
  }
  return result;
}
function transverseRay(field, s, steps) {
  const radius = input.radiusMeters + current.gasEmission.spatialField.spreadingSlope * s;
  const h = 2 * radius / steps;
  let transmittance = 1;
  const rgb = [0, 0, 0];
  for (let i = 0; i < steps; i++) {
    const r = Math.abs(-radius + (i + .5) * h) / radius;
    const source = local(field, s, r), k = source[3];
    const segment = k > 0 ? -Math.expm1(-k * h) / k : h;
    for (let c = 0; c < 3; c++) rgb[c] += transmittance * source[c] * segment;
    transmittance *= Math.exp(-k * h);
  }
  return { rgbCdM2: rgb, luminanceCdM2: luminance(rgb), transmittance };
}
const stations = [0, .25, .5, 1, 1.5, 2, 3, 4, 5].map(s => {
  const old = transverseRay(before.field, s, 2048), now = transverseRay(after.field, s, 2048);
  const fine = transverseRay(after.field, s, 4096);
  const convergence = Math.abs(fine.luminanceCdM2 - now.luminanceCdM2) / Math.max(fine.luminanceCdM2, 1e-30);
  assert.ok(convergence < 1e-4);
  const temperature = gas => local(gas.field, s, 0, gas.field.particleTemperatureKelvin, 1)[0];
  const white = 1000;
  const midpointBudgets = [32, 64, 128].map(samples => {
    const ray = transverseRay(after.field, s, samples);
    return { samples, luminanceCdM2: ray.luminanceCdM2,
      relativeLuminanceError: Math.abs(ray.luminanceCdM2 - fine.luminanceCdM2) / Math.max(fine.luminanceCdM2, 1e-30) };
  });
  return { distanceMeters: s, previousAxisTemperatureK: temperature(before), currentAxisTemperatureK: temperature(after),
    previous: old, current: now, convergence, midpointBudgets, sceneYAtWhite1000EV0: now.luminanceCdM2 / white,
    exposureEVForSceneY002: Math.log2(.02 * white / Math.max(now.luminanceCdM2, 1e-300)) };
});
const blackbody = [800, 900, 1000, input.temperatureKelvin, 1100, 1200].map(k => {
  const b = luminance(referencePhotometricRgb(observer, k));
  return { temperatureK: k, blackbodyCdM2: b, homogeneousOneMeterCdM2: b * -Math.expm1(-.025) };
});
const summarize = gas => ({ exteriorPhotopicIntensityCd: luminance(gas.exteriorIsotropicIntensityRgbCd),
  particlePowerUpperBoundW: gas.particlePowerUpperBoundW, chPowerW: gas.chPowerW,
  allowedPowerW: gas.allowedPowerW, absorptionPerMeter: gas.absorptionPerMeter });
const stateComparisons = retained.cases.map(c => {
  const native = c.native;
  const observation = { ...c.input, upstreamGasTemperatureKelvin: native.egtC + 273.15,
    ambientPressurePascal: native.pressurePsf * 47.88025898033584 };
  const old = evaluateEngineGasOptics(previous, observation), now = evaluateEngineGasOptics(current, observation);
  if (now.valid) {
    assert.equal(now.sourceBoundaryTemperatureKelvin, native.gasK);
    assert.ok(now.totalSourcePowerUpperBoundW <= now.allowedPowerW);
    const flipped = evaluateEngineGasOptics(current, { ...observation, augmentation: !observation.augmentation });
    assert.ok(Buffer.from(now.field.rgba.buffer).equals(Buffer.from(flipped.field.rgba.buffer)));
    assert.equal(now.chPowerW, old.chPowerW);
    if (native.burnedAbKgSec === 0) assert.equal(now.excitedPowerW, 0);
  }
  return { name: c.name, nativeGasTemperatureK: native.gasK, burnedAbKgSec: native.burnedAbKgSec,
    valid: now.valid, previous: summarize(old), current: summarize(now),
    exactFlagOnlyFieldInvariance: now.valid ? true : undefined };
});
const parameters = JSON.parse(bytes[8]).gasEmission.spatialField;
const coreSensitivity = [4, 6, 10].map(radii => {
  const gasEmission = { ...current.gasEmission, spatialField: bakeGasSpatialField({ ...parameters,
    temperature: { ...parameters.temperature, potentialCoreLengthRadii: radii } }, observer, [],
  current.gasEmission.spatialField.blackbodyXyz) };
  const gas = evaluateEngineGasOptics({ gasEmission }, input);
  assert.ok(gas.valid && gas.totalSourcePowerUpperBoundW <= gas.allowedPowerW);
  return { thermalCoreLengthRadii: radii, thermalCoreLengthDiameters: radii / 2, ...summarize(gas) };
});
const report = { schemaVersion: 1, inputs, nativeObservation: powered.native, input,
  previous: summarize(before), current: summarize(after), blackbody, stations, stateComparisons, coreSensitivity,
  interpretation: "Preserving a finite thermal core changes spatial mixing, never the native boundary temperature, AB inhibit or chemical source. The profile is a heated-jet surrogate, not F135 calibration. Exposure rows are illustrative linear display values, not a calibrated camera or visual detection threshold.",
  limits: ["No GPU, engine dynamics or camera metadata measured.", "No deck reflection, heating, impingement or NIR response modeled.",
    "No full enthalpy transport solution: gas bath, gray particle opacity and mixing remain imposed approximations."] };
writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ out, previous: report.previous, current: report.current, stations }, null, 2));
