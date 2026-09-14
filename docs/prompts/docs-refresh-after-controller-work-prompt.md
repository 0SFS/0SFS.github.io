# Fresh conversation: fix the stale docs and the broken FOSS Earth site

Work in these three checkouts:

- `/Users/felg/gh/0sfs` (GitHub `0SFS/0SFS.github.io`)
- `/Users/felg/gh/foss-earth` (GitHub `foss-earth/foss-earth.github.io`, moved
  from `Felipegalind0/foss-earth`)
- `/Users/felg/gh/Felipegalind0/gamepad-tools` (GitHub `Felipegalind0/gamepad-tools`)

On 2026-09-14 a large batch of work reached `main` in all three:

- gamepad-tools itself, and its use for controller and keyboard input in both apps;
- terrain loading changes in foss-earth;
- the SF50 flight model and aircraft work in 0sfs.

An audit afterwards found docs that no longer match the code. It also found
one live bug: the published FOSS Earth site does not load. Fix all of it.

Every finding below was checked against the code on 2026-09-14. Check each one
again before you edit, because line numbers may have moved.

I authorize:

- the doc edits below;
- the small code and config changes named below;
- the checks needed to verify them;
- commits on new branches.

Stop and ask me before anything outward-facing, and at each point marked
**Ask me**.

## Ground rules

- **Read first:** read `AGENTS.md` in each repository and follow it.
- **Allowed:**
  - reading anything;
  - editing the files named here;
  - running lint, tests, typecheck and builds from the terminal;
  - creating branches and committing on them.
- **Ask me first:**
  - pushing any branch;
  - merging into `main`;
  - running `npm run deploy` in foss-earth, which publishes the live site;
  - changing dependency paths in any `package.json`;
  - switching the 0sfs checkout away from `feat/sf50-flight-model`, which is
    my in-progress branch;
  - deleting any branch, locally or on GitHub;
  - the decisions marked **Ask me** below.
- **Servers:** never start a development, preview or watch server. That rules
  out `npm run dev`, `npm run demo` and `vite preview`. Check builds by reading
  `dist/`.
- **Branches:** before branching, confirm `git status` shows no tracked changes.
  Then create a branch from `main`, for example
  `docs/refresh-after-controller-work`. If a checkout has tracked uncommitted
  changes, stop and ask me.
- **Commits:**
  - Make one commit per concern; each section below names one.
  - Write messages in plain language, saying what changed and why.
  - Add no attribution lines.
- **Leave alone:**
  - `benchmarks/audio/sweep.jsonl` in 0sfs. It stays untracked on purpose.
  - The 2026-09-05 stash in foss-earth. It no longer applies; do not pop or drop
    it.
  - Commit `8b6e2ef1`, "Include V-tail sweep in the SF50 ruddervator hinge". It
    exists only on local `feat/sf50-flight-model` in 0sfs. Do not merge, push or
    rebase it.
  - Dated records. Keep these as written:
    - 0sfs `docs/validation/`, `docs/prompts/` and `docs/proposals/`;
    - foss-earth `babylon_migration.md` and `docs/proposals/research/`;
    - gamepad-tools `docs/implementation-prompt.md` and
      `docs/integration-research.md`.
  - The jsbsim repository. Its docs are current.
    - CI on its `master` (`f9082ee1`) fails the C/C++ build and CodeQL.
    - Upstream `14c19022` fails the same two, so this is out of scope.
- **Accuracy:** gamepad-tools' `AGENTS.md` requires accurate claims about
  implementation status and validation. Apply that everywhere: do not call
  something done or tested unless the code or a test shows it.

## Starting state on 2026-09-14

| Repository | `main` (local and GitHub) | Checkout |
| --- | --- | --- |
| 0sfs | `ae61464f` | `feat/sf50-flight-model` at `8b6e2ef1`; only `sweep.jsonl` untracked |
| foss-earth | `e216be0` | `fix/retry-failed-map-tiles` at the same commit, clean |
| gamepad-tools | `d9ad9b0` | `feat/binding-toolkit` at the same commit, clean |

Both apps depend on sibling folders at these exact relative paths:

```text
/Users/felg/gh/
├── 0sfs/            depends on file:../foss-earth
│                    and file:../Felipegalind0/gamepad-tools
├── foss-earth/      depends on file:../Felipegalind0/gamepad-tools
└── Felipegalind0/
    └── gamepad-tools/   package exports point at dist/, which is gitignored
```

