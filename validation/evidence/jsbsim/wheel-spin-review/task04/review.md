# Task 04 review — accepted after documentation follow-up

Final decision, 2026-09-19: **accepted** at
`9d0794e93a340957d068ad6e2413d066d3c768dd`, parent
`8924c17603aa322cdde684440ada1a061e137e7d`. The original review below records
the two findings; both are now resolved.

The planner read the complete follow-up diff and independently compared the
new header with its parent and the exact replacement text in the handoff.
Only the two requested class-comment fragments changed (+13/−8); the saved
followup-show.diff matches git show. The branch and full HEAD/parent match
the report, the tree is clean, and git show --check passes. No engine logic,
tests or tolerances changed. No further findings remain.

The build and test evidence reviewed below belongs to `8924c176`, not to the
new follow-up commit. No build or test was run by the agent or planner for
the comment-only follow-up; none was required. The approved task 04 receipt
records that distinction and points task 05 at `9d0794e9`. No public action,
commit, engine edit or task-agent launch was performed by the planner.

## Original review — findings now resolved

Reviewed 2026-09-19.

Commit: `8924c17603aa322cdde684440ada1a061e137e7d`  
Parent: `18e8454e4d7cb5d9e2ffb381bf15e96510c973a0`  
Subject: **Document wheel friction and airborne spin-down**

The runtime edits and their validation are accepted. Task 04 approval awaits
the two precise documentation changes in the
[follow-up prompt](../../../../../docs/pr1502/task04-documentation-followup.md).
No 04.json was written; task 05 must wait for approval of the follow-up HEAD.

## Findings

1. **Stopping versus holding.** In FGLGear.h's airborne paragraph, the
   decrement is compared to the change in the airframe rate when describing
   both reaching and retaining zero relative spin. The exact clamp condition
   for reaching zero is `decrement >= abs(relativeRate_before_damping)`.
   The body-rate change condition describes retaining zero from the previous
   step and needs a magnitude. For example, from zero previous relative spin,
   a body-rate projection change of −2 rad/s creates relative spin +2 rad/s;
   a decrement of 1 leaves +1 despite exceeding the signed change −2. This
   finding concerns the prose; the implementation correctly uses fabs.
2. **Axis alignment needs a sign.** Coplanarity of the ground normal with
   gear up/steered forward is not sufficient for the same directed axis.
   For `n = a up + b forward`, the normalized ground axis is
   `sign(a) (up cross forward)`. Positive a is required, and a = 0 is
   degenerate. The follow-up qualifies the existing claim without changing
   the intended ordinary upright-contact example or any dynamics.

## Accepted work and independent checks

Read the full committed diff and relevant constructor, friction coefficient,
wheel configuration, airborne update and frame code. Only the two intended
files changed. The scalar constants retain their original values and
arithmetic order; the disabled-wheel decay is unchanged. The renamed
constants' provenance makes no invented physical calibration claim.

The row conditions and signs are correct for stationary terrain. The
moment-cancellation statement follows from the existing equations: zero
wheel acceleration gives lambda_brake = R lambda_roll, whose airframe
reaction cancels the added R n cross U moment. The qualified "generally"
full-bound torque description is appropriate for the bounded row trying to
stop a wheel with nonzero relative spin, rather than a claim that every
rolling state has an identical friction force. The property/frame, inertia,
initialization and compatibility descriptions otherwise agree with source.
Normalized brake input describes the intended command range, not an
implemented clamp; the docs do not claim such a clamp.

The analysis URL is in the method comment as requested; Doxygen rendering
was not checked because the tool is absent. No new banked/steered transition
experiment is claimed. The existing unrelated "absolute" wording is correctly
left alone. Airborne reaction torque and a calibrated brake model remain
outside the implemented approximation.

Independently verified clean HEAD/branch, the approved task 03 parent and
the saved full diff against git show. Verified all 150 current object hashes
against the identical pre/post manifests, plus all five binary/snapshot
records. The candidate executable and Python module also match the task 03
receipt exactly. This evidence is specific to the recorded Release build
and compiler, not a guarantee about other configurations.

Inspected configure/build logs, wheel CTest and its verbose nine-method
result, 78/78 full-suite completion and the post-commit passing wheel test.
git show --check passed independently. No tests/builds were rerun by the
planner. No runtime defect was found, and no new tests or benchmark campaign
are needed to correct these two comments.

The planner changed no engine files, branch or commit and performed no
public action or task-agent launch. The follow-up is delegated to the user's
task 04 agent as one additional commit, preserving existing history/evidence.
