#!/usr/bin/env node
// 0sfs owns this F135-specific validation of the coupled engine plant's reduced
// algorithm against its component reference, on the installed SDK. Untimed CPU
// work counts only; no wall-clock timing.
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
  console.log('Usage: node scripts/validation/f35b/check-f135-plant-algorithms.mjs [--out=build/new-directory]');
  process.exit(0);
}
assert.ok(args.every(arg => arg.startsWith('--out=')) && args.length <= 1);
const out = args[0] ? path.resolve(args[0].slice(6)) : newOutputDirectory('validation', 'f135-plant-algorithms');
assert.ok(out.startsWith(path.join(root, 'build') + path.sep));
if (args[0]) await mkdir(out);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const artifact = await verifyInstalledSdk(root);

// The app's own bootstrap and engine control, bundled from the source tree.
const entry = path.join(out, 'helpers.ts');
await writeFile(entry, [
  ['bootstrapAircraft', 'src/flight/jsbsim/bootstrapC172.ts'],
  ['createEngineControl', 'src/flight/jsbsim/engineControl.ts'],
  ['getFdmProfile', 'src/flight/jsbsim/fdmProfiles.ts'],
  ['resolveAircraftDataFiles', 'src/flight/jsbsim/hydrateJsbsimData.ts'],
].map(([name, file]) => `export { ${name} } from ${JSON.stringify(path.join(root, file))};`).join('\n')
  + `\nexport { JSBSimSdk } from '@felipegalind0/jsbsim';\nexport { wasmBinaryUrl, wasmModuleUrl } from '@felipegalind0/jsbsim/wasm';\n`);
const bundle = await rolldown({ input: entry, external: id => !id.startsWith('.') && !path.isAbsolute(id),
  plugins: [{ name: 'base-url', transform(code) { return code.includes('import.meta.env.BASE_URL')
    ? { code: code.replaceAll('import.meta.env.BASE_URL', JSON.stringify('/')), map: null } : null; } }] });
try { await bundle.write({ file: path.join(out, 'helpers.mjs'), format: 'esm' }); }
finally { await bundle.close(); }
const helpers = await import(pathToFileURL(path.join(out, 'helpers.mjs')));

const DT = 1 / 120, PLANT = 'propulsion/engine/plant/';
const manifest = JSON.parse(await readFile(path.join(root, 'public/jsbsim-data/manifest.json'), 'utf8'));
const dataFiles = helpers.resolveAircraftDataFiles(manifest, 'f-35b');
const inputs = [];
for (const file of ['scripts/validation/f35b/check-f135-plant-algorithms.mjs', 'public/jsbsim-data/manifest.json',
  ...dataFiles.map(file => 'public/jsbsim-data/' + file)]) inputs.push({ path: file, sha256: sha256(await readFile(path.join(root, file))) });

/**
 * Held on the stand where airspeed is zero; in free flight at an airspeed otherwise
 * (hold-down also stops the relative wind), where both algorithms fly the same path
 * to within their thrust difference.
 */
const scenarios = [
  { name: 'stand-cold-start-dry-reheat-cutoff', boot: { altFt: 0, engineRunning: false }, start: true, script: [
    [10, { throttle: 0 }], [15, { throttle: 0.99 }], [15, { throttle: 1 }], [10, { throttle: 0.99 }], [15, { throttle: 0 }],
    [10, { cutoff: 1 }]] },
  { name: 'hot-day-high-start', boot: { altFt: 6000, engineRunning: false, deltaTK: 30 }, start: true, script: [
    [10, { throttle: 0 }], [10, { throttle: 0.99 }], [5, { throttle: 0.3 }]] },
  { name: 'altitude-25000ft-400kt-throttle-steps', boot: { altFt: 25000, engineRunning: true, throttleNorm: 0.6, airspeedKts: 400 }, script: [
    [5, { throttle: 0.6 }], [10, { throttle: 0.99 }], [10, { throttle: 1 }], [8, { throttle: 0.3 }], [8, { throttle: 0 }]] },
  { name: 'windmill-cutoff-and-relight-20000ft-300kt', boot: { altFt: 20000, engineRunning: true, throttleNorm: 0.5, airspeedKts: 300 }, script: [
    [2, { throttle: 0.5 }], [20, { cutoff: 1, throttle: 0 }], [20, { cutoff: 0, throttle: 0 }]] },
  { name: 'stovl-conversion-throttle-steps-closing-cutoff', boot: { altFt: 1000, engineRunning: true, throttleNorm: 0.9 }, script: [
    [2, { throttle: 0.9 }], [6, { stovl: 1 }], [6, { throttle: 0.98 }], [6, { throttle: 0.7 }], [6, { stovl: 0, throttle: 0.9 }],
    [10, { cutoff: 1, throttle: 0 }]] },
];

