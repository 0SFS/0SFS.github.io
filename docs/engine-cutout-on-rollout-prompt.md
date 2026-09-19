# Work app prompt: engine cuts out on the landing rollout

Start a fresh conversation with this file. It is a starting point, not a
conclusion: the cause is unknown and the hypotheses below are unverified.

## The symptom

On the SF50, landing on a runway makes the engine cut on and off. It appears to
happen on bumps — each time the aircraft hits one during the rollout — and the
engine seems to stop working entirely once the aircraft slows below some speed.
No automated test reproduces it. It has only been seen by flying the app.

Nothing about the trigger, the threshold speed, or whether "cuts out" means
JSBSim's engine phase, the audio, or the engine monitor display has been
established. Establish that first.

## The first job: reproduce it

**Build a deterministic, automated reproduction before attempting any fix.** A
headless Node script against the installed package is the right shape; the
existing native and package checks under `scripts/validation/jsbsim/` (with
their logs in `validation/evidence/jsbsim/`) show the pattern. The reproduction is the
deliverable even if the fix is not reached in one session.

Shape it roughly as: place the SF50 on short final, fly it to touchdown, roll out
while decelerating, and perturb the ground under it. Log per frame at minimum
`propulsion/engine[0]/n1`, `n2`, `fuel-flow-rate-pps`, `set-running`, the
starved/stalled/seized flags, `aero/qbar-psf`, ground speed, each gear's
compression and WOW, and the simulation `dt` actually used. Then assert the
engine stays lit.

Two known obstacles:

- **Engine phase is not a readable property.** `FGTurbine` computes `phase`,
  `Cranking`, EGT, oil pressure, EPR and nozzle position but binds none of them.
  The app's engine monitor and audio adapter already infer state from other
  flags. You will have to infer phase the same way, or add the bindings — the
  contribution policy lists that binding work as an identified upstream
  candidate, not yet implemented.
- **What counts as a "bump" in the app is not defined here.** Find out how
  terrain height under the gear is produced during rollout (`terrainContact.ts`,
  `groundContactClearance.ts`, `wheelContact.ts`) and whether it can step
  discontinuously. A discontinuous terrain sample is itself a candidate cause.

## Hypotheses, ranked, all unverified

### H1. The engine cannot relight below roughly 105 knots

`FGTurbine::Calculate()` (`src/models/propulsion/FGTurbine.cpp`, near line 145):

```c++
  if ((Starter == true) || (in.qbar > 30.0)) {
    if (!Running && !Cutoff && (N2 > 15.0)) phase = tpStart;
  }
```

An engine that has dropped out of `tpRun` can only re-light by itself while
dynamic pressure is above 30 psf — about 105 KCAS at sea level — and only while
`Cutoff` is false and N2 is above 15 %. Below that, it stays off until the
starter runs.

This does not explain what knocks the engine out in the first place, but it
explains the "stops working when I slow down too much" half of the symptom
exactly. Verify the qbar number against the actual test rather than trusting
this arithmetic.

### H2. Something latches `Cutoff` on a zero-length frame

`Calculate()` sets `phase = tpTrim` unconditionally whenever `in.TotalDeltaT ==
0`, for every engine, running or not. On the next frame with time advancing, the
trim-finished block at `FGTurbine.cpp:125` either returns the engine to `tpRun`
(if `Running && !Starved`) or **sets `phase = tpOff` and `Cutoff = true`**.

A latched `Cutoff` also defeats H1's relight path, because that path requires
`!Cutoff`. So a single zero-dt frame at the wrong moment could turn a transient
into a permanent cut.

Check whether a zero-length step can reach JSBSim at all. `fixedStepLoop.ts`
runs a 120 Hz fixed step (`PHYSICS_HZ = 120`) with a six-step accumulator clamp,
which should mean whole steps or no step — but confirm it on the real path,
including what the SDK does on a tab throttle, a pause, or a frame hitch.

**This hypothesis interacts with a known defect — read the next section.**

### H3. Fuel starvation or an unporting-like path

