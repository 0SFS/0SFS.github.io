"""Render an uncropped, textured F-35B gallery image without a browser.

    TMPDIR="$PWD/build/tools/blender-tmp" blender --background \\
      --factory-startup --disable-autoexec --threads 5 \\
      --python scripts/render-f35b-thumbnail.py -- \\
      --output public/aircraft/thumbnails/f-35b.png \\
      --report validation/evidence/aircraft/f35b/thumbnail.json

Uses the exported GLB and Blender Workbench, as the existing aircraft renderer
does. Orthographic framing uses projected mesh vertices so the whole aircraft
fits the gallery image. Default output follows scripts/outputDirectory.mjs.
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


ROOT = Path(__file__).resolve().parents[1]


def output_directory():
    parent = ROOT / "build/validation/aircraft/f35b-thumbnail"
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


def relative_path(path):
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--source", type=Path, default=ROOT / "public/aircraft/f-35b/F-35B_AF267.glb")
parser.add_argument("--output", type=Path)
parser.add_argument("--report", type=Path)
parser.add_argument("--width", type=int, default=640)
parser.add_argument("--height", type=int, default=400)
parser.add_argument("--margin", type=float, default=1.12,
                    help="Frame size divided by projected aircraft size, at least 1.")
args = parser.parse_args(arguments)
if args.width <= 0 or args.height <= 0 or not math.isfinite(args.margin) or args.margin < 1:
    raise ValueError("Positive image dimensions and margin >= 1 required")
source = args.source.resolve()
output = args.output.resolve() if args.output else output_directory() / "f-35b.png"
report_path = args.report.resolve() if args.report else output.with_suffix(".provenance.json")
bpy.context.preferences.filepaths.use_scripts_auto_execute = False
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
scene = bpy.context.scene
points = [obj.matrix_world @ vertex.co for obj in scene.objects if obj.type == "MESH"
          for vertex in obj.data.vertices]
if not points:
    raise ValueError("No aircraft vertices")
low = Vector([min(point[axis] for point in points) for axis in range(3)])
high = Vector([max(point[axis] for point in points) for axis in range(3)])
centre, dimensions = (low + high) / 2, high - low
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "TEXTURE"
scene.display.shading.background_type = "WORLD"
world = bpy.data.worlds.new("F35B_thumbnail_background")
world.color = (0.8, 0.85, 0.9)
scene.world = world
scene.render.resolution_x, scene.render.resolution_y = args.width, args.height
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
camera = bpy.data.objects.new("F35B_thumbnail_camera", bpy.data.cameras.new("F35B_thumbnail_camera"))
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.type = "ORTHO"
azimuth, elevation = math.radians(-35), math.radians(18)
direction = Vector((math.sin(azimuth) * math.cos(elevation),
                    math.cos(azimuth) * math.cos(elevation), math.sin(elevation)))
distance = dimensions.length * 2
camera.location = centre + direction * distance
camera.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
inverse_rotation = camera.rotation_euler.to_matrix().transposed()
projected = [inverse_rotation @ (point - centre) for point in points]
x_low, x_high = min(point.x for point in projected), max(point.x for point in projected)
y_low, y_high = min(point.y for point in projected), max(point.y for point in projected)
camera.data.ortho_scale = 1
unit_frame = camera.data.view_frame(scene=scene)
unit_width = max(point.x for point in unit_frame) - min(point.x for point in unit_frame)
unit_height = max(point.y for point in unit_frame) - min(point.y for point in unit_frame)
camera.data.ortho_scale = max((x_high - x_low) / unit_width,
                             (y_high - y_low) / unit_height) * args.margin
camera.location += camera.rotation_euler.to_matrix() @ Vector(((x_low + x_high) / 2,
                                                              (y_low + y_high) / 2, 0))
output.parent.mkdir(parents=True, exist_ok=True)
scene.render.filepath = str(output)
bpy.ops.render.render(write_still=True)
report = {
    "schemaVersion": 1,
    "source": {"path": relative_path(source), "sha256": hashlib.sha256(source.read_bytes()).hexdigest()},
    "output": {"path": relative_path(output), "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
               "sizePixels": [args.width, args.height], "bytes": output.stat().st_size},
    "blenderVersion": bpy.app.version_string,
    "renderer": "Blender Workbench, textures and studio light",
    "camera": {"type": "orthographic", "azimuthDegrees": -35, "elevationDegrees": 18,
               "margin": args.margin, "scale": camera.data.ortho_scale},
    "groundFrameBoundsMeters": {"min": list(low), "max": list(high), "size": list(dimensions)},
    "credit": {"artist": "AF267", "note": "0sfs gallery render of AF267's F-35B model",
               "license": "CC BY 4.0", "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
               "sourceUrl": "https://sketchfab.com/3d-models/lockheed-martin-f-35b-lightning-ii-5d54a6af45974ad386ae74d42b33374a"},
}
report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text(json.dumps(report, indent=2) + "\n")
print("F35B_THUMBNAIL " + json.dumps({"output": str(output), "report": str(report_path),
                                     "bounds": report["groundFrameBoundsMeters"]}))
