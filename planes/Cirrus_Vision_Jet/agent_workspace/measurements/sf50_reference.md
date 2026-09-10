# Cirrus SF50 Vision Jet (G2) — reference dimensions used for reconstruction

Coordinate convention (Blender): +X = right wing, +Y = nose (forward), +Z = up.
This is Blender's default glTF export orientation, so the exported GLB is
nose = -Z, up = +Y, which is what Babylon.js expects.

Model origin: X = 0 on the centreline, Z = 0 at the ground (wheels touch z = 0),
Y = 0 at the longitudinal CG. All station numbers below are **working Y**, with
**Y = 0 at the nose tip and aft negative**; the generator shifts by `CG_SHIFT`
at the end.

## Sources

Three, in descending order of authority. The three view is the only one any
dimension comes from; the other two are used to place features it draws
ambiguously and to check the result against a real aircraft.

1. **`tests/SF50-POH.pdf`** — the factory three view. Every number in this file.
2. **Photographs of real airframes.** No dimension is taken from any of them —
   they are perspective shots — but they settle questions the drawing answers
   ambiguously or not at all, and each one below settled something the model
   had wrong.

   | file | what it is | what it settled |
   |---|---|---|
   | `photo_N50SF.jpg` | side-on ramp shot, G2 | the cabin window count |
   | `photo_N914AF.jpg` | belly, climbing out, **gear up** | that the main wheels retract into the **wing root** and stay **visible** — two dark tyre faces, no door over them. The model had them buried 24 mm inside the wing and a bay cut into the belly that the aeroplane does not have |
   | `photo_N124MW_gear_down.jpg` | side-on, on approach, **gear down** | the gear doors open. They are long straight-edged panels, not portholes — the nose mouth was 0.52 m of rounded rectangle and is now 0.94 m and square |
   | `photo_N291AH_ramp.webp` | parked, nose gear close up | the nose leg and its scissor link with the doors shut |
   | `photo_sf50_air_to_air.jpg`, `photo_sf50_air_to_air_2026.webp` | air-to-air, gear up | the clean configuration, for the silhouette |

   `scripts/make_crops.py` cuts the regions each reading was taken from into
   `measurements/crops/`, so they are reproducible from what is in the
   repository rather than described.
3. **`tests/cirrus_vision_Sf50/cirrus_vision_Sf50.glb`** — a downloaded
   reference model, which turned out to be hilos run's CC-BY Sketchfab model.
   `scripts/reorient_ref.py` puts it in this project's frame and reports how
   well: scaled on the published span, its crown line matches the drawing's to
   **15 mm rms over 140 stations**, and its length then comes out **−3.0%**.
   It carries no landing gear and its cabin windows are painted into a 4096²
   texture rather than modelled, so it cannot be measured for those. What it
   did settle is the windshield, which has its own submesh — see "The
   windshield has two edges, not one" below. It is a hypothesis about shape,
   not a source of dimensions.

### `tests/SF50-POH.pdf` — Cirrus Vision SF50 Airplane Flight Manual, P/N 31452-001,
Revision 4 (20 Nov 2018), page 1-4, "Figure 1-1: Airplane Three View"
(drawing id SF50_FM01_0011B). Downloaded from flightsimcoach.com.

Rendered to `measurements/ref_SF50_three_view_1200dpi.png` with

    pdftoppm -f 20 -l 20 -r 1200 -png -gray -x 2280 -y 2600 -W 5500 -H 8000

so the figure is a 5500x8000 crop of the page at 1200 dpi. Every pixel number in
this file refers to that image. `scripts/col_query.py` reports the ink runs in
any column or row; `scripts/profile_drawing.py` does the same in metres.

## Published figures (POH page 1-4 callouts, plus the AMM extract on page 8-x)

| quantity | value |
|---|---|
| length | 30.7 ft (9.357 m) |
| wingspan | 38.7 ft (11.796 m) |
| height | 10.9 ft (3.322 m) |
| height, flat nose strut tyre | 11.6 ft (3.54 m) |
| wing area | 195.7 sq ft (18.181 m^2) |
| nose to wing LE at the wing/fuselage junction | 11.1 ft (3.383 m) |
| nose to the aft end of the wing root fairing | 18.3 ft (5.578 m) |
| V-tail span (tip to tip) | 14.7 ft (4.481 m) |
| main gear track | 11.2 ft (3.414 m) |
| cabin length / width / height (internal) | 11.5 / 5.1 / 4.1 ft |
| main tyre | 18 x 5.5, 8-ply |
| nose tyre | 5.00 x 5, 10-ply |

