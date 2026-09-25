# Stage 1 review and follow-up

**Historical first review.** The [follow-up review](01-follow-up-review.md)
supersedes this open-item list: the characterization/evidence corrections are
accepted, with a bounded set of contract corrections still required. Do not
repeat the closed measurement work below.

2026-09-19. **Changes requested; stage 3 must not start yet.** The
[characterization report](01-characterization.md) contains useful measurements,
but [decisions.md](../decisions.md) does not yet satisfy the stage-1 exit:
an internally consistent operation/state/failure contract ready to implement.
This is a bounded follow-up to stage 1, not a request to redo all experiments.

The coordinator read the source, decisions, trace tool and retained results;
all six extension hashes, the trace-tool hash and the instrumentation hash
match provenance. The JSBSim checkout remains clean at `482da811`. No new
engine tests were run during this review. Stages 0 and 2 remain accepted.

## 1. Separate refresh from a steady operating point

`decisions.md` section 2 routes a running `RunIC()` without a new start request
to `opRefresh`, and section 8 routes aircraft trim there too. The contract
requires refresh to preserve N1/N2 and fuel-flow history, while the decisions
promise immediate steady N1/N2/flow after a throttle change. Both cannot be
implemented by the same history-preserving operation. `opInitRunning` always
warms the engine, so it does not cover a steady trial preserving thermal
history either.

Specify a distinct steady-evaluation operation or an explicit policy. Define
its eligibility, state assignment and thermal/injection preservation. Map
eligible running `RunIC()`, aircraft-trim trials and finalization to that
operation; map history-preserving recovery to refresh. Keep deliberate cold
and warm starts explicit. Show how forces, moments and dependent vehicle
derivatives finish before the public call returns; an engine-only manager
entry point does not by itself describe that completion sequence.

The `FGLinearization` question can be bounded without waiting for a new
modelling policy: preserve its measured existing steady-map behavior through
an explicit compatibility path and reserve a dynamic-engine Jacobian for a
separate proposal. Do not claim that history-preserving `opRefresh` reproduces
the current steady map. Record a representative compatibility measurement.

## 2. Keep stage 3 behavior-preserving

Section 6 assigns normalization recomputation and a [0, 1] clamp to stage 3.
Section 7 prescribes function evaluation across every phase. Those change
behavior; [task 3](../tasks/03-shared-calculations.md) explicitly requires an
equivalent extraction and puts semantic changes in separate stage-4/5 commits.

Keep the extraction equivalent, including conditional TSFC/ATSFC call counts
and order. Stage 2 deliberately stopped those calls for off-engine trim, and
ordinary `Run()` also has conditional calls. Replace the blanket "once each"
rule with a phase/operation call table. A constant `copyto` sentinel detects
presence, not evaluation count; count assertions need a counter or another
demonstrably count-sensitive fixture.

Schedule the restart normalization fix separately. Settle the policy before
calling the decisions complete: distinguish removing stale normalization
from clamping it for every consumer. Examine below-idle and above-maximum
states, injection-factor changes and writable maximum spool values. Define
invalid/zero normalization-denominator handling. The 3.19x rate sensitivity
supports investigating stale state; it does not establish that every reader
should receive the same clamped quantity. Do not turn an unproved clamp into
a behavior-preserving refactor by calling it defensive.

## 3. Make capability, result and failure contracts implementable

Section 1 falls back to `Calculate()` for every unsupported operation. That
does not implement cold reset, running initialization or state restoration.
Its `bool Evaluate(...)` also cannot report the promised per-engine fallback
details, and `opRestore` has no record argument.

Specify meaningful status/error results and multi-engine semantics. Explicit
new operations should reject unsupported requests before mutation; legacy
wrappers can deliberately retain the appropriate existing engine-type paths.
Keep restoration as a record-taking operation. Define whether a multi-engine
request is all-or-none or exposes partial completion and how callers handle it.

Section 8 proposes rollback using the same public captured record whose
restore calls refresh. That record omits derived outputs/caches; refresh may
reevaluate the function that just threw or create more `copyto` effects.
Distinguish portable public state from a private nonthrowing undo snapshot.
Inventory the changed engine/cache/thruster/force values and caller/FCS
controls, including the FCS mixture changed by legacy initialization, not
just copied `in` arrays. Explain how dependent outputs are restored without
requiring the failed configured function to succeed. Keep arbitrary external
`copyto` effects outside the promised rollback boundary explicitly.

## 4. Finish state, fuel and IC lifecycle decisions

The following are still underspecified in sections 2–5:

- Runtime-writable `MaxN1`, `MaxN2` and `BleedDemand` appear only in the model
  digest. A fresh instance of the same XML cannot reconstruct their captured
  runtime values from a digest. Capture the overrides or define and test the
  restriction/rejection. Complete the member audit, including inherited
  `FGEngine::FuelFreeze` and mutable thruster orientation/acting-location
  state, even when the disposition is "external" or "unused by turbines".
