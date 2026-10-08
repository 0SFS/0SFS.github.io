# Correct sustained F135 powered-lift instability and qualify available lift

Work in `/Users/felg/gh/0sfs`. Read `AGENTS.md`, then the owner's `AGENTS.md`
before editing a sibling repository. **0sfs owns this aircraft-specific handoff**
and the F135 installation/FCS; **JSBSim owns the native plant, controller,
actuators, conservation, numerics and SDK**. Preserve existing and concurrent
work. This is an implementation assignment when explicitly invoked: reproduce,
diagnose, correct the responsible model or integration, and retain meaningful
regressions. Continue through the authorized checks rather than stopping at a
proposed gain change.

## Observation and current confidence

On 2026-10-08 the user reported sustained oscillation at full throttle in VTOL:
N1/N2 reportedly move roughly between 92% and 107%, and thrust also oscillates;
available lift seems lower,
with roughly less than 20% fuel needed where roughly 30% previously worked.
Forward flight at speed appears satisfactory. Selecting the component algorithm
appears to give the same behavior. Dry glow is brighter while spooling and then
too faint when settled compared with the retained carrier footage. The user
personally accepts the coupled plant's AB visual/sound synchronization as
excellent.

These are user observations. The quoted percentages are not a captured native
trace, a measured oscillation amplitude for each channel, or a weight/thrust
calibration. This handoff was prepared from source inspection; **the new sustained
oscillation has not been reproduced by this audit**. Do not turn plausible code
mechanisms below into an asserted root cause before isolating them.

Read:

- [Engine plant report](validation/engine-plant-report.md),
  [F135 parameter and limits ledger](validation/f135-engine-plant.md),
  [stage record](validation/engine-plant-stage-record.md), and
  [implementation specification](proposals/engine-plant-implementation.md).
- [Dry-glow investigation receipt](validation/f135-dry-glow-regression-2026-10-08.md)
  and the coordinated [dry-emission assignment](f135-dry-emission-validation-prompt.md).
- [F-35B model observations and hypotheses](proposals/f35b-fdm.md),
  [JSBSim build/adoption procedure](jsbsim.md),
  [upstream contribution policy](jsbsim-upstream-contribution-policy.md), and
  [open PR tracker](open-upstream-prs.md).
- Native `doc/turbine-plant-model.md`, `src/models/propulsion/FGTurbinePlant.cpp`,
  and `src/models/propulsion/plant/TurbinePlant.{h,cpp}` in the JSBSim owner.

Confirm source/package/profile identities on entry. The inspected installation
was fork.20 with source `ea6956b4`; app commit `33347586` added the selectable
pre-plant empirical model. Those identities may have changed. Select model and
algorithm by their actual installed capabilities, and record the applied values.

## Source findings that guide the investigation

The existing calibration uses a zero-time steady solve. It reports 100% N1 and
106.1% N2 at its sea-level hover point with lift-fan/main thrust ratio 1.194.
The F135 physical N2 limiter is 107%. The aircraft's moment-balancing split is
different: approximately 1.03 at the development CG, and it also responds to
pitch control. At the ledger's 5,000 ft in-app point the reported main and fan
forces are 16,391 and 16,897 lbf. This differs from the published calibration
point without establishing a bug by itself. Preserve the distinction between
manufacturer ratings, the authored installation, and free-flight performance.

Investigate these coupled paths, retaining enough trace data to distinguish them:

- Native `Plant::UpdateController` uses corrected N1 demand, idle corrected N2,
  physical N2 and temperature limits, a shared fuel integrator, and
  acceleration/deceleration bounds. The F135 inherits proportional/integral
  gains 3/2 and N2 limit gain 5. Native comments already identify possible
  limit cycles when HP limiting interacts with the N1 loop. The comment does
  not prove this new report has that cause.
- The native lift split loop uses previous accepted main and fan thrust,
  guide-vane work multiplier, nozzle throat trim and washout. The F135 sets
  split gain 24/s, washout .5/s, vane minimum .4, physical N1 threshold 1.04
  and overspeed gain 100/s. Throat actuation has a separate time constant and
  rate limit. Establish phase, saturation and authority interactions; do not
  assume lowering a gain is the appropriate physical correction.
- Aircraft `F-35B-jsbsim.xml` computes `fcs/lift-split-cmd` from nozzle pitch,
  CG lever arms and `fcs/stovl-pitch-control`. Automatic pitch control depends
  on attitude and pitch rate. Separate plant-only instability at fixed commands
  from an aircraft/FCS/flight-path feedback loop.
- The lift-mode bypass-entry factor .07 is explicitly an unqualified surrogate.
  Its ramp reaches full effect at door opening .2. Known partial-conversion
  defects include the approximately 6,000 lbf loss at 1% conversion and the
  unstable 10% conversion, 60 kt calibration probe. Preserve these as separate
  cases; do not extrapolate that every full-conversion oscillation is the same
  defect.
