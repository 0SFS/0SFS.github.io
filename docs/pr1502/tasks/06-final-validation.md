# Final validation: compare the completed PR candidate

This is verification only, after the five implementation tasks. Run it on a
user-launched cheaper agent; do not launch other agents. The planner retains
numerical acceptance, the final combined-diff review and public reply wording.
There is no implementation change or commit to make in this task.

## Goal and starting state

Run the retained 61-input comparison against the final committed candidate,
base, original PR and measured solver probe. Demonstrate that the completed
round adds no disabled-wheel numerical difference beyond the reviewed common
Jacobian cleanup. This supplies the final measurement for review thread
4047612197 (removing LeverArm), the round comment and the corrected PR body.

Read `/Users/felg/gh/0sfs/AGENTS.md`, `docs/validation/layout.md` and
`docs/pr1502/plan.md`. JSBSim repository:
`/Users/felg/gh/Felipegalind0/jsbsim`; branch `feature/wheel-spin-dof`; exact
starting HEAD `499c38326bb6f39b6360bd82d74c5c00e64faeaf`. Require all five tasks
reviewed and the planner's `build/pr1502-handoff/05.json` approving that SHA.

```sh
cd /Users/felg/gh/Felipegalind0/jsbsim
.venv/bin/python - <<'CHECK'
import json, subprocess
from pathlib import Path
expected = '499c38326bb6f39b6360bd82d74c5c00e64faeaf'
assert subprocess.check_output(['git', 'status', '--porcelain'], text=True) == ''
assert subprocess.check_output(['git', 'branch', '--show-current'], text=True).strip() == 'feature/wheel-spin-dof'
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == expected
r = json.loads(Path('build/pr1502-handoff/05.json').read_text())
assert r['task'] == '05' and r['approved'] is True and r['commit'] == expected
CHECK
```

Stop for missing approval, unexpected HEAD or a dirty JSBSim tree. Do not
switch, reset or repair history. 0sfs has unrelated uncommitted work; preserve
it. Work only in the owning repository: JSBSim scratch/archives/builds/raw
outputs in its gitignored build/, 0sfs scratch in its build/, retained results
in `/Users/felg/gh/0sfs/validation/evidence/jsbsim/wheel-spin-review/final/`.
No `/tmp`, `/var/folders`, harness scratchpad, server or visible browser.
Do not put runnable source in docs or the evidence directory. Any small new
analysis helper is scratch unless explicitly retained under
`0sfs/scripts/validation/jsbsim/wheel-spin-review/`.

## Reuse reviewed tests and pin artifacts

The planner has reviewed task 05's exact candidate test evidence: Python ON
79/79, including the nine-method wheel test and eight-method native test;
Python OFF 21/21 CxxTests; post-commit unchanged builds and 2/2 plus 21/21
passes. Source and mutation controls were independently reviewed. Do not
repeat those suites while the source and artifacts still match the receipt.
Read the receipt and task05/review.md; record which existing results you reuse
and their tested source. Do not present reused results as fresh runs.

Verify the receipt's `binary_sha256` and `source_sha256` entries against current
files. Confirm both CMake caches refer to the canonical source, Release and
the recorded Python ON/OFF settings. Record current compiler/CMake/Python
versions, source commit, clean status and artifact hashes. If these do not
match, stop and report; do not silently rebuild or accept a different input.

The retained harness is
`/Users/felg/gh/0sfs/scripts/validation/jsbsim/wheel-spin-review/compare_scripts.py`.
It must hash to
`76aa5a7f0edcb3dec75b41827c82bb52b7d901144d4bb40a43148e6a9b11e32c`.
Do not modify it or the baseline to obtain a match.

Reference binaries already exist; verify these SHA-256 values before reuse:

| Label | Path under JSBSim | SHA-256 |
| --- | --- | --- |
| base | `build/pr1502-base/src/JSBSim` | `cf0a75a6998a8728608775c05907378f5eac5fa51931b4ce4e16e6bb2419d825` |
| probe | `build/pr1502-probe/src/JSBSim` | `80a2f8f07eb239c486da1b5e21853ef39cc95865818d6071d8c97ca3587bcf22` |
| candidate | `build/pr1502/src/JSBSim` | `675f4f3968c852116629b23ca6b2d3dcd822de0ee3db512b0085e13ddb5ef88f` |

Missing/mismatched references are a stop-and-report condition. They must not
be replaced with fork master or a newly convenient binary. The evidence
README retains recovery recipes, but rebuilding these references would need
the planner to judge the new comparison provenance.

The old canonical build now contains the candidate; it is NOT the original
PR binary even though historical records used the same path. Build that
original PR from its exact archived commit in new directories:

```sh
cd /Users/felg/gh/Felipegalind0/jsbsim
# Require both paths absent; never overwrite/reuse an unknown archive.
test ! -e build/pr1502-final-original-source || exit 1
test ! -e build/pr1502-final-original || exit 1
mkdir build/pr1502-final-original-source
set -o pipefail
git archive 24e085bf81b5ef8bab8500ab9d416571753b93cc | tar -x -C build/pr1502-final-original-source
cmake -S build/pr1502-final-original-source -B build/pr1502-final-original \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_PYTHON_MODULE=OFF
cmake --build build/pr1502-final-original --target JSBSim -j8
```

