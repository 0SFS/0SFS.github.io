# Task 4: implement turbine operations and state capture

Read [plan](../plan.md), [contract](../contract.md),
[validation](../validation.md), completed `decisions.md` and the reviewed
stage-3 result. Implement the agreed API, not a newly invented alternative.
Keep public legacy wrappers usable while the new operations are introduced;
stage 5 completes caller routing.

## Work

1. Introduce the minimal native representation of evaluation intent and
   explicit initial-state policy. Preserve physical phase separately. A
   turbine operation must not infer steady initialization from dt alone.
2. Implement direct running initialization from current inputs where
   supported, history-preserving refresh, explicit cold reset and ordinary
   advance through the shared calculations. Resolve current commands,
   faults and fuel eligibility with the precedence decided in stage 1.
   Return truthful failure for unavailable/unsupported initialization.
3. Implement the non-consuming fuel eligibility query with FGPropulsion as
   owner, sharing tank/feed logic rather than duplicating it in FGTurbine.
   Respect reviewed freeze semantics; preserve unrelated engine accounting.
4. Implement explicit warm/history policies and frozen-duration injection
   handling. Initialization/refresh must not advance hidden engine time,
   seek continuous histories, or debit tanks. Publish all promised engine
   outputs consistently. Preserve ordinary startup/shutdown dynamics.
5. Implement versioned native turbine state capture/validation/restore and
   engine-owned rollback from the reviewed inventory. Validate the whole
   record and identity before mutation. Use value/owned state rather than
   exposed raw pointers. Preserve accounting and injection/thermal history;
   recompute derived state where the contract permits it.
6. Add the scoped restoration mechanism for operation/trim/dt state needed
   by these paths. Test actual copied engine dt as well as executive dt,
   including nested and exceptional exits. Do not assume the old single
   saved-dt field provides nesting semantics.

## Tests and exit

Use native core tests to demonstrate each new operation at unchanged inputs
and changed controls/environment. Cover stale Running plus immediate cutoff,
fuel unavailable/frozen, starter-only and fueled starts, shutdown residuals,
fault precedence, thermal policy and injection duration. Show normal transient
rates remain valid and repeated refresh does not walk continuous history.

Capture and restore during running, starting and shutdown, then compare
subsequent turbine evolution with an uninterrupted fixed-environment control.
Test malformed/nonfinite/incompatible state and failed operation rollback.
Exercise configured-function visibility and document the external side-effect
boundary. Avoid claiming whole-model transactional restore.

Run focused Python/adjacent tests to keep legacy wrappers working and CxxTest
with Python disabled. Record evidence and `reports/04-explicit-operations.md`.
Split core operation and state-capture changes into reviewable local commits
after coordinator review. The stage is not public-call acceptance: until
stage 5 routes all callers, do not claim RunIC/trim/app behavior is repaired.
