"""Convert AF267's original F-35B source to a self-contained runtime GLB.

    TMPDIR="$PWD/build/tools/blender-tmp" blender --background \\
      --factory-startup --disable-autoexec --threads 5 \\
      --python scripts/prepare-f35b-model.py -- \\
      --output public/aircraft/f-35b/F-35B_AF267.glb \\
      --report validation/evidence/aircraft/f35b/export.json

Default output goes to a new dated build/validation/aircraft/f35b-export folder,
matching scripts/outputDirectory.mjs. The source and textures are never saved
or modified. Named parts, their origins and existing hierarchy remain intact
beneath one conversion root. Published wingspan supplies uniform physical
scale; the original trial FDM's CG supplies longitudinal alignment. This does
not assert that the trial FDM's CG or nose datum has been validated.
"""

import argparse
from datetime import datetime
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "planes/Lockheed_Martin_F-35B/tests/sketchfab-5d54a6af45974ad386ae74d42b33374a/source/f35-full.blend"
SOURCE_URL = "https://sketchfab.com/3d-models/lockheed-martin-f-35b-lightning-ii-5d54a6af45974ad386ae74d42b33374a"
LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"


def output_directory():
    parent = ROOT / "build/validation/aircraft/f35b-export"
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


def repository_path(path):
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bounds(points):
    low = [min(point[axis] for point in points) for axis in range(3)]
    high = [max(point[axis] for point in points) for axis in range(3)]
    return {"min": low, "max": high, "size": [b - a for a, b in zip(low, high)]}


def glb_document(path):
    contents = path.read_bytes()
    magic, version, total = struct.unpack_from("<III", contents)
    if (magic, version, total) != (0x46546C67, 2, len(contents)):
        raise ValueError("Invalid GLB header")
    offset, document, binary = 12, None, None
    while offset < len(contents):
        length, kind = struct.unpack_from("<II", contents, offset)
        chunk = contents[offset + 8:offset + 8 + length]
        if kind == 0x4E4F534A:
            document = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
        offset += 8 + length
    if document is None or binary is None:
        raise ValueError("GLB must contain JSON and an embedded binary chunk")
    return document, binary


arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--source", type=Path, default=SOURCE)
parser.add_argument("--output", type=Path)
parser.add_argument("--report", type=Path)
parser.add_argument("--span-meters", type=float, default=35 * 0.3048,
                    help="Published exterior wingspan: 35 ft (10.668 m).")
parser.add_argument("--cg-aft-nose-meters", type=float, default=368.52 * 0.0254,
                    help="Trial FDM structural CG: 368.52 in aft of its assumed nose datum.")
args = parser.parse_args(arguments)
if not math.isfinite(args.span_meters) or args.span_meters <= 0:
    raise ValueError("span-meters must be finite and positive")
if not math.isfinite(args.cg_aft_nose_meters) or args.cg_aft_nose_meters <= 0:
    raise ValueError("cg-aft-nose-meters must be finite and positive")
source = args.source.resolve()
output = args.output.resolve() if args.output else output_directory() / "F-35B_AF267.glb"
report_path = args.report.resolve() if args.report else output.with_suffix(".provenance.json")
source_hash = sha256(source)
bpy.context.preferences.filepaths.use_scripts_auto_execute = False
bpy.ops.wm.open_mainfile(filepath=str(source), use_scripts=False)
scene = bpy.context.scene
mesh_objects = [obj for obj in scene.objects if obj.type == "MESH"]
if not mesh_objects:
    raise ValueError("F-35B source has no meshes")
source_points = [obj.matrix_world @ vertex.co for obj in mesh_objects for vertex in obj.data.vertices]
source_bounds = bounds(source_points)
# Inspection establishes +X nose, +Y port, +Z up. Canopy and nose gear are
# forward (+X), and the wing tips set symmetric +/-Y span.
uniform_scale = args.span_meters / source_bounds["size"][1]
nose_source_x = source_bounds["max"][0]
ground_source_z = source_bounds["min"][2]
cg_scaled_x = nose_source_x * uniform_scale - args.cg_aft_nose_meters
conversion = (Matrix.Translation(Vector((0, -cg_scaled_x, -ground_source_z * uniform_scale)))
              @ Matrix.Rotation(math.pi / 2, 4, "Z")
              @ Matrix.Scale(uniform_scale, 4))

texture_records = []
for image in bpy.data.images:
    if image.source != "FILE":
        continue
    texture = source.parent.parent / "textures" / Path(image.filepath.replace("\\", "/")).name
    if not texture.is_file():
        raise ValueError(f"Missing source texture: {texture}")
    image.filepath = str(texture)
    image.reload()
    if not all(image.size):
        raise ValueError(f"Source texture did not load: {texture}")
    texture_records.append({"name": image.name, "path": repository_path(texture),
                            "sha256": sha256(texture), "sizePixels": list(image.size)})