## The drawing is not uniformly scaled — three axis scales, not one

This is the single most important thing to know before reading a number off this
drawing, and getting it wrong distorts the whole airframe by up to 8%.

Measuring the dimension lines gives, in pixels:

| dimension | pixels | axis | px/m |
|---|---|---|---|
| length 30.7 ft, side view (x 819.5 -> 4432.5) | 3613 | longitudinal | 386.2 |
| length, plan view (y 1883 -> 5498) | 3615 | longitudinal | 386.2 |
| nose->wing LE 11.1 ft, plan (y 1884.5 -> 3193.5) | 1309 | longitudinal | 386.9 |
| nose->fairing TE 18.3 ft, plan (y 1884.5 -> 4015.5) | 2131 | longitudinal | 382.1 |
| span 38.7 ft, front view (x 273.5 -> 5101.5) | 4828 | lateral | 409.3 |
| span, plan view wingtips (x 273 -> 5101) | 4828 | lateral | 409.3 |
| gear track 11.2 ft, front view | 1398 | lateral | 409.5 |
| height 10.9 ft, side view (y 478.5 -> 1737.5) | 1259 | vertical | 379.6 |
| intake top -> fuselage crown, side view | 72 | vertical | 379.6 |
| intake top -> fuselage crown, front view | 78 | vertical | 409.4 |

So each view was placed and resized on its own:

    SIDE   x = longitudinal 386.2 px/m,  y = vertical 379.6 px/m
    PLAN   y = longitudinal 386.2 px/m,  x = lateral  409.4 px/m
    FRONT  x = lateral      409.4 px/m,  y = vertical 409.4 px/m

The two views that share an axis agree on it to 0.1%, which is the check that
this is right rather than three guesses. It is confirmed independently by two
quantities that were never used to fit it:

- **Wing area.** The drawn planform integrates to 2.90e6 px^2. Divided by
  `386.2 * 409.4` that is **18.30 m^2** against a published 18.181 — 0.6% high,
  and the rounded tip the trapezoid ignores accounts for most of that. Read as a
  single uniformly scaled drawing it would come out at 19.8 m^2, 9% wrong.
- **Nose tyre.** Drawn 137 px across, i.e. 0.355 m longitudinally and 0.361 m
  vertically — a circle. Published 5.00 x 5 is about 0.353 m.

Reading the drawing as uniformly scaled instead gives a span/length ratio of
1.336 against the published 1.261: 6% too much wing. That was the trap here, and
it is the equivalent of the Cessna 172's fuselage-proportion error.

### Ground line and attitude

The side view is drawn **level, parked, wheels on the ground**: the ground line
is a single horizontal run at rows 1735-1741 (centre y = 1737.5) and both tyres
touch it. No nose-low correction is needed, unlike the 172G drawing.

The **front view is drawn with the oleos extended** and is therefore useless for
vertical positions. With its vertical scale fixed at 409.4 px/m by the
crown/intake spacing, z = 0 lands at y = 7554 while the tyres are drawn at
y = 7731-7740 — 0.44 m of extension. Every vertical number below comes from the
side view; the front view is used only for lateral shape and for dihedral.

## Two places the drawing contradicts itself

Both are recorded here rather than quietly averaged away.

1. **V-tail span.** The front view draws the tips at x = 1768 and 3602, i.e.
   4.480 m, which matches the 14.7 ft callout to three figures. The plan view
   draws them at x = 1838 and 3538, i.e. 4.147 m (13.6 ft), and the side view's
   tip leading edge agrees with the plan view. Two of the three sources for the
   number — the published callout and the front view — agree exactly, so
   **4.481 m is used**, keeping the plan view's measured chords and moving its
   sweep angles the 1.5 deg that implies. A 13.7 ft callout would have made the
   plan and side views right instead; the digit is worth doubting.
2. **Main tyre.** Drawn 0.37-0.38 m across; the AMM calls out 18 x 5.5, i.e.
   0.457 m. The drawing is followed, because the drawn wheel is what puts the
   fuselage where the 10.9 ft height callout says it is. The nose tyre needs no
   such choice — drawn and published agree.

## Longitudinal layout

Working Y = 0 at the nose tip. This is the measurement the Cessna 172 taught us
to get first, and the SF50's is dominated by how far aft the wing sits.

