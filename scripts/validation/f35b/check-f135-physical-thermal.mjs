#!/usr/bin/env node
// Actual installed native F135: local solid energy, initial conditions and lifecycle.
// JSBSim owns state/equations; this tool independently evaluates declared XML inputs
// and integrates heat receipts for verification, never to drive the application.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { rolldown } from 'rolldown';
import { JSBSimSdk } from '@felipegalind0/jsbsim';
import { wasmModuleUrl, wasmBinaryUrl } from '@felipegalind0/jsbsim/wasm';
import { newOutputDirectory } from '../../outputDirectory.mjs';
import { verifyInstalledSdk } from '../../verify-jsbsim-artifact.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/validation/f35b/check-f135-physical-thermal.mjs [--out=build/new-directory] [--cases=cold-cycle,running-initialization,hot-restart,lifecycle,powered-lift,convergence] [--sample-seconds=0.25]');
  process.exit(0);
}
assert.ok(args.every(a => /^(--out=|--cases=|--sample-seconds=)/.test(a)), 'Unknown option');
const option = name => { const values = args.filter(a => a.startsWith(name + '=')); assert.ok(values.length <= 1); return values[0]?.slice(name.length + 1); };
const selected = option('--cases')?.split(',');
const sampleSeconds = Number(option('--sample-seconds') ?? .25);
assert.ok(Number.isFinite(sampleSeconds) && sampleSeconds >= 1 / 120 && sampleSeconds <= 10, 'Sample spacing must be 1/120–10 s; every native step is audited regardless');
const explicitOut = option('--out');
const out = explicitOut ? path.resolve(explicitOut) : newOutputDirectory('validation', 'f135-physical-thermal');
assert.ok(out.startsWith(path.join(root, 'build') + path.sep), 'Output must remain under build/');
if (explicitOut) await mkdir(out);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const artifact = await verifyInstalledSdk(root);
const entry = path.join(out, 'helpers.ts');
await writeFile(entry, [
  ['bootstrapAircraft', 'src/flight/jsbsim/bootstrapC172.ts'],
  ['createEngineControl', 'src/flight/jsbsim/engineControl.ts'],
  ['engineTestStandBootstrapOptions', 'src/flight/engineTestStand.ts'],
  ['getFdmProfile', 'src/flight/jsbsim/fdmProfiles.ts'],
  ['resolveAircraftDataFiles', 'src/flight/jsbsim/hydrateJsbsimData.ts'],
  ['captureSimulation,restoreSimulation', 'src/flight/physics/safeFlightState.ts'],
  ['resetFlightLocation', 'src/flight/jsbsim/resetFlightLocation.ts'],
  ['nozzleApertureGeometry', 'src/flight/aircraft/engineNozzleRig.ts'],
  ['F135_ENGINE_GEOMETRY', 'src/flight/aircraft/generated/f135EngineData.ts'],
  ['evaluateEngineGasOptics,interpolateGasBlackbody', 'src/flight/aircraft/engineGasOptics.ts'],
].map(([names, file]) => `export {${names}} from ${JSON.stringify(path.join(root, file))};`).join('\n'));
const builder = await rolldown({ input: entry, external: id => !id.startsWith('.') && !path.isAbsolute(id),
  plugins: [{ name: 'base-url', transform(code) { return code.includes('import.meta.env.BASE_URL') ? { code: code.replaceAll('import.meta.env.BASE_URL', JSON.stringify('/')), map: null } : null; } }] });
let built;
try { built = await builder.write({ file: path.join(out, 'helpers.mjs'), format: 'esm' }); } finally { await builder.close(); }
const sourceFiles = [...new Set(built.output.flatMap(chunk => chunk.type === 'chunk' ? Object.keys(chunk.modules) : []))]
  .filter(file => path.isAbsolute(file) && file.startsWith(root) && !file.startsWith(out));
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [path.relative(root, file), hash(await readFile(file))])));
const helpers = await import(pathToFileURL(path.join(out, 'helpers.mjs')).href);
const { bootstrapAircraft, createEngineControl, engineTestStandBootstrapOptions, getFdmProfile,
  resolveAircraftDataFiles, captureSimulation, restoreSimulation, resetFlightLocation } = helpers;
