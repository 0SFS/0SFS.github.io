# SF50 source-backed performance validation

Status: source fixtures, a headless runner, and acceptance/driver tests are
implemented locally. The initial run passed the SDK build, typecheck, all 17
SDK tests, and 11 driver/acceptance tests, but exposed incorrect landing
initialization. The aircraft is not yet calibrated or independently validated.

The initialization correction explicitly sets angle of attack after the
coupled flight-path setter and re-evaluates the restored engine command at
zero timestep after native engine startup. The runner now rejects mismatched
pitch, flight path, throttle command/position, time, fuel, or a full-power
landing transient. Inspect the new run's report before using its residuals.

## What existed before this work

The recorded 430 flight tests covered integration, contact behavior, response
signs, and timestep contracts. They did not establish agreement with AFM
takeoff, landing, climb, cruise, or handling performance.

## Published targets

The source is Cirrus-authored AFM P/N 31452-001, with the specific performance
pages marked Revision 4, hosted on ManualsLib. These are development reference
data, not a current operational manual for a particular aircraft.

| Case | Role | Weight, lb | Pressure altitude, ft | Ground roll, ft | Total distance, ft |
| --- | --- | ---: | ---: | ---: | ---: |
| Takeoff, ISA | Calibration | 6000 | 0 | 2036 | 3192 |
| Takeoff, ISA | Holdout | 6000 | 1000 | 2106 | 3302 |
| Landing, ISA | Calibration | 5550 | 0 | 1628 | 3011 |
| Landing, ISA | Holdout | 5550 | 1000 | 1677 | 3082 |

Takeoff uses half flaps, gear down, bleed ON, calm air and dry level pavement;
the total includes a 50-foot obstacle. See
[conditions, page 5-24](https://www.manualslib.com/manual/3777690/Cirrus-Vision-Sf50.html?page=382)
and [table, page 5-25](https://www.manualslib.com/manual/3777690/Cirrus-Vision-Sf50.html?page=383).

Landing uses full flaps, 85 KIAS VREF and idle thrust on dry level pavement in
calm air. These are unfactored distances. See
[conditions, page 5-128](https://www.manualslib.com/manual/3777690/Cirrus-Vision-Sf50.html?page=486)
and [table, page 5-129](https://www.manualslib.com/manual/3777690/Cirrus-Vision-Sf50.html?page=487).

The separate rated-thrust diagnostic uses 1846 lbf from
[EASA.IM.A.615 Issue 6, page 8](https://www.easa.europa.eu/en/downloads/24242/en).
It must not be confused with a calibrated installed bleed-ON thrust model.
Sources were accessed on 2026-09-11.

The distance tolerance is a project-selected 15%, and the rated-thrust
diagnostic tolerance is 5%. Neither is a manufacturer or certification
tolerance. Keep holdout points out of coefficient fitting.

## Implementation and ownership

[FlightModelDriver](../../src/flight/model/flightModelDriver.ts) owns its
backend privately, accepts typed control/initialization commands, discovers
property capabilities once, advances one native fixed step per call, and
returns immutable copied observations. Missing optional thrust data is null,
not a fabricated zero. Tank and wheel counts come from the model catalog.

This boundary is used by the new headless runner. Migrating the interactive
application, renderer, controls, reset/snapshot paths, settings/import/export,
and live replacement to it remains unfinished. It is not yet a replacement
for every existing SDK access in the application.

Native executive deletion, model-bound view invalidation, and bounded
model-load errors are implemented in the canonical jsbsim-wasm checkout.
They are not duplicated in OSFS. The local wrapper build, typecheck and 17
SDK tests passed. The currently installed npm package does not yet contain
those edits, so the runner requires the built local wrapper.

## Commands

Use Node 26 for the runner's direct TypeScript imports. After approval to run
builds/tests, first build and exercise the dependency:

```sh
cd /Users/felg/gh/Felipegalind0/jsbsim-wasm
npm run build:sdk
node --test test/sdk-lifecycle.test.mjs
npm test
npm run typecheck
```

Then run the application-side contracts and collect the baseline:

```sh
cd /Users/felg/gh/0sfs
npm test -- src/flight/model/flightModelDriver.test.ts src/flight/validation/evaluateSf50Performance.test.ts
node scripts/validate-sf50.mjs --sdk-root=../Felipegalind0/jsbsim-wasm --report-only
```

Omit `--report-only` for a nonzero exit when any reference case is incomplete,
blocked, erroneous, or outside tolerance. A successful report-only process
does not mean the aircraft passed. No live network or browser is used.

## Reading the report

The runner records source/page identity, calibration versus holdout role,
production package SHA-256 hashes, scenario-overlay hash, runtime, timestep,
initial/final observations, measured distances, relative errors and blockers.
It initializes the published gross weights using a scenario-only payload
overlay and 1500 lb of fuel within the declared tank capacities; it does not
rewrite the production XML or coefficients.

The current pilot is deliberately marked approximate: 90 KIAS rotation,
a pitch controller, a simple flare, and braking after wheel contact are
development choices, not independently sourced AFM test procedures. CG/payload
distribution, bleed extraction, contact friction, and height measurement
datum also need matching. These limitations block validation even if a
distance happens to agree. Unfinished trajectories remain incomplete rather
than receiving a plausible-looking distance.

## Next calibration work

1. Run the baseline and resolve capability/setup failures before interpreting residuals.
2. Match loading/CG, bleed demand, rotation/flare/braking procedure and measurement datum to the source.
3. Fit propulsion and aerodynamic parameters against calibration points, with explicit source and uncertainty records.
4. Evaluate holdout points without fitting against them.
5. Add source-backed climb/cruise/fuel-flow points and handling-response data where available.
6. Adopt the tested SDK artifact and migrate the interactive app to the private driver.

Public performance tables constrain aggregate performance. They do not by
themselves identify stability derivatives, stall dynamics, or time histories
of control response. Those need additional flight-test/engineering data and
independent assessment. This work is for the simulator, not operational
aircraft planning or qualified flight training.
