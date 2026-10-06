#!/usr/bin/env node
// 0sfs owns this aircraft-specific audit. It reads native source and retained
// observations; it neither runs nor changes JSBSim or the optical implementation.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newOutputDirectory } from '../../outputDirectory.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const nativeRoot = path.resolve(root, '../Felipegalind0/jsbsim');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/validation/f35b/audit-f135-native-exhaust-contract.mjs [--out=build/new-directory]');
  process.exit(0);
}
assert.ok(args.length <= 1 && args.every(v => v.startsWith('--out=')));
const out = args.length ? path.resolve(args[0].slice(6)) : newOutputDirectory('validation', 'f135-native-exhaust-contract');
assert.ok(out.startsWith(path.join(root, 'build') + path.sep));
if (args.length) await mkdir(out);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const preceding = 'validation/evidence/aircraft/f35b/plume-spatial-2026-10-06/';
const inputs = [
  ['native', 'src/models/propulsion/FGTurbine.cpp'],
  ['native', 'src/models/propulsion/FGTurbine.h'],
  ['native', 'doc/turbine-thermal-model.md'],
  ['app', 'public/jsbsim-data/aircraft/F-35B-jsbsim/Engines/F135-PW-600.xml'],
  ['app', 'public/jsbsim-data/aircraft/F-35B-jsbsim/F-35B-jsbsim.xml'],
  ['app', preceding + 'native/trace.csv'],
  ['app', preceding + 'native/report.json'],
  ['app', preceding + 'native/property-catalog.txt'],
  ['app', preceding + 'spatial-optics/source-0-f135-exhaust-lut.manifest.json.txt'],
];
const sources = [], content = [];
for (const [owner, file] of inputs) {
  const bytes = await readFile(path.join(owner === 'native' ? nativeRoot : root, file));
  const snapshot = `${sources.length}-${owner}-${path.basename(file)}.txt`;
  await writeFile(path.join(out, snapshot), bytes);
  sources.push({ owner, file, sha256: hash(bytes), snapshot });
  content.push(bytes.toString('utf8'));
}
const cpp = content[0], header = content[1], xml = content[3], aircraft = content[4];
const oldReport = JSON.parse(content[6]), profile = JSON.parse(content[8]).profile;
assert.ok(cpp.includes('value(p.baseGasK, EGT_degC + 273.15)'));
assert.ok(cpp.includes('EGT_degC = in.TAT_c + 363.1 + N2norm * 357.1'));
assert.ok(cpp.includes('const double flame = AugmentationActive ?'));
assert.ok(header.includes('not calibrated area'));
assert.ok(!xml.includes('<base-gas-temperature-k>'));
assert.ok(aircraft.includes('value="0.99"'));
const lines = content[5].trim().split('\n'), columns = lines.shift().split(',');
const rows = lines.map(line => Object.fromEntries(line.split(',').map((v, i) =>
  [columns[i], ['scenario', 'phase'].includes(columns[i]) ? v : Number(v)])));
const cp = 1150, fuelHeatingValue = 43300000, efficiency = 0.95, referenceK = 298.15;
let maximumTemperatureReconstructionErrorK = 0, maximumBurnedFuelReconstructionErrorKgSec = 0;
for (const r of rows) {
  const flow = r.flowProxyKgSec;
  const base = r.egtC + 273.15;
  const expectedK = flow + r.suppliedAbKgSec > 0 ? referenceK +
    (flow * cp * (base - referenceK) + efficiency * r.burnedAbKgSec * fuelHeatingValue) /
    ((flow + r.suppliedAbKgSec) * cp) : base;
  maximumTemperatureReconstructionErrorK = Math.max(maximumTemperatureReconstructionErrorK, Math.abs(expectedK - r.gasK));
  const coreFuel = r.fuelKgSec - r.suppliedAbKgSec;
  const remaining = Math.max(0, Math.max(0, flow - coreFuel) * .068 - coreFuel);
  const expectedBurned = r.augmentation ? Math.min(r.suppliedAbKgSec, remaining) : 0;
  maximumBurnedFuelReconstructionErrorKgSec = Math.max(maximumBurnedFuelReconstructionErrorKgSec, Math.abs(expectedBurned - r.burnedAbKgSec));
}
assert.ok(maximumTemperatureReconstructionErrorK < 1e-9);
assert.ok(maximumBurnedFuelReconstructionErrorKgSec < 1e-9);
const cycle = oldReport.summaries.find(s => s.name === 'cold-cycle').result;
const lifted = oldReport.summaries.find(s => s.name === 'powered-lift').result.lifted;
const firstAb = rows.find(r => r.phase === 'afterburner');
const onset = rows.find(r => r.phase === 'afterburner' && r.phaseTimeS >= .233333333);
const firstCutoff = rows.find(r => r.phase === 'dry99-after-ab');
const spatial = profile.gasEmission.spatialField;
const expandedK = (k, mode) => k / (1 + (spatial.specificHeatRatio - 1) * spatial.exitMach[mode] ** 2 / 2);
const cases = Object.entries({ idle: cycle.idle, dry99: cycle.dry, firstAb, onset, sustainedAb: cycle.ab, firstCutoff, poweredLift: lifted });
const stationCases = cases.map(([name, r]) => {
  const mode = r.augmentation ? 'afterburner' : 'dry';
  const staticK = expandedK(r.gasK, mode), mach = spatial.exitMach[mode];
  // Conditional consistency calculation, NOT a solved or observed exit state:
  // adopt old assumed M/gamma, native cp, authored visual area and flow proxy.
  const gasConstant = cp * (spatial.specificHeatRatio - 1) / spatial.specificHeatRatio;
  const speed = mach * Math.sqrt(spatial.specificHeatRatio * gasConstant * staticK);
  const density = (r.flowProxyKgSec + r.suppliedAbKgSec) / (r.exitAreaM2 * speed);
  const exitPressure = density * gasConstant * staticK;
  return { name, timeS: r.timeS, phaseTimeS: r.phaseTimeS, mode, gasBathProxyK: r.gasK,
    legacyEgtK: r.egtC + 273.15, totalFuelKgSec: r.fuelKgSec, suppliedAbKgSec: r.suppliedAbKgSec,
    burnedAbKgSec: r.burnedAbKgSec, incomingDryFlowProxyKgSec: r.flowProxyKgSec,
    nativeNozzlePosition: r.nozzleNorm, authoredVisualExitAreaM2: r.exitAreaM2,
    oldAssumedMach: mach, oldExpandedTemperatureK: staticK,
    conditionalNotObserved: { gasConstantJPerKgK: gasConstant, velocityMetersPerSecond: speed,
      staticPressurePa: exitPressure, pressureToStandAmbientRatio: exitPressure / (r.pressurePsf * 47.88025898033584) } };
});
const frozen = cycle.dry;
const flagOnly = { heldGasBathProxyK: frozen.gasK, heldBurnedAbFuelKgSec: 0,
  oldOpticalDryTemperatureK: expandedK(frozen.gasK, 'dry'),
  oldOpticalAbTemperatureK: expandedK(frozen.gasK, 'afterburner'),
  oldOpticalAbMinusDryTemperatureK: expandedK(frozen.gasK, 'afterburner') - expandedK(frozen.gasK, 'dry'),
  nativeGasTemperatureChangeAtZeroExcessFuelK: 0,
  nativeOptionalWallFlameExchangeJumpW: 5.670374419e-8 * .05 * (frozen.gasK ** 4 - frozen.linerK ** 4),
  nativeFlameScope: 'Configured grey wall exchange gated by native augmentation; not emitted plume power or a chemical species population',
  oldParticleExtinctionPerMeter: { dry: profile.gasEmission.dry.absorptionPerMeter, afterburner: profile.gasEmission.afterburner.absorptionPerMeter },
  oldParticleFuelPowerFraction: { dry: profile.gasEmission.dry.particleFuelPowerFraction, afterburner: profile.gasEmission.afterburner.particleFuelPowerFraction } };
