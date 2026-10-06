import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { checkGeneratedExhaustArtifacts, generateExhaustArtifacts } from "./build-exhaust-optics.mjs";
import { assumedSpectrum, bakeOpticalLut, bakeSurfaceEmission, bakeTemporalEmission, parseObserverCsv, planckRadiance, spectralLinearRgb } from "./exhaustOptics/bake.mjs";

const profile = JSON.parse(readFileSync(new URL("./exhaustOptics/f135-visible-approximation.json", import.meta.url)));
const observer = parseObserverCsv(readFileSync(new URL("./exhaustOptics/data/CIE_xyz_1931_2deg.csv", import.meta.url)));

function decodePng(bytes) {
  const chunks = [];
  let width = 0;
  let height = 0;
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const name = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (name === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect([...data.subarray(8)]).toEqual([8, 6, 0, 0, 0]);
    }
    if (name === "IDAT") chunks.push(data);
    offset += length + 12;
  }
  const scanlines = inflateSync(Buffer.concat(chunks));
  const rgba = new Uint8Array(width * height * 4);
  expect(scanlines.length).toBe((width * 4 + 1) * height);
  for (let row = 0; row < height; row++) {
    expect(scanlines[row * (width * 4 + 1)]).toBe(0);
    rgba.set(scanlines.subarray(row * (width * 4 + 1) + 1, (row + 1) * (width * 4 + 1)), row * width * 4);
  }
  return { width, height, rgba };
}

