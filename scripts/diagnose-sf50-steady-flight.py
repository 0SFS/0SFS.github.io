#!/usr/bin/env python3
"""Compare the SF50 package's steady flight with three AFM Section 5 tables.

Each check solves the model's own zero-time equilibrium: body accelerations
udot, wdot and qdot are driven to zero by adjusting three unknowns while the
imposed conditions are held. Nothing is fitted and no coefficient is changed.

  cruise  Level flight at a printed ISA MCT cruise row's pressure altitude, OAT
          and TAS. Unknowns: alpha, elevator, throttle. Reports the N1 the model
          needs, against the N1 the AFM prints for that speed.
  stall   Wings-level idle glide at 1 g. Unknowns: alpha, elevator, flight-path
          angle. Reports the lowest calibrated airspeed with a solution before
          the lift-curve peak, against the AFM's stick-pusher speed (5-18), and
          the angle of attack the model needs at the AFM speed.
  climb   MCT climb, gear and flaps up. Unknowns: alpha, elevator, flight-path
          angle. Reports steady rate of climb against the AFM table (5-39..5-46).

The AFM tables are read from the tracked POH with pdftotext, after verifying its
SHA-256. Outputs contain printed AFM values and belong in an ignored directory.
"""

import argparse
import hashlib
import json
import math
import pathlib
import re
import shutil
import subprocess
import sys

POH = "planes/Cirrus_Vision_Jet/tests/SF50-POH.pdf"
POH_SHA256 = "d83e904dbd6bc3656321c93d793166d4a5c6eddf81852b15767e5c336fc23949"
KTS_TO_FPS = 1.6878098571011957
RANKINE_PER_CELSIUS = 1.8
KELVIN_AT_ZERO_C = 273.15
# The engine package owns these; read from it so a recalibrated idle N1 does not
# silently rescale the throttle position a printed N1 maps to.
IDLE_N1, MAX_N1 = 30.0, 100.0
EMPTY_WEIGHT_LB, MAX_FUEL_LB = 3550.0, 1500.0
# AFM 5-14 static source error correction, flaps 0 (sf50AfmData.ts).
KIAS_TO_KCAS_FLAPS_0 = [(80, 81), (90, 92), (100, 102), (110, 112), (120, 122), (130, 133), (140, 143),
                        (150, 152), (160, 161), (170, 170), (180, 180), (190, 190), (200, 200), (210, 210),
                        (220, 220), (230, 230), (240, 240), (250, 250)]


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--native-build", required=True, help="CMake build directory with the jsbsim Python module")
    p.add_argument("--jsbsim-source", required=True, help="JSBSim checkout, recorded for provenance")
    p.add_argument("--data-root", help="JSBSim data root to evaluate (default: public/jsbsim-data)")
    p.add_argument("--out", required=True, help="New output directory")
    p.add_argument("--checks", default="cruise,stall,climb")
    return p.parse_args()


def read_engine_n1_limits(data_root):
    """Set IDLE_N1 and MAX_N1 from the engine package being evaluated."""
    global IDLE_N1, MAX_N1
    xml = (data_root / "engine/fj33_5a.xml").read_text()
    find = lambda tag: float(re.search(rf"<{tag}>([^<]+)</{tag}>", xml).group(1))
    IDLE_N1, MAX_N1 = find("idlen1"), find("maxn1")
    return IDLE_N1, MAX_N1


def git_identity(path):
    run = lambda *a: subprocess.run(["git", "--no-optional-locks", "-C", str(path), *a],
                                    capture_output=True, text=True, check=True).stdout.strip()
    return {"commit": run("rev-parse", "HEAD"), "branch": run("rev-parse", "--abbrev-ref", "HEAD"),
            "dirty": run("status", "--porcelain", "--untracked-files=no") != ""}


def sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def interpolate(table, x):
    for (x0, y0), (x1, y1) in zip(table, table[1:]):
        if x0 <= x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return None


# ---------------------------------------------------------------- AFM tables

def poh_pages(root, work):
    pdf = root / POH
    if sha256(pdf) != POH_SHA256:
        raise SystemExit("The tracked POH does not match the AFM SHA-256 used by the evidence ledgers")
    text = work / "poh.txt"
    subprocess.run(["pdftotext", "-layout", str(pdf), str(text)], check=True)
    return text.read_text(encoding="utf-8", errors="replace").split("\f")


