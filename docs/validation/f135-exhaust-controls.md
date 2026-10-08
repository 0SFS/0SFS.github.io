# F135 dry glow controls and afterburner sound causality

Recorded 2026-10-07. The user now clearly sees the faint red dry exhaust at
night and considers that appearance satisfactory. This is current user visual
feedback; the hour, map provider, camera, throttle, conversion and native
telemetry were not captured. It does not measure F135 radiance or accept the
deck interaction and AB transition. The sky agent's concurrent environmental
work is preserved.

## Dry brightness and its baseline

Afterburner → Exhaust appearance owns **Dry exhaust brightness**,
`osfs.exhaust.dryIntensity`, 0.5–3× with a default of 1×. The tab is present only
on aircraft with afterburner metadata. The multiplier changes displayed gas
emission and its approximate nearby light with native augmentation off. Metal
emission, physical source power, temperature, fuel, spectral tables, attenuation,
geometry and sample budgets are unchanged. At native AB selection, display
returns to the existing AB gain; this presentation switch at nonunit settings
is not a claim about physical ignition.

The default is **the unchanged current physical-model prediction**, not a
calibrated F135 measurement. The source integrates the non-gray particle
spectrum at an imposed native exhaust-bath proxy. The generic EGT expression
is not a qualified nozzle station, and particle loading remains assumed
(`κ550 = 0.025/m`). Dry operation receives no AB reacting parcel. These limits
and the separate carrier/deck hypotheses remain in the
[mechanism investigation](f135-dry-vtol-mechanism.md).

This is a cheap display adjustment: one existing shader uniform and the
existing light gain change. The physical source cache is independent of the
new multiplier; no table integration, upload, ray sample or resource is added.

## What zero afterburner sound means

Previously `osfs.sound.afterburnerVolume = 0` removed only added AB amplitude.
The main jet cutoff and the High tier's fine-mixing frequency still changed
from native augmentation. Native thrust and total fuel also change other
components. Those paths explain why zero remained audibly different; this was
not evidence that the synthesized change had been calibrated to a real F135.

The same saved sound setting now lives only in Afterburner → Afterburner sound.
Zero removes every deliberate AB gain and spectral morph. The base engine
continues responding to native shaft speed, thrust and total fuel. Real
afterburning affects several sources: NASA's
[TF30 static/flyover measurements, TP-1372](https://ntrs.nasa.gov/citations/19790004874)
separate mixing, shock and internally generated noise, with extra internal
noise attributed to afterburning. These measurements support multiple mechanisms;
they do not validate our F135 levels or spectrum.

## Why sound must follow burning

The prior audio source responded to the augmentation flag with its existing
10 ms dezipper. Optical reaction emission responds to actually burned native
AB fuel. In the [retained native trace](../../validation/evidence/aircraft/f35b/plume-spatial-2026-10-06/native/trace.csv),
the flag first becomes active with **zero** burned AB fuel; the first positive
burned observation arrives about **83.3 ms** later. Imposed mean gas temperature
then rises over seconds. Those different inputs establish a simulation cause
for a sound lead, without measuring the user's device or rendered pixels.

The corrected AB audio target uses valid native burned AB fuel divided by
native total fuel, bounded to 0–1 and gated by native augmentation. This is a
continuous, uncalibrated acoustic mixture proxy, not an F135 SPL law. Missing
burned-fuel observations suppress the added AB source rather than inferring
combustion from throttle or selection. Existing transport interpolation and
audio dezippering remain; no startup fade or visual synchronization timer is
introduced. The native engine, fuel ramp, operational hover AB inhibit, metal
temperatures and lifecycle are unchanged.

Chemiluminescence is reaction emission; it need not wait for metal to heat.
NASA's [jet-fuel flame imaging, TM-2013-217884 §4.1](https://ntrs.nasa.gov/api/citations/20140000730/downloads/20140000730.pdf)
distinguishes CH*/C₂* emission from soot incandescence. Command-to-ignition
delays can exist, as historical
[NACA altitude ignition tests, RM E53B02](https://ntrs.nasa.gov/citations/19930087619)
show. Neither experiment establishes modern F135 timing. A cold liner warming
slowly is plausible; that alone cannot justify a long delay between audible
combustion and unobstructed flame emission from the same burning region.

This correction removes a flag-only AB sound source. It cannot yet prove
simultaneous *perceived* onset: visibility, optical assumptions, acoustic
position, output buffering and native modeling still matter. In particular,
native thrust still switches to its wet table on selection while burned fuel
ramps. That can change the base jet sound early and remains a JSBSim engine
discrepancy, not something to disguise with a second audio delay.

## Checks and acceptance

Incremental typecheck and lint passed. The related run initially had seven
failures across four files: the genuine saved-zero startup gain leak, a warm
native fixture that skipped cold ignition, and two stale Sound-panel assertions.
The corrected four files passed **64 tests**. Dry-source/cache, independent
metal emission, slider bounds/persistence and conditional-tab checks passed
in the related run.

The single final `npm run ci` reached **2,016 passing tests and one existing
expected failure in 186 files**, with one stale offline-tool ABI assertion
still expecting 33 fields/version 3. That fixture was updated for 34 fields/
version 4 and its four tests passed in a focused rerun. Incremental lint then
passed, followed by the production build and installed/emitted JSBSim/audio,
exhaust and engine-asset verification. The whole suite was not repeated. These
checks cover the combined working tree, including preserved concurrent work;
they are not an isolated release qualification.

The pinned DSP build produced 50,977 bytes, SHA-256
`100eefa8f3eaec2e3f3cfee12086732871f7aa0cb96f157b87f61e7ec0b6b677`,
with matching source/export provenance. Actual-WASM checks cover selection
with no burning, missing/invalid thermal observations, continuous burn onset
at 44.1/48 kHz, initial zero gain, Low/Med/High deliberate-AB mute behavior,
bounded output/resources, and unchanged SF50 golden output. Real SDK checks
cover the cold selected-but-unburned interval and preserve powered-lift AB
inhibition. These are source/contract checks, not real sound-device timing.

[Acceptance receipt and retained logs](../../validation/evidence/aircraft/f35b/exhaust-controls-2026-10-07/acceptance.json)
retain failures and follow-ups separately. GPU/browser, physical listening,
performance and perceived synchronization checks remain unrun under the
existing restrictions. The user's dry visual feedback is separate from
physical calibration and AB visual/audio acceptance. No deployment was made.
