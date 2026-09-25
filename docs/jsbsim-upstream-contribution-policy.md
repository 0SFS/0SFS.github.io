# JSBSim and jsbsim-wasm upstream contribution policy

Adopted: 2026-09-13. Scope: reusable native engine and WASM SDK work in our forks. This records policy and contribution candidates; it does not submit changes or certify unfinished work as stable.

## Policy

Contribute reusable fixes and features to their upstream project once they are fully implemented, their behavior and public interfaces are settled, and relevant tests demonstrate stability on the exact contribution. Maintaining our own integration forks lets the application use verified improvements while upstream review proceeds. Keeping those forks does not justify retaining general improvements only downstream.

“Unlikely to be revised” means there is no known unresolved correctness issue, planned design rewrite, unsettled ownership contract or pending API decision. It does not mean software can never change. Use evidence appropriate to the change, without an arbitrary waiting period. A narrow engine bug fix need not wait for complete SF50 calibration or unrelated feature work.

Implement native dynamics, initialization and platform compatibility in `Felipegalind0/jsbsim`, targeting `JSBSim-Team/jsbsim`. Implement generic bindings, SDK lifetime, diagnostics and SDK build behavior in `Felipegalind0/jsbsim/wasm`, alongside the native engine. The user authorized this in-tree arrangement following the Python package precedent. Offer stable, focused integration work to `JSBSim-Team/jsbsim`; retain 0x62's authorship and notices, and preserve the existing SDK PR #8 independently while its review continues. Keep aircraft calibration, application UI, fork package names and personal checkout paths in their owning downstream projects. Do implementation, research and validation we can handle ourselves; involve upstream maintainers when their decisions or expertise are necessary. Our productive local setup can proceed without waiting for upstream architectural approval. Acceptance and release ownership remain upstream decisions.

## Validation tooling and evidence

Follow the repository-wide [validation layout](validation/layout.md).
Permanent engine regressions live in JSBSim `tests/` and travel with the fix.
Retained downstream JSBSim reproduction tools live in
`scripts/validation/jsbsim/<topic>/`; retained evidence lives in top-level
`validation/evidence/jsbsim/<topic>/`. Documentation links to those records.
Scratch and raw outputs stay in the owning repository's gitignored `build/`.

For PR #1502, the twelve tools have moved to scripts, and the evidence tree
moved out of docs on 2026-09-19
([evidence relocation record](validation/evidence-relocation-2026-09-19.md)).
Preserve historical logs, hashes, approval receipts and rollback snapshots.
These path changes do not require another engine commit or imply rerunning
past checks.

## Readiness gates

All applicable gates must be satisfied before a new contribution is submitted as complete:

| Gate | Required evidence |
| --- | --- |
| General usefulness | A concrete defect or use case outside our application; the solution belongs at the proposed layer and avoids application-specific assumptions. |
| Completed design | Implementation, error paths, configuration, units and public behavior are documented. No known correctness or API decision is deferred to after submission. Optional features specify defaults and compatibility. |
| Focused scope | An independently understandable change on the correct upstream base. Include necessary tests/docs; exclude unrelated dirty work, generated noise and fork release configuration. Declare unavoidable dependencies explicitly. |
| Exact-source verification | Record upstream base, candidate commit, native dependency, toolchain/options and exact built artifact where applicable. Run relevant checks on those inputs. Historical results from another revision or a mixed-source SDK build do not qualify. |
| Meaningful tests | A bug regression demonstrates failure before and success after the fix. Features exercise intended behavior, boundaries and important failure paths. SDK tests include the real WASM runtime for native lifetime/memory claims. Preserve relevant existing regressions. |
| Stability and compatibility | Demonstrate affected initialization, repeated-use, teardown and reset behavior. Check supported platforms affected by the change. Record failures, skipped coverage and numerical tolerances; justify their disposition. No unresolved regression is hidden by a downstream workaround. |
| Supported claims | Performance claims include reproducible workloads and relevant alternatives. Physics claims include appropriate analytical or invariant checks. Native/WASM agreement and successful builds alone do not prove real-aircraft fidelity. |
| Reviewability | The PR explains the problem, resulting behavior, design choices and validation limits. Resolve known substantive review concerns before calling the contribution stable. CI success and automatic mergeability are not maintainer approval. |
| Maintainability and provenance | Follow current upstream contribution requirements and style. Use redistributable, reproducible fixtures and retain attribution. Provide source/tests maintainers can run without our local corpus, absolute paths or private artifacts. |

