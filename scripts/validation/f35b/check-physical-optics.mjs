import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { newOutputDirectory } from "../../outputDirectory.mjs";
import { bakeDimensionalGas, bakeSpatialEmission, parseObserverCsv, planckRadiance } from "../../exhaustOptics/bake.mjs";
import { referenceRadiance, referencePhotometricRgb, luminance } from "../../exhaustOptics/reference.mjs";
import { evaluateEngineGasOptics, integrateGasSegment, interpolateAbsoluteEmission } from "../../../src/flight/aircraft/engineGasOptics.ts";

// 0sfs owns this aircraft-specific physical optical diagnostic. No rendering,
// camera or engine dynamics are simulated by these independent numeric checks.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = name => readFileSync(path.join(root, name));
const sourcePath = "scripts/exhaustOptics/f135-visible-approximation.json";
const currentPath = "src/flight/aircraft/generated/f135-exhaust-lut.manifest.json";
const baselinePath = "validation/evidence/aircraft/f35b/engine-rebuild-2026-10-06/implementation/optics/f135-exhaust-lut.manifest.json";
const parameters = JSON.parse(read(sourcePath));
const profile = JSON.parse(read(currentPath)).profile;
const baseline = JSON.parse(read(baselinePath));
const observer = parseObserverCsv(read("scripts/exhaustOptics/data/CIE_xyz_1931_2deg.csv"));
const spatial = bakeSpatialEmission(parameters.spatialEmission);
const spectralReferences = [];
for (const kelvin of [300, 650, 1000, 1400, 1800, 2500, 3200]) for (const nm of [360, 500, 830]) {
  const reference = referenceRadiance(nm, kelvin), actual = planckRadiance(nm, kelvin);
  spectralReferences.push({ kelvin, wavelengthNm: nm, radianceWPerSrPerM3: actual, referenceWPerSrPerM3: reference,
    relativeError: Math.abs(actual / reference - 1) });
}
// Independently recover Stefan-Boltzmann exitance from broad wavelength
// integration of the production function; no production σ-based power helper.
const bolometric = [300, 1000, 3200].map(kelvin => {
  const n = 20000, low = Math.log(1e-8), high = Math.log(0.1), step = (high - low) / n;
  let integral = 0;
  for (let i = 0; i <= n; i++) {
    const lambda = Math.exp(low + i * step);
    integral += (i === 0 || i === n ? 0.5 : 1) * planckRadiance(lambda * 1e9, kelvin) * lambda * step * Math.PI;
  }
  const expected = 5.670374419e-8 * kelvin ** 4;
  return { kelvin, integratedExitanceWPerM2: integral, stefanBoltzmannWPerM2: expected, relativeError: Math.abs(integral / expected - 1) };
});
const interpolation = [["gas", profile.gasEmission.blackbody, 1], ["solid", profile.surfaceEmission, 0.8]].map(([kind, table, emissivity]) => {
  let maximumYError = 0, maximumRgbErrorRelativeToPeak = 0, worstKelvin = 0;
  // Test every interval at an off-grid point, plus both endpoints.
  const temperatures = [table.temperatureKelvinRange[0], table.temperatureKelvinRange[1], ...table.samples.slice(1).map((_, i) =>
    table.temperatureKelvinRange[0] + (table.temperatureKelvinRange[1] - table.temperatureKelvinRange[0]) * (i + 0.37) / (table.samples.length - 1))];
  for (const kelvin of temperatures) {
    const reference = referencePhotometricRgb(observer, kelvin, emissivity);
    const actual = interpolateAbsoluteEmission(table, kelvin);
    const error = Math.abs(luminance(actual) / luminance(reference) - 1);
    if (error > maximumYError) { maximumYError = error; worstKelvin = kelvin; }
    maximumRgbErrorRelativeToPeak = Math.max(maximumRgbErrorRelativeToPeak, ...actual.map((v, c) => Math.abs(v - reference[c]) / Math.max(...reference)));
  }
  return { kind, sampleCount: table.samples.length, testedTemperatures: temperatures.length, maximumYError,
    maximumRgbErrorRelativeToPeak, worstKelvin, reference: "independent frequency Planck; 0.25 nm trapezoid with interpolated CIE" };
});
// Exact polynomial axial integral and independent cell-corner mask integral.
const areas = [0, 1].map(channel => {
  let sum = 0;
  for (let y = 0; y < spatial.height - 1; y++) for (let x = 0; x < spatial.width - 1; x++) {
    for (const [dx, dy] of [[0, 0], [0, 1], [1, 0], [1, 1]]) sum += spatial.rgba[((y + dy) * spatial.width + x + dx) * 4 + channel];
  }
  return sum / (255 * (spatial.width - 1) * (spatial.height - 1));
});
const polynomial = [1, -3.2, 3.76, -1.92, 0.36];
const integratePolynomial = (lo, hi, extraPower = 0) => polynomial.reduce((sum, coefficient, i) =>
  sum + coefficient * (hi ** (i + extraPower + 1) - lo ** (i + extraPower + 1)) / (i + extraPower + 1), 0);
