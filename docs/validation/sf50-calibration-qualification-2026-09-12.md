# SF50 G1 calibration qualification, 2026-09-12

> **Superseded in part.** The cruise altitude meaning, atmosphere convention,
> configuration basis and AFM gallon convention left open below were resolved
> from the primary source on 2026-09-13. See
> [the cruise condition and fuel-flow record](sf50-g1-cruise-fuel-flow-2026-09-13.md)
> and its
> [condition ledger](../../planes/Cirrus_Vision_Jet/tests/public-evidence/afm-cruise-conditions-2026-09-13.json).
> Cruise anti-ice and bleed remain unresolved, and every other blocker here still stands.
> The check batch requested at the end of this record has since been executed and passed.

This phase reviewed the existing 41 steady-window candidates and 27 selected primary AFM rows. It implements evidence-gate corrections and records the next identifiable engine constraint. **No aircraft coefficient was fitted, and no recording is approved for calibration or independent validation.** G2/G2+/G3 remain provisional. The aircraft-family UI and aircraft XML packages were not edited.

## Durable review records and scope

- [Window qualification ledger](../../planes/Cirrus_Vision_Jet/tests/public-evidence/steady-window-qualification-2026-09-12.json): all 41 candidate identities, source record/time bounds, whole-flight groups, observed automation/input categories, unit references, assumptions and blockers.
- [Selected AFM review ledger](../../planes/Cirrus_Vision_Jet/tests/public-evidence/afm-qualification-2026-09-12.json): 12 ISA cruise and 15 ISA cumulative-climb row identities, page provenance, numeric transcription review and unresolved condition interpretations.
- Existing numeric observations remain in `planes/Cirrus_Vision_Jet/tests/public-evidence/derived/variant-calibration-2026-09-12-v1/`. These files and the raw corpus are locally cached; this phase did not regenerate them or change the previous processing ledger.

Recorded source hashes below were read from the existing manifests, not checked by a new integrity-validation run. Candidate indices are one-based within each existing candidate file. ERA22 record numbers include CSV metadata and headers; dashboard record numbers index joined chart timestamps. They are not interchangeable sample clocks.

Source qualification consisted of reading the existing outputs, inspecting their referenced normalized records and pinned dashboard chart labels, and viewing selected local AFM PDF pages. The ledgers are authored review metadata, not rerun screening results. Unknown sensor accuracy, processing error, loading and tolerance remain explicitly unknown. This source review did not approve redistribution of the underlying data.

## Recorder dispositions

All seven ERA22 candidates are from serial 0088, N77VJ, on 2022-09-09; all 34 dashboard candidates are from serial 0045, N474CG, flight 2754779 on 2022-11-20. **There are two reviewed flights, not 41 independent experiments.** Keep each whole flight in one allocation; neither is designated an independent holdout. Known G1 identity does not establish the installed thrust-update/retrofit configuration.

The ERA22 CSV's recorded SHA-256 is `98504e0fcdad4539a2e3f133164e78e64b565e623f655af398c9a5dbfadf21a5`. Its [NTSB report](https://data.ntsb.gov/Docket/Document/docBLOB?ID=17547347&FileExtension=pdf&FileName=Recorded%20data%20specialist_s%20factual%20report-FINAL-Rel.pdf), PDF 4, identifies engineering-unit conversion and the UTC-to-EDT offset. That establishes a time/channel interpretation, not normal-operation qualification.

| Candidate | Source records | Observed issue and disposition |
| --- | --- | --- |
| ERA22-01 | 1048–1108 | Requested N1 94%, recorded TLA 23 degrees, NAV GPS/ALT. Context review only. |
| ERA22-02 | 1109–1169 | Same recorded input/modes. Context review only. |
| ERA22-03 | 1170–1230 | Same recorded input/modes. Context review only. |
| ERA22-04 | 1231–1291 | NAV GPS to HDG at record 1246 / 14:30:35 EDT. Exclude from a single-setting steady case. |
| ERA22-05 | 1475–1535 | Requested N1 94%, TLA 23, HDG/ALT. Context review only. |
| ERA22-06 | 1536–1596 | Recorded TLA alternates 23/24 at 1580, 1581, 1587 and 1588. Exclude from a single-setting case; do not infer pilot motion versus channel quantization. |
| ERA22-07 | 1658–1718 | ALT to VS at record 1717 / 14:38:26 EDT. Exclude from a single-setting steady case. |

