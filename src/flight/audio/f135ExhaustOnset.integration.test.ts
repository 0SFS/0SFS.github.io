import { beforeAll, describe, expect, it } from "vitest";
import { captureF135Onset, evaluateF135OnsetSource, renderF135OnsetAudio, type F135OnsetTrace } from "./f135ExhaustOnsetHarness";
import { TIER } from "./dspHarness";

describe("F135 native combustion, optical source and shipped audio onset (CPU; no visibility qualification)", () => {
  let traces: F135OnsetTrace[];
  beforeAll(async () => {
    traces = [await captureF135Onset("cold-first-running"), await captureF135Onset("cold-then-hot-dry")];
  }, 30_000);

  it("emits internal reaction light at the first positive native burn in cold and warm engines", () => {
    // Qualify the dry counterfactual against the real state before the command.
    for (const trace of traces) expect(trace.before.referenceDryThrustLbf).toBe(trace.before.reading.thrustLbf);
    for (const trace of traces) {
      const previous = trace.observations[Math.round(trace.firstBurned.timeSeconds * 120) - 1];
      expect(previous.reading.afterburnerBurnedFuelFlowKgSec).toBe(0);
      expect(evaluateF135OnsetSource(previous).chPowerW).toBe(0);
      const source = evaluateF135OnsetSource(trace.firstBurned);
      expect(source.valid).toBe(true);
      expect(source.reactionDomainResolved).toBe(true);
      expect(source.chPowerW).toBeGreaterThan(0);
      expect(source.field!.chPowerDensityWPerM3.some(value => value > 0)).toBe(true);
      expect(source.totalSourcePowerUpperBoundW).toBeLessThanOrEqual(source.allowedPowerW);
      // Cold solids are observations, never optical ignition inputs. This
      // nonzero source assertion cannot establish visible pixels or perception.
      expect(trace.firstBurned.linerTemperatureKelvin).toBeLessThan(trace.firstBurned.opticalInput.temperatureKelvin!);
      const exteriorChW = source.field!.exteriorVolumeWeightsM3.reduce((sum, weight, i) =>
        sum + weight * source.field!.chPowerDensityWPerM3[i], 0);
      expect(exteriorChW).toBe(0);
    }
    expect(traces[0].firstBurned.linerTemperatureKelvin).toBeLessThan(traces[1].firstBurned.linerTemperatureKelvin);
  });

  it.each([TIER.low, TIER.med, TIER.high])("does not add deliberate AB sound before burning in tier %s, while diagnosing the independent early thrust cue", async tier => {
    for (const trace of traces) {
      const audio = await renderF135OnsetAudio(trace, tier);
      expect(audio.preBurnDeliberateDifferenceRms).toBe(0);
      expect(audio.firstDeliberateDifferenceSeconds).not.toBeNull();
      expect(audio.firstDeliberateDifferenceSeconds!).toBeGreaterThanOrEqual(trace.firstBurned.timeSeconds - 1 / 120);
      // 33.3 ms transport lag, 60 Hz sampling, 10 ms dezippering and short
      // source propagation may delay source differences; no visual timer.
      expect(audio.firstDeliberateDifferenceSeconds!).toBeLessThan(trace.firstBurned.timeSeconds + .1);
      expect(audio.postBurnDeliberateDifferenceRms).toBeGreaterThan(0);
      expect(audio.stats.every(stats => stats.nonFinite === 0 && stats.staleFades === 0)).toBe(true);
      for (const stats of audio.stats) {
        expect(stats.peak).toBeLessThanOrEqual(.891252);
        expect(stats).toMatchObject({ partials: tier === TIER.low ? 4 : 12,
          noiseBands: tier === TIER.low ? 5 : tier === TIER.med ? 6 : 8,
          activeGrains: 0, grainCap: 0, irMs: tier === TIER.low ? 0 : tier === TIER.med ? 20 : 40,
          snapshotsDropped: 0, resyncs: 0 });
      }
      expect(audio.memoryBytes.every(bytes => bytes.beforeRender === bytes.afterRender)).toBe(true);
      // The reheat request changes nothing the listener hears until the engine selects reheat.
      if (audio.firstThrustDifferenceSeconds !== null)
        expect(audio.firstThrustDifferenceSeconds).toBeGreaterThanOrEqual(trace.firstSelected.timeSeconds - 1 / 120);
    }
  }, 30_000);

  it("does not publish reheat-only excess thrust while actually burned AB fuel is zero", () => {
    // Compare with the same engine at the same time without a reheat request,
    // never with an old throttle state or a delay. The empirical engine
    // installed its wet table at selection: 4.1333 s of wet thrust with no AB
    // fuel burned from a cold start (docs/validation/f135-ab-onset.md).
    for (const trace of traces) {
      let selectedWithoutBurn = 0;
      for (const row of trace.observations) {
        if (row.reading.afterburnerBurnedFuelFlowKgSec !== 0) continue;
        if (row.abSelected) selectedWithoutBurn++;
        expect({ trace: trace.name, time: row.timeSeconds, thrust: row.reading.thrustLbf,
          withinDry: row.reading.thrustLbf <= row.referenceDryThrustLbf + 1 }).toMatchObject({ withinDry: true });
      }
      // The window exists (ignition delay and light-around), so the invariant is exercised.
      expect(selectedWithoutBurn).toBeGreaterThan(0);
    }
  });

  it("releases reheat heat only from burned reheat fuel, and closes every step's energy ledger", () => {
    for (const trace of traces) for (const row of trace.observations) {
      expect(row.abHeatReleaseW > 0).toBe(row.reading.afterburnerBurnedFuelFlowKgSec! > 0);
      expect(row.reading.augmentation).toBe(row.reading.afterburnerBurnedFuelFlowKgSec! > 0);
      expect(row.energyRelative).toBeLessThan(1e-5);
    }
  });
});
