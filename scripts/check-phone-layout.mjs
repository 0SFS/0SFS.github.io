#!/usr/bin/env node
/**
 * Checks the phone controller's layout against the rules it is supposed to
 * keep, and writes screenshots for a human to look at.
 *
 * Three of these rules are behavioural, not cosmetic:
 *
 * - The page must never scroll. A flight control that can move out from under a
 *   thumb mid-flight is a bug.
 * - The pitch/roll pad must be square. `PhoneStick` takes its deflection radius
 *   from `min(width, height)`, so every pixel past square is dead area.
 * - An open sheet must scroll under a finger. The page cannot, so a sheet that
 *   will not is a timeline nobody can read to the end.
 *
 * The rest encode the arrangement the desktop HUD uses in flight mode, so a
 * future change cannot quietly scramble it.
 *
 * Usage: node scripts/check-phone-layout.mjs [--keep-html]
 * Output: build/phone-layout/*.png (gitignored)
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate, openHeadlessChrome } from "./headless-chrome.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/**
 * Runs accumulate under a dated folder so a change can be compared against the
 * run before it, instead of silently overwriting the evidence. `latest` always
 * points at the newest run.
 */
// Local date, not UTC: a run late in the evening belongs to the day the person
// running it is having, not to tomorrow in Greenwich.
const BUILD_ID = process.env.UI_LAYOUT_BUILD ?? (() => {
  const now = new Date();
  const pad = value => String(value).padStart(2, "0");
  return `${now.getFullYear()}_${pad(now.getMonth() + 1)}_${pad(now.getDate())}`;
})();
const BASE = path.join(ROOT, "build", "phone-layout");
const OUT = path.join(BASE, BUILD_ID);
/**
 * `flight-hud` is the reference the phone controller is supposed to match.
 * `offer`, `home-screen` and `settings` are there to be looked at: the
 * fullscreen popup, its iPhone version and the settings page cover the
 * controls, so there is nothing under them to measure. `fly-home-screen` is the
 * same iPhone notice on the flight page, over the HUD. `unpaired` is the page a
 * Home Screen launch opens on, and `scanner` the QR scanner it offers.
 */
const PAGES = ["flying", "control", "grid-top", "offer", "home-screen", "settings", "failed", "flight-hud", "fly-home-screen",
  "unpaired", "scanner"];
/** Only these phone pages are held to the phone's layout rules. */
const CHECKED = new Set(["flying", "control", "grid-top", "failed"]);
/** The computer is flying on these, so the take-control popup must be up — and on no others. */
const CONTROL_POPUP = new Set(["control"]);
/** Settings → Button grid → Top puts the chip grid above the controls instead of below. */
const GRID_TOP = new Set(["grid-top"]);
/** Pages that render with the Connection details sheet open. */
const SHEET_OPEN = new Set(["failed"]);
const SIZES = [
  { name: "portrait", width: 390, height: 844 },
  { name: "small", width: 360, height: 780 },
  { name: "landscape", width: 844, height: 390 },
];
/**
 * Everything in the page's flow that is not `.phone-controls`. There used to be
 * an instrument row, a fullscreen banner, a status notice and a footer here,
 * and crowding the controls out with them is what went wrong. The instruments
 * and buttons now live in the chip grid inside the controls, the fullscreen
 * offer is a popup and the status notice is gone, so nothing is allowed here at
 * all. Popups and sheets are fixed-position and not in the flow.
 */
const MAX_CHROME_SHARE = 0;
/**
 * And the other half of that: the controls stretch to fill the page, less its
 * safe-area padding. Empty space used to be deliberate — the stack hugged the
 * bottom of a portrait screen — and it is not any more, so a layout that leaves
 * part of the screen dark is a bug rather than a preference.
 */
const MIN_CONTROLS_SHARE = 90;

mkdirSync(OUT, { recursive: true });
const render = spawnSync("npx", ["vitest", "run", "--config", "scripts/phone-layout/vitest.config.ts"],
  { cwd: ROOT, encoding: "utf8", env: { ...process.env, UI_LAYOUT_OUT: OUT } });
if (render.status !== 0) {
  console.error(render.stdout ?? "", render.stderr ?? "");
  throw new Error("Could not render the phone controller.");
}

