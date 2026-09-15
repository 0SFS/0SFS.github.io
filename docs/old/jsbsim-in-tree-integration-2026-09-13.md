# JSBSim in-tree WASM integration — 2026-09-13

> **Package renamed after this record.** `@felipegalind0/jsbsim-wasm` became
> `@felipegalind0/jsbsim` at fork.5 on 2026-09-13. Names, tarball filenames and
> hashes below are the ones in force at the time and still identify the retained
> artifacts on disk; they are deliberately not rewritten. See
> [the current runtime guide](../jsbsim.md) and `fork5-adoption.json`.

Status: implemented and locally accepted. The simulator installs the identified
in-tree package, and daily development uses one combined engine/SDK checkout. This migration does not calibrate aircraft or settle
open upstream feature reviews.

## Decision and public roadmap

The user authorized posting our implementation roadmap and executing it without
waiting for maintainers to do work we can handle ourselves. Follow JSBSim's Python
package precedent: one native repository, a `wasm/` component with the bindings,
JavaScript/TypeScript SDK, tests and packaging, and a separately installable npm
artifact for consumers. The source repository is JSBSim; its npm package remains
`@felipegalind0/jsbsim-wasm`. FOSS Earth remains the rendering dependency.

The [reply to Sean](https://github.com/JSBSim-Team/jsbsim/pull/1504#issuecomment-5657061563)
was posted and read back. PR #1504's code/head was not changed. Native and SDK
feature review remains separate from our working integration.

## Preservation

Before import both canonical repositories were clean. Complete Git bundles were
created and verified under
`/Users/felg/gh/.preservation/jsbsim-in-tree-20260913T233508Z/`.
The manifest records their original commits and bundle hashes. Earlier complete
working-tree/build preservation remains under the centralization recovery root.

On ordinary branch `feature/wasm-integration`, import
`d8a6453c082c133219f47e75ffc18ade71749575` adds the complete, unsquashed SDK history
through `61ee9486651bca36f4a9b2f927953d716985e391` under `wasm/`. The imported tree
exactly matches `1a441ec3d271e302959c8ec7aa23ce8f352f9f45`. Native parent
`61b3132947dde7bc46827fd9fe3eef31193336d2` preserves all earlier native fixes.
No existing PR branch was replaced.

Automatic approval review rejected broad deletion of historical imported files.
Those files were retained. Old source-selection entry points and detached CMake
configuration now fail explicitly; historical archives/locks, preview bindings,
release artifacts and nested workflow files cannot select the current runtime.
This safer alternative leaves no implementation step blocked on that deletion.

## Implemented build contract

Commit `b8820cf0ac44154b5801322dd8fa76cf2bfc3d40` builds engine and SDK from one
stable capture of the enclosing repository. There is no separately editable
engine checkout beneath `wasm/`. Identity schema 2 records the common commit,
common dirty flag, complete repository digest and SDK subtree digest. Generated
bindings, compilation, fixtures, tests and metadata use that capture. Dirty
captures are explicit development candidates; release/app gates reject them.

Root CMake defaults `BUILD_WASM_MODULE` to OFF. When enabled under Emscripten,
`wasm/CMakeLists.txt` links the enclosing `libJSBSim`. Native CMake/compile uses no
Node/Emscripten setup. The source capture rejects nested repositories, substituted
SDK subtrees, changed source caches and conflicting source flags. Authored files,
generated output and compiler configuration retain their verification gates.

The new root GitHub workflow defines native isolation and WASM/package jobs,
without publishing. Local checks do not establish a hosted CI result. The package
retains 0x62's MIT notice and native/GeographicLib/Expat notices. The old SDK demo
source and functionality remain; native fixes are not moved into app workarounds.

## Current exact artifact

| Identity | Value |
| --- | --- |
| Engine and SDK commit | `f7a80a6f064d22efe0591c20c8637b9c38179ba9` |
| Repository content SHA-256 | `0657d0ad8b63cd79fab1314c3ddcbf514f071142bc8a2bc5f26884549a7ee6ef` |
| SDK subtree SHA-256 | `039639d0aaadcb24864a43f9e56d6e9fcaadb6d5feaf17fd7473ec39cea14a6e` |
| Build input SHA-256 | `e7f5cbf60bdd5af58654122d52ef2b58a976a95ed980c0f0c8ffd7d430cafc8a` |
| Artifact SHA-256 | `473944e5ef65062e812dacfab1ffd83a150f83b7b51c50a4e70704dffdfef3fe` |
| npm package | `@felipegalind0/jsbsim-wasm@1.2.4-fork.3` |
| Tarball SHA-256 | `43d0fe826fe0948d6e9049f90aa8d4ffd780844f859effda38ec22da81de0171` |

Toolchain: Node 26.8.2, npm 11.19.1, CMake 4.4.3 and Homebrew Emscripten 6.0.9
on macOS arm64. The build identity records actual compiler and configuration
hashes. The clean in-tree build passed WASM/TypeScript compilation, typechecking
and 45/45 SDK tests across eight suites. Release packing passed. Native default
isolation configure/build/start and native-compiler WASM rejection passed.

Evidence is under native `build/in-tree-integration/`,
`build/in-tree-native-isolation/`, and app
`build/validation/jsbsim-in-tree-20260913/`. All three are gitignored and are
not distributed; the records later documents rely on are tracked separately
under `docs/validation/evidence/jsbsim/`. Package paths are identified by
`wasm/build/last-package.json`. Old `1.2.4-fork.1` remains in app `deps/` for rollback.

## Completed adoption checks

| Check | Actual outcome |
| --- | --- |
| Coherent WASM and SDK build | Compiled WASM, ESM and declarations; typecheck and 45/45 tests in eight suites passed on clean `f7a80a6f`. |
| Source gates | 20 focused tests cover one-repository capture, source/subtree substitution, dirty opt-in, nested repositories, concurrent changes, archive safety, compiler overrides and generated/authored file checks. Included in the 45 tests. |
| Native isolation | Default WASM-OFF configure/build/start passed; enabling WASM with the native compiler failed with the intended diagnostic. |
| Native regressions | 11/11 CTest targets passed after rebuilding the native extension from the current revision: model reload/loading, clock reset, turbine initialization, indexed engine state, trim, wheel/contact/hold-down and logger. |
| Installed app | 143/143 tests in 13 files passed, including runtime lifecycle, artifact/identity gates, aircraft catalog/variants and family selection. |
| Production package | App TypeScript and Vite build passed; all 14 SDK distribution files, tarball/lock integrity, exported identity and emitted loader/WASM hashes matched. |
| Actual browser | Headless production-bundle SDK boot and loaded-byte checks passed for C172, G1, G2 and G3. No server or visible browser was started. |
| Family UI | Keyboard/layout checks passed in wide, narrow and short viewports. |
| Native/WASM agreement | Four matched C172/SF50 initial, throttle, two-second fixed-step and reset scenarios passed, with no comparisons outside the recorded numerical budget. |
| SDK demo | Production build passed after installing its documented parent SDK development dependencies. The initial attempt lacking those dependencies failed type resolution; both logs are retained. |
| Focused app lint | Four changed identity/artifact TS/MJS files passed with zero errors or warnings. |

Browser loader SHA-256:
`ba9e878fee7402dd0b328b28da31a447bb85cd35d5b5526d3c800827b2c52b5e`.
Browser WASM SHA-256:
`55633e12b1a2462f6b1c2193d759980a2d67a8d4f4a9480f8ad9a84d9808067d`.
Actual rebuilt native extension SHA-256:
`db8e3f02471eebdc81b00efce9d9ac0d02cffa792e80b384df12859d9979f584`.

Parity uses 240 steps at 1/120 second, recorded aircraft XML, conditions and
properties. Its allowance is `1e-7 + 1e-8 × max(abs(native), abs(WASM))`, with
the absolute floor in each named property's units. Maximum error divided by its
allowance was `0.00014851043486171765`. These are software agreement checks;
they establish neither AFM fit nor independent aircraft fidelity. Terrain/network
services were outside the browser check. Existing renderer/demo chunk-size,
React test-act and UI focus observations remain recorded, not introduced as
flight-model validation failures. Hosted CI is reported separately below.

## Final environment and recovery

Use `/Users/felg/gh/Felipegalind0/jsbsim` on `feature/wasm-integration`. Native
engine code is in `src/`; reusable SDK code is in `wasm/`. The original native
`integration` branch at `61b31329` and existing PR branches remain recoverable.
The SDK's old canonical checkout was reversibly moved to
`/Users/felg/gh/.preservation/jsbsim-in-tree-20260913T233508Z/retired-jsbsim-wasm`.
It is clean at `61ee9486`; no old checkout files were deleted. The final combined
Git bundle was verified, with SHA-256
`649547781092898301e04d91617562876310781b652a21fe3a517935b72e3772`.
`retirement.json` records the move; `final-fork3-preservation.json` records the final published bundle and unchanged runtime-source checks.

Comparison against pre-import native `61b31329` confirms `src/` and `tests/`
are unchanged. Comparison against the exact SDK import confirms the runtime,
bindings, lifecycle and extension tests are unchanged: among SDK `src/`,
`bindings/` and `test/`, only the build-identity declaration and source-contract
tests changed. Existing turbine, reload, wheel, batch/contact and SDK lifetime/
diagnostic work is preserved.

[The workspace](../../flight-development.code-workspace) now has three roots:
0sfs, combined JSBSim engine/SDK, and FOSS Earth. There is no active standalone
SDK checkout under `gh/Felipegalind0`. The app keeps the fork.1 and fork.2 tarballs and exact
pre-adoption package/lock/workspace under
`docs/validation/evidence/jsbsim/rollback/fork1/` and `fork2/`, which are tracked. The bulk capture they were taken from stays in the gitignored `build/validation/jsbsim-in-tree-20260913/` tree.
App changes remain reviewable and uncommitted alongside the user's existing UI
and aircraft/evidence work; unrelated changes were not swept into a commit.

Normal use:

```sh
# From the canonical JSBSim root:
npm --prefix wasm ci
npm --prefix wasm run build
npm --prefix wasm run pack:build -- --release
# Explicit development capture, when source is uncommitted:
npm --prefix wasm run build:dev
# From 0sfs, identify the installed dependency:
npm run verify:jsbsim
```

The clean build requires a Git checkout of the recorded source revision; no
claim is made that an arbitrary exported source folder can reproduce its Git
identity. Builds and packing perform no Git or publication actions. Upstream
contributions should be extracted into focused changes after the existing
reviews are addressed; the full preservation import is our working fork history,
not a proposal to merge every downstream feature upstream at once.

## Hosted CI and final source update

The first local in-tree candidate was `b8820cf0` / fork.2. Its app acceptance
passed, but the new hosted WASM workflow correctly rejected an unrecognized
compiler banner. Official Emscripten 6.0.9 reports the revision
`4e4223852a0835923411059a3929907d7df1232e` in parentheses. The official tag, emsdk
release mapping, release dependency pin and banner implementation were checked;
an exact additional profile was added to the toolchain lock. Existing profiles
and rejection of foreign revisions remain. No broad version-matching exception
was introduced.

The fork's inherited coverage workflow also generated its report successfully
but failed uploading to Codecov because the fork has no configured upload token.
Coverage compilation, tests and report generation remain required. The report is
now saved as a GitHub artifact; only the unconfigured external upload on forks
is skipped with an explicit job summary. Upstream upload behavior remains.

The correction is commit
[`f7a80a6f064d22efe0591c20c8637b9c38179ba9`](https://github.com/Felipegalind0/jsbsim/commit/f7a80a6f064d22efe0591c20c8637b9c38179ba9)
on the published `feature/wasm-integration` branch. It produced a new immutable
fork.3 tarball; fork.2 was not overwritten. Final local SDK, app, browser, demo,
native regression and parity checks above ran against this version. Engine
`src/` and `tests/`, and SDK runtime/bindings/tests, are unchanged by this final
CI/toolchain/package-version correction.

[Hosted WASM build/test/pack and native isolation](https://github.com/Felipegalind0/jsbsim/actions/runs/34791576179)
passed on the final revision.
[Hosted coverage generation and artifact retention](https://github.com/Felipegalind0/jsbsim/actions/runs/34791576167)
also passed; Codecov upload was explicitly skipped on the unconfigured fork.
The pre-existing broader
[C/C++ platform workflow](https://github.com/Felipegalind0/jsbsim/actions/runs/34791576161)
had passed all native platform configurations and all three Python source-package checks at the latest observation. Its macOS MATLAB job failed before checkout because the runner could not resolve github.com; The Ubuntu and Windows MATLAB jobs were still running. A retry request was deferred by GitHub because the workflow was still active. This is an infrastructure failure, not a JSBSim compile/test failure; the full workflow is not claimed green. Branch/tag-conditioned release jobs are
not evidence of package publication.

Final app reports are `app-fork3-*`, `browser-artifact-fork3/report.json`,
`aircraft-ui-fork3/report.json`, `runtime-fork3-parity.json`, and
`native-fork3-regressions.log`. Hosted run/job JSON and completed logs are under
`hosted-ci/`. Earlier candidate/failure logs are retained. Only the tested native
feature branch was pushed; the existing upstream PR branches and app's mixed
working tree were not pushed or merged. No npm or site publication was performed.

The promised [completion reply](https://github.com/JSBSim-Team/jsbsim/pull/1504#issuecomment-5657291008) was posted and read back after the final local and WASM CI checks passed. It points to the working fork and requires no implementation work from upstream maintainers.

Final app preservation contains 89 changed/untracked files and exact staged/unstaged patches, verified in `final-app-working-changes.tar.gz` under the recovery root. Its integrity is recorded in the tracked `docs/validation/evidence/jsbsim/adoption/final-app-preservation.json`. The execution-evidence inventory, `evidence-manifest.json`, and the bundle itself stay in the gitignored `build/validation/jsbsim-in-tree-20260913/` tree and are not distributed.

## Subsequent upstream submission and validation update

The previously failed macOS MATLAB runner was retried; the broad workflow above
now passes. Focused upstream PRs #1505, #1506 and #1507 are open after new
exact-source checks. See [the submission record](jsbsim-upstream-submissions-2026-09-13.md).
The app remains on the accepted fork.3 identity above. Submission preparation
found missing IDBFS linkage and missing native exception-catch compilation in
that prior build; those corrections are tested in #1507 but require a new
downstream artifact/adoption phase before they are in the installed app.
The working branch and accepted artifact pointers were restored after submission.

## Adopted IDBFS and native-exception corrections — fork.4

The two build defects found during upstream submission preparation are now in
the full working integration and the installed app package. They were ported
selectively from `feature/wasm-package` (`c6d4063a`, PR #1507) onto ordinary
branch `feature/wasm-integration-idbfs-exceptions` at
`c328c7ab6d81e6de68b8db2115c35d350b226025`, whose parent is the accepted
`f7a80a6f`. Engine `src/` and `tests/` are byte-identical to that parent. The
review package's `@jsbsim/wasm@0.1.0` identity, upstream repository URL,
package-file inventory and its omission of the property-batch, gear-contact,
wheel and extension features were not adopted.

| Identity | Value |
| --- | --- |
| Engine and SDK commit | `c328c7ab6d81e6de68b8db2115c35d350b226025` |
| Repository content SHA-256 | `fed5354cb2a5eeaaf4114309d98658e73c851c5fef907d5deba9c23bf1986670` |
| SDK subtree SHA-256 | `c51c24715dd4f5911ba893e5f23b8ccb8e82161904615df9b6d356834bedff13` |
| Build input SHA-256 | `6870e498836f4285dc480eb37b7ea4daf0748ebcf9d4beca6672db66af2c56c6` |
| Artifact SHA-256 | `934fa6f415a323380d938bf72bc4fcbc5889625a6841f2bbac35948cf79b7fd1` |
| npm package | `@felipegalind0/jsbsim-wasm@1.2.4-fork.4` |
| Tarball SHA-256 | `957156d73ce44672621d0f0163fbefa753b53bddcc577b7f24da5ee25c4f1474` |
| Emitted/browser loader SHA-256 | `784e82c9cae536589f408a74abdda475fd72c56b18bb99129f66281ab3d53dc2` |
| Emitted/browser WASM SHA-256 | `64f6cbc0f364863cd2e8f4c8b3183c5fdb245101764878e49e44f617f8e9f885` |

Toolchain: Node 26.8.2, npm 11.19.1, CMake 4.4.3 and Homebrew Emscripten 6.0.9
on macOS arm64, with pinned Playwright 1.63.0 and Chromium 153.0.8010.12 for the
browser check. The native regression and parity builds use Apple clang.

| Check | Actual outcome |
| --- | --- |
| Clean SDK build | WASM/TypeScript compilation, typecheck and 50/50 tests in nine suites passed on clean `c328c7ab`; the five added tests are the malformed-propulsion recovery case and four persistence-boundary cases. |
| Release packing | Passed; `releaseEligible: true`. Earlier fork.1/fork.2/fork.3 tarballs were not overwritten. |
| Browser persistence | Passed in pinned Chromium 153.0.8010.12 across write, restore-and-delete and verify-deletion navigations: IDBFS linked, text and binary restored, deletions and updates persisted, downstream `PropertyBatch`/`GearContacts` bindings present, executive disposed after each phase, no page errors. No server or visible browser. |
| Negative control | With the engine `-fexceptions` block removed, a dirty diagnostic build gives 49/50 and the malformed-propulsion test fails on an escaped native exception (`excPtr: 278536`). That candidate was never promoted and the flag was restored to the committed source. |
| Native build isolation | Default configure keeps `BUILD_WASM_MODULE:BOOL=OFF`, emits no `build/wasm` directory, builds and starts `JSBSim 1.3.2.dev1`, has zero `-fexceptions` among 148 native compile commands, and still rejects `BUILD_WASM_MODULE=ON` with a native compiler. |
| Native regressions | 11/11 CTest targets passed after rebuilding from this revision: model loading/reload, clock reset, hold-down, trim, indexed engine state, turbine, turbine trim spool, ground reactions, wheel spin and logger. |
| Installed app identity | `npm run verify:jsbsim` passed: declared tarball, lock SHA-512 integrity, 14 recorded distribution files and exported identity all matched. |
| Installed app tests | 144/144 tests in 13 files passed, including the added fork.4 in-tree version case. The existing in-tree rejection case now guards the next unissued `1.2.4-fork.5`. |
| Production package | App TypeScript and Vite build passed; emitted loader/WASM hashes matched the installed package. `dist/jsbsim-artifact.json` still records `browserLoadedAssetsVerified: false`. |
| Actual browser | Headless production-bundle SDK boot and loaded-byte checks passed for C172, G1, G2 and G3. |
| Family UI | Keyboard/layout checks passed in wide, narrow and short viewports. |
| Native/WASM agreement | The same four matched scenarios passed at maximum normalized error `0.00014851043486171765`, identical to fork.3, consistent with unchanged engine sources. |
| Focused app lint | The four changed identity/artifact files passed with zero errors or warnings. |

Fork.4 accepts schema-2 identities for fork.2, fork.3 and fork.4, so each
retained tarball still verifies with its own declaration and lock. Exact
pre-adoption `package.json`, `package-lock.json`, identity module, AGENTS.md and
affected docs are preserved under
the tracked `docs/validation/evidence/jsbsim/rollback/fork3/`; the full
adoption record with every hash, log name and limitation is
`fork4-adoption.json` in that directory.

Remaining limitations: these are software, artifact and identity results only —
no aircraft calibration, AFM fit, terrain readiness or GPU claim. Browser
persistence was exercised with SDK-written fixtures; the application itself does
not enable IDBFS persistence. The hosted workflow now contains the browser step,
but no hosted run is claimed for this revision. Upstream review of #1505, #1506
and #1507 remains separate and incomplete. The renderer chunk-size warning,
jsdom React act warnings and the clipped lower LOD-select focus outline persist
unchanged.
