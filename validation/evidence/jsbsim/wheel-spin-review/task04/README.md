# Task 04 agent record: awaiting planner review

Planner update, 2026-09-19: task 04 and its follow-up are accepted at
`9d0794e93a340957d068ad6e2413d066d3c768dd`; see [review.md](review.md).
The original agent record and follow-up report below are retained.

Written 2026-09-19 by the executing agent. This is not an approval; the
planner's review and `build/pr1502-handoff/04.json` are separate.

- Commit: `8924c17603aa322cdde684440ada1a061e137e7d`
- Parent: `18e8454e4d7cb5d9e2ffb381bf15e96510c973a0` (approved task 03 receipt)
- Subject: **Document wheel friction and airborne spin-down**
- Files: `src/models/FGLGear.cpp`, `src/models/FGLGear.h` (+128/−29).
  [show-stat.txt](show-stat.txt), [show.diff](show.diff),
  [commit-message.txt](commit-message.txt). `git diff --check` and
  `git show --check` passed. No attribution trailer was supplied, so none was added.

Starting state: the canonical checkout was clean and already on
`feature/wheel-spin-dof` (no switch from `master`). The receipt check in the
task prompt passed: HEAD equalled the approved 03 commit, and
`24e085bf` is its ancestor.

## Commands and results

Canonical checkout, run in this order with no other builds or tests running:

| Command | Exit | Result | Log |
| --- | --- | --- | --- |
| `cmake -S . -B build/pr1502 -DCMAKE_BUILD_TYPE=Release -DBUILD_PYTHON_MODULE=ON -DPython3_EXECUTABLE=…/.venv/bin/python` | 0 | configured | [configure.log](configure.log) |
| `cmake --build build/pr1502 -j` | 0 | 31 objects rebuilt, no warnings | [build.log](build.log) |
| `ctest --test-dir build/pr1502 -R TestWheelSpin --output-on-failure` | 0 | 1/1 | [wheel-ctest.log](wheel-ctest.log) |
| `ctest --test-dir build/pr1502 -R TestWheelSpin -V` | 0 | all 9 methods ok | [wheel-ctest-verbose.log](wheel-ctest-verbose.log) |
| `ctest --test-dir build/pr1502 -j8 --output-on-failure` (not required by the task) | 0 | 78/78, 10.39 s | [full-ctest.log](full-ctest.log) |
| `cmake --build build/pr1502 -j` after commit | 0 | 0 objects rebuilt | [post-commit-build.log](post-commit-build.log) |
| `ctest --test-dir build/pr1502 -R TestWheelSpin --output-on-failure` after commit | 0 | 1/1 | [post-commit-wheel-ctest.log](post-commit-wheel-ctest.log) |

`TestInputSocket` (2.84 s) and `TestActuator` (2.25 s) passed first time in
the default tool sandbox, so no loopback escalation or rerun was needed.

## The compiled code did not change

Before editing, the existing `build/pr1502` binaries matched the task 03
receipt hashes. The agent recorded all 150 object hashes
([objects-pre.sha256](objects-pre.sha256)) and copied `FGLGear.cpp.o` and
`JSBSim` into `build/pr1502-task04-pre/` (gitignored, not distributed).

The edited build recompiled `FGLGear.cpp.o`, every other object that includes
`FGLGear.h` (31 objects in total; see build.log) and relinked `_jsbsim.so`.
All 150 object files are byte-identical to the pre-edit ones
([objects-post.sha256](objects-post.sha256)). `JSBSim` (`675f4f39…`) and
`_jsbsim.so` (`f1962f3e…`) have the same hashes as in the task 03 receipt
([binaries.sha256](binaries.sha256)). This held for this compiler and Release
configuration on this machine. It shows the renamed constants keep the
arithmetic exactly. It is not a claim about other toolchains.

## Where each documented claim comes from

