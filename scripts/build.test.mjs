import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { buildSite, checkAircraft, checkReferences, flightBuiltFrom, landingFiles } from "./build.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const scratch = path.join(root, "build", "test", `build-${process.pid}`);
const LANDING = readFileSync(path.join(root, "index.html"), "utf8");

const CARDS = `
  <article>
    <img src="aircraft/thumbnails/trainer.png" alt="" width="640" height="360" />
    <h3>Trainer</h3>
    <p>High wing.</p>
  </article>
  <article>
    <img src="aircraft/thumbnails/jet.png" alt="" width="640" height="360" />
    <h3>Jet</h3>
    <p>Fast &amp; light.</p>
    <p class="info-page__note">Experimental.</p>
  </article>`;
const CATALOGUE = `const families=[{id:"trainer",label:"Trainer",summary:"High wing.",thumbnail:{path:"aircraft/thumbnails/trainer.png"}},`
  + `{id:"jet",label:"Jet",summary:"Fast & light.",developmentNote:"Experimental.",thumbnail:{path:"aircraft/thumbnails/jet.png"}}];`;
const BUILT_FROM = `<script type="application/json" id="foss-earth-built-from">{"app":{"commit":"0123456789abcdef","dirty":false,"unpushed":true}}</script>`;

async function write(file, text = "") {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

/** A site and a flight build like the real ones, small. */
async function fixture(name, { flightPage, extraFly = {}, landing } = {}) {
  const base = path.join(scratch, name);
  const site = path.join(base, "site");
  const fly = path.join(base, "fly-dist");
  await write(path.join(site, "index.html"), landing ?? `<link rel="icon" href="favicon.svg" /><link rel="stylesheet" href="landing.css" />
    <meta property="og:image" content="https://0sfs.github.io/preview.jpg" /><a href="fly/">Start</a><a href="#main">Skip</a>
    <a href="https://github.com/0SFS">Source</a>${CARDS}`);
  await write(path.join(site, "landing.css"), ".info-page {}");
  await write(path.join(site, "public", "preview.jpg"), "jpg");
  await write(path.join(site, "public", "robots.txt"), "User-agent: *");
  const files = {
    "index.html": "fly's own root page",
    "fly/index.html": flightPage ?? `<head>${BUILT_FROM}<script type="module" src="/assets/index-abc.js"></script></head>`,
    "rc/index.html": `<script type="module" src="/assets/index-abc.js"></script>`,
    "assets/index-abc.js": "import('./createFlightSimApp-def.js')",
    "assets/createFlightSimApp-def.js": CATALOGUE,
    "aircraft/thumbnails/trainer.png": "png",
    "aircraft/thumbnails/jet.png": "png",
    "favicon.svg": "<svg/>",
    ".gitignore": "aircraft/thumbnails/jet.png",
    "jsbsim-data/aircraft/jet/.gitattributes": "* text=auto",
    "jsbsim-data/aircraft/jet/jet.xml": "<fdm_config/>",
    ...extraFly,
  };
  for (const [file, text] of Object.entries(files)) await write(path.join(fly, file), text);
  return { site, fly, out: path.join(base, "dist") };
}

function filesUnder(folder, prefix = "") {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? filesUnder(path.join(folder, entry.name), `${prefix}${entry.name}/`)
    : [`${prefix}${entry.name}`]).sort();
}

before(async () => {
  await rm(scratch, { recursive: true, force: true });
});

after(async () => {
  await rm(scratch, { recursive: true, force: true });
  const parent = path.dirname(scratch);
  if (existsSync(parent) && (await readdir(parent)).length === 0) await rm(parent, { recursive: true });
});

