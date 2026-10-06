# F-35B yaw regression, 2026-10-05

The installed SDK reproduces disturbance-driven yaw hunting in the trial
aircraft's native control law at high dynamic pressure. The source multiplies
yaw rate by 100 before a PID with proportional gain 0.1055, then drives a
rate-limited rudder. A small initial yaw rate or a released rudder pulse causes
repeated surface saturation and reversals while the pilot command is zero.

The runtime aircraft now scales pilot command, trim and yaw feedback together
by `min(1, 300 / max(1, aero/qbar-psf))`. This is experimental aircraft tuning;
it is not real F-35 control-law data. No app yaw command or aircraft pose is
injected to suppress the oscillation.

| Initial CAS | Constant gain, early peak yaw rate | Scheduled gain, early peak yaw rate | Constant gain, late yaw RMS | Scheduled gain, late yaw RMS |
| --- | ---: | ---: | ---: | ---: |
| 450 kt | 1.23378 rad/s | 0.00407 rad/s | 0.20843 rad/s | 0.000301 rad/s |
| 600 kt | 2.35538 rad/s | 0.00405 rad/s | 0.15486 rad/s | 0.000386 rad/s |

These are 24 s, 120 Hz runs at 0% conversion with a half-second, 50% rudder
pulse released at 2 s. Early metrics cover 3–8 s; late metrics cover 19–24 s.
In the constant-gain comparator, rudder, elevator and aileron command properties
remain exactly zero after release. Only the yaw schedule is changed in SDK
memory. The two frozen aircraft XML files identify that single difference.

[acceptance.json](acceptance.json) records the installed SDK identity, exact
source hashes, measurements, limits and test outcomes. Raw selected CSVs and
reports retain the comparison. Exactly neutral constant-gain starts remain
quiet: the evidence establishes a disturbance-driven defect, not spontaneous
oscillation from an ideal start. The pilot's exact speed and assist settings
were not supplied.

The new 17-case installed-SDK test file passes. It covers disturbance/release
at 160/300/450/600 kt, partial/full conversion, native mode transitions,
direct controls, and mode persistence through relocation, runway initialization
and snapshot restore. The existing 12-case F-35 airborne/hover/conversion file
also passes in the retained combined run. That combined run contains three
new assertions that incorrectly treated native `-0` as different from `+0`;
the final yaw/mode file rerun corrects those assertions with exact absolute-zero
checks. No aircraft change was needed for those three failures.

`fcs/control-law-mode` uses 0 for Auto (native FBW), 1 for Manual and 2 for
explicit FBW. `fcs/fbw-enabled` reports the resolved state. Manual bypasses
stabilization and resets its integrators; stick, trim, actuator limits and
conversion remain active. Host auto-trim and autopilot assists are separate.

The partial-conversion and bank/deceleration diagnostics lose altitude because
they are untrimmed fixtures with terrain forces excluded. They isolate yaw
behavior and do not qualify stable transition flight. High-speed fixtures also
climb; this is not a level-flight handling or aircraft performance qualification.
No ground-contact behavior is covered.

Reproduce the diagnostic from the repository root with
`node scripts/validation/f35b/inspect-yaw.mjs`; use
`--yaw-schedule constant --cases conventional-450-release,conventional-600-release`
for the in-memory comparator. New output defaults to a dated `build/` folder.
The current script adds neutral cases and command/mode CSV columns that were
not present in the earlier scheduled report; the recorded case configurations
and source hashes identify each run.

Frozen aircraft XML files remain derived from the FlightGear GPL package, with
their original headers intact. The [runtime notice](../../../../../public/jsbsim-data/aircraft/F-35B-jsbsim/NOTICE.md)
and [GPL version 3 text](../../../../../public/jsbsim-data/aircraft/F-35B-jsbsim/License.txt)
apply; the separately acquired exterior's CC BY 4.0 licence is independent.
