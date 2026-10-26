# Bento phone renderings

Artwork for two bento cards: **05 / Phone controller** gets one phone and
**Multiplayer** gets a pair of phones, one image each. Every image shows a real
0SFS screen on a large Android phone built in code. The images
are baked to transparent WebP, so the page needs no 3D engine. They are wired
into `index.html` and `landing.css`, with content-hash media URLs and a Google
notices link behind the multiplayer card's bottom-right **?**. The phone model
was built in this project's own code and needs no third-party model credit.
The images and rendering pipeline are unchanged.

Task: [delegate-smartphone-renderings.md](delegate-smartphone-renderings.md).

## Outputs

| File | Pixels | Bytes | Aspect | Shows |
| --- | --- | --- | --- | --- |
| `public/media/bento-remote-phone.webp` | 840 × 518 | 36,514 | 1.62 : 1 | One landscape phone running the live-paired phone controller |
| `public/media/bento-multiplayer-left.webp` | 640 × 504 | 42,338 | 1.27 : 1 | The host's phone, screen turned left: its F-35B with the guest's Vision Jet flying on its left wing |
| `public/media/bento-multiplayer-right.webp` | 640 × 504 | 45,104 | 1.27 : 1 | The guest's phone, screen turned right: its Vision Jet with the host's F-35B on its right wing, into the sunset |

- The two multiplayer images are one scene, rendered separately. Placed side by side at the same height, the phones stand back to back like rival players: each screen is turned away from the other player but still faces the viewer. Both screens come from one live multiplayer session, and on both the Vision Jet flies left of the F-35B.
- All images are lossy WebP with a lossless alpha channel (cwebp `-q 84 -alpha_q 100`).
- Each phone fills its image's width apart from 22 px each side. There are 14 px above, and 40 px below for the soft shadow.
- At 2× the phone controller image is sharp up to 420 CSS px wide and each multiplayer image up to 320 CSS px.
- I left out PNG fallbacks: every browser that runs the simulator decodes WebP, and a PNG with alpha would weigh about ten times more.
- Lossless PNG masters are kept in `build/bento-phones/renders/` (ignored).

I inspected the images on the cards' own gradients from `landing.css` (dark
green and dark blue) at 2×: the phone controller at 300, 360 and 400 CSS px, and
the multiplayer pair side by side with a 24 px gap at 200, 250 and 300 CSS px
each. The preview is
`build/bento-phones/preview.png`, made by the render step from
`build/bento-phones/preview.html`.

## Suggested markup

The images are decorative next to the card text, like the placeholders they
replace. Give them their intrinsic size so the layout doesn't shift:

```html
<!-- Phone controller card: replaces <div class="feature__phone" aria-hidden="true">…</div> -->
<img class="feature__phone-art" src="media/bento-remote-phone.webp" width="840" height="518" alt="" loading="lazy" decoding="async" />

<!-- Multiplayer card: replaces <div class="feature__formation" aria-hidden="true">…</div> -->
<div class="feature__multiplayer-art" aria-hidden="true">
  <img src="media/bento-multiplayer-left.webp" width="640" height="504" alt="" loading="lazy" decoding="async" />
  <img src="media/bento-multiplayer-right.webp" width="640" height="504" alt="" loading="lazy" decoding="async" />
</div>
```

```css
.feature__phone-art { display: block; width: min(100%, 400px); height: auto; aspect-ratio: 840 / 518; }
.feature__multiplayer-art { display: flex; gap: clamp(8px, 3%, 24px); align-items: flex-start; width: min(100%, 640px); }
.feature__multiplayer-art img { display: block; flex: 1 1 0; min-width: 0; height: auto; aspect-ratio: 640 / 504; }
```

Keep the two multiplayer images the same width and top-aligned, left image
first. They share one camera, so the pair then lines up as one scene. If the card
is too narrow for two, stacking them also works, but the back-to-back pose reads
best side by side.

If an image should carry meaning instead, these alt texts describe it accurately:

