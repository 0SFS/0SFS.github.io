# Experimental F-35B flight model

This is a modified FlightGear JSBSim trial model, not a validated representation
of F-35B performance. Its aircraft XML credits **F-GTUX from Erik Hofman's F-16
and Aeromatic**, with creation date 2011-10-15 and release `TRIAL`.

The source package credits Petar Jedvaj, Detlef Faber, F-GTUX, Stuart Cassie and
Gary Brown. Original source and credits are retained in
`planes/Lockheed_Martin_F-35B/tests/flightgear-jsbsim/` in the 0SFS source tree.
The package is covered by the GPL version 3 text in **License.txt**; the original
aircraft header names GPL. Original notices remain in the modified files.
The separately acquired Sketchfab exterior has CC BY 4.0 attribution and is
independent of this flight-model licence.

Source: official FlightGear FGAddon archive
<https://fgaddon.b-cdn.net/Aircraft-trunk/F-35B.zip>, revision **15340**,
10,618,616 bytes, SHA-256
`caf3c591c838148ccdeec8fc61a23fd09f17574aeb36e0071e84a132dd25ebd6`.
The mutable archive URL alone does not pin this source. **source-manifest.json**
records original paths, original hashes, current hashes, and changes.

## 0SFS modifications, 2026-10-05

- Supply the FlightGear external pushback and wheel defaults explicitly. Retain
  model-local engine/system dependencies so unrelated aircraft data is not loaded.
