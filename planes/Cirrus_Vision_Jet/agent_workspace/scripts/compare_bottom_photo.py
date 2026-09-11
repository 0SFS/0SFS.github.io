"""
The model's belly, gear up, against the straight bottom-view photograph, at the
photograph's own scale.

    blender -b --factory-startup --python compare_bottom_photo.py -- \
        <gear-up.blend> <out.png>

measurements/photo_PS-CVJ_bottom_view.jpg is scaled on the published span: the
yellow wingtips are 674 px apart for 11.796 m, 57.1 px/m, and the centreline
is x = 614.3 (midway between the two wells). The crop below is the band across
the wing root, contrast-stretched and enlarged 4x the way enhance_crop.py does
it, so it is 228.4 px/m. The model is rendered orthographic from straight below
at exactly that scale, turned so the nose is UP as it is in the photograph, and
the two are stacked with a centreline tick on each: whatever is in a different
place is in a different place by the number of pixels it looks.
"""
import bpy, sys, os
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
BLEND, OUT = argv[0], argv[1]
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTO = os.path.join(HERE, "measurements", "photo_PS-CVJ_bottom_view.jpg")

PX_M = 57.1                      # photograph, px per metre
CL_X, AXLE_Y = 614.3, 324.5      # photograph: centreline, and the wells' row
X0, X1, Y0, Y1 = 470, 760, 270, 380
SCALE = 4
AXLE_WORLD_Y = -0.434            # model: the main axle station, world frame

# ---- the photograph, cropped and stretched ---------------------------------
im = bpy.data.images.load(PHOTO)
w, h = im.size
a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1][..., :3]
c = a[Y0:Y1, X0:X1] @ np.array([0.2126, 0.7152, 0.0722])
lo, hi = np.percentile(c, 0.5), np.percentile(c, 99.5)
c = np.clip((c - lo) / (hi - lo), 0, 1)
photo = np.repeat(np.repeat(c, SCALE, 0), SCALE, 1)
ph, pw = photo.shape

# ---- the model, from straight below at the same scale ----------------------
bpy.ops.wm.open_mainfile(filepath=BLEND)
sc = bpy.context.scene
for o in list(sc.objects):
    if o.type in {'CAMERA', 'LIGHT'}:
        bpy.data.objects.remove(o, do_unlink=True)
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'MATERIAL'
sc.render.resolution_x, sc.render.resolution_y = pw, ph
sc.render.resolution_percentage = 100
cd = bpy.data.cameras.new("C")
cd.type = 'ORTHO'
cd.ortho_scale = pw / (PX_M * SCALE)          # metres across the frame
cam = bpy.data.objects.new("C", cd)
sc.collection.objects.link(cam)
sc.camera = cam
# The frame's vertical centre is the photograph's crop centre, which is not the
# axle row, so offset the camera by the same number of metres.
dy = ((Y0 + Y1) / 2.0 - AXLE_Y) / PX_M
cam.location = Vector((0.0, AXLE_WORLD_Y - dy, -20.0))
# Looking straight up with the nose at the TOP of the frame. From below, the
# aeroplane's right wing is on the viewer's left, as it is in the photograph.
# A half turn about Y alone does both; adding one about Z as well - which
# reads as "and turn it the right way up" - puts the nose at the bottom and
# the right wing on the right, and the first comparison came out that way.
# Checked by projecting the nose and a wingtip through the camera.
cam.rotation_euler = (0.0, 3.14159265, 0.0)
sc.render.filepath = OUT + ".model.png"
bpy.ops.render.render(write_still=True)
r = bpy.data.images.load(sc.render.filepath)
m = np.array(r.pixels[:], dtype=np.float32).reshape(ph, pw, 4)[::-1][..., :3]
m = m @ np.array([0.2126, 0.7152, 0.0722])

# ---- stack them, with the centreline marked on both ------------------------
sheet = np.ones((2 * ph + 6, pw), dtype=np.float32)
sheet[:ph] = photo
sheet[ph + 6:] = m
cl = int(round((CL_X - X0) * SCALE))
for y0 in (0, ph + 6):
    sheet[y0:y0 + 24, cl - 1:cl + 2] = 0.0
rgba = np.dstack([sheet, sheet, sheet, np.ones_like(sheet)])[::-1]
out = bpy.data.images.new("cmp", pw, sheet.shape[0], alpha=False)
out.pixels = rgba.ravel().tolist()
out.filepath_raw = OUT
out.file_format = 'PNG'
out.save()
os.remove(sc.render.filepath)
print("###COMPARE###", OUT, pw, sheet.shape[0])
