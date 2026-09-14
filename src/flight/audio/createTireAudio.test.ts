import { describe, expect, it, vi } from "vitest";
import type { FlightAudioHandle } from "./createFlightAudio";
import { createTireAudio, tireAudioParameters } from "./createTireAudio";
import { createDspHarness, rms, TIER } from "./dspHarness";

function fakeAudio(tireMessage: string | null = null) {
  return {
    setTireCue: vi.fn(),
    setHeld: vi.fn(),
    setTireHeld: vi.fn(),
    setTireSlipWatts: vi.fn(),
    getStatus: vi.fn(() => ({ tireMessage })),
  };
}
const asHandle = (fake: ReturnType<typeof fakeAudio>): FlightAudioHandle => fake as unknown as FlightAudioHandle;

describe("tire cue curve", () => {
  it("has no cue at pure rolling, bounds loud impacts, and rejects invalid power", () => {
    for (const power of [0, 2, -1, NaN, Infinity, -Infinity]) {
      expect(tireAudioParameters(power).noiseGain).toBe(0);
      expect(tireAudioParameters(power).squealGain).toBe(0);
    }
    const soft = tireAudioParameters(100);
    const loud = tireAudioParameters(15_000);
    expect(soft.noiseGain).toBeGreaterThan(0);
    expect(soft.noiseGain).toBeLessThan(loud.noiseGain);
    expect(tireAudioParameters(Number.MAX_VALUE)).toEqual(loud);
    expect(loud.noiseGain + loud.squealGain).toBeLessThan(0.1);
    expect(loud.filterFrequencyHz).toBeLessThan(3_000);
  });

  it("is what the compiled core plays: silent at the 2 W floor, rising with slip, saturating", async () => {
    const level = async (watts: number): Promise<number> => {
      const harness = await createDspHarness();
      harness.exports.osfs_audio_set_tier(TIER.low);
      harness.exports.osfs_audio_set_gains(1, 0, 1, 0, 0);
      harness.exports.osfs_audio_set_tire(watts);
      return rms(harness.renderSeconds(0.4).left, Math.round(48_000 * 0.2));
    };
    expect(await level(2)).toBe(0);
    const soft = await level(100);
    const loud = await level(15_000);
    expect(soft).toBeGreaterThan(0);
    expect(loud).toBeGreaterThan(soft * 4);
    // Past saturation the curve is flat, so the core must be too.
    expect(await level(1e9)).toBeCloseTo(loud, 6);
  });
});

describe("tire cue on the shared sound runtime", () => {
  it("forwards enable and volume together, clamped", () => {
    const audio = fakeAudio();
    const tire = createTireAudio({ audio: asHandle(audio) });
    tire.setVolume(0.25);
    expect(audio.setTireCue).toHaveBeenLastCalledWith(false, 0.25);
    tire.setEnabled(true);
    expect(audio.setTireCue).toHaveBeenLastCalledWith(true, 0.25);
    tire.setVolume(7);
    expect(audio.setTireCue).toHaveBeenLastCalledWith(true, 1);
    tire.setVolume(Number.NaN);
    expect(audio.setTireCue).toHaveBeenLastCalledWith(true, 0);
  });

  it("sends slip power only while enabled and not paused, and holds through the runtime", () => {
    const audio = fakeAudio();
    const tire = createTireAudio({ audio: asHandle(audio) });
    tire.update(500);
    expect(audio.setTireSlipWatts).not.toHaveBeenCalled();
    tire.setEnabled(true);
    tire.update(500);
    expect(audio.setTireSlipWatts).toHaveBeenLastCalledWith(500);
    tire.setPaused(true);
    expect(audio.setTireHeld).toHaveBeenLastCalledWith(true);
    tire.update(900);
    expect(audio.setTireSlipWatts).toHaveBeenCalledTimes(1);
    tire.setPaused(true);
    expect(audio.setTireHeld).toHaveBeenCalledTimes(1);
    tire.setPaused(false);
    expect(audio.setTireHeld).toHaveBeenLastCalledWith(false);
    expect(audio.setHeld).not.toHaveBeenCalled();
  });

  it("reports the runtime's tire line and goes inert after dispose", () => {
    const audio = fakeAudio("Tire sound starts after your next click or key press.");
    const tire = createTireAudio({ audio: asHandle(audio) });
    expect(tire.getStatus()).toMatch(/next click/);
    tire.setEnabled(true);
    tire.dispose();
    expect(audio.setTireCue).toHaveBeenLastCalledWith(false, 1);
    tire.dispose();
    tire.setEnabled(true);
    tire.update(100);
    expect(audio.setTireCue).toHaveBeenCalledTimes(2);
    expect(audio.setTireSlipWatts).not.toHaveBeenCalled();
    expect(tire.getStatus()).toBeNull();
  });
});
