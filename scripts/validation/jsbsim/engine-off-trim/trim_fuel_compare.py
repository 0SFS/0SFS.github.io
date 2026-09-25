#!/usr/bin/env python3
"""Compare the zero-time trim fuel state of a turbine across JSBSim builds.

Characterization for the PR #1508 off-engine repair. #1508 assigns a steady
fuel flow and a corrected TSFC in FGTurbine::Trim(); before the repair it does
so for every engine, including one that is off, which then reports that flow
and burns it over the following frames. Uses the repository's F-16 fixture: a
never-started engine, one cut off with residual spin, and a running engine as
the control, each through RunIC at a dry and an augmented throttle command.

Three engine variants, all as sandbox copies; repository data is not modified:

- stock: the shipped <augmethod> 2 engine, whose <tsfc> is a plain number and
  therefore an FGSimplifiedTSFC reading the member N2norm;
- augmethod1: the same engine with <augmethod> 1, whose augmentation threshold
  reads N2 directly;
- xmlfunctions: <tsfc> and <atsfc> given XML function bodies reading
  propulsion/engine[0]/n2, so a configured function's own operating point is
  observable. Trim must evaluate it after the running spool state it describes.
  Both carry a copyto attribute, so whether the function was evaluated at all
  is observable too;
- xmlfunctions-augmethod1: the same with <augmethod> 1, which reaches the
  other of the two augmented ATSFC call sites.

The copyto targets are sentinel properties created before load_model, because
FGFunction only accepts a copyto target that already exists, and reset after
loading, because loading evaluates TSFC once. The ATSFC property is never read
while they are being observed: propulsion/engine[#]/atsfc is tied straight to
the function's getter, so reading it would fire the copyto itself.

For every case the record holds the fuel state before and after RunIC, the two
sentinels, and the fuel consumed over the following frames. It describes
existing behaviour; it is not a claim that an engine that is off should report
any particular flow.

Example:
  python3 trim_fuel_compare.py --source /path/to/jsbsim \\
      --build original=/path/to/jsbsim/build/x/original \\
      --build final=/path/to/jsbsim/build/x/final
Each build's jsbsim module is loaded from <build>/tests in its own process.
Output defaults to a new dated directory in the source repository's build/;
the sandboxed engine copies and every FDM root live there too.
"""
import argparse
import datetime
import hashlib
import json
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
FRAMES_AFTER = 24
# Properties that describe the engine's fuel state and the spools it is
# derived from. tsfc is the stored corrected value, written by Trim().
STATE_PROPERTIES = ("set-running", "n1", "n2", "fuel-flow-rate-pps",
                    "fuel-flow-rate-gph", "fuel-used-lbs", "tsfc",
                    "thrust-lbs")
# Deliberately absent from the list above: propulsion/engine[#]/atsfc is tied
# to FGParameter::GetValue, so reading it evaluates the function and fires its
# copyto. Only the stored corrected TSFC is read back.
COPYTO = {"tsfc": "test/trim-tsfc-copy", "atsfc": "test/trim-atsfc-copy"}
# No TSFC can be negative, so an untouched sentinel is unmistakable.
SENTINEL = -1.0
# An XML <tsfc>/<atsfc> pair reading the engine's own N2, so that a configured
# function is evaluated at the operating point Trim is establishing. The
# constants keep the values in the same range as the shipped scalars.
XML_TSFC = """  <tsfc copyto="{tsfc}">
   <product>
    <value> 0.0074 </value>
    <sum>
     <value> 100.0 </value>
     <product>
      <value> -0.5 </value>
      <property> propulsion/engine[0]/n2 </property>
     </product>
    </sum>
   </product>
  </tsfc>
  <atsfc copyto="{atsfc}">
   <product>
    <value> 0.0205 </value>
    <sum>
     <value> 100.0 </value>
     <product>
      <value> -0.1 </value>
      <property> propulsion/engine[0]/n2 </property>
     </product>
    </sum>
   </product>
  </atsfc>
""".format(**COPYTO)

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


def variant(output, name, engine_file, thruster_file, edit):
    """Write a sandbox copy of the engine, edited by `edit`, and return its directory."""
    directory = output / ("engine-" + name)
    directory.mkdir()
    (directory / engine_file.name).write_text(edit(engine_file.read_text()))
    (directory / thruster_file.name).write_bytes(thruster_file.read_bytes())
    return directory


def use_augmethod1(text):
    text, count = re.subn(r"<augmethod>\s*\d+\s*</augmethod>",
                          "<augmethod> 1 </augmethod>", text)
    assert count == 1, count
    return text


