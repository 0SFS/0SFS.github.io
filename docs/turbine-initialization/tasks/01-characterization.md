# Task 1: characterize callers and settle implementation decisions

**Current handoff:** the characterization/evidence follow-up is accepted;
the implementation contract still needs the corrections in the
[follow-up review](../reports/01-follow-up-review.md). That review supersedes
the first review's open-item list. Reuse the accepted measurements, resolve
the remaining contract rules and acceptance cases, then stop for review.
Stage 3 remains pending; do not restart characterization from scratch.

Execution brief; implementation has not started. Read
[plan](../plan.md), [contract](../contract.md), [validation](../validation.md)
and the owner-repository instructions. This task may add tests and diagnostic
tools; it must not change production behavior, branches used by another
worker, installed packages or GitHub.

## Handoff and maintainer context (2026-09-19)

Stages 0 and 2 are reviewed locally: `6f95bfb0` on
`fix/turbine-trim-spool`, and `482da811` on
`candidate/pr1508-off-engine-fuel` (production correction `8945b0e3`, then
tests-only follow-up). Read their reports and preserve these source identities;
refresh the checkout state before using it. Stage 2 did not require stage 1.
Stage 3 requires both this characterization and the reviewed repairs.

Read the three maintainer comments on #1505:

- [Sean: suspension, not just the first frame](https://github.com/JSBSim-Team/jsbsim/pull/1505#issuecomment-5745172993).
  Trace when the executive's zero dt reaches the copied propulsion inputs;
  suspension alone does not synchronously refresh those inputs.
- [bcoconni: could `GetTrimStatus()` select `tpTrim` instead?](https://github.com/JSBSim-Team/jsbsim/pull/1505#issuecomment-5745457074).
  This is a proposed alternative, not an agreed change.
- [Sean: steady thrust is also needed outside aircraft trim](https://github.com/JSBSim-Team/jsbsim/pull/1505#issuecomment-5745555551).
  Setting throttle then calling `RunIC()` is a legitimate way to obtain the
  corresponding steady thrust immediately. His suggested clearer name is
  illustrative, not a prescribed API or approval of our broader redesign.

Keep the running-engine `RunIC()` use case and the new history-preserving
refresh operation distinct. Do not infer that every suspended caller wants
refresh, or that `GetTrimStatus()` alone expresses every steady-state request.
The narrow repairs retain phase dispatch; this stage characterizes alternatives
without changing production behavior.

## Work

1. Refresh source/PR identities and record clean/dirty state. Inspect the
   owning code using pinned refs when the canonical checkout is on a different
   task. Archive baseline source under JSBSim `build/` for independent builds.
   Inventory test fixtures and current upstream tests, not just local master.
2. Trace all relevant calls through `FGFDMExec`, `FGInitialCondition`, CLI
   `JSBSim.cpp`, `FGTrim`/`FGTrimAxis`, `FGPropulsion`, `FGEngine` and
   `FGTurbine`. Include LoadIC, reset, repeated RunIC, both forms of
   `set-running`, suspension, settling and direct runtime initialization.
   Record commands written and values visible to each call, including
   executive versus copied propulsion dt and model scheduling rate.
   Retain a concrete version of Sean's example: an explicitly running/requested
   running turbine, no aircraft trim request (`tNone`), changed throttle, then
   `RunIC()`. Record thrust/spools/fuel immediately and on the next frame,
   checking actual FCS throttle mapping. Include the 737 cruise setup that
   started the discussion, repeated calls, and an off-engine contrast.
   Record `GetTrimStatus()` as well as both timesteps. Explain, with a retained
   trace or isolated diagnostic variant, whether the proposed condition alone
   preserves this use case. Any variant stays in scratch, not the production
   branch. Inventory direct suspended `Run()` callers separately and identify
   which need equilibrium versus history preservation.
3. Build retained characterization cases for the validation groups. Prioritize
   immediate cutoff, persistent IC running flags, empty/frozen fuel, zero-dt
   state changes, first-frame completion, start/fault precedence, augmentation,
   finite injection and function sampling. Record supported behavior as well
   as defects. For each suspected defect, demonstrate it or mark it unconfirmed.
4. Audit all turbine and base-engine members and relevant thruster/cache state.
   Classify each as configuration, external input, continuous history,
   discrete phase, accounting or derived output. Explain capture/reset/
   refresh/initialization treatment. Include engine-owned rollback state.
5. Inspect `safeFlightState.ts`, `resetFlightLocation.ts`, `bootstrapC172.ts`,
   `fixedStepLoop.ts`, terrain/contact callers, and the audio adapter. Record
   which paths request a new scenario versus preserving history. Current
   snapshots lack turbine history; do not label them exact restores.
6. Resolve the implementation choices below with source evidence and a
   concrete recommendation. Update the contract if necessary, recording why.

## Required decisions

- Minimal C++ operation API and how existing signatures adapt; capability
  fallback for other engines; how Python and later WASM can call the new path.
- Exact call table for first/repeated RunIC, persistent IC flags, live cutoff,
  explicit restart and trim. Preserve useful running readback, but do not
  replay old initialization intent into a passive refresh.
  Explicitly account for Sean's non-trim steady-thrust example. Explain which
  existing callers keep their behavior through a legacy adapter and which
  require migration; neither zero dt nor aircraft trim status alone proves
  the caller's intent.
- Native state record fields/version/identity/validation, ownership and
  supported deterministic scope. Define whether restores cross instances of
  the same model or only the originating instance, and test that choice.
- Fuel supply query/freeze behavior; remaining indicated fuel flow versus
  actual consumption and combustion after cutoff, including normal start.
- Warm-running values and preserved thermal history; supported injection
  operating points with duration frozen.
- What `N2norm` should hold once an engine is no longer running, and what
  `FGSpoolUp` should therefore see on the first frame of a later start.
  Stage 2 guarded the member so a zero-time evaluation no longer overwrites
  it, which keeps the last running value or `ResetToIC`'s zero; that is not
  evidence either value is right after a shutdown, only that trim is no
  longer the thing deciding it. `Off()` maintains N1/N2 but not their
  normalization. Settle this before stage 3 extracts the shared
  calculations, and cover the resulting choice with a restart test.
- Function evaluation order/count, cached pre-function visibility and
  `copyto` side effects; success/failure restoration guarantees.
- What scopes timestep/intent/trim-state restoration and how nested calls
  preserve both executive dt and copied engine dt. Avoid an unrelated
  executive overhaul if a bounded context satisfies the affected callers.

## Deliverables and exit

Write `docs/turbine-initialization/decisions.md` and
`reports/01-characterization.md`; retain selected data under
`validation/evidence/jsbsim/turbine-initialization/01-characterization/`.
Put runnable helpers in `scripts/validation/jsbsim/turbine-initialization/`
or owner tests, with dated default output and complete commands. Propose the
per-stage file/API boundaries and the smallest reproducible fixture for every
behavior change. Draft a short maintainer discussion note in the report;
do not post it. Lead with the preserved non-trim steady-thrust use case,
separate naming clarification from behavior changes, and identify what our
proposal adds beyond the maintainers' comments.

The coordinator reviews these decisions and records the result. Stages 3–5
must not begin with unresolved API, state, fuel or failure-boundary decisions.
Stage 0/2 repairs can proceed independently because they preserve the legacy
behavior outside the regressions. Continue independent characterization while
resolving a decision; escalate only a concrete conflict in product intent.
