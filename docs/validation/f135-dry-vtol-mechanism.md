# F135 dry powered-lift glow: mechanism investigation

Recorded 2026-10-06. The footage supports a **structured luminous jet with a distinct near-deck interaction**, rather than only a glowing nozzle interior. Thermal emission from hot exhaust particles, modulated by the flow and affected by the camera response, is the leading working explanation. The evidence does not identify the particle population or prove that every bright pixel is self-emission. Reflected and scattered nozzle light can contribute, and the near-deck patch can combine reflected light with a luminous impinging jet. **The physical recreation and visual acceptance remain unfinished.**

This aircraft-specific investigation belongs to 0sfs. It extends the [observation ledger](f135-dry-vtol-observation.md) and preserves the user's later report that the finite-core version still showed no dry plume and an excessively large AB plume. The [night-climb comparison](f135-night-video-comparison.md) remains a second constraint: a useful model must accommodate both the carrier glow and the conventional-flight nondetection without inventing a hover afterburner. The present footage work changes no runtime physics, shaders or engine assets. The parallel implementation has replaced the grey particle spectrum with a non-gray soot spectrum and consistent integrated power; that correction is distinct from the proposed impingement and receiver work below.

## Current night feedback and controls, 2026-10-07

While the sky agent is still working, the user reports that the faint red dry
exhaust is now clearly visible at night and satisfactory to them. They request
a 0.5–3× dry display adjustment, report audible AB differences at zero AB gain,
and reject the remaining AB sound lead over visible flame, especially from cold.
This feedback accepts the reported faint dry appearance, not absolute source
calibration, deck interaction or AB timing. The
[controls and audio causality record](f135-exhaust-controls.md) separates those
results and documents the current correction. The default dry multiplier is
1× the existing model; its temperature/particle assumptions remain unchanged.

## Latest lighting observation, 2026-10-07

In a subsequent local test at `http://localhost:5173/fly/`, the user set
**Ambient fill multiplier = 0.02** and **Exposure compensation = +8.8 EV**.
They then saw the red exterior exhaust in dry mode and described it as exactly
the appearance they had sought. The aircraft and ground became solid white.
No exhaust runtime code had changed since the preceding correction; the build
request had reached investigation only when this new observation arrived.
Throttle, conversion/nozzle pose, map provider, camera, other settings and native
state were not recorded. This is user visual feedback, not a synchronized capture
or a complete carrier/deck comparison. The [observation and code-audit receipt](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/lighting-observation-2026-10-07.json)
keeps this new result separate from the earlier failed test.

This supersedes the earlier blanket absence report: the current dry source can
be visible at the reported display settings. It supports a scene/display
contribution to the previous invisibility. It does not measure source radiance,
establish a unique emitter, qualify engine station temperatures, resolve deck
interaction or accept the remaining AB audiovisual response.

The shared lighting code uses fixed hemispheric fill and a flat clear color;
raster ground is unlit/emissive. Shared material exposure is `2 ** EV`, with tone
mapping disabled. At +8.8 EV the multiplier is **445.72**; combining it with
0.02 fill gives **8.914** times the original linear fill contribution, before
material response. Emissive raster imagery does not receive the fill reduction.
These verified code relationships explain plausible whitening pathways but are
not a GPU measurement of the user's particular material/pixel contributions.
The existing CPU dry-source exposure sweep is consistent with visibility at high
exposure; no new source-temperature or brightness adjustment is justified by
this observation.

The [FOSS Earth sky/lighting implementation prompt](../../../foss-earth/docs/sky-lighting-implementation-prompt.md)
sets the next controlled comparison: freeze physical emitters, audit light and
display units/composition, implement coherent solar/sky/surface illumination and
a shared Sky tab, then reassess the exhaust separately. Meaningful night
radiometry needs that environment/display contract. Engine equations and AB
timing can still be investigated independently; no engine replacement was
installed during this audit. Deployment remains held and the standing browser,
GPU and server restrictions remain in force.

## Local test rejection and causal audit, 2026-10-07

