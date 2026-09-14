# JSBSim dependency centralization: execution record

> **Package renamed after this record.** `@felipegalind0/jsbsim-wasm` became
> `@felipegalind0/jsbsim` at fork.5 on 2026-09-13. Names, tarball filenames and
> hashes below are the ones in force at the time and still identify the retained
> artifacts on disk; they are deliberately not rewritten. See
> [the current runtime guide](../jsbsim.md) and `fork5-adoption.json`.

Started 2026-09-13. Status: centralization implemented and local acceptance complete; the clean pinned fork artifact is installed and verified in the app. This record distinguishes software acceptance from aircraft fidelity and upstream readiness.

## Preservation completed

The private recovery root is `/Users/felg/gh/.preservation/jsbsim-centralization-20260913T204345Z`. Its `summary.json` records 41 archives, 76,911 file/symlink entries and 3,280,739,749 bytes of captured content. Archive storage plus recovery samples occupied approximately 2.8 GiB at capture.

The four complete repository archives include their working trees, Git metadata, index, refs, reflogs, untracked files, ignored evidence/build outputs and installed dependencies. The SDK archive includes the old vendor submodule and its Git object database. Additional archives preserve relevant historical SF50 source overlays, raw/derived research, runtime binaries, logs and wheel patches from temporary locations. No original temporary directory was removed.

Each archived regular file was SHA-256 checked against a source manifest. A second source scan found no concurrent content changes. Representative source, untracked, binary and ignored files were restored and checked. All five restored Git object databases passed `git fsck --full --no-reflogs`; the complete object databases and reflogs remain in the archives, including objects outside ordinary branch history. The original index files were preserved; no staged changes existed in the initial inventory.

The vendor recovery check initially needed its relative working-directory path restored before Git could open the preserved metadata. After successful checks, the recovery copies of `.git` directories were renamed `git-metadata.verified`, preventing editor discovery as extra development repositories. This changed only newly created recovery samples; original archive entries and source repositories remained intact.

| Archive | SHA-256 |
| --- | --- |
| `app.tar.gz` | `5b3b552f611e32b1fd2c7a5ca8e3f3ae61a0e030a978b5cf861fdfbb4d6dc8c0` |
| `earth.tar.gz` | `773e09fe7932695b04ceafaa5c63242ea4508fd076180c3a4b22ec470f06f6c0` |
| `native.tar.gz` | `27ea7b4b944ea54af4c4845faaa5bd8ab29c6388d41c03ecd448ee86a0a1b190` |
| `sdk.tar.gz` | `dc1ae6197962695ab92cbb761315e720ca7c00e8460680edf35231ab3d3ee1de` |

Recovery means restoring selected paths into scratch, checking their recorded hashes and then restoring only intended content. Do not extract a complete old tree over newer work. These private archives include locally held evidence and metadata; their creation does not change redistribution rights.

## Native integration completed

An ordinary `integration` branch was created in each existing native and SDK checkout. The native `feature/wheel-spin-dof` branch remains at `24e085bf81b5ef8bab8500ab9d416571753b93cc`, and the SDK `feat/property-batch-gear-contacts` branch remains at `35d610095d71ea40c8f90a0f1e5a14e11006ee1c`. No PR branch was replaced or pushed.

The native integration preserves the wheel feature and adds separate local commits:

| Commit | Retained behavior |
| --- | --- |
| `b0332970` | Existing PR #1504 socket and `strerror_r` portability changes |
| `fc13a97b` | Existing turbine member N1/N2 zero-time initialization fix and its regression |
| `aeb43b705596883c8cbeb6cac80464af7cc1d76b` | Plain-text Emscripten logging at the current logger owner, preserving native ANSI defaults; patch-disposition documentation |
| `61b3132947dde7bc46827fd9fe3eef31193336d2` | Unbind live properties before model destruction, rebind executive properties after replacement, and recover from failed partial loads |

The native source was clean after these commits. `doc/centralized-source-migration.md` in the native repository records all seven sections of the old compatibility patch and why each is retained, moved or unnecessary at this source revision. Upstream had moved logging into `FGLogConsole`; losing the old `FGJSBBase.cpp` location did not remove the need for plain-text WASM behavior.

The durable native environment is `.venv/` and `build/native/` in the canonical native repository. Configure/build passed. Eight focused CTest targets passed in 36.59 seconds: turbine trim/spool, turbine, indexed engine properties, trim, wheel spin, ground reactions, hold-down and logger. The logger target includes 43 CxxTest cases. Exact toolchain, commands and binary hashes are in the native migration record. The optional socket loopback test was not run because `telnetlib3` was absent from the offline cache. Native compilation alone does not verify browser socket behavior.

