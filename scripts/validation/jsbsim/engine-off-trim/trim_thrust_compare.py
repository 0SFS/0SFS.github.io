#!/usr/bin/env python3
"""Compare the zero-time trim thrust of a turbine that is off, across JSBSim builds.

Compatibility characterization for the PR #1505 off-engine repair, which must
not change what FGTurbine::Trim() returns. Uses the repository's F-16 fixture:
a never-started engine and one cut off with residual spin go through RunIC at a
dry and an augmented throttle command, with the stock engine (<augmethod> 2)
and with a copy that uses <augmethod> 1 (threshold on N2). A running engine is
a control. For each case the record holds thrust-lbs and the thrust given by
Trim()'s own formulas, evaluated from the engine's table properties:

- dry: the steady, unaugmented thrust at the throttle;
- steady: dry, or augmented where that method's rule applies at steady N2;
- stored N2: what the same rules give using the N2 the engine had before RunIC,
  which is what a repair that read the member N2 would return.

This describes existing behaviour. It does not claim an off engine should
produce thrust.

Example:
  python3 trim_thrust_compare.py --source /path/to/jsbsim \\
      --build before=/path/to/jsbsim/build/x/before \\
      --build after=/path/to/jsbsim/build/x/after
Each build's jsbsim module is loaded from <build>/tests in its own process.
Output defaults to a new dated directory in the source repository's build/;
the sandboxed engine copy and every FDM root live there too.
"""
import argparse
import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

ENGINE = "propulsion/engine[0]/"
DT = 1.0 / 120.0
THROTTLES = {"dry": 0.35, "augmented": 0.75}
STATES = ("never_started", "cut_off", "running")
MATCH_TOLERANCE_LBS = 1e-6


