# PR #1508 off-engine fuel repair: retained evidence, 2026-09-19

Stage 2 of the [turbine initialization plan](../../../../../docs/turbine-initialization/plan.md).
Interpretation is in the [stage report](../../../../../docs/turbine-initialization/reports/02-pr1508-repair.md).
Raw run output stayed in the JSBSim gitignored
`build/pr1508-off-engine-20260919/`; only the records below were retained.

Three labeled sources, all local, none pushed:

| Label | Commit | What it is |
| --- | --- | --- |
| `original` | `7511df10cda909c32dfc378dfde204eb44dc5a48` | the published #1508 head |
| `spool-only` | `c803eeef9ae7479d450109266213b189da729af2` | #1508 with the reviewed #1505 repair cherry-picked onto it, its `Trim()` conflict resolved, and nothing else |
| `final` | `8945b0e34ddc85df1d324dffbe39d0732b03197d` | the candidate: the same plus the guarded fuel correction and its tests |

## Files

| File | What it holds |
| --- | --- |
| `provenance.json` | commits, per-file SHA-256 at every reference, extension hashes and mtimes, toolchain and build options |
| `starting-state.txt` | branch, HEAD, clean status and local/remote/GitHub #1508 heads recorded before any change |
| `module-identity.txt` | `jsbsim.__file__`, extension path and SHA-256 read from each build's own environment |
| `candidate.patch` | `git format-patch 7511df10..8945b0e3`: both commits of the candidate stack |
| `fgturbine-vs-pr1508.diff` | the engine change against the published #1508 head |
| `fgturbine-fuel-guard.diff` | the fuel change alone, against the spool-only control |
| `original-TurbineTrim.log` | the candidate's test source on the published #1508 head: spool 3 tests/10 failures, fuel 5 tests/22 failures |
| `spool-only-TurbineTrim.log` | the same source on the spool-only control: spool 3 tests/2 failures, fuel 5 tests/14 failures, every one of them a fuel-state assertion |
| `final-TurbineTrim.log` | the candidate: both targets pass |
| `final-affected-suite.log` | 18 discovered affected targets on the candidate |
| `final-scripts-suite.log` | `CheckScripts`, `CheckAircrafts`, `TestScriptOutput` on the candidate |
| `final-full-suite.log` | the full discovered suite on the candidate, Python enabled |
| `final-nopython-suite.log` | the native suite on the candidate with `BUILD_PYTHON_MODULE=OFF` |
| `thrust-comparison.{json,md}` | zero-time `Trim()` thrust across the three builds, twelve cases |
| `fuel-comparison.{json,md}` | zero-time fuel state and following-frame consumption across the three builds, eighteen cases |

## Follow-up, same day

Review asked for two more checks before stage 2 is marked reviewed. They
changed no production code — `FGTurbine.cpp` still hashes `32c87c0c…` and all
three extensions above are byte-identical to the ones the originals were
measured on — so the same binaries were reused. The files above are the
original records and were not rewritten; these were added beside them.

| File | What it holds |
| --- | --- |
| `followup-provenance.json` | the follow-up commit, file hashes, the reused binary hashes and the checks that they still match |
| `followup-test.diff` | the test change alone, `8945b0e3..482da811` |
| `followup-original-TurbineTrim.log` | the extended test source on the published #1508 head: spool 3 tests/10 failures, fuel 6 tests/33 failures |
| `followup-spool-only-TurbineTrim.log` | the same on the spool-only control: spool 3/2, fuel 6/21, every one a fuel-state assertion |
| `followup-final-TurbineTrim.log` | the candidate: both targets pass |
| `followup-final-affected-suite.log` | the 18 affected targets rerun with the extended tests |
| `followup-final-full-suite.log` | the full discovered suite rerun with the extended tests |
| `followup-copyto-comparison.{json,md}` | 24 cases across the three builds, now including the `copyto` sentinels and a fourth engine variant |

The added regression samples the shutdown 24 frames after `cutoff_cmd`, where
the engine is off but still delivering 791.19 gph, rather than after the flow
has settled to zero. The `copyto` measurement uses sentinel properties created
before `load_model` and reset before each observed call; the ATSFC property is
never read while they are being observed, because its getter evaluates the
function. All 18 rows shared with `fuel-comparison.json` are numerically
identical in the new run, so the sentinels are inert.

## Reproducing

The two comparison tables come from the retained downstream tools

- [`trim_thrust_compare.py`](../../../../../scripts/validation/jsbsim/engine-off-trim/trim_thrust_compare.py)
  (unchanged since stage 0),
- [`trim_fuel_compare.py`](../../../../../scripts/validation/jsbsim/engine-off-trim/trim_fuel_compare.py)
  (added by this stage; `fuel-comparison.*` came from it before the follow-up
  added the `copyto` sentinels and the fourth variant, `followup-copyto-comparison.*`
  from it after),

each invoked with `--source <jsbsim> --build original=… --build spool-only=… --build final=…`
and an explicit `--output` inside the JSBSim `build/` tree. Both sandbox their
engine XML copies under that output directory; repository aircraft and engine
data were not modified.

## Independent re-verification

[`reverify-2026-09-19.md`](reverify-2026-09-19.md) records a later run that
changed no source and re-executed every gate against the same three preserved
builds, whose extension hashes still match `provenance.json`. All of them
reproduced, and both comparator outputs diff empty against the retained tables.

| File | What it holds |
| --- | --- |
| `reverify-2026-09-19.md` | the re-verification record: identities checked, each gate recorded against its re-run, and the constraints re-confirmed |
| `reverify-per-test.log` | each of the nine tests run on its own against all three builds |
| `reverify-run-one.py` | the driver for that, which selects one test without the script's module-level `RunTest` running the whole case |

The per-test log is the sharper form of the stage's claim: every new fuel test
fails individually on both earlier sources and passes on the candidate, while
every pre-existing running test passes on all three.
