# Low-poly Cessna 172S Skyhawk — build report

Everything below was produced by scripts in `agent_workspace/scripts/` and
verified by rendering and measuring, not by inspection of the source numbers alone.

---

## 1. Source / reference models analysed

| model | verdict |
|---|---|
| `tests/cessna_172_low_poly_flight_sim_optimized.glb` | The prior AI attempt. Dimensions **exactly** right, shape wrong. Rendered from all ten canonical views (`renders/refA/`): a lens-shaped "banana" fuselage with no cabin, no windshield, no tail cone, tail surfaces reduced to flat flaps and stick-and-ball landing gear. Used strictly as a negative example. |
| `tests/Low-Poly_Cessna_172/Low-Poly_Cessna_172.glb` | A Sketchfab kitbash (materials still named `F16_*`). Genuinely reads as a C172 but is 5490 tris and was stored in an arbitrary "flying" pose. Neutralised, rescaled and re-rendered (`renders/refB3/`). Useful for planform and front-view proportion; its own side profile is bulbous, so it was **not** treated as ground truth. |
| `commons.wikimedia.org` — *Cessna 172G Skyhawk 3-view line drawing* | The real reference. 26'-11" x 36'-2" x 8'-11", swept tail, i.e. the modern 172R/S configuration. All station data was measured off this drawing programmatically. |
| `commons.wikimedia.org` — *Cessna 172 3-view line drawing* | Early straight-tail 172; used only as a cross-check. |

### Measured geometry of the reference models

| model | tris | verts | meshes | materials | measured size (span x length x height) |
|---|---|---|---|---|---|
| prior AI attempt | 724 | 434 | 9 | 0 | 11.00 x 8.28 x 2.72 m |
| Sketchfab low-poly | 5490 | 12883 | 12 | 12 | 11.00 x 8.75 x 2.99 m (after neutralising the pose and rescaling to a true 11 m span) |

---

## 2. Method

This was run as **measured reconstruction**, not generation.

1. Rendered both reference models from ten fixed orthographic cameras and looked at them.
2. Downloaded the 172G factory 3-view and extracted station data numerically with
   `scripts/col_query.py`, which reports the ink runs in any image column or row.
   Scale was established at **104.7 px/m** from two independent measurements that
   agree (859 px for the 8.204 m length in the side view; 1157 px for the 11.02 m
   span in the plan view), and the drawing's 1.35 deg nose-low attitude (it is drawn
   with the nose gear depressed) was measured from the wheel-contact offset and
   corrected for.
3. Built the fuselage as a loft through 16 explicit cross-section stations, and every
   flying surface as a loft through explicit airfoil sections on the measured planform.
4. Re-rendered the ten canonical views after every change and fixed the largest
   visual mismatch each time. Fourteen iterations, all preserved in `renders/`.

### The errors that mattered

**(a) Longitudinal proportion.** The first blockout put the spinner tip 2.75 m ahead of
the wing leading-edge root and the tail 5.53 m behind it. Measurement of both the side
and plan views gave **1.94 m ahead and 6.34 m behind**. The blockout had ~0.8 m too much
nose and ~0.8 m too little tail — which is exactly what made it read as a stubby generic
high-wing rather than a Cessna. Fixing this was the single biggest improvement.

**(b) Cabin cross-section.** The cabin was initially a rounded tube with the wing perched
on top of a curved crown, which left a gap between the flat wing underside and the round
roof, and wasted polygons putting glazing on crown faces the wing completely hides.
That is not how the aircraft is built. The section now goes **round cowl -> flat-topped
cabin under the wing -> round tail cone**: over the wing chord the upper super-ellipse
exponent is raised to 5.5-7.0 to square the top off, the ring's angular phase is offset
by half a step so the crown is a flat *edge* rather than an apex, the roof **follows the
wing's lower surface**, and the fuselage top is left **open** there because the wing
closes it. Glazing was removed from the hidden crown and the windshield stops at the
wing leading edge.

**(c) Tail-cone shape.** Measurement showed the tail-cone **top line is nearly level**
(1.47 m down to 1.41 m over 2.7 m) and essentially all the taper comes from the belly
sweeping up. The blockout converged both lines symmetrically, producing a generic dart.

---

## 3. Final LOD statistics