- "The 0SFS phone controller in landscape: stick pad, throttle and an F-35B's engine readouts."
- Left: "A phone turned to the left, showing an F-35B over Minneapolis at sunset with a Cirrus Vision Jet flying on its left wing."
- Right: "A phone turned to the right, showing the same Vision Jet with the F-35B on its right wing, flying into the sunset."

The multiplayer screens show Google Photorealistic 3D Tiles, and each screen keeps
its own "3D Tiles" credit. The card links Google's notices (`Google 3D Tiles ↗`)
inside a native popover, opened by a bottom-right **?** named "Multiplayer artwork
credits". The model itself needs no external credit. Follow the
[supplementary-copy policy](supplementary-copy-policy.md) when integrating artwork.

## Reproduce

From `0sfs.github.io`:

```sh
node scripts/bento-phones/build.mjs                 # capture the screens live, then render all three images (~3 min)
node scripts/bento-phones/build.mjs --render-only   # rerender from the existing captures (~6 s)
```

Options:

- `--only=remote` or `--only=multiplayer` limits both steps.
- `--remote=fixture` captures the phone controller from rc's real-component layout fixture instead of a live pairing.
- `--no-preview` skips the preview.

The two steps can also run on their own: `scripts/bento-phones/capture.mjs` and
`scripts/bento-phones/render.mjs`. Rerendering from the same captures gives
byte-identical files.

Everything that shapes the images lives in
[`scripts/bento-phones/config.json`](../../scripts/bento-phones/config.json):

- flight start, time of day, aircraft and chase cameras for each capture
- the phone's dimensions and materials
- each render's camera, phone poses, output width and padding
- the studio light boxes, the shadow and the WebP quality

### Framing the multiplayer cameras by hand

```sh
node scripts/bento-phones/tune.mjs   # opens http://127.0.0.1:7489/
```

This brings up the same live two-phone session as the capture step, starting
at config's framings, and opens a page with both phones' screens live.

- **Drag** a screen to orbit that phone's chase camera, as a finger on the phone
  does: the script sends the drag to the phone as a one-finger swipe on the sky.
- **Scroll** over a screen, or press **Closer** or **Farther**, to zoom: the script
  sends a two-finger pinch.
- **Reset to config** returns that camera to where the session started it.
- Under each screen, the page shows the camera's distance, height angle and
  turn, and the `camera` entry config would need to reproduce them.
- **Capture & render** screenshots both phones as they are. It updates
  `captures.json`, writes the two framings into config's multiplayer `camera`
  entries, and reruns `render.mjs --only=multiplayer`. The page then shows the
  rendered pair.
- **Done**, or Ctrl-C in the terminal, closes Chrome and the dev server, if the
  script started it.

The script follows each camera from the gestures it sends, using the app's own
rules: 0.005 rad of orbit per pixel of finger travel, the default pitch limits
(−60° to 81°) and the default zoom limits (8 to 500 m). It saves a framing as
the distance and height to start at (the same 14° rest angle, rounded to
0.1 m) plus one swipe for the turn. A later
`capture.mjs --only=multiplayer` takes the same pictures. Checked on 25 Oct 2026: the
reproduction framed both phones the same as the hand-framed shots. The only
difference was a few metres of scenery shift from the brief formation flight. The page
listens on 127.0.0.1 only. The Google key and the invitation stay in the
script, as in the capture step.

### What it needs

- **Sibling checkouts** in the 0SFS workspace, as used for local development:
  - `../fly`, with `npm install` done; it supplies the dev server and Babylon.js 8.56.2 for the renderer.
  - `../rc`, `../multiplayer` and `../aircraft` (with the F-35B and SF-50 flight models), as fly's dev server serves them.
