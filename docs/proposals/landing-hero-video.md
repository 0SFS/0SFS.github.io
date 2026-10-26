# Scripted F-35B landing-page video

The video widget uses two real five-second 0SFS flight recordings, replacing the old
instrument-covered C172 screenshot. Capture and encoding run from source;
the aircraft inputs stay scripted, and scenery comes from the simulator. Camera
movement can use the original orbit or a saved manual take. The old `public/preview.jpg`
remains available, but the page and its social preview now use the new footage.

## Scene and timing

`scripts/hero-scenario.json` is the editable source of the scene and composition:

- F-35B at 44.974516° N, 93.2375° W, above the Mississippi beside the University
  of Minnesota, initially 180 m above the prepared terrain and 300 knots.
- Heading 270°, with a smooth 2° → 45° pitch command over 1.5 seconds, reaching
  approximately 45° nose-up by three seconds. Real control inputs fly the aircraft;
  the report checks measured pitch at three seconds (within 3°).
- Google Photorealistic 3D Tiles or USGS Imagery Topo, the physical sky, and WebGPU.
- Initial lighting: 25 October 2026, 17:14 **solar** time at the aircraft (18:10:58 CDT, 23:10:58 UTC). Tune this interactively below.
- Start at 90% throttle; command 100% at 0.2 s (frame 6). The real engine spools up and lights its augmentor naturally; it starts dry.
- No external fuel tanks: fresh flight defaults remove their fuel, dry mass and drag before initial conditions. Capture checks both tanks stay absent throughout.
- 150 frames at 30 fps, normal 60 Hz physics, five-second silent 960 × 540 video.
- Chase distance 24 m, height 4 m, FOV 55°, with a gentle 12° → −8° counterclockwise camera orbit, viewed from above.

## Tune the camera, start and sunset

```sh
cd ~/gh/0sfs/0sfs.github.io
npm run tune:hero -- --manual-camera
```

This opens an isolated **visible Chrome window** at the capture spawn, paused
at frame zero, with a **Video** tab. The new tab exists only in this script's
instrumented development session; it adds no editor to the production flight.

- **Play / Pause**, **Restart** and the **Position** slider preview the scripted
  flight frame by frame. Seeking backwards restores the starting flight and dry
  engine, then replays the same controls. Dragging the slider coalesces pending
  seeks to its latest position. The last position is the last encoded frame,
  one frame before the duration boundary.
- **Duration** changes the scene length, from just over three seconds through
  fifteen seconds, in one-frame increments. Shortening trims later camera points.
  It does not stretch the throttle cue or the climb commands.
- **Manual** lets you frame the paused aircraft. Use the simulator's normal
  camera gestures: right-drag and wheel in Mouse mode; two-finger scroll and
  pinch in Trackpad mode; drag and pinch on a touchscreen. The existing input
  method control chooses Mouse or Trackpad.
- Frame your starting shot, then press **Record camera**. It restarts at zero
  and records your orbit and zoom while the aircraft follows its script. Pause
  stops recording. Play and the position slider replay that camera take. Adjust
  the camera while paused to replace/add a point at that frame; Record camera
  starts a fresh take. **Scripted** switches back to the original orbit without
  deleting your manual points.
- **Start** edits latitude, longitude, height above prepared ground and heading.
  Every valid keystroke or number-input step updates the aircraft immediately
  and pauses at **0.00 s**. No Apply action or blur is needed. The fields remain
  editable while terrain refreshes in the background; the latest edit wins.
  Nearby displayed terrain supplies the immediate height preview, followed by
  the prepared ground when ready. Play waits for preparation. Heading-only edits
  reuse prepared ground. Incomplete/invalid values hold the last valid pose at
  zero until corrected. These fields always set the flight's starting values.
- **Save scenario** writes the scene, duration, camera path and current fixed sky
  time to the selected JSON. It keeps the scripted aircraft inputs and video
  encoding settings. Saving refuses to overwrite a scenario changed externally
  since the editor opened. The installed landing videos stay untouched.