def printed_page(text):
    m = re.search(r"\b(5-\d{2,3})\b", text[-400:]) or re.search(r"\b(5-\d{2,3})\b", text[:400])
    return m.group(1) if m else None


def stall_table(pages):
    """AFM 5-18: stall speeds (KCAS) at idle by weight, bank and flap."""
    n = next(i for i, p in enumerate(pages, 1) if "STALL SPEEDS (KCAS) AT IDLE" in p and "Ice" not in p)
    rows, weight = [], None
    for line in pages[n - 1].splitlines():
        if m := re.match(r"^\s*(\d{4}) lb\s*$", line):
            weight = int(m.group(1))
        elif (m := re.match(r"^\s*(0|15|30|45|60)\s+(\d{2,3})\s+(\d{2,3})\s+(\d{2,3})\s*$", line)) and weight:
            for flap, v in zip((0.0, 0.5, 1.0), m.groups()[1:]):
                rows.append({"pdfPage": n, "printedPage": printed_page(pages[n - 1]), "weightLb": weight,
                             "bankDeg": int(m.group(1)), "flapsNorm": flap, "stallKcas": int(v)})
    assert len(rows) == 60, len(rows)
    lookup = {(r["weightLb"], r["bankDeg"], r["flapsNorm"]): r["stallKcas"] for r in rows}
    assert lookup[(6000, 0, 0.0)] == 86 and lookup[(4800, 60, 1.0)] == 85 and lookup[(5550, 45, 0.5)] == 88
    return rows


def climb_table(pages):
    """AFM 5-39..5-46: rate of climb at MCT, gear/flaps up, anti-ice off."""
    row_re = re.compile(r"^\s*(\d{1,2},?\d{3})?\s*(-?\d{1,2})\s+" + r"\s+".join([r"(\d{3})\s+(\d{2,4})"] * 4) + r"\s*$")
    alt_re = re.compile(r"^\s*(\d{1,2},?\d{3}|0)\s*$")
    out = []
    for n, text in enumerate(pages, 1):
        if not ("Rate Of Climb" in text or "ROC" in text) or "KIAS (FT/" not in text or "ENROUTE CLIMB" not in text:
            continue
        if "Ice" in text[:600]:
            continue
        blocks, block, prev = [], None, None
        for line in text.splitlines():
            if m := row_re.match(line):
                oat = int(m.group(2))
                if block is None or (prev is not None and oat <= prev):
                    block = {"alt": None, "rows": []}
                    blocks.append(block)
                if m.group(1):
                    block["alt"] = int(m.group(1).replace(",", ""))
                block["rows"].append((oat, [int(v) for v in m.groups()[2:]]))
                prev = oat
            elif (a := alt_re.match(line)) and block is not None and block["alt"] is None:
                block["alt"] = int(a.group(1).replace(",", ""))
        for b in blocks:
            for oat, v in b["rows"]:
                for w, kias, roc in zip((6000, 5500, 5000, 4500), v[0::2], v[1::2]):
                    out.append({"pdfPage": n, "printedPage": printed_page(text), "pressureAltitudeFt": b["alt"],
                                "oatC": oat, "weightLb": w, "kias": kias, "rocFpm": roc})
    assert out and all(r["pressureAltitudeFt"] is not None for r in out)
    lookup = {(r["pressureAltitudeFt"], r["oatC"], r["weightLb"]): (r["kias"], r["rocFpm"]) for r in out}
    assert lookup[(0, 0, 6000)] == (186, 2311) and lookup[(2000, 45, 5000)] == (135, 895)
    return out


def cruise_rows(root):
    evidence = root / "planes/Cirrus_Vision_Jet/tests/public-evidence"
    c = json.loads((evidence / "primary-afm-expanded-candidates.json").read_text())
    return sorted((r for r in c["cruise"] if r["deltaIsaC"] == 0 and r["power"] == "MCT" and r["weightLb"] == 6000),
                  key=lambda r: r["pressureAltitudeFt"])


# ------------------------------------------------------------ model and loading

