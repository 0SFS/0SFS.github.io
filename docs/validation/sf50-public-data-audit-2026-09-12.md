# SF50 public-data due diligence: expanded audit

Date: 2026-09-12  
Target: historical SF50 G1 / AFM P/N 31452-001, with the existing Rev 4 source retained  
Status: substantial acquisition and tooling progress; public evidence is not fully exhausted or aircraft-qualified

## Executive decision

We have enough public material to move from speculative tuning toward a source-driven model-development program. We do **not** yet have grounds to say either "every public option has been exhausted" or "the aircraft is validated."

The most important discovery is not another advertised performance number: an explicitly shared G1 flight exposes engine, air-data and attitude chart series without a login. A separate G1 NTSB docket supplies a much richer recorder export and a Cirrus engineering analysis. These should be qualified before asking Cirrus employees for internal data.

The immediate next work is therefore evidence qualification and integration, not a new coefficient fit. Normal publication access, raw-export/reuse clarification, exact loading, and recorded-input interpretation remain necessary. A downloaded PDF, a successful parser, and a physically credible aircraft are three different accomplishments.

No accounts were created, purchases made, owners contacted, messages sent, FOIA requests filed, or upstream PRs opened. No aircraft coefficients or dependency code changed.

## 1. Scope, stopping rule and actual coverage

This audit followed manufacturer/regulator publications, primary accident records, archived table provenance, public owner-log sharing, original flight reports, research papers, simulator qualification references, and surveillance-data access. It prioritizes evidence that can constrain the target aircraft, not the number of URLs collected.

A defensible public-data stopping rule is:

1. Every material behavior has a documented source-search path.
2. Accessible high-value sources are retained with provenance and applicability.
3. Each proposed target has known units, conditions, measurement definitions and limitations.
4. Conflicts are resolved or quarantined, not averaged away.
5. Remaining gaps are clearly access-, rights-, configuration-, or measurement-limited.
6. No material, untried ordinary public route remains before an employee request.

We have made substantial progress on the first two conditions. We have not completed the last four. In particular, the public shared-flight catalog contains more flights than this audit acquired, and the expanded AFM/recorder corpus still requires semantic review. A bounded search is not proof that no other document exists.

| Source route | Work actually performed | Outcome and next boundary |
| --- | --- | --- |
| Existing primary AFM | Retained the pinned Rev 4 PDF; extracted additional cruise and integrated-climb tables | 820 candidate rows; complete visual and operating-condition review still required |
| SF50-TOLD provenance | Examined pinned CSVs and the commit that removed the original extraction directory; recovered its climb PDF | Takeoff interpolation issue explained; exact-grid landing conflict remains |
| Cirrus technical publications | Fetched public shell and page code through normal requests | Sign-in screen confirmed; no anonymous inventory obtained; authorized login remains untried |
| EASA aircraft/engine certification | Retained the earlier aircraft TCDS and examined the engine rating, bleed and instructions sections | Limits and document identifiers, not an installed engine map |
| NTSB CEN21LA384 | Acquired broad CSV, GPX, final report, weather, maintenance and first weather attachment | Richer conditions available, but donor configuration and accident winds prevent direct G1 replay |
| NTSB CEN23FA045 | Examined systems context and broad CSV structure/clock/flags | Abnormal-automation recording remains quarantined |
| NTSB ERA22LA404 | Acquired recorder CSV/report, final report and Cirrus energy analysis | High-value G1 pre-upset candidate plus a bounded manufacturer estimate |
| NTSB WPR20FA051 | Acquired recorder CSV/report in addition to the station drawing | Export concerns electrical/fuel/oil channels, not flight-control dynamics |
| Other investigations | Checked CEN25LA069 and DCA24LA328 docket routes; searched Swiss, BEA, AAIB, ATSB and ANAC sources | No attachments exposed for those two NTSB routes; international leads did not yield a new reusable flight-dynamics dataset |
| Public owner sharing | Screened FlightData's public SF50 entries and followed ordinary shared-flight links | One G1 dashboard acquired; raw export, reuse permission and missing loading remain open |
| Garmin logging | Acquired the applicable legacy Touch guide, supplementing Touch+ | Existing one-second SD exports are a legitimate acquisition path |
| Research and flight reports | Found Cirrus loads paper, screened NASA/academic results and original flight-report leads | Useful methodology and qualitative context; no reusable full aircraft derivative/inertia database acquired |
| Simulator qualification | Examined FAA NSP/Part 60 route and existing qualification leads | Qualification status/standards are not public access to the manufacturer's QTG data |
| Surveillance and public-record requests | Reviewed OpenSky access and NTSB FOIA routes | Supplementary trajectory/context possibilities; no request or licensed bulk acquisition initiated |

