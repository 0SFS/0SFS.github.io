#!/usr/bin/env node
// 0sfs owns this aircraft-source/observer diagnostic. No renderer, engine run,
// network request, exposure controller or native state is changed here.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newOutputDirectory } from "../../outputDirectory.mjs";

assert.equal(process.argv.length, 2, "Uses frozen retained observations; no positional arguments.");
const root = fileURLToPath(new URL("../../../", import.meta.url));
const out = newOutputDirectory("validation", "dry-exhaust-observer");
const paths = [
  "validation/evidence/aircraft/f35b/dry-vtol-response-2026-10-06/numerical/report.json",
  "scripts/exhaustOptics/data/CIE_xyz_1931_2deg.csv",
  "scripts/validation/f35b/analyze-dry-exhaust-observer.mjs",
];
const bytes = paths.map(file => readFileSync(path.join(root, file)));
const sha = data => createHash("sha256").update(data).digest("hex");
const inputs = paths.map((file, i) => {
  const snapshot = `source-${i}-${path.basename(file)}.txt`;
  writeFileSync(path.join(out, snapshot), bytes[i]);
  return { file, sha256: sha(bytes[i]), snapshot };
});
assert.equal(sha(bytes[1]), "fa663e3535a7e0763a745993a1f0a192eb0275ac46ad2d1befd7626841e713c1");
const retained = JSON.parse(bytes[0]), native = retained.nativeObservation;
const observer = bytes[1].toString().trim().split(/\r?\n/).map(line => line.split(",").map(Number));
assert.equal(observer.length, 471);
assert.equal(native.burnedAbKgSec, 0);
assert.equal(native.augmentation, 0);
const h = 6.62607015e-34, c = 299792458, k = 1.380649e-23, sigma = 5.670374419e-8;
const relative = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300);
const B = (nm, T) => 2 * h * c * c / ((nm * 1e-9) ** 5 * Math.expm1(h * c / (nm * 1e-9 * k * T)));
// Independently expressed frequency-form law, converted to per-metre wavelength.
const referenceB = (nm, T) => {
  const frequency = c / (nm * 1e-9);
  return (2 * h * frequency ** 3 / c ** 2 / Math.expm1(h * frequency / (k * T))) * frequency ** 2 / c;
};
const integrate = (f, lo, hi, step = .25) => {
  const count = Math.round((hi - lo) / step);
  assert.ok(count > 0 && Math.abs(count * step - (hi - lo)) < 1e-8);
  let sum = 0;
  for (let i = 0; i <= count; i++) sum += f(lo + i * step) * (i === 0 || i === count ? .5 : 1);
  return sum * step * 1e-9;
};
const ybar = nm => {
  const p = nm - 360, i = Math.floor(p), j = Math.min(470, i + 1), f = p - i;
  return observer[i][2] * (1 - f) + observer[j][2] * f;
};
const photopic = (spectrum, step = .25) => 683 * integrate(nm => spectrum(nm) * ybar(nm), 360, 830, step);
const photons = (spectrum, lo, hi) => integrate(nm => spectrum(nm) * nm * 1e-9 / (h * c), lo, hi);
const opacity550 = native.absorptionPerM;
const slab = (T, opticalDepth550, exponent = 0) => nm => B(nm, T)
  * -Math.expm1(-opticalDepth550 * (550 / nm) ** exponent);
const thermal = [500, 600, 700, 800, 900, native.gasK, 1100, 1200, 1500, 2363.103].map(T => {
  const spectrum = nm => B(nm, T), visible = integrate(spectrum, 380, 780), nir = integrate(spectrum, 780, 1100);
  return { temperatureKelvin: T, blackbodyLuminanceCdM2: photopic(spectrum),
    visible380to780RadianceWm2sr: visible, nir780to1100RadianceWm2sr: nir,
    nirToVisibleRadiantRatio: nir / visible,
    nirToVisiblePhotonRatio: photons(spectrum, 780, 1100) / photons(spectrum, 380, 780),
    water930to950BlackbodyCeilingWm2sr: integrate(spectrum, 930, 950),
    grayOneMeterLuminanceCdM2: photopic(slab(T, opacity550)),
    grayOneMeterNirRadianceWm2sr: integrate(slab(T, opacity550), 780, 1100),
    bolometricBlackbodyExitanceWm2: sigma * T ** 4 };
});

// Camera parameters below are deliberately an ideal sensitivity experiment,
// not guessed settings or spectral response of the supplied video/photographs.
const camera = { pixelPitchMeters: 5e-6, fNumber: 2.8, exposureSeconds: .02,
  quantumEfficiency: 1, lensTransmission: 1, sourceFillsPixel: true };