| Claim | Source |
| --- | --- |
| Opt-in elements, units, positivity and error | `FGLGear` constructor (`FindElementValueAsNumberConvertTo` to FT and SLUG*FT2) |
| Tread force bound: staticFFactor × static_friction × normal load | `ConfigureWheelSpinRows`, `ftRoll.Max` |
| Axle one radius along the ground normal; lever arm from the CG to the axle | `axleLeverArm = vWhlContactVec + wheelRadius * vGroundNormal` |
| Wheel receives −radius × force | `ftRoll.WheelJacobian = -wheelRadius` |
| Wheel-to-axle torque bound BrakeFCoeff × normal load × radius; coefficient formula | `brake.Max`, `ComputeBrakeForceCoefficient` |
| Row conditions: tread slip and relative rate, for stationary terrain | Row Jacobians and `FGAccelerations::CalculateFrictionForces` rhs; `vdot`/`wdot` subtract terrain motion |
| Rolling wheel "generally" at the torque bound | Complementarity of a bounded row that targets zero relative spin (also the analysis comment's point 2). Not measured here. |
| Reaction torque cancels the axle offset moment while the spin is not accelerating | Algebra: Accel = 0 ⇒ λ_brake = R λ_roll; λ_roll (r_c + R n) × U − R λ_roll (n × U) = λ_roll r_c × U. Not tested numerically. |
| Side force unchanged, at the contact point | `ComputeJacobian`, `ftSide` |
| Legacy rolling_friction bounds the rolling force at the contact point | `ComputeJacobian` BOGEY branch, `ftRoll.Max = fabs(BrakeFCoeff * vFn(eZ))` |
| Ground initialization in trim or at zero dt | `GetBodyForces` WOW block |
| RunIC keeps the spin state; ResetToIC zeroes it | `test_run_ic_keeps_spin_state`; `FGGroundReactions::InitModel` → `FGLGear::ResetToIC` |
| Airborne law, no reversal, no reaction torque | `GetBodyForces` `!WOW` block; no multipliers registered in the air |
| Brake command normalized 0 to 1 | `FGFCS.h` `SetLBrake` docs, `fcs/*-brake-cmd-norm` |
| Finite-decrement holding condition | The clamp `max(0.0, fabs(relativeRate) - decrement)` applied after the airframe rate changes |
| Ground and airborne axes, and when they coincide | `GetWheelSpinAxis`, `ComputeGroundFrame`; coincidence by algebra (n in span(up, forward) ⇒ n × proj(f) = up × f) |
| Jump in the reported rate at a transition | `GetWheelSpinRate`: −dot(PQR, s_new − s_old) with the state held (task 03 review) |
| Property frame and inverse setter | `GetWheelSpinRate`, `SetWheelSpinRate`, `bind` |
| Results can differ for aircraft without the elements | Commit `74777dee` (reordered solver arithmetic); [../f16-divergence.json](../f16-divergence.json) |

The 13 and 100 provenance statements are the task prompt's. No reference or
calibration was cited or invented.

## Uncertainty and things left unchanged

- Doxygen is not installed here, so the rendered class page was not checked.
  The markup matches the surrounding block (`\<element>`, `<b>`, `<ul>`).
- No banked or steered contact-transition experiment was run. The axis
  statements rest on source reading and algebra, as in task 03.
- The engine does not clamp brake commands to 0 to 1. The docs call the
  command normalized, as `FGFCS.h` does. A larger value raises both the
  airborne decrement and `BrakeFCoeff`. This behavior predates the task.
- The linked analysis writes the right-hand sides without their leading minus.
  It calls the reference frame NED, where the code uses `FGPropagate::GetPQR()`
  (ECEF-relative), and it ignores terrain motion. The source comment states
  both conditions itself and says "for stationary terrain". It does not
  comment on the analysis.
- The URL is only above `ConfigureWheelSpinRows`, as specified. Doxygen does
  not show that comment. The class block does not link it.
- The existing `GetWheelSpinAxis` comment is accurate and was left as is.
  `FGAccelerations.cpp:128` says "absolute angular velocity". That line
  predates this work, is unrelated, and was left unchanged.
- The top-level [README](../README.md) does not index the task folders and was
  not edited.

## Follow-up after planner review (2026-09-19)

This section responds to [review.md](review.md). Everything above records the
original commit `8924c176` and is left as written. Two rows in its claim table
are superseded: "Finite-decrement holding condition" and the coincidence
clause of "Ground and airborne axes". The original row derived
coincidence from coplanarity alone. That misses the sign: with
`n = a up + b forward`, the ground axis is `sign(a) (up x forward)`, so it
coincides only when `a > 0`.

- Commit: `9d0794e93a340957d068ad6e2413d066d3c768dd`
- Parent: `8924c17603aa322cdde684440ada1a061e137e7d`
- Subject: **Clarify wheel spin limits and axis alignment**
- File: `src/models/FGLGear.h` only (+13/−8), class documentation only.
  [followup-show-stat.txt](followup-show-stat.txt),
  [followup-show.diff](followup-show.diff),
  [followup-commit-message.txt](followup-commit-message.txt).

Starting state: branch `feature/wheel-spin-dof`, HEAD exactly `8924c176…`,
clean tree, no 04.json. The two fragments were replaced with the planner's
exact text, keeping its line breaks and the block's 4-space indent. The
lines before and after each fragment were left alone.

Checks run for the follow-up:

- `git diff --check` passed.
- The full diff and a word diff were inspected. Only the two fragments change.
- A script checked `src/models/FGLGear.h` against HEAD with whitespace
  normalized. Both replacements match the prompt verbatim, and no other text
  differs.
- No added line exceeds 80 columns.
- `git show --check HEAD` passed. The working tree was clean after the commit.

No rebuild, simulation or test was run for this follow-up. The build and test
logs above belong to `8924c176`, not to `9d0794e9`. The original task 04 logs,
hash manifests and diffs were checked unchanged by SHA-256 after the
follow-up records were added.