- Initialize each internal tank with 2,500 lb, totaling **5,000 lb development
  fuel**. Use two lumped internal tanks of 6,550 lb each, totaling the **13,100 lb
  internal capacity** published in [Lockheed Martin's 2023 product card](https://www.f35.com/content/dam/lockheed-martin/aero/f35/documents/F-35B%20Product%20Card.pdf).
  The two-tank internal layout remains a source approximation, not a
  reconstruction of the aircraft's actual tank plumbing.
  Source 32,000 lb empty weight is unchanged. The app
  airborne development start uses 300 kt, 48% throttle, 1.92° pitch and -0.059
  pitch trim; this is an experimentally usable start, not a published trim point.
- Model two detachable external tank/pylon assemblies, initially attached and
  empty, with the inherited **2,991 lb fuel capacity each**. Combined installed
  capacity is 19,082 lb; the Fuel total includes only attached tanks. Each
  assembly has a **provisional 300 lb dry mass** and **1 ft² equivalent axial
  drag area**. These are explicit modeling assumptions, not published F-35B
  tank performance. Tank fuel and dry mass use structural x=368.52 in,
  y=±127.952756 in (±3.25 m), z=-15.36 in; the exterior tank/pylon placement was
  checked against the source asset and wing clearance. Mass asymmetry affects
  the native CG/inertia. Drag acts opposite the wind at each assembly
  location, producing native moments for asymmetric carriage. The constant
  equivalent areas omit calibrated interference/lift effects and a store
  separation envelope.
  Native `stores/external-tank[n]/attached` controls dry mass, drag, fuel
  availability and feed priority; native FCS clears absent-tank contents before
  propulsion. Tank metadata `external-store-index` connects generic fuel tools
  to that attachment property. The app attaches an empty replacement and
  releases the tank, pylon and all remaining fuel together. Attachment persists
  with fuel through recovery, relocation and saved-session restore; old saves
  without attachment flags retain the initially attached configuration. Existing
  clean-aircraft handling fixtures explicitly detach both assemblies.
- Replace the missing Nasal conversion behavior with a JSBSim FCS channel.
  `fcs/stovl-cmd-norm` is the pilot's 0–1 lever and `fcs/stovl-pos-norm` is a
  physical actuator, slewing over 2.5 s for a full stroke. Fan/roll-post allocation
  and pitch/roll/yaw damping run inside JSBSim; the app does not impose a hover pose.
- Use 0–90° physical nozzle pitch, with physical yaw limited to ±0.17 rad.
  Convert its direction vector into the native direct-thruster Euler angles.
  Presentation reads `fcs/nozzle-pitch-rad` and `fcs/nozzle-yaw-rad`; native Euler
  yaw has a singular representation at vertical pitch.
- Provisional main-nozzle and fan force positions use the inspected exterior's
  nozzle exit (13.82474428 m aft nose) and fan center (5.02978069 m aft nose).
  The source CG is retained at 9.360408 m aft the assumed nose datum. These visual
  force arms are assumptions for development, not verified aircraft mass geometry.
- Reduce dry main thrust progressively from the source 28,000 lb rating to
  18,000 lb at full conversion, before the retained source bleed and atmospheric
  tables. Retain 20,000 lb fan and 1,950 lb/post source ratings. These are coarse
  LiftSystem capacities, not calibrated installed thrust. Fan bias and simple
  attitude feedback balance the provisional force arms.
- Enable native automatic augmentation at full conventional throttle and cap the
  main command below augmentation for every positive conversion request or
  pre-step physical position, including tiny values and closing motion. Hold the
  inhibit through zero-time evaluation while recovery restores saved actuators;
  normal conventional stepping releases it. New-flight initialization clears the
  latch explicitly. Treat auxiliary turbines as
  thrust surrogates with zero separate fuel consumption, and increase main-engine
  TSFC with conversion to account roughly for shared power. This is approximate
  fuel accounting, not a shaft, clutch, bypass-flow or performance model.
- Allocate auxiliary lift from the main nozzle's actual upward native body
  force, evaluated earlier in the same propulsion step. The fan uses current
  longitudinal main/fan arms about CG and the existing pitch allocation. Each
  roll post uses the retained 1,950/18,000 rating ratio and differential roll
  allocation. Retained atmospheric tables cap each auxiliary's capacity. Nozzle
  retraction, main cutoff and the real main spool govern available lift; neither
  a second conversion multiplier nor an independent auxiliary turbine lag does.
  Auxiliary instances remain zero-fuel, full-setting force carriers rather than
  separate engines. This requires the cached native vector observers in SDK
  fork.10 or newer; fork.11 also prevents stopped zero-time main thrust.
  This balances the declared geometry; it does not calibrate clutch/shaft work,
  bypass bleed sharing, actuator response or the real LiftSystem.
- Schedule the source yaw command by `min(1, 300 / max(1, qbar-psf))` to reduce
  disturbance-driven rudder hunting at high dynamic pressure. The source loop
  combines yaw-rate gain 100 with PID proportional gain 0.1055 and a rate-limited
  rudder. Pilot command, trim and feedback share the schedule; pilot command
  properties remain unchanged. The 300 psf reference is development tuning,
  not a measured F-35 control law.
- Expose native `fcs/control-law-mode`: 0 is Auto (this model's FBW default),
  1 is Manual, and 2 explicitly enables FBW. `fcs/fbw-enabled` reports the
  resolved state. Manual routes stick plus trim directly to the limited physical
  actuators, resets stabilization integrators, and disables automatic leading-edge flap and hover attitude/rate
  feedback. Conversion and its physical actuator remain available in every mode.
  Host trim and autopilot assists are separate settings.
- Select trailing-edge flaps independently with `fcs/flaps-auto-enabled`, which
  defaults to 1 in every control-law mode. Enabled retains the source automatic
  speed/Mach schedule; disabled uses the bounded pilot flap command. Manual
  flight controls can therefore retain automatic trailing-edge flaps.
- 2026-10-07: make the FBW roll channel a roll-rate command that flies its
  command. Full stick asks for native `fcs/full-stick-roll-rate-deg_sec`
  (default 636.62, the source's 1/0.09 rad/s); the host writes the pilot's
  setting while the pilot owns roll and the default otherwise. The source
  integrator trigger was inverted, holding above 5 kt and running only when
  parked, so the loop was proportional and settled at 43-62% of its command.
  Feedforward now supplies the aileron for the commanded rate, p = a vt / 165 ft,
  faded out by conversion. The integrator (gain 10) only holds bank: it runs
  with the stick centred and roll rate under 10 deg/s, holds while the stick is
  deflected, a roll is stopping or the command is saturated, and resets in
  Manual, on the ground and with any conversion. Proportional and derivative
  gains are unchanged. Manual and the hover roll posts read the unscaled
  stick. Pitch and yaw keep the same inverted trigger.
- 2026-10-07: FBW roll trim enters the rate error and the feedforward as native
  `fcs/roll-trim-rate-cmd-norm`, scaled like the stick by
  `fcs/full-stick-roll-rate-deg_sec`, so full trim asks what full stick asks.
  It entered unscaled, as the source's 1/0.09 rad/s, 637 deg/s against 30 deg/s
  at full stick. Manual and the hover roll posts take trim as they take the
  stick.

## 0SFS modifications, 2026-10-08

- Replace the F135's empirical thrust tables, TSFC schedule and thermal
  observer with a coupled turbine plant (JSBSim `<plant>`, SDK 1.2.4-fork.20 or
  newer): fuel metering, ignition and combustion, the matched gas path, shafts,
  nozzle, metal temperatures and the LiftSystem in one transient. It is
  calibrated to the published 27,000 lbf intermediate and 41,000 lbf maximum
  ratings and the 40,650 lbf hover split (16,750 main, 20,000 lift fan, 2 x
  1,950 roll posts); every other value is an estimate. Provenance and
  uncertainty: `docs/validation/f135-engine-plant.md` in the source tree. This
  supersedes the dry-thrust reduction, the auxiliary force carriers and the
  conversion-dependent TSFC above.
- Remove the `liftfan` and `sidefan` engines (engines 1-3) and their throttle
  channels. The lift fan is driven from the LP spool through a clutch, and the
  roll posts bleed the bypass duct; their thrusts are the plant's outlet
  observations, applied as BODY external forces at the fan centre and the post
  stations, and each inlet's ram drag acts along the relative wind.
- The FCS engages the clutch for any conversion, opens the lift-fan nozzle with
  the main nozzle's vertical share, commands the thrust split that balances
  lift-fan against main-nozzle thrust about the CG (carrying the pitch
  command), and opens the roll posts with the vertical share, differentially
  for roll. The engine holds the split with lift-fan guide vanes and its
  nozzle area. The augmentation inhibit in conversion is unchanged.
- The installed SDK's coupled solve, its energy and mass ledgers and the
  calibration evidence are development checks, not engine qualification.

## Qualification boundary

Installed-SDK tests cover actual app bootstrap, relocation, trim adoption,
controls and snapshot restore; finite conventional flight for 60 s with trim
assist both on and off; conversion slew; control signs; and finite full-conversion
forces/attitude for 60 s at the explicit development loading. At 98% throttle the
converted fixture climbs. It does not establish altitude hold or an operational
hover procedure. Source aerodynamics, CG, inertias, propulsion tables, conversion
envelope, supersonic flight, handling and fuel use remain uncalibrated.
Ground collision qualification is separate.

The lift-allocation diagnostic covers 0/25/50/75/100% physical conversion at
0/60/150 kt and 48/80/98% throttle, plus 60 kt entry and control/release cases.
The old double gate and separate auxiliary spool produced a large unbalanced
pitch moment during transition. The coupled allocation removes that specific
failure in the measured high-power cases. Low power still cannot support the
declared weight; the untrimmed low-power cases descend and can develop large
attitude changes. Conventional low-speed aerodynamics, mixed surface/thrust
authority and the operational transition envelope remain unvalidated. The
regression bounds are development checks, not published F-35 handling limits.

The yaw regression adds 24 s, 120 Hz disturbance/release cases at 160, 300,
450 and 600 kt; partial and full conversion diagnostics; and native mode,
resume, relocation and snapshot checks. The previous constant-gain loop develops
large oscillations after a small rate disturbance or rudder pulse at 450/600 kt.
Exactly neutral conventional starts in the diagnostic remain quiet, so these
results establish disturbance-driven hunting, not spontaneous oscillation from
an ideal start. The partial-conversion fixture is untrimmed and loses altitude;
it isolates yaw behavior with ground contacts excluded and does not qualify
stable transition flight.

See `docs/proposals/f35b-fdm.md`,
`src/flight/jsbsim/f35b.integration.test.ts`, and
`validation/evidence/aircraft/f35b/` in the source tree for scope and evidence.
