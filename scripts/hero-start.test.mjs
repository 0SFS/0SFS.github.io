import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';
import { runInNewContext } from 'node:vm';
import { flightAtStart, startGroundKey } from './hero-start.js';

const scene = { latitude: 44.974516, longitude: -93.2375, heightAboveGroundMeters: 180, headingDegrees: 270 };
const template = { latDeg: scene.latitude, lonDeg: scene.longitude, headingDeg: 270, altMeters: 430,
  simulation: { simTimeS: 0, running: true, controls: { throttle: .9 }, initial: {
    'ic/psi-true-deg': 270, 'ic/vn-fps': 0, 'ic/ve-fps': -500, 'ic/vd-fps': 0,
    'ic/theta-deg': 2, 'ic/phi-deg': 0,
  } } };

it('turns the starting velocity with heading while keeping the dry engine, clock and attitude frozen', () => {
  const before = structuredClone(template);
  const next = flightAtStart(template, { ...scene, latitude: 45, longitude: -94, headingDegrees: 0 }, { groundHeightMeters: 250, altitudeMeters: 430 });
  assert.equal(next.latDeg, 45);
  assert.equal(next.lonDeg, -94);
  assert.equal(next.headingDeg, 0);
  assert.equal(next.aboveGroundMeters, 180);
  assert.ok(Math.abs(next.simulation.initial['ic/vn-fps'] - 500) < 1e-9);
  assert.ok(Math.abs(next.simulation.initial['ic/ve-fps']) < 1e-9);
  assert.equal(next.simulation.initial['ic/theta-deg'], 2);
  assert.equal(next.simulation.simTimeS, 0);
  assert.equal(next.simulation.controls.throttle, .9);
  assert.deepEqual(template, before);
});

function editor() {
  const hero = {};
  const timers = [];
  const preparations = [];
  let holds = 0;
  runInNewContext(readFileSync(new URL('./hero-browser-tuner.js', import.meta.url), 'utf8'), {
    hero, heroStart: { flightAtStart, startGroundKey }, AbortController, disposed: false,
    runtime: { surface: { sample: () => ({ heightMeters: 250 }) },
      beginContinuous() { holds++; }, endContinuous() { holds--; } },
    setTimeout(callback) { const timer = { callback, cancelled: false }; timers.push(timer); return timer; },
    clearTimeout(timer) { timer.cancelled = true; },
    prepareFlightTerrain(_runtime, request) { return new Promise(resolve => preparations.push({ request, resolve })); },
    parameters: { get: () => false }, aircraft: { setViewMode() {} },
  });
  Object.assign(hero, {
    config: { scene: { ...scene } }, startTemplate: template, startRevision: 0,
    preparedStartKey: startGroundKey(scene),
    startGround: { groundHeightMeters: 250, altitudeMeters: 430 },
    preparedStartGround: { groundHeightMeters: 250, altitudeMeters: 430 },
    message: {}, updateTab() {}, frameIndex: 45, playing: true,
    readCamera: () => ({ yawDegrees: 12 }), applyCamera() {},
    resetPreview() { this.frameIndex = 0; this.nativePose = this.startFlight; },
    waitForPreview: async () => {},
  });
  return { hero, timers, preparations, holds: () => holds };
}

it('moves immediately at t=0 and rejects a stale terrain result after a newer position edit', async () => {
  const { hero, timers, preparations, holds } = editor();
  const oldReady = hero.applyStart({ ...scene, latitude: 45 });
  assert.equal(hero.nativePose.latDeg, 45); // No timer or terrain promise has resolved.
  assert.equal(hero.frameIndex, 0);
  assert.equal(hero.playing, false);
  const oldTask = timers.shift().callback();
  const latestReady = hero.applyStart({ ...scene, latitude: 46, headingDegrees: 250 });
  assert.equal(hero.nativePose.latDeg, 46);
  assert.equal(await oldReady, false);
  assert.equal(preparations[0].request.signal.aborted, true);
  const latestTask = timers.shift().callback();
  preparations[0].resolve({ groundHeightMeters: 999, altitudeMeters: 1179 });
  await oldTask;
  assert.equal(hero.nativePose.latDeg, 46);
  assert.equal(hero.startGround.groundHeightMeters, 250);
  preparations[1].resolve({ groundHeightMeters: 300, altitudeMeters: 480 });
  await latestTask;
  assert.equal(await latestReady, true);
  assert.equal(hero.nativePose.latDeg, 46);
  assert.equal(hero.nativePose.headingDeg, 250);
  assert.equal(hero.nativePose.aboveGroundMeters, 180);
  assert.equal(hero.preparingStart, false);
  assert.equal(holds(), 0);
});

it('reuses verified ground for heading edits and when returning to a prepared location', async () => {
  const { hero, timers } = editor();
  hero.applyStart({ ...scene, latitude: 45, heightAboveGroundMeters: 300 });
  assert.equal(hero.startGround.altitudeMeters, 550);
  const returned = hero.applyStart({ ...scene, headingDegrees: 250 });
  assert.equal(await returned, true);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].cancelled, true);
  assert.equal(hero.startGround.altitudeMeters, 430);
  assert.equal(hero.nativePose.aboveGroundMeters, 180);
  assert.equal(hero.nativePose.headingDeg, 250);
  assert.equal(hero.preparingStart, false);
});
