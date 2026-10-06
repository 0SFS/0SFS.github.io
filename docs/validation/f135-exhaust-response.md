# F135 afterburner response and rendering work

Recorded 2026-10-06. This is the next implementation checkpoint after the
[exhaust source correction](f135-exhaust-source-correction.md). The user reports
substantially improved appearance and usable performance, with a smaller
remaining lead of afterburner sound over visible emission. These are user
observations, not measured latency or a GPU benchmark. The user declined GPU
testing; none was run. **Dry powered-lift appearance and complete F135 physical
calibration remain open.** The [dry powered-lift observation ledger](f135-dry-vtol-observation.md)
separates night-reference evidence, current source bounds, display limitations
and the next acceptance targets.

The [acceptance receipt](../../validation/evidence/aircraft/f35b/exhaust-response-2026-10-06/acceptance.json)
and [application record](../../validation/evidence/aircraft/f35b/exhaust-response-2026-10-06/application/README.md)
retain this checkpoint's source, generated-profile metadata and check logs.
Native fork.16, aircraft engine XML, two solid-temperature states, rigid nozzle
geometry and operational powered-lift augmentation inhibition were preserved.
Audio source code was not changed in this checkpoint.

## Why the sound could precede visible emission

Audio declares startup combustion from positive fuel flow or native running;
its afterburner contribution follows the native augmentation flag and thrust.
The preceding optical implementation had no chemical source and evaluated
particle continuum at a single imposed exhaust-bath temperature. These are
different signals, so there was no reason for their visible and audible
thresholds to coincide.

The [retained native trace](../../validation/evidence/aircraft/f35b/plume-spatial-2026-10-06/native/trace.csv)
already resolves this distinction without a new engine run. At the first active
AB observation, gas is 1004.76 K and burned AB fuel is zero. Burned AB fuel first
becomes positive about 0.0833 s later. Gas then reaches 1180.21 K one second
after the active flag and 1366.51 K after two seconds. The native gas is an
algebraic mixture of the legacy EGT bath and heat from lagged fuel flow; it is
not a resolved local reaction temperature. These timings explain a plausible
source of the reported lag, not the user's exact displayed pixel or audio-device
latency. Optical columns in that historical trace describe its historical model.

Startup also has positive fuel while native running is still false. In the
retained cold sequence, the first fueled sample has gas 291.82 K and metal
approximately 286.5 K. The visual source is already eligible at that point:
the renderer does not wait for native running. Audible combustion with little
continuum emission therefore does not establish a missing running-state gate.
The aft visible chamber is the modeled augmentor and turbine-exit hardware;
main-combustor flame is not assumed visible through the turbine.

## Conditional internal combustion source

The [offline reacting-parcel model](../../scripts/exhaustOptics/combustion/README.md)
adds a sourced, explicitly conditional CH(A) estimate. Cantera solves an
adiabatic constant-pressure n-dodecane parcel; CH(A) production, radiative loss
and collisional quenching are postprocessed using the documented rate sets.
The [32-case evidence](../../validation/evidence/aircraft/f35b/combustion-parcel-2026-10-06/README.md)
spans 600–1200 K, 0.2–5 atm and equivalence ratios 0.8 and 1.0. The current bake
selects the 16 stoichiometric cases. Offline solver convergence, sampled
interpolation errors and rate-set disagreement are recorded separately from
engine calibration.

[engineReactionEmission.ts](../../src/flight/aircraft/engineReactionEmission.ts)
interpolates product temperature and CH-band joules per kilogram of converted
fuel. Runtime multiplies that conditional yield by **actually burned native AB
fuel**, not the AB boolean. It does not replay the parcel's autoignition delay:
that delay describes an isolated homogeneous reactor, while the input already
reports burning. Missing parcel inputs suppress this source.

The CH source occupies the authored 0.75 m internal augmentor region. A
cell-averaged spatial kernel distributes the computed watts inside that region;
it is a geometry hypothesis, not a solved flame front. Resolution checks require
a zero node before the exit so interpolation cannot move internal chemical light
into open air. An exterior-only or insufficiently resolved domain receives no
CH source. C2 remains unavailable; there is no exterior excited-species transport.

