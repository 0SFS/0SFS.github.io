# Sky and night-lighting cards: orbital pictures rendered in FOSS Earth

Handoff for the main agent, from [delegate-orbital-sunset.md](delegate-orbital-sunset.md).

Two square FOSS Earth renders are ready, each made to fill a whole bento card as its background. Neither
has any interface in it, so the map credit belongs on the page (see below).

- **Sky card:** the Sun setting over UMN, seen from orbit, at the moment of the hero video. A black sky,
  the Sun 2° above the Earth's edge with a camera's lens flare (a starburst, a halo and four ghost
  rings), an orange-and-blue sunset band, the night side below.
- **Night-lighting card:** south-east Brazil's cities lit below a sunset glow on the Earth's edge.

Nothing in the website was changed except files under `public/media/` and this note. The
`.feature__sky-art` illustration, `index.html`, `landing.css` and `package.json` are untouched.

**Updated 2026-10-26.** Both pictures were captured again from a new FOSS Earth build that has two
changes: the opt-in lens flare, and a fix for the night-lights bug (see "Night lights"). The fix makes
the night picture about 0.7 stop brighter; its framing is unchanged.

**Updated again, the same day.** The sky picture now uses the full lens flare, ghosts included,
instead of the glare alone (see "Lens flare"). The capture tool can now also tune the exposure and
compare exposures side by side (see "Tuning the exposure").

## Assets

| File | Size | Bytes | Use |
| --- | --- | --- | --- |
| `public/media/sky-sunset-orbit.webp` | 1200 × 1200 | 11,760 | sky card background |
| `public/media/sky-sunset-orbit.jpg` | 1200 × 1200 | 71,559 | its fallback |
| `public/media/night-lights-orbit.webp` | 1200 × 1200 | 40,458 | night-lighting card background |
| `public/media/night-lights-orbit.jpg` | 1200 × 1200 | 215,337 | its fallback |
| `public/media/sky-sunset-orbit-wide.webp` | 1920 × 432 | 8,246 | the first strip, kept, not for a card |
| `public/media/sky-sunset-orbit-wide.jpg` | 1920 × 432 | 41,757 | its fallback |

Each run's folder is in the FOSS Earth checkout, under `~/gh/foss-earth/app/build/capture-scenes/runs/`:

- `sky-sunset-orbit/20261026T060248Z/`
- `night-lights-orbit/20261026T052802Z/`

The runs of the pictures they replace are kept beside them:

- `sky-sunset-orbit/20261026T052757Z/`: the sky picture with the glare alone
- `sky-sunset-orbit/20261026T031802Z/` and `night-lights-orbit/20261026T033846Z/`: the first pictures

Each folder holds:

- `original.png`: the uncompressed screenshot
- `final-decoded.png`: the WebP decoded back
- `preview.html`: card-size mock-ups next to the full-size picture
- `report.json`: everything below, as measured

Repeat runs match to within one level in a handful of pixel values.

## Sky card: the Sun setting over UMN

The picture is taken from 400 km above northern Maine, looking west. The Sun stands 2° above the
Earth's edge, and the Mississippi beside UMN is on the edge directly below it. That is UMN's sunset,
seen from orbit, at the hero video's instant. Below the edge is the night side, black at this exposure.

**The time changed from the brief's, to the hero video's.** The brief gave 22:16:00 UTC and called it
"17:16 CDT, sunset at UMN", but the Sun is still 8.3° up at UMN then. The hero video
(`f35-westbound-umn.json`) is at 23:10:58 UTC = 18:10:58 CDT, and its solar time reads 17:14. So
the brief's "17:16" was most likely a solar-clock reading written down as CDT. At 23:10:58 UTC the
Sun's centre is 0.77° below UMN's true horizon: with refraction, the moment of sunset.

