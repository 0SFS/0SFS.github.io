"""
Procedural low-poly Cessna 172S Skyhawk generator.

    blender -b --factory-startup --python generate_c172.py -- \
        --lod 0 --blend out.blend [--glb out.glb]

Method: measured reconstruction.  The fuselage is a loft through explicit
cross-section STATIONS (not a stretched primitive); the flying surfaces are
lofts through explicit airfoil sections on a measured planform.  All numbers
come from measurements/c172_reference_dimensions.md.

Convention:  +X = right wing, +Y = nose, +Z = up.
Working origin during construction: Y=0 at the WING LEADING EDGE ROOT,
Z=0 at the ground.  Everything is shifted by CG_SHIFT at the end so the
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
LOD      = int(arg("--lod", 0))
OUT_BLEND = arg("--blend")
OUT_GLB   = arg("--glb")

# ----------------------------------------------------------------------------
# measured constants
# ----------------------------------------------------------------------------
SPAN        = 10.998
SEMI        = SPAN / 2.0            # 5.499
ROOT_CHORD  = 1.63
TIP_CHORD   = 1.09
TAPER_START = 2.65                  # measured: LE is still unswept at 2.72 m out
DIHEDRAL    = math.radians(1.733)
INCIDENCE   = math.radians(1.5)
WING_LE_Z   = 1.99                  # chord-plane z at the wing root LE (sits on the cabin roof)
THICK       = 0.12                  # t/c

HTAIL_SEMI  = 3.429 / 2.0           # 1.7145
HTAIL_ROOTC = 1.30
HTAIL_TIPC  = 0.92
HTAIL_LE_Y  = -4.51                 # LE at the root (same station as the fin LE root)
HTAIL_Z     = 1.38                  # just below the tail-cone top line
HTAIL_SWEEP = 0.22                  # LE sweep-back over the semi-span

PROP_R      = 1.93 / 2.0            # 0.965
THRUST_Z    = 1.25                  # 0.28 m static prop clearance + radius
SPINNER_TIP_Y = 1.94
COWL_FRONT_Y  = 1.55

GEAR_TRACK  = 2.50
MAIN_AXLE_Y = -0.93
NOSE_AXLE_Y = 0.70
MAIN_TIRE_R = 0.22
NOSE_TIRE_R = 0.175
MAIN_TIRE_W = 0.18
NOSE_TIRE_W = 0.14

CG_SHIFT    = -0.62                 # working-Y of the CG; origin is shifted here at the end

# fuselage stations: (y, z_bottom, z_maxwidth, z_top, half_width, p_upper, p_lower, level)
# every number traceable to measurements/c172_reference_dimensions.md
STATIONS = [
    # The cross-section is NOT a tube down the whole length.  It goes:
    #   round cowl  ->  FLAT-TOPPED cabin under the wing  ->  round tail cone.
    # p_upper is the upper-half super-ellipse exponent: ~2.4 = round,
    # >=5 = flat top with hard shoulders.  Over the wing chord (y = 0 .. -1.63)
    # z_top is held constant at the wing's lower-surface height so the wing and
    # the cabin roof are ONE structure with no gap between them.
    ( 1.55, 0.99, 1.22, 1.43, 0.220, 2.4, 2.4, 0),   # cowl front ring - round
    ( 1.15, 0.82, 1.22, 1.51, 0.380, 2.5, 2.7, 2),   # round
    ( 0.80, 0.71, 1.25, 1.56, 0.480, 2.6, 3.0, 1),   # round
    ( 0.48, 0.66, 1.30, 1.60, 0.510, 2.8, 3.4, 0),   # firewall / windshield base
    ( 0.19, 0.65, 1.35, 1.79, 0.525, 3.6, 3.8, 1),   # windshield, squaring up
    (-0.10, 0.65, 1.40, 1.98, 0.528, 5.5, 4.0, 0),   # windshield top: FLAT TOP begins
    (-0.17, 0.65, 1.405, 1.98, 0.529, 5.7, 4.0, 0),  # aft edge of the A post
    (-0.95, 0.65, 1.44, 1.98, 0.535, 7.0, 4.0, 1),   # cabin under the wing - flat top
    (-1.02, 0.653, 1.437, 1.98, 0.534, 6.9, 4.0, 0), # aft edge of the B post
    (-1.63, 0.66, 1.43, 1.98, 0.525, 6.0, 4.0, 0),   # wing TE root: flat top ends
    (-1.79, 0.667, 1.420, 1.900, 0.512, 5.1, 3.8, 0), # the two stations below bracket
    (-1.95, 0.674, 1.410, 1.850, 0.498, 4.1, 3.6, 0), # the raked C pillar
    (-2.10, 0.68, 1.40, 1.80, 0.485, 3.2, 3.4, 0),   # rear window - rounding again
    (-2.60, 0.70, 1.34, 1.60, 0.435, 2.6, 3.0, 1),
    (-3.30, 0.79, 1.26, 1.470, 0.335, 2.4, 2.8, 0),  # tail cone: top nearly level,
    (-4.00, 0.88, 1.20, 1.440, 0.255, 2.3, 2.6, 2),  # belly sweeping up
    (-4.70, 0.99, 1.20, 1.425, 0.185, 2.3, 2.5, 1),
    (-5.40, 1.12, 1.24, 1.410, 0.115, 2.2, 2.3, 2),
    (-6.05, 1.27, 1.32, 1.390, 0.045, 2.2, 2.2, 0),  # tail end
]

# Longitudinal extent of each glazed region (tested against segment midpoints).
WINDSHIELD_Y = (0.00, 0.50)     # stops at the wing LE root: aft of that the wing
                                # covers the crown, so glass there would be waste
CABIN_Y      = (-1.63, 0.00)
REARWIN_Y    = (-2.16, -1.63)

# Cabin posts are real ~70 mm fuselage segments that simply do not get the glass
# material - no overlay geometry, nothing hidden underneath.
# A and B posts are vertical bands; the C post is the raked wedge formed by the
# diagonal of the forward rear-window face (see build_fuselage).
POST_BANDS = [(-0.17, -0.10), (-1.02, -0.95)]
POST_STATION_YS = {-0.17, -1.02}


def in_post_band(y):
    return any(lo <= y <= hi for lo, hi in POST_BANDS)


# Per-LOD tessellation.  These are NOT blind decimations: each level drops the
# cheapest-to-lose detail first (cross-section resolution, then control-surface
# separation, then part separation) while every silhouette-defining feature
# (high wing + dihedral, struts, tricycle gear, swept fin, tail cone, prop disc)
# survives to LOD3.
LODP = {
    0: dict(ring=10, st_level=2, wheel=8, spin=6, prop_st=3,
            wing_st=(0.0, TAPER_START, 5.30, SEMI), gear_st=4, gear_n=4, strut_n=4,
            glass=True, ctrl=True, af='full', merge=False,
            spin_rings=3, prop_flat=False, fin_pts=0, flat_gear=False, prop_2st=False,
            pillars=True),
    1: dict(ring=8,  st_level=1, wheel=6, spin=6, prop_st=2,
            wing_st=(0.0, TAPER_START, SEMI), gear_st=3, gear_n=4, strut_n=4,
            glass=True, ctrl=True, af='full', merge=False,
            spin_rings=3, prop_flat=False, fin_pts=0, flat_gear=False, prop_2st=False,
            pillars=True),
    2: dict(ring=6,  st_level=-2, wheel=4, spin=4, prop_st=2,
            wing_st=(0.0, TAPER_START, SEMI), gear_st=2, gear_n=3, strut_n=3,
            glass=True, ctrl=False, af='mid', merge=False,
            spin_rings=2, prop_flat=False, fin_pts=6, flat_gear=False, prop_2st=True,
            pillars=False),
    3: dict(ring=6,  st_level=-1, wheel=0, spin=4, prop_st=2,
            wing_st=(0.0, SEMI), gear_st=2, gear_n=2, strut_n=2,
            glass=True, ctrl=False, af='low', merge=True,
            spin_rings=2, prop_flat=True, fin_pts=5, flat_gear=True, prop_2st=True,
            pillars=False),
}
P = LODP[LOD]
# LOD3 uses an explicit reduced station subset
LOD2_STATIONS = {1.55, 0.48, -0.10, -1.63, -2.10, -3.30, -6.05}
LOD3_STATIONS = {1.55, 0.48, -0.10, -1.63, -6.05}

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

M_PAINT = mat("C172_Paint", (0.90, 0.90, 0.91, 1.0), 0.35)
M_TRIM  = mat("C172_Trim",  (0.10, 0.24, 0.48, 1.0), 0.30)
M_GLASS = mat("C172_Glass", (0.035, 0.052, 0.078, 1.0), 0.42, spec=0.12)
M_DARK  = mat("C172_Dark",  (0.09, 0.09, 0.10, 1.0), 0.55)   # tyres, prop, antiglare
M_METAL = mat("C172_Metal", (0.55, 0.56, 0.58, 1.0), 0.32, metal=0.85)  # gear, struts, spinner

# ----------------------------------------------------------------------------
# mesh helpers
# ----------------------------------------------------------------------------
BUILT = []

def make(name, verts, faces, material, origin=None, smooth_angle=40.0,
         extra_mats=None, face_mats=None):
    """Create a mesh object, recalc normals, triangulate, set origin.

    extra_mats/face_mats add a second material slot without adding any geometry
    (used for the fuselage trim stripe): one extra submesh, no extra vertices.
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
    keep_mats = list(face_mats) if face_mats else None

    bm = bmesh.new()
    bm.from_mesh(me)
    if keep_mats is None:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    # drop zero-area triangles
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


