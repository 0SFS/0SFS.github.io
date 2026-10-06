# F135 dry powered-lift response checkpoint

Recorded 2026-10-06. This freezes the finite-thermal-core calculation, its source
inputs, the associated software checks, and shared exposure/fill controls. See
the [observation and uncertainty ledger](../../../../../docs/validation/f135-dry-vtol-observation.md).
**Appearance remains unaccepted:** after these changes the user reports that dry
exhaust is still invisible and afterburner is huge. No new GPU, browser, server,
benchmark or native engine-dynamics run is represented here.

## Numerical evidence

[numerical/report.json](numerical/report.json) is copied unchanged from the
completed 2026-10-06 17:22:36 diagnostic output. Its ten input snapshots include
the current and preceding optical manifests, the retained native observation
record, CIE observer data, bake/reference code, runtime evaluator and analysis
script. [The console output](application/numerical-complete.log) identifies the
original output directory; the retained report and snapshots are the durable
record. The diagnostic owner is 0sfs, and its runnable source is
[`scripts/validation/f35b/analyze-dry-exhaust-visibility.mjs`](../../../../../scripts/validation/f35b/analyze-dry-exhaust-visibility.mjs).

| Quantity | Previous | Current |
| --- | ---: | ---: |
| Dry powered-lift exterior source integral | 0.000261239 cd | 0.011378629 cd |
| Dry particle-source power bound | 3570.34 W | 5112.42 W |
| Dry native gas input | 1003.13 K | 1003.13 K |
| Dry burned afterburner fuel / CH contribution | 0 / 0 | 0 / 0 |
| AB-onset exterior source integral | 27.7394 cd | 249.2967 cd |
| Sustained-AB exterior source integral | 2009.7794 cd | 37408.6695 cd |

The dry integral increased 43.56×. It integrates local cd/m³ over volume; it is
not escaped flux, screen brightness or F135 calibration. The common mixing basis
also increased AB onset 8.99× and sustained AB 18.61×; the new dry result cannot
be assessed without that change. All reported cases remain below their imposed
power ceilings, which are bounds rather than a solved energy balance.

The nominal finite thermal-core length is six exit radii, or three diameters.
Four- and ten-radius hypotheses give 0.0078483 and 0.0172148 cd in the same dry
state. The assumed core and grey opacity are uncalibrated. No new source term,
hover afterburner, native bath-temperature increase or RGB target was added.

Independent transverse ray integration at nine exterior stations yields at most
0.2852% relative luminance error for 32 midpoint samples against 4096; the
2048/4096 difference is at most 0.000122%. These fixed-station, axisymmetric rays
do not validate posed geometry, depth occlusion, GPU execution or the earlier
posed-ray error bounds. Illustrative exposure calculations do not calibrate a
camera or establish a visibility threshold. Deck reflection, heating, impingement
and near-infrared camera response remain outside the calculation.

## Retained software checks

| Log | Result |
| --- | --- |
| [0sfs CI](application/ci.log) | 174 files, 1851 passing tests and one existing expected failure; build and artifact verification completed. |
| [0sfs related](application/related.log) | 64 files, 783 tests passed. |
| [0sfs typecheck](application/typecheck.log), [lint](application/lint.log) | Incremental checks passed; successful typecheck has empty output. |
| [Final bake](application/bake-final.log) | Final artifact sizes and identities. The generated source and textures are retained under `application/source/`; the matching manifest is in `numerical/`. |
| [FOSS Earth CI](foss-earth/ci.log) | 135 files, 1167 tests passed; lint, typecheck and build completed. |
| [FOSS Earth related](foss-earth/related.log) | 429 pass, two stale UI expectations failed across 47 files. This is the initial, subsequently corrected state. |
| [FOSS Earth corrections](foss-earth/corrected-tests.log) | Both corrected files, 32 tests passed. |
| [FOSS Earth typecheck](foss-earth/typecheck.log), [lint](foss-earth/lint.log) | Incremental checks passed. |

FOSS Earth now owns the single **Renderer → Lighting and exposure** settings home:
fixed relative exposure (−16…16 EV, default 0) and ambient fill multiplier
(0…4, default 1). The former applies `2 ** EV` to shared material exposure; the
latter scales existing hemispheric baselines and leaves local emitters unchanged.
Changes apply live with render-on-demand invalidation. They do not implement
night, calibrated camera adaptation or a new HDR composition pipeline. Unlit
imagery and custom shaders retain their documented limitations.

Console timings are ordinary check output, not qualified performance measurements.
The failed related logs describe repaired expectations; they are not final CI
failures. Empty successful logs are preserved intentionally.

## Public thermal-core references

- [NASA/TM–2017–219504/REV1](references/raman2017.pdf),
  [NASA original](https://ntrs.nasa.gov/api/citations/20170005666/downloads/20170005666.pdf):
  direct rotational-Raman temperature measurements. Printed pp. 16 and 18,
  [figure 15](references/raman-fig15.png) and [figure 17](references/raman-fig17.png),
  support finite thermal-core and mixing-layer structure. These are laboratory
  jets, not F135 temperature or opacity measurements; they do not establish the
  chosen three-diameter core length.
- [NASA/TM–20205007805](references/nasa-temperature2020.pdf),
  [NASA original](https://ntrs.nasa.gov/api/citations/20205007805/downloads/TM-20205007805.pdf):
  printed pp. 7–9, figures 8, 10 and 11, are lower-speed heated-jet temperature
  evidence. Mach 0.08 and 353 K conditions limit transfer to an engine exhaust.

[files.json](files.json) records original locations, byte counts, SHA-256,
repository heads and source URLs. Both working trees were dirty; frozen content
hashes identify this checkpoint. Every numerical input hash and retained copy was
verified during preservation. Source snapshots end in `.txt` to stay outside test
discovery. Earlier frozen evidence has not been replaced.
