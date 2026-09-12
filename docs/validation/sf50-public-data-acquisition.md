# SF50 public-data acquisition and evidence roadmap

Date: 2026-09-12

## Status

The expanded 2026-09-12 audit is recorded in [Public-data due diligence and remaining gates](sf50-public-data-audit-2026-09-12.md). The combined local corpus now contains 81 artifacts (200,995,197 bytes): the original 47 plus 34 supplementary documents, recorder exports, and navigation snapshots. Counts are artifacts, not independent sources or validation cases.

The supplemental work found a publicly shared G1 flight, two additional recorder dockets, a Cirrus engineering analysis, and 820 primary-AFM cruise/integrated-climb candidate rows. Public discovery is substantially expanded, but **we have not exhausted or qualified every available public record**. No Cirrus employee request is warranted merely because a search result or direct download failed.

The first public-source acquisition pass is complete: 47 source artifacts, 71,183,724 bytes, including 37 G1 performance CSVs containing 3,552 rows. Sources are pinned by URL, byte count, and SHA-256. No aircraft coefficients, flight controls, installed SDK, or dependency repositories changed during this work.

The raw sources have been retained locally, rather than left only in a temporary directory. The raw cache is ignored by Git: public availability is not blanket permission to redistribute manufacturer documents or third-party docket attachments.

The offline analyzer has now run successfully against the original 47-source manifest. All 42 focused tests passed across seven files, including the nine public-evidence cases and the landing-pilot/profile cases. Runtime: Node v26.8.2, Vitest 4.1.6. The extracted network collector was not run. The supplemental sources were acquired and inventoried separately, not silently included in the original analyzer's coverage. No aircraft simulation or held-out aircraft evaluation was run; aircraftValidated remains false.

Inventory and evidence:
- [Pinned source manifest](../../planes/Cirrus_Vision_Jet/tests/public-evidence/manifest.json)
- [Acquisition and comparison snapshot](../../planes/Cirrus_Vision_Jet/tests/public-evidence/evidence-snapshot.json)
- [Candidate recorder response data](../../planes/Cirrus_Vision_Jet/tests/public-evidence/cen21-response-candidate.json)
- [Local corpus instructions](../../planes/Cirrus_Vision_Jet/tests/public-evidence/README.md)
- [Owner/instructor data request and intake checklist](sf50-owner-data-request.md)

## 1. Recorder data: acquired, not yet approved for flight-model replay

### CEN21LA384

