# SF50 flight model, simulation boundaries, and validation

Status: SF50 development runtime integration implemented; the full proposal remains in progress

Date: 2026-09-11

Implementation update (2026-09-11):
- Implemented: aircraft FDM/profile plumbing, per-aircraft stance/engine metadata, validated profile-scoped package manifests, and clearance queries using the loaded model's native wheel and structure contact coordinates and current CG.
- Implemented: an independent `sf50` JSBSim package with a provisional direct-thrust FJ33-5A schedule, source-informed geometry, retractable physical gear, turbine gauge property mappings, and a clipped V-tail ruddervator mixer.
- Implemented: profile-aware yaw conversion, startup controls initialized from physical state, runway flap/gear presets applied before `RunIC`, command and actual gear-position snapshots, physical gear observation for the visual rig, and measured V-tail hinge bindings.
- Implemented: reload-based aircraft selection. The active aircraft retains its matching mesh, FDM, gauges, controls, and terrain/contact state until the selected package boots together.
- Implemented: aircraft-specific visible-body collision probes and a corrected dorsal-engine thrust-line datum. Body probes are approximate empty-CG geometry, and the installed engine location/tilt remains provisional.

### Integration regression evidence (2026-09-11)

The development runtime milestone is implemented. This does not mark every architectural or performance milestone below complete.

- `npm test -- src/flight`: 430 tests passed across 48 files, including 23 new SF50/package cases (18 exercising the real Wasm SDK and five manifest rejection cases).
- `npm run build`: TypeScript and the production Vite build passed. The existing large renderer dependency chunk warning remains.
- ESLint passed for the changed TypeScript files and JSBSim integration directory; the final added thrust-line test also passed lint.
- Recorded environment: Node `v26.8.2`, macOS `darwin/arm64`, `@0x62/jsbsim-wasm` `1.2.4-beta.4`.

The [SF50 integration suite](../../src/flight/jsbsim/sf50.integration.test.ts) covers package isolation, geodetic initialization, the 120 Hz native timestep, startup input continuity, roll/yaw signs, V-tail mixing and moment signs, physical gear transit, partially extended gear across resets, runway flap/gear configuration, turbine response and fuel use, dorsal thrust pitching moment, and deep-penetration handling. It also compares trajectories after equal accepted physics steps at 10/30/60/120 display FPS; low-FPS catch-up drops wall time, so this is not a claim of identical real-time progression.

Actual browser navigation/rendering, deployment-base-path loading, device performance, and AFM performance accuracy were not validated by these checks. The reload-selection test runs in jsdom and checks selection persistence and active-model coherence, not a completed browser navigation.

### Remaining implementation and validation

Follow-on implementation (2026-09-11, calibration not yet validated):

- Added published AFM takeoff/landing fixtures with calibration and holdout roles, a source-aware acceptance evaluator, and a headless Wasm baseline runner. The runner reports setup/procedure blockers as well as numerical errors; these additions do not establish that the model matches the AFM.
- Added a private, typed flight-model driver used by the baseline runner. The interactive application's existing SDK access has not yet been migrated.
- Implemented native executive disposal, model-view invalidation, and bounded model-load diagnostics in the canonical jsbsim-wasm source checkout. The SDK build, typecheck, and all 17 SDK tests passed; the changes have not been published or adopted by the application's installed package.
- The initial baseline also passed 11 driver/acceptance tests, but exposed coupled pitch/flight-path initialization and a full-power engine startup transient during landing. The driver now explicitly resolves the requested angle of attack and recomputes the restored power command at zero timestep; new regression and runner checks cover those initial-state contracts. Performance calibration remains separate from these initialization corrections.
- See [SF50 performance validation](../validation/sf50-performance.md) for source pages, commands, tolerances, and the remaining calibration prerequisites. The earlier 430-test result predates these additions.

- Source-led aerodynamic and propulsion calibration, published-weight performance scenarios, envelope protection thresholds, and independent validation. The default development loading is not the published takeoff or landing calibration loading; passing integration tests does not establish those performance figures.
- The broader private-driver/typed-observation boundary, full aircraft capability metadata, optional wheel/diagnostic paths, parameter import/export, and live model replacement described below. Reload-based selection is the implemented transition mechanism.
- Generic native ownership/disposal and actionable model-load diagnostics in `jsbsim-wasm`, rather than new application workarounds. The integration tests explicitly delete their native executive; that does not demonstrate that application disposal is fixed.
- Browser/deployment checks and representative device performance measurements.

Supersedes: [SF50 flight model and the per-aircraft FDM seam](sf50-flight-model.md)

## Objective and decisions

Build a credible, source-traceable Cirrus SF50 within an open-source simulator
whose users choose compatibility, performance, assistance, and physical detail.
The intended owner demonstration should show recognizable aircraft behavior and
a repeatable path to improving it. There is no next-day delivery constraint:
fixing shared foundations is part of this work when the aircraft depends on them.

Keep JSBSim/WASM as the first flight-dynamics implementation. Improve our wrapper
fork and contribute generic fixes upstream where they belong. Preserve WebGL,
WebGL2, and WebGPU selection independently of aircraft fidelity. The baseline
flight model must work without WebGPU, shared memory, or threads. Additional
backends should earn their place through a demonstrated capability or measured
bottleneck; implementing several engines is not a prerequisite for a good seam.

Proceed in independently useful milestones: establish trustworthy runtime
contracts, separate aircraft data and behavior, build and validate the SF50,
then add live replacement. Loading the selected aircraft at boot is sufficient
for the first aircraft milestone. During reload-based selection, the active mesh,
physics, gauges, and aircraft identity stay consistent until the new selection
is applied. A cosmetic-only mesh override can remain an explicit custom choice.

Preserve meaningful C172 behavior through regression checks. Existing files and
tests may change when necessary; known defects must not be preserved merely to
keep the old test files untouched. Record intentional behavior changes separately
from aircraft tuning.

## 1. Evidence and starting conditions

The review inspected OSFS, the installed `@0x62/jsbsim-wasm` version
`1.2.4-beta.4`, and the local wrapper fork at commit `35d6100`. These observations
describe those versions, not permanent limitations of JSBSim.

