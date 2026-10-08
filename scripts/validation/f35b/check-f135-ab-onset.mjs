#!/usr/bin/env node
// 0sfs owns this aircraft-specific CPU integration validation; no GPU or device timing.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';
import { newOutputDirectory } from '../../outputDirectory.mjs';
import { verifyInstalledSdk } from '../../verify-jsbsim-artifact.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/validation/f35b/check-f135-ab-onset.mjs [--out=build/new-directory]');
  process.exit(0);
}
assert.ok(args.every(arg => arg.startsWith('--out=')) && args.length <= 1);
const out = args[0] ? path.resolve(args[0].slice(6)) : newOutputDirectory('validation', 'f135-ab-onset');
assert.ok(out.startsWith(path.join(root, 'build') + path.sep));
if (args[0]) await mkdir(out);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const artifact = await verifyInstalledSdk(root);
const entry = path.join(out, 'helpers.ts');
await writeFile(entry, `export * from ${JSON.stringify(path.join(root, 'src/flight/audio/f135ExhaustOnsetHarness.ts'))};\nexport {F135_ENGINE_GEOMETRY} from ${JSON.stringify(path.join(root, 'src/flight/aircraft/generated/f135EngineData.ts'))};\n`);
const bundle = await rolldown({ input: entry, external: id => !id.startsWith('.') && !path.isAbsolute(id),
  plugins: [{ name: 'base-url', transform(code) { return code.includes('import.meta.env.BASE_URL')
    ? { code: code.replaceAll('import.meta.env.BASE_URL', JSON.stringify('/')), map: null } : null; } }] });
let built;
try { built = await bundle.write({ file: path.join(out, 'helpers.mjs'), format: 'esm' }); }
finally { await bundle.close(); }
const helpers = await import(pathToFileURL(path.join(out, 'helpers.mjs')));
const sourceFiles = [...new Set(built.output.flatMap(chunk => chunk.type === 'chunk' ? Object.keys(chunk.modules) : []))]
  .filter(file => path.isAbsolute(file) && file.startsWith(root) && !file.startsWith(out));
const additional = ['scripts/validation/f35b/check-f135-ab-onset.mjs', 'src/flight/audio/f135ExhaustOnset.integration.test.ts',
  'src/flight/audio/dsp/audio-dsp.wasm', 'src/flight/audio/dsp/audio-dsp.provenance.json',
  'src/flight/audio/dsp/core.cpp', 'src/flight/audio/dsp/turbofan.h', 'src/flight/aircraft/createEngineExhaust.ts',
  'src/flight/aircraft/generated/f135-exhaust-lut.manifest.json',
  'public/jsbsim-data/manifest.json', 'public/jsbsim-data/aircraft/F-35B-jsbsim/Engines/F135-PW-600.xml'];
const dataManifest = JSON.parse(await readFile(path.join(root, 'public/jsbsim-data/manifest.json'), 'utf8'));
additional.push(...dataManifest.aircraft['f-35b'].map(file => 'public/jsbsim-data/' + file),
  ...helpers.F135_ENGINE_GEOMETRY.assets.map(asset => 'public/' + asset.path));
const inputs = [];
for (const file of new Set([...sourceFiles.map(file => path.relative(root, file)), ...additional])) {
  const bytes = await readFile(path.join(root, file));
  inputs.push({ path: file, sha256: sha256(bytes) });
}
const luminance = rgb => .2126729 * rgb[0] + .7151522 * rgb[1] + .072175 * rgb[2];
const observation = row => ({ timeSeconds: row.timeSeconds, n1Pct: row.reading.n1Pct, n2Pct: row.reading.n2Pct,
  abSelected: row.abSelected, augmentation: row.reading.augmentation, abHeatReleaseW: row.abHeatReleaseW,
  energyRelative: row.energyRelative, thrustLbf: row.reading.thrustLbf, referenceDryThrustLbf: row.referenceDryThrustLbf,
  totalFuelKgSec: row.reading.fuelFlowPps * .45359237, burnedAbKgSec: row.reading.afterburnerBurnedFuelFlowKgSec,
  upstreamKelvin: row.opticalInput.upstreamGasTemperatureKelvin, meanGasKelvin: row.opticalInput.temperatureKelvin,
  linerKelvin: row.linerTemperatureKelvin });
