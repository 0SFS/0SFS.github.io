# Final application integration checks

The aircraft renderer consumes one signed-path source field across six interior
sections and the exterior. It updates posed support without repeating source
evaluation, clips rays using a private optional opaque-depth pass, and limits
the approximate unshadowed nearby light to the exterior source integral. This
aircraft-only integration belongs in 0sfs. No shared terrain/HDR change was made.

| Check | Result and retained log |
| --- | --- |
| Incremental `npx tsc -b` | Passed, [log](typecheck-final.log) |
| `npx vitest related --run --maxWorkers=50%` over changed source and added tests | 66 files, 789 passing tests and two new test-fixture timer failures, [log](related-final.log) |
| Isolated depth regression repair | Three tests passed, [log](depth-regression-recheck.log) |
| Incremental `npm run lint` | Passed, [log](lint-final.log) |
| `npx vitest list --filesOnly` | 172 real test files; no evidence/scratch snapshots, [list](test-discovery.log) |
| Single final `npm run ci` | Passed: 172 files, 1,841 passing tests and one expected failure; lint, typecheck, deterministic assets, Vite build and installed/dist verification, [log](ci-final.log) |
| `git diff --check` | Passed, [log](diff-check.log) |

The related failures counted unrelated Babylon timers. The repaired tests spy
on the helper's 50 ms readiness polling and check that it stops. Final CI covers
all corrected tests and the geometry-weight cache. Earlier integration
typecheck/mock failures and their repairs are retained. Full CI was run once
after the executable code settled. Node's localStorage, jsdom canvas and bundle
size warnings are recorded in the successful log.

Tests cover AB-only field/upload invariance, support updates without rebaking,
interior/exterior light accounting, field resizing without a disposed texture
binding, depth-pass lifetime, caller render-pass restoration (including errors),
and readiness filtering using actual opaque submaterials. The depth pass owns
its target rather than replacing another scene consumer's renderer. GLSL/WGSL
execution, depth texture precision and cost remain unqualified on a GPU.

[inputs.json](inputs.json) hashes final integration sources and logs. It records
two subsequent comment-only corrections; no executable change followed CI.
Earlier optical/numerical snapshots identify their own revisions. The cache
does not change their quadrature or source formulas.

[preservation.json](preservation.json) compares the task-entry working tree:
47 pre-existing tracked diffs are unchanged; all 18 changed tracked diffs belong
to this correction. Fifteen identity checks confirm unchanged rigid assets and
authoring/rig, test stand, native thermal source/XML, fork.16 tarball and the two
inspected FOSS Earth terrain renderers. JSBSim remains clean at its audited
revision. This does not claim that 0sfs began clean. Existing untracked work and
previous evidence were preserved; no commit or push was made.

These checks qualify software behavior and the declared numerical approximation.
They do not qualify F135 temperature/chemistry assumptions, the observed dry
exhaust/deck light, or actual rear/oblique day/night display appearance.
