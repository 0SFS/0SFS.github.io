#!/usr/bin/env python3
"""Measure a FlightGear aircraft's 3D model, and optionally convert its exterior.

    python3 scripts/validation/aircraft/survey-flightgear-model.py dhc6 --variant dhc6jsb --glb

Reads the package the same way scan-flightgear-aircraft.py beside it does - with
HTTP range requests, fetching only the model XML, the AC3D files and, for
--glb, the PNG/JPEG textures. It walks the model XML tree from <sim><model>
<path>, counts triangles in every AC3D file it reaches, and splits them into
exterior, cockpit/cabin, and equipment/effects by where each file lives. It
also lists what each rotate/spin/translate animation drives and from which
property, which is what an automatic rig mapping would work from.

With --glb it writes the exterior files as one GLB in 0sfs's export convention
(+X starboard, +Y up, +Z aft; see docs/aircraft-assets.md), one node per AC3D
object with its name kept. This is a feasibility converter: transforms are
baked into the vertices, polygons are fan-triangulated, SGI .rgb and DDS
textures fall back to the material colour, and select/range animations are
ignored, so optional parts such as floats may appear together with wheels.

Output goes to a new dated folder under build/fg-aircraft-inventory/models/
unless --out is given.
"""

from __future__ import annotations

import argparse
import datetime
import importlib.util
import json
import math
import posixpath
import re
import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("scan", HERE / "scan-flightgear-aircraft.py")
scan = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(scan)

DEFAULT_BASE = "https://fgaddon.b-cdn.net/Aircraft-trunk/"
INTERIOR = re.compile(r"(flight-?deck|cockpit|interior|cabin|panel|instrument|pilot|crew|seat|yoke|pedal|hud|mfd|pfd|avionics|gauge)", re.I)
EXTRAS = re.compile(r"(equipment|ground-?services|chock|tie-?down|cover|effect|light|shadow|cone|procedural|smoke|contrail|particle|tanker|truck|ladder|wingman|pushback|walker|marker)", re.I)


# --- model XML tree --------------------------------------------------------

def walk_model(package, xml_member: str, offsets: dict, depth: int, out: dict):
    if depth > 12:
        return
    root = scan.parse_xml(package.read(xml_member))
    if root is None:
        out["problems"].append(f"unparseable {package.relative(xml_member)}")
        return
    base = posixpath.dirname(package.relative(xml_member))

    def resolve(path: str) -> str | None:
        return package.find(posixpath.join(base, path)) or package.find(path)

    for element in [root, *root.iter()]:
        include = element.get("include")
        if include and (target := resolve(include)):
            walk_model(package, target, offsets, depth + 1, out)
    path = scan.text_of(root, "path")
    if path:
        target = resolve(path)
        if target and target.lower().endswith(".ac"):
            out["ac"].append({"file": package.relative(target), "from": package.relative(xml_member), "offsets": offsets})
        elif path and not target:
            out["missing"].append(path)
    for animation in root.findall("animation"):
        kind = scan.text_of(animation, "type") or "?"
        objects = [o.text.strip() for o in animation.findall("object-name") if o.text]
        prop = scan.text_of(animation, "property") or scan.text_of(animation, "expression/property") or ""
        out["animations"].append({"type": kind, "objects": objects, "property": prop, "file": package.relative(xml_member)})
    for model in root.findall("model"):
        sub_path = scan.text_of(model, "path")
        if not sub_path:
            continue
        target = resolve(sub_path)
        if not target:
            out["missing"].append(sub_path)
            continue
        sub = dict(offsets)
        o = model.find("offsets")
        if o is not None:
            for key in ("x-m", "y-m", "z-m"):
                value = number(scan.text_of(o, key))
                if value is not None:
                    sub[key] = sub.get(key, 0.0) + value
            for key in ("pitch-deg", "roll-deg", "heading-deg"):
                value = number(scan.text_of(o, key))
                if value is not None and abs(value) > 1e-6:
                    sub.setdefault("rotated", []).append(package.relative(target))
        if target.lower().endswith(".ac"):
            out["ac"].append({"file": package.relative(target), "from": package.relative(xml_member), "offsets": sub})
        else:
            walk_model(package, target, sub, depth + 1, out)


# --- AC3D -------------------------------------------------------------------

