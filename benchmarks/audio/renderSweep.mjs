// SPDX-License-Identifier: AGPL-3.0-only
//
// Offline render of the sound.md §5 fixed sweep through the COMPILED audio core.
//
// What this is: a reproducible Node run of audio-dsp.wasm over the synthetic
// sweep, per tier and sample rate, with output checks, core counters and
// per-quantum kernel timings.
//
// What this is NOT: real-time acceptance or device qualification. Node offline
// timings are proxies (sound.md §5.4). There is no output route, so the dropout
// count is null ("unknown"), never zero.
//
//   node benchmarks/audio/renderSweep.mjs [--sweep=build/benchmarks/audio/sweep.jsonl] [--tiers=off,low,med]
//     [--rates=44100,48000] [--repeats=1] [--seconds=240] [--passes=sweep,capacity,fault-injection]
//     [--out=result.json] [--wav=dir]

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateSweepText } from "./generate-sweep.mjs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

export const RESULT_SCHEMA = "osfs-audio-bench/1";
const WASM_PATH = "src/flight/audio/dsp/audio-dsp.wasm";
const PROVENANCE_PATH = "src/flight/audio/dsp/audio-dsp.provenance.json";
const HEADER_PATH = "src/flight/audio/dsp/snapshot.h";
const TIERS = { off: 0, low: 1, med: 2, high: 3 };
/** Mirrors TIER_BUDGETS[tier].quantumP95Ms in src/flight/audio/audioQuality.ts (proposed budgets). */
const P95_BUDGET_MS = { off: 0, low: 0.12, med: 0.25, high: 0.45 };
const QUANTUM = 128;
const SEED = 0x53463530;
const LIMITER_CEILING = 0.8912509381337456;  // -1 dBFS sample peak
/**
 * Cockpit installation offset: engine acoustic centre relative to the pilot
 * camera, from evidence/audio/sf50-geometry-2026-09-14.txt and the placeholder
 * aircraft's camera placement. The same constant dspCore.test.ts uses.
 */
const COCKPIT_SOURCE = [0, 0.96, -4.06];
/** Phases of the fixed sweep, from the §5 keyframe table. */
const SEGMENTS = [
  ["off", 0, 5], ["motoring", 5, 12], ["light-off-and-idle", 12, 40], ["acceleration", 40, 80],
  ["maximum", 80, 100], ["deceleration", 100, 120], ["re-acceleration", 120, 140],
  ["exterior-flyby", 140, 160], ["cruise-config-cycle", 160, 180], ["windmill", 180, 200],
  ["rundown", 200, 220], ["silence", 220, 240],
];

/**
 * Deliberate faults in the fault-injection pass, labelled so they are never
 * counted as normal-run dropouts (sound.md §5). Timings are sweep seconds.
 */