const opticalFile = 'src/flight/aircraft/generated/f135-exhaust-lut.manifest.json';
const opticalBytes = await readFile(path.join(root, opticalFile));
sourceHashes[opticalFile] = hash(opticalBytes);
const opticalProfile = JSON.parse(opticalBytes).profile;
const scriptSha256 = hash(await readFile(fileURLToPath(import.meta.url)));
const manifest = await readFile(path.join(root, 'public/jsbsim-data/manifest.json'));
sourceHashes['public/jsbsim-data/manifest.json'] = hash(manifest);
const files = await Promise.all(resolveAircraftDataFiles(JSON.parse(manifest), 'f-35b').map(async file => [file, await readFile(path.join(root, 'public/jsbsim-data', file))]));
const dataHashes = Object.fromEntries(files.map(([file, bytes]) => [file, hash(bytes)]));
const engineXml = files.find(([file]) => file.endsWith('/F135-PW-600.xml'))[1].toString('utf8').replace(/<!--[\s\S]*?-->/g, '');
const field = (xml, tag) => new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1].replace(/\s+/g, '');
const scalar = (xml, tag, fallback) => { const raw = field(xml, tag); const value = raw === undefined ? fallback : Number(raw); assert.ok(Number.isFinite(value), `Expected literal ${tag}`); return value; };
const thermalXml = field(engineXml, 'thermal');
const coreXml = /<solid-regionname="core">([\s\S]*?)<\/solid-region>/.exec(thermalXml)?.[1];
assert.ok(coreXml, 'This audit requires the two declared F135 solid regions');
const linerXml = thermalXml.replace(/<solid-regionname="core">[\s\S]*?<\/solid-region>/, '');
const square = '<pow><quotient><property>propulsion/engine[#]/n2</property><value>100</value></quotient><value>2</value></pow>';
function conductance(xml, tag) {
  const raw = field(xml, tag), match = /^<function><sum><value>([\d.]+)<\/value><product><value>([\d.]+)<\/value>/.exec(raw);
  assert.ok(match, `Expected constant plus N2-squared ${tag}`);
  assert.equal(raw, `<function><sum><value>${match[1]}</value><product><value>${match[2]}</value>${square}</product></sum></function>`);
  return [Number(match[1]), Number(match[2])];
}
const config = Object.fromEntries([['liner', linerXml, ''], ['core', coreXml, 'core/']].map(([name, xml, suffix]) => {
  assert.equal(field(xml, 'coolant-temperature-k'), `<function><sum><property>propulsion/tat-c</property><value>273.15</value><product><value>100</value>${square}</product></sum></function>`);
  if (name === 'core') assert.equal(field(xml, 'gas-temperature-k'), '<function><sum><property>propulsion/engine[#]/egt-degc</property><value>273.15</value></sum></function>');
  else assert.equal(field(xml, 'gas-temperature-k'), undefined);
  return [name, { prefix: 'propulsion/engine/thermal/' + suffix, capacityJK: scalar(xml, 'wall-heat-capacity-j-k'),
    gasConductanceWK: conductance(xml, 'gas-conductance-w-k'), coolantConductanceWK: conductance(xml, 'coolant-conductance-w-k'),
    areaM2: scalar(xml, 'radiation-area-sq-m'), emissivity: scalar(xml, 'emissivity'),
    flameAreaM2: scalar(xml, 'flame-radiation-area-sq-m', 0), flameEmissivity: scalar(xml, 'flame-emissivity', 0) }];
}));
const gasConfig = { cp: scalar(linerXml, 'gas-specific-heat-j-kg-k'), lhv: scalar(linerXml, 'fuel-heating-value-j-kg'),
  efficiency: scalar(linerXml, 'afterburner-efficiency'), stoichiometricRatio: scalar(linerXml, 'stoichiometric-fuel-air-ratio') };
