"""
Procedural low-poly Cirrus SF50 Vision Jet generator.

    blender -b --factory-startup --python generate_sf50.py -- \
        --lod 0 --blend out.blend [--glb out.glb]

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

# The main gear doors hang below the wing just ahead of the wheel and are one
# of the more recognisable things about the aircraft parked. (y, z) outline
# measured off the side view.
GEAR_DOOR = [(-3.95, 0.800), (-4.42, 0.795), (-4.40, 0.300), (-4.02, 0.315)]
GEAR_DOOR_X = 1.660
GEAR_DOOR_HALF_T = 0.028

# gear
NOSE_AXLE_Y = -1.138
NOSE_TIRE_R = 0.179                 # 5.00 x 5, drawn and published agree
MAIN_AXLE_Y = -4.434
MAIN_TIRE_R = 0.190                 # as drawn; the AMM calls out 18 x 5.5
GEAR_TRACK = 3.414                  # 11.2 ft
NOSE_TIRE_W = 0.115
MAIN_TIRE_W = 0.140

# The origin goes on the ground under the CG.  Quarter-MAC works out at
# Y = -3.97 and the tricycle balance point at about -4.03, so:
CG_SHIFT = -4.00

# ----------------------------------------------------------------------------
# fuselage stations
#   (y, z_bottom, z_maxwidth, z_top, half_width, p_upper, p_lower, level)
# p_* is the super-ellipse exponent of that half: 2.0 = ellipse, larger = flatter
# with harder shoulders.  level is the coarsest LOD that keeps the station:
# 0 = every level, because the station carries a feature (the nose and tail
# points that set the length, the windshield base, the belly's low point, the
# tail-cone pinch); 2 = LOD0 only, an in-between station that just smooths.
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
# Falls back to one plain band at the levels too coarse to resolve a shape.
CABIN_Y = (-4.506, -2.774)
# Half-width of the windshield's centre post, measured on the plan view. It
# tapers to nothing at each end of its run, which is both what the aircraft
# does - the two panes meet at the windshield's forward tip, and again where
# the roof line leaves the crown and the glass stops going over the top - and
# what keeps the post's ends off a ring line that has not been split. A post
# that just stopped left a T-junction at each end.
WINDSHIELD_POST_HALF = 0.031
POST_TAPER = 0.12                 # metres of run the taper is spread over
SNAP_M = 0.004                    # a cut nearer than this to a ring vertex
                                  # is that ring vertex


def post_half(y):
    """Half-width of the windshield's centre post at station y."""
    aft = WINDSHIELD_ROOF[0][0]                # where the glass stops wrapping
    if not (aft <= y <= WINDSHIELD_Y[1]):
        return 0.0
    d = min(WINDSHIELD_Y[1] - y, y - aft)
    return WINDSHIELD_POST_HALF * min(1.0, max(0.0, d) / POST_TAPER)

