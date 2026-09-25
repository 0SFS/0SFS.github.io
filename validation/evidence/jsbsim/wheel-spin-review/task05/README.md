# Task 05 agent record: awaiting planner review

Planner update, 2026-09-19: accepted at
`499c38326bb6f39b6360bd82d74c5c00e64faeaf`; see [review.md](review.md).
The original execution record below is retained.

Written 2026-09-19 by the executing agent. This is not an approval. The
planner's review and `build/pr1502-handoff/05.json` are separate.

- Commit: `499c38326bb6f39b6360bd82d74c5c00e64faeaf`
- Parent: `9d0794e93a340957d068ad6e2413d066d3c768dd` (approved task 04 receipt)
- Subject: **Test wheel constraints without Python**
- Files: `tests/unit_tests/FGAccelerationsTest.h` (new, 361 lines) and
  `tests/unit_tests/CMakeLists.txt` (`FGAccelerationsTest` appended to
  `UNIT_TESTS`). See [show-stat.txt](show-stat.txt), [show.diff](show.diff) and
  [commit-message.txt](commit-message.txt). `git diff --check` and
  `git show --check` passed. No attribution trailer was supplied, so none was
  added.

Starting state: the canonical checkout was clean and already on
`feature/wheel-spin-dof`, so no branch switch was needed and nothing moved
away from `master`. The receipt check in the task prompt passed: HEAD equalled
the approved 04 commit and `24e085bf` is its ancestor. The 04 receipt records
78/78 at `8924c176` and no build for the comment-only `9d0794e9`.

## What the test does

The test uses a fresh `FGFDMExec` per method. It calls
`GetAccelerations()`, `InitModel()`, sets every field of the public `in`
struct and calls `Run(false)`. It uses no private access, production hooks,
aircraft, files or full FDM step. Hold-down is set off and
`simulation/gravitational-torque` is set to 0. Wheels are declared before the
rows, the rows before the vector and the vector before the executive, so all
of them outlive the solve.

The hand-derived expectations match the planning probe values in
[../solver-cases.log](../solver-cases.log) (recorded at the original PR head).

| Method | Case | Main expectations |
| --- | --- | --- |
| `testFrictionWithoutWheel` | 1 | λ = −32, F = (−32,0,0), M = (0,−32,0), u̇ = −16, q̇ = −4 |
| `testFreeWheel` | 2 | λ = −160/13, wheel Accel = 160/13, M_y = λ (not 2λ), roll residual 0 (1e-6) |
| `testBrakeBetweenWheelAndAirframe` | 3 | λ = Accel = −400/9, q̇ = −50/9, Rate+q → 0 and 8q − Rate = 13 (1e-6) |
| `testRollAndBrakeOnSameWheel` | 4 | λ = −360/17, −280/17, Accel = −λ_roll + λ_brake = 80/17, both residuals 0 (1e-6) |
| `testBrakeAtItsLimit` | 5 | warm start +10 is projected to λ = −2, Accel = −2, relative spin 5 → 4.775, M_y − Accel/Jinv = 0 |
| `testRowsOnDifferentWheels` | 6 | λ = 20/3, −40/3, Accel = −20/3, 40/3, no moment |
| `testZeroTimeStep` | 7 | λ and Accel finite and 0 (Accel reset from 123), Rate stays 3, everything else 0 |
| `testEmptyMultiplierList` | 7 | friction of −32 from a first solve is cleared to exactly 0 once the list is empty |

The tolerances are 1e-5 for values, forces, moments and accelerations, 1e-6
for next-step residuals and 1e-12 for quantities that must be exactly zero.
The task gave no tolerance for the case 4 residuals, so the agent used the
1e-6 of cases 2 and 3. The margin comes from the planning probe's
full-precision λ, which differ from the exact values by 3.33e-6 and 2.59e-6
at the PGS stop. They give a roll residual of 3.14e-7 and a brake residual of
about 4e-16. That margin was computed from the planning log, not measured at
this commit. CxxTest does not print values on a pass.

## Commands and results

Canonical checkout, run in this order with no other builds or tests running:

| Command | Exit | Result | Log |
| --- | --- | --- | --- |
| `cmake -S . -B build/pr1502 -DCMAKE_BUILD_TYPE=Release -DBUILD_PYTHON_MODULE=ON -DPython3_EXECUTABLE=…/.venv/bin/python` | 0 | configured (CxxTest cached: `/opt/homebrew/include`) | [configure.log](configure.log) |
| `cmake --build build/pr1502 -j` | 0 | no warnings; 30 library objects recompiled because `9d0794e9` changed `FGLGear.h` since the last build, plus the new test and `_jsbsim.cxx` | [build.log](build.log) |
| `ctest --test-dir build/pr1502 -R '^FGAccelerationsTest1$' --output-on-failure` | 0 | 1/1 | [new-test-ctest.log](new-test-ctest.log) |
| same with `-V` | 0 | "Running cxxtest tests (8 tests)", `.OK!` | [new-test-ctest-verbose.log](new-test-ctest-verbose.log) |
| `ctest --test-dir build/pr1502 -R TestWheelSpin --output-on-failure` | 0 | 1/1 | [wheel-ctest.log](wheel-ctest.log) |
| `ctest --test-dir build/pr1502 -j8 --output-on-failure` | 0 | **79/79**, 10.79 s | [full-ctest.log](full-ctest.log) |
| `cmake -S . -B build/pr1502-cxx -DCMAKE_BUILD_TYPE=Release -DBUILD_PYTHON_MODULE=OFF` (fresh directory) | 0 | "Found CxxTest: /opt/homebrew/include" | [cxx-configure.log](cxx-configure.log) |
| `cmake --build build/pr1502-cxx -j` | 0 | no warnings | [cxx-build.log](cxx-build.log) |
| `ctest --test-dir build/pr1502-cxx -N` | 0 | 21 tests listed, #21 `FGAccelerationsTest1` | [cxx-ctest-list.log](cxx-ctest-list.log) |
| `ctest --test-dir build/pr1502-cxx -R Test1 --output-on-failure` | 0 | **21/21** | [cxx-ctest.log](cxx-ctest.log) |
| `ctest --test-dir build/pr1502-cxx -R '^FGAccelerationsTest1$' -V` | 0 | 8 tests, `.OK!` | [cxx-new-test-verbose.log](cxx-new-test-verbose.log) |

