"""
Procedural low-poly Cirrus SF50 Vision Jet generator.

    blender -b --factory-startup --python generate_sf50.py -- \
        --lod 3 --blend out.blend [--glb out.glb] [--gear 0]

The LOD ladder runs COARSEST FIRST: --lod 1 is the far mesh and every step up
adds detail, so a bigger number is always a better mesh and the top of the
ladder does not move when a level is added below it.

Method: measured reconstruction.  The fuselage is a loft through explicit
cross-section STATIONS (not a stretched primitive); the flying surfaces are
lofts through explicit sections on a measured planform.  Every number comes
from measurements/sf50_reference.md, which records where it was read on the
POH three view and which of that drawing's three axis scales it used.

Convention:  +X = right wing, +Y = nose, +Z = up.
Working origin during construction: Y = 0 at the NOSE TIP (aft is negative),
Z = 0 at the ground.  Everything is shifted by CG_SHIFT at the end so the
exported origin sits on the ground directly below the CG.
"""

import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix

# ----------------------------------------------------------------------------
# args
# ----------------------------------------------------------------------------
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


LOD = int(arg("--lod", 0))
OUT_BLEND = arg("--blend")
OUT_GLB = arg("--glb")
# Gear position, 1 = down and 0 = up.  The exported model is always built gear
# DOWN - the runtime retracts it by rotating the three LandingGear_* nodes - so
# this exists to render the stowed state and check that nothing pokes out of
# the skin, which is the one thing a gear-down render cannot show.
GEAR = float(arg("--gear", 1.0))

# ----------------------------------------------------------------------------
# measured constants  (metres; working Y = 0 at the nose tip)
# ----------------------------------------------------------------------------
LENGTH = 9.357                      # 30.7 ft
SPAN = 11.796                       # 38.7 ft
SEMI = SPAN / 2.0                   # 5.898
HEIGHT = 3.322                      # 10.9 ft, to the V-tail tip

# wing: straight taper, low mounted, taper on BOTH edges
WING_LE_ROOT = -3.297               # plan view, LE line extrapolated to X = 0
WING_TE_ROOT = -5.264
ROOT_CHORD = WING_TE_ROOT - WING_LE_ROOT   # -1.967, kept signed for clarity
ROOT_CHORD = abs(ROOT_CHORD)
LE_SLOPE = -0.10169                 # dY/dX, LE sweeps aft   (5.81 deg)
TE_SLOPE = 0.03951                  # dY/dX, TE sweeps fwd   (2.26 deg)
WING_Z0 = 0.762                     # chord-plane z on the centreline
DIHEDRAL = math.radians(4.81)
WING_INCIDENCE = 0.0                # not measurable from the three view
WING_TC = 1.0                       # the section table already carries t/c

# V-tail: span from the published 14.7 ft, which the front view confirms and
# the plan view does not - see measurements/sf50_reference.md
VT_SEMI = 4.481 / 2.0               # 2.2405, PROJECTED semi-span
VT_LE_ROOT = -7.575
VT_TE_ROOT = -9.018
VT_LE_TIP = -8.600
VT_TE_TIP = -9.357                  # aft-most point: sets the overall length
VT_Z0 = 1.513                       # chord-plane z on the centreline; measured
                                    # 1.530, then solved backwards so the tip's
                                    # upper surface lands on the published
                                    # 3.322 m height exactly and every LOD
                                    # reports the same overall height
VT_DIHEDRAL = math.radians(38.7)
VT_ROOT_ETA = 0.0                   # the panels run to the centreline, deep
                                    # inside the tail cone, so their uncapped
                                    # roots face each other and are never seen
RUDDERVATOR_HINGE = 0.70            # chord fraction
RUDDERVATOR_SPAN = (0.10, 0.99)     # span fraction of the moving surface

# engine: dorsal pod, on the centreline
NAC_STATIONS = [
    # (y, z_bottom, z_top, half_width)
    (-4.86, 2.270, 2.500, 0.300),   # intake lip: a wide, shallow dorsal opening
    (-5.02, 2.230, 2.665, 0.330),   # the cowl rises fast behind the lip
    (-5.55, 2.140, 2.620, 0.343),
    (-6.30, 2.010, 2.490, 0.310),
    (-7.12, 1.930, 2.220, 0.130),   # aft end
]
INTAKE_INSET = 0.09                 # how far the dark bore sits inside the lip

# The main gear bay is cut into the WING, between two spanwise stations added
# for it, and it is one face row of the aerofoil deep. The leg comes down at
# 48% chord, which is row 4 - the lower surface from 0.72 back to 0.35 of the
# chord - so that is the row the mouth is taken out of.
#
# This replaces a flat plate at x = 1.660 that hung below the wing on the
# drawing's side-view outline. It was the right feature read the wrong way: a
# gear door is a panel IN the skin, not a slab beside the leg, and modelled as
# a slab it was as wide as the linkage and read as a vestige of nothing.
# The mouth is ONE opening covering the wheel and the leg bay together, because
# on the aeroplane the wheel well and the leg bay are one indent at one depth,
# and modelling them as two things at two depths - a real cut outboard and a
# flat dark patch inboard - read as two unrelated marks on the wing.
#
# It runs from x = 0.60, which is inboard of the stowed wheel and behind the
# fuselage anyway (the belly is the outer surface inboard of about 0.66), out to
# 1.78. The bay covers where the RETRACTED leg lies, not where the extended one
# hangs: the wheel stows at x = 0.850 and the leg runs outboard from it to 1.54.
# It was 1.42 to 1.92 first - centred on the EXTENDED leg - which put the whole
# fold outside it.
#
# photo_N914AF.jpg is what settled the outboard half: gear up, each round wheel
# well has a rectangular panel immediately OUTBOARD of it. Scaled on the tyre in
# the same frame (0.38 m across 110 px, so 290 px/m) that panel is 0.67 m wide
# and starts at the well's rim.
WING_BAY_X = (0.60, 1.78)           # spanwise edges of the mouth
# ...and it is not one rectangle. The wheel end HUGS the tyre: a circle of
# WELL_R about the stowed axle, merged into the rectangular leg bay outboard of
# WELL_JOIN. A rectangle wide enough to contain the wheel is a much bigger hole
# than the aeroplane has, and it reads as a box with a tyre loose in it.
WELL_R = 0.245                      # wheel well radius; the tyre is 0.190
WELL_JOIN = 1.02                    # where the circle merges into the rectangle
WELL_ARC = 9                        # points on the arc
# The DOOR covers only the leg half. The wheel end stays open - the retracted
# tyre is visible from outside and nothing closes over it.
WING_DOOR_X = (1.10, 1.78)
WING_BAY_ROW = 4                    # lower surface, 0.72 -> 0.35 chord
WING_BAY_DEPTH = 0.16               # how far the pocket rises into the wing
WING_BAY_TAPER = 0.94               # gentle: a hard taper over a 1.18 m mouth
                                    # walls the stowed tyre off from its own bay
# PAST vertical, so the open door leans OUTBOARD and clears the extended wheel.
# At 82 deg it hung in the wheel's own plane - the tyre's outer face is at
# x = 1.777 and the hinge at 1.78 - and the two z-fought. A gear door that hangs
# outboard of its wheel is also what the photographs show.
WING_BAY_OPEN = 112.0               # how far the door swings down and out

# gear
NOSE_AXLE_Y = -1.138
NOSE_TIRE_R = 0.179                 # 5.00 x 5, drawn and published agree
MAIN_AXLE_Y = -4.434
MAIN_TIRE_R = 0.190                 # as drawn; the AMM calls out 18 x 5.5
GEAR_TRACK = 3.414                  # 11.2 ft
NOSE_TIRE_W = 0.115
MAIN_TIRE_W = 0.140

# The main leg is a near-vertical oleo strut hanging off the wing at the gear
# station.  It is NOT the Cessna's bowed spring-steel leg sweeping out from the
# belly - that shape was carried over from generate_c172.py and does not belong
# on this airframe.  The front view draws the leg as a straight member whose
# top sits 0.07 m inboard of the tyre centreline (x 3367 against 3396 px,
# lateral scale 409.4), and the side view puts it at x 2511-2529 px, i.e.
# Y = -4.383 to -4.428, just ahead of the axle.
MAIN_STRUT_TOP_X = GEAR_TRACK / 2.0 - 0.070
MAIN_STRUT_TOP_Y = -4.406
MAIN_STRUT_TOP_Z = 0.880            # buried in the wing box; the wing chord
                                    # plane at this station is z = 0.900

# ----------------------------------------------------------------------------
# The main leg is a TRAILING LINK, not a rod with a wheel on the end.
# measurements/crops/photo_main_gear_linkage.png shows three members:
#
#   - a rigid FORWARD leg down from the wing to a knee joint, which sits ahead
#     of and above the axle;
#   - a TRAILING ARM hinged at that knee, running aft and down to the axle;
#   - an OLEO aft of the leg, down from the wing onto the arm near the axle.
#     It is the one with a polished piston showing, so it is the shock and the
#     other two are rigid.
#
# Scaled on the tyre in the same frame - 0.190 m of radius across 170 px, so
# 895 px/m - the knee is 0.240 m ahead of the axle and 0.050 m above it. The
# member tops are NOT measured: the photograph loses them in the wing shadow
# about 0.27 m above the axle, so they keep the height the drawing already
# fixed and only the lower geometry comes from the photograph.
LINK_KNEE = (-4.194, 0.240)         # (Y, z) of the knee, ahead of the axle
LINK_OLEO_F = 0.72                  # where the oleo meets the arm, knee to axle
# (across the run, thickness), so a member can be deeper than it is wide the
# way a real one is. Read against the tyre in the same frame.
LINK_R = dict(leg=(0.056, 0.036), oleo=(0.050, 0.044), arm=(0.044, 0.028))

# ----------------------------------------------------------------------------
# retraction
#
# Each leg is one rigid swing about one fixed hinge line, because that is all
# the runtime rig can drive: one named node turning about one local axis.  The
# leg's object ORIGIN is that hinge, and the wheel and the door are parented to
# the leg so one rotation carries all three.
#
# MAIN: inboard, about a FORE-AFT hinge in the wing root.  measurements/
# photo_N914AF.jpg is a belly shot with the gear up and settles it - the two
# retracted main wheels lie FLAT (so the axle has turned from lateral to
# vertical, which only an inboard swing does) in shallow wells either side of
# the keel, far inboard of the 3.414 m track.  The front view's side brace runs
# up and inboard from the leg, which folds the same way.
#
# NOSE: FORWARD, about a LATERAL hinge behind the top of the leg. This was aft
# for two builds, read off a brace in the three view that is a few pixels wide,
# and it was wrong. measurements/photo_N124MW_gear_down.jpg settles it and is
# not ambiguous: on approach, gear down, a long door hangs open FORWARD of the
# nose leg. Measured against the nose tyre in the same frame (0.358 m across
# 85 px) it is 1.10 m long, which is the ventral band the side view draws at
# Y = -0.35 to -1.43 - 1.07 m, and to within the reading the same panel.
#
# So the band is not a keel strake with a bay behind it. The band IS the doors,
# the bay is under it, and the leg swings forward into it. The `Keel` object
# that used to stand in for it is gone: it was a solid plate where the aeroplane
# has a pair of doors, and it was occupying the very space the bay needs.
#
# A 90 deg swing pins each hinge exactly: it is the one point that carries the
# extended axle to the stowed axle in a quarter turn.  Solving
#     stowed - hinge = rot90(extended - hinge)
# gives the closed form in `quarter_turn_hinge` below, so the stowed positions
# are what is chosen here and the hinges follow from them.  Both were chosen to
# bury the wheel inside the skin, which `--gear 0` renders so it can be checked.
# Stowed OUTBOARD and LOW, in the wing root and proud of its lower surface,
# because that is where the photograph puts it: the retracted main wheels are
# visible from outside, as two dark tyre faces in the wing root, and no door
# covers them - the panel beside each one covers the leg, not the wheel. The
# first pass buried them at (0.620, 0.830), which `scripts/surface_probe.py`
# reports as 24 mm inside the wing's lower surface and 115 mm inside the
# belly's: correct kinematics, invisible, and the wrong part of the aeroplane.
#
# At x = 0.850 the wing's lower surface runs z = 0.745 to 0.772 across the
# tyre's width, so a disc centred at 0.797 stands 18 to 45 mm proud of it.
MAIN_STOWED = (0.850, 0.797)        # (x, z) of the retracted main axle
NOSE_STOWED = (-0.750, 1.080)       # (y, z) of the retracted nose axle
NOSE_SENSE = -1                     # forward, not aft


def tube(p0, p1, r0, r1, n=4):
    """A capped tube from p0 to p1, with its rings PERPENDICULAR to the run.

    `diamond_ring` builds its ring in the XY plane, which is right for a member
    that hangs vertically and degenerate for one that does not - a trailing arm
    runs mostly fore-and-aft, and a ring in XY there lies along the arm's own
    axis rather than across it.

    `r0`/`r1` are (across, thickness) pairs, so a member can be deeper than it
    is wide the way a real one is.
    """
    a, b = Vector(p0), Vector(p1)
    d = b - a
    length = d.length
    if length < 1e-9:
        return [], []
    d /= length
    # Any vector not along the run will do to start the frame; pick the one
    # that is furthest from it so the cross product is well conditioned.
    seed = Vector((0.0, 0.0, 1.0)) if abs(d.z) < 0.9 else Vector((0.0, 1.0, 0.0))
    u = d.cross(seed).normalized()
    v = d.cross(u).normalized()
    rings = []
    for p, (across, thick) in ((a, r0), (b, r1)):
        rings.append([tuple(p + u * (thick * math.cos(t)) + v * (across * math.sin(t)))
                      for t in (math.pi * k / 2.0 for k in range(n))]
                     if n == 4 else
                     [tuple(p + u * (thick * math.cos(2 * math.pi * k / n))
                            + v * (across * math.sin(2 * math.pi * k / n)))
                      for k in range(n)])
    return loft(rings, cap_start=True, cap_end=True)