Source: [NTSB docket](https://data.ntsb.gov/Docket?NTSBNumber=CEN21LA384), particularly item 20, the recorder factual report, and item 21, its tabular attachment. Use the factual report's verified parameter list rather than guessing meanings from raw ARINC labels.

The engineering-unit CSV contains 450 data rows spanning 18:57:05.32 through 18:58:34.91. There are 360 unique timestamps and 90 identical timestamp duplicates. Positive timestamp gaps include 88 gaps of 0.40 seconds and one of 0.41 seconds. The report describes nominal 5 Hz recording but explicitly says not every channel updates at that rate. The CSV uses Windows-1252 text, not UTF-8.

Preserve all source records in the candidate artifact. The new parser explicitly removes only identical timestamp duplicates from its normalized output, reports the gaps, and rejects conflicting duplicates or backwards time. Do not interpolate across missing timestamps and then claim the generated samples are independent observations.

The CSV labels the time basis EDT. The recorder report heading says CDT, but the newly acquired meteorological report explicitly identifies 18:58 EDT / 22:58 UTC, and the GPX has corresponding UTC-Z times. This supports EDT as the event basis while preserving the erroneous/inconsistent source heading. The broad raw CSV truncates displayed UTC clock values to minute/second strings; complete per-sample alignment is still unapproved.

Candidate engine observations, measured from sampled values:
- The lever first reaches the recorded 38 deg position at 18:57:09.92, when N1 is 25.2%.
- The first subsequent sampled N1 at or above 90% is at 18:57:15.32, 5.40 seconds later.
- The lever reaches -22 deg after retard at 18:57:56.92, with sampled N1 still 94.7%.
- The first subsequent sampled N1 at or below 30% is at 18:58:06.32, 9.40 seconds later.
- Each crossing has its preceding sample retained in the JSON. These brackets are sampling observations, not total measurement-uncertainty bounds.

This is an accident takeoff/runway-excursion sequence, not a normal landing or a successful takeoff reference. The final NTSB report identifies serial 0202 and an accident weight of 5,756 lb; do not treat it as a directly applicable historical G1 reference. The broad raw export includes gross-weight and bleed channels, but their status words and time alignment remain unreviewed. The meteorological report documents missing ASOS winds during the accident interval and uncertain LLWAS timing, so calm-wind replay is not justified. At least the following remain necessary before model comparison: exact aircraft/FADEC configuration, environment and installed bleed state, review of the usable segment, channel latency/update behavior, and a justified mapping from recorded lever degrees to simulated controls.

Parking-brake OFF does not establish that the pilot was not using pedal brakes. Flap commands do not establish measured flap travel. Recorded N1 is not a measurement of installed thrust. Do not replace the model's idle N1 or fit tire friction directly to this recording without the missing conditions.

### CEN23FA045

Source: [NTSB docket](https://data.ntsb.gov/Docket?ProjectID=106361), item 9, RDM DATA.

Acquired the 1 Hz CSV, 2,631,190 bytes, SHA-256 a5a43eb768bc0e3576e6ce71970fd067db4ab713c67ecf17e245865d9b37d58f. It has 1,030 CSV records including three header records and 1,083 columns. The header structure includes labels, units/status fields, and human-readable descriptions.

Its inventory includes numeric fan/core speed and requested-speed channels, pitch/rate channels, and CAPS/automation flags. Some columns named N1 are CAS/status indications, not the numeric fan-speed channel. Repeated SSM columns must retain positional identity.

The export starts with year-0001 bootstrap dates. Its usable clock, SSM interpretation, unit mapping, and normal-operation/abnormal-automation boundaries have not been approved. It remains quarantined; the analyzer inventories rather than replays it.

### Further docket work

The expanded audit acquired ERA22LA404's engineering-unit recorder CSV, recorder report, final report, and Cirrus energy analysis. It also acquired WPR20FA051's recorder CSV/report: that export concerns electrical channels, oil pressure and fuel flow, not pitch, N1 or brake input. CEN21LA384's GPX, broad raw CSV, maintenance records, weather report, final report and first weather attachment were acquired; the second weather attachment timed out twice. Archives are not equivalent to completed semantic review. CEN25LA069 and DCA24LA328 exposed no public attachments in the attempted docket route. See the dated audit for exact acquisition failures and applicability gates; this is not a worldwide accident census.

## 2. AFM-derived performance tables: broad coverage, material disagreement

Source: [SF50-TOLD](https://github.com/RISCfuture/SF50-TOLD), pinned commit 3a6fa1853e67a221a7613ba3523c59886d7d0cab.

The actual resource location is SF50 Shared/Data/g1, not the root Data directory described in the README. The collected subset includes takeoff distance/corrections, takeoff climb rate/gradient, normal enroute climb rate/gradient/speed, 50% and 100% landing distance/corrections, and VREF tables. Some VREF tables are explicitly ice-configured; that does not provide an icing validation dataset. Icing performance directories, contamination directories, regression coefficients, and later-generation resources were not acquired.

The repository identifies its G1 reference as P/N 31452-001 Rev A1. Our existing source is the historical Rev 4 PDF pinned in sf50AfmData.ts. Its MIT notice is retained, but underlying AFM applicability and reuse rights still require separate consideration.

A source-to-source comparison was performed for all 12 existing ISA reference rows, comparing both distance metrics: 24 comparisons, no simulated aircraft runs. CSV temperature was interpreted as OAT, using ISA temperature at each pressure altitude and piecewise linear interpolation. This interpretation and the differently revised sources remain part of the reconciliation, not facts to hide.

Examples:
| Condition | Existing pinned AFM | Interpolated TOLD CSV | Difference |
| --- | ---: | ---: | ---: |
| Takeoff, 6,000 lb, sea level, ground | 2,036 ft | 2,115 ft | +3.88% |
| Takeoff, same condition, total | 3,192 ft | 3,326 ft | +4.20% |
| Landing, 5,550 lb, sea level, ground | 1,628 ft | 1,621.5 ft | -0.40% |
| Landing, same condition, total | 3,011 ft | 2,532 ft | -15.91% |

The 6,000-lb sea-level takeoff difference is an interpolation effect, not evidence of a changed aircraft: the primary AFM and CSV share the 10 C and 20 C values (ground 1,999/2,231 ft; total 3,133/3,519 ft), but their linear averages differ from the AFM's explicit ISA entries (2,036/3,192 ft). Preserve the explicit ISA column rather than reconstructing it from a sparse temperature grid. A thrust-schedule breakpoint is a possible physical explanation for the nonlinearity, not a verified diagnosis.

The landing total difference remains about 16% across sampled altitudes, while ground roll differs by about 0.4%. Unlike the takeoff example, landing values disagree at exact temperature grid points. Its cause remains unresolved. Do not average sources, change the aircraft, widen tolerances, or assume the newer transcription is correct. Keep the pinned Rev 4 targets until the applicable newer primary pages and procedures can be reconciled.

The new numeric-table parser checks structure and numeric fields, rejects duplicate coordinates and missing values, and refuses extrapolation. Passing those checks establishes usable table structure, not authoritative aircraft performance.

Automatic primary-AFM extraction now retains 640 cruise rows from PDF pages 433-472 and 180 integrated-climb rows from pages 421-432, with page provenance and explicit units. They are candidates, not fully visually checked golden targets. Their additional conditions and applicability must be approved before use. Retain published cumulative gallons and pounds separately rather than silently forcing a conversion. The TOLD repository's archived climb.pdf was also recovered from its parent commit; do not substitute that differently sourced excerpt for the pinned primary AFM.

## 3. Physical references: a public drawing narrows the gap

Source: [WPR20FA051 airframe report](https://data.ntsb.gov/Docket/Document/docBLOB?ID=14462664&FileExtension=pdf&FileName=FINAL%20-%20Airframe%20Examination-WPR20FA051-Rel.pdf), PDF page 13, printed report page 12, Figure 15. It reproduces AMM Figure 6-00-2 dated 2018-07-09, which was visually inspected.

The drawing distinguishes wing LEMAC at FS 177.2 and wing MAC 62.2 inches from tail LEMAC at FS 353.3 and tail MAC 44.1 inches. It marks the nose at FS 36.7. Depending on loading and gear travel, the nose-gear station is 89.05-89.91, main-gear station 208.95-211.74, and main-gear absolute buttock line 67.5-67.9 inches. These are geometry references, not tire-contact spring tuning values.

The [EASA SF50 TCDS, Issue 5](https://www.easa.europa.eu/es/downloads/24242/en) defines the datum relative to a forward cabin bulkhead. The NTSB report separately references a forward pressure bulkhead at FS 93. Do not equate differently named bulkheads without reconciliation.

The new coordinate helper requires an explicit reviewed anchor and respects opposite FS/body-x directions. It does not assume the mesh origin is the datum, and it is not wired into the aircraft XML. Neither station definitions nor a drawing supplies the actual airplane's empty weight/CG, inertia, installed equipment, loaded strut state, or exact tail clearance.

The FJ33/FJ44 engine TCDS was archived and its bleed/rating sections examined. For FJ33-5A it lists a 40 lb/min maximum high-pressure bleed extraction, not a thrust-loss percentage. Its ratings are uninstalled, no-aircraft-bleed/no-accessory-load conditions. It directs installed thrust setting and configuration details to operating/installation instructions P/N 112471; the public TCDS does not provide the required installed thrust-versus-N1-and-bleed map.

## 4. Normal owner-data access and technical-publication access

Both the Touch+ guide and the legacy [Perspective Touch guide 190-01979-01 Rev A](https://static.garmin.com/pumac/190-01979-01_a.pdf) are archived. The legacy guide, section 8.11, printed page 628/PDF page 646, documents once-per-second SD-card CSV logging, separate from CMC data, with installation-dependent channels. It covers software 1986.B2 or later. See the owner request for a minimal intake list.

A publicly shared serial-0045 flight was accessible through ordinary isolated headless Chrome navigation. Its dashboard snapshot contains 49 time-series arrays with 1,013 points each, plus one cruise-phase array. Most intervals are six seconds, not the original one-second avionics cadence. Retain it as processed observational evidence; loading, original export, normal-operation review and redistribution terms remain unresolved.

[Cirrus IQ documentation](https://cirrusaircraft.com/cirrus-iq-faq/) also describes export, but identifies Vision Jet IQ hardware from serial 0463 onward. It is not evidence that our historical G1 target has IQ logging. Verify each aircraft and avionics version before selecting an export route.

The [publications landing page](https://cirrusaircraft.com/technical-publications/?category=afm&model=sf50) links to [Cirrus Technical Publications](https://techpubs.cirrusaircraft.com/). Its publicly served page code resolves the loading shell to a sign-in screen. No anonymous document inventory was obtained, no authenticated endpoints were probed, and no account was created. Normal authorized sign-in remains a legitimate access route, not a reason to ask employees for restricted material.

No account was created, subscription purchased, email sent, owner contacted, public issue filed, or FOIA request submitted.

## 5. Evidence-to-test mapping and remaining gates

| Target behavior | Evidence now retained | Next gate before aircraft assertions |
| --- | --- | --- |
| N1/N2 transients | CEN21/CEN23 exports; G1 ERA22 verified engine channels | Segment, configuration, input mapping, environment and update-latency review |
| Takeoff/landing distances | Pinned AFM plus a separate CSV transcription, not independent flight evidence | Use explicit ISA entries; resolve exact-grid landing disagreement |
| Climb performance and VREF | G1 CSV grids | Verify primary source pages, units, power, speeds, loading and configuration |
| Gear/CG geometry | AMM station diagram and aircraft TCDS | Map reviewed model anchor, reconcile bulkheads, acquire actual loading/inertia |
| Normal flare/braking | Public G1 dashboard candidate, but no approved raw normal-flight trace | Consented owner recording with technique, runway and loading context |
| Cruise and fuel burn | 640 primary cruise rows, 180 integrated-climb rows, public G1 dashboard candidate | Review transcription, units, conditions, loading and holdouts |
| Roll/handling observations | AOPA firsthand flight report lead from prior research | Review original footage, configuration, conditions and uncertainty |

The supplied tests cover ingestion and evidence eligibility, not flight fidelity. The eligibility gate defaults to blocked until provenance, variant, units and conditions are reviewed; recording/observational evidence additionally needs timebase and normal-operation review. Validation must be independent of calibration. Even eligible evidence is not itself an aircraft-validation pass.

Do not use the present simulator, another desktop simulator, a fitted pilot controller, or unvalidated aerodynamic predictions as independent ground truth. Do not let an autopilot conceal poor open-loop dynamics. Preserve whole-flight/condition holdouts when a real validation corpus is approved.

## 6. Reproduction

Use Node with native TypeScript stripping for the analyzer. This run used Node v26.8.2; the earlier instructions targeted Node 22. From the application root:

~~~sh
node scripts/analyze-sf50-public-evidence.mjs \
  --raw-root=planes/Cirrus_Vision_Jet/tests/public-evidence/raw \
  --out=/private/tmp/sf50-evidence-analysis-new
~~~

To reacquire the exact pinned sources into a fresh directory:

~~~sh
node scripts/collect-sf50-public-evidence.mjs \
  --out=/private/tmp/sf50-evidence-download-new
~~~

Both commands refuse an existing output directory. Download changes fail the pinned hash rather than silently replacing the evidence. The collector is explicitly networked; the analyzer is offline and checks source integrity before parsing.

The offline analyzer and 42 focused unit cases now pass; the network collector remains unexecuted. Results are retained in public-audit-test-results.json. The original snapshot is historical and is not overwritten. The dated audit distinguishes the original analyzer's 47-source coverage from the 34 supplementary artifacts and research-only extraction.

## 7. Before contacting Cirrus friends

The immediate priority is qualification of the public evidence already found, not more coefficient tuning or an employee request. Review the primary AFM candidates, G1 pre-upset recorder segments, and public shared-flight data. Obtain applicable primary landing pages through normal publication access and determine whether the public-flight provider offers a raw export and reusable fixtures. Preserve whole-flight/condition holdouts before tuning.

A good eventual Cirrus request is a short list of unresolved, impactful questions with source IDs, attempted access routes, and why each answer changes a test. It should seek public references or approved releasable information, not ask employees to share restricted engineering material.

This pass materially improves the evidence base, but it does not claim that all public options have been exhausted or that the SF50 is validated end to end. The public shared-flight listing itself contains more records than were acquired; downloading every record is not the same as obtaining the missing loading, input and rights information.


## 8. First model inputs and generation-aware processing

[Generation implementation and processing methodology](sf50-variant-models.md) documents the next phase. The corpus adds 16 selected pinned G2/G2+ tables and four manufacturer-page snapshots in `variant-manifest.json`; the earlier 81-artifact audit remains historical. G2+ is a separate evidence configuration, not a G3 alias.

`scripts/process-sf50-calibration-data.mjs` handles the expanded manifests, primary AFM candidates, ERA22 engineering data, shared-flight dashboard series, existing CEN21 engineering data and a WPR fuel/oil subset. Broad raw recorder exports remain quarantined where clocks/status/automation are not qualified. Derived input identities are pinned in `calibration-input-manifest.json`.

Actual processing outcomes are retained in `planes/Cirrus_Vision_Jet/tests/public-evidence/variant-processing-summary.json`. Processing success is not an aircraft test. Three sourced baseline inputs are applied; variant-dependent engine/drag/friction fitting is still gated on qualified conditions and source applicability.


## 9. Durable handoff after processing (2026-09-12)

The expanded processor completed its run against 101 raw artifacts. It produced 820 primary AFM cruise/climb candidates, 12 existing ISA runway anchors, 8,535 rows across 53 generation-tagged TOLD tables and 41 steady-flight review windows. These are processing counts, not independent experiments or validated aircraft behavior. The current ledger is `planes/Cirrus_Vision_Jet/tests/public-evidence/variant-processing-summary.json`.

[The consolidated SF50 handoff](sf50-development-handoff.md) preserves source-revision conflicts, generation applicability, recorder/channel limitations, public-access follow-ups and ownership boundaries. Existing raw and bulk derived artifacts remain local/Git-ignored; a new conversation on this machine can use them, but a new clone will not automatically have the corpus.

The next task is the [aircraft-family gallery UI](../prompts/aircraft-selection-ui-work-app-prompt.md), followed by [SF50 source qualification and development](../prompts/sf50-resume-work-app-prompt.md). No employee outreach, new tests or flight checks were authorized or performed by the handoff request. Public-data qualification is not complete and public options have not been declared exhausted.