Scale verification to the change. A portability fix needs affected compiler/platform checks; it does not require an aircraft calibration campaign. A wheel dynamics feature has a larger numerical and compatibility burden than a two-line initialization correction. Repeat checks when the candidate, dependency or relevant environment changes, rather than accumulating redundant runs.

## Contribution workflow

1. Track each candidate in the owning repository with its purpose, source commits or preserved working content, intended upstream, dependencies, unresolved decisions and acceptance evidence. Preserve all work before extracting changes. The completed
[centralization spec](old/jsbsim-dependency-centralization.md) is historical.
2. Inspect existing upstream issues, PRs and current contribution instructions before preparing a new submission. Continue existing PRs #1502, #1504–#1508 and #8 where applicable. Do not duplicate them or bundle a separate defect into a feature PR simply because it shares the current local branch.
3. Prepare a focused contribution on an ordinary branch in `/Users/felg/gh/Felipegalind0/jsbsim`, starting from `master`. Do not delete historical `integration` or PR branches. Do not overwrite user changes, stage the whole tree, or rewrite published history as an incidental cleanup operation.
4. Complete the readiness evidence and record the final candidate identity. Build and test the same inputs that will be submitted. SDK evidence must use coherent generation/compilation sources and an identified package; an application's manual native-handle deletion or spool-property reset cannot validate the SDK/engine fix.
5. Submit or update the existing PR within the standing authorization for the task. Local preparation, pushing a branch, creating a PR and publishing a package are distinct actions. This policy update performs none of them. Review feedback may require revisions even after our readiness gates pass; record and retest affected changes.
6. Track upstream review, merge and release separately from downstream adoption. After merge, identify the actual upstream commit/release and verify that it contains the intended behavior before replacing our patch or pin. Confirm the consuming application loads the new artifact. Keep the prior artifact and recovery path until the replacement passes its adoption checks.

Use separate ledger fields for **readiness** (candidate, blocked, ready with evidence), **upstream state** (not submitted, open, merged, closed) and **downstream adoption** (local source, built, packaged, installed, verified in app). An open or merged PR does not imply the application contains that change. New review findings can return readiness to blocked without losing submitted work.

For an existing PR that predates this policy, record outstanding gaps and address them in that PR; do not close or resubmit it solely to satisfy a new process. When a feature still has material design questions, resolve them before representing it as finished.

## Submitted contributions after focused extraction

