# Application checks

The final `npm run ci` passes **175 files, 1893 tests and one existing expected
failure**, followed by artifact verification, incremental typecheck and the
production build. See `ci-final.log`. No WASM was rebuilt: the installed SDK and
audio artifacts were verified. No browser, server, GPU run or benchmark was used.

`inputs.json` identifies the checked runtime and tests with retained snapshots
and hashes. The initial related run passed 851 tests and found one stale
expectation for the newly normalized scene light. `domain-followup.log` retains
its corrected focused pass. A later review found that Babylon's physical
falloff ignores positive range for PBR, so the aircraft's approximate light now
uses a finite-range taper. `light-range-followup.log` passes **8 files and 140
tests** after that change. Incremental typechecks pass in both retained logs.

`ci.log` retains the preceding full CI pass before that late range correction.
`ci-final.log` is the final run after it. Both logs are preserved; final claims
use the latter. Lint passes, including the newly added diagnostics.

Subsequent CPU-producer audits corrected missing AB parcel inputs in the posed
ray diagnostic and a pressure-property spelling in the receiver diagnostic.
Their new runs/equivalence receipt are retained separately; no runtime or test
source changed after CI. `lint-producer-followup.log` retains the successful
incremental lint after those producer corrections.

Tests check source-table use, source power, unchanged temperature/loading,
zero-fuel behavior, mode-flag invariance, white-reference and range controls,
exterior-only light accounting, shader resource setup and lifecycle. They do
not establish F135 calibration, GPU accuracy or visual acceptance. Separate
[posed-ray](../runtime-source/README.md) and
[receiver](../receiver/README.md) numerical records retain failed refinement
criteria explicitly. **A passing application suite is not a claim that those
physical/appearance requirements are complete.**
