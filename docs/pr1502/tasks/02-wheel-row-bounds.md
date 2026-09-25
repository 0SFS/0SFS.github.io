# Task 02: Configure wheel rows before clamping

## Goal and review context

Make the wheel-specific grip bound visible in its row configuration and clamp warm-start values after the new limits are set. Answer [4047682190](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047682190) ("This code should be located in the new method `ConfigureWheelSpinRows`"), [4047708987](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047708987) ("This code should be moved before the calls to `Constrain`"), and [4047742902](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047742902) ("the axle **position** with respect to the CG"; "lever arm").

Read `/Users/felg/gh/0sfs/AGENTS.md` and the JSBSim instructions present in your checkout before editing. Work only in the owning repository. JSBSim scratch belongs in its gitignored `build/`; Retained logs, reports and numerical results belong in `/Users/felg/gh/0sfs/validation/evidence/jsbsim/wheel-spin-review/` (top-level `validation/`, outside `docs/`). Follow `/Users/felg/gh/0sfs/docs/validation/layout.md`; historical evidence moved from `docs/validation/evidence/` to top-level `validation/evidence/` on 2026-09-19 (`/Users/felg/gh/0sfs/docs/validation/evidence-relocation-2026-09-19.md` maps the old prefix), so do not recreate the old docs tree. Retained runnable review tools belong in `/Users/felg/gh/0sfs/scripts/validation/jsbsim/wheel-spin-review/`; permanent engine regressions belong in JSBSim `tests/`. Do not create or copy executable validation source into `docs/`. The existing review tools moved there from the evidence directory on 2026-09-19; `/Users/felg/gh/0sfs/validation/evidence/jsbsim/tool-relocation.md` maps the former tool paths that older records cite. Never use `/tmp`, `/var/folders`, or a harness scratchpad. Never start a dev, preview or watch server. Engine changes belong in JSBSim, with no app workaround.

These are execution instructions for a later, user-launched task. Do not launch another task agent. Never rebase, amend, push, post comments, resolve threads, request review, or edit the GitHub PR body. Do not edit assertions or tolerances to conceal a failure. Only the purposeful regression changes specified below are authorized.

## Starting state and dependencies

Repository: `/Users/felg/gh/Felipegalind0/jsbsim`. Branch: `feature/wheel-spin-dof`. Finish tasks 01–01, including the planner's diff review, first. The original root of this sequence is `24e085bf81b5ef8bab8500ab9d416571753b93cc`.

Your exact starting commit is the full 40-character `commit` in `build/pr1502-handoff/01.json`, written by the planner after reviewing task 01. It is not an arbitrary current branch tip. Future commit hashes cannot truthfully be written before those commits exist. This receipt supplies the exact hash without asking you to choose one. If it is absent or unapproved, stop; do not manufacture approval or execute against a guessed SHA.

```sh
cd /Users/felg/gh/Felipegalind0/jsbsim
test -z "$(git status --porcelain)" || exit 1
git switch feature/wheel-spin-dof
.venv/bin/python - <<'CHECK'
import json, re, subprocess
from pathlib import Path
r = json.loads(Path('build/pr1502-handoff/01.json').read_text())
assert r['task'] == '01' and r['approved'] is True
assert re.fullmatch('[0-9a-f]{40}', r['commit'])
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == r['commit']
subprocess.run(['git', 'merge-base', '--is-ancestor', '24e085bf81b5ef8bab8500ab9d416571753b93cc', r['commit']], check=True)
CHECK
```

Check cleanliness before switching, and tell the user if you switch away from `master`. Read the predecessor receipt's test results. Do not reset or repair an unexpected branch history.

## Change

Edit only `src/models/FGLGear.cpp`.

1. In `ComputeJacobian`, the ordinary BOGEY path assigns `ftRoll.Max = fabs(BrakeFCoeff * vFn(eZ))`. Remove its wheel conditional. Preserve STRUCTURE behavior.
2. In `ConfigureWheelSpinRows`, set the wheel roll row's `Max = fabs(staticFFactor * staticFCoeff * vFn(eZ))` and `Min = -Max` together. This is tire grip, independent of brake position. Keep the brake-row bound `fabs(BrakeFCoeff * vFn(eZ)) * wheelRadius` and its own clamp unchanged.
3. Invoke `ConfigureWheelSpinRows(vWhlContactVec)` for enabled wheels after ordinary min/max initialization and **before** both roll/side `Constrain` calls. A brief separate `if (wheelSpinEnabled)` here is intentional. Keep registration order exactly `ftRoll`, `ftSide`, `ftWheelBrake`: moving configuration must not move brake registration ahead of the existing rows. Remove the old later configuration call, leaving its conditional brake registration.
4. In `ConfigureWheelSpinRows` only, rename `roll` to `rollDirection` and `axle` to `axleLeverArm`. `axleLeverArm = vWhlContactVec + wheelRadius * vGroundNormal`; roll moment `axleLeverArm * rollDirection`; positive spin axis `vGroundNormal * rollDirection`. Do not rename the separate `roll` local in `ComputeGroundFrame`.

Out of scope: arithmetic/PGS changes, frames, deceleration, bindings, tests, XML, unrelated naming, or row-class separation. Never restore the removed representation flags.

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

The common build and wheel target are sufficient for this rearrangement. Inspect the call order and min/max assignments in the diff. The planner will rerun the whole suite and script comparison at the final integration gate; do not create a source-text test that merely mirrors these edits.

## Acceptance criteria

Existing wheel tests pass with unchanged tolerances. Both roll bounds are configured before its warm-start value is clamped; brake limits and registration order are unchanged. No new arithmetic change is permitted. Disabled wheel/STRUCTURE code remains the task-01 behavior. The planner reads the complete diff and checks that there is one configuration call and three registrations in the original order.

## Commit and report

Make exactly one JSBSim commit on `feature/wheel-spin-dof`, subject **Configure wheel friction bounds before clamping**. Stage only this task's named files. End the commit message with the attribution trailer supplied by your execution harness, if any; do not invent a trailer. Do not commit build output or 0sfs evidence into JSBSim.

Report the full commit hash and parent hash, files/behavior changed, exact build and test commands with exit status and test counts, evidence locations, any uncertainty, and anything noticed but left unchanged. Stop and report on any unpredicted failure rather than improvising a design or relaxing a test. Do not start the next task.

The planner must read `git show --stat` and the complete `git show` diff, inspect the evidence and rerun any check needed to resolve uncertainty. An agent report alone is not acceptance. Only after accepting the diff does the planner write `build/pr1502-handoff/02.json` with `task`, full `commit`, full `parent`, `approved: true`, and `tests`. You must not approve your own receipt.
