# ✈️ OSFS — Open Source Flight Simulator

**A real-world browser flight simulator built to be explored, extended, and shared.**

### **[→ Start flying](https://0sfs.github.io/)**

Nothing to install, no account, no sign-up. It runs in a browser tab.

OSFS puts Google Photorealistic 3D Tiles beneath your wings and JSBSim in charge of flight physics.
Bank over a city you recognize. Follow the streets below. Change the wind, line up an approach, and
switch to the chase camera to take it all in.

## Why this is exciting

- **Fly over the real world in 3D.** Google Photorealistic 3D Tiles brings detailed cityscapes and terrain into the scene. Free raster basemaps are available too, so you can get flying without a Google API key.
- **Physics powered by JSBSim.** Flight dynamics run in WebAssembly at 120 Hz, with aircraft, engine, propeller, fuel, and control simulation.
- **Explore from the cockpit or chase camera.** Switch views, orbit around the aircraft, and zoom out to see where you're headed.
- **Set up your next flight.** Reposition through the location panel, use airport presets, and adjust wind direction and speed.
- **Fly with your phone.** Pair a phone over a QR code and use it as a touch controller — see [Phone controller](docs/phone-controller.md).
- **Built to tinker with.** TypeScript, Babylon.js, and the shared FOSS Earth globe runtime put the scenery, controls, and simulation within reach.

## Controls

| Input | Action |
| --- | --- |
| `W` / `S` | Pitch |
| `A` / `D` | Roll |
| `Q` / `E` | Yaw / rudder |
| `Shift` / `Control` | Increase / decrease throttle |
| `F` / `R` | Extend / retract flaps |
| `G` | Raise / lower the landing gear |
| `B` | Brake |
| `P` | Pause |
| `V` | Toggle first- and third-person camera |

Throttle and pitch trim are also vertical sliders in the lower-right corner, and the gear has a `G`
button in the instrument row above the attitude indicator. Gamepads are supported.
In mouse input mode, right-drag to orbit the chase camera and scroll to zoom; trackpad mode supports
scrolling to orbit and pinching to zoom.

Use the flight panel to change wind conditions, reposition, or choose an airport preset. Departure
presets start paused — press `P` when you're ready.

## Aircraft and the road ahead

The ambition extends across aircraft types. The **Cessna 172P is the current starting aircraft**:
this build bundles its JSBSim definitions and boots into it, with a placeholder visual model. More
aircraft and richer models are part of where the project is headed.

Future directions:

- **More aircraft:** expand beyond the bundled C172P, with aircraft selection and matching visual models.
- **ArduPilot support:** use ArduPilot as an optional autopilot when you do not want to fly manually. The planned integration looks like this:
  1. JSBSim remains the flight dynamics model. It advances the aircraft and produces the simulated sensor state: position, attitude, velocity, airspeed, and altitude.
  2. A small local bridge connects the browser to ArduPilot Plane SITL. It sends that sensor state into the autopilot and receives its servo outputs over the [external simulator interface](https://ardupilot.org/dev/docs/sim-on-hardware.html)/MAVLink.
  3. OSFS maps those outputs back to the aircraft controls — elevator, aileron, rudder, throttle, and flaps — so ArduPilot is flying the same aircraft you see on screen.
  4. You can switch between manual and autopilot control, monitor the autopilot state in the HUD, and take over immediately. The bridge can start as a local WebSocket-to-SITL process because browsers cannot open arbitrary UDP connections themselves.

This is a planned integration, not an implemented feature yet. The first milestone is a C172P with
ArduPilot Plane SITL flying through the existing JSBSim loop; later milestones can add missions,
telemetry, and other ArduPilot vehicle types.

OSFS is under active development. The world streaming and flight physics are running today; the
broader simulator is still taking shape.

## Documentation

| Document | What it covers |
| --- | --- |
| [Phone controller](docs/phone-controller.md) | Pairing a phone as a touch controller, and its limits |
| [Deploying to GitHub Pages](docs/deploying.md) | Publishing the live site — one command, `npm run deploy` |
| [Development](docs/development.md) | Local setup, tests, the FOSS Earth dependency, building your own copy |
| [Contributing](CONTRIBUTING.md) | Review expectations, asset provenance, pull request scope |
| [FOSS Earth relationship](docs/foss-earth-relationship.md) | How OSFS and the shared globe runtime divide responsibilities |
| [How JSBSim runs in the browser](docs/jsbsim-wasm.md) | The WebAssembly flight dynamics pipeline |
| [Ground contact](docs/ground-contact.md) | Terrain collision and gear contact against streamed meshes |
| [Aircraft assets](docs/aircraft-assets.md) | Aircraft asset structure and provenance requirements |
| [Creating an aircraft model](docs/creating-an-aircraft-model.md) | Modeling guide for contributing new aircraft |
| [Software dependency graph](docs/software-dependency-graph.md) | What OSFS is built on, and under which licenses |
| [Design proposals](docs/proposals/) | ArduPilot SITL, phone controller protocol, collision, and elevation proposals |
| [Release checklist](RELEASE_CHECKLIST.md) | What to verify before publishing a build |

## Contributing

Bug reports and pull requests are welcome. Start with [Development](docs/development.md) for setup
and [CONTRIBUTING.md](CONTRIBUTING.md) for what a reviewable change looks like. Aircraft and other
creative assets need an explicit provenance record — see [ASSET_LICENSES.md](ASSET_LICENSES.md).

Security reports go through [SECURITY.md](SECURITY.md). Participation is covered by the
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

OSFS is licensed under [AGPL-3.0-only](LICENSE). See [NOTICE](NOTICE) for third-party terms,
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) for bundled dependencies,
[ASSET_LICENSES.md](ASSET_LICENSES.md) for aircraft and creative assets, and
[COMMERCIAL_LICENSE.md](COMMERCIAL_LICENSE.md) for commercial arrangements.
