# Turbine initialization: proposed implementation decisions

**Characterization and evidence accepted; the contract corrections the
follow-up review asked for are applied here.** The
[follow-up review](reports/01-follow-up-review.md) named five groups — what
each operation changes, mixed-engine eligibility and failure results, the
executive completion sequence, the recovery snapshot, and fuel and legacy IC
precedence. Each is closed below with exact rules and acceptance cases. These
remain proposals, not an approved implementation specification; **stage 3
remains pending** until the coordinator accepts them. Nothing here is
implemented; no production source, branch, package or GitHub state changed in
this stage or in either follow-up.

2026-09-19, revised 2026-09-20. Stage 1 of the
[implementation plan](plan.md). It resolves the choices the plan left open,
fills in the blanks the [contract](contract.md) left for this stage, and amends
the contract where the evidence required it.

Evidence: the [stage report](reports/01-characterization.md), the original
records in
[`01-characterization/`](../../validation/evidence/jsbsim/turbine-initialization/01-characterization/),
what the reviews corrected in
[`CORRECTIONS.md`](../../validation/evidence/jsbsim/turbine-initialization/01-characterization/CORRECTIONS.md),
the first follow-up's measurements in
[`follow-up/`](../../validation/evidence/jsbsim/turbine-initialization/01-characterization/follow-up/),
and the three focused probes this revision added in
[`follow-up-2/`](../../validation/evidence/jsbsim/turbine-initialization/01-characterization/follow-up-2/).

## Summary of what the measurements force

1. **A steady operating point and a history-preserving refresh are different
   operations.** `RunIC()` on a running engine must deliver the steady thrust
   at the current throttle immediately — that is the path Sean described and
   the one 0sfs depends on. Recovery after a fault must deliver the engine's
   own history unchanged. One operation cannot do both, which is what the
   review caught in the first submission.
2. **bcoconni's one-line condition breaks the initialize-running path.** It
   does not stop turbine starts: with `if (FDMExec->GetTrimStatus())` in place
   of `if (in.TotalDeltaT == 0)`, a starter-and-cutoff start still reaches
   `set-running == 1` in both the cold-start and the restart-after-shutdown
   arms of the retained trace. What breaks is `propulsion/set-running`, which
   leaves the engine reading 0: `FGPropulsion::GetSteadyState()` sets the trim
   status itself, so every one of its settling iterations selects `tpTrim` and
   `Run()` never executes.
3. **The published fuel-flow properties are not the engine's fuel flow.**
   `fuel-flow-rate-pps` and `-gph` read `FuelFlowRate`, written only by
   `CalcFuelNeed()`, whose only caller `FGPropulsion::ConsumeFuel()` returns
   early on fuel freeze, on trim status and on starvation. The published value
   then holds for as long as that early return continues; refilling the tanks
   restores it on the next frame.
4. **`SuspendIntegration()` keeps one saved timestep, not a stack.** Suspend,
   call `RunIC()`, resume: the executive is left at `dT = 0` with
   `IntegrationSuspended()` still true. An explicit `Setdt` recovers it, so
   the condition lasts until a caller intervenes.
5. **Latched diagnostics are not live state.** The stage-1 counters record
   what an evaluation saw. `FGPropulsion::GetSteadyState()` evaluates the
   engine at 0.5 s and then restores `in.TotalDeltaT`; a live read after it
   returns gives the real timestep. The follow-up builds read both.
6. **A latched starvation flag is stale for as long as `ConsumeFuel()` keeps
   returning early.** It returns on fuel freeze and on trim status *before* it
   walks the tanks, and `SetStarved()` sits after that walk. Refilling a tank
   while frozen therefore leaves the flag set and a restart fails on 2000 lb
   of usable fuel until one unfrozen frame runs. Eligibility and combustion
   must query the tanks, not the flag.
7. **`RunIC()` seeds the integrator's derivative history one model pass
   late.** `FGPropagate::in.vPQRidot`/`in.vUVWidot` are written only by
   `LoadInputs(ePropagate)`, which runs at model index 0, while the
   accelerations are recomputed at index 14 — so `InitializeDerivatives()`
   assigns the previous pass's value. Measured gap on an ordinary throttle
   change: 29.587322 ft/s² in `udot`.
8. **A scenario reset keeps some runtime overrides and destroys some
   configuration.** `ResetToInitialConditions()` keeps `MaxN1`, `MaxN2`,
   `BleedDemand` and the thruster orientation, and zeroes the configured
   injection increments, the remaining water, the thruster acting location and
   the reverser angle, while never touching `InjectionTimer`, `EPR` or
   `OilPressure_psi`. A cold operation and a restore both have to define each
   field rather than trusting the reset.

## 1. Operations

### The operation set

| Operation | Elapsed time | Offered by the public zero-time wrapper | Eligibility | Intended callers |
| --- | --- | --- | --- | --- |
| `opAdvance` | the executive's `dt` | **no** | any phase | `FGPropulsion::Run()` inside an ordinary frame, which owns the timestep and the integration |
| `opSteady` | none | yes | `Running`, not `Cutoff`, `Starved`, `Stalled` or `Seized` | `RunIC()` on an eligible engine, aircraft-trim trials and finalization, `FGLinearization` |
| `opRefresh` | none | yes | any phase | restored state, a location change, an ineligible engine in a mixed request, a suspended caller that wants "recompute outputs, change nothing" |
| `opInitCold` | none | yes | any phase | a scenario reset of one engine |
| `opInitRunning` | none | yes | usable fuel present now (4.3) | a scenario beginning with its engines running |

Two corrections to the first submission are in that table.

**`opAdvance` is not a public zero-time operation.** It stays in the enum
because `FGEngine::Evaluate` is the single dispatch `Calculate()` uses too, but
the public wrapper rejects it: that wrapper's scope guard suspends integration
and sets the copied propulsion timestep the operation requires, and an advance
cannot be performed under a sequence that always suspends. A caller that wants
time to pass runs a frame.

**Restore is not in the enum.** The first submission listed `opRestore`, which
made `Evaluate(opRestore)` — a restore with no record — a well-formed call.
Removed. Restore is `RestoreState(const std::string&)` on the engine and
`RestoreEngineState(unsigned, const std::string&)` on the manager, nothing
else; `capState` says whether a model implements them. No enumerator can now be
requested without the argument it needs.

### What each operation does to each field

The first submission said `opSteady` "leaves every integrated history alone"
and then assigned the spools, the fuel flow, EGT and the nozzle position — all
of which are rate-limited somewhere. The blanket claim is withdrawn and
replaced by this table. "Assign" means the value is written outright;
"preserve" means it is not written at all; "recompute" means it is derived
from state the operation did not change.

| Field | `Run()` today | `Trim()` today | `opSteady` | `opRefresh` | `opInitCold` | `opInitRunning` |
| --- | --- | --- | --- | --- | --- | --- |
| `N1`, `N2` | seek the commanded target | assign, only when `Running` | assign the target the controls imply | preserve | 0 | assign at the requested controls |
| `N2norm` | assign from `N2` | assign, only when `Running` | assign from the assigned `N2` | recompute from the preserved `N2` (stage 4) | 0 | assign |
| `N1_factor`, `N2_factor` | recompute, injection included | not written | recompute | recompute | from configuration | recompute |
| `FGThruster::Thrust` | compute | compute | compute | compute from the preserved spools | 0 | compute |
| `FuelFlow_pph` (requested) | seeks the target | assign, only when `Running` | assign | preserve | 0 | assign |
| `FuelFlowRate` (indicated, published) | written only inside `ConsumeFuel()` | not written — `ConsumeFuel()` returns early under trim status | **publish from this evaluation** (4.3) | publish from the preserved flow | 0 | publish |
| `correctedTSFC` | assign on a dry frame | assign, only when `Running` | assign | recompute at the preserved state | recompute | assign |
| `EGT_degC` | **assign** `TAT + 363.1 + N2norm·357.1` | not written | assign, same formula | preserve | `TAT` | assign |
| `OilPressure_psi` | **assign** `N2 · 0.62` | not written | assign | recompute from the preserved `N2` | 0.0 — today `ResetToIC` does not write it | assign |
| `EPR` | **assign** `1 + thrust/MilThrust` on a dry frame | not written | assign | recompute | 1.0 — today `ResetToIC` does not write it | assign |
| `NozzlePosition` | **seeks** `1 − N2norm` at 0.8/s | not written | assign `1 − N2norm` | preserve | 1.0 | assign |
| `OilTemp_degK` | **seeks** a constant 366.0 K | not written | **preserve** | preserve | `TAT + 273` | 366.0, section 5 |
| `InjectionTimer` | advances while injecting | not written | preserve | preserve | 0.0 — today never reset | **preserve** |
| `InjWaterNorm` | consumed while injecting | not written | preserve; no credit at 0 | preserve | 1.0 where `<injection-time>` is configured, else 0.0 — today 0.0 always | **preserve** |
| `InjN1increment`, `InjN2increment` | read | read | unchanged | unchanged | **from configuration** — today zeroed | unchanged |
| `FuelUsedLbs`, `FuelExpended`, tank contents | debited by `ConsumeFuel()` | not debited | not debited | not debited | 0, tanks to the IC | not debited |
| `Cutoff`, `Starter`, `Cranking`, `Starved`, `Stalled`, `Seized` | as the phase dictates | not written | preserve — an eligible engine has none of them set | preserve; a legitimate instantaneous transition may fire | `Cutoff` true, the rest false | set to a running engine's values |
| `Running`, `phase` | as the phase dictates | not written | preserve (`Running`, `tpRun`) | preserve | false, `tpOff` | true, `tpRun` |
| `Augmentation` | latched from the throttle and `N2` | latched from the throttle and the steady `N2` | latched from the assigned state | preserve | false | latch from the requested controls |
| `Injection` | cleared when the water runs out | not written | preserve | preserve | false | preserve |
| `Reversed`, `FGThruster::ReverserAngle` | external command | not written | preserve | preserve | false, 0 | preserve |
| `MaxN1`, `MaxN2`, `BleedDemand`, thruster acting location and orientation | not written | not written | unchanged | unchanged | **from configuration** — today partly kept and partly zeroed | unchanged |
| simulation time, mass | advance | unchanged | unchanged | unchanged | the IC | unchanged |

