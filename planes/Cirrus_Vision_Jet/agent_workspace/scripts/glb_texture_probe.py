"""
Read the texels a GLB actually ships, without Blender or PIL.

    python3 glb_texture_probe.py <model.glb> [--row N] [x ...]

Prints one row of each embedded PNG (default: the middle one, which runs through
the hub of both halves of the tyre atlas) at the given x positions (default: the
two ends and the middle), as 0-255 sRGB bytes, and each texture's sampler. Written because the only way to
know what a viewer will draw is to read the file it will draw from: Blender's
own renders re-interpret an image through its colour space, and a texture that
looks right in Blender can still be encoded twice in the export.
"""
import json, struct, sys, zlib


def png_rows(data):
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    i, idat, w = 8, b"", None
    while i < len(data):
        n = struct.unpack(">I", data[i:i + 4])[0]
        kind = data[i + 4:i + 8]
        body = data[i + 8:i + 8 + n]
        if kind == b"IHDR":
            w, h, depth, ctype = struct.unpack(">IIBB", body[:10])
            chans = {2: 3, 6: 4, 0: 1, 4: 2}[ctype]
        elif kind == b"IDAT":
            idat += body
        i += 12 + n
    raw = zlib.decompress(idat)
    stride = w * chans
    rows, prev = [], bytearray(stride)
    for r in range(h):
        f = raw[r * (stride + 1)]
        line = bytearray(raw[r * (stride + 1) + 1:(r + 1) * (stride + 1)])
        for x in range(stride):
            a = line[x - chans] if x >= chans else 0
            b = prev[x]
            c = prev[x - chans] if x >= chans else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        rows.append(line)
        prev = line
    return w, chans, rows


args = sys.argv[1:]
ROW = None
if "--row" in args:
    i = args.index("--row")
    ROW = int(args[i + 1])
    del args[i:i + 2]
glb = open(args[0], "rb").read()
jlen = struct.unpack("<I", glb[12:16])[0]
gltf = json.loads(glb[20:20 + jlen])
bin_start = 20 + jlen + 8
for img in gltf.get("images", []):
    view = gltf["bufferViews"][img["bufferView"]]
    off = bin_start + view.get("byteOffset", 0)
    w, chans, rows = png_rows(glb[off:off + view["byteLength"]])
    xs = [int(v) for v in args[1:]] or [0, w // 2, w - 1]
    row = len(rows) // 2 if ROW is None else ROW
    print(f"{img.get('name', '?')}: {w} x {len(rows)} px, {chans} channels, row {row}")
    for x in xs:
        print(f"  x={x:3d}  " + " ".join(str(rows[row][x * chans + c]) for c in range(min(3, chans))))
for tex in gltf.get("textures", []):
    sampler = gltf.get("samplers", [{}])[tex.get("sampler", 0)] if "sampler" in tex else {}
    print("sampler", {k: sampler.get(k) for k in ("wrapS", "wrapT", "magFilter", "minFilter")})
