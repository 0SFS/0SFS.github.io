# Aircraft browser sound: implementation and acceptance plan

Implementation handoff: [sound-implementation-prompt.md](sound-implementation-prompt.md) provides the assignment, repository entry points, work packages and delivery evidence. This document remains the source for technical budgets and release gates.

Build selectable sound for the Cirrus SF50's Williams FJ33-5A and F-35B's Pratt & Whitney F135: **Off → Low → Med → High**, with automatic reduction when observed load exceeds the selected budget. High uses engine-specific procedural components and directional spectra; crackle and recorded residuals are separate future extensions. The implementation scope and acoustic qualification gates are in [High aircraft sound](proposals/high-aircraft-sound.md). Neural synthesis stays outside the shipping ladder.

The F-35B also uses this sound owner and the existing procedural core, with an
explicit approximate F135 main-engine definition (§7). Engine identity,
aircraft installation and renderer selection are separate contracts (§2).
The SF50 values and acoustic assumptions below remain its original reference
design; they are not F135 data.

**Status: design, not measured performance.** Resource ceilings, thresholds, test inputs and acoustic tuning values below are proposed engineering budgets or assumptions, not FJ33 measurements. Model values are identified separately. Owners are implementation roles: **DSP** owns synthesis/tuning; **FDM** owns aircraft properties/calibration; **Perf** owns device measurements; **Release** owns assets/licenses/hosting. Assign people before implementation. Unfilled results remain **TBD** until their owner's stated gate passes.

**Implementation status.** Off, Low and Med are implemented in the flight app on an AudioWorklet + WASM core and are **software-verified** (real-WASM renders, real-JSBSim adapter tests, offline sweep and fault-injection proxies). The 2026-10-05 High revision replaces the required recording bank with procedural component synthesis for both engines; the [implementation ledger](validation/audio-implementation-ledger.md) records its current checks and artifact hashes. On 2026-10-07 the owner confirmed listening validation of **Low, Med and High** and requested normal use without validation warnings. Sound now defaults **on at Med**, starting from the first normal browser-permitted interaction; explicitly saved Off remains Off. Auto chooses the highest supported tier and retains resource limits and fault fallback. Named-device performance qualification remains a separate evidence record; no benchmark or device pass is inferred from listening acceptance. Tier X is not implemented. An engine monitor on the flight display shows live engine state and what the audio core hears. Med's spatialisation was corrected on 2026-09-16 after a pilot report: its propagation delay line took its length from the camera distance, so a chase-camera zoom was heard as listener motion and bent the engine by up to two octaves, and the §2 storage cap was silencing the direct path past about 144 m. The delay tap now moves only with the modelled Doppler ratio, and level at range is §3's `min(1,1 m/distance)` law at every tier. Per-tier status, commands, hashes, pilot feedback, upstream candidates, pending work and owner blockers: [audio implementation ledger](validation/audio-implementation-ledger.md).

## 1. Tier ladder and resource envelopes

