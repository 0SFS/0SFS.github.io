#!/usr/bin/env node
// 0sfs owns this F-35B installation/weight audit. It reads retained CPU traces;
// it does not run the engine, recreate engine equations, or time performance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newOutputDirectory } from '../../outputDirectory.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const KG_PER_LB = .45359237;
const FT_TO_M = .3048;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const normalize = name => name.replaceAll('[0]', '');
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const add = (a, b) => a.map((value, i) => value + b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (vector, multiplier) => vector.map(value => value * multiplier);
const norm = vector => Math.hypot(...vector);
const axes = ['x', 'y', 'z'];
// Declared before inspection of the rotating-frame hover fixture. These are
// engineering diagnostic criteria, not aircraft/manufacturer operating limits.
const engineeringHoverCriteria = Object.freeze({ startSeconds: 20, endSeconds: 80,
  altitudeSpanFt: 5, absoluteVerticalSpeedFps: .1, absolutePitchRad: .05, absoluteRollRad: .05,
  anyContactSamples: 0, numericalRejections: 0, augmentationSamples: 0,
  energyRelative: 1e-5, massRelative: 1e-6, timeToleranceSeconds: 1e-7 });

function statistics(values, times) {
  if (!values.length) return null;
  assert.ok(values.every(Number.isFinite), 'non-finite derived observation');
  let min = Infinity, max = -Infinity, sum = 0;
  for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); sum += value; }
  const mean = sum / values.length;
  const rmsRipple = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  const result = { min, max, mean, peakToPeak: max - min, rmsRipple,
    initial: values[0], final: values.at(-1), endMinusStart: values.at(-1) - values[0] };
  if (times) {
    const timeMean = times.reduce((sum, time) => sum + time, 0) / times.length;
    const variance = times.reduce((sum, time) => sum + (time - timeMean) ** 2, 0);
    const slope = variance ? times.reduce((sum, time, i) => sum + (time - timeMean) * (values[i] - mean), 0) / variance : 0;
    result.linearDriftPerSecond = slope;
    result.detrendedRmsRipple = Math.sqrt(values.reduce((sum, value, i) =>
      sum + (value - mean - slope * (times[i] - timeMean)) ** 2, 0) / values.length);
  }
  return result;
}

function cycle(values, times, stabilityGateSpan) {
  const s = statistics(values, times);
  if (!s || s.peakToPeak < 1e-7 || s.detrendedRmsRipple < 1e-7) return null;
  const timeMean = times.reduce((sum, time) => sum + time, 0) / times.length;
  const detrended = values.map((value, i) => value - s.mean - s.linearDriftPerSecond * (times[i] - timeMean));
  const band = s.detrendedRmsRipple * .35;
  const crossings = [];
  let armed = false;
  for (let i = 1; i < detrended.length; i++) {
    if (detrended[i] <= -band) armed = true;
    if (armed && detrended[i] >= band) { crossings.push(times[i]); armed = false; }
  }
  if (crossings.length < 4) return null;
  const periods = crossings.slice(1).map((time, i) => time - crossings[i]);
  const periodsStats = statistics(periods);
  return { method: 'rising hysteretic crossing of linearly detrended signal, ±0.35 detrended RMS',
    cycles: periods.length, signalPeakToPeak: s.peakToPeak, stabilityGateSpan,
    exceedsStabilityGate: s.peakToPeak > stabilityGateSpan, periodSeconds: periodsStats,
    periodCoefficientOfVariation: periodsStats.rmsRipple / periodsStats.mean,
    periodicCandidate: periodsStats.rmsRipple / periodsStats.mean < .2 };
}

function xmlNumber(xml, tag, unit) {
  const match = new RegExp(`<${tag}(?:\\s+unit="([^"]+)")?\\s*>\\s*([^<]+)\\s*</${tag}>`).exec(xml);
  assert.ok(match, `XML ${tag} absent`);
  if (unit) assert.equal(match[1], unit, `XML ${tag} units`);
  const value = Number(match[2]);
  assert.ok(Number.isFinite(value), `XML ${tag} value`);
  return value;
}

function installation(xml) {
  const cleanXml = xml.replace(/<!--[\s\S]*?-->/g, '');
  const propulsion = /<propulsion>([\s\S]*?)<\/propulsion>/.exec(cleanXml)?.[1];
  assert.ok(propulsion, 'XML propulsion absent');
  const engines = [...propulsion.matchAll(/<engine\s+file="([^"]+)">/g)].map((match, index) => ({ index, file: match[1] }));
  assert.ok(engines.length === 1 || engines.length === 4, 'F-35B engine closure');
  const tanks = [...propulsion.matchAll(/<tank\b[^>]*>([\s\S]*?)<\/tank>/g)].map((match, index) => ({
    index, capacityLbs: xmlNumber(match[1], 'capacity', 'LBS'),
    authoredContentsLbs: xmlNumber(match[1], 'contents', 'LBS'),
  }));
  assert.equal(tanks.length, 4, 'F-35B tank closure');
  const externals = [...cleanXml.matchAll(/<force\s+name="([^"]+)"\s+frame="([^"]+)">([\s\S]*?)<\/force>/g)]
    .map(match => ({ name: match[1], frame: match[2],
      magnitude: /<function\s+name="([^"]+)"/.exec(match[3])?.[1] ?? `external_reactions/${match[1]}/magnitude`,
    }));
  assert.equal(externals.length, engines.length === 1 ? 8 : 3, 'F-35B external force closure');
  assert.ok(externals.every(force => ['BODY', 'WIND'].includes(force.frame)));
  return { engineModel: engines.length === 1 ? 'plant' : 'empirical', engines,
    emptyWeightLbs: xmlNumber(cleanXml, 'emptywt', 'LBS'), tanks, externals };
}

function parseTrace(bytes) {
  const [header, ...lines] = gunzipSync(bytes).toString('utf8').trimEnd().split('\n');
  const columns = header.split(',');
  const indices = new Map(columns.map((name, i) => [normalize(name), i]));
  assert.equal(indices.size, columns.length, 'duplicate normalized trace columns');
  const rows = lines.map(line => line.split(',').map(Number));
  assert.ok(rows.every(row => row.length === columns.length), 'trace row width');
  const get = (row, name) => {
    const i = indices.get(normalize(name));
    assert.notEqual(i, undefined, `missing trace observation ${name}`);
    assert.ok(Number.isFinite(row[i]), `non-finite trace observation ${name}`);
    return row[i];
  };
  const optional = (row, name) => indices.has(normalize(name)) ? get(row, name) : null;
  return { rows, get, optional, columns };
}

