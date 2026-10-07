#!/usr/bin/env node
// 0sfs owns this aircraft-source comparison. CPU radiance visualization, not a
// browser capture, camera calibration, deck model or live-render acceptance.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newOutputDirectory } from "../../outputDirectory.mjs";
import { encodeRgbaPng } from "../../exhaustOptics/bake.mjs";
import { evaluateEngineGasOptics, validateEngineGasOpticalData } from "../../../src/flight/aircraft/engineGasOptics.ts";

assert.equal(process.argv.length, 2, "Uses retained native states and current baked source; no positional options.");
const root = fileURLToPath(new URL("../../../", import.meta.url));
const out = newOutputDirectory("validation", "dry-soot-source");
const sourcePaths = [
  "src/flight/aircraft/generated/f135-exhaust-lut.manifest.json",
  "src/flight/aircraft/engineGasOptics.ts",
  "src/flight/aircraft/engineReactionEmission.ts",
  "validation/evidence/aircraft/f35b/exhaust-correction-2026-10-06/numerical/report.json",
  "scripts/validation/f35b/check-dry-soot-source.mjs",
];
const bytes = sourcePaths.map(p => readFileSync(path.join(root, p)));
const inputs = sourcePaths.map((file, i) => {
  const snapshot = `source-${i}-${path.basename(file)}.txt`;
  writeFileSync(path.join(out, snapshot), bytes[i]);
  return { file, snapshot, sha256: createHash("sha256").update(bytes[i]).digest("hex") };
});
const current = JSON.parse(bytes[0]).profile;
validateEngineGasOpticalData(current.gasEmission);
assert.equal(current.gasEmission.particleSpectrum.model, "power-law-soot-v1");
const gray = { ...current, gasEmission: { ...current.gasEmission, particleSpectrum: undefined } };
const retained = JSON.parse(bytes[3]);
const Y = rgb => .2126729 * rgb[0] + .7151522 * rgb[1] + .072175 * rgb[2];
const summarize = r => ({ valid: r.valid, temperatureK: r.sourceBoundaryTemperatureKelvin,
  absorptionPerMeter: r.absorptionPerMeter, particlePowerW: r.particlePowerUpperBoundW,
  chPowerW: r.chPowerW, c2PowerW: r.c2PowerW, exteriorIntensityCd: Y(r.exteriorIsotropicIntensityRgbCd),
  allowedPowerW: r.allowedPowerW, wholeIntensityCd: Y(r.isotropicIntensityRgbCd) });

// Independent sampler of the actual endpoint grid. Straight transverse rays
// cover exterior sections only; no opaque geometry or shock pattern is invented.
function sample(f, s, r) {
  const [lo, hi] = f.axialDistanceRangeMeters;
  const px = (s - lo) / (hi - lo) * (f.width - 1), py = r * (f.height - 1);
  const ix = Math.min(f.width - 2, Math.floor(px)), iy = Math.min(f.height - 2, Math.floor(py));
  const fx = px - ix, fy = py - iy, values = [0, 0, 0, 0];
  for (const [x, y, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)],
    [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    for (let c = 0; c < 4; c++) values[c] += w * f.rgba[((iy + y) * f.width + ix + x) * 4 + c];
  }
  return values;
}
function ray(r, input, s, offset, samples) {
  const radius = input.radiusMeters + current.gasEmission.spatialField.spreadingSlope * s;
  if (Math.abs(offset) >= radius) return [0, 0, 0];
  const half = Math.sqrt(radius ** 2 - offset ** 2), step = 2 * half / samples;
  const rgb = [0, 0, 0];
  let transmittance = 1;
  for (let i = 0; i < samples; i++) {
    const z = -half + (i + .5) * step;
    const q = sample(r.field, s, Math.hypot(offset, z) / radius);
    const integral = q[3] > 0 ? -Math.expm1(-q[3] * step) / q[3] : step;
    for (let c = 0; c < 3; c++) rgb[c] += transmittance * q[c] * integral;
    transmittance *= Math.exp(-q[3] * step);
  }
  return rgb;
}
const fields = new Map();
const cases = retained.cases.map(row => {
  const input = { ...row.input, upstreamGasTemperatureKelvin: row.native.egtC + 273.15,
    ambientPressurePascal: row.native.pressurePsf * 47.88025898033584 };
  const before = evaluateEngineGasOptics(gray, input), after = evaluateEngineGasOptics(current, input);
  const flag = evaluateEngineGasOptics(current, { ...input, augmentation: !input.augmentation });
  assert.deepEqual(after.field?.rgba, flag.field?.rgba, `${row.name}: flag-only source change`);
  assert.ok(after.totalSourcePowerUpperBoundW <= after.allowedPowerW);
  assert.equal(after.chPowerW, before.chPowerW);
  assert.equal(after.c2PowerW, before.c2PowerW);
  assert.deepEqual(after.field?.particleTemperatureKelvin, before.field?.particleTemperatureKelvin);
  if (input.fuelFlowKgPerSecond === 0) assert.equal(after.totalSourcePowerUpperBoundW, 0);
  const rays = after.valid ? [0, .5, 1, 2, 3].map(distanceMeters => {
    const fine = ray(after, input, distanceMeters, 0, 4096), refined = ray(after, input, distanceMeters, 0, 2048);
    const referenceConvergence = Math.abs(Y(refined) - Y(fine)) / Math.max(Y(fine), 1e-30);
    assert.ok(referenceConvergence < .0001, `${row.name}: reference convergence`);
    const budgets = [32, 64, 128].map(samples => {
      const value = ray(after, input, distanceMeters, 0, samples);
      return { samples, luminanceCdM2: Y(value),
        relativeError: Math.abs(Y(value) - Y(fine)) / Math.max(Y(fine), 1e-30) };
    });
    assert.ok(budgets.at(-1).relativeError < .01, `${row.name}: ray integration`);
    return { distanceMeters, rgbCdM2: fine, luminanceCdM2: Y(fine), referenceConvergence, budgets };
  }) : [];
  fields.set(row.name, { result: after, input });
  return { name: row.name, native: row.native, input, before: summarize(before), after: summarize(after), rays };
});

