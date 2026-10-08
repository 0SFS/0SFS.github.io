# Coupled engine plant: stage record

Living record for the [implementation specification](../proposals/engine-plant-implementation.md).
Status words: **done** (deliverable and exit gate exist), **in progress**,
**not started**, **blocked**. The outcome is summarized in the
[report](engine-plant-report.md).

## Identities

| Item | Identity |
| --- | --- |
| JSBSim | `feature/turbine-plant` fast-forwarded into local `master` at `ea6956b4`, in `/Users/felg/gh/Felipegalind0/jsbsim`; neither is pushed |
| JSBSim native build | `build/turbine-plant-20261008` (Release, Python on, CxxTest, ccache) |
| Installed SDK in 0sfs | `deps/felipegalind0-jsbsim-1.2.4-fork.20.tgz`, sha256 `37532356…a1094419` ([adoption record](../../validation/evidence/jsbsim/adoption/fork20-adoption.json)) |
| Rejected candidates | fork.17, fork.18, fork.19, retained in `deps/` and refused by the identity gate |
| Rollback | fork.16 with the pre-migration F-35B data ([declaration](../../validation/evidence/jsbsim/rollback/fork16/README.md)) |
| Upstream PRs | #1502, #1505, #1506, #1507, #1508, #1511 untouched by this work; nothing posted |

Concurrent work: other sessions own the dirty 0sfs files present at the start
(phone controller, aircraft lights, sky defaults, parts of `flightParameters.ts`,
`createFlightSimApp.ts`, `FlightControlPanel.tsx` and docs). This work commits
only its own files and hunks.

## Stages

| Stage | Status | Evidence |
| --- | --- | --- |
| 0 Inventory | done | below |
| 1 Contracts | done | JSBSim `doc/turbine-plant-model.md` (configuration, properties, state record, zero-time and failure policy, ledgers); `utils/turbine_plant/validation.json` (metric definitions and gates) |
| 2 Native reference | done | Synthetic engine and analytical fixtures, `FGTurbinePlantTest` 33 methods |
| 3 Lifecycle integration | done | `FGTurbine` adapter: set-running at the FCS throttle, zero-time steady/refresh, reset, supply and debit, staged state record with commit; app snapshot restore of the exact plant state |
| 4 F135 and LiftSystem | done | [Ledger](f135-engine-plant.md); one engine with LiftSystem outlets as external forces; hover reheat inhibit; app tests |
| 5 Reduction and budgets | done | Reduced algorithm (tabulated gas, Jacobian reuse, component fallback) against the component reference on five held-out trajectories ([evidence](../../validation/evidence/aircraft/f35b/engine-plant/algorithms/report.json)); work and bytes bounded by the iteration, substep and memory caps; local linear model deferred (below) |
| 6 SDK and consumers | done | Audio, optics/onset harness, forces overlay, fuel tanks, engine control, snapshots, Engine → Simulation settings and engine model, the monitor's plant numerics. Engine → Simulation was not drawn until the fix below |
| 7 Package and checks | done | fork.20 adoption; 90 native, 52 SDK, 63 identity, 238 integration tests; final `npm run ci` in the report |
| 8 Report | done | [Report](engine-plant-report.md); upstream drafts in [the contribution plan](../proposals/jsbsim-turbine-plant-upstream.md) |

## Stage 0 inventory

- Native: `FGTurbine::Run` selected `AugThrust` as soon as augmentation was
  commanded, and `UpdateThermal` inferred reheat fuel as total fuel minus the
  steady dry demand. Together they gave the contradiction recorded in
  [f135-ab-onset.md](f135-ab-onset.md): 4.1333 s of full wet thrust with zero
  burned reheat fuel.
- F-35B: engine 0 was the F135; engines 1–3 (lift fan, roll posts) were force
  carriers reading engine 0's body force. `fcs/stovl-augmentation-inhibit`
  clamps the main throttle to 0.99 in powered lift.
- App consumers: `jsbsimAudioAdapter.ts`, `flightModelDriver.ts`,
  `createAircraftEngineVisuals.ts`, `createEngineExhaust.ts`,
  `engineMonitorModel.ts`, `safeFlightState.ts`, `fdmProfiles.ts`, the forces
  overlay and the onset harness and test.
- Public constraints are in the [ledger](f135-engine-plant.md).
- Lift and side engines audited: engines 1–3, their throttle channels and
  `liftfan.xml` / `sidefan.xml` are removed. The lift fan and posts exist once,
  as plant outlets applied as external forces. Their fuel is the main engine's,
  and their inlet ram drag is applied once each.

## Decisions

- Gas path unknowns: core W25, bypass W13, mixer bypass W16 and ln of the HP
  and LP turbine pressure ratios, with a momentum mixer at static pressure.
  Shafts are integrated at the implicit midpoint.
- Iteration cap 24 (the spec proposed 8): the first step of an engine at rest
  in moving air needs about 12 component iterations after the reduced attempt.
  A quarter of the cap is kept for publication.
