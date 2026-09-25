#!/usr/bin/env python3
"""Apply ONLY the proposed Jacobian cleanup to an archived 24e085bf tree.

Planning experiment, not the implementation patch. Refuses a reused source.
"""
from pathlib import Path
import sys

root = Path(sys.argv[1])
p = root / 'src/math/LagrangeMultiplier.h'
s = p.read_text()
assert 'bool UseMomentJacobian = false;' in s
s = s.replace('  FGColumnVector3 LeverArm;\n', '')
a = s.index('  /// When true, the moment')
b = s.index('  FGColumnVector3 MomentJacobian;', a)
s = s[:a] + s[b:]
p.write_text(s)
p = root / 'src/models/FGLGear.cpp'
s = p.read_text().replace('LMultiplier[i].LeverArm.InitMatrix();', 'LMultiplier[i].MomentJacobian.InitMatrix();')
for row in ('ftDynamic', 'ftRoll', 'ftSide'):
    s = s.replace(f'LMultiplier[{row}].LeverArm = vWhlContactVec;',
                  f'LMultiplier[{row}].MomentJacobian = vWhlContactVec * LMultiplier[{row}].ForceJacobian;')
s = s.replace('  LMultiplier[ftRoll].UseMomentJacobian = true;\n', '')
s = s.replace('  brake.LeverArm.InitMatrix();\n', '').replace('  brake.UseMomentJacobian = true;\n', '')
p.write_text(s)
p = root / 'src/models/FGAccelerations.cpp'
s = p.read_text()
a = s.index('  // Multipliers coupled to a wheel')
b = s.index('  vector<double> a(n*n)', a)
s = s[:a] + '  for (auto m : multipliers)\n    if (m->Wheel) m->Wheel->Accel = 0.0;\n\n' + s[b:]
a = s.index('    if (generalized) {')
b = s.index('\n  // Assemble the RHS member', a)
s = s[:a] + '''    const LagrangeMultiplier* mi = multipliers[i];
    FGColumnVector3 v1 = mi->ForceJacobian / in.Mass;
    FGColumnVector3 v2 = in.Jinv * mi->MomentJacobian;
    for (unsigned int j=0; j < i; j++)
      a[i*n+j] = a[j*n+i];
    for (unsigned int j=i; j < n; j++) {
      const LagrangeMultiplier* mj = multipliers[j];
      a[i*n+j] = DotProduct(mj->ForceJacobian, v1) + DotProduct(mj->MomentJacobian, v2);
      if (mi->Wheel && mi->Wheel == mj->Wheel)
        a[i*n+j] += mi->WheelCoeff * mj->WheelCoeff * mi->Wheel->InvInertia;
    }
  }
''' + s[b:]
a = s.index('    FGColumnVector3 r = multipliers[i]->LeverArm;')
b = s.index('\n    for (unsigned int j=0; j < n; j++)', a)
s = s[:a] + '''    const LagrangeMultiplier* mi = multipliers[i];
    double wheelTerm = (mi->Wheel && dt > 0.) ? mi->WheelCoeff * mi->Wheel->Rate / dt : 0.;
    rhs[i] = -(DotProduct(U, vdot) + DotProduct(mi->MomentJacobian, wdot) + wheelTerm)/d;
''' + s[b:]
a = s.index('    FGColumnVector3 r = multipliers[i]->LeverArm;')
b = s.index('\n  FGColumnVector3 accel =', a)
s = s[:a] + '''    const LagrangeMultiplier* mi = multipliers[i];
    vFrictionForces += lambda * U;
    vFrictionMoments += lambda * mi->MomentJacobian;
    if (mi->Wheel)
      mi->Wheel->Accel += mi->WheelCoeff * lambda * mi->Wheel->InvInertia;
  }
''' + s[b:]
p.write_text(s)
