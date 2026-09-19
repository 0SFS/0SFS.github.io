#!/usr/bin/env python3
"""Say why a JSBSim aircraft fails, in words, using a native JSBSim build.

    PYTHONPATH=../Felipegalind0/jsbsim/build/native/tests \\
      python3 scripts/validation/aircraft/diagnose-fdm-native.py \\
      build/fg-aircraft-inventory/<run>/fdm J3Cub p51d-jsbsim

The WASM package 0sfs ships does not export `getExceptionMessage`, so a model
that throws reaches
[smoke-test-flightgear-fdm.mjs](smoke-test-flightgear-fdm.mjs) as an opaque
`CppException` and is reported as "native exception". A native build of the
same engine prints the message instead - "The property propulsion/fuel_pump
does not exist", "Expecting a numeric attribute value, but got: -32.5.0" -
which is the difference between a mystery and a one-line fix.

This is a diagnostic, not a verdict: the WASM run is what 0sfs cares about.
Use it to find out what to put in an aircraft's mapping file, then re-run the
smoke test.

Needs a JSBSim checkout built with its Python bindings (`build/native/tests`
holds `jsbsim/_jsbsim.so`) and numpy in the interpreter running this. The
aircraft directories are the ones scan-flightgear-aircraft.py --extract-fdm
writes; --jsbsim-root reads a JSBSim checkout's own aircraft instead.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

# Anything shaped like a property, plus the single names a property element can
# hold; the same shapes smoke-test-flightgear-fdm.mjs stands in for.
PROPERTY = re.compile(r"(?<![\w./])-?([a-z/][\w-]*(?:\[\d+\])?(?:/[\w-]+(?:\[\d+\])?)+)(?![\w./-])")
PROPERTY_ELEMENT = re.compile(r"<(?:property|input|output|independentVar)\b[^>]*>\s*-?([A-Za-z][\w-]*(?:\[\d+\])?)\s*<")
MISSING = re.compile(r"The property (\S+) does not exist")


def referenced(directory: str) -> set[str]:
    names: set[str] = set()
    for base, _, files in os.walk(directory):
        for name in files:
            if not name.endswith((".xml", ".nas")):
                continue
            with open(os.path.join(base, name), errors="replace") as handle:
                text = re.sub(r"<!--.*?-->", "", handle.read(), flags=re.S)
            names.update(PROPERTY_ELEMENT.findall(text))
            for match in re.finditer(r">([^<]+)<|=\"([^\"]*)\"", text):
                names.update(PROPERTY.findall(match.group(1) or match.group(2)))
    return names


def diagnose(fdm_root: str, variant: str, jsbsim_root: str | None) -> str:
    import jsbsim  # imported here so --help works without the bindings

    if jsbsim_root:
        root, aero, aircraft_dir = jsbsim_root, variant, os.path.join(jsbsim_root, "aircraft", variant)
        engine_path, systems_path = "engine", "systems"
    else:
        root = os.path.join(fdm_root, variant)
        aero = json.load(open(os.path.join(root, "source.json")))["aero"]
        aircraft_dir = os.path.join(root, "aircraft")
        engine_path, systems_path = f"aircraft/{aero}/Engines", f"aircraft/{aero}/Systems"

    exec_ = jsbsim.FGFDMExec(root, None)
    exec_.set_debug_level(0)
    exec_.set_engine_path(engine_path)
    exec_.set_systems_path(systems_path)
    names = referenced(aircraft_dir)
    for name in names:
        if name.startswith("/"):
            try:
                exec_[name] = 0
            except Exception:  # noqa: BLE001 - not every match is a property
                pass
    try:
        exec_.load_model(aero)
    except Exception as error:  # noqa: BLE001 - the message is the point
        return f"will not load: {str(error).strip()}"

    catalog = {entry.split(" (")[0].replace("[0]", "") for entry in exec_.get_property_catalog()}
    for name in names:
        if name.replace("[0]", "") not in catalog and not name.startswith("ic/"):
            try:
                exec_[name] = 0
            except Exception:  # noqa: BLE001
                pass

    # Then let it tell us what else it wants, one property at a time.
    created: list[str] = []
    for _ in range(80):
        try:
            exec_["ic/h-agl-ft"] = 10
            exec_["ic/terrain-elevation-ft"] = 0
            exec_["ic/vc-kts"] = 0
            exec_.run_ic()
            exec_.do_trim(2)
            for _ in range(600):
                exec_.run()
            break
        except Exception as error:  # noqa: BLE001
            match = MISSING.search(str(error))
            if not match:
                return f"loads, then: {str(error).strip().splitlines()[-1]}" + (
                    f" (after creating {', '.join(created)})" if created else "")
            exec_[match.group(1)] = 0
            created.append(match.group(1))
    else:
        return f"still asking for properties after 80 tries; last were {', '.join(created[-5:])}"
    return "ok on the ground" + (f", once these were created: {', '.join(created)}" if created else "")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("fdm_root", help="the fdm/ folder from scan-flightgear-aircraft.py --extract-fdm")
    parser.add_argument("variants", nargs="+")
    parser.add_argument("--jsbsim-root", help="diagnose a JSBSim checkout's own aircraft instead")
    args = parser.parse_args()
    for variant in args.variants:
        try:
            verdict = diagnose(args.fdm_root, variant, args.jsbsim_root)
        except ModuleNotFoundError:
            print("jsbsim bindings not importable: set PYTHONPATH to a JSBSim build's tests/ and install numpy",
                  file=sys.stderr)
            return 2
        except Exception as error:  # noqa: BLE001 - one bad aircraft must not stop the rest
            verdict = f"harness error: {type(error).__name__}: {error}"
        print(f"{variant:28s} {verdict}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
