#!/usr/bin/env python3
"""Print the F-16 divergence diagnostic from a compare_scripts --trace run.

Usage: python3 inspect_f16.py /path/to/dated/comparison/output
Reads retained raw scratch CSVs; writes only stdout for the caller to capture.
"""
import csv
import json
from pathlib import Path
import sys

p = Path(sys.argv[1])
k = '/fdm/jsbsim/'
thresholds = [1e-6, 1e-3, 0.1, 1, 10]
result = {'thresholds': [], 'max_du': {'value': 0}, 'first_return': {}}
with (p / 'base/f16_test/review-trace.csv').open() as f, (p / 'probe/f16_test/review-trace.csv').open() as g:
    for x, y in zip(csv.DictReader(f), csv.DictReader(g)):
        t = float(x['Time'])
        du = abs(float(x[k+'velocities/u-fps']) - float(y[k+'velocities/u-fps']))
        row = {'t': t, 'du': du, 'h_base': float(x[k+'position/h-sl-ft']),
               'h_probe': float(y[k+'position/h-sl-ft']),
               'fx_base': float(x[k+'forces/fbx-gear-lbs']),
               'fx_probe': float(y[k+'forces/fbx-gear-lbs'])}
        if thresholds and du > thresholds[0]:
            result['thresholds'].append({'threshold': thresholds.pop(0), **row})
        if du > result['max_du']['value']:
            result['max_du'] = {'value': du, **row}
        if t > 100 and not result['first_return'] and abs(row['fx_base']) > 1e-3:
            result['first_return'] = row
print(json.dumps(result, indent=2))
