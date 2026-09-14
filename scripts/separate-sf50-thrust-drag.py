#!/usr/bin/env python3
"""Separate the SF50 package's thrust error from its drag error.

diagnose-sf50-steady-flight.py shows the model climbing faster than the AFM
and needing less N1 than printed to hold MCT cruise speed. Both say thrust
minus drag is too large, but one table cannot say which. This script writes
one equation per AFM condition and fits candidate errors to all of them.

For each AFM ISA MCT cruise altitude and each of the four AFM weights:

  cruise  the real airplane balances thrust and drag at the printed TAS and
          MCT N1, so the model's excess is dE = T_m(MCT N1, V) - D_m(V)
  climb   the real airplane's excess force is W sin(gamma_afm) at the printed
          KIAS and MCT N1, so dE = W (sin gamma_m - sin gamma_afm)

Candidate errors, each a column in a least-squares fit of dE:

  thrust scale    a * T_m          thrust overstated by the fraction a
  parasite drag   p * q * S        CD0 the model lacks (negative: it has too much)
  induced drag    i * D_induced_m  fraction of induced drag the model lacks

Induced drag scales with weight squared while thrust and parasite drag do not,
so the eight equations per altitude distinguish these. Nothing is fitted into
the model; the output is a diagnosis. It carries AFM values and belongs in an
ignored directory.
"""

import argparse
import importlib.util
import json
import math
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("steady", ROOT / "scripts/diagnose-sf50-steady-flight.py")
steady = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(steady)

WEIGHTS = (4500, 5000, 5500, 6000)
HYPOTHESES = {
    "thrust": ("T",), "parasite": ("qS",), "induced": ("Di",),
    "thrust+parasite": ("T", "qS"), "thrust+induced": ("T", "Di"), "parasite+induced": ("qS", "Di"),
    "all three": ("T", "qS", "Di"),
}


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--native-build", required=True, help="CMake build directory with the jsbsim Python module")
    p.add_argument("--jsbsim-source", required=True, help="JSBSim checkout, recorded for provenance")
    p.add_argument("--data-root", help="JSBSim data root to evaluate (default: public/jsbsim-data)")
    p.add_argument("--out", required=True, help="New output directory")
    return p.parse_args()


def afm_climb_at(climb, weight, alt, oat):
    """AFM KIAS and rate of climb at one weight, interpolated in altitude and OAT."""
    rows = [r for r in climb if r["weightLb"] == weight]
    alts = sorted({r["pressureAltitudeFt"] for r in rows})
    lo = max(a for a in alts if a <= alt)
    hi = min(a for a in alts if a >= alt)

    def at_alt(a):
        rr = sorted((r for r in rows if r["pressureAltitudeFt"] == a), key=lambda r: r["oatC"])
        for r0, r1 in zip(rr, rr[1:]):
            if r0["oatC"] <= oat <= r1["oatC"]:
                t = (oat - r0["oatC"]) / (r1["oatC"] - r0["oatC"])
                return r0["kias"] + t * (r1["kias"] - r0["kias"]), r0["rocFpm"] + t * (r1["rocFpm"] - r0["rocFpm"])
        return None

    a0, a1 = at_alt(lo), at_alt(hi)
    if a0 is None or a1 is None:
        return None
    t = 0.0 if hi == lo else (alt - lo) / (hi - lo)
    return a0[0] + t * (a1[0] - a0[0]), a0[1] + t * (a1[1] - a0[1])


def throttle_for(n1):
    return min(1.0, (n1 - steady.IDLE_N1) / (steady.MAX_N1 - steady.IDLE_N1))