# Fractions of the pane half-length to put a station at. The +/-1.0 pair sits
# just outside the pane and closes it off; the rest sample its outline.
PANE_COLUMN_FRACTIONS = {
    # The pane's outline is sampled at these fractions of its half-length.
    # Each column costs FOUR triangles, not two: one on the pane and one in
    # the strip between the pane and the ring, top and bottom. Measured
    # against the super-ellipse it is cut from, nine columns hold the door
    # window's outline to 4.3 mm and the two aft ones to 3.5 mm - finer than
    # the 11-sided ring the pane is cut into, so more columns buy nothing.
    # Twelve columns cost twelve triangles a pane for 1.8 mm of outline.
    'fine': (0.99, 0.90, 0.72, 0.42, 0.0, -0.42, -0.72, -0.90, -0.99),
    'coarse': (0.97, 0.80, 0.45, 0.0, -0.45, -0.80, -0.97),
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
RING_SPEC = {
    11: dict(angles=[8, 48, 70, 90, 110, 132, 172, 200, 240, 300, 340],
             window=[0, 5], crown=[1, 2, 3, 4], top=2, crown_line=3),
    8:  dict(angles=[8, 48, 132, 172, 200, 250, 290, 340],
             window=[0, 2], crown=[1], top=1),
    6:  dict(angles=[10, 60, 120, 170, 230, 310],
             window=[0, 2], crown=[1], top=1),
    4:  dict(angles=[30, 150, 230, 310],
             window=[0], crown=[0], top=0),
}

# ----------------------------------------------------------------------------
# per-LOD tessellation.  Each level drops the cheapest-to-lose detail first:
# pane shape, then cross-section resolution, then control-surface separation,
# then part separation.  Every silhouette-defining feature - deep blunt nose,
# dorsal nacelle, low swept wing, 38.7 deg V-tail, dark wraparound glazing -
# survives to LOD3.
# ----------------------------------------------------------------------------
LODP = {
    0: dict(ring=11, st_level=2, pane_detail='fine', wheel=8,
            wing_st=(0.0, 1.30, 3.20, 5.60, SEMI),
            vt_st=(VT_ROOT_ETA, 0.55, 1.0), gear_n=4, gear_st=3,
            glass=True, ctrl=True, af='full', merge=False, nac_ring=8,
            pillars=True, intake=True, flat_gear=False, nac_st=5, panes=True,
            tip_cap=True, gear_cap=True),
    1: dict(ring=11, st_level=0, pane_detail='coarse', wheel=6,
            wing_st=(0.0, 1.30, SEMI),
            vt_st=(VT_ROOT_ETA, 1.0), gear_n=4, gear_st=2,
            glass=True, ctrl=True, af='full', merge=False, nac_ring=6,
            pillars=True, intake=True, flat_gear=False, nac_st=4, panes=True,
            tip_cap=True, gear_cap=True),
    2: dict(ring=6, st_level=-2, pane_detail='coarse', wheel=4,
            wing_st=(0.0, SEMI),
            vt_st=(VT_ROOT_ETA, 1.0), gear_n=3, gear_st=2,
            glass=True, ctrl=False, af='mid', merge=False, nac_ring=4,
            pillars=False, intake=False, flat_gear=False, nac_st=3, panes=False,
            tip_cap=True, gear_cap=True),
    3: dict(ring=4, st_level=-1, pane_detail='coarse', wheel=0,
            wing_st=(0.0, SEMI),
            vt_st=(VT_ROOT_ETA, 1.0), gear_n=3, gear_st=2,
            glass=True, ctrl=False, af='low', merge=True, nac_ring=4,
            pillars=False, intake=False, flat_gear=True, nac_st=2, panes=False,
            tip_cap=True, gear_cap=False),
}
P = LODP[LOD]

LOD2_STATIONS = {0.000, -0.80, -2.00, -3.20, -4.40, -5.27, -6.40, -7.85, -9.357}
LOD3_STATIONS = {0.000, -2.40, -4.40, -7.50, -9.357}

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
         extra_mats=None, face_mats=None):
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
    if LOD == 3:
        base = [s for s in STATIONS if s[0] in LOD3_STATIONS]
    elif LOD == 2:
        base = [s for s in STATIONS if s[0] in LOD2_STATIONS]
    else:
        base = [s for s in STATIONS if s[7] <= P["st_level"]]
    if not P["panes"]:
        return base, set()

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
    if P["glass"]:
        wanted += edge_ring_crossings(base, P["ring"])
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

    def emit(idx, glass):
        """One face, with its material decided structurally.

        Never by testing the geometry: a pane's own outline vertices sit
        exactly ON it, so any inside/outside test of them is a knife edge that
        sub-millimetre float noise flips - which once left a glazed sliver
        spiking the full height of the row off each end of a cabin window.
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
        fmats.append(1 if glass else 0)
        nonlocal glazed_n
        glazed_n += 1 if glass else 0

    def gap_of(y):
        for i in range(len(ys) - 1):
            if ys[i + 1] - 1e-9 <= y <= ys[i] + 1e-9:
                return i
        return None

    def row_point(y, z, j):
        """A point at station y and height z on face row j's own surface.

        Bilinear inside the row's quad, so the point lies on the ruled surface
        the fuselage already had. Putting it on the analytic section instead
        would stand it proud of the flat row either side and crease the cabin.
        """
        k = (j + 1) % n
        i = gap_of(y)
        span = ys[i] - ys[i + 1]
        t = 0.0 if abs(span) < 1e-12 else (ys[i] - y) / span
        lo = lerp3(rings[i][j], rings[i + 1][j], t)
        hi = lerp3(rings[i][k], rings[i + 1][k], t)
        dz = hi[2] - lo[2]
        f = 0.0 if abs(dz) < 1e-9 else (z - lo[2]) / dz
        return lerp3(lo, hi, min(max(f, 0.0), 1.0))

    def zip_chains(oc, oy, ic, iy, glass=False):
        """Tile the strip between two open chains that both run fore to aft.

        Which chain to advance is decided by Y - by where the next vertex
        actually is - so a vertex only ever joins the two vertices beside it
        and every face is as square as the two chains allow. The pane strips
        were tiled by index fraction instead, which pairs the FIRST of six
        station vertices with the first of twenty-four pane vertices however
        far apart they lie: the aft window came back as a sun, eight splinters
        up to 860 mm long fanning from one station vertex across a pane 360 mm
        long. Index fraction is still the right rule for two closed loops with
        no common parameter; these two have Y.
        """
        p = q = 0
        while p + 1 < len(oc) or q + 1 < len(ic):
            no = oy[p + 1] if p + 1 < len(oc) else -1e9
            ni = iy[q + 1] if q + 1 < len(ic) else -1e9
            if no > ni + 1e-9:               # the outer vertex comes first
                emit((oc[p], ic[q], oc[p + 1]), glass)
                p += 1
            elif ni > no + 1e-9:
                emit((oc[p], ic[q], ic[q + 1]), glass)
                q += 1
            else:                            # they are the same station
                emit((oc[p], ic[q], ic[q + 1], oc[p + 1]), glass)
                p += 1
                q += 1

    consumed = {j: set() for j in range(n)}

    def cut_cabin_pane(j, yc, a, zc, b, ex):
        """A cabin window: a hole in the row, closed to its own outline.

        The hole runs from the station just ahead of the pane to the one just
        behind it, and the strip that closes it is tiled along Y, so every
        face in it spans one pane column and nothing reaches across the block.
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
        fr = list(PANE_COLUMN_FRACTIONS[P["pane_detail"]])
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
            lo_edge.append(add(row_point(y, zc - h, j)))
            hi_edge.append(add(row_point(y, zc + h, j)))

        # Below the pane and above it are two separate strips, each between a
        # ring line and the pane edge facing it, and each tiled along Y. The
        # two ends of the block close with one face apiece.
        lo_line, hi_line = (j, k) if rings[ia][j][2] < rings[ia][k][2] \
            else (k, j)
        sy = [ys[i] for i in range(ia, ib + 1)]
        zip_chains([i * n + lo_line for i in range(ia, ib + 1)], sy,
                   lo_edge, cols)
        zip_chains([i * n + hi_line for i in range(ia, ib + 1)], sy,
                   hi_edge, cols)
        emit((ia * n + lo_line, ia * n + hi_line, hi_edge[0], lo_edge[0]),
             False)
        emit((ib * n + lo_line, ib * n + hi_line, hi_edge[-1], lo_edge[-1]),
             False)
        for c in range(len(cols) - 1):
            emit((lo_edge[c], lo_edge[c + 1], hi_edge[c + 1], hi_edge[c]), True)
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

    def glazed(p, ym):
        """Is this point on the skin glass? Structural, not a knife edge.

        Only ever asked about the middle of a strip, never about a vertex on a
        pane's own outline: a vertex sits exactly ON the boundary, so testing
        one is a coin toss that float noise flips - which is how a glazed
        sliver once ended up spiking off the end of a cabin window.
        """
        if P["pillars"] and abs(p[0]) <= post_half(ym):
            return False
        return sill_z(ym) < p[2] < roof_z(ym)

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
                edges = [(2, sill_z(ya), sill_z(yb)),
                         (2, roof_z(ya), roof_z(yb))]
                cl = spec.get("crown_line")
                # The centre post is a vertical edge, and only in the two rows
                # that touch top dead centre - asking for it anywhere else cuts
                # the belly in half for nothing.
                if P["pillars"] and cl is not None and j in (cl - 1, cl):
                    sgn = 1.0 if j == cl - 1 else -1.0
                    edges.append((0, sgn * post_half(ya), sgn * post_half(yb)))
                cuts = []
                for c, va, vb in edges:
                    da, db = pa1[c] - pa0[c], pb1[c] - pb0[c]
                    if abs(da) < 1e-9 or abs(db) < 1e-9:
                        continue
                    fa = snap(pa0, pa1, (va - pa0[c]) / da)
                    fb = snap(pb0, pb1, (vb - pb0[c]) / db)
                    if (fa <= 0.0 and fb <= 0.0) or (fa >= 1.0 and fb >= 1.0):
                        continue        # wholly one side of this row
                    cuts.append((min(max(fa, 0.0), 1.0),
                                 min(max(fb, 0.0), 1.0)))
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
                    if not glazed(mid, ym):
                        continue
                consumed[j].add(g)
                cuts.sort(key=lambda t: t[0] + t[1])
                levels = [(0.0, 0.0)]
                for fa, fb in cuts + [(1.0, 1.0)]:
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
                        emit(quad, glazed(mid, ym))
        panes_cut += 1
    if P["panes"]:
        if P["glass"]:
            cut_windshield()
        for j in spec["window"]:
            for (yc, a, zc, b, ex) in CABIN_WINDOWS:
                cut_cabin_pane(j, yc, a, zc, b, ex)

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

    def row_glass(i0, i1, j, k):
        if not P["glass"] or P["panes"]:
            return False        # cut_windshield already took every glazed row
        # Too coarse to resolve a pane shape: a plain band instead. The roof
        # line still applies - a level too coarse for the window shapes is not
        # too coarse to notice a bubble canopy.
        mid = (ys[i0] + ys[i1]) / 2.0
        zmid = (rings[i0][j][2] + rings[i0][k][2]
                + rings[i1][j][2] + rings[i1][k][2]) / 4.0
        return (CABIN_Y[0] <= mid <= CABIN_Y[1] and j in spec["window"]) \
            or (in_ws(mid) and zmid < roof_z(mid)
                and j in set(spec["window"]) | set(spec["crown"]))

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
                         row_glass(A[p], na, j, k))
                    p += 1
                elif na is None or nb < na:
                    emit((A[p] * n + j, B[q] * n + k, nb * n + k),
                         row_glass(B[q], nb, j, k))
                    q += 1
                else:
                    emit((A[p] * n + j, B[q] * n + k, nb * n + k, na * n + j),
                         row_glass(A[p], na, j, k))
                    p += 1
                    q += 1
            g = g1 + 1

    faces.append(list(range(n - 1, -1, -1))); fmats.append(0)
    faces.append([(len(rings) - 1) * n + j for j in range(n)]); fmats.append(0)

    print(f"###FUSELAGE### stations={len(sts)} ring={n} glazed_faces={glazed_n} "
          f"panes={panes_cut} (0 duplicated, 0 occluded)")
    return make("Fuselage", verts, faces, M_PAINT,
                extra_mats=[M_GLASS], face_mats=fmats)


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
AF4_WING = [(0.000, 0.000), (0.350, 0.100), (1.000, 0.002), (0.350, -0.058)]
AF6_TAIL = [(0.000, 0.000), (0.180, 0.047), (0.500, 0.046),
            (1.000, 0.001), (0.500, -0.046), (0.180, -0.047)]