| LOD | triangles | vertices | meshes | draw-call groups | GLB size | target | cabin posts |
|---|---|---|---|---|---|---|---|
| LOD0 | **862** | 493 | 22 | 23 | 44.9 kB | 1000–1500 ✔ (under) | yes (7) |
| LOD1 | **664** | 399 | 22 | 23 | 41.2 kB | 400–700 ✔ | yes (7) |
| LOD2 | **288** | 189 | 16 | 17 | 24.0 kB | 150–300 ✔ | no, continuous glass |
| LOD3 | **130** | 105 | 2 | 3 | 9.4 kB | ≤100 — 30 over | no, continuous glass |

Draw-call groups exceed the mesh count by one because `Fuselage` carries two
material slots (paint + glass) and so exports as two glTF primitives.

Vertex counts are Blender's shared-vertex counts. After glTF export the renderer sees
more (LOD0: 1062) because the exporter splits vertices at material and hard-normal
boundaries; that is normal and is what the GPU actually uploads.

### LOD strategy (not blind decimation)

Each level drops the cheapest-to-lose thing first, in this order: cross-section
resolution → control-surface separation → part separation.

- **LOD0** — 10-point fuselage rings, 18 stations, 8-point cambered airfoil, separate
  flaps/ailerons/elevator/rudder, 8-sided wheels, 4-station gear legs, full cabin posts.
- **LOD1** — 8-point rings, 15 stations, 6-sided wheels, 3-station gear, full cabin posts.
  Same object names as LOD0.
- **LOD2** — 6-point rings, 7 stations, 6-point airfoils, control surfaces merged into
  their parent surfaces, rudder merged into the fin, 4-sided wheels, glazing on the
  windshield crown, cabin sides and rear window.
- **LOD3** — 6-point rings, 5 stations, 4-point airfoils, flat-plate gear legs and struts,
  single-quad propeller blades, and **every static part joined into one mesh**
  (`Cessna_172_Body`) so the whole aircraft is 2 draw-call groups instead of 15.

Every silhouette-defining feature survives to LOD3: high wing with dihedral, both lift
struts, tricycle gear, swept fin with dorsal fillet, long tail cone, dark greenhouse,
two-blade prop. See `renders/final_lod3/`.

---

## 4. Final dimensions — all four LODs

| quantity | model | reference (172S) | error |
|---|---|---|---|
| wingspan | 10.998 m | 10.998 m | 0.000 |
| length | 8.280 m | 8.280 m | 0.000 |
| height | 2.718 m | 2.718 m | 0.000 |
| ground contact | z = 0.000 | — | wheels touch z=0 at every LOD |

Bounding box (LOD0, Blender axes): min `[-5.499, -5.720, 0.000]`, max `[5.499, 2.560, 2.718]`.

---

## 5. Counts, materials, textures

- **Materials: 4**, shared by every LOD — `C172_Paint` (white airframe), `C172_Glass`
  (opaque dark blue-grey), `C172_Dark` (tyres, propeller), `C172_Metal` (gear legs, spinner).
- **The glazing is not geometry.** The cabin windows, windshield and rear window are
  fuselage polygons carrying a second material index — there is no overlay shell, so
  nothing is duplicated and no fuselage face is permanently hidden behind glass.
  This is why the ring angles are chosen rather than evenly spaced (see §8.4).
- **Textures: 0.** Nothing is textured; all identity comes from geometry and flat colour.
- Glazing is deliberately **opaque**, not alpha-blended, so Babylon never has to
  depth-sort a transparent pass for the aircraft.

---

## 6. Mesh health

| check | LOD0 | LOD1 | LOD2 | LOD3 |
|---|---|---|---|---|
| degenerate faces | 0 | 0 | 0 | 0 |
| loose vertices | 0 | 0 | 0 | 0 |
| unapplied transforms | 0 | 0 | 0 | 0 |
| open boundary edges | 20 | 34 | 24 | 40 |
| symmetry error, mean | 2.9 mm | 2.4 mm | 3.2 mm | 6.0 mm |

