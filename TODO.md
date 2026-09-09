# foss-earth TODO


bugs

when hover over POI and move mouse into overlaid UI the tooltip remains active until the cursor goes over the map again. in other words it only clears the tooltip if the cursor is pointing elsewhere in the map, but if it is over UI it will not clear until the map layer is hovered over again. s

---

# flight sim

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

**Cirrus Vision Jet has no mesh.** It is selectable and falls back to the
placeholder blocks. `docs/creating-an-aircraft-model.md` is the guide for
building one.
