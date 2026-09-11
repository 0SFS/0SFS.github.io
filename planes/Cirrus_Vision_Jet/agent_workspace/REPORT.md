# Cirrus SF50 Vision Jet — low-poly model

A measured reconstruction of the SF50 (G2) built to
`docs/creating-an-aircraft-model.md`, generated procedurally from a table of
cross-section stations. Three levels of detail, 1514 / 856 / 442 triangles,
wired into `AIRCRAFT_CATALOG` as `cirrus-vision-jet`.

Levels are numbered **coarsest first**: LOD1 is the far mesh and each step up
adds detail, so a bigger number is always a better mesh. There is no LOD0 —
that slot is for a silhouette level below the far one, and this airframe does
not need one.

| level | triangles | vertices | objects | takes over at |
| --- | --- | --- | --- | --- |
| LOD3 | 1514 | 888 | 26 | 0 m |
| LOD2 | 856 | 480 | 19 | 65 m |
| LOD1 | 442 | 255 | 12 | 170 m |

Overall length, wingspan and height are **identical at every level and exactly
equal to the published figures**, and every level's lowest vertex is at
`z = 0`, so none of them floats or sinks.

---

## Where the shape comes from

**The factory three view** — `tests/SF50-POH.pdf`, Cirrus Vision SF50 Airplane
Flight Manual, P/N 31452-001 Revision 4, page 1-4, *Figure 1-1: Airplane Three
View* (drawing id SF50_FM01_0011B). Every dimension in this model comes from
it; `measurements/sf50_reference.md` records each with the pixel coordinates it
was read at and which view it came from.

Every reference image, with its provenance, licence and what it settled, is
collected in `measurements/GALLERY.md`.

**Photographs of the real aircraft** — `measurements/photo_N50SF.jpg` and
`photo_N914AF.jpg`, side-on and low-angle ramp shots of two G2 airframes from
Wikimedia Commons. They confirmed the cabin window count and showed how large
and smooth the wing root fairing is, which the three view draws only as an
outline. No dimension is taken from them — they are perspective photographs.

**A downloaded reference model** — `tests/cirrus_vision_Sf50/`, which turned
out to be hilos run's Sketchfab model and now ships as the opt-in `hd` level
(see "A second model, by someone else").

`scripts/reorient_ref.py` puts it in this project's frame: lateral axis from
the wingtip pair, longitudinal from the farthest pair near the symmetry plane,
signs off its windshield submesh, scale from the published span, and then pitch
and the two in-plane offsets **fitted to the drawing's own crown line**. That
fit is the number to look at — **15 mm rms over 140 stations** — because it
says the forward fuselage lines up, which is what makes a reading of its
windshield mean anything.

Its length then comes out **−3.0%**, its fuselage up to 0.24 m wider than the
drawing at the cabin, it carries no landing gear, and its cabin windows are
painted into a 4096² texture rather than modelled. So it is a hypothesis about
shape: it settled the windshield's roof line, and nothing is taken from it in
metres that the drawing does not give independently.
`scripts/compare_drawing.py --nose-origin` stacks it on the drawing, which is
what that verdict is based on.

I should have pulled the photographs and the reference model at the start
rather than after the first build. Working from the drawing alone is what let
the cabin ship as a single glazed band for several iterations: the drawing
draws the windows precisely, but I eyeballed them off a low-resolution crop
instead of measuring, and had nothing to check the result against.

The figure was rendered at 1200 dpi (`pdftoppm -r 1200`) into
`measurements/ref_SF50_three_view_1200dpi.png`, and read numerically:
`scripts/col_query.py` reports the ink runs in any image column or row,
`scripts/profile_drawing.py` does the same converted to metres.

### The drawing is not uniformly scaled — and that was the trap

Measuring the drawing's own dimension lines gives a **different px/m on each of
the three axes**:

```
SIDE   x = longitudinal 386.2 px/m,  y = vertical 379.6 px/m
PLAN   y = longitudinal 386.2 px/m,  x = lateral  409.4 px/m
FRONT  x = lateral      409.4 px/m,  y = vertical 409.4 px/m
```

The two views that share an axis agree on it to 0.1%, which is the check that
this is a real property of the figure rather than three guesses. Read as one
uniformly scaled drawing instead, it gives a span/length ratio of 1.336 against
the published 1.261 — **6% too much wing**. That is this airframe's version of
the Cessna's fuselage-proportion error, and it would have survived every
eyeball check because the shape would still have looked plausible.

Two quantities that were never used to fit the scales confirm them:

- **Wing area.** The drawn planform integrates to 2.90e6 px², which over
  `386.2 × 409.4` is **18.30 m²** against a published 18.181 — 0.6% high, and
  the rounded tip the trapezoid ignores accounts for most of that. Read
  uniformly it comes out at 19.8 m², 9% wrong.
- **Nose tyre.** Drawn 137 px across, i.e. 0.355 m longitudinally and 0.361 m
  vertically — a circle, as it must be. Published 5.00 × 5 is about 0.353 m.

### Attitude

The side view is drawn **level and parked**, wheels on a horizontal ground line
at row 1737.5, so unlike the Cessna 172G drawing no nose-low correction was
needed. The **front view is drawn with the oleos extended** — with its vertical
scale fixed independently, `z = 0` lands 0.44 m above the drawn tyres — so every
vertical number comes from the side view and the front view is used only for
lateral shape and for dihedral.

---

## Two places the drawing contradicts itself

Neither was averaged away quietly.

**1. V-tail span.** The front view draws the tips 4.480 m apart, matching the
`14.7 ft (4.5 m)` callout to three figures. The plan view draws them 4.147 m
apart (13.6 ft), and the side view's tip leading-edge position agrees with the
plan. So it is two sources against two. The **published callout and the front
view won**, because the callout is a published dimension and the agreement
between it and the front view is exact rather than approximate; the plan view's
measured sweep angles and chords were kept and the panel extended to that span,
which moves the leading-edge sweep by 1.5°. If a 13.7 ft callout was meant — a
plausible single-digit typo — then the plan and side views were right and this
V-tail is 8% too wide. **This is the one proportion in the model I would most
want a second opinion on**, and `COMPARE_plan_vs_drawing.png` shows it plainly:
the red tail overshoots the grey one.

**2. Main tyre.** Drawn 0.37–0.38 m across; the AMM text in the same POH calls
out 18 × 5.5, i.e. 0.457 m. The drawing was followed, because the drawn wheel is
what puts the fuselage at the height the 10.9 ft callout states — a 0.457 m tyre
would lift the whole aircraft 4 cm above its own published height. The nose tyre
needed no such choice: drawn and published agree.

---

## What carries the silhouette

The lines that had to be right, found by stacking the render on the drawing
rather than by looking at either alone:

- **The wing sits far aft.** 3.30 m of aircraft ahead of the wing root leading
  edge, 6.06 m behind it — the wing root is at 35% of the length, against the
  Cessna's 23%. This is the equivalent of the 172's longitudinal-split error and
  the first thing that was measured.
- **The belly is nearly level** from Y = −1.2 to −5.0, dipping to its lowest
  (0.575 m) under the wing box, and then sweeps up hard. Almost all the
  tail-cone taper is in the belly, not the crown.
- **The tail cone pinches abruptly.** 0.375 m of half-width becomes 0.175 m in
  35 cm, just ahead of the V-tail roots, and then stays a thin deep blade to the
  tail. The first pass interpolated smoothly through that and the plan view had
  a fat wedge where the drawing has a spindle.
- **The wing root fairing is big.** The body blends out to 0.97 m of half-width
  at the wing trailing edge against 0.67 m for the body itself, and the front
  view confirms it independently — ±0.94 at the wing chord plane against ±0.81
  higher up. Leaving it out made the plan silhouette 0.28 m narrow on each side
  and the wing look bolted on rather than blended in.

Other things measurement changed from the first blockout:

