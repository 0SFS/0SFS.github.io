# Implementation handoff: SF50 sound for 0sfs

Prepared 2026-09-14. Companion specification: [sound.md](sound.md). This handoff assigns implementation work; it does not report that synthesis, device qualification or recording acquisition has been completed.

## Assignment and delivery scope

Implement the selectable SF50 sound system described in **sound.md** in `/Users/felg/gh/0sfs`. Deliver application integration, original C++/WASM DSP, build tooling, meaningful tests, benchmark tooling and honest validation records. The specification is authoritative for tier budgets, acoustic assumptions, licensing, transport, fallback and release gates; this handoff supplies repository entry points and execution order. Keep the specification synchronized with evidence-backed implementation changes instead of maintaining conflicting copies of its tables.

The first working delivery is **Tier 0 + Tier 1 in the actual flight application**, including the existing tire cue in one shared runtime. Continue to **Tier 2** and the independently implementable **Tier 3 runtime/cache/qualification tooling**. Activate High only after its licensed bank and qualification gates pass. Tier X remains disabled research; implementing/training a neural model is outside this assignment. Do not stop after another design document, a standalone oscillator demo, a JS-only substitute, or a settings panel with no audio integration.

Unavailable recording rights or physical devices block the corresponding release gates, not unrelated implementation. Finish the available source, fixture, integration and build work; record precisely which checks remain unverified. Distinguish **implemented**, **software-verified** and **qualified on a named device/profile**. Neither synthetic audio nor an offline timing proxy establishes SF50 realism or real-time physical output.

## Start here

1. Read [AGENTS.md](../AGENTS.md), [sound.md](sound.md), [JSBSim integration](jsbsim.md) and the applicable instructions in any repository you need to modify.
2. Check repository identity, branch and working-tree changes. At preparation time there are substantial unrelated gamepad/autopilot/UI edits, and both sound documents are untracked. Preserve that work; do not reset, stash, broadly format or stage unrelated changes. Reinspect current files rather than relying on this snapshot's line numbers.
3. Run `npm run verify:jsbsim`. Preparation verified **@felipegalind0/jsbsim 1.2.4-fork.7**, archive `deps/felipegalind0-jsbsim-1.2.4-fork.7.tgz`, SHA-256 `58afaf9fa575ec61838ba794b7b4a0919b8eaf516c7261e571700e8367b5217b`. This identifies the inspected artifact, not a requirement to undo a later accepted upgrade. Record the actual installed identity in new evidence.
4. Establish relevant test/build baselines and inspect available Node, compiler and browser tooling. Select and pin the audio compiler with exact version/config/flags and document how to install it. There is no existing audio-WASM build pipeline to assume.
5. Create a short execution ledger with task IDs below, current owner, status, evidence path and next action. The implementation agent owns DSP, FDM adapter, Perf tooling and Release bookkeeping unless delegated. Owner roles are not a reason to wait for four people.

## Ownership and constraints

Application sound, its DSP source/build, aircraft mapping, UI and evidence belong in **0sfs**. Keep the new audio WASM module separate from the flight-dynamics module; the worklet must not share or invoke the live JSBSim executive.

Native engine and generic SDK changes belong in `/Users/felg/gh/Felipegalind0/jsbsim`, under `src/` and `wasm/`. If reliable combustion/phase exposure requires a binding, inspect existing bindings and upstream work first, make the smallest owning-source change, test it, and follow the [dependency contribution/adoption policy](jsbsim-upstream-contribution-policy.md). Do not substitute a live SDK link, edit packaged binaries or rebuild JSBSim merely to obtain an audio compiler. Its current artifact build is not byte-reproducible; distinguish source changes from output-hash differences.

Use existing public foss-earth services for scene/camera integration. Add a reusable public hook there only if the application cannot obtain the required state through supported surfaces. No gamepad, phone authority, autopilot, aerodynamics, fuel-map or terrain-quality redesign is needed for audio.

