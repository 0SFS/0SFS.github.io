# Preserved posed run with incomplete AB inputs

This run fixed non-indexed hardware handling and includes 24,024 actual opaque
triangles per pose, but it omitted `upstreamGasTemperatureKelvin` and
`ambientPressurePascal`. The current AB parcel and two-temperature distribution
therefore did not activate. Its AB ray errors do not qualify the complete
current runtime source. Its dry and zero-burned-fuel comparisons remain valid
for the declared input contract.

The original `report.json`, log and source snapshots are preserved unchanged.
The [complete-input rerun](../posed-rays-complete-inputs/README.md) supersedes
its current-AB qualification and retains explicit parcel-activation assertions.
All zero-burned-fuel radiance and reference results match exactly between the
two runs. Neither record establishes GPU or appearance acceptance.