const mixZ = spatial.downstreamMixFraction;
const referenceVolume = areas[0] * integratePolynomial(0, mixZ)
  + (areas[1] - areas[0]) / mixZ * integratePolynomial(0, mixZ, 1) + areas[1] * integratePolynomial(mixZ, 1);
const volumeCheck = { baked: profile.gasEmission.normalizedDensityVolume, reference: referenceVolume,
  relativeError: Math.abs(profile.gasEmission.normalizedDensityVolume / referenceVolume - 1) };
const baseInput = { temperatureKelvin: 1800, augmentation: true, fuelFlowKgPerSecond: 3,
  afterburnerBurnedFuelFlowKgPerSecond: 1, radiusMeters: 0.6, lengthMeters: 6 };
const budgetCases = [];
for (const augmentation of [false, true]) for (const temperatureKelvin of [300, 650, 1000, 1800, 2500, 3200]) {
  for (const fuelFlowKgPerSecond of [1e-6, 0.1, 3]) {
    const input = { ...baseInput, augmentation, temperatureKelvin, fuelFlowKgPerSecond };
    const result = evaluateEngineGasOptics(profile, input);
    budgetCases.push({ input, ...result, sourceWithinAllocation: result.totalSourcePowerUpperBoundW <= result.allowedPowerW * (1 + 1e-12) });
  }
}
const transferCases = [0, 1e-14, 0.025, 0.08, 0.3, 10].map(absorptionPerMeter => {
  const source = [15, 4, 2], pathMeters = 2;
  const actual = integrateGasSegment(source, absorptionPerMeter, pathMeters);
  // Independent midpoint quadrature of j exp(-κs), instead of analytic transfer.
  const n = 20000;
  let effectivePathMeters = 0;
  for (let i = 0; i < n; i++) effectivePathMeters += Math.exp(-absorptionPerMeter * (i + 0.5) * pathMeters / n) * pathMeters / n;
  return { absorptionPerMeter, ...actual, relativeError: Math.abs(actual.radianceRgbCdPerM2[0] / (source[0] * effectivePathMeters) - 1) };
});
const sensitivities = [];
for (const absorptionPerMeter of [0, 0.025, 0.08, 0.3]) for (const excitedFuelPowerFraction of [0, 1e-6, 1e-4]) {
  for (const bands of ["equal-energy", "CH-only"]) {
    const model = structuredClone(parameters.gasEmission);
    model.afterburner.absorptionPerMeter = absorptionPerMeter;
    model.afterburner.excitedFuelPowerFraction = excitedFuelPowerFraction;
    if (bands === "CH-only") model.excitedBands = model.excitedBands.filter(band => band.species === "CH*");
    const gasEmission = bakeDimensionalGas(model, observer, spatial);
    const result = evaluateEngineGasOptics({ gasEmission }, baseInput);
    sensitivities.push({ absorptionPerMeter, excitedFuelPowerFraction, bands, ...result,
      oneMeterRadianceRgbCdPerM2: integrateGasSegment(result.sourceRgbCdPerM3, result.absorptionPerMeter, 1).radianceRgbCdPerM2 });
  }
}
// The prior gas amplitude was independent of fuel and radiance. Its own zero
// at 300 K hid the cold endpoint but its 400 K row had finite display brightness.
const former = baseline.opticalParameters.dry;
const baselineKelvin = 400;
const fraction = (baselineKelvin - former.temperatureKelvinRange[0]) / (former.temperatureKelvinRange[1] - former.temperatureKelvinRange[0]);
const previousRelativeEmission = former.relativeEmission[0] + fraction * (former.relativeEmission[1] - former.relativeEmission[0]);
const revisedCold = evaluateEngineGasOptics(profile, { ...baseInput, temperatureKelvin: baselineKelvin, augmentation: false });
const baselineComparison = { baselinePath, kelvin: baselineKelvin, previousPeakNormalizedRgbMaximum: 1,
  previousIndependentRelativeEmissionPerMeter: previousRelativeEmission,
  revisedSourceRgbCdPerM3: revisedCold.sourceRgbCdPerM3,
  revisedOneMeterRadianceRgbCdPerM2: integrateGasSegment(revisedCold.sourceRgbCdPerM3, revisedCold.absorptionPerMeter, 1).radianceRgbCdPerM2,
  previousHasFuelInputOrPhysicalPowerBound: false, revisedMissingFuelSuppressed: !evaluateEngineGasOptics(profile, { ...baseInput, fuelFlowKgPerSecond: undefined }).valid,
  interpretation: "Prior normalized gas has no SI conversion, so no physical brightness ratio is claimed. A nonzero guessed 400 K display row and no fuel-source bound fail the new cold/source criteria. The endpoint at 300 K happened to be zero because its separate envelope was zero." };
