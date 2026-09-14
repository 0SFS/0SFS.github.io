#!/usr/bin/env python3
"""Narrow G1 cruise fuel-flow diagnostic at observed AFM N1.

Evaluates the installed SF50 propulsion model at imposed AFM cruise conditions
and compares its steady fuel flow with the reviewed printed value. It imposes
pressure altitude, static air temperature, true airspeed and the printed
observed N1; it does not trim the airframe, fit any coefficient, or establish
that the aircraft can hold the condition. Aerodynamic and installed-thrust
parameters are read from the package unchanged.

A matching fuel flow would NOT identify TSFC: the model computes fuel flow as
its own assumed installed thrust times TSFC, so the two are not separable from
this comparison. See docs/validation/sf50-calibration-qualification-2026-09-12.md.
"""

import argparse
import json
import pathlib
import subprocess
import sys

# The package's turbine endpoints. N1 is linear in throttle position between
# them (FGTurbine::Run), so an observed N1 is imposed by position, not by a
# thrust-lever angle. An AFM N1 observation is not a TLA command.
IDLE_N1 = 30.0
MAX_N1 = 100.0

# JSBSim's JET-A density and the AFM's nominal density, kept separate because
# the AFM prints volume flow and the model computes mass flow.
JSBSIM_JET_A_LB_PER_US_GAL = 6.74
AFM_NOMINAL_LB_PER_US_GAL = 6.76

RANKINE_PER_CELSIUS = 1.8
KELVIN_AT_ZERO_C = 273.15


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--native-build", required=True,
                        help="CMake build directory containing the built jsbsim Python module")
    parser.add_argument("--jsbsim-source", required=True,
                        help="Canonical JSBSim checkout, recorded for provenance")
    parser.add_argument("--out", required=True, help="New output JSON path")
    parser.add_argument("--data-root", default=None,
                        help="JSBSim data tree to load; defaults to the app's public/jsbsim-data. "
                             "Point it at a copy to evaluate a proposed package change without editing it.")
    parser.add_argument("--altitudes", default="5000,15000",
                        help="Comma-separated reviewed pressure altitudes in feet")
    return parser.parse_args()


def git_identity(source):
    def run(*args):
        result = subprocess.run(["git", "--no-optional-locks", "-C", source, *args],
                                capture_output=True, text=True, check=True)
        return result.stdout.strip()
    return {"commit": run("rev-parse", "HEAD"),
            "branch": run("rev-parse", "--abbrev-ref", "HEAD"),
            "dirty": run("status", "--porcelain", "--untracked-files=no") != ""}


def reviewed_rows(root, altitudes):
    """Reviewed ISA rows, taken from the existing extraction and ledger."""
    evidence = root / "planes/Cirrus_Vision_Jet/tests/public-evidence"
    candidates = json.loads((evidence / "primary-afm-expanded-candidates.json").read_text())
    ledger = json.loads((evidence / "afm-qualification-2026-09-12.json").read_text())
    reviewed = {row["targetId"] for row in ledger["reviewedRows"]}

    def target_id(row):
        power = row["power"]
        tag = "MCT" if power == "MCT" else \
            "max-range" if power in ("max-range", "Max Range") else "tabulated-part-power"
        return (f"g1-cruise-{row['weightLb']}-{row['pressureAltitudeFt']}-"
                f"{row['deltaIsaC']}-{tag}-{row['n1Pct']}")

    rows = []
    for row in candidates["cruise"]:
        if row["deltaIsaC"] != 0 or row["weightLb"] != 6000:
            continue
        if row["pressureAltitudeFt"] not in altitudes:
            continue
        identity = target_id(row)
        rows.append({**row, "targetId": identity,
                     "inReviewLedger": identity in reviewed})
    rows.sort(key=lambda row: (row["pressureAltitudeFt"], -row["n1Pct"]))
    return rows, candidates["source"], ledger["recordedPrimarySha256"]


def engine_bleed_fraction(data_root):
    """The package's declared bleed fraction, needed to recover dry thrust."""
    engine = (data_root / "engine/fj33_5a.xml").read_text()
    return float(engine.split("<bleed>")[1].split("</bleed>")[0])


