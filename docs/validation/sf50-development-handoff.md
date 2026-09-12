# SF50 development handoff

Snapshot: 2026-09-12. Consolidated from the preceding conversation and its recorded tool results. This handoff did not run another inspection, build, test or aircraft simulation.

## Start here and work in this order

1. Implement the aircraft-family gallery and aircraft-specific controls using [the UI conversation prompt](../prompts/aircraft-selection-ui-work-app-prompt.md).
2. Resume evidence qualification and SF50 development using [the SF50 conversation prompt](../prompts/sf50-resume-work-app-prompt.md).

The latest user request replaces the temporary flat generation picker with **a scrollable grid of aircraft images, followed by aircraft-specific controls underneath**. A Vision Jet family card should reveal its G1/G2/G3 selector below the gallery. The generations should not appear as three almost-identical aircraft cards.

This is a handoff, not a claim that the proposal, generation-specific flight models or public-data qualification are complete.

## Repository ownership and working constraints

| Responsibility | Repository used in this work |
| --- | --- |
| Application, aircraft catalog/UI, SF50 XML/data and evidence processing | `/Users/felg/gh/0sfs` |
| Generic native flight-engine behavior | `/Users/felg/gh/Felipegalind0/jsbsim` |
| Generic WASM bindings, SDK lifecycle and diagnostics | `/Users/felg/gh/Felipegalind0/jsbsim-wasm` |
| Earth/terrain/rendering dependency | `/Users/felg/gh/foss-earth` |

The user's preferred repository layout is `gh/owner/repo`. Use ordinary branches in the existing canonical repositories, not task-named copies or worktrees such as `jsbsim-wasm-model-load-diagnostics` or `jsbsim-emscripten-portability`. Do not relocate the app or recreate those folders as part of the next tasks.

This conversation's shell workspace was sometimes foss-earth even while the work belonged in 0sfs. Workspace permissions do not determine code ownership; select the appropriate workspace or request the normal write escalation instead of putting dependency work in the wrong repository.

Existing upstream work was already reported, including native PRs #1502 (wheel dynamics), #1504 (Emscripten portability) and SDK PR #8 (batching/gear contacts). These are historical references, NOT a fresh statement of their open/merged status. Consult existing repo documentation and current PR state before duplicating upstream work. Do not create PRs until the user confirms the relevant work functions correctly.

Do not revert unrelated changes or remove tracked SDK portability/vendor patches. Do not run Git, tests, builds for verification, dev servers or visible browser automation without the relevant explicit authorization. Prefer terminal/headless routes when checks are authorized. This documentation request did not accept the previous offer to run focused tests or native/WASM checks.

## What is implemented now

- Aircraft IDs: `cessna-172`, `cirrus-vision-jet` (legacy ID, now explicitly G1), `cirrus-vision-jet-g2`, `cirrus-vision-jet-g3`.
- JSBSim model names: `c172p`, `sf50`, `sf50-g2`, `sf50-g3`.
- G1 remains the canonical editable SF50 XML. `scripts/build-sf50-variants.mjs` regenerates G2/G3 XML from it.
- All SF50 generations currently share development aerodynamics, estimated installed-engine/spool/bleed behavior and exterior meshes. Separate identities/packages are NOT evidence of separate calibrated performance.
- G2 means original G2, not G2+. Evidence tagged `g2+` is deliberately separate and must not be silently assigned to G2 or G3.
- Published operating-envelope metadata distinguishes historical G1 FL280 from G2/G3 FL310. It is not an artificial altitude clamp.
- G3 cabin layouts, avionics, autothrottle and emergency systems are not newly implemented by the generation-selection change.
- An expanded offline processor now produces source-tagged AFM targets, generation-tagged tables, normalized recorder subsets and steady-flight review candidates.

### Public facts applied to the shared development baseline

| Parameter | Before | After | Source |
| --- | --- | --- | --- |
| Rated FJ33-5A thrust | 1,800 lbf | 1,846 lbf | Historical AFM PDF 23 / printed 1-7 |
| Nominal usable fuel capacity | 1,990 lb | 2,001 lb | Same page: 296 US gal, nominal 6.76 lb/US gal |
| Wing mean aerodynamic chord | 5.06 ft | 62.2 in / 12 | Public AMM station diagram |

