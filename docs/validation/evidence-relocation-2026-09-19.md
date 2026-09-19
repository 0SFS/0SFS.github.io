# Evidence relocation — 2026-09-19

The retained evidence tree moved out of `docs/`, following the
[validation layout](layout.md) and the [handoff](relocate-evidence.md):

- Old prefix: `docs/validation/evidence/`
- New prefix: `validation/evidence/`

Every relative path is unchanged, so `docs/validation/evidence/<path>` is now
`validation/evidence/<path>`. The tree was moved with one directory rename in
the working tree at `0bc3a546`. Nothing was staged or committed. No copy,
symlink, stub or empty directory remains under `docs/`.

## What moved

109 files, 3,548,915 bytes: 102 under `jsbsim/` and 7 under `audio/`. That
includes the rollback snapshots, adoption and parity records, logs, API
snapshots and the task 01–03 review records. 43 of the files were tracked at
`0bc3a546` and 66 were untracked. Every file was a regular file with mode 0644,
and every mode is unchanged.

Per-file old and new paths, sizes, modes and SHA-256 are in
[`validation/evidence/relocations/2026-09-19-docs-evidence.json`](../../validation/evidence/relocations/2026-09-19-docs-evidence.json)
(SHA-256 `ded9f3b56b101cf284e8e90f3c93b1516da734c2ef30a07daa086412a53edd5e`).

**105 files are byte-identical.** Their sorted `shasum -a 256` listing hashes
to `00f319735ea6fe7f489b8f27d7b4d224c815e5b487ed90c4695a8d776c3f3661` both
before and after. To recompute it:

```sh
cd validation/evidence
find . -type f ! -path './relocations/*' ! -name README.md -print0 \
  | LC_ALL=C sort -z | xargs -0 shasum -a 256 | shasum -a 256
```

Among them:

- The approved review records. `task01/review.md` is `9c6a9a91…80` and
  `task02/review.md` is `495362b9…fdbf`.
- The task 03 record's data files.
- `jsbsim/tool-relocation.md`, the [previous tool move](../../validation/evidence/jsbsim/tool-relocation.md) record.
- `audio/camera-zoom-med-2026-09-16.md`, a measurement record.
- All JSON, logs, diffs, `.sha256` files and GitHub API snapshots.
- The rollback `package.json`, lock and identity files.

**Four evidence READMEs changed.** Only their links and move notes changed:

| File | Change |
| --- | --- |
| `jsbsim/README.md` | Eight links recomputed (five to `scripts/`, two to `docs/old/`, one to `docs/validation/`). Adds a paragraph on this move. |
| `jsbsim/engine-rollout/README.md` | One link to the rollout report recomputed. |
| `jsbsim/wheel-spin-review/README.md` | Seven links recomputed. The heading "Commands actually verified" is now "Reproduction commands". The notes now say the recorded runs used byte-identical tools under `docs/validation/evidence/jsbsim/wheel-spin-review/`, and that nothing was rerun. |
| `jsbsim/wheel-spin-review/task03/README.md` | Three script links recomputed. The note on the recorded run now names its former path. Approval status still says awaiting planner review. |

**Two files are new:** the machine record above, under `relocations/`, and
[`validation/README.md`](../../validation/README.md).

## Records that keep the old prefix

These describe past runs or instructions. They are unchanged, and the mapping
above applies to them.

- **Local approval receipts.** JSBSim `build/pr1502-handoff/01.json` and
  `02.json` are unchanged (SHA-256 `eca1d2c7…aeec` and `17f7b819…897b`).
  - Their `review_record` values name
    `/Users/felg/gh/0sfs/docs/validation/evidence/jsbsim/wheel-spin-review/task01/review.md`
    and `…/task02/review.md`, which are now under `validation/evidence/`.
  - Their `evidence_sha256` keys are file names inside `task01/` and `task02/`.
  - All 16 hashes match the files now at `validation/evidence/.../task0N/`.
    The exception is `task01/analyze.py`, which matches
    `scripts/validation/jsbsim/wheel-spin-review/task01/analyze.py` (see the
    tool relocation record).
- **Frozen records inside the tree.**
  - `adoption/fork7-adoption.json` names its check as
    `evidence/jsbsim/idle-fuel-flow/check.mjs`.
  - `jsbsim/tool-relocation.md` names `docs/validation/evidence/jsbsim/` as its
    old prefix.