def loaded_data_root(data_root, work, weight_lb):
    """Scenario-only mass overlay, as in validate-sf50.mjs: fuel up to 1,500 lb,
    the rest as a payload point mass at the model CG. Coefficients are untouched."""
    fuel = min(MAX_FUEL_LB, weight_lb - EMPTY_WEIGHT_LB)
    payload = weight_lb - EMPTY_WEIGHT_LB - fuel
    if fuel < 0:
        raise ValueError(f"{weight_lb} lb is below the model empty weight")
    target = work / f"aircraft-{int(weight_lb)}" / "sf50"
    target.mkdir(parents=True, exist_ok=True)
    xml = (data_root / "aircraft/sf50/sf50.xml").read_text()
    xml, n = re.subn(r"(<contents\s+unit=\"LBS\">)[^<]*(</contents>)", rf"\g<1>{fuel}\g<2>", xml)
    assert n == 1, "expected one fuel tank"
    cg = re.search(r"<location name=\"CG\" unit=\"IN\">(.*?)</location>", xml, re.S).group(1)
    xml = xml.replace("</mass_balance>", f'<pointmass name="scenario-payload"><weight unit="LBS">{payload}</weight>'
                                         f'<location unit="IN">{cg}</location></pointmass></mass_balance>', 1)
    (target / "sf50.xml").write_text(xml)
    return target.parent, {"fuelLb": fuel, "payloadLb": payload,
                           "scenarioModelSha256": hashlib.sha256(xml.encode()).hexdigest()}


class Model:
    def __init__(self, jsbsim, data_root, aircraft_dir):
        fdm = jsbsim.FGFDMExec(str(data_root) + "/", None)
        fdm.set_debug_level(0)
        fdm.set_aircraft_path(str(aircraft_dir))
        fdm.set_engine_path(str(data_root / "engine"))
        fdm.set_systems_path(str(data_root / "systems"))
        assert fdm.load_model("sf50"), "sf50 must load"
        fdm.set_dt(1.0 / 120.0)
        # Kinematic gear and flaps reach their command in one step while
        # trimming, so a configuration can be imposed at zero time.
        fdm.set_trim_status(True)
        self.fdm = fdm
        self.engine_running = False

    def impose(self, pressure_altitude_ft, oat_c, speed_kts, speed_kind, gamma_deg, alpha_deg,
               elevator, throttle, gear_down, flaps_norm):
        f = self.fdm
        f["fcs/elevator-cmd-norm"] = elevator
        f["fcs/pitch-trim-cmd-norm"] = 0.0
        f["fcs/aileron-cmd-norm"] = 0.0
        f["fcs/rudder-cmd-norm"] = 0.0
        f["gear/gear-cmd-norm"] = 1.0 if gear_down else 0.0
        f["fcs/flap-cmd-norm"] = flaps_norm
        f["ic/beta-deg"] = 0.0
        f["ic/phi-deg"] = 0.0
        f["ic/psi-true-deg"] = 0.0
        geometric = pressure_altitude_ft
        delta_t = self._delta_t = getattr(self, "_delta_t", 0.0)
        for _ in range(64):
            f["atmosphere/delta-T"] = delta_t
            f["ic/terrain-elevation-ft"] = geometric - 5000.0
            f["ic/h-sl-ft"] = geometric
            f["ic/" + speed_kind] = speed_kts
            f["ic/gamma-deg"] = gamma_deg
            f["ic/alpha-deg"] = alpha_deg
            self._throttle(throttle)
            assert f.run_ic()
            oat_err = oat_c - (f["atmosphere/T-R"] / RANKINE_PER_CELSIUS - KELVIN_AT_ZERO_C)
            alt_err = pressure_altitude_ft - f["atmosphere/pressure-altitude"]
            if abs(oat_err) < 1e-9 and abs(alt_err) < 1e-4:
                break
            delta_t += oat_err * RANKINE_PER_CELSIUS
            geometric += alt_err
        self._delta_t = delta_t
        if not self.engine_running:
            f["propulsion/set-running"] = -1   # forces throttle to 1; restored below
            self.engine_running = True
            self._throttle(throttle)
            assert f.run_ic()
        # Engine thrust and TSFC functions are evaluated at the start of the engine
        # update, before N1 and N2 move, so a function of spool speed sees the
        # previous pass. One more pass at the same state makes zero-time results
        # self-consistent.
        assert f.run_ic()
        return f

    def _throttle(self, value):
        self.fdm["fcs/throttle-cmd-norm[0]"] = value
        self.fdm["fcs/throttle-pos-norm[0]"] = value

    def residual(self):
        f = self.fdm
        return [f["accelerations/udot-ft_sec2"], f["accelerations/wdot-ft_sec2"], f["accelerations/qdot-rad_sec2"] * 100.0]