/** Exact native wind-to-body basis; wind force directions include their signs. */
function windToBody(vector, alpha, beta) {
  const ca = Math.cos(alpha), sa = Math.sin(alpha), cb = Math.cos(beta), sb = Math.sin(beta);
  return [ca * cb * vector[0] - ca * sb * vector[1] - sa * vector[2],
    sb * vector[0] + cb * vector[1], sa * cb * vector[0] - sa * sb * vector[1] + ca * vector[2]];
}

function load(row, get, spec) {
  const tanks = spec.tanks.map(tank => {
    const marker = get(row, `propulsion/tank[${tank.index}]/contents-lbs`);
    const attached = tank.index < 2 || get(row, `stores/external-tank[${tank.index - 2}]/attached`) > .5;
    return { ...tank, attached, contentsLbs: marker, contentsKg: marker * KG_PER_LB,
      percentageOfTankCapacity: marker / tank.capacityLbs * 100 };
  });
  const fuelLbs = tanks.reduce((sum, tank) => sum + tank.contentsLbs, 0);
  const capacityLbs = tanks.filter(tank => tank.attached).reduce((sum, tank) => sum + tank.capacityLbs, 0);
  const dryStoresLbs = [0, 1].reduce((sum, index) => sum + get(row, `inertia/pointmass-weight-lbs[${index}]`), 0);
  const declaredWeightLbs = get(row, 'inertia/weight-lbs');
  return { tanks, capacityDenominatorLbs: capacityLbs, fuelLbs, fuelKg: fuelLbs * KG_PER_LB,
    fuelPercentageOfAttachedCapacity: fuelLbs / capacityLbs * 100,
    internalCapacityLbs: tanks.slice(0, 2).reduce((sum, tank) => sum + tank.capacityLbs, 0),
    dryStoresLbs, emptyWeightLbs: spec.emptyWeightLbs, declaredWeightLbs,
    weightAccountingResidualLbs: declaredWeightLbs - spec.emptyWeightLbs - dryStoresLbs - fuelLbs,
    massSlugs: get(row, 'inertia/mass-slugs'), massKg: get(row, 'inertia/mass-slugs') * 14.593902937206,
    cgInches: axes.map(axis => get(row, `inertia/cg-${axis}-in`)) };
}

function derive(row, get, optional, spec) {
  const phi = get(row, 'attitude/phi-rad'), theta = get(row, 'attitude/theta-rad');
  // Local horizontal is geodetic NED. This is the negative down row of Tb2l.
  const upBody = [Math.sin(theta), -Math.sin(phi) * Math.cos(theta), -Math.cos(phi) * Math.cos(theta)];
  const force = kind => axes.map(axis => get(row, `forces/fb${axis}-${kind}-lbs`));
  const upward = vector => dot(vector, upBody);
  const cg = axes.map(axis => get(row, `inertia/cg-${axis}-in`));
  const armBodyFeet = structural => [(cg[0] - structural[0]) / 12, (structural[1] - cg[1]) / 12, (cg[2] - structural[2]) / 12];
  const engineVectors = spec.engines.map(engine => axes.map(axis => get(row, `propulsion/engine[${engine.index}]/body-force-${axis}-lbs`)));
  const engineLocations = spec.engines.map(engine => axes.map(axis => get(row, `propulsion/engine[${engine.index}]/${axis}-position`)));
  const mainBody = engineVectors[0], mainLocation = engineLocations[0];
  const moments = engineVectors.map((vector, index) => cross(armBodyFeet(engineLocations[index]), vector));
  const externalVectors = [];
  const outputs = { mainUpLbf: upward(mainBody) };
  if (spec.engineModel === 'empirical') {
    outputs.lift_fanUpLbf = upward(engineVectors[1]);
    outputs.roll_post_rightUpLbf = upward(engineVectors[2]);
    outputs.roll_post_leftUpLbf = upward(engineVectors[3]);
  }
  // The earliest retained corpus omitted aero/* columns. Its native air-relative
  // body velocity still defines the same wind basis, with zero angles at rest.
  const airVelocity = ['u', 'v', 'w'].map(axis => get(row, `velocities/${axis}-aero-fps`));
  const alpha = optional(row, 'aero/alpha-rad') ?? Math.atan2(airVelocity[2], airVelocity[0]);
  const beta = optional(row, 'aero/beta-rad') ?? Math.atan2(airVelocity[1], Math.hypot(airVelocity[0], airVelocity[2]));
  for (const external of spec.externals) {
    const base = `external_reactions/${external.name}/`;
    const vectorOwn = scale(axes.map(axis => get(row, base + axis)), get(row, external.magnitude));
    const vector = external.frame === 'WIND'
      ? windToBody(vectorOwn, alpha, beta) : vectorOwn;
    externalVectors.push(vector);
    outputs[external.name.replaceAll('-', '_') + 'UpLbf'] = upward(vector);
    moments.push(cross(armBodyFeet(axes.map(axis => get(row, base + `location-${axis}-in`))), vector));
  }
  const externalSum = externalVectors.reduce(add, [0, 0, 0]);
  const applied = force('total'), weight = force('weight');
  const reconstruct = [...engineVectors, externalSum, force('aero'), force('gear')].reduce(add, [0, 0, 0]);
  const massSlugs = get(row, 'inertia/mass-slugs');
  const net = add(applied, weight);
  const componentMoment = moments.reduce(add, [0, 0, 0]);
  const propExternalMoment = ['l', 'm', 'n'].map(axis =>
    get(row, `moments/${axis}-prop-lbsft`) + get(row, `moments/${axis}-external-lbsft`));
  // ECI longitude is obtained directly from the recorded inertial position.
  // uidot/vidot/widot are ECI components in FGAccelerations, despite the names.
  const longitudeEci = Math.atan2(get(row, 'position/eci-y-ft'), get(row, 'position/eci-x-ft'));
  const latitude = get(row, 'position/lat-geod-rad');
  const upEci = [Math.cos(latitude) * Math.cos(longitudeEci), Math.cos(latitude) * Math.sin(longitudeEci), Math.sin(latitude)];
  const accelerationEci = ['u', 'v', 'w'].map(axis => get(row, `accelerations/${axis}idot-ft_sec2`));
  const eciAccelerationUp = dot(accelerationEci, upEci);
  const forceAccelerationUp = upward(net) / massSlugs;
  const bodyVelocity = ['u', 'v', 'w'].map(axis => get(row, `velocities/${axis}-fps`));
  const bodyRate = ['p', 'q', 'r'].map(axis => get(row, `velocities/${axis}-rad_sec`));
  const derivativeBody = ['u', 'v', 'w'].map(axis => get(row, `accelerations/${axis}dot-ft_sec2`));
  const bodyKinematicAccelerationUp = upward(add(derivativeBody, cross(bodyRate, bodyVelocity)));
  // This is derivative of the ECEF-relative velocity vector in the local frame;
  // force/mass includes gravitation but omits centrifugal/Coriolis acceleration.
  const held = get(row, 'forces/hold-down') > .5;
  const fanX = spec.engineModel === 'plant' ? get(row, 'external_reactions/lift-fan/location-x-in') : engineLocations[1][0];
  const fanMomentIndex = spec.engineModel === 'plant'
    ? spec.externals.findIndex(force => force.name === 'lift-fan') + spec.engines.length : 1;
  const grossLbf = spec.engineModel === 'plant'
    ? ['nozzle', 'lift-fan', 'roll-post[0]', 'roll-post[1]'].reduce((sum, name) =>
      sum + get(row, `propulsion/engine/plant/${name}/gross-thrust-lbs`), 0)
    : spec.engines.reduce((sum, engine) => sum + get(row, `propulsion/engine[${engine.index}]/thrust-lbs`), 0);
  return { t: get(row, 'simulation/sim-time-sec'), held, ...outputs,
    propUpLbf: upward(force('prop')), externalUpLbf: upward(force('external')),
    aeroUpLbf: upward(force('aero')), contactUpLbf: upward(force('gear')),
    contactForceMagnitudeLbf: norm(force('gear')),
    appliedUpLbf: upward(applied), gravitationalUpLbf: upward(weight), netUpLbf: upward(net),
    forceSumResidualLbf: norm(applied.map((value, i) => value - reconstruct[i])),
    externalForceSumResidualLbf: norm(force('external').map((value, i) => value - externalSum[i])),
    propulsionMomentSumResidualLbfFt: norm(propExternalMoment.map((value, i) => value - componentMoment[i])),
    pitchMainLbfFt: moments[0][1], pitchFanLbfFt: moments[fanMomentIndex][1],
    pitchPropExternalLbfFt: propExternalMoment[1], pitchTotalLbfFt: get(row, 'moments/m-total-lbsft'),
    forceAccelerationUpFps2: forceAccelerationUp, eciAccelerationUpFps2: eciAccelerationUp,
    eciAccelerationResidualFps2: held ? null : eciAccelerationUp - forceAccelerationUp,
    bodyKinematicAccelerationUpFps2: bodyKinematicAccelerationUp,
    nativeBodyWdotFps2: derivativeBody[2],
    verticalVelocityFps: get(row, 'velocities/h-dot-fps'), altitudeFt: get(row, 'position/h-sl-ft'),
    mainAftArmInches: mainLocation[0] - cg[0], fanForwardArmInches: cg[0] - fanX,
    leverArmRatio: (mainLocation[0] - cg[0]) / (cg[0] - fanX),
    splitCommand: optional(row, 'fcs/lift-split-cmd'), pitchControl: get(row, 'fcs/stovl-pitch-control'),
    n1Percent: get(row, 'propulsion/engine/n1'), n2Percent: get(row, 'propulsion/engine/n2'), grossLbf,
    failure: optional(row, 'propulsion/engine/plant/numerics/failure'), massSlugs,
    eciVelocity: axes.map(axis => get(row, `velocities/eci-${axis}-fps`)), upEci,
    fuelLbs: spec.tanks.reduce((sum, tank) => sum + get(row, `propulsion/tank[${tank.index}]/contents-lbs`), 0) };
}

