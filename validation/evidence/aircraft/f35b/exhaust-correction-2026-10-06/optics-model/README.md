# Corrected optical model checkpoint

The active version-2 model uses the imposed native gas-bath proxy directly. It
removes the AB-boolean Mach/opacity/cap switches and the unsupported exterior
chemical-light allocation. Chemistry is reported as unavailable; it is not
claimed physically zero. The [primary-source audit](../source-research/) records
why a replacement fuel fraction or synthetic reacting mixture is not justified.

The shared source field accepts signed interior/exit/exterior geometry, excludes
solid centerbody volume, accounts for oblique-section volume factors, and bounds
the full interpolated source once. Duplicate axial stations represent geometric
steps. Upstream source values continue the exit boundary as an explicit
homogeneous hypothesis. No gas dynamics, hotter particle reservoir, chemistry
state or temporal fade was added to the application.

`provenance.json` records source/generated identities, the exact check commands
and their limits. The focused run passed **15 tests in three files**; targeted
lint and the deterministic bake passed. Tests include a frozen version-1 profile
so previous numerical/appearance evidence remains reproducible, and test the
new mode invariance, unavailable status, annular volume and exit continuity.
That focused run preceded the final exterior-only light-integral addition.
The final source snapshots and bake log are retained separately; independent
diagnostics cover them, and final related/CI must cover the added assertions.
Earlier snapshots and logs remain unchanged. Final integration checks are
separate records.

The runtime source is still a provisional particle approximation. A correct
integral cannot establish an accurate F135 source, and removal of unsupported
chemistry does not complete the user's requested dry/AB appearance objective.
No flight-render rear/oblique daylight/night comparison is qualified here.

The final efficiency-only cache revision is retained in separately named
`engineGasOptics-cached*` snapshots. It reuses unchanged geometry quadrature
weights across thermal/fuel changes, with one bounded entry per live profile.
The independent numerical snapshot predates this cache; its source formulas are
identical. Cache reuse/invalidation assertions belong to root’s final related
suite, not the earlier 15-test focused run.
