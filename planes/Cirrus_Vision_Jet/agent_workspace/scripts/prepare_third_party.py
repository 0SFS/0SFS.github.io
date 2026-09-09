"""
Turn a downloaded model into an asset the simulator can load beside our own.

    blender -b --factory-startup --python prepare_third_party.py -- \
        <aligned.blend> <out.glb>

`reorient_ref.py` has already done the hard part - it puts the model in the
project's construction frame, +Y nose with Y = 0 at the nose tip, +Z up with
z = 0 on the ground, scaled on the published span and pitched to match the
drawing's own crown line. All that is left is what `generate_sf50.py` does to
its own meshes on the way out:

1. Shift the origin to CG_SHIFT, so the exported origin sits on the ground
   directly below the CG. The runtime's `modelOffset` is written against that
   convention, and a model whose origin is somewhere else lands in the wrong
   place however good its geometry is.
2. Export with `export_yup`, which is what turns +Y nose / +Z up into glTF's
   -Z nose / +Y up. `modelYawRad` in the catalog then does the rest.

Nothing about the geometry is touched. What the model gets wrong it still gets
wrong, and REPORT.md says what that is.
"""
import bpy, sys, os
import numpy as np
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT = argv[0], argv[1]

CG_SHIFT = -4.00        # must match generate_sf50.py

bpy.ops.wm.open_mainfile(filepath=SRC)
sc = bpy.context.scene
meshes = [o for o in sc.objects if o.type == 'MESH']
if not meshes:
    raise SystemExit("no meshes")

for o in meshes:
    o.data.transform(Matrix.Translation(Vector((0.0, -CG_SHIFT, 0.0))))

Q = np.array([(o.matrix_world @ v.co)[:] for o in meshes for v in o.data.vertices])
tris = sum(len(o.data.polygons) and sum(len(p.vertices) - 2 for p in o.data.polygons)
           for o in meshes)
print(f"###PREPARED### meshes={len(meshes)} tris={tris} verts={len(Q)}")
print(f"###BBOX### x={Q[:, 0].min():.3f}..{Q[:, 0].max():.3f} "
      f"y={Q[:, 1].min():.3f}..{Q[:, 1].max():.3f} "
      f"z={Q[:, 2].min():.3f}..{Q[:, 2].max():.3f}")
print(f"###STANCE### lowest z={Q[:, 2].min():.3f} "
      f"(our own meshes reach 0.000 on their wheels)")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB',
                          export_yup=True, export_apply=True)
print("###GLB###", OUT)
