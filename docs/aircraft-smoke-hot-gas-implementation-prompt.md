# Aircraft smoke and nonluminous hot-gas exhaust implementation

Work in `/Users/felg/gh/0sfs`. Read `AGENTS.md` first and the owner's instructions
in every sibling repository you edit. Preserve existing and concurrent work.
This is an implementation task, separate from the ongoing high-temperature gas
luminance and F135 audiovisual ignition work.

## Scope and ownership

Implement aircraft smoke/aerosol transport and nonluminous hot-gas exhaust
effects, including heat distortion where justified. Audit the existing smoke
implementation before replacing or extending it; this is not a greenfield
system. Aircraft installation, observations, transport and aircraft-specific
visuals belong in **0sfs**. General rendering, depth, transparency, lighting,
HDR and refraction defects belong in **FOSS Earth** and must be fixed/exported
there. Engine dynamics and physical engine boundary conditions belong in
**JSBSim**; do not invent them in the application to force a plume shape.
Name the owner before writing each new module.

Do not modify the current high-temperature emission model, chemistry tables,
particle emission spectrum, native gas/metal temperatures, rigid nozzle,
burned-fuel audio coupling or operational hover AB inhibit. Do not add luminous
smoke, a second flame, exterior chemical light, ignition fades or brightness
compensation to conceal the open AB onset mismatch. A shared rendering fix
must demonstrate how it affects unchanged emitters separately.

The UI home is **Exhaust**. Existing gas/luminance controls live in its **Gas
and luminance** section, smoke controls in **Smoke**, and AB controls in an
**Afterburner** section shown only on equipped aircraft. Add a **Hot gas**
section for this task's new controls. Keep existing setting IDs/saved values
and one home per control; use paragraph grids and continuous controls.

## Read and audit

- `docs/proposals/flight-settings.md` and `docs/foss-earth-relationship.md`
- `docs/validation/f135-exhaust-controls.md`
- `docs/validation/f135-dry-vtol-mechanism.md`
- `docs/proposals/f35b-fdm.md`, including retained observations and unknowns
- `src/flight/aircraft/createEngineSmoke.ts` and its tests
- `src/flight/aircraft/engineSmokeProfiles.ts`
- `src/flight/aircraft/createAircraftEngineVisuals.ts`
- `src/flight/aircraft/engineGasSupport.ts`
- `src/flight/aircraft/createEngineExhaust.ts` and `engineGasOptics.ts` for
  interface and optical-overlap constraints, not as permission to retune them
- FOSS Earth's current sky/environment and rendering contracts, plus
  `docs/render-on-demand.md`, `docs/ui-layout.md` and `docs/proposals/settings.md`

The current smoke is explicitly an artistic approximation: bounded pooled
sprites with world-history handling, a flipbook, a constant linear RGB and
profile drift/radius values. Determine which lifecycle/transport work is
already correct and retain it. Verify its exposure/lighting/gamma behavior;
do not treat a fixed grey sprite as measured aerosol optics.

## Physical and visual contract

Use primary sources. Separate measurements, modeling hypotheses, fitted
coefficients and unavailable inputs. Aircraft profiles must identify the
engine/installation they describe; do not copy F135 particle loading to every
engine. Unavailable observations must remain unavailable, with a defined
fallback that does not create fictitious emission.

Treat these as distinct effects:

1. **Smoke/aerosols:** emitted material transported and diluted in the world,
   with extinction and scattering appropriate to the available evidence.
   Quantify how particle/source settings map to mass or optical depth, or
   label them as presentation approximations with their limitations.
2. **Nonluminous hot gas:** a transported thermal/density disturbance. If heat
   distortion is implemented, derive the refractive-index response from a
   sourced model and declared composition/pressure/temperature assumptions.
   Distortion must vanish when the disturbance equals the ambient background.
   Do not represent invisible gas as an arbitrary coloured translucent cone.
3. **Condensation/contrails:** separate humidity/thermodynamic behavior. Do not
   imply that every visible white trail is smoke. Implement only if the input
   contract supports it; otherwise record this as outside the current scope.

Audit overlap with the existing luminous-gas field's particle absorption.
Define one accounting boundary for attenuation/scattering so a second smoke
layer does not double-count the same aerosol population in the same volume.
Keep source emission unchanged during this audit. Demonstrate isolated smoke,
isolated distortion and their composition with unchanged gas/metal emission.

Use actual aircraft pose, moving/vectoring nozzle support and simulation time.
Birth history must stay in the world as the aircraft moves or the floating
origin rebases. Account for velocity, wind and entrainment only to the degree
supported by the input/model. Cutoff, pause, seek, reset, model replacement,
teleport, provider/backend changes and disposal must have defined behavior.
Preserve the existing high-precision source/history coordinates.

## Runtime cost

Precompute expensive spectra, scattering/refraction coefficients and reduced
flow fields offline where useful; retain provenance, units and interpolation
error. Runtime should interpolate bounded tables and update reusable buffers.
Do not solve chemistry or CFD per frame, allocate per particle, introduce an
independent wall-clock animation loop, or increase the luminance ray budget.

Every resource decision is a named setting with a unit, bounds, default and
reason: particle pool, source/transport resolution, retention, update rate,
draw distance, distortion target scale/sample budget, and any cache limits.
Use actual costs, not opaque quality names. Reuse shared scene/depth/color
resources when correct; do not capture the complete scene separately for every
engine. No extra targets/draws/updates when a feature is disabled. Changed
visible content requests its own frame once; idle or hidden content requests
none. Prepare content hidden and reveal it only when ready.

## Checks, evidence and acceptance

Add meaningful checks for ambient/no-source limits, optical accounting,
transport/world attachment, floating-origin changes, vectoring geometry,
simulation pause/seek/reset, bounded pools, cache reuse and full disposal.
Use independent numerical references for table/interpolation checks. Test
fixed luminous source states with smoke/distortion toggled to establish that
the original source computation has not changed.

Run incremental typecheck, related tests and lint, then each changed owner and
consumer's final CI once. Keep logs under the owning repo's dated `build/`
folder and retain useful evidence under `validation/evidence/`, with a report
in `docs/validation/`. Correct individual failures with targeted reruns.

Respect the standing server/browser/build restrictions. Do not start or alter
the user's server. No browser/GPU/benchmark run is authorized by this prompt;
do terminal/numerical work and document remaining rendered acceptance. If a
later authorized GPU comparison is performed, record the real backend/device,
actual frames/settings, scene contributions and interference before qualifying
cost or appearance. Never report a performance improvement without measuring
it, or claim visual acceptance from a CPU/NullEngine test.

Deliver the implementation, controls, evidence and documentation. State which
effects are implemented and qualified, which inputs remain hypotheses, and
which rendered comparisons remain open. Do not deploy; deployment is held.
