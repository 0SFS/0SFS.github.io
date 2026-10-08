# Coupled turbine engine implementation specification

Date: 2026-10-07. Status: implementation handoff requested by the user; **no
implementation or new qualification is claimed by this document**. Start with
the [execution prompt](../engine-plant-implementation-prompt.md). This document
specifies the system, stages and acceptance gates for the implementing agent.

## 1. Outcome and scope

Build a coupled native propulsion model in JSBSim whose actual fuel delivery,
combustion, station conditions, shaft work, nozzle flow and thrust describe the
same transient. Supply one timestamped physical state to aircraft sound and
optics. Support several compute budgets through validated numerical algorithms
and precomputed closures, with explicit cost and accuracy controls.

The first installation is the F135-PW-600 in the F-35B. The native plant and its
tests must also work with a synthetic, openly specified turbine fixture. Public
F135 information cannot identify every internal parameter: deliver a physically
consistent approximation with provenance and uncertainty, not a claim to have
reconstructed proprietary engine maps or FADEC logic.

The work includes native lifecycle integration, an immutable WASM SDK adoption,
F-35B propulsion configuration, sound/optical boundary migration and joint
causality tests. Preserve the rigid nozzle mechanism, separate solid thermal
states, working controls, hover AB inhibit, save/recovery and aircraft replacement.
The faint dry night exhaust is currently accepted by the user as an appearance;
preserve that observation without treating it as radiometric calibration.

Do not solve the mismatch with a sound delay, startup fade, arbitrary temperature
ramp, RGB choice, prohibition on blue, exterior relocation of chemical light or
brightness compensation. Native physics must account for the cause. This scope
permits the sound changes needed to consume the corrected plant; older
exhaust-only exclusions of sound work do not apply to this integration.

Smoke, nonluminous distortion, Sky lighting and a complete deck-impingement model
are independent workstreams. Coordinate their interfaces; do not absorb their
implementations into this task. The [smoke/hot-gas handoff](../aircraft-smoke-hot-gas-implementation-prompt.md)
and [Sky handoff](../../../foss-earth/docs/sky-lighting-implementation-prompt.md)
remain separate. A changed engine boundary does require documenting its effect
on their assumptions.

## 2. Ownership and working rules

This orchestration specification belongs in **0sfs**, which owns the aircraft
integration. Before creating any implementation module, name its owner:

| Deliverable | Owner |
| --- | --- |
| Generic turbine components, conservation equations, combustion/control states, nozzle physics, shaft loads, lifecycle, native tests | JSBSim `src/` and `tests/` |
| Generic property/map/reduction generators and their schemas, synthetic fixtures and numerical reference tools | JSBSim; select an appropriate tools/test directory there |
| Generic state bindings, snapshot transport, artifact production and SDK tests | JSBSim `wasm/` |
| F135 parameters, installation topology, source/uncertainty manifest and generated aircraft profile | 0sfs aircraft data and aircraft tooling |
| Aircraft fixed-step scheduling, controls, visual geometry, sound/optical adapters and flight settings | 0sfs |
| Aircraft-specific spectral/spatial optical bakes | Existing 0sfs exhaust-optics tools |
| Shared exposure, sky, tone mapping, depth and general renderer defects | FOSS Earth, consumed through its public exports |

Read every edited repository's `AGENTS.md`. Inventory dirty files and branches;
preserve concurrent Sky, phone, aircraft-light and other work. Re-read shared
files immediately before editing. Never reset, clean, blanket-stage or stash
another session's work. Use the canonical JSBSim checkout, normally fork
`master`; create a worktree only for actual concurrent source work.

Scratch, logs and temporary dependencies stay in the owning repository's
`build/`; never delete an existing build folder without the user's agreement.
Runnable tools belong in scripts/tests; retained evidence belongs in
`validation/evidence/`, following [the layout](../validation/layout.md).

## 3. Required reading and baseline

Read in this order, using dated observations rather than assuming all older
status paragraphs describe current code:

1. [AB onset evidence](../validation/f135-ab-onset.md), its
   [corrected report](../../validation/evidence/aircraft/f35b/ab-onset-2026-10-07/integer-clock-reviewed/report.json)
   and [native trace](../../validation/evidence/aircraft/f35b/ab-onset-2026-10-07/integer-clock-reviewed/native.csv).
2. [Turbine operation contract](../turbine-initialization/contract.md),
   [decisions](../turbine-initialization/decisions.md),
   [plan](../turbine-initialization/plan.md) and
   [validation](../turbine-initialization/validation.md). The contract is a
   proposed target; its later implementation stages are not complete.
3. [Spatial follow-up](../f135-plume-physical-followup-prompt.md), especially
   “Follow-up after testing the spatial implementation”; the
   [spatial record](../validation/f135-plume-spatial.md),
   [dry mechanism investigation](../validation/f135-dry-vtol-mechanism.md),
   [dry observation ledger](../validation/f135-dry-vtol-observation.md) and
   [exhaust response](../validation/f135-exhaust-response.md).
4. [F-35B model](f35b-fdm.md), [engine reconstruction](f135-engine-rebuild.md),
   [sound contract](../sound.md),
   [sound ledger](../validation/audio-implementation-ledger.md),
   [exhaust controls](../validation/f135-exhaust-controls.md) and
   [flight settings](flight-settings.md).
5. [JSBSim integration](../jsbsim.md),
   [upstream tracker](../open-upstream-prs.md),
   [contribution policy](../jsbsim-upstream-contribution-policy.md) and
   [FOSS Earth boundary](../foss-earth-relationship.md).

The measured baseline uses `@felipegalind0/jsbsim@1.2.4-fork.16`, native revision
`97fe6ddf1c8a7d9e10dad46a88e60e79e69fae28`. Recheck installed bytes, source and
aircraft profile at execution; these identifiers are a baseline, not permission
to replace newer work with older files.

The cold-start diagnostic selects AB 2.5167 s after the full-throttle command,
immediately reports 43,000 lbf, and reports first positive observer-derived
burned AB fuel at 6.6500 s: a 4.1333 s gap. The same-N2 dry lookup is about
23,455 lbf at selection. The settled dry and warm-initialized gaps are 83.3 ms.
These are simulated values. They neither measure real ignition delay nor prove
that the thermal observer correctly identifies burning.