- **`../../foss-earth/browser-testing`**, for headless Chrome over the DevTools protocol.
- **Google Chrome** at the macOS default path, or `CHROME_BIN`. The runs used Chrome 155.0.8059.85.
- **`cwebp`** (Homebrew `webp`). If it is missing, the renderer falls back to Chrome's own WebP encoder and records that in `render.json`.
- **A Google Map Tiles key**, for the multiplayer scenery only. It is read from `GOOGLE_3D_TILES_KEY` or `FOSS_EARTH_GOOGLE_KEY`, or from the same `.env.local` files the hero capture reads.
- **Network access** for the capture step:
  - Google tiles.
  - PeerJS's public signaling server, which both the phone pairing and the multiplayer session use to connect before going direct over WebRTC.

  The render step works offline.

The capture step reuses a fly dev server already listening on port 7487, or
starts `npm run llm-dev -- --port 7487` in `../fly` and stops it afterwards. It
leaves other servers alone.

## Where the screens come from

Both captures run fly's real dev build in headless Chrome. Each device is a
separate browser context with its own storage. The phones are emulated as a
Galaxy Note 20 Ultra in landscape: an 883 × 412 CSS px viewport at 2×, touch input
and an `SM-N986U` Android user agent. Every capture is 1766 × 824. That matches
the modelled screen's 158.6 × 74.0 mm shape exactly, so nothing is stretched or
cropped; `render.mjs` refuses captures of any other shape.

### Phone controller: live pairing

1. A desktop flight (1280 × 720) starts an F-35B over the Mississippi in Minneapolis, westbound at 300 kt, throttle 86%, at 17:16 CDT on 25 Oct 2026.
2. The desktop opens **+ → Remote Control**. The script reads the pairing link from the tab's own **Copy link** button, the same link the QR code holds.
3. The emulated phone opens that link. It pairs through PeerJS and WebRTC, presses **Take control** (the status chip reads "Phone priority"), and holds the stick at 28% right and 22% up while the screenshot is taken.
4. The phone shows live telemetry from the desktop flight: 344 kt, 6,071 ft, heading 270, engine N2 96.4%. Its connection chip reads a 6 ms round trip at 54 control frames a second.

The pairing link carries the session's credentials. It stays in the script's
memory and is never printed or saved; `captures.json` records only
`https://<LAN address>:7487`. The controller screen shows no scenery, so it
carries no attribution.

### Multiplayer: live session

1. **Host:** a phone starts an F-35B at the same place and time, southbound at 230 kt, throttle 72%, with Google 3D Tiles. It pauses at once, then hosts through **+ → Multiplayer → Host flight**. "Include gkey" stays off, so the invitation carries no key.
2. **Guest:** a second phone opens the invitation with a Cirrus Vision Jet (`cirrus-vision-jet`) and presses **Join flight**. The app places the guest, paused, 50 m east of the host on the same heading, speed and altitude. Heading south, that puts the Vision Jet abeam on the F-35B's left wing. The formation is the app's own join placement; no positions are scripted. Both status lines read "Two pilots connected." The host's connection details read "Path: direct."
3. **Fly together:** both pilots resume for 0.6 s and pause again, so each side sends a fresh pose. Without this step the host's screen didn't show the guest. The step is short so the two aircraft stay level with each other.
4. **Cameras:** the framings were chosen by hand on the tuning page. The host's chase camera starts 10.2 m behind and 2.5 m above the F-35B, the guest's 8.3 m behind and 2.1 m above the smaller Vision Jet (`osfs.camera.chaseDistance` and `osfs.camera.chaseHeight` in the flight link). Each phone then turns its own camera with one-finger swipes on the sky (`swipes` in the config); the turn is not set through settings or code.
   - The host's camera sits behind the F-35B's right wing and looks across it at the Vision Jet on its left, with the low sun lighting both.
   - The guest's camera sits behind the Vision Jet's left wing and looks across it at the F-35B on its right, into the sunset.

Both phones show fly's interface at its default UI scale of 0.8× (Interface → Scale → UI scale, `osfs.ui.scale`), so more of the view shows around the instruments. The phone controller's screen is rc's own layout, which that setting doesn't change.

Both screenshots come from that one session. Each phone's Google key sits only in
the emulated phone's local storage, in a throwaway Chrome profile that is
deleted after the run.

