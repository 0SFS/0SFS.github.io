# Implement the coupled turbine engine and F135 integration

Work in `/Users/felg/gh/0sfs`. Read `AGENTS.md` first, then
[the implementation specification](proposals/engine-plant-implementation.md).
Read the owner's `AGENTS.md` before editing any sibling repository. Preserve
existing and concurrent work.

This is a large staged implementation assignment. Follow the specification's
stage dependencies, deliverables and acceptance gates; continue beyond planning
through the authorized implementation and integration. Maintain a stage record
so another session can resume without reconstructing decisions. The coordinator
reviews stage gates as normal engineering work; do not ask the user to approve
each routine implementation choice.

## Objective

Replace the F135's inconsistent empirical-thrust/thermal-observer combination
with an explicitly selected coupled native engine model. Actual core and reheat
fuel delivery, combustion, gas conditions, shaft work, nozzle flow and thrust
must describe one physical transient. Sound and luminous exhaust consume the
same timestamped native state.

Provide a component-model reference and a validated reduced nonlinear runtime
implementation with explicit compute controls. Investigate a local linear
alternative only where it offers a defensible cost/error advantage. Precompute
expensive thermodynamic, matching and optical relationships offline. Report
physical unknowns and numerical approximation error separately.

## Starting evidence

The [joint AB onset record](validation/f135-ab-onset.md) reproduces a 4.1333 s
cold-start interval in fork.16 where the legacy engine has selected full wet
thrust but its thermal observer reports zero burned reheat fuel. The observer
infers the split by subtracting steady dry fuel demand from transient total
fuel; it does not model separate actual fuel paths. This is a native physical
consistency problem. The optical source already responds to positive inferred
burn without waiting for hot metal.

Preserve this evidence. Replace its legacy expected-failure comparison with the
specification's causal and energy-accounting tests. A new physical plant can
retain hot outflow after cutoff and can move actuators before ignition: do not
mistake “zero current AB burn means exactly dry thrust/sound” for a physical law.

The user currently likes the faint dry red exhaust at night. That is appearance
feedback, not calibration. Preserve the dry multiplier range **0.5–10×**, default
**1×**, the Exhaust tab with its Afterburner section, default-on Med sound and
saved explicit Off. Routine sound qualification warnings remain removed.

## Owners and protected behavior

- **JSBSim:** native plant, conservation, control/actuator/combustion state,
  fuel supply, nozzle/shaft/LiftSystem coupling, lifecycle, generic generators,
  native tests and SDK under `wasm/`.
- **0sfs:** F135 profile and installation, controls/fixed-step composition,
  aircraft visuals and sound/optical adapters, aircraft data/tooling and settings.
- **FOSS Earth:** shared lighting, exposure, depth and renderer fixes.

Name the owner before each new module. Preserve rigid nozzle geometry, separate
metal temperatures, working controls, native hover AB inhibition, state recovery,
aircraft lifecycle and empirical engines that have not selected the new model.
Audit inherited lift/side engine forces so the new LiftSystem does not duplicate
thrust, fuel or power. Coordinate with concurrent Sky and smoke/hot-gas work.

No visual startup fade, sound delay, arbitrary temperature ramp, warmer RGB,
blue ban, exterior chemical-light allocation or brightness boost may stand in
for the physical correction. Scene exposure must not influence engine heat.

## Execution

1. Inventory current branches, dirty files, installed SDK bytes, engine profile,
   consumers and retained evidence. Refresh upstream PR state read-only.
2. Freeze the state/station/configuration, lifecycle, energy and failure contracts
   and numerical metrics. Reconcile the unfinished turbine initialization plan.
3. Implement and validate the generic component reference and native lifecycle
   with synthetic/analytical fixtures before fitting the F135.
4. Configure the F135 and coupled LiftSystem with primary-source provenance,
   explicit hypotheses and uncertainty; validate controls and conversion.
5. Generate and validate the reduced implementation, state mappings, bounded
   work/storage, domain checks and fallback. Expose meaningful compute settings.
6. Integrate SDK observations, aircraft sound/optics and settings. Build/adopt one
   immutable SDK after native gates, rebuild changed DSP artifacts, and run the
   installed native/source/DSP checks and final repository checks.
7. Prepare focused upstream candidates and local draft descriptions. Report
   numerical, physical, performance and visual status separately, with links to
   retained evidence and specific remaining work.

Use the specification for detailed gates, owners and source references. Parallel
agents may own independent native kernels, lifecycle work, generators or consumer
tests after their interfaces are settled. Assign one writer per shared file;
integrate through reviewed boundaries rather than concurrent broad edits.

## Restrictions and completion

This prompt requests native implementation/test builds and the final SDK build
when explicitly invoked for implementation. Its existence does not authorize
starting servers, browser/GPU runs, timing benchmarks or deployment. Existing
restrictions and the deployment hold persist; see specification section 13.
Continue useful CPU numerical work while conditional qualification is pending.
Keep scratch/logs under `build/`, retained evidence under `validation/evidence/`
and runnable tools in scripts/tests. Preserve existing build folders and media
license boundaries.

Run incremental typecheck, related tests and lint for edits; full final CI once.
Run owner checks and exact-candidate native tests, avoiding overlapping suites.
Never mark an expected failure resolved just by deleting it or weakening its
meaning. Prepare upstream work separately from app integration; do not post
messages, push PR revisions or deploy from this handoff alone.

Finish with what changed, exact tested identities, algorithms/domains/budgets,
source and timing results, unresolved calibration/appearance/performance limits,
and upstream readiness. A CPU source integral is not a visible flame, and a
source-causality pass is not a measured audiovisual synchronization pass.
