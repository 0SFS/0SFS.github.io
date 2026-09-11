"""
Crop a reference image, stretch its contrast, and enlarge it, so faint panel
lines can be read.

    blender -b --factory-startup --python enhance_crop.py -- \
        <image> <out.png> x0 y0 x1 y1 [--scale N] [--grey] [--clip P]

x0 y0 x1 y1 are top-down pixels of the source. The stretch maps the P-th and
(100 - P)-th percentiles of the crop to black and white (default P = 1), per
channel unless --grey collapses it to luminance first; a panel seam that is two
grey levels off its neighbours in the source comes out as a visible line.
Enlargement is nearest-neighbour, so every source pixel stays a square you can
count, which is the point: this is for measuring, not for looking at.
"""
import bpy, sys
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
x0, y0, x1, y1 = (int(v) for v in argv[2:6])
SCALE = int(argv[argv.index("--scale") + 1]) if "--scale" in argv else 4
CLIP = float(argv[argv.index("--clip") + 1]) if "--clip" in argv else 1.0
GREY = "--grey" in argv

im = bpy.data.images.load(src)
w, h = im.size
a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]   # top-down
c = a[y0:y1, x0:x1, :3]
if GREY:
    c = np.repeat((c @ np.array([0.2126, 0.7152, 0.0722]))[..., None], 3, axis=2)
lo = np.percentile(c, CLIP, axis=(0, 1))
hi = np.percentile(c, 100.0 - CLIP, axis=(0, 1))
c = np.clip((c - lo) / np.maximum(hi - lo, 1e-6), 0.0, 1.0)
c = np.repeat(np.repeat(c, SCALE, axis=0), SCALE, axis=1)
ch, cw = c.shape[:2]
rgba = np.concatenate([c, np.ones((ch, cw, 1), dtype=np.float32)], axis=2)[::-1]
img = bpy.data.images.new("crop", cw, ch, alpha=False)
img.pixels = rgba.ravel().tolist()
img.filepath_raw = out
img.file_format = 'PNG'
img.save()
print("###CROP###", out, cw, ch)
