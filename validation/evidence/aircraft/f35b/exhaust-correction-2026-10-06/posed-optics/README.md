# Posed CPU optical/depth comparisons

**Correction, 2026-10-06:** the retained script silently built zero hardware
triangles from non-indexed GLB meshes. The claimed opaque clipping, hardware
silhouettes and visible interior/exterior attribution below are **unqualified**.
Images and ray-error measurements describe the unblocked gas domain, not a
hardware-clipped view. The 128-step result does not qualify the corrected opaque
case. All original records remain unchanged. See the
[occlusion erratum](../../dry-vtol-mechanism-2026-10-06/occlusion-erratum/README.md).

These 64 PNGs compare eight retained native states, rear/oblique views, day/night backgrounds, and the previous spatial-v1 exterior-only source versus the corrected unified source. They integrate the same actual posed full-engine GLB in both versions and clip rays at the nearest opaque triangle. They are gas-only CPU projections, not historical renderer reproductions or Babylon/GPU captures. Geometry does not change between versions.

`image-render-report.json` contains camera vectors, native state, flow domains, source powers, image statistics, source hashes and the initial 32-step comparison. Its `display.samples = 128` controls every image. `display.runtimeSamples = 32` records the renderer default under investigation at that time, not the PNG integration count. `ray-comparison/report.json` and `budget-summary.json` retain the subsequent 32/64/96/128 comparison. `final-ray-comparison/report.json` repeats that diagnostic with the adopted 128-step default and a failing exit status if selected-ray error exceeds 1%. The source formulas, field resolution and images were unchanged by that additional diagnostic. The final runnable script snapshot includes its `--rays-only` and `--ray-budgets=` options.

All images use a 64 × 32 source field, 160 × 112 output, uniform 128-step midpoint transfer, exposure 1, intensity 1 and white reference 1000 cd/m². Linear emitted radiance is added to transmitted background before a declared per-channel Reinhard mapping and sRGB conversion. Day background RGB is (40,50,70) cd/m² and night is (0.002,0.003,0.005) cd/m²; these are stated display hypotheses. Opaque metal is black. Metal emission, reflection, light receivers, terrain, airframe, scattering and camera effects are excluded. Some rear VTOL cameras would lie below the hypothetical ground; these views diagnose the free engine source and do not represent a flight camera.

The corrected source continues through the supported interior rings and the moving exit. At fixed exposure the early AB and dry powered-lift images remain nearly black. Sustained AB gives a bright warm interior and exterior continuation, with compressed white/yellow image regions. These results do not satisfy the real-world appearance objective: source temperatures/loading, early combustion luminosity, dry exhaust visibility and the observed deck patch remain uncalibrated or unexplained.

Peak gas luminance, rear / oblique (cd/m²):

| Native case | Corrected source | Previous spatial-v1 exterior source |
| --- | ---: | ---: |
| Cold | 0 / 0 | 0 / 0 |
| Idle | 1.902e−7 / 9.031e−8 | 1.505e−10 / 2.781e−10 |
| Dry 99% | 0.05584 / 0.02576 | 9.212e−5 / 1.955e−4 |
| AB onset +0.233 s | 0.11570 / 0.05317 | 302.51 / 395.60 |
| Sustained AB | 87742 / 42272 | 9436 / 12926 |
| AB cutoff first step | 0.05411 / 0.02580 | 1.332e−4 / 2.448e−4 |
| Dry powered lift | 0.03135 / 0.01991 | 1.258e−4 / 2.112e−4 |
| Shutdown | 0 / 0 | 0 / 0 |

For dry powered lift the corrected interior peak is 0.03019 / 0.01976 cd/m² and exterior peak is 0.001203 / 0.001903 cd/m². These independent maxima can occur at different pixels and must not be summed. For sustained AB, 1396 / 2952 of 17920 night pixels have at least one linear channel above the 1000 cd/m² reference white; the previous source has 2172 / 2398. AB onset has zero such pixels for either model. Above-white counts describe compression demand before tone mapping, not a claim of hard output clipping or GPU gamut qualification.

Whole-box ray integration was tested on six declared rays in each of 16 state/view combinations against 4096 steps, with a 2048-step convergence comparison. Relative error divides the maximum channel error by the reference peak channel. “Bright” means a reference peak above 1 cd/m²; the finite set excludes values below 1e−8 cd/m².

| Uniform ray steps | Worst bright error | Worst finite error |
| --- | ---: | ---: |
| 32 | 18.510% | 18.510% |
| 64 | 8.726% | 12.973% |
| 96 | 1.876% | 2.731% |
| 128 | 0.710% | 0.760% |

The 2048/4096 reference disagreement is at most 0.107% on this set. The worst 32-step sustained-AB rear ray entirely misses the interior contribution: it produces red radiance 2396.7 cd/m² from exterior samples, while the reference gives 2022.3 total, split 555.3 interior and 1467.1 exterior. A coarse step misweights both sides of the exit even though the source and geometry join continuously. The 128-step result is the smallest tested budget below 1% on the selected rays; it is not a global bound over all pixels, settings or poses. No GPU performance claim is made.

Reproduction (scratch output defaults to a dated `build/` folder):

```sh
node scripts/validation/f35b/check-exhaust-continuity.mjs
node scripts/validation/f35b/render-exhaust-continuity.mjs --geometry=<new-report.json>
node scripts/validation/f35b/render-exhaust-continuity.mjs --geometry=<new-report.json> --rays-only --ray-budgets=32,64,96,128
```

The runnable script records sampling error rather than declaring physical acceptance. It fails for a nonconverged refined reference or an error over 1% at the final 128-step default on the selected finite rays. Saved lower user values remain available and have the recorded errors above. The parent acceptance record identifies final software checks. `../geometry/report.json` retains the matching physical support; the older build path in the immutable image report identifies the original execution input.