describe("offline exhaust optical bake", () => {
  it("retains the official observer and produces a finite thermal continuum with increasing radiance", () => {
    expect(observer[0]).toEqual([360, 0.0001299, 0.000003917, 0.0006061]);
    expect(observer.at(-1)[0]).toBe(830);
    expect(planckRadiance(500, 2500)).toBeGreaterThan(planckRadiance(500, 1800));
    expect(() => planckRadiance(500, Number.NaN)).toThrow(/finite/);
    const thermal = spectralLinearRgb(assumedSpectrum(profile, "dry", 1, 0, observer), observer);
    expect(thermal[0]).toBe(1);
    expect(thermal[0]).toBeGreaterThan(thermal[1]);
    expect(thermal[1]).toBeGreaterThan(thermal[2]);
  });

  it("the declared radical-band component produces a different blue/violet spectrum from soot", () => {
    const radicalOnly = structuredClone(profile);
    radicalOnly.afterburner.sootEnergyFractionAtNozzle = 0;
    radicalOnly.afterburner.sootEnergyFractionAtTail = 0;
    const bands = assumedSpectrum(radicalOnly, "afterburner", 1, 0.35, observer);
    const peakWavelength = observer[bands.indexOf(Math.max(...bands))][0];
    expect(peakWavelength).toBe(432);
    const rgb = spectralLinearRgb(bands, observer);
    expect(rgb[2]).toBe(1);
    expect(rgb[2]).toBeGreaterThan(rgb[0]);
    expect(rgb.every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    const warmReference = spectralLinearRgb(assumedSpectrum(profile, "afterburner", 1, 0.35, observer), observer);
    expect(warmReference[0]).toBe(1);
    expect(warmReference[1]).toBeGreaterThan(warmReference[2]);
    expect(warmReference[2]).toBeLessThan(0.15);
  });

  it("decodes the installed PNG into the expected top-first dry and actual-afterburner banks", () => {
    const decoded = decodePng(readFileSync(new URL("../src/flight/aircraft/generated/f135-exhaust-lut.png", import.meta.url)));
    const baked = bakeOpticalLut(profile, observer);
    expect(decoded.width).toBe(64);
    expect(decoded.height).toBe(32);
    expect(decoded.rgba).toEqual(baked.rgba);
    const alphas = Array.from(decoded.rgba).filter((_, i) => i % 4 === 3);
    expect(alphas.slice(0, 64).every(value => value === 0)).toBe(true);
    expect(Math.max(...alphas.slice(0, 64 * 16))).toBeLessThanOrEqual(4);
    expect(Math.max(...alphas.slice(64 * 16))).toBeGreaterThan(240);
    for (let row = 0; row < 32; row++) expect(alphas[row * 64 + 63]).toBe(0);
  });

  it("bakes assumed shock contrast only into the afterburner envelope", () => {
    const smooth = structuredClone(profile);
    delete smooth.afterburner.assumedShockCells;
    const a = bakeOpticalLut(profile, observer).rgba;
    const b = bakeOpticalLut(smooth, observer).rgba;
    const boundary = 64 * 16 * 4;
    expect(a.subarray(0, boundary)).toEqual(b.subarray(0, boundary));
    expect(a.subarray(boundary)).not.toEqual(b.subarray(boundary));
    // The continuum/band colors themselves are unaffected by this brightness approximation.
    for (let i = boundary; i < a.length; i++) if (i % 4 !== 3) expect(a[i]).toBe(b[i]);
  });

  it("bakes a bounded periodic brightness sequence without changing the optical lookup", () => {
    const sequence = bakeTemporalEmission(profile.temporalEmission);
    expect(sequence.periodSeconds).toBe(0.8);
    expect(sequence.samples).toHaveLength(32);
    expect(Math.min(...sequence.samples)).toBeGreaterThanOrEqual(0.96);
    expect(Math.max(...sequence.samples)).toBeLessThanOrEqual(1.04);
    expect(Math.max(...sequence.samples) - Math.min(...sequence.samples)).toBeGreaterThan(0.04);
    expect(sequence.samples.reduce((sum, value) => sum + value, 0) / sequence.samples.length).toBeCloseTo(1, 7);
    expect(bakeTemporalEmission(profile.temporalEmission)).toEqual(sequence);
    expect(() => bakeTemporalEmission({ ...profile.temporalEmission, amplitude: 0.1 })).toThrow(/Invalid/);
    expect(() => bakeTemporalEmission({ ...profile.temporalEmission,
      harmonics: [{ cycles: 16, weight: 1, phaseRadians: 0 }] })).toThrow(/sampleable/);
    // Animation is a scalar metadata addition, not a new spectrum/texture bake.
    const withoutAnimation = structuredClone(profile);
    delete withoutAnimation.temporalEmission;
    expect(bakeOpticalLut(profile, observer).rgba).toEqual(bakeOpticalLut(withoutAnimation, observer).rgba);
  });

  it("reproduces the retained artifact and fails stale data verification", () => {
    const first = generateExhaustArtifacts();
    const second = generateExhaustArtifacts();
    for (const name of Object.keys(first)) expect(first[name].equals(second[name])).toBe(true);
    expect(Object.keys(checkGeneratedExhaustArtifacts())).toHaveLength(3);
    expect(() => checkGeneratedExhaustArtifacts(name => name.endsWith(".png")
      ? Buffer.from("stale image") : first[name])).toThrow(/is stale/);
    const manifest = JSON.parse(first["f135-exhaust-lut.manifest.json"]);
    expect(manifest.assetLicense).toBe("CC-BY-SA-4.0");
    expect(manifest.assumptions.join(" ")).toContain("not measured F135");
    expect(manifest.assumptions.join(" ")).toContain("not a unique computed F135 color");
    expect(manifest.profile.hudAccentHex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("bakes a separate hot-surface table without changing the existing gas/plume lookup", () => {
    const surface = bakeSurfaceEmission(profile.surfaceEmission, observer);
    expect(surface.samples).toHaveLength(16);
    expect(surface.samples.every(rgb => rgb.length === 3 && rgb.every(value => Number.isFinite(value) && value >= 0))).toBe(true);
    expect(surface.samples[0][0]).toBeCloseTo(0.02);
    expect(surface.samples.at(-1)[0]).toBeCloseTo(0.25);
    // Very cool visible continuum clips tiny green/blue channels to zero in
    // linear sRGB; every sample remains red-dominated, without demanding a
    // nonzero channel below the numerical/color-gamut floor.
    expect(surface.samples.every(rgb => rgb[0] > rgb[1] && rgb[1] >= rgb[2])).toBe(true);
    const withoutSurface = structuredClone(profile);
    delete withoutSurface.surfaceEmission;
    expect(bakeOpticalLut(profile, observer).rgba).toEqual(bakeOpticalLut(withoutSurface, observer).rgba);
    expect(() => bakeSurfaceEmission({ ...profile.surfaceEmission, assumedTemperatureK: [900, Number.NaN] }, observer)).toThrow(/thermal/);
  });
});
