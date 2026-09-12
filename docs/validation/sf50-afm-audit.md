# SF50 AFM source and benchmark audit

Status: benchmark v3 with the brake-gate fix passed 33 unit tests and completed
all 12 real-Wasm scenarios, with 84/84 initialization checks, but no performance
validation passes. Benchmark v4 condition-evidence changes are implemented
and passed 45 focused tests plus the two sea-level smoke scenarios. These
smoke scenarios completed with 14/14 initialization checks and no runway
condition blockers, but remain unsuitable for aircraft calibration.
No aircraft coefficients were changed by this audit.
This is a simulation engineering reference, not operational flight guidance.

## Archived source

- Local file: `planes/Cirrus_Vision_Jet/tests/SF50-POH.pdf`.
- Cirrus SF50 AFM P/N 31452-001, 624 PDF pages.
- SHA-256: `d83e904dbd6bc3656321c93d793166d4a5c6eddf81852b15767e5c336fc23949`.
- Latest listed revision: 4, November 20, 2018. Individual pages have their own revisions.
- Historical SF50-0005 and subsequent applicability does not imply coverage of later configurations.
- The full AFM was already downloaded. Its existence did not mean all relevant
  procedures had been extracted or that the benchmark matched them.

## Extracted evidence

| Subject | Printed page | PDF page | Finding |
| --- | --- | --- | --- |
| Idle warm-up | 4-21 | 347 | At least 120 seconds before takeoff; thermal readiness is additional |
| Normal takeoff | 4-22 | 348 | Brakes held while T/O power established; rotation 80-90 KIAS; pitch 5 degrees |
| Normal landing | 4-25 | 351 | Full flaps, VREF, thrust as required; after-landing braking as required |
| Landing considerations | 4-26 | 352 | Normal approach VREF+10; full flaps minimize distance |
| Performance basis | 5-6 | 364 | Flight-test data, good condition, average piloting |
| Airspeed correction | 5-14 | 372 | Full-flap 85 KIAS maps to 84 KCAS; half-flap 90 KIAS maps to 91 KCAS |
| 6000 lb takeoff | 5-24/25 | 382/383 | Dry level paved, calm, T/O, half flaps, gear down, bleed on |
| 5500 lb takeoff | 5-26/27 | 384/385 | Additional weight holdout under matching table conditions |
| VREF | 5-127 | 485 | Full-flap VREF 85 KIAS at 5550 lb |
| 5550 lb landing | 5-128/129 | 486/487 | Full flaps, VREF 85 KIAS, idle, dry level paved, calm |

Twelve selected ISA-column distance rows are encoded at sea level, 1000, 2000,
and 5000 feet for the two takeoff weights and one landing weight. Only the
6000 lb takeoff and 5550 lb landing sea-level cases are calibration cases.
The other ten cases are holdouts. Non-ISA cells have not been digitized.

## Benchmark corrections

- Name the native speed observation KCAS rather than KIAS. Apply piecewise-linear
  AFM conversions without extrapolating missing cells. Report estimated IAS;
  the chart's level-flight/MCT power condition remains a limitation.
- Use the AFM 5-degree takeoff pitch target, not 8 degrees.
- Warm the engine at idle with brakes held, then establish stable N1/thrust
  before releasing brakes. Do not hold the aircraft down artificially or reset
  away the prepared state. Fuel is frozen only during preparation to preserve
  the selected table weight and unfrozen before the measured run.
- Record fixed-runway projected distance from brake release or the landing
  threshold. Do not integrate curved-path speed magnitude.
- Record liftoff at first contact loss after a short confirmation interval,
  not at an arbitrary 6-foot CG height. Interpolate the 50-foot crossing.
- Preserve first touchdown across bounces. Require a sustained low-speed stop.
- Use native wheel geometry transformed by aircraft attitude rather than a
  fixed CG-to-wheel offset. The selected lowest-wheel datum remains an
  explicitly unconfirmed interpretation of the AFM's 50-foot reference.
- Gate landing braking on both main wheels being loaded. Full normalized
  braking remains a diagnostic assumption, not a procedure sourced from the AFM.
- Report initial-state checks, preparation, measurement-start state, events,
  sampled trajectory, pitch tracking, N1, forces, wheel loads and source hashes.