- The cross-section rings have no vertex at top or bottom dead centre — that is
  deliberate, so the crown and keel are flat edges rather than creases — which
  put the polygon crown 4 cm below the true roof and the keel 7 cm above the
  true belly. `fit_section()` solves the super-ellipse parameters backwards from
  the wanted extents so the silhouette is exact. It costs nothing and it is also
  what keeps every LOD reporting the same overall dimensions.
- The nacelle ring point count has to be **even**. An odd ring straddles the
  centreline instead of mirroring across it, and showed up as 0.21 m of
  left/right symmetry error at the far level before the validator caught it.
- The nose station has to survive to every level. When it was marked
  finest-only, the level under it came out 0.15 m short and nothing else
  noticed.

---

## Nothing renders that cannot be seen

- **A last pass gives back the triangles that describe nothing, and it is
  measured, not assumed.** Faces that meet within `DISSOLVE_DEG` are describing
  one surface, so the edge between them is a line the eye cannot find:
  dissolving those and retriangulating what is left handed back 110 triangles
  at LOD3 and 16 at LOD2. Sampled both ways against the undissolved surface,
  1.0 deg moves the skin by at most 3.6 mm — on a 9.36 m aeroplane read off a
  drawing to about 10 mm. 2.0 deg gives 46 more for 6.8 mm, which is a number
  the drawing would notice, so 1.0 is where it stops. LOD1 gives back only what
  its fuselage offers and nothing from the flying surfaces, which is the check
  that it is not eating shape: down there most face pairs are not flat enough
  to merge.
  The biggest single win was not the fuselage but the wings, 61 triangles down
  to 33 each — the ruled surface between two aerofoil sections is flat, and the
  loft had been splitting it anyway.
- **It is tried, checked, and backed off rather than trusted.** Merging two
  triangles that are flat but *folded* gives a quad the retriangulator can only
  split across itself, and the fuselage came back with four edges carrying four
  faces each. So each part is dissolved into a copy, the copy's edges are
  counted, and the angle is halved until the mesh is exactly as sound as it was
  before. `###DISSOLVE###` prints the angle each part settled for.
- **`scripts/audit_fuselage.py` is how a wasted triangle is found rather than
  argued about.** It prints triangles per 0.20 m of length, every vertex whose
  whole fan is within a degree of one plane, and the thinnest faces with where
  they are. The two things it found — a belly paying for the windscreen's
  stations, and 800 mm splinters fanning across the aft window — are both gone.
- **The glazing is a material index, not geometry.** The cabin windows and the
  wraparound windshield are fuselage polygons with a second material. Zero
  duplicated triangles, zero occluded ones, one extra submesh.
- **The ring angles were chosen so this works.** Solving the super-ellipse at
  the cabin station puts the window sill at 8° and its head at 40°, so the
  ring's first face row on each side *is* the cabin window band: the model's
  glazed band lands at z = 1.711–2.234 against the drawing's 1.70–2.20. Nothing
  had to be added to place that colour.
- **There is a ring line on the crown, and it earns its keep three times.** It
  puts the polygon's top exactly on the measured crown; it is where the
  windshield's centre post hangs its two edges; and it means neither
  windshield pane has to share a face row with the other.
- **Corner rounding is free.** The forward-most windshield pane and the
  aft-most cabin pane are already two triangles each, so painting one of the two
  chamfers the corner with a diagonal for no extra polygons.
- **The panes are shapes, not face rows.** The three cabin windows are
  super-ellipses whose exponent was read off the drawing rather than assumed:
  window 3 measures 0.46 m wide at mid-height and 0.35 m at 0.13 m higher,
  which is an ellipse, not a rounded rectangle.
- **The windshield has two traced edges, and finding the second one is what
  fixed its shape.** `profile_drawing.py side runs` prints every ink run in one
  column of the side view, and through the cockpit there are two between the
  crown outline and the belly. The lower one is the sill, which falls from
  z = 1.836 at the forward corner to 1.723 abeam the pilot and climbs back to
  2.100 at the aft corner. The upper one appears at Y = −2.18 and runs aft at
  z = 2.20 down to 2.10: it is the **top** of the glazing, with body above it.
  An earlier pass glazed everything above the sill, which runs the glass over
  the crown for the windshield's whole length and gives the aircraft a bubble
  canopy - the thing that prompted this rebuild. The reference model in
  `tests/` agrees to 8 mm on that line, which is two independent sources for
  it. Two curves and a centre post now define the whole windshield, including
  where it starts and stops.
- **The ring never moves.** The fuselage carries one uniform 11-point ring at
  every station, the same angles throughout, exactly as it did before there
  were any windows. An earlier pass slid the ring vertices to follow each pane,
  on the reasoning that a vertex sliding along its own section curve does not
  change the surface. That is true of the *section* and false of the *mesh*:
  the surface between two stations is the chord between their vertices, so
  changing the angular spacing between neighbouring stations changes the
  faceted surface. It put ridges down the length of the cabin, and cost 600
  triangles to do it.
- **The panes are cut inside one face row instead.** Row 0 on each side spans
  z = 1.71 to 2.23 at the cabin and 1.38 to 2.13 at the aft window, which
  contains every pane at every station. Inside a pane, that row gains one or
  two vertices - the pane's own upper and lower edge from the measured
  super-ellipse, or the windshield's sill. They go on the row's **chord**, not
  on the analytic section: a vertex on the true curve would stand up to 5 cm
  proud of the flat row either side of it and put a crease down the whole
  cabin.
- **No ring line carries a pane column.** The fuselage is the uniform 11-point
  ring at the measured stations and nothing else. A pane is cut into the one
  face row that holds it, as a hole bridged to its own outline, and the ring
  either side of that row never learns the window is there. Two earlier passes
  did carry columns - first as whole extra rings (nine rows of triangles to
  show one window column), then on the four lines bounding the two window rows,
  which forced the neighbouring rows into triangle strips: one thin sliver per
  column, about 140 of them, fanning from the window band out to the shoulder
  and the keel and showing nothing. Both are gone. The stations the glazing
  adds are the windshield's two ends, where the crown rows stop being glazed,
  the crossings solved for below, and one just clear of each end of each pane.
- **A station the glazing asked for is not a whole ring.** Ten of the 33
  stations at LOD3 are there for the windscreen or the windows, and the belly
  has no use for any of them: a ring is 22 triangles and eleven of them are
  under the waterline. So each ring LINE carries only the stations a row beside
  it was actually cut at, and a row whose two lines disagree closes the
  difference with a triangle instead of two quads. That is the only way a row
  can skip a station without leaving a T-junction on the line it shares - and
  the run it merges over always stops at a measured station, because those are
  the shape and every line keeps them.
- **The strip that closes a pane's hole is tiled along Y.** Which side to
  advance is decided by where the next vertex actually is, so a pane vertex
  only ever joins the two beside it. It used to be decided by index fraction,
  which pairs the first of six station vertices with the first of twenty-four
  pane vertices however far apart they lie: the aft window came back as a sun,
  eight splinters up to 860 mm long fanning from one station vertex across a
  pane 360 mm long. Index fraction is still right for two closed loops with no
  common parameter; these two have Y.
- **A pane's block is the pane's own size.** The station just clear of each end
  does double duty - it keeps two panes out of one station gap, and it stops
  the hole running from 150 mm ahead of the pane to 400 mm behind it.
- **Seven columns per pane, not twelve.** A column is the most expensive
  vertex in the model: four triangles, not two - one on the pane and one in
  the strip, top and bottom - and it also decides how well that strip tiles.
  So the count is measured. Against the super-ellipse each pane is cut from,
  sampled over the same range so the blunt end is not doing the work: twelve
  columns hold the door window's outline to 1.8 mm, nine to 4.3, seven to 6.9,
  five to 18.4. The drawing they were read off is good to about 10 mm, so
  seven is where the outline stops being the limiting error - and it is two
  arms shorter on every fan. Twelve cost twenty triangles a pane for accuracy
  the source does not have.
- **The strip closing each pane is one polygon, not a walk.** A strip whose two
  chains have very different vertex counts has no good zip: three station
  vertices against seven pane columns forces a fan from one apex whichever rule
  picks the diagonals. An n-gon costs exactly the same triangles - a polygon of
  V vertices is V-2 either way - and lets the triangulator choose. Doing that
  also removed the last of the folded pairs, so the dissolve pass stopped
  backing off and now takes the full 1.0 deg on the fuselage.
