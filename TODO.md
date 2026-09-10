# foss-earth TODO


bugs

when hover over POI and move mouse into overlaid UI the tooltip remains active until the cursor goes over the map again. in other words it only clears the tooltip if the cursor is pointing elsewhere in the map, but if it is over UI it will not clear until the map layer is hovered over again. s

---

# OSFS

## performance

**Frame rate drops close to the ground on approach.** Noticeable enough to
interfere with landing. Needs profiling before any fix — the plausible causes
pull in different directions:

- Google 3D Tiles refine hard near the surface; tile loading and mesh creation
  compete with the render loop exactly when the camera is low and moving.
- The terrain probe raycasts the scene (`scene.pickWithRay` in
  `foss-earth/src/terrain/surfaceQuery.ts`) once per physics step, 120 times a
  second, against every loaded tile mesh. Low altitude means more, finer meshes
  in range. This is the cheapest thing to test: sample at a lower rate and
  interpolate, and see whether the drop goes away.
- Chase camera at low altitude puts more geometry in frustum at full detail.

Measure first — Chrome performance profile plus the tile metrics already
exposed on `runtime.getTileMetrics()` — and record which of the three it is
before changing anything.

## flight model

**Wheels have no angular state.** JSBSim's gear models a rolling axis, slip
angle, a slip-dependent side force, oleo spring and damper, steering and brake
groups — but no wheel rotational inertia, no spin-up drag at touchdown, no brake
torque fighting that inertia, and no lock-up or skid. Braking is an
instantaneous friction multiplier. Adding a wheel layer means simulating omega
per gear and feeding it back through the friction coefficients. See
`docs/ground-contact.md`.

**Control surface deflection directions are unverified in flight.** Magnitudes
are verified against the aero tables and against real JSBSim output. If a
surface moves the wrong way, the fix is the `sign` field in `SURFACE_BINDINGS`
in `src/flight/aircraft/aircraftAnimation.ts`.

## map

**Root cause of the Google tiles ground fault is still unknown.** The simulator
now rejects a surface sample that lands more than a kilometre above the aircraft
or a kilometre above the previous sample, which stops the gear-spring launch it
used to cause. Why a sample lands there has not been established — the best
guess is tile geometry being picked before the tile group's transform settles
under the floating origin. When it happens, the Debug tab logs
`Ignoring a surface sample …` with the mesh id, revision and tile quality to
chase it with.

## aircraft

**Cirrus Vision Jet flies the C172's flight model.** The mesh is built and
wired in (1204 / 908 / 442 triangles, LOD3 down to LOD1), but the aerodynamics,
gear and stance are still the Cessna's, so the jet sits at the C172's 1.33 m
reference stance rather than its own.

**The main gear linkage does not articulate.** LOD3 models the trailing link as
three members - forward leg, trailing arm, oleo - but as one rigid mesh under
one node. The oleo does not compress and the arm does not swing on its knee,
because each needs a node of its own and a runtime that can drive a chain
rather than a single rotation. It is a trailing link in shape only.

**The retractable gear is visual only.** `L` raises and lowers it and the rig
runs an 8-second transit off `gear/gear-cmd-norm`, but nothing acts on that
command: the c172p has fixed gear and no retraction system, so
`gear/gear-pos-norm` never moves and neither does the drag, the stance or the
weight-on-wheels logic. So the gear can be raised while parked, which leaves the
aeroplane standing on an invisible stance. An SF50 flight model would pick up
the same property with no runtime change; until then, a weight-on-wheels
interlock would be the cheap half-measure.

**The Vision Jet's opt-in HD level has no landing gear.** hilos run's Sketchfab
model ships as the `hd` level, off by default. It is modelled gear-up, so
parked it hovers 0.67 m over the runway with nothing underneath — right in
flight, wrong on the ground. Either model a gear for it, hide it while the
aircraft is on the ground, or leave it as the flight-only option it is.

**The V-tail does not move.** `SURFACE_BINDINGS` turns one named node about one
fixed local axis, and a V-tail's two ruddervators are not a single rigid
rotation for either pitch or yaw. The mesh already exports
`Ruddervator_Left` / `Ruddervator_Right` with their origins on the real hinge
lines; the runtime needs two bindings with per-node axes and an
elevator-plus-rudder mix. `planes/Cirrus_Vision_Jet/agent_workspace/REPORT.md`
gives the exact change.
