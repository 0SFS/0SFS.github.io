# Flight Sim

A browser-based Cessna 172 flight simulator built with Babylon.js, JSBSim, and FOSS Earth.

- **Babylon.js** renders the aircraft, globe, terrain, and streamed map content.
- **JSBSim WebAssembly** simulates C172 flight dynamics, engine, propeller, fuel, and controls at 120 Hz.
- **FOSS Earth** supplies reusable application-shell and windowing UI through a local package dependency.

The simulator currently uses a placeholder aircraft model and supports Google Photorealistic 3D Tiles or free raster basemaps.

## Requirements

- Node.js 22 or newer
- npm
- A sibling checkout of [`foss-earth`](https://github.com/Felipegalind0/foss-earth)
- Optional: a Google Maps Tiles API key with the Map Tiles API enabled

The expected directory layout is:

```text
parent-directory/
├── flight-sim/
└── foss-earth/
```

Clone both repositories when setting up a new machine:

```sh
git clone https://github.com/Felipegalind0/foss-earth.git
git clone https://github.com/Felipegalind0/flight-sim.git
cd flight-sim
npm install
```

## Run Locally

```sh
npm run dev
```

Open the URL printed by Vite and select flight mode:

```text
http://127.0.0.1:5173/?mode=flight&mapSource=osm-standard
```

To use Google Photorealistic 3D Tiles:

```text
http://127.0.0.1:5173/?mode=flight&key=YOUR_GOOGLE_MAPS_API_KEY
```

Vite may choose a different port when `5173` is occupied. Opening the app without `mode=flight` starts the inherited globe application.

## Controls

| Input | Action |
| --- | --- |
| `W` / `S` | Pitch |
| `A` / `D` | Roll |
| `Q` / `E` | Yaw / rudder |
| `Shift` / `Control` | Increase / decrease throttle |
| `F` / `G` | Extend / retract flaps |
| `B` | Brake |
| `P` | Pause |
| `V` | Toggle first- and third-person camera |

Throttle and pitch trim are also available as vertical sliders in the lower-right corner. Gamepads are supported.

## Quality Checks

```sh
npm run lint
npm run test
npm run build
```

Run all three with `npm run ci`. Tests cover coordinate and attitude transforms, keyboard and throttle behavior, engine bootstrap sequencing, and real JSBSim/WASM C172 propulsion.

## FOSS Earth Dependency

`package.json` declares FOSS Earth as a local file dependency:

```json
"foss-earth": "file:../foss-earth"
```

The lockfile records `node_modules/foss-earth` as a link to that sibling checkout. Flight Sim currently imports these public package surfaces:

```ts
import { createHudBar } from "foss-earth/shell";
import "foss-earth/shell.css";

import { DockPanel, TabStrip } from "foss-earth/windowing";
import "foss-earth/windowing.css";
```

- `foss-earth/shell` provides the bottom application bar.
- `foss-earth/windowing` provides panel, tab, and workspace primitives.
- Flight physics, aircraft rendering, controls, instruments, and flight-specific content remain in this repository.

The rest of `flight-sim/src` still contains a divergent copy of older FOSS Earth globe code. Updating the package does not merge changes into those copied files.

## Bring In FOSS Earth Changes

Update the sibling checkout first:

```sh
cd ../foss-earth
git switch main
git pull --ff-only
```

Then refresh and validate Flight Sim:

```sh
cd ../flight-sim
npm install
npm run ci
```

Because the dependency is linked, source edits under `../foss-earth` are normally visible to Vite immediately. Restart Vite if dependency optimization caches an older module. Run `npm install` whenever package manifests, exports, or the lockfile relationship change.

When both applications need new shared functionality:

1. Implement and export it from FOSS Earth through its `package.json` `exports` map.
2. Test it in the FOSS Earth repository.
3. Import the public package path from Flight Sim instead of copying it.
4. Run `npm run ci` in Flight Sim and manually verify flight mode.

Changes to inherited globe files under `flight-sim/src` must still be reviewed and ported manually. Do not overwrite flight-specific changes with a blanket directory copy.

See [docs/foss-earth-relationship.md](docs/foss-earth-relationship.md) for more architectural background.

## Project Layout

```text
src/engine/         Babylon rendering and map runtimes
src/flight/         JSBSim runtime, physics, aircraft, input, and flight UI
src/terrain/        Globe elevation helpers
src/app/            Inherited globe application
public/jsbsim-data/ C172 aircraft, engine, and propeller definitions
```