**Lighting…** opens the existing Date and time tab; Sky remains available too.
Alternatively, enter an ISO date/time in the terminal, for example
`2026-10-25T17:35:00-05:00`. Terminal `save` saves the complete scenario, just like
the tab's button. Enter `quit` (or Ctrl+C) to close Chrome and any server the script
started. Saved times use UTC; `scene.timeZone` still records Minneapolis. A stale
solar-time annotation is removed after changing location or lighting.

`npm run tune:hero` opens the same editor using the scenario's saved camera mode
(the original scenarios default to Scripted). `--manual-camera` selects Manual
and implies tuning, so it also works with `capture:hero`. Use
`--scenario=scripts/hero-scenario-usgs.json` to tune the USGS variant. For a
disposable experiment, copy a scenario into `build/hero/` and pass that path.

Manual takes are stored in `camera.keyframes`: ordered samples of time, yaw,
pitch, distance and field of view. Capture interpolates them with short-angle yaw
wrapping and holds the first/last pose outside the recorded interval. Each output
frame is checked against the selected camera path. Flight controls and fixed
physics timing are verified independently. A slow rendering frame slows the
interactive preview instead of skipping simulation or camera samples.

Then run `npm run capture:hero` and `npm run check:hero -- --install` to regenerate
and install the chosen lighting. The existing video stays installed until checks pass.
The videos contain no provider HUD. The landing card supplies the selected
provider’s attribution link beside its map selector; retain that attribution
when embedding.

The scene, saved camera path, controls, physics steps and output timestamps are repeatable. Exact
pixels and file sizes can vary with streamed tile detail, application changes,
the browser's native codecs and GPU. This is a tunable scripted capture, not a
claim of bit-identical renders across machines.

## Reproduce

Use the existing sibling `0sfs/fly` checkout with its development dependencies
installed, the shared `foss-earth/browser-testing` checkout, and installed Google
Chrome. On macOS the script finds the normal Chrome application; elsewhere set
`CHROME_BIN` to the browser executable. It needs working WebGPU, VP9/H.264
WebCodecs encoders and access to the configured scenery. Only Google capture
requires a Google key; the USGS capture does not read or inject one.

The key lookup checks `GOOGLE_3D_TILES_KEY`, then `FOSS_EARTH_GOOGLE_KEY`, in the
environment, followed by the documented ignored `.env.local` files in FOSS Earth
app, UMN-VR tour and fly. The new variable takes precedence across files. Keys
are injected into an isolated local browser profile, removed when it closes,
and excluded from output URLs and metadata. Do not put keys in the scenario.

```sh
cd ~/gh/0sfs/0sfs.github.io

# First check the camera/lighting without encoding the full flight.
npm run capture:hero -- --preview

# Record, check real decoding/seeking/playback, then install only checked assets.
npm run capture:hero
npm run check:hero -- --install

# Capture and install the USGS version with the same controls, lighting and orbit.
npm run capture:hero -- --scenario=scripts/hero-scenario-usgs.json
npm run check:hero -- --dir=build/hero/f35-westbound-umn-usgs --install

# Build and preview the landing page with the existing sibling fly/dist/.
npm run dev
```

The capture script reuses a reachable local HTTPS simulator server or starts
`npm run llm-dev` in fly and stops that owned server afterwards. It does not
publish, rebuild the production simulator, or edit simulator source. Only the
development module response inside the isolated browser is instrumented. Capture
anchors are checked and a changed application shape fails explicitly.

For a variant, copy the JSON into `build/hero/`, change its name and parameters,
then run:

```sh
npm run capture:hero -- --scenario=build/hero/my-scene.json --out=build/hero/my-scene
npm run check:hero -- --dir=build/hero/my-scene
```

Options `--fly=`, `--browser-testing=` and `--url=` let capture use alternate local
checkouts or a loopback HTTPS server. Check also accepts `--browser-testing=`.
Run either command with `--help` for its options. Names are file stems; if
installing a renamed variant, update the landing page's source/poster references.

## Output and verification

Ignored `build/hero/<name>/` contains original frames, a still preview, a JPEG
poster, both videos, a sanitized server log and `capture.json`. The report records
every frame's flight state and engine lightoff, exact timing checks, source
commits/dirty state, source hashes and file hashes. The flight clock advances
only on explicit capture steps; tile streaming and sky rendering may finish
between steps without advancing the aircraft.

