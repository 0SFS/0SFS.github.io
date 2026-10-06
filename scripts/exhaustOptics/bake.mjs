import { deflateSync } from "node:zlib";

// SI constants are exact; the returned spectral radiance is W sr^-1 m^-3.
export function planckRadiance(wavelengthNm, temperatureK) {
  if (!Number.isFinite(wavelengthNm) || wavelengthNm <= 0
    || !Number.isFinite(temperatureK) || temperatureK <= 0) {
    throw new RangeError("Planck wavelength and temperature must be finite and positive.");
  }
  const wavelength = wavelengthNm * 1e-9;
  const h = 6.62607015e-34;
  const c = 299792458;
  const k = 1.380649e-23;
  return 2 * h * c * c / (wavelength ** 5 * Math.expm1(h * c / (wavelength * k * temperatureK)));
}

export function parseObserverCsv(bytes) {
  const rows = bytes.toString().trim().split(/\r?\n/).map(line => line.split(",").map(Number));
  if (rows.length !== 471 || rows.some((row, i) => row.length !== 4
    || row[0] !== 360 + i || row.some(value => !Number.isFinite(value) || value < 0))) {
    throw new Error("Expected the official CIE 360–830 nm observer at 1 nm intervals.");
  }
  return rows;
}

const lerp = (a, b, t) => a + (b - a) * t;

function normalizeEnergy(spectrum) {
  const energy = spectrum.reduce((sum, value) => sum + value, 0);
  if (!(energy > 0) || !Number.isFinite(energy)) throw new Error("Invalid assumed spectral energy.");
  return spectrum.map(value => value / energy);
}

export function assumedSpectrum(profile, mode, powerNorm, axialFraction, observer) {
  const parameters = profile[mode];
  const temperatureK = lerp(...parameters.assumedSootTemperatureK, powerNorm)
    - parameters.axialCoolingK * axialFraction;
  const continuum = normalizeEnergy(observer.map(row => planckRadiance(row[0], temperatureK)));
  if (mode === "dry") return continuum;
  const bands = parameters.assumedBands;
  const radicals = normalizeEnergy(observer.map(([nm]) => bands.reduce((sum, band) => sum
    + band.relativeEnergy / band.sigmaNm * Math.exp(-0.5 * ((nm - band.centerNm) / band.sigmaNm) ** 2), 0)));
  const sootFraction = parameters.sootEnergyFractionAtTail
    + (parameters.sootEnergyFractionAtNozzle - parameters.sootEnergyFractionAtTail)
      * Math.exp(-parameters.sootMixFalloff * axialFraction);
  return continuum.map((value, i) => sootFraction * value + (1 - sootFraction) * radicals[i]);
}

export function spectralLinearRgb(spectrum, observer) {
  const xyz = [0, 0, 0];
  for (let i = 0; i < observer.length; i++) {
    for (let channel = 0; channel < 3; channel++) xyz[channel] += spectrum[i] * observer[i][channel + 1];
  }
  // CIE XYZ to linear sRGB, D65 primaries. Emission has no illuminant adaptation.
  const rgb = [
    3.2404542 * xyz[0] - 1.5371385 * xyz[1] - 0.4985314 * xyz[2],
    -0.969266 * xyz[0] + 1.8760108 * xyz[1] + 0.041556 * xyz[2],
    0.0556434 * xyz[0] - 0.2040259 * xyz[1] + 1.0572252 * xyz[2],
  ].map(value => Math.max(0, value));
  const peak = Math.max(...rgb);
  if (!(peak > 0)) throw new Error("Spectrum produced no visible RGB emission.");
  return rgb.map(value => value / peak);
}

export function linearRgbToHex(rgb) {
  return "#" + rgb.map(value => {
    const srgb = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, srgb)) * 255).toString(16).padStart(2, "0");
  }).join("");
}