assert.equal(field(linerXml, 'gas-mass-flow-kg-sec'), `<function><product><value>120</value>${square}<quotient><property>propulsion/pt-lbs_sqft</property><value>2116.22</value></quotient><sqrt><quotient><value>288.15</value><sum><property>propulsion/tat-c</property><value>273.15</value></sum></quotient></sqrt></product></function>`);
const sigma = 5.670374419e-8;
const keys = { temperatureK: 'metal-temperature-k', initialized: 'initialized', capacityJK: 'heat-capacity-j-k',
  gasBathK: 'gas-bath-temperature-k', coolantBathK: 'coolant-bath-temperature-k', surroundingsBathK: 'surroundings-bath-temperature-k',
  gasW: 'gas-heat-flow-w', coolantW: 'coolant-heat-flow-w', surroundingsW: 'surroundings-radiation-heat-flow-w',
  flameW: 'flame-radiation-heat-flow-w', netW: 'net-heat-flow-w', stepSeconds: 'step-seconds', storedJ: 'step-stored-energy-j',
  transferredJ: 'step-heat-transfer-j', residualJ: 'step-energy-residual-j', initializationJ: 'initialization-energy-j', balanceValid: 'heat-balance-valid' };
const trace = [], checks = [], summaries = [], logs = [], failures = [];
const maxErrors = { heatRateW: 0, nativeResidualJ: 0, independentlyReconstructedStepJ: 0, gasBathK: 0 };
let auditedSteps = 0, convergence;
const near = (a, b, name, absolute = 1e-7, relative = 2e-12) => assert.ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= absolute + relative * Math.max(Math.abs(a), Math.abs(b)), `${name}: ${a} vs ${b}`);
const heatRates = (state, name) => {
  const p = config[name], t = state[name].temperatureK, n2 = (state.n2Pct / 100) ** 2;
  const gasBathK = name === 'core' ? state.egtC + 273.15 : state.gasK;
  const coolantBathK = state.ambientK + 100 * n2;
  return { gasBathK, coolantBathK, surroundingsBathK: state.ambientK,
    gasW: (p.gasConductanceWK[0] + p.gasConductanceWK[1] * n2) * (gasBathK - t),
    coolantW: (p.coolantConductanceWK[0] + p.coolantConductanceWK[1] * n2) * (coolantBathK - t),
    surroundingsW: sigma * p.areaM2 * p.emissivity * (state.ambientK ** 4 - t ** 4),
    flameW: state.augmentation ? sigma * p.flameAreaM2 * p.flameEmissivity * (gasBathK ** 4 - t ** 4) : 0 };
};
async function scenario(name, initial, run, hz = 120) {
  if (selected && !selected.includes(name)) return;
  const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl, persistence: { enabled: false }, log: { console: false } });
  sdk.on('stderr', ({ message }) => logs.push(name + ': ' + message));
  try {
    for (const [file, bytes] of files) sdk.writeDataFile(file, bytes.toString('utf8'));
    const initialOptions = engineTestStandBootstrapOptions(initial);
    await bootstrapAircraft(sdk, 'f-35b', initialOptions);
    sdk.setDt(1 / hz); sdk.setHoldDown(true);
    const get = p => sdk.getPropertyValue(p), set = (p, v) => sdk.setPropertyValue(p, v);
    assert.ok(sdk.queryPropertyCatalog('/thermal/').includes('step-energy-residual-j (R)'), 'Adopt the native heat-accounting SDK');
    const control = createEngineControl(sdk, getFdmProfile('f-35b'));
    const read = phase => ({ scenario: name, phase, timeS: sdk.getSimTime(),
      ambientK: get('propulsion/tat-c') + 273.15, pressurePsf: get('propulsion/pt-lbs_sqft'),
      egtC: get('propulsion/engine/egt-degc'), gasK: get('propulsion/engine/thermal/nozzle-gas-temperature-k'),
      fuelKgSec: get('propulsion/engine/fuel-flow-rate-pps') * .45359237,
      suppliedAbKgSec: get('propulsion/engine/thermal/afterburner-fuel-flow-kg-sec'),
      burnedAbKgSec: get('propulsion/engine/thermal/afterburner-burned-fuel-flow-kg-sec'),
      n1Pct: get('propulsion/engine/n1'), n2Pct: get('propulsion/engine/n2'),
      running: get('propulsion/engine/set-running'), augmentation: get('propulsion/engine/augmentation'),
      nozzleNorm: get('propulsion/engine/nozzle-pos-norm'), nozzlePitchRad: get('fcs/nozzle-pitch-rad'),
      conversion: get('fcs/stovl-pos-norm'), valid: get('propulsion/engine/thermal/valid'),
      ...Object.fromEntries(Object.entries(config).map(([solid, cfg]) => [solid,
        Object.fromEntries(Object.entries(keys).map(([key, property]) => [key, get(cfg.prefix + property)]))])) });
    const initialRow = read('initial-zero-time'); trace.push(initialRow);
    const totals = Object.fromEntries(Object.keys(config).map(n => [n, { storedJ: 0, transferredJ: 0, initializationJ: 0, signedGasJ: 0, signedCoolantJ: 0, signedSurroundingsJ: 0, signedFlameJ: 0, maxStepResidualJ: 0 }]));
    let prior = initialRow, count = 0, lastPhase;
    function audit(row) {
      assert.equal(row.valid, 1); near(row.timeS - prior.timeS, 1 / hz, 'Accepted native time increment', 1e-9);
      const mass = 120 * (row.n2Pct / 100) ** 2 * row.pressurePsf / 2116.22 * Math.sqrt(288.15 / row.ambientK);
      const expectedGas = mass > 0 ? 298.15 + (mass * gasConfig.cp * (row.egtC + 273.15 - 298.15) + gasConfig.efficiency * row.burnedAbKgSec * gasConfig.lhv)
        / ((mass + row.suppliedAbKgSec) * gasConfig.cp) : row.egtC + 273.15;
      near(row.gasK, expectedGas, 'Independent gas-bath energy estimate');
      maxErrors.gasBathK = Math.max(maxErrors.gasBathK, Math.abs(row.gasK - expectedGas));
      row.suppliedFuelChemicalPowerW = row.fuelKgSec * gasConfig.lhv;
      row.afterburnerReleasedHeatW = gasConfig.efficiency * row.burnedAbKgSec * gasConfig.lhv;
      for (const solid of Object.keys(config)) {
        const actual = row[solid], previous = prior[solid], rates = heatRates(row, solid), total = totals[solid];
        assert.equal(actual.initialized, 1); near(actual.capacityJK, config[solid].capacityJK, 'Declared constant capacity');
        for (const key of ['gasBathK', 'coolantBathK', 'surroundingsBathK', 'gasW', 'coolantW', 'surroundingsW', 'flameW']) {
          near(actual[key], rates[key], `${solid}/${key}`, 1e-6);
          if (key.endsWith('W')) maxErrors.heatRateW = Math.max(maxErrors.heatRateW, Math.abs(actual[key] - rates[key]));
        }
        const net = rates.gasW + rates.coolantW + rates.surroundingsW + rates.flameW;
        near(actual.netW, net, solid + ' signed rate sum', 1e-6);
        const stateDeltaJ = config[solid].capacityJK * (actual.temperatureK - previous.temperatureK);
        near(stateDeltaJ, actual.storedJ + actual.initializationJ, solid + ' state energy including explicit initialization', 1e-5);
        if (actual.balanceValid) {
          near(actual.stepSeconds, 1 / hz, solid + ' native integration interval');
          const independentlyIntegratedJ = net / hz;
          near(actual.transferredJ, independentlyIntegratedJ, solid + ' independent signed quadrature', 1e-6);
          near(actual.storedJ, independentlyIntegratedJ, solid + ' local stored energy residual', 1e-5);
          maxErrors.independentlyReconstructedStepJ = Math.max(maxErrors.independentlyReconstructedStepJ, Math.abs(actual.storedJ - independentlyIntegratedJ));
          for (const [term, key] of [['Gas','gasW'],['Coolant','coolantW'],['Surroundings','surroundingsW'],['Flame','flameW']]) total['signed' + term + 'J'] += rates[key] / hz;
        } else {
          assert.equal(actual.stepSeconds, 0); assert.equal(actual.storedJ, 0); assert.equal(actual.transferredJ, 0);
          assert.equal(previous.initialized, 0, 'Only new warm initialization may skip a positive transient step');
        }
        near(actual.residualJ, actual.storedJ - actual.transferredJ, 'Native receipt residual');
        maxErrors.nativeResidualJ = Math.max(maxErrors.nativeResidualJ, Math.abs(actual.residualJ));
        total.maxStepResidualJ = Math.max(total.maxStepResidualJ, Math.abs(actual.residualJ));
        for (const key of ['storedJ', 'transferredJ', 'initializationJ']) total[key] += actual[key];
      }
      if (name === 'powered-lift') assert.equal(row.augmentation, 0, 'Every powered-lift fixed step inhibits AB');
      auditedSteps++;
    }
    const step = (phase, held = false) => {
      prior = read('before-step'); control.step(held); assert.equal(sdk.run(), true);
      const row = read(phase); audit(row);
      if (++count % Math.max(1, Math.round(sampleSeconds * hz)) === 0 || phase !== lastPhase) trace.push(row);
      lastPhase = phase; return row;
    };
    const advance = (phase, seconds, throttle, held = false) => {
      if (throttle !== undefined) set('fcs/throttle-cmd-norm', throttle);
      let row; for (let i = 0; i < Math.round(seconds * hz); i++) row = step(phase, held);
      trace.push(row); return row;
    };
    const start = (phase = 'starter') => {
      let row; for (let i = 0; i < 60 * hz; i++) { row = step(phase, true); if (row.running) break; }
      assert.equal(row.running, 1, 'Native starter failed'); trace.push(row); return row;
    };
    const result = await run({ sdk, get, set, control, read, step, advance, start, initialRow });
    for (const [solid, total] of Object.entries(totals)) {
      total.accumulatedResidualJ = total.storedJ - total.transferredJ;
      near(total.storedJ, total.transferredJ, solid + ' accumulated local energy', .01);
    }
    summaries.push({ name, hz, initialOptions, initial: initialRow, final: read('final'), totals, result });
    checks.push({ name, passed: true });
  } catch (error) { checks.push({ name, passed: false, error: error.stack ?? String(error) }); failures.push(name + ': ' + error.message); }
  finally { sdk.destroy(); }
}