The check command opens each file in Chrome, verifies its recorded SHA-256,
decodes frames at the start, 40% and 0.1 s before the end, checks dimensions and duration, and verifies
that playback advances. It saves contact sheets and a report in `decode-check/`.
`--install` copies both passed video files, the poster and compact provenance
JSON to `public/media/`. It refuses a capture with failed flight/timing checks.

The primary format is VP9 WebM at a target 500 kbit/s, with H.264 MP4 at
700 kbit/s as the browser fallback. Chrome's native WebCodecs does the encoding;
the small bounded muxers wrap these silent streams without transcoding. MP4
places metadata before media for fast startup. The installed provenance JSON
records exact sizes, hashes and measured flight checks.

Application panels, provider HUD, compass and detail slider are hidden for capture.
The bottom-left **?** opens an anchored tooltip containing the current provider
link, aircraft, location and capture date outside encoded pixels. The map selector
at bottom right has a separate attribution-link icon, matching FOSS Earth’s HUD:
Google’s legal notices for Google 3D Tiles, USGS’s credit page for USGS Imagery Topo.

## Playback and local review

The landing page uses one native video element with a matching JPEG poster,
WebM first and MP4 fallback. Only the selected basemap’s sources enter the player.
It loops silently in view, pauses offscreen or when
the tab is hidden, and offers a keyboard-accessible pause/play button. Reduced
motion or data-saving settings start with the still poster; the visitor can
explicitly play it. With JavaScript disabled the poster remains visible.

The two inert source templates in `index.html` hold the versioned URLs and
provider links. `public/landing-video.js` selects the URL override
`set.map.source.basemap`, then the saved `map.source.basemap` in FOSS Earth’s
settings record, then Google. A choice preserves the record’s other values and
presets and carries through to the Fly URL. Unavailable storage still permits
switching and Fly. A paused comparison keeps its time; an unplayed reduced-motion
preview switches posters without downloading a video. Both scenarios are explicit
JSON files; keep their time, flight, camera and encoding settings aligned when tuning.

Review at laptop, wide and phone widths. Check that the aircraft stays
unobstructed, provider links match the selected scenery, playback is inline and
silent, and the left play/pause controls work. Fly is centered above the bottom
controls, like the 360 viewer’s Return to map button. The entire background and
the visible Fly label are one native link to `/fly/`; the independent controls
sit above it. Under reduced motion it should stay still until played. No simulator
or 3D-engine code is loaded by this page.

Nothing in this workflow commits, pushes or deploys the page.

The capture checks the sky renderer’s actual UTC instant and measured camera yaw.
The installer versions video/poster URLs by content hash to prevent stale cached media.

## Check the editor and collect feedback

```sh
# Short real-simulator check; uses an ignored copy, never the source scenarios.
npm run check:hero-tuner
# Or exercise the same editor with Google scenery (requires the local key).
npm run check:hero-tuner -- --scenario=scripts/hero-scenario.json
```

The check covers dry-engine rewind, repeated scripted flight, a trusted mouse
camera gesture, recording/replay, pause, duration, relocation/heading/AGL and
scenario save. It verifies live input events, native arrow-key stepping, retained
input focus, editable fields during preparation, invalid drafts and the t=0 lock.
It also verifies the real Test tab and downloadable feedback JSON.
Reports and review markup are under `build/hero/editor-check/`. To use that
checklist in your own tuning window after running the check:

```sh
npm run tune:hero -- --manual-camera --test-plan=build/hero/editor-check/test-plan.json
```

The Video tab opens first. The Test tab remains available in the same workspace:
Start, try the controls, record Pass/Fail/Skip and notes, then Finish → Download
feedback. `test-link.txt` contains the equivalent checklist link; launching with
`--test-plan` ensures the checklist and instrumented editor share one window.

Rewinding crosses exhaust-light on/off boundaries. The exhaust renderer keeps
that light's buffer alive while disabled and releases it with its owner; disposing
it during a rewind invalidated WebGPU material bindings and left a blank view.
The editor check verifies the rendered relocated scene and rejects graphics
validation errors as well as checking the flight state.
