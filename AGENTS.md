# Agent instructions

Rules only. Details live in the linked docs; update those, not this file.

## Where work belongs

- Before writing a new module, name the repository that owns it and write it there.
  A task handed to you in this repo is not an instruction to put the code in this
  repo, and silence about where the code goes is not permission to default here.
- 0sfs owns only what needs the aircraft: JSBSim setup and fixed-step physics,
  aircraft visuals, floating origin and flight cameras, instruments, flight controls,
  the phone remote control, scenarios, and the composition of the flight app itself.
- FOSS Earth (`../foss-earth`) owns the globe: terrain, height and map sources,
  rendering, camera and input, windowing, the HUD and log shells, and every other
  part a globe application with no aircraft in it would want. gamepad-tools
  (`../Felipegalind0/gamepad-tools`) owns controller handling. JSBSim
  (`/Users/felg/gh/Felipegalind0/jsbsim`, on `master`) owns flight dynamics and the
  WASM SDK under `wasm/`.
- The test is not "is this reusable", which you cannot judge from inside 0sfs. Ask
  two questions, and move it only if both pass: would this still be correct with no
  aircraft in the scene, and would a globe application actually want this feature.
  A status log, a loading screen, a panel, a camera behaviour, a tile cache, a height
  source for a 2D basemap: both pass, so they are FOSS Earth's, however app-like they
  look and however local the request sounded.
- Generic code is not automatically shared code. Something written generically that
  exists only to serve a flight feature stays here: the phone remote control is plain
  WebRTC pairing that names no aircraft, and no globe application wants a remote
  control. When both answers are genuinely unclear, write it in FOSS Earth; pulling a
  file down into 0sfs later costs minutes, while shared code stranded here costs the
  next consumer a rewrite.
- You do not need permission to edit, commit and push in the sibling checkouts. Write
  the code in its owner, export it there, consume the public export here, and run both
  repositories' checks. Adding an export, reinstalling and testing twice is the price
  of the boundary, not a reason to keep the code here. The boundary, the link setup
  and the imported surfaces: [docs/foss-earth-relationship.md](docs/foss-earth-relationship.md).
- Fix reusable defects in their owner first; 0sfs only adapts. Fix engine defects in
  JSBSim and its PRs, not with app workarounds.
- JSBSim checkout, branches, build, packaging and how 0sfs installs it:
  [docs/jsbsim.md](docs/jsbsim.md). 0sfs uses only the tarball in `deps/`
  (`npm run verify:jsbsim`). The WASM build is not reproducible, so a hash change
  between two builds of one commit means nothing.
- Upstream PR state and the replies we owe: [docs/open-upstream-prs.md](docs/open-upstream-prs.md).
  How to contribute: [docs/jsbsim-upstream-contribution-policy.md](docs/jsbsim-upstream-contribution-policy.md).
- `docs/old/` holds dated records and finished prompts; never follow them as procedure.
- When a branch is needed, make it in the canonical checkout. Create worktrees only
  when concurrent work requires them.

## Scratch and output

- Never write outside this repository: no `/tmp`, `/var/folders` or harness scratchpad.
  Scratch goes in the gitignored `build/`. Nothing there is distributed, so don't cite
  it as if a reader can open it. It is disposable: delete a run's output once its
  results are recorded, and keep only what [docs/build-scratch.md](docs/build-scratch.md)
  lists, in 0sfs, FOSS Earth and JSBSim alike.
- Scripts default to a dated folder from `scripts/outputDirectory.mjs`; give new ones
  the same default.
- Runnable validation tools belong in `scripts/` or the owning project's `tests/`,
  not `docs/`. Retained evidence belongs in top-level `validation/evidence/`;
  `docs/` holds explanations, specifications and plans. Follow the
  [validation layout](docs/validation/layout.md).
- Playwright is not a dependency: `npm install --prefix build/tools/playwright playwright`.

## Browsers and servers

- Test from the terminal, scripts and headless browsers. Use the user's screen or a
  visible browser only when nothing else can verify the behaviour, and say why first.
  For GPU benchmarks, confirm the real GPU is in use.
- Never start a dev, preview or watch server unless asked; give the user the command.
  Stop a server you were asked to start once the check is done.

## Personal data

- Never share the user's personal data with a third party without their consent
  for that specific use: name, email, accounts, keys and tokens, location, or
  anything read from their machine outside the task, in any URL, header,
  payload, published page or message. Data the user gave for a service, such as
  their Google key for Google tiles, may go to that service only.
- Identify scripts and requests with a neutral name such as `0sfs-check/1.0`.
  When a service asks for contact details, ask the user first.

## UI

- Lay out every set of controls as a paragraph grid: items at their own width,
  wrapping like words, as the HUD bar does. Never fixed columns.
- Every setting has one home, a section of a tab. A toolbar button toggles that
  tab, showing it or closing it; nothing pops up a menu or a second copy, and
  nothing floats in a screen corner.
- Spec and reasons, shared with FOSS Earth:
  [../foss-earth/docs/ui-layout.md](../foss-earth/docs/ui-layout.md).

## Settings

- The user decides how their machine's compute, memory and bandwidth are spent,
  not the programmer. Anything that decides what is loaded, drawn, kept or
  computed is a named parameter the user can see and change, with a real unit,
  bounds, a default and the reason for it. Never hardcode such a value, and never
  hide values behind an opaque choice such as Low, Medium and High.
- Continuous quantities get continuous controls. A range is one track with two
  thumbs, never two sliders.
- Presets are for people who do not want to tune: JSON lists of parameter
  values, shown in full, copied when applied, and marked Custom after any edit.
  No code branches on a preset's name.
- Automatic behaviour moves a value only inside a range the user sets, and shows
  where the value is and why.
- Spec: FOSS Earth's [Settings](../foss-earth/docs/proposals/settings.md), and
  [Flight settings](docs/proposals/flight-settings.md) for what 0sfs adds.

## Sound

- [docs/sound.md](docs/sound.md) is the spec; the
  [implementation ledger](docs/validation/audio-implementation-ledger.md) says what is
  done and verified. No tier is qualified on a device; never claim one is.
- After changing `src/flight/audio/dsp/*`, run `npm run build:audio` and commit the
  WASM with its provenance file.
