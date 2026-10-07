#!/usr/bin/env node
// 0sfs owns this aircraft-reference diagnostic. Encoded pixels are not radiometry.
import { readFile, writeFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { newOutputDirectory } from '../../outputDirectory.mjs';

const frames = process.argv.find(a => a.startsWith('--frames='))?.slice(9);
if (!frames) throw new Error('Pass --frames=<directory of landing-001.png etc decoded at 25 fps from 161.8 s>');
const out = newOutputDirectory('validation', 'dry-vtol-footage');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function decodePng(bytes) {
  let width, height, channels;
  const chunks = [];
  for (let i = 8; i < bytes.length;) {
    const length = bytes.readUInt32BE(i), type = bytes.toString('ascii', i + 4, i + 8), chunk = bytes.subarray(i + 8, i + 8 + length);
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4);
      channels = chunk[9] === 2 ? 3 : chunk[9] === 6 ? 4 : 0;
      if (chunk[8] !== 8 || !channels || chunk[12] !== 0) throw new Error('Expected 8-bit non-interlaced RGB/RGBA PNG');
    }
    if (type === 'IDAT') chunks.push(chunk);
    i += length + 12;
  }
  const packed = inflateSync(Buffer.concat(chunks)), stride = width * channels, pixels = new Uint8Array(stride * height);
  if (packed.length !== (stride + 1) * height) throw new Error('Wrong PNG scanline size');
  const paeth = (a, b, c) => { const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c); return da <= db && da <= dc ? a : db <= dc ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = packed[y * (stride + 1)];
    if (filter > 4) throw new Error('Unknown PNG filter');
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0, b = y ? pixels[(y - 1) * stride + x] : 0, c = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const prior = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      pixels[y * stride + x] = (packed[y * (stride + 1) + 1 + x] + prior) & 255;
    }
  }
  return { width, height, channels, pixels };
}
function meanRgb(image, x0, y0, x1, y1) {
  const rgb = [0, 0, 0];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let c = 0; c < 3; c++) rgb[c] += image.pixels[(y * image.width + x) * image.channels + c];
  return rgb.map(v => v / ((x1 - x0) * (y1 - y0)));
}
const records = [];
for (const frame of [10, 15, 20, 25, 28]) {
  const input = path.join(frames, `landing-${String(frame).padStart(3, '0')}.png`), bytes = await readFile(input), image = decodePng(bytes);
  if (image.width !== 1920 || image.height !== 1080) throw new Error('Reference ROI requires 1920x1080');
  const profile = [];
  for (let y = 500; y < 840; y++) {
    const a = meanRgb(image, 875, y, 925, y + 1), b = meanRgb(image, 760, y, 810, y + 1);
    profile.push({ y, rgb: a, redExcessMinusBackground: a[0] - (a[1] + a[2]) / 2 - b[0] + (b[1] + b[2]) / 2 });
  }
  const smooth = profile.map((_, i) => profile.slice(Math.max(0, i - 2), Math.min(profile.length, i + 3)).reduce((s, p) => s + p.redExcessMinusBackground, 0) / (Math.min(profile.length, i + 3) - Math.max(0, i - 2)));
  const peaks = profile.filter((p, i) => i > 1 && i < profile.length - 2 && smooth[i] > 30 && smooth[i] > smooth[i - 1] && smooth[i] >= smooth[i + 1]).map(p => ({ y: p.y, smoothedRedExcess: smooth[p.y - 500] }));
  records.push({ input, sha256: hash(bytes), frame, nominalTimeSeconds: 161.8 + (frame - 1) / 25, peaks, navLightRoiRgb: meanRgb(image, 920, 240, 1050, 440), profile });
}
const h = 6.62607015e-34, c = 299792458, k = 1.380649e-23;
const planck = (nm, temperature) => { const w = nm * 1e-9; return 2 * h * c * c / (w ** 5 * Math.expm1(h * c / (w * k * temperature))); };
function photons(begin, end, temperature) {
  let sum = 0;
  for (let nm = begin; nm <= end; nm++) sum += planck(nm, temperature) * nm * 1e-9 / (h * c) * (nm === begin || nm === end ? 0.5 : 1) * 1e-9;
  return sum;
}
const thermalSensitivity = [900, 1000, 1100, 1200, 1300].map(temperatureK => ({ temperatureK,
  B940OverB650: planck(940, temperatureK) / planck(650, temperatureK), B650Over1000K: planck(650, temperatureK) / planck(650, 1000),
  nirToVisiblePhotonRatio: photons(750, 1100, temperatureK) / photons(380, 700, temperatureK),
}));
const gamma = 1.33, shocks = [1.1, 1.3, 1.5, 2].map(mach => {
  const densityRatio = (gamma + 1) * mach * mach / ((gamma - 1) * mach * mach + 2), pressureRatio = (2 * gamma * mach * mach - (gamma - 1)) / (gamma + 1), temperatureRatio = pressureRatio / densityRatio;
  const downstreamMachSquared = ((gamma - 1) * mach * mach + 2) / (2 * gamma * mach * mach - (gamma - 1));
  return { mach, densityRatio, pressureRatio, temperatureRatio, totalTemperatureRatio: temperatureRatio * (1 + (gamma - 1) * downstreamMachSquared / 2) / (1 + (gamma - 1) * mach * mach / 2) };
});
if (shocks.some(s => Math.abs(s.totalTemperatureRatio - 1) > 1e-12)) throw new Error('Shock energy invariance failed');
const report = { schema: '0sfs-dry-vtol-footage-clues/1', sourceUrl: 'https://www.youtube.com/watch?v=rIroDPghWF4',
  sourceCredit: 'Navy Lookout; description credits Royal Navy footage by LPhot Dan Shepherd',
  method: { pixelCoordinates: 'x right/y down, zero based in unretouched 1920x1080 frames', axisStrip: [875, 500, 925, 840], backgroundStrip: [760, 500, 810, 840], redExcess: 'R - (G+B)/2 minus same-row background-strip value, then 5-row mean; encoded 8-bit values, not linear radiance', peakThreshold: 30 },
  records, thermalSensitivity, illustrativeNormalShocks: { gamma, values: shocks },
  limits: ['No temperature, Mach number, particle loading, spectrum or absolute radiance is inferred from video RGB.', 'Frame times are approximate decoded video times. The montage edits between unrelated shots.', 'Grey Planck photon integrals use flat quantum efficiency; they are a camera-sensitivity illustration, not the unknown source camera response.', 'Illustrative shocks preserve total temperature and have no calibration to F135 nozzle pressure/temperature. They establish mechanism constraints only.'] };
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(path.join(out, 'analyze-dry-vtol-footage.mjs.txt'), await readFile(new URL(import.meta.url)));
console.log(JSON.stringify({ out, frames: records.length, illustrativeShockEnergy: 'passed' }, null, 2));
