# Chase-camera zoom at Med: reproduction and fix

Software evidence only. No physical output route was used, nothing here qualifies a
device, and the pilot's original report has not been re-heard. See
[the ledger](../../audio-implementation-ledger.md) for what those words mean.

## 1. Report

> "when i have the engine sound in mid and i zoom in and out of the plane the engine
> sound bugs out"

Camera mode, zoom range, browser, output route and SF50 variant were not recorded, and
the artefact was not described beyond "bugs out". What follows is an independently traced
defect that matches the reported trigger; whether it is the whole of what the pilot heard
still needs a pilot confirmation (§7).

## 2. Configuration this was reproduced under

| Item | Value |
| --- | --- |
| Repository | `0sfs` at `c1405f0e` plus the change described here; unrelated working-tree edits left untouched |
| Requested tier | Med |
| Effective tier | Med. `resolveQuality()` (`audioQuality.ts`) returns Low for an explicit Med request because `QUALIFIED_PROFILES` is empty. Med only becomes effective through the Sound tab's session-only **"Run Med anyway (testing)"** switch (`allowUnvalidated`). The reproduction drives the core at Med directly. |
| Sample rate | 48 000 Hz (44 100 Hz covered by the sweep proxy) |
| Transport | Not involved: snapshots go into the compiled core through `dspHarness.ts`, so the port/SAB bridge is out of the loop |
| Camera | `createPlaceholderAircraft` chase camera, the real one. Default range `|THIRD_PERSON_OFFSET|` = 14.17 m, zoom clamped to 8…500 m |
| Zoom input | `flightCameraInput.ts` wheel handler: one mouse notch (`deltaY` 100) is `exp(0.2)` = +22 % of range, applied in a single frame with no easing |
| View | Third person (`exterior` = 1). Zoom does not reach the cockpit camera. |
| Engine telemetry | Held constant through every run: N1 80 %, N2 85 %, thrust 1200 lbf, fuel flow 0.18 lbm/s, combustion and running true |
| Node | v26.8.2, macOS, `emcc` 6.0.9 |

Only the camera varies between a run and its control, so anything that moves is the
camera's doing.

## 3. What was reproduced

`cameraZoomAudio.integration.test.ts` drives the real chase camera, pushes its view matrix
through `computeListenerPose`, publishes the resulting pose at 60 Hz and renders the actual
`audio-dsp.wasm`. No facade mock sits in the chain.

**Eight wheel notches out (14.2 m → 70.2 m in about 130 ms), Med.** Dominant output
frequency in 20 ms windows, with the engine's own telemetry held still:

| t (s) | chase (m) | before, dominant Hz | after, dominant Hz |
| --- | --- | --- | --- |
| 0.98 | 14.2 | 1000 | 1000 |
| 1.02 | 25.8 | 1780 | 1010 |
| 1.08 | 47.1 | 680 | 1000 |
| 1.10 | 57.5 | 340 | 1980 |
| 1.14 | 70.2 | **310** | 990 |
| 1.18 | 70.2 | 340 | 1010 |
| 1.26 | 70.2 | 1590 | 1000 |
| 1.38 | 70.2 | 1940 | 990 |
| 1.50 | 70.2 | 1990 | 1010 |

Before the fix the whole engine falls by a factor of 3.2 — about 20 semitones — over the
130 ms of scrolling and then glides back up over roughly 400 ms. The 1000/2000 Hz
alternation in the "after" column is the N1 half-order and fundamental trading places in
the estimator; the fixed-camera control alternates the same way.

Power-weighted mean frequency against a Med control parked at 70.2 m, 60 ms windows:

| t (s) | before | after |
| --- | --- | --- |
| 0.96 | 1.020 | 1.021 |
| 1.02 | 0.854 | 1.018 |
| 1.08 | 0.309 | 0.925 |
| 1.14 | **0.268** | 1.126 |
| 1.20 | 0.653 | 1.034 |
| 1.32 | 0.918 | 0.996 |
| 1.68 | 0.993 | 0.923 |

