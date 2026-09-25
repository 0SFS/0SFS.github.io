# PR #1505 off-engine repair: candidate evidence, 2026-09-19

Records behind [the report](../../../../../docs/validation/pr1505-off-engine-regression.md).
Everything except `final-commit.json` and `post-review-comment-only.diff`
describes the **tested working tree** on `fix/turbine-trim-spool` at
`07eba55fcd6fed530f6f404e857765c3224541fb`; those two record what happened
after review. Nothing here was pushed: `origin/fix/turbine-trim-spool` is
still `07eba55f`, and #1508 and the installed package are untouched.

## After review

The work was reviewed and accepted on 2026-09-19 and is now local commit
`6f95bfb0a590d1a45de9f883857c17af0819f6ad`, "Preserve off-engine spool state
during turbine trim", on `fix/turbine-trim-spool`. It carries exactly the two
reviewed files.

Review asked for one wording correction: the comment claimed that *every*
zero-time evaluation reaches `Trim()`, which is too broad, since starvation,
stall and seizure override the `tpTrim` selection. The committed comment reads
"Zero-time evaluations, such as `RunIC()`, can reach Trim even when the engine
is off."

`post-review-comment-only.diff` is that change, and `final-commit.json`
records the commit with its blob and file digests. No line outside the comment
changed: with comments stripped, the tested and committed sources hash the
same (`33dff8a2…`), so the results below still describe the committed code.
On that basis the reviewer waived a rerun, and none was done. The tested
records were left exactly as they were rather than regenerated.

| File | What it is |
| --- | --- |
| `final-commit.json` | The reviewed local commit: SHA, parent, tree, blob and file digests, and the comment-only change |
| `post-review-comment-only.diff` | The post-review comment correction, the only change between the tested tree and the commit |
| `provenance.json` | Heads, source and extension SHA-256, toolchain, build options, results, tolerances |
| `candidate.patch` | The whole working diff: `FGTurbine.cpp` and `TestTurbineTrimSpool.py` |
| `fgturbine-vs-pr-base.diff` | The engine change against the PR's parent `14c19022`, so the net effect on upstream is visible |
| `before-TestTurbineTrimSpool.log` | The expanded test on the unmodified #1505 head: 8 failing spool assertions, existing test passing |
| `after-TestTurbineTrimSpool.log` | The same test source on the candidate: 3/3 pass |
| `after-focused-suite.log` | The 11-target focused CTest suite on the candidate: 11/11 pass |
| `thrust-comparison.md` / `.json` | Zero-time trim thrust, before vs after, 12 cases: identical |
| `thrust-comparison-with-mutant.md` / `.json` | The same comparison including a deliberately wrong implementation |
| `mutant-wrap-only.diff` | That wrong implementation: the two assignments guarded, the rest of `Trim()` still reading the member `N2` |
| `mutant-wrap-only-TestTurbineTrimSpool.log` | It passes all three spool tests, which is why the thrust comparison is retained |

The mutant is a diagnostic control built from a copy of the sources under the
engine's gitignored `build/`. It is not a candidate and was never in the
checkout.

## Reproducing

The tool is
[`scripts/validation/jsbsim/engine-off-trim/trim_thrust_compare.py`](../../../../../scripts/validation/jsbsim/engine-off-trim/trim_thrust_compare.py).
The permanent regressions live in JSBSim `tests/TestTurbineTrimSpool.py` and
travel with the fix. Both builds used the options in `provenance.json`; the
`before` extension was built before the source was edited and was not rebuilt
afterwards. Build directories and raw run output stayed in the engine
repository's `build/pr1505-off-engine-20260919/` and are not distributed.

```sh
cd /Users/felg/gh/Felipegalind0/jsbsim
PYTHONPATH=<build>/tests ctest --test-dir <build> -R '^TestTurbineTrimSpool$' --output-on-failure
.venv/bin/python /Users/felg/gh/0sfs/scripts/validation/jsbsim/engine-off-trim/trim_thrust_compare.py \
  --source $PWD --build before=<build>/before --build after=<build>/after
```

The thrust rows describe existing behaviour for an engine that is off. They
are a compatibility check on this fix, not a claim that an off engine should
produce thrust; that question belongs to the later lifecycle work.
