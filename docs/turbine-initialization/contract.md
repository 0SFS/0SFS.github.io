# Turbine operation contract

**Stage-1 evidence accepted; the follow-up review's contract corrections are
applied here.** The [follow-up review](reports/01-follow-up-review.md) accepted
the characterization and the separation of steady and refresh, and required
five groups to be closed: what each operation changes, mixed-engine eligibility
and failure results, the executive completion sequence, the recovery snapshot,
and fuel and legacy IC precedence. Each is closed below and in
[decisions.md](decisions.md). Treat these amendments as proposals until the
coordinator accepts them; **stage 3 remains pending**.

This is the target for the [implementation plan](plan.md), not a description
of implemented APIs. Preserve the distinctions below even if upstream prefers
different method names.

**2026-09-19, revised 2026-09-20: stage 1 filled in the items this document
deferred to it**, from the measurements in its
[report](reports/01-characterization.md). The names, signatures and reasoning
are in [decisions.md](decisions.md); the paragraphs below carry proposed
answers instead of the questions. Five entries are genuine changes of target
rather than blanks being filled: the operation table gained a distinct steady
operation; item 7's thermal rule became per-field rather than blanket; item 8
gained the remaining-water condition and the missing-function guard; item 9
gained an explicit completion sequence including the propagation-input refresh;
and item 10 became all-or-none for zero-time requests.

## Operation versus physical phase

| Operation | Time and history | Intended use |
| --- | --- | --- |
| Advance | Integrate actual spool, fuel-flow and thermal dynamics; consume fuel using real elapsed time | Ordinary simulation and physical startup/shutdown. It is **not** offered by the zero-time public wrapper, whose scope guard suspends integration |
| Steady | Assign the equilibrium implied by the current controls for the fields [decisions.md §1](decisions.md)'s per-field table marks assigned — spools and their normalization, thrust, requested flow, corrected TSFC, EGT, oil pressure, EPR and nozzle position — while preserving the histories it marks preserved: oil temperature, the injection timer and remaining water, cumulative fuel use, tank contents and simulation time. Consumes nothing | An eligible running engine through `RunIC()`, aircraft-trim trials and finalization, linearization, any caller asking for the steady point at these controls |
| Refresh | Preserve every continuous history; recompute only what is algebraic in unchanged state, and apply legitimate instantaneous command/fault transitions | Restored state, a location change, an ineligible engine, a suspended caller that wants outputs recomputed and nothing changed |
| Initialize cold | Explicit reset of the selected engine to the cold values [decisions.md §4.1](decisions.md) names field by field, including the ones today's reset leaves untouched and the configuration it currently destroys | A scenario reset of one engine, never an incidental refresh |
| Initialize running | Assign an eligible running operating point at the requested controls and specified thermal policy, with usable fuel required and injection state **preserved, not replenished** | A scenario beginning with its engines running |
| Restore | Validate and apply captured engine-owned state, then refresh at the restored environment. Restore takes a record; it is not an argumentless operation in the evaluation enum | Recovery and relocation preserving engine history |

Steady and refresh are not interchangeable. Steady assigns an operating point
and is available only to an engine that is running, not cut off, not starved,
not stalled and not seized — with the fuel part of that judgement made by
querying the tanks now, not by reading a latched starvation flag. An ineligible
engine receives refresh instead, which is what keeps powered thrust out of a
solution an off engine cannot support. Refresh never seeks a target and never
starts an engine.

**Steady does not mean "changes nothing that is ever integrated".** Several
assigned fields are rate-limited in some phase; what makes them assignable is
that the running phase determines them from the current controls, directly or
as the fixed point of its own rate limit. Oil temperature is preserved because
its target is a constant that says nothing about the controls. The per-field
table in [decisions.md §1](decisions.md) is the authority and resolves this
against item 7 below.

**A mixed request is routed by the caller, not by the operation.** The legacy
`RunIC()` and trim adapter builds one plan that names steady for the eligible
engines and refresh for the others, submits it, and completes the combined
vehicle once; each engine's result says which operation it received. A strict
explicit steady request is checked across every selected engine before anything
is mutated and is rejected whole if any is ineligible. No engine is ever
mutated under a result that reads as a rejection.

The implementation can use an evaluation enum plus separate reset/restore
methods. Do not add cold/reset/trim as fictitious physical engine phases.
Numerical dt controls integration, not the decision to initialize a running
engine. Aircraft trim requests steady operating points explicitly and commits
the accepted state through the same native completion path.

## Behavior decisions

