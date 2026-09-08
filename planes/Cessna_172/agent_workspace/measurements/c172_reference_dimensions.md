# Cessna 172S Skyhawk — reference dimensions used for reconstruction

Coordinate convention (Blender):  +X = right wing, +Y = nose (forward), +Z = up.
This is Blender's default glTF export orientation (+Y forward / +Z up), so the
exported GLB is nose = -Z, up = +Y (standard glTF forward), which is what
Babylon.js expects after its import handedness flip.

Model origin: X=0 on the centreline, Z=0 at the ground (wheels touch z=0),
Y=0 at the longitudinal CG. All station numbers in the generator script are
expressed relative to the WING LEADING EDGE ROOT, then shifted by CG_SHIFT.

## Authoritative overall dimensions (172S)
| quantity | value |
|---|---|
| length | 8.280 m (27 ft 2 in) |
| wingspan | 10.998 m (36 ft 1 in) |
| height (to fin tip) | 2.718 m (8 ft 11 in) |
| wing area | 16.17 m^2 (174 sq ft) |
| wing chord, root | 1.63 m (5 ft 4 in) |
| wing chord, tip | 1.09 m (3 ft 7 in) |
| dihedral | 1 deg 44 min (1.733 deg) |
| horizontal stabiliser span | 3.429 m (11 ft 4 in) |
| main gear track | ~2.50 m |
| wheelbase (nose axle -> main axle) | ~1.65 m (65 in) |
| propeller diameter | 1.93 m (76 in) |
| cabin width (max) | 1.00 m (39.5 in) |
| cabin height | 1.22 m (48 in) |
| static prop ground clearance | ~0.28 m (11 in) |

## Derived planform
Wing area 16.17 m^2 cannot be produced by a simple root->tip taper
(root 1.63 / tip 1.09 gives only 14.96 m^2).  The C172 wing is semi-tapered:
constant chord inboard, tapered outer panel.

  half area = 1.63*b1 + (1.63+1.09)/2*(5.5-b1) = 7.48 + 0.27*b1
  16.17/2 = 8.085  =>  b1 = 2.24 m

So the constant-chord section runs to ~2.3 m from the centreline (~41% semi-span),
then tapers to the tip.  The trailing edge is essentially straight across the
whole span; the taper is taken almost entirely on the LEADING edge, giving
~9.4 deg of outer-panel LE sweep.  This matches the real aircraft (flap TE and
aileron TE are very nearly collinear).

## Thrust line / prop
prop centre z = 0.28 (clearance) + 0.965 (radius) = 1.245 m  -> use 1.25 m
Consistent with cowl centreline and spinner axis.

## Vertical stack cross-check
belly 0.80 + cabin height 1.22 = cabin roof 2.02 m  (wing sits on the cabin roof)
fin tip 2.72 m.  Consistent with published height.

## Sources
- https://www.thisdayinaviation.com/tag/cessna-172s-skyhawk/   (overall dims)
- https://www.dimensions.com/element/cessna-172-skyhawk-aircraft (3-view dims)
- https://www.flugzeuginfo.net/acdata_php/acdata_cessna172_en.php (chords, dihedral, area)

## Reference models analysed
| model | tris | verts | meshes | mats | measured size (span,len,height) | verdict |
|---|---|---|---|---|---|---|
| tests/cessna_172_low_poly_flight_sim_optimized.glb | 724 | 434 | 9 | 0 | 11.00 x 8.28 x 2.72 | dimensions exactly right, SHAPE WRONG - lens/"banana" fuselage, no cabin, no tailcone, stick-and-ball gear. NEGATIVE EXAMPLE. |
| tests/Low-Poly_Cessna_172/Low-Poly_Cessna_172.glb | 5490 | 12883 | 12 | 12 | 11.00 x 8.75 x 2.99 (after rescale) | genuinely reads as a C172; far over budget, arbitrary Sketchfab pose, kitbashed materials (F16_*). Useful for planform/front-view proportion only; its side profile is bulbous. |

