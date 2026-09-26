# Open-source competitors

This page lists the other open-source flight simulators, what each one does, and where OSFS stands among them. The speed and memory techniques they use that OSFS lacks are in [Competitor performance techniques](competitor-performance.md).

Checked on 25 September 2026. Star counts and last-push dates come from GitHub on that day, except FlightGear's, which come from GitLab. Features come from each project's own README. [Sources](#sources) says how each project was found.

## Browser simulators

These run in a web page, like OSFS, and are its closest competitors.

| Project | Flight model | World | Built with | License | Last push | Stars |
|---|---|---|---|---|---|---:|
| **[OSFS](https://github.com/0SFS/0SFS.github.io)** | JSBSim in WebAssembly at 120 Hz | Google Photorealistic 3D Tiles with your key, or free raster maps over streamed elevation | TypeScript, Babylon.js, FOSS Earth | AGPL-3.0-only | 2026-09-19 | 1 |
| [Aeronaut](https://github.com/vinny-palumbo/FlightSim) | Arcade by default. JSBSim in WebAssembly (Cessna 172P, F-16) is an option. | Google Photorealistic 3D Tiles, which require your key | JavaScript, Three.js, CesiumJS, React | MIT for the app code | 2026-09-22 | 0 |
| [Cesium Flight Simulator](https://github.com/WilliamAvHolmberg/cesium-flight-simulator) | Its own, with an aircraft and a car | Cesium ion terrain and imagery, which require Cesium ion and Mapbox tokens | TypeScript, CesiumJS, React | The README says MIT, but the repository has no license file | 2026-01-04 | 438 |
| [Retro Flight Simulator](https://github.com/ruben3d/retroflightsim) | Its own | Procedural, drawn like a 1991 flight simulator | TypeScript, Three.js | MIT | 2023-05-10 | 141 |
| [The Little Plane Project](https://github.com/Glowstick0017/Little-Plane-Project) | Speed and heading only | Procedural 2D world from Perlin noise | JavaScript, no libraries | MIT | 2026-03-20 | 117 |

## Desktop simulators

| Project | Flight model | World | Built with | License | Last push | Stars |
|---|---|---|---|---|---|---:|
| [FlightGear](https://www.flightgear.org/) | JSBSim, YASim | The whole Earth, downloaded as you fly | C++, OpenSceneGraph | GPL-2.0 | 2026-09-24; release 2024.1.7 in August 2026 | 79 on GitLab |
| [YS Flight Simulator](https://github.com/captainys/YSFLIGHT) | Its own | Its own scenery maps | C++ | BSD-3-Clause | 2023-07-14 | 187 |
| [Kestrel](https://github.com/wesfly/kestrel) | [avian_fdm](https://github.com/viccuad/avian_fdm) | Real elevation from Mapterhorn on a round Earth; buildings are experimental | Rust, Bevy | GPL-3.0 | 2026-09-07 | 81 |
| [MScSim](https://github.com/marek-cel/mscsim) | Its own | Bundled terrain packages | C++, OpenSceneGraph, Qt | MIT | 2024-05-31 | 349 |

## Neighbours

These open-source projects fly aircraft, but they are not general flight simulators.

| Project | What it is | Built with | License | Last push | Stars |
|---|---|---|---|---|---:|
| [Orbiter](https://github.com/orbitersim/orbiter) | Newtonian spaceflight across the solar system | C++ | MIT | 2026-09-24 | 1,987 |
| [Rigs of Rods](https://github.com/RigsOfRods/rigs-of-rods) | Soft-body vehicle sandbox that includes airplanes and helicopters | C++ | GPL-3.0 | 2026-09-22 | 1,245 |
| [Skybolt](https://github.com/Prograda/Skybolt) | Engine for simulating aircraft, ships and spacecraft on a 3D planet | C++, Python | MPL-2.0 | 2026-09-25 | 657 |
| [Dogfight Sandbox](https://github.com/harfang3d/dogfight-sandbox-hg2) | Air-to-air combat sandbox | Python, HARFANG 3D | GPL-3.0 | 2026-04-01 | 227 |
| [OpenGL Flightsim](https://github.com/gue-ni/OpenGL_Flightsim) | Small simulator written from scratch, explained in [a write-up](https://www.jakobmaier.at/posts/flight-simulation/) | C++, OpenGL | MIT | 2023-10-28 | 188 |

## Not open source

People will compare OSFS with these, but they are not open source, so they are not in the tables:

- **[Web Flight Simulator](https://github.com/dimartarmizi/web-flight-simulator)** (576 stars) is a browser F-15 combat game built on Three.js and CesiumJS terrain. Its source is public, but its license forbids commercial use.
- **[GeoFS](https://www.geo-fs.com/)** is a free browser flight simulator with global scenery. It is closed source.
- **X-Plane, Microsoft Flight Simulator and DCS World** are commercial desktop simulators.

## Where OSFS stands

- **Aeronaut is the closest match.** It pairs Google Photorealistic 3D Tiles with JSBSim in WebAssembly, and its JSBSim SDK is `@0x62/jsbsim-wasm`, the upstream project that ours derives from. Its README shows three differences:
  - Aeronaut needs a Google key before it will fly. OSFS flies on free raster maps without one.
  - Aeronaut does not give JSBSim the ground. In its JSBSim mode the aircraft stops at sea level and passes through higher scenery, and takeoff and landing are not supported. OSFS feeds the streamed terrain to JSBSim's landing gear ([Ground contact](ground-contact.md)), and its airport presets start on a runway.
  - Aeronaut has an arcade model for casual flying, and a jet that flies with F-16 dynamics under a Rafale model. OSFS has no arcade mode.
- **FlightGear sets the bar for depth.** Its aircraft, weather, multiplayer and VATSIM support go far beyond OSFS, and it also uses JSBSim. But it is a desktop install, while OSFS is a link. OSFS already studies its aircraft: see [FlightGear aircraft](flightgear-aircraft.md).
- **Kestrel** gets its elevation from Mapterhorn, the same source FOSS Earth uses by default. It also has 3D cockpits with clickable controls, which OSFS lacks.
- **Among the browser simulators, only OSFS and Aeronaut use JSBSim.** The others use flight models of their own.
- **None of the others lets you use a phone as a controller for another screen.** Aeronaut shows touch controls on narrow screens, but OSFS pairs a phone over a QR code and flies the aircraft on your computer with it ([Phone controller](phone-controller.md)).

## Sources

The projects were found on 25 September 2026 in three ways:

- **Web searches:** `open source flight simulator list FlightGear alternatives GPL`, `open source browser flight simulator WebGL github JSBSim three.js cesium`, and `"JSBSim" WebAssembly browser flight simulator open source 2026`. Aeronaut was the first result of the second and third. The second also found Web Flight Simulator and [its Hacker News thread](https://news.ycombinator.com/item?id=46948113).
- **Lists of FlightGear alternatives** that the first search returned: [AlternativeTo](https://alternativeto.net/software/flightgear/) and [Fly Away Simulation](https://flyawaysimulation.com/ask/answers/best-flightgear-alternatives/).
- **GitHub search, sorted by stars:** the phrases `flight simulator`, `flight simulator browser`, `flight sim cesium`, `jsbsim wasm`, `jsbsim webassembly`, `flight simulator three.js`, `flightsim webgl` and `flight simulator babylon`, and the topics [flight-simulator](https://github.com/topics/flight-simulator), [flight-simulation](https://github.com/topics/flight-simulation), [flightsim](https://github.com/topics/flightsim) and [jsbsim](https://github.com/topics/jsbsim).

Each row's facts come from these places:

- **Stars, license and last push:** the GitHub API for each repository. FlightGear's come from the GitLab API, including its release tags.
- **Licenses the API could not name:** the license file itself. MScSim's is `LICENSE.rtf`. Web Flight Simulator's `LICENSE` forbids commercial use. Cesium Flight Simulator has no license file.
- **Features:** each project's README, linked from its row. Aeronaut's README names its SDK, `@0x62/jsbsim-wasm`.
- **Claims about source code:** the commits listed in [Competitor performance](competitor-performance.md#sources).

These were also read but are not in the tables: [ThreeFlightSimulator](https://github.com/PierreEVEN/ThreeFlightSimulator) (archived), [Scramble](https://github.com/ScrambleSim/Scramble) (last push 2021), [Pylot](https://github.com/usuaero/Pylot) (last push 2022) and [fly](https://github.com/amhndu/fly) (last push 2024).
