/**
 * 0sfs aircraft collision experiment: build a macOS native worker-budget harness
 * and run CoACD with at most half the logical cores. Python verifies both the
 * libc++ concurrency probe and embedded oneTBB global_control before generation.
 *
 * node scripts/validation/collision/run-coacd.mjs --input=build/.../mesh.json
 *   [--output=build/.../coacd.json] [--budgets=4,8,16,32] [--max-workers=5]
 *
 * Dependencies: build/tools/collision-python with coacd and numpy, and clang++.
 * Generation, compiler logs, native source hashes, and shims stay in dated build/.
 */
import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { newOutputDirectory } from "../../outputDirectory.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(directory, "../../..");
const usage = "Usage: node run-coacd.mjs --input=mesh.json [--output=coacd.json] [--budgets=4,8,16,32] [--max-workers=5] [--python=path]";
const forwardOptions = new Set([
  "threshold-metres", "preprocess-resolution", "sampling-resolution", "mcts-nodes",
  "mcts-iterations", "mcts-depth", "max-hull-vertices", "seed", "log-level",
]);

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

async function run(command, args, logPath, env = process.env) {
  const log = openSync(logPath, "w");
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: repo,
        env: { ...env, TMPDIR: path.dirname(logPath) },
        stdio: ["ignore", log, log],
      });
      child.once("error", reject);
      child.once("close", (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`${path.basename(command)} failed (${signal ?? `exit ${code}`}); see ${logPath}`));
      });
    });
  } finally {
    closeSync(log);
  }
}

async function main() {
  const options = new Map();
  for (const arg of process.argv.slice(2)) {
    if (arg === "--help") {
      console.log(`${usage}\nOptional generation parameters: ${[...forwardOptions].map(name => `--${name}=value`).join(" ")}`);
      return;
    }
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    if (!match || options.has(match[1])) throw new Error(usage);
    if (!["input", "output", "budgets", "max-workers", "python"].includes(match[1]) && !forwardOptions.has(match[1])) {
      throw new Error(`Unknown option --${match[1]}`);
    }
    options.set(match[1], match[2]);
  }
  if (!options.has("input")) throw new Error(usage);
  if (process.platform !== "darwin") throw new Error("This native worker-budget harness requires macOS/libc++; use a verified capped CoACD build on other platforms.");
  const maximumWorkers = Math.max(1, Math.floor(availableParallelism() / 2));
  const workers = Number(options.get("max-workers") ?? maximumWorkers);
  if (!Number.isInteger(workers) || workers < 1 || workers > maximumWorkers) {
    throw new Error(`max-workers must be an integer from 1 to ${maximumWorkers} (half the logical cores)`);
  }
  const input = path.resolve(options.get("input"));
  const python = path.resolve(options.get("python") ?? path.join(repo, "build/tools/collision-python/bin/python"));
  if (!existsSync(input) || !existsSync(python)) throw new Error("Input JSON and benchmark Python executable must exist before running.");
  const runDirectory = newOutputDirectory("validation", "collision", "coacd");
  const output = options.has("output") ? path.resolve(options.get("output")) : path.join(runDirectory, "coacd.json");
  const interposerSource = path.join(directory, "native/thread-budget.cpp");
  const probeSource = path.join(directory, "native/concurrency-probe.cpp");
  const interposer = path.join(runDirectory, "libthread-budget.dylib");
  const probe = path.join(runDirectory, "libconcurrency-probe.dylib");
  // Each compile uses one compiler invocation; no parallel build or source build
  // of CoACD/OpenVDB is needed for this benchmark-only cap.
  await run("clang++", ["-std=c++17", "-dynamiclib", interposerSource, "-o", interposer], path.join(runDirectory, "compile-thread-budget.log"));
  await run("clang++", ["-std=c++17", "-dynamiclib", probeSource, "-o", probe], path.join(runDirectory, "compile-concurrency-probe.log"));
  const provenance = {
    method: "macOS DYLD_INTERPOSE for libc++ hardware_concurrency plus embedded oneTBB global_control",
    workers,
    maximumWorkers,
    sources: {
      "scripts/validation/collision/native/thread-budget.cpp": sha256(interposerSource),
      "scripts/validation/collision/native/concurrency-probe.cpp": sha256(probeSource),
      "scripts/validation/collision/coacd-proxies.py": sha256(path.join(directory, "coacd-proxies.py")),
    },
    nativeLibraries: { interposerSha256: sha256(interposer), concurrencyProbeSha256: sha256(probe) },
    verification: "Python checks the separate native probe and active embedded TBB limit before generating hulls.",
  };
  writeFileSync(path.join(runDirectory, "worker-provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);
  const args = [
    path.join(directory, "coacd-proxies.py"), "--input", input, "--output", output,
    "--budgets", options.get("budgets") ?? "4,8,16,32", "--native-concurrency-probe", probe,
    "--tbb-max-workers", String(workers), "--thread-policy",
    `libc++ hardware_concurrency interposed to ${workers}; embedded oneTBB global_control ${workers}`,
  ];
  for (const [name, value] of options) if (forwardOptions.has(name)) args.push(`--${name}`, value);
  console.log(JSON.stringify({ runDirectory, output, workers, generationLog: path.join(runDirectory, "gen.log") }));
  await run(python, args, path.join(runDirectory, "gen.log"), {
    ...process.env,
    DYLD_INSERT_LIBRARIES: interposer,
    COLLISION_BENCHMARK_THREADS: String(workers),
    OMP_NUM_THREADS: String(workers),
    OPENBLAS_NUM_THREADS: String(workers),
    VECLIB_MAXIMUM_THREADS: String(workers),
  });
  const result = JSON.parse(readFileSync(output, "utf8"));
  result.metadata.workerBudgetHarness = provenance;
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ output, candidates: result.candidates.length, workers }));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