The queries included exact AFM part/revision searches, SF50 recorder/CSV searches, named accident/registration searches, NASA/DTIC/university aerodynamic searches, SF50 flight-test searches, engine installation-document searches, and SF50 QTG/data-package searches. Negative search results are logged as unsuccessful searches, never as proof of nonexistence.

Two initially guessed accident IDs resolved to unrelated events. Those were excluded; the correct ERA22LA404 and CEN25LA069 identifiers were obtained from primary NTSB reports. This is not a complete worldwide accident census.

## 2. What is saved and what the counts mean

The local corpus contains **81 artifacts, 200,995,197 bytes**. The original manifest covers 47 artifacts; the supplement adds 34. The latter comprises 21 acquired document/recorder artifacts, one hydrated public-flight snapshot, and 12 navigation/provenance snapshots. Several are from the same publisher or underlying flight: they are not 81 independent validation sources.

The original 37 G1 performance CSVs contain 3,552 rows. The new primary extraction contains 640 cruise and 180 integrated-climb rows. Neither row count is an aircraft test count.

Durable artifacts:

- [Supplemental manifest and acquisition attempts](../../planes/Cirrus_Vision_Jet/tests/public-evidence/public-audit-manifest.json)
- [Primary AFM expanded candidates](../../planes/Cirrus_Vision_Jet/tests/public-evidence/primary-afm-expanded-candidates.json)
- [Audit findings and evidence gates](../../planes/Cirrus_Vision_Jet/tests/public-evidence/public-audit-findings.json)
- [Partial recorder research inventory](../../planes/Cirrus_Vision_Jet/tests/public-evidence/public-audit-recorder-review.json)
- [Executed analyzer and focused-test results](../../planes/Cirrus_Vision_Jet/tests/public-evidence/public-audit-test-results.json)
- [Corpus instructions](../../planes/Cirrus_Vision_Jet/tests/public-evidence/README.md)

Raw downloads and derived full-data artifacts remain in Git-ignored directories. Public accessibility does not establish permission to redistribute manufacturer publications, third-party docket attachments, or owner logs. The manifest preserves URLs, byte counts and SHA-256 hashes; personal redactions in the published documents remain intact.

Navigation pages and the hydrated dashboard are dynamic snapshots, not stable binary downloads. A changed response must not be accepted by silently replacing its hash. The existing collector/analyzer still use the original manifest; the supplement is deliberately separate so its coverage cannot be mistaken for an executed production ingestion pipeline.

## 3. AFM reconciliation and expanded performance evidence

### Takeoff: explicit ISA values must survive ingestion

For the 6,000-lb, sea-level case, both the primary AFM and TOLD CSV give ground distances of 1,999 ft at 10 C and 2,231 ft at 20 C. Linear interpolation at 15 C gives 2,115 ft. The same primary page explicitly gives 2,036 ft in its ISA column.

