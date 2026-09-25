# Task 05: Cover the wheel constraints without Python

## Goal and review context

Add analytical CxxTests for the unified solve so upstream's Python-disabled coverage workflow exercises it. No maintainer requested a new test; this supports the simplification in [4047650299](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047650299) and distinguishes the two constraints explained in the analysis.

Read `/Users/felg/gh/0sfs/AGENTS.md` and the JSBSim instructions present in your checkout before editing. Work only in the owning repository. JSBSim scratch belongs in its gitignored `build/`; Retained logs, reports and numerical results belong in `/Users/felg/gh/0sfs/validation/evidence/jsbsim/wheel-spin-review/` (top-level `validation/`, outside `docs/`). Follow `/Users/felg/gh/0sfs/docs/validation/layout.md`; historical evidence moved from `docs/validation/evidence/` to top-level `validation/evidence/` on 2026-09-19 (`/Users/felg/gh/0sfs/docs/validation/evidence-relocation-2026-09-19.md` maps the old prefix), so do not recreate the old docs tree. Retained runnable review tools belong in `/Users/felg/gh/0sfs/scripts/validation/jsbsim/wheel-spin-review/`; permanent engine regressions belong in JSBSim `tests/`. Do not create or copy executable validation source into `docs/`. The existing review tools moved there from the evidence directory on 2026-09-19; `/Users/felg/gh/0sfs/validation/evidence/jsbsim/tool-relocation.md` maps the former tool paths that older records cite. Never use `/tmp`, `/var/folders`, or a harness scratchpad. Never start a dev, preview or watch server. Engine changes belong in JSBSim, with no app workaround.

These are execution instructions for a later, user-launched task. Do not launch another task agent. Never rebase, amend, push, post comments, resolve threads, request review, or edit the GitHub PR body. Do not edit assertions or tolerances to conceal a failure. Only the purposeful regression changes specified below are authorized.

## Starting state and dependencies

Repository: `/Users/felg/gh/Felipegalind0/jsbsim`. Branch: `feature/wheel-spin-dof`. Finish tasks 01–04, including the planner's diff review, first. The original root of this sequence is `24e085bf81b5ef8bab8500ab9d416571753b93cc`.

Your exact starting commit is the full 40-character `commit` in `build/pr1502-handoff/04.json`, written by the planner after reviewing task 04. It is not an arbitrary current branch tip. Future commit hashes cannot truthfully be written before those commits exist. This receipt supplies the exact hash without asking you to choose one. If it is absent or unapproved, stop; do not manufacture approval or execute against a guessed SHA.

```sh
cd /Users/felg/gh/Felipegalind0/jsbsim
test -z "$(git status --porcelain)" || exit 1
git switch feature/wheel-spin-dof
.venv/bin/python - <<'CHECK'
import json, re, subprocess
from pathlib import Path
r = json.loads(Path('build/pr1502-handoff/04.json').read_text())
assert r['task'] == '04' and r['approved'] is True
assert re.fullmatch('[0-9a-f]{40}', r['commit'])
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == r['commit']
subprocess.run(['git', 'merge-base', '--is-ancestor', '24e085bf81b5ef8bab8500ab9d416571753b93cc', r['commit']], check=True)
CHECK
```

Check cleanliness before switching, and tell the user if you switch away from `master`. Read the predecessor receipt's test results. Do not reset or repair an unexpected branch history.

## Change

Edit only `tests/unit_tests/FGAccelerationsTest.h` (new) and `tests/unit_tests/CMakeLists.txt` (add `FGAccelerationsTest` to `UNIT_TESTS`). Do not touch `tests/CMakeLists.txt` or production headers to expose private methods.