| | Value |
| --- | --- |
| Time | `2026-10-25T23:10:58Z` = 18:10:58 CDT, held exactly |
| Reference | Mississippi River beside UMN, 44.974516, −93.2375 |
| Observer | 400 km up at 47.366364, −68.797774, above northern Maine. This is 1,892.7 km from UMN along the great circle away from the Sun (bearing 73.2°), the distance solved so the Sun is 2.0° above the Earth's edge. |
| Camera | Heading 260.901° (10° left of the Sun, so the Sun sits right of centre). Elevation −28.082°, which puts the edge 30% of the way down. Field of view 40° by 40°. |
| Sun | Heading 270.90°, 17.80° below the eye's horizontal, 2.00° above the edge (whose dip is 19.80°). At pixel (881, 309), measured 0.1 px away. Its disc is 16 px across; with the flare, its white core measures 73 px and the starburst's rays reach about 250 px. |
| UMN | Pixel (876, 374), on the edge directly below the Sun |
| Sky | Exposure fixed at EV 12, for the band and the Sun. The meter would now read the dark ground below and choose EV 1, burning out both. |
| Lens | `sky.exposure.lensFlare` = `flare`: a starburst and halo around the Sun, and four ghost rings on the line from the Sun through the picture's centre, toward the lower left. Measured centres: (712, 483), (558, 643), (418, 789) and (291, 920); 69, 111, 40 and 79 px across. The small third one is the brightest, nearly white at its rim. The whole Sun is seen, 18.6 stops over white. |
| Scenery | Google Photorealistic 3D Tiles, `google-tiles` mode, 95 visible tiles, loaded detail 19.9 px at a 20 px target, WebGL2 on Apple M5 |
| Picture | Mean brightness 14.2 of 255; 80% near black; 1.3% clipped white (the Sun's core, its glare and the band's brightest part) |

## Night-lighting card: south-east Brazil

The picture is taken from 400 km over the Atlantic, 364 km off Vitória, at 22:16 UTC on 25 October
2026. It looks west-north-west across lit Minas Gerais and Goiás. Belo Horizonte is lower left, Brasília
is near the edge at the centre, and Vitória is on the coast at the bottom. The glow on the edge runs
from white nearest the Sun to orange and red. The Sun is 4° behind the edge. The meter reads the
night-side ground below and exposes for the night: EV 1.0. This is the square you liked, with the same
framing. The meter fix makes it about 0.7 stop brighter than the first capture (EV 1.7), so the lights
stand out a little more.

| | Value |
| --- | --- |
| Time | `2026-10-25T22:16:00Z` (19:16 in Brasília), held exactly |
| Observer | 400 km up at −19.835548, −36.861869. This is 1,090.4 km from São Paulo along the great circle away from the Sun, the distance solved so the Sun is 4° below the Earth's edge. |
| Camera | Heading 286.035° (40° right of the Sun), elevation −31.892° (the edge 27% of the way down), field of view 50° by 50° |
| Cities in frame | Belo Horizonte (249, 607), Ipatinga (360, 701), Governador Valadares (506, 736), Montes Claros (753, 540), Uberlândia (324, 416), Goiânia (534, 375), Brasília (667, 394), Vitória (204, 1049) |
| Night lights | On; 18 of 18 tiles loaded; lamps switch on below a Sun of −5.02° |

These other places were tried for the night card; all are kept as scenarios:

| Place | Why not |
| --- | --- |
| Western Europe from over Slovakia at 19:00 CET, looking over the Alps to the Po Valley | Striking relief, but softer lights over moonlit ground |
| The US East Coast at the hero video's instant | The observer must be in the Earth's shadow, which puts the coast about 1,100 km away, small near the edge |
| The Nile from over Arabia | The moonlit desert is bright, and the lights do not stand out |
| The US Midwest at 20:00 CDT | Sparse towns |

The Moon is nearly full on 25–26 October 2026, which is why the ground shows at all at night.

## Night lights

The user suspected a bug that keeps city lights from showing most of the time, and saw them reliably
only with the Sun behind the planet. The bug was in FOSS Earth's exposure meter, and is fixed there
(uncommitted, in `@foss-earth/sky`):

- **Cause.** The meter read the light at the eye. From 400 km the eye stays in sunlight until the Sun
  is 20° below the ground's horizon, while lamps come on when it is 5° below. Over the night side, a
  sunlit eye chose a daylight exposure, about EV 15.7, and the lights were black. They showed only when
  the eye itself was in the Earth's shadow: with the Sun behind the planet.
- **Fix.** Between 20 and 100 km up, the meter now moves to the light on the ground below the eye.
  This is a new setting, `sky.exposure.groundMeterAltitude`. Below 20 km nothing changes, so 0SFS
  flights are metered as before.
- **Proof.** From 400 km over New York at the hero video's instant, with the eye still sunlit, the
  exposure was EV 15.7 and the picture blank. It is now EV 1.0, with the Northeast's cities lit:
  `~/gh/foss-earth/app/build/meter-fix/runs/meter-nyc-sunlit/20261026T051915Z/final-decoded.png`.

