"""Assemble Cirrus_Vision_Jet_master.blend: all four LODs, each in a collection.

    blender -b --factory-startup --python assemble_master.py -- <workdir> <out.blend>
"""
import bpy, sys, os

argv = sys.argv[sys.argv.index("--") + 1:]
WORK, OUT = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
for lod in range(4):
    src = os.path.join(WORK, f"sf50_lod{lod}.blend")
    coll = bpy.data.collections.new(f"LOD{lod}")
    sc.collection.children.link(coll)
    with bpy.data.libraries.load(src) as (df, dt):
        dt.objects = list(df.objects)
    for ob in dt.objects:
        if ob is not None:
            coll.objects.link(ob)
    coll.hide_viewport = (lod != 0)
    coll.hide_render = (lod != 0)
    print(f"LOD{lod}: {len(list(coll.objects))} objects")

bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("###MASTER###", OUT)
