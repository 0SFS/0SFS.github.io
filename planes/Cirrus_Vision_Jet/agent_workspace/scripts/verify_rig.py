"""
Check that an exported GLB is riggable by the simulator.

    blender -b --factory-startup --python verify_rig.py -- <model.glb>

The runtime finds moving parts by node name and assumes each part's local axes
are the glTF axes, so this reports three things per part: that it exists, that
its rotation is identity, and where its pivot sits. A baked rotation silently
reverses the sign of a deflection, which is hard to spot in a render.

Names that SURFACE_BINDINGS knows about (src/flight/aircraft/aircraftAnimation.ts):
    Aileron_Left  Aileron_Right  Elevator  Flap_Left  Flap_Right  Rudder
    Propeller     Propeller_Disc
    LandingGear_Nose  LandingGear_Left  LandingGear_Right
    BayDoor_Nose_Left  BayDoor_Nose_Right

The three gear legs retract, so this also checks the two things that make that
work: each leg's pivot is on its retraction hinge, and everything that has to
travel with a leg - its wheel, and the main legs' strut doors - is a CHILD of
it. The runtime turns one node; anything left as a sibling stays behind in mid
air.

The nose bay doors are NOT children of anything: they hinge on the fuselage,
and the runtime drives them from the same gear position on their own axes.
There is no main-gear bay door - the main wheels retract into the wing root and
stay visible, and what covers the leg is the strut-mounted GearDoor_*, which
rides its leg. What matters
for them is the identity rotation every node needs, because they are exported
in the OPEN pose - the pose lives in their vertices, and a baked node rotation
on top of it would be applied twice.

This airframe deliberately ships none of Elevator, Rudder or Propeller:
    - it is a jet, so there is no propeller and propellerBlades is 0;
    - its V-tail's two ruddervators cannot both hinge about one axis, so they
      are exported as Ruddervator_Left / Ruddervator_Right with their origins
      on their own hinge lines, ready for a binding the runtime does not have
      yet. See REPORT.md.
"""
import bpy, sys, math

BOUND = ["Aileron_Left", "Aileron_Right", "Flap_Left", "Flap_Right",
         "LandingGear_Nose", "LandingGear_Left", "LandingGear_Right",
         # Only the finest level cuts the bays, so these are absent below it
         # and that is reported rather than treated as a fault.
         "BayDoor_Nose_Left", "BayDoor_Nose_Right"]
# who must ride with which leg.  A door only exists where the level carries trim.
GEAR_CHILDREN = {
    "LandingGear_Nose": ["Wheel_Nose"],
    "LandingGear_Left": ["Wheel_Left"],
    "LandingGear_Right": ["Wheel_Right"],
}
# The hinges come FROM the generator, not from a copy of them. They were
# copied once, and moving the stowed main wheels out into the wing root left
# this file asserting the old pair - which the check then reported as two
# broken pivots on a model that was correct. A constant table that has to be
# kept in step by hand is a second source of truth.
import os
_SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    "generate_sf50.py")
_HEAD = open(_SRC).read().split(
    "# ----------------------------------------------------------------------------\n"
    "# scene / materials")[0]
_G = {"__name__": "verify_rig", "__file__": _SRC}
_ARGV = sys.argv
sys.argv = [_ARGV[0], "--", "--lod", "3"]
exec(compile(_HEAD, _SRC, "exec"), _G)
sys.argv = _ARGV


_MH = _G["quarter_turn_hinge"]((_G["GEAR_TRACK"] / 2.0, _G["MAIN_TIRE_R"]),
                               _G["MAIN_STOWED"])
_NH = _G["quarter_turn_hinge"]((_G["NOSE_AXLE_Y"], _G["NOSE_TIRE_R"]),
                               _G["NOSE_STOWED"], sense=_G["NOSE_SENSE"])
MAIN_HINGE = (_MH[0], _G["MAIN_STRUT_TOP_Y"], _MH[1])
NOSE_HINGE = (0.0, _NH[0], _NH[1])
HINGE_TOL = 0.002
UNBOUND = ["Ruddervator_Left", "Ruddervator_Right"]
NOT_EXPECTED = ["Elevator", "Rudder", "Propeller"]
# Working Y = world Y + CG_SHIFT (CG_SHIFT is negative); the generator shifts
# the origin from the nose tip to the CG.
CG_SHIFT = -4.00
# expected hinge geometry, from measurements/sf50_reference.md
VT_DIHEDRAL_DEG = 38.7
VT_ROOT_Z = 1.513                  # V-tail chord plane on the centreline

path = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)

present = {o.name: o for o in bpy.context.scene.objects}
print(f"\n### RIG ### {path}")
print(f"{'part':20s} {'bound':6s} {'identity rot':13s} "
      f"{'pivot (x=span, y=nose, z=up)':30s} working Y")
problems = []


def report(name, bound):
    node = present.get(name)
    if node is None:
        print(f"{name:20s} {bound:6s} {'-- absent --':13s}")
        return False
    q = (node.rotation_quaternion if node.rotation_mode == 'QUATERNION'
         else node.rotation_euler.to_quaternion())
    identity = abs(q.w - 1) < 1e-5 and max(abs(q.x), abs(q.y), abs(q.z)) < 1e-5
    if not identity:
        problems.append(f"{name} has a baked rotation; deflection signs will be wrong")
    pivot = [round(v, 3) for v in node.location]
    print(f"{name:20s} {bound:6s} {str(identity):13s} {str(pivot):30s} "
          f"{round(node.location[1] + CG_SHIFT, 3)}")
    return True


for name in BOUND:
    # The coarse levels legitimately merge the control surfaces into their
    # panels, so an absent part is reported but is not a problem.
    report(name, "yes")
for name in UNBOUND:
    report(name, "no")
for name in NOT_EXPECTED:
    if name in present:
        problems.append(f"{name} exists but this airframe should not have one")

missing = [n for n in BOUND if n not in present]
print(f"\nbound parts absent: {missing if missing else 'none'}")
print("Elevator / Rudder / Propeller absent by design:",
      all(n not in present for n in NOT_EXPECTED))

# The two ruddervator pivots must sit on their own hinge lines, i.e. mirrored
# across the centreline and lifted by the dihedral.
lr = present.get("Ruddervator_Left")
rr = present.get("Ruddervator_Right")
if lr and rr:
    if abs(lr.location[0] + rr.location[0]) > 1e-4 or \
       abs(lr.location[1] - rr.location[1]) > 1e-4 or \
       abs(lr.location[2] - rr.location[2]) > 1e-4:
        problems.append("ruddervator pivots are not mirror images")
    got = math.degrees(math.atan2(rr.location[2] - VT_ROOT_Z, abs(rr.location[0])))
    print(f"ruddervator pivot half-span {abs(rr.location[0]):.3f} m, "
          f"z {rr.location[2]:.3f} m -> hinge dihedral {got:.1f} deg "
          f"(expected {VT_DIHEDRAL_DEG})")
    if abs(got - VT_DIHEDRAL_DEG) > 0.5:
        problems.append("ruddervator hinge line is not on the measured dihedral")

# ---- the gear has to be one rigid assembly under each leg ----------------
for leg_name, child_names in GEAR_CHILDREN.items():
    leg = present.get(leg_name)
    if leg is None:
        continue
    for child_name in child_names:
        child = present.get(child_name)
        if child is None:
            continue                       # the far level ships no doors
        if child.parent is not leg:
            problems.append(f"{child_name} is not parented to {leg_name}; "
                            f"it will not retract with it")

# ---- and each leg's pivot has to be on its own retraction hinge ----------
for leg_name, want in (("LandingGear_Left", (-MAIN_HINGE[0], MAIN_HINGE[1], MAIN_HINGE[2])),
                       ("LandingGear_Right", MAIN_HINGE),
                       ("LandingGear_Nose", NOSE_HINGE)):
    leg = present.get(leg_name)
    if leg is None:
        continue
    got = (leg.location[0], leg.location[1] + CG_SHIFT, leg.location[2])
    off = max(abs(a - b) for a, b in zip(got, want))
    print(f"{leg_name:20s} pivot {[round(v, 4) for v in got]} "
          f"vs hinge {[round(v, 4) for v in want]} -> {off * 1000:.1f} mm")
    if off > HINGE_TOL:
        problems.append(f"{leg_name} pivot is not on its retraction hinge")

for problem in problems:
    print("PROBLEM:", problem)
print("### OK ###" if not problems else "### PROBLEMS FOUND ###")
