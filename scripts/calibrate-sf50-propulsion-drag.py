#!/usr/bin/env python3
"""Calibrate the SF50 package's installed thrust, parasite drag and TSFC.

separate-sf50-thrust-drag.py found the model's climb and cruise both too strong
above 5,000 ft and traced it to thrust and parasite drag together. This script
fits those against the AFM and writes candidate engine and aircraft files for
review. Nothing is written into public/jsbsim-data.

Inputs held fixed from other sources:

  idle N1 / N2     24.3 / 53.4 %, ERA22 recorder (N77VJ) ground idle, thrust
                   lever at -22 deg, 84 samples
  idle fuel flow   76 lbm/hr, WPR20FA051 recorder ground idle
                   (planes/.../public-evidence/idle-fuel-flow-2026-09-13.json)

Stage 1, thrust and drag. Each fitted AFM condition holds the printed speed and
the printed MCT N1 and solves the model's equilibrium flight-path angle. The
real airplane's is known (0 in cruise, from the rate of climb in the climb
table), so the model's excess force is W (sin gamma_model - sin gamma_afm).
Candidate parameter families, chosen with --families:

  columns      one scale per MilThrust density-altitude column
               (-10,000 and 0 ft tied; 30,000 and 40,000 ft tied)
  columns-above-sl
               the same, but the sea-level group stays at 1: the table's
               static sea-level value already equals the EASA TCDS rated
               thrust, 1,846 lbf, and no climb or cruise row is near M 0
  mach         free scales for the M 0.4 and M 0.6 rows
  mach-lapse   one parameter: every row scaled by (1 - kM * Mach)
  temperature  MilThrust multiplied by (1 + kT * atmosphere/delta-T): a
               turbofan at a given physical N1 loses thrust on a hot day
               beyond what density altitude alone accounts for
  cd0          a constant shift of the CD0 table
  cdi          a factor on the induced-drag coefficient
  shape        MilThrust multiplied by a table in N1 (1 at 100 %). JSBSim
               takes thrust from the square of normalised spool speed; the
               AFM's part-power rows need a steeper curve. With this family all
               cruise power settings are fitted, not only MCT.

The excess is linear in each, so the fit is least squares, re-linearised until
it settles.

Stage 2, TSFC. With thrust and drag calibrated, each cruise row is flown level
at the printed TAS and the TSFC reproducing the printed fuel flow is fuel mass
flow over thrust before bleed. TSFC becomes sqrt(T / 389.7 R) times a table in
N2, the temperature form JSBSim's simplified TSFC already uses. The table's
lowest point is anchored to the recorded ground idle.

Allocation follows the project record: ISA+10 cruise rows are same-source
checks and are not fitted; climb-table rows between ISA+5 and ISA+15 are held
out the same way. Tabulated part-power and max-range rows are not used in stage
1, so they test the N1-to-thrust shape the fit never saw.

Outputs carry AFM values and belong in an ignored directory.
"""

import argparse
import importlib.util
import json
import math
import pathlib
import re
import shutil
import statistics
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("steady", ROOT / "scripts/diagnose-sf50-steady-flight.py")
steady = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(steady)

ENGINE = "engine/fj33_5a.xml"
AIRCRAFT = "aircraft/sf50/sf50.xml"
EVIDENCE = ROOT / "planes/Cirrus_Vision_Jet/tests/public-evidence"
IDLE_N1_PCT, IDLE_N2_PCT, MAX_N_PCT = 24.3, 53.4, 100.0
IDLE_FUEL_FLOW_LBM_PER_HR = 76
AFM_LB_PER_US_GAL = 6.76
WEIGHTS = (4500, 5000, 5500, 6000)
RATED_THRUST_LBF = 1846.0
COLUMN_GROUPS = ((-10000.0, 0.0), (10000.0,), (20000.0,), (30000.0, 40000.0))
FREE_MACH_ROWS = (0.4, 0.6)
STARTS = [(3.0, 0.0, 3.0), (1.0, 0.0, 0.0), (5.0, -0.1, 10.0), (0.0, 0.05, -2.0)]
BOUNDS = ((-8.0, 16.0), (-1.0, 1.0), (-15.0, 30.0))
# WPR20FA051 ground idle: Santa Monica, field elevation 177 ft, static.
IDLE_ANCHOR = {"mach": 0.0, "densityAltitudeFt": 0.0, "temperatureR": 518.67}
TSFC_N2_BREAKPOINTS = (IDLE_N2_PCT, 78.0, 83.0, 88.0, 93.0, 97.0, 100.0)
SHAPE_N1_BREAKPOINTS = (65.0, 72.5, 80.0, 85.0, 90.0, 95.0, 100.0)


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--native-build", required=True, help="CMake build directory with the jsbsim Python module")
    p.add_argument("--jsbsim-source", required=True, help="JSBSim checkout, recorded for provenance")
    p.add_argument("--out", required=True, help="New output directory")
    p.add_argument("--families", default="columns,cd0",
                   help="Comma-separated stage 1 parameter families: columns, mach, temperature, cd0, cdi")
    p.add_argument("--iterations", type=int, default=8)
    p.add_argument("--base-revision", default=None,
                   help="Git revision whose engine and aircraft files are the starting point "
                        "(default: the working tree). Use the pre-calibration revision to reproduce a fit.")
    p.add_argument("--skip-tsfc", action="store_true")
    return p.parse_args()