def quarter_turn_hinge(extended, stowed, sense=1):
    """The one hinge point that carries `extended` to `stowed` in 90 degrees.

    Both are 2-D points in the plane the leg swings in - (x, z) for a main leg
    folding inboard, (y, z) for the nose leg folding forward - with the second
    axis up.  `sense` is which way the quarter turn goes: +1 writes it as
    (a, b) -> (b, -a) and -1 as (a, b) -> (-b, a).  Either way
    `stowed - h = rot(extended - h)` has exactly one solution, which is what
    makes the hinge a consequence of where the leg ends up rather than a guess.
    """
    (ex, ez), (sx, sz) = extended, stowed
    if sense > 0:
        return ((ex - ez + sx + sz) / 2.0, (ex + ez + sz - sx) / 2.0)
    return ((ex + sx + ez - sz) / 2.0, (sx - ex + ez + sz) / 2.0)


MAIN_HINGE = quarter_turn_hinge((GEAR_TRACK / 2.0, MAIN_TIRE_R), MAIN_STOWED)
NOSE_HINGE = quarter_turn_hinge((NOSE_AXLE_Y, NOSE_TIRE_R), NOSE_STOWED,
                                sense=NOSE_SENSE)

# ----------------------------------------------------------------------------
# wheel bays
#
# The finest level cuts the gear openings into the belly and hangs a door over
# each one, because with a retracting gear the skin under it is no longer a
# place nothing happens: the gear leaves, and what it leaves behind is a hole.
#
# An opening is cut EXACTLY the way a cabin window is - traced as a shape and
# cut into the ONE face row that holds it, with the ring either side of that
# row never learning it is there - and it uses the same code, because the only
# difference between a window and a bay mouth is what goes in the hole
# afterwards. See `cut_pane`. The cost of doing it any other way is the 140
# slivers the glazing paid for once already.
#
# The row is the constraint. A pane is clamped to its row's own edges, so an
# opening has to fit inside one row at every station it spans, with margin:
#
#     row 9 (300-340 deg), right lower belly:  x 0.53..0.81 fwd, 0.59..0.89 aft
#     row 7 (200-240 deg), its mirror
#     row 8 (240-300 deg), the keel row:       x -0.43..0.43 at the nose bay
#
# (y_c, y_half, x_c, x_half, exponent, cap z).  The main mouths are letterbox
# slots on the lower belly - the widest that stays clear of both ring lines -
# and the nose mouth is on the centreline in the keel row, which is wide.
GEAR_BAYS = {
    # The nose bay only. There is no main bay cut into the fuselage, and the
    # first pass was wrong to put one there: the main wheels retract into the
    # WING root, not the belly. A centreline hole under the wing box is a hole
    # with a wing behind it - see "The bays" in REPORT.md - and the real
    # aeroplane has nothing there at all.
    #
    # TWO doors, hinged on the mouth's two long edges and opening sideways.
    # One panel across the whole mouth, hinged forward, is what this had first,
    # and it swings down into the airflow like a speed brake. The real doors
    # are a pair that part in the middle, which is also what keeps the model
    # symmetric - a single door on a centreline mouth is the only asymmetric
    # part in the aeroplane, and the validator's symmetry error stops being a
    # check the moment one part is allowed to be non-zero.
    # LONG and SQUARE, not a porthole. The first mouth was 0.52 m of rounded
    # rectangle - about the size of the wheel and nothing else - and read as a
    # hatch rather than as a gear bay. The side view draws the panel it belongs
    # to: the ventral band runs x 955 to 1370 px, i.e. Y = -0.35 to -1.43, so
    # it is 1.07 m long with straight parallel edges. This mouth takes the
    # length aft of the keel plate, which occupies the forward half of that
    # band, and `ex` 8 makes the outline a rectangle with the corners knocked
    # off rather than a super-ellipse.
    "Nose": dict(row=8, y=(-0.82, 0.40), x=(0.0, 0.170), ex=6.0, cap=1.32,
                 hinge="clam", open=88.0),
}
# A bay mouth is a panel, not a window: five columns put the corners where they
# belong and the extra two 'fine' carries would only round an edge nobody reads
# at this size. Read with the bay's own `ex` of 6 rather than a window's 2-3,
# the outermost pair sits at 82% of full width - a corner knocked off a
# rectangle, which is what a gear bay door has.
#
# These two numbers are tuned against the validator, not just the eye. The
# fuselage's symmetry error is exactly zero and is the check that caught a
# nacelle built on an odd-numbered ring, and some combinations here bring it
# back non-zero: ONE crown vertex, 14 to 36 mm out, nowhere near the bay. It is
# the dissolve pass, not the cut - `make` dissolves the whole fuselage after
# the mouth is cut, and a mouth tessellated differently changes what it finds
# flat somewhere else, on one side and not its mirror. Change either number and
# re-read `symmetry_error_m` before believing the render.
BAY_COLUMN_FRACTIONS = (0.94, 0.55, 0.0, -0.55, -0.94)
# How far the pocket behind the mouth pulls in as it rises. Straight-walled it
# would follow the mouth's footprint up through a section that is still
# widening, and the two would meet; 0.86 keeps the whole pocket inside the skin
# at every station either bay spans.
BAY_TAPER = 0.86
# The door sits this far proud of the skin when it is shut. Flush is coplanar,
# and coplanar is z-fighting all along the rim.
BAY_DOOR_LIFT = 0.006
# Filled in by build_fuselage: each mouth's outline, in loop order, so the
# pocket and the door are built on the opening's own vertices rather than on a
# second guess at where it is.
BAY_MOUTHS = {}
# ...and each mouth's centreline on the surface, which is where a clamshell
# pair of doors meets.
BAY_SPINES = {}
# Each clamshell bay's hinge-line direction, measured off the mouth and printed
# at the end of the build: the runtime needs the same axis, and on a sloping
# belly it is not one of the three cardinal ones.
BAY_DOOR_AXES = {}

# The origin goes on the ground under the CG.  Quarter-MAC works out at
# Y = -3.97 and the tricycle balance point at about -4.03, so:
CG_SHIFT = -4.00

# ----------------------------------------------------------------------------
# fuselage stations
#   (y, z_bottom, z_maxwidth, z_top, half_width, p_upper, p_lower, level)
# p_* is the super-ellipse exponent of that half: 2.0 = ellipse, larger = flatter
# with harder shoulders.  level is how much detail a station is worth, NOT a
# LOD number: 0 = every level, because the station carries a feature (the nose
# and tail points that set the length, the windshield base, the belly's low
# point, the tail-cone pinch); 2 = the finest level only, an in-between station
# that just smooths.
# ----------------------------------------------------------------------------
STATIONS = [
    # Blunt, deep nose: 0.4 m aft of the tip the section is already 0.57 m deep.
    # level 0: the nose cap sets the overall length, so every LOD keeps it
    (0.000, 1.175, 1.190, 1.215, 0.030, 2.1, 2.1, 0),
    (-0.15, 0.995, 1.170, 1.365, 0.190, 2.2, 2.3, 2),
    (-0.40, 0.908, 1.170, 1.477, 0.312, 2.3, 2.5, 0),
    (-0.80, 0.830, 1.180, 1.603, 0.419, 2.4, 2.7, 2),
    (-1.20, 0.775, 1.200, 1.715, 0.508, 2.5, 2.9, 0),
    # windshield: the section squares up under the glazing
    (-1.60, 0.735, 1.240, 1.924, 0.644, 2.7, 3.0, 0),
    (-2.00, 0.704, 1.290, 2.146, 0.700, 2.9, 3.1, 0),
    (-2.40, 0.681, 1.340, 2.309, 0.745, 3.0, 3.1, 2),
    # cabin: the crown is nearly flat from here to Y = -4.0
    (-2.80, 0.667, 1.380, 2.416, 0.792, 3.1, 3.1, 0),
    (-3.20, 0.656, 1.400, 2.466, 0.813, 3.1, 3.1, 2),
    # Wing root fairing. The drawing draws the body blending out to 0.97 m of
    # half-width at the wing trailing edge, against 0.67 m for the body itself,
    # and the belly photograph shows how large and smooth that blend is. It
    # costs no triangles to carry it here instead of leaving the wing to poke
    # out of a narrow body: the extra width goes in with the max-width line
    # pulled DOWN to the wing chord plane, so the section stays slim over the
    # cabin and only swells beside the wing.
    (-3.60, 0.638, 1.330, 2.466, 0.845, 2.8, 3.0, 0),
    # the belly dips to its lowest under the wing box
    (-4.00, 0.575, 1.230, 2.418, 0.843, 2.5, 3.0, 0),
    (-4.40, 0.585, 1.120, 2.339, 0.868, 2.3, 3.0, 0),
    (-4.90, 0.640, 1.020, 2.210, 0.932, 2.2, 3.0, 2),
    (-5.27, 0.706, 1.020, 2.090, 0.955, 2.2, 2.9, 0),
    (-5.80, 0.800, 1.340, 1.985, 0.580, 2.4, 2.7, 2),
    (-6.40, 0.955, 1.400, 1.878, 0.478, 2.3, 2.6, 0),
    (-7.00, 1.075, 1.470, 1.863, 0.394, 2.3, 2.5, 2),
    (-7.50, 1.170, 1.480, 1.845, 0.375, 2.2, 2.4, 0),
    # tail cone: the body pinches hard just ahead of the V-tail roots - 0.375 m
    # of half-width becomes 0.175 in 35 cm - and stays a thin, deep blade to
    # the tail. Missing that pinch left the plan view with a fat tail wedge.
    (-7.85, 1.250, 1.450, 1.650, 0.175, 2.2, 2.3, 0),
    (-8.40, 1.205, 1.400, 1.590, 0.120, 2.2, 2.2, 0),
    (-9.00, 1.180, 1.400, 1.615, 0.095, 2.2, 2.2, 2),
    # the very end of the tail cone sweeps UP, not down: the drawing puts its
    # tip 0.2 m above where a straight taper would leave it
    (-9.357, 1.555, 1.610, 1.665, 0.016, 2.2, 2.2, 0),
]

# Ventral keel under the nose gear bay: a thin plate hanging below the belly,
# 0.15 m deep, unmistakable in the side silhouette and invisible in plan.
KEEL = [(-0.45, 0.845, 0.760), (-0.70, 0.846, 0.697),
        (-1.10, 0.788, 0.631), (-1.50, 0.745, 0.580)]
KEEL_HALF_T = 0.030

# Glazing.  The panes are described as SHAPES in the (station, height) plane
# rather than as face rows, and every face is tested against them, so a window
# is as round as the mesh under it can resolve rather than as square as the
# ring happens to be.
#
# The windshield is bounded by TWO traced curves, not one. Scanning the side
# view column by column shows a second line inside the crown outline from
# Y = -2.18 aft: that is the top of the glazing, and the body carries on above
# it. Glazing everything above the sill instead runs the glass over the crown
# and gives the aircraft a bubble canopy - which is exactly what it looked
# like, and the reference model in tests/ has the same two edges.
#
# Both are read the same way, off `profile_drawing.py side runs`, which prints
# every ink run in one column; the windshield edges are the runs between the
# crown outline and the belly.
WINDSHIELD_SILL = [
    (-1.440, 2.600),    # above the crown: nothing forward of here is glass
    (-1.480, 1.836),    # the sill meets the crown outline here
    (-1.560, 1.805),
    (-1.680, 1.781),
    (-1.900, 1.745),
    (-2.100, 1.726),
    (-2.260, 1.723),    # the low point, abeam the pilot
    (-2.400, 1.751),
    (-2.480, 1.798),
    (-2.540, 1.877),
    (-2.580, 2.000),
    (-2.600, 2.100),    # aft corner: sill and roof meet
]
# Forward of the first station the glazing simply runs over the crown, which is
# what the drawing shows - there is no second line inside the outline there.
WINDSHIELD_ROOF = [
    (-2.180, 2.219),    # leaves the crown here
    (-2.260, 2.197),
    (-2.300, 2.195),
    (-2.400, 2.187),
    (-2.480, 2.177),
    (-2.540, 2.162),
    (-2.580, 2.128),
    (-2.600, 2.100),
]

# Cabin windows as super-ellipses: (centre Y, half-length, centre z, half-height,
# exponent).  Centres and extents are the measured pane edges; the exponent is
# read off the drawing by comparing the pane's width at mid-height with its
# width 0.13 m higher - window 3 measures 0.46 m and 0.35 m, which is an
# ellipse, not a rounded rectangle.
CABIN_WINDOWS = [
    (-3.019, 0.245, 1.950, 0.230, 2.5),   # door window, squarer than the rest
    (-3.707, 0.230, 1.935, 0.215, 2.2),   # cabin window 3
    (-4.328, 0.178, 1.905, 0.175, 2.2),   # cabin window 4
]

