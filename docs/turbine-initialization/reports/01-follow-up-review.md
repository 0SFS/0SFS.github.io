# Stage 1 follow-up review

2026-09-19. **Characterization/evidence follow-up accepted; implementation
contract still needs corrections. Stage 3 remains pending.** This supersedes
the open-item list in [the first review](01-review.md); do not redo its closed
evidence work. Stages 0 and 2 remain accepted at their recorded identities.

The coordinator verified all six follow-up extension hashes and all three
tool hashes. Parsing the recorded runs reproduces zero differences among
2137 ordinary values per instrumented/uninstrumented pair and among 5137
shared values per old/new diagnostic pair; the three reused binaries also
reproduce their original ordinary values. The retained lossless trace matches
the recorded diagnostic scenarios. Runnable focused probes and live getters
are now delivered. No simulation or engine test suite was rerun for this review.

The separate steady operation, counter-based function-call table, preserved
legacy IC replay and measured linearization baseline are useful corrections.
Moving semantic normalization changes out of stage 3 is accepted. Optional
clamping can be excluded from the implementation baseline and considered in
a separate measured change; its investigation need not block an equivalent
extraction. It must not silently accompany the stale-normalization repair.

## Remaining contract corrections

### 1. State exactly what each operation changes

`decisions.md` section 1 says steady leaves every integrated history alone,
then assigns N1/N2, fuel flow, EGT and nozzle position. These are historical
state in other phases. Describe this as an explicit equilibrium assignment of
listed states, preserving the listed oil/injection/accounting histories. Avoid
the blanket claim. Resolve the separate thermal-preservation statement against
the EGT assignment in one per-field operation table.

`opInitRunning` currently resets injection in the operation table, while the
contract permits replenishment only on explicit scenario reset. A restart of
an existing engine must not silently replenish water; express scenario reset
separately. Also correct the assertion that only EPR/nozzle are newly assigned:
the current `Trim()` does not assign EGT or oil pressure either.

Keep restore as a record-taking entry point. The enum still accepts an
argumentless `opRestore` through `Evaluate`; remove that ambiguity or explicitly
reject that combination before mutation.

### 2. Make mixed-engine eligibility and failure results consistent

Section 1 says an ineligible steady request executes refresh and reports
`NotEligible`. Section 3 says any failed eligibility check rejects the entire
request without changing any engine. A running/off twin cannot follow both.

Use explicit routing in the legacy `RunIC()`/trim adapter: choose steady for
eligible engines and refresh for the others, then complete the combined
vehicle. A strict explicit steady request may reject an ineligible engine;
it must not disguise a mutation as a rejected request. Spell out how the
mixed operation request reaches the manager.

Preserve the structured outcome at the executive/binding boundary; the
current `bool EvaluateEngines(...)` loses the per-engine details the SDK is
promised. Represent engines not selected/not attempted explicitly instead of
defaulting their status to completed.

The proposed partial-commit policy also needs one coherent failure boundary.
If engine 1 commits and engine 2 throws, restoring old propulsion totals can
leave totals inconsistent with engine 1. If completion then throws in an
aerodynamic function, the described engine-only undo set is insufficient.
For zero-time public requests, prefer all-or-none engine-owned changes and
cached outputs under a bounded undo scope. If retaining partial completion,
define how engine, propulsion and vehicle outputs remain consistent, and make
the result carry that state. Do not promise atomicity for arbitrary external
function effects. Provide a two-engine failure example and a completion-failure
example as implementation acceptance cases.

### 3. Correct the executive completion sequence

`LoadInputs(ePropulsion)` copies existing FCS positions and atmosphere/auxiliary
outputs; it does not evaluate changed throttle commands or a changed location.
Starting the sequence there cannot by itself guarantee current inputs for the
relocation and new-command callers. Specify either the required preparation
sequence or a checked, documented prepared-input precondition and which public
wrapper meets it. Preserve FCS/thermal history rather than assuming every
zero-dt model evaluation is side-effect free.