# ------------------------------------------------------------------ tables

def function_block(xml, name):
    m = re.search(rf'<function name="{name}">(.*?)</function>', xml, re.S)
    assert m, f"no {name} function"
    return m


def parse_table(body):
    data = re.search(r"<tableData>(.*?)</tableData>", body, re.S).group(1)
    lines = [l.split() for l in data.strip().splitlines() if l.strip()]
    cols = [float(v) for v in lines[0]]
    rows = [(float(l[0]), [float(v) for v in l[1:]]) for l in lines[1:]]
    assert all(len(v) == len(cols) for _, v in rows)
    return cols, rows


def table_xml(cols, rows, row_var, col_var, indent):
    pad = " " * indent
    lines = [pad + "  " + "".join(f"{c:>9.0f}" for c in cols)]
    lines += [pad + f"{r:<4}" + "".join(f"{v:>9.5f}" for v in vals) for r, vals in rows]
    return (f"{pad}<table>\n{pad}  <independentVar lookup=\"row\">{row_var}</independentVar>\n"
            f"{pad}  <independentVar lookup=\"column\">{col_var}</independentVar>\n{pad}  <tableData>\n"
            + "\n".join("  " + l for l in lines) + f"\n{pad}  </tableData>\n{pad}</table>")


def bracket(keys, key):
    """JSBSim FGTable: linear between neighbours, clamped beyond the ends."""
    j = 1
    while keys[j] < key and j < len(keys) - 1:
        j += 1
    f = min(max((key - keys[j - 1]) / (keys[j] - keys[j - 1]), 0.0), 1.0)
    return j - 1, j, f


def shares(table, row_key, col_key):
    """{(row index, column index): weight * value}; their sum is the lookup."""
    cols, rows = table
    lo, hi, cf = bracket(cols, col_key)
    rlo, rhi, rf = bracket([r for r, _ in rows], row_key)
    out = {}
    for (ri, rw) in ((rlo, 1.0 - rf), (rhi, rf)):
        for (ci, cw) in ((lo, 1.0 - cf), (hi, cf)):
            out[(ri, ci)] = out.get((ri, ci), 0.0) + rw * cw * rows[ri][1][ci]
    return out


# --------------------------------------------------------------- parameters

def initial_params():
    return {"columnScales": [1.0] * len(COLUMN_GROUPS), "machScales": {m: 1.0 for m in FREE_MACH_ROWS},
            "kT": 0.0, "kM": 0.0, "dCd0": 0.0, "cdiFactor": 1.0, "tsfc": None,
            "shape": {bp: 1.0 for bp in SHAPE_N1_BREAKPOINTS}}


def parameter_names(families):
    names = []
    if "columns" in families:
        names += [f"column{i}" for i in range(len(COLUMN_GROUPS))]
    elif "columns-above-sl" in families:
        names += [f"column{i}" for i in range(1, len(COLUMN_GROUPS))]
    if "mach" in families:
        names += [f"mach{m}" for m in FREE_MACH_ROWS]
    if "mach-lapse" in families:
        names.append("kM")
    if "temperature" in families:
        names.append("kT")
    if "cd0" in families:
        names.append("dCd0")
    if "cdi" in families:
        names.append("cdiFactor")
    if "shape" in families:
        names += [f"shape{bp}" for bp in SHAPE_N1_BREAKPOINTS[:-1]]
    return names