**The open boundary edges are intentional, not defects.** At LOD0 they are
`Fuselage` 10 and `Wing_Left`/`Wing_Right` 7 each: the fuselage top is deliberately
left **open over the wing root chord** (see §8.1), so removing the wing would reveal
the rectangular cut-out it sits in, exactly as on the real airframe; and the wing root
ribs are left uncapped because they are buried inside the fuselage.

The count dropped from 100 to 24 when the glazing stopped being a separate open shell.

**The symmetry error is entirely the propeller** (`asymmetric_objects` in the validation
JSON lists only `Propeller`, 32 vertices). Propeller blades are twisted, so they are
correctly not mirror-symmetric. Every other part is symmetric to within 1 mm. At LOD3
the merged body inherits the same figure because the propeller-adjacent spinner joins it.

---

## 7. Babylon.js integration

Convention: Blender **+X = right wing, +Y = nose, +Z = up**, which is Blender's default
glTF export orientation, so the GLB is **nose = -Z, up = +Y** (standard glTF "front"),
matching what Babylon expects after its import handedness flip. This also matches the
axes the repo's existing `createPlaceholderAircraft.ts` uses (wing on X, nose toward +Z
in Babylon space, chase camera behind at -Z).

**Origin: on the ground, directly below the CG** (working Y = -0.62 m from the wing LE
root). Wheels touch y=0, so placing the aircraft on a runway is a straight position set;
the sim can offset to the CG with a parent node if it needs rotation about the true CG.

All parts hang off a single `Cessna_172` root node. Animated parts carry authored pivots;
static parts have identity node transforms (the CG shift is baked into their mesh data).

| part | pivot (glTF local) | rotate about |
|---|---|---|
| `Aileron_Left` / `Aileron_Right` | hinge midpoint, ±4.16 m span | span axis |
| `Flap_Left` / `Flap_Right` | hinge midpoint, ±1.605 m span | span axis |
| `Elevator` | hinge line on the centreline | span axis |
| `Rudder` | raked hinge line | vertical |
| `Propeller` | prop hub, on the thrust line | longitudinal |

Names present at LOD0/LOD1: `Fuselage, Wing_Left, Wing_Right,
HorizontalTail_Left, HorizontalTail_Right, VerticalTail, Rudder, Elevator,
Aileron_Left, Aileron_Right, Flap_Left, Flap_Right, LandingGear_Nose,
LandingGear_Left, LandingGear_Right, Wheel_Nose, Wheel_Left, Wheel_Right,
Spinner, Propeller, Strut_Left, Strut_Right`. Names are stable between LOD0 and LOD1.

---

## 8. C172-specific modelling decisions

1. **Flat-topped cabin section under the wing**, round cowl and round tail cone either
   side of it — the wing and cabin roof are one structure (see §2b).  Two details make
   this work: (a) the fuselage **top is left open** over the wing root chord, because
   the wing closes it; (b) the ring's angular phase is offset by half a step so every
   section has a flat top *edge* rather than a vertex at top dead centre — at 4 points
   that is the difference between a flat-topped box and a diamond, which is what LOD3
   used to be.
2. **Cabin roof follows the wing's lower surface** over the chord rather than sitting
   at a fixed height, so there is no gap under the wing and no poke-through at the thin
   trailing edge.  `z_top` is solved *backwards* from the wanted crown height, because
   with no vertex at top dead centre the visible crown sits a few mm below the nominal
   top and would otherwise miss the wing surface.
3. **Seven cabin posts** (LOD0/LOD1): A, B and C posts on each side plus a centre post
   splitting the wraparound rear window — windshield | A | door window | B | rear side
   window | C | rear window.  Each side post is a real ~70 mm fuselage segment that
   simply does not receive the glass material; the centre post is the flat-top face row
   of the rear-window segment left painted.  No overlay geometry.
4. **Glazing corners are chamfered per-triangle, not per-face.** The corner pane of the
   windshield (forward) and of the rear window (aft) is already two triangles, so the
   material index is assigned to each triangle separately: the upper triangle stays
   glazed and the lower one is painted. The resulting diagonal rounds the corner off
   instead of leaving it square — and because it reuses the quad's existing diagonal it
   costs **zero polygons**. Blanking the whole face instead (the first attempt) removed
   far too much glazing.
5. **The rear-window centre post is a 70 mm split of the flat top face row**, not the
   whole row. Painting the entire row made that post ~8x thicker than the side posts;
   splitting the face into glass | post | glass costs 2 quads and matches the others.
