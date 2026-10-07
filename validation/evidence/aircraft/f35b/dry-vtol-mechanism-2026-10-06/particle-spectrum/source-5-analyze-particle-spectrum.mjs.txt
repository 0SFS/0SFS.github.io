#!/usr/bin/env node
// 0sfs owns this aircraft spectral-transfer approximation diagnostic.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newOutputDirectory } from "../../outputDirectory.mjs";
import { referenceRadiance, referenceParticlePlanckMean, referenceParticleXyz } from "../../exhaustOptics/reference.mjs";

assert.equal(process.argv.length, 2, "This diagnostic has a declared fixed comparison matrix.");
const root = fileURLToPath(new URL("../../../", import.meta.url));
const out = newOutputDirectory("validation", "particle-spectrum");
const paths = ["src/flight/aircraft/generated/f135-exhaust-lut.manifest.json",
  "scripts/exhaustOptics/data/CIE_xyz_1931_2deg.csv", "scripts/exhaustOptics/bake.mjs",
  "scripts/exhaustOptics/reference.mjs", "scripts/exhaustOptics/f135-visible-approximation.json",
  "scripts/validation/f35b/analyze-particle-spectrum.mjs"];
const bytes = paths.map(file => readFileSync(path.join(root, file)));
const inputs = paths.map((file, i) => { const snapshot = `source-${i}-${path.basename(file)}.txt`;
  writeFileSync(path.join(out, snapshot), bytes[i]);
  return { file, snapshot, sha256: createHash("sha256").update(bytes[i]).digest("hex") }; });
const observer = bytes[1].toString().trim().split(/\r?\n/).map(line => line.split(",").map(Number));
const profile = JSON.parse(bytes[0]).profile.gasEmission, particle = profile.particleSpectrum;
assert.equal(particle.referenceWavelengthNm, 550);
assert.equal(particle.absorptionAngstromExponent, 1);
assert.equal(profile.dry.absorptionPerMeter, .025);
const interpolate = (table, T, logarithmic) => {
  const [lo, hi] = table.temperatureKelvinRange, x = (T - lo) / (hi - lo) * (table.samples.length - 1);
  const i = Math.max(0, Math.min(table.samples.length - 2, Math.floor(x))), f = Math.max(0, Math.min(1, x - i));
  const mix = (a, b) => logarithmic ? Math.exp(Math.log(a) * (1 - f) + Math.log(b) * f) : a * (1 - f) + b * f;
  return Array.isArray(table.samples[i]) ? table.samples[i].map((a, c) => mix(a, table.samples[i + 1][c]))
    : mix(table.samples[i], table.samples[i + 1]);
};
const relative = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300);
const interpolation = [150, 300, 650, 800, 1003.1281319989688, 1200, 1500, 2000, 2500, 3200].map(temperatureKelvin => {
  const xyz = interpolate(particle.xyz, temperatureKelvin, true);
  const ref = referenceParticleXyz(observer, temperatureKelvin, 1);
  const ratio = interpolate(particle.planckMeanAbsorptionRatio, temperatureKelvin, false);
  const refRatio = referenceParticlePlanckMean(temperatureKelvin, 1);
  return { temperatureKelvin, xyz, independentXyz: ref,
    photopicRelativeError: relative(xyz[1], ref[1]), maxXyzRelativeError: Math.max(...xyz.map((v, c) => relative(v, ref[c]))),
    planckMeanAbsorptionRatio: ratio, independentPlanckMeanRatio: refRatio, powerRelativeError: relative(ratio, refRatio) };
});
const cmf = (nm, c) => { const p = nm - 360, i = Math.floor(p), j = Math.min(470, i + 1), f = p - i;
  return observer[i][c + 1] * (1 - f) + observer[j][c + 1] * f; };