function conservation(rows, derived, get, optional, gates, spec, fixedFuel) {
  if (spec.engineModel !== 'plant') return { available: false,
    wholePlantEnergy: { status: 'unavailable', reason: 'The empirical table model exports no whole-engine energy ledger.' },
    wholePlantMass: { status: 'unavailable', reason: 'The empirical force carriers export no matched inlet/outlet/stored-mass ledger.' } };
  const P = 'propulsion/engine/plant/';
  const energySourceNames = ['air-in-j', 'fuel-sensible-j', 'chemical-j', 'starter-j'];
  const energySinkNames = ['outflow-j', 'accessory-j', 'friction-j', 'clutch-j', 'radiation-j', 'dump-j'];
  const energyStoredNames = ['rotor-stored-j', 'solid-stored-j', 'manifold-stored-j'];
  const energyNames = [...energySourceNames, ...energySinkNames, ...energyStoredNames];
  const massNames = ['air-in-kg', 'fuel-in-kg', 'outflow-kg', 'dump-kg', 'manifold-stored-kg'];
  const missingEnergy = energyNames.filter(name => optional(rows[0], P + 'ledger/' + name) === null);
  const missingMass = massNames.filter(name => optional(rows[0], P + 'ledger/' + name) === null);
  const energyResiduals = [], energyRelative = [], energyNativeDifference = [], energyScaleDifference = [];
  const massResiduals = [], massRelative = [], massNativeDifference = [], massPublishedResidualDifference = [];
  const tankResiduals = [], fuelUsedResiduals = [];
  const fuelMass = row => spec.tanks.reduce((sum, tank) => sum + get(row, `propulsion/tank[${tank.index}]/contents-lbs`) * KG_PER_LB, 0);
  let acceptedSteps = 0, rejectedSamples = 0, unchangedSequenceSamples = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i], previous = rows[i - 1];
    const sequence = get(row, P + 'numerics/sequence'), beforeSequence = get(previous, P + 'numerics/sequence');
    const failed = get(row, P + 'numerics/failure') > .5;
    if (failed) { rejectedSamples++; continue; }
    if (sequence <= beforeSequence) { unchangedSequenceSamples++; continue; }
    acceptedSteps++;
    if (!missingEnergy.length) {
      const term = name => get(row, P + 'ledger/' + name);
      const sources = energySourceNames.reduce((sum, name) => sum + term(name), 0);
      const sinks = energySinkNames.reduce((sum, name) => sum + term(name), 0);
      const stored = energyStoredNames.reduce((sum, name) => sum + term(name), 0);
      const residualJ = stored - (sources - sinks);
      const aggregateTermScaleJ = energyNames.reduce((sum, name) => sum + Math.abs(term(name)), 0);
      const relative = Math.abs(residualJ) / Math.max(1, aggregateTermScaleJ);
      energyResiduals.push(residualJ); energyRelative.push(relative);
      energyNativeDifference.push(residualJ - get(row, P + 'ledger/energy-residual-j'));
      energyScaleDifference.push(aggregateTermScaleJ - get(row, P + 'ledger/energy-scale-j'));
      Object.assign(derived[i], { independentEnergyResidualJ: residualJ, independentEnergyRelative: relative });
    }
    if (!missingMass.length) {
      const term = name => get(row, P + 'ledger/' + name);
      const residualKg = term('manifold-stored-kg') - (term('air-in-kg') + term('fuel-in-kg') - term('outflow-kg') - term('dump-kg'));
      const massScaleKg = term('air-in-kg') + term('fuel-in-kg') + term('outflow-kg') + term('dump-kg') + Math.abs(term('manifold-stored-kg'));
      const relative = Math.abs(residualKg) / Math.max(1e-9, massScaleKg);
      massResiduals.push(residualKg); massRelative.push(relative);
      massNativeDifference.push(relative - get(row, P + 'ledger/mass-relative'));
      const publishedResidual = optional(row, P + 'ledger/mass-residual-kg');
      if (publishedResidual !== null) massPublishedResidualDifference.push(residualKg - publishedResidual);
      Object.assign(derived[i], { independentMassResidualKg: residualKg, independentMassRelative: relative });
    }
    if (!derived[i].held && !fixedFuel) {
      const suppliedKg = get(row, P + 'ledger/fuel-in-kg');
      const withdrawnKg = fuelMass(previous) - fuelMass(row);
      const usedKg = get(row, P + 'fuel/used-kg') - get(previous, P + 'fuel/used-kg');
      tankResiduals.push(withdrawnKg - suppliedKg);
      fuelUsedResiduals.push(usedKg - suppliedKg);
      Object.assign(derived[i], { independentTankWithdrawalResidualKg: withdrawnKg - suppliedKg,
        independentFuelUsedResidualKg: usedKg - suppliedKg });
    }
  }
  const energyStats = statistics(energyRelative), massStats = statistics(massRelative);
  return { available: true, acceptedSteps, rejectedSamples, unchangedSequenceSamples,
    wholePlantEnergy: missingEnergy.length ? { status: 'unavailable', missingProperties: missingEnergy.map(name => P + 'ledger/' + name) }
      : { status: 'independently-recomputed-from-exported-terms', signedResidualJ: statistics(energyResiduals),
        relative: energyStats, gate: gates.energyRelative, passed: energyStats.max <= gates.energyRelative,
        reconstructedMinusPublishedResidualJ: statistics(energyNativeDifference),
        reconstructedAggregateMinusPublishedScaleJ: statistics(energyScaleDifference),
        sourceTerms: energySourceNames, sinkTerms: energySinkNames, storedTerms: energyStoredNames,
        scaleLimitation: 'The denominator sums absolute accepted-step term totals. Native scale sums absolute substep terms, so cancellation within a term can make this independent denominator smaller and its gate stricter.' },
    wholePlantMass: missingMass.length ? { status: 'unavailable', missingProperties: missingMass.map(name => P + 'ledger/' + name),
      publishedRelativeOnly: statistics(rows.slice(1).map(row => get(row, P + 'ledger/mass-relative'))),
      reason: 'The normalized native residual is not an independent mass closure. End-state station flows are not the time-integrated accepted-step air/outlet/dump masses; multiplying them by dt would conflate publication with the integrated ledger.' }
      : { status: 'independently-recomputed-from-exported-terms', signedResidualKg: statistics(massResiduals),
        relative: massStats, gate: gates.massRelative, passed: massStats.max <= gates.massRelative,
        reconstructedMinusPublishedResidualKg: statistics(massPublishedResidualDifference),
        reconstructedMinusPublishedRelative: statistics(massNativeDifference) },
    fuelWithdrawal: { status: tankResiduals.length ? 'independently-recomputed-from-tank-differences' : 'excluded-frozen-fuel-fixture',
      declaredFixedFuel: Boolean(fixedFuel), observedTankFuelKg: statistics(rows.map(fuelMass)),
      tankDeltaMinusLedgerFuelInKg: statistics(tankResiduals), cumulativeUsedDeltaMinusLedgerFuelInKg: statistics(fuelUsedResiduals),
      scope: 'Fuel supply bookkeeping only; it does not establish whole-engine air/outlet/manifold mass conservation.' } };
}

