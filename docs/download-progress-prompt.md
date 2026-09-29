# TODO: show download progress in the flight log

Implement this in a separate conversation. The UMN tour loading work exposed a
broader need: downloads should report useful progress through the existing log,
and content should become usable as soon as its own dependencies arrive.

## Ownership

FOSS Earth owns the shared log and generic map/terrain/scene downloading. Its
`GameLog` already supports an accessible progress bar through a line's
`progress` field; `src/shell/sceneLog.ts` connects scene activity to that log.
Reuse that public shell API. 0SFS owns the flight-specific download producers and
their composition in `src/flight/createFlightSimApp.ts`.

## Work

- Audit JSBSim WASM/data, aircraft models, audio banks and other flight downloads.
  Connect each logical task to one log line, updating it in place.
- Report actual received bytes against a known total. If a total is unavailable,
  show an indeterminate bar and received bytes; never invent a percentage. File
  counts can be shown separately and must be labelled as counts.
- Distinguish downloading, decoding/compiling, preparing and ready. A download at
  100% is not necessarily a ready aircraft. Keep ready content usable while
  independent optional resources arrive.
- Keep cancellation, failures, retries, cache hits and replacement of an aircraft
  truthful. Abort stale work and prevent its callbacks from updating a new task.
- Keep log updates bounded and aggregate noisy tile/file activity. Reuse the
  user's existing request and memory settings; any new resource control needs
  a visible parameter with units, bounds, default and reason.
- Preserve the flight's startup readiness requirements. Do not start physics
  before the files needed by that aircraft exist.

Start by reading `src/flight/jsbsim/hydrateJsbsimData.ts`,
`src/flight/jsbsim/createJsbsimRuntime.ts`, `src/flight/audio/audioBank.ts`, the
loading phases in `src/flight/createFlightSimApp.ts`, and FOSS Earth's
`src/log/createGameLog.ts` and `src/shell/sceneLog.ts`.

Test slow streams, missing lengths, failure halfway through, cancellation and
cached resources. Run each owner's required checks. Do not add a separate
loading overlay or duplicate a setting's home.
