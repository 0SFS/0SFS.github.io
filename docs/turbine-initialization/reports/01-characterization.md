# Stage 1: what the initialization paths actually do

**Characterization and evidence accepted; the follow-up review's contract
corrections are applied.** The [follow-up review](01-follow-up-review.md)
verified the retained results and named five contract groups and three
reporting corrections; all are closed, and the second disposition below records
each one and where it landed. That disposition records the agent's submission,
not acceptance of every contract decision, and **stage 3 remains pending**.
The original records are preserved unchanged, with
[`CORRECTIONS.md`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/CORRECTIONS.md)
mapping each correction to the file it affects,
[`follow-up/`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/follow-up/)
holding the first round's new and corrected measurements, and
[`follow-up-2/`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/follow-up-2/)
holding the three focused probes this round added.

2026-09-19. Stage 1 of the [turbine initialization plan](../plan.md). It is a
read-only characterization: it traces every caller that evaluates a turbine
without advancing time, measures what each one leaves behind, and proposes the
implementation choices the plan deferred. The choices are in
[decisions.md](../decisions.md); the records are in
[`validation/evidence/jsbsim/turbine-initialization/01-characterization/`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/).

**Nothing changed.** No production source was edited, no branch was created or
moved, nothing was pushed, no comment was posted, the app's installed
`@felipegalind0/jsbsim@1.2.4-fork.7` is untouched, and no dev or preview
server was started. The JSBSim checkout was clean on
`candidate/pr1508-off-engine-fuel` at `482da811` before and after.

## Sources

Refreshed live on 2026-09-19. Upstream `master` moved since the plan was
written, by one commit that touches only `tests/TestActuator.py`;
`src/models/propulsion/FGTurbine.cpp` is byte-identical between `14c1902` —
the base both PRs were cut from — and current master, so master is a valid
baseline for this work.

| Item | Identity |
| --- | --- |
| Upstream `master` | `a6f86ae93256eb00c2c990b711faa5bbb72ecb20` (was `29d2d6b8`; the new commit is `Fix TestActuator failure with Python 3.14 (#1512)`) |
| #1505 head | `07eba55f`, open, mergeable, `updatedAt` 2026-09-19T21:50:50Z |
| #1508 head | `7511df10`, open, mergeable, unchanged |
| Canonical checkout | `/Users/felg/gh/Felipegalind0/jsbsim`, clean, on `candidate/pr1508-off-engine-fuel` at `482da811` |
| Reviewed stage-0 repair | `6f95bfb0` on `fix/turbine-trim-spool` |
| Reviewed stage-2 repair | `482da811`, production correction `8945b0e3` |

Nine builds across the original run and the review follow-up, all Release with
the Python module and Cython, AppleClang 21.0.0, CMake 4.4.3, Python 3.14.7,
Darwin 27.0.0 arm64. The three uninstrumented ones were built once and reused.
Hashes in
[`module-identity.txt`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/module-identity.txt)
and [`provenance.json`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/provenance.json),
with the follow-up builds in
[`follow-up/module-identity.txt`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/follow-up/module-identity.txt)
and [`follow-up/provenance.json`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/follow-up/provenance.json).

| Build | What it is |
| --- | --- |
| `master` | upstream `a6f86ae9`, unmodified |
| `trimstatus` | the same source with bcoconni's one-line `GetTrimStatus()` condition, nothing else |
| `candidate` | the reviewed stage-0+2 repair; the stage-2 `final` binary reused unchanged, hash `f739de77…` matching its own provenance |
| `diag`, `diag-trimstatus`, `diag-candidate` | each of the three plus scratch read-only counters |
| `live`, `live-trimstatus`, `live-candidate` | the follow-up rebuild of those three, adding side-effect-free live getters |

The scratch counters expose the dispatched phase, per-phase call counts, the
copied propulsion timestep, the executive timestep, the trim status, the
number of `TSFC`/`ATSFC` evaluations, and the private members `N2norm`,
`FuelFlow_pph`, `Cutoff`, `EGT_degC`, `OilTemp_degK`, `NozzlePosition`,
`N1_factor`, `N2_factor` and `IdleFF`. They were applied to unpacked source
archives under JSBSim's gitignored `build/`, never to a branch.

**They change nothing.** Comparing each instrumented build with its
uninstrumented pair over every recorded sample: zero differences among 2137
compared values, for all three pairs. Every number below that is attributed to
an uninstrumented build was measured on one.

**They are last-dispatch fields, not live state.** `diag-phase`,
`diag-engine-dt`, `diag-exec-dt` and `diag-trim-status` are latched at the top
of `FGTurbine::Calculate()` and immediately before its phase dispatch, so after
a public call returns they describe the last evaluation that call performed and
not the state the caller now has. The follow-up builds add side-effect-free
live getters for the same four values and for the suspension flag, and are
equal to the original instrumented builds on all 5137 shared observables. Where
the two differ the live reading is used and the difference is stated.

## Method

Three maintained tools under
[`scripts/validation/jsbsim/turbine-initialization/`](../../../scripts/validation/jsbsim/turbine-initialization/):
`instrument_turbine.py` applies the diagnostics to an unpacked source archive,
`runic_trace.py` runs the broad trace, and `engine_probes.py` runs the thirteen
focused probes — live state, suspension nesting, starvation, the fuel matrix,
the stale corrected TSFC, the `N2norm` spool-rate sensitivity, stall recovery,
linearization, the configured-function call counts, the injection arms, and the
three the second follow-up added: derivative seeding, the scenario-reset field
table and the frozen refill. The injection arms run each arm in its own process
because two of them terminate it.

`runic_trace.py` runs sixteen scenarios per build in a subprocess with `PYTHONPATH` pointed at
that build's `tests`, verifies the loaded extension lives inside it, and
records a labelled sample at each point of interest. Every fixture is a stock
JSBSim aircraft. Three sandbox copies are written into the output directory
and no repository data is modified: a 737 with its two listening input sockets
removed, so that initializing the input model opens nothing; a copy of
`cruise_init.xml` carrying `<running> -1 </running>`; and a B747 engine given
the injection function it lacks.
Scratch, roots and raw output live under the JSBSim repository's `build/`.

Full table: [`trace.md`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/trace.md).
Curated: [`key-measurements.md`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/key-measurements.md).
Every value differing from master: [`differences.json`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/differences.json).
Lossless machine-readable trace, probe records, commands and digests:
[`follow-up/`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/follow-up/).

## The non-trim steady-thrust use case, preserved and measured

Sean's [#1505 comment](https://github.com/JSBSim-Team/jsbsim/pull/1505#issuecomment-5745555551)
describes setting a throttle position and calling `RunIC()` to begin with the
corresponding steady thrust, with no aircraft trim involved. That works, it is
worth keeping, and 0sfs has been relying on it in production.

737 at the cruise IC, `trimRequested == tNone` throughout, both engines
started, settled five seconds at throttle command 0.30, then commanded 0.90:

| Point | master thrust | master N1 / N2 | master flow gph |
| --- | --- | --- | --- |
| settled at 0.30 | 1072.85 | 51.000 / 72.000 | 149.05 |
| throttle to 0.90, before the call | 1072.85 | 51.000 / 72.000 | 149.05 |
| immediately after `RunIC()` | **6599.21** | 51.000 / 72.000 | 149.05 |
| one frame later | 6599.22 | 93.000 / 96.000 | 150.29 |

The control — the same throttle change advanced in real time, no `RunIC()` —
reaches 1077.14 lbf after one frame, 1741.74 after one second and 6773.93
after five. So `RunIC()` really is delivering the steady operating point
immediately, and that is the whole point of the path.

