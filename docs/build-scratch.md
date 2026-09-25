# What is in build/

`build/` in 0sfs, FOSS Earth and JSBSim is gitignored and never distributed, but
it is not all scratch. It holds working material for open upstream PRs and for
planned work, and the only copies of runs that the docs cite. Nothing is deleted
from it without the user agreeing to each folder. This page says what the large
folders are for and what would have to be true before each could go.

Sizes as of 2026-09-25.

## JSBSim (`/Users/felg/gh/Felipegalind0/jsbsim/build`, 18 GB)

| Folder | Size | For | Could go when |
| --- | --- | --- | --- |
| `wheel-spin-review` | 13 GB | #1502's trace comparisons at `499c3832`. Summaries and hashes are in `validation/evidence/jsbsim/wheel-spin-review/`; `scripts/validation/jsbsim/wheel-spin-review/compare_scripts.py --trace` regenerates the traces from the `pr1502*` builds in about 3.5 minutes. | #1502 merges, or the user prefers regenerating on request to keeping 13 GB. |
| `pr1502`, `pr1502-cxx`, `pr1502-probe`, `pr1502-base`, `pr1502-final-original` | 300 MB | The #1502 binaries whose hashes the evidence records, and the input to regenerating the traces. | #1502 merges. |
| `pr1505-off-engine-20260919`, `pr1508-off-engine-20260919` | 440 MB | The binaries behind the recorded results of the #1505 and #1508 repairs, not yet pushed. | Both PRs merge. |
| `turbine-init-01-20260919` | 580 MB | Stage 1 of the turbine initialization plan: the characterization build and probes. Stage 3 is pending. | The turbine work is done. |
| `upstream-submission-native` | 1.2 GB | The #1506 submission: ASAN and Python builds, and the tarballs. | #1506 merges. |
| `upstream-submission-wasm` | 360 MB | The #1507 submission tree, its consumer checks and a bundle of the contribution branches. | #1507 merges. |
| `reload-asan` | 250 MB | Reproduces the #1506 defect. | #1506 merges. |
| `tank-temp` | 90 MB | #1511. | #1511 merges. |
| `pr1502-preserved-wasm` | 1.6 GB | What was left of `wasm/`'s old build products: intermediate compiles and captured sources of earlier fork builds. Fork.7's artifact, descriptor and source moved back to `wasm/build/`. | The user confirms no earlier fork build is needed. |
| `master-20260925`, `ccache`, `native` | 100 MB, up to 2 GB | The development build of `master`, the compiler cache ([JSBSim](jsbsim.md)), and the build `scripts/validation/aircraft/diagnose-fdm-native.py` runs. | Kept. |

Outside `build/`, the gitignored `wasm/build/` holds the fork.7 WASM artifact.
A WASM rebuild is a full Emscripten compile and does not reproduce the same hash.

## 0sfs (`/Users/felg/gh/0sfs/build`, 7.2 GB)

| Folder | Size | For | Could go when |
| --- | --- | --- | --- |
| `competitors` | 3.2 GB | Source of the simulators in [Open-source competitors](open-source-competitors.md), read for [Competitor performance techniques](competitor-performance.md): the reference for improving 0sfs and FOSS Earth. | That work no longer needs it. |
| `fg-aircraft-inventory`, `fg-aircraft-inventory-2026-09-19` | 160 MB | The FlightGear catalogue, models and smoke results behind [FlightGear aircraft](flightgear-aircraft.md) and the import proposal. | The import is done or dropped. |
| `marimo-research-2026-09-19` | 90 MB | The FlightDynamicsCalcs clone and notes for the [marimo prompt](marimo-wasm-jsbsim-handoff-prompt.md). | That work is done or dropped. |
| `research` | 17 MB | Partial SimGear and FlightGear snapshots. | The user says so. |
| `profile-flight` | 840 MB | The only record of the frame-budget measurements of the attitude indicator and globe renderers; no doc has the numbers. | The numbers are recorded in a doc or `validation/evidence/`. |
| `map-detail-flight-probe` | 750 MB | The 0sfs flight runs that FOSS Earth's map detail specification and settings proposal cite. | They are retained as evidence. |
| `validation` | 177 MB | Local command logs and reports that [JSBSim](jsbsim.md) cites for the fork adoptions. | Kept. |
| `tools`, `dev-certs`, `benchmarks` | 50 MB | Playwright and `tools/jsbsim-py`; the `dev:lan` certificate the iPhone trusts; generated audio benchmark fixtures. | Kept. |
| `verify` | 1.8 GB | Snapshot trees from a 2026-09-24 commit verification. | Finished. |
| `attitude-indicator`, `phone-layout` | 95 MB | Contact sheets and dated screenshots. | Finished, except the latest of each. |

## FOSS Earth (`/Users/felg/gh/foss-earth/build`, 265 MB)

| Folder | Size | For | Could go when |
| --- | --- | --- | --- |
| `map-detail` | 150 MB | The map detail investigation and release runs. The specification links `validation/evidence/map-detail/`, which was never assembled from `final2-binding` and `final2-sweep`. | The evidence is assembled. |
| `benchmarks` | 63 MB | `raster-repro`, the reproduction of the raster bounds defect in `docs/performance-pass.md`, and the map detail binding runs. | The user says so. |
| `tools` | 13 MB | Playwright. | Kept. |
