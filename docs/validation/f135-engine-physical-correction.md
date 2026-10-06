# F135 physical correction

The later [spatial-plume implementation](f135-plume-spatial.md) supersedes this
record's uniform gas-source field. Its rigid geometry, fork.16 native heat
accounting and retained evidence remain applicable; optical numbers below
describe the earlier uniform approximation.

The [follow-up task](../f135-engine-physical-correction-prompt.md) replaces the
reconstruction's aperture morphs with rigid articulated components, separates
cold start from already-running initialization, exposes native per-solid heat
accounting, and replaces normalized gas brightness with dimensional radiative
transfer. The [acceptance record](../../validation/evidence/aircraft/f35b/engine-physical-correction-2026-10-06/acceptance.json)
links the retained evidence and final checks. Aircraft assets and optics belong
to 0sfs; thermal state and accounting belong to JSBSim. Existing airframe, gear,
sound, phone, Location and flight-control work remains separate.

## What the startup evidence establishes

The user's immediate red-to-purple sequence was not captured with engine state
or display settings, so its exact cause remains unidentified. The previous stand
opened an already-running engine, not a cold experiment. Its normalized gas color
and independently guessed brightness could amplify physically negligible cold
radiance; its nearby light could also color engine hardware. Those mechanisms
have been corrected, without imposing a desired startup hue or a bright idle.

The installed native trace starts stopped, cold-soaks at **286.50 K**, then uses
the normal starter. Running becomes true at **32.52 s** of simulation time,
**27.52 s after the starter command**. Core-facing metal is then **509.76 K** and
the liner **340.41 K**. After another 60 s at idle they reach about **622.25 K**
and **460.10 K**. The core's modeled visible luminance is only about
**2.02 × 10⁻⁶ cd/m²**: this does not support a dramatic metal glow at idle.
The separate already-running initialization assigns equilibrium temperatures,
about **622.28 / 470.25 K**, with assigned energy recorded separately from heat
integrated during accepted time. A normal hot restart retains residual heat.

Sustained 99% dry gives approximately **956.72 K core / 664.07 K liner**;
conventional AB gives **2363.10 K gas / 960.10 K core / 1270.18 K liner**.
These are outputs of provisional coefficients, not measured F135 temperatures.
The [native report and traces](../../validation/evidence/aircraft/f35b/engine-physical-correction-2026-10-06/native/README.md)
retain initial zero-time defaults as well as the first accepted initialization,
fuel supplied/burned, N1/N2, running/augmentation, nozzle command, every solid's
temperature and heat terms, optical bank and physical source-power bounds.

## Rigid nozzle mechanics

The retained rejected morph assets fail shape preservation: their edge lengths
change by about **40.5–41.3%**, with total surface-area growth **14.3–21.7%**.
The replacement has distinct convergent flaps, divergent flaps, interleaved
sliding seals, sliding throat shoes, external fairings and external seals.
The production rig moves **112 nodes** using rotations/translations at unit
scale; fixed follower pedestals bring the rigid mesh count to **128**.
Every part keeps fixed local vertices. There is no aperture morph or hidden
stretching sleeve.

Convergent flaps pivot at the fixed upstream ring. Divergent flaps follow their
moving throat hinges. Interleaved seal planes follow the adjoining flap planes;
rigid throat shoes cover their sliding junction. External fairings pivot at
their forward ring and follow slotted pins attached to the divergent ends.
Beveled finite-thickness hinge ends avoid intersecting leaves. Full and installed
exports use identical common parts and poses; the three swivel bearings retain
their separate rigid motion. The exhaust origin and optical radius follow the
actual moving exit.

The [geometry evidence](../../validation/evidence/aircraft/f35b/engine-physical-correction-2026-10-06/geometry/README.md)
records edge lengths, per-triangle areas, closed signed volumes, nominal
thickness/mass, attachment constraints, overlap, flow-wall rays and clearance.
It also compares actual Babylon-loaded production transforms with the source
evaluator. Polygonal **A8 throat area**, **A9 exit area** and the generic native
normalized command are distinct quantities. Independent ray-derived sections
agree with authored areas within 0.01%; this does not calibrate an F135 schedule.