- Both algorithms share controller, integration, actuator, gas-path topology
  and F135 parameters. Reduced adds tabulated gas/Jacobian reuse and can fall
  back to component. Agreement between them can reproduce the same physical
  modeling error. Read `plant/settings/algorithm` alongside
  `plant/numerics/algorithm`, fallback reason, failure, substeps, residuals,
  sequence/time and nozzle back-off. Inspect status accuracy through both step
  and end-state publication if a fallback occurs.
- Failed native steps keep the last accepted state and alter the next nozzle
  attempt through back-off. Distinguish rejected/frozen steps from accepted
  oscillatory dynamics. Increasing iteration caps does not establish that the
  controller or aircraft is physically correct.

Relevant inspected source locations: native `TurbinePlant.cpp` controller around
lines 705–810, mixer bypass around 989–1007, step/fallback around 1820–1930;
`TurbinePlant.h` controller defaults around 121–154; aircraft XML STOVL attitude
control around 864–903 and split/door/roll-post commands around 940–998.
Use symbols and current contents if line numbers have moved.

## Coverage gap to close

The existing tests are useful but do not establish this sustained operating
condition:

- `createHover` in `src/flight/jsbsim/f35b.integration.test.ts` initializes
  converted position using `runIc`, `set-running`, and a second `runIc`; its
  default throttle is .98. A converged initialized equilibrium need not be a
  stable state reached by real conversion or throttle actuation.
- The conversion/speed matrix checks forces and moment split immediately after
  initialization, at .98 throttle and 5,000 ft. The 50%-conversion throttle
  transient is .6→.98; it checks split and fan coupling over a short interval.
  The 60 kt entry and control-pulse tests run 10 seconds and principally bound
  attitude and force maxima.
- The 60-second fully converted flight test begins at .98 throttle, 1,000 ft,
  zero-time initialized, clean stores, and checks attitude/altitude once per
  second. It does not bound per-step N1/N2/thrust ripple or prove sustained
  equilibrium at full demand.
- Rating tests check steady sea-level conventional dry/AB points. The algorithm
  corpus's converted case holds .98 for six seconds, with zero-speed cases held
  down. Its agreement gates compare two algorithms sharing the same physics;
  they are not a long-duration controller stability or free-hover test.

Retain those tests. Add coverage at the triggering controls and actual user
configuration instead of weakening their claims or relabeling them as complete
hover validation.

## Reproduction and instrumentation

First construct an inexpensive, deterministic CPU reproducer using the installed
SDK and actual F135 profile/FCS. Retain the original failure trace before edits.
If the exact user snapshot/settings are available, use them. Otherwise declare
initial assumptions and sweep the missing conditions; never report a guessed
condition as the user's captured session.

Record every accepted physics step, plus failed attempts where observable:

- Requested/applied throttle, native throttle position, requested/physical
  conversion, AB inhibit/selection/burning, engine-running state.
- Physical and corrected N1/N2, lift-fan speed, fuel command/metered/spray/burned,
  core flame/efficiency/equivalence ratio, governor integrator and active limiter.
- Split command/actual ratio, split trim/vane, commanded/actual throat and exit
  area, door, clutch, clutch torque/slip, shaft turbine/compressor/fan torques,
  lift-fan shaft power, nozzle regime and mixer/bypass flow and pressure.
- Actual algorithm and fallback diagnostics, accepted sequence/time, residuals,
  mass/energy ledger and per-step work counts. Count bounds; no timing benchmark.
- Each outlet's gross force vector, inlet momentum/ram force, applied propulsion
  and external force/moment, aerodynamic/contact force, attitude, rates, airspeed,
  vertical velocity, ambient/inlet pressure and temperature, altitude and wind.
- Total mass, fuel **mass per tank**, capacity and percentage denominator,
  stores/payload state, CG and actual lever arms. Preserve fuel use during the
  run or use an explicitly declared frozen-fuel isolation fixture. Repeated
  full-power climbs change ambient conditions; they are not a fixed-input
  stability experiment.
- Station 4/5/6/7 total state, nozzle exit static state, separate metal
  temperatures, and the runtime optical adapter inputs required by the dry-glow
  assignment. Correlate spool/flow/temperature changes with source luminance
  through the exact optical evaluator; do not smooth the source to hide them.

Use currently exported native properties. If a crucial hidden controller or
matching state is needed, add a coherent diagnostic in JSBSim rather than infer
it from the HUD or implement engine equations a second time in the app.

Run the minimal isolation sequence before broadening the matrix:

1. Fixed environment and fixed split/actuators at native level, with a documented
   synthetic fixture first and the F135 configuration next. Compare a steady
   initialization subsequently integrated in time, small perturbations around
   it, and dynamically attained conversion from forward/idle conditions.
2. Actual aircraft FCS on a held stand, where attitude and wind are controlled.
   Compare fixed split with normal FCS split only as explicit diagnostic variants.
   Diagnostic command overrides must never become production fixes.
