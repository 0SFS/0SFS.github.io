#!/usr/bin/env node
// 0sfs owns this aircraft optical diagnostic. Retained native observations are
// reused; no engine step, browser or renderer is started by this tool.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newOutputDirectory } from '../../outputDirectory.mjs';
import { parseObserverCsv } from '../../exhaustOptics/bake.mjs';
import { combinedSpectrumReference } from '../../exhaustOptics/spatialReference.mjs';
import { evaluateEngineGasOptics, sampleEngineGasField, interpolateAbsoluteEmission } from '../../../src/flight/aircraft/engineGasOptics.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/validation/f35b/check-f135-emission-correction.mjs --geometry=<domain-cases.json> [--out=build/new-directory]');
  process.exit(0);
}
assert.ok(args.every(v => /^(--out=|--geometry=)/.test(v)));
const option = name => { const entries = args.filter(v => v.startsWith(name + '=')); assert.ok(entries.length <= 1); return entries[0]?.slice(name.length + 1); };
assert.ok(option('--geometry'), 'Supply geometry-derived signed flow domains');
const out = option('--out') ? path.resolve(option('--out')) : newOutputDirectory('validation', 'f135-emission-correction');
assert.ok(out.startsWith(path.join(root, 'build') + path.sep));
if (option('--out')) mkdirSync(out);
const read = file => readFileSync(path.resolve(root, file));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const previous = 'validation/evidence/aircraft/f35b/plume-spatial-2026-10-06/';
const sourcePaths = ['src/flight/aircraft/generated/f135-exhaust-lut.manifest.json', 'src/flight/aircraft/engineGasOptics.ts',
  'scripts/exhaustOptics/f135-visible-approximation.json', 'scripts/exhaustOptics/data/CIE_xyz_1931_2deg.csv',
  'scripts/exhaustOptics/spatialReference.mjs', 'scripts/validation/f35b/check-f135-emission-correction.mjs',
  previous + 'native/trace.csv', previous + 'spatial-optics/source-0-f135-exhaust-lut.manifest.json.txt',
  previous + 'spatial-optics/source-6-engineGasOptics.ts.txt', option('--geometry'),
  'validation/evidence/aircraft/f35b/exhaust-correction-2026-10-06/geometry-baseline/stations-and-light.json'];
const inputs = sourcePaths.map((file, index) => {
  const bytes = read(file), snapshot = `source-${index}-${path.basename(file)}.txt`;
  writeFileSync(path.join(out, snapshot), bytes);
  return { file, sha256: sha(bytes), snapshot };
});
const profile = JSON.parse(read(sourcePaths[0])).profile;
const parameters = JSON.parse(read(sourcePaths[2]));
assert.equal(profile.gasEmission.model, 'imposed-gas-bath-v2');
const oldProfile = JSON.parse(read(sourcePaths[7])).profile;
const oldCode = stripTypeScriptTypes(read(sourcePaths[8]).toString(), { mode: 'strip' });
assert.ok(!/^import /m.test(oldCode), 'Archived standalone evaluator gained a runtime dependency');
const oldEvaluate = (await import('data:text/javascript;base64,' + Buffer.from(oldCode).toString('base64'))).evaluateEngineGasOptics;
const geometry = JSON.parse(read(option('--geometry')));
const observer = parseObserverCsv(read(sourcePaths[3]));
const [headers, ...lines] = read(sourcePaths[6]).toString().trim().split('\n').map(line => line.split(','));
const trace = lines.map(line => Object.fromEntries(headers.map((key, i) =>
  [key, ['scenario', 'phase'].includes(key) ? line[i] : Number(line[i])])));
const at = (scenario, time) => trace.filter(row => row.scenario === scenario)
  .reduce((best, row) => Math.abs(row.timeS - time) < Math.abs(best.timeS - time) ? row : best);