The sky picture still shows no lights, by design. It is fixed at EV 12 so that the Sun and the band are
not burnt out, and at that exposure the brightest lit ground is about a ten-thousandth of white. No
single exposure holds both the Sun and the lights; that needs tone mapping, which the app does not
have. The same view, metered, now shows lights around the Great Lakes, with the band burnt out:
`~/gh/foss-earth/app/build/meter-fix/runs-metered/sky-sunset-orbit/20261026T052632Z/final-decoded.png`.

The capture also proves that the lights have loaded:

- It waits until every night-light tile for the view has arrived.
- A failed tile stops the run.
- The report records the lights' state.

Three kinds of view are still dark by design, and can look like the bug:

- **Dusk or daylight.** Where the Sun is above −5° on the ground, the lamps are off.
- **The Sun in view at a fixed exposure,** as in the sky picture.
- **Looking across the terminator from above the day side.** The meter reads the ground under the eye,
  not the ground in view, so the night beyond is shown at the day's exposure.

## Lens flare

FOSS Earth now has an opt-in lens flare, `sky.exposure.lensFlare`: Off (the default), Glare or Flare.
It was added by another agent from
`~/gh/foss-earth/docs/docs/proposals/implementation/sky-lens-flare-handoff.md`, and is uncommitted.
The capture waits until the flare has settled in the mode asked for, fails if it cannot be drawn, and
records its state in `report.json` (`sky.lensFlare`).

The sky picture uses **Flare**: a starburst and halo around the Sun, plus four ghost rings on the line
from the Sun through the picture's centre. On a square card the rings fall in the heading and text area
(see the card table below). **Glare** is the same without the rings. To publish that version instead,
add `--set settings.sky.exposure.lensFlare=glare` to the sky command below. The glare picture published
before is kept at
`~/gh/foss-earth/app/build/capture-scenes/runs/sky-sunset-orbit/20261026T052757Z/final-decoded.png`.

The night picture has no Sun in view, so the flare does not change it.

## Tuning the exposure

Two settings set a picture's brightness. Both can be passed to the capture with `--set`:

- **Sky picture: a fixed exposure,** `--set settings.sky.exposure.ev100=N`. It is EV 12 now. Lower is
  brighter, and each step down doubles everything.
- **Night picture: compensation on top of the meter,** `--set settings.renderer.exposureEV=N`, in
  stops. It is 0 now, which leaves the meter's EV 1. Higher is brighter.

`--bracket` captures the same view at several exposures and shows them side by side at card size, each
with the exact `--set` that gives it. These two brackets have been run:

```sh
cd ~/gh/foss-earth/app
node scripts/capture-scenes/capture.mjs sky-sunset-orbit --app-dist build/capture-scenes/app-dist --bracket=-2,-1,1,2,3,4
node scripts/capture-scenes/capture.mjs night-lights-orbit --app-dist build/capture-scenes/app-dist --bracket=-2,-1,1,2
```

Write `--bracket=` with an equals sign; a space before a negative step is rejected. Open the results:

- Sky: `~/gh/foss-earth/app/build/capture-scenes/runs/sky-sunset-orbit/20261026T060430Z/preview.html`
- Night: `~/gh/foss-earth/app/build/capture-scenes/runs/night-lights-orbit/20261026T060504Z/preview.html`

The sky bracket (±0 is the published picture):

| Step | Shown at | Mean (of 255) | Clipped | Near black | Sun over white |
| --- | --- | --- | --- | --- | --- |
| −2 | EV 14 | 8.2 | 0.2% | 83% | 16.6 stops |
| −1 | EV 13 | 10.8 | 0.5% | 81% | 17.6 stops |
| ±0 | EV 12 | 14.2 | 1.3% | 80% | 18.6 stops |
| +1 | EV 11 | 18.2 | 3.2% | 79% | 19.6 stops |
| +2 | EV 10 | 22.7 | 4.5% | 78% | 20.6 stops |
| +3 | EV 9 | 27.0 | 5.8% | 77% | 21.6 stops |
| +4 | EV 8 | 31.3 | 7.2% | 75% | 22.6 stops |

- **Darker:** the band thins to an orange line, and the rings dim.
- **Brighter:** the band turns white, the Sun's halo grows, and the rings brighten. From +3 the small
  ring is a white dot, and at +4 the first ring is too.
