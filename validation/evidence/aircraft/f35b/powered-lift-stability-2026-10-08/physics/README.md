# Retained powered-lift physics observations

These are receipts from the executed 2026-10-08 investigation, not a captured
user session or a new simulation. The [investigation record](../../../../../../docs/validation/f135-powered-lift-stability-2026-10-08.md)
explains the findings and their limits. Original assumptions, initial conditions,
gates, summaries and artifact identities remain in each complete `report.json`.
Held cases freeze fuel; free cases burn it unless `fixedFuel` is explicitly true.
Free-flight trends require force, weight and environment analysis and do not use
the held-case fixed-input stability gate.

[index.json](index.json) identifies the retained original artifacts' paths and hashes,
the selected traces, and each run's `unretainedCases`. Complete reports and
compressed executed helper bundles are retained for all 20 completed runs.
The 25 selected traces retain every recorded channel and every physics step,
including the initial observation: 278,425 rows, with 686, 777, 831 or 844 columns
(including time). There is no downsampling or rounding. Trace data occupies
235,373,270 bytes, compared with 635,088,817 bytes for the original CSV gzip files.
Reports, code snapshots and input snapshots bring the directory to about 246 MB.

## Selected traces

Run names have the prefix `2026-10-08_`. Each row links to its original, complete
report; case names identify the adjacent archive manifests.

| Run | SDK | Hz | Algorithm | Retained cases |
| --- | --- | ---: | --- | --- |
| [162611](2026-10-08_162611/report.json) | fork.20 | 120 | reduced | `idle-entry`, `free-full` |
| [162728](2026-10-08_162728/report.json) | fork.20 | 120 | reduced | `idle-entry-hot`, `steady-cold` |
| [163546](2026-10-08_163546/report.json) | fork.20 | 120 | empirical engine comparison | `steady-hot` |
| [163643](2026-10-08_163643/report.json) | fork.20 | 60 | reduced, historical timing confound | `idle-entry`, `steady-hot` |
| [163949](2026-10-08_163949/report.json) | fork.20 | 240 | component, historical timing confound | `idle-entry`, `steady-hot` |
| [164037](2026-10-08_164037/report.json) | fork.20 | 120 | reduced | `partial-10-60kt` |
| [171654](2026-10-08_171654/report.json) | fork.21 | 120 | reduced | `idle-entry`, `steady-1`, `steady-hot`, `perturb--0.01`, `perturb-0.01` |
| [171937](2026-10-08_171937/report.json) | fork.21 | 120 | component | `idle-entry`, `steady-hot` |
| [172404](2026-10-08_172404/report.json) | fork.21 | 120 | reduced, free flight with fixed fuel and matched load | `level-hover-fixed-load` |
| [174336](2026-10-08_174336/report.json) | fork.21 | 60 | reduced, corrected timing | `idle-entry`, `steady-hot` |
| [174401](2026-10-08_174401/report.json) | fork.21 | 240 | reduced, corrected timing | `idle-entry`, `steady-hot` |
| [174544](2026-10-08_174544/report.json) | fork.21 | 240 | component, corrected timing | `idle-entry`, `steady-hot` |
| [175459](2026-10-08_175459/report.json) | fork.21 | 120 | reduced, free flight with fixed fuel and native body-acceleration trim | `level-hover-rotating-frame` |

The additional report/helper-only runs are `162550`, `162817`, `163304`,
`163351`, `163404`, `164500` and `164716`. Their per-step trace files were not
selected for retention; their original trace hashes and summaries remain in the
reports. One incomplete scratch attempt, `162709`, has no completed report and is
not represented here.

Fork.20 identifies native commit
`ea6956b4e9f9bddc04ef22863190ab1a8101e0f8`; fork.21 identifies
`34eeae66e5c886eec59eaefb516c0848cb504756`. Each report includes the complete SDK
build identity, package archive hash and package file hashes. The empirical
comparison uses its separately hashed aircraft and engine XMLs; its recorded
algorithm selector does not make that empirical engine a plant implementation.

Runs `163643` and `163949` changed the physics step after bootstrap, leaving the
flight-control system's cached delta time at 1/120 s. Their bytes were already
retained when this confound was found and are preserved as historical evidence.
Use `174336`, `174401` and `174544` for refinement comparisons: they set the delta
time before bootstrap, so controller and physics step sizes agree.

