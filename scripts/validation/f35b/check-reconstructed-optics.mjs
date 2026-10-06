import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { newOutputDirectory } from "../../outputDirectory.mjs";
import { bakeOpticalLut, bakeSpatialEmission, parseObserverCsv, assumedSpectrum, spectralLinearRgb } from "../../exhaustOptics/bake.mjs";

// 0sfs owns aircraft optical validation. This is an offline gas-mask diagnostic,
// not a substitute for camera-matched engine views or GPU shader qualification.
const root = fileURLToPath(new URL("../../../", import.meta.url));
// Frozen reconstruction baseline. Current dimensional validation lives in
// check-physical-optics.mjs; do not run the rejected normalized model on new data.
const profilePath = "validation/evidence/aircraft/f35b/engine-rebuild-2026-10-06/implementation/optics/f135-exhaust-lut.manifest.json";
const retained = JSON.parse(readFileSync(path.join(root, profilePath)));
const profile = { ...retained.profile, rowsPerMode: retained.profile.dry.rowCount,
  ...retained.opticalParameters, spatialEmission: retained.spatialParameters };
const observer = parseObserverCsv(readFileSync(path.join(root, "scripts/exhaustOptics/data/CIE_xyz_1931_2deg.csv")));
const spectral = bakeOpticalLut(profile, observer);
const spatial = bakeSpatialEmission(profile.spatialEmission);

function sample(table, x, y, channel) {
  const X = Math.max(0, Math.min(table.width - 1, x));
  const Y = Math.max(0, Math.min(table.height - 1, y));
  const x0 = Math.floor(X), y0 = Math.floor(Y);
  const x1 = Math.min(x0 + 1, table.width - 1), y1 = Math.min(y0 + 1, table.height - 1);
  const at = (xx, yy) => table.rgba[(yy * table.width + xx) * 4 + channel] / 255;
  const a = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * (X - x0);
  const b = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * (X - x0);
  return a + (b - a) * (Y - y0);
}

const cases = [];
for (const [mode, temperatureKelvin] of [["dry", 1000], ["afterburner", 2500]]) {
  const [low, high] = profile[mode].temperatureKelvinRange;
  const row = (mode === "dry" ? 0 : profile.rowsPerMode) + (temperatureKelvin - low) / (high - low) * (profile.rowsPerMode - 1);
  for (const sampleCount of [4, 8, 16, 32]) {
    const radialProjection = Array.from({ length: 21 }, (_, radialIndex) => {
      const radiusFraction = radialIndex / 20;
      const rgb = [0, 0, 0];
      for (let index = 0; index < sampleCount; index++) {
        const z = (index + 0.5) / sampleCount;
        const radius = 1 - 0.6 * z;
        const x = (radiusFraction / radius * 0.5 + 0.5) * (spatial.width - 1);
        const y = (spatial.height - 1) / 2;
        const ring = sample(spatial, x, y, 0);
        const filled = sample(spatial, x, y, 1);
        const density = ring + (filled - ring) * Math.min(z / spatial.downstreamMixFraction, 1);
        const alpha = sample(spectral, z * (spectral.width - 1), row, 3);
        for (let c = 0; c < 3; c++) rgb[c] += sample(spectral, z * (spectral.width - 1), row, c) * density * alpha / sampleCount;
      }
      return { radiusFraction, relativeLinearRgb: rgb, relativePhotopicY: 0.2126729 * rgb[0] + 0.7151522 * rgb[1] + 0.072175 * rgb[2] };
    });
    const contrast = Math.max(...radialProjection.map(point => point.relativePhotopicY)) / radialProjection[0].relativePhotopicY;
    cases.push({ mode, temperatureKelvin, sampleCount, annulusToCenterContrast: contrast,
      passes: contrast > 2, radialProjection });
  }
}
const inputs = [profilePath, "scripts/exhaustOptics/bake.mjs", "src/flight/aircraft/createEngineExhaust.ts",
  "src/flight/aircraft/generated/f135-exhaust-lut.png", "src/flight/aircraft/generated/f135-exhaust-spatial.png",
  "scripts/validation/f35b/check-reconstructed-optics.mjs"];
const report = {
  schemaVersion: 1,
  scope: "Frozen rejected normalized-gas baseline only. Offline parallel rear-ray projection of baked gas emission through normalized plume; no hardware, exposure, scene background or GPU rendering.",
  reference: "validation/evidence/aircraft/f35b/engine-review-2026-10-06/frames/rear-92.png",
  referenceVariant: "F-35A, qualitative annulus only; not a calibrated F135-PW-600 match",
  acceptance: "A ratio above 2 checks a clearly darker center under all allowed sample budgets; it is an implementation criterion, not a measured video contrast.",
  provisionalSpatialInputs: profile.spatialEmission,
  angularCountStatus: "Eight is an explicit provisional profile hypothesis; no eight lights, thermal states or engineering component-count claim.",
  imageProcessingContract: {
    owner: "scene.imageProcessingConfiguration",
    babylonVersion: JSON.parse(readFileSync(path.join(root, "node_modules/@babylonjs/core/package.json"))).version,
    behavior: "Gas uses Babylon's GLSL/WGSL image-processing helpers and public configuration prepareDefines/PrepareUniforms/PrepareSamplers/bind. Shared exposure, tone mapping, curves and grading apply once locally, or raw linear gas RGB goes to the configured postprocess using the PBR final-clamp convention. No private Reinhard or gamma step remains.",
    qualification: "Configuration/software contract covered by NullEngine tests; GPU shader appearance and matched exposure comparison not qualified.",
  },
  sceneInteraction: "One optional unshadowed light samples dry/AB gas RGB; default 1000 cd reference and 12 m render range. These are display assumptions. It affects lit materials only; FOSS Earth's raster basemap explicitly disables material lighting. Raster deck illumination, impingement/scattering and light occlusion are not reconstructed.",
  afterburnerSpectralSamples: [0, 0.35, 0.8].map(axialFraction => ({ axialFraction, gasTemperatureKelvin: 2500,
    peakNormalizedLinearRgb: spectralLinearRgb(assumedSpectrum(profile, "afterburner", 2500, axialFraction, observer), observer) })),
  limits: ["No matched rear/oblique GPU capture was requested or performed.", "No day/night exposure or white-balance comparison; hold physical state fixed when qualifying display changes.",
    "Dry luminosity, angular pattern, relative spectra and scene-light intensity remain provisional; no temperature inferred from RGB."],
  success: cases.every(item => item.passes), cases,
  identities: inputs.map(file => { const bytes = readFileSync(path.join(root, file)); return { path: file,
    bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }; }),
};
const output = newOutputDirectory("validation", "f135-reconstructed-optics");
writeFileSync(path.join(output, "optics-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ success: report.success, output,
  cases: cases.map(({ mode, sampleCount, annulusToCenterContrast }) => ({ mode, sampleCount, annulusToCenterContrast })) }, null, 2));
if (!report.success) process.exitCode = 1;