The user authorized submission after completing preparation. Current native
[PR #1505](https://github.com/JSBSim-Team/jsbsim/pull/1505) covers turbine spool
consistency and [PR #1506](https://github.com/JSBSim-Team/jsbsim/pull/1506) covers
model replacement lifetime. Each independently targets upstream master and has
causal before/after regression evidence. Core SDK ownership/diagnostics and the
in-tree package are in [PR #1507](https://github.com/JSBSim-Team/jsbsim/pull/1507),
which explicitly carries #1504/#1506 prerequisites. It excludes the wheel and
batching/gear features with separate reviews. All three are open, non-draft;
maintainer workflow approval and review remain pending.

[The submission record](old/jsbsim-upstream-submissions-2026-09-13.md)
records exact heads, native/sanitizer/WASM/browser/package checks, passing
hosted WASM CI, preserved branches, and the restored downstream environment.
This supersedes the **not submitted** states below for these specific scopes.
Child APIs from SDK #8 and its requested benchmark remain separate. The full
working integration remains preserved. The IDBFS and native-exception build
corrections were later adopted into the app as fork.4, and the app now installs
fork.7.

[PR #1508](https://github.com/JSBSim-Team/jsbsim/pull/1508) (turbine trim fuel
flow) was opened on 2026-09-14 on top of #1505.

## Open PR review: 2026-09-14

[The turbine evaluation proposal](proposals/jsbsim-turbine-evaluation.md)
records the recommended long-term design for #1505/#1508: explicit evaluation
intent, shared engine calculations and completion before initialization returns.
It is a local proposal, not an implemented fix or an agreed plan for every open
PR; caller compatibility and delivery decisions remain open.

[The review record](validation/jsbsim-open-pr-review-2026-09-14.md) reads every
open PR and has the evidence. It changes readiness as follows:

- **#1505 and #1508 are back to blocked.** Both assign spool speeds (#1505) and
  fuel flow (#1508) in `FGTurbine::Trim()` for every engine. `Trim()` runs for
  shut-off engines too, so those come out of RunIC spooled and then burn fuel
  as it bleeds off.
  - Natively, the F-16 fixture shows N2 85.9 % and 7,275.5 lb/h against 0 on
    `master`.
  - In the app, the SF50 at fork.7 shows N2 81.4 % and 344.7 lb/h after a
    location reset.
  - Fix both PRs and add regressions for shut-off engines before asking for
    review.
- **Unanswered comments:**
  - Sean on #1508 (2026-09-14): set fuel flow in the trim-finished block
    instead;
  - bcoconni's analysis on #1502 (2026-09-13);
  - Sean's cache-only benchmark question on SDK #8 (2026-09-12).
- **CI:** it has not run on #1505–#1508. The workflow runs are `action_required`,
  waiting for maintainer approval.
- **Coverage on #1502:** the 0 % patch coverage is instrumentation, not missing
  execution. Upstream's coverage job builds with `-DBUILD_PYTHON_MODULE=OFF`, so
  Python regressions are never measured. A CxxTest would give real coverage.
- **#1507's scope** (6,429 lines, a new workflow, an MIT subtree) has no
  maintainer agreement yet. Our #1504 comment promised a plan for smaller PRs.
- **Turbine idle fuel flow** (`c70be257`) is in use by the SF50 and merges
  cleanly onto `master`, but has no PR.

#1504 and #1506 need nothing from us. The prerequisite commits carried in #1507
and #1508 have the same diffs as the PRs they come from.

## Candidate ledger before extraction: 2026-09-13

This is an assessment of suitability and remaining gates, not authorization to publish. Live GitHub PR bodies, comments and check states were read on this date. The [centralization execution record](old/jsbsim-centralization-2026-09-13.md) records subsequent local implementation and exact validation; those results do not resolve existing upstream review concerns.

| Work and destination | Readiness | Upstream state and downstream adoption |
| --- | --- | --- |
| Emscripten portability → native JSBSim | Functional native/Emscripten integration is verified. The terminal-color question is answered in the [source-linked clarification](https://github.com/JSBSim-Team/jsbsim/pull/1504#issuecomment-5656709734); the PR description now names only its actual socket/strerror changes. Maintainer acceptance and the WASM-integration scope discussion remain open; preserve focused scope. | Existing [PR #1504](https://github.com/JSBSim-Team/jsbsim/pull/1504), retained. Socket/strerror changes are in local `b0332970`; logging behavior is retained separately in `aeb43b70`. Both are in the verified installed artifact. Live socket loopback remains unrun. |
| Turbine zero-time N1/N2 consistency → native JSBSim | Strong focused correctness candidate. Native regressions and installed app bootstrap/reset/restoration plus matched WASM scenarios pass. Extract on the correct upstream base and run the focused before/after evidence there before submission. **2026-09-14: blocked.** It also spools engines that are shut off (see the open PR review). | Submitted as [PR #1505](https://github.com/JSBSim-Team/jsbsim/pull/1505) (`07eba55f`), open; CI awaiting maintainer approval. Local `fc13a97b` is retained in native integration `61b31329` and in every installed package since. No app N1/N2 reset masks it. |
| Model replacement property lifetime → native JSBSim | Strong focused correctness candidate. Native invalid memory access reproduced before the fix; 11/11 CTest targets, six sanitizer sequences and real-WASM reload/failure/destruction tests pass afterwards. Preserve the six-case regression and independent scope when extracting. | Submitted as [PR #1506](https://github.com/JSBSim-Team/jsbsim/pull/1506) (`a25956a2`), open; CI awaiting maintainer approval. Local `61b3132947dde7bc46827fd9fe3eef31193336d2` is packaged and verified in the app. [Merged #902](https://github.com/JSBSim-Team/jsbsim/pull/902) is a related atmosphere-replacement precedent, not this complete model-reload correction. |
| Turbine trim fuel flow → native JSBSim (added 2026-09-14) | Causal before/after regression (`TestTurbineTrimFuelFlow`, 3 methods) and fork.5/fork.6 controls. **Blocked:** it also assigns fuel flow to engines that are shut off, and Sean's alternative placement is unanswered. | Submitted as [PR #1508](https://github.com/JSBSim-Team/jsbsim/pull/1508) (`7511df10`, carries #1505), open; CI awaiting maintainer approval. Local `6c3547be`, installed since fork.6. |
| Turbine idle fuel flow `<idlefuelflow>` → native JSBSim (added 2026-09-14) | Ready with evidence apart from exact-candidate verification. `TestTurbineIdleFuelFlow` (5 cases), fork.6/fork.7 controls, and in use by the SF50. It only needs rebasing onto `master` and a rerun there. | Not submitted. `c70be257` on pushed `feature/turbine-idle-fuel-flow`; merges cleanly onto `master`. Installed since fork.7. |
| SDK executive ownership, child lifetime and failure cleanup → jsbsim-wasm | Strong correctness candidate. Real-WASM exactly-once destruction, repeated destroy, child invalidation and initialization/allocation failures pass in the coherent SDK. Extract a focused contribution and verify its declared native dependency; lifetime behavior on older native reload code remains a separate compatibility concern. | Not submitted as a new PR. Included in SDK integration `61ee9486` and the verified installed artifact. Current app/tests use SDK-owned cleanup. Preserve existing #8 while separating unrelated changes. |
| Bounded model-load diagnostics → jsbsim-wasm | Useful generic candidate. Boolean load APIs, bounded per-attempt diagnostics, cleanup and successive success/failure behavior pass. Keep the public error contract and any lifetime dependency explicit in extraction. | Not submitted as a new PR. Included in the verified SDK/app artifact. Browser process memory reclamation is not established by native-handle tests. |
| Property batching and per-gear contact reads → jsbsim-wasm | Functional APIs and affected lifetime regressions pass. Readiness remains blocked by the requested cache-only performance comparison and any associated API review work. No new performance claim is made by centralization. | Existing [PR #8](https://github.com/0x62/jsbsim-wasm/pull/8), retained. Preserved from `35d6100` and included in the verified installed artifact. |
| Optional wheel rotational dynamics → native JSBSim | Existing native regressions pass, but substantive review follow-up remains. Resolve clarity/reported error concerns and retain analytical, contact-transition and timestep evidence. Default-disabled equivalence alone cannot qualify enabled physics. | Existing [PR #1502](https://github.com/JSBSim-Team/jsbsim/pull/1502), retained at `24e085bf`. Included in native integration and the verified SDK; distinct aircraft calibration remains unrelated. |
| Unified SDK source resolution and build provenance → jsbsim-wasm | Implemented and exercised in both final modes, with 43/43 tests each, mismatch rejection, packing, demo and app artifact checks. Consider the reusable mechanism after upstream workflow/API agreement; our fork names/archive/distribution choices remain downstream. | Not submitted. SDK `61ee9486` is clean and the pinned output is verified in the app. Hosted CI was not run. Do not require upstream to adopt our checkout layout or vendor retirement policy. |
| FGTurbine phase, cranking, starvation and gauge properties → native JSBSim (added 2026-09-14) | **Not implemented.** FGTurbine computes its phase, `Cranking` (its own comment calls it a signal for sound effects), EGT, oil pressure and temperature, EPR and nozzle position, but binds none of them as properties. The app's engine monitor and audio adapter therefore infer phase and combustion from other flags. Before extraction: settle names and units against upstream conventions, add native regressions and real-WASM property reads. Worth submitting once those gates pass: it is useful to any sound, gauge or diagnostics consumer. | Not submitted; nothing to extract yet. See the [audio ledger](validation/audio-implementation-ledger.md) §10. |

The turbine and lifetime defects can be addressed without proving distinct SF50 generation performance. SF50 thrust/drag/TSFC estimates, loading assumptions, provisional G2/G3 tuning, raw AFMs and owner/dashboard recordings are not part of these generic contributions. A proposed steady-propulsion diagnostic/API is not implemented and is not a completed contribution candidate.

### Existing PR evidence and open discussion

| PR | Head observed | Check/review state observed |
| --- | --- | --- |
| Native [#1502](https://github.com/JSBSim-Team/jsbsim/pull/1502) | `24e085bf81b5ef8bab8500ab9d416571753b93cc` | Open, non-draft. Reported check jobs succeeded or were skipped. No formal review decision; substantive discussion remains. |
| Native [#1504](https://github.com/JSBSim-Team/jsbsim/pull/1504) | `d47fd2e38feba9cc40340ac9740356f6f7afc37d` | Open, non-draft. Reported check jobs succeeded or were skipped. No formal review decision; clarification questions remain. |
| SDK [#8](https://github.com/0x62/jsbsim-wasm/pull/8) | `35d610095d71ea40c8f90a0f1e5a14e11006ee1c` | Open, non-draft. No checks were reported in the status rollup; this is not a CI pass. No formal review decision; performance comparison requested. |

The [wheel review](https://github.com/JSBSim-Team/jsbsim/pull/1502#issuecomment-5654721219) recognizes the feature's benefit but requests clearer implementation and flags errors, with further explanation still to come. Do not invent the unspecified errors or mark them resolved. The coverage bot also reports uncovered changed lines; investigate whether this reflects missing execution or instrumentation before relying on the green check status. (Resolved 2026-09-14: instrumentation. The coverage job does not build the Python module, so the Python regressions are not measured.)

The portability discussion asks for [terminal-color clarification](https://github.com/JSBSim-Team/jsbsim/pull/1504#issuecomment-5645055803) and [WASM integration context](https://github.com/JSBSim-Team/jsbsim/pull/1504#issuecomment-5645415466). The PR reports a completed Emscripten build, but that historical result does not verify a different local integration revision. The SDK discussion requests a [cache-only performance comparison](https://github.com/0x62/jsbsim-wasm/pull/8#issuecomment-5645552459); its existing benchmark/test claims remain attached to the PR's recorded environment.

On 2026-09-13, the [terminal-color clarification](https://github.com/JSBSim-Team/jsbsim/pull/1504#issuecomment-5656709734) was posted and PR #1504’s description corrected. Its code/head remained `d47fd2e3`. The old patch belonged to our SDK fork; upstream moved ANSI codes into `FGLogConsole`, so the old patch location was obsolete but the behavior was not. Sean’s integration question is an invitation to discuss scope, not a recorded decision to import the entire SDK. The [review note](old/jsbsim-pr1504-review-2026-09-13.md) records the evidence and proposed direction.

Recheck upstream states before acting. The execution record establishes current local fork integration and app adoption; it does not establish maintainer acceptance or readiness of a separately extracted contribution.

## Maintenance

During centralization, extend the preservation ledger with contribution destination, existing PR, readiness blockers and exact verification references for every retained upgrade. Record a reason for work intentionally kept downstream. Carry this policy and the relevant candidate evidence into the native/SDK contributor documentation as that workflow is implemented, so they remain discoverable when working outside 0sfs.

Review the ledger when a change reaches local acceptance, receives upstream feedback, or is adopted from upstream. Complete contributions should enter the upstream queue as part of normal maintenance; unfinished designs remain identified candidates. Upstream timing must not erase local upgrades or substitute for verifying the runtime we ship.

## In-tree integration follow-up

The [roadmap reply](https://github.com/JSBSim-Team/jsbsim/pull/1504#issuecomment-5657061563) was posted on 2026-09-13 and implementation began in our native fork. The [execution record](old/jsbsim-in-tree-integration-2026-09-13.md) supersedes separate SDK ownership and artifact identities above where explicitly stated. Existing native dynamics and SDK features retain their review/readiness gates; moving their source does not settle those reviews. Prepare focused upstream contributions after exact-source checks; do not submit the entire downstream integration history as one finished upstream change.