## Native reload failure caught by the new SDK gate

The first coherent local SDK attempt, `dd81bae46e74-F96sOJ`, compiled the bindings, WASM and TypeScript and passed typechecking, but failed two of 34 SDK tests. No accepted artifact or app dependency was promoted. Repeated model loads and successful-load/missing-load/destruction sequences corrupted the heap, including a minimal raw executive case without SDK batches or gear readers.

Native reproduction and AddressSanitizer traced the defect to property bindings reading a destroyed inertial model during unbinding. The correction belongs in native JSBSim. After `61b31329`, **11/11 native CTest targets passed**, adding six model reload cases, model loading and simulation-clock reset to the earlier eight targets. **Six standalone AddressSanitizer sequences passed** with no sanitizer errors or failed-property-tie warnings. Exact evidence and binary identities remain in the native migration document and ignored `build/native/model-reload-diagnostic/` directory. The first rejected SDK log is retained under `0sfs/build/validation/jsbsim-centralization-20260913/`.

App diagnostic tests against that rejected build also demonstrated an application initialization-order defect: engine startup followed the final state evaluation, leaving N1=100 at a 0.35 throttle command until another evaluation produced N1=54.5. Bootstrap, location reset and saved-state restoration now perform the normal zero-time evaluation after engine startup and preserve physical actuator positions. They never write N1/N2. Three before-fix failures became passes; 39 tests across six files passed in this diagnostic configuration. These runs used explicit temporary test aliases and did not establish installed-package acceptance.

## Source archive and installation design

The SDK lock selects the full native commit above and a repository-relative archive under `sources/`. It was produced with `git archive` from the clean integration commit, gzip-compressed with a fixed timestamp, extracted by the SDK resolver and content-verified.

- Archive: `sources/jsbsim-61b3132947dde7bc46827fd9fe3eef31193336d2.tar.gz`
- Archive SHA-256: `07fc24b07825821132284152b5cd0399ffe205badc35f1c42b4429288628ea69`
- Extracted content SHA-256: `c249a62174ef743d9b22ee252621243decbc2dfff633e188e37dea23b01eb406`

The first `aeb43b70` archive and lock are retained under the SDK's ignored `build/archive-history/`, together with the rejected build's frozen source.

The content digest covers a sorted JSON array of POSIX paths, normalized executable modes and file SHA-256 values. The source archive contains no `.git` directory. The fork origin and commit remain explicit in `jsbsim-source.lock.json`.

A checked-in native archive and an immutable, repository-relative SDK package archive provide clean-checkout inputs without requiring a package publication during migration. The accepted SDK package is `@felipegalind0/jsbsim-wasm@1.2.4-fork.1`; its exact identities are recorded below. No npm namespace ownership or publication is claimed by assigning a local package name.

## Accepted SDK and app artifact

| Identity | Value |
| --- | --- |
| Native integration commit | `61b3132947dde7bc46827fd9fe3eef31193336d2` |
| SDK integration commit | `61ee9486651bca36f4a9b2f927953d716985e391` |
| SDK captured content SHA-256 | `ea23b430fd26f01e05272381c84e093e2160debe0cd501c863bd287478928bc8` |
| Build input SHA-256 | `16652e43113a49e41ccf889d6214eb6f0678cb7055e8387543d7926ecccb868d` |
| Completed artifact directory | `build/artifacts/98e9df4f8aabcf4c4b23161a7cf72fd5070fd508f953a0b72998c91f5f9fb48c` in the SDK |
| App tarball | `deps/felipegalind0-jsbsim-wasm-1.2.4-fork.1.tgz` |
| Tarball SHA-256 | `81369af4b23e71c4a067ae730cb6a9ac8ff95fa9d1d9ceb80ff1bdc412d50628` |
| SDK entry SHA-256 | `4bda47aa1a410b485a813cdaff330643a08b6f71c2ebabd4dfd5c37b9798bdd7` |
| Loader SHA-256 | `70b5b7c2d9c5813fb02dae7731f1e12211dca72373848531a47a842ad51a5340` |
| WASM SHA-256 | `b0acdb992f850c9b8028702e27ba4d88f9922e477522992f6da4654bd27cbdc1` |

