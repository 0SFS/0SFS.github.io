// SPDX-License-Identifier: AGPL-3.0-only
//
// Loopback dropout detector for the sound.md §5 protocol.
//
// A qualification run plays a known continuous probe tone through the real
// output route and captures it back (loopback or OS capture). This finds spans
// where that capture stops being the probe: missing audio (a gap) or a
// discontinuity (a repeated or skipped block shifts the probe's phase).
//
// It is only trustworthy once its positive control has passed on the same
// capture configuration: an induced overload must be reported. That control is
// dropoutDetector.test.mjs for the algorithm; each device run still needs its
// own diagnostic-only overload capture, kept apart from qualification results.

const TAU = Math.PI * 2;
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * @param {Float32Array|Float64Array} capture mono capture, already aligned to the probe start
 * @param {object} options
 * @param {number} options.sampleRate actual capture rate
 * @param {number} options.probeHz probe frequency; choose one whose phase advance over a
 *   quantum is far from a whole cycle, or a repeated quantum is phase-invisible
 * @param {number} options.amplitude probe peak amplitude in the capture
 * @param {number} [options.quantum] shortest span that must always be detected (frames)
 * @param {number} [options.amplitudeRatio] flag windows below this fraction of amplitude
 * @param {number} [options.phaseToleranceRad] flag windows whose phase departs by more
 */
export function detectDropouts(capture, options) {
  const {
    sampleRate, probeHz, amplitude,
    quantum = 128, amplitudeRatio = 0.5, phaseToleranceRad = 0.6,
  } = options;
  const omega = (TAU * probeHz) / sampleRate;
  const cycleFraction = (probeHz * quantum / sampleRate) % 1;
  if (Math.min(cycleFraction, 1 - cycleFraction) < 0.15) {
    throw new Error(`Probe ${probeHz} Hz advances ${cycleFraction.toFixed(3)} cycles per quantum; `
      + "a repeated quantum would be invisible. Choose another probe frequency.");
  }
  // Window one quantum long, hopped a quarter quantum: a gap of a full quantum
  // at ANY alignment then covers at least 3/4 of some window.
  const window = quantum;
  const hop = Math.max(1, Math.floor(quantum / 4));

  const flagged = [];
  let reference = null;
  let relock = [];
  for (let start = 0; start + window <= capture.length; start += hop) {
    let re = 0;
    let im = 0;
    for (let n = start; n < start + window; n += 1) {
      re += capture[n] * Math.cos(omega * n);
      im -= capture[n] * Math.sin(omega * n);
    }
    const measured = (2 / window) * Math.hypot(re, im);
    const phase = Math.atan2(im, re);
    const missing = measured < amplitude * amplitudeRatio;
    if (reference === null) {
      if (!missing) reference = phase;
      else flagged.push({ start, kind: "missing" });
      continue;
    }
    const drift = wrap(phase - reference);
    if (missing) {
      flagged.push({ start, kind: "missing" });
      relock = [];
    } else if (Math.abs(drift) > phaseToleranceRad) {
      flagged.push({ start, kind: "discontinuity" });
      // After a real repeat/skip the probe continues at a new phase. Re-lock
      // once several consecutive windows agree with each other.
      relock.push(phase);
      if (relock.length >= 4 && relock.every(p => Math.abs(wrap(p - relock[0])) < 0.2)) {
        reference = phase;
        relock = [];
      }
    } else {
      // Track slow clock drift between the probe source and the capture.
      reference = wrap(reference + 0.1 * drift);
      relock = [];
    }
  }

  const spans = [];
  for (const window of flagged) {
    const last = spans.at(-1);
    if (last && window.start <= last.endFrame) {
      last.endFrame = window.start + quantum;
      if (window.kind === "missing") last.kind = "missing";
    } else {
      spans.push({ startFrame: window.start, endFrame: window.start + quantum, kind: window.kind });
    }
  }
  return {
    count: spans.length,
    spans: spans.map(({ startFrame, endFrame, kind }) => ({ startFrame, frames: endFrame - startFrame, kind })),
    thresholds: { quantum, hop, amplitudeRatio, phaseToleranceRad, probeHz, amplitude, sampleRate },
  };
}
