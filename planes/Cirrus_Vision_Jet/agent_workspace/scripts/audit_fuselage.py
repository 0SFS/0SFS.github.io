"""
Where does the fuselage spend its polygons, and which of them show anything?

    blender -b --factory-startup --python audit_fuselage.py -- <blend> [--band y0,y1]

Reports, for the Fuselage mesh:
  * triangles per station gap (the band between two rings), so a band that
    costs more than its neighbours is visible as a number rather than a guess;
  * for every vertex, the fan of faces around it and how far that fan departs
    from flat - a fan whose faces are all within a fraction of a degree of one
    plane is describing nothing the plane would not describe on its own;
  * the thinnest faces by aspect ratio, with where they are.
"""
import bpy, sys, math
from collections import defaultdict

argv = sys.argv[sys.argv.index("--") + 1:]
SRC = argv[0]


def opt(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


bpy.ops.wm.open_mainfile(filepath=SRC)
ob = bpy.data.objects["Fuselage"]
me = ob.data
V = [tuple(v.co) for v in me.vertices]

tris = []          # (a,b,c) after fan-triangulation, with source polygon index
for p in me.polygons:
    idx = list(p.vertices)
    for c in range(1, len(idx) - 1):
        tris.append((idx[0], idx[c], idx[c + 1], p.index))


def cross(u, v):
    return (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0])


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def norm(u):
    return math.sqrt(sum(c * c for c in u))


print(f"###MESH### verts={len(me.vertices)} polys={len(me.polygons)} tris={len(tris)}")

# ---- triangles per 0.20 m band of Y -----------------------------------------
band = defaultdict(int)
for a, b, c, _ in tris:
    ym = (V[a][1] + V[b][1] + V[c][1]) / 3.0
    band[round(ym / 0.20) * 0.20] += 1
print("### triangles per 0.20 m band of Y")
for y in sorted(band, reverse=True):
    print(f"  y={y:+6.2f}  {band[y]:4d}  {'#' * (band[y] // 2)}")

# ---- flat fans ---------------------------------------------------------------
around = defaultdict(list)
for t in tris:
    for i in t[:3]:
        around[i].append(t)
print("### vertices whose whole fan is within 1.0 deg of one plane "
      "(the fan could be one polygon)")
flat = []
for i, fan in around.items():
    if len(fan) < 3:
        continue
    ns = []
    for a, b, c, _ in fan:
        nvec = cross(sub(V[b], V[a]), sub(V[c], V[a]))
        L = norm(nvec)
        if L < 1e-12:
            continue
        ns.append(tuple(x / L for x in nvec))
    if len(ns) < 3:
        continue
    worst = 0.0
    for u in ns:
        for v in ns:
            d = max(-1.0, min(1.0, sum(x * y for x, y in zip(u, v))))
            worst = max(worst, math.degrees(math.acos(d)))
    if worst < 1.0:
        flat.append((len(fan), worst, i))
flat.sort(reverse=True)
saved = 0
for nf, worst, i in flat:
    p = V[i]
    print(f"  v{i:4d} at ({p[0]:+.3f},{p[1]:+.3f},{p[2]:+.3f})  "
          f"{nf} faces, spread {worst:.3f} deg")
    saved += nf - 2
print(f"  {len(flat)} such fans, {saved} triangles they could give back")

# ---- thin faces --------------------------------------------------------------
thin = []
for a, b, c, pi in tris:
    e = [norm(sub(V[b], V[a])), norm(sub(V[c], V[b])), norm(sub(V[a], V[c]))]
    area = 0.5 * norm(cross(sub(V[b], V[a]), sub(V[c], V[a])))
    if area < 1e-12:
        continue
    # 1.0 is equilateral; small is a sliver
    q = 4.0 * math.sqrt(3.0) * area / sum(x * x for x in e)
    thin.append((q, area, (V[a][1] + V[b][1] + V[c][1]) / 3.0, max(e)))
thin.sort()
print("### the 25 thinnest triangles")
for q, area, ym, longest in thin[:25]:
    print(f"  q={q:.4f}  area={area * 1e4:8.2f} cm2  y={ym:+.3f}  "
          f"longest edge {longest * 1000:.0f} mm")
print(f"  faces with q < 0.05: {sum(1 for t in thin if t[0] < 0.05)}")
print(f"  faces with q < 0.15: {sum(1 for t in thin if t[0] < 0.15)}")
