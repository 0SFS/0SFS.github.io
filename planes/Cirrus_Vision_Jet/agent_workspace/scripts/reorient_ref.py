"""
Put a downloaded reference model into this project's frame so it can be measured.

    blender -b --factory-startup --python reorient_ref.py -- <in.glb> <out.blend>

The reference in `tests/cirrus_vision_Sf50/` arrives at an arbitrary scale, at
an arbitrary attitude and parked 250 units from the origin, so nothing can be
read off it until it is aligned. This does that and nothing else - it does not
change the geometry, only where it sits:

1. Principal axes from the vertex cloud give the three body axes. The largest
   extent is the span, the next the length, the smallest the height.
2. The sign of each is fixed from the GLASS submesh, which is the windshield:
   it lies forward of the centroid and above it. Guessing this from the mesh
   alone is how a reference ends up mirrored.
3. Scale so the overall length is the published 9.357 m. What the span then
   comes out at is a measurement of how faithful the reference is, not an
   input - it is printed rather than corrected.
4. Nose tip to Y = 0, centreline to X = 0, and the belly to the z the drawing
   puts it at, so the reference and the drawing share one coordinate system.

The reference is a hypothesis about shape, not a source of dimensions. It is
used here only to place features the three view draws ambiguously.
"""
import bpy, sys, math
import numpy as np
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT = argv[0], argv[1]

LENGTH = 9.357          # published, POH page 1-4
BELLY_Z = 0.575         # drawing: lowest point of the fuselage, under the wing box

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
sc = bpy.context.scene

meshes = [o for o in sc.objects if o.type == 'MESH']
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# world-space vertex cloud, and the same for the windshield alone
pts = []
glass = []
for o in meshes:
    is_glass = any(m and "GLASS" in m.name.upper() for m in o.data.materials)
    for v in o.data.vertices:
        p = o.matrix_world @ v.co
        pts.append((p.x, p.y, p.z))
        if is_glass:
            glass.append((p.x, p.y, p.z))
P = np.array(pts)
G = np.array(glass) if glass else P
centre = P.mean(axis=0)

# ---- principal axes -------------------------------------------------------
_, _, vt = np.linalg.svd(P - centre, full_matrices=False)
axes = list(vt)                                   # already sorted, largest first
ext = [float(np.ptp((P - centre) @ a)) for a in axes]
order = np.argsort(ext)[::-1]                     # span, length, height
span_ax, len_ax, up_ax = (np.array(axes[i]) for i in order)

# ---- fix the signs off the windshield -------------------------------------
gc = G.mean(axis=0) - centre
if gc @ len_ax < 0:
    len_ax = -len_ax
if gc @ up_ax < 0:
    up_ax = -up_ax
span_ax = np.cross(len_ax, up_ax)                 # right-handed, +X = right wing
span_ax /= np.linalg.norm(span_ax)
up_ax = np.cross(span_ax, len_ax)
up_ax /= np.linalg.norm(up_ax)

R = Matrix([list(span_ax), list(len_ax), list(up_ax)]).to_4x4()

for o in meshes:
    o.data.transform(Matrix.Translation(-Vector(centre)))
    o.data.transform(R)

# ---- scale to the published length ----------------------------------------
Q = np.array([(o.matrix_world @ v.co)[:] for o in meshes for v in o.data.vertices])
scale = LENGTH / float(np.ptp(Q[:, 1]))
for o in meshes:
    o.data.transform(Matrix.Scale(scale, 4))

Q = np.array([(o.matrix_world @ v.co)[:] for o in meshes for v in o.data.vertices])
span_now = float(np.ptp(Q[:, 0]))
height_now = float(np.ptp(Q[:, 2]))

# ---- park it in the project's frame ---------------------------------------
shift = Vector((-(Q[:, 0].min() + Q[:, 0].max()) / 2.0,
                -Q[:, 1].max(),
                BELLY_Z - Q[:, 2].min()))
for o in meshes:
    o.data.transform(Matrix.Translation(shift))

Q = np.array([(o.matrix_world @ v.co)[:] for o in meshes for v in o.data.vertices])
print(f"###REF_ORIENTED### scale={scale:.5f}")
print(f"###REF_SIZE### span={span_now:.3f} (published 11.796, "
      f"{100 * (span_now / 11.796 - 1):+.1f}%)  length={LENGTH:.3f}  "
      f"height={height_now:.3f} (published 3.322, {100 * (height_now / 3.322 - 1):+.1f}%)")
print(f"###REF_BBOX### x={Q[:, 0].min():.3f}..{Q[:, 0].max():.3f} "
      f"y={Q[:, 1].min():.3f}..{Q[:, 1].max():.3f} "
      f"z={Q[:, 2].min():.3f}..{Q[:, 2].max():.3f}")

bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("###BLEND###", OUT)
