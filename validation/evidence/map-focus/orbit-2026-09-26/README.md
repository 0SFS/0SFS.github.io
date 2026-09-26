# Orbit check, 2026-09-26

The acceptance check in [Flight settings](../../../../docs/proposals/flight-settings.md#acceptance):
with **Around the aircraft**, one full turn of the chase camera at a fixed
aircraft position makes no map request once loading has settled.

Run with `node scripts/validation/map-focus/check-focus-orbit.mjs`. The code was
0sfs `51a8f1ae` and FOSS Earth `061b78f`, neither with uncommitted changes
(`report.json` → `checkouts`). The run used headless Chrome with WebGL2 at
1440×900, with the Cessna 172 at the default start, paused. The focus point was
Aircraft, at the default 10 km radius. Loading counts as settled after 5 s
without a map request. Requests are counted by host during one 360° right-drag
of the camera and for the 5 s after it. The script at `b8c64378` also records
the aircraft's altitude; this run was made before that change, so the altitudes
below are read from the screenshots.

| Map | Load around | Altitude | Requests before the turn | During the turn and 5 s after |
| --- | --- | --- | --- | --- |
| 2D, USGS Imagery | View | 5,851 ft | 895 | 203 |
| 2D, USGS Imagery | Around the aircraft | 5,850 ft | 704 | **0** |
| Google 3D Tiles | View | 42,999 ft | 190 | 250 |
| Google 3D Tiles | Around the aircraft | 42,999 ft | 109 | 0, which does not count |

The Google Around result does not count. The flight started at 42,999 ft, so no
ground lay within 10 km of the aircraft and the region was empty.

The start altitude on Google is a FOSS Earth defect that predates the settings
work. On Google, terrain preparation accepts the first complete set of surface
samples, and those can hit coarse tiles kilometres above or below the ground.
Starts from −23,569 ft to 42,999 ft were seen. 0sfs `0cef5408` with FOSS Earth
`6b9bc9a` does the same. The Google check is to be run again once the defect is
fixed.

The screenshots were taken at the half turn: the camera faces the aircraft, so
the turn happened. `google-around-half-turn.jpg` shows the coarse Google tiles
that an empty region leaves.
