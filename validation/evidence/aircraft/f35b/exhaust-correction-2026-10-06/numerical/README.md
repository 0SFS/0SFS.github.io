# Independent correction numerics and dry-source bounds

The [report](report.json) passes eight retained native milestones against the
corrected `imposed-gas-bath-v2` model and the frozen previous spatial evaluator.
No native step was rerun. The old engine observations, old evaluator and old
profile remain immutable; current inputs and the executed diagnostic are
snapshotted here. This qualifies the listed numerical calculations, not real
F135 source calibration or the user's rendered appearance.

The flow domains come from the actual posed rig's internal duct, annulus,
nozzle and exterior sections. Coordinates use signed path distance: internal
gas is upstream of zero, the moving exit is zero, exterior gas is downstream.
Native gas K is an imposed bath input without a new Mach conversion. Chemical
source is **unavailable**, not established physically absent. Its numerical
contribution is zero because no justified species-production/loss inputs exist.

## Same operating points, corrected source

The table gives unattenuated source-volume integrals. Candela here is a source
integral of local cd/m³, not a pixel value, escaped flux or measured intensity.
The previous source was entirely exterior. The corrected whole-domain total
includes internal photons that may be blocked by hardware; only the corrected
exterior integral supplies the approximate nearby light.

| State | Gas proxy K | Previous exterior Y cd | Corrected exterior Y cd | Corrected interior Y cd | Corrected whole particle W |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cold, initial zero-time | 288.15 | 0 | 0 | 0 | 0 |
| Idle | 649.60 | 7.248e-11 | 2.420e-9 | 6.093e-8 | 962.96 |
| 99% dry | 1003.13 | 2.707e-5 | 2.612e-4 | 0.01617 | 3570.34 |
| AB +0.233 s | 1034.45 | 90.979 | 7.021e-4 | 0.03391 | 4196.73 |
| Sustained AB | 2363.10 | 5347.45 | 2009.78 | 29809.74 | 125298.69 |
| First AB-cutoff step | 1003.13 | 6.453e-5 | 7.571e-4 | 0.01759 | 4661.36 |
| Dry powered lift | 1003.13 | 2.707e-5 | 2.612e-4 | 0.01617 | 3570.34 |
| Shutdown after cooling | 286.50 | 0 | 0 | 0 | 0 |

The shutdown row is the preceding comparison's fully cooled endpoint, not an
assertion of immediate source extinction on native Running=false. The
[native audit](../native/README.md) and preceding trace preserve the distinct
fuel/spool wind-down and visual activity gate. The cold row is initial zero-time;
the already-retained actual cold soak approaches the stand atmosphere before
starting.

The large reduction at AB onset follows removal of an imposed exterior chemical
source. Sustained gas remains thermally bright because the unchanged native bath
then exceeds 2300 K. Dry emission increases relative to the rejected expanded
model but remains weak. Neither comparison chooses a target hue or proves a
match to the observed night exhaust.

- [Source comparison figure](source-comparison.svg)
- [Receiver upper-bound figure](receiver-bounds.svg)

PNG counterparts and [plot provenance](plot-provenance.json) are retained. These
are Matplotlib data figures, not flight-app or CPU-projection images.

## Independent numerical checks

Every finite positive-fuel field has **exact byte equality** in RGBA and exact
total source-power equality when only the augmentation boolean changes. Native
temperature, fuel, geometry and ambient remain fixed in this test. Cold and
cooled shutdown remain unavailable/zero from their fuel state.

