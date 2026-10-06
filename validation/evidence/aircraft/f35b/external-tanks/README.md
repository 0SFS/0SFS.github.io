# External tank mesh fit, 2026-10-05

These three static images place the distributed FlightGear tank/pylon GLB
beneath the distributed AF267 airframe GLB at the same positions used by the
runtime. `report.json` pins both input hashes and records the renderer.

`scripts/validation/aircraft/render-f35b-external-tanks.py` rendered the views
with Blender Cycles on the CPU, 12 samples and five threads. This verifies
mesh placement without a browser, server or GPU benchmark. It does not verify
native browser lighting, jettison animation, real-aircraft fit, a certified
loadout or flight performance. NullEngine regression tests separately exercise
the actual tank GLB loader and the visual release lifecycle.

The inspected front-quarter, underside and side views show two symmetric
tanks, pylons reaching the wing underside, and tank bodies above the wheels.
No obvious tank/airframe or tank/gear intersections were visible. Mounting
positions and the source pylon fit remain development approximations.

Airframe: **AF267**, CC BY 4.0; see
`public/aircraft/f-35b/NOTICE.md`. Tank and pylon: **FlightGear F-35B package
contributors**, GPL version 3; see
`public/aircraft/f-35b/ExternalTank_FlightGear.NOTICE.md`. These rendered views
combine those separately attributed assets and imply no contributor endorsement.
