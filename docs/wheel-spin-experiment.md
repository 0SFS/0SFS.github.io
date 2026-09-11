# Wheel spin-up and landing feedback

Research checked 2026-09-10. The experiment adds a small wheel-rotation model and tire audio to the current contact simulation. It leaves aircraft forces and braking with JSBSim while we evaluate sensory value and cost.

## Try it

The durable way is **Settings → Ground interaction**: choose **Landing
feedback** (finite-inertia wheels plus the slip cue) or build a Custom mix of
wheel response, tire audio, volume, haptics and strength. These choices persist,
can be saved as named profiles and exported/imported as text. Wheel-response
changes made while flying wait until you pause or reset; volume, haptic strength
and audio/haptic modes change immediately. Unimplemented options (coupled or
compliant tires, footprint contact, geometry audio, asset wheel rotation,
WASM/worker/GPU backends) are listed but disabled with the missing capability.

For quick A/B comparisons, **Debug → Wheel spin experiment** still switches
**A · Instant rolling** / **B · Gradual spin-up** and tire sound immediately,
as a session-only override. Settings shows the override and offers **Keep
experiment choices**; otherwise it is gone after reload. Turn on **Show
aircraft collision geometry** to see three tire outlines with rotating spokes.
The telemetry reports individual wheel RPM, slip speed and contact state.
Changing modes resets the virtual tires, so select a mode before an airborne
approach rather than midway through rolling.

