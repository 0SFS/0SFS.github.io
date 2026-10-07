# Full-domain engine-to-deck receiver

This follow-up includes the **existing internal and external gas field**, plus
visible core/liner radiation attenuated along its complete foreground gas
path. It replaces the scope limitation of the preserved
[exterior-only calculation](../exterior-only/README.md). It changes no native
temperature, source watts, optical coefficients or runtime renderer.

[Full report](report.json) · [Acceptance](acceptance.json) ·
[Run log](diagnostic.log) · [EV +8/+10 comparison](receiver-comparison.svg) ·
[Powered-lift raw map](powered-lift.csv) ·
[Hot-shutdown raw map](hot-shutdown-posed-down.csv)

## Results

At the center of the ideal receiver, the actual powered-lift observation gives:

| Contribution | Illuminance, lux |
| --- | ---: |
| Internal gas, signed path < 0 | 0.00691603610 |
| External gas, signed path ≥ 0 | 0.03038970816 |
| Visible hardware after full-path attenuation | 0.00000639343 |
| Combined | 0.03731213769 |

For a neutral Lambertian reflectance of 0.2, combined reflected luminance is
**0.00237536446 cd/m²**. The exterior-only center result was
0.00193507963 cd/m². The additional light comes from previously omitted
existing interior emission, not increased source temperature or brightness.
Both results remain conditional on the uncalibrated source model.

The full engine geometry blocks direct core radiation from the center receiver
point. At offset `(0, 1.5 m)`, the full-domain powered-lift gas contribution is
0.00207175 lux and hardware contributes 0.00115532 lux. Interior gas both emits
and attenuates metal seen through the duct; component contributions are retained
after foreground attenuation, so their sum equals total transported radiance.

The actual zero-fuel hot-shutdown temperatures, reposed to a fixed 90° nozzle,
retain **0.00000975914 lux** of center hardware illumination and zero gas,
giving **6.21286e-7 cd/m²** reflected luminance. At `(0, 1.5 m)` the hardware
contribution is 0.00517194 lux. Its native nozzle was horizontal; the downward
comparison is an explicitly labeled pose hypothesis, not a new native shutdown
trajectory. The separate native horizontal case remains in the report.

## Numerical qualification

The selected downward powered-lift and downward shutdown probes **pass the
declared convergence criteria**. No criterion was weakened. Gas angular
sampling is refined from 32,768 to 65,536 directions; path integration from
256 to 512 target steps; metal area quadrature from 64 to 256 points per
triangle. The internal and external gas channels are checked separately.

- Maximum internal-gas angular change: **2.448%**, below the 3% criterion.
- Maximum combined-gas angular change: **0.974%**; external-gas change: **0.00101%**.
- Maximum internal/external gas path change: **0.001263%**, below 1%.
- Powered-lift metal area change: **0.628%**, below 5%; metal foreground-path
  change: **0.0000266%**, below 1%.
- Downward hot-shutdown metal area change: **0.436%**, below 5%.
- Independent finite-disk transport check: **0.00275%** relative error.

The aggregate run still **exits 1 with `status: failed`** because three
native-horizontal shutdown grazing values, only 3.43e-9 to 9.57e-9 lux, change
by 46.8–74.4% under metal-area refinement. They remain explicitly unqualified;
the report does not replace these values with exact zero or suppress their
failed criteria. The fourth horizontal probe is 5.11431e-7 lux with a 1.38%
refinement change. Cold table output and gas are zero under the existing
renderer contract; this is not a claim of zero physical Planck emission at
ambient temperature.

Images use **17 × 17** receiver points over 6 × 6 m, with 2,048 gas directions,
96 target path steps and four points per metal triangle. Selected downward
probe image-budget errors reach **2.894% for gas** and **8.553% for hardware**.
The entire image, its unsampled extrema and its spatial grid are **not
convergence-qualified**. The brightest sampled powered-lift combined pixel
is 0.00237455 cd/m²; the downward shutdown map reaches 0.000326842 cd/m².

