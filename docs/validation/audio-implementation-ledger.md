# SF50 sound: implementation ledger and validation report

Task IDs follow [sound-implementation-prompt.md](../sound-implementation-prompt.md); budgets and gates
come from [sound.md](../sound.md). This file records *what was done and what was checked*, not what
the plan hopes for. Status words are used strictly:

- **implemented**: code exists, compiles and is exercised by tests.
- **software-verified**: verified by automated checks that touch no physical audio route (unit tests,
  renders of the compiled WASM, real-JSBSim adapter runs, offline proxies).
- **qualified**: measured on a *named* device/browser/OS build/output route/sample rate under the §5
  protocol. **Nothing in this repository is qualified.**

## 1. Summary

| Tier | Implemented | Software-verified | Qualified | In the app today |
| --- | --- | --- | --- | --- |
| **Off (Tier 0)** | yes | yes | no | Default. No AudioContext, fetch or compile until a gesture asks for sound. |
| **Low (Tier 1)** | yes | yes | **no** | What Auto resolves to. Also carries the tire cue on its own. |
| **Med (Tier 2)** | yes | yes | **no** | Selectable, labelled **"Not yet validated"**, and runs as Low with that reason shown. A session-only testing switch runs it as Med. |
| **High (Tier 3)** | runtime, bank gate and cache | with synthetic fixtures only | **no** | Disabled: **"Audio pack unavailable"**. No licensed bank exists. |
| **X** | no | no | no | Not started. Stays separate research (§4). |

The previous tire cue's private AudioContext is gone. The cue now plays through the same worklet, WASM
core, limiter and holds as the engine.

## 2. Baselines captured before the audio work

| Item | Value |
| --- | --- |
| Repository state | Branch `feat/sf50-flight-model` at `a430ee1e`, with substantial pre-existing uncommitted gamepad/autopilot/phone/HUD work. That work was preserved: nothing was reset, stashed, reformatted or staged. |
| `npm run verify:jsbsim` | `@felipegalind0/jsbsim` **1.2.4-fork.7**, archive sha256 `58afaf9fa575ec61838ba794b7b4a0919b8eaf516c7261e571700e8367b5217b`, input sha256 `733a60a62ef3061dc254f6d4a3c8f3cf7f162a213b444e423e4ac3d6b18553f0`, 14 verified files |
| `npm run lint` | clean |
| `npm test` | **9 tests in 4 files already failing** before any audio change, in `createFlightSimApp.test.ts`, `createFlightSimApp.phone.test.ts`, `input/gamepadProfiles.test.ts` and `loading/createFlightLoadingScreen.test.ts`. They belong to the in-progress gamepad/phone/loading work and were not touched. The same tests still fail after the audio work (§5.1). |
| Node / npm | v26.8.2 / 11.19.1 |
| Audio toolchain | Emscripten `emcc` 6.0.9 (Homebrew), pinned in `scripts/build-audio-wasm.mjs` |

## 3. Work packages

### SND-01: contracts and build (implemented, software-verified)

- **Snapshot ABI:** `audioSnapshot.ts` ⇄ `dsp/snapshot.h`, 29 Float64 fields, versioned, with availability bits
  and 8 event types. `audioSnapshot.test.ts` parses the C++ header and fails on drift. The worklet
  constant is checked too.
- **Core:** original C++17 in `src/flight/audio/dsp/` (`core.cpp`, `primitives.h`, `turbofan.h`,
  `convolver.h`, `granular.h`), built as a standalone reactor WASM.
  - Static buffers; `osfs_audio_process()` allocates nothing, takes no lock and never waits.
  - `emmalloc` is reachable only from band setup.
- **Build:** `npm run build:audio` → `scripts/build-audio-wasm.mjs`.
  - Pins `emcc` 6.0.9 and checks the required exports.
  - Writes `audio-dsp.provenance.json`: source hashes, flags, imports, exports and the WASM hash.
- **Verification:** `npm run verify:audio` checks the WASM hash against provenance, source drift and exports.
  `--dist=<dir>` also checks that the emitted `audio-dsp-*.wasm` and `dspProcessor-*.js` exist, and
  rejects root-absolute `/audio/` URLs.
- **`npm run build` now runs `verify:audio` before and after `vite build`,** and keeps both JSBSim artifact checks.
- **Assets:** `audioAssets.ts` resolves both files with `new URL(..., import.meta.url)`. Vite emits them
  content-hashed and base-rewritten (§5.2 shows the root and `/0sfs/` builds).
- **No allocation at import:** `createFlightAudio.test.ts` ("allocates nothing until sound is asked for").

| Artifact | Value |
| --- | --- |
| `src/flight/audio/dsp/audio-dsp.wasm` | 42,740 bytes, sha256 `01367066b89f28d8d560c326216f507d821cbef57d091d0a4f85f309f99c238b` (was 42,542 / `ef9369b6…8a4d41` before §13) |
| Only import | `env.emscripten_notify_memory_growth` |
| Flags | `-O3 -std=c++17 --no-entry -sSTANDALONE_WASM=1 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=2097152 -sSTACK_SIZE=131072 -sMALLOC=emmalloc -sERROR_ON_UNDEFINED_SYMBOLS=1 -sFILESYSTEM=0 -fno-exceptions -fno-rtti -fno-fast-math` |
| `src/flight/audio/worklet/dspProcessor.js` | sha256 `aebee765ab0a6744679853d62ccf21e70b2a5853de3f00b87bb31fd1c5360e22` (plain JS, emitted verbatim) |

### SND-02: telemetry and state (implemented, software-verified)

- **Adapter** (`jsbsimAudioAdapter.ts`):
  - One `PropertyBatch` (`create: false`) read into owned storage after each accepted step.
  - Availability comes from the property catalog, never from JSBSim's 0.
  - Engine acoustic centre comes from the model's own engine and CG positions (a geometric reading,
    not a measured acoustic centre).