| Finding | Evidence | Design consequence |
| --- | --- | --- |
| Aircraft selection currently changes visuals; boot always loads `c172p`. | [Bootstrap](../../src/flight/jsbsim/bootstrapC172.ts), [application](../../src/flight/createFlightSimApp.ts) | Select the model and all dependent aircraft behavior explicitly. |
| A second load can return true before property reads or initialization trap. | Bounded Node/WASM review probe; the original proposal records the first reproduction. | Check in a minimal reproducer and investigate the binding/native property lifetime. Keep a one-load guard for the affected driver. The exact native root cause remains to be established. |
| `sdk.destroy()` did not delete the native exec in the installed build: `exec.isDeleted()` stayed false and `run()` still worked. `exec.delete()` deleted it. | Node/WASM probe; installed destructor calls absent optional `module.destroy`. The local fork has the same call in `src/sdk/jsbsim-sdk.ts`. | Repair SDK ownership and teardown before treating fresh-instance replacement as proven resource management. |
| Writing `simulation/dt = 1/30` did not change `getDeltaT()` or the measured `1/120` time increment. `setDt(1/60)` changed both. | Node/WASM probe; [current bootstrap](../../src/flight/jsbsim/bootstrapC172.ts) | Use the actual timestep API and verify time advancement. A non-throwing property write is insufficient evidence. |
| Bootstrap documents geodetic latitude but writes a geocentric property. | [Bootstrap](../../src/flight/jsbsim/bootstrapC172.ts); the [ArduPilot proposal](ardupilot-sitl.md) independently identifies this and the timestep issue. | Correct the shared coordinate and time contracts once, with real-WASM checks. |
| C172 assumptions extend beyond stance and engine type. | [Contact geometry](../../src/flight/physics/collisionGeometry.ts), [clearance](../../src/flight/physics/groundContactClearance.ts), [reset presets](../../src/flight/jsbsim/resetFlightLocation.ts), [wheel adapter](../../src/flight/physics/createWheelSpinExperiment.ts) | Complete the dependency inventory in section 4 before declaring aircraft separation complete. |
| Gear animation integrates its own transit from the command using display time. | [Aircraft animation](../../src/flight/aircraft/aircraftAnimation.ts) | Simulated actuators become the source for animated positions. |
| Numerical guards do not detect an aircraft-specific stall or operating limit. | [State validation](../../src/flight/physics/safeFlightState.ts) | Keep corruption checks separate from operating conditions and recovery policies. |

The review probes were run headlessly; their results do not establish sustained
memory behavior, browser compatibility, or SF50 accuracy. Milestone 0 adds
reproducible tests and records the exact wrapper, JSBSim, and toolchain revisions.

## 2. User choice and compatibility contract

Settings describe independent dimensions rather than a single hidden realism
switch. Presets are editable bundles of those settings.

| Dimension | Examples | Ownership and application boundary |
| --- | --- | --- |
| Presentation | WebGL/WebGL2/WebGPU, resolution, mesh LOD, effects | Renderer; immediate where supported, renderer recreation where required. |
| World/contact detail | Terrain source/detail, contact sampling, body probes | World adapter and host; revise contact history when the active surface changes. |
| Aircraft/configuration | Variant, fuel, payload, equipment, FDM parameter overrides | Aircraft package and driver; validated live edits or paused reset/replacement as declared by each parameter. |
| Aircraft systems | Protection enabled/failed, actuator detail, propulsion approximation | Aircraft FCS/propulsion; preserve explicit aircraft configuration and declare approximation limits. |
| Simulator assistance | Auto-trim, keyboard response, stability help, recovery policy | Host control arbitration; report separately from aircraft-installed systems. |
| Numerical quality | Fixed timestep, contact substeps, bounded catch-up work | Scheduler and driver; apply at a paused/reset boundary and validate the supported combinations. |
| Execution | Main-thread WASM initially; optional worker or other implementations later | Driver/transport capability; replacement boundary when required. |

Reuse the [ground-settings](../../src/flight/settings/groundInteractionSettings.ts)
requested/active/reason pattern. Each setting has a stable key, units where
applicable, default, bounds, schema version, dependencies, and application
boundary. Report pending changes and unavailable or adjusted values. Automatic
selection may choose supported settings; it must preserve the saved request and
must not silently turn off flight-affecting systems to improve frame rate.

Allow advanced users to edit and import aircraft/configuration data without
requiring a source-code rebuild. Bundled definitions receive compile-time checks;
imported definitions receive runtime schema and capability validation. Missing
required data fails with a useful explanation. Optional capabilities can be
disabled explicitly; they never inherit C172 values silently. Normalization or
rejection of invalid values must be reported, and custom physical edits must be
distinguishable from the reference configuration.

Exports include requested and effective settings, aircraft/variant and model
revision, parameter overrides, driver/build identity, timestep, assistance,
initial conditions, loading, weather/seed, and scenario/terrain identity. Preserve
content hashes or stable references for external data and state when it is not
included. This supports reproducibility; it does not promise identical results
from unrecorded streaming scenery or all floating-point implementations.

The project should maximize reach while documenting actual capability floors.
Milestone 0 names the low-end and reference devices/browser versions used for
acceptance. Unsupported renderer or compute choices show the active fallback
and reason, or a recoverable failure when the user requires that choice.

The reference path uses single-threaded CPU WASM with bounded work and memory.
Worker transport must account for terrain/contact queries and message latency;
moving only JSBSim is not assumed to solve main-thread contention. SIMD, threads,
or GPU paths remain optional capability-selected optimizations. A GPU benchmark
must verify hardware acceleration rather than a software fallback.

## 3. Implementation boundaries and engine contract

| Layer | Owns |
| --- | --- |
| JSBSim / native upstream | Flight equations, native model/property lifetime, physical engine/contact capabilities. |
| JSBSim WASM wrapper | Binding correctness, native-handle ownership, property discovery and batching, filesystem loading, timestep API, capabilities. |
| Aircraft package | Model data, loading, FCS/propulsion schedules, actuator maps, source applicability, reference scenarios and presentation metadata. |
| OSFS simulation host | Lifecycle, control arbitration, scheduling, terrain handoff, settings resolution, assistance and scenario/recovery policy. |
| FOSS Earth and presentation adapters | World/rendering services and display of authoritative simulation observations. |

### Runtime ownership

Introduce a private JSBSim driver and a host with explicit commands and
observations. UI, animation, diagnostics, and long-lived application collaborators
must not receive a raw `JSBSimSdk`, native exec, or cached property node. The
driver owns creation, loading, stepping, reset, property adapters, and disposal.
A method such as `getSdk(): JSBSimSdk` would still allow stale captures and extra
loads, so it is not the public boundary.

