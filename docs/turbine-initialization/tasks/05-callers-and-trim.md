# Task 5: route native callers and finalize accepted state

Require reviewed stage 4. Read [plan](../plan.md),
[contract](../contract.md), [validation](../validation.md) and completed
`decisions.md`. This is the deliberate compatibility change, including the
existing off-engine powered-thrust behavior.

## Work

1. Route Run, suspended evaluation, RunIC, engine InitRunning, propulsion
   GetSteadyState and aircraft trim according to the exact reviewed call
   table. Preserve old public signatures/index meanings with adapters and
   expose the explicit path needed by refresh/restore callers. Do not infer
   restart from an old Running flag or silently override live cutoff.
2. For supported turbine states, replace synthetic time settling with
   explicit steady evaluation. Keep other engine types on their established
   path. Per-engine requests must not inadvertently initialize other engines.
3. Finish controls/environment evaluation, engine state, thruster and
   propulsion forces, and dependent vehicle forces/derivatives before success
   returns. Avoid another blanket Run that reinitializes history or repeats
   stateful functions incorrectly. Preserve contacts/FCS ordering identified
   in stage 1. Remove the first-frame trim-finished work only after every
   responsibility has an explicit destination.
4. Make steady trim honor engine eligibility. An off engine cannot supply
   powered thrust; preserve residual rotation. Test an engine-out/mixed-engine
   solve and an impossible requested solution. Do not start an engine or
   widen solver tolerance to make a newly invalid legacy solution pass.
5. Finalize accepted trim state on success. On nonconvergence/exception,
   restore the documented engine/control state and operation/timestep/trim
   context, then corresponding outputs. Follow the bounded XML side-effect
   policy; do not claim arbitrary callback rollback.
6. Document caller behavior and changed compatibility in the owner project's
   API documentation. Add migration examples for callers that previously
   suspended integration to obtain steady thrust.

## Tests and exit

Exercise all public-entry rows of the validation matrix in Python/native:
first/repeated RunIC, live cutoff with persistent IC running request, explicit
restart, CLI trim versus API RunIC, per/all-engine initialization, non-unit
propulsion rate, nested suspension, success/failure restoration and immediate
vehicle-output coherence. Include ordinary starting and other engine types.

Compare affected stock turbine scripts and trim fixtures against the
pre-redesign integration. Identify changed powered-off trim results explicitly;
they are expected only where the baseline depended on that behavior. Do not
delete them from the comparison. A test that needs explicit engine-running
intent may be migrated in a separately explained fixture change; retain the
original fixture result as compatibility evidence.

Record `reports/05-callers-and-trim.md`, source identities, cause of each
change and remaining compatibility issues. Stage 6 must not proceed with an
unresolved contract failure. No public posts or installed dependency changes.