const cameraFactor = camera.pixelPitchMeters ** 2 * camera.exposureSeconds * Math.PI / (4 * camera.fNumber ** 2);
const cameraRows = [650, 700, 730, 780, 1100].map(cutoffNm => ({ cutoffNm,
  grayOneMeterElectronsCeiling: cameraFactor * photons(slab(native.gasK, opacity550), 380, cutoffNm),
  inverseWavelengthOneMeterElectronsCeiling: cameraFactor * photons(slab(native.gasK, opacity550, 1), 380, cutoffNm) }));
const currentExit = retained.stations.find(s => s.distanceMeters === 0).current;
const equivalentOpticalDepth = -Math.log1p(-currentExit.luminanceCdM2 / photopic(nm => B(nm, native.gasK)));
const equivalentSpectrum = slab(native.gasK, equivalentOpticalDepth);
const cameraEquivalent = cameraRows.map(row => ({ cutoffNm: row.cutoffNm,
  electronsCeiling: cameraFactor * photons(equivalentSpectrum, 380, row.cutoffNm) }));
const visiblePhotons = photons(equivalentSpectrum, 380, 780), nirPhotons = photons(equivalentSpectrum, 780, 1100);
const leakage = [0, .0001, .001, .01, .1, 1].map(nirToVisibleSensitivity => ({ nirToVisibleSensitivity,
  nirToVisibleSignalRatio: nirToVisibleSensitivity * nirPhotons / visiblePhotons }));

// Absorption, not total extinction: the NIST measurements separate this quantity.
// Their spectral exponent is measured over 500–840 nm. Extending to 360–1100 nm
// is an explicit diagnostic extrapolation, not an extra measured input.
const massAbsorption550M2perG = [3.8, 8.6];
const densityKgM3 = native.pressurePsf * 47.88025898033584 / (287 * native.gasK);
const volumeFlowM3S = native.flowProxyKgSec / densityKgM3;
const massConstraint = massAbsorption550M2perG.map(mac => {
  const massConcentrationGm3 = opacity550 / mac;
  return { massAbsorption550M2perG: mac, massConcentrationMgM3: massConcentrationGm3 * 1000,
    uniformSectionSootFluxKgS: massConcentrationGm3 * volumeFlowM3S / 1000,
    uniformSectionEmissionIndexMgPerKgFuel: massConcentrationGm3 * 1000 * volumeFlowM3S / native.fuelKgSec };
});
const spectralSlabs = [0, 1, 1.3].map(exponent => ({ exponent,
  luminanceCdM2: photopic(slab(native.gasK, opacity550, exponent)),
  visibleRadianceWm2sr: integrate(slab(native.gasK, opacity550, exponent), 380, 780),
  nirRadianceWm2sr: integrate(slab(native.gasK, opacity550, exponent), 780, 1100) }));

const srgb = linear => linear <= .0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - .055;
const exposure = [0, 4, 8, 10, 12].map(ev => {
  const rgbLinear = currentExit.rgbCdM2.map(v => v / 1000 * 2 ** ev);
  return { exposureEV: ev, whiteReferenceCdM2: 1000, rgbLinear,
    componentReinhardSrgb: rgbLinear.map(v => srgb(v / (1 + v))),
    linearPhotopicLuminance: currentExit.luminanceCdM2 / 1000 * 2 ** ev };
});

// Exact on-axis disk-to-differential-plane view factor for parallel surfaces.
// These alternative uniformly filled apertures are NOT additive contributors or
// actual engine-to-deck transfer; no impingement/heating state is invented.
const receiver = [1, 2, 3].map(heightMeters => {
  const radiusMeters = retained.input.radiusMeters, reflectance = .2;
  const projectedSolidAngle = Math.PI * radiusMeters ** 2 / (heightMeters ** 2 + radiusMeters ** 2);
  const sources = [{ name: "equivalent-dry-ray-filled-aperture", spectrum: equivalentSpectrum },
    { name: "core-temperature-filled-aperture", spectrum: nm => .8 * B(nm, native.coreK) },
    { name: "liner-temperature-filled-aperture", spectrum: nm => .8 * B(nm, native.linerK) }];
  return { heightMeters, radiusMeters, reflectance, projectedSolidAngle,
    alternatives: sources.map(({ name, spectrum }) => ({ name,
      incidentIlluminanceLux: photopic(spectrum) * projectedSolidAngle,
      reflectedLuminanceCdM2: photopic(spectrum) * projectedSolidAngle * reflectance / Math.PI,
      incidentNirIrradianceWm2: integrate(spectrum, 780, 1100) * projectedSolidAngle,
      reflectedNirRadianceWm2sr: integrate(spectrum, 780, 1100) * projectedSolidAngle * reflectance / Math.PI })) };
});

