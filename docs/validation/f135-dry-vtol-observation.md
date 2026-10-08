# F135 dry powered-lift light: observations and unresolved sources

Recorded 2026-10-06. **The night-landing appearance mismatch remains open.**
The user sees clear light outside the downward nozzle in real footage and cannot
reproduce it in dry powered lift. The later [afterburner response work](f135-exhaust-response.md)
improved AB appearance and usability in their session; it did not establish a
physical explanation or an accepted match for this dry case. This ledger separates
the observation, source hypotheses, display limitations and acceptance work.
After the finite-core change below, the user's latest report is **dry exhaust
still shows nothing and afterburner is huge**. Appearance acceptance has failed;
passing checks and increased numerical emission do not close that mismatch.

The later [mechanism investigation](f135-dry-vtol-mechanism.md) measures the
landing sequence's brightness bands and strobe behavior, ranks thermal emission,
scattering, deck and camera explanations, and records the edited sequence's
failure to show the landing patch after departure. It separates the concurrent
non-gray particle-source correction from unfinished impingement, receiving-surface
and observer work. No appearance acceptance is implied.

## Reference observations and their limits

| Reference | What it establishes | What it does not establish |
| --- | --- | --- |
| Royal Navy footage credited in Navy Lookout's video, [2:38](https://www.youtube.com/watch?v=rIroDPghWF4&t=158s), [2:41](https://www.youtube.com/watch?v=rIroDPghWF4&t=161s), and the downward-nozzle close-up around [2:42.8](https://www.youtube.com/watch?v=rIroDPghWF4&t=162s) | The retained frames show an external red/orange luminous region. The landing close-up also shows a bright patch beneath the downward nozzle. This is more than a view of glowing internal hardware. | Exact throttle, augmentation fuel flow, gas or surface temperature, radiance, composition, and how much light comes from emission, scattering or reflection. The visible glow alone does not identify afterburner operation. |
| F-35 Lightning II Pax River ITF photographs [DVIDS 8096418](https://www.dvidshub.net/image/8096418/f-35-test-team-performs-first-night-srvl-aboard-hms-prince-wales) and [8096416](https://www.dvidshub.net/image/8096416/f-35-test-team-performs-first-night-srvl-aboard-hms-prince-wales), Kyra Helwick, 2023-10-29 | Primary night-landing references with aircraft, ship, date and photographer provenance. Both captions identify an F-35B vertical landing aboard HMS *Prince of Wales*. Their title mentions the evening's first night SRVL; the individual captions say VL. | These are different captures from the supplied video. Their captions contain no engine telemetry, temperature or radiometric calibration and do not identify a light-production mechanism. Do not silently label every pictured landing SRVL from the gallery title. |
| NAVSEA/Carderock, [F-35B trials on JS Kaga](https://www.navsea.navy.mil/Media/News/Article/4053212/carderock-team-provides-critical-technical-support-for-f-35b-sea-trials-on-js-k/), 2025-02-04 | Significant deck thermal loading during vertical landing; engineering limits on hover duration and landing intervals; real-time temperature monitoring beneath the flight deck. | No reported visible incandescence, spectral measurement or numerical surface-temperature history. A bright deck patch in another image is not proof that deck material is incandescent. |
| Lockheed engineer Kevin Renshaw, [three-bearing swivel-nozzle history](https://www.codeonemagazine.com/c5_article.html?item_id=137), “DARPA ASTOVL And Beyond” | Afterburner is not used in X-35B/F-35B hover. The same article separately describes older JT8D bent-nozzle afterburning ground experiments. | A complete public F135 transition/STO inhibit schedule, or a direct measurement of the supplied clip. Historical ground-test capability is not evidence for operational F-35B hover augmentation. |

The unretouched video frames are retained at [2:38](../../validation/evidence/aircraft/f35b/engine-review-2026-10-06/frames/vtol-158.png),
[2:41](../../validation/evidence/aircraft/f35b/engine-review-2026-10-06/frames/vtol-161.png)
and [about 2:42.8](../../validation/evidence/aircraft/f35b/engine-review-2026-10-06/frames/vtol-162p8.png).
[Extraction provenance](../../validation/evidence/aircraft/f35b/engine-review-2026-10-06/research.json)
records source URLs, limits and hashes. The close-up is visibly not an empty,
dark free jet. Preserve that constraint while investigating its cause.

Exposure, shutter time, aperture, gain, white balance, spectral response,
tone curve, grading and channel clipping are not known for the supplied video.
The dark-looking background does not prove zero ambient illumination. Those
unknowns prevent a unique conversion from recorded pixels to source spectrum
or temperature; they do not erase the observed light. Camera color and tonal
processing can alter brightness and hue, as described in [Adobe's camera documentation](https://helpx.adobe.com/camera-raw/desktop/using/make-color-tonal-adjustments-camera.html).

## What the retained simulator calculation actually says

The [source-correction numerical record](../../validation/evidence/aircraft/f35b/exhaust-correction-2026-10-06/numerical/README.md)
has a dry powered-lift gas input of **1003.13 K** and an exterior photopic source
integral of **0.0002612 cd**. Its whole internal-plus-external source integral is
**0.01643 cd**, with **3570.34 W** in the particle-source power integral. These
are outputs of the `imposed-gas-bath-v2` grey-particle approximation, not measured
F135 light. Candela here integrates local source cd/m³ over volume; it is not
pixel luminance, escaped flux or a measurement of a real engine. This is the
retained baseline before the potential-core investigation below.

The native input falls back to the generic JSBSim EGT expression, rather than a
qualified nozzle-exit static or total temperature. The [native audit](../../validation/evidence/aircraft/f35b/exhaust-correction-2026-10-06/native/README.md)
records the equation, aircraft XML and fuel/spool behavior. At equal spool and
inlet temperature, the dry conventional and powered-lift proxy temperatures are
the same; that equation does not solve lift-fan shaft extraction, bleed, nozzle
expansion or spatial temperature variation. Neither the small optical output
nor the label “EGT” validates those missing station relationships.

The grey extinction coefficient, particle temperature tied to the imposed bath,
spatial mixing basis and fuel-power ceiling are assumptions. A dimensional
calculation and an energy upper bound do not identify soot loading or prove a
closed mass/energy balance. The later conditional CH(A) parcel is driven by
burned AB fuel inside the augmentor; it does not supply a dry primary-combustor
flame visible through the turbine. Missing dry chemistry is unquantified, not
established physically absent. See the [response checkpoint](f135-exhaust-response.md)
for the current parcel and mean-enthalpy approximation.

The same numerical record separates an ideal receiving plane from the free jet.
For its assumed height and 20% diffuse reflectance, the exterior gas alone gives
an unattenuated bound of about **2.33 × 10⁻⁴ lux** at the plane and **1.49 × 10⁻⁵ cd/m²**
in reflected luminance. Its filled-aperture gas/metal alternatives test different
source hypotheses; they are not additive contributions or implemented
metal-to-deck illumination. Deck heating would additionally need heat transfer,
material properties, initial conditions and a time history. The NAVSEA thermal
study does not fill those optical inputs.

## Confirmed rendering limitations, without a fabricated diagnosis

- No double alpha attenuation was found in the audited plume path.
  [The renderer](../../src/flight/aircraft/createEngineExhaust.ts) integrates
  emission with transmittance, returns that emission with alpha `1 − T`, and
  selects premultiplied Porter–Duff blending. Multiplying its emission by alpha
  again would not correct the dry source. This code audit is not a GPU capture.
- The audited Earth raster material has lighting disabled, so it cannot receive
  the approximate dynamic exhaust light. The stand has no modeled receiving
  deck. Increasing a free-jet source cannot establish an impingement or heated
  surface model. The approximate light also omits internal hardware illumination,
  self-absorption and near-field occlusion; these omissions need separate work.
- The audited scene used hemispheric fill without a physical day/night sky
  solution. Global exposure and fill controls were absent before this follow-up;
  explicit controls are now implemented in FOSS Earth, their owning repository,
  under **Renderer → Lighting and exposure** (moved on 2026-10-07, ids and values
  kept, to the Sky tab, where a physical sky now lights the flight and exposure
  compensation applies on top of its exposure:
  [Sky](../../../foss-earth/docs/proposals/sky.md#migration)). Exposure compensation is −16…16 EV,
  default 0; it sets shared material exposure to `2 ** EV`. Ambient fill is a
  0…4 multiplier, default 1, preserving the existing fallback/simulation/Google
  light relationships. Both apply live and request a frame when visible state
  changes. Fill does not alter emissive imagery, background or local emitters;
  custom imagery shaders can bypass shared exposure. Reducing fill is a viewing
  experiment, not a night-atmosphere simulation. No HDR pipeline was enabled.
- Shared linear-HDR composition remains limited: the material/image-processing
  and blend path is not a qualified whole-scene radiometric camera. Exposure
  changes must leave native temperatures, fuel and source watts unchanged.
  A visible result at a chosen exposure alone is not physical calibration.

The relevant implementation owners are [FOSS Earth's raster material](../../../foss-earth/src/engine/babylon/createRasterTilesRuntime.ts)
and [scene runtime](../../../foss-earth/src/engine/babylon/createBabylonRuntime.ts)
for globe lighting/display, and [0sfs gas optics](../../src/flight/aircraft/engineGasOptics.ts)
for aircraft source distributions. The source and receiver limitations are
independent: a lit receiver cannot rescue a wrong source, and a correct source
will not light a material that ignores dynamic lighting.

## Implemented finite-core hypothesis and its numerical result

A jet need not cool to a mixed mean everywhere immediately at the lip. NASA's
[direct rotational-Raman temperature measurements](https://ntrs.nasa.gov/api/citations/20170005666/downloads/20170005666.pdf),
NASA/TM–2017–219504/REV1, printed pp. 16 and 18, figures 15 and 17, measure
centerline and radial mean/fluctuating temperatures in high-speed heated jets.
Table 1 includes a 795 K, Mach 0.9 case with static temperature ratio 2.7.
This directly supports a finite thermal core and shear-layer mixing; it does
not calibrate an F135 core length, opacity or temperature. The [retained report
and figures](../../validation/evidence/aircraft/f35b/dry-vtol-response-2026-10-06/README.md)
preserve this distinction from velocity-only evidence.

NASA's
[heated-jet measurements](https://ntrs.nasa.gov/api/citations/20205007805/downloads/TM-20205007805.pdf),
printed pp. 7–9, figures 8, 10 and 11, show a near-exit thermal core with mixing
layers and downstream decay. The experiment is Mach 0.08 at 353 K: it supports
that structure, not a measured F135 temperature field. Its thermal core decays
sooner than its velocity core. NASA's [jet-modeling review](https://ntrs.nasa.gov/api/citations/20140002507/downloads/20140002507.pdf),
printed p. 12, figure 6, shows velocity-core dependence on temperature ratio and
Mach number. A velocity-core correlation cannot be relabeled thermal calibration.

The implemented, baked `potential-core-shear-v1` basis is common to dry and AB
operation. It uses a shrinking thermal core, surrounding mixing layer and
downstream centerline temperature decay, with a
nominal length of **6 exit radii = 3 exit diameters**, and a **4–10 radius**
sensitivity interval. These are declared engineering hypotheses, not values
measured from the F135 footage. Here “3 diameters” describes a length, not a
measurement of the three-dimensional flow. The correction changes spatial mixing
without raising the native bath temperature, adding AB in hover, choosing a
target RGB, or changing source power through exposure. It remains an imposed
temperature/particle-loading proxy, not a solved mass and enthalpy transport field.

The [retained numerical report](../../validation/evidence/aircraft/f35b/dry-vtol-response-2026-10-06/numerical/report.json)
freezes both profiles and the existing native observations. The dry powered-lift
input remains **1003.13 K**, with zero burned AB fuel. The exterior source-volume
integral rises from **0.0002612 to 0.0113786 cd**, a factor of **43.56**, while the
particle-source power bound rises from **3570.34 to 5112.42 W** under the unchanged
**574164.49 W** ceiling. CH/C₂ contribution remains zero. This approximately 44×
factor is a change in integrated source strength, not escaped flux, pixel
brightness, a measured F135 result or proof of visible dry exhaust.

Independent transverse transfer through the same numerical field gives:

| Distance past exit | Previous luminance (cd/m²) | Current luminance (cd/m²) |
| --- | ---: | ---: |
| 0 m | 0.0043960 | 0.0185918 |
| 0.5 m | 0.0001200 | 0.0143004 |
| 1 m | 0.00000889 | 0.0096932 |
| 2 m | 0.0000000773 | 0.0044658 |

At the renderer's 1000 cd/m² white reference and 0 EV, the current exit and 1 m
rows correspond to linear scene luminances **1.86 × 10⁻⁵** and **9.69 × 10⁻⁶**.
The report also calculates illustrative exposure offsets; these are neither a
human detection threshold nor estimates of the reference video's camera settings.
Changing the assumed core from 4 to 10 radii changes dry exterior source strength
from **0.0078483 to 0.0172148 cd**. This sensitivity is physical-model uncertainty,
separate from integration error.

The common basis also changes afterburner. Retained onset exterior source strength
rises **27.74 → 249.30 cd** (8.99×), and sustained AB rises
**2009.78 → 37408.67 cd** (18.61×), with unchanged CH power in each comparison.
That is a concrete source change relevant to the user's oversized-AB report;
without a matched capture it is not proof of the on-screen extent's cause.
The dry correction cannot be accepted independently of this AB regression.

Across nine fixed exterior transverse rays, 32 midpoint samples have at most
**0.2852%** relative luminance error against 4096 samples; the 2048/4096 comparison
differs by at most **0.000122%**. These checks integrate an axisymmetric numerical
field at fixed axial stations. They do not cover posed nozzle geometry, opaque
depth, the GPU shader, or a full rendered image, and do not replace the earlier
posed-ray error evidence. Frozen input hashes and the independent sampler are
retained with the report. Native input temperature, zero-fuel behavior, source
power bounds and exact AB-flag-only field invariance are also checked; no new
native engine-dynamics run is represented.

## Acceptance target and missing measurements

1. **Explain the observed regions separately.** Keep internal hardware, external
   free-jet light and the deck patch as three observations. For each proposed
   contributor, state its equation, inputs, units, provenance and remaining
   uncertainty. Distinguish emitted, scattered and reflected light from surface
   incandescence. Retain operational hover AB inhibition.
2. **Qualify the engine state and source.** Record dry/AB status, burned fuel,
   spool, gas-proxy definition, solid temperatures, aperture, nozzle angle and
   pose. Needed real-engine evidence includes station-defined temperatures,
   mass flow/pressure, particle loading, spectral radiance or defensible bounds,
   and the spatial distribution through and outside the nozzle. Do not infer
   those quantities uniquely from compressed video RGB.
3. **Test the proposed optical structure numerically.** Retain source integrals,
   ray luminance and local temperature/loading distributions across internal,
   exit and exterior domains. Check constant-input AB-flag invariance, zero-fuel
   behavior, power accounting, resolution sensitivity and common dry/AB behavior.
   Separate the numerical error bound from uncertainty in the physical inputs.
4. **Make a comparable viewing experiment.** Freeze the same dry powered-lift
   state and compare rear/oblique views under recorded fill, exposure, white
   reference and tone mapping; vary display parameters independently of physics.
   Record plume/nozzle/background levels and channel clipping. Add a documented
   lit receiving surface when testing the deck patch. Generic Earth imagery is
   not a substitute for that receiver. The reference camera remains uncalibrated.
5. **Close appearance acceptance explicitly.** The target is plausible visible
   dry powered-lift exhaust-region light under comparable dark viewing conditions,
   with a defensible physical source and a separately explained deck interaction.
   Passing software checks, a brighter image, or the improved AB result does not
   close it. Retain the user's subsequent observation and any unresolved mismatch.

## Completed software checks and open appearance acceptance

The [retained checkpoint](../../validation/evidence/aircraft/f35b/dry-vtol-response-2026-10-06/README.md)
contains incremental typecheck/lint, 64 related files with **783 passing tests**,
and one completed 0sfs CI run: **174 files, 1851 passing tests and one existing
expected failure**, followed by successful build/artifact checks. The FOSS Earth
controls passed their corrected focused tests and one completed CI run:
**135 files, 1167 tests**, lint, typecheck and build. Initial stale UI-expectation
failures remain retained alongside their successful corrections.

These checks verify software behavior and the numerical approximation, not the
night-landing observation. The latest user feedback remains unaccepted as stated
above. No browser, server, GPU capture or benchmark was performed for this pass.
The user declined GPU testing; these acceptance requirements do not authorize a
new GPU run. Continue from the [physical follow-up prompt](../f135-plume-physical-followup-prompt.md)
and [current response report](f135-exhaust-response.md), preserving their limits.
