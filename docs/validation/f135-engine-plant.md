# F135 coupled engine plant: provenance and calibration

The F-35B's F135-PW-600 runs as JSBSim's coupled turbine plant
(`public/jsbsim-data/aircraft/F-35B-jsbsim/Engines/F135-PW-600.xml`, SDK
`1.2.4-fork.20`, JSBSim `ea6956b4`). One transient carries:

- fuel metering and ignition;
- the matched gas path and shafts;
- the main nozzle;
- two metal temperatures;
- the LiftSystem: a lift fan driven from the LP spool through a clutch, and
  roll posts bled from the bypass duct.

The model and its equations are documented in JSBSim's `doc/turbine-plant-model.md`.
This page records where every F135 value comes from, what it was fitted to,
what is unknown and how much that matters.

The values are a **calibration to public ratings**, not an identification of
the F135. Thrust ratings pin the design-point scale. They do not identify the
cycle (temperatures, pressure ratios, efficiencies), the inertias, the fuel
system or the combustion. Those are labelled hypotheses below, and their
influence is measured.

## Public constraints

From Pratt & Whitney's F135 STOVL product card (2020; retained locally, not
redistributed) and Rolls-Royce's LiftSystem page:

| Constraint | Value | Use |
| --- | --- | --- |
| Maximum thrust (STOVL, conventional flight) | 41,000 lbf | Fitted: reheat fuel/air at full demand |
| Intermediate thrust | 27,000 lbf | Fitted: design-point thrust scale |
| Hover thrust, total | 40,650 lbf | Fitted: main 16,750 + lift fan 20,000 + 2 × 1,950 |
| Lift fan thrust | 20,000 lbf | Fitted: lift-fan pressure ratio and design flow |
| Roll post thrust | 1,950 lbf each | Fitted: roll-post areas |
| LiftSystem shaft power | 29,000 shp | **Not fitted**; the hover point gives 21.0 MW = 28,200 shp (−3 %), an independent check |
| 3BSM rotation | 95° in 2.5 s | The FCS conversion actuator (unchanged) |
| Bypass ratio | about 0.57 (secondary sources only) | Hypothesis 0.56 |

## Calibration points

Static sea level, ISA, aircraft held, steady solve (`runIc` after `set-running`):

| Point | Main | Lift fan | Roll posts | N1 / N2 | T4 / T7 | Fuel (core / reheat) |
| --- | ---: | ---: | ---: | --- | --- | --- |
| Idle (throttle 0) | 1,816 lbf | — | — | 35.2 / 60.0 % | 808 / 424 K | 0.212 kg/s |
| Intermediate (0.99) | 27,000 lbf | — | — | 100 / 100 % | 1680 / 853 K | 2.409 kg/s |
| Maximum (1.0) | 41,000 lbf | — | — | 100 / 99.8 % | 1677 / 1890 K | 2.429 / 6.525 kg/s |
| Hover (0.99, split 1.194) | 16,750 lbf | 20,000 lbf | 2 × 1,950 lbf | 100 / 106.1 % | 1812 / 967 K | 2.993 kg/s |

The intermediate and maximum ratings are regression tests on the installed SDK
(`f35b.integration.test.ts`, "gives the published F135 rating"). Idle thrust
has no public value. It follows from the idle corrected N2 of 0.60, which comes
from the source model's `idlen2`.

In flight the FCS commands the split that balances lift fan against main
nozzle about the CG, carrying the pitch command: 1.03 at the development CG, not
the published 1.194. The in-app hover point therefore differs, for example
16,391 lbf main and 16,897 lbf lift fan at 5,000 ft and 0.99. That is the
aircraft's declared geometry, not an engine property.

## Parameter ledger

Classes: **rating** (manufacturer), **source** (the FlightGear model),
**fitted** (to a stated target), **derived**, **hypothesis** (a typical value
chosen for this class of engine, uncalibrated), **unknown**.

### Design point

| Value | Class | Basis and sensitivity |
| --- | --- | --- |
| `thrust-n` 119,583 N | fitted | Scales the design point so intermediate is 27,000 lbf static |
| `bypass-ratio` 0.56 | hypothesis | Secondary sources (about 0.57). ±10 % moves T7 by ∓19 K, thrust by 0.03 % |
| `overall-pressure-ratio` 28 | hypothesis | Secondary sources. ±10 % moves T7 by ∓13 K |
| `turbine-inlet-temperature-k` 1680 K | hypothesis | Not public. **Dominant dry-outlet unknown**: ±5 % moves T7 by ±56 K and T4 by ±84 K, thrust by under 0.2 % |
| `cooling-fraction` 0.15 | hypothesis | ±33 % moves T7 by ∓30 K |
| `accessory-power-w` 300 kW | hypothesis | Generator and pump load on the HP shaft |
| Bypass, mixer and dry-augmentor pressure losses 0.03 / 0.02 / 0.04 | hypothesis | Typical duct losses |
| `mixer-static-pressure-ratio` 0.97 | hypothesis | Sizes the mixer entry areas at design |
| Fan, compressor, HP and LP turbine efficiencies 0.87 / 0.86 / 0.89 / 0.91 | hypothesis | All ±0.02 together: T7 ∓8 K, thrust under 0.1 % |
| Turbine Stodola exponents 4 | hypothesis | Turbine flow capacity shape |