These are source-backed baseline replacements, not a completed aerodynamic or engine fit. The nominal rating does not establish installed net thrust. TSFC 0.65, bleed loss 0.04, idle N1/N2 30/60 and maximum N1/N2 100/100 remain estimates in the development engine XML. The aggregate tank, loading, structural datum and inertia also remain provisional.

**Earlier flight-run numbers do not validate the changed model.** The MAC change affects moment normalization; thrust and capacity changes also require new matched runs when authorized.

## Code and data navigation

| Area | Starting files |
| --- | --- |
| IDs, family/variant integration | `src/flight/aircraft/aircraftIds.ts`, `aircraftCatalog.ts`, `sf50Variants.ts` |
| Existing panel and aircraft-specific controls | `src/flight/hud/FlightControlPanel.tsx` |
| Selection persistence and activation | `src/flight/createFlightSimApp.ts` |
| Flight profiles and loading | `src/flight/jsbsim/fdmProfiles.ts`, `hydrateJsbsimData.ts`, `createJsbsimRuntime.ts` |
| Shared bootstrap, despite the legacy filename | `src/flight/jsbsim/bootstrapC172.ts`, export `bootstrapAircraft` |
| Model package selection | `public/jsbsim-data/manifest.json` |
| Canonical airframe and shared engine | `public/jsbsim-data/aircraft/sf50/sf50.xml`, `public/jsbsim-data/engine/fj33_5a.xml` |
| Generated variants | `public/jsbsim-data/aircraft/sf50-g2/sf50-g2.xml`, `public/jsbsim-data/aircraft/sf50-g3/sf50-g3.xml` |
| Expanded data processing | `scripts/process-sf50-calibration-data.mjs`, `src/flight/validation/sf50ExpandedEvidence.ts` |
| Original source parsers/gates | `src/flight/validation/sf50PublicEvidence.ts` |
| AFM/runway methodology | `sf50AfmData.ts`, `sf50AfmReferenceCases.ts`, `sf50AfmBenchmark.ts`, `evaluateSf50AfmMeasurement.ts`, `runwayMeasurement.ts`, `sf50Airspeed.ts` under `src/flight/validation/` |
| Pilot/loading qualifications | `sf50PilotController.ts`, `sf50PilotProfiles.ts`, `sf50LandingPilot.ts`, `sf50RunwayConditions.ts`, `sf50Loading.ts`, `sf50SyntheticLoading.ts` in the same directory |

The current panel maps the flat aircraft catalog to radio choices. Aircraft activation saves the selected ID and reloads the application, changing the FDM package, controls, contact geometry, gauges and visuals together. The UI redesign must not replace that with a mesh-only change or silently leave the active physics on another generation.

The catalog also supplies LOD choices, opt-in HD meshes, credits and status. Vision Jet procedural meshes are shared; its third-party HD mesh has attribution requirements and is modeled gear-up. Preserve existing credit/opt-in behavior.

## Durable evidence corpus and actual processing results

Base directory: `planes/Cirrus_Vision_Jet/tests/public-evidence/`.

- `manifest.json`: original 47 sources, including 37 G1 TOLD tables.
- `public-audit-manifest.json`: 34 supplemental artifacts from the expanded public audit.
- `variant-manifest.json`: 16 selected G2/G2+ tables and four manufacturer-page snapshots.
- Total: **101 raw artifacts**, approximately 202.7 MB. These counts do not represent independent experiments.
- `calibration-input-manifest.json`: hashes of the extracted primary AFM candidates and public-dashboard arrays, including their upstream identities.
- `primary-afm-expanded-candidates.json`: 640 cruise and 180 cumulative-climb rows.
- `variant-processing-summary.json`: the latest executed processing ledger.
- `derived/variant-calibration-2026-09-12-v1/`: full latest outputs.
- `derived/public-audit-2026-09-12/`: previous analyzer/test reports and dashboard extraction.
- `raw/` and bulk `derived/` files are ignored by Git. They exist locally, but a fresh clone will not contain them automatically.

The latest processor completed all seven stages:

| Stage | Actual outcome |
| --- | --- |
| Primary G1 AFM | 640 cruise + 180 cumulative-climb rows; 12 existing ISA runway anchors |
| Candidate allocation | 600 fitting candidates; 220 same-source ISA+10 check rows; **0 independent-validation rows** |
| TOLD tables | 53 tables / 8,535 rows: G1 3,552, G2 3,361, G2+ 1,622; no parse-blocked tables |
| ERA22 G1 engineering export | 3,178 samples, no duplicates, two gaps, seven steady-review candidates |
| Public G1 dashboard | 1,013 samples, two gaps, 34 steady-review candidates |
| CEN21 engineering export | 450 rows, 360 unique times, 90 identical duplicate rows |
| Broad CEN21/CEN23 exports | Two inventories retained in quarantine; not normalized into calibration inputs |
| WPR20 fuel/oil subset | 714 timed records; calibration eligibility remains false |

The 41 steady windows are **review candidates**, not approved normal-flight tests. Screening uses non-overlapping windows of at least 60 seconds, limits on altitude/airspeed/N1/attitude variation, and available GPS/safety flags. Missing loading, configuration, channel meanings or independent review still block calibration.

Latest processing ran with:

```sh
node scripts/process-sf50-calibration-data.mjs \
  --out=planes/Cirrus_Vision_Jet/tests/public-evidence/derived/variant-calibration-2026-09-12-v1 \
  --summary=planes/Cirrus_Vision_Jet/tests/public-evidence/variant-processing-summary.json
```

Do not repeat those exact output destinations; the processor intentionally requires new ones. Reading existing output is usually enough to resume. The old collector/analyzer still cover their original manifest only, not automatic reacquisition of every supplement.

## Evidence decisions that must survive the handoff

### Primary AFM and source conflicts

The historical G1 baseline is AFM P/N 31452-001, 624 pages, latest listed Revision 4 dated 2018-11-20:

`planes/Cirrus_Vision_Jet/tests/SF50-POH.pdf`

SHA-256: `d83e904dbd6bc3656321c93d793166d4a5c6eddf81852b15767e5c336fc23949`.