WINDSHIELD_Y = (-2.600, -1.480)   # forward corner of the windshield base
# Half-width of the windshield's centre post, measured on the plan view. It is
# the same width for its whole run: on the aircraft it is a straight black
# divider between the two panes, and an earlier version that tapered to nothing
# at each end drew it as a rectangle with a spike on either tip.
#
# The taper was there to keep the post's ends off a ring line that had not been
# split. It is not needed for that: the post's edges are cut into the two rows
# either side of top dead centre, so its end vertices sit on those rows' own
# chords, not on the ring line they share with the rows outside - and the gap
# beyond each end of the post is cut too, with the edge running in to x = 0.
WINDSHIELD_POST_HALF = 0.031
SNAP_M = 0.004                    # a cut nearer than this to a ring vertex
                                  # is that ring vertex


def post_half(y):
    """Half-width of the windshield's centre post at station y.

    Zero outside its run: forward of the windshield's tip there is no glass to
    divide, and aft of where the roof line leaves the crown the glass has
    already stopped going over the top.
    """
    return (WINDSHIELD_POST_HALF
            if WINDSHIELD_ROOF[0][0] <= y <= WINDSHIELD_Y[1] else 0.0)

# Fractions of the pane half-length to put a station at. The +/-1.0 pair sits
# just outside the pane and closes it off; the rest sample its outline.
PANE_COLUMN_FRACTIONS = {
    # The pane's outline is sampled at these fractions of its half-length, and
    # a column is the most expensive vertex in the model: FOUR triangles, not
    # two - one on the pane and one in the strip between the pane and the ring,
    # top and bottom. It also decides how well those strips tile. The ring line
    # under the window row has three vertices across a pane and the pane has
    # these, so the strip between them can only fan, and the further apart the
    # two counts are the longer the arms.
    #
    # So the count is measured, not chosen. Against the super-ellipse each pane
    # is cut from, sampled over the same range so the blunt end is not doing
    # the work:
    #
    #     columns   door     window 3   window 4   triangles per pane side
    #        12     1.8 mm    1.7 mm     1.4 mm      52
    #         9     4.3       4.3        3.5         40
    #         7     6.9       6.2        5.0         32
    #         5    18.4      16.4       13.3         24
    #
    # The drawing these windows were read off is good to about 10 mm, so seven
    # is where the outline stops being the limiting error and starts being free
    # accuracy nobody can see - and it is two arms shorter on every fan.
    'fine': (0.97, 0.80, 0.45, 0.0, -0.45, -0.80, -0.97),
    'coarse': (0.95, 0.70, 0.0, -0.70, -0.95),
}
# A column this close to a station the pane's row is already split at is moved
# onto it instead of being kept beside it. Two vertices 5 mm apart in Y would
# otherwise leave a splinter the full height of the strip.
PANE_COLUMN_SNAP = 0.10
# The pane's row is split just clear of each end of the pane, so the strip
# around it is the pane's own width and no wider. Without it the aft window's
# block ran from a station 150 mm ahead of the pane to one 400 mm behind it,
# and the strip closing that block was eight splinters up to 860 mm long
# fanning from a single station vertex - the "sun" the wireframe showed.
PANE_MARGIN = 0.06
# There is no rule here for RIBBING that block. The strip closing it has the
# pane's columns on one side and the block's stations on the other, so where
# one station gap faces several columns it can only fan - and below the aft
# window that strip is 0.37 m deep, so the fan is 300 mm arms. Splitting those
# gaps was tried: it added five stations, and the dissolve pass took every one
# of them straight back out, because a station interpolated between two others
# sits on the chord between them and the fan around it is flat. Same vertex
# count, same triangle count, same mesh. Beautifying the edges instead (a flip
# is free) improved two triangles at a tolerance that does not move the skin.
# The fan is the minimum tiling of a flat strip whose two sides have different
# vertex counts, and the only thing that squares it is a ring line under the
# window sill - which the section cannot give, because the sills are level and
# a constant-angle ring line falls away aft, and which as a partial line would
# cost about 36 triangles to tidy a dozen that no render shows.


def _trace(pts, y, outside):
    """Linear interpolation along a traced (station, height) curve."""
    if y > pts[0][0] or y < pts[-1][0]:
        return outside
    for (y0, z0), (y1, z1) in zip(pts, pts[1:]):
        if y1 <= y <= y0:
            t = (y0 - y) / (y0 - y1)
            return z0 + (z1 - z0) * t
    return outside


def sill_z(y):
    """Lower edge of the windshield glazing at station y."""
    return _trace(WINDSHIELD_SILL, y, 1e9)


def roof_z(y):
    """Upper edge of the windshield glazing at station y.

    Forward of where the roof line leaves the crown there is no upper edge -
    the glass runs over the top - so this returns a height nothing can reach.
    """
    return _trace(WINDSHIELD_ROOF, y, 1e9)


def is_glass(y, z):
    """Is this point on the fuselage skin glazed?"""
    if sill_z(y) < z < roof_z(y):
        return True
    for yc, a, zc, b, n in CABIN_WINDOWS:
        if abs((y - yc) / a) ** n + abs((z - zc) / b) ** n <= 1.0 + 1e-6:
            return True
    return False


# One uniform ring for the whole fuselage, the same angles at every station.
# `window` names the one face row on each side the cabin windows are cut into:
# row 0 spans z = 1.71 to 2.23 at the cabin and 1.38 to 2.13 at the aft window,
# which contains every pane at every station, so the panes can be cut inside it
# without the ring itself ever having to move. Moving it was what put ridges
# down the whole cabin - a vertex slid along the section changes the CHORD
# between two stations even though it does not change the section.
#
# The 90 degree line - top dead centre - is there for the windshield. Its two
# panes are cut as holes bridged to their own outlines, the way the cabin
# windows are, and that only works if each pane's rows belong to it alone: with
# no line on the crown one row straddles it, both panes want it, and the second
# one to ask finds it already gone. It pays for itself twice over - it is also
# the only vertex that puts the polygon crown exactly on the measured crown,
# and it is where the centre post's two edges hang from.
#
# The window row's LOWER line is 8 degrees at every ring size, and that is not
# a coincidence to be tidied away. A pane is cut inside its row and clamped to
# the row's own edges, so a pane that reaches below the line comes back pinned
# to it - a flat-bottomed window, and a strip of zero-area triangles where the
# pane edge lies on the line it was clamped to. Eight degrees is where the
# section is still below the cabin sills at every station the windows cross;
# ten was not, and the far level came back with two degenerate faces under the
# door window. The row's upper line has no such constraint, so it is free to
# move with the ring size.
RING_SPEC = {
    11: dict(angles=[8, 48, 70, 90, 110, 132, 172, 200, 240, 300, 340],
             window=[0, 5], crown=[1, 2, 3, 4], top=2, crown_line=3),
    6:  dict(angles=[8, 60, 120, 172, 230, 310],
             window=[0, 2], crown=[1], top=1),
}

# ----------------------------------------------------------------------------
# per-LOD tessellation.  The ladder runs COARSEST FIRST - LOD1 is the far mesh
# and each step up adds detail - so a bigger number is always a better mesh.
# LOD0 is deliberately left free: it is the slot for a level BELOW the far one,
# which this airframe does not need and the C172 does. Numbering the other way
# round meant that adding or removing a level at the bottom renumbered every
# level above it, and a renumbering is a silent change to every asset path.
#
# Each step down drops the cheapest-to-lose detail first: pane shape, then
# cross-section resolution, then control-surface separation, then the small
# trim parts.  Every silhouette-defining feature - deep blunt nose, dorsal
# nacelle, low swept wing, 38.7 deg V-tail, dark wraparound glazing - survives
# to LOD1, and so does the glazing LAYOUT: the windscreen and three separate
# cabin windows, not one painted band. A band was what the far level used to
# carry, and it read as a jet with no windscreen at all.
#
# `trim` is the small stuff that is geometry rather than shape: the ventral
# keel and the two main gear doors. They are 200 mm details, so the far level
# does without them.
# ----------------------------------------------------------------------------
LODP = {
    1: dict(ring=6, pane_detail='coarse', wheel=4,
            wing_st=(0.0, SEMI),
            vt_st=(VT_ROOT_ETA, 1.0), gear_n=3,
            ctrl=False, af='mid', nac_ring=4,
            pillars=False, intake=False, nac_st=3,
            tip_cap=True, gear_cap=True, trim=False, bays=False),
    2: dict(ring=11, st_level=0, pane_detail='coarse', wheel=6,
            wing_st=(0.0, 1.30, SEMI),
            vt_st=(VT_ROOT_ETA, 1.0), gear_n=4,
            ctrl=True, af='full', nac_ring=6,
            pillars=True, intake=True, nac_st=4,
            tip_cap=True, gear_cap=True, trim=True, bays=False),
    3: dict(ring=11, st_level=2, pane_detail='fine', wheel=8,
            wing_st=(0.0, 1.30, 3.20, 5.60, SEMI),
            vt_st=(VT_ROOT_ETA, 0.55, 1.0), gear_n=4,
            ctrl=True, af='full', nac_ring=8,
            pillars=True, intake=True, nac_st=5,
            tip_cap=True, gear_cap=True, trim=True, bays=True),
}
P = LODP[LOD]

# The far level takes a hand-picked subset rather than a detail rank. It wants
# fewer stations than even rank 0 gives, and which ones to keep is a judgement
# about the silhouette - the nose tip, the windscreen base, the wing box, the
# nacelle, the tail cone pinch, the tail point - not a number.
LOD1_STATIONS = {0.000, -0.80, -2.00, -3.20, -4.40, -5.27, -6.40, -7.85, -9.357}

# ----------------------------------------------------------------------------
# scene / materials
# ----------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene


def mat(name, rgba, rough=0.45, metal=0.0, alpha=1.0, spec=None):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    # Viewport display colour as well as the shader's: the flat Workbench pass
    # the drawing comparison uses reads this one, not the Principled BSDF.
    m.diffuse_color = rgba
    m.roughness = rough
    m.metallic = metal
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = rgba
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if spec is not None and "Specular IOR Level" in b.inputs:
        b.inputs["Specular IOR Level"].default_value = spec
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        m.blend_method = 'BLEND'
    return m


M_PAINT = mat("SF50_Paint", (0.905, 0.910, 0.915, 1.0), 0.32)
M_GLASS = mat("SF50_Glass", (0.030, 0.045, 0.068, 1.0), 0.38, spec=0.12)
M_DARK = mat("SF50_Dark", (0.085, 0.088, 0.095, 1.0), 0.55)   # tyres, intake bore
M_METAL = mat("SF50_Metal", (0.545, 0.555, 0.575, 1.0), 0.32, metal=0.85)
# The windscreen's centre post. Not M_DARK, which is for tyres and the intake
# bore: those are matte and deep inside the aircraft, so their specular level
# never shows. The post sits on the crown facing the sky, and at M_DARK's
# default specular it came back a light grey bar - lighter than the glass it
# divides, which is the one thing it must not be. Low specular, like the glass.
M_POST = mat("SF50_Post", (0.020, 0.021, 0.024, 1.0), 0.62, spec=0.05)

# Fuselage material slots. The skin carries three and the mesh carries one set
# of triangles: paint, glazing, and the windscreen's centre post, which is a
# black divider on the aircraft and would read as a white bar without a slot
# of its own. Slots cost nothing - a face already exists to be coloured.
MAT_PAINT, MAT_GLASS, MAT_POST = 0, 1, 2

# ----------------------------------------------------------------------------
# mesh helpers
# ----------------------------------------------------------------------------
BUILT = []


# Faces that meet within this angle are describing one surface between them,
# so the edge between them is a line the eye cannot find. Dissolving those and
# retriangulating what is left gives the triangles back. It is not a guess:
# sampled both ways against the undissolved surface, 1.0 deg moves the
# fuselage skin by at most 3.6 mm - on a 9.36 m aeroplane, and against a
# drawing read to about 10 mm - and hands back 76 triangles. 2.0 deg gives 46
# more for 6.8 mm, which is starting to be a number the drawing would notice.
DISSOLVE_DEG = 1.0
DISSOLVED = [0, 0, []]  # triangles before / after / per part


def set_origin(ob, world_point):
    """Move the object origin to world_point without moving the geometry."""
    d = Vector(world_point)
    ob.data.transform(Matrix.Translation(-d))
    ob.location = d


