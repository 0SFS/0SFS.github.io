#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
//
// Compiles src/flight/audio/dsp into the committed audio-dsp.wasm and records
// the provenance that scripts/verify-audio-artifact.mjs checks.
//
// Installing the pinned toolchain on macOS:  brew install emscripten
// Elsewhere: https://emscripten.org/docs/getting_started/downloads.html, then
// `./emsdk install 6.0.9 && ./emsdk activate 6.0.9`.
//
// The build is NOT byte-reproducible across toolchain patch levels; the
// committed artifact is the authority, exactly as docs/jsbsim.md says of the
// flight-dynamics module. Run with --check to compile into a new
// build/validation/audio-wasm-check/<date_time>/ and diff the exports instead of
// replacing the committed binary.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newOutputDirectory } from "./outputDirectory.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceDir = path.join(root, "src/flight/audio/dsp");
const outputDir = path.join(root, "src/flight/audio/dsp");

/** Pinned toolchain. A different major/minor is refused, not silently accepted. */
export const PINNED_EMCC = "6.0.9";

/**
 * Exact flags. `STANDALONE_WASM` keeps the module free of Emscripten JS glue,
 * which matters because AudioWorkletGlobalScope has neither fetch nor dynamic
 * import; the worklet instantiates these bytes synchronously.
 *
 * `ALLOW_MEMORY_GROWTH` is deliberate and bounded: the only growth path is the
 * Tier 3 band allocator, which runs from the setup path. Nothing inside
 * osfs_audio_process() allocates, so the audio callback never grows memory.
 */
export const EMCC_FLAGS = [
  "-O3",
  "-std=c++17",
  "--no-entry",
  "-sSTANDALONE_WASM=1",
  "-sALLOW_MEMORY_GROWTH=1",
  "-sINITIAL_MEMORY=2097152",
  "-sSTACK_SIZE=131072",
  "-sMALLOC=emmalloc",
  "-sERROR_ON_UNDEFINED_SYMBOLS=1",
  "-sFILESYSTEM=0",
  "-fno-exceptions",
  "-fno-rtti",
  // No fast-math: reordering or flushing denormals would change filter
  // state and make the deterministic fixtures unreproducible.
  "-fno-fast-math",
];

/** Every export the worklet calls. A missing one fails verification. */
export const REQUIRED_EXPORTS = [
  "memory", "_initialize",
  "osfs_audio_init", "osfs_audio_reset", "osfs_audio_set_tier", "osfs_audio_get_tier",
  "osfs_audio_set_shed", "osfs_audio_get_shed", "osfs_audio_set_limits", "osfs_audio_set_gains",
  "osfs_audio_set_epoch", "osfs_audio_batch_ptr", "osfs_audio_batch_length",
  "osfs_audio_snapshot_size", "osfs_audio_commit_batch", "osfs_audio_set_tire",
  "osfs_audio_out", "osfs_audio_stats", "osfs_audio_stats_count",
  "osfs_audio_band_alloc", "osfs_audio_band_clear", "osfs_audio_bands_ready",
  "osfs_audio_process",
];

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function sourceInventory() {
  return readdirSync(sourceDir)
    .filter((name) => name.endsWith(".h") || name.endsWith(".cpp"))
    .sort()
    .map((name) => ({ file: name, sha256: sha256(readFileSync(path.join(sourceDir, name))) }));
}

function emccVersion() {
  const text = execFileSync("emcc", ["--version"], { encoding: "utf8" });
  const match = text.match(/(\d+\.\d+\.\d+)/);
  if (!match) throw new Error("Could not read an emcc version from:\n" + text);
  return match[1];
}

export async function main(argv) {
  const check = argv.includes("--check");
  const version = emccVersion();
  if (version !== PINNED_EMCC) {
    throw new Error(
      `emcc ${version} is installed but this repository pins ${PINNED_EMCC}. ` +
      "Install the pinned version, or update PINNED_EMCC together with a rebuilt artifact " +
      "and a note in docs/validation/audio-implementation-ledger.md.");
  }
  const destination = check
    ? newOutputDirectory("validation", "audio-wasm-check")
    : outputDir;
  mkdirSync(destination, { recursive: true });
  const wasmPath = path.join(destination, "audio-dsp.wasm");

  execFileSync("emcc", [...EMCC_FLAGS, "-o", wasmPath, path.join(sourceDir, "core.cpp")], {
    stdio: "inherit", cwd: root,
  });

  const bytes = readFileSync(wasmPath);
  const module = await WebAssembly.compile(bytes);
  const exported = new Set(WebAssembly.Module.exports(module).map((entry) => entry.name));
  const missing = REQUIRED_EXPORTS.filter((name) => !exported.has(name));
  if (missing.length > 0) throw new Error("Missing WASM exports: " + missing.join(", "));

  const provenance = {
    artifact: "audio-dsp.wasm",
    license: "AGPL-3.0-only",
    note: "Original DSP written for this repository. No third-party audio engine, "
      + "recorded asset or model is linked, embedded or derived.",
    toolchain: { compiler: "emcc", version, flags: EMCC_FLAGS },
    sources: sourceInventory(),
    wasm: { bytes: bytes.length, sha256: sha256(bytes) },
    imports: WebAssembly.Module.imports(module).map((entry) => `${entry.module}.${entry.name}`),
    exports: [...exported].sort(),
    builtUtc: new Date().toISOString(),
  };

  if (check) {
    const committed = JSON.parse(readFileSync(path.join(outputDir, "audio-dsp.provenance.json"), "utf8"));
    const drifted = JSON.stringify(committed.sources) !== JSON.stringify(provenance.sources);
    console.log(JSON.stringify({
      mode: "check", outputDirectory: destination, sourcesMatchCommitted: !drifted,
      wasmSha256: provenance.wasm.sha256, committedSha256: committed.wasm.sha256,
    }, null, 2));
    // The same source and toolchain can still emit different bytes, so a hash
    // difference alone is not a source change. Drifted SOURCES are.
    if (drifted) process.exitCode = 1;
    return provenance;
  }

  writeFileSync(path.join(outputDir, "audio-dsp.provenance.json"),
    `${JSON.stringify(provenance, null, 2)}\n`);
  console.log(JSON.stringify({
    wrote: path.relative(root, wasmPath), bytes: bytes.length,
    sha256: provenance.wasm.sha256, emcc: version,
  }, null, 2));
  return provenance;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main(process.argv.slice(2));
}