function contactSegments(derived) {
  const segments = [];
  let start = 0;
  for (let i = 1; i <= derived.length; i++) {
    const inContact = derived[start].contactForceMagnitudeLbf > 0;
    if (i < derived.length && (derived[i].contactForceMagnitudeLbf > 0) === inContact) continue;
    const rows = derived.slice(start, i), times = rows.map(row => row.t);
    segments.push({ inContact, startSeconds: rows[0].t, endSeconds: rows.at(-1).t, samples: rows.length,
      altitudeFt: statistics(rows.map(row => row.altitudeFt), times),
      netUpLbf: statistics(rows.map(row => row.netUpLbf), times),
      contactUpLbf: statistics(rows.map(row => row.contactUpLbf), times),
      n1Percent: statistics(rows.map(row => row.n1Percent), times),
      n2Percent: statistics(rows.map(row => row.n2Percent), times) });
    start = i;
  }
  return { method: 'Contiguous retained samples with any nonzero native contact-force magnitude; every segment is retained.', segments };
}

function settling(derived, gates) {
  // A suffix gate retains every later excursion. It cannot call a short quiet
  // segment settled while a later part of the retained trajectory oscillates.
  const suffix = derived.map(() => ({}));
  for (const key of ['n1Percent', 'n2Percent', 'grossLbf']) {
    let min = Infinity, max = -Infinity, sum = 0;
    for (let i = derived.length - 1; i >= 0; i--) {
      const value = derived[i][key]; min = Math.min(min, value); max = Math.max(max, value); sum += value;
      suffix[i][key] = { span: max - min, mean: sum / (derived.length - i) };
    }
  }
  const observation = gates.observationSeconds ?? 60;
  const match = derived.findIndex((row, i) => derived.at(-1).t - row.t >= observation
    && suffix[i].n1Percent.span <= gates.n1PeakToPeakPercent
    && suffix[i].n2Percent.span <= gates.n2PeakToPeakPercent
    && suffix[i].grossLbf.span / suffix[i].grossLbf.mean <= gates.totalGrossPeakToPeakFraction);
  const fixed = !derived.some(row => !row.held);
  return { method: 'earliest suffix whose full retained span meets spool/gross gates for at least the required observation duration',
    observationSeconds: observation, earliestBoundedEnvelopeSeconds: match < 0 ? null : derived[match].t,
    earliestSettledSeconds: fixed && match >= 0 ? derived[match].t : null,
    settledByDeclaredDeadline: fixed && match >= 0 && derived[match].t <= gates.settlingDeadlineSeconds,
    qualifiedForFixedEnvironment: fixed };
}