**The rule that decides a row.** `opSteady` assigns a field when the running
phase computes it from the current controls and environment — either directly,
as `Run()` does for EGT, oil pressure and EPR, or as the fixed point of a rate
limit, as `Run()` does for the spools, the fuel flow and the nozzle. It
preserves a field when the running phase's target does not depend on the
controls, or when the field records consumption.

**That rule is what resolves the thermal question**, which section 5 previously
answered with a blanket "preserve thermal history" that contradicted the EGT
assignment. EGT is not thermal history in the running phase: `Run()` assigns it
every frame as an algebraic function of `N2norm` and TAT, and its rate limit
exists only in `Off()`, `SpinUp()` and `Start()` — phases that are not eligible
for a steady operating point at all. `OilTemp_degK` is the only genuine thermal
history a running turbine carries, and it seeks a constant 366.0 K that says
nothing about the controls, so "the steady point at these controls" does not
determine it and `opSteady` preserves it.

**Four fields are newly assigned, not two.** The first submission said only EPR
and the nozzle position were new. Today's `Trim()` writes `N1`, `N2`, `N2norm`,
`FuelFlow_pph` and `correctedTSFC`, and only when `Running`; it does not write
EGT or oil pressure either. So `opSteady` newly assigns **EGT, oil pressure,
EPR and the nozzle position**. The nozzle is the only one of the four that is
rate-limited in `Run()`, so it is the only one whose assignment can differ
visibly from a frame-by-frame run — up to about 1.25 s of lag at the configured
0.8 per second. All four are behaviour changes for stage 4/5, each with its own
causal test. None is in stage 3.

**No operation on an existing engine replenishes injection.** `opInitRunning`
preserves the timer and the remaining water, which the first submission's table
wrongly showed as "reset" — a restart is not a scenario reset, and contract
item 8 permits replenishment only on an explicit one. The explicit scenario
resets are `opInitCold` for one engine and `FGFDMExec::ResetToInitialConditions()`
for the aircraft; nothing else touches those two fields. Today's reset is
itself wrong here and `opInitCold` corrects it: measured in
[`follow-up-2/probes.md`](../../validation/evidence/jsbsim/turbine-initialization/01-characterization/follow-up-2/probes.md)
§2, `ResetToInitialConditions()` sets `InjWaterNorm` to 0 rather than to the
configured 1.0, zeroes the configured `InjN1increment`/`InjN2increment`, and
leaves `InjectionTimer` running from the previous flight.

### `opSteady` eligibility

An engine is eligible when it is `Running`, not `Cutoff`, not `Starved`, not
`Stalled` and not `Seized`, and — for the fuel part of that judgement — when
usable fuel is present *now*, queried from the tanks rather than read from the
latched `Starved` flag (4.3). This is what removes off-engine trim thrust: an
engine that is off contributes no powered thrust to a trim solution because it
is not eligible for a steady operating point, not because a special case was
added.

Nothing is consumed: no fuel is debited, no mass changes, no injection water is
used, no simulation time passes. Aircraft trim already relies on this and it is
measured to hold today.

### Mixed requests: where eligibility is decided

The first submission said in one place that an ineligible engine is given
refresh semantics and reported `NotEligible`, and in another that any failed
eligibility check rejects the whole request without changing any engine. A
running-and-off twin cannot satisfy both. The contradiction came from deciding
eligibility *inside* the operation. It is decided outside it, by the caller
that builds the plan:

```c++
// FGPropulsion.h
struct EngineRequest { unsigned engine; FGEngine::Operation op; };
struct EnginePlan {
  std::vector<EngineRequest> requests;
  static EnginePlan Uniform(FGEngine::Operation op, int engine = -1);
};
```

- **The legacy `RunIC()` and trim adapter routes explicitly.** It walks the
  engines, puts each eligible one on `opSteady` and each ineligible one on
  `opRefresh`, submits one plan, and then completes the combined vehicle once.
  Every engine's outcome says which operation it actually received, so nothing
  is ever mutated under a status that reads like a rejection.
- **A strict explicit request is all-or-none.** `EnginePlan::Uniform(opSteady)`
  is checked against every selected engine before anything is mutated and is
  rejected whole if any of them is ineligible: the ineligible engines report
  `stNotEligible`, the rest report `stNotAttempted`, and no engine changed.

So the routing is a property of the plan the adapter builds and the all-or-none
rule is a property of a single submitted plan. Section 3 carries the result and
failure contract; the two sections describe one mechanism.

### Completion before the public call returns

An engine-level operation does not by itself finish the vehicle. The public
entry point is on the executive:

```c++
// FGFDMExec.h
enum PrepareInputs { piNone, piEnvironment, piControls };
enum SeedDerivatives { sdKeep, sdReseed };
FGPropulsion::PropulsionOutcome
EvaluateEngines(const FGPropulsion::EnginePlan& plan,
                PrepareInputs prep = piNone,
                SeedDerivatives seed = sdKeep);
```

1. **Validate, before touching anything.** A plan naming an engine that does
   not exist, or requesting `opAdvance`, is rejected here.
2. **Enter the evaluation scope** — push the executive timestep on the
   suspension stack, set the copied propulsion timestep and the trim status the
   operations require (section 8).
3. **Prepare inputs, only if asked.** `LoadInputs(ePropulsion)` copies the FCS
   *outputs* and the atmosphere and auxiliary *outputs*; it evaluates neither a
   changed throttle command nor a changed position. Starting the sequence there
   therefore cannot by itself give the relocation and new-command callers
   current inputs, which is what the first submission implied.
   - `piEnvironment` re-runs `eInertial`, `eAtmosphere` and `eAuxiliary`, each
     after its own `LoadInputs`, so a caller that moved the aircraft gets the
     density, pressure and TAT of the new place. `eWinds` is deliberately
     excluded: `FGWinds` advances a turbulence state, so re-running it is not
     free; a caller that changed the wind runs a frame.
   - `piControls` additionally runs `eSystems` first, and is **documented as
     not history-preserving**. Under trim status `FGActuator::Run` sets
     `initialized = 0`, discarding the actuator's lag initialization;
     `FGKinemat` drives its output to its input in a single step; and
     `FGFCSChannel` runs every channel at rate 1 whatever its `<execrate>`
     says. That is exactly what `RunIC()` does today. `piControls` is therefore
     available to the initialization operations and to the legacy adapter only:
     `opRefresh` rejects it, because a recovery that promises to preserve
     history must not silently flatten the flight control system.
   - `piNone` is the default and uses the model outputs as they stand. It is
     what a caller uses after an ordinary frame, or after writing
     `fcs/throttle-pos-norm` — the property the engine actually reads — rather
     than the command.
4. `LoadInputs(ePropulsion)`, then `Propulsion->Evaluate(plan)`, which
   evaluates each engine, lets the thruster modify the thrust, and sums
   `vForces`/`vMoments`.
5. **Complete the vehicle, narrowly:** `LoadInputs(eAircraft)`,
   `Aircraft->Run(false)`, `LoadInputs(eAccelerations)`,
   `Accelerations->Run(false)`. Those two models only. Aerodynamics, ground
   reactions, external reactions and buoyant forces read no engine state, so
   re-running them would add configured-function evaluations and `copyto`
   writes for nothing. The consequence is worth stating plainly: **no
   configured function runs during completion**, which removes the review's
   "a function throws in an aerodynamic function during completion" case
   rather than promising to undo it.
6. **Refresh the propagation inputs, then seed — if the operation may.**
   `FGPropagate::InitializeDerivatives()` copies `in.vPQRidot` and
   `in.vUVWidot`, and those are written only by `LoadInputs(ePropagate)`, which
   `FGFDMExec::Run()` performs at model index 0 — before the frame's
   accelerations are recomputed at index 14. So today's `RunIC()` seeds the
   integrator's history with accelerations from one model pass earlier. The
   sequence therefore runs `LoadInputs(ePropagate)` *after* step 5 and only
   then `InitializeDerivatives()`. `FGFDMExec::SetHoldDown` already refreshes
   the same two inputs by hand for the same reason.
7. **Leave the scope**, restoring what it replaced, on every exit including an
   exception.

**Which operations may reseed.** `InitializeDerivatives()` assigns the current
derivative into all five slots of the multistep history, discarding the
integrator's past. That is right for a scenario start and wrong for an
operation that promised to preserve history, so it is an explicit argument
rather than a consequence of the operation:

| Caller | `seed` | Why |
| --- | --- | --- |
| `RunIC()`, any operation | `sdReseed` | unchanged from today, so no caller loses behaviour |
| `opInitCold`, `opInitRunning` requested directly | `sdReseed` | a new scenario has no past |
| `opSteady`, `opRefresh` requested directly | `sdKeep` | an operation inside a flight must not discard integration history |

Refreshing the inputs changes what `RunIC()` seeds, so it is a behaviour change
with a stage and a test. Measured on master in
[`follow-up-2/probes.md`](../../validation/evidence/jsbsim/turbine-initialization/01-characterization/follow-up-2/probes.md)
§1: an F-16 at 20 000 ft and 300 kt, 600 frames at throttle 0.9, throttle to
0.0, one `RunIC()` — the seeded `udot` is 21.858659 ft/s² while the vehicle
holds −7.728663 ft/s² when the call returns, a gap of 29.587322 ft/s². `wdot`
differs by 19.932229 and `qdot` by 0.149467 rad/s². A second `RunIC()` with
nothing changed in between lands within 0.03 ft/s², because by then the two
values describe the same engine state.

`FGPropulsion::Evaluate` stays available for a caller that wants only the
engines and finishes the vehicle itself — aircraft trim, which runs the whole
model chain anyway — and is documented as not completing the vehicle.

### Acceptance cases for the completion sequence

Stage 5 implements these; stage 1 only fixes what they must assert.

1. **A changed throttle command.** Write `fcs/throttle-cmd-norm` and nothing
   else, then `EvaluateEngines(Uniform(opSteady), piNone)`: the thrust does not
   change, because the FCS has not run and `in.ThrottlePos` still holds the old
   position. The same call with `piControls`: the thrust follows the new
   command. Both report `stCompleted`. The difference is the documented
   precondition, not an accident, and the test pins it.
2. **A changed altitude or environment.** Move the aircraft, then
   `EvaluateEngines(Uniform(opRefresh), piEnvironment)`: the engine sees the
   new density, pressure and TAT, asserted on `Propulsion->in` as well as on
   the thrust. With `piNone` it does not.
3. **Immediate derivatives.** The case measured above: after `RunIC()`, the
   seeded `vUVWidot` and `vPQRidot` must equal the accelerations the vehicle
   holds when the call returns, to the last bit.
4. **A function fails inside the operation.** A configured function throws
   during `Propulsion->Evaluate`: no engine is left mutated, the vehicle
   outputs are as they were, the scope is restored, and the outcome is
   `stFailed` naming the engine and listing the `copyto` targets already
   written (section 3). Because completion runs no configured function, there
   is no separate completion-function case; the residual completion failure is
   an exception from `FGAircraft` or `FGAccelerations`, which the same undo
   covers and which is tested with a throwing stub model if the executive can
   be constructed with one, and recorded as untested if it cannot.

### Caller routing

| Caller | Operation | Note |
| --- | --- | --- |
| `Run()` with elapsed time | `opAdvance` | unchanged, and not reachable through the public zero-time wrapper |
| `RunIC()`, engine eligible | `opSteady` | the steady readback callers value |
| `RunIC()`, engine off, cut off or faulted | `opRefresh` | no powered thrust, no restart; one plan carries both |
| `RunIC()` with a stored IC `<running>` request | `opInitRunning` | legacy adapter, unchanged (4.4) |
| `propulsion/set-running` | `opInitRunning` | legacy adapter keeps the full-throttle convention (4.4) |
| Aircraft trim trials | `opSteady` per trial | trim keeps `SetTrimStatus(true)`; other models read it |
| Aircraft trim finalization | `opSteady` then executive completion | the accepted solution and the committed state come from one path |
| `FGLinearization` | `opSteady` | explicit compatibility path, below |
| `FGStateSpace::run()` settle loop | `opInitRunning` then `opSteady` | it asks for equilibrium explicitly today |
| Contact recovery, relocation | `RestoreState` or `opRefresh` | history preserved; `piEnvironment` for a move |
| A new scenario | `opInitCold` or `opInitRunning` | explicit |

### `FGLinearization`: an explicit compatibility path

`FGLinearization` suspends integration around `FGStateSpace::linearize`, and
every perturbation goes through `FGStateSpace::run()`, which calls
`FGEngine::InitRunning()` and then settles. The turbine is therefore on its
zero-dt steady path throughout, and the throttle column of `B` is the steady
thrust response. A turbine contributes no state to `x` at all: `FGStateSpace`
adds spool states only for propeller thrusters.

**Decision: preserve that behaviour by routing `FGLinearization` to
`opSteady`.** `opRefresh` would not reproduce it and this document does not
claim otherwise. A dynamic-engine Jacobian — adding spool states to `x` and
linearizing the spool dynamics — is a separate proposal with its own modelling
argument, and stage 5 does not attempt it.

The compatibility measurement, recorded on both master and the repaired
candidate at four throttle settings on the 737. The first submission said every
entry of the column except `Vt` was zero; that was wrong, and the whole column
is reproduced from the retained record in
[`follow-up-2/probes.md`](../../validation/evidence/jsbsim/turbine-initialization/01-characterization/follow-up-2/probes.md)
§4:

| Throttle | N1 / N2 after | Thrust lbf | `B` row for `Vt` | `B` row for `Q` | `B` row for `Beta` |
| --- | --- | --- | --- | --- | --- |
| 0.0 | 30.00 / 60.00 | 379.25 | 0 | 0 | 0 |
| 0.3 | 51.00 / 72.00 | 1070.35 | 2.7708039266919706 | 0.0024612639773144425 | −1.13e−17 |
| 0.6 | 72.00 / 84.00 | 3143.67 | 5.541607853384126 | 0.004922527954633222 | 7.91e−17 |
| 0.9 | 93.00 / 96.00 | 6599.21 | 8.312411780080167 | 0.0073837919319491106 | 7.91e−17 |

Every other row is exactly zero on both builds. `Vt` and `Q` are both physical:
`Q` is the pitching response to a thrust line offset from the centre of
gravity, three orders of magnitude below `Vt` and linear in throttle like it.
`Beta` is roundoff. Stage 5 compares the **whole column** and must tell the two
apart — a tolerance that hides the `Beta` roundoff must not also hide the `Q`
response. The zero at zero throttle is arithmetic, not a missing coupling: the
steady thrust term is proportional to the square of the normalized spool, whose
derivative at idle is zero.

## 2. What stage 3 may and may not do

Stage 3 extracts shared arithmetic and **changes no behaviour**. The first
submission put two semantic changes there; both move out.

| Change | Was | Now |
| --- | --- | --- |
| Recompute `N2norm` wherever N2 changes | stage 3 | stage 4, its own commit and causal test |
| Clamp `N2norm` to a range | stage 3, called "defensive" | stage 4, only if section 6's investigation justifies it, and then as a stated behaviour change |
| "Evaluate each configured function once per operation" | stage 3 | withdrawn; replaced by the measured call table below, which stage 3 reproduces exactly |
| Assign EGT, oil pressure, EPR and the nozzle position in the steady path | implied by section 1 | stage 4/5, each with its own test |

The last row grew: the first submission counted two newly assigned fields and
section 1 now counts four, because today's `Trim()` does not write EGT or oil
pressure either.

**The clamp is excluded from the implementation baseline**, as the review
allows. Section 6's decision B is investigated as a separate measured change
and does not block an equivalent extraction; it must not arrive quietly
alongside the stale-normalization repair, so the two are separate commits with
separate tests.

Stage 3 adds its own CxxTest suite and registers it, which is part of stage 3's
file set and not an afterthought: the per-stage table below names
`tests/unit_tests/FGTurbineTest.h` and the `UNIT_TESTS` entry in
`tests/unit_tests/CMakeLists.txt` beside `FGTurbine.cpp/.h`.

### The configured-function call table stage 3 must preserve

Counter deltas across one call or one frame, measured with evaluation counters
wrapping the engine's own call sites. A constant `copyto` sentinel shows that
a function ran at least once; it cannot count, which is why stage 2's sentinel
measurement cannot be reused for this.

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

Three rows are not obvious, and are exactly what a careless deduplication
would break:

- the **first augmented frame evaluates both** parameters, because
  `Augmentation` is still false from the previous frame when
  `if (!Augmentation)` is tested; later augmented frames evaluate only ATSFC;
- with `<augmethod> 1` a running frame can evaluate **neither**, when
  `Augmentation` is latched true from the previous frame and the throttle has
  since fallen below the 99 % threshold;
- `propulsion/set-running` evaluates the engine 124 times, because
  `GetSteadyState()` time-marches it.

Stage 3's tests assert these counts with a counter or another demonstrably
count-sensitive fixture, and preserve the order: pre-functions are sampled
first and cached, then the copied controls are read, then the phase is
selected, then the operating-point parameters are evaluated against the
selected state.

## 3. Capability, result and failure contracts

### The C++ surface

