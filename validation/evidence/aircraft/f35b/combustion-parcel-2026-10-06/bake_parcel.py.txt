#!/usr/bin/env python3
"""Offline n-dodecane parcel / CH(A) optical closure; never a runtime dependency.

0sfs owns this aircraft optical bake. This does not change engine dynamics.
See README.md for physical scope, primary sources and reproduction commands.
"""

import argparse
import hashlib
import json
import math
import subprocess
from pathlib import Path

import cantera as ct
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
AVOGADRO = 6.02214076e23
PLANCK = 6.62607015e-34
LIGHT_SPEED = 299792458.0
PHOTON_JOULES = PLANCK * LIGHT_SPEED / (431e-9)
R_CAL = 1.98720425864083
RADIATIVE_RATE = 1.85e6
QUENCH = {
    # A [cm3/mol/s / K**b], b, Ea [cal/mol], Nori 2008 Table 2.2.
    "h2o": (5.3e13, 0.0, 0.0),
    "co2": (2.41e-1, 4.3, -1694.0),
    "co": (2.44e12, 0.5, 0.0),
    "h2": (1.47e14, 0.0, 1361.0),
    "o2": (2.48e6, 2.14, -1720.0),
    "n2": (3.03e2, 3.4, -381.0),
    "ch4": (1.73e13, 0.0, 167.0),
}
SOURCES = [
    "https://www.seitzman.gatech.edu/nori_venkata_n_200808_phd.pdf",
    "https://www.sciencedirect.com/science/article/pii/S1540748908001089",
    "https://github.com/Cantera/cantera/blob/v3.2.0/data/nDodecane_Reitz.yaml",
    "https://doi.org/10.1016/j.fuel.2014.07.028",
    "https://cantera.org/3.2/examples/python/reactors/reactor1.html",
]


def arrhenius(a, b, ea, temperature):
    return a * temperature**b * math.exp(-ea / (R_CAL * temperature))


def emission(gas):
    """Return Carl / Peeters CH(A) band W per kg mixture, in that order."""
    # Cantera kmol/m3 -> mol/cm3. Do not confuse mol with molecules.
    c = dict(zip(gas.species_names, gas.concentrations * 1e-3))
    t = gas.T
    loss = RADIATIVE_RATE + sum(arrhenius(*rate, t) * c[species]
                                 for species, rate in QUENCH.items())
    carl = c["c2h"] * (arrhenius(6.02e12, 0.0, 457.0, t) * c["o"]
                       + arrhenius(6.02e-4, 4.4, -2285.0, t) * c["o2"])
    peeters = c["c2h"] * (1.08e13 * c["o"] + 2.17e10 * c["o2"])
    # QSS mol/cm3 * decays/s -> photons/m3/s -> W/kg mixture.
    multiplier = RADIATIVE_RATE / loss * 1e6 * AVOGADRO * PHOTON_JOULES / gas.density
    return np.array([carl, peeters]) * multiplier