const observations = [['cold', at('cold-cycle', 0)], ['idle', at('cold-cycle', 92.5166667)],
  ['dry99', at('cold-cycle', 212.5166667)], ['ab-onset', at('cold-cycle', 212.75)],
  ['ab-sustained', at('cold-cycle', 272.5166667)], ['ab-cutoff', at('cold-cycle', 272.525)],
  ['powered-lift', at('powered-lift', 117.525)], ['shutdown', at('cold-cycle', 573.5166667)]];
const errors = [], check = (condition, message) => { if (!condition) errors.push(message); };
const Y = rgb => .2126729 * rgb[0] + .7151522 * rgb[1] + .072175 * rgb[2];
const relative = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-30);
const summary = gas => ({ valid: gas.valid, temperatureMeaning: gas.temperatureMeaning,
  chemistryStatus: gas.chemistryStatus, sourceBoundaryTemperatureKelvin: gas.sourceBoundaryTemperatureKelvin,
  staticExitTemperatureKelvin: gas.staticExitTemperatureKelvin,
  sourceMeanRgbCdPerM3: gas.sourceRgbCdPerM3, isotropicIntensityRgbCd: gas.isotropicIntensityRgbCd,
  exteriorIsotropicIntensityRgbCd: gas.exteriorIsotropicIntensityRgbCd,
  sourcePhotopicIntensityCd: Y(gas.isotropicIntensityRgbCd), particlePowerW: gas.particlePowerUpperBoundW,
  excitedPowerW: gas.excitedPowerW, totalSourcePowerW: gas.totalSourcePowerUpperBoundW, allowedPowerW: gas.allowedPowerW,
  emittingVolumeM3: gas.emittingVolumeM3, absorptionPerMeter: gas.absorptionPerMeter });