const channels = {
  thrustLbf: { path: 'propulsion/engine/thrust-lbs', scale: 41000, unit: 'lbf' },
  liftFanLbf: { path: PLANT + 'lift-fan/gross-thrust-lbs', scale: 20000, unit: 'lbf' },
  rollPostLbf: { path: PLANT + 'roll-post[0]/gross-thrust-lbs', scale: 1950, unit: 'lbf' },
  n1Pct: { path: PLANT + 'shaft/n1-percent', scale: 100, unit: '%' },
  n2Pct: { path: PLANT + 'shaft/n2-percent', scale: 100, unit: '%' },
  fuelKgSec: { path: PLANT + 'fuel/total-metered-kg-sec', scale: 9, unit: 'kg/s' },
  t4K: { path: PLANT + 'station/st4/total-temperature-k', kelvin: true },
  t5K: { path: PLANT + 'station/st5/total-temperature-k', kelvin: true },
  t7K: { path: PLANT + 'station/st7/total-temperature-k', kelvin: true },
  linerK: { path: PLANT + 'solid/liner/temperature-k', kelvin: true },
  coreMetalK: { path: PLANT + 'solid/core/temperature-k', kelvin: true },
};
const events = { coreLit: PLANT + 'combustion/core-lit', running: PLANT + 'running', abBurning: 'propulsion/engine/augmentation' };

async function run(scenario, algorithm) {
  const sdk = await helpers.JSBSimSdk.create({ moduleUrl: helpers.wasmModuleUrl, wasmUrl: helpers.wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false } });
  try {
    for (const file of dataFiles) sdk.writeDataFile(file, await readFile(path.join(root, 'public/jsbsim-data', file), 'utf8'));
    const b = scenario.boot;
    if (b.deltaTK) sdk.setPropertyValue('atmosphere/delta-T', b.deltaTK * 1.8);
    await helpers.bootstrapAircraft(sdk, 'f-35b', { holdDown: !b.airspeedKts, altFt: b.altFt, airspeedKts: b.airspeedKts ?? 0, headingDeg: 0,
      engineRunning: b.engineRunning, throttleNorm: b.throttleNorm ?? 0, latDeg: 0, lonDeg: 0 });
    for (const index of [2, 3]) sdk.setPropertyValue(`stores/external-tank[${index - 2}]/attached`, 0);
    sdk.setPropertyValue(PLANT + 'settings/algorithm', algorithm === 'component' ? 0 : 1);
    assert.equal(sdk.getPropertyValue(PLANT + 'settings/algorithm'), algorithm === 'component' ? 0 : 1);
    const rows = [];
    const sample = () => {
      const row = { t: sdk.getPropertyValue('simulation/sim-time-sec') };
      for (const [name, channel] of Object.entries(channels)) row[name] = sdk.getPropertyValue(channel.path);
      for (const [name, property] of Object.entries(events)) row[name] = sdk.getPropertyValue(property);
      for (const name of ['iterations', 'residual-evaluations', 'algorithm', 'fallback-reason', 'failure', 'substeps', 'resident-bytes'])
        row[name] = sdk.getPropertyValue(PLANT + 'numerics/' + name);
      row.energyRelative = sdk.getPropertyValue(PLANT + 'ledger/energy-relative');
      row.massRelative = sdk.getPropertyValue(PLANT + 'ledger/mass-relative');
      return row;
    };
    const step = () => { assert.equal(sdk.run(), true); rows.push(sample()); };
    if (scenario.start) {
      const control = helpers.createEngineControl(sdk, helpers.getFdmProfile('f-35b'));
      for (let i = 0; i < 90 / DT && !sdk.getPropertyValue('propulsion/engine/set-running'); i++) {
        sdk.setPropertyValue('fcs/throttle-cmd-norm', 0); control.step(true); step();
      }
      assert.ok(sdk.getPropertyValue('propulsion/engine/set-running'), `${scenario.name}: no start`);
    }
    for (const [seconds, set] of scenario.script) {
      if ('throttle' in set) sdk.setPropertyValue('fcs/throttle-cmd-norm', set.throttle);
      if ('cutoff' in set) sdk.setPropertyValue('propulsion/cutoff_cmd', set.cutoff);
      if ('stovl' in set) sdk.setPropertyValue('fcs/stovl-cmd-norm', set.stovl);
      for (let i = 0; i < Math.round(seconds / DT); i++) step();
    }
    return rows;
  } finally { sdk.destroy(); }
}

const transitions = (rows, name) => rows.flatMap((row, i) => i && (row[name] > 0.5) !== (rows[i - 1][name] > 0.5)
  ? [{ t: row.t, to: row[name] > 0.5 }] : []);
const stats = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { mean: values.reduce((a, b) => a + b, 0) / values.length, p50: sorted[Math.floor(sorted.length / 2)],
    p99: sorted[Math.floor(sorted.length * 0.99)], max: sorted.at(-1) };
};

