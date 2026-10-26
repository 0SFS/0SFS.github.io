# Supplementary copy and help tooltips

Keep the visible surface focused on the name/image, primary action, current state
and short decision-critical warnings. Keep the F-35B’s Experimental badge visible.
Put descriptions, aircraft generation/package mappings, technical qualifications,
provenance, attribution and licence details behind a compact **?**. Preserve the
catalogue wording; do not invent capability claims to replace hidden copy.

## Interaction and appearance

**? opens a compact tooltip anchored beside its own button.** It must never open
as a centered popup, modal dialog or dimmed overlay. Using the browser’s Popover
API for the top layer is an implementation detail, not a request for popup styling.
No backdrop tint, focus trap, full-screen layer or separate close button.

Use the shared `createHelpTooltip` behavior from `@foss-earth/ui`: click/tap,
Enter and Space toggle it; Escape and outside interaction dismiss it; only one
explanation is open at once. Keep credit links reachable with Tab, and return
focus to the button when Escape closes help from a link. Position against the
trigger and clamp within the viewport, including while scrolling or resizing.
The tooltip must escape rounded-card clipping without changing the card’s layout.

Give the button an explicit accessible name and maintain `aria-expanded` and
`aria-controls`. Help content has `role="tooltip"`. Use compact text and padding,
a restrained border/shadow, a maximum width of 340 px, and scrolling only when
needed to fit the viewport. It must wrap at 320 px without horizontal overflow.

## Placement and credits

Put aircraft help last in its title row. Put promotional artwork attribution in
a **?** at the card’s bottom right. Preserve complete provider/model attribution,
creator names, licence links and modification notices inside it. Apply this when
integrating new artwork and in rendering handoffs without a separate request.
Models built in this project’s own code need no third-party model credit; external
content shown on their screens still needs its own attribution.

The video widget is deliberately image-first: play/pause and **?** at the
bottom left, **Fly** at the bottom right. Its description, capture date/location,
source link and Google notices belong inside its tooltip. The top-left title
shows **0SFS** and **Open Source Flight Simulator** over a subtle gradient for
contrast. There is no caption bar or permanent descriptive paragraph.

## Landing implementation

Static markup uses a hidden content element and a hidden placeholder button:

```html
<button type="button" class="info-page__help-button" hidden
  data-help="remote-art-credits" aria-label="Phone controller artwork credits">?</button>
<div id="remote-art-credits" class="info-page__help-tooltip" hidden>
  <!-- Complete attribution with working links. -->
</div>
```

`public/landing-help.js` initializes the shared helper and reveals its button.
`scripts/build.mjs` copies the standalone compiled helper from the adjacent
`foss-earth/ui` build as `landing-help-core.js`; the landing page loads no simulator,
renderer or application shell. All help controls share this behavior. Styles set
`position: fixed; inset: auto; margin: 0` and a transparent backdrop; the shared
helper supplies coordinates relative to the trigger. Do not use `margin: auto`
or a colored `::backdrop`, which caused the rejected centered-popup presentation.

## Review

Check desktop, tablet, 390 px and 320 px layouts. Help starts closed and makes no
layout shift. Verify click, touch, Enter, Space, Tab through credit links, Escape
focus return, outside dismissal and switching between buttons. The tooltip stays
near its trigger and within the viewport without dimming the page. Confirm all
original aircraft text and attribution links remain intact, including the laptop’s
model/creator/CC BY 4.0/modified notice. No external smartphone-model credit is due.