- **Combustion:** `fuel flow > 1e-4 lbm/s || running`. Evidence: `evidence/audio/sf50-start-trace-2026-09-14.txt`.
  Fuel burns for ~14.5 s of a fork.7 cold start while `set-running` is still 0.
  - Checked against the real SDK for fueled start, aborted start and shutdown.
  - **Not** validated against starvation or relight traces (FDM).
- **Publication:** `createFlightSimApp.ts` calls `flightAudio.publishStep()` in the fixed-step callback,
  *before* the wheel-experiment guard.
  - Snapshots decimate to 60 Hz on simulation time.
  - Transitions (starter, light-off/flameout, running) publish on their own step, before decimation.
- **Transports:**
  - MessagePort with three transferable buffers (default).
  - Optional SAB SPSC ring through integer Atomics, only when `crossOriginIsolated`.
  - Continuous state coalesces (newest wins).
  - Events never coalesce. The 32-slot event queue reserves its last slot for the RESYNC marker.
- **Clock:**
  - Epoch anchoring with k = 1; rendering is 33.3 ms behind; per-sample interpolation; 10 ms smoothing.
  - After 250 ms stale, fade out over 100 ms.
  - Re-anchor when telemetry runs > 0.5 s ahead, **or** when fresh snapshots arrive stamped > 150 ms
    behind the render point. Without the second rule, a main-thread stall the fixed-step loop does
    not replay (it caps catch-up at 6 steps) would leave telemetry permanently "stale" and silent.
  - A re-anchor does not fade: voices carry through and the 10 ms smoothing absorbs the jump. The first
    version faded from silence, which turned every few blocked physics frames into an audible dropout.
  - Late or out-of-order snapshots are dropped; a repeat of the same instant replaces the queued one.
  - Events from another epoch are dropped.
  - Simulation time rewinding opens a new epoch automatically; a reposition also calls `beginEpoch()`.

| Acceptance item | Evidence |
| --- | --- |
| Fueled Start while `running=false` | `jsbsimAudioAdapter.integration.test.ts`: real SDK, same procedure as the trace |
| Abort / shutdown | same file: combustion drops when fuel is cut; shafts still turning |
| Missing fields | same file (C172 has no N1/N2 → bits clear, listed missing); `dspCore.test.ts` NaN rejection |
| Batch lifetime | adapter dispose is idempotent and reads nothing after; facade disposes the adapter **before** closing audio and before `jsbsim.dispose()` |
| Event overflow | `audioTransport.test.ts` (RESYNC marker), fault-injection proxy (40 events into 32: 8 dropped, resync) |
| Pause / seek | `createFlightAudio.test.ts` (per-reason holds, epoch on release, epoch on rewind); fault-injection seek |
| Stale input | `dspCore.test.ts` fade and recover; slipped-clock re-anchor; fault-injection stale window and stall |

### SND-03: Off/Low vertical slice (implemented, software-verified)

- **Source model** (`turbofan.h`): independent N1 and N2 order tones (12-entry table ordered so shedding
  keeps both fundamentals), fan wake, bypass band, jet mixing, combustor rumble gated by combustion and
  fuel, and airframe wind with gear/flap turbulence. The fan/bypass vs core weight is 3.3/(1+3.3).
  - **Every frequency and gain is the initial synthetic reference from sound.md, not an FJ33 measurement.**
    `2500×n1` and `6000×n2` are placeholders, not blade-pass frequencies.
  - No buzz-saw.
  - Each noise band has its own always-advancing random stream, so bands add rather than cancel.
  - Airframe wind and gear/flap turbulence have their own gain ("Airframe wind volume").
    - Retuned after the pilot reported loud static in a 300 kt dive.
    - The wind is now high-passed at 120 Hz and low-passed at 350 + 1650·√w Hz, at 0.12·w, so it opens up with speed.
    - Before, it was white noise above 250 Hz at 0.30·w.
    - Gear/flap turbulence dropped from 1.1 to 0.5.
    - Still unverified values.
- **Installation:**
  - Cockpit: −18 dB and a 1.2 kHz low-pass.
  - Exterior: `min(1, 1/d)` plus air-absorption low-pass.
  - Equal-power pan; DC blocker, soft-knee compressor, −1 dBFS sample-peak limiter.
  - Values are the spec's unverified starting points.
- **Tire cue migration:** the `TireVoice` in the core implements exactly `tireAudioParameters()` (checked
  against the compiled core). `createTireAudio.ts` keeps its method surface but is now a view onto the shared runtime.
  - Tire enable and volume keep their existing home: Ground interaction `tireAudioVolume`.
  - Tire holds (pause, blocked terrain, contact fault) silence the tire cue alone.
  - Engine sound is held only for pause and world loading. Otherwise it follows telemetry, so a
    flickering contact cannot chop it.
  - The telemetry fade gates the engine path only, so the tire cue still plays on the C172 or in tire-only mode.
  - The old Web Audio graph lives on in `legacyTireAudioGraph.ts` solely as the offline benchmark's reference.
    The app does not import it.
- **App** (`createFlightSimApp.ts`):
  - Creates the settings store and the facade.
  - Attaches the adapter **for the Vision Jet family only**.
  - Updates the listener pose per frame from the camera view matrix; unknown terrain turns the ground reflection off.
  - Disposes audio before JSBSim.
- **Sound tab** (`SoundSettingsPanel.tsx`, its own tab in the flight panel):
  - "Enable sound" / "Turn sound off".
  - Quality Off/Low/Med/High/Auto, with the exact §6 availability labels and reasons.
  - Requested vs effective quality, and a re-test after a downgrade.
  - Master and engine volume, engine mute, reduced dynamic range.
  - Telemetry diagnostics and the §6 stats line.
  - Airframe wind volume.
  - Choosing Med shows **"Run Med anyway (testing)"**, which switches to "Testing unvalidated Med" with a
    **"Stop testing unvalidated quality"** button. A separate checkbox came first, but with Auto selected it
    did nothing, and the pilot could not get Med to run:
    - Runs an explicit Med request without device evidence.
    - Never saved; Auto ignores it; a missing bank still blocks High.
  - Live engine telemetry (burning / windmilling / stopped, N1, N2, fuel flow) and the core timeline counters.