A fresh clone of gamepad-tools must run `npm install && npm run build` before
either app can install or run. None of the setup docs say so.

Suggested order:

1. foss-earth site fix (section 1).
2. foss-earth docs (section 2).
3. gamepad-tools (section 4).
4. 0sfs (section 3), after asking me about its checkout.

## Carried over from the previous conversation

- **The FOSS Earth site is down for everyone.** `https://foss-earth.github.io/`
  is blank right now. The fix is one line in the deploy script plus a redeploy,
  a few minutes' work, so do section 1 before anything else. After building,
  show me the asset paths in `dist/index.html`, then ask me before deploying.
- **This prompt file is untracked.**
  `docs/prompts/docs-refresh-after-controller-work-prompt.md` exists only on
  disk in the 0sfs checkout, so cleaning the folder would lose it. Ask me
  whether to commit it. If I say yes, commit it unchanged, as its own commit,
  on your 0sfs branch.
- **My V-tail commit is unpushed.** `8b6e2ef1` exists only on local
  `feat/sf50-flight-model`. It is my work in progress, so leave it alone. In
  your final report, remind me that it is still unpushed.

### Lower priority: branch housekeeping

These were checked on 2026-09-14. None of them blocks the work above.

- **jsbsim: no action needed.** Every local branch is on GitHub.
  - `fix/model-reload-lifetime` (`a25956a2`) and `fix/turbine-trim-spool`
    (`07eba55f`) match their GitHub branches. They just lack upstream tracking
    locally. They are the heads of upstream PRs #1506 and #1505, so do not
    change them.
  - The local-only `integration` branch (`61b31329`) is already contained in
    `master`.
- **gamepad-tools `feat/binding-toolkit`** exists only locally and matches
  `main` (`d9ad9b0`), so deleting it loses nothing. It is currently checked out.
  Switch to your new branch first, then ask me before deleting it.
- **foss-earth `fix/retry-failed-map-tiles`** is fully merged into `main`
  (`e216be0`), locally and on GitHub. It is currently checked out. Ask me before
  deleting it, locally or on GitHub.

## 1. foss-earth: the live site does not load

**Evidence:**

- `https://foss-earth.github.io/` returns 200, but the page is blank. Its
  `index.html` loads `/foss-earth/assets/index-….js`, which returns 404.
- Cause: the repository became the organization's Pages site, which GitHub
  serves from the domain root. But `package.json` still has
  `"deploy:gh-pages": "npm run build -- --base=/foss-earth/ && gh-pages -d dist"`.
- The old URL, `https://felipegalind0.github.io/foss-earth/`, returns 404.
- `vite.config.ts` has a related problem. When `GITHUB_ACTIONS` is set, it uses
  `/${repositoryName}/` as the base, which here would be
  `/foss-earth.github.io/`.
  - There is no `.github/workflows/` today, so this only matters once CI builds
    are added.
  - 0sfs's `vite.config.ts` has the same logic, and 0sfs is also a root Pages
    site (`0SFS/0SFS.github.io`).
- For reference, 0sfs deploys with `"deploy:gh-pages": "npm run build && gh-pages -d dist"`.

**Do:**

1. Make foss-earth's `deploy:gh-pages` build with base `/`, as 0sfs's does.
2. In foss-earth's `vite.config.ts`, use `/` when the repository name ends in
   `.github.io`, and keep `/${repositoryName}/` otherwise.
3. Verify:
   - Run `npm run build`.
   - Confirm `dist/index.html` loads `/assets/…`, not `/foss-earth/assets/…`.
   - Run `npm run ci`.
4. Commit, for example: "Serve the Pages build from the site root after the move
   to foss-earth.github.io".
5. Apply the same `vite.config.ts` fix in 0sfs as its own commit, when you reach
   0sfs.
6. Point the local remote at the new location:
   `git remote set-url origin https://github.com/foss-earth/foss-earth.github.io.git`.
   This changes only local config; GitHub currently redirects.
7. Show me the asset paths from `dist/index.html`, and **ask me** before
   `npm run deploy`. Once I approve and it is deployed, use `curl` to confirm
   that the page and its main script both return 200.

## 2. foss-earth: docs

### 2a. Links and the deploy guide

Commit, for example: "Point the docs at foss-earth.github.io".