The first implementation can remain synchronous within one accepted physics
step. Define commands for controls, initialization, environment and supported
parameter changes; expose observations for motion, engines, actuators, contacts,
and diagnostics. Include runtime generation, simulation epoch, step number and
simulation time. Specify units, coordinate frames, and validity for each field.
Consumers receive completed state, not a mixture of partially advanced models.

Hot-path storage may be pooled or double-buffered rather than allocated on every
read. Borrowed buffers need explicit validity windows; asynchronous consumers
and exports copy or transfer owned snapshots. Never expose native heap views to
long-lived UI consumers. A worker implementation can later transport the same
commands and observations without redesigning aircraft semantics.

For the affected build, the driver permits one model load per exec and becomes
unusable for further loads after a load attempt. Repairing reload upstream may
permit another internal implementation; consumers still do not acquire loading
or destruction authority. Fresh execs remain a valid isolation choice.

### Required wrapper work

1. Add a minimal second-load reproducer. Compare matching native and WASM builds
   where feasible to distinguish a JSBSim defect from bindings/build patches.
   Record observations separately from a proposed root-cause explanation.
2. Implement idempotent disposal using the binding's actual ownership contract.
   Detach/release readers and batches before their owner, reject use after
   disposal, and release listeners and retained module references. Verify both
   native destruction and sustained create/dispose behavior; a JS method called
   `destroy` is not itself proof. [Embind memory management](https://emscripten.org/docs/porting/connecting_cpp_and_javascript/embind.html#memory-management).
3. Set the timestep through `setDt()` and check `getDeltaT()` and simulation-time
   increments after initialization/reset. Correct geodetic bootstrap and test
   nonzero altitude and nontrivial latitude through the full coordinate bridge.
4. Validate required properties for existence and read/write access at setup.
   Zero is a valid reading, not a missing-property sentinel. Check optional
   telemetry through capabilities and display unavailable values as unavailable.
   Use `gear/gear-cmd-norm` and verify the aircraft's actual gear-position path.
5. Evaluate the fork's existing `PropertyBatch` (`f27720d`) and
   `GearContactReader` (`35d6100`). Test lifetime, reload/reset invalidation,
   missing fields, and heap-view invalidation before adopting them. A contact
   reader alone does not establish the exclusive force/impulse ownership needed
   for a coupled tire solver.
6. Pin a tested wrapper artifact and record wrapper commit, JSBSim revision,
   Emscripten version, build flags and patches. Contribute generic fixes at the
   appropriate layer; local adoption need not wait for upstream acceptance.

Use the existing [wheel-contact contract](../../src/flight/physics/wheelContact.ts)
when enabling optional coupled tire forces. A force component has one owner per
step. Telemetry-only wheel feedback must not double-count JSBSim friction.

## 4. Aircraft packages and complete integration

An aircraft definition identifies a versioned package, its supported variants,
model dependencies, reference configuration, capabilities, sources, and visual
assets. A variant is separate from visual LOD or a performance preset. Use a
typed complete registry for bundled aircraft; a combined registry or composed
metadata tables can both provide completeness. Keep neutral metadata free of
runtime WASM and renderer imports.

The schema must accommodate engines and actuators as named collections rather
than a permanent `piston | turbine` binary and two gauge slots. The first two
packages may each have one engine; unsupported future equipment is declared,
not implemented speculatively. Driver-specific property spellings stay in the
adapter. Gauges describe units, labels, availability, operating ranges, and
whether a value is simulated or estimated.

Every aircraft-dependent contract must be migrated or explicitly marked
unsupported before the SF50 is presented as fully integrated:

| Contract | Current locations / assumptions | Required result |
| --- | --- | --- |
| Model and dependency loading | `bootstrapC172.ts`, `hydrateJsbsimData.ts` | Selected aircraft/variant dependencies and conditional engine initialization. |
| Geographic/time initialization | `bootstrapC172.ts`, `resetFlightLocation.ts`, `fixedStepLoop.ts` | Consistent frames, effective timestep, explicit simulation epochs. |
| Ground contacts and clearance | `collisionGeometry.ts`, `groundContactClearance.ts`, `safeFlightState.ts` | Aircraft contact geometry, current CG, gear configuration/compression; separate physical impact tests from conservative placement. |
| Body collision | `BODY_COLLISION_PROBES`, `visibleMeshCollision.ts` | Aircraft-specific probes or hull approximation and a documented collision-detail choice. |
| Wheels and feedback | `wheelSpin.ts`, `createWheelSpinExperiment.ts`, contact bridge | Wheel identities, dimensions, inertias, brakes and telemetry; no borrowed strut constants or fixed index assumptions. |
| Loading and fuel | FDM mass/tank definitions; `captureSimulation` control list | Named tanks/payload stations, capacity and CG handling; no cross-aircraft copying by tank index. |
| Flight scenarios and recovery | `resetFlightLocation.ts`, app placement | Aircraft/loading-appropriate departure, arrival and airborne starts; trim or declared initialization procedure. |
| Controls and assistance | `applyFlightControls.ts`, `autoTrim.ts`, input manager | Explicit sign/unit/authority maps; recorded assistance and reset controller state on aircraft change. |
| Gear and surfaces | `aircraftAnimation.ts` | Actual gear and mixed/clipped ruddervator outputs drive animation; command, position and lock state are distinct. |
| Engine observations / HUD | State adapter and HUD components | Correct engine-specific fields and units; no invented zero or temperature-to-N2 mapping. |
| Visual alignment | `aircraftCatalog.ts`, model generators | Documented structural/CG-to-mesh transform, including longitudinal offsets and moving CG. |
| Cached capabilities and history | App composition, overlays, collision/wheel adapters | Rebuild or invalidate on runtime/aircraft generation changes. |

JSBSim owns authored physical configuration. Prefer introspection or generated
metadata from that configuration over independent hand copies. Where a visual
or collision approximation needs separate metadata, state its source and check
its consistency. A global settled-height constant cannot encode loading,
strut compression, gear retraction, and mesh alignment by itself.

### Data loading

Define aircraft dependencies, including shared engine/system files, once.
Generate any flat manifest union needed by tooling from that definition. Update
test fixtures to use the production dependency resolver; do not hand-maintain a
redundant union merely to avoid touching three tests.

Cache successful content by base URL, package revision/content hash, and path;
deduplicate in-flight requests and clear failed entries for retry. Allow bounded
cache eviction and user cache control. Load only the selected dependency closure.
Cached XML avoids network work, but does not promise instant WASM construction,
MEMFS population, initialization or trimming. Report those phases separately.

## 5. SF50 reference configuration and physical model

### Source applicability

Select an explicit aircraft configuration before freezing performance targets.
The owner's variant/equipment is not yet known. The available AFM
`31452-001 Rev 4` provides an initial research baseline for its applicable
airframes; it must not be relabeled as a complete G2/G2+ source. Shared geometry
may be reused with documented applicability while variant-specific schedules
and performance remain separate.

The [EASA TCDS, Issue 6](https://www.easa.europa.eu/en/downloads/24242/en) identifies
AFM -001/-002 applicability, different operating ceilings and a thrust update.
Cirrus describes the G2+ change as an optimized thrust profile in its
[2021 announcement](https://cirrusaircraft.com/story/cirrus-aircraft-unveils-g2-vision-jet-with-up-to-20-enhanced-take-off-performance-and-inflight-wifi-connectivity/).
Do not combine attractive figures across those configurations into one aircraft.

Maintain a source ledger with document/revision/page, variant applicability,
units and reference frame, extraction method, value/range, uncertainty, and
status: published, measured from a drawing, estimated, calibrated, or unresolved.
Track conflicting sources explicitly. The existing
[geometry measurements](../../planes/Cirrus_Vision_Jet/agent_workspace/measurements/sf50_reference.md)
are useful reconstruction evidence, not an authoritative source for every
physical parameter. In particular, the drawn/published main-tire discrepancy
and drawing scale differences must not silently set gear physics.

### Geometry, mass and reference frames

Record structural coordinates, propagated CG/body coordinates, and mesh
coordinates with explicit transforms and units. A nose-tip structural datum is
usable, but weight-and-balance stations from the certificated datum require an
established offset. Until that conversion is supported, mark station placement
as provisional and do not claim validated CG-envelope performance.

Define empty mass, payload stations, usable/unusable fuel as applicable, tank
capacities and locations, inertia estimates, and CG limits for the selected
configuration. Validate allowable combinations as well as individual values.
User overrides remain possible as custom configurations, with reference status
removed when the validated envelope no longer applies.

Use documented geometry to initialize aerodynamic estimates. State uncertainty
in incidence, derivatives, inertia and tail effectiveness. Keep parameters
identifiable where possible: inertia must not become a catch-all adjustment that
compensates for incorrect control authority or damping. Establish response
targets before tuning them, or retain the estimate label.

### Propulsion and flight-affecting systems

Model the FJ33-5A with the JSBSim turbine/direct-thrust path and data appropriate
to the chosen variant. Equal published rated takeoff/continuous thrust does not
imply identical installed schedules. The initial behavior contract includes
throttle-to-thrust response, takeoff and continuous settings, altitude/temperature
effects, fuel flow, ground/flight idle and spool transients. Include relevant
bleed/anti-ice effects where the reference scenario depends on them. Simple
tables and dynamics are acceptable; detailed engine electronics and
thermodynamics are not required to meet this contract.

Expose N1, N2 and thrust with correct units and provenance. Approximately
22,500 rpm corresponds to 100% N1, and 51,500 rpm to 100% N2; VFE is 190 KIAS at
50% flap and 150 KIAS at full flap. Use the applicable precise limits and
duration rules from the [TCDS](https://www.easa.europa.eu/en/downloads/24242/en)
and AFM rather than these rounded explanatory values. An unavailable ITT is
shown as unavailable; temperature limits never appear against an N2 scale.
An approximate thermal model is labeled and validated for its claimed use.

Represent the installed thrust location and direction as physical parameters.
The earlier 1.15 m arm gives roughly 6,965 lbf ft at 1,846 lbf, but neither that
arm nor body-axis alignment is established by ground-referenced nacelle
measurements alone. Preserve a documented initial estimate, investigate CG and
installation geometry, and test isolated thrust moment separately from net
pitch response. Do not introduce compensating forces solely to hide a mismatch.

### V-tail and protection

Keep conventional pilot pitch/yaw commands at the input boundary. The aircraft
FCS maps them, trim and any protection intervention to left/right ruddervators,
including travel, rate and saturation behavior. Aerodynamic terms consume the
actual mixed and clipped surfaces. Test pitch, yaw and combined-command cases,
including coupling and saturation; avoid double-counting tail effects.

The earlier proposal's pitch +20/-15 degree and yaw +/-9 degree values, and its
summed total-stop interpretation, are unresolved until an applicable source is
recorded. A provisional mixer can support experiments with explicit assumed
limits, but it cannot pass a claim of verified mechanical travel. Record the
sensitivity of handling to that assumption and seek control-travel evidence.

The supplied [AFM](../../planes/Cirrus_Vision_Jet/tests/SF50-POH.pdf), printed
page 2-26, defines stall speed at stick-pusher activation. Its page 5-18 table
must therefore not be used as a direct aerodynamic CLmax target. Separate bare
airframe stall, shaker/pusher behavior, applicable envelope protection, and
simulator assistance. A reference aircraft profile includes the flight-affecting
systems needed for its claimed scenarios; custom profiles may disable or alter
them. Record unknown thresholds and implementation limits rather than silently
substituting generic stabilization.

Full electrical/pressurization simulation, detailed avionics, engine sound, CAPS
and emergency autoland are separate follow-on capabilities unless a selected
validation scenario specifically requires them. Their absence is visible in
the capability description, without making them prerequisites for every flight.

### Gear, ground behavior and presentation

Implement retraction dynamics in the aircraft simulation. Command, physical
position, weight-on-wheels and down-lock status are separate observations.
Interpolate physical positions for display; do not run an independent visual
gear clock. Retain command-driven transit only as an explicitly identified
fallback for a visual-only model. Ruddervator animation follows the same rule.

Check ground equilibrium across representative loading and CG cases against
external geometry. A settle test measures model equilibrium, not real-aircraft
accuracy by itself. Validate gear-down, retracted and transitioning contact
geometry, placement, taxi, landing, braking and terrain changes. Conservative
placement clearance must not trigger false hard impacts above the actual gear.

## 6. Host lifecycle, time, and replacement

### One accepted step and one simulation clock

Extract a reusable single-step operation: resolve current controls and
environment, query required contact state, advance the driver, validate numerical
results, then publish completed observations. Keep exactly one scheduler/control
owner. Coordinate this contract with the [ArduPilot proposal](ardupilot-sitl.md)
without making autopilot implementation a dependency of the SF50 work.

Rendering interpolates completed observations. Gear, FCS, engine transients and
physical feedback advance in accepted simulation time. Record timestep changes
as boundaries/epochs; do not reconstruct time as current timestep multiplied by
all historical steps. Frame pacing and simulated-seconds-per-wall-second are
separate measurements.

The current six-step cap discards wall-time backlog and can slow simulation at
low frame rates. Keep work bounded, expose achieved simulation rate, and define
the overload policy explicitly. Do not skip physics steps while claiming that
their time was simulated. Offer lower-cost validated numerical/contact profiles
and configurable catch-up budgets; experimental rates remain editable with a
clear validation status. Changing visual LOD alone must not change FDM parameters.
If contact geometry changes with world detail, record that effective physical
input change instead of claiming an identical simulation.

### Initialization and reload-based selection

Resolve the desired aircraft/package and effective settings before boot. The
host publishes ready state only after dependencies, required capabilities,
initial conditions, and aircraft adapters validate. On failure, retain a useful
loading/error state with retry or another aircraft selection; do not silently
boot a C172 under an SF50 label.

Before live replacement exists, selecting another aircraft records a pending
choice and offers reload to apply it. The current aircraft keeps its complete
active identity. Selecting a mesh-only custom override is a different, explicitly
reported operation; it does not pretend to select another FDM.

### Live replacement, a later independent milestone

Use explicit lifecycle states such as initializing, ready, replacing, failed and
disposed, with generation tokens for asynchronous work. The invariant is that
no old callback can read/write a disposed driver or publish state as a new
generation. A physics pause flag alone is insufficient: terrain queries, weather,
input reads, teleports, overlays and animation must obey the same ownership
boundary. During loading, presentation can use the last completed snapshot.

Serialize replacement commits; cancellation/supersession cleans up abandoned
resources. Preserve the user's pause intent separately from loading/fault holds.
Two residency policies may implement the same behavior contract:

- When memory allows, prepare a candidate while retaining the old driver, then
  commit at a boundary and dispose the old one. Failure leaves the old session
  usable.
- With a constrained memory budget, unload first and show an explicit loading
  state. Failure offers retry, previous-aircraft reconstruction, or another
  selection. Reconstruction may restore semantic state; do not call it exact
  continuation of a destroyed engine.

Download/cache preparation can precede either policy. Rebuild contact geometry,
capabilities, gauges and visual mappings as part of commit. Reset interpolation,
contact/sweep histories, wheel feedback and trim controllers before resuming.
Assign a new runtime generation for replacement; advance the simulation epoch
for reset/reinitialization and reset only its local step counter. Never reuse a
generation/epoch/step tuple for a different accepted state. Reuse scenery and
renderer resources where possible, while
revalidating aircraft clearance and required terrain at the committed location.

### Transfer and recovery policies

Separate same-model fault/reset recovery from cross-aircraft initialization.
The existing `captureSimulation` snapshot is not a universal serialization of
all internal integrator, engine, actuator and controller state.

| State | Cross-aircraft policy |
| --- | --- |
| Position, attitude, earth velocity and body rates | A user-selected preserve-motion mode transfers them in documented frames; no promise of trimmed flight. |
| Trimmed flight / runway or approach start | Initialize an aircraft-specific scenario at suitable loading/configuration; report any location/speed/configuration adjustment and any trim failure. |
| Weather and terrain | Preserve the world selection; refresh valid contact/clearance for the new aircraft and generation. |
| Fuel and payload | Use the target configuration or an explicit user mapping. Never copy tank/station indices blindly. |
| Throttle, trim, flaps and gear | Default to target scenario values. Optional semantic mappings are explicit; equal normalized values do not imply equal physical state. |
| Engine running and system state | Initialize through target capabilities; do not copy mixture/magnetos, spool or protection state into incompatible systems. |
| Input device and assistance requests | Preserve user preferences, resolve target support, and reset accumulated controller state. |

Commit the selected transfer policy into host-owned command state as well as
the driver: reconcile input-manager throttle/trim/flap/gear latches, HUD values
and current local/phone control authority before the next step. Discard queued
commands from the old generation. Test that the first accepted step does not
overwrite the target scenario with stale controls; new deliberate input still
takes effect through the current control owner.

Numerical corruption, operating-limit exceedance, and a difficult but physical
flight condition are distinct. Stalls and overspeed remain simulatable. An
optional assisted recovery can reposition/retrim according to the selected
policy; numerical validity checks must not silently turn into an envelope
autopilot. Physical loads or state changes are not altered solely to make a
performance preset appear more accurate.

## 7. Calibration and independent validation

### Scenario records

Every case specifies aircraft/variant and data revision, weight and CG, fuel and
payload, atmosphere/wind, altitude datum, configuration, systems/assistance,
surface conditions, initial state, timestep, control procedure, observable,
source and tolerance. Distinguish KIAS/KCAS/KTAS, ground roll/obstacle distance,
and ground speed/airspeed. Save the input history and measured trace.

The following are initial source checks for the available AFM configuration,
not universal G2+ targets. Page numbers are printed AFM pages.

| Case | Published condition and observation | Source |
| --- | --- | --- |
| Takeoff | 6,000 lb, sea-level ISA, calm, dry level pavement, 50% flap, gear down, takeoff setting, bleed ON; ground roll 2,036 ft and total over 50 ft 3,192 ft. Extract the complete procedure before automating. | [AFM](../../planes/Cirrus_Vision_Jet/tests/SF50-POH.pdf), pp. 5-24/25. |
| Landing | 5,550 lb, sea-level ISA, calm, dry level pavement, full flap, VREF 85 KIAS, idle; ground roll 1,628 ft and total 3,011 ft. Record braking and approach procedure. | AFM pp. 5-128/129. |
| Protection threshold | 6,000 lb, idle, wings level; 86/77/67 KCAS for 0/50/100% flap, interpreted as pusher activation. Add other published weights/bank angles. | AFM pp. 2-26 and 5-18. |

The previous proposal's climb, cruise, fuel-flow, range and glide numbers remain
candidates until their source, variant, atmosphere, weight, configuration and
procedure are established. Do not impose a sea-level condition on an
altitude-specific cruise case or derive a mission range from an isolated fuel
flow without the mission/reserve definition. Additional reference cases should
cover hot/high conditions and engine transients, not just the easiest design point.

### Calibration versus validation

Separate four forms of evidence:

1. Calibration cases fit aerodynamic, propulsion or FCS parameters; regression
   tests preserve the fit.
2. Held-out cases use different weight, altitude, temperature or configuration
   points without retuning. If a held-out case is used for tuning, promote it to
   calibration and select a replacement before claiming independent validation.
3. Physical/numerical checks cover signs and frames, mass/fuel/CG consistency,
   actuator saturation, isolated forces/moments, contact stability and timestep
   convergence. Check acceleration and glide as well as equilibrium cruise so
   thrust and drag errors cannot merely cancel at one speed.
4. Owner evaluation exercises trim, power changes, flap/gear changes, yaw/roll
   coupling, approach, flare and go-around with configuration and assistance
   recorded. Log repeatable observations and input-device limitations; a good
   subjective impression does not establish missing aerodynamic derivatives.

Freeze scenario tolerances before tuning against them. For initial planning,
propose distance error within 5%, steady speed within 3%, fuel flow within 5%,
and pusher activation within 2 KCAS for fully specified source cases. These are
engineering targets, not manufacturer accuracy claims or measured achievements.
Milestone 1 justifies or replaces them from source resolution and procedure
uncertainty. Unsupported response targets remain explicitly unresolved; widening
a tolerance after a miss requires a recorded rationale and a new validation run.

Run headless FDM tests on deterministic flat-ground scenarios first, then exercise
the application control, terrain, animation and assistance path. Use a scripted
pilot with recorded gains/procedure; ensure controller tuning is not masking an
aircraft error. Compare supported timestep choices to a finer converged reference,
including ground contact and saturation events. Identical simulation-time inputs
must produce equivalent accepted state sequences under 10/30/60/120 FPS render
schedules within recorded numerical tolerances, even when wall-time rate differs.

Keep fast contract/regression tests in normal CI. Longer performance flights,
convergence sweeps and device benchmarks run in dedicated commands with retained
results; code changes still receive the repository's relevant lint/test/build
checks. The old C172 direction/power tests remain useful but are supplemented
with meaningful initialization, reset, motion and ground-behavior baselines.

## 8. Performance and compatibility evidence

Record both cost and achieved simulation quality. A faster frame that silently
advances less simulation time is not an equivalent performance result.

| Measurement | Required context |
| --- | --- |
| Cold/warm loading and first controllable frame | Network/cache condition, XML dependency count/bytes, WASM compile/instantiate time, initialization and terrain preparation separately. |
| Physics cost per accepted step | p50/p95/p99, timestep, aircraft and system/contact profile, scenario phase, state transfer/property access cost. |
| Frames and latency | Frame-time percentiles, rendering CPU/GPU timing where available, input-to-visible-response latency, resolution, LOD, renderer and assistance. |
| Simulation rate and overload | Simulated seconds/wall second, catch-up budget, discarded wall-time backlog, dropped/stale observations and pause/hidden-tab policy. |
| Memory/lifetime | Native allocation evidence where available, WASM heap and retained JS resources, peak replacement memory, repeated load/reset/dispose trend with warm-up distinguished from unbounded retention. |
| Fidelity at each profile | Maneuver errors, contact failures, timestep convergence, active approximations and fallback reasons. |

Name the devices, OS/browser versions and engine/build revisions. Exercise WebGL,
WebGL2 and WebGPU where supported, forced/unavailable choices, a low-end reference
device, and CPU-constrained/low-frame-rate schedules. Use the same deterministic
terrain fixture for backend comparisons; separately evaluate streamed scenery.
Report unavailable GPU timers rather than inventing measurements. Verify the
actual hardware GPU for GPU benchmarks and keep CPU/software fallback results
separate.

Milestone 0 captures the current C172 baseline and proposes explicit device
budgets for startup, memory, latency, frame time and real-time factor. Those
budgets become versioned acceptance inputs before performance tuning; the
proposal does not invent universal device-independent limits. Benchmark the
fork's batched reads against scalar access in the real step path. Closure calls,
cache hits and extra files are not described as free without evidence.

Follow repository testing instructions: prefer terminal and headless tools;
do not take over the user's cursor. Browser verification follows the repository's
development-server rule. This document does not authorize starting a server.

## 9. Implementation milestones

| Milestone | Deliverable | Exit evidence |
| --- | --- | --- |
| 0 — Runtime foundation | Reproducible lifecycle/property probes; correct destruction and timestep/coordinate APIs; selected build provenance; baseline device measurements. | Real-WASM destruction/use-after-disposal and create/dispose tests; effective dt/time increments; coordinate checks; tracked reload result/root-cause investigation; recorded baseline and proposed device budgets. |
| 1 — Aircraft and scenario contracts | Complete dependency inventory; versioned package/settings/scenario schemas; source ledger and initial configuration; reference tolerances. | Missing required bundled/custom data fails clearly; no implicit C172 fallback; source applicability and unresolved parameters recorded; performance budgets and supported initial profiles specified. |
| 2 — Parameterized boot and authoritative observations | Private driver/host; dependency loader; aircraft initialization; contact, actuator, gauge and visual adapters; active/pending selection; working file/text import/export and parameter-override path. | C172 regression behavior checked with intentional fixes documented; loader isolation/retry; no SDK escape to consumers; coherent reload-based identity; semantic observations and reset epochs verified; export/import round trip reproduces effective configuration and reports unavailable dependencies without a rebuild. |
| 3 — SF50 implementation and calibration | Selected-variant FDM, loading, propulsion, mixer/protection, retractable gear and reference scenarios. | Real-WASM boot and stepping; source-qualified calibration traces; combined ruddervator saturation, engine transitions, loading and ground behavior; unresolved claims remain marked. |
| 4 — Independent validation and owner demonstration | Held-out maneuvers, application-path tests, supported numerical profiles and browser/device comparison; replayable demo scenarios. | Held-out tolerances met or explicit capability limits; authoritative animation at low FPS; measured quality/cost and fallback behavior; owner feedback captured with its exact configuration. |
| 5 — Live replacement | Serialized/cancellable replacement and selected memory-residency policy; explicit state-transfer choices. | Rapid A→B→A, missing/corrupt data, failed initialization/trim, cancel/dispose during load, teleport/weather overlap, paused replacement and repeated-cycle resource tests. No stale generation publishes or touches a destroyed driver; the first accepted step honors the committed transfer policy and reconciled command state. |

Aircraft data investigation and package design can proceed while wrapper fixes
are developed; trustworthy integrated stepping and replacement depend on those
fixes. Milestone 5 is independent of a credible SF50 demonstration. Broader
customization and new fidelity/backend choices extend the same contracts rather
than requiring every conceivable combination before the first aircraft release.

## 10. Demonstration, provenance and remaining evidence

Prepare repeatable taxi/takeoff, approach/landing and go-around scenarios, plus
a short power/trim comparison. Save the aircraft configuration, input setup,
assistance and trace for each. Show a low-cost and a reference presentation
profile with the same physical configuration, then demonstrate an explicit
physical/assistance choice separately. The owner should be able to tell what is
being evaluated and which behavior changes came from their chosen settings.

The pitch should pair measured progress with specific help that would improve
the model: applicable variant/AFM, permissible performance data, loading and CG
information, control travel/mixing, installed thrust geometry, and structured
handling feedback. Sponsorship can support that work. A claimed aircraft
behavior should be traceable to data or a labeled approximation, not inferred
solely from a few fitted performance numbers.

Follow [ASSET_LICENSES.md](../../ASSET_LICENSES.md) for authored XML, copied data,
reference documents, visual assets and notices. Record exact sources and
redistribution status separately from software licensing. Preserve the engine
source/build/patch record. The new SF50 package does not resolve the already
recorded C172/reference-material provenance issues. A source citation is not
permission to distribute the cited PDF.

The following evidence remains to be obtained during the relevant milestones;
none prevents independent wrapper or package work:

- Owner's variant/equipment and the applicable performance/systems references.
- Datum conversion, loading/inertia evidence, installed thrust geometry, and
  authoritative ruddervator travel/mixing information.
- Protection and propulsion response targets adequate for the selected scenarios.
- Fully specified climb/cruise/glide/mission cases and independent validation
  points beyond the available initial AFM tables.
- Named low-end/reference devices and numerical/profile budgets from baseline
  measurements, followed by results for the SF50 implementation.

Keep these uncertainties visible until evidence resolves them. Passing one
milestone narrows the claims that can be made; it does not automatically certify
all aircraft variants, custom configurations, devices or operating conditions.


## AFM audit and benchmark v3 update

The historical AFM has been source-pinned and twelve selected ISA distance
cases extracted, including ten altitude/weight holdouts. Benchmark v3 corrects
KIAS/KCAS handling, uses the published 5-degree takeoff pitch target, separates
brakes-held engine preparation from measurement, records runway-projected
event distances and trajectory telemetry, and blocks validation when observed
conditions are unknown. See [the AFM audit](../validation/sf50-afm-audit.md).

The v3 brake-gate fix passed 33 unit tests and completed all 12 real-Wasm
scenarios with 84/84 initialization checks; all performance cases remained
blocked. V4 now adds native runway-level pressure/temperature probes,
terrain-grade evidence, explicit surface configuration/readbacks and
continuous condition monitoring. V4 passed 45 focused tests and the two
sea-level smoke scenarios, with no runway-condition blockers. The smoke
traces exposed stale native N1 at time zero and poor takeoff pitch tracking;
those and loading/datum evidence must be addressed before calibration.
Selected loading constraints and explicit-datum helpers have been added,
but no synthetic loading has been adopted. Aircraft coefficients were not
changed. This update does
not mark calibration or the overall proposal complete: CG/datum reconciliation,
target N1/bleed matching, pilot/braking technique, gear timing and broader
performance/response validation remain unfinished. SDK changes also remain
subject to upstream integration and application adoption.


## September 12, 2026: calibration prerequisite fixes, benchmark v5

Native JSBSim now has a source fix for zero-time turbine N1/N2 synchronization
and a regression using the standard F16 turbine fixture. It has not been
built, tested or adopted into an installed WASM artifact. The implementation
belongs in the canonical native fork, not an application-side spool override.

Benchmark v5 replaces proportional-only pitch control with a bounded
pitch-rate request and rate PI controller with anti-windup. It adds independent
takeoff tracking gates at the first sampled airborne state, the 50-foot
endpoint and after a settling allowance. The new controller, gates and
regressions have not been executed. The v4 smoke report remains the latest
real-WASM evidence; successful rotation has not yet been demonstrated.

Online research found a G1 aircraft-specific broker empty mass and a factory
entry documenting removable-seat accounting, but not a usable empty-CG record.
Reports now include explicit synthetic loading candidates and empty-CG
sensitivity. They are not applied to the native model during the isolated
pilot experiment, and real-record fields remain unknown.

See [evidence, assumptions, Cirrus questions and the execution order](../validation/sf50-cirrus-questions.md).
Next: build the native fix, run focused regressions and the two sea-level
scenarios, establish pitch tracking, then conduct a separately versioned
loading/datum experiment. N1/bleed matching, landing technique, friction,
aerodynamic calibration and broader proposal completion remain open.

### V5 execution results, September 12, 2026

The focused simulator suite passed 65 tests in 10 files. A new native Python
binding passed the existing CheckTrim, TestEngineIndexedProps and TestTurbine
CTest entries. The added turbine regression exposed an incorrect F16
partial-throttle expectation and is not yet registered in CTest; those
test-only corrections await approval.

An isolated rebuilt WASM SDK completed both sea-level scenarios with 14/14
initialization checks. Landing N1 stayed at 30% from time zero to the first
step, confirming the indication fix in that artifact. Takeoff pitch was
3.513 degrees at first sampled airborne state and 5.202 degrees at 50 feet;
settled maximum error was 0.204 degrees. The liftoff tracking gate still fails.

Takeoff distance was 3305.639 ft versus 3192 ft (+3.560%); landing distance
was 1646.205 ft versus 3011 ft (-45.327%). Neither is an aircraft-validation
pass. Native loading and coefficients were unchanged, and no holdout cases
were used. The v4/v5 comparison also changes the native artifact and Node
version, so it is not a strict single-variable A/B experiment.

The canonical native source still needs the SDK's existing Emscripten
strerror compatibility fix for a WASM build. That patch section was reused
only in a temporary source snapshot; no repository or installed SDK
distribution was replaced. See the
[executed audit and adoption boundary](../validation/sf50-afm-audit.md)
and [durable result summary](../validation/sf50-v5-validation-summary.json).
Overall calibration and proposal completion remain open.


### Native regression follow-up, September 12, 2026

The F16 regression now checks its command-to-position mapping separately
and derives expected spool speeds from effective dry throttle position.
The test is registered with CTest.

After reconfiguring the existing native build, all four focused CTest
entries passed: CheckTrim, TestEngineIndexedProps, TestTurbine and
TestTurbineTrimSpool (10.70 seconds total). The earlier partial-throttle
failure was a test expectation error, now corrected. This closes the
native regression/registration issue, not aircraft calibration.

Only tests and CTest registration changed. The existing native binding was
reused; the turbine, aircraft model, isolated WASM artifact and installed
application SDK were unchanged. Takeoff liftoff tracking and the other
loading, engine and landing-calibration blockers remain open.

The rerun log is at
`/private/tmp/sf50-v5-validation.30axFG/native-regression-rerun.log`.


## 2026-09-12 update: development pilot v6

Implemented the next development-pilot and benchmark-methodology step: per-phase pitch gains, landing flight-path/flare control, provisional deceleration-based braking, preserved baseline/open-loop comparison profiles, explicit calibration/holdout selection, and separate airborne-distance/touchdown-quality checks.

The [v6 calibration note](../validation/sf50-pilot-calibration-v6.md) records 18 controlled prototype runs on unchanged aircraft coefficients and the rebuilt SDK. The selected prototype passes the existing takeoff pitch gates and all three distance-segment comparisons for the two calibration cases. Landing sink improves from about 478 to 191 ft/min. These are fitted development-pilot results, not independent aircraft-validation results.

The extracted application implementation and added unit cases have not yet been executed. Holdouts remain unused. N1/bleed matching, physical CG/loading/datum, verified normal pilot/brake technique, friction identification, and installed SDK adoption remain unresolved. Do not mark the overall SF50 proposal implemented end to end on the strength of this step alone.


## 2026-09-12 public-source acquisition update

Implemented a reproducible public-evidence collection/analyzer scaffold, source-integrity pins, strict recorder/table parsing, explicit evidence-eligibility gates, and a datum helper requiring a reviewed anchor. Archived 47 sources locally and saved the acquisition findings, candidate recording, and [evidence-to-test roadmap](../validation/sf50-public-data-acquisition.md).

Important: new table sources disagree with our pinned AFM, and accident recordings are not automatically normal-aircraft validation data. Source reconciliation and review precede further tuning. Extracted scripts and added unit tests remain unexecuted. The overall proposal is still not validated end to end; this update does not close calibration or SDK-adoption work.


## Public evidence and focused validation update (2026-09-12)

See [the expanded public-data audit](../validation/sf50-public-data-audit-2026-09-12.md). The local corpus now contains 81 artifacts (200,995,197 bytes), including a public G1 flight dashboard, additional G1 recorder evidence, a Cirrus condition-specific engineering estimate, and 820 automatically extracted primary-AFM cruise/climb candidate rows. Counts are artifacts/rows, not independent aircraft-validation cases.

The offline analyzer passed against its original 47-source manifest. All 42 focused tests passed across seven evidence, AFM, runway and pilot-controller files (Node v26.8.2; Vitest 4.1.6). The supplemental sources remain separately inventoried; no aircraft simulation or model coefficient changes occurred during this audit.

The 6,000-lb sea-level takeoff source discrepancy is explained by interpolating a sparse temperature grid instead of retaining the AFM's explicit ISA column. The exact-grid landing source conflict remains unresolved. Do not retune the aircraft to either an interpolation artifact or an unapproved newer transcription.

Public-data qualification, supplementary ingestion, normal publication access, loading/input interpretation and independent held-out aircraft evaluation remain unfinished. The existence of additional public shared flights means public data is not exhausted. This update does not mark end-to-end aircraft calibration or the full proposal complete.


## Generation selection and first public-input application (2026-09-12)

G1, G2 and G3 now have separate catalog identities and JSBSim packages. The historical saved SF50 choice remains G1. Later packages are generated from the common development airframe and explicitly disclosed as sharing uncalibrated physics/meshes, not three independently validated models.

The first directly sourced replacements are 1,846 lbf rated thrust, 2,001 lb nominal usable fuel capacity and 62.2-inch MAC. Earlier calibration-run numbers are historical and do not validate these changed packages. No uniform G2+/G3 thrust multiplier was introduced.

The new offline processing pipeline consumes the expanded AFM/recorder corpus and separately pinned G2/G2+ tables. It produces generation-tagged calibration candidates, cumulative-climb targets, equilibrium-lift inferences and steady-flight review windows with fail-closed eligibility. See [variant implementation and methodology](../validation/sf50-variant-models.md) and the machine-readable variant-processing summary for actual processing outcomes.

Generation selection and data-processing plumbing are implemented. Variant-specific installed-engine/aerodynamic calibration, source qualification, realistic G3 cabin/avionics modeling, focused tests of these changes and independent aircraft validation remain unfinished. This does not mark the entire proposal complete.


## Fresh-conversation execution order and retained context (2026-09-12)

The user requested a documentation handoff before starting shorter, focused conversations.

1. **Aircraft selection UI first:** replace the interim flat aircraft/generation radio list with a scrollable image grid of aircraft families. Show generation choices and all applicable existing aircraft-specific controls underneath, outside the gallery's scroll region. One Vision Jet card leads to G1/G2/G3 controls; preserve saved IDs, credits and atomic aircraft activation. Use [the UI prompt](../prompts/aircraft-selection-ui-work-app-prompt.md).
2. **SF50 development afterward:** resume qualification of the processed public data and source-grounded calibration using [the SF50 prompt](../prompts/sf50-resume-work-app-prompt.md).

[The consolidated handoff](../validation/sf50-development-handoff.md) records the current implementation, actual processing results, historical test/build evidence, known source conflicts and upstream ownership. It is the entry point for the next conversations, not a replacement for current source or permission to run deferred checks.

The latest processor completed all stages, including 820 AFM cruise/climb rows, 8,535 TOLD rows and 41 steady-review windows. G2/G3 remain explicitly shared-physics development packages. No new flight-model validation occurred during this documentation update, and the overall proposal remains incomplete.
