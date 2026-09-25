# Agent instructions

Rules only. Details live in the linked docs; update those, not this file.

## Where work belongs

- 0sfs owns aircraft packages, app controls, scenarios and presentation. FOSS Earth
  (`../foss-earth`) owns reusable globe, terrain and rendering. JSBSim
  (`/Users/felg/gh/Felipegalind0/jsbsim`, on `master`) owns flight dynamics and the
  WASM SDK under `wasm/`. Fix reusable problems in their owner first; 0sfs only adapts.
- JSBSim checkout, branches, build, packaging and how 0sfs installs it:
  [docs/jsbsim.md](docs/jsbsim.md). 0sfs uses only the tarball in `deps/`
  (`npm run verify:jsbsim`). The WASM build is not reproducible, so a hash change
  between two builds of one commit means nothing.
- Upstream PR state and the replies we owe: [docs/open-upstream-prs.md](docs/open-upstream-prs.md).
  How to contribute: [docs/jsbsim-upstream-contribution-policy.md](docs/jsbsim-upstream-contribution-policy.md).
  Fix engine defects in the engine and its PRs, not with app workarounds.
- `docs/old/` holds dated records and finished prompts; never follow them as procedure.
- When a branch is needed, make it in the canonical checkout. Create worktrees only
  when concurrent work requires them.

## Scratch and output

- Never write outside this repository: no `/tmp`, `/var/folders` or harness scratchpad.
  Scratch goes in the gitignored `build/`. Nothing there is distributed, so don't cite
  it as if a reader can open it. Offload large scratch only using
  [docs/build-scratch-archive.md](docs/build-scratch-archive.md).
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

## Sound

- [docs/sound.md](docs/sound.md) is the spec; the
  [implementation ledger](docs/validation/audio-implementation-ledger.md) says what is
  done and verified. No tier is qualified on a device; never claim one is.
- After changing `src/flight/audio/dsp/*`, run `npm run build:audio` and commit the
  WASM with its provenance file.