The app is **AGPL-3.0-only**. Write original DSP. No Wwise/FMOD, incompatible code or unlicensed assets. Recordist recordings/demos must not be embedded, redistributed or used for training without specifically negotiated rights. High stays unavailable without cleared assets; X stays flagged with training data unresolved. Follow the precise FlightGear/license distinctions in sound.md rather than inferring permission from a repository's existence.

Use terminal/headless verification. [AGENTS.md](../AGENTS.md) currently states: **“Never start a development, preview, watch, or other long-running server unless the user explicitly asks the agent to start it.”** Prefer build-file/request-interception harnesses for checks that can use them. If a remaining check truly needs a server, complete independent work, provide the exact command and explain that this repository instruction requires the user to start or authorize it. A request to test does not itself authorize a server. Do not take over the cursor; verify actual hardware GPU use for integrated performance evidence. Publishing, deployment and messages to others require applicable authorization; they are not implied by this implementation assignment.

## Repository integration map

Paths below exist at preparation time. Inspect their current symbols before editing.

| Entry point | Implementation responsibility / hazard |
| --- | --- |
| [createFlightSimApp.ts](../src/flight/createFlightSimApp.ts) | Compose the shared sound owner, lifecycle, accepted-step publication, camera state and settings. Preserve the existing simulation callback and input/phone ordering. |
| [fixedStepLoop.ts](../src/flight/physics/fixedStepLoop.ts), `createFixedStepPhysicsLoop` | The `onStep` callback runs only after a successful, accepted 120 Hz step. Publish from here and decimate to 60 Hz. The app's current callback has a **wheelSpinMode-off early return**: sound publication must be outside that guard and must not use the wheel-only step counter as its clock. |
| [createTireAudio.ts](../src/flight/audio/createTireAudio.ts) | Existing parameter curve/noise seed, graph and context lifecycle. Move the cue into shared WASM while preserving enabled/volume, unlock, holds and disposal behavior. Avoid a second context or parallel old graph. |
| [wheelCueBus.ts](../src/flight/feedback/wheelCueBus.ts) | Preserve the slip-energy/accepted-time calculation of mean watts and cue invalidation on holds/resets. An audio consumer failure must not interrupt physics or other feedback sinks. |
| [groundInteractionSettings.ts](../src/flight/settings/groundInteractionSettings.ts), [GroundInteractionSettingsPanel.tsx](../src/flight/hud/GroundInteractionSettingsPanel.tsx) | Preserve persisted tire mode/volume, capability gating and debug overrides. Sound quality does not change wheel physics or enable unavailable ground models. |
| [FlightControlPanel.tsx](../src/flight/hud/FlightControlPanel.tsx), [createFlightControlPanel.tsx](../src/flight/hud/createFlightControlPanel.tsx) | Add sound controls/status through the existing snapshot/actions flow. Keep high-rate telemetry and DSP out of React. |
| [flightState.ts](../src/flight/physics/flightState.ts), [ecefBridge.ts](../src/flight/bridge/ecefBridge.ts) | Existing flight/coordinate contracts; current live state lacks engine/audio fields. Prefer a dedicated audio snapshot adapter rather than turning every HUD state read into a full audio batch. |
| [fdmProfiles.ts](../src/flight/jsbsim/fdmProfiles.ts), [fj33_5a.xml](../public/jsbsim-data/engine/fj33_5a.xml) | Existing property paths and model values. Percent N1/N2 is not shaft RPM; missing data is not zero. Do not tune the flight model to make sound match. |
| [createJsbsimRuntime.ts](../src/flight/jsbsim/createJsbsimRuntime.ts), [resetFlightLocation.ts](../src/flight/jsbsim/resetFlightLocation.ts) | Model/runtime lifetime and reset boundaries. Dispose audio readers before SDK teardown; rebind after model replacement and start a new timeline epoch after resets. |
| [createPlaceholderAircraft.ts](../src/flight/aircraft/createPlaceholderAircraft.ts), [floatingOrigin.ts](../src/flight/bridge/floatingOrigin.ts) | View modes are `first`/`third`; cameras are parented transforms. The aircraft root is pinned to zero while the world shifts: its Babylon position derivative is not aircraft velocity. Derive physical source/listener motion in the documented coordinate frame. Cover view changes from keyboard/gamepad, panel and phone, without Doppler spikes on origin shifts or teleports. |
| [vite.config.ts](../vite.config.ts), [package.json](../package.json) | Production base paths, emitted WASM/worklet assets and build/test integration. Verify non-root deployment; no hard-coded `/audio/...` URL. |
| [run-audio-headless.mjs](../benchmarks/wheels/run-audio-headless.mjs), [tireAudioOffline.entry.ts](../benchmarks/wheels/tireAudioOffline.entry.ts) | Existing deterministic tire rendering pattern. It uses OfflineAudioContext and cannot prove physical output or real-time deadlines. Migrate its reference to the production DSP when replacing the old graph. |
| [run-feedback-browser.mjs](../benchmarks/wheels/run-feedback-browser.mjs), [check-jsbsim-browser-artifact.mjs](../scripts/check-jsbsim-browser-artifact.mjs) | Existing request-interception/synthetic-HTTPS browser checks avoid starting a server. Reuse the approach, including testing isolation headers; inspect the optional `PLAYWRIGHT_MODULE` dependency rather than assuming Playwright is installed in the app. |