// Independent endpoint bilinear sampling and section interpolation. Neither
// production sampling, node integration weights nor geometry helper is reused.
function sectionAt(field, s) {
  const sections = field.sections;
  let i = 0;
  while (i < sections.length - 2 && s >= sections[i + 1].distanceMeters) i++;
  const a = sections[i], b = sections[i + 1];
  const f = a.distanceMeters === b.distanceMeters ? 1
    : Math.max(0, Math.min(1, (s - a.distanceMeters) / (b.distanceMeters - a.distanceMeters)));
  const mix = key => (a[key] ?? (key === 'areaFactor' ? 1 : 0)) * (1 - f) + (b[key] ?? (key === 'areaFactor' ? 1 : 0)) * f;
  return { radius: mix('radiusMeters'), inner: mix('innerRadiusMeters'), areaFactor: mix('areaFactor') };
}
function sample(field, u, v, values = field.rgba, stride = 4) {
  if (u < 0 || u > 1 || v < 0 || v > 1) return Array(stride).fill(0);
  const x = u * (field.width - 1), y = v * (field.height - 1);
  const loX = Math.min(field.width - 2, Math.floor(x)), loY = Math.min(field.height - 2, Math.floor(y));
  const fx = x - loX, fy = y - loY, answer = Array(stride).fill(0);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
    const weight = (col ? fx : 1 - fx) * (row ? fy : 1 - fy);
    for (let c = 0; c < stride; c++) answer[c] += values[((loY + row) * field.width + loX + col) * stride + c] * weight;
  }
  return answer;
}
const gaussX = [-.8611363115940526, -.3399810435848563, .3399810435848563, .8611363115940526];
const gaussW = [.34785484513745385, .6521451548625461, .6521451548625461, .34785484513745385];
function volumeIntegral(field, values, stride, refinement = 1, domainRange = field.axialDistanceRangeMeters) {
  const [lo, hi] = field.axialDistanceRangeMeters, span = hi - lo;
  const cuts = [...new Set([...domainRange, ...field.sections.map(s => s.distanceMeters),
    ...Array.from({ length: field.width }, (_, i) => lo + span * i / (field.width - 1))])]
    .filter(s => s >= domainRange[0] && s <= domainRange[1]).sort((a, b) => a - b);
  const total = Array(stride).fill(0);
  for (let k = 1; k < cuts.length; k++) for (let part = 0; part < refinement; part++) {
    const a = cuts[k - 1] + (cuts[k] - cuts[k - 1]) * part / refinement;
    const b = cuts[k - 1] + (cuts[k] - cuts[k - 1]) * (part + 1) / refinement;
    for (let q = 0; q < gaussX.length; q++) {
      const s = (a + b) / 2 + gaussX[q] * (b - a) / 2, section = sectionAt(field, s);
      const inner = section.inner / section.radius, axialWeight = gaussW[q] * (b - a) / 2;
      for (let j = 0; j < field.height - 1; j++) {
        const lower = Math.max(j / (field.height - 1), inner), upper = (j + 1) / (field.height - 1);
        if (upper <= lower) continue;
        for (const radialPoint of [-1 / Math.sqrt(3), 1 / Math.sqrt(3)]) {
          const v = (lower + upper) / 2 + radialPoint * (upper - lower) / 2;
          const weight = 2 * Math.PI * section.radius ** 2 * section.areaFactor * v * axialWeight * (upper - lower) / 2;
          const value = sample(field, (s - lo) / span, v, values, stride);
          for (let c = 0; c < stride; c++) total[c] += weight * value[c];
        }
      }
    }
  }
  return total;
}
function atPoint(field, point) {
  const [lo, hi] = field.axialDistanceRangeMeters, s = point[2];
  if (s < lo || s > hi) return [0, 0, 0, 0];
  const sec = sectionAt(field, s), r = Math.hypot(point[0], point[1]);
  if (r < sec.inner || r > sec.radius) return [0, 0, 0, 0];
  return sample(field, (s - lo) / (hi - lo), r / sec.radius);
}
const plus = (a, b, scale = 1) => a.map((v, i) => v + scale * b[i]);
function interval(field, origin, direction) {
  const radius = Math.max(...field.sections.map(s => s.radiusMeters));
  const bounds = [[-radius, radius], [-radius, radius], field.axialDistanceRangeMeters];
  let enter = 0, leave = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(direction[i]) < 1e-14) { if (origin[i] < bounds[i][0] || origin[i] > bounds[i][1]) return null; continue; }
    const a = (bounds[i][0] - origin[i]) / direction[i], b = (bounds[i][1] - origin[i]) / direction[i];
    enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
  }
  return leave > enter ? [enter, leave] : null;
}
function transfer(field, origin, direction, steps, rk4) {
  const limits = interval(field, origin, direction);
  if (!limits) return { radiance: [0, 0, 0], transmittance: 1 };
  const h = (limits[1] - limits[0]) / steps;
  let state = [0, 0, 0, 1];
  const derivative = (s, value) => { const local = atPoint(field, plus(origin, direction, s)); return [...local.slice(0, 3).map(j => j * value[3]), -local[3] * value[3]]; };
  for (let i = 0; i < steps; i++) {
    const s = limits[0] + i * h;
    if (rk4) {
      const a = derivative(s, state), b = derivative(s + h / 2, plus(state, a, h / 2));
      const c = derivative(s + h / 2, plus(state, b, h / 2)), d = derivative(s + h, plus(state, c, h));
      state = state.map((v, index) => v + h * (a[index] + 2 * b[index] + 2 * c[index] + d[index]) / 6);
    } else {
      const value = atPoint(field, plus(origin, direction, s + h / 2));
      const tau = value[3] * h, effective = value[3] > 0 ? -Math.expm1(-tau) / value[3] : h;
      state = [...state.slice(0, 3).map((v, index) => v + state[3] * value[index] * effective), state[3] * Math.exp(-tau)];
    }
  }
  return { radiance: state.slice(0, 3), transmittance: state[3] };
}
const cases = [], integrals = [], spectra = [], continuity = [], flags = [], rays = [], fieldResolution = [];
for (const [name, native] of observations) {
  const domain = geometry.cases.find(c => c.name === name)?.flowDomain;
  assert.ok(domain, `Missing geometry domain for ${name}`);
  const input = { temperatureKelvin: native.gasK, ambientTemperatureKelvin: native.ambientK,
    augmentation: Boolean(native.augmentation), fuelFlowKgPerSecond: native.fuelKgSec,
    afterburnerBurnedFuelFlowKgPerSecond: native.burnedAbKgSec, radiusMeters: native.radiusM,
    lengthMeters: 6, flowDomain: domain, axialSamples: 64, radialSamples: 32 };
  const gas = evaluateEngineGasOptics(profile, input), old = oldEvaluate(oldProfile, { ...input, flowDomain: undefined });
  cases.push({ name, native, input, current: summary(gas), previousSpatial: summary(old) });
  if (!gas.valid) { check(name === 'cold' || name === 'shutdown', `Unexpected invalid ${name}`); continue; }
  check(gas.temperatureMeaning === 'imposed-native-gas-bath-proxy' && gas.chemistryStatus === 'unavailable', `Temperature/chemistry contract ${name}`);
  check(gas.sourceBoundaryTemperatureKelvin === native.gasK && gas.staticExitTemperatureKelvin === undefined, `Unsupported temperature transform ${name}`);
  const flipped = evaluateEngineGasOptics(profile, { ...input, augmentation: !input.augmentation });
  const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  const exact = bytes(gas.field.rgba).equals(bytes(flipped.field.rgba)) && gas.totalSourcePowerUpperBoundW === flipped.totalSourcePowerUpperBoundW;
  check(exact, `AB boolean changes physical source ${name}`);
  flags.push({ name, exactFieldAndPowerEquality: exact, fieldSha256: sha(bytes(gas.field.rgba)) });
  check(gas.excitedPowerW === 0 && gas.chPowerW === 0 && gas.c2PowerW === 0, `Invented chemical power ${name}`);
  const f = gas.field, independent = new Float64Array(f.width * f.height * 8);
  for (let i = 0; i < f.width * f.height; i++) independent.set([
    ...f.rgba.slice(i * 4, i * 4 + 4), 4 * 5.670374419e-8 * f.rgba[i * 4 + 3] * f.particleTemperatureKelvin[i] ** 4,
    f.chPowerDensityWPerM3[i], f.c2PowerDensityWPerM3[i], 1], i * 8);
  const a = volumeIntegral(f, independent, 8, 1), b = volumeIntegral(f, independent, 8, 4);
  const convergence = Math.max(...b.map((v, i) => relative(v, a[i])));
  const powerError = relative(b[4] + b[5] + b[6], gas.totalSourcePowerUpperBoundW);
  const intensityError = Math.max(...b.slice(0, 3).map((v, i) => relative(v, gas.isotropicIntensityRgbCd[i])));
  check(convergence < 2e-5, `Independent volume convergence ${name}`);
  check(powerError < 2e-5 && intensityError < 2e-5, `Expanded field power/intensity ${name}`);
  check(b[4] + b[5] + b[6] <= gas.allowedPowerW * (1 + 2e-5), `Complete source exceeds cap ${name}`);
  const inside = volumeIntegral(f, independent, 8, 4, [f.axialDistanceRangeMeters[0], 0]);
  const outside = volumeIntegral(f, independent, 8, 4, [0, f.axialDistanceRangeMeters[1]]);
  const exteriorIntensityError = Math.max(...outside.slice(0, 3).map((v, i) => relative(v, gas.exteriorIsotropicIntensityRgbCd[i])));
  check(exteriorIntensityError < 2e-5, `Exterior-only photometric source ${name}`);
  integrals.push({ name, independentIntegratedRgbCd: b.slice(0, 3), particlePowerW: b[4], chPowerW: b[5], c2PowerW: b[6],
    interiorParticlePowerW: inside[4], exteriorParticlePowerW: outside[4],
    interiorIsotropicIntensityCd: Y(inside), exteriorIsotropicIntensityCd: Y(outside),
    volumeM3: b[7], powerError, intensityError, exteriorIntensityError, convergence });
  let spectralPeakError = 0;
  for (const y of [1, Math.floor(f.height / 2), f.height - 2]) for (const x of [0, Math.floor(f.width / 4), Math.floor(f.width / 2)]) {
    const i = y * f.width + x, reference = combinedSpectrumReference(observer, f.particleTemperatureKelvin[i], f.rgba[i * 4 + 3], 0, 0, []);
    const peak = Math.max(...reference.rgb, 1e-60), actual = Array.from(f.rgba.slice(i * 4, i * 4 + 3));
    const error = Math.max(...actual.map((v, c) => Math.abs(v - reference.rgb[c]) / peak));
    if (peak > 1e-25) spectralPeakError = Math.max(spectralPeakError, error);
    spectra.push({ name, x, y, temperatureK: f.particleTemperatureKelvin[i], actualRgbCdPerM3: actual, independentRgbCdPerM3: reference.rgb, error });
  }
  check(spectralPeakError < .01, `Independent Planck/CIE ${name}`);
  const [lo, hi] = f.axialDistanceRangeMeters;
  for (const v of [.35, .68, .85]) {
    const epsilon = 1e-7, below = sample(f, (-epsilon - lo) / (hi - lo), v), above = sample(f, (epsilon - lo) / (hi - lo), v);
    const normalizedJump = Math.max(...above.map((value, i) => Math.abs(value - below[i]) / Math.max(Math.abs(value), Math.abs(below[i]), 1e-30)));
    check(normalizedJump < 1e-4, `Exit boundary discontinuity ${name}/${v}`);
    const observed = sampleEngineGasField(gas, -lo / (hi - lo), v), expected = sample(f, -lo / (hi - lo), v);
    const samplerError = Math.max(...observed.sourceRgbCdPerM3.map((value, c) => relative(value, expected[c])));
    check(samplerError < 1e-12, `Expanded sampler coordinates ${name}/${v}`);
    continuity.push({ name, radialFraction: v, epsilonMeters: epsilon, normalizedJump, samplerError });
  }
  const unit = v => v.map(n => n / Math.hypot(...v));
  const rayCases = [['rear-axis', [0, 0, hi + 3], [0, 0, -1]],
    ['rear-annulus', [native.radiusM * .68, 0, hi + 3], [0, 0, -1]],
    ['oblique', [3, 0, 4], unit([-3, 0, -4])]];
  for (const [view, origin, direction] of rayCases) {
    const coarse = transfer(f, origin, direction, 8192, true), refined = transfer(f, origin, direction, 16384, true);
    const convergence = Math.max(...refined.radiance.map((v, c) => Math.abs(v - coarse.radiance[c]))) / Math.max(...refined.radiance, 1e-30);
    check(convergence < .005, `Independent RK4 ray convergence ${name}/${view}`);
    const oldField = { ...old.field, axialDistanceRangeMeters: [0, 6], sections: [
      { distanceMeters: 0, radiusMeters: native.radiusM }, { distanceMeters: 6, radiusMeters: native.radiusM * (1 + old.field.radiusExpansionRatio) }] };
    const previousRay = transfer(oldField, origin, direction, 16384, true);
    const budgets = [8, 16, 32, 64].map(samples => { const actual = transfer(f, origin, direction, samples, false); return { samples,
      radiance: actual.radiance, relativePeakError: Math.max(...actual.radiance.map((v, c) => Math.abs(v - refined.radiance[c]))) / Math.max(...refined.radiance, 1e-30) }; });
    rays.push({ name, view, origin, direction, current: refined, previousSpatial: previousRay, referenceConvergence: convergence, uniformMidpointBudgets: budgets });
    if (['dry99', 'ab-onset', 'ab-sustained', 'powered-lift'].includes(name)) {
      const coarseField = evaluateEngineGasOptics(profile, { ...input, axialSamples: 32, radialSamples: 16 }).field;
      const finerField = evaluateEngineGasOptics(profile, { ...input, radialSamples: 64 }).field;
      const coarseRay = transfer(coarseField, origin, direction, 8192, true), fineRay = transfer(finerField, origin, direction, 8192, true);
      fieldResolution.push({ name, view, resolutions: [[32, 16], [64, 32], [64, 64]],
        radiances: [coarseRay.radiance, refined.radiance, fineRay.radiance],
        currentToFinerRelativePeakError: Math.max(...fineRay.radiance.map((v, c) => Math.abs(v - refined.radiance[c]))) / Math.max(...fineRay.radiance, 1e-30) });
    }
  }
}

