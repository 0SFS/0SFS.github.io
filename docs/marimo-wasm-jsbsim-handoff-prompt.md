# Work prompt: wasm-JSBSim for marimo notebooks — research + plan

Start a fresh conversation with this file. You are the planner for one
question: how do we give JSBSim maintainer seanmcleod70 what he asked for —
editable marimo notebooks that run JSBSim entirely in the browser — via a
fork → implement → PR flow into his repo? Your job is to investigate and
recommend. Implementation is a later step; the judgment is yours.

Everything below was read on 2026-09-19. It is a starting point, not a
conclusion. Refresh the live state before relying on any of it, and treat
anything marked **unverified** as a hypothesis to confirm or reject.

## Background (verified 2026-09-19, re-verify before relying on it)

1. Thread: [JSBSim discussion #984, "Javascript alternative?"](https://github.com/JSBSim-Team/jsbsim/discussions/984).
   On Sep 14, 2026, maintainer [seanmcleod70](https://github.com/seanmcleod70)
   replied to [Felipegalind0](https://github.com/Felipegalind0) with the
   message quoted under "His ask" below. Full thread context is in
   `docs/old/project-origin-spark-2026-09-19.md`.
2. His repos:
   - Sources (marimo notebooks as `.py`, `data/jsbsim` aircraft files,
     `public/` images): <https://github.com/seanmcleod70/FlightDynamicsCalcs>
     (25 notebooks, e.g. "Climb Performance.py", "JSBSim Aerodynamics.py",
     "Trim Envelope.py", "Cross Wind Crab Angle.py"; API check 2026-09-19:
     default branch `main`, last push `2026-07-26T19:05:03Z` — i.e. **nothing
     has been committed since his Sep 14 message**).
   - Static exports: <https://seanmcleod70.github.io/FlightDynamicsCalcs/>
   - Working wasm-html example WITHOUT JSBSim (numpy/matplotlib only):
     <https://seanmcleod70.github.io/FlightDynamicsCalcs/CrossWindCrabAngle.html>
3. What we own (verify in this checkout before assuming details):
   - This repo (0sfs): browser flight sim, JSBSim-in-WASM at 120 Hz +
     Babylon.js. See `docs/jsbsim.md` (WASM pipeline,
     tarball-is-authority, non-reproducible builds),
     `docs/jsbsim-upstream-contribution-policy.md`, `docs/old/README.md`.
   - Canonical JSBSim checkout with native `src/` + `wasm/` SDK at one
     revision; published to this app as `@felipegalind0/jsbsim`
     (**Emscripten JS/TS SDK — NOT a Python wheel**).
   - Prior art: `0x62/jsbsim-wasm`, our PR `0x62/jsbsim-wasm#8`, upstream
     packaging PRs.

## His ask (seanmcleod70, Sep 14 2026 — the requirement to satisfy)

He wants a 3rd option between (a) static HTML snapshots and (b) "install
Python + JSBSim + marimo locally": wasm-html exports of his notebooks hosted
on GitHub Pages where visitors can MODIFY parameters/code and everything
still runs in the browser. Proven for numpy/matplotlib via Pyodide; blocked
on JSBSim because his notebooks call the Python API directly
(e.g. Climb Performance: `import jsbsim`,
`fdm = jsbsim.FGFDMExec("data/jsbsim")`, trim loops, then matplotlib).
Any proposal must preserve: notebook editability in the browser, GitHub
Pages hostability (static files; note marimo html-wasm must be served over
HTTP, `file://` will not work), and results that match desktop runs.

## What you produce

1. **Notebook inventory**: which notebooks actually import jsbsim vs pure
   numpy/matplotlib? Rank 2–3 candidates for a FIRST conversion PoC
   (small, fast, few aircraft files, tolerant of slower in-browser runs).
   "Climb Performance.py" is 36 KB with trim sweeps — assess whether it is
   a good or bad first target and say why.
2. **marimo html-wasm mechanics** (current marimo version): how are
   dependencies resolved in the export (Pyodide built-ins? micropip?
   PEP 723 inline deps? local wheels — cf. marimo-team/marimo#10071)? What
   are the hard limits (package size, memory, no-subprocess, data-file
   access to `data/jsbsim`, `public/` images)?
3. **The crux — "wasm-jsbsim via Pyodide"**: enumerate the REAL options with
   feasibility + effort for each:
   - a. Compile JSBSim's Python bindings as a Pyodide extension
     (wasm32-emscripten; upstream `src/python` interface, embind vs
     pybind11, Emscripten exception/POSIX constraints we already hit in
     our SDK: `-fexceptions`, IDBFS — do these transfer?).
   - b. Keep our existing Emscripten JS module and bridge it from Python via
     Pyodide's `js` / ForeignFunctionInterface (Python calls the JS SDK in
     the same page; how do aircraft XML/data get into MEMFS/IDBFS? what
     does the per-notebook shim look like?).
   - c. Precompute / hybrid (static results + interactive non-JSBSim cells)
     — honest assessment of how far short of his ask this falls.
   - d. Any other route you find — only if genuinely applicable to HIS
     marimo setup, not generic speculation.
4. **PoC step list** for the recommended route: which notebook, build
   commands, export command, where data files live, how to serve + verify
   locally in a headless browser, expected pitfalls, and how results get
   validated against desktop JSBSim output.
5. **Fork → PR strategy** into `seanmcleod70/FlightDynamicsCalcs`: what the
   fork contains (PoC conversion of ONE notebook first, not all 25), branch
   shape, how to keep his static-export workflow unbroken, and what the PR
   description should promise vs explicitly NOT promise.
6. **Draft reply** to post on discussion #984: warm, short, factual —
   confirm the repo hasn't moved since July, state the one-PoC proposal,
   name the chosen notebook and route, give a realistic effort/timeline
   placeholder he can react to, and end with one question (e.g. which
   notebook he'd most like to see interactive first). Keep it under
   ~200 words. Quote no private data.

**Do not write code, do not fork anything, do not open a PR, do not post.**
Do not comment on GitHub; do not push any branch. Anything sent to GitHub is
public and permanent — the user does that after reading your output.

## Constraints

- Ground every load-bearing claim: read the actual notebook source, the
  actual marimo export docs for the version pinned, and (in this checkout)
  `docs/jsbsim.md` + the contribution policy before recommending. Mark
  anything unverified as such.
- Do not propose an app-level workaround for an engine defect
  (house rule: engine defects get fixed in the engine / wasm SDK, not
  papered over in a notebook shim). If the route needs an SDK change, say
  which repo owns it and why.
- Licensing/provenance: note what travels with what (JSBSim LGPL notices,
  aircraft data provenance) — flag, don't solve.
- Effort honesty: if the real answer is "this is 2–4 weeks of Emscripten/
  Pyodide build work before notebook #1 converts", say so plainly with the
  breakdown. Do not sell option (c) as satisfying his ask.

Keep the whole report tight; details in bullets, no essays.
