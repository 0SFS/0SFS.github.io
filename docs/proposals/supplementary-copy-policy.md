# Supplementary copy behind “?” policy and implementation handoff

Defines the shared policy and concrete handoff for placing supplementary copy behind compact **?** controls, including the 0SFS landing-page aircraft and promotional artwork cards (`0sfs.github.io`).

## Purpose and context

The landing page features aircraft cards that currently expose full descriptive summaries, runtime package notes, and physics qualification caveats directly on their primary surfaces. In particular, the Cirrus Vision Jet card contains dense paragraphs detailing runtime package mappings and avionics limitations:

> Single-engine personal jet. G1, G2, G2+ and G3 variants.
>
> G1, G2 and G3 have separate runtime packages. G2+ is currently mapped to the G2 runtime while separate physics/package support is not yet implemented. Choosing a generation does not provide calibrated generation-specific performance, a new cabin or complete generation-specific avionics.

When displayed alongside the cleaner Cessna 172 card, these technical paragraphs dominate the visual layout, create uneven card heights, and distract users from the primary decision flow.

This policy defines what content belongs on the primary card surface versus behind a compact, accessible **?** control, preserving all underlying catalogue copy and build-time validation without inventing replacement marketing claims.

---

## 1. UI policy: primary surface vs. behind “?”

The organization UI policy in `0sfs/.github/agent-reference.md` establishes the separation of concerns:

### Primary surface (visible by default)
The primary surface must remain uncluttered, legible, and focused on decision-making:
1. **Identity:** Visual thumbnail and primary title/name (e.g. `aircraft/thumbnails/cirrus-vision-jet.png` and `Cirrus Vision Jet`).
2. **Primary action:** The card itself or its primary navigation target.
3. **Essential terse state:** Short status indicators or badges that materially affect the user's immediate interpretation, capabilities, or safety (e.g. a visible **Experimental** badge for the F-35B).
4. **Current operational state:** Immediate errors, active fallbacks, pending/apply feedback, or terse instructions necessary to make a correct choice.
5. **Rule on claims:** Never invent new capability claims, buzzwords, or marketing adjectives to replace hidden text.

### Behind “?” (on-demand help)
Detailed technical context is kept behind a compact **?** trigger:
1. **Extended descriptions:** Variant and generation breakdowns (e.g. G1, G2, G2+, G3).
2. **Implementation mappings:** Runtime packaging notes (e.g. G2+ mapped to G2 runtime pending dedicated physics).
3. **Provenance & author credits:** Source links, provider/model attribution, creator names, asset origin, licence links and modification notices. On promotional artwork cards, place these inside an accessible **?** at the bottom right, preserving all credit text and working links. Apply this automatically when integrating new artwork, including in rendering handoffs; do not add permanent credit paragraphs to the card. Models built in this project's own code need no third-party model credit; external content shown on their screens still has its own attribution.
4. **Technical caveats & qualifications:** Engineering approximations, uncalibrated performance warnings, or STOVL flight dynamics caveats.
5. **Secondary explanations:** Supplementary background details that support understanding but are not required for the initial high-level decision.

---

## 2. Interaction, accessibility, and layout specification

### Trigger control
- **Element & semantics:** A native `<button>` element with `type="button"` and `popovertarget="..."` (or accessible disclosure trigger).
- **Labeling:** Visual label is a compact `?`. Accessible name is explicit and unique per card via `aria-label` (e.g. `aria-label="Cirrus Vision Jet details and technical notes"`).
- **Placement:** Trailing element within an aircraft card's title header row, keeping the component name first and help last. For promotional artwork cards, use the bottom-right corner, reserving enough space so the control never overlaps the image or primary copy.

### Keyboard & pointer interaction
- **Activation:** Opens via left click, tap, Space key, or Enter key.
- **Dismissal:** Supports light dismiss (clicking/tapping anywhere outside the popover) and pressing `Escape`.
- **Focus return:** When closed via Escape or toggle, focus returns cleanly to the `?` button. No focus trapping that blocks page navigation.

### Clipping prevention & mobile layout
- **Top-layer rendering:** `.info-page__aircraft article` uses `overflow: hidden` with `border-radius: var(--info-radius)`. Standard absolutely positioned dropdowns would be clipped by the parent card's rounded overflow boundary. Using the native HTML Popover API (`popover="auto"`) promotes the help container to the browser's top layer (`::backdrop` stack), completely bypassing parent container clipping.
- **Mobile responsiveness:** Popover width is capped at `max-width: min(340px, calc(100vw - 32px))` with `word-break: normal; overflow-wrap: break-word;` so it wraps cleanly without causing horizontal scrolling on narrow viewports down to 320px.
- **Tablet layout:** In tablet view (where aircraft cards use a two-column grid with thumbnail on the left and content on the right), the header row sits in column 2 beside the image.

---

## 3. Concrete implementation snippets for landing page

