"""
Tile PNGs into one sheet, so two things can be looked at side by side.

    blender -b --factory-startup --python montage.py -- \
        <out.png> <cols> <in1.png> <in2.png> ...

Comparing renders one after another hides differences that sitting them next
to each other makes obvious - which is the whole point of the drawing overlays
as well.
"""
import bpy, sys
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
OUT, COLS, SRCS = argv[0], int(argv[1]), argv[2:]
PAD = 12


def load(path):
    im = bpy.data.images.load(path)
    w, h = im.size
    buf = np.empty(w * h * im.channels, dtype=np.float32)
    im.pixels.foreach_get(buf)
    a = buf.reshape(h, w, im.channels)[::-1]
    bpy.data.images.remove(im)
    if a.shape[2] == 3:
        a = np.concatenate([a, np.ones(a.shape[:2] + (1,), np.float32)], axis=2)
    rgb = a[..., :3] * a[..., 3:4] + (1.0 - a[..., 3:4])   # flatten onto white
    return rgb


tiles = [load(p) for p in SRCS]
rows = (len(tiles) + COLS - 1) // COLS
cw = max(t.shape[1] for t in tiles)
ch = max(t.shape[0] for t in tiles)
W = COLS * cw + (COLS + 1) * PAD
H = rows * ch + (rows + 1) * PAD
sheet = np.ones((H, W, 3), np.float32) * 0.93

for i, t in enumerate(tiles):
    r, c = divmod(i, COLS)
    y = PAD + r * (ch + PAD) + (ch - t.shape[0]) // 2
    x = PAD + c * (cw + PAD) + (cw - t.shape[1]) // 2
    sheet[y:y + t.shape[0], x:x + t.shape[1]] = t

out = np.concatenate([sheet, np.ones((H, W, 1), np.float32)], axis=2)
img = bpy.data.images.new("sheet", W, H, alpha=True)
img.pixels = out[::-1].ravel().tolist()
img.filepath_raw = OUT
img.file_format = 'PNG'
img.save()
print("###SHEET###", OUT, W, H)