def solve(model, fixed, unknowns, start, bounds, tol=(1e-3, 1e-3, 1e-4), iterations=60):
    """Damped Newton on (udot, wdot, 100*qdot) with finite-difference Jacobian."""
    names = list(unknowns)
    x = list(start)

    def evaluate(v):
        args = dict(fixed)
        args.update(dict(zip(names, v)))
        model.impose(**args)
        return model.residual()

    r = evaluate(x)
    for it in range(iterations):
        if all(abs(ri) < ti for ri, ti in zip(r, tol)):
            return {"converged": True, "iterations": it, "x": dict(zip(names, x)), "residual": r}
        steps = [1e-3 if n != "alpha_deg" else 1e-2 for n in names]
        jac = []
        for j, h in enumerate(steps):
            xp = list(x)
            xp[j] += h
            rp = evaluate(xp)
            jac.append([(rp[i] - r[i]) / h for i in range(3)])
        # jac[j][i] = d r_i / d x_j ; solve J dx = -r with J[i][j]
        J = [[jac[j][i] for j in range(3)] for i in range(3)]
        try:
            dx = linear_solve(J, [-ri for ri in r])
        except ZeroDivisionError:
            break
        norm0 = sum(ri * ri for ri in r)
        lam = 1.0
        while lam > 1e-4:
            cand = [min(max(xi + lam * di, lo), hi) for xi, di, (lo, hi) in zip(x, dx, bounds)]
            rc = evaluate(cand)
            if sum(ri * ri for ri in rc) < norm0:
                x, r = cand, rc
                break
            lam *= 0.5
        else:
            break
    r = evaluate(x)
    return {"converged": all(abs(ri) < ti for ri, ti in zip(r, tol)), "iterations": iterations,
            "x": dict(zip(names, x)), "residual": r}


def solve_from(model, fixed, unknowns, starts, bounds, accept=lambda s: s["converged"]):
    """Try each start in turn; return the first accepted solution, else the last attempt."""
    attempt = None
    for start in starts:
        attempt = solve(model, fixed, unknowns, start, bounds)
        if accept(attempt):
            attempt["start"] = list(start)
            return attempt
    return attempt


def linear_solve(A, b):
    n = len(b)
    M = [row[:] + [bi] for row, bi in zip(A, b)]
    for c in range(n):
        p = max(range(c, n), key=lambda i: abs(M[i][c]))
        if abs(M[p][c]) < 1e-14:
            raise ZeroDivisionError
        M[c], M[p] = M[p], M[c]
        for i in range(c + 1, n):
            f = M[i][c] / M[c][c]
            for k in range(c, n + 1):
                M[i][k] -= f * M[c][k]
    x = [0.0] * n
    for i in reversed(range(n)):
        x[i] = (M[i][n] - sum(M[i][k] * x[k] for k in range(i + 1, n))) / M[i][i]
    return x


def state(model):
    f = model.fdm
    keys = {"alphaDeg": "aero/alpha-deg", "thetaDeg": "attitude/theta-deg", "gammaDeg": "flight-path/gamma-deg",
            "kcas": "velocities/vc-kts", "ktas": "velocities/vtrue-kts", "mach": "velocities/mach",
            "pressureAltitudeFt": "atmosphere/pressure-altitude", "aglFt": "position/h-agl-ft",
            "weightLb": "inertia/weight-lbs", "cgXIn": "inertia/cg-x-in", "n1Pct": "propulsion/engine[0]/n1",
            "thrustLbf": "propulsion/engine[0]/thrust-lbs", "elevatorPosRad": "fcs/elevator-pos-rad",
            "gearPosNorm": "gear/gear-pos-norm", "flapPosNorm": "fcs/flap-pos-norm", "wow": "gear/wow",
            "clTotal": "aero/cl-squared"}
    out = {}
    for k, p in keys.items():
        try:
            out[k] = f[p]
        except Exception:
            out[k] = None
    out["oatC"] = f["atmosphere/T-R"] / RANKINE_PER_CELSIUS - KELVIN_AT_ZERO_C
    return out


def lift_peak_alpha_deg(data_root):
    xml = (data_root / "aircraft/sf50/sf50.xml").read_text()
    body = re.search(r'name="aero/coefficient/CLalpha".*?<tableData>(.*?)</tableData>', xml, re.S).group(1)
    pts = [tuple(map(float, l.split())) for l in body.strip().splitlines() if l.strip()]
    return math.degrees(max(pts, key=lambda p: p[1])[0])