const invalidInputs = [undefined, 0, -1, NaN, Infinity].map(fuelFlowKgPerSecond => ({ fuel: String(fuelFlowKgPerSecond),
  suppressed: !evaluateEngineGasOptics(profile, { ...baseInput, fuelFlowKgPerSecond }).valid }));
const inputs = [sourcePath, currentPath, baselinePath, "scripts/exhaustOptics/bake.mjs", "scripts/exhaustOptics/reference.mjs",
  "src/flight/aircraft/engineGasOptics.ts", "src/flight/aircraft/createEngineExhaust.ts", "src/flight/aircraft/createEngineHotSurfaceGlow.ts",
  "scripts/validation/f35b/check-physical-optics.mjs"];
const report = { schemaVersion: 1, scope: "CPU numerical/NullEngine software evidence; no rendered day/night/rear/oblique qualification",
  spectralReferences, bolometric, interpolation, volumeCheck, transferCases, baselineComparison, budgetCases, sensitivities, invalidInputs,
  energyMeaning: "Gray LTE particle source upper bound 4κσT⁴∫ρdV plus independently fuel-bounded excited visible power; reabsorption reduces escaped power. No withdrawal from imposed native reservoirs and no global engine conservation claim.",
  display: { referenceUnit: "cd/m2", physicalSourceUnaffectedByDisplay: true,
    chain: "native gas K/fuel -> absolute spectrum table/source cd/m3 and extinction /m -> ray transfer cd/m2 -> named gas reference + gain -> premultiplied blend -> shared exposure/tone/encoding. Native core/liner K -> epsilon B_lambda/CIE -> cd/m2 -> solid reference + gain -> corresponding PBR emissive binding -> shared processing.",
    limits: "Background transfer exact only with linear HDR composition. Material-local tone/gamma blending is approximate. One unshadowed far-field source light omits self-absorption, near-field geometry and shadowing; emitter-engine meshes excluded. Unlit raster map cannot receive it." },
  success: spectralReferences.every(v => v.relativeError < 1e-12) && bolometric.every(v => v.relativeError < 1e-8)
    && interpolation.every(v => v.maximumYError < 0.01 && v.maximumRgbErrorRelativeToPeak < 0.02)
    && volumeCheck.relativeError < 1e-8 && transferCases.every(v => v.relativeError < 1e-6) && budgetCases.every(v => v.sourceWithinAllocation) && invalidInputs.every(v => v.suppressed),
  identities: inputs.map(file => { const bytes = read(file); return { path: file, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }; }) };
const output = newOutputDirectory("validation", "f135-physical-optics");
writeFileSync(path.join(output, "physical-optics-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ output, success: report.success, interpolation, baselineComparison,
  maxSpectralError: Math.max(...spectralReferences.map(v => v.relativeError)), maxBolometricError: Math.max(...bolometric.map(v => v.relativeError)) }, null, 2));
if (!report.success) process.exitCode = 1;
