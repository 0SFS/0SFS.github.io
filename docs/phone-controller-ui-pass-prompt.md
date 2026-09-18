# Work prompt: phone controller UI pass

Execute this task when the user starts a fresh conversation with this file.
Work in `/Users/felg/gh/0sfs`. Read the current `AGENTS.md` before making changes.

## Read first

- **[Phone controller UI](phone-controller-ui.md)** — how the `/rc/` screen is
  built, the stylesheet it shares with the desktop HUD, the layout rules, and the
  traps already paid for. Read it before touching any CSS; several obvious-looking
  fixes below have already been tried and failed for reasons recorded there.
- [Development → Phone controller layout](development.md#phone-controller-layout)
  — `npm run check:phone-layout`, which renders the real page *and* the real HUD
  and fails on a broken rule.
- [Development → Testing on a real phone](development.md#testing-on-a-real-phone)
  — `npm run dev:lan`. Ask the user to run it; `AGENTS.md` forbids starting
  servers yourself.

The user reviews this work by looking at `build/phone-layout/<date>/*.png`, so
regenerate those and read them yourself before reporting.

## The work

All of this is the user's own feedback on the current screen. Items 2–5 are about
**landscape** unless stated.

1. **Offer fullscreen.** The controller should prompt the user to go fullscreen.
   `src/fullscreen/fullscreen.ts` has the primitives — `canRequestFullscreen`,
   `enterFullscreen`, `onFullscreenChange`, `readFullscreenEveryVisit`. Do not
   reuse `offerFullscreen`: it renders into `GameLog`, which is flight-only and
   does not exist on `/rc/`. Two constraints from that module's comments:
   browsers grant fullscreen only during a tap, and **iPhone Safari has no page
   fullscreen at all** — there, offer nothing, or suggest Add to Home Screen
   (`isStandaloneDisplay()` already detects that case). Do not nag: honour a
   dismissal the way the flight page's preference key does.
2. **The roll trim slider is far too long.** It should be exactly as wide as the
   square pitch/roll pad beneath it, no wider.
3. **The throttle should use all available vertical space**, in both
   orientations. The user calls out portrait specifically as well: THR is not as
   long as it could be there either.
4. **The yaw slider is tiny.** Give it real width and a usable touch height.
5. **The Fly / Cockpit / Chase / Hold brake buttons are massive.** Put them in a
   compact grid at the bottom, like FOSS Earth's HUD bar. That is
   `/Users/felg/gh/foss-earth/src/styles/hud.css` — `.hud-bar` (fixed to the
   bottom, `flex-wrap`, `width: fit-content`, 3px gap) and `.hud-chip`
   (`min-height: 28px`, 11px, `padding: 6px 10px`, 8px radius). Match that
   density. Keep the brake a hold-to-apply target: it is a flight control, not a
   menu item, and it needs to stay comfortably pressable.
6. **Portrait has empty space at the top "for no reason."** It is there on
   purpose today — the stack is bottom-anchored so the instruments sit directly
   above the cluster and everything is in thumb reach, which
   [phone-controller-ui.md](phone-controller-ui.md#layout) explains. **The user
   has overruled that.** Use the space or remove it; do not re-argue the case.
   Giving it to the throttle and the stick is the obvious move and overlaps
   item 3.

## Constraints

- Fix appearance in `src/styles/flightControls.css` so it lands on both screens;
  fix placement in `src/remote/phone.css`. If a change to the shared file is
  right for the phone but wrong for the HUD, say so rather than forking a rule.
- If you touch `flightControls.css`, prove the desktop HUD did not move: the
  `flight-hud-*.png` screenshots are deterministic, so the run before and after
  should be byte-identical.
- Some of these items will conflict with the rules the check enforces — item 6
  against the chrome-share rule, for instance. Update the rule and its comment
  to say what is true now; do not delete a rule to make a run pass.

## Verify

`npm run check:phone-layout`, `npm run lint`, `npm run test`, `npx vite build`.
`npx eslint .` currently reports 5 pre-existing errors in
`src/flight/hud/LoggingPanel.tsx` and `src/flight/hud/evaluationInstruments.test.ts`;
do not let that total grow and do not fix them here.

## Out of scope

The pairing protocol, connection diagnostics, routing, and the desktop flight UI
except as the shared stylesheet requires. Light/dark theming is a separate task —
see [theme-support-prompt.md](theme-support-prompt.md).
