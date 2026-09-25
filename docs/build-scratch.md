# Build scratch: what stays

`build/` in 0sfs, FOSS Earth and JSBSim is gitignored scratch, and it is
disposable. Delete a run's output once its results are recorded in git. A folder
stays only while it is listed here with a reason; when the reason ends, delete
the folder and its row. JSBSim's pinned PR builds go when their PR merges or
closes.

Reviewed 2026-09-25, when JSBSim's `build/` held 19 GB and 0sfs's 7.2 GB, most of
it regenerable. Everything not listed below may be deleted.

## JSBSim (`/Users/felg/gh/Felipegalind0/jsbsim/build`)

| Folder | Size | Why it stays |
| --- | --- | --- |
| `master-20260925` | 50 MB | The development build of `master`; reuse it. See [JSBSim](jsbsim.md). |
| `ccache` | up to 2 GB | Compiler cache shared by every native build. |
| `native` | 48 MB | `scripts/validation/aircraft/diagnose-fdm-native.py` runs it. |
| `pr1502`, `pr1502-cxx`, `pr1502-probe`, `pr1502-base`, `pr1502-final-original` | 300 MB | #1502 is open. The evidence in `validation/evidence/jsbsim/wheel-spin-review/` records these binaries' hashes, and `scripts/validation/jsbsim/wheel-spin-review/compare_scripts.py --trace` regenerates the 13 GB of traces from them in about 3.5 minutes. |
| `pr1505-off-engine-20260919`, `pr1508-off-engine-20260919` | 440 MB | The binaries behind the recorded results of the #1505 and #1508 repairs, which are not pushed yet. |
| `tank-temp` | 90 MB | #1511 is open. |
| `reload-asan` | 250 MB | Reproduces #1506, which is open. |

Outside `build/`, keep the gitignored `wasm/build/` (220 MB): the fork.7 WASM
artifact, its build descriptor and captured source. A WASM rebuild is a full
Emscripten compile and does not reproduce the same hash.

## 0sfs (`/Users/felg/gh/0sfs/build`)

| Folder | Why it stays |
| --- | --- |
| `tools` | Playwright and `tools/jsbsim-py`, which are not dependencies. |
| `dev-certs` | The `dev:lan` certificate the iPhone trusts; a new one would have to be trusted again. |
| `benchmarks` | Generated audio benchmark fixtures. |
| `validation` | 177 MB of local command logs and reports that [JSBSim](jsbsim.md) cites for the fork adoptions. |

## FOSS Earth (`/Users/felg/gh/foss-earth/build`)

| Folder | Why it stays |
| --- | --- |
| `tools` | Playwright. |
| `map-detail/final2-binding`, `map-detail/final2-sweep`, `map-detail/assemble-evidence.sh` | 48 MB. The runs behind the map detail release. The specification links `validation/evidence/map-detail/`, which was never assembled from them; keep them until it is. |