def set_origin(ob, world_point):
    """Move the object origin to world_point without moving the geometry."""
    d = Vector(world_point)
    ob.data.transform(Matrix.Translation(-d))
    ob.location = d


def loft(rings, cap_start=False, cap_end=False):
    """Loft a list of equal-length closed point rings -> (verts, faces)."""
    n = len(rings[0])
    if n == 2:                       # degenerate ring -> flat ribbon
        return loft_open(rings)
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


def loft_open(rings, cap_start=False, cap_end=False):
    """Loft a list of equal-length OPEN point strips -> (verts, faces)."""
    n = len(rings[0])
    verts, faces = [], []
    for r in rings:
        verts.extend(r)
    for i in range(len(rings) - 1):
        a, b = i * n, (i + 1) * n
        for j in range(n - 1):
            faces.append([a + j, a + j + 1, b + j + 1, b + j])
    if cap_start:
        faces.append(list(range(n - 1, -1, -1)))
    if cap_end:
        o = (len(rings) - 1) * n
        faces.append([o + j for j in range(n)])
    return verts, faces


def extrude_profile(pts_yz, x_half, name_faces=True):
    """Take a 2-D outline in the (y,z) plane, give it +/- x_half thickness."""
    n = len(pts_yz)
    verts = [(-x_half, y, z) for (y, z) in pts_yz] + [(x_half, y, z) for (y, z) in pts_yz]
    faces = []
    for j in range(n):
        k = (j + 1) % n
        faces.append([j, k, n + k, n + j])
    faces.append(list(range(n - 1, -1, -1)))
    faces.append([n + j for j in range(n)])
    return verts, faces