After testing locally, the user still sees exterior exhaust light only with AB,
and reports that visible AB develops substantially later than its sound,
especially from cold. This rejects the current dry powered-lift appearance and
AB audiovisual response. The exhaust correction was committed locally as
`9c1956344bf8edd7c8d60a570e083033b86cc94f`; it was not pushed or published before
the user called time out. Deployment is held. The earlier software checks and
partial numerical qualifications do not satisfy these appearance requirements.

The [post-test reanalysis](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/post-test-2026-10-07.json)
reads the retained refined CPU rays and native trace, records their hashes and
uses only native columns from the historical trace. It performs no new engine,
GPU, browser, server or benchmark run. It establishes the following distinctions:

- **Dry emission exists in the equations but is effectively invisible under the
  stated display example.** The powered-lift boundary remains the imposed
  **1003.13 K** bath and **0.025 m⁻¹** particle absorption at 550 nm. A transverse
  ray at the lip gives **0.0167047 cd/m²**, with linear RGB
  `[0.0736207, 0.00146479, 0] cd/m²`. Unit gas intensity, the default
  **1000 cd/m²** white reference, zero exposure offset, Reinhard mapping and
  8-bit sRGB encoding round this source alone on black to `[0, 0, 0]`. At +8 EV
  the same source becomes `[37, 1, 0]`. This is an illustrative CPU conversion,
  not a measurement of the live tone mapper, scene, user settings or footage
  camera. Matched night exposure is necessary for comparison, but changing it
  alone does not explain the observed bands and broad near-deck luminous region.
- **The source cap is not the cause.** Whole-field particle radiation is
  **733.50 W** against an allowed **574,164.49 W**. Increasing that ceiling cannot
  brighten this case. No AB-only disable of the dry optical source was found.
- **The dry physical inputs remain unqualified.** The native bath falls back to
  `TAT_C + 363.1 + 357.1 * N2norm + 273.15`, a generic EGT schedule. It is not a
  defined nozzle total/static temperature. F135 XML increases dry fuel demand
  during conversion but does not close the corresponding core/bypass, lift-fan
  shaft-work, bleed and rear-nozzle energy/flow balance. More fuel does not by
  itself establish a hotter rear jet: shaft extraction and flow division must
  enter that balance. The optics impose a dry particle population at that bath
  temperature and a prescribed smooth mixing field. Neither the loading nor
  its temperature distribution is measured for F135. The spectral correction
  makes this assumed source more consistent; it does not validate those inputs.
- **Sound and light consume different AB causes.** Audio adds its AB jet gain
  from the native augmentation flag and thrust proxy; it does not consume
  burned AB fuel. Native `FGTurbine::Run()` selects its full augmented thrust
  table immediately while fuel approaches demand at **5000 lb/h per second**.
  The thermal/optical path instead uses the excess current fuel actually counted
  as burned. At the first active flag, the retained trace has **zero** burned AB
  fuel and **1004.76 K** gas. Burned AB fuel first becomes positive **0.0833 s**
  later; the gas proxy is **1181.77 K** at +1.0083 s and **1368.05 K** at
  +2.0083 s. This establishes a causal signal mismatch, not the exact user's
  device or visible-pixel latency. The current conditional internal reaction
  source does not qualify prompt visible emission across the nozzle exit.

The next physical correction must replace these source assumptions rather than
add a dry brightness gain or an AB display/audio timer. JSBSim must provide
station-defined rear-nozzle flow and heat-release observations, with a declared
reduced energy/flow model and bounds where public measurements are unavailable.
Audio, thrust and optical emission must then consume the same evolving physical
engine state; their different acoustic and radiative responses still need
independent validation. Dry particle production/survival, thermal distribution
and any scattered nozzle light need separate, bounded source hypotheses.
Compressible free-jet and impinging-flow fields must conserve energy and account
for the observed spatial structure; a deck receiver/heating calculation is a
separate contribution. Expensive flow, chemistry and spectra belong in offline
tables with qualified interpolation domains. A matched night comparison and
cold/warm AB transition observation are required before appearance acceptance.
The standing restriction against initiating GPU testing remains in force.

## What the sequence actually shows

