# Aircraft Assets

How aircraft meshes are authored, exported, and loaded into the simulator.

## Layout

```text
planes/Cessna_172/
├── tests/                          reference models (inputs, never modified)
└── agent_workspace/
    ├── scripts/                    generator, validator, renderer
    ├── measurements/               dimension sources and validation JSON
    ├── renders/                    canonical multi-view renders
    ├── exports/                    GLB output and the master .blend
    └── REPORT.md                   modelling decisions and known compromises

public/aircraft/<aircraft-id>/      meshes served to the browser, ours and
                                   any third-party ones the licence allows
src/flight/aircraft/
├── aircraftCatalog.ts              selectable airframes and their LOD meshes
├── createAircraftModel.ts          glTF loading and LOD swapping
└── createPlaceholderAircraft.ts    cameras, chase orbit, placeholder blocks
```

The Cessna 172 is generated procedurally rather than sculpted. `generate_c172.py`
builds the whole airframe from a table of measured cross-section stations, so a
dimension change is an edit to one number rather than a remodel.

## Coordinate conventions

This is the easiest thing to get wrong, because three conventions meet here.

| Frame | Nose | Up | Notes |
| --- | --- | --- | --- |
| Blender (authoring) | +Y | +Z | Blender's default glTF export orientation |
| glTF (on disk) | −Z | +Y | The standard glTF forward direction |
| Simulator body frame | +Z | +Y | +X is the **left** wing; see `ecefBridge.ts` |

The Babylon scene is right-handed (`scene.useRightHandedSystem = true`), so glTF
axes import unchanged and the asset arrives nose-first along −Z. The loader
applies a 180° yaw to line that up with the simulator's +Z nose.

That yaw is a rotation, not a mirror, so chirality is preserved and the
propeller twist stays correct. Mirroring would reverse it silently, which is
worth remembering if the transform is ever reworked.

## Ground offset

The exported meshes put their origin on the ground between the wheels. The
simulator holds the aircraft reference point `aircraftClearanceMeters()` above
the terrain — 1.33 m at level attitude, the stance the C172 gear actually
settles at — so the model is dropped by that amount to stand on the runway
rather than hover above it or sink into it.

That number is measured from the flight model rather than chosen, and the
physics uses the same one when it places the aircraft on the ground. If the two
disagree, a parked aircraft sinks onto its springs and is lifted off them again
on the next placement. See [docs/ground-contact.md](ground-contact.md).

If a newly added aircraft looks sunk or floating when parked, `modelOffset.y` in
`aircraftCatalog.ts` is the single value to adjust.

## Levels of detail

**A bigger number is a better mesh.** `lod0` is the silhouette and each step up
adds detail, up to `lod3`, the best procedural mesh an airframe has. That is the
direction the generators number their `--lod` argument in, the direction the
catalog ids run, and it is chosen for one reason: a ladder grows and shrinks at
the *bottom*, and numbering from the top means every such change renumbers every
level above it — which is a silent change to every asset path on disk and to
every `osfs.aircraft-lod` value already in somebody's browser.

The two airframes therefore agree on what `lod3` means without having to carry
the same number of levels. The C172 has four; the Vision Jet has three, because
its coarsest level is already cheap enough that a silhouette below it bought
nothing but a jet with no windscreen.

Each step down drops the cheapest-to-lose detail first: pane shape, then
cross-section resolution, then control-surface separation, then part separation.

Cessna 172:

| Level | Triangles | Vertices | Meshes | Intended range |
| --- | --- | --- | --- | --- |
| LOD3 | 1016 | 591 | 23 | Close / cockpit |
| LOD2 | 778 | 473 | 23 | Medium |
| LOD1 | 288 | 189 | 16 | Far |
| LOD0 | 130 | 105 | 2 | Distant silhouette |

Cirrus Vision Jet:

| Level | Triangles | Vertices | Meshes | Intended range |
| --- | --- | --- | --- | --- |
| LOD3 | 1384 | 797 | 26 | Close / cockpit |
| LOD2 | 856 | 480 | 19 | Medium |
| LOD1 | 442 | 254 | 12 | Far, and all the way out |

LOD3 and LOD2 of the C172 carry a `Propeller_Disc` swept from the blade sections
(140 and 100 triangles). It is never drawn at the same time as the blades, so the
cost is the larger of the two rather than the sum.

Every level keeps the features that make the aircraft recognisable — for the
C172, high wing with dihedral, both lift struts, tricycle gear, swept fin, dark
greenhouse, two-blade propeller; its LOD0 merges all static parts into a single
mesh so the whole aircraft is two draw-call groups.

**The glazing LAYOUT is one of those features.** The Vision Jet's far level used
to paint its windows on as one band down each side and no windscreen at all, and
what that reads as at 200 m is not a cheap Vision Jet, it is a white dart. Its
LOD1 now cuts the windscreen and the three cabin windows as real panes for
about 200 extra triangles, and it is the change that made the far level look
like the aeroplane.

Every C172 level validates at exactly 10.998 × 8.280 × 2.718 m and every Vision
Jet level at 11.796 × 9.357 × 3.322 m, wheels on `z = 0`, four or five materials
and no textures.

The UI exposes an `Auto` mode that picks a level from the chase-camera distance
using each level's `autoFromMeters` threshold, and it only reloads when the
chosen level actually changes.

## More than one artist per airframe

A ladder is per airframe and its array is ordered finest first — the opposite
of the way the levels are numbered, because that is the order `selectAutoLod`
walks and the order the panel offers. Its rungs need not all come from the same
place, so **the credit belongs to the level, not to the
airframe**. `AircraftModelCredit` carries the artist, a line on what the mesh is
for, and — for anything not ours — the licence and a link back. The panel shows
one line per artist in the ladder it is offering, which is how a CC-BY
obligation is met at the point of use rather than in a file nobody opens.

Our own meshes are credited to `felipegalin0`: measured reconstructions,
designed explicitly for max runtime speed.

### Levels the user has to switch on

A level marked `optIn` is off until asked for. That is for a mesh whose loading
is a decision rather than a default — a third-party asset with a licence to
honour, or one heavy enough that nobody should pay for it without choosing to.
While it is off it is neither listed in the panel nor reachable from `Auto`, and
a stored selection of one falls back to the finest level that *is* available
rather than leaving the aircraft invisible.

The Vision Jet has one: **HD, 7,294 triangles, by hilos run**, CC Attribution,
from Sketchfab. It sits above our LOD3 and covers the close range when it is
switched on, with our own LOD3 taking over at 40 m — so the 3.4 MB textured
mesh is never drawn at distance.

`selectAutoLod` has one rule that makes this work without rewriting thresholds
whenever the flag changes: **the finest level available always covers the close
range**, whatever its own `autoFromMeters` says. With HD on, LOD3 starts at its
own 40 m; with HD off, LOD3 is the finest there is and starts at the camera.

The choice persists to `localStorage` under `osfs.aircraft-opt-in-lods`.

## Runtime

`aircraftCatalog.ts` is a pure data module: airframes, their LOD meshes,
triangle counts, auto-switch distances, and the orientation and offset values
above. It has no Babylon dependency, which keeps it trivially testable.

`createAircraftModel.ts` owns loading. It pulls a level through an
`AssetContainer`, parents the result under the aircraft root, marks every mesh
non-pickable — the terrain probe and the chase camera both raycast the scene, so
a pickable aircraft would hit itself — and disposes the level it replaces. The
container loader is injectable so tests never touch the network.

`createPlaceholderAircraft.ts` keeps the cameras and chase-orbit behaviour and
exposes a `modelRoot` slot. The placeholder blocks are drawn only while no real
mesh is present, and the model follows the same cockpit/chase visibility rules.