function hoverDiagnostic(rows, derived, get, conservationAnalysis) {
  const criteria = engineeringHoverCriteria;
  const selected = rows.filter((_, index) => derived[index].t >= criteria.startSeconds - criteria.timeToleranceSeconds
    && derived[index].t <= criteria.endSeconds + criteria.timeToleranceSeconds);
  const times = selected.map(row => get(row, 'simulation/sim-time-sec'));
  assert.ok(selected.length && Math.abs(times[0] - criteria.startSeconds) <= criteria.timeToleranceSeconds
    && Math.abs(times.at(-1) - criteria.endSeconds) <= criteria.timeToleranceSeconds,
  'hover diagnostic must cover its whole declared observation window');
  const absoluteMax = values => values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const altitudeFt = statistics(selected.map(row => get(row, 'position/h-sl-ft')), times);
  const verticalVelocityFps = statistics(selected.map(row => get(row, 'velocities/h-dot-fps')), times);
  const pitchRad = statistics(selected.map(row => get(row, 'attitude/theta-rad')), times);
  const rollRad = statistics(selected.map(row => get(row, 'attitude/phi-rad')), times);
  const augmentationSamples = rows.filter(row => get(row, 'propulsion/engine/augmentation') > 0
    || get(row, 'propulsion/engine/plant/fuel/ab-burned-kg-sec') > 0).length;
  const contactSamples = derived.filter(row => row.contactForceMagnitudeLbf > 0).length;
  const energy = conservationAnalysis.wholePlantEnergy, mass = conservationAnalysis.wholePlantMass;
  const measurements = { altitudeFt, verticalVelocityFps, pitchRad, rollRad,
    absoluteVerticalSpeedFps: absoluteMax(selected.map(row => get(row, 'velocities/h-dot-fps'))),
    absolutePitchRad: absoluteMax(selected.map(row => get(row, 'attitude/theta-rad'))),
    absoluteRollRad: absoluteMax(selected.map(row => get(row, 'attitude/phi-rad'))),
    contactSamples, numericalRejections: conservationAnalysis.rejectedSamples, augmentationSamples,
    maxIndependentEnergyRelative: energy.relative?.max ?? null, maxIndependentMassRelative: mass.relative?.max ?? null };
  const gates = { freeFlight: derived.every(row => !row.held),
    altitudeSpan: altitudeFt.peakToPeak <= criteria.altitudeSpanFt,
    verticalSpeed: measurements.absoluteVerticalSpeedFps <= criteria.absoluteVerticalSpeedFps,
    pitch: measurements.absolutePitchRad <= criteria.absolutePitchRad,
    roll: measurements.absoluteRollRad <= criteria.absoluteRollRad,
    noContact: contactSamples === 0, noRejections: conservationAnalysis.rejectedSamples === 0,
    noAugmentation: augmentationSamples === 0,
    independentEnergy: energy.status === 'independently-recomputed-from-exported-terms'
      && energy.relative.max <= criteria.energyRelative,
    independentMass: mass.status === 'independently-recomputed-from-exported-terms'
      && mass.relative.max <= criteria.massRelative };
  const initial = rows[0];
  const initialBodySpeedFps = norm(['u', 'v', 'w'].map(axis => get(initial, `velocities/${axis}-fps`)));
  const initialEquatorialRest = Math.abs(get(initial, 'position/lat-geod-rad')) <= 1e-9 && initialBodySpeedFps <= 1e-9;
  const radiusFt = norm(axes.map(axis => get(initial, `position/eci-${axis}-ft`)));
  const initialEciSpeedFps = norm(derived[0].eciVelocity);
  const expectedCorotationAccelerationUpFps2 = -(initialEciSpeedFps ** 2) / radiusFt;
  const initialCorotationCheck = initialEquatorialRest ? {
    scope: 'At the equator with zero initial Earth-relative body speed, retained ECI velocity is corotation. Its radial acceleration is -|v_ECI|²/|r_ECI|.',
    initialBodySpeedFps, initialEciSpeedFps, initialEciRadiusFt: radiusFt,
    inferredAngularSpeedRadSec: initialEciSpeedFps / radiusFt, expectedCorotationAccelerationUpFps2,
    nativeEciAccelerationUpFps2: derived[0].eciAccelerationUpFps2,
    forceAccelerationUpFps2: derived[0].forceAccelerationUpFps2,
    forceMinusExpectedCorotationAccelerationUpFps2: derived[0].forceAccelerationUpFps2 - expectedCorotationAccelerationUpFps2,
    nativeBodyWdotFps2: derived[0].nativeBodyWdotFps2,
    initialNetUpLbf: derived[0].netUpLbf } : {
    scope: 'The equatorial initial-rest corotation check is unavailable for this initial state.', initialBodySpeedFps };
  return { scope: 'Engineering fixed-load free-flight hover diagnostic; neither manufacturer limits nor a captured user configuration.',
    criteriaDeclaredBeforeTraceInspection: true, criteria,
    observationWindow: { startSeconds: times[0], endSeconds: times.at(-1), samples: selected.length },
    exclusionWindow: 'Contact, rejection and augmentation are checked over the whole retained run.',
    measurements, gates, passed: Object.values(gates).every(Boolean), initialCorotationCheck };
}

