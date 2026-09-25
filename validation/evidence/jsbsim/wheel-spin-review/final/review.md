# Final review — accepted for this PR round

Reviewed 2026-09-19. Candidate:
`499c38326bb6f39b6360bd82d74c5c00e64faeaf`, clean on
`feature/wheel-spin-dof`. Six new commits follow the published original head
`24e085bf81b5ef8bab8500ab9d416571753b93cc`. No blocking findings for this
round; no further implementation or validation task is required before the
user reviews the drafts and publishes the response.

This is local acceptance of the review response, not upstream approval or
downstream adoption. Nothing was pushed, posted, resolved or committed by
the planner. The [plan](../../../../../docs/pr1502/plan.md) and
[reply drafts](../../../../../docs/pr1502/replies.md) now describe the completed
candidate rather than the planning probe.

## Combined-diff review

Reviewed the complete change from original PR to candidate: seven files,
+716/−133; the full PR against `d0d8bc6e` is eight files, +978/−26. The
round contains the five accepted tasks and task 04's comment-only follow-up.
No aircraft, application, packaging, generated output or unrelated engine
change is included. `git diff --check 24e085bf HEAD` passes.

The common solver uses explicit moment Jacobians for every row. Each
registered legacy row supplies `r × U`; the wheel roll row supplies the
axle moment and the brake row the opposite spin-axis moment. Obsolete fields,
the generalized branch and the moment lambda are absent. Shared wheel
coupling is conditional on the same non-null wheel pointer. Warm-start
bounds are configured before clamping, with registration still roll, side,
brake. Matrix symmetry reuse, normalization, iteration order, iteration cap
and stopping criterion are unchanged.

The public getter/setter and airborne damping use the same axle projection
and sign convention; internal integration, roll/brake Jacobians and slip
retain their meaning. `in.PQR` is supplied by `FGPropagate::GetPQR()`, whose
definition documents ECEF-relative rates expressed in body axes. The reply
explains the deliberate “ground reference frame” wording instead of silently
accepting transported-NED terminology. Stationary-terrain constraint
conditions are stated explicitly in the source comment.

The documented airborne approximation, finite stopping/holding limits and
ground/air axis transition limit agree with the accepted task 03/04 reviews.
The 100 ft/s² brake increment remains explicitly uncalibrated. No gyro model,
airborne reaction torque or contact-transition remapping was added. The
Python regression changes and native test registration remain the reviewed
ones; no tolerance was relaxed or test result repaired by changing a fixture.

## Independent evidence checks

The [verification record](review-verification.json) records the checks made
by the planner, independently of the execution agent's narrative:

- Exact clean HEAD, receipt 05 identity/hash, all eight source hashes and
  four candidate/test-binary hashes still match. The reviewed task 05 passes
  therefore remain applicable: 79/79 with Python, 21/21 without, followed
  by unchanged post-commit builds and 2/2 plus 21/21 passes. No build, test
  or simulation was repeated during this review.
- The final retained summary is byte-identical to the raw-run summary and
  matches its provenance hash. All four execution binaries match both the
  summary and recorded pre/post hashes. The rebuilt original head is a
  distinct artifact; it is not relabeled as the historical binary.
- All 61 current script hashes match the recorded and earlier inputs. The
  four model/input trees are unchanged from original PR head. All 244 run
  records have the expected file maps and exits: 57 successes, the same
  trim exit 1 and three non-runscript exits 255 per binary; 102 files each.
- All 366 pair records were checked, including every retained per-file
  diagnostic. Original/base and final/probe data are exactly equal.
  Base/final has exactly 60 changed files across 31 successful simulations,
  reproducing the earlier base/probe comparison without new missing files,
  header/shape or non-finite mismatches.
- Independently hashed 32 raw data files across all four binaries for
  crosswind, c1723, moored ZLT and F-16; each matches its manifest. Recomputed
  wrapped angle differences from the raw representative traces. The large
  2π raw heading/roll differences are representation wraps, with corrected
  maxima equal to the retained angle record.
- Read the final analysis helper and reran its read-only summary comparison;
  its JSON equals the agent's retained analysis. The helper is now retained
  byte-identically under
  [scripts/](../../../../../scripts/validation/jsbsim/wheel-spin-review/analyze_final.py).
  Its original scratch location and hash remain in provenance.

