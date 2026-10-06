"""Inspect the unmodified AF267 F-35B Blender source without saving or rendering.

    blender --background --factory-startup --disable-autoexec \\
      --python scripts/inspect-f35b-source.py -- \\
      planes/Lockheed_Martin_F-35B/tests/sketchfab-5d54a6af45974ad386ae74d42b33374a/source/f35-full.blend

An optional --output writes a retained JSON report. Otherwise each run gets a
new dated build/validation/aircraft/f35b-source folder, matching the layout of
scripts/outputDirectory.mjs. This inspects source coordinates; it does not
assume a physical scale or an aircraft orientation.
"""

import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]


def output_directory():
    parent = ROOT / "build/validation/aircraft/f35b-source"
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


def vector(value):
    return [float(component) for component in value]


def matrix(value):
    return [vector(row) for row in value]


def bounds(points):
    if not points:
        return None
    low = [min(point[axis] for point in points) for axis in range(3)]
    high = [max(point[axis] for point in points) for axis in range(3)]
    return {"min": low, "max": high, "size": [b - a for a, b in zip(low, high)]}


def animation(data):
    value = getattr(data, "animation_data", None)
    if value is None:
        return None
    return {
        "action": value.action.name if value.action else None,
        "drivers": [
            {"path": curve.data_path, "index": curve.array_index,
             "type": curve.driver.type, "expression": curve.driver.expression}
            for curve in value.drivers
        ],
        "nlaTracks": [track.name for track in value.nla_tracks],
    }


def input_value(node, name):
    socket = node.inputs.get(name)
    if socket is None:
        return None
    value = socket.default_value
    return {"value": vector(value) if hasattr(value, "__len__") else value,
            "linked": socket.is_linked}


arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path)
parser.add_argument("--output", type=Path)
args = parser.parse_args(arguments)
source = args.source.resolve()
output = args.output.resolve() if args.output else output_directory() / "source-inspection.json"

# --disable-autoexec must be supplied by the caller as well: this setting and
# the open-mainfile flag also prevent embedded source scripts from running.
bpy.context.preferences.filepaths.use_scripts_auto_execute = False
bpy.ops.wm.open_mainfile(filepath=str(source), use_scripts=False)
scene = bpy.context.scene
world_points = []
mesh_objects = []
objects = []
for obj in sorted(scene.objects, key=lambda item: item.name):
    entry = {
        "name": obj.name,
        "type": obj.type,
        "parent": obj.parent.name if obj.parent else None,
        "hideViewport": obj.hide_viewport,
        "hideRender": obj.hide_render,
        "visible": obj.visible_get(),
        "location": vector(obj.location),
        "rotationMode": obj.rotation_mode,
        "rotationEuler": vector(obj.rotation_euler),
        "rotationQuaternion": vector(obj.rotation_quaternion),
        "scale": vector(obj.scale),
        "worldOrigin": vector(obj.matrix_world.translation),
        "matrixWorld": matrix(obj.matrix_world),
        "matrixParentInverse": matrix(obj.matrix_parent_inverse),
        "dimensions": vector(obj.dimensions),
        "animation": animation(obj),
        "constraints": [{"name": item.name, "type": item.type} for item in obj.constraints],
        "modifiers": [{"name": item.name, "type": item.type,
                       "viewport": item.show_viewport, "render": item.show_render}
                      for item in obj.modifiers],
        "customProperties": {key: str(obj[key]) for key in obj.keys()},
    }
    if obj.type == "MESH":
        points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
        world_points.extend(points)
        entry.update({
            "vertices": len(obj.data.vertices),
            "triangles": sum(max(0, len(face.vertices) - 2) for face in obj.data.polygons),
            "worldBounds": bounds(points),
            "localBounds": bounds([vertex.co for vertex in obj.data.vertices]),
            "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
            "dataAnimation": animation(obj.data),
        })
        mesh_objects.append(entry)
    objects.append(entry)

materials = []
for material in sorted(bpy.data.materials, key=lambda item: item.name):
    nodes = material.node_tree.nodes if material.node_tree else []
    materials.append({
        "name": material.name,
        "diffuseColor": vector(material.diffuse_color),
        "roughness": material.roughness,
        "metallic": material.metallic,
        "surfaceRenderMethod": getattr(material, "surface_render_method", None),
        "useNodes": material.use_nodes,
        "principled": [{
            "name": node.name,
            "baseColor": input_value(node, "Base Color"),
            "roughness": input_value(node, "Roughness"),
            "metallic": input_value(node, "Metallic"),
            "alpha": input_value(node, "Alpha"),
            "transmission": input_value(node, "Transmission Weight"),
        } for node in nodes if node.type == "BSDF_PRINCIPLED"],
        "imageNodes": [{"name": node.name, "image": node.image.name if node.image else None}
                       for node in nodes if node.type == "TEX_IMAGE"],
        "links": [{"fromNode": link.from_node.name, "fromSocket": link.from_socket.name,
                   "toNode": link.to_node.name, "toSocket": link.to_socket.name}
                  for link in material.node_tree.links] if material.node_tree else [],
    })

images = []
for image in sorted(bpy.data.images, key=lambda item: item.name):
    basename = Path(image.filepath.replace("\\", "/")).name
    candidate = source.parent.parent / "textures" / basename
    images.append({
        "name": image.name,
        "filepath": image.filepath,
        "source": image.source,
        "size": vector(image.size),
        "packed": image.packed_file is not None,
        "colorSpace": image.colorspace_settings.name,
        "externalTextureCandidate": str(candidate.relative_to(ROOT)) if candidate.is_relative_to(ROOT) else str(candidate),
        "externalTextureCandidateExists": candidate.exists(),
    })

report = {
    "schemaVersion": 1,
    "source": str(source.relative_to(ROOT)) if source.is_relative_to(ROOT) else str(source),
    "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "inspectionBlenderVersion": bpy.app.version_string,
    "inspectionBlenderBuildHash": bpy.app.build_hash.decode(),
    "embeddedScriptsEnabled": bpy.context.preferences.filepaths.use_scripts_auto_execute,
    "scene": {"name": scene.name, "frameCurrent": scene.frame_current,
              "frameStart": scene.frame_start, "frameEnd": scene.frame_end,
              "unitSystem": scene.unit_settings.system,
              "unitScale": scene.unit_settings.scale_length,
              "lengthUnit": scene.unit_settings.length_unit},
    "worldBoundsSourceUnits": bounds(world_points),
    "counts": {"objects": len(objects), "meshObjects": len(mesh_objects),
               "vertices": sum(obj["vertices"] for obj in mesh_objects),
               "triangles": sum(obj["triangles"] for obj in mesh_objects),
               "materials": len(materials), "images": len(images),
               "actions": len(bpy.data.actions)},
    "actions": [action.name for action in bpy.data.actions],
    "objects": objects,
    "images": images,
    "materials": materials,
}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2) + "\n")
print("SOURCE_INSPECTION " + json.dumps({"output": str(output), "counts": report["counts"],
                                        "scene": report["scene"],
                                        "bounds": report["worldBoundsSourceUnits"]}))
