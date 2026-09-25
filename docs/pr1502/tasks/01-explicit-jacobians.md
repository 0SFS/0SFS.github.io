# Task 01: Use one friction-row representation

## Goal and review context

Replace the legacy/generalized fork with explicit moment Jacobians on every row, preserving the mathematical constraints. This answers [4047586942](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047586942) ("Use `Jinv` for the inverse of the inertia"), [4047612197](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047612197) ("remove `LeverArm`"), [4047622267](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047622267) ("you will no longer need the lambda function `moment`"), and [4047650299](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047650299) ("it can be integrated in the legacy code rather than duplicating the loops"). Its follow-up [4047870001](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047870001) questions the `continue`; remove it with the duplicate branch.

Read `/Users/felg/gh/0sfs/AGENTS.md` and the JSBSim instructions present in your checkout before editing. Work only in the owning repository. JSBSim scratch belongs in its gitignored `build/`; Retained logs, reports and numerical results belong in `/Users/felg/gh/0sfs/validation/evidence/jsbsim/wheel-spin-review/` (top-level `validation/`, outside `docs/`). Follow `/Users/felg/gh/0sfs/docs/validation/layout.md`; historical evidence moved from `docs/validation/evidence/` to top-level `validation/evidence/` on 2026-09-19 (`/Users/felg/gh/0sfs/docs/validation/evidence-relocation-2026-09-19.md` maps the old prefix), so do not recreate the old docs tree. Retained runnable review tools belong in `/Users/felg/gh/0sfs/scripts/validation/jsbsim/wheel-spin-review/`; permanent engine regressions belong in JSBSim `tests/`. Do not create or copy executable validation source into `docs/`. The existing review tools moved there from the evidence directory on 2026-09-19; `/Users/felg/gh/0sfs/validation/evidence/jsbsim/tool-relocation.md` maps the former tool paths that older records cite. Never use `/tmp`, `/var/folders`, or a harness scratchpad. Never start a dev, preview or watch server. Engine changes belong in JSBSim, with no app workaround.

These are execution instructions for a later, user-launched task. Do not launch another task agent. Never rebase, amend, push, post comments, resolve threads, request review, or edit the GitHub PR body. Do not edit assertions or tolerances to conceal a failure. Only the purposeful regression changes specified below are authorized.

## Starting state and dependencies

Repository: `/Users/felg/gh/Felipegalind0/jsbsim`. Branch: `feature/wheel-spin-dof`. Exact starting commit: `24e085bf81b5ef8bab8500ab9d416571753b93cc`. No implementation prerequisite: the planner already built the baseline and retained its evidence. The scratch solver probe is not a commit and must not be treated as implemented work.

```sh
cd /Users/felg/gh/Felipegalind0/jsbsim
test -z "$(git status --porcelain)" || exit 1
git switch feature/wheel-spin-dof
test "$(git rev-parse HEAD)" = 24e085bf81b5ef8bab8500ab9d416571753b93cc || exit 1
```

The old PR branch has no `wasm/` subtree or ignore files. Switching from the clean integration `master` exposes pre-existing ignored WASM build artifacts as untracked `wasm/` files. Preserve them reversibly before editing; do not delete them or commit them. Only do this after the clean-before-switch check above and after confirming there are no tracked `wasm` paths:

```sh
test -z "$(git ls-files wasm)" || exit 1
if test -d wasm; then
  test ! -e build/pr1502-preserved-wasm || exit 1
  mv wasm build/pr1502-preserved-wasm
fi
test -z "$(git status --porcelain)" || exit 1
```

Report this preservation path. On a later return to integration master, the planner restores these generated artifacts without overwriting tracked source; this is workspace restoration, not a new WASM package. If the destination already exists or unrelated files are dirty, stop rather than overwrite anything.

Check cleanliness before switching, and tell the user if you switch away from `master`. Do not reset an unexpected branch. If the live PR head has changed from this commit, stop for replanning.

## Change

Edit only `src/math/LagrangeMultiplier.h`, `src/models/FGAccelerations.cpp`, and `src/models/FGLGear.cpp`.