export const FAULTS = [
  { atSeconds: 30, kind: "seek", effect: "new epoch anchored at the current frame; queues cleared under a fade" },
  { atSeconds: 50, kind: "stale-input", effect: "600 ms of snapshots never delivered" },
  { atSeconds: 70, kind: "non-finite-snapshot", effect: "one snapshot carries a NaN N1" },
  { atSeconds: 90, kind: "tier-switch", effect: "another tier for 2 s, then back" },
  { atSeconds: 110, kind: "shed-ladder", effect: "shed levels 1..6 over 3 s, then 0" },
  { atSeconds: 150, kind: "event-overflow", effect: "40 future-stamped events into a 32-event core queue" },
  { atSeconds: 170, kind: "main-thread-stall", effect: "0.7 s stall; the simulation then runs 0.7 s behind the audio clock" },
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Reads the wire format from the C++ header, so this script cannot drift from the core. */
export function readAbi(header = readFileSync(HEADER_PATH, "utf8")) {
  const block = (marker) => {
    const body = header.split(`// ${marker}`)[1]?.split(`// END ${marker}`)[0];
    if (!body) throw new Error(`Marker ${marker} missing from ${HEADER_PATH}`);
    return body.replace(/\/\/.*$/gm, "");
  };
  const fields = [...block("AUDIO_SNAPSHOT_FIELDS").matchAll(/\bk([A-Z]\w*)/g)]
    .map((match) => match[1]).filter((name) => name !== "SnapshotSize")
    .map((name) => name[0].toLowerCase() + name.slice(1));
  const availability = [...block("AVAILABILITY").matchAll(/\bkAvail\w+\s*=\s*1\s*<<\s*(\d+)/g)]
    .reduce((bits, match) => bits | (1 << Number(match[1])), 0);
  const events = {};
  let next = 0;
  for (const match of block("AUDIO_EVENT").matchAll(/\bkEvent(\w+)\s*(?:=\s*(\d+))?/g)) {
    const value = match[2] === undefined ? next : Number(match[2]);
    events[match[1]] = value;
    next = value + 1;
  }
  const constant = (name) => {
    const match = header.match(new RegExp(`constexpr int ${name} = (\\d+);`));
    if (!match) throw new Error(`${name} missing from ${HEADER_PATH}`);
    return Number(match[1]);
  };
  const abi = {
    slot: Object.fromEntries(fields.map((name, index) => [name, index])),
    snapshotSize: fields.length,
    allAvailability: availability,
    events,
    eventSize: constant("kEventSize"),
    eventCapacity: constant("kEventCapacity"),
    batchSnapshots: constant("kBatchSnapshots"),
    batchHeader: constant("kBatchHeader"),
  };
  abi.batchLength = abi.batchHeader + abi.batchSnapshots * abi.snapshotSize + abi.eventCapacity * abi.eventSize;
  for (const name of ["LightOff", "Flameout", "StarterOn", "StarterOff", "RunningOn", "RunningOff"]) {
    if (abi.events[name] === undefined) throw new Error(`Event kEvent${name} missing from ${HEADER_PATH}`);
  }
  return abi;
}

export function loadSweep(file) {
  const text = file ? readFileSync(file, "utf8") : generateSweepText();
  return { sha256: sha256(text), rows: text.trim().split("\n").map((line) => JSON.parse(line)) };
}

function writeSnapshot(abi, view, offset, row, epoch) {
  const put = (name, value) => { view[offset + abi.slot[name]] = value; };
  const exterior = row.view === "exterior";
  const source = exterior ? row.sourceMetres : COCKPIT_SOURCE;
  const velocity = exterior ? row.sourceVelocityMps : [0, 0, 0];
  put("version", 1); put("sequence", row.sequence); put("epoch", epoch); put("simTimeS", row.time);
  put("availability", abi.allAvailability);
  put("n1Pct", row.n1); put("n2Pct", row.n2); put("thrustLbf", row.thrustLbf);
  put("fuelFlowPps", row.fuelLbPerSec); put("throttleNorm", row.throttle);
  put("combustion", +row.combustion); put("running", +row.running);
  put("starter", +row.starter); put("cutoff", +row.cutoff);
  put("kias", row.kias); put("gearNorm", row.gear); put("flapNorm", row.flap);
  put("sourceX", source[0]); put("sourceY", source[1]); put("sourceZ", source[2]);
  put("sourceVelX", velocity[0]); put("sourceVelY", velocity[1]); put("sourceVelZ", velocity[2]);
  put("listenerVelX", 0); put("listenerVelY", 0); put("listenerVelZ", 0);
  put("soundSpeedMps", row.soundSpeedMps);
  put("exterior", exterior ? 1 : 0);
  // The app's ground-image approximation (2 x height) for the 10 m fixture source; off in the cockpit.
  put("groundReflectionM", exterior ? 2 * source[1] : -1);
}

function transitions(abi, previous, row) {
  if (!previous) return [];
  const out = [];
  if (row.starter !== previous.starter) out.push(row.starter ? abi.events.StarterOn : abi.events.StarterOff);
  if (row.combustion !== previous.combustion) out.push(row.combustion ? abi.events.LightOff : abi.events.Flameout);
  if (row.running !== previous.running) out.push(row.running ? abi.events.RunningOn : abi.events.RunningOff);
  return out;
}

const nearestRank = (sorted, fraction) =>
  sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))];

function timingSummary(values, quantumMs, budgetMs, quantaPerWindow) {
  const sorted = Float64Array.from(values).sort();
  let sum = 0;
  let overQ = 0;
  for (const value of values) { sum += value; if (value > quantumMs) overQ += 1; }
  let worstWindowP95 = null;
  for (let start = 0; start + quantaPerWindow <= values.length; start += Math.floor(quantaPerWindow / 2)) {
    const window = Float64Array.from(values.subarray(start, start + quantaPerWindow)).sort();
    const p95 = nearestRank(window, 0.95);
    if (worstWindowP95 === null || p95 > worstWindowP95) worstWindowP95 = p95;
  }
  return {
    samples: values.length,
    meanMs: values.length ? sum / values.length : null,
    p50Ms: nearestRank(sorted, 0.5),
    p95Ms: nearestRank(sorted, 0.95),
    maxMs: sorted.length ? sorted[sorted.length - 1] : null,
    overQuantumCount: overQ,
    worstRolling2sP95Ms: worstWindowP95,
    p95OverProposedBudget: budgetMs > 0 ? nearestRank(sorted, 0.95) > budgetMs : null,
  };
}

