# Stage 2: the off-engine fuel state in the #1508 stack, repaired locally

2026-09-19. Stage 2 of the [turbine initialization plan](../plan.md), building on
the reviewed [stage 0 repair](../../validation/pr1505-off-engine-regression.md).
It leaves a reviewed local candidate branch in
`/Users/felg/gh/Felipegalind0/jsbsim`; nothing was pushed, no comment was
posted, both published branches and the GitHub PRs are untouched, and the app
still uses `@felipegalind0/jsbsim@1.2.4-fork.7`. Evidence:
[`validation/evidence/jsbsim/engine-off-trim/pr1508-candidate-2026-09-19/`](../../../validation/evidence/jsbsim/engine-off-trim/pr1508-candidate-2026-09-19/).

Coordinator review on 2026-09-19 accepts stage 2 at
`482da811f1bc6ab42c3cb76c8079eab7af75f49d`, after inspecting the tests-only
follow-up, retained failing/passing results and configured-function fixture.
Source, test, comparator and reused extension hashes match the follow-up
provenance. No new tests were run for this review. The restart/`N2norm`
question remains stage-1 characterization; local acceptance does not establish
upstream approval or app adoption.

## The defect

`FGTurbine::Calculate()` selects `tpTrim` whenever `in.TotalDeltaT == 0`,
independently of any aircraft trim request, so zero-time evaluations such as
`RunIC()` reach `Trim()` even when the engine is off. #1508 added the steady
fuel assignments that `Trim()` had been missing — the member `N2norm`, the
corrected TSFC, the dry `FuelFlow_pph` floored at `IdleFF`, and the augmented
flow in both augmentation branches — and made all of them unconditional.

An engine that was off therefore came out of `RunIC()` reporting the throttle's
running fuel flow and its corrected TSFC. Measured on the F-16 fixture with a
never-started engine at throttle command 0.35 (position 0.70): flow
0 → 1102.35 gph, corrected TSFC 1.698 → 0.794. At command 0.75 (position 1.50,
augmentation requested) it reached 7267.36 gph with the stock `<augmethod> 2`
and 9006.68 gph with `<augmethod> 1`.

The invented flow is not only an indication error. `Off()` seeks it back to
zero at 10,000 pph/s, and `CalcFuelNeed()` debits the tanks for every frame of
that decay. Over the following 24 frames at `dt = 1/120` — 0.2 s — a
never-started F-16 engine burned 0.3463 lb dry and 2.6068 lb (stock) or
3.2446 lb (`<augmethod> 1`) with augmentation requested, and the tanks dropped
by the same amount.

Sean's [#1508 comment](https://github.com/JSBSim-Team/jsbsim/pull/1508#issuecomment-5664642920)
asked whether the trim fuel assignment changes aircraft mass during the trim
solution's iterations. It does not, and this work confirms that directly: on
the unrepaired head,
`fuel-used-lbs`, every tank's contents and the simulation time all come back
from `RunIC()` unchanged, because `in.TotalDeltaT` is zero there so
`CalcFuelNeed()` expends nothing; inside an actual trim solution
`FGPropulsion::ConsumeFuel()` returns early on trim status as well. The
consumption happens on the frames *after* the zero-time evaluation, once the
engine is left holding a flow it has no operating point for.

## The change

`src/models/propulsion/FGTurbine.cpp`, against the published #1508 head:

```c++
     double steadyN2 = IdleN2 + ThrottlePos * N2_factor;
+    double steadyN2norm = (steadyN2 - IdleN2) / N2_factor;
     if (Running) {
       N1 = IdleN1 + ThrottlePos * N1_factor;
       N2 = steadyN2;
+      N2norm = steadyN2norm;
     }
-    N2norm = (steadyN2 - IdleN2) / N2_factor;
-    double dryThrust = idlethrust + (milthrust * N2norm * N2norm);
+    double dryThrust = idlethrust + (milthrust * steadyN2norm * steadyN2norm);
     double thrust = dryThrust * (1.0 - BleedDemand);
 
-    correctedTSFC = TSFC->GetValue();
-    FuelFlow_pph = std::max(IdleFF, dryThrust * correctedTSFC);
+    if (Running) {
+      correctedTSFC = TSFC->GetValue();
+      FuelFlow_pph = std::max(IdleFF, dryThrust * correctedTSFC);
+    }
```

and, in both augmentation branches, `FuelFlow_pph = thrust * ATSFC->GetValue();`
becomes `if (Running) FuelFlow_pph = thrust * ATSFC->GetValue();`. The thrust
assignments in those branches stay unconditional.