Thrust barely responds to any of these. The design-point scale absorbs them.
So the ratings cannot identify the cycle, and the dry nozzle temperature the
exhaust optics consume is uncertain by at least ±60 K.

### Shafts and start

| Value | Class | Basis and sensitivity |
| --- | --- | --- |
| LP inertia 20 kg m², design 1,047 rad/s | hypothesis | Sets the N1 and thrust response |
| HP inertia 4 kg m², design 1,570 rad/s | hypothesis | Idle to 95 % N2 takes 1.1 s at sea level. That looks fast for a turbofan; no public F135 spool time was found |
| Shaft losses 10 N m coulomb, 0.05 N m s viscous | hypothesis | Rundown and windmill |
| Starter 600 N m stall, 800 rad/s free | fitted | Motoring N2 22 %, clear of the 15 % light-off speed. A slower start via less torque left only 1 % margin there |
| `start-schedule` 2.0 → 1.0 ratio units (corrected N2 0 → 0.6) | fitted | Unlit burner at φ 0.29–0.39 against the 0.2 ignition limit, on the ground and windmilling to 30,000 ft. At 1.0 the ground start sat at φ 0.197–0.208, and windmill relight failed from 20,000 ft |
| `acceleration-limit` below idle 0.48 → 0.52 → 1.0 (corrected N2 0 → 0.4 → 0.5) | fitted | Ground start 17.5 s at sea level ISA, 14.7–26.4 s from ISA−40 to 10,000 ft ISA+30; peak start T4 ≤ 998 K. The app's expectation is 15–40 s; no published F135 start time was found. At and above idle the schedule is unchanged |
| `idle-corrected-n2` 0.60 | source | FlightGear `idlen2` 60 |
| `lightoff-n2` 0.15 | hypothesis | Igniter enable; the app's start control uses the same 15 % |

### Fuel and combustion

| Value | Class | Basis and sensitivity |
| --- | --- | --- |
| Core valve 0.05 s, 8 kg/s², 6 kg/s; manifold 0.3 kg, 0.02 s | hypothesis | The valve closes as a first-order lag, so flow decays exponentially rather than reaching an exact zero |
| Reheat valve 0.05 s, 20 kg/s², 20 kg/s; manifold 2.0 kg, 0.03 s | hypothesis | **Dominant reheat-onset unknown**: a 1.0 / 2.0 / 3.0 kg prime mass gives 0.76 / 1.24 / 1.72 s from selection to first burn |
| Core ignition delay 0.4 s; lean ignition / blowout / rich φ 0.2 / 0.06 / 3.0; half-efficiency loading 0.006 | hypothesis | Lean blowout sets the deceleration floor below |
| Reheat ignition delay 0.15 s, light-around 0.15 s; φ 0.2 / 0.1 / 1.4; minimum inlet 600 K; efficiency 0.85 | hypothesis | Ignition delay 0.075 / 0.30 s gives an onset of 1.17 / 1.39 s |
| `augmentor-lightoff-fuel-air-ratio` 0.012 | hypothesis | 0.018 shortens onset to 0.90 s |
| `augmentor-fuel-air-ratio` 0.02 → 0.03892 | fitted | 0.03892 at full demand gives 41,000 lbf |
| `deceleration-limit` 0.40 / 0.37 / 0.31 / 0.26 / 0.25 ratio units at corrected N2 0 / 0.6 / 0.8 / 1.0 / 1.1 | fitted | Keeps φ ≥ 0.075 through any throttle chop to 40,000 ft (blowout 0.06) and stays below the idle line (0.54–0.63). The first table, 0.05–0.12, was copied from the synthetic test engine and blew the core out on every part-power chop. Military to idle reaches 62 % N2 in 2.7 s |

### Controller and nozzle

| Value | Class | Basis and sensitivity |
| --- | --- | --- |
| `fan-speed-demand` 0.30 → 1.0 (throttle 0 → 0.99) | fitted | 1.0 at 0.99 so intermediate is the full-speed dry point; flat to 1.0 so reheat demand does not change the dry demand |
| `max-n2` 1.07 | hypothesis | Mechanical limit; the hover point runs at 1.061 |
| `max-turbine-exit-temperature-k` 1500 K | hypothesis | Not reached in the calibration points |
| `augmentor-minimum-n2` 0.95 (corrected) | hypothesis | Corrected since fork.20; reheat is available static to at least 40,000 ft |
| `dry-throat-area` 1.15 → 1.0 (corrected N1 0.5 → 1); area limits 0.8–1.75 of design; rate 1/s; exit-area ratio 1.05 → 1.4 | hypothesis | Generic convergent–divergent schedule |
| `lift-throat-area-factor` 1.4285 | fitted | With the bypass surrogate, the hover split 16,750 / 20,000 |
| `bypass-entry-area-factor` 0.07 | fitted | Surrogate for however the real engine holds its fan operating line in lift mode; no physical basis beyond that. Unidentified |
| `bypass-entry-door-full` 0.2 | fitted | Below a 20 % door opening the surrogate ramps in. At 1 % conversion and full throttle it kept N2 at 98–100 % instead of 83 %, and it left the 25 % conversion pulse unchanged (pitch 0.122 rad) |
| `lift-split-gain-per-sec` 24, `lift-split-washout-per-sec` 0.5, `lift-vane-min` 0.4 | fitted | Hover hold: split 1.019–1.022 over 10–20 s at constant throttle, no limit cycle |
| `max-n1` 1.04, `max-n1-gain-per-sec` 100 | fitted | Closing conversion from hover: N1 peak 104.0 % (109 % without the limit) |

