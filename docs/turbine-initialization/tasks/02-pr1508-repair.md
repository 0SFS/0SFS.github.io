# Task 2: repair off-engine fuel state in the #1508 stack

Read [plan](../plan.md), [contract](../contract.md),
[validation](../validation.md) and the existing
[#1505 task](../../pr1505-off-engine-regression-prompt.md).
Require the reviewed stage-0 diff and its local source identity before
preparing this stack. Do not push, post or change the installed package.

## Work

1. Record the current branch/clean status and actual local/remote #1508 heads.
   In the canonical checkout, create a local candidate branch from the
   recorded #1508 head, leaving the published branch intact. Apply the
   reviewed #1505 correction and resolve only its direct `Trim()` conflict.
   Record this intermediate source as the spool-only control.
2. Read `TestTurbineTrimFuelFlow.py` and every write in `Trim()`: members
   N1/N2/N2norm, corrected TSFC and dry/augmented fuel-flow assignments.
   #1508 requires member N2norm for its TSFC evaluation; #1505 kept a local
   normalization for thrust. Preserve unconditional local steady values
   needed by legacy thrust/augmentation, while committing running state and
   evaluating its TSFC/fuel targets only for running engines.
3. Guard every relevant dry and augmented persistent fuel assignment. Do not
   move them to the first positive timestep, zero residual spools/flow, return
   early for an off engine, change phase dispatch or repair hypothetical
   off-engine thrust here. Preserve configured function behavior outside the
   documented off-engine regression; inspect side effects, not just numbers.
4. Add never-started and started-then-cutoff fuel regressions through public
   API calls. Require `Running == false` before the tested RunIC, preserve
   residual spool/flow state and unchanged time/tank contents/fuel-used at
   return. For a fixture with flow settled to zero, prove no new consumption
   on following frames. Do not claim all physical shutdown fuel flow is zero.
5. Retain existing running spool/fuel tests: immediate readback, first-frame
   continuity, order independence and TSFC operating point. Test normal
   InitRunning and dry plus augmented paths. Preserve legacy off-engine
   thrust against the original #1508 implementation, including AugMethod 1.

## Validation and handoff

Use three labeled sources: original #1508; #1508 with only reviewed spool
repair; final spool-and-fuel repair. The new fuel tests must fail against the
spool-only control and pass after the fuel change, with identical test source
and verified extension imports. Reuse stage-0 spool proof where identity
allows, but rerun the combined regressions on this candidate.

Use the native build pattern and module identity checks in the #1505 prompt.
Run the discovered affected turbine, turboprop, trim, initial-condition,
clock, model-loading and ground-reaction tests. Log actual counts and all
failures rather than repeating the PR body's historical “13 passed.”

Leave a reviewable local candidate and report at
`reports/02-pr1508-repair.md`, with evidence in the matching top-level
validation directory. The coordinator records reviewed local commits before
integrating stages 0/2 into the redesign branch. Explain exactly which
prerequisite commits the future public stack should carry. Draft the #1508
reply explaining immediate readback and the guarded correction; do not post.
Update only relevant tracker status. Neither this task nor stage 0 fixes the
installed app or completes the broader plan.
