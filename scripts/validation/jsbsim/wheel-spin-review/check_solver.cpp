// Planning probe of the public acceleration-model test seam at 24e085bf.
// Uses the pre-rename field names; this is evidence, not the proposed CxxTest.
#include <iostream>
#include <iomanip>
#include <FGFDMExec.h>
#include <models/FGAccelerations.h>
#include <math/LagrangeMultiplier.h>
using namespace JSBSim;

int main() {
  FGJSBBase::debug_lvl = 0;
  std::cout << std::setprecision(17);
  for (int mode = 0; mode < 7; ++mode) {
    FGFDMExec exec;
    auto a = exec.GetAccelerations();
    a->InitModel();
    a->in = {};
    auto identity = FGMatrix33(1,0,0,0,1,0,0,0,1);
    a->in.J = FGMatrix33(4,0,0,0,8,0,0,0,16);
    a->in.Jinv = FGMatrix33(.25,0,0,0,.125,0,0,0,.0625);
    a->in.Ti2b = a->in.Tb2i = a->in.Tec2b = a->in.Tec2i = identity;
    a->in.Mass = 2;
    a->in.DeltaT = .1;
    WheelSpinDOF wheel, other;
    wheel.InvInertia = other.InvInertia = 1;
    LagrangeMultiplier roll{}, brake{};
    roll.ForceJacobian = FGColumnVector3(1,0,0);
    roll.MomentJacobian = FGColumnVector3(0,1,0);
    brake.MomentJacobian = FGColumnVector3(0,1,0);
    roll.Min = brake.Min = -100;
    roll.Max = brake.Max = 100;
    roll.Wheel = &wheel;
    roll.WheelCoeff = -1;
    brake.Wheel = &wheel;
    brake.WheelCoeff = 1;
    std::vector<LagrangeMultiplier*> rows;
    a->in.vUVW = FGColumnVector3(2,0,0);
    switch (mode) {
      case 0: roll.Wheel = nullptr; rows = {&roll}; break;
      case 1: rows = {&roll}; break;
      case 2:
      case 4:
      case 6:
        a->in.vUVW.InitMatrix();
        a->in.vPQR = a->in.vPQRi = FGColumnVector3(0,2,0);
        wheel.Rate = 3;
        rows = {&brake};
        if (mode == 4) { brake.Min = -2; brake.Max = 2; brake.value = 10; }
        if (mode == 6) { a->in.DeltaT = 0; wheel.Accel = 123; }
        break;
      case 3: rows = {&roll, &brake}; break;
      case 5:
        a->in.vUVW.InitMatrix();
        roll.MomentJacobian.InitMatrix();
        brake.MomentJacobian.InitMatrix();
        brake.ForceJacobian = FGColumnVector3(0,0,1);
        brake.WheelCoeff = -1;
        brake.Wheel = &other;
        wheel.Rate = 1; other.Rate = -2;
        rows = {&roll, &brake}; break;
    }
    a->in.MultipliersList = &rows;
    a->Run(false);
    std::cout << mode << " roll=" << roll.value << " brake=" << brake.value
              << " wheel_accel=" << wheel.Accel << " other_accel=" << other.Accel
              << " udot=" << a->GetUVWdot(1) << " qdot=" << a->GetPQRdot(2) << '\n';
  }
}
