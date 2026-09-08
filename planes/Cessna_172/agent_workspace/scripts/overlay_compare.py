"""
Register a canonical render against a scanned 3-view drawing and overlay them,
so deviations are measured rather than eyeballed.

    blender -b --factory-startup --python overlay_compare.py -- \
        --drawing <png> --crop x0 y0 x1 y1 --render <png> --out <png> [--flipdraw]

The drawing crop and the render are each reduced to an ink/silhouette mask, their
bounding boxes are matched, and the render mask is drawn in red over the drawing.
Crop coordinates are in image pixels with (0,0) at the TOP-LEFT.
"""
import bpy, sys, os
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
def arg(n, d=None):
    return argv[argv.index(n) + 1] if n in argv else d

DRAW = arg("--drawing")
REND = arg("--render")
OUT  = arg("--out")
c = argv[argv.index("--crop") + 1: argv.index("--crop") + 5]
X0, Y0, X1, Y1 = [int(v) for v in c]
FIT = arg("--fit", "both")           # both | x | y
ANCHOR = arg("--anchor", "bbox")     # bbox | right | left


def load_rgb(path):
    """Load an image as a top-left-origin float array (h, w, 4)."""
    im = bpy.data.images.load(path)
    w, h = im.size
    a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
    bpy.data.images.remove(im)
    return a[::-1]                    # flip to top-left origin


def save_rgb(a, path):
    h, w = a.shape[:2]
    img = bpy.data.images.new("out", w, h, alpha=True)
    img.pixels = a[::-1].ravel().tolist()
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()


def bbox(mask):
    ys, xs = np.nonzero(mask)
    return xs.min(), ys.min(), xs.max(), ys.max()


# ---- drawing: ink = dark pixels inside the crop -----------------------------
d = load_rgb(DRAW)[Y0:Y1, X0:X1]
lum = d[..., :3].mean(axis=2)
ink = lum < 0.55
print("DRAW crop", d.shape, "ink px", int(ink.sum()))
dx0, dy0, dx1, dy1 = bbox(ink)
print("DRAW ink bbox (in crop)", dx0, dy0, dx1, dy1, "size", dx1 - dx0 + 1, dy1 - dy0 + 1)

# ---- render: silhouette = alpha (rendered on a transparent film) ------------
r = load_rgb(REND)
sil = r[..., 3] > 0.35
rx0, ry0, rx1, ry1 = bbox(sil)
print("REND sil bbox", rx0, ry0, rx1, ry1, "size", rx1 - rx0 + 1, ry1 - ry0 + 1)

# ---- map render bbox onto drawing bbox -------------------------------------
sx = (dx1 - dx0) / max(1, (rx1 - rx0))
sy = (dy1 - dy0) / max(1, (ry1 - ry0))
if FIT == "x":
    sy = sx
elif FIT == "y":
    sx = sy
print(f"scale x={sx:.4f} y={sy:.4f} (ratio {sx/sy:.4f})")

H, W = d.shape[:2]
out = np.ones((H, W, 4), dtype=np.float32)
out[..., :3] = d[..., :3]

# nearest-neighbour sample the render mask into drawing space
ax_d, ax_r = (dx0, rx0)
if ANCHOR == "right":
    ax_d, ax_r = (dx1, rx1)
yy, xx = np.mgrid[0:H, 0:W]
src_x = np.rint((xx - ax_d) / sx + ax_r).astype(np.int32)
src_y = np.rint((yy - dy0) / sy + ry0).astype(np.int32)
valid = (src_x >= 0) & (src_x < sil.shape[1]) & (src_y >= 0) & (src_y < sil.shape[0])
m = np.zeros((H, W), dtype=bool)
m[valid] = sil[src_y[valid], src_x[valid]]

# red 50% overlay; keep the drawing's black lines readable on top
out[m, 0] = 0.95
out[m, 1] = 0.15 + 0.5 * out[m, 1]
out[m, 2] = 0.15 + 0.5 * out[m, 2]
out[ink & m, :3] = np.array([0.35, 0.0, 0.0])
out[ink & ~m, :3] = 0.0

save_rgb(out, OUT)
print("###OVERLAY###", OUT)