def evaluate(fdm, row, bleed_fraction):
    """Impose one AFM row's conditions and read the steady propulsion state."""
    target_pressure_altitude = float(row["pressureAltitudeFt"])
    printed_oat_c = float(row["oatC"])
    fdm["atmosphere/delta-T"] = 0.0
    fdm["ic/h-sl-ft"] = target_pressure_altitude
    fdm["ic/vt-kts"] = float(row["tasKt"])
    fdm["fcs/gear-cmd-norm"] = 0.0
    fdm["fcs/flap-cmd-norm"] = 0.0
    assert fdm.run_ic()
    isa_oat_c = (fdm["atmosphere/T-R"] / RANKINE_PER_CELSIUS) - KELVIN_AT_ZERO_C

    # JSBSim's standard atmosphere uses the true -1.98 C/1000 ft lapse rate,
    # while the AFM's standard-temperature convention is -2 C/1000 ft (printed
    # 1-15). The printed OAT is therefore imposed through an explicit offset,
    # and both temperatures are recorded rather than treated as equal.
    #
    # That offset also shifts the hydrostatic pressure profile, so temperature
    # and pressure altitude are solved together instead of assuming the printed
    # altitude is the geometric one. Residuals are asserted by the caller.
    geometric = target_pressure_altitude
    delta_t_rankine = (printed_oat_c - isa_oat_c) * RANKINE_PER_CELSIUS
    for _ in range(64):
        fdm["atmosphere/delta-T"] = delta_t_rankine
        fdm["ic/h-sl-ft"] = geometric
        assert fdm.run_ic()
        oat_error = printed_oat_c - (
            (fdm["atmosphere/T-R"] / RANKINE_PER_CELSIUS) - KELVIN_AT_ZERO_C)
        altitude_error = target_pressure_altitude - fdm["atmosphere/pressure-altitude"]
        if abs(oat_error) < 1e-12 and abs(altitude_error) < 1e-6:
            break
        delta_t_rankine += oat_error * RANKINE_PER_CELSIUS
        geometric += altitude_error

    fdm["propulsion/set-running"] = -1
    position = (float(row["n1Pct"]) - IDLE_N1) / (MAX_N1 - IDLE_N1)
    fdm["fcs/throttle-cmd-norm[0]"] = position
    fdm["fcs/throttle-pos-norm[0]"] = position
    assert fdm.run_ic()

    imposed_oat_c = (fdm["atmosphere/T-R"] / RANKINE_PER_CELSIUS) - KELVIN_AT_ZERO_C
    model_pph = fdm["propulsion/engine[0]/fuel-flow-rate-pps"] * 3600.0
    model_gph = fdm["propulsion/engine[0]/fuel-flow-rate-gph"]
    printed_gph = float(row["fuelFlowUsGph"])

    # The turbine seeks thrust times TSFC but never reports below its estimated
    # idle flow. Recover the unclamped product from exposed properties, using
    # the dry thrust the fuel-flow relation actually uses, so a clamped row is
    # identified from the model's own outputs instead of assumed.
    net_thrust = fdm["propulsion/engine[0]/thrust-lbs"]
    tsfc = fdm["propulsion/engine[0]/tsfc"]
    unclamped_pph = (net_thrust / (1.0 - bleed_fraction)) * tsfc
    at_floor = model_pph > unclamped_pph * (1.0 + 1e-9)
    return {
        "targetId": row["targetId"],
        "source": {"pdfPage": row["pdfPage"], "printedPage": row["printedPage"]},
        "inReviewLedger": row["inReviewLedger"],
        "printed": {"pressureAltitudeFt": row["pressureAltitudeFt"],
                    "weightLb": row["weightLb"], "deltaIsaC": row["deltaIsaC"],
                    "oatC": printed_oat_c, "n1Pct": row["n1Pct"],
                    "power": row["power"], "tasKt": row["tasKt"],
                    "fuelFlowUsGph": printed_gph,
                    "specificRangeNmPer10UsGal": row["specificRangeNmPer10UsGal"]},
        "imposed": {
            "pressureAltitudeFt": fdm["atmosphere/pressure-altitude"],
            "geometricAltitudeSolvedFt": fdm["position/h-sl-ft"],
            "oatC": imposed_oat_c,
            "jsbsimIsaOatCAtSameAltitude": isa_oat_c,
            "deltaTRankine": fdm["atmosphere/delta-T"],
            "densityAltitudeFt": fdm["atmosphere/density-altitude"],
            "tasKt": fdm["velocities/vtrue-kts"],
            "mach": fdm["velocities/mach"],
            "throttlePosition": fdm["fcs/throttle-pos-norm[0]"],
            "weightLb": fdm["inertia/weight-lbs"],
        },
        "model": {
            "n1Pct": fdm["propulsion/engine[0]/n1"],
            "n2Pct": fdm["propulsion/engine[0]/n2"],
            "netThrustLb": fdm["propulsion/engine[0]/thrust-lbs"],
            "correctedTsfc": fdm["propulsion/engine[0]/tsfc"],
            "fuelFlowPph": model_pph,
            "fuelFlowUsGph": model_gph,
            "dryThrustTimesTsfcPph": unclamped_pph,
            "atEstimatedIdleFuelFlowFloor": at_floor,
        },
        "comparison": {
            "fuelFlowRatioModelOverPrinted": model_gph / printed_gph,
            "fuelFlowDifferenceUsGph": model_gph - printed_gph,
            "printedMassFlowPphAtJsbsimDensity": printed_gph * JSBSIM_JET_A_LB_PER_US_GAL,
            "printedMassFlowPphAtAfmNominalDensity": printed_gph * AFM_NOMINAL_LB_PER_US_GAL,
            "densityConventionSensitivityFraction":
                AFM_NOMINAL_LB_PER_US_GAL / JSBSIM_JET_A_LB_PER_US_GAL - 1.0,
        },
    }


