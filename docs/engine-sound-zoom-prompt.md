# Work prompt: SF50 engine audio glitches while zooming at Med

Execute this task when the user starts a fresh conversation with this file.
Work in `/Users/felg/gh/0sfs`. Reproduce the camera-zoom audio problem, determine
its cause, and implement a focused fix with before/after evidence. Read the
current `AGENTS.md`, `docs/sound.md`, and
`docs/validation/audio-implementation-ledger.md` first.

## User observation and boundaries

The user reported: "when i have the engine sound in mid and i zoom in and out
of the plane the engine sound bugs out." Treat "mid" as likely the Med setting,
but verify the requested and effective tier. The exact artifact is unknown:
clicking, pitch jumps, distortion, dropouts, or unexpected gain changes have
not been distinguished. Camera mode, zoom range, browser, output route, and
SF50 variant were not recorded. Do not invent these details or assume a cause.

The engine sounded fine during the user's latest landing after commit
`c1405f0e` (`Preserve simulation time across contact recovery`). The user wants
the existing contact-recovery architecture left alone. This task concerns
camera-dependent audio; do not reopen the general rollout investigation,
redesign recovery, or fix the separately reported flap reset.

Prior findings and the deferred concerns are recorded in
`docs/validation/engine-cutout-rollout-2026-09-16.md`. They provide context, not
proof that this audio problem has the same cause.

## Establish the running configuration

Record requested tier, effective tier, whether the session's unvalidated-tier
override is enabled, sample rate, transport, camera mode, and relevant sound
settings. The current ledger says Med can fall back to Low without that
override. Selecting Med alone does not establish which DSP path is running.
Use the current implementation and status to verify this; do not change tier
gates just to make the reported setting match an assumption.

If clarification is available, ask what "bugs out" sounds like and which
camera/zoom action triggers it. Continue independent tracing and reproducible
checks without waiting for optional details.

## Reproduce before fixing

Start with steady engine telemetry and vary only the actual camera/zoom path.
Compare a fixed-camera control, zoom in/out slowly, and rapid direction
reversals within the app's supported zoom limits. Compare Low and effective
Med. Distinguish intended distance/panning changes from an audio defect.

Use the existing headless camera tests and real WASM DSP harness where
possible. Trace camera/listener pose into published snapshots and audio output;
do not rely solely on a synthetic facade mock. Add an app-level reproduction
if isolated tests miss the observed interaction. A deterministic failure in
this chain is useful evidence even if the original device behavior remains
unverified; state that limitation.

Log pose validity, source/listener coordinates and velocities, distance,
simulation timestamps and publication gaps, audio epochs/resyncs/stale fades,
effective tier, and relevant DSP output measurements. Keep native running,
fuel flow, and spool signals as controls if using the full simulator. Check
rendering/frame timing if zoom correlates with telemetry stalls.

Candidate causes to distinguish, not conclusions: discontinuous pose or
distance updates; rapidly changing spatial-filter or delay parameters;
invalid near-source geometry; unexpected gain or Doppler changes; stale
telemetry or epoch resets; and a camera/rendering stall starving publication.
Do not assume camera zoom should create physical Doppler without checking the
app's camera model and the sound specification.

## Starting points

- `src/flight/createFlightSimApp.ts`: camera construction, zoom handling,
  `flightAudio.updateView()` and fixed-step `publishStep()` integration.
- `src/flight/aircraft/createPlaceholderAircraft.ts` and its tests: chase
  camera geometry and supported zoom limits. Use current limits in the repro.
- `src/flight/input/flightCameraInput.ts`: zoom input routing.
- `src/flight/audio/audioPose.ts` and `audioPose.test.ts`: view transforms,
  floating-origin assumptions, and listener/source velocity policy.
- `src/flight/audio/createFlightAudio.ts`: pose publication, timeline, holds,
  tier selection, and diagnostic status; accompanying tests cover lifecycle.
- `src/flight/audio/audioQuality.ts` and `audioSettings.ts`: requested versus
  effective tier and the testing override.
- `src/flight/audio/audioSnapshot.ts`, `audioTransport.ts`, and
  `worklet/dspProcessor.js`: transport and worklet boundary.
- `src/flight/audio/dsp/core.cpp`, `dsp/convolver.h`, and `dsp/primitives.h`:
  spatialization, delays, smoothing, and output processing.
- `src/flight/audio/dspHarness.ts` and `dspCore.test.ts`: real compiled DSP
  output tests. The audio ledger distinguishes software checks from device
  qualification; preserve that distinction.

## Scope, validation, and handoff

Preserve unrelated working-tree changes. Deliver a focused fix plus a
deterministic regression that fails before and passes after, with metrics or
retained audio evidence tied to the reproduced artifact. Keep intentional
zoom-dependent spatial behavior, stable engine telemetry, and Low-tier
behavior intact. Do not solve the problem by disabling Med or spatial audio,
muting the engine while zooming, or imposing arbitrary camera restrictions.

If DSP sources change, follow `AGENTS.md`: rebuild using `npm run build:audio`
and include the generated WASM and provenance with the source change. Run
appropriate audio/pose/integration tests, lint, and build verification. Record
the exact tested revision, artifacts, effective tier, sample rate, and any
device coverage still missing. A software test does not qualify a device.
Check fixed-camera Med and cockpit behavior as controls for any spatial change.

Prefer terminal/headless checks. Follow repository restrictions on development
servers and visible GUI use; this prompt does not authorize starting a server.
Do not publish or change upstream PRs. Keep the handoff explicit about what was
reproduced, what changed, and whether the original reported artifact still
needs a pilot confirmation.