Use a fresh `FGFDMExec` per case and its public `GetAccelerations()`, `InitModel()` and `Run(false)` path; use public `in` fields and synthetic `LagrangeMultiplier` rows. Follow the existing CxxTest style and LGPL/GPL header precedent for tests. Initialize **every** input: zero vectors, identity transforms, `J=diag(4,8,16)`, `Jinv=diag(1/4,1/8,1/16)`, `Mass=2`, `DeltaT=0.1`, gravity/planet/terrain rates/forces/moments zero. Set both `vPQR` and `vPQRi` consistently. `MultipliersList` points at a local live vector; wheel objects must outlive rows and the solve. Do not call a full FDM step that overwrites synthetic inputs. Disable gravitational torque/hold-down, do not load aircraft or create files.

Use these independently derived examples (body axes x forward, y right, z down): roll `U=(1,0,0)`, axle lever `(0,0,1)`, hence `M=(0,1,0)`; positive spin axis `s=(0,-1,0)`; brake `U=0, M=-s=(0,1,0), w=+1`. Radius R=1, wheel inertia I=1 (`Jinv=1`), roll `w=-1`. Set initial multiplier values to zero and bounds to ±100 unless specified. Assert values/forces/moments/accelerations within `1e-5` (PGS stops at multiplier-change norm `1e-5`; the two-row fixture has about 3.33e-6 multiplier error at that stop); use `1e-12` only for exact untouched-zero cases.

1. **Legacy single row:** no wheel, body u=2, rates zero. `A=1/2+1/8=5/8`, RHS=-20, lambda=-32. Friction Fx=-32, My=-32, body du/dt=-16, dq/dt=-4. This checks `r×U` signs without relying on a duplicate implementation.
2. **Free wheel:** same row with wheel, Rate=0, w=-1. `A=13/8`, lambda=`-160/13`, wheel Accel=`160/13`. Assert next-step roll residual `u + dt*Fx/Mass + (q+dt*My/8) - (Rate+dt*Accel)` is within `1e-6` and axle moment is not counted twice.
3. **Wheel/body brake:** brake row only, body q=2, wheel Rate=3. Relative rate is `Rate+q=5`; `A=9/8`, lambda=`-400/9`, wheel Accel=`-400/9`, body qdot=`-50/9`. Assert next-step `Rate+q=0` within `1e-6`, and angular momentum `8*q - Rate` remains 13 within `1e-6` (wheel axis is -Y).
4. **Both rows sharing one wheel:** u=2, q=0, Rate=0. Analytic matrix `[[13/8,-7/8],[-7/8,9/8]]`; RHS `[-20,0]`; lambda roll=`-360/17`, brake=`-280/17`. Assert both next-step residuals and summed wheel Accel `-lambda_roll + lambda_brake`. This must fail if the shared-wheel off-diagonal term is omitted, squared, or given the wrong sign.
5. **Clamped brake:** brake-only initial q=2, Rate=3, bounds ±2, warm start deliberately +10. The solve must clamp lambda to -2; relative spin decreases without reaching zero and the equal/opposite torque relation holds. Do not confuse the gear pre-clamp task with the solver's own projection.
6. **Different wheels:** two roll rows, `U1=x`, `U2=z`, `M1=M2=0`, w1=w2=-1; distinct I=1 wheels with Rate1=1, Rate2=-2 and zero body velocity. Cross body coupling is zero and there is no wheel cross term, so lambda1=`20/3`, lambda2=`-40/3`; accelerations are their negatives. Use the roll U=z here solely as an orthogonal synthetic algebra fixture, not a physical ground plane.
7. **Zero dt:** one brake row, q=2, Rate=3, dt=0, non-friction moments/forces zero and bounds ±100. No velocity/dt term is formed: lambda and wheel Accel are finite zero, no internal Rate mutation. Initialize Accel=123 before the solve to verify reset. Also cover an empty multiplier list returning zero friction force/moment. Do not require the empty-list path to reset a wheel it cannot see.

Out of scope: private-access macros, production test hooks, altered solver thresholds, Python test rewrites, coverage badges, a claimed coverage percentage, and new dependencies. The test suffix must be `Test1` through the existing CMake macro so `ctest -R Test1` selects it.