It is also, on master, only half delivered, and the two halves recover
differently. The thrust is steady immediately while N1, N2, the fuel flow and
the corrected TSFC still describe the old operating point. On the next frame
the trim-finished block snaps N1, N2 and the corrected TSFC to the new
operating point — 93.000, 96.000 and 0.5741 — but **not** the fuel flow, which
is left to seek: 149.05 gph before the call, 150.29 gph one frame later,
297.42 gph one second later, against a 585.52 gph steady value. That is
precisely the inconsistency #1505 and #1508 set out to fix. On the repaired
candidate the same call returns 6599.21 lbf **with** N1 93.000, N2 96.000, flow
585.52 gph and TSFC 0.5741 — the state and the thrust agree at the moment the
caller reads them.

0sfs depends on this in four places, each with a comment saying so:
[bootstrapC172.ts:105](../../../src/flight/jsbsim/bootstrapC172.ts#L105),
[resetFlightLocation.ts:92](../../../src/flight/jsbsim/resetFlightLocation.ts#L92),
[flightModelDriver.ts:246](../../../src/flight/model/flightModelDriver.ts#L246) and
[safeFlightState.ts:77](../../../src/flight/physics/safeFlightState.ts#L77) all
set the throttle and call `runIc()` a second
time specifically to get the requested power state evaluated, because the
first call's engine start forced full throttle. Sean's example and the app's
workaround are the same mechanism.

## bcoconni's proposed condition, measured on its own

[His suggestion](https://github.com/JSBSim-Team/jsbsim/pull/1505#issuecomment-5745457074)
replaces `if (in.TotalDeltaT == 0) phase = tpTrim;` with
`if (FDMExec->GetTrimStatus()) phase = tpTrim;`. Built from unmodified master
with that one line changed and nothing else
([`trimstatus-variant.diff`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/trimstatus-variant.diff)):

**the initialize-running path stops working.** After
`propulsion/set-running = -1`, `propulsion/engine[0]/set-running` reads 0. Over
the same 737 scenario the engine dispatched `Off()` 605 times and `Trim()` 122
times and `Run()` zero times; thrust was 0.00 lbf at every sample and
`fuel-used-lbs` never left zero. 119 of the recorded samples differ from
master.

It does **not** stop turbines starting. The retained `starts` scenario shows
the variant reaching `set-running == 1` through the ordinary starter-and-cutoff
sequence, in both arms: cold, N1 31.12 and N2 53.00 at the same frame counts as
master; and after a shutdown, N1 31.11 and N2 53.00. What breaks is the
programmatic start.

The mechanism is `FGPropulsion::InitRunning()`, and it is worth stating
because it explains why the condition cannot simply be swapped:

1. `FGTurbine::InitRunning()` suspends integration and calls `Calculate()`
   directly. `SuspendIntegration()` does not refresh the copied propulsion
   timestep, so `in.TotalDeltaT` is whatever `LoadInputs` last wrote. Under
   `RunIC()` that is 0 — which is why master reaches `Trim()` here. With the
   proposed condition the trim status is false, nothing selects `tpTrim`, the
   phase is still `tpOff`, and `Off()` runs and sets `Running = false`.
2. `FGPropulsion::GetSteadyState()` then sets the trim status **itself** and
   time-marches the engine at an artificial 0.5 s step until thrust converges.
   With the proposed condition every one of those iterations selects `tpTrim`,
   so `Run()` never executes and the spools never move. That is the 122 trim
   calls.
3. On the next real frame the trim-finished block finds `Running == false` and
   commits `phase = tpOff`, `Cutoff = true`.

The observation behind the suggestion is right: `tpTrim` is selected far more
often than an aircraft trim occurs. The condition is not a drop-in
replacement, because the engine's own starting path sets the trim status it
would then read.

Incidentally, the variant is the only build of the six that does **not**
segfault on the injection case below — it never reaches `Trim()`.

## Suspension and the copied timestep

Sean's [correction](https://github.com/JSBSim-Team/jsbsim/pull/1505#issuecomment-5745172993)
was that `in.TotalDeltaT == 0` means "integration is suspended", not "first
frame". Measured directly:

Read live, through getters with no side effects:

| Point | executive dt | copied engine dt | `IntegrationSuspended()` | phase |
| --- | --- | --- | --- | --- |
| running normally | 0.008333 | 0.008333 | false | run |
| after `SuspendIntegration()`, before any `Run()` | 0.000000 | **0.008333** | true | run |
| after one suspended `Run()` | 0.000000 | 0.000000 | true | **trim** |

So suspension alone does not refresh the engine's input; only the next `Run()`
does, through `FGFDMExec::LoadInputs`. Everything that follows from that —
including `FGTurbine::InitRunning()` seeing a stale zero under `RunIC()` and a
stale real dt at runtime — is a consequence.

Two further live readings matter, and neither is visible in the latched
diagnostics. `RunIC()` **leaves the copied propulsion timestep at zero** when
the IC asks for no engine start, while the executive is back at 0.008333; it
leaves it at the real timestep when the IC does ask for a start, because
`GetSteadyState()` sets `in.TotalDeltaT = FDMExec->GetDeltaT()` rather than
restoring what it replaced. And `propulsion/set-running` does *not* leave the
copied timestep at the 0.5 s it settles with: the latched field records 0.5 s
because that was the final settling evaluation, but a live read gives
0.008333. The original record's block B said otherwise and is corrected in
[`CORRECTIONS.md`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/CORRECTIONS.md).

The zero-dt path is not rare, and its callers do not all want the same thing.
Every `SuspendIntegration()` caller in the tree, with what it needs from an
engine while suspended:

| Caller | What it is doing | Needs |
| --- | --- | --- |
| `FGFDMExec::RunIC` | applying initial conditions | equilibrium for a running engine, preserved history for one that is off |
| `FGTrim::DoTrim` | aircraft trim trials and the accepted solution | equilibrium at each trial |
| `FGTrimAnalysisControl`, twice | trim analysis perturbations | equilibrium |
| `FGTrimmer` | simplex trim; sets the trim status itself | equilibrium |
| `FGStateSpace::run` | its settle loop, which also calls `GetSteadyState()` and sets the trim status itself | equilibrium, asked for explicitly |
| `FGLinearization::Calculate` | suspends around `FGStateSpace::linearize`, so every numerical-Jacobian perturbation is evaluated suspended | **undecided.** Today the engine is collapsed to its steady map, so the throttle column of `B` describes the steady thrust response and not the spool dynamics. Which of the two a linearization should measure is a maintainer question; this stage flags it rather than settling it |
| `FGTurbine::InitRunning` | assigning a running operating point | equilibrium; this is the one case where that *is* the request |
| Python `suspend_integration`, SDK callers | anything | unknown, which is the point |

`FGPropagate::Run` and `FGRocket::Calculate` already branch on
`IntegrationSuspended()` explicitly rather than on a copied dt, so the pattern
of asking the executive directly is established.

The repaired candidate changes the suspended readback too: at the same point
it reports N1 100.000 / N2 100.000 and 6836.87 gph where master reports
76.000 / 81.200 and 888.92 gph.

## Nested suspension: the paired resume restores the wrong value

`saved_dT` is a single `double`. Suspending and then calling `RunIC()`, which
suspends and resumes internally, destroys the outer saved value:

```
suspended:    exec dt=0.000000
after RunIC:  exec dt=0.000000 suspended=True
after resume: exec dt=0.000000 suspended=True
```

The paired resume fails: it restores 0, not the caller's timestep, so the
executive stays suspended until something intervenes. An explicit `Setdt`
restores it — measured, `exec dt` back to 0.008333 and `IntegrationSuspended()`
false — so the condition is a failed resume rather than an unrecoverable
executive. `propulsion/set-running` does the same, for the same reason:
`FGTurbine::InitRunning()` suspends and resumes around its own `Calculate()`.
Record:
[`starvation-nesting-and-stale-tsfc.txt`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/starvation-nesting-and-stale-tsfc.txt).

## An explicit cutoff is discarded by an initialization

F-16, running at throttle command 0.60, `propulsion/cutoff_cmd = 1`, then
`RunIC()` with no frame in between — the case stage 0 named and left open.

| Point | running | thrust lbf | flow gph | phase |
| --- | --- | --- | --- | --- |
| running | 1 | 19732.17 | 3448.87 | run |
| cutoff commanded, no frame | 1 | 19732.17 | 3448.87 | run |
| after `RunIC()` | 1 | 20037.48 | 3448.87 (master) / 6223.76 (candidate) | trim |
| one frame after | 1 | 20036.16 | 3455.18 / 6223.35 | **run** |

The zero-dt override wins over `if (Cutoff && (phase != tpSpinUp)) phase = tpOff;`,
so `Trim()` is dispatched and returns full thrust. Then the trim-finished
block finds `Running && !Starved` and executes its running branch, which sets
`Cutoff = false`. **The commanded cutoff is gone**, on master and on the
repaired candidate alike. This is a demonstrated defect, not a hypothetical
one, and it is why the redesign cannot keep inferring intent from `dt`.

The per-engine boolean has the mirror-image problem. Writing
`propulsion/engine[0]/set-running = 1` — which only sets a flag — followed by
`RunIC()` and one frame produces N1 100.000, N2 100.000, `Cutoff` cleared and
oil at 366 K, with no start sequence at all.

## A stored IC running request is replayed by every later `RunIC()`

737 with `<running> -1 </running>` added to a sandbox copy of `cruise_init`:

| Point | running | N1 / N2 | thrust lbf | FCS throttle position |
| --- | --- | --- | --- | --- |
| after the first `RunIC()` | 1 | 100.000 / 100.000 | 8058.21 | 0.30 |
| settled after 2 s | 1 | 73.615 / 72.000 | 1071.29 | 0.30 |
| cut off and settled 10 s | 0 | 26.404 / 17.602 | 0.00 | 0.30 |
| after a second `RunIC()` | **1** | **100.000 / 100.000** | **8058.21** | 0.30 |
| after `ResetToInitialConditions(0)` | 1 | 100.000 / 100.000 | 8058.21 | 0.00 |

`enginesRunning` is cleared only in `FGInitialCondition::InitializeIC()`,
which `ResetToInitialConditions()` does not call, so the bitmask survives
every reset and every later `RunIC()`. Two things follow. An engine the user
deliberately shut down restarts on the next initialization; and it restarts at
**full power regardless of the throttle**, because
`FGPropulsion::SetEngineRunning` writes `in.ThrottleCmd = in.ThrottlePos = 1`
before starting. The engine then spools down over the following seconds — N1
99.876 one frame later, the FCS throttle having been 0.30 the whole time.

That second effect is the one every 0sfs bootstrap and recovery path works
around with a second `runIc()`.

The first submission proposed making the request one-shot. It is withdrawn:
four shipped initialization files use `<running>`, none combines a turbine with
a runtime cutoff and a later `RunIC()`, and 0sfs does not use the element at
all, so the change had no beneficiary. A caller that wants a passive refresh
uses that operation instead of the IC path, and
[decisions.md §4.4](../decisions.md) records the existing lifecycle rather than
changing it.

## Fuel: the published rate is not the engine's fuel flow

`propulsion/engine[n]/fuel-flow-rate-pps` and `-gph` are tied to
`FGEngine::GetFuelFlowRate()` and `GetFuelFlowRateGPH()`, both reading
`FuelFlowRate`. The only writer is `FGTurbine::CalcFuelNeed()`, and its only
caller is `FGPropulsion::ConsumeFuel()`, which returns early on fuel freeze,
on trim status, and on starvation.

**Starvation holds the published flow for as long as `ConsumeFuel()` keeps
returning early.** F-16 running at 3448.87 gph, tanks emptied:

| After | published gph | published pps | running | N2 | engine's own `FuelFlow_pph` |
| --- | --- | --- | --- | --- | --- |
| 1 frame | 3448.87 | 6.3229 | 1 | 100.000 | 22804.20 |
| 120 frames | 3448.87 | 6.3229 | 0 | 60.843 | 12887.53 |
| 1200 frames | 3448.87 | 6.3229 | 0 | 0.670 | 0.00 |
| 7200 frames | 3448.87 | 6.3229 | 0 | 0.029 | 0.00 |

Refilling the tanks ends it: `ConsumeFuel()` reaches `CalcFuelNeed()` again and
the published rate drops to 0.00 gph on the very next frame. So the stale value
is bounded by the early return, not permanent, and explicit intervention clears
it. What it is not bounded by is time, the engine's own state, or anything the
consumer can see.

**Fuel freeze holds it too.** With `propulsion/fuel_freeze = 1` the
published rate holds at 3448.87 gph for 120 frames while `FuelFlow_pph` climbs
from 22762.53 to 27762.53 pph. On the repaired candidate a `RunIC()` during
the freeze writes 41076.84 pph internally and the published rate still reads
3448.87 gph. It only catches up when the freeze is lifted.

This matters downstream: `jsbsimAudioAdapter.ts` decides combustion from
`fuel-flow-rate-pps > 1e-4`, so an engine that has run out of fuel keeps
reporting that it is burning until something refills a tank. This is a reading
of the app source and of native 737 and F-16 measurements; it is not a measured
readback from the installed SF50 WASM package, which stage 7 will do.

**Starting with no fuel succeeds, and with fuel freeze it keeps succeeding.**
`propulsion/set-running = -1` with every tank at zero reports the engine
running at N1 100.000 / N2 100.000 and 17797.58 lbf, because
`GetSteadyState()` sets the trim status and `ConsumeFuel()` — the only thing
that would call `SetStarved()` — returns early. The following `RunIC()` shuts
it down, and nothing reports the failure to the caller. Cross the same case
with `propulsion/fuel_freeze = 1` and even that correction disappears: the
engine starts, survives the `RunIC()` and is still running 120 frames later at
19857.3 lbf on empty tanks, because the freeze keeps `ConsumeFuel()` returning
early for as long as the freeze is on. The four-cell matrix is in
[`follow-up/probes.md`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/follow-up/probes.md).

**The starvation flag is stale in exactly the same cases as the published
rate.** `ConsumeFuel()` recomputes `Starved` only when it gets past its freeze
and trim-status early returns, because `SetStarved()` sits after the tank walk
those returns skip — and it runs after `engine->Calculate()`, so the engine
always decides on the previous evaluation's flag. Thawed, refilling the tanks
does clear it: the engine stays off through a `RunIC()`, refilling does not
restart it, and an explicit `set-running` does. **Frozen, refilling cannot
clear it.** F-16, started, emptied, refilled to 2000 lb with
`propulsion/fuel_freeze = 1`, then `propulsion/set-running = -1` and 120
frames:

| Refill performed | After the restart request |
| --- | --- |
| thawed | running, N1 100.0, 19576.3 lbf |
| frozen | **not running**, N1 0.42, N2 0.28, 0.0 lbf, tanks untouched at 2000 lb |
| frozen, then one thawed frame | running, N1 100.0, 19576.3 lbf |

One unfrozen frame is the whole difference. The full arms are in
[`follow-up-2/probes.md`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/follow-up-2/probes.md)
§3. This is why the decisions query usable fuel at the point of decision
instead of reading the flag; the first submission's "a starvation flag is not
stale" was wrong for the freeze and trim cases.

## What the repaired PRs change relative to master

Restricted to running engines, which is what the guards allow through. 59 of
the recorded samples differ from master. The differences are consistent and
intended:

- N1, N2, the member `N2norm`, the corrected TSFC and the fuel flow describe
  the new operating point immediately instead of one frame later;
- because the flow is written immediately, the frames after a `RunIC()` burn
  it. Held down at a fixed operating point, master's flow seeks from 1933.75
  gph toward its target over seconds while the candidate starts at 6223.76;
  over the second after the fuel-freeze case is thawed, master burns 8.41 lb
  and the candidate 11.37 lb. This is a real consumption change, not only an
  indication change, and it is the intended consequence of establishing the
  steady flow;
- `FGPropulsion::GetSteadyState()` converges in fewer iterations, because the
  spools are already at the steady value when its loop starts: 123 engine
  evaluations against master's 133 for one `propulsion/set-running` on the
  737. A side effect is that the oil temperature reaches 361.2 K instead of
  366.0 K at the moment the caller reads it; both are 366.0 K one frame later.

Off-engine behaviour is unchanged by design in stages 0 and 2: a never-started
F-16 engine still returns 9163.84 lbf from `Trim()` at throttle command 0.35,
and a never-started 737 engine 379.25 lbf at the cruise IC. Stage 5 removes
that.

## The app's callers

| Path | What it asks for today | What it should ask for |
| --- | --- | --- |
| `bootstrapC172.ts` | `runIc()`, `propulsion/set-running = -1`, restore throttle, `runIc()` again | one explicit initialize-cold or initialize-running at the requested controls |
| `resetFlightLocation.ts` | the same two-call dance, with the saved controls replayed three times around it | preserve turbine history, apply the new position, refresh — or initialize a preset scenario for a runway |
| `flightModelDriver.ts` `initializeScenario` | `resetToInitialConditions(2)`, writes, `runIc()`, `set-running = -1`, `runIc()` | one explicit initialization |
| `safeFlightState.ts` `restoreSimulation` | `resetToInitialConditions(2)`, replay IC and controls, `runIc()`, `set-running`, `runIc()` | restore the captured engine record, then refresh |
| `fixedStepLoop.ts` | `captureSimulation(sdk)` **every frame**, restoring on a fault | unchanged in shape; the snapshot gains the engine record |
| `jsbsimAudioAdapter.ts` | `fuel-flow-rate-pps > 1e-4` or `set-running` | unchanged, once the published rate is truthful |

The same sequence, reproduced on the stock 737 fixture — the app's own SF50
package was not run, so these are native measurements of the sequence, not
readbacks from the installed WASM:

| Point | master N1 / N2 | master thrust | candidate N1 / N2 | candidate thrust |
| --- | --- | --- | --- | --- |
| before the restore | 51.000 / 72.000 | 1071.44 | 51.000 / 72.000 | 1071.44 |
| after `resetToInitialConditions(2)` | 0.000 / 0.000 | 0.00 | 0.000 / 0.000 | 0.00 |
| after the first `runIc()` | 0.000 / 0.000 | 1070.35 | 0.000 / 0.000 | 1070.35 |
| after `set-running = -1` | 100.000 / 100.000 | 8058.21 | 100.000 / 100.000 | 8058.21 |
| after the second `runIc()` | **100.000 / 100.000** | 1070.35 | **51.000 / 72.000** | 1070.35 |
| one frame later | 51.000 / 72.000 | 1070.37 | 51.000 / 72.000 | 1070.37 |

The sample the app hands to telemetry and audio is the fifth row. On the
native master build it claims 100 % N1 and N2 alongside cruise thrust, and a
fuel flow of 706.56 gph against the 148.60 gph the engine settles at; the
candidate makes that row self-consistent. The app's installed
`1.2.4-fork.7` package carries the unrepaired code, so the same shape is
expected there, but **that has not been measured**: it needs the SF50 through
real WASM, which is stage 7. Neither build restores the engine's history:
`captureSimulation` records one boolean, so every recovery is a restart. The
plan's native state capture is what fixes that.

The `resetToInitialConditions(2)` that opens the sequence takes more with it
than the spools. Measured on the F-16 in
[`follow-up-2/probes.md`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/follow-up-2/probes.md)
§2, a scenario reset zeroes `InjWaterNorm`, the configured `InjN1increment` and
`InjN2increment`, the thruster's acting location and the reverser angle, while
keeping runtime overrides of `MaxN1`, `MaxN2` and the bleed factor and leaving
`InjectionTimer` carrying the previous flight's value. So the start, shutdown
and injection history the contract promises through a rejected step does not
survive one today, and a recovery silently changes the engine's configuration.
No shipped engine defines the injection increments, so nothing ships broken.

## Faults, injection and a crash

**Precedence**, F-16 running, each fault applied and then `RunIC()`:

| Fault | phase after `RunIC()` | running | thrust | published flow |
| --- | --- | --- | --- | --- |
| stalled | stall | 1 | 0.00 | 114.80 gph (`IdleFF`, 757.6 pph) |
| seized | seize | 0 | 0.00 | 114.80 gph |
| starved | off | 0 | 0.00 | 3448.87 gph, frozen |
| stalled + seized | **seize** | 0 | 0.00 | 114.80 gph |
| stalled + seized + starved | **seize** | 0 | 0.00 | 3448.87 gph, frozen |

The order in `Calculate()` is starved → stalled → seized, each overwriting the
last, so seizure wins. Clearing a stall needs the throttle below 1 %; the
engine then re-enters `tpRun` at whatever N2 the stall left and `Run()` seeks
it to the idle target
([`stall-recovery.txt`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/stall-recovery.txt)).

**Injection duration is already preserved.** `RunIC()` leaves
`InjectionTimer` at 0.99999… and `InjWaterNorm` at 0.9667 exactly. Two things
are wrong:

- `Trim()` applies the `Injection` lookup whenever `Injected == 1` and the
  injection command is set, with no `InjWaterNorm > 0` check — `Run()` has
  one. Measured on a sandbox B747 engine with the water exhausted, `RunIC()`
  still multiplies thrust by the configured 1.05.
- `Injected == 1` without a `<function name="Injection">` is a null pointer.
  No shipped engine defines that function, and `GE-CF6-80C2-B1F` declares
  `<injected> 1 </injected>`, so on the stock B747 setting
  `propulsion/engine[0]/injection_cmd = 1` and calling `RunIC()` is a
  **SIGSEGV in `FGTurbine::Trim()`**. Two of the six builds survive it, and
  both are the `GetTrimStatus()` variants, which never dispatch `Trim()` at
  all. The follow-up adds the arms the original record did not measure: a
  running `Run()` reaches the same lookup and also terminates, while `Run()`
  with the engine off survives because `Off()` never reads it, and adding an
  `Injection` function to a sandbox copy makes every arm survive. Adding the
  function to a sandbox copy removes the crash.
  Record: [`injection-null-lookup.txt`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/injection-null-lookup.txt).

## `N2norm` after a shutdown

The question stage 2 carried forward. `N2norm` is written only by `Run()` and
by `ResetToIC()`; `Off()` maintains N1 and N2 but not the normalization, so it
holds the last running value for the whole shutdown — 1.0000 while N2 decays
to 1.262, on master and on the candidate alike. The stage-0/2 guard restores
master's behaviour here rather than introducing a new one.

Two readers care. `FGSpoolUp` reads it to scale the spool rate: isolated, one `Run()` frame at idle N2 with a full-throttle demand and
nothing differing but the member, N2 advances by 0.0692 at `N2norm = 0` and by
0.2206 at `N2norm = 1`, a factor of 3.19
([`n2norm-spool-rate.txt`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/n2norm-spool-rate.txt)).
`FGSimplifiedTSFC` reads it too, so any evaluation of the default TSFC for an
engine that is off is made at the stale normalization. That is separate from
the published `tsfc` being stale, which it also is — 0.7171 with the spool at
1.262 % — but for the different reason that `correctedTSFC` is latched and
only `Run()` writes it.

The same factor appears in a real restart. `SpinUp()` and `Start()` use their
own configured rates, so cranking and lighting barely change — 590 frames to
crank after a shutdown against 640 from cold, 2221 to light against 2222 — but
the first `Run()` frame after the engine latches advances N1 by 0.221 on the
restart against 0.069 from cold. `Run()` recomputes `N2norm` immediately
afterwards, so the effect is one frame.

[decisions.md §6](../decisions.md) splits it into two. Removing the staleness
— recomputing `N2norm` from `N2` wherever `N2` changes — is settled, with a
causal restart test, and belongs to **stage 4**, not to the behaviour-preserving
stage-3 extraction. Whether the result should also be *clamped*, and
identically for every reader, is not settled: the 3.19× sensitivity shows the
value matters, not that `FGSpoolUp`, `FGSimplifiedTSFC` and the thrust term
want the same quantity. Stage 4 answers that with the below-idle,
above-maximum, zero-denominator and injection-factor cases written out there.

## Configured functions

`IdleThrust`, `MilThrust`, `AugThrust`, `Injection` and any configured spool
rates are pre-functions: `RunPreFunctions()` is the first statement of
`Calculate()` and `FGFunction::cacheValue(true)` caches the result, so each is
evaluated once per evaluation, before `ThrottlePos` is read and before any
spool moves. `<tsfc>` and `<atsfc>` are built directly rather than registered,
so they are evaluated live at each call site. `propulsion/engine[n]/atsfc` is
tied to the parameter's getter, so reading that property evaluates the
function and fires its `copyto`; `…/tsfc` is tied to the stored value and is
read-only. `GetSteadyState()` runs the full pre/post-function pass on every
one of its up-to-6000 iterations.

The evaluation counts per phase were measured with counters wrapping the
engine's own call sites, because a constant `copyto` sentinel can show that a
function ran and not how often. They are not uniform, and the irregular rows
are exactly what a careless extraction would break:

| Step | Phase | Engine evaluations | master TSFC / ATSFC | candidate TSFC / ATSFC |
| --- | --- | --- | --- | --- |
| `RunIC()`, engine off | trim | 2 | 0 / 0 | 0 / 0 |
| one frame, engine off | off | 1 | 0 / 0 | 0 / 0 |
| `propulsion/set-running = -1` | run | 124 | 123 / 0 | 123 / 0 |
| one running frame, dry | run | 1 | 1 / 0 | 1 / 0 |
| `RunIC()`, running, dry | trim | 2 | 0 / 0 | 2 / 0 |
| first augmented frame | run | 1 | 1 / 1 | 1 / 1 |
| second augmented frame | run | 1 | 0 / 1 | 0 / 1 |
| `RunIC()`, running, augmented | trim | 2 | 0 / 0 | 2 / 2 |
| one stalled frame | stall | 1 | 0 / 0 | 0 / 0 |
| one seized frame | seize | 1 | 0 / 0 | 0 / 0 |
| one frame after cutoff | off | 1 | 0 / 0 | 0 / 0 |
| one cranking frame | spinup | 1 | 0 / 0 | 0 / 0 |

The first augmented frame evaluates **both** parameters, because
`Augmentation` is still false from the previous frame when `if (!Augmentation)`
is tested; later augmented frames evaluate only ATSFC. With a sandbox
`<augmethod> 1` engine a running frame can evaluate **neither**, when
`Augmentation` is latched true and the throttle has since fallen below the
99 % threshold. Stage 3 reproduces this table rather than normalizing it.

## Fixtures and tests available

61 scripts under `scripts/`, 30 turbine engine definitions and 22 shipped
aircraft that use one. Upstream turbine-relevant Python tests: `TestTurbine`,
`TestTurboProp`, `TestEngineIndexedProps`, `TestUnusableFuel`,
`TestFuelTanksInertia`, `CheckTrim`, `TestInitialConditions`, `TestICOverride`,
`TestSuspend`, `CheckSimTimeReset`. The candidate adds `TestTurbineTrimSpool`
and `TestTurbineTrimFuelFlow`. **No CxxTest unit test covers any propulsion
model**: `tests/unit_tests/` has no engine, propulsion or thruster case at
all, which is why the Python-disabled job shows nothing for these lines. The
candidate is based on `14c1902` and therefore predates master's
`TestActuator.py` Python 3.14 fix; that is a base difference, not a change.

## Draft note for the maintainers — not posted

Written for #1505; it is a draft in this report only. Nothing has been posted
in this stage, and publication remains a separate authorized step.

> Thanks both — this is useful, and it pushed us to measure the paths rather
> than argue about them.
>
> @seanmcleod70, your non-trim case is exactly right and we want to keep it.
> Setting a throttle and calling `RunIC()` to start from the corresponding
> steady thrust is a real use case, and it is one we depend on: on the 737
> cruise fixture with `tNone`, moving the throttle from 0.30 to 0.90 and
> calling `RunIC()` returns 6599.21 lbf immediately, where letting it spool
> takes about five seconds. Our app calls `RunIC()` a second time in four
> different places for precisely that reason. Nothing we are proposing removes
> it.
>
>
> What #1505 and #1508 fix is that on `master` only half of it arrives. The
> thrust is the steady value while N1, N2, fuel flow and the corrected TSFC
> still describe the previous operating point. The frame after the call, the
> trim-finished block brings N1, N2 and the corrected TSFC across — 93.0, 96.0
> and 0.5741 — but not the fuel flow, which is left seeking: 149.05 gph before
> the call, 150.29 gph one frame later, 297.42 gph a second later, against a
> steady 585.52 gph. With the guarded versions the same call returns 6599.21
> lbf together with all four.
>
> You are also right that `in.TotalDeltaT == 0` means "integration is
> suspended", not "first frame", and we confirmed the detail that matters
> here: `SuspendIntegration()` does not refresh the propulsion input. Straight
> after suspending, the executive dt is 0 while the engine's copied dt is
> still 0.008333; only the next `Run()` brings them together.
>
> @bcoconni, we built your suggestion on its own against current `master` to
> see what it does. It breaks the programmatic start: after
> `propulsion/set-running = -1` the engine reports `set-running` 0, and over
> the same 737 run it dispatched `Off()` 605 times and `Trim()` 122 times and
> `Run()` never. Starting the engine the ordinary way — starter on with the
> cutoff closed, then opening it — still works on that build, from cold and
> after a shutdown, so this is specifically the `InitRunning()` path. The
> reason is `FGPropulsion::InitRunning()`.
> `FGTurbine::InitRunning()` calls `Calculate()` directly with a stale zero dt,
> so with the new condition nothing selects `tpTrim`, the engine is still in
> `tpOff`, and `Off()` clears `Running`. Then `GetSteadyState()` sets the trim
> status itself and time-marches at 0.5 s per step — so every iteration selects
> `tpTrim` and the spools never move. On the next real frame the trim-finished
> block sees `Running == false` and shuts the engine down.
>
> That does not make the observation wrong. `tpTrim` is selected far more often
> than an aircraft trim happens, and the trim status is not a usable
> replacement either, because the engine's own starting path sets it.
>
> Separately from the naming: Sean, we agree `Trim()` is misnamed and we would
> like to rename it to say what it does, as its own commit with no behaviour
> change.
>
> Beyond your comments, tracing these paths turned up things worth reporting
> on their own, and we will open them separately rather than widen these PRs:
>
> - `SuspendIntegration()` saves one `double`, so nesting destroys it. Suspend,
>   call `RunIC()`, resume: the executive is left at `dT = 0` with
>   `IntegrationSuspended()` still true. `propulsion/set-running` does the same.
> - `propulsion/engine[n]/fuel-flow-rate-pps`/`-gph` are written only inside
>   `ConsumeFuel()`, which returns early on fuel freeze, trim status and
>   starvation, so the published rate holds for as long as that early return
>   continues. A starved engine was still publishing 3448.87 gph 60 s later,
>   with the engine off and its own flow at zero; refilling a tank clears it on
>   the next frame. With fuel freeze the same mechanism lets an engine start
>   and keep running at full thrust on empty tanks, because nothing ever calls
>   `SetStarved()`.
> - `<injected> 1 </injected>` without a `<function name="Injection">` is a null
>   dereference. `GE-CF6-80C2-B1F` declares it and defines no such function, so
>   on the stock B747 `propulsion/engine[0]/injection_cmd = 1` terminates the
>   process through `Trim()` from `RunIC()` and through `Run()` with the engine
>   running; `Run()` with the engine off is fine, because `Off()` never reads
>   the lookup. `Trim()` also applies the injection factor with no water
>   remaining, where `Run()` checks `InjWaterNorm > 0`.
> - `ConsumeFuel()` returns on fuel freeze and on trim status *before* it walks
>   the tanks, and `SetStarved()` sits after that walk, so a starvation flag
>   latched by an earlier frame cannot be cleared while either condition holds.
>   Refilling an F-16's tanks to 2000 lb with freeze on leaves
>   `propulsion/set-running = -1` unable to start the engine — N1 0.42, no
>   thrust — until a single unfrozen frame runs.
> - `FGTurbine::ResetToIC()` zeroes `InjN1increment` and `InjN2increment`,
>   which are configuration loaded from `<injection-N1-inc>` and
>   `<injection-N2-inc>`, and sets `InjWaterNorm` to 0 although `Load` sets it
>   to 1.0. So a scenario reset destroys injection configuration and empties
>   the water instead of restoring it, while leaving `InjectionTimer`, `EPR`
>   and `OilPressure_psi` carrying the previous flight's values and leaving
>   runtime overrides of `MaxN1`, `MaxN2`, the bleed factor and the thruster
>   orientation in place. No shipped engine defines the injection increments,
>   so nothing ships broken today.
> - `FGFDMExec::RunIC()` calls `FGPropagate::InitializeDerivatives()`, which
>   copies `in.vPQRidot` and `in.vUVWidot` — and those are written only by
>   `LoadInputs(ePropagate)` at model index 0, while the accelerations are
>   recomputed at index 14. The multistep history is therefore seeded with the
>   previous pass's derivatives. On an F-16 at 20 000 ft, 600 frames at
>   throttle 0.9 and then throttle 0 with one `RunIC()`, the seeded `udot` is
>   21.86 ft/s² against the −7.73 ft/s² the vehicle holds when the call
>   returns. `FGFDMExec::SetHoldDown` already refreshes those two inputs by
>   hand, which looks like the same fix.
>
> What we would like to propose, once these two land, is that the caller say
> what it wants instead of the engine inferring it from `dt`. The distinction
> that matters for your two comments is between asking for the *steady
> operating point at the current controls*, which is what `RunIC()` and a trim
> trial want, and asking to *recompute outputs while preserving the engine's
> history*, which is what a restored or relocated aircraft wants. Those are
> different operations, and one condition on `dt` cannot express either. We
> have a design and will bring it as small slices rather than one large PR.

## Review disposition: the first review

Each numbered section of the [first review](01-review.md), what was done, and
the evidence. Where the [follow-up review](01-follow-up-review.md) later
corrected one of these answers, the second disposition below says so; the text
here is left as submitted.

### 1. Separate refresh from a steady operating point — **addressed, then corrected**

`decisions.md` now defines `opSteady` as a distinct operation: it assigns the
algebraic operating point the current controls imply and preserves every
integrated history, and it is available only to an engine that is running, not
cut off, not starved, not stalled and not seized. `opRefresh` preserves
history and never seeks. Eligible `RunIC()`, aircraft-trim trials and trim
finalization map to `opSteady`; recovery and relocation map to `opRefresh` or
`opRestore`; cold and warm starts stay explicit. The completion sequence is
written out on `FGFDMExec::EvaluateEngines` — propulsion, then the aircraft
force and moment totals and the accelerations at zero elapsed time, then
initialized derivatives — with the engine-only entry point documented as not
completing the vehicle. `FGLinearization` is bounded to an explicit
compatibility path on `opSteady`, with no claim that `opRefresh` reproduces
it, and the compatibility measurement is the four-throttle `B` column on both
builds in `follow-up/probes.md`.

### 2. Keep stage 3 behaviour-preserving — **addressed**

The `N2norm` recomputation and the clamp both leave stage 3. Removing the
staleness is settled and scheduled in stage 4 with a causal restart test;
clamping is explicitly unsettled, is not called defensive, and stage 4 answers
it against the below-idle, above-maximum, zero-denominator, injection-factor
and per-reader cases now written out. The "once each per operation" rule is
withdrawn and replaced by a measured per-phase call table that stage 3 must
reproduce, including the first-augmented-frame double evaluation and the
`<augmethod> 1` frame that evaluates neither. The table was measured with
evaluation counters, and the report says why a constant `copyto` sentinel
cannot supply it.

### 3. Capability, result and failure contracts — **addressed**

`Evaluate` returns an `Outcome` with a status and detail, rejects before
mutating, and no longer falls back to `Calculate()`; legacy wrappers keep the
existing engine-type paths. `RestoreState` takes the record. Multi-engine
requests are checked across every requested engine before any mutation and
then applied, with per-engine outcomes and an `all_completed` flag. Rollback
uses a private non-throwing undo snapshot, not the public record: it restores
by assignment, evaluates nothing, and so cannot re-run the function that
threw. The snapshot inventory now names the derived outputs, the thruster
state, the copied throttle and mixture inputs and the FCS mixture the legacy
start writes, and `copyto` targets and already-debited tanks are explicitly
outside the boundary.

### 4. State, fuel and IC lifecycle — **addressed, then corrected**

`MaxN1`, `MaxN2`, `BleedDemand` and the injection increments are captured as
overrides; the audit adds the inherited `FGEngine::FuelFreeze` and the
thruster's mutable acting location, with dispositions for the unused members.
The record format, required fields, unknown-field rejection, numeric
validation and the limits of the configuration digest are specified, and the
restore tests are described as planned. Fuel now distinguishes requested,
indicated and delivered flow, makes combustion an explicit engine-owned
signal rather than a flow-threshold inference, and resolves empty-and-frozen
by querying usable fuel independently of freeze — with the measured four-cell
matrix showing that today an engine starts and keeps running on empty frozen
tanks. The one-shot IC change is **withdrawn**: the review asked for the
caller that needs it and there is none, so legacy replay is unchanged and the
persistence switch is gone. The per-engine `set-running` change is now listed
among the behaviour changes. The missing injection function is guarded at the
call sites with a load-time warning, chosen over rejecting at load because
rejecting would stop the shipped B747 loading. The serialization discussion
now acknowledges the app's per-step capture and makes no performance claim.

### 5. Measurement interpretation — **addressed, with new measurements**

The instrumentation helper now adds side-effect-free live getters beside the
latched fields, and the report says which is which. Three new instrumented
builds were made for it; they reproduce the original instrumented builds on
all 5137 shared observables and their uninstrumented pairs on all 2137. The
copied-timestep claim is corrected: `GetSteadyState()` does restore
`in.TotalDeltaT`, and the 0.5 s was the last settling evaluation. Two live
readings that the latched fields could not show are added. The five wording
corrections are applied here, in `decisions.md`, in the maintainer draft and
in the tracker: the condition breaks the initialize-running path rather than
all starts; master updates N1/N2 and TSFC on the following frame while the
fuel flow seeks; two of six builds survive the injection crash; "indefinitely"
is scoped to the continued early return and the failed paired resume; and the
app claim is marked as native measurement plus source reading, not an SF50
WASM readback. The original records are unchanged, with `CORRECTIONS.md`
mapping each correction.

### 6. Reproducible evidence — **addressed**

`instrument_turbine.py` and `engine_probes.py` are now maintained tools under
`scripts/validation/jsbsim/turbine-initialization/` beside `runic_trace.py`,
and every focused probe in this report is one of their subcommands. The
lossless machine-readable trace for the three instrumented builds is retained
as `follow-up/trace-data.json`, the probe records as `follow-up/probes.json`,
and `follow-up/provenance.json` carries the commands, the build and fixture
digests and the equivalence checks. The three uninstrumented binaries were
reused unchanged and reproduce the first run exactly, so moving the tools did
not change what any earlier binary measured.

## Review disposition: the follow-up review

The five contract groups and three reporting corrections in the
[follow-up review](01-follow-up-review.md), what each one changed, and where.
Three probes were added because source reading alone could state but not
exhibit the fact at issue; nothing else was rerun and nothing was rebuilt. The
records are in
[`follow-up-2/`](../../../validation/evidence/jsbsim/turbine-initialization/01-characterization/follow-up-2/),
on the two binaries whose hashes the earlier provenance already carries.

### 1. State exactly what each operation changes — **closed**

The blanket "leaves every integrated history alone" is gone.
[decisions.md §1](../decisions.md) now carries a **per-field operation table**:
every member, what `Run()` does with it today, what `Trim()` does with it
today, and what each of the five operations does. Two rules decide each row —
a field is assigned when the running phase determines it from the current
controls, directly or as the fixed point of its own rate limit; it is preserved
when the running phase's target is a constant unrelated to the controls, or
when it records consumption.

That resolves the thermal contradiction in the table rather than beside it.
EGT is not thermal history in the running phase: `Run()` assigns
`in.TAT_c + 363.1 + N2norm * 357.1` every frame, and the rate limit on EGT
exists only in `Off()`, `SpinUp()` and `Start()`, which cannot be steady.
`OilTemp_degK` is the one integrated thermal quantity and it seeks a constant
366.0 K, so a steady point at these controls does not determine it and it is
preserved. Section 5 no longer says "preserve thermal history" as a whole.

The count of newly assigned fields is corrected from two to four: today's
`Trim()` writes `N1`, `N2`, `N2norm`, `FuelFlow_pph` and `correctedTSFC`, and
only when `Running`, so EGT and oil pressure are new alongside EPR and the
nozzle position. The nozzle is called out as the only one of the four that is
rate-limited in `Run()`, with its 1.25 s of lag stated.

`opInitRunning` now **preserves** injection rather than resetting it; scenario
reset is expressed separately as `opInitCold` and
`ResetToInitialConditions()`. Measured while settling this: today's scenario
reset empties `InjWaterNorm`, zeroes the configured injection increments and
leaves `InjectionTimer` running — `follow-up-2` §2 — so `opInitCold` defines
each field rather than inheriting the reset.

`opRestore` is **removed from the enum**, which is what made an argumentless
restore well-formed. Restore is `RestoreState(record)` and
`RestoreEngineState(engine, record)` only.

### 2. Mixed-engine eligibility and failure results — **closed**

Eligibility is decided by the caller that builds the plan, not inside the
operation, so §1 and §3 no longer disagree. `FGPropulsion::Evaluate` takes an
`EnginePlan` of per-engine requests; the legacy `RunIC()` and trim adapter puts
each eligible engine on steady and each ineligible one on refresh, submits one
plan and completes the vehicle once. A strict uniform steady request is checked
across every selected engine first and rejected whole if any is ineligible. No
engine is ever mutated under a result that reads as a rejection.

`EvaluateEngines` returns the structured `PropulsionOutcome`, not a `bool`, so
the SDK gets what it was promised. Statuses are per engine and never default to
completed: `stNotSelected` is the initial value, and `stNotAttempted`,
`stRolledBack`, `stNotSupported`, `stNotEligible`, `stRejected` and `stFailed`
are distinct.

The partial-commit policy is withdrawn in favour of **all-or-none** for every
zero-time public request, which is the coherent boundary the review asked for:
snapshots for every selected engine and for the vehicle outputs are taken
before anything is mutated, and any failure rolls all of them back. The
vehicle-output snapshot is named field by field, and the `not_undone` list
carries what is outside the boundary. Both acceptance cases — two engines with
the second failing, and a completion failure — are written out in
[decisions.md §3](../decisions.md).

### 3. The executive completion sequence — **closed, with one probe**

Starting at `LoadInputs(ePropulsion)` cannot give a relocation or new-command
caller current inputs, because that call copies the FCS *outputs* and the
atmosphere and auxiliary *outputs*. The sequence now takes an explicit
preparation argument: `piEnvironment` re-runs the inertial, atmosphere and
auxiliary models, and `piControls` additionally runs the flight control system
and is **documented as not history-preserving** — under trim status
`FGActuator::Run` sets `initialized = 0`, `FGKinemat` jumps its output to its
input, and `FGFCSChannel` runs every channel at rate 1 — so it is offered to
initialization and the legacy adapter and refused to refresh. Winds are
excluded, because `FGWinds` advances a turbulence state.

The propagation-input refresh is added: `LoadInputs(ePropagate)` after the
accelerations are recomputed and before `InitializeDerivatives()`. The probe
shows why it matters. On master, an F-16 at 20 000 ft and 300 kt, 600 frames at
throttle 0.9, then throttle 0.0 and one `RunIC()`: the value seeded into all
five history slots is `udot` 21.858659 ft/s², while the vehicle holds
−7.728663 ft/s² when the call returns — a gap of 29.587322, with 19.932229 in
`wdot` and 0.149467 rad/s² in `qdot`. A second `RunIC()` with nothing changed
lands within 0.03 ft/s². `FGFDMExec::SetHoldDown` already refreshes the same
two inputs by hand.

Reseeding is now an argument rather than a consequence: `RunIC()` and the
initialization operations reseed, a directly requested steady or refresh does
not, because an operation that promises to preserve history must not discard
the integrator's past.

`opAdvance` is distinguished from the public zero-time scope by rejecting it
there: a sequence that always suspends integration cannot advance.

Completion is narrowed to the aircraft totals and the accelerations, the only
two models that read engine state. **No configured function runs during
completion**, which removes the review's aerodynamic-function case by
construction rather than promising to undo it. All four acceptance cases —
changed throttle command, changed environment, immediate derivatives, and a
function failure — are in [decisions.md §1](../decisions.md).

### 4. The recovery snapshot — **closed, with one probe**

The claim that the app captures engine state only for recovery is corrected:
`fixedStepLoop.ts:80` takes `captureSimulation(sdk)` immediately before
`sdk.run()` and restores from it when the step is rejected, so it already takes
a recovery snapshot on every fixed step. The engine checkpoint is therefore
paired with that same pre-step snapshot, taken in the same statement, and the
checkpoint is **not dropped to avoid allocating**: the native checkpoint is an
engine-owned struct copy behind a handle and serializes nothing, while the
serialized record remains for persistence and cross-instance use. Both carry
the same member list. What stage 7 captures and when is stated.

The restore rules are finished. An **absent override means the configured
value**, which restore assigns explicitly — and the engine has to keep the
loaded value beside the live one to make that possible, because today it does
not: the probe shows `MaxN1`, `MaxN2`, the bleed factor and the thruster
orientation surviving a scenario reset while the injection increments, the
remaining water, the acting location and the reverser angle are zeroed.
Engine-level `FuelFreeze` is reconciled by **not capturing it**: it has no
reader anywhere in the tree, so it is reported as a dead member, and the
divergence after a reset — every engine's copy cleared while the manager's flag
stays set — is reported with it. Runtime thruster orientation and acting
location are classified as captured overrides, conditional on the properties
existing, since a `<pointing>` nozzle exposes no angles. Cold defaults are the
actual values field by field, including the four `ResetToIC` does not write.
Validation bounds are per field with a reason each, and **spools carry no upper
bound**, because lowering a writable maximum below the attained spool is legal
and produces a legal capture above it.

### 5. Fuel and legacy IC precedence — **closed, with one probe**

"Stale starvation is not stale" is withdrawn. `ConsumeFuel()` returns on fuel
freeze and on trim status before it walks the tanks, `SetStarved()` sits after
that walk, and it runs after the engine has already been calculated. Every
eligibility and combustion decision now queries usable fuel at the point of
decision. Measured: with freeze on, refilling an F-16's tanks to 2000 lb leaves
the restart dead at N1 0.42 and no thrust; one unfrozen frame before the same
restart gives N1 100.0 and 19576.3 lbf.

Whether a residual inventory is modelled is answered: **no**. There is no line
or accumulator volume, and every pound of the decaying flow after a cutoff is
drawn from the tanks. So `Combusting` requires usable supply as well as a
positive requested flow and a burning phase, and the flag is specified for
cutoff residuals with supply, empty tanks, freeze, start, stall and seizure,
with a causal test named for each. Freeze and starvation are kept apart: freeze
suppresses accounting while supply can remain, starvation is the absence of
supply. Model policy is stated as policy, separately from what the tank-debit
code proves.

The IC qualification is added. A commanded cutoff survives `RunIC()` **only
where the IC carries no `<running>` request for that engine**; where it does,
the legacy adapter reinitializes the engine and the cutoff does not survive,
unchanged. Both cases are recorded in [decisions.md §4.4](../decisions.md) and
in the contract's caller mapping, and the no-IC cutoff regression stands.

### The three reporting corrections — **closed**

- **The linearization column.** "Every other entry is zero" was false. The `Q`
  row is 0.0024612639773144425, 0.004922527954633222 and 0.0073837919319491106
  at throttle 0.3, 0.6 and 0.9 — a physical pitching response to a thrust line
  offset from the centre of gravity — and the `Beta` row is roundoff at 1e−17.
  The whole column is now reproduced in the decisions and in `follow-up-2`
  §4, re-read from the retained `follow-up/probes.json` with no new run, and
  stage 5 is told to compare the whole column and distinguish the two.
- **Cross-instance restore.** The contract said it "is tested both ways"; both
  tests are planned, not written — stage 4 for the native round trip, stage 6
  for the cross-instance case — and the contract and decisions now say so.
- **The stage-3 file table.** It now names
  `tests/unit_tests/FGTurbineTest.h` and its `UNIT_TESTS` entry in
  `tests/unit_tests/CMakeLists.txt` alongside `FGTurbine.cpp/.h`, which is what
  the task brief already required.

### What this round did not do

No production fix, no build, no branch change, no push, no upstream post, and
no rerun of the trace or of any earlier probe. The JSBSim checkout stayed clean
on `candidate/pr1508-off-engine-fuel` at `482da811`. Two new engine defects
were measured along the way — the frozen refill that starvation survives, and
the scenario reset that destroys injection configuration — and both are in the
unposted maintainer draft above with the derivative-seeding finding.

## The commit set, identified but not committed

Nothing was committed. Both reviews ask for the exact file set to be identified
first, the second one adding that local links must be checked against the
**proposed staged tree** rather than the working tree, and that unrelated work
from the shared 0sfs tree must never be staged. The set below was derived by
following every markdown link out of this stage's trees, then following the
links out of the untracked files that came back, and then checking that the
resulting tree resolves.

**This stage's files**, all untracked: `docs/turbine-initialization/` in full,
`scripts/validation/jsbsim/turbine-initialization/` in full, and
`validation/evidence/jsbsim/turbine-initialization/` in full — 43 files.

**Prerequisites the stage-1 documents link to directly**, all untracked:

- `docs/pr1505-off-engine-regression-prompt.md`
- `docs/pr1508/reply-draft.md`
- `docs/validation/pr1505-off-engine-regression.md`
- `scripts/validation/jsbsim/engine-off-trim/trim_fuel_compare.py`
- `validation/evidence/jsbsim/engine-off-trim/pr1505-candidate-2026-09-19/` in full
- `validation/evidence/jsbsim/engine-off-trim/pr1508-candidate-2026-09-19/` in full

**Prerequisites of those prerequisites**, which the earlier list missed and the
review named:

- `scripts/validation/jsbsim/engine-off-trim/trim_thrust_compare.py`, linked
  from `docs/validation/pr1505-off-engine-regression.md` and from both evidence
  READMEs. Following the second hop turns up nothing else outside the two
  candidate trees, which are already staged whole.

**Two tracked files carry changes this work needs**:

- `docs/proposals/jsbsim-turbine-evaluation.md`, modified;
- `docs/open-upstream-prs.md`, which **needs hunk selection, not
  `git add <file>`**. Its diff also carries earlier sessions' edits. The
  regions belonging to this work are the upstream-`master` refresh note in the
  header paragraph, the #1505 and #1508 rows of the state table, and the
  "#1505: steady-state evaluation versus aircraft trim" subsection with its two
  checklist items.

**Why the hunk selection matters, checked rather than asserted.** Staging that
file whole would commit four links into trees that are not in this set —
`pr1502/plan.md`, `pr1502/replies.md`,
`validation/evidence/jsbsim/wheel-spin-review/final/review.md` and
`validation/evidence/jsbsim/wheel-spin-review/final/publication-actions.json`.
None of those four links exists in `HEAD`; all four come from another session's
uncommitted hunks in the same file. With only this work's hunks staged, the
committed tree has no broken links: every markdown link from the 95 files above
resolves either inside the set or to a file already committed and unmodified.

One reference is prose rather than a link and so breaks nothing:
`docs/pr1505-off-engine-regression-prompt.md` mentions `docs/validation/layout.md`,
which is also uncommitted.

Such a commit records documentation, tools and evidence. It is not a JSBSim
merge, not a publication, and not a statement that stage 1 passed or that these
decisions are an approved implementation specification.

## Limits

- **One platform, one toolchain.** macOS arm64, AppleClang 21.0.0. Nothing ran
  in upstream CI.
- **Python API only.** Every measurement goes through the real native engine,
  but no CxxTest case exists for any of it. Native coverage starts in stage 3.
- **Turbines only.** Piston, turboprop, rocket and electric engines were read,
  not measured. The capability fallback in the decisions exists so they keep
  today's behaviour.
- **No app measurement.** The app callers were read, and the recovery sequence
  was reproduced on a stock 737 fixture, not on the SF50 through real WASM.
  That is stage 7's work; the installed package still contains both defects.
- **The off-engine thrust compatibility cost is unmeasured.** Removing it is
  scheduled for stage 5 with the 61 shipped scripts, and this stage did not
  run them.
- **No test was added.** This stage is characterization; the fixtures it names
  become tests in stages 3 to 6.
- **No production fix was implemented** during the review follow-up, and no
  unrelated suite was rerun. Only the checks the corrections depend on were
  re-measured, on binaries whose identities and equivalence are recorded.
