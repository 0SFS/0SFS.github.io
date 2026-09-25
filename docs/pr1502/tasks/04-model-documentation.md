# Task 04: Document friction semantics and spin-down assumptions

## Goal and review context

Explain the enabled wheel model to aircraft authors and name the airborne approximation honestly. This answers the rolling-friction point in [5654721219](https://github.com/JSBSim-Team/jsbsim/pull/1502#issuecomment-5654721219) and Sean's [5680186393](https://github.com/JSBSim-Team/jsbsim/pull/1502#issuecomment-5680186393) request for a "URL in the class/method pointing to writeups like this". There is no additional inline thread.

Read `/Users/felg/gh/0sfs/AGENTS.md` and the JSBSim instructions present in your checkout before editing. Work only in the owning repository. JSBSim scratch belongs in its gitignored `build/`; Retained logs, reports and numerical results belong in `/Users/felg/gh/0sfs/validation/evidence/jsbsim/wheel-spin-review/` (top-level `validation/`, outside `docs/`). Follow `/Users/felg/gh/0sfs/docs/validation/layout.md`; historical evidence moved from `docs/validation/evidence/` to top-level `validation/evidence/` on 2026-09-19 (`/Users/felg/gh/0sfs/docs/validation/evidence-relocation-2026-09-19.md` maps the old prefix), so do not recreate the old docs tree. Retained runnable review tools belong in `/Users/felg/gh/0sfs/scripts/validation/jsbsim/wheel-spin-review/`; permanent engine regressions belong in JSBSim `tests/`. Do not create or copy executable validation source into `docs/`. The existing review tools moved there from the evidence directory on 2026-09-19; `/Users/felg/gh/0sfs/validation/evidence/jsbsim/tool-relocation.md` maps the former tool paths that older records cite. Never use `/tmp`, `/var/folders`, or a harness scratchpad. Never start a dev, preview or watch server. Engine changes belong in JSBSim, with no app workaround.

These are execution instructions for a later, user-launched task. Do not launch another task agent. Never rebase, amend, push, post comments, resolve threads, request review, or edit the GitHub PR body. Do not edit assertions or tolerances to conceal a failure. Only the purposeful regression changes specified below are authorized.

## Starting state and dependencies

Repository: `/Users/felg/gh/Felipegalind0/jsbsim`. Branch: `feature/wheel-spin-dof`. Finish tasks 01–03, including the planner's diff review, first. The original root of this sequence is `24e085bf81b5ef8bab8500ab9d416571753b93cc`.

Your exact starting commit is the full 40-character `commit` in `build/pr1502-handoff/03.json`, written by the planner after reviewing task 03. It is not an arbitrary current branch tip. Future commit hashes cannot truthfully be written before those commits exist. This receipt supplies the exact hash without asking you to choose one. If it is absent or unapproved, stop; do not manufacture approval or execute against a guessed SHA.

```sh
cd /Users/felg/gh/Felipegalind0/jsbsim
test -z "$(git status --porcelain)" || exit 1
git switch feature/wheel-spin-dof
.venv/bin/python - <<'CHECK'
import json, re, subprocess
from pathlib import Path
r = json.loads(Path('build/pr1502-handoff/03.json').read_text())
assert r['task'] == '03' and r['approved'] is True
assert re.fullmatch('[0-9a-f]{40}', r['commit'])
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == r['commit']
subprocess.run(['git', 'merge-base', '--is-ancestor', '24e085bf81b5ef8bab8500ab9d416571753b93cc', r['commit']], check=True)
CHECK
```

Check cleanliness before switching, and tell the user if you switch away from `master`. Read the predecessor receipt's test results. Do not reset or repair an unexpected branch history.

## Change

Edit only `src/models/FGLGear.cpp` and `src/models/FGLGear.h`.

1. In the enabled-wheel airborne branch, name the local constants `legacyTreadDeceleration = 13.0` and `additionalBrakeTreadDeceleration = 100.0`, both in ft/s². Use them in the existing decrement with exactly the same arithmetic order. Keep the legacy disabled-wheel branch byte-for-byte unchanged.
2. Comment their provenance: 13 is copied from the legacy visual wheel-speed decay; 100 is an authored, uncalibrated extra tread-deceleration approximation introduced by this PR, not a measured brake torque and not derived from `BrakeFCoeff`. Retain its value in this review round; no physically justified replacement can be inferred from a force proportional to zero airborne normal load. Do not invent a reference or claim calibration. A future torque parameter/model is outside this round.
3. In the `FGLGear.h` class block under "Optional wheel rotational degree of freedom", explicitly contrast meanings of `rolling_friction`: without the new elements it models tire rolling resistance/hysteresis; with them it enters the wheel-to-axle resisting torque, combined with brakes and bounded on the ground by the existing force coefficient × normal load × radius. Explain the airborne law as the separately approximated **airframe-relative** tread deceleration `13 + 100*brake` ft/s² (brake normalized 0–1), with no measured-aircraft fidelity claim or explicit airframe reaction torque for this airborne approximation.
4. Document both positive opt-in elements/units, the force bound, axle moment, roll/no-slip vs brake/no-relative-spin conditions, ground initialization, and the getter/setter frame from task 03. Preserve compatibility qualifications: no wheel state/properties without opt-in; common solver arithmetic can change floating-point results even for those aircraft. Do not promise byte identity or universal exact steady-rolling equality.
5. Add the exact analysis URL to the comment immediately above `ConfigureWheelSpinRows`: `https://github.com/JSBSim-Team/jsbsim/pull/1502#issuecomment-5654721219`. Replace the imprecise phrase "the airframe moment arm is the axle" with "the airframe lever arm runs from the CG to the axle"; this is the nonblocking clarification recorded during task 02 review. State the row meanings explicitly: roll `(U, r_axle × U, -R)` drives axle tread slip; brake `(0, -spinAxis, +1)` drives wheel/body relative rate. Keep the unified machinery. The link documents the derivation; it does not delegate correctness to the comment (which has informal sign/variable slips).
6. Document the axis convention and its limit in the class block: on the ground, the model uses ground normal cross the ground-projected rolling direction; airborne, it uses gear up cross the steered forward direction. These axes can differ, so the reported airframe-relative rate can change at a contact transition even without a remapping of the internal scalar state. This is a limitation of the current idealized axle model, not a newly modeled gyroscopic impulse. Do not promise continuity for banked or steered contact transitions. Also avoid saying brakes hold zero relative airborne spin for arbitrary body motion: the finite per-step decrement must be sufficient to reach zero. Do not change either axis or the dynamics in this documentation task.

Out of scope: changing 13 or 100 numerically, introducing brake coefficients/torque XML, renaming properties, splitting row classes, altering tests, editing the public PR or 0sfs app behavior.

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

Run the common build and wheel test. Inspect `git diff --check`. Search the changed wheel-related comments for obsolete raw/"absolute" telemetry claims; do not change unrelated occurrences in the source tree.

## Acceptance criteria

The wheel target passes unchanged. Only constant names/comments/documentation change runtime code, with the arithmetic preserved. Model authors can distinguish ground torque from the airborne approximation and the public spin rate from the internal state. The analysis link appears in the method it explains. The planner checks every factual claim and confirms that no unsupported physical source was invented.

## Commit and report

Make exactly one JSBSim commit on `feature/wheel-spin-dof`, subject **Document wheel friction and airborne spin-down**. Stage only this task's named files. End the commit message with the attribution trailer supplied by your execution harness, if any; do not invent a trailer. Do not commit build output or 0sfs evidence into JSBSim.

Report the full commit hash and parent hash, files/behavior changed, exact build and test commands with exit status and test counts, evidence locations, any uncertainty, and anything noticed but left unchanged. Stop and report on any unpredicted failure rather than improvising a design or relaxing a test. Do not start the next task.

The planner must read `git show --stat` and the complete `git show` diff, inspect the evidence and rerun any check needed to resolve uncertainty. An agent report alone is not acceptance. Only after accepting the diff does the planner write `build/pr1502-handoff/04.json` with `task`, full `commit`, full `parent`, `approved: true`, and `tests`. You must not approve your own receipt.
