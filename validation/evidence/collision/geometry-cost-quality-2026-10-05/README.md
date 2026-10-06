# Aircraft collision benchmark evidence

Measurements from 2026-10-05 support the
[cost and accuracy report](../../../../docs/validation/collision-geometry-cost-quality.md).
The initial run compares 41 representations on C172 LOD3 and SF50 LOD3.
The follow-up adds complete plane support, whole-proxy gates with exact
confirmation, and the 7,294-triangle SF50 HilosRun variant.

**Timing status: provisional.** The user used this fanless Mac concurrently.
The original filter records load, memory and input, but does not measure P/E
core residency, effective frequency or thermal throttling. Accepted samples do
not establish isolation. Geometry coverage results remain inspectable; speed
rankings require the newer shared benchmark policy before qualification.

| Record | Purpose |
| --- | --- |
| `baseline-results.json.gz`, `followup-results.json.gz` | Complete reports, per-case hit outputs, raw timing samples, accepted samples and machine conditions |
| `baseline-fixtures.json.gz`, `followup-fixtures.json.gz` | Captured source vertices, triangles, proxy geometry, poses and encounter parameters for replay |
| `baseline-summary.json`, `followup-summary.json` | Readable quality and timing summaries; baseline selects representative candidates, follow-up retains all candidates |
| `baseline-provenance.json`, `followup-provenance.json` | Hardware, backend, browser, configuration and source hashes captured before timing |
| `baseline-run.log`, `followup-run.log` | Browser run completion and selected console tables |
| `source-baseline/`, `source-followup/` | Frozen source snapshots for inspecting the measured implementations |
| `*-coacd*.json`, `coacd-generation/` | Generated CoACD geometry, parameters, original-source hashes, native worker verification and generation logs |
| `query-margins.json`, `query-margins.log` | Numerical reproduction of two missed compound contacts, including analytic support and direct child comparisons |
| `tool-package.json`, `tool-package-lock.json` | Exact isolated Rapier and QuickHull installation |
| `manifest.json` | SHA-256 and size of every other retained file |
| `hardware-notes.json`, `cpu-topology.log` | Post-run P/E topology, user-reported fanless cooling and limits of the original timing qualification |
| `checks/` | Typecheck, lint, related-test, CI, targeted failure and build logs |

The summaries retain null medians for workloads with no accepted timing
samples. They do not turn unqualified timing into zero cost. Quality checks are
deterministic and separate from timing qualification. The human-facing report
uses at least five accepted rounds for exploratory comparisons and leaves all
speed rankings provisional because the core and thermal signals are missing.

## Prepare the isolated tools

Run from the 0sfs root. This installs benchmark tools under `build/`, not in the
application package. Recorded versions are Rapier 0.21.0, QuickHull 3.1.2,
Playwright 1.55.0 and installed Chrome 154.0.8037.95. Replay records the versions
actually present on the new machine.

```sh
mkdir -p build/tools/collision
cp validation/evidence/collision/geometry-cost-quality-2026-10-05/tool-package.json build/tools/collision/package.json
cp validation/evidence/collision/geometry-cost-quality-2026-10-05/tool-package-lock.json build/tools/collision/package-lock.json
npm ci --prefix build/tools/collision --cache build/tools/npm-cache --no-audit --no-fund
npm install --prefix build/tools/playwright --cache build/tools/npm-cache --no-audit --no-fund playwright@1.55.0
```

Set `CHROME_PATH` when installed Chrome is elsewhere. The runner can also use
`PLAYWRIGHT_MODULE` pointing to an existing isolated Playwright `index.mjs`.
The measured runs used the sibling FOSS Earth installation. The browser opens
an offline local file; no server is needed. It closes through Playwright in a
`finally` block.

## Replay the captured geometry

Unpack into repository scratch. The captured fixtures include geometry, so the
aircraft GLBs can change without silently changing these encounters.

```sh
node --input-type=module -e 'import fs from "node:fs"; import {gunzipSync} from "node:zlib"; const dir="build/validation/collision/replay"; fs.mkdirSync(dir,{recursive:true}); for(const stage of ["baseline","followup"]) fs.writeFileSync(dir+"/"+stage+"-fixtures.json",gunzipSync(fs.readFileSync("validation/evidence/collision/geometry-cost-quality-2026-10-05/"+stage+"-fixtures.json.gz")));'
node scripts/validation/collision/run.mjs --input=build/validation/collision/replay/baseline-fixtures.json
node scripts/validation/collision/run.mjs --input=build/validation/collision/replay/followup-fixtures.json
node scripts/validation/collision/check-query-margins.mjs --input=build/validation/collision/replay/followup-fixtures.json
```

Run one benchmark process at a time; ordinary user work may continue. This
historical harness cannot qualify speed under the new policy without further
instrumentation. Default timing is eleven rounds with a 20 ms calibration
target and a 1,000-repetition cap; actual blocks can be shorter. `--rounds`,
`--block-ms` and `--output` can override the timing configuration.
`--node` selects Node instead of headless Chrome. New results get dated output
folders. The active runner supports both recorded candidate sets; frozen source
snapshots are inspection artifacts and are not runnable from their evidence
paths. New source hashes and timing conditions belong to the replay, not to the
original measurement.

## Generate new comparisons

```sh
node scripts/validation/collision/run.mjs --prepare-only
node scripts/validation/collision/prepare-followup.mjs --input=PATH_TO_NEW_FIXTURES --extra-model=public/aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_HilosRun.glb --extra-id=sf50-hilosrun
```

The first command prints the dated fixture output. The second prints its own
reduced comparison output; substitute that path into `run.mjs --input=...`.
The preparation tool exposes comparison candidates, hybrid candidates, plane
workloads and support-check tolerance as arguments. Full hull support comes
from `hulls-1`, not from a potentially incomplete highest point budget.

To regenerate the recorded CoACD families, use Python 3.14 with the pinned
packages. The wrapper compiles its macOS native worker limit under `build/`
and verifies both libc++ and embedded TBB limits before generating geometry.

```sh
python3 -m venv build/tools/collision-python
build/tools/collision-python/bin/python -m pip --isolated install --cache-dir build/tools/pip-cache coacd==1.0.14 numpy==2.5.3
node scripts/validation/collision/run-coacd.mjs --input=PATH_TO_AIRCRAFT_MESH_JSON --output=build/validation/collision/new-coacd.json --budgets=16,32 --max-workers=5
node scripts/validation/collision/run-coacd.mjs --input=PATH_TO_AIRCRAFT_MESH_JSON --output=build/validation/collision/new-coacd-compact.json --budgets=16,32 --max-workers=5 --max-hull-vertices=32
```

Mesh JSON files are emitted during ordinary fixture preparation. To add these
artifacts to a comparison, name them `<aircraft-id>-coacd.json` and
`<aircraft-id>-coacd-compact.json` in one directory and pass
`run.mjs --input=... --coacd-directory=...`. Source asset hashes must match.
The wrapper's default worker budget is half the host's logical cores; an
explicit budget cannot exceed that limit. CoACD settings and source hashes are
stored alongside each result. Its fit threshold and requested hull count do
not constitute an original-surface coverage guarantee.
