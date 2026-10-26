import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { cameraAt, putCameraPoint, validateCamera } from './hero-camera.js';
import { instrumentFlight, instrumentVideoTab } from './hero-instrument.mjs';

const scenario = JSON.parse(readFileSync(new URL('./hero-scenario.json', import.meta.url)));
const point = (timeSeconds, yawDegrees, distanceMeters = 24) => ({ timeSeconds, yawDegrees, distanceMeters, pitchDegrees: 10, fieldOfViewDegrees: 55 });

describe('hero camera paths', () => {
  it('preserves the original scripted orbit and holds an unrecorded manual camera', () => {
    assert.equal(cameraAt(scenario.camera, 2.5, 5).yawDegrees, 2);
    assert.equal(cameraAt({ ...scenario.camera, mode: 'manual' }, 2.5, 5).yawDegrees, 12);
  });
  it('interpolates all camera controls across the short route at the angle boundary', () => {
    const camera = { ...scenario.camera, mode: 'manual', keyframes: [point(1, 170, 20), { ...point(3, -170, 40), pitchDegrees: 30, fieldOfViewDegrees: 75 }] };
    const middle = cameraAt(camera, 2, 5);
    assert.equal(middle.yawDegrees, 180);
    assert.equal(middle.pitchDegrees, 20);
    assert.equal(middle.distanceMeters, 30);
    assert.equal(middle.fieldOfViewDegrees, 65);
    assert.equal(cameraAt(camera, 0, 5).yawDegrees, 170);
    assert.equal(cameraAt(camera, 5, 5).yawDegrees, -170);
  });
  it('replaces a paused edit at the same frame without losing neighboring samples', () => {
    const original = [point(0, 10), point(2, 20)];
    const next = putCameraPoint(putCameraPoint(original, point(1, 15)), point(1, 16));
    assert.deepEqual(next.map(value => value.yawDegrees), [10, 16, 20]);
    assert.equal(original.length, 2);
  });
  it('rejects invalid, oversized, unordered or out-of-scene camera paths', () => {
    validateCamera(scenario.camera, 5);
    validateCamera({ ...scenario.camera, mode: 'manual', keyframes: [point(0, 170), point(5, -170)] }, 5);
    for (const keyframes of [[point(2, 1), point(1, 2)], [point(1, 1), point(1, 2)], [point(6, 1)], [point(1, NaN)], [point(1, 0, 501)], Array.from({ length: 902 }, (_, index) => point(index / 200, 0))]) {
      assert.throws(() => validateCamera({ ...scenario.camera, keyframes }, 5));
    }
    assert.throws(() => validateCamera({ ...scenario.camera, mode: 'pilot' }, 5));
  });
});

describe('capture-only instrumentation boundaries', () => {
  const source = 'import { createSkyPanel } from "/shell.js";\nconst spawn={clearanceMeters: benchmarkRoute ? 0 : 1e3, altitudeMeters: preview.altMeters,};\nruntime.setSimTick((deltaSeconds) => {\nstep(deltaSeconds);\n});\nconst revealAircraft = () => {};';
  it('instruments exactly one flight tick and rejects changed or duplicate anchors', () => {
    const result = instrumentFlight(source, 'const injectedDriver = true;', 180);
    assert.match(result, /clearanceMeters: benchmarkRoute \? 0 : 180/);
    assert.match(result, /const landingCaptureTick/);
    assert.match(result, /const injectedDriver = true/);
    assert.throws(() => instrumentFlight(source + source, '', 180));
    assert.throws(() => instrumentFlight(source.replace('revealAircraft', 'changed'), '', 180));
  });
  it('adds the temporary Video tab for both supported development JSX factory shapes', () => {
    for (const factory of ['const _jsxDEV = __runtime["jsxDEV"];', 'import { jsxDEV as _jsxDEV } from "/jsx.js";']) {
      const result = instrumentVideoTab(factory + '\nconst TAB_DEFINITIONS = [];\nconst options={renderAdditionalTab: (tabId) => { return null; }};');
      assert.match(result, /id: "hero-video", label: "Video"/);
      assert.match(result, /if \(tabId === "hero-video"\)/);
    }
    assert.throws(() => instrumentVideoTab('changed module'));
  });
});

it('keeps the latest scrub request even when it arrives while the previous preview frame draws', async () => {
  const hero = {};
  let holds = 0;
  runInNewContext(readFileSync(new URL('./hero-browser-tuner.js', import.meta.url), 'utf8'), {
    hero, runtime: { beginContinuous() { holds++; }, endContinuous() { holds--; } },
    heroCamera: { cameraAt: (_camera, seconds) => ({ seconds }) }, setTimeout,
  });
  const draws = [];
  Object.assign(hero, {
    config: { camera: {}, timeline: { durationSeconds: 5, fps: 30 } }, frameIndex: 0,
    updateTab() {}, frame() {}, status: () => ({ fault: null }),
    resetPreview() { this.frameIndex = 0; }, applyCamera(camera) { this.lastCamera = camera; },
    waitForPreview: () => new Promise(resolve => draws.push(resolve)),
  });
  const seeking = hero.seekPreview(5);
  assert.equal(hero.frameIndex, 5);
  await hero.seekPreview(2); // The user changes their mind while the first view is drawing.
  draws.shift()();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(hero.frameIndex, 2);
  assert.equal(hero.lastCamera.seconds, 2 / 30);
  draws.shift()();
  await seeking;
  assert.equal(hero.busy, false);
  assert.equal(holds, 0);
});