`Run()` ends with `if (Starved) phase = tpOff;`, and `Starved` is set by
`FGPropulsion`. The SF50 declares a single aggregate 2001 lb JET-A tank, so
running dry is unlikely in a short test, but confirm what sets `Starved` and
whether a bump can reach it. Check the tank contents the reproduction starts
with.

### H4. Ground contact forces propagate into the engine path

The installed fork carries the wheel rotational DOF from PR #1502, and the app
runs its own `wheelSpin` module alongside it (`createFlightSimApp.ts:675`). A
bump produces large gear forces. Establish whether engine state is affected by
that at all before spending time here — it is the vaguest of the four.

## A defect in the installed package that will confuse this investigation

The app runs fork.7, which contains PRs
[#1505](https://github.com/JSBSim-Team/jsbsim/pull/1505) and
[#1508](https://github.com/JSBSim-Team/jsbsim/pull/1508). **Both have a known,
unfixed defect**, recorded in
[the 2026-09-14 review](validation/jsbsim-open-pr-review-2026-09-14.md) and
tracked in [the upstream PR tracker](open-upstream-prs.md).

In short: upstream's `Trim()` computed thrust from a *local* `N2` that shadowed
the member, so it never wrote engine state. #1505 removed that shadow and #1508
added a fuel-flow assignment, so `Trim()` now writes `N1`, `N2`, `N2norm` and
`FuelFlow_pph` for **every** engine — including engines that are shut off,
because `phase = tpTrim` is set without checking `Running`.

Why it matters here: any zero-time evaluation writes spool state and fuel flow
at the commanded throttle position. On the SF50 after a location reset that is
N2 81.4 % and 344.7 lb/h where upstream gives zero. If your reproduction uses
RunIC, a reset, or anything that produces a zero-length frame, **you will see
engine state appear out of nowhere, and that is this defect, not the rollout
bug.** Do not chase it, and do not report it as the cause.

It is also plausible that the two are the same story — H2 is exactly the path
where this defect bites. Keep them separate in the evidence anyway: show the
rollout symptom on a build without #1505/#1508 before claiming either way.

## Ground rules

From `AGENTS.md` and `docs/jsbsim-upstream-contribution-policy.md`:

- **Fix the cause where it lives.** If this is an engine defect, fix it in
  `Felipegalind0/jsbsim`, not with an app workaround. If it is an app defect,
  fix it in the app. Decide which on evidence.
- **A regression must fail before and pass after.** Causal before/after evidence
  on the exact candidate, not a historical result from another revision.
- Do not edit captured `wasm/build/sources` or `wasm/build/attempts`.
- The WASM build is not reproducible; the tarball is the authority, not the
  commit hash.
- Record failures, skipped coverage and tolerances rather than omitting them.

## Where to look

| What | Where |
| --- | --- |
| Turbine phase machine, relight, trim | `Felipegalind0/jsbsim` `src/models/propulsion/FGTurbine.cpp` |
| SF50 engine config, idle points | `public/jsbsim-data/engine/fj33_5a.xml` |
| SF50 airframe and tank | `public/jsbsim-data/aircraft/sf50-g2/sf50-g2.xml` |
| Fixed step loop, dt | `src/flight/physics/fixedStepLoop.ts` |
| Ground contact and terrain under the gear | `src/flight/physics/terrainContact.ts`, `groundContactClearance.ts`, `wheelContact.ts` |
| Engine state inference, thresholds | `src/flight/hud/engineMonitorModel.ts` (`BURNING_FUEL_PPS = 1e-4`) |
| Audio combustion rule | `src/flight/audio/jsbsimAudioAdapter.ts` |
| Reset and bootstrap sequences | `src/flight/jsbsim/resetFlightLocation.ts`, `bootstrapC172.ts` |
| Open upstream PR state | `docs/open-upstream-prs.md` |
| Prior turbine evidence | `validation/evidence/jsbsim/` |

## Done looks like

1. A committed automated test that fails on today's build for the right reason.
2. A written cause, with the evidence that establishes it.
3. A fix in the correct repository, with the regression passing.
4. If the cause is in JSBSim, an assessment of whether it belongs upstream, and
   the tracker updated.
