# Retained validation evidence

`evidence/<topic>/` holds the records that documents cite as the basis for a
claim: measurements, logs, API snapshots, provenance, adoption records and
rollback snapshots. They are tracked so a clone can check a claim without the
gitignored `build/` scratch tree.

These files are frozen. They are excluded from lint and are not part of the
typecheck or test inputs, and the rollback `package.json` files are snapshots,
not packages to install. Do not use this directory as a default output
directory; new runs write to a dated `build/` folder, and only selected
records are copied here.

Where things belong is set by the [validation layout](../docs/validation/layout.md):
runnable tools are in `scripts/validation/`, and explanations are in `docs/`.
This tree was at `docs/validation/evidence/` until 2026-09-19; the
[relocation record](../docs/validation/evidence-relocation-2026-09-19.md) maps
the old prefix that older records cite.