The outlines are a debug display of C172 tire estimates, including when another
visual aircraft is selected. They do not animate the asset's wheel meshes or
replace the contact geometry. (The asset's tyres do roll, but on their own:
from ground speed over radius, independent of this experiment and of its slip
model — see [docs/aircraft-assets.md](aircraft-assets.md#rolling-tyres).) Each axle is offset above its existing contact
reference by tire radius and estimated suspension compression; strut flex and
sloped-ground projection are not reconstructed. The amber dots retain their
original meaning as uncompressed contact references.

Sound starts only when enabled (the Debug checkbox, or a saved Slip cue, which
waits for your next click or key press before the browser allows audio), pauses
with the simulation, and is silenced in background tabs. It uses synthesized filtered noise and a
quiet tonal component, driven by slip work accumulated over successful physics
steps. The current effect covers longitudinal slipping/spin-up; it does not add
engine sound, rolling rumble, crosswind scrub or surface-specific audio.

## Cues and haptics

Every accepted 120 Hz step publishes one `WheelCue` per wheel (load and impulse
estimates, slip work, tread distance, contact entry, epoch, terrain revision).
Pausing, resets, faults, teleports, mode changes and terrain re-placement start
a new epoch, so partial feedback never carries across. The slip sound reads this
bus; nothing reads it back into flight physics. An integrated benchmark asserts
the trajectory is identical with feedback off and on.

Haptics are optional presentation (**Settings → Ground interaction → Haptics →
Landing cues**, off by default): a touchdown load pulse on a gamepad's
low-frequency motor and a short spin-up pulse on its high-frequency motor, at
most one ≤60 ms envelope per 50 ms, replaced rather than queued. A controller
without `vibrationActuator` shows "Unavailable on this device". With a paired
phone that has taken control, the desktop adds a latest-value pulse to its
50 ms heartbeat; the phone vibrates only if its own **Haptics** switch is on and
its browser exposes `navigator.vibrate` (for example Android Chrome; iOS Safari
has not exposed it). All output stops on pause, hidden page, reset, disconnect,
loss of control, expiry and disable. Mappings are authored scales, not measured tire data, and
physical devices have not been tested yet.

## What the debug spheres mean

The amber spheres mark the locations used by JSBSim's wheel contacts. Their displayed size is a visual aid. A wheel can use a point contact for terrain detection and still carry its own radius, angular speed and inertia; it does not need a triangle-mesh collider to spin up. A disk overlay with a spoke is a clearer display of that rotational state.

## What the existing engine does

The installed package is `@0x62/jsbsim-wasm@1.2.4-beta.4`; its README associates its version with JSBSim. The matching upstream `v1.2.4` tag is `e07a7d810d4f1048039d42545d008b8a998636fa`.

JSBSim computes suspension force from compression and damping, lateral friction from slip angle, and longitudinal friction from rolling resistance and brake input. Its `wheel-speed-fps` follows contact-point velocity while grounded and decays at a fixed rate airborne. It is a kinematic animation proxy, not an angular-momentum state. `slip-angle-deg` describes sideways slip, not the difference between forward ground speed and tire circumference speed. The inspected implementation has no independent wheel-inertia integration. [JSBSim 1.2.4 source](https://github.com/JSBSim-Team/jsbsim/blob/v1.2.4/src/models/FGLGear.cpp).

This is why the new experiment keeps its own signed wheel angular velocity. During touchdown the tire starts below its rolling speed; friction accelerates it until its tread speed approaches local ground speed. After liftoff it retains rotation and gradually slows. Bouncing contact should resume from that surviving rotation rather than trigger a new stationary wheel every time.

## What other simulators document

| Simulator | Verified behavior | What remains unverified here |
|---|---|---|
| X-Plane | Its 12.2 documentation distinguishes brake torque from a chock fixing the contact patch, and describes wheel locking and anti-skid. Its Plane Maker manual includes wheel/strut dimensions and rolling/skidding sounds. | The exact spin-up integrator and tire inertia values. |
| FlightGear C172P | Aircraft sources include asphalt/gravel rolling audio and tire screech, with ground-effect inputs controlling the sounds. | Those sound triggers alone do not establish physical wheel inertia. |
| Microsoft Flight Simulator | SDK documentation supports point contacts, wheel radius, individual center/left/right touchdown sounds and continuous ground roll. | The inspected documentation does not establish an inertia-based spin-up solver. |

Sources: [X-Plane braking and wheel chocks](https://developer.x-plane.com/article/brakes-parking-brakes-and-wheel-chocks/), [Plane Maker manual](https://developer.x-plane.com/manuals/planemaker/), [FlightGear C172P audio configuration](https://github.com/c172p-team/c172p/blob/master/c172-sound.xml), [FlightGear C172P ground effects](https://github.com/c172p-team/c172p/blob/master/Systems/c172p-ground-effects.xml), [MSFS wheel contacts](https://docs.flightsimulator.com/html/mergedProjects/How_To_Make_An_Aircraft/Contents/Files/Flight_Model/Wheels_And_Contact_Points.htm), [MSFS touchdown audio example](https://docs.flightsimulator.com/msfs2024/html/4_Sound/Aircraft_Audio/Advanced_Sound_xml.htm), [MSFS ground sound definitions](https://docs.flightsimulator.com/html/Content_Configuration/Sounds/Sound_Definitions.htm).

## Dimensions and estimates

Goodyear lists the C172 Skyhawk with 6.00-6 main tires and a 5.00-5 nose tire. Its catalog gives these dimensions:

| Tire | Inflated outer diameter | Outer radius | Static loaded radius |
|---|---:|---:|---:|
| Main | 16.8–17.5 in | 0.213–0.222 m | 0.1753 m |
| Nose | 13.65–14.2 in | 0.173–0.180 m | 0.1448 m |

The prototype uses 0.22 m and 0.18 m radii. These approximate inflated size; neither is a measured effective rolling radius. Goodyear approximates tire radius of gyration as `(maximum OD + minimum OD) / 5.12`, and rotating wheel assembly radius of gyration as `0.40 × rim diameter` with approximately ±20% uncertainty for the latter. [Goodyear 2022 Aviation Databook, PDF pages 7, 14 and 20](https://www.goodyearaviation.com/resources/pdf/Aviation-Databook-2022.pdf).

Using `I = Σ mass × gyrationRadius²`, our **estimated** main tire/hub masses of 4 kg/2 kg produce about 0.124 kg·m²; estimated nose masses of 2.5 kg/1.5 kg produce about 0.052 kg·m². These mass assumptions and the resulting inertia values are tunable prototype parameters, not measured C172 assembly specifications.

## Model and audio design

Three scalar angular speeds and angles are enough for this experiment. Let `slipSpeed = rollingSpeed − radius × angularSpeed`. Clamp friction impulse by both available load/friction and the impulse needed to reach rolling speed. That prevents the wheel from oscillating past its target when a fixed step is longer than the remaining spin-up interval. Bearing drag dissipates rotation airborne. Suspension compression and rate provide an estimated load for the feedback model; load projection and effective tire radius remain approximations.

The one-way model takes aircraft motion as input and supplies visual/audio feedback. Energy entering its virtual wheels comes from prescribed motion; it does not remove that energy from the aircraft. Consequently it does not claim to simulate spin-up drag, its pitching moment, or a replacement braking model. Actual coupling would need equal/opposite tire forces, moments and energy accounting.

For audio, a slip- and load-driven chirp decays as the wheel catches up, even during a gentle touchdown. Rolling noise could later track contact speed and load. A procedural sound is an authored approximation, not a validated tire-acoustics model. The same tire state drives the rotating disk and audio so they respond together.

Full longitudinal coupling would also need to replace or explicitly budget against existing friction. Simply turning off JSBSim's rolling coefficient leaves its braking force active; adding another complete brake/slip model would double-count forces. Its per-wheel `maximum-force-lbs` property is a limit rather than a measured normal force. [JSBSim friction and bindings](https://github.com/JSBSim-Team/jsbsim/blob/v1.2.4/src/models/FGLGear.cpp#L583). The native contact contract that coupling needs, and a reference coupled rigid-wheel solver with conservation tests, now exist in `src/flight/physics/wheelContact.ts` and `coupledRigidWheels.ts`; neither is wired into the game, because the installed JSBSim WASM offers no per-wheel contact packet and the probe refuses any bridge that leaves JSBSim's own friction active.

## A/B evaluation

Compare baseline and experiment using the same initial state and controls, with sound independently enabled or muted. Include shallow touchdown, one-main-first contact, a bounce, takeoff, braking, reverse taxi and reset. Replay at different render rates while keeping the physics step fixed. Record wheel speed, slip, estimated load, settling time and update cost; verify no wheel spin-up without contact and no new physics work when the feature is disabled.

Automated tests can verify state evolution, stability and CPU cost. Claims about landing feel still need human A/B trials, preferably with pilots and comparable sound levels. Record whether the timing and character of the chirp help the pilot recognize gentle contact, rather than assuming that a louder touchdown sounds more realistic.
