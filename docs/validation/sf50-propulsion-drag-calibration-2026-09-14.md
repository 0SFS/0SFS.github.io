# SF50 propulsion and drag calibration, and stall protection — 2026-09-14

This phase fitted the FJ33-5A thrust schedule and the SF50's parasite drag to
AFM cruise and climb tables, set idle spool speeds and idle fuel flow from
recorder evidence, and added the angle-of-attack stall warning and stick pusher
the aircraft has and the model did not.

**This is a calibration, not a validation.** Coefficients were changed, so the
AFM rows used to fit them can no longer test them. Held-out rows, and rows the
fit never saw, carry what evidence there is. No independent source confirms the
result, and nothing here makes the package a certificated or validated
simulation.

## 1. What was wrong

The model climbed and cruised too strongly at altitude, and its part-power
behaviour did not match the AFM's printed N1 at all. Against the rate-of-climb
tables on printed 5-39..5-46, at the AFM's own MCT N1, the model's rate of climb
ran from 0.85 of the book at 4,000 ft to 1.66 at 28,000 ft — a systematic trend
with altitude, not scatter.

`scripts/separate-sf50-thrust-drag.py` established that a single thrust factor
and a single drag shift could not both be blamed: the excess was also temperature-dependent, −0.6 to −0.8 % per °C.

## 2. Method

`scripts/calibrate-sf50-propulsion-drag.py`. Every row is solved as the model's
own zero-time equilibrium — body accelerations driven to zero by a damped Newton
step on three unknowns — so a fitted row is a flight condition the model can
actually hold, not a table lookup. The excess thrust-minus-drag at each row is
linear in each parameter, so the fit is least squares, re-linearised until it
settles.

Fitted:

| Family | Parameter |
| --- | --- |
| `columns-above-sl` | MilThrust density-altitude column scales at 10,000, 20,000 and 30,000/40,000 ft |
| `mach-lapse` | one Mach lapse coefficient, `kM` |
| `temperature` | one temperature coefficient on MilThrust, `kT` |
| `cd0` | a constant shift of the CD0 table |
| `shape` | MilThrust against N1, a table with seven breakpoints, 1 at the rating point |

Held fixed, on purpose:

- **Sea-level static thrust.** The −10,000 ft and sea-level columns are the
  pre-calibration estimate. The rated 1,846 lbf of EASA.IM.A.615 anchors them.
  Freeing them made the problem unidentifiable: thrust level and drag level
  trade off exactly at a single altitude, and the runs that tried it either
  worsened the held-out check or diverged.
- **Induced drag.** Freeing the induced-drag factor alongside CD0 did not
  improve the check.
- **Idle spool speeds**, from the ERA22LA404 recorder: 24.3 % N1, 53.4 % N2
  across 84 ground-idle samples with the thrust lever at −22°.
- **Idle fuel flow**, from the WPR20FA051 recorder: 76 lbm/hr.