# -------------------------------------------------------------------- checks

def check_cruise(jsbsim, data_root, work, root):
    aircraft, loading = loaded_data_root(data_root, work, 6000)
    model = Model(jsbsim, data_root, aircraft)
    results = []
    bounds = ((-8.0, 16.0), (-1.0, 1.0), (0.0, 1.0))
    starts = [(0.0, 0.05, 0.9), (-1.5, 0.08, 0.95), (2.0, 0.0, 0.7), (-3.0, 0.1, 0.99)]
    for row in cruise_rows(root):
        fixed = dict(pressure_altitude_ft=row["pressureAltitudeFt"], oat_c=row["oatC"], speed_kts=row["tasKt"],
                     speed_kind="vt-kts", gamma_deg=0.0, gear_down=False, flaps_norm=0.0)
        s = solve_from(model, fixed, ("alpha_deg", "elevator", "throttle"), starts, bounds)
        st = state(model)
        # Independent cross-check: JSBSim's longitudinal trim from the same condition.
        model.impose(**fixed, alpha_deg=s["x"]["alpha_deg"], elevator=0.0, throttle=min(s["x"]["throttle"], 0.99))
        f = model.fdm
        try:
            f["simulation/do_simple_trim"] = 0
            trim = {"n1Pct": f["propulsion/engine[0]/n1"], "throttle": f["fcs/throttle-cmd-norm[0]"],
                    "alphaDeg": f["aero/alpha-deg"], "udot": f["accelerations/udot-ft_sec2"]}
        except Exception as e:
            trim = {"error": f"{type(e).__name__}: {str(e)[:160]}"}
        f.set_trim_status(True)
        saturated = s["x"]["throttle"] >= 1.0 - 1e-9
        results.append({"afm": row, "solution": s, "model": st, "jsbsimTrim": trim,
                        "requiredN1Pct": st["n1Pct"] if s["converged"] else None, "afmN1Pct": row["n1Pct"],
                        "n1DifferencePct": st["n1Pct"] - row["n1Pct"] if s["converged"] else None,
                        "throttleSaturated": saturated, "afmN1AboveModelMaximum": row["n1Pct"] > MAX_N1})
    return {"loading": loading, "rows": results}