# ----------------------------------------------------------------------------
# fuselage
# ----------------------------------------------------------------------------
# Ring angles are CHOSEN, not evenly spaced.  Even spacing puts no vertex at the
# window sill or head, which is what previously forced the glazing to be a
# separate offset shell.  Placing vertices deliberately means the cabin window
# is exactly one face row of the fuselage itself, so glazing costs nothing but a
# material index.  Each table also keeps a flat top EDGE (no vertex at top dead
# centre) for the flat cabin roof, and a flat bottom edge for the belly.
#   window : face rows that are the cabin side windows
#   crown  : face rows the windshield / rear window wrap over
#   top    : the flat top face row (dropped under the wing, and the rear-window
#            centre post)
RING_SPEC = {
    10: dict(angles=[0, 45, 78, 102, 135, 180, 215, 250, 290, 325],
             window=[0, 4], crown=[1, 2, 3], top=2),
    8:  dict(angles=[0, 45, 78, 102, 135, 180, 240, 300],
             window=[0, 4], crown=[1, 2, 3], top=2),
    6:  dict(angles=[0, 60, 120, 180, 250, 290],
             window=[0, 2], crown=[1], top=1),
    4:  dict(angles=[45, 135, 225, 315],
             window=[], crown=[0], top=0),
}


def ring_angles(n):
    return [math.radians(a) for a in RING_SPEC[n]["angles"]]


def section(y, zb, zm, zt, hw, pu, pl, n):
    """Cross-section point ring: two half super-ellipses sharing the max-width line."""
    pts = []
    for t in ring_angles(n):
        c, s = math.cos(t), math.sin(t)
        p = pu if s >= 0 else pl
        e = 2.0 / p
        x = hw * math.copysign(abs(c) ** e, c)
        zr = (zt - zm) if s >= 0 else (zm - zb)
        z = zm + math.copysign(abs(s) ** e, s) * zr
        pts.append((x, y, z))
    return pts


def fuselage_stations():
    if LOD == 3:
        base = [s for s in STATIONS if s[0] in LOD3_STATIONS]
    elif LOD == 2:
        base = [s for s in STATIONS if s[0] in LOD2_STATIONS]
    else:
        base = [s for s in STATIONS if s[7] <= P["st_level"]]
    if not P["pillars"]:
        base = [s for s in base if s[0] not in POST_STATION_YS]
    return base


STRIPE_Y = None   # trim stripe disabled: one ring row is ~0.5 m tall at
                  # 12 points, far too wide to read as a Cessna trim line


def _stripe_row(j, n):
    """The single face row that straddles the max-width line on each side."""
    a = _mid_angle(j, n)
    return (335.0 <= a <= 360.0) or (0.0 <= a <= 8.0) or (172.0 <= a <= 205.0)