1. **Use common calculations.** For supported steady states, calculate
   equilibrium spool targets directly. Normal running uses attained spools
   and retains its configured rates. Both evaluate common thrust, fuel and
   gauge formulas. Iteration is allowed for a demonstrated coupled equation,
   with bounded convergence/failure reporting; do not time-march all turbine
   history solely because the old generic settling loop does.
2. **Preserve history on refresh.** N1/N2, oil temperature, injection elapsed
   time and other integrated state do not seek a target at zero elapsed time.
   Algebraic gauges may update for changed conditions. Cutoff or seizure may
   make an instantaneous state transition; that is not simulated elapsed time.
3. **Running eligibility is explicit.** Passive refresh/reevaluation never
   clears cutoff, faults or lack of fuel to satisfy an old `Running` flag.
   A deliberate initialize-running request may enable fuel/cutoff as the
   existing startup command does, but must report inability to run when fuel
   is unavailable or disqualifying faults persist. A reset of faults is a
   separate explicit reset operation. Resolve and test simultaneous conditions
   against the existing precedence; do not discard stalled/start behavior.
4. **Check supply without consuming it.** Propulsion owns the query of tanks,
   feed selection, unusable fuel and freeze semantics, and exposes it as a
   side-effect-free query. **Every eligibility and combustion decision calls
   that query**, whatever the `Starved` flag says: the flag is recomputed only
   on frames where `ConsumeFuel()` gets past its freeze and trim-status early
   returns, and `ConsumeFuel()` runs *after* the engine has already been
   calculated. Measured: with freeze on, refilling the tanks to 2000 lb leaves
   the flag set and a restart fails, while one unfrozen frame before the same
   restart makes it succeed. A trim evaluation must not debit fuel, alter fuel
   mass or cumulative fuel use. Deliberate tank restoration/reset is a separate
   requested mutation. Fuel freeze freezes consumption, not indication and not
   supply: the tanks and the cumulative use hold, and the published flow keeps
   describing the engine. A frozen tank that holds usable fuel is not a start
   failure; empty tanks are, frozen or not, because freeze means the contents
   do not change and not that fuel exists. Today the published rate is written
   only inside `ConsumeFuel()`, so it holds whenever that returns early, and an
   engine on empty *frozen* tanks keeps running at full thrust because nothing
   ever calls `SetStarved()`. Publishing the rate from the engine's own
   evaluation and querying usable fuel independently of freeze are both part of
   this work.
5. **Off means no powered thrust.** Retain residual/windmilling rotation;
   do not invent a windmilling drag model. No accepted trim borrows powered
   thrust from an off engine. A starting engine may burn fuel before `Running`
   becomes true, so that boolean alone cannot gate fuel or audio combustion.
6. **Separate the requested, indicated and delivered flow.** The requested
   flow is what the operating point implies, the indicated flow is what the
   properties publish, and the delivered flow is what the tanks are debited.
   Do not create a new positive running target during off/cutoff evaluation.
   The decaying flow after a cutoff is **delivered fuel**, not indication lag:
   `Off()` seeks it to zero and the tanks are debited for every frame of it,
   so it is reported and paid for. **No residual fuel inventory is modelled** —
   there is no line or accumulator volume anywhere in the turbine or the
   propulsion manager — so a positive requested or indicated flow with no
   usable supply is not evidence of combustion, and no zero-fuel-use shutdown
   is claimed. Fault-specific flow keeps its modelled meaning: `Stall()` and an
   uncut `Seize()` burn the idle flow. **Combustion is its own signal**, owned
   and published by the engine, and it is true only when the requested flow is
   positive, the phase is one that burns **and usable fuel is available now**.
   Freeze and starvation are not merged: freeze suppresses accounting while
   supply can remain available, starvation is the absence of supply, and the
   signal follows supply. [decisions.md §4.3](decisions.md) specifies the flag
   for cutoff residuals with supply, empty tanks, freeze, start, stall and
   seizure, and names the causal test for each. Consumers read that signal
   rather than inferring combustion from a flow threshold. These are model
   policy choices stated as such; the old tank-debit code proves accounting
   only.
7. **Choose thermal policy per field, not per operation.** A new
   already-running scenario defaults to a documented warm operating state;
   derive each value from the current model or a documented initialization
   constant. A steady evaluation of an existing engine and aircraft trim
   **preserve oil temperature**, which is the only quantity a running turbine
   integrates thermally and whose target is a constant unrelated to the
   controls; they **assign EGT**, which the running phase computes algebraically
   from the normalized spool and the total air temperature every frame and
   rate-limits only in phases that cannot be steady. A cold start follows
   actual starting dynamics. Do not warm oil merely because dt is zero. The
   per-field table in [decisions.md §1](decisions.md) governs; this item no
   longer says "preserve thermal history" as a whole, because that contradicted
   the EGT assignment.
