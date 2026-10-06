/*%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

 Module:       FGTurbine.cpp
 Author:       David Culp
 Date started: 03/11/2003
 Purpose:      This module models a turbine engine.

 ------------- Copyright (C) 2003  David Culp (daveculp@cox.net) ---------

 This program is free software; you can redistribute it and/or modify it under
 the terms of the GNU Lesser General Public License as published by the Free Software
 Foundation; either version 2 of the License, or (at your option) any later
 version.

 This program is distributed in the hope that it will be useful, but WITHOUT
 ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 FOR A PARTICULAR PURPOSE.  See the GNU Lesser General Public License for more
 details.

 You should have received a copy of the GNU Lesser General Public License along with
 this program; if not, write to the Free Software Foundation, Inc., 59 Temple
 Place - Suite 330, Boston, MA  02111-1307, USA.

 Further information about the GNU Lesser General Public License can also be found on
 the world wide web at http://www.gnu.org.

FUNCTIONAL DESCRIPTION
--------------------------------------------------------------------------------

This class descends from the FGEngine class and models a turbine engine based
on parameters given in the engine config file for this class

HISTORY
--------------------------------------------------------------------------------
03/11/2003  DPC  Created
09/08/2003  DPC  Changed Calculate() and added engine phases

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
INCLUDES
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%*/

#include <algorithm>
#include <cmath>
#include <iostream>
#include <limits>
#include <sstream>

#include "FGFDMExec.h"
#include "math/FGFunction.h"
#include "math/FGRealValue.h"
#include "math/FGParameterValue.h"
#include "FGTurbine.h"
#include "FGThruster.h"
#include "input_output/FGXMLElement.h"
#include "input_output/string_utilities.h"

using namespace std;

