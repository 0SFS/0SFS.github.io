# High sound for the SF50 and F-35B

High adds engine-specific procedural detail to the SF50's Williams FJ33-5A
and the F-35B's Pratt & Whitney F135, in cockpit and exterior listening modes.
It preserves Med as the default and as a comparison. The first delivery models
conventional engine sound and an approximate cabin transfer. It does not claim
measured FJ33/F135 acoustic accuracy, calibrated sound pressure, complete STOVL
sound or device qualification.

0sfs owns this work: sound sources, engine definitions, aircraft installation,
audio telemetry and DSP. [sound.md](../sound.md) remains authoritative for
shared budgets, lifecycle, transport, settings and performance qualification.
The [implementation ledger](../validation/audio-implementation-ledger.md)
records delivered behavior, checks and artifact hashes.

## Architecture and the first delivery

Use the existing AudioWorklet and original C++/WASM renderer. Engine definitions
choose parameters for physical source categories; aircraft installation supplies
position and exhaust orientation. Neither engine family, aircraft identity nor
a quality preset name substitutes for acoustic parameters. Shared interpolation,
Doppler, air absorption, cabin treatment, wind, tires and output protection remain
one bounded path.

The source model is procedural. High must run with no bank manifest, recording
download or decoder. Loading the shared worklet/WASM code remains necessary.
The earlier granular backend is not the fidelity gate.
A future licensed residual bank can add detail only after demonstrating that it
improves the procedural model and avoids duplicating tones, mixing noise, cabin
filtering, ground reflection or Doppler already present in the renderer.