- These link the dead `https://felipegalind0.github.io/foss-earth/`; change
  them to `https://foss-earth.github.io/`:
  - `README.md:6`
  - `docs/development.md:4`
  - `docs/deploying.md:9` and `:39`
- `docs/deploying.md` explains the `/foss-earth/` base at lines 15–16 and 48–49,
  and in "Renaming the repository" at lines 59–65.
  - Rewrite those passages for a site served from the root.
  - Keep the guidance for forks: a copy served at
    `https://<user>.github.io/<repo>/` still needs `--base=/<repo>/`.

### 2b. Setup

Commit, for example: "Document the gamepad-tools checkout FOSS Earth needs".

`docs/development.md` says to run `npm ci` then `npm run dev`. But
`package.json` now depends on `file:../Felipegalind0/gamepad-tools`, so a fresh
clone fails. Document:

- the folder layout;
- cloning `https://github.com/Felipegalind0/gamepad-tools.git` into
  `../Felipegalind0/gamepad-tools`;
- running `npm install && npm run build` there before `npm ci` here;
- rebuilding gamepad-tools after changing it. Confirm from its `exports` map
  that this is really needed before you write it.

### 2c. Controller navigation: **Ask me** before changing code

**Evidence:**

- `src/app/createGlobeApp.ts` (around line 912) starts the controller runtime
  with `createDefaultProfile("foss-earth")`. In gamepad-tools
  `src/core/profiles.ts`, that profile has `bindings: []`.
- The actions exist, in `src/input/globeNavigation.ts`:
  - pan left / right and forward / back;
  - orbit heading and pitch;
  - zoom;
  - reset north-up.
- A **Controller bindings** button opens the binding editor.
- Even so, a connected controller does nothing until the user binds every
  action by hand.
- No foss-earth test covers controller input.

**Ask me** which I want:

- **Recommended: ship a built-in globe profile.**
  - For example: left stick pans, right stick orbits, triggers zoom, and a face
    button resets north-up.
  - Offer it through `mountBindingEditor`'s `builtInProfiles`, the way 0sfs does
    with `createStandardFlightProfile` in
    `src/flight/input/gamepadToolsAdapter.ts`.
  - Add a test.
- **Or document it:** say that controllers must be bound before they do
  anything.

Then update, for either choice:

- The "Controls" table in `README.md`: add a controller row and mention the
  **Controller bindings** button.
- `docs/manual-qa.md`: add controller checks.
  - Bind an action, or use the built-in profile.
  - Pan, orbit and zoom with the controller.
  - Reset north-up.
  - While capturing a binding, confirm the camera does not move.
- The in-app **?** help, if it lists controls.

## 3. 0sfs: docs

Ask me before switching this checkout; see the ground rules.

### 3a. Setup

Commit, for example: "Document the gamepad-tools sibling checkout".

- **Requirements:** in `docs/development.md` "Requirements" (lines 9–30), only
  `foss-earth` is listed. Add the gamepad-tools checkout at
  `../Felipegalind0/gamepad-tools`, built with `npm install && npm run build`
  before running `npm install` here.
- **Clone commands:** these use old names (`Felipegalind0/foss-earth` and
  `Felipegalind0/OSFS`); the link on line 13 uses the old foss-earth name too.
  Use:
  - `https://github.com/foss-earth/foss-earth.github.io.git`, cloned into
    `foss-earth`;
  - `https://github.com/0SFS/0SFS.github.io.git`, cloned into `0sfs`;
  - `https://github.com/Felipegalind0/gamepad-tools.git`, cloned into
    `Felipegalind0/gamepad-tools`.
- **Layout diagram:** it shows `OSFS/`. Redraw it to match the actual paths.
- **New dependency section:** add "The gamepad-tools dependency" next to "The
  FOSS Earth dependency". Cover:
  - what gamepad-tools provides: controller and keyboard sampling, bindings, the
    binding editor and the optional 3D controller view;
  - that the flight adapter lives in `src/flight/input/gamepadToolsAdapter.ts`;
  - when to rebuild gamepad-tools.
- **Test coverage:** the list near line 64 can mention controller profiles
  (`src/flight/input/gamepadProfiles.test.ts`).
- **Deploy doc:** `docs/deploying.md:26` names only the `foss-earth` sibling;
  add gamepad-tools.

Leave the dependency paths themselves alone; changing them is **Ask me**.

### 3b. Dependency records

Commit, for example: "Record gamepad-tools in the dependency and license docs".

