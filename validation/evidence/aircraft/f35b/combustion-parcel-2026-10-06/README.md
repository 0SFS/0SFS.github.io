# Conditional combustion-parcel optical data

Recorded 2026-10-06. This is a numerical and source-model qualification, **not
an F135 calibration, rendered appearance acceptance or GPU performance result**.

The [generator and physical contract](../../../../../scripts/exhaustOptics/combustion/README.md)
describe the sourced CH(A) production/quenching model, assumed n-dodecane parcel
and declared 431 nm spectral reduction. The compact
[runtime table](ndodecane-ch-a-parcel.json) contains 32 cases. Per-case JSON files
retain every adaptive solver step's temperature and both rate-set emission
predictions. Their source data are identical to the distributed bake table.
Generator/checker source snapshots and dependency versions are retained here.

The grid spans 600–1200 K, 0.2–5 atm, phi 0.8/1.0, with an explicitly assumed
15 mol% oxygen oxidizer diluted with complete combustion products. It gives
0.843–510.835 J/kg of converted parent fuel in the modeled CH(A) channel. At
1000 K / 3 atm / phi 1, the Carl result is 10.8044 J/kg and Peeters is 10.8992
J/kg, with 2347.05 K hot products. These are model predictions, not measured
F135 light yields or gas temperatures.

[Numerical checks](numerical-checks.json):

- Selected reruns tightened solver relative tolerance from 10⁻⁹ to 10⁻¹¹.
  Maximum CH yield difference was 0.000302%.
- Three independent off-grid parcel runs compared with linear temperature/phi,
  logarithmic pressure and logarithmic positive-yield interpolation. The largest
  sampled yield difference was 6.80%; product temperature difference was 1.32%.
  These are sampled errors, not a global interpolation bound.
- Maximum local enthalpy residual over all 32 runs was 0.0775 J/kg, with element
  mass-fraction residual below 8.52 × 10⁻¹³. This qualifies the isolated adiabatic
  parcel's integration; it does not close a full engine or renderer's energy
  budget.
- All CH yields are below 1.18 × 10⁻⁵ of the assumed 43.3 MJ/kg fuel energy.
  This is a check on a rate-derived source, not its chosen amplitude.
- Carl/Peeters predictions differ by up to a factor of 4.286 across the grid.
  Missing flow, fuel composition and quenching uncertainties are additional.

The CH pulse and parcel autoignition delay are retained separately. Runtime
must condition light on already-burned native fuel and must not replay this
homogeneous parcel's ignition delay. Low-temperature, low-pressure parcels can
autoignite far more slowly than an established, flameholder-stabilized engine.

Only focused offline calculations and whitespace checks were run by this
subtask. No browser, GPU, native SDK build or full application suite was run.