- **Pane vertices are placed by interpolating inside the row's own quad**, so
  they land exactly on the ruled surface that was already there: cutting a
  window changes nothing about the shape of the fuselage around it. Putting
  them on the analytic section instead - which is where they mathematically
  belong - stands them up to 5 cm proud of the flat row either side and creases
  the whole cabin.
- **A face's material is decided structurally, never by testing its geometry.**
  A pane's cut vertices sit exactly ON its outline, so any inside/outside test
  of them is a knife edge that sub-millimetre float noise flips - which left a
  glazed sliver spiking the full height of the row off each end of a cabin
  window. The row knows which of its sub-rows is the pane, so it says so.
- **Everywhere outside a pane the row is still one quad**, and outside the
  cabin the mesh is exactly what it was before there were any windows. The
  entire cost of the glazing is the pane outlines plus one triangle per column
  in the two rows either side.
- **The windshield's edges are cut into whichever row holds them.** None of the
  three stays in one row: the sill runs from the crown at Y = −1.48 down
  through the shoulder row into the window row abeam the pilot; the roof line
  leaves the crown at −2.18 and is out at the shoulder by −2.55; the centre
  post is a lateral edge in the two rows either side of top dead centre. So the
  row is asked what it holds rather than told in advance - cutting each edge
  into a row picked ahead of time clamps it onto a ring line wherever the guess
  is wrong, and the glass came out with a step in it.
- **Where an edge crosses a ring line, there is a station.** Those stations are
  *solved for*, not guessed: `edge_ring_crossings()` bisects for every Y where
  the sill or the roof crosses a ring line, and `fuselage_stations()` adds
  them. Without one, the edge lands on the ring line at a different station in
  each of the two rows, the boundary jogs back along the line by one gap, and
  the glass gets a notch a whole row deep. It is the C172's lesson - put the
  vertices where the features are - applied along the fuselage instead of
  around it, and it costs three rings at LOD3.
- **A cut within 4 mm of a ring vertex IS that ring vertex.** The traced curves
  and the section table are separate measurements, so where they should meet
  exactly - the roof leaving the crown, the sill meeting it at the forward
  corner - they meet a third of a millimetre apart. Left alone that puts a
  vertex 3 mm from the ring's own, on a ring line the next row never split, and
  the fuselage comes back with a T-junction. `SNAP_M` closes the gap.
- **The centre post is a black rectangle, 62 mm wide the whole way.** It runs
  from the windshield's forward tip to Y = −2.18, where the roof line leaves
  the crown and the panes stop being joined over the top. It used to taper to
  nothing at each end, which drew it as a rectangle with a spike on either tip
  - the taper was there to keep the post's ends off a ring line that was never
  split, because a post that simply stopped left a T-junction at each end.
  Squaring it needed two things:
  - Its edges are cut into the two rows either side of top dead centre, so its
    end vertices sit on those rows' own chords, and the gap beyond each end of
    the post is cut too, with the edge running in to x = 0. That is enough at
    the forward tip.
  - **The post's edge is sorted before the glass edges where two cuts cross.**
    At Y = −2.18 the roof cut lands exactly on the crown ring vertex while the
    post's is still interior, and the monotone clamp that resolves a crossing
    was collapsing the post's cut into the roof's - so the forward gap split
    the ring line at the post and the aft gap did not. The post wins that tie
    for a topological reason: its ends have to land on the vertex the
    neighbouring gap put there, whereas a glass edge that loses a crossing only
    mis-colours the sliver it was crossing in.
- **It has a material of its own, and not the one the tyres use.** `SF50_Dark`
  is matte and lives inside the intake and under the wheels, where its specular
  level never shows. The post sits on the crown facing the sky, and at that
  material it rendered as a light grey bar - lighter than the glass it divides,
  which is the one thing it must not be. `SF50_Post` is near-black at the
  glass's low specular. `renders/WINDSCREEN_front_lod3.png` is the check.
- **The nacelle is open where the fuselage closes it.** The drawing leaves a
  7–13 cm gap between the pod and the crown, too small to be worth a pylon at
  this budget, so the pod is seated on the fuselage and the four faces that
  would then be sealed inside the body are not built.
- **The intake is a dished cap, not a hole.** One ring plus a centre vertex in
  the dark material, set 9 cm inside the lip — eight triangles at LOD3.

The one thing added purely as geometry rather than material is the **ventral
keel** under the nose gear bay and the **main gear doors** — 28 and 24
triangles. Both are unmistakable in the side silhouette of a parked SF50, and
neither can be a material on a face that already exists. The doors now pay for
themselves twice: retracted, they are what closes the wing root — see
"Landing gear".

---

## Landing gear

### The main legs were a Cessna's, and are not any more

The main gear was inherited from `generate_c172.py` and never re-measured: a
bowed spring-steel leg that left the belly near the centreline at
`x = ±0.60, z = 0.66` and swept 1.1 m outboard and down to the wheel. That is
exactly right for a 172 and wrong here in the most visible way there is — the
front view of a parked SF50 has **two vertical struts hanging off the wing**,
and what the model drew was two long diagonal rods crossing under the wing to
the wheels. `renders/gear_up/GEAR_before_after_front.png` is where it
shows: stacked on the drawing, the old legs (top) cut straight across a wing the
drawing keeps clear, and the new ones (bottom) sit on the legs it draws.

Re-measured off the three view, the leg is a straight, near-vertical oleo strut:

| quantity | value | read at |
| --- | --- | --- |
| strut top | x = ±1.637, Y = −4.406, z = 0.880 | front x 3367 px (lateral 409.4), side x 2511–2529 px |
| axle | x = ±1.707, Y = −4.434, z = 0.190 | the 11.2 ft track callout and the side view |
| rake from vertical | 6.3° outboard | 0.070 m over the leg's 0.69 m |

The strut top sits inside the wing box — the chord plane at that station is
z = 0.900 — so the loft is capped at both ends without the cap ever showing.

Two rings, not three. A third at the piston shoulder was built and the dissolve
pass took it straight back out: on a straight taper it lies within a degree of
the line through the other two, so it describes nothing. The nose leg had the
same dead station and had been carrying it since the airframe was first built —
the dissolve report was quietly deleting it at every level. Both are now built
with two rings, which is where the **16 triangles** LOD3 gave back came from.

### Retraction

The gear now retracts, and it costs nothing: no bay is cut, no second pose is
exported and no triangle is added. The model is always built gear down and the
runtime turns three nodes.

Each leg's object **origin is on its retraction hinge**, and its wheel — plus,
on the main legs, its door — is a **child** of the leg, so one rotation carries
the whole assembly. `scripts/verify_rig.py` checks both, because a wheel left as
a sibling stays hanging in the air under an aeroplane whose legs have gone.

Which way each leg folds is measured, not assumed, and the drawing says it twice
for the nose:

- **Main legs fold inboard**, about a fore-aft hinge in the wing root.
  `measurements/photo_N914AF.jpg` is a belly shot with the gear up and settles
  it outright: the two retracted main wheels lie **flat** — the axle has turned
  from lateral to vertical, which only an inboard swing does — in shallow wells
  either side of the keel, far inboard of the 3.414 m track. The front view's
  side brace runs up and inboard from the leg, which folds the same way.
