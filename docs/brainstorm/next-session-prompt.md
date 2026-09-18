# Prompt for the next session

Copy everything below the line into a fresh conversation.

---

I am fixing the phone side of OSFS (`/Users/felg/gh/0sfs`). A real iPhone
session just found four defects. Read these two files first — they are the whole
brief, written by the previous session:

- `docs/ux/2026-09-17-iphone-session.md` — what happened on the device, in order
- `docs/brainstorm/ios-url-bar-and-scrolling.md` — causes, dead ends, and the
  options already considered for each fix

Then read `AGENTS.md` (scratch goes in the gitignored `build/`, never `/tmp`;
never start a dev server unless I ask) and `docs/phone-controller-ui.md` (the
one rule: the phone controller is the desktop HUD rearranged, so control
appearance belongs in the shared `src/styles/flightControls.css`).

Do these in order. Each is independently shippable — finish and verify one
before starting the next.

## 1. Stop the page stealing drags from the sliders (highest value)

On iPhone Safari a vertical drag that starts on an `<input type="range">` goes
to the page scroller instead of the control. The throttle is vertical
(`writing-mode: vertical-lr`) so it is the worst hit and is effectively
unusable. It happens in Safari *and* in the installed Home Screen app, because
this was never about the browser bars.

- Add `touch-action: none` to the range inputs in
  `src/styles/flightControls.css`, beside the rule that already gives it to
  `.flight-hud__attitude`. The desktop HUD has the same defect on any
  touchscreen, so the fix belongs there and the phone inherits it.
- Add `overscroll-behavior: none` to `html, body` on the phone page to kill the
  document rubber-band.
- **Do not** put `touch-action: none` on `.phone-app`: the Connection details
  sheet must still scroll under a finger, and `npm run check:phone-layout` has a
  rule that swipes on it. Verify that rule still passes.
- Check the `<details>` sheets and the fullscreen popup card still scroll after
  the change — the popup card scrolls internally on a landscape handset.

I will test on the phone. Tell me exactly what to try, because the layout check
cannot see this class of bug.

## 2. Add to Home Screen from `/rc/` must install the controller

`public/manifest.webmanifest` has `"start_url": "./fly/"`, so an icon created
from the controller opens the flight simulator — the pilot did what our own
popup told them to and got a different program.

Preferred fix, already reasoned through in the brainstorm: a manifest per route,
chosen by the inline boot script in `index.html`, which already resolves the
route. `/rc/` gets `"start_url": "./rc/"` and its own `short_name` (e.g. "OSFS
RC") so both icons can coexist on a Home Screen. Keep `/fly/` behaving as it
does today.

Cover it with a test the way `src/appRoute.test.ts` covers routing.

## 3. Per-route `theme-color`

One `#080e14` in `index.html` matches neither page. Set it per route in the same
boot script: `#000` for `/rc/` (true black, OLED) and `#04060a` for `/fly/`.
Safari tints its bars with it, so the bars stop reading as stolen screen even
though iOS will not let us remove them.

## 4. Show the fullscreen notice on `/fly/`, not just `/rc/`

`/fly/` calls `offerFullscreen()` in `src/fullscreen/fullscreen.ts`, which
prints one line into `GameLog`. On an iPhone the flight page is where the screen
matters most and it says the least.

The controller's popup is the pattern to reuse. **Its words live in one file on
purpose** — `src/remote/fullscreenMessage.tsx` — and they are mine: a protest
notice naming Apple, the practical monopoly on iOS app distribution, and the cut
Apple takes. Do not rewrite, soften or duplicate that copy. The flight page is
not React, so decide between a small React root for the popup or the same strings
rendered as DOM, and keep one source of words for both hosts. If you think any
claim in it is wrong, say so and leave it alone; the reasoning and the list of
which claims are dated is in `docs/brainstorm/iphone-fullscreen-popup.md`.

## House rules for this session

- No hidden reasoning blocks. Put working notes in `docs/brainstorm/` where I
  can read and correct them.
- Do not start a dev server unless I ask. Give me the command and I will run it.
- After each item: `npx vitest run`, `npx tsc -p tsconfig.app.json --noEmit`,
  `npx eslint src`, and `npm run check:phone-layout`. Report what you actually
  ran. The repo has unrelated uncommitted work — do not commit anything unless I
  ask, and leave the 5 pre-existing eslint errors in `LoggingPanel.tsx` and
  `evaluationInstruments.test.ts` alone.
- State plainly what you could not verify without my phone.

## Background, if you want the fuller picture

Recent work on `/rc/`, for context rather than action: the yaw slider was not
moving because rudder never reached the React snapshot (`RENDERED_CONTROLS` in
`src/remote/phoneControllerClient.ts`); yaw release is now a setting (Return to
centre with a 0–1.5s sweep, or Keep value) in `src/remote/PhoneYaw.tsx` and
`phoneSettingsStore.ts`; yaw and roll trim were thinned to one lever thickness;
and the iPhone fullscreen popup was rewritten from an app-install nag into the
protest notice described above.
