# F-35B lift allocation diagnostic — 2026-10-05

Owner: 0SFS aircraft data; native observations belong to JSBSim. The checker is
[`scripts/validation/f35b/inspect-low-speed.mjs`](../../../../../scripts/validation/f35b/inspect-low-speed.mjs).
[Acceptance](acceptance.json) compares the same actual fork.10 SDK with the
retained old XML and coupled XML loaded separately in MEMFS. Neither run applies
an app force or an attitude override. The old files retain their GPL/source
notices; original source and the complete licence remain in the aircraft source
package. These are development model checks, not F-35 performance evidence.

Each plant has 70 cases: 45 neutral combinations of 0/60/150 kt, 48/80/98%
throttle and 0/25/50/75/100% physical conversion, plus control pulses/release,
entry, manual and hover cases. All start airborne at 5,000 ft with zero
pitch/alpha/gamma and pitch trim. Contacts are excluded by the native terrain
initial condition. Reports retain sampled native moments, actual indexed body
forces, allocation and spool state; selected complete trajectories are the CSVs.

At 60 kt/50% conversion/98% throttle the old initial main force was 18,407 lb,
fan force 2,011 lb, and propulsion pitch moment -162,071 lb-ft. Its independent
auxiliary spool and duplicate conversion gating could not balance the aft
nozzle force. The coupled plant uses actual native main upward force and current
CG arms, giving zero initial propulsion pitch moment in that fixture. Entry's
peak pitch angle changes from about 90° to 1.51° over the same ten seconds.
No control gains were changed. Differential roll-post and nozzle yaw authority
remain native; high-power partial-conversion pulse cases remain finite and
return toward low rates after release.

At 0% conversion all auxiliary forces remain zero. Full conversion in Auto/FBW
already controlled all three axes before the correction; Manual intentionally
omits attitude damping. Low power cannot support the declared weight. Several
untrimmed low-power cases descend and develop large pitch angles even with the
coupling repair; this is not an altitude-hold or transition-envelope qualification.
The retained source capacities, fan/main power split, current control laws and
mixed aerodynamic/thrust authority remain approximations. Roll posts are
represented at the source ±80-inch lateral datum, not validated wingtip geometry.

The later fork.11 separately repairs stopped-turbine zero-time phantom thrust;
that stopped/reset regression is retained with its SDK adoption. The baseline
and coupled flight runs here do not stop an engine, so that later repair does not
alter their measured comparison. `src/flight/jsbsim/f35b.integration.test.ts`
adds indexed force closure, current-step main spool coupling, idle/cutoff/RunIC/
reload, conversion entry and partial-conversion input/release regressions.
