"""
Check that an exported GLB is riggable by the simulator.

    blender -b --factory-startup --python verify_rig.py -- <model.glb>

The runtime finds moving parts by node name and assumes each part's local axes
are the glTF axes, so this reports three things per part: that it exists, that
its rotation is identity, and where its pivot sits. A baked rotation silently
reverses the sign of a deflection, which is hard to spot in a render.
"""
import bpy, sys

MOVING = ["Aileron_Left", "Aileron_Right", "Elevator",
          "Flap_Left", "Flap_Right", "Rudder", "Propeller"]
# Working Y = world Y - CG_SHIFT; the generator shifts the origin to the CG.
CG_SHIFT = 0.62

path = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)

present = {o.name: o for o in bpy.context.scene.objects}
print(f"\n### RIG ### {path}")
print(f"{'part':16s} {'identity rot':13s} {'pivot (x=span, y=nose, z=up)':32s} working Y")
problems = []
for name in MOVING:
    node = present.get(name)
    if node is None:
        print(f"{name:16s} {'-- absent --':13s}")
        continue
    q = (node.rotation_quaternion if node.rotation_mode == 'QUATERNION'
         else node.rotation_euler.to_quaternion())
    identity = abs(q.w - 1) < 1e-5 and max(abs(q.x), abs(q.y), abs(q.z)) < 1e-5
    if not identity:
        problems.append(f"{name} has a baked rotation; deflection signs will be wrong")
    pivot = [round(v, 3) for v in node.location]
    print(f"{name:16s} {str(identity):13s} {str(pivot):32s} {round(node.location[1] - CG_SHIFT, 3)}")

missing = [n for n in MOVING if n not in present]
print(f"\nabsent: {missing if missing else 'none'}")
if missing and missing != [n for n in MOVING if n != 'Propeller']:
    # Coarse levels legitimately keep only the propeller.
    if set(missing) - {"Aileron_Left", "Aileron_Right", "Elevator", "Flap_Left", "Flap_Right", "Rudder"}:
        problems.append(f"unexpected absent parts: {missing}")
for problem in problems:
    print("PROBLEM:", problem)
print("### OK ###" if not problems else "### PROBLEMS FOUND ###")
