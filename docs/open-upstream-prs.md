# Open upstream PRs

Every pull request we have open against a project we do not own, what each one
is waiting on, and the replies we owe. Six are open on `JSBSim-Team/jsbsim`.

Live PR bodies, comments, reviews and check runs were read on 2026-09-16.
Upstream `master` was `29d2d6b8031569655560e260850c42314ab83ef0`.

This is the living tracker. The
[2026-09-14 review](validation/jsbsim-open-pr-review-2026-09-14.md) remains the
evidence record for the shut-off engine defect, the native and app measurements
behind it, and the reviewer analyses summarised here. It is a dated snapshot:
where the two disagree on current state, this file is newer.

## State of each PR

| PR | Head | Size | CI | Waiting on |
| --- | --- | --- | --- | --- |
| [#1502](https://github.com/JSBSim-Team/jsbsim/pull/1502) wheel spin DOF | `24e085bf` | +375/−6, 6 files | Passed | **Us**, then bcoconni |
| [#1505](https://github.com/JSBSim-Team/jsbsim/pull/1505) turbine trim spool | `07eba55f` | +69/−1, 3 files | Passed | **Us.** Defect |
| [#1506](https://github.com/JSBSim-Team/jsbsim/pull/1506) model reload lifetime | `a25956a2` | +112/−2, 4 files | Passed | Maintainers |
| [#1507](https://github.com/JSBSim-Team/jsbsim/pull/1507) in-tree WASM package | `3d01786e` | +6421/−2, 49 files | Passed | Maintainers, scope |
| [#1508](https://github.com/JSBSim-Team/jsbsim/pull/1508) turbine trim fuel flow | `7511df10` | +168/−4, 4 files | Passed | **Us.** Defect + reply |
| [#1511](https://github.com/JSBSim-Team/jsbsim/pull/1511) tank temperature property | `2a2383ae` | +239/−1, 4 files | Passed | Maintainers |

All six are non-draft and reported cleanly mergeable. None has a formal review
decision. No maintainer comment on any open PR has a reply from us, and no PR
has received a commit since its feedback landed.

## What changed since the 2026-09-14 review

- **CI now runs.** Every open PR reports 27–29 successful checks and 5 skipped.
  The `action_required` hold described in the review record is over; maintainers
  approved the workflow runs.
- **[#1504](https://github.com/JSBSim-Team/jsbsim/pull/1504) merged**
  on 2026-09-15, approved by bcoconni. See the follow-up below.
- **[jsbsim-wasm #8](https://github.com/0x62/jsbsim-wasm/pull/8) merged**
  on 2026-09-15, approved by 0x62, without the benchmark he was asked for.
- **#1511 is new**, opened 2026-09-16.
- **#1502 was assigned to bcoconni** on 2026-09-15, and Sean commented on it.
- **#1507's head moved** to `3d01786e`, and GitHub records a
  `head_ref_force_pushed` by bcoconni on 2026-09-15 08:49. The head is still our
  own commit, so nothing of ours was lost. What he did is unexplained; ask.

## Blocked on us

### #1505 and #1508: engines that are shut off

Both assign state in `FGTurbine::Trim()` for every engine, not only running
ones: #1505 assigns `N1` and `N2`, #1508 also assigns `FuelFlow_pph`. A shut-off
engine therefore leaves RunIC spooled and burning fuel. The F-16 fixture shows
N2 85.90 % and 7,275.5 lb/h against 0 on `master`; the SF50 at fork.7 shows
N2 81.4 % and 344.7 lb/h after a location reset.

This is our own defect, not reviewer feedback. It is the reason both PRs are
blocked. The measurements, the proposed direction and what the fix must be
checked against are in the
[review record](validation/jsbsim-open-pr-review-2026-09-14.md). Nothing has
been implemented.

- [ ] Fix both PRs so `Trim()` only assigns spool state and fuel flow when
      `Running`.
- [ ] Add regressions for an engine that never started and one that was cut off.
- [ ] Recheck `InitRunning()`, the existing #1505/#1508 tests, and the app's
      reset, bootstrap and restore sequences.

### #1508: Sean's placement suggestion (2026-09-14)

Set fuel flow in the trim-finished block at `FGTurbine.cpp:124-134` instead of
during the trim iterations. He had already confirmed that updating fuel flow
during trim does not change aircraft mass.

That block only runs for running engines once time advances, so it would avoid
the defect above. The cost is that a caller reading fuel flow straight after
RunIC still gets the stale value — and two of #1508's three tests read it at
exactly that point, as does the SF50 cruise fuel-flow sweep.

- [ ] Decide between his placement and the `Running` guard, and reply either
      way. The trade-off above is the substance of the answer.

### #1502: bcoconni's analysis (2026-09-13)

He derives both constraint rows, confirms the code is correct, and calls the
change a good one. He then lists what was hard to follow and says the code
"deserves some clean up and there are a couple of errors that need to be
addressed", with more to follow. **He has not named the errors.** Do not guess
at them or mark them resolved.

- [ ] Reply to the analysis. He invited questions and got none in three days.
      Ask for the error list; he assigned himself the PR on 2026-09-15.
- [ ] Separate `ftRoll` from `ftWheelBrake` so the difference is not hidden in
      `U = 0` and `WheelCoeff` being 1 in one row and −R in the other. Rename
      `WheelCoeff`.
- [ ] Document that with the wheel DOF, `rolling_friction` describes wheel-to-axle
      friction rather than tire hysteresis. Model authors need telling; the class
      documentation only implies it.
- [ ] Consider a CxxTest for the generalized friction solve. Upstream's
      `coverage.yml` sets `-DBUILD_PYTHON_MODULE=OFF`, so the Python regressions
      are never measured and the reported 0 % patch coverage is instrumentation,
      not missing execution. A CxxTest would give real coverage, and the most
      recent upstream merge (#1491) came with one.

Also from Sean (2026-09-15): he would like writeups like bcoconni's linked by
URL from the class or method they explain.

### #1507: the Pyodide question (2026-09-14)

In [discussion #984](https://github.com/JSBSim-Team/jsbsim/discussions/984), Sean
explained what he wants a WASM JSBSim for: **Pyodide**, so his marimo flight
dynamics notebooks can be exported as wasm-html and stay editable in the browser.
This PR ships a JS/TS package; his use case needs the Python-in-browser path.
bcoconni redirected wasm discussion to that thread plus this PR on 2026-09-15, so
it is effectively part of this review.

- [ ] Answer whether Pyodide is in scope for this package, out of scope, or a
      later layer on top of it.

## Waiting on maintainers

- **#1506** — no human comments. Best patch coverage of the batch at 66 %.
  #1507 carries the same diff, so this should land first.
- **#1511** — opened 2026-09-16, no comments yet.
- **#1507 scope** — 6,421 lines across 49 files. No maintainer has agreed to an
  in-tree SDK. The MIT subtree in an LGPL repository, the new hosted workflow and
  the package identity are all theirs to decide. Expect a request to discuss or
  split before line-by-line review.

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
      is the first instalment; the plan itself was never posted.
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
cases. It merges cleanly onto `master` and does not depend on #1505 or #1508. The
SF50 declares `<idlefuelflow>76</idlefuelflow>` under fork.7, which meets the
condition the cruise fuel-flow record set for upstreaming.

- [ ] Rebase onto `master`, rerun its tests on the exact candidate, and decide
      whether to wait for #1505/#1508 — the fixture interacts with the trim
      fuel-flow floor.

## Suggested order

1. **#1505 and #1508** — one fix clears the defect on both, and it is the only
   thing standing between two small PRs and review. Sean's placement question is
   the same decision.
2. **#1502** — most feedback, and bcoconni owes us the error list. Reply now so
   the cleanup and his list can land together.
3. **#1507 / discussion #984** — answer Pyodide before the scope conversation
   starts without us.
4. **#1504 follow-ups** — the logging PR and the smaller-PRs plan.
5. **Idle fuel flow** — rebase and open it.

## Refreshing this file

`gh pr list --author @me` does not span repositories. Use:

```sh
gh search prs --author Felipegalind0 --state open --json number,title,repository,url,updatedAt
```

Then per PR: `gh pr view <n> --repo JSBSim-Team/jsbsim --json statusCheckRollup,reviewDecision`,
`gh api repos/JSBSim-Team/jsbsim/issues/<n>/comments`, and
`gh api repos/JSBSim-Team/jsbsim/pulls/<n>/reviews`. Inline review comments live
at `pulls/<n>/comments` and are a separate endpoint; there are none today.
Discussion threads are GraphQL only, and #984 and #1501 both carry PR-relevant
comments that none of the PR endpoints return.