Counts: 78 → 79 CTest targets and 20 → 21 `Test1` CxxTests, as predicted. No
other registration changed. `TestInputSocket` (2.86 s) and `TestActuator`
(2.28 s) passed the first time in the default tool sandbox, so no loopback
escalation or rerun was needed. Running the test created no files in its
working directory (`build/pr1502/tests/unit_tests`, listing compared before
and after).

After the commit:

| Command | Exit | Result | Log |
| --- | --- | --- | --- |
| `cmake --build build/pr1502 -j` | 0 | nothing recompiled or relinked | [post-commit-build.log](post-commit-build.log) |
| `ctest --test-dir build/pr1502 -R '^FGAccelerationsTest1$\|TestWheelSpin' --output-on-failure` | 0 | 2/2 | [post-commit-ctest.log](post-commit-ctest.log) |
| `cmake --build build/pr1502-cxx -j` | 0 | nothing recompiled or relinked | [post-commit-cxx-build.log](post-commit-cxx-build.log) |
| `ctest --test-dir build/pr1502-cxx -R Test1 --output-on-failure` | 0 | 21/21 | [post-commit-cxx-ctest.log](post-commit-cxx-ctest.log) |

The committed blobs have the same SHA-256 as the tested working files:
`FGAccelerationsTest.h` `3582faf6…de70e`, `CMakeLists.txt` `faa62066…7f204b`.

## Off-diagonal sensitivity check

`git archive HEAD` (then `9d0794e9`) plus the two working files were
extracted to JSBSim `build/pr1502-task05-mutant-source`. The archived test
files had the hashes above. That copy was configured with
`cmake -S build/pr1502-task05-mutant-source -B build/pr1502-task05-mutant -DCMAKE_BUILD_TYPE=Release -DBUILD_PYTHON_MODULE=OFF`
([mutant-configure.log](mutant-configure.log), CxxTest found). Only
`--target FGAccelerationsTest1` was built. The canonical checkout was never
mutated.

| Mutation of `FGAccelerations.cpp` | Diff | Result | Logs |
| --- | --- | --- | --- |
| Drop the shared-wheel term off the diagonal (`&& i == j`), keeping it on the diagonal (required check) | [mutant-omit-offdiagonal.diff](mutant-omit-offdiagonal.diff) | ctest exit 8. Only `testRollAndBrakeOnSameWheel` fails (1 of 8): λ = −12.4137, 1.3793 (the exact solution of `[[13/8,1/8],[1/8,9/8]]` is −360/29, 40/29), residuals −0.138 and 1.241 | [build](mutant-omit-offdiagonal-build.log), [ctest](mutant-omit-offdiagonal-ctest.log) |
| Reverse the sign of that term (extra; for this fixture w₁w₂ = −1, so squaring it gives the same +1) | [mutant-flip-offdiagonal.diff](mutant-flip-offdiagonal.diff) | ctest exit 8. Only case 4 fails: λ = −40, 40 | [build](mutant-flip-offdiagonal-build.log), [ctest](mutant-flip-offdiagonal-ctest.log) |
| Restored (byte-equal to HEAD) | none | 1/1 passed | [build](mutant-restored-build.log), [ctest](mutant-restored-ctest.log) |

In both mutants, `wheel.Accel == -roll.value + brake.value` still holds. That
assertion checks how the wheel acceleration is accumulated, which neither
mutation touches. The value and residual assertions catch the defect.

## Uncertainty and things left unchanged

- CxxTest unit tests have no licence header. The agent followed the GPLv3
  header of the PR's own `tests/TestWheelSpin.py` (same author and year) in C
  comment form. The planner may prefer another header.
- Each `FGFDMExec` prints the JSBSim startup banner at the default debug level,
  eight times per run. Other suites that construct an executive do the same,
  so it was left alone.
- One fixture cannot distinguish the squared defect from the sign-flipped one.
  Doing so would need a shared wheel with |w₁w₂| ≠ 1, which is outside the
  specified cases.
- The retained planning probe
  `scripts/validation/jsbsim/wheel-spin-review/check_solver.cpp` uses the
  pre-rename fields `InvInertia` and `WheelCoeff`, so it does not compile
  against this branch. It is a historical record and was not changed.
- JSBSim `build/` scratch from this task (gitignored, not distributed):
  `pr1502-cxx`, `pr1502-task05-mutant`, `pr1502-task05-mutant-source`,
  `pr1502-task05-FGAccelerations.cpp.orig` and
  `pr1502-task05-unit-dir-before.txt`.