def _point_in_poly(y, z, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        yi, zi = poly[i]
        yj, zj = poly[j]
        if (zi > z) != (zj > z) and y < (yj - yi) * (z - zi) / (zj - zi) + yi:
            inside = not inside
        j = i
    return inside


def wing_lower_z(y):
    """Lower-surface z of the placed wing root airfoil at working y.

    y = 0 is the wing LE root, y = -ROOT_CHORD the TE root.
    """
    pts = af_points(AF_CAMBERED, ROOT_CHORD, 1.0, 0.0, WING_LE_Z, 0.0, INCIDENCE)
    lower = [(p[1], p[2]) for p in pts[4:]] + [(pts[0][1], pts[0][2])]   # TE -> LE
    lower.sort(key=lambda t: t[0])                                       # by y ascending
    if y <= lower[0][0]:
        return lower[0][1]
    if y >= lower[-1][0]:
        return lower[-1][1]
    for i in range(len(lower) - 1):
        y0, z0 = lower[i]
        y1, z1 = lower[i + 1]
        if y0 <= y <= y1:
            t = (y - y0) / (y1 - y0) if y1 != y0 else 0.0
            return z0 + (z1 - z0) * t
    return lower[-1][1]


def roofline(y, z_top_default, zm, pu, n):
    """Cabin roof height at working y.

    Over the wing chord the wing IS the roof, so the fuselage top follows the
    wing's LOWER surface.  The ring has no vertex at top dead centre (see
    ring_angles), so the visible crown sits a little below the nominal z_top;
    z_top is solved backwards from the wanted crown height so the crown lands
    exactly on the wing's lower surface.
    """
    if -ROOT_CHORD <= y <= 0.0:
        frac = -y / ROOT_CHORD
        inset = 0.022 * min(1.0, frac / 0.06, (1.0 - frac) / 0.06)
        target = wing_lower_z(y) + max(0.0, inset)
        a = math.radians(90.0 - (360.0 / n) / 2.0)      # shoulder angle of the top face
        sh = math.sin(a) ** (2.0 / pu)
        return zm + (target - zm) / sh
    return z_top_default


def wing_root_profile():
    """The wing root airfoil as a closed (y, z) polygon.

    Over the fuselage the wing is a constant-chord spanwise extrusion, so any
    fuselage face whose corners all fall inside this profile is sealed inside
    the wing solid and can never be seen from outside.
    """
    pts = af_points(AF_CAMBERED, ROOT_CHORD, 1.0, 0.0, WING_LE_Z, 0.0, INCIDENCE)
    return [(p[1], p[2]) for p in pts]


def build_fuselage():
    """Fuselage skin, with the glazing carried as a second material slot.

    The cabin windows ARE fuselage polygons with a different material index -
    no overlay shell, so nothing is duplicated and nothing is permanently hidden
    underneath.  One extra submesh, zero extra geometry.
    """
    n = P["ring"]
    spec = RING_SPEC[n]
    sts = fuselage_stations()
    rings = [section(st[0], st[1], st[2], roofline(st[0], st[3], st[2], st[5], n),
                     st[4], st[5], st[6], n) for st in sts]

    verts = []
    for r in rings:
        verts.extend(r)

    faces, fmats = [], []
    dropped = glazed_n = 0

    # which segments are the forward-most windshield / aft-most rear-window one:
    # their outer corner faces stay painted so the glazing reads as rounded
    # rather than square-cornered
    ws_idx = [i for i in range(len(rings) - 1)
              if WINDSHIELD_Y[0] <= (sts[i][0] + sts[i + 1][0]) / 2.0 <= WINDSHIELD_Y[1]]
    rw_idx = [i for i in range(len(rings) - 1)
              if REARWIN_Y[0] <= (sts[i][0] + sts[i + 1][0]) / 2.0 < REARWIN_Y[1]]
    ws_front = ws_idx[0] if ws_idx else None
    rw_back = rw_idx[-1] if rw_idx else None
    # C pillar: a raked band, not a vertical one.  Two adjacent segments are cut
    # along the SAME diagonal - the forward one keeps its lower-forward triangle
    # glazed, the aft one paints its lower-forward triangle - so the pillar comes
    # out as a roughly constant-width strip leaning down and aft at ~35 deg,
    # which is what the 172G side view shows.  Costs one station, no more.
    cp_fwd = rw_idx[0] if (len(rw_idx) >= 3 and P["pillars"]) else None
    cp_aft = rw_idx[1] if (len(rw_idx) >= 3 and P["pillars"]) else None

    def lerp3(a, b, t):
        return tuple(a[c] + (b[c] - a[c]) * t for c in range(3))

    for i in range(len(rings) - 1):
        a, b = i * n, (i + 1) * n
        my = (sts[i][0] + sts[i + 1][0]) / 2.0

        glazed = set()
        is_rear = False
        if in_post_band(my):
            pass                                   # cabin post: painted, no glass
        elif WINDSHIELD_Y[0] <= my <= WINDSHIELD_Y[1]:
            glazed = set(spec["crown"]) | set(spec["window"])
        elif CABIN_Y[0] <= my < CABIN_Y[1]:
            glazed = set(spec["window"])
        elif REARWIN_Y[0] <= my < REARWIN_Y[1]:
            is_rear = True
            glazed = set(spec["crown"]) | set(spec["window"])

        # a segment lying wholly under the wing root chord: the wing closes the
        # top there, so leave the fuselage OPEN.  The segment that reaches the
        # trailing edge is excluded - the wing thins to a knife edge there and
        # stops covering the cut-out, which left a visible hole in the roof.
        under_wing = (sts[i][0] <= 1e-9
                      and sts[i + 1][0] >= -ROOT_CHORD + 0.10)

        for j in range(n):
            k = (j + 1) % n
            if under_wing and j == spec["top"]:
                dropped += 1
                continue

            # rear-window centre post: split the flat top row into
            # glass | 70 mm painted post | glass instead of painting the whole
            # row, which made the centre post ~8x thicker than the side posts
            if is_rear and P["pillars"] and j == spec["top"]:
                a0, a1 = rings[i][j], rings[i][k]
                b0, b1 = rings[i + 1][j], rings[i + 1][k]
                def half(p0, p1):
                    dx = abs(p0[0] - p1[0])
                    return min(0.45, 0.035 / dx) if dx > 1e-6 else 0.45
                f0, f1 = half(a0, a1), half(b0, b1)
                ia = len(verts)
                verts.append(lerp3(a0, a1, 0.5 - f0))
                verts.append(lerp3(a0, a1, 0.5 + f0))
                ib = len(verts)
                verts.append(lerp3(b0, b1, 0.5 - f1))
                verts.append(lerp3(b0, b1, 0.5 + f1))
                faces.append([a + j, ia, ib, b + j]);          fmats.append(1)
                faces.append([ia, ia + 1, ib + 1, ib]);        fmats.append(0)
                faces.append([ia + 1, a + k, b + k, ib + 1]);  fmats.append(1)
                glazed_n += 2
                continue

            # Corner rounding, free of charge: the corner pane is already two
            # triangles, so paint only the OUTER-LOWER one and leave the upper
            # one glazed.  The resulting diagonal chamfers the corner instead of
            # leaving it square, without adding a single polygon.
            corner = None
            if j in glazed and j in spec["window"]:
                if i == ws_front:
                    corner = "front"
                elif i == cp_fwd:
                    corner = "cpillar_fwd"
                elif i == cp_aft:
                    corner = "cpillar_aft"
                elif i == rw_back:
                    corner = "back"
            if corner:
                lo_is_j = rings[i][j][2] < rings[i][k][2]
                f_lo, f_hi = (a + j, a + k) if lo_is_j else (a + k, a + j)
                r_lo, r_hi = (b + j, b + k) if lo_is_j else (b + k, b + j)
                if corner == "front":
                    faces.append([f_lo, f_hi, r_lo]);  fmats.append(0)   # front-lower: paint
                    faces.append([f_hi, r_hi, r_lo]);  fmats.append(1)   # upper: glass
                elif corner == "cpillar_fwd":
                    faces.append([f_lo, f_hi, r_lo]);  fmats.append(1)   # rear side window
                    faces.append([f_hi, r_hi, r_lo]);  fmats.append(0)   # pillar, upper half
                elif corner == "cpillar_aft":
                    faces.append([f_lo, f_hi, r_lo]);  fmats.append(0)   # pillar, lower half
                    faces.append([f_hi, r_hi, r_lo]);  fmats.append(1)   # rear window
                else:
                    faces.append([f_lo, f_hi, r_hi]);  fmats.append(1)   # upper: glass
                    faces.append([f_lo, r_hi, r_lo]);  fmats.append(0)   # aft-lower: paint
                glazed_n += 1
                continue

            faces.append([a + j, a + k, b + k, b + j])
            g = 1 if j in glazed else 0
            fmats.append(g)
            glazed_n += g
    faces.append(list(range(n - 1, -1, -1)));                   fmats.append(0)
    faces.append([(len(rings) - 1) * n + j for j in range(n)]);  fmats.append(0)

    print(f"###FUSELAGE### stations={len(sts)} ring={n} open_under_wing={dropped} "
          f"glazed_faces={glazed_n} (0 duplicated, 0 occluded)")
    ob = make("Fuselage", verts, faces, M_PAINT,
              extra_mats=[M_GLASS], face_mats=fmats)
    return ob, rings, sts, n


# ----------------------------------------------------------------------------
# airfoils / flying surfaces
# ----------------------------------------------------------------------------
# NACA 2412-ish, 8 points, closed loop; a vertex sits exactly on the hinge
# station so control surfaces can be split off without extra geometry.
AF_CAMBERED = [(0.000, 0.000), (0.120, 0.058), (0.350, 0.067), (0.780, 0.036),
               (1.000, 0.002), (0.780, -0.013), (0.350, -0.028), (0.120, -0.026)]
AF_SYM      = [(0.000, 0.000), (0.130, 0.045), (0.380, 0.049), (0.600, 0.038),
               (1.000, 0.001), (0.600, -0.038), (0.380, -0.049), (0.130, -0.045)]
HINGE_I_UP, HINGE_I_LO = 3, 5   # 0.78 chord (wing) / 0.60 chord (tail)

# reduced sections for the distant LODs (no control-surface split, so the full
# loop is used and the hinge vertex is no longer needed)
AF6_CAMBERED = [(0.000, 0.000), (0.150, 0.060), (0.450, 0.062),
                (1.000, 0.002), (0.450, -0.028), (0.150, -0.026)]
AF4_CAMBERED = [(0.000, 0.000), (0.350, 0.067), (1.000, 0.002), (0.350, -0.028)]
AF6_SYM = [(0.000, 0.000), (0.180, 0.047), (0.500, 0.045),
           (1.000, 0.001), (0.500, -0.045), (0.180, -0.047)]
AF4_SYM = [(0.000, 0.000), (0.380, 0.049), (1.000, 0.001), (0.380, -0.049)]

WING_AF = {'full': AF_CAMBERED, 'mid': AF6_CAMBERED, 'low': AF4_CAMBERED}[P["af"]]
TAIL_AF = {'full': AF_SYM, 'mid': AF6_SYM, 'low': AF4_SYM}[P["af"]]


def af_points(af, chord, thick_scale, le_y, z0, x, incidence=0.0):
    """Place a normalised airfoil at spanwise position x."""
    out = []
    for (cx, cz) in af:
        yy = -cx * chord                       # chordwise runs aft (-Y)
        zz = cz * chord * thick_scale
        if incidence:
            ca, sa = math.cos(incidence), math.sin(incidence)
            yy, zz = yy * ca - zz * sa, yy * sa + zz * ca
        out.append((x, le_y + yy, z0 + zz))
    return out


def wing_geom(x):
    """LE y, chord and chord-plane z at spanwise station x (right wing)."""
    if x <= TAPER_START:
        chord = ROOT_CHORD
        le_y = 0.0
    else:
        f = (x - TAPER_START) / (SEMI - TAPER_START)
        chord = ROOT_CHORD + (TIP_CHORD - ROOT_CHORD) * f
        le_y = -(ROOT_CHORD - chord)           # straight trailing edge at y = -1.63
    z = WING_LE_Z + math.tan(DIHEDRAL) * x
    return le_y, chord, z


def build_wing(side):
    """Main wing panel, truncated at the 0.78 hinge station."""
    sgn = 1.0 if side == "Right" else -1.0
    xs = list(P["wing_st"])
    rings = []
    for x in xs:
        le_y, chord, z = wing_geom(x)
        tip_f = 1.0
        if x >= SEMI - 1e-6:                   # rounded, slightly drooped C172 tip
            chord *= 0.80
            le_y -= 0.07
            z -= 0.022
            tip_f = 0.60
        pts = af_points(WING_AF, chord, tip_f, le_y, z, sgn * x, INCIDENCE)
        if P["ctrl"]:
            # truncate at the 0.78 hinge station; flap/aileron fill 0.78 -> 1.0
            rings.append([pts[0], pts[1], pts[2], pts[3], pts[5], pts[6], pts[7]])
        else:
            rings.append(pts)          # control surfaces merged into the panel
    verts, faces = loft(rings, cap_start=False, cap_end=True)
    ob = make(f"Wing_{side}", verts, faces, M_PAINT)
    return ob


def build_ctrl(name, side_sgn, x0, x1, xs_extra=()):
    """A trailing-edge control surface: hinge-station wedge from 0.78 -> 1.0 chord."""
    xs = [x0] + list(xs_extra) + [x1]
    rings = []
    for x in xs:
        le_y, chord, z = wing_geom(x)
        pts = af_points(AF_CAMBERED, chord, 1.0, le_y, z, side_sgn * x, INCIDENCE)
        rings.append([pts[HINGE_I_UP], pts[4], pts[HINGE_I_LO]])
    verts, faces = loft(rings, cap_start=True, cap_end=True)
    # hinge axis: midpoint of the hinge station line
    hx = side_sgn * (x0 + x1) / 2.0
    le_y, chord, z = wing_geom(abs(hx))
    hp = af_points(AF_CAMBERED, chord, 1.0, le_y, z, hx, INCIDENCE)
    piv = ((hp[HINGE_I_UP][0] + hp[HINGE_I_LO][0]) / 2.0,
           (hp[HINGE_I_UP][1] + hp[HINGE_I_LO][1]) / 2.0,
           (hp[HINGE_I_UP][2] + hp[HINGE_I_LO][2]) / 2.0)
    return make(name, verts, faces, M_PAINT, origin=piv)


def htail_geom(x):
    f = abs(x) / HTAIL_SEMI
    chord = HTAIL_ROOTC + (HTAIL_TIPC - HTAIL_ROOTC) * f
    le_y = HTAIL_LE_Y - HTAIL_SWEEP * f
    return le_y, chord, HTAIL_Z


def build_htail(side):
    sgn = 1.0 if side == "Right" else -1.0
    xs = [0.10, HTAIL_SEMI] if LOD >= 2 else [0.10, 1.05, HTAIL_SEMI]
    rings = []
    for x in xs:
        le_y, chord, z = htail_geom(x)
        tf = 1.0
        if x >= HTAIL_SEMI - 1e-6:
            chord *= 0.97
            tf = 0.62
        pts = af_points(TAIL_AF, chord, tf, le_y, z, sgn * x)
        if P["ctrl"]:
            rings.append([pts[0], pts[1], pts[2], pts[3], pts[5], pts[6], pts[7]])
        else:
            rings.append(pts)          # elevator merged into the stabiliser
    verts, faces = loft(rings, cap_start=(LOD == 0), cap_end=True)
    return make(f"HorizontalTail_{side}", verts, faces, M_PAINT)


def build_elevator():
    """One object, two halves (split by the fuselage), pivot on the hinge line."""
    verts, faces = [], []
    for sgn in (-1.0, 1.0):
        rings = []
        for x in (0.14, HTAIL_SEMI * 0.985):
            le_y, chord, z = htail_geom(x)
            pts = af_points(AF_SYM, chord, 1.0, le_y, z, sgn * x)
            rings.append([pts[HINGE_I_UP], pts[4], pts[HINGE_I_LO]])
        v, f = loft(rings, cap_start=True, cap_end=True)
        o = len(verts)
        verts.extend(v)
        faces.extend([[i + o for i in ff] for ff in f])
    le_y, chord, z = htail_geom(0.0)
    piv = (0.0, le_y - chord * AF_SYM[HINGE_I_UP][0], z)
    return make("Elevator", verts, faces, M_PAINT, origin=piv)


# ----------------------------------------------------------------------------
# vertical tail: the C172's swept fin + long dorsal fillet + raked rudder
# ----------------------------------------------------------------------------
FIN_OUTLINE = [                 # (y, z) CCW; includes the long C172 dorsal fillet
    (-2.85, 1.468),             # dorsal fillet start, blended onto the tail-cone top
    (-3.80, 1.512),
    (-4.35, 1.640),             # dorsal lifts into the fin leading edge
    (-5.30, 2.718),             # fin tip, forward corner (highest point on the aircraft)
    (-5.62, 2.700),             # fin tip, aft corner = rudder hinge top
    (-5.25, 1.440),             # rudder hinge bottom (hinge rakes forward at the base)
]
RUDDER_OUTLINE = [
    (-5.62, 2.700),
    (-5.80, 2.685),
    (-6.34, 1.700),             # aft-most point on the aircraft: sets overall length
    (-6.18, 1.430),
    (-5.85, 1.330),
    (-5.25, 1.440),
]
FIN_HALF_T    = 0.055
RUDDER_HALF_T = 0.042


# fin + rudder as a single outline, used once the rudder stops being animated
FIN_RUDDER_MERGED = [
    (-2.85, 1.468), (-3.80, 1.512), (-4.35, 1.640), (-5.30, 2.718),
    (-5.80, 2.685), (-6.34, 1.700), (-6.18, 1.430), (-5.85, 1.330),
]


def build_fin():
    if P["fin_pts"] == 0:
        pts = FIN_OUTLINE
    elif P["fin_pts"] == 6:
        pts = [FIN_RUDDER_MERGED[i] for i in (0, 2, 3, 4, 5, 7)]
    else:
        pts = [FIN_RUDDER_MERGED[i] for i in (1, 3, 4, 5, 7)]
    verts, faces = extrude_profile(pts, FIN_HALF_T)
    return make("VerticalTail", verts, faces, M_PAINT, smooth_angle=25.0)


def build_rudder():
    pts = RUDDER_OUTLINE if LOD < 2 else [RUDDER_OUTLINE[i] for i in (0, 2, 4, 5)]
    verts, faces = extrude_profile(pts, RUDDER_HALF_T)
    piv = (0.0, (FIN_OUTLINE[4][0] + FIN_OUTLINE[5][0]) / 2.0,
           (FIN_OUTLINE[4][1] + FIN_OUTLINE[5][1]) / 2.0)
    return make("Rudder", verts, faces, M_PAINT, origin=piv, smooth_angle=25.0)


# ----------------------------------------------------------------------------
# landing gear
# ----------------------------------------------------------------------------
def tube(path, sizes, name, material, sections=4, smooth=35.0):
    """Loft a streamlined (long in Y) cross-section along a 3-D path.
    sizes = [(half_chord_y, half_thick_x_or_z), ...] per path point."""
    rings = []
    for (pt, (hy, ht)) in zip(path, sizes):
        px, py, pz = pt
        ring = []
        for i in range(sections):
            a = 2 * math.pi * i / sections + math.pi / 2
            ring.append((px + ht * math.cos(a) * 0.0 + ht * math.sin(a) * 0.0, py, pz))
        rings.append(ring)
    return rings


def diamond_ring(center, hy, hx, hz, n=4):
    """Streamlined ring: long in Y (chord), thin in X.  n=4 diamond, n=3 wedge.

    n=2 degenerates to a flat plate (LOD3): still reads in silhouette for two
    triangles per segment instead of eight.
    """
    cx, cy, cz = center
    if n <= 2:
        return [(cx, cy + hy, cz), (cx, cy - hy, cz)]
    if n <= 3:
        return [(cx, cy + hy, cz), (cx + hx, cy - hy * 0.6, cz),
                (cx - hx, cy - hy * 0.6, cz)]
    return [(cx, cy + hy, cz), (cx + hx, cy, cz + hz),
            (cx, cy - hy, cz), (cx - hx, cy, cz - hz)]


def build_main_gear(side):
    """C172 tubular spring-steel leg: bows outward and down from the belly."""
    sgn = 1.0 if side == "Right" else -1.0
    axle_x = sgn * GEAR_TRACK / 2.0
    if P["gear_st"] >= 4:
        path = [(sgn * 0.17, -1.05, 0.72), (sgn * 0.55, -0.99, 0.60),
                (sgn * 1.05, -0.95, 0.38), (axle_x, MAIN_AXLE_Y, MAIN_TIRE_R)]
        halfs = [(0.130, 0.058), (0.115, 0.052), (0.095, 0.044), (0.070, 0.034)]
    elif P["gear_st"] == 3:
        path = [(sgn * 0.17, -1.05, 0.72), (sgn * 0.78, -0.97, 0.50),
                (axle_x, MAIN_AXLE_Y, MAIN_TIRE_R)]
        halfs = [(0.130, 0.058), (0.105, 0.048), (0.070, 0.034)]
    else:
        end_z = MAIN_TIRE_R if P["wheel"] else 0.0
        path = [(sgn * 0.17, -1.05, 0.72), (axle_x, MAIN_AXLE_Y, end_z)]
        halfs = [(0.130, 0.058), (0.070, 0.034)]
    rings = [diamond_ring(p, hy, hx, 0.0, P["gear_n"]) for p, (hy, hx) in zip(path, halfs)]
    verts, faces = loft(rings, cap_start=True, cap_end=True)
    return make(f"LandingGear_{side}", verts, faces, M_METAL, smooth_angle=30.0)


def build_nose_gear():
    n_end = (NOSE_TIRE_R + 0.02) if P["wheel"] else 0.0
    path = [(0.0, 0.55, 0.72), (0.0, 0.63, 0.50), (0.0, NOSE_AXLE_Y, n_end)]
    halfs = [(0.120, 0.075), (0.098, 0.060), (0.078, 0.048)]
    if P["gear_st"] <= 2:
        path, halfs = [path[0], path[-1]], [halfs[0], halfs[-1]]
    rings = [diamond_ring(p, hy, hx, 0.0, P["gear_n"]) for p, (hy, hx) in zip(path, halfs)]
    verts, faces = loft(rings, cap_start=True, cap_end=True)
    return make("LandingGear_Nose", verts, faces, M_METAL, smooth_angle=30.0)


def build_wheel(name, center, r, w, n):
    """Tyre as an n-gon cylinder with its axis along X."""
    if n <= 0:
        return None
    cx, cy, cz = center
    rings = []
    for s in (-w / 2.0, w / 2.0):
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n + math.pi / 2
            ring.append((cx + s, cy + r * math.cos(a), cz + r * math.sin(a)))
        rings.append(ring)
    verts, faces = loft(rings, cap_start=True, cap_end=True)
    return make(name, verts, faces, M_DARK, origin=center, smooth_angle=45.0)


# ----------------------------------------------------------------------------
# struts
# ----------------------------------------------------------------------------
def build_strut(side):
    sgn = 1.0 if side == "Right" else -1.0
    x_out = 2.90
    le_y, chord, z = wing_geom(x_out)
    top = (sgn * x_out, le_y - chord * 0.40, z - 0.070)
    bot = (sgn * 0.43, -0.20, 0.80)
    rings = [diamond_ring(top, 0.085, 0.026, 0.0, P["strut_n"]),
             diamond_ring(bot, 0.110, 0.034, 0.0, P["strut_n"])]
    verts, faces = loft(rings, cap_start=True, cap_end=True)
    return make(f"Strut_{side}", verts, faces, M_PAINT, smooth_angle=30.0)


# ----------------------------------------------------------------------------
# spinner + propeller
# ----------------------------------------------------------------------------
def build_spinner():
    """Bullet spinner as a true cone from a single apex vertex.

    It used to start from a tiny ring plus an n-gon cap, which put a flat
    forward-facing disc on the nose tip for no visual gain, and it capped the
    base too - a face sealed inside the cowl that can never be seen.  Apex plus
    open base takes LOD0 from 60 triangles to 18; at LOD2/LOD3 it degenerates to
    a 4-sided pyramid.
    """
    n = P["spin"]
    if P["spin_rings"] >= 3:
        band = [(SPINNER_TIP_Y - 0.13, 0.098), (COWL_FRONT_Y, 0.155)]
    else:
        band = [(COWL_FRONT_Y, 0.155)]

    verts = [(0.0, SPINNER_TIP_Y, THRUST_Z)]
    for (y, r) in band:
        for i in range(n):
            a = 2 * math.pi * i / n + math.pi / 2
            verts.append((r * math.cos(a), y, THRUST_Z + r * math.sin(a)))

    faces = [[0, 1 + i, 1 + (i + 1) % n] for i in range(n)]      # apex fan
    for b in range(len(band) - 1):
        o0, o1 = 1 + b * n, 1 + (b + 1) * n
        for i in range(n):
            k = (i + 1) % n
            faces.append([o0 + i, o0 + k, o1 + k, o1 + i])
    # no base cap: it sits inside the cowl opening
    return make("Spinner", verts, faces, M_METAL,
                origin=(0.0, COWL_FRONT_Y, THRUST_Z), smooth_angle=45.0)


def build_propeller():
    """Two blades in the disc plane at y = PLANE_Y, rotating about the Y axis.

    The blade chord lies TANGENTIALLY in the disc, rotated toward +Y by the
    local blade angle; that is what makes a real prop read as a broad cross
    from dead ahead rather than as two hairlines.
    """
    PLANE_Y = 1.70
    stations = [(0.15, 0.130, 0.024, math.radians(34)),
                (0.62, 0.150, 0.016, math.radians(20)),
                (PROP_R, 0.058, 0.006, math.radians(13))]
    if P["prop_2st"]:
        stations = [stations[0], stations[2]]
    verts, faces = [], []
    for blade in (0, 1):
        rot = blade * math.pi + math.pi / 2
        rad = (math.cos(rot), math.sin(rot))          # radial direction in (x, z)
        tan = (-math.sin(rot), math.cos(rot))         # tangential direction in (x, z)
        rings = []
        for (r, ch, th, tw) in stations:
            ring = []
            sect = ((ch, 0.0), (-ch, 0.0)) if P["prop_flat"] else \
                   ((ch, 0.0), (0.0, th), (-ch, 0.0), (0.0, -th))
            for (c, t) in sect:
                a = c * math.cos(tw) - t * math.sin(tw)   # along the tangential axis
                b = c * math.sin(tw) + t * math.cos(tw)   # along +Y
                x = rad[0] * r + tan[0] * a
                z = rad[1] * r + tan[1] * a
                ring.append((x, PLANE_Y + b, THRUST_Z + z))
            rings.append(ring)
        # no root cap: the blade root is buried inside the spinner
        v, f = loft(rings, cap_start=False, cap_end=True)
        o = len(verts)
        verts.extend(v)
        faces.extend([[i + o for i in ff] for ff in f])
    return make("Propeller", verts, faces, M_DARK,
                origin=(0.0, PLANE_Y, THRUST_Z), smooth_angle=50.0)


# ----------------------------------------------------------------------------
# build everything
# ----------------------------------------------------------------------------
fus, rings, sts, ring_n = build_fuselage()

for side, sgn in (("Left", -1.0), ("Right", 1.0)):
    build_wing(side)
    if P["ctrl"]:
        build_ctrl(f"Flap_{side}",    sgn, 0.46, 2.75)
        build_ctrl(f"Aileron_{side}", sgn, 2.90, 5.42, xs_extra=(4.10,))
    build_htail(side)
    build_main_gear(side)
    build_strut(side)

if P["ctrl"]:
    build_elevator()
build_fin()
if P["fin_pts"] == 0:
    build_rudder()
build_nose_gear()
build_wheel("Wheel_Left",  (-GEAR_TRACK / 2.0, MAIN_AXLE_Y, MAIN_TIRE_R), MAIN_TIRE_R, MAIN_TIRE_W, P["wheel"])
build_wheel("Wheel_Right", ( GEAR_TRACK / 2.0, MAIN_AXLE_Y, MAIN_TIRE_R), MAIN_TIRE_R, MAIN_TIRE_W, P["wheel"])
build_wheel("Wheel_Nose",  (0.0, NOSE_AXLE_Y, NOSE_TIRE_R), NOSE_TIRE_R, NOSE_TIRE_W, P["wheel"])
build_spinner()
build_propeller()

# ----------------------------------------------------------------------------
# final placement: origin on the ground under the CG
# ----------------------------------------------------------------------------
SHIFT = Vector((0.0, -CG_SHIFT, 0.0))
for ob in BUILT:
    if ob.location.length < 1e-9:
        # static part: bake the shift into the mesh so its node transform is
        # identity (one less thing for the engine to multiply per frame)
        ob.data.transform(Matrix.Translation(SHIFT))
    else:
        # animated part: keep the authored pivot, just move it with the aircraft
        ob.location = ob.location + SHIFT
bpy.context.view_layer.update()

if P["merge"]:
    keep = [o for o in BUILT if o.name == "Propeller"]
    statics = [o for o in BUILT if o.name != "Propeller"]
    if len(statics) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for o in statics:
            o.select_set(True)
        bpy.context.view_layer.objects.active = statics[0]
        bpy.ops.object.join()
        merged = bpy.context.view_layer.objects.active
        merged.name = "Cessna_172_Body"
        merged.data.name = "Cessna_172_Body"
        BUILT[:] = [merged] + keep

root = bpy.data.objects.new("Cessna_172", None)
SC.collection.objects.link(root)
root.empty_display_size = 0.5
for ob in BUILT:
    ob.parent = root
    ob.matrix_parent_inverse = Matrix.Identity(4)

# ----------------------------------------------------------------------------
# report + save
# ----------------------------------------------------------------------------
tris = sum(len(o.data.loop_triangles) if o.data.loop_triangles else 0 for o in BUILT)
for o in BUILT:
    o.data.calc_loop_triangles()
tris = sum(len(o.data.loop_triangles) for o in BUILT)
verts = sum(len(o.data.vertices) for o in BUILT)
print(f"###BUILD### lod={LOD} objects={len(BUILT)} tris={tris} verts={verts}")

if OUT_BLEND:
    os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print("###BLEND###", OUT_BLEND)
if OUT_GLB:
    os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB',
                              export_yup=True, export_apply=True)
    print("###GLB###", OUT_GLB)
