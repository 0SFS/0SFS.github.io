"""Stack the reference-drawing side view above the final render for comparison."""
import bpy, sys
import numpy as np
a = sys.argv[sys.argv.index("--")+1:]
draw, crop, rend, out = a[0], a[1:5], a[5], a[6]
X0,Y0,X1,Y1 = [int(v) for v in crop]
def load(p):
    im = bpy.data.images.load(p); w,h = im.size
    arr = np.array(im.pixels[:], np.float32).reshape(h,w,4)[::-1]
    bpy.data.images.remove(im); return arr
d = load(draw)[Y0:Y1, X0:X1]
r = load(rend)
# scale the drawing to the render width
W = r.shape[1]
sc = W / d.shape[1]
H = int(d.shape[0]*sc)
yy, xx = np.mgrid[0:H, 0:W]
d2 = d[np.clip((yy/sc).astype(int), 0, d.shape[0]-1), np.clip((xx/sc).astype(int), 0, d.shape[1]-1)]
out_a = np.ones((H + r.shape[0], W, 4), np.float32)
out_a[:H] = d2; out_a[H:] = r
img = bpy.data.images.new("sbs", W, out_a.shape[0], alpha=True)
img.pixels = out_a[::-1].ravel().tolist(); img.filepath_raw = out; img.file_format='PNG'; img.save()
print("###SBS###", out)