Measured N1 spans 93.9–94.5% across these windows; requested N1 is 94%. The available AP/FD channels read 1 and the seven retained CAPS/AOA-ESP/high-pitch-ESP flags read zero. This does not establish absence of weather effects or all safety/automation interventions. Fuel flow is absent, airspeed is IAS, and T2 is total inlet temperature. Loading/CG, OAT, configuration and surface inputs remain unresolved. These windows cannot establish TSFC, installed force, CL-alpha, damping or a broad TLA/N1 schedule. The three exclusions do not imply the remaining four are normal-flight cases.

The 34 dashboard windows run from 13:05:20 through 13:44:58 UTC, records 339–734 with gaps between some selected windows. Every selected point has GPS `3DDiff` and AP `on`; the full flight's other AP values still include `5` and must remain uncoerced. N1 is essentially 99% across the windows. Repeated windows at that setting provide coverage along one flight, not enough excitation to identify a schedule. The source remains approximately six-second processed data, unsuitable for fast spool, damping or flare identification. Loading, configuration, complete safety review and original raw export remain missing.

The pinned dashboard SHA-256 is `e828d6ece046ffc1092356ce7f586ceca7cc0a34bf53cb1873438e0a34549249`. Its OAT-only chart assigns `data_oat` to an axis labeled `Temp (C)`; this resolves that display-unit question. Its fuel series says `Engine 1 gal/Hr`, which does not explicitly establish US versus Imperial gallons. The new normalizer retains `oatRaw`, adds `oatC`, and retains the fuel number as `extra.fuelFlowGalPerHourRaw`; qualified `fuelFlowUsGph` stays null. No conversion is guessed.

**Historical output caveat:** the prior `public-flight-normalized.json` and candidate means still label those fuel numbers `fuelFlowUsGph` and say OAT units are unreviewed. They were not regenerated. Read that fuel field as an unqualified chart observation, not an approved US-gph target; use this ledger for the newer unit decision. All 34 windows remain context-only. Total disposition: three excluded from single-setting cases, 38 context-only, zero eligible recordings.

## Selected primary AFM review

