"""
Read the reference three-view in METRES instead of pixels.

    blender -b --factory-startup --python profile_drawing.py -- <view> <what> [args]

    side  top    <y0_m> <y1_m> <step_m>   fuselage top/bottom line, per station
    plan  chord  <x0_m> <x1_m> <step_m> <ylo> <yhi>
                                         LE/TE station of a flying surface, per
                                         lateral station, searched in [ylo,yhi]
    side  runs   <y_m> ...                every ink run in one longitudinal station
    plan  width  <y0_m> <y1_m> <step_m>   fuselage / wing half-width, per station
    plan  runs   <y_m> ...
    front runs   <x_m> ...                every ink run in one lateral station
    front prof   <x0_m> <x1_m> <step_m>   outer top/bottom, per lateral station

The drawing is NOT uniformly scaled: measured against its own callouts it has a
different px/m on each of the three axes (see measurements/sf50_reference.md).
Every conversion below therefore names which axis it is on.
"""
import bpy, sys
import numpy as np

# --- calibration, from measurements/sf50_reference.md -----------------------
S_LONG = 386.2          # px/m along the fuselage  (side view x, plan view y)
S_LAT = 409.4           # px/m across the span     (plan/front view x)
S_VERT = 379.6          # px/m vertically          (side/front view y)

SIDE_NOSE_X = 819.5     # side view: nose tip
SIDE_GROUND_Y = 1737.5  # side view: ground line
PLAN_NOSE_Y = 1884.5    # plan view: nose tip
PLAN_CENTRE_X = 2687.0  # plan view: centreline
FRONT_CENTRE_X = 2687.5  # front view: centreline
# The front view is drawn with the oleos extended, so it has no usable ground
# line; it is anchored on the fuselage crown instead (see the reference notes).
FRONT_CROWN_Y = 6654.0
FRONT_CROWN_Z = 2.130

IMG = "measurements/ref_SF50_three_view_1200dpi.png"

# window that isolates each view from the others and from the dimension lines
WINDOW = {
    "side": dict(a=(505, 1730), b=(700, 4600)),
    "plan": dict(a=(200, 5200), b=(1860, 5620)),
    "front": dict(a=(6180, 7800), b=(250, 5130)),
}

argv = sys.argv[sys.argv.index("--") + 1:]
view, what = argv[0], argv[1]

im = bpy.data.images.load(IMG)
w, h = im.size
buf = np.empty(w * h * im.channels, dtype=np.float32)
im.pixels.foreach_get(buf)
INK = buf.reshape(h, w, im.channels)[::-1][..., :3].mean(axis=2) < 0.55


def runs(line, offset):
    nz = np.nonzero(line)[0]
    if len(nz) == 0:
        return []
    out, start, prev = [], nz[0], nz[0]
    for v in nz[1:]:
        if v > prev + 1:
            out.append((start + offset, prev + offset))
            start = v
        prev = v
    out.append((start + offset, prev + offset))
    return out


def frange(a, b, s):
    n = int(round(abs(b - a) / s)) + 1
    return [a + (b - a) * i / (n - 1) for i in range(n)]


# station (metres aft of the nose, negative) -> pixel column / row
def side_col(y_m):
    return int(round(SIDE_NOSE_X - y_m * S_LONG))


def plan_row(y_m):
    return int(round(PLAN_NOSE_Y - y_m * S_LONG))


def front_col(x_m):
    return int(round(FRONT_CENTRE_X + x_m * S_LAT))


def side_z(py):
    return (SIDE_GROUND_Y - py) / S_VERT


def plan_col(x_m):
    return int(round(PLAN_CENTRE_X + x_m * S_LAT))


def plan_y(py):
    return -(py - PLAN_NOSE_Y) / S_LONG


def plan_x(px):
    return (px - PLAN_CENTRE_X) / S_LAT


def front_z(py):
    return FRONT_CROWN_Z + (FRONT_CROWN_Y - py) / S_VERT


win = WINDOW[view]
a0, a1 = win["a"]

if view == "side":
    if what == "top":
        y0, y1, st = (float(v) for v in argv[2:5])
        print("  Y_m    bottom_z  top_z   depth")
        for y in frange(y0, y1, st):
            r = runs(INK[a0:a1, side_col(y)], a0)
            if not r:
                print(f"{y:7.3f}  empty")
                continue
            top, bot = side_z(r[0][0]), side_z(r[-1][1])
            print(f"{y:7.3f}  {bot:7.3f}  {top:6.3f}  {top - bot:6.3f}")
    else:
        for y in (float(v) for v in argv[2:]):
            r = runs(INK[a0:a1, side_col(y)], a0)
            print(f"Y={y:7.3f} px_col={side_col(y)}  " +
                  " ".join(f"[{side_z(b):.3f}..{side_z(a):.3f}]" for a, b in r))

elif view == "plan":
    if what == "width":
        y0, y1, st = (float(v) for v in argv[2:5])
        print("  Y_m    x_left   x_right  width")
        for y in frange(y0, y1, st):
            r = runs(INK[plan_row(y), a0:a1], a0)
            if not r:
                print(f"{y:7.3f}  empty")
                continue
            xl, xr = plan_x(r[0][0]), plan_x(r[-1][1])
            print(f"{y:7.3f}  {xl:7.3f}  {xr:7.3f}  {xr - xl:6.3f}")
    elif what == "chord":
        x0, x1, st = (float(v) for v in argv[2:5])
        ylo, yhi = (float(v) for v in argv[5:7])
        r0, r1 = plan_row(yhi), plan_row(ylo)
        print("  X_m      LE_y     TE_y    chord")
        for x in frange(x0, x1, st):
            r = runs(INK[r0:r1, plan_col(x)], r0)
            if not r:
                print(f"{x:7.3f}  empty")
                continue
            le, te = plan_y(r[0][0]), plan_y(r[-1][1])
            print(f"{x:7.3f}  {le:7.3f}  {te:7.3f}  {le - te:6.3f}")
    else:
        for y in (float(v) for v in argv[2:]):
            r = runs(INK[plan_row(y), a0:a1], a0)
            print(f"Y={y:7.3f} px_row={plan_row(y)}  " +
                  " ".join(f"[{plan_x(a):.3f}..{plan_x(b):.3f}]" for a, b in r))

elif view == "front":
    if what == "prof":
        x0, x1, st = (float(v) for v in argv[2:5])
        print("  X_m    bottom_z  top_z")
        for x in frange(x0, x1, st):
            r = runs(INK[a0:a1, front_col(x)], a0)
            if not r:
                print(f"{x:7.3f}  empty")
                continue
            print(f"{x:7.3f}  {front_z(r[-1][1]):7.3f}  {front_z(r[0][0]):6.3f}")
    else:
        for x in (float(v) for v in argv[2:]):
            r = runs(INK[a0:a1, front_col(x)], a0)
            print(f"X={x:7.3f} px_col={front_col(x)}  " +
                  " ".join(f"[{front_z(b):.3f}..{front_z(a):.3f}]" for a, b in r))
