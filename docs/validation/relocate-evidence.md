# Handoff: move retained evidence out of docs

**Completed 2026-09-19.** See the [move record](evidence-relocation-2026-09-19.md).
The instructions below are kept as written, so their paths describe the layout
before the move.

This is a user-launched housekeeping task in `/Users/felg/gh/0sfs`, independent
of the JSBSim PR #1502 code review. Do not launch agents or approve/start an
engine task. Read `AGENTS.md` and `docs/validation/layout.md`.

## Goal and scope

Move the entire `docs/validation/evidence/` tree to top-level
`validation/evidence/`, preserving every relative path and retained record.
This includes JSBSim, rollback snapshots and audio evidence. The planner's
inventory on 2026-09-19 found 109 files (3,548,915 bytes): 102 JSBSim and
7 audio. Re-inventory before acting; do not discard newly added evidence.

Examples of exact destinations:

```text
validation/evidence/jsbsim/wheel-spin-review/pr.json
validation/evidence/jsbsim/rollback/fork1/package-lock.json
validation/evidence/audio/offline-sweep-proxy-2026-09-16.json
```

The twelve executable tools have already moved to
`scripts/validation/jsbsim/`; leave them there. Ordinary documents under
`docs/validation/`, such as the audio ledger, stay under docs. Evidence
READMEs and frozen review records travel with the evidence tree.

## Starting state and constraints

Record branch, HEAD and status before editing. The checkout is intentionally
dirty with user work, planner instructions and the previous tool relocation.
Preserve all of it. Do not switch branches, stage, commit, reset, amend,
rebase, push, edit GitHub or write outside 0sfs. Do not edit the JSBSim checkout
or its approval receipts. No server, dependency install or benchmark run.

The task needs no clean-tree gate: this is a reversible move of reviewed
paths. Stop if a destination already contains different content, another
process is changing these files, or the inventory suggests unexpected scope.
Scratch and checking scripts belong in a dated 0sfs `build/` directory.

## Execute

1. Record every source path, size, mode and SHA-256 before the move. Move the
   tree without dropping tracked or untracked files. Do not leave a copy,
   symlink, forwarding file or reconstructed evidence directory under docs.
   Do not add the new evidence root to `.gitignore`.
2. Keep JSON, logs, diffs, hashes, text measurements, rollback snapshots and
   approved task01/task02 review records byte-identical. Keep recorded
   dates, commands, assertions and numerical findings unchanged. The nested
   `package.json` and lockfiles are frozen release snapshots, not packages
   to install or regenerate. Preserve source-snapshot modes too.
3. Update active Markdown links and reproduction commands throughout the
   repository to reach the moved files. This includes PR #1502 plan/prompts,
   task03 README, evidence READMEs, the upstream tracker, JSBSim docs and the
   audio ledger. Recompute relative links from their new parent directory:
   blindly deleting `docs/` from every string is insufficient. Historical
   machine records, copied diffs and archived prose remain unchanged, with
   their old prefix explained by the migration note. If a frozen narrative
   has an old path, list it instead of rewriting its contents.
4. In evidence READMEs distinguish current reproduction instructions from
   executed historical commands. Where a heading says "Commands actually
   verified" but the paths have been modernized, use "Reproduction commands"
   and retain a clear note that recorded runs used the old paths and identical
   tool bytes. Do not imply any rerun occurred.
5. Update `eslint.config.js` global ignore from
   `docs/validation/evidence` to `validation/evidence`; these records are
   excluded because they are frozen data/source snapshots. Keep the rest of
   the lint configuration unchanged. Check other configuration for runtime
   reads of the old prefix; report any beyond this known lint setting before
   changing behavior. The planner found only comment citations in the audio
   source/tests and benchmark tool, not runtime reads.
6. Leave runtime source, tests, DSP, compiled WASM and their provenance
   unchanged. In particular, `src/flight/audio/dsp/core.cpp:717` contains a
   historical evidence-path comment; retain it and list its old-to-new
   mapping. Do not trigger a DSP rebuild just to update that comment.
   Other source comments may retain historical citations under the same rule.
7. Create `validation/README.md` with a short explanation linking to
   `docs/validation/layout.md`. Record the move and old-to-new prefix in
   `docs/validation/evidence-relocation-2026-09-19.md`, including remaining
   historical references and verification results. Keep machine-readable
   before/after hashes and modes in
   `validation/evidence/relocations/2026-09-19-docs-evidence.json`. This is
   new evidence; do not mutate the previous tool-relocation record merely
   because its historical source prefix now names the former location.
8. Update pending-relocation wording in the layout document, PR #1502 plan
   and five task prompts when finished. Leave task03's approval status
   pending. Mark this handoff completed with a link to the move record; do
   not erase these original instructions or their old-path mapping.

## Verify and report

- Prove every inventoried file arrived and its mode is preserved. All
  non-Markdown files and frozen review/measurement records must have the same
  SHA-256. List the permitted README/instruction changes individually.
- Check all updated local links resolve, including links from the moved
  READMEs to scripts and documentation. Classify remaining references to the
  old prefix as historical or errors. The local JSBSim approval receipts keep
  their original paths/hashes; the new migration record supplies the mapping.
- Verify `.gitignore` does not ignore retained evidence, lint excludes it,
  and the old tree no longer exists. Run `npm run lint` and
  `git diff --check`. Report unrelated failures without fixing them.
- No simulation, audio render, JSBSim build, app build or regression suite is
  needed for this data move and lint-ignore update. Do not regenerate data to
  make a path check pass.

Report moved counts, changed instruction/config files, exact check results,
evidence hashes and unresolved issues. Leave everything unstaged and
uncommitted for review. Do not write an engine handoff receipt.