Stage 2 then fitted TSFC alone: each cruise row is flown level at the printed
TAS and the TSFC reproducing the printed fuel flow is fuel mass flow over thrust
before bleed. JSBSim's built-in TSFC is `tsfc * sqrt(T/389.7) * (0.84 +
(1-N2norm)^2)`; the temperature correction is kept and the spool-speed
polynomial replaced by a fitted table, whose lowest point is anchored at the
recorded ground idle.

### Holdouts

Following the project record, **ISA+10 cruise rows are same-source checks and
were never fitted**, and climb rows between ISA+5 and ISA+15 were held out the
same way. Tabulated part-power and max-range cruise rows were not used in stage
1 at all, so they test the N1-to-thrust shape the fit never saw.

576 rows were fitted; 208 were held out. Fit RMS 20.3 lbf, held-out RMS
16.2 lbf. The check being no worse than the fit is the evidence that the five
parameters are not absorbing noise.

## 3. What was written

`engine/fj33_5a.xml`: the MilThrust altitude/Mach table, the temperature term,
the N1 shape table, the TSFC table, idle N1/N2, and `<idlefuelflow>`.
`aircraft/sf50/sf50.xml`: the CD0 table shifted by −0.00258. The generated G2 and
G3 packages were rebuilt from the canonical G1 baseline, which is all they have
ever been.

| Parameter | Value | Standard error |
| --- | --- | --- |
| column scale, 10,000 ft | 0.8666 | 0.0081 |
| column scale, 20,000 ft | 0.7763 | 0.0063 |
| column scale, 30,000/40,000 ft | 0.6691 | 0.0072 |
| Mach lapse `kM` | −0.1820 | 0.046 |
| temperature `kT` | −0.001635 /°R | 8.9e−5 |
| CD0 shift | −0.00258 | 0.00035 |
| N1 shape at 65 / 80 / 90 / 95 % | 0.7202 / 0.7282 / 0.8335 / 0.9232 | 0.022 / 0.0088 / 0.0056 / 0.0055 |

The N1 shape is the part that is least like a physical quantity. JSBSim takes
thrust from the square of normalised spool speed, which is too flat for this
engine's printed part-power rows; the table reshapes available thrust with N1.
It is a curve fit inside an engine model, not a measured compressor map.

## 4. Result

### Climb, at the AFM's own MCT N1 (556 rows, printed 5-39..5-46)

| Pressure altitude | Model/AFM before | after |
| --- | --- | --- |
| 0 ft | 0.87 | 0.98 |
| 4,000 ft | 0.85 | 0.98 |
| 8,000 ft | 0.99 | 1.05 |
| 12,000 ft | 1.20 | 1.15 |
| 16,000 ft | 1.34 | 1.18 |
| 20,000 ft | 1.40 | 1.10 |
| 24,000 ft | 1.48 | 1.06 |
| 28,000 ft | 1.66 | 1.01 |

Median across all rows 1.34 → 1.05. The altitude trend is gone; a mid-altitude
bulge of about 15 % remains, largest at 12,000–16,000 ft, and the widest rows are
at extreme temperatures where no cruise data constrains the fit.

### Cruise (10 MCT rows solved as level flight)

Model N1 minus AFM N1: median −1.98 → −0.54, worst 6.45 → 1.65.

Over the full fitted and held-out set, at the calibrated model:

| Set | Rows | N1 model−AFM, median | RMS | Fuel flow ratio, median |
| --- | --- | --- | --- | --- |
| cruise MCT, fitted | 92 solved / 120 | −0.12 | 0.62 | 0.992 |
| cruise MCT, held out | 38 / 40 | +0.05 | 0.62 | 0.999 |
| max range, never fitted | 40 / 40 | +0.55 | 0.75 | 1.019 |
| tabulated part power, never fitted | 80 / 80 | −0.34 | 0.58 | 0.976 |
| climb, held out | 48 | — | — | ROC ratio 0.989 |

### Cruise fuel flow at imposed AFM N1

`scripts/diagnose-sf50-cruise-fuel-flow.py`, model over printed:

| Row | Before | After |
| --- | --- | --- |
| 5,000 ft MCT 93.8 % | 1.035 | 1.134 |
| 5,000 ft part power 86.5 / 78.9 / 71.4 % | 1.119 / 1.196 / 1.323 | 1.059 / 1.015 / 1.000 |
| 15,000 ft MCT 98.1 % | 0.997 | 1.026 |
| 15,000 ft part power 91.8 / 85.3 / 79.2 % | 1.098 / 1.195 / 1.429 | 1.037 / 1.001 / 1.008 |

The two lowest rows were previously clamped at the derived idle-flow floor and
are now reachable. The one row that got worse is the 5,000 ft MCT row: this
diagnostic imposes the printed N1 without trimming the airframe, so the model
produces more thrust than level flight needs there and burns fuel for it. The
same row solved as level flight is within 1 %.

### Takeoff and landing

`node scripts/validate-sf50.mjs`, unchanged in character: every takeoff metric
and every landing ground roll and total distance within the 15 % benchmark
tolerance; the two landing airborne distances that already failed still fail, at
−15.5 % and −18.8 %. Static thrust 1,771.9 lbf, −4.0 % of the rating, inside the
5 % diagnostic tolerance and unchanged by this work, as the sea-level column was
held fixed.

## 5. Stall warning and stick pusher

The SF50 has an angle-of-attack stall warning and a stick pusher, and the AFM's
Section 5 stall speeds are pusher activation speeds, not aerodynamic stall. The
model had neither, and would fly past the book speeds to its own lift-curve peak
at 16.0° — 5 to 6 kt slow, and with no cue of any kind.

Thresholds are this model's own angle of attack at the printed speeds, solved at
1 g over the AFM's four weights, and at 5 kt above them for the warning:

| Flaps | Pusher AoA | spread over weight | Warning AoA | spread |
| --- | --- | --- | --- | --- |
| 0 % | 11.10° | 0.12° | 9.49° | 0.18° |
| 50 % | 10.34° | 0.18° | 8.14° | 0.27° |
| 100 % | 12.50° | 0.87° | 8.69° | 0.50° |

Because the spread across weight is small, a flap-position schedule is enough;
no weight input is used. Both functions inhibit on weight-on-wheels. Each
threshold drops while its own function is active — 0.5° for the warning, 2.0°
for the pusher — which latches it through the recovery instead of chattering at
the edge. The pusher commands nose-down from 0.35 of full travel at activation,
harder with overshoot, capped at full.

Flown as the AFM demonstrates it — idle, wings level, altitude held, about one
knot per second — at 6,000 lb and 8,000 ft:

| Flaps | AFM stall | warning fires | pusher fires |
| --- | --- | --- | --- |
| 0 % | 86 KCAS | 91.2 KCAS | 86.0 KCAS |
| 50 % | 77 KCAS | 82.5 KCAS | 77.1 KCAS |
| 100 % | 67 KCAS | 72.0 KCAS | 66.0 KCAS |

Holding full aft stick after that, the pusher holds the aeroplane at its
threshold angle of attack in a descent instead of letting it stall. Takeoff
rotation and the landing flare are unaffected: every `validate-sf50.mjs` metric
is as above.

This models the *effect* a pusher has on the flight path. It is not the SF50's
stall protection system: no published activation logic, force, rate, envelope
inhibit or reset behaviour was available, and there is no aural warning, shaker
or CAS integration here beyond the `fcs/stall-warning` and `fcs/stick-pusher`
properties the instruments read.

## 6. What this does not establish

- **Nothing here is independently validated.** The AFM rows used in the fit can
  no longer test the model. The held-out sets are same-source checks: they come
  from the same document, produced by the same manufacturer process.
- **Installed thrust is still not identified.** Fuel flow is the model's own
  thrust times TSFC, so matching printed fuel flow does not separate the two.
  Bleed remains a flat 4 % and no cruise extraction is published.
- **The N1 shape and the temperature term are curve fits**, chosen because they
  reproduce printed rows, not because a source describes the engine that way.
- **Mid-altitude climb still runs about 15 % high** at the AFM's MCT N1.
- **Two landing airborne distances remain outside tolerance**, unchanged by this
  work.
- G2 and G3 remain the G1 baseline under different names.

## Reproducing

```
python3 scripts/calibrate-sf50-propulsion-drag.py \
  --native-build <jsbsim build> --jsbsim-source <jsbsim checkout> \
  --families columns-above-sl,mach-lapse,temperature,cd0,shape \
  --base-revision 08084ae9 --out build/validation/<new directory>
```

Outputs carry printed AFM values and belong in the gitignored
`build/validation/` tree. The candidate packages this phase adopted were written
from that run; the diagnostics quoted above are
`scripts/diagnose-sf50-steady-flight.py`,
`scripts/diagnose-sf50-cruise-fuel-flow.py` and `scripts/validate-sf50.mjs`.
