"""
Regenerate the reference crops used for measurement, into measurements/crops/.

    blender -b --factory-startup --python make_crops.py --

Every crop is a region of `measurements/ref_SF50_three_view_1200dpi.png` or of
one of the reference photographs, so this is reproducible from what is in the
repository - nothing here lives outside it.
"""
import bpy, os, sys
import numpy as np

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
M = os.path.join(HERE, "measurements")
OUT = os.path.join(M, "crops")
os.makedirs(OUT, exist_ok=True)

DRAWING = os.path.join(M, "ref_SF50_three_view_1200dpi.png")
PHOTO = os.path.join(M, "photo_N50SF.jpg")
PHOTO2 = os.path.join(M, "photo_N914AF.jpg")
# N124MW on approach, gear DOWN and side on: the only view in this workspace
# that shows the main gear doors open, and they are nothing like small.
PHOTO3 = os.path.join(M, "photo_N124MW_gear_down.jpg")
PHOTO4 = os.path.join(M, "photo_N291AH_ramp.webp")
# N291AH on the ramp, close in on the right main gear: the only view in this
# workspace that shows the LINKAGE rather than a silhouette of it.
PHOTO5 = os.path.join(M, "photo_N291AH_ramp_wide.jpg")
PHOTO6 = os.path.join(M, "photo_N291AH_main_gear.png")

# (source, name, x0, y0, x1, y1, downscale) in top-down pixels
CROPS = [
    (DRAWING, "side_view", 700, 400, 4600, 1790, 3),
    (DRAWING, "plan_view", 150, 1850, 5300, 5650, 4),
    (DRAWING, "front_view", 150, 6050, 5300, 7900, 4),
    (DRAWING, "fwd_fuselage", 770, 450, 2670, 1600, 2),
    (DRAWING, "aft_fuselage", 2500, 450, 4550, 1600, 2),
    (DRAWING, "cabin_windows", 1300, 780, 2700, 1320, 1),
    (DRAWING, "windshield_front", 1700, 6140, 3800, 7040, 2),
    (DRAWING, "main_gear", 2320, 1350, 2820, 1770, 1),
    (DRAWING, "nose_gear", 1130, 1420, 1410, 1770, 1),
    # The gear crops the retraction was read off. The three views draw the leg
    # small, so these are the regions at full 1200 dpi rather than downscaled:
    # the main leg's rake and the two braces that say which way each leg folds
    # are a few pixels wide on the sheet and unreadable at any reduction.
    (DRAWING, "main_gear_front", 3260, 7180, 3520, 7800, 1),
    (DRAWING, "nose_gear_front", 2560, 7150, 2820, 7800, 1),
    (DRAWING, "main_gear_side", 2320, 1330, 2820, 1770, 1),
    (DRAWING, "nose_gear_side_wide", 950, 1350, 1650, 1770, 1),
    # Gear UP, which no drawing in the figure shows: the belly of N914AF on
    # the climb-out. The two retracted main wheels lie flat in shallow wells
    # either side of the keel, which is what settles the main legs as folding
    # inboard - see REPORT.md, "Retraction".
    (PHOTO2, "photo_belly_gear_up", 640, 500, 1200, 800, 1),
    # The doors, open, at full resolution. The main door is a long rectangular
    # panel hanging the full depth of the leg; the nose doors are a long pair.
    (PHOTO3, "photo_main_door_open", 950, 640, 1450, 1150, 1),
    (PHOTO3, "photo_nose_door_open", 250, 780, 620, 1120, 1),
    (PHOTO4, "photo_nose_gear_ramp", 250, 480, 750, 828, 1),
    (PHOTO5, "photo_ramp_wide", 0, 0, 1744, 1116, 2),
    (PHOTO6, "photo_main_gear_linkage", 0, 0, 302, 384, 1),
    (PHOTO, "photo_cabin", 400, 480, 1000, 720, 1),
    (PHOTO, "photo_aft_cabin", 700, 520, 1250, 720, 1),
]


def crop(src, name, x0, y0, x1, y1, down):
    im = bpy.data.images.load(src)
    w, h = im.size
    buf = np.empty(w * h * im.channels, dtype=np.float32)
    im.pixels.foreach_get(buf)
    arr = buf.reshape(h, w, im.channels)[::-1]
    a = arr[y0:min(y1, h), x0:min(x1, w)]
    bpy.data.images.remove(im)
    if down > 1:
        a = a[::down, ::down]
    if a.shape[2] == 3:
        a = np.concatenate([a, np.ones(a.shape[:2] + (1,), np.float32)], axis=2)
    out = os.path.join(OUT, f"{name}.png")
    img = bpy.data.images.new(name, a.shape[1], a.shape[0], alpha=True)
    img.pixels = a[::-1].ravel().tolist()
    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)
    print(f"###CROP### {out} {a.shape[1]}x{a.shape[0]}")


for c in CROPS:
    crop(*c)
