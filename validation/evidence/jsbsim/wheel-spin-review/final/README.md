# Final 61-input comparison: 2026-09-19

**Planner review complete: accepted for this PR round** at `499c3832`.
See the [review and numerical decision](review.md) and
[independent verification record](review-verification.json). The execution
record below is preserved; its references to pending judgment describe the
handoff before that review.

Publication update: the reviewed commits, nine thread replies, round comment
and replacement body are now published. See the
[verified publication record](publication-actions.json) for comment URLs.
The measurements and historical provenance below are unchanged.

This directory holds the measurements for the
[final validation handoff](../../../../../docs/pr1502/tasks/06-final-validation.md).
It records measurements only. Numerical acceptance, the final combined-diff review
and public wording remain with the planner. No JSBSim commit, push, rebase,
branch switch or GitHub action was made. Nothing in the JSBSim source or model
inputs was modified.

## What is fresh and what is reused

| Item | Status |
| --- | --- |
| Original PR head `24e085bf` binary | **Newly built** in new directories from `git archive`; binary `a6f60869…` |
| 61-input traced comparison, four binaries | **Freshly run once**, full length, `--trace`, no `--only` |
| Post-run checks against retained `per-step-summary.json` | **Fresh** (scratch helper; see below) |
| F-16 divergence diagnostic | **Fresh**, retained `inspect_f16.py`, unmodified |
| Base `cf0a75a6…`, probe `80a2f8f0…` binaries | **Reused** from planning, hash-verified before and after |
| Candidate `675f4f39…` binary | **Reused** from tasks 03–05, hash-verified against `05.json` before and after |
| Python ON 79/79, TestWheelSpin, FGAccelerationsTest1, Python OFF 21/21, post-commit 2/2 and 21/21 | **Reused, not rerun.** Tested source `499c3832`, per `05.json` and [task05/review.md](../task05/review.md) |

The reused tests still apply: all eight `source_sha256` and four
`binary_sha256` entries in `05.json` matched the current files before and after
the run. The CMake caches still point at the canonical source, and both are
Release: `build/pr1502` has Python ON with `.venv/bin/python`, and
`build/pr1502-cxx` has Python OFF.

## Identities

- Candidate: `499c38326bb6f39b6360bd82d74c5c00e64faeaf` on
  `feature/wheel-spin-dof`. The tree was clean and HEAD unchanged before and
  after the run. `05.json` approves this exact SHA.
- The `aircraft/`, `engine/`, `systems/` and `scripts/` trees at the candidate
  equal those at `24e085bf`. No ignored or untracked files exist under them,
  and all 61 `scripts/*.xml` are tracked. No shipped model declares
  `wheel_radius` or `wheel_inertia`; only source files and the sandboxed
  `TestWheelSpin.py` fixture do.
- Harness `compare_scripts.py`: SHA-256
  `76aa5a7f0edcb3dec75b41827c82bb52b7d901144d4bb40a43148e6a9b11e32c`,
  unchanged.
- Toolchain: macOS 27.0 (26A428) arm64, Apple clang 21.0.0
  (clang-2100.3.34.2), CMake 4.4.3, Python 3.14.7 (the Homebrew `python3` ran
  the harness; `.venv` has the same version). This is the same toolchain
  recorded in [provenance.json](../provenance.json).
- [provenance.json](provenance.json) gives every hash, command, exit status and
  UTC timestamp.

## Original PR head rebuild

The commands are the ones from the handoff, and both target paths were checked
absent first. Every one of the 1358 `git ls-tree` entries of `24e085bf`
matched its extracted file by `git hash-object`, and executable bits matched.
There were no extra files
([log](original-head-archive-verify.log)). Exit statuses: extract 0,
configure 0 and build 0. The configure log prints only the optional
PkgConfig, Doxygen and LSB_Release notices. The build compiled 104 C++ and
5 C objects from the archive with no warnings, and no compiler launcher is
configured. See the [configure log](original-head-configure.log) and
[build log](original-head-build.log).