| feature | working Y |
|---|---|
| nose tip | 0.000 |
| windshield, forward corner (sill meets the crown) | -1.480 |
| nose axle | -1.138 |
| windshield roof line leaves the crown | -2.180 |
| windshield, aft corner (sill meets roof) | -2.600 |
| fuselage crown (highest point of the body) | -3.40 |
| wing LE, root (centreline, extrapolated) | -3.297 |
| wing LE at the wing/fuselage junction | -3.388 (11.1 ft callout) |
| main axle | -4.434 |
| engine intake lip | -4.83 |
| wing TE, root (centreline, extrapolated) | -5.264 |
| aft end of the wing root fairing | -5.52 (18.3 ft callout) |
| nacelle aft end | -7.17 |
| V-tail LE, root | -7.575 |
| V-tail TE, root | -9.018 |
| V-tail tip LE | -8.60 |
| tail cone tip / V-tail tip TE (aft-most) | -9.357 |

Ahead of the wing LE root: **3.30 m. Behind it: 6.06 m.** The wing sits at 35% of
the length; the C172's sits at 23%.

## Fuselage side profile (side view, level, ground z = 0)

Topmost and bottom-most fuselage outline per station, nacelle / gear / ventral
strake excluded. Run edges, so depths carry about +0.02 m of line weight.

| working Y | belly z | top z | depth |
|---|---|---|---|
| -0.10 | 1.020 | 1.333 | 0.31 |
| -0.40 | 0.908 | 1.477 | 0.57 |
| -0.80 | 0.830 | 1.603 | 0.77 |
| -1.20 | 0.775 | 1.715 | 0.94 |
| -1.60 | 0.735 | 1.924 | 1.19 |
| -2.00 | 0.704 | 2.146 | 1.44 |
| -2.40 | 0.681 | 2.309 | 1.63 |
| -2.80 | 0.667 | 2.416 | 1.75 |
| -3.20 | 0.656 | 2.466 | 1.81 |
| -3.60 | 0.638 | 2.466 | 1.83 |
| -4.00 | 0.60  | 2.418 | 1.82 |
| -4.40 | 0.60  | 2.339 | 1.74 |
| -4.80 | 0.62  | 2.243 | 1.62 |
| -5.20 | 0.70  | 2.101 | 1.40 |
| -5.60 | 0.78  | 1.993 | 1.21 |
| -6.00 | 0.87  | 1.921 | 1.05 |
| -6.40 | 0.95  | 1.878 | 0.93 |
| -6.80 | 1.04  | 1.868 | 0.83 |
| -7.20 | 1.10  | 1.857 | 0.76 |
| -7.60 | 1.19  | 1.836 | 0.65 |
| -8.00 | 1.25  | 1.63  | 0.38 |
| -8.80 | 1.16  | 1.61  | 0.45 |
| -9.36 | tail cone tip, z ~ 1.40 | | |

**Shape notes that carry the silhouette:**

- The **belly is nearly level** from Y = -1.2 to -5.0 (0.78 -> 0.62 m), then
  sweeps up hard. Almost all of the tail-cone taper is in the belly, exactly as
  on the 172, but starting much further aft.
- The **crown is flat-topped over the cabin** — the top line only moves from
  2.466 to 2.418 between Y = -3.2 and -4.0.
- The nose is **blunt and deep**: at 0.4 m aft of the tip the section is already
  0.57 m deep and 0.62 m wide.
- A thin **ventral strake** runs under the nose from about Y = -0.2 to -1.44 at
  z ~ 0.61-0.68, below the fuselage line.

## Fuselage plan half-width (plan view row scans)

| working Y | half-width | note |
|---|---|---|
| -0.15 | 0.190 | |
| -0.40 | 0.312 | |
| -0.70 | 0.419 | |
| -1.00 | 0.508 | |
| -1.30 | 0.583 | |
| -1.60 | 0.644 | |
| -1.90 | 0.694 | |
| -2.20 | 0.737 | |
| -2.50 | 0.772 | |
| -2.80 | 0.792 | |
| -3.10 | 0.812 | |
| -3.40 | 0.820 | wing root fairing starts |
| -3.70 | 0.845 | |
| -4.00 | 0.845 | |
| -4.30 | 0.862 | |
| -4.60 | 0.892 | |
| -4.90 | 0.934 | widest, at the fairing |
| -5.27 | ~0.93 | wing TE root; the fairing ends here |
| -5.50 | 0.633 | |
| -5.80 | 0.580 | |
| -6.10 | 0.531 | |
| -6.50 | 0.470 | |
| -7.00 | 0.394 | |
| -7.50 | 0.377 | |
| -8.00 | 0.142 | tail cone |
| -9.00 | 0.105 | |

Maximum body half-width without the fairing is about 0.85 m, i.e. a 1.70 m
external body around the published 1.554 m internal cabin — 7 cm of wall per
side, which is the cross-check that the lateral scale is right.

