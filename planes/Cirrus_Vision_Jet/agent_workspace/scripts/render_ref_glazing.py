"""
Render the aligned reference with its glazing picked out, to look at directly.

    blender -b --factory-startup --python render_ref_glazing.py -- \
        <aligned.blend> <out-prefix> [--px 220] [--centre 0,-2.05,1.70]

The numbers measure_windshield.py prints only mean something if the GLASS
submesh really is the windscreen and nothing else, so this puts it on screen:
body white, glazing dark blue, in the four views that show the windshield.
"""
import bpy, sys, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
BLEND, PREFIX = argv[0], argv[1]
PX = float(argv[argv.index("--px") + 1]) if "--px" in argv else 220.0
# The generated model's origin is under the CG; the reference's is at the nose.
AIM = argv[argv.index("--centre") + 1] if "--centre" in argv else "0,-2.05,1.70"

VIEWS = {
    "Left":      ((-1.0, 0.0, 0.0), (3.6, 2.9)),
    "Front":     ((0.0, 1.0, 0.0), (3.0, 2.9)),
    "FrontLeft": ((-0.80, 0.55, 0.25), (3.6, 2.9)),
    "Top":       ((0.0, 0.0, 1.0), (3.0, 3.6)),
}
CENTRE = Vector([float(v) for v in AIM.split(",")])   # on the windshield

bpy.ops.wm.open_mainfile(filepath=BLEND)
sc = bpy.context.scene
for o in list(sc.objects):
    if o.type in {'CAMERA', 'LIGHT'}:
        bpy.data.objects.remove(o, do_unlink=True)

for m in bpy.data.materials:
    glass = "GLASS" in m.name.upper()
    m.use_nodes = False
    m.diffuse_color = (0.05, 0.10, 0.30, 1.0) if glass else (0.92, 0.92, 0.93, 1.0)

sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading
sh.light = 'STUDIO'
sh.color_type = 'MATERIAL'
sh.show_object_outline = True
sh.object_outline_color = (0.2, 0.2, 0.2)
sh.show_specular_highlight = False
sc.render.film_transparent = False
if sc.world is None:
    sc.world = bpy.data.worlds.new("W")
sc.world.color = (1.0, 1.0, 1.0)
sc.render.image_settings.file_format = 'PNG'

for name, (d, (w, h)) in VIEWS.items():
    sc.render.resolution_x = int(w * PX)
    sc.render.resolution_y = int(h * PX)
    sc.render.resolution_percentage = 100
    cd = bpy.data.cameras.new(name)
    cd.type = 'ORTHO'
    cd.ortho_scale = max(w, h)
    cam = bpy.data.objects.new(name, cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    dv = Vector(d).normalized()
    cam.location = CENTRE + dv * 40.0
    cam.rotation_euler = (-dv).to_track_quat('-Z', 'Y').to_euler()
    if name == "Top":
        cam.rotation_euler = (0.0, 0.0, 0.0)
    sc.render.filepath = f"{PREFIX}_{name}.png"
    bpy.ops.render.render(write_still=True)
    print("###VIEW###", sc.render.filepath)
    bpy.data.objects.remove(cam, do_unlink=True)
