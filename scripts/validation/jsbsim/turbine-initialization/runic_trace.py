#!/usr/bin/env python3
"""Trace what RunIC(), suspension and InitRunning() do to a turbine.

Stage-1 characterization for the turbine initialization plan. It records, for
one or more JSBSim builds, the engine state a caller can observe immediately
after each initialization entry point and on the frames that follow, together
with the executive timestep, the copied propulsion timestep and the trim
status that decided the turbine's internal phase.

The scenarios cover the cases the stage-1 brief names:

- `sean-steady-thrust-*`   a running turbine, no aircraft trim request, a
                           changed throttle and then RunIC(), which is the
                           non-trim steady-thrust use case Sean described on
                           PR #1505. A `spool` control advances the same
                           change in real time instead, so the difference
                           between the two is measured, not asserted;
- `b737-cruise-*`          the cruise setup that started the discussion;
- `repeated-runic`         three consecutive RunIC() calls;
- `off-*`                  an engine that is off, never started or cut off
                           with a residual flow, through the same calls;
- `ic-running-flag`        a stored IC <running> request replayed by a later
                           RunIC() after the engine was cut off;
- `stale-running-cutoff`   cutoff commanded with no frame before RunIC();
- `empty-tanks`, `fuel-freeze`, `unselected-tank`  fuel supply at
                           initialization;
- `faults-precedence`      stall, seizure and starvation, alone and together;
- `injection-b747`         a finite water-injection state through RunIC();
- `suspend-refresh`        SuspendIntegration() followed by Run(), which is
                           the other zero-dt path;
- `first-frame`            whether the frame after RunIC() repairs anything;
- `starts`                 a cold start and a restart after a shutdown, both
                           cranked with the cutoff closed and lit by opening
                           it, so that what a start sees in the latched
                           N2norm is measured rather than argued;
- `set-running-boolean`    the per-engine flag, which sets Running without
                           initializing anything;
- `app-restore`            the sequence 0sfs uses to recover a flight, run on
                           a stock fixture.

Builds instrumented with the stage-1 scratch diagnostics also report the
engine's dispatch phase, its per-phase call counts and how many times the
configured TSFC/ATSFC parameters were evaluated. The tool works without them;
those columns are then absent rather than guessed.

This records existing behaviour. It asserts nothing about what the behaviour
should be, and no scenario modifies the repository's aircraft or engine data.

Example:
  python3 runic_trace.py --source /path/to/jsbsim \\
      --build master=/path/to/jsbsim/build/x/master \\
      --build candidate=/path/to/jsbsim/build/x/final
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
# State a caller can read back. `tsfc` is the stored corrected value; the
# tied `atsfc` property is deliberately absent because reading it evaluates
# the configured function and fires its copyto.
ENGINE_PROPERTIES = ("set-running", "n1", "n2", "thrust-lbs",
                     "fuel-flow-rate-pps", "fuel-flow-rate-gph",
                     "fuel-used-lbs", "tsfc")
DIAG_PROPERTIES = ("diag-phase", "diag-engine-dt", "diag-exec-dt",
                   "diag-trim-status", "diag-calc-count", "diag-tsfc-evals",
                   "diag-atsfc-evals", "diag-n2norm", "diag-n1-factor",
                   "diag-n2-factor", "diag-idle-ff", "diag-fuelflow-pph",
                   "diag-cutoff", "diag-egt", "diag-oil-temp",
                   "diag-nozzle") + tuple("diag-count-" + p for p in PHASES)
GLOBAL_PROPERTIES = ("fcs/throttle-cmd-norm[0]", "fcs/throttle-pos-norm[0]",
                     "propulsion/total-fuel-lbs", "forces/fbx-prop-lbs")


def digest(path):
    with open(path, "rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


class Probe:
    """One FDM instance plus the labelled samples taken from it."""

    def __init__(self, jsbsim, source, root, aircraft, ic, dt=DT, engines=None,
                 aircraft_path=None):
        self.fdm = jsbsim.FGFDMExec(str(root) + "/", None)
        self.fdm.set_aircraft_path(str(aircraft_path or source / "aircraft"))
        self.fdm.set_engine_path(str(engines or source / "engine"))
        self.fdm.set_systems_path(str(source / "systems"))
        assert self.fdm.load_model(aircraft), aircraft
        assert self.fdm.load_ic(ic, not os.path.isabs(ic)), ic
        self.fdm.set_dt(dt)
        names = {line.split()[0] for line in self.fdm.get_property_catalog()
                 if line.strip()}
        # A single-engine model lists its properties without the [0] index,
        # although reading them with it resolves either way.
        self.diag = all(E + d in names or "propulsion/engine/" + d in names
                        for d in DIAG_PROPERTIES)
        self.tanks = sorted(n for n in names if n.startswith("propulsion/tank")
                            and n.endswith("/contents-lbs"))
        self.engines = sorted(n for n in names
                              if n.startswith("propulsion/engine")
                              and n.endswith("/set-running"))
        self.samples = []

    def throttle(self, value):
        """Every engine, so that a multi-engine fixture stays symmetric."""
        for index in range(len(self.engines)):
            self.fdm[f"fcs/throttle-cmd-norm[{index}]"] = value

    def read(self, label):
        fdm = self.fdm
        sample = {"label": label}
        for name in ENGINE_PROPERTIES:
            sample[name] = fdm[E + name]
        for name in GLOBAL_PROPERTIES:
            sample[name] = fdm[name]
        sample["sim-time-sec"] = fdm.get_sim_time()
        sample["exec-dt"] = fdm.get_delta_t()
        sample["integration-suspended"] = fdm.integration_suspended()
        sample["trim-status"] = bool(fdm.get_trim_status())
        sample["tank-total-lbs"] = sum(fdm[t] for t in self.tanks)
        if self.diag:
            for name in DIAG_PROPERTIES:
                sample[name] = fdm[E + name]
            sample["phase"] = PHASES[int(sample["diag-phase"])] \
                if 0 <= int(sample["diag-phase"]) < len(PHASES) else "?"
        self.samples.append(sample)
        return sample

    def frames(self, n):
        for _ in range(n):
            assert self.fdm.run()

    def __setitem__(self, key, value):
        self.fdm[key] = value

    def __getitem__(self, key):
        return self.fdm[key]


def scenario_steady_thrust(make, aircraft, ic, low, high):
    """A running turbine, tNone, a changed throttle, then RunIC().

    Sean's non-trim steady-thrust use case. `spool` is the control: the same
    throttle change advanced in real time instead of initialized.
    """
    out = {}
    for arm in ("runic", "spool"):
        p = make(arm)
        p.throttle(low)
        assert p.fdm.run_ic()
        p["propulsion/set-running"] = -1
        p.throttle(low)
        assert p.fdm.run_ic()
        p.frames(600)                       # settle at the low throttle
        p.read("settled-at-low-throttle")
        p.throttle(high)
        p.read("throttle-changed")
        if arm == "runic":
            assert p.fdm.run_ic()
            p.read("after-run-ic")
            p.frames(1)
            p.read("one-frame-after-run-ic")
            p.frames(119)
            p.read("one-second-after-run-ic")
        else:
            p.frames(1)
            p.read("one-frame-no-run-ic")
            p.frames(119)
            p.read("one-second-no-run-ic")
            p.frames(480)
            p.read("five-seconds-no-run-ic")
        out[arm] = p.samples
        del p
    return out


def scenario_b737_cruise(make):
    """The cruise setup Sean traced: never-started engines, tNone, RunIC()."""
    p = make("cruise")
    p.read("loaded")
    assert p.fdm.run_ic()
    p.read("after-run-ic")
    p.frames(1)
    p.read("one-frame-after")
    return {"cruise": p.samples}


def scenario_repeated(make, aircraft_throttle):
    p = make("repeat")
    p.throttle(aircraft_throttle)
    assert p.fdm.run_ic()
    p["propulsion/set-running"] = -1
    p.throttle(aircraft_throttle)
    assert p.fdm.run_ic()
    p.frames(600)
    p.read("settled")
    for i in range(3):
        assert p.fdm.run_ic()
        p.read(f"run-ic-{i + 1}")
    p.frames(1)
    p.read("one-frame-after")
    return {"repeat": p.samples}


def scenario_off(make, throttle):
    out = {}
    p = make("never-started")
    p.throttle(throttle)
    p.read("loaded")
    assert p.fdm.run_ic()
    p.read("after-run-ic")
    p.frames(24)
    p.read("24-frames-after")
    out["never-started"] = p.samples
    del p

    p = make("cut-off-residual")
    assert p.fdm.run_ic()
    p["propulsion/set-running"] = -1
    p.throttle(throttle)
    p.frames(240)
    p["propulsion/cutoff_cmd"] = 1
    p.frames(24)
    p.read("cut-off-24-frames-ago")
    assert p.fdm.run_ic()
    p.read("after-run-ic")
    p.frames(24)
    p.read("24-frames-after")
    out["cut-off-residual"] = p.samples
    del p

    p = make("cut-off-settled")
    assert p.fdm.run_ic()
    p["propulsion/set-running"] = -1
    p.throttle(throttle)
    p.frames(240)
    p["propulsion/cutoff_cmd"] = 1
    p.frames(1200)
    p.read("cut-off-settled")
    assert p.fdm.run_ic()
    p.read("after-run-ic")
    out["cut-off-settled"] = p.samples
    return out


def scenario_ic_running_flag(make_ic, throttle):
    """A stored IC <running> request replayed by a later RunIC()."""
    p = make_ic("ic-running")
    p.throttle(throttle)
    assert p.fdm.run_ic()
    p.read("after-first-run-ic")
    p.frames(240)
    p.read("settled")
    p["propulsion/cutoff_cmd"] = 1
    p.frames(1200)
    p.read("cut-off-and-settled")
    assert p.fdm.run_ic()
    p.read("after-second-run-ic")
    p.frames(1)
    p.read("one-frame-after")
    p.fdm.reset_to_initial_conditions(0)
    p.read("after-reset-to-ic")
    return {"ic-running": p.samples}


def scenario_stale_running(make, throttle):
    """cutoff_cmd with no frame before RunIC(): Running is still true."""
    p = make("stale-running")
    assert p.fdm.run_ic()
    p["propulsion/set-running"] = -1
    p.throttle(throttle)
    p.frames(240)
    p.read("running")
    p["propulsion/cutoff_cmd"] = 1
    p.read("cutoff-commanded-no-frame")
    assert p.fdm.run_ic()
    p.read("after-run-ic")
    p.frames(1)
    p.read("one-frame-after")
    return {"stale-running": p.samples}


def scenario_fuel(make, throttle):
    out = {}
    p = make("empty-tanks")
    assert p.fdm.run_ic()
    for tank in p.tanks:
        p[tank] = 0.0
    p.throttle(throttle)
    p.read("tanks-emptied")
    p["propulsion/set-running"] = -1
    p.read("after-set-running")
    assert p.fdm.run_ic()
    p.read("after-run-ic")
    p.frames(2)
    p.read("two-frames-after")
    out["empty-tanks"] = p.samples
    del p

    p = make("fuel-freeze")
    assert p.fdm.run_ic()
    p["propulsion/set-running"] = -1
    p.throttle(throttle)
    p.frames(240)
    p.read("running")
    p["propulsion/fuel_freeze"] = 1
    p.frames(120)
    p.read("one-second-frozen")
    assert p.fdm.run_ic()
    p.read("after-run-ic-frozen")
    p["propulsion/fuel_freeze"] = 0
    p.frames(120)
    p.read("one-second-thawed")
    out["fuel-freeze"] = p.samples
    del p

    p = make("unselected-tank")
    assert p.fdm.run_ic()
    p["propulsion/set-running"] = -1
    p.throttle(throttle)
    p.frames(240)
    p.read("running")
    for tank in p.tanks:
        p[tank.replace("contents-lbs", "selected")] = 0
    p.frames(2)
    p.read("two-frames-unselected")
    assert p.fdm.run_ic()
    p.read("after-run-ic")
    p.frames(2)
    p.read("two-frames-after")
    out["unselected-tank"] = p.samples
    return out


def scenario_faults(make, throttle):
    out = {}
    combos = {"stalled": {"stalled": 1}, "seized": {"seized": 1},
              "starved": {"starved": 1},
              "stalled+seized": {"stalled": 1, "seized": 1},
              "stalled+seized+starved": {"stalled": 1, "seized": 1, "starved": 1}}
    for name, writes in combos.items():
        p = make("fault-" + name.replace("+", "-"))
        assert p.fdm.run_ic()
        p["propulsion/set-running"] = -1
        p.throttle(throttle)
        p.frames(240)
        p.read("running")
        for prop, value in writes.items():
            if prop == "starved":
                for tank in p.tanks:
                    p[tank] = 0.0
                p.frames(1)
            else:
                p[E + prop] = value
        p.read("fault-set")
        assert p.fdm.run_ic()
        p.read("after-run-ic")
        p.frames(1)
        p.read("one-frame-after")
        out[name] = p.samples
        del p
    return out


INJECTION_XML = """  <injection-time> 30.0 </injection-time>
  <function name="Injection">
   <value> 1.05 </value>
  </function>