def apply_delta(params, names, delta):
    for name, d in zip(names, delta):
        if name.startswith("column"):
            params["columnScales"][int(name[6:])] += d
        elif name.startswith("mach"):
            params["machScales"][float(name[4:])] += d
        elif name.startswith("shape"):
            params["shape"][float(name[5:])] += d
        else:
            params[name] += d


def column_scale(params, col):
    return params["columnScales"][next(i for i, g in enumerate(COLUMN_GROUPS) if col in g)]


def shape_weights(params, n1):
    keys = list(SHAPE_N1_BREAKPOINTS)
    lo, hi, f = bracket(keys, n1)
    weights = {keys[lo]: 1.0 - f}
    weights[keys[hi]] = weights.get(keys[hi], 0.0) + f
    return sum(params["shape"][k] * w for k, w in weights.items()), weights


def row_scale(params, mach):
    return params["machScales"].get(mach, 1.0) * (1.0 - params.get("kM", 0.0) * mach)


# --------------------------------------------------------------- candidate

def write_candidate(base, target, params):
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(base, target)
    engine = (target / ENGINE).read_text()
    m = function_block(engine, "MilThrust")
    cols, rows = parse_table(m.group(1))
    rows = [(r, [v * column_scale(params, c) * row_scale(params, r) for v, c in zip(vals, cols)]) for r, vals in rows]
    table = table_xml(cols, rows, "velocities/mach", "atmosphere/density-altitude", 6)
    shape_rows = "\n".join(f"          {bp:6.1f} {params['shape'][bp]:.5f}" for bp in SHAPE_N1_BREAKPOINTS)
    body = ("\n    <product>\n" + table +
            f"\n      <sum><value>1</value><product><value>{params['kT']:.6g}</value>"
            "<property>atmosphere/delta-T</property></product></sum>\n"
            "      <table>\n        <independentVar>propulsion/engine[#]/n1</independentVar>\n"
            "        <tableData>\n" + shape_rows + "\n        </tableData>\n      </table>\n    </product>\n  ")
    engine = engine[:m.start(1)] + body + engine[m.end(1):]
    engine = re.sub(r"<idlen1>[^<]*</idlen1>", f"<idlen1>{IDLE_N1_PCT}</idlen1>", engine)
    engine = re.sub(r"<idlen2>[^<]*</idlen2>", f"<idlen2>{IDLE_N2_PCT}</idlen2>", engine)
    if "<idlefuelflow>" not in engine:
        engine = engine.replace("</idlen2>\n", f"</idlen2>\n  <idlefuelflow>{IDLE_FUEL_FLOW_LBM_PER_HR}</idlefuelflow>\n", 1)
    if params.get("tsfc"):
        engine = re.sub(r"<tsfc>.*?</tsfc>", tsfc_xml(params["tsfc"]), engine, count=1, flags=re.S)
    (target / ENGINE).write_text(engine)

    aircraft = (target / AIRCRAFT).read_text()
    m = re.search(r'(name="aero/coefficient/CD0">.*?<tableData>)(.*?)(</tableData>)', aircraft, re.S)
    pts = [tuple(map(float, l.split())) for l in m.group(2).strip().splitlines() if l.strip()]
    body = "\n" + "\n".join(f"              {a:>5.2f} {c + params['dCd0']:.5f}" for a, c in pts) + "\n            "
    aircraft = aircraft[:m.start(2)] + body + aircraft[m.end(2):]
    m = re.search(r'(name="aero/coefficient/CDi">.*?<value>)([^<]*)(</value>)', aircraft, re.S)
    aircraft = aircraft[:m.start(2)] + f"{BASE_CDI * params['cdiFactor']:.5f}" + aircraft[m.end(2):]
    (target / AIRCRAFT).write_text(aircraft)


def tsfc_xml(table):
    """<tsfc> takes one function operation directly; a <function> wrapper is rejected."""
    rows = "\n".join(f"          {n2:6.2f} {k:.4f}" for n2, k in table)
    return ("<tsfc>\n    <!-- Fitted to AFM cruise fuel flow over calibrated thrust, anchored at the recorded\n"
            "         ground idle: scripts/calibrate-sf50-propulsion-drag.py. -->\n"
            "    <product>\n      <pow><quotient><property>atmosphere/T-R</property><value>389.7</value>"
            "</quotient><value>0.5</value></pow>\n      <table>\n"
            "        <independentVar>propulsion/engine[#]/n2</independentVar>\n        <tableData>\n"
            + rows + "\n        </tableData>\n      </table>\n    </product>\n  </tsfc>")