def make(name, verts, faces, material, origin=None, smooth_angle=40.0,
         extra_mats=None, face_mats=None, flip_normals=False):
    """Create a mesh object, recalc normals, triangulate, set origin.

    extra_mats/face_mats add further material slots without adding any
    geometry: the glazing is a second material index on faces that already
    exist, not an overlay shell.
    """
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.update()
    ob = bpy.data.objects.new(name, me)
    SC.collection.objects.link(ob)
    ob.data.materials.append(material)
    for m in (extra_mats or []):
        ob.data.materials.append(m)
    if face_mats:
        for poly, mi in zip(me.polygons, face_mats):
            poly.material_index = mi

    bm = bmesh.new()
    bm.from_mesh(me)
    # Safe with face materials too: material_index lives on the face and
    # bm.from_mesh has already carried it across, so welding coincident
    # vertices cannot shuffle it.
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    # A station only some rows use leaves a ring vertex no face refers to.
    # It costs nothing to draw but it is still a vertex in the export, and it
    # makes every count in the report a lie.
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # recalc points the normals away from the enclosed volume, which is the
    # right answer for a closed body and a coin toss for an open shell. A bay
    # pocket is only ever seen from INSIDE, so it wants them the other way;
    # left alone it lit like a lump on the belly rather than a hole in it.
    if flip_normals:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    before = sum(len(f.verts) - 2 for f in bm.faces)

    def edge_health(b):
        return (sum(1 for e in b.edges if len(e.link_faces) > 2),
                sum(1 for e in b.edges if len(e.link_faces) < 2))

    # Dissolving faces that meet within DISSOLVE_DEG and retriangulating what
    # is left hands back the triangles that were describing nothing. It is
    # tried, checked and backed off rather than trusted: merging two triangles
    # that are flat but FOLDED gives a quad the retriangulator can only split
    # across itself, and the fuselage came back with four edges carrying four
    # faces each. Half the angle, try again, and take the deepest cut that
    # leaves the mesh exactly as sound as it was.
    def attempt(deg):
        t = bm.copy()
        if deg:
            # MATERIAL keeps it off the glazing outline: the pane edge is a
            # line you can see even where the faces either side of it are flat.
            bmesh.ops.dissolve_limit(t, angle_limit=math.radians(deg),
                                     verts=t.verts, edges=t.edges,
                                     delimit={'MATERIAL'})
        bmesh.ops.triangulate(t, faces=t.faces, quad_method='BEAUTY',
                              ngon_method='BEAUTY')
        return t, edge_health(t)

    plain, want = attempt(0.0)      # the yardstick is the triangulated mesh,
    angle = DISSOLVE_DEG            # not the quads it was built from
    while angle >= 0.05:
        trial, got = attempt(angle)
        if got == want:
            plain.free()
            bm.free()
            bm = trial
            break
        trial.free()
        angle /= 2.0
    else:
        angle = 0.0
        bm.free()
        bm = plain
    DISSOLVED[0] += before
    DISSOLVED[1] += len(bm.faces)
    if before != len(bm.faces):
        DISSOLVED[2].append(f"{name} {before}->{len(bm.faces)} at {angle:g} deg")
    degen = [f for f in bm.faces if f.calc_area() < 1e-9]
    if degen:
        bmesh.ops.delete(bm, geom=degen, context='FACES')
    bm.to_mesh(me)
    bm.free()
    me.update()

    if origin is not None:
        set_origin(ob, Vector(origin))
    if smooth_angle:
        for p in ob.data.polygons:
            p.use_smooth = True
        try:
            bpy.context.view_layer.objects.active = ob
            bpy.ops.object.select_all(action='DESELECT')
            ob.select_set(True)
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(smooth_angle))
        except Exception:
            pass
    else:
        for p in ob.data.polygons:
            p.use_smooth = False
    BUILT.append(ob)
    return ob


def loft(rings, cap_start=False, cap_end=False):
    """Loft a list of equal-length closed point rings -> (verts, faces)."""
    n = len(rings[0])
    verts, faces = [], []
    for r in rings:
        verts.extend(r)
    for i in range(len(rings) - 1):
        a, b = i * n, (i + 1) * n
        for j in range(n):
            k = (j + 1) % n
            faces.append([a + j, a + k, b + k, b + j])
    if cap_start:
        faces.append(list(range(n - 1, -1, -1)))
    if cap_end:
        o = (len(rings) - 1) * n
        faces.append([o + j for j in range(n)])
    return verts, faces


def ring_angles(n):
    return [math.radians(a) for a in RING_SPEC[n]["angles"]]


def fit_section(zb, zm, zt, hw, pu, pl, ts):
    """Stretch the section so the RING lands on the measured extents.

    None of these rings has a vertex at top or bottom dead centre - that is
    deliberate, so the crown and the keel are flat edges rather than creases -
    but it means the polygon's highest vertex sits below the true crown and its
    lowest above the true keel. On the cabin section that is 4 cm of roof and
    7 cm of belly, and it showed up as a visible gap the first time the side
    view was stacked on the drawing. Solving the parameters backwards from the
    wanted extents costs nothing and makes the silhouette exact, which also
    keeps the coarse levels' wheels and belly where the fine ones put them.
    """
    su = max((math.sin(t) for t in ts if math.sin(t) > 0), default=1.0)
    sl = max((-math.sin(t) for t in ts if math.sin(t) < 0), default=1.0)
    cm = max(abs(math.cos(t)) ** (2.0 / (pu if math.sin(t) >= 0 else pl))
             for t in ts)
    zt_fit = zm + (zt - zm) / (su ** (2.0 / pu))
    zb_fit = zm - (zm - zb) / (sl ** (2.0 / pl))
    return zb_fit, zt_fit, hw / cm


def section(y, zb, zm, zt, hw, pu, pl, n, fit=True):
    """Cross-section ring: two half super-ellipses sharing the max-width line."""
    ts = ring_angles(n)
    if fit:
        zb, zt, hw = fit_section(zb, zm, zt, hw, pu, pl, ts)
    pts = []
    for t in ts:
        c, s = math.cos(t), math.sin(t)
        p = pu if s >= 0 else pl
        e = 2.0 / p
        x = hw * math.copysign(abs(c) ** e, c)
        zr = (zt - zm) if s >= 0 else (zm - zb)
        z = zm + math.copysign(abs(s) ** e, s) * zr
        pts.append((x, y, z))
    return pts


def interpolate_station(y, base):
    """A station at y, with every shape parameter read off the measured table.

    The pane edges are where the glazing changes, not where the shape does, so
    these rings carry no new measurements - they are the shape table sampled
    at a different place.
    """
    for s0, s1 in zip(base, base[1:]):
        if s1[0] <= y <= s0[0]:
            t = (s0[0] - y) / (s0[0] - s1[0]) if s0[0] != s1[0] else 0.0
            return tuple([y] + [s0[c] + (s1[c] - s0[c]) * t for c in range(1, 7)] + [0])
    return None


def pane_spans():
    """Every glazed region as (fore y, aft y), fore first."""
    out = [(WINDSHIELD_Y[1], WINDSHIELD_Y[0])]
    for yc, a, _zc, _b, _n in CABIN_WINDOWS:
        out.append((yc + a, yc - a))
    return sorted(out, key=lambda p: -p[0])


def bay_spans():
    """Every gear bay mouth as (fore y, aft y), fore first."""
    return sorted([(b["y"][0] + b["y"][1], b["y"][0] - b["y"][1])
                   for b in GEAR_BAYS.values()], key=lambda p: -p[0])


def edge_ring_crossings(base, n):
    """Stations where a windshield edge crosses a ring line.

    This is the one place the windshield needs a station of its own, and it is
    solved for rather than guessed. An edge is cut into whichever row holds it,
    so where it passes from one row into the next it has to land exactly on the
    ring line between them. If there is no station there it lands on the line
    at the wrong station in each row - the boundary jogs back along the ring
    line by one gap, and the glass gets a notch a whole row deep. With a
    station at the crossing both rows cut to the same vertex and the edge runs
    straight through.

    The C172's lesson, applied along the fuselage instead of around it: put the
    vertices where the features are.
    """
    out = []
    for curve in (sill_z, roof_z):
        for j in range(n):
            def diff(y, j=j, curve=curve):
                st = interpolate_station(y, base)
                if st is None:
                    return None
                z = curve(y)
                return None if z > 1e8 else z - section(*st[:7], n)[j][2]

            prev_y, prev_d = None, None
            y = WINDSHIELD_Y[1]
            while y >= WINDSHIELD_Y[0] - 1e-9:
                d = diff(y)
                if d is not None and prev_d is not None and d * prev_d < 0.0:
                    lo, hi = y, prev_y
                    for _ in range(40):
                        mid = (lo + hi) / 2.0
                        dm = diff(mid)
                        if dm is None:
                            break
                        if dm * prev_d < 0.0:
                            hi = mid
                        else:
                            lo = mid
                    out.append((lo + hi) / 2.0)
                prev_y, prev_d = y, d
                y -= 0.005
    return out


def fuselage_stations():
    base = ([s for s in STATIONS if s[0] in LOD1_STATIONS] if LOD == 1
            else [s for s in STATIONS if s[7] <= P["st_level"]])

    # Each pane is cut into the window row as a hole bounded by the stations
    # either side of it, so two panes must never reach into the same station
    # gap - and the block those stations bound should be the pane's own size.
    # A station just clear of each end does both: it separates the panes, and
    # it keeps the strip that closes the block down to the pane's width.
    # The windshield's two ends, and the station where its roof line leaves
    # the crown. That last one cannot be solved for the way the ring crossings
    # are - forward of it the roof is not a number, it is "there is no roof" -
    # so it is named. Without it the row over the crown has the roof above it
    # at one station and below it at the next, and the cut goes diagonally
    # across the whole row instead of stopping.
    wanted = list(WINDSHIELD_Y) + [WINDSHIELD_ROOF[0][0]]
    for f0, a1 in pane_spans()[1:]:          # the windshield brings its own
        wanted += [f0 + PANE_MARGIN, a1 - PANE_MARGIN]
    wanted += edge_ring_crossings(base, P["ring"])
    # A bay mouth needs its block bounded the same way a pane does, and for the
    # same reason: without a station just clear of each end the strip closing
    # the block runs to whatever station happens to be next and fans.
    #
    # LAST, after the ring crossings, and that order is load-bearing. A station
    # is only added where nothing is already within 40 mm, so whichever comes
    # first wins - and a bay margin that wins displaces a crossing. A crossing
    # is where a windshield edge passes from one ring row into the next, and
    # losing one lets the boundary jog back a whole gap in one row and not its
    # mirror: the nose bay lengthened, its aft margin landed 90 mm from a
    # crossing, and the fuselage came back with one vertex 36 mm out of
    # symmetry on a model whose symmetry error is otherwise exactly zero. A
    # crossing is geometry; a bay margin is a convenience.
    if P["bays"]:
        for f0, a1 in bay_spans():
            wanted += [f0 + PANE_MARGIN, a1 - PANE_MARGIN]
    extra = []
    for y in wanted:          # named stations first, crossings after
        if all(abs(y - st[0]) > 0.04 for st in base + extra):
            st = interpolate_station(y, base)
            if st:
                extra.append(st)
    sts = sorted(base + extra, key=lambda s: -s[0])
    # A margin station within 0.04 m of one the shape already asked for is
    # dropped, so check rather than assume: two panes sharing a station gap
    # would each cut the same row and the second would find it already gone.
    spans = pane_spans()
    for (_f0, a0), (f1, _a1) in zip(spans, spans[1:]):
        if not any(f1 < st[0] < a0 for st in sts):
            st = interpolate_station((a0 + f1) / 2.0, base)
            if st:
                extra.append(st)
                sts = sorted(base + extra, key=lambda s: -s[0])
    return sts, {st[0] for st in extra}


