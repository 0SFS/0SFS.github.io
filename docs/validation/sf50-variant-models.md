# SF50 generation profiles and processed calibration data

Updated: 2026-09-12. Development simulation only, not an operational reference.

## What this implementation changes

- The aircraft picker offers G1, G2 and G3. The existing `cirrus-vision-jet` saved preference remains G1; G2/G3 have separate persistent IDs and JSBSim packages.
- G1 is the canonical editable airframe. `scripts/build-sf50-variants.mjs` generates the G2/G3 XML packages from it to avoid hand-maintained copies.
- All three currently share development aerodynamics, estimated installed-thrust/spool/bleed behavior and the exterior meshes. Separate IDs do **not** mean three independently calibrated aircraft. The picker explicitly discloses this.
- G2 means the original G2 configuration, not G2+. G2+ performance evidence is separately tagged; it is not silently reused as G3.
- The generation catalog records the historical G1 FL280 and G2/G3 FL310 operating envelopes. These are metadata, not artificial altitude clamps. Generation-specific avionics, cabin layouts, autothrottle and emergency systems are not added by this change.

## Public facts actually applied to the model

| Input | Previous estimate | Applied value | Evidence |
| --- | --- | --- | --- |
| FJ33-5A rated thrust | 1,800 lbf | 1,846 lbf | G1 AFM 31452-001, PDF 23 / printed 1-7 |
| Usable fuel capacity | 1,990 lb | 2,001 lb | Same page: 296 US gal at nominal 6.76 lb/US gal; retain published rounding |
| Wing mean aerodynamic chord | 5.06 ft | 62.2 in / 12 ft | AMM 6-00-2, 2018-07-09, reproduced in WPR20FA051 station diagram, PDF 13 / Figure 15 |

The AFM hash is `d83e904dbd6bc3656321c93d793166d4a5c6eddf81852b15767e5c336fc23949`.
The nominal rating is NOT an installed net-thrust map. Existing altitude/Mach tables, TSFC, bleed loss and N1 limits remain estimates; the change does not solve their calibration. A nominal usable capacity does not establish actual loading or CG. The single aggregate tank and synthetic datum remain provisional.

The MAC change affects moment normalization. These changes invalidate any assumption that earlier numerical flight-run results describe the current package. No new flight run or test-suite pass is claimed here.

## Reproducible offline processing

```sh
node scripts/process-sf50-calibration-data.mjs \
  --out=planes/Cirrus_Vision_Jet/tests/public-evidence/derived/NEW_RUN \
  --summary=planes/Cirrus_Vision_Jet/tests/public-evidence/NEW_SUMMARY.json
```

Both output destinations must be new. No network access, raw-file modification, coefficient fitting or simulation occurs during this command.

The processor checks the original, expanded-audit and variant manifests, the primary AFM hash, and a separate manifest of derived-input hashes. Hash checks establish identity, not transcription accuracy. Raw/derived bulk data remain ignored; public availability is not blanket redistribution permission.

The implementation-run ledger is `planes/Cirrus_Vision_Jet/tests/public-evidence/variant-processing-summary.json`. It records successful, blocked or partially processed stages without presenting them as passing aircraft tests.

## Outputs and their allowed uses

- `g1-afm-targets.json`: 640 cruise and 180 cumulative-climb source candidates, with generation, document hash, page, physical units, operating conditions, printed resolution and review gates.
- `g1-cruise-lift-inferences.json`: equilibrium CL coverage inferred using L=W and tabulated TAS/OAT/pressure altitude. Not measured CL, a CL-alpha slope, drag, or an installed model coefficient.
- `g1-runway-anchors.json`: the existing 12 explicitly published ISA anchors. The original runway runner remains G1-only; sparse TOLD temperature interpolation does not replace these rows.
- `told-generation-tables.json`: original G1 tables plus selected G2/G2+ takeoff, climb, landing and VREF tables at commit `3a6fa1853e67a221a7613ba3523c59886d7d0cab`. Dimensions and values are retained; units/conditions and primary-revision conflicts remain gated.
- `era22-normalized.json`: G1 serial 0088 engineering-unit data; requested N1, measured N1/N2, TLA, T2 and automation/safety flags remain distinct. EDT is converted using the stated event date. Exact duplicates are counted, contradictory clocks rejected and gaps preserved.
- `public-flight-normalized.json`: G1 serial 0045 dashboard series joined at exact timestamps. Missing channels remain null; there is no resampling, extrapolation or promotion to a one-second raw log.
- The two `*-steady-candidates.json` files contain non-overlapping, at-least-60-second review windows. Screening uses altitude, airspeed, N1 and attitude stability plus available safety/GPS flags. A smooth trace is not proof of normal flight, known CG or matching conditions.
- `cen21-normalized.json` retains the existing engineering-unit parser. Serial 0202 remains outside the historical G1 donor set.
- `wide-recorder-quarantine.json` preserves broad CEN21/CEN23 schema inventories and unresolved clock/status/CAPS blockers.
- `wpr20-fuel-subset.json` recognizes the distinct `Time PST` schema and preserves missing fuel/oil values as null. It does not claim N1/attitude/brake information absent from that export.
- `generation-coverage.json` records variant boundaries, applied model facts, G3 published context and unresolved parameters.

