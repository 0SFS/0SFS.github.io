"""Inspect a GLB/blend reference model: stats + orientation + dimensions."""
import bpy, sys, json, os
from mathutils import Vector

argv = sys.argv[sys.argv.index("--")+1:]
path = argv[0]

# wipe
bpy.ops.wm.read_factory_settings(use_empty=True)

if path.lower().endswith((".glb",".gltf")):
    bpy.ops.import_scene.gltf(filepath=path)
else:
    bpy.ops.wm.open_mainfile(filepath=path)

deps = bpy.context.evaluated_depsgraph_get()
meshes = [o for o in bpy.context.scene.objects if o.type=='MESH']

tris=0; verts=0
mins=Vector((1e9,)*3); maxs=Vector((-1e9,)*3)
per_obj=[]
for o in meshes:
    ev = o.evaluated_get(deps)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    t=len(me.loop_triangles); v=len(me.vertices)
    tris+=t; verts+=v
    bb=[o.matrix_world @ Vector(c) for c in o.bound_box]
    for p in bb:
        for i in range(3):
            mins[i]=min(mins[i],p[i]); maxs[i]=max(maxs[i],p[i])
    per_obj.append(dict(name=o.name, tris=t, verts=v,
        dim=[round(d,3) for d in o.dimensions],
        loc=[round(d,3) for d in o.location],
        scale=[round(d,4) for d in o.scale],
        mats=[m.name for m in o.data.materials if m]))
    ev.to_mesh_clear()

size = [round(maxs[i]-mins[i],3) for i in range(3)]
out = dict(
    path=path, objects=len(bpy.context.scene.objects), meshes=len(meshes),
    triangles=tris, vertices=verts,
    materials=len(bpy.data.materials), images=len(bpy.data.images),
    image_names=[i.name for i in bpy.data.images],
    bbox_min=[round(v,3) for v in mins], bbox_max=[round(v,3) for v in maxs],
    size_xyz=size,
    per_object=sorted(per_obj, key=lambda d:-d['tris'])[:40],
)
print("###JSON###")
print(json.dumps(out, indent=1))