describe("buildSite", () => {
  it("serves the landing page at / and fly's build everywhere else, without dotfiles", async () => {
    const { site, fly, out } = await fixture("assembles");
    const { flight, landing } = await buildSite({ site, fly, out });
    assert.deepEqual(filesUnder(out), [
      "aircraft/thumbnails/jet.png",
      "aircraft/thumbnails/trainer.png",
      "assets/createFlightSimApp-def.js",
      "assets/index-abc.js",
      "favicon.svg",
      "fly/index.html",
      "index.html",
      "jsbsim-data/aircraft/jet/jet.xml",
      "landing.css",
      "preview.jpg",
      "rc/index.html",
      "robots.txt",
    ]);
    assert.equal(readFileSync(path.join(out, "index.html"), "utf8"), readFileSync(path.join(site, "index.html"), "utf8"));
    assert.deepEqual(flight, { commit: "0123456789abcdef", dirty: false, unpushed: true });
    assert.deepEqual(landing, ["index.html", "landing.css", "preview.jpg", "robots.txt"]);
  });

  it("rebuilds a published site with either part from elsewhere", async () => {
    const { site, fly, out } = await fixture("published");
    const published = path.join(scratch, "published", "gh-pages");
    await buildSite({ site, fly, out: published });
    await write(path.join(published, ".landing.json"), "{}");
    await write(path.join(site, "landing.css"), ".info-page { color: red }");

    // The flight as published, with this checkout's landing page.
    const names = await landingFiles(site);
    const flight = path.join(scratch, "published", "flight");
    await cp(published, flight, { recursive: true });
    for (const [, name] of names) await rm(path.join(flight, name));
    await buildSite({ site, fly: flight, out });
    assert.deepEqual(filesUnder(out), filesUnder(published).filter((name) => name !== ".landing.json"));
    assert.equal(readFileSync(path.join(out, "landing.css"), "utf8"), ".info-page { color: red }");

    // The landing page as published, with fly's build.
    await write(path.join(fly, "assets", "added.js"), "");
    const { landing } = await buildSite({ landing: names.map(([, name]) => [path.join(published, name), name]), fly, out });
    assert.deepEqual(landing, names.map(([, name]) => name));
    assert.equal(readFileSync(path.join(out, "landing.css"), "utf8"), ".info-page {}");
    assert.equal(existsSync(path.join(out, "assets", "added.js")), true);
  });

  it("starts from an empty dist/ each time", async () => {
    const { site, fly, out } = await fixture("fresh");
    await write(path.join(out, "stale.js"), "old");
    await buildSite({ site, fly, out });
    assert.equal(existsSync(path.join(out, "stale.js")), false);
  });

  it("needs fly's build", async () => {
    const { site, out } = await fixture("no-flight");
    await assert.rejects(buildSite({ site, fly: path.join(scratch, "missing"), out }), /No flight build .*run npm run build in fly first/);
  });

  it("needs a flight built for the site's root", async () => {
    const { site, fly, out } = await fixture("other-base", { flightPage: `<script type="module" src="/fork/assets/index-abc.js"></script>` });
    await assert.rejects(buildSite({ site, fly, out }), /not for the site's root/);
  });

  it("builds a fork served from a path, with a flight built for that path", async () => {
    const { site, fly, out } = await fixture("fork-base", { flightPage: `<script type="module" src="/fork/assets/index-abc.js"></script>` });
    await buildSite({ site, fly, out, base: "/fork/" });
    assert.equal(existsSync(path.join(out, "fly", "index.html")), true);
    await assert.rejects(buildSite({ site, fly, out, base: "/other/" }), /not for \/other\//);
    await assert.rejects(buildSite({ site, fly, out, base: "fork" }), /not a path that starts and ends with \//);
  });

  it("refuses a file both the site and the flight build have", async () => {
    const { site, fly, out } = await fixture("collision", { extraFly: { "robots.txt": "fly's" } });
    await assert.rejects(buildSite({ site, fly, out }), /The flight build also has robots\.txt/);
  });

  it("refuses a landing page that links a file the site lacks", async () => {
    const { site, fly, out } = await fixture("missing-file", { landing: `<img src="images/gone.png" />${CARDS}` });
    await assert.rejects(buildSite({ site, fly, out }), /links files the site does not have: images\/gone\.png/);
  });
});

describe("checkReferences", () => {
  it("follows relative links, root links and the site's own absolute URLs, and nothing else", async () => {
    const out = path.join(scratch, "references");
    await write(path.join(out, "index.html"));
    await write(path.join(out, "fly", "index.html"));
    await write(path.join(out, "preview.jpg"));
    checkReferences(`<a href="fly/?renderer=webgl2#x"></a><a href="#main"></a><a href="https://github.com/0SFS"></a>
      <link rel="canonical" href="https://0sfs.github.io/" /><meta name="theme-color" content="#080e14" /><meta content="yes" />
      <meta property="og:image" content="https://0sfs.github.io/preview.jpg" />`, out);
    assert.throws(() => checkReferences(`<a href="/rc/"></a>`, out), /\/rc\//);
    assert.throws(() => checkReferences(`<meta content="https://0sfs.github.io/card.png" />`, out), /card\.png/);
  });
});

describe("checkAircraft", () => {
  const scripts = [{ name: "index-abc.js", code: "start()" }, { name: "createFlightSimApp-def.js", code: CATALOGUE }];

  it("accepts the flight's families, in its order, with its words", () => {
    checkAircraft(CARDS, scripts);
  });

  it("refuses a family the landing page leaves out", () => {
    const only = CARDS.slice(0, CARDS.indexOf("<article>", 10));
    assert.throws(() => checkAircraft(only, scripts), /does not list: aircraft\/thumbnails\/jet\.png/);
  });

  it("refuses a family the flight does not have", () => {
    const extra = `${CARDS}<article><img src="aircraft/thumbnails/glider.png" /><h3>Glider</h3><p>Quiet.</p></article>`;
    assert.throws(() => checkAircraft(extra, scripts), /flight does not have: aircraft\/thumbnails\/glider\.png/);
  });

  it("refuses the families in another order", () => {
    const [first, second] = CARDS.split(/(?=\s*<article>)/).filter((part) => part.trim());
    assert.throws(() => checkAircraft(second + first, scripts), /lists the aircraft as Jet, Trainer; the flight's catalogue has Trainer, Jet/);
  });

  it("refuses words the flight does not use", () => {
    assert.throws(() => checkAircraft(CARDS.replace("High wing.", "Low wing."), scripts), /does not say "Low wing\."/);
    assert.throws(() => checkAircraft(CARDS.replace("Experimental.", "Validated."), scripts), /does not say "Validated\."/);
  });

  it("reads escaped words in the build", () => {
    const escaped = [{ name: "catalogue.js", code: CATALOGUE.replace('"Jet"', '"Jet \\"J\\""') }];
    checkAircraft(CARDS.replace("<h3>Jet</h3>", "<h3>Jet &quot;J&quot;</h3>"), escaped);
  });
});

describe("flightBuiltFrom", () => {
  it("reads the fly commit the flight page records", () => {
    assert.deepEqual(flightBuiltFrom(BUILT_FROM), { commit: "0123456789abcdef", dirty: false, unpushed: true });
    assert.equal(flightBuiltFrom("<head></head>"), null);
  });
});

describe("the landing page", () => {
  const [redirect, start] = [...LANDING.matchAll(/<script>\s*([\s\S]*?)<\/script>/g)].map(([, code]) => code);

  /** Runs the head's redirect at `href`; returns where it sent the browser, if anywhere. */
  function redirectFrom(href) {
    const url = new URL(href);
    let to;
    runInNewContext(redirect, { location: { href, search: url.search, hash: url.hash, replace: (next) => { to = next; } }, URL, URLSearchParams });
    return to;
  }

  /** Runs the Start link's script at `href`; returns the link it made. */
  function startFrom(href) {
    const url = new URL(href);
    let link;
    const document = { querySelector: (selector) => (selector === ".info-page__start" ? { setAttribute: (name, value) => { if (name === "href") link = value; } } : null) };
    runInNewContext(start, { document, location: { href, search: url.search, hash: url.hash }, URL, URLSearchParams });
    return link;
  }

  it("has its two inline scripts", () => {
    assert.match(redirect, /location\.replace/);
    assert.match(start, /info-page__start/);
  });

  for (const [href, to] of [
    ["https://0sfs.github.io/?mode=flight&renderer=webgl2#view", "/fly/?renderer=webgl2#view"],
    ["https://0sfs.github.io/?mode=remote#v=1&peer=desktop&join=secret", "/rc/#v=1&peer=desktop&join=secret"],
    ["https://0sfs.github.io/?mode=globe", "https://foss-earth.github.io/"],
    ["https://example.test/fork/?mode=flight", "/fork/fly/"],
    ["https://0sfs.github.io/", undefined],
    ["https://0sfs.github.io/?mode=unknown&renderer=webgl2", undefined],
  ]) {
    it(`sends the old link ${href} to ${to ?? "nowhere"}`, () => {
      assert.equal(redirectFrom(href), to);
    });
  }

  for (const [href, link] of [
    ["https://0sfs.github.io/", "/fly/"],
    ["https://0sfs.github.io/?renderer=webgl2", "/fly/?renderer=webgl2"],
    ["https://0sfs.github.io/?mode=unknown&renderer=webgl2#view", "/fly/?renderer=webgl2#view"],
    ["https://example.test/fork/?renderer=webgl2", "/fork/fly/?renderer=webgl2"],
  ]) {
    it(`at ${href}, starts the flight at ${link}`, () => {
      assert.equal(startFrom(href), link);
    });
  }

  it("links documents that are in the 0SFS checkouts beside this one", () => {
    const org = path.join(root, "..");
    const checkouts = new Map(readdirSync(org).map((name) => [name.toLowerCase(), name]));
    const links = [...LANDING.matchAll(/href="https:\/\/github\.com\/0SFS\/([^/"]+)\/blob\/main\/([^"#?]+)"/g)];
    assert.ok(links.length >= 10);
    const missing = links
      .map(([, repo, file]) => [repo, file, checkouts.get(repo.toLowerCase())])
      .filter(([, file, checkout]) => !checkout || !existsSync(path.join(org, checkout, file)))
      .map(([repo, file]) => `${repo}/${file}`);
    assert.deepEqual(missing, []);
  });
});
