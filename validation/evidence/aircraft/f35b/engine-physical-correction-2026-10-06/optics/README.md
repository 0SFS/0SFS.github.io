# Dimensional F135 optical correction — 2026-10-06

This record qualifies CPU spectral/transfer calculations and the Babylon software
contract. It does not qualify rendered engine appearance, day/night agreement,
GPU shaders, or a diagnosis of the user's uncaptured startup. The previous
[normalized-gas record](../../engine-rebuild-2026-10-06/implementation/optics/README.md)
and its PNG/manifest remain unchanged.

Run `node scripts/validation/f35b/check-physical-optics.mjs` from the repository.
It writes a dated `build/validation/f135-physical-optics/` folder. The retained
[report](physical-optics-report.json) includes input hashes, full cases and
assumptions; [numerics.log](numerics.log) records this run. The old
`check-reconstructed-optics.mjs` now explicitly reads the frozen old manifest,
so it remains a historical comparison rather than testing new data with the
rejected model. `npm run build:exhaust` reproduces the current artifacts.

## What was replaced

The old gas lookup normalized each spectrum and RGB, then supplied brightness
from a separate guessed temperature envelope. At 400 K its dry maximum RGB was
one and its assigned relative emission was 0.0366667 per metre. That quantity
has no SI conversion. The revised dry model at the same temperature produces
red source 1.54581e-15 cd/m³ and a homogeneous 1 m ray of 1.52665e-15 cd/m².
No physical brightness ratio between the two incompatible quantities is claimed.
The old 300 K endpoint happened to be zero because its envelope was zero;
that did not make intermediate cold rows radiometric. The old path also had
no fuel input or source-power bound. These fail the new cold/source criteria.

The current renderer never fetches the old normalized gas spectrum PNG.
`f135-exhaust-lut.png` is now an archival continuum preview divided by a fixed
10000 cd/m² reference; its clipped bytes do not feed runtime emission. The CPU
interpolates floating-point absolute tables. One spatial PNG supplies the
provisional annulus/filled cross-section, not color or temperature brightness.
Legacy preview row metadata remains in the profile for compatibility.

## Physical quantities and explicit hypotheses

The reduced transfer equation is `dLλ/ds = jλ − κLλ`. Gray particles use
`jλ = κBλ(T)` in W/(sr·m³·m of wavelength); integrated photometric source RGB is
in cd/m³. Extinction κ is in m⁻¹. The shader integrates each segment with
`(1 − exp(−κρ ds))/κ`, including its zero/thin limit, and carries foreground
transmittance. Emission is premultiplied and background attenuation is the
complementary alpha. No arbitrary temperature opacity curve or temporal energy
multiplier is active.

Particle density is the existing spatial annulus blending into a filled
cross-section, multiplied by `(1−z)²`, within radius `1−0.6z`. Eight angular lobes
remain an uncertain appearance hypothesis from an F-35A view; they are not eight
injectors, hot solids or lights. Native gas temperature is a uniform particle
bath assumption, not a computed plume field.

| Input | Provisional default | Sensitivity/meaning |
| --- | --- | --- |
| Particle extinction | dry 0.025/m; AB 0.08/m | 0–0.3/m; not measured soot loading |
| Particle source-power allocation | dry 0.003; AB 0.015 of total fuel power | 0–0.02; caps an unattenuated bolometric source |
| Excited-band visible power | dry zero; AB 1e-6 of burned AB fuel power | 0–1e-4; independently uncertain conversion |
| CH*/C2* band energies | equal energy at 432/473/516/573 nm | each weight 0–1; population ratios unknown |
| Solid visible gray emissivity | 0.8 for both distinct materials | 0.3–0.95; alloy/coating/oxidation not measured |
| Fuel heating value | 43.3 MJ/kg | representative JP-8 sample, not current fuel assay |

The baked volume integral is `∫ρdV = 0.297123790877 R²L` m³, where radius R and
length L are in metres. The physical input radius follows the articulated exit
when supplied; legacy profiles fall back to their declared interpolation. Plume
length and density remain declared visual support geometry, not CFD.

Unattenuated particle source power is `4κσT⁴∫ρdV`. κ is capped downward when
that power exceeds its fraction of actual total fuel mass flow times heating
value. Excited-band shapes may be energy-normalized because their amplitude is
retained separately as visible watts from actual burned AB fuel. Missing or
invalid fuel suppresses gas; missing burned-AB fuel suppresses bands. Genuine
native augmentation selects the mode; the operational hover AB inhibition is
unchanged. Cold continuum retains its negligible absolute emission; if a valid
particle/fuel state exists it can still absorb background light.

These are bounded *sources*, not a solved global engine energy budget. Some
emitted radiation is reabsorbed; escaped power is no greater than the source
upper bound. The renderer does not debit native imposed gas/solid reservoirs,
solve chemistry/particle production, or equate these optical allocations with
native wall radiation. Visible solid emissivity is not silently substituted for
the native bolometric thermal coefficient.

## Solids, display, and diagnostic views

`F135_CoreHot` and `F135_LinerHot` retain separate native temperatures and PBR
material bindings. Each uses `ελ Bλ(T)`, CIE integration, photopic Y preservation
after gamut clipping, and log interpolation of positive channels. The 300–1800 K
solid table preserves absolute cd/m²; unavailable/below-table observations clear
thermal emission, and the existing upper-table clamp remains explicit. The
300–3200 K gas table rejects out-of-range temperature instead of extrapolating.
A hot metal continuum is red-dominated through this range; no purple metal ramp
or startup fade exists.