const names = ["powered-lift", "ab-onset", "ab-sustained"], exposures = [0, 8, 10];
const width = 144, height = 216, fieldWidthMeters = 2, fieldLengthMeters = 3;
const srgb = v => v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055;
const frames = [];
for (const name of names) {
  const { result, input } = fields.get(name), radiance = new Float64Array(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const s = (y + .5) / height * fieldLengthMeters, offset = ((x + .5) / width - .5) * fieldWidthMeters;
    radiance.set(ray(result, input, s, offset, 128), (y * width + x) * 3);
  }
  // Exposure is applied after integration, to the SAME frozen radiance buffer.
  for (const ev of exposures) {
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      for (let c = 0; c < 3; c++) {
        const linear = radiance[i * 3 + c] / 1000 * 2 ** ev;
        rgba[i * 4 + c] = Math.round(255 * srgb(linear / (1 + linear)));
      }
      rgba[i * 4 + 3] = 255;
    }
    const filename = `${name}-EV${ev}.png`, png = encodeRgbaPng(width, height, rgba);
    writeFileSync(path.join(out, filename), png);
    frames.push({ name, ev, filename, png });
  }
}
const contact = `<svg xmlns="http://www.w3.org/2000/svg" width="660" height="820" viewBox="0 0 660 820">
<rect width="660" height="820" fill="#151515"/><g fill="white" font-family="sans-serif" font-size="15">
<text x="20" y="27">CPU source-only viewing experiment — not live-render acceptance</text>
<text x="20" y="49" font-size="12">Same radiance per row; white 1000 cd/m²; component Reinhard / sRGB</text>
${exposures.map((ev, i) => `<text x="${150 + i * 170}" y="76">${ev >= 0 ? "+" : ""}${ev} EV</text>`).join("")}
${frames.map(({ name, ev, png }) => { const x = 140 + exposures.indexOf(ev) * 170, y = 90 + names.indexOf(name) * 235;
  return `<image x="${x}" y="${y}" width="144" height="216" href="data:image/png;base64,${png.toString("base64")}"/>`
    + (ev === 0 ? `<text x="12" y="${y + 20}">${name}</text>` : ""); }).join("")}
<text x="20" y="806" font-size="12">Each panel: 2 m wide × 3 m downstream; no deck, hardware, NIR or added source.</text></g></svg>`;
writeFileSync(path.join(out, "exposure-comparison.svg"), contact);
const report = { inputs, cases, visualization: { names, exposures, width, height, fieldWidthMeters, fieldLengthMeters,
  whiteReferenceCdM2: 1000, transfer: "component Reinhard then sRGB", samplesPerRay: 128,
  frames: frames.map(({ name, ev, filename }) => ({ name, ev, filename })),
  qualification: "Frozen exterior source-only CPU visualization. No hardware/deck/airframe, volumetric multiple scattering, night environment, camera spectral response or live HDR composition. All cases share the same geometric downward plotting orientation; this does not depict AB in hover." },
  validation: { passed: true, sameTemperatures: true, sameChemicalPower: true, flagOnlyInvariant: true,
    zeroFuelDark: true, sourcePowerBounded: true, appearanceAccepted: false } };
writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ outputDirectory: path.relative(root, out), cases: cases.map(c => ({ name: c.name, ...c.after })),
  validation: report.validation }, null, 2));
