#!/usr/bin/env node
// 0sfs owns sensitivity experiments for its aircraft's provisional thermal data.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { newOutputDirectory } from '../../outputDirectory.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/validation/f35b/analyze-f135-thermal-uncertainty.mjs --report=<physical-thermal-report.json> [--out=build/new-directory]');
  process.exit(0);
}
assert.ok(args.every(a => /^(--report=|--out=)/.test(a)), 'Unknown option');
const option = name => { const items = args.filter(a => a.startsWith(name + '=')); assert.ok(items.length <= 1); return items[0]?.slice(name.length + 1); };
assert.ok(option('--report'), 'A retained physical thermal report is required');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const input = path.resolve(option('--report')), bytes = await readFile(input), report = JSON.parse(bytes);
assert.equal(report.pass, true); assert.equal(report.sourceIdentityStable, true);
const out = option('--out') ? path.resolve(option('--out')) : newOutputDirectory('validation', 'f135-thermal-uncertainty');
assert.ok(out.startsWith(path.join(root, 'build') + path.sep));
if (option('--out')) await mkdir(out);
const cycle = report.summaries.find(s => s.name === 'cold-cycle'); assert.ok(cycle);
const variations = [
  ['nominal', {}], ['capacity-half', { capacity: .5 }], ['capacity-double', { capacity: 2 }],
  ['gas-conductance-half', { gas: .5 }], ['gas-conductance-double', { gas: 2 }],
  ['coolant-conductance-half', { coolant: .5 }], ['coolant-conductance-double', { coolant: 2 }],
  ['radiating-area-half', { area: .5 }], ['radiating-area-double', { area: 2 }],
  ['bolometric-emissivity-0.4', { emissivity: .4 }], ['bolometric-emissivity-0.95', { emissivity: .95 }],
  ['gas-bath-minus-100K', { gasOffset: -100 }], ['gas-bath-plus-100K', { gasOffset: 100 }],
  ['coolant-rise-half', { coolantRise: .5 }], ['coolant-rise-double', { coolantRise: 2 }],
  ['flame-emissivity-zero', { flameEmissivity: 0 }], ['flame-emissivity-0.025', { flameEmissivity: .025 }],
  ['flame-emissivity-0.1', { flameEmissivity: .1 }],
];
const results = [];
for (const phase of ['idle', 'dry', 'ab']) {
  const row = cycle.result[phase];
  for (const [solid, p] of Object.entries(report.config)) {
    for (const [variation, multiplier] of variations) {
      const n = (row.n2Pct / 100) ** 2;
      const C = p.capacityJK * (multiplier.capacity ?? 1);
      const Hg = (p.gasConductanceWK[0] + p.gasConductanceWK[1] * n) * (multiplier.gas ?? 1);
      const Hc = (p.coolantConductanceWK[0] + p.coolantConductanceWK[1] * n) * (multiplier.coolant ?? 1);
      const Tg = (solid === 'core' ? row.egtC + 273.15 : row.gasK) + (multiplier.gasOffset ?? 0);
      const Tc = row.ambientK + 100 * n * (multiplier.coolantRise ?? 1), Ts = row.ambientK;
      const R = 5.670374419e-8 * p.areaM2 * (multiplier.area ?? 1) * (multiplier.emissivity ?? p.emissivity);
      const F = row.augmentation ? 5.670374419e-8 * p.flameAreaM2 * (multiplier.flameEmissivity ?? p.flameEmissivity) : 0;
      const rate = T => Hg * (Tg - T) + Hc * (Tc - T) + R * (Ts ** 4 - T ** 4) + F * (Tg ** 4 - T ** 4);
      let lo = Math.min(Tg, Tc, Ts), hi = Math.max(Tg, Tc, Ts);
      for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (rate(mid) > 0) lo = mid; else hi = mid; }
      const equilibriumK = (lo + hi) / 2;
      assert.ok(Math.abs(rate(equilibriumK)) < 1e-6);
      results.push({ phase, solid, variation, capacityJK: C, gasConductanceWK: Hg, coolantConductanceWK: Hc,
        gasBathK: Tg, coolantBathK: Tc, surroundingsBathK: Ts, equilibriumK,
        localRelaxationSeconds: C / (Hg + Hc + 4 * (R + F) * equilibriumK ** 3), residualW: rate(equilibriumK) });
    }
  }
}
const bounds = ['idle', 'dry', 'ab'].flatMap(phase => Object.keys(report.config).map(solid => {
  const rows = results.filter(r => r.phase === phase && r.solid === solid), nominal = rows.find(r => r.variation === 'nominal');
  for (const variation of ['capacity-half','capacity-double']) assert.equal(rows.find(r => r.variation === variation).equilibriumK, nominal.equilibriumK);
  return { phase, solid, nominalEquilibriumK: nominal.equilibriumK,
    singleParameterEquilibriumRangeK: [Math.min(...rows.map(r => r.equilibriumK)), Math.max(...rows.map(r => r.equilibriumK))],
    nominalLocalRelaxationSeconds: nominal.localRelaxationSeconds,
    singleParameterLocalRelaxationRangeSeconds: [Math.min(...rows.map(r => r.localRelaxationSeconds)), Math.max(...rows.map(r => r.localRelaxationSeconds))] };
}));
const analysis = { schemaVersion: 1, inputReport: path.relative(root, input), inputSha256: createHash('sha256').update(bytes).digest('hex'),
  artifact: report.artifact.identity, config: report.config, variations, bounds, results,
  scope: 'One-parameter stress brackets about fixed observed F135 gas/coolant baths. Effective heat capacities and transfer parameters remain uncalibrated. These are declared sensitivity ranges, not confidence intervals, measured material bounds or proposed coefficient changes.',
  method: 'Monotone steady balance root plus local derivative time constant C/(-dQdT); not a replacement transient integrator or cold-start duration.',
  limitations: ['No combined-parameter extrema, cycle-model uncertainty propagation or material-specific C(T).',
    'Capacity changes lag and stored energy without changing this constant-bath equilibrium.',
    'The 1800 and 12000 J/K capacities do not imply masses for the rendered visual shells; no alloy density or specific heat is calibrated.',
    'Both solids draw heat from imposed reservoirs independently. No global engine conservation follows.'] };
await writeFile(path.join(out, 'sensitivity.json'), JSON.stringify(analysis, null, 2) + '\n');
const columns = Object.keys(results[0]);
await writeFile(path.join(out, 'sensitivity.csv'), [columns.join(','), ...results.map(r => columns.map(c => r[c]).join(','))].join('\n') + '\n');
console.log(JSON.stringify({ out, bounds, cases: results.length }, null, 2));
