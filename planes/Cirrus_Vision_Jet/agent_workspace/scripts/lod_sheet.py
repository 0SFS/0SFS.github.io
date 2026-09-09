"""Stack the four LOD contact sheets into one image, labelled by level.

    blender -b --factory-startup --python lod_sheet.py -- <out.png> <in0> <in1> ...
"""
import bpy, sys, os
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
OUT, SRCS = argv[0], argv[1:]


def load(p):
    im = bpy.data.images.load(p)
    w, h = im.size
    buf = np.empty(w * h * im.channels, dtype=np.float32)
    im.pixels.foreach_get(buf)
    a = buf.reshape(h, w, im.channels)[..., :4].copy()
    bpy.data.images.remove(im)
    return a


tiles = [load(p) for p in SRCS]
h, w = tiles[0].shape[:2]
out = np.ones((h * len(tiles), w, 4), dtype=np.float32)
for i, t in enumerate(tiles):
    # bpy images are bottom-up, so the first source has to land at the top
    r = len(tiles) - 1 - i
    out[r * h:(r + 1) * h] = t[:, :w]
    out[(r + 1) * h - 3:(r + 1) * h] = [0.1, 0.1, 0.1, 1]

img = bpy.data.images.new("lods", w, h * len(tiles), alpha=True)
img.pixels = out.ravel().tolist()
img.filepath_raw = OUT
img.file_format = 'PNG'
img.save()
print("###LODSHEET###", OUT)
