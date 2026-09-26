import { describe, expect, it } from "vitest";
import { AUDIO_EVENT, AVAILABILITY, type AudioSnapshotInit } from "./audioSnapshot";
import {
  bandPower, createDspHarness, difference, dominantFrequency, peak, rms, TIER, type DspHarness,
} from "./dspHarness";

/**
 * These run the ACTUAL compiled audio-dsp.wasm. They test DSP behaviour and
 * bounds, not byte identity: sound.md §6 asks for metrics and listening rather
 * than cross-platform floating-point equality.
 */

const FULL = AVAILABILITY.N1 | AVAILABILITY.N2 | AVAILABILITY.THRUST | AVAILABILITY.FUEL_FLOW
  | AVAILABILITY.COMBUSTION | AVAILABILITY.RUNNING | AVAILABILITY.COMMANDS
  | AVAILABILITY.AIRSPEED | AVAILABILITY.CONFIG | AVAILABILITY.POSE;

/** Cockpit listener roughly where createPlaceholderAircraft puts the pilot. */
const COCKPIT: Pick<AudioSnapshotInit, "source" | "exterior"> = {
  source: [0, 0.96, -4.06], exterior: 0,
};

function state(overrides: Partial<AudioSnapshotInit> = {}): AudioSnapshotInit {
  return {
    sequence: 0, epoch: 1, simTimeS: 0, availability: FULL,
    n1Pct: 0, n2Pct: 0, thrustLbf: 0, fuelFlowPps: 0, throttleNorm: 0,
    combustion: false, running: false, starter: false, cutoff: true,
    kias: 0, gearNorm: 1, flapNorm: 0, soundSpeedMps: 343, groundReflectionM: -1,
    ...COCKPIT, ...overrides,
  };
}

/** Feeds telemetry at 60 Hz for `seconds` and renders the same span. */
function run(
  harness: DspHarness, seconds: number,
  at: (time: number) => Partial<AudioSnapshotInit>,
  startTime = 0,
): { left: Float32Array; right: Float32Array } {
  let sequence = 0;
  let nextPublish = startTime;
  const firstFrame = harness.frame;
  return harness.renderSeconds(seconds, (frame) => {
    const time = startTime + (frame - firstFrame) / harness.sampleRate;
    // Publish a little ahead so the interpolator always has a bracket.
    while (nextPublish <= time + 0.1) {
      sequence += 1;
      harness.pushSnapshot(state({ sequence, simTimeS: nextPublish, ...at(nextPublish) }));
      nextPublish += 1 / 60;
    }
  });
}

async function lowTier(sampleRate = 48_000): Promise<DspHarness> {
  const harness = await createDspHarness({ sampleRate });
  harness.exports.osfs_audio_set_tier(TIER.low);
  harness.exports.osfs_audio_set_gains(1, 1, 1, 1, 0);
  harness.anchor(1, 0);
  return harness;
}

