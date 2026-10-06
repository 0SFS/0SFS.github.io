# Spatial optical model and bake checkpoint

These records preserve the physical profile, bake/evaluator source snapshots,
generated artifact identities and focused check logs. The model is explained in
[the spatial-plume report](../../../../../../docs/validation/f135-plume-spatial.md).
`provenance.json` links the inputs and records the exact scope of each check.

The bake is current. The focused check passed 13 tests in three files before the
final resource-default change from 32×16 to shared 64×32 constants; the retained
evaluator snapshot includes that later change. Root's combined acceptance record
provides the final related tests, typecheck, lint and CI result. This earlier log
must not be presented as a test of that subsequent default assertion.

Independent local spectra, complete-field integration, Float32 and source-budget
checks, grid/ray convergence and CPU projections belong to
[the independent spatial-optics record](../spatial-optics/). These checks are not
flight-render appearance qualification. The field remains a provisional,
quasi-steady particle/chemical optical approximation; the dry powered-lift
night-footage mismatch remains unresolved. Previous normalized and uniform
physical optical evidence has not been overwritten.
