"""Generate static gallery thumbnails from the shipped GLBs with Python 3.

    python3 scripts/render-aircraft-thumbnails.py

A focused CPU triangle rasterizer for these procedural assets. Uses only the
standard library; no browser, graphics context, server or external images.
"""

from array import array
import json
import math
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/aircraft/thumbnails"
AIRCRAFT = (
    ("cessna-172", "cessna-172/Cessna_172_LOD3.glb"),
    ("cirrus-vision-jet", "cirrus-vision-jet/Cirrus_Vision_Jet_LOD3.glb"),
)
WIDTH, HEIGHT, AA = 640, 400, 2


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def normalize(value):
    length = math.sqrt(dot(value, value)) or 1
    return tuple(component / length for component in value)


def cross(a, b):
    return (a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0])


def load_triangles(path):
    data = path.read_bytes()
    json_size = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20:20 + json_size])
    binary = data[28 + json_size:]

    def accessor(index):
        spec = document["accessors"][index]
        view = document["bufferViews"][spec["bufferView"]]
        component = {5121: "B", 5123: "H", 5125: "I", 5126: "f"}[spec["componentType"]]
        count = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[spec["type"]]
        fmt = "<" + component * count
        stride = view.get("byteStride", struct.calcsize(fmt))
        start = view.get("byteOffset", 0) + spec.get("byteOffset", 0)
        return [struct.unpack_from(fmt, binary, start + i * stride) for i in range(spec["count"])]

    triangles = []

    def visit(index, parent):
        node = document["nodes"][index]
        # All current procedural nodes use translation only. Stop if a future
        # export needs transforms this deliberately small renderer cannot draw.
        if any(key in node for key in ("rotation", "scale", "matrix")):
            raise ValueError("This renderer supports translation-only GLB nodes")
        if node.get("name") == "Propeller_Disc":
            return  # The stopped propeller uses its actual blades in the app.
        offset = tuple(parent[i] + node.get("translation", (0, 0, 0))[i] for i in range(3))
        if "mesh" in node:
            for primitive in document["meshes"][node["mesh"]]["primitives"]:
                if primitive.get("mode", 4) != 4:
                    raise ValueError("Only glTF triangle primitives are supported")
                attributes = primitive["attributes"]
                positions = [tuple(p[i] + offset[i] for i in range(3)) for p in accessor(attributes["POSITION"])]
                normals = accessor(attributes["NORMAL"])
                indices = [entry[0] for entry in accessor(primitive["indices"])]
                material = document["materials"][primitive["material"]]
                color = material["pbrMetallicRoughness"].get("baseColorFactor", (1, 1, 1, 1))[:3]
                # Subpixel tyre tread is represented by a neutral rubber color.
                # The remaining materials use their original GLB base colors.
                if material["name"].endswith("_Tyre"):
                    color = (0.025, 0.028, 0.032)
                for start in range(0, len(indices), 3):
                    ids = indices[start:start + 3]
                    triangles.append(([positions[i] for i in ids], [normals[i] for i in ids], color))
        for child in node.get("children", []):
            visit(child, offset)

    for index in document["scenes"][document.get("scene", 0)]["nodes"]:
        visit(index, (0, 0, 0))
    return triangles


def srgb(value):
    value = max(0, min(1, value))
    return round(255 * (12.92 * value if value <= 0.0031308 else 1.055 * value ** (1 / 2.4) - 0.055))


def render(triangles):
    width, height = WIDTH * AA, HEIGHT * AA
    # glTF coordinates: +Y up, nose -Z. Same front-left view for both families.
    outward = normalize((-0.9, 0.55, -1.0))
    right = normalize(cross((0, 1, 0), outward))
    up = cross(outward, right)
    projected = [[(dot(p, right), dot(p, up), dot(p, outward)) for p in tri[0]] for tri in triangles]
    points = [p for tri in projected for p in tri]
    left, right_edge = min(p[0] for p in points), max(p[0] for p in points)
    bottom, top = min(p[1] for p in points), max(p[1] for p in points)
    scale = min(width / (right_edge - left), height / (top - bottom)) / 1.15
    center_x, center_y = (left + right_edge) / 2, (bottom + top) / 2
    key, fill = normalize((-0.6, 1, -0.7)), normalize((1, 0.4, 0.3))
    half_light = normalize(tuple(key[i] + outward[i] for i in range(3)))
    pixels = bytearray(width * height * 4)
    depths = array("f", [float("-inf")]) * (width * height)

    for projected_tri, (_, normals, color) in zip(projected, triangles):
        p = [((v[0] - center_x) * scale + width / 2, height / 2 - (v[1] - center_y) * scale, v[2]) for v in projected_tri]
        (ax, ay, az), (bx, by, bz), (cx, cy, cz) = p
        denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(denominator) < 1e-9:
            continue
        for y in range(max(0, math.floor(min(v[1] for v in p))), min(height, math.ceil(max(v[1] for v in p)))):
            for x in range(max(0, math.floor(min(v[0] for v in p))), min(width, math.ceil(max(v[0] for v in p)))):
                a = ((by - cy) * (x + 0.5 - cx) + (cx - bx) * (y + 0.5 - cy)) / denominator
                b = ((cy - ay) * (x + 0.5 - cx) + (ax - cx) * (y + 0.5 - cy)) / denominator
                c = 1 - a - b
                if min(a, b, c) < -1e-7:
                    continue
                index = y * width + x
                depth = a * az + b * bz + c * cz
                if depth <= depths[index]:
                    continue
                depths[index] = depth
                normal = normalize(tuple(a * normals[0][i] + b * normals[1][i] + c * normals[2][i] for i in range(3)))
                light = 0.38 + 0.54 * max(0, dot(normal, key)) + 0.18 * max(0, dot(normal, fill))
                specular = 0.07 * max(0, dot(normal, half_light)) ** 28
                offset = index * 4
                pixels[offset:offset + 4] = bytes((*[srgb(channel * light + specular) for channel in color], 255))

    result = bytearray()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            offsets = [((y * AA + sy) * width + x * AA + sx) * 4 for sy in range(AA) for sx in range(AA)]
            covered = [offset for offset in offsets if pixels[offset + 3]]
            color = [round(sum(pixels[offset + channel] for offset in covered) / len(covered)) for channel in range(3)] if covered else [0, 0, 0]
            result.extend((*color, round(255 * len(covered) / (AA * AA))))
    return result


def write_png(path, pixels):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)

    # Sub filtering compresses smooth body colors and transparent margins.
    filtered = bytearray()
    stride = WIDTH * 4
    for y in range(HEIGHT):
        row = pixels[y * stride:(y + 1) * stride]
        filtered.append(1)
        filtered.extend((value - (row[i - 4] if i >= 4 else 0)) & 255 for i, value in enumerate(row))
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", WIDTH, HEIGHT, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(filtered, 9)) + chunk(b"IEND", b"")
    path.write_bytes(data)
    print(f"Generated {path.relative_to(ROOT)} ({len(data):,} bytes)", flush=True)


OUTPUT.mkdir(parents=True, exist_ok=True)
for family_id, source in AIRCRAFT:
    write_png(OUTPUT / f"{family_id}.png", render(load_triangles(ROOT / "public/aircraft" / source)))