async function analyze(reportPath, out, options = {}) {
  const reportBytes = await readFile(reportPath);
  const report = JSON.parse(reportBytes);
  const xmlIdentity = report.inputs.find(input => /\/F-35B-jsbsim(?:-empirical)?\.xml$/.test(input.path));
  assert.ok(xmlIdentity, 'recorded aircraft XML input');
  const xmlBytes = await readFile(path.join(root, xmlIdentity.path));
  assert.equal(sha256(xmlBytes), xmlIdentity.sha256,
    'aircraft XML differs from recorded trace input; restore/provide the recorded input before analysis');
  const spec = installation(xmlBytes.toString('utf8'));
  const results = [];
  for (const result of report.results) {
    const tracePath = path.join(path.dirname(reportPath), result.trace.file);
    const traceBytes = await readFile(tracePath);
    assert.equal(sha256(traceBytes), result.trace.sha256, `trace hash ${tracePath}`);
    const { rows, get, optional } = parseTrace(traceBytes);
    assert.equal(rows.length, result.trace.rows);
    const derived = rows.map(row => derive(row, get, optional, spec));
    const conservationAnalysis = conservation(rows, derived, get, optional, result.gates, spec, result.fixedFuel);
    const settlingStart = result.gates.settlingDeadlineSeconds;
    const tail = derived.filter(row => row.t >= settlingStart);
    const times = tail.map(row => row.t);
    // Finite ECI velocity differences independently inspect propagated motion.
    // Central differences use neighboring retained states, not native force equations.
    const motionResidual = [], motionAcceleration = [];
    for (let i = 1; i < derived.length - 1; i++) {
      const row = derived[i];
      if (row.held || row.t < settlingStart) continue;
      const before = derived[i - 1], after = derived[i + 1];
      const derivative = scale(after.eciVelocity.map((value, axis) => value - before.eciVelocity[axis]), 1 / (after.t - before.t));
      const observed = dot(derivative, row.upEci);
      motionAcceleration.push(observed);
      motionResidual.push(observed - row.eciAccelerationUpFps2);
    }
    const numericKeys = Object.keys(derived[0]).filter(key => typeof derived[0][key] === 'number');
    const metrics = Object.fromEntries(numericKeys.map(key => [key, statistics(tail.map(row => row[key]), times)]));
    if (!derived[0].held) metrics.eciAccelerationResidualFps2 = statistics(tail.map(row => row.eciAccelerationResidualFps2), times);
    const initialLoad = load(rows[0], get, spec), finalLoad = load(rows.at(-1), get, spec);
    const columns = [...new Set(derived.flatMap(row => Object.keys(row).filter(key =>
      typeof row[key] === 'number' || key === 'eciAccelerationResidualFps2')))];
    const derivedBytes = gzipSync([columns.join(','), ...derived.map(row => columns.map(key => row[key] ?? '').join(','))].join('\n') + '\n');
    const filename = path.basename(path.dirname(reportPath)) + '-' + result.name + '-force-weight.csv.gz';
    await writeFile(path.join(out, filename), derivedBytes);
    const analyzed = { name: result.name, sourceReport: path.relative(root, reportPath),
      sourceTrace: { path: path.relative(root, tracePath), sha256: result.trace.sha256 },
      conditions: Object.fromEntries(Object.entries(result).filter(([key]) =>
        !['initial', 'final', 'trace', 'metrics', 'numerical', 'gates'].includes(key))),
      sampleCount: derived.length, window: { startSeconds: tail[0].t, endSeconds: tail.at(-1).t, samples: tail.length },
      endpoints: { initial: derived[0], final: derived.at(-1) },
      load: { initial: initialLoad, final: finalLoad, fuelUsedLbs: initialLoad.fuelLbs - finalLoad.fuelLbs },
      geometry: { initialMainAftArmInches: derived[0].mainAftArmInches, finalMainAftArmInches: derived.at(-1).mainAftArmInches,
        initialFanForwardArmInches: derived[0].fanForwardArmInches, finalFanForwardArmInches: derived.at(-1).fanForwardArmInches,
        initialLeverArmRatio: derived[0].leverArmRatio, finalLeverArmRatio: derived.at(-1).leverArmRatio },
      metrics, cycle: Object.fromEntries(['n1Percent', 'n2Percent', 'grossLbf'].map(key => [key, cycle(tail.map(row => row[key]), times,
        key === 'n1Percent' ? result.gates.n1PeakToPeakPercent : key === 'n2Percent' ? result.gates.n2PeakToPeakPercent
          : result.gates.totalGrossPeakToPeakFraction * metrics.grossLbf.mean)])),
      settling: settling(derived, result.gates), contact: contactSegments(derived), conservation: conservationAnalysis,
      engineeringHoverDiagnostic: options.hoverDiagnostic ? hoverDiagnostic(rows, derived, get, conservationAnalysis) : undefined,
      acceleration: {
        inertialVectorResidualFps2: derived[0].held ? null : metrics.eciAccelerationResidualFps2,
        finiteDifferenceEciMotionUpFps2: statistics(motionAcceleration),
        finiteDifferenceMinusNativeEciAccelerationFps2: statistics(motionResidual),
        heldDown: derived[0].held,
        interpretation: derived[0].held ? 'Native hold-down suppresses motion. Net force/mass is the unrestrained acceleration, not a measured acceleration or hover.'
          : 'ECI acceleration includes applied force and gravitation. ECEF-relative/body acceleration also contains planetary rotation terms; central ECI velocity differences include integration/sampling error.' },
      derivedTrace: { file: filename, sha256: sha256(derivedBytes), rows: derived.length } };
    results.push(analyzed);
    console.log(JSON.stringify({ name: result.name, source: analyzed.sourceReport,
      initialWeightLbs: initialLoad.declaredWeightLbs, finalWeightLbs: finalLoad.declaredWeightLbs,
      fuelUsedLbs: analyzed.load.fuelUsedLbs, meanAppliedUpLbf: metrics.appliedUpLbf.mean,
      meanGravitationalDownLbf: -metrics.gravitationalUpLbf.mean, netUpLbf: metrics.netUpLbf,
      forceSumMaxResidualLbf: metrics.forceSumResidualLbf.max,
      accelerationMaxResidualFps2: analyzed.acceleration.inertialVectorResidualFps2?.max ?? null,
      independentEnergy: analyzed.conservation.wholePlantEnergy,
      independentMassStatus: analyzed.conservation.wholePlantMass.status,
      cycle: analyzed.cycle.n2Percent, settling: analyzed.settling }));
  }
  return { input: { path: path.relative(root, reportPath), sha256: sha256(reportBytes), aircraftXml: xmlIdentity },
    artifactIdentity: report.artifact.identity, assumptions: report.assumptions, installation: spec, results };
}

