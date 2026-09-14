import { describe, expect, it } from "vitest";
import { detectDropouts } from "./dropoutDetector.mjs";

// Positive and negative controls for the detector ALGORITHM on synthetic
// captures. Passing here does not qualify any device: §5 still requires a
// diagnostic-only overload capture on each real route before a zero is accepted.

const RATE = 48_000;
const PROBE = 997;
const AMPLITUDE = 0.5;
const options = { sampleRate: RATE, probeHz: PROBE, amplitude: AMPLITUDE };

function probe(seconds, { driftPpm = 0, noise = 0.002, seed = 1 } = {}) {
  const out = new Float32Array(Math.round(seconds * RATE));
  let state = seed;
  const omega = (2 * Math.PI * PROBE * (1 + driftPpm * 1e-6)) / RATE;
  for (let n = 0; n < out.length; n += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    out[n] = AMPLITUDE * Math.sin(omega * n) + noise * (state / 2 ** 32 - 0.5);
  }
  return out;
}

describe("dropout detector controls", () => {
  it("reports nothing on a clean capture with clock drift and noise (false-positive check)", () => {
    expect(detectDropouts(probe(10, { driftPpm: 80 }), options).count).toBe(0);
  });

  it.each([0, 17, 64, 100])("finds a one-quantum gap at alignment offset %i", (offset) => {
    const capture = probe(2);
    capture.fill(0, 48_000 + offset, 48_000 + offset + 128);
    const result = detectDropouts(capture, options);
    expect(result.count).toBe(1);
    expect(result.spans[0].kind).toBe("missing");
    expect(result.spans[0].startFrame).toBeLessThanOrEqual(48_000 + offset);
  });

  it("finds a repeated quantum, which leaves the level intact but breaks the phase", () => {
    const clean = probe(2);
    const at = 60_000;
    const capture = new Float32Array(clean.length + 128);
    capture.set(clean.subarray(0, at), 0);
    capture.set(clean.subarray(at - 128, at), at);
    capture.set(clean.subarray(at), at + 128);
    const result = detectDropouts(capture, options);
    expect(result.count).toBe(1);
    expect(result.spans[0].kind).toBe("discontinuity");
  });

  it("finds a skipped quantum", () => {
    const clean = probe(2);
    const capture = new Float32Array(clean.length - 128);
    capture.set(clean.subarray(0, 70_000), 0);
    capture.set(clean.subarray(70_128), 70_000);
    expect(detectDropouts(capture, options).count).toBe(1);
  });

  it("counts separate faults separately", () => {
    const capture = probe(3);
    capture.fill(0, 30_000, 30_256);
    capture.fill(0, 100_000, 100_128);
    expect(detectDropouts(capture, options).count).toBe(2);
  });

  it("refuses a probe frequency that would hide a repeated quantum", () => {
    // 375 Hz advances exactly one cycle per 128 frames at 48 kHz.
    expect(() => detectDropouts(probe(1), { ...options, probeHz: 375 })).toThrow(/invisible/);
  });
});