## Methodology decisions

1. Keep the entire ISA+10 condition plane out of the candidate fitting pool for within-AFM checks. This is a same-source check, NOT an independent aircraft-validation holdout. Do not move it into fitting after inspecting residuals without recording a new allocation.
2. Preserve cumulative climb time, gallons, pounds and distance separately. Whole-minute rounded cumulative rows cannot identify instantaneous climb rate or spool dynamics.
3. Printed decimal/integer resolution is not measurement uncertainty and must not become an arbitrary pass tolerance.
4. Target comparison fails closed on variant mismatch, missing metrics, unknown or mismatched conditions, unreviewed units and absent validation independence. Reporting a numerical residual does not bypass those gates.
5. Fit engine/N1/fuel-flow behavior jointly with clean-flight performance only after configuration and conditions are qualified. Cruise N1/TAS/fuel flow alone cannot uniquely separate installed thrust from airframe drag.
6. Do not apply a uniform 20% thrust increase for G2+ or G3. The manufacturer describes condition-dependent takeoff improvements; a full schedule requires an applicable source.
7. Preserve existing synthetic loading/pilot-method qualifications and resolve landing-source revision conflicts before aerodynamic or friction tuning.

## Generation sources and remaining work

[The primary G1 AFM](https://flightsimcoach.com/wp-content/uploads/2020/12/SF50-POH.pdf) provides the historical baseline.
[Cirrus's G2 announcement](https://cirrusaircraft.com/story/cirrus-aircraft-unveils-generation-2-vision-jet/) documents FL310 and the changed avionics/autothrottle offering.
[The G2+ announcement](https://cirrusaircraft.com/story/cirrus-aircraft-unveils-g2-vision-jet-with-up-to-20-enhanced-take-off-performance-and-inflight-wifi-connectivity/) distinguishes its condition-dependent engine-performance update.
[The G3 announcement](https://cirrusaircraft.com/story/cirrus-unveils-new-g3-vision-jet/) identifies the 2026 generation; [the current specifications](https://cirrusaircraft.com/aircraft/vision-jet/) provide the published performance context.

The G3 website lists 1,910 ft takeoff ground roll, 2,815 ft over 50 ft and 317 KTAS maximum cruise. These do not specify one complete matched test condition and are not installed as golden tests. Its seating wording also varies between page sections; the generation profile does not invent a new loading distribution from marketing copy.

Next: complete transcription/conditions review, review normal-flight windows and loading metadata, obtain applicable G2/G3 AFM/installed-engine configuration evidence, fit identifiable parameters, then execute matched native/WASM runs and independent holdouts. Browser selection and the changed model packages still need focused tests and a flight smoke test. Generic engine/SDK changes belong upstream; this pass changes app-owned aircraft data and evidence processing only.


## Conversation handoff and revised selection UI (2026-09-12)

The generation entries described above are an interim integration, not the final aircraft-selection experience. The user's next UI requirement is a **scrollable grid of aircraft-family images with aircraft-specific controls underneath, outside the gallery scroller**. A Vision Jet family card exposes G1/G2/G3 below it; generations should not be separate nearly identical gallery cards. Preserve existing aircraft-specific controls, model credits, preferences and atomic FDM/visual activation.

Work order:
1. [Aircraft selection UI prompt](../prompts/aircraft-selection-ui-work-app-prompt.md).
2. [SF50 development resume prompt](../prompts/sf50-resume-work-app-prompt.md).

The latest offline processing actually completed: 101 raw artifacts; 820 primary AFM cruise/climb rows; 12 ISA runway anchors; 53 TOLD tables / 8,535 rows; seven ERA22 and 34 public-dashboard steady-review candidates. The 820 AFM rows allocate 600 fitting candidates and 220 same-source ISA+10 checks, with zero independent-validation rows. Broad raw recorder exports remain quarantined despite successful inventory processing.

See [the consolidated development handoff](sf50-development-handoff.md) for repository ownership, actual historical checks, source distinctions and remaining work. No new source inspection, test, build or flight simulation was performed while preparing this handoff. Prior 42/42 test results predate the latest variant/model-input changes.