### Metal temperatures

| Value | Class | Basis |
| --- | --- | --- |
| Liner: 12,000 J/K, gas station 7, bypass coolant, 600 / 700 W/K, 1.0 m², ε 0.8 | hypothesis | Effective capacities carried from the fork.14–16 thermal model; not derived from the visual shells |
| Core: 1,800 J/K, gas station 5, cooling-air coolant, 600 / 35 W/K, 0.22 m², ε 0.75 | hypothesis | As above |

### LiftSystem

| Value | Class | Basis and sensitivity |
| --- | --- | --- |
| Fan pressure ratio 2.3, efficiency 0.85, design flow 233.16 kg/s | fitted / hypothesis | Ratio and flow fitted to 20,000 lbf at the hover point; efficiency a hypothesis |
| Fan shaft 10 kg m², 785 rad/s; gear ratio 0.75 | hypothesis / derived | Gear ratio = fan design speed / LP design speed |
| Clutch 40,000 N m, slip 5 rad/s, 4/s engagement | hypothesis | |
| Inlet recovery 0.97, nozzle Cd and Cv 0.97 | hypothesis | |
| Door 2/s, roll posts 4/s | hypothesis | |
| Roll-post areas 0.02511 m² each | fitted | 1,950 lbf at the hover point |

## Checks on the installed SDK

- **Calibration.** The intermediate and maximum ratings are regression tests.
- **Reheat onset.** No wet thrust without burned reheat fuel in any scenario,
  and every step's energy ledger closes to 1.2e-7
  ([record](f135-ab-onset.md), [evidence](../../validation/evidence/aircraft/f35b/engine-plant/ab-onset/report.json)).
- **Reduced algorithm against the component reference.** Five trajectories:
  - stand cold start through reheat to cutoff;
  - hot-day high start;
  - 25,000 ft at 400 kt with throttle steps and reheat;
  - windmill cutoff and relight at 20,000 ft;
  - STOVL conversion with closing and cutoff.

  Worst differences: 1.3e-6 of full scale in force, spool speed and fuel;
  0.0014 K at stations 4, 5 and 7 and both metals. Every ignition, flameout
  and reheat event falls in the same step. The gates are 1 % and 5 K. Work per
  accepted step: the reduced algorithm uses 10–12.5 residual evaluations
  against the component reference's 24–31, at most 49 against 65; resident
  data 22.8 KiB against 1.6 KiB
  ([evidence](../../validation/evidence/aircraft/f35b/engine-plant/algorithms/report.json);
  `scripts/validation/f35b/check-f135-plant-algorithms.mjs`).
- **Integrated handling scenarios** (`f35b.integration.test.ts`):
  - conversion from 60 kt stays within 0.15 rad pitch (0.063 rad in the native calibration probe);
  - control pulses at 25/50/75 % conversion stay within 0.25 rad pitch;
  - the reheat interlock deselects on the step conversion becomes positive,
    and reheat burns out within 0.5 s;
  - a zero-time converted initialization is dry at 0–300 kt;
  - a cut-off lift fan spools down giving up rotor energy on every step;
  - snapshot restore puts the plant back in its exact transient state and
    refuses a record from another configuration.

## Limits

- Not an F135 identification. Internal temperatures, pressure ratios, fuel
  split, inertias, valve and ignition times and the lift-mode surrogate are
  hypotheses or fits to totals. The exhaust optics consume T7 and burned fuel,
  so their uncertainty carries into appearance. Their dominant unknowns are
  turbine inlet temperature and, for reheat onset, the reheat manifold volume.
- Each inlet sees the flight's total pressure whatever its orientation. A
  lift-fan door open in a vertical descent therefore takes ram air from
  below, which a top-mounted inlet would not.
- A throttle step at 50 % conversion overshoots N1 to about 104 % and dips N2
  to about 83 % for about 2 s while the guide vanes shed the fan's load. The
  split holds within 3.7 % after 2 s and within 1 % once settled.
- At 1 % conversion the FCS asks for a pitch-balancing split that the
  barely-open lift fan cannot deliver. The loop opens the throat instead, and
  main thrust drops by about 6,000 lbf compared with conventional flight.
- Ten-percent conversion at 60 kt was not stable in a calibration probe;
  the integration tests cover 25, 50 and 75 %.
- No wall-clock timing, display, GPU or sound-device check was run.
