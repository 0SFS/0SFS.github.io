# F135 afterburner response: application checkpoint

Recorded 2026-10-06. See the [implementation and limits](../../../../../../docs/validation/f135-exhaust-response.md).
This retains software checks for the conditional reacting-parcel source and the
rendering-work reductions. The user reported improved appearance and usable
performance, with a smaller remaining audio lead. This is not a GPU benchmark,
physical calibration or complete appearance acceptance. The user declined GPU
testing; no browser/GPU run was performed for this checkpoint.

| Retained log | Result and interpretation |
| --- | --- |
| [ci.log](ci.log) | Final `npm run ci`: 174 files, 1,850 passing tests plus one existing expected failure; subsequent build/artifact checks passed. |
| [typecheck-final.log](typecheck-final.log), [lint.log](lint.log) | Incremental final typecheck and lint passed; successful typecheck has empty output. |
| [related.log](related.log) | Initial related run: 791 pass, two stale test expectations fail, 65 files. New EGT/pressure observations and surrogate chemistry status required expectation updates. |
| [corrected-tests.log](corrected-tests.log) | Three corrected files, 58 tests pass. |
| [reaction-final.log](reaction-final.log) | Two final reaction-related files, eight tests pass. |
| [renderer-focused.log](renderer-focused.log) | Initial focused renderer/support run: 45 pass, three failures in two files. Dirty world matrices within one render ID caused stale scale/projected-bounds checks. Preserved verbatim; contains a large Babylon object diff. |
| [renderer-corrected.log](renderer-corrected.log) | Corrected depth/support files: six tests pass. |
| [depth-final.log](depth-final.log) | Four final depth tests pass. |
| [reaction-cache.log](reaction-cache.log) | 36 renderer tests pass after reaction-input cache coverage. |
| [bake-final.log](bake-final.log) | Final regenerated optical artifact identities. Earlier bake/typecheck logs remain retained alongside it. |

[files.json](files.json) records bytes, SHA-256 and original paths for all logs and
16 source snapshots. Every source snapshot ends in `.txt`, including tests, so
retained evidence cannot accidentally join test discovery. These snapshots
identify this checkpoint even if subsequent dry-source work changes live files.
The earlier failing logs describe repaired states and must not be read as final
failures. CI console timing is ordinary check output, not a performance result.

The [32-case parcel record](../../combustion-parcel-2026-10-06/README.md) separately
retains numerical chemistry checks and their uncertainty. No new native SDK,
engine-dynamics run or coupled engine energy qualification is represented here.
