import { NullEngine, Scene, TransformNode } from "@babylonjs/core";
import { afterEach, describe, expect, it } from "vitest";
import { createPlaceholderAircraft, type AircraftEntity } from "../aircraft/createPlaceholderAircraft";
import { computeListenerPose, createListenerPose } from "./audioPose";
import { AVAILABILITY, type AudioSnapshotInit } from "./audioSnapshot";
import { createDspHarness, dominantFrequency, rms, TIER, type DspHarness } from "./dspHarness";

/**
 * Chase-camera zoom, traced from the REAL camera through audioPose into the
 * REAL compiled DSP core. No facade mock stands between them, because the bug
 * these cover lived exactly in that handover: `createPlaceholderAircraft`
 * applies a zoom notch to the camera in one frame, `computeListenerPose` turns
 * the new camera position into a source distance, and Med's propagation delay
 * line used to read that distance as motion. A wheel scroll then walked the
 * delay's read pointer fast enough to bend the whole engine down more than two
 * octaves and back. Only Med spatialises, which is why the pilot heard it on
 * Med and not on Low.
 *
 * The measurement is the power-weighted mean frequency of the output. A delay
 * line that resamples scales every component by the same ratio, so the centroid
 * moves with the artefact; distance gain and the absorption low-pass, which are
 * intended zoom behaviour, barely move it.
 */

const FULL = AVAILABILITY.N1 | AVAILABILITY.N2 | AVAILABILITY.THRUST | AVAILABILITY.FUEL_FLOW
  | AVAILABILITY.COMBUSTION | AVAILABILITY.RUNNING | AVAILABILITY.COMMANDS
  | AVAILABILITY.AIRSPEED | AVAILABILITY.CONFIG | AVAILABILITY.POSE;

/** Engine acoustic centre, from evidence/audio/sf50-geometry-2026-09-14.txt. */
const SOURCE_OFFSET = [0, 1.146, -1.662] as const;
const SAMPLE_RATE = 48_000;
const DEFAULT_CHASE_M = 14.171945;          // |THIRD_PERSON_OFFSET|
/** One mouse-wheel notch: flightCameraInput maps deltaY 100 to exp(0.2). */
const NOTCH = Math.exp(0.2);
const WINDOW_S = 0.06;

const engines: NullEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); });

function steady(overrides: Partial<AudioSnapshotInit>): AudioSnapshotInit {
  return {
    sequence: 0, epoch: 1, simTimeS: 0, availability: FULL,
    n1Pct: 80, n2Pct: 85, thrustLbf: 1200, fuelFlowPps: 0.18, throttleNorm: 0.8,
    combustion: true, running: true, starter: false, cutoff: false,
    kias: 0, gearNorm: 0, flapNorm: 0, soundSpeedMps: 343, groundReflectionM: -1,
    source: [0, 0, 0], sourceVelocity: [0, 0, 0], listenerVelocity: [0, 0, 0],
    exterior: 1, poseValid: true, ...overrides,
  };
}

async function tierHarness(tier: number): Promise<DspHarness> {
  const harness = await createDspHarness({ sampleRate: SAMPLE_RATE });
  harness.exports.osfs_audio_set_tier(tier);
  // Tire and airframe off: this is about what the engine path does with pose.
  harness.exports.osfs_audio_set_gains(1, 1, 0, 0, 0);
  harness.anchor(1, 0);
  return harness;
}

function aircraftInScene(): AircraftEntity {
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  return createPlaceholderAircraft(scene, new TransformNode("origin", scene));
}

/**
 * Renders `seconds` at `tier` while `plan` drives the real camera. `plan`
 * returns the zoom factor to apply at that publication instant, exactly as the
 * canvas wheel handler would.
 */
async function flyCamera(
  tier: number, plan: (time: number, aircraft: AircraftEntity) => number, seconds = 2,
): Promise<Float32Array> {
  const aircraft = aircraftInScene();
  const harness = await tierHarness(tier);
  const pose = createListenerPose();
  let sequence = 0;
  let nextPublish = 0;
  return harness.renderSeconds(seconds, (frame) => {
    const time = frame / harness.sampleRate;
    while (nextPublish <= time + 0.1) {
      const factor = plan(nextPublish, aircraft);
      if (factor !== 1) aircraft.zoomChaseCamera(factor);
      const exterior = aircraft.getViewMode() === "third" ? 1 : 0;
      computeListenerPose({
        camera: exterior ? aircraft.thirdPersonCamera : aircraft.firstPersonCamera,
        aircraftRoot: aircraft.root,
        sourceOffset: SOURCE_OFFSET,
        velocityWorld: [0, 0, 0],
        exterior,
        heightAboveGroundM: null,
      }, pose);
      sequence += 1;
      harness.pushSnapshot(steady({
        sequence, simTimeS: nextPublish,
        source: [...pose.source] as [number, number, number],
        sourceVelocity: [...pose.sourceVelocity] as [number, number, number],
        listenerVelocity: [...pose.listenerVelocity] as [number, number, number],
        exterior: pose.exterior,
        groundReflectionM: pose.groundReflectionM,
        poseValid: pose.valid,
      }));
      nextPublish += 1 / 60;
    }
  }).left;
}