- Compare measured conditions rather than copying requested conditions into
  the result. Missing bleed, pressure-altitude datum, runway surface or slope
  evidence blocks validation even when distances match.
- Keep the 15% engineering distance tolerance unchanged. It is not an AFM
  uncertainty estimate.

## What remains unresolved

1. Digitize the applicable target-N1 tables, including altitude, temperature
   and bleed configuration. Stable full throttle alone does not prove correct
   T/O thrust. Model idle thrust, lapse and fuel flow need independent anchors.
2. Reconcile AFM weight/CG station definitions with the model coordinate datum,
   actual empty loading and tank/payload distributions. The current payload at
   empty CG is a scenario approximation, not representative loading.
3. Resolve table gear-down configuration versus the normal positive-climb gear
   retraction instruction. Do not silently choose whichever matches distance.
4. Establish the weight-specific rotation schedule, average-pilot flare and
   braking technique. The AFM does not provide an exact normalized brake command.
5. Confirm the AFM 50-foot reference point and native wheel location/compression
   semantics. Trace both CG and wheel heights meanwhile.
6. Add non-ISA, thrust, climb, cruise, stall and dynamic-response anchors.
   The archived AFM does not contain all aerodynamic derivatives or transient
   engine/control data needed for confident response validation.
7. Run the v4 unit tests and real-Wasm scenarios with the built upstream SDK.
   The successful v3 execution does not establish that v4 runs or that either
   version matches aircraft performance.

## Condition-evidence follow-up

