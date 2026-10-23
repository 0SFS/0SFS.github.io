// Builds the site, checks it, and publishes it to the gh-pages branch, which
// GitHub Pages serves at https://0sfs.github.io/: the landing page and the
// flight together, or one of them, keeping the other as gh-pages has it.
// Everything else on the branch is replaced. Only a flight built from a clean,
// pushed fly commit is published, and the deploy names that commit. See
// docs/deploying.md.
//
// Usage: node scripts/deploy.mjs [landing|flight]
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSite, landingFiles } from "./build.mjs";

const part = process.argv[2];
if (process.argv.length > 3 || (part !== undefined && part !== "landing" && part !== "flight")) {
  throw new Error("Usage: node scripts/deploy.mjs [landing|flight]");
}
const root = fileURLToPath(new URL("../", import.meta.url));
const pages = `${root}build/gh-pages`;
const record = `${pages}/.landing.json`;
const flyRoot = `${root}../fly`;
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

if (part !== "flight" && git(root, "status", "--porcelain")) throw new Error("This repository has uncommitted changes: commit them, then deploy.");
if (part !== "landing") {
  // What the flight is built from, in fly's deployed-from.json, so new code in a
  // checkout fly is built from is a new version of the flight (FOSS Earth About's
  // record, from the FOSS Earth checkout fly links).
  const { recordBuildInputs } = await import(pathToFileURL(createRequire(`${flyRoot}/package.json`).resolve("foss-earth/vite")).href);
  recordBuildInputs({ root: flyRoot });
  execFileSync("npm", ["run", "build"], { cwd: flyRoot, stdio: "inherit" });
}

git(root, "fetch", "origin", "gh-pages");
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
if (flight.dirty || flight.unpushed) {
  throw new Error(`The flight was built from fly ${flight.commit.slice(0, 7)} with ${flight.dirty ? "uncommitted" : "unpushed"} changes. Build it from a pushed commit.`);
}
execFileSync("npm", ["run", "check"], { cwd: root, stdio: "inherit" });

for (const name of await readdir(pages)) if (name !== ".git") await rm(`${pages}/${name}`, { recursive: true, force: true });
await cp(out, pages, { recursive: true });
const site = part === "flight" ? published.commit : git(root, "rev-parse", "HEAD");
await writeFile(record, `${JSON.stringify({ commit: site, files: landing }, null, 2)}\n`);

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