Selections persist to `localStorage` under `osfs.aircraft`,
`osfs.aircraft-lod` and `osfs.aircraft-opt-in-lods`. OSFS reads the former
`flight-sim.*` keys as a migration fallback so existing local selections are
retained; the opt-in flag has no legacy key because nothing before it stored
one.

## Control surfaces and propeller

`aircraftAnimation.ts` drives the moving parts from JSBSim each tick. It finds
them by node name, so those names are an interface — see the list under
"Adding an aircraft" in `creating-an-aircraft-model.md`.

The exported nodes keep glTF's frame (+X starboard, +Y up, +Z aft), and every
node carries an identity rotation, so a spanwise hinge is local X, the rudder
hinge is local Y, and the propeller turns about local Z.

Deflection signs are taken from the c172p aero tables rather than assumed:

| Coefficient | Sign | Meaning |
| --- | --- | --- |
| `Cmde = -1.122 · elevator-pos-rad` | positive pitches nose down | positive is trailing edge down |
| `Clda = +0.229 · left-aileron-pos-rad` | positive rolls right | positive is trailing edge down |
| `Cndr = -0.043 · rudder-pos-rad` | positive yaws nose left | positive is trailing edge left |

The right aileron's FCS gain is already negated, so both ailerons share one
convention and each is read independently. A positive rotation about +X carries
the trailing edge downward, so the pitch, roll and flap surfaces map straight
through; a positive rotation about +Y carries it to starboard, so the rudder is
negated.

### Retractable landing gear

`LandingGear_Left`, `_Right` and `_Nose` are bound the same way as a control
surface, but from `gear/gear-cmd-norm` (1 down, 0 up) and through a quarter turn
rather than a few degrees. Each leg's node origin is on its retraction hinge and
its wheel — plus, on the main legs, its strut door — is a **child** of it, so one
rotation per leg carries the whole assembly. An airframe whose mesh has no such
nodes binds nothing and is unaffected.

`BayDoor_Nose_Left` and `_Right` are bound from the same gear position and travel
from the other end: the mesh always ships gear down, so the doors are exported
**open** and the runtime turns them shut as the gear comes up. They are not
children of anything — they hinge on the fuselage — and each carries its own
travel rather than the legs' quarter turn, because a door that stops at 90° has
swung through the skin. Only the finest level cuts the bay opening, so the
coarse ones ship no doors and bind none.

The legs and the doors do **not** move together. Each bound part carries the
slice of the gear cycle it moves in — legs 0 to 0.78, doors 0.62 to 1 — so
retracting, the leg is most of the way in before the doors shut over it, and
extending, the doors are open before the leg comes through. Reading the same two
windows backwards is what makes extension sequence correctly without a second
table. Driving both off the same fraction folds and closes at once, which looks
like the door passing through the leg.

`BayDoor_Main_Left` and `_Right` are the wing bay doors and are bound the same
way, on the mouth's outboard fore-aft edge. The Vision Jet's main wheels retract into the
wing root and stay visible from outside - no door covers a wheel - so what these
close is the leg bay beside it.

The transit is run by the rig, at a fixed 8 seconds end to end, rather than read
back from the flight model. `gear/gear-pos-norm` would be the right property and
is the one that never moves: it and `gear/gear-cmd-norm` are both plain FGFCS
properties, and what drives one from the other is a retraction system in the
aircraft config. The c172p — the flight model every airframe here still flies —
has fixed gear and no such system, so `gear-pos-norm` sits at 1 for ever
whatever the command is set to. That was measured against the wasm build, not
assumed. An unreadable property answers "down": gear that will not come up is a
better failure than gear that is not there on landing.

The lever itself is not part of `ControlSurfaceState`. That record is the
smoothed continuous axes — every field of it is gamepad-mapped, phone-synced and
range-checked on the wire — and the gear is a latching switch, owned by the
input manager the way the pause key is and passed to `applyFlightControls` as
its own argument. `G` toggles it, as does the gear button in the HUD's
instrument row; flaps retract moved off `G` to `R` to make room.