namespace JSBSim {

/*%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
CLASS IMPLEMENTATION
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%*/

FGTurbine::FGTurbine(FGFDMExec* exec, Element *el, int engine_number, struct Inputs& input)
  : FGEngine(engine_number, input), FDMExec(exec)
{
  Type = etTurbine;

  MilThrust = MaxThrust = 10000.0;
  TSFC = std::make_unique<FGSimplifiedTSFC>(this, 0.8);
  ATSFC = std::make_unique<FGRealValue>(1.7);
  IdleN1 = 30.0;
  IdleN2 = 60.0;
  MaxN1 = MaxN2 = 100.0;
  Augmented = AugMethod = Injected = 0;
  BypassRatio = BleedDemand = 0.0;
  IdleThrustLookup = MilThrustLookup = MaxThrustLookup = InjectionLookup = nullptr;
  N1_spinup = 1.0; N2_spinup = 3.0; IgnitionN1 = 5.21; IgnitionN2 = 25.18; N1_start_rate = 1.4; N2_start_rate = 2.0;
  N1_spindown = 2.0; N2_spindown = 2.0;
  InjectionTime = 30.0;
  InjectionTimer = InjWaterNorm = 0.0;
  EPR = 1.0;
  disableWindmill = false;
  ThrottlePos = 0.0;

  Load(exec, el);
  Debug(0);
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

void FGTurbine::ResetToIC(void)
{
  FGEngine::ResetToIC();

  N1 = N2 = InjN1increment = InjN2increment = 0.0;
  N2norm = 0.0;
  correctedTSFC = TSFC->GetValue();
  AugmentCmd = InjWaterNorm = 0.0;
  InletPosition = NozzlePosition = 1.0;
  Stalled = Seized = Overtemp = Fire = Augmentation = Injection = Reversed = false;
  AugmentationActive = false;
  Cutoff = true;
  phase = tpOff;
  EGT_degC = in.TAT_c;
  OilTemp_degK = in.TAT_c + 273.0;
  ThermalWall.temperature = ThermalGasK = in.TAT_c + 273.15;
  ThermalWall.initialized = ThermalWall.warmPending = false;
  ThermalWall.heat = {};
  if (Thermal) for (auto& region : Thermal->regions) {
    region->temperature = ThermalGasK;
    region->initialized = region->warmPending = false;
    region->heat = {};
  }
  ThermalABFuelKgSec = ThermalDryFuelPph = 0.0;
  ThermalABBurnedFuelKgSec = 0.0;
  ThermalValid = false;
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
// The main purpose of Calculate() is to determine what phase the engine should
// be in, then call the corresponding function.

void FGTurbine::Calculate(void)
{
  double thrust;
  AugmentationActive = false;
  ThermalDryFuelPph = 0.0;

  RunPreFunctions();

  ThrottlePos = in.ThrottlePos[EngineNumber];

  if (ThrottlePos > 1.0) {
    AugmentCmd = ThrottlePos - 1.0;
    ThrottlePos -= AugmentCmd;
  } else {
    AugmentCmd = 0.0;
  }

  // When trimming is finished check if user wants engine OFF or RUNNING
  if ((phase == tpTrim) && (in.TotalDeltaT > 0)) {
    if (Running && !Starved) {
      phase = tpRun;
      N1_factor = MaxN1 - IdleN1;
      N2_factor = MaxN2 - IdleN2;
      N2 = IdleN2 + ThrottlePos * N2_factor;
      N1 = IdleN1 + ThrottlePos * N1_factor;
      OilTemp_degK = 366.0;
      Cutoff = false;
    } else {
      phase = tpOff;
      Cutoff = true;
      EGT_degC = in.TAT_c;
    }
  }

  if (!Running && Cutoff && Starter) {
     if (phase == tpOff) phase = tpSpinUp;
  }

  // start
  if ((Starter == true) || (in.qbar > 30.0)) {
    if (!Running && !Cutoff && (N2 > 15.0)) phase = tpStart;
  }

  if (Cutoff && (phase != tpSpinUp)) phase = tpOff;
  if (in.TotalDeltaT == 0) phase = tpTrim;
  if (Starved) phase = tpOff;
  if (Stalled) phase = tpStall;
  if (Seized) phase = tpSeize;

  switch (phase) {
    case tpOff:    thrust = Off(); break;
    case tpRun:    thrust = Run(); break;
    case tpSpinUp: thrust = SpinUp(); break;
    case tpStart:  thrust = Start(); break;
    case tpStall:  thrust = Stall(); break;
    case tpSeize:  thrust = Seize(); break;
    case tpTrim:   thrust = Trim(); break;
    default: thrust = Off();
  }

  LoadThrusterInputs();
  Thruster->Calculate(thrust); // allow thruster to modify thrust (i.e. reversing)

  if (Thermal) UpdateThermal();

  RunPostFunctions();
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

double FGTurbine::Off(void)
{
  Running = false;
  FuelFlow_pph = Seek(&FuelFlow_pph, 0, 1000.0, 10000.0);
  // some engines have inlets that close when they are off. So, if a flag is true disable windmilling
  if (disableWindmill == false) {
    // Need a small non-zero increment for acceleration otherwise acceleration will be 0 if N1 = 0
    N1 = Seek(&N1, in.qbar/10.0, N1/2.0 + 0.1, N1/N1_spindown);
    N2 = Seek(&N2, in.qbar/15.0, N2/2.0 + 0.1, N2/N2_spindown);
  } else {
    N1 = Seek(&N1, 0, N1/2.0, N1/N1_spindown);
    N2 = Seek(&N2, 0, N2/2.0, N2/N2_spindown);
  }
  EGT_degC = Seek(&EGT_degC, in.TAT_c, 11.7, 7.3);
  OilTemp_degK = Seek(&OilTemp_degK, in.TAT_c + 273.0, 0.2, 0.2);
  OilPressure_psi = N2 * 0.62;
  NozzlePosition = Seek(&NozzlePosition, 1.0, 0.8, 0.8);
  EPR = Seek(&EPR, 1.0, 0.2, 0.2);
  Augmentation = false;
  return 0.0;
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

double FGTurbine::Run()
{
  double idlethrust, milthrust, thrust;

  idlethrust = MilThrust * IdleThrustLookup->GetValue();
  milthrust = (MilThrust - idlethrust) * MilThrustLookup->GetValue();

  Running = true;
  Starter = false;

  N1_factor = MaxN1 - IdleN1;
  N2_factor = MaxN2 - IdleN2;
  if ((Injected == 1) && Injection && (InjWaterNorm > 0)) {
    N1_factor += InjN1increment;
    N2_factor += InjN2increment;
  }
  N2 = Seek(&N2, IdleN2 + ThrottlePos * N2_factor,
            N2SpoolUp->GetValue(), N2SpoolDown->GetValue());
  N1 = Seek(&N1, IdleN1 + ThrottlePos * N1_factor,
            N1SpoolUp->GetValue(), N1SpoolDown->GetValue());
  N2norm = (N2 - IdleN2) / N2_factor;
  thrust = idlethrust + (milthrust * N2norm * N2norm);
  EGT_degC = in.TAT_c + 363.1 + N2norm * 357.1;
  OilPressure_psi = N2 * 0.62;
  OilTemp_degK = Seek(&OilTemp_degK, 366.0, 1.2, 0.1);

  const double dryThrust = thrust;
  double dryTSFC = correctedTSFC;
  if (!Augmentation) {
    correctedTSFC = TSFC->GetValue();
    dryTSFC = correctedTSFC;
    FuelFlow_pph = Seek(&FuelFlow_pph, thrust * correctedTSFC, 1000.0, 10000.0);
    if (FuelFlow_pph < IdleFF) FuelFlow_pph = IdleFF;
    NozzlePosition = Seek(&NozzlePosition, 1.0 - N2norm, 0.8, 0.8);
    thrust = thrust * (1.0 - BleedDemand);
    EPR = 1.0 + thrust/MilThrust;
  } else if (Thermal) {
    // The optional thermal partition needs the same unaugmented fuel demand
    // at this operating point. It never writes back to thrust or fuel state.
    dryTSFC = TSFC->GetValue();
  }
  if (Thermal) ThermalDryFuelPph = std::isfinite(dryTSFC) && dryTSFC >= 0.0
    ? std::max(IdleFF, dryThrust * dryTSFC)
    : std::numeric_limits<double>::quiet_NaN();

  if (AugMethod == 1) {
    if ((Augmented == 1) && (ThrottlePos > 0.99) && (N2 > 97.0)) {Augmentation = true;}
    else {Augmentation = false;}
  }

  if ((Augmented == 1) && Augmentation && (AugMethod < 2)) {
    AugmentationActive = true;
    thrust = MaxThrustLookup->GetValue() * MaxThrust;
    FuelFlow_pph = Seek(&FuelFlow_pph, thrust * ATSFC->GetValue(), 5000.0, 10000.0);
    NozzlePosition = Seek(&NozzlePosition, 1.0, 0.8, 0.8);
  }

  if (AugMethod == 2) {
    if ((Augmented == 1) && (AugmentCmd > 0.0)) {
      Augmentation = true;
      AugmentationActive = true;
      double tdiff = (MaxThrust * MaxThrustLookup->GetValue()) - thrust;
      thrust += (tdiff * std::min(AugmentCmd, 1.0));
      FuelFlow_pph = Seek(&FuelFlow_pph, thrust * ATSFC->GetValue(), 5000.0, 10000.0);
      NozzlePosition = Seek(&NozzlePosition, 1.0, 0.8, 0.8);
    } else {
      Augmentation = false;
    }
  }

  if ((Injected == 1) && Injection && (InjWaterNorm > 0.0)) {
    InjectionTimer += in.TotalDeltaT;
    if (InjectionTimer < InjectionTime) {
       thrust = thrust * InjectionLookup->GetValue();
       InjWaterNorm = 1.0 - (InjectionTimer/InjectionTime);
    } else {
       Injection = false;
       InjWaterNorm = 0.0;
    }
  }

  if (Cutoff) phase = tpOff;
  if (Starved) phase = tpOff;

  return thrust;
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

double FGTurbine::SpinUp(void)
{
  Running = false;
  FuelFlow_pph = 0.0;
  N2 = Seek(&N2, IgnitionN2, N2_spinup, N2/2.0);
  N1 = Seek(&N1, IgnitionN1, N1_spinup, N1/2.0);
  EGT_degC = Seek(&EGT_degC, in.TAT_c, 11.7, 7.3);
  OilPressure_psi = N2 * 0.62;
  OilTemp_degK = Seek(&OilTemp_degK, in.TAT_c + 273.0, 0.2, 0.2);
  EPR = 1.0;
  NozzlePosition = 1.0;
  if (Starter == false) phase = tpOff;
  return 0.0;
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

double FGTurbine::Start(void)
{
  if ((N2 > 15.0) && !Starved) {       // minimum 15% N2 needed for start
    Cranking = true;                   // provided for sound effects signal
    if (N2 < IdleN2) {
      N2 = Seek(&N2, IdleN2, N2_start_rate, N2/2.0);
      N1 = Seek(&N1, IdleN1, N1_start_rate, N1/2.0);
      EGT_degC = Seek(&EGT_degC, in.TAT_c + 363.1, 21.3, 7.3);
      FuelFlow_pph = IdleFF * N2 / IdleN2;
      OilPressure_psi = N2 * 0.62;
      if ((Starter == false) && (in.qbar < 30.0)) phase = tpOff; // aborted start
      }
    else {
      phase = tpRun;
      Running = true;
      Starter = false;
      Cranking = false;
      }
    }
  else {                 // no start if N2 < 15%
    phase = tpOff;
    Starter = false;
    }

  return 0.0;
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

double FGTurbine::Stall(void)
{
  EGT_degC = in.TAT_c + 903.14;
  FuelFlow_pph = IdleFF;
  N1 = Seek(&N1, in.qbar/10.0, 0, N1/10.0);
  N2 = Seek(&N2, in.qbar/15.0, 0, N2/10.0);
  if (ThrottlePos < 0.01) {
    phase = tpRun;               // clear the stall with throttle to idle
    Stalled = false;
    }
  return 0.0;
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

double FGTurbine::Seize(void)
{
    N2 = 0.0;
    N1 = Seek(&N1, in.qbar/20.0, 0, N1/15.0);
    FuelFlow_pph = Cutoff ? 0.0 : IdleFF;
    OilPressure_psi = 0.0;
    OilTemp_degK = Seek(&OilTemp_degK, in.TAT_c + 273.0, 0, 0.2);
    Running = false;
    return 0.0;
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

double FGTurbine::Trim()
{
    // Zero-time initialization also evaluates stopped engines. Their throttle
    // describes no running operating point: retain spool/fuel state, but do not
    // manufacture steady dry or augmented thrust while the engine is off.
    if (!Running) return 0.0;

    double idlethrust = MilThrust * IdleThrustLookup->GetValue();
    double milthrust = (MilThrust - idlethrust) * MilThrustLookup->GetValue();
    double steadyN2 = IdleN2 + ThrottlePos * N2_factor;
    double steadyN2norm = (steadyN2 - IdleN2) / N2_factor;
    // Trim establishes steady thrust without advancing time. Keep a running
    // engine's observable spool state and fuel flow consistent with that
    // operating point. Zero-time evaluations, such as RunIC(), can reach Trim
    // even when the engine is off. Such an engine keeps its (possibly
    // windmilling) spools and its existing fuel state: the throttle describes
    // no operating point it is in, and a steady flow assigned here would be
    // reported and then burned as it decayed.
    if (Running) {
      N1 = IdleN1 + ThrottlePos * N1_factor;
      N2 = steadyN2;
      N2norm = steadyN2norm;
    }
    double dryThrust = idlethrust + (milthrust * steadyN2norm * steadyN2norm);
    double thrust = dryThrust * (1.0 - BleedDemand);

    // Run() derives fuel flow from the thrust produced before bleed extraction
    // is deducted. Trim has no time to seek that value, so assign the same
    // steady product directly; TSFC is evaluated at this operating point,
    // after N2norm has been updated to it.
    if (Running) {
      correctedTSFC = TSFC->GetValue();
      FuelFlow_pph = std::max(IdleFF, dryThrust * correctedTSFC);
      if (Thermal) ThermalDryFuelPph = FuelFlow_pph;
    }

    if (AugMethod == 1) {
      if ((ThrottlePos > 0.99) && (steadyN2 > 97.0)) {Augmentation = true;}
      else {Augmentation = false;}
    }

    if ((Augmented == 1) && Augmentation && (AugMethod < 2)) {
      AugmentationActive = Running;
      thrust = MaxThrust * MaxThrustLookup->GetValue();
      if (Running) FuelFlow_pph = thrust * ATSFC->GetValue();
    }

    if ((AugMethod == 2) && (Augmented == 1)) {
      if (AugmentCmd > 0.0) {
        AugmentationActive = Running;
        double tdiff = (MaxThrust * MaxThrustLookup->GetValue()) - thrust;
        thrust += (tdiff * std::min(AugmentCmd, 1.0));
        if (Running) FuelFlow_pph = thrust * ATSFC->GetValue();
      }
    }

    if ((Injected == 1) && Injection) {
      thrust = thrust * InjectionLookup->GetValue();
    }

    return thrust;
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

double FGTurbine::CalcFuelNeed(void)
{
  FuelFlowRate = FuelFlow_pph / 3600.0; // Calculates flow in lbs/sec from lbs/hr
  FuelExpended = FuelFlowRate * in.TotalDeltaT;     // Calculates fuel expended in this time step
  if (!Starved) FuelUsedLbs += FuelExpended;
  return FuelExpended;
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

double FGTurbine::GetPowerAvailable(void) const {
  if( ThrottlePos <= 0.77 )
    return 64.94*ThrottlePos;
  else
    return 217.38*ThrottlePos - 117.38;
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

double FGTurbine::Seek(double *var, double target, double accel, double decel) {
  double v = *var;
  if (v > target) {
    v -= in.TotalDeltaT * decel;
    if (v < target) v = target;
  } else if (v < target) {
    v += in.TotalDeltaT * accel;
    if (v > target) v = target;
  }
  return v;
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

void FGTurbine::LoadThermal(FGFDMExec* exec, Element* el)
{
  Element* block = el->FindElement("thermal");
  if (!block) return;
  auto parameters = std::make_unique<ThermalParameters>();
  auto read = [&](const char* name, bool required, bool positive,
                  bool fraction = false) -> std::shared_ptr<FGParameter> {
    Element* field = block->FindElement(name);
    if (!field) {
      if (!required) return nullptr;
      XMLLogException err(block);
      err << "<thermal> requires <" << name << "> in the SI units named by its tag.\n";
      throw err;
    }
    std::shared_ptr<FGParameter> parameter;
    if (Element* function = field->FindElement("function")) {
      if (!function->GetAttributeValue("name").empty()) {
        XMLLogException err(function);
        err << "Thermal parameter functions must be unnamed.\n";
        throw err;
      }
      parameter = std::make_shared<FGFunction>(exec, function,
                                               std::to_string(EngineNumber));
    } else {
      parameter = std::make_shared<FGParameterValue>(field, exec->GetPropertyManager());
    }
    if (parameter->IsConstant()) {
      double value = parameter->GetValue();
      if (!std::isfinite(value) || (positive ? value <= 0.0 : value < 0.0)
          || (fraction && value > 1.0)) {
        XMLLogException err(field);
        err << "Invalid <" << name << ">: require finite "
            << (positive ? "positive" : "nonnegative")
            << (fraction ? " value no greater than one" : " SI value") << ".\n";
        throw err;
      }
    }
    return parameter;
  };
  parameters->gasFlow = read("gas-mass-flow-kg-sec", true, false);
  parameters->gasCp = read("gas-specific-heat-j-kg-k", true, true);
  parameters->fuelHeat = read("fuel-heating-value-j-kg", true, true);
  parameters->efficiency = read("afterburner-efficiency", true, false, true);
  parameters->baseGasK = read("base-gas-temperature-k", false, true);
  parameters->stoichiometricRatio = read("stoichiometric-fuel-air-ratio", false, true);
  const auto readSolid = [&](ThermalSolid& solid) {
    solid.capacity = read("wall-heat-capacity-j-k", true, true);
    solid.gasConductance = read("gas-conductance-w-k", true, false);
    solid.coolantConductance = read("coolant-conductance-w-k", true, false);
    solid.area = read("radiation-area-sq-m", true, false);
    solid.emissivity = read("emissivity", true, false, true);
    solid.gasK = read("gas-temperature-k", false, true);
    solid.coolantK = read("coolant-temperature-k", false, true);
    solid.surroundingsK = read("surroundings-temperature-k", false, true);
    solid.initialMetalK = read("initial-metal-temperature-k", false, true);
    solid.flameArea = read("flame-radiation-area-sq-m", false, false);
    solid.flameEmissivity = read("flame-emissivity", false, false, true);
  };
  readSolid(ThermalWall);
  Element* thermalBlock = block;
  for (block = thermalBlock->FindElement("solid-region"); block;
       block = thermalBlock->FindNextElement("solid-region")) {
    auto region = std::make_unique<ThermalSolid>();
    region->name = block->GetAttributeValue("name");
    bool duplicate = false;
    for (const auto& prior : parameters->regions)
      duplicate = duplicate || prior->name == region->name;
    if (region->name.empty() || duplicate ||
        region->name.find_first_not_of("abcdefghijklmnopqrstuvwxyz0123456789-") != string::npos) {
      XMLLogException err(block);
      err << "Thermal solid-region requires a unique lowercase alphanumeric/hyphen name.\n";
      throw err;
    }
    readSolid(*region);
    parameters->regions.push_back(std::move(region));
  }
  Thermal = std::move(parameters);
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

void FGTurbine::ThermalSolid::SetTemperature(double value)
{
  if (!std::isfinite(value) || value <= 0.0) return;
  temperature = value;
  heat = {}; // Restoration establishes a new initial state, never a heat pulse.
  initialized = true;
  warmPending = false;
}

void FGTurbine::SetMetalTemperatureStateK(double temperature)
{
  if (Thermal) ThermalWall.SetTemperature(temperature);
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

void FGTurbine::UpdateThermal(void)
{
  const double ambientK = in.TAT_c + 273.15;
  ThermalWall.heat = {};
  for (const auto& region : Thermal->regions) region->heat = {};
  const auto& p = *Thermal;
  const auto value = [](const std::shared_ptr<FGParameter>& parameter, double fallback) {
    return parameter ? parameter->GetValue() : fallback;
  };
  const double gasFlow = p.gasFlow->GetValue();
  const double cp = p.gasCp->GetValue();
  const double heat = p.fuelHeat->GetValue();
  const double efficiency = p.efficiency->GetValue();
  const double baseK = value(p.baseGasK, EGT_degC + 273.15);
  const double stoichiometricRatio = value(p.stoichiometricRatio, 0.0);
  const auto nonnegative = [](double v) { return std::isfinite(v) && v >= 0.0; };
  const auto positive = [](double v) { return std::isfinite(v) && v > 0.0; };
  ThermalValid = nonnegative(gasFlow) && positive(cp) && positive(heat)
    && nonnegative(efficiency) && efficiency <= 1.0 && positive(baseK)
    && (!p.stoichiometricRatio || positive(stoichiometricRatio));
  ThermalABFuelKgSec = ThermalABBurnedFuelKgSec = 0.0;
  if (AugmentationActive && ThermalValid) {
    // FuelFlow_pph is current private native fuel. CalcFuelNeed refreshes the
    // public PPS observer later in FGPropulsion::ConsumeFuel.
    ThermalValid = nonnegative(FuelFlow_pph) && nonnegative(ThermalDryFuelPph)
      && gasFlow > 0.0;
    if (ThermalValid) {
      constexpr double pphToKgSec = 0.45359237 / 3600.0;
      const double totalFuelKgSec = FuelFlow_pph * pphToKgSec;
      ThermalABFuelKgSec = std::max(0.0, FuelFlow_pph - ThermalDryFuelPph) * pphToKgSec;
      ThermalABBurnedFuelKgSec = ThermalABFuelKgSec;
      if (p.stoichiometricRatio) {
        const double coreFuelKgSec = totalFuelKgSec - ThermalABFuelKgSec;
        const double airKgSec = std::max(0.0, gasFlow - coreFuelKgSec);
        const double remainingCapacity = std::max(0.0,
          airKgSec * stoichiometricRatio - coreFuelKgSec);
        ThermalABBurnedFuelKgSec = std::min(ThermalABFuelKgSec, remainingCapacity);
      }
    }
  }
  if (!ThermalValid) {
    ThermalGasK = std::numeric_limits<double>::quiet_NaN();
    return; // Preserve the last valid wall state; do not invent missing heat.
  }
  // Constant effective cp, enthalpy referenced to 298.15K; AB fuel sensible
  // enthalpy is neglected. Added fuel mass belongs in the outlet denominator.
  constexpr double referenceK = 298.15;
  ThermalGasK = baseK;
  if (gasFlow > 0.0 || ThermalABFuelKgSec > 0.0) {
    ThermalGasK = referenceK + (gasFlow * cp * (baseK - referenceK)
      + efficiency * ThermalABBurnedFuelKgSec * heat)
      / ((gasFlow + ThermalABFuelKgSec) * cp);
  }
  if (!positive(ThermalGasK)) { ThermalValid = false; return; }

  // Every solid uses the same bounded native solver, but retains its own
  // bath, capacity, cooling, radiation and initialization/restoration state.
  // Compute all candidates before committing, so invalid inputs cannot age only
  // part of the engine. No temporary vector allocation occurs on each step.
  const auto solve = [&](ThermalSolid& solid) -> bool {
    solid.candidateAccepted = false;
    const double capacity = solid.capacity->GetValue();
    const double hg = solid.gasConductance->GetValue();
    const double hc = solid.coolantConductance->GetValue();
    const double area = solid.area->GetValue();
    const double emissivity = solid.emissivity->GetValue();
    const double gasK = value(solid.gasK, ThermalGasK);
    const double coolantK = value(solid.coolantK, ambientK);
    const double surroundingsK = value(solid.surroundingsK, ambientK);
    const double flameArea = value(solid.flameArea, 0.0);
    const double flameEmissivity = value(solid.flameEmissivity, 0.0);
    const bool seedWarm = !solid.initialized && solid.warmPending;
    const double initialK = seedWarm ? value(solid.initialMetalK, ambientK) : ambientK;
    if (!(positive(capacity) && nonnegative(hg) && nonnegative(hc)
          && nonnegative(area) && nonnegative(emissivity) && emissivity <= 1.0
          && positive(gasK) && positive(coolantK) && positive(surroundingsK)
          && positive(solid.temperature) && positive(initialK)
          && nonnegative(flameArea) && nonnegative(flameEmissivity)
          && flameEmissivity <= 1.0)) return false;
    // Zero-time, artificial trim and executive suspension never initialize or
    // age solids, even when the engine's cached input timestep is positive.
    const double dt = in.TotalDeltaT;
    const bool integrate = !(dt <= 0.0 || FDMExec->IntegrationSuspended()
                             || FDMExec->GetTrimStatus());
    if (integrate && !positive(dt)) return false;
    double previous = solid.temperature;
    if (integrate && !solid.initialized && !solid.warmPending) previous = ambientK;
    if (!positive(previous)) return false;
    constexpr double sigma = 5.670374419e-8;
    const double radiative = sigma * area * emissivity;
    const double flame = AugmentationActive ? sigma * flameArea * flameEmissivity : 0.0;
    const auto fourth = [](double t) { double t2 = t * t; return t2 * t2; };
    double result = previous;
    if (integrate && seedWarm && solid.initialMetalK) result = initialK;
    else if (integrate) {
      const double rate = seedWarm ? 0.0 : capacity / dt;
      const auto residual = [&](double t) {
        return rate * (t - previous) + hg * (t - gasK)
          + hc * (t - coolantK) + radiative * (fourth(t) - fourth(surroundingsK))
          + flame * (fourth(t) - fourth(gasK));
      };
      double low = std::min({previous, gasK, coolantK, surroundingsK});
      double high = std::max({previous, gasK, coolantK, surroundingsK});
      if (!nonnegative(rate) || !std::isfinite(residual(low))
          || !std::isfinite(residual(high))) return false;
      if (rate + hg + hc + radiative + flame > 0.0) {
        for (int i = 0; i < 64; ++i) {
          double middle = low + (high - low) * 0.5;
          if (middle == low || middle == high) break;
          if (residual(middle) > 0.0) high = middle;
          else low = middle;
        }
        result = low + (high - low) * 0.5;
      }
    }
    auto& account = solid.candidateHeat;
    account = {};
    account.gasBathK = gasK;
    account.coolantBathK = coolantK;
    account.surroundingsBathK = surroundingsK;
    account.capacity = capacity;
    account.gasHeatW = hg * (gasK - result);
    account.coolantHeatW = hc * (coolantK - result);
    account.surroundingsHeatW = radiative * (fourth(surroundingsK) - fourth(result));
    account.flameHeatW = flame * (fourth(gasK) - fourth(result));
    account.netHeatW = account.gasHeatW + account.coolantHeatW
      + account.surroundingsHeatW + account.flameHeatW;
    if (!std::isfinite(account.netHeatW)) return false;
    if (integrate) {
      if (seedWarm) {
        // A requested already-running initial condition supplies stored energy
        // externally. It is not a cold-start transient nor finite-time heating.
        account.initializationEnergyJ = capacity * (result - solid.temperature);
      } else {
        account.initializationEnergyJ = capacity * (previous - solid.temperature);
        account.stepSeconds = dt;
        account.storedEnergyJ = capacity * (result - previous);
        account.heatTransferJ = dt * account.netHeatW;
        account.residualJ = account.storedEnergyJ - account.heatTransferJ;
        account.balanceValid = true;
      }
    }
    if (!std::isfinite(account.initializationEnergyJ)
        || !std::isfinite(account.storedEnergyJ) || !std::isfinite(account.heatTransferJ)
        || !std::isfinite(account.residualJ)) return false;
    solid.candidateTemperature = result;
    solid.candidateAccepted = integrate;
    return true;
  };
  ThermalValid = solve(ThermalWall);
  for (const auto& region : p.regions)
    ThermalValid = solve(*region) && ThermalValid;
  if (!ThermalValid) {
    ThermalGasK = std::numeric_limits<double>::quiet_NaN();
    return;
  }
  const auto commit = [](ThermalSolid& solid) {
    if (solid.candidateAccepted) {
      solid.temperature = solid.candidateTemperature;
      solid.initialized = true;
      solid.warmPending = false;
    }
    solid.heat = solid.candidateHeat;
  };
  commit(ThermalWall);
  for (const auto& region : p.regions) commit(*region);
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

bool FGTurbine::Load(FGFDMExec* exec, Element *el)
{
  // Parse and validate constants before engine properties are tied: a rejected
  // model must not leave bindings to an engine that failed construction.
  LoadThermal(exec, el);
  Element* function_element = el->FindElement("function");

  while(function_element) {
    string name = function_element->GetAttributeValue("name");
    if (name == "IdleThrust" || name == "MilThrust" || name == "AugThrust"
        || name == "Injection" || name == "N1SpoolUp" || name == "N1SpoolDown"
        || name == "N2SpoolUp" || name == "N2SpoolDown")
      function_element->SetAttributeValue("name", string("propulsion/engine[#]/") + name);

    function_element = el->FindNextElement("function");
  }

  // Reject a bad value before FGEngine::Load ties engine properties: throwing
  // after that leaves the ties behind for an engine that is never constructed.
  bool idleFuelFlowConfigured = false;
  if (Element* idleFF = el->FindElement("idlefuelflow")) {
    IdleFF = el->FindElementValueAsNumber("idlefuelflow");
    if (IdleFF < 0.0) {
      XMLLogException err(idleFF);
      err << "<idlefuelflow> is a fuel flow in lbm/hr and cannot be negative.\n";
      throw err;
    }
    idleFuelFlowConfigured = true;
  }

  FGEngine::Load(exec, el);

  ResetToIC();

  if (el->FindElement("milthrust"))
    MilThrust = el->FindElementValueAsNumberConvertTo("milthrust","LBS");
  if (el->FindElement("maxthrust"))
    MaxThrust = el->FindElementValueAsNumberConvertTo("maxthrust","LBS");
  if (el->FindElement("bypassratio"))
    BypassRatio = el->FindElementValueAsNumber("bypassratio");
  if (el->FindElement("bleed"))
    BleedDemand = el->FindElementValueAsNumber("bleed");
  if (el->FindElement("ignitionn1"))
    IgnitionN1 = el->FindElementValueAsNumber("ignitionn1");
  if (el->FindElement("ignitionn2"))
    IgnitionN2 = el->FindElementValueAsNumber("ignitionn2");
  if (el->FindElement("idlen1"))
    IdleN1 = el->FindElementValueAsNumber("idlen1");
  if (el->FindElement("idlen2"))
    IdleN2 = el->FindElementValueAsNumber("idlen2");
  if (el->FindElement("maxn1"))
    MaxN1 = el->FindElementValueAsNumber("maxn1");
  if (el->FindElement("maxn2"))
    MaxN2 = el->FindElementValueAsNumber("maxn2");
  if (el->FindElement("n1spinup"))
    N1_spinup = el->FindElementValueAsNumber("n1spinup");
  if (el->FindElement("n2spinup"))
    N2_spinup = el->FindElementValueAsNumber("n2spinup");
  if (el->FindElement("n1startrate"))
    N1_start_rate = el->FindElementValueAsNumber("n1startrate");
  if (el->FindElement("n2startrate"))
    N2_start_rate = el->FindElementValueAsNumber("n2startrate");
  if (el->FindElement("n1spindown"))
    N1_spindown = el->FindElementValueAsNumber("n1spindown");
  if (el->FindElement("n2spindown"))
    N2_spindown = el->FindElementValueAsNumber("n2spindown");
  if (el->FindElement("augmented"))
    Augmented = (int)el->FindElementValueAsNumber("augmented");
  if (el->FindElement("augmethod"))
    AugMethod = (int)el->FindElementValueAsNumber("augmethod");
  if (el->FindElement("injected"))
    Injected = (int)el->FindElementValueAsNumber("injected");
  if (el->FindElement("injection-time")){
    InjectionTime = el->FindElementValueAsNumber("injection-time");
    InjWaterNorm =1.0;
  }
  if (el->FindElement("injection-N1-inc"))
    InjN1increment = el->FindElementValueAsNumber("injection-N1-inc");
  if (el->FindElement("injection-N2-inc"))
    InjN2increment = el->FindElementValueAsNumber("injection-N2-inc");
  if (el->FindElement("disable-windmill"))
    disableWindmill = el->FindElementValueAsBoolean("disable-windmill");
  string property_prefix = CreateIndexedPropertyName("propulsion/engine", EngineNumber);

  IdleThrustLookup = GetPreFunction(property_prefix+"/IdleThrust");
  MilThrustLookup = GetPreFunction(property_prefix+"/MilThrust");
  MaxThrustLookup = GetPreFunction(property_prefix+"/AugThrust");
  InjectionLookup = GetPreFunction(property_prefix+"/Injection");

  JSBSim::Element* tsfcElement = el->FindElement("tsfc");
  if (tsfcElement) {
    string value = tsfcElement->GetDataLine();
    try {
      TSFC = std::make_unique<FGSimplifiedTSFC>(this, atof_locale_c(value));
    } catch (InvalidNumber&) {
      TSFC = std::make_unique<FGFunction>(FDMExec, tsfcElement, to_string(EngineNumber));
    }
  }

  JSBSim::Element* atsfcElement = el->FindElement("atsfc");
  if (atsfcElement) {
    string value = atsfcElement->GetDataLine();
    try {
      ATSFC = std::make_unique<FGRealValue>(atof_locale_c(value));
    } catch (InvalidNumber&) {
      ATSFC = std::make_unique<FGFunction>(FDMExec, atsfcElement, to_string((int)EngineNumber));
    }
  }

  // Pre-calculations and initializations
  N1SpoolUp = GetPreFunction(property_prefix+"/N1SpoolUp");
  if (!N1SpoolUp)
    N1SpoolUp = std::make_shared<FGSpoolUp>(this, BypassRatio, 1.0);

  N1SpoolDown = GetPreFunction(property_prefix+"/N1SpoolDown");
  if (!N1SpoolDown)
    N1SpoolDown = std::make_shared<FGSpoolUp>(this, BypassRatio, 2.4);

  N2SpoolUp = GetPreFunction(property_prefix+"/N2SpoolUp");
  if (!N2SpoolUp)
    N2SpoolUp = std::make_shared<FGSpoolUp>(this, BypassRatio, 1.0);

  N2SpoolDown = GetPreFunction(property_prefix+"/N2SpoolDown");
  if (!N2SpoolDown)
    N2SpoolDown = std::make_shared<FGSpoolUp>(this, BypassRatio, 3.0);

  N1_factor = MaxN1 - IdleN1;
  N2_factor = MaxN2 - IdleN2;
  OilTemp_degK = in.TAT_c + 273.0;
  // Idle fuel flow floors every operating point and is what a spooling engine
  // seeks, so a wrong value shows up across the whole throttle range. The
  // fallback below is a thrust-only estimate that cannot know the engine's
  // actual idle schedule; <idlefuelflow> lets a model supply a measured one.
  if (!idleFuelFlowConfigured)
    IdleFF = pow(MilThrust, 0.2) * 107.0;  // just an estimate

  bindmodel(exec->GetPropertyManager().get());
  return true;
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

string FGTurbine::GetEngineLabels(const string& delimiter)
{
  std::ostringstream buf;

  buf << Name << "_N1[" << EngineNumber << "]" << delimiter
      << Name << "_N2[" << EngineNumber << "]" << delimiter
      << Thruster->GetThrusterLabels(EngineNumber, delimiter);

  return buf.str();
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

string FGTurbine::GetEngineValues(const string& delimiter)
{
  std::ostringstream buf;

  buf << N1 << delimiter
      << N2 << delimiter
      << Thruster->GetThrusterValues(EngineNumber, delimiter);

  return buf.str();
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

void FGTurbine::bindmodel(FGPropertyManager* PropertyManager)
{
  string property_name, base_property_name;
  base_property_name = CreateIndexedPropertyName("propulsion/engine", EngineNumber);
  property_name = base_property_name + "/n1";
  PropertyManager->Tie( property_name.c_str(), &N1);
  property_name = base_property_name + "/n2";
  PropertyManager->Tie( property_name.c_str(), &N2);
  property_name = base_property_name + "/egt-degc";
  PropertyManager->Tie(property_name.c_str(), this, &FGTurbine::GetEGT);
  property_name = base_property_name + "/augmentation";
  PropertyManager->Tie(property_name.c_str(), this, &FGTurbine::GetAugmentationActive);
  property_name = base_property_name + "/nozzle-pos-norm";
  PropertyManager->Tie(property_name.c_str(), this, &FGTurbine::GetNozzle);
  property_name = base_property_name + "/injection_cmd";
  PropertyManager->Tie( property_name.c_str(), this,
                        &FGTurbine::GetInjection, &FGTurbine::SetInjection);
  property_name = base_property_name + "/seized";
  PropertyManager->Tie( property_name.c_str(), &Seized);
  property_name = base_property_name + "/stalled";
  PropertyManager->Tie( property_name.c_str(), &Stalled);
  property_name = base_property_name + "/bleed-factor";
  PropertyManager->Tie( property_name.c_str(), this, &FGTurbine::GetBleedDemand, &FGTurbine::SetBleedDemand);
  property_name = base_property_name + "/MaxN1";
  PropertyManager->Tie( property_name.c_str(), this,
                        &FGTurbine::GetMaxN1, &FGTurbine::SetMaxN1);
  property_name = base_property_name + "/MaxN2";
  PropertyManager->Tie( property_name.c_str(), this,
                        &FGTurbine::GetMaxN2, &FGTurbine::SetMaxN2);
  property_name = base_property_name + "/InjectionTimer";
  PropertyManager->Tie( property_name.c_str(), this,
                        &FGTurbine::GetInjectionTimer, &FGTurbine::SetInjectionTimer);
  property_name = base_property_name + "/InjWaterNorm";
  PropertyManager->Tie( property_name.c_str(), this,
                        &FGTurbine::GetInjWaterNorm, &FGTurbine::SetInjWaterNorm);
  property_name = base_property_name + "/InjN1increment";
  PropertyManager->Tie( property_name.c_str(), this,
                        &FGTurbine::GetInjN1increment, &FGTurbine::SetInjN1increment);
  property_name = base_property_name + "/InjN2increment";
  PropertyManager->Tie( property_name.c_str(), this,
                        &FGTurbine::GetInjN2increment, &FGTurbine::SetInjN2increment);
  property_name = base_property_name + "/atsfc";
  PropertyManager->Tie(property_name.c_str(), ATSFC.get(), &FGParameter::GetValue);
  property_name = base_property_name + "/tsfc";
  PropertyManager->Tie(property_name.c_str(), &correctedTSFC);
  auto node = PropertyManager->GetNode(property_name.c_str(), false);
  node->setAttribute(SGPropertyNode::WRITE, false);
  if (Thermal) {
    const string thermal = base_property_name + "/thermal/";
    PropertyManager->Tie(thermal + "nozzle-gas-temperature-k", this,
                         &FGTurbine::GetNozzleGasTemperatureK);
    PropertyManager->Tie(thermal + "metal-temperature-k", this,
                         &FGTurbine::GetMetalTemperatureK);
    PropertyManager->Tie(thermal + "metal-temperature-state-k", this,
                         &FGTurbine::GetMetalTemperatureK,
                         &FGTurbine::SetMetalTemperatureStateK);
    PropertyManager->Tie(thermal + "initialized", this,
                         &FGTurbine::GetThermalInitialized);
    PropertyManager->Tie(thermal + "valid", this, &FGTurbine::GetThermalValid);
    PropertyManager->Tie(thermal + "afterburner-fuel-flow-kg-sec", this,
                         &FGTurbine::GetAfterburnerFuelFlowKgSec);
    PropertyManager->Tie(thermal + "afterburner-burned-fuel-flow-kg-sec", this,
                         &FGTurbine::GetAfterburnerBurnedFuelFlowKgSec);
    const auto bindHeat = [&](const string& base, ThermalSolid& solid) {
      const auto bindValue = [&](const string& name, double* value) {
        PropertyManager->Tie(base + name, value);
        PropertyManager->GetNode(base + name, false)->setAttribute(SGPropertyNode::WRITE, false);
      };
      auto& heat = solid.heat;
      bindValue("gas-bath-temperature-k", &heat.gasBathK);
      bindValue("coolant-bath-temperature-k", &heat.coolantBathK);
      bindValue("surroundings-bath-temperature-k", &heat.surroundingsBathK);
      bindValue("heat-capacity-j-k", &heat.capacity);
      bindValue("gas-heat-flow-w", &heat.gasHeatW);
      bindValue("coolant-heat-flow-w", &heat.coolantHeatW);
      bindValue("surroundings-radiation-heat-flow-w", &heat.surroundingsHeatW);
      bindValue("flame-radiation-heat-flow-w", &heat.flameHeatW);
      bindValue("net-heat-flow-w", &heat.netHeatW);
      bindValue("step-seconds", &heat.stepSeconds);
      bindValue("step-stored-energy-j", &heat.storedEnergyJ);
      bindValue("step-heat-transfer-j", &heat.heatTransferJ);
      bindValue("step-energy-residual-j", &heat.residualJ);
      bindValue("initialization-energy-j", &heat.initializationEnergyJ);
      PropertyManager->Tie(base + "heat-balance-valid", &heat.balanceValid);
      PropertyManager->GetNode(base + "heat-balance-valid", false)->setAttribute(SGPropertyNode::WRITE, false);
    };
    bindHeat(thermal, ThermalWall);
    for (auto& region : Thermal->regions) {
      const string base = thermal + region->name + "/";
      bindHeat(base, *region);
      PropertyManager->Tie(base + "metal-temperature-k", region.get(),
                           &ThermalSolid::GetTemperature);
      PropertyManager->Tie(base + "metal-temperature-state-k", region.get(),
                           &ThermalSolid::GetTemperature, &ThermalSolid::SetTemperature);
      PropertyManager->Tie(base + "initialized", region.get(),
                           &ThermalSolid::GetInitialized);
    }
  }
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

int FGTurbine::InitRunning(void)
{
  // This shortcut requests a warm initial operating point only before thermal
  // evolution/restoration. Seed on the first real step, after final IC inputs;
  // GetSteadyState's artificial trim dt must not age or initialize the wall.
  if (Thermal) {
    if (!ThermalWall.initialized) ThermalWall.warmPending = true;
    for (auto& region : Thermal->regions)
      if (!region->initialized) region->warmPending = true;
  }
  FDMExec->SuspendIntegration();
  Cutoff=false;
  Running=true;
  N1_factor = MaxN1 - IdleN1;
  N2_factor = MaxN2 - IdleN2;
  N2 = IdleN2 + ThrottlePos * N2_factor;
  N1 = IdleN1 + ThrottlePos * N1_factor;
  Calculate();
  FDMExec->ResumeIntegration();
  return phase=tpRun;
}

//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
//    The bitmasked value choices are as follows:
//    unset: In this case (the default) JSBSim would only print
//       out the normally expected messages, essentially echoing
//       the config files as they are read. If the environment
//       variable is not set, debug_lvl is set to 1 internally
//    0: This requests JSBSim not to output any messages
//       whatsoever.
//    1: This value explicity requests the normal JSBSim
//       startup messages
//    2: This value asks for a message to be printed out when
//       a class is instantiated
//    4: When this value is set, a message is displayed when a
//       FGModel object executes its Run() method
//    8: When this value is set, various runtime state variables
//       are printed out periodically
//    16: When set various parameters are sanity checked and
//       a message is printed out when they go out of bounds

void FGTurbine::Debug(int from)
{
  if (debug_lvl <= 0) return;

  if (debug_lvl & 1) { // Standard console startup message output
    if (from == 0) { // Constructor

    }
    if (from == 2) { // called from Load()
      FGLogging log(LogLevel::DEBUG);
      log << "\n    Engine Name: "         << Name << "\n";
      log << "      MilThrust:   "         << MilThrust << "\n";
      log << "      MaxThrust:   "         << MaxThrust << "\n";
      log << "      BypassRatio: "         << BypassRatio << "\n";
      log << "      TSFC:        "         << TSFC->GetValue() << "\n";
      log << "      ATSFC:       "         << ATSFC->GetValue() << "\n";
      log << "      IdleN1:      "         << IdleN1 << "\n";
      log << "      IdleN2:      "         << IdleN2 << "\n";
      log << "      MaxN1:       "         << MaxN1 << "\n";
      log << "      MaxN2:       "         << MaxN2 << "\n";
      log << "      Augmented:   "         << Augmented << "\n";
      log << "      AugMethod:   "         << AugMethod << "\n";
      log << "      Injected:    "         << Injected << "\n";
      log << "      MinThrottle: "         << MinThrottle << "\n";
      log << "\n";
    }
  }
  if (debug_lvl & 2 ) { // Instantiation/Destruction notification
    FGLogging log(LogLevel::DEBUG);
    if (from == 0) log << "Instantiated: FGTurbine\n";
    if (from == 1) log << "Destroyed:    FGTurbine\n";
  }
  if (debug_lvl & 4 ) { // Run() method entry print for FGModel-derived objects
  }
  if (debug_lvl & 8 ) { // Runtime state variables
  }
  if (debug_lvl & 16) { // Sanity checking
  }
  if (debug_lvl & 64) {
    if (from == 0) { // Constructor
    }
  }
}
}