Separating source, propagation and receiver is consistent with Rizzi and Sahai's
[NASA auralization report](https://ntrs.nasa.gov/citations/20200002351). Choosing
a bounded procedural implementation here is an engineering decision; that report
does not validate this renderer or either engine's tuning.

| Component | SF50 and FJ33 | F-35B and F135 |
| --- | --- | --- |
| Rotating machinery | Separate phase-continuous N1/N2 synthetic tones and partials, fan wake/bypass content | Lower machinery contribution under a stronger exhaust spectrum; distinct engine parameters |
| Combustor | Fuel/combustion-conditioned low-frequency broadband contribution | Independent fuel normalization and broadband balance; augmentation observes native state |
| Jet mixing | Separate low-frequency and fine-scale broadband contributions with mild directional shaping | Large-scale aft emphasis and independently shaped fine-scale content; angle and power change spectrum as well as level |
| Shock-associated noise | Disabled without engine-specific evidence | Independent broadband contribution allowed in dry high-power operation and augmentation; no automatic tonal screech |
| Installation | SF50 source placement and independent cockpit gain/cutoff | F-35B source placement, exhaust-axis orientation and independent cockpit gain/cutoff |

These categories describe the implemented reduced model, not independently
measured emitters. Synthetic frequencies are tuning references, not blade-pass
frequencies or inferred shaft RPM. Antialias all partials against internal sample
rate including Doppler. Keep noise streams independent where the component model
requires them; reusing a stream must not introduce an unintended tonal or coherent
artifact. Smooth direction, gain and filter targets without restarting phases.

The F135 shock component uses second-order high-pass and first-order low-pass
shaping to approximate the laboratory BBSAN model's `f^4` low-frequency PSD rise
and `f^-2` high-frequency fall, away from the digital Nyquist limit. Corners,
width, directionality and gain remain uncalibrated. Its continuous native-thrust
weight is not a measured onset curve; no ETR threshold has been mapped. The
low-frequency mixing component remains a reduced low-pass broadband model,
not a fitted Tam large-scale similarity spectrum.

The first delivery adds no crackle or nonlinear waveform model. A candidate
bounded `x × dx/dt` correction was rejected during software development: with
the mixing source isolated below output compression, it changed receiver-side
derivative skewness by approximately −0.30 at 44.1 kHz and −0.26 at 48 kHz
relative to zero correction, opposite to the intended positive steepening.
The [retained diagnostic and failed check](../../validation/evidence/audio/procedural-high-2026-10-05/rejected-waveform.json)
are synthetic results, not F135 measurements. The candidate
and its tuning parameter are excluded from the delivered model; ordinary spool
following is existing behavior, not evidence of new temporal fidelity.

Future waveform work should start from the nonlinear `p × ∂p/∂τ` term in the
generalized Burgers equation; see
[Chambers et al., NASA-CP-3335 Vol. 1, p. 153, Eq. 1](https://ntrs.nasa.gov/citations/19960055057).
A normalized correction with an artistic strength is not that pressure-domain
propagation model: it lacks the pressure scale, path length, density and sound
speed, and derivative limiting changes the equation. Before adopting a reduced
model, test the sign and magnitude of derivative statistics before and after the
complete receiver path at 44.1/48 kHz, both below compression and at gameplay
gain. Then compare matched-bandwidth measurements and listening results. An
altered sample distribution or different output is not evidence of crackle.

## What the evidence supports

The [Williams fanjet family specification](https://www.williams-int.com/wp-content/uploads/2026/01/Fanjet-Family-Specsheets-IND-11262018-01222026.pdf)
identifies the FJ33/FJ44 family and its turbofan architecture. It supplies no
FJ33-5A acoustic spectra, rotor-order calibration or SF50 cabin transfer for this
implementation. The local FDM's idle percentages, thrust and fuel flow constrain
the simulated operating state; they do not establish sound power. No calibrated
FJ33 acoustic dataset has been adopted. In particular, do not transfer FJ44,
NASA test-fan or military-engine numerical curves into FJ33 parameters and call
them measured FJ33 values.

Krejsa and Stone's [NASA/CR-2014-218421 fan-noise model](https://ntrs.nasa.gov/citations/20150000884)
separates broadband noise, tones and, for supersonic tip speeds, combination
tones. Its test-fan geometry and operating conditions matter. It supports the
component choices, not an FJ33 buzz-saw onset at an arbitrary N1 percentage.
Blade counts, rated shaft RPM, intake directivity, cabin attenuation and transient
spectra remain independent calibration inputs.

For F135, actual F-35B measurements provide stronger external constraints:

- [Neilsen et al., AIAA Journal 57, 3467–3479 (2019), DOI 10.2514/1.J057992](https://doi.org/10.2514/1.J057992)
  decomposes tied-down F-35B sound into large-scale mixing, fine-scale mixing and
  broadband shock-associated noise. Its abstract explicitly reports imperfect
  fits at multiple aft spectral peaks, high frequencies affected by nonlinearity,
  and low frequencies in the maximum-radiation region. Three idealized bands
  alone do not establish fidelity.
- [Vaughn et al., JASA 144, EL242–EL247 (2018), DOI 10.1121/1.5055392](https://doi.org/10.1121/1.5055392)
  reports BBSAN at 75% engine thrust request and higher, including dry operation;
  it is absent at the measured idle, 25% and 50% conditions. Its introduction
  identifies unavailable F-35B temperature and Mach data and its results caution
  that laboratory peak-level/bandwidth trends do not transfer directly. An
  afterburner-only shock gate is incorrect; the implementation's dry-thrust proxy
  remains a documented approximation.
- [Vaughn et al., AIAA 2019-2664, DOI 10.2514/6.2019-2664](https://doi.org/10.2514/6.2019-2664)
  relates F-35B shock events to crackle and a prior listening study. Pressure
  derivative skewness is a relevant metric; pressure skewness alone is inadequate.
  This first delivery does not model the measured crackle percept.
- [Reichman et al., AIAA 2016-1888, DOI 10.2514/6.2016-1888](https://doi.org/10.2514/6.2016-1888)
  models nonlinear propagation from actual F-35B ground run-ups. Nonlinear effects
  appear at dry power and depend on angle, power and propagation. A common
  distance-independent crackle layer cannot be called that physical model.

For reproducible source review, the author-hosted manuscript records are
[three-way decomposition](https://physics.byu.edu/docs/publication/3263),
[BBSAN](https://physics.byu.edu/docs/publication/3197),
[crackle](https://physics.byu.edu/docs/publication/3334) and
[nonlinear propagation](https://physics.byu.edu/docs/publication/2814).
On 2026-10-05 their indexed primary text was available, but fresh full-text opens
redirected to university sign-in. Numeric curve extraction is pending accessible
full-text inspection; this first increment does not claim digitized calibration.

## Geometry and operating state

ETR in the military measurements means engine thrust request. It is not N1,
N2, normalized throttle or the current JSBSim thrust normalization. Record any
future mapping from measured operating points to simulated state explicitly.
Until then use native thrust, spools, combustion and augmentation only as bounded
proxies; do not label a parameter or fixture “measured 75% ETR” because N1 is 75%.

The exhaust-axis vector points downstream in the same physical frame as source
and listener positions. Normalize and validate it; an unavailable orientation
falls back to finite, nondirectional synthesis. Never derive the direction from
the camera orientation. Apply changes through the versioned snapshot/renderer
contract and test both transports, reset epochs and aircraft replacement.

The F-35B near-field studies use inlet-relative angles and a microphone array
reference point downstream of the nozzle. A nozzle-centered cosine in the app
is not automatically the same angle. Ground-plane measurements also include
installation/reflection effects. Before fitting a curve, retain its angle
convention, source/reference position, microphone height, range, ground,
bandwidth and power condition. Do not fit already propagated data as a dry
source and then apply its absorption or reflection a second time.

Exterior and cockpit are separate validation domains. Exterior noise reaching a
microphone cannot establish a cabin transfer, structure-borne paths, helmet or
headset attenuation. The initial cockpit treatment remains a clearly identified
engine-specific gain/filter/short-IR approximation. Preserve the Sound tab's
acoustic-viewpoint blend and level controls. UI gain and the limiter prevent
output clipping; they do not calibrate real sound pressure or perceived loudness.

## F-35B conversion and later STOVL sound

The first delivery may follow a valid native main-nozzle orientation during
conversion, while still rendering one approximate main-engine source. It must
not fabricate LiftFan operation from aircraft identity, flap position or
afterburner state. An active augmentation observer remains authoritative;
audio must not recreate the flight controller's conversion mask.

Full STOVL sound is a later milestone requiring independent LiftFan and roll-post
sources, source orientation/position, valid fan/shaft or thrust-state telemetry,
and a separately qualified impingement model. The [actual F-35B vertical-landing
study, AIAA 2015-2377](https://physics.byu.edu/download/publication/2693)
describes these sources on p. 2, measurement geometry on p. 3, changing
directivity on pp. 4–7, and spectral/interference changes on pp. 8–10. Impingement
is a proposed explanation for part of the measured change, not a license to
assign an exact unmeasured tone. Hover, descent and touchdown must be assessed
separately from conventional static run-up. Main-nozzle vectoring alone is not
complete STOVL sound.

## Resource contract

Keep the provisional High envelope from [sound.md](../sound.md#1-tier-ladder-and-resource-envelopes):
13 total oscillators, nine total independent noise sources including tire,
16 biquads plus one first-order filter, one mono convolver with at most
40 ms/2,048 padded taps, no grains,
256 KiB compressed code/config, 32 MiB resident and 64 MiB loading peak.
The proposed p95 budget remains 0.45 ms per 128 frames. It is a target, not a
measurement or scheduler guarantee. Correct source accounting before claiming
compliance: Low has six and Med seven total noise streams including tire.

The current source layout processes at most nine runtime biquads in Low,
ten in Med and twelve in F135 High, including the tire and shared output
filter. F135 High also has one first-order shock-band low-pass. FJ33 High
disables the shock component, so its maxima are eight noise streams and
eleven runtime biquads. A separate biquad constructs the synthetic IR during
setup; its work and IR replacement cost still belong in transition accounting.
The sixteen-biquad High envelope is a ceiling, not a claim that sixteen filters
are active. Diagnostics reporting a selected cap are not active-source meters.

Expose actual partial/source counts and IR duration in the existing Sound
section, with units, allowed bounds, defaults and reason. A lower source cap
must stop processing omitted sources; a counter alone is insufficient. Zero
engine volume must produce exact engine silence once its fade settles, with
tires independently available. Aircraft replacement must clear
profile-specific temporal/filter/delay/IR state so F135 cannot inherit an SF50
cabin response. Changing a cap or direction preserves bounded fades and cannot
allocate, wait or grow memory in the audio callback.

## Verification and qualification

The following are distinct gates. Record completed and pending gates in the
ledger without converting a software pass into an acoustic or device claim.

1. **Software behavior.** Run the actual WASM at 44.1/48 kHz for both engine
   definitions. Exercise independent spool/thrust/fuel changes, start/rundown,
   dry/augmented states, cockpit/exterior, forward/side/aft directions,
   stationary/moving listeners, invalid/missing direction, epoch resets,
   replacement, caps and zero-volume isolation. Check finite limited output,
   stable memory, source counts and real cap enforcement. Assert material
   directional and spectral response with deterministic seeds rather than
   merely testing that two output buffers differ.
2. **Acoustic calibration.** Adopt legally usable reference measurements with
   geometry, engine state, bandwidth and propagation recorded. Fit on one set
   and assess independent states/angles/ranges. Report narrowband PSD and
   one-third-octave levels, peak frequencies/bandwidths, angular ratios and
   residual error. For crackle, match derivative method, bandwidth, sample
   rate and window before comparing derivative skewness and waveform events.
   Choose numeric error tolerances from reference uncertainty and digitization
   error before scoring; do not invent a universal dB pass limit.
3. **Listening.** Compare Med and High with level-matched, randomized repeats
   for each engine, cockpit and exterior separately. Include idle, acceleration,
   dry high power, F135 augmentation, cruise and shutdown. Record listeners,
   playback route, preference, artifacts and disagreements. Also compare at
   normal gameplay gain, because output compression can mask source detail.
4. **Device performance.** Follow sound.md's physical-output, thermal,
   integrated-scene and detector protocol only when requested. The current
   ceilings do not authorize claims of a qualified device. Explicit High may
   run labelled **Not yet validated**; Auto remains governed by qualified
   profiles. No tier is currently qualified on a device.
   Current admission matches loaded DSP bytes, engine/renderer identities and
   the supplied device/browser/route/rate/transport context. This is not complete
   application-build attestation. Before adopting any real qualification record,
   freeze the full app build, worklet and engine-setup hashes as well; unchanged
   engine IDs or DSP bytes do not prove unchanged parameters or integration.
5. **Further models.** Validate crackle and temporal waveform behavior, STOVL,
   true nonlinear range evolution, richer
   cabin transfer or optional licensed residuals independently before claiming
   that capability. These are not prerequisites for the bounded conventional
   procedural increment and are not delivered by its software tests.

Build changes under `src/flight/audio/dsp/` with `npm run build:audio` and retain
the WASM/provenance together. Use related tests and the repository's final CI
once; keep outputs under `build/`. Runnable validation belongs in `scripts/` or
`tests/`, retained evidence in `validation/evidence/audio/`. No benchmark,
physical listening result, cleared recording or measured acoustic calibration
is implied by this proposal.
