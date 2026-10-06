"""CPU-only fit inspection of the actual airframe and external tank GLBs.

TMPDIR="$PWD/build/tools/blender-tmp" /Applications/Blender.app/Contents/MacOS/Blender \\
  --background --factory-startup --disable-autoexec --threads 5 \\
  --python scripts/validation/aircraft/render-f35b-external-tanks.py

Default output follows scripts/outputDirectory.mjs's dated build/ convention.
No browser, server, GPU benchmark or source model changes.
"""
import argparse
from datetime import datetime
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]


def output_directory():
    parent = ROOT / "build/validation/aircraft/f35b-external-tanks"
    parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    attempt = 1
    while True:
        directory = parent / (stamp if attempt == 1 else f"{stamp}-{attempt}")
        try:
            directory.mkdir()
            return directory
        except FileExistsError:
            attempt += 1


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", type=Path)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
output = args.output.resolve() if args.output else output_directory()
output.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.use_scripts_auto_execute = False
bpy.ops.wm.read_factory_settings(use_empty=True)
airframe = ROOT / "public/aircraft/f-35b/F-35B_AF267.glb"
tank = ROOT / "public/aircraft/f-35b/ExternalTank_FlightGear.glb"
bpy.ops.import_scene.gltf(filepath=str(airframe))
airframe_root = bpy.data.objects.new("Runtime airframe orientation", None)
bpy.context.scene.collection.objects.link(airframe_root)
for obj in list(bpy.context.scene.objects):
    if obj != airframe_root and obj.parent is None:
        obj.parent = airframe_root
airframe_root.rotation_euler.z = math.pi
airframe_root.location.z = -1.267
before = set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=str(tank))
tank_objects = set(bpy.context.scene.objects) - before
for side in [-1, 1]:
    holder = bpy.data.objects.new(f"External tank {side}", None)
    bpy.context.scene.collection.objects.link(holder)
    holder.location.x = side * 3.25
    for original in tank_objects:
        obj = original.copy()
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = holder
for original in tank_objects:
    bpy.data.objects.remove(original, do_unlink=True)

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 12
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 2
scene.render.threads_mode = "FIXED"
scene.render.threads = 5
scene.render.resolution_x = 1200
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
world = bpy.data.worlds.new("Fit inspection background")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.65, 0.72, 0.82, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.7
scene.world = world
sun_data = bpy.data.lights.new("Sun", "SUN")
sun_data.energy = 2
sun = bpy.data.objects.new("Sun", sun_data)
scene.collection.objects.link(sun)
sun.rotation_euler = (0.5, -0.5, -0.6)
camera = bpy.data.objects.new("Inspection camera", bpy.data.cameras.new("Inspection camera"))
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.type = "ORTHO"
camera.data.ortho_scale = 19
target = Vector((0, -1.8, 0.8))
images = []
for name, point in [("front-quarter", (17, -27, 6)), ("underside", (16, -22, -8)), ("side", (28, -4, 1))]:
    camera.location = Vector(point)
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(output / f"{name}.png")
    bpy.ops.render.render(write_still=True)
    images.append(scene.render.filepath)
report = {
    "purpose": "Offline mesh fit inspection, not aircraft loadout or performance validation",
    "renderer": "Blender Cycles CPU, 12 samples, 5 threads",
    "airframe": {"path": str(airframe.relative_to(ROOT)), "sha256": hashlib.sha256(airframe.read_bytes()).hexdigest()},
    "externalTank": {"path": str(tank.relative_to(ROOT)), "sha256": hashlib.sha256(tank.read_bytes()).hexdigest()},
    "bodyFramePositionsMeters": [[-3.25, 0, 0], [3.25, 0, 0]],
    "images": images,
}
(output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
print("EXTERNAL_TANK_FIT " + json.dumps(report))