def use_xml_functions(text):
    text, count = re.subn(r"[ \t]*<tsfc>.*?</tsfc>\s*\n[ \t]*<atsfc>.*?</atsfc>[ \t]*\n",
                          XML_TSFC, text, flags=re.S)
    assert count == 1, count
    return text


def tank_total(fdm, catalog):
    return sum(fdm[name] for name in catalog)


def measure(args):
    import jsbsim  # resolved through PYTHONPATH=<build>/tests, set by the parent

    tests = args.tests.resolve()
    module = Path(jsbsim._jsbsim.__file__).resolve()
    if tests not in module.parents:
        sys.exit(f"jsbsim extension {module} is not inside {tests}")
    source = args.source.resolve()
    output = args.output.resolve()
    use, aircraft, engine_file, thruster_file = fixture(source)

    variants = {
        "stock": variant(output, "stock", engine_file, thruster_file, lambda t: t),
        "augmethod1": variant(output, "augmethod1", engine_file, thruster_file,
                              use_augmethod1),
        "xmlfunctions": variant(output, "xmlfunctions", engine_file, thruster_file,
                                use_xml_functions),
        "xmlfunctions-augmethod1": variant(
            output, "xmlfunctions-augmethod1", engine_file, thruster_file,
            lambda text: use_augmethod1(use_xml_functions(text))),
    }

    jsbsim.FGJSBBase().debug_lvl = 0
    record = {
        "jsbsim_file": jsbsim.__file__, "extension": str(module),
        "extension_sha256": digest(module), "jsbsim_version": jsbsim.__version__,
        "python": sys.version.split()[0],
        "fixture": {"aircraft": aircraft, "initialize": use.attrib["initialize"],
                    "engine_sha256": digest(engine_file),
                    "variant_sha256": {name: digest(path / engine_file.name)
                                       for name, path in variants.items()}},
        "frames_after": FRAMES_AFTER, "dt": DT, "cases": []}

    for name, engine_path in variants.items():
        for state in STATES:
            for throttle_name, throttle in THROTTLES.items():
                root = output / "roots" / f"{name}-{state}-{throttle_name}"
                root.mkdir(parents=True)
                fdm = jsbsim.FGFDMExec(str(root) + "/", None)
                fdm.set_aircraft_path(str(source / "aircraft"))
                fdm.set_engine_path(str(engine_path))
                fdm.set_systems_path(str(source / "systems"))
                # FGFunction ignores a copyto target that does not exist when
                # the engine XML is parsed, so create the sentinels first.
                for sentinel in COPYTO.values():
                    fdm[sentinel] = SENTINEL
                assert fdm.load_model(aircraft)
                assert fdm.load_ic(use.attrib["initialize"], True)
                fdm.set_dt(DT)
                catalog = [line.split()[0] for line
                           in fdm.query_property_catalog("propulsion/tank").split("\n")
                           if "/contents-lbs" in line]
                assert catalog
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
                # Loading and every evaluation since then has written the
                # sentinels; reset them so they describe this call alone.
                for sentinel in COPYTO.values():
                    fdm[sentinel] = SENTINEL
                before = {k: fdm[ENGINE + k] for k in STATE_PROPERTIES}
                before["sim-time-sec"] = fdm.get_sim_time()
                before["tank-total-lbs"] = tank_total(fdm, catalog)
                assert fdm.run_ic()
                after = {k: fdm[ENGINE + k] for k in STATE_PROPERTIES}
                after["sim-time-sec"] = fdm.get_sim_time()
                after["tank-total-lbs"] = tank_total(fdm, catalog)
                copyto = {name: fdm[target] for name, target in COPYTO.items()}
                position = fdm["fcs/throttle-pos-norm[0]"]

                for _ in range(FRAMES_AFTER):
                    assert fdm.run()
                following = {k: fdm[ENGINE + k] for k in STATE_PROPERTIES}
                following["sim-time-sec"] = fdm.get_sim_time()
                following["tank-total-lbs"] = tank_total(fdm, catalog)

                record["cases"].append({
                    "variant": name, "state": state, "throttle": throttle_name,
                    "throttle_cmd": throttle, "throttle_position": position,
                    "tanks": catalog,
                    "before_run_ic": before, "after_run_ic": after,
                    "copyto_after_run_ic": copyto,
                    "copyto_evaluated": {name: value != SENTINEL
                                         for name, value in copyto.items()},
                    "after_following_frames": following,
                    "run_ic_changed_fuel_flow":
                        after["fuel-flow-rate-gph"] != before["fuel-flow-rate-gph"],
                    "run_ic_changed_tsfc": after["tsfc"] != before["tsfc"],
                    "run_ic_burned_lbs":
                        after["fuel-used-lbs"] - before["fuel-used-lbs"],
                    "following_frames_burned_lbs":
                        following["fuel-used-lbs"] - after["fuel-used-lbs"],
                    "following_frames_tank_drop_lbs":
                        after["tank-total-lbs"] - following["tank-total-lbs"],
                })
                del fdm
    (output / "measurement.json").write_text(json.dumps(record, indent=2) + "\n")


