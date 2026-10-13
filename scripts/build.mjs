// Builds the site into dist/: the landing page at / from this repository, and
// the flight at /fly/ and the phone controller at /rc/ from fly's build, which
// is copied from ../fly/dist, so build that first (README).
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_URL = "https://0sfs.github.io/";
const siteRoot = fileURLToPath(new URL("../", import.meta.url));

/**
 * @param {{ site?: string, fly?: string, out?: string, base?: string }} [options]
 *   site: this repository; fly: fly's dist/; out: where the site goes; base:
 *   the path the site is served from, which fly's build must have been made for.
 */
export async function buildSite({ site = siteRoot, fly = path.join(site, "..", "fly", "dist"), out = path.join(site, "dist"), base = "/" } = {}) {
  if (!/^\/(?:[\w.-]+\/)*$/.test(base)) throw new Error(`The base ${base} is not a path that starts and ends with /.`);
  const flightPage = await readFile(path.join(fly, "fly", "index.html"), "utf8").catch(() => null);
  if (flightPage === null || !existsSync(path.join(fly, "rc", "index.html"))) {
    throw new Error(`No flight build in ${fly}: run npm run build in fly first.`);
  }
  if (!flightPage.includes(`="${base}assets/`)) {
    throw new Error(`The flight build in ${fly} is not for ${base === "/" ? "the site's root" : base}: build it for base ${base}.`);
  }

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  // fly's own index.html is its root page, which this site's landing page
  // replaces. Dotfiles stay out: the old gh-pages deploy published none, and
  // a .gitignore would keep the files it names out of the deploy's commit.
  await cp(fly, out, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(fly, source);
      return relative !== "index.html" && !relative.split(path.sep).some((part) => part.startsWith("."));
    },
  });

  const own = [
    ["index.html", "index.html"],
    ["landing.css", "landing.css"],
    ...(await readdir(path.join(site, "public"))).filter((name) => !name.startsWith(".")).map((name) => [path.join("public", name), name]),
  ];
  for (const [from, to] of own) {
    if (existsSync(path.join(out, to))) throw new Error(`The flight build also has ${to}; the site cannot serve both.`);
    await cp(path.join(site, from), path.join(out, to), { recursive: true });
  }

  const landing = await readFile(path.join(out, "index.html"), "utf8");
  checkReferences(landing, out);
  checkAircraft(landing, await flightScripts(out));
  return { out, flight: flightBuiltFrom(flightPage) };
}

/**
 * The fly commit a flight page was built from, as its build records it:
 * `{ commit, dirty, unpushed }`, or null when the page does not say.
 */
export function flightBuiltFrom(flightPage) {
  const json = /<script type="application\/json" id="foss-earth-built-from">([\s\S]*?)<\/script>/.exec(flightPage)?.[1];
  if (!json) return null;
  const { app } = JSON.parse(json);
  return app?.commit ? { commit: app.commit, dirty: Boolean(app.dirty), unpushed: Boolean(app.unpushed) } : null;
}

/** Every file the landing page links on this site is in it. */
export function checkReferences(landing, out) {
  const references = [
    ...[...landing.matchAll(/\s(?:src|href)="([^"]+)"/g)].map(([, value]) => value),
    ...[...landing.matchAll(/\scontent="([^"]+)"/g)].map(([, value]) => value).filter((value) => value.startsWith(SITE_URL)),
  ];
  const missing = [];
  for (const reference of references) {
    let relative;
    if (reference.startsWith(SITE_URL)) relative = reference.slice(SITE_URL.length);
    else if (/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(reference)) continue;
    else relative = reference.replace(/^\//, "");
    relative = relative.replace(/[?#].*$/, "");
    const file = path.join(out, relative === "" || relative.endsWith("/") ? path.join(relative, "index.html") : relative);
    if (!existsSync(file)) missing.push(reference);
  }
  if (missing.length) throw new Error(`The landing page links files the site does not have: ${missing.join(", ")}`);
}

async function flightScripts(out) {
  const assets = path.join(out, "assets");
  const names = (await readdir(assets)).filter((name) => /\.m?js$/.test(name));
  return Promise.all(names.map(async (name) => ({ name, code: await readFile(path.join(assets, name), "utf8") })));
}

const decode = (text) => text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[name]);

/**
 * The landing page's aircraft are the flight's aircraft families, in its
 * catalogue's order, with its names, summaries and notes. The flight build is
 * the catalogue as shipped: each family names its thumbnail, and the module
 * that lists the families has them in order.
 */
export function checkAircraft(landing, scripts) {
  const cards = [...landing.matchAll(/<article>\s*<img src="([^"]+)"[^>]*>\s*<h3>([^<]*)<\/h3>\s*<p>([^<]*)<\/p>(?:\s*<p class="info-page__note">([^<]*)<\/p>)?\s*<\/article>/g)]
    .map(([, thumbnail, label, summary, note]) => ({ thumbnail, label: decode(label), summary: decode(summary), note: note === undefined ? undefined : decode(note) }));
  if (cards.length === 0) throw new Error("The landing page lists no aircraft.");
  const shipped = new Set(scripts.flatMap(({ code }) => code.match(/aircraft\/thumbnails\/[\w.-]+\.png/g) ?? []));
  const listed = new Set(cards.map((card) => card.thumbnail));
  const unlisted = [...shipped].filter((thumbnail) => !listed.has(thumbnail));
  const unshipped = [...listed].filter((thumbnail) => !shipped.has(thumbnail));
  if (unlisted.length) throw new Error(`The flight has aircraft the landing page does not list: ${unlisted.join(", ")}`);
  if (unshipped.length) throw new Error(`The landing page lists aircraft the flight does not have: ${unshipped.join(", ")}`);

  const catalogue = scripts.find(({ code }) => cards.every((card) => code.includes(card.thumbnail)));
  if (!catalogue) throw new Error("No script in the flight build lists every aircraft family.");
  const order = [...cards].sort((a, b) => catalogue.code.indexOf(a.thumbnail) - catalogue.code.indexOf(b.thumbnail));
  if (order.some((card, index) => card !== cards[index])) {
    throw new Error(`The landing page lists the aircraft as ${cards.map((card) => card.label).join(", ")}; the flight's catalogue has ${order.map((card) => card.label).join(", ")}.`);
  }
  const code = scripts.map((script) => script.code).join("\n");
  const shipsText = (text) => code.includes(text) || code.includes(JSON.stringify(text).slice(1, -1));
  for (const card of cards) {
    for (const text of [card.label, card.summary, card.note]) {
      if (text !== undefined && !shipsText(text)) throw new Error(`The flight build does not say "${text}" (${card.thumbnail}).`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => !arg.startsWith("--base="))) throw new Error("Usage: node scripts/build.mjs [--base=/repo/]");
  const base = args.find((arg) => arg.startsWith("--base="))?.slice("--base=".length);
  const { out, flight } = await buildSite({ base });
  const state = !flight ? "an unrecorded commit" : `${flight.commit.slice(0, 7)}${flight.dirty ? " with uncommitted changes" : flight.unpushed ? " (not pushed)" : ""}`;
  console.log(`Built ${path.relative(process.cwd(), out) || "."} with the flight from fly ${state}.`);
}