---

# Measured station data extracted from the 172G 3-view (iteration 2)

Source drawing: `measurements/ref_Cessna_172G_Skyhawk_3-view_line_drawing.png`
(Cessna 172G, 26'-11" x 36'-2" x 8'-11" - the swept-tail configuration that matches
the modern 172R/S shape).  Extracted with `scripts/col_query.py` (per-column /
per-row ink runs), then converted with:

    side view scale  S = 104.7 px/m   (859 px for 8.204 m, confirmed against the
                                       plan view: 1157 px for 11.02 m span)
    wing LE root     abs x = 403 (side view) / plan y = 1079
    ground line      y_g(x) = 324 - (x-500)*0.02353
                     (the drawing is nose-low by 1.35 deg: the nose gear is drawn
                      depressed, which is why the published "8'-11" MAX" applies)

All working coordinates below have **Y = 0 at the wing leading-edge root**.

## Longitudinal layout (the error that mattered most)

| feature | measured (m) | first attempt had |
|---|---|---|
| spinner tip | +1.94 | +2.75 |
| aft-most point (rudder TE) | -6.34 | -5.53 |

Confirmed independently in both views (side 1.93, plan 1.94).  The first blockout
put **0.8 m too much length ahead of the wing and 0.8 m too little behind it**,
which is why it read as a stubby generic high-wing rather than a C172.

| station | working Y |
|---|---|
| spinner tip | +1.94 |
| cowl front / spinner base | +1.55 |
| firewall, windshield base | +0.48 |
| windshield top, cabin front | -0.19 |
| wing LE root | 0.00 |
| wing TE root | -1.63 |
| rear cabin (Omni-Vision window) | -1.75 |
| fin LE root + horiz. stab LE root | -4.51 |
| fin tip, forward corner | -5.30 |
| rudder TE (aft-most) | -6.34 |

## Fuselage side profile (level attitude, ground z = 0)

| working Y | belly z | top z | depth |
|---|---|---|---|
| -0.93 | 0.65 | 1.92 | 1.27 |
| -1.88 | 0.67 | 1.62 | 0.96 |
| -2.36 | 0.67 | 1.47 | 0.80 |
| -2.84 | 0.74 | 1.45 | 0.71 |
| -3.31 | 0.80 | 1.44 | 0.64 |
| -3.79 | 0.87 | 1.43 | 0.56 |
| -4.46 | 0.96 | ~1.42 | 0.46 |
| -5.03 | 1.04 | ~1.41 | 0.37 |

**Key shape insight:** aft of the cabin the tail-cone TOP line is almost dead
level (1.47 -> 1.41 over 2.7 m); essentially all of the taper comes from the
belly sweeping UP.  The first blockout converged both lines symmetrically, which
is what made the tail read as a generic dart instead of a Cessna tail cone.

## Fuselage plan half-width (from plan-view row scans)

| working Y | half-width (m) |
|---|---|
| +0.77 | 0.51 |
| -1.71 | 0.54 |
| -2.09 | 0.50 |
| -2.66 | 0.42 |
| -3.62 | 0.29 |
| -4.19 | 0.215 |
| -4.57 | 0.163 |

## Other measured values
- belly under the cabin: 0.65-0.69 m above ground; fuselage depth at the cabin 1.27-1.32 m
- horizontal stabiliser mounted at z = 1.38, i.e. just BELOW the tail-cone top line
- horizontal stabiliser LE sweep ~0.35 m over the semi-span
- wing constant-chord section runs out to at least 2.72 m from the centreline
  (col 300 = 2.72 m out still shows LE at y = 0), so TAPER_START = 2.65,
  not the 2.24 implied by area alone.  Area with b1 = 2.65 is 16.4 m^2 vs 16.17 published.
- main axle at working -0.93, nose axle at +0.70 -> wheelbase 1.63 m
- cowl bottom line slopes DOWN going aft (0.95 at the spinner base to ~0.6 at the
  firewall); the first blockout had it rising toward the nose.