function wavBytes(left, right, sampleRate) {
  const frames = left.length;
  const buffer = Buffer.alloc(44 + frames * 4);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + frames * 4, 4); buffer.write("WAVE", 8);
  buffer.write("fmt ", 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 4, 28); buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34); buffer.write("data", 36); buffer.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i += 1) {
    for (const [channel, data] of [[0, left], [1, right]]) {
      const value = Math.max(-1, Math.min(1, data[i]));
      buffer.writeInt16LE(Math.round(value * (value < 0 ? 32768 : 32767)), 44 + i * 4 + channel * 2);
    }
  }
  return buffer;
}

async function renderOnce(module, abi, rows, { tier, sampleRate, pass, seconds, keepAudio }) {
  const { instance } = await WebAssembly.instantiate(module, { env: { emscripten_notify_memory_growth() {} } })
    .then((instance) => ({ instance }));
  const x = instance.exports;
  x._initialize();
  if (!x.osfs_audio_init(sampleRate, QUANTUM, SEED)) throw new Error(`Core refused ${sampleRate} Hz`);
  if (x.osfs_audio_snapshot_size() !== abi.snapshotSize || x.osfs_audio_batch_length() !== abi.batchLength) {
    throw new Error("ABI mismatch between snapshot.h and the compiled core");
  }
  const tireWatts = pass === "capacity" ? 15_000 : 0;
  x.osfs_audio_set_tier(TIERS[tier]);
  x.osfs_audio_set_gains(1, 1, 1, 1, 0);
  x.osfs_audio_set_tire(tireWatts);
  x.osfs_audio_set_epoch(1, 0, 0);

  const totalFrames = Math.round(seconds * sampleRate);
  const timings = new Float64Array(Math.ceil(totalFrames / QUANTUM));
  const segmentEnergy = new Float64Array(SEGMENTS.length);
  const segmentFrames = new Float64Array(SEGMENTS.length);
  const left = keepAudio ? new Float32Array(totalFrames) : null;
  const right = keepAudio ? new Float32Array(totalFrames) : null;
  const eventBase = abi.batchHeader + abi.batchSnapshots * abi.snapshotSize;
  let peak = 0;
  let nonFinite = 0;
  let next = 0;
  let previous = null;
  let quantum = 0;
  let segment = 0;

  const faults = pass === "fault-injection";
  const otherTier = TIERS[tier] === TIERS.med ? TIERS.low : TIERS.med;
  let epoch = 1;
  let deliveryLag = 0;
  let seeked = false;
  let poisoned = false;
  let overflowed = false;
  let tierSwitch = 0;
  let shedLevel = 0;
  const batchView = () => new Float64Array(x.memory.buffer, x.osfs_audio_batch_ptr(), abi.batchLength);

  // At most one batch's worth per commit, transitions stamped at their own
  // sweep time — as the app transport does.
  const commit = (pending) => {
    for (let start = 0; start < pending.length; start += abi.batchSnapshots) {
      const view = batchView();
      view.fill(0);
      let snapshots = 0;
      let events = 0;
      for (const row of pending.slice(start, start + abi.batchSnapshots)) {
        for (const type of transitions(abi, previous, row)) {
          const offset = eventBase + events * abi.eventSize;
          view[offset] = type; view[offset + 1] = row.time; view[offset + 2] = epoch; view[offset + 3] = 0;
          events += 1;
        }
        const offset = abi.batchHeader + snapshots * abi.snapshotSize;
        writeSnapshot(abi, view, offset, row, epoch);
        if (faults && !poisoned && row.time >= 70) {
          view[offset + abi.slot.n1Pct] = Number.NaN;
          poisoned = true;
        }
        snapshots += 1;
        previous = row;
      }
      view[0] = snapshots;
      view[1] = events;
      x.osfs_audio_commit_batch();
    }
  };

  for (let frame = 0; frame < totalFrames; frame += QUANTUM) {
    const frames = Math.min(QUANTUM, totalFrames - frame);
    const now = frame / sampleRate;
    if (faults) {
      if (!seeked && now >= 30) {
        seeked = true;
        epoch = 2;
        x.osfs_audio_set_epoch(epoch, rows[next]?.time ?? now, frame);
      }
      if (tierSwitch === 0 && now >= 90) { x.osfs_audio_set_tier(otherTier); tierSwitch = 1; }
      if (tierSwitch === 1 && now >= 92) { x.osfs_audio_set_tier(TIERS[tier]); tierSwitch = 2; }
      const wantedShed = now >= 110 && now < 113.5 ? Math.min(6, 1 + Math.floor((now - 110) / 0.5)) : 0;
      if (wantedShed !== shedLevel) { x.osfs_audio_set_shed(wantedShed); shedLevel = wantedShed; }
      if (!overflowed && now >= 150) {
        overflowed = true;
        for (let burst = 0; burst < 2; burst += 1) {
          const view = batchView();
          view.fill(0);
          for (let e = 0; e < 20; e += 1) {
            const offset = eventBase + e * abi.eventSize;
            view[offset] = abi.events.StarterOn; view[offset + 1] = now + 5; view[offset + 2] = epoch;
          }
          view[1] = 20;
          x.osfs_audio_commit_batch();
        }
      }
      if (deliveryLag === 0 && now >= 170) deliveryLag = 0.7;
    }
    // Publish a little ahead of the 33 ms render lag.
    const pending = [];
    while (next < rows.length && rows[next].time + deliveryLag <= now + 0.05) {
      const row = rows[next];
      next += 1;
      if (faults && row.time >= 50 && row.time < 50.6) continue;
      pending.push(row);
    }
    commit(pending);

    const started = performance.now();
    x.osfs_audio_process(frame, frames);
    timings[quantum++] = performance.now() - started;

    const outL = new Float32Array(x.memory.buffer, x.osfs_audio_out(0), frames);
    const outR = new Float32Array(x.memory.buffer, x.osfs_audio_out(1), frames);
    while (segment < SEGMENTS.length - 1 && now >= SEGMENTS[segment][2]) segment += 1;
    for (let i = 0; i < frames; i += 1) {
      const l = outL[i];
      const r = outR[i];
      if (!Number.isFinite(l) || !Number.isFinite(r)) { nonFinite += 1; continue; }
      peak = Math.max(peak, Math.abs(l), Math.abs(r));
      segmentEnergy[segment] += (l * l + r * r) / 2;
      segmentFrames[segment] += 1;
    }
    if (left) { left.set(outL, frame); right.set(outR, frame); }
  }

  const statsView = new Float64Array(x.memory.buffer, x.osfs_audio_stats(), x.osfs_audio_stats_count());
  const statNames = ["snapshotsIn", "snapshotsDropped", "eventsIn", "eventsDropped", "resyncs", "staleFades",
    "blocks", "frames", "peak", "telemetryAge", "activeGrains", "grainDrops", "nonFinite", "queueDepth",
    "fade", "doppler", "distance", "tier", "shed", "epoch"];
  const quantumMs = (1000 * QUANTUM) / sampleRate;
  return {
    timings,
    audio: left ? { left, right } : null,
    result: {
      tier, sampleRate, pass, shed: 0, tireSlipWatts: tireWatts, seconds,
      ...(faults ? { faults: FAULTS.filter((fault) => fault.atSeconds < seconds) } : {}),
      quantumMs,
      output: {
        peak,
        peakWithinLimiterCeiling: peak <= LIMITER_CEILING + 1e-6,
        nonFiniteSamples: nonFinite,
        rmsBySegment: Object.fromEntries(SEGMENTS
          .map(([name], index) => [name, segmentFrames[index] ? Math.sqrt(segmentEnergy[index] / segmentFrames[index]) : null])
          .filter(([, value]) => value !== null)),
      },
      core: Object.fromEntries(statNames.map((name, index) => [name, statsView[index]])),
    },
  };
}

