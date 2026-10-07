# F135 exhaust source correction

Later checkpoint: [afterburner response and rendering work](f135-exhaust-response.md)
adds a conditional internal CH(A) parcel and a mean-enthalpy temperature-mixture
approximation, and reduces rendering work. The report below retains the earlier
chemistry-unavailable baseline, including its old 128-sample default. Dry
powered-lift appearance remains unresolved.

Recorded 2026-10-06. This implements a correction to the assumptions and source
geometry rejected in the [post-test follow-up](../f135-plume-physical-followup-prompt.md).
The user's **physical and visual appearance objective remains open**. Removing
unsupported source terms and passing numerical checks does not establish the
correct F135 dry or afterburning appearance.

The native thermal solver, fork.16 SDK, aircraft XML, separate core/liner metal
temperatures, rigid nozzle and operational hover AB inhibit are preserved. No
browser, GPU run, server or benchmark was started. The previous normalized,
uniform dimensional and spatial-pass evidence remains retained for comparison.

## Causes and corrected input contract

The old spatial model placed `10⁻⁶ × burned AB fuel power` into an exterior
CH*/C2* field, with equal energy in four bands. Localizing the same unsupported
allocation increased AB-onset oblique peak luminance from 59.65 to 378.5 cd/m²
in the retained CPU comparison. That establishes a problem in the assumed source;
it does not reproduce the user's exact pale-blue pixels or exposure. The old
[spatial evidence](../../validation/evidence/aircraft/f35b/plume-spatial-2026-10-06/spatial-optics/README.md)
also shows that numerical integration accuracy did not validate this source.

The [native contract audit](../../validation/evidence/aircraft/f35b/exhaust-correction-2026-10-06/native/README.md)
reconstructs all **4,171 retained observations** from the preceding 82,925-step
experiment. Maximum gas-mixture discrepancy is approximately 1.14 × 10⁻¹³ K.
It finds no native implementation defect requiring a new SDK or aircraft XML.
`thermal/nozzle-gas-temperature-k` is an **imposed gas-bath enthalpy-mixture
proxy**. The property name does not qualify it as exit static or total
temperature. It supplies neither exit velocity nor particle, radical,
quenching-composition or residence-time state.

Version 2 consumes that proxy directly as its declared thermal boundary input.
It removes the consumer's extra Mach conversion. This is not a finding that the
native engine had already solved nozzle expansion. The previous conversion
changed a frozen 1003.128 K input from 907.316 to 836.184 K solely because AB
was selected. It also switched particle opacity and source cap. The corrected
model uses the same uncertain **0.025 m⁻¹** reference particle coefficient and
**0.3% supplied-fuel-power ceiling** in both modes, retaining the former dry
values. Changing only the AB flag now produces identical source bytes and power.
Actual changes in native gas, fuel or exit geometry can still change the source.

The input remains a proxy, not a measured particle temperature. In particular,
the native dry gas equation does not resolve lift-fan shaft extraction into a
new exhaust station. No warmer dry temperature, density increase, chemistry
state, artificial startup fade or new downstream transport state was invented.

## Chemistry is unavailable, not measured zero

The active profile reports `chemistryStatus: "unavailable"`. It no longer
converts internally burned fuel into prescribed exterior photons, distributes
an arbitrary fraction inside, or assigns equal CH*/C2* band powers. The stored
chemical source is zero because the required input is absent. That is **not a
measurement that exterior chemical light is physically zero**, and blue emission
is not prohibited.

