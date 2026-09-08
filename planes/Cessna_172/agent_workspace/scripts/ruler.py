"""Draw a labelled pixel ruler over a crop so landmark coordinates can be read off."""
import bpy, sys
import numpy as np
a = sys.argv[sys.argv.index("--")+1:]
src, dst = a[0], a[1]
X0,Y0,X1,Y1 = [int(v) for v in a[2:6]]
STEP = int(a[6]) if len(a)>6 else 20
im = bpy.data.images.load(src); w,h = im.size
arr = np.array(im.pixels[:], dtype=np.float32).reshape(h,w,4)[::-1]
c = arr[Y0:Y1, X0:X1, :3].copy()
c = np.dstack([c, np.ones(c.shape[:2], np.float32)])
H,W = c.shape[:2]
for x in range(0, W, STEP):
    ax = X0 + x
    col = [1,0,0,1] if (ax % (STEP*5) == 0) else [0.3,0.7,1,1]
    c[:, x] = col
    if ax % (STEP*5) == 0:
        c[:6, max(0,x-1):x+2] = [0,0.6,0,1]
for y in range(0, H, STEP):
    ay = Y0 + y
    col = [1,0,0,1] if (ay % (STEP*5) == 0) else [0.3,0.7,1,1]
    c[y, :] = col
out = bpy.data.images.new("r", W, H, alpha=True)
out.pixels = c[::-1].ravel().tolist(); out.filepath_raw = dst; out.file_format='PNG'; out.save()
print("SAVED", dst, "origin", X0, Y0, "step", STEP, "red every", STEP*5)