# ------------------------------------------------------------------- rows

def fit_rows(work):
    cruise = json.loads((EVIDENCE / "primary-afm-expanded-candidates.json").read_text())["cruise"]
    mct = steady.afm_mct_n1(ROOT)
    climb = steady.climb_table(steady.poh_pages(ROOT, work))
    rows = []
    for r in cruise:
        rows.append({"kind": "cruise-" + r["power"], "weightLb": r["weightLb"], "pa": r["pressureAltitudeFt"],
                     "oatC": r["oatC"], "isaDevC": r["deltaIsaC"], "speed": r["tasKt"], "speedKind": "vt-kts",
                     "n1": r["n1Pct"], "fuelFlowUsGph": r["fuelFlowUsGph"],
                     "allocation": "check" if r["deltaIsaC"] == 10 else "fit", "afm": r})
    for r in climb:
        n1, basis = mct(r["weightLb"], r["pressureAltitudeFt"], r["oatC"])
        if basis["clampedAltitude"] or basis["clampedIsaDeviation"]:
            continue
        dev = basis["isaDeviationC"]
        rows.append({"kind": "climb", "weightLb": r["weightLb"], "pa": r["pressureAltitudeFt"], "oatC": r["oatC"],
                     "isaDevC": dev, "speed": steady.interpolate(steady.KIAS_TO_KCAS_FLAPS_0, r["kias"]),
                     "speedKind": "vc-kts", "n1": n1, "rocFpm": r["rocFpm"],
                     "allocation": "check" if 5.0 <= dev < 15.0 else "fit", "afm": r})
    return rows


def throttle_for(n1):
    return min(1.0, max(0.0, (n1 - IDLE_N1_PCT) / (MAX_N_PCT - IDLE_N1_PCT)))


class Models:
    def __init__(self, jsbsim, data_root, work):
        self.by_weight = {}
        for w in WEIGHTS:
            aircraft, _ = steady.loaded_data_root(data_root, work, w)
            self.by_weight[w] = steady.Model(jsbsim, data_root, aircraft)
        self.warm = {}


