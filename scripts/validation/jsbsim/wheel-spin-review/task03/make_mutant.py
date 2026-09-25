#!/usr/bin/env python3
"""Restore the original absolute airborne damping in a task 03 source tree.

Usage: make_mutant.py SOURCE_TREE
The tree must already contain the task 03 engine diff (relative getter/setter).
Only the airborne damping block is replaced; everything else stays task 03.
"""
from pathlib import Path
import sys

path = Path(sys.argv[1]) / 'src/models/FGLGear.cpp'
text = path.read_text()
new = """      if (!fdmex->GetTrimStatus() && in.TotalDeltaT > 0.0) {
        double brake = eBrakeGrp != bgNone ? in.BrakePos[eBrakeGrp] : 0.0;
        double decrement = (13.0 + 100.0 * brake) / wheelRadius * in.TotalDeltaT;
        double bodyRate = DotProduct(in.PQR, GetWheelSpinAxis());
        double relativeRate = wheelSpin.Rate - bodyRate;
        wheelSpin.Rate = bodyRate + sign(relativeRate) * max(0.0, fabs(relativeRate) - decrement);
      }
"""
old = """      double brake = eBrakeGrp != bgNone ? in.BrakePos[eBrakeGrp] : 0.0;
      double decrement = (13.0 + 100.0 * brake) / wheelRadius * in.TotalDeltaT;
      wheelSpin.Rate = sign(wheelSpin.Rate) * max(0.0, fabs(wheelSpin.Rate) - decrement);
"""
assert text.count(new) == 1, 'task 03 damping block not found exactly once'
path.write_text(text.replace(new, old))
print('mutated', path)