def build_fuselage():
    """Fuselage skin, with the glazing carried as a second material slot.

    The windows ARE fuselage polygons with a different material index - no
    overlay shell, so nothing is duplicated and nothing is permanently hidden
    underneath.  One extra submesh.

    **No ring line carries a pane column.** The whole fuselage is the uniform
    ring at the measured stations and nothing else; a pane is cut into the one
    face row that holds it, as a hole with its own outline, and the ring either
    side of that row never learns the window is there. Earlier passes put a
    column on the four lines bounding the two window rows, which forced the
    rows next to them into triangle strips - one thin sliver per column, 140 of
    them, fanning from the window band out to the shoulder and the keel and
    showing nothing.

    Pane vertices are placed by interpolating inside the row's own quad, so
    they sit exactly on the surface that was already there: cutting a window
    changes nothing about the shape of the fuselage around it.
    """
    n = P["ring"]
    spec = RING_SPEC[n]
    sts, extra_ys = fuselage_stations()
    rings = [section(*st[:7], n) for st in sts]
    ys = [st[0] for st in sts]
    # Stations the SHAPE did not ask for: they are here for the glazing, and
    # only the rows the glazing reaches have any use for them.
    feature = {i for i, y in enumerate(ys)
               if any(abs(y - e) < 1e-9 for e in extra_ys)}

    verts = []
    for r in rings:
        verts.extend(r)
    faces, fmats = [], []
    glazed_n = 0
    panes_cut = 0

    def add(v):
        verts.append(v)
        return len(verts) - 1

    def lerp3(a, b, t):
        return tuple(a[c] + (b[c] - a[c]) * t for c in range(3))

    WS_LO, WS_HI = WINDSHIELD_Y

    def in_ws(y):
        return WS_LO - 1e-6 <= y <= WS_HI + 1e-6

    def emit(idx, mati=MAT_PAINT):
        """One face, with its material decided structurally.

        Never by testing the geometry: a pane's own outline vertices sit
        exactly ON it, so any inside/outside test of them is a knife edge that
        sub-millimetre float noise flips - which once left a glazed sliver
        spiking the full height of the row off each end of a cabin window.

        `mati` is a slot index, and False/True still read as paint/glass.
        """
        idx = list(idx)
        # A face this thin is three collinear points: it covers nothing, so
        # dropping it leaves no hole, and keeping it would be a polygon that
        # draws nothing.
        p = [verts[i] for i in idx]
        area = 0.0
        for c in range(1, len(p) - 1):
            u = [p[c][d] - p[0][d] for d in range(3)]
            v = [p[c + 1][d] - p[0][d] for d in range(3)]
            area += 0.5 * math.sqrt(
                (u[1] * v[2] - u[2] * v[1]) ** 2
                + (u[2] * v[0] - u[0] * v[2]) ** 2
                + (u[0] * v[1] - u[1] * v[0]) ** 2)
        if area < 1e-12:
            return
        faces.append(idx)
        fmats.append(int(mati))
        nonlocal glazed_n
        glazed_n += 1 if int(mati) == MAT_GLASS else 0

    def gap_of(y):
        for i in range(len(ys) - 1):
            if ys[i + 1] - 1e-9 <= y <= ys[i] + 1e-9:
                return i
        return None

    def row_point(y, c, j, axis=2):
        """A point at station y, at coordinate `c` across face row j.

        Bilinear inside the row's quad, so the point lies on the ruled surface
        the fuselage already had. Putting it on the analytic section instead
        would stand it proud of the flat row either side and crease the cabin.

        `axis` names the coordinate the shape is traced in, and it has to be
        one that runs monotonically across the row. A cabin window is traced in
        Z, which is right for a row on the side of the body. A bay mouth on the
        belly is traced in X, and the keel row is the reason there is a choice
        at all: it straddles bottom dead centre, so Z turns round in the middle
        of it and both its ends sit at the same height. Traced in Z the nose
        bay came out as a zero-width slit on the centreline.
        """
        k = (j + 1) % n
        i = gap_of(y)
        span = ys[i] - ys[i + 1]
        t = 0.0 if abs(span) < 1e-12 else (ys[i] - y) / span
        lo = lerp3(rings[i][j], rings[i + 1][j], t)
        hi = lerp3(rings[i][k], rings[i + 1][k], t)
        d = hi[axis] - lo[axis]
        f = 0.0 if abs(d) < 1e-9 else (c - lo[axis]) / d
        return lerp3(lo, hi, min(max(f, 0.0), 1.0))

    def strip(oc, ic):
        """The strip between two open chains, as ONE polygon.

        Both chains run fore to aft, so oc + reversed(ic) is a simple closed
        loop and the strip is an n-gon - which is handed to the triangulator
        with the rest of the mesh. That matters because a strip whose two
        chains have very different vertex counts has no good ZIP: three station
        vertices against nine pane columns forces a fan from one apex whichever
        rule picks the diagonals, and the strip below a pane is half a metre
        deep, so those arms came out 300-600 mm long. An n-gon costs exactly
        the same triangles - a polygon of V vertices is V-2 either way - and
        lets BEAUTY choose the diagonals instead of a walk that has no choice.

        Two rules the walk did have to get right, and the polygon inherits:
        both chains run the same way (or the loop crosses itself), and the
        pane columns include every station the block crosses (or the strip's
        two sides disagree about where the block's corners are).
        """
        emit(list(oc) + list(reversed(ic)), False)

    consumed = {j: set() for j in range(n)}

    def cut_pane(j, yc, a, cc, b, ex, axis=2, fill=MAT_GLASS,
                 columns=None, mouth=None, spine=None):
        """A hole in the row, closed to its own outline.

        The hole runs from the station just ahead of the pane to the one just
        behind it, and the strip that closes it is tiled along Y, so every
        face in it spans one pane column and nothing reaches across the block.

        `fill` is what goes in the hole: a material index for a window, or None
        for a gear bay mouth, which is a hole and stays one. Everything else -
        where the block starts and stops, how the strips either side are tiled,
        which columns get a vertex - is identical, and that is the point: the
        four rejected attempts behind this function were all about the hole,
        not about what fills it.

        `mouth`, when given, is filled with the outline's points in loop order
        so a pocket can be built behind the opening on exactly those vertices.
        """
        nonlocal panes_cut
        k = (j + 1) % n
        ia = max([i for i in range(len(ys)) if ys[i] >= yc + a - 1e-9] or [0])
        ib = min([i for i in range(len(ys)) if ys[i] <= yc - a + 1e-9]
                 or [len(ys) - 1])
        if ib <= ia:
            return
        for g in range(ia, ib):
            consumed[j].add(g)

        # A column on every station the block crosses, so the strip closing
        # the block is ribbed square across rather than fanned. A column that
        # already lands near one is moved onto it instead of doubling it.
        fr = list(columns or PANE_COLUMN_FRACTIONS[P["pane_detail"]])
        for i in range(ia + 1, ib):
            f = (ys[i] - yc) / a
            if abs(f) >= 1.0:
                continue
            c = min(range(len(fr)), key=lambda c: abs(fr[c] - f))
            if abs(fr[c] - f) < PANE_COLUMN_SNAP:
                fr[c] = f
            else:
                fr.append(f)
        cols = [yc + a * f for f in sorted(fr, reverse=True)]

        lo_edge, hi_edge = [], []
        for y in cols:
            t = 1.0 - abs((y - yc) / a) ** ex
            h = b * (t ** (1.0 / ex)) if t > 0.0 else 0.0
            lo_edge.append(add(row_point(y, cc - h, j, axis)))
            hi_edge.append(add(row_point(y, cc + h, j, axis)))
        if mouth is not None:
            mouth.extend([verts[i] for i in lo_edge]
                         + [verts[i] for i in reversed(hi_edge)])
        if spine is not None:
            spine.extend(row_point(y, cc, j, axis) for y in cols)

        # Below the pane and above it are two separate strips, each between a
        # ring line and the pane edge facing it. The two ends of the block
        # close with one face apiece.
        lo_line, hi_line = (j, k) if rings[ia][j][axis] < rings[ia][k][axis] \
            else (k, j)
        strip([i * n + lo_line for i in range(ia, ib + 1)], lo_edge)
        strip([i * n + hi_line for i in range(ia, ib + 1)], hi_edge)
        emit((ia * n + lo_line, ia * n + hi_line, hi_edge[0], lo_edge[0]),
             False)
        emit((ib * n + lo_line, ib * n + hi_line, hi_edge[-1], lo_edge[-1]),
             False)
        if fill is not None:
            for c in range(len(cols) - 1):
                emit((lo_edge[c], lo_edge[c + 1], hi_edge[c + 1], hi_edge[c]),
                     fill)
        panes_cut += 1

    def snap(a, b, f):
        """A cut this near a ring vertex IS that ring vertex.

        The traced curves and the section table are separate measurements, so
        where they should meet exactly - the roof line leaving the crown, the
        sill meeting it at the windshield's tip - they meet a fraction of a
        millimetre apart. Left alone that puts a vertex 3 mm from the ring's
        own, on a ring line the next row along never split, and the fuselage
        comes back with a T-junction. Anything within SNAP is the ring vertex.
        """
        d = math.dist(a, b)
        if d < 1e-9:
            return 0.0
        t = SNAP_M / d
        return 0.0 if f < t else (1.0 if f > 1.0 - t else f)

    def skin_mat(p, ym):
        """Which material this bit of skin is. Structural, not a knife edge.

        Only ever asked about the middle of a strip, never about a vertex on a
        pane's own outline: a vertex sits exactly ON the boundary, so testing
        one is a coin toss that float noise flips - which is how a glazed
        sliver once ended up spiking off the end of a cabin window.

        The centre post is a strip of dark INSIDE the glazing, not a strip of
        body colour: forward of the sill and above the roof line the crown is
        painted like the rest of the aeroplane, and the post has nothing to
        divide there. Asking about the post first drew a white bar up the nose.
        """
        if not (sill_z(ym) < p[2] < roof_z(ym)):
            return MAT_PAINT
        if P["pillars"] and abs(p[0]) <= post_half(ym):
            return MAT_POST
        return MAT_GLASS

    def cut_windshield():
        """Cut the windscreen's own edges into whichever ring row holds them.

        The windscreen has THREE edges, and not one of them stays in a single
        row: the sill runs from the crown at Y = -1.48 down through the
        shoulder row into the window row abeam the pilot; the roof line leaves
        the crown at -2.18 and is out at the shoulder by -2.55; and the centre
        post is a vertical edge in the two rows either side of top dead centre.
        So each edge is cut into the row that happens to hold it at that
        station, and where it crosses a ring line the cut lands exactly on that
        line - which is what keeps the boundary continuous across the crossing
        instead of stepping a whole row.

        Every cut vertex is an interpolation between the row's OWN two ring
        vertices, so it sits on the chord the surface already had: cutting the
        glazing changes nothing about the shape of the fuselage around it, and
        the rows either side never learn the cut happened, so there is no
        T-junction to crack.
        """
        nonlocal panes_cut
        for g in range(len(ys) - 1):
            ya, yb = ys[g], ys[g + 1]
            # The gap either side of the windshield is cut too, with the
            # edges pinched onto the ring vertex. Stopping at the span's ends
            # instead leaves the cut vertices sitting on a ring line whose
            # other side was never subdivided - a T-junction, and the fuselage
            # came back with 14 boundary edges across the glazing's two ends.
            if not (in_ws(ya) or in_ws(yb)):
                continue
            ym = (ya + yb) / 2.0
            for j in range(n):
                k = (j + 1) % n
                pa0, pa1 = rings[g][j], rings[g][k]
                pb0, pb1 = rings[g + 1][j], rings[g + 1][k]
                # (priority, coordinate, value at ya, value at yb). Priority
                # decides which edge survives where two of them cross inside
                # one row, and the post goes first for a topological reason,
                # not a cosmetic one: its ends have to land on the same vertex
                # the neighbouring gap put there, or the ring line between two
                # gaps is split on one side only. A glass edge that loses a
                # crossing only mis-colours the sliver it was crossing in.
                edges = [('sill', 1, 2, sill_z(ya), sill_z(yb)),
                         ('roof', 1, 2, roof_z(ya), roof_z(yb))]
                cl = spec.get("crown_line")
                # The centre post is a lateral edge, and only in the two rows
                # that touch top dead centre - asking for it anywhere else cuts
                # the belly in half for nothing.
                if P["pillars"] and cl is not None and j in (cl - 1, cl):
                    sgn = 1.0 if j == cl - 1 else -1.0
                    edges.append(('post', 0, 0, sgn * post_half(ya),
                                  sgn * post_half(yb)))
                cuts = []
                # Where the roof line actually is, as a fraction across this
                # row, kept unclamped and only for the stations that HAVE a
                # roof: forward of Y = -2.18 `roof_z` is not a height, it is
                # the sentinel meaning "no roof yet", and the fraction that
                # comes out of it is a number on one row and its opposite on
                # the other - the two rows either side of top dead centre run
                # their fractions in opposite directions in Z. Reading it as a
                # real fraction clipped one side's post away entirely.
                roof_f = [None, None]
                for kind, prio, c, va, vb in edges:
                    da, db = pa1[c] - pa0[c], pb1[c] - pb0[c]
                    if abs(da) < 1e-9 or abs(db) < 1e-9:
                        continue
                    fa = snap(pa0, pa1, (va - pa0[c]) / da)
                    fb = snap(pb0, pb1, (vb - pb0[c]) / db)
                    if kind == 'roof':
                        roof_f = [fa if roof_z(ya) < 1e8 else None,
                                  fb if roof_z(yb) < 1e8 else None]
                    elif kind == 'post':
                        # The post is a band INSIDE the glass, so its edge
                        # cannot run past the glass's own. Without this the two
                        # edges cross inside the one 60 mm gap where the roof
                        # sweeps a whole row - from the crown at Y = -2.18 to
                        # the shoulder at -2.24 - and only one edge survives a
                        # crossing. The post did, the roof did not, and the
                        # strip the roof would have split came out one colour:
                        # 190 cm2 of body white in the middle of the right-hand
                        # pane.
                        #
                        # Which way to clamp is NOT the same on the two rows.
                        # They meet at top dead centre and run their fractions
                        # in opposite directions, so the post band is the high
                        # fractions on one and the low fractions on the other,
                        # and the glass is on the far side of the roof in each.
                        # Clamping both the same way pinched the left-hand post
                        # to 3 mm and left the two sides with different face
                        # counts - which is what a symmetric model not being
                        # symmetric looks like before anyone sees it.
                        clip = min if j == cl - 1 else max
                        if roof_f[0] is not None:
                            fa = clip(fa, roof_f[0])
                        if roof_f[1] is not None:
                            fb = clip(fb, roof_f[1])
                    if (fa <= 0.0 and fb <= 0.0) or (fa >= 1.0 and fb >= 1.0):
                        continue        # wholly one side of this row
                    cuts.append((min(max(fa, 0.0), 1.0),
                                 min(max(fb, 0.0), 1.0), prio))
                # Two edges can meet inside one row - the sill runs into the
                # roof at the aft corner, and into the post at the forward one
                # - and there they swap order between the two stations. Left
                # alone that tiles the row inside out and tears it; clamping
                # each level to the one before keeps the strips in order and
                # the crossing collapses to a point, which is what it is.
                if not cuts:
                    # The windscreen never reaches this row. Emitting the plain
                    # quad here anyway would be harmless but it would also
                    # claim the row, and the plain pass is the one that can
                    # merge a row across the stations the windscreen asked for
                    # - which is the whole belly, seven stations deep, for
                    # nothing.
                    mid = [(pa0[c] + pa1[c] + pb0[c] + pb1[c]) / 4.0
                           for c in range(3)]
                    if skin_mat(mid, ym) == MAT_PAINT:
                        continue
                consumed[j].add(g)
                cuts.sort(key=lambda t: (t[2], t[0] + t[1]))
                levels = [(0.0, 0.0)]
                for fa, fb in [c[:2] for c in cuts] + [(1.0, 1.0)]:
                    levels.append((max(fa, levels[-1][0]),
                                   max(fb, levels[-1][1])))
                ids = []
                for fa, fb in levels:
                    va = g * n + j if fa <= 1e-6 else \
                        (g * n + k if fa >= 1.0 - 1e-6 else
                         add(lerp3(pa0, pa1, fa)))
                    vb = (g + 1) * n + j if fb <= 1e-6 else \
                        ((g + 1) * n + k if fb >= 1.0 - 1e-6 else
                         add(lerp3(pb0, pb1, fb)))
                    ids.append((va, vb))
                for s in range(len(levels) - 1):
                    (fa0, fb0), (fa1, fb1) = levels[s], levels[s + 1]
                    if abs(fa1 - fa0) < 1e-6 and abs(fb1 - fb0) < 1e-6:
                        continue
                    (a0, b0), (a1, b1) = ids[s], ids[s + 1]
                    mid = [(lerp3(pa0, pa1, (fa0 + fa1) / 2.0)[c]
                            + lerp3(pb0, pb1, (fb0 + fb1) / 2.0)[c]) / 2.0
                           for c in range(3)]
                    quad = [a0, a1, b1, b0]
                    quad = [v for i, v in enumerate(quad)
                            if v != quad[(i - 1) % len(quad)]]
                    if len(quad) >= 3:
                        emit(quad, skin_mat(mid, ym))
        panes_cut += 1
    cut_windshield()
    for j in spec["window"]:
        for (yc, a, zc, b, ex) in CABIN_WINDOWS:
            cut_pane(j, yc, a, zc, b, ex)

    # Gear bay mouths: the same cut, with nothing put back in the hole.
    if P["bays"]:
        for name, bay in GEAR_BAYS.items():
            mouth, spine = [], []
            cut_pane(bay["row"], bay["y"][0], bay["y"][1],
                     bay["x"][0], bay["x"][1], bay["ex"],
                     axis=0, fill=None, columns=BAY_COLUMN_FRACTIONS,
                     mouth=mouth, spine=spine)
            BAY_MOUTHS[name] = mouth
            BAY_SPINES[name] = spine

    # ---- everything else is the plain uniform ring ---------------------------
    def line_keeps(i, L):
        """Does ring line L have to carry a vertex at station i?

        Every measured station, always: that is the shape. A station added for
        the glazing, only where a row beside this line was actually cut at it.
        The windscreen asks for seven stations between Y = -1.20 and -2.60 and
        the panes for six more, and a station used to mean a whole ring: 22
        triangles, of which the eleven under the waterline showed nothing at
        all. The belly does not know the windscreen is there and should not
        have to pay for it.
        """
        if i not in feature:
            return True
        return any(g in consumed[r]
                   for r in ((L - 1) % n, L % n) for g in (i - 1, i))

    for j in range(n):
        k = (j + 1) % n
        g = 0
        while g < len(ys) - 1:
            if g in consumed[j]:
                g += 1
                continue
            g1 = g                          # the run of gaps nothing has cut
            while g1 + 1 < len(ys) - 1 and (g1 + 1) not in consumed[j]:
                g1 += 1
            # Each ring line carries its own stations across the run; where
            # one has a vertex the other does not, the face is a triangle
            # rather than two quads. That is the only way a row can skip a
            # station without leaving a T-junction on the line it shares.
            A = [g] + [i for i in range(g + 1, g1 + 1) if line_keeps(i, j)] \
                + [g1 + 1]
            B = [g] + [i for i in range(g + 1, g1 + 1) if line_keeps(i, k)] \
                + [g1 + 1]
            p = q = 0
            while p + 1 < len(A) or q + 1 < len(B):
                na = A[p + 1] if p + 1 < len(A) else None
                nb = B[q + 1] if q + 1 < len(B) else None
                if nb is None or (na is not None and na < nb):
                    emit((A[p] * n + j, B[q] * n + k, na * n + j),
                         MAT_PAINT)
                    p += 1
                elif na is None or nb < na:
                    emit((A[p] * n + j, B[q] * n + k, nb * n + k),
                         MAT_PAINT)
                    q += 1
                else:
                    emit((A[p] * n + j, B[q] * n + k, nb * n + k, na * n + j),
                         MAT_PAINT)
                    p += 1
                    q += 1
            g = g1 + 1

    faces.append(list(range(n - 1, -1, -1))); fmats.append(0)
    faces.append([(len(rings) - 1) * n + j for j in range(n)]); fmats.append(0)

    print(f"###FUSELAGE### stations={len(sts)} ring={n} glazed_faces={glazed_n} "
          f"panes={panes_cut} (0 duplicated, 0 occluded)")
    return make("Fuselage", verts, faces, M_PAINT,
                extra_mats=[M_GLASS] + ([M_POST] if P["pillars"] else []),
                face_mats=fmats)