def parse_ac(text: str) -> tuple[list[dict], list[dict]]:
    """Materials and a flat list of objects with world-baked vertices, AC3D frame."""
    raw_lines = text.splitlines()
    position = 0
    materials: list[dict] = []
    objects: list[dict] = []

    def next_line() -> str:
        nonlocal position
        while position < len(raw_lines):
            line = raw_lines[position].strip()
            position += 1
            if line:
                return line
        raise EOFError

    def quoted(line: str) -> str:
        match = re.search(r'"([^"]*)"', line)
        return match.group(1) if match else line.split(None, 1)[1] if " " in line else ""

    header = next_line()
    if not header.startswith("AC3D"):
        raise ValueError("not an AC3D file")

    def read_object(parent_rot, parent_loc):
        nonlocal position
        obj = {"name": "", "texture": None, "texrep": (1.0, 1.0), "texoff": (0.0, 0.0), "surfaces": [], "verts": []}
        rot = [1, 0, 0, 0, 1, 0, 0, 0, 1]
        loc = [0.0, 0.0, 0.0]
        local_verts = []
        kids = 0
        while True:
            line = next_line()
            key = line.split(None, 1)[0]
            if key == "name":
                obj["name"] = quoted(line)
            elif key == "data":
                # The count is of bytes in the block, which may hold blank
                # lines and leading space that next_line() would drop.
                length = int(line.split()[1])
                consumed = 0
                while consumed < length and position < len(raw_lines):
                    consumed += len(raw_lines[position]) + 1
                    position += 1
            elif key == "texture":
                obj["texture"] = quoted(line)
            elif key == "texrep":
                obj["texrep"] = tuple(map(float, line.split()[1:3]))
            elif key == "texoff":
                obj["texoff"] = tuple(map(float, line.split()[1:3]))
            elif key == "rot":
                rot = list(map(float, line.split()[1:10]))
            elif key == "loc":
                loc = list(map(float, line.split()[1:4]))
            elif key == "numvert":
                for _ in range(int(line.split()[1])):
                    local_verts.append(tuple(map(float, next_line().split()[:3])))
            elif key == "numsurf":
                for _ in range(int(line.split()[1])):
                    flags = int(next_line().split()[1], 0)
                    material = 0
                    refs = []
                    while True:
                        entry = next_line()
                        head = entry.split(None, 1)[0]
                        if head == "mat":
                            material = int(entry.split()[1])
                        elif head == "refs":
                            for _ in range(int(entry.split()[1])):
                                parts = next_line().split()
                                refs.append((int(parts[0]), float(parts[1]) if len(parts) > 1 else 0.0,
                                             float(parts[2]) if len(parts) > 2 else 0.0))
                            break
                    obj["surfaces"].append({"type": flags & 0x0F, "two_sided": bool(flags & 0x20), "mat": material, "refs": refs})
            elif key == "kids":
                kids = int(line.split()[1])
                break
        # Compose with the parent: world = parent_rot * (rot * v + loc) + parent_loc.
        def apply(matrix, v):
            return (matrix[0]*v[0] + matrix[1]*v[1] + matrix[2]*v[2],
                    matrix[3]*v[0] + matrix[4]*v[1] + matrix[5]*v[2],
                    matrix[6]*v[0] + matrix[7]*v[1] + matrix[8]*v[2])
        world_loc = tuple(a + b for a, b in zip(apply(parent_rot, loc), parent_loc))
        world_rot = [sum(parent_rot[r*3 + k] * rot[k*3 + c] for k in range(3)) for r in range(3) for c in range(3)]
        obj["verts"] = [tuple(a + b for a, b in zip(apply(world_rot, v), world_loc)) for v in local_verts]
        obj["triangles"] = sum(max(0, len(s["refs"]) - 2) for s in obj["surfaces"] if s["type"] == 0)
        objects.append(obj)
        for _ in range(kids):
            line = next_line()
            if not line.startswith("OBJECT"):
                raise ValueError(f"expected OBJECT, got {line[:40]}")
            read_object(world_rot, world_loc)

    while True:
        try:
            line = next_line()
        except EOFError:
            break
        if line.startswith("MATERIAL"):
            number = r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?"
            numbers = re.findall(rf"(rgb|amb|emis|spec|shi|trans)\s+({number}(?:\s+{number})*)", line)
            material = {"name": quoted(line)}
            for name, values in numbers:
                material[name] = [float(v) for v in values.split()]
            materials.append(material)
        elif line.startswith("OBJECT"):
            read_object([1, 0, 0, 0, 1, 0, 0, 0, 1], (0.0, 0.0, 0.0))
    return materials, objects


