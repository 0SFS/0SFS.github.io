import { describe, expect, it } from "vitest";
import { AVAILABILITY, type AudioSnapshotInit } from "./audioSnapshot";
import {
  F135_DEFINITION, FJ33_DEFINITION, type EngineAcousticDefinition, type EngineAcousticProfile,
} from "./engineAcousticDefinitions";
import { bandPower, createDspHarness, difference, dominantFrequency, peak, rms, TIER, type DspHarness } from "./dspHarness";

const full = Object.values(AVAILABILITY).reduce((bits, bit) => bits | bit, 0);
const engines = [FJ33_DEFINITION, F135_DEFINITION] as const;
const parameters = (engine: EngineAcousticDefinition): EngineAcousticProfile => engine.parameters as EngineAcousticProfile;

async function render(engine: EngineAcousticDefinition, options: {
  sampleRate?: number; tier?: number; seconds?: number;
  at?: (time: number) => Partial<AudioSnapshotInit>;
  configure?: (core: DspHarness) => void;
  onBlock?: (core: DspHarness, time: number) => void;
} = {}) {
  const core = await createDspHarness({ sampleRate: options.sampleRate });
  core.setProfile(engine);
  core.exports.osfs_audio_set_tier(options.tier ?? TIER.high);
  core.exports.osfs_audio_set_gains(1, 1, 0, 0, 0);
  options.configure?.(core);
  core.anchor(1, 0);
  const p = parameters(engine);
  let nextPublish = 0;
  let sequence = 0;
  const output = core.renderSeconds(options.seconds ?? 1.1, frame => {
    options.onBlock?.(core, frame / core.sampleRate);
    while (nextPublish <= frame / core.sampleRate + 0.1) {
      core.pushSnapshot({ sequence: ++sequence, epoch: 1, simTimeS: nextPublish, availability: full,
        n1Pct: 90, n2Pct: 95, thrustLbf: p.thrustReferenceLbf, fuelFlowPps: p.fuelReferencePps,
        combustion: true, running: true, cutoff: false, kias: 0, gearNorm: 0, flapNorm: 0,
        soundSpeedMps: 343, source: [0, 0, -10], sourceAxis: [0, 0, 1], exterior: 1,
        groundReflectionM: -1, ...options.at?.(nextPublish) });
      nextPublish += 1 / 60;
    }
  });
  return { core, output, tail: output.left.subarray(Math.round(core.sampleRate * 0.7)) };
}

