/** 0sfs owns this unresolved optical-source closure; it does not evolve engine state. */
export interface EngineReactionParcelData {
  readonly model: "ndodecane-ch-a-parcel-v1";
  readonly pressureToAmbientRatio: number;
  readonly reactionLengthMeters: number;
  readonly varianceMixingLengthMeters: number;
  /** Integrated CH(A-X) observer response, XYZ lm/W, baked from the declared band. */
  readonly chXyzLumensPerWatt: readonly [number, number, number];
  readonly cases: readonly {
    readonly reactantTemperatureKelvin: number;
    readonly pressurePascal: number;
    readonly productTemperatureKelvin: number;
    readonly chBandEnergyJoulesPerKgFuel: number;
  }[];
}

export interface EngineReactionParcel {
  readonly productTemperatureKelvin: number;
  readonly chBandEnergyJoulesPerKgFuel: number;
  readonly inputWasClamped: boolean;
}

/** The small rectangular chemistry table is evaluated once per changed physical state. */
export function sampleEngineReactionParcel(data: EngineReactionParcelData, kelvin: number,
  pressurePascal: number): EngineReactionParcel | undefined {
  if (!Number.isFinite(kelvin) || kelvin <= 0 || !Number.isFinite(pressurePascal) || pressurePascal <= 0) return undefined;
  const temperatures = [...new Set(data.cases.map(row => row.reactantTemperatureKelvin))].sort((a, b) => a - b);
  const pressures = [...new Set(data.cases.map(row => row.pressurePascal))].sort((a, b) => a - b);
  if (!temperatures.length || !pressures.length) return undefined;
  const bounds = (axis: number[], v: number, logarithmic = false) => {
    const value = Math.max(axis[0], Math.min(axis.at(-1)!, v));
    const hi = axis.findIndex(x => x >= value), lo = Math.max(0, hi - 1);
    const coordinate = (x: number) => logarithmic ? Math.log(x) : x;
    return { lo: axis[lo], hi: axis[hi], f: axis[hi] > axis[lo]
      ? (coordinate(value) - coordinate(axis[lo])) / (coordinate(axis[hi]) - coordinate(axis[lo])) : 0, clamped: value !== v };
  };
  const t = bounds(temperatures, kelvin), p = bounds(pressures, pressurePascal, true);
  let productTemperatureKelvin = 0, chBandEnergyJoulesPerKgFuel = 0, logYield = 0, positiveYield = true;
  for (const [temperature, wt] of [[t.lo, 1 - t.f], [t.hi, t.f]]) {
    for (const [pressure, wp] of [[p.lo, 1 - p.f], [p.hi, p.f]]) {
      if (wt * wp === 0) continue;
      const row = data.cases.find(r => r.reactantTemperatureKelvin === temperature && r.pressurePascal === pressure);
      if (!row || !Number.isFinite(row.productTemperatureKelvin) || row.productTemperatureKelvin <= 0
        || !Number.isFinite(row.chBandEnergyJoulesPerKgFuel) || row.chBandEnergyJoulesPerKgFuel < 0) return undefined;
      productTemperatureKelvin += wt * wp * row.productTemperatureKelvin;
      chBandEnergyJoulesPerKgFuel += wt * wp * row.chBandEnergyJoulesPerKgFuel;
      if (row.chBandEnergyJoulesPerKgFuel > 0) logYield += wt * wp * Math.log(row.chBandEnergyJoulesPerKgFuel);
      else positiveYield = false;
    }
  }
  return { productTemperatureKelvin, chBandEnergyJoulesPerKgFuel: positiveYield ? Math.exp(logYield) : chBandEnergyJoulesPerKgFuel,
    inputWasClamped: t.clamped || p.clamped };
}

/**
 * Two-point temperature PDF, with the SAME constant-cp mean enthalpy as the
 * native bath. At equal pressure and molecular weight, volume is proportional
 * to mass * T. Evaluate B(T) in each state, never B(mean T) for the whole flame.
 * This is an unresolved-mixture hypothesis, not a second heat integrator.
 */
export function engineReactionTemperaturePdf(meanKelvin: number, coldKelvin: number,
  hotKelvin: number, unmixedFraction: number) {
  if (hotKelvin <= meanKelvin || meanKelvin <= coldKelvin || unmixedFraction <= 0)
    return { coldKelvin: meanKelvin, hotKelvin: meanKelvin, hotMassFraction: 0, hotVolumeFraction: 0 };
  const hotMassFraction = (meanKelvin - coldKelvin) / (hotKelvin - coldKelvin)
    * Math.max(0, Math.min(1, unmixedFraction));
  const resolvedColdKelvin = (meanKelvin - hotMassFraction * hotKelvin) / (1 - hotMassFraction);
  const hotVolumeFraction = hotMassFraction * hotKelvin / meanKelvin;
  return { coldKelvin: resolvedColdKelvin, hotKelvin, hotMassFraction, hotVolumeFraction };
}
