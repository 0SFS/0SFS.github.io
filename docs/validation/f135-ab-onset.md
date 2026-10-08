# F135 afterburner light and sound onset

Recorded 2026-10-07 after the user reported that AB still sounds lit before it
looks lit, especially after a cold engine start. The earlier audio correction
removed the augmentation-flag-only cue. Its tests covered audio and optical
sources separately; they did **not** establish perceived synchronization. This
follow-up adds a joint CPU test and preserves the remaining failure explicitly.

## Resolved by the coupled engine plant, 2026-10-08

The F135 now runs as the coupled JSBSim turbine plant (SDK `1.2.4-fork.20`,
native `ea6956b4`; [ledger](f135-engine-plant.md)). Reheat thrust exists only
where reheat fuel burns, because the augmentor's heat release is the only way
the plant raises nozzle temperature. The `it.fails` invariant below is now an
ordinary passing test with the same 1 lbf margin. Its dry reference is the
same engine, run with the throttle held at 0.99: the fan-speed demand is
the same, so the dry spool-up is the same, but there is no reheat request. A
second test asserts that reheat heat is released exactly when reheat fuel
burns and that every step's energy ledger closes.

| Native case | First reheat selection | First burned reheat fuel | Selected without burn | Wet thrust without burn | Worst step energy residual |
| --- | ---: | ---: | ---: | ---: | ---: |
| First running state after a true cold start | 2.6583 s | 4.0167 s | 1.3583 s | **0 s** (was 4.1333 s) | 1.2e-7 |
| Cold start, then 120 s settled dry operation | 0 s | 1.2417 s | 1.2417 s | **0 s** | 1.1e-7 |
| Explicit warm running initialization, then 5 s dry | 0 s | 1.2417 s | 1.2417 s | **0 s** | 6.8e-8 |

The selected-without-burn interval is now physical: after selection the
augmentor's spray manifold fills (estimated 2 kg prime mass), the igniter
waits its ignition delay, then the flame spreads around the ring. Its length
rests on estimated manifold, ignition and light-around values, not F135
data. `propulsion/engine[0]/augmentation` now reports reheat fuel burning;
selection is `propulsion/engine[0]/plant/combustion/ab-selected`.

Deliberate reheat sound still starts with the first burn in all three tiers
(Low / Med / High: 4.05000 / 4.05292 / 4.05292 s cold, 1.28333 / 1.28625 /
1.28625 s warm). The base jet sound now differs from the dry counterfactual
only from selection (2.68 s cold, 0.017–0.020 s warm). At selection the
nozzle pre-opens and the governor answers it, which leaves the thrust at or
below dry. The [report](../../validation/evidence/aircraft/f35b/engine-plant/ab-onset/report.json),
[120 Hz trace](../../validation/evidence/aircraft/f35b/engine-plant/ab-onset/native.csv)
and [log](../../validation/evidence/aircraft/f35b/engine-plant/ab-onset/cpu-diagnostic.log)
retain the run; every criterion passes except visible onset, which remains
untested. No browser, GPU, sound device or perception test was run.

The rest of this page is the 2026-10-07 record of the empirical engine.

## Reproduced native discrepancy

The current installed native engine selects its full wet thrust table while
fuel is still below the dry fuel demand. Its thermal observer calls only fuel
above that demand actually burned AB fuel. This leaves an interval with full
wet thrust and **zero reheat heat release**. The base jet sound follows native
thrust independently of the pilot's AB sound volume, so muting the deliberate
AB contribution cannot remove this premature native cue.

The CPU run used the installed immutable `1.2.4-fork.16` SDK at native revision
`97fe6ddf1c8a7d9e10dad46a88e60e79e69fae28`, the current aircraft data and shipped
DSP, a static sea-level test stand, 120 Hz physics and 60 Hz audio telemetry.
The primary runtime observation is zero AB burn, not a guessed visible or
audible threshold. Times below are relative to the full-throttle command;
the first accepted post-command step is labeled zero.

| Native case | First AB selection | First positive burned AB fuel | Selected without burn | Thrust at selection | Native dry-table thrust at the same N2/atmosphere/bleed |
| --- | ---: | ---: | ---: | ---: | ---: |
| First running state after a true cold start | 2.5167 s | 6.6500 s | **4.1333 s** | 43,000 lbf | 23,455 lbf |
| Cold start, then 120 s settled dry operation | 0 s | 0.0833 s | 0.0833 s | 43,000 lbf | 26,886 lbf |
| Explicit warm running initialization, then 5 s dry | 0 s | 0.0833 s | 0.0833 s | 43,000 lbf | 26,886 lbf |

These are simulated values, not F135 measurements. The native dry-table
diagnostic reproduces the real settled dry thrust before selection to better
than 0.000001 lbf. It is used only in validation to isolate the early thrust
path; the production app and audio never substitute that counterfactual.

JSBSim's `FGTurbine::Run()` directly sets augmented thrust and seeks fuel
toward the augmented TSFC target. `UpdateThermal()` then partitions its current
fuel against the dry demand. The cold case selects augmentation after N2
passes 97% while total fuel is still only 0.42791 kg/s. The thermal observer
cannot recognize positive reheat fuel until total flow reaches about
3.03187 kg/s. This independently reproduces the user's stronger cold-start
discrepancy; it is not a claim that the user's exact camera or sound-device
latency was recorded.

## Source emission and actual DSP samples

