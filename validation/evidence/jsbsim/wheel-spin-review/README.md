# Wheel-spin review evidence — 2026-09-18

This is planning evidence for [the next #1502 round](../../../../docs/pr1502/plan.md).
No implementation commits or public updates were made. The candidate here is
an explicitly limited **scratch solver probe**, not a finished review round.

## Identities and retained records

- Base: `d0d8bc6e9233a6c283898896d7bbac6d9af1888b`.
- Original PR: `24e085bf81b5ef8bab8500ab9d416571753b93cc`.
- Probe: archived original PR plus
  [make_solver_probe.py](../../../../scripts/validation/jsbsim/wheel-spin-review/make_solver_probe.py).
  It removes `LeverArm`/`UseMomentJacobian` and the duplicate solver paths,
  initializes ordinary moments as `r×U`, and uses the existing generalized
  arithmetic for all rows. It does not change names, bounds, properties or
  airborne physics.
- [provenance.json](provenance.json) records source/script hashes and toolchain:
  macOS 27 arm64, Apple clang 21.0.0, CMake 4.4.3, Python 3.14.7. Binary hashes,
  script hashes and exact run commands are in each comparison summary.
- `pr.json`, `review-comments.json`, `issue-comments.json`, `reviews.json`,
  `threads.json`, and `checks.json` are the read-only GitHub API snapshot.
  `upstream-compare.json` confirms the four newer upstream commits.
  `pr1491-files.json` verifies the cited CxxTest precedent.
- The runnable tools are in
  [`scripts/validation/jsbsim/wheel-spin-review/`](../../../../scripts/validation/jsbsim/wheel-spin-review/).
  They were in this directory, then at
  `docs/validation/evidence/jsbsim/wheel-spin-review/`, when the runs below
  were recorded; logs, `provenance.json` and the task 01 receipt keep those
  paths and hashes. The files moved byte-identical on 2026-09-19; see the
  [relocation record](../tool-relocation.md).
- This directory itself moved from `docs/validation/evidence/` to top-level
  `validation/evidence/` later on 2026-09-19, byte-identical apart from README
  links; see the
  [evidence relocation record](../../../../docs/validation/evidence-relocation-2026-09-19.md).

## Reproduction commands

The canonical checkout was checked clean before switching from `master` to
`feature/wheel-spin-dof`. These exact supplied build/test commands worked.
Commands below name each tool at its current path. The recorded runs used
byte-identical files at their former paths under
`docs/validation/evidence/jsbsim/wheel-spin-review/`; nothing was rerun for
either move.

```sh
cd /Users/felg/gh/Felipegalind0/jsbsim
# First perform the clean-branch setup in task 01; master was restored after planning.
test "$(git rev-parse HEAD)" = 24e085bf81b5ef8bab8500ab9d416571753b93cc || exit 1
cmake -S . -B build/pr1502 -DCMAKE_BUILD_TYPE=Release -DBUILD_PYTHON_MODULE=ON \
  -DPython3_EXECUTABLE=/Users/felg/gh/Felipegalind0/jsbsim/.venv/bin/python
cmake --build build/pr1502 -j
ctest --test-dir build/pr1502 -R TestWheelSpin --output-on-failure
ctest --test-dir build/pr1502 -j8 --output-on-failure
```

Logs `head-configure.log`, `head-build.log`, `head-wheel-ctest.log` and
`head-full-ctest-idle.log` record success: 1/1 focused target, 78/78 total.
The full run needed loopback access for `TestInputSocket`. The earlier
`head-full-ctest.log` records sandbox `PermissionError`; the standalone
`head-socket-unsandboxed.log` records its passing rerun. The historical
telnetlib3 timeout is a separate known caveat, not what failed in that run.

`head-full-ctest-unsandboxed.log` records one `TestActuator` timed-subprocess
failure while simulations/builds competed for CPU. Its timeout is 50 times a
reference duration measured within the test. The complete idle rerun passed;
no code/test/tolerance changes were made. Do not hide either earlier result.

The separate source/build directories were created under JSBSim `build/`:

```sh
cd /Users/felg/gh/Felipegalind0/jsbsim
# These directories must be new/empty; do not apply the probe twice.
mkdir -p build/pr1502-base-source build/pr1502-probe-source
git archive d0d8bc6e9233a6c283898896d7bbac6d9af1888b | tar -x -C build/pr1502-base-source
git archive 24e085bf81b5ef8bab8500ab9d416571753b93cc | tar -x -C build/pr1502-probe-source
python3 /Users/felg/gh/0sfs/scripts/validation/jsbsim/wheel-spin-review/make_solver_probe.py \
  build/pr1502-probe-source
cmake -S build/pr1502-base-source -B build/pr1502-base \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_PYTHON_MODULE=OFF
cmake --build build/pr1502-base --target JSBSim -j8
cmake -S build/pr1502-probe-source -B build/pr1502-probe \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_PYTHON_MODULE=OFF
cmake --build build/pr1502-probe --target JSBSim -j8
cmake --build build/pr1502-probe -j
ctest --test-dir build/pr1502-probe -R Test1 --output-on-failure
```

The last command passed 20/20 existing native targets; see
[probe-unit-ctest.log](probe-unit-ctest.log). Then Python was enabled on that
same probe and it passed the wheel target and all 78 targets:

```sh
cmake -S build/pr1502-probe-source -B build/pr1502-probe \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_PYTHON_MODULE=ON \
  -DPython3_EXECUTABLE=/Users/felg/gh/Felipegalind0/jsbsim/.venv/bin/python
cmake --build build/pr1502-probe -j
ctest --test-dir build/pr1502-probe -R TestWheelSpin --output-on-failure
ctest --test-dir build/pr1502-probe -j8 --output-on-failure
```

See [probe-wheel-ctest.log](probe-wheel-ctest.log) and
[probe-full-ctest.log](probe-full-ctest.log). The full suite used loopback
access, with no competing heavy jobs.

## Script comparison

[compare_scripts.py](../../../../scripts/validation/jsbsim/wheel-spin-review/compare_scripts.py)
is the retained harness. Its default output is a new dated folder inside the
source repository's `build/`, following
the repository output-directory convention. It gives every binary/script its
own working/output directory, runs the original XML without shortening or
editing it, records status, command, file sizes and SHA-256, and compares every
emitted data file. stdout/stderr are retained separately; timing/build banners
are not simulation data. Numerical diagnostics do not replace byte comparison.

Run on the exact PR-head aircraft/script corpus, using the recorded binaries:

```sh
cd /Users/felg/gh/0sfs
python3 scripts/validation/jsbsim/wheel-spin-review/compare_scripts.py \
  --source /Users/felg/gh/Felipegalind0/jsbsim \
  --binary base=/Users/felg/gh/Felipegalind0/jsbsim/build/pr1502-base/src/JSBSim \
  --binary head=/Users/felg/gh/Felipegalind0/jsbsim/build/pr1502/src/JSBSim \
  --binary probe=/Users/felg/gh/Felipegalind0/jsbsim/build/pr1502-probe/src/JSBSim
```

Repeat with `--trace` to append a per-step CSV containing position, body
velocity/rates, attitude and gear forces/moments. The XML directive rate is
`1/dt` for each script, not an arbitrarily large rate: this JSBSim version can
round an excessive requested rate to an internal scheduling interval of zero.
The harness rejects script dt below the output facility's 1000 Hz cap. No
shipped runscript hits that restriction. Directives load after the aircraft
and script outputs, preserving their existing output indices.

An initial diagnostic requested 1000 Hz for every script and produced some
header-only traces. That diagnostic was rejected, the harness was corrected,
and the full comparison rerun. It is not used for any final count or claim.

Durable results:

| Record | Result |
| --- | --- |
| [natural-output-summary.json](natural-output-summary.json) | Original/base data all identical; probe changes files from ten successful runs. |
| [per-step-summary.json](per-step-summary.json) | Original/base all 102 data files identical; probe changes files from 31 successful runs. Every runscript has a nonempty trace. |
| [repeat-summary.json](repeat-summary.json) | Same-binary repeats of crosswind and CG-shift inputs are byte-identical for head and probe. |
| [f16-divergence.json](f16-divergence.json) | Large F-16 divergence occurs after severe ground impacts; first u difference over 1e−6 ft/s occurs with approximately −2.11 million lbf gear Fx. |

All 61 XML inputs were attempted: 58 runscript roots (57 exit 0, simplex trim
exit 1), two output roots and a plotset (exit 255 when passed as scripts).
Identical failures are not treated as successful simulations. Per-step traces
contain 11,877,246 data rows per binary, including 13 initialization rows in
the failed-trim case. There are no differing data shapes, process outcomes or
non-finite mismatches. No universal numerical bound follows from those facts.

[`inspect_f16.py`](../../../../scripts/validation/jsbsim/wheel-spin-review/inspect_f16.py)
`<comparison-output-directory>` reproduces the retained F-16
diagnostic from the base/probe traces; its stdout was compared byte-for-byte
with `f16-divergence.json`.

The 11+ GB of raw outputs stay in gitignored scratch. These summaries retain
per-file hashes, statuses, first changed row/time, maximum absolute difference
by column, and shape/non-finite diagnostics. They plus the source/harness are
the reviewable evidence, not an inaccessible scratch-directory citation.

## Physics probes

[check_airborne_frame.py](../../../../scripts/validation/jsbsim/wheel-spin-review/check_airborne_frame.py)
loads the original
`TestWheelSpin` fixture without invoking its runner; all temporary fixtures
stay under the JSBSim build. It initializes q=0.4 and internal spin −0.4
(zero relative spin with axis −Y), brakes for one airborne step, then reports
the implied relative rate:

```sh
cd /Users/felg/gh/0sfs
/Users/felg/gh/Felipegalind0/jsbsim/.venv/bin/python \
  scripts/validation/jsbsim/wheel-spin-review/check_airborne_frame.py \
  /Users/felg/gh/Felipegalind0/jsbsim \
  /Users/felg/gh/Felipegalind0/jsbsim/build/pr1502
```

[airborne-frame.log](airborne-frame.log) records relative spin changing from
0 to 0.400000007495 rad/s with WOW=0. This script assumes the *old* property's
raw-state write semantics; it must not be used unchanged to test the new
relative setter.

[check_solver.cpp](../../../../scripts/validation/jsbsim/wheel-spin-review/check_solver.cpp)
verifies that the proposed native-test
fixtures can use the public acceleration `Run(false)` path without a private
API or aircraft file. Its seven cases use the original field names and the
probe library:

```sh
cd /Users/felg/gh/Felipegalind0/jsbsim
c++ -std=c++17 -I build/pr1502-probe-source/src \
  /Users/felg/gh/0sfs/scripts/validation/jsbsim/wheel-spin-review/check_solver.cpp \
  build/pr1502-probe/src/libJSBSim.a -o build/pr1502-probe/check_solver
build/pr1502-probe/check_solver
```

[solver-cases.log](solver-cases.log) matches the planned analytic values. The
coupled PGS case stops with about 3.33e−6 multiplier error, so its planned
absolute multiplier tolerance is 1e−5; a 1e−6 multiplier assertion would be
stricter than the existing stopping criterion supports. This probe prints
observations; the future CxxTest must add actual assertions, the empty-list
case and the specified sensitivity check.

No airborne fix, new CxxTest, coverage report, revised WASM artifact, or
real-aircraft calibration was implemented or qualified in this planning run.
