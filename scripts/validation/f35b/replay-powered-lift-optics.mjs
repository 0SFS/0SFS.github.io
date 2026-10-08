#!/usr/bin/env node
// 0sfs owns this aircraft-specific replay; native dynamics remain in JSBSim.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { LoadAssetContainerAsync, NullEngine, Scene } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import { rolldown } from 'rolldown';
import { newOutputDirectory } from '../../outputDirectory.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/validation/f35b/replay-powered-lift-optics.mjs --trace=build/.../idle-entry.csv.gz [--trace=build/.../free-full.csv.gz] [--sample-seconds=0.125] [--settled-start-seconds=20] [--axial-samples=64] [--radial-samples=32]');
  process.exit(0);
}
assert.ok(args.every(arg => /^(--trace=|--sample-seconds=|--settled-start-seconds=|--axial-samples=|--radial-samples=)/.test(arg)), 'Unknown argument');
const option = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const traces = args.filter(arg => arg.startsWith('--trace=')).map(arg => path.resolve(root, arg.slice(8)));
assert.ok(traces.length, 'At least one --trace is required');
const sampleSeconds = Number(option('sample-seconds', '0.125'));
const settledStartSeconds = Number(option('settled-start-seconds', '20'));
assert.ok(Number.isFinite(sampleSeconds) && sampleSeconds >= 0 && sampleSeconds <= 10, 'Sample seconds must be 0–10; zero replays every native row');
assert.ok(Number.isFinite(settledStartSeconds) && settledStartSeconds >= 0, 'Invalid settled-window start');
const out = newOutputDirectory('validation', 'f135-powered-lift-optics');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePaths = [
  'scripts/validation/f35b/replay-powered-lift-optics.mjs',
  'src/flight/aircraft/aircraftCatalog.ts', 'src/flight/aircraft/createAircraftEngineVisuals.ts',
  'src/flight/aircraft/createEngineExhaust.ts', 'src/flight/aircraft/engineExhaustProfiles.ts',
  'src/flight/aircraft/engineGasOptics.ts', 'src/flight/aircraft/engineReactionEmission.ts',
  'src/flight/aircraft/engineGasSupport.ts', 'src/flight/aircraft/engineNozzleRig.ts',
  'src/flight/aircraft/generated/f135EngineData.ts',
  'src/flight/aircraft/generated/f135ExhaustOpticalData.ts',
  'src/flight/aircraft/generated/f135-exhaust-lut.manifest.json',
];
const inputs = [];
for (const file of sourcePaths) inputs.push({ path: file, sha256: sha256(await readFile(path.join(root, file))) });
const entry = path.join(out, 'helpers.ts');
await writeFile(entry, [
  ['getAircraftDefinition', 'src/flight/aircraft/aircraftCatalog.ts'],
  ['getEngineExhaustOpticalProfile', 'src/flight/aircraft/engineExhaustProfiles.ts'],
  ['evaluateEngineGasOptics, DEFAULT_ENGINE_GAS_AXIAL_SAMPLES, DEFAULT_ENGINE_GAS_RADIAL_SAMPLES', 'src/flight/aircraft/engineGasOptics.ts'],
  ['bindEngineGasSupport', 'src/flight/aircraft/engineGasSupport.ts'],
  ['bindEngineNozzleRig', 'src/flight/aircraft/engineNozzleRig.ts'],
].map(([names, file]) => `export { ${names} } from ${JSON.stringify(path.join(root, file))};`).join('\n') + '\n');
const bundle = await rolldown({ input: entry, external: id => !id.startsWith('.') && !path.isAbsolute(id),
  plugins: [{ name: 'base-url', transform(code) { return code.includes('import.meta.env.BASE_URL')
    ? { code: code.replaceAll('import.meta.env.BASE_URL', JSON.stringify('/')), map: null } : null; } }] });