After recalculating accelerations, refresh the corresponding propagation inputs
before initializing derivatives: `FGPropagate::InitializeDerivatives()` copies
`in.vPQRidot` and `in.vUVWidot`, which are refreshed by
`FGFDMExec::LoadInputs(ePropagate)`. The current proposed sequence omits this.
Define when derivative-history initialization is appropriate: an ordinary
refresh must not casually reset integration history under a preservation
promise. Also distinguish `opAdvance` from the public zero-time scope; it
cannot advance using a sequence that always suspends integration.

Resolve this through source tracing and bounded characterization if needed,
not a redesign of the executive. Add acceptance cases for changed throttle
command, changed altitude/environment, immediate derivatives, and a function
failure during completion.

### 4. Preserve the actual recovery snapshot

Section 4.2 says the app does not need engine state every fixed step and will
capture it only for recovery. In `fixedStepLoop.ts:80`, the pre-step snapshot
is taken immediately before `sdk.run()`, then used if that step fails. Those
are already recovery snapshots. Capturing engine history after the failure
cannot recover its pre-step value.

Keep engine state paired with the same pre-step aircraft snapshot. A native
checkpoint handle/owned state can avoid serializing every step, or serialize
at capture if that is the chosen representation; do not drop the checkpoint
to avoid allocations. State exactly what stage 7 captures and when. Preserve
the promised start/shutdown/injection history through a rejected step.

Finish the related restore rules: absent overrides must mean a defined
configuration value, not accidentally retain destination overrides; reconcile
engine-level `FuelFreeze` with manager-level freeze; classify runtime thruster
orientation/location as captured or an explicit restore prerequisite. Define
actual cold defaults and validation bounds rather than "documented" and
"model ranges" without a reference. Above-maximum transient spools can be
valid after lowering a writable maximum, so avoid rejecting legal captures.

### 5. Make fuel and legacy IC precedence truthful

"Stale starvation is not stale" contradicts the measured early returns on
freeze/trim. `ConsumeFuel()` also runs after engine calculation. Query current
usable supply before eligibility/combustion decisions, regardless of an old
`Starved` flag. Include refilling while frozen, not only ordinary refill.

The proposed `Combusting` flag currently follows phase/residual flow even under
starvation. Define whether a residual fuel inventory is actually modelled;
otherwise positive requested/indicated flow without usable supply is not
evidence of combustion. Fuel freeze suppresses accounting while supply can
remain available; starvation removes supply. Do not merge those cases. Specify
the flag for cutoff residuals with supply, empty tanks, freeze, start, stall and
seizure, and name the causal tests. Keep model-policy choices separate from
what the old tank-debit code proves.

Retaining stored IC replay is accepted, but qualify "a commanded cutoff
survives RunIC" accordingly. With an explicit stored running request, the
legacy call reinitializes the engine; passive refresh must preserve cutoff.
Record both cases. The no-IC-running cutoff regression remains valid.

## Small reporting corrections

- The linearization `Vt` entries match, but "every other entry is zero" is
  false in `follow-up/probes.json`: the `Q` row is about 0.002461264,
  0.004922528 and 0.007383792 at throttle 0.3, 0.6 and 0.9. Retain and compare
  the whole column, distinguishing tiny roundoff in other rows from physical
  pitch response. No new run is needed to correct the prose.
- The contract still says cross-instance restore "is tested both ways";
  those tests remain planned. Preserve that distinction everywhere.
- The stage-3 file table must include its CxxTest registration/tests, as the
  task brief already requires, rather than saying `FGTurbine.cpp/.h` only.

## Exit and commit handling

Revise the decisions and contract together, and update the report disposition
without overwriting original evidence. Close the five groups above with exact
rules and acceptance cases. Reuse accepted measurements; add a focused probe
only where source and existing records do not resolve a factual question.
No broad rerun, production fix, branch switch, push or upstream post is needed.

Keep stage 3 pending until these design contradictions are resolved. This is
a continuation of the first review's operation/state/failure questions, not a
new characterization campaign.

A local documentation/tool/evidence commit can record work in progress, but
it does not approve the design. The reported commit set must include required
prerequisites or verify they are already committed; check local links against
the proposed staged tree, not just the working tree. For example the earlier
prerequisite list omitted `trim_thrust_compare.py`, which the turbine documents
also reference. Never stage unrelated work from the shared 0sfs tree.
