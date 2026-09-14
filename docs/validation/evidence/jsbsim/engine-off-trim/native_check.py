"""Does a zero-time RunIC leave a shut-off turbine shut off? (native JSBSim)

Usage: python native_check.py <JSBSim source root with build/tests/jsbsim built>

Upstream FGTurbine::Calculate() enters Trim() on every zero-time evaluation,
running or not, and only commits spool state for a running engine once time
advances. PR #1505 assigns N1/N2 and PR #1508 assigns fuel flow inside Trim()
for every engine. Uses the repository's own F-16 fixture.
"""
import os, sys, tempfile
import xml.etree.ElementTree as et

root = sys.argv[1]
sys.path.insert(0, os.path.join(root, "build", "tests"))
import jsbsim

use = et.parse(os.path.join(root, "scripts", "f16_test.xml")).getroot().find("use")
E = "propulsion/engine[0]/"


def new_fdm():
    fdm = jsbsim.FGFDMExec(tempfile.mkdtemp() + "/", None)
    fdm.set_debug_level(0)
    fdm.set_aircraft_path(os.path.join(root, "aircraft"))
    fdm.set_engine_path(os.path.join(root, "engine"))
    fdm.set_systems_path(os.path.join(root, "systems"))
    assert fdm.load_model(use.attrib["aircraft"])
    assert fdm.load_ic(use.attrib["initialize"], True)
    fdm.set_dt(1 / 120)
    return fdm


def show(tag, fdm):
    print(f"  {tag:<24} t={fdm.get_sim_time():6.3f} running={fdm[E + 'set-running']:.0f} "
          f"N1={fdm[E + 'n1']:6.2f} N2={fdm[E + 'n2']:6.2f} "
          f"fuel flow={fdm[E + 'fuel-flow-rate-pps'] * 3600:7.1f} lb/h "
          f"fuel used={fdm[E + 'fuel-used-lbs']:.4f} lb")


print("Engine never started, throttle 0.35, RunIC")
fdm = new_fdm()
fdm["fcs/throttle-cmd-norm[0]"] = 0.35
fdm["fcs/throttle-pos-norm[0]"] = 0.35
assert fdm.run_ic()
show("after RunIC", fdm)
for step in range(1, 25):
    fdm.run()
    if step in (1, 12, 24):
        show(f"after step {step}", fdm)

print("Engine running at 0.35, cut off for 10 s, then RunIC")
fdm = new_fdm()
fdm["fcs/throttle-cmd-norm[0]"] = 0.35
fdm["fcs/throttle-pos-norm[0]"] = 0.35
assert fdm.run_ic()
fdm["propulsion/set-running"] = -1
for _ in range(240):
    fdm.run()
show("running for 2 s", fdm)
fdm["propulsion/cutoff_cmd"] = 1
for _ in range(1200):
    fdm.run()
show("10 s after cutoff", fdm)
assert fdm.run_ic()
show("after RunIC", fdm)
for step in range(1, 13):
    fdm.run()
    if step in (1, 12):
        show(f"after step {step}", fdm)