The source-level cause is in `FGTurbine.cpp`: `Run()` selects wet lookup thrust
immediately, while total fuel follows a rate-limited target. `UpdateThermal()`
then estimates AB fuel as total fuel minus a **steady dry demand**. That demand
is not a separate transient core fuel path. The thermal observer runs after
thrust and cannot correct it. Upstream has the legacy thrust switch; the fork's
added thermal observer exposes the contradiction. Do not attribute our complete
observer defect to upstream.

The shipped base jet sound responds to native thrust even with deliberate AB
gain zero. The optical reaction source responds at the first positive modeled
burn while the liner remains cold. Thus delaying sound or warming the metal
faster does not repair the identified native model.

Preserve the original tests and evidence as history. Their expected-failure
comparison against a dry thrust table is a diagnostic of that implementation,
not a universal law for a new engine plant; section 11 defines its replacement.

## 4. Physical model and state contract

Use a compact differential/algebraic model:

```text
dx/dt = f(x, z, u, environment, parameters)
0     = R(z, x, u, environment, parameters)
y     = g(x, z, u, environment, parameters)
```

`x` contains physical histories, `z` the matched gas-path unknowns, `u` actual
commands and boundary inputs, and `y` derived observations. Separate controller
demand, physical plant and output publication. The algebraic evaluator must be
usable by Advance, Steady and Refresh without independently authored equations
for thrust, temperature or fuel in each operation.

The initial implementation uses matched quasi-steady gas flow with dynamic
shafts, fuel paths, combustion, actuators and solids. Add selected gas-volume
states only where a declared transient requirement demonstrates their value.
Do not integrate every possible gas volume at the flight timestep by explicit
Euler; fast pressure dynamics can make that system stiff.

| State or observation | Required semantics |
| --- | --- |
| LP/HP shaft state | Physical angular speed/inertia; normalized N1/N2 are observations with defined references |
| Core and AB fuel | Separate commanded, metered/delivered, burned and unburned quantities; inventory and transport only where explicitly modeled |
| Combustion | Flame/ignition state, heat-release rate, oxygen use and declared combustion efficiency; selection and burning are distinct |
| Gas station | Stable station identifier, total pressure/temperature or enthalpy, mass flow and composition; validity and units |
| Nozzle boundary | Attained throat/exit area, static exit pressure/temperature, velocity, Mach, density, mass/composition flow and force |
| Actuators | Actual fuel-valve/nozzle/bleed/variable-geometry/clutch states where modeled, distinct from their commands |
| Solids | Separate region energies/temperatures and gas, cooling, conduction and radiative exchange |
| Controller | Required integrator/limiter states and event history; representative schedules identified as assumptions |
| Installation | LiftFan speed/load, clutch transfer/loss, diverted bypass flow and outlet forces/moments |
| Numerical status | Algorithm/schema/profile version, domain status, convergence/residuals, accepted simulation step and fallback reason |

Use SI internally in new equations. Convert at the existing JSBSim property and
force interfaces explicitly. Station metadata must state reference pressure,
enthalpy datum, composition basis and total/static meaning. Gauge EGT is a
documented observation, with any sensor lag separately named. Do not silently
reinterpret today's empirical EGT as turbine-exit or nozzle stagnation temperature.

Use one canonical physical state shared by algorithms. Alternative internal
coordinates need tested mappings; hidden histories cannot disappear on an
algorithm switch. Publish a schema-versioned output snapshot with simulation
time, accepted-step sequence and reset/restore epoch. Missing data is invalid
or unavailable, not an invented zero or inferred AB condition.

## 5. Fuel, heat, shafts and gas path

Model core and augmentor fuel metering independently. Apply actual supply limits
before accepting burn or force. Integrate delivered mass consistently with the
propulsion manager's tank debit; a final partially supplied step cannot burn an
entire requested step and discover an empty tank afterward. Define allocation
for multiple engines sharing tanks. Fuel-freeze behavior follows the explicit
lifecycle contract: accounting can be frozen while supply still must exist.

Any line inventory, atomization or mixing delay must be a named state or closure
with units, provenance and validity. A rate-limited flow alone is not a fuel
inventory. Account for unburned delivered fuel and its destination. A failed
ignition must not silently convert that fuel into heat or disappear it.

Ignition, flameholding and blowout use local conditions and a stated calibrated
or assumed closure. Startup, reheat ignition and hot relight can differ. Missing
F135 ignition measurements must be reported; do not reuse an isolated parcel's
autoignition time as installed-engine delay. Metal temperatures may affect a
justified physical closure but cannot be an arbitrary visibility timer.

For every shaft, integrate torque balance, including turbine drive, compressor
and fan demand, starter, accessories, losses and external shaft loads. The
startup formulation must remain defined near zero angular speed; power divided
by zero is not an admissible torque law. Compressor/turbine maps carry corrected
flow/speed definitions, pressure-ratio/efficiency conventions and validity ranges.
Low-speed startup, windmilling and out-of-map states require declared treatment;
do not extrapolate normal maps through them without evidence.

Each component conserves mass and species to the modeled resolution and uses
compatible enthalpy/work relations. Combustion contributes chemical energy once.
Choose and document one thermochemical convention: either sensible enthalpies
plus a consistent heating-value source, or formation-inclusive species energy.
Do not add LHV again to formation-inclusive reaction energy. If an efficiency
multiplies burned-fuel power, identify what energy it excludes and where it goes.

Use these identities as implementation contracts, with each boundary term
defined for the selected control volume:

```text
dm_inventory/dt = sum(mass inflows) - sum(mass outflows)
J * domega/dt   = turbine torque - compressor/fan/load/loss torque + starter torque
E_rotor        = 0.5 * J * omega^2                       (constant J)
Q_chemical     = burned fuel flow * effective fuel LHV   (sensible-energy convention)
dE_total/dt    = enthalpy/kinetic inflow - outflow
                 + chemical input + external heat/work - escaping radiation
```

Chemical conversion redistributes species; it does not remove burned fuel mass
from the exhaust. Internal shaft work and internal heat exchanges cancel from
the whole-installation ledger. If inertia or moving-boundary storage changes,
extend the corresponding identity rather than applying the constant-J equation.

Station total enthalpy includes kinetic energy consistently. Use temperature-
and composition-dependent properties where needed; any constant-property
reduction needs a bounded domain and quantified error. Enforce flow matching,
component work compatibility and pressure-loss/mixing relations in the same
solve. Never independently interpolate a desired thrust and exhaust temperature
and label both physically closed.

