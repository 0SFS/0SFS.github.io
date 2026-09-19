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

**No aircraft turns on wheel angular state.** The installed JSBSim (fork.7)
has the wheel spin degree of freedom from PR #1502: spin-up drag at touchdown,
and brakes that act as a torque on the wheel. A gear only gets it when it
declares both `wheel_radius` and `wheel_inertia`, and neither the SF50 nor the
C172 does, so braking is still an instantaneous friction multiplier. The 0sfs
wheel spin experiment (`docs/wheel-spin-experiment.md`) is sound and haptics
only and feeds no forces back. `docs/ground-contact.md` still describes the
engine as lacking this.

**Control surface deflection directions are unverified in flight.** Magnitudes
are verified against the aero tables and against real JSBSim output. If a
surface moves the wrong way, the fix is the `sign` field in `SURFACE_BINDINGS`
in `src/flight/aircraft/aircraftAnimation.ts`.

## build

**Give each JSBSim WASM build its own build number.** The build is not
reproducible: the same commit and toolchain give a different `jsbsim_wasm.wasm`
each time (`docs/jsbsim.md`), so the commit alone does not name a binary.
`dist/build-metadata.json` records the commit and content hashes but no time.
Stamp each build with a number that includes the date and time of the latest
commit. Every build of one commit shares that time, so add the build's own time
or a counter as well. The change belongs in JSBSim's `wasm/` build.

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

**Create SR20 and SR22 aircraft models.** Add dedicated SR20 and SR22 aircraft
variants with their own geometry, flight model tuning, gear/stance settings, and
visual setup, separate from the current C172 and Vision Jet work.

**Vision Jet generations share one development flight model.** G1, G2 and G3
load their own JSBSim packages (`sf50`, `sf50-g2`, `sf50-g3`) and the jet sits on
its own 1.12 m stance, but all three still fly G1-based development
aerodynamics, and G2+ runs the G2 package. See `developmentNote` in
`src/flight/aircraft/aircraftCatalog.ts` and the per-variant summaries in
`src/flight/aircraft/sf50Variants.ts`.

**The main gear linkage does not articulate.** LOD3 models the trailing link as
three members - forward leg, trailing arm, oleo - but as one rigid mesh under
one node. The oleo does not compress and the arm does not swing on its knee,
because each needs a node of its own and a runtime that can drive a chain
rather than a single rotation. It is a trailing link in shape only.

**Nothing stops the gear retracting on the ground.** The SF50 packages declare
retractable gear and run `gear/gear-cmd-norm` through an 8-second kinematic into
`gear/gear-pos-norm`, so the command now drives the physics: both JSBSim and
`src/flight/physics/groundContactClearance.ts` stop supporting a retractable
contact as soon as that position leaves the down stop at 0.99. But the gear
channel has no weight-on-wheels interlock, so `G` still raises the gear while
parked. The `gear/wow` tests in `sf50.xml` gate the stall warning and the stick
pusher only. The C172's gear is fixed and its position never moves, but `G` and
the HUD gear button still toggle the command and the button's own state.

**The Vision Jet's opt-in HD level has no landing gear.** hilos run's Sketchfab
model ships as the `hd` level, off by default. It is modelled gear-up, so
parked it hovers 0.67 m over the runway with nothing underneath — right in
flight, wrong on the ground. Either model a gear for it, hide it while the
aircraft is on the ground, or leave it as the flight-only option it is.
