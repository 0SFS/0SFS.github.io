# Follow-up: spatial F135 exhaust emission and powered-lift visibility

Latest checkpoint: [afterburner response and rendering work](validation/f135-exhaust-response.md).
An internal conditional CH(A) parcel and unresolved hot/cold temperature mixture
now drive AB emission; the user reports better appearance and usable performance,
with a smaller remaining audio lead. Dry powered-lift appearance remains open.
The [dry observation ledger](validation/f135-dry-vtol-observation.md) records the
night footage, primary landing/deck references, source bounds and next targets.
Read that checkpoint before applying the historical findings below. The user
declined GPU testing for this work; do not initiate it from these older instructions.

Recorded 2026-10-06, after the [physical correction](validation/f135-engine-physical-correction.md).
Status: the [source correction](validation/f135-exhaust-source-correction.md)
implements removal of the unsupported chemical allocation and mode-selected
temperature conversion, and extends thermal support through the nozzle. The
physical/visual appearance objective is **OPEN**; the user's rejected AB onset
and absent dry VTOL emission are not declared resolved. Final combined software
checks are recorded in the correction report. The prior
[spatial-plume approximation](validation/f135-plume-spatial.md) and instructions
below are preserved as history and acceptance constraints. Numerical correctness
does not establish physical or visual acceptance.

## Follow-up after testing the spatial implementation

The following observations and code findings describe the tested spatial pass
before the source correction. See the linked correction report for current
behavior, evidence and unresolved appearance requirements; the original findings
are retained rather than rewritten as though the user had accepted the result.

Recorded 2026-10-06. The user still reports a large, unrealistically bright pale
blue flame apparently starting outside the engine on AB engagement, and no
visible downward exhaust without AB. The requested outcome remains physical
source modeling, not suppressing blue, choosing a warmer RGB value, or increasing
dry brightness until it resembles a video. No new runtime changes or GPU capture
were made during this audit; the exact reported pixels remain unmeasured.

### Findings in the latest code

The active path now has local temperature, loading and CH*/C2* fields. The
single-color diagnosis in the historical instructions below has been addressed.
However, the source model retains several unsupported assumptions:

- **An imposed exterior chemical-light budget.**
  [engineGasOptics.ts](../src/flight/aircraft/engineGasOptics.ts) assigns
  `burnedABFuel * 43.3 MJ/kg * 1e-6` watts to CH*/C2* emission and normalizes each
  spatial basis to that allocation. The four
  [profile bands](../scripts/exhaustOptics/f135-visible-approximation.json) have
  equal energy weights, giving CH* one quarter and C2* three quarters. Neither
  those ratios nor that visible-energy fraction is measured for F135 exhaust.
  There is no local reaction-rate, species-population or quenching calculation
  to establish how much of that emission occurs outside the nozzle. A fuel-power
  bound constrains total energy; it does not validate spectrum or location.
- **Concentrating the same assumed light made onset brighter.** The
  [retained optical comparison](../validation/evidence/aircraft/f35b/plume-spatial-2026-10-06/spatial-optics/README.md)
  gives AB-onset oblique peak luminance **378.5 cd/m²**, versus **59.65 cd/m²**
  before spatialization, about **6.35 times higher**. The allocated chemical
  source is still approximately **4.0043 W** in that case. Its compact exterior
  support concentrates the source; the CPU image already shows a cyan/green
  annulus. This corroborates the model's appearance problem without reproducing
  the user's actual exposure, settings or GPU output.
- **AB selection causes an unqualified temperature discontinuity.** The renderer
  selects assumed exit Mach **0.8 dry / 1.1 AB** from the augmentation boolean.
  With its assumed gamma 1.33, static temperature is
  `Tstation / (1 + 0.165 * Mach²)`. The retained dry station value **1003.13 K**
  becomes **907.32 K**; at AB +0.233 s the increased station value **1034.45 K**
  instead becomes **862.29 K**. Thus the continuum initially cools while the
  prescribed chemical light increases. This is not a measured nozzle transition
  or a flow solution based on evolving area, pressure and mass flow.