Maintain signed ledgers for fuel chemical/sensible input, inlet/outlet gas
enthalpy and kinetic flux, rotor energy, gas storage where modeled, solid energy,
external shaft work, cooling/bleeds and escaping radiation. Avoid double-counting
pressure-flow work already represented by enthalpy, and define the control-volume
frame. Existing wall ledgers describe solids driven by imposed reservoirs; they
must become coupled exchanges or remain explicitly external boundary work.

Gas-to-solid heat is a loss to gas and a gain to the solid. Cooling drawn from
the engine is a real mass/enthalpy stream. Radiation leaving gas/metal is counted
once, with reabsorption or external escape defined. If a radiation loss is
neglected in a reduced cycle, retain a bound showing its impact is within the
declared energy tolerance; a merely bounded optical brightness is not proof of
a closed engine budget. Physical energy accounting cannot depend on camera,
exposure, user brightness multiplier or whether an exhaust mesh is drawn.

## 6. Nozzle and powered lift

Solve choking and expansion from upstream total conditions, ambient conditions
and attained geometry. Never select a Mach number from an AB flag. Define the
handling of unchoked, choked, underexpanded and overexpanded operation, including
the limits of any separated-flow approximation. Start with analytical ideal
nozzle fixtures; add losses through sourced or explicitly assumed coefficients.

For a simple axial outlet, the force relation includes exhaust momentum and
pressure thrust, less inlet momentum. The installation extends this to all
outlets, their directions and moment arms in documented frames. Account for
inlet ram momentum once, not once per outlet. Force and outlet velocity must
come from the same solved state.

```text
F_axial = mdot_exit * V_exit - mdot_inlet * V_inlet
          + (p_exit - p_ambient) * A_exit
h_total = h_static + V^2 / 2
```

The second relation uses consistent enthalpy definitions and a declared frame;
it must not expand an already-static temperature a second time. Fuel mass and
all diverted streams belong in the appropriate inlet/outlet balances.

The native nozzle area state drives the existing rigid visual mechanism through
a monotone aircraft-specific area-to-pose mapping. Establish what area the asset
actually represents and report geometric/profile mismatch. Do not scale or warp
the rigid duct to hide it. Area actuation and swivel direction remain separate.

Represent the LiftFan as a shaft load with rotor/clutch dynamics or an explicitly
bounded reduction. Divert roll-post bypass mass and enthalpy once. Derive rear,
fan and post forces from those flows and work, rather than adding free thrust.
The inherited F-35B model contains separate lift/side engine definitions: audit
and remove or route their old force/fuel paths when the new coupled installation
becomes active, so there is no duplicate lift, fuel debit or power extraction.

Preserve the aircraft's operational hover AB inhibit at the native control/
configuration boundary. Test attempted AB commands throughout conversion and
return to forward flight. Keep actuator limits, control authority and doors
working. Full ground-effect, deck recirculation and impinging-jet physics are
outside this plant milestone; explicitly bound or flag affected operating cases.

Audit the present 28,000/43,000-lbf development ratings against variant-specific
primary sources. Do not substitute a public headline rating into one table while
leaving the coupled installation tuned around another. Record any deliberate
performance change and keep rating conditions distinct from measured maps.

## 7. Lifecycle and compatibility

Introduce the new plant as an explicit configuration capability. Existing
empirical turbine configurations keep their behavior except for separately
identified, tested lifecycle fixes. Do not silently opt every turbine into an
uncalibrated cycle or require aircraft-specific data in native code. Decide in
stage 1 whether composition behind `FGTurbine` or a separate compatible engine
class best meets the native interfaces; record the reason and XML contract.

Reconcile the existing initialization plan with this plant before changing public
operations. The coordinating agent reviews the pending contract amendments as
engineering work. Do not require a new user approval at every stage, and do not
call a proposed API already implemented. Preserve these distinct semantics:

| Operation | Required behavior |
| --- | --- |
| Advance | Integrate accepted elapsed simulation time, consume available fuel and publish one completed state |
| Steady | Solve the same plant's operating-point equations for eligible engines; no elapsed time or fuel consumption; explicit per-field thermal/history policy |
| Refresh | Recompute algebraic outputs from unchanged histories; only documented instantaneous command/fault transitions |
| Initialize cold | Explicitly establish cold shaft, fuel, gas, actuator and solid states; preserve configuration |
| Initialize running | Establish a supported operating point and documented thermal/actuator/controller state; no accidental cold/warm mixture |
| Capture/restore | Versioned complete engine-owned histories and validity; validate atomically, then refresh dependent outputs |

Do not infer intent solely from `dt == 0`. Executive suspension and copied
engine-input dt both matter. Preserve fuel eligibility/freeze semantics, current
fault precedence and nonrunning-engine eligibility. A stored hot gas state may
produce transient passive exhaust after cutoff; a steady solver must not borrow
hypothetical powered thrust from an engine that cannot burn.

The plant adds gas/fuel/controller/actuator/clutch histories beyond the older
contract. Extend its field-by-field rules explicitly. Ordinary trim should not
erase hot solids or other preserved histories merely to find a shaft/gas-path
equilibrium. State which slow fields are held and which are solved. A genuine
full thermal equilibrium is a separate explicit request if supported.

Complete engine outputs, outlet/thruster forces, propulsion aggregation and the
promised vehicle forces/derivatives before a successful zero-time operation
returns. Define failure rollback and mixed-engine all-or-none rules. Trials may
not commit fuel, energy or configured-function side effects. Sample stateful XML
functions in a defined order at accepted boundaries; repeated nonlinear residual
evaluation must not replay side-effecting configuration functions.

State capture includes canonical physical states, pending transport/inventories,
controller/actuator history, thermal initialization, event phase and required
numeric warm-start data. Validate profile/schema compatibility and define old-save
migration explicitly. Never warm-initialize silently when restoration fails.
Repeat pause/hold/read/refresh operations must not advance history or energy.

## 8. Algorithms and compute budgets

Implement the component solver first as an independently testable numerical
reference. It need not be the eventual default. Then build a reduced nonlinear
implementation and qualify it against held-out reference trajectories and
analytical cases. A local linear implementation is a further candidate, admitted
only where it offers a demonstrated cost/error advantage. Deliver at least the
component and reduced nonlinear implementations; an unsuccessful linear
experiment is retained evidence, not a reason to ship an invalid algorithm.