8. **Finite injection is not infinite equilibrium.** A steady operating point
   may use the currently remaining injection state with duration frozen.
   Initialization does not advance/refill its timer or water — **including
   initialize-running**, which restarts an existing engine and must not
   silently replenish its water. Replenishment happens only on an explicit
   scenario reset, which means initialize-cold for one engine or
   `ResetToInitialConditions()` for the aircraft, and which sets the configured
   values rather than today's zeroes. Reject a requested equilibrium if the
   model cannot represent it consistently. Test onset and exhaustion.
   The steady path applies the same remaining-water condition as ordinary
   running — no injection credit with the water exhausted — and no path
   dereferences an injection lookup the engine configuration does not define.
   Both are amendments: stage 1 measured thrust credited with no water left,
   and a segfault from a shipped aircraft's data.
9. **Complete before return, from prepared inputs.** A public operation
   publishes, in order: the engine's spool state, flow and gauges; the
   thruster's force and moment from the same thrust; the propulsion totals;
   then the aircraft force and moment totals and the accelerations, re-run at
   zero elapsed time; then — **after refreshing the propagation inputs from
   those accelerations** — initialized derivatives, and only for an operation
   entitled to reseed integration history. Copying the propulsion inputs is not
   preparation: it takes the flight control system's *outputs* and the
   atmosphere and auxiliary *outputs* as they stand, so it evaluates neither a
   changed throttle command nor a changed position. The operation therefore
   states a prepared-input precondition and offers an explicit preparation
   argument that meets it — environment only, or environment and controls — and
   names which public wrapper meets it for each caller. Preparation that runs
   the flight control system is **not** history-preserving under trim status,
   because actuators discard their lag initialization and kinematic components
   jump to their input; it is available to initialization and to the legacy
   adapter, and refused to a refresh that promised to preserve history.
   Completion re-runs only the models that read engine state, so no configured
   function runs inside it. An engine-level entry point that stops after the
   propulsion totals is available for a caller that finishes the vehicle
   itself, and is documented as not completing it. The next frame can evolve
   the accepted state normally; it must not apply deferred initialization.
   Preserve other engine types' existing semantics while updating shared
   scheduling.
10. **Failures leave a defined state, and a zero-time request is
    all-or-none.** Restore engine-owned working state, caller-owned controls as
    specified, evaluation mode, executive dt, propulsion input dt and trim
    status on every exit, including exceptions. Support nested use without
    overwriting an outer saved timestep. A multi-engine request takes every
    engine's undo snapshot and the vehicle-output snapshot before it mutates
    anything, and on any failure it rolls every engine back rather than leaving
    some committed: a partially committed set leaves the propulsion totals, and
    then the aircraft totals and accelerations, describing engines that no
    longer exist. Restore dependent outputs by assignment from the snapshot;
    do not re-run a model to undo it, because that re-runs the function that
    failed. Report per engine, and never default an engine's result to
    completed: "not selected", "not attempted" and "rolled back" are distinct
    results a caller can act on, and the executive and binding boundaries carry
    the whole structure rather than a bare boolean. Inventory XML property/cache
    writes and return them with the result; do not promise rollback of
    arbitrary external side effects. An operation that cannot meet its declared
    failure boundary must report the limitation or reject the unsupported case
    before committing a partial result.

## Caller mapping and compatibility

| Caller | Planned mapping | Compatibility rule |
| --- | --- | --- |
| Ordinary `Run()` | Advance; suspended execution selects refresh | Existing zero-dt callers relying on implicit equilibrium must be inventoried and given an explicit initialization path |
| Existing `RunIC()` | One plan: steady for each eligible engine, refresh for each that is off, cut off or faulted, initialize-running for each the IC asks to start; then one vehicle completion | Keep the existing signature and the immediate steady readback, which is the property callers value. A stored IC `<running>` request keeps being replayed exactly as it is today — no shipped or app caller needs that changed. **A commanded cutoff survives only where the IC carries no running request for that engine**, because a cut-off engine is then ineligible for steady and refresh does not clear the command. Where the IC does carry one, the legacy adapter reinitializes the engine running and the cutoff does not survive; both cases are recorded in [decisions.md §4.4](decisions.md). A passive refresh preserves the cutoff either way |
| `propulsion/set-running` / `InitRunning()` | Explicit initialize-running request | Preserve engine-index/-1 meanings and existing full-input startup convention in the legacy wrapper; new explicit initialization accepts current controls without an intermediate full-power state |
| Aircraft trim | Eligible steady trials, accepted-state finalization | Report changed solutions/failures caused by correcting off-engine thrust. Do not silently start engines merely to make a trim converge |
| New app cruise/departure preset | Explicit scenario initialization with selected on/off and thermal policy | Piston initialization remains supported; preset policy belongs in the app |
| Location change without a new preset | Preserve turbine history, apply new position/environment, prepare the environment inputs, then refresh | No implicit restart, zeroing or warm-up, and no flight-control-system preparation, which would discard actuator history |
| Contact recovery / `restoreSimulation()` | Restore engine history and requested aircraft/tank/clock state, then refresh | This is same-model recovery; preserve it even if contact/integrator state is deliberately rebuilt. The engine state is captured in the **same pre-step snapshot** as the aircraft state and restored with it, because the app's snapshot at `fixedStepLoop.ts:80` is taken immediately before the step it may have to undo |