- **`THIRD_PARTY_LICENSES.md`**, "Direct dependencies": add a row for
  `@felipegalind0/gamepad-tools`:
  - version `0.1.0`, local link;
  - MIT, per the repository's `LICENSE`; project-owned;
  - usage: controller and keyboard input, bindings and the binding editor;
  - like the `foss-earth` row, note that the sibling link has no release pin;
  - its peer dependency `@babylonjs/core` is already listed.
- **`docs/software-dependency-graph.md`:**
  - Neither the FOSS Earth paragraph (around line 90) nor the ownership table
    under "SF50 handoff" (around lines 103–113) mentions gamepad-tools. Add a
    table row: reusable input sampling, binding evaluation and the editor →
    `/Users/felg/gh/Felipegalind0/gamepad-tools`. Say that app-specific adapters
    stay in each app.
  - The same section says `flight-development.code-workspace` "names the three
    active repository roots". Add gamepad-tools as a fourth folder in that file
    and update the sentence.
- **`docs/foss-earth-relationship.md`**, "Local Package Link" (lines 15–30): it
  says CI and deployments must check out both repositories. There are now three,
  and foss-earth itself links gamepad-tools.

### 3c. README controls

Commit, for example: "Describe controller bindings in the README".

`README.md` line 37 says only "Gamepads are supported." The keyboard table above
it still matches `keyboardDefaults` in `gamepadToolsAdapter.ts`, so keep the
table. Replace the sentence with what the **Controls** tab offers.

Before writing, read `gamepadToolsAdapter.ts`, `gamepadResponseSettings.ts`,
`orbitInvertSettings.ts` and the code that mounts them. Facts to confirm:

- Keyboard and controller bindings can be changed.
- The built-in profiles are **Xbox** and **Classic**.
- Profiles can be imported and exported as JSON.
- Stick response is **Smooth** by default, over 375 ms, or **Direct**.
- The chase camera's orbit can be inverted per axis, and set to hold its angle
  or return behind the aircraft. Also confirm where this setting lives.

The HUD now has an **AP** button that engages the autopilot set up in the
Autopilot tab. The "ArduPilot support" bullet mentions the tab but not the
button; add the button if it fits.

Keep the README short and written for people who fly the sim.

### 3d. Stale SF50 notes

Commit, for example: "Retire TODO items the SF50 work resolved".

For each item, check the code on `main`. Then remove the item, or cut it down to
the part that is still open.

- **`TODO.md`: "Cirrus Vision Jet flies the C172's flight model."**
  - G1, G2 and G3 now load `sf50`, `sf50-g2` and `sf50-g3`; see
    `src/flight/aircraft/sf50Variants.ts` and `public/jsbsim-data/aircraft/sf50*/`.
  - G2+ still uses the G2 runtime; see `developmentNote` in `aircraftCatalog.ts`.
  - The item also claims the C172 stance; check that too.
- **`TODO.md`: "The retractable gear is visual only."**
  - It was written for the c172p.
  - The SF50 models declare `<retractable>1</retractable>` gear in `sf50.xml`,
    driven by `gear/gear-cmd-norm`.
  - It says `L` toggles the gear; the default key is `G`.
  - Check whether the C172 can still raise its gear while parked. If it can,
    keep that part.
- **`TODO.md`: "The V-tail does not move."**
  - `SURFACE_BINDINGS` in `src/flight/aircraft/aircraftAnimation.ts` now drives
    both `Ruddervator_Left` and `Ruddervator_Right`.
  - Each turns about its own hinge axis.
  - They read `fcs/left-ruddervator-pos-rad` and `fcs/right-ruddervator-pos-rad`.
- **`TODO.md`: "The Vision Jet's opt-in HD level has no landing gear" and "The
  main gear linkage does not articulate."** The HD level still exists in
  `aircraftCatalog.ts`. Check both items and leave them if they still hold.
- **`README.md`: "Aircraft and the road ahead."** It says the C172P boots with a
  placeholder visual model, and lists aircraft selection as future work.
  - The C172 is still the default aircraft; see the `"cessna-172"` fallback in
    `createFlightSimApp.ts`.
  - Its catalog summary says "Flight model and visuals both available".
  - The Vision Jet family (G1, G2, G2+, G3) can be selected.
  - Update the paragraph and the "More aircraft" bullet.

## 4. gamepad-tools: docs

Commit, for example: "Describe the toolkit as built".