// Internal numerical checks: independent equation, quadrature refinement,
// Kirchhoff slab limits, source bounds, camera additivity and monotonic response.
let maxPlanckRelativeError = 0, maxQuadratureRelativeError = 0;
for (const { temperatureKelvin: T } of thermal) {
  for (const nm of [380, 550, 780, 940, 1100]) maxPlanckRelativeError = Math.max(maxPlanckRelativeError, relative(B(nm, T), referenceB(nm, T)));
  for (const [lo, hi] of [[380, 780], [780, 1100]]) maxQuadratureRelativeError = Math.max(maxQuadratureRelativeError,
    relative(integrate(nm => B(nm, T), lo, hi), integrate(nm => referenceB(nm, T), lo, hi, .125)));
  assert.equal(slab(T, 0)(650), 0);
  assert.equal(slab(T, 1000)(650), B(650, T));
  assert.ok(photopic(slab(T, opacity550)) <= photopic(nm => B(nm, T)));
}
assert.ok(maxPlanckRelativeError < 1e-12);
assert.ok(maxQuadratureRelativeError < 1e-4);
assert.ok(relative(photopic(equivalentSpectrum), currentExit.luminanceCdM2) < 1e-12);
assert.ok(relative(visiblePhotons + nirPhotons, photons(equivalentSpectrum, 380, 1100)) < 1e-12);
assert.ok(cameraRows.every((row, i) => !i || row.grayOneMeterElectronsCeiling > cameraRows[i - 1].grayOneMeterElectronsCeiling));

const report = { schemaVersion: 1, inputs, nativeObservation: native,
  physicalEquations: { transfer: "L_lambda=B_lambda(T)*(1-exp(-kappa_lambda*length)); LTE, isothermal, no scattering or incident background",
    particles: "kappa_lambda = MAC_550*rho_soot*(550nm/lambda)^alpha; MAC m2/g, rho g/m3",
    camera: "N_e=A_pixel*t*pi/(4*fNumber^2)*integral[L_lambda*tau_optics*QE(lambda)*lambda/(h*c) d_lambda]",
    reflection: "L_receiver=lambda_reflectance/pi*integral L_incident*cos(theta) dOmega",
    temperature: "imposed native gas-bath proxy; no new station temperature or heat source" },
  thermal, spectralSlabs, mass: { densityKgM3, volumeFlowM3S, massConstraint,
    qualification: "MAC bounds are measurements on other flame-generated soot. Gas flow is the existing uncalibrated proxy. Uniform area at peak opacity is an equivalent scenario; real radial loading lowers area-average flux. Neither is an F135 emission-index measurement." },
  camera: { assumptions: camera, cutoffs: cameraRows, leakage,
    currentExitLuminanceCdM2: currentExit.luminanceCdM2, equivalentOpticalDepth, equivalentCutoffs: cameraEquivalent,
    qualification: "Unity-QE sharp-cutoff monochrome ceilings. No camera RGB response, noise, filter rejection, color, saturation or reference exposure is inferred. Matching CIE Y by one isothermal spectrum is an observer sensitivity scenario, not a recovered nonuniform spectrum." },
  exposure: { rows: exposure, qualification: "Component Reinhard then sRGB experiment on retained emitted RGB. This is not the live scene HDR/compositing path or a camera reconstruction; EV leaves physical radiance unchanged." },
  receiver: { rows: receiver, qualification: "Alternative uniformly filled-aperture scenarios; no actual visibility, spectral BRDF, heat flux or deck temperature history. Not additive and not the existing point-light approximation." },
  validation: { maxPlanckRelativeError, maxQuadratureRelativeError, passed: true },
  limitations: ["No NIR energy is converted into photopic scene RGB.", "No molecular absorption/emission spectrum is fabricated; HITEMP line-by-line tables require composition, pressure and paths.",
    "Thermal water/CO2 mid-IR bands outside silicon sensitivity cannot directly make ordinary RGB pixels.",
    "Existing radiance and opacity remain provisional; numerical correctness does not establish F135 temperature, soot loading or footage acceptance.",
    "No runtime changes, GPU, browser, benchmark, engine step or new heat state."] };
writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
writeFileSync(path.join(out, "spectrum.csv"), "wavelengthNm,blackbodyWm2srNm,grayOneMeterWm2srNm,alphaOneMeterWm2srNm,equivalentExitWm2srNm\n"
  + Array.from({ length: 741 }, (_, i) => { const nm = 360 + i; return [nm, B(nm, native.gasK) * 1e-9,
    slab(native.gasK, opacity550)(nm) * 1e-9, slab(native.gasK, opacity550, 1)(nm) * 1e-9, equivalentSpectrum(nm) * 1e-9].join(","); }).join("\n") + "\n");
console.log(JSON.stringify({ out, validation: report.validation, dry: thermal.find(row => row.temperatureKelvin === native.gasK),
  camera: report.camera, mass: report.mass, exposure: report.exposure, receiver: report.receiver }, null, 2));
