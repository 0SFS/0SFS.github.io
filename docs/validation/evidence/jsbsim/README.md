# JSBSim dependency evidence

Records that other documents cite as the basis for a claim. They are tracked so
a clone can check the claim without the local scratch tree, which is gitignored
and not distributed.

Nothing here is source. These files are frozen: they record what was true at a
past revision, so they are excluded from lint (`eslint.config.js`) and were
never in the typecheck root, which is `src` only. Correcting a file here would
destroy the thing it exists to attest.

## adoption/

One record per adopted package version: what changed, why, the identity digests,
every check run with its result, and what was deliberately left undone.

| File | Package |
| --- | --- |
| `fork4-adoption.json` | IDBFS linkage and native-exception build corrections |
| `fork5-adoption.json` | rename to `@felipegalind0/jsbsim`; no behaviour change |
| `fork6-adoption.json` | turbine trim fuel flow |
| `fork7-adoption.json` | configurable turbine idle fuel flow |

`final-app-preservation.json` records the working-tree preservation taken during
the in-tree consolidation.

fork.1 through fork.3 predate this format; their history is in
[the centralization record](../../../old/jsbsim-centralization-2026-09-13.md) and
[the in-tree integration record](../../../old/jsbsim-in-tree-integration-2026-09-13.md).

## rollback/

The declaration, lock and identity module for each pre-rename release, which
together pin one tarball. Restoring a release means restoring all of its files
at once; a declaration without its lock and identity module will not verify.

These four states were never committed — the adoptions happened inside one
working tree and reached history as a single commit — so this directory is their
only copy. fork.5 and fork.6 need no snapshot: they are at `f9a27c0d` and
`9e22e168`, recoverable with `git show <commit>:package.json`. fork.7 is the
installed declaration.

`rollback/fork1` and `rollback/fork2` have no identity module because the
snapshots taken at the time did not include one.

The tarballs themselves are in `deps/`, and are the authority for what a version
contains, because the build is not reproducible:

| Version | Tarball SHA-256 |
| --- | --- |
| 1.2.4-fork.1 | `81369af4b23e71c4a067ae730cb6a9ac8ff95fa9d1d9ceb80ff1bdc412d50628` |
| 1.2.4-fork.2 | `ca9f22b23c1444c2dc1ff80fc8d7fc877bb607f71534ea5a64bab3965bfc468a` |
| 1.2.4-fork.3 | `43d0fe826fe0948d6e9049f90aa8d4ffd780844f859effda38ec22da81de0171` |
| 1.2.4-fork.4 | `957156d73ce44672621d0f0163fbefa753b53bddcc577b7f24da5ee25c4f1474` |
| 1.2.4-fork.5 | `9312e2b657fd5f396f6ed55904616b907d387c9cd76d98ca66ad756cf3d8aa52` |
| 1.2.4-fork.6 | `9ad6c6e549b2bb81ec728c005a06f79501d53b7a718c84c735c95442f2ab9754` |
| 1.2.4-fork.7 | `58afaf9fa575ec61838ba794b7b4a0919b8eaf516c7261e571700e8367b5217b` |

## parity/

Native and WASM built from one revision, run over the same scenarios, with the
per-step samples both sides produced. The samples are the evidence; the maximum
normalized error alone is a summary of them.

| Report | Maximum normalized error |
| --- | --- |
| `fork2-parity.json` | 1.4851e-4 |
| `fork3-parity.json` | 1.4851e-4 |
| `fork4-parity.json` | 1.4851e-4 |
| `fork5-parity.json` | 1.4851e-4 |
| `fork6-parity.json` | 1.4872e-4 |

fork.2 through fork.5 agree to every digit. Those releases changed build flags,
packaging and a name, not engine behaviour, and the binary is not reproducible,
so an identical result across four independent builds is the available evidence
that behaviour did not move. fork.6 is the one release that changed engine
behaviour and the one report that differs.

## trim-fuel-flow/