The shape is the one stage 0 established. The steady speed and its
normalization are computed unconditionally as locals; the thrust and the
`AugMethod == 1` threshold read those locals; only the persistent writes are
guarded. #1508 needs the *member* `N2norm`, because `FGSimplifiedTSFC` reads it
(`FGTurbine.h:353`), so `N2norm` joins `N1` and `N2` inside the guard rather
than staying local as it does in #1505. It is still assigned before `TSFC` is
evaluated, which is the ordering #1508 exists to establish.

Deliberately not done, per the stage brief: the assignments were not moved to
the first positive timestep; an off engine's residual spools and flow are not
zeroed; `Trim()` does not return early for an off engine, so its existing
hypothetical thrust survives; phase dispatch is untouched; and no aircraft or
engine data in the repository was modified.

## Sources

Three labeled build sources, all local; the final checkout additionally carries
the tests-only follow-up below:

| Label | Commit | What it is |
| --- | --- | --- |
| `original` | `7511df10cda909c32dfc378dfde204eb44dc5a48` | the published #1508 head, `fix/turbine-trim-fuel-flow`, also `origin/` and the PR's `headRefOid` |
| `spool-only` | `c803eeef9ae7479d450109266213b189da729af2` | the reviewed #1505 repair `6f95bfb0` cherry-picked onto it, one `Trim()` conflict resolved, nothing else |
| `final` | `8945b0e34ddc85df1d324dffbe39d0732b03197d` | production correction used to build the final binary |
| reviewed checkout | `482da811f1bc6ab42c3cb76c8079eab7af75f49d` | tests-only follow-up on `candidate/pr1508-off-engine-fuel`; production source and binaries unchanged |

The checkout was clean on `fix/turbine-trim-spool` at `6f95bfb0` before any
change, and `candidate/pr1508-off-engine-fuel` was branched from the recorded
#1508 head, so `fix/turbine-trim-fuel-flow` still points at `7511df10`.

The cherry-pick's only conflict was in `Trim()`, where #1505 and #1508 rewrote
the same lines. It was resolved by keeping #1505's spool guard and #1508's fuel
assignments, with the member `N2norm` computed from the local `steadyN2` so
that the control's thrust stays identical to the published #1508 head — the
measurement below confirms it did. The control is a control, not a proposal:
it still writes fuel flow for an engine that is off.

| Item | Value |
| --- | --- |
| Changed files at `8945b0e3` | `src/models/propulsion/FGTurbine.cpp` `32c87c0c…`, `tests/TestTurbineTrimFuelFlow.py` `b323f9e3…` |
| Follow-up at `482da811` | only `tests/TestTurbineTrimFuelFlow.py`, now `4151687…`; production source unchanged |
| Carried from stage 0 | `tests/TestTurbineTrimSpool.py` `ba7f4fb1…`, unchanged by this stage |
| `original` extension | `885d426fbd0327281c3044d7a7c52dfd4013707b3616c1f65cf726a6906edaef`, built 17:25:27 |
| `spool-only` extension | `b2b9aaee0ac71a58bbee2029c2af6205454eff151f570a75527e999c54baff45`, built 17:25:49 |
| `final` extension | `f739de7773b2144ca315a5e76705d36fcb08e3db4a9a6495c859951198a40779`, built 17:29:53 |
| Toolchain | AppleClang 21.0.0, CMake 4.4.3, Python 3.14.7, Cython 3.3.0, Darwin 27.0.0 arm64 |
| Options | `Release`, `BUILD_DOCS=OFF`, `BUILD_SHARED_LIBS=OFF`, `BUILD_PYTHON_MODULE=ON`, venv Python/Cython |

Both baseline binaries were linked before the production edit (17:29:28) and
were not rebuilt afterwards. Each build's `jsbsim.__file__` and
`jsbsim._jsbsim.__file__` were read from the environment its tests ran in and
resolve inside its own `<build>/tests/jsbsim/`; the hashes are in
[`module-identity.txt`](../../../validation/evidence/jsbsim/engine-off-trim/pr1508-candidate-2026-09-19/module-identity.txt).
The original `8945b0e3` commit matched its tested source. The later follow-up
changes only the test file and reuses the verified binaries. Full values are in
[`provenance.json`](../../../validation/evidence/jsbsim/engine-off-trim/pr1508-candidate-2026-09-19/provenance.json)
and [`followup-provenance.json`](../../../validation/evidence/jsbsim/engine-off-trim/pr1508-candidate-2026-09-19/followup-provenance.json).