The build used clean committed inputs, Node 26.8.2, npm 11.19.1, Homebrew Emscripten 6.0.9-git, LLVM 24.0.0git and CMake 4.4.3 on darwin/arm64. The Emscripten configuration digest is `412bf234dd0519a08a738b4128eeae4158c7723a78843bcf610dc75b01348cc3`; its actual configuration is preserved privately with the build attempt. The lock explicitly distinguishes Homebrew and emsdk banners using their release provenance; it does not silently strip a version suffix.

Generation, compilation, fixtures and metadata use one captured native identity. Negative tests cover changed archives, source/lock/descriptor substitution, stale CMake caches and generated bindings, edited frozen test sources, conflicting local selection and compiler overrides. Successful output is assembled and promoted atomically; failed attempts remain inspectable. Normal builds and packing never stage, commit, tag, publish or push. Repeated packing of the same accepted artifact produced identical tarball/report bytes. This is a packing result, not a claim of bit-identical compiler rebuilds. The final local and pinned builds share native/SDK content digests but produced different WASM bytes; both are recorded, and only the pinned artifact was packaged and adopted.

The native source archive and SDK tarball live inside their owning repository trees. Include the app tarball, declaration, lock and import changes together when committing/reviewing the app migration; the app's existing UI/evidence changes have not been swept into a new commit. Native and SDK integration commits are local and have not been pushed. No npm publication is needed to install this artifact.

## Completed software acceptance

| Check | Actual outcome and scope |
| --- | --- |
| Native regression suite | 11/11 CTest targets passed; six new model reload cases plus turbine, indexed properties, trim, wheel, contact, hold-down, loading, clock and logger coverage. |
| Native memory regression | Six standalone AddressSanitizer reload/failure sequences passed after reproducing the original invalid memory access. |
| Coherent local SDK | The final clean integration source also passed the full explicit local build, typecheck and 43/43 tests. Its immutable artifact is retained; the accepted pinned pointer was verified and restored afterwards. |
| Clean pinned SDK | WASM compilation, TypeScript bundle/typecheck and 43/43 tests passed, including 18 source-contract cases, mock failure paths and real-WASM runtime/extension tests. |
| SDK follow-up workflow | Immutable repeat packing, demo typecheck/production build and 43/43 accepted-workspace recheck passed. Hosted CI was not run. |
| Installed app runtime/UI | 97/97 tests across 11 focused files passed against the actual installed fork. |
| Evidence and packages | 125/125 tests across 15 validation/catalog/variant files passed. No fitting or source processing was rerun. |
| Focused lint | ESLint passed for 48 integration TS/TSX/MJS files after removing unused declarations and an unnecessary string escape. |
| App production build | Artifact preflight, TypeScript, Vite and post-build asset hash verification passed. |
| Real browser asset acceptance | Four of four C172/G1/G2/G3 starts passed using the actual production bundle. Runtime identity, fetched loader/WASM and each model closure matched the installed/locked artifact. |
| Aircraft-family component UI | Three viewport cases passed keyboard arrows, Tab and Enter/Apply with the actual components and styles; screenshots and measured layout bounds were retained. |
| Native/WASM parity | Four of four matched aircraft scenarios passed, with zero out-of-budget comparisons. |
| Recovery/install | Exact prior package files and declaration/lock restored and instantiated, then a clean locked candidate install passed in a controlled layout without native or SDK source siblings. |

These are separate scopes; do not add historical/overlapping counts as unique coverage. Real browser tests intercepted local asset requests through headless Chrome's debugging protocol. They started no development/preview server, used no visible GUI, and closed Chrome afterwards. Terrain/font requests were deliberately blocked, so this does not certify terrain readiness, live-map access or GPU performance. Existing large-chunk/React act warnings remain. A minor LOD-select focus-outline clipping measurement persists in wide/narrow component layouts; the controls remain usable, and keyboard navigation scrolls Apply into view with its full focus outline.

### Matched runtime conditions

`scripts/check-jsbsim-runtime-parity.mjs` rebuilt the canonical native Python extension from the clean selected commit before loading it. The actual loaded extension SHA-256 was `41ba754f2578a83f3fa44ceddfe1277c53fa2877099b114eaf6da34f42205bdf`. Its path, source commit, commands and logs are recorded with the report; a stale extension cannot qualify by source label alone.

Both runtimes loaded identical app-manifest XML closures for `c172p`, `sf50`, `sf50-g2` and `sf50-g3`. Initial conditions were 5,000ft, geodetic latitude44.977753/longitude-93.265011, heading300deg, zero roll/pitch and zero wind. C172 used100KIAS and throttle0.65; SF50 used130KIAS with zero-time throttle checks0/0.35/1/0, then0.35. The trajectory advanced240 steps at1/120s with a bounded elevator/aileron input between steps61–120. Reset exercised the reset API and a new location/altitude, then checked the first accepted step. Loading/CG, fuel, atmosphere, gear, engine state, attitude, rates and clocks were recorded in named units. Missing properties, nonfinite states and incorrect reset outcomes fail independently of cross-runtime equality.