Gas/solid cd/m² values are divided by separate named display white references,
then multiplied by the named dimensionless visual gain. Babylon's shared
image-processing configuration supplies exposure, tone mapping, curves/grading
and encoding once. Physical source power/temperature do not depend on those
presentation parameters. Exact addition/absorption over the background requires
linear HDR composition; material-local tone/gamma blending is approximate.
First-interaction depth is a bounded-volume occlusion approximation, not a full
scene-depth volume integrator.

All PBR materials under the explicit engine root are prepared as owned clones
before reveal. Solid and gas diagnostics suppress direct, environmental,
specular and ambient reflection using clone uniforms, without changing shader
defines. The original materials are restored on disposal; nonengine materials
and shared scene exposure are unaffected. The reflection view suppresses thermal
and gas emission and the local light. The nearby-light view also suppresses engine reflection; ordinary environmental
lighting remains on other receivers so local light can be seen against it.

One optional unshadowed point light uses `∫jRGB dV` in candela, an isotropic
far-field source upper bound before plume reabsorption. Its named gain defaults
to one; its finite range is a resource/display control. It excludes every mesh
under its emitting engine root, including cold casing, so this approximation
cannot masquerade as that engine's own heat. It does not reconstruct near-field
illumination, shadows, impingement or scattering. The unlit FOSS Earth raster
basemap cannot receive it. There are no eight point lights.

## Numerical evidence and limits

| Independent check | Result |
| --- | --- |
| Wavelength Planck vs independently implemented frequency form, 21 cases | maximum relative error 1.42e-14 |
| Broad wavelength integration vs Stefan–Boltzmann, 300/1000/3200 K | maximum relative error 3.25e-11 |
| Gas and solid tables vs independent 0.25 nm CIE quadrature, 513 temperatures each | max photopic/peak-relative RGB error 0.328%; worst at negligible 300 K endpoint |
| Baked density integral vs independent cell/analytic-polynomial integral | relative error 1.78e-10 |
| Analytic transfer vs 20000-step independent quadrature, κ 0–10/m | max relative error 4.17e-8 |
| Fuel bounds, 36 dry/AB/temperature/fuel cases | every source within its declared allocation |
| Species/extinction sensitivity, 24 cases | retained raw powers and cd/m²; CH-only can be violet, continuum need not be |
| Invalid fuel, domain/endpoints, transfer zero/thin limits | suppressed or explicitly rejected; covered in focused tests |

[Focused tests](focused-fixes.log) passed 48 tests after repairing exact-endpoint
roundoff and separating the default gas display reference. The profile test also
passed in the [initial run](focused-initial.log); that log preserves the initial
six failures instead of hiding them. [Lint](final-lint.log) passed. Whole-engine
reflection isolation, constructor validation, absorption-only rendering and isolated-reflection
disposal hardening postdate this focused run; consult the enclosing correction report
for their final related/full-check coverage. These are software tests,
not GPU image qualification.

The startup report remains unrecorded historical behavior. The old normalized
band-rich AB lookup and a local light that could tint its own hardware were
plausible contributors to a red-to-purple transition. Warm initialization could
also explain immediate red emission. None is a diagnosis of that particular
observation. New native trace records must distinguish cold stopped start,
already-running initialization, hot restart, and actual augmentation changes,
with core/liner/gas K, total/burned-AB fuel, dimensional optical values and named
display settings. The correction's native trace supplies those state records;
this numerical report does not fabricate an engine history.

The original brief's night powered-lift/deck emission and pink/violet test-cell
observations remain constraints with unknown camera response. Violet gas and
reflections are possible; no universal purple or orange target is enforced.
Contribution-separated rear/oblique GPU captures at fixed day/night exposure
still require a requested run. No browser, server or GPU experiment was run here.

## Primary source boundaries

- [NIST source spectroradiometry](https://www.nist.gov/programs-projects/spectroradiometry-sources)
  describes temperature/Planck-based blackbody calibration. It supplies neither
  F135 temperature nor surface emissivity.
- [NASA/TM-2013-217884](https://ntrs.nasa.gov/api/citations/20140000730/downloads/20140000730.pdf),
  Table 2 and §4.1, supplies the JP-8 sample's 43.3 MJ/kg heat of combustion and
  CH*/C2* visible band mechanisms. Its lean direct injector experiment is not an
  F135 afterburner calibration; equal weights, line widths and efficiencies here
  remain assumptions.
- [NISTIR 6783](https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir6783.pdf),
  §4, equations 46/49/50 and the optically thin discussion, provides transfer,
  gray thermal source and local-versus-escaped radiation context. Its warning
  about gray-model overprediction reinforces this model's uncertainty; fire
  model validation is not transferred to an aircraft engine.
- [CIE 1931 2° observer](https://cie.co.at/datatable/cie-1931-colour-matching-functions-2-degree-observer),
  DOI 10.25039/CIE.DS.xvudnb9b, is the retained official 1 nm dataset. Derived
  optical artifacts retain CC BY-SA 4.0 attribution in the manifest.