def gamma_equation(models, row, base_table, idle_table, params, names):
    """Hold speed and N1, solve the flight-path angle; return the linearised equation."""
    w = row["weightLb"]
    model = models.by_weight[w]
    f = model.fdm
    throttle = throttle_for(row["n1"])
    fixed = dict(pressure_altitude_ft=row["pa"], oat_c=row["oatC"], speed_kts=row["speed"],
                 speed_kind=row["speedKind"], throttle=throttle, gear_down=False, flaps_norm=0.0)
    key = (w, row["kind"] == "climb")
    s = steady.solve_from(model, fixed, ("alpha_deg", "elevator", "gamma_deg"),
                          ([models.warm[key]] if key in models.warm else []) + STARTS, BOUNDS)
    if not s["converged"]:
        return None
    models.warm[key] = (s["x"]["alpha_deg"], s["x"]["elevator"], s["x"]["gamma_deg"])
    alpha = f["aero/alpha-rad"]
    gamma_m = math.radians(f["flight-path/gamma-deg"])
    weight = f["inertia/weight-lbs"]
    mach, da, dt = f["velocities/mach"], f["atmosphere/density-altitude"], f["atmosphere/delta-T"]
    thrust, bleed = f["propulsion/engine[0]/thrust-lbs"], f["propulsion/engine[0]/bleed-factor"]
    n2norm = (f["propulsion/engine[0]/n2"] - IDLE_N2_PCT) / (MAX_N_PCT - IDLE_N2_PCT)
    idle = RATED_THRUST_LBF * sum(shares(idle_table, mach, da).values())
    cols, table_rows = base_table
    base = shares(base_table, mach, da)
    temp = 1.0 + params["kT"] * dt
    shape, sweights = shape_weights(params, f["propulsion/engine[0]/n1"])
    lookup = sum(v * column_scale(params, cols[c]) * row_scale(params, table_rows[r][0]) for (r, c), v in base.items())
    gain = (1.0 - bleed) * (RATED_THRUST_LBF - idle) * n2norm ** 2 * shape
    rebuilt = (1.0 - bleed) * idle + gain * lookup * temp
    # ~1e-5 relative: JSBSim's engine inputs are the previous step's atmosphere.
    rebuild_error = abs(rebuilt - thrust) / max(thrust, 1.0)
    assert rebuild_error < 2e-4, (rebuilt, thrust, row)

    grad = []
    for name in names:
        if name.startswith("column"):
            g = COLUMN_GROUPS[int(name[6:])]
            dT = gain * temp * sum(v * row_scale(params, table_rows[r][0]) for (r, c), v in base.items() if cols[c] in g)
            grad.append(dT * math.cos(alpha))
        elif name.startswith("mach"):
            mrow = float(name[4:])
            dT = gain * temp * sum(v * column_scale(params, cols[c]) for (r, c), v in base.items() if table_rows[r][0] == mrow)
            grad.append(dT * math.cos(alpha))
        elif name == "kM":
            dT = gain * temp * sum(v * column_scale(params, cols[c]) * params["machScales"].get(table_rows[r][0], 1.0)
                                   * -table_rows[r][0] for (r, c), v in base.items())
            grad.append(dT * math.cos(alpha))
        elif name == "kT":
            grad.append(gain * lookup * dt * math.cos(alpha))
        elif name == "dCd0":
            grad.append(-f["aero/qbar-psf"] * f["metrics/Sw-sqft"])
        elif name == "cdiFactor":
            grad.append(-f["aero/coefficient/CDi"] / params["cdiFactor"])
        elif name.startswith("shape"):
            grad.append(gain / shape * lookup * temp * sweights.get(float(name[5:]), 0.0) * math.cos(alpha))
    if row["kind"] == "climb":
        v_fps = f["velocities/vtrue-kts"] * steady.KTS_TO_FPS
        gamma_afm = math.asin(max(-1.0, min(1.0, row["rocFpm"] / 60.0 / v_fps)))
    else:
        gamma_afm = 0.0
    excess = weight * (math.sin(gamma_m) - math.sin(gamma_afm))
    return {"grad": grad, "excessLbf": excess, "gammaModelDeg": math.degrees(gamma_m),
            "gammaAfmDeg": math.degrees(gamma_afm),
            "rocModelFpm": f["velocities/vtrue-kts"] * steady.KTS_TO_FPS * math.sin(gamma_m) * 60.0,
            "throttle": throttle, "throttleClamped": row["n1"] > MAX_N_PCT, "mach": mach,
            "densityAltitudeFt": da, "deltaTR": dt, "thrustLbf": thrust, "thrustRebuildError": rebuild_error}


def least_squares(eqs):
    n = len(eqs[0]["grad"])
    ata = [[sum(e["grad"][i] * e["grad"][j] for e in eqs) for j in range(n)] for i in range(n)]
    atb = [sum(e["grad"][i] * -e["excessLbf"] for e in eqs) for i in range(n)]
    delta = steady.linear_solve(ata, atb)
    residual = [e["excessLbf"] + sum(g * d for g, d in zip(e["grad"], delta)) for e in eqs]
    dof = max(1, len(eqs) - n)
    sigma2 = sum(r * r for r in residual) / dof
    # Standard errors from the diagonal of sigma^2 (AtA)^-1.
    errors = []
    for i in range(n):
        unit = [1.0 if j == i else 0.0 for j in range(n)]
        errors.append(math.sqrt(max(0.0, sigma2 * steady.linear_solve(ata, unit)[i])))
    return delta, errors


def rms(values):
    values = list(values)
    return math.sqrt(sum(v * v for v in values) / len(values)) if values else float("nan")


# ------------------------------------------------------------------ stages