The current reacting parcel receives the native upstream EGT proxy, ambient
pressure and actually burned fuel. It produces internal CH emission at the
first positive native burn in all three cases. The authored GLB gas support
is loaded through NullEngine, so this checks the current interior domain
without drawing pixels. Chemical emission remains confined inside the engine.

At the first cold positive burn, CH source power is 0.10716 W and whole-domain
photopic intensity is 74.729 cd, versus 0.08334 cd on the preceding step.
The corresponding liner is still only 483.085 K. The two warm cases start
with about 0.07051 W CH and 41.503 cd, with liners about 665.699 K. Particle
continuum and CH both contribute to the whole-domain intensity. These are
model source integrals; they are not escaped light, image luminance or
calibrated real-engine radiance. They show that the active optical closure
does not wait for the liner to warm once native fuel actually burns.

Paired runs of the **shipped WASM DSP** use the same native trace, seed, gains
and source placement. One pair changes only deliberate AB volume between
one and zero; another changes only augmented native thrust to the evaluated
dry table, with deliberate AB muted. Sample differences isolate these paths
without inventing an SPL or perception threshold.

| Case | First sample changed by native wet thrust, Low / Med / High | First sample changed by deliberate AB contribution, Low / Med / High |
| --- | --- | --- |
| First cold running state | 2.53335 / 2.53627 / 2.53627 s | 6.66675 / 6.66967 / 6.66969 s |
| Settled dry and warm initialization | 0.01669 / 0.01960 / 0.01960 s | 0.10008 / 0.10304 / 0.10306 s |

Deliberate AB sample differences are exactly zero throughout the native
selected-but-unburned interval in all three tiers. The base thrust path changes
earlier and is nonzero during that interval. The audio transport buffer,
telemetry interpolation, dezippering and provisional one-metre propagation
remain active. First unequal Float32 samples are a causal diagnostic, not a
claim about when a listener notices the change.

Low has no propagation delay; the one-metre delay applies to Med and High.
The harness supplies future timestamped telemetry to keep interpolation
brackets available. That prefill is test plumbing, not a measured scheduling
or sound-device latency. Publication times now use integer tick division.
Review found that accumulating `1/60` placed the 0.25 s command-aligned tick
slightly before the command, skipping its first warm state. The corrected
table above removes that extra one-tick sampling shift. Native burn timing
and all first-burn source values are unchanged.

## Tests and retained evidence

The new [joint integration test](../../src/flight/audio/f135ExhaustOnset.integration.test.ts)
checks cold and warm native states, same-step internal reaction emission,
source energy bounds, no exterior CH relocation, and actual DSP deliberate
cue causality in Low, Med and High. An explicit `it.fails` assertion retains
the desired invariant that zero burned reheat fuel must not already produce
reheat-only excess thrust. It is a **known unresolved native failure**, not
the desired behavior and not a synchronization pass.

The [runnable CPU diagnostic](../../scripts/validation/f35b/check-f135-ab-onset.mjs)
adds the explicit warm initialization comparison. Run it from the repository:

```sh
node scripts/validation/f35b/check-f135-ab-onset.mjs
```

The corrected [report](../../validation/evidence/aircraft/f35b/ab-onset-2026-10-07/integer-clock-reviewed/report.json)
retains all criteria, source/native/artifact hashes, numerical source values,
DSP difference hashes and known failures. The [120 Hz native trace](../../validation/evidence/aircraft/f35b/ab-onset-2026-10-07/integer-clock-reviewed/native.csv)
retains the selected/unburned interval rather than reducing it to two endpoints.
The [diagnostic log](../../validation/evidence/aircraft/f35b/ab-onset-2026-10-07/integer-clock-reviewed/cpu-diagnostic.log)
records the run. Source and DSP causality checks passed; the native thrust
criterion remains failed. Actual output is finite, stays inside the existing
sample-peak limiter, preserves each tier's partial/noise/IR caps and uses no
growing WASM memory. These are untimed resource checks, not a performance
qualification. The [original report](../../validation/evidence/aircraft/f35b/ab-onset-2026-10-07/report.json)
is retained as superseded for audio-clock values, with its original inputs.

The parent task's full CI passed before this review correction: 187 files,
2,027 passes and two expected failures. Its related run passed 60 files,
824 tests and one expected failure. The time-mapping correction and stronger
cap assertions then passed the targeted onset-test rerun (four passes plus
the known native expected failure) and incremental typecheck/lint. The
[follow-up receipt](../../validation/evidence/aircraft/f35b/exhaust-ui-sound-2026-10-07/acceptance.json)
retains the original CI and final targeted checks separately.
The full suite is not repeated for this correction. The native-thrust expected
failure remains open throughout these software results.

No browser, GPU, server, sound-device, listening, performance or display-onset
test was run. The test does not declare any emission visibly detectable. The
current EGT station meaning, gas-flow closure, soot loading and reacting-parcel
surrogate remain uncalibrated physical hypotheses. Camera exposure, occlusion,
tone mapping and actual output latency still require separate qualification.

## Remaining correction

The next engine change belongs in **JSBSim**: reheat thrust, fuel supply,
burned fuel, heat addition and nozzle flow must describe the same transient.
Do not delay audio or force optical brightness to conceal this inconsistency.
No native correction is included here because these observations establish
the violation but do not determine a defensible F135 transient thrust law.
After that engine closure is corrected, use the same cold/warm test to turn
the expected failure into a passing invariant, then separately verify rendered
and perceived onset. The user's currently accepted faint dry night appearance
is unaffected by this diagnostic.
