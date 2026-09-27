# Flight settings

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

### Controls

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