await scenario('cold-cycle', 'cold', ({ initialRow, advance, start, control }) => {
  assert.equal(initialRow.running, 0); assert.equal(initialRow.fuelKgSec, 0);
  assert.equal(initialRow.core.initialized, 0); assert.equal(initialRow.liner.initialized, 0);
  const soaked = advance('cold-soak', 5, 0);
  near(soaked.core.temperatureK, soaked.ambientK, 'Cold core soak'); near(soaked.liner.temperatureK, soaked.ambientK, 'Cold liner soak');
  const started = start();
  assert.ok(started.core.temperatureK < started.gasK && started.liner.temperatureK < started.gasK, 'Native startup must retain finite thermal lag');
  const idle = advance('idle', 60, 0), dry = advance('dry99-before-ab', 120, .99), ab = advance('afterburner', 60, 1);
  assert.equal(dry.augmentation, 0); assert.equal(ab.augmentation, 1);
  const returnedDry = advance('dry99-after-ab', 120, .99);
  for (const name of Object.keys(config)) near(returnedDry[name].temperatureK, dry[name].temperatureK, name + ' hot/cold dry equilibrium', 1);
  control.shutdown(); const cutoff = advance('shutdown', 1, 0), cooled = advance('cooling', 180, 0);
  assert.equal(cutoff.running, 0); assert.equal(cooled.running, 0); assert.equal(cooled.fuelKgSec, 0);
  for (const name of Object.keys(config)) assert.ok(cooled[name].temperatureK < cutoff[name].temperatureK && cooled[name].temperatureK > cooled.ambientK);
  return { soaked, started, idle, dry, ab, returnedDry, cutoff, cooled };
});
await scenario('running-initialization', 'running', ({ initialRow, step, advance }) => {
  assert.equal(initialRow.running, 1); assert.equal(initialRow.core.initialized, 0); assert.equal(initialRow.liner.initialized, 0);
  const seeded = step('explicit-running-equilibrium-seed');
  for (const name of Object.keys(config)) {
    assert.ok(seeded[name].initializationJ > 0); assert.equal(seeded[name].balanceValid, 0); assert.equal(seeded[name].transferredJ, 0);
    near(seeded[name].netW, 0, 'Warm equilibrium endpoint net power', 1e-6);
  }
  const idle = advance('already-running-idle', 10, 0);
  return { seeded, idle, interpretation: 'The explicit running shortcut assigns initial stored energy; its first-step temperature change is not a cold-start heat transient.' };
});
await scenario('hot-restart', 'cold', ({ advance, start, control }) => {
  advance('cold-soak', 1, 0); start('first-cold-starter'); advance('first-dry99', 80, .99); advance('first-afterburner', 30, 1);
  control.shutdown(); const hot = advance('hot-stopped', 20, 0);
  assert.equal(hot.running, 0); assert.equal(hot.fuelKgSec, 0);
  for (const name of Object.keys(config)) assert.ok(hot[name].temperatureK > hot.ambientK + 100);
  const restarted = start('hot-starter');
  for (const name of Object.keys(config)) assert.equal(restarted[name].initializationJ, 0, 'Hot restart must not seed a new equilibrium');
  const idle = advance('hot-restarted-idle', 30, 0);
  return { hot, restarted, idle };
});
await scenario('lifecycle', 'cold', ({ sdk, get, set, read, step, advance, start, control }) => {
  step('cold-first-step'); start(); advance('hot-dry', 30, .99);
  const before = read('before-pauses');
  const same = label => { const row = read(label); near(row.timeS, before.timeS, label + ' simulation time'); for (const n of Object.keys(config)) near(row[n].temperatureK, before[n].temperatureK, label + '/' + n); trace.push(row); return row; };
  for (let i = 0; i < 200; i++) same('render-only-read');
  sdk.hold(); try { for (let i = 0; i < 20; i++) sdk.run(); } finally { sdk.resume(); } same('native-hold');
  sdk.suspendIntegration(); try { for (let i = 0; i < 20; i++) sdk.run(); } finally { sdk.resumeIntegration(); }
  const suspended = same('suspended');
  for (const n of Object.keys(config)) { assert.equal(suspended[n].transferredJ, 0); assert.equal(suspended[n].initializationJ, 0); }
  sdk.runIc(); set('propulsion/set-running', -1); sdk.runIc(); same('zero-time-running-shortcut');
  const snapshot = captureSimulation(sdk); advance('changed-after-snapshot', 5, 1); restoreSimulation(sdk, snapshot); same('snapshot-restored'); step('restored-next-step');
  control.shutdown(); advance('stopped-before-location', 20, 0); const stopped = read('stopped-before-location');
  resetFlightLocation(sdk, { latDeg: 46.8, lonDeg: -92.1, altMeters: 300,
    flightPreset: { mode: 'departure', headingDeg: 90, groundElevationMeters: 300, flightPathDeg: 0 } }, 300, 'f-35b', { holdDown: true });
  sdk.setHoldDown(true); const relocated = read('stopped-relocated'); trace.push(relocated);
  for (const n of Object.keys(config)) near(relocated[n].temperatureK, stopped[n].temperatureK, 'Location retained ' + n);
  const next = advance('stopped-relocated-step', 1, 0); assert.equal(next.running, 0); assert.equal(next.fuelKgSec, 0);
  for (const n of Object.keys(config)) assert.ok(Math.abs(next[n].temperatureK - relocated[n].temperatureK) < .03 * relocated[n].temperatureK);
  sdk.resetToInitialConditions(2); for (const n of Object.keys(config)) { assert.equal(get(config[n].prefix + 'initialized'), 0); near(get(config[n].prefix + 'metal-temperature-k'), get('propulsion/tat-c') + 273.15, 'Cold reset'); }
  return { before, stopped, relocated, next, renderOnlyReads: 200, note: 'Receipts are accumulated on accepted native steps only. Repeated cached hold/read receipts are not additional heat.' };
});
await scenario('powered-lift', 'cold', ({ step, start, set, advance }) => {
  step('cold-first-step'); start(); set('fcs/stovl-cmd-norm', 1); const lifted = advance('powered-lift-full-command', 90, 1);
  assert.equal(lifted.augmentation, 0); assert.ok(lifted.conversion > .99); assert.ok(lifted.fuelKgSec > 0);
  assert.ok(trace.filter(row => row.scenario === 'powered-lift').every(row => row.augmentation === 0));
  return { lifted, note: 'AB remains inhibited; physical gas optical diagnostics may contain explicitly bounded dry emission.' };
});

