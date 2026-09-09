"""
Stack a rendered silhouette straight on top of the reference three view.

    blender -b --factory-startup --python compare_drawing.py -- \
        <model.blend> <side|plan|front> <out.png> [--px 150]

The reference drawing has a different px/m on each axis (see
measurements/sf50_reference.md), so it is resampled into a square metric grid
first; the model is then rendered orthographically into exactly the same metric
window.  Drawing ink comes out grey, the model red, so anywhere the two
disagree is the colour that is showing.  Comparing in isolation hides errors
that this makes obvious.
"""

import bpy, sys, os, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
BLEND, VIEW, OUT = argv[0], argv[1], argv[2]
PX = float(argv[argv.index("--px") + 1]) if "--px" in argv else 150.0
# The generated model's origin is under the CG; a reoriented reference has its
# origin at the nose tip instead.
NOSE_ORIGIN = "--nose-origin" in argv
# Silhouette by default. `--shaded` keeps the materials instead, which is the
# only way to check that a window painted by material index lands where the
# drawing draws it.
SHADED = "--shaded" in argv

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(HERE, "measurements", "ref_SF50_three_view_1200dpi.png")

# --- calibration, from measurements/sf50_reference.md -----------------------
S_LONG, S_LAT, S_VERT = 386.2, 409.4, 379.6
SIDE_NOSE_X, SIDE_GROUND_Y = 819.5, 1737.5
PLAN_NOSE_Y, PLAN_CENTRE_X = 1884.5, 2687.0
FRONT_CENTRE_X, FRONT_GROUND_Y = 2687.5, 7554.0

# Metric window as it appears on the page: h runs left to right, v top to
# bottom, matching how each view is laid out in the POH figure - nose left in
# the side view, nose up in the plan.
WINDOWS = {
    "side":  dict(h=(0.6, -9.9), v=(3.75, -0.35)),
    "plan":  dict(h=(-6.4, 6.4), v=(0.6, -9.9)),
    "front": dict(h=(-6.4, 6.4), v=(3.75, -0.35)),
}
W = WINDOWS[VIEW]
h0, h1 = W["h"]
v0, v1 = W["v"]
NX = int(round(abs(h1 - h0) * PX))
NY = int(round(abs(v0 - v1) * PX))


def load_ref():
    im = bpy.data.images.load(REF)
    w, h = im.size
    buf = np.empty(w * h * im.channels, dtype=np.float32)
    im.pixels.foreach_get(buf)
    a = buf.reshape(h, w, im.channels)[::-1][..., :3].mean(axis=2)
    bpy.data.images.remove(im)
    return a


ref = load_ref()
RH, RW = ref.shape

# metric coordinates of every output pixel
hs = h0 + (h1 - h0) * (np.arange(NX) + 0.5) / NX
vs = v0 + (v1 - v0) * (np.arange(NY) + 0.5) / NY
HH, VV = np.meshgrid(hs, vs)

if VIEW == "side":
    col = SIDE_NOSE_X - HH * S_LONG
    row = SIDE_GROUND_Y - VV * S_VERT
elif VIEW == "plan":
    col = PLAN_CENTRE_X + HH * S_LAT
    row = PLAN_NOSE_Y - VV * S_LONG
else:
    col = FRONT_CENTRE_X + HH * S_LAT
    row = FRONT_GROUND_Y - VV * S_LAT      # the front view is isotropic

ci = np.clip(np.round(col).astype(np.int32), 0, RW - 1)
ri = np.clip(np.round(row).astype(np.int32), 0, RH - 1)
inside = (col >= 0) & (col < RW) & (row >= 0) & (row < RH)
draw = np.where(inside, ref[ri, ci], 1.0)          # 0 = ink, 1 = paper

# ---------------------------------------------------------------- render ----
bpy.ops.wm.open_mainfile(filepath=BLEND)
sc = bpy.context.scene
for o in list(sc.objects):
    if o.type in {'CAMERA', 'LIGHT'}:
        bpy.data.objects.remove(o, do_unlink=True)

sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading
sh.light = 'FLAT'
sh.color_type = 'MATERIAL' if SHADED else 'SINGLE'
sh.single_color = (0, 0, 0)
sh.show_object_outline = False
sh.show_specular_highlight = False
sc.render.resolution_x = NX
sc.render.resolution_y = NY
sc.render.resolution_percentage = 100
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'

# The generator puts the origin under the CG, so the drawing's nose-tip datum
# is CG_SHIFT forward of it.
CG_SHIFT = 0.0 if NOSE_ORIGIN else -4.00
hc, vc = (h0 + h1) / 2.0, (v0 + v1) / 2.0
if VIEW == "side":
    centre = Vector((0.0, hc - CG_SHIFT, vc))
    dirv = Vector((-1.0, 0.0, 0.0))
    up = 'Y'
elif VIEW == "plan":
    centre = Vector((hc, vc - CG_SHIFT, 0.0))
    dirv = Vector((0.0, 0.0, 1.0))
    up = None                      # straight down: +X right, +Y up on screen
else:
    centre = Vector((hc, 0.0, vc))
    dirv = Vector((0.0, 1.0, 0.0))
    up = 'Y'

cd = bpy.data.cameras.new("Cmp")
cd.type = 'ORTHO'
cd.ortho_scale = abs(h1 - h0) if NX >= NY else abs(v0 - v1)
cam = bpy.data.objects.new("Cmp", cd)
sc.collection.objects.link(cam)
sc.camera = cam
cam.location = centre + dirv * 60.0
if up is None:
    cam.rotation_euler = (0.0, 0.0, 0.0)
else:
    cam.rotation_euler = (-dirv).to_track_quat('-Z', up).to_euler()

tmp = os.path.join(os.path.dirname(OUT) or ".", "_cmp_model.png")
os.makedirs(os.path.dirname(tmp) or ".", exist_ok=True)
sc.render.filepath = tmp
bpy.ops.render.render(write_still=True)

im = bpy.data.images.load(tmp)
mw, mh = im.size
buf = np.empty(mw * mh * 4, dtype=np.float32)
im.pixels.foreach_get(buf)
pix = buf.reshape(mh, mw, 4)[::-1]
model = pix[..., 3] > 0.5                               # alpha = the silhouette
shade = pix[..., :3]
bpy.data.images.remove(im)
os.remove(tmp)

if model.shape != draw.shape:                            # rounding on odd sizes
    model = model[:draw.shape[0], :draw.shape[1]]
    shade = shade[:draw.shape[0], :draw.shape[1]]
    draw = draw[:model.shape[0], :model.shape[1]]

out = np.ones(draw.shape + (4,), dtype=np.float32)
ink = draw < 0.55
if SHADED:
    for c in range(3):
        out[..., c] = np.where(model, shade[..., c], 1.0)
    # drawing ink over the top, so pane edges can be compared directly
    for c, v in enumerate((0.85, 0.05, 0.05)):
        out[..., c] = np.where(ink, v, out[..., c])
else:
    for c in range(3):
        out[..., c] = np.where(ink, 0.35, 1.0)
    out[model, 0] = 0.90
    out[model, 1] = np.where(ink[model], 0.10, 0.30)
    out[model, 2] = np.where(ink[model], 0.10, 0.30)

img = bpy.data.images.new("cmp", out.shape[1], out.shape[0], alpha=True)
img.pixels = out[::-1].ravel().tolist()
img.filepath_raw = OUT
img.file_format = 'PNG'
img.save()
print("###COMPARE###", OUT, f"{out.shape[1]}x{out.shape[0]} at {PX} px/m")
