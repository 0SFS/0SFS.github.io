"""
Read the windshield outline off the aligned reference model.

    blender -b --factory-startup --python measure_windshield.py -- \
        <aligned.blend> [--bin 0.03]

reorient_ref.py registers the reference to the POH three view by its crown
line, to 15 mm rms, so once that has run the reference's glazing can be read in
METRES - no normalising against the reference's own sections, which is what an
earlier pass did to work around an alignment that was 5 degrees out in pitch.

`tests/cirrus_vision_Sf50/` carries the windshield as its own GLASS submesh,
which is a far better source for that outline than a three view: the drawing
shows the windshield only as a line, and the front view - the one place its
width and its wrap could be read - is the hardest view on the page to read.

Three curves come out, and the generator needs all three:

  sill    the lower edge, per station
  roof    the UPPER edge, per station. Without it the glazing runs over the
          crown and the aircraft gets a bubble canopy; the real one stops well
          short of the top and body carries on above it.
  wrap    how far out from the centreline the glass reaches, as a fraction of
          the body's half width at that station.
"""
import bpy, sys
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
BLEND = argv[0]
BIN = float(argv[argv.index("--bin") + 1]) if "--bin" in argv else 0.03
CENTRE = 0.08                   # centreline slab, for the sill and roof

bpy.ops.wm.open_mainfile(filepath=BLEND)


def sample(objs, n):
    """Area-weighted points over the skin of these objects."""
    rng = np.random.default_rng(0)
    tri = []
    for o in objs:
        me = o.data
        me.calc_loop_triangles()
        co = np.array([(o.matrix_world @ v.co)[:] for v in me.vertices])
        tri.append(co[np.array([t.vertices[:] for t in me.loop_triangles])])
    T = np.concatenate(tri)
    a, b = T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]
    area = 0.5 * np.linalg.norm(np.cross(a, b), axis=1)
    idx = rng.choice(len(T), size=n, p=area / area.sum())
    u, v = rng.random(n), rng.random(n)
    over = u + v > 1.0
    u[over], v[over] = 1.0 - u[over], 1.0 - v[over]
    return T[idx, 0] + a[idx] * u[:, None] + b[idx] * v[:, None]


meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
gobj = [o for o in meshes
        if any(m and "GLASS" in m.name.upper() for m in o.data.materials)]
bobj = [o for o in meshes if o not in gobj]
G = sample(gobj, 200000)
B = sample(bobj, 600000)

print(f"###GLASS_EXTENT### y {G[:, 1].max():.3f} .. {G[:, 1].min():.3f}   "
      f"x +/-{np.abs(G[:, 0]).max():.3f}   z {G[:, 2].min():.3f} .. "
      f"{G[:, 2].max():.3f}")
print("###WINDSHIELD###")
print("  station   sill    roof   crown    keel   halfw  glass_x   wrap")
rows = []
y = G[:, 1].max()
while y >= G[:, 1].min():
    gm = np.abs(G[:, 1] - y) < BIN
    bm = np.abs(B[:, 1] - y) < BIN
    if gm.sum() >= 20 and bm.sum() >= 50:
        gc = gm & (np.abs(G[:, 0]) < CENTRE)
        halfw = np.abs(B[bm, 0]).max()
        gx = np.abs(G[gm, 0]).max()
        if gc.sum() >= 5:
            sill, roof = G[gc, 2].min(), G[gc, 2].max()
            crown = B[bm & (np.abs(B[:, 0]) < CENTRE), 2].max()
            keel = B[bm & (np.abs(B[:, 0]) < CENTRE), 2].min()
            print(f"  {y:7.3f}  {sill:6.3f}  {roof:6.3f}  {crown:6.3f}  "
                  f"{keel:6.3f}  {halfw:6.3f}  {gx:6.3f}  {gx / halfw:6.3f}")
            rows.append((y, sill, roof, gx / halfw))
    y -= BIN * 2
print("###SILL###")
print("[" + ", ".join(f"({y:.3f}, {s:.3f})" for y, s, _r, _w in rows) + "]")
print("###ROOF###")
print("[" + ", ".join(f"({y:.3f}, {r:.3f})" for y, _s, r, _w in rows) + "]")
print("###WRAP###")
print("[" + ", ".join(f"({y:.3f}, {w:.3f})" for y, _s, _r, w in rows) + "]")