def equations(jsbsim, data_root, work):
    pages = steady.poh_pages(ROOT, work)
    climb = steady.climb_table(pages)
    mct = steady.afm_mct_n1(ROOT)
    candidates = json.loads((ROOT / "planes/Cirrus_Vision_Jet/tests/public-evidence/primary-afm-expanded-candidates.json").read_text())
    cruise = {(r["weightLb"], r["pressureAltitudeFt"]): r for r in candidates["cruise"]
              if r["deltaIsaC"] == 0 and r["power"] == "MCT"}
    altitudes = sorted({a for _, a in cruise})
    eqs, unsolved = [], []
    for weight in WEIGHTS:
        aircraft, loading = steady.loaded_data_root(data_root, work, weight)
        model = steady.Model(jsbsim, data_root, aircraft)
        f = model.fdm
        wing_area = f["metrics/Sw-sqft"]
        for alt in altitudes:
            row = cruise.get((weight, alt))
            if row:
                fixed = dict(pressure_altitude_ft=alt, oat_c=row["oatC"], speed_kts=row["tasKt"], speed_kind="vt-kts",
                             gamma_deg=0.0, gear_down=False, flaps_norm=0.0)
                s = steady.solve_from(model, fixed, ("alpha_deg", "elevator", "throttle"),
                                      [(0.0, 0.05, 0.9), (-1.5, 0.08, 0.95), (1.0, 0.0, 0.8)], ((-8, 16), (-1, 1), (0, 1)))
                if s["converged"]:
                    # JSBSim reports the wind-axis X aero force as drag, positive.
                    drag, q_s, induced = f["forces/fwx-aero-lbs"], f["aero/qbar-psf"] * wing_area, f["aero/coefficient/CDi"]
                    cd0 = f["aero/coefficient/CD0"] / q_s
                    model.impose(**fixed, alpha_deg=s["x"]["alpha_deg"], elevator=s["x"]["elevator"],
                                 throttle=throttle_for(row["n1Pct"]))
                    thrust = f["propulsion/engine[0]/thrust-lbs"]
                    eqs.append({"kind": "cruise", "weightLb": weight, "pressureAltitudeFt": alt, "afm": row,
                                "T": thrust, "qS": q_s, "Di": induced, "dE": thrust - drag, "modelDragLbf": drag,
                                "modelCd0": cd0})
                else:
                    unsolved.append({"kind": "cruise", "weightLb": weight, "pressureAltitudeFt": alt})
            isa = 15.0 - 2.0 * alt / 1000.0
            afm = afm_climb_at(climb, weight, alt, isa)
            if afm:
                kias, roc = afm
                n1, basis = mct(weight, alt, isa)
                fixed = dict(pressure_altitude_ft=alt, oat_c=isa, speed_kts=steady.interpolate(steady.KIAS_TO_KCAS_FLAPS_0, kias),
                             speed_kind="vc-kts", throttle=throttle_for(n1), gear_down=False, flaps_norm=0.0)
                s = steady.solve_from(model, fixed, ("alpha_deg", "elevator", "gamma_deg"),
                                      [(3.0, 0.0, 6.0), (1.0, 0.0, 2.0), (5.0, -0.1, 10.0)], ((-8, 16), (-1, 1), (-10, 30)))
                if s["converged"]:
                    v = f["velocities/vtrue-kts"] * steady.KTS_TO_FPS
                    gamma = math.radians(f["flight-path/gamma-deg"])
                    weight_now = f["inertia/weight-lbs"]
                    eqs.append({"kind": "climb", "weightLb": weight, "pressureAltitudeFt": alt,
                                "afm": {"kias": kias, "rocFpm": roc, "oatC": isa, "mctN1Pct": n1, "mctN1Basis": basis},
                                "T": f["propulsion/engine[0]/thrust-lbs"], "qS": f["aero/qbar-psf"] * wing_area,
                                "Di": f["aero/coefficient/CDi"], "dE": weight_now * (math.sin(gamma) - roc / 60.0 / v),
                                "modelRocFpm": v * math.sin(gamma) * 60.0})
                else:
                    unsolved.append({"kind": "climb", "weightLb": weight, "pressureAltitudeFt": alt})
    return altitudes, eqs, unsolved


