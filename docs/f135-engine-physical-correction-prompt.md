# Follow-up prompt: F135 nozzle mechanics, heat and emitted light

Recorded 2026-10-06; implemented in the [physical-correction report](validation/f135-engine-physical-correction.md).
The instructions and original acceptance decision below are retained. Terminal
mechanical, thermal and optical checks do not qualify flight-app GPU appearance.

## User report and acceptance decision

The full engine is useful as a realistic-looking test-stand asset, but its
behavior is not accepted as a physical simulation. The user reports that nozzle
metal visibly changes shape, and starting the engine produces an immediate red
glow followed by purple. They want moving inner and outer segments and a
defensible physical explanation for emitted light, rather than colors tuned
until the engine looks dramatic. Preserve the useful model and stand integration.

These are user observations, not a captured cold-start trace. Initial thermal
state, throttle/augmentation, elapsed simulation time, material identity and
display settings were not recorded. Do not assume that the observed purple is
metal incandescence or that an energy-conservation defect has already been
measured. Shape preservation and energy balance need separate tests.

## Instructions for the next agent

Work in `/Users/felg/gh/0sfs`. Read `AGENTS.md`, the
[reconstruction report](validation/f135-engine-reconstruction.md),
[original brief](proposals/f135-engine-rebuild.md) and its retained references.
Inspect the current dirty tree and native SDK version; other work can have
advanced since this snapshot. Implement the corrections below, with evidence.
The original reconstruction's passing tests do not establish physical fidelity.

0sfs owns engine assets, aircraft animation, engine instruments and integration.
JSBSim owns engine state, thermal dynamics and persistence. FOSS Earth owns
shared scene color management, exposure and rendering infrastructure. Make fixes
in their owners, preserving current native lifecycle fixes and package adoption.
Keep reusable mechanisms driven by engine-profile data; do not fork the renderer
or thermal simulator for each aircraft.

### 1. Replace deforming aperture geometry with articulated components

At this snapshot, [source.mjs](../scripts/f135Engine/source.mjs) creates
`F135_FlowPath`, `F135_SlidingSeals` and `F135_OuterPanels` using `openPositions`.
[engineNozzleRig.ts](../src/flight/aircraft/engineNozzleRig.ts) applies aperture
as a morph influence. The radial coordinates change at fixed axial stations;
this is a deforming aperture, not a collection of rigid flap motions. Continuous
coverage alone is insufficient acceptance. The three swivel-bearing sections
already use rigid rotations and must be assessed separately.