## Proposed implementation boundaries

These are deliverables to create, not existing APIs. Adjust names to fit the repository while preserving the separation:

```text
src/flight/audio/
  createFlightAudio.ts       shared lifecycle / public app facade
  audioSnapshot.ts           units, validity, state and timestamp contract
  jsbsimAudioAdapter.ts      catalog-checked reads after accepted steps
  audioTransport.ts          bounded port/SAB ownership and discrete events
  audioQuality.ts            caps, eligibility, fallback and diagnostics
  audioSettings.ts           validated persistence and migration
  worklet/                   thin wrapper around the WASM DSP
  dsp/                       original C++ source, bounded state and build config
scripts/                     audio build/asset verification commands
benchmarks/audio/            generator, offline/real-time/fault harnesses
validation/evidence/audio/   small reproducible manifests/results
```

Keep generated bulk captures, compiler scratch, generated benchmark fixtures and machine-local artifacts in ignored `build/` (`build/validation/`, `build/benchmarks/`, or temporary directories). Evidence linked from committed documents must be committed or explicitly identified as an external artifact. Add source/build/license provenance for the audio module; do not treat generated WASM as its corresponding source.

Define a versioned snapshot with sequence/epoch, simulation time, mapped audio frame, availability/validity, engine values/state, airframe configuration and listener/source pose. Use owned numeric storage: SDK `PropertyBatch.read()` without a target returns an ephemeral WASM view. Read into a preallocated `Float64Array` destination, keep property creation disabled, create batches after model load, and dispose/recreate with the model. The existing [flight recorder](../src/flight/diagnostics/flightRecorder.ts) handles catalog paths that omit `[0]`; reuse that convention when checking availability. Send no SDK handles or Babylon objects to the worklet.

The app facade owns enable/unlock, settings, snapshot publication, view updates, hold/resume, reset epoch, status and idempotent disposal. View telemetry can update with camera motion independently of engine publication, but must not create another physics step. The worklet owns interpolation, de-zippering, DSP and bounded counters. The settings UI consumes low-rate status only.

Keep requested preference, effective tier, temporary hold/autoplay lock and failed capability separate. Master **Off** silences both engine and tire and releases active DSP resources; independent engine mute/volume allows tire-only playback in an audible tier. Preserve existing tire-only preferences without automatically enabling a new engine sound. Keep code-cache/browser baseline memory separate from active DSP memory in Off reports. Exercise pending enable/load/resume promises during mute/dispose so a late completion cannot restart audio.

## Work packages and gates