def compare(args):
    source = args.source.resolve()
    stamp = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
    output = (args.output or source / "build" / "engine-off-trim-fuel" / stamp).resolve()
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
    key = lambda c: (c["variant"], c["state"], c["throttle"])
    by_label = {label: {key(c): c for c in r["cases"]} for label, r in records.items()}
    rows = []
    for k in by_label[labels[0]]:
        cases = {label: by_label[label][k] for label in labels}
        flows = [cases[label]["after_run_ic"]["fuel-flow-rate-gph"] for label in labels]
        burned = [cases[label]["following_frames_burned_lbs"] for label in labels]
        rows.append({
            "variant": k[0], "state": k[1], "throttle": k[2],
            "flow_gph": dict(zip(labels, flows)),
            "following_frames_burned_lbs": dict(zip(labels, burned)),
            "flow_identical": len(set(flows)) == 1,
            "state_identical": all(
                cases[labels[0]]["after_run_ic"] == cases[label]["after_run_ic"]
                for label in labels),
            "copyto_evaluated": {label: cases[label]["copyto_evaluated"]
                                 for label in labels},
            "cases": cases})
    running = [r for r in rows if r["state"] == "running"]
    off = [r for r in rows if r["state"] != "running"]
    summary = {
        "source": str(source),
        "source_head": subprocess.check_output(
            ["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip(),
        "source_status": subprocess.check_output(
            ["git", "-C", str(source), "status", "--short"], text=True).splitlines(),
        "builds": {label: {k: v for k, v in r.items() if k != "cases"}
                   for label, r in records.items()},
        "all_running_states_identical": all(r["state_identical"] for r in running),
        "off_rows": len(off),
        "off_rows_with_identical_flow": sum(1 for r in off if r["flow_identical"]),
        "rows": rows}
    header = ("| Variant | State | Throttle (pos) | "
              + " | ".join(f"{label} flow gph / burned lb" for label in labels)
              + " | Identical |")
    lines = [header, "| --- | --- | --- | " + " | ".join("---" for _ in labels) + " | --- |"]
    for row in rows:
        first = row["cases"][labels[0]]
        cells = [f'{row["flow_gph"][label]:.2f} / '
                 f'{row["following_frames_burned_lbs"][label]:.4f}' for label in labels]
        lines.append(
            f'| {row["variant"]} | {row["state"]} | {row["throttle"]} '
            f'({first["throttle_position"]:.2f}) | ' + " | ".join(cells)
            + f' | {"yes" if row["state_identical"] else "NO"} |')
    table = "\n".join(lines) + "\n"
    (output / "comparison.md").write_text(table)
    # The configured functions carry a copyto target only in the variants
    # built from XML function bodies; elsewhere the sentinels never move and
    # say nothing.
    copyto_rows = [r for r in rows if r["variant"].startswith("xmlfunctions")]
    summary["copyto_rows"] = [
        {"variant": r["variant"], "state": r["state"], "throttle": r["throttle"],
         "evaluated": r["copyto_evaluated"],
         "values": {label: r["cases"][label]["copyto_after_run_ic"]
                    for label in labels}}
        for r in copyto_rows]
    (output / "comparison.json").write_text(json.dumps(summary, indent=2) + "\n")

    lines = ["", "Configured function evaluation during the RunIC, from copyto"
             " sentinels reset immediately before it.", "",
             "| Variant | State | Throttle | "
             + " | ".join(f"{label} tsfc / atsfc" for label in labels) + " |",
             "| --- | --- | --- | " + " | ".join("---" for _ in labels) + " |"]
    fired = lambda v: "-" if v == SENTINEL else f"{v:.6f}"
    for row in copyto_rows:
        cells = [" / ".join(fired(row["cases"][label]["copyto_after_run_ic"][name])
                            for name in ("tsfc", "atsfc")) for label in labels]
        lines.append(f'| {row["variant"]} | {row["state"]} | {row["throttle"]} | '
                     + " | ".join(cells) + " |")
    lines += ["", "`-` means the sentinel was never written, so the function"
              " was not evaluated.", ""]
    copyto_table = "\n".join(lines) + "\n"
    (output / "comparison.md").write_text(table + copyto_table)
    print(table)
    print(copyto_table)
    print("running states identical across builds:",
          summary["all_running_states_identical"])
    print("output:", output)
    return 0 if summary["all_running_states_identical"] else 1


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