The resulting binary `a6f6086905f0d1d8930799cfea999782a88e2b385ef75abefa42d8324931a570`
is **not** the historical head artifact `0830fdb8…`. Its emitted data matches
that artifact's retained outputs byte-for-byte (below).

## Comparison run

```sh
cd /Users/felg/gh/0sfs
python3 scripts/validation/jsbsim/wheel-spin-review/compare_scripts.py \
  --source /Users/felg/gh/Felipegalind0/jsbsim --trace --jobs 8 \
  --binary base=/Users/felg/gh/Felipegalind0/jsbsim/build/pr1502-base/src/JSBSim \
  --binary head=/Users/felg/gh/Felipegalind0/jsbsim/build/pr1502-final-original/src/JSBSim \
  --binary probe=/Users/felg/gh/Felipegalind0/jsbsim/build/pr1502-probe/src/JSBSim \
  --binary candidate=/Users/felg/gh/Felipegalind0/jsbsim/build/pr1502/src/JSBSim
```

The harness exited 0 with empty stderr. It ran from 18:11:46Z to 18:15:10Z on
an otherwise idle machine, and no builds or tests competed with it.
[summary.json](summary.json) is the unmodified harness summary (SHA-256
`c2abd0ce…`). [comparison-stdout.log](comparison-stdout.log) is its console
output. The raw outputs (about 14 GB) remain in JSBSim scratch and are not
retained.

## Results

All checks below passed ([analysis.json](analysis.json)).

- **Runs:** 244 runs, 61 per binary. Every binary has 57 exits of 0; exit 1 for
  `737_cruise_steady_turn_simplex.xml` (trim); and exit 255 for `kml_output.xml`,
  `unitconversions.xml` and `plotfile.xml`. There were no timeouts and no
  missing inputs. All 58 runscripts produced a nonempty trace for every binary.
- **Files:** 102 data files per binary. Trace data rows total 11,877,246 per
  binary, 13 of them in the failed-trim input. Both figures equal the retained
  run.
- **Head vs base:** all 61 scripts byte-identical, with equal exits.
- **Candidate vs probe:** all 61 scripts byte-identical: the same file sets,
  sizes, SHA-256 and exits. **No difference at zero tolerance.**
- **Against the retained run:** the script set and hashes equal those in
  [per-step-summary.json](../per-step-summary.json). The per-script file
  maps (hash and size) and exits match the retained records for base against
  base, head against head, probe against probe, and candidate against the
  retained probe.
- **Base vs candidate:** 60 of 102 files differ, across 31 of the 57
  successful simulations. All four non-successful inputs and 26 successful
  runs are identical. Every per-file diagnostic (rows, first changed
  row/time, maximum by column, text/non-finite flags) equals the retained
  base/probe diagnostic for every script. Head vs candidate likewise equals
  the retained head/probe diagnostic.
- **Shape:** no missing file, header, shape or non-finite mismatch in any of the
  six pairs.
- **F-16:** `inspect_f16.py` on base/probe, and on base/candidate through a
  symlinked view that maps `probe` to the candidate outputs, both print output
  byte-identical to the retained [f16-divergence.json](../f16-divergence.json).

## Representative base/candidate differences

These are maximum absolute differences in the per-step trace. They equal the
retained base/probe values.

| Run | First diff t (s) | Rows differing | u (ft/s) | θ (rad) | h (ft) | Gear Fx (lbf) | Other notable |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `c172_cross_wind` | 0 | 3003 / 3003 | 0.054043 | 3.6853e−4 | 0.0023394 | 197.33 | q 0.017581 rad/s; gear Fz 148.77 lbf; gear M 1358.7 lbf·ft |
| `c1723` | 0 | 23994 / 24002 | 0.0025166 | 4.4618e−5 | 0.0071976 | 3.7558e−6 | v 0.0095974 ft/s; p 0.0027351 rad/s; φ 3.121e−4 rad |
| `ZLT-NT-moored-1` | 0.00625 | 220465 / 230402 | 9.7489e−5 | 1.5745e−7 | 1.4622e−5 | 67.311 | gear Fy 443.29 lbf; gear N 20929 lbf·ft; gear L 9490.1 lbf·ft |
| `f16_test` | 0 | 84003 / 84003 | 71.644 | 0.23604 | 17.819 | 179038 | w 177.73 ft/s; q 1.8291 rad/s; gear M 2.7556e6 lbf·ft |

