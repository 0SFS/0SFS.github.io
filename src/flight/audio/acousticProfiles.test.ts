import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ACOUSTIC_PROFILE_FIELDS, acousticProfileValues, FJ33_ACOUSTICS, getAircraftAudioProfile } from "./aircraftAudioProfiles";
import { AVAILABILITY, type AudioSnapshotInit } from "./audioSnapshot";
import { bandPower, createDspHarness, difference, peak, rms, TIER, type DspHarness } from "./dspHarness";
import { renderReference } from "../../../scripts/validation/audio/check-engine-profile-reference.mjs";

const full = Object.values(AVAILABILITY).reduce((bits, bit) => bits | bit, 0);
const f135 = getAircraftAudioProfile("f-35b")!;

async function render(profile: typeof f135 | undefined, overrides: Partial<AudioSnapshotInit> = {},
  configure?: (core: DspHarness) => void, onBlock?: (core: DspHarness, time: number) => void) {
  const core = await createDspHarness();
  core.setProfile(profile);
  core.exports.osfs_audio_set_tier(TIER.low);
  core.exports.osfs_audio_set_gains(1, 1, 0, 0, 0);
  configure?.(core);
  core.anchor(1, 0);
  let nextPublish = 0;
  const output = core.renderSeconds(0.8, frame => {
    const time = frame / core.sampleRate;
    onBlock?.(core, time);
    while (nextPublish <= time + 0.1) {
      core.pushSnapshot({ sequence: 1, epoch: 1, simTimeS: nextPublish, availability: full,
        n1Pct: 95, n2Pct: 99, thrustLbf: profile ? 28_000 : 1846,
        fuelFlowPps: profile ? 8 : 0.25, combustion: true, running: true,
        source: [0, 0, -10], exterior: 1, ...overrides });
      nextPublish += 1 / 60;
    }
  });
  return { tail: output.left.subarray(24_000), output, core };
}