def ac_to_gltf(point, offsets):
    """AC3D (x aft, y up, z left) plus FlightGear offsets -> glTF (+X starboard, +Y up, +Z aft).

    FlightGear loads .ac files rotated +90 degrees about X, so its model frame
    (x aft, y right, z up) is (x_ac, -z_ac, y_ac). 0sfs's export frame is that
    frame's (y, z, x). Both steps are rotations, never mirrors.
    """
    x_fg = point[0] + offsets.get("x-m", 0.0)
    y_fg = -point[2] + offsets.get("y-m", 0.0)
    z_fg = point[1] + offsets.get("z-m", 0.0)
    return (y_fg, z_fg, x_fg)


# --- GLB --------------------------------------------------------------------

def write_glb(path: Path, parts: list[tuple[dict, list[dict], dict, dict]]):
    """parts: (object, materials, offsets, textures-by-name) - one glTF node each."""
    buffer = bytearray()
    views, accessors, meshes, nodes, gltf_materials, images, textures = [], [], [], [], [], [], []
    material_index: dict = {}
    image_index: dict = {}

    def add_view(data: bytes, target=None) -> int:
        while len(buffer) % 4:
            buffer.append(0)
        views.append({"buffer": 0, "byteOffset": len(buffer), "byteLength": len(data), **({"target": target} if target else {})})
        buffer.extend(data)
        return len(views) - 1

    def material_for(material: dict, texture_name: str | None, texture_data: bytes | None) -> int:
        key = (material.get("name"), tuple(material.get("rgb", [0.8] * 3)), material.get("trans", [0])[0], texture_name if texture_data else None)
        if key in material_index:
            return material_index[key]
        rgb = material.get("rgb", [0.8, 0.8, 0.8])
        alpha = 1.0 - material.get("trans", [0.0])[0]
        pbr = {"baseColorFactor": [*rgb, alpha], "metallicFactor": 0.0, "roughnessFactor": 0.7}
        entry = {"name": material.get("name") or "ac", "pbrMetallicRoughness": pbr, "doubleSided": True}
        if texture_data:
            if texture_name not in image_index:
                mime = "image/png" if texture_data[:4] == b"\x89PNG" else "image/jpeg"
                images.append({"bufferView": add_view(texture_data), "mimeType": mime, "name": texture_name})
                textures.append({"source": len(images) - 1})
                image_index[texture_name] = len(textures) - 1
            pbr["baseColorTexture"] = {"index": image_index[texture_name]}
            pbr["baseColorFactor"] = [1.0, 1.0, 1.0, alpha]
        if alpha < 0.999:
            entry["alphaMode"] = "BLEND"
        gltf_materials.append(entry)
        material_index[key] = len(gltf_materials) - 1
        return material_index[key]

    for obj, materials, offsets, texture_bytes in parts:
        by_material: dict[int, list] = {}
        for surface in obj["surfaces"]:
            if surface["type"] != 0 or len(surface["refs"]) < 3:
                continue
            by_material.setdefault(surface["mat"], []).append(surface["refs"])
        primitives = []
        for mat, polygons in by_material.items():
            positions, uvs, indices = [], [], []
            for refs in polygons:
                start = len(positions)
                for vertex, u, v in refs:
                    positions.append(ac_to_gltf(obj["verts"][vertex], offsets))
                    uvs.append((u * obj["texrep"][0] + obj["texoff"][0], 1.0 - (v * obj["texrep"][1] + obj["texoff"][1])))
                for i in range(1, len(refs) - 1):
                    indices.extend((start, start + i, start + i + 1))
            if not indices:
                continue
            minimum = [min(p[i] for p in positions) for i in range(3)]
            maximum = [max(p[i] for p in positions) for i in range(3)]
            position_view = add_view(struct.pack(f"<{len(positions) * 3}f", *[c for p in positions for c in p]), 34962)
            accessors.append({"bufferView": position_view, "componentType": 5126, "count": len(positions), "type": "VEC3", "min": minimum, "max": maximum})
            attributes = {"POSITION": len(accessors) - 1}
            texture_data = texture_bytes.get(obj["texture"]) if obj["texture"] else None
            if texture_data:
                uv_view = add_view(struct.pack(f"<{len(uvs) * 2}f", *[c for p in uvs for c in p]), 34962)
                accessors.append({"bufferView": uv_view, "componentType": 5126, "count": len(uvs), "type": "VEC2"})
                attributes["TEXCOORD_0"] = len(accessors) - 1
            index_view = add_view(struct.pack(f"<{len(indices)}I", *indices), 34963)
            accessors.append({"bufferView": index_view, "componentType": 5125, "count": len(indices), "type": "SCALAR"})
            material = materials[mat] if mat < len(materials) else {}
            primitives.append({"attributes": attributes, "indices": len(accessors) - 1,
                               "material": material_for(material, obj["texture"], texture_data)})
        if primitives:
            meshes.append({"name": obj["name"], "primitives": primitives})
            nodes.append({"name": obj["name"] or f"object{len(nodes)}", "mesh": len(meshes) - 1})
    document = {
        "asset": {"version": "2.0", "generator": "0sfs survey-flightgear-model.py (feasibility converter)"},
        "scene": 0, "scenes": [{"nodes": list(range(len(nodes)))}], "nodes": nodes, "meshes": meshes,
        "materials": gltf_materials, "accessors": accessors, "bufferViews": views,
        "buffers": [{"byteLength": len(buffer)}],
    }
    if images:
        document["images"] = images
        document["textures"] = textures
    json_bytes = json.dumps(document, separators=(",", ":")).encode()
    json_bytes += b" " * (-len(json_bytes) % 4)
    while len(buffer) % 4:
        buffer.append(0)
    with path.open("wb") as handle:
        handle.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(json_bytes) + 8 + len(buffer)))
        handle.write(struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes)
        handle.write(struct.pack("<II", len(buffer), 0x004E4942) + bytes(buffer))


