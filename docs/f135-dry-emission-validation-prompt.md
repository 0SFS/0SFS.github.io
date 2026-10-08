# Investigate and validate F135 dry exhaust emission across engine models

Date: 2026-10-08. Implementation handoff. Work in `/Users/felg/gh/0sfs`; read
`AGENTS.md` and the owner's instructions before editing any sibling. Preserve
existing and concurrent work. This is a physical investigation and regression-
coverage task with evidence-driven corrections, not a request to raise brightness.

## Latest user observation and objective

The user tested the coupled plant and describes its **AB visual/sound match as
perfect**, but the **dry glow is much lower** than with the empirical model.
Record this as subjective acceptance of the tested AB behavior and a dry-emission
regression report. Device conditions and a synchronized recording were not
supplied; do not manufacture quantitative perception results.

The subsequent report adds that dry red emission becomes much stronger while
spooling up, then falls too far at sustained maximum power. In full-throttle
VTOL, N1/N2 and thrust reportedly keep oscillating, with spool readings roughly
92–107%, and available lift has fallen: the user describes needing roughly below
20% fuel where about 30% internal fuel previously worked. The exact tank basis,
gross mass, environment and trace are not captured. Component mode appeared the
same to the user. These are observations to reproduce, not measured cycle data.

Coordinate with the [powered-lift stability handoff](f135-powered-lift-stability-prompt.md).
Stability and lift accounting take priority over accepting a new steady VTOL
optical baseline. Share captured native histories and assign one writer per
native/profile/adapter file. Optical investigation can proceed on held forward
cases and recorded transients while the plant issue is being resolved.

Determine why dry emission changed, which parts of either model are supported
by physical evidence, and what remains unidentifiable. Implement comprehensive
native-to-optical regression coverage so a substantial dry-emission change is
reported during engine development, before the user discovers it visually.
Correct demonstrated defects in their owning repository. An empirical model
may match an observation better while other parts of its physics are worse;
do not declare either whole engine correct merely from brightness or complexity.

The [initial investigation](validation/f135-dry-glow-regression-2026-10-08.md)
records the current code findings and a controlled optical-input sensitivity.
Read it first. Its small source calculation does not complete this task.

## Existing evidence and entry points

- `docs/validation/f135-engine-plant.md`, `engine-plant-report.md`,
  `engine-plant-stage-record.md` and `f135-ab-onset.md`.
- `docs/proposals/engine-plant-implementation.md`, especially its station,
  optical-migration and acceptance contracts.
- `docs/validation/f135-dry-vtol-mechanism.md`,
  `f135-dry-vtol-observation.md`, `f135-night-video-comparison.md`,
  `f135-exhaust-source-correction.md` and `f135-exhaust-response.md`.
- The original retained fork.16 onset report and new plant report:
  `validation/evidence/aircraft/f35b/ab-onset-2026-10-07/integer-clock-reviewed/`
  and `validation/evidence/aircraft/f35b/engine-plant/ab-onset/`.
- Current model selection/data packages (`F-35B-jsbsim` and
  `F-35B-jsbsim-empirical`), introduced by commit `33347586`, and
  `scripts/validation/f35b/check-f135-empirical-engine-model.mjs`.
- `src/flight/aircraft/aircraftCatalog.ts`, the actual exhaust observation
  adapter in `createEngineExhaust.ts`/aircraft visuals, `engineGasOptics.ts`,
  `engineReactionEmission.ts`, profiles/generated data and their tests.
- `src/flight/audio/f135ExhaustOnsetHarness.ts`, its joint integration tests,
  `scripts/exhaustOptics/combustion/README.md` and receiver/posed-ray diagnostics.
- JSBSim `doc/turbine-plant-model.md`, `FGTurbinePlant.cpp`,
  `src/models/propulsion/plant/TurbinePlant.cpp` and native tests.

Read current source and identities; historical records describe their own
revisions. Preserve every retained failure and superseded artifact.

## Ownership and protected behavior

JSBSim owns engine thermodynamics, actual station/exit conditions, mass/energy,
fuel/combustion histories and corresponding native observations. Its `wasm/`
owns generic SDK interfaces. 0sfs owns F135 data, aircraft optical closures,
particle/emission profiles, attachment geometry and native-to-visual adaptation.
FOSS Earth owns generic illumination, exposure/display and renderer corrections.
Name the owner before any new module; avoid a second app engine solver.

Preserve the newly accepted AB onset behavior, rigid nozzle, separate metals,
native hover AB inhibit, controls and lifecycle. Keep dry multiplier **0.5–10×,
default 1×**, its saved ID, current Exhaust sections and default-on sound.
The multiplier is a presentation control; do not change its default to conceal
a physical regression. Coordinate with Sky and smoke/hot-gas agents. Freeze their
identified states within each comparison, and avoid double-counting particles.

## 1. Establish the actual boundary contract

The initial audit found that the old thermal temperature alias now maps to
**station 7 total temperature**, while the current optics still describes an
imposed gas/particle bath and continues it through the interior/exterior.
Native exit-static temperature, pressure, Mach, flow and area already exist.
The EGT input is now a lagged station-5 gauge, not the mixed station-6 reactant
stream. Audit this contract explicitly before replacing any property.