```c++
// FGEngine.h
class FGEngine {
public:
  enum Operation { opAdvance, opRefresh, opSteady, opInitCold, opInitRunning };
  enum Capability { capAdvance = 1, capRefresh = 2, capSteady = 4,
                    capInitCold = 8, capInitRunning = 16, capState = 32 };
  enum Status { stCompleted,      // it ran and its result stands
                stRolledBack,     // it ran and was undone because the plan failed
                stNotSelected,    // it was not in the plan
                stNotAttempted,   // it was in the plan and never reached
                stNotSupported,   // this engine model does not implement it
                stNotEligible,    // this engine's state does not permit it
                stRejected,       // the request itself was malformed
                stFailed };       // it threw while being applied

  struct Outcome {
    Status status = stNotSelected;       // never defaults to completed
    std::string detail;                  // empty only when stCompleted
    explicit operator bool() const { return status == stCompleted; }
  };

  /// What this engine model implements. The base class claims opAdvance only,
  /// so piston, turboprop, rocket and electric engines are unaffected until
  /// each is converted.
  virtual unsigned Capabilities(void) const { return capAdvance; }

  /// Perform one operation. The base class advances and rejects everything
  /// else, naming the engine type in `detail`. It does not fall back to
  /// Calculate(): an explicit request for an operation the model does not
  /// implement is an error, not a different operation.
  virtual Outcome Evaluate(Operation op);

  virtual Outcome CaptureState(std::string& record) const;
  virtual Outcome RestoreState(const std::string& record);
};
```

`Evaluate` rejects **before mutating anything**. The first submission's
`Calculate()` fallback is withdrawn: it would have silently performed an
advance when a caller asked for a cold reset, and it could not have reported
which engines were handled that way.

`stNotSelected` is the default so that an engine nobody asked about cannot
report success, and `stNotAttempted` distinguishes "we never got to it" from
"it was not in the request" — both of which the first submission collapsed into
a completed status.

Legacy entry points are separate and keep today's behaviour for every engine
type: `RunIC()`'s IC-running loop and `propulsion/set-running` continue to call
`FGEngine::InitRunning()`, which every engine type already implements. Only the
new explicit API rejects.

### Multi-engine semantics

```c++
// FGPropulsion.h
struct PropulsionOutcome {
  bool all_completed = false;
  bool vehicle_completed = false;              // step 5 of the completion sequence
  std::vector<FGEngine::Outcome> per_engine;   // one entry per engine in the model
  std::vector<std::string> not_undone;         // copyto targets written, tanks debited
};
PropulsionOutcome Evaluate(const EnginePlan& plan);
PropulsionOutcome CaptureEngineState(unsigned engine, std::string& record) const;
PropulsionOutcome RestoreEngineState(unsigned engine, const std::string& record);
```

`per_engine` is sized to the model and starts at `stNotSelected`, so an engine
the plan never named says so. The SDK surfaces the whole vector, so an app can
distinguish "this aircraft has a piston engine" from "engine 2 has no fuel"
from "engine 2 was never reached".

**One failure boundary: all-or-none, for every zero-time public request.**

1. Every selected engine is checked for capability and eligibility. If any
   check fails, the call returns with nothing mutated.
2. Every selected engine's private undo snapshot is taken **before any engine
   is mutated**, and so is the vehicle-output snapshot below.
3. The engines are applied in index order. If one throws, every engine already
   applied is restored by assignment and reports `stRolledBack`, the failing
   engine reports `stFailed`, the rest report `stNotAttempted`, the vehicle
   outputs are restored, and `all_completed` is false.
4. Completion runs only after every engine completed. If it throws, the engines
   are rolled back too and `vehicle_completed` is false.

The first submission let engines that had already completed keep their new
state. That is withdrawn: the review is right that it leaves the propulsion
totals, and then the aircraft totals and accelerations, describing a set of
engines that no longer exists. Partial completion buys nothing a caller can
use, because the caller cannot re-run the engine that failed without re-running
the function that threw.

**The vehicle-output snapshot** is what completion writes and nothing else:
`FGPropulsion::vForces` and `vMoments`; `FGAircraft`'s force and moment totals;
`FGAccelerations`' published outputs; and `FGPropagate::in.vPQRidot` and
`in.vUVWidot`. It is a plain struct copy taken at entry and restored by
assignment. No model is re-run to undo anything.

**Outside the boundary, named at the API and listed in `not_undone`:** any
property a configured function wrote through `copyto`; tank contents already
debited by a completed `ConsumeFuel()`; anything an external system read
through a tied property between entry and failure; and any model history the
caller asked to prepare — `piControls` flattens actuator and kinemat state and
that is not undone either. No atomicity is promised for arbitrary external
function effects.

### Acceptance cases for the failure boundary

1. **Two engines, the second fails.** A two-engine 737, both eligible, both on
   `opSteady`, with engine 1's `<tsfc>` function arranged to throw. Required:
   engine 0's `N1`, `N2`, `N2norm`, `FuelFlow_pph`, `correctedTSFC`, thrust and
   thruster force and moment are bit-for-bit their entry values and its status
   is `stRolledBack`; engine 1 is `stFailed` with the function named;
   `vForces`, `vMoments`, the aircraft totals and the accelerations are their
   entry values; `all_completed` and `vehicle_completed` are false; and
   `not_undone` lists the `copyto` target engine 1's function had already
   written.
2. **Completion fails.** The same aircraft with both engines applied and the
   completion step made to throw. Required: both engines report `stRolledBack`,
   the vehicle outputs are their entry values, `vehicle_completed` is false,
   and the evaluation scope — the executive timestep, the copied propulsion
   timestep, the suspension state and the trim status — is exactly as it was
   before the call. Implemented as a CxxTest over the scope guard with a
   throwing stub model; if the executive cannot be constructed with one, the
   case is recorded as untested rather than claimed.

### Two kinds of saved state

The first submission proposed rolling back with the same public record whose
restore performs a refresh. That is wrong twice over: the record omits derived
outputs and caches, and a refresh may re-evaluate the configured function that
just threw and create further `copyto` effects.

| | Public record | Native checkpoint | Private undo snapshot |
| --- | --- | --- | --- |
| Purpose | persistence, cross-instance continuation | a recovery snapshot taken every step | rolling back one failed operation |
| Form | versioned, identified, serialized text | an engine-owned struct copy behind an opaque handle | a plain struct copy; no allocation, no throwing |
| Taken | when a caller asks | when a caller asks; cheap enough for 120 Hz | at the entry of every operation that mutates |
| Applied | `RestoreState`, which ends with `opRefresh` | `RestoreState`, same semantics | on failure, by assignment only — nothing is evaluated |
| Covers | the engine-owned state in 4.1 | the same state | that, plus derived outputs, caches and caller-owned controls |

The checkpoint and the record carry the same fields; the serializer is derived
from the member list, not the other way round. 4.2 says which one the app uses
and why.

Restoring from the undo snapshot evaluates nothing. The thrust, the thruster
force and moment and the propulsion totals are restored from the values saved
in the snapshot, so the configured function that threw is not called again and
no new `copyto` effects occur.

### What the undo snapshot covers

- every mutable `FGTurbine` and `FGEngine` member in 4.1's audit;
- `FGThruster::Thrust`, `ReverserAngle`, and `FGForce::vActingXYZn` and
  `vOrient` when the operation may move them;
- `FGPropulsion::vForces` and `vMoments`;
- the copied inputs the operation writes: `in.ThrottleCmd`, `in.ThrottlePos`,
  `in.MixtureCmd`, `in.MixturePos` for every engine touched;
- the **FCS mixture command and position**, which
  `FGPropulsion::SetEngineRunning` writes today and never restores;
- `in.TotalDeltaT`, the executive `dT` through the suspension stack, and the
  trim status.

An operation that cannot honour this boundary rejects the request before
committing a partial result.

## 4. State, fuel and the IC lifecycle

### 4.1 The member audit

Read from `FGTurbine.h/.cpp`, `FGEngine.h/.cpp`, `FGThruster.h/.cpp` and
`FGForce.h` at `a6f86ae9`. "Captured" means the public record and the native
checkpoint, which carry the same fields. The **cold reset** column is what
`opInitCold` must write, which is not always what `ResetToIC()` writes today —
the measured differences are in
[`follow-up-2/probes.md`](../../validation/evidence/jsbsim/turbine-initialization/01-characterization/follow-up-2/probes.md)
§2 and are called out in the rows.