## Regressions

`tests/TestTurbineTrimFuelFlow.py` keeps its three running-engine tests —
the trimmed value cannot be sought away by the next frame, repeated trims are
independent of the order they are requested in, and the reported TSFC follows
its own operating point — across the four dry commands and the augmented one,
and its running fixture now also asserts that `set-running` reads 1 after
`propulsion/set-running = -1`, so the `InitRunning()` path is exercised
explicitly. Three off-engine tests were added, all through public API calls on
the stock F-16 fixture with no script events:

- **never started:** the engine is created without `set-running`, its flow is 0,
  and `RunIC()` at throttle commands 0.35 and 1.0 must return with the flow,
  the corrected TSFC, both spools, the simulation time, every tank's contents
  and `fuel-used-lbs` unchanged, and the engine still off;
- **started, then cut off, flow settled:** started through
  `propulsion/set-running = -1`, 2 s at command 0.35, `cutoff_cmd`, then 10 s
  at `dt = 1/120`, leaving the engine off, still turning and with
  `fuel-used-lbs` already positive and the flow settled to zero, after which
  the same `RunIC()` checks apply. The second call also shows there is no
  delayed reset;
- **started, then cut off, still delivering fuel:** the same shutdown sampled
  earlier — 24 frames after `cutoff_cmd` instead of 1200 — where the engine is
  already off but has not finished decaying.

The first two both then advance 24 frames and require no flow, no additional
fuel used, no tank movement and finite spools. Windmilling is not asserted
away: no test demands that an off engine stay at zero or keep slowing.

### The residual-flow case

Cutoff takes the engine out of `tpRun` on the very first frame, while `Off()`
seeks the flow down at 10,000 pph/s, so there is a long window in which
`Running` is false and the flow is still positive: from command 0.35 it takes
86 frames at `dt = 1/120` to reach zero. The third test samples that window a
quarter of the way down and asserts both preconditions before comparing —
`set-running == 0` and flow > 0 — which is what makes it the stronger check.
The other two can only show that a zero is not replaced by a positive value;
this one shows that a *particular* positive value is not replaced by a
different one.

Measured on the control, that is exactly what happened: 791.19 gph became
1102.35 gph at the dry command and then 9006.68 gph at the augmented one, and
the corrected TSFC moved with it.

After the two `RunIC()` calls the test requires the shutdown to carry on
normally — the flow decreasing monotonically to zero, and `fuel-used-lbs`
strictly increasing on the way, because fuel that is still being reported as
delivered must still be paid for. It deliberately does **not** demand zero
consumption while a residual flow exists; only the settled fixture asserts
that, and only after its flow has reached zero.

### Tolerances and detectability

Every comparison is against the value captured immediately before the call,
with a 1e-9 tolerance; nothing should write these at all, so the expected
difference is exactly zero. A check that could not tell preservation from
assignment would pass quietly, so before each call the test measures what a
*running* engine reports at the same command and requires two things of it:
that it exceed 100 gph, and that it differ from the value being preserved by
more than a tenth of itself. The margins are wide — 1102 gph dry and 7267 gph
augmented against a preserved 0, and against a preserved 791.19 gph the dry
reference is 28 % away and the augmented one an order of magnitude. The
shutdown cases are stated as this fixture at this operating point: the tests
do not claim that every turbine's fuel flow is zero once it is cut off.

