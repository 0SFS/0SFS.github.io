# F135 dry-glow and powered-lift follow-up investigation

Recorded 2026-10-08. Owner: **0sfs** for this aircraft investigation and its
handoffs; native plant corrections belong to **JSBSim**. This record adds user
observations, a source audit and an untimed optical sensitivity calculation.
No engine, optical, sound, UI or CI runtime behavior was changed here.

## User observations and current acceptance

- The user describes the coupled plant's AB visual/sound match as **perfect**.
  This is subjective acceptance in their local test, without captured device
  timing. Preserve it while investigating other problems.
- Dry red glow is much lower than the empirical model. It becomes stronger
  during spool-up, then falls too far at sustained high power in the user's
  assessment. The carrier footage remains a qualitative constraint on sustained
  visible emission; it does not supply calibrated radiance or engine telemetry.
- In full-throttle VTOL, N1/N2 and thrust reportedly oscillate continuously;
  the described spool range is about **92–107%**. Forward flight at speed works
  better. Selecting the component algorithm did not visibly help.
- Hover capability reportedly now requires roughly below **20% fuel**, compared
  with about **30% internal fuel** before. Exact tank basis, loaded stores, gross
  mass, CG, atmosphere, height and commanded/attained conversion are unrecorded.
  This is a loss-of-lift report, not a CPU-performance measurement.

The latest powered-lift report is broader than the previously documented brief
partial-conversion overshoot. A rating-point match and component/reduced agreement
do not accept sustained oscillation in a dynamically entered hover. The actual
algorithm and fallback trace still need verification before treating the user's
mode comparison as a controlled experiment.

## Identities and scope

The inspected app HEAD is `3334758682d9852eaac916ea29bb8de4cf8e41ad`; its model
selector offers the coupled F-35B and the retained empirical aircraft package.
The coupled calibration record identifies installed SDK **fork.20**, native
source **ea6956b4**. The working trees contain concurrent edits; this investigation
does not stage or overwrite them. Optical input/source hashes are retained in
the [calculation record](../../validation/evidence/aircraft/f35b/dry-glow-regression-2026-10-08/temperature-sensitivity.json).

The comparison below reads two existing onset records with different SDK/source
identities. It is useful evidence of a changed input, **not** a fresh same-SDK,
equal-thrust, full-VTOL model comparison. No native simulation was rerun here.

## A demonstrated source of dry dimming

The retained `cold-then-hot-dry` scenarios both capture the state before AB
selection, after the held sea-level dry warm-up. Read `/scenarios/1/before` in
the [empirical fork.16 record](../../validation/evidence/aircraft/f35b/ab-onset-2026-10-07/integer-clock-reviewed/report.json)
and [coupled fork.20 record](../../validation/evidence/aircraft/f35b/engine-plant/ab-onset/report.json).

| Quantity | Empirical record | Coupled record |
| --- | ---: | ---: |
| Optical mean-gas input | 1004.779 K | 852.737 K |
| Main thrust | 26,645.9 lbf | 26,999.9 lbf |
| Total fuel flow | 2.97212 kg/s | 2.40935 kg/s |
| Upstream input, converted from EGT | 1004.779 K | 1059.095 K |
| Liner temperature | 665.661 K | 624.372 K |
| N1 / N2 | 99.3 / 99.6% | 100.0000 / 99.9958% |
| Burned reheat fuel | 0 | 0 |

A controlled calculation then used the **same current optical function and
profile**, changing only the mean-gas temperature. Fixed inputs were 288.15 K
ambient, 101325 Pa, 1000 K upstream, 3 kg/s total fuel, zero burned reheat,
radius 0.5 m and length 6 m. The default 64 × 32 source field contains exterior
support only; there is no posed engine hardware or receiving deck.

| Imposed temperature | Exterior source photopic intensity |
| --- | ---: |
| 1004.779 K | 0.02047048 cd |
| 852.737 K | 0.000318974 cd |
| 792.737 K, lower sensitivity point | 0.0000408748 cd |
| 912.737 K, upper sensitivity point | 0.00192745 cd |

The first two differ by **64.176×**, or **6.004 EV**. The calculation uses
`evaluateEngineGasOptics` and integrates its exterior RGB intensity with the
photopic weights recorded in the JSON; the runtime gamut mapping preserves Y.
All four results are valid, use the same **0.025/m** absorption without an active
power cap, and emit zero CH/C2 power. Thus temperature alone can produce a large
drop in this source model; reduced fuel flow is not the cause of this isolated
comparison. The ±60 K cases show sensitivity, not a confidence interval.

This is **source intensity before visibility/occlusion**, not escaped radiance,
deck illuminance or screen brightness. It does not establish that the physical
F135 should emit either level, reproduce the newly reported transient, or prove
the full in-game difference has only one cause. A reusable permanent diagnostic
and same-SDK native-to-optical matrix remain deliverables of the handoff.

## The incomplete native-to-optics boundary

The current [aircraft catalog](../../src/flight/aircraft/aircraftCatalog.ts)
still selects `thermal/nozzle-gas-temperature-k` and uses `egt-degc` as upstream
temperature. In native `FGTurbinePlant.cpp`, the thermal alias now returns
**station 7 total temperature**, and EGT is a lagged station-5 observation.
The native plant also exposes nozzle exit-static temperature/pressure, Mach,
flow and area. The optical adapter does not yet migrate to that full contract.