# ----------------------------------------------------------------------------
# airfoils / flying surfaces
# ----------------------------------------------------------------------------
# 8 points, closed loop; a vertex sits exactly on the hinge station so control
# surfaces split off without extra geometry.  t/c 0.158, from the front view.
AF_WING = [(0.000, 0.000), (0.120, 0.078), (0.350, 0.100), (0.720, 0.062),
           (1.000, 0.002), (0.720, -0.030), (0.350, -0.058), (0.120, -0.050)]
AF_TAIL = [(0.000, 0.000), (0.130, 0.045), (0.380, 0.050), (0.700, 0.035),
           (1.000, 0.001), (0.700, -0.035), (0.380, -0.050), (0.130, -0.045)]
HINGE_UP, HINGE_LO = 3, 5

AF6_WING = [(0.000, 0.000), (0.150, 0.086), (0.450, 0.092),
            (1.000, 0.002), (0.450, -0.055), (0.150, -0.050)]
AF6_TAIL = [(0.000, 0.000), (0.180, 0.047), (0.500, 0.046),
            (1.000, 0.001), (0.500, -0.046), (0.180, -0.047)]
# LOD3 only: a flat-bottomed wedge. At the distance that level is drawn from,
# the V-tail's job is to be a 38.7 deg V of the right size, not an aerofoil.

WING_AF = {'full': AF_WING, 'mid': AF6_WING}[P["af"]]
TAIL_AF = {'full': AF_TAIL, 'mid': AF6_TAIL}[P["af"]]

# The three view draws no hinge lines, so these spans are conventional rather
# than measured.  The flap starts inboard of the fuselage side (0.673 m at the
# wing trailing edge) and the aileron runs almost to the tip, so the truncated
# wing panel is never left with an open trailing edge anyone can see.
WING_FLAP = (0.62, 2.55)
WING_AILERON = (2.70, 5.84)
WING_HINGE = 0.72


def wing_geom(x):
    """LE y, chord and chord-plane z at spanwise station x (right wing)."""
    le_y = WING_LE_ROOT + LE_SLOPE * x
    te_y = WING_TE_ROOT + TE_SLOPE * x
    return le_y, le_y - te_y, WING_Z0 + math.tan(DIHEDRAL) * x


def af_points(af, chord, thick_scale, le_y, z0, x, incidence=0.0):
    out = []
    for (cx, cz) in af:
        yy = -cx * chord
        zz = cz * chord * thick_scale
        if incidence:
            ca, sa = math.cos(incidence), math.sin(incidence)
            yy, zz = yy * ca - zz * sa, yy * sa + zz * ca
        out.append((x, le_y + yy, z0 + zz))
    return out


WING_BAY_MOUTHS = {}
WING_BAY_AXES = {}


def build_wing(side):
    """Wing loft, with the main gear bay mouth taken out of its lower surface.

    The mouth is ONE quad: two spanwise stations are added for it, and the face
    between them on row `WING_BAY_ROW` is simply not emitted. No pane tracing
    is needed because the opening is a rib bay - which is what a gear door is -
    so it is bounded by the wing's own structure on all four sides.

    The two stations cost almost nothing. The planform, the dihedral and the
    thickness are all linear in x, so an intermediate station is coplanar with
    its neighbours and the dissolve pass takes it straight back out; these two
    survive only because the cut makes them a feature.
    """
    sgn = 1.0 if side == "Right" else -1.0
    stations = list(P["wing_st"])
    if P["bays"]:
        # Any station INSIDE the bay is dropped, so the mouth stays one quad.
        # It costs nothing: the planform, the dihedral and the thickness are all
        # linear in x, so an intermediate station is coplanar with its
        # neighbours and the dissolve pass was already taking it back out.
        lo, hi = WING_BAY_X
        stations = [x for x in stations if not (lo < x < hi)]
        stations = sorted(set(stations) | set(WING_BAY_X))
    rings = []
    for x in stations:
        le_y, chord, z = wing_geom(x)
        tip_f = 1.0
        if x >= SEMI - 1e-6:                    # rounded tip cap
            le_y -= 0.19 * chord
            chord *= 0.62
            tip_f = 0.50
        pts = af_points(WING_AF, chord, tip_f, le_y, z, sgn * x, WING_INCIDENCE)
        if P["ctrl"]:
            rings.append([pts[0], pts[1], pts[2], pts[3], pts[5], pts[6], pts[7]])
        else:
            rings.append(pts)
    verts, faces = loft(rings, cap_start=False, cap_end=P["tip_cap"])
    if P["bays"]:
        n = len(rings[0])
        row, k = WING_BAY_ROW, (WING_BAY_ROW + 1) % len(rings[0])
        ia = stations.index(WING_BAY_X[0])
        ij = stations.index(WELL_JOIN)
        # loft() emits segment i, row j at index i * n + j, caps after. The
        # OUTBOARD segment loses its whole face - that is the rectangular leg
        # bay. The INBOARD one keeps a C of skin around the circular well.
        drop = {ij * n + row, ia * n + row}

        def P_(i, t):
            """Surface point at station index i, fraction t across the row."""
            a, b = Vector(rings[i][row]), Vector(rings[i][k])
            return a + (b - a) * t

        # The circle lives in (x, t). `t` is a fraction of the row, so the
        # radius has to be converted into it or the well comes out elliptical.
        row_len = (Vector(rings[ij][k]) - Vector(rings[ij][row])).length
        cx, ct = sgn * MAIN_STOWED[0], 0.5
        rt = WELL_R / row_len
        rx = WELL_R
        # Where the circle crosses the join station, and the arc between them,
        # walked round the INBOARD side.
        phi0 = math.acos(max(-1.0, min(1.0, (WELL_JOIN - abs(cx)) / rx)))
        arc = [(ct + rt * math.sin(phi0 - 2 * math.pi * f * (2 * math.pi - 2 * phi0)
                                   / (2 * math.pi)))
               for f in ()]                      # placeholder, replaced below
        arc = []
        for i in range(WELL_ARC):
            f = i / (WELL_ARC - 1)
            phi = phi0 + f * (2 * math.pi - 2 * phi0)
            arc.append((abs(cx) + rx * math.cos(phi), ct + rt * math.sin(phi)))

        def surf(xx, tt):
            """Point at absolute station xx, fraction tt - the loft is ruled,
            so interpolating between the bay's own two stations is exact."""
            f = (xx - WING_BAY_X[0]) / (WELL_JOIN - WING_BAY_X[0])
            a, b = P_(ia, tt), P_(ij, tt)
            return tuple(a + (b - a) * f)

        def add(p):
            verts.append(p)
            return len(verts) - 1

        # One n-gon: the quad's three closed sides, then up the join station to
        # the arc, round it, and back. The bite is on the boundary, so the
        # region is simply connected and the triangulator can have it whole.
        loop = [ij * n + row, ia * n + row, ia * n + k, ij * n + k]
        loop += [add(surf(WELL_JOIN, t)) for t in (arc[-1][1],)]
        loop += [add(surf(*pt)) for pt in reversed(arc[1:-1])]
        loop += [add(surf(WELL_JOIN, arc[0][1]))]
        faces = [f for i, f in enumerate(faces) if i not in drop] + [loop]

        # The pocket rim is the whole hole: the rectangle, then the arc.
        rect = [verts[ij * n + row], verts[ij * n + k],
                verts[(ij + 1) * n + k], verts[(ij + 1) * n + row]]
        WING_BAY_MOUTHS[side] = dict(
            rect=rect,
            rim=[surf(WELL_JOIN, arc[0][1])]
                + [surf(*pt) for pt in arc[1:-1]]
                + [surf(WELL_JOIN, arc[-1][1])]
                + [rect[1], rect[2], rect[3], rect[0]])
    return make(f"Wing_{side}", verts, faces, M_PAINT)


def build_ctrl(name, sgn, x0, x1, extra=()):
    """A trailing-edge control surface: the hinge-station wedge to the TE."""
    xs = [x0] + list(extra) + [x1]
    rings = []
    for x in xs:
        le_y, chord, z = wing_geom(x)
        pts = af_points(AF_WING, chord, 1.0, le_y, z, sgn * x, WING_INCIDENCE)
        rings.append([pts[HINGE_UP], pts[4], pts[HINGE_LO]])
    verts, faces = loft(rings, cap_start=True, cap_end=True)
    hx = (x0 + x1) / 2.0
    le_y, chord, z = wing_geom(hx)
    hp = af_points(AF_WING, chord, 1.0, le_y, z, sgn * hx, WING_INCIDENCE)
    piv = tuple((hp[HINGE_UP][c] + hp[HINGE_LO][c]) / 2.0 for c in range(3))
    return make(name, verts, faces, M_PAINT, origin=piv)