async function comparisonSource(reference) {
  const reportPath = path.resolve(root, reference.report);
  const reportBytes = await readFile(reportPath), report = JSON.parse(reportBytes);
  const result = report.results.find(item => item.name === reference.case);
  assert.ok(result, `missing comparison case ${reference.case} in ${reference.report}`);
  const tracePath = path.join(path.dirname(reportPath), result.trace.file);
  const traceBytes = await readFile(tracePath);
  assert.equal(sha256(traceBytes), result.trace.sha256, `comparison trace hash ${tracePath}`);
  const parsed = parseTrace(traceBytes);
  assert.equal(parsed.rows.length, result.trace.rows);
  const position = 'fcs/stovl-pos-norm', command = 'fcs/stovl-cmd-norm';
  const initialPosition = parsed.get(parsed.rows[0], position);
  const commandStart = parsed.rows.findIndex(row => parsed.get(row, command) > parsed.get(parsed.rows[0], command));
  const motionStart = parsed.rows.findIndex(row => parsed.get(row, position) > initialPosition + 1e-12);
  const fullConversion = parsed.rows.findIndex(row => parsed.get(row, position) >= 1 - 1e-12);
  const time = index => index < 0 ? null : parsed.get(parsed.rows[index], 'simulation/sim-time-sec');
  const hz = result.hz ?? report.hz;
  const actuation = { initialConversion: initialPosition, finalConversion: parsed.get(parsed.rows.at(-1), position),
    firstIncreasedCommandSampleSeconds: time(commandStart), firstIncreasedPositionSampleSeconds: time(motionStart),
    firstFullConversionSampleSeconds: time(fullConversion),
    firstPositiveStepIncrement: motionStart < 0 ? null : parsed.get(parsed.rows[motionStart], position) - initialPosition,
    travelSecondsFromCommandedStepStart: commandStart <= 0 || fullConversion < commandStart
      ? null : time(fullConversion) - time(commandStart - 1),
    firstPositiveStepRatePerSecond: motionStart < 0 ? null :
      (parsed.get(parsed.rows[motionStart], position) - initialPosition) * hz };
  return { ...parsed, identity: { report: path.relative(root, reportPath), reportSha256: sha256(reportBytes),
    trace: path.relative(root, tracePath), traceSha256: result.trace.sha256, case: result.name,
    hz, algorithm: result.algorithm ?? report.algorithm, actuation,
    artifact: report.artifact.identity, inputs: report.inputs,
    appCommit: report.appCommit ?? null, executedBundleSha256: report.executedBundleSha256 ?? null,
    conditions: Object.fromEntries(Object.entries(result).filter(([key]) =>
      !['initial', 'final', 'trace', 'metrics', 'numerical', 'gates', 'passed'].includes(key))),
    numerical: result.numerical, gates: result.gates } };
}

function comparisonChannels(left, right) {
  // Compare physical observations directly. Diagnostics introduced by a newer
  // SDK remain absent on the old side rather than being filled with zeros.
  const selected = column => /^(?:fcs\/(?:throttle-(?:cmd|pos)-norm|stovl-(?:cmd|pos)-norm|stovl-(?:pitch|roll)-control|lift-split-(?:balance|cmd)|main-throttle-command)|propulsion\/engine\/plant\/(?:shaft\/(?:n[12]-percent|(?:lp|hp|lift-fan)-rad-sec)|control\/[^/]+|state\/control-integrator|fuel\/[^/]+|station\/st(?:2|4|5|6|7)\/total-temperature-k|solid\/[^/]+\/temperature-k|nozzle\/(?:gross-thrust-lbs|mass-flow-kg-sec|exit-static-temperature-k|throat-area-sq-m|exit-area-sq-m|position-norm|regime)|(?:lift-fan|roll-post(?:\[1\])?)\/(?:gross-thrust-lbs|mass-flow-kg-sec|exit-static-temperature-k|speed-percent)))$/.test(column);
  const properties = [...new Set([...left.columns, ...right.columns].map(normalize))].filter(selected);
  return [...properties.map(property => ({ property, terms: [property] })),
    { property: 'derived/total-gross-thrust-lbs', terms: ['nozzle', 'lift-fan', 'roll-post', 'roll-post[1]']
      .map(outlet => `propulsion/engine/plant/${outlet}/gross-thrust-lbs`) }];
}

function comparisonStatistics(values, times) {
  const result = statistics(values, times);
  const maxAbsolute = Math.max(Math.abs(result.min), Math.abs(result.max));
  return { ...result, rms: Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length),
    maxAbsolute, firstMaxAbsoluteTimeSeconds: times[values.findIndex(value => Math.abs(value) === maxAbsolute)] };
}