- Specify the record format, required fields, cold defaults, numeric
  validation and missing/unknown-field policy. Identify external inputs and
  function state required for deterministic cross-instance continuation.
  A matching configuration digest is an identity check, not proof of it.
  Describe restore tests as planned; no state API has been implemented yet.
- Resolve usable/empty fuel crossed with freeze and stale starvation state.
  "Reject no usable fuel" and "a frozen tank is not a start failure" leave
  empty frozen tanks ambiguous. Distinguish requested/indicated/delivered
  residual flow and the combustion signal under starvation. Tank debit proves
  existing accounting behavior; it does not alone establish combustion.
- One-shot IC running intent needs explicit load, write, reset/rearm and
  failure/retry rules. Preserve a deliberate reset-to-scenario operation.
  Explain why changing legacy IC replay is necessary when a new passive
  refresh API can bypass it. If retaining that change, identify actual
  migration cases before adding a temporary persistence switch. Account for
  the proposed per-engine `set-running` behavior change too; it is not in
  the report's list of three changes.
- Choose the behavior for a missing injection function. "Guard or reject at
  Load" is still an alternative, with different consequences for stock B747
  loading. State the chosen fallback/error behavior and its compatibility test.

Avoid making serialization a reason to omit a native state model. A string
boundary may be reasonable, but capture runs every fixed step in the app;
acknowledge serialization/allocation there, as well as parsing on restore.
No performance claim or benchmark is required to settle the representation.

## 5. Correct the measurement interpretation

The instrumentation assigns `DiagEngineDT`, `DiagExecDT` and `DiagTrimStatus`
at `Calculate()` entry, and `DiagPhase` immediately before dispatch. They
describe the last evaluation, not necessarily current state after the public
call returns. In particular,
`starvation-nesting-and-stale-tsfc.txt` says settling leaves copied dt at 0.5,
but `FGPropulsion::GetSteadyState()` restores `in.TotalDeltaT = TimeStep`
before returning. The diagnostic retains the last settling sample instead.

Clearly distinguish last-dispatch fields from live state. Add side-effect-free
current-state probes where needed and recheck the affected timestep/phase
claims. Preserve original records with a correction note and separately
identified follow-up evidence. This does not invalidate the independently
observed executive nesting defect.

Correct the report, decisions, tracker and unposted maintainer draft:

- The one-line condition breaks the measured initialize-running path; it
  does not stop all turbine starts. The retained `starts` trace shows both
  variants reaching `Running == 1` through starter/cutoff operation.
- On master, N1/N2 and TSFC update on the following frame; fuel flow then
  seeks over further frames. The table itself shows 149.05 to 150.29 gph,
  against a 585.52 gph steady target.
- Two of six builds survive the injection crash, not one.
- Scope "forever" to continued bypass of fuel accounting, or the failed
  paired resume. Explicit intervention can change those conditions.
- Native 737 measurements plus app source inspection are not exact measured
  readbacks from the installed SF50 WASM package.
- State the instrumentation result as "zero differences among 2137 compared
  values per pair," not "reproduces on 0 of 2137 values."

## 6. Make the evidence reproducible without ignored scratch

Several consequential focused probes have only retained text outputs. Their
provenance refers to scripts under ignored `build/.../probe/`; those scripts
are not delivered. The full machine-readable trace is also only in `build/`,
while the retained Markdown omits counters, internal flow and injection state
used in the conclusions.

Retain runnable probes and the instrumentation helper under
`scripts/validation/jsbsim/turbine-initialization/`. Keep lossless trace data
or a sufficient machine-readable subset under top-level `validation/evidence/`,
with commands, source/fixture identities and digests. Update links and the
instrumentation application command to the retained helper. Preserve original
results; moving tools does not change what an earlier binary measured.

## Follow-up and exit

Revise the decisions, contract, stage boundaries, report and draft together.
Add the missing focused reproductions and correct only affected measurements;
reuse verified binaries where instrumentation/source has not changed. New
diagnostic binaries need their own identities and equivalence check for the
observables used. Do not rerun unrelated suites or implement production fixes
to settle this review.

For each numbered section above, report its disposition and evidence. Leave
stage 1 marked "changes requested" until coordinator review accepts the
revised contract. Keep stage 3 pending. Publication and app adoption remain
outside this follow-up.

A scoped documentation/tool/evidence commit on 0sfs `main` is not a JSBSim
merge or a declaration that stage 1 passed. The current 0sfs tree also holds
other sessions' work and uncommitted prerequisite turbine documents. Identify
the exact file/hunk set and required prerequisite files before committing;
never stage the whole working tree. Do not commit the current decisions as
an approved implementation specification.
