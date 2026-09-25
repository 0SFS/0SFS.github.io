# PR #1505: the shut-off-engine regression, repaired locally

2026-09-19. Stage 0 of the
[turbine initialization plan](../turbine-initialization/plan.md): a narrow
repair to [PR #1505](https://github.com/JSBSim-Team/jsbsim/pull/1505), tested
before and after against the engine it changes. Reviewed and accepted on
2026-09-19, then committed locally as
`6f95bfb0a590d1a45de9f883857c17af0819f6ad` on `fix/turbine-trim-spool` in
`/Users/felg/gh/Felipegalind0/jsbsim`, one commit above the published head.
Nothing was pushed, no comment was posted, #1508 is untouched, and the app
still uses fork.7. The evidence is in
[`validation/evidence/jsbsim/engine-off-trim/pr1505-candidate-2026-09-19/`](../../validation/evidence/jsbsim/engine-off-trim/pr1505-candidate-2026-09-19/).

## The defect

`FGTurbine::Calculate()` selects `tpTrim` whenever `in.TotalDeltaT == 0`,
independently of any aircraft trim request, so zero-time evaluations such as
`RunIC()` can reach `Trim()` even when the engine is off. That selection is not
unconditional: starvation, stall and seizure override it afterwards. #1505 replaced a
temporary local `N2` there with writes to the members `N1` and `N2`. Those
writes happened for every engine, so a turbine that was off came out of `RunIC()`
spooled to its throttle. Upstream's own positive-time transition
(`FGTurbine.cpp:125-134`) only re-spools an engine when `Running && !Starved`;
frame zero disagreed with it.

## The change

`src/models/propulsion/FGTurbine.cpp`, against the PR's parent `14c19022`:

```c++
-    double N2 = IdleN2 + ThrottlePos * N2_factor;
-    double N2norm = (N2 - IdleN2) / N2_factor;
+    double steadyN2 = IdleN2 + ThrottlePos * N2_factor;
+    // Trim establishes steady thrust without advancing time. Keep a running
+    // engine's observable spool state consistent with that operating point.
+    // Zero-time evaluations, such as RunIC(), can reach Trim even when the
+    // engine is off. Such an engine keeps its (possibly windmilling) spools.
+    if (Running) {
+      N1 = IdleN1 + ThrottlePos * N1_factor;
+      N2 = steadyN2;
+    }
+    double N2norm = (steadyN2 - IdleN2) / N2_factor;
     double thrust = (idlethrust + (milthrust * N2norm * N2norm))
           * (1.0 - BleedDemand);

     if (AugMethod == 1) {
-      if ((ThrottlePos > 0.99) && (N2 > 97.0)) {Augmentation = true;}
+      if ((ThrottlePos > 0.99) && (steadyN2 > 97.0)) {Augmentation = true;}
```

The steady speed is still computed unconditionally, and **every** remaining
`N2` read in the method uses that local: the normalized thrust and the
`AugMethod == 1` threshold. Only the member writes are guarded. Equations,
operation order and `N2norm`'s locality are unchanged. Guarding the two
assignments alone would have left the rest of the method reading a stale member
`N2`; the measurement below shows what that costs.

Deliberately not done here: the spools of an off engine are not zeroed, because
shutdown and windmilling leave legitimate rotation; `Trim()` does not return
early for an off engine, so its existing hypothetical thrust is preserved; and
no public setting or start/stop semantic changed. Commanding cutoff immediately
before `RunIC()` while `Running` is still true remains a separate lifecycle
question, which this guard does not settle.

## Identity

| Item | Value |
| --- | --- |
| Published PR head | `07eba55fcd6fed530f6f404e857765c3224541fb`, also `origin/fix/turbine-trim-spool` |
| PR parent | `14c19022943f5850daf2c6b90554050b3139b853` |
| Local commit | `6f95bfb0a590d1a45de9f883857c17af0819f6ad`, "Preserve off-engine spool state during turbine trim", parent `07eba55f`, not pushed |
| Committed files | `FGTurbine.cpp` `0a79048f…`, `TestTurbineTrimSpool.py` `ba7f4fb1…` |
| Tested files | `FGTurbine.cpp` `90811fe1…` (comment-only difference), `TestTurbineTrimSpool.py` `ba7f4fb1…` |
| Head versions | `FGTurbine.cpp` `e9cfc131…`, `TestTurbineTrimSpool.py` `719f5b99…` |
| `before` extension | `d23d591ade1d0765579ea6d6f5ef98dd9a43062ea1e9a6a9cfc157b1fe39d83f` |
| `after` extension | `696c54ec7eed21c96c26ee45575c5df16d047a7396aad7de3b16a4bbba8aacf8` |
| Toolchain | AppleClang 21.0.0, CMake 4.4.3, Python 3.14.7, Cython 3.3.0, Darwin 27.0.0 arm64 |
| Options | `Release`, `BUILD_DOCS=OFF`, `BUILD_SHARED_LIBS=OFF`, `BUILD_PYTHON_MODULE=ON`, venv Python/Cython; `-O3 -DNDEBUG` |

Both extensions resolve to `<build>/tests/jsbsim/_jsbsim.so` in their own build,
confirmed from the environment the tests ran in. The `before` binary was built
at 16:15:25, before the source edit at 16:21:13, and was not rebuilt afterwards.
The results below belong to that tested tree, not to `07eba55f` alone.

Review then corrected one comment, and only that: no line outside the comment
changed, and with comments stripped the tested and committed sources hash the
same (`33dff8a2…`), so the results still describe the committed code. The
reviewer waived a rerun on that basis and none was done. Full values are in
[`provenance.json`](../../validation/evidence/jsbsim/engine-off-trim/pr1505-candidate-2026-09-19/provenance.json)
and [`final-commit.json`](../../validation/evidence/jsbsim/engine-off-trim/pr1505-candidate-2026-09-19/final-commit.json).

## Regressions

`tests/TestTurbineTrimSpool.py` keeps its running-engine test — the
idle/intermediate/full/idle sweep, the independent throttle-position check with
its dry clamp, and the first integrated idle sample — and now also asserts the
running flag, including right after the public `set-running` path, which marks
the engine running before its zero-time evaluation and settles it at maximum
N1/N2. Two tests were added, both using the stock F-16 fixture with no script
events:

- **never started:** `set-running` reads 0, then `RunIC()` at throttle commands
  0.35 and 0.75 must leave both spools, the simulation time and the off state
  alone;
- **cut off with residual spin:** started, 2 s at command 0.35, `cutoff_cmd`,
  then 10 s at `dt = 1/120`, leaving the engine off at about 0.55 % N1 and
  0.57 % N2 with fuel flow settled to zero, after which the same `RunIC()`
  checks apply. The second call also shows there is no delayed reset.

Both then advance 24 frames and require the engine to stay off with finite
spools, no fuel flow and no additional fuel used. Windmilling is not asserted
away: no test demands that an off engine stay at zero or keep slowing.

Off-engine values are compared against the values captured immediately before
each call, not against historical constants, with a 1e-9 tolerance on N1 and N2.
Nothing should write them at all, so the difference is expected to be zero; the
tolerance sits far below the 0.57 % residual and the ~86 % the defect produced.
Each call also asserts that the throttle's steady speed differs from the
preserved value by more than 1 %, so a check that cannot detect re-spooling
fails instead of passing quietly. Running-engine expectations keep their
existing `places=7`/`places=5` tolerances.

| Run | Result |
| --- | --- |
| `before` (unmodified #1505 head), same test source | **Failed**, exit 8. 8 spool assertions failed: never-started N1 82.0 vs 0.0 and N2 85.9 vs 0.0; after cutoff N1 82.0 vs 0.547 and N2 85.9 vs 0.573; both again at command 0.75 (100.0 vs 82.0 / 85.9) |
| `before`, existing running test | Passed |
| `after` (candidate) | 3/3 passed |
| `after`, focused 11-target suite | 11/11 passed in 13.4 s |

The baseline failures are assertion failures inside running simulations, not
import, fixture or build failures. The test source used for the baseline run is
byte-identical to the candidate's (`ba7f4fb1…`).

## Thrust is unchanged

`Trim()`'s thrust had to stay exactly as it was. Twelve zero-time cases —
never-started, cut-off and running engines, at a dry (position 0.70) and an
augmented (position 1.50) throttle, with the stock engine (`<augmethod> 2`) and
a sandbox copy using `<augmethod> 1` — were measured on both builds. The
repository's aircraft and engine data were not modified.

**All twelve are identical before and after, to the last bit**, while the
off-engine N2 changes from 85.9 to the value the engine actually had (0.0 or
0.5728). Augmentation really was exercised: the AugMethod 1 augmented cases
return 28,997.10 lbf, which is `MaxThrust × AugThrust` and not the 17,797.58 lbf
dry value, on the unpatched baseline as well as on the candidate.

A deliberately wrong implementation — the two assignments guarded, the rest of
`Trim()` still reading the member `N2` — was built and measured as a control. It
**passes all three spool tests** yet changes all eight off-engine thrust rows:
9,163.84 → 22,395.74 lbf dry, and AugMethod 1 loses augmentation entirely
(28,997.10 → 22,395.74 lbf) because the stale N2 never clears the 97 % threshold.
Running rows are unaffected, which is why the spool tests cannot see it.

The thrust guard therefore lives in the retained downstream tool
[`trim_thrust_compare.py`](../../scripts/validation/jsbsim/engine-off-trim/trim_thrust_compare.py),
not in the upstream test. Asserting it upstream would pin a powered thrust for
an engine that is off — legacy behaviour the plan intends to correct in the
later lifecycle work, not to ratify. **Review accepted that split on
2026-09-19: the comparison stays downstream characterization, and no upstream
thrust test is required for this stage.** The measurements characterize
compatibility; they are not a claim that an off engine should produce thrust.

## Limits

- **#1505 only.** #1508 carries this commit and additionally writes `N2norm`,
  TSFC and fuel flow during trim. It needs this patch carried over, its own
  guarded-state implementation, off-engine fuel regressions and its existing
  `TestTurbineTrimFuelFlow` checks. Nothing here proves any of that. The
  off-engine fuel assertions added here pass on `before` too, because #1505
  alone never wrote fuel flow; they are guards for that later work.
- **Nothing published.** The commit is local: `origin/fix/turbine-trim-spool`
  and the PR head are still `07eba55f`. No push, comment, review request,
  merge to fork master, rebase of #1508 or release package.
- **The app is unchanged.** fork.7 still contains the defect. Reset, bootstrap,
  restore and WASM validation must run against a later identified integration
  candidate before the app can be called fixed.
- **Coverage.** These are Python tests exercising the native engine. Upstream's
  coverage job builds with `-DBUILD_PYTHON_MODULE=OFF`, so they establish no C++
  line coverage there.
- **Platform.** Built and run only on macOS arm64 with AppleClang. Upstream CI
  covers the rest.
- **Sean's second comment** on #1505, posted 2026-09-19 20:45 UTC after our
  acknowledgment, corrects his own earlier wording: `in.TotalDeltaT == 0`
  holds whenever `SuspendIntegration()` is called, not only on the first frame.
  That agrees with this repair's premise and asks for no change. No reply is
  owed by this task.