async function compare(specPath, out) {
  const bytes = await readFile(specPath), specification = JSON.parse(bytes);
  assert.ok(Array.isArray(specification.pairs) && specification.pairs.length, 'comparison pairs required');
  const comparisons = [];
  for (const pair of specification.pairs) {
    const [left, right] = await Promise.all([comparisonSource(pair.left), comparisonSource(pair.right)]);
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const availableCommonHz = gcd(left.identity.hz, right.identity.hz);
    const commonHz = pair.commonHz ?? availableCommonHz;
    assert.ok(Number.isInteger(commonHz) && commonHz > 0 && availableCommonHz % commonHz === 0,
      'requested comparison grid must divide both retained sample rates');
    const timeToleranceSeconds = 1e-7;
    const onCommonGrid = source => {
      const indexed = new Map();
      for (const row of source.rows) {
        const time = source.get(row, 'simulation/sim-time-sec'), index = Math.round(time * commonHz);
        if (Math.abs(time - index / commonHz) > timeToleranceSeconds) continue;
        assert.ok(!indexed.has(index), 'duplicate comparison time');
        indexed.set(index, { row, time });
      }
      return indexed;
    };
    const a = onCommonGrid(left), b = onCommonGrid(right);
    const matched = [...a].filter(([index]) => b.has(index)).map(([index, sample]) => ({
      time: index / commonHz, left: sample.row, right: b.get(index).row,
      timeDifferenceSeconds: b.get(index).time - sample.time }));
    assert.ok(matched.length > 1, 'comparison requires common times');
    const windows = { full: matched, transient: matched.filter(row => row.time <= 20),
      tail: matched.filter(row => row.time >= 20), finalTenSeconds: matched.filter(row => row.time >= matched.at(-1).time - 10) };
    const channels = {};
    for (const channel of comparisonChannels(left, right)) {
      const missingLeft = channel.terms.filter(term => left.optional(left.rows[0], term) === null);
      const missingRight = channel.terms.filter(term => right.optional(right.rows[0], term) === null);
      if (missingLeft.length || missingRight.length) {
        channels[channel.property] = { status: 'unavailable-on-one-or-both-sides', missingLeft, missingRight };
        continue;
      }
      const observe = (source, row) => channel.terms.reduce((sum, term) => sum + source.get(row, term), 0);
      channels[channel.property] = { status: 'compared', windows: Object.fromEntries(Object.entries(windows).map(([name, rows]) => {
        const times = rows.map(row => row.time);
        const av = rows.map(row => observe(left, row.left)), bv = rows.map(row => observe(right, row.right));
        return [name, { left: statistics(av, times), right: statistics(bv, times),
          rightMinusLeft: comparisonStatistics(bv.map((value, i) => value - av[i]), times) }];
      })) };
    }
    const comparison = { name: pair.name, purpose: pair.purpose, left: left.identity, right: right.identity,
      alignment: { method: 'Direct observations at exact common-grid times; no interpolation, smoothing or phase shifting.',
        commonHz, timeToleranceSeconds, samples: matched.length,
        maxMatchedTimeDifferenceSeconds: Math.max(...matched.map(row => Math.abs(row.timeDifferenceSeconds))),
        windows: Object.fromEntries(Object.entries(windows).map(([name, rows]) => [name,
          { startSeconds: rows[0].time, endSeconds: rows.at(-1).time, samples: rows.length }])) }, channels };
    comparisons.push(comparison);
    console.log(JSON.stringify({ name: pair.name, samples: matched.length,
      channels: Object.keys(channels).length, n1Tail: channels['propulsion/engine/plant/shaft/n1-percent'].windows.tail.rightMinusLeft,
      n2Tail: channels['propulsion/engine/plant/shaft/n2-percent'].windows.tail.rightMinusLeft,
      grossTail: channels['derived/total-gross-thrust-lbs'].windows.tail.rightMinusLeft }));
  }
  const result = { schemaVersion: 1, analyzer: { path: 'scripts/validation/f35b/analyze-powered-lift.mjs',
    sha256: sha256(await readFile(fileURLToPath(import.meta.url))) },
    specification: { path: path.relative(root, specPath), sha256: sha256(bytes), ...specification },
    interpretation: 'Differences are right minus left. Full and transient windows retain initialization and control entry. Tail and final-ten-second windows inspect the approached equilibrium without requiring bit-exact algorithm equality. Inspect each source actuation travel duration before interpreting a timestep comparison: the historical fork.20 60/120/240 Hz fixtures loaded FCS at 120 Hz then changed native dt, producing 5/2.5/1.25-second conversion travel respectively. Their entry transients therefore change the plant input trajectory. Historical 240 Hz also changes algorithm; neither historical comparison supports an isolated transient convergence order estimate.',
    comparisons };
  await writeFile(path.join(out, 'comparison.json'), JSON.stringify(result, null, 2) + '\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node scripts/validation/f35b/analyze-powered-lift.mjs [--hover-diagnostic] <retained-report.json> [more-report.json ...]\n       node scripts/validation/f35b/analyze-powered-lift.mjs --compare <comparison-specification.json>');
    return;
  }
  if (args[0] === '--compare') {
    assert.equal(args.length, 2, 'provide one comparison specification');
    const out = newOutputDirectory('validation', 'f135-powered-lift-comparison');
    await compare(path.resolve(root, args[1]), out);
    console.log(path.relative(root, out));
    return;
  }
  const hoverDiagnosticRequested = args.includes('--hover-diagnostic');
  const reportPaths = args.filter(arg => arg !== '--hover-diagnostic');
  assert.ok(reportPaths.length && reportPaths.every(arg => !arg.startsWith('-')), 'provide retained report paths');
  const out = newOutputDirectory('validation', 'f135-powered-lift-analysis');
  const reports = [];
  for (const arg of reportPaths) reports.push(await analyze(path.resolve(root, arg), out, { hoverDiagnostic: hoverDiagnosticRequested }));
  const report = { schemaVersion: 1, analyzer: { path: 'scripts/validation/f35b/analyze-powered-lift.mjs',
    sha256: sha256(await readFile(fileURLToPath(import.meta.url))) },
    methods: {
      coordinateFrame: 'Body X forward, Y right, Z down. Local up is [sin(theta), -sin(phi)cos(theta), -cos(phi)cos(theta)] in body coordinates.',
      force: 'Native applied total excludes gravitation. Main nozzle, all XML external reactions (including inlet drag), aerodynamic and contact forces are reconstructed once; gravity is added once. Gross outlet thrust is also recorded separately.',
      empiricalComparison: 'The empirical model has four native force carriers. Their actual body vectors and locations are summed; there are no separate inlet-drag reactions or coupled shaft-power/airflow/energy ledger. Its thrust-lbs sum is a table force sum, not an independently solved gross-outlet quantity.',
      mass: 'Per-tank capacities come from the hash-matched aircraft XML, quantities and attachment flags from retained observations. Fuel percentage denominator sums internal and attached external capacities.',
      weightAccountingResidual: 'Declared weight minus authored empty weight, observed dry stores and same-sample tank fuel; the residual also contains native update ordering (one fuel step in the retained free-flight runs), not a newly inferred payload.',
      windBasis: 'Direct aero/alpha-rad and beta-rad are used when captured. Earlier traces omitted aero/*; their native u/v/w-aero-fps define the wind basis with atan2(w,u) and atan2(v,hypot(u,w)). Force-sum residual independently checks the result.',
      acceleration: 'Local-up projection of native ECI uidot/vidot/widot is compared with (applied+gravity)/mass, and with central finite differences of ECI velocity. Local up uses geodetic latitude and inertial longitude from recorded ECI position.',
      energy: 'On each accepted sequence advance, reconstruct residual as sum(stored) - [sum(sources)-sum(sinks)] from13 raw exported Joule terms, and normalize with their independently summed absolute values. Native normalized residual alone never qualifies this check.',
      wholePlantMass: 'Requires accepted-step air-in, fuel-in, out, dump and manifold-change masses. Missing integrated quantities are explicitly unavailable; end-state flow observations are not substituted for them. Tank differences independently inspect only supplied-fuel bookkeeping.',
      diagnostics: 'Statistics cover the declared settling window with linear drift and detrended RMS. Cycle periods use detrended hysteretic rising crossings; a candidate is not proof of a controller cause. A free-flight trajectory is not a fixed-environment equilibrium.' },
    units: { forces: 'lbf', moments: 'lbf ft', accelerations: 'ft/s²', fuel: 'lb and kg', lengths: 'inches', time: 'seconds', metersPerFoot: FT_TO_M },
    reports };
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(path.relative(root, out));
}

await main();