describe("shared engine acoustic setup (actual shipped WASM)", () => {
  it("matches the native setup field order and retains exact FJ33 defaults", async () => {
    const header = readFileSync("src/flight/audio/dsp/acoustic_profile.h", "utf8");
    const block = header.split("// ACOUSTIC_PROFILE_FIELDS\n")[1].split("// END ACOUSTIC_PROFILE_FIELDS")[0];
    const fields = [...block.matchAll(/\bkProfile([A-Z]\w*)/g)].map(match => match[1]).filter(name => name !== "Size");
    expect(fields.map(name => name[0].toLowerCase() + name.slice(1))).toEqual(ACOUSTIC_PROFILE_FIELDS);
    const core = await createDspHarness();
    const defaults = new Float64Array(core.exports.memory.buffer, core.exports.osfs_audio_profile_ptr(), core.exports.osfs_audio_profile_size());
    expect([...defaults]).toEqual(acousticProfileValues());
    expect(acousticProfileValues(getAircraftAudioProfile("cirrus-vision-jet"))).toEqual(acousticProfileValues());
    expect(FJ33_ACOUSTICS.fanMix).toBe(3.3 / (1 + 3.3));
  });

  it("refuses invalid setup atomically without changing the active voice", async () => {
    const correct = await render(f135);
    const rejected = await render(f135, {}, core => {
      const values = new Float64Array(core.exports.memory.buffer, core.exports.osfs_audio_profile_ptr(), ACOUSTIC_PROFILE_FIELDS.length);
      values.set(acousticProfileValues(f135));
      values[ACOUSTIC_PROFILE_FIELDS.indexOf("thrustReferenceLbf")] = 0;
      expect(core.exports.osfs_audio_commit_profile()).toBe(0);
    });
    expect(rejected.output).toEqual(correct.output);
    expect(rejected.core.stats().nonFinite).toBe(0);
  });

  it("makes F135 exhaust dominant with more broadband power than the SF50 reference", async () => {
    const reference = await render(undefined);
    const fighter = await render(f135);
    expect(rms(fighter.tail)).toBeGreaterThan(rms(reference.tail) * 2);
    expect(bandPower(fighter.tail, 48_000, 100, 1200, 50)).toBeGreaterThan(
      bandPower(reference.tail, 48_000, 100, 1200, 50) * 5);
    expect(peak(fighter.output.left)).toBeLessThanOrEqual(0.891252);
  });

  it("morphs the existing exhaust on native augmentation, with above-dry headroom and no added sources", async () => {
    const dry = await render(f135);
    const burning = { augmentation: true, afterburnerBurnedFuelFlowKgSec: 8 * 0.45359237 };
    const augmented = await render(f135, burning);
    const headroom = await render(f135, { ...burning, thrustLbf: 40_000 });
    const unavailable = await render(f135, { ...burning, availability: full & ~AVAILABILITY.AUGMENTATION });
    expect(unavailable.tail).toEqual(dry.tail);
    const added = difference(augmented.tail, dry.tail);
    expect(rms(added)).toBeGreaterThan(rms(dry.tail) * 0.5);
    expect(bandPower(added, 48_000, 100, 3000, 100)).toBeGreaterThan(1e-7);
    expect(rms(headroom.tail)).toBeGreaterThan(rms(augmented.tail) * 1.1);
    expect(headroom.output.left.every(Number.isFinite)).toBe(true);
    expect(peak(headroom.output.left)).toBeLessThanOrEqual(0.891252);
    expect(augmented.core.exports.memory.buffer.byteLength).toBe(dry.core.exports.memory.buffer.byteLength);
    expect(augmented.core.stats()).toMatchObject({ partials: 4, noiseBands: 5, activeGrains: 0 });
  });

  it("retains SF50 Low/Med golden output after the corrected sub-idle startup settles", async () => {
    const reference = JSON.parse(readFileSync("validation/evidence/audio/startup-envelope-2026-10-05/sf50-reference.json", "utf8"));
    const legacy = JSON.parse(readFileSync("validation/evidence/audio/f135/sf50-reference.json", "utf8"));
    for (const configuration of reference.cases) {
      const current = await renderReference("src/flight/audio/dsp/audio-dsp.wasm", "src/flight/audio/dsp/snapshot.h", configuration);
      expect(legacy.cases).toContainEqual(expect.objectContaining({ sampleRate: configuration.sampleRate,
        tier: configuration.tier, exterior: configuration.exterior, referenceOutputSha256: configuration.beforeOutputSha256 }));
      expect(current.outputSha256).toBe(configuration.afterOutputSha256);
      // The old fixture's initial smoother passes through sub-idle speed.
      // That transient intentionally changed; its settled output stays bit
      // exact against the old artifact, including both channels and views.
      const settled = Buffer.concat([current.left, current.right].map(channel =>
        Buffer.from(channel.slice(Math.round(0.4 * configuration.sampleRate)).buffer)));
      expect(createHash("sha256").update(settled).digest("hex")).toBe(configuration.beforeSettledSha256);
    }
  });

  it("controls added augmentation amplitude and spectral colour at 0/50/100 percent", async () => {
    const overrides = { augmentation: true, afterburnerBurnedFuelFlowKgSec: 8 * 0.45359237,
      thrustLbf: 40_000, source: [0, 0, -100] as [number, number, number] };
    const zero = await render(f135, overrides, core => core.exports.osfs_audio_set_afterburner_volume(0));
    const half = await render(f135, overrides, core => core.exports.osfs_audio_set_afterburner_volume(0.5));
    const fullVolume = await render(f135, overrides, core => core.exports.osfs_audio_set_afterburner_volume(1));
    const unchangedDefault = await render(f135, overrides);
    expect(fullVolume.output).toEqual(unchangedDefault.output);
    const halfAdded = difference(half.tail, zero.tail);
    const fullAdded = difference(fullVolume.tail, zero.tail);
    expect(rms(fullAdded)).toBeGreaterThan(1e-5);
    expect(rms(halfAdded)).toBeGreaterThan(0);
    expect(rms(halfAdded)).toBeLessThan(rms(fullAdded));
    expect(rms(fullVolume.tail)).toBeGreaterThan(rms(half.tail));
    expect(rms(half.tail)).toBeGreaterThan(rms(zero.tail));
    const dry = await render(f135, { ...overrides, augmentation: false });
    expect(rms(zero.tail)).toBeGreaterThan(0);
    // Hold physical telemetry fixed: zero now removes deliberate AB colour.
    // Different native thrust/fuel/shaft inputs can still change engine sound.
    for (const channel of ["left", "right"] as const) {
      expect(zero.output[channel].findIndex((sample, index) => sample !== dry.output[channel][index])).toBe(-1);
    }
    expect(zero.core.exports.memory.buffer.byteLength).toBe(fullVolume.core.exports.memory.buffer.byteLength);
  });

  it("leaves every dry-engine sample unchanged by the afterburner-only control", async () => {
    const reference = await render(f135);
    for (const volume of [0, 0.5, 1]) {
      const changed = await render(f135, {}, core => core.exports.osfs_audio_set_afterburner_volume(volume));
      expect(changed.output).toEqual(reference.output);
    }
  });

  it("clamps afterburner gain and sanitizes non-finite values", async () => {
    const overrides = { augmentation: true, afterburnerBurnedFuelFlowKgSec: 8 * 0.45359237,
      source: [0, 0, -100] as [number, number, number] };
    const zero = await render(f135, overrides, core => core.exports.osfs_audio_set_afterburner_volume(0));
    const one = await render(f135, overrides, core => core.exports.osfs_audio_set_afterburner_volume(1));
    for (const volume of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const sanitized = await render(f135, overrides, core => core.exports.osfs_audio_set_afterburner_volume(volume));
      expect(sanitized.output).toEqual(zero.output);
      expect(sanitized.core.stats().nonFinite).toBe(0);
    }
    const capped = await render(f135, overrides, core => core.exports.osfs_audio_set_afterburner_volume(2));
    expect(capped.output).toEqual(one.output);
  });

  it("smooths a live afterburner gain change without resetting the active voice", async () => {
    const overrides = { augmentation: true, afterburnerBurnedFuelFlowKgSec: 8 * 0.45359237,
      thrustLbf: 40_000, source: [0, 0, -100] as [number, number, number] };
    const reference = await render(f135, overrides);
    let applied = false;
    const sameGain = await render(f135, overrides, undefined, (core, time) => {
      if (!applied && time >= 0.4) { applied = true; core.exports.osfs_audio_set_afterburner_volume(1); }
    });
    expect(sameGain.output).toEqual(reference.output);
    let changeFrame = 0;
    const changed = await render(f135, overrides, undefined, (core, time) => {
      if (changeFrame === 0 && time >= 0.4) {
        changeFrame = core.frame;
        core.exports.osfs_audio_set_afterburner_volume(0);
      }
    });
    const zero = await render(f135, overrides, core => core.exports.osfs_audio_set_afterburner_volume(0));
    expect(changed.output.left.subarray(0, changeFrame)).toEqual(reference.output.left.subarray(0, changeFrame));
    const early = changed.output.left.subarray(changeFrame, changeFrame + 32);
    const earlyReference = reference.output.left.subarray(changeFrame, changeFrame + 32);
    const earlyZero = zero.output.left.subarray(changeFrame, changeFrame + 32);
    expect(rms(difference(early, earlyReference)) / rms(difference(earlyZero, earlyReference))).toBeLessThan(0.1);
    expect(rms(difference(changed.output.left.subarray(34_000), zero.output.left.subarray(34_000)))).toBeLessThan(1e-9);
    expect(changed.core.stats().nonFinite).toBe(0);
  });

  it("permits engine-only gain above unity with an eightfold ceiling and the existing limiter", async () => {
    const cockpit = { exterior: 0 };
    const reference = await render(f135, cockpit);
    const boosted = await render(f135, cockpit, core => core.exports.osfs_audio_set_gains(1, 4, 0, 0, 0));
    expect(rms(boosted.tail)).toBeGreaterThan(rms(reference.tail) * 1.1);
    const ceiling = await render(f135, cockpit, core => core.exports.osfs_audio_set_gains(1, 8, 0, 0, 0));
    const capped = await render(f135, cockpit, core => core.exports.osfs_audio_set_gains(1, 99, 0, 0, 0));
    expect(capped.output).toEqual(ceiling.output);
    expect(peak(ceiling.output.left)).toBeLessThanOrEqual(0.891252);
    expect(ceiling.output.left.every(Number.isFinite)).toBe(true);
    expect(ceiling.core.stats().nonFinite).toBe(0);
    const dryMutedAb = await render(f135, cockpit, core => {
      core.exports.osfs_audio_set_gains(1, 8, 0, 0, 0);
      core.exports.osfs_audio_set_afterburner_volume(0);
    });
    expect(dryMutedAb.output).toEqual(ceiling.output);
  });

  it("scales an unsaturated source by the master control at 1/2/8 times unity", async () => {
    const quietSource = { source: [0, 0, -1000] as [number, number, number] };
    const reference = await render(undefined, quietSource);
    expect(rms(reference.tail)).toBeGreaterThan(0);
    for (const master of [2, 8]) {
      const boosted = await render(undefined, quietSource, core => core.exports.osfs_audio_set_gains(master, 1, 0, 0, 0));
      // Below the dynamics threshold, this checks the requested gain itself.
      expect(peak(boosted.output.left)).toBeLessThan(0.25);
      expect(rms(boosted.tail) / rms(reference.tail)).toBeCloseTo(master, 6);
      expect(boosted.core.stats().nonFinite).toBe(0);
    }
  });

  it("caps master gain at eight and retains finite limited output for a loud augmented source", async () => {
    const loudSource = { augmentation: true, afterburnerBurnedFuelFlowKgSec: 8 * 0.45359237,
      thrustLbf: 40_000, source: [0, 0, -1] as [number, number, number] };
    const ceiling = await render(f135, loudSource, core => core.exports.osfs_audio_set_gains(8, 1, 0, 0, 0));
    const capped = await render(f135, loudSource, core => core.exports.osfs_audio_set_gains(99, 1, 0, 0, 0));
    expect(capped.output).toEqual(ceiling.output);
    expect(peak(ceiling.output.left)).toBeGreaterThan(0.5);
    expect(peak(ceiling.output.left)).toBeLessThanOrEqual(0.891252);
    expect(ceiling.output.left.every(Number.isFinite)).toBe(true);
    expect(ceiling.core.stats().nonFinite).toBe(0);
  });
});