| ID / order | Work | Reviewable exit evidence |
| --- | --- | --- |
| **SND-01 — contracts/build** | Inspect ownership/lifetime, define snapshot + bounded C++ ABI, pin toolchain, integrate worklet/WASM asset build and verification. | Production build emits valid worklet/WASM at root and non-root base paths; record source/toolchain/hash; no audio allocation at import. |
| **SND-02 — telemetry/state** | Read finite catalog-checked values after accepted steps; implement epochs, clock mapping, both transports, event queue and smoothing. Establish trusted fueled-start/combustion handling. | Deterministic start/abort/shutdown tests, including fueled Start while `running=false`; batch-lifetime, missing-field, event-overflow, pause/seek and stale-input cases. |
| **SND-03 — Off/Low vertical slice** | Original turbofan-lite DSP, shared tire cue, cockpit/exterior treatment, compressor/limiter, lifecycle and settings in the real app. | Actual WASM renders finite bounded audio at 44.1/48 kHz; changing N1/N2 and view changes output; mute/holds/disposal work; tire regression behavior preserved; no recorded sample assets. |
| **SND-04 — qualification/fallback** | Extract the runnable sweep from sound.md into the versioned generator; add full-count, real-time and separate fault runs, result schema and fallback controller. | Reproducible fixture, timing provenance, positive-control dropout detector, forced downgrade/error recovery, honest `n/a`/`unknown` UI and eligibility tests. |
| **SND-05 — Med** | Add the bounded procedural bank, short generated convolver and exterior propagation specified in sound.md. | Measured or explicitly unverified resource results; correct state carryover, rate independence and transition caps; Med cannot enter normal use without its qualification gate. |
| **SND-06 — High** | Pooled granular renderer, lazy bank manifest/decode, HTTP/IndexedDB cache and fallback. Use original synthetic fixtures for software tests. | Grain/memory caps, codec/network/quota/eviction failure tests and complete asset manifest schema; synthetic fixtures remain test-only. Enable High only with a cleared bank and real qualification. |
| **SND-07 — delivery** | Run relevant regressions/full checks; collect available physical evidence; update sound.md and the implementation/validation ledger. | Per-tier implemented/verified/qualified status, exact commands/artifacts, remaining owner/action blockers and a reviewer-ready change summary. |

Do not wait for an unavailable phone before implementing Med or the High backend. Keep uncertified options gated and finish portable validation. Conversely, do not mark the overall release qualified merely because implementation packages are complete. Half-rate shedding is enabled only after its full resampler-inclusive path saves measured time; experimental GPU/neural paths cannot replace the required WASM core.

## Decisions that must survive implementation

- **Combustion:** neither starter/cutoff command state nor `running` alone establishes fueled startup. Use the verified adapter/binding path from SND-02. Never write propulsion properties from sound or substitute throttle for measured spools.
- **Budgets:** sound.md's limits include tires, common effects and transitions. A single mono source feeding two channels is not permission to double oscillator/grain/convolver counts when views change. Bound callback sizes and storage explicitly; no grow/allocate/wait in the render loop.
- **Transport:** port is the shipping static-host baseline; SAB is optional after deployed isolation checks. Maintain exclusive buffer ownership and the bounded discrete-event queue. Neither path may silently lose shutdown or spin waiting for physics.
- **Timing:** implement epoch anchoring, the specified telemetry lag and per-sample smoothing. Account for batched steps, simulation holds, clock drift and accumulated time discarded by the fixed-step loop; sustained skew must resynchronize under a fade rather than leave an ever-growing stale backlog.
- **Fallback:** repeated over-budget windows shed detail; observed deadline misses/underruns drop a tier immediately. Upgrade lockout never delays another downgrade. Fatal `processorerror` requires a new node or Off, not an attempted recovery within the permanently failed node.
- **Diagnostics:** timeline counters are not CPU timers; CDP graph load is not DSP p95. Missing measurements are unavailable, not zero. Qualified profiles include device, browser/OS build, rate, output route and transport; no automatic certification from UA strings or an offline kernel benchmark.
- **Settings:** implement the exact labels/reasons and stats format from sound.md; distinguish unavailable pack, missing capability, failed benchmark, absent validation and autoplay lock. Volume/quality persistence must not override a mute or unexpectedly restore loud sound.
- **Unsupported aircraft:** scope the turbine mapping to the SF50 family; do not feed C172 RPM into a turbofan preset. Preserve tire-only operation and all existing aircraft startup/reset behavior.