- **Lifecycle:**
  - The context is created and resumed synchronously inside the gesture.
  - A saved "enabled" never autoplays; the first gesture builds the graph.
  - A late load loses to a disable.
  - A processor fault drops to Off and restarts only when the pilot switches sound again.
  - A hold silences at once but suspends the context only after 1.5 s, so a brief hold leaves no gap.
- **Engine monitor** (`hud/engineMonitor.ts`, on the flight display):
  - Collapsed, one line: derived phase, N1/N2 (RPM for a piston), fuel flow, thrust and sound tier.
  - Expanded:
    - curated engine, temperature, fuel and tank, command, flag and air-data rows
    - what the audio core hears
    - a log of every discrete change with its simulation time
    - every readable engine property discovered from the catalog
  - JSBSim does not publish a turbine's phase. It is derived from `FGTurbine::Calculate`'s rules, labelled
    as derived, and checked against the real SDK through a cold start and a windmill.

| Acceptance item | Evidence |
| --- | --- |
| Finite, bounded audio at 44.1 / 48 kHz from the actual WASM | `dspCore.test.ts` |
| N1 and N2 independently change output | `dspCore.test.ts`: exact difference signals; the core reference moves 3.2 → 5.4 kHz |
| View changes output | `dspCore.test.ts` cockpit vs exterior, pan |
| Burner vs windmill | `dspCore.test.ts`: fan tone level unchanged, residual confined to 40–400 Hz |
| Light-off lands at its timestamp and holds until telemetry agrees | `dspCore.test.ts`: bit-identical before the event frame, converges after |
| Mute / holds / disposal | `createFlightAudio.test.ts`, `createTireAudio.test.ts` |
| Tire regression behaviour | `createTireAudio.test.ts` (curve, 2 W floor, saturation in the compiled core); `createFlightSimApp.ground.test.ts` unchanged and passing |
| No recorded sample assets | none in the repository; High fixtures are generated noise inside tests |

### SND-04: qualification and fallback (tooling implemented and software-verified; no qualification)

- **Sweep generator:** `benchmarks/audio/generate-sweep.mjs`, taken verbatim from §5. It reads the keyframe
  table from sound.md and fails if the table changes shape.
  - Fixture `build/benchmarks/audio/sweep.jsonl`: 14,400 rows, 5,222,891 bytes, sha256
    `0e4a927e80859f19f9fab923fb547d4aa6073b55e5dd6781ec2fcbf014704389` (also in `benchmarks/audio/sweep.jsonl.sha256`).
    Generated and gitignored; regenerate with `node benchmarks/audio/generate-sweep.mjs`.
  - Generation is deterministic (tested).
- **Offline renderer:** `benchmarks/audio/renderSweep.mjs` runs the compiled core over the sweep per tier and rate.
  - Passes: `sweep`, `capacity` (tier maximum plus 15,000 W tire slip) and a labelled `fault-injection` pass
    (seek, stale input, NaN snapshot, tier switch, shed ladder, event overflow, main-thread stall).
  - Reads the ABI from `snapshot.h`.
  - Refuses a WASM that does not match provenance.
  - Aggregates p95 from raw observations, never averaged percentiles.
  - Reports dropouts as `null` (unknown).
- **Result schema:** `benchmarks/audio/result.schema.json` covers offline proxies, headless checks, device
  qualification and overload positive-control records.
- **Dropout detector:** `benchmarks/audio/dropoutDetector.mjs`, a probe-tone demodulator with a
  one-quantum window hopped by a quarter quantum, drift tracking and phase re-lock.
  - Positive controls: gaps at four alignments, a repeated quantum, a skipped quantum, two separate faults.
  - Negative control: 10 s with 80 ppm drift and noise.
  - Refuses a probe frequency that would hide a repeated quantum.
  - **Validated on synthetic captures only**; each device still needs its own induced-overload capture.
- **Headless worklet check:** `benchmarks/audio/run-worklet-headless.mjs` plus `workletHeadless.entry.ts`
  load the real worklet and WASM in headless Chromium through a file URL. **Not run**: see §5.5.
- **Fallback controller** (`audioQuality.ts`):
  - Two consecutive over-budget 2 s windows shed one stage.
  - A render longer than Q, or a counted underrun, drops a tier at once.
  - The 60 s upgrade lockout never delays a downgrade.
  - A downgrade persists until an explicit re-test.
  - The facade feeds it `AudioContext.playbackStats.underrunEvents` where the browser implements it
    (feature-detected), and the stats line says the counter is not validated.
  - **No per-callback DSP timer exists in the app**, so DSP p95/max show `n/a` and shedding never triggers from timing.
- **Honest UI:** empty `QUALIFIED_PROFILES`; unmeasured values print as `n/a` / `unknown`, never 0 (tested).

### SND-05: Med (implemented, software-verified, not qualified)

- Tier caps: 12 partials plus a bypass band, and a 20 ms generated cabin impulse response through a
  128-sample partitioned FFT convolver.
- Doppler on the whole source through a variable delay line (first-order `1 ± v/c`), capped at 0.5 s and
  faded before the cap. The line's read pointer is advanced by the velocity-derived ratio alone; distance
  seats the tap but never moves it. See §13 for why, and for what happened when distance did move it.
- Air absorption and one ground-image reflection (gain 0.25, off when terrain is unknown, and faded
  out where its tap would pass the 0.5 s storage cap).
- Level at range is `min(1, 1/d)` at every audible tier, with no distance cutoff: Med tracks Low to the
  500 m zoom clamp at a constant −3.4 dB, which is the cabin IR and bypass band, not distance (§13).
- Shedding ladder: partials 12→8→4, grains, IR 40→20→10→0, partials →2.
  Half-rate synthesis is deliberately **not** enabled: its cost is unmeasured.
- Evidence (`dspCore.test.ts`): shed levels 1–6 keep the output finite and bounded; a tier switch fades from
  silence over 50 ms. Fault-injection proxy covers the Med↔Low switch.
  Doppler magnitude and direction, and the camera-zoom behaviour, are in
  `cameraZoomAudio.integration.test.ts` (§13). **This line previously claimed `dspCore.test.ts` held the
  Doppler evidence. It did not; no such test existed.**