def digest(path):
    with open(path, "rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def fixture(source):
    use = ET.parse(source / "scripts" / "f16_test.xml").getroot().find("use")
    aircraft = use.attrib["aircraft"]
    aircraft_xml = ET.parse(source / "aircraft" / aircraft / (aircraft + ".xml")).getroot()
    engine_element = aircraft_xml.find("propulsion/engine")
    engine_file = source / "engine" / (engine_element.attrib["file"] + ".xml")
    thruster_file = source / "engine" / (engine_element.find("thruster").attrib["file"] + ".xml")
    return use, aircraft, engine_file, thruster_file


def engine_constants(engine_file):
    root = ET.parse(engine_file).getroot()
    value = lambda name: float(root.find(name).text)
    return {name: value(name) for name in (
        "milthrust", "maxthrust", "idlen2", "maxn2", "augmented", "augmethod")}


def trim_thrust(c, lookups, throttle_position, n2, augmentation_before):
    """FGTurbine::Trim()'s thrust for a given N2, mirroring its operation order."""
    augment_cmd = throttle_position - 1.0 if throttle_position > 1.0 else 0.0
    throttle = throttle_position - augment_cmd
    n2_factor = c["maxn2"] - c["idlen2"]
    idlethrust = c["milthrust"] * lookups["IdleThrust"]
    milthrust = (c["milthrust"] - idlethrust) * lookups["MilThrust"]
    n2norm = (n2 - c["idlen2"]) / n2_factor
    thrust = (idlethrust + (milthrust * n2norm * n2norm)) * (1.0 - lookups["bleed-factor"])
    augmentation = augmentation_before
    if c["augmethod"] == 1:
        augmentation = throttle > 0.99 and n2 > 97.0
    if c["augmented"] == 1 and augmentation and c["augmethod"] < 2:
        thrust = c["maxthrust"] * lookups["AugThrust"]
    if c["augmethod"] == 2 and augment_cmd > 0.0:
        tdiff = c["maxthrust"] * lookups["AugThrust"] - thrust
        thrust += tdiff * min(augment_cmd, 1.0)
    return thrust, augmentation


def measure(args):
    import jsbsim  # resolved through PYTHONPATH=<build>/tests, set by the parent

    tests = args.tests.resolve()
    module = Path(jsbsim._jsbsim.__file__).resolve()
    if tests not in module.parents:
        sys.exit(f"jsbsim extension {module} is not inside {tests}")
    source = args.source.resolve()
    output = args.output.resolve()
    use, aircraft, engine_file, thruster_file = fixture(source)

    # AugMethod 1 in a sandbox copy; repository engine data stays unchanged.
    method1 = output / "engine-augmethod1"
    method1.mkdir()
    text, count = re.subn(r"<augmethod>\s*\d+\s*</augmethod>",
                          "<augmethod> 1 </augmethod>", engine_file.read_text())
    assert count == 1, count
    (method1 / engine_file.name).write_text(text)
    (method1 / thruster_file.name).write_bytes(thruster_file.read_bytes())
    methods = {"stock": source / "engine", "augmethod1": method1}

    jsbsim.FGJSBBase().debug_lvl = 0
    record = {
        "jsbsim_file": jsbsim.__file__, "extension": str(module),
        "extension_sha256": digest(module), "jsbsim_version": jsbsim.__version__,
        "python": sys.version.split()[0],
        "fixture": {"aircraft": aircraft, "initialize": use.attrib["initialize"],
                    "engine_sha256": digest(engine_file),
                    "augmethod1_copy_sha256": digest(method1 / engine_file.name)},
        "cases": []}

    for method, engine_path in methods.items():
        constants = engine_constants(engine_path / engine_file.name)
        for state in STATES:
            for throttle_name, throttle in THROTTLES.items():
                root = output / "roots" / f"{method}-{state}-{throttle_name}"
                root.mkdir(parents=True)
                fdm = jsbsim.FGFDMExec(str(root) + "/", None)
                fdm.set_aircraft_path(str(source / "aircraft"))
                fdm.set_engine_path(str(engine_path))
                fdm.set_systems_path(str(source / "systems"))
                assert fdm.load_model(aircraft)
                assert fdm.load_ic(use.attrib["initialize"], True)
                fdm.set_dt(DT)
                if state != "never_started":
                    assert fdm.run_ic()
                    fdm["propulsion/set-running"] = -1
                if state == "cut_off":
                    fdm["fcs/throttle-cmd-norm[0]"] = 0.35
                    for _ in range(240):
                        assert fdm.run()
                    fdm["propulsion/cutoff_cmd"] = 1
                    for _ in range(1200):
                        assert fdm.run()
                fdm["fcs/throttle-cmd-norm[0]"] = throttle
                before = {k: fdm[ENGINE + k] for k in ("set-running", "n1", "n2")}
                time_before = fdm.get_sim_time()
                assert fdm.run_ic()
                assert fdm.get_sim_time() == time_before
                after = {k: fdm[ENGINE + k] for k in ("set-running", "n1", "n2", "thrust-lbs")}
                lookups = {k: fdm[ENGINE + k] for k in (
                    "IdleThrust", "MilThrust", "AugThrust", "bleed-factor")}
                position = fdm["fcs/throttle-pos-norm[0]"]
                dry_throttle = min(position, 1.0)
                steady_n2 = constants["idlen2"] + dry_throttle * (constants["maxn2"] - constants["idlen2"])
                # Neither augmentation branch applies without the installed
                # flag and with the position limited to the dry range.
                dry = dict(constants, augmented=0)
                formulas = {
                    "dry": trim_thrust(dry, lookups, dry_throttle, steady_n2, False)[0],
                    "steady": trim_thrust(constants, lookups, position, steady_n2, False),
                    "stored_n2": trim_thrust(constants, lookups, position, before["n2"], False),
                }
                thrust = after["thrust-lbs"]
                record["cases"].append({
                    "method": method, "augmethod": int(constants["augmethod"]),
                    "state": state, "throttle": throttle_name, "throttle_cmd": throttle,
                    "throttle_position": position, "before_run_ic": before,
                    "after_run_ic": after, "lookups": lookups,
                    "formula_lbs": {"dry": formulas["dry"],
                                    "steady": formulas["steady"][0],
                                    "stored_n2": formulas["stored_n2"][0]},
                    "formula_augmentation": {"steady": formulas["steady"][1],
                                             "stored_n2": formulas["stored_n2"][1]},
                    "matches": {k: abs(thrust - v) <= MATCH_TOLERANCE_LBS for k, v in (
                        ("dry", formulas["dry"]), ("steady", formulas["steady"][0]),
                        ("stored_n2", formulas["stored_n2"][0]))},
                })
                del fdm
    (output / "measurement.json").write_text(json.dumps(record, indent=2) + "\n")


def compare(args):
    source = args.source.resolve()
    stamp = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
    output = (args.output or source / "build" / "engine-off-trim" / stamp).resolve()
    output.mkdir(parents=True, exist_ok=False)
    temporary = output / "tmp"
    temporary.mkdir()
    builds = dict(item.split("=", 1) for item in args.build)
    records = {}
    for label, build in builds.items():
        tests = Path(build).resolve() / "tests"
        directory = output / label
        directory.mkdir()
        env = dict(os.environ, PYTHONPATH=str(tests), TMPDIR=str(temporary),
                   PYTHONDONTWRITEBYTECODE="1")
        subprocess.run([args.python, __file__, "--measure", "--source", str(source),
                        "--tests", str(tests), "--output", str(directory)],
                       cwd=directory, env=env, check=True)
        records[label] = json.loads((directory / "measurement.json").read_text())

    labels = list(records)
    key = lambda c: (c["method"], c["state"], c["throttle"])
    by_label = {label: {key(c): c for c in r["cases"]} for label, r in records.items()}
    rows = []
    for k in by_label[labels[0]]:
        cases = {label: by_label[label][k] for label in labels}
        thrusts = [cases[label]["after_run_ic"]["thrust-lbs"] for label in labels]
        rows.append({"method": k[0], "state": k[1], "throttle": k[2],
                     "thrust_lbs": dict(zip(labels, thrusts)),
                     "thrust_identical": len(set(thrusts)) == 1,
                     "max_abs_difference_lbs": max(thrusts) - min(thrusts),
                     "cases": cases})
    summary = {"source": str(source),
               "source_head": subprocess.check_output(
                   ["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip(),
               "source_status": subprocess.check_output(
                   ["git", "-C", str(source), "status", "--short"], text=True).splitlines(),
               "builds": {label: {k: v for k, v in r.items() if k != "cases"}
                          for label, r in records.items()},
               "match_tolerance_lbs": MATCH_TOLERANCE_LBS,
               "all_thrust_identical": all(r["thrust_identical"] for r in rows),
               "rows": rows}
    (output / "comparison.json").write_text(json.dumps(summary, indent=2) + "\n")

    lines = ["| AugMethod | State | Throttle (pos) | " + " | ".join(
                 f"{label} thrust / N2" for label in labels)
             + " | Identical | Steady formula | Stored-N2 formula |",
             "| --- | --- | --- | " + " | ".join("---" for _ in labels) + " | --- | --- | --- |"]
    for row in rows:
        first = row["cases"][labels[0]]
        cells = [f'{row["cases"][label]["after_run_ic"]["thrust-lbs"]:.4f} / '
                 f'{row["cases"][label]["after_run_ic"]["n2"]:.4f}' for label in labels]
        aug = " (aug)" if first["formula_augmentation"]["steady"] or (
            first["augmethod"] == 2 and first["throttle_position"] > 1.0) else ""
        lines.append(
            f'| {first["augmethod"]} | {row["state"]} | {row["throttle"]} '
            f'({first["throttle_position"]:.2f}) | ' + " | ".join(cells)
            + f' | {"yes" if row["thrust_identical"] else "NO"}'
            + f' | {first["formula_lbs"]["steady"]:.4f}{aug}'
            + f' | {first["formula_lbs"]["stored_n2"]:.4f} |')
    table = "\n".join(lines) + "\n"
    (output / "comparison.md").write_text(table)
    print(table)
    print("all thrust identical:", summary["all_thrust_identical"])
    print("output:", output)
    return 0 if summary["all_thrust_identical"] else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--build", action="append", help="label=<CMake build directory>")
    parser.add_argument("--python", default=sys.executable)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--measure", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--tests", type=Path, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.measure:
        return measure(args)
    if not args.build:
        parser.error("--build is required")
    return compare(args)


if __name__ == "__main__":
    sys.exit(main())