1. Rename `WheelSpinDOF::InvInertia` to `Jinv` and `LagrangeMultiplier::WheelCoeff` to `WheelJacobian`, including every reference. Keep inertia and scalar-Jacobian units documented. Do not change the `Rate` comment yet (task 03).
2. Remove `LagrangeMultiplier::LeverArm` and `UseMomentJacobian`. Retain `MomentJacobian` as the body's torque vector per unit multiplier. In `FGLGear::ResetToIC`, initialize this vector instead of the removed lever arm. In `ComputeJacobian`, set each dynamic, roll and side row's `MomentJacobian = vWhlContactVec * row.ForceJacobian` after assigning that force direction. The vector `*` operator here is a cross product: **position × force**, never the reverse.
3. In `ConfigureWheelSpinRows`, retain the existing special roll axle moment and brake pure moment. Remove the obsolete flag assignments and `brake.LeverArm` initialization. Do not move bounds, rename `roll`/`axle`, change call order, or change registration order yet; task 02 owns those.
4. In `CalculateFrictionForces`, remove `generalized`, the `moment` lambda, and all duplicate branches. Before assembly, zero `Accel` on every referenced wheel (repeated assignment for two rows referencing one wheel is harmless because this is before accumulation). With row i's `U_i`, `M_i`, scalar `w_i`, inverse wheel inertia `Jw_inv`, use:

   ```text
   v1 = U_i / Mass
   v2 = in.Jinv * M_i
   A_ij = dot(U_j, v1) + dot(M_j, v2)
   if (i.Wheel != nullptr && i.Wheel == j.Wheel):
       A_ij += w_i * w_j * i.Wheel->Jinv
   ```

   Copy the lower triangle from the upper as before. The wheel term is **not** simply a square on off-diagonal entries; roll/brake coupling is negative (`-R * 1 / I`). Distinct wheel pointers must not couple through that term.
5. Retain the existing `vdot` and `wdot` construction, including terrain handling and `dt > 0` guards. Before dividing by `A_ii`, use `rhs_i = -(dot(U_i,vdot) + dot(M_i,wdot) + wheelTerm)` with `wheelTerm = w_i * Rate / dt` only for a non-null wheel and positive dt. Preserve normalization, PGS loop order, 50-iteration cap and `1e-5` stopping criterion.
6. Accumulate body force `lambda * U_i`, body moment `lambda * M_i`, and wheel acceleration `w_i * lambda * Wheel->Jinv`. Preserve the final derivative updates. Do not refactor arithmetic further or introduce algebraic optimizations.

The retained `make_solver_probe.py` in 0sfs `scripts/validation/jsbsim/wheel-spin-review/` implements exactly this arithmetic before the two field renames. It is a measurement artifact, not a patch to apply blindly. Read the diff yourself.

Out of scope: wheel property frames, airborne decay, constants, row bounds/order, model-author documentation, tests and coverage. No wheel feature separation, new API or aircraft XML edits.

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

Run the full-suite command above after the focused test, with no competing CPU-heavy work. Run the retained `compare_scripts.py` once with `--trace`, against the immutable base binary and this candidate. The planner owns the final numerical review; give them the output directory and summary. The base/probe build recipes are in the evidence README. A missing reference binary must be rebuilt from the recorded source, never replaced by fork `master`.

```sh
python3 /Users/felg/gh/0sfs/scripts/validation/jsbsim/wheel-spin-review/compare_scripts.py \
  --source /Users/felg/gh/Felipegalind0/jsbsim --trace \
  --binary base=/Users/felg/gh/Felipegalind0/jsbsim/build/pr1502-base/src/JSBSim \
  --binary candidate=/Users/felg/gh/Felipegalind0/jsbsim/build/pr1502/src/JSBSim \
  --binary probe=/Users/felg/gh/Felipegalind0/jsbsim/build/pr1502-probe/src/JSBSim
rg -n 'LeverArm|UseMomentJacobian|InvInertia|WheelCoeff' src
rg -n 'generalized|auto moment|continue;' src/models/FGAccelerations.cpp
```

The first `rg` must have no matches (exit 1). Inspect the second specifically in `CalculateFrictionForces`; do not remove unrelated occurrences elsewhere.

## Acceptance criteria

The wheel target and full suite pass, apart from an exactly diagnosed baseline environment failure described above. Every candidate data file from aircraft without wheel elements must match the recorded solver probe **byte-for-byte** (zero additional difference), with identical process outcomes. Base-vs-candidate differences are expected and must be reported, not normalized away. Check all 61 XML inputs and distinguish the three support files and shared trim failure from successful simulations. The planner must independently compare the algebra/signs, row initialization and the numerical summary before approving the commit.

## Commit and report

Make exactly one JSBSim commit on `feature/wheel-spin-dof`, subject **Use explicit moment Jacobians for friction**. Stage only this task's named files. End the commit message with the attribution trailer supplied by your execution harness, if any; do not invent a trailer. Do not commit build output or 0sfs evidence into JSBSim.

Report the full commit hash and parent hash, files/behavior changed, exact build and test commands with exit status and test counts, evidence locations, any uncertainty, and anything noticed but left unchanged. Stop and report on any unpredicted failure rather than improvising a design or relaxing a test. Do not start the next task.

The planner must read `git show --stat` and the complete `git show` diff, inspect the evidence and rerun any check needed to resolve uncertainty. An agent report alone is not acceptance. Only after accepting the diff does the planner write `build/pr1502-handoff/01.json` with `task`, full `commit`, full `parent`, `approved: true`, and `tests`. You must not approve your own receipt.