assert.ok(flagOnly.oldOpticalAbMinusDryTemperatureK < 0);
const observedEngineProperties = content[7].split('\n').filter(line => /^propulsion\/engine(?:\/|\[0\]\/)/.test(line));
const report = {
  schemaVersion: 1, status: 'native-audit-and-reduced-contract-proposal', date: '2026-10-06',
  scriptSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  nativeRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: nativeRoot, encoding: 'utf8' }).trim(),
  nativeDirty: execFileSync('git', ['status', '--porcelain'], { cwd: nativeRoot, encoding: 'utf8' }).trim(),
  installedArtifact: oldReport.artifact, sources, rowsChecked: rows.length,
  nativeRerun: false, nativeSourceModified: false, wasmBuild: false,
  reconstruction: { maximumTemperatureReconstructionErrorK, maximumBurnedFuelReconstructionErrorKgSec },
  temperatureContract: {
    observer: 'propulsion/engine[0]/thermal/nozzle-gas-temperature-k', unit: 'K',
    meaning: 'Imposed constant-cp gas-bath enthalpy-mixture proxy; named nozzle observer does not establish a calibrated nozzle station',
    base: 'Configured base-gas-temperature-k or generic legacy EGT + 273.15 K; F135 uses fallback',
    gasTimeIntegration: false, includesKineticEnergyConversion: false, includesShaftWork: false,
    calibratedStaticTemperature: false, calibratedTotalTemperature: false,
    activeOpticalContractProposal: 'Use this imposed bath as an explicit optical particle-bath hypothesis without another expansion transform; never rename it static exit temperature',
  },
  stationCases, flagOnly,
  dryStovl: { sameSpoolAndInletMeansSameGasProxy: true, dryGasProxyK: cycle.dry.gasK, poweredLiftGasProxyK: lifted.gasK,
    dryFuelKgSec: cycle.dry.fuelKgSec, poweredLiftFuelKgSec: lifted.fuelKgSec,
    publishedLiftFanShaftPowerHp: 29000, publishedLiftFanShaftPowerW: 29000 * 745.6998715822702,
    illustrativeTemperatureEquivalentK: 29000 * 745.6998715822702 / (lifted.flowProxyKgSec * cp),
    limitation: 'Shaft power rating is not this operating point. Temperature equivalent is only dimensional scale; do not subtract it from a proxy with no calibrated upstream station. Existing thrust/fuel surrogates are not an enthalpy balance.',
  },
  observedEngineProperties,
  unavailable: ['calibrated nozzle inlet total temperature and pressure', 'solved exhaust mass flow',
    'physical throat/exit area linked to native thermodynamics', 'nozzle exit static pressure/temperature/velocity',
    'shaft extraction power and core/bypass split', 'reacting species concentrations and source/loss rates',
    'soot loading/particle sizes/particle temperature', 'gas inventory and downstream residence time'],
  recommendation: 'No native correction/build: current observer follows its declared equations. Correct unsupported app station mapping, preserve metal dynamics, and keep missing physical inputs explicit.',
};
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ out, rowsChecked: rows.length, reconstruction: report.reconstruction, flagOnly, stationCases }, null, 2));
