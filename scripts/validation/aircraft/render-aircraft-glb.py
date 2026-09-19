"""Render a GLB from three fixed views, headless, to look at a converted mesh.

    blender -b --factory-startup \\
      --python scripts/validation/aircraft/render-aircraft-glb.py -- \\
      build/.../dhc6jsb-exterior.glb build/.../dhc6jsb

Writes `<prefix>-front-left.png`, `-side.png` and `-top.png`, and prints the
model's bounding box so a converted aircraft can be checked against published
dimensions without opening anything.

Blender imports glTF with -Z forward as +Y, so the camera angles below are
measured from the nose. The views are fixed rather than fitted, so two runs of
a changing converter can be compared directly - the same reason
`render_c172_views.py` fixes its framing.

Workbench with textures, not a lighting rig: this is for checking shape,
orientation and handedness (is the left wing on the left?), not for looking
pretty.
"""

import math
import sys

import bpy
import mathutils

argv = sys.argv[sys.argv.index("--") + 1:]
if len(argv) < 2:
    raise SystemExit("usage: ... --python render-aircraft-glb.py -- <file.glb> <output-prefix>")
source, prefix = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not meshes:
    raise SystemExit(f"{source} holds no meshes")
corners = [o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
low = mathutils.Vector((min(p.x for p in corners), min(p.y for p in corners), min(p.z for p in corners)))
high = mathutils.Vector((max(p.x for p in corners), max(p.y for p in corners), max(p.z for p in corners)))
centre, size = (low + high) / 2, high - low
print(f"BOUNDS span {size.x:.2f} m, length {size.y:.2f} m, height {size.z:.2f} m "
      f"(min {tuple(round(v, 2) for v in low)}, max {tuple(round(v, 2) for v in high)})")

scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "TEXTURE"
scene.render.resolution_x, scene.render.resolution_y = 900, 560
world = bpy.data.worlds.new("sky")
world.color = (0.8, 0.85, 0.9)
scene.world = world
camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
scene.collection.objects.link(camera)
scene.camera = camera

radius = size.length * 0.9
for name, (azimuth_deg, elevation_deg) in {"front-left": (-35, 18), "side": (-90, 0), "top": (-90, 89)}.items():
    azimuth, elevation = math.radians(azimuth_deg), math.radians(elevation_deg)
    direction = mathutils.Vector((math.sin(azimuth) * math.cos(elevation),
                                  math.cos(azimuth) * math.cos(elevation),
                                  math.sin(elevation)))
    camera.location = centre + direction * radius
    camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = f"{prefix}-{name}.png"
    bpy.ops.render.render(write_still=True)
