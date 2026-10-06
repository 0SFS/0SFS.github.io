import { describe, expect, it } from "vitest";
import { engineReactionTemperaturePdf, sampleEngineReactionParcel } from "./engineReactionEmission";
import { evaluateEngineGasOptics, sampleEngineGasField } from "./engineGasOptics";
import { f135ExhaustOpticalData as profile } from "./generated/f135ExhaustOpticalData";

describe("conditional reacting-parcel optical source", () => {
  it("preserves mean enthalpy while mixing volume-weighted hot/cold radiation", () => {
    for (const mean of [1001, 1200, 2000, 2300]) for (const mix of [0, 0.2, 1]) {
      const p = engineReactionTemperaturePdf(mean, 1000, 2350, mix);
      expect(p.hotMassFraction * p.hotKelvin + (1 - p.hotMassFraction) * p.coldKelvin).toBeCloseTo(mean, 9);
      expect(p.hotVolumeFraction).toBeGreaterThanOrEqual(0);
      expect(p.hotVolumeFraction).toBeLessThanOrEqual(1);
      expect(p.coldKelvin).toBeGreaterThanOrEqual(1000 - 1e-8);
      if (mix > 0) expect(p.hotVolumeFraction).toBeGreaterThan(p.hotMassFraction);
    }
    expect(engineReactionTemperaturePdf(2500, 1000, 2350, 1).hotVolumeFraction).toBe(0);
  });

  it("reproduces the retained kinetic parcel and bounds table interpolation", () => {
    const data = profile.gasEmission.reactionParcel;
    const exact = sampleEngineReactionParcel(data, 1000, 3 * 101325)!;
    expect(exact.productTemperatureKelvin).toBeCloseTo(2347.05, 1);
    expect(exact.chBandEnergyJoulesPerKgFuel).toBeCloseTo(10.8044, 3);
    expect(exact.inputWasClamped).toBe(false);
    const mixed = sampleEngineReactionParcel(data, 900, Math.sqrt(3) * 101325)!;
    const corners = data.cases.filter(r => [800, 1000].includes(r.reactantTemperatureKelvin) && [101325, 303975].includes(r.pressurePascal));
    expect(mixed.chBandEnergyJoulesPerKgFuel).toBeCloseTo(Math.exp(corners.reduce((s, r) => s + Math.log(r.chBandEnergyJoulesPerKgFuel), 0) / 4), 10);
    expect(sampleEngineReactionParcel(data, 500, 101325)?.inputWasClamped).toBe(true);
    expect(sampleEngineReactionParcel(data, NaN, 101325)).toBeUndefined();
  });

  const input = { temperatureKelvin: 1034.45, upstreamGasTemperatureKelvin: 1003.13,
    ambientTemperatureKelvin: 288.15, ambientPressurePascal: 101325, augmentation: true,
    fuelFlowKgPerSecond: 2, afterburnerBurnedFuelFlowKgPerSecond: 0.0924782,
    radiusMeters: 0.43, lengthMeters: 6,
    flowDomain: { axialDistanceRangeMeters: [-2.2, 6] as const, sections: [
      { distanceMeters: -2.2, radiusMeters: 0.5, innerRadiusMeters: 0.25 },
      { distanceMeters: 0, radiusMeters: 0.43 }, { distanceMeters: 6, radiusMeters: 0.85 }] } };

  it("responds to burned fuel immediately, confines chemical light internally and preserves source energy", () => {
    const r = evaluateEngineGasOptics(profile, input), f = r.field!;
    const old = evaluateEngineGasOptics(profile, { ...input, upstreamGasTemperatureKelvin: undefined });
    expect(r.chemistryStatus).toBe("surrogate-parcel");
    expect(r.chPowerW).toBeGreaterThan(0);
    expect(r.c2PowerW).toBe(0);
    expect(r.isotropicIntensityRgbCd[0]).toBeGreaterThan(old.isotropicIntensityRgbCd[0] * 100);
    expect(r.totalSourcePowerUpperBoundW).toBeLessThanOrEqual(r.allowedPowerW);
    const watts = f.chPowerDensityWPerM3.reduce((sum, v, i) => sum + v * f.volumeWeightsM3[i], 0);
    expect(watts).toBeCloseTo(r.chPowerW, 10);
    // Vary only burned fuel: this changes chemical light without a timer or a temperature threshold.
    const half = evaluateEngineGasOptics(profile, { ...input, afterburnerBurnedFuelFlowKgPerSecond: input.afterburnerBurnedFuelFlowKgPerSecond / 2 });
    expect(half.chPowerW).toBeCloseTo(r.chPowerW / 2, 10);
    const off = evaluateEngineGasOptics(profile, { ...input, afterburnerBurnedFuelFlowKgPerSecond: 0 });
    expect(off.chPowerW).toBe(0);
    expect(evaluateEngineGasOptics(profile, { ...input, augmentation: false }).field!.rgba).toEqual(f.rgba);
    for (const u of [0.3, 0.5, 1]) expect(sampleEngineGasField(r, u, 0.6).chPowerDensityWPerM3).toBe(0);
    // An exterior-only installation has no declared augmentor: it cannot relocate these photons outside.
    expect(evaluateEngineGasOptics(profile, { ...input, flowDomain: undefined }).chPowerW).toBe(0);
    const coarse = evaluateEngineGasOptics(profile, { ...input, axialSamples: 8 });
    expect(coarse.chPowerW).toBeCloseTo(r.chPowerW, 9);
    expect(coarse.reactionDomainResolved).toBe(true);
    for (let u = 2.2 / 8.2; u <= 1; u += 0.025)
      expect(sampleEngineGasField(coarse, u, 0.6).chPowerDensityWPerM3).toBe(0);
    const short = evaluateEngineGasOptics(profile, { ...input, axialSamples: 8,
      flowDomain: { axialDistanceRangeMeters: [-0.2, 6], sections: [
        { distanceMeters: -0.2, radiusMeters: 0.5 }, { distanceMeters: 6, radiusMeters: 0.85 }] } });
    expect(short.reactionDomainResolved).toBe(false);
    expect(short.chPowerW).toBe(0);
  });

  it("does not invent a rear primary-combustor flash, hot metal or missing-state chemistry", () => {
    const cold = evaluateEngineGasOptics(profile, { ...input, temperatureKelvin: 292,
      upstreamGasTemperatureKelvin: 292, afterburnerBurnedFuelFlowKgPerSecond: 0, augmentation: false });
    expect(cold.chPowerW).toBe(0);
    expect(Math.max(...cold.sourceRgbCdPerM3)).toBeLessThan(1e-15);
    const missing = evaluateEngineGasOptics(profile, { ...input, ambientPressurePascal: undefined });
    expect(missing.chPowerW).toBe(0);
  });
});