- Resource results are **proxies only** (§5.3). Med cannot become effective in normal use: Auto never picks it
  without a qualified profile, and an explicit Med request runs Low with the reason shown. Only the
  session testing switch runs it.

### SND-06: High (runtime implemented; software-verified with synthetic fixtures; never enabled)

- **Granular pool** (`granular.h`): 12 voices, ≤160 starts/s, 20–60 ms Hann windows, drop counting.
  Band storage is allocated only from the setup path (`osfs_audio_band_alloc`).
- **Bank gate** (`audioBank.ts`): manifest v1.
  - Licence record must have `redistribution: true`; **Recordist sources are rejected by name**.
  - ≤ 6 bands, ≤ 3 per view; lowercase SHA-256; exact float32 byte length.
  - Total within the High cold-download budget.
- **Loader and cache:**
  - SHA-256 on every byte from cache or network; corrupted entries are misses and get replaced.
  - Read errors and eviction are misses; quota failures keep the bank usable for the session.
  - Cache keys include the licence manifest version, so a licence change never reuses entries.
  - Shared payloads download once; clear-downloads is provided.
  - IndexedDB store resolves writes on transaction commit.
  - Bands are resampled to the actual context rate before install (browser `OfflineAudioContext`).
- **Install:** `flightAudio.installBank()` posts bands to the worklet, waits for every acceptance, clears a
  partial bank, and loses `bankReady` when the graph is torn down. A bank alone moves High only from
  "Audio pack unavailable" to "Not yet validated".
- **Tests:** `audioBank.test.ts` (licence, Recordist, caps, integrity, corruption, quota and read failure,
  licence change, shared payload, clear, resample) and `createFlightAudio.test.ts` (install, partial rejection),
  both with generated fixtures; `dspCore.test.ts` for the grain caps.
- **Not browser-tested:** the IndexedDB store and `OfflineAudioContext` resampler run only in a browser;
  Node tests use an in-memory store with the same contract.

### SND-07: delivery

This file, the status block at the top of sound.md, and the reviewer summary in §8.

## 4. Decisions and deviations to review

1. **Tire volume stays in Ground interaction.** Sound settings hold master and engine volume only, so the
   tire has one control, not two that could disagree.
2. **Tire-only mode.**
   - Enabling the tire cue without engine sound runs the shared graph at Low, with engine gain 0 and master gain 1.
   - This preserves the pre-migration behaviour: the tire cue never needed a master switch.
   - Low still computes its 4 partials at zero gain in this mode.
3. **Engine sound is Vision Jet only.** The C172 gets no turbofan; it keeps the tire cue.
4. **Med is selectable but runs as Low** while unvalidated, with the reason shown, unless the session
   testing switch is on. High's option is disabled.
5. **Doppler is first-order** via the delay line, and the velocity-derived ratio is what drives it. It also
   culls partials that would alias. In the app both cameras are rigidly attached, so Doppler is 1 there and
   the tap holds still however the pilot zooms; flybys are exercised offline. The tap is seated from the
   retarded range `d / (c + range rate)`, and re-seated only at an epoch, at a tier change, or while the
   direct path is faded out (§13).
6. **Slipped-clock re-anchor (150 ms)** was added beyond the spec's 0.5 s backlog rule, for the stall case in §3.
7. **Underrun counters** are used where the browser has them, as fallback input only, marked unvalidated.
8. **Bank payload format is raw float32 PCM.** It needs no decoder; whether compression is worth its
   decode cost is open (Release/DSP).
9. **Mix balance is barely tuned.** The only listening so far is one pilot session, which led to the wind
   retune in §3. Relative gains (combustor, fan, jet, airframe, tire) are otherwise unreviewed starting points.
10. **Testing switch for unvalidated tiers.**
    - Session-only, off by default, never persisted.
    - A tier cannot be qualified without running it, so Perf needs this.
    - It does not admit Med in normal use.
11. **Holds are split.** Terrain and contact holds are tire-only; engine holds are pause and loading. Context
    suspension waits 1.5 s.
12. **Re-anchors do not fade.** See §3, SND-02.

## 5. Validation report

All runs: macOS on the development machine, Node v26.8.2, no physical output route. Nothing here is a
real-time or device measurement.

### 5.1 Checks

| Command | Result |
| --- | --- |
| `npm run lint` | exit 0 (`eslint .`) |
| `npm test` | 940 passed, 9 failed (949) in 102 files. The 9 failures are exactly the baseline tests in the same 4 files (§2); no audio change added a failure. |
| `npm run build` (includes `verify:jsbsim`, `verify:audio`, `tsc -b`, `vite build`, both `--dist` verifications) | exit 0; `dist/assets/audio-dsp-CISiyfks.wasm` and `dist/assets/dspProcessor-Bc9BtBGg.js` verified |
| `npx vitest run src/flight/audio src/flight/hud benchmarks/audio` | 213 passed in 25 files (audio, HUD including the Sound panel and engine monitor, benchmark tooling) |

### 5.2 Emitted assets at root and non-root base

| Build | Emitted | Verify |
| --- | --- | --- |
| `npx vite build --outDir <scratch>/dist-root` then `node scripts/verify-audio-artifact.mjs --dist=<scratch>/dist-root` | `assets/audio-dsp-CISiyfks.wasm`, `assets/dspProcessor-*.js` | exit 0 |
| `npx vite build --base=/0sfs/ --outDir <scratch>/dist-sub` then verify | JS references `new URL("/0sfs/assets/audio-dsp-CISiyfks.wasm", import.meta.url)` | exit 0 |
| `npm run build` | `dist/assets/audio-dsp-CISiyfks.wasm` 42.54 kB (21.36 kB gzip), `dist/assets/dspProcessor-*.js` 8.83 kB | exit 0 |

The worklet file name is content-hashed, so it changes with any edit to `dspProcessor.js`.

### 5.3 Offline sweep proxy