| Run | `TestTurbineTrimSpool` | `TestTurbineTrimFuelFlow` |
| --- | --- | --- |
| `original` (published #1508) | **3 tests, 10 failures** | **6 tests, 33 failures** |
| `spool-only` control | **3 tests, 2 failures** | **6 tests, 21 failures** |
| `final` candidate | 3 tests, 0 failures | 6 tests, 0 failures |

On the `spool-only` control every failure is a fuel-state assertion, and only
that: the fuel test fails on `fuel-flow-rate-pps`, `fuel-flow-rate-gph` and
`tsfc` at both commands in all three off tests (18 subtests plus their 3
methods), while `n1`, `n2`, the simulation time, the tank contents and
`fuel-used-lbs` pass. The spool test's own two failures are its
`fuel-flow-rate-pps` assertion, which stage 0 added as a guard for exactly this
work. That is the causal result this stage needed: the spool repair is already
in the control, so the new failures can only come from the fuel assignments.

On the `original` head the same source additionally fails on `n1` and `n2`,
which is the stage 0 regression showing through the stacked PR.

The test source is byte-identical in all three runs (`4151687…`); it was
written before either baseline was exercised with it and has not changed
since. Every failure is an assertion failure inside a running simulation, not
an import, fixture or build failure. The first two off-engine tests were first
run against the same three binaries at an earlier revision of the file
(`b323f9e3…`, 5 tests, 22/14/0 failures); those logs are retained separately.

## Thrust is unchanged

Stage 0's retained comparator, unmodified, was rerun across all three builds:
twelve zero-time cases — never-started, cut-off and running engines, at a dry
(position 0.70) and an augmented (position 1.50) throttle, with the stock
engine and a sandbox copy using `<augmethod> 1`.

**All twelve are identical in all three builds**, to the last bit, while the
off-engine N2 differs between `original` (85.9 / 100.0) and the two repaired
builds (0.0 or 0.5728). Augmentation really was exercised: the `<augmethod> 1`
augmented cases return 28,997.10 lbf, `MaxThrust × AugThrust`, not the
9,163.84 lbf dry value, on all three. The `<augmethod> 2` augmented cases
return 23,397.34 lbf. Table:
[`thrust-comparison.md`](../../../validation/evidence/jsbsim/engine-off-trim/pr1508-candidate-2026-09-19/thrust-comparison.md).

This characterizes compatibility. It is not a claim that an engine which is off
should produce thrust; the plan removes that in stage 5.

## Fuel state and configured functions

A new downstream tool,
[`trim_fuel_compare.py`](../../../scripts/validation/jsbsim/engine-off-trim/trim_fuel_compare.py),
measures the same three builds over twenty-four cases: four engine variants ×
three states × two throttles, recording the fuel state before and after
`RunIC()` and the fuel burned over the following 24 frames. Two of the variants
replace the scalar `<tsfc>`/`<atsfc>` with XML function bodies reading
`propulsion/engine[0]/n2`, so a *configured* function's operating point is
observable rather than only `FGSimplifiedTSFC`'s, one of them with
`<augmethod> 1`. Every variant is a sandbox copy under the build directory.
Tables: the original eighteen-case run in
[`fuel-comparison.md`](../../../validation/evidence/jsbsim/engine-off-trim/pr1508-candidate-2026-09-19/fuel-comparison.md),
the follow-up with the `copyto` sentinels in
[`followup-copyto-comparison.md`](../../../validation/evidence/jsbsim/engine-off-trim/pr1508-candidate-2026-09-19/followup-copyto-comparison.md).

**All eight running cases are identical across the three builds** in their entire
post-`RunIC()` state — flow, corrected TSFC, both spools, thrust, fuel used,
simulation time and tank total — and in the fuel they burn over the following
frames. The guard changes nothing for a running engine.

The configured-function ordering #1508 exists to establish is directly visible
in the XML-function variant's running case: N2 goes from 100.0 to the trimmed
85.9 and the stored corrected TSFC goes from 0.370 to 0.422170, which is
`0.0074 × (100 − 0.5 × 85.9)`. The function saw the operating point being
trimmed, not the previous one, on the candidate exactly as on the published
head.

The sixteen off cases separate the three implementations:

| Source | Off engine after `RunIC()` |
| --- | --- |
| `original` | writes the spools to the throttle's steady values, evaluates the configured TSFC there, assigns the flow: 586–9007 gph, then burns 0.157–3.245 lb over the next 0.2 s |
| `spool-only` | keeps the spools, but still evaluates the configured function — now at the *stale* N2 — and still assigns a flow: 1024–9007 gph, then burns 0.318–3.245 lb. With the scalar `<tsfc>` this happens to match `original`, because the member `N2norm` was still being written from the steady value; with an XML function reading N2 directly it diverges, which is how the control shows it is still wrong |
| `final` | writes nothing: flow, corrected TSFC and spools come back exactly as they were, and the following frames burn nothing |

### Configured function evaluation, measured

Guarding the assignment also stops `TSFC->GetValue()` and `ATSFC->GetValue()`
being *called* during an off-engine `Trim()`. `FGFunction::GetValue()` writes
its `copyto` target when one is configured (`FGFunction.cpp:990`), so that is
observable rather than only inferable. The tool gives both configured
functions a `copyto` target, and a fourth variant pairs the XML functions with
`<augmethod> 1` so that both augmented `ATSFC` call sites are reached. The
targets are sentinel properties set to −1 before `load_model` — `FGFunction`
ignores a `copyto` target that does not exist when the engine XML is parsed —
and reset immediately before each measured `RunIC()`, because loading and
every evaluation since then writes them. `propulsion/engine[#]/atsfc` is never
read while they are being observed: it is tied straight to the function's
getter, so reading it would fire the very `copyto` being measured.

| State | Throttle | `original` tsfc / atsfc | `spool-only` | `final` |
| --- | --- | --- | --- | --- |
| never started | dry | 0.422170 / – | 0.740000 / – | – / – |
| never started | augmented | 0.370000 / 1.845000 | 0.740000 / 2.050000 | – / – |
| cut off | dry | 0.422170 / – | 0.737881 / – | – / – |
| cut off | augmented | 0.370000 / 1.845000 | 0.737881 / 2.048826 | – / – |
| running | dry | 0.422170 / – | 0.422170 / – | 0.422170 / – |
| running | augmented | 0.370000 / 1.845000 | 0.370000 / 1.845000 | 0.370000 / 1.845000 |

`–` means the sentinel was never written. Both XML variants give the same
six-row pattern, so the table is shown once; the full twelve rows are in
[`followup-copyto-comparison.md`](../../../validation/evidence/jsbsim/engine-off-trim/pr1508-candidate-2026-09-19/followup-copyto-comparison.md).

So: on the candidate, **neither configured function is evaluated at all during
an off-engine trim**, in any of the eight off cases. On both earlier sources
the TSFC function fires in every off case and the ATSFC function fires in
every augmented one, confirming that both guarded call sites were genuinely
being reached before the fix. For a running engine all three sources behave
identically — the dry trim evaluates TSFC only, since `AugmentCmd` is zero
below throttle position 1.0, and the augmented trim evaluates both.

This is deliberate: evaluating a running operating point for an engine that is
not running is the defect. The pre-function pass `Calculate()` runs before
dispatch is unaffected, so a configured function registered there still
evaluates every frame. The consequence to state plainly is that a `copyto`
target fed *only* from `<tsfc>` or `<atsfc>` now stops being refreshed while
its engine is off — it holds its last running value instead. No shipped
fixture does that; the one here was built for the measurement.

Adding the sentinels changed nothing that was already measured: all 18 rows of
the earlier run are numerically identical to the same 18 rows of this one.

The other member the guard now protects is `N2norm` itself, which `FGSpoolUp`
reads (`FGTurbine.h:334`) to scale the spool rate. Its value can therefore
affect a later startup; the effect depends on that path's intervening updates.

That is as far as this stage's evidence goes, and it is worth being exact
about: guarding the write means a zero-time evaluation no longer *decides*
what `N2norm` holds while the engine is off. It does not establish that the
value now left there — the last running normalization, or `ResetToIC`'s zero —
is the right one after a shutdown. `Off()` maintains `N1` and `N2` but not
their normalization, so the preserved value goes stale as the spools decay.
Nothing here tests a restart, and no measurement in this report bears on it.
The question is carried into
[stage 1's required decisions](../tasks/01-characterization.md) to settle
before stage 3 extracts the shared calculations.

## Suites

All on the `final` candidate, Python enabled, with `PYTHONPATH` set to its own
`tests` directory:

| Suite | Result |
| --- | --- |
| 18 discovered affected targets | **18/18 passed**, 14.8 s; **18/18** again after the follow-up tests, 29.6 s |
| `CheckScripts`, `CheckAircrafts`, `TestScriptOutput` | **3/3 passed**, 7.5 s |
| Full discovered CTest suite, Python enabled | **80/80 targets passed**, 44.8 s; **80/80** again after the follow-up tests, 87.7 s |
| Native CTest suite, `BUILD_PYTHON_MODULE=OFF` | **21/21 targets passed**, 0.15 s |

The affected set was discovered from `ctest -N` on this build rather than
copied from a list: `TestTurbine`, `TestTurbineTrimSpool`,
`TestTurbineTrimFuelFlow`, `TestTurboProp`, `TestEngineIndexedProps`,
`TestUnusableFuel`, `TestFuelTanksInertia`, `CheckTrim`,
`FGInitialConditionTest1`, `TestInitialConditions`, `TestICOverride`,
`TestSuspend`, `CheckSimTimeReset`, `TestHoldDown`, `TestModelLoading`,
`TestGndReactions`, `TestPlanet`, `TestPythonDefaultLoggerFiltering`. Nothing
failed, so no failure needed classifying against a baseline. The PR body's
historical "13 passed" is not repeated; the counts above are this candidate's.

### Re-verified afterwards

Every gate above was re-run later the same day against the same three builds,
with no source change; their extension hashes still match `provenance.json`.
All of them reproduced — 10/33, 2/21 and 0/0 failures, 18/18, 80/80, 21/21 —
and both comparator outputs diff empty against the retained tables. That run
also ran each of the nine tests on its own, which the aggregate logs above do
not separate: each of the three new fuel tests fails individually on the
published head *and* on the spool-only control and passes on the candidate,
while all three pre-existing running tests pass on all three sources. It
confirms too that the control's two spool failures are stage 0's
`fuel-flow-rate-pps` assertion rather than a spool one, so the stage-0 spool
proof genuinely could not be carried over to this stack unchanged. See
[`reverify-2026-09-19.md`](../../../validation/evidence/jsbsim/engine-off-trim/pr1508-candidate-2026-09-19/reverify-2026-09-19.md).

## What the future public stack should carry

The candidate is three commits on top of the published #1508 head, and they are
not the order a published stack should use. #1505 is the parent PR; #1508 is
stacked on it. The public stack should be, in order:

1. `07eba55f` — the existing #1505 head, unchanged;
2. the stage 0 repair `6f95bfb0`, "Preserve off-engine spool state during
   turbine trim", on `fix/turbine-trim-spool`. #1505 needs this commit and
   nothing from this stage;
3. `7511df10` — the existing #1508 head, rebased onto the repaired #1505;
4. the fuel repair, this stage's `8945b0e3`, "Leave an engine that is off out
   of the trim fuel state", replayed on `fix/turbine-trim-fuel-flow`;
5. the tests-only follow-up `482da811`, "Cover a turbine shut down but still
   delivering fuel", replayed after the fuel correction. Steps 3–5 will have
   new commit identities after rebasing; verify the resulting source and tests.

Step 3 is where the local candidate differs: it cherry-picked `6f95bfb0` *onto*
`7511df10` rather than rebasing `7511df10` onto `6f95bfb0`, which is why
`c803eeef` exists as a control. The rebase was tried on a throwaway branch to
check that it makes no difference to the code, and it does not:
`git rebase --onto 6f95bfb0 07eba55f` conflicts in `FGTurbine.cpp` and nothing
else, the same two hunks, and resolving it the same way gives tree
`b504bc5b263e68854c0c30417bd2c3768d8c2bc3` — byte-identical to the control's.
It only leaves #1508 as one commit on a repaired #1505 rather than a fix-up
after the fact. The throwaway branch was deleted. Rebasing rewrites the
published #1508 history; appending the candidate's commits would instead be
a fast-forward. Neither publication was performed. The plan reserves public
branch updates for an explicitly authorized publication step.

If upstream squashes or merges #1505 first, verify that the merged commit
carries `6f95bfb0`'s guard and use it instead of replaying the commit.

## Limits

- **Two PRs' worth of repair, nothing more.** The hypothetical powered thrust
  an off engine still returns from `Trim()` is untouched and was measured to be
  bit-identical; stage 5 removes it deliberately and reports the compatibility
  effect. Commanding cutoff immediately before `RunIC()` while `Running` is
  still true remains the separate lifecycle question stage 0 named, and this
  guard does not settle it either — it follows `Running`, whatever set it.
- **Nothing published.** `origin/fix/turbine-trim-fuel-flow` and the #1508 head
  are still `7511df10`; `origin/fix/turbine-trim-spool` is still `07eba55f`.
  No push, comment, review request, merge to fork master, rebase of a published
  branch or release package. A draft reply for #1508 is in
  [`docs/pr1508/reply-draft.md`](../../pr1508/reply-draft.md), unposted.
- **The app is unchanged.** fork.7 still contains both defects. Reset,
  bootstrap, restore and WASM validation must run against a later identified
  integration candidate before the app can be called fixed. Stages 0 and 2
  together do not complete the plan.
- **Coverage.** These are Python tests exercising the native engine. The
  `BUILD_PYTHON_MODULE=OFF` suite has no turbine case at all, so upstream's
  Python-disabled coverage job still shows nothing for these lines. Native
  CxxTest coverage for turbine behaviour starts in stage 3, with the shared
  calculations it extracts; stage 6 only runs the final acceptance.
- **Platform.** Built and run only on macOS arm64 with AppleClang. The unpushed
  candidate has not run in upstream CI; published-head checks do not qualify it.