These use the source-archive and Release/native build pattern verified during
planning; these new directory names have not been built before. Save configure
and build logs and exact exit statuses. Check the archived tracked inputs
against `git archive` and record the original source SHA and resulting binary
hash. Compile-time timestamps may differ from the old original binary hash;
do not claim this rebuild is that old artifact. Its emitted data must still
match the retained original outputs below. Missing optional PkgConfig,
Doxygen or LSB_Release messages in this environment do not constitute a
compiler failure. Any actual build error is a stop-and-report condition.

## Run the final comparison once

Confirm `aircraft/`, `engine/`, `systems/` and `scripts/` have no tracked
changes from original `24e085bf`, and that shipped aircraft do not declare
`wheel_radius` or `wheel_inertia`. Do not modify models. All opt-in wheels
used by TestWheelSpin live in sandboxed test fixtures.

Ensure enough free disk space for retained raw output: the earlier three-
binary run used about 10 GB, and this one has four binaries. Do not delete
earlier evidence or scratch to free space without user instruction. Finish
all builds before comparing; do not run competing CTests or simulations.

```sh
cd /Users/felg/gh/0sfs
python3 scripts/validation/jsbsim/wheel-spin-review/compare_scripts.py \
  --source /Users/felg/gh/Felipegalind0/jsbsim --trace --jobs 8 \
  --binary base=/Users/felg/gh/Felipegalind0/jsbsim/build/pr1502-base/src/JSBSim \
  --binary head=/Users/felg/gh/Felipegalind0/jsbsim/build/pr1502-final-original/src/JSBSim \
  --binary probe=/Users/felg/gh/Felipegalind0/jsbsim/build/pr1502-probe/src/JSBSim \
  --binary candidate=/Users/felg/gh/Felipegalind0/jsbsim/build/pr1502/src/JSBSim
```

The harness defaults to a new dated directory under JSBSim
build/wheel-spin-review/, with separate working directories for each binary
and script. Retain that path and console output. No `--only`, shortened run,
coarser trace or normalization of data is allowed. The trace rate is 1/dt;
do not change it to 1000 Hz. Inspect summary.json; a zero harness exit alone
does not certify matching outputs.

## Acceptance and evidence

- All 61 XML inputs must run for each of the four binaries. The established
  classification is 57 successful runscripts, one trim failure
  (`737_cruise_steady_turn_simplex.xml`, exit 1), and three non-runscript inputs
  (`kml_output.xml`, `unitconversions.xml`, `plotfile.xml`, exit 255).
  Timeouts, new exits or a missing input are failures.
- All 102 emitted data files per binary must be accounted for. Head/base
  must match byte-for-byte; candidate/probe must match byte-for-byte, including
  file sets/sizes/statuses. Compare base/head/probe file hashes and script
  hashes with retained `per-step-summary.json`, not just with each other in
  this run. Candidate/probe tolerance is exactly zero.
- Base/candidate differences should reproduce the accepted base/probe
  differences: 60 of 102 files across 31 of 57 successful simulations.
  Check every recorded per-file diagnostic against the retained comparison,
  not merely the count. No output-shape or nonfinite mismatch is accepted.
  The existing c1723 saved-init XML is a text_mismatch in the CSV diagnostic;
  preserve its exact hash comparison and identify that diagnostic limitation.
- Report the representative state/force differences for c172_cross_wind,
  c1723, ZLT-NT-moored-1 and f16_test. Large F-16 divergence after severe
  impacts is the previously reviewed result, not a universal acceptable
  tolerance. Do not characterize every numerical difference as tiny or decide
  on your own that a new one is harmless. Stop and report any new discrepancy.
- Record final clean HEAD and binary hashes again after the run. If source
  or an input artifact changed during execution, do not claim final validation.

Copy the unmodified final summary.json, comparison stdout, original-head
build logs and a concise provenance/README record into the final/ evidence
directory. Preserve the historical summaries and task folders. Keep raw
multi-gigabyte outputs in build/. The report must distinguish freshly run
script comparisons, newly built original head, reused references and reused
test results. Record source SHA, file/artifact hashes, toolchain, exact
commands, exit statuses, counts, differences and all uncertainties.

Test caveat if unexpected circumstances require a separately authorized
rerun: TestInputSocket historically times out in telnetlib3 both with and
without the PR; sandbox PermissionError is a different failure and may need
execution-tool loopback permission. TestActuator has a timed subprocess
which once failed under competing load; an unchanged idle single rerun
passed. Both passed first time in task 05. Never alter them or label an
unexplained failure as a known flake.

## Stop and report

No commit, push, rebase, amend, branch switch, package update, GitHub action,
approval receipt or edits to replies.md. Do not run further tasks. Leave
retained 0sfs evidence uncommitted. Return the measured results for the
planner to inspect and use in the final public drafts. No new implementation
is authorized by this verification handoff.