const scenarios = [], nativeRows = [], failures = [];
for (const name of ['cold-first-running', 'cold-then-hot-dry', 'warm-running-shortcut']) {
  const trace = await helpers.captureF135Onset(name);
  assert.equal(trace.before.referenceDryThrustLbf, trace.before.reading.thrustLbf,
    'The dry counterfactual must reproduce the state before the command');
  const beforeBurn = trace.observations[Math.round(trace.firstBurned.timeSeconds * 120) - 1];
  const source = helpers.evaluateF135OnsetSource(trace.firstBurned);
  const priorSource = helpers.evaluateF135OnsetSource(beforeBurn);
  assert.equal(priorSource.chPowerW, 0);
  assert.ok(source.valid && source.reactionDomainResolved && source.chPowerW > 0);
  assert.ok(source.totalSourcePowerUpperBoundW <= source.allowedPowerW);
  assert.equal(source.field.exteriorVolumeWeightsM3.reduce((sum, weight, i) => sum + weight * source.field.chPowerDensityWPerM3[i], 0), 0);
  const preBurnWetThrust = trace.observations.filter(row => row.reading.afterburnerBurnedFuelFlowKgSec === 0
    && row.reading.thrustLbf > row.referenceDryThrustLbf + 1);
  if (preBurnWetThrust.length) failures.push({ name, criterion: 'No reheat-only excess thrust before actual AB combustion',
    status: 'failed', violatingSteps: preBurnWetThrust.length,
    first: observation(preBurnWetThrust[0]), last: observation(preBurnWetThrust.at(-1)) });
  const heatWithoutBurn = trace.observations.filter(row => (row.abHeatReleaseW > 0) !== (row.reading.afterburnerBurnedFuelFlowKgSec > 0)
    || row.reading.augmentation !== (row.reading.afterburnerBurnedFuelFlowKgSec > 0) || !(row.energyRelative < 1e-5));
  if (heatWithoutBurn.length) failures.push({ name, criterion: 'Reheat heat only from burned reheat fuel; closed step energy ledger',
    status: 'failed', violatingSteps: heatWithoutBurn.length, first: observation(heatWithoutBurn[0]) });
  const selectedWithoutBurnSeconds = trace.observations.filter(row => row.abSelected
    && row.reading.afterburnerBurnedFuelFlowKgSec === 0).length / 120;
  const audio = [];
  for (const tier of [1, 2, 3]) {
    const rendered = await helpers.renderF135OnsetAudio(trace, tier);
    assert.equal(rendered.preBurnDeliberateDifferenceRms, 0);
    assert.ok(rendered.firstDeliberateDifferenceSeconds >= trace.firstBurned.timeSeconds - 1 / 120);
    assert.ok(rendered.firstDeliberateDifferenceSeconds < trace.firstBurned.timeSeconds + .1);
    assert.ok(rendered.postBurnDeliberateDifferenceRms > 0);
    assert.ok(rendered.stats.every(stats => stats.nonFinite === 0 && stats.staleFades === 0));
    assert.ok(rendered.memoryBytes.every(bytes => bytes.beforeRender === bytes.afterRender));
    assert.ok(rendered.stats.every(stats => stats.peak <= .891252 && stats.snapshotsDropped === 0 && stats.resyncs === 0
      && stats.partials === (tier === 1 ? 4 : 12) && stats.noiseBands === (tier === 1 ? 5 : tier === 2 ? 6 : 8)
      && stats.activeGrains === 0 && stats.grainCap === 0 && stats.irMs === (tier === 1 ? 0 : tier === 2 ? 20 : 40)));
    audio.push({ tier, sampleRate: rendered.sampleRate, firstDeliberateDifferenceSeconds: rendered.firstDeliberateDifferenceSeconds,
      firstThrustDifferenceSeconds: rendered.firstThrustDifferenceSeconds, preBurnThrustDifferenceRms: rendered.preBurnThrustDifferenceRms,
      preBurnDeliberateDifferenceRms: rendered.preBurnDeliberateDifferenceRms, postBurnDeliberateDifferenceRms: rendered.postBurnDeliberateDifferenceRms,
      deliberateDifferenceSha256: sha256(new Uint8Array(rendered.deliberateDifference.buffer)),
      thrustDifferenceSha256: sha256(new Uint8Array(rendered.thrustDifference.buffer)), stats: rendered.stats,
      memoryBytes: rendered.memoryBytes });
  }
  scenarios.push({ name, before: observation(trace.before), firstSelected: observation(trace.firstSelected),
    firstBurned: observation(trace.firstBurned), selectedToBurnDelaySeconds: trace.firstBurned.timeSeconds - trace.firstSelected.timeSeconds,
    selectedWithoutBurnSeconds, wetThrustWithoutBurnSeconds: preBurnWetThrust.length / 120,
    worstEnergyRelative: Math.max(...trace.observations.map(row => row.energyRelative)),
    sourceAtFirstBurn: { valid: source.valid, reactionDomainResolved: source.reactionDomainResolved, chPowerW: source.chPowerW,
      particlePowerUpperBoundW: source.particlePowerUpperBoundW, wholeSourcePhotopicYCd: luminance(source.isotropicIntensityRgbCd),
      precedingWholeSourcePhotopicYCd: luminance(priorSource.isotropicIntensityRgbCd), allowedPowerW: source.allowedPowerW,
      totalSourcePowerUpperBoundW: source.totalSourcePowerUpperBoundW }, audio });
  nativeRows.push(...trace.observations.map(row => ({ scenario: name, ...observation(row) })));
}
const columns = Object.keys(nativeRows[0]);
await writeFile(path.join(out, 'native.csv'), [columns.join(','), ...nativeRows.map(row => columns.map(column => row[column]).join(','))].join('\n') + '\n');
const failed = criterion => failures.some(failure => failure.criterion === criterion) ? 'failed' : 'passed';
const report = { date: '2026-10-08', kind: 'untimed-CPU-native-DSP-optical-source-causality', artifact,
  sourceInputs: inputs, executedBundleSha256: sha256(await readFile(path.join(out, 'helpers.mjs'))),
  nativeCsvSha256: sha256(await readFile(path.join(out, 'native.csv'))),
  temporalConvention: 'Command at time 0; first accepted post-command native step labeled 0; fixed dt=1/120 s. DSP follows integer-tick 60 Hz telemetry, 33.3 ms buffering and dezippering; 1 m propagation in Med/High, none in Low. Test harness prefills 100 ms future timestamped telemetry to ensure interpolation brackets, not a measured scheduler/device delay.',
  criteria: { deliberateAudioWaitsForNativeBurn: 'passed', internalReactionSourceStartsAtFirstNativeBurn: 'passed',
    noExteriorCHRelocation: 'passed', sourceEnergyBound: 'passed', unchangedDspCapsAndMemory: 'passed',
    noReheatThrustBeforeNativeBurn: failed('No reheat-only excess thrust before actual AB combustion'),
    reheatHeatOnlyFromBurnedFuelAndClosedLedger: failed('Reheat heat only from burned reheat fuel; closed step energy ledger'),
    visiblyPerceivedOnset: 'not-tested' },
  limitations: ['Nonzero spectral source and first unequal float audio sample do not establish visible pixels or audible onset.',
    'Dry counterfactual is the same native engine run with the throttle held at 0.99 (same N1 demand, no reheat request); production audio never substitutes it.',
    'propulsion/engine/augmentation is reheat fuel burning for the coupled plant; selection is plant/combustion/ab-selected.',
    'Native EGT, thermal flow, fuel partition and optical particle/parcel closures remain uncalibrated F135 hypotheses.',
    'NullEngine loads the authored gas support but draws no pixels; no GPU, browser, sound device or performance timing was tested.',
    'The thrust and energy invariants are numerical/causal checks of the coupled plant, not perceptual synchronization acceptance.'],
  failures, scenarios };
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ out: path.relative(root, out), criteria: report.criteria,
  scenarios: scenarios.map(row => ({ name: row.name, selectedToBurnDelaySeconds: row.selectedToBurnDelaySeconds,
    selectedWithoutBurnSeconds: row.selectedWithoutBurnSeconds, wetThrustWithoutBurnSeconds: row.wetThrustWithoutBurnSeconds,
    worstEnergyRelative: row.worstEnergyRelative,
    audio: row.audio.map(({ tier, firstDeliberateDifferenceSeconds, firstThrustDifferenceSeconds }) =>
      ({ tier, firstDeliberateDifferenceSeconds, firstThrustDifferenceSeconds })) })) }, null, 2));