/** Power-weighted mean frequency. A resampling ratio scales it directly. */
function centroid(samples: Float32Array, low = 200, high = 8000, step = 20): number {
  let weighted = 0;
  let total = 0;
  for (let frequency = low; frequency <= high; frequency += step) {
    const omega = (2 * Math.PI * frequency) / SAMPLE_RATE;
    let re = 0;
    let im = 0;
    for (let i = 0; i < samples.length; i += 1) {
      re += samples[i] * Math.cos(omega * i);
      im += samples[i] * Math.sin(omega * i);
    }
    const power = re * re + im * im;
    weighted += frequency * power;
    total += power;
  }
  return total > 0 ? weighted / total : 0;
}

/** Per-window centroid ratio of `moved` against `parked`, from `fromSeconds`. */
function centroidRatios(
  moved: Float32Array, parked: Float32Array, fromSeconds: number,
): Array<{ time: number; ratio: number }> {
  const width = Math.round(SAMPLE_RATE * WINDOW_S);
  const out: Array<{ time: number; ratio: number }> = [];
  for (let start = Math.round(fromSeconds * SAMPLE_RATE); start + width <= moved.length; start += width) {
    const reference = centroid(parked.subarray(start, start + width));
    if (reference <= 0) continue;
    out.push({ time: start / SAMPLE_RATE, ratio: centroid(moved.subarray(start, start + width)) / reference });
  }
  return out;
}

function extremes(ratios: Array<{ time: number; ratio: number }>): { lowest: number; highest: number } {
  return {
    lowest: Math.min(...ratios.map((r) => r.ratio)),
    highest: Math.max(...ratios.map((r) => r.ratio)),
  };
}

/** Parks the camera at `metres` before the measured span, then holds it there. */
const parkAt = (metres: number) => (time: number): number =>
  (time < 1 / 120 ? metres / DEFAULT_CHASE_M : 1);

/** Eight wheel notches, one per published frame, starting at `startSeconds`. */
function scroll(direction: 1 | -1, startSeconds = 1, notches = 8): (time: number) => number {
  let left = notches;
  return (time) => (time >= startSeconds && left > 0 ? (left -= 1, NOTCH ** direction) : 1);
}