const results = [];
for (const scenario of scenarios) {
  const component = await run(scenario, 'component');
  const reduced = await run(scenario, 'reduced');
  assert.equal(component.length, reduced.length, `${scenario.name}: unequal trajectories`);
  const errors = {};
  for (const [name, channel] of Object.entries(channels)) {
    let worst = { abs: 0, t: 0 }, sum = 0;
    for (let i = 0; i < component.length; i++) {
      const diff = Math.abs(reduced[i][name] - component[i][name]);
      sum += diff * diff;
      if (diff > worst.abs) worst = { abs: diff, t: component[i].t, component: component[i][name], reduced: reduced[i][name] };
    }
    const normalized = channel.kelvin ? undefined : worst.abs / channel.scale;
    errors[name] = { unit: channel.unit ?? 'K', scale: channel.scale ?? null, maxAbs: worst.abs, rms: Math.sqrt(sum / component.length),
      maxNormalized: normalized ?? null, at: worst, gate: channel.kelvin ? '5 K' : '1% of scale',
      passed: channel.kelvin ? worst.abs <= 5 : normalized <= 0.01 };
  }
  const eventDiffs = {};
  for (const name of Object.keys(events)) {
    const a = transitions(component, name), b = transitions(reduced, name);
    const pairs = a.map((event, i) => ({ to: event.to, component: event.t, reduced: b[i]?.t ?? null,
      steps: b[i] ? Math.round(Math.abs(b[i].t - event.t) / DT) : null }));
    eventDiffs[name] = { count: { component: a.length, reduced: b.length }, pairs,
      passed: a.length === b.length && pairs.every(pair => pair.steps !== null && pair.steps <= 1) };
  }
  const work = Object.fromEntries([['component', component], ['reduced', reduced]].map(([algorithm, rows]) => [algorithm, {
    steps: rows.length, iterations: stats(rows.map(row => row.iterations)),
    residualEvaluations: stats(rows.map(row => row['residual-evaluations'])),
    stepsSolvedByComponent: rows.filter(row => row.algorithm === 0).length,
    substepped: rows.filter(row => row.substeps > 1).length, failures: rows.filter(row => row.failure > 0).length,
    residentBytes: stats(rows.map(row => row['resident-bytes'])),
    worstEnergyRelative: Math.max(...rows.map(row => row.energyRelative)),
    worstMassRelative: Math.max(...rows.map(row => row.massRelative)),
  }]));
  const passed = Object.values(errors).every(error => error.passed) && Object.values(eventDiffs).every(event => event.passed)
    && work.component.failures === 0 && work.reduced.failures === 0;
  results.push({ name: scenario.name, boot: scenario.boot, script: scenario.script, seconds: component.length * DT, passed, errors, events: eventDiffs, work });
  console.error(`${scenario.name}: ${passed ? 'passed' : 'FAILED'}`);
}

const report = { date: new Date().toISOString().slice(0, 10), kind: 'untimed-CPU-reduced-vs-component-F135-plant', artifact, sourceInputs: inputs,
  executedBundleSha256: sha256(await readFile(path.join(out, 'helpers.mjs'))),
  conditions: 'Static scenarios held down; scenarios with an airspeed fly freely from the app trim start; F-35B clean (both stores detached); 120 Hz; app bootstrap and engine control; algorithm set after zero-time initialization (which always uses the component reference).',
  gates: { force: '1% of declared full scale (41,000 lbf main, 20,000 lbf lift fan, 1,950 lbf roll post)', spool: '1% (100 % scale)',
    fuel: '1% of 9 kg/s', temperature: '5 K at stations 4, 5, 7 and both metal solids', events: 'equal counts, each within one 120 Hz step',
    failures: 'none in either algorithm' },
  limitations: ['The component algorithm is the reference; both share the controller, state integration and ledgers, so this tests the reduced closure, not the physics.',
    'Work is counted in Newton iterations and residual evaluations per accepted step; no wall-clock time was measured.',
    'The scenarios are the validation set; the reduced closure (tabulated gas properties, Jacobian reuse) was not fitted to them.'],
  passed: results.every(result => result.passed), scenarios: results };
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ out: path.relative(root, out), passed: report.passed, scenarios: results.map(result => ({
  name: result.name, passed: result.passed,
  worst: Object.fromEntries(Object.entries(result.errors).map(([name, error]) => [name, error.maxNormalized ?? error.maxAbs])),
  events: Object.fromEntries(Object.entries(result.events).map(([name, event]) => [name, event.passed])),
  meanIterations: { component: result.work.component.iterations.mean, reduced: result.work.reduced.iterations.mean },
  meanEvaluations: { component: result.work.component.residualEvaluations.mean, reduced: result.work.reduced.residualEvaluations.mean },
  stepsSolvedByComponent: result.work.reduced.stepsSolvedByComponent })) }, null, 2));