- **The input temperature is not a qualified exit station.** In the canonical
  JSBSim `src/models/propulsion/FGTurbine.cpp`, the default dry thermal gas input
  falls back to generic EGT: `TAT_C + 363.1 + 357.1 * N2norm` in normal running.
  The current [F135 XML](../public/jsbsim-data/aircraft/F-35B-jsbsim/Engines/F135-PW-600.xml)
  does not supply `base-gas-temperature-k`. Native AB heat is an enthalpy-mixture
  proxy; no exit Mach, nozzle expansion or STOVL shaft-extraction solution defines
  this temperature. Treating it as a measured total temperature and expanding it
  again is unsupported. That does not prove a particular replacement temperature.
  There is no separate native gas-temperature time constant: gas heat is computed
  algebraically from the current spool/fuel state. At equal N2 and inlet-air
  temperature, conventional dry and converted dry operation give the same gas
  proxy; lift-fan shaft work and bleed do not enter that temperature equation.
- **Dry visibility regressed in the retained comparison.** New powered-lift
  peak luminance is **0.000111 / 0.000167 cd/m²** in rear/oblique views, versus
  **0.01115 / 0.01183 cd/m²** previously: about **70–100 times dimmer**. Dry
  chemical emission is assumed zero, while particle temperature immediately
  follows the expanded/mixed gas proxy. These restrictive assumptions leave the
  observed night exhaust unexplained. No AB-specific render-disable was found.
- **A perceived gap is not yet a proven attachment error.** The authored
  chemical basis peaks at axial distance zero, and the volume begins at the
  nozzle exit. Its whole gas domain is exterior; it does not solve luminous
  augmentor gas inside the engine. Existing geometry checks establish some
  unobstructed support, not a correct luminous boundary across the exit or the
  user's rendered gap. They exclude ground/airframe occlusion. Source location,
  hardware depth, sampling and display mapping still need a combined check.

### Physics and reference constraints

