# Scripted F-35B landing-page video

The world feature card uses a real five-second 0SFS flight, replacing the old
instrument-covered C172 screenshot. Capture and encoding run from source;
there is no hand-flown recording or generated scenery. The old `public/preview.jpg`
remains available, but the page and its social preview now use the new footage.

## Scene and timing

`scripts/hero-scenario.json` is the editable source of the scene and composition:

- F-35B at 44.974516° N, 93.2375° W, above the Mississippi beside the University
  of Minnesota, initially 180 m above the prepared terrain and 300 knots.
- Heading 270°, with a smooth 2° → 45° pitch command over 1.5 seconds, reaching
  approximately 45° nose-up by three seconds. Real control inputs fly the aircraft;
  the report checks measured pitch at three seconds (within 3°).
- Google Photorealistic 3D Tiles, the physical sky, and WebGPU.
- Initial lighting: 25 October 2026, 17:14 **solar** time at the aircraft (18:10:58 CDT, 23:10:58 UTC). Tune this interactively below.
- Start at 90% throttle; command 100% at 0.2 s (frame 6). The real engine spools up and lights its augmentor naturally; it starts dry.
- No external fuel tanks: fresh flight defaults remove their fuel, dry mass and drag before initial conditions. Capture checks both tanks stay absent throughout.
- 150 frames at 30 fps, normal 60 Hz physics, five-second silent 960 × 540 video.
- Chase distance 24 m, height 4 m, FOV 55°, with a gentle 12° → −8° counterclockwise camera orbit, viewed from above.

## Tune the sunset while paused

```sh
cd ~/gh/0sfs/0sfs.github.io
npm run tune:hero
```

This opens an isolated **visible Chrome window**, at the exact capture spawn,
with the flight paused and its physics clock frozen. The simulator UI stays
available: use the Sky tab to adjust its fixed date/time. Alternatively, enter
an ISO date/time in the terminal, for example `2026-10-25T17:35:00-05:00`.
Enter `save` to write the current sky time into `scripts/hero-scenario.json`;
enter `quit` (or Ctrl+C) to close the browser and any server the script started.
Saved times use UTC; `scene.timeZone` still records Minneapolis.

Then run `npm run capture:hero` and `npm run check:hero -- --install` to regenerate
and install the chosen lighting. The existing video stays installed until checks pass.
The video contains no provider HUD. The landing card supplies a clickable Google
3D Tiles attribution link beside the video; retain that attribution when embedding.

The scene, controls, physics steps and output timestamps are repeatable. Exact
pixels and file sizes can vary with streamed tile detail, application changes,
the browser's native codecs and GPU. This is a tunable scripted capture, not a
claim of bit-identical renders across machines.

## Reproduce

Use the existing sibling `0sfs/fly` checkout with its development dependencies
installed, the shared `foss-earth/browser-testing` checkout, and installed Google
Chrome. On macOS the script finds the normal Chrome application; elsewhere set
`CHROME_BIN` to the browser executable. It needs working WebGPU, VP9/H.264
WebCodecs encoders and access to the configured Google scenery.

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
decodes frames at 0, 2 and 4.9 s, checks dimensions and duration, and verifies
that playback advances. It saves contact sheets and a report in `decode-check/`.
`--install` copies both passed video files, the poster and compact provenance
JSON to `public/media/`. It refuses a capture with failed flight/timing checks.

The primary format is VP9 WebM at a target 500 kbit/s, with H.264 MP4 at
700 kbit/s as the browser fallback. Chrome's native WebCodecs does the encoding;
the small bounded muxers wrap these silent streams without transcoding. MP4
places metadata before media for fast startup. The installed provenance JSON
records exact sizes, hashes and measured flight checks.

Application panels, provider HUD, compass and detail slider are hidden for capture.
The landing caption supplies a clickable Google 3D Tiles attribution link outside
encoded pixels, alongside the aircraft and location.

## Playback and local review

The landing page uses a lightweight native video element with a JPEG poster,
WebM first and MP4 fallback. It loops silently in view, pauses offscreen or when
the tab is hidden, and offers a keyboard-accessible pause/play button. Reduced
motion or data-saving settings start with the still poster; the visitor can
explicitly play it. With JavaScript disabled the poster remains visible.

Review the hero at laptop, wide and phone widths. Check that the aircraft stays
clear of the copy, Google credit stays visible, playback is inline and silent,
and the button pauses/resumes. Under reduced motion it should stay still until
played. No simulator or 3D-engine code is loaded by this page.

Nothing in this workflow commits, pushes or deploys the page.

The capture checks the sky renderer’s actual UTC instant and measured camera yaw.
The installer versions video/poster URLs by content hash to prevent stale cached media.
