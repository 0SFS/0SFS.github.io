# SF50 development pilot calibration v6

Date: 2026-09-12

## Status and scope

The takeoff rotation and landing pilot changes are implemented in the application benchmark, not in JSBSim or the WASM SDK. The supporting measurements are 18 controlled, in-memory prototype runs made before extracting the selected behavior into the application modules. The extracted modules, added unit cases, and named-profile runner have not yet been executed. This is not a completed aircraft calibration or a production SDK adoption.

All 18 runs completed, with 126/126 initialization checks passing and no recorded bounces. Only the two sea-level calibration cases were used: takeoff at 6,000 lb and landing at 5,550 lb. The ten holdouts were not used.

The v5 baseline was reproduced on the same Node v22.22.3, darwin arm64, rebuilt WASM, XML, synthetic loading, and 1/120-second integration step as the candidates. No aerodynamic coefficients, engine tables, landing-gear geometry, or tire-friction coefficients were changed during this comparison.

## Selected response and distances

Distance comparisons retain the existing 15% relative tolerance. That is a project comparison tolerance, not an AFM accuracy statement.

| Measurement | v5 baseline | Selected v6 prototype | Reference or gate |
| --- | ---: | ---: | ---: |
| Takeoff pitch at first sampled airborne state | 3.51 deg | 4.19 deg | 5 deg command, within 1 deg |
| Takeoff pitch at 50 ft | 5.20 deg | 5.05 deg | 5 deg command, within 1 deg |
| Takeoff ground roll | 2,103 ft | 1,941 ft | 2,036 ft |
| Takeoff total distance | 3,306 ft | 3,244 ft | 3,192 ft |
| Takeoff derived airborne distance | 1,202 ft | 1,303 ft | 1,156 ft |
| Landing touchdown sink | 478 ft/min | 191 ft/min | Project quality gate: at most 210 ft/min |
| Landing ground roll | 480 ft | 1,491 ft | 1,628 ft |
| Landing total distance | 1,646 ft | 2,678 ft | 3,011 ft |
| Landing derived airborne distance | 1,166 ft | 1,187 ft | 1,383 ft |

The selected takeoff prototype passed every unchanged pitch-tracking gate. After the five-second settling allowance, RMS error was 0.067 deg and maximum error was 0.074 deg. Elevator magnitude was at least 0.98 during 5.31% of the post-rotation samples.

The selected landing prototype touched down at 68.24 KCAS and 7.43 deg pitch, with 3.18 ft/s sink. Sampled airborne flight-path error was 0.543 deg RMS and 1.212 deg maximum. No sampled airborne elevator-near-limit exposure was recorded. These are simulation diagnostics, not flight-test measurements or confirmed normal landing technique.

Selected takeoff distance errors are -4.66% ground, +1.64% total, and +12.75% airborne. Selected landing errors are -8.41% ground, -11.04% total, and -14.15% airborne. All fit the existing distance tolerance, but both cases remain blocked by unresolved aircraft conditions. Fitting a calibration case does not independently validate the aircraft.

## Pilot implementation

### Takeoff

Keep the AFM's 5 deg pitch command and the existing rotation speed. Use a pitch-to-rate gain of 2.4 per second, a 4 deg/s commanded-rate limit, rate proportional gain 0.25, and rate integral gain 0.24. Keep the existing integral bound and anti-windup.

Selection was based on satisfying the unchanged tracking gates, not on finding the closest takeoff distance. A less aggressive candidate still missed the first-airborne gate; the gate was not widened to accept it.

### Landing approach and flare

Replace the constant-pitch approach with feedback on flight-path angle. Command -3 deg on approach. Below a provisional 30 ft lowest-wheel clearance, reduce the descent-speed target with the square root of normalized clearance, with a 2.5 ft/s minimum descent target. Convert that target to flight-path angle and use a 2.4 pitch correction gain, bounded to -3 through 8 deg pitch.

Use separate landing pitch-controller gains: pitch-to-rate 1.8 per second, commanded-rate limit 3 deg/s, rate proportional 0.25, and rate integral 0.18. Reset pitch-controller state on touchdown and command zero pitch for rollout, retaining the previous rollout convention pending verified normal-landing guidance.

These are development pilot assumptions. The 30 ft flare trigger, 8 deg cap, 2.5 ft/s target, and 3.5 ft/s touchdown quality gate are not manufacturer instructions or structural limits. Tail clearance and touchdown technique still need independent evidence.

### Landing braking

Require native weight-on-wheels on both main wheels. Wait 0.35 seconds of continuous main-wheel contact, then track a provisional 0.16 g deceleration demand. Filter measured deceleration with a 0.15-second time constant and integrate brake demand with gain 0.8; constrain demand to 0 through 1. Loss of contact clears the contact timer and demand. Hold the last demand below 1 ft/s to avoid low-speed chatter.

The 0.16 g demand is a fitted pilot input, not a measured Cirrus procedure or an identified tire coefficient. Closed-loop braking can compensate for an incorrect friction model. Therefore, preserve both the old instantaneous-full-brake baseline and a new open-loop full-brake profile. Do not use the closed-loop fit alone to justify friction calibration.