if (!selected || selected.includes('convergence')) {
  const durations = 30, referenceHz = 1920;
  const numerical = [];
  for (const hz of [30, 60, 120, 240]) {
    // A separate name gives the report its exact step rate without changing the
    // user's 120 Hz application scheduler. Selection is local to this case.
    const name = `cooling-convergence-${hz}`;
    if (selected) selected.push(name);
    await scenario(name, 'cold', ({ set, step, advance }) => {
      const ambient = step('ambient-first-step').ambientK;
      for (const p of Object.values(config)) set(p.prefix + 'metal-temperature-state-k', 1000);
      const final = advance('constant-bath-cooling', durations, 0);
      numerical.push({ hz, ambientK: ambient, coreK: final.core.temperatureK, linerK: final.liner.temperatureK });
      return { initialSolidK: 1000, ambientK: ambient, durationSeconds: durations };
    }, hz);
  }
  try {
    assert.equal(numerical.length, 4);
    const ambient = numerical[0].ambientK;
    const reference = frequency => Object.fromEntries(Object.entries(config).map(([name, p]) => {
      // Independent explicit RK4 solution of constant-bath nonlinear cooling;
      // no native recurrence, nozzle fuel model or receipt is used here.
      const f = t => ((p.gasConductanceWK[0] + p.coolantConductanceWK[0]) * (ambient - t)
        + sigma * p.areaM2 * p.emissivity * (ambient ** 4 - t ** 4)) / p.capacityJK;
      const h = 1 / frequency; let t = 1000;
      for (let i = 0; i < durations * frequency; i++) { const k1 = f(t), k2 = f(t + h * k1 / 2), k3 = f(t + h * k2 / 2), k4 = f(t + h * k3); t += h * (k1 + 2 * k2 + 2 * k3 + k4) / 6; }
      return [name + 'K', t];
    }));
    const coarseReference = reference(referenceHz), fineReference = reference(referenceHz * 2);
    for (const name of Object.keys(config)) {
      near(coarseReference[name + 'K'], fineReference[name + 'K'], 'Independent reference refinement', 1e-7);
      let previousError = Infinity;
      for (const row of numerical) { const error = Math.abs(row[name + 'K'] - fineReference[name + 'K']); row[name + 'ErrorK'] = error; assert.ok(error < previousError, name + ' native timestep error must decrease'); previousError = error; }
      assert.ok(previousError < .01, 'Finest cooling result deviates from the independent ODE solution');
    }
    convergence = { durationSeconds: durations, initialSolidK: 1000, ambientK: ambient, referenceHz, refinementHz: referenceHz * 2, coarseReference, fineReference, numerical,
      scope: 'Backward-Euler convergence for the actual two F135 constant-bath cooling equations; coefficients are held by off/stationary/native state. This is a numerical test, not calibration.' };
    checks.push({ name: 'convergence', passed: true });
  } catch (error) { checks.push({ name: 'convergence', passed: false, error: error.stack }); failures.push('convergence: ' + error.message); }
}
for (const name of selected ?? []) if (!checks.some(c => c.name === name)) failures.push('Unknown or unexecuted case: ' + name);
const finalSourceHashes = Object.fromEntries(await Promise.all(Object.keys(sourceHashes).map(async f => [f, hash(await readFile(path.join(root, f)))])));
const finalDataHashes = Object.fromEntries(await Promise.all(Object.keys(dataHashes).map(async f => [f, hash(await readFile(path.join(root, 'public/jsbsim-data', f)))])));
const sourceIdentityStable = isDeepStrictEqual(sourceHashes, finalSourceHashes) && isDeepStrictEqual(dataHashes, finalDataHashes)
  && scriptSha256 === hash(await readFile(fileURLToPath(import.meta.url))) && isDeepStrictEqual(artifact, await verifyInstalledSdk(root));