Ordinary hydrocarbon fuel can emit blue/blue-green light without unusual elements.
[NASA's JP-8 experiment, section 4.1 and figure 4](https://ntrs.nasa.gov/api/citations/20140000730/downloads/20140000730.pdf)
records CH*/C2* emission and blue-green JP-8 combustor flames under some conditions.
It also records soot emission and changes with operating conditions. This is
evidence for the mechanisms, **not validation of a large pale-blue F135 exterior
plume**, equal band powers, or the present source allocation. Band wavelengths
alone cannot determine the spectrum of a real engine. Call the observation
*luminous exhaust*: its appearance alone does not identify ionized plasma.

[NASA's afterburner description](https://www.grc.nasa.gov/www/k-12/airplane/turbab.html)
places fuel addition and combustion inside the aft engine duct. A proposed
exterior reaction zone needs its own physical justification; internally burned
fuel is not by itself a measurement of exterior chemiluminescence. Conversely,
do not impose a universally dark exterior or forbid blue emission.

Keep the Royal Navy reference at
[2:38](https://www.youtube.com/watch?v=rIroDPghWF4&t=158s),
[2:41](https://www.youtube.com/watch?v=rIroDPghWF4&t=161s) and especially the
downward nozzle near [2:42.8](https://www.youtube.com/watch?v=rIroDPghWF4&t=162s).
Its external luminous region and deck patch remain acceptance constraints.
[The detailed evidence ledger](proposals/f35b-fdm.md#observations-hypotheses-and-unresolved-discrepancies-2026-10-06)
separates those observations from unmeasured emission mechanisms and camera
response. Retain the documented operational hover AB inhibit; the discrepancy
must be investigated in dry powered lift. A ground patch also needs a receiving
surface and the appropriate radiation/scattering or heating mechanism. The
current free plume does not solve impingement, and its approximate point light
does not make unlit raster terrain a light receiver.

### Requirements for the next implementation

1. Establish named engine stations and temperature meanings before applying
   expansion. Investigate the AB-boolean Mach jump and the native proxy, with
   pressure, area, mass flow and energy accounting appropriate to the available
   data. Native engine/transport changes belong in JSBSim; aircraft-specific
   emission/geometry bindings belong in 0sfs; shared HDR and terrain-light
   receiving behavior belong in FOSS Earth.
2. Replace the unsupported exterior source allocation with a justified reduced
   model or measured bounds for chemical emission and particle radiation.
   Distinguish internal augmentor light, exiting gas/particles and any exterior
   reactions. Include species production/loss and particle thermal assumptions
   to the extent needed to predict the observed behavior. Document unresolved
   inputs rather than claiming exact F135 chemistry from fuel identity alone.
3. Precompute expensive chemistry/spectral/flow work into compact tables with
   stated domains and error bounds. Preserve absolute radiometry, separate metal
   states, the rigid nozzle and runtime resource controls. Do not use a hue ban,
   startup fade or unexplained dry gain as the physical correction.
4. Compare the same cold/idle/dry99/AB-onset/sustained-AB/cutoff and powered-lift
   cases, recording native state, component radiance, nozzle position and display
   mapping. Check the bright-source boundary inside/across/outside the nozzle,
   and separate the free jet from deck illumination/interaction. Test any
   source discontinuity introduced solely by a mode flag. Keep numerical and
   physical acceptance separate: tests integrating an assumed source correctly
   do not show that the source is correct.
5. Finish with rendered rear/oblique day/night comparisons when the task
   authorizes a browser/GPU run. A statement that the dry discrepancy remains
   unexplained is an open result, not completion of this appearance objective.

## Historical instructions for the implemented spatial pass

### User observations before the spatial pass

- At 100% throttle with the nozzle in VTOL, the user sees no downward luminous
  exhaust. This remains inconsistent with the retained night powered-lift footage.
- Engaging AB makes the whole plume very bright blue, with insufficient spatial
  color variation. The user finds this less realistic than earlier iterations.
- The user wants light to follow a physical temperature/composition field, with
  cheap precomputed runtime evaluation. They propose a colormap and ask how
  combustion light differs from hot gas/metal radiation.

These are acceptance failures reported by the user. Exact state, settings,
camera/exposure and timing were not captured; a code audit is not a reproduction
of their display. The prior dimensional calculations passing numerical checks
does not establish that the assumed physical source field represents the F135.

### Baseline implementation before the spatial pass

The earlier prompt's normalized-color diagnosis is historical: that path was
replaced in the physical correction. Do not undo its absolute radiometry or
reintroduce normalized low-temperature brightness to recover the old appearance.

[engineGasOptics.ts](../src/flight/aircraft/engineGasOptics.ts) samples **one gas
temperature** and produces **one `sourceRgbCdPerM3`** for the entire volume. Its
particle continuum and optional excited-band source are added before rendering.
Both shaders in [createEngineExhaust.ts](../src/flight/aircraft/createEngineExhaust.ts)
apply that uniform `sourceRadiance` at every sample, with scalar density and grey
extinction. The spatial map changes annular/filled density, not temperature or
emitting-species ratios. There is no independent downstream cooling or local
reaction field. Before background mixing and display processing, chromaticity is
therefore spatially constant. This is a confirmed structural limitation.

The [profile](../scripts/exhaustOptics/f135-visible-approximation.json) assumes
dry/AB particle extinction of 0.025/0.08 m⁻¹. Dry excited-band power is zero;
AB assigns 10⁻⁶ of actually burned AB fuel power to four equally weighted
CH*/C2* bands. Those weights and efficiency are unmeasured hypotheses. A fuel
power upper bound does not validate hue, brightness or emission location.
The old optical PNG is an archival preview, not the active shader color map.

Existing [native/optical trace data](../validation/evidence/aircraft/f35b/engine-physical-correction-2026-10-06/native/trace.csv)
already corroborates the modeled transient: in `cold-cycle` at 212.750 s,
gas temperature is 1034.445 K, burned AB fuel is 0.0924782 kg/s and source RGB
is **(56.544, 324.298, 429.504) cd/m³**. The assumed excited bands dominate
the faint thermal continuum at this early stage and are distributed across
the whole volume. This establishes a blue-dominated modeled source, not the
exact brightness seen on the user's screen. Its uniform spatial application
is a separate defect from uncertainty in the band weights.

The dry path exists without augmentation; its invisibility in the user's VTOL
case is not proven to be an explicit VTOL disable. Audit actual source magnitude,
fuel/temperature availability, support length, attachment orientation, occlusion,
contribution view, display gains and scene lighting before assigning the cause.
The retained `powered-lift-full-command` trace at 117.525 s has conversion 1,
nozzle pitch π/2, AB off, valid optics, gas 1003.128 K and source RGB
**(0.329483, 0.003080, 0) cd/m³**. The current dry support is 1.2 m long
(0.2 of the declared 6 m) and default display reference is 1000 cd/m².
This supports a dim, short-source explanation under current assumptions; it
does not establish the correct F135 dry radiance or exclude a rendering fault.

## Physical interpretation, with source limits

**Air is the oxidizer, not the fuel.** Main-combustor products contain remaining
oxygen; AB adds fuel downstream of the turbine and burns it in the augmentor
upstream of the nozzle exit. A visible exterior plume is not proof that every
part of it is still reacting. [NASA's afterburner explanation](https://www.grc.nasa.gov/www/k-12/airplane/turbab.html)
supports that arrangement, not an F135-specific reaction distribution.

**Combustion light has more than one mechanism.** Heat produces thermal emission
from solids and particles, with gas emission dependent on its spectral properties.
Chemical reactions can also form excited molecules/radicals that emit photons
as they relax: chemiluminescence. Its source is chemical energy, so visible
emission need not be the blackbody glow expected from the bulk gas temperature.
[IUPAC's definition](https://goldbook.iupac.org/terms/view/C01045) and
[excited-state explanation](https://old.iupac.org/reports/1990/6211calvert/glossary.html)
support this distinction (indexed text consulted; direct pages returned 403).

NASA's jet-fuel experiment observes CH* violet emission near 432 nm, C2* bands
near 473/516/573 nm, and soot-associated orange light. This supports several
concurrent emission mechanisms, not equal species weights or a universal blue,
orange or purple F135 plume. [NASA/TM-2013-217884, §4.1](https://ntrs.nasa.gov/api/citations/20140000730/downloads/20140000730.pdf).
Use [NISTIR 6783, §4](https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir6783.pdf)
for the emission/absorption formulation and grey-model limitations; it is not
an aircraft-engine calibration.

**A spatial field is needed; a strictly monotonic temperature ramp is not a
general physical law.** Expansion, mixing, continuing reactions and compression
can produce local differences. Distinguish local static temperature from total
temperature before using any engine station observation. Expansion relations
and shock temperature changes are documented by
[NASA isentropic flow](https://www.grc.nasa.gov/www/k-12/airplane/isentrop.html) and
[normal shocks](https://www.grc.nasa.gov/WWW/k-12/airplane/normal.html).
These do not establish the actual F135 plume's shock locations or temperatures.

**The VTOL discrepancy remains open.** The retained Navy footage shows external
red/orange exhaust-region light, particularly around
[2:42.8](https://www.youtube.com/watch?v=rIroDPghWF4&t=162s), with earlier user
observations at 2:38 and 2:41. See the
[observation ledger](proposals/f35b-fdm.md#observations-hypotheses-and-unresolved-discrepancies-2026-10-06)
and retained frames. Gas/particles, illumination and optical path contributions
remain unresolved. The designer states operational hover does not use AB:
[Renshaw's 3BSD account](https://www.codeonemagazine.com/c5_article.html?item_id=137).
Do not enable AB or invent external fuel burning to force the match. Conversely,
do not dismiss the observed external glow merely because AB is inhibited.
Night camera conditions constrain the comparison; they do not imply a large
daylight-visible flame at every 100% throttle condition.

## Implementation prompt

Read `AGENTS.md`, this document, the physical-correction report and the original
engine brief. Preserve the current rigid geometry, native thermal fixes,
full/installed exports, Earth-backed stand and concurrent work. Implement a
physically motivated spatial exhaust approximation and investigate the new
appearance failures; do not simply retune one RGB or paint a rainbow gradient.

1. Reproduce the user's dry VTOL and AB-onset cases with actual native state.
   Inspect total and burned-AB fuel, augmentation, gas-temperature station and
   validity, nozzle pose, physical source powers and display settings. Compare
   against the earlier accepted-looking artifacts while keeping their known
   radiometric flaws separate from their useful spatial appearance.
2. Introduce distinct spatial inputs for local gas/particle temperature,
   extinction/particle loading and chemically excited emission. Use a documented
   reduced model and uncertainty ranges where public F135 data is absent.
   Localized reaction emission must not automatically occupy every part of the
   hot downstream plume with identical species ratios. Account for axial and
   radial structure; add shock/turbulent structure only with a stated physical
   or explicitly provisional basis. Do not hardcode a decorative sequence of hues.
3. Precompute expensive spectra and spatial solutions into compact tables or
   basis fields. Runtime samples local temperature/composition/source strength
   and integrates emission/absorption along the view. A colormap is useful as
   a representation of this model, not as its physical cause. Bound interpolation
   error and total source power across the complete field; keep offline work,
   draw cost and user-controlled resources explicit. No runtime spectroscopy.
4. Diagnose the absent dry powered-lift glow using separated gas, solid,
   reflection and scene-light contributions. A uniformly cool grey-particle
   volume is one restrictive hypothesis to test, not proof that the footage
   cannot occur. Test geometry/depth and radiance separately. Neither a global
   brightness multiplier nor AB activation is sufficient evidence of a fix.
5. Verify local spectra/transfer against independent numerical references, and
   test physical-state-to-field behavior through cold start, idle, dry99%, AB
   ignition/sustain/cutoff, full-throttle powered lift and shutdown. A uniform
   input may correctly give uniform chromaticity; tests must also establish
   that nonuniform physical inputs produce the corresponding spatial emission.
   Test AB transitions for causal source changes and downstream transport where
   modeled, rather than an arbitrary render-time fade.
6. Keep numerical and appearance acceptance separate. Required appearance
   comparisons include rear/oblique views, daylight and night at fixed recorded
   exposure, plus clipping/gamut checks at AB onset. Report missing image
   qualification honestly. Follow AGENTS.md for requested browser/GPU runs and
   servers; this saved prompt alone does not authorize starting them.

0sfs owns aircraft emission assets and visual evaluation. JSBSim owns any new
engine/flow dynamics and state; FOSS Earth owns generic scene exposure/HDR
composition fixes. Reuse engine-profile-driven mechanisms. Preserve source
units, thermal/display separation, pause/recovery, readiness and render-on-demand.
Retain findings and artifacts in the established docs/evidence layout. Run
changed-code checks, then full CI once. No ground collision, gear or sound work.

Completion requires an explanation of the actual causes found, the spatial model
and its assumptions, tests that expose the reported limitations, and explicit
remaining differences from the referenced real-world appearances.
# Latest comparison: dark climb and luminous dry VTOL

Read [the two-night-video analysis](validation/f135-night-video-comparison.md)
before further tuning. The user still sees no dry plume and now reports a huge
AB plume. The new reference loses its bright plume around 1:06 while navigation
lights remain visible; this is consistent with AB cutoff, without proving zero
dry emission. Preserve both it and the carrier landing as constraints. The last
finite-core change increased modeled sustained-AB exterior light about 18.61×;
its physical motivation and passing tests are not appearance acceptance.
