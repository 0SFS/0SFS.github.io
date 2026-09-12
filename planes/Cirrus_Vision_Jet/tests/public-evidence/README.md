# SF50 public evidence corpus

Collected 2026-09-12. This is an evidence corpus, not an operational aircraft manual or a validated flight model.

- manifest.json pins 47 original source artifacts by URL, SHA-256 and byte count.
- evidence-snapshot.json preserves source coverage, recorder data quality and 24 source-to-source distance comparisons.
- cen21-response-candidate.json preserves 450 source records and candidate spool-response observations. It is not an approved aircraft-validation oracle.
- raw/ contains the downloaded artifacts on this machine, including 37 G1 performance CSVs, two recorder CSVs, reference PDFs and the SF50-TOLD MIT notice.
- raw/ and derived/ are ignored by Git. Public availability is not permission to redistribute all underlying documents.
- SF50-TOLD commit: 3a6fa1853e67a221a7613ba3523c59886d7d0cab. Its software license does not by itself settle underlying AFM rights or revision applicability.

Run the collector into a NEW directory to reproduce the pinned originals. Run the analyzer into a NEW directory for offline normalization and source comparison. See docs/validation/sf50-public-data-acquisition.md for commands, limitations and open questions.

The offline analyzer completed successfully against manifest.json, and 42 focused tests passed in seven files (Node v26.8.2, Vitest 4.1.6). The network collector was not run. No simulated aircraft runs or coefficient changes were made during the expanded audit. The original snapshot remains historical.

Supplementary artifacts:
- public-audit-manifest.json records 34 additional source/navigation snapshots and failed attempts. Together with the baseline there are 81 local artifacts totaling 200,995,197 bytes.
- primary-afm-expanded-candidates.json retains 640 cruise and 180 integrated-climb rows. These are automatically extracted, page-cited candidates, not visually approved golden targets.
- public-audit-findings.json records the applicability decisions, search coverage and unresolved gates.
- public-audit-test-results.json records actual analyzer scope and focused-test outcomes.
- public-audit-recorder-review.json retains the partial research inventory and its explicit WPR header limitation.
- derived/public-audit-2026-09-12/ retains analyzer outputs, the full Vitest report and processed public-flight chart arrays. These are ignored by Git, as is raw/.

The existing collector/analyzer still use the original manifest.json. They do not automatically reacquire or normalize the supplement. Dynamic navigation/flight pages are snapshot evidence and may not reproduce byte-for-byte on another visit. Do not change hashes automatically to make reacquisition pass. See docs/validation/sf50-public-data-audit-2026-09-12.md for remaining acquisition/qualification work.

Normal operation, exact configuration/loading, source-revision reconciliation, channel update behavior and independent validation remain unresolved. No owner was contacted and no subscription was purchased.


## Generation-aware calibration inputs

- `variant-manifest.json` pins 16 selected G2/G2+ CSVs and four Cirrus generation/specification page snapshots, separately from the earlier acquisition manifests.
- `calibration-input-manifest.json` pins the automatically extracted primary AFM rows and public-dashboard arrays. Matching their hashes does not approve the transcription.
- `scripts/process-sf50-calibration-data.mjs` is the new offline processor for the expanded corpus. The older collector/analyzer retain their original scope.
- `variant-processing-summary.json` records the implementation run, including any blocked stages. Full outputs are under ignored `derived/variant-calibration-2026-09-12-v1/`.
- Do not treat G2+ source tables as G2 or G3 targets. Do not treat same-AFM ISA+10 check rows as an independent flight-data holdout.

See `docs/validation/sf50-variant-models.md` for output schemas, actual applied model inputs, generation coverage and remaining qualification work. Raw-source and dashboard redistribution permission remains unresolved.
