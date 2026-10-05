# foss-earth TODO


bugs

when hover over POI and move mouse into overlaid UI the tooltip remains active until the cursor goes over the map again. in other words it only clears the tooltip if the cursor is pointing elsewhere in the map, but if it is over UI it will not clear until the map layer is hovered over again. s

---

# 0SFS

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

**Turbine initialization and restoration need an explicit state contract.**
The [implementation plan](docs/turbine-initialization/plan.md) starts with the
#1505/#1508 shut-off-engine regressions, then separates advancing, refreshing,
initializing and restoring a turbine. It covers shared calculations, completed
aircraft trim, real WASM and app recovery. Planned, not implemented; fork.7
still contains the known regression.

**No aircraft turns on wheel angular state.** The installed JSBSim (fork.7)
has the wheel spin degree of freedom from PR #1502: spin-up drag at touchdown,
and brakes that act as a torque on the wheel. A gear only gets it when it
declares both `wheel_radius` and `wheel_inertia`, and neither the SF50 nor the
C172 does, so braking is still an instantaneous friction multiplier. The 0sfs
wheel spin experiment (`docs/wheel-spin-experiment.md`) is sound and haptics
only and feeds no forces back. `docs/ground-contact.md` still describes the
engine as lacking this.

It shows on screen too: the tyres spin while touching the ground but stop dead
the moment they leave it, as if they had no inertia, and jump straight to full
speed at touchdown. `aircraftAnimation.ts` turns them at ground speed over
radius only while their gear carries weight, and holds the last angle
otherwise. Driving them from JSBSim's `wheel-spin-rad_sec` once a gear declares
the wheel DOF would give them spin-up and run-down.

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

## collision

**The collision overlay shows the C172's geometry on every aircraft.**
Debug → Collision geometry always draws `BODY_COLLISION_PROBES` and
`C172_GROUND_CONTACTS`, whatever aircraft is loaded
(`src/flight/diagnostics/createCollisionDebugOverlay.ts`). The jet's physics
sweeps `SF50_BODY_COLLISION_PROBES` instead (`bodyProbes` in
`createFlightSimApp.ts`), and the jet stands on its own package's three gear
contacts. The panel's legend counts are hard-coded. Its hint, "Shows the current
C172 physics geometry, including when a different visual aircraft is selected",
stopped being true when the jet got probes of its own. To fix:

- Hand the overlay the same probe array the physics gets.
- Read the ground contacts from the loaded package instead of a constant. The
  test that checks `C172_GROUND_CONTACTS` against `c172p.xml` shows the way.
- Count the legend from the data.
- Add a test that fails if the overlay and the physics ever read different
  arrays.

Do this first: it is how the generator below gets looked at.

**Collision geometry is written by hand for each aircraft.** The jet's six body
points were read off a three-view, and every other airframe gets five generic
ones. Nothing checks either list against the mesh. The jet's points are fixed
offsets from its empty CG, so they shift against the airframe as fuel moves
the CG. Every aircraft added means another list.

Plan: generate the points from the aircraft's mesh within a budget, as one file
that both the physics and the overlay read.
[docs/proposals/generated-collision-geometry.md](docs/proposals/generated-collision-geometry.md).
The C172 is out of scope until the jet's is done; then it is a matter of
running the script.

**The Vision Jet has no structure contacts.** Its packages (`sf50`, `sf50-g2`,
`sf50-g3`) declare only the three gear contacts. The C172's also declares a nose
skid, a tail skid and both wing tips. A jet whose wing tip or tail touches the
runway never reaches JSBSim's ground reactions. Only the swept body points see
it, and they answer with a rewind and a bounce, not a contact force with
friction. The proposal above generates these contacts from the mesh, and is
where to decide whether the packages take them.

## debug views

The rule for all of these comes from the collision overlay: a debug view draws
the numbers the simulation used this step, read from the same place. It never
draws a copy kept for drawing. Arrows, markers, labels and strip charts drawn
over the scene belong to FOSS Earth (its TODO.md, "Debug drawing"). The
flight's own views are listed here.

**An aero forces overlay, like KSP's.** Draw these as arrows:

- lift, drag and side force at the aerodynamic reference point (`AERORP`);
- thrust at each engine;
- weight at the CG;
- the net force;
- the three moments, as arcs.

Their scale is a setting in newtons per metre of arrow. Read the forces from
JSBSim's wind-axis forces (`forces/fwx-aero-lbs` and its siblings) and from
`propulsion/engine[i]/thrust-lbs`.

JSBSim has no parts, so KSP's arrow on each part would be invented here. The
honest split is per term. The SF50 package names 24 aerodynamic terms under
`aero/coefficient/*`, among them `CLalpha`, `CLflap`, `CD0`, `CDi` and
`CDgear`. A table beside the arrows gives each term's share this step. Where the
model has a term per surface, as the jet does for each ruddervator, that term
can be drawn at the surface.

**A JSBSim property browser.** It would let you:

- search the property tree and see live values;
- pin properties to a watch list and plot the pinned ones as strip charts;
- set a value. The change is marked as a change to the simulation, with the old
  value kept so it can be put back.

FlightGear has one. Nothing in 0SFS shows a property that no panel already
shows. The property source belongs here; the strip chart belongs to FOSS Earth.

**Time controls.** Pause, step one physics step (1/120 s), and slow motion at a
rate the user sets on a continuous control. Add a rewind of a few seconds, using
a ring of the snapshots `captureSimulation` takes (`safeFlightState.ts`);
nothing keeps a history of them today. Watching a touchdown or a collision at a
tenth of the speed is how the overlays become readable.

**Control surface labels.** Label each surface with its commanded and actual
deflection, with an arrow showing which way it should move. This closes
"Control surface deflection directions are unverified in flight" above, because
a wrong `sign` would show at once.

**Contact and collision events.** These views would show:

- at each gear contact, the force JSBSim applies (normal and friction), the
  compression and weight on wheels;
- at each body hit, the point, the normal, and the velocity before and after,
  left in the world for a while;
- the segment each body point swept this step;
- the surface samples terrain contact used, with `Ignoring a surface sample`
  events as markers where they happened. This feeds the ground fault under
  "map".

**Smaller ones:**

- the velocity vector, the relative wind with alpha and beta arcs, and the wind;
- a trail of the flight path, coloured by speed or load factor;
- mass and balance: the CG on its envelope, and the fuel in each tank;
- an opacity setting for the aircraft, so markers inside it read clearly;
- autopilot targets against actual values, with each controller's terms.

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

## branding

**A script that renders the 0SFS logo.** The logo is to be a rendering of a Vision Jet G3
climbing over the University of Minnesota campus, from a camera position the user has already
found. The script comes once the G3 model is finished. It needs a way to copy the current
camera state rather than typing it out by hand. That button belongs to FOSS Earth, since any
globe application wants to copy or share a view, and is on its TODO.md. The script and the
logo belong here.
