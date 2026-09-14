# SF50 G1 cruise conditions and fuel-flow diagnostic — 2026-09-13

This phase closed the open historical G1 AFM cruise condition gates from the
primary source, found and fixed a generic steady-propulsion gap in JSBSim, and
ran the first narrow fuel-flow diagnostic at observed AFM N1.

**No coefficient was fitted.** No recording or AFM row became eligible for
calibration or independent validation. G2/G2+/G3 remain provisional. No aircraft
XML, UI, catalog or app dependency was changed.

## 1. Resolved AFM condition gates

Machine-readable record:
[`afm-cruise-conditions-2026-09-13.json`](../../planes/Cirrus_Vision_Jet/tests/public-evidence/afm-cruise-conditions-2026-09-13.json).
Source is the pinned primary AFM P/N 31452-001 Revision 4, SHA-256
`d83e904dbd6bc3656321c93d793166d4a5c6eddf81852b15767e5c336fc23949`, read locally
with `pdftotext -layout`. No new acquisition and no third-party transcription.

| Gate | Outcome |
| --- | --- |
| Altitude meaning | **Resolved.** Cruise `Alt FT` is pressure altitude. Printed 1-15 defines standard temperature at a given pressure altitude; the ISA chart on printed 5-8 and the climb/takeoff-climb tables are all indexed by `Press Alt`; and the cruise table's own Δ ISA/OAT pair is that same standard-temperature relation. The cruise heading itself still prints only `Alt FT`. |
| Atmosphere convention | **Resolved, with a recorded internal inconsistency.** The AFM's ISA is a dry perfect gas at 15 °C / 29.92 inHg sea level, and its standard temperature falls 2 °C per 1,000 ft. That rule reproduces every reviewed OAT below 28,000 ft, including −37 °C at 26,000 ft where the true lapse rate would give −36.5 °C. |
| Cruise configuration | **Not printed; inference recorded.** The Cruise Performance section carries no Conditions block at all. Gear UP / flaps UP follows the normal-procedures basis on printed 5-5, the flap/thrust-noting rule on printed 5-6, the climb Conditions blocks, and the AFM's practice of labelling its one non-clean set explicitly as `Gear UP, Flaps 50%`. |
| Cruise anti-ice and bleed | **Unresolved.** The cruise checklist states only Thrust Lever A/R, Ice Protection A/R, EIS MONITOR. Takeoff publishes separate anti-ice OFF/ON N1 schedules; cruise publishes no such distinction. Bleed is continuous and not pilot-scheduled, and no cruise extraction is published. Anti-ice OFF is used as a recorded assumption. |
| AFM fuel volume | **Resolved.** AFM gallons are US gallons: the same cruise table prints specific range in `Nm/10 U.S. Gal`, the arithmetic closes (268/114 → 23.5 vs printed 23.6; 295/99 → 29.8 vs printed 29.9), climb prints `Fuel (U.S. gal)`, and Section 5's conversion chart is US gallons to litres. This resolves the AFM only; the dashboard's `gal/Hr` caption stays unqualified and its US-gph target stays null. |

### The −40 versus −41 °C conflict is explained, not eliminated

Every reviewed 28,000-ft entry is exactly 1 °C warmer than the AFM's own
2 °C/1,000 ft rule — cruise prints −20/−30/−40/−50 °C for Δ ISA +20/+10/0/−10
where the rule gives −21/−31/−41/−51, and both the ISA and ISA+10 cumulative
climb tables are 1 °C warmer at 28,000 ft. The general chart on printed 5-8
prints −41 °C. The true 1.98 °C/1,000 ft lapse rate gives −40.44 °C, which
rounds to the tables' −40. The offset is uniform across the whole 28,000-ft
block, not a single typo. **Preserve both printed statements.**

Separately, printed 5-6 says the section's charts cover −20 °C to 40 °C ambient,
while the reviewed cruise and climb tables publish −50 °C entries and the takeoff
climb tables grid −40 °C to 50 °C. That statement does not bound the reviewed rows.

## 2. A generic steady-propulsion gap, fixed in the owning layer

Before implementing anything, the needed capability was inspected. JSBSim already
evaluates propulsion at a frozen condition with zero-time trim (`run_ic()` with
integration suspended, which is also what `propulsion/set-running` performs
internally). `forces/hold-down` is not usable here: it zeroes body velocities.