Source: [historical G1 31452-001 Rev 4](https://flightsimcoach.com/wp-content/uploads/2020/12/SF50-POH.pdf), SHA-256 `d83e904dbd6bc3656321c93d793166d4a5c6eddf81852b15767e5c336fc23949`. This review does not qualify later generations or a retrofitted aircraft by label alone.

Twelve ISA cruise rows were visually compared at 6,000 lb: PDF 433 / printed 5-75 (5,000 ft), PDF 441 / 5-83 (15,000 ft), and PDF 469 / 5-111 (28,000 ft), four power rows each. All selected numeric fields match the existing extraction. At 5,000 ft and printed OAT 5 C, the N1/fuel-flow pairs are 93.8/114, 86.5/88, 78.9/68 and 71.4/54 (% / US gph). These offer a narrow fuel-flow-versus-observed-N1 slice once the operating conditions are qualified.

The 28,000-ft MCT row `g1-cruise-6000-28000-0-MCT-100.4` publishes 100.4% N1. This exceeds the current estimated engine XML endpoint of 100.0. PDF 46 / 2-10 gives 104.7% maximum N1 and 105.7% for 30 seconds; PDF 56 / 2-20 gives rounded gauge markings and condition-dependent takeoff/MCT bugs. **Limits, gauge marks and operating targets are distinct.** Replacing `maxn1` with the limit would change the normalized-throttle mapping without supplying the missing FADEC schedule, so no such replacement was made.

All 15 ISA cumulative-climb rows on PDF 425 / 5-67, 6,000 lb and 0–28,000 ft in 2,000-ft steps, also match the extracted numbers. PDF 420 / 5-62 explicitly supplies MCT, gear UP, flaps UP, anti-ice OFF and the climb airspeed schedule. Bleed remains unspecified. These 27 transcription reviews do not promote the full 820-row corpus or clear condition eligibility.

Newly recorded source ambiguities must survive later fitting:

- Cruise says `Alt FT`; the derived pressure-altitude name is an interpretation needing a documented basis. Cruise configuration is not fully stated on these pages. Normal procedures support retraction and bleed-selection assumptions but do not establish installed bleed flow; cruise anti-ice is as required.
- At 28,000 ft the reviewed cruise and climb tables literally print ISA OAT −40 C; the general ISA chart on PDF 366 / 5-8 prints −41 C. Preserve both statements and the explicit ISA allocation. Do not silently replace the temperature or present an exact atmosphere match before resolving its convention.
- Climb says `Aircraft Weight: 6000 lb`; `initialWeightLb` adds an interpretation about evolving weight. It does not establish CG or a complete fuel/weight trajectory.
- The 28,000-ft cumulative climb endpoint publishes 32 US gal and 226 lb. Nominal 6.76 lb/US gal with simple nearest-integer rounding does not reconcile those values. Preserve both; do not infer a replacement density or fit both as an exact physical conversion.
- Specific range, time, fuel and distance retain their independently printed values. Printed resolution supplies no uncertainty bound or pass tolerance; cumulative climb does not provide instantaneous climb or spool response.

The existing **600 fitting candidates / 220 whole-condition ISA+10 same-source checks** allocation is unchanged. Only ISA rows were selected for this transcription review. No independent validation rows were created.

## Parameter-to-evidence plan

| Order and quantity | Identifiable constraint / next concrete action | Required gate and frozen subsystems |
| --- | --- | --- |
| 1. N1/TLA and fuel flow | Start with the four 5,000-ft ISA cruise rows above, followed by the reviewed 15,000-ft slice. Compare fuel flow at the specified observed N1 and imposed altitude/OAT/TAS, with Mach derived under an explicit atmosphere convention. Record AFM power tags separately. | Resolve configuration/anti-ice/bleed and altitude meaning first. AFM N1 is an observation, not a TLA command. ERA22 lacks fuel flow; the dashboard lacks TLA/requested N1 and a qualified gallon convention. No spool fitting from these steady windows. |
| 2. Installed thrust and drag | Retain cruise TAS and cumulative climb as coupled performance constraints. Acquire applicable engine/configuration data or an independently qualified force/drag constraint before separating them. | Do not tune TSFC to cancel a wrong thrust map or drag to cancel a wrong engine. Keep aerodynamic and installed-thrust coefficients fixed during the first fuel-flow diagnostic. CL from L=W is only equilibrium inference. |
| 3. Loading/CG and pitch/control response | Establish a reviewed station/datum anchor, actual mass/CG and relevant surface inputs before moments, inertia or control-response fitting. | The public AMM geometry and smooth AP-controlled traces do not supply CG, inertia or open-loop derivatives. Do not use pilot/autopilot fitting to conceal these gaps. |
| 4. Runway technique and friction | Retain the 12 explicit historical G1 ISA anchors and the historical 5-degree/80–90-KIAS takeoff method. Review applicable primary landing revisions and normal technique before new friction fitting. | Landing source conflict remains open. Need runway/weather/loading/brake and touchdown conditions. Do not borrow the later AFM 10-degree/85-knot procedure. |

The current native `FGTurbine::Run` maps normalized throttle linearly to estimated N1/N2 endpoints, obtains thrust from normalized N2 and thrust tables, and computes fuel flow using modeled thrust times TSFC before applying the bleed thrust reduction. Thus a TSFC fit against an assumed thrust map would not independently identify real TSFC. A future source-qualified implementation must make that dependency explicit. Generic engine capability changes belong in JSBSim; aircraft-specific schedules belong in the SF50 package. No dependency workaround was added.

## Public routes advanced in this phase

The [Cirrus 31452-111 supplement listing](https://store.cirrusaircraft.com/sf50-supplement-31452-111%2C-updated-thrust-schedule/5637446851.p) specifies serial 0005+ with data-plate configuration 26000-004, or compliance with SB5X-72-01. Record that configuration and bulletin status for donors; serial/generation labels alone do not qualify the updated schedule. The [31452-002 listing](https://store.cirrusaircraft.com/vision-jet-afm-31452-002%2C-perspective-touch--fl310-max/5637380083.p) identifies Touch+/FL310 applicability. These are applicability leads, not acquired engine maps or qualified later AFM tables.

The [technical-publication suite description](https://store.cirrusaircraft.com/sf50-vision-jet-online-technical-publications-suite/5637407076.p) says many documents are accessible with a registered account, while the complete suite requires purchase. The [portal](https://techpubs.cirrusaircraft.com/) presents sign-in. This establishes a legitimate next access route; it does not establish which specific manuals are free. No account, purchase or restricted access was attempted.

A [third-party text rendering of manufacturer-authored 31452-002 Rev 2](https://studylib.net/doc/26081008/vision-jet-afm) exposes a later full-flap, 5,550-lb landing table and its conditions on printed 5-149/150. Primary PDF identity/page images were not reviewed, and the text flattens column positions. It is a concrete acquisition lead, not a replacement for the pinned G1 targets or a resolution of G1 Rev A1 applicability. The previously published manufacturer PDF URL could not be fetched by the research tool.

[FlightData documentation](https://www.flightdata.com/about) describes Garmin log uploads, flight-history/logbook export and Google Earth export. It did not establish anonymous original CSV export, loading/configuration metadata or the gallon convention for flight 2754779. Its [privacy policy](https://www.flightdata.com/privacy-policy) distinguishes user-authorized public sharing from private logs but supplied no general downstream redistribution license in this review. Direct web fetching of the flight failed; the existing pinned local snapshot was sufficient for the channel-label review. No owners, employees or providers were contacted. Public options remain open.

## Implementation and pending checks

`sf50ExpandedEvidence.ts` now makes same-source checking an explicit purpose, enforces the ISA+10 allocation, and refuses a caller's attempt to claim the pinned AFM corpus as independent validation. Required conditions cannot be removed to bypass an unknown value; cruise includes unresolved anti-ice. Invalid conditions/metrics stay blocked while diagnostic differences remain available. Eligibility is labeled separately from any claim of aircraft validation. The dashboard normalizer records the reviewed Celsius caption and retains unresolved fuel units without an invented conversion.

Synthetic evidence regressions and generation/package regression source have been prepared. The stale catalog test expecting only two runtime IDs is updated for the current catalog/family contracts. No acceptance check has executed.

The first requested check batch, from `/Users/felg/gh/0sfs`, is:

```sh
npm test -- src/flight/validation/sf50ExpandedEvidence.test.ts src/flight/validation/sf50PublicEvidence.test.ts src/flight/validation/sf50AfmData.test.ts src/flight/aircraft/sf50Variants.test.ts src/flight/aircraft/aircraftCatalog.test.ts
```

This checks software evidence gates, null/channel handling, generation/package consistency and selection contracts. It is not a processing-pipeline rerun, UI browser acceptance or aircraft-fidelity result. It requires explicit approval under the resume prompt. No Git command or server is part of the request.

After those gates work, matched native/WASM checks need a separately recorded artifact identity and scenario plan. Source inspection shows production imports the installed `@0x62/jsbsim-wasm` package; the lockfile and installed package identify registry version `1.2.4-beta.4`, not the historical temporary SDK path. The canonical native source contains the recorded N1/N2 Trim assignment fix, but this does not establish its presence in the installed WASM binary. No new hashes, builds or flight runs were performed. Browser verification remains deferred; any required server must be started by the user unless separately explicitly requested.

Actual execution in this phase: source/document reads, selected PDF visual review, public web research, and code/test/document authoring only. **No tests, typecheck, builds, processing-pipeline runs, flight simulations, browser acceptance checks, dev servers or Git operations ran.** Earlier 42/42 results remain historical. The next phase is blocked on check authorization and the specific source/configuration decisions above, not declared complete calibration.
