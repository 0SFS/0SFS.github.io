# ✈️ OSFS — Open Source Flight Simulator

**A real-world browser flight simulator built to be explored, extended, and shared.**

OSFS puts Google Photorealistic 3D Tiles beneath your wings and JSBSim in charge of flight physics, all running locally in a browser tab. It combines a streamed Earth with aircraft dynamics, instruments, controls, and an open codebase you can build on.

Bank over a city you recognize. Follow the streets below. Change the wind, line up an approach, and switch to the chase camera to take it all in. This project brings a streamed Earth and a flight dynamics engine together in a simulator you can build on.

## Why this is exciting

- **Fly over the real world in 3D.** Google Photorealistic 3D Tiles brings detailed cityscapes and terrain into the scene. Free raster basemaps are available too, so you can get flying without a Google API key.
- **Physics powered by JSBSim.** Flight dynamics run in WebAssembly at 120 Hz, with aircraft, engine, propeller, fuel, and control simulation.
- **Explore from the cockpit or chase camera.** Switch views, orbit around the aircraft, and zoom out to see where you're headed.
- **Set up your next flight.** Reposition through the location panel, use airport presets, and adjust wind direction and speed.
- **Built to tinker with.** TypeScript, Babylon.js, and the shared FOSS Earth globe runtime put the scenery, controls, and simulation within reach.

## Aircraft and the road ahead

The ambition extends across aircraft types. The **Cessna 172P is the current starting aircraft**: this checkout bundles its JSBSim definitions and boots into it, with a placeholder visual model. More aircraft and richer models are part of where the project is headed.

Future directions:

- **More aircraft:** expand beyond the bundled C172P, with aircraft selection and matching visual models.
- **ArduPilot support:** use ArduPilot as an optional autopilot when the user does not want to fly manually. The planned integration looks like this:
  1. JSBSim remains the flight dynamics model. It advances the aircraft and produces the simulated sensor state: position, attitude, velocity, airspeed, and altitude.
  2. A small local bridge connects the browser to ArduPilot Plane SITL. It sends that sensor state into the autopilot and receives its servo outputs over the [external simulator interface](https://ardupilot.org/dev/docs/sim-on-hardware.html)/MAVLink.
  3. OSFS maps those outputs back to the aircraft controls—elevator, aileron, rudder, throttle, and flaps—so ArduPilot is flying the same aircraft the user sees on screen.
  4. The user can switch between manual control and autopilot control, monitor the autopilot state in the HUD, and take over immediately. The bridge can start as a local WebSocket-to-SITL process because browsers cannot open arbitrary UDP connections themselves.

This is a planned integration, not an implemented feature yet. The first milestone is a C172P with ArduPilot Plane SITL flying through the existing JSBSim loop; later milestones can add missions, telemetry, and other ArduPilot vehicle types.

OSFS is under active development. The world streaming and flight physics are running today; the broader simulator is still taking shape.

## Requirements

- Node.js 22 or newer
- npm
- A sibling checkout of [`foss-earth`](https://github.com/Felipegalind0/foss-earth)
- Optional: a Google Maps Tiles API key with the Map Tiles API enabled

The expected directory layout is:

```text
parent-directory/
├── OSFS/
└── foss-earth/
```

Clone both repositories when setting up a new machine:

```sh
git clone https://github.com/Felipegalind0/foss-earth.git
git clone https://github.com/Felipegalind0/OSFS.git
cd OSFS
npm install
```

## Run Locally

```sh
npm run dev
```

Vite serves source changes directly; no production build is needed first. Restart `npm run dev` after changing the FOSS Earth package manifest or exports.

Open the URL printed by Vite and select flight mode:

```text
http://127.0.0.1:5173/?mode=flight&mapSource=osm-standard
```

To use Google Photorealistic 3D Tiles:

```text
http://127.0.0.1:5173/?mode=flight&key=YOUR_GOOGLE_MAPS_API_KEY
```

Vite may choose a different port when `5173` is occupied. Opening the app without `mode=flight` starts the current globe application exported by the linked FOSS Earth checkout.

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

Throttle and pitch trim are also available as vertical sliders in the lower-right corner. Gamepads are supported. In mouse input mode, right-drag to orbit the chase camera and scroll to zoom; trackpad mode supports scrolling to orbit and pinching to zoom.

Use the flight panel to change wind conditions, reposition, or choose an airport preset. Departure presets start paused—press `P` when you’re ready.

## Quality Checks

```sh
npm run lint
npm run test
npm run build
```

Run all three with `npm run ci`. Tests cover coordinate and attitude transforms, keyboard and throttle behavior, engine bootstrap sequencing, and real JSBSim/WASM C172 propulsion.

## Deploy

`npm run deploy` builds for the organization-site root and publishes `dist`. If a failed publish reports `spawn E2BIG`, clear the publisher's temporary checkout before retrying:

```sh
npx gh-pages-clean
npm run deploy
```

GitHub Pages serves the locally built `gh-pages` branch at:

```text
https://0sfs.github.io/
```

No GitHub Actions workflow is required for this deployment method. Before a
release, open the deployed site and verify flight mode, JSBSim loading, and
phone pairing on the public URL.

## FOSS Earth Dependency

`package.json` declares FOSS Earth as a local file dependency:

```json
"foss-earth": "file:../foss-earth"
```

The lockfile links `node_modules/foss-earth` to that sibling checkout. FOSS Earth provides the Babylon.js globe renderer, Google/raster map selection, application bar, and shared windowing and input UI. OSFS owns the flight physics, aircraft rendering, controls, and instruments.

Opening the app without `mode=flight` launches the FOSS Earth globe. Shared functionality is imported through FOSS Earth's public package exports; compatibility modules forward to that package.

See [docs/foss-earth-relationship.md](docs/foss-earth-relationship.md) for architectural background.

## Bring In FOSS Earth Changes

Update the sibling checkout first:

```sh
cd ../foss-earth
git switch main
git pull --ff-only
```

Then refresh and validate OSFS:

```sh
cd ../OSFS
npm install
npm run ci
```

Because the dependency is linked, source edits under `../foss-earth` are normally visible to Vite immediately. Restart Vite if dependency optimization caches an older module. Run `npm install` whenever package manifests, exports, or the lockfile relationship change.

When both applications need new shared functionality:

1. Implement and export it from FOSS Earth through its `package.json` `exports` map.
2. Test it in the FOSS Earth repository.
3. Import the public package path from OSFS instead of copying it.
4. Run `npm run ci` in OSFS and manually verify flight mode.

## Project Layout

```text
src/compat/         Compatibility re-exports for existing package subpaths
src/flight/         JSBSim runtime, physics, aircraft, input, and flight UI
src/remote/         Phone controller UI, pairing, and WebRTC transport
src/main.tsx        Route selection for globe, flight, and phone modes
public/jsbsim-data/ Bundled JSBSim aircraft, engine, and propeller definitions
```

## Phone Controller

In flight mode (`?mode=flight`), click **Phone controller** and scan the QR with your phone camera. Once paired, tap **Fly** on the phone to take control. Fly preserves the simulator's current pause state; use **Resume** separately if paused. The touch controller provides pitch/roll, rudder, throttle, trim, flaps, brake, pause, camera view, and release.

Pairing uses PeerJS Cloud. Flight inputs travel over a direct WebRTC data channel configured with `ordered: false` and `maxRetransmits: 0`. Both pages are static GitHub Pages assets; no application server, local helper, or Cloudflare Tunnel is needed. Internet access is needed for page loading and initial signaling. V1 uses STUN only; guest Wi-Fi isolation, firewalls, and some network combinations can prevent direct pairing. Try the same non-guest Wi-Fi network if connection setup fails.

The QR expires after two minutes and admits one phone. Closing the dialog hides it; **Disconnect** invalidates the invitation or ends the session. Desktop flight inputs or **Take control** immediately reclaim control. Lost or delayed phone inputs, a hidden desktop tab, or phone disconnection pause the simulation and return control to the desktop. Resuming or taking phone control always requires an explicit action.

The QR normally opens `https://0sfs.github.io/?mode=remote`. To use a different static HTTPS deployment, set `VITE_PHONE_CONTROLLER_URL` to its base URL at build time. The phone and desktop must use the same protocol version; reload both after an update. The phone route loads independently of the globe renderer and JSBSim.

See [the specification](docs/proposals/phone-controller.md) for the control protocol, failure behavior, and device acceptance checklist. Real iPhone/Android testing on the deployed site is still required before treating the feature as verified on those devices.
