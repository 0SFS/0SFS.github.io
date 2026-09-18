// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { appRouteFrom, FOSS_EARTH_URL } from "./appRoute";

/*
 * The inline boot script in `index.html` resolves the route before any bundle
 * downloads, and it is a hand-written copy of `appRoute.ts`. These run that
 * script itself, against the head it runs in, so neither can drift unseen.
 */
const INDEX_HTML = readFileSync("index.html", "utf8");
const HEAD = INDEX_HTML.slice(INDEX_HTML.indexOf("<head>") + "<head>".length, INDEX_HTML.indexOf("<script>"));
const BOOT_SCRIPT = /<script>\s*(\(function \(\) \{[\s\S]*?\}\)\(\);)\s*<\/script>/.exec(INDEX_HTML)?.[1] ?? "";

function readManifest(file: string): { short_name: string; start_url: string; scope: string } {
  return JSON.parse(readFileSync(`public/${file}`, "utf8"));
}

/** What the page's head says after the boot script has run at `href`. */
function boot(href: string, base = "/") {
  document.head.innerHTML = HEAD.replaceAll("%BASE_URL%", base);
  document.documentElement.removeAttribute("data-route");
  const url = new URL(href);
  const location = { origin: url.origin, pathname: url.pathname, search: url.search, hash: url.hash, replace: vi.fn() };
  runInNewContext(BOOT_SCRIPT.replaceAll("%BASE_URL%", base), { document, location, URL, URLSearchParams });
  return {
    route: document.documentElement.getAttribute("data-route"),
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href"),
    title: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute("content"),
    themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
    redirect: location.replace.mock.calls[0]?.[0] as string | undefined,
  };
}

describe("index.html boot script", () => {
  it("is found in index.html", () => {
    expect(BOOT_SCRIPT).toContain('setAttribute("data-route", route)');
  });

  it.each([
    "https://0sfs.github.io/",
    "https://0sfs.github.io/?mode=unknown",
    "https://0sfs.github.io/fly",
    "https://0sfs.github.io/fly/",
    "https://0sfs.github.io/?mode=flight&renderer=webgl2",
    "https://0sfs.github.io/rc",
    "https://0sfs.github.io/rc/",
    "https://0sfs.github.io/?mode=remote#v=1&peer=desktop&join=secret",
    "https://0sfs.github.io/fly/?mode=remote",
  ])("resolves %s to the route appRouteFrom does", (href) => {
    expect(boot(href).route).toBe(appRouteFrom(new URL(href), "/"));
  });

  it("sends ?mode=globe to the FOSS Earth site", () => {
    expect(boot("https://0sfs.github.io/?mode=globe").redirect).toBe(FOSS_EARTH_URL);
  });
});

describe("Add to Home Screen", () => {
  it.each([
    ["https://0sfs.github.io/", "/", "/manifest.webmanifest", "OSFS"],
    ["https://0sfs.github.io/fly/", "/", "/manifest.webmanifest", "OSFS"],
    ["https://0sfs.github.io/rc/", "/", "/rc.webmanifest", "OSFS RC"],
    ["https://0sfs.github.io/?mode=remote#v=1&peer=d&join=s", "/", "/rc.webmanifest", "OSFS RC"],
    ["https://example.test/repo/fly/", "/repo/", "/repo/manifest.webmanifest", "OSFS"],
    ["https://example.test/repo/rc/", "/repo/", "/repo/rc.webmanifest", "OSFS RC"],
  ])("%s (base %s) links %s, named %s", (href, base, manifest, title) => {
    expect(boot(href, base)).toMatchObject({ manifest, title });
  });

  it.each([
    ["https://0sfs.github.io/fly/", "/", "/fly/"],
    ["https://0sfs.github.io/rc/", "/", "/rc/"],
    ["https://example.test/repo/fly/", "/repo/", "/repo/fly/"],
    ["https://example.test/repo/rc/", "/repo/", "/repo/rc/"],
  ])("an icon made on %s (base %s) opens %s", (href, base, opens) => {
    // start_url and scope resolve against the manifest's own address, as a browser does.
    const manifestUrl = new URL(boot(href, base).manifest!, href);
    const manifest = readManifest(manifestUrl.pathname.slice(base.length));
    expect(new URL(manifest.start_url, manifestUrl).pathname).toBe(opens);
    expect(opens.startsWith(new URL(manifest.scope, manifestUrl).pathname)).toBe(true);
  });

  it("gives the two icons different names, and the same name on either platform", () => {
    const flight = readManifest("manifest.webmanifest");
    const controller = readManifest("rc.webmanifest");
    expect(controller.short_name).not.toBe(flight.short_name);
    // iOS labels the icon from the meta tag, Android from the manifest.
    expect(boot("https://0sfs.github.io/fly/").title).toBe(flight.short_name);
    expect(boot("https://0sfs.github.io/rc/").title).toBe(controller.short_name);
  });
});

describe("theme-color", () => {
  it.each([
    ["https://0sfs.github.io/", "#080e14"],
    ["https://0sfs.github.io/fly/", "#04060a"],
    ["https://0sfs.github.io/?mode=flight", "#04060a"],
    ["https://0sfs.github.io/rc/", "#000"],
  ])("%s tints the browser bars %s", (href, color) => {
    expect(boot(href).themeColor).toBe(color);
  });

  // Safari paints its bars in this colour, so it has to be the page's own.
  it.each([
    ["https://0sfs.github.io/fly/", "src/styles/flight.css", ".flight-app"],
    ["https://0sfs.github.io/rc/", "src/remote/phone.css", "body"],
  ])("%s matches the background %s gives %s", (href, file, selector) => {
    const rule = new RegExp(`^${selector.replace(".", "\\.")} \\{([^}]*)\\}`, "m").exec(readFileSync(file, "utf8"))?.[1];
    expect(/\bbackground: (#[0-9a-f]+);/.exec(rule ?? "")?.[1]).toBe(boot(href).themeColor);
  });
});