def least_squares(rows, cols):
    a = [[r[c] for c in cols] for r in rows]
    b = [r["dE"] for r in rows]
    n = len(cols)
    ata = [[sum(row[i] * row[j] for row in a) for j in range(n)] for i in range(n)]
    atb = [sum(row[i] * bi for row, bi in zip(a, b)) for i in range(n)]
    x = steady.linear_solve(ata, atb)
    residuals = [bi - sum(row[i] * x[i] for i in range(n)) for row, bi in zip(a, b)]
    return x, math.sqrt(sum(r * r for r in residuals) / len(residuals))


def describe(col, value):
    return {"T": f"thrust overstated {100 * value:+.1f}%", "qS": f"CD0 missing {value:+.5f}",
            "Di": f"induced drag missing {100 * value:+.0f}%"}[col]


def main():
    args = parse_args()
    out = pathlib.Path(args.out).resolve()
    if out.exists():
        raise SystemExit(f"Refusing to reuse an existing output directory: {out}")
    work = out / "work"
    work.mkdir(parents=True)
    sys.path.insert(0, str(pathlib.Path(args.native_build).resolve() / "tests"))
    from jsbsim import _jsbsim as jsbsim
    data_root = pathlib.Path(args.data_root).resolve() if args.data_root else ROOT / "public/jsbsim-data"
    steady.read_engine_n1_limits(data_root)

    altitudes, eqs, unsolved = equations(jsbsim, data_root, work)
    fits = {}
    for alt in altitudes:
        rows = [e for e in eqs if e["pressureAltitudeFt"] == alt]
        fits[alt] = {"equations": len(rows)}
        for name, cols in HYPOTHESES.items():
            x, rms = least_squares(rows, cols)
            fits[alt][name] = {"parameters": dict(zip(cols, x)), "rmsResidualLbf": rms}

    report = {"schemaVersion": 1, "diagnostic": "separate-sf50-thrust-drag.py",
              "jsbsim": steady.git_identity(pathlib.Path(args.jsbsim_source).resolve()),
              "nativeBuild": str(pathlib.Path(args.native_build).resolve()), "dataRoot": str(data_root),
              "app": steady.git_identity(ROOT),
              "packageSha256": {p: steady.sha256(data_root / p) for p in ("aircraft/sf50/sf50.xml", "engine/fj33_5a.xml")},
              "afm": {"document": "Cirrus SF50 AFM P/N 31452-001 Revision 4", "file": steady.POH, "sha256": steady.POH_SHA256},
              "method": __doc__, "equations": eqs, "unsolved": unsolved,
              "fits": {str(a): v for a, v in fits.items()}}
    (out / "thrust-drag-separation.json").write_text(json.dumps(report, indent=1) + "\n")

    print(f"{'PA ft':>6} {'eqs':>3} " + " ".join(f"{h:>17}" for h in HYPOTHESES))
    for alt in altitudes:
        print(f"{alt:>6} {fits[alt]['equations']:>3} " +
              " ".join(f"{fits[alt][h]['rmsResidualLbf']:>17.1f}" for h in HYPOTHESES))
    print("(RMS residual, lbf; lower explains the equations better)")
    for name in ("thrust+parasite", "all three"):
        print(f"\n{name}:")
        for alt in altitudes:
            fit = fits[alt][name]
            print(f"  {alt:>6} ft: " + ", ".join(describe(c, v) for c, v in fit["parameters"].items()) +
                  f"   rms {fit['rmsResidualLbf']:.1f} lbf")
    for alt in (altitudes[2], altitudes[-1]):
        climbs = [e for e in eqs if e["kind"] == "climb" and e["pressureAltitudeFt"] == alt]
        print(f"\nclimb excess by weight at {alt} ft: " +
              ", ".join(f"{e['weightLb']} lb {e['dE']:+.0f} lbf (model induced {e['Di']:.0f})" for e in climbs))
    if unsolved:
        print("\nunsolved:", unsolved)
    print(f"\nWrote {out / 'thrust-drag-separation.json'}")


if __name__ == "__main__":
    main()