/** Reads the geometry that the layout rules are expressed in. */
const MEASURE = `(() => {
  const box = selector => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const app = document.querySelector('.phone-app');
  const controls = document.querySelector('.phone-controls');
  return JSON.stringify({
    scrollHeight: document.documentElement.scrollHeight,
    viewport: window.innerHeight,
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
    appHeight: Math.round(app.getBoundingClientRect().height),
    controlsHeight: Math.round(controls.getBoundingClientRect().height),
    chromeHeight: [...app.children]
      .filter(el => el !== controls && !['fixed', 'absolute'].includes(getComputedStyle(el).position))
      .reduce((total, el) => total + el.getBoundingClientRect().height, 0),
    stick: box('.phone-cluster__pad > .phone-stick'),
    rollTrim: box('.flight-hud__slider-control--roll-trim'),
    pitch: box('.flight-hud__lever--pitch'),
    flaps: box('.flight-hud__lever--flaps'),
    centers: box('.phone-cluster .flight-hud__auto-trims'),
    yaw: box('.phone-yaw'),
    yawTrack: box('.phone-yaw input[type="range"]'),
    yawLabel: box('.phone-yaw .flight-hud__yaw-heading > span'),
    yawValue: box('.phone-yaw .flight-hud__yaw-heading > output'),
    camera: box('.phone-camera'),
    viewSwitch: box('.phone-view-switch'),
    cameraLabel: box('.phone-camera__label'),
    brake: box('.phone-brake'),
    throttle: box('.phone-throttle'),
    engine: box('.phone-engine'),
    grid: box('.phone-actions'),
    controlPopup: Boolean(document.querySelector('.phone-popup--control')),
    // What a finger lands on: the popup over the stick, a chip in the grid.
    stickCovered: (() => {
      const stick = document.querySelector('.phone-cluster__pad > .phone-stick');
      if (!stick) return false;
      const r = stick.getBoundingClientRect();
      return Boolean(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.phone-popup--control'));
    })(),
    gridReachable: (() => {
      const chip = document.querySelector('.phone-actions > .phone-settings');
      if (!chip) return false;
      const r = chip.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return Boolean(hit && chip.contains(hit));
    })(),
  });
})()`;

/**
 * The third behavioural rule: an open sheet must scroll under a finger. The page
 * behind it never scrolls, so the sheet is the only way to reach the bottom of
 * a long connection timeline. Fills the timeline past the screen, then swipes
 * up from the middle of it — where a swipe used to be swallowed by the log.
 */
const FILL_SHEET = `(() => {
  const log = document.querySelector('.phone-diagnostics[open] .phone-log');
  if (!log) return 'null';
  while (log.children.length < 80) log.append(log.children[0].cloneNode(true));
  const r = log.getBoundingClientRect();
  return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(Math.min(r.y + r.height, innerHeight) - innerHeight / 4) });
})()`;
const SHEET_SCROLL = `document.querySelector('.phone-diagnostics[open]').scrollTop`;

async function sheetScrolls(chrome, sessionId) {
  const start = JSON.parse(await evaluate(chrome, sessionId, FILL_SHEET));
  if (!start) return "the Connection details sheet is not open";
  await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 }, sessionId);
  await chrome.send("Input.synthesizeScrollGesture",
    { x: start.x, y: start.y, yDistance: -120, gestureSourceType: "touch", speed: 800 }, sessionId);
  await new Promise(resolve => setTimeout(resolve, 200));
  const moved = Number(await evaluate(chrome, sessionId, SHEET_SCROLL));
  return moved > 0 ? null : "the open Connection details sheet does not scroll when swiped on its timeline";
}

