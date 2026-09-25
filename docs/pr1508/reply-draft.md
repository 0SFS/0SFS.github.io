# Draft reply for JSBSim PR #1508 — not posted

Written for the #1508 reviewers (Sean McLeod and any maintainer reading the
thread). Status: **draft only.** Nothing has been posted to GitHub, and the PR
branch is still at `7511df10`. Post only on an explicit instruction. It answers
Sean's [comment of 2026-09-14](https://github.com/JSBSim-Team/jsbsim/pull/1508#issuecomment-5664642920),
which asked about mass during the trim iterations and suggested doing the fuel
update in `FGTurbine::Calculate()`'s post-trim block instead.

The measurements behind it are in
[stage 2's report](../turbine-initialization/reports/02-pr1508-repair.md). Do
not post numbers this draft does not contain, and re-measure before posting if
the PR head has moved.

---

Thanks — and you're right that the trim iterations don't move the mass. I
checked it directly rather than only by reading: on this PR's head,
`fuel-used-lbs`, every tank's `contents-lbs` and the simulation time all come
back from `RunIC()` unchanged, because `in.TotalDeltaT` is zero there — and
inside a real trim solution `FGPropulsion::ConsumeFuel()` returns early on
trim status as well.

On doing the assignment in the `(phase == tpTrim) && (in.TotalDeltaT > 0)`
block instead: I'd rather not, because that block runs one frame *late*. The
value has to be readable from the zero-time evaluation itself. `RunIC()` and
`propulsion/set-running` are what an embedding application calls to place an
aircraft at a chosen operating point, and it then reads fuel flow — for a
gauge, for a telemetry snapshot, for an audio model — before any frame has been
integrated. That is the case this PR is for: trimming several settings in turn
and reading each one back. Moving the write into the post-trim block would
leave every one of those reads showing the previous operating point, which is
the defect, and would also skip it entirely whenever the engine stays in
`tpTrim` — a suspended executive holds `in.TotalDeltaT == 0` for as long as it
is suspended.

Testing that readback did turn up a real problem in what I pushed, though, and
I'd like to fix it here before you spend more time on the diff.

`Calculate()` selects `tpTrim` from `in.TotalDeltaT == 0` alone, with no
reference to an aircraft trim request, so `Trim()` also runs for engines that
are **off**. The assignments in this PR are unconditional, so an engine that
had never been started, or that had been cut off and spooled down, came out of
`RunIC()` holding the throttle's running fuel flow and corrected TSFC. On the
F-16 fixture a never-started engine at throttle command 0.35 went from 0 to
1102 gph, and at a command requesting augmentation to 7267 gph.

And that one does move fuel — just not during the trim. `Off()` seeks the flow
back down at 10,000 pph/s and `CalcFuelNeed()` debits the tanks all the way
down, so over the next 0.2 s of normal running the same engine burned 0.35 lb
dry and 2.6 lb with augmentation requested, without ever having been started.

The fix keeps the guard narrow and follows what `Calculate()`'s own post-trim
block already does, which re-spools only when `Running && !Starved`:

```c++
    double steadyN2 = IdleN2 + ThrottlePos * N2_factor;
    double steadyN2norm = (steadyN2 - IdleN2) / N2_factor;
    if (Running) {
      N1 = IdleN1 + ThrottlePos * N1_factor;
      N2 = steadyN2;
      N2norm = steadyN2norm;
    }
    double dryThrust = idlethrust + (milthrust * steadyN2norm * steadyN2norm);
    double thrust = dryThrust * (1.0 - BleedDemand);

    if (Running) {
      correctedTSFC = TSFC->GetValue();
      FuelFlow_pph = std::max(IdleFF, dryThrust * correctedTSFC);
    }
```

with the same `if (Running)` on the two augmented `FuelFlow_pph` assignments,
and the thrust assignments left alone.

Three things worth noting about that shape:

- the steady speed and its normalisation are still computed unconditionally, as
  locals, and the thrust and the `AugMethod == 1` threshold still read them, so
  what `Trim()` *returns* is untouched. I measured twelve zero-time cases —
  never-started, cut-off and running, dry and augmented, `<augmethod>` 1 and 2 —
  before and after, and every one is bit-identical. Guarding only the
  assignments, without the locals, is not equivalent: it leaves the rest of the
  method reading a stale member `N2`, which changes the dry thrust and loses
  augmentation entirely under `<augmethod> 1`.
- `N2norm` has to be inside the guard rather than stay a local, because
  `FGSimplifiedTSFC` reads the member. It is still assigned before `TSFC` is
  evaluated, so a configured TSFC still sees the operating point being trimmed
  — the point of the original patch. I checked that with an XML `<tsfc>`
  function reading the engine's own N2, and all six running cases match this
  PR's current behaviour exactly.
- an engine that is off keeps its own spools and its own flow. Nothing is
  zeroed, and `Trim()` does not return early for it: shutdown and windmilling
  leave legitimate residual rotation, and this is not the place to decide what
  an off engine's thrust should be.

`TestTurbineTrimFuelFlow` keeps its three existing checks and gains three:
a never-started engine, one cut off and left to settle, and one sampled 24
frames after cutoff — already out of `tpRun`, but still delivering 791 gph on
the way down, which is the sharper case, because there the unguarded
assignment replaces one positive value with a different one rather than
merely creating one. Each is required to come back from `RunIC()` with its
flow, corrected TSFC, spools, simulation time, tank contents and fuel used
unchanged. The settled cases then burn nothing over the following frames; the
residual case instead has to keep decaying normally and keep paying for what
it still reports, since a shut-down engine that still shows a flow should
still consume it. All three fail on the current head of this PR and pass with
the change. Each case also measures what a *running* engine reports at the
same command first and requires it to differ from the preserved value, so the
comparison can't pass by being blind. The settled cases are stated as this
fixture settling to zero flow, not as a claim about turbine shutdown fuel flow
in general.

One deliberate consequence to flag: because the guard skips the call as well as
the assignment, a configured `<tsfc>` or `<atsfc>` with a `copyto` target no
longer has that target refreshed during a zero-time evaluation of an engine
that is off — it holds its last running value instead. I measured this rather
than assuming it, with sentinel properties reset immediately before each call:
on the current head the TSFC function fires for every off engine and the ATSFC
function for every augmented one, and with the guard neither fires, while all
the running cases are unchanged. That seems right to me — evaluating a running
operating point for an engine that isn't running is the bug — but say so if
you'd rather it kept being evaluated and only the assignment were guarded.

There is an equivalent guard for #1505's spool assignments, which this branch
is stacked on; I'll get the two branches into the right order before you have
to look at them together.

---

## Notes for whoever posts this

- It does **not** claim upstream acceptance, a merge, or that the app is fixed.
- It does not repeat the acknowledgment already posted on #1505.
- The last paragraph promises a rebase. Do not post it until that rebase is
  actually authorized and planned, or drop the paragraph.
- Sean's #1505 follow-up (that `in.TotalDeltaT == 0` holds whenever
  `SuspendIntegration()` is called, not only on frame zero) is already
  consistent with the suspension point made above; it needs no separate reply.