A brake-only change improved stopping distance but left the baseline's approximately 478 ft/min touchdown sink unchanged. A gentler braking trial brought total distance closer while worsening ground-roll agreement. Those results are why approach, touchdown, and rollout are evaluated separately.

## Benchmark and regression changes

- Named profiles preserve `baseline-v5`, select `development-v6`, and expose `landing-full-brake`, `landing-gentle` (0.14 g), and `landing-firm` (0.22 g).
- The pitch controller accepts per-profile gains without making the takeoff tracking tolerances tunable.
- Landing evidence records touchdown sink, pitch, speed, flight-path tracking, and elevator-limit exposure. Incomplete touchdowns, excessive sink, and bounces block the project procedure-quality gate.
- Evaluate airborne distance as total minus ground roll for both simulation and reference. Check it separately so errors in ground and airborne segments cannot hide behind an acceptable total.
- Explicit case selection distinguishes `all`, `calibration`, and `holdout`. The calibration runner forces the two calibration cases.
- The runner requires an explicit SDK path, records WASM and SDK-entry hashes, compares scenario hashes between profiles, and checks the landing zero-time/first-step N1 prerequisite.
- Added unit cases cover landing controls and gates, profile selection, invalid inputs, and compensating distance errors. They have not been run after extraction.

## AFM evidence and applicability

Source: [SF50 AFM P/N 31452-001, Revision 4, reproduced PDF](https://flightsimcoach.com/wp-content/uploads/2020/12/SF50-POH.pdf). PDF page numbers below are one-based; preserve the distinction from printed page numbers.

The landing table at PDF page 487, printed 5-129, is explicitly unfactored. Its sea-level 5,550 lb values are 3,011 ft total and 1,628 ft ground roll. Do not divide them by 1.67. Factored landing data starts at PDF page 499, printed 5-141; the corresponding dry full-flap row on PDF page 500 is 5,028 ft total and 2,719 ft ground roll. Dry and wet factors are 1.67 and 1.92.

Do not mix takeoff technique across AFM variants. The pinned 31452-001 benchmark retains the 5 deg takeoff attitude and its applicable rotation-speed range. A different 31452-002 manual encountered during research uses different values; those were not imported into this benchmark.

The emergency/rejected-takeoff maximum-braking instructions are not evidence for the normal full-flap landing table procedure. Normal-landing brakes-as-required wording does not establish a normalized brake demand, deceleration history, or precise flare law.

PDF page 615, printed 10-5, Revision 4, provides an additional approximate constraint: about 38% N1 breakaway thrust at 6,000 lb. This is useful for a later rolling-friction and installed-engine cross-check. It is not currently a matched calibration target, because the applicable surface, loading details, and installed N1/thrust relationship remain unresolved. Do not tune friction to this clue before resolving those conditions.

## Reproduction and evidence

The complete 18-run summary, settings, hashes, and raw-report references are in [sf50-pilot-calibration-v6.json](sf50-pilot-calibration-v6.json). Raw prototype reports remain in `/private/tmp/sf50-v6-calibration.3BhSV2`; that temporary directory is not a durable raw-trace archive. The checked-in summary preserves the numerical evidence.

Rebuilt SDK used for measurements:

```text
/private/tmp/sf50-v5-validation.30axFG/sdk
WASM SHA-256: 4e8c4a199aefe6bed6067f86ad4c24ee4aa3a894fe4c9c1b34c148dfdbfa9091
SDK entry SHA-256: a499e03992c8d959eea25686c0f2ae3efa85cd4b14e3a484acc7eb13bc52f4ec
```

With Node v22.22.3, the new named-profile comparison command is:

```sh
node scripts/calibrate-sf50-pilot.mjs \
  --sdk-root=/private/tmp/sf50-v5-validation.30axFG/sdk
```

This creates a fresh temporary report directory and runs five named profiles against only the two calibration cases. It is a reproducible comparison of the extracted profiles, not an exact replay of every exploratory variant. To request only the selected profile:

```sh
SF50_AFM_CASES=calibration SF50_PILOT_PROFILE=development-v6 \
  node scripts/validate-sf50.mjs \
  --sdk-root=/private/tmp/sf50-v5-validation.30axFG/sdk --report-only
```

Neither command has been run against the extracted implementation yet. Report-only output must not be interpreted as an aircraft-validation pass.

## Ownership and remaining work

The turbine zero-time spool fix belongs to native JSBSim and remains there. Its four focused native regressions passed in the preceding work. The prototype runs use a rebuilt SDK containing that fix. The application's installed SDK was not replaced, and no upstream PR was opened by this calibration step.

Next, execute the extracted profiles and focused unit regressions before promoting these measurements to implementation results. Then resolve installed N1/bleed matching, physical CG/loading and datum anchoring, normal pilot/brake technique, and friction-identification methodology. Keep engine, aerodynamic, and tire coefficients fixed until their respective prerequisite evidence is sufficient. Reserve the ten holdouts for evaluation after the intended parameters and procedure are frozen.

The proposal remains incomplete as an end-to-end validated SF50 model. This step implements the development pilot and measurement methodology; it does not close those remaining aircraft or SDK-adoption items.