def check_stall(jsbsim, data_root, work, pages):
    table = stall_table(pages)
    peak = lift_peak_alpha_deg(data_root)
    bounds = ((-12.0, peak), (-1.0, 1.0), (-40.0, 10.0))
    out = []
    for weight in sorted({r["weightLb"] for r in table}):
        aircraft, loading = loaded_data_root(data_root, work, weight)
        model = Model(jsbsim, data_root, aircraft)
        for flaps in (0.0, 0.5, 1.0):
            afm = {r["bankDeg"]: r["stallKcas"] for r in table if r["weightLb"] == weight and r["flapsNorm"] == flaps}
            gear_down = flaps > 0.0

            def fixed(kcas):
                return dict(pressure_altitude_ft=0.0, oat_c=15.0, speed_kts=kcas, speed_kind="vc-kts",
                            throttle=0.0, gear_down=gear_down, flaps_norm=flaps)

            def feasible(s):
                x = s["x"]
                return s["converged"] and x["alpha_deg"] < peak - 1e-6 and abs(x["elevator"]) < 1.0 - 1e-6

            def glide(kcas, warm):
                starts = ([warm] if warm else []) + [(4.0, 0.0, -5.0), (8.0, -0.3, -5.0), (12.0, -0.5, -6.0)]
                return solve_from(model, fixed(kcas), ("alpha_deg", "elevator", "gamma_deg"), starts, bounds, feasible)

            # Continuation: step down from well above the printed speed with
            # warm starts, so each solve begins on the attached-flow branch.
            speed, warm, last_ok, first_bad = 1.6 * afm[0], None, None, None
            at_afm = None
            while speed > 30.0:
                s = glide(speed, warm)
                if not feasible(s):
                    first_bad = speed
                    break
                last_ok, warm = (speed, s), (s["x"]["alpha_deg"], s["x"]["elevator"], s["x"]["gamma_deg"])
                if at_afm is None and speed - 1.0 < afm[0]:
                    exact = glide(float(afm[0]), warm)
                    at_afm = exact if feasible(exact) else None
                speed -= 1.0
            if last_ok is None:
                out.append({"weightLb": weight, "flapsNorm": flaps, "gearDown": gear_down, "loading": loading,
                            "afmStallKcasByBank": afm, "error": f"no idle-glide solution at {1.6 * afm[0]:.1f} KCAS"})
                continue
            hi, best = last_ok
            lo = first_bad if first_bad is not None else 30.0
            while hi - lo > 0.02:
                mid = 0.5 * (lo + hi)
                s = glide(mid, (best["x"]["alpha_deg"], best["x"]["elevator"], best["x"]["gamma_deg"]))
                if feasible(s):
                    hi, best = mid, s
                else:
                    lo = mid
            x = best["x"]
            limit = "lift-curve peak" if x["alpha_deg"] > peak - 0.25 else \
                    "elevator authority" if abs(x["elevator"]) > 0.98 else "solver"
            out.append({"weightLb": weight, "flapsNorm": flaps, "gearDown": gear_down, "loading": loading,
                        "afmStallKcasByBank": afm, "modelMinimumKcas1g": hi, "minimumLimitedBy": limit,
                        "modelMinimumByBankKcas": {b: hi * math.sqrt(1.0 / math.cos(math.radians(b))) for b in afm},
                        "afmBankScalingCheck": {b: afm[b] / (afm[0] * math.sqrt(1.0 / math.cos(math.radians(b)))) for b in afm},
                        "differenceKcas": hi - afm[0],
                        "alphaAtModelMinimumDeg": x["alpha_deg"], "elevatorAtModelMinimum": x["elevator"],
                        "gammaAtModelMinimumDeg": x["gamma_deg"],
                        "alphaNeededAtAfmSpeedDeg": at_afm["x"]["alpha_deg"] if at_afm else None,
                        "elevatorAtAfmSpeed": at_afm["x"]["elevator"] if at_afm else None,
                        "modelCanFlyAfmSpeed": at_afm is not None})
    return {"liftCurvePeakAlphaDeg": peak,
            "conditions": "1 g wings-level idle glide, pressure altitude 0 ft ISA; gear down with flaps 50% and 100%, up with flaps 0%",
            "rows": out}


def afm_mct_n1(root):
    """MCT N1 by weight, pressure altitude and ISA deviation, from the AFM cruise
    tables. MCT is a thrust-lever detent the FADEC holds; the printed N1 differs
    by up to 0.6 % between weights at one condition, consistent with a schedule
    that depends on Mach, so the row's own weight is used."""
    evidence = root / "planes/Cirrus_Vision_Jet/tests/public-evidence"
    rows = json.loads((evidence / "primary-afm-expanded-candidates.json").read_text())["cruise"]
    grid = {}
    for r in rows:
        if r["power"] == "MCT":
            key = (r["weightLb"], r["pressureAltitudeFt"], r["deltaIsaC"])
            assert grid.setdefault(key, r["n1Pct"]) == r["n1Pct"], f"duplicate MCT row {key}"
    alts = sorted({a for _, a, _ in grid})
    devs = sorted({d for _, _, d in grid})

    def lookup(weight_lb, pressure_altitude_ft, oat_c):
        dev = oat_c - (15.0 - 2.0 * pressure_altitude_ft / 1000.0)   # AFM standard temperature convention
        a = min(max(pressure_altitude_ft, alts[0]), alts[-1])
        d = min(max(dev, devs[0]), devs[-1])
        def bracket(values, v):
            for lo, hi in zip(values, values[1:]):
                if lo <= v <= hi:
                    return lo, hi, (v - lo) / (hi - lo)
            return values[-1], values[-1], 0.0
        a0, a1, ta = bracket(alts, a)
        d0, d1, td = bracket(devs, d)
        g = lambda a, d: grid[(weight_lb, a, d)]
        v = ((1 - ta) * ((1 - td) * g(a0, d0) + td * g(a0, d1)) +
             ta * ((1 - td) * g(a1, d0) + td * g(a1, d1)))
        return v, {"isaDeviationC": dev, "clampedAltitude": a != pressure_altitude_ft, "clampedIsaDeviation": d != dev}
    return lookup


