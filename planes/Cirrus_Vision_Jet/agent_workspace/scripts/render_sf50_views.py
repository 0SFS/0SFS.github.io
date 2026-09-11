"""
Canonical multi-view renderer for SF50 validation.

Usage:
  blender -b --factory-startup --python render_sf50_views.py -- \
      <input.blend|input.glb|EMPTY> <outdir> <prefix> [--silhouette] [--fit N] [--res N]
      [--center Y | --center X,Y,Z] [--views 01,06,...] [--wire] [--keepmat]
      [--hide Obj,Obj]   hide these objects
      [--blur]           draw the tyres' blurred half, as the runtime does at speed

Renders 10 fixed orthographic views + a contact sheet.
Aircraft convention: nose +Y, right wing +X, up +Z (Blender).
Camera framing is FIXED (independent of model size) so successive
iterations are directly comparable.
"""
import bpy, sys, os, math
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:]
inp, outdir, prefix = argv[0], argv[1], argv[2]
SIL = "--silhouette" in argv
# Wireframe: the only way to see whether triangles are going somewhere useful.
WIRE = "--wire" in argv
TRANSP = "--transparent" in argv
ONLY = arg_views = None
FIT = 12.0
RES = 560
if "--fit" in argv: FIT = float(argv[argv.index("--fit") + 1])
if "--views" in argv: ONLY = set(argv[argv.index("--views") + 1].split(","))
if "--res" in argv: RES = int(argv[argv.index("--res") + 1])
os.makedirs(outdir, exist_ok=True)

if inp != "EMPTY":
    if inp.lower().endswith((".glb", ".gltf")):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=inp)
    else:
        bpy.ops.wm.open_mainfile(filepath=inp)

sc = bpy.context.scene

# Hide named objects, to see what sits behind them.
if "--hide" in argv:
    for name in argv[argv.index("--hide") + 1].split(","):
        ob = bpy.data.objects.get(name)
        if ob is not None:
            ob.hide_render = True

# The blurred tyre is the same mesh reading the other half of its texture
# (planes/shared/tyres.py), so drawing it is a u offset of one half - which is
# what the runtime does, and all it does.
if "--blur" in argv:
    for m in bpy.data.materials:
        if not m.use_nodes or not m.name.endswith("_Tyre"):
            continue
        nt = m.node_tree
        for tex in [n for n in nt.nodes if n.type == 'TEX_IMAGE']:
            uv = nt.nodes.new("ShaderNodeTexCoord")
            shift = nt.nodes.new("ShaderNodeMapping")
            shift.inputs["Location"].default_value[0] = 0.5
            nt.links.new(uv.outputs["UV"], shift.inputs["Vector"])
            nt.links.new(shift.outputs["Vector"], tex.inputs["Vector"])

# ---- strip existing cameras/lights so framing is fully deterministic ----
for o in list(sc.objects):
    if o.type in {'CAMERA', 'LIGHT'}:
        bpy.data.objects.remove(o, do_unlink=True)

# ---- centre of interest = bbox centre of all meshes ----
mins = Vector((1e9,) * 3); maxs = Vector((-1e9,) * 3)
for o in sc.objects:
    if o.type != 'MESH': continue
    for c in o.bound_box:
        p = o.matrix_world @ Vector(c)
        for i in range(3):
            mins[i] = min(mins[i], p[i]); maxs[i] = max(maxs[i], p[i])
center = (mins + maxs) / 2 if mins[0] < 1e8 else Vector((0, 0, 0))
if "--center" in argv:
    # One number is a station, and frames the whole section there. Three are a
    # point, which is the only way to frame a detail that is not on the
    # centreline - a gear bay is 0.2 m across, 0.8 m off the axis and under the
    # wing, so a whole-aircraft view at any fit shows it as four grey pixels.
    #
    # WORLD coordinates, not the working Y the reference notes and the report
    # are written in. The model origin is under the CG, so world y = working Y
    # + 4.00; passing the working Y frames a metre and a half off and renders
    # a picture of blank fuselage, which is what it did the first time.
    spec = argv[argv.index("--center") + 1].split(",")
    center = Vector([float(v) for v in spec]) if len(spec) == 3 \
        else Vector((0.0, float(spec[0]), 1.6))

# ---- render settings ----
sc.render.engine = 'BLENDER_EEVEE' if not (SIL or WIRE) else 'BLENDER_WORKBENCH'
sc.render.resolution_x = RES
sc.render.resolution_y = RES
sc.render.resolution_percentage = 100
sc.render.film_transparent = TRANSP
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA' if TRANSP else 'RGB'

world = bpy.data.worlds.new("VW") if not bpy.data.worlds else bpy.data.worlds[0]
sc.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.62, 0.66, 0.72, 1)
    bg.inputs[1].default_value = 1.0

