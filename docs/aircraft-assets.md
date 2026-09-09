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

public/aircraft/<aircraft-id>/      meshes served to the browser
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
the terrain — 1.65 m at level attitude — so the model is dropped by that amount
to stand on the runway rather than hover above it.

If a newly added aircraft looks sunk or floating when parked, `modelOffset.y` in
`aircraftCatalog.ts` is the single value to adjust.

## Levels of detail

Four levels ship per aircraft. Each drops the cheapest-to-lose detail first:
cross-section resolution, then control-surface separation, then part separation.

| Level | Triangles | Vertices | Meshes | Intended range |
| --- | --- | --- | --- | --- |
| LOD0 | 876 | 507 | 22 | Close / cockpit |
| LOD1 | 678 | 413 | 22 | Medium |
| LOD2 | 288 | 189 | 16 | Far |
| LOD3 | 130 | 105 | 2 | Distant silhouette |

Every level keeps the features that make the aircraft recognisable — high wing
with dihedral, both lift struts, tricycle gear, swept fin, dark greenhouse,
two-blade propeller. LOD3 merges all static parts into a single mesh so the whole
aircraft is two draw-call groups.

All four validate at exactly 10.998 × 8.280 × 2.718 m with the wheels on `z = 0`,
four materials and no textures.

The UI exposes an `Auto` mode that picks a level from the chase-camera distance
using each level's `autoFromMeters` threshold, and it only reloads when the
chosen level actually changes.

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

Selections persist to `localStorage` under `flight-sim.aircraft` and
`flight-sim.aircraft-lod`.

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

Engine RPM is read through a short list of the usual JSBSim property spellings,
keeping the first that answers. The propeller angle decreases over time because
a Lycoming turns clockwise seen from the cockpit and a positive rotation about
+Z reads anticlockwise from behind. At cruise RPM the blades will alias badly at
60 fps; a blurred disc is the conventional fix and is not implemented.

Coarse levels merge the control surfaces into their panels and expose only the
propeller. The rig binds whatever it finds, so this needs no special handling.

## Adding an aircraft

1. Export GLBs into `public/aircraft/<aircraft-id>/`, authored nose along +Y and
   up along +Z in Blender.
2. Add an entry to `AIRCRAFT_CATALOG` with its levels, triangle counts, and
   auto-switch distances.
3. Check the parked stance and adjust `modelOffset.y` if needed.

An airframe with an empty `lods` array is still selectable; it falls back to the
placeholder blocks and the panel explains why. That is how the Cirrus Vision Jet
is currently wired.

## Regenerating the Cessna 172

The generator is reproducible and writes straight to wherever it is pointed:

```bash
blender -b --factory-startup \
  --python planes/Cessna_172/agent_workspace/scripts/generate_c172.py -- \
  --lod 0 \
  --blend planes/Cessna_172/agent_workspace/work/c172_lod0.blend \
  --glb public/aircraft/cessna-172/Cessna_172_LOD0.glb
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
let LOD0 drop from 12-point to 10-point rings with no visible loss.

**Leave the fuselage open where the wing closes it.** The cabin roof follows the
wing's lower surface across the wing chord, and the fuselage top is omitted
there. The one exception is the segment reaching the wing trailing edge, where
the wing thins to a knife edge and stops covering the opening.

## Known gaps

- The Cirrus Vision Jet has no mesh and no flight model of its own; selecting it
  swaps the visual placeholder only.
- LOD3 is 130 triangles against a 100 target. The remaining cuts are the lift
  struts, landing gear and glazing, which are what distinguish the airframe from
  a generic monoplane at any distance.
- The models carry no panel lines, antennas, door outlines or wheel fairings.
  They are faithful in structure and proportion, not detailed.

`planes/Cessna_172/agent_workspace/REPORT.md` records the measurement sources,
per-level statistics and the specific compromises behind the Cessna 172.
