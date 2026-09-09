"""
Check that two exported GLBs land in the same place.

    blender -b --factory-startup --python compare_assets.py -- <a.glb> <b.glb>

A third-party asset prepared by prepare_third_party.py has to sit exactly where
our own meshes sit, because the runtime applies one `modelYawRad` and one
`modelOffset` to whichever level is loaded. Getting that wrong is silent: the
model loads, looks fine in isolation, and is facing backwards or buried.
"""
import bpy, sys
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]

for path in argv:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    Q = np.array([(o.matrix_world @ v.co)[:] for o in meshes for v in o.data.vertices])
    nose = Q[int(np.argmax(Q[:, 1]))]
    tail = Q[int(np.argmin(Q[:, 1]))]
    print(f"###ASSET### {path.rsplit('/', 1)[-1]}")
    print(f"  bbox x {Q[:, 0].min():7.3f}..{Q[:, 0].max():7.3f}   "
          f"y {Q[:, 1].min():7.3f}..{Q[:, 1].max():7.3f}   "
          f"z {Q[:, 2].min():7.3f}..{Q[:, 2].max():7.3f}")
    print(f"  nose (max y) {np.round(nose, 3)}   tail (min y) {np.round(tail, 3)}")
    print(f"  origin-to-nose {Q[:, 1].max():+.3f} m, origin-to-tail "
          f"{Q[:, 1].min():+.3f} m, lowest z {Q[:, 2].min():.3f}")