The source is Navy Lookout's [*Back in the game — Flying the F-35 from HMS Queen Elizabeth*](https://www.youtube.com/watch?v=rIroDPghWF4), whose description credits Royal Navy footage by LPhot Dan Shepherd. The original retained references at [158 s](../../validation/evidence/aircraft/f35b/engine-review-2026-10-06/frames/vtol-158.png), [161 s](../../validation/evidence/aircraft/f35b/engine-review-2026-10-06/frames/vtol-161.png), and [162.8 s](../../validation/evidence/aircraft/f35b/engine-review-2026-10-06/frames/vtol-162p8.png) are different shots in an edited montage. They are not a continuous record of one engine transition.

The newly inspected landing close-up was decoded at 25 frames/s without grading, resizing or retouching. The [retained record](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/footage/README.md) includes source and frame hashes, extraction details, exact analysis code, measured profiles and local reference images. Media redistribution rights are not established, so the PNGs remain ignored local reference files; their provenance and numerical results are retained in Git. Frame times are nominal decoded times, not synchronized aircraft telemetry.

| Clue | Direct observation | Consequence and limit |
| --- | --- | --- |
| Free-jet structure | [162.16 s](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/footage/landing-010.png) has several red brightness bands between the downward lip and deck. They continue in the following frames as the visible gap shortens. | A smooth, monotonically fading cone misses observed structure. Compression/expansion cells are a plausible cause, but RGB bands alone do not measure shocks, Mach number or temperature. |
| Near-deck maximum | The lower bright region broadens into an orange/yellow cone in the image above the projected deck line, with a thin lateral red region along the deck. | Investigate both impinging flow and a receiving surface. Single-view projection, channel clipping and bloom prevent separation of volume emission from a bright surface's optical spread. A flat incandescent deck alone does not explain the upstream bands. |
| Aircraft strobe | The adjacent light changes from green-dominated to a large white flare and back while the red jet structure persists: compare [162.16 s](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/footage/landing-010.png), [162.76 s](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/footage/landing-025.png) and [162.88 s](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/footage/landing-028.png). | Strobe scattering alone is insufficient. White veiling glare and reflections visibly change, so optical contamination is present; steady nozzle illumination is not excluded. |
| Deck persistence | An additional public download covering 161–169 s succeeds, but the landing view cuts to the [nose close-up](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/footage/landing-030.png) at about 162.96 s and then [daylight footage](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/footage/extended-005.png). | There is no uninterrupted view of the vacated landing patch. Neither persistent deck incandescence nor its absence is established. |

The reproducible pixel diagnostic uses the center strip `x=875..924`, rows `500..839`, in the 1920×1080 frames. It subtracts the same-row background strip `x=760..809`, computes `R − (G+B)/2`, and takes a five-row moving mean. At 162.16 s, clear interior peaks occur near rows 591, 637 and 677; the strongest lower peak is near row 784. At 162.36 s, intermediate peaks occur near 609 and 658, with the lower maximum near 734. These positions quantify nonuniformity; the automated list also contains shoulders and compression artifacts, so its number of peaks is not a count of physical shock cells. The apparent exit width is roughly 100 pixels in the earlier close-up; no camera calibration converts that estimate into an engine dimension.

The fixed aircraft-light ROI's mean encoded RGB changes from approximately `[8.5, 60.7, 21.2]` at 162.16 s to `[201.3, 200.4, 202.8]` at 162.76 s. The moving aircraft, exposure response, clipped channels and background within that ROI preclude photometry. This is a temporal/color discriminator only. All reported pixel values are encoded video values, not linear radiance.

## Mechanisms ranked against those clues

