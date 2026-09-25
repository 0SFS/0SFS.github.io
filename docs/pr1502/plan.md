# PR #1502: review round published

Publication complete, 2026-09-19: the six reviewed commits are pushed at
`499c3832`. The user approved the drafts and then asked the planner to correct
misplaced replies and complete posting. Two existing comments were corrected,
one correct reply preserved, and six missing thread replies posted. All nine
parent IDs and message bodies were read back and verified. The
[round comment](https://github.com/JSBSim-Team/jsbsim/pull/1502#issuecomment-5744732853)
and replacement PR body are published. See the
[publication record](../../validation/evidence/jsbsim/wheel-spin-review/final/publication-actions.json).

Threads remain unresolved for the maintainer's next review. At publication
verification CI had 26 successful, one running and one skipped check; no
failed check. The final CI result remains unconfirmed: a later read-only
refresh was blocked by the account usage limit. No 0sfs commit, merge,
rebase, packaging or downstream adoption
was performed. The review and pre-publication snapshots below are retained
as dated evidence.

Final review, 2026-09-19: **all five implementation tasks and final validation
are accepted** at `499c38326bb6f39b6360bd82d74c5c00e64faeaf`. The complete
round is six new commits on `feature/wheel-spin-dof`, including task 04's
comment-only follow-up. No further implementation or validation task is
pending for this round.

The planner reviewed the combined seven-file diff from `24e085bf`, the
analytical/frame regressions and mutation controls, and the final comparison.
The [final review record](../../validation/evidence/jsbsim/wheel-spin-review/final/review.md)
contains the numerical decision and limitations; the
[measurements](../../validation/evidence/jsbsim/wheel-spin-review/final/README.md)
distinguish fresh comparison results from reused tests. The
[posted replies](replies.md) describe the completed candidate, with nine
thread replies, a round comment and the replacement PR body.

- Candidate tests: Python ON **79/79**, Python OFF **21/21**; the already
  reviewed exact-source results were reused after checking source and binary
  hashes. No tests or simulations were repeated by the final reviewer.
- Fresh comparison: four binaries, all 61 XML inputs, 102 data files and
  11,877,246 trace rows per binary. Original/base and final/probe data are
  byte-identical. Base/final differ in **60 files across 31 of 57 successful
  simulations**, exactly reproducing every retained probe diagnostic.
- **Numerical decision:** accept the common-Jacobian arithmetic change for
  this review round. Its equations are equivalent and the analytical tests
  pass; the final result adds no disabled-wheel difference beyond that change.
  Crosswind and moored-ZLT forces/moments are not uniformly small, and F-16
  diverges after extreme impacts. Disclose those results and withdraw the
  old universal “unaffected” claim. No general error bound or real-aircraft
  calibration is established by this comparison.
- Before publication on 2026-09-19, GitHub still had head `24e085bf`, open
  and mergeable, with changes requested, nine unresolved/current threads
  and no author replies. Its 27 successful and five skipped checks applied
  to that old head. This snapshot is superseded by the publication record
  above; see the historical
  [read-only snapshot](../../validation/evidence/jsbsim/wheel-spin-review/final/live-pr-review.json).

**Remaining:** follow CI and the maintainer's next review. This round's
implementation and publication are complete. The [posted texts](replies.md)
link each maintainer thread. Local documentation/evidence remain uncommitted.

| Accepted task | Approved commit | Planner review |
| --- | --- | --- |
| 01, explicit Jacobians | `74777dee` | [Review](../../validation/evidence/jsbsim/wheel-spin-review/task01/review.md) |
| 02, bounds and names | `bcf7d272` | [Review](../../validation/evidence/jsbsim/wheel-spin-review/task02/review.md) |
| 03, relative frame and airborne damping | `18e8454e` | [Review](../../validation/evidence/jsbsim/wheel-spin-review/task03/review.md) |
| 04, documentation plus follow-up | `9d0794e9` (after `8924c176`) | [Review](../../validation/evidence/jsbsim/wheel-spin-review/task04/review.md) |
| 05, native tests | `499c3832` | [Review](../../validation/evidence/jsbsim/wheel-spin-review/task05/review.md) |
| 06, validation only; no new commit | `499c3832` | [Final review](../../validation/evidence/jsbsim/wheel-spin-review/final/review.md) |

The local JSBSim receipts 01–05 remain the exact-source approval chain.
The completed [validation handoff](tasks/06-final-validation.md) required
05.json and made no new commit. Retained tools belong under
`scripts/validation/jsbsim/`, evidence under `validation/evidence/jsbsim/`;
see the [layout](../validation/layout.md). The evidence/tool relocations were
separate from engine review and preserved historical records.

The planning snapshot below predates implementation.

Planning record, refreshed 2026-09-18. **No implementation task has been
launched, no commit made, and nothing posted or pushed.** The probes described
below are build inputs under JSBSim `build/`, not changes on the PR branch.

Accept the common-Jacobian cleanup and the airframe-relative property. Fix the
airborne frame defect in this round, retain but explicitly label the authored
brake spin-down approximation, and add a native analytical test. Correct the
compatibility claim: the cleanup is mathematically equivalent for aircraft
without the wheel elements, but it does change their numerical results.

## Refreshed starting state

- [PR #1502](https://github.com/JSBSim-Team/jsbsim/pull/1502) is open, non-draft,
  mergeable (`clean`), with `CHANGES_REQUESTED`. Head is
  `24e085bf81b5ef8bab8500ab9d416571753b93cc`; parent/base is
  `d0d8bc6e9233a6c283898896d7bbac6d9af1888b`.
- Upstream master is `29d2d6b8031569655560e260850c42314ab83ef0`, four commits
  ahead of the PR base. Head checks: 27 successful, five skipped.
- Nine review threads, ten inline comments including the follow-up on the
  duplicated loop. All nine are unresolved and current. No author replies.
- The full September 13 [analysis](https://github.com/JSBSim-Team/jsbsim/pull/1502#issuecomment-5654721219),
  Sean's September 15 [link request](https://github.com/JSBSim-Team/jsbsim/pull/1502#issuecomment-5680186393),
  and September 18 [review](https://github.com/JSBSim-Team/jsbsim/pull/1502#pullrequestreview-5248857258)
  were reread, not inferred from the prompt. His statement that further
  comments will follow remains open; these fixes do not purport to answer
  unspecified errors.
- Canonical JSBSim initially was clean on `master`,
  `f0d1023a41d8eedf3bbcd2b17a91117f76a90f04`. It contains the original PR
  commit. The planner switched the clean checkout to the PR branch for builds,
  informing the user, then restored the original clean `master` after the
  measurements. Build experiments use archived source trees, not extra git
  worktrees. No engine source was edited in the canonical checkout. Switching
  to the older PR branch exposes pre-existing ignored `wasm/` build artifacts
  because that branch lacks the subtree ignore files; restoring master hides
  them again without deleting or moving them. Task 01 explicitly preserves
  these leftovers under `build/` during later implementation so its branch
  can remain clean.
- The user's existing dirty edits to `docs/open-upstream-prs.md` and untracked
  review prompt are preserved. The tracker edit for this task is just a link
  and a statement that this measured plan supersedes its preliminary #1502
  hypotheses.

The [evidence directory](../../validation/evidence/jsbsim/wheel-spin-review/README.md)
contains the fetched records, retained harness/probe sources, build/test logs,
file hashes and numerical summaries. Raw multi-gigabyte simulation outputs
remain scratch; the durable record does not depend on a link into `build/`.

## Thread decisions

| Root comment | Decision | Change and reason | Task |
| --- | --- | --- | --- |
| [4047586942](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047586942) | Accept | `InvInertia` → `Jinv`, consistent with the body's inverse inertia. Keep units. | 01 |
| [4047828797](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047828797) | Accept with a wording clarification to discuss | Remove “absolute.” Use “ground reference frame” and identify the existing `in.PQR` reference. `FGPropagate::GetPQR` explicitly says ECEF-relative, whereas the analysis calls it NED. Do not introduce a transported-NED correction merely to match a comment. Explain this narrow distinction in the reply. | 03 |
| [4047612197](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047612197) | Accept with a corrected compatibility claim | Every row receives an explicit `MomentJacobian`; remove `LeverArm` and `UseMomentJacobian`. Algebra is equivalent, operation order is not. The reply must give the measured differences below. | 01 |
| [4047622267](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047622267) | Accept | Remove the `moment` lambda once every row initializes its moment. | 01 |
| [4047650299](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047650299), follow-up [4047870001](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047870001) | Accept | One matrix loop, RHS and final accumulation; only shared-wheel terms are conditional. The branch and its `continue` disappear. Preserve cross-row wheel products, not just diagonal squares. | 01 |
| [4047682190](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047682190) | Accept | Configure tire grip in `ConfigureWheelSpinRows`; keep wheel/brake bounds visibly distinct. Move both roll Max and Min. | 02 |
| [4047708987](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047708987) | Accept | Configure before the two warm-start clamps. Keep registration order roll, side, brake because PGS ordering affects numerics. | 02 |
| [4047742902](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047742902) | Accept | `rollDirection`, `axleLeverArm`; they denote a unit force direction and CG-to-axle position respectively. | 02 |
| [4047795134](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047795134) | Accept with complete read/write semantics | Keep `wheel-spin-rad_sec`. Getter is `Rate − dot(in.PQR, spinAxis)`; setter applies the inverse. Internal state remains in the existing solver reference frame. The original property was writable, so a getter-only conversion would silently change its contract. | 03 |

The reference-frame distinction is supported by the actual wiring:
`FGFDMExec::LoadInputs(eGroundReactions)` supplies `Propagate->GetPQR()` to
`FGLGear::in.PQR`; the same getter feeds the acceleration model. See
[FGFDMExec.cpp at the PR head](https://github.com/JSBSim-Team/jsbsim/blob/24e085bf81b5ef8bab8500ab9d416571753b93cc/src/FGFDMExec.cpp)
and [FGPropagate.h](https://github.com/JSBSim-Team/jsbsim/blob/24e085bf81b5ef8bab8500ab9d416571753b93cc/src/models/FGPropagate.h).
NED axis expression at a fixed ground location and rotation relative to a
transported NED frame are different concepts. This round changes neither the
reference dynamics nor terrain-motion handling. The neutral wording lets the
mechanical fix proceed without asserting a new coordinate transformation.

## Findings confirmed or rejected

### 1. Byte identity: confirmed lost; “only rounding-level outputs” rejected

The planner rebuilt the base, original head and a scratch candidate changing
only the common Jacobian representation/assembly. The exact candidate can be
recreated with retained `make_solver_probe.py`; it includes no frame, bound,
brake or documentation changes. All three binaries ran **every one of the 61
`scripts/*.xml` inputs**, each in a separate working/output directory.

The directory contains 58 runscript documents, two output directives and one
plotset, not 61 runnable simulations. There were 57 successful runs per
binary. `737_cruise_steady_turn_simplex.xml` exits 1 at trim in all three;
`kml_output.xml`, `unitconversions.xml`, and `plotfile.xml` exit 255 when
offered as scripts. These identical failures are recorded, not counted as
successful compatibility tests.

Two comparison passes were retained: all naturally emitted files, and the
same inputs with an additional per-step state/gear trace. The latter emitted
102 data files per binary and 11,877,246 trace rows including 13 initialization
rows from the failed trim input (11,877,233 rows from successful runs).

| Comparison | Natural outputs | With per-step trace |
| --- | --- | --- |
| Base → original PR | All emitted data files byte-identical | All 102 files byte-identical |
| Base → common-Jacobian probe | Data differs for 10 successful runs | Data differs for 31 of the 57 successful runs; 26 successful runs remain identical |

There were no output-shape differences, exit-status differences or differing
non-finite values in the comparisons. These observations are for this compiler, architecture and
input set; they are not a universal stability bound. Console banners/timings
were retained separately and excluded from *data* identity.

Representative maximum absolute differences from the per-step traces:

| Run | Body u (ft/s) | Pitch (rad) | Altitude (ft) | Body gear Fx (lbf) |
| --- | ---: | ---: | ---: | ---: |
| `c172_runway_at_rest_cg_shift` | 1.3143e−14 | 1.5805e−15 | 0 | 6.7756e−11 |
| `B737_Runway` | 2.4778e−9 | 8.9845e−11 | 1.1176e−8 | 1.9779e−4 |
| `c172_cross_wind` | 0.054043 | 3.6853e−4 | 0.0023394 | 197.33 |
| `f16_test` | 71.644 | 0.23604 | 17.819 | 179038 |

The initial crosswind differences are about 1e−15 in accelerations, but the
time history magnifies them. Same-binary repeats of crosswind and the CG-shift
run were byte-identical for both original head and probe. The F-16's large
differences occur after extreme ground impacts: u differences remain below
1e−6 ft/s until 127.908 s, when gear Fx is already approximately −2.11 million
lbf. Both trajectories then go below ground; the largest u difference occurs
at 185.033 s. The retained [impact diagnostic](../../validation/evidence/jsbsim/wheel-spin-review/f16-divergence.json)
records the actual values. This supports sensitivity to the changed arithmetic
and contact sequence, not an assertion that 71.6 ft/s is a harmless error.

**Decision:** accept the algebraic cleanup, retain the measured disclosure,
and withdraw universal “unaffected”/byte-identity language. Existing tests,
the analytical row test and close ordinary rollout traces are appropriate
acceptance evidence; matching a post-impact F-16 trajectory is not a physical
accuracy criterion. Do not claim that every changed output differs only by a
few ULPs. At implementation review, disabled-wheel outputs must match this
measured probe exactly: **zero additional numerical difference** is allowed
without returning to the planner. This catches accidental changes beyond the
accepted arithmetic reordering. Final claims must use the final committed
candidate, not silently promote the probe to a finished patch.

The historical 1.8 M-row and WASM identity claims are not carried forward as
fresh evidence: their harness was not retained, and no revised WASM candidate
was tested here.

### 2. Airborne damping frame: confirmed by code and executable counterexample

For positive forward rolling, `s = groundNormal × rollDirection`. Standard
unsteered gear has `s = −bodyY`. A wheel fixed relative to a body pitching at
q=+0.4 rad/s has internal spin −0.4 rad/s. At original head, one braked airborne
step takes that internal spin to zero while body q becomes 0.400000007495.
Relative spin therefore changes from zero to **0.400000007495 rad/s**.
See [reproducer and log](../../validation/evidence/jsbsim/wheel-spin-review/airborne-frame.log).

Fix it in task 03, together with the exported frame, because otherwise the
new property exposes a known inconsistent locked-wheel state. Keep the scalar
internal spin representation. In the air construct the axis from gear
orientation and steering: `mTGear * (sin(steer), −cos(steer), 0)`. On the ground
use the exact axis of the existing brake row. Let `b = dot(in.PQR,s)` and
`r = Rate−b`; update to `b + sign(r)*max(0,abs(r)−decrement)` for positive dt
outside trim. Do not damp during zero-time initialization or trim. Public
writes use `Rate = requestedRelativeRate + b`.

This retains the existing idealized scalar axle model. It does not establish
general gyroscopic/vector transport behavior, cambered-wheel continuity,
rotating-terrain correctness, or angular-momentum conservation for the
heuristic airborne drag, which currently has no airframe reaction torque.
Those are not silently added to this cleanup round.

### 3. Additional airborne brake deceleration: confirmed undocumented heuristic

The only source for 100 ft/s² is its introduction in the original PR. Neither
the code nor the PR supplies a physical derivation or measurement. The 13
ft/s² value is visibly copied from the legacy animation proxy. Ground
`BrakeFCoeff * normalLoad * radius` is zero in the air and cannot justify 100.

Task 04 names the two constants and documents this provenance and limitation.
**Keep their numerical values this round.** Removing the brake increment
would lose intended airborne braking, and inventing a coefficient or torque
calibration would expand the model without evidence. This resolves the
unexplained number honestly; it does **not** qualify the approximation as
physical brake dynamics. State this unprompted documentation change in the
round comment. A calibrated torque parameter is separate design work, not an
agent choice hidden in this task.

### 4. `WheelCoeff`: confirmed a scalar Jacobian entry

Rename it `WheelJacobian` in task 01. It multiplies wheel rate on the RHS and
appears as `w_i*w_j/I` in the matrix. For a roll row it is −R and for a brake
row +1; its units depend on the constraint. Keep the shared row machinery,
with explicit comments stating both physical constraints. Do not separate
`ftRoll`/`ftWheelBrake` into solvers or classes while simultaneously accepting
the request to consolidate the solve.

Per-gear force getters still report the same force vector; the changed axle
moment belongs in the acceleration solve. No getter workaround is needed.

## Documentation and native test

Task 04 updates the existing `FGLGear.h` class block where aircraft authors
find the XML elements. It explicitly explains the reinterpretation of
`rolling_friction` as wheel/axle resisting torque when enabled, versus tire
hysteresis/rolling resistance in the legacy model. The comment above
`ConfigureWheelSpinRows` links the complete analysis URL and states both row
tuples. This directly answers Sean's link request.

Add the CxxTest in this round (task 05). The PR-head
`.github/workflows/coverage.yml` uses `BUILD_PYTHON_MODULE=OFF` and selects
`ctest -R Test1`: the Python wheel test cannot contribute there. The cited
[#1491](https://github.com/JSBSim-Team/jsbsim/pull/1491) did include
`FGExternalReactionsTest.h`, but it is precedent, not a mandate. Native tests
are justified here by a solver change that touches every contact and needs
analytical checks independent of the Python aircraft fixture. Test the real
public acceleration `Run(false)` path, shared/distinct wheel couplings, both
constraint residuals, torque signs, bounds and zero dt. Do not expose private
methods or chase a coverage percentage.

## Order, commits and review gates

The baseline work proposed in the original prompt has already been done by
the planner. There is no need to launch an agent just to reconstruct it again.
The evidence README gives its verified reproduction commands. The only
baseline renewal needed before implementation is checking that live/source
identities and toolchain still match.

| Order | Task prompt | Commit subject | Dependency |
| --- | --- | --- | --- |
| 01 | [Explicit Jacobians](tasks/01-explicit-jacobians.md) | Use explicit moment Jacobians for friction | Exact original head |
| 02 | [Row bounds](tasks/02-wheel-row-bounds.md) | Configure wheel friction bounds before clamping | 01 reviewed |
| 03 | [Relative spin and airborne frame](tasks/03-airframe-relative-spin.md) | Report wheel spin relative to the airframe | 02 reviewed |
| 04 | [Model documentation](tasks/04-model-documentation.md) | Document wheel friction and airborne spin-down | 03 reviewed |
| 05 | [Native tests](tasks/05-native-constraint-tests.md) | Test wheel constraints without Python | 04 reviewed |

Use the canonical checkout and sequential execution. This avoids shared-file
conflicts and the load-sensitive actuator test observed during planning. The
native-test task has disjoint files but is deliberately not launched in
parallel. No worktree is required. If a later planner chooses concurrency,
only disjoint-file tasks may run that way, in separate worktrees under JSBSim
`build/`, never in the canonical checkout simultaneously.

Each prompt requires one new commit on `feature/wheel-spin-dof`, no amendment
or rebase. After **each** task, the planner reads the full diff, checks its
evidence and then writes an approved handoff receipt containing the exact
40-character commit and parent hashes. Later prompts require that receipt
and refuse an arbitrary branch tip. Future commit hashes cannot be known
before execution; this explicit receipt protocol supplies them without
leaving an agent to guess its starting state. Do not launch a dependent task
without its predecessor's approved receipt.

The planner keeps physics judgment, the frame/sign derivation, interpretation
of numerical changes, final acceptance and public wording. Sonnet-class
agents can execute the specified math and mechanical edits, but they cannot
approve a different frame, damping law, tolerance, or unexplained output.
Task 03 receives a particularly careful manual review. The planner also
re-derives the native analytical expected values rather than trusting the
test author's assertions.

After task 05, the planner owns the final integration gate, delegating routine
execution per the user's preference:

1. Inspect the full diff from the original PR head and all five commits.
   Confirm no app/packaging/unrelated files and no untracked test inputs.
2. Verify the task 05 Python-enabled 79/79 and Python-disabled 21/21 evidence
   belongs to the exact final source. Reuse these already-reviewed passes
   while source/build identity remains unchanged; rerun only if that check
   reveals a change or unresolved concern. Capture exact source and artifacts.
3. Delegate running the retained 61-input harness with `--trace`, comparing immutable base,
   original head, measured solver probe and final candidate. Disabled-wheel
   candidate data must match the probe byte-for-byte. All exit classifications
   and output shapes must match; do not excuse new failures as existing ones.
4. Check the new getter/airborne regressions fail for the old behavior and
   pass for the final candidate. Task 03's reviewed controls and task 05's
   reviewed candidate/sensitivity logs satisfy this while source is unchanged.
5. Update retained evidence and [reply drafts](replies.md), replacing their
   final-candidate pending fields only with actual measurements. Preserve
   the original-head/probe distinction and every diagnosed failure.
6. Present the complete round to the user. **The user pushes once and posts
   the replies/body/round comment together.** This planning request authorizes
   neither those actions nor the launching of these task agents.

Keep new commits on the existing branch. Upstream squash-merges, the branch
is mergeable, and preserving its published ancestry protects review context.
Rebase only if an actual conflict later forces reconsideration; an executing
task must stop and report rather than rebase itself.

## Verified tests and limitations

Original-head Release build with the supplied Python interpreter succeeded.
`TestWheelSpin` passed; the idle full run passed **78/78**. An earlier
sandboxed run failed only `TestInputSocket` with loopback `PermissionError`;
that test passed with loopback access. A full run during competing builds
failed only `TestActuator.test_regression_bug_1503`'s timed subprocess check;
the idle rerun passed. Retain all logs, not just the green result. The
historical telnetlib3 timeout remains a known caveat, not the explanation for
either new diagnostic above.

The common-Jacobian probe passed **20/20 CxxTests with Python disabled** and
`TestWheelSpin` and the full **78/78 CTest suite** after enabling Python. The seven
planned analytical fixtures were also exercised through the public acceleration
API; see the retained `solver-cases.log`. Final implementation and its new tests
have not been run because they do not exist yet. No new coverage percentage,
WASM result or aircraft calibration is claimed.

## Separate downstream work

Fork `master` and installed fork.7 carry the old `24e085bf` behavior. Bringing
this reviewed round onto fork `master`, packaging/installing a new WASM
artifact, and wiring the 0sfs wheel meshes from the body-relative property
listed in `TODO.md` are separate work. They are noted here, not planned or
performed by this round.