6. **Spinner is a true cone from a single apex vertex** with no caps. It used to start
   from a tiny ring plus an n-gon cap — a flat forward-facing disc on the nose tip for
   no visual gain — and capped the base as well, a face sealed inside the cowl. LOD0
   went 60 → 18 triangles; the propeller lost its root cap (buried in the spinner) and
   a station, 56 → 36.
7. **Ring angles are chosen, not evenly spaced.**  Even spacing puts no vertex at the
   window sill or head, which is what previously forced the glazing to be a separate
   offset shell.  Each ring table places vertices at the sill (the max-width line) and
   the head, so a cabin window is exactly one face row of the fuselage at a realistic
   ~0.47 m; keeps a flat top *edge* for the cabin roof; and keeps a flat bottom edge for
   the belly.  Doing this let LOD0 drop from 12-point to 10-point rings with no loss.
8. **Level tail-cone top line with the belly sweeping up** — the signature Cessna tail
   cone, and the thing that most distinguishes it from a generic low-poly monoplane.
9. **Semi-tapered wing**: constant 1.63 m chord out to 2.65 m from the centreline, then
   tapering to 1.09 m at the tip, with a **straight trailing edge** so all the taper is
   taken on the leading edge (~9.4 deg of outer-panel LE sweep). Measured off the plan
   view; the constant-chord section is longer than wing area alone would imply.
10. **Swept fin with a long dorsal fillet** starting 3.2 m ahead of the fin tip, and a
   **forward-raked rudder hinge** so the rudder is wider at the base and its lower
   trailing corner is the aft-most point on the aircraft.
11. **Horizontal stabiliser at z = 1.38 m**, just below the tail-cone top line, with a
   modest 0.22 m LE sweep — measured, not assumed. My first attempt had it mid-cone.
12. **Wraparound "Omni-Vision" rear window** — the glazing band crosses the crown behind
   the cabin, which is a strong and often-missed C172 identifier.
13. **1.73 deg dihedral, 1.5 deg incidence**, both to spec.
14. **Two lift struts** from the lower fuselage to 53% semi-span, painted body colour
   (they are painted on the real aircraft, not bare metal).
15. **Propeller blade chord lies in the disc plane**, twisted 34 deg at the root to 13 deg
   at the tip. An early version had the chord running fore/aft, which made the prop
   invisible head-on — the exact opposite of how a real prop reads.
16. **Wheelbase 1.63 m, track 2.50 m, prop ground clearance 0.285 m**, all cross-checked
    against the drawing.

---

## 9. Compromises made for polygon efficiency

- **Glazing is a material index, not modelled window frames** — no glass thickness, no
  rubber seals. At this budget a differently-coloured face *is* the window, and a
  painted face between two of them *is* the post.
- **Wing root ribs are uncapped** (invisible inside the fuselage).
- **No wheel fairings.** The 172S is usually delivered with them, but bare wheels plus
  the tubular spring gear is the universally recognisable trainer configuration and is
  cheaper. This is a genuine configuration choice, not an omission.
- **No trim stripe.** A stripe was built and rejected: at 12 ring points a single face
  row is ~0.5 m tall, so the stripe read as a floatplane hull rather than a Cessna trim
  line. Reverted to the plain white trainer scheme; the render is in `renders/iter06/`.
- **Control surfaces are wedges** filling 0.78→1.0 chord rather than fully-boxed
  surfaces, so their cut ends are single quads.
- **LOD2/LOD3 merge control surfaces** into their parent panels; only the propeller stays
  separately addressable at LOD3.

---

## 10. Known remaining inaccuracies

Being straight about these:

- **LOD3 is 130 triangles against a ≤100 target (30% over).** 10 of those bought side
  glazing: a 4-point ring has no face row that sits above the max-width line, so the
  cabin sides could not be glazed at all until the ring went to 6 points. The only remaining cuts
  are the lift struts, the landing gear or the glazing — i.e. exactly the features that
  distinguish a C172 from a generic monoplane. The brief says not to destroy silhouette
  to save triangles, so I left them in. LOD2 is 304 against a 150–300 target (4 over).