`node benchmarks/audio/renderSweep.mjs --sweep=build/benchmarks/audio/sweep.jsonl --tiers=off,low,med --rates=44100,48000 --repeats=3 --passes=sweep,capacity --out=docs/validation/evidence/audio/offline-sweep-proxy-2026-09-14.json`

Full sweep, 3 repeats, run on an otherwise idle machine. `performance.now()` wraps each
`osfs_audio_process()` call in Node. That is a kernel proxy: **not** AudioWorklet callback timing, not
real-time acceptance (§5.4), and it includes Node scheduling and GC outliers in `max`. Dropouts: unknown.

Run on an Apple M5 (10 logical CPUs), Node v26.8.2, at 2026-09-14T09:43:31Z. Sweep sha256 `0e4a927e…04389`,
WASM sha256 `ef9369b6…8a4d41`. Each row aggregates 3 × 240 s.

| Tier | Fs (Hz) | Pass | Peak | Non-finite | p50 ms | p95 ms | Worst rolling 2 s p95 ms | Max ms | Quanta over Q | Proposed p95 budget ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| off | 44100 | sweep | 0.000 | 0 | 0.0000 | 0.0000 | 0.0002 | 0.205 | 0 of 248064 | n/a |
| off | 48000 | sweep | 0.000 | 0 | 0.0000 | 0.0000 | 0.0000 | 0.075 | 0 of 270000 | n/a |
| low | 44100 | sweep | 0.052 | 0 | 0.0234 | 0.0251 | 0.0349 | 3.081 | 5 of 248064 | 0.12 |
| low | 44100 | capacity | 0.089 | 0 | 0.0240 | 0.0256 | 0.0299 | 3.230 | 2 of 248064 | 0.12 |
| low | 48000 | sweep | 0.049 | 0 | 0.0232 | 0.0250 | 0.1077 | 8.942 | 11 of 270000 | 0.12 |
| low | 48000 | capacity | 0.088 | 0 | 0.0239 | 0.0255 | 0.0315 | 3.541 | 2 of 270000 | 0.12 |
| med | 44100 | sweep | 0.034 | 0 | 0.0413 | 0.0461 | 0.1128 | 8.263 | 9 of 248064 | 0.25 |
| med | 44100 | capacity | 0.088 | 0 | 0.0421 | 0.0469 | 0.1178 | 3.317 | 7 of 248064 | 0.25 |
| med | 48000 | sweep | 0.031 | 0 | 0.0420 | 0.0473 | 0.2615 | 12.329 | 19 of 270000 | 0.25 |
| med | 48000 | capacity | 0.089 | 0 | 0.0428 | 0.0485 | 0.1627 | 10.516 | 13 of 270000 | 0.25 |

What this does and does not show:

- **Output:** zero non-finite samples in every run, every peak far below the −1 dBFS ceiling, and Off is
  exactly silent.
- **Kernel cost:** the aggregate p95 is about 20 % of the proposed budget at both tiers.
- **Not a pass.** Worst rolling 2 s p95 exceeded the proposed Med budget in one run (0.2615 ms at 48 kHz),
  and every audible run has a few quanta over Q, with a max of up to 12.3 ms.
  - These are Node process outliers (scheduling, GC), which is exactly why §5.4 rejects offline timings
    for acceptance.
  - The same stall inside a real audio callback would be a dropout.
  - Only device runs can settle it.

### 5.4 Offline fault-injection proxy

`node benchmarks/audio/renderSweep.mjs --sweep=build/benchmarks/audio/sweep.jsonl --tiers=low,med --rates=44100,48000 --passes=fault-injection --out=docs/validation/evidence/audio/offline-fault-injection-proxy-2026-09-14.json`

These are deliberate faults, not normal-run dropouts. Identical counters at every tier and rate:

| Fault (sweep time) | Observed in the core |
| --- | --- |
| Seek at 30 s | `epoch` 2; queues cleared under a fade |
| Stale input 50–50.6 s | stale fade (`staleFades` 2 including start-up before the first snapshot) |
| NaN snapshot at 70 s | `nonFinite` 1, `snapshotsDropped` 1; output unaffected |
| Tier switch at 90–92 s, shed ladder 110–113.5 s | output finite, peak within the −1 dBFS ceiling |
| 40 future-stamped events into a 32-event queue at 150 s | `eventsDropped` 8, resync |
| 0.7 s main-thread stall at 170 s | slip re-anchor (`resyncs` 2 in total); cruise segment RMS ≈ 0.006, so sound recovered |

Output: peak 0.033–0.063, zero non-finite samples in all four runs. Fault-pass proxy p95 was 0.027–0.028 ms
at Low and 0.045–0.046 ms at Med.

### 5.5 Not run, and why

| Item | Why | Command when unblocked |
| --- | --- | --- |
| Headless worklet load check | The Playwright node module is not installed in this project (browser binaries are cached, the module is not). Installing packages was outside this assignment. | `npm install --prefix build/tools/playwright --no-audit --no-fund playwright`, then `node benchmarks/audio/run-worklet-headless.mjs` |
| Real-time runs, soak, 3 × 240 s per device | Needs the named devices and a physical route | §5 protocol |
| Dropout detection on a real capture | Needs loopback/OS capture per device, plus its induced-overload positive control | `detectDropouts()` from `benchmarks/audio/dropoutDetector.mjs` |
| Listening review | No reviewers or level-matched sessions yet | — |
| In-browser listening by the implementer | No server was started (AGENTS.md) | the user can run `npm run dev`, open a Vision Jet flight, then Settings → Sound → Enable sound |

## 6. Blockers and owners