| Member | Class | Captured | `opInitCold` | Refresh |
| --- | --- | --- | --- | --- |
| `MilThrust`, `MaxThrust`, `BypassRatio`, `IdleN1/N2`, `IgnitionN1/N2`, `IdleFF`, `N1_spinup`, `N2_spinup`, `N1_start_rate`, `N2_start_rate`, `N1_spindown`, `N2_spindown`, `InjectionTime`, `Augmented`, `AugMethod`, `Injected`, `disableWindmill`, `MinThrottle`, `MaxThrottle`, `FuelDensity`, `SLFuelFlowMax`, `SourceTanks` | configuration, no runtime setter | no — covered by the digest | from the configured value | unchanged |
| `MaxN1`, `MaxN2`, `BleedDemand` | configuration with a runtime setter and a tied property | **yes, as overrides** | from the configured value — **today a scenario reset keeps the override** | unchanged |
| `InjN1increment`, `InjN2increment` | configuration with a runtime setter and a tied property | **yes, as overrides** | from the configured value — **today a scenario reset zeroes them, destroying the loaded value** | unchanged |
| `N1`, `N2` | continuous history | yes | 0 | preserved |
| `N2norm` | derived, currently latched | no — recomputed | 0 | recomputed |
| `N1_factor`, `N2_factor` | derived, mutated by injection | no | from configuration | recomputed |
| `EGT_degC` | algebraic while running, rate-limited while off | yes | `in.TAT_c` | preserved |
| `OilTemp_degK` | thermal history | yes | `in.TAT_c + 273.0` | preserved |
| `EPR` | algebraic while running, rate-limited while off | yes | **1.0 — today `ResetToIC` does not write it, so it carries the previous flight's value** | recomputed |
| `NozzlePosition` | rate-limited mechanical history | yes | 1.0 | preserved |
| `OilPressure_psi` | derived (`N2 * 0.62`) | no | **0.0 — today `ResetToIC` does not write it** | recomputed |
| `InletPosition` | dead | no | 1.0 | unchanged — written once in `ResetToIC`, never again |
| `InjectionTimer` | finite consumable | yes | **0.0 — today never reset after construction, measured to survive a scenario reset** | frozen |
| `InjWaterNorm` | finite consumable | yes | **1.0 where `<injection-time>` is configured, else 0.0 — today a scenario reset writes 0.0 unconditionally, so it empties the water `Load` filled** | frozen |
| `phase` | discrete phase | yes | `tpOff` | preserved |
| `Cutoff`, `Starter`, `Running`, `Cranking`, `Starved`, `Stalled`, `Seized`, `Augmentation`, `Injection` | discrete command/fault | yes | `Cutoff` true, the rest false | preserved; a legitimate instantaneous transition may fire |
| `Overtemp`, `Fire` | dead | no | false | unchanged — only ever set false in `ResetToIC`; nothing sets them true and nothing ties them |
| `Reversed` | external command | yes | false | preserved |
| `Ignition` | dead | no | — | — declared in `FGTurbine.h`, never written or read anywhere |
| `ThrottlePos`, `AugmentCmd` | copied input cache | no | — | recomputed from `in.ThrottlePos` |
| `correctedTSFC` | derived, currently latched | no — recomputed | recomputed | recomputed |
| `FuelFlow_pph` | continuous history | yes | 0 | preserved |
| `FuelFlowRate`, `FuelExpended` | published derived | no — recomputed | 0 | recomputed (4.3) |
| `FuelUsedLbs` | accounting | yes | 0 | preserved, never advanced |
| `FGEngine::FuelFreeze` | **dead** — written by `FGPropulsion::SetFuelFreeze` and by `FGEngine::ResetToIC`, read by nothing in the tree | **no** | false | unchanged |
| `PctPower`, `FuelFlow_gph` | dead for turbines | no | 0 | unchanged — base members `FGTurbine` never writes |
| `FGThruster::Thrust` | derived | no | 0 | recomputed |
| `FGThruster::ReverserAngle` | external command with a tied setter | yes | 0 | preserved |
| `FGThruster::GearRatio`, `ThrustCoeff`, `PowerRequired` | configuration, or unused by a nozzle | no | from XML | unchanged |
| `FGForce::vXYZn` | configuration; tied read-only | no | from XML | unchanged |
| `FGForce::vActingXYZn` | runtime override, tied read-write as `…/x-position` and siblings | **yes, as an override, only when it differs from `vXYZn`** | `vXYZn` | preserved |
| `FGForce::vOrient` pitch and yaw | runtime override, tied read-write as `…/pitch-angle-rad` and `…/yaw-angle-rad`, absent on a `<pointing>` nozzle | **yes, as overrides, and only when the properties exist** | from the configured `<orient>` — **today a scenario reset keeps the override** | unchanged |
| pre-function caches (`IdleThrustLookup`, `MilThrustLookup`, `MaxThrustLookup`, `InjectionLookup`, configured spool rates) | derived cache | no | — | resampled |

**Fuel freeze is manager-owned.** The review asked how the engine-level flag
reconciles with the manager-level one. It does not have to: `FGEngine::FuelFreeze`
has no reader anywhere in the tree. `FGPropulsion::ConsumeFuel()` tests
`FGPropulsion::FuelFreeze`, and only that. The engine copy is therefore not
captured, not restored and not part of any operation; it joins `Ignition`,
`Overtemp`, `Fire` and `InletPosition` in the dead-member report to upstream.
Worth reporting with it: `FGPropulsion::InitModel()` clears every engine's
copy and leaves the manager's flag set, so after a scenario reset the two
already disagree and nothing notices.

**"Absent override" needs a value to fall back to.** A record without an
override for `MaxN2` must restore the *configured* `MaxN2`, not leave whatever
the destination instance happens to hold. Today the engine cannot do that,
because the setters overwrite the loaded value in place and nothing keeps it:
measured above, `MaxN1`, `MaxN2`, `BleedDemand` and the thruster orientation
survive a scenario reset while the injection increments and the acting location
are zeroed. So `FGTurbine` keeps the loaded value beside the live one for each
runtime-writable configuration field. That is what makes both "absent override"
and `opInitCold` well defined, and it is a stage-4 change with its own test.

### 4.2 The record

```
{ "version": 1,
  "engine": "turbine",
  "name":   "<the engine's configured Name>",
  "config": "<sha256 of the loaded engine and thruster XML>",
  "index":  0,
  "state":     { ... the members marked captured ... },
  "overrides": { ... the runtime-writable configuration above ... } }
```

- **Required fields:** `version`, `engine`, `name`, `config`, `index`,
  `state`. `overrides` is optional; **absent means the configured value**, which
  restore assigns explicitly, so a record cannot inherit the destination
  instance's overrides by omission.
- **Unknown fields are rejected, not ignored.** A record written by a newer
  engine may carry state this one does not know how to apply, and applying the
  rest would leave a plausible-looking but wrong engine.
- **Missing required state is rejected.** Restore is not a partial update.
- **`config` is an identity check, not a proof.** It establishes that the same
  engine and thruster XML was loaded. It does not cover the property-tree
  values a configured function reads, the FCS, external systems, the tanks or
  the aircraft state. Those are external inputs: a restored engine reproduces
  its own trajectory only when they are equal too, and the record says so
  rather than implying a determinism it cannot deliver.

**Validation bounds, field by field.** The first submission said "model
ranges", which is not a reference. Every captured value must be finite, and:

| Field | Bound | Why not tighter |
| --- | --- | --- |
| `N1`, `N2` | `>= 0` | **no upper bound.** `MaxN1` and `MaxN2` are runtime-writable, so lowering a maximum below the attained spool is legal and produces a legal capture above it. Rejecting those would reject exactly the transient the review names |
| `NozzlePosition` | `0 <= x <= 1` | `Seek` clamps to its target and every target in the tree is in `[0, 1]`, so a value outside it cannot be produced |
| `InjWaterNorm` | `0 <= x <= 1` | `Load` writes 1.0 and `Run()` writes `1 − timer/time` with `timer < time` |
| `InjectionTimer`, `FuelFlow_pph`, `FuelUsedLbs` | `>= 0` | monotone or non-negative by construction |
| `OilTemp_degK` | `> 0` | absolute scale |
| `EGT_degC` | `> -273.15` | absolute scale |
| `EPR`, `OilPressure_psi` | `>= 0` | ratios and pressures |
| `phase` | a defined enumerator | it selects a dispatch |
| `Cutoff` … `Injection` | boolean | — |
| `MaxN1`, `MaxN2` overrides | finite, and `MaxN2 - IdleN2 != 0` | that difference is the normalization denominator; section 6 records that today it is unvalidated and can be zero |

Validation completes before any mutation.

**Scope:** restore works across instances that loaded the same engine and
thruster configuration, which is what the app needs because it reloads the
model when the aircraft changes. **Every test for this is planned, not
written** — stage 4 for the native round trip, stage 6 for the cross-instance
case. No state API exists yet and nothing here reports a restore result.

**Two representations, one member list.** The review corrected a factual claim
here. The app's `fixedStepLoop.ts:80` takes `captureSimulation(sdk)`
immediately before `sdk.run()` and restores from it when that step is rejected
— so it already takes a recovery snapshot on **every** fixed step at 120 Hz,
and the first submission's "the app captures engine state only when it takes a
recovery snapshot" described the same thing while implying it was rare.
Capturing the engine after a failure cannot recover its pre-step value, so the
engine state has to be paired with that same pre-step snapshot. The answer is
not to drop the checkpoint to avoid allocating:

- the **native checkpoint** is an engine-owned struct copy behind an opaque
  handle. It is what `fixedStepLoop.ts` takes each step, alongside the aircraft
  snapshot it already takes, and it serializes nothing;
- the **serialized record** is the same fields as text, for persistence and for
  crossing instances. If stage 7 measures the checkpoint to be unnecessary it
  may serialize at capture instead — but it serializes at capture, not later.

**What stage 7 captures, and when.** At `fixedStepLoop.ts:80`, in the same
statement as the aircraft snapshot: one checkpoint per engine. On a rejected
step, restore replays both. That is what preserves the start, shutdown and
injection history the contract promises through a rejected step — today
`restoreSimulation` calls `resetToInitialConditions(2)` and then
`propulsion/set-running`, which measurably empties `InjWaterNorm`, zeroes the
injection increments, re-seats the thruster acting location and restarts the
engine from a full-throttle initialization, so none of that history survives a
rejected step at all.

### 4.3 Fuel

**Usable fuel** is what `ConsumeFuel()` already walks: a tank that is selected,
has a non-zero priority and holds more than its unusable quantity.
`FGPropulsion` gains that walk as a side-effect-free query, and **every
eligibility and combustion decision calls it**, rather than reading the
`Starved` flag left over from an earlier frame.

**Three quantities, currently conflated in two members:**

