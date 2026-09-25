#!/usr/bin/env python3
"""Reproduce the original PR's airborne frame error using its Python module.

Usage: JSBSim .venv/bin/python check_airborne_frame.py SOURCE BUILD
Uses the existing TestWheelSpin fixture without invoking its test runner.
All fixture scratch is created inside BUILD/tests.
"""
import ast
import json
import os
from pathlib import Path
import sys

source, build = (Path(p).resolve() for p in sys.argv[1:])
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
case = scope['TestWheelSpin']('test_airborne_spin_down')
case.setUp()
try:
    fdm = case.load_c172p(scope['WHEELS'], {
        'ic/h-agl-ft': 1500., 'ic/vc-kts': 0., 'ic/theta-deg': 0., 'ic/q-rad_sec': 0.4})
    name = 'gear/unit[1]/wheel-spin-rad_sec'
    q0 = fdm['velocities/q-rad_sec']
    # Standard unsteered gear: upward normal cross forward roll = -body Y.
    # On this old PR the property writes the internal NED-labelled rate.
    fdm[name] = -q0
    before = {'q': q0, 'internal_rate': fdm[name], 'relative_rate': fdm[name] + q0}
    fdm['fcs/left-brake-cmd-norm'] = 1.
    assert fdm.run()
    q1 = fdm['velocities/q-rad_sec']
    after = {'q': q1, 'internal_rate': fdm[name], 'relative_rate': fdm[name] + q1,
             'wow': fdm['gear/unit[1]/WOW']}
    print(json.dumps({'before': before, 'after_one_step': after}, indent=2))
finally:
    case.tearDown()