AF4_TAIL = [(0.000, 0.000), (0.380, 0.050), (1.000, 0.001), (0.380, -0.050)]
# LOD3 only: a flat-bottomed wedge. At the distance that level is drawn from,
# the V-tail's job is to be a 38.7 deg V of the right size, not an aerofoil.
AF3_TAIL = [(0.000, 0.000), (0.380, 0.050), (1.000, 0.001)]

WING_AF = {'full': AF_WING, 'mid': AF6_WING, 'low': AF4_WING}[P["af"]]
TAIL_AF = {'full': AF_TAIL, 'mid': AF6_TAIL, 'low': AF3_TAIL}[P["af"]]

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


def build_wing(side):
    sgn = 1.0 if side == "Right" else -1.0
    rings = []
    for x in P["wing_st"]:
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
    verts, faces = loft(rings, cap_start=(LOD == 0), cap_end=P["tip_cap"])
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
    if LOD >= 2:
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
    sgn = 1.0 if side == "Right" else -1.0
    axle_x = sgn * GEAR_TRACK / 2.0
    top = (sgn * 0.60, -4.30, 0.66)
    end_z = MAIN_TIRE_R if P["wheel"] else 0.0
    if P["gear_st"] >= 3:
        path = [top, (sgn * 1.30, -4.36, 0.45), (axle_x, MAIN_AXLE_Y, end_z)]
        halfs = [(0.115, 0.055), (0.095, 0.045), (0.070, 0.034)]
    else:
        path = [top, (axle_x, MAIN_AXLE_Y, end_z)]
        halfs = [(0.115, 0.055), (0.070, 0.034)]
    rings = [diamond_ring(p, hy, hx, P["gear_n"]) for p, (hy, hx) in zip(path, halfs)]
    verts, faces = loft(rings, cap_start=P["gear_cap"], cap_end=P["gear_cap"])
    return make(f"LandingGear_{side}", verts, faces, M_METAL, smooth_angle=30.0)


