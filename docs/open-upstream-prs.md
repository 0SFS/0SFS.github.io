# Open upstream PRs

Every pull request we have open against a project we do not own, what each one
is waiting on, and the replies we owe. Six are open on `JSBSim-Team/jsbsim`.

Live PR bodies, comments, reviews and check runs were read on 2026-09-18, and
each PR's diff was reviewed at its head. Upstream `master` was
`29d2d6b8031569655560e260850c42314ab83ef0` then; a read-only refresh on
2026-09-19 for the turbine work found `a6f86ae93256eb00c2c990b711faa5bbb72ecb20`,
one commit ahead, touching only `tests/TestActuator.py` for Python 3.14. The
heads of #1505 and #1508 were re-read at the same time and are unchanged.

This is the living tracker. The
[2026-09-14 review](validation/jsbsim-open-pr-review-2026-09-14.md) remains the
evidence record for the shut-off engine defect, the native and app measurements
behind it, and the reviewer analyses summarised here. It is a dated snapshot:
where the two disagree on current state, this file is newer.

## State of each PR

| PR | Head | Size | CI | Waiting on |
| --- | --- | --- | --- | --- |
| [#1502](https://github.com/JSBSim-Team/jsbsim/pull/1502) wheel spin DOF | `499c3832` | +978/−26, 8 files | Last verified: 26 passed, 1 running, 1 skipped; final result unconfirmed | Maintainers. Current round answered |
| [#1505](https://github.com/JSBSim-Team/jsbsim/pull/1505) turbine trim spool | `07eba55f` | +69/−1, 3 files | Passed | **Us.** Shut-off-engine fix reviewed and committed locally (`6f95bfb0`), not pushed; reply to the steady-state/trim discussion drafted in the stage-1 report, not posted |
| [#1506](https://github.com/JSBSim-Team/jsbsim/pull/1506) model reload lifetime | `a25956a2` | +112/−2, 4 files | Passed | Maintainers |
| [#1507](https://github.com/JSBSim-Team/jsbsim/pull/1507) in-tree WASM package | `3d01786e` | +6421/−2, 49 files | Passed | **Us** (body, Pyodide), then scope |
| [#1508](https://github.com/JSBSim-Team/jsbsim/pull/1508) turbine trim fuel flow | `7511df10` | +168/−4, 4 files | Passed | **Us.** Off-engine fuel fix reviewed locally at `482da811` (production correction `8945b0e3`), not pushed; reply drafted, not posted |
| [#1511](https://github.com/JSBSim-Team/jsbsim/pull/1511) tank temperature property | `2a2383ae` | +239/−1, 4 files | Passed | Maintainers. Sean: "Looks good" |

All six are non-draft and reported cleanly mergeable. #1502 is the only one
with a review decision. #1502 received its reviewed follow-up commits and replies on 2026-09-19.
The #1505 acknowledgment was verified on 2026-09-19, and #1505 was read again
later that day: head unchanged at `07eba55f`, 28 checks successful and 5
skipped, with a
[second comment from Sean](https://github.com/JSBSim-Team/jsbsim/pull/1505#issuecomment-5745172993)
correcting his own earlier wording. A further API read on 2026-09-19 confirms
the head is still `07eba55f`, open and mergeable, and includes bcoconni's
`GetTrimStatus()` proposal and Sean's response about steady thrust outside
aircraft trim; see below. Checks were not rerun or refreshed in that read.
#1508's comment thread was also reread, with no new discussion. The other
PR entries retain their previously recorded snapshots.

Two are stacked: #1508 contains #1505's commit, and #1507 contains #1506's.

## What changed since 2026-09-16

- **#1502 has changes requested.** bcoconni submitted a review on 2026-09-18
  with nine inline comments. He says they should remove the `moment` lambda,
  `LeverArm` and `UseMomentJacobian`, and that he will have more comments once
  these are settled.
- **#1511:** Sean commented "Looks good to me" on 2026-09-18. It is a comment,
  not an approving review.
- **#1507's force-push is explained.** Sean squash-merged #1504 at 07:40 on
  2026-09-15, and bcoconni rebased #1507 onto it at 08:49, dropping our copy of
  the #1504 commit. The tree is unchanged. The local `feature/wasm-package`
  (`c6d4063a`) is still the pre-rebase copy.
- **A comment was missing from this file.** Sean's 2026-09-14 comment on #1505
  is now under that PR.

## #1502: wheel spin DOF

**2026-09-19: review round published and verified.** The
[plan](pr1502/plan.md) and [final review](../validation/evidence/jsbsim/wheel-spin-review/final/review.md)
accept all five tasks and final validation at `499c3832`, six commits
above the original `24e085bf`. The JSBSim checkout is clean on
`feature/wheel-spin-dof`. The [posted texts](pr1502/replies.md) link all nine answered threads and
include the round comment and replacement body.

The user approved publication. The planner pushed the six commits, then
corrected two misplaced author comments and posted the six missing replies,
[round comment](https://github.com/JSBSim-Team/jsbsim/pull/1502#issuecomment-5744732853)
and approved PR body. All nine reply-parent mappings and the public text were
read back and verified. Threads remain open for the maintainer's next round.
GitHub confirms head `499c3832`; the latest check snapshot has 26 successful,
one running and one skipped, with no failures. See the
[publication record](../validation/evidence/jsbsim/wheel-spin-review/final/publication-actions.json).
The final CI result remains unconfirmed because the subsequent read-only
refresh was blocked by the account usage limit.

The round removes the duplicate solver and obsolete lever-arm representation,
configures wheel bounds before clamping, names the directions correctly,
exports airframe-relative spin, fixes the airborne damping frame, documents
the friction interpretation and uncalibrated spin-down, links bcoconni's
analysis, and adds native analytical tests. The frame wording deliberately
uses the solver's ground/ECEF reference rather than transported NED.

Final candidate tests pass 79/79 with Python and 21/21 native tests without
Python. All 61 comparison inputs were run: 57 successful simulations, one
shared trim failure and three non-runscript documents. Final/probe data match
exactly. Base/final differ in 60 of 102 files across 31 successful simulations;
large contact-force and post-impact differences are disclosed. The revised
body withdraws the old “unaffected” claim.

Publication is complete; follow CI and further maintainer comments. This
completes our current review response,
not upstream acceptance. Bringing the changes to fork master, packaging and
wiring the 0sfs wheel meshes remain separate work, as noted in the plan.

## #1505 and #1508: engines that are shut off

Both assign state in `FGTurbine::Trim()` for every engine, not only running
ones: #1505 assigns `N1` and `N2`, #1508 also assigns `FuelFlow_pph`. A shut-off
engine therefore leaves RunIC spooled and burning fuel. The F-16 fixture shows
N2 85.90 % and 7,275.5 lb/h against 0 on `master`; the SF50 at fork.7 shows
N2 81.4 % and 344.7 lb/h after a location reset.

This is our own defect, not reviewer feedback. It is the reason both PRs are
blocked. The measurements and what the fix must be checked against are in the
[review record](validation/jsbsim-open-pr-review-2026-09-14.md). The #1505 half
is repaired, reviewed and committed locally as `6f95bfb0`
([report](validation/pr1505-off-engine-regression.md)). The #1508 half is
repaired and reviewed locally at `482da811` on `candidate/pr1508-off-engine-fuel`
([stage 2 report](turbine-initialization/reports/02-pr1508-repair.md)); the
published `fix/turbine-trim-fuel-flow` is untouched at `7511df10`.

`master` already gets this right one frame later: the trim-finished block at
`FGTurbine.cpp:124-134` re-spools only `Running && !Starved` engines, and a
starved engine never reaches `Trim()`. A `Running` guard makes frame zero agree
with it. `Trim()` also returns thrust for a shut-off engine on `master`; the
review record measured that as existing upstream behaviour. Leave it out of
these PRs.

**2026-09-19 plan:** the user agreed to plan the broader initialization
correction. The [implementation plan](turbine-initialization/plan.md) starts
with these two focused repairs, then covers shared calculations, explicit
initialization/refresh, native trim completion and SDK/app adoption. It has
bounded task briefs and validation gates; stages 0 and 2 are reviewed locally.
Legacy off-engine thrust is corrected in the later lifecycle work, not
silently retained as the final design.

- [x] **#1505 repaired, reviewed and committed locally** as `6f95bfb0` on
      `fix/turbine-trim-spool`: `Trim()` computes the steady N2 into a local,
      uses it for thrust and the augmentation threshold, and writes `N1`/`N2`
      only when `Running`. Both off-engine regressions fail before and pass
      after; thrust is identical in twelve dry/augmented cases; the focused
      11-target suite passes.
      [Report and evidence](validation/pr1505-off-engine-regression.md).
      Nothing was pushed: `origin/fix/turbine-trim-spool` and the PR head are
      still `07eba55f`.
- [x] **#1508 repaired and reviewed locally** at `482da811`, with production
      correction `8945b0e3` on
      `candidate/pr1508-off-engine-fuel`, branched from the recorded #1508 head
      with `6f95bfb0` cherry-picked onto it: `N1`, `N2`, the member `N2norm`,
      the corrected TSFC and every dry and augmented `FuelFlow_pph` assignment
      are written only when `Running`, while the steady speed and its
      normalization stay unconditional locals for thrust and the `AugMethod 1`
      threshold. Published refs are unchanged.
      [Report and evidence](turbine-initialization/reports/02-pr1508-repair.md).
- [x] Off-engine fuel regressions added to `TestTurbineTrimFuelFlow`, whose
      three existing checks still pass: after the follow-up, 33 assertion
      failures on the published #1508 head and 21 on a spool-only control,
      none on the candidate. #1505's fuel
      assertion in `TestTurbineTrimSpool` now bites as predicted — it is two of
      the control's failures. The candidate passes 18/18 discovered affected
      targets, 80/80 CTest targets with Python enabled and 21/21 with it
      disabled, and `Trim()`'s thrust is bit-identical to the published
      #1508 head in all twelve dry/augmented cases including `<augmethod> 1`.
- [x] Review follow-up `482da811`, no production change: a regression for an
      engine already off but still delivering fuel (791.19 gph, 24 frames
      after cutoff, replaced by 1102.35/9006.68 gph on the control), and a
      measured `copyto` characterization showing the configured TSFC and ATSFC
      functions fire for off engines before the fix and for none after, with
      running cases unchanged. Coordinator review accepted the follow-up;
      source, test and reused binary hashes match its provenance. No new
      suite run was needed for this review.
- [ ] Rebase the public stack so #1508 sits on the repaired #1505 rather than
      carrying a fix-up commit, when a publication operation is authorized.
      The stage 2 report names the exact commits it should carry.
- [ ] Recheck the app's reset, bootstrap and restore sequences on a later
      identified integration candidate. `InitRunning()` and the existing #1505
      tests were rechecked as part of the #1505 repair; the installed fork.7
      package still contains the defect.

### #1505: Sean's trim-phase comment (2026-09-14)

[He found](https://github.com/JSBSim-Team/jsbsim/pull/1505#issuecomment-5669726016)
that `FGTurbine::Trim()` runs for the 737 cruise script although
`cruise_init.xml` requests no trim. `Calculate()` sets `phase = tpTrim` whenever
`TotalDeltaT == 0` (`FGTurbine.cpp:151`), independently of the aircraft trim
request; starvation, stall and seizure can override that selection. This
allows a normally shut-off turbine to reach `Trim()` and exposes the defect
above.

- [x] [Acknowledged on 2026-09-19](https://github.com/JSBSim-Team/jsbsim/pull/1505#issuecomment-5744958064):
      confirmed the independent zero-time phase and disclosed our separately
      found shut-off-engine regression. Sean did not request this fix or
      approve the PR in his comment.
- [x] Implemented and tested locally on 2026-09-19 from the
      [agent handoff](pr1505-off-engine-regression-prompt.md), with before/after
      evidence in the [report](validation/pr1505-off-engine-regression.md).
      #1508 and downstream adoption remain separate.
- [x] Reviewed and committed locally on 2026-09-19 as `6f95bfb0`, after one
      comment-wording correction; the tested and committed code are identical.
- [ ] Push the branch and report the reviewed fix upstream when publication
      is authorized. Include an acknowledgment of the later discussion below.

### #1505: steady-state evaluation versus aircraft trim (2026-09-19)

Three comments followed our acknowledgment:

1. [Sean corrected the first-frame wording](https://github.com/JSBSim-Team/jsbsim/pull/1505#issuecomment-5745172993):
   integration suspension also produces zero-dt evaluations. Trace when that
   dt is copied into propulsion inputs; suspension and input refresh are
   separate operations.
2. [bcoconni proposed selecting `tpTrim` using `GetTrimStatus()`](https://github.com/JSBSim-Team/jsbsim/pull/1505#issuecomment-5745457074)
   and questioned whether every `RunIC()` should trim turbines. This is a
   suggestion, not an agreed replacement condition.
3. [Sean explained the non-trim use case](https://github.com/JSBSim-Team/jsbsim/pull/1505#issuecomment-5745555551):
   a caller can set throttle and call `RunIC()` to begin with steady thrust
   without waiting for spool dynamics or requesting aircraft trim. He suggests
   a clearer function name, with `CalculateThrustWithNoLag()` as an example.

This supports distinguishing steady engine evaluation from aircraft trim.
It does not approve our full lifecycle redesign or settle every suspended
caller's intent. Stages 0/2 leave dispatch unchanged.

**Stage 1's characterization and evidence are accepted; the contract
corrections the follow-up asked for have been made.** The
[follow-up review](turbine-initialization/reports/01-follow-up-review.md)
verified the retained hashes and equivalence counts and named five groups —
per-field operation semantics, mixed-engine eligibility and failure results,
the executive completion sequence, the recovery snapshot, and fuel and legacy
IC precedence. All five are closed in the
[decisions](turbine-initialization/decisions.md),
[contract](turbine-initialization/contract.md) and
[submission](turbine-initialization/reports/01-characterization.md), with three
focused probes added. Stage 3 remains pending until the coordinator accepts the
revised contract.

- Sean's use case works and we depend on it. On the 737 cruise fixture with
  `tNone`, throttle 0.30 to 0.90 then `RunIC()` returns 6599.21 lbf at once,
  against about five seconds to spool. Four 0sfs paths call `runIc()` a second
  time for exactly this. On `master` only the thrust is steady immediately:
  N1/N2 and TSFC update on the next frame, while fuel flow seeks over further
  frames. #1505/#1508 establish the consistent operating point before return.
- Suspension really is the general case: straight after `SuspendIntegration()`
  the executive dt is 0 while the engine's copied dt is still 0.008333.
- bcoconni's condition, built alone on `master`, **breaks the measured
  initialize-running path**:
  `propulsion/set-running = -1` leaves `set-running` at 0, and over one 737 run
  the engine dispatched `Off()` 605 times, `Trim()` 122 times and `Run()` never,
  because `FGPropulsion::GetSteadyState()` sets the trim status itself.
  Starter-driven starts still work in the retained trace, so this is not a
  failure of every possible start path.

- [x] Carry this discussion into the
      [stage-1 brief](turbine-initialization/tasks/01-characterization.md).
- [ ] Post the reply. It is corrected against the stage-1 review and sits in the
      [stage-1 report](turbine-initialization/reports/01-characterization.md):
      it keeps the non-trim steady-thrust path, reports what the proposed
      condition does on its own, offers the `Trim()` rename as a separate
      commit, and lists the defects found on the way — the failed paired
      resume after a nested `SuspendIntegration()`, the published fuel-flow
      rate held by `ConsumeFuel()`'s early returns, a null `Injection`
      lookup that segfaults on the stock B747 through both `Trim()` and a
      running `Run()`, a starvation flag that a frozen refill cannot clear, a
      scenario reset that destroys the configured injection increments and
      water, and `RunIC()` seeding the integrator's derivative history one
      model pass late. Nothing has been posted.

### #1508: Sean's placement suggestion (2026-09-14)

[He suggested](https://github.com/JSBSim-Team/jsbsim/pull/1508#issuecomment-5664642920)
setting fuel flow in the trim-finished block at `FGTurbine.cpp:124-134`
instead of during the trim iterations. He had already confirmed that updating
fuel flow during trim does not change aircraft mass.

That block only runs for running engines once time advances, so it would avoid
the defect above. The cost is that a caller reading fuel flow straight after
RunIC still gets the stale value — and two of #1508's three tests read it at
exactly that point, as does the SF50 cruise fuel-flow sweep.

- [x] Implemented and verified the `Running` guard on 2026-09-19; the
      immediate-readback requirement is now measured rather than asserted, and
      the suggestion's cost is concrete: the post-trim block runs a frame late
      and is skipped entirely while the executive stays suspended.
- [ ] Post the reply. It is drafted at [`pr1508/reply-draft.md`](pr1508/reply-draft.md)
      and explains the immediate readback, the guarded correction, the
      unchanged thrust, and the one deliberate side effect — a configured
      `<tsfc>` with `copyto` is no longer evaluated during an off-engine trim.
      Nothing has been posted on #1508 as part of planning or implementation.

## #1507: in-tree WASM package

### After the rebase

- [ ] Update the PR body. It still says the branch carries #1504's commit and
      that we will "rebase it as those fixes merge". Its comparison link points
      at `4ea17fe0...c6d4063a`, pre-rebase commits that are no longer on any
      branch. The branch now carries only #1506's commit (`6387258a`), so the
      link should be `6387258a...3d01786e`. Thank bcoconni for the rebase.
- [ ] Reset the local `feature/wasm-package` to `origin/feature/wasm-package`
      before any further work on it.

### The Pyodide question (2026-09-14)

In [discussion #984](https://github.com/JSBSim-Team/jsbsim/discussions/984), Sean
explained what he wants a WASM JSBSim for: **Pyodide**, so his marimo flight
dynamics notebooks can be exported as wasm-html and stay editable in the browser.
This PR ships a JS/TS package; his use case needs the Python-in-browser path.
bcoconni redirected wasm discussion to that thread plus this PR on 2026-09-15, so
it is effectively part of this review.

- [ ] Answer whether Pyodide is in scope for this package, out of scope, or a
      later layer on top of it.

### Scope

No maintainer has agreed to an in-tree SDK. The MIT subtree in an LGPL
repository, the new hosted workflow and the package identity are all theirs to
decide. Expect a request to discuss or split before line-by-line review.

- [ ] Post the plan for smaller PRs that #1504 promised (below). Of the 6,309
      lines #1507 adds on top of #1506, 1,524 are `wasm/package-lock.json`. The
      rest splits along its own seams: the CMake option and build scripts, the
      bindings generator (about 1,900 lines), the TypeScript SDK (800) with its
      tests (850), and the hosted workflow. Ask the licence, workflow and
      package-name questions in the same post, so they are answered before
      anyone reviews code.

## Waiting on maintainers

- **#1506**: no human comments. Its 66 % patch coverage is the best of the
  batch. #1507 carries the same diff, so this should land first. Nothing owed.
  - [ ] If it is still silent when #1507's scope discussion starts, point out
        that landing it first shrinks #1507.
- **#1511**: Sean
  [commented "Looks good to me"](https://github.com/JSBSim-Team/jsbsim/pull/1511#issuecomment-5734915804)
  on 2026-09-18, not as an approving review. Nothing owed. The diff also
  corrects the tank debug log, which printed the initial temperature as
  Fahrenheit although `Calculate()` compares it with TAT in °C.
  - [ ] Once it merges, check that the fork's `master`, which merged its own
        copy (`f0d1023a`), matches the squash-merged version.

## Merged, with follow-ups still owed

| PR | Merged | Approved by |
| --- | --- | --- |
| [jsbsim #1504](https://github.com/JSBSim-Team/jsbsim/pull/1504) Emscripten portability | 2026-09-15 | bcoconni |
| [0x62/jsbsim-wasm #8](https://github.com/0x62/jsbsim-wasm/pull/8) property batch, gear contacts | 2026-09-15 | 0x62 |

- [ ] **#1504's approval was conditional.** bcoconni wrote "OK assuming this topic
      will be addressed in another PR", meaning the Emscripten plain-text logging
      default, now that #1487 moved the ANSI codes into `FGLogConsole`. Our SDK
      does not need it — `stripAnsi` in `wasm/src/sdk/load-module.ts` handles it —
      but the promise was made upstream and nothing is filed.
- [ ] **#1504 also promised** a plan for upstreaming the SDK in smaller PRs. #1507
      is the first instalment; the plan itself was never posted. See #1507's
      scope item above.
- [ ] **#8's benchmark was never answered.** Sean asked on 2026-09-12 how much of
      the speed-up a plain path-to-node cache gives without batching, citing the
      Python API's cache-only approach in
      [#993](https://github.com/JSBSim-Team/jsbsim/pull/993). It merged anyway.
      Still worth measuring: it decides how these APIs get proposed once the SDK
      lives in JSBSim's `wasm/`, which #1507 leaves them out of.

## Finished, not submitted

**Turbine idle fuel flow.** `c70be257` on `feature/turbine-idle-fuel-flow`, pushed
to the fork. An optional `<idlefuelflow>` in lbm/hr replacing the
`107 * milthrust^0.2` estimate, with `TestTurbineIdleFuelFlow` covering five
cases. It does not depend on #1505 or #1508. The SF50 declares
`<idlefuelflow>76</idlefuelflow>` under fork.7, which meets the condition the
cruise fuel-flow record set for upstreaming.

The branch sits on the fork's `master`, 40 commits from upstream. Applied to
current upstream `master`, the commit conflicts only in `tests/CMakeLists.txt`,
where the test list has moved; the fix is one added line.

- [ ] Rebase onto `master`, rerun its tests on the exact candidate, and decide
      whether to wait for #1505/#1508 — the fixture interacts with the trim
      fuel-flow floor.

## Suggested order

1. **#1502.** bcoconni is mid-review and has said more comments follow. Answer
   this round while he is engaged; most of it is mechanical.
2. **#1505 and #1508.** One small fix clears the defect on both, and two replies
   to Sean are four days old. His placement question is the same decision.
3. **#1507.** The PR body fix takes minutes. Then answer Pyodide and post the
   smaller-PRs plan before the scope conversation starts without us.
4. **#1504 follow-ups:** the logging PR.
5. **Idle fuel flow:** rebase and open it.

## Refreshing this file

`gh pr list --author @me` does not span repositories. Use:

```sh
gh search prs --author Felipegalind0 --state open --json number,title,repository,url,updatedAt
```

Then per PR: `gh pr view <n> --repo JSBSim-Team/jsbsim --json statusCheckRollup,reviewDecision`,
`gh api repos/JSBSim-Team/jsbsim/issues/<n>/comments`, and
`gh api repos/JSBSim-Team/jsbsim/pulls/<n>/reviews`. Inline review comments live
at `pulls/<n>/comments` and are a separate endpoint; #1502 has nine. Discussion
threads are GraphQL only, and #984 and #1501 both carry PR-relevant comments
that none of the PR endpoints return. A force-push shows in
`issues/<n>/timeline` as `head_ref_force_pushed`, with the actor.