Produce a table for every consumed input: native property, station, total/static
meaning, unit/reference, sensor lag, validity, adapter conversion, spatial use,
source of uncertainty and behavior on empirical versus plant engines. Capture
what the **runtime adapter actually passes**, including missing values; manually
constructed fixture temperatures cannot demonstrate installed integration.

Trace mixing/cooling/shaft extraction between core, bypass, station 5, augmentor
inlet, station 7 and nozzle exit. Check `h_total = h_static + V²/2` using consistent
mixture enthalpy and frame. Never apply nozzle expansion twice. Equally, using
total temperature everywhere is not a justified particle-temperature model.

Separate mean gas temperature, local hot/cold distributions, particle temperature
and metal temperatures. A mixed mean and a distribution preserving mean enthalpy
can have very different visible emission. If introducing a distribution or
particle thermal lag, derive/bound it from mixing, particle properties and time
scales; do not invent a hot fraction to restore the earlier glow.

Complete the station/pressure/composition migration required by the original
implementation spec. Use versioned/capability-aware semantics for both models.
Missing empirical station data stays unknown or a named proxy. The successful
native and onset work remains valid in its scope; reopen the incomplete optical
integration and dry-validation stage rather than marking the entire engine wrong.

## 2. Paired scenarios and measurements

Run both currently packaged aircraft models on the **same installed SDK** with
the same environment, initial-state procedure, simulation clock, optical code,
geometry and settings. Reuse an SDK build unless a demonstrated native change
requires another. Compare two different questions separately:

- Equal commanded scenario (same throttle/conversion and elapsed time), which
  detects the experience changed by switching models.
- Matched attained operating condition (main thrust or total hover lift/load,
  documented separately), which helps interpret physically different cycles.

Equal throttle, N2 or elapsed warm-up alone does not establish equal physical
conditions. Settle by a stated criterion or report the remaining transient.
Record actual temperatures, flows, pressure, Mach, areas, shaft loads, gas and
metal histories, fuel/burn and all optical inputs. All dry cases must verify
zero reheat burn; do not infer dry from a dim picture or a throttle label.

The matrix must include:

| Axis | Required coverage |
| --- | --- |
| Dry power | Idle, partial power and maximum dry |
| History | Cold start, settled dry, hot restart, recently extinguished AB, fuel cutoff and hot shutdown |
| Configuration | Forward nozzle and fully converted dry powered lift; conversion transients separately |
| Environment | Sea-level reference plus declared altitude and ambient-temperature variations covering meaningful source/table domains |
| Geometry | Actual rear/oblique interior-to-exterior support and fully downward nozzle; same aperture when isolating physics, actual attained aperture for end-to-end comparisons |
| Model | Empirical and plant; component/reduced agreement is a separate numerical comparison within the plant |

Include throttle ramps and steps into maximum dry, held maximum power, repeated
acceleration/deceleration and dynamic conversion into full hover. Capture enough
history to distinguish thermal overshoot, a repeatable limit cycle and a settled
condition. Test the actual full lever command (1.0) under hover inhibition as well
as the 0.99 calibration command; do not assume their control paths are identical.
Track selected and actually used algorithm, fallback, limits and saturation.

Known partial-conversion defects and the newly reported sustained full-VTOL
oscillation remain named failed or unqualified scenarios until reproduced and
resolved. Never average an oscillating state and call it a steady measurement.
Do not fix these cases by adjusting optical settings or discard their traces.
Full deck-impingement physics is a separate extension; quantify
what the current free-jet/receiver model can and cannot explain.

Measure the chain in stages: native/adapter state → local spectral/particle
source → integrated interior/exterior source → escaped rays through actual
hardware → receiver/deck illumination → identified display mapping. Keep gas,
metal, chemical light, scattering and reflected/thermally emitted deck light
separate. Units must distinguish W, W/sr, cd, cd/m² and lux.

## 3. Attribute the change before tuning

Replay captured inputs through the same optical code. Vary one input or one
physically coherent group at a time: temperature/station boundary, fuel and
power-cap status, particle loading, support/aperture/volume, metal state, table
version and observer/display. Keep the rest identical. Use these as sensitivity
experiments, not claims that independently spliced states are realizable engines.

Record cap/clamp validity, kappa/loading, source volume, peak/local temperatures,
particle/chemical watts, interior/exterior Y and escaped radiance at fixed probes.
Report both absolute differences and ratios with denominators/floors near zero.
Use log plots or EV differences only when values are positive and units match.
Do not translate a source ratio directly into a screen-pixel or perceived ratio.

For the spool-up/settled report, align source and escaped-ray histories with
actual fuel delivery/burn, air and bypass flow, shaft power and acceleration,
station enthalpies/temperatures, nozzle area, particle temperature/loading and
cap status. Quantify peak, settled window, settling error and peak-to-settled
ratio. Correlation with N1 or its derivative alone is not a mechanism. Test
whether the reduction follows a physical temperature/mixture transient, a
controller limit cycle, changed station semantics, or a source/adapter error.
Preserve energy-accounted acceleration heat; do not tie brightness to spool
acceleration or add persistence/fades to conceal the steady discrepancy.