| Blocker | Owner | Action |
| --- | --- | --- |
| Low/Med qualification on iPhone SE (2nd gen), Pixel 6a, MacBook Air M1 | Perf | Run §5 (real time, soak, 3 × 240 s, both rates, both bridges where applicable). Add `QUALIFIED_PROFILES` entries only from those records. |
| Per-callback DSP timing inside AudioWorklet | Perf / DSP | Choose a calibrated clock or browser/OS traces (§5.4). Until then the app shows DSP p95 `n/a` and cannot shed on timing. |
| Validated dropout detector on each route | Perf | Loopback capture plus an induced-overload positive control per device, kept apart from qualification results |
| Headless worklet check | Perf | Provide Playwright (above) and record the browser build |
| Licensed Tier 3 bank | Release | Own or commissioned recordings with explicit redistribution rights; manifest per `audioBank.ts`; no Recordist material |
| High realism review over Med | DSP | Level-matched review across idle, acceleration, cruise and shutdown, once a bank exists |
| FJ33 blade counts, shaft RPM, bypass calibration, buzz-saw onset | FDM | Evidence required before any frequency or gain stops being a placeholder |
| Combustion rule for starvation and relight | FDM | Traces for both; the rule is validated on start, abort and shutdown only |
| Cockpit −18 dB / 1.2 kHz, exterior treatment, mix balance | DSP | Listening review at idle, high thrust and cruise |
| iOS silent switch, Bluetooth, route changes, interruptions | DSP / Perf | Device tests (§3 lifecycle) |
| SAB bridge in a deployed cross-origin-isolated host | Release | Verify COOP/COEP/CORP end to end; the static host uses the port bridge |
| Half-rate synthesis | DSP | Enable only after a measured, resampler-inclusive cost win |
| Tier X | DSP / Release | Corpus, licence and cost gates (§4); not started |
| Generated sweep JSONL | — | Lives under gitignored `build/benchmarks/audio/`; commit the generator and `sweep.jsonl.sha256` |

## 7. Known limitations

- The app's stats line shows DSP p95/max and RAM as `n/a`: there is no per-block timer or resident-memory reading.
- View mode is binary (third person = exterior) with 10 ms smoothing; there is no designed crossfade in the app.
- The propagation delay is the pilot's *view* distance at the moment the tap was last seated, not a live
  reading of it. For a rigidly parented camera that absolute lag has no listener to be wrong for; for a
  detached listener it is kept honest by the Doppler rate. A published velocity that disagrees with the
  published positions would let it drift, bounded by the 0.5 s line (§13).
- Ground reflection uses a 2 × height-above-ground approximation.
- Simulation speed k = 1 only.
- A stopped engine still makes sound that rises and falls with airspeed. JSBSim's `FGTurbine::Off()` windmills
  N1 toward qbar/10 and N2 toward qbar/15, and the sound follows that, so engine tones appear only when moving
  fast. The panel's engine telemetry line shows whether the engine is burning, windmilling or stopped.
- Crash and ground-contact physics (no ground friction or rotational damping after an impact) are flight-model
  issues outside this work. They change what the sound follows, not how the sound is produced.
- The 33 ms render lag has not been measured against 30 Hz displays, where physics steps arrive in bursts.

## 8. Reviewer change summary

**New**

- `src/flight/audio/dsp/`: C++ core, `audio-dsp.wasm`, provenance.
- `src/flight/audio/worklet/dspProcessor.js`.
- `src/flight/audio/`:
  - `audioSnapshot.ts`, `audioTransport.ts`, `jsbsimAudioAdapter.ts`, `audioPose.ts`
  - `audioSettings.ts`, `audioQuality.ts`, `audioBank.ts`, `audioAssets.ts`
  - `createFlightAudio.ts`, `dspHarness.ts`, `legacyTireAudioGraph.ts`
  - tests for each
- `src/flight/hud/SoundSettingsPanel.tsx`.
- `src/flight/hud/engineMonitor.ts`, `engineMonitor.css`, `engineMonitorModel.ts`, and their unit, DOM and real-SDK tests.
- `scripts/build-audio-wasm.mjs`, `scripts/verify-audio-artifact.mjs`.
- `benchmarks/audio/`: generator, committed SHA-256, renderer, schema, dropout detector, headless worklet check, tests. The JSONL fixture is generated under `build/benchmarks/audio/`.
- `docs/validation/evidence/audio/`:
  - start trace, geometry, property catalog
  - offline sweep and fault-injection proxy results

**Added by §13 (2026-09-16).**

- `src/flight/audio/cameraZoomAudio.integration.test.ts`: the real chase camera through `audioPose` into the
  real WASM, covering camera-zoom pitch, level at range, genuine Doppler, and Low and cockpit as controls.
- `docs/validation/evidence/audio/camera-zoom-med-2026-09-16.md` and
  `offline-sweep-proxy-2026-09-16.json`.
- `src/flight/audio/dsp/core.cpp` and its rebuilt WASM and provenance; `docs/sound.md` §2's storage-cap clause.

**Modified.** These tracked files also carry pre-existing, unrelated uncommitted changes, which were kept;
their diff stats include that work.

- `src/flight/createFlightSimApp.ts`:
  - settings store and facade; SF50-only adapter attach
  - `publishStep()` before the wheel guard; `updateView()` per frame; `beginEpoch()` on reposition
  - `onSoundAction`; `sound` in the panel snapshot
  - audio disposed before JSBSim; tire cue constructed on the shared runtime
  - engine monitor created under the evaluation readouts, updated every frame, destroyed on teardown
- `src/flight/hud/FlightControlPanel.tsx`: new Sound tab; `sound` snapshot field; `onSoundAction` option.
- `src/flight/audio/createTireAudio.ts` and its test: now a view onto the shared runtime; curve kept;
  the old graph moved to `legacyTireAudioGraph.ts`.
- `package.json`: `build:audio` and `verify:audio`; `build` runs audio verification.
- `benchmarks/wheels/tireAudioOffline.entry.ts`: imports the legacy graph from its new module.
- `docs/sound.md`: implementation status block; tire-migration sentence updated.

## 9. Pilot test session, 2026-09-14

One in-browser session by the project owner on the development machine. This is feedback, not a qualification run.