| Working hypothesis | Evidence fit | What would establish or reject it |
| --- | --- | --- |
| **Thermal emission from exhaust particles, structured by the compressible jet and near-deck flow** | Best combined explanation of red free-jet bands, attachment to the nozzle and a different lower-region shape. The emitter need not be reacting afterburner fuel. Temperature and particle density both affect the radiation. | Qualified nozzle station conditions, particle concentration/size/optical properties, and an absolute spectrum. The footage does not establish that soot dominates; “hot air glows” is not a sufficient source model. |
| **Nozzle light scattered by exhaust particles, plus deck reflection** | Plausible contributor, especially close to a hot aperture and a receiving plane. Density structure can modulate scattering too, so bands do not uniquely prove self-emission. | Incident hardware radiance and occlusion, particle scattering cross section and phase function, and receiver reflectance. An arbitrary downward point light is not this calculation. |
| **Camera near-infrared sensitivity** | A potentially large modifier of any thermal source; compatible with a red-looking camera image that differs from naked-eye visibility. It cannot create energy or identify the emitter by itself. | Source-camera response, IR filter, exposure and processing. None is identified for this clip. Keep this in an explicit observer calculation, not as a hidden visible-emission multiplier. |
| **Deck incandescence** | Real deck heat loading makes it possible in principle, but it does not explain the upstream luminous jet. The strongest image region may include a surface contribution. | Surface temperature, emissivity, dwell time, thermal conduction and an uninterrupted post-jet cooling sequence. This montage supplies none of those measurements. |
| **Strobe flare/scattering as the sole cause** | Poor fit: the red structure survives the large green/white temporal change. | A synchronized radiometric sequence could quantify the remaining contamination. The current observation rejects only the sole-cause explanation, not all scattered illumination. |

NIST's [*Imaging Through Fire Using Narrow-Spectrum Illumination*](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=925024), §2, distinguishes molecular infrared bands, thermal soot radiation and heated solid surfaces. It supplies the relevant separation of mechanisms; its natural-gas fire experiments do not supply F135 soot loading or exhaust temperature. Strong CO₂/H₂O mid-infrared emission must not be placed into visible RGB merely because it is thermal radiation.

NASA's [Henderson, Bridges and Wernet impinging-jet experiment](https://ntrs.nasa.gov/citations/20020088423) observes a moving Mach disk, near-plate recirculation, compression/expansion regions and a wall jet at nozzle pressure ratio 4 and plate spacings of 1–5 exit diameters. This establishes relevant flow structures, not optical emission or F135 operating conditions. Its seeded flow visualization is not evidence that an unseeded engine must glow. A similar structure in the footage is an inference requiring station data before quantitative use.

