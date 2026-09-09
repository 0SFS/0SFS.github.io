# Ground Contact

How the simulator decides where the ground is, what it does when it cannot tell,
and why the aircraft stands where it does.

## The problem

JSBSim computes gear forces against a ground plane it is told about through one
property, `position/terrain-elevation-asl-ft`. The map, meanwhile, publishes a
surface made of whatever geometry is currently drawn — raster terrain tiles or
Google photorealistic 3D tiles. Connecting the two is not a matter of copying a
number across once per frame, because the map's answer changes for reasons that
have nothing to do with the aircraft: tiles refine, tiles unload, and
photogrammetry is noisy.

Everything in `src/flight/physics/terrainContact.ts` exists to make that
connection safe. The rules below were each written in response to a specific
failure, and the tests next to them pin those failures down.

## Where the aircraft stands

Dropped onto a known elevation and left to settle, the C172 flight model rests
with its reference point **1.33 m** above the ground, at a 2.5° nose-high stance
with 4–7 cm of oleo compression. That number is measured from the model, not
chosen, and it appears as `STATIC_STANCE_METERS` in `safeFlightState.ts`.

Everything that places the aircraft on the ground has to use it:

- `aircraftClearanceMeters()` returns exactly that stance when level, growing
  only for attitudes the gear does not hold the aircraft at. Its pitch term
  measures deviation *from the static stance*, not from level — absolute pitch
  adds 19 cm of float to an aircraft sitting on its own wheels.
- The visual model is dropped by the same distance (`modelOffset` in
  `aircraftCatalog.ts`), because the exported meshes put their origin on the
  ground between the wheels.

Getting this wrong is quietly awful. A placement target a few centimetres above
the settled stance leaves the gear extended; the aircraft sinks back onto its
springs; the next placement lifts it again. It reads as sinking into quicksand
and being teleported out.

## The gear model, and what it does not include

JSBSim's contacts are not naive point collisions. Measured from a rolling
takeoff run, each main gear reports:

| Modelled | Evidence at 41 kt |
| --- | --- |
| Rolling axis | `wheel-speed-fps` tracks ground speed |
| Slip angle | `slip-angle-deg` non-zero and responsive |
| Slip-dependent side force | `side_friction_coeff` varies with slip angle |
| Anisotropy | rolling friction 0.02 against static 0.8 |
| Oleo | spring 5400 lbs/ft, damper 1600, with compression velocity |
| Steering and brakes | 10° nose steer, left/right brake groups |

What is genuinely missing is **wheel angular state**. There is no wheel
rotational inertia, no spin-up drag at touchdown, no brake torque fighting that
inertia, and no lock-up or skid. Braking is an instantaneous friction
multiplier. `wheel-omega-radsec`, `wheel-slip-norm` and `brake-torque` do not
exist in this build.

Per-wheel ground heights are also out of reach. Every contact point queries one
ground callback, the WASM SDK binds no callback of ours, and the only terrain
property is that single scalar. Three wheels cannot be given three heights
without replacing the gear model outright.

## The ground a wheel rides on

Because the surface is sampled at a point and resampled every physics step,
photogrammetry noise of a few centimetres makes the whole ground plane twitch
under a parked or taxiing aircraft, and the oleos never stop ringing.

A real wheel does not follow that noise. It is a circle roughly 0.29 m in
radius, so it bridges anything shorter than its contact patch and climbs only
what it cannot bridge. `wheelGroundFilter.ts` reproduces that: the sampled
height is filtered over **distance travelled**, with the wheel radius as the
length constant.

- Distance, not time. A parked aircraft must not drift, and a fast taxi must not
  be over-smoothed.
- Steps taller than the wheel pass straight through. Those are kerbs and cliffs;
  smoothing one would drive the aircraft through it.
- It adds no raycasts. It filters the sample already being taken.

Raw samples still drive world-change detection. Only the question of where the
aircraft sits uses the ridden height.

## When the map cannot answer

`terrainContact.update()` returns `false` to mean "do not step at all". The
fixed-step loop then declines to integrate, which stops the aircraft dead
without raising a fault, so this is used as narrowly as possible.

| Situation | Behaviour |
| --- | --- |
| More than 500 m above the best known ground | Step normally. Terrain reaches the physics only through the gear; nothing up there can touch it. |
| Within gear range, no height ever established | Hold. JSBSim's terrain elevation is still unset, and stepping drops the aircraft toward a ground plane that is not there. |
| Within gear range, height established, Google tiles | Step. Google publishes only what is currently drawn, so single-frame misses are routine. |
| Within gear range, height established, raster | Hold. Raster has an independent coverage index; a miss means no surface is safe. |

Half a second of continuous misses counts as having flown somewhere the aircraft
could not see. The first sample found afterwards is trusted the way a fresh
placement is, because the aircraft may have crossed a hill it never saw and the
gear cannot resolve that penetration. One missed frame is not a blind stretch —
treating it as one repositioned parked aircraft off their own springs.

## Samples that are not believed

Two limits reject a sample outright, log it with the mesh id, revision and tile
quality, and carry the previous height for that frame:

- more than a kilometre above the aircraft, or
- more than a kilometre above the previous sample, taken half a metre earlier.

Neither is a refinement; both are a different piece of world. Only upward steps
are rejected — a surface that drops away cannot fire the gear springs, and
refusing one could strand the aircraft on a phantom floor.

This matters because of how the failure presents. JSBSim's gear force is
proportional to penetration depth, and its ground plane is horizontal. A surface
placed above a cruising aircraft fires all three springs straight up, and a few
hundred metres of penetration becomes tens of thousands of knots in one 120 Hz
step. The reported symptom is an airspeed in the tens of thousands with the
entire velocity vertical.

## Repositioning

The aircraft is moved onto the surface for three reasons only:

- **placement** — the first frame at a new location,
- **surface lifted through the aircraft** — a refinement raised the ground into
  a level aircraft,
- **resting aircraft followed the ground** — a refinement lowered the ground
  under an aircraft standing on it.

An aircraft that flew into a hill in full view of the surface is deep below it
too, and is deliberately left there: lifting it out would fly it through
terrain. That case ends in a physics fault, which is the intended outcome.

## Diagnosing a fault

The physics loop reports which guard tripped rather than that one did, and every
automatic state change leaves an entry in the event log (Debug tab, mirrored to
the console so it survives a reload).

A fault carries the contact state read *before* the restore rewinds it:
the terrain elevation the gear was given, height above it before and after the
step, and per-gear compression. The line that separates a gear-spring launch
from an aerodynamic divergence also appears on the centre-screen notice, because
that is the part someone reporting a problem can actually see.

Useful log entries when the ground behaves oddly:

- `First terrain height established` — the height, with coordinates.
- `Ignoring a surface sample …` — a rejected sample and the geometry it came from.
- `Flying without a measured surface` — the AGL at which the hold was skipped.
- `Repositioned onto the surface (…)` — which of the three causes fired.
