#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Short deterministic output comparison, not a timing/device benchmark.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newOutputDirectory } from "../../outputDirectory.mjs";
import { readAbi } from "../../../benchmarks/audio/renderSweep.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

export const REFERENCE_CASES = [44_100, 48_000].flatMap(sampleRate =>
  [1, 2].flatMap(tier => [0, 1].map(exterior => ({ sampleRate, tier, exterior }))));

/** Starts, changes power/configuration and winds down, with native SF50 units. */
export function referenceState(time, exterior) {
  const power = Math.min(1, time / 0.45);
  const burning = time >= 0.12 && time < 0.62;
  return {
    n1Pct: 24.3 + 70 * power, n2Pct: 53.4 + 43 * power,
    thrustLbf: burning ? 1846 * power : 0, fuelFlowPps: burning ? 0.0211 + 0.22 * power : 0,
    combustion: +burning, running: +(time >= 0.25 && burning), starter: +(time < 0.2), cutoff: +!burning,
    throttleNorm: power, kias: 210 * power, gearNorm: 1 - power, flapNorm: power * 0.5,
    sourceX: exterior ? 4 : 0, sourceY: exterior ? 2 : 0.96, sourceZ: exterior ? -12 : -4.06,
    sourceVelX: 0, sourceVelY: 0, sourceVelZ: 0, listenerVelX: 0, listenerVelY: 0, listenerVelZ: 0,
    soundSpeedMps: 343, exterior, groundReflectionM: exterior ? 4 : -1, augmentation: 0,
  };
}

/** Drives either the legacy or new ABI from that module's own retained header. */
export async function renderReference(wasmPath, headerPath, options) {
  const abi = readAbi(readFileSync(headerPath, "utf8"));
  const bytes = readFileSync(wasmPath);
  const { instance } = await WebAssembly.instantiate(bytes, { env: { emscripten_notify_memory_growth() {} } });
  const dsp = instance.exports;
  dsp._initialize();
  if (!dsp.osfs_audio_init(options.sampleRate, 128, 0x53463530)) throw new Error("DSP refused fixture");
  dsp.osfs_audio_set_tier(options.tier);
  dsp.osfs_audio_set_gains(1, 1, 1, 1, 0);
  dsp.osfs_audio_set_tire(900);
  dsp.osfs_audio_set_epoch(1, 0, 0);
  const batch = new Float64Array(dsp.memory.buffer, dsp.osfs_audio_batch_ptr(), abi.batchLength);
  const frames = Math.round(options.sampleRate * 0.8);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  let nextPublish = 0;
  let sequence = 0;
  for (let offset = 0; offset < frames; offset += 128) {
    const time = offset / options.sampleRate;
    while (nextPublish <= time + 0.1) {
      batch.fill(0);
      batch[0] = 1;
      const state = { ...referenceState(nextPublish, options.exterior), version: abi.version,
        sequence: ++sequence, epoch: 1, simTimeS: nextPublish,
        availability: abi.allAvailability };
      for (const [field, slot] of Object.entries(abi.slot)) batch[abi.batchHeader + slot] = state[field] ?? 0;
      dsp.osfs_audio_commit_batch();
      nextPublish += 1 / 60;
    }
    const count = Math.min(128, frames - offset);
    dsp.osfs_audio_process(offset, count);
    left.set(new Float32Array(dsp.memory.buffer, dsp.osfs_audio_out(0), count), offset);
    right.set(new Float32Array(dsp.memory.buffer, dsp.osfs_audio_out(1), count), offset);
  }
  return { left, right, outputSha256: hash(Buffer.concat([Buffer.from(left.buffer), Buffer.from(right.buffer)])),
    wasmSha256: hash(bytes) };
}

async function main(args) {
  const option = name => args.find(arg => arg.startsWith(name + "="))?.slice(name.length + 1);
  const referenceWasm = option("--reference-wasm");
  const referenceHeader = option("--reference-header");
  if (!referenceWasm || !referenceHeader) throw new Error("Provide --reference-wasm=... and --reference-header=...");
  const out = option("--output") ?? newOutputDirectory("validation", "audio-engine-reference");
  mkdirSync(out, { recursive: true });
  const cases = [];
  for (const configuration of REFERENCE_CASES) {
    const reference = await renderReference(referenceWasm, referenceHeader, configuration);
    const current = await renderReference(path.join(root, "src/flight/audio/dsp/audio-dsp.wasm"),
      path.join(root, "src/flight/audio/dsp/snapshot.h"), configuration);
    let differences = 0;
    let maxAbsoluteDifference = 0;
    for (const channel of ["left", "right"]) {
      for (let i = 0; i < reference[channel].length; i++) {
        const difference = Math.abs(current[channel][i] - reference[channel][i]);
        if (difference !== 0) differences++;
        maxAbsoluteDifference = Math.max(maxAbsoluteDifference, difference);
      }
    }
    cases.push({ ...configuration, frames: current.left.length,
      referenceWasmSha256: reference.wasmSha256, currentWasmSha256: current.wasmSha256,
      referenceOutputSha256: reference.outputSha256, currentOutputSha256: current.outputSha256,
      differences, maxAbsoluteDifference });
  }
  const report = { schema: "0sfs-engine-profile-reference/1", scope: "Short offline WASM output identity; no device/timing/acoustic qualification",
    passed: cases.every(item => item.differences === 0), cases };
  writeFileSync(path.join(out, "sf50-reference.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ outputDirectory: out, passed: report.passed, cases: cases.length }));
  if (!report.passed) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main(process.argv.slice(2));