## Wing

Straight-tapered, low-mounted, one panel per side, no kink.

| quantity | value | how |
|---|---|---|
| span | 11.796 m | published |
| LE at the centreline | Y = -3.297 | plan, LE line extrapolated |
| TE at the centreline | Y = -5.264 | plan, TE line extrapolated |
| root chord | 1.968 m | difference of the two |
| LE sweep | 5.81 deg aft (dY/dX = -0.1017) | plan, X = 0.9 .. 5.36 |
| TE sweep | 2.26 deg forward (dY/dX = +0.0395) | plan, same range |
| tip chord at X = 5.898 | 1.134 m | the two lines at the tip |
| taper ratio | 0.576 | |
| area, trapezoid | 18.30 m^2 | vs 18.181 published, +0.6% |
| dihedral | 4.81 deg | front view mid-thickness line |
| chord-plane z at the centreline | 0.762 m | front view, anchored on the V-tail tip |
| chord-plane z at the tip | 1.258 m | front view |
| thickness/chord | ~0.164 | front view, stroke centres |
| incidence | not measurable from this drawing; 0 used | |

Unlike the 172, the taper is on **both** edges, and the trailing edge is not
straight — it sweeps forward about half as much as the leading edge sweeps back.

## V-tail

| quantity | value | how |
|---|---|---|
| span, tip to tip | 4.481 m | published; front view agrees |
| root chord (centreline) | 1.443 m | plan, LE/TE extrapolated to X = 0 |
| tip chord | 0.757 m | plan chords at the adopted tip |
| LE at the centreline | Y = -7.575 | plan |
| TE at the centreline | Y = -9.018 | plan |
| tip LE | Y = -8.60 | plan / side agree |
| tip TE | Y = -9.357 | sets the overall length |
| dihedral | 38.7 deg | front view arm mid-line |
| chord-plane z at the centreline | 1.530 m | front view arm extrapolated to X = 0 |
| chord-plane z at the tip | 3.322 m | = the published height |

The tip height falling out at exactly the published overall height is the check
that the dihedral and the front view's vertical scale are both right.

## Engine nacelle

Dorsal pod on a short pylon, on the centreline aft of the cabin.

| quantity | value |
|---|---|
| intake lip | Y = -4.83, top z = 2.643 |
| top of the pod (highest point) | Y = -5.05, z = 2.676 |
| aft end | Y = -7.17, z ~ 1.95-2.19 |
| plan half-width | 0.34 at Y = -5.2, 0.29 at -6.5, 0.19 at -7.0 |
| intake bore | about 0.55 m across |

## Wing root fairing

The body blends out to a much larger half-width beside the wing than it carries
over the cabin, and both the plan view and the low-angle photograph show how
large and smooth that blend is. Outer (fairing) half-widths, against the body's
own inner outline drawn inside them:

| working Y | fairing | body proper |
|---|---|---|
| -3.70 | 0.845 | 0.816 |
| -4.00 | 0.843 | 0.807 |
| -4.30 | 0.862 | 0.780 |
| -4.60 | 0.884 | 0.757 |
| -4.90 | 0.932 | 0.716 |
| -5.10 | 0.968 | 0.688 |
| -5.50 | — | 0.633 |

The front view confirms it independently: at rows 7150-7220 (z = 0.82-0.99, the
wing chord plane) its body outline reaches ±0.94, against ±0.81 higher up.

## Landing gear

Retractable tricycle; drawn extended in both views, compressed in the side view.

| quantity | value |
|---|---|
| nose axle | Y = -1.138, z = 0.179 |
| nose tyre | 0.358 m diameter (published 5.00 x 5) |
| main axle | Y = -4.434, z = 0.190 |
| main tyre | 0.380 m diameter drawn (published 18 x 5.5 = 0.457 m) |
| main gear track | 3.414 m (11.2 ft callout) |
| wheelbase | 3.296 m |

## Glazing

Measured, not estimated. Scanning **row 1000** of the reference image — z = 1.94,
where the window band is widest — crosses every pane edge in the cabin as a
vertical ink line, and gives nine of them:

| ink at x | working Y | what it is |
|---|---|---|
| 1810 | **-2.565** | aft edge of the cockpit side glass |
| 1852 | -2.674 | forward edge of the door outline |
| 1890 | **-2.774** | forward edge of the door window |
| 2080 | **-3.264** | aft edge of the door window |
| 2118 | -3.363 | aft edge of the door outline |
| 2162 | **-3.477** | forward edge of cabin window 3 |
| 2340 | **-3.937** | aft edge of cabin window 3 |
| 2422 | **-4.150** | forward edge of cabin window 4 |
| 2560 | **-4.506** | aft edge of cabin window 4 |