The fixed EV +8/+10 figure shows physical RGB divided by 1000 cd/m², multiplied
by `2^EV`, encoded as sRGB and display-clipped. There is no per-image
normalization, tone mapper, artificial ambient light or NIR camera response.
The low luminance is retained, not corrected to resemble the footage.

## Transport and scope

All **24,024 actual opaque GLB triangles** are present, including 3,056 hot
triangles. Non-indexed geometry gets sequential indices, guarded against the
asset's declared triangle count. Native temperatures drive the declared core
and liner materials independently. Surface emission follows authored winding;
opaque metal blocks rays from both sides.

Gas integration walks the ordered union of conservative section ray-box
intervals. The exact existing circular/annular/nozzle-seal inverse rejects
points outside gas. Midpoint targets are distributed by interval length and
rounded up per interval. The nearest actual opaque triangle terminates the
ray. Signed path < 0 and ≥ 0 contributions share one front-to-back
transmittance, and metal rays traverse the same whole gas domain.

Cosine-weighted upper-hemisphere quadrature gives `E = π/N Σ L`. Hardware
uses equivalent `dΩ = cos(source) dA/r²` area quadrature with receiver cosine,
visibility and gas transmittance. The existing whole-field source integral
provides the broad bound `4π Iwhole` in lumens, including internal gas. This
replaces the exterior-only source bound; it is not additional emitted power.
The [finite-plane flux check](receiver-flux.json) integrates retained CSV lux
over the plane and compares with whole-field and material source upper bounds.

The horizontal opaque receiver retains the held-stand placement hypothesis:
engine attachment height plus 0.17 m clearance; the powered-lift exit is
1.17628 m above it. Its upper hemisphere excludes gas below the plane even
though the free-jet support crosses the deck. This is optical clipping, not
an impinging-flow solution. Reflectance 0.2 is ideal and unmeasured.

No runtime deck is implemented here. There is no deck heating, reradiation,
wall jet, temperature recovery, deposition, scattering, multiple reflection,
sky illumination or existing PointLight contribution. Spectra, particle
loading, native bath interpretation and visible metal emissivity remain
uncalibrated F135 assumptions. The current scalar reference-wavelength
attenuation approximation is preserved. No browser, GPU, server, engine run,
WASM build, suite or performance measurement was used.

## Exact run and provenance

```sh
node scripts/validation/f35b/check-engine-deck-receiver.mjs \
  --out=build/f135-deck-receiver-full-20261006 \
  --grid=17 --probe-directions=32768 \
  > build/f135-deck-receiver-full-20261006.log 2>&1
```

Choose a new `--out` directory when reproducing; the script never overwrites
an existing run. Omitting `--out` creates a fresh dated scratch directory.
Unspecified settings retain defaults: 6 m extent, reflectance 0.2, white
1000 cd/m², 2,048 image directions, 96 image path steps, surface level 1,
probe steps 256 and probe surface level 3. Numeric CLI bounds are enforced.

The report retains source hashes, frozen snapshots and the executed helper
bundle. Native observations come from the preceding retained trace; JSBSim
was not rerun. The source identity check found no input changes during this
run. The earlier exterior-only files remain available unchanged, including
their failed aggregate receipt and original build outputs.

After this run, the producer's input name was corrected from
`ambientPressurePa` to the evaluator's `ambientPressurePascal`. The original
run and frozen script remain unchanged. The
[focused correction receipt](../pressure-key-correction/receipt.json) proves
that this is the only current script change and that evaluator/profile hashes
still match the run. All physical scalar/nested results and all 38,912 powered
field-array entries are exactly unchanged; the other three cases return the
same inactive optical result. Each retained case has zero burned AB fuel.
The powered case's `reactionInputWasClamped` metadata now reports `false`
instead of being absent; it does not activate the zero-fuel parcel source.
Thus these receiver numbers/images remain applicable without another expensive
ray run. Positive burned-AB cases are not covered by this equivalence and must
use the corrected pressure input. The original convergence failures remain.