- **City lights:** the night side stays black through EV 8. The lights need the night picture's exposure.

The night bracket (±0 is the published picture):

| Step | Shown at | Mean (of 255) | Clipped | Near black |
| --- | --- | --- | --- | --- |
| −2 | EV 3 | 13.3 | 2.1% | 33% |
| −1 | EV 2 | 16.7 | 2.5% | 23% |
| ±0 | EV 1 | 20.9 | 2.9% | 22% |
| +1 | EV 0 | 26.2 | 3.3% | 22% |
| +2 | EV −1 | 33.2 | 3.7% | 0% |

- **Brighter:** the lights, the moonlit ground and the sea all brighten, and the clipped glow widens.
- **At +2:** space turns dark grey (8-bit brightness 7 instead of 4). That is why nothing counts as near
  black.

To publish a step, add its setting to the publish command:

```sh
node scripts/capture-scenes/capture.mjs sky-sunset-orbit --app-dist build/capture-scenes/app-dist \
  --set settings.sky.exposure.ev100=11 --publish
node scripts/capture-scenes/capture.mjs night-lights-orbit --app-dist build/capture-scenes/app-dist \
  --set settings.renderer.exposureEV=1 --publish
```

To make it the default, put the setting in the scenario file's `settings` instead. `--publish` with
`--bracket` publishes only the scenario's own exposure, never a step. Each step was checked against a
fresh capture at the same setting: they match to within one level in at most 5 pixels.

## Exact commands

```sh
cd ~/gh/foss-earth/app
node scripts/capture-scenes/capture.mjs sky-sunset-orbit --app-dist build/capture-scenes/app-dist --publish
node scripts/capture-scenes/capture.mjs night-lights-orbit --app-dist build/capture-scenes/app-dist --publish
```

The flare and the exposures are set in the scenario files, so these commands reproduce the published
pictures.

The scenarios are in `~/gh/foss-earth/app/scripts/capture-scenes/scenarios/`, and the workflow is
documented in `~/gh/foss-earth/app/docs/proposals/scene-screenshot-capture.md`. A capture takes about
5 seconds once tiles are cached.

## Using them as card backgrounds (suggestion; the main agent owns it)

Each card's text runs from top to bottom:

- the label;
- the 64 px illustration strip (on the sky card);
- the heading, paragraph and link.

Both pictures put the Earth's edge level with that strip. On a near-square desktop card (about 345 px
wide and at least 330 px tall), these estimates come from the CSS, not from a rendered page:

| Part of the card | Rows (CSS px) | Sky picture | Night picture |
| --- | --- | --- | --- |
| Label | ~25–40 | black sky | black sky with stars |
| Strip | ~56–120 | the band at ~86–106; the Sun at about (253, 89), its starburst's rays reaching about 70 px | the glow at ~75–100 |
| Heading and text | from ~129 | black night side; the starburst's lower rays reach ~150. The four ghost rings cross this area on a diagonal toward the lower left, centred at about (205, 139), (160, 185), (120, 227) and (84, 265), 11 to 32 px across | dark ground with small lights, averaging 15–17 of 255 |

Layer each picture under its card's content:

```html
<article class="feature feature--sky" data-sky-art="sunset">
  <picture class="feature__photo" aria-hidden="true">
    <source srcset="media/sky-sunset-orbit.webp" type="image/webp" />
    <img src="media/sky-sunset-orbit.jpg" alt="" width="1200" height="1200" loading="lazy" decoding="async" />
  </picture>
  <p class="feature__label">06 / Sky &amp; astronomy</p>
  <div class="feature__sky-art" aria-hidden="true">…unchanged…</div>
  …heading, paragraph, link, credit…
</article>
```

```css
.feature__photo { position: absolute; inset: 0; }
.feature__photo img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 0%; }
.feature:has(> .feature__photo) > :not(.feature__photo) { position: relative; z-index: 1; }
/* The strip keeps its space, so the text stays below the edge. */
.feature--sky[data-sky-art="sunset"] .feature__sky-art { visibility: hidden; }
.feature--sky[data-sky-art="illustration"] .feature__photo { display: none; }
```

- **Crop position.** `object-position: 50% 0%` keeps the top, so the edge stays level with the strip on
  wide cards too. On the 6-column tablet layout (about 2.4 : 1), `cover` shows roughly the top half.
  - Sky picture: that keeps the Sun, the band and the black below, with the first ghost ring cut by the
    card's bottom edge.
  - Night picture: that keeps the glow and the nearer cities, without the coast.
