# Flight settings

The Engine tab also owns live-history retention (1–600 simulated seconds,
default 60) and capture ceiling (0–30 Hz, default 5; zero disables it), plus
starting view distance (1–100 m,
default 6), and the test camera's single-track zoom range (0.2–1,000 m bounds,
default 1–100 m). These are declared in `flightParameters.ts`. The test stand is
an explicit, nonpersistent `engineTest=1` page mode, entered/exited in the Engine
tab. Earth stays loaded and the existing **Location** tab owns moves and altitude,
including runway selections. The default fixture is MSP runway 35's threshold,
at 44.8661768° N, 93.2366446° W, facing 350° true; its published elevation is
833.3 ft MSL. Loaded terrain and the aircraft's stance supply final clearance.
These defaults come from [FAA AIP, Minnesota, AD 2.12](https://www.faa.gov/air_traffic/publications/atpubs/aip_html/part3_ad_2.0_minnesota.html),
read 2026-10-06. The separate test-altitude setting was removed so altitude has
one home. Native hold-down remains active after a move; runway choices retain
the bench's throttle, engine state and native metal temperature instead of
applying flight departure/arrival controls.
[Behavior, sources and qualification limits](f35b-fdm.md#engine-test-stand-and-live-history).

Status: implemented. Stage 1 (2026-09-25) came with the sound tiers' internal
parameters. The aircraft as a detail focus point (2026-09-26) passes its orbit
check on Google and on a 2D map. Presets came on 2026-09-26. What was done and
where it differs from this text: [Implementation](#implementation). Builds on FOSS Earth's [Settings](../../../foss-earth/docs/proposals/settings.md)
spec, which defines the registry, the controls, presets, automatic adjustment,
persistence and the globe's own settings. This document lists what 0sfs adds to
that registry, where each flight setting lives, and which flight constants
become parameters. Everything that would still be right with no aircraft in the
scene is FOSS Earth's and is specified there.

## The Settings tab goes away

The flight panel's Settings tab collects things that have no other obvious home.
Each moves to the tab where its effect is seen, and the tab is removed.

| Today (Settings tab) | Moves to | Why |
| --- | --- | --- |
| Flight terrain → Flight minimum | Map → Detail, as a marker on the Google detail track | It bounds world detail; it belongs on the same scale, as it did before |
| Flight terrain → Terrain detail follows (Aircraft / Camera) | Map → Detail → Detail focus (FOSS Earth `map.focus.*`), with the aircraft registered as a focus point | See [Detail around the aircraft](#detail-around-the-aircraft) |
| Flight terrain → Allow coarser terrain for this session | Map → Detail, beside the Flight minimum | It suspends that marker |
| Map cache | Map → Loading and memory (FOSS Earth) | It is the globe's HTTP tile cache |
| Attitude indicator renderer | Renderer → Instruments | It chooses a renderer backend |
| (new) whole-record export, import and reset | Settings → Saved settings, beside Settings → Presets (FOSS Earth's shared Settings tab) | Both span every tab; the shared tab holds nothing else |
| Ground impacts (Arcade ground launches) and Ground interaction | Aircraft → Ground handling | They change the aircraft's physics |

The Aircraft tab's **Camera** choice (Cockpit, Chase) stays where it is, with
the chase-camera parameters below added to it.

## Flight minimum on the detail track

Before 2026-09-25 the Google detail limit and the Flight minimum were two thumbs
on one track (green and red) in this repository. The shared Map → Detail editor
that replaced it must bring that back, generalised:

- FOSS Earth's range track accepts **host markers**: a value on the same scale
  with a colour, a label, an accessible name, and whether the user may drag it.
  0sfs registers the Flight minimum as a red, draggable marker on the Google
  track (`osfs.flight.minimum`, px error target, log2 scale, default 4,096 px).
- Dragging it edits the saved Flight minimum; it is not clamped into the detail
  range, because it is a requirement, not a preference. Where it is finer than
  the range's coarse end, the part between them is striped: detail the user
  allows, but that flight does not accept.
- **Allow coarser terrain for this session** sits beside it as a switch. While
  on, the marker is hollow and the low-spawn hold does not apply.
- The HUD rail shows the marker as a red tick while a hold is active, so the
  rail explains why it cannot go coarser.

The requirement lease (`createFlightDetailRequirements`) is unchanged; only its
parameters and its home change.

| Parameter | Unit | Today |
| --- | --- | --- |
| `osfs.flight.minimum` | px error target | 4,096, saved as `osfs.flight-terrain-requirement` |
| `osfs.flight.holdBelow` | m above the sampled surface | 100, hardcoded (`LOW_SPAWN_METERS`) |
| `osfs.flight.holdReleaseAfter` | s of flight above that height | 1, hardcoded (`DEPARTURE_SECONDS`) |
| `osfs.flight.allowCoarserThisSession` | switch, never saved | Exists |

## Detail around the aircraft

Reported problem: orbiting the chase camera makes the world load, because what
is loaded follows what the camera sees. "Terrain detail follows: Aircraft" does
not prevent it: it changes how Google's mesh refines with distance, while the
camera still decides which tiles are visible and therefore loaded.

0sfs registers the aircraft as a focus point with FOSS Earth, and the choice
becomes FOSS Earth's `map.focus.mode` in Map → Detail:

- **View:** load what the camera sees (today).
- **Around the aircraft:** load everything within the focus radius of the
  aircraft in every direction, refined as if seen from the aircraft. Orbiting
  loads nothing new; flying moves the loaded region with the aircraft. Uses the
  most memory.
- **View and aircraft:** both.

`osfs.focus.default` sets which focus point the flight app selects at start,
the aircraft by default. The old `osfs.terrain-detail-anchor` value becomes
FOSS Earth's `map.focus.refineFrom` (aircraft or camera) for Google's distance
refinement, which remains a separate choice from what is loaded.

## Flight constants that become parameters

Values are today's; all are hardcoded unless noted. Homes are sections of the
existing tabs.

Aircraft exhaust lives in Renderer → Aircraft exhaust. The shared flight-only
renderer reads `osfs.exhaust.enabled` (default on), `sampleCount` (8, bounded
4–32 samples/pixel), `maxDistanceMeters` (2,000, bounded 1–20,000 m),
`intensity` (1×, bounded 0–8×), and `surfaceReferenceNits` (1,000, bounded
1–100,000 cd/m²). They apply live and persist through the registry.
The last value maps modeled metal luminance to display white; lowering it
brightens the nozzle without changing gas/metal temperatures or the flame.
The default is one bounded volume draw per configured engine with a baked
optical lookup; off releases those resources. These controls do not change
engine power or native afterburner engagement. See the
[F-35B exhaust implementation](f35b-fdm.md#baked-exhaust-renderer) for physical
assumptions and qualification limits.

### Stowed landing gear

Debug → Aircraft visuals owns `osfs.debug.renderStowedGear` (boolean, default
off, persistent and live). Aircraft metadata names the enclosed wheels and
struts eligible to stop drawing. These parts remain drawable throughout gear
travel; at physical position zero the model hides their meshes, keeping bay
doors visible. Any extension restores them immediately. Unconfigured aircraft
keep their existing rendering, including exposed stowed wheels.

The debug override keeps those meshes drawable in their actual animated pose
at full retraction. It does not make the airframe transparent or alter physics.
This lets stowage checks inspect the underlying geometry independently of the
normal visibility optimization. Setting changes update a paused view too;
unchanged state does not request another frame.

### Engine shaft indicators

The engine HUD and phone show two concentric shaft rings for turbines and one
RPM ring for the C172. Aircraft engine metadata selects the instrument; readable
property names alone cannot identify an engine, because JSBSim may retain nodes
created by other readers. The C172's scale uses the installed IO320 definition's
2,700 rated RPM. Turbine dots use a common denominator of the larger native
`MaxN1` and `MaxN2` percentage limits. Their tooltips identify this as **scaled
percentage speed**, not physical turbine RPM. Missing limits leave dots still.
Numeric readings remain unclamped, including an overspeed.

Each ring now has **one equally sized, equally spaced marker per blade** of a
representative rotor on that shaft. The former large/small marker pair is
removed. A multi-stage shaft does not have one universal blade count: the
outer turbine ring represents its fan rotor; the inner ring represents a core
compressor rotor. The C172 ring represents its propeller. Tooltips and Engine
details show the counts and identify estimates.

| Aircraft | Outer ring | Inner ring | Evidence |
| --- | --- | --- | --- |
| SF50 / FJ33-5A | 16 fan blades | 30 impeller rim blades, **estimated** | Published fan part description; representative centrifugal impeller for the unreported core count |
| F-35B / F135 | 22 fan blades, **estimated** | 36 core compressor blades, **estimated** | Representative transonic rotor rows; neither count is confirmed F135 data |
| C172P | 2 propeller blades | None | Installed `public/jsbsim-data/engine/prop_75in2f.xml`, `<numblades>2</numblades>` |

The [Williams FJ33-5A Illustrated Parts Catalog](https://www.scribd.com/document/924928927/FJ33-5A-IPC),
2024-12-09, module 72-00-31 page 2, names P/N 79408 as a 16-blade swept fan
rotor; this is a public mirror of the manufacturer document, corroborated by a
[Williams engine record](https://www.underwriterssalvagecompany.com/Media/DisplayPDF/9fe3747d-6254-4ce2-aa61-a30561bd7ae2).
The [Williams family specification](https://www.williams-int.com/wp-content/uploads/2026/01/Fanjet-Family-Specsheets-IND-11262018-01222026.pdf)
identifies a centrifugal HP compressor. Its actual impeller count was not
established: the 30-marker estimate represents 15 full and 15 splitter blades
at the rim, using the component class illustrated in
[NASA TM 107515](https://ntrs.nasa.gov/api/citations/19970025160/downloads/19970025160.pdf).
It does not assert 30 full-length FJ33 blades.

The F135 estimates use [NASA Rotor 67's 22-blade transonic fan](https://ntrs.nasa.gov/api/citations/19980000490/downloads/19980000490.pdf)
and [Rotor 37's 36-blade core compressor inlet rotor](https://ntrs.nasa.gov/api/citations/20090011785/downloads/20090011785.pdf)
as representative visual defaults. These research rotors are **not F135
components**. A bounded public-source search did not establish its actual
counts; visible stationary inlet guide vanes in front photographs must not
be counted as rotating fan blades. This metadata changes the visualization
only, never the acoustic reference frequencies or flight dynamics.

Engine → Engine owns `osfs.engineMonitor.orbFps` (0–1000 frames/s, default 1000),
`orbTurnsPerSecond` (0–4 visual rev/s ceiling at the scale maximum, default 2),
`orbMaxPatternStep` (0.05–0.49 pattern pitches per drawn frame, default 0.45), and
`orbPixelRatio` (1–3 drawing pixels/CSS pixel, default 2, capped by display
density). Renderer → Instruments owns `osfs.renderer.engineOrbs`
(Auto/WebGPU/WebGL2/WebGL1/Off, default Auto), alongside a note naming the active
backend. These same choices travel to the phone. Off or zero frame rate releases
the orb renderer and retains the numeric gauges. Missing blade metadata also
allocates no orb graphics backend.

The FPS value is a ceiling, not a requested browser refresh rate. At the default,
the shaft canvas follows each client's `requestAnimationFrame` cadence (for
example 60, 120, 144 or 240 Hz) without the former 30 FPS throttle. Lower ceilings
remain available to reduce drawing work; zero disables it. Explicitly saved
ceilings remain in effect. Draw deadlines carry fractional timing remainder so
minor timestamp jitter cannot repeatedly halve the selected draw rate, and
stalls discard missed draws instead of triggering catch-up bursts.

Both shafts share a maximum visual speed determined by the client's actual
drawn frames and the two-hotspot pattern, bounded above by
`orbTurnsPerSecond`. Each accepted GPU draw advances the full-scale reference
by at most `orbMaxPatternStep / 2` revolutions; both shafts' advances receive
the same reduction. One pattern pitch is half a revolution, independent of
the rotor's blade count. At steady cadence and normal simulation speed, the
resulting limit is `min(requested rev/s, drawn FPS × max pattern step / 2)`.
The default 0.45-pitch limit allows 13.5 rev/s at 60 FPS and 27 rev/s at
120 FPS, so the requested 2 rev/s ceiling applies at both cadences. A shaft at
99% therefore turns at 1.98 rev/s, preserving N1/N2 speed proportions. At
5 FPS the pattern limit reduces the shared maximum to 1.125 rev/s. The Engine
tab reports the last submitted motion cadence, effective maximum speed and why
it is limited.
Each client derives its own limit from its submitted frames.

Each blade has a fixed brightness given by
`0.65 + 0.35 × cos(2 × rotor-local blade angle)`. This makes two opposite
hotspots attached to the shaft. A blade's brightness does not change as it
rotates; its hue, size and opacity remain constant too. The hotspots form the
low-frequency shaft cue. The map covers the full 360° circle and is sampled
at each blade's fixed rotor-local angle. With an odd blade count, a hotspot's
maximum can fall between neighboring blades; exact opposite blade pairs are
unnecessary and the represented blade count is unchanged. The C172's two opposite propeller markers themselves
repeat twice per turn and both receive full brightness.

While the aircraft's native afterburner state is confirmed active, both blade
rows use the same accent as its throttle indicator and exhaust optical profile.
The F135 profile supplies `#ff9450`; the renderer does not choose an aircraft
palette. This state change preserves every blade's fixed relative brightness,
size and opacity. Off, inhibited or unavailable afterburner state restores the
normal row colors. The monitor shares the aircraft visuals' cached observation,
so coloring requires no additional JSBSim reads. The active accent travels to
the phone as optional `afterburnerColor`; its absence retains normal colors.

The hotspot pattern becomes directionally ambiguous at half a pattern pitch
per frame. The configurable limit stays strictly below that boundary for every
submitted frame, including a frame following a stall. Skipped draws do not
advance the visible reference, and any excess advance at the next drawn frame
is discarded rather than caught up later. This guards the two-hotspot cue;
individual evenly spaced blade markers can still alias or appear to reverse.
The application cannot observe compositor-dropped frames, so the submitted-frame
limit is not a guarantee about every frame the physical display presents.

The desktop reuses the globe's WebGPU device when present, with WebGL2 then
WebGL1 fallback. The small transparent surface draws the dots in one draw call;
text and ring layout remain ordinary accessible DOM. A shared aircraft instrument
animation controller runs the shaft canvas independently of the globe's render
cadence on both desktop and phone. It interpolates only simulation time already
received, over the source sample's wall-clock interval on desktop or one 50 ms
heartbeat on the phone. It never reads JSBSim, updates text or requests a globe
frame from that animation loop. Duplicate fixed-step timestamps preserve ongoing
playback; pause, hidden/offscreen state, disabled rendering, zero shaft speed,
and reaching the last received sample stop the loop. Rewinds rebase motion.
Numeric readouts and engine detail cells write only changed displayed values;
their refresh checks are independent of shaft drawing. This architecture and
the correctness checks do not establish a device performance qualification.

The [afterburner-accent record](../../validation/evidence/hud/engine-orb-afterburner-2026-10-06/acceptance.json)
verifies color activation and removal on desktop and phone, with no extra native
reads. All three GPU backends preserve blade geometry and opacity through a
color change and restore the normal palette afterwards. Full CI passed 1734
tests and one expected failure.

The [two-hotspot validation record](../../validation/evidence/hud/engine-orb-hotspots-2026-10-06/acceptance.json)
and [native-size preview](../../validation/evidence/hud/engine-orb-hotspots-2026-10-06/hotspots.png)
cover all three aircraft plus synthetic 23/37-blade rings on WebGPU, WebGL2
and WebGL1. All 12 checks recover the exact counts, fixed per-blade brightness,
unchanged sizes and radii, and forward hotspot motion under a synthetic frame
limit. Full CI passed 162 files, 1725 tests and one expected failure. These
checks validate the even/odd mapping and submitted-frame limit, not sustained
refresh performance.

The historical [independent-cadence record](../../validation/evidence/hud/engine-orb-cadence-2026-10-05/acceptance.json)
retains deterministic tests for 60/120/144/240 Hz delivery, slower model sampling,
pause and visibility lifecycles, and unchanged DOM. Full CI passed 162 files,
1709 tests and one expected failure. These checks do not measure a particular
device's delivered refresh rate under load. That record predates the per-draw
pattern-step limit; its independent animation loop remains in use.

The historical [uniform-marker check](../../validation/evidence/hud/engine-orb-uniform-2026-10-05/acceptance.json)
and [uniform preview](../../validation/evidence/hud/engine-orb-uniform-2026-10-05/uniform-blades.png)
verify constant color and brightness across every blade and two rotation
phases, with the same counts and marker sizes, on all three backends. The
maximum measured interior RGB variation was one byte value from canvas
rounding. The uniform appearance and unrestricted speed scaling in that record
have been superseded by the pattern of two fixed hotspots and the client-dependent
pattern-step limit.

The historical [speed correction record](../../validation/evidence/hud/engine-orb-speed-2026-10-05/acceptance.json)
verifies direct speed scaling at 99%, independence from drawing cadence, and
the rotating brightness cue on all three backends. Nine aircraft/backend
checks recovered the correct blade counts at both phases and measured the
brightness direction within 0.00049 radians of its expected advance. Related
tests passed 52 files / 652 tests; full CI passed 160 files with 1684 passing
tests and one expected failure. Its [preview](../../validation/evidence/hud/engine-orb-speed-2026-10-05/blade-speed-cue.png)
shows the brightness cue subsequently removed at the user's request. The
direct speed scaling in that historical record has also been superseded.

The prior [blade-marker acceptance record](../../validation/evidence/hud/engine-blade-markers-2026-10-05/acceptance.json)
retains source hashes, nine backend/aircraft pixel-count checks and the
[earlier preview](../../validation/evidence/hud/engine-blade-markers-2026-10-05/blade-markers.png).
Every requested count was recovered from the rendered pixels in WebGPU,
WebGL2 and WebGL1, and marker areas within each ring stayed within 15% at the
enlarged validation size. The actual 68px HUD was visually inspected separately.
Related checks passed 73 files / 886 tests, plus typecheck, lint, production
build and artifact verification. The one full-suite run caught an unrelated,
concurrently added Aircraft-panel test fixture; its cause and follow-up are
preserved in the record. After its redundant tab click was removed, that file
passed all 51 tests. The [earlier two-marker record](../../validation/evidence/hud/engine-orbs-2026-10-05/acceptance.json)
describes the superseded presentation. Lifecycle tests cover fallback, context
loss, cleanup, draw limits, missing counts, hidden/static frames and pause;
native integration covers the C172 with unrelated N1/N2 nodes present.
The phone does not import the full aircraft
settings catalog for defaults: an older host without orb settings keeps a
numeric-only display and allocates no graphics backend for it.

### Controls

**Automatic flaps (2026-10-05).** `osfs.assist.autoFlaps` is on by default for
every aircraft, with its home in Aircraft → Assists. The FLAPS Auto button edits
that same saved value. The slider and percentage observe physical native flap
travel, including the F-35B's negative reflex position, rather than displaying
an unused manual demand. Dragging leaves the handle under the pilot's finger;
the percentage continues to report the actuator. Slider, keyboard, controller
or phone flap commands take manual ownership. Turning Auto off without moving
a control starts from the observed position. Autopilot flap ownership takes
precedence while engaged.
Feedback and input handoff do not count as flap commands: an unchanged phone
lever leaves Auto enabled even as the physical flaps move. While a focused
slider is being edited with the keyboard, it retains the requested position
(including while paused), and its percentage continues to show actual travel.
The Auto button distinguishes the saved request from current autopilot ownership.

The F-35B uses its existing native airspeed/Mach schedule through the independent
`fcs/flaps-auto-enabled` switch. This does not change the selected flight control
law. The C172 and SF50 use an explicitly simulated pilot assist from declarative
`FdmProfile.automaticFlaps` data; their real aircraft are not claimed to have
this feature. The assist interpolates approach commands, caps them at the
takeoff configuration during high-power/climb or gear-up operation, retracts
through the declared takeoff speed band, and retains landing flap through a
low-power ground rollout. Native actuators still determine the actual motion;
this is not an overspeed protection guarantee.

The C172P curve reaches at most 10° by 80 KIAS and retracts by 105 KIAS. Its
published limits are 110 KIAS at 10° and 85 KIAS beyond 10° in the
[manufacturer's POH, section 2](https://www.glasscockpitaviation.com/wp-content/uploads/2022/07/cessna-n54829-poh.pdf).
The SF50 curve reaches at most half flap by 140 KIAS and retracts by 180 KIAS;
its half/full limits are 190/150 KIAS in the
[manufacturer's AFM, section 2](https://flightsimcoach.com/wp-content/uploads/2020/12/SF50-POH.pdf).
The interpolation points and 70% high-power threshold are conservative simulator
assist choices, not manufacturer automatic-control schedules. SF50 variants
share this assist; variant-specific automatic flap behavior is not asserted.

| Parameter | Unit | Today |
| --- | --- | --- |
| `osfs.input.gamepadSmoothing` | 1/s | 8 (`GAMEPAD_SMOOTHING_RATE`) |
| `osfs.input.stickDeadzone` | ratio | 0.08 (`PROFILE_STICK_DEADZONE`) |
| `osfs.input.takeoverDeadband` | ratio | 0.12 |
| `osfs.input.throttleRate` | full travel per s | 0.5 |
| `osfs.input.initialThrottle` | ratio | 0.65 |
| `osfs.input.touchWheelCooldown` | ms | 180 |
| Keyboard stick, gamepad response, polling rate, orbit invert | various | Exist, saved |

### Camera (Aircraft → Camera)

| Parameter | Unit | Today |
| --- | --- | --- |
| `osfs.camera.orbitPitchLimits` | range, deg | −60° … +81° |
| `osfs.camera.orbitReturnTime` | s | 0.45 |
| `osfs.camera.orbitRestoreYaw` | deg | 0 |
| `osfs.camera.chaseDistance` / `.chaseHeight` | m | Per aircraft, in the aircraft catalog |
| `osfs.camera.fieldOfView` | deg | Inherited from the globe camera |
| Phone camera tuning | various | Exists (`osfs.phone-camera-tuning`) |

### Start

| Parameter | Unit | Today |
| --- | --- | --- |
| `osfs.start.location` | lat, lon | Minneapolis (44.9778, −93.2650) |
| `osfs.start.heightAboveGround` | m | 1,524 (5,000 ft) |
| `osfs.start.resume` | on/off | On: a new session resumes the last saved flight |
| `osfs.start.saveInterval` | s | 5 |

### Aircraft → Assists

| Parameter | Unit | Today |
| --- | --- | --- |
| `osfs.assist.autoTrim` / `.autoRollTrim` | switch | Exist, saved |
| `osfs.assist.trimMaxRate` | per s | 0.35 |
| `osfs.assist.trimDeadband` | ratio | 0.05 |
| `osfs.assist.trimFilter` | s | 0.08 |
| `osfs.assist.trimAuthority` | psf of dynamic pressure | 20 |
| `osfs.assist.trimMinAirspeed` | ft/s | 80 |

These are engineering gains; they appear only under **Show all parameters**.

### Feedback (Controls → Feedback)

| Parameter | Unit | Today |
| --- | --- | --- |
| `osfs.feedback.hapticInterval` / `.maxDuration` | ms | 50 / 60 |
| `osfs.feedback.minMagnitude` | ratio | 0.03 |
| `osfs.feedback.touchdownReference` / `.slipReference` | N·s / J | 300 / 1,200 |

### Remote Control → Who flies

| Parameter | Unit | Default |
| --- | --- | --- |
| `osfs.remote.handover` | choice | Automatically (`auto`); also `stay`, `phone`, `computer` |
| `osfs.remote.returnIdle` | s | 1 |

How control passes between a paired phone and this computer. Before these
existed, every hand-back needed the phone's pilot to tap Take control, which is
now **Only when taken**. Spec: [Phone controller](phone-controller.md) →
*Sharing the controls*.

### Aircraft → Ground handling

Ground interaction already follows this spec's model: presets that show their
fields, lockable fields, named profiles, export and import. It is the pattern
the rest should copy. Only its home changes.

### Sound

The sound tiers (Off, Low, Med, High) are different synthesis engines with
different qualification status, not three settings of one engine, so they stay
a discrete choice ([sound spec](../sound.md)). The parameters inside each tier
that trade quality for work (oscillator and grain counts, impulse-response
length, internal sample rate) are defined in that spec and join the registry
under `osfs.sound.*`.

The same Sound section holds continuous, live, persistent listening controls:

| Parameter | Unit | Bounds / default |
| --- | --- | --- |
| `osfs.sound.masterVolume` | mix amplitude ratio, shown as % | 0–8 / 2 (0–800%, default 200% of the previous master maximum) |
| `osfs.sound.engineVolume` | amplitude ratio, shown as % | 0–8 / 0.8 (0–800%, default 80%) |
| `osfs.sound.afterburnerVolume` | extra-roar gain ratio, shown as % | 0–1 / 0.5 (default 50%; 100% is the previous extra-roar gain) |
| `osfs.sound.listenerCockpitBlend` | acoustic-viewpoint blend | 0–1 / 1 (Camera 0, Cockpit 1; default Cockpit) |

Master gain uses the old maximum of 1 as its reference; its default is now 2
and maximum 8. Existing saved values keep their level until changed or reset.
Engine boost preserves existing saved gains and also scales the engine's
afterburner component; the separate afterburner control can reduce its extra
roar. A zero extra-roar gain retains native augmented spectrum and thrust
response. Camera–Cockpit positions blend listener geometry, motion and
cabin/exterior treatment; intermediate viewpoints are artistic. The visual
camera remains independently controlled. These settings have no second home
under Camera or Controls. Integrated software checks for this 2026-10-05 follow-up
pass; see the [sound ledger](../validation/audio-implementation-ledger.md#163-pilot-sound-controls-2026-10-05-follow-up).

## Presets

0sfs adds flight presets that combine its own parameters with FOSS Earth's, for
example **Low and slow sightseeing** (Around the aircraft at a large radius,
finest imagery) and **Fast jet** (View focus, smaller budgets per second of
flight, a coarser Flight minimum). They are JSON files in `src/flight/presets/`
and behave exactly as the FOSS Earth spec describes: visible values, one-time
copy, "Custom" after any edit.

## Migration

| Today | Becomes |
| --- | --- |
| `osfs.flight-terrain-requirement` | `osfs.flight.minimum` |
| `osfs.terrain-detail-anchor` | FOSS Earth `map.focus.refineFrom` |
| `osfs.attitude-renderer` | `osfs.renderer.attitudeIndicator` (Renderer → Instruments) |
| `osfs.arcade-ground-launches`, `osfs.ground-interaction.v1`, `-profiles.v1` | `osfs.ground.*` (Aircraft → Ground handling) |
| `osfs.auto-trim`, `osfs.auto-roll-trim` | `osfs.assist.*` |
| `osfs.keyboard-stick`, `osfs.gamepad-response`, `osfs.gamepad-polling-rate`, `osfs.orbit-invert` | `osfs.input.*` |
| `osfs.phone-camera-tuning` | `osfs.camera.phone.*` |
| `osfs.audio.settings.v1`, `osfs.autopilot.v1`, `osfs.engineMonitor.v1` | `osfs.sound.*`, `osfs.autopilot.*`, `osfs.engineMonitor.*` |
| `osfs.aircraft`, `-lod`, `-generation`, `-opt-in-lods` | `osfs.aircraft.*` |

## Acceptance

- The flight panel's own Settings tab is gone; each moved section appears once,
  in its new home, and existing saved values survive the move. The shared
  Settings tab holds only Presets and Saved settings.
- The Flight minimum is a red marker on the Map → Detail Google track, draggable,
  saved, and shown on the HUD rail while a hold is active.
- With **Around the aircraft**, orbiting the chase camera through 360° at a fixed
  aircraft position makes no new tile or image requests after settling, on
  Google and on a 2D basemap, recorded by a headless flight check.
- Every constant in the tables above is a registry parameter with its unit,
  bounds and default, reachable under **Show all parameters**.

## Sequence

Follows FOSS Earth's sequence: stage 1 (registry) moves these sections and
removes the Settings tab; the host-marker API and the Flight minimum marker come
with it; the focus point registration comes with FOSS Earth's detail focus
stage; the remaining parameters follow with FOSS Earth's stage 5.

## Implementation

### Stage 1 (2026-09-25)

Done with FOSS Earth's stage 1 (the registry, its section UI and host markers):

- 115 parameters are declared in `src/flight/settings/flightParameters.ts`, the
  only place a flight default is written. `registerFlightSettings.ts` adds them
  to the app registry with their section titles and source links, and
  `flightMigrations.ts` moves every key in [Migration](#migration) into it once,
  leaving the old keys for rollback. Code reads values through a
  `FlightParameterStore`; `flightParameterDefaults()` is the catalogue in memory,
  for tests.
- The Settings tab is gone. Every 0sfs section is drawn with FOSS Earth's
  `createParameterSection`, so each parameter is reachable under **Show all
  parameters** with its unit, bounds, default, provenance and source.
- The Flight minimum is a red, draggable requirement marker on the Map → Detail
  Google track, hollow while waived, and a tick on the HUD rail while a hold is
  active. **Allow coarser terrain for this session** is the session parameter
  `osfs.flight.allowCoarserThisSession`, drawn beside it.
- **Terrain detail follows** is FOSS Earth's `map.focus.refineFrom`; 0sfs sets
  its default to the focus point, which in a flight is the aircraft.
- A map switch made anywhere (the Map tab, Show all parameters, an import)
  prepares the terrain again when it changes the ground under the aircraft.
- Whole-record export, import and reset are in Debug → Saved settings.
- The sound tiers' internal caps are `osfs.sound.<tier>.*`: engine partials and
  noise bands, the cabin impulse response, and High's grains and grain starts.
  They can only lower a tier below its budget, and shedding works down from
  them. The internal sample rate is not one: half-rate synthesis is not wired up.

Where it differs from the tables above, from what the code turned out to do:

- `osfs.input.initialThrottle` is `osfs.start.throttle` in Aircraft → Start. The
  start throttle is set in JSBSim at bootstrap from the aircraft's profile
  (0.65 for the Cessna 172, 0.35 for the SF50), which sets it as the default.
- `osfs.start.location` is `osfs.start.latitude` and `.longitude`. The start
  heading (300°) and airspeed (120 kt) were hidden in the same place and joined
  them.
- The chase offset was not per aircraft: one offset, 14 m behind and 2.2 m up.
  The field of view was 1.05 rad on both flight cameras, not the globe's. The
  chase zoom limits (8–500 m) and the gamepad orbit rates (1.5 and 1.15 rad/s)
  were in the same code and joined `osfs.camera.*`.
- The 0.05 listed as `osfs.assist.trimDeadband` is the stick deflection at which
  the autopilot yields an axis: `osfs.autopilot.stickOverride`. The trim's own
  deadband is 0.04 rad/s² of leftover acceleration, now `.trimDeadband`, and its
  gain (1.25 per s) joined as `.trimGain`. `.trimMinAirspeed` is the floor of the
  damping estimate, not a speed below which trim stops.
- Orbit inversion had already moved to FOSS Earth: it is `input.orbit.*`, drawn
  in Controls → Orbit beside `osfs.input.touchWheelCooldown`.
- Phone camera tuning is `osfs.camera.phone.*` in Remote Control, with the
  buffer, catch-up and prediction continuous instead of lists. The chase frame
  changes every chase view, so it is `osfs.camera.chaseFrame` in Aircraft →
  Camera.
- The gamepad polling rate is a number (10–240 Hz) with Every frame as a named
  value, not four choices.
- Which engine sections are open stays in `osfs.engineMonitor.v1`, as FOSS
  Earth keeps `foss-earth.panelSectionsOpen`: it is the panel's memory, not a
  setting. The fuel flow unit is `osfs.engineMonitor.fuelFlowUnit`.
- Named ground profiles stay in `osfs.ground-interaction-profiles.v1` until the
  registry's presets can hold them; the ground values are `osfs.ground.*`.

### Detail around the aircraft (2026-09-26)

Done with FOSS Earth's detail focus stage (its stage 3):

- The flight registers the aircraft with `runtime.registerFocusPoint` as
  `aircraft`, labelled Aircraft. Its position is the floating origin's in ECEF,
  which is the aircraft's. It is removed when the flight closes.
- `osfs.focus.default` is not a parameter. 0sfs sets the host default of FOSS
  Earth's `map.focus.point` to `aircraft`, and the pilot's choice is saved in
  `map.focus.point` itself, so a second parameter would only repeat it. Until
  the aircraft is registered, the default waits for its option and the orbit
  target is used. In a flight the orbit target is the simulation origin, which
  the floating origin keeps at the aircraft, so both load the same ground.
- **Load around** (`map.focus.mode`) defaults to View and aircraft in a
  flight: the ground under the aircraft is its collision surface, and the
  cockpit view does not look at it. On Google this keeps the mesh around the
  aircraft refined whichever way the camera looks. From FOSS Earth's stage 4,
  2D terrain is chosen by the view, so it would otherwise coarsen there too.
- The headless check is `scripts/validation/map-focus/check-focus-orbit.mjs`.
  At the default 10 km radius, with Around the aircraft one turn made no map
  request on either map. With View it made 280 requests on the 2D map and 148
  on Google ([evidence](../../validation/evidence/map-focus/orbit-2026-09-26/README.md)).
  The check found two FOSS Earth defects, fixed there before it passed:
  - Flights on Google started from −23,569 ft to 42,999 ft, because terrain
    preparation took coarse tiles as the ground. This predates the settings
    work and was fixed in `48ebc30` and `770ca40`.
  - Around on the 2D map loaded elevation tiles on a turn. Fixed in `c1841bb`.

### Presets (2026-09-26)

Done with FOSS Earth's preset stage (its stage 5):

- The flight's presets are `src/flight/presets/*.json`, listed after FOSS
  Earth's in Settings → Presets. There are six:
  - **Low and slow sightseeing**: Around the aircraft within 20 km, the finest
    detail on each map, a 512 MiB imagery budget, and a start 1,000 ft above
    the ground at 80 kt.
  - **Fast jet**: View only, coarser detail on each map, and a Flight minimum
    of 16,384 px.
  - **Ground: Minimal** and **Ground: Landing feedback**, the two ground
    profiles that can run today. Ground handling and Rough terrain need coupled
    rigid wheels and footprint contact, which are not implemented. The old
    dropdown showed them disabled, and they come back as presets when those
    choices run.
  - **Phone camera: original** and **Phone camera: recommended**, which
    replace the two buttons in Remote Control.
- The ground panel's Profile dropdown and Named profiles are gone. The
  section's status line says which preset it matches, and **Save as preset**
  keeps a mix. Named profiles saved before are moved once into presets of the
  pilot's, with every `osfs.ground.*` value each held; the old key stays for
  rollback. For that move, and for bringing an exported preset back, FOSS
  Earth gained `importPreset` and **Import a preset…** (`70beeb3`).
- The pilot chose where presets live: FOSS Earth's shared Settings tab, with
  only Presets and Saved settings, which moved there from Debug. The tab the
  proposal removed held unrelated settings with no other home; this one holds
  what spans every tab. An Interface tab now holds FOSS Earth's Log and Search
  sections, which the flight uses as the globe does. The globe's toolbar and
  theme are not the flight's, so they are left out.
- A test checks that the app takes every value in every flight preset, and
  that a fresh flight matches Ground: Minimal and Phone camera: original.

### Resuming the last flight (2026-10-05)

Every session used to start at the start position, so a reload or a change of
aircraft undid the flight in progress.

- The flight is saved to browser storage (`osfs.saved-flight.v1`, about 2 KB):
  every `osfs.start.saveInterval` seconds of flight, on pause, after a
  placement, and when the page is hidden or left. A faulted or loading flight
  is not saved; the previous save stands. The record is the fixed-step loop's
  recovery snapshot (position, attitude, velocities, controls, fuel, engine)
  with the aircraft, the pause and the height above the ground
  (`src/flight/jsbsim/savedFlight.ts`).
- With `osfs.start.resume` on, a new session prepares the ground under the
  saved flight, puts the aircraft back at its saved height above that ground
  (so a parked aircraft stays parked when the map's ground differs), and
  starts paused if it was saved paused. Another aircraft takes the position
  and motion but keeps its own controls and engine. The saved wind is not
  restored, because the Weather tab starts calm every session.
- A start position in the page address (`?set.osfs.start.latitude=…`) wins
  over the saved flight. Turning resuming off forgets the saved flight.
  Aircraft → Start says when the flight was last saved and where, and
  **Start a new flight** discards it and reloads at the start position.
- Pause also works while the flight loads. Until the simulator exists, the
  starting bindings (P, and the controller's Start button) choose whether the
  flight starts paused, and a log line says which. Once the HUD exists, its
  pause button is the one control the loading hold leaves usable.

## TODO: custom flight instruments and world-space cues

Requested 2026-10-05; deliberately deferred to a fresh conversation after the
F-35B work. Owner: 0sfs, because these controls and cues need an aircraft.

- [ ] Add a flight UI customization section with saved, independent choices
  for which instruments and flight controls are shown.
- [ ] Allow the attitude-indicator joystick to be disabled or hidden, keeping
  keyboard, gamepad and other flight controls usable. Decide separately whether
  its attitude display remains visible when its steering interaction is off.
- [ ] Offer prograde, retrograde, normal, anti-normal, radial-in and radial-out
  indicators projected into the actual flight view, together with pitch and
  heading cues, as an alternative to relying on the attitude instrument.
- [ ] Define cockpit/chase behaviour, off-screen and undefined-vector handling,
  readable cue placement, and pointer pass-through before implementing them.

Start from `src/flight/hud/flightHud.ts` and the marker definitions in
`src/flight/hud/attitudeIndicator.ts`. Project through the active flight camera
and respect floating-origin changes. Each setting has one home and uses the
existing settings registry; turning a feature off stops its own drawing and
work. Verify that hiding the joystick leaves all other levers accessible and
that world-space cues follow the flight vector through camera changes, without
intercepting aircraft or camera input. None of this TODO is implemented by the
F-35B sound, gear or VTOL-slider changes.

## TODO: hold the idle throttle handle to stop or start the engine

Requested 2026-10-05; deferred to a fresh conversation. Owner: 0sfs flight
controls and engine lifecycle. At **0% throttle**, hovering over the slider
handle should expose a press-and-hold start/stop action. Draw a completing
circle around that handle: **black while commanding shutdown**, **blue while
commanding restart**. Complete the command only when the hold completes;
release or cancellation must leave the engine unchanged.

- [ ] Define the hold duration as a visible parameter in seconds, together
  with pointer, touch and keyboard access and a cancel path.
- [ ] Keep normal throttle dragging usable; distinguish handle holding from
  moving the slider. Do not shut down merely because throttle reaches idle.
- [ ] Use the selected aircraft's real cutoff/starter sequence and observe
  native engine state. Separate completion of the gesture from completion of
  engine spool-down or startup; expose unavailable or failed starts clearly.
- [ ] Test incomplete holds, dragging, blur/cancellation, repeat commands,
  paused/reset state, and different supported engine types.

Start from `src/flight/hud/flightHud.ts` and the backend's engine-control API.
This gesture and its progress circle are not implemented in the current pass.
## Aircraft mesh inspection

Aircraft → Mesh inspector contains the live **Show polygon edges** switch
(`osfs.aircraft.wireframe`, default off). Its mesh tree selects the loaded model's
parts for orange triangle-edge highlights; selection does not hide geometry.
Selection is local to the loaded model and resets on replacement, while the
global switch is saved. [Aircraft assets](../aircraft-assets.md#inspecting-the-mesh)
describes the rendering and resource lifecycle.

## Aircraft control law

The F-35B exposes Aircraft → Flight controls → Aircraft control law, saved as
`osfs.aircraft.controlLaw`. Auto selects the aircraft's native default (currently
fly-by-wire for the F-35B); Manual bypasses its pitch, roll and yaw stabilization;
Fly-by-wire explicitly enables it. Manual retains the physical actuator limits,
trim and VTOL conversion. The setting displays the observed active law, which
can lag a new request while physics is paused. Other aircraft do not expose a
selector or acquire synthetic FCS properties.

This choice controls the aircraft's native law. Autopilot and the visible input
and auto-trim assists remain independently configured. The prototype laws are
experimental; these modes do not reproduce a real F-35 cockpit control selector.
