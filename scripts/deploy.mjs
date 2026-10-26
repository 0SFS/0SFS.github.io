// Builds the site, checks it, and publishes it to the gh-pages branch, which
// GitHub Pages serves at https://0sfs.github.io/: the landing page by default,
// or the flight or both when explicitly selected, keeping the other part as
// gh-pages has it.
// Everything else on the branch is replaced. Uncommitted or unpushed changes
// require confirmation after warnings; the deploy names the flight's base
// commit. A part gh-pages already has as it is here is kept, not built again:
// the flight when it was built from what fly would build now (About's rebuildReason), the
// landing page when its files have not changed since the commit .landing.json
// names. See docs/deploying.md.
//
// Usage: node scripts/deploy.mjs [landing|flight|all] [--force]
//   Defaults to landing. --force applies only to the selected part or parts.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSite, landingFiles } from "./build.mjs";

const args = process.argv.slice(2);
const force = args.includes("--force");
const parts = args.filter((arg) => arg !== "--force");
let part = parts[0] ?? "landing";
if (parts.length > 1 || !["landing", "flight", "all"].includes(part)) {
  throw new Error("Usage: node scripts/deploy.mjs [landing|flight|all] [--force] (default: landing)");
}
const root = fileURLToPath(new URL("../", import.meta.url));
const pages = `${root}build/gh-pages`;
const record = `${pages}/.landing.json`;
const flyRoot = `${root}../fly`;
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
let needsConfirmation = false;
const warn = (message) => {
  console.warn(`Warning: ${message}`);
  needsConfirmation = true;
};

async function confirmDeployment() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.warn("Confirmation requires an interactive terminal.");
    return false;
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const controller = new AbortController();
  prompt.once("close", () => controller.abort());
  prompt.once("SIGINT", () => controller.abort());
  try {
    const answer = await prompt.question("Publish to gh-pages despite the warnings above? [y/N] ", { signal: controller.signal });
    return /^(y|yes)$/i.test(answer.trim());
  } catch (error) {
    if (error.name !== "AbortError" && error.code !== "ERR_USE_AFTER_CLOSE") throw error;
    return false;
  } finally {
    prompt.close();
  }
}

