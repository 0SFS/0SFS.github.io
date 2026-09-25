# Task 05 review — accepted

Reviewed 2026-09-19.

Commit: `499c38326bb6f39b6360bd82d74c5c00e64faeaf`  
Parent: `9d0794e93a340957d068ad6e2413d066d3c768dd`  
Subject: **Test wheel constraints without Python**

No blocking findings. All five implementation tasks are accepted. The
planner's 05.json receipt authorizes the final validation handoff; it does
not authorize a push, public replies or a new implementation change.

## Code and analytical review

Read the complete committed diff and verified it against the saved show.diff.
Only the new test and its CMake registration changed. HEAD/parent/branch are
as reported, parent matches approved task 04, and the tree is clean.

Checked all 21 public input fields against the test's assignments. Each case
has a fresh executive; hold-down and gravitational torque are disabled;
planet, terrain and other forces are zero. Body/inertial rates agree, and
pure pitch makes the free rotational cross terms vanish in the brake cases.
The row/vector/wheel lifetimes are valid through Run(false) and destruction.
The actual solver is called without a whole-FDM step overwriting the inputs.
The existing vector assertion helper uses this suite's epsilon as intended.
The empty-list case first creates nonzero friction, so it tests clearing
stale state rather than merely observing constructor zeros.

Independently re-derived the expected values from the velocity Jacobians
and inverse mass/inertia, with exact rational arithmetic:

| Case | Effective matrix or coefficient | Solution |
| --- | --- | --- |
| Legacy row | 5/8 | lambda = −32 |
| Free wheel | 13/8 | lambda = −160/13, wheel acceleration = 160/13 |
| Brake | 9/8, initial relative rate 5 | lambda = −400/9; angular momentum 8q − Rate stays 13 |
| Shared wheel | [[13/8, −7/8], [−7/8, 9/8]] | lambdas = −360/17, −280/17; wheel acceleration = 80/17 |
| Clamped brake | bounds ±2 | lambda = −2; next relative rate = 191/40 = 4.775 |
| Separate wheels | diag(3/2, 3/2) | lambdas = 20/3, −40/3 |
| Zero dt / empty list | zero free acceleration; no velocity/dt term / no rows | finite zeros, with Rate unmodified |

The wheel axis is −Y, so the brake's positive scalar wheel torque contributes
negative physical Y torque; the angular-momentum and equal/opposite-torque
assertions use the correct signs. The separate-wheel case isolates accidental
pointer-independent coupling. No expected value is obtained by duplicating
the production solver in the permanent test.

The 1e−6 shared-row residual tolerance is appropriate. For this unclamped
fixture, the second row is solved last; the remaining first-row velocity
residual is dt × A12 × the final change in the brake multiplier. The solver's
sum-of-absolute-updates stop at 1e−5 therefore bounds its magnitude by
8.75e−7, apart from floating-point roundoff. The convergence factor is 49/117;
the summed multiplier error is 49/68 times the last update norm, below the
1e−5 value/moment tolerance. This is a derivation for this particular matrix,
not a claim that a PGS stopping norm generally bounds solution error.

The header follows the existing TestWheelSpin.py test-header precedent.
Standalone CxxTest executables explain the file-scope helpers/constants;
startup banners follow existing suites. Neither warrants a follow-up edit.

## Evidence review

Inspected the successful native and wheel logs, verbose eight-method output,
79/79 full suite, Python-disabled 21/21 selection and post-commit 2/2 plus
21/21 passes. The CMake caches confirm Release, Python ON/OFF respectively,
and the supplied interpreter for the Python-enabled tree. The new test is
registered in both generated CTest files and receives the existing coverage
setup. No hosted coverage percentage is claimed.

The Python-disabled configure log has the existing missing-LSB_Release
warning; configure succeeds and finds CxxTest. Build logs have no compiler
warning/error. The distinction is retained rather than claiming every
configuration message was warning-free. Socket and actuator passed first try.

Read both mutant diffs and failure logs. Removing only wheel off-diagonal
coupling changes the analytic solution to (−360/29, 40/29); reversing it
changes the solution to (−40, 40). Both agree with the observed failures,
which are restricted to the shared-wheel method. The restored copy passes.
Independently verified its test/CMake files and restored FGAccelerations.cpp
against the candidate committed blobs. Squaring and reversing the product
are the same mutation for these unit Jacobians; either defect is detected,
and distinguishing those mutants is not required.

The committed test and CMake SHA-256 values match the agent's reported
tested-source hashes. Post-commit builds compiled/relinked nothing. The
candidate executable and Python module still hash identically to the
approved task 03 build; native test executable hashes are recorded in 05.json.
The planner did not repeat the builds or simulations; the review checks
source, derivations, retained execution evidence and current artifact hashes.

The old check_solver.cpp probe intentionally uses the original names and
belongs to its historical source snapshot; no update is needed. Final
script comparison on the committed candidate remains outstanding. The
planner changed no engine source/branch/commit and launched no task agent.