- **Relative links that no longer resolve.** These are in the two unchanged
  records, and were written for the old depth:

  | Record | Link | Now at |
  | --- | --- | --- |
  | `jsbsim/tool-relocation.md` line 3 | contribution policy, `#validation-tooling-and-evidence` | [`docs/jsbsim-upstream-contribution-policy.md`](../jsbsim-upstream-contribution-policy.md#validation-tooling-and-evidence) |
  | `jsbsim/tool-relocation.md` line 75 | PR #1502 plan | [`docs/pr1502/plan.md`](../pr1502/plan.md) |
  | `jsbsim/tool-relocation.md` line 76 | review round prompt | [`docs/pr1502-review-round-prompt.md`](../pr1502-review-round-prompt.md) |
  | `jsbsim/tool-relocation.md` line 77 | 2026-09-14 open PR review | [`docs/validation/jsbsim-open-pr-review-2026-09-14.md`](jsbsim-open-pr-review-2026-09-14.md) |
  | `audio/camera-zoom-med-2026-09-16.md` line 5 | the ledger | [`docs/validation/audio-implementation-ledger.md`](audio-implementation-ledger.md) |

- **Archived documents in `docs/old/`.** They cite the old prefix in prose or
  commands:
  - `jsbsim-in-tree-integration-2026-09-13.md` lines 89, 147, 214 and 275.
  - `jsbsim-open-prs-brainstorm-prompt.md` lines 48, 94 and 100.
  - `sf50-development-handoff.md` line 17.
- **Dated instructions.**
  - The original brief in [`docs/pr1502-review-round-prompt.md`](../pr1502-review-round-prompt.md)
    (lines 49 and 250). Its superseding notes now name both new homes.
  - The previous handoff, [`docs/pr1502/relocate-validation-tools.md`](../pr1502/relocate-validation-tools.md).
  - This move's own [handoff](relocate-evidence.md), now marked completed.
- **Executed commands.** The two `renderSweep.mjs --out=docs/validation/evidence/audio/…`
  commands in the [audio ledger](audio-implementation-ledger.md) (§5.3 and
  §5.4) are kept as run. A note under each links the output's current path.
- **Source comments.** No runtime source, test, DSP or WASM file was changed,
  and the DSP was not rebuilt.

  | Comment | Cites | Now at |
  | --- | --- | --- |
  | `src/flight/audio/dsp/core.cpp:717` | `docs/validation/evidence/audio/camera-zoom-med-2026-09-16.md` | `validation/evidence/audio/camera-zoom-med-2026-09-16.md` |
  | `src/flight/audio/jsbsimAudioAdapter.ts:41` | `docs/validation/evidence/audio/sf50-start-trace-2026-09-14.txt` | `validation/evidence/audio/sf50-start-trace-2026-09-14.txt` |
  | `src/flight/audio/cameraZoomAudio.integration.test.ts:29`, `jsbsimAudioAdapter.integration.test.ts:51`, `benchmarks/audio/renderSweep.mjs:37` | `evidence/audio/sf50-geometry-2026-09-14.txt` | `validation/evidence/audio/sf50-geometry-2026-09-14.txt` |
  | `src/flight/audio/jsbsimAudioAdapter.integration.test.ts:81` | `evidence/audio/sf50-start-trace-2026-09-14.txt` | `validation/evidence/audio/sf50-start-trace-2026-09-14.txt` |

## Documents and configuration updated

- **Lint.** `eslint.config.js` now ignores `validation/evidence` instead of
  `docs/validation/evidence`, and nothing else in it changed. Nothing reads the
  old prefix at runtime:
  - `tsconfig.app.json` includes only `src`.
  - The tree contains no test files for vitest to collect.
  - `.gitignore` ignores nothing under `validation/`.
- **Links recomputed.** Links and path text were updated for the new location
  in these files:
  - [`docs/jsbsim.md`](../jsbsim.md): nine links. Two sentences that called the
    evidence directories "the script" now link the scripts in `scripts/`.
  - [`docs/software-dependency-graph.md`](../software-dependency-graph.md).
  - [`docs/old/README.md`](../old/README.md): its current-sources index.
  - [`docs/proposals/jsbsim-turbine-evaluation.md`](../proposals/jsbsim-turbine-evaluation.md).
  - [the audio ledger](audio-implementation-ledger.md): links, the evidence
    file list and the combustion evidence path.
  - [`engine-cutout-rollout-2026-09-16.md`](engine-cutout-rollout-2026-09-16.md).
  - [`jsbsim-open-pr-review-2026-09-14.md`](jsbsim-open-pr-review-2026-09-14.md),
    whose move note now says the logs moved too.
  - [`sf50-pilot-evaluation-readiness.md`](sf50-pilot-evaluation-readiness.md).
  - [`docs/pr1502/plan.md`](../pr1502/plan.md): six links and its layout
    update.
- **Location statements.** These named the old directory in prose:
  - [`docs/sound.md`](../sound.md) §5.
  - The tree listing in [`docs/sound-implementation-prompt.md`](../sound-implementation-prompt.md).
  - [`docs/engine-cutout-on-rollout-prompt.md`](../engine-cutout-on-rollout-prompt.md),
    which also pointed at the old tool location.
- **Pending-relocation wording.** Updated in:
  - [the layout](layout.md);
  - the contribution policy's
    [validation section](../jsbsim-upstream-contribution-policy.md#validation-tooling-and-evidence);
  - [the plan](../pr1502/plan.md);
  - all five `docs/pr1502/tasks/*.md` prompts, which now also give the new path
    of `tool-relocation.md`;
  - [the review round prompt](../pr1502-review-round-prompt.md), whose
    superseding notes are updated.
- **Unchanged.** The upstream tracker, `docs/open-upstream-prs.md`, links only
  documents that stayed in `docs/`.

## Checks

These ran on 2026-09-19. Nothing was simulated, rendered, built or rerun.

- **Arrival.** All 109 inventoried paths are present under
  `validation/evidence/`, and none is missing. Size, mode and SHA-256 were
  compared per file: 105 are identical, the 4 READMEs above differ, and all
  modes are unchanged. The old tree is absent.
- **JSBSim receipts.** 16 of 16 `evidence_sha256` entries match the moved
  files, and both review records exist at the mapped path.
- **Links.** Every relative Markdown link in the repository was resolved,
  including heading anchors. None is broken in the updated documents, in the
  moved READMEs (links to `scripts/` and `docs/`) or in the new files. The only
  broken links are the five in frozen records listed above and
  `docs/proposals/phone-controller.md:71`, which links a sibling repository and
  was already broken before the move.
- **Lint.** `npm run lint` exits 1 with the same five errors as before the
  move. They are in `src/flight/hud/LoggingPanel.tsx` (four,
  `react-refresh/only-export-components`) and in
  `src/flight/hud/evaluationInstruments.test.ts` (one unused `vi`), and are
  unrelated to this move. ESLint reports a file in
  `validation/evidence/jsbsim/rollback/` as ignored by the ignore pattern.
- **Git ignore.** `git check-ignore` matches nothing under `validation/`.
- **Whitespace.** `git diff --check` is clean.