def check_climb(jsbsim, data_root, work, pages, root):
    table = climb_table(pages)
    mct = afm_mct_n1(root)
    out = []
    for weight in sorted({r["weightLb"] for r in table}):
        aircraft, loading = loaded_data_root(data_root, work, weight)
        model = Model(jsbsim, data_root, aircraft)
        warm = {"afm-mct": (3.0, 0.0, 6.0), "max": (3.0, 0.0, 8.0)}
        for row in sorted((r for r in table if r["weightLb"] == weight), key=lambda r: (r["pressureAltitudeFt"], r["oatC"])):
            kcas = interpolate(KIAS_TO_KCAS_FLAPS_0, row["kias"])
            n1, basis = mct(row["weightLb"], row["pressureAltitudeFt"], row["oatC"])
            settings = {"afm-mct": min(1.0, (n1 - IDLE_N1) / (MAX_N1 - IDLE_N1)), "max": 1.0}
            entry = {"afm": row, "kcas": kcas, "afmMctN1Pct": n1, "mctN1Basis": basis,
                     "afmMctN1AboveModelMaximum": n1 > MAX_N1}
            for name, throttle in settings.items():
                fixed = dict(pressure_altitude_ft=row["pressureAltitudeFt"], oat_c=row["oatC"], speed_kts=kcas,
                             speed_kind="vc-kts", throttle=throttle, gear_down=False, flaps_norm=0.0)
                starts = [warm[name], (3.0, 0.0, 6.0), (1.0, 0.0, 2.0), (5.0, -0.1, 12.0)]
                s = solve_from(model, fixed, ("alpha_deg", "elevator", "gamma_deg"), starts,
                               ((-8.0, 16.0), (-1.0, 1.0), (-10.0, 30.0)))
                st = state(model)
                if s["converged"]:
                    warm[name] = (s["x"]["alpha_deg"], s["x"]["elevator"], s["x"]["gamma_deg"])
                roc = st["ktas"] * KTS_TO_FPS * math.sin(math.radians(st["gammaDeg"])) * 60.0
                entry[name] = {"throttle": throttle, "converged": s["converged"], "model": st, "modelRocFpm": roc,
                               "differenceFpm": roc - row["rocFpm"], "ratio": roc / row["rocFpm"] if row["rocFpm"] else None}
            out.append(entry)
    return {"thrust": {"afm-mct": "throttle placed at the AFM cruise-table MCT N1 for the row's altitude and ISA deviation "
                                  "(clamped to the 5,000-28,000 ft and ISA-10..+20 grid, and to the model's 100% maximum)",
                       "max": "throttle 1.0, the model's maximum"}, "rows": out}


