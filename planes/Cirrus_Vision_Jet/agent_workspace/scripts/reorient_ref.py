"""
Put a downloaded reference model into this project's frame so it can be measured.

    blender -b --factory-startup --python reorient_ref.py -- <in.glb> <out.blend>

The reference in `tests/cirrus_vision_Sf50/` arrives at an arbitrary scale, at
an arbitrary attitude and parked 250 units from the origin, so nothing can be
read off it until it is aligned. This does that and nothing else - it does not
change the geometry, only where it sits.

The axes come from LANDMARKS, not from principal axes. An earlier pass used the
SVD of the vertex cloud and it was wrong by several degrees of pitch, because
PCA weights by where the vertices happen to be dense - a finely tessellated
nose drags the axis toward the nose. Landmarks do not care about tessellation:

1. Lateral axis: the two surface points farthest apart are the wingtips, and
   with equal dihedral the line between them is level, so it IS the lateral
   axis. Found by iterating "farthest from the last point", which converges in
   a few passes.
2. Longitudinal axis: the farthest pair again, with the lateral component
   projected out and only among points NEAR THE SYMMETRY PLANE - the nose tip
   and the tail cone tip. Taking it from the whole cloud picks the V-tail tip
   instead, which is 1.7 m off the centreline and much higher than the tail
   cone, and tips the whole aircraft nose-up by 13 degrees.
3. Up: the cross product, signed off the GLASS submesh, which is the
   windshield and therefore above the centroid and forward of it. Guessing
   this from the mesh alone is how a reference ends up mirrored or inverted.
4. Scale on the SPAN, not the length: wingtip to wingtip is the longest
   dimension on the aircraft and the most precisely published, and the pair is
   already in hand. Where the length then lands is a measurement of how
   faithful the reference is, not an input - it is printed, not corrected.
5. Pitch, and the fore/aft and vertical offsets with it, are FITTED, not taken
   from landmarks. Two points cannot fix pitch reliably: nose tip to tail cone
   tip is not level on this aircraft, and where a downloaded model puts its
   tail cone tip vertically is exactly the sort of centimetre-level difference
   it is allowed to have - leaning on it tilted this reference by 5 degrees.
   Instead the CROWN LINE is matched. The topmost ink in each column of the
   drawing's side view is the crown; the same line is read off the reference by
   sampling its skin and taking the topmost point per station; and pitch, dy
   and dz are solved by least squares between them over the whole fuselage. A
   line running the length of the aircraft pins pitch in a way no pair of
   points can.

The result is checked, not assumed: the fit prints its own residual, and
compare_drawing.py --nose-origin stacks the result straight on the POH three
view. The reference is a hypothesis about shape, not a source of dimensions;
it is used only to place features the three view draws ambiguously, and the
windshield is the main one.
"""
import bpy, sys, os, math
import numpy as np
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT = argv[0], argv[1]

# Published dimensions and drawing calibration, measurements/sf50_reference.md.
LENGTH = 9.357
SPAN = 11.796                           # the scale datum
NOSE_Z = 1.195                          # centre of the nose cap section
S_LONG, S_VERT = 386.2, 379.6
SIDE_NOSE_X, SIDE_GROUND_Y = 819.5, 1737.5
FIT_Y = (-0.30, -7.30)                  # nose cap to just ahead of the V-tail
FIT_Z_MAX = 2.95                        # above the dorsal pod, below the
                                        # dimension line and its "(9.4 m)" text
BIN = 0.02

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF_PNG = os.path.join(HERE, "measurements", "ref_SF50_three_view_1200dpi.png")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
sc = bpy.context.scene

meshes = [o for o in sc.objects if o.type == 'MESH']
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

pts, glass = [], []
for o in meshes:
    is_glass = any(m and "GLASS" in m.name.upper() for m in o.data.materials)
    for v in o.data.vertices:
        p = (o.matrix_world @ v.co)[:]
        pts.append(p)
        if is_glass:
            glass.append(p)
P = np.array(pts)
G = np.array(glass) if glass else P
centre = P.mean(axis=0)
P = P - centre
G = G - centre


def farthest_pair(Q):
    """The two points of Q farthest apart, by repeated farthest-point steps."""
    i = int(np.argmax(np.linalg.norm(Q, axis=1)))
    j = i
    for _ in range(8):
        j = int(np.argmax(np.linalg.norm(Q - Q[i], axis=1)))
        i, j = j, i
    return j, i


i, j = farthest_pair(P)
lat = P[j] - P[i]
span_ext = float(np.linalg.norm(lat))
lat /= span_ext
mid = (P[i] + P[j]) / 2.0                     # a point on the symmetry plane

near_plane = np.abs((P - mid) @ lat) < 0.03 * span_ext
perp = P - np.outer(P @ lat, lat)
sub = perp[near_plane]
i, j = farthest_pair(sub - sub.mean(axis=0))
fwd = sub[j] - sub[i]
fwd /= np.linalg.norm(fwd)

up = np.cross(lat, fwd)
up /= np.linalg.norm(up)
if (G.mean(axis=0) - P.mean(axis=0)) @ fwd < 0:      # windshield is forward
    fwd, up = -fwd, -up
if (G.mean(axis=0) - P.mean(axis=0)) @ up < 0:       # and above
    up = -up
lat = np.cross(fwd, up)                              # right-handed, +X = right
lat /= np.linalg.norm(lat)