| Report | Finding | Action |
| --- | --- | --- |
| Loud static in a 300 kt dive | Airframe wind noise: white noise above 250 Hz, up to about 16 dB louder than the idle engine and unfiltered in chase view. | Retuned to a speed-shaped roar, about 18 dB quieter at 250 kt, with its own "Airframe wind volume". Tests check the spectrum. |
| No difference between Low and Med | Med never ran: an explicit Med request with no device evidence falls back to Low. | First a session checkbox. It did nothing with Auto selected and the pilot still could not run Med, so it became a **"Run Med anyway (testing)"** button that appears when Med is chosen. **Not yet re-heard by the pilot.** |
| Sound cut in and out after a crash; engine sound stopped when slow | **Audio:** terrain/contact holds paused all audio and every release reset the core; telemetry re-anchors faded up from silence. **JSBSim:** an engine that is off windmills with airspeed, so its tones only appear when moving fast. | Holds split (terrain/contact holds only the tire cue), context suspension waits 1.5 s, re-anchors no longer fade. Engine monitor added. **Whether and why the engine stopped in that crash is not known.** |
| After the crash the aircraft kept rolling | No ground friction or rotational damping after an impact. | Flight-model work outside sound. Not investigated. |
| "I need to see what the engine is actually doing" | — | Engine monitor on the flight display; Sound moved to its own tab. |

## 10. Upstream candidates

Per the [JSBSim contribution policy](../jsbsim-upstream-contribution-policy.md), only fully baked, generally useful work goes upstream.

| Candidate | Target | State | Why it is not a PR yet |
| --- | --- | --- | --- |
| Publish FGTurbine's internal phase, `Cranking`, starvation, and the EGT, oil pressure, oil temperature, EPR and nozzle position it already computes, as read-only properties | `Felipegalind0/jsbsim`, then `JSBSim-Team/jsbsim` | **Not implemented.** Found while building the engine monitor: `FGTurbine::bindmodel` ties only N1, N2, injection, seized, stalled, bleed and N1/N2 limits. JSBSim's own source comment calls `Cranking` a "signal for sound effects". | No code or tests yet. Names and units need settling against upstream conventions, and the readiness gates need native and real-WASM tests. It **should** go upstream once done: sound, cockpit gauges and diagnostics could then read the phase instead of inferring it. That would retire the monitor's derived phase and the audio adapter's fuel-flow combustion rule. Tracked in the policy's candidate ledger. |
| Audio core, transports, bank cache, dropout detector, sweep tooling | none | App-level | No upstream project owns browser flight-sim audio. foss-earth is the globe/terrain runtime, and nothing there was changed. |
| Engine monitor HUD | none | App-level | Depends on this app's HUD and sound status. Its reusable core is the JSBSim property work above. |

## 11. Pending work

In a suggested order:

1. **Pilot re-test of this session's fixes:**
   - wind level
   - Med through the testing button
   - sound after a crash with the new holds
   - the engine monitor's phase and transitions log during a crash
   - and, from the 2026-09-16 session, the camera-zoom pitch bend at Med (§13): scroll in and out in chase
     view and say whether anything is still wrong
   - all of it now has a home in the pilot instrument: [test card](sf50-pilot-test-card.md) Card 8, with the
     switch-on steps in "Before you start"
2. **Crash and ground-contact physics.** No friction or rotational damping after an impact (flight model).
3. **If the engine stops in a crash, find out why.** The transitions log shows `running`, `cutoff`, `fuel on board`, `seized` and `stalled` changes with sim time.
4. **Flight recorder engine channels.** Add running, cutoff, starter and qbar so a saved CSV explains engine state. Not done: the recorder's columns feed pilot-evaluation tooling, so check those consumers first.
5. **Qualification** (§6): named devices, per-callback timing, the dropout detector on real routes, and the headless worklet check (needs Playwright).
6. **Listening review and FDM evidence** (§6): mix balance, cockpit treatment, FJ33 shaft orders, starvation and relight traces.
7. **JSBSim turbine property exposure** (§10).
8. **Engine state after a reset (engine defect).** Found 2026-09-14. When a location is applied with the engine shut off, fork.7 brings the SF50 out of RunIC at N2 81 % and 344.7 lb/h. The adapter reads that as combustion for a few steps, then the spool winds down. The cause is JSBSim PRs #1505/#1508, not the audio code. Do not mask it here; see [the open PR review](jsbsim-open-pr-review-2026-09-14.md).
9. **Decisions:**
   - `build/benchmarks/audio/sweep.jsonl` (5.2 MB) is generated and gitignored with the rest of `build/`. Regenerate it with `node benchmarks/audio/generate-sweep.mjs`; its hash is in `benchmarks/audio/sweep.jsonl.sha256`.
   - A licensed Tier 3 bank.
   - Tier X.

## 12. Notes worth retaining

**Build and ABI**

- **Any change under `src/flight/audio/dsp/`** needs `npm run build:audio` (Homebrew `emcc` 6.0.9), then commit the WASM with `audio-dsp.provenance.json`. `npm run build` refuses a WASM whose sources or hash drifted.
- **The Med delay line carries pitch.** Anything that changes how fast `gDelaySamples` moves is a pitch change,
  whatever it looks like in the source. Distance may seat that tap; only the Doppler ratio may move it (§13).
- **The 0.5 s delay cap bounds storage, not audibility.** The direct tap pins at it; only the ground-image tap
  fades there. Level at range belongs to `min(1, 1/d)` alone, at every tier (§13).
- **The zoom defect was already forbidden in writing.** `sound-implementation-prompt.md`'s scene-graph row
  asks to "cover view changes from keyboard/gamepad, panel and phone, without Doppler spikes on origin shifts
  or teleports". The requirement was there from the start and simply had no test behind it, which is why it
  survived to a pilot. Worth remembering when a spec line has no named check next to it.
- **The snapshot ABI** is `dsp/snapshot.h` ⇄ `audioSnapshot.ts`. `audioSnapshot.test.ts` and `benchmarks/audio/renderSweep.mjs` parse the header. The worklet keeps its own constants, which the ABI test checks.
- **Changing an export signature** (as happened to `osfs_audio_set_gains` for airframe gain) means updating the worklet, `dspHarness.ts`, the tests and `renderSweep.mjs` together.

**JSBSim behaviour that explains what you hear**