Run `175459` is the final hover isolation: 20% fixed fuel at 5,000 ft, with throttle
trimmed against native body `wdot` to include the rotating-frame acceleration.
Its initial `wdot` residual is 5.3442e-7 ft/s². Run `172404` instead matches the
vertical force to weight. Their different trim targets are preserved explicitly
in the original case inputs.

## Exact restoration

The [archive tool](../../../../../../scripts/validation/f35b/pack-powered-lift-trace.mjs)
deduplicates identical full columns, encodes differences of the IEEE754 64-bit
patterns modulo 2^64 in separate byte planes, then compresses with Brotli quality
6. This retains all original columns and values. Each manifest records the data
hash, full column order/map, decoded CSV hash and original gzip hash. Packing and
unpacking independently checked both decoded CSV and original gzip hashes for
every selected trace. The old schema 1 column-major gzip format was also restored
successfully with the final tool. [archive-verification.json](archive-verification.json)
records the final payload, snapshot and restoration checks.

The decoded CSV hash identifies the original CSV independently of its compression
format. Exact original gzip reconstruction was verified on **Node v26.9.0,
zlib 1.2.12, Darwin arm64**. A different zlib build can emit different compressed
bytes for the same exact CSV. The tool keeps the strict original-gzip hash check;
use the recorded Node/zlib environment to reproduce those bytes. This is not a
claim of portable gzip bit reproduction across runtimes. The packer verifies the
canonical numeric CSV spelling used by these runners; it rejects an input whose
text cannot be exactly reconstructed from the numeric columns.

From the repository root, restore one trace to a fresh path under `build/`:

```sh
node scripts/validation/f35b/pack-powered-lift-trace.mjs --unpack \
  validation/evidence/aircraft/f35b/powered-lift-stability-2026-10-08/physics/2026-10-08_171654/idle-entry.json \
  build/restored-powered-lift/2026-10-08_171654/idle-entry.csv.gz
```

The tool creates parent directories and refuses to overwrite an existing file.
Omit the last argument to select a fresh dated `build/validation/` directory.
Restoration reads only the retained manifest and adjacent `.f64-delta.br` file;
it does not need the original scratch run. The adjacent `report.json` retains the
case's assumptions and expected original trace hash. Reports also contain cases
whose traces were not retained, so consumers must use `index.json` to select the
available cases.

## Executed code and inputs

Each `helpers.mjs.gz` contains the exact executed bundle, including the relevant
compiled application code and its SDK imports. Its decoded SHA-256 is recorded
in `index.json` and was checked against `executedBundleSha256` where the original
report supplied that hash. Six runs also retain `runner-source.mjs.gz`:
`171937`, `172404`, `174336`, `174401`, `174544` and `175459`. Each decoded runner matches
the original report's runner input hash.

Earlier runs did not capture the executed runner bytes. Their original runner
hashes remain in their reports; no current source or current hash has been
substituted. Their helper bundles preserve the executed application code, but
they do not close that missing runner-source provenance gap. Current source can
therefore differ from the executed runner snapshots even when the physics cases
are unchanged.

`source/` retains nine distinct, gzip-compressed input snapshots: the actual plant
and empirical aircraft/engine/system XMLs and the model manifest. Their decoded
hashes match the original report input hashes. Identical input bytes are retained
once by hash even when more than one source path names them. Resolve each report's
input by its hash using `index.json`; gzip decompression recovers the original
bytes. These records preserve inputs and observations, not a claim that rebuilding
the WASM SDK will reproduce its binary hash.

## Accepted numerical phases

[accepted-phase-counts.json](accepted-phase-counts.json) derives counts from the
15 retained fork.21 traces. It excludes the initial observation and requires an
advancing `numerics/sequence` plus positive `numerics/step-seconds` to count an
accepted step. It separately counts `step-algorithm` for integration and
`algorithm` for end-state publication, and checks both fallback-reason fields and
the failure field. Every counted step used its selected integration and
publication algorithm, with zero accepted fallback steps and zero failed rows.
The retained fork.21 traces contain 172,800 accepted steps in total.

Early report `componentSteps` summaries include the initial, zero-time steady
component publication. A count of one in a reduced trace is therefore not an
accepted dynamic fallback. A component algorithm selected explicitly is also not
a fallback. Fork.20 lacks the new phase distinction; its complete reports remain
unchanged rather than assigning it diagnostics it did not expose.