R = Matrix([list(lat), list(fwd), list(up)]).to_4x4()
scale = SPAN / span_ext

for o in meshes:
    o.data.transform(Matrix.Translation(-Vector(centre)))
    o.data.transform(R)
    o.data.transform(Matrix.Scale(scale, 4))

Q = np.array([(o.matrix_world @ v.co)[:] for o in meshes for v in o.data.vertices])
nose = Q[int(np.argmax(Q[:, 1]))]
for o in meshes:
    o.data.transform(Matrix.Translation(Vector((
        -(Q[:, 0].min() + Q[:, 0].max()) / 2.0, -nose[1], NOSE_Z - nose[2]))))


def sample_surface(n=400000):
    """Points spread evenly over the reference's skin, area weighted.

    Vertices alone will not do: a downloaded model is tessellated for looks, so
    a 2 cm slab of it can hold thirty vertices in one place and none in the
    next, and a crown line read off that jumps by tens of centimetres.
    """
    rng = np.random.default_rng(0)
    tri = []
    for o in meshes:
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


def model_crown(pts, ys):
    """Topmost skin per station, on the centreline slab."""
    q = pts[np.abs(pts[:, 0]) < 0.30]
    out = np.full(len(ys), np.nan)
    for k, y in enumerate(ys):
        m = np.abs(q[:, 1] - y) < BIN
        if m.sum() >= 3:
            out[k] = q[m, 2].max()
    return out


def drawing_crown(ys):
    """Topmost ink per column of the side view - the same line, on paper."""
    im = bpy.data.images.load(REF_PNG)
    w, h = im.size
    buf = np.empty(w * h * im.channels, dtype=np.float32)
    im.pixels.foreach_get(buf)
    page = buf.reshape(h, w, im.channels)[::-1][..., :3].mean(axis=2)
    bpy.data.images.remove(im)
    r_hi = int(SIDE_GROUND_Y - FIT_Z_MAX * S_VERT)
    r_lo = int(SIDE_GROUND_Y - 0.05 * S_VERT)       # just above the ground line
    out = np.full(len(ys), np.nan)
    for k, y in enumerate(ys):
        c = int(round(SIDE_NOSE_X - y * S_LONG))
        hit = np.nonzero(page[r_hi:r_lo, c] < 0.55)[0]
        if len(hit):
            out[k] = (SIDE_GROUND_Y - (r_hi + hit[0])) / S_VERT
    return out


ys = np.arange(FIT_Y[0], FIT_Y[1], -0.05)
target = drawing_crown(ys)
have = model_crown(sample_surface(), ys)
ok = ~np.isnan(target) & ~np.isnan(have)
cy, cz, tz = ys[ok], have[ok], target[ok]

best = None
for pdeg in np.arange(-9.0, 9.01, 0.25):
    a = math.radians(pdeg)
    ca, sa = math.cos(a), math.sin(a)
    ry, rz = cy * ca - cz * sa, cy * sa + cz * ca
    for dy in np.arange(-0.40, 0.401, 0.05):
        zi = np.interp(cy, (ry + dy)[::-1], rz[::-1])
        dz = float(np.median(tz - zi))
        err = float(np.sqrt(np.mean((tz - (zi + dz)) ** 2)))
        if best is None or err < best[0]:
            best = (err, float(pdeg), float(dy), dz)
err, pdeg, dy, dz = best
if "--dump" in argv:
    a = math.radians(pdeg)
    ca, sa = math.cos(a), math.sin(a)
    ry, rz = cy * ca - cz * sa, cy * sa + cz * ca
    zi = np.interp(cy, (ry + dy)[::-1], rz[::-1]) + dz
    print("###CROWN### station  drawing   reference   diff")
    for k in range(0, len(cy), 4):
        print(f"  {cy[k]:7.2f}  {tz[k]:7.3f}  {zi[k]:9.3f}  {zi[k] - tz[k]:+7.3f}")
print(f"###REF_FIT### pitch={pdeg:+.2f}deg dy={dy:+.3f} dz={dz:+.3f} "
      f"rms={err * 1000:.0f} mm over {int(ok.sum())} stations")

M = (Matrix.Translation(Vector((0.0, dy, dz)))
     @ Matrix.Rotation(math.radians(pdeg), 4, 'X'))
for o in meshes:
    o.data.transform(M)

Q = np.array([(o.matrix_world @ v.co)[:] for o in meshes for v in o.data.vertices])
fus = np.abs(Q[:, 0]) < 0.30
span_now = span_ext * scale
len_now = float(np.ptp(Q[:, 1]))
print(f"###REF_ORIENTED### scale={scale:.5f}")
print(f"###REF_SIZE### span={span_now:.3f} (published 11.796, "
      f"{100 * (span_now / 11.796 - 1):+.1f}%)  length={len_now:.3f} "
      f"(published {LENGTH}, {100 * (len_now / LENGTH - 1):+.1f}%)")
print(f"###REF_HEIGHT### belly low z={Q[fus, 2].min():.3f} (drawing 0.575)  "
      f"crown high z={Q[fus, 2].max():.3f} (drawing 2.466 fuselage / 2.665 pod)")
print(f"###REF_BBOX### x={Q[:, 0].min():.3f}..{Q[:, 0].max():.3f} "
      f"y={Q[:, 1].min():.3f}..{Q[:, 1].max():.3f} "
      f"z={Q[:, 2].min():.3f}..{Q[:, 2].max():.3f}")

bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("###BLEND###", OUT)