def stage_thrust_drag(jsbsim, base, work, rows, families, iterations, log):
    names = parameter_names(families)
    params = initial_params()
    stage_rows = [r for r in rows if r["kind"] in ("cruise-MCT", "climb")
                  or ("shape" in families and r["kind"].startswith("cruise-"))]
    base_table = parse_table(function_block((base / ENGINE).read_text(), "MilThrust").group(1))
    idle_table = parse_table(function_block((base / ENGINE).read_text(), "IdleThrust").group(1))
    history, errors = [], None
    for k in range(iterations + 1):
        root = work / f"candidate-{k}"
        write_candidate(base, root, params)
        models = Models(jsbsim, root, work / f"loading-{k}")
        solved = [(row, gamma_equation(models, row, base_table, idle_table, params, names)) for row in stage_rows]
        unsolved = [row for row, eq in solved if eq is None]
        solved = [(row, eq) for row, eq in solved if eq is not None]
        fit = [eq for row, eq in solved if row["allocation"] == "fit"]
        check = [eq for row, eq in solved if row["allocation"] == "check"]
        entry = {"iteration": k, "params": json.loads(json.dumps(params, default=str)), "fitRows": len(fit),
                 "checkRows": len(check), "unsolved": len(unsolved),
                 "fitRmsExcessLbf": rms(e["excessLbf"] for e in fit),
                 "checkRmsExcessLbf": rms(e["excessLbf"] for e in check)}
        history.append(entry)
        log(f"  iteration {k}: fit rms {entry['fitRmsExcessLbf']:.1f} lbf ({len(fit)})  check rms "
            f"{entry['checkRmsExcessLbf']:.1f} lbf ({len(check)})  unsolved {len(unsolved)}")
        if k == iterations:
            break
        delta, errors = least_squares(fit)
        apply_delta(params, names, delta)
        if max(abs(d) for d in delta) < 1e-6:
            log("  converged")
            break
    root = work / "candidate-stage1"
    write_candidate(base, root, params)
    models = Models(jsbsim, root, work / "loading-stage1")
    solved = [(row, gamma_equation(models, row, base_table, idle_table, params, names)) for row in stage_rows]
    unsolved = [row for row, eq in solved if eq is None]
    solved = [(row, eq) for row, eq in solved if eq is not None]
    return params, dict(zip(names, errors or [])), solved, unsolved, history


def level_flight(models, row):
    """Throttle, thrust and fuel flow to hold the printed TAS level."""
    w = row["weightLb"]
    model = models.by_weight[w]
    f = model.fdm
    fixed = dict(pressure_altitude_ft=row["pa"], oat_c=row["oatC"], speed_kts=row["speed"], speed_kind=row["speedKind"],
                 gamma_deg=0.0, gear_down=False, flaps_norm=0.0)
    key = (w, "level")
    starts = ([models.warm[key]] if key in models.warm else []) + [(0.0, 0.05, 0.8), (2.0, 0.0, 0.5), (-1.5, 0.08, 0.95)]
    s = steady.solve_from(model, fixed, ("alpha_deg", "elevator", "throttle"), starts,
                          ((-8.0, 16.0), (-1.0, 1.0), (0.0, 1.0)))
    if not s["converged"] or s["x"]["throttle"] >= 1.0 - 1e-9:
        return None
    models.warm[key] = (s["x"]["alpha_deg"], s["x"]["elevator"], s["x"]["throttle"])
    bleed = f["propulsion/engine[0]/bleed-factor"]
    # FGPropulsion skips fuel accounting while trim status is set.
    f.set_trim_status(False)
    assert f.run_ic()
    fuel_pps, fuel_gph = f["propulsion/engine[0]/fuel-flow-rate-pps"], f["propulsion/engine[0]/fuel-flow-rate-gph"]
    f.set_trim_status(True)
    return {"n1Pct": f["propulsion/engine[0]/n1"], "n2Pct": f["propulsion/engine[0]/n2"],
            "dryThrustLbf": f["propulsion/engine[0]/thrust-lbs"] / (1.0 - bleed),
            "throttle": s["x"]["throttle"], "tsfcModel": f["propulsion/engine[0]/tsfc"],
            "fuelFlowUsGphModel": fuel_gph, "fuelFlowPphModel": fuel_pps * 3600.0,
            "temperatureR": f["atmosphere/T-R"], "mach": f["velocities/mach"]}


def evaluate_cruise(jsbsim, root, work, rows):
    models = Models(jsbsim, root, work)
    out = []
    for row in rows:
        if row["kind"].startswith("cruise-"):
            lv = level_flight(models, row)
            out.append({"row": row, "level": lv})
    return out


