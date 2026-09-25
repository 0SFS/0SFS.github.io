# PR #1502 — posted replies

**Posted and verified, 2026-09-19.** All nine review threads now have exactly
one matching author reply. Two misplaced comments were corrected in place;
the correctly placed Jinv reply was preserved. The six missing replies,
[round comment](https://github.com/JSBSim-Team/jsbsim/pull/1502#issuecomment-5744732853)
and [replacement PR body](https://github.com/JSBSim-Team/jsbsim/pull/1502) are
published against `499c38326bb6f39b6360bd82d74c5c00e64faeaf`.

Each thread heading below links to the maintainer comment it answers.
The approved message text is unchanged. The
[publication record](../../validation/evidence/jsbsim/wheel-spin-review/final/publication-actions.json)
links all posted replies and records read-back verification. Threads remain
open for the maintainer's next review. This introductory note is local.

## Thread replies

### [4047586942 — inverse inertia](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047586942)

Renamed `InvInertia` to `Jinv` in “Use explicit moment Jacobians for friction.”

### [4047828797 — reference frame](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047828797)

Removed “absolute” in “Report wheel spin relative to the airframe.” I used
“ground reference frame,” matching the rate supplied to the solve.
`FGPropagate::GetPQR()` documents that rate as ECEF-relative; a transported
NED frame would require another correction. The state and its reference are
unchanged; the public property is now relative to the airframe.

### [4047612197 — remove LeverArm](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047612197)

Removed `LeverArm` and `UseMomentJacobian` in “Use explicit moment Jacobians
for friction.” All rows now supply their moment Jacobian.

I rechecked all 61 shipped XML inputs on the final candidate. Base and
original PR data match byte-for-byte; the cleanup changes 60 of 102 files
across 31 of 57 successful simulations. Crosswind reaches Δu = 0.0540 ft/s
and Δgear Fx = 197 lbf; the moored ZLT reaches Δgear yaw moment = 20,929
lbf·ft. F-16 Δu reaches 71.6 ft/s after severe ground impacts. These are
not uniformly rounding-sized output differences. The final candidate matches
the isolated cleanup probe exactly, and the PR body now reports these limits
instead of claiming existing aircraft are unaffected.

### [4047622267 — remove moment lambda](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047622267)

Removed the lambda in “Use explicit moment Jacobians for friction.” Assembly,
RHS and final moment accumulation now read `MomentJacobian` directly.

### [4047650299 — duplicated loop; includes follow-up 4047870001](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047650299)

Merged the matrix assembly, RHS and accumulation paths in “Use explicit
moment Jacobians for friction.” The wheel term is conditional on the two
rows sharing a wheel; the `generalized` branch and its `continue` are gone.
I also renamed `WheelCoeff` to `WheelJacobian`.

### [4047682190 — location of tire grip bound](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047682190)

Moved the wheel roll row's `Max` and `Min` into `ConfigureWheelSpinRows` in
“Configure wheel friction bounds before clamping.” The static tire-grip
bound is now alongside the wheel row, separate from the brake-torque bound.

### [4047708987 — configure before Constrain](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047708987)

“Configure wheel friction bounds before clamping” calls the configuration
before the roll and side warm-start clamps. Registration still runs in
roll, side, brake order.

### [4047742902 — variable names](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047742902)

Renamed them `rollDirection` and `axleLeverArm` in “Configure wheel friction
bounds before clamping.” “Document wheel friction and airborne spin-down”
also clarifies that the lever arm runs from the CG to the axle.

### [4047795134 — export relative spin](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047795134)

“Report wheel spin relative to the airframe” keeps `wheel-spin-rad_sec` and
exports `Rate - dot(in.PQR, spinAxis)`. Writes apply the inverse conversion,
so the property remains writable. The constraint solve retains its internal
state. The same commit fixes airborne drag to reduce this relative rate and
adds nonzero body-rate and steering regressions.

## Top-level round comment

For stationary terrain, your reading matches the two constraints: the roll
row drives axle tread slip toward zero, while the brake row drives wheel
spin relative to the airframe toward zero, within their bounds. Both remain
in the shared solve, now with explicit moment Jacobians and `WheelJacobian`
naming. The internal reference is unchanged; the exported rate is
airframe-relative. I used “ground reference frame” in the comments because
the supplied `in.PQR` comes from the ECEF-relative `FGPropagate::GetPQR()`.

“Document wheel friction and airborne spin-down” explains the enabled
`rolling_friction` interpretation as wheel-to-axle resistance in the
`FGLGear.h` class documentation. The comment above `ConfigureWheelSpinRows`
links your analysis and states the two rows, addressing Sean's link request.

I also changed two things outside the inline requests: airborne drag now
reduces airframe-relative spin, and the 13/100 ft/s² spin-down constants are
named with their provenance. The 100 ft/s² extra brake term is an authored,
uncalibrated approximation; I retained its value rather than deriving a
torque from zero airborne normal load. A CxxTest now checks the constraint
signs, shared-wheel coupling, clamping and zero-dt case in the Python-disabled
test configuration.

The final candidate `499c3832` passes 79/79 CTest targets with Python enabled
and 21/21 CxxTests with Python disabled. The new native test also detects
omitted or reversed shared-wheel coupling in mutation checks.

I ran all 61 shipped XML inputs with per-step logging on the base, original
PR, isolated cleanup probe and final candidate. Original/base data match
byte-for-byte, as do final/probe data. Base/final differ in 60 of 102 files
across 31 of 57 successful simulations. Crosswind and moored-ZLT contact
forces/moments change materially, and the F-16 trajectory diverges after
severe impacts. The body gives the measurements and removes the “unaffected”
claim. One common trim failure and three non-runscript inputs are accounted
for separately. These results are specific to this macOS arm64 build.

## Updated PR body draft

### Summary

Adds an opt-in wheel rotational degree of freedom for `BOGEY` contacts.
Declare positive radius and spin inertia to enable it:

```xml
<contact type="BOGEY" name="LEFT_MAIN">
  <!-- existing contact elements -->
  <wheel_radius unit="M"> 0.22 </wheel_radius>
  <wheel_inertia unit="KG*M2"> 0.124 </wheel_inertia>
</contact>
```

The existing `wheel-speed-fps` is a kinematic proxy. The new state lets the
friction solve account for touchdown spin-up and apply braking through the
wheel. For stationary terrain:

- The tread row drives axle ground speed minus radius times internal spin
  toward zero, bounded by static friction times normal load and the ground's
  static friction factor.
- The tread force reaches the airframe through the axle, while its wheel
  torque accelerates the spin state. Applying the full contact-patch moment
  to the airframe as well would count the spin-up moment twice.
- A second row applies equal and opposite wheel/airframe brake torque. Its
  target is zero **relative** wheel spin; its bound is the existing braking
  force coefficient times normal load times radius.

With the DOF enabled, `rolling_friction` therefore describes wheel-to-axle
resisting torque. Without it, the legacy interpretation is tire rolling
resistance/hysteresis. This distinction is documented in `FGLGear.h`.

Ground initialization and trim initialize a contacting wheel without tread
slip. Airborne, an approximation reduces the magnitude of wheel spin relative
to the airframe without reversing it: tread deceleration is
`13 + 100*brake` ft/s². The 13 value comes from the legacy wheel-speed decay;
the additional 100 is an authored, uncalibrated brake approximation, not a
normal-load-derived or measured torque. It has no explicit airborne reaction
torque on the airframe. Damping acts only on positive-time steps outside
trim. Its finite decrement does not enforce a rigid brake lock under
arbitrary body motion.

The opt-in properties are:

| Property | Meaning |
| --- | --- |
| `gear/unit[i]/wheel-spin-rad_sec` | Wheel angular rate relative to the airframe, positive for forward rolling. Reads subtract the body rate projected on the spin axis; writes apply the inverse conversion. |
| `gear/unit[i]/wheel-tread-slip-fps` | Axle ground speed along the roll direction minus radius times the internal wheel rate; zero when airborne. |

The internal spin state stays in the ground reference used by the existing
solve, with the same rate reference as `in.PQR`. It is not an inertial or
“absolute” angular velocity. `wheel-speed-fps` retains its existing meaning.
In contact, the spin axis is ground normal cross projected rolling direction;
airborne it is gear up cross steered forward. The scalar state is not remapped
when those axes differ, so banked or steered contact transitions can produce
a jump in the reported relative rate. `FGLGear.h` documents this limitation.

### Why

This comes from [OSFS](https://0sfs.github.io/), an open-source browser flight
simulator using JSBSim through WebAssembly. Touchdown visuals, tire sound and
haptics need wheel spin, and spin-up/braking should also act on the aircraft.
An application-side state cannot participate in JSBSim's friction solve and
would risk counting existing rolling/brake forces again. The wheel degree
of freedom belongs in that solve.

### Implementation

`LagrangeMultiplier` supplies force, moment and optional scalar wheel
Jacobians. The common solver assembles the body terms for every row, adds a
wheel term only when rows share a wheel, and accumulates its acceleration
alongside the body force/moment. `FGLGear` owns the state, configures the
tread and brake rows, and advances spin using the previous solve's
acceleration in step with the existing integration sequence.

The analysis linked from `ConfigureWheelSpinRows` explains the two
constraints: [wheel dynamics and braking derivation](https://github.com/JSBSim-Team/jsbsim/pull/1502#issuecomment-5654721219).

Without both positive wheel elements there is no additional wheel state or
property. The friction formulation for those aircraft is mathematically
equivalent, but the unified moment-Jacobian arithmetic changes floating-point
evaluation order. **Existing aircraft are not guaranteed byte-identical
trajectories.**

### Validation

`TestWheelSpin.py` covers opt-in/invalid dimensions, touchdown spin-up and
momentum transfer, ground initialization, rolling/braking comparison and
airborne decay. This round adds body-relative property/frame regressions and
a native `FGAccelerationsTest1` for analytical tread/brake constraints,
shared/distinct wheel couplings, limits and zero dt.

Verified candidate `499c38326bb6f39b6360bd82d74c5c00e64faeaf` on macOS 27
arm64, Apple clang 21.0.0, CMake 4.4.3 and Python 3.14.7, Release builds:

- Python enabled: **79/79 CTest targets pass**, including all nine Python
  wheel methods and all eight native constraint methods. Python disabled:
  **21/21 CxxTests pass**, including `FGAccelerationsTest1` in the selection
  used by the coverage workflow. No new hosted coverage percentage is claimed.
- The four new Python frame regressions fail on the pre-frame-change engine.
  A control with the new getter and old damping also fails the locked-wheel
  and near-zero drag checks. Omitting or reversing the native solver's
  shared-wheel off-diagonal term fails the coupled-row case; restoring it
  passes. Existing tolerances were not relaxed.
- Fresh four-binary comparison: all 61 shipped XML inputs, isolated working
  directories, natural data outputs plus per-step traces. Each binary has
  57 successful simulations, the same simplex steady-turn trim failure
  (exit 1), and three output/plot inputs (exit 255). Each emits 102 data files
  and 11,877,246 trace rows, including 13 rows from the trim failure.
- Base `d0d8bc6e` and original PR `24e085bf` data are byte-identical. The
  final candidate matches the isolated common-Jacobian cleanup probe exactly.
  Base/final differ in **60 of 102 files across 31 of 57 successful runs**,
  with no exit, shape or non-finite mismatch. Rebuilt original-head outputs
  and reused base/probe outputs also match their retained earlier records.
  Console banners and timings are excluded from data identity.

Representative maximum absolute base/final differences in the per-step trace:

| Run | u (ft/s) | Pitch (rad) | Altitude (ft) | Gear Fx (lbf) |
| --- | ---: | ---: | ---: | ---: |
| `c172_cross_wind` | 0.054043 | 3.6853e−4 | 0.0023394 | 197.33 |
| `c1723` | 0.0025166 | 4.4618e−5 | 0.0071976 | 3.7558e−6 |
| `ZLT-NT-moored-1` | 9.7489e−5 | 1.5745e−7 | 1.4622e−5 | 67.311 |
| `f16_test` | 71.644 | 0.23604 | 17.819 | 179038 |

Crosswind gear pitching moment differs by up to 1,358.7 lbf·ft; moored-ZLT
gear lateral force by 443.29 lbf and yaw moment by 20,929 lbf·ft. These are
not uniformly small force/moment changes. F-16 Δu stays below 1e−6 ft/s until
127.908 s, when gear Fx is already about −2.11 million lbf; both trajectories
subsequently go below ground. Matching that impact sequence is not a
physical-accuracy criterion, and its divergence is not a general tolerance.

The saved-init XML in `c1723` also changes (nine lines of attitude, local
velocity and body rates). Its exact hashes and text diff were checked; the
CSV harness reports only a text mismatch for that file. Raw 2π angle
differences in crosswind/ZLT heading and F-16 roll
are wrap artifacts; wrapped maxima are 6.258e−6, 2.730e−6 and 0.030706 rad.
All comparisons are specific to this compiler, architecture and input set.

The test suites above ran on this exact candidate and were reused
for the final comparison after source and binary hash checks; they were not
rerun as part of that comparison. `TestInputSocket` historically has a
telnetlib3 timeout on this machine, and `TestActuator` once hit a subprocess
timeout under competing load. Both passed first try in the candidate suite.
No revised WebAssembly verification is claimed.

The C172 wheel dimensions/inertias in the existing fixture are estimates,
not measured assemblies or aircraft calibration. The current scalar axle
model and airborne approximation do not establish full wheel gyroscopic,
camber or airborne reaction-torque dynamics.
