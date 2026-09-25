# Project origin spark

Historical record, written 2026-09-19. Not procedure.

## The spark

The idea that became OSFS started when the project founder saw
[JSBSim discussion #984, "Javascript alternative?"](https://github.com/JSBSim-Team/jsbsim/discussions/984)
(converted from [issue #980](https://github.com/jsbsim-team/jsbsim/issues/980))
and thought: if JSBSim ran on WASM, it would be cool to use that with
FOSS Earth to make a flight sim.

That thought is the founder's recollection, recorded here so the starting
point is not lost. Everything below it is verifiable thread and repo history.

## What discussion #984 actually says

- 2026 thread title is "Javascript alternative?", in the Ideas category,
  started by [hg0428](https://github.com/hg0428) on Oct 30, 2023.
- Opening question: "I saw JS in the name and hoped that this was JS, but
  then I clicked on it and it wasn't. Is there any way I could integrate
  this with THREE.js via WASM?"
- [seanmcleod](https://github.com/seanmcleod) (collaborator) replied the same
  day: the "JS" is someone's initials, and "I don't see any particular
  reason you couldn't compile JSBSim to WASM, although I'm not aware of
  anyone trying to do so."
- hg0428 replied Nov 1, 2023 that integration looked hard and they would
  probably have to build their own.

## How the WASM piece arrived

- Feb 20, 2026, [0x62](https://github.com/0x62) commented on the same thread
  with a published WASM build: [0x62/jsbsim-wasm](https://github.com/0x62/jsbsim-wasm).
- OSFS's first commit in this checkout is `2e2bdaca`, dated 2026-09-05
  ("init commit").
- Sep 13–14, 2026, [Felipegalind0](https://github.com/Felipegalind0) replied
  on the thread: 0x62 "pulled it off", and that build was used to create a
  browser flight sim ([0SFS](https://github.com/0SFS/0SFS.github.io)),
  integrated with Babylon.js; a follow-up notes the
  [PR to jsbsim-wasm](https://github.com/0x62/jsbsim-wasm/pull/8) made while
  building it and the intent to upstream the packaging through a JSBSim fork.
- Sep 14, 2026, maintainer
  [seanmcleod70](https://github.com/seanmcleod70) replied that the browser
  flight sim on top of wasm-JSBSim "looks great" and described a separate
  interest (wasm-JSBSim via Pyodide for marimo notebook exports).

## The FOSS Earth half of the thought

OSFS originated from FOSS Earth, but the copied globe runtime was removed;
shared globe, rendering, map, input and UI behavior is consumed through the
FOSS Earth package boundary. See
[docs/foss-earth-relationship.md](../foss-earth-relationship.md) for the
current division of responsibilities. The spark above is the moment those two
halves — WASM JSBSim for physics, FOSS Earth for the world — were first
imagined together.