/** Each rule returns a failure message, or null when it holds. */
function check(m, { gridTop, controlPopup }) {
  const failures = [];
  const share = Math.round((m.controlsHeight / m.appHeight) * 100);
  const chromeShare = Math.round((m.chromeHeight / m.appHeight) * 100);
  // One device pixel of rounding is not a scrollbar.
  if (m.scrollHeight > m.viewport + 1) failures.push(`page scrolls (${m.scrollHeight} > ${m.viewport})`);
  if (m.overflowX) failures.push("horizontal overflow");
  if (chromeShare > MAX_CHROME_SHARE) failures.push(`chrome takes ${chromeShare}% of the page (want <= ${MAX_CHROME_SHARE}%)`);
  if (share < MIN_CONTROLS_SHARE) failures.push(`controls take ${share}% of the page (want >= ${MIN_CONTROLS_SHARE}%)`);
  // Not flying from this phone: a popup to take control over the flight
  // controls, which cannot be used without it — and not over the chip grid,
  // which can, and which says why control is unavailable.
  if (controlPopup && !m.controlPopup) failures.push("no take-control popup while the computer is flying");
  if (!controlPopup && m.controlPopup) failures.push("a take-control popup while the phone is flying");
  if (m.controlPopup) {
    if (!m.stickCovered) failures.push("the take-control popup does not cover the flight controls");
    if (!m.gridReachable) failures.push("the take-control popup blocks the chip grid");
  }
  if (!m.stick) return { share, failures: [...failures, "no pitch/roll stick"] };
  if (Math.abs(m.stick.w - m.stick.h) > 2) {
    failures.push(`stick is ${m.stick.w}x${m.stick.h}; PhoneStick ignores everything past square`);
  }
  // The arrangement the desktop HUD uses in `?mode=flight`.
  const centre = b => b.x + b.w / 2;
  const bottom = b => b.y + b.h;
  if (m.rollTrim && m.rollTrim.y >= m.stick.y) failures.push("roll trim is not above the stick");
  // A trim slider wider than the pad under it reads as a different control.
  if (m.rollTrim && Math.abs(m.rollTrim.w - m.stick.w) > 2) {
    failures.push(`roll trim is ${m.rollTrim.w} wide over a ${m.stick.w} stick; they share a column`);
  }
  if (m.pitch && centre(m.pitch) >= centre(m.stick)) failures.push("pitch trim is not left of the stick");
  if (m.flaps && centre(m.flaps) <= centre(m.stick)) failures.push("flaps are not right of the stick");
  if (m.centers && m.rollTrim && centre(m.centers) >= centre(m.rollTrim)) failures.push("trim buttons are not left of the roll trim");
  // The chip grid, and the brake at its end, sit wholly below the controls — or
  // wholly above them when Settings says Top.
  if (m.grid && m.throttle && m.stick) {
    if (!gridTop && m.grid.y < Math.max(bottom(m.throttle), bottom(m.stick))) failures.push("the chip grid is not below the controls");
    if (gridTop && bottom(m.grid) > Math.min(m.stick.y, m.yaw?.y ?? Infinity)) failures.push("the chip grid is not above the controls");
  }
  if (!gridTop && m.yaw && m.brake && m.brake.y <= m.yaw.y) failures.push("the brake is not below yaw");
  if (gridTop && m.yaw && m.brake && m.brake.y >= m.yaw.y) failures.push("the brake is not above yaw with the grid on top");
  if (m.yaw && m.throttle && centre(m.throttle) <= centre(m.yaw)) failures.push("the throttle is not right of yaw");
  if (m.yaw && m.stick && m.yaw.h > m.stick.h) failures.push("the yaw pad outweighs the pitch/roll stick");
  // YAW and its value sit either side of the track, not in a row above it: the
  // box is only as tall as the track, plus its border.
  if (m.yawTrack && m.yawLabel && m.yawValue) {
    const middle = b => b.y + b.h / 2;
    const beside = b => middle(b) >= m.yawTrack.y && middle(b) <= bottom(m.yawTrack);
    if (!(m.yawLabel.x + m.yawLabel.w <= m.yawTrack.x && beside(m.yawLabel))) failures.push("the YAW label is not left of its slider");
    if (!(m.yawValue.x >= m.yawTrack.x + m.yawTrack.w && beside(m.yawValue))) failures.push("the yaw value is not right of its slider");
    if (m.yaw.h > m.yawTrack.h + 4) failures.push(`the yaw box is ${m.yaw.h} tall around a ${m.yawTrack.h} track`);
  }
  // The camera trackpad holds the slot the desktop HUD gives its engine monitor.
  if (!m.camera) failures.push("no camera pad");
  else {
    if (m.yaw && m.camera.y <= m.yaw.y) failures.push("the camera pad is not below yaw");
    if (m.throttle && centre(m.throttle) <= centre(m.camera)) failures.push("the throttle is not right of the camera pad");
    if (m.camera.w < 96 || m.camera.h < 96) failures.push(`camera pad is ${m.camera.w}x${m.camera.h}; too small to aim with`);
    // Cockpit/chase is a switch in the pad's top-left corner, with the pad's
    // label under it rather than behind it.
    if (!m.viewSwitch) failures.push("no cockpit/chase switch");
    else {
      if (m.viewSwitch.x - m.camera.x > 12 || m.viewSwitch.y - m.camera.y > 12 || m.viewSwitch.x < m.camera.x || m.viewSwitch.y < m.camera.y) {
        failures.push("the cockpit/chase switch is not in the camera pad's top-left corner");
      }
      if (m.cameraLabel && m.cameraLabel.y < bottom(m.viewSwitch)) failures.push("the CAMERA label is not under the view switch");
    }
  }
  // The desktop's engine widget, just above the throttle: top right in
  // landscape, centre right in portrait. The rendered host sends an engine.
  if (!m.engine) failures.push("no engine widget");
  else if (m.throttle) {
    const right = b => b.x + b.w;
    if (bottom(m.engine) > m.throttle.y + 1) failures.push("the engine widget is not above the throttle");
    if (Math.abs(right(m.engine) - right(m.throttle)) > 2) failures.push("the engine widget is not over the throttle");
    if (m.yaw && centre(m.engine) <= centre(m.yaw)) failures.push("the engine widget is not right of yaw");
    // It notches into the camera pad instead of widening its column or
    // deepening its row: sliders as thick as the widget were the bug.
    if (m.throttle.w >= m.engine.w) failures.push(`the throttle is ${m.throttle.w} wide, stretched to the engine widget`);
    if (m.yaw && bottom(m.yaw) >= bottom(m.engine)) failures.push("yaw is stretched to the engine widget's height");
    if (m.camera && !(m.camera.y < bottom(m.engine) && right(m.camera) > m.engine.x)) {
      failures.push("the camera pad does not reach in beside the engine widget");
    }
  }
  return { share, failures };
}