| Algorithm | Work and permitted approximation | Admission and failure rule |
| --- | --- | --- |
| Component solve | Warm-started, bounded gas-path matching with dynamic physical states; selected implicit volume dynamics if justified | Residual, positivity, map-domain and branch checks on every accepted step |
| Reduced nonlinear closure | Offline approximation of costly matching/constitutive relations; same state integration and conservation ledger | Validated input/state domain and error estimate; enforce conservation through the construction or a bounded correction whose cost is included |
| Local linear dynamics, optional | Precomputed local dynamic matrices and trim neighborhoods, with explicit nonlinear event handling | Valid only within its declared phase and neighborhood; no blind interpolation through startup, ignition, choking or conversion |
| Detailed transient reference, optional/offline | Additional gas volumes or finer component/chemistry treatment for a particular disputed response | Used to test a specific reduction; not assumed to be calibrated F135 truth |

The cheap implementation must approximate constitutive relations or dynamics
while keeping a common mass/energy account. Projecting a bad surrogate back onto
conservation alone does not make its distribution of work or outlet state
accurate; test those outputs independently. Large projections reject the candidate.

Switching algorithms is a zero-time state mapping. Preserve shaft angular
momentum/energy, fuel inventories, gas mass/energy where modeled, solid energy,
flame state and actuator/controller histories. New hidden states must be
reconstructed from a documented constrained mapping, with bounded observable
error. Test round trips and event-boundary switches. Do not crossfade force,
brightness or temperature to conceal discontinuity. Until mapping is qualified,
require explicit reinitialization to change incompatible physical model structure;
do not advertise that as seamless runtime algorithm switching.

Default selection is deterministic and fixed for a run. Optional automatic
selection may choose only among validated algorithms within the user's allowed
range and resource limits. Record algorithm changes and reasons for replay. Cost
measurements may inform future choices; they may not change physical elapsed
time, skip ignition events or silently raise a budget. An algorithm's domain
failure is different from an engine flameout.

Reserve the bounded fallback cost before admitting a step. If neither the chosen
algorithm nor an allowed fallback can produce an admissible solution, report a
numerical failure, preserve the last accepted plant state and stop accepting
invalid propulsion steps. Define the executive/SDK/application failure path in
stage 1 so flight cannot continue presenting stale forces as a valid solution.
Do not claim whole-aircraft rollback without implementing and testing it. Never
switch to the legacy wet-thrust table as an invisible fallback.

Expose compute controls in **Engine → Simulation**, one home per setting.
Diagnostics belong in the existing Engine/Debug surfaces. Exhaust visual and
sound gains stay in their current homes. Use algorithm names, real units and
visible caps; presets are displayed parameter lists, not code branches on
“Low/Medium/High.” Register all allocation, work, cache and update decisions.

The following are **initial engineering targets**, not device measurements or
F135 constants. Stage 1 may refine them with recorded reasons before acceptance
work; never loosen a failed criterion silently. Default reduced operation is
enabled only after its domain and accuracy gates pass.

| Parameter | Proposed default and bounds | Meaning |
| --- | --- | --- |
| Requested implementation | Reduced nonlinear; component and qualified alternatives available | Explicit numerical implementation, with capability/domain reporting |
| CPU target | 100 µs per accepted propulsion step; 10–1000 µs | Combined installed plant, native bookkeeping and SDK publication, including fallback; statistical target, not a hard scheduler guarantee |
| Nonlinear iteration cap | 8; integer 1–32 | Total matching/correction iterations across the accepted step and fallback |
| Dynamic subdivision cap | 4; integer 1–16 | Maximum internal substeps within one existing flight physics step |
| Matching tolerance | 1e-6 normalized residual; 1e-9–1e-3 | Solver stopping request; looser values do not retain stricter qualification labels |
| Resident closure-data budget | 1 MiB; 64 KiB–16 MiB | Tables, local models and required prepared fallback data; show actual bytes |
| Automatic algorithm selection | Off | If enabled, expose the eligible algorithms, allowed budget range and current reason |

These caps interact: do not allocate a model that exceeds the memory budget or
promise a domain that needs more iterations than permitted. Count all residual
evaluations, table queries, projections, substeps and fallback work, even if a
particular algorithm does not call them “iterations.” Add an explicit cap for
any new resource category, with unit, bound, default and justification.

Retain the app's fixed-step clock; the reference onset fixture is 120 Hz. Do not
change the global physics rate to make an engine test pass. Slow thermal/control
work may use multirate updates only with an error bound and event response test;
no delayed burn publication or frame-rate-dependent state. Audio synthesis stays
on its existing audio clock and consumes timestamped plant data; it does not
solve the engine at the audio sample rate.

Preallocate state/scratch/output storage. Cache immutable profile data and
infrequently changing factors. Reuse native observation batches. No runtime
chemistry solver, CFD, dynamic map fitting or per-step allocation. Static renders,
hidden diagnostics and paused reads cannot advance the plant or regenerate its
tables. Rendering follows the existing readiness and request-render rules.

## 9. Offline generation and data provenance

Generic generators live with the JSBSim equations they reduce. F135-specific
inputs and generated aircraft data remain in 0sfs; do not copy a generic solver
into app tooling. Aircraft optical spectra keep their existing optical owner.
Detailed chemistry/map tools are development dependencies, not browser payloads.

Every generated artifact carries:

- Schema and engine/profile identity, units, station definitions and state order.
- Source URLs/licenses, source hashes, tool/dependency versions and generator
  revision, configuration, seed and reproduction command.
- Domain limits, valid phases/branches, interpolation method and out-of-domain
  behavior, including uncertainty caused by missing data.
- Training/design samples separately from independent validation samples,
  reference tolerances, maximum/RMS errors and failed cases.
- Conservation/positivity treatment, reduction/projection limits, memory layout
  and bytes required by the artifact and its fallback.

Generate thermophysical tables, map fits/derivatives, initial guesses, stationary
solutions and reduction data as appropriate. For local linear models, precompute
the supported timestep discretizations or a validated inexpensive equivalent;
do not perform matrix exponentials on every frame. Include transient trajectories
and event neighborhoods in validation, not just the steady points used to fit.

Create a parameter ledger with columns for value/unit, source, classification
(`measured`, `manufacturer rating`, `derived`, `fitted`, `hypothesis`, `unknown`),
valid conditions and uncertainty/sensitivity. Manufacturer thrust classes do
not identify compressor maps, inertias, valve rates, ignition delays or radiance.
Do not import commercial-engine parameter values under an F135 label. Prioritize
parameters that affect the observed outputs; record unidentifiable combinations.