Use AudioWorklet + WASM DSP for every audible tier. Tier 0 allocates no sound graph. For a 128-frame quantum, `Q = 1000 × 128 / sampleRate`: **2.902 ms at 44.1 kHz**, **2.667 ms at 48 kHz**. The deadline covers the entire audio graph, not each node separately. Read the actual output length in `process()` rather than hard-coding it. [Web Audio rendering model](https://www.w3.org/TR/webaudio-1.0/#rendering-loop).

Caps cover one aircraft, one listener, stereo output, the tire cue, spatial effects and transitions. No traffic aircraft or duplicated cockpit/exterior engines are included. Oscillator/noise counts include the tire cue's one oscillator and one noise source. Grains are simultaneous voices; noise sources may feed several filters. KiB/MiB are binary units.

| Tier / setting | Worst-case synthesis and effects | Cold download ceiling, including JS/WASM/config | Audio-owned resident / loading peak ceiling | p95 per 128 frames; % of Q at 44.1 / 48 kHz |
| --- | --- | --- | --- | --- |
| **0 / Off** | 0 oscillators, noise sources, grains or convolvers; visual status cues | 0 incremental sound bytes; UI belongs to app shell | 0 / 0 incremental DSP RAM | **0 ms; 0 / 0%** |
| **1 / Low** — procedural-lite | 5 oscillators, 6 noise sources, 9 biquads; 0 grains, 0 IR; simple stereo, distance, cockpit muffling, limiter | **160 KiB** Brotli-compressed code/config; **0 recorded assets** | **8 / 12 MiB** | **≤0.12 ms; 4.1 / 4.5%** |
| **2 / Med** — procedural-full | 13 oscillators, 7 noise sources, 16 biquads; 0 grains; 1 mono partitioned convolver, **20 ms IR**, ≤1,024 padded taps; 1 ground-reflection tap | **256 KiB** total compressed code/config; **0 recorded assets**, generated IR | **12 / 20 MiB** | **≤0.25 ms; 8.6 / 9.4%** |
| **3 / High** — procedural components | 13 oscillators, 9 noise sources, 16 biquads plus 1 first-order filter; **0 grains**; engine-specific components and spectral directivity; 1 mono convolver, **40 ms IR**, ≤2,048 padded taps | **256 KiB** total compressed code/config; **0 recorded assets**, generated IR | **32 / 64 MiB** | **≤0.45 ms; 15.5 / 16.9%** |
| **X / Experimental** — disabled flag | Admission cap: **1 model instance**, plus prepared Low within combined caps of **13 oscillators, 6 noise sources, 0 grains, 1 IR ≤20 ms** | **≤8 MiB** total code/weights/assets; model, codec and duration **TBD, DSP + Release** | **64 / 96 MiB** | Inference + DSP **≤0.45 ms; 15.5 / 16.9%**; no demonstrated implementation |

Noise counts include the shared tire source: Low has five engine/airframe streams plus tire, Med six plus tire, and High at most eight plus tire. The Low filter count corrects previously understated accounting. These corrections do not certify the existing timing budgets. High's memory and timing ceilings remain conservative provisional limits until measured.

An optional future residual bank may use the previous extension envelope: ≤1.5 MiB compressed assets/manifest, ≤12 concurrent mono grains, ≤160 starts/s and 20–60 ms windows, within the same combined timing/memory limits. It is not part of delivered procedural High. No clips have been acquired or cleared; bank failure must leave procedural High running. Do not activate that extension until its complete source count, decoding peak, provenance and listening benefit are verified.

Resident ceilings include audio buffers, fixed WASM memory, PCM, FFT scratch, queues, delays and tire audio; peaks include decode/copy overlap. Report browser-process baseline/delta separately because native overhead is not fully observable. The [tire cue](../src/flight/audio/createTireAudio.ts) now plays through the shared worklet and WASM core rather than its own context, so these totals include it; they remain uncertified.

**Headroom gate:** observed maximum tier time ≤2× its p95 budget; total graph p95 ≤25% of Q; total graph maximum <50% of Q; zero observed output dropouts during qualification. These are conservative release targets, not scheduler guarantees. Compared with audio off, proposed acceptable p95 frame-time regression is ≤5%, with no additional missed physics steps. Audio shares cores, memory and thermal capacity with physics/rendering. Perf must measure the integrated simulator.

### Admission, exit and degradation

Admission requires the concrete browser/renderer capabilities and the tier's resource caps. Listening validation and measured device performance remain distinct records.

**Owner decision, 2026-10-07:** Low, Med and High are validated by listening. Remove routine missing-evidence and calibration warnings from their normal controls; retain actual unsupported-capability, processor and overload messages. Med remains the default quality, sound defaults on, and Auto selects the highest supported tier. Procedural High requires no bank. §5 still defines the separate protocol for any measured performance claim. This supersedes the earlier UI/Auto qualification policy, without changing recorded evidence. Record: [implementation ledger](validation/audio-implementation-ledger.md#20-listening-acceptance-and-default-on-sound-2026-10-07).

| Tier | Entry | Exit / cheaper destination |
| --- | --- | --- |
| 0 | User mute, autoplay blocked, missing AudioWorklet/WASM, failed Low, paused/background audio | First normal interaction and successful initialization → requested supported tier |
| 1 | AudioWorklet/WASM available, within the selected resource caps | Shedding; persistent overload or processor failure → Off |
| 2 | AudioWorklet/WASM available and Tier 2 caps; default quality | Shedding; continuing overload → Low |
| 3 | Med capabilities plus compatible engine-specific procedural setup and Tier 3 caps; explicit High or Auto | Shedding; continuing overload or runtime/memory failure → Med |
| X | Explicit `audioExperimental` flag; cleared data/model and separate qualified experiment manifest | Any budget miss, starvation or unsupported backend → prepared Low; never enter X automatically |

Normal shedding order is **oscillator count → optional residual density → IR length → internal sample rate**, skipping absent features. Reduce engine oscillators `12 → 8 → 4 → 2`, retaining N1/N2 fundamentals; preserve the tire cue. Any future grain extension reduces grains `12 → 8 → 4` and starts/s `160 → 100 → 50`. Fade IR length `40 → 20 → 10 → 0 ms`. Last, try half-rate source synthesis, **22.05/24 kHz**, with anti-alias filtering and resampling to the unchanged context rate. Enable half-rate only if its resampler-inclusive cost is measurably lower. Then drop a tier; Low eventually mutes. These intermediate states are not full-quality tier claims. The pilot may lower source/partial counts and IR duration per tier (`osfs.sound.<tier>.*`, bounded by the table above); controls show counts or milliseconds, bounds, defaults and their cost. A noise cap must actually skip the corresponding source processing. Shedding starts from the pilot's caps.

Proposed controller: use a **2-second** rolling distribution where timing exists; shed after **two consecutive** over-budget windows. A measured deadline miss or actual output-underrun increment triggers an immediate tier drop, bypassing incremental shedding. Never delay further downgrades while overload persists. Lock out upgrades until **60 seconds** without observed faults, then allow explicit re-test from settings; never upgrade automatically during flight. Fade changes over **50 ms** within existing voice caps; under severe overload fade down, switch and fade up instead of running two engines. Low must remain executable without fetching/compiling during ordinary shedding. A fatal `processorerror` cannot recover inside that node: enter Off, recreate from the loaded/compiled module, then offer a bounded Low retry; stay Off if initialization fails.

**Observability limit:** no portable API supplies per-block CPU and output dropouts everywhere. Auto's supported-tier choice does not establish deadline performance. Shedding acts only on observed load/faults; an absent metric remains unknown. Exact hardware/OS/browser-build/output-route/sample-rate/transport profiles remain performance evidence, separate from tier availability. Never infer certification from a user-agent string. Processor errors, stale telemetry and context state are fault signals, not proof of deadline misses. Retain manual Low/Off and user resource controls. Perf owns this gap before any claim of universal automatic deadline protection.

## 2. Architecture and static hosting

Implement a **purpose-built turbofan core** in repository-owned C++ compiled to WASM. No external synthesis library is selected; there is no claimed library version or WASM readiness. DSP must commit the core, lock the compiler/toolchain and record flags/WASM hash before qualification. Use a scalar baseline; SIMD is a separately measured variant.

### Engine identity, installation and renderer contract

0sfs owns aircraft sound composition. The current implementation separates
three inputs:

- [`engineAcousticDefinitions.ts`](../src/flight/audio/engineAcousticDefinitions.ts)
  defines an open engine identity, manufacturer family, broad physical
  `engineClass`, native telemetry schema, explicit renderer ID and
  renderer-specific parameter data. Class is descriptive metadata; it does
  not choose an algorithm or binary.
- [`aircraftAudioProfiles.ts`](../src/flight/audio/aircraftAudioProfiles.ts)
  is the installation registry and the only audio module importing aircraft
  IDs. It declares source IDs, native engine indices and source-location
  policy. Engine definitions and renderers contain no aircraft-ID branches.
- [`audioRendererRegistry.ts`](../src/flight/audio/audioRendererRegistry.ts)
  selects the WASM URL, worklet URL/processor, dynamics ABI, parameter encoder,
  admitted native schema/classes and source capacity. Setup checks every
  parameter against that renderer's bounds before accepting an engine.

The Williams FJ33 belongs to Williams' FJ33/FJ44 product family; the P&W F135 is
a separate engine family derived from the F119. Both are broadly turbofans.
Their explicit assignment to `procedural-jet-v1` means only that the current
approximation can render each definition's data. It does not establish
equivalent spectra or transfer FJ33 calibration to F135.
[Williams fanjet family specification](https://www.williams-int.com/wp-content/uploads/2026/01/Fanjet-Family-Specsheets-IND-11262018-01222026.pdf),
[P&W F135 lineage and variants](https://filecache.mediaroom.com/mr5mr_prattwhitney/177487/download/F135-engine-S16208.pdf).

Separating component prediction, installation and propagation is consistent
with [NASA's ANOPP2 framework](https://software.nasa.gov/software/LAR-18567-1).
NASA's [fan-noise modeling work](https://ntrs.nasa.gov/citations/20150000884)
uses measured fan geometry, operating conditions and directivity. These
sources support the architectural separation as an engineering inference;
they do not validate this procedural renderer or its 23 tuning values.

The facade reuses transport, timestamps, output, spatial telemetry, holds,
resource controls and lifecycle management. Compiled modules are cached by
binary URL and ABI. The native adapter expands the installation's engine
index into schema paths, validates required catalog capabilities and initial
finite values, and preserves raw physical units. Required telemetry loss
mutes the engine contribution while reads continue for recovery. Optional
observers remain unavailable when absent. Native global starter/cutoff
commands are attributed only when their selection scope identifies this
engine; an all-engine command is ambiguous on a multi-engine model. The SDK
currently exposes no native engine-type/count descriptor: admission checks
the declared engine class and catalog, not a verified native type.
The turbine schema also owns the fuel-flow/running combustion interpretation
and its threshold; the existing threshold is SF50-trace-led, and F135
start/abort/relight behavior still needs independent validation.

`procedural-jet-v1` currently supports **one engine source**, the implemented
dynamics ABI and turbine schema. Unknown renderers, incompatible ABI, missing
parameters, unsupported classes and multiple installed sources are rejected.
There is no engine-zero or FJ33 fallback. Separate piston, turboprop,
turboshaft, LiftFan and multi-engine rendering are not implemented. A new
renderer supplies its binary, worklet, setup encoder and required native
telemetry contract; a different dynamics payload needs an implemented ABI
bridge before admission. Adding an aircraft then declares its installation
without adding aircraft branches to the renderer. Multi-source support also
needs source budgeting/mixing and airframe noise generated once per aircraft:
wind/configuration sound currently lives inside the one turbofan voice.

The optional bank infrastructure's manifest **V2** names an engine definition and renderer. The
validated identity stays attached through loading, resampling and installation;
another engine's bank is rejected before samples transfer. Engine replacement
clears installed samples. Replacement requests cancel prior promises and ACKs
carry a request generation plus band index, so stale replies cannot admit a
new bank. No bank ships. Procedural High does not use this bank path; these checks qualify neither its synthesis nor a device.

Signal path: `timestamped FDM/camera state → interpolation → engine-specific tones/noise and directional shaping → installation/cabin filters → spatial mix → compressor/limiter → stereo`. All synthesis, filters, convolution and resampling execute in the worklet's WASM core. Fetch and compile before activation; preallocate memory/voices/queues. No memory growth, locks, waiting, logging, promises or decoding in `process()`. Optional future residuals must join this path without duplicating its source, propagation or cabin treatment. WASM does not eliminate browser/JS GC or scheduling stalls. [Chrome AudioWorklet guidance](https://developer.chrome.com/blog/audio-worklet-design-pattern).

Use a 128-frame partitioned overlap-add convolver; retain FFT overlap, oscillator phase and filter state between callbacks. Cap ground/distance delay storage at **0.5 seconds per mono path**. That cap bounds storage, not audibility. Med/High preserve sustained Doppler at the history boundary by handing over between two moving taps with complementary raised-cosine weights; pinning a tap would lose the frequency shift. This bounded-history approximation sacrifices exact propagation age and may produce brief broadband energy dips or interference between periodic components during handover. It does not model sonic booms. Level at range stays with the §3 `min(1,1 m/distance)` law at every tier. Fade ground-image taps whose requested path difference exceeds available history, rather than pinning a reflection to an incorrect path difference. Include partition and transition costs in measurements. Preserve independent tire volume, pause/background suspension and terrain/physics-fault holds while migrating its existing lifecycle.

### Telemetry bridge

Add a dedicated property-catalog-checked audio snapshot adapter; current live flight state lacks N1/N2 and startup state. Use the installed SDK's property batching, reject nonfinite values, and mark missing fields unavailable rather than zero. Publish after accepted physics steps at **60 Hz**, with simulation/presentation timestamps, sequence and reset epoch. JSBSim currently steps at **120 Hz**; decimate snapshots, not physics, and never tie publication to HUD/render cadence. [Fixed-step loop](../src/flight/physics/fixedStepLoop.ts).

- **Optional SAB:** HTTPS, `crossOriginIsolated === true`, `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Cross-origin resources need appropriate CORS/CORP. Release verifies deployed modules, terrain/CDN resources and embedding. Headers come from the host/CDN; HTML meta tags do not substitute. [Isolation deployment](https://web.dev/articles/coop-coep).
- **SAB synchronization:** bounded single-producer/single-consumer snapshot ring; publish ownership/indices through integer Atomics. Never overwrite a slot being read; coalesce continuous updates when full. Copy committed snapshots into fixed WASM state. Never call `Atomics.wait()` or spin on the audio thread.
- **Default static-host fallback:** direct MessagePort with **three transferable ArrayBuffers** representing producer/consumer/in-flight ownership. Return buffers after copying; coalesce continuous state when all are busy. No SAB or cross-thread Atomics is required. Both transports retain timestamped discrete engine transitions in a **32-event** bounded queue; overflow triggers resynchronization and a diagnostic, not silent loss of ignition/shutdown. DSP validates this proposed capacity before admission. [Message transfer semantics](https://html.spec.whatwg.org/dev/web-messaging.html).
- **Interpolation/de-zippering:** render **two telemetry intervals (33.3 ms)** behind the presentation timeline and interpolate continuous targets at each audio sample. Initial gain/filter smoothing: `a = exp(-1/(Fs × tau))`, **tau = 10 ms**. Preserve phase; this is not extra physical spool lag. Apply discrete events at their timestamps. Hold the last valid target if a bracket is missing; after **250 ms** stale, fade to silence over **100 ms**. Resume/seek/reset clears queues and rebases clocks under a fade.

At each epoch, anchor simulation time `s0` to context time `a0`; a snapshot at `s` targets audio frame `round((a0+(s−s0)/k)×Fs)`, with simulation speed `k=1` for initial shipping support. Batched physics steps keep their distinct timestamps instead of all receiving the render-frame timestamp. Evaluate interpolation at `currentFrame−round(0.0333×Fs)`. A future speed change must create a new epoch/anchor; do not change oscillator pitch by multiplying RPM by `k`. Pause/resume rebases after suspension, discarding old queued events under the fade. Never compare raw simulation seconds with an unrelated wall clock.

Telemetry buffering, smoothing, convolution and hardware output add response delay; report contributions separately. They do not enlarge the callback's compute deadline.

### Download and cache contract

Load Low on enable and additional procedural code when its tier is selected/qualified. High has no required asset request. Keep Low available for fallback. Serve content-hashed immutable code/assets with HTTP/CDN caching; optional future banks may use IndexedDB keyed by hash and license-manifest version. Handle eviction/quota failure as cache misses, avoid duplicate decoded banks and provide clear-downloads for such assets.

Measure cold client transfer, warm HTTP cache, IndexedDB hits and steady RAM separately. Client download is not CDN-origin egress: estimate origin traffic from observed cache misses and tier adoption, not `all users × largest pack`. Revalidate manifest/license changes before reuse. Release publishes actual transfer/storage bytes.

## 3. Turbofan mapping and inexpensive realism

Generate independent synthetic N1/N2 tones, combustor rumble, fan/bypass turbulence and jet-mixing noise. Blade-pass harmonics require the separately verified RPM and blade-count inputs below. Keep spectra/gains independently controllable. High's engine-specific components, directional treatment and separate acoustic gates are specified in [High aircraft sound](proposals/high-aircraft-sound.md). Piston intake/exhaust simulator `enginesound` is not the turbine core; no code is imported. Neural Amp Modeler learns an audio-input-to-audio-output guitar-amplifier processor, not a telemetry-conditioned turbine source. A WASM port would not provide the missing model/data. [enginesound](https://github.com/DasEtwas/enginesound), [Neural Amp Modeler](https://github.com/sdatkinson/neural-amp-modeler).

The local [FJ33 configuration](../public/jsbsim-data/engine/fj33_5a.xml) sets **idle N1/N2 24.3/53.4%**, **max 100/100%**, **rated thrust 1,846 lbf**, **idle fuel 76 lbm/h**, and **bypass ratio 3.3**. Comments identify recorder/AFM provenance for the first values; they do not establish blade counts, shaft RPM or acoustic calibration. **3.3 is an unverified model assumption.** See the [SF50 property profile](../src/flight/jsbsim/fdmProfiles.ts).

Below, `clamp01` bounds to 0…1; `n1=N1/100`, `n2=N2/100`, `u=clamp01((N1−24.3)/75.7)`, `t=clamp01(thrust/1846)`. Gains are relative amplitude, not SPL. **Every proposed curve/frequency needs DSP listening/spectral calibration; physical unknowns belong to FDM.** Verify property presence and units against the installed artifact; bound properties are not necessarily in the current app snapshot.

| JSBSim property / adapter input | Audio parameter | Curve/range and evidence status |
| --- | --- | --- |
| `propulsion/engine[0]/n1` (%) | Fan pitch/harmonics/wake | Physical BPF = `bladeCount × ratedN1RPM × n1 / 60`; both constants **TBD, FDM: engine documentation + permitted tachometer-correlated spectra**. Initial synthetic reference `f=2500×n1 Hz`, tonal gain `(0.15+0.85u²)×clamp01(N1/24.3)`; not measured BPF. The sub-idle multiplier fades continuously to zero, rather than switching on an idle-level bed at the first rotating sample. |
| `propulsion/engine[0]/n2` (%) | Core/compressor whine | Rated N2 RPM and stage order **TBD, FDM**, same evidence plan. Initial synthetic `f=6000×n2 Hz`, gain `clamp01(n2)²`. Fade rotating tones to zero at standstill; cull partials above **0.45×internal Fs**, including Doppler shift. |
| `propulsion/engine[0]/thrust-lbs` | Jet-mixing noise | Amplitude `t^1.5`; low-pass `800+5200t Hz`. Thrust is a proxy, not an acoustic power law or altitude-correct exhaust model. |
| `propulsion/engine[0]/fuel-flow-rate-pps` (lbm/s) | Combustor rumble | `r=clamp01(flow/0.25)`, amplitude `sqrt(r)` when combustion is active; **40–400 Hz** band. **0.25 lbm/s** is tuning normalization, not a published maximum. Model idle is `76/3600` lbm/s. |
| `propulsion/starter_cmd`, `propulsion/cutoff_cmd`, read `propulsion/engine[0]/set-running`, spools/fuel | Off → motoring → light-off → running → rundown/coast/windmill | Starter/cutoff accessors expose native command state, not proof of combustion. Native `running` can remain false during fueled Start; **do not gate ignition solely on it**. Phase/combustion/windmilling are not directly bound. FDM must expose a trustworthy phase/combustion signal through the owning SDK or validate a fuel/spool/state adapter against start, abort, starvation and relight traces before acceptance. Audio never writes `set-running`. |
| N1/N2 history, fuel/state, `velocities/vtrue-fps` | Spool lag/windmilling | Follow FDM spools; **no invented fixed physical time constants** and no throttle-to-RPM substitution. FDM measures installed nonlinear model step responses against reference traces. With combustion off, retain rotating tones/wake and suppress combustor. Off-but-rotating is provisionally **coast/windmill**, not a confidently distinguished state. |
| No dynamic bypass property; config `bypassratio` | Core/bypass balance | Initial weight `3.3/(1+3.3)≈0.77` is artistic, **not an acoustic energy split**. FDM verifies ratio; DSP fits independent gains from legally usable recordings. |
| `velocities/vc-kts` | Airframe wind | `w=clamp01((KIAS/250)²)`, gain `w`, high-pass **250 Hz**. **250 kt** is a tuning reference, not an operating limit. *Implementation note:* after a pilot report of loud static in a 300 kt dive, the wind is shaped as a low-passed roar at a lower level and has its own volume control; see the [ledger](validation/audio-implementation-ledger.md). IAS is a pressure-related proxy, not physical propagation velocity. |
| `gear/gear-pos-norm`, `fcs/flap-pos-norm` | Gear/flap turbulence | Add amplitudes `0.3w×gear`, `0.2w×flap`, **60–600 Hz** band; positions 0…1. DSP/FDM compare fixed-speed configurations. Contact/slip keeps the separate tire cue. |
| Aircraft/camera pose + velocity (adapter); `velocities/v-north-fps`, `velocities/v-east-fps`, `velocities/v-down-fps`; `atmosphere/a-fps` | Placement/distance/Doppler | Rear acoustic center **TBD, FDM: check scene/model geometry**; current XML nacelle placement is approximate. Initial amplitude `min(1,1 m/distance)`. With unit vector source→listener, ratio `(c−vListener·n)/(c−vSource·n)`, safety clamp **0.5…2**. Use the same units/frame and air-relative velocities; rigid cockpit ratio is 1. |
| Aircraft/terrain geometry + view mode (adapter) | Cabin color/air absorption/reflection | Installation treatments below; these are not fictitious JSBSim audio properties. |

**Startup in every tier:** let `r=clamp01(N1/idleN1)` using the engine's own profile reference (FJ33 24.3%, F135 30%). Below idle, fan tones use `r` and fan/wake noise uses `r²`; N2 tones already use `(N2/100)²`. This leaves rotating machinery audible as it rises while eliminating the old idle-level static at nearly zero speed. The curves are synthesis choices, not measured sound-pressure laws. They do not decide combustion: the native fuel/running observer still controls lightoff, and a real F135 cold-start regression checks motoring and fueled Start before `set-running` becomes true. Idle-and-above source gains are unchanged. See the [startup validation record](validation/audio-implementation-ledger.md#18-continuous-startup-sound-2026-10-05).

**Buzz-saw is unverified for this FJ33 installation.** Do not enable a sawtooth above “80% N1.” Multiple pure tones depend on geometry/operating conditions, often transonic or supersonic relative tip flow; a percentage does not establish their presence. DSP/FDM must establish onset from geometry, RPM and permitted inlet recordings. [NASA fan-noise study, DOI](https://doi.org/10.2514/6.2024-3228).

Prioritize these treatments before more source complexity:

- **Cockpit/exterior:** Low places the engine behind the pilot; cockpit **−18 dB** gain and **1.2 kHz** low-pass are unverified starting values. Med/High add short cabin/airframe IR color. High uses engine-specific procedural cabin gain/filter parameters, still uncalibrated. DSP compares idle, high thrust and cruise separately in each view. Any future cockpit residual must avoid applying the recorded cabin transfer twice.
- **Exterior propagation:** Med/High apply Doppler to the whole source, including noise/grains, using variable resampling/delay; do not assume a panner implements it. Approximate air absorption with low-pass `18000/(1+distanceMetres/200) Hz`, clamped **500…18000 Hz**. One ground-image reflection uses path-difference delay and gain ≤**0.25**, fading when terrain is unavailable. Test flybys, teleports and ground motion.
- **Dynamics/accessibility:** all audible tiers include DC removal, soft-knee compression and a sample-peak limiter at **−1 dBFS**; provide reduced dynamic range and independent engine/tire volume. This is not calibrated SPL or a true-peak guarantee. Preserve visual engine/warning cues when muted.
- **Sample-rate independence:** derive phases, smoothing, filters, grain/IR durations from actual `AudioContext.sampleRate`; normally omit a requested rate. Decode/resample assets and regenerate IRs before activation. Test **44.1/48 kHz**; requested rate does not certify hardware routing or hidden resampling. Handle context recreation after route changes.
- **Lifecycle/iOS:** sound defaults on and creates/resumes synchronously from the first normal click/tap/key; saved preferences cannot bypass autoplay. Keep Tier 0 until running, without an extra enable action when the preference is already on. Explicit Off remains silent until enabled. Test silent switch, speakers/headphones/Bluetooth, interruptions and background/resume. `state===running` does not prove audibility. Do not use silent media loops to override browser policy. Any future Audio Session playback-mode choice needs explicit product behavior and device testing. [Chrome autoplay](https://developer.chrome.com/blog/autoplay), [WebKit silent-switch behavior](https://bugs.webkit.org/show_bug.cgi?id=237322).

## 4. Code, asset and neural release gates

The app is **AGPL-3.0-only**. Reimplement techniques from scratch; no Wwise, FMOD, unlicensed recordings or incompatible code/assets. Imported items require exact revision/hash, original source, compatible license text and notices in a release manifest. Download availability is not permission. No third-party core/model is approved here.

**Recordist SF50 recordings are excluded from embedding, redistribution and neural training.** The product's Single User Commercial License requires multi-user licensing for specified shared/network use; the current EULA expressly prohibits AI/ML training. It permits some game embedding under conditions, so do not call every embedded use categorically forbidden. This project's exclusion requires negotiated multi-user terms explicitly authorizing intended redistribution and any training before reconsideration; a purchase or generic multi-user label is insufficient. [SF50 product/license](https://therecordist.com/cirrus-vision-sf50-jet-sounds/), [current EULA](https://therecordist.com/company/eula/).

For FlightGear code with a verified **GPLv2-or-later** notice, elect GPLv3 through “or later,” then use GPLv3 §13 and AGPLv3 §13 to combine it with AGPLv3 code. This **one-way path into an AGPLv3-governed combination** preserves GPLv3 on the GPL portions and AGPLv3 on the AGPL portions; AGPL network-source requirements cover the combination. It does not permit downgrading AGPL-only code to GPL or blanket relabeling FlightGear. GPLv2-only lacks this path. FlightGear sound assets have their own licenses and need individual review. [FlightGear policy](https://www.flightgear.org/about/policy/), [GNU compatibility](https://www.gnu.org/licenses/gpl-faq.html.en#v2v3Compatibility), [GPLv3 §13](https://www.gnu.org/licenses/gpl-3.0.html#section13), [AGPLv3 §13](https://www.gnu.org/licenses/agpl-3.0.en.html#section13).

**Optional residual-bank gate — Release/DSP:** acquire own/commissioned recordings with explicit redistribution rights or individually verified compatible assets; retain releases, licenses and processing provenance. Validate that residuals improve the procedural High model without duplicating its source or propagation. This gate blocks only that future recorded extension. High's procedural implementation uses original code and no recording assets; no Recordist demos or unlabeled video extracts are admitted.

**Tier X blocker — Release/DSP:** no specific suitable CC0/public-domain turbofan training corpus has been verified. Defer DDSP/RAVE. Papers establish techniques, not FJ33 accuracy, training rights, a telemetry-conditioned model or browser-ready artifacts. [DDSP](https://arxiv.org/abs/2001.04643), [RAVE](https://arxiv.org/abs/2111.05011).

Before X, record corpus/weights/code licenses, exact commits, conditioning architecture, model hash, GPU-hours and training-cost ceiling (**TBD, DSP: bounded pilot-training proposal**), plus measured download/peak RAM. Hold out whole sessions covering startup, throttle transients, windmilling and shutdown; steady-state timbre may generalize poorly. WebNN, WebAudio v2 proposals and WebGPU compute are explicitly flagged research, never dependencies of Tiers 0–3.

Compare **inference + DSP + glue p95/max** against Q, with dropouts. Native M1/NPU inference timings and browser round-trip latency are different measures. Chunked models retain recurrent state and required overlap-add/crossfades. Ring buffers adapt block sizes; they cannot make oversized synchronous inference fit a callback. Worker-fed experiments need bounded prebuffering, measured throughput/worst stalls, starvation counts and added control latency; the worklet deadline still applies. No assumed “5–10 ms” timbre-quality threshold.

## 5. Publishable benchmark protocol

**Perf owns proposed `benchmarks/audio/` and `validation/evidence/audio/` deliverables, not existing results.** Freeze full app-build, worklet, engine-setup, source/WASM/asset hashes, flags, seed, bridge, tier/degrade state, output route and actual rate. Current qualification metadata matches loaded DSP bytes and engine/renderer IDs plus its supplied device context; it does not yet attest every app/setup byte. Extend that identity contract before adopting a real qualification record. Exercise worst-case counts including tires/transitions, both isolated and in a fixed full-simulator scene. Record resolution, renderer settings, camera path and physics workload.

### Fixed telemetry script

Implement `benchmarks/audio/generate-sweep.mjs`: emit **240 seconds at 60 Hz**, timestamps `i/60`, PRNG seed **0x53463530**, using the keyframes below. Interpolate continuous columns linearly; hold discrete state until its event. These are **synthetic stress inputs, not FJ33 procedures or validated responses**. Commit the generator and SHA-256; write the JSONL under gitignored `build/benchmarks/audio/` and replay identically per tier. FDM separately supplies a hashed actual-JSBSim start/flight/shutdown trace for realism.

| Time (s) | N1 / N2 (%) | Fuel (lbm/h) / thrust (lbf) | KIAS | Event |
| --- | --- | --- | --- | --- |
| 0 | 0 / 0 | 0 / 0 | 0 | Off, cutoff, gear down, flaps up, cockpit |
| 5 | 0 / 0 | 0 / 0 | 0 | Starter on; begin motoring |
| 10 | 0 / 20 | 0 / 0 | 0 | Starter on at 5 s |
| 20 | 24.3 / 53.4 | 76 / 92.3 | 0 | Cutoff released/light-off at 12 s; starter off at 20 s |
| 40 | 24.3 / 53.4 | 76 / 92.3 | 0 | End idle hold |
| 80 | 100 / 100 | 800 / 1846 | 180 | End acceleration |
| 100 | 100 / 100 | 800 / 1846 | 250 | End maximum hold |
| 120 | 24.3 / 53.4 | 76 / 92.3 | 250 | Deceleration; throttle-command steps at 100/120 s |
| 140 | 90 / 95 | 500 / 1000 | 250 | End re-acceleration |
| 180 | 90 / 95 | 500 / 1000 | 180 | Gear/flaps cycle 160–180 s |
| 200 | 20 / 30 | 0 / 0 | 150 | Fuel cut at 180 s; windmilling fixture |
| 220 | 0 / 0 | 0 / 0 | 0 | End rundown |
| 240 | 0 / 0 | 0 / 0 | 0 | End test |

Hold fuel at zero until 12 s and after cutoff at 180 s; these events override interpolation. Emit combustion true over **[12,180) s** and running true over **[20,180) s**, false otherwise. Throttle is 0 until 40 s, ramps to 1 at 80 s, holds until 100 s, steps to 0 at 100 s and to 1 at 120 s, ramps to 0.7 at 140 s, then holds until cutoff at 180 s and becomes 0. Gear retracts over 60–70 s, extends over 160–170 s, retracts over 170–180 s; flaps follow only the latter cycle. For 140–160 s use a fixed ground listener and a source moving **−1000 to +1000 m**, along a line **50 m** away at **10 m** height; velocity is its derivative, fixture sound speed **343 m/s**. Crossfade exterior/cockpit at 140/160 s. Run seeks, stale input, switches and overload injection separately, labeling deliberate faults rather than counting them as normal-run dropouts.

This runnable Node generator reads the keyframe table from this document; save it at the proposed path and run from the repository root as `node benchmarks/audio/generate-sweep.mjs` (writes `build/benchmarks/audio/sweep.jsonl`). The normalized fixture fields are mapped to the properties/units above by the harness; combustion is a fixture signal, not a claimed native property. The seed controls synthesis randomness. Force the tier's maximum voice/effect configuration in a separate capacity pass, including tire slip at **15,000 W** as a stress input.

```javascript
import { readFileSync } from "node:fs";
const doc = readFileSync("docs/sound.md", "utf8");
const rows = [...doc.matchAll(/^\| (\d+) \| ([\d.]+) \/ ([\d.]+) \| ([\d.]+) \/ ([\d.]+) \| ([\d.]+) \|/gm)]
  .map(m => m.slice(1).map(Number));
if (rows.length !== 13 || rows[0][0] !== 0 || rows.at(-1)[0] !== 240)
  throw new Error("Unexpected sweep table; revise/version the fixture explicitly");
const ramp = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
for (let i = 0, j = 0; i < 240 * 60; i++) {
  const time = i / 60;
  while (j + 1 < rows.length - 1 && time >= rows[j + 1][0]) j++;
  const a = rows[j], b = rows[j + 1], u = ramp(time, a[0], b[0]);
  const [n1, n2, flow, thrustLbf, kias] = a.slice(1).map((v, k) => v + u * (b[k + 1] - v));
  const combustion = time >= 12 && time < 180;
  const cycle = ramp(time, 160, 170) - ramp(time, 170, 180);
  const exterior = time >= 140 && time < 160;
  const throttle = time < 100 ? ramp(time, 40, 80)
    : time < 120 ? 0 : time < 180 ? 1 - 0.3 * ramp(time, 120, 140) : 0;
  process.stdout.write(JSON.stringify({
    sequence: i, epoch: 1, time, seed: 0x53463530,
    n1, n2, thrustLbf, kias, fuelLbPerSec: combustion ? flow / 3600 : 0,
    starter: time >= 5 && time < 20, cutoff: !combustion,
    combustion, running: time >= 20 && time < 180, throttle,
    gear: 1 - ramp(time, 60, 70) + cycle, flap: cycle,
    view: exterior ? "exterior" : "cockpit",
    // Fixed bench coordinates; cockpit listener follows this emitter.
    sourceMetres: exterior ? [-1000 + 100 * (time - 140), 10, 50] : [0, 10, 50],
    sourceVelocityMps: exterior ? [100, 0, 0] : [0, 0, 0],
    soundSpeedMps: 343,
  }) + "\n");
}
```

### Measurements and devices

1. **Cold load:** fresh cache; response transferred/encoded bytes, WASM/decode time, sound-ready time, resident delta and peak RAM. Repeat HTTP-cache and IndexedDB cases. Cross-origin resource timing needs `Timing-Allow-Origin`; otherwise use harness network logs.
2. **Warm/soak:** **60 seconds** for compilation, buffers and startup GC, then **10 minutes** full-scene thermal soak. Exclude only the declared startup interval from steady statistics; retain its trace. Include all GC/stalls/throttling during soak/measured runs. Record charging/power mode, ambient conditions and available thermal observations.
3. **Measure:** **three 240-second repeats** after soak per tier/rate/bridge. Publish each repeat and aggregate mean/p95/max per quantum, sample count, over-Q count, actual dropout count/duration, queue starvation and telemetry age. Include worst rolling 2-second p95, graph load, frame-time comparison and physics misses. Compute aggregate p95 from observations, not averaged percentiles.
4. **Timing provenance:** `performance.now()` is not portable in AudioWorklet. Use a calibrated available monotonic clock or browser/OS traces of actual callbacks; report resolution/overhead. `currentTime/currentFrame` is audio position, not elapsed CPU. No SAB busy-loop clock. Worker/offline kernel timings are **proxies**, not real-time acceptance. [Worklet timing issue](https://github.com/WebAudio/web-audio-api/issues/2413).
5. **Output/graph diagnostics:** report `baseLatency`/`outputLatency` in ms where available; missing values are `null`. Chromium CDP `WebAudio.getRealtimeData({contextId})` returns `realtimeData.renderCapacity`: graph load, not per-worklet p95 or a portable context property. Feature-detect implemented `playbackStats` underrun counters; record their update semantics/browser build. Without counters use qualified loopback/OS capture; otherwise dropout count is **unknown**, never zero. Optional draft-only diagnostic probes require `audioExperimentalTelemetry`; shipped synthesis does not depend on them. [CDP WebAudio](https://chromedevtools.github.io/devtools-protocol/tot/WebAudio/), [Chrome playback statistics](https://developer.chrome.com/release-notes/146#playback-statistics-api-for-webaudio).
6. **Real hardware:** prefer terminal/headless with a real audio output path; virtual/offline sinks cannot certify physical output. Integrated qualification must use the hardware GPU with adapter recorded, rejecting software renderers. Use device/remote automation and capture when headless cannot exercise mobile routes. Level-match tier timbre comparisons; preserve intended cockpit/exterior attenuation in position tests.

Validate the dropout detector with a **separate diagnostic-only overload run** before accepting zero: it must report induced underruns. Record baseline/end counter snapshots after the documented update interval. For loopback, align a known continuous probe, compensate clock drift and detect missing/repeated spans of at least one quantum; publish thresholds, false-positive checks and capture configuration. A counter's presence or an unexamined recording is insufficient. Retain the positive-control trace separately from qualification results.

This is a proposed test/procurement matrix, **not evidence of availability or passing devices**. Perf records exact OS/browser builds and routes; results do not automatically transfer across updates.

| Named reference device | Browser / route coverage | Qualification |
| --- | --- | --- |
| **iPhone SE (2nd generation, A13)** | Safari, speaker/wired adapter; silent switch and Bluetooth separately | Off/Low; Med attempted, explicit pass/fail |
| **Google Pixel 6a** | Chrome, speaker/wired adapter; both bridges | Off/Low/Med; High attempted |
| **MacBook Air M1, 8 GB (2020)** | Chrome/Safari/Firefox; built-in output/wired headphones | Off/Low/Med/High, integrated hardware rendering |

Every audible shipping tier needs p95/max/dropout evidence on **at least two named devices**; Low must pass all three. Med and High initially target Pixel 6a + M1. If a target fails, optimize or keep that tier disabled there; do not silently weaken ceilings. Test 44.1/48 kHz DSP; if a physical route cannot exercise one rate, mark that cell **not tested** and certify only actual route/rate.

## 6. Build order, settings and acceptance

1. **Tier 0 + Tier 1 — DSP/FDM/Perf:** shared lifecycle, WASM worklet, counted tire cue, snapshot/state adapter, both bridges, spool tones/noise, cockpit filters, limiting/fades, unlock/status UI and benchmark generator. Done when Low passes all three references, Off allocates no DSP, and mapping/lifecycle/failure fixtures pass.
2. **Tier 2 — DSP/Perf:** bounded partials/noise bands, short generated IR, Doppler, absorption and ground reflection. Done when Med passes Pixel 6a + M1 including thermal soak, and listening review confirms position/installation improvements without transition artifacts.
3. **Tier 3 — DSP/FDM/Perf:** procedural component models for FJ33 and F135, directional spectra and independent cockpit treatment, following [High aircraft sound](proposals/high-aircraft-sound.md). Software completion requires real-WASM and integration acceptance; acoustic qualification separately requires reference comparisons and documented level-matched review across idle, acceleration, high power, cruise and shutdown. Device qualification requires Pixel 6a + M1 and resource caps. Record reviewers/disagreements; no numerical realism claims without evidence. Crackle, full STOVL sound and licensed residual banks are later, independent milestones.
4. **Tier X — separate research:** `audioExperimental` defaults off and stays hidden from normal settings until its gates pass. Do not delay Low/Med for it.

**Settings:** **Off, Low, Med, High**, plus Auto selecting the highest supported tier. Sound defaults on at Med. Low/Med/High have plain labels and run without a validation warning or extra opt-in. Show requested/effective quality after fallback, independent volumes, reduced dynamic range and actual per-tier resource controls. Procedural High downloads no recordings. Disable with **“Unsupported on this device”** only for a concrete missing capability, with its reason. **“Audio pack unavailable”** applies only to a future optional recorded extension. Browser activation happens on the first normal interaction; “Enable sound” is offered only when the saved master preference is off. Real fault messages and persistent downgrade/re-test controls remain.

**Pilot controls, 2026-10-07 follow-up.** Continuous, saved controls apply live.
Master, engine boost and acoustic viewpoint live in Sound; afterburner volume
has its single home in Exhaust's Afterburner section, shown for compatible aircraft:

| Parameter | Bounds / default | Meaning |
| --- | --- | --- |
| `osfs.sound.masterVolume` | 0–8 / 2 | Mix amplitude gain before output processing, shown as 0–800%. The default is 200% of the previous master maximum; saved gains keep their numerical value. |
| `osfs.sound.engineVolume` | 0–8 / 0.8 | Engine amplitude gain, shown as 0–800%. The default and existing saved values stay unchanged; the extra headroom also scales its afterburner component. |
| `osfs.sound.afterburnerVolume` | 0–1 / 0.5 | Mix of deliberate afterburner amplitude and spectral changes, driven by native actually burned reheat fuel. Zero removes those changes at fixed shaft/thrust/fuel inputs; native engine changes still affect the base sound. The gain and fuel-fraction shaping are uncalibrated. |
| `osfs.sound.listenerCockpitBlend` | 0–1 / 1 | Camera at 0, Cockpit at 1; intermediate values interpolate the acoustic viewpoint and cabin/exterior treatment. Cockpit keeps sound at the pilot when the visual camera moves outside the aircraft. |

Eight-times engine amplitude offers about 18 dB of gain headroom before output
processing, not a promise of eight-times perceived loudness or calibrated SPL;
the limiter still bounds the output. The added afterburner gain remains
independent, so it can be lowered while boosting the base engine. Intermediate
listener viewpoints are an artistic blend, not a measured cabin transfer.
The later master-volume adjustment uses the previous master maximum of 1 as
its reference: default 2 and maximum 8, with the other controls held fixed.
Engine, afterburner and airframe defaults/ranges remain unchanged by that
adjustment. Existing saved master settings remain in effect until edited or
reset to the new default.
Integrated software checks for these controls pass; see
[ledger §16.3](validation/audio-implementation-ledger.md#163-pilot-sound-controls-2026-10-05-follow-up).
The earlier reference/architecture evidence in §7 remains historical.

Stats format, refreshed at **1 Hz**:

```text
Audio: {effective} (requested {requested}) | DSP p95 {ms|n/a}/{Qms} ms ({pct|n/a}%) | max {ms|n/a} ms | underruns {count|unknown} | RAM {MiB|n/a} | Fs {Hz} | bridge {SAB|port} | {reason}
```

Identify measured/estimated/unavailable fields; never replace DSP p95 with graph average. Advanced diagnostics may show latency/graph load separately. Missing diagnostics cannot crash or mute working audio.

- [ ] **Release:** exact hashes/license texts/notices for code/assets/models; Recordist absent unless specifically negotiated rights are recorded.
- [ ] **DSP:** source counts, CPU/RAM/payload and transition caps pass; audible DSP uses AudioWorklet + WASM with bounded allocation and no audio-thread waiting.
- [ ] **FDM:** installed properties/units verified; blade counts, shaft speeds, bypass calibration, combustion transitions and buzz-saw remain explicitly unverified until evidence exists.
- [ ] **Perf:** required device runs publish mean/p95/max, timing provenance, zero observed dropouts with a stated detector, rates/bridges and thermal/integrated-rendering results. Unknown dropout detection cannot pass.
- [ ] **DSP/Perf:** forced overload, missing assets, decode failure, stale input, seeks and switches produce bounded fallback/fades; cooldown prevents oscillation; unsupported/unverified profiles follow settings rules.
- [ ] **Release/DSP:** static host works without isolation; isolated deployment passes CORS/CORP checks; cache/eviction/quota/clear-downloads paths work.
- [ ] **DSP/Perf:** autoplay, accessibility, iOS mute, route changes, interruptions/resume pass; 44.1/48 kHz preserve pitch/duration.
- [ ] **DSP/Release:** listening evidence supports realism claims; X stays flagged; every remaining TBD has a named owner in implementation issues.

## 7. F-35B main-engine approximation, 2026-10-05

This section records the preceding Low/Med F135 profile and its evidence. The
later procedural High increment is specified in [High aircraft sound](proposals/high-aircraft-sound.md);
its implementation checks belong in the [ledger](validation/audio-implementation-ledger.md).

0sfs owns the engine definitions, installation registry and shared procedural
WASM voice. The F-35B now has an exhaust-dominant
profile, rather than the SF50 voice with different input normalization. The
Sound tab still names **Approximate F135 procedural sound**: timbre and
loudness remain uncalibrated, and separate lift-fan sound is not modeled.

The profile is a fixed-size setup transaction, applied before the worklet's
first quantum and on aircraft replacement. It specifies idle N1, synthetic
shaft references, fan/core mix, existing noise gains/filter curves, thrust/fuel
references and augmentation shaping. The FJ33 setup preserves the exact
original values and arithmetic. Profile setup neither adds a voice nor changes
the existing oscillator, grain, convolution or memory ceilings.

Snapshot ABI 4 transports **native main-engine units**: N1/N2 percentages,
thrust in lbf, total fuel flow in lbm/s and burned afterburner fuel in kg/s.
Normalization belongs to the configured
core, so the transport, adapter readings and engine monitor all retain the same
physical values. The source remains engine zero's installed nozzle point,
about `[0, 1.267, -4.46433628]` metres in the aircraft visual frame. This is a
provisional geometric source location, not a measured acoustic centre. Lift-fan
and roll-post force surrogates do not create extra sound engines.

| F135 setup | Current value | Evidence |
| --- | --- | --- |
| Idle N1 / span to maximum | 30% / 70 percentage points | Installed trial FDM. |
| Dry-thrust normalization | 28,000 lbf | Installed trial FDM; not acoustic power. |
| Fuel-flow normalization | 8 lbm/s | Artistic reference, not an operating limit. |
| N1 / N2 synthetic references | 1,800 / 3,800 Hz at 100% | Artistic; no published rotor RPM/blade order used. |
| Fan share of source mix | 0.18 | Artistic exhaust-dominant balance, not bypass mass-flow ratio. |
| Dry exhaust low-pass | `180 + 2200 × normalizedDryThrust` Hz | Artistic broadband shaping. |
| Augmented exhaust low-pass | 4,200 Hz | Artistic target, crossfaded from the dry filter. |
| Augmented exhaust gain | Valid native burned AB / total fuel permits and weights additional gain; above-dry native thrust retains headroom | Artistic acoustic response to a native combustion observer. |

Published F-35B ground-run measurements identify large/fine turbulent mixing
and broadband shock-associated noise, with spectral shape varying by engine
condition and observation angle. This supports the emphasis on broadband
exhaust sound. It does **not** supply the synthetic shaft frequencies, cockpit
transfer, source gain or a calibrated recording for this implementation.
[Neilsen et al., three-way F-35B spectral decomposition](https://doi.org/10.2514/1.J057992),
[Vaughn et al., broadband shock-associated noise](https://pubmed.ncbi.nlm.nih.gov/30424662/).
The current single-source filters do not reproduce their full directional
spectral decomposition or jet crackle.
The measured broadband shock-associated component is already present at
75% engine-thrust request, before afterburner. The reheat-controlled
filter/gain change below is an artistic exhaust response, not a physical
shock-noise model or a gate for all shock-associated sound.
[F-35B broadband shock-associated noise study](https://doi.org/10.1121/1.5055392).

The F135 adapter reads optional native
`propulsion/engine[0]/thermal/afterburner-burned-fuel-flow-kg-sec`, with
`thermal/valid` and the read-only `augmentation` observer. Availability comes
from the catalog, the property batch and a valid thermal state. Missing,
negative or nonfinite burned fuel, invalid thermal state, missing total fuel,
or unavailable/inactive augmentation fades deliberate reheat sound out;
neither full throttle nor the active flag substitutes for combustion.
The source target is the actually burned AB fuel divided by total native fuel,
both in kg/s and bounded to 0–1. This continuous fraction is an **uncalibrated
acoustic proxy**, not a measured sound-power law, heat-release fluctuation or
F135 ignition schedule. At fixed other inputs, selection with zero burned
fuel adds no reheat sound. The existing 10 ms dezippering and 33.3 ms telemetry
buffer apply; no cold-start or visual-delay timer is added.

Burned reheat fuel morphs the **existing exhaust noise source and filter**.
The pilot's afterburner volume multiplies every intentional reheat amplitude
and frequency change, including High fine-scale mixing and shock gain. Zero
therefore returns the same samples as dry at identical physical inputs. It
does not hold real native thrust, total fuel or shaft speed fixed. The current
native model immediately switches its augmented thrust table before fuel
settles, so a residual early base-source change can still occur; the native
thrust/fuel closure remains an engine-model issue. There is no extra
oscillator, noise stream or voice. Snapshot ABI 4 adds one Float64 observation;
the worklet wrapper and WASM core share the new 34-field layout.
The physical FDM inhibits augmentation during deployed conversion; audio
observes that result without copying its command mask. Eight real F-35B
SDK/DSP cases pass on installed `1.2.4-fork.8`, including dry, afterburning,
converted and cutoff observer states. This is software verification, not
acoustic or device qualification.

The light and added acoustic energy should refer to combustion in the
augmentor between turbine and nozzle. A cold metal liner can glow later than
the flame; its thermal inertia does not justify combustion sound before fuel
burns. This is a causal inference from the source mechanism, not a measured
F135 light/sound-onset tolerance. Propagation, cockpit transfer, output latency,
camera exposure and visibility thresholds remain separate observations.
[NASA Glenn afterburner description](https://www.nasa.gov/special-projects-laboratory-turbojet-enhancements/).
No matched F135 cold/warm onset recording or listening qualification is
retained, and this audio correction does not establish visual acceptance.

The existing distance law, Doppler delay, cockpit colour, mute, holds, gains,
reset epochs, sample-peak limiter and Auto/device gates apply. No recording,
third-party audio asset or new licence is added. These baseline checks do not
qualify the later procedural High model. None of these profiles is device- or acoustic-qualified.

**Software evidence.** Eight short output vectors cover 44.1/48 kHz, Low/Med,
cockpit/exterior, startup, power/configuration changes, shutdown, wind and tire
content. Every Float32 output sample matches the saved pre-change SF50 WASM:
[`sf50-reference.json`](../validation/evidence/audio/f135/sf50-reference.json).
The actual-WASM profile checks prove a stronger broadband F135 source,
augmentation-only contribution, above-dry headroom, missing-signal handling,
finite limited output and unchanged memory/source ceilings. The real plain-JS
worklet wrapper is also exercised with actual WASM in Node; this is not a
browser audio-thread or physical-output check.
Build/test status and source/artifact hashes are retained in
[`acoustic-profile-acceptance.json`](../validation/evidence/audio/f135/acoustic-profile-acceptance.json).
That record describes the preceding renderer/architecture pass. The later
engine-boost, afterburner-gain and sound-position controls are tracked separately
in [ledger §16.3](validation/audio-implementation-ledger.md#163-pilot-sound-controls-2026-10-05-follow-up).

**Limits recorded for this baseline.** Native shutdown ramps fuel flow down at 10,000 lbm/h per
second; the existing combustion proxy follows residual fuel even after thrust
and running stop. Shutdown/starvation/relight acoustics remain uncalibrated.
The baseline also retained a DSP defect: `noiseBands` reports the requested cap but
does not gate all source processing; only partial count and the tier's bypass
switch enforce their corresponding limits. Correcting that accounting and
control is required by the High increment because default SF50 output contains both
wind and configuration noise. This profile adds no new band and makes no
noise-cap enforcement claim. The ledger distinguishes the baseline from later
cap-enforcement, zero-volume and aircraft-replacement fixes.