- JSBSim returns 0 for a property that does not exist. Check the catalog with `sdk.queryPropertyCatalog`, on the SDK object, not `sdk.exec`.
- Fuel burns during a start before `set-running` latches, which happens at idle N2.
- A start needs cutoff off, N2 > 15 %, and the starter or qbar > 30 psf.
- An engine that is off windmills N1 → qbar/10 and N2 → qbar/15.
- Seize, stall and starvation override everything.
- The fixed-step loop catches up at most 6 steps, so a main-thread stall leaves simulation time permanently behind the audio clock. The core re-anchors on fresh but late telemetry.

**Behaviour to keep**

- Pause and loading hold all sound; terrain and contact holds silence only the tire cue.
- Engine sound is Vision Jet only; the C172 gets the tire cue alone. Tire sound and its volume live in Settings → Ground interaction.
- Nothing is qualified. Offline timings are proxies, and `QUALIFIED_PROFILES` stays empty until real device records exist.

**Environment**

- Unrelated baseline failures as of 2026-09-14: 9 tests in `createFlightSimApp.test.ts`, `createFlightSimApp.phone.test.ts`, `input/gamepadProfiles.test.ts` and `loading/createFlightLoadingScreen.test.ts`. **Gone as of 2026-09-16:** `npx vitest run` is 980 pass / 106 files / 0 fail.
- To hear it: `npm run dev`, fly the Vision Jet, open the Sound tab, click Enable sound. Agents do not start servers (AGENTS.md).
- **The sound commit contains only the sound hunks** of `createFlightSimApp.ts`, `FlightControlPanel.tsx` and `package.json`. The autopilot, gamepad and phone changes in those files, and their untracked files, were left uncommitted in the working tree.

## 13. Camera-zoom pitch bend at Med, 2026-09-16 (fixed, software-verified)

Pilot report: *"when i have the engine sound in mid and i zoom in and out of the plane the engine sound bugs
out."* Full record, including the configuration it was reproduced under and every before/after measurement:
[`evidence/audio/camera-zoom-med-2026-09-16.md`](evidence/audio/camera-zoom-med-2026-09-16.md).

**What it was.** Med's propagation delay read its length straight off the source distance, through a 60 ms
smoother. A delay line's pitch comes from how fast its read pointer travels, so distance was being heard as
speed. `zoomChaseCamera` multiplies the chase range by `exp(0.2)` per wheel notch inside a single frame with
no easing, so one notch from the default 14.17 m range shifted the engine about 2.8 semitones flat, and a
scroll of eight notches took it down by a factor of 3.2 — measured as a dominant frequency falling from
1000 Hz to 310 Hz and gliding back over ~400 ms. Wide enough steps drive the read pointer backwards.

`audioPose.ts` reports both cameras as rigidly parented, so the modelled Doppler ratio was exactly 1 while
the geometry said the listener had jumped tens of metres. The ratio handed to the partial anti-alias cull was
that same 1.0, so a zoom-in also folded shifted partials back down the spectrum. Only Med and above run this
code, which is why the pilot heard it on "mid" and not on Low.

**What changed** (`dsp/core.cpp` only). The tap advances by `1 - doppler` per sample and by nothing else;
distance seats it, never moves it. It is seated from the retarded range `d / (c + range rate)` and re-seated
only where that is free: at an epoch, at a tier change, and while the direct path is faded out past the cap.
The range fade now follows geometry directly and is de-zippered at 10 ms. The 60 ms delay smoother is gone.
Distance gain, absorption, panning, the ground-image tap, the 0.5 s cap, Low and the cockpit installation are
untouched.

**Evidence.** `cameraZoomAudio.integration.test.ts` drives the real chase camera through `computeListenerPose`
into the real WASM — no facade mock. Four of its seven tests fail on the `c1405f0e` binary (scroll out 0.268
against a 0.8 floor, scroll in 1.785 against a 1.25 ceiling, digital silence at the 500 m zoom clamp against a
1e-5 floor, and a closing detached listener at 1.075 where the model says 1.412) and all seven pass on the
rebuilt one. Full suite 981 pass / 0 fail; `npm run build`
exit 0; lint unchanged (its 5 errors are unrelated HUD work in `LoggingPanel.tsx` and `evaluationInstruments.test.ts`). The sweep proxy was re-run at 3
repeats into [`evidence/audio/offline-sweep-proxy-2026-09-16.json`](evidence/audio/offline-sweep-proxy-2026-09-16.json):
zero non-finite samples, every peak inside the ceiling, Med p95 0.0454–0.0463 ms, every fault counter
identical to the old binary, every Low row identical to the last digit.

**Follow-on the same day: Med went silent past ~144 m.** Pilot: *"in real life you can hear a jet engine
500m away no?"* Yes, and sound.md §3's `min(1, 1 m/distance)` already said so with no cutoff. The silence was
§2's delay-storage guard leaking into the level path: the **direct** path was faded once the geometric delay
passed 0.42 s, which gated on delay rather than distance (so the threshold moved with the speed of sound —
144→165 m at sea level, 124→142 m at 35,000 ft) and cost 21 dB over 21 metres before stopping. After the zoom
fix the guard was also unnecessary there, because the tap no longer follows the view. The direct tap now pins
at the cap instead: it keeps the right sound at the right level and loses only an absolute propagation lag the
ear has no reference for. The ground-image tap still fades, because a reflection pinned to the cap would comb
at a spacing the geometry never asked for. sound.md §2's clause was rewritten to say the cap bounds storage,
not audibility. Med now tracks Low across the whole 8…500 m zoom range at a constant −3.3…−3.5 dB, both at
6 dB per doubling; at the 500 m clamp Med is −36.1 dB against Low's −32.8 dB where it used to be digital
silence.

**Still open.**

- **Nothing is qualified and nobody has listened to the fixed build.** Med still needs "Run Med anyway
  (testing)" to be effective at all.
- **The pilot's artefact is not confirmed to be this one.** Worth asking on a re-test whether it was a pitch
  bend and whether it tracked the scroll in both directions.
- **Whether −36 dB at the 500 m clamp is the right listening level is a mix question, not a physics one.**
  The app has no calibrated SPL, so audibility there follows the master gain. Mix balance is already listed
  as barely tuned (§4.9).
