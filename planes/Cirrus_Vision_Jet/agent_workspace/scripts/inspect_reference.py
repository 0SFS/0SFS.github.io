"""Report what a reference GLB actually contains before trusting anything in it.

    blender -b --factory-startup --python inspect_reference.py -- <model.glb>

Size, orientation, per-object triangle counts and materials. A downloaded model
is a hypothesis, not a measurement: this is how you find out whether it is to
scale, which way it is facing, and whether its detail is geometry or texture.
"""
import bpy, sys
from mathutils import Vector

path = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
sc = bpy.context.scene

meshes = [o for o in sc.objects if o.type == 'MESH']
mins = Vector((1e9,) * 3)
maxs = Vector((-1e9,) * 3)
tris = verts = 0
for o in meshes:
    o.data.calc_loop_triangles()
    tris += len(o.data.loop_triangles)
    verts += len(o.data.vertices)
    for c in o.bound_box:
        p = o.matrix_world @ Vector(c)
        for i in range(3):
            mins[i] = min(mins[i], p[i])
            maxs[i] = max(maxs[i], p[i])
size = [round(maxs[i] - mins[i], 4) for i in range(3)]
print(f"###REF### objects={len(meshes)} tris={tris} verts={verts}")
print(f"###SIZE### x={size[0]} y={size[1]} z={size[2]}")
print(f"###BBOX### min={[round(v,3) for v in mins]} max={[round(v,3) for v in maxs]}")
print(f"###IMAGES### {[(i.name, tuple(i.size)) for i in bpy.data.images]}")
for o in sorted(meshes, key=lambda o: -len(o.data.loop_triangles)):
    b = [round(v, 3) for v in o.dimensions]
    print(f"  {o.name:34s} tris={len(o.data.loop_triangles):6d} dims={b} "
          f"mats={[m.name for m in o.data.materials if m]}")