The last executed baseline is
\`/private/tmp/sf50-afm-brake-fix.5msko6\`, generated September 12, 2026 at
04:27:00 UTC. All 12 scenarios completed but remained blocked. Takeoff total
distances exceeded the selected AFM rows by 47-55%; landing totals were 50-51%
short. Native WOW, rather than strut-force sign, now controls brake eligibility.

Benchmark v4 separates configured conditions from physical calibration:

- Five zero-time probes sample native terrain elevation along 8000 nominal
  runway feet. The largest absolute signed segment grade prevents opposite
  slopes from cancelling into a falsely level average.
- Runway pressure altitude comes from native \`atmosphere/pressure-altitude\`
  at a probe 0-2 feet AGL, within the existing five-foot numerical allowance.
  The report preserves the probe height and pressure value. It does not
  subtract an assumed screen height or use the former custom ISA inversion.
- Runway temperature is sampled with the runway pressure probe, rather than
  taken from the airborne landing initial condition.
- The benchmark explicitly configures a smooth, solid dry-paved baseline:
  static/rolling surface factors 1, bumpiness 0, and no additional finite
  surface-force cap beyond the native double maximum. Native readbacks must
  match. This is a project fixture definition, not a native material detector
  or proof that the aircraft tire coefficients are correct.
- Each measured step checks surface settings, terrain consistency and surveyed
  coverage. Missing readings or changes remain blockers.
- Reports include native per-wheel static/dynamic/rolling coefficients,
  model MaxN1 and generic bleed-loss factor. These are diagnostics, not new
  calibration targets.

Native source basis in the canonical JSBSim checkout:
\`FGAtmosphere\` binds pressure altitude; \`FGPropagate\` exposes terrain
elevation; \`FGDefaultGroundCallback\` represents constant geodetic terrain
elevation; and \`FGSurface\` exposes the solid, bumpiness and friction-factor
settings. Existing property access is sufficient: no new SDK/native API was
needed for these changes.

AFM page 5-21 (PDF 379) identifies FADEC inlet PT2/TT2 as the power-setting
inputs. The anti-ice-on N1 graph is page 5-23 (PDF 381); text extraction is
not sufficient to digitize its curves accurately. JSBSim's bleed factor can
represent arbitrary thrust losses, so a nonzero value is not evidence of the
SF50 bleed-on configuration. N1/bleed, CG/loading, pilot technique, friction
calibration and the AFM screen-height reference remain unresolved.

The v4 smoke report is at
`/private/tmp/sf50-v4-smoke.fI6CUU`, generated September 12, 2026 at
04:44:41 UTC. Only the two sea-level calibration cases were selected in memory;
the 12-case comparison was deliberately not repeated.

## Calibration prerequisites found by the smoke test

1. Native turbine zero-time state: landing N1 is 100% at time zero and becomes
   30% on the first integrated step, while thrust is already about 81 lb.
   `FGPropulsion::SetEngineRunning` establishes full-power inputs, and
   `FGTurbine::Trim` recalculates thrust using a local N2 without refreshing
   the member spool speeds. The native source now synchronizes member N1/N2
   during trim, with a zero-time regression added. Isolated native/WASM
   builds now confirm the SF50 idle indication fix. The added regression
   still needs a fixture-expectation correction and CTest registration;
   the installed application artifact is unchanged. Do not mask it by
   advancing the aircraft or forcing spool properties in the application.
   This reporting defect is not evidence that it caused the distance errors.
2. Loading: the current takeoff CG is model X=159.5 in; that is not directly
   comparable to AFM fuselage stations. The certified datum is 89 in ahead
   of the forward cabin bulkhead. A physical model anchor and an as-delivered
   empty-weight record are required to establish the conversion and loading.
   Synthetic loading must remain labelled as such.
3. Pilot tracking: near takeoff liftoff the trace reports about 0.57 degrees
   actual pitch against the 5-degree command, at 118.7 KCAS. At the 50-foot
   endpoint pitch is only 2.44 degrees. Separate controller tracking from
   CG/control-authority effects before tuning lift, drag or friction.
   V5 replaces proportional-only pitch control with a bounded pitch-rate
   request and a rate PI loop with anti-windup. The executed v5 smoke
   reaches 5.20 degrees at the 50-foot endpoint, but first-airborne pitch
   is 3.51 degrees and still fails the project liftoff gate. Tracking
   gates block calibration independently of runway-distance errors.
4. Engine matching: the model reports maximum N1=100 and bleed loss=0.04.
   Neither establishes the AFM inlet-condition-dependent target or installed
   thrust. Do not fit thrust from N1 indication alone.

Selected AFM loading arms and the exact 5500/5550/6000 lb CG-limit rows are
now encoded with moment-accounting and explicit-datum helpers. Reports also
include explicitly synthetic loading candidates with component moments and
empty-CG sensitivity. Candidates do not replace the native scenario payload
overlay during the isolated pitch experiment. No real empty-weight record,
model bulkhead anchor or N1 graph digitization has been invented. See
[the evidence and Cirrus questions](sf50-cirrus-questions.md).

Source evidence: [Cirrus AFM, section 6](https://flightsimcoach.com/wp-content/uploads/2020/12/SF50-POH.pdf#page=530)
and [EASA type-certificate datum, page 9](https://www.easa.europa.eu/en/downloads/24242/en).
The full loading validator must also address seat configuration, baggage,
fluid and phase-specific weight limits; the moment helper does not certify
an operational loading.

## Calibration order after procedure validation

First fix any remaining measurement/setup failures. Then constrain mass/CG and
engine thrust/idle/lapse from independent evidence. Next tune lift/flap effects
and drag against multiple steady-state anchors; only then assess ground
friction/braking and handling derivatives. Retain weight/altitude cases as
holdouts and inspect event traces, not just final distances. Do not compensate
for a faulty controller or unknown braking procedure by changing aircraft
physics. Generic lifetime/diagnostic fixes belong in jsbsim-wasm, native bugs
in JSBSim, and these SF50 fixtures/procedures in 0sfs.

## September 12, 2026: executed v5 prerequisite validation

Report generated at 14:46:28.825 UTC, using Node v22.22.3 on darwin/arm64
at 1/120 second timestep. Only the 6000 lb takeoff and 5550 lb landing
sea-level cases were selected; the ten holdouts were not run.

- Simulator: 65 tests passed in 10 files.
- Existing native CTest entries: CheckTrim, TestEngineIndexedProps and
  TestTurbine passed against a newly built Python binding.
- New TestTurbineTrimSpool regression: failed one partial-throttle assertion.
  This is a fixture-expectation defect: the F16 FCS maps command 0.35 to
  position 0.70, so N1=82 is correct rather than the test's expected 61.
  Idle/full-power checks and first-step idle continuity did not fail.
  The test also needs registration in CTest's explicit list. Neither test
  correction was made during this validation; user approval was requested.
- Both real-WASM scenarios completed with 14/14 initialization checks,
  no bounces, and no runway-condition-monitor blockers.
- Both scenarios remain blocked for aircraft calibration.

| Sea-level metric | AFM target (ft) | V5 measured (ft) | Error |
| --- | ---: | ---: | ---: |
| Takeoff ground roll, 6000 lb | 2036 | 2103.306 | +3.306% |
| Takeoff through 50 ft, 6000 lb | 3192 | 3305.639 | +3.560% |
| Landing ground roll, 5550 lb | 1628 | 480.302 | -70.497% |
| Landing from 50 ft, 5550 lb | 3011 | 1646.205 | -45.327% |

The rebuilt WASM reports landing N1=30% at t=0 and t=1/120 second.
Thrust is 81.0018 and 81.0029 lb respectively, without spool overrides or a
hidden integrated initialization step. This confirms the reported SF50
zero-time indication defect is resolved in this isolated artifact, not
that installed engine performance has been calibrated.

Takeoff rotation was commanded at t=147.3667 s. First sampled airborne
pitch was 3.5131 degrees at t=150.2833 s, and sampled 50-foot endpoint pitch
was 5.2015 degrees. After the 5-second settling allowance, RMS error was
0.1574 degrees and maximum error 0.2042 degrees. No observed post-rotation
sample met the 0.98 near-elevator-limit threshold. The steady tracking
problem is greatly improved, but the liftoff error of 1.4869 degrees still
exceeds the unchanged project 1-degree gate. That gate's exact applicability
to the AFM procedure remains a question for Cirrus, not a certified rule.

Do not relax the gate or change aircraft aerodynamics merely to turn the
report green. Available elevator margin suggests examining controller
transient/rotation technique before assuming insufficient control authority.
Landing's sampled trace reaches elevator -1 and its ground roll remains
far too short; neither flare behavior nor tire friction is validated.

The native loading overlay and aircraft coefficients were unchanged.
Takeoff distance moved much closer to the table while the pilot changed,
but the v4/v5 comparison also uses a rebuilt native artifact and a different
Node version (v4: 26.8.2; v5: 22.22.3). It is not a strict single-variable
A/B attribution. Distance agreement alone does not remove loading, datum,
N1/bleed, gear timing, airspeed, screen-point or pilot-technique blockers.

### Build provenance and adoption boundary

The canonical native source failed the direct WASM build in
`simgear/misc/strutils.cxx`: it selected GNU strerror_r semantics under
Emscripten even though the function returns an int. The SDK already carries
the relevant fix in `patches/jsbsim-emscripten-compat.patch`. Its strutils
section was applied only to a temporary native-source snapshot, rather than
duplicating a new repository workaround or changing branches.

Native Python was built directly from the canonical fork. WASM was built
from that snapshot with the current turbine change and the existing
portability fix. Existing SDK JavaScript was copied alongside the new
binary into an isolated SDK root. No installed application package or
repository distribution was replaced, and no upstream PR was opened.

Artifacts and raw report are under
`/private/tmp/sf50-v5-validation.30axFG`. The raw report and its full
trajectory are temporary; the durable
[machine-readable summary](sf50-v5-validation-summary.json) preserves results,
assumptions, failures and SHA-256 identities. These source-file hashes do not
substitute for a full repository revision manifest.

Next: correct/register the native regression, address the remaining
rotation transient without fitting distance, then run a separately
versioned loading/datum experiment. Engine matching, landing technique and
friction still precede aerodynamic calibration.


### Native regression follow-up, September 12, 2026

The F16 regression now checks its command-to-position mapping separately
and derives expected spool speeds from effective dry throttle position.
The test is registered with CTest.

After reconfiguring the existing native build, all four focused CTest
entries passed: CheckTrim, TestEngineIndexedProps, TestTurbine and
TestTurbineTrimSpool (10.70 seconds total). The earlier partial-throttle
failure was a test expectation error, now corrected. This closes the
native regression/registration issue, not aircraft calibration.

Only tests and CTest registration changed. The existing native binding was
reused; the turbine, aircraft model, isolated WASM artifact and installed
application SDK were unchanged. Takeoff liftoff tracking and the other
loading, engine and landing-calibration blockers remain open.

The rerun log is at
`/private/tmp/sf50-v5-validation.30axFG/native-regression-rerun.log`.


## 2026-09-12 update: development pilot v6

See [development pilot v6 calibration](sf50-pilot-calibration-v6.md) and its [18-run evidence summary](sf50-pilot-calibration-v6.json). This is the latest pilot-calibration status; earlier v5 results remain historical evidence.

On the same rebuilt WASM and unchanged aircraft/loading, the selected prototype reached 4.19 deg pitch at liftoff and 5.05 deg at 50 ft, passing the unchanged takeoff tracking gates. Landing touchdown sink improved from about 478 to 191 ft/min. The selected landing prototype measured 1,491 ft ground roll and 2,678 ft total against 1,628 and 3,011 ft. Its derived airborne segment also fits the existing 15% tolerance.

The application now contains named per-phase pilot profiles, a landing path/flare and provisional 0.16 g braking controller, separate airborne-distance and touchdown-quality checks, and a calibration-only comparison runner. Measurements above come from controlled in-memory prototypes, not a post-extraction test run. Added unit tests and the extracted runner remain unexecuted. The 0.16 g demand is a pilot-input fit, not independent tire-friction validation. No holdouts or aircraft coefficients were used for this tuning.

AFM applicability notes: the pinned landing values are unfactored, not values to divide by 1.67; emergency maximum-braking guidance is not a normal-landing procedure; approximately 38% N1 breakaway thrust at 6,000 lb is a future conditional cross-check, not a completed friction calibration. Details and page references are in the v6 note. Unknown N1/bleed, CG/loading/datum, pilot technique, friction identification, and installed SDK adoption still prevent end-to-end completion.


## 2026-09-12 public-source acquisition update

The [public-data acquisition roadmap](sf50-public-data-acquisition.md) records 47 archived source artifacts, 37 G1 CSV tables/3,552 rows, two public recorder exports, and a visually reviewed AMM station drawing. The raw cache is retained locally and ignored by Git; sources are hash-pinned.

A 24-metric source comparison found unresolved differences between our Rev 4 AFM and the differently revised SF50-TOLD data. Sea-level 5,550 lb landing total is 3,011 ft in our pinned source versus 2,532 ft from the CSV interpolation. Do not substitute tables, average the difference, or retune the aircraft until applicability/procedure/transcription is reconciled.

CEN21LA384 contains 450 engineering-unit rows but only 360 unique timestamps. Its N1 transient is a candidate, not an approved normal-flight reference. The datum gap is narrowed by the public station drawing, but mesh/physics anchoring and actual CG/loading remain open. Added ingestion/eligibility tests and extracted acquisition scripts have not run; no aircraft runs or coefficient changes were made in this step.


## Expanded public-data audit and executed tests (2026-09-12)

[The dated audit](sf50-public-data-audit-2026-09-12.md) supersedes earlier acquisition-only/unexecuted-tool status. The original offline evidence analyzer succeeded, and 42 focused tests passed in seven files. No aircraft simulation ran.

At 6,000 lb / sea level, the primary AFM and TOLD CSV share the 10 C / 20 C takeoff endpoints, but their linear averages do not equal the explicit ISA column. Use the published ISA entries; do not diagnose this as an aerodynamic error. Landing values disagree even at exact temperature grid points and remain quarantined.

The pinned primary AFM now has 640 cruise and 180 integrated-climb rows retained as page-cited candidates. Automatic extraction is not a complete visual/conditions audit. Published fuel gallons and pounds remain separate fields. New G1 recorder and public-dashboard evidence must pass loading, timebase, input, configuration and rights gates before comparison; neither is an automatic aircraft-validation oracle.


## Applied facts and expanded processing (2026-09-12)

The development package now replaces approximate rated thrust (1800 -> 1846 lbf), usable fuel capacity (1990 -> 2001 lb nominal) and mean aerodynamic chord (5.06 ft -> 62.2 in / 12). The first two come from primary AFM PDF 23 / printed 1-7; MAC comes from the public AMM station figure, not a guessed datum alignment. Installed engine schedules, aggregate tank geometry and loading remain provisional.

[The generation/data-processing note](sf50-variant-models.md) explains the 820 expanded AFM candidates, same-source condition holdout, recorder screening and generation boundaries. No new flight simulation or test-suite result is claimed. Earlier runway results are not evidence that these changed packages are calibrated.