Because it is visual only, the gear does not change how the aircraft flies or
where it sits on the ground; raising it on the runway leaves the aeroplane
standing on an invisible stance. A retractable flight model would pick up the
same property with nothing here to change.

Engine RPM is read through a short list of the usual JSBSim property spellings,
keeping the first that answers. The propeller angle decreases over time because
a Lycoming turns clockwise seen from the cockpit and a positive rotation about
+Z reads anticlockwise from behind.

### The blurred disc

One instance of a general technique — **below the sampling limit draw the
object, above it draw its time-average over one rotation** — which
[docs/drawing-fast-rotation.md](drawing-fast-rotation.md) sets out once and the
rolling tyres use as well.

Past a certain speed the blades cannot be drawn honestly: they advance far
enough between frames that the image aliases into a strobe. The blades are then
hidden and a translucent disc is shown instead, which is also what a real
propeller looks like.

The switch is not a fixed RPM — it is the sampling limit for the display the
frame is actually being drawn on. A propeller's image repeats every
`2*PI / blades`, and reading a repeating signal needs two samples per repeat, so
the blades may advance at most half a repeat per frame:

```text
maxReadableRadPerSec = PI / blades / frameSeconds
```

For two blades at 60 fps that is 90° per frame, about **900 rpm** — below a
Cessna's idle, so in practice the disc is shown whenever the engine is running.
A 144 Hz display resolves proportionally more; a four-blade propeller aliases at
half the speed. The frame interval is smoothed and the threshold carries 20%
hysteresis so a propeller sitting on the boundary does not flicker.

Where the disc is resolvable, the mesh ships one **swept from the blade's own
sections** at build time, named `Propeller_Disc`. Its half-extent along the
thrust axis at each radius is how far the rotated section reaches,
`max(chord·sin(angle), thickness·cos(angle))`, so the result is a lens — thick at
the hub where the blade is coarse and twisted, thin at the tip where it is fine
and nearly flat. That stays correct when the disc is seen edge-on, which a flat
disc does not.

If a mesh ships no disc, the runtime builds a flat one sized from the
propeller's bounding box, so an airframe gets something usable without touching
its GLB. LOD1 and LOD0 take that path deliberately: at those distances the
propeller is a few pixels and the swept solid is not worth carrying.

Set `propellerBlades` in the catalog — `0` for a jet, which suppresses the disc
entirely.

Coarse levels merge the control surfaces into their panels and expose only the
propeller. The rig binds whatever it finds, so this needs no special handling.

### Rolling tyres

`Wheel_Left`, `_Right` and `_Nose` turn about their own local X — the axle —
from **ground speed over the tyre's radius**, and only while a gear unit carries
weight; airborne they hold whatever angle they stopped at rather than being
driven by an airspeed no wheel is touching. The radius is measured off each
node's bounding box, the same way the propeller disc sizes itself, so no
airframe has to declare it.

A bare tyre is rotationally symmetric and its rate of turn is invisible, so
every tyre carries a **white band** straight through its hub — across both
sidewalls and over the tread top and bottom. Past the sampling limit the tyre
shows the band **averaged over a turn** instead. The argument, shared with the
propeller disc, is [docs/drawing-fast-rotation.md](drawing-fast-rotation.md).

**Neither is geometry.** The tyre is the plain n-sided cylinder, and both
pictures are one texture on it, an atlas of two squares: the band on the left,
its rotational average on the right. The runtime blurs a tyre by moving that
texture's u offset half a width. Same mesh, same draw call, nothing hidden or
shown, and not one triangle or vertex more than a plain rubber tyre.

- The band looks the same every half turn, so it repeats **twice** per turn
  and aliases at `π / 2 / frameSeconds` — 15 rev/s at 60 fps, about 35 kt on a
  0.19 m tyre, more on a faster display. The frame interval is measured every
  frame whether or not the aircraft has a propeller.
- One decision covers every tyre, so the nose does not blur a frame before the
  mains; they share one material, so the texture could carry no other. 20%
  hysteresis, as for the propeller.