Extremes over 0.6–2.5 s: **0.268 … 1.073** before, **0.923 … 1.126** after. The "after"
spread is the estimator's own noise: two runs at the same distance scatter by about ±10 %
over a 60 ms window.

**Scrolling back in** runs the same mechanism the other way: worst centroid ratio **1.785**
before, 1.107 after.

**Continuous scroll, 14.2 m → 500 m → 14.2 m** (60 wheel steps out, hold, 60 back in):

| t (s) | chase (m) | before, centroid | after, centroid |
| --- | --- | --- | --- |
| 0.72 | 14 | 2452 | 2453 |
| 1.20 | 31 | 2090 | 2553 |
| 1.44 | 76 | 978 | 2484 |
| 1.68 | 176 | 1158 | 2329 |
| 2.64 | 500 | silent | silent |
| 3.36 | 134 | 4679 | 2349 |
| 3.60 | 54 | 3527 | 2296 |
| 3.84 | 23 | 2995 | 2428 |
| 4.32 | 14 | 2231 | 2518 |

**Low is untouched.** The same camera plan at Low gives a centroid ratio of 0.996…1.002
against its parked control, identically before and after: Low does not run the delay line.
Every Low row of the offline sweep proxy is bit-identical across the two builds.

**A fixed chase camera and the cockpit view** hold their spectrum to within ±5 % across a
2 s run, before and after.

## 4. Cause

`core.cpp` drove Med's propagation delay line straight from the source distance:

```cpp
const double wanted = distance / soundSpeed * gSampleRate;
const double delaySamples = gDelaySmoother.process(wanted);   // tau = 60 ms
direct = gDelay.read(delaySamples) * distanceFade;
```

What a delay line does to pitch is set by how fast its read pointer travels, not by where
it sits: the resampling ratio is `1 - d(delay)/dt`. A 60 ms smoother turns a distance step
of Δd metres into a peak rate of about `Δd / (343 × 0.06)` = `Δd / 20.6`, so

| zoom step | resampling ratio | heard as |
| --- | --- | --- |
| 3.1 m (one notch from the default range) | 0.85 | ~2.8 semitones flat |
| 10.3 m | 0.50 | an octave down |
| 20.6 m | 0.00 | the read pointer stalls |
| > 20.6 m | negative | the read pointer reverses |

`zoomChaseCamera` multiplies the range by `exp(0.2)` per notch in a single frame with no
easing, and a scroll delivers notches back to back, so a pilot reaches the bottom rows of
that table without trying. Zooming in runs it the other way and shifts upward, unbounded
by anything.

Two things made this specific to camera zoom rather than to motion in general:

- `audioPose.ts` reports the chase and cockpit cameras as **rigidly parented**: the listener
  is given the aircraft's own velocity, so the modelled Doppler ratio is exactly 1. The
  velocity model therefore said "nothing is moving" while the geometry said "the listener
  jumped 56 metres". The delay line believed the geometry.
- The ratio the core hands `TurbofanVoice::process` as `cullScale`, which decides which
  partials would alias, was that same 1.0. During a zoom-in the delay was shifting partials
  by up to 2× with the anti-alias guard set for 1×, so they folded back down the spectrum.

Only Med and above reach this code (`spatialTier`), which is why Low sounded fine and
matches the pilot hearing it on "mid".

The same mechanism fires on any listener-geometry change that no velocity backs: a
cockpit ↔ chase view toggle moves the listener about 10 m, and a reposition moves it further.

## 5. Change

`src/flight/audio/dsp/core.cpp`:

1. **The tap's rate is the modelled Doppler ratio, and only that.** `gDelaySamples` integrates
   `1 - doppler` per sample, which is exactly the rate that makes the delay line's output
   ratio equal `doppler`. A view change carries no velocity, so it moves nothing.