def main():
    args = parse_args()
    root = pathlib.Path(__file__).resolve().parent.parent
    out = pathlib.Path(args.out).resolve()
    if out.exists():
        raise SystemExit(f"Refusing to reuse an existing output directory: {out}")
    work = out / "work"
    work.mkdir(parents=True)
    native = pathlib.Path(args.native_build).resolve()
    sys.path.insert(0, str(native / "tests"))
    from jsbsim import _jsbsim as jsbsim
    data_root = pathlib.Path(args.data_root).resolve() if args.data_root else root / "public/jsbsim-data"
    read_engine_n1_limits(data_root)
    checks = args.checks.split(",")
    pages = poh_pages(root, work) if {"stall", "climb"} & set(checks) else None

    report = {"schemaVersion": 1, "diagnostic": "diagnose-sf50-steady-flight.py",
              "jsbsim": git_identity(pathlib.Path(args.jsbsim_source).resolve()), "nativeBuild": str(native),
              "dataRoot": str(data_root), "app": git_identity(root),
              "packageSha256": {p: sha256(data_root / p) for p in ("aircraft/sf50/sf50.xml", "engine/fj33_5a.xml")},
              "afm": {"document": "Cirrus SF50 AFM P/N 31452-001 Revision 4", "file": POH, "sha256": POH_SHA256},
              "method": "Zero-time equilibrium: udot, wdot and 100*qdot below 1e-3 ft/s^2, 1e-3 ft/s^2 and 1e-4 by damped Newton. "
                        "Pressure altitude and OAT imposed jointly through geometric altitude and atmosphere/delta-T. "
                        "Loading: fuel up to 1500 lb, remaining payload at the model CG, as in validate-sf50.mjs.",
              "engineN1": {"idlePct": IDLE_N1, "maximumPct": MAX_N1},
              "frozen": "No coefficient, engine table or FCS value is changed."}
    if "cruise" in checks:
        report["cruise"] = check_cruise(jsbsim, data_root, work, root)
    if "stall" in checks:
        report["stall"] = check_stall(jsbsim, data_root, work, pages)
    if "climb" in checks:
        report["climb"] = check_climb(jsbsim, data_root, work, pages, root)
    (out / "steady-flight.json").write_text(json.dumps(report, indent=1) + "\n")

    if "cruise" in report:
        print("\nCRUISE, ISA MCT 6000 lb: N1 the model needs for the AFM's TAS")
        print(f"{'PA ft':>6} {'OAT':>5} {'TAS':>4} {'AFM N1':>7} {'model N1':>9} {'diff':>6} {'alpha':>6} {'trim N1':>8} conv")
        for r in report["cruise"]["rows"]:
            a, m, t = r["afm"], r["model"], r["jsbsimTrim"]
            n1 = f"{m['n1Pct']:.1f}" if r["solution"]["converged"] else "-"
            d = f"{r['n1DifferencePct']:+.1f}" if r["n1DifferencePct"] is not None else "-"
            tn = f"{t['n1Pct']:.1f}" if "n1Pct" in t else "fail"
            print(f"{a['pressureAltitudeFt']:>6} {a['oatC']:>5} {a['tasKt']:>4} {a['n1Pct']:>7} {n1:>9} {d:>6} "
                  f"{m['alphaDeg']:>6.2f} {tn:>8} {r['solution']['converged']}{'  throttle at max' if r['throttleSaturated'] else ''}")
    if "stall" in report:
        print(f"\nSTALL, 1 g idle, lift-curve peak alpha {report['stall']['liftCurvePeakAlphaDeg']:.2f} deg")
        print(f"{'lb':>5} {'flap':>4} {'AFM':>4} {'model':>6} {'diff':>6} {'limit':>18} {'alpha@AFM':>9}")
        for r in report["stall"]["rows"]:
            if "error" in r:
                print(f"{r['weightLb']:>5} {r['flapsNorm']:>4} {r['afmStallKcasByBank'][0]:>4}  ERROR {r['error']}  "
                      f"x={r['solutionAtUpperBracket']['x']} res={r['solutionAtUpperBracket']['residual']}")
                continue
            a = r["alphaNeededAtAfmSpeedDeg"]
            print(f"{r['weightLb']:>5} {r['flapsNorm']:>4} {r['afmStallKcasByBank'][0]:>4} {r['modelMinimumKcas1g']:>6.1f} "
                  f"{r['differenceKcas']:>+6.1f} {r['minimumLimitedBy']:>18} {('%.2f' % a) if a is not None else 'cannot':>9}")
    if "climb" in report:
        rows = report["climb"]["rows"]
        for name in ("afm-mct", "max"):
            conv = [r for r in rows if r[name]["converged"]]
            ratios = sorted(r[name]["ratio"] for r in conv if r[name]["ratio"])
            print(f"\nCLIMB at {name}: {len(conv)}/{len(rows)} solved; model/AFM ROC median {ratios[len(ratios)//2]:.2f}, "
                  f"p10 {ratios[len(ratios)//10]:.2f}, p90 {ratios[9*len(ratios)//10]:.2f}")
        print("rows nearest ISA:")
        print(f"{'lb':>5} {'PA ft':>6} {'OAT':>4} {'KIAS':>4} {'AFM fpm':>7} {'MCT N1':>6} {'model@MCT':>9} {'ratio':>5} {'model@100':>9} {'ratio':>5}")
        for w in (6000, 4500):
            for alt in (0, 6000, 14000, 20000, 28000):
                cand = [r for r in rows if r["afm"]["weightLb"] == w and r["afm"]["pressureAltitudeFt"] == alt]
                if not cand:
                    continue
                r = min(cand, key=lambda r: abs(r["mctN1Basis"]["isaDeviationC"]))
                a, m, x = r["afm"], r["afm-mct"], r["max"]
                print(f"{w:>5} {alt:>6} {a['oatC']:>4} {a['kias']:>4} {a['rocFpm']:>7} {r['afmMctN1Pct']:>6.1f} "
                      f"{m['modelRocFpm']:>9.0f} {m['ratio']:>5.2f} {x['modelRocFpm']:>9.0f} {x['ratio']:>5.2f}")
    print(f"\nWrote {out / 'steady-flight.json'}")


if __name__ == "__main__":
    main()