"""


def injection_engine(source, output):
    """A sandbox copy of the B747 engine with a complete injection setup.

    No shipped engine defines the `Injection` function that `<injected> 1 </injected>`
    makes reachable, so a finite injection state cannot be exercised on stock
    data without crashing; `injection_null_lookup` records that separately.
    """
    directory = output / "engine-injection"
    directory.mkdir(parents=True, exist_ok=True)
    engine = source / "engine" / "GE-CF6-80C2-B1F.xml"
    text = engine.read_text()
    marker = "  <injected>          1 </injected>\n"
    assert text.count(marker) == 1, "injection anchor"
    (directory / engine.name).write_text(text.replace(marker, marker + INJECTION_XML))
    (directory / "direct.xml").write_bytes((source / "engine" / "direct.xml").read_bytes())
    return directory


def scenario_injection(make, throttle):
    p = make("injection")
    assert p.fdm.run_ic()
    p["propulsion/set-running"] = -1
    p.throttle(throttle)
    p.frames(240)
    p[E + "InjWaterNorm"] = 1.0
    p[E + "InjectionTimer"] = 0.0
    p[E + "injection_cmd"] = 1
    p.read("injection-armed")
    p.frames(120)
    p.read("one-second-of-injection")
    before = {"timer": p[E + "InjectionTimer"], "water": p[E + "InjWaterNorm"]}
    assert p.fdm.run_ic()
    s = p.read("after-run-ic")
    s["injection-timer-before"] = before["timer"]
    s["injection-water-before"] = before["water"]
    s["injection-timer"] = p[E + "InjectionTimer"]
    s["injection-water"] = p[E + "InjWaterNorm"]
    p[E + "InjWaterNorm"] = 0.0
    p.read("water-exhausted")
    assert p.fdm.run_ic()
    p.read("after-run-ic-exhausted")
    return {"injection": p.samples}


def scenario_starts(make, throttle):
    """What a start sees after a shutdown, and what a cold start sees.

    `FGSpoolUp` scales the spool rate by the member `N2norm`, and `Off()`
    maintains N1 and N2 but not their normalization, so the two starts begin
    from different values of it. Both arms use the same starter sequence.
    """
    out = {}

    def start_and_sample(p, prefix):
        """The documented sequence: crank with the cutoff still closed, then
        open it once N2 is above the 15 % light-up threshold."""
        p.throttle(0.0)
        p["propulsion/cutoff_cmd"] = 1
        p["propulsion/starter_cmd"] = 1
        p.read(prefix + "cranking")
        cranked = 0
        while p[E + "n2"] < 16.0 and cranked < 6000:
            p.frames(1)
            cranked += 1
        s = p.read(prefix + "n2-above-15")
        s["frames-to-crank"] = cranked
        p["propulsion/cutoff_cmd"] = 0
        lit = 0
        while p[E + "set-running"] < 0.5 and lit < 6000:
            p.frames(1)
            lit += 1
        s = p.read(prefix + "running")
        s["frames-to-light"] = lit
        steady = 0
        while abs(p[E + "n2"] - last_n2[0]) > 1e-9 and steady < 6000:
            last_n2[0] = p[E + "n2"]
            p.frames(1)
            steady += 1
        s = p.read(prefix + "n2-steady")
        s["frames-to-steady-n2"] = steady

    last_n2 = [-1.0]
    p = make("cold-start")
    assert p.fdm.run_ic()
    p.throttle(0.0)
    p.read("cold-loaded")
    start_and_sample(p, "cold-")
    out["cold-start"] = p.samples
    del p

    p = make("restart-after-shutdown")
    assert p.fdm.run_ic()
    p["propulsion/set-running"] = -1
    p.throttle(throttle)
    p.frames(600)
    p.read("running")
    p["propulsion/cutoff_cmd"] = 1
    p.frames(2400)
    p.read("shut-down-and-settled")
    last_n2 = [-1.0]
    start_and_sample(p, "restart-")
    out["restart-after-shutdown"] = p.samples
    return out


def scenario_set_running_boolean(make, throttle):
    """The per-engine boolean, which sets a flag without initializing."""
    p = make("set-running-boolean")
    assert p.fdm.run_ic()
    p.throttle(throttle)
    p.read("loaded-off")
    p[E + "set-running"] = 1
    p.read("boolean-set")
    assert p.fdm.run_ic()
    p.read("after-run-ic")
    p.frames(1)
    p.read("one-frame-after")
    p.frames(600)
    p.read("five-seconds-after")
    return {"set-running-boolean": p.samples}


def scenario_app_restore(make, throttle):
    """The sequence 0sfs uses to recover a flight, on a stock fixture.

    `safeFlightState.restoreSimulation()` resets with DONT_EXECUTE_RUN_IC,
    replays the captured IC and controls, calls RunIC(), re-requests the
    running engines and calls RunIC() again. The second call exists because
    the first one leaves the engine at the startup throttle.
    """
    p = make("app-restore")
    assert p.fdm.run_ic()
    p["propulsion/set-running"] = -1
    p.throttle(throttle)
    p.frames(600)
    captured = {"n1": p[E + "n1"], "n2": p[E + "n2"],
                "sim-time-sec": p.fdm.get_sim_time(),
                "fuel-used-lbs": p[E + "fuel-used-lbs"],
                "tank-total-lbs": sum(p[t] for t in p.tanks)}
    s = p.read("before-restore")
    s["captured"] = captured
    p.fdm.reset_to_initial_conditions(2)
    p.read("after-reset-mode-2")
    p.fdm.set_sim_time(captured["sim-time-sec"])
    p.throttle(throttle)
    assert p.fdm.run_ic()
    p.read("after-first-run-ic")
    p["propulsion/set-running"] = -1
    p.throttle(throttle)
    p.read("after-set-running")
    assert p.fdm.run_ic()
    s = p.read("after-second-run-ic")
    s["captured"] = captured
    p.frames(1)
    p.read("one-frame-after")
    return {"app-restore": p.samples}


def scenario_suspend(make, throttle):
    """SuspendIntegration() then Run(): the other zero-dt path."""
    p = make("suspend")
    assert p.fdm.run_ic()
    p["propulsion/set-running"] = -1
    p.throttle(throttle)
    p.frames(600)
    p.read("settled")
    p.throttle(min(1.0, throttle + 0.4))
    p.fdm.suspend_integration()
    p.read("suspended-before-run")
    assert p.fdm.run()
    p.read("suspended-after-one-run")
    assert p.fdm.run()
    p.read("suspended-after-two-runs")
    p.fdm.resume_integration()
    p.read("resumed-before-run")
    p.frames(1)
    p.read("resumed-after-one-run")
    return {"suspend": p.samples}


def scenario_first_frame(make, throttle):
    """Held down with fixed inputs: does the frame after RunIC() repair state?"""
    p = make("first-frame")
    assert p.fdm.run_ic()
    p["propulsion/set-running"] = -1
    p.throttle(throttle)
    assert p.fdm.run_ic()
    p["forces/hold-down"] = 1
    p.read("after-run-ic-held")
    for i in range(1, 4):
        p.frames(1)
        p.read(f"held-frame-{i}")
    return {"first-frame": p.samples}


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
    start = text.index(" <!-- this is the telnet interface -->")
    end = text.index("</fdm_config>")
    assert text.count("<input port=") == 2, "input anchor"
    (directory / "737.xml").write_text(text[:start] + "\n" + text[end:])
    assert "<input port=" not in (directory / "737.xml").read_text()
    return directory.parent


def crash_probe(args):
    """Stock B747 + injection_cmd through RunIC(), in a process of its own.

    `FGTurbine::Trim()` multiplies by `InjectionLookup->GetValue()` whenever
    `<injected>` is 1 and the injection command is set, without checking that
    the engine defines the function or that any water is left. Run separately
    because the answer may be a signal rather than a value.
    """
    import jsbsim
    jsbsim.FGJSBBase().debug_lvl = 0
    root = args.output.resolve() / "crash-probe"
    root.mkdir(parents=True, exist_ok=True)
    source = args.source.resolve()
    fdm = jsbsim.FGFDMExec(str(root) + "/", None)
    fdm.set_aircraft_path(str(source / "aircraft"))
    fdm.set_engine_path(str(source / "engine"))
    fdm.set_systems_path(str(source / "systems"))
    assert fdm.load_model("B747")
    assert fdm.load_ic("reset00", True)
    fdm.set_dt(DT)
    assert fdm.run_ic()
    fdm["propulsion/engine[0]/injection_cmd"] = 1
    sys.stderr.write("about to RunIC with injection commanded\n")
    sys.stderr.flush()
    assert fdm.run_ic()
    print("survived")


def measure(args):
    import jsbsim  # resolved through PYTHONPATH=<build>/tests, set by the parent

    tests = args.tests.resolve()
    module = Path(jsbsim._jsbsim.__file__).resolve()
    if tests not in module.parents:
        sys.exit(f"jsbsim extension {module} is not inside {tests}")
    source = args.source.resolve()
    output = args.output.resolve()
    jsbsim.FGJSBBase().debug_lvl = 0

    # An IC copy that asks for every engine to start, written into the output
    # directory. The repository's own initialization files are not modified.
    ic_running = output / "cruise_init_running.xml"

    roots = output / "roots"
    aircraft_737 = quiet_737(source, output)

    def maker(aircraft, ic, engines=None, aircraft_path=None):
        def make(name):
            root = roots / f"{aircraft}-{name}"
            root.mkdir(parents=True, exist_ok=True)
            return Probe(jsbsim, source, root, aircraft, ic, engines=engines,
                         aircraft_path=aircraft_path)
        return make

    ic_running.write_text(
        (aircraft_737 / "737" / "cruise_init.xml").read_text()
        .replace("</initialize>", "  <running> -1 </running>\n</initialize>"))

    f16 = maker("f16", "reset00")
    b737 = maker("737", "cruise_init", aircraft_path=aircraft_737)
    b747 = maker("B747", "reset00")

    record = {
        "jsbsim_file": jsbsim.__file__, "extension": str(module),
        "extension_sha256": digest(module), "jsbsim_version": jsbsim.__version__,
        "python": sys.version.split()[0], "dt": DT,
        "diagnostics": None, "scenarios": {}}

    s = record["scenarios"]
    s["sean-steady-thrust-b737"] = scenario_steady_thrust(b737, "737", "cruise_init", 0.30, 0.90)
    s["sean-steady-thrust-f16"] = scenario_steady_thrust(f16, "f16", "reset00", 0.30, 0.90)
    s["sean-steady-thrust-f16-augmented"] = scenario_steady_thrust(f16, "f16", "reset00", 0.30, 1.00)
    s["b737-cruise-never-started"] = scenario_b737_cruise(b737)
    s["repeated-runic"] = scenario_repeated(b737, 0.60)
    s["off-f16"] = scenario_off(f16, 0.35)
    s["stale-running-cutoff"] = scenario_stale_running(f16, 0.60)
    s["fuel"] = scenario_fuel(f16, 0.60)
    s["faults-precedence"] = scenario_faults(f16, 0.60)
    s["suspend-refresh"] = scenario_suspend(f16, 0.30)
    s["first-frame"] = scenario_first_frame(f16, 0.60)
    s["starts"] = scenario_starts(f16, 0.60)
    s["set-running-boolean"] = scenario_set_running_boolean(f16, 0.60)
    s["app-restore"] = scenario_app_restore(b737, 0.30)
    s["injection-b747"] = scenario_injection(
        maker("B747", "reset00", engines=injection_engine(source, output)), 0.60)

    s["ic-running-flag"] = scenario_ic_running_flag(
        maker("737", str(ic_running), aircraft_path=aircraft_737), 0.30)

    for arms in s.values():
        for samples in arms.values():
            record["diagnostics"] = any("phase" in x for x in samples) \
                if record["diagnostics"] is None else record["diagnostics"]
    (output / "measurement.json").write_text(json.dumps(record, indent=2) + "\n")


def compare(args):
    source = args.source.resolve()
    stamp = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
    output = (args.output or source / "build" / "turbine-initialization-trace" / stamp).resolve()
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
        probe = subprocess.run(
            [args.python, __file__, "--crash-probe", "--source", str(source),
             "--tests", str(tests), "--output", str(directory)],
            cwd=directory, env=env, capture_output=True, text=True)
        records[label]["injection_null_lookup"] = {
            "returncode": probe.returncode,
            "signal": -probe.returncode if probe.returncode < 0 else None,
            "stdout": probe.stdout.strip(), "stderr": probe.stderr.strip()[-400:]}

    labels = list(records)
    summary = {
        "source": str(source),
        "source_head": subprocess.check_output(
            ["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip(),
        "source_status": subprocess.check_output(
            ["git", "-C", str(source), "status", "--short"], text=True).splitlines(),
        "builds": {label: {k: v for k, v in r.items() if k != "scenarios"}
                   for label, r in records.items()},
        "differences": []}

    base = labels[0]
    for scenario, arms in records[base]["scenarios"].items():
        for arm, samples in arms.items():
            for index, sample in enumerate(samples):
                for label in labels[1:]:
                    other = records[label]["scenarios"][scenario][arm][index]
                    changed = {k: [sample[k], other[k]] for k in sample
                               if k in other and sample[k] != other[k]
                               and not k.startswith("diag-")}
                    if changed:
                        summary["differences"].append({
                            "scenario": scenario, "arm": arm,
                            "label": sample["label"], base: base, "other": label,
                            "changed": changed})
    (output / "trace.json").write_text(json.dumps(
        {"summary": summary, "records": records}, indent=2) + "\n")

    columns = ["set-running", "n1", "n2", "thrust-lbs", "fuel-flow-rate-gph",
               "tsfc", "fuel-used-lbs", "fcs/throttle-pos-norm[0]"]
    lines = []
    for scenario, arms in records[base]["scenarios"].items():
        lines.append(f"\n## {scenario}\n")
        head = "| build | arm | point | " + " | ".join(columns)
        tail = " | phase | eng dt | exec dt | trim |"
        lines.append(head + tail)
        lines.append("| --- | --- | --- | " + " | ".join("---" for _ in columns)
                     + " | --- | --- | --- | --- |")
        for arm, samples in arms.items():
            for index, sample in enumerate(samples):
                for label in labels:
                    x = records[label]["scenarios"][scenario][arm][index]
                    cells = []
                    for c in columns:
                        v = x[c]
                        cells.append(f"{v:.4f}" if isinstance(v, float) else str(v))
                    phase = x.get("phase", "-")
                    edt = x.get("diag-engine-dt")
                    cells += [phase,
                              "-" if edt is None else f"{edt:.6f}",
                              f'{x["exec-dt"]:.6f}',
                              "T" if x["trim-status"] else "F"]
                    lines.append(f'| {label} | {arm} | {x["label"]} | '
                                 + " | ".join(cells) + " |")
    (output / "trace.md").write_text("\n".join(lines) + "\n")
    print(f"{len(summary['differences'])} differing samples between "
          f"{', '.join(labels)}")
    print(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, required=True,
                        help="JSBSim source checkout supplying aircraft and engine data")
    parser.add_argument("--build", action="append", default=[],
                        metavar="LABEL=DIR", help="a built JSBSim tree to measure")
    parser.add_argument("--output", type=Path, default=None,
                        help="output directory (default: a new dated directory "
                             "under <source>/build/turbine-initialization-trace)")
    parser.add_argument("--python", default=sys.executable)
    parser.add_argument("--measure", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--crash-probe", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--tests", type=Path, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.crash_probe:
        crash_probe(args)
    elif args.measure:
        measure(args)
    else:
        if not args.build:
            parser.error("at least one --build LABEL=DIR is required")
        compare(args)


if __name__ == "__main__":
    main()
