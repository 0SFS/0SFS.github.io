# Orbit check, 2026-09-26

The acceptance check in [Flight settings](../../../../docs/proposals/flight-settings.md#acceptance):
with **Around the aircraft**, one full turn of the chase camera at a fixed
aircraft position makes no map request once loading has settled, on Google and
on a 2D basemap.

Run with:

```
node scripts/validation/map-focus/check-focus-orbit.mjs --foss-earth=<FOSS Earth worktree at 770ca40> --modes=view,around,both
```

The code was 0sfs `f90775a6` and FOSS Earth `770ca40`, neither with uncommitted
changes (`report.json` → `checkouts`). The run used headless Chrome with WebGL2
at 1440×900, with the Cessna 172 at the default start, paused. The focus point
was Aircraft, at the default 10 km radius.

Loading counts as settled after 5 s without a map request, once the map chip no
longer shows tiles streaming. Requests are counted by host during one 360°
right-drag of the camera and for the 5 s after it.

| Map | Load around | Altitude | Requests before the turn | During the turn and 5 s after |
| --- | --- | --- | --- | --- |
| 2D, USGS Imagery | View | 5,853 ft | 1,305 | 280 |
| 2D, USGS Imagery | Around the aircraft | 5,853 ft | 1,111 | **0** |
| 2D, USGS Imagery | View and aircraft | 5,857 ft | 1,432 | 305 |
| Google 3D Tiles | View | 5,764 ft | 402 | 148 |
| Google 3D Tiles | Around the aircraft | 5,754 ft | 327 | **0** |
| Google 3D Tiles | View and aircraft | 5,763 ft | 449 | 220 |

View is the control: the same turn loads what comes into view. View and aircraft
is the flight's default, and it loads only what lies beyond the radius.

`report-auto-off.json` repeats the 2D Around run with automatic adjustment off
(`map.auto.terrainDetail` and `map.auto.imageryDetail` false). It also made 0
requests, so the result doesn't depend on automatic adjustment happening to
hold still.

The screenshots were taken at the half turn: the camera faces the aircraft, so
the turn happened. A coarse Google tile shows as a raised slab above the
horizon in the Google views; FOSS Earth has been told.

Before FOSS Earth's `48ebc30` and `770ca40`, flights on Google started from
−23,569 ft to 42,999 ft, depending on which coarse tiles had loaded when
terrain preparation took the ground. Before `c1841bb`, a turn with Around on
the 2D map requested a few elevation tiles.