# ----------------------------------------------------------------------------
# V-tail
# ----------------------------------------------------------------------------
def vt_geom(eta):
    """LE y, chord, and the panel origin (x, z) at projected span fraction."""
    le_y = VT_LE_ROOT + (VT_LE_TIP - VT_LE_ROOT) * eta
    te_y = VT_TE_ROOT + (VT_TE_TIP - VT_TE_ROOT) * eta
    x = VT_SEMI * eta
    z = VT_Z0 + VT_SEMI * eta * math.tan(VT_DIHEDRAL)
    return le_y, le_y - te_y, x, z


def vt_points(af, eta, sgn, thick_scale=1.0):
    """Section points, with the thickness normal square to the panel."""
    le_y, chord, x, z = vt_geom(eta)
    ca, sa = math.cos(VT_DIHEDRAL), math.sin(VT_DIHEDRAL)
    out = []
    for (cx, cz) in af:
        t = cz * chord * thick_scale
        out.append((sgn * (x - t * sa), le_y - cx * chord, z + t * ca))
    return out


def build_vtail(side):
    sgn = 1.0 if side == "Right" else -1.0
    rings = []
    for eta in P["vt_st"]:
        # The tip ring stays at eta = 1.0 at every level - thinned, not pulled
        # inboard - so all four LODs report the same span and the same height.
        tf = 0.50 if eta >= 1.0 - 1e-6 else 1.0
        pts = vt_points(TAIL_AF, eta, sgn, tf)
        if P["ctrl"]:
            rings.append([pts[0], pts[1], pts[2], pts[3], pts[5], pts[6], pts[7]])
        else:
            rings.append(pts)
    verts, faces = loft(rings, cap_start=(LOD == 3), cap_end=P["tip_cap"])
    return make(f"VTail_{side}", verts, faces, M_PAINT)


def build_ruddervator(side):
    """One moving V-tail surface, origin on ITS OWN hinge line.

    These are NOT bound by the runtime today, and that is deliberate.
    SURFACE_BINDINGS in src/flight/aircraft/aircraftAnimation.ts turns a named
    node about one fixed local axis, and a V-tail is not a single rigid
    rotation for either pitch or yaw: the two hinge lines lie at +/-38.7 deg,
    so both surfaces cannot hinge about one axis. Binding both to `Elevator`
    about local X - the obvious fudge - cones each panel around its own hinge
    instead of turning about it, and at full deflection it drags the tip
    0.72 m aft of the fin it is attached to.

    So the geometry and the pivots are here and correct, and the surfaces sit
    still until the runtime learns the two extra bindings. REPORT.md gives the
    exact change.
    """
    sgn = 1.0 if side == "Right" else -1.0
    rings = []
    for eta in (RUDDERVATOR_SPAN[0], RUDDERVATOR_SPAN[1]):
        pts = vt_points(AF_TAIL, eta, sgn)
        rings.append([pts[HINGE_UP], pts[4], pts[HINGE_LO]])
    verts, faces = loft(rings, cap_start=True, cap_end=True)
    eta_m = sum(RUDDERVATOR_SPAN) / 2.0
    hp = vt_points(AF_TAIL, eta_m, sgn)
    piv = tuple((hp[HINGE_UP][c] + hp[HINGE_LO][c]) / 2.0 for c in range(3))
    return make(f"Ruddervator_{side}", verts, faces, M_PAINT, origin=piv)


# ----------------------------------------------------------------------------
# engine nacelle
# ----------------------------------------------------------------------------
def fuselage_top(y):
    """Measured fuselage crown height at station y, linearly interpolated."""
    pts = [(s[0], s[3]) for s in STATIONS]
    if y >= pts[0][0]:
        return pts[0][1]
    for (y0, z0), (y1, z1) in zip(pts, pts[1:]):
        if y1 <= y <= y0:
            t = (y - y0) / (y1 - y0) if y1 != y0 else 0.0
            return z0 + (z1 - z0) * t
    return pts[-1][1]


def build_nacelle():
    """Dorsal pod, open where the fuselage closes it.

    The drawing leaves a 7-13 cm gap between the pod and the crown, too small
    to be worth a pylon at this budget, so the pod is seated on the fuselage
    instead. Faces whose centre falls below the crown line would then be sealed
    inside the body and never seen, so they are not built - the same rule that
    opens the Cessna's roof under its wing.
    """
    # The pod gets an evenly spaced ring rather than the fuselage's chosen
    # angles: it is a plain body of revolution with no window sill or keel for
    # a vertex to land on, so there is nothing to place them against.  The
    # count must stay EVEN - an odd ring straddles the centreline instead of
    # mirroring across it, and showed up as 0.21 m of symmetry error.
    n = P["nac_ring"]
    keep = NAC_STATIONS
    if P["nac_st"] < len(NAC_STATIONS):
        idx = [0] + sorted(set(
            round(i * (len(NAC_STATIONS) - 1) / (P["nac_st"] - 1))
            for i in range(1, P["nac_st"])))
        keep = [NAC_STATIONS[i] for i in idx]
    rings = []
    for (y, zb, zt, hw) in keep:
        zb = min(zb, fuselage_top(y) - 0.05)     # seat it on the crown
        zm = (zb + zt) / 2.0
        ring = []
        for i in range(n):
            t = 2 * math.pi * i / n + math.pi / n
            ring.append((hw * math.cos(t), y, zm + (zt - zm) * math.sin(t)))
        rings.append(ring)

    verts = []
    for r in rings:
        verts.extend(r)
    faces = []
    buried = 0
    for i in range(len(rings) - 1):
        a, b = i * n, (i + 1) * n
        for j in range(n):
            k = (j + 1) % n
            quad = [a + j, a + k, b + k, b + j]
            zc = sum(verts[v][2] for v in quad) / 4.0
            yc = sum(verts[v][1] for v in quad) / 4.0
            if zc < fuselage_top(yc):
                buried += 1
                continue
            faces.append(quad)
    o = (len(rings) - 1) * n
    faces.append([o + j for j in range(n)])
    print(f"###NACELLE### rings={len(rings)} ring={n} open_on_the_crown={buried}")
    return make("Nacelle", verts, faces, M_PAINT, smooth_angle=45.0)


def build_keel():
    """Ventral keel under the nose gear bay: one flat plate, 8 triangles."""
    if not P["trim"]:
        return None
    pts = [(y, zt) for (y, zt, zb) in KEEL] + \
          [(y, zb) for (y, zt, zb) in reversed(KEEL)]
    n = len(pts)
    verts = [(-KEEL_HALF_T, y, z) for (y, z) in pts] + \
            [(KEEL_HALF_T, y, z) for (y, z) in pts]
    faces = [[j, (j + 1) % n, n + (j + 1) % n, n + j] for j in range(n)]
    faces.append(list(range(n - 1, -1, -1)))
    faces.append([n + j for j in range(n)])
    return make("Keel", verts, faces, M_PAINT, smooth_angle=20.0)


def build_intake():
    """The dark bore, as a dished cap set inside the lip ring.

    It is the only way to read an intake without either a hole in the hull or a
    black decal floating in front of it: one ring plus a centre vertex.
    """
    if not P["intake"]:
        return None
    n = P["nac_ring"]
    y, zb, zt, hw = NAC_STATIONS[0]
    zm = (zb + zt) / 2.0
    r_scale = 0.72
    verts = [(0.0, y - INTAKE_INSET - 0.10, zm)]
    for i in range(n):
        t = 2 * math.pi * i / n + math.pi / n
        verts.append((hw * r_scale * math.cos(t), y - INTAKE_INSET,
                      zm + (zt - zm) * r_scale * math.sin(t)))
    faces = [[0, 1 + i, 1 + (i + 1) % n] for i in range(n)]
    return make("Intake", verts, faces, M_DARK, smooth_angle=60.0)


# ----------------------------------------------------------------------------
# landing gear
# ----------------------------------------------------------------------------
def diamond_ring(center, hy, hx, n=4):
    """Streamlined ring: long in Y (chord), thin in X."""
    cx, cy, cz = center
    if n <= 3:
        return [(cx, cy + hy, cz), (cx + hx, cy - hy * 0.6, cz),
                (cx - hx, cy - hy * 0.6, cz)]
    return [(cx, cy + hy, cz), (cx + hx, cy, cz),
            (cx, cy - hy, cz), (cx - hx, cy, cz)]




def build_main_gear(side):
    """The main leg. A trailing link at the finest level, a strut below it.

    LOD3 builds all three members - forward leg, trailing arm, oleo - as one
    mesh under one node, so the retraction rig is untouched: it still turns a
    single `LandingGear_*` and the wheel and door still ride it as children.
    Articulating the linkage as the oleo compresses would need a node apiece
    and a runtime that can drive them, and neither exists.

    LOD2 and below keep the plain strut, which is the right thing to lose
    first: at 65 m the three members are one grey line whichever way they are
    built.
    """
    sgn = 1.0 if side == "Right" else -1.0
    x = sgn * GEAR_TRACK / 2.0
    end_z = MAIN_TIRE_R if P["wheel"] else 0.0
    top = (sgn * MAIN_STRUT_TOP_X, MAIN_STRUT_TOP_Y, MAIN_STRUT_TOP_Z)
    axle = (x, MAIN_AXLE_Y, end_z)

    if not P["bays"]:
        rings = [diamond_ring(p, hy, hx, P["gear_n"])
                 for p, (hy, hx) in zip((top, axle),
                                        ((0.115, 0.055), (0.070, 0.034)))]
        verts, faces = loft(rings, cap_start=P["gear_cap"], cap_end=P["gear_cap"])
    else:
        knee = (x, LINK_KNEE[0], LINK_KNEE[1])
        # The oleo lands on the arm, not on the axle: that is what makes it a
        # trailing link rather than a second leg.
        f = LINK_OLEO_F
        onarm = tuple(knee[c] + (axle[c] - knee[c]) * f for c in range(3))
        members = [
            # forward leg: down from the wing to the knee, near vertical
            ((sgn * (MAIN_STRUT_TOP_X - 0.010), LINK_KNEE[0] + 0.014,
              MAIN_STRUT_TOP_Z), knee, LINK_R["leg"], LINK_R["leg"]),
            # oleo: down from the wing onto the arm, aft of the leg
            (top, onarm, LINK_R["oleo"], (0.038, 0.034)),
            # trailing arm: knee aft and down to the axle
            (knee, axle, LINK_R["arm"], LINK_R["arm"]),
        ]
        verts, faces = [], []
        for p0, p1, r0, r1 in members:
            v, f2 = tube(p0, p1, r0, r1, P["gear_n"])
            faces.extend([[i + len(verts) for i in face] for face in f2])
            verts.extend(v)
    return make(f"LandingGear_{side}", verts, faces, M_METAL, smooth_angle=30.0,
                origin=(sgn * MAIN_HINGE[0], MAIN_STRUT_TOP_Y, MAIN_HINGE[1]))


def build_nose_gear():
    """Straight strut, origin on its lateral retraction hinge.

    Two rings for the same reason as the main leg: the mid station this used to
    carry at the finest level was within a degree of the line through the other
    two, and the dissolve pass had been deleting it at every level for as long
    as it has existed.
    """
    end_z = NOSE_TIRE_R if P["wheel"] else 0.0
    path = [(0.0, -1.10, 0.83), (0.0, NOSE_AXLE_Y, end_z)]
    halfs = [(0.105, 0.062), (0.070, 0.042)]
    rings = [diamond_ring(p, hy, hx, P["gear_n"]) for p, (hy, hx) in zip(path, halfs)]
    verts, faces = loft(rings, cap_start=P["gear_cap"], cap_end=P["gear_cap"])
    return make("LandingGear_Nose", verts, faces, M_METAL, smooth_angle=30.0,
                origin=(0.0, NOSE_HINGE[0], NOSE_HINGE[1]))


def build_gear_bay(name):
    """The pocket behind a mouth, so the hole is a bay and not a hole.

    A hole cut in a closed shell shows the inside of the far side of the shell,
    which reads as a hole in the aeroplane rather than as a place the gear
    lives. So the mouth is lofted up to a flat cap: five sides and a lid, in
    the dark material the tyres and the intake bore already use.

    The cap ring pulls in by BAY_TAPER rather than rising straight, because the
    section is still widening at the height these caps sit at - a straight wall
    off the edge of a mouth meets the skin about 60 mm up.
    """
    mouth = BAY_MOUTHS.get(name)
    if not mouth:
        return None
    bay = GEAR_BAYS[name]
    cx = sum(p[0] for p in mouth) / len(mouth)
    cy = sum(p[1] for p in mouth) / len(mouth)
    cap = [(cx + (p[0] - cx) * BAY_TAPER, cy + (p[1] - cy) * BAY_TAPER,
            bay["cap"]) for p in mouth]
    verts, faces = loft([list(mouth), cap], cap_start=False, cap_end=True)
    return make(f"GearBay_{name}", verts, faces, M_DARK, smooth_angle=0.0,
                flip_normals=True)


