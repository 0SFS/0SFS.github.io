#!/usr/bin/env node
// 0sfs owns this aircraft-specific CPU trajectory and force/weight audit.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';
import { newOutputDirectory } from '../../outputDirectory.mjs';
import { verifyInstalledSdk } from '../../verify-jsbsim-artifact.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/validation/f35b/check-f135-powered-lift.mjs [--cases=steady-1,idle-entry] [--algorithm=reduced|component] [--model=plant|empirical] [--hz=60|120|240]');
  process.exit(0);
}
assert.ok(args.every(arg => /^(--cases=|--algorithm=|--hz=|--model=)/.test(arg)));
const option = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const hz = Number(option('hz', '120'));
assert.ok([60, 120, 240].includes(hz));
const algorithm = option('algorithm', 'reduced');
assert.ok(['reduced', 'component'].includes(algorithm));
const engineModel = option('model', 'plant');
assert.ok(['plant', 'empirical'].includes(engineModel));
const out = newOutputDirectory('validation', 'f135-powered-lift');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
await writeFile(path.join(out, 'runner-source.mjs'), await readFile(fileURLToPath(import.meta.url)));
const artifact = await verifyInstalledSdk(root);
const appCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const entry = path.join(out, 'helpers.ts');
await writeFile(entry, [
  ['bootstrapAircraft', 'src/flight/jsbsim/bootstrapC172.ts'],
  ['getFdmProfile', 'src/flight/jsbsim/fdmProfiles.ts'],
  ['resolveAircraftDataFiles', 'src/flight/jsbsim/hydrateJsbsimData.ts'],
].map(([name, file]) => `export { ${name} } from ${JSON.stringify(path.join(root, file))};`).join('\n')
  + `\nexport { JSBSimSdk } from '@felipegalind0/jsbsim';\nexport { wasmBinaryUrl, wasmModuleUrl } from '@felipegalind0/jsbsim/wasm';\n`);
const bundle = await rolldown({ input: entry, external: id => !id.startsWith('.') && !path.isAbsolute(id),
  plugins: [{ name: 'base-url', transform(code) { return code.includes('import.meta.env.BASE_URL')
    ? { code: code.replaceAll('import.meta.env.BASE_URL', JSON.stringify('/')), map: null } : null; } }] });
let built;
try { built = await bundle.write({ file: path.join(out, 'helpers.mjs'), format: 'esm' }); }
finally { await bundle.close(); }
const h = await import(pathToFileURL(path.join(out, 'helpers.mjs')));
const manifest = JSON.parse(await readFile(path.join(root, 'public/jsbsim-data/manifest.json'), 'utf8'));
const dataFiles = h.resolveAircraftDataFiles(manifest, h.getFdmProfile('f-35b', engineModel).dataPackage ?? 'f-35b');
const inputs = [];
const bundledSources = built.output.flatMap(chunk => chunk.type === 'chunk' ? Object.keys(chunk.modules) : [])
  .filter(file => path.isAbsolute(file) && file.startsWith(root) && !file.startsWith(out)).map(file => path.relative(root, file));
for (const file of new Set(['scripts/validation/f35b/check-f135-powered-lift.mjs', 'public/jsbsim-data/manifest.json',
  ...bundledSources, ...dataFiles.map(file => 'public/jsbsim-data/' + file)]))
  inputs.push({ path: file, sha256: sha256(await readFile(path.join(root, file))) });

// Engineering gates declared before tuning, not manufacturer specifications.
const gates = { observationSeconds: 60, settlingDeadlineSeconds: 20, n1PeakToPeakPercent: 1,
  n2PeakToPeakPercent: 1, totalGrossPeakToPeakFraction: .02, energyRelative: 1e-5,
  massRelative: 1e-6, failedAttempts: 0 };