def main():
    args = parse_args()
    out = pathlib.Path(args.out)
    if out.exists():
        raise SystemExit(f"Refusing to overwrite an existing diagnostic output: {out}")
    root = pathlib.Path(__file__).resolve().parent.parent
    native_build = pathlib.Path(args.native_build).resolve()
    sys.path.insert(0, str(native_build / "tests"))
    from jsbsim import _jsbsim as jsbsim

    altitudes = [int(value) for value in args.altitudes.split(",")]
    rows, source, primary_sha256 = reviewed_rows(root, altitudes)
    if not rows:
        raise SystemExit("No reviewed ISA rows matched the requested altitudes")

    data_root = pathlib.Path(args.data_root).resolve() if args.data_root else root / "public/jsbsim-data"
    fdm = jsbsim.FGFDMExec(str(data_root))
    fdm.set_debug_level(0)
    fdm.set_aircraft_path("aircraft")
    fdm.set_engine_path("engine")
    fdm.set_systems_path("systems")
    assert fdm.load_model("sf50"), "The canonical G1 package must load"
    fdm.set_dt(1.0 / 120.0)

    bleed_fraction = engine_bleed_fraction(data_root)
    results = [evaluate(fdm, row, bleed_fraction) for row in rows]
    for result in results:
        assert abs(result["model"]["n1Pct"] - result["printed"]["n1Pct"]) < 1e-6, \
            "Imposed N1 must equal the printed observation"
        assert abs(result["imposed"]["oatC"] - result["printed"]["oatC"]) < 1e-6, \
            "Imposed static temperature must equal the printed OAT"
        assert abs(result["imposed"]["pressureAltitudeFt"]
                   - result["printed"]["pressureAltitudeFt"]) < 1e-3, \
            "Imposed pressure altitude must equal the printed altitude"

    ratios = [result["comparison"]["fuelFlowRatioModelOverPrinted"] for result in results]
    floored = [result for result in results if result["model"]["atEstimatedIdleFuelFlowFloor"]]
    report = {
        "schemaVersion": 1,
        "diagnostic": "g1-cruise-fuel-flow-at-observed-n1",
        "purpose": "Compare installed model fuel flow with reviewed AFM cruise rows at imposed conditions.",
        "aircraftPackage": "sf50 (G1, canonical)",
        "dataRoot": str(data_root),
        "engineFile": "engine/fj33_5a.xml",
        "jsbsim": git_identity(str(pathlib.Path(args.jsbsim_source).resolve())),
        "nativeBuild": str(native_build),
        "afmSource": source,
        "recordedPrimarySha256": primary_sha256,
        "conventions": {
            "altitude": "Printed cruise 'Alt FT' is imposed as pressure altitude, solved through the geometric altitude because the imposed temperature offset shifts the hydrostatic pressure profile. AFM 31452-001 printed 1-15 defines standard temperature at a given pressure altitude, and every temperature-gridded Section 5 table is indexed by 'Press Alt'.",
            "atmosphere": "JSBSim standard atmosphere with an explicit atmosphere/delta-T offset so the imposed static temperature equals the printed OAT. The AFM's standard-temperature convention is 2 C per 1000 ft; JSBSim uses the true 1.98 C per 1000 ft lapse rate. Both values are recorded per row.",
            "mach": "Computed by JSBSim from the imposed true airspeed and the imposed static temperature; not printed by the AFM.",
            "temperature": "Printed OAT is free-air static temperature (AFM printed 1-14). It is not total inlet temperature.",
            "fuelVolume": "AFM gallons are US gallons: the same cruise table prints specific range in Nm per 10 U.S. Gal, and Section 5's conversion chart is U.S. Gallons to Liters. The model computes mass flow; JSBSim converts with JET-A at 6.74 lb per US gallon while the AFM's nominal density is 6.76, a 0.30 percent difference recorded per row.",
            "n1": "Throttle position is set to (printed N1 - idle N1) / (max N1 - idle N1) because the package's turbine maps N1 linearly to position. An AFM N1 observation is not a TLA command and this is not a FADEC schedule.",
            "steadyEvaluation": "Zero-time trim (run_ic) after propulsion/set-running, which requires the steady-trim fuel-flow correction in the recorded JSBSim revision.",
        },
        "frozenSubsystems": [
            "installed-thrust tables and rated thrust in engine/fj33_5a.xml",
            "TSFC 0.65 and bleed 0.04 in engine/fj33_5a.xml",
            "all aerodynamic coefficients in aircraft/sf50/sf50.xml",
        ],
        "engineBleedFraction": bleed_fraction,
        "rowCount": len(results),
        "summary": {
            "minRatioModelOverPrinted": min(ratios),
            "maxRatioModelOverPrinted": max(ratios),
            "meanRatioModelOverPrinted": sum(ratios) / len(ratios),
            "rowsAtEstimatedIdleFuelFlowFloor": [result["targetId"] for result in floored],
            "observedIdleFuelFlowFloorPph":
                min((result["model"]["fuelFlowPph"] for result in floored), default=None),
            "observedIdleFuelFlowFloorUsGph":
                min((result["model"]["fuelFlowUsGph"] for result in floored), default=None),
        },
        "results": results,
        "limitations": [
            "Diagnostic only. No coefficient was fitted and no aircraft-validation claim is made.",
            "The AFM rows are same-source calibration candidates whose conditions remain unapproved; the review ledger records their blockers and eligibleForCalibration is false.",
            "Cruise gear/flap position, anti-ice and bleed are not printed in the AFM cruise section. Gear and flaps up follow the AFM's normal-procedures basis and its explicitly labelled Gear UP, Flaps 50% section; anti-ice OFF is inferred from the standard-day basis and is not a printed condition.",
            "Airframe weight is not an input to this steady propulsion evaluation. The printed row's 6,000 lb enters only through its printed N1 and TAS.",
            "The airframe is not trimmed and no equilibrium is claimed; drag, lift and pitch are untouched.",
            "Fuel flow is modelled thrust times TSFC, so agreement or disagreement cannot separate installed thrust from TSFC.",
            "Zero-time trim still leaves EGT, oil pressure, nozzle position and EPR at their previous values in the recorded JSBSim revision.",
        ],
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")

    header = (f"{'target':52s} {'PA':>6s} {'OAT':>5s} {'N1':>6s} {'TAS':>5s} "
              f"{'mach':>6s} {'thrust':>7s} {'tsfc':>6s} "
              f"{'AFM gph':>8s} {'model':>8s} {'ratio':>6s}")
    print(header)
    print("-" * len(header))
    for result in results:
        printed, imposed, model = result["printed"], result["imposed"], result["model"]
        print(f"{result['targetId']:52s} {printed['pressureAltitudeFt']:6d} "
              f"{printed['oatC']:5.1f} {printed['n1Pct']:6.1f} {printed['tasKt']:5.0f} "
              f"{imposed['mach']:6.4f} {model['netThrustLb']:7.1f} "
              f"{model['correctedTsfc']:6.4f} {printed['fuelFlowUsGph']:8.1f} "
              f"{model['fuelFlowUsGph']:8.1f} "
              f"{result['comparison']['fuelFlowRatioModelOverPrinted']:6.3f}"
              f"{'  <- idle-flow floor' if model['atEstimatedIdleFuelFlowFloor'] else ''}")
    print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