The selected inputs remain consequential assumptions: a 15 mol% O2 oxidizer,
stoichiometric local parcel, reaction pressure equal to ambient pressure,
legacy EGT as the reactant-temperature proxy, and a 431 nm band with 2 nm Gaussian
width as a reduced CH(A-X) spectrum. They are not measured F135 composition,
augmentor pressure, temperature or full spectroscopy. The nominal retained
1000 K / 3 atm / phi 1 result is 10.8044 J/kg in the modeled CH channel and
2347.05 K product temperature; runtime pressure need not be that nominal case.
The table reports clamped inputs. Neither these numbers nor the returned blue
component establish a uniquely calculated F135 color.

## Unresolved temperature mixture

The continuum now evaluates a two-point temperature distribution when burned AB
fuel is positive. Its hot endpoint comes from the parcel; its cold endpoint and
hot mass fraction preserve the native mean temperature under a **constant-cp**
enthalpy approximation. Equal pressure and molecular weight convert the mass
fraction to a volume fraction before mixing Planck radiance. Downstream variance
decays over the declared, uncalibrated 0.5 m mixing length.

This distinguishes emission from a mixture of hot and cool parcels from emission
at their mean temperature. It does not add a new native thermal integrator,
change solid temperatures or close the engine energy budget. The common grey
particle loading and fuel-power ceiling remain uncertain inputs. The mixture
preserves the stated constant-cp mean, not a species-dependent enthalpy integral,
and the parcel does not determine soot loading. Dry operation receives no new
reacting parcel or artificial primary-combustor flash. The dry night-video
discrepancy therefore remains unresolved.

## Work avoided during rendering

- [Gas support](../../src/flight/aircraft/engineGasSupport.ts) compares reusable
  relative matrices, aperture coordinates, length and spreading before building
  rings, sections, domain knots or bounds. Unchanged support returns its prior
  snapshot; moving or rebasing the whole aircraft does not invalidate it. Root
  world transforms are still refreshed for the metre-scale guard, including
  ancestor changes within one render ID.
- [The shader](../../src/flight/aircraft/engineGasSupportShader.ts) receives
  precomputed inverse coefficients and conservative section bounds. Ray-box
  intervals are prepared once per ray; sample lookups reject irrelevant sections
  before solving their coordinates. [Source sampling](../../src/flight/aircraft/createEngineExhaust.ts)
  uses hardware float filtering where available and retains the explicit bilinear
  fallback. Support uniforms upload only when the support revision changes.
- [Opaque depth](../../src/flight/aircraft/engineExhaustDepth.ts) limits its draw
  list to possible foreground occluders in the plume's screen region. It retains
  conservative handling of uncertain, instanced and deformed bounds. Compilation
  uses the private depth render-pass ID so it cannot replace a main-pass effect.
  Its render target is removed and disposed with the plume.
- Physical field caching includes the newly consumed EGT, pressure and burned
  AB fuel. Display-only changes reuse the source. Pose-only changes do not alter
  its physical domain. No wall-clock throttling or delayed thermal update was
  added to conceal cost.

The user-visible ray budget defaults to **32 samples**, with the existing
4–128 range, instead of the preceding 128-sample default. Field resolution remains
64 × 32 by default; opaque occlusion remains enabled at viewport resolution.
These are editable settings in Renderer → Aircraft exhaust. Lower ray counts
can miss narrow source regions; the prior 128-sample numerical bound does not
qualify the new 32-sample default. No device cost, energy savings, frame rate or
GPU accuracy result is claimed. The user's report establishes improved usability
in their session, without quantifying the improvement.

## Software checks and remaining acceptance

The single final `npm run ci` passed **174 files, 1,850 tests and one existing
expected failure**, followed by build and artifact verification. Incremental
typecheck and lint passed. The related run initially had two stale expectations
for new property inputs and chemistry status; corrected files passed 58 tests.
Focused renderer/support/depth and reaction-source reruns passed after fixing
same-render-ID matrix freshness and extending source-key coverage. The
[retained logs](../../validation/evidence/aircraft/f35b/exhaust-response-2026-10-06/application/README.md)
include failures and their successful follow-ups.

Tests establish parcel interpolation, the stated mean-enthalpy identity, positive
burned-fuel causality, integrated CH power, interior confinement, no AB-flag-only
color change, missing-input behavior, cache invalidation and renderer lifecycle.
They do not establish real startup/AB flame timing, dry exhaust radiance, actual
camera response or F135 calibration. The smaller remaining audio lead and dry
powered-lift discrepancy need separate source/timing investigation. Matching a
video by raising a bulk temperature, replaying ignition audio as a flame timer or
adding a brightness multiplier would not resolve those physical questions.