# --- main -------------------------------------------------------------------

def number(text: str | None) -> float | None:
    """Offsets are sometimes written with a unit, "0.235598 m"; take the number."""
    match = re.match(r"\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)", text or "")
    return float(match.group(1)) if match else None


def classify(path: str) -> str:
    if INTERIOR.search(path):
        return "interior"
    if EXTRAS.search(path):
        return "extras"
    return "exterior"


def survey(package_id: str, directory: str, variant: str, base: str, glb: Path | None, exterior_only: bool = False,
           zip_name: str | None = None) -> dict:
    """zip_name is the catalogue's <url> for the package; it is not always <id>.zip."""
    package = scan.Package(base + (zip_name or f"{package_id}.zip"), directory)
    info, problems = scan.load_set_file(package, variant)
    model_path = info.get("model_path")
    result = {"package": package_id, "variant": variant, "model_path": model_path, "problems": problems}
    if not model_path:
        result["problems"].append("no <sim><model><path>")
        return result
    start = package.find(model_path)
    if not start:
        result["problems"].append(f"model {model_path} not in package")
        return result
    tree = {"ac": [], "animations": [], "missing": [], "problems": []}
    if start.lower().endswith(".ac"):
        tree["ac"].append({"file": package.relative(start), "from": "-set.xml", "offsets": {}})
    else:
        walk_model(package, start, {}, 0, tree)
    seen = set()
    files = []
    totals = {"exterior": 0, "interior": 0, "extras": 0}
    sizes = {"exterior": 0, "interior": 0, "extras": 0}
    parts = []
    texture_cache: dict[str, bytes | None] = {}
    for entry in tree["ac"]:
        key = (entry["file"], json.dumps(entry["offsets"], sort_keys=True))
        if key in seen:
            continue
        seen.add(key)
        member = package.find(entry["file"])
        category = classify(entry["file"])
        sizes[category] += package.members[member].file_size
        if exterior_only and category != "exterior":
            files.append({"file": entry["file"], "category": category, "bytes": package.members[member].file_size})
            continue
        try:
            materials, objects = parse_ac(package.read(member).decode("latin-1"))
        except Exception as error:  # noqa: BLE001 - recorded
            result["problems"].append(f"{entry['file']}: {type(error).__name__}: {error}")
            continue
        triangles = sum(o["triangles"] for o in objects)
        totals[category] += triangles
        files.append({"file": entry["file"], "category": category, "triangles": triangles, "objects": len(objects),
                      "bytes": package.members[member].file_size})
        if glb and category == "exterior":
            textures: dict[str, bytes | None] = {}
            for obj in objects:
                name = obj["texture"]
                if not name or name in textures:
                    continue
                if name not in texture_cache:
                    found = package.find(posixpath.join(posixpath.dirname(entry["file"]), name)) or package.find(name)
                    data = package.read(found) if found else None
                    texture_cache[name] = data if data and (data[:4] == b"\x89PNG" or data[:2] == b"\xff\xd8") else None
                textures[name] = texture_cache[name]
            for obj in objects:
                parts.append((obj, materials, entry["offsets"], textures))
    result.update({
        "triangles": totals, "ac_bytes": sizes, "exterior_only": exterior_only,
        "files": sorted(files, key=lambda f: -f.get("triangles", 0)),
        "missing": sorted(set(tree["missing"])), "problems": result["problems"] + tree["problems"],
        "animations": summarise_animations(tree["animations"]),
        "bytes_fetched": package.remote.bytes_fetched,
    })
    if glb:
        write_glb(glb, parts)
        result["glb"] = str(glb)
        result["glb_textured_parts"] = sum(1 for p in parts if p[0]["texture"] and p[3].get(p[0]["texture"]))
    return result