function integrateSlab(T, length, alpha, step) {
  const exact = [0, 0, 0], scalar = [0, 0, 0];
  const k550 = .025, tau = k550 * length;
  for (let nm = 360; nm <= 830; nm += step) {
    const weight = (550 / nm) ** alpha;
    const b = referenceRadiance(nm, T) * 683 * step * 1e-9 * (nm === 360 || nm === 830 ? .5 : 1);
    for (let c = 0; c < 3; c++) {
      exact[c] += b * -Math.expm1(-tau * weight) * cmf(nm, c);
      scalar[c] += b * weight * -Math.expm1(-tau) * cmf(nm, c);
    }
  }
  return { exactXyzCdM2: exact, scalar550XyzCdM2: scalar };
}
const slabs = [];
for (const exponent of [1, 1.3]) for (const temperatureKelvin of [800, 1003.1281319989688, 1500, 2000, 2500]) {
  for (const lengthMeters of [.1, 1, 6, 12]) {
    const coarse = integrateSlab(temperatureKelvin, lengthMeters, exponent, .25);
    const fine = integrateSlab(temperatureKelvin, lengthMeters, exponent, .125);
    slabs.push({ exponent, temperatureKelvin, lengthMeters, opticalDepth550: .025 * lengthMeters, ...fine,
      photopicRelativeError: relative(fine.scalar550XyzCdM2[1], fine.exactXyzCdM2[1]),
      photopicSignedRelativeError: fine.scalar550XyzCdM2[1] / fine.exactXyzCdM2[1] - 1,
      maxXyzRelativeError: Math.max(...fine.exactXyzCdM2.map((v, c) => relative(v, fine.scalar550XyzCdM2[c]))),
      quadratureRelativeError: relative(coarse.exactXyzCdM2[1], fine.exactXyzCdM2[1]) });
  }
}
const maxima = { interpolationPhotopic: Math.max(...interpolation.map(row => row.photopicRelativeError)),
  interpolationXyz: Math.max(...interpolation.map(row => row.maxXyzRelativeError)),
  bolometricPower: Math.max(...interpolation.map(row => row.powerRelativeError)),
  slabPhotopic: Math.max(...slabs.map(row => row.photopicRelativeError)),
  slabXyz: Math.max(...slabs.map(row => row.maxXyzRelativeError)),
  slabQuadrature: Math.max(...slabs.map(row => row.quadratureRelativeError)) };
assert.ok(maxima.interpolationPhotopic < .005);
assert.ok(maxima.bolometricPower < 1e-8);
assert.ok(maxima.slabQuadrature < 1e-4);
// Error is recorded, not silently relabeled exact spectral transfer.
const report = { inputs, model: particle.model, referenceWavelengthNm: 550, exponent: 1,
  interpolation, slabs, maxima, passed: true,
  equations: { source: "j_lambda=kappa550*(550nm/lambda)^alpha*B_lambda(T)",
    exactSlab: "B_lambda(T)*(1-exp(-kappa550*(550nm/lambda)^alpha*L))",
    scalarSlab: "B_lambda(T)*(550nm/lambda)^alpha*(1-exp(-kappa550*L))",
    bolometricSource: "4*kappa550*sigma*T^4*PlanckMeanAbsorptionRatio(T)",
    planckRatio: "(550nm*k*T/(h*c))^alpha*Gamma(4+alpha)*zeta(4+alpha)/(Gamma(4)*zeta(4))" },
  limits: ["NIST measurement spans500–840nm on other flame soot; wavelength extrapolation and F135loading remain hypotheses.",
    "Scalar550nm attenuation is not LTE-correct in the optically thick limit. These errors cover only the declared homogeneous-slab matrix, not nonuniform actual engine rays.",
    "VisibleXYZ and whole-spectrum source power use the same power law; spectra retain absolute amplitudes. Native temperatures and solid material tables are unchanged.",
    "No molecular-band or cameraNIR color, no new combustion source, no GPU or appearance pass."] };
writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ out, passed: true, maxima, powerAt1003K: interpolation.find(row => row.temperatureKelvin > 1000 && row.temperatureKelvin < 1004) }, null, 2));