The [Military Aviation Authority's ship-air certification account](https://www.gov.uk/government/news/qec-ship-air-certification) identifies thermal metallic spray protecting the deck from aircraft efflux. The [NAVSEA/Carderock Kaga trial account](https://www.navsea.navy.mil/Media/News/Article/4053212/carderock-team-provides-critical-technical-support-for-f-35b-sea-trials-on-js-k/) records thermal loads and below-deck monitoring. These support the need for a thermal boundary model; neither reports visible deck incandescence.

## Two useful physical discriminators

Compression can increase **static** temperature and density while conserving total enthalpy; it cannot add arbitrary heat. The diagnostic evaluates the calorically perfect normal-shock relations in [NACA Report 1135](https://www.nasa.gov/wp-content/uploads/2023/03/equations-tables-charts-compressibleflow-report-1135.pdf), using the explicitly illustrative `γ=1.33`. At upstream Mach 1.3 the density and static-temperature ratios are about 1.540 and 1.161; at Mach 1.5 they are 1.912 and 1.270. Total temperature is unchanged to `10⁻¹²` in these calculations. These are conditional examples, not inferred F135 Mach numbers. Starting from the generic native EGT proxy as if it were a qualified total or exit-static temperature would repeat an earlier unsupported assumption.

The red tail of a thermal spectrum is very temperature-sensitive. The independent Planck calculation gives `Bλ(650 nm,1200 K) / Bλ(650 nm,1000 K) ≈ 40.01`. At 1000 K, `Bλ(940 nm) / Bλ(650 nm) ≈ 146.1`. Integrated photon counts from 750–1100 nm exceed those from 380–700 nm by about **750.53** for flat detector quantum efficiency, using 1 nm trapezoids. This is a grey-spectrum observer illustration, not a prediction for the non-gray runtime soot spectrum or an actual camera.

A real manufacturer's [FLIR IR-cut specification](https://softwareservices.flir.com/FG-P5G-51S4/latest/40-Installation/InfraredFilters-FG.htm) lists average transmission of 1% from 750–1100 nm. Hypothetically applying a flat 1% transmission to the preceding flat-QE calculation yields an NIR photon contribution about 7.51 times the unfiltered visible count. That is deliberately not a model of the Navy camera: wavelength-dependent quantum efficiency, filters, lens, Bayer response and video processing are unknown, and other filters can reject NIR much more strongly. It explains why identifying the camera response matters before interpreting video hue as visible radiance.

## Conditional model that can be implemented

The native input is still an imposed gas bath derived from generic EGT, as
recorded in the [station audit](../../validation/evidence/aircraft/f35b/exhaust-correction-2026-10-06/native/README.md).
It is neither an established exit-static temperature nor an established nozzle
total temperature. The [September 2012 P&W chart preserved by USPTO](https://ptacts.uspto.gov/ptacts/public-informations/petitions/1476834/download-documents?artifactId=SfieZYkZxBtaDWFoZf8bQSk2W6j-ZDqV5nB2Kgwx3YyUiUZZL_VF-lI)
gives powered-lift bypass ratio 0.51, overall pressure ratio 29 and rear hover
thrust 83.1 kN. It gives no nozzle station temperature, nozzle inlet pressure,
mass flow, fan pressure ratio or remaining rear bypass after diversion. Overall
pressure ratio is not nozzle pressure ratio. Those ratings cannot qualify a
Mach solution or justify adding recovered kinetic heat to the existing bath.
Likewise, the native flow proxy and authored visual throat/exit areas are
independent surrogates, not measured boundary conditions of one solved nozzle.

Hot core and cooler bypass parcels could produce more visible radiation than
one mean temperature at the same total enthalpy. That is a conditional physical
mechanism, not permission to reinterpret this EGT proxy as a measured mixed mean
and invert it into a hotter dry core. The remaining core/bypass flow split,
temperature station and soot mass in each stream would also be needed. No dry
hot parcel or extra heat source has been installed from that unqualified
inversion. Engine flow/thermal dynamics belong in JSBSim when the boundary can
be declared and tested; optical integration belongs in this aircraft model.

The common dry/AB thermal source should use a particle absorption spectrum and its matching integrated power, with the same underlying physical inputs. This is the current non-gray source correction. It does not establish particle mass, nozzle temperature or visual calibration. Changing the spectrum must not silently increase temperature, opacity or burned fuel to force the frame to match.

The additional flow work needs a separate, explicit contract: nozzle total enthalpy and pressure, mass flow, actual aperture geometry, ambient pressure, particle transport and the actual receiving-plane normal and distance. An offline reduced flow model could produce fields indexed by nozzle pressure ratio, area ratio and height/diameter, conserving mass, momentum and `h₀ = h + |v|²/2`. Compression cells are appropriate only where that solution supports them. Near a real surface the jet decelerates and turns into a wall jet; it cannot continue as an unchanged luminous cone through the deck. Recovered kinetic energy is not new combustion heat.

The radiation then follows local particle temperature and concentration, for example `jλ = κabs,λ Bλ(Tp)` for an LTE particle approximation, with spectral extinction in the transfer equation. Scattering of hot hardware requires its own incident radiance and phase function. A reflected deck contribution is `Lreflected = ρEincident/π` only for a declared diffuse receiver. Stored surface heat requires a separate balance of convective and absorbed radiative input against radiation and conduction; it must not be inferred from the instantaneous optical patch. General terrain/material receiving behavior belongs to FOSS Earth, while the aircraft exhaust source and aircraft-specific impingement inputs belong to 0sfs.

Useful acceptance checks are conservation across conditional flow states; no added power when only camera or AB-selection flags change; physically continuous source and occlusion from interior through the exit; receiver irradiance integrated from visible gas and hardware; and separate predictions of jet, reflected deck and heated-surface light. Fixed-exposure views must then address both carrier and night-climb references. The current observations do not authorize an unmeasured temperature boost, artificial shock-band brightness or a fake illuminated deck as a substitute for those checks.

## Runtime correction and checks

The implemented particle source uses `κλ = κ550 (550 nm/λ)^α`, with reference
absorption **0.025/m**, nominal **α = 1** and sensitivity **1–1.3**. NIST's
[measured absorption spectra](https://www.nist.gov/publications/measured-situ-mass-absorption-spectra-nine-forms-highly-absorbing-carbonaceous-aerosol)
support that exponent interval over 500–840 nm on other flame-generated soot.
F135 loading and the power-law extension outside that interval remain
hypotheses. The bake stores absolute XYZ/RGB emission and a Planck-mean
absorption ratio; the runtime interpolates those tables rather than integrating
spectra per frame. The whole-spectrum source-power bound uses the same law.
Metal tables and native temperatures remain unchanged. The
[spectral evidence](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/particle-spectrum/README.md)
retains independent frequency-form integration, the initial cold-end quadrature
failure and its correction, interpolation errors and the scalar-attenuation
limitation. The runtime still attenuates at κ550; it is not exact spectral
transfer in the optically thick limit.

The [current-source comparison](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/runtime-source/README.md)
holds every native observation and the spatial basis fixed. Dry powered lift
remains **1003.128 K** with **zero burned AB fuel**. Its exterior source Y changes
from **0.0113786 to 0.0102186 cd**, while the particle source-power bound changes
from **5112.42 to 733.498 W**. These are model source integrals, not measured
escaped light. CH/C₂ powers and particle temperatures are identical in the
comparison; zero fuel produces zero gas source, and an AB-flag-only toggle leaves
the entire field unchanged. Sustained AB exterior Y changes only
**37408.67 → 35773.67 cd**, so this correction does not resolve its reported
oversized appearance.

The [CPU exposure comparison](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/runtime-source/exposure-comparison.svg)
uses the same radiance buffer at 0, +8 and +10 EV, with white reference
1000 cd/m² and explicitly documented Reinhard/sRGB mapping. The inspected dry
+10 EV panel shows a faint red free jet without additional heat or combustion.
This demonstrates a mechanism under declared source and viewing assumptions;
it does not reproduce the live scene, the camera or the near-deck bands.

A separate runtime correction makes the approximate nearby light use the same
white-reference conversion as the visible gas. Previously raw candela entered
the light while gas radiance was divided by the reference, making reflected
surfaces **1000× too bright relative to the plume at the default reference**.
The light now divides once. Tests check reference scaling, exposure independence,
exterior-only accounting, hardware exclusion and lifecycle. It remains an
unshadowed far-field point approximation; it is not the receiver or impingement
model described above.

The nearby light also now uses Babylon's glTF inverse-square falloff with a
finite-range taper. Its previous physical falloff ignored positive range in PBR,
so the range control did not limit illumination. The new taper reaches zero at
the chosen range and only reduces the unoccluded source upper bound. This is a
documented visualization distance limit, not a physical prediction that photons
stop propagating there. A focused follow-up passes reference/range behavior and
the affected renderer lifecycle checks.

The [occlusion erratum](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/occlusion-erratum/README.md)
withdraws earlier CPU hardware-clipping claims. The non-indexed exported GLB
returned empty index arrays; the old diagnostic treated those as zero triangles.
The corrected run loads **24,024 triangles per pose**. Original evidence is
preserved with notices, and the geometric attachment/inverse-map checks remain
distinct from the withdrawn optical-occlusion claims.

The complete-input [posed-ray record](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/runtime-source/posed-rays-complete-inputs/report.json)
compares 32, 64 and 128 midpoint steps with 4096 steps, using actual opaque
hardware clipping. On selected non-negligible rays, the maximum relative peak
RGB errors are **4.534%, 2.986% and 0.702%**, respectively. The current 32-step
default fails the retained 1% criterion on twelve selected rays; its diagnostic
exit is **1**, preserved rather than called a pass. The highest relative error
is a very dim cutoff-edge ray; selected bright-ray error still reaches 3.641%.
The refined 2048/4096 reference differs by at most 0.103%. This run includes
the native upstream gas temperature and ambient pressure needed to activate
the conditional AB parcel, with explicit active-source assertions. The preceding
hardware-corrected run omitted those inputs; its AB figures remain a preserved
thermal-only subset, not a qualification of the complete current AB source.
These finite CPU checks neither measure all views nor execute the GPU shader.
The user-controlled 32-step default remains unchanged after their performance
feedback; higher ray counts remain available. Source-table correctness does not
qualify that lower-budget rendered approximation.

A [fixed-32 interval prototype](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/runtime-source/interval-prototype/README.md)
tested redistributing the same evaluations over conservative section-box
intervals. It worsened the selected maximum error from 4.534% to 24.167% and
increased criterion failures from twelve to sixteen. Most offending rays had
no guaranteed vacuum to skip; interval subdivision reduced sampling where
emission varied sharply. The exact negative result is retained, and this
candidate was not installed. It supplies no justification for changing the
physical source or calling the current default numerically accepted.

The footage and spectral diagnostics passed their independent assertions and
focused lint. Application checks and the actual-geometry receiver record are
recorded below. No server, browser, GPU run, benchmark or WASM build has been
performed. **Numerical checks and live visual acceptance remain separate; the
physical recreation is still open for the impinging flow, deck interaction and
qualified observer.**

## Engine-to-deck transport and acceptance

The implemented [offline receiver diagnostic](../../scripts/validation/f35b/check-engine-deck-receiver.mjs)
uses the actual posed full engine and the existing entire gas field. It clips
incident rays at the nearest of **24,024 opaque triangles**, integrates interior
and exterior gas with one transmittance, and adds visible core/liner radiation
attenuated by foreground gas. An ideal 20% diffuse receiver uses `L = ρE/π`.
It does not use the approximate scene light. Below-plane gas cannot illuminate
the upper face. The [full-domain record](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/receiver/full-domain/README.md)
preserves raw units, hashes, fixed viewing figures, selected-probe convergence
and the separate preceding exterior-only run.
The [pressure-key correction receipt](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/receiver/pressure-key-correction/README.md)
proves exact physical-field equivalence after correcting an ignored pressure
property in the receiver producer. All selected cases have zero burned AB fuel;
the original transport results and failed criteria are preserved unchanged.

At the actual retained powered-lift center, interior gas gives **0.00691604 lux**,
exterior gas **0.03038971 lux** and visible hardware **0.00000639 lux**. Combined
reflection is **0.00237536 cd/m²**. Native gas/core/liner temperatures and source
watts are unchanged. The selected downward probes pass their declared criteria,
including separate interior/exterior gas checks. A hot zero-fuel shutdown
observation reposed downward retains hardware illumination while gas is zero;
its actual horizontal pose is reported separately. Three extremely small
horizontal grazing values still fail metal-area refinement, so the aggregate
diagnostic deliberately exits **1**. The figures' entire spatial grid and
unsampled extrema remain unqualified.

The [fixed +8/+10 EV figure](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/receiver/full-domain/receiver-comparison.svg)
keeps that small reflected patch dim. It does not recreate the bright structured
volume immediately above the deck in the footage. The current source and ideal
reflection calculation therefore remain an incomplete explanation of the
observed morphology. Compression/recovery, particle/scattering structure,
spectral camera response and station/loading calibration remain discriminators.
No runtime receiving deck, impinging-flow solver or heated-deck emission has been
installed by this diagnostic. A solved engine flow boundary belongs in JSBSim;
the aircraft-specific optical fixture belongs here; generic globe lighting and
display changes belong in FOSS Earth. Neither sibling was changed in this pass.

The final [application checks](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/application/README.md)
pass **175 files, 1893 tests and one existing expected failure**, lint,
incremental typecheck, production build and artifact verification. The initial
stale light-unit test and its successful correction are retained. A later range
audit required a focused follow-up and a final CI after the earlier pass; both
runs are retained. Those software checks do not turn the failed numerical
criteria into passes or close physical/visual acceptance. The rigid engine,
independent metal temperatures, installed native engine and operational hover
AB inhibition remain preserved, together with unrelated concurrent work.