The [primary-source audit](../../validation/evidence/aircraft/f35b/exhaust-correction-2026-10-06/source-research/README.md)
records a usable future contract: local excited-state production, radiative and
collisional loss, and supported transition strengths/level populations. Bulk
fuel and temperature do not determine those quantities. The production/loss
mechanism measured by [Kathrotia et al.](https://elib.dlr.de/75430/1/Kathrotia2012apb571_manuscript.pdf)
is not an F135 calibration. Air-quenching measurements also constrain the domain
of usable coefficients; [Renfro et al.](https://www.sciencedirect.com/science/article/pii/S1540748902803285)
found a significant correction to an earlier nitrogen extrapolation.

The [radiative-survival calculation](../../validation/evidence/aircraft/f35b/exhaust-correction-2026-10-06/source-research/survival-bound.json)
shows why passive transport of these excited electronic states cannot explain
metres of luminous bands: even neglecting collisions, their illustrative
e-folding travel distances at 2000 m/s are about **1.08 mm for CH(A)** and
**0.20 mm for C2(d)**. The speed is a bounding illustration, not a measured F135
velocity. Sustained downstream bands require fresh local production; photons
escaping from an internal source are a different mechanism. A synthetic
flamelet with invented mixture inputs would not resolve the missing information.

Supported spectra can be precomputed when the necessary populations exist.
For example, [Brooke et al.'s Swan line list](https://arxiv.org/abs/1212.2102)
provides transition strengths, but not this engine's upper-state populations
or CH/C2 ratio. No optional population API with unsupported spectral assumptions
was installed merely to make chemistry appear implemented.

## Continuous thermal support through the nozzle

The optical domain now uses signed path distance: upstream is negative, the
moving nozzle exit is zero, and the exterior extends to 6 m. The
[geometry checks](../../validation/evidence/aircraft/f35b/exhaust-correction-2026-10-06/geometry/README.md)
cover 36 aperture/vector poses and preserve full/installed asset agreement.
Six interior ruled
sections follow the rigid engine/bearing/nozzle frames; they are not all attached
to the moving exit. A common axisymmetric source table spans them and the free
jet. Cross-section knots carry outer radius, solid centerbody radius and the
volume factor for oblique circular sections.

Upstream temperature and particle loading are a **homogeneous continuation of
the exit boundary hypothesis**. This fills the previous exterior-only source
domain without claiming an augmentor reaction solution or a measured internal
gas distribution. Downstream retains the declared axial/radial mixing and
particle-loss basis. The exit samples are continuous; the shape and absolute
temperature assumptions remain provisional. The finite exterior support can
still truncate residual opacity before the authored 24-exit-radius fade.

The complete bilinear source is bounded once over the entire domain. Solid
centerbody volume is excluded, and oblique-section volume factors are included.
Quadrature splits at source cells, geometry knots and centerbody crossings.
Where the renderer additionally clips circular nozzle caps against sealing
planes, the integrated circular domain is a conservative source bound.

Absolute Planck/CIE tables and the two solid-temperature emission tables retain
their amplitudes. Runtime performs table interpolation and grey transfer, not
spectroscopy or chemistry. Particle source power remains an unattenuated
bolometric ceiling based on an uncertain allocation of supplied fuel at
43.3 MJ/kg. It does not close the engine's total energy budget, and is not
subtracted from the externally imposed native reservoirs.

## Rendering, resource controls and nearby light

The runtime integrates the posed sections in one common volume draw, using their
combined bounding box and one source table. An opaque-depth pass stops the ray
at visible hardware/scenery instead of accumulating interior light behind an
opaque surface. This is needed in addition to locating the gas inside the
correct support. Both GLSL and WGSL paths use the shared scene image-processing
contract; exposure is separate from physical source values.

The user controls field resolution, ray samples, draw distance and the added
depth pass in **Renderer → Aircraft exhaust**. The field remains **64 × 32
RGBA32F samples by default (32 KiB of GPU source texture)**; each axis allows
8–64 samples. Ray samples allow 4–128, default 128. **Exhaust opaque occlusion**
defaults on; **Exhaust depth resolution** defaults to the viewport dimensions
and permits a 0.25–1 scale. Reduced depth resolution can misplace thin edges;
turning occlusion off can reveal light behind opaque surfaces. The increased ray
budget and extra pass's GPU costs are unqualified.

The existing approximate nearby light now uses only the **exterior** source
integral, `s ≥ 0`. It does not send all internal source photons into an
unoccluded external point light. Internal light reaches the view through volume
transfer and hardware visibility. The approximate light still omits
self-absorption, shadowing and near-field geometry, and excludes the emitting
engine hardware. It is not a solved model of hot metal illuminating the deck.

Physical source tables are cached independently of camera, exposure, clock and
rigid pose changes. Geometry volume weights have a separate bounded cache per
live profile, keyed by section values and field resolution, so changing only
temperature/fuel does not repeat their quadrature. Aperture/domain or resolution
changes replace that one cached geometry entry. Render/readiness/disposal
behavior is covered by software checks below,
not by a GPU appearance claim. Gas, solid, reflected and nearby-light views
remain diagnostic contribution controls.

## Independent numerical results

The [numerical record](../../validation/evidence/aircraft/f35b/exhaust-correction-2026-10-06/numerical/README.md)
evaluates eight retained native milestones using actual geometry domains.
There is no new native run. The following values describe unattenuated source
integrals, **not pixels, escaped radiant power or measured F135 light**.

| Case | Native gas proxy K | Particle source W | Whole-domain photopic intensity cd | Exterior intensity cd |
| --- | ---: | ---: | ---: | ---: |
| Cold, initial zero-time | 288.15 | 0 | 0 | 0 |
| Idle | 649.60 | 962.96 | 6.34 × 10⁻⁸ | 2.42 × 10⁻⁹ |
| Dry 99% | 1003.13 | 3570.34 | 0.01643 | 0.0002612 |
| AB onset +0.233 s | 1034.45 | 4196.73 | 0.03461 | 0.0007021 |
| Sustained AB | 2363.10 | 125298.69 | 31819.52 | 2009.78 |
| AB cutoff | 1003.13 | 4661.36 | 0.01835 | 0.0007571 |
| Dry powered lift | 1003.13 | 3570.34 | 0.01643 | 0.0002612 |
| Shutdown after cooling | 286.50 | 0 | 0 | 0 |

Chemical source is unavailable in every row. The larger cutoff source than dry
99% reflects the retained native fuel/nozzle state, not an AB-mode source switch.
Cold and the cooled shutdown endpoint have no supplied fuel, so gas is
suppressed while separate hot solid states retain their existing meaning. This
is not the immediate native-running-flag transition; fuel/spool wind-down can
remain visually active before that cooled endpoint.

Independent whole-field particle power agrees within **1.16 × 10⁻⁸ relative**;
RGB source intensity within **2.19 × 10⁻⁸**, and exterior intensity within
**4.32 × 10⁻¹⁴**. Local Planck/CIE comparison is within **0.0553%**. The tested
`s = ±10⁻⁷ m` exit samples differ by at most **5.78 × 10⁻⁶ normalized**. A frozen
physical state has exactly identical field bytes and source power under an
AB-only flag change.

The listed straightened-domain rays compare 64×32 with 64×64, reaching at most
**0.414% peak relative difference**. Both use 64 axial samples: this is not an
independent higher-resolution axial convergence result or a guarantee for every
posed view.

The separate [posed CPU projections](../../validation/evidence/aircraft/f35b/exhaust-correction-2026-10-06/posed-optics/README.md)
retain 64 gas-only images and a [final ray-budget comparison](../../validation/evidence/aircraft/f35b/exhaust-correction-2026-10-06/posed-optics/final-ray-comparison/report.json)
against 4096 uniform steps. **A subsequent audit found that their script skipped
non-indexed primitives and constructed zero hardware triangles.** Their claimed
opaque clipping and visible interior/exterior attribution are unqualified;
the numbers below describe the unblocked source domain only. They do not qualify
the ray budget after actual hardware clipping. Original records are preserved in
the [occlusion erratum](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/occlusion-erratum/README.md).
On the selected finite rays, 32 steps reach **18.51%** relative peak-channel
error; the adopted 128 steps stay below **0.761%**. The 2048/4096 reference
disagreement stays below **0.107%**. These are finite sampled-ray bounds, not a
guarantee for every pixel or pose. Saved lower sample settings remain available.
At the declared exposure and 1000 cd/m² reference, early AB and dry powered lift
remain nearly black, while sustained AB has bright warm regions requiring tone
compression. The record distinguishes above-reference channel counts from hard
output clipping. Neither kind of CPU calculation qualifies the browser shader,
scene HDR composition, GPU cost or the user's actual camera/exposure.

## Dry powered lift, deck patch and open appearance acceptance

The [Royal Navy observations](../proposals/f35b-fdm.md#observations-hypotheses-and-unresolved-discrepancies-2026-10-06)
at 2:38, 2:41 and particularly the downward nozzle near 2:42.8 remain constraints:
an external luminous region and a deck patch are visible. Operational hover AB
remains inhibited. Removing an unsupported conversion does not establish the
particle temperature/loading or a chemical explanation for that light.

The numerical record separates free-jet emission from a hypothetical receiving
plane. Its exterior gas-light bound in the retained powered-lift case is only
about **2.33 × 10⁻⁴ lux** at that plane; an assumed 20% diffuse receiver would
return about **1.49 × 10⁻⁵ cd/m²**. Filled-aperture thermal alternatives are
bounds on different hypothetical sources, not implemented metal-to-deck
illumination. Actual raster terrain is unlit and does not receive this dynamic
point light. Ground reflection/scattering, plume impingement and deck heating
are separate mechanisms; no general terrain material was silently changed here.

Appearance acceptance still needs rear/oblique daylight/night captures with
fixed, recorded exposure and display references for cold/idle/dry99, AB
onset/sustain/cutoff, shutdown and powered lift. They must include source
boundaries inside/across/outside the exit, contribution isolation and onset
clipping/gamut behavior. Record native history and nozzle pose alongside the
images. The user-reported failures remain open until those comparisons and a
supported physical source explain the required appearance.

## Check status

The [combined receipt](../../validation/evidence/aircraft/f35b/exhaust-correction-2026-10-06/acceptance.json)
records passing software and numerical checks separately from open physical and
visual acceptance. Incremental typecheck and lint passed. The related run covered
66 files; two new depth-test timer assertions initially counted unrelated Babylon
timers and were corrected. All three depth regressions then passed in isolation.
The single final **`npm run ci` passed: 172 test files, 1,841 passing tests and
one expected failure**, followed by build and artifact verification. This covers
the final exterior-only light integral, geometry-weight cache, posed support,
texture replacement and depth readiness/lifecycle regressions. Logs and final
source snapshots are retained in the
[application record](../../validation/evidence/aircraft/f35b/exhaust-correction-2026-10-06/application/README.md).

The independent numerical run retains its executed evaluator snapshot and hash.
It predates the efficiency-only cache revision, which reuses the unchanged
quadrature. Earlier optical checkpoints remain separately identified.
The preservation audit confirms 47 pre-existing tracked diffs unchanged and 15
unchanged native/SDK, rigid asset/rig and inspected shared-renderer identities.
Earlier failed checks remain retained with repair notes. No browser/GPU
qualification, performance result, or visual acceptance is implied by CI.