`README.md`, `TODO.md` and `ASSETS.md` still describe the empty scaffold that
existed before implementation. Rewrite them from the code. Confirm each point
below before you state it.

**Entry points**, from the `package.json` `exports` map:

- **`core`:**
  - `BindingRuntime`;
  - the profile schema, normalization and `validateProfileImport`;
  - the evaluator, which produces axis, value, rate and command intents and
    reports conflicts;
  - transforms: deadzone, response curves and command hysteresis;
  - `BindingCaptureSession`, whose phases are awaiting release → listening →
    candidate → confirm;
  - `createProfileStore`.
- **`browser`:** `createBrowserInputSource`, which samples keyboard and gamepad
  and supports `selectDevice`; and `createGamepadSourceScheduler`.
- **`ui`:** `mountBindingEditor`, which provides:
  - a profile selector with built-in profiles, plus copy, rename and delete;
  - **Import profile** and **Export profile** as JSON; import checks the host
    namespace;
  - press-to-bind capture that asks what to do about conflicts;
  - a numeric view of axes and buttons, and device selection;
  - a **Show 3D controller** checkbox that loads the viewer on demand.
- **`viewer`:** `createControllerViewer`.
  - It draws a generic controller from Babylon primitives.
  - It runs on WebGPU only and reports unavailable otherwise. The `"webgl"`
    backend value in its type is never produced.
  - Sticks tilt, and triggers and buttons move.
  - It can be hidden.
- **`styles.css`.**

**Apps using it:**

- **0sfs:**
  - adapter in `src/flight/input/gamepadToolsAdapter.ts`;
  - Xbox and Classic profiles;
  - the Controls tab;
  - haptics follow the selected controller.
- **foss-earth:**
  - adapter in `src/input/globeNavigation.ts`;
  - the **Controller bindings** button;
  - no default bindings yet (see 2c).

**Validation:**

- This repository has no tests. `npm run typecheck` passes.
- The only app-side tests are in 0sfs: `src/flight/input/gamepadProfiles.test.ts`
  and `src/flight/hud/GamepadBindingsPanel.test.ts`.
- Nothing has been recorded from a real controller or real WebGPU hardware.

**Do:**

- **`README.md`:**
  - Replace "Current state". It still says browser, viewer and ui are scaffolds
    and that neither app uses the package.
  - Add install and build steps: `npm install`, `npm run build`,
    `npm run typecheck`. Note that `npm run demo` starts a Vite server.
  - Say that `dist/` is not committed, so linked apps need a build.
  - Change the foss-earth link to `https://github.com/foss-earth/foss-earth.github.io`.
  - Keep the scope and license sections.
- **`TODO.md`:** tick only what the code shows. If an item is only partly done,
  split it into its done and open parts. My reading, to confirm:
  - **Done:**
    - input acquisition, device selection and one input source per app;
    - transforms, commands, intents, conflicts, persistence, import and export;
    - binding capture that suppresses app input, with numeric feedback;
    - package exports and types.
  - **Probably done; check first:**
    - foss-earth integration, including "on-demand render scheduling";
    - 0sfs integration, including "phone authority";
    - whether capture works both ways, "action-first" and "control-first".
  - **Partly done:** the viewer. It is WebGPU-only, built from primitives, with
    no fallback.
  - **Open:**
    - Xbox and PlayStation button labels; the editor has none;
    - core tests, and headless or production checks;
    - docs on the profile format and app integration, unless your README now
      covers them;
    - evidence from real controllers and WebGPU hardware.
- **`ASSETS.md`:** it says "Core-only implementation (no 3D model geometry)". The
  viewer now builds its controller in code from primitives, and there are still
  no external assets.

## When you finish

For each repository, report:

- the branch, and each commit's hash and subject;
- the checks you ran and their results:
  - `npm run ci` in foss-earth and 0sfs after any code or config change;
  - `npm run typecheck` in gamepad-tools if you touched code;
  - for doc edits, that every relative link you added or changed points at a
    file that exists;
- anything you skipped or could not verify;
- what is waiting on me: pushes, merges to `main`, the foss-earth deploy, and
  the 2c decision;
- whether this prompt file was committed, or is still untracked;
- any branches you deleted with my approval, and the ones still waiting on me;
- a reminder that `8b6e2ef1` is still unpushed on `feat/sf50-flight-model`,
  unless I have pushed it since.
