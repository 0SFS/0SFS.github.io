"""
Where each ring line sits on the belly, in metres, station by station.

    blender -b --factory-startup --python belly_rows.py -- [--lod 3] [y ...]

This answers the one question a hole in the fuselage turns on: **which face row
can hold an opening this wide, at every station it spans?**

A pane - a window or a gear bay mouth - is cut inside ONE face row and clamped
to that row's own edges, so an opening that reaches past a ring line comes back
pinned to it: a flat-sided hole and a run of zero-area triangles where the edge
lies on the line it was clamped to. Picking the row by eye off a render is how
you find that out late. The numbers below are the row's real span at each
station, and an opening has to fit inside the narrowest of them with margin.

It also prints each row's span in Z, because `cut_pane` traces a shape in one
coordinate and that coordinate has to run monotonically across the row. The
keel row is why: it straddles bottom dead centre, so its two ends sit at the
same height and a shape traced in Z there collapses to a slit on the
centreline. Trace the keel row in X.
"""
import bpy, sys, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "generate_sf50.py")

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
LOD = int(argv[argv.index("--lod") + 1]) if "--lod" in argv else 3
YS = [float(a) for a in argv if not a.startswith("--")
      and a not in {str(LOD)}] or [-1.60, -1.80, -2.00, -4.00, -4.40, -4.90]

# The constants, without running the build: everything above the scene block is
# a pure table, and re-deriving it here would be a second source of truth.
head = open(SRC).read().split(
    "# ----------------------------------------------------------------------------\n"
    "# scene / materials")[0]
sys.argv = [sys.argv[0], "--", "--lod", str(LOD)]
G = {"__name__": "belly_rows", "__file__": SRC}
exec(compile(head, SRC, "exec"), G)
STATIONS, RING_SPEC, P = G["STATIONS"], G["RING_SPEC"], G["P"]
ANGLES = RING_SPEC[P["ring"]]["angles"]


def station_at(y):
    for a, b in zip(STATIONS, STATIONS[1:]):
        if b[0] <= y <= a[0]:
            t = (a[0] - y) / (a[0] - b[0])
            return [a[c] + (b[c] - a[c]) * t for c in range(1, 7)]
    return None


def point(t_deg, zb, zm, zt, hw, pu, pl):
    t = math.radians(t_deg)
    p = pu if math.sin(t) >= 0 else pl
    x = hw * abs(math.cos(t)) ** (2.0 / p) * (1 if math.cos(t) >= 0 else -1)
    dz = (zt - zm) if math.sin(t) >= 0 else (zm - zb)
    z = zm + dz * abs(math.sin(t)) ** (2.0 / p) * (1 if math.sin(t) >= 0 else -1)
    return x, z


# ---- where the belly is actually the OUTER surface -------------------------
# The second question any belly feature turns on, and the one that is invisible
# until it is rendered: over the wing box the WING's lower surface is below the
# fuselage's, so a hole cut in the fuselage there shows the wing through it and
# reads as no hole at all. The crossover is the outboard limit for anything cut
# into the belly, and it is a long way inboard of where the fuselage stops.
WING_LE_ROOT, WING_TE_ROOT = G["WING_LE_ROOT"], G["WING_TE_ROOT"]
LE_SLOPE, TE_SLOPE = G["LE_SLOPE"], G["TE_SLOPE"]
WING_Z0, DIHEDRAL = G["WING_Z0"], G["DIHEDRAL"]


def wing_lower(x, y):
    """Wing lower-surface z at (x, y), or None off the planform."""
    le = WING_LE_ROOT + LE_SLOPE * abs(x)
    te = WING_TE_ROOT + TE_SLOPE * abs(x)
    if not (te <= y <= le):
        return None
    chord = le - te
    z0 = WING_Z0 + abs(x) * math.tan(DIHEDRAL)
    f = (le - y) / chord                     # 0 at the LE, 1 at the TE
    # A NACA-ish lower surface is enough here: this is a clearance question,
    # not a shape one, and the thickest point is what decides it.
    t = 0.158 * chord
    return z0 - 0.5 * t * math.sin(math.pi * min(max(f, 0.0), 1.0) ** 0.85)


def belly_z(x, st):
    zb, zm, zt, hw, pu, pl = st
    if abs(x) > hw:
        return None
    r = (1.0 - (abs(x) / hw) ** pl) ** (1.0 / pl)
    return zm - r * (zm - zb)


print(f"### BELLY ROWS ### lod={LOD} ring={P['ring']} angles={ANGLES}")
for y in YS:
    st = station_at(y)
    if st is None:
        print(f"y={y:7.3f}  outside the station table")
        continue
    print(f"\ny = {y:7.3f}")
    for j in range(len(ANGLES)):
        k = (j + 1) % len(ANGLES)
        if ANGLES[j] < 180 and ANGLES[k] < 180:
            continue                       # upper half; not a belly row
        x0, z0 = point(ANGLES[j], *st)
        x1, z1 = point(ANGLES[k], *st)
        span_x, span_z = abs(x1 - x0), abs(z1 - z0)
        note = "  <- Z turns round here; trace this row in X" \
            if (x0 < 0) != (x1 < 0) else ""
        print(f"  row {j:2d} ({ANGLES[j]:3d}->{ANGLES[k]:3d} deg)  "
              f"x {x0:+.3f}..{x1:+.3f} ({span_x:.3f} wide)  "
              f"z {z0:.3f}..{z1:.3f} ({span_z:.3f}){note}")
    # Walk outboard until the wing's lower surface drops below the belly.
    limit = None
    x = 0.02
    while x < st[3]:
        wl, bz = wing_lower(x, y), belly_z(x, st)
        if wl is not None and bz is not None and wl <= bz:
            limit = x
            break
        x += 0.005
    print("  outer-surface limit: " + (
        f"x = {limit:.3f}  (outboard of this the wing is below the belly, so a"
        f" hole cut here shows the wing)" if limit is not None
        else "none - the belly is the outer surface all the way to the side"))