The main agent can integrate the following snippets into `index.html` and `landing.css`.

### HTML markup for `index.html`

Replace lines 128–144 of `0sfs.github.io/index.html` (`<div class="info-page__aircraft">`):

```html
            <!-- The flight's aircraft families, in its catalogue's order. The site build checks them against the flight build. -->
            <div class="info-page__aircraft">
              <article>
                <img src="aircraft/thumbnails/cessna-172.png" alt="" width="640" height="360" loading="lazy" />
                <div class="info-page__aircraft-header">
                  <h3>Cessna 172 Skyhawk</h3>
                  <button type="button" class="info-page__help-btn" popovertarget="help-cessna-172" aria-label="Cessna 172 Skyhawk notes">?</button>
                </div>
                <div id="help-cessna-172" class="info-page__help-popover" popover>
                  <p>High-wing trainer. Flight model and visuals both available.</p>
                </div>
              </article>
              <article>
                <img src="aircraft/thumbnails/cirrus-vision-jet.png" alt="" width="640" height="360" loading="lazy" />
                <div class="info-page__aircraft-header">
                  <h3>Cirrus Vision Jet</h3>
                  <button type="button" class="info-page__help-btn" popovertarget="help-cirrus-vision-jet" aria-label="Cirrus Vision Jet notes">?</button>
                </div>
                <div id="help-cirrus-vision-jet" class="info-page__help-popover" popover>
                  <p>Single-engine personal jet. G1, G2, G2+ and G3 variants.</p>
                  <p class="info-page__note">G1, G2 and G3 have separate runtime packages. G2+ is currently mapped to the G2 runtime while separate physics/package support is not yet implemented. Choosing a generation does not provide calibrated generation-specific performance, a new cabin or complete generation-specific avionics.</p>
                </div>
              </article>
              <article>
                <img src="aircraft/thumbnails/f-35b.png" alt="" width="640" height="360" loading="lazy" />
                <div class="info-page__aircraft-header">
                  <div class="info-page__aircraft-title">
                    <h3>Lockheed Martin F-35B Lightning II</h3>
                    <span class="info-page__badge">Experimental</span>
                  </div>
                  <button type="button" class="info-page__help-btn" popovertarget="help-f-35b" aria-label="Lockheed Martin F-35B Lightning II notes">?</button>
                </div>
                <div id="help-f-35b" class="info-page__help-popover" popover>
                  <p>STOVL fighter. Experimental flight model and AF267 exterior model.</p>
                  <p class="info-page__note">Experimental F-16/Aeromatic-derived JSBSim flight model. F-35B performance and STOVL behavior are not validated.</p>
                </div>
              </article>
            </div>
```

### CSS rules for `landing.css`

Add the following rules to `0sfs.github.io/landing.css`:

```css
/* Aircraft card header & compact help */
.info-page__aircraft-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-top: 12px; }
.info-page__aircraft-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; min-width: 0; }
.info-page__aircraft-header h3 { margin-top: 0; font-size: 18px; font-weight: 600; letter-spacing: -.4px; line-height: 1.35; }

/* Status badge (e.g. Experimental) */
.info-page__badge { display: inline-block; padding: 2px 6px; border: 1px solid var(--info-accent); border-radius: 5px; color: var(--info-accent); font: 500 9px/1.6 ui-monospace, "SF Mono", Menlo, Consolas, monospace; letter-spacing: .4px; text-transform: uppercase; vertical-align: 1px; }

/* Compact ? button */
.info-page__help-btn { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; padding: 0; border: 1px solid var(--info-line); border-radius: 50%; background: #16212b; color: var(--info-muted); font: 600 12px/1 ui-monospace, "SF Mono", Menlo, Consolas, monospace; cursor: pointer; flex-shrink: 0; transition: color .15s ease, border-color .15s ease, background-color .15s ease; }
.info-page__help-btn:hover { color: var(--info-ink); border-color: #4a5c6d; background: #1e2c3a; }
.info-page__help-btn:focus-visible { outline: 3px solid #8bdfff; outline-offset: 2px; }

/* Help popover panel */
[popover].info-page__help-popover { inset: auto; margin: 8px 0 0; padding: 14px 16px; border: 1px solid var(--info-line); border-radius: 12px; background: #121c25; color: #c3cdd5; font-size: 12px; line-height: 1.55; max-width: min(340px, calc(100vw - 32px)); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5); }
[popover].info-page__help-popover p { margin: 0; }
[popover].info-page__help-popover p + p { margin-top: 10px; }
[popover].info-page__help-popover p.info-page__note { color: #a5b1bd; font-size: 11.5px; }

/* Tablet responsive adjustment */
@media (max-width: 900px) {
  .info-page__aircraft-header { grid-column: 2; margin-top: 0; }
}
```

### Optional progressive enhancement script
The HTML Popover API is natively supported in Safari 17+, Chrome 114+, Firefox 125+, and Edge. If support for older legacy browsers is desired without frameworks, include this minimal 9-line helper in an inline script:

