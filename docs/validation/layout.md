# Validation files: where they belong

Decision: 2026-09-19. Organize by purpose, not just file extension.

| Purpose | Home |
| --- | --- |
| Specifications, plans, interpretation and human-facing validation summaries | `docs/`, including `docs/validation/` |
| Retained measurements, logs, API snapshots, provenance and rollback snapshots | Top-level `validation/evidence/<topic>/` |
| Runnable downstream validation/reproduction tools | `scripts/validation/<topic>/` (existing audio benchmark tools stay in `benchmarks/audio/`) |
| Permanent engine regression tests | JSBSim `tests/` and `tests/unit_tests/` |
| Disposable helpers, generated fixtures, binaries and raw run output | Owning repository's gitignored `build/` (what may stay: [build-scratch.md](../build-scratch.md)) |

`validation/evidence/` is deliberately retained in version control. It is
neither application source nor a build output directory. Preserve selected
records there so another checkout can inspect the basis for a claim. Do not
put every run there, use it as a default output directory, or ignore it in Git.
New run output uses a dated build directory; 0sfs Node tools use
`scripts/outputDirectory.mjs`. JSBSim simulations use JSBSim `build/`.

Examples:

- The fetched PR snapshot belongs at
  `validation/evidence/jsbsim/wheel-spin-review/pr.json`.
- A preserved release lock belongs at
  `validation/evidence/jsbsim/rollback/fork1/package-lock.json`.
- The offline audio measurement belongs at
  `validation/evidence/audio/offline-sweep-proxy-2026-09-16.json`.
- Its interpretation/limitations belong in a document such as
  `docs/validation/audio-implementation-ledger.md`, linking to the data.

An evidence directory may have a README or a frozen review record describing
its files. Keep these with the records they explain. A rollback source
snapshot is an artifact, not executable tooling; preserve it alongside its
manifest and lock. Exclude these frozen records from lint/typecheck inputs.
Do not install dependencies in rollback directories or treat their manifests
as active packages.

The previous `docs/validation/evidence/` tree was relocated to
`validation/evidence/` as one tree on 2026-09-19, preserving its internal
paths; the [evidence relocation record](evidence-relocation-2026-09-19.md)
maps the old prefix. Do not recreate it or leave copies, symlinks or
executable stubs there. Machine records and approved historical review
records stayed byte-identical. Active links and reproduction instructions
were updated; older records, historical commands and local approval receipts
keep the old prefix. An updated command path is a reproduction instruction,
not evidence that the command was run again.

This supersedes both the original script-beside-logs convention and the
intermediate convention that left results under docs after moving tools.
The [evidence relocation handoff](relocate-evidence.md) covered the mechanical
move; it did not approve a JSBSim implementation task.