describe("procedural High, actual WASM behavior rather than qualification", () => {
  it("honors both IR duration and tap caps at an elevated context rate", async () => {
    const core = await createDspHarness({ sampleRate: 96_000 });
    core.exports.osfs_audio_set_tier(TIER.med);
    expect(core.stats().irMs).toBeCloseTo(1024 / 96, 8);
    core.exports.osfs_audio_set_tier(TIER.high);
    expect(core.stats().irMs).toBeCloseTo(2048 / 96, 8);
  });

  it.each(engines)("renders %s without a bank at both output rates and differs from Med", async engine => {
    for (const sampleRate of [44_100, 48_000]) {
      const high = await render(engine, { sampleRate });
      const med = await render(engine, { sampleRate, tier: TIER.med });
      expect(high.core.exports.osfs_audio_bands_ready()).toBe(0);
      expect(high.core.stats()).toMatchObject({ tier: TIER.high, activeGrains: 0, grainCap: 0, grainStarts: 0 });
      expect(rms(high.tail)).toBeGreaterThan(1e-5);
      expect(rms(difference(high.tail, med.tail))).toBeGreaterThan(1e-5);
      expect(high.output.left.every(Number.isFinite)).toBe(true);
      expect(peak(high.output.left)).toBeLessThanOrEqual(0.891252);
    }
  });

  it.each(engines)("is silent with %s stopped even when legacy synthetic bank storage is loaded", async engine => {
    const stopped = () => ({ n1Pct: 0, n2Pct: 0, thrustLbf: 0, fuelFlowPps: 0,
      combustion: false, running: false, cutoff: true });
    const sound = await render(engine, { at: stopped, configure: core => {
      const bank = Float32Array.from({ length: core.sampleRate }, (_, i) => 0.2 * Math.sin(2 * Math.PI * 220 * i / core.sampleRate));
      expect(core.loadBand(0, bank, 0.3, 1)).toBe(true);
    } });
    expect(sound.core.exports.osfs_audio_bands_ready()).toBe(1);
    expect(rms(sound.tail)).toBe(0);
    expect(sound.core.stats().activeGrains).toBe(0);
  });

  it.each([TIER.low, TIER.med, TIER.high])("noise cap zero removes actual broadband output at tier %i", async tier => {
    // Deliberately isolate non-rotating broadband inputs. This is a DSP
    // contract probe, not a physically possible steady engine state.
    const at = () => ({ n1Pct: 0, n2Pct: 0 });
    const enabled = await render(F135_DEFINITION, { tier, at });
    const disabled = await render(F135_DEFINITION, { tier, at, configure: core => {
      core.exports.osfs_audio_set_limits(tier, 12, 0, 0, 0, 0);
    } });
    expect(rms(enabled.tail)).toBeGreaterThan(1e-4);
    expect(rms(disabled.tail)).toBe(0);
  });

  it("uses downstream direction for F135 exhaust and stays neutral without an axis", async () => {
    const rear = await render(F135_DEFINITION);
    const front = await render(F135_DEFINITION, { at: () => ({ sourceAxis: [0, 0, -1] }) });
    expect(rms(rear.tail)).toBeGreaterThan(rms(front.tail) * 1.2);
    const unavailable = full & ~AVAILABILITY.SOURCE_AXIS;
    const neutralA = await render(F135_DEFINITION, { at: () => ({ availability: unavailable, sourceAxis: [0, 0, 1] }) });
    const neutralB = await render(F135_DEFINITION, { at: () => ({ availability: unavailable, sourceAxis: [0, 0, -1] }) });
    expect(neutralA.tail).toEqual(neutralB.tail);
  });

  it("makes the FJ33 fan stronger toward the inlet, with its own directional data", async () => {
    const at = () => ({ n1Pct: 60, n2Pct: 0, thrustLbf: 0, fuelFlowPps: 0, combustion: false });
    const configure = (core: DspHarness) => core.exports.osfs_audio_set_limits(TIER.high, 2, 0, 0, 0, 0);
    const rear = await render(FJ33_DEFINITION, { at, configure });
    const front = await render(FJ33_DEFINITION, { at: () => ({ ...at(), sourceAxis: [0, 0, -1] }), configure });
    expect(rms(front.tail)).toBeGreaterThan(rms(rear.tail) * 1.2);
  });

  it("has a dry F135 shock-shaped component but creates no speculative FJ33 shock", async () => {
    for (const engine of engines) {
      const all = await render(engine);
      const withoutShock = await render(engine, { configure: core => {
        core.exports.osfs_audio_set_limits(TIER.high, 12, 7, 0, 0, 40);
      } });
      const residual = rms(difference(all.tail, withoutShock.tail));
      if (engine === F135_DEFINITION) expect(residual).toBeGreaterThan(1e-4);
      else expect(residual).toBe(0);
    }
  });

  it("uses native augmentation, and missing augmentation returns the dry High sound", async () => {
    const dry = await render(F135_DEFINITION);
    const augmented = await render(F135_DEFINITION, { at: () => ({ augmentation: true }) });
    const missing = await render(F135_DEFINITION, { at: () => ({ augmentation: true, availability: full & ~AVAILABILITY.AUGMENTATION }) });
    expect(missing.tail).toEqual(dry.tail);
    expect(rms(difference(augmented.tail, dry.tail))).toBeGreaterThan(1e-4);
  });

  it("fades a live noise-cap edit before switching work, while valid telemetry continues", async () => {
    const at = () => ({ n1Pct: 0, n2Pct: 0 });
    const configure = (core: DspHarness) => core.exports.osfs_audio_set_gains(1, 0.1, 0, 0, 0);
    const baseline = await render(F135_DEFINITION, { at, configure });
    let changed = false;
    const edited = await render(F135_DEFINITION, { at, configure, onBlock: (core, time) => {
      if (time >= 0.8 && !changed) {
        changed = true;
        core.exports.osfs_audio_set_limits(TIER.high, 12, 0, 0, 0, 40);
      }
    } });
    const fs = edited.core.sampleRate;
    const start = Math.round(0.8 * fs), early = Math.round(0.802 * fs);
    expect(edited.output.left.subarray(0, start)).toEqual(baseline.output.left.subarray(0, start));
    // Immediate gating would be silent here; the fade retains the first
    // milliseconds and then reaches zero without valid telemetry cancelling it.
    expect(rms(edited.output.left, start, early)).toBeGreaterThan(rms(baseline.output.left, start, early) * 0.6);
    expect(rms(edited.output.left, Math.round(0.95 * fs))).toBeLessThan(1e-7);
    expect(edited.core.stats().noiseBands).toBe(0);
    expect(edited.output.left.every(Number.isFinite)).toBe(true);
  });

  it("changes Med to High and back with continuous output and a bounded fade", async () => {
    let switches = 0;
    const audio = await render(F135_DEFINITION, { tier: TIER.med, seconds: 1.5,
      at: () => ({ n1Pct: 30, n2Pct: 0, thrustLbf: 0, fuelFlowPps: 0, combustion: false }),
      configure: core => {
        core.exports.osfs_audio_set_limits(TIER.med, 2, 0, 0, 0, 20);
        core.exports.osfs_audio_set_limits(TIER.high, 2, 0, 0, 0, 40);
      },
      onBlock: (core, time) => {
        if (switches === 0 && time >= 0.8) { core.exports.osfs_audio_set_tier(TIER.high); switches++; }
        if (switches === 1 && time >= 1.1) { core.exports.osfs_audio_set_tier(TIER.med); switches++; }
      },
    });
    let largestStep = 0;
    for (let i = 1; i < audio.output.left.length; i++) largestStep = Math.max(largestStep, Math.abs(audio.output.left[i] - audio.output.left[i - 1]));
    expect(audio.output.left.every(Number.isFinite)).toBe(true);
    expect(largestStep).toBeLessThan(peak(audio.output.left) * 0.15);
    expect(audio.core.stats().tier).toBe(TIER.med);
    const fs = audio.core.sampleRate;
    expect(rms(audio.output.left, Math.round(0.824 * fs), Math.round(0.827 * fs)))
      .toBeLessThan(rms(audio.output.left, Math.round(0.9 * fs), Math.round(0.95 * fs)) * 0.1);
  });

  it("gives isolated dry shock noise a steeper low-side power rise than its high-side decay", async () => {
    const engine = { ...F135_DEFINITION, parameters: { ...parameters(F135_DEFINITION),
      fanMix: 0, fanToneGain: 0, coreToneGain: 0, jetGain: 0, combustorGain: 0, highFineMixGain: 0 } };
    const result = await render(engine, { seconds: 3, at: () => ({ sourceAxis: [1, 0, 0] }) });
    // Windowing keeps unrelated high-frequency energy from leaking into the
    // low-side slope estimate. Ratios test the trend, not a calibrated F135 PSD.
    const windowed = Float32Array.from(result.tail, (value, i) => value * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (result.tail.length - 1))));
    const low = bandPower(windowed, 48_000, 100, 200, 10);
    const middle = bandPower(windowed, 48_000, 200, 400, 20);
    const high = bandPower(windowed, 48_000, 3000, 5000, 100);
    const higher = bandPower(windowed, 48_000, 6000, 10000, 200);
    expect(middle).toBeGreaterThan(low * 5);
    expect(high).toBeGreaterThan(higher * 1.5);
  });

  it.each([44_100, 48_000])("retains recession pitch beyond finite delay storage (%i Hz)", async sampleRate => {
    const configure = (core: DspHarness) => core.exports.osfs_audio_set_limits(TIER.med, 2, 0, 0, 0, 0);
    const at = (time: number) => ({ n1Pct: 30, n2Pct: 0, thrustLbf: 0, fuelFlowPps: 0, combustion: false,
      source: [0, 0, 500 + 50 * time] as [number, number, number], sourceVelocity: [0, 0, 50] as [number, number, number] });
    const audio = await render(F135_DEFINITION, { sampleRate, tier: TIER.med, configure, at, seconds: 4 });
    const wanted = 540 * 343 / 393;
    // Both windows follow an exhausted-history handover. The old clamped tap
    // instead produced 540 Hz although its reported Doppler was correct.
    for (const from of [0.8, 3.2]) {
      const window = audio.output.left.subarray(Math.round(from * sampleRate), Math.round((from + 0.3) * sampleRate));
      const frequency = dominantFrequency(window, sampleRate, wanted - 10, 550, 1);
      expect(Math.abs(frequency - wanted)).toBeLessThan(2);
    }
    expect(audio.output.left.every(Number.isFinite)).toBe(true);
    expect(audio.core.stats().doppler).toBeCloseTo(343 / 393, 8);
  });

  it("keeps a bounded, continuous handover when radial motion reverses", async () => {
    const configure = (core: DspHarness) => core.exports.osfs_audio_set_limits(TIER.med, 2, 0, 0, 0, 0);
    const audio = await render(F135_DEFINITION, { tier: TIER.med, seconds: 3, configure, at: time => {
      const speed = time < 1.5 ? 150 : -150;
      return { n1Pct: 30, n2Pct: 0, thrustLbf: 0, fuelFlowPps: 0, combustion: false,
        source: [0, 0, 500 + 150 * (time < 1.5 ? time : 3 - time)], sourceVelocity: [0, 0, speed] };
    } });
    let largestStep = 0;
    for (let i = 1; i < audio.output.left.length; i++) largestStep = Math.max(largestStep, Math.abs(audio.output.left[i] - audio.output.left[i - 1]));
    expect(audio.output.left.every(Number.isFinite)).toBe(true);
    expect(largestStep).toBeLessThan(peak(audio.output.left) * 0.3);
  });
});
