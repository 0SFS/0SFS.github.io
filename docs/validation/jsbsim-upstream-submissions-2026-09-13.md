# JSBSim focused upstream submissions — 2026-09-13

> **Package renamed after this record.** `@felipegalind0/jsbsim-wasm` became
> `@felipegalind0/jsbsim` at fork.5 on 2026-09-13. Names, tarball filenames and
> hashes below are the ones in force at the time and still identify the retained
> artifacts on disk; they are deliberately not rewritten. See
> [the current runtime guide](../jsbsim.md) and `fork5-adoption.json`.

The user authorized completing preparation and opening the upstream PRs. The
working integration was preserved; contributions were extracted onto ordinary
branches in the canonical JSBSim checkout. No extra development checkout or
worktree was introduced. Build-owned source snapshots contain no Git repository.

## Submission scope

| Contribution | Branch and exact head | Upstream state |
| --- | --- | --- |
| Turbine zero-time spool consistency | `fix/turbine-trim-spool`, `07eba55fcd6fed530f6f404e857765c3224541fb` | [PR #1505](https://github.com/JSBSim-Team/jsbsim/pull/1505), open, non-draft |
| Model replacement property lifetime | `fix/model-reload-lifetime`, `a25956a26957edfac752308264fe802434dbbac7` | [PR #1506](https://github.com/JSBSim-Team/jsbsim/pull/1506), open, non-draft |
| In-tree WebAssembly/TypeScript package | `feature/wasm-package`, `c6d4063ab7dd7721f280d03726ead85355ad8e57` | [PR #1507](https://github.com/JSBSim-Team/jsbsim/pull/1507), open, non-draft |

Both native fixes independently target upstream master
`14c19022943f5850daf2c6b90554050b3139b853`. The WASM branch carries explicit
prerequisite commits from existing #1504 and new #1506, followed by the focused
package commit and a browser-tooling correction. Rebase that branch after the prerequisites merge; do not
force-push either prerequisite branch as part of package maintenance.

The package contribution contains 45 paths and 6,309 added lines, including
1,524 dependency-lock lines and the existing binding generator. It excludes
wheel dynamics, turbine changes, SDK batching/gear APIs, old native archives,
binaries, demo, fork release settings and the fork-only Codecov upload policy.
Existing native #1502 and SDK #8 reviews retain their original scope and open
questions. Original #1504 code/head remains unchanged.

## Actual native evidence

Exact Git archives of the upstream base and both candidate commits were built
with Apple clang 21.0.0, CMake 4.4.3, Python 3.14.7 and Cython 3.3.0. All ten
adjacent CTest targets pass on the base; each candidate passes those ten plus its
new target (11/11 each). The turbine regression produces four failed assertions
before the fix. The reload regression crashes with SIGSEGV before the fix.

Independent AddressSanitizer builds reproduce heap-use-after-free in
`SGPropertyNode::untie` on four replacing-model sequences before the lifetime
fix. All six candidate sequences pass with no sanitizer errors or failed ties.
Leak detection was disabled; this is not a leak-clean claim. The Python reload
target includes six cases, including partial XML failure and recovery.

Native commands, toolchain versions, source/extension hashes, complete logs,
reproduction scripts and a 49-file evidence manifest are under canonical
`build/upstream-submission-native/`; `SUMMARY.md` and `source-identities.json`
identify them. Scope review verifies three paths in #1505 and four in #1506.

## Additional defects resolved during preparation

The accepted downstream fork.3 binary did not link IDBFS even though its SDK
advertised optional browser persistence. The contribution links IDBFS and
rejects equal/nested normalized runtime/persistence roots before allocation;
otherwise snapshot copying can erase or recursively copy the source tree.

The prior WASM build enabled exception handling on the bindings but omitted the
flag from native engine object compilation. A new real-WASM test removes the
standard C172's required thruster definition: the native propulsion loader must
catch its XML error, return false, then recover with a valid C172. Before the
flag fix, 39/40 tests pass and this test fails with an escaped exception
(`excPtr: 283656`). With the engine compile flag, all 40 tests pass. The diagnostic
input was explicitly dirty and never promoted; its full descriptor and failure
log are preserved. Native builds with WASM off receive no additional exception
flag.

The source import retains 0x62's MIT notice and explicit source attribution in
`wasm/NOTICE`. `LICENSES.md` and packed component notices distinguish the wrapper
from the native LGPL engine and GeographicLib/Expat. The provisional
`@jsbsim/wasm@0.1.0` package is private; no npm publication is configured.

## Package validation and identity

The clean-source contribution passes WASM/TypeScript compilation, typechecking
and 40 Node tests. Release packing succeeds. A separate consumer project installs
the tarball, runs the README's C172 example for 120 steps, and verifies all 15
distribution-file hashes and required notices. It does not use app aircraft data.

Exact-source native isolation passes configure/build/start with WASM disabled,
checks all 149 native compile commands, and rejects a native compiler with WASM
enabled. All 1,402 archived source files remain byte-identical after the check.

- Commit: `c6d4063ab7dd7721f280d03726ead85355ad8e57`
- Artifact SHA-256: `ba54b047bf6bbf62c1ecc23235055751366cd341a073f5c2451184bbfedbf69e`
- Tarball SHA-256: `f28ac5cd70933cf30931227eaa53356f29140d005e619024441b18924029af50`
- Repository content SHA-256: `9fe6816db375473abd63613e5617b8d2bec2898dc6808c3db01a2abe3d1d1101`
- SDK subtree SHA-256: `039757388ed7ec8b25f1099fb6248838e66735d966ad4883be6ca4faea5f5763`
- Build input SHA-256: `811cf882c3997bb57499f418a61f716e0c0ad7919eeadd31c8dd8a7aff575e40`

Package build/rejection/browser/consumer/native-isolation evidence is under
canonical `build/upstream-submission-wasm/`, with immutable source/attempt/artifact
and package paths recorded by the retained descriptors. The exact package is a
review artifact, separately identified from the app's installed fork.3 tarball.

## Review and downstream boundaries

At submission, upstream workflows for these PRs report `action_required`:
the repository requires a maintainer to approve these fork workflow runs. No
upstream CI pass is claimed from absent check entries. Local evidence does not
replace upstream review or merge approval.

The previously interrupted broad native/Python/MATLAB workflow on accepted fork.3
was retried for its runner DNS failure and now passes:
https://github.com/Felipegalind0/jsbsim/actions/runs/34791576161.

The app remains on verified `@felipegalind0/jsbsim-wasm@1.2.4-fork.3` from
`feature/wasm-integration` at `f7a80a6f`. Full SDK history, batching/gear features,
wheel dynamics, turbine/lifetime/logging improvements, retired checkout and
rollback artifacts remain preserved. The newly found IDBFS/native-exception
build fixes are submitted-source improvements; they are not yet in the app's
installed fork.3 package. Adopting them requires a new identified downstream
package and affected app checks. No aircraft calibration or SF50 fidelity claim
is made by these submissions.

## Final browser, CI and workspace outcome

The first extracted candidate `21950aa0` passed 40/40 Node tests, consumer
installation, native isolation, installed Chrome persistence and worker checks.
Its pinned Playwright 1.58.2 browser installer stalled during archive extraction
both locally and in the hosted workflow. The task-owned installer processes and
stalled dedicated workflow were stopped; no user browser or unrelated CI run was
stopped. The exact cause inside the older dependency was not assigned to JSBSim.

Final commit `c6d4063a` pins current Playwright 1.63.0 and requests only its needed
headless shell while preserving other browser caches. Its installer succeeds.
The final source was rebuilt and repacked, then passed all 40 Node tests,
pinned Chromium 153.0.8010.12 persistence across three navigations, fresh consumer
installation/C172 execution, and a separate installed Chrome 153 worker check.
Artifact hashes and exported identity were verified in each browser context.
A fresh final native build/isolation check also passed. Native code, SDK runtime,
tests, generator/build scripts and CMake are byte-identical to the earlier
candidate; only package metadata/lock, README and workflow changed in the follow-up.

[The dedicated hosted native/WASM/browser/package workflow](https://github.com/Felipegalind0/jsbsim/actions/runs/34794256071)
passes both jobs on final `c6d4063a`. The inherited broader C/C++ and coverage
workflows are separate; this is not a claim that every inherited fork workflow
passes. Upstream repository workflows still need maintainer approval. The PR
body was updated with the final identity/results and read back.

Final reports are `final-build.json`, `final-package.json`,
`final-playwright163-build.log`, `final-browser-persistence.log`,
`final-consumer-result.json`, `final-worker-smoke.json`,
`native-final/native-isolation.json`, and `hosted-wasm-final.json` under the
canonical evidence directory. Earlier candidates and failed/stalled attempts
remain identified separately. The original MIT license is byte-identical to
0x62 revision `ffc620dc4f15e476a030846a9cf0d32197e493a8` (SHA-256
`15e2d343fc930439fb82351d7c30f3d151b4c42ca3132c13ff1a60da527a1259`).

The canonical checkout is restored clean to `feature/wasm-integration` at
`f7a80a6f`, with its original fork.3 build/package pointers restored after hash
verification and its development dependencies reinstalled from the existing lock.
The three new PR branches remain separately available and pushed. No full
integration branch or existing PR was replaced. A narrow local Git exclusion
covers only retained generated `wasm/demo/public/sdk/` output on the core-package
branch; tracked demo source and new authoring remain visible normally.

The verified `contribution-branches.bundle` includes the preserved integration,
new contribution and existing PR branches. SHA-256:
`9f6571e6899e0b56c1d652f29e71901237d953f680b8399a267828ddb8ab5860`. `restored-environment.json` records the accepted branch,
artifact and package. App source/dependency files were not changed by submission;
its mixed working tree remains uncommitted.

The final evidence inventory hashes 49 reports/logs/helpers and the recovery bundle. Key reports are also copied to app `build/validation/jsbsim-upstream-submissions-20260913/` for handoff.
