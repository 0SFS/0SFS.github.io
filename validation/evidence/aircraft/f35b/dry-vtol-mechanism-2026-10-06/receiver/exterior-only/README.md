# Offline engine-to-deck reflection

Recorded 2026-10-06. This is a **CPU optical receiver diagnostic**, not an
implemented runtime deck, GPU result, carrier-deck calibration, or deck-heating
model. The [comparison figure](receiver-comparison.svg) displays the retained
physical RGB at fixed EV +8 and +10, with the same 1000 cd/m² white reference.
The images are intentionally dim; they are not individually normalized.

The [full report](report.json), [acceptance receipt](acceptance.json),
[run log](diagnostic.log), and raw [powered-lift](powered-lift.csv) and
[hot-shutdown](hot-shutdown-posed-down.csv) maps retain separate gas, core and
liner contributions. [Receiver flux](receiver-flux.json) is a subsequent
trapezoidal integration of those CSVs, not another physical simulation.

## Results and numerical limits

| Observation and pose | Center gas, lux | Center hardware, lux | Center reflected luminance, cd/m² |
| --- | ---: | ---: | ---: |
| Actual powered lift, 90° nozzle | 0.0303897143 | 0.00000644536 | 0.00193507963 |
| Zero-fuel hot shutdown, reposed to 90° | 0 | 0.00000975914 | 0.000000621286 |
| Actual horizontal hot-shutdown pose | 0 | approximately 9.07e-9, **unqualified** | approximately 5.78e-10, **unqualified** |
| Cold state, reposed to 90° | 0 | 0 in the visible table contract | 0 |

The native powered-lift observation has gas 1003.128 K, core 956.723 K,
liner 664.054 K, and fuel 4.42005 kg/s. The zero-fuel shutdown observation
retains core 945.962 K and liner 660.366 K. Its native nozzle was horizontal:
the downward comparison is explicitly a fixed-pose counterfactual using these
unchanged observed temperatures, not a simulated powered-lift shutdown.

Actual opaque geometry blocks the core from the center receiver point. Core
emission reaches some off-center points. At offset `(0, 1.5 m)` the refined
powered-lift hardware contribution is 0.00118721 lux; the downward shutdown
hardware contribution is 0.00517194 lux. Gas shuts off at the retained zero-fuel
observation; metal radiation does not.

The four powered-lift probe points refine gas directions from 16,384 to 32,768
and path steps from 256 to 512. The maximum changes are **0.00673%** and
**0.0000562%**, respectively. Metal triangle subdivision levels 3 to 4
(64 to 256 quadrature points per triangle) change powered-lift probes by at
most **0.628%**, and downward shutdown probes by at most **0.436%**.
The finite uniform-disk analytic check differs by **0.00275%** at its finest
polygon/area quadrature. Hemisphere normalization is checked separately.

**The aggregate diagnostic exits 1 and retains `status: failed`.** Three very
small horizontal-shutdown grazing contributions fail the declared 5% metal
refinement criterion: their finest values are 3.43e-9 to 9.57e-9 lux and their
relative changes are 46.8–74.4%. Those values are not qualified as accurate
physical leakage. The fourth horizontal probe, at `(0, 1.5 m)`, is
5.11431e-7 lux with 1.38% refinement change. The downward results above meet
their respective selected-probe criteria; the failed horizontal checks were
not suppressed or converted to a pass.

Images use a 25 × 25 grid across a 6 × 6 m ideal surface, 2,048 gas directions,
96 path steps, and four points per metal triangle. At the downward probe
locations, this image budget differs from the refined gas values by at most
0.418%, and from the refined hardware values by at most 8.55%. These are
selected-point comparisons, not whole-image convergence. The brightest sampled
powered-lift combined pixel is 0.00193509 cd/m²; the brightest sampled downward
shutdown pixel is 0.000326842 cd/m². Display conversion is linear RGB divided
by 1000 cd/m², multiplied by `2^EV`, encoded as sRGB, and clipped to the display
range. No tone mapper, NIR response, ambient illumination or exposure fitting
is used.

The finite receiver captures approximately 0.04182 lm from gas and 0.005665 lm
from hardware in the powered-lift map. These remain below broad unoccluded
source bounds of 0.12841 lm and 3.73025 lm. This check establishes no extra
optical power is evident at this grid resolution; it is not a closed engine
energy budget or a mesh-grid convergence result.

## Geometry and transport contract

The script loads the actual full engine GLB, applies the rigid nozzle rig, and
constructs **24,024 opaque triangles**, including **3,056 declared hot
triangles**. Non-indexed GLB primitives receive sequential indices; the count
must match the generated asset metadata. Native core and liner temperatures
drive the existing raw visible-emission table separately. Authored triangle
winding controls one-sided emission; physical opaque walls block transport
from either side. No filled-aperture blackbody disk replaces the hardware.

The horizontal plane uses the existing flat held-stand placement hypothesis:
engine attachment height plus 0.17 m clearance. The powered-lift exit is
1.17628 m above it. Neutral reflectance 0.2 is a declared ideal Lambertian
receiver, not measured carrier-deck paint.

For exterior gas, cosine-weighted upper-hemisphere rays integrate the existing
source/extinction field in front of the nearest opaque engine hit:
`E = π/N Σ L`. Hardware uses the equivalent solid-angle integral
`dΩ = cos(source) dA/r²`, with receiver cosine, visibility and foreground
exterior-gas transmittance. Reflected radiance is `L = ρE/π`.
The free-jet support extends through the plane, but below-plane gas contributes
nothing to its upper face. The scene's approximate PointLight is never used.

This scope includes exterior gas and visible thermal hardware. It omits
internal-gas emission and its attenuation of hardware, multiple reflection,
scattering, ambient light and deck self-emission. The scalar reference-wavelength
attenuation follows the current runtime source approximation. Native bath
temperature, particle spectrum/loading and visible solid emissivity remain
uncalibrated F135 hypotheses. There is no impingement compression, wall-jet
solution, deposition, deck temperature or added gas energy.

## Reproduction and provenance

From the repository root:

```sh
node scripts/validation/f35b/check-engine-deck-receiver.mjs \
  > build/engine-deck-receiver.log 2>&1
```

The tool creates a fresh dated directory under `build/validation/engine-deck-receiver/`.
The nonzero exit described above is expected for this retained source/data.
Bounded options are `--grid`, `--extent` (m), `--directions`, `--steps`,
`--surface-level`, `--rho`, `--white` (cd/m²), `--probe-directions`,
`--probe-steps`, and `--probe-surface-level`. `--out` must name a new directory
under repository `build/`. The comparison SVG only lays out the script's PNGs;
it adds no samples or image normalization.

`report.json` records hashes and frozen source snapshots, the executed helper
bundle, the retained native trace, and the unchanged GLB. No input changed
during this run. `entry.mjs` is the executed frozen helper bundle. The native
trace was read without rerunning JSBSim. No browser, server, GPU, WASM build,
test suite or performance measurement was used by this diagnostic.