3. Free aircraft with full FCS, actual load/CG and neutral controls; then matched
   perturbations and the original entry sequence. Separate full-power climb,
   level hover with sufficient control authority, ground contact and descent.

Cover actual command **1.0** as well as **.99** and the existing **.98** fixture.
Verify that positive physical/requested conversion still clamps reheat demand
correctly. Compare default reduced and component from equivalent state; include
algorithm readback and actual fallback history. Cover full conversion first,
then the 0/.01/.10/.25/.5/.75/1 sweep around the known discontinuities. Include
zero/low/60 kt and the relevant ambient/altitude/load cases, using targeted
coverage rather than an unbounded Cartesian product.

## Physical diagnosis and correction

Use primary sources for controller/actuator/engine behavior and publicly available
F135/LiftSystem constraints. Keep measured values, manufacturer ratings, fits,
generic theory, hypotheses and unknowns separate. Do not invent F135 FADEC
schedules or gain values. A stable generic controller can remain an explicitly
uncalibrated approximation; it must still obey the modeled conservation and
actuator constraints.

Explain the dominant causal path with trace phase relationships and a controlled
isolation: fuel limiter, nozzle/split/vane, clutch/load, mixer regime, aircraft
pitch feedback, environmental feedback, numerical failure, or another observed
mechanism. Local linearization or small-perturbation analysis is useful where
the operating regime admits it; saturation/active-set boundaries also need
nonlinear trajectories. Explain any mismatch between steady and dynamic
solutions and correct it in its owner.

For lift, build a dimensional force/moment and weight ledger. Compute the actual
upward component of all outlets and airframe forces, subtract relevant inlet
momentum and weight once, and verify the measured acceleration consistently with
the selected coordinate frame. Show why the aircraft at the captured load can
or cannot sustain hover. Compare empirical and plant at identical mass/CG,
atmosphere, controls and geometry; also distinguish matched-thrust comparisons.
The old fuel-percentage threshold is useful regression evidence, not a physical
target to force through thrust scaling or a changed empty weight.

Preserve power extraction, fuel bookkeeping and hover AB inhibit. No duplicated
lift forces, unaccounted torque, free shaft power, direct spool clamping, arbitrary
force interpolation or feedback suppression may replace the physical correction.
Assess changes to the declared bypass surrogate and installation geometry openly;
do not hide them in controller gains or optical brightness.

## Acceptance and completion

Define numeric transient and sustained criteria before tuning. Distinguish
manufacturer constraints from engineering stability gates. At fixed admitted
operating conditions, require a bounded transient that settles into a reproducible
envelope, without a persistent controller-induced cycle comparable to the reported
92–107% excursion. Record per-step extrema, peak-to-peak/RMS ripple, drift,
settling time and cycle period, together with limiter/actuator activity.

Use at least 60 seconds of post-transition observation for the triggering case;
extend until several periods of any slow cycle or thermal drift are represented.
Document the settling window rather than discarding oscillatory sections. Check
equilibrium under small perturbations in both directions. Free-flight trends
must account for changing altitude, speed, fuel and external force demand.

Require numerical convergence under timestep refinement, both algorithms,
bounded fallback behavior, independent mass/energy residual gates and consistent
steady/dynamic equilibria. A matching pair of unstable algorithms is a failure
of the stability gate. Preserve cold/warm AB onset, accepted audible/visible
ordering, shutdown/restart, restore/relocation and force lifecycle regressions.
Retain the known partial-conversion failures until meaningful tests pass.

Coordinate native/aircraft file ownership with the dry-emission agent. **Qualify
the powered-lift trajectory before accepting it as a steady optical baseline.**
Pass exact state traces and identities to that assignment; record accelerating,
settled, oscillatory and post-AB states separately. Do not ask the optics agent
to make an unstable plant look steady.

Runnable fixtures belong in scripts/tests; logs and scratch in `build/`; retained
inputs, traces, reports and figures in `validation/evidence/`. Update the stage
record, F135 limits and plant report with precise closure or remaining failures.
Run owner checks, current incremental typecheck, related tests and lint, then
one final CI per affected owner as required by its instructions. Keep disk-read
fixtures in the test selection triggers. Do not overlap other sessions' suites.

When this prompt is explicitly invoked, targeted native implementation/test
builds and an immutable SDK build/adoption are authorized **if the correction
requires native changes**, following `docs/jsbsim.md`. Avoid speculative builds.
Do not start servers, browsers/GPU checks, timing benchmarks or deployment from
this handoff. Do not delete existing build folders. Prepare any generic upstream
candidate separately; do not post messages or push PR revisions from this prompt.

Finish with the reproduced conditions, proven cause and competing hypotheses,
changed owners/files, tested source/SDK identities, stability and force/weight
results, optical trace handoff, physical uncertainty and specific remaining work.
Treat the user's AB synchronization feedback as scoped subjective acceptance;
any changed dynamics still require appropriate numerical regression and subsequent
user viewing/listening confirmation, without claiming an unperformed device test.