`FGTurbine::Trim()` computed steady thrust and, after PR #1505, steady spool
speeds — but **never assigned `FuelFlow_pph`**. Every zero-time evaluation
therefore reported the *previous* operating point's fuel flow. On the standard
F16 fixture the trimmed value was wrong by factors of 0.21 to 9.3 across
throttle settings, and trimming several settings in turn returned each earlier
value.

This is generic engine behaviour, so it was fixed in JSBSim rather than worked
around in the SF50 package or the application. Branch
`fix/turbine-trim-fuel-flow`, commit `7511df10cda909c32dfc378dfde204eb44dc5a48`,
based on `fix/turbine-trim-spool` (`07eba55f`, PR #1505) as a declared
prerequisite. Trim now assigns the same steady products `Run()` seeks — the
pre-bleed dry thrust times the corrected TSFC floored at the idle flow, and the
augmented thrust times ATSFC in whichever augmentation branch applies — and
updates `N2norm` before TSFC is evaluated so a TSFC parameter sees the operating
point being trimmed.

`tests/TestTurbineTrimFuelFlow.py` adds three methods: a trimmed value cannot be
sought away by the next frame, repeated trims are independent of request order,
and the reported TSFC follows its own operating point. **All three fail before
the change.** After it, 13 of 13 CTest targets pass, including the new one:
model loading, model reload, sim-time reset, hold-down, trim, aero-function
output and frame, turboprop, indexed engine properties, turbine, turbine trim
spool, turbine trim fuel flow and ground reactions. Trim still leaves EGT, oil
pressure, nozzle position and EPR at their previous values; that is recorded,
not fixed here.

This fix is **not yet in the application's installed package**, which remains
`@felipegalind0/jsbsim-wasm@1.2.4-fork.4`. The diagnostic below runs against the
native engine at the recorded clean revision. No app-runtime claim is made from it.

## 3. The narrow fuel-flow diagnostic

[`scripts/diagnose-sf50-cruise-fuel-flow.py`](../../scripts/diagnose-sf50-cruise-fuel-flow.py)
evaluates the installed SF50 propulsion model at imposed AFM cruise conditions.

Imposed per row, with the residuals asserted by the script: pressure altitude
(solved through the geometric altitude, because the temperature offset shifts
the hydrostatic pressure profile), the printed static OAT (through an explicit
`atmosphere/delta-T` on JSBSim's standard atmosphere, since JSBSim uses the true
1.98 °C/1,000 ft lapse rate and the AFM uses 2 °C/1,000 ft — both are recorded
per row), the printed true airspeed, gear and flaps up, and the printed observed
N1 through throttle position, because the package's turbine maps N1 linearly
between its idle and maximum endpoints. **An AFM N1 observation is not a TLA
command, and this is not a FADEC schedule.** Mach is computed by JSBSim from the
imposed TAS and static temperature; the AFM prints no Mach.

Installed-thrust tables, rated thrust, TSFC 0.65, bleed 0.04 and every
aerodynamic coefficient were held fixed. The airframe is not trimmed and no
equilibrium is claimed. Airframe weight is not an input to a steady propulsion
evaluation; the row's 6,000 lb enters only through its printed N1 and TAS.

Command and full output:
`planes/Cirrus_Vision_Jet/tests/public-evidence/derived/g1-cruise-fuel-flow-2026-09-13-v1/cruise-fuel-flow.json`.

| Target row | N1 % | TAS kt | Mach | Model thrust lbf | Model TSFC | AFM US gph | Model US gph | Model / AFM |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `g1-cruise-6000-5000-0-MCT-93.8` | 93.8 | 268 | 0.4124 | 1221.9 | 0.6247 | 114 | 118.0 | 1.035 |
| `g1-cruise-6000-5000-0-tabulated-part-power-86.5` | 86.5 | 234 | 0.3601 | 986.1 | 0.6463 | 88 | 98.5 | 1.119 |
| `g1-cruise-6000-5000-0-tabulated-part-power-78.9` | 78.9 | 199 | 0.3062 | 767.6 | 0.6858 | 68 | 81.4 | 1.196 |
| `g1-cruise-6000-5000-0-tabulated-part-power-71.4` | 71.4 | 164 | 0.2523 | 581.9 | 0.7419 | 54 | 71.4 | 1.323 |
| `g1-cruise-6000-15000-0-MCT-98.1` | 98.1 | 295 | 0.4712 | 1070.1 | 0.5967 | 99 | 98.7 | 0.997 |
| `g1-cruise-6000-15000-0-tabulated-part-power-91.8` | 91.8 | 260 | 0.4153 | 914.8 | 0.6060 | 78 | 85.7 | 1.098 |
| `g1-cruise-6000-15000-0-tabulated-part-power-85.3` | 85.3 | 224 | 0.3578 | 763.8 | 0.6275 | 62 | 74.1 | 1.195 |
| `g1-cruise-6000-15000-0-tabulated-part-power-79.2` | 79.2 | 189 | 0.3019 | 635.3 | 0.6589 | 50 | 71.4 | 1.429 |

Fuel-volume convention sensitivity is 0.30 % (JSBSim's JET-A 6.74 lb/US gal
versus the AFM's nominal 6.76), recorded per row and far smaller than the
differences above.

### What the diagnostic identifies

**(a) The estimated idle fuel-flow floor is above published cruise fuel flow.**
The two lowest-power rows both return exactly 481.54 pph / 71.44 US gph. The
script detects this from the model's own outputs — reported flow exceeds dry
thrust × TSFC — rather than assuming it. That floor is JSBSim's generic
`pow(MilThrust, 0.2) × 107` estimate, which for 1,846 lbf rated thrust lands
above the AFM's printed 54 and 50 US gph at those conditions. Those two rows are
**clamped and never exercise the thrust × TSFC path at all**. An aircraft
cruising at 189 KTAS cannot burn more fuel than one at 295 KTAS, so this is a
structural defect in the package's engine description, independent of the
assumed thrust map.

**(b) Above the floor, the fuel-flow-versus-N1 shape is too flat.** The model is
within 3.5 % at 5,000 ft MCT and 0.3 % at 15,000 ft MCT, then runs
progressively high as N1 falls: +11.9 %, +19.6 % at 5,000 ft and +9.8 %, +19.5 %
at 15,000 ft. The modelled thrust is quadratic in normalised spool while the
simplified TSFC rises steeply as it falls (0.597 → 0.742 across these rows),
partially cancelling the thrust reduction.

### What it does not identify

Fuel flow here is *modelled thrust times TSFC*. Agreement at MCT does not
validate either factor, and disagreement at part power cannot be attributed to
TSFC rather than to the installed-thrust map. **Do not fit TSFC to close these
differences.** The reviewed rows are same-source calibration candidates whose
conditions remain unapproved, with anti-ice and bleed still unresolved and no
established uncertainty or pass tolerance. This is a diagnostic, not a test.

## 4. Also executed in this phase

The previous phase's prepared-but-unexecuted evidence gates were run: 58 tests
in 5 files (`sf50ExpandedEvidence`, `sf50PublicEvidence`, `sf50AfmData`,
`sf50Variants`, `aircraftCatalog`) passed, and the whole
`src/flight/validation` suite passed at 102 tests in 13 files. These are
software gate results, not aircraft evidence.

## 5. Remaining blocked or estimated

- Cruise anti-ice state and installed bleed extraction are still not published.
  The model's 4 % bleed thrust loss remains an unsourced estimate.
- Installed thrust and TSFC remain unseparated, as does drag.
- Loading/CG applicability for the reviewed rows, the reviewed datum anchor,
  inertia, control response and friction are unchanged and still estimates.
- Idle N1/N2 30/60 and max N1/N2 100/100 remain estimates. The reviewed 100.4 %
  MCT row at 28,000 ft still sits above the 100 % endpoint; the 104.7 % limit is
  not a replacement schedule.
- Zero independent validation rows exist. The 600 fitting candidate / 220
  whole-condition ISA+10 same-source check allocation is unchanged.
- Cached normalized/candidate outputs under
  `derived/variant-calibration-2026-09-12-v1/` still carry the old fuel label and
  OAT disclaimer; the review ledgers govern interpretation. That run was not
  overwritten.

## 6. Next concrete step

1. Decide the idle fuel-flow treatment for the SF50 package. The floor is
   generic JSBSim behaviour driven by rated thrust, and the aircraft-specific
   idle flow belongs in `engine/fj33_5a.xml` — but a source-backed idle fuel
   flow for the FJ33-5A has not been found. Either locate one, or record an
   explicit estimate with its basis. Do not pick a value that merely makes the
   two clamped rows agree.
2. Only then revisit the part-power shape, and only with installed thrust and
   TSFC treated as the coupled pair they are.
3. Adopt the JSBSim trim fuel-flow fix into the application package when the
   SF50 engine work is ready, so the engine change and any schedule change reach
   the app together rather than in two dependency cycles.
4. Upstream `fix/turbine-trim-fuel-flow` under the contribution policy, after
   #1505 (its declared prerequisite) is resolved. Do not duplicate #1505.