| Quantity | Meaning | Where it lives | Today |
| --- | --- | --- | --- |
| requested | the flow the operating point implies | a local in the calculation | becomes `FuelFlow_pph` immediately or by seeking |
| indicated | what the properties publish | `FuelFlowRate` → `fuel-flow-rate-pps`/`-gph` | written only inside `ConsumeFuel()`, so it holds whenever that returns early |
| delivered | what the tanks are debited | `FuelExpended` | zero when frozen, starved or in trim |

**Decision.** The engine publishes the indicated flow from its own evaluation,
on every operation, so it always describes the engine. `ConsumeFuel()` keeps
ownership of delivered fuel and of `FuelUsedLbs` and keeps its early returns.
An operation with no elapsed time debits nothing, which is already true.

**The starvation flag is stale exactly when `ConsumeFuel()` returns early.**
The first submission said "stale starvation is not stale" because the flag is
recomputed on every evaluation. It is not: `ConsumeFuel()` returns on
`FuelFreeze` and on trim status **before** it walks the tanks, and
`SetStarved()` is only reached after that walk. It also runs *after*
`engine->Calculate()`, so within one frame the engine decides on the previous
frame's flag. Measured in
[`follow-up-2/probes.md`](../../validation/evidence/jsbsim/turbine-initialization/01-characterization/follow-up-2/probes.md)
§3 — F-16, run, tanks emptied, tanks refilled to 2000 lb, then
`propulsion/set-running`:

| Refill performed | Result of the restart |
| --- | --- |
| thawed | runs: N1 100.0, 19576.3 lbf |
| frozen | **does not run**: N1 0.42, N2 0.28, 0.0 lbf, on 2000 lb of usable fuel |
| frozen, then one thawed frame | runs: N1 100.0, 19576.3 lbf |

One unfrozen frame is the whole difference. What is stale is the flag, not only
the published rate; both are fixed by querying the tanks at the point of
decision.

**No residual fuel inventory is modelled.** The review asked, and the answer
decides the combustion signal: there is no line or accumulator volume anywhere
in `FGTurbine` or `FGPropulsion`. Every pound of the decaying flow after a
cutoff is drawn from the tanks by `ConsumeFuel()` like any other. So a positive
requested or indicated flow with no usable supply is not evidence of
combustion; it is a flow nothing can pay for.

**Combustion is made explicit**, as an engine-owned flag published as
`propulsion/engine[n]/combusting`, and it is **not** derived from the phase and
the flow alone:

> `Combusting` is true when the flow the engine is asking for is positive, the
> phase is one that burns, **and usable fuel is available now**.

| Situation | Requested flow | Usable supply | `Combusting` |
| --- | --- | --- | --- |
| `tpRun`, tanks with fuel | > 0 | yes | **true** |
| `tpRun`, tanks empty, freeze off | > 0 until the flag catches it | no | **false**, and the phase falls to `tpOff` on the next evaluation |
| `tpRun`, tanks empty, freeze on | > 0 | no | **false** — today the engine runs at full thrust here, which `opInitRunning` now rejects |
| freeze on, tanks with fuel | > 0 | yes | **true** — freeze suppresses accounting, not supply |
| `tpStart` before `Running` latches | `IdleFF · N2/IdleN2` | yes | **true** |
| `tpStart`, no supply | `Start()` requires `!Starved` | no | **false** |
| `tpStall` | `IdleFF` | yes | **true**; with no supply, false |
| `tpSeize`, not cut off | `IdleFF` | yes | **true**; with no supply, false |
| `tpSeize`, cut off | 0 | — | **false** |
| `tpOff`, residual flow after a cutoff, tanks with fuel | > 0 and decaying | yes | **true** until it reaches zero |
| `tpOff`, residual flow, no supply | > 0 and decaying | no | **false** |
| `tpSpinUp` | 0 | — | **false** |

Freeze and starvation are kept apart throughout: freeze suppresses accounting
while supply can remain available; starvation is the absence of supply.

**Causal tests, named:** the cutoff residual with supply, where `combusting`
stays true until the flow reaches zero and the tanks are debited by the same
integral; the starved-and-frozen case, where `combusting` is false while
`FuelFlow_pph` is positive; the start, where `combusting` is true before
`Running` latches; the stall and the uncut seizure, each with tanks and with
empty tanks; and the frozen refill above, where the supply query returns true
on the next evaluation although `Starved` is still latched.

The audio adapter reads that signal instead of inferring combustion from a flow
threshold. Until it exists the adapter's current rule stands, with its known
failure on a starved engine.

**The freeze crossing, measured.** F-16, `set-running`, then `RunIC()`, then
120 frames:

| Tanks | Fuel freeze | Result today |
| --- | --- | --- |
| full | off | starts, runs, burns 4.245 lb, tanks fall |
| full | on | starts, runs, burns nothing, tanks hold, published flow stuck at 0.00 gph |
| empty | off | `set-running` reports running at N1 100 and 17797.6 lbf; the following `RunIC()` shuts it down |
| empty | **on** | **starts and keeps running at full thrust on empty tanks**, because `ConsumeFuel()` returns early on freeze and never calls `SetStarved()` |

**Decision.** `opInitRunning` queries usable fuel *independently of freeze* and
rejects when there is none, so empty-and-frozen is rejected. Fuel freeze means
the tanks do not change, not that fuel exists. A frozen tank holding usable
fuel is not a start failure. This is a behaviour change: a scenario that today
runs an engine on empty frozen tanks will be rejected, and it has a test.

**The residual flow after a cutoff is delivered fuel.** `Off()` seeks it to
zero and the tanks are debited for every frame of it. It is reported, paid for,
and `Combusting` is true while it lasts — provided the tanks can pay. No
zero-fuel-use shutdown is claimed.

### 4.4 The IC running request

**Decision: legacy `RunIC()` replay is left exactly as it is.** The first
submission proposed making a stored `<running>` request one-shot. The review
asked for the caller that needs it, and there is none: four shipped
initialization files use `<running>`, none of them combines a turbine with a
runtime cutoff and a later `RunIC()`, and 0sfs does not use the element at all.
A caller that wants a passive refresh uses `opRefresh` and never touches the IC
path. Changing replay would be a behaviour change without a beneficiary, so it
is withdrawn, and with it the temporary persistence switch.

The lifecycle is therefore the existing one, now written down:
`FGInitialCondition::Load` sets `enginesRunning` from each `<running>` element;
`InitializeIC()` clears it and `ResetToInitialConditions()` does not call
`InitializeIC()`, so the request survives resets; every `RunIC()` applies it
through `FGPropulsion::InitRunning`, which forces the propulsion throttle
inputs to full before starting; a failure throws and `RunIC()` returns false.
`FGInitialCondition::SetEnginesRunning(unsigned mask)` is added as the
supported way for a caller to clear or set the request — an addition, not a
change.

**A commanded cutoff survives `RunIC()` only where the IC asks for nothing.**
The first submission stated the rule without that qualification. Both cases are
measured and both are kept:

| The IC's `<running>` for this engine | What `RunIC()` does to a cut-off engine | Status |
| --- | --- | --- |
| absent — every shipped turbine IC except four, and every 0sfs aircraft | the engine is ineligible for `opSteady`, gets `opRefresh`, and the cutoff stands | the regression this work fixes; the trace's `stale-running-cutoff` scenario is the no-IC arm |
| present | `FGPropulsion::InitRunning` reinitializes the engine running, exactly as today, and the cutoff does not survive | unchanged legacy behaviour, replayed on every later `RunIC()`; the report's stored-IC section measures it |

A passive refresh preserves a cutoff in both cases. It is the stored running
*request* that overrides it, and only through the legacy adapter.

**Reset to scenario is preserved.** `ResetToInitialConditions()` keeps meaning
"start this scenario again", including the engines it asks for — and, once
`opInitCold` defines the fields 4.1 marks, including the injection water and
increments it currently destroys.

### 4.5 The missing injection function

Measured on the stock B747, whose `GE-CF6-80C2-B1F` declares
`<injected> 1 </injected>` and defines no `Injection` function: setting
`propulsion/engine[0]/injection_cmd = 1` and then calling `RunIC()` terminates
the process, and so does a running `Run()`. `Run()` with the engine off
survives, because `Off()` never reads the lookup. Adding the function to a
sandbox copy makes both survive.

**Decision: guard at the call sites and warn at load.** Rejecting at `Load`
would stop the shipped B747 loading at all, which is a worse outcome than an
injection system that does nothing. `FGTurbine::Load` logs a warning when
`<injected>` is 1 and no `Injection` function is defined; both call sites treat
a missing lookup as a factor of 1.0, and both apply the same
`InjWaterNorm > 0` condition that `Run()` already has and `Trim()` does not.

Compatibility test: the stock B747 loads, and `injection_cmd = 1` followed by
`RunIC()` returns the same thrust as with the command clear.

## 5. Warm values, thermal history and injection

**"Thermal history" means oil temperature and nothing else.** Section 1's
per-field table is the authority; this section only fills in the numbers. A
running turbine integrates exactly one thermal quantity, `OilTemp_degK`, which
`Run()` seeks toward a constant 366.0 K. `EGT_degC` is algebraic in the running
phase — `Run()` assigns `in.TAT_c + 363.1 + N2norm * 357.1` every frame — and
is rate-limited only in `Off()`, `SpinUp()` and `Start()`, which are not
eligible for a steady operating point. So a steady evaluation assigns EGT and
preserves oil temperature, and the first submission's blanket "preserve thermal
history" is withdrawn.