if WIRE:
    sh = sc.display.shading
    sh.type = 'WIREFRAME'
    sh.light = 'FLAT'
    sh.color_type = 'SINGLE'
    # Light wire on Workbench's own dark viewport ground: the background
    # overrides do not take in a headless wireframe render, so the wire is
    # made bright instead of the background made white.
    sh.single_color = (0.95, 0.95, 0.95)
    sh.show_object_outline = False
    sh.wireframe_color_type = 'OBJECT'
    for _o in sc.objects:
        if _o.type == 'MESH':
            _o.color = (0.95, 0.95, 0.95, 1.0)
elif SIL:
    sh = sc.display.shading
    sh.light = 'FLAT'
    sh.color_type = 'SINGLE'
    sh.single_color = (0.02, 0.02, 0.02)
    sh.show_object_outline = False
    sh.show_specular_highlight = False
    sc.render.film_transparent = False
    world.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
    sc.display.shading.background_type = 'VIEWPORT'
    sc.display.shading.background_color = (1, 1, 1)
else:
    try:
        sc.eevee.use_raytracing = True
    except Exception:
        pass
    # neutral 3-point lighting
    def lamp(name, loc, energy, size=8.0):
        d = bpy.data.lights.new(name, 'AREA')
        d.energy = energy; d.size = size
        ob = bpy.data.objects.new(name, d)
        sc.collection.objects.link(ob)
        ob.location = Vector(loc) + center
        dirv = (center - ob.location).normalized()
        ob.rotation_euler = dirv.to_track_quat('-Z', 'Y').to_euler()
        return ob
    lamp("Key",  (9, 11, 12), 9000)
    lamp("Fill", (-13, 4, 3), 3500)
    lamp("Rim",  (2, -14, 7), 5000)

# ---- neutral override material for geometry validation ----
if "--keepmat" not in argv:
    m = bpy.data.materials.new("NEUTRAL")
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    if b:
        b.inputs["Base Color"].default_value = (0.78, 0.78, 0.80, 1)
        b.inputs["Roughness"].default_value = 0.45
        if "Metallic" in b.inputs: b.inputs["Metallic"].default_value = 0.0
    sc.view_layers[0].material_override = m

# ---- cameras: direction vectors (from centre toward camera) ----
D = 60.0
VIEWS = [
    ("01_Front",        ( 0,  1,  0)),
    ("02_Rear",         ( 0, -1,  0)),
    ("03_Left",         (-1,  0,  0)),
    ("04_Right",        ( 1,  0,  0)),
    ("05_Top",          ( 0,  0,  1)),
    ("06_Bottom",       ( 0,  0, -1)),
    ("07_FrontLeft3Q",  (-0.80,  0.80,  0.42)),
    ("08_FrontRight3Q", ( 0.80,  0.80,  0.42)),
    ("09_RearLeft3Q",   (-0.80, -0.80,  0.42)),
    ("10_RearRight3Q",  ( 0.80, -0.80,  0.42)),
]

cd = bpy.data.cameras.new("VCam")
cd.type = 'ORTHO'
cd.ortho_scale = FIT
cam = bpy.data.objects.new("VCam", cd)
sc.collection.objects.link(cam)
sc.camera = cam

paths = []
for name, d in VIEWS:
    if ONLY and name.split("_")[0] not in ONLY: continue
    dv = Vector(d).normalized()
    cam.location = center + dv * D
    up = 'Y' if abs(dv.z) < 0.999 else 'Z'
    cam.rotation_euler = (-dv).to_track_quat('-Z', up).to_euler()
    p = os.path.join(outdir, f"{prefix}_{name}.png")
    sc.render.filepath = p
    bpy.ops.render.render(write_still=True)
    paths.append(p)

# ---- contact sheet 5x2 ----
def load(p):
    im = bpy.data.images.load(p)
    w, h = im.size
    a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
    bpy.data.images.remove(im)
    return a

if ONLY:
    print("###DONE### subset:", paths); raise SystemExit
tiles = [load(p) for p in paths]
h, w = tiles[0].shape[:2]
cols, rows = 5, 2
sheet = np.ones((rows * h, cols * w, 4), dtype=np.float32)
for i, t in enumerate(tiles):
    r, c = divmod(i, cols)
    r = rows - 1 - r          # bpy images are bottom-up
    sheet[r*h:(r+1)*h, c*w:(c+1)*w] = t
# label separators
for c in range(1, cols): sheet[:, c*w-1:c*w+1] = [0.1, 0.1, 0.1, 1]
for r in range(1, rows): sheet[r*h-1:r*h+1, :] = [0.1, 0.1, 0.1, 1]

out = bpy.data.images.new("sheet", cols*w, rows*h, alpha=False)
out.pixels = sheet.ravel().tolist()
sheetpath = os.path.join(outdir, f"{prefix}_SHEET.png")
out.filepath_raw = sheetpath
out.file_format = 'PNG'
out.save()
print("###SHEET###", sheetpath)
print("###VIEWORDER### row1: Front Rear Left Right Top | row2: Bottom FL3Q FR3Q RL3Q RR3Q")