Existing optical assumptions include legacy EGT as reactant temperature, ambient
as reaction pressure, a fixed oxidizer surrogate, particle loading and a constant-cp
hot/cold mixture. Migrate those boundaries deliberately as physical stations become
available. Regenerate a table if its domain no longer covers the new states;
silently clamping a new plant into an old optical domain is not acceptance.

## 10. Aircraft outputs, sound and emission

Map native state to one reused aircraft observation snapshot. Consumers share
its simulation timestamp/epoch and validity. Each published quantity needs a
documented source station and physical meaning. The SDK may expose a batch
observation interface; do not add repeated per-consumer property traversal.

Preserve public legacy properties where their meanings remain valid. New meanings
need new names or an explicit version/capability boundary. In particular distinguish
AB command, selection/enable, delivered fuel, burning and heat release. Define
which signal drives the HUD's “active” indication. A legacy augmentation boolean
must not drive the plant, reaction light or a synthetic ignition event.

For sound, distinguish combustion-related noise from jet, shaft and mechanical
sources. New jet inputs should include physically solved velocity, flow and
pressure ratio where supported, replacing thrust-only proxies through a
documented acoustic closure. Do not claim that steady engine state alone supplies
resolved acoustic turbulence. Statistical synthesis remains a separate reduced
sound model governed by [the sound spec](../sound.md).

Afterburner sound gain zero removes the deliberate AB component, including its
spectral changes. Physical changes to base jet/shaft sound may remain. Test and
explain them from attained plant state. Preserve default-on Med, saved explicit
Off, listening acceptance of Low/Med/High and the removal of routine qualification
warnings. Actual faults and overload handling remain. Any DSP edit requires the
audio WASM rebuild and provenance defined in AGENTS.md.

For optics, supply actual station pressure/composition/enthalpy and burned fuel
to the conditional source model. Audit how this changes reaction yield, mixture
temperature, particle heating, residence and dilution. Main-combustor flame is not
assumed visible through opaque turbine hardware. Keep gas, liner and other metal
temperatures separate. Preserve absorption and opaque occlusion through the
interior, nozzle and exterior, including the actual posed geometry.

Chemical emission location and lifetime need a physical source/transport model.
Do not relocate an arbitrary fraction of internal reaction power outside the
engine. Exterior excited-species or continuing-combustion light requires its own
sourced production/transport/loss closure and compatible energy budget. The
existing internal-only CH surrogate may remain an explicitly limited approximation
until that evidence exists. Particle continuum, gas bands and metal radiation
are distinct mechanisms; color follows spectra and viewing conditions.

The model should allow justified dry emission without AB. Its brightness depends
on particles/species, temperatures and optical path, not merely a positive gas
temperature. Preserve the dry display multiplier at **0.5–10×, default 1×** and
its saved ID. One means the current model prediction, not measured F135 truth.
Presentation gains must not change physical heat, fuel, source caches or forces.

Compare source emission, escaped radiance and deck illumination separately.
Near-deck bright structure in the retained footage is not explained merely by
a visible free jet. The present receiver and particle assumptions remain open;
this engine milestone must report their limits rather than declare the entire
carrier phenomenon reproduced. Keep concurrent Sky changes fixed/identified
during each optical comparison.

Joint timing traces must record command, fuel delivery, ignition/burn, native
outlet changes, reaction source, audio publication and first differing DSP
samples. Include epoch, integer clock mapping and physical source location.
No test may force visible and audible thresholds to be equal: light propagation,
sound propagation, telemetry buffering, display/audio latency, exposure and
detectability are different quantities. Source causality and device perception
are separate acceptance records.

## 11. Validation contract

Retain the old discrepancy and its exact provenance. Add tests that fail on a
contradictory plant and pass for physical alternatives, rather than merely
asserting implementation constants. Use synthetic analytical fixtures before
the uncertain F135 profile.

### Physical and numerical gates

1. **Conservation:** verify component and whole-installation mass, elemental/species
   accounting to the chosen resolution, rotor work and signed energy ledgers.
   Include cumulative balances, partly depleted tanks and unburned fuel.
2. **Analytical fixtures:** nozzle mass/velocity/pressure thrust and choking;
   known shaft torque/inertia response including zero speed; lossless and lossy
   mixers/splitters; fuel transport inventory; gas/solid heat exchange and cooldown.
3. **Causal AB correction:** at identical attained physical state, flows, geometry
   and environment, changing only the AB label cannot change the evaluated
   force or source. An actual controller/actuator change is a different physical
   input and must be traced. No command-selected full wet-thrust substitution.
4. **Combustion and residual energy:** new combustion-derived heat/chemical light
   requires the modeled reaction source. A hot cutoff may retain outflow, heat,
   shaft energy and transported radiation after instantaneous burn reaches zero;
   test this as a negative control. Do not impose “zero current AB burn implies
   dry-table thrust” on the new plant.
5. **Transients:** true cold start, first-running AB request, settled dry to AB,
   explicit warm initialization, hot relight, rapid command reversals, AB cutoff,
   failed ignition, blowout, starvation, starter/cutoff/stall/seizure precedence
   and nozzle branch transitions. Retain delivered fuel separately from burn.
6. **STOVL:** conversion sweeps, fan engagement/disengagement and load steps,
   roll-post diversion, attempted hover AB, return to forward flight; account
   for every force, moment, mass flow and shaft load once.
7. **Lifecycle:** all operations in section 7, repeated zero-time calls, copied-dt
   suspension case, mixed engines, dry/AB/hot-off restoration, relocation,
   current and migrated saves, profile mismatch, failed restore, and first
   accepted post-operation step. Include configured-function side effects.
8. **Approximation:** independent hold-out states and trajectories, domain edges,
   discontinuous events, reference refinement and algorithm switches. A local
   model's steady fit does not qualify its transient response.
9. **Compatibility:** existing empirical turbine fixtures and other engines,
   indexed observations, controls, fuel use, trim and SDK load/reset/disposal.
   Separate intended behavior changes from extraction regressions.

### Initial quantitative acceptance targets

These are numerical engineering targets, not measured F135 error bounds. Freeze
the tested metric definitions and scales in stage 1, before tuning or reducing
the model. Keep absolute and normalized residuals; a large reference scale must
not hide a wrong small component or an invented source near zero.