The total-distance endpoints similarly give a linear average of 3,326 ft, while the explicit ISA entry is 3,192 ft. Thus this example is explained by loss of the explicit ISA entry followed by interpolation, not by an observed change in aircraft performance. A thrust-schedule breakpoint is a possible physical explanation of the nonlinearity, but has not been independently established. [Primary AFM, PDF page 383 / printed 5-25](https://flightsimcoach.com/wp-content/uploads/2020/12/SF50-POH.pdf)

Methodology change: use exact published ISA entries for ISA cases. Keep sparse-grid interpolation as a separately labeled approximation. Do not fit drag or thrust to an interpolation artifact.

### Landing: the disagreement is still substantive

Landing values disagree at exact temperature grid points, so the takeoff interpolation explanation does not resolve them. The existing 5,550-lb/full-flap ISA target remains 1,628 ft ground / 3,011 ft total. The TOLD transcription's interpolated values are about 1,621.5 / 2,532 ft.

The older primary page expressly identifies unfactored distances. Do not divide its total by a regulatory landing factor to manufacture agreement. The newer transcription is not independent flight-test evidence, and the exact newer primary landing pages/procedures were not acquired. Retain the Rev 4 target and quarantine the conflict. [Primary AFM, PDF pages 486-487](https://flightsimcoach.com/wp-content/uploads/2020/12/SF50-POH.pdf), [TOLD repository](https://github.com/RISCfuture/SF50-TOLD)

The examined December 2025 TOLD change largely reorders these landing rows; it does not explain the older-source disagreement. The removed extraction directory and climb PDF remain available at parent commit 5b0345689ba98cafce44659ac97d634a74c600ad. The repository's source claim is Rev A1; a public temporary-change notice confirms that revision exists but does not provide the missing performance section. [Table-history commit](https://github.com/RISCfuture/SF50-TOLD/commit/e3aedbc69b93d439919c0af403bd61719449b21a), [FAA-filed temporary change](https://downloads.regulations.gov/FAA-2023-0424-0002/attachment_1.pdf)

### Additional primary targets, not yet approved golden rows

The candidate JSON records each page, pressure altitude, weight, temperature, engine speed, fuel flow, airspeed and power designation where present. The 640 cruise rows come from PDF pages 433-472. The 180 integrated-climb rows come from pages 421-432; their shared procedure page is 420.

Examples retained from the primary source:

| Case | Published values |
| --- | --- |
| Cruise, 5,000 ft, 6,000 lb, ISA, MCT | N1 93.8%; 114 US gal/h; 268 KTAS |
| Same altitude/weight/ISA, tabulated part power | N1 86.5%; 88 US gal/h; 234 KTAS |
| Same altitude/weight/ISA, maximum-range row | N1 71.4%; 54 US gal/h; 164 KTAS |
| Integrated climb, initial 6,000 lb, ISA, to 28,000 ft | 21 min; 32 US gal; 226 lb; 68 nm; terminal scheduled speed 140 KIAS |

These are published columns, not newly measured aircraft results. Gallons and pounds are retained independently: their differences must be reviewed, not hidden behind an assumed density conversion. Automated extraction found the expected row structures, but that is not a complete visual transcription audit. [Primary AFM, PDF pages 425 and 433](https://flightsimcoach.com/wp-content/uploads/2020/12/SF50-POH.pdf)

Climb gradients use ft/nm, not percent. The primary enroute-climb conditions call for MCT, gear/flaps up and anti-ice off; the gradient procedure describes approximately 95% best-rate performance. A comparison must use the scheduled speed and configuration, not whichever speed maximizes the simulator's climb.

## 4. Recorder evidence: stronger sources, stricter applicability

### ERA22LA404: the highest-value new G1 recording

The final report identifies a 2018 aircraft, serial 0088. The published CSV has 3,178 timed rows, 56 columns and times from 14:10:00 to 15:02:59 EDT. The recorder report provides engineering-unit/sign conventions and explains UTC-to-EDT correlation.

It includes N1/N2, requested N1, lever angle, engine total temperature, indicated airspeed, pressure altitude, attitude, accelerations and automation/protection flags. It does not make measured surface positions, brake force, CG or installed thrust force available merely by containing similarly named engine/automation channels.

The final upset/CAPS interval is unsuitable as normal-operation ground truth. Earlier flight portions are candidates, not automatically approved segments. The engine's reported percent-thrust signal must not be treated as a load-cell measurement or multiplied by a sea-level rating at every altitude. [Recorder report and CSV in the NTSB docket](https://data.ntsb.gov/Docket?NTSBNumber=ERA22LA404)

A useful interpretation warning already appears at the start: requested N1 is about 47%, while measured N1 is about 24.2%. This requires phase/signal-definition review, not a conclusion that the engine failed to track its command.

The two-page Cirrus energy analysis was visually inspected. It uses an estimated aircraft weight of 4,981 lb, OAT 22 C and average altitude 2,000 ft to quote AFM climb capability of 1,971 ft/min. Its purpose is to distinguish expected aircraft energy gain from convective uplift. This is an additional condition-specific AFM consistency candidate, not an independent normal climb measurement. [Cirrus letter, 2024-08-05, pages 1-2](https://data.ntsb.gov/Docket/Document/docBLOB?ID=17486254&FileExtension=pdf&FileName=Updated%20Energy%20Analysis%20NTSB%20req%2008.05.2024_Redacted-Rel.pdf)

### CEN21LA384: additional loading and weather, not a clean takeoff oracle

The broad CSV has 4,642 data rows and 1,097 columns, including gross-weight and bleed-related fields. It is UTF-8, unlike the smaller Windows-1252 engineering-unit export. Forty initial records use year 0001; subsequent displayed clock strings omit hours. The GPX supplies 921 UTC-Z time entries, but full synchronization is not approved.

The final NTSB report identifies serial 0202 and accident weight 5,756 lb. It gives condition-specific AFM takeoff comparisons, not a successful measured takeoff. These facts narrow the scenario but do not establish applicability to our historical G1 target. [Final report](https://data.ntsb.gov/carol-repgen/api/Aviation/ReportMain/GenerateNewestReport/103750/pdf)

The meteorological report identifies the event as 18:58 EDT / 22:58 UTC. It also documents missing ASOS wind values during the accident interval and uncertain LLWAS timing. Nearby observations cannot be substituted for a known, constant along-runway wind. Maintenance records and the first detailed weather attachment were retained; the second attachment timed out at both 20- and 60-second limits. [Weather report, pages 3-6](https://data.ntsb.gov/Docket/Document/docBLOB?ID=15552928&FileExtension=pdf&FileName=WX_CEN21LA384_Specialists_Factual_v2-Rel.pdf)

### CEN23FA045 and WPR20FA051

CEN23's 1,027 data rows include eight year-0001 bootstrap records. The first non-bootstrap date/time is 2022-11-25 12:41:32.334. A CAPS-system flag is already set throughout the non-bootstrap portion examined, while the named CAPS-autopilot channel is blank. Status words, missing values and the abnormal-activation context remain essential gates. Do not infer a normal segment from a plausible date alone. [CEN23 docket](https://data.ntsb.gov/Docket?ProjectID=106361)

WPR20's attachment identifies one-second sampling but uses a "Time PST" header and negative missing-value sentinels. It provides electrical channels, oil pressure and fuel flow, not N1, attitude or brake inputs. A research-only cross-recorder inventory stopped because it assumed a "Time" header; no repository parser was modified to paper over this difference. Its schema was subsequently identified, and it remains outside the production normalization path. [WPR20 docket](https://data.ntsb.gov/Docket?ProjectID=100738)

## 5. Public normal-flight data and legitimate access

FlightData's shared directory lists 12 SF50 entries. The serial-0045 entry led to public flight 2754779. Direct HTTP requests returned empty 202 responses; ordinary isolated headless Chrome navigation succeeded. No authentication or access-control bypass was used. [Shared directory](https://www.flightdata.com/shared), [Acquired public G1 flight](https://www.flightdata.com/flight/2754779)

The retained hydrated page contains 49 time-series arrays with 1,013 points each, plus a four-point cruise-phase series. Most time intervals are six seconds; a few are 5, 7, 12 or 16 seconds. This is processed chart data, not proof of the original recording cadence or an appropriate dataset for fast response identification.

The chart labels identify useful engine, speed, altitude and attitude series. Exact raw-export provenance, configuration, loading, normal-operation interpretation and redistribution permission remain unresolved. Nearby public flights are discoverable, but no wholesale history download was performed.

The legacy Garmin guide closes an earlier capability gap: its section 8.11 documents once-per-second SD-card logging, separate from the CMC, with installation-dependent channels. It applies to the documented software/configuration, not universally to every aircraft. [Garmin 190-01979-01 Rev A, printed 628 / PDF 646](https://static.garmin.com/pumac/190-01979-01_a.pdf)

The [Cirrus publication portal](https://techpubs.cirrusaircraft.com/) resolves to a normal sign-in screen. Authorized account access remains untried. Do not label this a confirmed paywall for every needed publication, create an account without agreement, or ask an employee to bypass normal publication access.

## 6. What research and certification references can and cannot supply

The Cirrus-authored loads-certification paper describes CFD loads correlated with flight tests, including a matrix exceeding 3,000 aerodynamic solutions and a distributed mass model. It supports a methodology that matches test conditions, loading and relevant response variables. The accessed public text supplies process/correlation illustrations, not a reusable full SF50 coefficient and inertia database. The normal PDF-download attempt was unsuccessful; no protected archive was bypassed. [Kelbe et al., AIAA 2017-1629, author-posted text](https://www.researchgate.net/publication/312112833_Loads_Certification_of_the_Cirrus_Aircraft_SF50_Vision_Jet_R)

A promising aerodynamic-identification paper explicitly used X-Plane SF50 simulation data. Its methods may be useful, but its dataset cannot independently validate a real-aircraft model. NASA search results also included a different engine and broad aircraft-energy studies; a type-name match is not applicability. [Transformer-enhanced parameter-identification paper](https://www.researchgate.net/publication/404097749_A_Transformer-Enhanced_Hybrid_Physics-Informed_Neural_Network_for_Aircraft_Aerodynamic_Parameter_Identification), [NASA DGEN-engine study](https://ntrs.nasa.gov/api/citations/20160001354/downloads/20160001354.pdf)

The original 2017 FLYER flight report offers useful qualitative and approximate G1 operating context, including a warm-day climb/cruise observation. Its narrative does not supply a synchronized input-response dataset or all loading/conditions needed for a tight numerical gate. The later AOPA comparison concerns a different configuration context and remains observational, not a G1 calibration standard. [FLYER flight report](https://flyer.co.uk/feature/cirrus-aircraft-sf50-vision-jet/), [AOPA comparison](https://www.aopa.org/news-and-media/all-news/2024/october/pilot/tbm-910-versus-sf50-vision-jet-theres-gonna-be-a-showdown)

The FJ33-5A TCDS identifies a maximum high-pressure bleed extraction of 40 lb/min and directs installed configuration/thrust-setting details to instructions P/N 112471. The published rating conditions exclude aircraft bleed and accessory loads. None of this defines an SF50 installed thrust penalty as a percentage of N1 or bleed selection. [EASA IM.E.016 Issue 13, pages 12 and 19-20](https://www.easa.europa.eu/en/downloads/7771/en)

FAA NSP provides the qualification framework and points to current Part 60 requirements. A listed qualified simulator does not expose its underlying QTG, raw OEM test traces or licensing rights. Use the framework to design tests, not to imply that this project or its chosen tolerances are certified. [FAA National Simulator Program](https://www.faa.gov/about/initiatives/nsp)

OpenSky can supply trajectory/context data; its full historical access distinguishes eligible research users from private/commercial license routes. Position histories alone do not provide throttle, surface travel, brake pressure, CG or a reliable air-mass-relative response. The public docket GPX already illustrates both the utility and the limitations of position-only evidence. [OpenSky data access](https://opensky-network.org/data/)

International sources produced a Swiss incident report lead and a Brazilian event notification, not another acquired dynamics dataset. Both tried Swiss PDF variants returned 404 even though indexed text remains available. The BEA page is a notification of a Brazilian investigation, not a substitute for its final technical record. [Swiss report lead](https://www.sust.admin.ch/inhalte/AV-berichte/N474CG_SumB_e.pdf), [BEA notification](https://bea.aero/en/investigation-reports/notified-events/detail/accident-to-the-cirrus-sf50-registered-ps-dao-on-21-01-2024-at-angra-dos-reis-brazil/)

## 7. Executed offline analyzer and focused tests

The requested analyzer ran **after the source-acquisition/research pass**. It completed successfully under Node v26.8.2:

~~~sh
node scripts/analyze-sf50-public-evidence.mjs \
  --raw-root=planes/Cirrus_Vision_Jet/tests/public-evidence/raw \
  --out=/private/tmp/sf50-public-audit.jEzxjB/offline-analysis
~~~

It checked the original 47 pinned sources, parsed 37 tables / 3,552 rows, and normalized the 450-row CEN21 engineering-unit export to 360 unique timestamps with 90 identical duplicates. Its evidence gate correctly remained blocked. The 24 distance-source comparisons are not 24 aircraft simulations.

The focused Vitest run passed **42/42 cases in seven files**, with no skipped/pending cases:

| Test file | Passed |
| --- | ---: |
| sf50PublicEvidence.test.ts | 9 |
| sf50AfmData.test.ts | 3 |
| runwayMeasurement.test.ts | 5 |
| sf50AfmBenchmark.test.ts | 8 |
| evaluateSf50AfmMeasurement.test.ts | 6 |
| sf50LandingPilot.test.ts | 7 |
| sf50PilotProfiles.test.ts | 4 |

The supplemental extraction/inventory was research-only. It was not silently wired into the production analyzer, and the WPR header failure was not counted as a passing ingestion case. The network collector, full application, native engine regressions, full WASM suite and aircraft simulations were not run in this audit.

Tests validate software behavior and evidence guards. They do not establish physical accuracy, independent holdout success, pilot-technique correctness or certification equivalence.

## 8. Evidence-to-model execution order

| Order | Work | Completion gate |
| --- | --- | --- |
| 1 | Lock generation, AFM revision, engine/thrust schedule and coordinate definitions | One explicit target configuration; incompatible donor sources remain separate |
| 2 | Approve exact AFM rows and named metrics | Visual/source review, conditions and units; explicit ISA entries retained |
| 3 | Normalize new recorder/dashboard schemas | Exact headers, sentinels, clocks, units, status words and derived-vs-measured labels |
| 4 | Obtain or bound loading, bleed and pilot inputs | No inferred CG, pedal release, surface position or engine force from unrelated flags |
| 5 | Pre-register calibration and holdout flights/conditions | No same-flight or same-AFM source leakage disguised as independence |
| 6 | Calibrate steady propulsion and drag together with identifiability checks | Matched N1, TAS, fuel flow, atmosphere and weight; avoid fitting compensating errors |
| 7 | Calibrate climb and runway behavior | Match procedure/rotation/flare/brake inputs before changing aerodynamics or friction |
| 8 | Test handling and fast transients | Adequate-rate synchronized inputs/outputs; dashboard downsampling is not sufficient |
| 9 | Run held-out aircraft comparisons | Existing tolerances and evidence gates stay fixed; failures remain visible |

Uncertain loading or technique calls for a documented sensitivity envelope, not an arbitrary wide pass band. Track whether each parameter is measured, inferred, estimated or simply unidentifiable from available observations. Public data can support a useful model without supporting every aerodynamic derivative.

Do not ask owners to perform new stalls, high-load maneuvers, maximum braking, unusual configurations or improvised flight tests. The existing [owner request](sf50-owner-data-request.md) is for ordinary recorded flights and minimal authorized metadata.

## 9. Remaining public work before asking Cirrus employees

1. Review the newly retained AFM candidates and G1 pre-upset flight segments. This is work on already acquired public evidence, not an access problem.
2. Use normal authorized Cirrus publication access for applicable newer landing pages and revision/procedure history.
3. Determine whether the public-flight provider offers an original export and permissible numerical fixtures. Seek only missing metadata for an already shared flight, not a new maneuver.
4. Integrate the supplementary source manifest and schema-specific normalization into a reproducible offline pipeline, then run its own focused tests.
5. If still valuable after those steps, request specifically identified existing agency records through the normal public-record route. Review rights/redactions and possible proprietary exclusions rather than assuming all agency-held data is releasable. [NTSB FOIA route](https://www.ntsb.gov/about/foia/Pages/default.aspx)

Only then narrow an employee-facing request to gaps that materially change the model: approved installed engine maps/definitions, actual loading/inertia references, or releasable normal control-response data. Ask for public references or information authorized for release, never restricted files.

### Honest status wording

"We searched the major public source classes, retained the useful material and documented failed access paths. We now have a larger public evidence base and passing offline tooling tests. Qualification and ordinary-access follow-ups remain, so we have not yet exhausted public data and have not validated the SF50."

This is a stronger, more useful position than claiming exhaustive research while leaving newly discovered public data unexamined.