// Thermal-only passive transfer cannot exceed the hottest source radiance.
// A uniformly bright exit disk facing an ideal diffuse receiver supplies a
// conservative geometry-bound illumination comparison, not deck heating.
const lift = cases.find(c => c.name === 'powered-lift');
const oldLight = JSON.parse(read(sourcePaths[10])).lightBaseline;
const receiver = geometry.receiver ?? { exitPlaneDistanceMeters: oldLight.exitHeightMeters,
  provenance: sourcePaths[10], groundHeightAssumption: oldLight.groundHeightAssumption,
  actualRasterReceiverResponse: oldLight.actualRasterReceiverResponse,
  normal: 'Plane normal opposes vertically downward nozzle axis', hypothetical: true };
assert.ok(receiver?.exitPlaneDistanceMeters > 0, 'Geometry must supply an explicit receiver distance');
const radius = lift.native.radiusM, distance = receiver.exitPlaneDistanceMeters, reflectance = .2;
const blackbody = temperature => combinedSpectrumReference(observer, temperature, 1, 0, 0, []);
const thermalBounds = ['gas', 'core', 'liner'].map(region => {
  const temperature = lift.native[region + 'K'], reference = blackbody(temperature);
  const epsilon = region === 'gas' ? 1 : parameters.surfaceEmission.visibleGrayEmissivity;
  const luminance = reference.xyz[1] * epsilon;
  const illuminance = Math.PI * luminance * radius ** 2 / (distance ** 2 + radius ** 2);
  return { region, nativeTemperatureK: temperature, assumedVisibleEmissivity: epsilon,
    sourceLuminanceCdPerM2: luminance, hemisphericThermalCeilingCdPerM2: reference.xyz[1],
    filledExitDiskIlluminanceLux: illuminance, diffuseReceiverRadianceCdPerM2: reflectance * illuminance / Math.PI,
    fullHemisphereDiffuseReceiverCeilingCdPerM2: reflectance * luminance,
    actualSurfaceTableRgbCdPerM2: region === 'gas' ? undefined : interpolateAbsoluteEmission(profile.surfaceEmission, temperature) };
});
function exteriorReceiverIlluminance(field, height, refinement) {
  const [lo, hi] = field.axialDistanceRangeMeters;
  const cuts = [...new Set([0, Math.min(height, hi), ...field.sections.map(s => s.distanceMeters),
    ...Array.from({ length: field.width }, (_, i) => lo + (hi - lo) * i / (field.width - 1))])]
    .filter(s => s >= 0 && s <= Math.min(height, hi)).sort((a, b) => a - b);
  let illuminance = 0;
  for (let index = 1; index < cuts.length; index++) for (let part = 0; part < refinement; part++) {
    const a = cuts[index - 1] + (cuts[index] - cuts[index - 1]) * part / refinement;
    const b = cuts[index - 1] + (cuts[index] - cuts[index - 1]) * (part + 1) / refinement;
    for (let q = 0; q < gaussX.length; q++) {
      const s = (a + b) / 2 + gaussX[q] * (b - a) / 2, z = height - s;
      const section = sectionAt(field, s), u = (s - lo) / (hi - lo);
      let radialIntegral = 0;
      for (let j = 0; j < field.height - 1; j++) {
        const r0 = Math.max(section.inner, j * section.radius / (field.height - 1));
        const r1 = (j + 1) * section.radius / (field.height - 1);
        if (r1 <= r0) continue;
        const j0 = Y(sample(field, u, r0 / section.radius)), j1 = Y(sample(field, u, r1 / section.radius));
        const slope = (j1 - j0) / (r1 - r0), intercept = j0 - slope * r0;
        const primitive = r => -intercept / Math.hypot(z, r) + slope * (Math.asinh(r / z) - r / Math.hypot(z, r));
        radialIntegral += 2 * Math.PI * z * (primitive(r1) - primitive(r0));
      }
      illuminance += radialIntegral * gaussW[q] * (b - a) / 2;
    }
  }
  return illuminance;
}
const liftField = evaluateEngineGasOptics(profile, lift.input).field;
const exteriorCoarseLux = exteriorReceiverIlluminance(liftField, distance, 1);
const exteriorFineLux = exteriorReceiverIlluminance(liftField, distance, 4);
const exteriorReceiver = { unattenuatedIlluminanceUpperBoundLux: exteriorFineLux,
  diffuseReceiverRadianceUpperBoundCdPerM2: reflectance * exteriorFineLux / Math.PI,
  quadratureRelativeDifference: relative(exteriorFineLux, exteriorCoarseLux),
  scope: 'Only authored exterior gas between exit and hypothetical plane. Exact radial solid-angle integration and refined axial quadrature; no absorption or opaque obstruction, so an upper bound for this imposed free-jet source. Source below plane omitted. No impingement, scattering, deck heating or extra emission is invented.' };
