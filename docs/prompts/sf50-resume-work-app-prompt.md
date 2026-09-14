# Fresh conversation: finish dependency adoption, then resume SF50

Continue work in `/Users/felg/gh/0sfs`, preferably using
`flight-development.code-workspace`. The previous conversation became too long.
Recover context from the files below, not that conversation.

The engine/SDK repository consolidation is complete. One bounded dependency
closeout remains: adopt the native-exception and browser-persistence corrections
from our upstream contribution into the full working SDK and the simulator's
installed package. Finish that first, then continue the existing source-grounded
SF50 development plan. Do not reopen the repository architecture discussion.

I authorize ordinary implementation, focused tests/builds, immutable packaging,
local dependency adoption and necessary Git work. Continue until the work is
handled; stop only for a genuine missing decision, permission or information that
requires my help. Keep updates brief. Follow current AGENTS.md server restrictions
and prefer terminal/headless checks. Do not start a dev/preview server by default.
Preserve unrelated user changes, including aircraft-family UI and controller work.

## Recover the current state

Read the relevant AGENTS.md files, then these app documents in order. Read only
source needed for the next implementation step after that:

1. `docs/validation/jsbsim-upstream-submissions-2026-09-13.md`
2. `docs/jsbsim-wasm.md` and the acceptance/recovery sections of
   `docs/validation/jsbsim-in-tree-integration-2026-09-13.md`
3. `docs/validation/sf50-development-handoff.md`
4. `docs/validation/sf50-calibration-qualification-2026-09-12.md`
5. The two existing review ledgers under
   `planes/Cirrus_Vision_Jet/tests/public-evidence/`:
   - `steady-window-qualification-2026-09-12.json`
   - `afm-qualification-2026-09-12.json`
6. `docs/validation/sf50-variant-models.md`,
   `docs/validation/sf50-public-data-acquisition.md`,
   `planes/Cirrus_Vision_Jet/tests/public-evidence/variant-processing-summary.json`,
   and the relevant latest status/methodology sections of
   `docs/proposals/sf50-flight-model-v2.md`.

Earlier beta.4/separate-SDK ownership, unexecuted-check statements and requests
for test approval in dated records are historical. The latest acceptance records
and this instruction supersede them. Historical test results still belong to
their exact source/artifacts; they do not validate subsequent changes.

## Established development setup

- App, aircraft packages, UI and evidence: `/Users/felg/gh/0sfs`.
- One canonical engine/SDK repository: `/Users/felg/gh/Felipegalind0/jsbsim`.
  Native code belongs in `src/`; bindings, lifecycle, diagnostics, filesystem
  services and SDK build tooling belong in `wasm/` of that same repository.
- Earth/terrain/rendering: `/Users/felg/gh/foss-earth`. It remains a separate
  rendering dependency; source consolidation does not make it own JSBSim.
- The three-root VS Code workspace contains those repositories. The old standalone
  SDK checkout was moved to
  `/Users/felg/gh/.preservation/jsbsim-in-tree-20260913T233508Z/retired-jsbsim-wasm`.
  Its history and ignored artifacts are preserved, not an active source choice.
- Use ordinary branches in the canonical repositories. Do not recreate task-named
  checkouts/worktrees, nested vendor repositories or another source selector.
  Build-owned frozen snapshots are artifacts, not editing workspaces.
- The working branch was restored clean to `feature/wasm-integration` at
  `f7a80a6f064d22efe0591c20c8637b9c38179ba9`. This is the full downstream integration.
- The app declares and installs
  `@felipegalind0/jsbsim-wasm@1.2.4-fork.3` from
  `deps/felipegalind0-jsbsim-wasm-1.2.4-fork.3.tgz`.
  Tarball SHA-256:
  `43d0fe826fe0948d6e9049f90aa8d4ffd780844f859effda38ec22da81de0171`.
  The build/package pointers were restored to this accepted version.
- The native turbine N1/N2 initialization and model-reload lifetime fixes are
  already in this adopted integration. Do not add app-level N1 resets or manual
  native deletion, or re-investigate their inclusion from an old temporary SDK.

Check current state before changing it; these are handoff identities, not a
request to reset a repository that has since advanced. Preserve the mixed app
working tree and existing rollback artifacts. The complete integration, existing
PR branches and new contribution branches also have a verified recovery bundle
recorded in the submission handoff.

## Phase A: finish the remaining dependency adoption

The narrower upstream review branch `feature/wasm-package`, at
`c6d4063ab7dd7721f280d03726ead85355ad8e57`, contains the tested corrections.
Its private `@jsbsim/wasm@0.1.0` package is a review artifact. It intentionally
omits downstream wheel/batching/gear features. **Do not replace the full working
integration or app dependency with that branch/package, or copy its entire SDK
over ours.** Port the relevant corrections selectively while preserving all
existing APIs, bindings, ownership behavior, diagnostics and tests.

