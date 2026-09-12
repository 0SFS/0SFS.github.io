# SF50 evidence gaps and questions for Cirrus

Updated: September 12, 2026.

Purpose: improve an experimental SF50 simulator and distinguish public facts,
project assumptions and missing evidence. This is not operational flight,
loading or maintenance guidance. Questions have not been sent to anyone.

## What the online search established

| Evidence | Finding | What it does not establish |
| --- | --- | --- |
| [Lone Mountain PH-WKM specification, page 2](https://lonemountainaircraft.com/wp-content/uploads/2024/02/PH-WKM-Spec-Sheet-5-9-24-1.pdf#page=2) | Broker lists 3,588 lb basic empty weight for 2018 G1 S/N 0071. | No empty CG, moment, weighing date or equipment/seat inclusion record. Not a transferable aircraft W&B record. |
| [Public archive of factory maintenance entry, page 7](https://tkaviation.net/wp-content/uploads/2022/07/n313bn-airframe-logs-final.pdf#page=7) | Cirrus Factory Service Center entry dated May 5, 2017 for S/N 0009, then N124MW, says delivered empty weight includes front seats but excludes removable seats 3-7, whose weights and moments must be added. | No usable numerical empty-CG record or individual seat masses recovered from the available extraction. Applicability to other aircraft must be checked. |
| [Archived Cirrus AFM, section 6](https://flightsimcoach.com/wp-content/uploads/2020/12/SF50-POH.pdf#page=530) | Selected loading stations and the exact 5500/5550/6000 lb CG limits are encoded in the benchmark data. | Empty-aircraft record, model coordinate origin, actual certification-test loading and complete configuration approval. |
| [EASA.IM.A.615 issue 6, June 1, 2026, page 9](https://www.easa.europa.eu/en/downloads/24242/en) | Aircraft datum is 89 inches ahead of the forward cabin bulkhead. | The corresponding physical point in our model's structural coordinates. Model X is not automatically AFM FS. |

The AFM is already archived and SHA-256 pinned by the benchmark. New public
sources above are saved as citations, page references and extracted facts;
they are not yet additional hash-pinned repository artifacts. The maintenance
PDF was downloaded to a temporary file for text extraction. A matching empty
weight/CG record was not found in this search; that does not prove one is
unavailable. Search-index-only listings and other flight simulators' manuals
are not accepted as aircraft evidence.

The broker's advertised runway performance is not substituted for the pinned
AFM table: weight, conditions and applicability are not matched.

## Explicit best guesses for the next loading experiment

These are executable proposed fixtures in
`src/flight/validation/sf50SyntheticLoading.ts` and appear in reports as
`proposedSyntheticLoading`. They are **not applied to the native aircraft**.
The current payload overlay remains unchanged so the pitch-controller
experiment does not simultaneously alter CG and inertia.

| Parameter | Assumption | Reason and limitation |
| --- | --- | --- |
| Empty mass | 3550 lb | Retain the existing model baseline while isolating changes. The public 3588 lb listing is context, not a weighing record for this model. |
| Empty longitudinal CG | FS 195 in | An explicit project estimate; not measured, and not obtained by fitting distance. |
| Fuel | 1500 lb at AFM nominal FS 203 in | Same fuel mass as current benchmark fixtures; tank distribution and fuel-CG variation need evidence. |
| Front occupants | 170 lb each at FS 132.9 in | Scenario choices, not claims about flight-test occupants. Front seat hardware is assumed included in empty mass. |
| Removable seat hardware | 30 lb per installed seat at its AFM station | Placeholder pending seat-specific weights. Count separately from occupants. |
| 6000 lb case | Two 170 lb middle outboard occupants, one 165 lb middle inboard occupant at the aft station, three removable seats and 15 lb forward baggage | Explicit 950 lb payload, not automatic ballast at empty CG. |
| 5550 lb case | One 130 lb middle outboard occupant and one removable seat, in addition to the front occupants | Explicit 500 lb payload. |
| 5500 lb case | One 80 lb middle outboard occupant and one removable seat, in addition to the front occupants | Explicit 450 lb payload. |

The three independent fixtures do not describe a continuous mission.
Moment accounting uses the AFM stations, but guessed component masses and
empty CG remain guesses. Reports include an illustrative empty-CG sweep of
193/195/197 in; this is not a statistical confidence interval. Longitudinal
envelope arithmetic does not approve lateral/vertical CG, individual seat
limits, fluids, baggage, inertia or an operational configuration.

Do not populate `asDeliveredEmptyWeightLb` or `asDeliveredEmptyCgFsIn`
with these estimates. Do not infer the physical model bulkhead from a desired
loaded CG. If an assumed datum is later needed for an exploratory run, keep
it separately typed and marked synthetic rather than presenting it as the
documented physical anchor.

## Questions to ask Cirrus employees

Request shareable or deidentified information only. For every answer, record
aircraft generation/serial applicability, AFM revision, configuration,
units, date, source and permission to publish. No personal owner information
or confidential engineering material is needed.

| Priority | Question and preferred evidence | What it unblocks |
| --- | --- | --- |
| 1 | Can you share one deidentified G1 delivered/basic-empty W&B record with mass in lb, CG in FS inches, moment, weighing date and included equipment/fluids/seats? Are removable seats excluded consistently, and what are their individual masses and allowed positions? | Replaces guessed empty CG and seat accounting without double counting. |
| 1 | Can you identify the forward cabin bulkhead and provide a shareable structural station reference for wing aerodynamic reference, landing-gear contacts and engine thrust line? If available, include MAC/LEMAC and coordinate conventions. | Establishes a physical native-model-to-FS mapping rather than a fitted offset. |
| 1 | For the historical AFM distance tables, what CG and loading were used, and does the published result represent a limiting CG or a particular test configuration? | Determines whether a weight-matched runway test is actually comparable. |
| 1 | At the relevant weights and CGs, what rotation-speed schedule and pitch-rate/trim technique achieve the published 5-degree takeoff attitude? Is 5 degrees expected at liftoff or afterward? Can you share elevator/trim travel, sign and a representative pitch/elevator/time trace? | Separates benchmark pilot error from control authority and aerodynamic pitching moment. |
| 1 | Can you supply tabulated takeoff target N1 versus PT2/TT2 for anti-ice OFF/ON, with units and the applicable FADEC/engine standard? Which bleed configuration corresponds to the performance tables? | Replaces unread chart curves and prevents treating 100% normalized N1 as the AFM target. |
| 2 | What installed thrust, fuel flow and idle/spool response data may be shared versus altitude, Mach, inlet conditions and bleed/anti-ice configuration? How is displayed N1 normalized? | Constrains engine performance separately from rated thrust and indication scaling. |
| 2 | For the takeoff-distance chart, when are gear and flaps changed relative to liftoff, positive climb and the 50-foot endpoint? How should its gear-down configuration be reconciled with the normal procedure? | Removes a configuration/timing ambiguity in the benchmark. |
| 2 | What aircraft point defines the 50-foot height? For landing, what approach slope, thrust-reduction point, flare height/rate and touchdown speed were used? Are the table speeds indicated or calibrated at the relevant power setting? | Validates start/end geometry, airspeed conversion and airborne landing distance. |
| 2 | What braking technique, brake pressure/deceleration history, anti-skid assumptions, tire pressure and runway surface condition apply to landing results? What defines the stop and ground-roll endpoint? | Avoids fitting tire friction to compensate for an arbitrary full-brake command. |
| 2 | Is there shareable mass/inertia information, or fuel CG versus quantity, for a representative loading? What uncertainty bounds are appropriate? | Constrains dynamic response and prevents empty-CG placement from hiding loading effects. |
| 3 | Can representative deidentified logs be shared with synchronized time, IAS/CAS, pitch/rates, altitude, N1, control/trim positions, configuration, weight/CG, weather and runway survey? What are sensor rates, filtering and uncertainty? | Enables response validation rather than distance-only curve fitting. |
| 3 | May the supplied extracts or derived tables be redistributed in an open-source simulator, with what attribution and limitations? | Makes the evidence reproducible and legally shareable. |

## Fixes and methodology update

The native change belongs in `Felipegalind0/jsbsim`:
`FGTurbine::Trim` now assigns member N1 and N2 from the same operating
point used to calculate steady thrust. Previously a local N2 shadowed the
observable member and N1 was left stale. A native zero-time regression was
added using the standard F16 turbine fixture. Thrust equations and integrated
spool dynamics are unchanged. Isolated native/WASM builds have now run:
65 simulator tests and three existing native CTest entries passed, and the
SF50 landing trace confirms N1=30% at zero time and the first step. The F16
throttle expectation and CTest registration have since been corrected; all
four focused native CTest entries now pass. The installed SDK is unchanged.

The pilot belongs in `0sfs`, not in JSBSim. Benchmark v5 requests at most
3 deg/s and uses rate PI control with bounded integral and anti-windup.
It does not integrate elevator bias before rotation and resets at landing
touchdown. These are project controller choices, not Cirrus instructions.
The rate cap bounds the requested rate, not the aircraft's physical response.
The controller does not write attitude, spool state or aircraft coefficients.

New takeoff gates examine the first sampled airborne attitude, the sampled
50-foot endpoint and tracking after a 5-second settling allowance. The
project tolerance is 1 degree. Reports retain rate demand/error, integral,
elevator-limit exposure, and RMS/maximum settled pitch error separately from
runway-distance error. Synthetic-plant regressions exercise control bias and
anti-windup; they do not establish SF50 aerodynamic fidelity. The executed
smoke reaches 3.513 degrees at first sampled airborne state and 5.202 degrees
at the 50-foot endpoint. Settled maximum error is 0.204 degrees, but the
project liftoff gate still fails. Do not fit aerodynamics to conceal that
transient or relax the gate just because takeoff distance is now close.

Execution order, with the isolated build and first smoke now completed:

1. Native regression complete: effective post-FCS dry throttle is used for
   the F16 expectations, and all four focused CTest entries pass. The isolated
   build reused
   the SDK's existing strerror compatibility patch in a temporary native
   snapshot; the native Python binding used the canonical source directly.
   Recorded artifact/source-file hashes are in the durable audit summary.
   No installed package changed and full revision provenance is still needed.
2. Preserve the executed 65-test and two-case baseline with existing
   loading. Landing idle N1 is now 30% at zero time and the first step.
   Repeat the same focused checks after the next controlled change; keep
   runtime and native artifact fixed for a strict controller A/B comparison.
3. Require takeoff pitch tracking before interpreting distance residuals.
   If tracking fails with elevator near its limit, investigate CG, trim,
   elevator travel/sign and pitching moment. If authority remains available,
   investigate the control loop. Do not tune lift/drag to conceal either.
4. Apply an explicitly declared loading/datum experiment as a separate
   versioned change. Preserve current and synthetic manifests and use
   sensitivity sweeps instead of claiming an estimated CG is known.
5. Match inlet-condition N1/bleed and installed thrust, then landing technique
   and friction. Freeze assumptions before aerodynamic fitting. Keep the
   ten altitude/weight holdouts out of coefficient selection.

V5 is now the latest executed two-case result: takeoff total distance
3305.639 ft versus 3192 ft, landing total distance 1646.205 ft versus 3011 ft.
Both remain blocked. V4 and v5 used different native artifacts and Node
versions, so the comparison is not a strict single-variable A/B attribution.
The stale zero-time N1 indication does not by itself explain the old distance
errors. No performance-validation pass, upstream PR readiness or completed
calibration is claimed. See the [executed audit](sf50-afm-audit.md) and
[durable result summary](sf50-v5-validation-summary.json).


## 2026-09-12 update: development pilot v6

The [v6 calibration note](sf50-pilot-calibration-v6.md) identifies more specific questions for the applicable P/N 31452-001 configuration. These are open questions, not inferred manufacturer instructions.

- For the full-flap, unfactored normal-landing table at 5,550 lb and sea level, what approach speed/flight-path tolerances, flare initiation reference and height, touchdown pitch/sink/speed, and post-touchdown pitch technique were used?
- Is a flare beginning around 30 ft lowest-wheel clearance consistent with the table's test technique? What physical tail-clearance or attitude limit applies near the provisional 8 deg pitch cap? Our 3.5 ft/s touchdown quality gate is a software criterion, not a known Cirrus limit.
- What brake application delay, pedal-force schedule, deceleration history, anti-skid assumptions, flap/airbrake configuration, and runway surface condition apply to the normal landing distance? Our 0.16 g rollout demand is fitted and must not be mistaken for that procedure.
- Can Cirrus provide time histories or segment timing sufficient to separate flare/airborne distance from rollout? Matching only total distance allows compensating errors.
- AFM PDF page 615, printed 10-5, gives approximately 38% N1 breakaway thrust at 6,000 lb. What runway slope/surface, tire pressure, wind, bleed configuration, engine conditions, and tolerance underlie this value? Is a corresponding installed thrust value available?
- Please confirm the applicable AFM revision and aircraft generation before providing takeoff pitch/rotation values; the pinned 31452-001 procedure must not be mixed with 31452-002 values.

The source PDF and exact unfactored/factored page distinctions are documented in the v6 note. Do not substitute emergency/rejected-takeoff maximum-braking instructions for normal-landing table technique.


## 2026-09-12 public-source acquisition update

Before approaching Cirrus employees, use the [acquisition roadmap](sf50-public-data-acquisition.md) and [owner-data request draft](sf50-owner-data-request.md). No contacts or purchases have been made. Public options are not yet exhausted.

- Public station definitions now exist: AMM Figure 6-00-2 gives wing MAC 62.2 inches/LEMAC FS 177.2, distinct from the tail's 44.1-inch MAC. The remaining question is reviewed model anchoring and aircraft-specific loading/inertia, not a generic request for any datum information.
- Reconcile the TCDS's forward cabin bulkhead reference with the separate FS 93 forward pressure-bulkhead reference in the NTSB report; do not assume the structures are identical.
- Resolve the differently revised TOLD versus pinned-AFM landing total discrepancy through exact pages/procedures and normal publication/maintainer routes first. It is not yet a justified request for proprietary aerodynamic data.
- Public CEN21LA384 and CEN23FA045 recordings are acquired. Request only missing segment/configuration/latency information after exhausting the related public attachments; do not ask for a dataset that is already public.
- Normal owner logging has a documented avenue, but legacy G1 applicability and owner permission must be established. Use the narrow intake draft rather than asking friends to provide unrestricted customer or engineering records.


## Public-work update before any employee request (2026-09-12)

Do not send this question list yet. [The expanded public audit](sf50-public-data-audit-2026-09-12.md) found additional G1 evidence and documented remaining ordinary access/qualification work. No employee, owner or provider was contacted.

Publicly answered or materially narrowed:
- Legacy Perspective Touch logging is documented in Garmin 190-01979-01 Rev A, section 8.11, printed 628 / PDF 646; installation-specific channels still apply.
- A public serial-0045 flight dashboard is accessible without sign-in and was retained, but its roughly six-second charts are not an original one-second log.
- ERA22LA404 supplies G1 engine/attitude/air-data records and a public Cirrus estimate: 4,981 lb, 22 C, 2,000 ft, AFM climb 1,971 ft/min. That estimate is not a measured normal climb.
- CEN21LA384 identifies serial 0202 / accident weight 5,756 lb, and its weather record has accident-time wind/timebase limitations. Do not treat it as a clean G1 takeoff oracle.
- The sea-level takeoff table discrepancy comes from losing the explicit ISA column. The landing discrepancy remains unresolved.

Remaining precise questions, only after the public-data follow-ups:
- Which approved primary landing pages/procedure/revision explain the Rev 4 versus Rev A1 transcription difference? Try normal technical-publication access first.
- What does each requested-N1/percent-thrust channel mean by engine phase? The G1 record can show requested N1 near 47% while measured idle N1 is near 24%; do not assume one is a direct target for the other.
- Is there a publicly available or approved releasable installed-engine reference corresponding to Williams P/N 112471 and the exact engine/thrust-schedule configuration? A 40 lb/min bleed limit is not an installed thrust-loss map.
- Can actual empty-weight/CG, inertia, datum/anchor, control-surface or braking references be shared in a form approved for this project, if normal publications and authorized owner metadata do not answer them?

Ask for references or explicitly releasable information, not restricted engineering documents. Public evidence has not yet been fully exhausted or qualified.


## Generation-specific follow-up

The implementation now separates G1, original G2 and G3 selections and keeps G2+ table evidence separate. Public G3 announcements/specifications are archived; they do not establish an installed-thrust schedule or a matched AFM test matrix.

Before any employee request, use normal publication channels to establish which AFM revision and updated-thrust supplement apply to the intended G2/G3 configuration. If a question remains, ask for an approved public/releasable applicability reference, not an assumed blanket thrust increase or restricted engine map. G3 seating/avionics changes are not evidence of altered aerodynamic derivatives.