def build_bay_door(name):
    """The panel(s) over a mouth: the mouth's own outline, lifted clear of it.

    Zero thickness, drawn from both sides. A door is 3 mm of aluminium seen
    edge-on from nowhere anybody looks, and giving it a rim would cost as many
    triangles again as the panel itself.

    Each panel's origin is its hinge, so the runtime shuts it by turning this
    node, the same way it retracts a leg.
    """
    mouth = BAY_MOUTHS.get(name)
    if not mouth:
        return []
    bay = GEAR_BAYS[name]
    m = len(mouth) // 2
    zc = sum(p[2] for p in mouth) / len(mouth)

    def lift(p):
        dx, dz = p[0], p[2] - (zc + 0.6)
        d = math.hypot(dx, dz) or 1.0
        return (p[0] + dx / d * BAY_DOOR_LIFT, p[1],
                p[2] + dz / d * BAY_DOOR_LIFT)

    def panel(suffix, pts, hinge, axis, sgn):
        # Built OPEN: the exported model is always gear down, and every node has
        # to export with an identity rotation, so the open pose lives in the
        # vertices and the runtime turns the node the other way to shut it.
        turn = Matrix.Rotation(math.radians(bay["open"]) * sgn, 4, axis)
        h = Vector(hinge)
        pts = [tuple(turn @ (Vector(q) - h) + h) for q in pts]
        n = len(pts)
        return make(f"BayDoor_{name}{suffix}", pts,
                    [list(range(n)), list(range(n - 1, -1, -1))],
                    M_PAINT, origin=hinge, smooth_angle=0.0)

    spine = [lift(p) for p in BAY_SPINES[name]]
    lo = [lift(p) for p in mouth[:m]]
    hi = [lift(p) for p in mouth[m:]]              # already runs aft-to-fore
    # The hinge line is the door's own long edge, and on the belly that edge is
    # NOT horizontal: the keel rises toward the nose, about 9 deg over this
    # mouth. Turning the door about the global fore-aft axis instead does not
    # hold the hinged edge still - it lifts it off the mouth - and the open door
    # ends up lying parallel to the GROUND while the body it hangs from is
    # pitched up. In the fore-aft/vertical plane and pointing FORWARD: x is
    # dropped because the chain drifts a few millimetres laterally as the mouth
    # narrows, which would give the two doors hinge lines that are not mirror
    # images, and aft would swing them both up into the fuselage.
    axis = Vector(lo[-1]) - Vector(lo[0])
    axis = Vector((0.0, axis.y, axis.z)).normalized()
    if axis.y < 0:
        axis = -axis
    BAY_DOOR_AXES[name] = tuple(round(c, 5) for c in axis)
    return [panel(suffix, chain + spn, chain[len(chain) // 2], axis, sgn)
            for suffix, chain, spn, sgn in (
                ("_Left", lo, list(reversed(spine)), 1.0),
                ("_Right", hi, list(spine), -1.0))]


def build_wing_bay(side):
    """Pocket and door for the main gear bay cut into the wing's lower surface.

    Same recipe as the nose bay, and for the same reasons: a hole in a closed
    shell shows the far side of the shell unless something dark is put behind
    it, and the door is the mouth's own outline lifted 6 mm clear and built in
    the OPEN pose so the exported node keeps an identity rotation.

    One door, not a pair. The nose mouth straddles the centreline and needs two
    halves to stay symmetric; this one is wholly off it, so it hinges on its
    outboard edge and swings down - which is also what the photograph shows.
    """
    mouth = WING_BAY_MOUTHS.get(side)
    if not mouth:
        return []
    sgn = 1.0 if side == "Right" else -1.0
    cx = sum(p[0] for p in mouth) / len(mouth)
    cy = sum(p[1] for p in mouth) / len(mouth)
    cap = [(cx + (p[0] - cx) * WING_BAY_TAPER, cy + (p[1] - cy) * WING_BAY_TAPER,
            p[2] + WING_BAY_DEPTH) for p in mouth]
    verts, faces = loft([list(mouth), cap], cap_start=False, cap_end=True)
    bay = make(f"WingBay_{side}", verts, faces, M_DARK, smooth_angle=0.0,
               flip_normals=True)

    # The door is only the OUTBOARD part of the mouth: the wheel end stays open.
    # Its corners are interpolated along the mouth's two spanwise edges, which
    # is exact - a loft is ruled between its stations, so a point part way along
    # one of those edges is on the surface the wing already had.
    lo, hi = WING_BAY_X
    def at(t, a, b):
        return tuple(a[c] + (b[c] - a[c]) * t for c in range(3))
    t0 = (WING_DOOR_X[0] - lo) / (hi - lo)
    t1 = (WING_DOOR_X[1] - lo) / (hi - lo)
    # mouth is (A, j), (A, j+1), (B, j+1), (B, j); the spanwise edges are
    # 0->3 and 1->2, so walking t along both gives the sub-quad's corners.
    door_quad = [at(t0, mouth[0], mouth[3]), at(t0, mouth[1], mouth[2]),
                 at(t1, mouth[1], mouth[2]), at(t1, mouth[0], mouth[3])]
    pts = [(p[0], p[1], p[2] - BAY_DOOR_LIFT) for p in door_quad]

    # `loft` emits the mouth as (station A, row j), (A, j+1), (B, j+1), (B, j),
    # so its two FORE-AFT edges are (0,1) and (2,3) - each at one station, one
    # at each end - and the spanwise ones are (1,2) and (3,0). A wing gear door
    # hinges on a fore-aft edge and falls; hinging it spanwise, which is what
    # taking "the other pair" gives, swings it forward like a speed brake.
    edges = ((pts[0], pts[1]), (pts[2], pts[3]))
    out_i = 0 if abs(pts[0][0]) > abs(pts[2][0]) else 1
    hinge_edge = edges[out_i]
    hinge = tuple((hinge_edge[0][c] + hinge_edge[1][c]) / 2.0 for c in range(3))
    axis = (Vector(hinge_edge[1]) - Vector(hinge_edge[0])).normalized()
    if axis.y > 0:                       # point aft, so one sign serves both
        axis = -axis
    WING_BAY_AXES[side] = tuple(round(c, 5) for c in axis)
    turn = Matrix.Rotation(math.radians(WING_BAY_OPEN) * sgn, 4, axis)
    h = Vector(hinge)
    # The whole quad turns; the two points on the hinge edge sit on the axis
    # and do not move, so the winding is unchanged.
    quad = [tuple(turn @ (Vector(q) - h) + h) for q in pts]
    door = make(f"BayDoor_Main_{side}", quad,
                [[0, 1, 2, 3], [3, 2, 1, 0]], M_PAINT,
                origin=hinge, smooth_angle=0.0)
    return [bay, door]


def build_wheel(name, center, r, w, n):
    """Tyre as an n-gon cylinder with its axis along X.

    The ring angles start at -90 deg so ONE vertex sits exactly at the bottom of
    the tyre at every n.  The Cessna's LOD2 and LOD3 floated above the runway
    because their coarse wheels had no bottom vertex, and the bounding box the
    sim stands on is built from vertices, not from the circle they approximate.
    """
    if n <= 0:
        return None
    cx, cy, cz = center
    rings = []
    for s in (-w / 2.0, w / 2.0):
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n - math.pi / 2.0
            ring.append((cx + s, cy + r * math.cos(a), cz + r * math.sin(a)))
        rings.append(ring)
    verts, faces = loft(rings, cap_start=True, cap_end=True)
    return make(name, verts, faces, M_DARK, origin=center, smooth_angle=45.0)


# ----------------------------------------------------------------------------
# build everything
# ----------------------------------------------------------------------------
build_fuselage()

for side, sgn in (("Left", -1.0), ("Right", 1.0)):
    build_wing(side)
    if P["ctrl"]:
        build_ctrl(f"Flap_{side}", sgn, *WING_FLAP)
        build_ctrl(f"Aileron_{side}", sgn, *WING_AILERON, extra=(4.20,))
    build_vtail(side)
    if P["ctrl"]:
        build_ruddervator(side)
    build_main_gear(side)
    build_wing_bay(side)


build_nacelle()
build_intake()
build_nose_gear()
for _bay in GEAR_BAYS:
    build_gear_bay(_bay)
    build_bay_door(_bay)
build_wheel("Wheel_Left", (-GEAR_TRACK / 2.0, MAIN_AXLE_Y, MAIN_TIRE_R),
            MAIN_TIRE_R, MAIN_TIRE_W, P["wheel"])
build_wheel("Wheel_Right", (GEAR_TRACK / 2.0, MAIN_AXLE_Y, MAIN_TIRE_R),
            MAIN_TIRE_R, MAIN_TIRE_W, P["wheel"])
build_wheel("Wheel_Nose", (0.0, NOSE_AXLE_Y, NOSE_TIRE_R),
            NOSE_TIRE_R, NOSE_TIRE_W, P["wheel"])

# ----------------------------------------------------------------------------
# final placement: origin on the ground under the CG
# ----------------------------------------------------------------------------
SHIFT = Vector((0.0, -CG_SHIFT, 0.0))
for ob in BUILT:
    if ob.location.length < 1e-9:
        ob.data.transform(Matrix.Translation(SHIFT))
    else:
        ob.location = ob.location + SHIFT
bpy.context.view_layer.update()

# ----------------------------------------------------------------------------
# hang the wheels and the doors off their legs
#
# The runtime rig turns ONE named node about one axis, so everything that
# retracts with a leg has to be under it.  matrix_parent_inverse holds the
# child exactly where it was built; what the export then writes is a child
# whose own rotation is still identity, which verify_rig.py checks.
# ----------------------------------------------------------------------------
GEAR_CHILDREN = {
    "LandingGear_Nose": ["Wheel_Nose"],
    "LandingGear_Left": ["Wheel_Left", "GearDoor_Left"],
    "LandingGear_Right": ["Wheel_Right", "GearDoor_Right"],
}
by_name = {ob.name: ob for ob in BUILT}
for leg_name, child_names in GEAR_CHILDREN.items():
    leg = by_name.get(leg_name)
    if leg is None:
        continue
    for child_name in child_names:
        child = by_name.get(child_name)
        if child is None:                  # the far level ships no doors
            continue
        child.parent = leg
        child.matrix_parent_inverse = leg.matrix_world.inverted()
bpy.context.view_layer.update()

# Stow the gear, for a render that can show what a gear-down one cannot: that
# nothing sticks out of the skin when it is up.  The angles are the same ones
# GEAR_BINDINGS drives at runtime, written in Blender axes - main legs about
# the fore-aft axis (+Y), sign by side; nose leg aft about the lateral axis.
if GEAR < 1.0:
    turn = math.radians(90.0) * (1.0 - GEAR)
    for leg_name, axis, sign in (("LandingGear_Right", 'Y', 1.0),
                                 ("LandingGear_Left", 'Y', -1.0),
                                 ("LandingGear_Nose", 'X', float(-NOSE_SENSE))):
        leg = by_name.get(leg_name)
        if leg is None:
            continue
        leg.rotation_mode = 'XYZ'
        leg.rotation_euler = Matrix.Rotation(turn * sign, 4, axis).to_euler()
    # The doors run the other way: they are BUILT open, so stowing shuts them.
    for ob in BUILT:
        if not ob.name.startswith("BayDoor_"):
            continue
        which = ob.name.split("_")[1]
        if which == "Main":                       # a wing bay door
            side = ob.name.split("_")[2]
            axis = Vector(WING_BAY_AXES[side])
            sgn = 1.0 if side == "Right" else -1.0
            open_deg = WING_BAY_OPEN
        else:                                     # the nose pair
            axis = Vector(BAY_DOOR_AXES[which])
            sgn = -1.0 if ob.location[0] >= 0.0 else 1.0
            open_deg = GEAR_BAYS[which]["open"]
        shut = math.radians(open_deg) * sgn * (1.0 - GEAR)
        ob.rotation_mode = 'XYZ'
        ob.rotation_euler = Matrix.Rotation(-shut, 4, axis).to_euler()
    bpy.context.view_layer.update()

root = bpy.data.objects.new("Cirrus_Vision_Jet", None)
SC.collection.objects.link(root)
root.empty_display_size = 0.5
for ob in BUILT:
    if ob.parent is not None:
        continue
    ob.parent = root
    ob.matrix_parent_inverse = Matrix.Identity(4)

# ----------------------------------------------------------------------------
# report + save
# ----------------------------------------------------------------------------
for o in BUILT:
    o.data.calc_loop_triangles()
tris = sum(len(o.data.loop_triangles) for o in BUILT)
verts = sum(len(o.data.vertices) for o in BUILT)
print(f"###BUILD### lod={LOD} objects={len(BUILT)} tris={tris} verts={verts}")
for _n, _a in list(BAY_DOOR_AXES.items()) + list(WING_BAY_AXES.items()):
    # In glTF axes, which is what SURFACE_BINDINGS is written in:
    # blender (x, y, z) -> gltf (x, z, -y).
    print(f"###DOORAXIS### {_n} blender={_a} "
          f"gltf=({_a[0]:.5f}, {_a[2]:.5f}, {-_a[1]:.5f})")
print(f"###DISSOLVE### {DISSOLVE_DEG} deg gave back "
      f"{DISSOLVED[0] - DISSOLVED[1]} of {DISSOLVED[0]} triangles: "
      + "; ".join(DISSOLVED[2]))

if OUT_BLEND:
    os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print("###BLEND###", OUT_BLEND)
if OUT_GLB:
    os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB',
                              export_yup=True, export_apply=True)
    print("###GLB###", OUT_GLB)