export function bakeOpticalLut(profile, observer) {
  const { width, rowsPerMode } = profile;
  if (!Number.isInteger(width) || width < 2 || !Number.isInteger(rowsPerMode) || rowsPerMode < 2) {
    throw new RangeError("The optical LUT needs at least two columns and two rows per mode.");
  }
  const height = rowsPerMode * 2;
  const rgba = new Uint8Array(width * height * 4);
  for (const [modeIndex, mode] of ["dry", "afterburner"].entries()) {
    const parameters = profile[mode];
    for (let row = 0; row < rowsPerMode; row++) {
      const power = row / (rowsPerMode - 1);
      for (let column = 0; column < width; column++) {
        const axial = column / (width - 1);
        const rgb = spectralLinearRgb(assumedSpectrum(profile, mode, power, axial, observer), observer);
        const shocks = parameters.assumedShockCells;
        const cellModulation = shocks ? 1 - 0.5 * shocks.contrast * Math.exp(-shocks.axialDamping * axial)
          * (1 - Math.cos(2 * Math.PI * lerp(...shocks.countAtPower, power) * axial + shocks.phaseRadians)) : 1;
        const envelope = lerp(...parameters.relativeEmission, power)
          * cellModulation
          * Math.exp(-parameters.axialFalloff * axial) * (1 - axial) ** 2;
        const offset = ((modeIndex * rowsPerMode + row) * width + column) * 4;
        for (let i = 0; i < 3; i++) rgba[offset + i] = Math.round(rgb[i] * 255);
        rgba[offset + 3] = Math.round(Math.min(1, Math.max(0, envelope)) * 255);
      }
    }
  }
  const sample = profile.hudAccentSample;
  const hudAccentRgb = spectralLinearRgb(
    assumedSpectrum(profile, sample.mode, sample.powerNorm, sample.axialFraction, observer), observer);
  const hudAccentHex = linearRgbToHex(hudAccentRgb.map(value => lerp(value, 1, sample.neutralDisplayMix)));
  return { width, height, rgba, hudAccentHex };
}

/** Heated hardware color, separate from gas emission; display scale is assumed. */
export function bakeSurfaceEmission(parameters, observer) {
  if (!Number.isInteger(parameters.sampleCount) || parameters.sampleCount < 2
    || parameters.assumedTemperatureK?.length !== 2 || parameters.relativeDisplayEmission?.length !== 2
    || parameters.assumedTemperatureK.some(value => !Number.isFinite(value) || value <= 0)
    || parameters.relativeDisplayEmission.some(value => !Number.isFinite(value) || value < 0)) {
    throw new RangeError("Invalid thermal surface profile.");
  }
  return { samples: Array.from({ length: parameters.sampleCount }, (_, index) => {
    const power = index / (parameters.sampleCount - 1);
    const temperature = lerp(...parameters.assumedTemperatureK, power);
    const spectrum = normalizeEnergy(observer.map(row => planckRadiance(row[0], temperature)));
    const amplitude = lerp(...parameters.relativeDisplayEmission, power);
    return spectralLinearRgb(spectrum, observer).map(value => Number((value * amplitude).toFixed(8)));
  }) };
}

/** Offline artistic animation only; runtime interpolates these scalars using native time. */
export function bakeTemporalEmission(parameters) {
  if (!Number.isFinite(parameters.periodSeconds) || parameters.periodSeconds <= 0
    || !Number.isInteger(parameters.sampleCount) || parameters.sampleCount < 2
    || !Number.isFinite(parameters.amplitude) || parameters.amplitude < 0 || parameters.amplitude > 0.05
    || !parameters.harmonics.length) throw new RangeError("Invalid bounded temporal emission profile.");
  let weightSum = 0;
  for (const harmonic of parameters.harmonics) {
    if (!Number.isInteger(harmonic.cycles) || harmonic.cycles < 1 || harmonic.cycles >= parameters.sampleCount / 2
      || !Number.isFinite(harmonic.weight) || harmonic.weight < 0 || !Number.isFinite(harmonic.phaseRadians)) {
      throw new RangeError("Temporal harmonics need finite weights, phases and sampleable periodic cycles.");
    }
    weightSum += harmonic.weight;
  }
  if (!(weightSum > 0)) throw new RangeError("Temporal emission needs positive harmonic weight.");
  const samples = Array.from({ length: parameters.sampleCount }, (_, index) => {
    const variation = parameters.harmonics.reduce((sum, harmonic) => sum
      + harmonic.weight / weightSum * Math.sin(2 * Math.PI * harmonic.cycles * index / parameters.sampleCount + harmonic.phaseRadians), 0);
    return Number((1 + parameters.amplitude * variation).toFixed(8));
  });
  return { periodSeconds: parameters.periodSeconds, samples };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(name, bytes) {
  const type = Buffer.from(name);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, bytes])));
  return Buffer.concat([header, type, bytes, checksum]);
}

/** No timestamps, color-space conversion chunks, ancillary metadata or external encoder. */
export function encodeRgbaPng(width, height, rgba) {
  if (rgba.length !== width * height * 4) throw new RangeError("PNG data dimensions do not match.");
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) scanlines.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