root_objects = [obj for obj in scene.objects if obj.parent is None]
root = bpy.data.objects.new("F35B_Conversion", None)
scene.collection.objects.link(root)
root.matrix_world = conversion
root["artist"] = "AF267"
root["sourceUrl"] = SOURCE_URL
root["license"] = "CC BY 4.0"
root["licenseUrl"] = LICENSE_URL
root["coordinateConvention"] = "glTF -Z nose, +Y up; origin on ground below trial-FDM longitudinal CG"
root["cgAlignment"] = "Trial FDM structural x=0 assumed nose datum; unvalidated CG 368.52 in aft"
for obj in root_objects:
    old_world = obj.matrix_world.copy()
    obj.parent = root
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_basis = old_world
bpy.context.view_layer.update()
converted_points = [obj.matrix_world @ vertex.co for obj in mesh_objects for vertex in obj.data.vertices]
converted_bounds = bounds(converted_points)
part_records = [{"name": obj.name, "parent": obj.parent.name if obj.parent else None,
                 "sourceParent": None if obj.parent == root else obj.parent.name,
                 "groundFrameOriginMeters": list(obj.matrix_world.translation),
                 "groundFrameLocalAxes": [list(obj.matrix_world.to_3x3().col[i].normalized()) for i in range(3)]}
                for obj in sorted(mesh_objects, key=lambda item: item.name)]
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", export_yup=True,
                          export_apply=True, export_animations=False, export_extras=True,
                          export_copyright="Lockheed Martin F-35B Lightning II by AF267; CC BY 4.0; "
                          + SOURCE_URL + "; conversion, uniform scale and reference alignment by 0sfs")
if sha256(source) != source_hash:
    raise ValueError("Original source unexpectedly changed")
document, binary = glb_document(output)
images = document.get("images", [])
if not images or any("uri" in image or "bufferView" not in image for image in images):
    raise ValueError("Every runtime texture must be embedded in the GLB")
if any("uri" in buffer for buffer in document.get("buffers", [])):
    raise ValueError("GLB must not reference an external geometry buffer")
source_names = {obj.name for obj in mesh_objects}
exported_names = {node.get("name") for node in document.get("nodes", [])}
if not source_names.issubset(exported_names):
    raise ValueError("GLB lost authored part names: " + str(sorted(source_names - exported_names)))
triangle_count = sum(document["accessors"][primitive["indices"]]["count"] // 3
                     for mesh in document.get("meshes", []) for primitive in mesh["primitives"])
image_records = []
for image in images:
    view = document["bufferViews"][image["bufferView"]]
    start, size = view.get("byteOffset", 0), view["byteLength"]
    image_records.append({"name": image.get("name"), "mimeType": image["mimeType"],
                          "bytes": size, "sha256": hashlib.sha256(binary[start:start + size]).hexdigest()})
report = {
    "schemaVersion": 1,
    "source": {"path": repository_path(source), "sha256": source_hash,
               "artist": "AF267", "sourceUrl": SOURCE_URL, "license": "CC BY 4.0", "licenseUrl": LICENSE_URL},
    "export": {"path": repository_path(output), "sha256": sha256(output), "bytes": output.stat().st_size,
               "blenderVersion": bpy.app.version_string, "blenderBuildHash": bpy.app.build_hash.decode(),
               "triangles": triangle_count, "meshObjects": len(mesh_objects),
               "gltfMeshes": len(document.get("meshes", [])), "gltfNodes": len(document.get("nodes", [])),
               "materials": len(document.get("materials", [])), "embeddedImages": image_records,
               "gltfExtensionsUsed": document.get("extensionsUsed", [])},
    "transform": {"sourceAxes": "+X nose, +Y port, +Z up", "blenderExportAxes": "+Y nose, +Z up",
                  "gltfAxes": "-Z nose, +Y up", "runtimeYawRad": math.pi,
                  "sourceBounds": source_bounds, "uniformScale": uniform_scale,
                  "spanMeters": args.span_meters, "spanBasis": "Published 35 ft exterior wingspan",
                  "cgAftNoseMeters": args.cg_aft_nose_meters,
                  "cgBasis": "Unvalidated trial FDM: structural nose x=0 assumption; CG x=368.52 in",
                  "sourceNoseX": nose_source_x, "sourceLowestWheelZ": ground_source_z,
                  "groundFrameBoundsMeters": converted_bounds,
                  "matrixSourceToBlenderGroundFrame": [list(row) for row in conversion]},
    "textures": texture_records,
    "parts": part_records,
    "modifications": ["Relinked source textures by basename without modifying their files.",
                      "Added a conversion root for rotation, uniform scale and reference translation.",
                      "Exported self-contained GLB with authored names, origins and hierarchy preserved.",
                      "Blender evaluated its migrated Auto Smooth modifiers during glTF export.",
                      "The glTF exporter converted the source metallic texture into glTF channel encoding."],
    "limitations": ["Uniform wingspan scale preserves a length about 1.3% short of published 51.2 ft.",
                    "CG and structural nose-datum alignment come from the unvalidated trial FDM.",
                    "No keyframed source animation exists; moving parts require runtime property bindings.",
                    "Local part rotations remain authored; generic identity-axis rig assumptions do not apply."],
}
report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text(json.dumps(report, indent=2) + "\n")
output.with_suffix(".provenance.json").write_text(json.dumps(report, indent=2) + "\n")
print("F35B_EXPORT " + json.dumps({"output": str(output), "report": str(report_path),
                                   "triangles": triangle_count, "bounds": converted_bounds,
                                   "scale": uniform_scale, "embeddedImages": len(images)}))
