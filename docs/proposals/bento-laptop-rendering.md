# Bento laptop rendering

Artwork for the **05 / Phone controller** card: a 13-inch MacBook Air running a
real 0SFS flight that a paired phone controls. The laptop is its own
transparent image. It stands behind and to the left of the card's existing
phone artwork (`public/media/bento-remote-phone.webp`), which is unchanged. The
laptop is a pre-made CC BY 4.0 model, lit by the phone artwork's studio and
baked to a transparent WebP, so the page needs no 3D engine. The composition is
wired into `index.html` and `landing.css` using the [suggested markup](#suggested-markup),
with visible Google and model credits. The installed phone artwork is unchanged.

## Outputs

| File | Pixels | Bytes | Shows |
| --- | --- | --- | --- |
| `public/media/bento-remote-laptop.webp` | 720 × 599 | 50,722 | The laptop, turned 24° with its lid open at 105°, showing the captured flight |
| `build/bento-laptop/renders/bento-remote-laptop.png` (ignored) | 720 × 599 | 453,457 | Its lossless master |
| `build/bento-laptop/renders/bento-remote-phone-candidate.webp` (ignored) | 840 × 518 | 35,306 | The phone's screen from the laptop's own session, rendered by the phone artwork's pipeline and settings; not installed |

- The WebP is lossy with a lossless alpha channel, encoded like the phone images: cwebp 1.6.0 `-q 84 -alpha_q 100 -m 6 -sharp_yuv -metadata none`. It carries no metadata.
- The laptop spans the image's width apart from 16 px on each side. There are 10 px above it, and 30 px below for the soft shadow.
- In the suggested layout the laptop takes 80% of the art's width. At 400 CSS px that is 320 px, or 2.25 image pixels per CSS pixel, so at 2× it stays sharp up to a 450 px art box.
- There is no PNG fallback, for the same reason as the phone images: every browser that runs the simulator decodes WebP.
- `build/bento-laptop/renders/render.json` records the render:
  - settings and the WebGL renderer
  - the model's checksums and the screen mapping
  - the measured layout and the suggested CSS
- `build/bento-laptop/captures/captures.json` records where the screens come from and every pairing check.

The render step also makes the preview, `build/bento-laptop/preview.png`, from
`build/bento-laptop/preview.html`:

- The art on the card's dark green gradient from `landing.css`, at 300, 360 and 400 CSS px, at 2×.
- One row with the installed phone artwork and one with the same-session candidate.
- A fourth card in each row, at 400 px, outlines the protected regions: the display, the aircraft and the scenery credit.
- The cards use the [suggested CSS](#suggested-markup) as written. Only the art box's width is set to each test width, and its margin is removed.

## Composition

- **Laptop:** at the back, top left, 80% of the art's width.
  - The lid is open at 105°. The laptop is turned 24° so its screen faces slightly right and its left side shows.
  - The camera is 20° above the deck and 780 mm away, with a 30° field of view, so the perspective is mild.
- **Phone:** the existing artwork, in front at the bottom right, 52% of the art's width. Its top left corner sits just below the right end of the laptop's display.
- **Art box:** 1000 : 665.56 (1.50 : 1), as tall as the laptop, so at most 400 × 266 CSS px.
  - The phone artwork alone is 400 × 247 there, so the art grows about 20 px taller.
  - The phone shrinks from 400 to 208 CSS px wide.

`render.mjs` measures how much the phone covers, using the images as encoded.
It checks three regions of the laptop's screen:

- the whole display
- the aircraft: capture fractions [0.23, 0.21, 0.77, 0.54]
- the scenery credit, from its box in `captures.json`

Neither the phone nor its shadow covers any of them. At 300 CSS px the phone's
body stays 10.6 px from the display, 10.7 px from the credit and 55.1 px from
the aircraft. The candidate is the same size and gives the same figures.

On the current page, the card's art box is often narrower than 300 px. These
widths of `.feature__phone-art` were measured in `index.html` at 1×; the new
art box would get the same width:

| Viewport | Art width |
| --- | --- |
| 1700 px and wider | 327.5 px |
| 1440 | 283.5 |
| 1366 | 265 |
| 1280 | 243.5 |
| 1101, just above the 1100 px breakpoint | 198.8 |
| 1100 | 400 |
| 760 | 310 |
| 600 | 230 |
| 390 | 306 |

I also looked at the art at 199, 230, 244, 265, 284 and 328 px. Even at 199 px
the laptop's screen reads as an F-35B over a city at sunset, about 55 px wide,
and the phone still reads as the controller. The phone is 104 px wide there, too
small to read its controls. To repeat this check, set `preview.widths` in the
config and run `--render-only`.

## Suggested markup

The images are decorative, like the phone artwork. The art box keeps its shape
before the images load, so the layout doesn't shift:

```html
<!-- Phone controller card: replaces <img class="feature__phone-art" …> -->
<div class="feature__remote-art" aria-hidden="true">
  <img class="feature__remote-laptop" src="media/bento-remote-laptop.webp?v=08182390d58b" width="720" height="599" alt="" loading="lazy" decoding="async" />
  <img class="feature__remote-phone" src="media/bento-remote-phone.webp?v=9837eb6033e3" width="840" height="518" alt="" loading="lazy" decoding="async" />
</div>
```

```css
.feature__remote-art { position: relative; width: min(100%, 400px); aspect-ratio: 1000 / 665.56; margin: 16px auto 10px; }
.feature__remote-art img { position: absolute; display: block; height: auto; }
.feature__remote-laptop { left: 0; top: 0; width: 80%; }
.feature__remote-phone { left: 48%; top: 51.09%; width: 52%; }
```

- `render.mjs` derives these rules from `preview.layout` in the config and records them as `layout.css` in `render.json`, so a new layout gets new rules.
- `top` is a percentage of the box's height: 51.09% is 0.34 of its width.
- The margin is the one `.feature__phone-art` uses; that rule would then be unused.
- The `?v=` value follows the page's other media URLs: the first 12 hex digits of the file's SHA-256.

**Credits.** The laptop's screen shows Google Photorealistic 3D Tiles. The screen
keeps the app's "3D Tiles" credit with Google's logo in its bottom right corner,
but at card size that is only a few pixels wide. The card needs a visible credit
line, as the multiplayer card has. The model's CC BY 4.0 licence also needs a
credit that links the source and the licence and says the model was changed.
For example:

```html
<p class="feature__media-credit"><a href="https://www.google.com/help/legalnotices_maps/" target="_blank" rel="noopener">Google 3D Tiles <span aria-hidden="true">↗</span></a><br />Laptop: <a href="https://sketchfab.com/3d-models/macbook-air-m2-786fa23d402a4f90ae36c4168997f9cc" target="_blank" rel="noopener">“MacBook Air M2”</a> by <a href="https://sketchfab.com/rtql8d" target="_blank" rel="noopener">rtql8d</a>, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>, modified</p>
```

The licence accepts attribution "in any reasonable manner", so the model credit
could instead go on a site credits page linked from the footer. The footer's
current links cover only the simulator repository's own notices.

If the art should carry meaning instead, drop `aria-hidden`, keep `alt=""` on
the phone and give the laptop this alt text: "A MacBook Air showing an F-35B
flying over Minneapolis at sunset, with a phone in front running the 0SFS
controller."

## Landing-page integration

Integrated on 26 October 2026 using the composition above. Both images retain
their intrinsic dimensions, lazy loading, asynchronous decoding and SHA-256
cache versions. The unused `.feature__phone-art` rule is removed. Google notices,
the model, its creator and CC BY 4.0 are linked visibly below the card copy;
the credit states that the model is modified.

The card was inspected in the shared screenshot workflow at 320, 390, 600,
1100, 1101, 1280 and 1700 px viewports. Art boxes span 198.75–400 CSS px.
Both images decode at their supplied dimensions and remain inside the reserved
art box, with no horizontal page overflow. The phone leaves the aircraft and
the display's credit corner visible. The full 1280 px grid was also inspected.
Build, all 59 tests and the built-site browser check passed. The installed
images and both rendering pipelines are unchanged from their supplied versions.

Local review: `build/bento-laptop-integration-review.html`; screenshot list:
`build/bento-laptop-integration-shots.mjs`. The review includes the custom
three-step Test link and a downloadable plan. Its Test tab's Start/Finish flow
was checked and produces valid downloadable feedback JSON.

## Reproduce

From `0sfs.github.io`:

```sh
node scripts/bento-laptop/build.mjs                 # capture both screens in one live pairing, then render (~1 min)
node scripts/bento-laptop/build.mjs --render-only   # rerender from the saved captures (~6 s)
```

- `--no-candidate` skips the same-session phone candidate.
- `--no-preview` skips the preview.
- The steps also run on their own:
  - `scripts/bento-laptop/model.mjs` fetches and checks the model; the render step runs it when files are missing.
  - `scripts/bento-laptop/capture.mjs` captures both screens.
  - `scripts/bento-laptop/render.mjs` renders from the saved captures.
- A failed capture stops `build.mjs` before the render and keeps the previous captures.
- Rerendering from the same captures gives byte-identical WebP, PNG and candidate files. I checked this with SHA-256 over repeated runs.

The full run took 56 s on an M5 MacBook Air. The model was already downloaded,
and the script started the dev server.

Everything that shapes the image lives in
[`scripts/bento-laptop/config.json`](../../scripts/bento-laptop/config.json):

- the emulated laptop and phone, the flight (from `scripts/hero-scenario.json`) and the in-app chase camera
- the pairing checks and their timing
- the model:
  - its source and checksums
  - the hinge and lid angle
  - the display panel and its texture mapping
  - the silver recolour and the material overrides
- the render:
  - the camera, the laptop's turn, and the output width and padding
  - the studio light, the screen reflector and the shadow
  - the WebP quality and the protected regions
- the preview's widths, gradient and layout

### What it needs

- **Sibling checkouts** in the 0SFS workspace:
  - `../fly`, with `npm install` done. It supplies the dev server, and Babylon.js 8.56.2 core and loaders for the renderer.
  - `../rc` and `../aircraft`, with the F-35B and its F135 engine, which fly's dev server serves.
- **`../../foss-earth/browser-testing`**, for headless Chrome over the DevTools protocol.
- **Google Chrome** at the macOS default path, or `CHROME_BIN`. The runs used Chrome 155.0.8059.85. The laptop's flight runs on WebGPU; the render uses WebGL 2.
- **`cwebp`** (Homebrew `webp`). If it is missing, the renderer uses Chrome's WebP encoder and records that in `render.json`.
- **A Google Map Tiles key**, read from `GOOGLE_3D_TILES_KEY` or `FOSS_EARTH_GOOGLE_KEY`, or from the `.env.local` files the hero capture reads.
- **Network access** for the capture step:
  - Google tiles.
  - PeerJS's public signaling server, through which the phone and the laptop connect before going direct over WebRTC.
  - GitHub, once, for the model.

  The render step works offline.

The capture step reuses a fly dev server already listening on port 7491.
Otherwise it starts `npm run llm-dev -- --port 7491` in `../fly` and stops it
afterwards, including on Ctrl-C. It leaves other servers alone.

## Where the screens come from

Both screens come from one session of fly's real dev build in headless Chrome.
Each device is a separate browser context with its own storage.

- **Laptop:** emulated as Chrome in full screen on a 13-inch MacBook Air, at macOS's default scaled resolution: 1470 × 919 CSS px at 2×.
  - Full-screen pages get the 16 : 10 area below the camera housing; the band beside the camera stays black.
  - The capture is 2940 × 1838, the shape of that area, so nothing is stretched or cropped. `render.mjs` refuses a laptop capture of any other size.
- **Phone:** emulated as for the phone artwork, as a Galaxy Note 20 Ultra in landscape:
  - an 883 × 412 viewport at 2×
  - touch input
  - an `SM-N986U` Android user agent

### One live pairing

1. **Laptop flight:** an F-35B from `scripts/hero-scenario.json`.
   - It flies over the University of Minnesota, westbound at 300 kt, 180 m above the ground, at 90% throttle.
   - The sky is set to 23:10:58 UTC (18:10:58 CDT) on 25 Oct 2026, the hero's sunset.
   - The scenery is Google Photorealistic 3D Tiles, on WebGPU with the dome sky and sound off.
   - It is a fresh flight (`osfs.start.resume=false`), so the F-35B carries no external tanks.
   - The chase camera sits straight behind, 14 m back and 2.6 m up, with a 55° field of view. That is closer and lower than the hero's 24 m and 4 m, so the aircraft reads on a small screen.
   - The laptop pauses as soon as the flight is up and waits while the scenery loads.
2. **Pairing:** the laptop opens **+ → Remote Control**. The script catches the link from the panel's own **Copy link** button. The phone opens that link, pairs and presses **Take control**.
3. **Capture:** the laptop's panels close, the scenery settles and the phone resumes the flight. The laptop's frame rate readout then needs a reading from the running flight. 250 ms later, both screens are captured: the phone first, then the laptop 21 ms after. The phone's stick is centred.
4. **Proof of control:** after the screenshots, the phone rolls the laptop's aircraft right and back with its stick, then pauses the flight.

The laptop's screen is one held frame. The page's next animation frame waits
and CSS animations stand still while the frame on screen is copied. A 2940 ×
1838 frame of the city can exceed the 8 MiB the DevTools protocol carries in
one message. So the frame is copied in three horizontal bands, twice, and the
bands are joined row for row only when both copies match byte for byte. The copy
took 2.9 s; then the flight carried on.

The capture shows an F-35B from behind at sunset, flying toward downtown
Minneapolis and the Mississippi. Fly's normal flight interface is visible: the
attitude display, the engine gauge and the status bar, with the "3D Tiles"
credit and Google's logo. No settings or pairing panel is open.

### What was verified

`captures.json` records every check with its time and both devices' readouts.
All of them belong to the one pairing, on 26 Oct 2026:

| Time (UTC) | Check | Evidence |
| --- | --- | --- |
| 18:00:10.4 | The laptop's flight loaded and paused itself | The laptop was paused at 300 kt and heading 270, at 60 fps. The scenery settled after 6.1 s, showing the "3D Tiles" credit and Google's logo, with no warning |
| 18:00:14.5 | The phone paired through the laptop's Remote Control link | The phone showed "Connected · Desktop controls"; the laptop showed "Phone paired · Desktop controls" |
| 18:00:14.7 | The phone took control | The phone showed "Phone controls · Simulation paused"; the laptop showed "Phone priority · Both devices connected · Simulation paused" |
| 18:00:14.7 | The phone showed the laptop's flight | Both read heading 270 and 300 kt |
| 18:00:17.6 | The laptop's panels closed, and the phone kept priority | No panel open, and the pairing panel with its QR code hidden. The scenery settled again |
| 18:00:17.6 | The phone resumed the laptop's flight | The laptop was no longer paused |
| 18:00:18.6 | Both screens were captured 21 ms apart, on the first try | Laptop: flying at 307 kt, heading 270, +103 fpm and 60 fps on WebGPU, with no panel open and the credit shown. Phone: "Phone priority · Both devices connected", reading IAS 306, ALT 4030, HDG 270 |
| 18:00:29.2 | The phone's stick turned the laptop's aircraft | 30% right for 3.5 s took the heading from 270 to 272. After 30% left for as long, rolling back, it read 274. The laptop held 60 fps |
| 18:00:29.2 | The phone paused the laptop's flight and stayed paired | The laptop was paused at 348 kt, heading 274. The phone still showed "Phone priority · Both devices connected" |

The pairing link carries the session's credentials. It stays in the script's
memory and is never printed or saved; `captures.json` records only
`https://<LAN address>:7491/rc/`. The Remote Control panel holds the link's QR
code, and it is closed before the laptop's screen is captured. The Google key
goes into the laptop page's own local storage, in a throwaway Chrome profile
that is deleted after the run. It never appears in a URL, a log or a file.

### Which screens share a session

- **One session:** the laptop image and the phone candidate, `build/bento-laptop/renders/bento-remote-phone-candidate.webp`. Their screenshots were taken 21 ms apart in the pairing above.
- **Not the same session:** the installed phone artwork, `public/media/bento-remote-phone.webp`.
  - It comes from an earlier session on 25 Oct 2026 at 20:29 CDT ([bento-phone-renderings.md](bento-phone-renderings.md)). There the phone flew a 1280 × 720 desktop flight, with the stick held.
  - Next to this laptop, both screens are real 0SFS screens, but they don't show the same moment. Its 344 kt doesn't match the laptop's 307 kt, though neither readout is legible at card size.
- **Showing one session:** the candidate would have to replace the installed artwork.
  - It was rendered by `scripts/bento-phones/scene.js` with that artwork's own settings, at the same 840 × 518.
  - Its stick is centred.
  - This task leaves the installed artwork alone.

### Revisions

`captures.json` records the capture's time and revisions. `render.json` records
the render settings and the WebGL renderer. The screens were captured on 26 Oct
2026 at 13:00 CDT. Several working trees had uncommitted changes from concurrent
work, so the commit alone doesn't pin the exact code.

| Checkout | Commit | Modified tracked files |
| --- | --- | --- |
| fly | `3cae916ac7c5` | 28 |
| rc | `a8c5eebc8b33` | 21 |
| aircraft | `95334c4f0021` | 1 |
| aircraft F-35B | `dde3773f6371` | 9 |
| F135 engine | `8a5520a1b84d` | 10 |
| 0sfs.github.io | `a14293c2dc8d` | 10 |
| foss-earth/app | `dd8ef2e0b736` | 3 |

## The laptop model

The model is "MacBook Air M2" by rtql8d, published on Sketchfab on 17 Jun 2022
under CC BY 4.0. It is a low-poly model of the 13-inch M2 MacBook Air (6,688
triangles) at real size: 304 × 215 mm. The credit its `license.txt` asks for:

> This work is based on "MacBook Air M2" (https://sketchfab.com/3d-models/macbook-air-m2-786fa23d402a4f90ae36c4168997f9cc) by rtql8d (https://sketchfab.com/rtql8d) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)

Sketchfab downloads need an account. So `model.mjs` fetches Sketchfab's own glTF
export, with its `license.txt`, from pinned commits of two public repositories
that redistribute it: `axelzwaans/axel-portfolio` and `Anastasia-front/portfolio`.

- Every file must match its SHA-256 in the config.
- The files are data only: Babylon's glTF loader reads them, and nothing in them runs.
- They stay unmodified in their own ignored directory, `build/bento-laptop/model/macbook-air-m2/`.

The changes are all made at render time:

- **Colour:** the export is Midnight. Its aluminium becomes silver, `#d4d6d8`. In the deck's baked texture, the Midnight pixels (91.8% of the texture) become silver too. Only pixels joined to the case count: each key's shaded side comes close to the case colour, and recolouring it showed as a white smear on the keys. The keys and their legends keep their colour.
- **Keys:** a satin plastic finish: not metallic, roughness 0.55.
- **Trackpad:** a touch darker, with a hairline outline.
- **Lid:** opened from the export's 90° to 105°, about the hinge axis.
- **Display:** the export's wallpaper is replaced by the captured screen, on Apple's published panel: 2560 × 1664 pixels at 224 ppi, 290.29 × 188.69 mm.
  - The capture fills the panel's width, 290.29 × 181.48 mm, and leaves the 7.21 mm black camera band at the top.
  - Its 2940 × 1838 pixels are drawn into a 4096² texture, about 2959 × 1811 texels across the content.
- **Logo:** the logo on the back of the lid is hidden. It can't be seen from the front anyway.

## Light and materials

- **Studio:** the phone artwork's procedural HDR studio and key light (`renders.lights` in its config), copied unchanged so both devices share one light.
- **Screen:** as on the phones, the capture is the emissive texture, so its colours come through unchanged. The glass over it is glossy (roughness 0.06) and adds a faint glare (0.6).
- **Screen reflector:** the studio has nothing where the screen's mirror direction points, so on its own the glass would reflect nothing. A soft card that only the display glass reflects (`render.screenReflection`) gives it a faint sheen.
- **Aluminium:** metallic 0.5, roughness 0.38. That is less metallic than real aluminium: in the dark studio a fully metallic deck mirrors the dark room and reads as space grey, while this finish reads as silver.
- **Shadow:** a soft drop shadow from the laptop's silhouette: black, 45% opacity, 16 px blur, 12 px down at output size.
  - That is the phones' shadow scaled to the device: 12 px is 1.7% of the laptop's 688 px width.
  - The phone's 14 px is 1.8% of its 796 px.
- **Rendering:** WebGL 2 with multisampling, on a transparent background, at 3200 × 2000. The image is cropped to the laptop plus the padding and scaled down in halving steps, 2.63 render pixels to an output pixel.

## What I inspected

- **Preview:** the cards at 300, 360 and 400 px with both phones, and the art at the page's measured widths of 199 to 328 px.
- **Full-size crops of the render:**
  - The display mapping: the app's corner **+** buttons sit at the content's corners, the status bar runs along its lower edge, and the black band is above.
  - The "3D Tiles" credit and Google's logo, in the display's bottom right corner.
  - The lid and deck corners, the alpha edges, and the shadow on the gradient.
  - The WebP against its PNG master.
- **Repeatability:** repeated `--render-only` runs gave byte-identical WebP, PNG and candidate files.
- **Secrets:** I searched the records and logs for the Google key, `key=` parameters and pairing links; none appear.

## Limitations

- **Small credit:** at card size the screen's "3D Tiles" credit is a few pixels wide, so the card should carry the visible credit link (above).
- **Separate sessions:** the installed phone artwork comes from a different session than the laptop. The same-session candidate exists only in `build/`.
- **Emulated devices:** both devices are desktop Chrome with device emulation, on one Mac. The laptop is a 1470 × 919 viewport at 2×, not a MacBook Air's own display. The flight, the pairing, the phone's control and both screens are real.
- **Altitude readout:** with Google 3D Tiles, fly's status bar shows "— ft ASL". That is the app's current behaviour.
- **Phone image size:** the phone now shows at 52% of the art's width, at most 208 CSS px. Its 840 px image is about twice what 2× screens need there. A smaller rerender would save bytes, but this task leaves the phone artwork alone.
- **Network dependence:** the capture depends on PeerJS's public signaling server and on Google tiles. A failed capture keeps the previous captures, and `--render-only` still works.

## Lessons for later work

- **Command timeouts:** `foss-earth/browser-testing` caps a command's timeout at 120 s. Asking for more rejects at once, which looked like a page that never loaded. Keep `run` timeouts at 120 s or less.
- **Dev server reloads:** fly's dev server reloads every open page the first time a page imports a new dependency, and a reload ends a pairing. `capture.mjs` opens the controller once on its own first, and runs the whole session again if a reload still happens.
- **Large screenshots:** the DevTools protocol carries at most 8 MiB in one message, which a 2940 × 1838 frame of the city can exceed. The laptop's frame is held and copied in bands, twice, and kept only when both copies match.
- **Silver in a dark studio:** a flat, fully metallic surface mirrors the dark room and reads as space grey. A more diffuse finish (metallic 0.5) reads as silver.
- **Screen reflections:** a reflection needs something in the mirror direction. Nothing in the studio sat where the laptop's screen reflects, hence the screen-only reflector card.
- **Recolouring a baked texture by colour:** the match catches look-alike shades elsewhere. The keys' shaded sides matched the case colour and became silver smears, until only pixels joined to the case were recoloured. Check a mask view of any colour-based recolour (red over the texture) before trusting it.
- **Real card widths:** the page's 12-column grid makes this card's art 199–328 px wide on desktops, narrower than the 300–400 px the brief named. Check new card art at the widths the page actually gives it.
- **Sketchfab downloads:** they need an account. Public repositories that redistribute an export with its licence, pinned to a commit and checked by SHA-256, keep the fetch reproducible.