### Revisions

Each capture records its own time and revisions in
`build/bento-phones/captures/captures.json`; render settings and the WebGL
renderer are in `build/bento-phones/renders/render.json`. The phone controller
was captured on 25 Oct 2026 at 20:29 CDT, the multiplayer pair at 23:25 CDT. Both
runs used the commits below. Several working trees had uncommitted changes from
concurrent work, so the commit alone does not pin the exact code.

| Checkout | Commit | Modified tracked files |
| --- | --- | --- |
| fly | `3cae916ac7c5` | 22 for the phone controller, 28 for the multiplayer pair |
| rc | `a8c5eebc8b33` | 21 |
| multiplayer | `aefe8a2f43e8` | 5 |
| aircraft | `95334c4f0021` | 1 |
| aircraft F-35B | `dde3773f6371` | 9 |
| aircraft SF-50 | `7956c8e38445` | 0 |
| 0sfs.github.io | `a14293c2dc8d` | 10 |
| foss-earth/app | `dd8ef2e0b736` | 3 |

## The phone

The phone is built in code in
[`scripts/bento-phones/scene.js`](../../scripts/bento-phones/scene.js). There are
no external models, textures or HDR files, so no third-party licence applies; the
code is under this repository's AGPL-3.0-only licence. It is a generic large
Android phone modelled on the Galaxy Note 20 Ultra 5G, with no logos or
trademarks.

Shape:

- **Body:** 164.8 × 77.2 × 8.1 mm with 7.2 mm corners. It is swept as one smooth surface:
  - front glass with a rounded edge
  - a slightly crowned metal frame band
  - a rounded back glass panel
- **Screen:** 158.6 × 74.0 mm (6.9 inches, 19.3 : 9) with 4.6 mm corners.
- **Details:**
  - a 3.2 mm punch-hole camera at the phone's top end
  - volume and power keys on the portrait right side, which is the top edge in this landscape pose

Materials and light:

- **Materials:** Babylon PBR.
  - The frame and keys are satin metal.
  - The front glass is near black and glossy.
  - The back is frosted.
- **Screen:** the capture is the emissive texture, so its colours come through unchanged. A glossy layer over it adds a faint glare.
- **Lighting:** a procedural HDR studio cube that `scene.js` computes and prefilters with Babylon's `HDRFiltering`:
  - a dark room
  - an overhead box
  - two vertical strips
  - a floor bounce behind the phone
  - a low front strip
  - one directional key light

Rendering:

- Each image renders with WebGL multisampling on a transparent background: the phone controller at 2400 × 1500, each multiplayer phone in a 4000 × 1625 frame.
- The multiplayer phones stand 172 mm apart, each turned 32° outward, so their backs angle toward each other. Both images use the same camera and lights, and each crops to its own phone. The left light strip sits behind the phones so it doesn't reflect across the left screen.
- A soft drop shadow comes from the phones' silhouette: black, 45% opacity, 16 px blur, 14 px down at output size.
- The image is cropped to the phones plus the padding and scaled down in halving steps.

Like a real phone in landscape, the punch hole covers a few pixels of the app's
left edge. In all three images it falls on the pitch slider's track.

## Limitations

- **Emulated phones:** the phones are desktop Chrome with mobile emulation, not physical devices. The pairing, telemetry, multiplayer connection and screens are real.
- **Paused flights:** both multiplayer flights are paused for the screenshots, so the ▶ button at the bottom left is highlighted.
- **Small wingmen:** the app spawns the guest 50 m from the host, so on each screen the other pilot's aircraft is small at card size. The pilot's own aircraft fills the middle of the view.
- **Altitude readout:** with Google 3D Tiles, fly's status bar shows "— ft ASL"; that is the app's current behaviour.
- **Network dependence:** the live capture depends on PeerJS's public signaling server and on Google tiles. If pairing fails, `--remote=fixture` captures rc's real-component fixture instead, and `captures.json` records which path was used.