The two unbolded lines are the door's own outline, which encloses its window and
is not glazed. Vertical extents come from column scans through each pane:

| pane | Y range | z range |
|---|---|---|
| windshield | -2.600 .. -1.480 | see below |
| cockpit side glass | -2.565 .. -2.050 (drawn to -1.50) | 1.72 .. 2.19 |
| door window | -3.264 .. -2.774 | 1.72 .. 2.18 |
| cabin window 3 | -3.937 .. -3.477 | 1.72 .. 2.15 |
| cabin window 4 | -4.506 .. -4.150 | 1.73 .. 2.08 |
| windshield centre post half-width (plan) | | 0.031 |

**Four side apertures plus the windshield**, and the photographs agree: N50SF
shows the windshield's side pane, then three windows, and nothing aft of the
last oval. An earlier pass glazed one continuous band from -4.60 to -2.80
because the panes had been eyeballed off a low-resolution crop rather than
measured, and it read as a single letterbox.

### The windshield has two edges, not one

`profile_drawing.py side runs <y>` prints every ink run in one column of the
side view. Between the crown outline and the belly there are two of them
through the cockpit, and both are the windshield's:

| Y | sill z | roof z | note |
|---|---|---|---|
| -1.480 | 1.836 | — | the sill meets the crown outline: the forward corner |
| -1.560 | 1.805 | — | |
| -1.680 | 1.781 | — | |
| -1.900 | 1.745 | — | |
| -2.100 | 1.726 | — | |
| -2.180 | 1.724 | 2.219 | the roof line leaves the crown outline here |
| -2.260 | 1.723 | 2.197 | the sill's low point, abeam the pilot |
| -2.400 | 1.751 | 2.187 | |
| -2.480 | 1.798 | 2.177 | |
| -2.540 | 1.877 | 2.162 | |
| -2.580 | 2.000 | 2.128 | |
| -2.600 | 2.100 | 2.100 | sill meets roof: the aft corner |

Forward of Y = -2.18 there is no second line inside the crown outline, because
there the glass really does run over the top and the crown outline IS the top
of the glazing. Aft of it the body carries on above the glass — the drawn gap
grows from nothing to 0.26 m by the aft corner.

**This is the line an earlier pass missed**, and missing it is what put a
bubble canopy on the aircraft: glazing everything above the sill runs the glass
over the crown for the windshield's whole length. The reference model in
`tests/cirrus_vision_Sf50/` agrees to within 8 mm — its GLASS submesh tops out
at z = 2.189 against the drawing's 2.19 — which is two independent sources for
the same line.

The front view says the same thing from the other side: `profile_drawing.py
front prof` puts the glazing's top edge at z = 2.145 on the centreline against
a fuselage crown of 2.455, so nothing anywhere is glazed above 2.19.

### Reading the reference model

`tests/cirrus_vision_Sf50/cirrus_vision_Sf50.glb` carries its windscreen as a
separate GLASS submesh, which is a better source for that outline than a three
view — the drawing shows it only as a line. It arrives at an arbitrary scale
and attitude; `reorient_ref.py` aligns it and prints how well:

| | reference | published | note |
|---|---|---|---|
| span | 11.796 | 11.796 | the scale datum: wingtip to wingtip |
| length | 9.076 | 9.357 | −3.0% once the span is right |
| crown line | — | — | matched to **15 mm rms** over 140 stations |

The crown-line residual is the number that matters, because it says the
forward fuselage — the part the windshield sits on — lines up. Two earlier
alignments did not, and both produced measurements that looked plausible and
were wrong:

- **Principal axes (SVD) of the vertex cloud** put the pitch out by about 13
  degrees. PCA weights by where vertices happen to be dense, and a model
  tessellated for looks has a fine nose and a coarse tail.
- **Nose tip to tail tip** put it out by 5 degrees, because the aft-most point
  of this aircraft is the V-tail tip, 1.7 m off the centreline and far above
  the tail cone.

What works is a landmark for each thing that has one — the wingtip pair is the
lateral axis, the farthest pair near the symmetry plane is the longitudinal —
and a least-squares fit against the drawing's own crown line for the rest.

The cockpit side glass is drawn as far forward as Y = -1.50, but its sill is at
z = 1.82 there while the ring's window row has fallen to 1.42-1.76 - the row
follows the section's shoulder down toward the nose while the real window band
stays level. Forward of Y = -2.05 the wraparound is therefore carried by the
crown rows alone, which track the real sill to within 0.1 m.