1. Reconcile `BUILD_WASM_MODULE`-conditional C++ `-fexceptions` before native
   object-library compilation, not only on the binding target or final link.
   Native builds with WASM disabled must remain isolated from this change.
2. Link `-lidbfs.js` into the WASM module while retaining the full integration's
   hand-written property-batch and gear-contact bindings. Carry over the relevant
   normalized/disjoint runtime/persistence-root safeguards and lifecycle checks.
3. Adapt the contribution's regressions: malformed propulsion must be caught by
   native code, return false and recover with a valid model; browser text/binary
   persistence, updates and deletions must survive navigation. Preserve the full
   SDK's child invalidation, exactly-once cleanup and extension coverage. Use the
   tested Playwright 1.63.0 browser tooling where applicable; the older 1.58.2
   installer stalled during extraction. Do not remove tests to reuse its core-only
   suite. Keep source capture, artifact checks and all component notices intact.
4. Build the full engine/SDK from one recorded clean revision. Package a new,
   unused fork version (inspect first; normally the next after fork.3). Retain
   previous tarballs unchanged. Update the app's exact declaration, lock and
   identity/version acceptance together, preserving strict rejection of dirty,
   mismatched or substituted artifacts. Never replace these gates with a broad
   version range or live dist/source link.
5. Complete checks appropriate to the changed full package and app adoption:
   source/generation gates; real-WASM lifecycle, extensions, native exception
   recovery and browser persistence; affected native regressions and native
   build isolation; installed app artifact/identity tests and production build;
   actual headless C172/G1/G2/G3 loads and family-selection contracts; matched
   native/WASM initial/reset/short-trajectory scenarios. Reuse the recorded
   scenarios and headless request-routing approach without a server. Record exact
   commits, toolchain, tarball and loaded-byte hashes, conditions and outcomes.
6. Update `docs/jsbsim-wasm.md`, dependency graph/ownership and validation handoff
   with the actually adopted package and remaining limitations. Once this passes,
   continue directly into Phase B. Do not make AFM calibration claims from it.

Reference acceptance, which is already complete:

- Full fork.3: 45 SDK tests, 143 focused app tests, 11 native CTest targets,
  production/artifact checks, four browser aircraft starts, three UI viewports
  and four matched native/WASM scenarios. These need affected verification after
  the new adoption; they are not new-model calibration evidence.
- Separate final upstream contribution: 40 Node tests, native isolation,
  pinned Chromium persistence, worker smoke and isolated tarball consumer checks;
  dedicated Linux native/WASM/browser/package workflow passed. Its smaller suite
  and feature set are not a substitute for full downstream acceptance.
- Evidence/package gates also passed earlier: 125 tests in 15 files. Do not
  repeat the old initial approval request or portray their source as untested.

Already submitted upstream: JSBSim #1505 (turbine), #1506 (model reload), and
#1507 (WASM package, carrying #1504/#1506 prerequisites). Existing #1502 wheel,
#1504 portability and 0x62/jsbsim-wasm #8 batching/gear reviews remain distinct.
Refresh live status if acting on a PR; do not duplicate submissions. Upstream
review/merge is separate from our local adoption and need not block SF50 work.
Follow `docs/jsbsim-upstream-contribution-policy.md`; keep unrelated review and
performance/API debates out of this dependency closeout.

## Phase B: resume the actual SF50 stopping point

The objective is a source-grounded SF50 simulation with G1, original G2 and G3
choices and defensible automated comparisons to real-aircraft behavior.
Selectable variants, successful processing and aircraft startup are not completed
calibration.

### Completed work to retain, not repeat

- All 41 steady windows were reviewed: three ERA22 exclusions for recorded
  mode/TLA changes, 38 context-only, **zero eligible fitting or independent-
  validation recordings**. They represent two whole-flight groups. Start with
  their ledgers, not a fresh screening/review of all 41 windows.
- Numeric transcription of 27 ISA AFM rows was visually checked: 12 cruise rows
  at 5,000/15,000/28,000 ft and 15 cumulative-climb rows. Configuration and
  condition eligibility remain unresolved. This does not qualify all 820 rows.
- The parameter-to-evidence plan and evidence-gate corrections are implemented.
  The 600 fitting candidates / 220 whole-condition ISA+10 same-source check
  allocation is unchanged. There are zero independent validation rows.
- The dashboard OAT caption establishes Celsius. Its `gal/Hr` caption does not
  establish US gallons. The corrected normalizer preserves raw flow and leaves
  qualified US-gph null. **Cached normalized/candidate outputs still contain the
  old fuel label/OAT disclaimer**, because processing was not rerun. The review
  ledgers govern interpretation. Regenerate to a new output directory/ledger
  only when needed; do not overwrite the September 12 run.
- The existing corpus has 101 raw artifacts, 820 primary AFM cruise/climb rows,
  12 ISA runway anchors and 8,535 rows across 53 TOLD tables. Raw and bulk derived
  files are locally cached and Git-ignored; a fresh clone lacks them. Existing
  output: `planes/Cirrus_Vision_Jet/tests/public-evidence/derived/variant-calibration-2026-09-12-v1/`.
