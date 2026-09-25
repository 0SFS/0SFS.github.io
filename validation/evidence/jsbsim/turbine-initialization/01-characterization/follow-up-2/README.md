# Stage 1 second follow-up records

2026-09-20, after the
[follow-up review](../../../../../../docs/turbine-initialization/reports/01-follow-up-review.md).
That review accepted the characterization and the evidence and asked for five
contract groups to be closed, adding a focused probe only where source reading
and the existing records could not settle a factual question. Three questions
met that bar; everything else in this round was resolved by reading the source
and by re-reading records already retained.

The records in the parent directory and in [`follow-up/`](../follow-up/) are
unchanged. Nothing here changed production behaviour: the JSBSim checkout
stayed clean on `candidate/pr1508-off-engine-fuel` at `482da811`, no build was
made, no branch was created or moved, nothing was pushed and nothing was
posted.

| File | What it is |
| --- | --- |
| `probes.md` | the three probes as tables, with what each one settles |
| `probes.json` | the same probes, machine readable, both builds |
| `provenance.json` | the reused binaries and their hashes, the tool hash, the traced source hashes, the exact command and the agreement between the two builds |

## The three questions

1. **What does `RunIC()` seed the integrator derivative history with?** The
   completion sequence in the decisions omitted a refresh of the propagation
   inputs before `InitializeDerivatives()`. Source order says the seeded value
   is one model pass stale; the probe shows the gap is 29.6 ft/s² in `udot` on
   an ordinary throttle change, so it is not a rounding-level concern.
2. **Which runtime writes survive a scenario reset?** The restore rules needed
   "absent override" to mean a defined configuration value. The probe shows
   today's reset keeps `MaxN1`, `MaxN2`, `BleedDemand` and the thruster
   orientation while zeroing the injection increments, the remaining water,
   the acting location and the reverser angle — so the engine does not keep a
   configured value to fall back to, and a cold operation has to define each
   field itself.
3. **Does refilling the tanks while fuel freeze is on clear starvation?** No.
   The restart fails on 2000 lb of usable fuel until one unfrozen frame runs.
   This is the measurement behind dropping the "stale starvation is not stale"
   claim.

## Reuse

Both binaries are the ones already verified in
[`follow-up/provenance.json`](../follow-up/provenance.json), by hash. The three
new probes are subcommands of the existing
`scripts/validation/jsbsim/turbine-initialization/engine_probes.py`; no
existing probe was edited, so the earlier probes still reproduce
[`follow-up/probes.json`](../follow-up/probes.json) from the same binaries.