The negative control for the fork.6 adoption. `check.mjs` trims an F16 fixture
at a range of throttle settings, both in isolated executives and out of order in
one shared executive, and compares.

`fork5.log` fails: every setting reports 1548.92 gph, the value left behind by
`propulsion/set-running` forcing the throttle to 1, idle included. `fork6.log`
passes: 114.80, 284.34, 807.49, 1485.99 gph across dry commands 0.00 to 0.49 and
7823.98 augmented, with no order dependence.

The same script on both artifacts is what attributes the change to the package
rather than to the harness. Run it from an unpacked artifact root with
`JSBSIM_SOURCE_ROOT` set to a JSBSim checkout for the aircraft fixtures.

## idle-fuel-flow/

The negative control for the fork.7 adoption. `check.mjs` loads the app's own
SF50 package and reads fuel flow at ground idle with the thrust lever closed.
The package declares 76 lbm/hr, the WPR20FA051 recorder's ground idle; JSBSim's
fallback for a 1,846 lbf engine is 481.5 lbm/hr.

`fork6.log` fails: 481.5 lbm/hr, so that artifact ignores `<idlefuelflow>`.
`fork7.log` passes: 76.0 lbm/hr at the same 24.3 % N1 and 53.4 % N2.

Run it from an unpacked artifact root, as `evidence/check.mjs` beside `dist/`,
with `OSFS_JSBSIM_DATA_ROOT` set to the app's `public/jsbsim-data`. The SF50
package it reads is the calibrated one; an older package without the element
would fail on both artifacts.

## engine-off-trim/

Evidence for a defect found on 2026-09-14, not an adoption control. JSBSim runs
`Trim()` for every zero-time evaluation, running or not. PR #1505 (`fc13a97b`)
and PR #1508 (`6c3547be`) assign spool speeds and fuel flow there for every
engine, so a shut-off engine comes out of RunIC spooled.

`native_check.py` uses the repository's F-16 fixture, built as a Python module
from Git archives of upstream `master` `14c19022` and the #1508 head `7511df10`.
Run it from any directory as `python native_check.py <source root>`.

- `native-master.log`: the engine stays at rest.
- `native-pr1508.log`: after RunIC the engine reports N1 82.00 %, N2 85.90 % and
  7,275.5 lb/h, then burns 0.35 lb in the next 0.2 s. An engine that was cut off
  and then put through RunIC does the same.

`check.mjs` replays the app's location reset for an engine that is not running,
on the SF50 package at 5,000 ft, 150 kt and throttle 0.6. Set
`OSFS_JSBSIM_PACKAGE` to an installed or unpacked package directory and
`OSFS_JSBSIM_DATA_ROOT` to `public/jsbsim-data`.

- `fork5.log` fails on the spool alone: N1 69.7 %, N2 81.4 %, no fuel flow.
- `fork7.log` fails on both: the same spool and 344.7 lb/h.

Both logs fail. That is the finding: the check passes only once the engine is fixed.

## engine-rollout/

The causal before/after logs for the 2026-09-16 SF50 rollout investigation.
The installed turbine remains running through touchdown, roughness, and terrain
refinement. The app's state-recovery path instead rewound simulation time,
which reset and faded the audio timeline. `restore-before.log` and
`rollout-before.log` reproduce that rewind; their after controls pass when
state recovery retains executive time. See the directory README and
[`engine-cutout-rollout-2026-09-16.md`](../../engine-cutout-rollout-2026-09-16.md).

## reports/

`fork6-browser-artifact.json` boots the accepted artifact in headless Chromium
for the C172 and all three SF50 packages, serving only artifact bytes through
request interception. `fork6-aircraft-ui.json` covers the selection UI at three
viewports.

## What is not here

Build trees, sanitizer runs, recovered `node_modules` layouts, screenshots and
raw compiler captures stay in the gitignored local tree under
`build/validation/`, which runs to hundreds of megabytes. Documents that cite
those name them as local-only. If a claim needs evidence a reader can check,
the evidence belongs in this directory instead.
