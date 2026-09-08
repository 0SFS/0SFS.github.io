"""Neutralise refB's Sketchfab root pose, reorient to project convention
(nose +Y, right +X, up +Z), scale to 11.0 m span, sit wheels on z=0."""
import bpy, sys, os
from mathutils import Vector, Matrix
argv = sys.argv[sys.argv.index("--")+1:]
src, dst = argv[0], argv[1]
FLIP = "--flipY" in argv
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

root = bpy.data.objects["Sketchfab_model"]
# neutral pose, then permute: newX=oldX(span), newY=oldZ(length), newZ=oldY(height)
P = Matrix(((1,0,0,0),(0,0,1,0),(0,1,0,0),(0,0,0,1)))
if FLIP:
    P = Matrix(((-1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
root.matrix_world = P
bpy.context.view_layer.update()

def bbox():
    mins=Vector((1e9,)*3); maxs=Vector((-1e9,)*3)
    for o in bpy.context.scene.objects:
        if o.type!='MESH': continue
        for c in o.bound_box:
            p=o.matrix_world@Vector(c)
            for i in range(3):
                mins[i]=min(mins[i],p[i]); maxs[i]=max(maxs[i],p[i])
    return mins, maxs

mins, maxs = bbox()
s = 11.0 / (maxs[0]-mins[0])
root.matrix_world = Matrix.Scale(s,4) @ root.matrix_world
bpy.context.view_layer.update()
mins, maxs = bbox()
root.location = root.location + Vector((-(mins[0]+maxs[0])/2, -(mins[1]+maxs[1])/2, -mins[2]))
bpy.context.view_layer.update()
mins, maxs = bbox()
print("REFB SIZE(span,len,height)", [round(maxs[i]-mins[i],3) for i in range(3)])
bpy.ops.wm.save_as_mainfile(filepath=dst)
print("SAVED", dst)
