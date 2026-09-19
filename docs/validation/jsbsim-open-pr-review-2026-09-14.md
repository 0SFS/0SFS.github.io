# Review of open JSBSim and SDK PRs — 2026-09-14

A review of every open PR we have upstream. It found a defect in two of our own
PRs, three reviewer comments waiting on us, and one finished change with no PR.
Nothing was pushed, posted or changed on any branch.

Live PR bodies, diffs, comments, reviews and check runs were read on
2026-09-14. Upstream `master` was `14c19022943f5850daf2c6b90554050b3139b853`.

## State of each PR

| PR | Head | CI | Waiting on |
| --- | --- | --- | --- |
| [#1502](https://github.com/JSBSim-Team/jsbsim/pull/1502) wheel spin DOF | `24e085bf` | Passed; Codecov reports 0 % patch coverage | **Us.** bcoconni's analysis (2026-09-13) has no reply |
| [#1504](https://github.com/JSBSim-Team/jsbsim/pull/1504) Emscripten portability | `d47fd2e3` | Passed | Maintainers. Both questions answered |
| [#1505](https://github.com/JSBSim-Team/jsbsim/pull/1505) turbine trim spool | `07eba55f` | Not run: `action_required` | **Us.** Defect below |
| [#1506](https://github.com/JSBSim-Team/jsbsim/pull/1506) model reload lifetime | `a25956a2` | Not run: `action_required` | Maintainers. Nothing found |
| [#1507](https://github.com/JSBSim-Team/jsbsim/pull/1507) in-tree WASM package | `c6d4063a` | Not run: `action_required` | Maintainers. Scope decision, see below |
| [#1508](https://github.com/JSBSim-Team/jsbsim/pull/1508) turbine trim fuel flow | `7511df10` | Not run: `action_required` | **Us.** Defect below, and Sean's comment (2026-09-14) |
| [0x62/jsbsim-wasm#8](https://github.com/0x62/jsbsim-wasm/pull/8) property batch, gear contacts | `35d61009` | None reported | **Us.** Sean's benchmark question (2026-09-12) |

`action_required` means GitHub is holding the workflow runs for a maintainer to
approve. We cannot start them. #1507 also adds a workflow file
(`.github/workflows/wasm-build.yml`), which maintainers will review before
approving.

Stacking was checked and is consistent. #1507's first two commits have the same
diffs as #1504 and #1506, and #1508's first commit has the same diff as #1505.
Each dependent PR says so in its description. #1502 and #1504 are based on
`d0d8bc6e`, two commits behind `master`. GitHub reports both as cleanly
mergeable.

Four other open PRs in personal repositories date from 2023 to 2025. Two are WIP
drafts. None is JSBSim work.

## Defect: #1505 and #1508 wake up engines that are shut off

### What happens

`FGTurbine::Calculate()` sets `phase = tpTrim` on every zero-time evaluation
(RunIC, trim, `set-running`). It does this whether or not the engine is running;
only starvation, stall and seizure override it. `Trim()` therefore runs for
engines that are shut off.

Upstream separates two things. During trim, it only computes thrust. It commits
spool state only once time advances, in the block at `FGTurbine.cpp:125`, and
only when `Running && !Starved`. A shut-off engine goes to `tpOff` with its spool
state untouched.

- **#1505** assigns the members `N1` and `N2` inside `Trim()` for every engine.
- **#1508** also assigns `FuelFlow_pph` there.

A shut-off engine therefore comes out of RunIC at its commanded spool speed and
fuel flow. When time advances, `Off()` spins it down and bleeds the fuel flow off
at 10,000 lb/h per second. `CalcFuelNeed()` burns fuel from the tanks during
that bleed-off.

### Native evidence, repository F-16 fixture

Built from Git archives of `master` and the #1508 head (which contains #1505).
The toolchain was AppleClang 21.0.0, CMake 4.4.3, Python 3.14.7 and Cython 3.3.0.
The test was the engine never started, throttle 0.35:

| After RunIC | master | #1508 branch |
| --- | --- | --- |
| N1 / N2 | 0.00 / 0.00 | 82.00 / 85.90 |
| Fuel flow | 0.0 lb/h | 7,275.5 lb/h |
| Fuel used 0.2 s later | 0.0000 lb | 0.3463 lb |

The engine was also run, cut off for 10 s (N2 0.57 %), and then put through
RunIC. That gives the same result: master stays at 0.57 %, while the branch
jumps to 85.90 % and burns 0.19 lb in the next 0.1 s. Master and the branch both
report 9,163.8 lbf of trim thrust for the shut-off engine. That is existing
upstream behaviour and is not caused by these PRs.

### In the app

`src/flight/jsbsim/resetFlightLocation.ts` applies a location whose saved engine
is not running like this: RunIC, write `propulsion/engine/set-running 0`, then
RunIC again. That sequence was run on the SF50 package at 5,000 ft, 150 kt and
throttle 0.6:

| Package | After the reset | 1 s later |
| --- | --- | --- |
| fork.5 (has #1505's change) | N1 69.7, N2 81.4, 0.0 lb/h | N1 42.2, N2 49.3, fuel used 0 lb |
| fork.7 (installed; adds #1508's change) | N1 69.7, N2 81.4, **344.7 lb/h** | N1 42.2, N2 49.3, fuel used 0.0013 lb |

The spool part has shipped in every fork package since the native integration
first carried `fc13a97b`. The fuel-flow part arrived with fork.6.

The audio adapter treats fuel flow above 1e-4 lbm/s as combustion. After such a
reset the engine sound therefore briefly reads as burning, then winds down from
81 % N2. The engine monitor shows the same spool-down. This was not observed in
a browser; the numbers above are from Node against the installed package.

### Evidence

[`validation/evidence/jsbsim/engine-off-trim/`](../../validation/evidence/jsbsim/engine-off-trim)
contains the items below. On 2026-09-19 the two scripts moved, byte-identical,
to [`scripts/validation/jsbsim/engine-off-trim/`](../../scripts/validation/jsbsim/engine-off-trim/)
([tool relocation record](../../validation/evidence/jsbsim/tool-relocation.md)),
and the logs moved with the evidence tree from `docs/validation/evidence/`
([evidence relocation record](evidence-relocation-2026-09-19.md)).

- `native_check.py`, with `native-master.log` and `native-pr1508.log`.
  Module SHA-256:
  - master `fef2c2a9bb7f970149bd63cc4d269542c85ec6267ff53e7237b239fe71d68c96`
  - branch `4cb486d4916cd501b1f271e3eeae0e22e40aff612fe24a7e37429ca3fd0a3f8a`
- `check.mjs`, with `fork5.log` and `fork7.log`.
  Tarball SHA-256:
  - fork.5 `9312e2b6…`
  - fork.7 `58afaf9f…`

  The full hashes are in the evidence README.

### Direction, not yet decided

The smallest change is to assign `N1`, `N2`, `N2norm` and `FuelFlow_pph` in
`Trim()` only when `Running`. Thrust stays computed as before. Add a regression
for an engine that has never started and one that was cut off.

The change needs checking against:

- `InitRunning()`, which sets `Running` before its own zero-time `Calculate()`;
- the existing #1505 and #1508 tests;
- the app's reset, bootstrap and restore sequences.

Nothing has been implemented.

## Comments waiting on us

**#1508, seanmcleod70, 2026-09-14.**
- **Mass check:** he confirmed that updating fuel flow during trim iterations does
  not change aircraft mass (`FGPropulsion.cpp:167-170`).
- **Suggestion:** set fuel flow in the trim-finished block
  (`FGTurbine.cpp:124-134`) instead.
- **Trade-off:** that block only runs for running engines and only once time
  advances. It would avoid the defect above. But a caller that reads fuel flow
  straight after RunIC would still get the stale value. Two of #1508's three
  tests read it at exactly that point, and so does the SF50 cruise fuel-flow sweep.
- **Related:** he is also looking at turbine trim for
  [discussion #1501](https://github.com/JSBSim-Team/jsbsim/discussions/1501):
  `FGTurboProp::Calculate()` has no `tpTrim` case at all.

**#1502, bcoconni, 2026-09-13.**
- **His analysis:** a long review describing the change as making each wheel an
  independent body, following the `FGPropeller` pattern. He derives both
  constraint rows and confirms the code is correct.
- **What he found hard to follow:**
  - `ftRoll` and `ftWheelBrake` share one generalized right-hand side. The
    difference between them hides in `U = 0` and in `WheelCoeff` being 1 in one
    row and −R in the other.
  - The spin rate is absolute (measured in the NED frame), so the brake row
    targets ω = Ω·u_axle rather than ω = 0.
  - With the wheel DOF, `rolling_friction` characterizes friction between wheel
    and axle rather than tire hysteresis. Model authors need to be told that. The
    class documentation only implies it.
  - A spinning wheel always receives the maximum Coulomb brake torque.
- **Still to come:** he said the code "deserves some clean up and there are a
  couple of errors that need to be addressed", with more to follow. He has not
  named the errors, so do not guess what they are or mark them resolved.
- **Observation from this review (not raised by him):** in the air, spin decays
  toward absolute zero. A braked wheel on a pitching aircraft should instead lock
  to the airframe's rotation about the axle. The size is small (pitch rate
  against wheel rate).

**0x62/jsbsim-wasm#8, seanmcleod70, 2026-09-12.**
- **His question:** how much of the speed-up does a plain cache from path to
  property node give, without batching? He notes that the Python API took the
  cache-only approach in #993.
- **Status:** the contribution policy already lists this benchmark as #8's
  blocker.
- **Open decision:** where these APIs should be proposed once the SDK lives in
  JSBSim's `wasm/`, since #1507 leaves them out.

## Scope question on #1507

- **Size:** #1507 adds 6,429 lines across 51 files, 1,524 of them
  `wasm/package-lock.json`.
- **Our earlier promise:** our 2026-09-13 comment on #1504 said we would come back
  with results and a plan for upstreaming in smaller PRs.
- **Maintainer position:** no maintainer has yet agreed to an in-tree SDK.
- **Decisions only they can make:**
  - an MIT-licensed subtree (`wasm/LICENSE`) in an LGPL repository;
  - a new hosted workflow;
  - the `@jsbsim/wasm` package identity.
- **Assessment:** the description is thorough and the exclusions are deliberate.
  Expect a request to discuss the plan or split the PR before it is reviewed
  line by line.

Checked and not missing from #1507:
- the demo, old patches and release tarballs are left out on purpose;
- the batch and gear bindings are left out on purpose;
- `aeb43b70` (plain-text logging for Emscripten) is not needed, because the SDK
  strips ANSI escapes from log output by default (`stripAnsi`,
  `wasm/src/sdk/load-module.ts`).

## Finished work with no PR

**Turbine idle fuel flow.**
- **Where:** `c70be257` on `feature/turbine-idle-fuel-flow` (pushed to the fork).
- **What:** an optional `<idlefuelflow>` in lbm/hr replaces the
  `107 * milthrust^0.2` estimate. A negative value is rejected before engine
  properties are tied.
- **Tests:** `TestTurbineIdleFuelFlow` has five cases.
- **Upstream fit:** only its `FGTurbine.cpp` context sits on the trim change. It
  merges cleanly onto upstream `master`, and it does not depend on #1505 or #1508.
- **Use:** the app's SF50 declares `<idlefuelflow>76</idlefuelflow>` in
  `public/jsbsim-data/engine/fj33_5a.xml` under fork.7. That meets the condition
  the cruise fuel-flow record set for upstreaming.
- **Before submitting:**
  - rebase onto `master`;
  - rerun its tests on the exact candidate;
  - decide whether to wait for #1505/#1508, since the fixture interacts with the
    trim fuel-flow floor.

**C++ unit tests.**
- **Why coverage reads 0 %:** upstream's `coverage.yml` configures
  `-DBUILD_PYTHON_MODULE=OFF`, so Python regressions never count. That explains
  #1502's 0 % patch coverage without any missing execution. #1505, #1506 and
  #1508 will show the same once their CI runs.
- **Precedent:** the most recent upstream merge (#1491) came with a CxxTest
  (`tests/unit_tests/FGExternalReactionsTest.h`).
- **Benefit:** a unit test for the generalized friction solve would give #1502
  real coverage.

**Regressions for shut-off engines** in #1505 and #1508, as part of the fix above.
