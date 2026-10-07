# Posed rays with complete current source inputs

This corrects the input-contract omission in the preserved
[preceding posed run](../posed-rays/README.md). The old diagnostic omitted both
upstream gas temperature and ambient pressure, silently disabling the current
conditional AB parcel and its temperature distribution. The new run passes
`upstreamGasTemperatureKelvin = native.egtC + 273.15` and
`ambientPressurePascal = native.pressurePsf × 47.88025898033584`, matching the
runtime contract. Native states, poses, cameras, source grid, geometry and
sampling thresholds are unchanged.

The [report](report.json) records these inputs for all eight states. The positive
burned-fuel cases both assert an active, resolved surrogate parcel with valid
pressure/temperature inputs. CH power is **3.68683392 W at AB onset** and
**190.593260 W in sustained AB**. Both report `reactionInputWasClamped: false`.
These are the existing model's outputs, not measured F135 chemistry. Every
zero-burned-fuel ray's radiance and refined reference match the preceding run
exactly; [the receipt](acceptance.json) records that comparison.

## Retained result

There are 96 physical rays: six positions in rear and oblique views of eight
native states. Three budgets produce **288 evaluations**. All states include
**24,024 opaque triangles**, guarded against generated metadata; 50 of the 96
rays encounter an opaque triangle. Gas is integrated only before that hit.
The shared field is 64 axial × 32 radial nodes. The source tables and inputs
did not change during the run.

Relative peak error is the largest absolute RGB-channel difference divided by
the refined ray's largest channel. Finite comparisons require a reference peak
above `10⁻⁸ cd/m²` (60 rays); bright comparisons require above `1 cd/m²` (18 rays).
Every budget is compared with 4096 uniform midpoint steps, with 2048 steps as
the additional reference-refinement level.

| Midpoint steps | Worst finite error | Worst bright error | Rays above 1% |
| ---: | ---: | ---: | ---: |
| 32 | 4.53442% | 3.64138% | 12 |
| 64 | 2.98577% | 2.98577% | 6 |
| 128 | 0.702479% | 0.702479% | 0 |

The maximum 2048/4096 reference difference is **0.102416%**. The largest
32-step relative error is the very dim cutoff oblique-edge ray, with reference
peak `5.41277 × 10⁻⁷ cd/m²`. The 64/128 maxima are the AB-onset rear ray at
screen coordinates `(0.12, 0)`, whose reference peak is 3764.72 cd/m².

**The current 32-step criterion fails; the process exits 1.** The 12 recorded
errors are retained verbatim. No default or threshold was changed. The 128-step
comparison meets 1% on these selected rays only; it does not qualify every pixel
or pose. This run generated no images. It is CPU gas/depth integration, without
surface emission, receiver, airframe, ground, scattering or GPU execution.

## Reproduction and identities

The exact command and exit status are retained in [acceptance.json](acceptance.json)
and [diagnostic.log](diagnostic.log). Choose a fresh output directory:

```sh
node scripts/validation/f35b/render-exhaust-continuity.mjs \
  --geometry=validation/evidence/aircraft/f35b/exhaust-correction-2026-10-06/geometry/report.json \
  --rays-only --ray-budgets=32,64,128 \
  --out=build/dry-vtol-mechanism-2026-10-06/<new-run-directory>
```

The source snapshots and executed helper bundle are stored with `.txt` suffixes;
their bytes and hashes are unchanged. All nine recorded input identities were
checked against their files after execution. `executedBundleSha256` matches
`entry.mjs.txt`. The script now rejects missing native inputs, incomplete
triangle inventories, failure to activate a positive-fuel parcel and identities
changed during execution. Focused [ESLint](lint.log) passed. No suite or runtime
renderer change was performed for this diagnostic correction.
