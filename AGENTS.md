# Agent Instructions

## Repository ownership and dependency work

- The normal dependency checkouts are /Users/felg/gh/Felipegalind0/jsbsim and /Users/felg/gh/Felipegalind0/jsbsim-wasm. Repository layout is gh/owner/repo; do not infer missing checkouts from flat gh/repo paths.
- Use ordinary branches in those checkouts by default. Create additional worktrees only when concurrent work actually requires them.
- OSFS owns aircraft packages, application controls, scenarios, scheduling, and presentation integration. FOSS Earth owns reusable globe, terrain, and rendering services. JSBSim owns native dynamics and platform compatibility. jsbsim-wasm owns bindings, native-handle lifetime, SDK diagnostics, and generic Wasm filesystem services.
- Before adding a dependency workaround, inspect its owning repository and existing upstream work. Put reusable fixes there first; use OSFS only for application-specific adaptation.
- Existing upstream work: JSBSim PR 1502 (wheel dynamics), jsbsim-wasm PR 8 (property batching and gear contacts), and JSBSim PR 1504 (Emscripten portability). Check their current status before duplicating or extending them.
- jsbsim-wasm intentionally applies its tracked patches/jsbsim-emscripten-compat.patch to vendor/jsbsim during preparation. A dirty vendor submodule can be the expected result; inspect the tracked patch before treating it as lost work or resetting it.

## Testing and computer use

- Prefer terminal commands, scripts, APIs, and headless browser automation for tests and benchmarks, including CPU/GPU comparisons.
- Do not take over the user's cursor or use a visible Chrome/browser GUI when a terminal or headless route can perform the task.
- Use GUI automation only when it is the only viable way to verify the required behavior; explain that necessity before using it.
- For GPU benchmarks, verify that the terminal/headless runtime uses the real hardware GPU rather than a software fallback.

## Development Servers

- Never start a development, preview, watch, or other long-running server unless the user explicitly asks the agent to start it.
- When browser verification requires a server, give the user the exact command and ask them to start it.
- Do not assume permission from an already running server or from a request to test browser behavior.
- If the agent started a server after an explicit request, report its URL and stop it as soon as the requested verification is complete.
