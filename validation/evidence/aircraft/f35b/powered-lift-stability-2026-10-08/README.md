# Powered-lift evidence — 2026-10-08

These are explicit CPU fixtures, not a capture of the user's oscillating session.
The reported full-conversion cycle remains unreproduced. Read the
[investigation record](../../../../../docs/validation/f135-powered-lift-stability-2026-10-08.md)
for admission gates, ownership, force/load interpretation and remaining work.

- `physics/` retains complete report receipts, executed helper bundles, input
  snapshots and lossless per-step trace archives. Its README explains selection,
  source limitations and restoration. Original channels and sample precision are
  preserved; the archive representation changes only storage.
- [before-analysis.json](before-analysis.json), [after-analysis.json](after-analysis.json)
  and [component-analysis.json](component-analysis.json) reconstruct signed forces,
  moments, load/CG, energy and available mass terms, with explicit held/free/contact
  qualification. Their original `build/` paths are provenance, not distributed
  reader-accessible files. Use physics receipts for retained trace access.
- [comparison.json](comparison.json) records matched source/algorithm/timestep
  differences. [refinement-analysis.json](refinement-analysis.json) independently
  analyzes the corrected FCS-clock cases. [fixed-hover-analysis.json](fixed-hover-analysis.json) is the
  declared free but frozen-fuel isolation, not a stationary-hover claim.
  [rotating-hover-analysis.json](rotating-hover-analysis.json) separately qualifies
  the Earth-relative zero-vertical-acceleration initialization against predeclared
  engineering hover gates.
- [optics/README.md](optics/README.md) describes exact evaluator inputs and outputs,
  frozen-PPS failure, table-domain clamps and thermal drift. No rendered luminance,
  carrier-footage match or device acceptance is claimed.
- `checks/` preserves before/adoption/final logs, including failed and stopped
  attempts. The completed full app CI had one Engine-help test failure; its
  targeted file rerun passed, and production build passed separately.

Native/SDK identities, native contract and native check logs are in the
[fork.21 adoption](../../../jsbsim/adoption/fork21/adoption.json). Fork.21 corrects
accepted-flow and diagnostic publication; physical/controller equations and
F135/FCS data are unchanged. The optical fixed-fuel running-source defect is
reproduced and corrected independently of the reported flight cycle.

`methods/` retains the final analyzer source as a gzip snapshot. Earlier analysis
receipts preserve their actual analyzer hashes; their earlier source revisions
were not separately captured. `retention.json` hashes every retained artifact.
