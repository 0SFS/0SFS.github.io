# Task 3: share turbine calculations without changing behavior

**Do not start until the coordinator accepts the revised stage-1 contract.**

This task changes no behaviour. The stage-1 decisions place every semantic
change in stage 4 or 5, including the `N2norm` recomputation and any clamp,
the nozzle-position and EPR assignments in the steady path, the fuel-rate
publication change and the combustion signal. If the extraction appears to
need one of them, that is a finding to report, not a change to make here.

Two stage-1 results bind this task directly:

- the **per-phase configured-function call table** in
  [decisions.md §2](../decisions.md) must be reproduced exactly, including the
  first augmented frame that evaluates both TSFC and ATSFC, the `<augmethod> 1`
  frame that evaluates neither, and the 124 engine evaluations one
  `propulsion/set-running` performs. Assert the counts with an evaluation
  counter or another demonstrably count-sensitive fixture: a constant `copyto`
  sentinel shows that a function ran, not how often;
- the extraction must keep the **attained-spool input used by running** and the
  **steady-spool input used by initialization** as separate parameters of the
  shared primitive, because the contract's steady and refresh operations differ
  in exactly that.

The revised contract adds two constraints on this task's scope:

- the **`N2norm` clamp is excluded from the implementation baseline**. The
  stale-normalization repair is stage 4 and the clamp, if it is justified at
  all, is a separate measured change with its own test. Neither may arrive
  inside the extraction, and the clamp must not accompany the repair silently;
- the file set for this task includes its **CxxTest registration**:
  `tests/unit_tests/FGTurbineTest.h` and its entry in `UNIT_TESTS` in
  `tests/unit_tests/CMakeLists.txt`, alongside `FGTurbine.cpp/.h` and any
  Python characterization added under `tests/`. A report that lists only
  `FGTurbine.cpp/.h` has not listed what this task changes.

Read [plan](../plan.md), [contract](../contract.md),
[validation](../validation.md), the completed `decisions.md` and reports for
stages 0–2. Require their reviewed source identities. The coordinator creates
the integration branch from fork master and integrates the two corrections
before this task; record that exact base. Do not perform unrelated merges.

## Work

1. Add/register a focused turbine CxxTest suite using stock or self-contained
   fixtures and existing test conventions. Exercise observable behavior,
   not helper implementation details. Extend Python API characterization
   where it protects actual initialization entry points.
2. Extract common arithmetic for spool factors/targets, dry thrust, bleed,
   augmentation/injection effects, corrected TSFC and fuel targets as the
   reviewed design specifies. Separate sampled inputs, calculated targets
   and mutation of persistent state. Preserve the distinct attained-spool
   input used by running versus steady-spool input used by initialization.
3. Keep time integration in the dynamic application path. Do not replace
   rate-limited fuel/nozzle/spool state with its target during normal Run.
   Keep phase-specific start/stall/seizure behavior and XML property ties.
4. Preserve operation order where it affects results. Pre-function caching,
   property-dependent TSFC/ATSFC and `copyto` are observable. When legacy
   paths differ, use a parameterized shared primitive or retain a small
   caller-specific wrapper; do not conceal a behavior change as deduplication.
5. Preserve optional downstream idle-flow behavior on the fork; keep the
   upstream extraction independent of that unmerged feature unless it is a
   demonstrated prerequisite. Avoid new public API in an arithmetic-only
   commit unless the reviewed design requires it.

## Exit

Compare candidate against the exact pre-extraction source at fixed controls
and environment across normal throttle transients, dry/augmented/injected
states and initialization. Run relevant existing Python tests and the new
CxxTest suite with Python ON and OFF. Preserve the stage-1 function-order
characterizations. Explain floating-point changes rather than widening
tolerances silently. Any necessary semantic change belongs in a separate
stage-4/5 commit with its own causal test.

Record changed files, source/module identities, comparisons and results in
`reports/03-shared-calculations.md` and retained evidence. Leave the candidate
for coordinator review and local commit. No PR update or app/package change.