The declared numerical allowance was `1e-7 + 1e-8 × max(abs(native), abs(WASM))` per observed property, using each property's named unit for the absolute floor. Maximum error divided by its allowance was0.00014851043486171765. This tests short software trajectories and reset agreement; it is neither AFM fitting nor independent real-aircraft validation.

## Vendor retirement and editing locations

After the passing clean pinned build, the old `vendor/jsbsim` working tree, inactive `.git/modules/vendor/jsbsim` metadata and historical canonical SDK `dist/` were removed. Before removal, all 1,344 recorded retirement entries were archived, verified and checked unchanged again. Recovery archive: `vendor-retirement-preparation.tar.gz` under the preservation root, SHA-256 `b6e54aa19fe61f199cf5dce04baaf50ec1d121fa51d4b1a9d1c71907cb32acc4`. The SDK Git link, `.gitmodules` and local vendor registration are retired. The tracked old compatibility patch remains provenance; no preparation script applies it.

Open [the canonical development workspace](../../flight-development.code-workspace) for named app, native engine, SDK and FOSS Earth roots. Native and SDK remain clean on ordinary `integration` branches; original PR branches are retained. Captured sources and build attempts under ignored `build/` have no nested Git working directory and are build evidence, not editing locations. Canonical generated SDK files are documented historical editor previews; builds always regenerate their own bindings.

Use the [normal build/install instructions](../jsbsim.md). The SDK's `build/last-build.json` and `build/last-package.json` identify accepted outputs; canonical `dist/` is not a live dependency. The application consumes its exact repository-relative tarball. FOSS Earth remains `file:../foss-earth` and owns rendering/terrain; its repository was unchanged.

## Recovery and remaining work

The controlled recovery restored 13 exact files, including the prior app declaration/lock and complete installed `@0x62/jsbsim-wasm@1.2.4-beta.4` package. Its restored WASM hash matched `2c79b90ff12c7cd94b36a9af8db07e0bde19ffe4e2716816dc6cea8ad4f8de92`, and a real executive instantiated. That historical package still needs manual executive deletion in this isolated recovery probe; this limitation is not reintroduced into app code.

The same controlled layout then installed the current declaration/lock/tarball with `npm ci --ignore-scripts --no-audit --fund=false`, and package identity/integrity verification passed. An offline attempt lacked ordinary registry dependency `yargs-parser` 18.1.3; normal locked installation succeeded without changing the lock. The only sibling link needed for the app layout was FOSS Earth. No user source was overwritten. Retain previous and accepted manifests and restore only selected dependency paths; the current application source imports the fork, so testing a complete historical app also requires its matching historical import/config changes rather than mixing old binaries with current identity checks.

Local reports and screenshots are under `0sfs/build/validation/jsbsim-centralization-20260913/`, including `runtime-parity.json`, `browser-artifact/report.json`, `aircraft-ui/report.json`, `dependency-recovery/recovery-report.json` and exact SDK records. A hash manifest inventories durable evidence. Raw compiler/configuration captures and native sanitizer evidence remain in their canonical repositories' ignored build directories. These are durable local caches, not automatically distributed Git artifacts.

Open upstream PR review work remains separate: native #1502/#1504 and SDK #8 were preserved and not updated. The [contribution ledger](../jsbsim-upstream-contribution-policy.md) distinguishes verified downstream adoption from readiness of an extracted upstream contribution. Hosted CI and publication were not exercised. The optional native socket loopback test remains unrun.

SF50 aerodynamics/installed thrust/TSFC/loading/CG/control/friction estimates and distinct G2/G3 calibration remain unresolved. The 600/220 same-source AFM allocation, whole-flight boundaries, 41 recorder dispositions and zero eligible recorder fitting cases remain intact. No aircraft coefficient changed, no record was promoted to a calibration case, and no AFM/runway performance fit was rerun by centralization.

Final local preservation adds `app-centralization-working-changes.tar.gz` (all current app changed/untracked files plus exact staged/unstaged patches and instructions) and complete `native-final.bundle` / `sdk-final.bundle` histories under the same private recovery root. File hashes, bundle verification and final repository identities are recorded in `final-preservation.json`. This preserves the reviewable app changes without committing unrelated UI/evidence work.