| Metric | Initial gate |
| --- | --- |
| Analytical double-precision component fixtures | Relative error ≤1e-8 away from singular endpoints, with fixture-specific absolute tolerances at zero |
| Accepted algebraic matching | Max scaled equation residual ≤1e-6 at the default tolerance; fixed physical scales documented for each equation |
| Integrated mass / energy balance | Relative closure error ≤1e-6 / ≤1e-5 over each fixture interval; normalize by the sum of absolute transported and stored changes, with explicit absolute floors; report each transfer and storage term |
| Source or force from command-label-only change | Exactly unchanged for the pure evaluator at identical physical inputs |
| Reduced model versus refined component reference | Within 1% of declared full-scale force/flow/power scales and 5 K for designated gas/metal temperatures over the admitted validation envelope; report near-zero absolute errors and extrema |
| Event timing versus refined reference | Within one 120 Hz physics step for ignition, cutoff and choking events where the reference supplies a unique event; no artificial downstream timer |
| Algorithm switch at zero elapsed time | No created/deleted inventories; conservation within the above tolerances and derived-output error within the declared reduction envelope |
| Timestep convergence | Compare 60, 120, 240 and a converged finer reference where needed; default 120 Hz differences stay within the above output/event gates; distinguish event-grid alignment from integration error |
| Source publication | Optical/source observations use the accepted native burn event without a separate ignition state; audio timing respects its recorded transport/synthesis/propagation path |
| Untimed resource checks | No per-step allocation or growing runtime storage; all measured counts/bytes remain within the selected limits, including fallback and switching |

Refine a failing reference before judging a reduction against it. Retain all
failed cases and explain a necessary tolerance revision; neither visual tuning
nor inability to fit an uncertain engine is grounds to hide conservation error.
Where modeled discontinuities make a norm unsuitable, specify an event-aware
metric before inspecting pass/fail results.

Migrate `f135ExhaustOnset.integration.test.ts` and its harness to the new contract.
Replace the legacy expected-failure assertion with the causal/energy tests above,
retaining a clear link to the old evidence. Remove it only when the diagnosed
wet-table/observer contradiction is actually eliminated. Exercise the shipped
WASM DSP in Low/Med/High with AB gain zero and nonzero, matching seeds, native
states and timestamp mapping. First unequal samples diagnose causality, not
audibility. Do not claim GPU/display verification from a CPU source integral.

### Visual and perceptual gates, separately pending

When an explicitly authorized viewing run is available, record aircraft/SDK/
optical/Sky revisions, cold/warm state, nozzle pose, camera, illumination, exposure,
display mapping and sound settings. Compare rear and oblique views, daylight and
night, dry forward flight, dry powered lift and cold/warm AB onset/cutoff. Check
interior/exit/exterior continuity, opaque clipping, saturation and emission/deck
illumination separately. Do not make an exposure change and a physical-source
change in the same unexplained comparison.

Actual sound/display onset needs a suitable synchronized capture or device
measurement, with latency uncertainty stated. User listening/appearance feedback
is retained as an observation, not converted into invented timestamps. Numerical
passing results may coexist with unaccepted or untested appearance.

## 12. Staged implementation and review

Keep a living stage record with status, owner, source identity, inputs, decisions,
checks/logs, unresolved items and next task. A stage is complete only when its
deliverable and exit gate exist. Independent review can be another agent or a
documented coordinator review; it is ordinary work, not a request for repeated
user permission. Keep reviewable local commits scoped to owned changes.

| Stage | Deliverable | Dependencies and exit gate |
| --- | --- | --- |
| 0 — Inventory and evidence | Current source/package/profile identities, caller/consumer map, baseline trace, parameter/source ledger and concurrency plan | First; existing evidence distinguished from new measurements |
| 1 — Contracts and fixtures | Reviewed native state/station/configuration schema, lifecycle amendment, conservation conventions, failure contract, numerical scales and budget registry | 0; no unresolved interface or accounting decision blocks component work |
| 2 — Native physical reference | Generic component equations, coupled gas/shaft/fuel/solid model, synthetic engine and analytical tests | 1; conservation, analytical and convergence gates pass before F135 fitting |
| 3 — Lifecycle integration | Shared native operations, supply/debit handling, complete capture/restore and legacy compatibility adapter | 1; may proceed alongside isolated stage-2 kernel work; integrated 2/3 must pass lifecycle/failure tests |
| 4 — F135 and LiftSystem | Provenance-bearing aircraft profile, representative controller, coupled fan/posts/nozzle and variant audit | 2/3; current controls work, no duplicate force/fuel, hover AB inhibited, uncertainty recorded |
| 5 — Reduction and budgets | Generic generator, independent validation corpus, component/reduced algorithms, switches and bounded fallback | Validated 2 and 4; numerical/error/resource gates pass on the admitted domain |
| 6 — SDK and aircraft consumers | Versioned observation/state transport, F135 adapter, optical boundary and acoustic input migration, UI settings | Frozen 1 contract; final integration waits for 3–5 and identified SDK bytes |
| 7 — Package and integrated checks | Immutable SDK adoption, real-WASM native/app/DSP causality evidence, rollback record | 2–6; exact final artifacts pass required checks and the known contradiction is closed |
| 8 — Qualification and contribution readiness | Numerical report, conditional performance/viewing records, focused upstream candidates and final status | 7; every result labeled passed, failed, untested or outside modeled scope; no unsupported appearance/performance claim |

Stages are bounded pieces of one job. Do not stop after a design sketch, synthetic
fixture or one repaired test and call the whole implementation done. Conversely,
do not delay useful reviewed native work for missing proprietary measurements.
Carry the best supported approximation forward and retain its limitations.

### Stage 0 details

Inventory `FGTurbine`, `FGPropulsion`, `FGEngine`/thruster force paths, fixed-step
publication and the F-35B engine/FCS files. Trace all consumers of EGT, gas and
solid temperature, thrust, nozzle position, augmentation and fuel. Include HUD,
audio, smoke and visual caches. Reuse historical evidence without rerunning it;
run a fresh CPU baseline only where the current source/package differs or a
new observation is needed. Record which native outputs are calculated before
versus after fuel debit and which configuration functions have side effects.

Refresh live PR state before proposing changes to an existing contribution.
The [October 7 snapshot](../../validation/evidence/jsbsim/open-pr-review-2026-10-07/status.json)
is a starting record, not permanently current status. Record known concurrent
files and assign a single writer to each shared integration surface.

### Stage 1 details