if (!sourceIdentityStable) failures.push('Inputs changed during qualification');
for (const row of trace) {
  const dimensions = helpers.nozzleApertureGeometry(row.nozzleNorm, helpers.F135_ENGINE_GEOMETRY.aperture);
  const gas = helpers.evaluateEngineGasOptics(opticalProfile, { temperatureKelvin: row.gasK, augmentation: Boolean(row.augmentation),
    fuelFlowKgPerSecond: row.fuelKgSec, afterburnerBurnedFuelFlowKgPerSecond: row.burnedAbKgSec,
    radiusMeters: dimensions.exitRadius, lengthMeters: 6 * (row.augmentation ? .7 + .3 * Math.min(1, Math.max(0, row.n2Pct / 100)) : .2) });
  row.optical = { mode: gas.mode, valid: Number(gas.valid), radiusM: dimensions.exitRadius, throatAreaM2: dimensions.throatArea, exitAreaM2: dimensions.exitArea,
    absorptionPerMeter: gas.absorptionPerMeter, emittingVolumeM3: gas.emittingVolumeM3, fuelPowerW: gas.fuelPowerW,
    particlePowerBoundW: gas.particlePowerUpperBoundW, excitedPowerW: gas.excitedPowerW, sourcePowerBoundW: gas.totalSourcePowerUpperBoundW,
    sourceCdM3R: gas.sourceRgbCdPerM3[0], sourceCdM3G: gas.sourceRgbCdPerM3[1], sourceCdM3B: gas.sourceRgbCdPerM3[2] };
  for (const name of Object.keys(config)) {
    const rgb = helpers.interpolateGasBlackbody({ blackbody: opticalProfile.surfaceEmission }, row[name].temperatureK) ?? [0, 0, 0];
    for (const [c, k] of ['R','G','B'].entries()) row[name]['emissionCdM2' + k] = rgb[c];
    row[name].emissionLuminanceCdM2 = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  }
}
const report = { schemaVersion: 1, artifact, sourceHashes, dataHashes, sourceIdentityStable, scriptSha256,
  sampleSeconds, auditedSteps, maxErrors, checks, summaries, convergence, config, gasConfig, traceEntries: trace.length, traceFile: 'trace.csv', failures, pass: failures.length === 0,
  units: { temperature: 'K', capacity: 'J/K', signedRate: 'W positive into solid', energy: 'J', time: 's', fuel: 'kg/s' },
  optics: { profileId: opticalProfile.id, provenanceFile: opticalFile, dimensions: 'Same pure rigid nozzle aperture helper and N2-driven visual volume length as the runtime. Assumed geometry and fuel fractions are not measured radiometry.',
    displayReference: { intensity: 1, gasReferenceNits: 1000, surfaceReferenceNits: 1000, exposure: null, explanation: 'Declared default display parameters only. This headless native trace has no renderer, exposure or scene; no display parameter enters physical temperature, fuel or emitted power.' },
    surfaceEmission: 'Absolute grey-body table includes its declared spectral/grey emissivity; this optical evaluation does not subtract extra heat from the native solid or assert full spectral/bolometric model closure.' },
  interpretation: 'Local discrete constant-capacity solid energy balances with imposed reservoirs; initialization is externally assigned energy. No global engine energy closure.',
  limitations: ['F135 gas baths, effective capacities, conductances, areas and bolometric emissivities are provisional profile inputs, not measured F135 values.',
    'Core 1800 J/K and liner 12000 J/K are effective lumped capacities, not masses derived from the rendered shells. No density or alloy heat-capacity calibration is supplied.',
    'There is no direct inter-solid conduction, coolant flow depletion, gas enthalpy subtraction, material C(T), dissociation or spectral-radiation feedback.',
    'First running initialization may jump to equilibrium intentionally; true cold start and retained hot restart are separate traces.',
    'Native hold can retain the last cached receipt; this tool never accumulates repeated reads without accepted simulation time.',
    'No browser, GPU, photographed-color, acoustic, performance or global-energy qualification.'] };
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const common = ['timeS','ambientK','egtC','gasK','n1Pct','n2Pct','fuelKgSec','suppliedAbKgSec','burnedAbKgSec','running','augmentation','nozzleNorm','nozzlePitchRad','conversion','suppliedFuelChemicalPowerW','afterburnerReleasedHeatW'];
const columns = ['scenario','phase',...common,...Object.keys(config).flatMap(n => [...Object.keys(keys),'emissionCdM2R','emissionCdM2G','emissionCdM2B','emissionLuminanceCdM2'].map(k => n + '.' + k)),...Object.keys(trace[0]?.optical ?? {}).map(k => 'optical.' + k)];
await writeFile(path.join(out, 'trace.csv'), [columns.join(','), ...trace.map(row => columns.map(c => c.includes('.') ? row[c.split('.')[0]][c.split('.')[1]] : row[c]).join(','))].join('\n') + '\n');
await writeFile(path.join(out, 'sdk.log'), logs.join('\n') + '\n');
console.log(JSON.stringify({ out, pass: report.pass, checks, auditedSteps, maxErrors, convergence, sourceIdentityStable }, null, 2));
if (!report.pass) process.exitCode = 1;