- The sharp tyre is held at u offset **1**, not 0 (the sampler repeats, so it is
  the same picture). At 0 the texture has no transform and Babylon compiles the
  material without one, and the first blur would recompile it in the middle
  of the take-off roll. `TYRE_SHARP_U` / `TYRE_BLURRED_U` in
  `aircraftAnimation.ts`.

The tyres come from `planes/shared/tyres.py`, which the C172 and the SF50 both
build from. Levels with fewer than six sides on a tyre get plain rubber, with
no texture and nothing to blur.

The first version of the blur was a **second copy of every tyre**, `WheelBlur_*`,
hidden until needed, like the propeller disc, plus extra edges cut into the tyre
for the band. That added 48 triangles a tyre to a model that draws one of the
two at a time, and more nodes and bytes to load, all to show a different
picture on the same shape. The propeller needs a second mesh because its average
is a different *shape*, a lens instead of blades. A tyre's average is the same
shape, so it only needs a different texture. Don't bring a twin back.

**The tyre is never collision geometry.** Ground contact is JSBSim's contact
points; the body probes are points; the collision and wheel-spin debug overlays
draw their own plain tyre outlines; and every mesh of the loaded aircraft is
made unpickable, so the terrain probe and the chase camera never hit it.
`createAircraftModel.test.ts` pins this. The visual model carries no physics
mesh either. If collision ever needs a tyre, it is its own plain cylinder
built from the radius and width, owned by the collision code, never read from
this model and never shipped inside it.

## When the simulation stops

Two different things stop the simulation, and they used to look identical from
the outside — the aircraft simply stopped moving.

**A physics fault** pauses it. The fixed-step loop raises one when a step fails,
leaves the flight envelope, moves more than 100 m in a single 120 Hz step, or
changes airspeed by more than 200 kt. It names the guard that tripped and the
values behind it.

**A missing terrain sample** is quieter. Within gear range of the ground the
loop declines to step at all rather than integrate against a height it cannot
measure, so nothing faults and nothing pauses; the aircraft just holds position.
Well above the ground the sample is not needed and the simulation carries on.

The full set of rules — when the loop holds, when a sample is not believed, and
when the aircraft is repositioned — is in
[docs/ground-contact.md](ground-contact.md).

Both now show a centre-screen notice — the fault in red with its reasons and a
Resume button, the terrain hold as a status that clears itself. Every automatic
transition is also written to the event log in the Debug tab and mirrored to the
console.

## Adding an aircraft

1. Export GLBs into `public/aircraft/<aircraft-id>/`, authored nose along +Y and
   up along +Z in Blender, with the origin on the ground below the CG.
2. Add an entry to `AIRCRAFT_CATALOG` with its levels, triangle counts,
   auto-switch distances, and a `credit` on every level. Mark any level
   `optIn` that should not load unless asked for.
3. Check the parked stance and adjust `modelOffset.y` if needed.

Adding a level by **someone else** needs three more things: its licence must
allow redistribution and be named in the `credit` alongside a link back; it
must be put into the export convention rather than dropped in as downloaded —
`planes/Cirrus_Vision_Jet/agent_workspace/scripts/prepare_third_party.py` does
that, and `compare_assets.py` next to it checks the result lands where our own
meshes land, because that failure is otherwise silent; and it wants `optIn`
unless it is as cheap and as correct as ours.

An airframe with an empty `lods` array is still selectable; it falls back to the
placeholder blocks and the panel explains why. That is a reasonable way to land
a catalog entry before its mesh exists.

## Regenerating the Cessna 172

The generator is reproducible and writes straight to wherever it is pointed:

```bash
blender -b --factory-startup \
  --python planes/Cessna_172/agent_workspace/scripts/generate_c172.py -- \
  --lod 3 \
  --blend planes/Cessna_172/agent_workspace/work/c172_lod3.blend \
  --glb public/aircraft/cessna-172/Cessna_172_LOD3.glb
```

