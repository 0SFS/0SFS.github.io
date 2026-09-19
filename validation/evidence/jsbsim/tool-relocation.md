# Validation tool relocation — 2026-09-19

The [layout policy](../../../jsbsim-upstream-contribution-policy.md#validation-tooling-and-evidence)
keeps runnable validation tools out of this evidence tree. On 2026-09-19 the
twelve retained tools below moved from beside their logs to `scripts/`:

- Old prefix: `docs/validation/evidence/jsbsim/`
- New prefix: `scripts/validation/jsbsim/`

Each relative path is unchanged. Every file moved **byte-identical**, with its
mode (0644) preserved; no copy, symlink or stub remains at the old path.

| Relative path | SHA-256, old and new |
| --- | --- |
| `engine-off-trim/check.mjs` | `7d89bd169d0cbf8320cecaf5e9d72c6a5c915740e0c63f4c4e45703e280d6ae8` |
| `engine-off-trim/native_check.py` | `90aefea3744586e1eaf96ee32b79d7b28332edfde3ac6276e3141c0a0fa8cf84` |
| `trim-fuel-flow/check.mjs` | `e47bab576860b029c508d9d9d28d7dc19ed3255c8e1d5b83f130c9feb1cedb54` |
| `idle-fuel-flow/check.mjs` | `bbcd09dc280f77f6b4d284daad76d999f9c1692702487d275a04bd2be8f7088e` |
| `wheel-spin-review/make_solver_probe.py` | `b4e7702fc049f7c51c8e4adac3cff7faef5bc51324f638967ee5bdf092d1f223` |
| `wheel-spin-review/check_airborne_frame.py` | `c2c4bcfe772781c019faca3ff3f54744edd1246bda04b15a3765d573f9229641` |
| `wheel-spin-review/inspect_f16.py` | `d0812f594498171cdaf001d99fef0bbbb9cb170935e7eea8c13e4ef47810f84c` |
| `wheel-spin-review/compare_scripts.py` | `76aa5a7f0edcb3dec75b41827c82bb52b7d901144d4bb40a43148e6a9b11e32c` |
| `wheel-spin-review/check_solver.cpp` | `e651d7d4d7a792a0c51ffb592c178c4701624dc44dbab536a0f3d1a48dd1d49d` |
| `wheel-spin-review/task01/analyze.py` | `cb0642e6af0ad41beba3acec143f9df43735cef4367ea108e2b966dba93f0417` |
| `wheel-spin-review/task03/frame_values.py` | `4f3575cb0dc84efa91f365d997b0c0cbd557d40a8449bceb0c99ca52c2bc92ef` |
| `wheel-spin-review/task03/make_mutant.py` | `730c04a3bdc435912f8a8f966d44504c4228af656ba92be875464fefab9c86ee` |

The first four were committed at `0bc3a546`; the eight `wheel-spin-review`
tools had not yet been committed.

## Path anchors and output defaults

None needed changing, so this was a pure relocation:

- No tool uses `__file__`, `import.meta.url` or a path relative to its own
  location for an input, package or repository. The Python tools take every
  source, build and input path from their arguments.
  `engine-off-trim/check.mjs` takes the package and data root from
  `OSFS_JSBSIM_PACKAGE` and `OSFS_JSBSIM_DATA_ROOT`.
- `trim-fuel-flow/check.mjs` and `idle-fuel-flow/check.mjs` import
  `../dist/index.js`. That anchor is relative to a copy placed one directory
  below an unpacked artifact root (for example `evidence/check.mjs`, which
  `idle-fuel-flow/fork6.log` records). It never resolved from the repository,
  before or after the move.
- `task03/frame_values.py` cites `../check_airborne_frame.py` in its
  docstring. The relative layout is unchanged, so that still names the right
  file.
- Only `compare_scripts.py` has a default output, and it already writes a new
  dated directory in the JSBSim source's `build/wheel-spin-review/`. No tool
  wrote to `docs/` by default. `--output` is unchanged.

## Records that keep the old paths

These describe past runs, so they keep the old paths and are unchanged. The
hashes above show that each cited file is the one now at the new path.

- `wheel-spin-review/provenance.json` records five tool hashes by name. All
  five match the table.
- The local task 01 approval receipt, JSBSim
  `build/pr1502-handoff/01.json`, hashes `analyze.py` as a `task01/` evidence
  file: `cb0642e6…0417`, the same file now at
  `scripts/validation/jsbsim/wheel-spin-review/task01/analyze.py`. The receipt
  and [task01/review.md](wheel-spin-review/task01/review.md) are unchanged.
  That receipt is not distributed.
- `adoption/fork7-adoption.json` names its check as
  `evidence/jsbsim/idle-fuel-flow/check.mjs`.
- Logs, JSON summaries, diffs, `.sha256` files and the archived GitHub API
  responses are unchanged.
- `docs/old/jsbsim-open-prs-brainstorm-prompt.md` is an archived prompt and
  cites the old `engine-off-trim/` paths.

Active reproduction instructions now name the new paths: this directory's
[README](README.md), the [wheel-spin README](wheel-spin-review/README.md), the
[task 03 record](wheel-spin-review/task03/README.md), the
[PR #1502 plan](../../../pr1502/plan.md) and its five task prompts. The dated
[review round prompt](../../../pr1502-review-round-prompt.md) and the
[2026-09-14 open PR review](../../jsbsim-open-pr-review-2026-09-14.md) keep
their text, with a short note pointing here.

## Checks

Run on 2026-09-19. No tool was executed; none needed to be for a move.

- SHA-256 of all twelve files before the move, compared with the files at the
  new paths: 12 of 12 identical.
- `ast.parse` on each of the eight Python files, without importing them and
  with bytecode writing disabled: all parse; no `__pycache__` was created.
- `node --check` on each of the three `.mjs` files: all pass.
  `npx eslint scripts/validation`: clean.
- `check_solver.cpp`: byte-identical; not built or run.
- None of the twelve files remains under `docs/`. The only source files left
  there are the `rollback/*/jsbsimBuildIdentity.ts` snapshots, which are
  provenance records, not tools.
- Of the 101 other files that were under `docs/validation/evidence/jsbsim/`
  before the move, 98 are byte-identical afterwards. The three that changed
  are the READMEs listed above, whose links and commands were updated. This
  note is the only new file.
- Every relative Markdown link in the edited documents resolves.
- `git diff --check`: clean.