check(exteriorReceiver.quadratureRelativeDifference < .005, 'Exterior receiver upper-bound quadrature');
const homogeneous = { width: 3, height: 3, rgba: new Float32Array(36), axialDistanceRangeMeters: [-1, 2],
  sections: [{ distanceMeters: -1, radiusMeters: 1 }, { distanceMeters: 2, radiusMeters: 1 }] };
for (let i = 0; i < 9; i++) homogeneous.rgba.set([15, 4, 2, .1], i * 4);
const analytic = [15, 4, 2].map(v => v * -Math.expm1(-3 * Math.fround(.1)) / Math.fround(.1));
const homogeneousRay = transfer(homogeneous, [0, 0, 5], [0, 0, -1], 16384, true);
const homogeneousError = Math.max(...analytic.map((v, i) => relative(v, homogeneousRay.radiance[i])));
check(homogeneousError < 1e-9, 'Independent transfer homogeneous analytic check');
const changedDuringRun = inputs.filter(input => sha(read(input.file)) !== input.sha256).map(input => input.file);
check(changedDuringRun.length === 0, 'Source inputs changed during numerical check');
const report = { schemaVersion: 1, status: errors.length ? 'failed-numerical-check' : 'passed-numerical-correction-only', inputs, changedDuringRun,
  nativeRerun: false, gpuRun: false, cases, flags, integrals, spectra, continuity, rays, fieldResolution,
  homogeneous: { analytic, actual: homogeneousRay.radiance, relativeError: homogeneousError },
  receiver: { ...receiver, reflectance, exitRadiusMeters: radius, thermalBounds, exteriorReceiver,
    assumptions: 'Uniformly luminous circular exit disk, coaxial parallel diffuse plane, no occlusion. Each metal bound hypothetically fills the whole exit; native thermal area is not substituted for optical projected area. Gas bound is blackbody at imposed bath, not actual gas loading. These individual bounds are alternatives, not additive sources. No heated deck emission or impingement is modeled.' },
  criteria: { independentSpectralPeakRelative: .01, independentCompleteVolumeRelative: 2e-5, referenceRayConvergenceRelative: .005,
    exitBoundaryRelativeAcross2eMinus7Meters: 1e-4, flagOnlyPhysicalChange: 0 },
  limits: ['Straightened signed flow-path transfer checks do not include posed hardware depth or actual GPU composition.',
    'Uniform midpoint budgets are diagnosed, not asserted equivalent to the production segmented/clustered ray sampler.',
    'Field-resolution errors are reported on the finite listed rays, not a guarantee over every view.',
    'Chemistry unavailable means omitted due absent inputs, not evidence that real chemical light is zero.',
    'Dry luminous exhaust and deck appearance remain uncalibrated; source-only illumination bounds do not establish deck heating.'], errors };
writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ out: path.relative(root, out), status: report.status, cases: cases.length, errors, thermalBounds }, null, 2));
if (errors.length) process.exitCode = 1;