```javascript
document.querySelectorAll(".info-page__help-btn").forEach((btn) => {
  const targetId = btn.getAttribute("popovertarget");
  const popover = document.getElementById(targetId);
  if (!popover || typeof popover.showPopover === "function") return;
  // Fallback for browsers without native Popover API
  btn.addEventListener("click", () => {
    const isHidden = popover.hasAttribute("hidden");
    if (isHidden) popover.removeAttribute("hidden");
    else popover.setAttribute("hidden", "");
  });
  popover.setAttribute("hidden", "");
});
```

---

## 4. Build validation and test adjustments

### Inspection of `scripts/build.mjs`
`checkAircraft(landing, scripts)` verifies that the landing page lists all shipped aircraft families in exact catalogue order, with matching names, summaries, and notes.

Currently, `scripts/build.mjs` line 77 parses cards using a strict contiguous regex:
```javascript
const cards = [...landing.matchAll(/<article>\s*<img src="([^"]+)"[^>]*>\s*<h3>([^<]*)<\/h3>\s*<p>([^<]*)<\/p>(?:\s*<p class="info-page__note">([^<]*)<\/p>)?\s*<\/article>/g)]
  .map(([, thumbnail, label, summary, note]) => ({ thumbnail, label: decode(label), summary: decode(summary), note: note === undefined ? undefined : decode(note) }));
```

Because `<h3>`, `<p>`, and `<p class="info-page__note">` now reside inside the header and help popover wrappers rather than being direct sequential siblings of `<img>`, the strict whitespace regex would not match.

### Minimal required parser change
We scope matching to each `<article>` container and extract the thumbnail, label, summary, and note within that container:

```javascript
export function checkAircraft(landing, scripts) {
  const cards = [...landing.matchAll(/<article>([\s\S]*?)<\/article>/g)].map(([, body]) => {
    const thumbnail = /<img src="([^"]+)"/.exec(body)?.[1];
    const label = /<h3>([^<]*)<\/h3>/.exec(body)?.[1];
    const summary = /<p>([^<]*)<\/p>/.exec(body)?.[1];
    const note = /<p class="info-page__note">([^<]*)<\/p>/.exec(body)?.[1];
    return {
      thumbnail,
      label: label !== undefined ? decode(label) : "",
      summary: summary !== undefined ? decode(summary) : "",
      note: note !== undefined ? decode(note) : undefined,
    };
  });
```

### Why this is the smallest safe change
1. **Preserves 100% of validation guarantees:**
   - Shipped thumbnail verification (`shipped` vs `listed`) is unchanged.
   - Ordering check against `AIRCRAFT_FAMILIES` is unchanged.
   - Exact text validation (`shipsText` for `label`, `summary`, and `note`) is fully preserved.
2. **Backward-compatible:**
   - Matches both the legacy flat `<article>` markup and the new header/popover markup.
   - Existing fixtures in `scripts/build.test.mjs` continue to pass without requiring rewriting unrelated tests.

---

## 5. Verification instructions and test checklist

When the main agent integrates the markup, CSS, and build adjustments, perform the following verification:

### Automated validation
Run the local test suite:
```sh
cd ~/gh/0sfs/0sfs.github.io && npm test
```
Verify that all 54 tests pass, including:
- `checkAircraft` accepts families, order, and words.
- `checkReferences` validates all image and link references.
- `buildSite` builds cleanly into `dist/`.

### Manual and browser test checklist
Start the local server:
```sh
cd ~/gh/0sfs/0sfs.github.io && npm run dev
```

1. **Default visibility:**
   - Confirm all aircraft cards display thumbnail image and name.
   - Confirm the Cirrus Vision Jet long description and runtime notes are hidden by default.
   - Confirm the F-35B displays the **Experimental** badge visibly on the card face.
   - Confirm the compact **?** button appears trailing the title on each card.
2. **Keyboard accessibility:**
   - Tab through the cards. Focus ring (`outline: 3px solid #8bdfff`) appears clearly on each **?** button.
   - Press `Enter` or `Space` to open help.
   - Press `Escape` to close help. Verify focus returns to the active **?** button.
3. **Pointer / Touch interaction:**
   - Click/tap **?** to open help.
   - Click/tap anywhere outside the popover to confirm light-dismiss closes it.
4. **Layout & viewport checks:**
   - **Desktop (1440px):** 3 cards in a row. Popover opens without clipping beyond the card boundary.
   - **Tablet (834px):** 2-column layout per card (thumbnail left, title/help right).
   - **Mobile (390px & 320px):** Single-column stacked cards. Popover fits comfortably within screen margins with no horizontal overflow (`max-width: min(340px, calc(100vw - 32px))`).
5. **Content fidelity:**
   - Open each help popover and verify that all original text (variant notes for Cirrus, Aeromatic/STOVL caveats for F-35B) matches the catalogue word-for-word.
