# FOSS Earth Relationship

## Current Structure

OSFS and FOSS Earth are separate sibling repositories, and both use a third, gamepad-tools:

```text
parent-directory/
├── 0sfs/
├── foss-earth/
└── Felipegalind0/
    └── gamepad-tools/
```

OSFS originated from FOSS Earth, but the copied globe runtime has been removed. Shared globe, rendering, map, input, and UI behavior is consumed through the FOSS Earth package boundary.

## Local Package Link

OSFS declares:

```json
"foss-earth": "file:../foss-earth"
"@felipegalind0/gamepad-tools": "file:../Felipegalind0/gamepad-tools"
```

FOSS Earth declares the same gamepad-tools link, so one checkout serves both applications. The npm lockfile marks `node_modules/foss-earth` and `node_modules/@felipegalind0/gamepad-tools` as links resolved to those sibling folders. Therefore:

- Both sibling checkouts must exist before installing OSFS dependencies.
- gamepad-tools must be built first: its package exports point at a `dist/` that is not committed.
- Source edits in FOSS Earth are available through the link. Edits in gamepad-tools are available once it is rebuilt.
- Vite may need a restart when package exports or optimized dependencies change.
- `npm install` should be rerun when either package manifest or the lockfile relationship changes.

These local dependencies are convenient for developing the repositories together, but they are not reproducible remote version pins. CI and deployments must check out all three repositories in the expected layout and build gamepad-tools, or the dependencies must later be changed to published packages or pinned Git revisions.

## Imported Surfaces

OSFS imports only public FOSS Earth package exports:

| Export | Purpose |
| --- | --- |
| `foss-earth/shell` | Configurable bottom HUD ending in the map source (provider, credit link, download speed, detail rail), responsive two-sided WindowOverlay with its Location, Map and Renderer tabs, the runtime status log, page fullscreen with its remembered choices, `createParameterSection` for each settings section of the flight's tabs, the Saved settings section, and the detail controller's track markers (the Flight minimum) |
| `foss-earth/settings` | The app's settings registry: FOSS Earth's parameters and the flight's `osfs.*` ones in one record, with their migration from the old keys |
| `foss-earth/shell.css` | Shared shell styling |
| `foss-earth/input` | Input mode and sensitivity preferences, Safari gesture support, globe gamepad navigation, and orbit inversion |
| `foss-earth/windowing` | Panel, tab, and workspace primitives |
| `foss-earth/windowing.css` | Shared windowing structure |
| `foss-earth/runtime` | Babylon runtime, renderer/map types, map selection, detail policy types, and simulation hooks |
| `foss-earth/cameraMath` | Shared WGS84/ECEF conversion and angle constants |
| `foss-earth/mapDetailPolicy` | Map detail policy types and pure helpers, without the renderer, for the flight's World detail import |
| `foss-earth` | Globe application and public globe APIs |

The HUD is adapted in `src/flight/hud/createFlightHudBar.ts`. `FlightControlPanel.tsx` supplies the flight's tabs (Weather, Aircraft, Autopilot, Controls, Remote Control, Sound, Engine, Logging, Debug) to the shared `WindowOverlay`. Flight parameters homed in FOSS Earth's tabs (Map → Detail, Renderer → Instruments, Controls → Orbit) are drawn there by FOSS Earth; see [Flight settings](proposals/flight-settings.md). FOSS Earth owns both window slots, responsive fit, launchers, tab movement, minimize/restore behavior, and window styling.