Carry uncertainty through the optical model. At minimum investigate the plant's
declared turbine-inlet/cooling uncertainty and the particle/loading/mixing
assumptions, with their valid ranges and sensitivities. Sensitivity intervals are
not statistical confidence intervals. Retain energy and mass constraints and
identify which unknowns prevent choosing between explanations.

## 4. Determine what is physically supported

Use primary sources and the retained reference ledger. Distinguish measured
station/spectral/radiance data, manufacturer rating constraints, justified
reductions, fitted coefficients and unknowns. A model can conserve energy and
still predict the wrong station temperature, particle population or emission.
Reduced/reference agreement only validates the numerical approximation.

Investigate continuum from particles, gas-band emission and any dry chemical
contribution separately. State where emitter concentration, temperature and
residence come from. A gas temperature and fuel-flow upper bound do not identify
soot loading. Do not add an exterior CH/C2 budget or arbitrary emissivity because
there is room under a fuel-power ceiling.

Use the nighttime carrier footage to constrain morphology and relative behavior
with explicit exposure, spectral response, clipping, compression and geometry
unknowns. It cannot establish absolute visible radiance without those inputs.
If accessible primary data cannot decide the true F135 dry radiance, say so and
retain a bounded hypothesis comparison. Neither restoring old brightness nor
declaring the new dimness correct by conservation alone completes the reasoning.

## 5. Permanent regression coverage

Implement layered tests and a reproducible CPU diagnostic with default output
from `scripts/outputDirectory.mjs`. Retain a small, reviewable evidence corpus.

1. **Native-to-adapter contract:** compare actual runtime observations with native
   station/exit values, units, flags, epoch and validity for both models. Deliberate
   station/temperature substitution must fail a targeted test.
2. **Integrated dry baseline:** execute a bounded selection of the paired dry
   matrix on the installed SDK, through the production adapter and source code.
   A change comparable to the observed reduction must produce a failing drift
   criterion or explicit unaccepted comparison, not merely a positive nonzero
   source. Cover dry powered lift as well as a forward test stand, including
   peak-to-settled behavior. Failed stationarity must fail/report the operating
   point qualification rather than silently choosing a favorable sample.
3. **Independent numerical/physical invariants:** conservation, no invented dry
   reheat, valid interpolation and domain handling, spectral integration and
   spatial/ray convergence. Keep these independent of historical brightness.
4. **Attribution fixtures:** controlled temperature/flow/loading/geometry changes
   with independently expected trends and source-accounting identities. Use actual
   adapter captures alongside synthetic optical unit tests.
5. **Lifecycle and accepted AB behavior:** cold/warm onset, cutoff residuals,
   metal cooldown, pause, recovery, relocation and model switching. Keep the joint
   shipped-DSP/source tests and the user's acceptance record.

Choose explicit absolute/relative drift tolerances before accepting a replacement
baseline, justified by repeatability, numerical approximation and the smallest
material change the test must catch. A snapshot update alone is insufficient:
an intended physical correction needs a retained old/new comparison, cause,
provenance and updated physical/visual acceptance status. Historical brightness
is a regression reference, never automatically ground truth.

Add an intentional mutation or controlled fixture demonstrating that a large dry
temperature/emission reduction actually trips the relevant end-to-end check.
Ensure changed-test selection includes XML, optical generated data, fixtures and
adapter dependencies; `vitest related` follows imports only. Coordinate with the
CI follow-up instead of inventing a second dependency-selection scheme.

Keep fast representative cases in ordinary CI and the comprehensive matrix in
a named deterministic diagnostic with an explicit run policy. Share captured
traces within a run where inputs are identical, but do not bypass the installed
SDK/adapter path in every regression. Record scenario coverage and every failed
case so later engine migrations cannot declare dry emission unexamined.

## Checks, restrictions and deliverables

Use `npm run typecheck`, related tests and lint after changes, then full final
CI once. Run native/SDK/shared-owner checks for actual changes. This implementation
handoff includes a native build and immutable SDK adoption only if required by
a demonstrated native correction; avoid rebuilds for optical-only work. Rebuild
audio WASM if DSP source actually changes. Keep logs under `build/`, retain selected
evidence under `validation/evidence/aircraft/f35b/`, and preserve existing folders.

Existing server, GPU/browser, timing-benchmark and deployment restrictions persist.
Complete CPU diagnostics and source/ray checks first. Qualify rendered appearance
only in a separately authorized viewing run with identified Sky/display settings
and actual opaque geometry. Known ray-budget error is not repaired by a source
brightness change. Do not claim that CPU Y proves a visible flame.

Deliver the cause attribution, repaired contracts/defects where justified,
regression tools and CI selection, comparison evidence and a parameter/uncertainty
ledger. State which model assumptions are better supported, which are unresolved,
and whether the current implementation passes numerical, physical, performance
and appearance criteria separately. The existing subjective AB acceptance should
remain clearly visible throughout the report.