Write the generic native contract with its implementation in JSBSim; this
cross-repository spec links to it. Resolve configuration opt-in, component
topology, property names, snapshot versions, thermochemical datum, map limits,
controller state, supply allocation, step failure and thermal policy. Review
the pending initialization contract against the actual current fork. Preserve
its useful measured findings; supersede only explicitly identified rules.

Create synthetic fixture specifications whose correct answers are independent
of the production solver. Freeze reference scales, absolute floors and event
definitions in a machine-readable validation configuration. Design an immutable
input evaluation so nonlinear trials cannot mutate tanks or XML state. Settle
the compatibility mapping before parallel consumers implement an imagined API.

### Stages 2–3 details

Build and test components incrementally: properties and conservation; fuel and
combustion; shaft/components/matching; nozzle/forces; gas-solid coupling. Use a
simple open synthetic engine before introducing F135 uncertainty. Record solver
conditioning, branches and failure behavior. Add storage volumes only against
a retained discrepancy or required timescale.

Reuse and finish the existing turbine initialization work where equivalent;
do not blindly cherry-pick old commits already integrated in another form.
Keep extraction changes distinct from intentional physical behavior changes.
Use one calculation core with separate operation policies and one accepted
commit of state, fuel/energy accounting and outputs. Validate integrated stages
2/3 before authoring an aircraft profile that depends on them.

### Stage 4 details

Fit only to identifiable constraints with declared operating conditions and
uncertainties. Retain separate residuals for thrust, fuel, spool, station/thermal
data and transients. Do not tune brightness or audio delay as an engine-fitting
objective. Document surrogate compressor/turbine maps as surrogates. Run
sensitivity checks that show which unknowns dominate AB onset and dry outlet
conditions. A plausible rating match is insufficient evidence for internal
temperatures or fuel split.

Replace the active F-35B installation's independent lift/side force model through
a controlled configuration migration. Keep the previous aircraft/package pair
as rollback. Preserve other aircraft. Validate forward flight and conversion
controls as well as the static engine stand; keep handling differences caused by
the revised propulsion distinct from unrelated aerodynamics/ground defects.

### Stage 5 details

Generate the reduced model from the reviewed component reference. Split fit and
validation data before tuning. Include cold/hot starts, altitude/Mach/ambient
variations, supply limits, actuator changes, nozzle regimes and STOVL loads in
the declared domain. If some regimes need the component solver, include its
cost/storage and prove admission/fallback behavior. Record why the optional
local linear candidate is accepted or deferred.

Prove bounded work and storage without a timing benchmark. Qualify runtime cost
only through the separately permitted protocol in section 13. A faster result
outside the accuracy envelope is not a valid optimization. Never declare an
algorithm faster solely from fewer source-code operations.

### Stages 6–7 details

Useful current entry points, to verify against the execution checkout:

- JSBSim `src/models/propulsion/FGTurbine.{h,cpp}`, propulsion/engine/thruster
  owners, `tests/TestTurbine*.py`, `tests/unit_tests/FGTurbineTemperatureTest.h`
  and `wasm/`.
- 0sfs `public/jsbsim-data/aircraft/F-35B-jsbsim/` and
  `src/flight/physics/safeFlightState.ts`.
- `src/flight/aircraft/engineGasOptics.ts`, `engineReactionEmission.ts`,
  `engineGasSupport.ts`, `createEngineExhaust.ts`, their profiles/tests, and
  `scripts/exhaustOptics/`.
- `src/flight/audio/f135ExhaustOnsetHarness.ts`,
  `f135ExhaustOnset.integration.test.ts`, the audio property adapter/transport,
  `dsp/turbofan.h` and its snapshot ABI.
- `scripts/validation/f35b/check-f135-ab-onset.mjs`,
  `src/flight/settings/flightParameters.ts` and the Engine/Exhaust panel sections.

Use the immutable SDK tarball workflow in `docs/jsbsim.md`. Native contribution
trees and the fork integration used to produce the SDK are separate identities;
test each claim on the tree/artifact it names. Do not install a mutable sibling
build directly into 0sfs. Version SDK observations and DSP transport together
where necessary, and reject mismatched schemas safely. Rebuild the audio artifact
if DSP sources change.

Retain baseline and new native, source and DSP traces, plus the optical-table
domain audit. Verify installation/emitted bytes, lifecycle and unrelated aircraft
compatibility. Keep each check's output once and read its log rather than rerunning
the suite to recover information.

### Stage 8 details and completion record

Publish the local implementation report under `docs/validation/` with retained
records under `validation/evidence/jsbsim/engine-plant/` and
`validation/evidence/aircraft/f35b/engine-plant/`. Each record identifies source,
profile, algorithm/settings, generated inputs, package and DSP hashes, units,
clock mapping, command and acceptance result. Preserve failures and superseded
records with notices. Keep third-party media under the existing license policy.

Report these dimensions independently:

| Dimension | Completion evidence |
| --- | --- |
| Implemented system | Native reference and reduced implementation, configured F135 installation, SDK/app consumers and resource controls |
| Numerical correctness | Analytical, conservation, convergence, lifecycle and joint-source checks on final identities |
| Physical fidelity | Supported constraints, fitted parameters, unknowns and explicit limits; no “exact F135” claim |
| Runtime cost | Untimed bounds, plus qualified device results only when measured; pending timing is visible |
| Sound/visual acceptance | Source causality versus separately recorded listening/display/appearance results |
| Upstream readiness | Focused candidate identities, settled interfaces, exact-candidate checks and draft descriptions; publication status separate |

A numerically complete implementation can be ready for a user viewing check
while performance or appearance is still unqualified. Report that state plainly;
do not mark the overall real-world appearance objective fixed.

## 13. Checks and execution restrictions

This document-writing task runs no implementation builds, tests or benchmarks.
When the handoff is explicitly invoked for implementation, its native compile/
test work and final WASM package build are required work. Do one final clean SDK
build after native gates, plus a rebuild only if a later source change or failure
requires it. Follow the pinned toolchain, ccache and per-branch build-directory
instructions in [JSBSim integration](../jsbsim.md); build only needed targets.
An equal-commit WASM hash difference alone does not prove a different source.

