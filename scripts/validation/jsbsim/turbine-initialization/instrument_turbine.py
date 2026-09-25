#!/usr/bin/env python3
"""Add read-only turbine diagnostics to a scratch JSBSim source tree.

Stage-1 characterization instrumentation only. It is applied to an unpacked
source archive under the JSBSim repository's gitignored `build/`, never to a
branch, and every build made with it is labelled `diag`/`live` in the report.

Two kinds of property are added, and telling them apart matters when reading
the results:

- **last-dispatch** fields (`diag-phase`, `diag-engine-dt`, `diag-exec-dt`,
  `diag-trim-status`) are latched at the top of `FGTurbine::Calculate()` and
  immediately before its phase dispatch. They describe the most recent engine
  evaluation. After a public call such as `RunIC()` or
  `propulsion/set-running` has returned, they are history: the call may have
  restored the executive or the copied propulsion timestep afterwards;
- **live** fields (`diag-live-*`) read the current value through a
  side-effect-free getter at the moment the property is read. `diag-live-*`
  is what describes the state a caller now has.

The counters (`diag-calc-count`, `diag-count-<phase>`, `diag-tsfc-evals`,
`diag-atsfc-evals`) are cumulative; take differences between samples. The
evaluation counters wrap the engine's own `TSFC`/`ATSFC` call sites, so they
count evaluations rather than merely detecting that one happened, which a
constant `copyto` sentinel cannot do. Reading the tied
`propulsion/engine[n]/atsfc` property still evaluates the parameter, so a
measurement that uses these counters must not read it.

Usage:
  python3 instrument_turbine.py <unpacked-source-root>
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
  // Live, side-effect-free reads of current state, as opposed to the latched
  // last-dispatch fields above.
  double DiagLiveEngineDT(void) const { return in.TotalDeltaT; }
  double DiagLiveExecDT(void) const { return FDMExec->GetDeltaT(); }
  double DiagLiveTrimStatus(void) const { return FDMExec->GetTrimStatus() ? 1.0 : 0.0; }
  double DiagLivePhase(void) const { return (double)phase; }
  double DiagLiveSuspended(void) const { return FDMExec->IntegrationSuspended() ? 1.0 : 0.0; }
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
  property_name = base_property_name + "/diag-live-engine-dt";
  PropertyManager->Tie( property_name.c_str(), this, &FGTurbine::DiagLiveEngineDT);
  property_name = base_property_name + "/diag-live-exec-dt";
  PropertyManager->Tie( property_name.c_str(), this, &FGTurbine::DiagLiveExecDT);
  property_name = base_property_name + "/diag-live-trim-status";
  PropertyManager->Tie( property_name.c_str(), this, &FGTurbine::DiagLiveTrimStatus);
  property_name = base_property_name + "/diag-live-phase";
  PropertyManager->Tie( property_name.c_str(), this, &FGTurbine::DiagLivePhase);
  property_name = base_property_name + "/diag-live-suspended";
  PropertyManager->Tie( property_name.c_str(), this, &FGTurbine::DiagLiveSuspended);
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
assert "DiagLiveEngineDT" in hdr.read_text(), "live probes not applied"