/** A file as gh-pages has it, or null. */
const publishedFile = (name) => {
  try {
    return execFileSync("git", ["show", `origin/gh-pages:${name}`], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
};

if (part !== "flight" && git(root, "status", "--porcelain")) {
  warn("This repository has uncommitted changes. The deployment will include the local landing page files.");
}
git(root, "fetch", "--no-tags", "origin", "gh-pages");
let flightChanged = part !== "landing";
let landingChanged = part !== "flight";
if (flightChanged) {
  // What the flight is built from, in fly's deployed-from.json, so new code in a
  // checkout fly is built from is a new version of the flight (FOSS Earth About's
  // record, from the FOSS Earth checkout fly links).
  const { rebuildReason, recordBuildInputs } = await import(pathToFileURL(createRequire(`${flyRoot}/package.json`).resolve("foss-earth/vite")).href);
  const inputs = recordBuildInputs({ root: flyRoot });
  const why = force ? "asked to with --force" : rebuildReason({ root: flyRoot, page: publishedFile("fly/index.html"), inputs });
  if (why) {
    console.log(`Building the flight: ${why}.`);
    execFileSync("npm", ["run", "build"], { cwd: flyRoot, stdio: "inherit" });
  } else {
    console.log("gh-pages has the flight as fly would build it now: keeping it.");
    flightChanged = false;
  }
}
if (landingChanged && !force) {
  // The landing page's sources, unchanged since the commit gh-pages' landing page is from.
  // A folder, so a file gone from public/ is a change too (landingFiles).
  const previous = JSON.parse(publishedFile(".landing.json") ?? "{}");
  const since = previous.commit;
  let unchanged = false;
  try {
    // A commit alone cannot identify local edits, including untracked public files,
    // or a previously deployed landing page that included uncommitted changes.
    if (since && !previous.dirty && !git(root, "status", "--porcelain", "--", "index.html", "landing.css", "public")) {
      execFileSync("git", ["diff", "--quiet", since, "HEAD", "--", "index.html", "landing.css", "public"], { cwd: root, stdio: "ignore" });
      unchanged = true;
    }
  } catch {
    // Changed, or from a commit this checkout does not have.
  }
  if (unchanged) {
    console.log(`gh-pages has the landing page as it is here, from ${since.slice(0, 7)}: keeping it.`);
    landingChanged = false;
  }
}
if (!flightChanged && !landingChanged) {
  console.log("gh-pages already has this site: nothing to build or publish.");
  process.exit(0);
}
part = flightChanged && landingChanged ? "all" : flightChanged ? "flight" : "landing";

if (existsSync(pages)) git(root, "worktree", "remove", "--force", pages);
git(root, "worktree", "add", "--detach", pages, "origin/gh-pages");
// The landing page's files on gh-pages, as the last deploy recorded them.
// Deploys from before the record published this checkout's.
const published = await readFile(record, "utf8").then(JSON.parse, async () => ({
  files: (await landingFiles()).map(([, name]) => name).filter((name) => existsSync(`${pages}/${name}`)),
}));
// The part this deploy keeps comes from gh-pages: the flight is all of it but
// the landing page's files (and dotfiles, which the build leaves out).
if (part === "landing") for (const name of published.files) await rm(`${pages}/${name}`, { recursive: true, force: true });
const { out, flight, landing } = await buildSite({
  fly: part === "landing" ? pages : undefined,
  landing: part === "flight" ? published.files.map((name) => [`${pages}/${name}`, name]) : undefined,
});
if (!flight?.commit) throw new Error("The flight build does not say which fly commit it was built from.");
if (flightChanged && (flight.dirty || flight.unpushed)) {
  const changes = [flight.dirty && "uncommitted", flight.unpushed && "unpushed"].filter(Boolean).join(" and ");
  warn(`The flight was built from fly ${flight.commit.slice(0, 7)} with ${changes} changes. That commit may not reproduce this build.`);
}
execFileSync("npm", ["run", "check"], { cwd: root, stdio: "inherit" });
if (needsConfirmation && !(await confirmDeployment())) {
  git(root, "worktree", "remove", "--force", pages);
  console.log("Deployment cancelled; gh-pages was not pushed.");
  process.exit(0);
}

for (const name of await readdir(pages)) if (name !== ".git") await rm(`${pages}/${name}`, { recursive: true, force: true });
await cp(out, pages, { recursive: true });
const site = part === "flight" ? published.commit : git(root, "rev-parse", "HEAD");
const dirty = part === "flight" ? Boolean(published.dirty)
  : Boolean(git(root, "status", "--porcelain", "--", "index.html", "landing.css", "public"));
await writeFile(record, `${JSON.stringify({ commit: site, dirty, files: landing }, null, 2)}\n`);
// No Jekyll: Pages serves the files as they are, without a build over them first.
await writeFile(`${pages}/.nojekyll`, "");

git(pages, "add", "--all");
const siteShort = site?.slice(0, 7);
const fly = flight.commit.slice(0, 7);
const deployed = part === "landing" ? `the landing page at ${siteShort}, keeping the flight at ${fly}`
  : part === "flight" ? `the flight at ${fly}, keeping the landing page${site ? ` at ${siteShort}` : ""}`
  : `the site at ${siteShort} with the flight at ${fly}`;
if (!git(pages, "status", "--porcelain")) {
  console.log("gh-pages already has this site.");
} else {
  git(pages, "commit", "--quiet", "-m", `Deploy ${deployed}`);
  git(pages, "push", "origin", "HEAD:gh-pages");
  console.log(`Deployed to gh-pages: ${deployed}.`);
}
git(root, "worktree", "remove", pages);
