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
| `foss-earth/shell` | Configurable bottom HUD and responsive two-sided WindowOverlay |
| `foss-earth/shell.css` | Shared shell styling |
| `foss-earth/windowing` | Panel, tab, and workspace primitives |
| `foss-earth/windowing.css` | Shared windowing structure |
| `foss-earth/runtime` | Babylon runtime, renderer/map types, map selection, and simulation hooks |
| `foss-earth/cameraMath` | Shared WGS84/ECEF conversion and angle constants |
| `foss-earth` | Globe application and public globe APIs |

The HUD is adapted in `src/flight/hud/createFlightHudBar.ts`. `FlightControlPanel.tsx` supplies Weather, Aircraft, and Debug content to the shared `WindowOverlay`. FOSS Earth owns both window slots, responsive fit, launchers, tab movement, minimize/restore behavior, and window styling.

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

FOSS Earth owns:

- Babylon renderer creation and WebGPU fallback/probing.
- Google 3D Tiles and raster basemap runtimes.
- Globe camera and browser input handling.
- Shared map configuration, geospatial math, layers, terrain, sprites, and globe HUD.
- The optional simulation world root, simulated view state, and per-frame tick used by OSFS.

OSFS owns:

- JSBSim setup and fixed-step physics.
- Aircraft visuals, floating-origin application, and flight cameras.
- Flight controls, instruments, panels, and HUD composition.
- Product routing between the FOSS Earth globe and OSFS modes.

For a shared-runtime change:

1. Implement and test it in FOSS Earth.
2. Export it through a documented package surface when OSFS needs it.
3. Consume that export from OSFS; do not copy the source.
4. Run both repositories' CI checks.