- **`opInitRunning`** uses the model's own warm values: `OilTemp_degK = 366.0`
  and `EGT_degC = in.TAT_c + 363.1 + N2norm * 357.1`, the constants the
  trim-finished block and `Run()` already use.
- **`opSteady` and `opRefresh`** preserve `OilTemp_degK`; `opSteady` assigns
  EGT with the rest of the operating point and `opRefresh` preserves it, since
  it changes no spool. Measured consequence today: after
  `propulsion/set-running`, master leaves oil at 366.0 K and the repaired
  candidate at 361.2 K on the 737, because the candidate writes the steady
  spools before `GetSteadyState()` starts, so its loop converges in fewer 0.5 s
  steps — 123 engine evaluations against 133 — and the oil seek gets less
  engine time. Both reach 366.0 K on the next frame. Assigning the warm value
  instead of marching to it removes the dependency.
- **`opInitCold`** uses `ResetToIC`'s thermal values — `EGT_degC = in.TAT_c`
  and `OilTemp_degK = in.TAT_c + 273.0` — and additionally writes the fields
  `ResetToIC` leaves alone, which 4.1 lists: `EPR` to 1.0 and
  `OilPressure_psi` to 0.0.
- **Injection is preserved by every operation on an existing engine**, as
  section 1 states: the timer and the remaining water come back unchanged from
  `RunIC()` today and from `opSteady`, `opRefresh` and `opInitRunning` in the
  proposal. Only `opInitCold` and a scenario reset write them, and they write
  the configured values rather than today's zeroes. What else changes is the
  remaining-water condition and the missing-function guard, both in 4.5.

## 6. `N2norm` once the engine is no longer running

### What is measured

`N2norm` is written only by `Run()` and by `ResetToIC()` (to zero). `Off()`
maintains N1 and N2 but not the normalization, so after a shutdown it holds the
last running value: 1.0000 while N2 decays to 1.262, on master and on the
repaired candidate alike.

`FGSpoolUp` reads it to scale the spool rate. Isolated, one `Run()` frame at
idle N2 with a full-throttle demand, nothing differing but the member:

| Forced `N2norm` | ΔN2 in one frame | Ratio to `N2norm = 0` |
| --- | --- | --- |
| 0.00 | 0.06921 | 1.000 |
| 0.25 | 0.12093 | 1.747 |
| 0.50 | 0.18503 | 2.673 |
| 1.00 | 0.22055 | 3.187 |

The same factor appears in a real restart: the first `Run()` frame after the
engine latches advances N1 by 0.221 on a restart, where `N2norm` is still 1.0,
against 0.069 from cold, where it is 0. `SpinUp()` and `Start()` use their own
configured rates, so cranking and lighting are unaffected — 590 frames to crank
after a shutdown against 640 from cold, 2221 to light against 2222.

`FGSimplifiedTSFC` also reads it, so any evaluation of the default TSFC while
the engine is off is made at the stale normalization.

### The two decisions, separated

**Decision A — remove the staleness. Settled.** `N2norm` becomes a derived
quantity recomputed from `N2` wherever `N2` changes, so `Off()`, `SpinUp()`,
`Start()`, `Stall()`, `Seize()` and the steady path all leave it consistent
with the spool. `ResetToIC`'s zero then agrees with a fully spun-down engine
instead of contradicting it. This is a behaviour change with a causal restart
test, and it belongs to **stage 4**, not to the stage-3 extraction.

**Decision B — clamping. Not settled here, and deliberately not called
defensive.** The 3.19× sensitivity establishes that the value matters; it does
not establish that every reader should receive the same clamped quantity.
Stage 4 investigates and decides, with these questions written down:

- **Below idle.** `Run()` computes `(N2 - IdleN2) / N2_factor` unbounded, and
  the thrust term is proportional to its square, so a below-idle spool in
  `tpRun` would make thrust *grow* as the spool falls. Whether `tpRun` is
  reachable with N2 below `IdleN2` is **not demonstrated**: the stall-recovery
  path returns to `tpRun` above idle and `Run()` seeks down to exactly
  `IdleN2`, giving `N2norm = 0`. Stage 4 either exhibits a reachable case or
  records that it found none.
- **Above maximum.** `MaxN1` and `MaxN2` are runtime-writable. Lowering `MaxN2`
  below the attained N2 makes `N2_factor` smaller and `N2norm` exceed 1;
  `FGSpoolUp` already clamps its own use with `min(1, N2norm + 0.1)` while
  `FGSimplifiedTSFC` and the thrust term do not.
- **A zero or negative denominator.** `N2_factor = MaxN2 - IdleN2` is not
  validated at load and is runtime-writable, so it can be zero or negative.
  The defined behaviour has to be chosen — reject at load, clamp the factor, or
  define the normalization as zero. Today it is a division by zero.
- **Injection.** `Run()` adds `InjN2increment` to `N2_factor` while injection
  is active, so the same N2 normalizes differently with and without water. Any
  clamp or recomputation has to say which factor it uses.
- **Per reader.** `FGSpoolUp` wants a rate scale, `FGSimplifiedTSFC` wants a
  thermodynamic operating point and the thrust term wants a thrust fraction.
  They may not want the same clamp, and this section does not assume they do.

## 7. Configured functions: order, visibility and `copyto`

### What was read and measured

- `IdleThrust`, `MilThrust`, `AugThrust`, `Injection` and any configured
  `N1SpoolUp`/`N1SpoolDown`/`N2SpoolUp`/`N2SpoolDown` are **pre-functions**.
  `RunPreFunctions()` is the first statement of `FGTurbine::Calculate()` and
  `FGFunction::cacheValue(true)` caches the result, so each is evaluated once
  per engine evaluation — before `ThrottlePos` is read from the copied input
  and before any spool moves. A configured spool rate therefore sees the
  previous frame's operating point. The built-in `FGSpoolUp` is not a
  pre-function and is evaluated live.
- `<tsfc>` and `<atsfc>` are constructed directly, not registered, so they are
  evaluated live at each call site and are not cached.
- `FGFunction::GetValue()` writes its `copyto` target on every evaluation.
- `propulsion/engine[n]/atsfc` is tied to the parameter's getter, so *reading
  the property* evaluates the function and fires its `copyto`; `…/tsfc` is tied
  to the stored `correctedTSFC` and is read-only.
- The per-phase evaluation counts are the table in section 2.

### Decisions

1. **A fixed, documented order per operation:** sample pre-functions once; read
   the copied inputs; select the phase or operation; compute the spool state;
   recompute the normalization; evaluate the operating-point parameters against
   that state; publish thrust, flow and gauges; run post-functions.
2. **Counts are preserved, not normalized.** Stage 3 reproduces the measured
   table exactly. Stages 4 and 5 may change counts where an operation changes,
   and each such change is stated and tested.
3. **A pure arithmetic core is extracted only after sampling.** Values are
   sampled into locals first; the shared calculation takes numbers. Setting
   `N1`/`N2` temporarily and restoring them is not a rollback, because a
   configured function may have written a `copyto` target in between.
4. **`copyto` effects are not rolled back**, and the API says so.
5. **`GetSteadyState()`'s time-marching loop is replaced** by direct
   equilibrium assignment for engines that claim `capInitRunning`, and stays as
   the legacy path for those that do not.

## 8. Timestep, intent and trim state

### The defects, as measured

- `saved_dT` is a single `double`. Suspend, call `RunIC()` or
  `propulsion/set-running`, resume: the executive is left at `dT = 0.0` with
  `IntegrationSuspended()` still true. An explicit `Setdt` restores it, so the
  condition lasts until a caller intervenes.
- `SuspendIntegration()` does not refresh `FGEngine::Inputs::TotalDeltaT`.
  Read live after a normal frame and a suspend: executive 0.000000, copied
  0.008333. Only the next `Run()` brings them together, through
  `FGFDMExec::LoadInputs`.
- `RunIC()` leaves the copied propulsion timestep at **zero** when the IC asks
  for no engine start, and at the real timestep when it does, because
  `GetSteadyState()` sets `in.TotalDeltaT = FDMExec->GetDeltaT()` rather than
  restoring the value it replaced.

### Decisions

1. `saved_dT` becomes a small stack, and `SuspendIntegration()`/
   `ResumeIntegration()` push and pop. The signatures do not change, so every
   existing caller keeps working. This is a self-contained upstream slice with
   its own test and no dependency on the rest of this work.
2. `FGFDMExec::EvaluateEngines` owns the evaluation scope: it pushes the
   suspension, sets the copied propulsion timestep the operation requires, sets
   the trim status the operation requires, and restores **what it replaced** —
   not what the executive currently holds — on every exit including an
   exception.
3. An operation never infers intent from `dT` or from `GetTrimStatus()`. The
   turbine's `if (in.TotalDeltaT == 0) phase = tpTrim` and the trim-finished
   block disappear in stage 5, replaced by the operation the caller passed.
4. Aircraft trim keeps setting `SetTrimStatus(true)`, because `FGInput`,
   `FGOutput`, `FGLGear`, `FGFCSChannel`, `FGActuator`, `FGKinemat` and
   `FGAccelerations` read it, and additionally requests `opSteady` per trial
   and on the accepted state.

### The rollback set

