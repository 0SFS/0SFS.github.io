#!/usr/bin/env python3
"""Focused numerical qualification of the surrogate optical bake, not appearance."""

import hashlib
import json
import math
import subprocess
from pathlib import Path

from bake_parcel import ROOT, parcel


def interpolate(cases, temperature, pressure, phi, key):
    # Mirror only the declared interpolation contract: T/phi linear, p and yield log.
    t_axis = sorted({c["reactantTemperatureKelvin"] for c in cases})
    p_axis = sorted({c["pressurePascal"] for c in cases})
    f_axis = sorted({c["equivalenceRatio"] for c in cases})

    def bracket(axis, value, logarithmic=False):
        lo, hi = next((a, b) for a, b in zip(axis, axis[1:]) if a <= value <= b)
        weight = math.log(value / lo) / math.log(hi / lo) if logarithmic else (value - lo) / (hi - lo)
        return [(lo, 1 - weight), (hi, weight)]

    log_yield = key == "chBandEnergyJoulesPerKgFuel"
    total = 0.0
    for t, tw in bracket(t_axis, temperature):
        for p, pw in bracket(p_axis, pressure, True):
            for f, fw in bracket(f_axis, phi):
                case = next(c for c in cases if c["reactantTemperatureKelvin"] == t
                            and c["pressurePascal"] == p and c["equivalenceRatio"] == f)
                value = math.log(case[key]) if log_yield else case[key]
                total += tw * pw * fw * value
    return math.exp(total) if log_yield else total


def main():
    artifact = Path(__file__).with_name("ndodecane-ch-a-parcel.json")
    data = json.loads(artifact.read_text())
    out = Path(subprocess.check_output([
        "node", "--input-type=module", "-e",
        "import {newOutputDirectory} from './scripts/outputDirectory.mjs';"
        "console.log(newOutputDirectory('validation','combustion-parcel-check'));",
    ], cwd=ROOT, text=True).strip())
    report = {"qualification": "Selected numerical checks only; no measured engine calibration or GPU appearance result.",
              "artifactSha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
              "refinedIntegration": [], "offGridInterpolation": []}
    for t, p, phi in [(800, 1, 1.0), (1000, 3, 1.0), (1200, 0.2, 1.0)]:
        reference, _ = parcel(t, p, phi, 0.15, tolerance=1e-11)
        baseline = next(c for c in data["cases"] if c["reactantTemperatureKelvin"] == t
                        and c["pressurePascal"] == p * 101325 and c["equivalenceRatio"] == phi)
        error = abs(reference["chBandEnergyJoulesPerKgFuel"] / baseline["chBandEnergyJoulesPerKgFuel"] - 1)
        report["refinedIntegration"].append({"temperatureKelvin": t, "pressureAtmospheres": p,
            "equivalenceRatio": phi, "relativeYieldDifference": error,
            "baselineYieldJoulesPerKg": baseline["chBandEnergyJoulesPerKgFuel"],
            "refinedYieldJoulesPerKg": reference["chBandEnergyJoulesPerKgFuel"]})
        if error > 0.005:
            raise AssertionError(f"Refined integration differs by {error}")
    for t, p, phi in [(900, math.sqrt(3), 0.9), (1100, math.sqrt(15), 0.9), (900, math.sqrt(0.2), 1.0)]:
        direct, _ = parcel(t, p, phi, 0.15)
        row = {"temperatureKelvin": t, "pressureAtmospheres": p, "equivalenceRatio": phi}
        for key in ["chBandEnergyJoulesPerKgFuel", "productTemperatureKelvin"]:
            approximation = interpolate(data["cases"], t, p * 101325, phi, key)
            row[key] = {"direct": direct[key], "interpolated": approximation,
                        "relativeDifference": abs(approximation / direct[key] - 1)}
        report["offGridInterpolation"].append(row)
    # Pure-data conservation and radiative-power checks independent of rendering.
    assert all(c["maxEnthalpyResidualJoulesPerKg"] < 0.1 for c in data["cases"])
    assert all(c["maxElementMassFractionResidual"] < 1e-10 for c in data["cases"])
    assert all(0 < c["chBandEnergyJoulesPerKgFuel"] < 43.3e6 for c in data["cases"])
    report["maxChToFuelEnergyRatio"] = max(c["chBandEnergyJoulesPerKgFuel"] / 43.3e6 for c in data["cases"])
    report["maxRateSetRatio"] = max(max(c["carlVsPeetersJoulesPerKgFuel"]) / min(c["carlVsPeetersJoulesPerKgFuel"]) for c in data["cases"])
    target = out / "report.json"
    target.write_text(json.dumps(report, indent=2) + "\n")
    print(str(target))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