In the natural outputs of `c172_cross_wind`, `cross_wind.csv` differs by up to
197.33 lbf in gear Fx, 3246 ft·lbf in total pitching moment and 123.59 deg/s²
in Q dot. `JSBout172B.csv` differs by up to 28.8 in Reynolds number.
`summary.json` has the full per-column maxima for every file.

The F-16 result is the previously reviewed post-impact divergence. u first
differs by more than 1e−6 ft/s at 127.908 s, with base gear Fx
−2,109,821 lbf. The largest u difference is at 185.033 s. This does not
establish a general tolerance. The gear force and moment differences for ZLT
and crosswind above are not small in absolute terms either. This record
characterizes none of these differences as harmless; that judgment belongs to
the planner.

## Diagnostic limitations

- **c1723 saved-init XML.** `initfile.133.441667.xml` is compared by exact hash:
  base and head `0973ec83…` (696 bytes), probe and candidate `35ecfa9a…`
  (697 bytes). All four hashes equal the retained records. The harness parses it
  as CSV, so its diagnostic reports only `text_mismatch` for 9 of 27 lines.
  It does not report a numerical magnitude. The actual changes are orientation
  (yaw, pitch, roll in degrees), local velocity (x, y, z in ft/s) and body
  attitude rate (deg/s); see the [text diff](c1723-initfile-base-candidate.diff).
  For example, roll changes from −0.716589 to −0.717267 deg, and
  velocity y from −23.3852 to −23.3841 ft/s.
- **Angle wrap.** The harness takes raw absolute differences. The maxima of
  6.2832 rad for ψ in `c172_cross_wind` and `ZLT-NT-moored-1`, and for φ in
  `f16_test`, are 2π wrap artifacts. That is 1, 13 and 96 rows respectively.
  Wrap-corrected maxima: crosswind ψ 6.258e−6 rad, ZLT ψ 2.730e−6 rad and
  F-16 φ 0.030706 rad ([angle-wrap.json](angle-wrap.json)). The retained
  base/probe diagnostic has the same artifact.
- Byte identity and the diagnostics hold for this compiler, architecture and
  input set only. Console banners and timings are excluded from data
  identity, as in the retained runs.

## Analysis helpers

- `0sfs/build/pr1502-final-validation/analyze_final.py`
  (SHA-256 `920b8d1c…`) produced `analysis.json` from the new
  `summary.json` and the retained `per-step-summary.json`. It only reads them.
  After review the planner retained that exact file, with its mode, at
  [scripts/validation/jsbsim/wheel-spin-review/analyze_final.py](../../../../../scripts/validation/jsbsim/wheel-spin-review/analyze_final.py).
  The historical command and scratch path in provenance remain unchanged.
- An inline scratch script produced `angle-wrap.json` from the raw base and
  candidate traces. The reviewer independently recomputed its shortest
  angular differences as `abs((a - b + pi) % (2*pi) - pi)`.

## Files

| File | Content |
| --- | --- |
| `summary.json` | Unmodified harness summary |
| `comparison-stdout.log` | Harness console output (stderr was empty) |
| `original-head-configure.log`, `original-head-build.log` | Original-head rebuild logs |
| `original-head-archive-verify.log` | Archive/blob verification |
| `analysis.json` | Post-run checks, pair counts and representative diagnostics |
| `angle-wrap.json` | Wrap-corrected attitude differences |
| `c1723-initfile-base-candidate.diff` | Text diff of the saved-init XML |
| `provenance.json` | Hashes, toolchain, commands, statuses, pre/post snapshots, reused tests |
