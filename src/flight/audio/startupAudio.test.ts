import { describe, expect, it } from "vitest";
import { AVAILABILITY, type AudioSnapshotInit } from "./audioSnapshot";
import { F135_DEFINITION, FJ33_DEFINITION, type EngineAcousticDefinition } from "./engineAcousticDefinitions";
import { createDspHarness, difference, dominantFrequency, peak, rms, TIER } from "./dspHarness";

const available = Object.values(AVAILABILITY).reduce((bits, bit) => bits | bit, 0) & ~AVAILABILITY.SOURCE_AXIS;

async function render(engine: EngineAcousticDefinition, tier: number, state: Partial<AudioSnapshotInit>, options: {
  sampleRate?: number; noise?: boolean;
} = {}) {
  const core = await createDspHarness({ sampleRate: options.sampleRate });
  core.setProfile(engine);
  core.exports.osfs_audio_set_tier(tier);
  core.exports.osfs_audio_set_gains(1, 1, 0, 0, 0);
  // Isolate the engine source, with equal dry routing for the A/B comparisons.
  core.exports.osfs_audio_set_limits(tier, tier === TIER.low ? 4 : 12,
    options.noise === false ? 0 : tier === TIER.low ? 5 : tier === TIER.med ? 6 : 8, 0, 0, 0);
  core.anchor(1, 0);
  let next = 0, sequence = 0;
  const output = core.renderSeconds(1, frame => {
    while (next <= frame / core.sampleRate + 0.1) {
      core.pushSnapshot({ sequence: ++sequence, epoch: 1, simTimeS: next, availability: available,
        n1Pct: 0, n2Pct: 0, thrustLbf: 0, fuelFlowPps: 0, combustion: false, running: false,
        starter: true, cutoff: true, kias: 0, gearNorm: 0, flapNorm: 0, soundSpeedMps: 343,
        source: [0, 0, -1], exterior: 1, groundReflectionM: -1, ...state });
      next += 1 / 60;
    }
  });
  return { samples: output.left.subarray(Math.round(core.sampleRate * 0.6)), sampleRate: core.sampleRate };
}

describe("turbine startup, actual shipped WASM", () => {
  it.each([TIER.low, TIER.med, TIER.high])("has no static floor at near-zero shaft speed in tier %i", async tier => {
    for (const engine of [FJ33_DEFINITION, F135_DEFINITION]) {
      const noise: number[] = [];
      for (const pct of [0.01, 0.1, 1]) {
        const state = { n1Pct: pct, n2Pct: pct };
        const all = await render(engine, tier, state);
        const tones = await render(engine, tier, state, { noise: false });
        noise.push(rms(difference(all.samples, tones.samples)));
        expect(all.samples.every(Number.isFinite)).toBe(true);
        if (pct === 0.1) expect(peak(all.samples)).toBeLessThan(1e-4);
      }
      // All three points used to receive the full idle wake. Each decade of
      // speed must now reduce wake amplitude by substantially more than 10x.
      expect(noise[1]).toBeLessThan(noise[2] * 0.02);
      expect(noise[0]).toBeLessThan(noise[1] * 0.02);
    }
  });

  it.each([44_100, 48_000])("keeps a rising pre-lightoff core whine at %i Hz in every tier", async sampleRate => {
    for (const tier of [TIER.low, TIER.med, TIER.high]) {
      for (const n2Pct of [5, 10, 14]) {
        const state = { n1Pct: n2Pct * 0.5, n2Pct };
        const all = await render(F135_DEFINITION, tier, state, { sampleRate });
        const tones = await render(F135_DEFINITION, tier, state, { sampleRate, noise: false });
        const wanted = 3800 * n2Pct / 100;
        expect(dominantFrequency(all.samples, sampleRate, wanted - 20, wanted + 20, 1)).toBeCloseTo(wanted, 0);
        expect(rms(tones.samples)).toBeGreaterThan(rms(difference(all.samples, tones.samples)) * 4);
      }
    }
  });

  it.each([TIER.low, TIER.med, TIER.high])("keeps combustion tied to native fuel/lightoff instead of an RPM gate in tier %i", async tier => {
    const state = { n1Pct: 8, n2Pct: 16, fuelFlowPps: 0.8, cutoff: false };
    const dry = await render(F135_DEFINITION, tier, state);
    const burning = await render(F135_DEFINITION, tier, { ...state, combustion: true });
    // Native Start can burn well before set-running is true. RPM is identical
    // in the pair, so the added broadband component must follow combustion.
    expect(rms(difference(burning.samples, dry.samples))).toBeGreaterThan(rms(dry.samples) * 4);
  });
});