- **Sun position.** The Sun sits at 73% across. If the card's text ever reaches it, the scenario's
  `camera.headingOffsetDeg` moves it: more negative is further right.
- **Switch.** A two-state control (`Sunset` / `Illustration`, buttons with `aria-pressed`) sets
  `data-sky-art`. The illustration and the card's gradient are unchanged beneath.
- **Night card.** If the night-lighting card has no strip, give it a spacer of the same height, or
  capture with a different `camera.limbAtY` (the edge's height as a fraction of the picture).
- **Cache.** Keep the site's `?v=` cache-busting on the media URLs.

## Credit (needed on the page)

FOSS Earth showed the map credit as "Map data: Google", linking to
<https://www.google.com/help/legalnotices_maps/>. A small line on each card would do, e.g.
`Rendered in FOSS Earth · Map data ©Google`.

The night picture's lights are VIIRS Day/Night Band radiance served by NASA GIBS. FOSS Earth credits it as
"Imagery from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and
Information System (ESDIS)." So that card could add `· Night lights NASA GIBS`.

Google's terms for 3D Tiles ask that the Google attribution, and its logo, be visible with the content.
Check whether a text credit is enough for a still image.

## Build provenance

- **Build.** Both pictures came from one build, made at 2026-10-26T05:16:16Z from the working trees
  then, and placed at `~/gh/foss-earth/app/build/capture-scenes/app-dist`. The commands above name that
  build with `--app-dist`, so a newer `dist/` built by someone else is not picked up. The build of the
  first pictures is kept at `build/capture-scenes/app-dist-20261026T011124Z`.
- **FOSS Earth app.** At `dd8ef2e0b736`, with 5 uncommitted files from other agents.
- **`@foss-earth/engine`.** At `7e61c707cbed`, with 7 uncommitted files from other agents.
- **`@foss-earth/sky`.** At `720142486426`, with 29 uncommitted files: the lens flare, the meter fix,
  and other agents' work.
- **The rest.** Clean at their commits. The full list is in each `report.json` under
  `build.provenance`.

So the pictures cannot be reproduced from commits alone. Once the lens flare and the meter fix are
committed, a `--rebuild` from those commits will reproduce them.

## Limitations

- **Sky picture:**
  - **One nominal lens.** The flare is the app's fixed six-pointed starburst and its set of four ghost
    rings; the band gets no bloom.
  - **A mostly black picture.** 80% of it is near black: space above, and the night side below, at the
    exposure the band needs.
- **Night picture:**
  - **The glow nearest the Sun clips to white** (2.9% of the picture). The app has no tone mapping.
    Exposing for the glow hides the lights.
  - **The lights are soft dots,** 1–3 CSS px on the card: the night-light tiles' resolution.
  - **The sea along the bottom reads grey-blue,** lit by the nearly full Moon.
- **One instant.** The sky picture uses the hero video's instant, but the night picture keeps the
  brief's 22:16 UTC, when Brazil is lit. At 23:11 UTC Brazil is darker still, and lit too. That moment
  could be used for consistency, at the cost of re-checking the framing.

## Kept alternatives

All of these are in `~/gh/foss-earth/app/scripts/capture-scenes/scenarios/` and can be re-run by name:

| Scenario | Picture |
| --- | --- |
| `sky-sunset-orbit` | the sky card |
| `sky-sunset-orbit --set settings.sky.exposure.lensFlare=glare` | the sky card without the ghost rings: the picture published before |
| `night-lights-orbit` | the night-lighting card |
| `night-lights-orbit-europe`, `-us-east`, `-nile`, `-us-midwest` | the other night candidates above |
| `sky-sunset-orbit-wide` | the first strip, 1920 × 432, at 22:16 UTC; published as `sky-sunset-orbit-wide.*` |
| `sky-sunset-orbit-sun-3deg` | that strip with the Sun 3° up |
| `sky-sunset-orbit-umn-on-limb` | the first composition: UMN on the edge at 22:16 UTC, the Sun 8.4° up |
| `sky-sunset-orbit-north-atlantic` | a square from 5000 km, the Sun just behind the edge |
| `night-lights-check-europe` | a check that lights render, not for publishing |

`~/gh/foss-earth/app/build/capture-scenes/card-check/` has 600 px and 345 px downscales of every
framing tried.