const profile = mkdtempSync(path.join(OUT, "chrome-"));
const chrome = await openHeadlessChrome(profile);
let failed = 0;
try {
  for (const page of PAGES) {
    const html = readFileSync(path.join(OUT, `${page}.html`), "utf8");
    for (const size of SIZES) {
      const { targetId } = await chrome.send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await chrome.send("Target.attachToTarget", { targetId, flatten: true });
      await chrome.send("Runtime.enable", {}, sessionId);
      await chrome.send("Page.enable", {}, sessionId);
      await chrome.send("Emulation.setDeviceMetricsOverride",
        { width: size.width, height: size.height, deviceScaleFactor: 2, mobile: true }, sessionId);
      await chrome.send("Page.setDocumentContent", { frameId: targetId, html }, sessionId);
      // Let fonts and the grid settle before measuring.
      await new Promise(resolve => setTimeout(resolve, 300));
      const label = `${page} ${size.name} ${size.width}x${size.height}`;
      if (CHECKED.has(page)) {
        const measured = JSON.parse(await evaluate(chrome, sessionId, MEASURE));
        const { share, failures } = check(measured, { gridTop: GRID_TOP.has(page), controlPopup: CONTROL_POPUP.has(page) });
        const stick = measured.stick ? `${measured.stick.w}x${measured.stick.h}` : "none";
        const camera = measured.camera ? `${measured.camera.w}x${measured.camera.h}` : "none";
        console.log(`${failures.length ? "FAIL" : "ok  "} ${label.padEnd(30)} `
          + `page ${measured.scrollHeight}/${measured.viewport}  controls ${String(share).padStart(2)}%`
          + `  chrome ${String(Math.round((measured.chromeHeight / measured.appHeight) * 100)).padStart(2)}%`
          + `  stick ${stick}  camera ${camera}`);
        for (const failure of failures) console.log(`       - ${failure}`);
        failed += failures.length;
      } else {
        console.log(`${page === "flight-hud" ? "ref " : "shot"} ${label}`);
      }
      const shot = await chrome.send("Page.captureScreenshot",
        { format: "png", captureBeyondViewport: true }, sessionId);
      writeFileSync(path.join(OUT, `${page}-${size.name}.png`), Buffer.from(shot.data, "base64"));
      // After the screenshot, because it lengthens the timeline and scrolls.
      if (SHEET_OPEN.has(page)) {
        const failure = await sheetScrolls(chrome, sessionId);
        if (failure) {
          console.log(`FAIL ${label.padEnd(30)} sheet\n       - ${failure}`);
          failed += 1;
        }
      }
      await chrome.send("Target.closeTarget", { targetId });
    }
  }
} finally {
  await chrome.close();
  // Chrome keeps writing to its profile for a moment after Browser.close.
  rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  if (!process.argv.includes("--keep-html")) {
    for (const page of PAGES) rmSync(path.join(OUT, `${page}.html`), { force: true });
  }
}

// A stable path for "the newest run", without hiding the dated history.
try {
  rmSync(path.join(BASE, "latest"), { force: true, recursive: false });
  symlinkSync(BUILD_ID, path.join(BASE, "latest"), "dir");
} catch { /* A symlink is a convenience, not a requirement. */ }
console.log(`\nScreenshots in build/phone-layout/${BUILD_ID}/  (also build/phone-layout/latest/)`);
if (failed > 0) {
  console.error(`${failed} layout rule${failed === 1 ? "" : "s"} broken.`);
  process.exitCode = 1;
}