Two companion scripts are worth knowing about:

- `validate_c172.py` reports dimensions against the published figures, triangle
  and vertex counts, materials, textures, degenerate faces, unapplied
  transforms, open boundary edges and left/right symmetry error, as JSON.
- `render_c172_views.py` renders ten fixed orthographic views and a contact
  sheet. The camera framing is fixed rather than fitted, so successive
  iterations can be compared directly.
- `verify_rig.py` checks an exported GLB against what the animation code
  assumes: that every moving part is present, carries an identity rotation, and
  has its pivot on its hinge line.

Update the triangle counts in `aircraftCatalog.ts` after regenerating; they are
shown in the UI.

## Modelling conventions

These come out of building the Cessna 172 and are worth following for any
airframe added later.

**Nothing renders that cannot be seen.** Geometry hidden behind other geometry
is wasted every frame. The glazing was first built as a shell of duplicated
faces offset 13 mm above the fuselage; that cost 40 duplicated triangles *and*
permanently occluded the 40 fuselage triangles beneath it. It is now a second
material index on the fuselage's own polygons: same draw-call count, no extra
vertices, nothing hidden.

**Reach for a material index before new geometry.** The windows, the cabin
posts, and the rounded glazing corners are all material assignment on faces that
already exist. A separate mesh would have cost geometry and bought nothing.

**A material is a colour *and* a specular level, and reusing one across
lighting situations bites.** The Vision Jet's windscreen post was first given
`SF50_Dark`, the near-black already used for tyres and the intake bore. Those
sit under the aircraft or deep inside a duct where their specular level never
shows; the post lies on the crown facing the sky, and at the same material it
rendered a light grey bar — *lighter than the glass it divides*, which is the
one thing it must not be. It got a material of its own at the glass's low
specular. If a new part reuses an existing material, check it in the lighting
that part actually lives in.

**Assign per triangle when a whole face is too coarse.** A quad is already two
triangles, so painting only one of them produces a diagonal edge for free. That
is how the windshield and rear-window corners are chamfered.

**Know when a cheap trick has a hidden constraint.** Putting a raked band in the
face diagonals locks its width to its rake offset, so a thin band can only ever
come out near-vertical. The rear cabin post needed an explicit cut to make width
and rake independent — which also removed a station and ended up cheaper.

**Choose ring angles deliberately.** Evenly spaced cross-section vertices put
nothing at the window sill or head, which is what forced the glazing into a
separate shell in the first place. Placing vertices where features actually fall
let the finest level drop from 12-point to 10-point rings with no visible loss.

**Leave the fuselage open where the wing closes it.** The cabin roof follows the
wing's lower surface across the wing chord, and the fuselage top is omitted
there. The one exception is the segment reaching the wing trailing edge, where
the wing thins to a knife edge and stops covering the opening.

## Known gaps

- The Cirrus Vision Jet has a mesh but no flight model of its own: it flies the
  C172's, so its parked stance is that aircraft's rather than an SF50's, and
  its V-tail does not move. See
  `planes/Cirrus_Vision_Jet/agent_workspace/REPORT.md`.
- The Cessna's LOD0 is 130 triangles against a 100 target. The remaining cuts are the lift
  struts, landing gear and glazing, which are what distinguish the airframe from
  a generic monoplane at any distance.
- The models carry no panel lines, antennas, door outlines or wheel fairings.
  They are faithful in structure and proportion, not detailed.
- The Vision Jet's opt-in HD level is **modelled gear-up**. It is right in
  flight and wrong parked: nothing is drawn under the belly, and the belly
  itself sits 0.67 m above the runway where our own meshes stand on their
  wheels. It is also 3% short on length once its span is set to the published
  figure, and its fuselage is up to 0.24 m wider than the drawing at the cabin.
  Those are the reasons it is an alternative rather than the default.

`planes/Cessna_172/agent_workspace/REPORT.md` records the measurement sources,
per-level statistics and the specific compromises behind the Cessna 172.