## Verification and completion record

Test contracts and failure behavior, not only mocked call sequences. Run the actual compiled WASM in DSP tests and actual worklet loading in browser checks. Unit tests may inject timers/capabilities to validate the controller, but label those tests synthetic.

Preserve or replace equivalent coverage in [tire audio tests](../src/flight/audio/createTireAudio.test.ts), [wheel cue tests](../src/flight/feedback/wheelCueBus.test.ts), [fixed-step tests](../src/flight/physics/fixedStepLoop.test.ts), [app integration tests](../src/flight/createFlightSimApp.test.ts), [ground integration tests](../src/flight/createFlightSimApp.ground.test.ts), [ground settings tests](../src/flight/settings/groundInteractionSettings.test.ts), [SF50 real-WASM tests](../src/flight/jsbsim/sf50.integration.test.ts) and [camera tests](../src/flight/aircraft/createPlaceholderAircraft.test.ts). Retain runtime cleanup and visual engine/CAS coverage as well. Do not retain a second production DSP solely to keep old graph-shape assertions passing.

Focused acceptance includes independent spool changes, combustion before running, standstill/windmilling, two sample rates, phase/filter continuity, grain/IR caps, limiter bounds, no NaNs, both transports, ownership/overflow, resets/model replacement, stale telemetry, origin/camera discontinuities, user-gesture unlock, pause/background/terrain/fault holds, pending initialization cancellation, settings/storage failure, downgrade hysteresis and fatal-node recovery. Compare sonic behavior with metrics/listening rather than asserting cross-platform floating-point byte identity.

Current repository commands, from `0sfs`:

```sh
npm run verify:jsbsim
npm test -- src/flight/audio src/flight/physics/fixedStepLoop.test.ts src/flight/settings/groundInteractionSettings.test.ts src/flight/jsbsim/sf50.integration.test.ts src/flight/aircraft/createPlaceholderAircraft.test.ts src/flight/createFlightSimApp.test.ts
npm run lint
npm test
npm run build
```

Add documented audio build/verification/benchmark commands in SND-01/SND-04; do not claim they already exist. Diagnose unrelated baseline failures and report them separately without changing unrelated work. Full application builds must retain JSBSim artifact checks. Do not run deploy scripts as part of verification.

For each performance report, use the full **sound.md §5** protocol: fixed hashes/fixtures, cold versus cached bytes, resident/peak RAM, warmup and thermal soak, repeated distributions, detector positive control, real output route, integrated physics/rendering and named devices. Record timer resolution, trace method, exclusions and missing metrics. OfflineAudioContext, virtual audio sinks and software-rendered GPU scenes cannot pass the corresponding physical gates. Preserve zero observed dropouts as an evidenced result, not a default field value.

Deliver an implementation ledger and validation report containing:

- Changed files and ownership; audio source/toolchain/WASM hashes and the installed JSBSim artifact identity.
- Working user flows and per-tier implementation/software-verification/device-qualification status.
- Exact build/test/benchmark commands, results and accessible evidence paths; regression failures and limitations.
- Asset licenses/manifests, actual cold/steady resource values, and any budget deviations with their disposition.
- Outstanding blocker, owner, evidence needed and next executable action for each unqualified tier/profile; recording and device gaps remain explicit.

Finish with reviewable code and this record. State what can be enabled safely under the plan, what remains gated and why. A successfully built implementation with unavailable hardware is **implemented but not fully device-qualified**; it is not a fabricated completed release.