The standalone globe lives at [foss-earth.github.io](https://foss-earth.github.io/). OSFS used to
host a copy behind `?mode=globe`; that query now redirects there.

Location content uses `LocationPanel` from `foss-earth/windowing`. Its structured `onApply` callback reaches OSFS’s `resetFlightLocation`, which resets the loaded JSBSim aircraft at geodetic coordinates while retaining altitude, airspeed, and heading. The app reseeds physics interpolation and updates the ECEF/ENU floating origin and map view immediately, including while paused.

The shared overlay supplies the Location tab with coordinate entry and its existing Nominatim place search. Hosts can override the search provider through `FlightSimAppOptions.locationSearchProvider`.

Flight controls, JSBSim integration, aircraft behavior, instruments, and flight-specific UI remain local to OSFS.

## Updating From Upstream

Update and test FOSS Earth:

```sh
cd ../foss-earth
git switch main
git pull --ff-only
npm install
npm run ci
```

Then refresh and validate OSFS:

```sh
cd ../OSFS
npm install
npm run ci
```

If an upstream change adds a new package surface, FOSS Earth must expose it in its `package.json` `exports` map. OSFS should consume that public export rather than import internal paths.

## Ownership Boundary

The dividing question is not "is this reusable", which nobody can answer from inside
OSFS. There are two questions, and a piece of work belongs to FOSS Earth only when
both are answered yes:

> 1. Would this code still be correct in a globe application with no aircraft in the
>    scene?
> 2. Would a globe application actually want this feature?

When both hold, it is FOSS Earth's, even when OSFS is the only caller today, even when
the request arrived as an OSFS task, and even when the code looks like product surface
rather than engine.

The second question is what stops the correction running too far. Code can be written
generically, name nothing aircraft-specific, and still exist only to serve a flight
feature; genericity is a property of the code, while ownership follows the feature.
Such code stays in OSFS.

When both answers are genuinely unclear, write it in FOSS Earth: moving a file down
into OSFS later is a rename and an import change, while shared code stranded in OSFS
is discovered only when a second FOSS Earth consumer needs it and has to write it
again.

FOSS Earth owns:

- Babylon renderer creation and WebGPU fallback/probing.
- Google 3D Tiles and raster basemap runtimes, including the height and surface
  sources that back them.
- Globe camera and browser input handling.
- Shared map configuration, geospatial math, layers, terrain, sprites, and globe HUD.
- Shared window, dock, panel and status-log shells, and their styling.
- The optional simulation world root, simulated view state, and per-frame tick used by
  OSFS.

OSFS owns:

- JSBSim setup and fixed-step physics.
- Aircraft visuals, floating-origin application, and flight cameras.
- Flight controls, instruments, panels, and HUD composition.
- Scenarios, validation of the flight model, and product routing between the FOSS
  Earth globe and OSFS modes.
- The phone remote control end to end: pairing, WebRTC transport, connection
  diagnostics, control protocol and phone UI.

For a shared-runtime change:

1. Implement and test it in FOSS Earth.
2. Export it through a documented package surface when OSFS needs it.
3. Consume that export from OSFS; do not copy the source and do not deep-import.
4. Run both repositories' CI checks.

Editing, committing and pushing in the sibling checkouts needs no separate approval.
The extra steps a shared change costs, adding an export, `npm install`, two CI runs,
are the price of the boundary and never a reason to keep the code in OSFS.

### Misplacements to learn from

These were written in OSFS and had to be moved afterwards. Each one passed the "no
aircraft in the scene" test and should have started in FOSS Earth:

- `src/log/createGameLog.ts`, a runtime status log with its resize behaviour and
  styling, roughly 700 lines. It looked like OSFS presentation; it was a globe shell
  component, and now lives in `foss-earth/shell`.
- Height sampling for 2D raster basemaps, which the flight app needed for ground
  contact. The sampler is terrain, belongs beside the raster tile runtime, and a
  second FOSS Earth consumer needs it.
- Page fullscreen with its two remembered choices, now `foss-earth/shell`; orbit
  inversion, now `foss-earth/input`; and gamepad response shaping, now
  `@felipegalind0/gamepad-tools/core` beside the deadzone code it configures. Each
  named nothing aircraft-specific and each serves a feature any globe wants. OSFS
  keeps the wording and composition around them: `offerFullscreen` is still here
  because it speaks for the flight page.
- World detail: the rail beside the basemap, its saved range and default, and the
  device-hint recommendation. Any globe showing Google 3D Tiles wants them, so they
  are FOSS Earth's detail controller (`createMapDetailController`), rail and Map
  tab Detail group in `foss-earth/shell`, as the
  [Map detail implementation spec](../../foss-earth/docs/proposals/map-detail-control.md)
  defines. OSFS imports its old `osfs.world-detail-target` once into the shared
  record (`src/flight/worldDetail.ts`) and keeps only what needs the aircraft: the
  Flight minimum, the aircraft anchor, the session waiver, and a low-spawn
  requirement that holds Google mesh finer until departure without editing the
  saved preference.

### A case that stays in OSFS

`src/remote/` pairs a phone with the simulator over WebRTC. Its transport, pairing,
ICE configuration, QR scanning and connection diagnostics name no aircraft and pass
the first question outright. They stay in OSFS, because no globe application wants a
remote control: the feature is the flight simulator's, so the code serving it is
OSFS's however generic it reads.
