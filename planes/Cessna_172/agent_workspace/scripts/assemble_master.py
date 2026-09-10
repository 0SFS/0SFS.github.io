"""Assemble Cessna_172_master.blend: all four LODs, each in its own collection."""
import bpy, sys, os
argv = sys.argv[sys.argv.index("--")+1:]
WORK, OUT = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
for lod in range(4):
    src = os.path.join(WORK, f"c172_lod{lod}.blend")
    coll = bpy.data.collections.new(f"LOD{lod}")
    sc.collection.children.link(coll)
    with bpy.data.libraries.load(src) as (df, dt):
        dt.objects = list(df.objects)
    for ob in dt.objects:
        if ob is not None:
            coll.objects.link(ob)
    # The ladder runs coarsest first, so LOD3 is the finest and is the one
    # left visible.
    coll.hide_viewport = (lod != 3)
    coll.hide_render = (lod != 3)
    print(f"LOD{lod}: {len([o for o in coll.objects])} objects")

bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("###MASTER###", OUT)