const cases = [
  ...[.98, .99, 1].map(throttle => ({ name: `steady-${throttle}`, throttle, conversion: 1, altFt: 5000 })),
  { name: 'steady-sea-level', throttle: 1, conversion: 1, altFt: 0 },
  { name: 'idle-entry', throttle: 0, conversion: 0, altFt: 5000, entry: true },
  { name: 'idle-entry-sea-level', throttle: 0, conversion: 0, altFt: 0, entry: true },
  { name: 'idle-entry-hot', throttle: 0, conversion: 0, altFt: 0, entry: true, deltaTK: 30 },
  { name: 'steady-hot', throttle: 1, conversion: 1, altFt: 0, deltaTK: 30 },
  { name: 'steady-cold', throttle: 1, conversion: 1, altFt: 0, deltaTK: -30 },
  ...[-.01, .01].map(perturb => ({ name: `perturb-${perturb}`, throttle: 1, conversion: 1, altFt: 0, perturb })),
  ...[0, .01, .1, .25, .5, .75].map(conversion => ({ name: `conversion-${conversion}`, throttle: .99, conversion, altFt: 5000 })),
  { name: 'held-wind-60kt', throttle: 1, conversion: 1, altFt: 5000, windFps: 60 * 1.687809857 },
  { name: 'free-hot-low-fuel', throttle: 1, conversion: 1, altFt: 1000, free: true, deltaTK: 30, fuel: .15 },
  { name: 'free-hot-20-fuel', throttle: 1, conversion: 1, altFt: 1000, free: true, deltaTK: 30, fuel: .20 },
  { name: 'ground-20-fuel', throttle: 1, conversion: 1, altFt: 10, free: true, ground: true, fuel: .20 },
  { name: 'ground-entry', throttle: 0, conversion: 0, altFt: 10, free: true, ground: true, fuel: .20, entry: true },
  { name: 'partial-10-60kt', throttle: .99, conversion: .1, altFt: 5000, free: true, speed: 60 },
  ...[.2, .3].map(fuel => ({ name: `held-fuel-${fuel}`, throttle: 1, conversion: 1, altFt: 5000, fuel })),
  { name: 'level-hover', throttle: .97, conversion: 1, altFt: 5000, free: true, fuel: .2, matchWeight: true },
  { name: 'level-hover-fixed-load', throttle: .97, conversion: 1, altFt: 5000, free: true, fuel: .2,
    matchWeight: true, fixedFuel: true },
  { name: 'level-hover-rotating-frame', throttle: .97, conversion: 1, altFt: 5000, free: true, fuel: .2,
    matchVerticalAcceleration: true, fixedFuel: true },
  { name: 'matched-empirical-5000ft', throttle: .97, conversion: 1, altFt: 5000,
    matchAppliedLbf: 34361.962387464075, targetBasis: 'empirical full-demand held fixture, fork.20, ISA, 5000 ft, same 37000 lb mass and CG' },
  { name: 'matched-empirical-sea-level', throttle: .97, conversion: 1, altFt: 0,
    matchAppliedLbf: 39169.59542860636, targetBasis: 'empirical full-demand held fixture, fork.20, ISA, sea level, same 37000 lb mass and CG' },
  { name: 'free-full', throttle: 1, conversion: 1, altFt: 1000, free: true },
  { name: 'free-entry-60kt', throttle: .99, conversion: 0, altFt: 5000, free: true, entry: true, speed: 60 },
  { name: 'free-entry-idle', throttle: 0, conversion: 1, altFt: 5000, free: true, entry: true },
  { name: 'free-attached', throttle: 1, conversion: 1, altFt: 1000, free: true, attached: true },
];
const selected = option('cases', 'steady-1').split(',');
assert.ok(selected.every(name => cases.some(c => c.name === name)));
const P = 'propulsion/engine/plant/';
const channel = engineModel === 'plant' ? { n1: P + 'shaft/n1-percent', n2: P + 'shaft/n2-percent',
  main: P + 'nozzle/gross-thrust-lbs', fan: P + 'lift-fan/gross-thrust-lbs',
  left: P + 'roll-post[0]/gross-thrust-lbs', right: P + 'roll-post[1]/gross-thrust-lbs' }
  : { n1: 'propulsion/engine/n1', n2: 'propulsion/engine/n2', main: 'propulsion/engine/thrust-lbs',
    fan: 'propulsion/engine[1]/thrust-lbs', left: 'propulsion/engine[2]/thrust-lbs', right: 'propulsion/engine[3]/thrust-lbs' };
