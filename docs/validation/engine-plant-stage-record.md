# Coupled engine plant: stage record

Living record for the [implementation specification](../proposals/engine-plant-implementation.md).
Update it at the end of every stage or session. Status words: **done** (deliverable
and exit gate exist), **in progress**, **not started**, **blocked**.

## Identities

| Item | Identity |
| --- | --- |
| JSBSim branch | `feature/turbine-plant` in `/Users/felg/gh/Felipegalind0/jsbsim`, based on `master` 97fe6ddf |
| JSBSim native build | `build/turbine-plant-20261008` (Release, Python on, CxxTest, ccache in `build/ccache`) |
| Installed SDK in 0sfs | `deps/felipegalind0-jsbsim-1.2.4-fork.16.tgz` (unchanged so far) |
| Upstream PRs at start | #1502, #1505, #1506, #1507, #1508, #1511 open; #1504 merged ([snapshot](../../validation/evidence/jsbsim/open-pr-review-2026-10-07/status.json)); none touched by this work |

Concurrent work: other sessions own the dirty 0sfs files present at the start of
this work (phone controller, aircraft lights, sky defaults, `flightParameters.ts`,
`createFlightSimApp.ts`, `FlightControlPanel.tsx` and docs). This work commits
only its own files; shared integration surfaces it must edit (`flightParameters.ts`,
the Engine panel) are edited last and committed with only its own hunks.

## Stages

| Stage | Status | Evidence |
| --- | --- | --- |
| 0 Inventory | done | below |
| 1 Contracts | in progress | native contract in JSBSim `doc/turbine-plant-model.md` (to write with the FGTurbine integration) |
| 2 Native reference | done for the synthetic engine | JSBSim 24a1e6c4; `FGTurbinePlantTest` 24/24 |
| 3 Lifecycle integration | not started | |
| 4 F135 and LiftSystem | not started | sources gathered (below) |
| 5 Reduction and budgets | partly: tabulated gas + Broyden reuse, component fallback | reduced-vs-reference test |
| 6 SDK and consumers | not started | |
| 7 Package and checks | not started | |
| 8 Report | not started | |

## Stage 0 inventory

- Native: `FGTurbine::Run` selects `AugThrust` as soon as augmentation is
  commanded, and `UpdateThermal` infers AB fuel as total fuel minus the steady dry
  demand. That pair is the contradiction recorded in
  [f135-ab-onset.md](f135-ab-onset.md): 4.1333 s of full wet thrust while burned
  AB fuel is zero. `FGPropulsion::Run` calls each engine's `Calculate`, then
  `ConsumeFuel`; `ConsumeFuel` returns early when fuel is frozen or trimming, and
  `FGTank::Drain` loses a shortage silently. `GetSteadyState` marches 0.5 s steps.
- F-35B: engine 0 is the F135 (`Engines/F135-PW-600.xml`); engines 1–3 (lift fan,
  roll posts) are force carriers whose `MilThrust` reads engine 0's body force and
  `fcs/roll-post-allocation`. `fcs/stovl-augmentation-inhibit` clamps the main
  throttle to 0.99 in powered lift. Tanks 0–3.
- App consumers of engine outputs: `jsbsimAudioAdapter.ts`, `flightModelDriver.ts`
  (engines 1–3 thrust as lift fan and roll posts), `createAircraftEngineVisuals.ts`,
  `createEngineExhaust.ts`, `engineMonitorModel.ts`, `safeFlightState.ts`,
  `fdmProfiles.ts`, and the onset harness/test
  (`f135ExhaustOnsetHarness.ts`, `f135ExhaustOnset.integration.test.ts`, whose
  `it.fails` records the contradiction).
- Public F135/LiftSystem constraints (retained source:
  `build/engine-plant/sources/F135-STOVL-Product-Card-2020.pdf`, sha256
  66d3dacb…78172f4, not redistributed): maximum 41,000 lbf, intermediate 27,000 lbf,
  STO 40,740 lbf, hover 40,650 lbf; inlet diameter 43 in (main) and 51 in (lift
  fan). Rolls-Royce LiftSystem: 20,000 lbf lift fan, 29,000 shp shaft, roll posts
  1,950 lbf, 50 in counter-rotating fan, 3BSM 95° in 2.5 s. Bypass and pressure
  ratios found only in secondary sources (BPR about 0.57); they stay uncertain.

## Stage 2 decisions and results

- Gas path unknowns: core W25, bypass W13, mixer bypass W16 (signed in iteration),
  and ln of the HP and LP turbine pressure ratios. Turbine capacity is the residual
  in squared form; flow-as-unknown with the ellipse inverted was nearly singular
  near choke and failed flame-outs and seizure.
- Pressure residuals are scaled by a gauge that depends only on speed and flight
  condition (fan-law similarity of the design nozzle gauge, plus ram, floor
  1e-3·p0). A scale built from the iterated pressures saturated at ±2 whenever the
  two sides straddled ambient, which stalled the light-off step.
- Mixer entry is an active set (open: equal total pressures; blocked: no bypass flow).
- Iteration cap is a hard per-step bound (default 16; a quarter reserved for the
  end-state publication); substeps 1/2/4; component fallback; a failed
  publication restores the previous accepted state and latches the failure.
- Steady solve uses demand continuation from the present corrected N1 when the
  direct solve fails (mil to idle).
- Seizure quenches both flames and restarts the core-flow guess from a small value.
- Synthetic transient (cold start, idle, mil, AB 15 s, cutoff) at 120 Hz:
  per-step energy closure ≤ 5.8e-6 relative (worst on the first step from rest),
  cumulative 8e-10; mass ~1e-15; mean 2.7 iterations per step, maximum 12.
- Timestep: the controller samples once per step from the previous step's
  sensors, so 60/120/240 Hz error is first order and not monotone; all stay within
  1% of design thrust and 0.5 %-points N1 of a 1920 Hz reference.

## Unresolved

- Solids use an explicit step at the step-start temperature (energy-consistent,
  conditionally stable). A runtime stability guard is still to add.
- `UpdateController` records the AB-selection event through a `const_cast`; move
  event recording to the accepted step.
- No natural convection at rest; a stopped engine cools by radiation only.
- Local linear algorithm deferred: no cost/error case made yet.

## Next task

FGTurbine `<plant>` opt-in: XML parsing, properties under
`propulsion/engine[n]/plant/`, legacy property mapping, zero-time policy, supply
query before `Calculate` and exact debit, capture/restore through staged
properties; then the native contract document.
