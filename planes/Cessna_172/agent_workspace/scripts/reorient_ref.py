"""Import a reference GLB, reorient into project convention (nose +Y, right +X, up +Z),
centre it, and save as a .blend in work/. Rotation given as an axis permutation string."""
import bpy, sys, os, math
from mathutils import Vector, Matrix
argv = sys.argv[sys.argv.index("--")+1:]
src, dst, perm, flip = argv[0], argv[1], argv[2], (argv[3] if len(argv)>3 else "")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

# perm like "zxy" => newX=oldZ, newY=oldX, newZ=oldY
idx = {'x':0,'y':1,'z':2}
M = Matrix(((0,0,0),(0,0,0),(0,0,0)))
for r,ch in enumerate(perm):
    M[r][idx[ch]] = -1.0 if ch.upper() in flip.upper() and ch in flip else 1.0
for c in flip:
    pass
M4 = M.to_4x4()

roots = [o for o in bpy.context.scene.objects if o.parent is None]
for o in roots:
    o.matrix_world = M4 @ o.matrix_world

bpy.context.view_layer.update()
# centre on origin in X, and put wheels at z=0
mins=Vector((1e9,)*3); maxs=Vector((-1e9,)*3)
for o in bpy.context.scene.objects:
    if o.type!='MESH': continue
    for c in o.bound_box:
        p=o.matrix_world@Vector(c)
        for i in range(3):
            mins[i]=min(mins[i],p[i]); maxs[i]=max(maxs[i],p[i])
off = Vector((-(mins[0]+maxs[0])/2, -(mins[1]+maxs[1])/2, -mins[2]))
for o in roots:
    o.location = o.location + off
bpy.context.view_layer.update()
print("SIZE", [round(maxs[i]-mins[i],3) for i in range(3)])
bpy.ops.wm.save_as_mainfile(filepath=dst)
print("SAVED", dst)