Research the PW-600 mechanism and author distinct internal convergent/divergent
flaps, seals and external panels as supported by evidence. Identify pivots,
sliding constraints and linkage relationships. Label unknown B-specific lengths,
counts and schedules as approximations. The source describes internal overlapping
flaps, external fairing flaps and related throat/exit areas; it does not supply
the complete PW-600 mechanism or dimensions.
[Hamstra and McCallum, §2.2.1 and §6.2.2](https://onlinelibrary.wiley.com/doi/full/10.1002/9780470686652.eae490).

Each rigid part must retain its local shape and dimensions as aperture changes.
Use rotations/translations and real overlap/sliding. Do not close holes by
stretching panels, expanding their width or morphing a hidden continuous metal
sleeve. If evidence calls for flexible seals or thermal expansion, model that
explicitly with bounded deformation; it cannot substitute for aperture mechanics.
Keep throat A8, exit A9 and native command distinct. A plausible linkage does not
make the inherited generic native nozzle schedule a calibrated F135 schedule.

Test the actual exported geometry over full and intermediate aperture, conversion
and yaw. Check rigid-part edge lengths and triangle areas, constant transform
scale, attachment constraints, overlap, airframe clearance and correct occlusion.
For closed solid meshes, also check signed volume; for surface-only assets,
declare thickness/mass separately instead of treating an open mesh volume as
physical mass. Prevent unintended holes without banning legitimate exterior
seams. Full and installed exports must share the same mechanical parts and poses.

### 2. Diagnose startup and account for stored thermal energy

Capture a true cold-soaked, stopped start; an already-running initialization;
and a hot restart independently. At this snapshot,
[engineTestStand.ts](../src/flight/engineTestStand.ts) bootstraps
`engineRunning: true`. Opening the stand is therefore not itself a cold-start
experiment. Record every initial temperature and initialization path rather than
adding a cosmetic startup fade.

Trace simulation time, fuel flow/staging, N1/N2, running state, gas temperatures,
every solid temperature, nozzle state and the heat terms used by each solid.
Gas and solids have different states; N1/N2 are shaft speeds. Audit hot gas bath
assumptions, heat capacity, cooling, conduction/coupling and radiative exchange.
Document units and provenance for coefficients. Preserve realistic thermal lag
and residual heat after shutdown, without inventing an arbitrary delay or a
required bright glow at idle.

For each lumped solid, verify stored energy change against the integrated signed
heat transfers: `ΔU = ∫(Q̇in − Q̇out) dt`, with temperature-dependent capacity if
modeled. Report numerical residuals and timestep convergence. Identify imposed
gas/coolant reservoirs and unmodeled flows: a wall balance driven by prescribed
baths does not close the entire engine's energy budget. Avoid double counting
heat exchanged between regions, radiated power or fuel energy. State what is
bounded versus solved, and do not claim global conservation from a local test.

Keep the native fixed-step state authoritative. Pause and zero-time calls add
no heat; reset, recovery and Location relocation preserve intended thermal state.
Display settings and render rate must never alter physical temperature or fuel.

### 3. Make every light contribution explainable

The current code has some real color science; the problem is not solved by
introducing another temperature-to-RGB gradient. The metal table in
[bake.mjs](../scripts/exhaustOptics/bake.mjs) uses Planck radiance and the CIE
observer, retaining luminance. Its material emissivity, native temperatures and
renderer exposure still require justification. The gas path normalizes spectra
and RGB, then applies an independently assumed brightness envelope.
[The current profile](../scripts/exhaustOptics/f135-visible-approximation.json)
explicitly uses guessed soot/band contributions and a linear temperature-based
visibility envelope. These are hypotheses, not measured F135 radiance.

Isolate solid self-emission, gas/particle emission, reflected light and the nearby
scene light in diagnostic views. Identify which contribution produces the user's
red-to-purple transition. Trace native values through LUT selection, material
binding, linear HDR values, blending, exposure, tone mapping and display encoding.
Check that the scene light cannot tint cold hardware and be mistaken for that
hardware's own heat. Capture actual engine state when switching optical banks.

Derive solid emission from each material's temperature and spectral emissivity.
Retain absolute radiance/luminance through the physical portion of the pipeline.
Grey-body heating is not an arbitrary red-to-purple color ramp. Purple reflected
light or photographed gas emission is a different question and must not be banned
to hide a bug. NIST describes temperature/Planck-based radiance calibration;
it supplies no F135 temperatures or surface emissivities.
[NIST source radiometry](https://www.nist.gov/programs-projects/spectroradiometry-sources).

For gas, use a documented reduced emission/absorption model with dimensional
quantities and explicitly uncertain optical depth, particles and excited-species
contributions. Temperature alone does not fix those inputs. Normalizing a spectral
shape is acceptable only if its physical amplitude is retained or separately
justified; do not brighten a negligible cold spectrum simply because its largest
RGB channel was normalized to one. Identify the approximation's energy source
and radiated-power bounds. Do not label an arbitrary opacity/intensity curve
energy conserving. Public chemistry references establish possible mechanisms,
not the current CH*/C2* mixture weights for this engine.
[NASA jet-fuel flame imaging](https://ntrs.nasa.gov/citations/20140000730).

Retain the actual night powered-lift and pink/violet test-cell observations in
the original brief. Treat them as constraints with unknown camera response,
not calibrated spectra and not permission to force all exhaust purple. Preserve
operational hover AB inhibition. Unknown parameters need sensitivity ranges and
documented uncertainty; tuning a video match cannot become a claim of certainty.

Precompute expensive spectral/kinematic data offline where useful, with source
provenance and independent numerical reference checks. Runtime should use cheap
transforms/interpolation. Test interpolation error, endpoints and invalid inputs.
Keep exposure and resource settings in their existing homes, respect readiness
and render-on-demand, and avoid adding per-frame spectral integration or numerous
lights as a substitute for a physical model.

### 4. Evidence required before declaring success

- A repeatable cold start → idle → 99% dry → conventional AB → 99% dry → shutdown
  trace, plus hot restart and powered lift. Include initial conditions, per-region
  heat/temperature, fuel/staging and display settings. Do not impose visibility
  at every power setting as an acceptance target without evidence.
- Geometry tests that fail the current stretching implementation and demonstrate
  rigid motion and continuous intended flow-path coverage in the replacement.
- Independent numerical heat-balance and spectral tests, rather than golden
  outputs that merely reproduce current guessed coefficients. Verify that an
  exposure change affects displayed light but not thermal state or emitted
  physical power.
- Contribution-separated rear and oblique appearance comparisons under recorded
  day/night lighting and fixed exposure. Clearly distinguish CPU/NullEngine
  checks from actual rendered evidence. Respect AGENTS.md: request-dependent
  browser/GPU runs and servers are not authorized by this saved prompt alone.
  State any visual qualification still requiring a requested run.
- Update the findings/hypothesis/discrepancy ledger and retain artifacts in
  `validation/evidence/`. Run changed-code checks and full CI once at completion.
  Preserve unrelated concurrent work, existing evidence and all build folders.

Keep the full-engine/installed-engine architecture, Earth-backed MSP runway 35
stand, Location controls, histories/CSV and native hold-down. Ground collisions,
gear, sound and unrelated flight-UI work are outside this correction. Finish with
what the evidence supports, remaining approximations and precise user test steps.
