# Handoff: relocate retained JSBSim validation tools

This is a separate 0sfs housekeeping task for a user-launched agent. It is
not task 04, does not approve task 03, and must not modify the JSBSim PR.
Do not launch other agents.

## Goal and starting state

Move runnable validation source out of documentation while preserving the
review evidence and reproduction instructions. Work in `/Users/felg/gh/0sfs`.
Read `AGENTS.md` and the **Validation tooling and evidence** section of
`docs/jsbsim-upstream-contribution-policy.md` first.

Record the branch, HEAD and `git status --short` before editing. This checkout
already contains uncommitted planning/evidence files and unrelated user work;
preserve it all. Do not require a clean checkout, switch branches, reset,
stage, commit, amend, rebase, push, post or edit anything on GitHub. Do not
write outside 0sfs or start a server. Scratch belongs in 0sfs `build/`.

The planner has fixed the destinations below. No engine source, build,
test or approval receipt needs to change. This can run independently of
the planner's task 03 code review because it moves only tooling and updates
0sfs documentation; leave existing evidence result files byte-identical.

## Exact moves

Use `docs/validation/evidence/jsbsim/` as the old prefix and
`scripts/validation/jsbsim/` as the new prefix. Preserve each relative path:

```text
engine-off-trim/check.mjs
engine-off-trim/native_check.py
trim-fuel-flow/check.mjs
idle-fuel-flow/check.mjs
wheel-spin-review/make_solver_probe.py
wheel-spin-review/check_airborne_frame.py
wheel-spin-review/inspect_f16.py
wheel-spin-review/compare_scripts.py
wheel-spin-review/check_solver.cpp
wheel-spin-review/task01/analyze.py
wheel-spin-review/task03/frame_values.py
wheel-spin-review/task03/make_mutant.py
```

Check these files still exist before starting; stop and report if the layout
has already changed or any destination contains different content. Record
old-path SHA-256 values before moving. Move, do not leave executable copies,
symlinks or forwarding stubs under docs. Preserve filenames and file modes.
All twelve are retained reproduction tools for now; do not delete one because
a later regression overlaps it. Source snapshots under
`docs/validation/evidence/jsbsim/rollback/` are explicitly out of scope.

For each moved file, inspect `__file__`, `import.meta.url`, relative imports,
default input paths and default output paths. Adjust only anchors made wrong
by the move so they still resolve to the same intended inputs, packages and
repositories. Do not reinterpret an input evidence path as a scripts path.
Never change physics, test assertions, comparison algorithms or tolerances.
If a tool defaults to writing into docs, change that default to a dated
directory in the owning repository's build/: use `scripts/outputDirectory.mjs`
for Node tools running in 0sfs, and the existing comparison harness convention
for JSBSim runs. Preserve explicit output arguments. Describe any such change
separately from a pure relocation. Stop for an unspecified design decision.

Update active reproduction commands and links in docs, including the evidence
READMEs, the PR #1502 plan and task prompts, and the upstream tracker if it
references a moved tool. Update the five prompts' temporary wording that
relocation is pending. Search by both old path and basename; inspect each
match instead of blanket-replacing every occurrence. The dated original
work prompt can retain its quoted brief with a short superseding-layout note.

Keep captured `.log`, `.json`, `.diff`, `.sha256`, review result text and
historical approval receipts unchanged. A historical command can correctly
record the old path. Do not rewrite history to suggest a run used the new
path. Preserve the archived GitHub API responses verbatim.

Add `docs/validation/evidence/jsbsim/tool-relocation.md` listing the date,
old/new paths, hashes, any necessary path-anchor changes and the checks below.
Link it from the wheel-spin evidence README. This note explains old source
paths/hashes in retained records, including the approved task 01 analyze.py
entry. Do not rewrite either approved receipt or its original review record.

## Verification and report

- Compare old/new file hashes; every difference must be an explained path
  anchor, output-default or usage-documentation change.
- Parse each moved Python source using `ast.parse` without importing it or
  creating bytecode. Run `node --check` on each moved `.mjs` file. The C++
  probe must remain byte-identical; do not build or execute it for a move.
- Check local import/input anchors and all updated Markdown links resolve.
  Do not invoke a script merely to try `--help`: several probes execute at
  top level and have no argument parser. No expensive simulations, engine
  rebuild, full test suite or server is required for this relocation.
- Confirm none of the twelve runnable files remains under docs. List any
  remaining old references and explain which are immutable historical records.
  Confirm retained result files are unchanged and run `git diff --check`.

Report the moves, necessary source-path edits, exact checks/results and any
uncertainty. Leave all changes uncommitted for review. Do not write a PR #1502
handoff receipt or start the next engine task.