The [optical implementation](../../src/flight/aircraft/engineGasOptics.ts)
labels the temperature as an imposed gas-bath proxy. For this profile it applies
no further nozzle expansion; it continues the bath upstream and applies a
downstream mixing profile. For zero reheat burn it does not use a dry hot/cold
particle-temperature distribution. The cooler mixed station-7 mean therefore
feeds directly into the thermal source.

This is a semantic/modeling gap, not evidence of a Kelvin conversion bug. The
plant can have a hotter core turbine exit and a cooler mixed station 7. Simply
replacing T7 with exit-static temperature is not a brightness remedy or a complete
particle model. Mean gas enthalpy, local temperature distribution, particle
temperature/loading, expansion and residence must be reconciled explicitly.

The original [plant specification](../proposals/engine-plant-implementation.md)
already required station/pressure/composition migration in sections 9–10. Reopen
that incomplete optical-integration gate while retaining the successful native
conservation and AB-causality work. The [calibration ledger](f135-engine-plant.md)
also states that public thrust ratings do not identify the internal temperatures;
its turbine-inlet and cooling assumptions substantially affect dry outlet T7.
Conservation and a more detailed model alone cannot decide which dry glow is
closer to reality.

## Why existing tests did not catch it

- [Optical unit tests](../../src/flight/aircraft/engineGasOptics.test.ts) exercise
  a fixed dry temperature around 1003.128 K. They validate the optical function
  without detecting that the installed engine now supplies about 853 K.
- [Joint onset tests](../../src/flight/audio/f135ExhaustOnset.integration.test.ts)
  check first burned reheat, reaction light, shipped audio behavior and energy.
  They do not guard the steady dry continuum or its peak-to-settled ratio.
- The [empirical model check](../../scripts/validation/f35b/check-f135-empirical-engine-model.mjs)
  compares model behavior including thrust/augmentation, without a comprehensive
  dry native-to-emission comparison.
- Component/reduced agreement compares two algorithms within the same plant.
  Shared controller, station or particle-model errors can pass that comparison.
- The existing 60-second hover test starts from a zero-time solved converted
  state at 0.98 throttle, 1,000 ft and clean stores. It checks attitude/altitude
  once per second but does not bound per-step spool or thrust ripple. The
  algorithm-comparison converted hold is only six seconds at 0.98. Neither
  establishes stability after the reported full-demand entry sequence.

Required regression coverage must exercise actual installed observations through
the production adapter, preserve physical invariants independently of historical
brightness, and flag large dry changes before a new baseline is accepted.

## Powered-lift investigation priorities

The current native controller shares its logic between component and reduced
algorithms. Code inspection identifies candidate feedback interactions: fuel
governor and speed limiting, LiftSystem shaft extraction/clutch state, guide
vanes and nozzle split control, and the aircraft's pitch/CG-dependent split
request. The fitted hover point is already close to the declared N2 ceiling.
These are hypotheses for a causal trace, **not a reproduced root cause**.

Reproduce full-throttle dynamically entered hover as well as zero-time initialized
hover, distinguishing 1.0 lever demand under AB inhibition from the 0.99 rating
case. Capture commands, actuator attainment, limit activity, shaft/gas energy,
station conditions and actual solver work. Separate held-stand dynamics from
free-aircraft pitch and height feedback. Account for main, fan and roll-post
forces, orientation, inlet momentum and weight once each. Compare fuel cases
using actual mass/CG, not a percentage slider alone.

Do not accept a steady optical baseline from a nonstationary engine. Align dry
source histories with temperature, flow and shaft work during both acceleration
and the full-power hold; a correlation with spool acceleration is not by itself
a physical emission law. No arbitrary brightness floor, persistence or controller
smoothing may conceal a failed plant operating point.

## Handoffs and qualification

1. [Powered-lift stability and lift accounting](../f135-powered-lift-stability-prompt.md):
   reproduce and correct the sustained VTOL behavior in its owner.
2. [Dry-emission validation and physical correction](../f135-dry-emission-validation-prompt.md):
   station migration, paired scenarios, transient attribution and permanent tests.
   Share traces with the plant task; coordinate writes and SDK adoption.
3. [Engine-tab redesign](../engine-tab-redesign-prompt.md): two parent sections,
   unified live-variable grid, grouped/separate plots and compact readings.
4. [CI correctness/performance follow-up](../../../foss-earth/docs/ci-correctness-performance-followup-prompt.md):
   file-backed dependency coverage, test typechecking, fixture correctness and
   equivalent-state timing. A later disk review found no new implementation or
   evidence requiring a duplicate follow-up prompt.

This investigation ran four untimed optical evaluations and reviewed retained
records/source. No suite, native/WASM build, browser, server, GPU run, timing
benchmark or deployment was performed. The changes are documentation and retained
evidence only. **Physical correctness, VTOL stability, rendered dry appearance
and performance remain unqualified by this investigation.** The user's subjective
AB acceptance remains recorded separately.