def parcel(temperature, pressure_atm, phi, oxygen, *, tolerance=1e-9):
    # Product dilution is an explicit surrogate inlet, not F135 measured data.
    # Replaces a portion of fresh air with fully burned C12H26 products.
    dilution = (0.21 - oxygen) / 0.21
    product = {"co2": 12 / 94.56, "h2o": 13 / 94.56, "n2": 69.56 / 94.56}
    oxidizer = {"o2": oxygen, "co2": dilution * product["co2"],
                "h2o": dilution * product["h2o"],
                "n2": (1 - dilution) * 0.79 + dilution * product["n2"]}
    gas = ct.Solution("nDodecane_Reitz.yaml", "nDodecane_IG")
    gas.TP = temperature, pressure_atm * ct.one_atm
    gas.set_equivalence_ratio(phi, "c12h26:1", oxidizer)
    initial_h = gas.enthalpy_mass
    fuel_index = gas.species_index("c12h26")
    initial_fuel_fraction = gas.Y[fuel_index]
    initial_elements = {element: gas.elemental_mass_fraction(element) for element in gas.element_names}
    equilibrium = ct.Solution("nDodecane_Reitz.yaml", "nDodecane_IG")
    equilibrium.TPY = gas.T, gas.P, gas.Y
    equilibrium.equilibrate("HP")
    equilibrium_temperature = equilibrium.T
    reactor = ct.IdealGasConstPressureReactor(gas, energy="on", clone=True)
    network = ct.ReactorNet([reactor])
    network.rtol = tolerance
    network.atol = tolerance * 1e-10
    state = reactor.phase
    energy = np.zeros(2)
    previous = emission(state)
    old_t = 0.0
    max_power = 0.0
    ignition_time = None
    # Yield is conditional on a burning parcel, not a native ignition-delay law.
    end_time = 1000.0
    peak_time = 0.0
    max_h_residual = 0.0
    steps = 0
    trace = []
    while network.time < end_time and steps < 100000:
        now = network.step()
        current = emission(state)
        dt = now - old_t
        energy += (current + previous) * (0.5 * dt)
        max_h_residual = max(max_h_residual, abs(state.enthalpy_mass - initial_h))
        if state.T > temperature + 0.1 * (equilibrium_temperature - temperature) and ignition_time is None:
            ignition_time = now
        if current[0] > max_power:
            max_power = current[0]
            peak_time = now
        # Keep all solver intervals: necessary for independent quadrature/error checks.
        trace.append([now, state.T, float(current[0]), float(current[1])])
        previous = current
        old_t = now
        steps += 1
        # Integrate the complete narrow CH(A) production event and 20 ms products.
        if (ignition_time is not None and now > peak_time + 0.02
                and state.T > temperature + 0.95 * (equilibrium_temperature - temperature)
                and state.Y[fuel_index] < 1e-4 * initial_fuel_fraction
                and current[0] < max_power * 1e-6):
            break
    if ignition_time is None or state.T < temperature + 0.95 * (equilibrium_temperature - temperature):
        raise RuntimeError(f"Parcel did not burn: T={temperature} P={pressure_atm} phi={phi} O2={oxygen}; final T={state.T}, equilibrium T={equilibrium_temperature}, t={network.time}, steps={steps}")
    burned = initial_fuel_fraction - state.Y[fuel_index]
    fuel_conversion = burned / initial_fuel_fraction
    if fuel_conversion < 0.999:
        raise RuntimeError(f"Parent fuel not consumed: {fuel_conversion}")
    # Purely a duration diagnostic, not a second simulated engine ignition delay.
    significant = [row[0] for row in trace if row[2] > max_power * 0.01]
    chemical_duration = significant[-1] - significant[0]
    element_error = max(abs(state.elemental_mass_fraction(element) - value)
                        for element, value in initial_elements.items())
    return {
        "reactantTemperatureKelvin": temperature,
        "pressurePascal": pressure_atm * ct.one_atm,
        "equivalenceRatio": phi,
        "oxidizerMoleFractions": oxidizer,
        "chBandEnergyJoulesPerKgFuel": float(energy[0] / burned),
        "carlVsPeetersJoulesPerKgFuel": [float(value / burned) for value in energy],
        "productTemperatureKelvin": float(state.T),
        "equilibriumProductTemperatureKelvin": float(equilibrium_temperature),
        "productSpecificEnthalpyJoulesPerKg": float(state.enthalpy_mass),
        "reactantSpecificEnthalpyJoulesPerKg": float(initial_h),
        "reactiveMixtureKgPerKgFuel": float(1 / initial_fuel_fraction),
        "hotProductDensityKgPerM3": float(state.density),
        "hotProductMeanMolecularWeightKgPerKmol": float(state.mean_molecular_weight),
        "hotProductHeatCapacityJoulesPerKgKelvin": float(state.cp_mass),
        "chemicalDurationSeconds": chemical_duration,
        "ignitionDelaySeconds": ignition_time,
        "maxEnthalpyResidualJoulesPerKg": max_h_residual,
        "maxElementMassFractionResidual": element_error,
        "fuelConversion": float(fuel_conversion),
        "solverSteps": steps,
    }, trace


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path)
    parser.add_argument("--quick", action="store_true", help="Only the nominal parcel, for setup checking")
    args = parser.parse_args()
    out = args.out
    if out is None:
        # Share the repository's dated output convention without reimplementing it.
        out = Path(subprocess.check_output([
            "node", "--input-type=module", "-e",
            "import {newOutputDirectory} from './scripts/outputDirectory.mjs';"
            "console.log(newOutputDirectory('validation','combustion-parcel'));",
        ], cwd=ROOT, text=True).strip())
    out.mkdir(parents=True, exist_ok=True)
    cases = []
    temperatures = [1000] if args.quick else [600, 800, 1000, 1200]
    pressures = [3] if args.quick else [0.2, 1, 3, 5]
    phis = [1.0] if args.quick else [0.8, 1.0]
    oxygen_fractions = [0.15]
    for t in temperatures:
        for p in pressures:
            for phi in phis:
                for oxygen in oxygen_fractions:
                    record, trace = parcel(t, p, phi, oxygen)
                    cases.append(record)
                    print(json.dumps({k: record[k] for k in ["reactantTemperatureKelvin", "pressurePascal", "equivalenceRatio", "chBandEnergyJoulesPerKgFuel", "productTemperatureKelvin", "solverSteps"]}), flush=True)
                    name = f"T{t}-p{p}-phi{phi}-o2{oxygen}"
                    (out / f"{name}.json").write_text(json.dumps({"case": record, "traceColumns": ["timeSeconds", "temperatureKelvin", "carlWattsPerKgMixture", "peetersWattsPerKgMixture"], "trace": trace}, separators=(",", ":")) + "\n")
    mechanism_path = Path(ct.get_data_directories()[-1]) / "nDodecane_Reitz.yaml"
    artifact = {
        "schemaVersion": 1,
        "model": "ndodecane-constant-pressure-parcel-ch-a-qss",
        "qualification": "Uncalibrated fuel/flow surrogate; not an F135 measurement or flame-geometry solution.",
        "spectralApproximation": {"species": "CH(A-X)", "representativeWavelengthNm": 431, "description": "Dominant-band approximation. Total A-state photon count represented at 431 nm; no measured F135 spectral line shape is claimed."},
        "sources": SOURCES,
        "provenance": {"canteraVersion": ct.__version__, "numpyVersion": np.__version__, "mechanismFile": mechanism_path.name, "mechanismSha256": hashlib.sha256(mechanism_path.read_bytes()).hexdigest(), "generatorSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
        "caseAxes": {"reactantTemperatureKelvin": temperatures, "pressureAtmospheres": pressures, "equivalenceRatio": phis, "oxidizerOxygenMoleFraction": oxygen_fractions},
        "cases": cases,
    }
    (out / "ndodecane-ch-a-parcel.json").write_text(json.dumps(artifact, indent=2) + "\n")
    print(str(out / "ndodecane-ch-a-parcel.json"), flush=True)


if __name__ == "__main__":
    main()