- A plant engine's `augmentation` property is reheat fuel burning; selection
  is `plant/combustion/ab-selected`. Sound and optics follow burning.
- External-force magnitudes are read from each force's `<function>` property,
  which the profile names; JSBSim publishes `external_reactions/<name>/magnitude`
  only for property-driven forces.
- Snapshot restore commits the plant's staged state record after the last
  RunIC. A record from another configuration is refused, leaving the steady
  re-initialization.

## Native defects found by the app tests and fixed

| Candidate | Defect | Fix |
| --- | --- | --- |
| fork.17 | `set-running` put a plant engine at full throttle; first step from rest in moving air could exhaust a 16-iteration cap; cold metal at 288.15 K | fork.18 |
| fork.18 | No steady conversion above about 15 kt (stopped fan passed no ram flow); bypass surrogate blocked the bypass at 1 % conversion; split loop toggled during spool-down | fork.19 |
| fork.19 | Reheat permission on physical N2: none static above about 15,000 ft | fork.20 |

F135 configuration errors found the same way, fixed in 0sfs data:

- **Deceleration schedule** blew the core out on part-power chops.
- **Start schedule** sat on the lean ignition limit, so windmill relight failed
  from 20,000 ft.
- **Start time** was 9.5 s against the app's 15–40 s expectation.

## Found in the running app

- **Engine → Simulation was not on screen.** Its settings were registered, but
  the Engine tab draws named sections and did not draw it, and they were
  "all"-level, shown only under Show all parameters. The tab now opens with the
  section for an aircraft with an engine-model choice; a panel test checks it.
- **Nothing said which engine was flying, or let one compare.** The section now
  names the engine model flying and its JSBSim version. `osfs.engine.model`
  chooses between the plant and the F-35B's pre-plant empirical engine, kept as
  its own data package (`F-35B-jsbsim-empirical`) and loaded on reload. The
  pre-plant suite passes against it; responses are compared in the
  [report](engine-plant-report.md#comparing-with-the-empirical-engine).
- The monitor's **Engine plant numerics** rows show the plant's per-step
  numerics, closing the stage 6 gap.

## Engine-tab redesign follow-up

The October 8 variable-driven monitor keeps the Simulation controls under
**Engine → Settings → Simulation** and the actual algorithm, iteration,
fallback, residual, memory and accounting observations under **Live data**.
Settings and Live data are the two top-level collapsible sections. A variable
appears once, as a plotted trace or compact reading; native history and events
remain separate from simulation commands. [The monitor design](../engine-monitor.md)
documents grouping, layout persistence, recording budgets and migration.
This follow-up does not qualify browser appearance, gesture behavior or timing.

## Unresolved

- The local linear algorithm is deferred. The reduced algorithm already halves
  the residual work, with a 1e-6 error. A local linear model would need event
  handling through start, ignition, choking and conversion before it could be
  admitted, and no case has been made that it would cost less within the gates.
- Wall-clock cost, display and sound-device acceptance: not authorized in this
  handoff.
- Open physical items are in the [ledger](f135-engine-plant.md#limits).
- Stage 2 follow-up:
  - solids use an explicit step at the step-start temperature, stable only
    while the step is small against capacity over conductance, with no runtime
    guard;
  - a stopped engine has no natural convection;
  - nozzle back-off now has a rejected-publication regression in fork.21; see the follow-up below.

## Powered-lift stability follow-up, 2026-10-08

Installed fork.21 from clean local native/SDK 34eeae66 corrects frozen/trim PPS
and integration-versus-publication fallback/work observations; raw accepted mass
terms and commanded throat are exported. Real constrained-cap native regressions
now cover publication fallback, rejected publication retaining state and nozzle
back-off. This closes the earlier absence of a native nozzle-back-off test.
Controller gains, limiter schedules, F135/FCS XML and physical forces are unchanged.

The [powered-lift record](f135-powered-lift-stability-2026-10-08.md) retains
80 s full-conversion trajectories, command .98/.99/1, both algorithms, refinement,
perturbations, independent conservation, a dimensional lift/load ledger and exact
optical handoff. The user-reported cycle remains unreproduced; stable fixtures are
not a captured user session or full physical hover qualification. The known 1%
conversion thrust loss and 10%/60 kt failure remain open. Fixed hot full conversion
is stable with physical N2 limiting and insufficient modeled lift at 37,000 lb.
Native checks cover 90 targets including the approved socket-only rerun; 52 SDK
built-artifact cases pass. App CI's one Engine-help failure passes its 30-test
targeted rerun; production build passes. The completed full CI was not green;
no device acceptance is claimed.

The rotating-frame free-hover isolation in that record holds 20% clean fuel at
5,000 ft ISA with normal FCS and .95567056 throttle. Its 60 s observation meets
the predeclared engineering hover gates (altitude span 0.02395 ft), while mass
and energy close independently. This is a declared numerical fixture, not the
user's captured flight or real F135 qualification. Matching gravitational force
alone is separately retained and does not supply the required corotation balance.