- **The nose leg folds aft**, about a lateral hinge. Its drag brace runs up and
  **aft** (upper end at Y = −1.288 against the leg's −1.140), and a brace can
  only fold toward its airframe attachment — retracting forward would have to
  lengthen it. Independently, the bay panel outline in the ventral keel band
  sits aft of the strut, at Y = −1.10 to −1.43. Two readings, same answer.

A **quarter turn** pins each hinge to one point, which is how they are derived
rather than guessed. `stowed − h = rot90(extended − h)` has exactly one
solution, and `quarter_turn_hinge` in the generator is that solution in closed
form. So the stowed axle is what is chosen — from where the wheel has to end up
inside the skin — and the hinge follows:

| leg | extended axle | stowed axle | hinge |
| --- | --- | --- | --- |
| main | x 1.707, z 0.190 | x 0.620, z 0.830 | x 1.4835, z 1.0535 |
| nose | Y −1.138, z 0.179 | Y −1.820, z 0.940 | Y −1.0985, z 0.9005 |

The main hinge lands 0.12 m above the wing chord plane at its station. That is
a pivot, not geometry, and nothing is drawn there; a real trunnion would sit
lower, on a folding side brace this budget cannot carry.

**A gear-down render cannot show whether the stowed gear pokes out of the skin**,
which is the one thing that can go wrong here, so the generator takes `--gear 0`
and builds the stowed pose. The first stowed position put the door slab and a
corner of the strut about 25 mm below the wing's lower surface — invisible in
every view except from underneath, and obvious there. Lifting the stowed axle
from z = 0.730 to 0.830 buried both. `renders/gear_up/` is the check:
`GEARUP_SHEET.png` for the ten canonical views, and `GEARUP_close_06_Bottom.png`
and the two `GEARUP_close_*3Q.png` for the belly and the wing root at 3.4 m of
framing, which is the only range at which 25 mm of proud door shows.

The strut door earns its keep twice over. Extended it hangs below the wing ahead
of the wheel, which is the shape a parked SF50 is recognised by; retracted it
lies flat under the wing root, which is what the belly photograph shows a closed
gear door looking like. Twelve triangles a side, doing two jobs.

### The bays, and where the gear actually goes

Three builds of this were wrong, each in a different way, and every correction
came from a photograph rather than from reasoning about the three view. That is
the lesson worth carrying: the drawing settles dimensions and says almost
nothing about what the gear does.

**The nose gear retracts FORWARD.** It was aft for two builds, read off a drag
brace in the side view that is a few pixels wide.
`measurements/photo_N124MW_gear_down.jpg` settles it and is not ambiguous: on
approach, gear down, a long door hangs open **ahead** of the nose leg. Measured
against the nose tyre in the same frame — 0.358 m across 85 px — it is 1.10 m
long, which is the ventral band the side view draws at Y = −0.35 to −1.43,
1.07 m, the same panel to within the reading.

So that band is not a keel strake. **The band IS the doors.** The `Keel` object
that stood in for it is gone: a solid plate where the aeroplane has a pair of
doors, occupying the exact space the bay needs. The mouth now runs Y = −0.42 to
−1.22 on the centreline, 0.34 m across, with a clamshell pair that parts in the
middle and opens sideways, and the leg swings forward into it.

**The main gear retracts into the WING, and the wheels stay visible.**
`photo_N914AF.jpg` is a belly shot with the gear up: each main wheel is a dark
tyre face in a round well in the wing root, with **no door over it**. The panel
beside it covers the leg. An earlier build stowed the wheels 24 mm inside the
wing — invisible — and cut a large bay into the belly to compensate, which is a
bay the aeroplane does not have.

| | first build | now |
| --- | --- | --- |
| main stow | x 0.620, z 0.830 — 24 mm inside the wing | x 0.900, z 0.797 — measured, and 18 to 45 mm proud of the wing |
| main hinge | x 1.4835, z 1.0535, above the wing chord plane | x 1.607, z 0.897, on the chord plane, in the wing box |
| main bay | 0.92 m cut in the belly on the centreline | none; a well in the wing root |
| nose retraction | aft | forward |
| nose mouth | 0.52 m, rounded, aft of the leg | 0.80 m, square, ahead of it |

**The wheel wells are dished caps, not holes**, the same trick the intake bore
uses. The wing is never cut: it is a five-station loft on seven-point rings,
nothing like as amenable to `cut_pane` as the 36-station fuselage. Two things
were tried first and both are invisible, for the same reason once it is said
out loud — **the wing is opaque, so anything behind its skin is behind its
skin**. A cup with its walls going up inside the wing: invisible. A dish
recessed inward: inward is up, so also invisible. What shows is a flat dark
disc hugging the surface 2 mm outside it, every vertex ray cast against the
wing rather than laid on a plane, because the lower surface is convex and a
flat disc through its rim stands proud in the middle. Gear up the tyre sits in
it; gear down the disc alone reads as the empty well.

**A door hinges about its own edge, not about a cardinal axis.** The nose
doors' hinged edge is the mouth's long edge, and the mouth is on the belly,
which rises 9.3 deg toward the nose. Turned about the plain fore-aft axis they
did not hold that edge still - it lifts off the mouth - and the open pair lay
parallel to the GROUND while the body they hang from is pitched up. The axis is
now measured off the chain and printed by the build as `###DOORAXIS###` for the
runtime to use.

Two things that axis has to be, and both were got wrong first:

- **Pointing forward.** Aft is just as valid a hinge line and swings both doors
  the other way - up into the fuselage.
- **In the fore-aft/vertical plane.** The chain it is measured from drifts a
  few millimetres laterally, because the mouth narrows toward its ends, and
  carrying that drift in gives the two doors hinge lines that are not mirror
  images: 6 mm of symmetry error. A hinge is a straight line anyway.

A door with the wrong axis still swings the right number of degrees, so an
angle check passes and the panel is still somewhere else entirely. What catches
it is asserting where the door LANDS: `aircraftAnimation.test.ts` carries the
free edge's position relative to the hinge from both builds - gear down as
exported, gear up from `--gear 0` - and checks the runtime rotation maps one to
the other.

### The main leg is a trailing link

Not a rod with a wheel on the end, which is what it was.
`measurements/crops/photo_main_gear_linkage.png` shows three members:

- a rigid **forward leg** down from the wing to a knee joint, ahead of and
  above the axle;
- a **trailing arm** hinged at that knee, running aft and down to the axle;
- an **oleo** aft of the leg, down from the wing onto the arm near the axle.
  It is the one with a polished piston showing, so it is the shock and the
  other two are rigid.

Scaled on the tyre in the same frame — 0.190 m of radius across 170 px, so
895 px/m — the knee is 0.240 m ahead of the axle and 0.050 m above it. The
member tops are **not** measured: the photograph loses them in the wing shadow
about 0.27 m above the axle, so they keep the height the drawing already fixed
and only the lower geometry comes from the photograph.

All three are one mesh under one node, so the retraction rig is untouched: it
still turns a single `LandingGear_*` and the wheel and door still ride it as
children. **The linkage does not articulate** — the oleo does not compress and
the arm does not swing on its knee — because that needs a node apiece and a
runtime that can drive them. It is a trailing link in shape only.

24 triangles a side, and only at the finest level: at 65 m the three members
are one grey line whichever way they are built, so LOD2 and below keep the
plain strut. `tube()` came out of this - `diamond_ring` builds its ring in the
XY plane, which is right for a member that hangs vertically and degenerate for
a trailing arm, whose ring would lie along its own axis.

### The main gear bay is a rib bay in the wing

What was there instead was a flat plate at x = 1.660, hanging below the wing on
the outline the drawing's side view draws. It was the right feature read the
wrong way: **a gear door is a panel IN the skin, not a slab beside the leg**,
and modelled as a slab it was as wide as the linkage and read as a vestige of
nothing. It is gone.

**A keyhole, not a rectangle.** The wheel end HUGS the tyre - a circle of
0.21 m about the stowed axle - and a rectangle wide enough to contain the wheel
is a much bigger hole than the aeroplane has: it read as a box with a tyre
loose in it.

Cutting it is still not a pane trace. A station at the join splits the bay
into two segments. The inboard one is re-emitted as **one n-gon** - three
closed sides of the quad, then the outline. The bite is on the boundary rather
than in the middle, so the region is simply connected and the triangulator can
have it whole. Both ends of the outline sit on the join station's edge, which
the dropped face has already left open, so they split nothing and there is no
T-junction.

The outline is addressed in **plan coordinates**, (x, Y), and put on the
surface by interpolating inside the row. It used to be (station, fraction
across the row), with the radius converted into the fraction at the circle's
own station. That is right for a circle alone and wrong once the belly has to
be cut on the same outline, because the fuselage knows plan coordinates, not
the wing row's. `well_outline()` in the generator is that one outline, and
both cuts use it.

**The door is not the whole face row.** The row runs 0.35 to 0.72 of the chord,
and its aft edge is the flap hinge. The panel in the photographs runs 0.29 to
0.635, so the door is cut at those two fractions, across the 0.35 ring line it
straddles. That makes six faces instead of two: the skin fore and aft of the
door in the outboard segment, the C round the well, and the inboard row ahead
of it, which gains the vertex where the door's forward edge meets its side.
**The faces outboard of the hinge take the door's two corner vertices too.**
They share the hinge station's edges, and leaving them out made the hinge line
a crack. The wing mouth then had 23 open edges against the pocket rim's 21. A
boundary-loop count (`scripts/boundary_loops.py`) caught it; a render would not
have.

**The door opens PAST vertical, to 125 deg, so it leans outboard.** At 82 it
hung in the extended wheel's own plane and the two z-fought, which read as the
wheel poking through the panel. The wheels have no camber and never did; that
was the door. It is 125 rather than the 112 it was for a while because the door
is now its measured 0.75 m. Hinged 0.8 m up, a panel that long stands 30 mm off
the ground at 90 deg. `crops/photo_N291AH_right_main_door.png` shows it from
the front: splayed out, free edge level with the axle. The model's free edge
stops 0.24 m up, 13 cm outboard of the tyre.

The pocket behind the mouth is the same dark tapered cup the nose bay uses,
with one addition described below: a collar where the belly is lower than the
wing.

### The main gear bay is where the photographs put it

This was wrong for one build in a way worth recording, because the wrong
version looked right.

The first well at the measured position showed white inside it. The fuselage's
lower side row runs through that footprint: below the wing for its inboard few
centimetres, where it was drawn straight across the well, and inside the wing
for the rest, where it stood up in the pocket as a ledge. The fix that went in
moved the wheel **0.26 m outboard**, to x = 1.110, where there is no fuselage.
It looked fine. With a quarter-turn retraction, though, the leg's length is set
by where the wheel ends up. So the move also cut the leg from 0.74 m to 0.60,
dragged the hinge out and down onto the wing's skin, and left the door
starting at x = 1.16 across a well whose rim was at 1.32. The retracted tyre
sat half under the panel. The fix changed the dimensions to hide an
intersection. It should have cut the thing that intersected.

So the numbers were measured again, off two views that agree:

- `measurements/photo_PS-CVJ_bottom_view.jpg`, a straight bottom view (a
  flight-simulator model, not an aeroplane, but its wells, hooks and panels are
  where N914AF's are). It is scaled on the published span: the yellow wingtips
  are 674 px apart for 11.796 m, 57.1 px/m.
- `photo_N914AF.jpg`, a real aeroplane at a slant. Its well-to-well line is
  parallel to its tip-to-tip line to within 3 deg, so the ratio of the two
  gives the wells' spacing without knowing the camera.

`scripts/enhance_crop.py` stretches a crop's contrast until the panel seams
show. A brightness profile across them then reads the edges to a pixel:

| | measured | model |
| --- | --- | --- |
| well centre off the centreline | 0.889 / 0.894 (bottom view), 0.91 (N914AF) | 0.900 |
| well's outboard rim | 1.152 / 1.159 | 1.110 (our tyre is the drawing's 0.38 m, so our well is smaller; its centre is the measured one) |
| panel's outboard seam | 1.91 / 1.91 | 1.91, the door hinge |
| panel spanwise | 0.75 m | 0.75 m |
| panel chordwise | 0.29c to 0.635c, 0.60 m | 0.29c to 0.635c |
| hook | forward outboard, ~45 deg round from outboard | slot 0.08 to 0.19 m ahead of the axle |

From x = 0.900 the hinge follows: **x 1.607, z 0.897**. That's on the wing's
chord plane, inside the wing box, and 0.10 m inboard of the tyre centreline,
against the front view's 0.07 for the strut top. The leg is **0.714 m** from
hinge to axle. The door starts 50 mm outboard of the well, which is the skin
the photographs show between the two, so the tyre and the panel no longer
overlap at all.

The **hook** on each well is the retracted trailing arm. The knee sits 0.24 m
ahead of the axle, so folded, the arm runs forward out of the hub, and the
slot is where it does. It is also what makes the well and the leg bay one
opening rather than two holes touching at a point.

**The belly is cut, not dodged.** `cut_well` in `build_fuselage` takes the same
outline out of the belly's side row (row 9, and row 7 on the left). Each gap it
spans becomes one polygon: the inner ring line, then the outline. Where the
outline crosses a station it crosses on the chord between two outline points,
so the belly's hole and the wing's are the same polygon in plan. The vertex put
there is shared by both gaps, so there is no T-junction. The ring line the bite
opens onto keeps its own vertices, and its two ends run straight to the outer
ring vertex rather than following the circle out to the line, because a vertex
on that line would be one the next row never split. Each side's hole is one
closed loop of 12 edges, every vertex on exactly two.

Where the belly is the lower surface, the pocket starts from **the belly**, not
the wing. The wing's edge is up inside the fuselage there, and starting the cup
at it leaves a band with no wall, through which you see the inside of the
aeroplane. So those rim points drop to the belly and rise straight up to the
wing: one collar of faces, only where it is needed.

The straight bottom view is the one angle at which two edges at different
heights line up and hide whatever is between them, so it is not enough on its
own. `render_sf50_views.py --views 11,12,13` renders three views from below at
a slant for that. `scripts/compare_bottom_photo.py` renders the belly gear up
at the photograph's own scale, nose up and right wing on the viewer's left the
way the photograph has them, under the contrast-stretched photograph:

![model against the bottom view](renders/bays/BOTTOM_vs_photo.png)

Its first run had the model upside down. The camera took a half turn about Z
as well as about Y, which reads as "and turn it the right way up" and does the
opposite. The slot then looked as if it were aft of the axle when it is ahead.
Projecting the nose and a wingtip through the camera is what found it: a
comparison that can mirror has to prove its orientation before it proves
anything else.

130 triangles for all of it: the longer outline, the slot, the belly bites,
the collar, and a door cut across two rows.

### The doors do not move with the legs

Each bound part carries the slice of the gear cycle it moves in — legs 0 to
0.78, doors 0.62 to 1. Retracting, the leg is most of the way in before the
doors shut over it; extending, the doors are open before the leg comes through.
Reading the same two windows backwards is what makes extension sequence
correctly without a second table. Driving both off one fraction folds and
closes at once, which looks like the door passing through the leg.

`renders/bays/BAY_COMPARE_belly.png` is the pair that matters.

---

## Levels of detail

Generated from the same parameterised script, never decimated.

| dropped at | what goes |
| --- | --- |
| LOD2 | the nose gear bay - its mouth, pocket and pair of doors - 7 pane columns → 5, fewer fuselage stations, coarser nacelle and wheels, the wing's mid-span station. The ring stays at 11 points: the body is the same shape, the panes are less round |
| LOD1 | ring → 6 points, 9 base stations, 6-point aerofoils, control surfaces merged into their panels, coarser wheels, the intake, the ventral keel and the two gear doors. **The glazing layout stays**: the windscreen and all three cabin windows are still cut as panes |

The station table carries the level each one survives to, and which stations
those are is a shape decision rather than an every-other-one rule: the nose and
tail points that set the length, the windshield base, the belly's low point and
the tail-cone pinch are all marked as surviving to every level, and only the
stations that merely smooth between them are dropped. `LOD2` first came out with every
station marked as surviving; relabelling took 128 triangles off it with no
visible change to the side profile. LOD1 does not use a rank at all: it takes a
hand-picked set of nine stations, because which ones hold the silhouette up
that far down is a judgement rather than a number.

Everything that identifies the aircraft survives to LOD1: the deep blunt nose,
the dorsal engine pod, the low swept wing, the 38.7° V-tail and the dark
wraparound glazing. `renders/LOD_COMPARE.png` stacks all three, and `renders/WIREFRAME_lod3.png`
shows where the triangles actually go — the only view that catches geometry
spent on nothing, which a shaded render hides completely.

**The far level cuts real panes, and that was worth 200 triangles.** It used to
paint its glazing on as one band per face row, on the argument that a pane
outline is unreadable at 170 m. What is readable at 170 m is *where the glass
is*, and a band on the cabin rows put none of it on the nose: the aeroplane had
one long stripe down each side and no windscreen at all, which reads as a white
dart. Cutting the windscreen and the three cabin windows the same way every
other level does took LOD1 from 246 to 442 triangles and is what makes it look
like this aeroplane. The band code path is gone rather than left as an option.

One thing that has to be right for panes to be cut this coarsely: **the ring
line under the window row has to stay below the sills.** A pane is clamped to
its row's own edges, so a lower line that has crept above a sill gives a
flat-bottomed window and a run of zero-area triangles where the pane edge lies
on the line. The 6-point ring had that line at 10° against the 11-point ring's
8°, and the far level validated with two degenerate faces under the door
window. Both rings now use 8°; the upper line is free to move with the ring
size, the lower one is a measurement.

**Wheels and the ground.** Every wheel ring starts at −90°, so there is always a
vertex exactly at the bottom of the tyre at any point count — the failure that
left the Cessna's two coarsest levels floating. The validator asserts it: the lowest
vertex is at `z = 0.0` at all three levels. Every level keeps its tyres: the
one that did without them was the 98-triangle silhouette, and it is gone.

**The tyres are banded, and they are not this airframe's.** They come from
`planes/shared/tyres.py`, which the C172 builds from too: the plain n-sided
tyre in near-black rubber (darker than the bays' grey, which is a shadowed
cavity and a different thing), with one texture. That texture is an atlas: a
white band 68 mm wide straight through the hub on one half, and the band
averaged over a turn on the other. The runtime moves the texture to the
blurred half once the band spins faster than the display can show. The atlas
is this airframe's one texture, which is why the texture count is not zero.
`docs/drawing-fast-rotation.md` has the argument and `docs/aircraft-assets.md`
the runtime side.

The band and its blur cost **no geometry**: the counts are exactly what they
were with plain tyres. It took four passes to get there:

1. One tread block painted white. Free, correct, and invisible in the running
   simulator, because a tyre is looked at from the side.
2. The caps fanned from a hub vertex with one fan triangle painted. That's a
   pizza slice, not a stripe, because every fan triangle widens toward the rim.
3. Two parallel chords cut into the ring (16 triangles a tyre), plus a blurred
   twin `WheelBlur_*` hidden until needed (32 more). This was a real stripe,
   but 144 triangles and three nodes spent on a picture.
4. A planar texture projection on the plain tyre. It's exact for any polygon,
   so the band is a straight, constant-width stripe even on LOD3's 8-sided
   tyre, and the blur is a u offset on the same texture.

![sharp and blurred, the same mesh](renders/tyres/TYRE_COMPARE.png)

LOD1 keeps plain rubber tyres with no texture. None of it is collision
geometry: the loaded aircraft is unpickable, contact is JSBSim's points, and
the model carries no physics mesh.

---

## Validation

`scripts/validate_sf50.py` writes `measurements/validate_LOD*.json`.

| check | LOD3 | LOD2 | LOD1 |
| --- | --- | --- | --- |
| triangles | 1514 | 856 | 442 |
| length 9.357 m | 9.357 | 9.357 | 9.357 |
| span 11.796 m | 11.796 | 11.796 | 11.796 |
| height 3.322 m | 3.3227 | 3.3227 | 3.3219 |
| lowest vertex z | 0.0 | 0.0 | 0.0 |
| degenerate faces | 0 | 0 | 0 |
| loose vertices | 0 | 0 | 0 |
| unapplied transforms | 0 | 0 | 0 |
| symmetry error, max | 0.0 | 0.0 | 0.0 |
| textures | 1 | 1 | 0 |
| materials | 8 | 8 | 4 |

**Symmetry is exactly zero** and should be: unlike the Cessna there is no
propeller, so this airframe has no genuinely asymmetric part. Anything non-zero
here would be a real defect.

**Open boundary edges are all intentional**, and they are the only two lists in
the report that flag correct things. The fuselage is no longer among them: it is
watertight at every level, and so is every edge in it — no edge carries more or
fewer than two faces.

| object | edges | why it is open |
| --- | --- | --- |
| Fuselage | 14 / – / – | the nose bay mouth, and exactly it. Anything else here is a T-junction |
| GearBay_Nose | 14 / – / – | a pocket is a tube, open at the mouth the fuselage opened for it |
| BayDoor_Nose_* | 11, 11 / – / – | a door is a zero-thickness panel; every edge of it is a boundary |
| Nacelle | 16 / 6 / 4 | the faces buried in the fuselage crown are not built |
| Intake | 8 / 6 | the bore is a dished cap, open at its rim inside the lip |
| Wing_Left / _Right | 7 / 6 | root ribs, uncapped inside the fuselage |
| VTail_Left / _Right | 7 / 6 | roots run to the centreline, uncapped deep inside the tail cone |

---

## A second model, by someone else

`tests/cirrus_vision_Sf50/` turned out to be hilos run's Sketchfab model — its
root node is `Sketchfab_model` and its counts match the page. It is **CC
Attribution**, so it can ship, and it now does: as the Vision Jet's `hd` level,
**off by default**, switched on from the panel.

| | hd (hilos run) | our LOD3 |
| --- | --- | --- |
| triangles | 7,294 | 1,220 |
| vertices | 4,578 | 670 |
| download | 3.4 MB (4096² texture) | 60 KB |
| span | 11.796 (the scale datum) | 11.796 |
| length | 9.075 (−3.0%) | 9.357 (exact) |
| landing gear | **none — modelled gear-up** | modelled, on z = 0 |
| symmetry error, max | 0.96 m | 0.0 |
| closed | no, 1,828 boundary edges | yes — the fuselage is watertight |

It is prepared, not modelled: `reorient_ref.py` aligns it to the three view and
`prepare_third_party.py` puts its origin under the CG and exports it with the
same `export_yup` the generator uses, so it lands exactly where ours do.
Neither touches its geometry.

What it is better at is texture and small-scale shape. What it is worse at is
everything measurable, and one thing is not a nuance: **it has no landing
gear**, so parked it hovers 0.67 m over the runway with nothing underneath. It
is right in flight and wrong on the ground. That, plus 3.4 MB and the licence,
is why it is opt-in rather than the default.

The symmetry figure needs reading carefully: 0.96 m max with a 0.26 m mean over
4,574 of 4,578 vertices means the mesh is not mirror-*tessellated*, which is
normal for a hand-built asset — its shape looks symmetric. It is reported
because the validator reports it, not because the model looks lopsided.

---

## Wiring in

`src/flight/aircraft/aircraftCatalog.ts`:

- Three levels of ours — 1514 / 856 / 442 triangles — at `autoFromMeters` of
  40 / 65 / 170, plus hilos run's opt-in `hd` at 0. The two coarse thresholds
  are the Cessna's scaled by the span ratio, so the two airframes switch at the
  same apparent size; the fourth threshold is gone with the level it selected,
  so LOD1 runs from 170 m all the way out. LOD3's is 40 rather than 0 because
  `hd` covers the close range when it is on; with `hd` off, `selectAutoLod`
  gives the close range to the finest level available, so LOD3 still starts at
  the camera. There is one threshold table, not one per setting.
- Every level names its artist. Ours are `felipegalin0`, "measured
  reconstruction, designed explicitly for max runtime speed"; `hd` is
  `hilos run` with its licence and a link, which the panel shows whenever that
  level is being offered.
- `propellerBlades: 0`. It is a jet; the propeller-disc logic never engages and
  the mesh ships no `Propeller` or `Propeller_Disc` node for it to find.
- `modelYawRad: Math.PI`, the standard glTF −Z nose to sim +Z nose rotation.

### `modelOffset.y` is −1.33, and the stance is a compromise

The exported meshes put their origin **on the ground between the wheels**, and
the simulator holds the aircraft reference point `aircraftClearanceMeters()`
above the terrain, so the visual has to be dropped by exactly that. That figure
is `STATIC_STANCE_METERS = 1.33 m` — measured from the **C172** flight model,
which is the flight model every airframe in this project still uses. So −1.33
puts this jet's wheels on the runway, and it is the same number as the Cessna's
for the same reason rather than by coincidence.

It is still a compromise. A real SF50 does not sit 1.33 m up on its reference
point; that number describes a Cessna's gear settling on its oleos. Until an
SF50 flight model exists, the jet's parked stance is a Cessna's stance with a
Vision Jet drawn on top of it. `docs/ground-contact.md` explains why getting
this number wrong is quietly awful — a placement target a few centimetres off
the settled stance reads as sinking into quicksand — which is why the offset
tracks the simulator's stance rather than the airframe's own.

### The V-tail does not move, and that is deliberate

This is the one place the existing rig genuinely does not map, so here is
exactly what happens.

`SURFACE_BINDINGS` in `src/flight/aircraft/aircraftAnimation.ts` binds a node
**by name** and turns it about **one fixed local axis**:

```ts
{ name: "Elevator", key: "elevatorRad", axis: SPAN_AXIS, sign: 1 },
{ name: "Rudder",   key: "rudderRad",   axis: VERTICAL_AXIS, sign: -1 },
```

A V-tail cannot be expressed that way, for two independent reasons:

1. **Two hinge lines, one axis.** The ruddervator hinges lie at ±38.7°. Rotating
   both together about the span axis cones each panel around its own hinge
   instead of turning about it. Measured on this geometry, at 0.4 rad of
   elevator the tip hinge point moves **0.75 m, of which 0.66 m is straight
   aft** — the tail visibly tears away from the fin. Putting the pivot anywhere else only splits that
   error between the root and the tip.
2. **Two inputs, one key.** A real V-tail mixes: each surface deflects by
   elevator ± rudder. A binding carries one `key`, so even with correct axes
   only one of pitch and yaw could drive it.

So the model does not ship an `Elevator` node. What it ships instead is
**`Ruddervator_Left` and `Ruddervator_Right`** as separate objects with identity
rotation and their **origins on their own hinge lines** — verified by
`scripts/verify_rig.py`, which checks the pivots are mirror images and that the
line through them sits at the measured 38.7°:

```
Ruddervator_Left     no     True   [-1.221, -4.882, 2.491]
Ruddervator_Right    no     True   [ 1.221, -4.882, 2.491]
ruddervator pivot half-span 1.221 m, z 2.491 m -> hinge dihedral 38.7 deg
```

The runtime ignores unknown node names, so today those surfaces are inert and
nothing looks broken. Animating them needs a runtime change, not a model
change — the geometry and pivots are already correct:

```ts
// axis is per node rather than one of the three shared constants, and the
// angle is a mix rather than a single key
const RUDDERVATOR_AXIS_R = new Vector3(Math.cos(0.6754), Math.sin(0.6754), 0);
const RUDDERVATOR_AXIS_L = new Vector3(-Math.cos(0.6754), Math.sin(0.6754), 0);
{ name: "Ruddervator_Right", mix: (s) => s.elevatorRad - s.rudderRad,
  axis: RUDDERVATOR_AXIS_R, sign: 1 },
{ name: "Ruddervator_Left",  mix: (s) => s.elevatorRad + s.rudderRad,
  axis: RUDDERVATOR_AXIS_L, sign: -1 },
```

(0.6754 rad is 38.7°. The signs are set so a positive elevator carries both
trailing edges down: in glTF axes a rotation about `(cos Γ, sin Γ, 0)` moves the
trailing edge at +Z toward `(sin Γ, −cos Γ, 0)`, i.e. downward and outboard, and
the left panel's mirrored axis needs the opposite sign to match.) That change
touches shared runtime code and the C172's binding table, so it is left for a
separate decision rather than folded into a model build; it is recorded in
`TODO.md`.

The wing surfaces have no such problem. `Aileron_Left`, `Aileron_Right`,
`Flap_Left` and `Flap_Right` all bind and hinge correctly, with pivots on the
0.72-chord hinge line at working Y = −4.713. So do the three gear legs, which
`GEAR_BINDINGS` turns a quarter turn each about one axis — see "Landing gear"
above, and `docs/aircraft-assets.md` for why the transit is run by the rig
rather than read back from the flight model.

---

## What is still wrong

Read this before treating any of it as accurate.

- **The V-tail span follows the callout, not two of the three views.** 8% of
  tail span is at stake. See above; this is the largest open question.
- **The windshield's lateral wrap is not measured directly.** Its two long
  edges are traced off the side view and its width falls out of where those
  heights land on the section, which the front view then confirms — the panes
  sit inside the drawn outline with the frame's thickness to spare. What is not
  independently measured is how far around the section the glass reaches at any
  one station.
- **The main tyres are the drawing's 0.38 m, not the AMM's 0.457 m.** They
  cannot both be right and the drawing is self-consistent with the height.
- **The gear retracts as one rigid swing about one hinge**, because that is
  what the runtime rig can drive. A real leg folds on a side or drag brace and
  the strut shortens as it goes; the transit here is a quarter turn and only the
  two ends of it are measured. The main hinge is 0.12 m above the wing chord
  plane as a consequence, where a real trunnion would sit lower.
- **The wheel wells have no depth.** They are dark discs hugging the wing's
  lower surface, not recesses: from below, which is the only place they are
  visible, they read correctly; at a grazing angle they read as what they are.
  A real well means a cutter for the wing.
- **The leg panel is the strut-mounted door, and stowed it ends up inside the
  wing rather than flush with its lower surface.** On the aeroplane that panel
  closes the leg bay flush. Here it is carried by the leg and lands about 70 mm
  inside the skin.
- **Which edge the nose doors hinge on is not measured.** The three view draws
  the panel outline but not its hinges. A clamshell pair is what the aeroplane
  has and what keeps the model symmetric; the exact hinge lines are not read
  off anything.
- **Nothing stops the gear being raised on the ground.** It is visual only —
  the flight model this airframe flies has fixed gear — so a raised gear
  leaves the aeroplane standing on an invisible stance rather than settling.
- **The nacelle is seated on the crown**, not standing on a pylon with the
  7–13 cm gap the drawing shows.
- **Wing incidence is 0°.** It is not measurable from a three view and no
  published figure was found, so it was not guessed at.
- **Wing t/c is 0.158**, taken from the front view's projected thickness with
  the line weight removed. The raw projection reads about 18%, which is thick
  for the class; the correction is a judgement, not a measurement.
- **The side view's own two scales disagree by 1.7%** (386.2 longitudinal
  against 379.6 vertical). Length is taken from the longitudinal scale and
  height from the vertical, so both match their published figures exactly and
  the 1.7% is absorbed as a very slight vertical compression of everything in
  between.
- **Flap and aileron spans are conventional, not measured.** The three view
  draws no hinge lines at all.
- **The wing root fairing is carried by the fuselage sections, not by a fillet
  surface.** The extra width goes in with the max-width line pulled down to the
  wing chord plane, which is free, but a super-ellipse cannot be wide low and
  narrow high: the body ends up about 7 cm too wide at mid-height in that
  region. The plan and front outlines are right, which is the trade taken.
- **The cabin windows are polygons of seven columns, not smooth curves.** Their
  top and bottom edges follow the measured super-ellipse to 6.9 mm; their fore
  and aft ends close at the station just clear of the pane's tip.
- **The reference model is 3% short** once its span is set to the published
  figure, and its fuselage is up to 0.24 m wider than the drawing at the cabin.
  Nothing is taken from it in metres except the windshield's roof line, which
  the drawing gives independently and agrees with to 8 mm; everywhere else the
  drawing wins.
- **The strip closing each pane still fans at its two ends.** Six triangles at
  LOD3 have an aspect quality under 0.05, all of them there. The window row is
  0.72 m tall abeam the aft window and the window in it is 0.35 m, so the wedge
  that closes each end of the block runs from a pane tip 100 mm tall to a
  station edge 720 mm tall. Three ways of squaring it were tried and measured,
  and none pays:

  | tried | result |
  | --- | --- |
  | split the block's long gaps (ribs) | five stations added, and the dissolve pass took every one back out — an interpolated station sits on the chord between its neighbours, so the fan around it is flat. Identical mesh. |
  | beautify the edges (a flip is free) | two triangles improved at a tolerance that does not move the skin; the flips that would fix the rest cross the pane's own outline |
  | a partial ring line under the sill | would work — the sills are level and a constant-angle ring line falls away aft, which is the root cause — and costs about 36 triangles to tidy a dozen |

  At 700 px/m the skin around those windows renders perfectly smooth: the
  slivers are flat, so their normals are the normals of the surface they lie
  in. The count is the minimum tiling of a flat region whose two sides have
  different vertex counts. It is left alone deliberately.
- **No panel lines, antennas, deice boots, door outline, exhaust, static ports
  or wheel fairings.** The door's outline is drawn on the three view and is not
  modelled — only its window is.
- **The 18.3 ft callout comes out 1% short** when measured against the
  longitudinal scale the other three longitudinal dimensions agree on. The
  extension line is probably drawn slightly inside the fairing's trailing edge.

---

## Regenerating

Everything is scripted; a dimension change is an edit to one number in
`scripts/generate_sf50.py`.

```bash
cd planes/Cirrus_Vision_Jet/agent_workspace

# one level
blender -b --factory-startup --python scripts/generate_sf50.py -- \
    --lod 3 --blend work/sf50_lod3.blend --glb exports/Cirrus_Vision_Jet_LOD3.glb

# check it
blender -b --factory-startup --python scripts/validate_sf50.py -- \
    work/sf50_lod3.blend --json measurements/validate_LOD3.json
blender -b --factory-startup --python scripts/verify_rig.py -- \
    exports/Cirrus_Vision_Jet_LOD3.glb

# look at it, against the drawing and on its own
blender -b --factory-startup --python scripts/compare_drawing.py -- \
    work/sf50_lod3.blend side renders/COMPARE_side_vs_drawing.png --px 150

# the stowed pose, which is the only way to see whether the retracted gear
# pokes out of the skin.  --gear never changes what is exported.
blender -b --factory-startup --python scripts/generate_sf50.py -- \
    --lod 3 --gear 0 --blend work/sf50_lod3_gearup.blend
blender -b --factory-startup --python scripts/render_sf50_views.py -- \
    work/sf50_lod3_gearup.blend renders/gear_up GEARUP --fit 13 --res 640 --keepmat
blender -b --factory-startup --python scripts/render_sf50_views.py -- \
    work/sf50_lod3_gearup.blend renders/gear_up GEARUP_close \
    --views 06,09,10 --fit 3.4 --res 700 --keepmat

# the bays, which need --center to be framed at all: each is 0.2-0.9 m across
# on a 9 m aeroplane, and a whole-aircraft view shows one as a few grey pixels
blender -b --factory-startup --python scripts/render_sf50_views.py -- \
    work/sf50_lod3.blend renders/bays BAY_main --views 06,10 --fit 1.6 \
    --res 760 --keepmat --center 0.0,-0.40,0.70
blender -b --factory-startup --python scripts/montage.py -- \
    renders/bays/BAY_COMPARE_belly.png 2 \
    renders/bays/BAY_belly_down_06_Bottom.png \
    renders/bays/BAY_belly_up_06_Bottom.png

# the main wells from BELOW at a slant - the angles a straight bottom view
# hides - and the belly against the bottom-view photograph at its own scale
blender -b --factory-startup --python scripts/render_sf50_views.py -- \
    work/sf50_lod3_gearup.blend renders/bays WELL_up --views 06,11,12,13 \
    --fit 1.9 --res 700 --keepmat --center 1.25,-0.40,0.70
blender -b --factory-startup --python scripts/compare_bottom_photo.py -- \
    work/sf50_lod3_gearup.blend renders/bays/BOTTOM_vs_photo.png

# a reference crop with its contrast stretched, to read a faint panel seam
blender -b --factory-startup --python scripts/enhance_crop.py -- \
    measurements/photo_PS-CVJ_bottom_view.jpg out.png 640 285 735 345 \
    --scale 8 --grey --clip 0.5

# which face row can hold an opening this wide, and how far outboard the belly
# is still the OUTER surface - the two things a belly cut-out turns on
blender -b --factory-startup --python scripts/belly_rows.py -- --lod 3 -4.40
blender -b --factory-startup --python scripts/render_sf50_views.py -- \
    work/sf50_lod3.blend renders/final_lod3 final --fit 13 --res 640 --keepmat

# where the polygons went, and which of them show anything
blender -b --factory-startup --python scripts/audit_fuselage.py -- \
    work/sf50_lod3.blend
blender -b --factory-startup --python scripts/wireframe.py -- \
    work/sf50_lod3.blend side renders/WIREFRAME_lod3.png --px 150
blender -b --factory-startup --python scripts/wireframe.py -- \
    work/sf50_lod3.blend side renders/preview/WIRE_cabin_after.png \
    --px 420 --only Fuselage --half --win 2.9,-1.5,2.6,1.2

# master .blend with every level in its own collection
blender -b --factory-startup --python scripts/assemble_master.py -- \
    work exports/Cirrus_Vision_Jet_master.blend
```

Re-measuring the glazing off the reference model, and re-preparing it as the
`hd` level:

```bash
# align it to the drawing; prints the crown-line residual it achieved
blender -b --factory-startup --python scripts/reorient_ref.py -- \
    ../tests/cirrus_vision_Sf50/cirrus_vision_Sf50.glb work/refA_oriented.blend
blender -b --factory-startup --python scripts/compare_drawing.py -- \
    work/refA_oriented.blend side renders/preview/ref_vs_drawing_side.png \
    --px 150 --nose-origin

# its windshield in metres, and on screen so the numbers can be trusted
blender -b --factory-startup --python scripts/measure_windshield.py -- \
    work/refA_oriented.blend
blender -b --factory-startup --python scripts/render_ref_glazing.py -- \
    work/refA_oriented.blend renders/preview/refglz

# origin under the CG, exported the way the generator exports
blender -b --factory-startup --python scripts/prepare_third_party.py -- \
    work/refA_oriented.blend exports/Cirrus_Vision_Jet_HilosRun.glb
# and check it lands where ours land - this failure is otherwise silent
blender -b --factory-startup --python scripts/compare_assets.py -- \
    exports/Cirrus_Vision_Jet_LOD3.glb exports/Cirrus_Vision_Jet_HilosRun.glb
```

`scripts/montage.py` tiles any set of PNGs into one sheet, which is the only
way most of these comparisons say anything.

Re-measuring the drawing:

```bash
# ink runs in image columns 2500..2600, rows 400..1745
blender -b --factory-startup --python scripts/col_query.py -- \
    measurements/ref_SF50_three_view_1200dpi.png span col 400 1745 2500 2600 10
# the same in metres, as fuselage top/bottom per station
blender -b --factory-startup --python scripts/profile_drawing.py -- \
    side top 0 -9.3 0.15
```

Then copy the GLBs to `public/aircraft/cirrus-vision-jet/` and update the
triangle counts in `src/flight/aircraft/aircraftCatalog.ts`. The counts are
asserted, so `npx vitest run` catches a forgotten one.

## Finishing check

Would someone who knows the type identify this immediately as a Vision Jet
rather than a small jet of roughly the right layout? Yes — the dorsal pod, the
V-tail, the deep round nose and the wraparound glazing are all present and in
the right places, and they survive to LOD1. The proportions trace to a factory
drawing sampled per pixel rather than to an impression of the aircraft, and the
places where the drawing and the published numbers disagree are listed above
rather than silently averaged.
