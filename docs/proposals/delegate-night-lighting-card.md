# Delegation prompt: night-lighting card

Add a night-lighting card to the 0SFS landing page's feature grid: `~/gh/0sfs/0sfs.github.io`, files
`index.html` and `landing.css`. Use the orbital night picture that's already published:
`public/media/night-lights-orbit.webp` and `.jpg`, 1200 × 1200.

Before starting, read `~/gh/0sfs/.github/AGENTS.md` and follow it. Also read:

- `docs/proposals/bento-sunset-capture.md`, which explains how the night picture was made, where its
  exposure comes from, and how night lights switch on below a Sun of −5.02°;
- `docs/proposals/landing-feature-grid.md`.

## What exists

- The grid is 12 columns:
  - card 01, the world video, spans 6 columns and 2 rows;
  - cards 02–05 span 3 each;
  - cards 06 Sky, 07 Systems, 08 Sound and 09 Multiplayer span 3 each and fill one row.
  - The breakpoints are in `landing.css`: ≤1100 px, the 2-column layout, and ≤480 px.
- The sky card (`.feature--sky[data-sky-art="sunset"]`) is the model to follow:
  - a full-bleed `<picture class="feature__photo">`;
  - container-query (`cqw`) positioning, so the picture's dark areas sit behind the text at every
    width;
  - a credit tooltip behind a bottom-right `?` help button (`button[data-help]` plus
    `.info-page__help-tooltip`, wired up by `public/landing-help.js`).
  - Reuse its patterns. Don't change how the sky card looks.

## The task

1. **Place the card.** Add the night card so the grid still has no holes at every breakpoint. Pick the
   cleanest layout, for example a new row or resizing neighbours, and say why. Renumber the
   `feature__label`s in order.
2. **Copy.** Write it in the voice of the other cards: a short two-line heading with a `<span>` second
   line, one or two plain sentences, and optionally a `feature__link`. Claim only what the simulator
   really does:
   - city lights are NASA GIBS VIIRS Day/Night Band imagery;
   - they come on where the Sun is more than about 5° below the horizon;
   - check the FOSS Earth sky/night-lights code (`~/gh/foss-earth/sky`, `~/gh/foss-earth/app`) before
     stating anything else.
3. **Layout over the picture.** Put the text over the picture's dark areas, the way the sky card does:
   - measure the picture first: where the lit areas and the glow on the Earth's edge fall, as
     fractions of its height;
   - keep the lit cities visible and not covered by text.
4. **Credits tooltip:** "Rendered in FOSS Earth", Google 3D Tiles, and NASA GIBS (VIIRS Day/Night
   Band), with the same links as the sky card's tooltip.
5. **Picture URLs.** Use `?v=` plus the first 12 hex characters of each file's sha256, like the other
   media. Width and height are 1200, `alt=""`, `aria-hidden`, lazy loading.
6. **Check script.** Update `scripts/check-landing-page.mjs` for the extra help button (7 → 8) and
   anything else it counts.
7. **Verify:**
   - Run `npm run build`, serve `dist/` on a free port that isn't on browsers' blocked list (e.g.
     4185), and screenshot the whole grid and the new card at 1800, 1440, 1200, 1000, 800, 600, 420 and
     360 px wide. Make a contact sheet.
   - Run `npm run check`; it must pass.
   - Check that neighbouring cards haven't grown awkwardly, and the tooltip opens anchored to its
     button.

## If the picture doesn't suit the card

There may not be enough dark space for the text, or the lights may be too faint at card size. In that
case, don't edit the published files by hand. Recapture from `~/gh/foss-earth/app`:

- `node scripts/capture-scenes/tune.mjs night-lights-orbit --app-dist build/capture-scenes/app-dist`
  opens the framing tuner, which has crop and time controls.
- `night-lights-orbit-new-york` is a ready starting point over the US East Coast at the hero video's
  instant.
- `docs/proposals/scene-screenshot-capture.md` documents capture, `--bracket` and `--publish`.
- Follow the documented local Google-key lookup; never print or commit the key.
- Ask the user before replacing the published picture.

## Rules

- Don't commit, push or deploy.
- Scratch, logs and screenshots go only in the repo's gitignored `build/`. Nothing in `/tmp` or
  `~/.claude`.
- Preserve any uncommitted work that isn't yours.
- Stop every server and Chrome you started before you finish.

## Report back with

- the files changed;
- the layout choice;
- the copy;
- the check result;
- screenshots embedded as markdown images with `file:///` paths to image files (`![](file:///…png)`),
  not HTML links.