The exact call table — first call, repeated calls, live cutoff, persistent IC
flags, the per-engine boolean, script events and explicit restart, each with
what it does today and what it must do — is [decisions.md §2](decisions.md).
Legacy entry points stay as documented adapters while new app calls express
their intent explicitly. Do not add a permanent global “old turbine physics”
switch. Any migration behavior must have an identified caller, test and stated
lifetime; the behaviour-change table in decisions.md names a caller, a test
and a stage for each of the ten.

## Configured functions and state capture

Evaluate configured functions in the order fixed by
[decisions.md §7](decisions.md). The number of evaluations per phase is
whatever the engine does today — it varies with augmentation latching and is
measured, not normalized — and a behaviour-preserving extraction reproduces
that table rather than collapsing it to one call each. Spool-rate inputs
precede integration — they are pre-functions, cached by `RunPreFunctions()`
before the copied throttle is even read — while operating-point functions see
the selected attained or steady state. `FGSimplifiedTSFC` reads member N2norm, and XML functions can read tied
properties, cache pre-functions and write `copyto`. Extract a pure arithmetic
core only after values are sampled; never assume that temporarily setting
N1/N2 and restoring them rolls back every function effect.

The member-by-member inventory — physical phase and control/fault flags, N1/N2
and their normalization and factors, dynamic flow and accounting, thermal and
nozzle histories, augmentation and injection state, engine-owned caches and
thruster state, each classified and given its capture/reset/refresh treatment —
is [decisions.md §4.1](decisions.md), and includes the thruster's mutable
acting location, its runtime-writable pitch and yaw angles where the
configuration exposes them, and the runtime-writable `MaxN1`, `MaxN2`,
`BleedDemand` and injection increments, which are captured as overrides
because a configuration digest cannot reconstruct them. The inherited
`FGEngine::FuelFreeze` is **not** captured: freeze is owned and read at the
propulsion manager, and the engine's copy has no reader anywhere in the tree,
so it is reported as a dead member instead of being carried. An **absent
override means the configured value**, which restore assigns explicitly, so a
record can never inherit the destination instance's overrides by omission; the
engine keeps the loaded value beside the live one to make that possible.
Derived values are recomputed rather than carried, with tests demonstrating
consistency; `N2norm` in particular stops being latched. Whether it should also
be clamped, and identically for every reader, is a separate question that stage
4 answers as its own measured change, excluded from the extraction baseline.
State records carry a version and engine/model identity, and reject unknown
fields, missing required state and non-finite or out-of-range values before
mutating the live engine. The bounds are per field and stated in
[decisions.md §4.2](decisions.md); in particular a spool **above a lowered
runtime maximum is a legal capture** and is not rejected, because lowering
`MaxN1` or `MaxN2` below the attained spool is legal. The identity check is not
a proof of equal external inputs, and the record says so.

A failed operation is rolled back from a private, non-throwing snapshot taken
at entry — not from the public record, which omits derived outputs and whose
restore would re-evaluate the function that failed.

Restore is supported across instances that loaded the same engine
configuration, not only the originating instance, because the app reloads the
model when the aircraft changes; a digest of the loaded configuration is what
makes that safe. **Both tests for that — the native round trip and the
cross-instance case — are planned, not written**: stage 4 and stage 6
respectively. No state API exists yet. Start with same-model
capture/restore for deterministic supported configurations, including the
shipped SF50. External systems, arbitrary XML
state, RNG state and general aircraft integrator state are not implicitly part
of a turbine snapshot. Record unsupported dependencies explicitly. Validate
the native state contract before exposing it through SDK types; the app must
not maintain its own guessed list of private engine variables.