[Public source](https://flightsimcoach.com/wp-content/uploads/2020/12/SF50-POH.pdf).

At 6,000 lb / sea-level ISA, its takeoff ground/50-ft distances are 2,036/3,192 ft. The primary and TOLD source agree on the 10 C and 20 C endpoints, but averaging those endpoints at 15 C gives 2,115/3,326 ft, not the AFM's explicit ISA column. Preserve the explicit entry; do not tune aerodynamics to this interpolation artifact.

At 5,550 lb / sea-level ISA, primary landing ground/total distances are 1,628/3,011 ft. TOLD interpolation gives approximately 1,621.5/2,532 ft, and a discrepancy also exists at exact temperature-grid points. The landing revision/applicability conflict remains unresolved. Do not average the sources, widen tolerances to hide it, or divide the primary distance by 1.67: the selected primary table is unfactored.

The historical G1 takeoff method uses a 5-degree pitch target and an 80-90 KIAS rotation range. Do not import the later 31452-002 10-degree/85-knot procedure into that reference case. Existing arrival presets are development conveniences, not all-weight VREF claims.

Cruise candidates span PDF 433-472; cumulative climb candidates span PDF 421-432, with climb conditions on PDF 420. They have not undergone complete independent visual transcription/conditions review. For example, the 6,000-lb/5,000-ft/ISA MCT row lists N1 93.8%, 114 US gph and 268 KTAS. Those numbers are table targets, not a measured installed thrust map.

Keep cumulative gallons and pounds as separately published fields; do not force their rounded values to agree through one fuel-density conversion. Printed increments are not accuracy bounds or test tolerances. Whole-minute cumulative climb figures cannot establish instantaneous climb rate or spool response.

The entire ISA+10 plane is reserved for same-source checks. It is not an independent flight-data holdout. Equilibrium CL inferred from L=W and tabulated TAS/OAT/pressure altitude is not measured CL-alpha, drag or a coefficient that was installed into the model.

### Variant applicability

[TOLD](https://github.com/RISCfuture/SF50-TOLD) is pinned at commit `3a6fa1853e67a221a7613ba3523c59886d7d0cab`. Its claims identify G1 31452-001 Rev A1, G2/G2+ 31452-002 Rev 2, and updated-thrust supplement 31452-111 Rev 1. These claims do not replace an applicable primary manual review. Its MIT license does not automatically resolve underlying AFM redistribution rights.

Original G2, G2+ and G3 must not be conflated. The [G2 announcement](https://cirrusaircraft.com/story/cirrus-aircraft-unveils-generation-2-vision-jet/) identifies FL310 and avionics/autothrottle changes. The [G2+ announcement](https://cirrusaircraft.com/story/cirrus-aircraft-unveils-g2-vision-jet-with-up-to-20-enhanced-take-off-performance-and-inflight-wifi-connectivity/) describes condition-dependent takeoff improvements, not a uniform 20% thrust multiplier.

The [G3 announcement](https://cirrusaircraft.com/story/cirrus-unveils-new-g3-vision-jet/) is dated 2026-02-03. Its [published specifications](https://cirrusaircraft.com/aircraft/vision-jet/) include 1,910 ft ground roll, 2,815 ft over 50 ft and 317 KTAS maximum cruise, but not a full matched condition matrix. They are context, not approved golden tests. Seating wording varies across page sections; do not infer a mass/CG distribution from it.

### Recorders and public flights

- **ERA22LA404, G1 serial 0088 / N77VJ, 2022-09-09:** the engineering CSV and report give measured N1/N2, requested N1, TLA, air data, attitude and automation/safety flags. Requested N1 can be near 47% while measured idle N1 is near 24%; the channels are not interchangeable. T2 is total inlet temperature, not OAT. Percent thrust is a computed channel, not measured engine force. Pre-upset windows still require qualification.
- Its public Cirrus letter estimates 4,981 lb, 22 C and 2,000 ft with AFM climb 1,971 ft/min. It was an energy/weather analysis, not an independent normal-climb measurement. Do not fit the convective upset as normal performance.
- **Public G1 serial 0045 / N474CG:** [flight 2754779](https://www.flightdata.com/flight/2754779), 2022-11-20 LKPR-LSZH, is retained as a public dashboard snapshot and extracted arrays. It contains roughly six-second samples, not raw one-second avionics data. AP values include `off`, `on` and `5`; they are not all booleans. Initial GPS `NoSoln`/zero values are not valid flight observations. Raw export, actual loading, complete configuration and reuse rights remain unqualified.
- **CEN21LA384, serial 0202 / N1GG:** not the historical G1 donor configuration. The broad CSV's formatted UTC clock omits the hour, and bootstrap records use year 0001. GPX alignment and status-word meanings remain unapproved. Accident weight was reported as 5,756 lb. Accident-time wind observations/timing have material limitations; do not substitute calm wind or a nearby METAR as exact conditions.
- **CEN23FA045, serial 0215 / N15VJ:** broad recorder remains quarantined for clocks, status words and CAPS/automation segmentation. A CAS message labeled N1 must not be used as the numeric fan-speed channel.
- **WPR20FA051, serial 0010 / N52CV:** its CSV uses `Time PST`, not ERA22's `Time`. The new subset processor handles this header. Fuel/oil/electrical data do not supply missing N1, attitude or brake-force evidence. Missing sentinels remain null.

### Geometry, engine data and remaining public routes

The public AMM station figure provides wing LEMAC FS177.2/MAC62.2 in, tail LEMAC FS353.3/MAC44.1 in, nose FS36.7, nose-gear FS89.05-89.91, main-gear FS208.95-211.74 and absolute main-gear BL67.5-67.9 in.

FS increases aft; body X increases forward. The existing model's structural coordinates are not established as real aircraft FS. An explicit reviewed datum anchor is required. Do not equate similarly named forward cabin/pressure bulkheads or treat the visual mesh origin as a certified datum. Real CG/loading, inertia, gear geometry and tail clearance remain unresolved.

The acquired [EASA engine TCDS](https://www.easa.europa.eu/en/downloads/7771/en) identifies a maximum HP bleed flow of 40 lb/min and installation/operating manual P/N 112471. Bleed flow is not a percentage thrust penalty. Uninstalled no-bleed ratings do not establish an installed FADEC/engine map.

Public-data options are **not exhausted**. Normal technical-publication access, an applicable later AFM/supplement, shared-flight raw exports and metadata/reuse permissions remain meaningful avenues. The Cirrus technical-publications site presented sign-in; no account was created and no restricted endpoint was bypassed. Do not assume every manual requires a paid subscription.

Garmin legacy Perspective Touch guide 190-01979-01 Rev A documents one-second SD CSV logging, with installation-dependent channels. Later Touch+/Cirrus IQ capabilities are not automatically present on G1; IQ hardware was identified for serial 0463 onward.

A recovered TOLD historical climb PDF and extraction scripts exist in the corpus; they do not supersede the pinned primary AFM. A public loads-certification paper describes methodology but did not supply reusable aerodynamic matrices. A separate physics-informed SF50 identification paper used X-Plane-generated data, not real-aircraft validation. ADS-B trajectories and other simulators cannot recover unmeasured pilot inputs, mass/CG or engine force.

No Cirrus employee, owner or provider was contacted, no purchase was made and no FOIA request was filed. The user wants reasonable public avenues exhausted before asking friends at Cirrus. Ask eventually for public references or explicitly approved releasable information, never restricted engineering documents.

## Historical runs, not current-model verification

Before the latest variant/model-input changes:

- The original offline analyzer completed its 47-source scope: 37 TOLD tables / 3,552 rows; CEN21 450 rows / 360 unique times / 90 exact duplicates.
- **42/42 tests passed across seven files**, using Node v26.8.2 and Vitest 4.1.6: `sf50PublicEvidence` (9), `sf50AfmData` (3), `runwayMeasurement` (5), `sf50AfmBenchmark` (8), `evaluateSf50AfmMeasurement` (6), `sf50LandingPilot` (7), `sf50PilotProfiles` (4).
- The v6 pilot work recorded 18 in-memory runs and 126/126 initialization checks. Those are not independent aircraft-validation holdouts.
- One historical takeoff fit reached about 4.19 degrees at liftoff and 5.05 degrees at 50 ft, with 1,941.08/3,244.42 ft ground/total versus primary 2,036/3,192 ft.
- One historical landing fit recorded 3.18 ft/s touchdown sink and 1,491.11/2,678.46 ft ground/total versus primary 1,628/3,011 ft. Fitting the pilot is not friction validation.
- A native FGTurbine Trim shadowing fix for stale initial N1/N2 was recorded in the native fork, with four native regression checks passing. Do not assume the production SDK consumes that fix.

A historical SDK build was retained at `/private/tmp/sf50-v5-validation.30axFG/sdk`, not adopted into production by that work. Its recorded WASM SHA-256 is `4e8c4a199aefe6bed6067f86ad4c24ee4aa3a894fe4c9c1b34c148dfdbfa9091`; entry SHA-256 is `a499e03992c8d959eea25686c0f2ae3efa85cd4b14e3a484acc7eb13bc52f4ec`. Temporary artifacts may no longer exist. Establish the actual native/SDK/artifact identity before comparing future runs.

Broader architecture and upstream SDK disposal/diagnostics were earlier reported unfinished. The last data/variant pass did not establish their closure; consult their existing records rather than declaring them completed.

**After the latest source-backed model changes, only offline data processing ran. No new focused tests, native/WASM flight checks or browser selection checks ran.**

## Resume priorities after the UI work

1. Preserve generation identity, source provenance, review blockers and current user changes.
2. Review the 41 windows and relevant AFM pages/conditions before allowing them into fitting. Resolve what each source can actually constrain.
3. Establish exact N1/TLA/bleed/configuration and loading/CG applicability. Do not conflate thrust, drag and pilot/friction errors.
4. Keep G1 as the strongest-reference baseline. Obtain applicable G2/G3 primary evidence before claiming distinct calibrated generation performance.
5. When authorized, add/run focused parser, selection/package and source-gate tests; then matched native/WASM scenarios with artifact identities and clearly separated same-source checks versus independent holdouts.
6. Update the proposal with measured outcomes and remaining blockers. Do not mark end-to-end implementation complete because the aircraft can load or a parser passes.

Additional durable context: [variant implementation](sf50-variant-models.md), [public acquisition](sf50-public-data-acquisition.md), [expanded audit](sf50-public-data-audit-2026-09-12.md), [AFM audit](sf50-afm-audit.md), [owner-data request](sf50-owner-data-request.md), [Cirrus question list](sf50-cirrus-questions.md), and [the proposal](../proposals/sf50-flight-model-v2.md).
