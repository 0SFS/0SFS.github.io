#!/usr/bin/env python3
"""Add read-only turbine dispatch counters to a scratch JSBSim source tree.

Stage-1 characterization instrumentation only. Never applied to a production
branch; every build made with it is labelled `diag` in the report.
"""
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
hdr = root / "src/models/propulsion/FGTurbine.h"
src = root / "src/models/propulsion/FGTurbine.cpp"

h = hdr.read_text()
anchor = "  double InjN2increment;\n"
assert h.count(anchor) == 1, "header anchor"
h = h.replace(anchor, anchor + """
  // --- stage-1 scratch diagnostics (characterization builds only) ---
  int DiagPhase = 0;
  double DiagEngineDT = 0.0;
  double DiagExecDT = 0.0;
  double DiagTrimStatus = 0.0;
  double DiagCalcCount = 0.0;
  double DiagPhaseCount[7] = {0,0,0,0,0,0,0};
  double DiagTSFCEvals = 0.0;
  double DiagATSFCEvals = 0.0;
  double EvalTSFC(void) { DiagTSFCEvals += 1.0; return TSFC->GetValue(); }
  double EvalATSFC(void) { DiagATSFCEvals += 1.0; return ATSFC->GetValue(); }
  // --- end stage-1 scratch diagnostics ---
""")
hdr.write_text(h)

s = src.read_text()

# count every TSFC/ATSFC evaluation the engine itself performs
n_tsfc = s.count("TSFC->GetValue()")
s = s.replace("correctedTSFC = TSFC->GetValue();", "correctedTSFC = EvalTSFC();")
s = s.replace("ATSFC->GetValue()", "EvalATSFC()")
# put the Debug() report back on the real parameters so logging is not counted
s = s.replace('log << "      TSFC:        "         << EvalTSFC()',
              'log << "      TSFC:        "         << TSFC->GetValue()')
s = s.replace('log << "      ATSFC:       "         << EvalATSFC()',
              'log << "      ATSFC:       "         << ATSFC->GetValue()')

anchor = "  RunPreFunctions();\n\n  ThrottlePos = in.ThrottlePos[EngineNumber];"
assert s.count(anchor) == 1, "Calculate anchor"
s = s.replace(anchor, """  RunPreFunctions();

  DiagCalcCount += 1.0;
  DiagEngineDT = in.TotalDeltaT;
  DiagExecDT = FDMExec->GetDeltaT();
  DiagTrimStatus = FDMExec->GetTrimStatus() ? 1.0 : 0.0;

  ThrottlePos = in.ThrottlePos[EngineNumber];""")

anchor = "  switch (phase) {\n    case tpOff:"
assert s.count(anchor) == 1, "dispatch anchor"
s = s.replace(anchor, """  DiagPhase = (int)phase;
  if (DiagPhase >= 0 && DiagPhase < 7) DiagPhaseCount[DiagPhase] += 1.0;

  switch (phase) {
    case tpOff:""")

anchor = '  property_name = base_property_name + "/n1";'
assert s.count(anchor) == 1, "bindmodel anchor"
s = s.replace(anchor, """  property_name = base_property_name + "/diag-phase";
  PropertyManager->Tie( property_name.c_str(), &DiagPhase);
  property_name = base_property_name + "/diag-engine-dt";
  PropertyManager->Tie( property_name.c_str(), &DiagEngineDT);
  property_name = base_property_name + "/diag-exec-dt";
  PropertyManager->Tie( property_name.c_str(), &DiagExecDT);
  property_name = base_property_name + "/diag-trim-status";
  PropertyManager->Tie( property_name.c_str(), &DiagTrimStatus);
  property_name = base_property_name + "/diag-calc-count";
  PropertyManager->Tie( property_name.c_str(), &DiagCalcCount);
  property_name = base_property_name + "/diag-count-off";
  PropertyManager->Tie( property_name.c_str(), &DiagPhaseCount[0]);
  property_name = base_property_name + "/diag-count-run";
  PropertyManager->Tie( property_name.c_str(), &DiagPhaseCount[1]);
  property_name = base_property_name + "/diag-count-spinup";
  PropertyManager->Tie( property_name.c_str(), &DiagPhaseCount[2]);
  property_name = base_property_name + "/diag-count-start";
  PropertyManager->Tie( property_name.c_str(), &DiagPhaseCount[3]);
  property_name = base_property_name + "/diag-count-stall";
  PropertyManager->Tie( property_name.c_str(), &DiagPhaseCount[4]);
  property_name = base_property_name + "/diag-count-seize";
  PropertyManager->Tie( property_name.c_str(), &DiagPhaseCount[5]);
  property_name = base_property_name + "/diag-count-trim";
  PropertyManager->Tie( property_name.c_str(), &DiagPhaseCount[6]);
  property_name = base_property_name + "/diag-n2norm";
  PropertyManager->Tie( property_name.c_str(), &N2norm);
  property_name = base_property_name + "/diag-n1-factor";
  PropertyManager->Tie( property_name.c_str(), &N1_factor);
  property_name = base_property_name + "/diag-n2-factor";
  PropertyManager->Tie( property_name.c_str(), &N2_factor);
  property_name = base_property_name + "/diag-idle-ff";
  PropertyManager->Tie( property_name.c_str(), &IdleFF);
  property_name = base_property_name + "/diag-fuelflow-pph";
  PropertyManager->Tie( property_name.c_str(), &FuelFlow_pph);
  property_name = base_property_name + "/diag-cutoff";
  PropertyManager->Tie( property_name.c_str(), &Cutoff);
  property_name = base_property_name + "/diag-egt";
  PropertyManager->Tie( property_name.c_str(), &EGT_degC);
  property_name = base_property_name + "/diag-oil-temp";
  PropertyManager->Tie( property_name.c_str(), &OilTemp_degK);
  property_name = base_property_name + "/diag-nozzle";
  PropertyManager->Tie( property_name.c_str(), &NozzlePosition);
  property_name = base_property_name + "/diag-tsfc-evals";
  PropertyManager->Tie( property_name.c_str(), &DiagTSFCEvals);
  property_name = base_property_name + "/diag-atsfc-evals";
  PropertyManager->Tie( property_name.c_str(), &DiagATSFCEvals);
""" + anchor)

src.write_text(s)
print(f"instrumented {root}: TSFC->GetValue() call sites seen = {n_tsfc}")
