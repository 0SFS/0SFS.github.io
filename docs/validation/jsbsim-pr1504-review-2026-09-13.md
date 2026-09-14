# JSBSim PR #1504: clarification and WASM integration direction

Reviewed 2026-09-13. The factual clarification was posted and the PR description corrected; no source commit, branch, dependency or installed artifact changed. The original direction below was a recommendation. The user subsequently authorized implementation in our fork; the roadmap was posted and implementation is recorded in [the in-tree execution record](jsbsim-in-tree-integration-2026-09-13.md). No upstream acceptance is implied.

## Terminal-color provenance

The [patch in our SDK fork](https://github.com/Felipegalind0/jsbsim-wasm/blob/27b353e679e3948a9daa78edac4acd917f3bb862/patches/jsbsim-emscripten-compat.patch#L9-L29), introduced by `27b353e6`, suppressed eleven `FGJSBBase` ANSI arrays under `__EMSCRIPTEN__`. Upstream [0b688c8 / #1487](https://github.com/JSBSim-Team/jsbsim/commit/0b688c801c52d800f75d5c41e5434ce5d7618e88) moved those arrays into `FGLogConsole`. Thus the old hunk stopped applying; terminal coloring itself remained.

PR #1504 at `d47fd2e38feba9cc40340ac9740356f6f7afc37d` changes only socket includes and POSIX `strerror_r` selection. Its logger still defaults to highlighting. Local integration `aeb43b70` separately adapts the plain-text Emscripten default to the new logger; it is not part of this PR. The original PR sentence conflated migration background with changes in the diff. The code establishes its technical referent, but no original PR-body creation artifact was located in the bounded search, so the previous AI author's reasoning is not independently recoverable.

Posted reply: https://github.com/JSBSim-Team/jsbsim/pull/1504#issuecomment-5656709734. Description and comment were read back from GitHub; the PR head was unchanged. Before/after public PR data and the exact reply are preserved locally under `build/validation/jsbsim-pr1504-20260913/`.

## What Sean's comment establishes

[Sean's comment](https://github.com/JSBSim-Team/jsbsim/pull/1504#issuecomment-5645415466) reports earlier outreach to 0x62 about potential integration and asks whether this PR is preparation for a WASM/Emscripten build option. It does not establish agreed ownership, scope or a decision to absorb the complete SDK/demo.

PR #8 was opened on September 11 and remains open; 0x62 has not replied there, while Sean has. The SDK repository is not archived; GitHub reports its most recent push as May 16. These facts do not establish abandonment or refusal. Existing SDK #8 and native #1502/#1504 remain separate contributions with their existing review issues.

## Python integration precedent

Follow-up research on 2026-09-13 checked upstream master `14c19022943f5850daf2c6b90554050b3139b853` through the GitHub API. The root and Python CMake files, Python package metadata/API and release workflow match our canonical native checkout byte for byte. The upstream test list was read separately because our integration branch adds regressions. Earlier validation had used the Python bindings; the end-to-end package/release audit was completed in this follow-up. This was source inspection only: no build, test, package publication or additional PR reply was performed.

- [The Python target](https://github.com/JSBSim-Team/jsbsim/blob/14c19022943f5850daf2c6b90554050b3139b853/python/CMakeLists.txt#L52-L64) compiles Cython bindings and links the enclosing project's `libJSBSim`. It installs a public Python package and command-line entry point. This is the same C++ engine exposed to another language, not a second physics implementation.
- [The public API](https://github.com/JSBSim-Team/jsbsim/blob/14c19022943f5850daf2c6b90554050b3139b853/python/jsbsim.pyx.in#L824-L916) adds package-data discovery, default paths, native-object ownership, dictionary-style property access with caching and Python errors. Elsewhere it adapts logging and linearization results to Python/NumPy. The precedent includes language-specific usability, not only low-level bindings.
- [Package installation](https://github.com/JSBSim-Team/jsbsim/blob/14c19022943f5850daf2c6b90554050b3139b853/python/CMakeLists.txt#L16-L64) includes generated documentation support, typing stubs/markers, aircraft/engine/system/script data and licenses. [Package metadata](https://github.com/JSBSim-Team/jsbsim/blob/14c19022943f5850daf2c6b90554050b3139b853/python/pyproject.toml.in) uses the enclosing project version and defines a source distribution containing the native source and Python integration.
- [The repository workflow](https://github.com/JSBSim-Team/jsbsim/blob/14c19022943f5850daf2c6b90554050b3139b853/.github/workflows/cpp-python-build.yml#L509-L726) builds a Python source package, installs and exercises it on Linux/macOS/Windows, builds wheels on tag pushes and checks wheel installation, import/initialization, typing and package-data discovery. Its stable-release job depends on those package jobs and publishes to PyPI. These are configured upstream checks, not new validation runs by us.

The architectural inference is strong: propose the WASM bindings **and usable JavaScript/TypeScript package**, with tests, documentation and distribution, alongside the native engine. The Python analogue of `pip install jsbsim` is an installable npm package containing the JavaScript loader, WASM binary and TypeScript declarations. It need not use the same data-bundling policy: browser download size, asynchronous loading, virtual filesystems and explicit native-handle cleanup require WASM-specific design and verification.

This answers much of the repository-organization question ourselves. Maintainers still decide contribution scope, supported environments, package/release ownership and review sequence. Python's property cache is useful context for SDK #8, but does not resolve the requested cache-only benchmark or approve our batching design. Neither precedent nor Sean's interest establishes that all downstream features are ready to merge.

## Recommended direction

An optional WASM component in JSBSim could make native API changes, generated bindings and regression tests reviewable together. JSBSim already hosts other bindings and integration subprojects. Preserve an independently consumable JavaScript/TypeScript package: source consolidation does not require the flight app to compile C++ or depend directly on repository internals.

Propose following the Python model: maintain the WASM target, bindings and consumable JavaScript/TypeScript package together, then agree on review sequence and support/release responsibilities. A proposed `BUILD_WASM_MODULE` option and `wasm/` directory are examples, not agreed names. Native builds must keep working without Node/Emscripten. An in-tree WASM build should use the enclosing native source revision; do not copy our SDK’s native-source archive into JSBSim and recreate two source selections. A browser/Node/worker runtime needs agreed API, memory/lifetime behavior, filesystem/loading services, tests, supported toolchains and package/release ownership. The rocket demo, personal fork naming, aircraft calibration and unsettled batching/wheel feature discussions need not enter the first integration PR.

Implement on an ordinary feature branch in the canonical native fork under the user's authorization. Resolve work we can handle ourselves; involve maintainers when their input is actually required for upstream acceptance or maintenance. Preserve SDK authorship, source identities and all downstream improvements; use focused commits so existing open PRs can remain independent. Keep the currently accepted pinned SDK/app artifact as the reference and rollback until the integrated output passes native, real-WASM, package, browser and app adoption checks. Do not immediately remove the SDK fork or overwrite the verified integration branches.

## License and attribution

The [SDK's MIT license](https://github.com/0x62/jsbsim-wasm/blob/master/LICENSE) grants modification, merging and redistribution subject to retaining its copyright and permission notice. It names Benedict Lewis. A separate personal permission grant is not required for those licensed acts; credit must include the actual notices, not only an acknowledgment in a PR.

The native JSBSim code remains under its applicable LGPL terms. [JSBSim already documents different licenses for subprojects](https://github.com/JSBSim-Team/jsbsim/blob/master/README.md). Importing MIT wrapper code does not convert the linked native engine or other components to MIT. Preserve applicable component/third-party notices and the corresponding-source obligations of distributed native/WASM artifacts. Maintainer agreement about accepting and maintaining a contribution is separate from the permission granted by its copyright license.

## Reply to Sean — posted

Posted and read back: https://github.com/JSBSim-Team/jsbsim/pull/1504#issuecomment-5657061563. The existing PR code/head remained unchanged.

> @seanmcleod70 Yes, I'd like to work towards WASM support in JSBSim. This PR handles two fixes our Emscripten build needs.
>
> My thought is to follow the Python package's setup: keep the bindings and JavaScript/TypeScript package here, build them from the same C++ source, and publish a package people can install. I'd build on 0x62's work and keep his attribution and license notices.
>
> I'm going to bring the SDK into my JSBSim fork, preserve the fixes we've already made, and have it build against the engine in the same checkout. Then I'll check the native and WASM builds, package it, and switch my simulator over to that package. Once it's working there and the tests pass, I'll follow up here with the results and a plan for upstreaming it in smaller PRs.

## Working integration follow-up — posted

The user-authorized roadmap was executed in our native fork. The [completion reply](https://github.com/JSBSim-Team/jsbsim/pull/1504#issuecomment-5657291008) links the published source and passing WASM CI. It was read back, and PR #1504 remains at `d47fd2e38feba9cc40340ac9740356f6f7afc37d`. The [execution record](jsbsim-in-tree-integration-2026-09-13.md) records final fork.3 app adoption, preservation and hosted/local check limits. No maintainer implementation work was requested.

## Focused upstream submissions — completed

The implementation follow-up is now submitted as
[PR #1507](https://github.com/JSBSim-Team/jsbsim/pull/1507), with explicit #1504 and
[new lifetime PR #1506](https://github.com/JSBSim-Team/jsbsim/pull/1506)
prerequisites. The independent turbine correction is
[PR #1505](https://github.com/JSBSim-Team/jsbsim/pull/1505).
[Exact source, validation and preservation details](jsbsim-upstream-submissions-2026-09-13.md)
record preparation and actual outcomes. #1504 remains the original two-file
portability change; the full downstream import was not submitted wholesale.