def build_nose_gear():
    end_z = NOSE_TIRE_R if P["wheel"] else 0.0
    path = [(0.0, -1.10, 0.83), (0.0, -1.12, 0.50), (0.0, NOSE_AXLE_Y, end_z)]
    halfs = [(0.105, 0.062), (0.088, 0.052), (0.070, 0.042)]
    if P["gear_st"] <= 2:
        path, halfs = [path[0], path[-1]], [halfs[0], halfs[-1]]
    rings = [diamond_ring(p, hy, hx, P["gear_n"]) for p, (hy, hx) in zip(path, halfs)]
    verts, faces = loft(rings, cap_start=P["gear_cap"], cap_end=P["gear_cap"])
    return make("LandingGear_Nose", verts, faces, M_METAL, smooth_angle=30.0)


def build_gear_door(side):
    if LOD >= 2:
        return None
    sgn = 1.0 if side == "Right" else -1.0
    n = len(GEAR_DOOR)
    verts = [(sgn * (GEAR_DOOR_X - GEAR_DOOR_HALF_T), y, z) for (y, z) in GEAR_DOOR] + \
            [(sgn * (GEAR_DOOR_X + GEAR_DOOR_HALF_T), y, z) for (y, z) in GEAR_DOOR]
    faces = [[j, (j + 1) % n, n + (j + 1) % n, n + j] for j in range(n)]
    faces.append(list(range(n - 1, -1, -1)))
    faces.append([n + j for j in range(n)])
    return make(f"GearDoor_{side}", verts, faces, M_PAINT, smooth_angle=20.0)


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
    build_gear_door(side)


build_nacelle()
build_intake()
build_keel()
build_nose_gear()
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

if P["merge"]:
    if len(BUILT) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for o in BUILT:
            o.select_set(True)
        bpy.context.view_layer.objects.active = BUILT[0]
        bpy.ops.object.join()
        merged = bpy.context.view_layer.objects.active
        merged.name = "Cirrus_Vision_Jet_Body"
        merged.data.name = "Cirrus_Vision_Jet_Body"
        BUILT[:] = [merged]

root = bpy.data.objects.new("Cirrus_Vision_Jet", None)
SC.collection.objects.link(root)
root.empty_display_size = 0.5
for ob in BUILT:
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