const stats = values => {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values), max = Math.max(...values);
  return { min, max, mean, peakToPeak: max - min,
    rmsRipple: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length),
    endMinusStart: values.at(-1) - values[0] };
};
const results = [];
for (const c of cases.filter(c => selected.includes(c.name))) {
  const sdk = await h.JSBSimSdk.create({ moduleUrl: h.wasmModuleUrl, wasmUrl: h.wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false } });
  try {
    for (const file of dataFiles) sdk.writeDataFile(file, await readFile(path.join(root, 'public/jsbsim-data', file), 'utf8'));
    if (c.deltaTK) sdk.setPropertyValue('atmosphere/delta-T', c.deltaTK * 1.8);
    // FCS components cache their timestep when the model loads. Set the fixture
    // rate before bootstrap, then restore it below after bootstrap's normal app
    // rate and zero-time initialization. Setting it only afterward changes the
    // plant rate while leaving actuator rates at 120 Hz.
    sdk.setDt(1 / hz);
    await h.bootstrapAircraft(sdk, 'f-35b', { altFt: c.altFt, airspeedKts: c.speed ?? 0, holdDown: !c.free,
      throttleNorm: c.throttle, latDeg: 0, lonDeg: 0, headingDeg: 0, engineModel });
    for (const index of [2, 3]) sdk.setPropertyValue(`stores/external-tank[${index - 2}]/attached`, c.attached ? 1 : 0);
    if (c.fuel !== undefined) for (const index of [0, 1, 2, 3])
      sdk.setPropertyValue(`propulsion/tank[${index}]/contents-lbs`, index < 2 ? 6550 * c.fuel : c.attached ? 2991 * c.fuel : 0);
    if (c.ground) sdk.setPropertyValue('ic/terrain-elevation-ft', 0);
    if (c.windFps) {
      sdk.setPropertyValue('ic/vw-mag-fps', c.windFps);
      sdk.setPropertyValue('ic/vw-dir-deg', 180);
    }
    // Frozen fuel is an explicit fixed-load isolation fixture. Free flight burns fuel.
    for (const name of ['theta', 'alpha', 'gamma']) sdk.setPropertyValue(`ic/${name}-deg`, 0);
    sdk.setPropertyValue('fcs/pitch-trim-cmd-norm', 0);
    sdk.setPropertyValue('fcs/stovl-cmd-norm', c.conversion);
    sdk.setPropertyValue('fcs/stovl-pos-norm', c.conversion);
    assert.equal(sdk.runIc(), true);
    sdk.setPropertyValue('propulsion/set-running', -1);
    sdk.setPropertyValue('fcs/stovl-cmd-norm', c.conversion);
    sdk.setPropertyValue('fcs/stovl-pos-norm', c.conversion);
    assert.equal(sdk.runIc(), true);
    let appliedThrottle = c.throttle;
    if (c.matchWeight || c.matchAppliedLbf || c.matchVerticalAcceleration) {
      // A diagnostic trim at the declared load, not a production thrust multiplier.
      let low = .8, high = .99;
      for (let i = 0; i < 24; i++) {
        appliedThrottle = (low + high) / 2;
        sdk.setPropertyValue('fcs/throttle-cmd-norm', appliedThrottle);
        assert.equal(sdk.runIc(), true);
        const net = c.matchVerticalAcceleration ? -sdk.getPropertyValue('accelerations/wdot-ft_sec2')
          : -sdk.getPropertyValue('forces/fbz-total-lbs')
            - (c.matchAppliedLbf ?? sdk.getPropertyValue('forces/fbz-weight-lbs'));
        if (net > 0) high = appliedThrottle; else low = appliedThrottle;
      }
    }
    sdk.setDt(1 / hz);
    sdk.setPropertyValue('propulsion/fuel_freeze', c.free && !c.fixedFuel ? 0 : 1);
    // Native fuel_freeze is write-only; verify tank mass from the trace instead.
    if (engineModel === 'plant') {
      assert.ok(sdk.getPropertyCatalog().some(line => line.startsWith(P + 'settings/algorithm ')));
      sdk.setPropertyValue(P + 'settings/algorithm', algorithm === 'reduced' ? 1 : 0);
      assert.equal(sdk.getPropertyValue(P + 'settings/algorithm'), algorithm === 'reduced' ? 1 : 0);
    }
    if (c.perturb) {
      for (const name of ['omega-lp-rad-sec', 'omega-hp-rad-sec']) {
        const property = P + 'state/' + name;
        assert.ok(sdk.getPropertyCatalog().some(line => line.startsWith(property + ' ')), property);
        sdk.setPropertyValue(property, sdk.getPropertyValue(property) * (1 + c.perturb));
      }
      sdk.setPropertyValue(P + 'state/commit', 1);
      assert.equal(sdk.getPropertyValue(P + 'state/commit'), 1);
    }
    const properties = sdk.getPropertyCatalog().map(line => line.replace(/\s+\([RW]+\)$/, '')).filter(name =>
      (/^propulsion\//.test(name) && (!name.includes('/state/') || /integrator|sensed/.test(name)))
      || /^(forces|moments|accelerations|inertia|velocities|attitude|position|atmosphere|aero|external_reactions|fcs|stores)\//.test(name));
    const rows = [], scalar = [];
    const sample = () => {
      const values = properties.map(name => sdk.getPropertyValue(name));
      const get = name => sdk.getPropertyValue(name);
      rows.push([get('simulation/sim-time-sec'), ...values]);
      const s = Object.fromEntries(Object.entries(channel).map(([key, name]) => [key, get(name)]));
      scalar.push({ ...s, gross: s.main + s.fan + s.left + s.right, t: get('simulation/sim-time-sec'),
        conversion: get('fcs/stovl-pos-norm'),
        failure: get(P + 'numerics/failure'), energy: get(P + 'ledger/energy-relative'), mass: get(P + 'ledger/mass-relative'),
        used: get(P + 'numerics/algorithm'), fallback: get(P + 'numerics/fallback-reason'),
        stepUsed: engineModel === 'plant' ? get(P + 'numerics/step-algorithm') : null,
        iterations: get(P + 'numerics/iterations'), sequence: get(P + 'numerics/sequence'),
        ab: get('propulsion/engine/augmentation') });
    };
    sample();
    for (let step = 0; step < 80 * hz; step++) {
      if (c.entry && step === 2 * hz) {
        sdk.setPropertyValue('fcs/throttle-cmd-norm', 1);
        sdk.setPropertyValue('fcs/stovl-cmd-norm', 1);
      }
      assert.equal(sdk.run(), true);
      sample();
    }
    const tail = scalar.filter(row => row.t >= 20);
    const conversionCompletedAtSeconds = c.entry ? scalar.find(row => row.t >= 2 && row.conversion >= 1 - 1e-12)?.t : null;
    // The hash-matched aircraft actuator is 0.4 normalized conversion per second.
    // This checks the actual FCS clock, not just the declared physics timestep.
    if (c.entry) assert.ok(Math.abs(conversionCompletedAtSeconds - (2 + (1 - c.conversion) / .4)) <= 2 / hz);
    const metrics = Object.fromEntries([...Object.keys(channel), 'gross'].map(key => [key, stats(tail.map(row => row[key]))]));
    const attempts = scalar.slice(1); // Zero-time initial publication is not a physics step.
    const failure = attempts.filter(row => row.failure).length;
    const numerical = engineModel === 'empirical' ? null : { failedAttempts: failure,
      acceptedSteps: attempts.filter(row => !row.failure).length,
      componentIntegrationSteps: attempts.filter(row => !row.failure && row.stepUsed === 0).length,
      componentPublicationSteps: attempts.filter(row => !row.failure && row.used === 0).length,
      fallbackSteps: attempts.filter(row => row.fallback !== 0).length,
      maxIterations: Math.max(...attempts.map(row => row.iterations)),
      worstEnergyRelative: Math.max(...attempts.map(row => row.energy)), worstMassRelative: Math.max(...attempts.map(row => row.mass)) };
    const passed = c.free || engineModel === 'empirical' ? null : metrics.n1.peakToPeak <= gates.n1PeakToPeakPercent
      && metrics.n2.peakToPeak <= gates.n2PeakToPeakPercent
      && metrics.gross.peakToPeak / metrics.gross.mean <= gates.totalGrossPeakToPeakFraction
      && !failure && numerical.worstEnergyRelative <= gates.energyRelative && numerical.worstMassRelative <= gates.massRelative
      && scalar.every(row => row.ab === 0);
    const bytes = gzipSync(['simulation/sim-time-sec,' + properties.join(','), ...rows.map(row => row.join(','))].join('\n') + '\n');
    await writeFile(path.join(out, c.name + '.csv.gz'), bytes);
    const result = { ...c, appliedThrottle, engineModel, algorithm, hz, gates, metrics, numerical, passed,
      conversionCompletedAtSeconds,
      initial: Object.fromEntries(properties.map((name, i) => [name, rows[0][i + 1]])),
      final: Object.fromEntries(properties.map((name, i) => [name, rows.at(-1)[i + 1]])),
      trace: { file: c.name + '.csv.gz', sha256: sha256(bytes), rows: rows.length, properties: properties.length } };
    results.push(result);
    console.error(JSON.stringify({ name: c.name, passed, metrics, numerical }));
    await writeFile(path.join(out, 'report.json'), JSON.stringify({ artifact, inputs, appCommit,
      executedBundleSha256: sha256(await readFile(path.join(out, 'helpers.mjs'))), hz, algorithm,
      assumptions: 'Not a captured user session. ISA/zero wind/zero speed/clean stores/profile-default tank loads unless each case explicitly overrides them. Held cases freeze fuel; free cases burn it unless fixedFuel is explicitly true. 20 s declared settling window, all 80 s retained. Fixed-input stability gate applies to held cases only; free trends need the force/weight/environment analysis.',
      results }, null, 2) + '\n');
  } finally { sdk.destroy(); }
}
console.log(path.relative(root, out));