describe("DSP core, running the compiled WASM", () => {
  it("allocates no graph and emits digital silence at Tier 0", async () => {
    const harness = await createDspHarness();
    harness.exports.osfs_audio_set_tier(TIER.off);
    harness.anchor(1, 0);
    const { left, right } = run(harness, 0.25, () => ({ n1Pct: 100, n2Pct: 100, combustion: true }));
    expect(peak(left)).toBe(0);
    expect(peak(right)).toBe(0);
    expect(harness.exports.osfs_audio_get_tier()).toBe(TIER.off);
  });

  it.each([44_100, 48_000])("renders finite, bounded audio at %i Hz", async (sampleRate) => {
    const harness = await lowTier(sampleRate);
    const { left, right } = run(harness, 1, () => ({
      n1Pct: 92, n2Pct: 96, thrustLbf: 1500, fuelFlowPps: 0.2,
      combustion: true, running: true, cutoff: false, kias: 240,
    }));
    expect(left.every(Number.isFinite)).toBe(true);
    expect(right.every(Number.isFinite)).toBe(true);
    // -1 dBFS sample-peak limiter (sound.md §3). Not a true-peak guarantee.
    expect(peak(left)).toBeLessThanOrEqual(0.8912509381337456 + 1e-6);
    expect(peak(right)).toBeLessThanOrEqual(0.8912509381337456 + 1e-6);
    expect(rms(left, Math.round(sampleRate * 0.5))).toBeGreaterThan(1e-4);
  });

  it("changes output when N1 and N2 move independently", async () => {
    const render = async (n1Pct: number, n2Pct: number): Promise<Float32Array> => run(
      await lowTier(), 0.6,
      () => ({ n1Pct, n2Pct, fuelFlowPps: 0.0211, combustion: true, running: true, cutoff: false }),
    ).left.subarray(Math.round(48_000 * 0.3));
    const idle = await render(24.3, 53.4);
    const core = await render(24.3, 90);
    const fan = await render(90, 53.4);
    // Same seed and inputs cancel exactly, so the residual is the shaft that
    // moved. Total RMS cannot show the core: its tones sit above the 1.2 kHz
    // cockpit low-pass while the fan tone carries the level.
    expect(rms(difference(core, idle))).toBeGreaterThan(rms(idle) * 0.02);
    expect(rms(difference(fan, idle))).toBeGreaterThan(rms(idle) * 0.5);
    // The core reference itself moved: 6000 x n2 is 3204 Hz at idle, 5400 Hz
    // at 90%. Initial synthetic references, not measured shaft orders.
    const idleCore = dominantFrequency(idle, 48_000, 2000, 7000, 20);
    const spooledCore = dominantFrequency(core, 48_000, 2000, 7000, 20);
    expect(idleCore).toBeGreaterThan(3000);
    expect(idleCore).toBeLessThan(3400);
    expect(spooledCore).toBeGreaterThan(5200);
    expect(spooledCore).toBeLessThan(5600);
  });

  it("tracks the fan reference frequency as N1 rises", async () => {
    const harness = await lowTier();
    // Cockpit filtering rolls off above 1.2 kHz, so read the N1 tone at a
    // speed whose reference sits inside the passband.
    const { left } = run(harness, 0.8, () => ({
      n1Pct: 30, n2Pct: 0, combustion: false, cutoff: true,
    }));
    const tail = left.subarray(Math.round(48_000 * 0.5));
    // Initial synthetic reference f = 2500 * n1 = 750 Hz. NOT a measured BPF.
    expect(dominantFrequency(tail, 48_000, 400, 1200, 5)).toBeGreaterThan(600);
    expect(dominantFrequency(tail, 48_000, 400, 1200, 5)).toBeLessThan(900);
  });

  it("keeps rotating tones but drops the burner when combustion stops", async () => {
    const from = Math.round(48_000 * 0.35);
    const burning = run(await lowTier(), 0.6, () => ({
      n1Pct: 40, n2Pct: 60, fuelFlowPps: 0.15, combustion: true, running: true, cutoff: false,
    })).left.subarray(from);
    const windmilling = run(await lowTier(), 0.6, () => ({
      n1Pct: 40, n2Pct: 60, fuelFlowPps: 0, combustion: false, cutoff: true,
    })).left.subarray(from);

    // The shafts still turn: the fan reference (2500 x 0.40 = 1000 Hz) is
    // present at the same level with or without fuel.
    expect(dominantFrequency(windmilling, 48_000, 700, 1300, 5)).toBeGreaterThan(950);
    expect(dominantFrequency(windmilling, 48_000, 700, 1300, 5)).toBeLessThan(1050);
    const toneRatio = bandPower(windmilling, 48_000, 998, 1002, 1)
      / bandPower(burning, 48_000, 998, 1002, 1);
    expect(toneRatio).toBeGreaterThan(0.8);
    expect(toneRatio).toBeLessThan(1.25);

    // Only fuel and combustion differ, so the residual IS the burner, and it
    // lives in the 40-400 Hz combustor band rather than anywhere else.
    const burner = difference(burning, windmilling);
    expect(rms(burner)).toBeGreaterThan(rms(windmilling) * 0.05);
    expect(bandPower(burner, 48_000, 40, 400, 5)).toBeGreaterThan(
      bandPower(burner, 48_000, 800, 2000, 10) * 10,
    );
  });

  it("goes silent at standstill with no fuel", async () => {
    const harness = await lowTier();
    const { left } = run(harness, 0.5, () => ({}));
    expect(rms(left, Math.round(48_000 * 0.3))).toBeLessThan(1e-6);
  });

  it("applies the cockpit and exterior installations differently", async () => {
    const cockpit = await lowTier();
    const cockpitOut = run(cockpit, 0.6, () => ({
      n1Pct: 80, n2Pct: 85, thrustLbf: 1200, fuelFlowPps: 0.18,
      combustion: true, running: true, cutoff: false,
    }));
    const exterior = await lowTier();
    const exteriorOut = run(exterior, 0.6, () => ({
      n1Pct: 80, n2Pct: 85, thrustLbf: 1200, fuelFlowPps: 0.18,
      combustion: true, running: true, cutoff: false,
      source: [0, 2, -12], exterior: 1,
    }));
    const from = Math.round(48_000 * 0.35);
    expect(rms(exteriorOut.left, from)).not.toBeCloseTo(rms(cockpitOut.left, from), 4);
    // Both stay audible; a view change is a timbre change, not a mute.
    expect(rms(cockpitOut.left, from)).toBeGreaterThan(1e-5);
    expect(rms(exteriorOut.left, from)).toBeGreaterThan(1e-5);
  });

  it("pans an off-centre exterior source", async () => {
    const harness = await lowTier();
    const { left, right } = run(harness, 0.6, () => ({
      n1Pct: 85, n2Pct: 90, thrustLbf: 1500, fuelFlowPps: 0.2,
      combustion: true, running: true, cutoff: false,
      source: [30, 2, 5], exterior: 1,
    }));
    const from = Math.round(48_000 * 0.35);
    expect(rms(right, from)).toBeGreaterThan(rms(left, from) * 1.5);
  });

  it("fades to silence after telemetry goes stale, and recovers", async () => {
    const harness = await lowTier();
    // 0.4 s of live telemetry, then nothing at all.
    run(harness, 0.4, () => ({
      n1Pct: 95, n2Pct: 98, thrustLbf: 1800, fuelFlowPps: 0.22,
      combustion: true, running: true, cutoff: false,
    }));
    const starved = harness.renderSeconds(0.8);
    const from = Math.round(48_000 * 0.6);
    expect(rms(starved.left, from)).toBeLessThan(1e-6);
    expect(harness.stats().staleFades).toBeGreaterThan(0);

    // Fresh telemetry on the same epoch brings it back.
    const resumeTime = harness.frame / harness.sampleRate;
    const revived = run(harness, 0.5, () => ({
      n1Pct: 95, n2Pct: 98, thrustLbf: 1800, fuelFlowPps: 0.22,
      combustion: true, running: true, cutoff: false,
    }), resumeTime);
    expect(rms(revived.left, Math.round(48_000 * 0.3))).toBeGreaterThan(1e-5);
  });

  it("rejects non-finite telemetry instead of latching a NaN", async () => {
    const harness = await lowTier();
    run(harness, 0.3, () => ({
      n1Pct: 70, n2Pct: 80, fuelFlowPps: 0.15, combustion: true, running: true, cutoff: false,
    }));
    // Write a NaN straight into the batch, past writeAudioSnapshot's guard.
    const batch = new Float64Array(harness.exports.memory.buffer,
      harness.exports.osfs_audio_batch_ptr(), harness.exports.osfs_audio_batch_length());
    batch.fill(0);
    batch[0] = 1;
    batch[2 + 2] = 1;              // epoch
    batch[2 + 3] = 0.5;            // simTimeS
    batch[2 + 5] = Number.NaN;     // n1Pct
    harness.exports.osfs_audio_commit_batch();
    expect(harness.stats().nonFinite).toBeGreaterThan(0);
    expect(harness.stats().snapshotsDropped).toBeGreaterThan(0);
    const after = harness.renderSeconds(0.2);
    expect(after.left.every(Number.isFinite)).toBe(true);
  });

  it("drops snapshots from another epoch and rebases on a new anchor", async () => {
    const harness = await lowTier();
    harness.pushSnapshot(state({ epoch: 99, simTimeS: 5, n1Pct: 100 }));
    expect(harness.stats().snapshotsDropped).toBe(1);
    expect(harness.stats().snapshotsIn).toBe(0);

    harness.anchor(2, 1000);
    expect(harness.stats().epoch).toBe(2);
    harness.pushSnapshot(state({ epoch: 2, simTimeS: 1000, n1Pct: 50 }));
    expect(harness.stats().snapshotsIn).toBe(1);
  });

  it("lands light-off at its own timestamp and holds it until telemetry agrees", async () => {
    // Fuel arrives with the event at 0.30 s; the combustion bit lags to 0.45 s.
    const telemetry = (time: number): Partial<AudioSnapshotInit> => ({
      n1Pct: 20, n2Pct: 45, fuelFlowPps: time >= 0.3 ? 0.0211 : 0,
      combustion: time >= 0.45, cutoff: time < 0.3,
    });
    const plain = run(await lowTier(), 0.9, telemetry).left;
    const evented = await lowTier();
    evented.pushEvent(AUDIO_EVENT.LIGHT_OFF, 0.3, 1);
    const withEvent = run(evented, 0.9, telemetry).left;
    expect(evented.stats().eventsIn).toBe(1);

    const frameAt = (seconds: number): number => Math.round(seconds * 48_000);
    const lag = 2 / 60;
    const residual = difference(withEvent, plain);
    // Bit-identical until the event's own frame, rendered two intervals late...
    expect(peak(residual.subarray(0, frameAt(0.3 + lag) - 2))).toBe(0);
    // ...burning while the combustion bit still says no...
    const heldFrom = frameAt(0.3 + lag + 0.03);
    const heldTo = frameAt(0.43 + lag);
    expect(rms(residual, heldFrom, heldTo)).toBeGreaterThan(1e-6);
    expect(bandPower(withEvent.subarray(heldFrom, heldTo), 48_000, 40, 250, 5)).toBeGreaterThan(
      bandPower(plain.subarray(heldFrom, heldTo), 48_000, 40, 250, 5),
    );
    // ...and released once telemetry agrees, so both renders converge.
    expect(rms(residual, frameAt(0.45 + lag + 0.15), frameAt(0.9)))
      .toBeLessThan(rms(residual, heldFrom, heldTo) * 0.05);
  });

  it("drops a late snapshot rather than rewinding, and merges a repeat", async () => {
    const harness = await lowTier();
    harness.pushSnapshot(state({ sequence: 1, simTimeS: 0.5, n1Pct: 40 }));
    harness.pushSnapshot(state({ sequence: 2, simTimeS: 0.2, n1Pct: 90 }));
    expect(harness.stats().snapshotsDropped).toBe(1);
    harness.pushSnapshot(state({ sequence: 3, simTimeS: 0.5, n1Pct: 45 }));
    harness.render(0);
    expect(harness.stats().queueDepth).toBe(1);
    expect(harness.stats().snapshotsIn).toBe(2);
  });

  it("ignores events stamped with another epoch", async () => {
    const harness = await lowTier();
    harness.pushEvent(AUDIO_EVENT.LIGHT_OFF, 0.1, 99);
    expect(harness.stats().eventsIn).toBe(0);
    expect(harness.stats().eventsDropped).toBe(1);
  });

  it("re-anchors when fresh telemetry is stamped behind the render clock", async () => {
    const harness = await lowTier();
    const engine = {
      n1Pct: 60, n2Pct: 75, fuelFlowPps: 0.1, combustion: true, running: true, cutoff: false,
    };
    run(harness, 0.5, () => engine);
    // A 0.7 s main-thread stall the fixed-step loop does not replay: the
    // simulation resumes where it stopped while the audio clock kept going.
    harness.renderSeconds(0.7);
    const resumed = run(harness, 1, () => engine, 0.6);
    expect(harness.stats().resyncs).toBeGreaterThan(0);
    // Without the re-anchor every one of these snapshots reads as stale and
    // the engine stays silent for the rest of the flight.
    expect(rms(resumed.left, Math.round(48_000 * 0.5))).toBeGreaterThan(1e-4);
  });

  it("resynchronises rather than accumulating a backlog", async () => {
    const harness = await lowTier();
    harness.pushEvent(AUDIO_EVENT.RESYNC, 0, 1);
    harness.pushSnapshot(state({ simTimeS: 0.5, n1Pct: 40, n2Pct: 60 }));
    harness.renderSeconds(0.05);
    expect(harness.stats().resyncs).toBeGreaterThan(0);
  });

  it("sheds detail without changing the tier or breaking the output", async () => {
    const harness = await createDspHarness();
    harness.exports.osfs_audio_set_tier(TIER.med);
    harness.exports.osfs_audio_set_gains(1, 1, 1, 1, 0);
    harness.anchor(1, 0);
    const full = run(harness, 0.5, () => ({
      n1Pct: 95, n2Pct: 98, thrustLbf: 1800, fuelFlowPps: 0.22,
      combustion: true, running: true, cutoff: false, kias: 200,
    }));
    for (let level = 1; level <= 6; level += 1) {
      harness.exports.osfs_audio_set_shed(level);
      expect(harness.exports.osfs_audio_get_shed()).toBe(level);
      const shed = run(harness, 0.3, () => ({
        n1Pct: 95, n2Pct: 98, thrustLbf: 1800, fuelFlowPps: 0.22,
        combustion: true, running: true, cutoff: false, kias: 200,
      }), harness.frame / harness.sampleRate);
      expect(shed.left.every(Number.isFinite)).toBe(true);
      expect(peak(shed.left)).toBeLessThanOrEqual(0.8912509381337456 + 1e-6);
    }
    expect(harness.exports.osfs_audio_get_tier()).toBe(TIER.med);
    expect(peak(full.left)).toBeGreaterThan(0);
  });

  it("runs each tier within the pilot's limits, never above its budget, and sheds from there", async () => {
    const harness = await createDspHarness();
    const caps = () => {
      const stats = harness.stats();
      return { partials: stats.partials, noiseBands: stats.noiseBands, grains: stats.grainCap, starts: stats.grainStarts, irMs: stats.irMs };
    };
    harness.exports.osfs_audio_set_tier(TIER.med);
    expect(caps()).toEqual({ partials: 12, noiseBands: 5, grains: 0, starts: 0, irMs: 20 });
    harness.exports.osfs_audio_set_limits(TIER.med, 6, 3, 12, 160, 15);
    expect(caps()).toEqual({ partials: 6, noiseBands: 3, grains: 0, starts: 0, irMs: 15 });
    // Shedding works down from the limits: oscillators first, then the impulse response.
    harness.exports.osfs_audio_set_shed(1);
    expect(caps()).toMatchObject({ partials: 4, irMs: 15 });
    harness.exports.osfs_audio_set_shed(2);
    expect(caps()).toMatchObject({ partials: 4, irMs: 10 });
    // A limit above the budget, or below the two fundamentals, is held to them.
    harness.exports.osfs_audio_set_limits(TIER.low, 40, 9, 12, 160, 40);
    harness.exports.osfs_audio_set_tier(TIER.low);
    expect(caps()).toEqual({ partials: 4, noiseBands: 4, grains: 0, starts: 0, irMs: 0 });
    harness.exports.osfs_audio_set_limits(TIER.low, 0, 0, 0, 0, 0);
    expect(caps()).toMatchObject({ partials: 2, noiseBands: 0 });
    harness.exports.osfs_audio_set_tier(TIER.high);
    harness.exports.osfs_audio_set_limits(TIER.high, 12, 5, 6, 80, 30);
    expect(caps()).toEqual({ partials: 12, noiseBands: 5, grains: 6, starts: 80, irMs: 30 });
  });

  it.each([44_100, 48_000])("shifts the whole source through the propagation delay at Med (%i Hz)", async (sampleRate) => {
    const render = async (approaching: boolean): Promise<number> => {
      const harness = await createDspHarness({ sampleRate });
      harness.exports.osfs_audio_set_tier(TIER.med);
      harness.exports.osfs_audio_set_gains(1, 1, 0, 1, 0);
      harness.anchor(1, 0);
      const speed = 50;
      const { left } = run(harness, 1.2, (time) => ({
        n1Pct: 30, n2Pct: 0, exterior: 1,
        // Distance really changes, which is what moves the delay line; the
        // velocity-derived ratio only decides which partials would alias.
        source: [0, 0, approaching ? 90 - speed * time : 30 + speed * time],
        sourceVelocity: [0, 0, approaching ? -speed : speed],
      }));
      return dominantFrequency(left.subarray(Math.round(sampleRate * 0.6)), sampleRate, 500, 1000, 2);
    };
    // Synthetic reference 2500 x 0.30 = 750 Hz. A delay line yields the
    // first-order shift 750(1 ± v/c) = 859 / 641 Hz; an ideal moving source
    // would be 878 / 655 Hz. Both are inside these windows; the direction is not negotiable.
    const approach = await render(true);
    const recede = await render(false);
    expect(approach).toBeGreaterThan(835);
    expect(approach).toBeLessThan(895);
    expect(recede).toBeGreaterThan(620);
    expect(recede).toBeLessThan(670);
  });

  it("switches tier under a fade instead of jumping", async () => {
    const harness = await lowTier();
    const engine = {
      n1Pct: 85, n2Pct: 90, thrustLbf: 1500, fuelFlowPps: 0.2, combustion: true, running: true, cutoff: false, kias: 200,
    };
    run(harness, 0.5, () => engine);
    harness.exports.osfs_audio_set_tier(TIER.med);
    const switched = run(harness, 0.2, () => engine, harness.frame / harness.sampleRate);
    expect(harness.exports.osfs_audio_get_tier()).toBe(TIER.med);
    expect(switched.left.every(Number.isFinite)).toBe(true);
    // sound.md §1: fade down, switch, fade up over 50 ms. The first quantum is near silence.
    expect(peak(switched.left.subarray(0, 128)))
      .toBeLessThan(peak(switched.left.subarray(Math.round(0.1 * 48_000))) * 0.2);
  });

  it("gives airframe wind its own gain, independent of the engine", async () => {
    const wind = async (engine: number, airframe: number): Promise<number> => {
      const harness = await createDspHarness();
      harness.exports.osfs_audio_set_tier(TIER.low);
      harness.exports.osfs_audio_set_gains(1, engine, 0, airframe, 0);
      harness.anchor(1, 0);
      // A 300 kt dive with the engine stopped: only the airflow is left.
      return rms(run(harness, 0.6, () => ({ kias: 300, gearNorm: 0 })).left, Math.round(48_000 * 0.3));
    };
    expect(await wind(0, 1)).toBeGreaterThan(1e-4);
    expect(await wind(1, 0)).toBeLessThan(1e-7);
  });

  it("shapes airframe wind as a low roar, not white static", async () => {
    const harness = await createDspHarness();
    harness.exports.osfs_audio_set_tier(TIER.low);
    harness.exports.osfs_audio_set_gains(1, 0, 0, 1, 0);
    harness.anchor(1, 0);
    // Exterior at 12 m: absorption barely filters, so the spectrum is the source's own.
    const { left } = run(harness, 0.8, () => ({ kias: 300, gearNorm: 0, source: [0, 2, -12], exterior: 1 }));
    const tail = left.subarray(Math.round(48_000 * 0.3));
    expect(bandPower(tail, 48_000, 150, 800, 10)).toBeGreaterThan(bandPower(tail, 48_000, 4_000, 8_000, 50) * 10);
  });

  it("keeps the tire cue independent of the engine", async () => {
    const harness = await lowTier();
    harness.exports.osfs_audio_set_gains(1, 0, 1, 0, 0);   // engine muted, tire live
    harness.exports.osfs_audio_set_tire(12_000);
    const tireOnly = run(harness, 0.4, () => ({
      n1Pct: 95, n2Pct: 98, fuelFlowPps: 0.22, combustion: true, running: true, cutoff: false,
    }));
    expect(rms(tireOnly.left, Math.round(48_000 * 0.2))).toBeGreaterThan(1e-4);

    harness.exports.osfs_audio_set_tire(0);
    const silent = run(harness, 0.4, () => ({
      n1Pct: 95, n2Pct: 98, fuelFlowPps: 0.22, combustion: true, running: true, cutoff: false,
    }), harness.frame / harness.sampleRate);
    expect(rms(silent.left, Math.round(48_000 * 0.25))).toBeLessThan(1e-6);
  });

  it("plays the tire cue with no engine telemetry at all", async () => {
    // A C172, or tire-only playback: no adapter, so no snapshot ever arrives.
    const harness = await createDspHarness();
    harness.exports.osfs_audio_set_tier(TIER.low);
    harness.exports.osfs_audio_set_gains(1, 0, 1, 0, 0);
    harness.exports.osfs_audio_set_tire(12_000);
    const { left } = harness.renderSeconds(0.5);
    expect(rms(left, Math.round(48_000 * 0.3))).toBeGreaterThan(1e-4);
  });

  it("bounds a hugely over-range tire input", async () => {
    const harness = await lowTier();
    harness.exports.osfs_audio_set_tire(1e30);
    const { left } = run(harness, 0.3, () => ({}));
    expect(left.every(Number.isFinite)).toBe(true);
    expect(peak(left)).toBeLessThanOrEqual(0.8912509381337456 + 1e-6);
  });

  it("keeps the grain pool inside its caps and reports drops", async () => {
    const harness = await createDspHarness();
    // ORIGINAL SYNTHETIC FIXTURE. No licensed bank exists; this is filtered
    // noise generated here purely to exercise the pool.
    const band = new Float32Array(48_000);
    let phase = 0;
    for (let i = 0; i < band.length; i += 1) {
      phase += 320 / 48_000;
      band[i] = Math.sin(2 * Math.PI * phase) * 0.4 + (Math.random() - 0.5) * 0.1;
    }
    expect(harness.loadBand(0, band, 0.9, 0)).toBe(true);
    expect(harness.loadBand(1, band, 0.9, 1)).toBe(true);
    expect(harness.exports.osfs_audio_bands_ready()).toBe(1);
    harness.exports.osfs_audio_set_tier(TIER.high);
    harness.exports.osfs_audio_set_gains(1, 1, 1, 1, 0);
    harness.anchor(1, 0);
    const { left } = run(harness, 1, () => ({
      n1Pct: 95, n2Pct: 98, thrustLbf: 1800, fuelFlowPps: 0.22,
      combustion: true, running: true, cutoff: false,
    }));
    expect(left.every(Number.isFinite)).toBe(true);
    expect(peak(left)).toBeLessThanOrEqual(0.8912509381337456 + 1e-6);
    expect(harness.stats().activeGrains).toBeLessThanOrEqual(12);

    harness.exports.osfs_audio_band_clear();
    expect(harness.exports.osfs_audio_bands_ready()).toBe(0);
    const afterClear = harness.renderSeconds(0.2);
    expect(afterClear.left.every(Number.isFinite)).toBe(true);
  });

  it("refuses an unusable sample rate rather than rendering nonsense", async () => {
    await expect(createDspHarness({ sampleRate: 1_000 })).rejects.toThrow(/refused/);
    await expect(createDspHarness({ sampleRate: 192_000 })).rejects.toThrow(/refused/);
  });
});