def stage_tsfc(jsbsim, base, work, rows, params, log):
    evaluated = evaluate_cruise(jsbsim, work / "candidate-stage1", work / "loading-tsfc", rows)
    fit = [e for e in evaluated if e["level"] and e["row"]["allocation"] == "fit"]
    for e in fit:
        lv = e["level"]
        e["tsfcScaleNeeded"] = (e["row"]["fuelFlowUsGph"] * AFM_LB_PER_US_GAL / lv["dryThrustLbf"]
                                / math.sqrt(lv["temperatureR"] / 389.7))
    table = []
    # Local linear regression of the needed scale on N2 around each breakpoint.
    points = [(e["level"]["n2Pct"], e["tsfcScaleNeeded"]) for e in fit]
    for n2 in TSFC_N2_BREAKPOINTS[1:]:
        near = [(x, y) for x, y in points if abs(x - n2) <= 4.0]
        if len(near) < 8:
            continue
        mx = statistics.fmean(x for x, _ in near)
        my = statistics.fmean(y for _, y in near)
        sxx = sum((x - mx) ** 2 for x, _ in near)
        slope = sum((x - mx) * (y - my) for x, y in near) / sxx if sxx > 0 else 0.0
        table.append((n2, my + slope * (n2 - mx)))
    # Idle anchor: recorded ground idle fuel flow over the candidate's idle dry thrust.
    idle_table = parse_table(function_block((work / "candidate-stage1" / ENGINE).read_text(), "IdleThrust").group(1))
    idle_dry = RATED_THRUST_LBF * sum(shares(idle_table, IDLE_ANCHOR["mach"], IDLE_ANCHOR["densityAltitudeFt"]).values())
    idle_scale = IDLE_FUEL_FLOW_LBM_PER_HR / idle_dry / math.sqrt(IDLE_ANCHOR["temperatureR"] / 389.7)
    table = [(IDLE_N2_PCT, idle_scale)] + table
    log("  TSFC scale by N2: " + ", ".join(f"{n:.1f}%:{k:.4f}" for n, k in table)
        + f"  (idle dry thrust {idle_dry:.1f} lbf)")
    params["tsfc"] = table
    root = work / "candidate-final"
    write_candidate(base, root, params)
    final = evaluate_cruise(jsbsim, root, work / "loading-final", rows)
    return table, final