2. **The tap is seated from the retarded range,** `d / (c + rangeRate)`, which solves
   `tau = d(t - tau)/c`, instead of `d / c`. For a rigidly parented camera the range rate is
   zero and this is the old expression; for a moving source it is the geometry that is
   consistent with the integrated rate.
3. **It is re-seated only where that costs nothing:** at a declared discontinuity
   (`osfs_audio_set_epoch` — reset, seek, reposition), on a tier change (Low does not write
   the line, so its tap is stale on the way back into Med), and while the direct path is
   faded out past the 0.5 s storage cap.
4. **The 0.5 s cap now bounds storage only.** The direct tap pins at the cap instead of being
   faded out; the ground-image tap, whose *shape* the cap would falsify, is the one that fades.
   See §8.

The 60 ms delay smoother is gone; that smoother was the thing converting geometry into pitch.

Not changed: distance gain, air absorption, panning, the 0.5 s storage cap and its 0.42 s fade
threshold, Low, the cockpit installation, and every clock, hold and epoch rule.

**A first attempt trimmed the tap toward geometry at a capped 1 %/s** on the theory that 17
cents is inaudible. It is — but a tap that slides forever never stops sliding, and after a
zoom cycle the tail came back 12 % brighter and 10 % louder than the parked control, from
the linear interpolator's ripple as the fractional delay swept. That approach was dropped
for the one above, and `cameraZoomAudio.integration.test.ts` keeps a test that would catch
its return.

## 6. Verification

| Check | Result |
| --- | --- |
| `npx vitest run src/flight/audio/cameraZoomAudio.integration.test.ts` on `audio-dsp.wasm` at `c1405f0e` | **4 of 7 fail**: scroll out `0.268 > 0.8` false, scroll in `1.785 < 1.25` false, audible at the zoom limit `0 > 1e-5` false, closing listener `1.075 > 1.2` false |
| the same file on the rebuilt WASM | 7 pass |
| `npx vitest run` | 981 pass, 106 files, 0 fail |
| `npm run lint` | 5 pre-existing errors, all in unrelated HUD work (`LoggingPanel.tsx`, `evaluationInstruments.test.ts`, landed on `main` as `a67bfdbb` while this was in progress); identical with the change stashed |
| `npm run build` (includes `verify:jsbsim`, `verify:audio` before and after `vite build`, both `--dist` passes) | exit 0 |
| `npm run build:audio` | `emcc` 6.0.9, 42 740 bytes, sha256 `01367066b89f28d8d560c326216f507d821cbef57d091d0a4f85f309f99c238b` |
| offline sweep proxy, 3 repeats, Low+Med, 44.1/48 kHz, `sweep` + `capacity` + `fault-injection` | [`offline-sweep-proxy-2026-09-16.json`](offline-sweep-proxy-2026-09-16.json). Zero non-finite samples in all 12 runs, every peak inside the −1 dBFS ceiling, Med p95 0.0454–0.0463 ms against the 0.25 ms proposed budget |
| fault-injection counters, before vs after | identical at both tiers and rates: `resyncs` 2, `staleFades` 2, `eventsDropped` 8, `snapshotsDropped` 1, `nonFinite` 1, `epoch` 2 |
| Low rows of the sweep proxy, before vs after | identical to the last printed digit, including peaks |

Doppler was measured on its own, because the fix moves where it comes from. A detached
listener with the source closing at 100 m/s has a modelled ratio of `343 / 243` = **1.412**:

| measurement | before | after |
| --- | --- | --- |
| N1 fundamental tracked in 40 ms windows | — | 1.34…1.51, mean ≈ 1.42 |
| centroid ratio against a stationary control, 60 ms windows | mean 1.158 | mean 1.315 |

The centroid estimator reads low because the broadband bands dilute the tonal shift; both
columns use it the same way. The old code under-reported Doppler because it drove the delay
from the instantaneous range instead of the retarded one, and then lagged that through a
60 ms smoother. The exterior-flyby segment of the sweep proxy moves with it (Med 44.1 kHz
RMS 0.000825 → 0.000874 on the sweep pass, 0.000787 → 0.001080 on the fault pass; the far ends
of that ±1000 m pass are no longer faded out either, per §8).