For changed 0sfs code, retain logs under `build/` for incremental `npx tsc -b`,
related Vitest tests (`--maxWorkers=50%`) and `npm run lint`. Run final
`npm run ci` once after integration is finished. Run owning-repository checks for
any changed FOSS Earth/native/SDK code, with affected native `ctest -R` targets
and the final suite required by the contribution policy. Do not run overlapping
suites with another session; cap repeated/background native jobs at `-j5`.
Do not use `tsc --force`, delete incremental caches or broaden reruns without a
new change, failure or unresolved concern. Documentation-only edits need no CI.

Standing restrictions persist: do not start/restart/stop a dev, preview or watch
server; do not run a browser/GPU capture or timing benchmark from this saved
handoff alone. The user's earlier GPU refusal and deployment hold are not
withdrawn by writing this spec. Use CPU numerical diagnostics for available
progress and leave conditional qualification explicitly pending. A later
explicit instruction may authorize the relevant run. Close any authorized
headless browser normally in `finally`; follow the clone policy.

When timing is authorized, follow FOSS Earth's
[interference policy](../../../foss-earth/docs/validation/benchmark-interference.md).
Measure native solver, SDK publication, CPU source-field updates and DSP separately,
then the integrated application under identical workloads. Include cold/warm
transients, STOVL, fallback and algorithm switches. Record hardware/toolchain,
settings, p50/p95/p99/observed maximum, allocation/bytes, missed deadlines and
interference. Compare the legacy baseline, component and reduced algorithms
using the same aircraft/environment script and disclose physical-output changes.
Wall-clock targets are statistical engineering budgets, not guaranteed deadlines.
Do not qualify contaminated samples or promise no performance regression without
evidence. Ask for exclusive timing time only if required; continue untimed work.

## 14. Upstream contribution plan

As of October 7, all six authored upstream PRs are open with green CI. The relevant
discussion is [#1505](https://github.com/JSBSim-Team/jsbsim/pull/1505) and stacked
[#1508](https://github.com/JSBSim-Team/jsbsim/pull/1508): maintainers propose using
shared running/steady calculations. Review the
[combined proposal](https://github.com/JSBSim-Team/jsbsim/pull/1505#issuecomment-5849449704)
and the [subsequent correction](https://github.com/JSBSim-Team/jsbsim/pull/1505#issuecomment-5849528886).
Our earlier one-line `GetTrimStatus()` characterization did **not** evaluate or
refute the combined `tpRun`/`Seek()`/`Trim()` removal proposal.

Keep contributions focused and useful without 0sfs:

1. Resolve the existing spool/fuel repair and shared-calculation discussion,
   preserving regression cases and characterizing compatibility.
2. Contribute settled explicit lifecycle/state/force-completion changes as a
   focused native follow-up; do not bundle the whole cycle into #1505/#1508.
3. Introduce the optional generic component plant, schema, synthetic fixtures
   and conservation tests in reviewable slices. Preserve empirical engines.
4. Add the generic reduction tooling/algorithm contract with independently
   reproducible accuracy evidence; keep dependencies optional/offline.
5. Contribute generic SDK observations/state exposure separately as appropriate
   to the current WASM packaging discussion.

The wheel, reload and tank PRs remain independent work; do not repair or rewrite
them just to include them in this series. F135 data, UI, display tuning, fork
package versions and local checkout paths do not belong in generic native PRs.
Upstream should receive portable native tests, generic docs and reproducible
fixtures, not links to unavailable local scratch as its only evidence.

Prepare exact-candidate tests, compatibility notes and draft PR descriptions
locally. Upstream acceptance does not block productive fork work. No instruction
here authorizes posting comments/messages, submitting/pushing PR changes or
deploying Pages; follow the current session's explicit publication instructions.
The October 7 user request was to check PRs and write this handoff.

## 15. Primary references and limits of their use

These references establish methods or public architectural constraints; none
provides a complete calibrated F135 transient/radiance dataset. Keep primary
source citations beside new equations, datasets and parameter claims as the
implementation develops. Do not copy source code or data without its license.

| Source | Use in this specification | Limit |
| --- | --- | --- |
| [NASA T-MATS user's guide](https://ntrs.nasa.gov/citations/20150002325) and [NASA source repository](https://github.com/nasa/T-MATS) | Component maps, matched gas path, dynamic shafts and separate steady/transient solving | Architecture reference; not F135 maps or a requirement to embed MATLAB |
| [NASA C-MAPSS40k](https://ntrs.nasa.gov/citations/20100037767) | Coupled component engine, representative controller and actuator/transient treatment | Commercial-engine model; its parameters and runtime results are not F135/device qualification |
| [NASA turbofan volume-dynamics study](https://ntrs.nasa.gov/citations/20100022160) | Reasons to distinguish slow shaft/control response from fast gas-volume response | Add states for demonstrated needs; do not copy example delays or require every volume |
| [NASA practical gas-turbine modeling techniques](https://ntrs.nasa.gov/citations/20160012485) | Component maps, design-point data and scaling/calibration requirements | Rating data alone does not identify an engine |
| [NASA local dynamic engine model example](https://ntrs.nasa.gov/citations/20150000721) | Basis for considering local linear reduction | Does not establish conservation or global startup/ignition validity of our reduction |
| [NASA thrust equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/thrust-force/) | Momentum and pressure contributions to thrust | Installation must additionally account for multiple flows, frames and moment arms |
| [Rolls-Royce LiftSystem](https://www.rolls-royce.com/products-and-services/defence/aerospace/combat-jets/rolls-royce-liftsystem.aspx) | Shaft-driven fan, clutch/driveshaft, swivel module and bypass-fed roll posts | Public architecture/capacity, not proprietary schedules or complete maps |
| [Moog engine controls](https://www.moog.com/content/dam/moog/literature/Aircraft/acc/Moog-ACC-Engine-Controls-Datasheet-1.pdf) | Distinct swivel and nozzle actuation | Does not specify a full area/control law |
| [Lockheed Martin F-35B engineering account](https://www.codeonemagazine.com/article.html?item_id=137) | Nozzle installation and operational hover AB restriction | Does not reveal complete interlock logic |
| [NASA TF30 acoustic measurements](https://ntrs.nasa.gov/citations/19790004874) | Distinct mixing, shock and internally generated acoustic mechanisms | Not a calibrated F135 spectrum, level or onset measurement |

Retain the existing [combustion optical model's primary references and caveats](../../scripts/exhaustOptics/combustion/README.md)
and the [night-footage comparison](../validation/f135-night-video-comparison.md).
The footage constrains observed appearance under partially unknown capture
conditions. It does not by itself identify particle loading, gas temperature,
combustion state, deck reflectance or observer exposure.