Tasks are sequential in this plan; do not create a worktree or run alongside the other tasks. This avoids shared-checkout/test-load ambiguity. A later planner may explicitly authorize concurrency; only then use a separate worktree inside JSBSim `build/` and a dedicated branch, integrating its one commit into the PR branch after review.

## Build and test

```sh
cd /Users/felg/gh/Felipegalind0/jsbsim
cmake -S . -B build/pr1502 -DCMAKE_BUILD_TYPE=Release -DBUILD_PYTHON_MODULE=ON \
  -DPython3_EXECUTABLE=/Users/felg/gh/Felipegalind0/jsbsim/.venv/bin/python
cmake --build build/pr1502 -j
ctest --test-dir build/pr1502 -R TestWheelSpin --output-on-failure
```

These commands were verified on the exact original PR head: the wheel target passed. The full-suite command, when required below, is:

```sh
ctest --test-dir build/pr1502 -j8 --output-on-failure
```

It passed 78/78 on the original head when run without competing builds and with loopback access. `TestInputSocket` has a historical `telnetlib3` connection timeout both with and without the PR. In the planning run it first failed with sandbox `PermissionError`, then passed with loopback access. Record the exact cause; do not call every socket failure the historical flake. Request execution-tool loopback permission if necessary. Do not alter socket tests or chase that historical timeout in this task. `TestActuator.test_regression_bug_1503` also failed once while builds/simulations competed for CPU, then passed in the idle full run; its subprocess timeout scales from a timed reference execution. If this same timeout occurs, stop competing jobs and rerun the unchanged test alone once. Any persistent/new failure is a stop-and-report condition, not an accepted regression.

After the common Python-enabled build, run the new test and full suite. Then use the verified Python-disabled configuration pattern:

```sh
ctest --test-dir build/pr1502 -R '^FGAccelerationsTest1$' --output-on-failure
ctest --test-dir build/pr1502 -j8 --output-on-failure
cmake -S . -B build/pr1502-cxx -DCMAKE_BUILD_TYPE=Release -DBUILD_PYTHON_MODULE=OFF
cmake --build build/pr1502-cxx -j
ctest --test-dir build/pr1502-cxx -R Test1 --output-on-failure
```

The Python-disabled pattern was run successfully on the scratch solver probe: 20 existing CxxTests passed. The new test does not yet exist, so its exact selector is necessarily an acceptance command, not a claimed completed test. Check CMake output says CxxTest was found and CTest actually lists/runs `FGAccelerationsTest1`; zero tests is failure.

As a sensitivity check in an archived copy under `build/`, temporarily remove only the shared-wheel off-diagonal contribution, rebuild the new target and verify case 4 fails. Restore/rebuild before the final pass. Keep that mutation out of the working diff/commit; no permanent mutation-testing framework.

## Acceptance criteria

All seven analytical cases pass through the real solver, the intentional off-diagonal defect fails, and the test is selected with Python disabled. Expect 79 total CTest targets / 21 CxxTests if no other test registration has changed. A difference in counts needs explanation. No private API exposure or assertion weakening. The planner independently re-derives the expected values, reads the test diff and the failure/pass logs before signing off; do not infer correctness from Codecov percentage.

## Commit and report

Make exactly one JSBSim commit on `feature/wheel-spin-dof`, subject **Test wheel constraints without Python**. Stage only this task's named files. End the commit message with the attribution trailer supplied by your execution harness, if any; do not invent a trailer. Do not commit build output or 0sfs evidence into JSBSim.

Report the full commit hash and parent hash, files/behavior changed, exact build and test commands with exit status and test counts, evidence locations, any uncertainty, and anything noticed but left unchanged. Stop and report on any unpredicted failure rather than improvising a design or relaxing a test. Do not start the next task.

The planner must read `git show --stat` and the complete `git show` diff, inspect the evidence and rerun any check needed to resolve uncertainty. An agent report alone is not acceptance. Only after accepting the diff does the planner write `build/pr1502-handoff/05.json` with `task`, full `commit`, full `parent`, `approved: true`, and `tests`. You must not approve your own receipt.