describe("chase-camera zoom through the compiled DSP core", () => {
  it("does not bend the engine's pitch when the pilot scrolls out", async () => {
    // Eight notches take the chase camera 14.2 m -> 70.2 m in about 130 ms.
    const zoomed = await flyCamera(TIER.med, scroll(1));
    const parked = await flyCamera(TIER.med, parkAt(70.216));
    const { lowest, highest } = extremes(centroidRatios(zoomed, parked, 0.6));
    // Before the propagation delay was driven by the Doppler ratio instead of
    // raw geometry this bottomed out at 0.21 - the engine fell more than two
    // octaves and glided back over ~450 ms.
    expect(lowest).toBeGreaterThan(0.8);
    expect(highest).toBeLessThan(1.25);
    // The zoom is still audible and still gets quieter with distance.
    expect(rms(zoomed, Math.round(1.5 * SAMPLE_RATE))).toBeGreaterThan(1e-4);
    expect(rms(zoomed, Math.round(1.5 * SAMPLE_RATE)))
      .toBeLessThan(rms(zoomed, 0, Math.round(0.9 * SAMPLE_RATE)));
  }, 60_000);

  it("does not bend the engine's pitch when the pilot scrolls back in", async () => {
    const inwards = scroll(-1);
    const zoomed = await flyCamera(TIER.med, (time) =>
      (time < 1 / 120 ? 100 / DEFAULT_CHASE_M : inwards(time)));
    const parked = await flyCamera(TIER.med, parkAt(100 * NOTCH ** -8));
    const { lowest, highest } = extremes(centroidRatios(zoomed, parked, 0.6));
    // This direction ran the read pointer the other way: 1.82 before the fix.
    expect(lowest).toBeGreaterThan(0.8);
    expect(highest).toBeLessThan(1.25);
  }, 60_000);

  it("puts the partials back exactly where they were once the zoom stops", async () => {
    // A tap that keeps creeping toward the new distance would leave a small
    // permanent detune here even though the wheel stopped turning. The N1
    // fundamental is 2500 x n1 = 2000 Hz and must land there again.
    const zoomed = await flyCamera(TIER.med, scroll(1));
    const parked = await flyCamera(TIER.med, parkAt(70.216));
    const settled = (samples: Float32Array): number =>
      dominantFrequency(samples.subarray(Math.round(1.4 * SAMPLE_RATE)), SAMPLE_RATE, 1700, 2400, 2);
    expect(settled(zoomed)).toBeCloseTo(settled(parked), 0);
  }, 60_000);

  it("keeps the engine audible out to the zoom limit, on Low's distance law", async () => {
    // sound.md §3 puts level at range under `min(1, 1/distance)` and stops
    // there. Med used to fade its direct path out past about 144 m to protect
    // the 0.5 s delay storage, which silenced an engine that is still plainly
    // audible half a kilometre away and made Med and Low disagree.
    const level = async (tier: number, metres: number): Promise<number> =>
      rms(await flyCamera(tier, parkAt(metres), 1.2), Math.round(0.6 * SAMPLE_RATE));
    const [medNear, medFar, lowNear, lowFar] = await Promise.all([
      level(TIER.med, 125), level(TIER.med, 500),
      level(TIER.low, 125), level(TIER.low, 500),
    ]);
    // Audible at the 8..500 m zoom clamp's far end, not digital silence.
    expect(medFar).toBeGreaterThan(1e-5);
    // Two octaves of range cost the same at both tiers: one distance law.
    expect(medNear / medFar).toBeCloseTo(lowNear / lowFar, 0);
    // And that law is spherical spreading, 6 dB per doubling.
    expect(medNear / medFar).toBeGreaterThan(3.2);
    expect(medNear / medFar).toBeLessThan(4.8);
  }, 60_000);

  it("leaves Low, which does not spatialise, exactly as it was", async () => {
    const zoomed = await flyCamera(TIER.low, scroll(1));
    const parked = await flyCamera(TIER.low, parkAt(70.216));
    const { lowest, highest } = extremes(centroidRatios(zoomed, parked, 0.6));
    expect(lowest).toBeGreaterThan(0.9);
    expect(highest).toBeLessThan(1.1);
  }, 60_000);

  it("holds a steady spectrum with a fixed chase camera and in the cockpit", async () => {
    for (const plan of [parkAt(DEFAULT_CHASE_M), cockpit]) {
      const held = await flyCamera(TIER.med, plan);
      const half = Math.round(held.length / 2);
      const early = centroid(held.subarray(Math.round(0.6 * SAMPLE_RATE), half));
      const late = centroid(held.subarray(half));
      expect(late / early).toBeGreaterThan(0.95);
      expect(late / early).toBeLessThan(1.05);
      expect(rms(held, half)).toBeGreaterThan(1e-4);
    }
  }, 60_000);

  it("still shifts pitch for a listener the source is genuinely closing on", async () => {
    // A detached listener, as sound.md's flyby fixture uses: the source really
    // moves through the air, so the Doppler ratio is real and must survive.
    const closing = await approach(-100);
    const still = await approach(0);
    const { lowest, highest } = extremes(centroidRatios(closing, still, 0.4));
    // 343 / (343 - 100) = 1.41 for the whole approach. A ratio near 1 would
    // mean the delay line had stopped carrying Doppler at all.
    expect(lowest).toBeGreaterThan(1.2);
    expect(highest).toBeLessThan(1.7);
  }, 60_000);
});

/** Cockpit view for the whole run: zoom does not reach the cockpit camera. */
const cockpit = (time: number, aircraft: AircraftEntity): number => {
  if (time < 1 / 120) aircraft.setViewMode("first");
  return 1;
};

/** Straight-line approach at `metresPerSecond` (negative closes the range). */
async function approach(metresPerSecond: number, seconds = 1.1): Promise<Float32Array> {
  const harness = await tierHarness(TIER.med);
  let sequence = 0;
  let nextPublish = 0;
  return harness.renderSeconds(seconds, (frame) => {
    const time = frame / harness.sampleRate;
    while (nextPublish <= time + 0.1) {
      const range = 140 + metresPerSecond * nextPublish;
      sequence += 1;
      harness.pushSnapshot(steady({
        sequence, simTimeS: nextPublish,
        source: [0, 0, range],
        sourceVelocity: [0, 0, metresPerSecond],
        listenerVelocity: [0, 0, 0],
        exterior: 1,
      }));
      nextPublish += 1 / 60;
    }
  }).left;
}
