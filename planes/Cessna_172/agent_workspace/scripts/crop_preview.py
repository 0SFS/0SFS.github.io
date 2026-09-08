"""Preview a crop box of a reference drawing so it can be dialled in."""
import bpy, sys
import numpy as np
a = sys.argv[sys.argv.index("--")+1:]
src, dst = a[0], a[1]
X0,Y0,X1,Y1 = [int(v) for v in a[2:6]]
im = bpy.data.images.load(src); w,h = im.size
arr = np.array(im.pixels[:], dtype=np.float32).reshape(h,w,4)[::-1]
print("FULL SIZE", w, h)
c = arr[Y0:Y1, X0:X1].copy()
lum = c[...,:3].mean(axis=2); ink = lum < 0.55
ys,xs = np.nonzero(ink)
print("INK BBOX in crop:", xs.min(), ys.min(), xs.max(), ys.max(),
      "size", xs.max()-xs.min()+1, ys.max()-ys.min()+1)
ZOOM = int(a[6]) if len(a)>6 else 1
if ZOOM>1:
    c = np.repeat(np.repeat(c, ZOOM, axis=0), ZOOM, axis=1)
out = bpy.data.images.new("c", c.shape[1], c.shape[0], alpha=True)
out.pixels = c[::-1].ravel().tolist(); out.filepath_raw = dst; out.file_format='PNG'; out.save()
print("SAVED", dst)
