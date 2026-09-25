#!/usr/bin/env python3
"""Print the numbers behind task 03's airframe-relative wheel spin tests.

Usage: JSBSim .venv/bin/python frame_values.py SOURCE BUILD [--landing-only]

Loads SOURCE/tests/TestWheelSpin.py without invoking its runner, as
../check_airborne_frame.py does; fixture scratch stays inside BUILD/tests.
Without --landing-only the BUILD must be task 03 or later: the property then
reads and writes spin relative to the airframe. --landing-only prints only the
touchdown summary, whose raw property values mean the internal spin state on
builds before task 03, so the transition can be compared across builds.
"""
import ast
import json
import math
import os
from pathlib import Path
import sys

args = [a for a in sys.argv[1:] if not a.startswith('--')]
landing_only = '--landing-only' in sys.argv[1:]
source, build = (Path(p).resolve() for p in args)
os.chdir(build / 'tests')
sys.path[:0] = [str(build / 'tests'), str(source / 'tests')]
fixture = source / 'tests/TestWheelSpin.py'
sys.argv = [str(fixture)]
tree = ast.parse(fixture.read_text())
assert isinstance(tree.body[-1], ast.Expr)
assert tree.body[-1].value.func.id == 'RunTest'
tree.body.pop()
scope = {}
exec(compile(tree, str(fixture), 'exec'), scope)
WHEELS, FT_PER_M = scope['WHEELS'], scope['FT_PER_M']
MAIN = 'gear/unit[1]/wheel-spin-rad_sec'
out = {}

case = scope['TestWheelSpin']('test_opt_in')
case.setUp()
try:
    rows, _ = case.landing(WHEELS)
    touch = next(i for i, row in enumerate(rows) if row['wow'] > 0.5)
    transitions = sum(1 for a, b in zip(rows, rows[1:]) if a['wow'] != b['wow'])
    out['landing'] = {
        'touch_step': touch,
        'unit1_wow_transitions': transitions,
        'max_abs_property_before_touch': max(abs(r['spin1']) for r in rows[:touch]),
        'before_touch': {k: rows[touch - 1][k] for k in ('q', 'spin1', 'slip')},
        'touch': {k: rows[touch][k] for k in ('q', 'u', 'spin1', 'slip')},
        'radius_ft_times_q_touch': 0.22 * FT_PER_M * rows[touch]['q'],
    }

    if not landing_only:
        locked = []
        for q in (0.4, -0.4):
            fdm = case.load_c172p(WHEELS, scope['hover'](q=q))
            rec = {'q_ic': fdm['velocities/q-rad_sec'], 'spin_after_run_ic': fdm[MAIN]}
            fdm[MAIN] = 0.0
            rec['spin_after_writing_0'] = fdm[MAIN]
            fdm['fcs/left-brake-cmd-norm'] = 1.0
            worst = 0.0
            for step in range(120):
                assert fdm.run()
                worst = max(worst, abs(fdm[MAIN]))
                if step in (0, 119):
                    rec['after_%d_steps' % (step + 1)] = {
                        'q': fdm['velocities/q-rad_sec'], 'spin': fdm[MAIN],
                        'wow': fdm['gear/unit[1]/WOW']}
            rec['max_abs_spin_over_120_steps'] = worst
            locked.append(rec)
            case.delete_fdm()
        out['locked_wheel'] = locked

        fdm = case.load_c172p(WHEELS, scope['hover'](q=0.4))
        fdm[MAIN] = 0.7
        fdm['ic/q-rad_sec'] = -0.2
        assert fdm.run_ic()
        rec = {'q_after_run_ic': fdm['velocities/q-rad_sec'],
               'spin_after_run_ic': fdm[MAIN], 'expected': 0.3 - 0.2}
        fdm.reset_to_initial_conditions(0)
        rec['q_after_reset'] = fdm['velocities/q-rad_sec']
        rec['spin_after_reset'] = fdm[MAIN]
        out['run_ic'] = rec
        case.delete_fdm()

        drag = []
        radius_ft = 0.22 * FT_PER_M
        for brake, seed in [(b, s) for b in (0.0, 0.5, 1.0) for s in (100.0, -100.0)] \
                + [(1.0, 0.01)]:
            fdm = case.load_c172p(WHEELS, scope['CRUISE'])
            dt = fdm.get_delta_t()
            q_before = fdm['velocities/q-rad_sec']
            fdm[MAIN] = seed
            fdm['fcs/left-brake-cmd-norm'] = brake
            assert fdm.run()
            q_after = fdm['velocities/q-rad_sec']
            relative = seed + q_after - q_before
            decrement = (13.0 + 100.0 * brake) * dt / radius_ft
            expected = math.copysign(max(0.0, abs(relative) - decrement), relative)
            drag.append({'brake': brake, 'seed': seed, 'dt': dt, 'q_before': q_before,
                         'q_after': q_after, 'decrement': decrement,
                         'expected': expected, 'result': fdm[MAIN],
                         'error': fdm[MAIN] - expected})
            case.delete_fdm()
        out['drag_first_step'] = drag

        fdm = case.load_c172p(WHEELS, scope['hover'](p=0.3, q=0.4),
                              max_steer={'NOSE': 90})
        nose = 'gear/unit[0]/wheel-spin-rad_sec'
        rec = {'p': fdm['velocities/p-rad_sec'], 'q': fdm['velocities/q-rad_sec'],
               'spin_unsteered': fdm[nose]}
        fdm['fcs/steer-pos-deg[0]'] = 90.0
        rec['steer_deg'] = fdm['fcs/steer-pos-deg[0]']
        rec['spin_steered_90'] = fdm[nose]
        out['steering'] = rec
        case.delete_fdm()

        fdm = case.load_c172p(WHEELS, scope['CRUISE'])
        q_start = fdm['velocities/q-rad_sec']
        fdm[MAIN] = 100.0
        fdm['gear/unit[2]/wheel-spin-rad_sec'] = 100.0
        fdm['fcs/right-brake-cmd-norm'] = 1.0
        for _ in range(120):
            assert fdm.run()
        q_end = fdm['velocities/q-rad_sec']
        expected = 100.0 - 13.0 / radius_ft + q_end - q_start
        out['spin_down'] = {'q_start': q_start, 'q_end': q_end,
                            'old_expected': 100.0 - 13.0 / radius_ft,
                            'expected': expected, 'unit1': fdm[MAIN],
                            'error': fdm[MAIN] - expected,
                            'unit2_braked': fdm['gear/unit[2]/wheel-spin-rad_sec']}
        case.delete_fdm()
finally:
    case.tearDown()

print(json.dumps(out, indent=2))