- No coefficients were fitted in the latest qualification phase. All generations
  retain shared development aerodynamics, estimated installed-engine behavior
  and shared exterior meshes. G2/G3 remain provisional.

### Next identifiable step

First resolve the historical G1 AFM cruise configuration, anti-ice/bleed,
altitude meaning and atmosphere conventions. Use the existing qualification
record and investigate specific public routes that can close those gates.

Once the required conditions are qualified, implement a narrow fuel-flow
diagnostic at observed N1 and imposed altitude/OAT/TAS, with a documented Mach
and atmosphere convention. Start with the four reviewed 6,000-lb, 5,000-ft ISA
rows (printed OAT 5 C): N1/fuel pairs 93.8/114, 86.5/88, 78.9/68 and 71.4/54
(% / US gph), then the reviewed 15,000-ft slice. Keep AFM power tags and row/source
identities. An AFM N1 observation is not a TLA command.

Keep installed-thrust and aerodynamic coefficients fixed during this diagnostic.
Current fuel flow depends on assumed thrust times TSFC, so a fuel match does not
independently identify TSFC. Inspect whether the needed steady-propulsion
capability exists before implementing it in the owning layer. A generic engine
capability belongs in JSBSim; an aircraft schedule belongs in the SF50 package.
Do not bypass eligibility gates or begin an arbitrary coefficient sweep when
conditions remain unknown. Progress other resolvable evidence work if blocked.

Then follow the existing plan: installed thrust versus drag; loading/CG and
pitch/control response; finally runway technique and friction. Do not use one
subsystem's parameter to conceal another subsystem's error.

## Aircraft/UI and evidence boundaries

- G1 uses `cirrus-vision-jet` / `sf50`; G2/G3 have separate IDs and `sf50-g2` /
  `sf50-g3`. The G2+ UI label currently aliases provisional G2; it is not a
  calibrated G2+ model or permission to mix source applicability.
- Keep the aircraft-family image gallery, staged generation/presentation choices
  and atomic Apply behavior. Do not recreate the old flat generation radio list.
- G1 XML is canonical. Regenerate G2/G3 through
  `scripts/build-sf50-variants.mjs` when the common model changes.
- Source-backed baseline replacements: 1,846-lbf rated thrust, 2,001-lb nominal
  usable fuel and 62.2-in wing MAC. Installed thrust, TLA/N1/bleed schedules,
  TSFC, loading/CG, inertia, control response and friction remain estimates.
- Primary historical G1 AFM: 31452-001 Rev 4, SHA-256
  `d83e904dbd6bc3656321c93d793166d4a5c6eddf81852b15767e5c336fc23949`.
  Preserve explicit ISA entries; do not replace them with sparse interpolation.
- Preserve the reviewed 100.4% MCT N1 row above the estimated 100% model endpoint.
  The 104.7% limit is not a replacement FADEC/TLA schedule.
- Preserve literal 28,000-ft ISA −40 C performance entries versus −41 C in the
  general ISA chart. Preserve cumulative climb's 32 US gal and 226 lb endpoint;
  nominal 6.76 lb/US gal and simple rounding do not reconcile it.
- G1 sea-level takeoff discrepancy was traced to losing the explicit ISA column.
  The landing revision/applicability discrepancy remains open. Keep historical
  G1 5-degree / 80–90-KIAS takeoff technique; do not borrow the later procedure.
- Requested N1, actual N1, computed percent thrust and measured thrust differ.
  T2 is not OAT; bleed mass flow is not a percentage thrust penalty.
- Preserve missing values, duplicates/gaps, clocks, automation/safety qualification
  and donor identity. CEN21 serial 0202 and CEN23 serial 0215 are not the G1 donor.
  Six-second processed dashboard data cannot identify fast spool/damping/flare.
- A steady trace does not establish normal operation, loading/CG, surface input
  or brake force. Equilibrium CL is not measured CL-alpha. Keep cumulative fuel,
  time and distance separate; printed resolution is not uncertainty/tolerance.
- Do not invent a uniform 20% thrust boost or fit G3 to unmatched marketing data.
  Preserve whole-flight independence and whole-condition same-source checks
  before fitting; record units, assumptions and uncertainty with every case.

Reasonable public avenues are not exhausted. Relevant leads include ordinary
publication access, supplement 31452-111 applicability (configuration 26000-004
or SB5X-72-01), applicable later primary AFMs, and dashboard raw-export/loading/
reuse metadata. Consult the expanded public-data/AFM audits and owner/Cirrus
question lists only as their subjects become relevant. Do not contact employees,
owners or providers, buy access, create accounts requiring user identity, or
request restricted documents without permission. Public availability does not
automatically authorize redistribution of AFM, owner or dashboard material.

Finish each phase by recording what changed, exact exercised inputs/results,
what remains blocked or estimated, and the next concrete step. Keep software
correctness, same-source fit/checks and independent aircraft fidelity distinct.