On a failed operation, restored by assignment from the private undo snapshot
with nothing evaluated: the members listed in section 3, the thruster's
`Thrust`, `ReverserAngle` and acting location, the propulsion force and moment
totals, the copied throttle and mixture inputs for every engine touched, the
FCS mixture command and position, the copied propulsion timestep, the executive
timestep through the suspension stack, and the trim status. Explicitly outside:
`copyto` targets, tank contents already debited, and anything an external
system observed through a tied property.

## What this did to the contract

[contract.md](contract.md) is updated in place, with a dated note at the top.
Most entries are blanks it left for this stage.

| Contract item | Was | Now | Kind |
| --- | --- | --- | --- |
| Operation table | refresh covered both steady evaluation and history preservation | `opSteady` and `opRefresh` are separate operations with separate eligibility and separate callers | **changed target**, from the review |
| 4, fuel supply | "settle its exact mapping in stage 1" | freeze freezes consumption, not indication or supply; empty-and-frozen is rejected by initialize-running; a frozen tank holding usable fuel is not a failure | blank filled |
| 6, fuel target/indication/accounting | "stage 1 defines whether that residual represents delivered fuel…" | delivered fuel, with requested, indicated and delivered separated and combustion made an explicit engine-owned signal | blank filled |
| 8, injection | onset and exhaustion tested | plus the remaining-water condition, and a missing lookup guarded at the call sites with a load-time warning rather than a load failure | **changed target** |
| 9, completion | "publish … dependent vehicle forces/derivatives" | the executive-level completion sequence in section 1 | blank filled |
| Caller mapping, `RunIC()` | "define precedence of stored IC running requests versus later cutoff" | legacy replay is unchanged; where the IC asks for nothing, an ineligible engine is routed to refresh and the cutoff survives; where the IC carries a `<running>` request, the legacy adapter reinitializes the engine and the cutoff does not survive. 4.4 records both | blank filled |
| 7, thermal policy | "preserve thermal history" | oil temperature is preserved and EGT is assigned, because EGT is algebraic in the running phase and only rate-limited in phases that cannot be steady. Section 1's per-field table is the authority | **changed target**, from the follow-up review |
| 10, failures | "restore … on every exit" | all-or-none for every zero-time public request, with a vehicle-output snapshot, an explicit `not_undone` list and per-engine statuses that never default to completed | blank filled |
| Caller mapping, the call table | "stage 1 must turn the compatibility row into an exact call table" | section 1's routing table and section 2's measured call table | blank filled |
| Configured functions | "evaluate configured functions in a specified order" | the order in section 7 and the per-phase call table in section 2, which stage 3 preserves rather than normalizes | blank filled |
| State capture, inventory | "stage 1 inventories native state" | section 4.1, member by member, including the inherited and thruster members | blank filled |
| State capture, scope | "define whether restores cross instances…" | across instances that loaded the same engine and thruster configuration, with the digest stated as an identity check rather than a proof, and the tests named as planned | blank filled |

Two contract items were already right and are now measured to be violated by
the current code rather than amended: item 3's "must report inability to run
when fuel is unavailable" — `propulsion/set-running` with empty tanks reports a
running engine at full thrust — and item 10's "support nested use without
overwriting an outer saved timestep", which `saved_dT` does not.

## Behaviour changes, with their callers and tests

Ten, each with an identified caller, a test and a stated stage. **None is in
stage 3.**

| Change | Stage | Identified caller | Test |
| --- | --- | --- | --- |
| An ineligible engine returns no powered thrust from a zero-time evaluation | 5 | aircraft trim; the app's location change | the 737 cruise trim and the never-started F-16 `RunIC()`, plus the 61 shipped scripts |
| A commanded cutoff survives an initialization | 5 | the app's rollout cut-out | cutoff commanded with no frame before `RunIC()`; the engine must still be off one frame later |
| `propulsion/engine[n]/set-running = 1` no longer starts the engine by itself | 5 | `safeFlightState.ts`, which writes the boolean for the not-running case | the boolean followed by `RunIC()` and a frame; N1/N2 must stay where they were |
| `opInitRunning` rejects when there is no usable fuel, including empty and frozen | 4 | a scenario preset with unfuelled tanks | the four-cell freeze matrix above |
| The published fuel rate follows the engine during freeze, trim and starvation, and `combusting` becomes explicit | 4 | `jsbsimAudioAdapter.ts` | starved for 7200 frames: the rate must track the engine and `combusting` must go false |
| `N2norm` stops going stale while the engine is off | 4 | `FGSpoolUp` on the first frame of a restart; `FGSimplifiedTSFC` | the shutdown-and-restart case in section 6 |
| `opSteady` assigns EGT, oil pressure, EPR and the nozzle position, which `Trim()` does not write today | 4/5 | any steady readback of the gauges, including the app's instrument panel | a throttle step followed by `RunIC()`: the four fields must match the values a long frame-by-frame run settles to, with the nozzle's 1.25 s of lag stated as the one visible difference |
| `opInitCold` writes the fields `ResetToIC` leaves alone and restores the configured values it zeroes | 4 | `ResetToInitialConditions()`, which the app calls on every recovery | the measured reset table: `InjWaterNorm`, the injection increments, the acting location, `EPR`, `OilPressure_psi` and `InjectionTimer` |
| `RunIC()` seeds the derivative history with the accelerations it just computed | 5 | every `RunIC()` caller, including the app's recovery | the F-16 case: the seeded `vUVWidot` must equal the accelerations held on return, against today's 29.587322 ft/s² gap in `udot` |
| Usable fuel is queried at the point of decision instead of read from the latched `Starved` flag | 4 | a scenario or recovery that refills tanks while frozen | the frozen-refill arms: the restart must succeed on 2000 lb of usable fuel without an intervening unfrozen frame |

## Per-stage boundaries and the smallest fixture for each change

| Stage | Files | Smallest reproducible fixture |
| --- | --- | --- |
| 3 shared calculations, **behaviour-preserving** | `FGTurbine.cpp/.h`, plus the new `tests/unit_tests/FGTurbineTest.h` and its `UNIT_TESTS` entry in `tests/unit_tests/CMakeLists.txt`, and any Python characterization added under `tests/` | the F-16 `scripts/f16_test.xml` fixture: steady N1/N2/flow/TSFC at four dry and one augmented command against the pre-extraction build, plus section 2's call table asserted with evaluation counters |
| 4 explicit operations and state | `FGEngine.h/.cpp`, `FGTurbine.cpp/.h`, `FGPropulsion.cpp/.h`, a new state helper, the same test files | F-16 for the operations, the freeze matrix, the frozen refill and the `N2norm` restart; a sandbox B747 for finite injection; a two-engine 737 for per-engine indexing and the all-or-none failure case |
| 5 callers, trim and failure | `FGFDMExec.cpp/.h` (suspension stack, `RunIC` routing, `EvaluateEngines`, the refreshed propagation inputs), `FGTrim.cpp`, `FGLinearization` routing, the same test files | the 737 cruise script for trim; `TestSuspend` extended for nesting; the cutoff-before-`RunIC` case; the whole linearization column in section 1; the four completion acceptance cases in section 1 |
| 6 native acceptance | tests only | the 61 shipped scripts through `compare_scripts.py`, plus the full Python and Python-disabled suites |
| 7 SDK and app | `wasm/src/sdk`, then 0sfs `safeFlightState.ts`, `resetFlightLocation.ts`, `bootstrapC172.ts`, `flightModelDriver.ts`, `jsbsimAudioAdapter.ts` | the SF50 through bootstrap, location change, preset restart and contact recovery |

Upstream slicing, each independently reviewable and independently useful:

1. `SuspendIntegration()` nesting — no turbine involvement.
2. The null `Injection` lookup and the remaining-water condition — a crash from
   shipped data.
3. `FGTurbine::Trim()` renamed to say what it does, no behaviour change, which
   is the naming clarification Sean asked for.
4. The published fuel rate during freeze, trim and starvation, plus the
   explicit combustion signal.
5. The shared steady calculation.
6. The explicit operations and state capture.

## What stage 1 did not settle

- **Whether `N2norm` should be clamped, and identically for every reader.**
  Section 6 decision B, with its five questions, is stage 4's to answer.
  Decision A — removing the staleness — is settled.
- **Whether `tpRun` is reachable with N2 below `IdleN2`.** Not demonstrated.
- **The compatibility cost of removing powered thrust from an ineligible
  engine** across the 22 shipped turbine aircraft and 61 scripts. Scheduled in
  stage 5.
- **Whether a linearization should see spool dynamics.** Stage 5 preserves the
  measured steady-map behaviour; a dynamic-engine Jacobian is a separate
  proposal.
- **Whether the executive can be constructed with a throwing stub model**, and
  so whether the completion-failure acceptance case in section 3 is testable
  without a production hook. Stage 5 answers it and records the case as
  untested if it cannot.
- **What the refreshed derivative seeding does to the 61 shipped scripts.**
  The gap is measured on one case; whether any script's trajectory moves is a
  stage-5 question, and the change is listed among the behaviour changes for
  that reason.
- **Whether the native checkpoint is needed at all.** Stage 7 measures the
  serialized capture at 120 Hz and may drop the checkpoint if it is
  unnecessary — but it does not drop the *snapshot*, which is what the app
  restores from.
- **Whether upstream accepts any of the six slices.** Local implementation does
  not wait for it, and no slice has been posted.