The original archive verification and build logs were inspected as execution
evidence. Their 1358-file blob/mode check belongs to the execution agent; the
planner did not rebuild that archive or repeat its complete file inventory.
The full trace-row count is the execution record's 11,877,246 per binary
(11,877,233 successful plus 13 failed-trim rows); the planner did not recount
every line of the 14 GB raw output.

## Numerical decision

**Accept the common-Jacobian cleanup with the measured compatibility
disclosure.** This decision is based on the equations, analytical tests and
observed trajectories, not merely on matching a previously named probe.

For a disabled wheel, with `M_j = r_j × U_j`,
`U_j · (v1 + v2 × r_j) = U_j · v1 + M_j · v2` in exact arithmetic.
The same scalar-triple-product identity gives the RHS, and
`r × (lambda U) = lambda (r × U)` gives the moment accumulation. The
implementation therefore preserves the legacy equations while changing
floating-point evaluation order. The analytical constraint tests pass,
including legacy rows, torque signs, shared-wheel coupling and clamping.
The final/probe identity isolates all measured disabled-wheel differences
to that cleanup; the later frame, bounds, documentation and test work adds
none for these inputs.

The disclosure is material. Crosswind Δu reaches 0.054043 ft/s, but gear Fx
reaches 197.33 lbf and pitching moment 1,358.7 lbf·ft. Moored-ZLT Δu stays
below 9.749e−5 ft/s and pitch below 1.575e−7 rad, while gear lateral force
differs by 443.29 lbf and yaw moment by 20,929 lbf·ft. Small state differences
do not make the force differences small. These are acceptable for returning
this algebraic cleanup to maintainer review with explicit measurements;
they do not justify a universal force tolerance or a claim that downstream
force-based feedback will be unchanged.

The retained F-16 diagnostic places Δu > 1e−6 ft/s at 127.908 s, with gear
Fx already approximately −2.11 million lbf. Both trajectories subsequently
go below ground; the later Δu maximum is 71.644 ft/s. This extreme impact
sequence cannot serve as a physical trajectory reference. Its divergence
does not demonstrate that the cleanup solves different equations, nor is
71.644 ft/s an accepted general error bound. Crosswind's initially tiny
acceleration changes and deterministic repeated runs were already checked
during planning. The observed amplification is consistent with sensitivity
to arithmetic and contact evolution; no claim of a fully characterized
contact-stability mechanism is made.

The c1723 saved-init XML also differs in nine lines. It is not byte-identical
and is not dismissed as a CSV artifact: the harness detects a text change,
and the retained diff identifies attitude, local velocity and body-rate
changes. The body corrects this and the angle-wrap diagnostic limits.

No new numeric discrepancy requires another experiment or implementation
task. Do not restore a separate solver merely to preserve old rounding, and
do not call every output difference a few ULPs. The PR body withdraws both
universal “unaffected” language and the unsupported revised-WASM identity
claim. The existing idealized scalar axle and uncalibrated airborne damping
are disclosed; no general rotating-terrain, gyro or real-aircraft fidelity
claim is made.

## Live review and remaining publication work

Read the full live PR body, issue comments, reviews, nine threads and check
contexts, with no missing pagination. The
[snapshot](live-pr-review.json) still has head `24e085bf`, open/mergeable,
`CHANGES_REQUESTED`, nine unresolved/current threads, no author replies and
27 successful/five skipped checks. Those checks belong to the published
original head; candidate CI remains to run after the user's push. bcoconni's
statement that more comments will follow remains applicable.

The nine replies, round comment and replacement body now use actual final
results and existing commit subjects. The user reviews them, pushes the six
commits once and posts the response together. No task 07 is needed. Fork
master adoption, a new WASM package and application wheel meshes are separate.

## Execution-environment exception

The execution agent reported that its background-command harness wrote a
one-line status file under `/private/tmp`, contrary to the repository's
scratch-location rule. This is recorded as an exception, not recast as
compliant because the harness chose the path. It contained no simulation
evidence and was not used to certify the result. The planner neither accessed
nor wrote/deleted that outside-repository file. Future executions must avoid
that background wrapper or configure its status directory inside the owning
repository's build/. No simulation rerun is needed for this bookkeeping
exception.
