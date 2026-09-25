#!/usr/bin/env python3
"""Focused turbine probes that the broad RunIC trace cannot express.

Companion to `runic_trace.py` for stage 1 of the turbine initialization plan.
Each probe isolates one question, writes a JSON record and a readable block,
and states what it does *not* show. Probes marked "instrumented" need a build
made with `instrument_turbine.py`; the others run on any build.

  live-state          what the copied propulsion timestep, the executive
                      timestep, the trim status and the phase actually are
                      after a public call returns, as opposed to what the
                      latched last-dispatch diagnostics recorded during it.
                      Instrumented.
  nesting             SuspendIntegration()'s single saved slot, through
                      RunIC() and through propulsion/set-running.
  starvation          what the published fuel-flow properties do once
                      ConsumeFuel() stops being reached.
  fuel-matrix         usable fuel crossed with fuel freeze and with a stale
                      starvation flag, at initialize-running and at refresh.
  stale-tsfc          the published corrected TSFC while the engine is off.
                      Instrumented.
  n2norm-spool-rate   the first Run() frame's spool increment as a function of
                      the member N2norm alone. Instrumented (it writes the
                      member through a diagnostic tie).
  stall-recovery      a compressor stall, what clears it, and what the engine
                      returns to.  Instrumented.
  injection-load      what a <injected> 1 </injected> engine with no Injection
                      function does at load, through RunIC (Trim), through Run
                      with the engine off, and through Run with it running.
                      Arms that reach the lookup may terminate the process, so
                      each runs on its own.
  linearization       FGLinearization's input matrix on the 737, which is the
                      compatibility measurement for the suspended
                      numerical-Jacobian path.
  function-calls      how many times each dispatched phase evaluates the
                      configured TSFC and ATSFC parameters, which is the table
                      a behaviour-preserving extraction has to reproduce.
                      Instrumented: a constant copyto sentinel can show that a
                      function was evaluated, not how often.

Example:
  python3 engine_probes.py --source /path/to/jsbsim \\
      --build live=/path/to/jsbsim/build/x/live \\
      --build live-candidate=/path/to/jsbsim/build/x/live-candidate
Each build's jsbsim module is loaded from <build>/tests in its own process.
Output defaults to a new dated directory in the source repository's build/.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

E = "propulsion/engine[0]/"
DT = 1.0 / 120.0
PHASES = ("off", "run", "spinup", "start", "stall", "seize", "trim")
PROBES = ("live-state", "nesting", "starvation", "fuel-matrix", "stale-tsfc",
          "n2norm-spool-rate", "stall-recovery", "linearization",
          "function-calls", "derivative-seeding", "cold-reset", "frozen-refill")
# injection-load is driven from the parent because one arm may crash.
INSTRUMENTED = {"live-state", "stale-tsfc", "n2norm-spool-rate", "stall-recovery",
                "function-calls"}


def digest(path):
    with open(path, "rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


class Fdm:
    """A loaded FDM plus the helpers every probe wants."""

    def __init__(self, jsbsim, source, root, aircraft="f16", ic="reset00",
                 engines=None, dt=DT, aircraft_path=None):
        root.mkdir(parents=True, exist_ok=True)
        self.fdm = jsbsim.FGFDMExec(str(root) + "/", None)
        self.fdm.set_aircraft_path(str(aircraft_path or source / "aircraft"))
        self.fdm.set_engine_path(str(engines or source / "engine"))
        self.fdm.set_systems_path(str(source / "systems"))
        assert self.fdm.load_model(aircraft), aircraft
        assert self.fdm.load_ic(ic, True), ic
        self.fdm.set_dt(dt)
        names = {line.split()[0] for line in self.fdm.get_property_catalog()
                 if line.strip()}
        # A single-engine model lists its properties without the [0] index,
        # although reading them with it resolves either way.
        self.diag = (E + "diag-live-phase" in names
                     or "propulsion/engine/diag-live-phase" in names)
        self.tanks = sorted(n for n in names if n.startswith("propulsion/tank")
                            and n.endswith("/contents-lbs"))

    def __getitem__(self, key):
        return self.fdm[key]

    def __setitem__(self, key, value):
        self.fdm[key] = value

    def throttle(self, value):
        self.fdm["fcs/throttle-cmd-norm[0]"] = value

    def frames(self, n):
        for _ in range(n):
            assert self.fdm.run()

    def tank_total(self):
        return sum(self.fdm[t] for t in self.tanks)

    def latched(self):
        """The last-dispatch diagnostics: what the previous evaluation saw."""
        return {"phase": PHASES[int(self.fdm[E + "diag-phase"])],
                "engine-dt": self.fdm[E + "diag-engine-dt"],
                "exec-dt": self.fdm[E + "diag-exec-dt"],
                "trim-status": self.fdm[E + "diag-trim-status"]}

    def live(self):
        """Current state, read through side-effect-free getters."""
        return {"phase": PHASES[int(self.fdm[E + "diag-live-phase"])],
                "engine-dt": self.fdm[E + "diag-live-engine-dt"],
                "exec-dt": self.fdm[E + "diag-live-exec-dt"],
                "trim-status": self.fdm[E + "diag-live-trim-status"],
                "suspended": self.fdm[E + "diag-live-suspended"]}


# --------------------------------------------------------------------------
# probes

def probe_live_state(jsbsim, source, output):
    """Latched last-dispatch diagnostics against live state, after each call.

    The last-dispatch fields are written at `Calculate()` entry and just
    before the phase dispatch, so after a public call returns they describe
    the last evaluation that call performed, not the state it left behind.
    `FGPropulsion::GetSteadyState()` in particular evaluates the engine at an
    artificial 0.5 s step and then restores `in.TotalDeltaT` before returning.
    """
    f = Fdm(jsbsim, source, output / "live-state")
    points = []

    def sample(label):
        points.append({"label": label, "latched": f.latched(), "live": f.live(),
                       "exec-dt-public": f.fdm.get_delta_t(),
                       "suspended-public": f.fdm.integration_suspended(),
                       "trim-status-public": bool(f.fdm.get_trim_status())})

    sample("loaded")
    assert f.fdm.run_ic()
    sample("after RunIC(), engine off")
    f["propulsion/set-running"] = -1
    sample("after propulsion/set-running = -1")
    f.throttle(0.6)
    f.frames(240)
    sample("after 240 normal frames")
    assert f.fdm.run_ic()
    sample("after RunIC(), engine running")
    f.frames(1)
    sample("after one normal frame following RunIC()")
    f.fdm.suspend_integration()
    sample("after SuspendIntegration(), before any Run()")
    f.frames(1)
    sample("after one suspended Run()")
    f.fdm.resume_integration()
    sample("after ResumeIntegration(), before any Run()")
    f.frames(1)
    sample("after one resumed Run()")
    return {"points": points,
            "reading": "latched fields are written during an evaluation and "
                       "describe it; live fields are read now. Where a public "
                       "call restores something after its last evaluation, "
                       "only the live column describes what the caller has."}


def probe_nesting(jsbsim, source, output):
    """SuspendIntegration() keeps one saved timestep, not a stack."""
    out = {}
    for name, inner in (("RunIC", "run_ic"), ("set-running", "set_running")):
        f = Fdm(jsbsim, source, output / f"nesting-{name}")
        assert f.fdm.run_ic()
        f["propulsion/set-running"] = -1
        f.throttle(0.6)
        f.frames(10)
        before = f.fdm.get_delta_t()
        f.fdm.suspend_integration()
        suspended = {"exec-dt": f.fdm.get_delta_t(),
                     "suspended": f.fdm.integration_suspended()}
        if inner == "run_ic":
            assert f.fdm.run_ic()
        else:
            f["propulsion/set-running"] = -1
        inner_done = {"exec-dt": f.fdm.get_delta_t(),
                      "suspended": f.fdm.integration_suspended()}
        f.fdm.resume_integration()
        after = {"exec-dt": f.fdm.get_delta_t(),
                 "suspended": f.fdm.integration_suspended()}
        # An explicit Setdt is enough to recover; the executive is not wedged
        # beyond the caller's ability to intervene.
        f.fdm.set_dt(before)
        recovered = {"exec-dt": f.fdm.get_delta_t(),
                     "suspended": f.fdm.integration_suspended()}
        out[name] = {"dt-before": before, "after-outer-suspend": suspended,
                     "after-inner-call": inner_done,
                     "after-outer-resume": after,
                     "after-explicit-set-dt": recovered,
                     "outer-resume-restored-dt": after["exec-dt"] == before}
        del f
    return out


def probe_starvation(jsbsim, source, output):
    """The published rate is written only inside ConsumeFuel()."""
    f = Fdm(jsbsim, source, output / "starvation")
    assert f.fdm.run_ic()
    f["propulsion/set-running"] = -1
    f.throttle(0.6)
    f.frames(240)
    rows = [{"label": "running", "gph": f[E + "fuel-flow-rate-gph"],
             "pps": f[E + "fuel-flow-rate-pps"], "running": f[E + "set-running"],
             "n2": f[E + "n2"], "used-lbs": f[E + "fuel-used-lbs"]}]
    for tank in f.tanks:
        f[tank] = 0.0
    done = 0
    for frames in (1, 120, 1200, 7200):
        f.frames(frames - done)
        done = frames
        rows.append({"label": f"starved +{frames} frames",
                     "gph": f[E + "fuel-flow-rate-gph"],
                     "pps": f[E + "fuel-flow-rate-pps"],
                     "running": f[E + "set-running"], "n2": f[E + "n2"],
                     "used-lbs": f[E + "fuel-used-lbs"]})
    # Refilling a tank brings ConsumeFuel() back and the published rate with it.
    for tank in f.tanks:
        f[tank] = 500.0
    f.frames(1)
    rows.append({"label": "after refilling the tanks, +1 frame",
                 "gph": f[E + "fuel-flow-rate-gph"],
                 "pps": f[E + "fuel-flow-rate-pps"],
                 "running": f[E + "set-running"], "n2": f[E + "n2"],
                 "used-lbs": f[E + "fuel-used-lbs"]})
    return {"rows": rows}


def probe_fuel_matrix(jsbsim, source, output):
    """Usable fuel crossed with fuel freeze, at start and at RunIC."""
    cases = []
    for tanks_empty in (False, True):
        for frozen in (False, True):
            f = Fdm(jsbsim, source, output /
                    f"fuel-{'empty' if tanks_empty else 'full'}-"
                    f"{'frozen' if frozen else 'thawed'}")
            assert f.fdm.run_ic()
            if tanks_empty:
                for tank in f.tanks:
                    f[tank] = 0.0
            if frozen:
                f["propulsion/fuel_freeze"] = 1
            f.throttle(0.6)
            before = {"tank-total-lbs": f.tank_total(),
                      "gph": f[E + "fuel-flow-rate-gph"]}
            f["propulsion/set-running"] = -1
            after_start = {"running": f[E + "set-running"], "n1": f[E + "n1"],
                           "n2": f[E + "n2"], "thrust": f[E + "thrust-lbs"],
                           "gph": f[E + "fuel-flow-rate-gph"]}
            assert f.fdm.run_ic()
            after_ic = {"running": f[E + "set-running"], "n1": f[E + "n1"],
                        "n2": f[E + "n2"], "thrust": f[E + "thrust-lbs"],
                        "gph": f[E + "fuel-flow-rate-gph"]}
            f.frames(120)
            after_frames = {"running": f[E + "set-running"], "n1": f[E + "n1"],
                            "n2": f[E + "n2"], "thrust": f[E + "thrust-lbs"],
                            "gph": f[E + "fuel-flow-rate-gph"],
                            "used-lbs": f[E + "fuel-used-lbs"],
                            "tank-total-lbs": f.tank_total()}
            cases.append({"tanks": "empty" if tanks_empty else "full",
                          "fuel-freeze": frozen, "before": before,
                          "after-set-running": after_start,
                          "after-run-ic": after_ic,
                          "after-120-frames": after_frames})
            del f

    # A stale starvation flag: starve the engine, refill, and see what the
    # next initialization does with the flag left behind.
    f = Fdm(jsbsim, source, output / "fuel-stale-starved")
    assert f.fdm.run_ic()
    f["propulsion/set-running"] = -1
    f.throttle(0.6)
    f.frames(240)
    for tank in f.tanks:
        f[tank] = 0.0
    f.frames(2)
    starved = {"running": f[E + "set-running"], "n2": f[E + "n2"],
               "gph": f[E + "fuel-flow-rate-gph"]}
    for tank in f.tanks:
        f[tank] = 500.0
    refilled_no_frame = {"running": f[E + "set-running"], "n2": f[E + "n2"],
                         "gph": f[E + "fuel-flow-rate-gph"]}
    assert f.fdm.run_ic()
    after_ic = {"running": f[E + "set-running"], "n2": f[E + "n2"],
                "gph": f[E + "fuel-flow-rate-gph"],
                "thrust": f[E + "thrust-lbs"]}
    f["propulsion/set-running"] = -1
    after_restart = {"running": f[E + "set-running"], "n1": f[E + "n1"],
                     "n2": f[E + "n2"], "gph": f[E + "fuel-flow-rate-gph"],
                     "thrust": f[E + "thrust-lbs"]}
    f.frames(120)
    after_frames = {"running": f[E + "set-running"], "n2": f[E + "n2"],
                    "gph": f[E + "fuel-flow-rate-gph"],
                    "used-lbs": f[E + "fuel-used-lbs"]}
    return {"cases": cases,
            "stale-starvation": {"starved": starved,
                                 "refilled-without-a-frame": refilled_no_frame,
                                 "after-run-ic": after_ic,
                                 "after-set-running": after_restart,
                                 "after-120-frames": after_frames}}


def probe_stale_tsfc(jsbsim, source, output):
    """The published corrected TSFC and the member N2norm while off."""
    f = Fdm(jsbsim, source, output / "stale-tsfc")
    assert f.fdm.run_ic()
    f["propulsion/set-running"] = -1
    f.throttle(0.6)
    f.frames(600)
    rows = [{"label": "running", "n2": f[E + "n2"],
             "n2norm": f[E + "diag-n2norm"], "tsfc": f[E + "tsfc"]}]
    f["propulsion/cutoff_cmd"] = 1
    done = 0
    for frames in (120, 1200, 2400):
        f.frames(frames - done)
        done = frames
        rows.append({"label": f"cut off +{frames} frames", "n2": f[E + "n2"],
                     "n2norm": f[E + "diag-n2norm"], "tsfc": f[E + "tsfc"]})
    return {"rows": rows}


def probe_n2norm_spool_rate(jsbsim, source, output):
    """The first Run() frame's spool increment as a function of N2norm alone.

    FGSpoolUp scales the spool rate by min(1, N2norm + 0.1). The engine is put
    at idle N2 with a full-throttle demand, the member is written through a
    diagnostic tie, and one frame is run. Nothing else differs between arms.
    """
    rows = []
    for forced in (0.0, 0.25, 0.5, 1.0):
        f = Fdm(jsbsim, source, output / f"n2norm-{forced}")
        assert f.fdm.run_ic()
        f["propulsion/set-running"] = -1
        f.throttle(0.0)
        f.frames(1200)
        before = {"n1": f[E + "n1"], "n2": f[E + "n2"]}
        f.throttle(0.5)
        f[E + "diag-n2norm"] = forced
        f.frames(1)
        rows.append({"n2norm": forced, "n2-before": before["n2"],
                     "n2-after": f[E + "n2"],
                     "n2-delta": f[E + "n2"] - before["n2"],
                     "n1-before": before["n1"], "n1-after": f[E + "n1"],
                     "n1-delta": f[E + "n1"] - before["n1"]})
        del f
    base = next(r for r in rows if r["n2norm"] == 0.0)["n2-delta"]
    for r in rows:
        r["ratio-to-n2norm-0"] = r["n2-delta"] / base if base else None
    return {"rows": rows,
            "note": "one frame only; Run() recomputes N2norm after seeking"}


def probe_stall_recovery(jsbsim, source, output):
    """A compressor stall, what clears it, and what the engine returns to."""
    f = Fdm(jsbsim, source, output / "stall")
    f["ic/h-sl-ft"] = 20000
    f["ic/vc-kts"] = 300
    assert f.fdm.run_ic()
    f["propulsion/set-running"] = -1
    f.throttle(0.5)
    f.frames(600)

    def row(label):
        return {"label": label, "n2": f[E + "n2"], "n2norm": f[E + "diag-n2norm"],
                "thrust": f[E + "thrust-lbs"], "phase": f.latched()["phase"],
                "fuelflow-pph": f[E + "diag-fuelflow-pph"],
                "running": f[E + "set-running"]}

    rows = [row("running")]
    f[E + "stalled"] = 1
    f.frames(600)
    rows.append(row("stalled 5 s"))
    f.throttle(0.0)
    done = 0
    for frames in (1, 60, 300, 600, 1200):
        f.frames(frames - done)
        done = frames
        rows.append(row(f"cleared +{frames}"))
    return {"rows": rows,
            "not-shown": "whether tpRun is reachable with N2 below IdleN2, "
                         "which is what would make the unbounded N2norm negative"}


def quiet_737(source, output):
    """A sandbox copy of the 737 with its telnet and QTJSBSIM inputs removed.

    `RunIC()` initializes the input model, and the shipped 737 declares two
    listening sockets. A characterization run must not open them.
    """
    directory = output / "aircraft" / "737"
    directory.mkdir(parents=True, exist_ok=True)
    for path in (source / "aircraft" / "737").iterdir():
        if path.is_file():
            (directory / path.name).write_bytes(path.read_bytes())
    text = (directory / "737.xml").read_text()
    assert text.count("<input port=") == 2, "input anchor"
    start = text.index(" <!-- this is the telnet interface -->")
    end = text.index("</fdm_config>")
    (directory / "737.xml").write_text(text[:start] + "\n" + text[end:])
    assert "<input port=" not in (directory / "737.xml").read_text()
    return directory.parent


def probe_linearization(jsbsim, source, output):
    """FGLinearization's input matrix on the 737, at several throttle settings.

    `FGLinearization` suspends integration around `FGStateSpace::linearize`,
    and every perturbation goes through `FGStateSpace::run()`, which calls
    `FGEngine::InitRunning()` on each engine and then settles. The turbine is
    therefore evaluated on its zero-dt path throughout, and the throttle
    column of B describes the steady thrust response rather than the spool
    dynamics. This records that column so a later routing change can be
    compared against it rather than assumed equivalent.

    The column is exactly zero at zero throttle, which is arithmetic rather
    than a missing coupling: the steady thrust term is proportional to the
    square of the normalized spool, whose derivative at idle is zero. Non-zero
    settings are what make the comparison meaningful.
    """
    aircraft_path = quiet_737(source, output)
    arms = []
    for throttle in (0.0, 0.3, 0.6, 0.9):
        f = Fdm(jsbsim, source, output / f"linearization-{throttle}",
                aircraft="737", ic="cruise_init", aircraft_path=aircraft_path)
        assert f.fdm.run_ic()
        for index in (0, 1):
            f[f"fcs/throttle-cmd-norm[{index}]"] = throttle
        lin = jsbsim.FGLinearization(f.fdm)
        x_names = [str(n) for n in lin.x_names]
        u_names = [str(n) for n in lin.u_names]
        B = [[float(v) for v in row] for row in lin.input_matrix]
        column = u_names.index("ThtlCmd") if "ThtlCmd" in u_names else 0
        arms.append({
            "throttle": throttle,
            "state-names": x_names, "input-names": u_names,
            "u0": [float(v) for v in lin.u0],
            "B-throttle-column": [row[column] for row in B],
            "throttle-column-index": column,
            "engine-after": {"n1": f[E + "n1"], "n2": f[E + "n2"],
                             "thrust": f[E + "thrust-lbs"],
                             "gph": f[E + "fuel-flow-rate-gph"],
                             "running": f[E + "set-running"],
                             "fcs-throttle-pos": f["fcs/throttle-pos-norm[0]"]},
        })
        del lin, f
    return {"arms": arms,
            "engine-states-in-model": "none — FGLinearization adds spool "
                                      "states only for propeller thrusters, so "
                                      "a turbine contributes no state to x"}


def augmethod1_engine(source, output):
    """A sandbox copy of the F-16 engine with <augmethod> 1."""
    import re as _re
    directory = output / "engine-augmethod1"
    directory.mkdir(parents=True, exist_ok=True)
    engine = source / "engine" / "F100-PW-229.xml"
    text, count = _re.subn(r"<augmethod>\s*\d+\s*</augmethod>",
                           "<augmethod> 1 </augmethod>", engine.read_text())
    assert count == 1, count
    (directory / engine.name).write_text(text)
    for extra in ("direct.xml",):
        (directory / extra).write_bytes((source / "engine" / extra).read_bytes())
    thruster = source / "engine" / "F100-PW-229_nozzle.xml"
    if thruster.exists():
        (directory / thruster.name).write_bytes(thruster.read_bytes())
    return directory


def probe_function_calls(jsbsim, source, output):
    """TSFC and ATSFC evaluations per dispatched phase.

    The counters wrap the engine's own call sites, so they count evaluations.
    A `copyto` sentinel set to a constant only shows that a function ran at
    least once, which is why stage 2's sentinel measurement cannot be reused
    to assert counts.
    """
    variants = {"stock": None}
    try:
        variants["augmethod1"] = augmethod1_engine(source, output)
    except Exception as error:                        # pragma: no cover
        variants["augmethod1"] = None
        print(f"augmethod1 variant unavailable: {error}", file=sys.stderr)

    out = {}
    for name, engines in variants.items():
        if name == "augmethod1" and engines is None:
            continue
        f = Fdm(jsbsim, source, output / f"function-calls-{name}", engines=engines)
        steps = []

        def step(label, action):
            before = (f[E + "diag-tsfc-evals"], f[E + "diag-atsfc-evals"],
                      f[E + "diag-calc-count"])
            action()
            after = (f[E + "diag-tsfc-evals"], f[E + "diag-atsfc-evals"],
                     f[E + "diag-calc-count"])
            steps.append({"label": label, "phase-after": f.latched()["phase"],
                          "evaluations": after[2] - before[2],
                          "tsfc-calls": after[0] - before[0],
                          "atsfc-calls": after[1] - before[1]})

        step("load then RunIC(), engine off", lambda: f.fdm.run_ic())
        step("one frame, engine off", lambda: f.frames(1))
        f.throttle(0.35)
        step("RunIC() at a dry throttle, engine off", lambda: f.fdm.run_ic())
        step("propulsion/set-running = -1",
             lambda: f.fdm.__setitem__("propulsion/set-running", -1))
        step("one running frame, dry", lambda: f.frames(1))
        step("RunIC(), running, dry", lambda: f.fdm.run_ic())
        f.throttle(0.6)                 # F-16 doubles the command: position 1.2
        step("first augmented frame", lambda: f.frames(1))
        step("second augmented frame", lambda: f.frames(1))
        step("RunIC(), running, augmented", lambda: f.fdm.run_ic())
        f[E + "stalled"] = 1
        step("one stalled frame", lambda: f.frames(1))
        f[E + "stalled"] = 0
        f[E + "seized"] = 1
        step("one seized frame", lambda: f.frames(1))
        f[E + "seized"] = 0
        f["propulsion/cutoff_cmd"] = 1
        step("one frame after cutoff", lambda: f.frames(1))
        f["propulsion/starter_cmd"] = 1
        step("one cranking frame", lambda: f.frames(1))
        out[name] = {"steps": steps,
                     "throttle-position-at-augmented":
                         f["fcs/throttle-pos-norm[0]"]}
        del f
    return out


ACCELERATIONS = ("accelerations/udot-ft_sec2", "accelerations/vdot-ft_sec2",
                "accelerations/wdot-ft_sec2", "accelerations/pdot-rad_sec2",
                "accelerations/qdot-rad_sec2", "accelerations/rdot-rad_sec2")


def probe_derivative_seeding(jsbsim, source, output):
    """What RunIC() seeds the integrator derivative history with.

    FGFDMExec::Run() copies Accelerations into Propagate->in at model index 0,
    before the frame's forces are recomputed at index 14. RunIC() then calls
    Propagate->InitializeDerivatives(), which assigns in.vPQRidot and
    in.vUVWidot into all five history slots. So the seeded value is the one
    copied at the top of that Run(), not the one the accelerations hold when
    the derivatives are initialized. This probe reads both, through public
    properties, on a case where the engine state changes across the call.
    """
    f = Fdm(jsbsim, source, output / "derivative-seeding")
    f["ic/h-sl-ft"] = 20000
    f["ic/vc-kts"] = 300
    assert f.fdm.run_ic()
    f["propulsion/set-running"] = -1
    f.throttle(0.9)
    f.frames(600)

    def accelerations(label):
        row = {"label": label, "thrust": f[E + "thrust-lbs"], "n2": f[E + "n2"]}
        row.update({name.split("/")[-1]: f[name] for name in ACCELERATIONS})
        return row

    rows = [accelerations("600 frames at throttle 0.9")]
    # The value below is what RunIC() copies into Propagate->in before it
    # recomputes anything, so it is what InitializeDerivatives() will seed.
    seeded = {name: f[name] for name in ACCELERATIONS}
    f.throttle(0.0)
    assert f.fdm.run_ic()
    rows.append(accelerations("throttle 0.0, after RunIC()"))
    settled = {name: f[name] for name in ACCELERATIONS}
    # A second RunIC() with nothing changed in between: the value copied at the
    # top of its Run() is now the one the previous call finished with.
    assert f.fdm.run_ic()
    rows.append(accelerations("a second RunIC(), nothing changed"))
    return {"rows": rows,
            "seeded-by-the-first-run-ic": {k.split("/")[-1]: v
                                           for k, v in seeded.items()},
            "held-after-the-first-run-ic": {k.split("/")[-1]: v
                                            for k, v in settled.items()},
            "stale": {k.split("/")[-1]: settled[k] - seeded[k]
                      for k in ACCELERATIONS},
            "read": "public properties only; the derivative history itself is "
                    "not exposed, so this shows the two candidate values and "
                    "the source order decides which one is used"}


COLD_RESET_FIELDS = ("MaxN1", "MaxN2", "InjectionTimer", "InjWaterNorm",
                     "InjN1increment", "InjN2increment", "bleed-factor",
                     "x-position", "y-position", "z-position",
                     "pitch-angle-rad", "yaw-angle-rad", "reverser-angle-rad")


def probe_cold_reset(jsbsim, source, output):
    """Which runtime writes survive RunIC() and a scenario reset.

    FGTurbine::ResetToIC() zeroes the injection increments and the remaining
    water and leaves MaxN1/MaxN2 alone; FGThruster::ResetToIC() re-seats the
    acting location on vXYZn and leaves the orientation alone. That mixture
    decides what a restore has to carry and what "absent override" can mean.
    """
    f = Fdm(jsbsim, source, output / "cold-reset")
    assert f.fdm.run_ic()
    names = {line.split()[0] for line in f.fdm.get_property_catalog()
             if line.strip()}
    present = [field for field in COLD_RESET_FIELDS
               if E + field in names or "propulsion/engine/" + field in names]

    def read():
        return {field: f[E + field] for field in present}

    loaded = read()
    written = {}
    for field in present:
        value = loaded[field]
        # Move each field somewhere unmistakable without leaving its own range.
        written[field] = {"MaxN1": 99.0, "MaxN2": 97.0, "InjWaterNorm": 0.5,
                          "bleed-factor": 0.25}.get(field, value + 1.5)
        f[E + field] = written[field]
    after_write = read()
    assert f.fdm.run_ic()
    after_run_ic = read()
    f.fdm.reset_to_initial_conditions(0)
    after_reset = read()
    rows = [{"field": field, "loaded": loaded[field],
             "written": written[field], "after-write": after_write[field],
             "after-run-ic": after_run_ic[field],
             "after-reset-to-initial-conditions": after_reset[field],
             "survives-run-ic": after_run_ic[field] == written[field],
             "survives-scenario-reset": after_reset[field] == written[field]}
            for field in present]
    return {"aircraft": "f16", "rows": rows,
            "absent": [field for field in COLD_RESET_FIELDS
                       if field not in present]}


def probe_frozen_refill(jsbsim, source, output):
    """Refilling the tanks while fuel freeze is on does not clear starvation.

    ConsumeFuel() returns on FuelFreeze and on trim status before it walks the
    tanks, and SetStarved() is only reached after that walk. So a flag latched
    by an earlier empty-tank frame survives a refill for as long as the freeze
    lasts, and the restart that the refilled tanks would allow still fails.
    """
    arms = {}
    for arm in ("thawed", "frozen", "frozen-then-thawed"):
        f = Fdm(jsbsim, source, output / f"frozen-refill-{arm}")
        assert f.fdm.run_ic()
        f["propulsion/set-running"] = -1
        f.throttle(0.6)
        f.frames(240)
        running = {"running": f[E + "set-running"], "n2": f[E + "n2"],
                   "gph": f[E + "fuel-flow-rate-gph"],
                   "tank-total-lbs": f.tank_total()}
        for tank in f.tanks:
            f[tank] = 0.0
        f.frames(120)
        starved = {"running": f[E + "set-running"], "n2": f[E + "n2"],
                   "gph": f[E + "fuel-flow-rate-gph"],
                   "tank-total-lbs": f.tank_total()}
        if arm != "thawed":
            f["propulsion/fuel_freeze"] = 1
        for tank in f.tanks:
            f[tank] = 500.0
        f.frames(1)
        refilled = {"running": f[E + "set-running"], "n2": f[E + "n2"],
                    "gph": f[E + "fuel-flow-rate-gph"],
                    "tank-total-lbs": f.tank_total()}
        if arm == "frozen-then-thawed":
            f["propulsion/fuel_freeze"] = 0
            f.frames(1)
        f["propulsion/set-running"] = -1
        f.frames(120)
        restarted = {"running": f[E + "set-running"], "n1": f[E + "n1"],
                     "n2": f[E + "n2"], "thrust": f[E + "thrust-lbs"],
                     "gph": f[E + "fuel-flow-rate-gph"],
                     "tank-total-lbs": f.tank_total()}
        arms[arm] = {"running": running, "after-emptying": starved,
                     "after-refilling": refilled,
                     "after-set-running-and-120-frames": restarted}
        del f
    return {"arms": arms,
            "freeze": "propulsion/fuel_freeze, the manager-level flag that "
                      "ConsumeFuel() tests"}


PROBE_FUNCS = {
    "live-state": probe_live_state,
    "nesting": probe_nesting,
    "starvation": probe_starvation,
    "fuel-matrix": probe_fuel_matrix,
    "stale-tsfc": probe_stale_tsfc,
    "n2norm-spool-rate": probe_n2norm_spool_rate,
    "stall-recovery": probe_stall_recovery,
    "linearization": probe_linearization,
    "function-calls": probe_function_calls,
    "derivative-seeding": probe_derivative_seeding,
    "cold-reset": probe_cold_reset,
    "frozen-refill": probe_frozen_refill,
}


def injection_engine(source, output, with_function):
    """A sandbox copy of the B747 engine, with or without an Injection function."""
    directory = output / ("engine-injection-" +
                          ("with" if with_function else "without"))
    directory.mkdir(parents=True, exist_ok=True)
    engine = source / "engine" / "GE-CF6-80C2-B1F.xml"
    text = engine.read_text()
    marker = "  <injected>          1 </injected>\n"
    assert text.count(marker) == 1, "injection anchor"
    if with_function:
        text = text.replace(marker, marker + "  <injection-time> 30.0 </injection-time>\n"
                            '  <function name="Injection">\n   <value> 1.05 </value>\n  </function>\n')
    (directory / engine.name).write_text(text)
    (directory / "direct.xml").write_bytes(
        (source / "engine" / "direct.xml").read_bytes())
    return directory


def injection_load(args):
    """What a declared-but-undefined Injection lookup does, arm by arm.

    Driven from the parent because the `run-ic` arm may terminate the process.
    """
    import jsbsim
    jsbsim.FGJSBBase().debug_lvl = 0
    source = args.source.resolve()
    output = args.output.resolve()
    arm = args.injection_arm
    with_function = arm.endswith("-with-function")
    engines = injection_engine(source, output, with_function) \
        if with_function else source / "engine"
    f = Fdm(jsbsim, source, output / ("injection-" + arm), aircraft="B747",
            ic="reset00", engines=engines)
    print(f"loaded B747, engine path {engines}")
    print(f"InjWaterNorm after load = {f[E + 'InjWaterNorm']}")
    assert f.fdm.run_ic()
    print(f"RunIC with no injection command: ok, thrust {f[E + 'thrust-lbs']:.2f}")
    f[E + "injection_cmd"] = 1
    print(f"injection_cmd set; InjWaterNorm = {f[E + 'InjWaterNorm']}")
    if arm.startswith("run-ic"):
        print("calling RunIC(), which dispatches Trim()")
        assert f.fdm.run_ic()
        print(f"survived RunIC(); thrust {f[E + 'thrust-lbs']:.2f}")
    elif arm == "run-running":
        print("starting the engine, then calling Run(), which dispatches Run()")
        f["propulsion/set-running"] = -1
        f.throttle(0.6)
        f.frames(1)
        print(f"survived Run(); thrust {f[E + 'thrust-lbs']:.2f}")
    else:
        print("calling Run() with the engine off, which dispatches Off()")
        f.frames(1)
        print(f"survived Run(); thrust {f[E + 'thrust-lbs']:.2f}")
    print("SURVIVED")


def measure(args):
    import jsbsim  # resolved through PYTHONPATH=<build>/tests, set by the parent

    tests = args.tests.resolve()
    module = Path(jsbsim._jsbsim.__file__).resolve()
    if tests not in module.parents:
        sys.exit(f"jsbsim extension {module} is not inside {tests}")
    if args.injection_arm:
        injection_load(args)
        return
    source = args.source.resolve()
    output = args.output.resolve()
    jsbsim.FGJSBBase().debug_lvl = 0
    record = {"jsbsim_file": jsbsim.__file__, "extension": str(module),
              "extension_sha256": digest(module),
              "jsbsim_version": jsbsim.__version__,
              "python": sys.version.split()[0], "dt": DT, "probes": {}}
    probe = Fdm(jsbsim, source, output / "capability-check")
    record["instrumented"] = probe.diag
    del probe
    for name in args.probe:
        if name in INSTRUMENTED and not record["instrumented"]:
            record["probes"][name] = {"skipped": "needs an instrumented build"}
            continue
        record["probes"][name] = PROBE_FUNCS[name](jsbsim, source, output)
    (output / "probes.json").write_text(json.dumps(record, indent=2) + "\n")


def run(args):
    source = args.source.resolve()
    stamp = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
    output = (args.output or source / "build" / "turbine-initialization-probes"
              / stamp).resolve()
    output.mkdir(parents=True, exist_ok=True)
    temporary = output / "tmp"
    temporary.mkdir(exist_ok=True)
    builds = dict(item.split("=", 1) for item in args.build)
    records = {}
    for label, build in builds.items():
        tests = Path(build).resolve() / "tests"
        directory = output / label
        directory.mkdir(exist_ok=True)
        env = dict(os.environ, PYTHONPATH=str(tests), TMPDIR=str(temporary),
                   PYTHONDONTWRITEBYTECODE="1")
        subprocess.run([args.python, __file__, "--measure", "--source", str(source),
                        "--tests", str(tests), "--output", str(directory),
                        *sum((["--probe", p] for p in args.probe), [])],
                       cwd=directory, env=env, check=True)
        records[label] = json.loads((directory / "probes.json").read_text())
        # The injection arms run on their own because one may not return.
        records[label]["injection-load"] = {}
        for arm in ("run-ic", "run-off", "run-running",
                    "run-ic-with-function", "run-running-with-function"):
            probe = subprocess.run(
                [args.python, __file__, "--measure", "--source", str(source),
                 "--tests", str(tests), "--output", str(directory),
                 "--injection-arm", arm],
                cwd=directory, env=env, capture_output=True, text=True)
            records[label]["injection-load"][arm] = {
                "returncode": probe.returncode,
                "signal": -probe.returncode if probe.returncode < 0 else None,
                "survived": probe.stdout.strip().endswith("SURVIVED"),
                "stdout": probe.stdout.strip(),
                "stderr": probe.stderr.strip()[-600:]}
    summary = {
        "source": str(source),
        "source_head": subprocess.check_output(
            ["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip(),
        "source_status": subprocess.check_output(
            ["git", "-C", str(source), "status", "--short"], text=True).splitlines(),
        "probes_requested": list(args.probe),
        "records": records}
    (output / "probes.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(output)


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, required=True,
                        help="JSBSim source checkout supplying aircraft and engine data")
    parser.add_argument("--build", action="append", default=[],
                        metavar="LABEL=DIR", help="a built JSBSim tree to measure")
    parser.add_argument("--probe", action="append", default=None,
                        choices=PROBES, help="probe to run (default: all)")
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--python", default=sys.executable)
    parser.add_argument("--measure", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--tests", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--injection-arm", default=None, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.probe is None:
        args.probe = list(PROBES)
    if args.measure:
        measure(args)
    else:
        if not args.build:
            parser.error("at least one --build LABEL=DIR is required")
        run(args)


if __name__ == "__main__":
    main()
