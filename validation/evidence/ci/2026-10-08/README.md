# CI measurements, 2026-10-08

These records are the basis for FOSS Earth's [CI/CD](../../../../../foss-earth/docs/ci-cd.md)
page. They were made on an Apple M5 (4 performance cores, 6 efficiency cores, 16 GB) running
macOS 27.0 and Node 26.9.0, with the JSBSim SDK 1.2.4-fork.20.

| File | What it holds |
| --- | --- |
| [jsbsim-fixture.json](jsbsim-fixture.json) | One run of [jsbsim-fixture.probe.ts](../../../../scripts/validation/ci/jsbsim-fixture.probe.ts) at 13:56: the parts of a JSBSim test fixture, and two ways of starting the engine |
| [vitest-runs.json](vitest-runs.json) | Vitest's summary of eleven `npm run ci` runs from 2026-09-28 to 10-08, and the per-file test time of the last one |

## How far the timings go

- **The fixture run was made at normal memory pressure (level 1), with a load average of 2.5.**
  Two more runs under the same conditions agreed with it to within 5%: bootstraps took
  312–318 ms and the plant's start took 297–304 ms. Nobody observed which kind of core ran them.
- **Earlier the same probes measured everything about twice as slow,** the Cessna included:
  580 ms starts and 179 µs F-35B steps. Memory pressure was at warning then, before the editor
  was fixed and restarted. Those figures are not qualified and are not used here or in the page.
- **The last CI run started at 13:38, at normal pressure, and swapped nothing.** Its transform
  and environment times match the run of 10-07 22:08. The run at 12:54 was disturbed: its
  environment and transform times were 2.5 times the normal ones.
- **The timings of single steps were taken while CrossOver was starting,** with a load average
  up to 16, so treat them as upper bounds: `lint` 1.75 s, `verify:jsbsim` 0.25 s,
  `verify:audio` 0.17 s, `verify:exhaust` 0.41 s, `verify:engine-assets` 0.28 s, `tsc -b`
  6.2–6.8 s, `vite build` 1.96 s, and the two checks of the built WASM 0.42 s together.

## The engine start

The F-35B's coupled plant spends 304 of its bootstrap's 318 ms starting the engine. That is as
much work as 3,447 steps at 120 Hz. The bootstrap starts the engine straight after its first
RunIC, and the plant then solves its steady state beginning at its design point.

When the engine is instead started after a RunIC with the engine stopped, at the same condition
(5,000 ft and the default airspeed), the start takes 10.5 ms. It ends at the same operating
point: thrust, N1 and N2 agree to a relative 5×10⁻¹¹. Probably the stopped RunIC gives the plant
a windmilling state to start from. Only that one condition was compared, and with no airflow, at
0 kt, there may be no such state. The empirical engine and the Cessna start in under 0.5 ms
either way.

## Observations with no retained file

**Typechecking.** Times are from `--verbose` timestamps and from wall-clock timing of each run.

| | 0sfs | FOSS Earth | UMN tour |
| --- | --- | --- | --- |
| `tsc -b`, nothing changed | 5.5–6.8 s | about 8 s | about 6 s |
| `tsc -p --incremental`, cold | 3.3 s | 2.1 s | 2.0 s |
| `tsc -p --incremental`, nothing changed | 1.3 s | 1.0 s | 1.0 s |

`tsc -b` gave its reason for being out of date as "output file 'src/appRoute.js' does not exist".

**Incremental `tsc -b` and linked packages.** This was reproduced with two folders:

1. `app/src/main.ts` imports a function from `lib`, a package linked into `app/node_modules`.
   The function returns a number, which `main.ts` assigns to a `number`.
2. With `incremental` on, `tsc -b app` passed. Then `lib`'s function was changed to return a
   string.
3. `tsc -b app` said the project "is up to date because newest input 'app/src/main.ts' is older
   than output '.tsbuildinfo'". `tsc -b app --force` and `tsc -p app --incremental` both reported
   TS2322.

**Choosing tests.** `npx vitest related public/jsbsim-data/aircraft/F-35B-jsbsim/Engines/F135-PW-600.xml --run --passWithNoTests`
printed "No test files found, exiting with code 0". With `forceRerunTriggers` set it selected
all 190 files. A test-name filter that matched nothing was used, so no test ran.

**Editor memory.** Measured with `footprint <pid>`, `heap -s <pid>` and `vmmap --summary <pid>`.
Chromium tags V8's pages 255 and PartitionAlloc's 253, which `footprint` shows as "App-Specific
Tag 16" and "Tag 14".

| | Footprint | Notes |
| --- | --- | --- |
| cpptools, before | 3,629 MB | Index of 5.1 GB for the workspace |
| cpptools, `build/` and others excluded | 2,589 MB | 29.2 million allocations: 1,279,213 `directory_cache::file_node`, 203,304 `directory_node` |
| cpptools, include path JSBSim's `src` only | 69 MB | 24,202 file nodes; 1,988 files indexed, in a 36 MB index |
| Pylance, before and after its exclusions | 1,594 MB and 0.6 GB | Exits with `"python.languageServer": "None"` |
| Claude Code panel's renderer, after a day | 1,385 MB | 1,163 MB of it V8 |
| An idle side panel's renderer | 862 MB | 610 MB of it V8 |
| Extension host | 696 MB | 588 MB of it V8 |

The renderers were told apart by when each started (the panel's 4 s before the first Claude
session) and by how much CPU each used while the panel drew a large output: +0.88 s, +0.36 s and
+0.03 s. Restarting VS Code reset all three.

Across the whole machine, the compressor held 9.6 GB of data in 5.3 GB of RAM before these fixes,
swap held 3.45 GB, and 50% of memory was free. Afterwards the compressor held 3.7 GB in 2.2 GB,
71% was free, and memory pressure was normal.