def summarize(evaluated, stage1, log):
    def cruise_stats(kind_prefix, allocation):
        sel = [e for e in evaluated if e["row"]["kind"].startswith(kind_prefix) and e["row"]["allocation"] == allocation]
        solved = [e for e in sel if e["level"]]
        n1 = [e["level"]["n1Pct"] - e["row"]["n1"] for e in solved]
        ff = [e["level"]["fuelFlowUsGphModel"] / e["row"]["fuelFlowUsGph"] for e in solved]
        return {"rows": len(sel), "solved": len(solved),
                "n1DiffMedian": statistics.median(n1) if n1 else None, "n1DiffRms": rms(n1),
                "fuelFlowRatioMedian": statistics.median(ff) if ff else None,
                "fuelFlowRatioP10": sorted(ff)[len(ff) // 10] if ff else None,
                "fuelFlowRatioP90": sorted(ff)[9 * len(ff) // 10] if ff else None}
    out = {}
    for kind in ("cruise-MCT", "cruise-max-range", "cruise-tabulated-part-power"):
        for allocation in ("fit", "check"):
            s = cruise_stats(kind, allocation)
            out[f"{kind}/{allocation}"] = s
            log(f"  {kind:<28} {allocation:<5} solved {s['solved']:>3}/{s['rows']:<3} N1 model-AFM median "
                f"{s['n1DiffMedian']:+.2f} rms {s['n1DiffRms']:.2f}  fuel flow ratio median {s['fuelFlowRatioMedian']:.3f} "
                f"(p10 {s['fuelFlowRatioP10']:.3f}, p90 {s['fuelFlowRatioP90']:.3f})")
    for allocation in ("fit", "check"):
        climbs = [(r, e) for r, e in stage1 if r["kind"] == "climb" and r["allocation"] == allocation]
        ratios = sorted(e["rocModelFpm"] / r["rocFpm"] for r, e in climbs)
        diffs = sorted(e["rocModelFpm"] - r["rocFpm"] for r, e in climbs)
        s = {"rows": len(climbs), "rocRatioMedian": ratios[len(ratios) // 2], "rocRatioP10": ratios[len(ratios) // 10],
             "rocRatioP90": ratios[9 * len(ratios) // 10], "rocDiffMedianFpm": diffs[len(diffs) // 2]}
        out[f"climb/{allocation}"] = s
        log(f"  climb (MCT N1)               {allocation:<5} rows {s['rows']:>3}  ROC model/AFM median {s['rocRatioMedian']:.3f} "
            f"(p10 {s['rocRatioP10']:.3f}, p90 {s['rocRatioP90']:.3f}), difference median {s['rocDiffMedianFpm']:+.0f} fpm")
    return out


# -------------------------------------------------------------------- main

def main():
    global BASE_CDI
    args = parse_args()
    out = pathlib.Path(args.out).resolve()
    if out.exists():
        raise SystemExit(f"Refusing to reuse an existing output directory: {out}")
    work = out / "work"
    work.mkdir(parents=True)
    sys.path.insert(0, str(pathlib.Path(args.native_build).resolve() / "tests"))
    from jsbsim import _jsbsim as jsbsim
    base = ROOT / "public/jsbsim-data"
    if args.base_revision:
        pinned = work / "base"
        shutil.copytree(base, pinned)
        for path in (ENGINE, AIRCRAFT):
            (pinned / path).write_bytes(subprocess.run(
                ["git", "-C", str(ROOT), "show", f"{args.base_revision}:public/jsbsim-data/{path}"],
                check=True, capture_output=True).stdout)
        base = pinned
    BASE_CDI = float(re.search(r'name="aero/coefficient/CDi">.*?<value>([^<]*)</value>',
                               (base / AIRCRAFT).read_text(), re.S).group(1))
    families = [f.strip() for f in args.families.split(",") if f.strip()]
    lines = []

    def log(text):
        print(text, flush=True)
        lines.append(text)

    rows = fit_rows(work)
    log(f"families {families}; rows: {sum(r['allocation'] == 'fit' for r in rows)} fit, "
        f"{sum(r['allocation'] == 'check' for r in rows)} check")
    log("stage 1: thrust and drag")
    params, errors, stage1, unsolved, history = stage_thrust_drag(jsbsim, base, work, rows, families, args.iterations, log)
    log("  parameters: " + ", ".join(
        [f"column{i} {s:.4f}" for i, s in enumerate(params["columnScales"])] +
        [f"mach{m} {s:.4f}" for m, s in params["machScales"].items()] +
        [f"shape{k:g} {v:.4f}" for k, v in params["shape"].items()] +
        [f"kM {params['kM']:+.4f}", f"kT {params['kT']:+.6f}/R", f"dCD0 {params['dCd0']:+.5f}", f"CDi x{params['cdiFactor']:.4f}"]))
    log("  standard errors: " + ", ".join(f"{k} {v:.2g}" for k, v in errors.items()))
    report = {
        "schemaVersion": 1, "script": "calibrate-sf50-propulsion-drag.py", "families": families,
        "jsbsim": steady.git_identity(pathlib.Path(args.jsbsim_source).resolve()),
        "nativeBuild": str(pathlib.Path(args.native_build).resolve()), "app": steady.git_identity(ROOT),
        "baseSha256": {p: steady.sha256(base / p) for p in (ENGINE, AIRCRAFT)},
        "afm": {"file": steady.POH, "sha256": steady.POH_SHA256},
        "fixedInputs": {"idleN1Pct": IDLE_N1_PCT, "idleN2Pct": IDLE_N2_PCT,
                        "idleFuelFlowLbmPerHr": IDLE_FUEL_FLOW_LBM_PER_HR, "afmLbPerUsGal": AFM_LB_PER_US_GAL},
        "baseRevision": args.base_revision, "columnGroupsFt": COLUMN_GROUPS, "params": params, "standardErrors": errors, "history": history,
        "stage1": [{"row": r, "equation": e} for r, e in stage1], "stage1Unsolved": unsolved,
    }
    if not args.skip_tsfc:
        log("stage 2: TSFC")
        table, final = stage_tsfc(jsbsim, base, work, rows, params, log)
        log("summary, final candidate:")
        report["summary"] = summarize(final, stage1, log)
        report["tsfcTable"] = table
        report["cruiseEvaluation"] = final
        report["candidate"] = str(work / "candidate-final")
    (out / "calibration.json").write_text(json.dumps(report, indent=1, default=str) + "\n")
    log(f"Wrote {out / 'calibration.json'}")


if __name__ == "__main__":
    main()