[Hamstra and McCallum §2.2.1/§6.2.2](https://onlinelibrary.wiley.com/doi/full/10.1002/9780470686652.eae490)
support internal flaps, external fairings and the compact STOVL nozzle. They do
not provide the complete PW-600 linkage. The 16-fold segmentation, dimensions,
shoe/follower construction, material density, pivots and aperture endpoints are
explicit geometric hypotheses. Rendered shell mass does not determine the
native effective thermal capacities. Existing door motion and its preserved
closed source seam are unchanged by this correction.

## Native heat accounting

Installed SDK **1.2.4-fork.16**, clean JSBSim revision
`97fe6ddf1c8a7d9e10dad46a88e60e79e69fae28`, adds read-only signed accounting to
the existing generic solid solver. It changes no F135 coefficients or native
thrust, fuel, spool, EGT or nozzle laws. The [adoption record](../../validation/evidence/jsbsim/adoption/fork16-adoption.json)
retains native tests, SDK build, artifact hashes and fork.15 rollback material.

For each region, heat rates are positive **into** the solid. The retained audit
independently evaluates gas convection, coolant transfer, surrounding radiation
and flame radiation, and compares `C ΔT` with the accepted backward-Euler
endpoint heat integral. Across **133,577 native steps**, maximum per-step energy
residual is **2.733 × 10⁻⁹ J**; independently reconstructed heat-rate error is
**5.821 × 10⁻¹¹ W**. A separate refined RK4 cooling reference shows first-order
convergence at 30/60/120/240 Hz: at 240 Hz, errors are **0.00370 K liner** and
**0.00792 K core** after 30 s. The 108 sensitivity cases vary provisional
capacities, conductances, areas, emissivities and bath temperatures; their ranges
are stress brackets, not statistical confidence intervals.

Core and liner capacities are effective **1,800 / 12,000 J/K** lumps. Gas,
coolant and surroundings are prescribed reservoirs. There is no gas-enthalpy
debit, coolant depletion, direct inter-solid conduction, material-specific
enthalpy integral, dissociation or feedback from displayed radiation. A closed
local wall balance is not a closed whole-engine energy budget. Native radiation
uses the XML's bolometric emissivities; visible material emission uses the
declared grey spectral approximation. They are not independently calibrated.

Initialization energy is an external assignment, never combustion heat. Accepted
simulation time gates the balance receipt; pause/zero-time calls add no heat.
A held native model can retain its last receipt, so repeated render reads must
not be accumulated. Raw native reset returns cold/uninitialized; recovery and
Location restore retained thermal state. Sampled UI histories expose the receipts
for inspection; the standalone validation tool sums every accepted step. Display settings have no path into native
fuel or temperature.

## Dimensional light and diagnostic views

Solid emission retains Planck/CIE absolute RGB radiance in photometric units,
including the material profile's emissivity. Positive logarithmic interpolation
keeps the cold Planck tail small. Gas uses a reduced grey model `jλ = κ Bλ(T)`
with absorption in m⁻¹ and analytic Beer–Lambert segment integration. Optional
CH*/C2* source bands have a separate absolute power allocation from **actually
burned AB fuel**; dry operation gets no such bands. The former normalized cold
RGB and arbitrary axial orange-to-violet ramp no longer drive gas radiance.

The defaults assume κ = **0.025/m dry**, **0.08/m AB**, with sensitivity range
**0–0.3/m**. Unattenuated bolometric particle-source power is bounded by
`4 κ σ T⁴ ∫ρ dV` and capped at **0.3% dry / 1.5% AB** of supplied fuel's
**43.3 MJ/kg** chemical power. Excited-band power defaults to **10⁻⁶** of burned
AB fuel power, with **0–10⁻⁴** explored. Equal band-energy weights and the
eight-lobe annulus are hypotheses. Temperature alone cannot establish particle
loading or excited-species populations. Missing fuel or invalid temperature
suppresses gas emission; missing burned AB fuel suppresses the band source.

These are local upper bounds, not radiative CFD or a further debit from the
native gas reservoir. The single optional isotropic light represents the same
gas source bound and excludes its own engine meshes. It cannot recolor cold
engine metal and be mistaken for metal self-emission. Lit nearby receivers can
respond; the emissive raster basemap cannot. Camera/exhaust display gains and
white references apply after physical source evaluation, without changing its
power. Gas and solids share the existing scene exposure, tone mapping and
display encoding; no FOSS Earth renderer fork is introduced. Exact background
absorption/addition requires linear HDR composition; material-local tone/gamma
blending remains approximate, as does the bounded volume's first-interaction depth.

The [optical evidence](../../validation/evidence/aircraft/f35b/engine-physical-correction-2026-10-06/optics/README.md)
includes independent frequency-form Planck and 0.25 nm CIE integration, the
Stefan–Boltzmann integral, interpolation/endpoint/invalid-input tests, transfer
quadrature, 36 fuel-budget cases and 24 optical sensitivities. Maximum
combined table/interpolation luminance error against independent quadrature is
**0.328%**, at the cold end. At 400 K, a 1 m dry
path now retains only about **1.53 × 10⁻¹⁵ cd/m²** in its red channel; the old
dimensionless guessed amplitude is not comparable as an SI ratio.

**Renderer → Aircraft exhaust → Contribution view** selects combined, solid,
gas, reflected light or nearby scene light. Owned engine-material bindings
suppress the other engine contributions without changing thermal state. Other
scene receivers retain their ordinary environmental background in the scene-light
view. This supports a recorded diagnosis of a future transition; it does not
retroactively identify the user's uncaptured sequence.

The retained [night powered-lift and pink/violet test-cell observations](../proposals/f35b-fdm.md#observations-hypotheses-and-unresolved-discrepancies-2026-10-06)
still constrain appearance. [NIST radiometry](https://www.nist.gov/programs-projects/spectroradiometry-sources)
supports the Planck/radiance method, not F135 temperatures or emissivity.
[NASA's jet-fuel imaging study](https://ntrs.nasa.gov/citations/20140000730)
supports possible emitting species, not these mixture weights. Operational
powered-lift AB inhibition remains enforced. No universal purple or orange
appearance, required idle glow, or calibrated video match is claimed.

## Reproduce and inspect

Incremental typecheck and lint passed. Related checks passed **73 files / 899
tests**, with the existing expected gear-envelope failure. Full CI was invoked
once: all **169 application test files / 1,824 tests** passed, with that same
expected failure, but discovery also tried to execute two archived test-source
copies and failed their relative imports. Those evidence copies now have `.txt`
suffixes, with unchanged hashes; discovery confirms exactly the 169 real files.
The suite was not repeated. The remaining production build and all artifact
verifiers passed separately. Logs and the failed archival discovery are retained
in the [application check record](../../validation/evidence/aircraft/f35b/engine-physical-correction-2026-10-06/acceptance.json).

Runnable diagnostics default to new dated directories under `build/`:

```sh
npm run verify:engine-assets
node scripts/validation/f35b/check-f135-reconstruction.mjs
node scripts/validation/f35b/check-f135-clearance.mjs
node scripts/validation/f35b/check-f135-physical-thermal.mjs
node scripts/validation/f35b/analyze-f135-thermal-uncertainty.mjs --report=validation/evidence/aircraft/f35b/engine-physical-correction-2026-10-06/native/report.json
node scripts/validation/f35b/check-physical-optics.mjs
```

For an interactive test, run `npm run dev`, select **F-35B**, and use
**Engine → Engine test stand → Initial engine state → Cold-soaked and stopped**
(the default), then **Open engine test stand**. It opens on Earth at MSP runway
35 with native hold-down. Start through the ordinary THR engine control, let
idle settle, hold 99% dry, select conventional AB, return to 99%, and shut down.
Restart normally to retain heat. **Already-running idle → Reinitialize engine**
is a separate experiment and deliberately assigns initial thermal state.
**Location** relocates the stand; turning the stand off returns to the installed
aircraft without replacing the saved flight.

Use **Engine → Solid heat balances** for signed terms. Enable **Record solid heat
balances** in Engine history before exporting CSV; changing that choice clears
the history so columns stay consistent. Hold exposure, display references and
gain fixed while cycling the contribution selector, from rear and oblique views.
Test VTOL separately: native AB remains inhibited. Pause should freeze native
heat and geometry; Location should retain the existing temperatures.

The retained CPU mesh projections, numerical plots and NullEngine checks are
not rendered day/night appearance evidence. No server, browser/GPU run or
performance benchmark was started for this task. Matched contribution-separated
rear/oblique flight-app captures under recorded day/night lighting and fixed
exposure still require an explicitly requested visual run. Geometry dimensions,
native coefficients, optical depth, species fractions and apparent brightness
remain uncalibrated; no device or performance qualification is claimed.