export async function renderSweep(options = {}) {
  const tiers = options.tiers ?? ["off", "low", "med"];
  const rates = options.rates ?? [44_100, 48_000];
  const repeats = options.repeats ?? 1;
  const seconds = Math.min(240, options.seconds ?? 240);
  const abi = readAbi();
  const sweep = options.sweep ?? loadSweep(options.sweepFile);
  const rows = sweep.rows.filter((row) => row.time < seconds + 0.1);
  const wasm = readFileSync(WASM_PATH);
  const provenance = JSON.parse(readFileSync(PROVENANCE_PATH, "utf8"));
  if (sha256(wasm) !== provenance.wasm?.sha256) throw new Error("audio-dsp.wasm does not match its provenance record");
  const module = await WebAssembly.compile(wasm);

  const runs = [];
  for (const tier of tiers) {
    for (const sampleRate of rates) {
      const passes = options.passes ?? ["sweep", "capacity", "fault-injection"];
      for (const pass of tier === "off" ? passes.filter((name) => name === "sweep") : passes) {
        const observations = [];
        const perRepeat = [];
        let last = null;
        for (let repeat = 0; repeat < repeats; repeat += 1) {
          const rendered = await renderOnce(module, abi, rows, {
            tier, sampleRate, pass, seconds, keepAudio: Boolean(options.wavDir) && repeat === 0,
          });
          const quantaPer2s = Math.round((2 * sampleRate) / QUANTUM);
          perRepeat.push(timingSummary(rendered.timings, rendered.result.quantumMs, P95_BUDGET_MS[tier], quantaPer2s));
          observations.push(rendered.timings);
          last = rendered;
          if (rendered.audio && options.wavDir) {
            mkdirSync(options.wavDir, { recursive: true });
            writeFileSync(path.join(options.wavDir, `${tier}-${sampleRate}-${pass}.wav`),
              wavBytes(rendered.audio.left, rendered.audio.right, sampleRate));
          }
        }
        // Aggregate p95 from the raw observations of every repeat, never an average of percentiles.
        const all = new Float64Array(observations.reduce((n, values) => n + values.length, 0));
        let offset = 0;
        for (const values of observations) { all.set(values, offset); offset += values.length; }
        runs.push({
          ...last.result,
          timing: {
            provenance: "performance.now() around each osfs_audio_process() call in Node; "
              + "an offline kernel proxy, not AudioWorklet callback timing",
            proposedP95BudgetMs: P95_BUDGET_MS[tier],
            repeats: perRepeat,
            aggregate: timingSummary(all, last.result.quantumMs, P95_BUDGET_MS[tier], Math.round((2 * sampleRate) / QUANTUM)),
          },
        });
      }
    }
  }

  return {
    schema: RESULT_SCHEMA,
    kind: "offline-kernel-proxy",
    disclaimer: "Synthetic sweep rendered offline in Node through the compiled core. Not real-time acceptance, "
      + "not a device qualification, and no physical output route: dropout count is unknown.",
    createdUtc: new Date().toISOString(),
    environment: {
      node: process.version, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0]?.model ?? null, logicalCpus: os.cpus().length,
    },
    inputs: {
      sweepSha256: sweep.sha256, sweepSeconds: seconds, seed: SEED, bridge: "none (direct WASM calls)",
      quantumFrames: QUANTUM, cockpitSourceMetres: COCKPIT_SOURCE,
    },
    build: {
      wasmSha256: provenance.wasm.sha256, wasmBytes: provenance.wasm.bytes,
      emcc: provenance.emcc ?? provenance.toolchain?.emcc ?? null,
      flags: provenance.flags ?? provenance.toolchain?.flags ?? null,
    },
    dropouts: { count: null, detector: "none: offline render has no output route" },
    runs,
  };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }));
  const report = await renderSweep({
    sweepFile: args.sweep,
    tiers: args.tiers?.split(","),
    rates: args.rates?.split(",").map(Number),
    repeats: args.repeats ? Number(args.repeats) : undefined,
    seconds: args.seconds ? Number(args.seconds) : undefined,
    passes: args.passes?.split(","),
    wavDir: args.wav,
  });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) writeFileSync(args.out, json); else process.stdout.write(json);
  let failed = false;
  for (const run of report.runs) {
    const t = run.timing.aggregate;
    console.error(`${run.tier.padEnd(4)} ${run.sampleRate} ${run.pass.padEnd(8)} peak ${run.output.peak.toFixed(3)} `
      + `nonfinite ${run.output.nonFiniteSamples} | proxy p95 ${t.p95Ms?.toFixed(4)} max ${t.maxMs?.toFixed(3)} ms `
      + `overQ ${t.overQuantumCount}`);
    if (run.output.nonFiniteSamples > 0 || !run.output.peakWithinLimiterCeiling
      || (run.tier === "off" && run.output.peak !== 0)) failed = true;
  }
  if (failed) {
    console.error("Output check failed: non-finite samples, a peak over the limiter ceiling, or sound at Off.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