- **The cowl is slightly more conical in plan than the real one**, which has a blunter,
  more parallel-sided front. Costs a station to fix; I judged it not worth it.
- **Leaving the fuselage top open under the wing saves 6 triangles at LOD0** (3 face
  rows). The segment that reaches the wing trailing edge is deliberately left closed:
  the wing thins to a knife edge there and stops covering the cut-out, which showed as
  a hole in the roof just ahead of the rear window. The idea is right and the geometry
  is now correct, but the cross-section is coarse enough that the crown is a single face
  row per segment, so the saving is small. Reported as measured rather than as a win.
- **A ~0.08 m step at the wing tip** where the aileron ends before the tip cap. Sub-pixel
  at any realistic viewing distance.
- **The horizontal stabiliser is very subtle in a pure side view** — correct (it is only
  ~0.12 m thick) but it reads as a thin sliver.
- **Gear track: 2.50 m.** The 172G drawing annotates 7'-2" (2.18 m); modern 172S sources
  give 8'-4" (2.54 m). I used the modern figure since the model is dimensioned as a 172S,
  but the drawing I measured the shape from is a 172G. Flagging the inconsistency.
- **The reference drawing is a 172G, not a 172S.** They share the swept-tail shape and
  are within 0.08 m in length, but detail fittings differ.

I would describe this as **dimensionally exact and structurally faithful**, and
recognisable as a Cessna 172 rather than merely a small high-wing single, on the strength
of the tail-cone shape, cabin/wing junction, dorsal fin, strut placement and semi-tapered
planform. I would not describe it as a detailed model — it has no panel lines, antennas,
door outlines, wheel fairings or step.

---

## 11. Exact paths

Root: `~/gh/Felipegalind0/flight-sim/planes/Cessna_172/agent_workspace/`
(note: the path in the brief had a doubled `flight-sim/flight-sim/`; the real tree has one.)

**Exports** — `exports/`
- `Cessna_172_LOD0.glb`, `Cessna_172_LOD1.glb`, `Cessna_172_LOD2.glb`, `Cessna_172_LOD3.glb`
- `Cessna_172_master.blend` — all four LODs, one collection each, LOD0 visible

**Scripts** — `scripts/`
- `generate_c172.py` — the model. `--lod N --blend out.blend [--glb out.glb]`. Fully reproducible.
- `validate_c172.py` — dimensions, counts, mesh health, symmetry. Emits JSON.
- `render_c172_views.py` — the ten canonical orthographic views + contact sheet.
- `assemble_master.py`, `inspect_reference.py`, `prep_refB.py`, `reorient_ref.py`,
  `col_query.py`, `ink_profile.py`, `crop_preview.py`, `ruler.py`,
  `overlay_compare.py`, `side_by_side.py` — reference analysis and measurement tooling.

**Renders** — `renders/`
- `final_lod0/` … `final_lod3/` — final ten-view contact sheets per LOD
- `COMPARE_side_vs_drawing.png` — final side view stacked under the factory 3-view
- `refA/`, `refB2/`, `refB3/` — the two reference models
- `iter01/` … `iter09/` — the iteration history

**Measurements** — `measurements/`
- `c172_reference_dimensions.md` — every dimension used, with sources and the derivations
- `validate_LOD0.json` … `validate_LOD3.json` — machine-readable validation reports
- `ref_Cessna_172G_Skyhawk_3-view_line_drawing.png`, `ref_Cessna_172_3-view_line_drawing.png`
- `crop_side.png`, `crop_nose2.png`, `crop_tail2.png` — the measured crops

Nothing under `Cessna_172/tests/` was modified.

## Sources
- [Cessna 172G Skyhawk 3-view line drawing — Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Cessna_172G_Skyhawk_3-view_line_drawing.png)
- [Cessna 172 3-view line drawing — Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Cessna_172_3-view_line_drawing.png)
- [Cessna 172S Skyhawk — This Day in Aviation](https://www.thisdayinaviation.com/tag/cessna-172s-skyhawk/)
- [Cessna 172 Skyhawk dimensions — Dimensions.com](https://www.dimensions.com/element/cessna-172-skyhawk-aircraft)
- [Cessna 172 specifications — flugzeuginfo.net](https://www.flugzeuginfo.net/acdata_php/acdata_cessna172_en.php)