## 7. What this does not establish

- **No device qualification.** Everything above is Node rendering the compiled core with no
  audio route. Med stays unvalidated and still needs the session testing switch to run.
- **The pilot's artefact is not confirmed to be this one.** A deterministic defect on the
  reported trigger is not proof it is what they heard. Worth asking on a re-test: was it a
  pitch bend, and did it follow the scroll in both directions?
- **Not re-heard.** No one has listened to the fixed build. `npm run dev`, fly the Vision Jet,
  Sound tab → Enable sound → Med → "Run Med anyway (testing)", chase view, then scroll.
- **The ledger's SND-05 line claiming dspCore.test.ts holds Doppler evidence was wrong**;
  no such test existed. The new file now covers it.
- **The absolute propagation lag is no longer a live reading of the pilot's view distance.**
  It is whatever the tap was last seated at. For a rigidly parented listener there is nobody
  for that to be wrong for; for a detached one the Doppler rate keeps it honest. A published
  velocity that disagreed with the published positions would let it drift, bounded by the
  0.5 s line.

## 8. Follow-on: Med went silent past ~144 m (fixed the same day)

Raised by the pilot: *"in real life you can hear a jet engine 500m away no?"* Yes — and
sound.md §3 already said so. Its level law is `min(1, 1 m/distance)` with no cutoff, which is
spherical spreading, 6 dB per doubling, and nothing in the spec asks the engine to stop.

The silence came from the delay-storage guard leaking into the level path. §2's 0.5 s cap was
enforced by fading the **direct** path once the geometric delay passed 0.42 s, which multiplied
the whole engine, not just the delay. Two consequences:

- It gated on *delay*, so the threshold moved with the speed of sound: fade from 144 m and
  silence by 165 m at sea level, but 124 m and 142 m at 35,000 ft.
- Med lost 21 dB over 21 metres and then stopped, while Low carried on rolling off.

After the zoom fix the guard had also stopped being necessary for the direct path: the tap no
longer follows the view, so a zoom cannot push it anywhere near the cap.

**Changed.** The direct tap pins at the cap rather than fading. A pinned tap plays the right
sound at the right level and loses only its absolute propagation lag, which has no audible
reference; silence loses the engine. The ground-image tap does still fade, because it sits a
path difference further back and a reflection pinned to the cap would comb at a spacing the
geometry never asked for — a wrong comb is audible in a way a wrong lag is not. sound.md §2's
clause was rewritten to say the cap bounds storage rather than audibility.

Levels through the real chase camera, dB against Low at the default 14.17 m chase range:

| chase range | Low | Med before | Med after | 6 dB/doubling |
| --- | --- | --- | --- | --- |
| 12.4 m | 0.0 | −3.5 | −3.5 | 0.0 |
| 50 m | −12.1 | −15.4 | −15.4 | −12.1 |
| 144 m | −21.4 | −24.8 | −24.8 | −21.3 |
| 165 m | −22.6 | silence | −26.0 | −22.5 |
| 300 m | −28.0 | silence | −31.2 | −27.7 |
| 500 m (zoom clamp) | −32.8 | silence | −36.1 | −32.1 |

Med now tracks Low at a constant −3.3…−3.5 dB across the whole 8…500 m zoom range — that
offset is Med's cabin IR wet mix and bypass band, not a distance effect — and both follow the
theoretical column. Covered by "keeps the engine audible out to the zoom limit, on Low's
distance law", which reads `0` on the old binary against a `1e-5` floor.

**Not settled by this.** Whether −36 dB at the 500 m clamp is the right *listening* level is a
mix question, not a physics one: the app has no calibrated SPL, so how audible that is depends
on the master gain. The ledger already lists mix balance as barely tuned (§4.9).