The reference path does not call production sampling or production volume
weights. It interpolates the signed geometric sections independently, excludes
the finite centerbody, and performs direct axial/radial quadrature. A separate
frequency-form Planck integration uses the retained official CIE observer before
the same stated one-time gamut convention. Transfer is independently integrated
with RK4. The analytic homogeneous medium is recovered to **7.68e-15 relative**.
[NIST's photometric definition](https://www.nist.gov/pml/sensor-science/optical-radiation/realization-candela)
supports the spectral-to-photometric units; it supplies no F135 emissivity.

| Check | Maximum observed | Applied numerical criterion |
| --- | ---: | ---: |
| Local Planck/CIE RGB error relative to peak | 0.0553% | 1% |
| Whole particle-power reconstruction | 1.16e-8 relative | 2e-5 |
| Whole field RGB intensity | 2.19e-8 relative | 2e-5 |
| Exterior-only RGB intensity | 4.32e-14 relative | 2e-5 |
| Independent volume refinement | 1.69e-6 relative | 2e-5 |
| RK4 8192→16384 ray refinement | 0.00963% | 0.5% |
| Field change across exit at s=±1e-7 m | 5.78e-6 relative | 1e-4 |
| Independent/public field sampler difference | Below 1e-12 relative | 1e-12 |

All complete-source bounds include interior and exterior particles. The
independent power calculation uses the actual stored Float32 extinction and
local temperature; its small difference from the reported double calculation is
retained. All chemical power-density integrals are zero. Exterior-only intensity
is checked separately so internal gas is not silently counted in an unoccluded
scene light.

At the selected straightened whole-domain rays, uniform midpoint **32** samples
have a maximum **4.40%** RGB-peak error on a dim dry axial path; the maximum for
rays above 1 cd/m² is **1.78%** on the sustained-AB axis. Errors at 8/16/64 are
also recorded. These rays include internal radiation and the excluded centerbody,
but not posed hardware occlusion or the rendered whole-engine AABB. They cannot
qualify the production sampler through the bent nozzle; the separate geometry
CPU projections must do that.

Changing the field from **64×32 to 64×64** changes the selected reference-ray
peak by at most **0.414%**. That is radial refinement at fixed 64 axial nodes.
The report also includes 32×16 results; it does not claim independent axial
convergence beyond the runtime maximum or a bound over every camera path.

## Dry receiver calculation

The geometry audit places the dry vertical exit **1.1762818 m** above a
hypothetical flat stand receiver, with exit radius **0.4016138 m**. The assumed
plane faces the downward nozzle and has diffuse reflectance **ρ=0.2**. No terrain
query or calibrated deck material supplies those receiver assumptions. The
current stand has no receiving deck, and the audited Earth raster material
disables dynamic lighting.

For the **authored exterior gas only** between exit and receiver, independent
solid-angle integration gives an unattenuated upper bound of
**2.33470e-4 lux**, corresponding to **1.48631e-5 cd/m²** diffuse reflected
luminance. Radial integration is analytic for each linear field cell; axial
quadrature refinement changes this by **0.000353%**. Self-absorption and hardware
occlusion can reduce the result. The free source is truncated at the plane;
no impinging-flow redistribution or extra source is invented.

Separate, deliberately generous alternatives fill the entire visible exit disk
uniformly with thermal radiance at each native temperature:

| Hypothetical filled disk | Source luminance cd/m² | Reflected receiver upper bound cd/m² |
| --- | ---: | ---: |
| Blackbody at gas bath 1003.13 K | 2.89145 | 0.0603744 |
| Grey metal ε=0.8 at core 956.72 K | 0.744381 | 0.0155429 |
| Grey metal ε=0.8 at liner 664.05 K | 1.94220e-5 | 4.05537e-7 |

These alternatives are **not additive**, and a filled aperture is not the
actual projected hot-metal area. Effective native thermal areas/capacities are
not substituted for emitting geometry. The coaxial-disk relation used is
`E = π L R²/(h²+R²)` and diffuse reflection is `Lreceiver = ρ E/π`.
Even the full-hemisphere passive thermal ceiling is explicitly recorded; this
does not turn low-opacity gas into an opaque blackbody.

NAVSEA reports deck thermal-load management, measured temperatures beneath the
deck, and hover/landing intervals for cooling during F-35B trials. It does not
identify visible deck incandescence or provide a spectral/glow calibration.
[Carderock's primary report](https://www.navsea.navy.mil/Media/News/Article-View/Article/4053212/carderock-team-provides-critical-technical-support-for-f-35b-sea-trials-on-js-k/).
Heating a deck would require heat-transfer, material, initial-temperature and
time-history inputs. No such model is implemented here. The Royal Navy external
glow/deck-patch observation remains an open physical and visual constraint.

## Reproduction

```sh
node scripts/validation/f35b/check-f135-emission-correction.mjs --geometry=validation/evidence/aircraft/f35b/exhaust-correction-2026-10-06/numerical/source-9-report.json.txt
node scripts/validation/f35b/plot-f135-emission-correction.mjs --report=<new-report.json> --python=<Matplotlib-enabled-Python>
```

Outputs default to new dated `build/` directories. [Numerical log](run.log) and
[plot log](plots.log) are retained. Source hashes were stable during the check.
No native suite, WASM build, browser, server, GPU run or benchmark was performed.