const bundlePath = path.join(out, 'helpers.mjs');
try { await bundle.write({ file: bundlePath, format: 'esm' }); }
finally { await bundle.close(); }
const h = await import(pathToFileURL(bundlePath));
const definition = h.getAircraftDefinition('f-35b');
const installation = definition.exhaustSources.find(source => source.id === 'main-exhaust');
const profile = h.getEngineExhaustOpticalProfile(installation.opticalProfileId);
assert.ok(profile?.gasEmission?.spatialField && installation.gasSupport && definition.engineAssets?.rig);
const axialSamples = Number(option('axial-samples', String(h.DEFAULT_ENGINE_GAS_AXIAL_SAMPLES)));
const radialSamples = Number(option('radial-samples', String(h.DEFAULT_ENGINE_GAS_RADIAL_SAMPLES)));
assert.ok([axialSamples, radialSamples].every(value => Number.isInteger(value) && value >= 2 && value <= 512), 'Field samples must be integers 2–512');
const geometryPath = 'public/' + definition.engineAssets.full.path;
const geometryBytes = await readFile(path.join(root, geometryPath));
inputs.push({ path: geometryPath, sha256: sha256(geometryBytes) });
const photopicWeights = [0.2126, 0.7152, 0.0722];
const y = rgb => rgb.reduce((sum, value, i) => sum + value * photopicWeights[i], 0);
const stats = values => {
  if (!values.length) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { min: Math.min(...values), max: Math.max(...values), mean,
    peakToPeak: Math.max(...values) - Math.min(...values),
    rmsRipple: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length),
    endMinusStart: values.at(-1) - values[0] };
};
const results = [], engine = new NullEngine(), scene = new Scene(engine);
scene.useRightHandedSystem = true;
try {
  const container = await LoadAssetContainerAsync(new Uint8Array(geometryBytes), scene, { pluginExtension: '.glb' });
  container.addAllToScene();
  const nodes = container.transformNodes.concat(container.meshes);
  const supportRoot = nodes.find(node => node.name === installation.gasSupport.rootNode);
  assert.ok(supportRoot, 'Missing authored engine support root');
  supportRoot.position.setAll(0);
  const rig = h.bindEngineNozzleRig(nodes, definition.engineAssets.rig);
  const binding = h.bindEngineGasSupport(supportRoot, installation.gasSupport);
  for (const [traceIndex, tracePath] of traces.entries()) {
    const traceBytes = await readFile(tracePath), text = gunzipSync(traceBytes).toString('utf8');
    inputs.push({ path: path.relative(root, tracePath), sha256: sha256(traceBytes) });
    const lines = text.trimEnd().split('\n'), properties = lines.shift().split(',');
    assert.equal(properties[0], 'simulation/sim-time-sec', 'Unexpected native trace schema');
    assert.equal(new Set(properties).size, properties.length, 'Duplicate native trace columns');
    const normalize = name => name.replace('propulsion/engine[0]/', 'propulsion/engine/');
    const slots = new Map(properties.map((name, index) => [name, index]));
    const get = (values, name) => values[slots.get(name) ?? slots.get(normalize(name))] ?? Number.NaN;
    const temperature = (values, descriptor) => {
      if (!descriptor || !(descriptor.availableWhen ?? []).every(name => Number.isFinite(get(values, name)) && get(values, name) > .5)) return undefined;
      const raw = get(values, descriptor.property);
      const kelvin = descriptor.unit === 'degC' ? raw + 273.15 : descriptor.unit === 'degF' ? (raw - 32) * 5 / 9 + 273.15 : raw;
      return Number.isFinite(kelvin) && kelvin > 0 ? kelvin : undefined;
    };
    const rows = lines.map((line, index) => {
      const values = line.split(',').map(value => value === '' ? Number.NaN : Number(value));
      assert.equal(values.length, properties.length, `Wrong column count at row ${index}`);
      assert.ok(Number.isFinite(values[0]), `Missing native clock at row ${index}`);
      return values;
    });
    assert.ok(rows.length > 1, 'Native trace needs at least two states');
    const start = rows[0][0];
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i][0] >= rows[i - 1][0], 'Native time went backwards');
    const selected = new Map([[0, new Set(['first'])], [rows.length - 1, new Set(['last'])]]);
    const select = (index, reason) => { const reasons = selected.get(index) ?? new Set(); reasons.add(reason); selected.set(index, reasons); };
    let nextSample = start;
    for (let i = 0; i < rows.length; i++) {
      if (sampleSeconds === 0 || rows[i][0] + 1e-9 >= nextSample) {
        select(i, 'cadence');
        if (sampleSeconds > 0) while (nextSample <= rows[i][0] + 1e-9) nextSample += sampleSeconds;
      }
      if (i && ['fcs/throttle-cmd-norm', 'fcs/stovl-cmd-norm', 'propulsion/engine/augmentation', 'propulsion/engine/plant/numerics/failure'].some(name => !Object.is(get(rows[i], name), get(rows[i - 1], name)))) {
        select(i - 1, 'event-before'); select(i, 'event-after');
      }
    }
    for (const name of [installation.gasTemperature.property, installation.powerProperty,
      'propulsion/engine/plant/shaft/n1-percent', 'propulsion/engine/plant/shaft/n2-percent',
      'propulsion/engine/plant/nozzle/gross-thrust-lbs']) {
      for (const window of ['whole', 'tail']) {
        const eligible = rows.map((values, index) => ({ index, value: get(values, name) }))
          .filter(item => Number.isFinite(item.value) && (window === 'whole' || rows[item.index][0] - start >= settledStartSeconds));
        if (!eligible.length) continue;
        select(eligible.reduce((a, b) => a.value < b.value ? a : b).index, `${window}-min:${name}`);
        select(eligible.reduce((a, b) => a.value > b.value ? a : b).index, `${window}-max:${name}`);
      }
    }
    const samples = [];
    for (const [nativeRow, reasons] of [...selected].sort((a, b) => a[0] - b[0])) {
      const values = rows[nativeRow], timeSeconds = values[0], elapsedSeconds = timeSeconds - start;
      const fuelPps = get(values, installation.fuelFlowProperty), power = get(values, installation.powerProperty) / installation.powerFullScale;
      const burnedAb = get(values, installation.afterburnerBurnedFuelFlowProperty);
      const augmentation = get(values, `propulsion/engine[${installation.engineIndex}]/augmentation`) > .5;
      const running = Number.isFinite(power) && power > 0 && Number.isFinite(fuelPps) && fuelPps > 0 && Number.isFinite(timeSeconds);
      const nozzlePositionNorm = get(values, `propulsion/engine[${installation.engineIndex}]/nozzle-pos-norm`);
      const pitch = get(values, 'fcs/nozzle-pitch-rad'), yaw = get(values, 'fcs/nozzle-yaw-rad');
      assert.ok([pitch, yaw, nozzlePositionNorm].every(Number.isFinite), 'Missing attained nozzle pose');
      rig.update(pitch, yaw, nozzlePositionNorm);
      const support = binding.update(rig.apertureGeometry, installation.lengthMeters, profile.gasEmission.spatialField.spreadingSlope);
      const ambientK = get(values, 'atmosphere/T-R') * 5 / 9;
      const pressurePa = get(values, 'atmosphere/P-psf') * 47.88025898033584;
      const opticalInput = {
        temperatureKelvin: temperature(values, installation.gasTemperature),
        upstreamGasTemperatureKelvin: temperature(values, installation.upstreamGasTemperature),
        ambientTemperatureKelvin: Number.isFinite(ambientK) && ambientK > 0 ? ambientK : undefined,
        ambientPressurePascal: Number.isFinite(pressurePa) && pressurePa > 0 ? pressurePa : undefined,
        augmentation, fuelFlowKgPerSecond: Number.isFinite(fuelPps) && fuelPps >= 0 ? fuelPps * .45359237 : undefined,
        afterburnerBurnedFuelFlowKgPerSecond: Number.isFinite(burnedAb) && burnedAb >= 0 ? burnedAb : undefined,
        radiusMeters: rig.apertureGeometry.exitRadius, lengthMeters: installation.lengthMeters,
        axialSamples, radialSamples, flowDomain: support.flowDomain,
      };
      const gas = h.evaluateEngineGasOptics(profile, opticalInput);
      const particleTemperatures = gas.field?.particleTemperatureKelvin;
      samples.push({ nativeRow, timeSeconds, elapsedSeconds, selectedBecause: [...reasons],
        labels: { window: elapsedSeconds < settledStartSeconds ? 'transient' : 'post-settling-window-start',
          running, augmentation, zeroReheatBurn: burnedAb === 0, physicalConversion: get(values, 'fcs/stovl-pos-norm'),
          requestedConversion: get(values, 'fcs/stovl-cmd-norm'), requestedThrottle: get(values, 'fcs/throttle-cmd-norm'),
          usedAlgorithm: get(values, 'propulsion/engine/plant/numerics/algorithm'),
          fallbackReason: get(values, 'propulsion/engine/plant/numerics/fallback-reason'),
          numericalFailure: get(values, 'propulsion/engine/plant/numerics/failure'),
          acceptedSequence: get(values, 'propulsion/engine/plant/numerics/sequence') },
        native: { n1Percent: get(values, 'propulsion/engine/plant/shaft/n1-percent'),
          n2Percent: get(values, 'propulsion/engine/plant/shaft/n2-percent'),
          mainGrossThrustLbf: get(values, 'propulsion/engine/plant/nozzle/gross-thrust-lbs'),
          fanGrossThrustLbf: get(values, 'propulsion/engine/plant/lift-fan/gross-thrust-lbs'),
          legacyFuelFlowPps: fuelPps,
          coreMeteredKgSec: get(values, 'propulsion/engine/plant/fuel/core-metered-kg-sec'),
          coreBurnedKgSec: get(values, 'propulsion/engine/plant/fuel/core-burned-kg-sec'),
          abBurnedKgSec: get(values, 'propulsion/engine/plant/fuel/ab-burned-kg-sec'),
          totalMeteredKgSec: get(values, 'propulsion/engine/plant/fuel/total-metered-kg-sec'),
          stations: Object.fromEntries(['st4', 'st5', 'st6', 'st7'].map(station => [station,
            Object.fromEntries(['total-temperature-k', 'total-pressure-pa', 'mass-flow-kg-sec', 'fuel-air-ratio', 'unburned-fraction']
              .map(field => [field, get(values, `propulsion/engine/plant/station/${station}/${field}`)]))])),
          nozzle: Object.fromEntries(['exit-static-temperature-k', 'exit-static-pressure-pa', 'exit-velocity-mps',
            'exit-mach', 'mass-flow-kg-sec', 'throat-area-sq-m', 'exit-area-sq-m']
            .map(field => [field, get(values, `propulsion/engine/plant/nozzle/${field}`)])),
          linerTemperatureKelvin: temperature(values, installation.hotSurfaceTemperature),
          regionTemperaturesKelvin: installation.hotSurfaceRegions.map(region => temperature(values, region.temperature)),
          nozzlePitchRad: pitch, nozzleYawRad: yaw, nozzlePositionNorm },
        opticalInput, source: { valid: gas.valid, runtimeResourceEligible: running && gas.valid,
          temperatureMeaning: gas.temperatureMeaning, sourceBoundaryTemperatureKelvin: gas.sourceBoundaryTemperatureKelvin,
          chemistryStatus: gas.chemistryStatus, reactionInputWasClamped: gas.reactionInputWasClamped ?? null,
          reactionDomainResolved: gas.reactionDomainResolved ?? null, absorptionPerMeter: gas.absorptionPerMeter,
          absorptionWasCapped: gas.absorptionWasCapped, fuelPowerW: gas.fuelPowerW,
          particlePowerUpperBoundW: gas.particlePowerUpperBoundW, chPowerW: gas.chPowerW, c2PowerW: gas.c2PowerW,
          totalSourcePowerUpperBoundW: gas.totalSourcePowerUpperBoundW, allowedPowerW: gas.allowedPowerW,
          emittingVolumeM3: gas.emittingVolumeM3, intensityRgbCd: gas.isotropicIntensityRgbCd,
          intensityYCd: y(gas.isotropicIntensityRgbCd), exteriorIntensityRgbCd: gas.exteriorIsotropicIntensityRgbCd,
          exteriorIntensityYCd: y(gas.exteriorIsotropicIntensityRgbCd),
          particleTemperatureKelvin: particleTemperatures ? particleTemperatures.reduce((bounds, value) =>
            ({ min: Math.min(bounds.min, value), max: Math.max(bounds.max, value) }), { min: Infinity, max: -Infinity }) : null } });
    }
    const name = path.basename(tracePath, '.csv.gz');
    const file = `${traceIndex + 1}-${name}.ndjson.gz`;
    const outputBytes = gzipSync(samples.map(sample => JSON.stringify(sample, (_key, value) => value === undefined ? null : value)).join('\n') + '\n');
    await writeFile(path.join(out, file), outputBytes);
    const tail = samples.filter(sample => sample.elapsedSeconds >= settledStartSeconds && sample.source.runtimeResourceEligible && sample.selectedBecause.includes('cadence'));
    const all = samples.filter(sample => sample.source.runtimeResourceEligible);
    const peak = all.length ? all.reduce((a, b) => a.source.exteriorIntensityYCd > b.source.exteriorIntensityYCd ? a : b) : null;
    const tailY = stats(tail.map(sample => sample.source.exteriorIntensityYCd));
    let nativeReport = null;
    try { const reportBytes = await readFile(path.join(path.dirname(tracePath), 'report.json'));
      const parsed = JSON.parse(reportBytes), nativeCase = parsed.results.find(result => result.name === name) ?? null;
      if (nativeCase?.trace?.sha256) assert.equal(nativeCase.trace.sha256, sha256(traceBytes), 'Native report/trace identity mismatch');
      nativeReport = { path: path.relative(root, path.join(path.dirname(tracePath), 'report.json')),
        sha256: sha256(reportBytes), artifact: parsed.artifact, assumptions: parsed.assumptions,
        case: nativeCase };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    results.push({ name, nativeTrace: { path: path.relative(root, tracePath), sha256: sha256(traceBytes),
      rows: rows.length, columns: properties.length, firstTimeSeconds: start, lastTimeSeconds: rows.at(-1)[0],
      allNativeStepsRetainedAtInput: true }, nativeReport,
      replay: { file, sha256: sha256(outputBytes), samples: samples.length, sampleSeconds,
        extremaAndEventRowsIncluded: true, settledStartSeconds, invalidSamples: samples.filter(sample => !sample.source.valid).length,
        cappedSamples: samples.filter(sample => sample.source.absorptionWasCapped).length },
      source: { statisticsBasis: 'Regular cadence rows only; peak also considers explicitly included native extrema and event rows.',
        exteriorIntensityYCd: { whole: stats(all.filter(sample => sample.selectedBecause.includes('cadence')).map(sample => sample.source.exteriorIntensityYCd)), tail: tailY },
        peak: peak ? { nativeRow: peak.nativeRow, elapsedSeconds: peak.elapsedSeconds, exteriorIntensityYCd: peak.source.exteriorIntensityYCd,
          gasKelvin: peak.opticalInput.temperatureKelvin } : null,
        peakToTailMeanRatio: peak && tailY && tailY.mean > 0 ? peak.source.exteriorIntensityYCd / tailY.mean : null } });
  }
  container.dispose();
} finally { scene.dispose(); engine.dispose(); }
const changedAfterSnapshot = [];
for (const input of inputs) if (sha256(await readFile(path.join(root, input.path))) !== input.sha256) changedAfterSnapshot.push(input.path);
const report = { schema: '0sfs-f135-powered-lift-optical-replay/1', inputs,
  executedBundleSha256: sha256(await readFile(bundlePath)), changedAfterSnapshot,
  profileId: profile.id, photopicWeights, fieldSamples: { axial: axialSamples, radial: radialSamples },
  adapterContract: { status: 'Mirrors current production adapter conversions and availability checks; does not invoke createAircraftEngineVisuals.',
    propertyAlias: 'engine[0] descriptors resolve to engine columns in the catalog-exported trace',
    gas: installation.gasTemperature, upstream: installation.upstreamGasTemperature,
    stationMeaning: 'Plant gas alias is station 7 total; upstream is lagged station 5 EGT. No exit-static or composition migration is performed.' },
  limits: ['CPU source evaluation only; NullEngine draws nothing and no browser or GPU is used.',
    'Integrated intensity is cd before opaque visibility, not luminance, escaped rays, deck illumination or pixels.',
    'The tail label marks an analysis window only; no optical or engine stationarity acceptance is inferred.',
    'Cadence can miss optical extrema between samples; native gas, shaft and main-force extrema plus event boundary rows are always included.',
    'No brightness/display gain, thermal persistence or native state adjustment is applied.'], results };
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ out: path.relative(root, out), executedBundleSha256: report.executedBundleSha256,
  changedAfterSnapshot, results: results.map(result => ({ name: result.name, nativeTrace: result.nativeTrace,
    replay: result.replay, source: result.source })) }, null, 2));
if (changedAfterSnapshot.length) process.exitCode = 1;