def summarise_animations(animations: list[dict]) -> dict:
    """What a rig mapping would work from: which properties move which objects."""
    groups = {
        "control surfaces": re.compile(r"surface-positions|elevator|aileron|rudder|flap|spoiler|speedbrake", re.I),
        "gear retraction": re.compile(r"gear\[\d+\]/position-norm|gear/position-norm", re.I),
        "gear compression/steering": re.compile(r"compression|steering|caster", re.I),
        "propeller/rotor spin": re.compile(r"rpm|rotor|propeller|n1|n2", re.I),
        "doors/canopy": re.compile(r"door|canopy|hatch", re.I),
    }
    summary: dict[str, dict] = {name: {"animations": 0, "objects": set(), "properties": set()} for name in groups}
    summary["other"] = {"animations": 0, "objects": set(), "properties": set()}
    kinds: dict[str, int] = {}
    for animation in animations:
        kinds[animation["type"]] = kinds.get(animation["type"], 0) + 1
        if animation["type"] not in ("rotate", "spin", "translate"):
            continue
        name = next((n for n, pattern in groups.items() if pattern.search(animation["property"])), "other")
        summary[name]["animations"] += 1
        summary[name]["objects"].update(animation["objects"])
        summary[name]["properties"].add(animation["property"])
    return {"by_type": kinds, **{name: {"animations": s["animations"], "objects": sorted(s["objects"])[:30],
                                        "properties": sorted(s["properties"])[:20]} for name, s in summary.items() if s["animations"]}}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("package", help="catalogue package id, e.g. dhc6")
    parser.add_argument("--dir", help="package directory inside the zip (default: the package id)")
    parser.add_argument("--zip", help="the package's zip name from the catalogue (default: <package>.zip)")
    parser.add_argument("--variant", help="variant id whose -set.xml to read (default: the package id)")
    parser.add_argument("--base", default=DEFAULT_BASE)
    parser.add_argument("--glb", action="store_true", help="also write the exterior as a GLB")
    parser.add_argument("--exterior-only", action="store_true",
                        help="parse only exterior AC3D files; report the others by size")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    if args.out:
        out = args.out
    else:
        stamp = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
        out = HERE.parents[2] / "build" / "fg-aircraft-inventory" / "models" / stamp
    out.mkdir(parents=True, exist_ok=True)
    variant = args.variant or args.package
    glb = out / f"{variant}-exterior.glb" if args.glb else None
    result = survey(args.package, args.dir or args.package, variant, args.base, glb, args.exterior_only, args.zip)
    (out / f"{variant}-model.json").write_text(json.dumps(result, indent=1))
    t = result.get("triangles", {})
    b = result.get("ac_bytes", {})
    if args.exterior_only:
        print(f"{variant}: exterior {t.get('exterior', 0):,} triangles; cockpit+cabin {b.get('interior', 0) / 1e6:.1f} MB, "
              f"equipment+effects {b.get('extras', 0) / 1e6:.1f} MB of AC3D not parsed -> {out}")
    else:
        print(f"{variant}: exterior {t.get('exterior', 0):,} / cockpit+cabin {t.get('interior', 0):,} / "
              f"equipment+effects {t.get('extras', 0):,} triangles -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
