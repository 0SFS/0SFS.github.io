// Publishes dist/ to the gh-pages branch, which GitHub Pages serves at
// https://0sfs.github.io/. Everything on the branch is replaced by dist/.
// Only a flight built from a clean, pushed fly commit is published, and the
// deploy names that commit. Run npm run build first; see docs/deploying.md.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, readdir, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { flightBuiltFrom } from "./build.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = `${root}dist`;
const pages = `${root}build/gh-pages`;
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

if (!existsSync(`${dist}/index.html`) || !existsSync(`${dist}/fly/index.html`)) throw new Error("No site in dist/: run npm run build first.");
if (git(root, "status", "--porcelain")) throw new Error("This repository has uncommitted changes: commit them, then build and deploy.");
const flight = flightBuiltFrom(await readFile(`${dist}/fly/index.html`, "utf8"));
if (!flight?.commit) throw new Error("The flight build does not say which fly commit it was built from.");
if (flight.dirty || flight.unpushed) {
  throw new Error(`The flight was built from fly ${flight.commit.slice(0, 7)} with ${flight.dirty ? "uncommitted" : "unpushed"} changes. Build it from a pushed commit.`);
}

git(root, "fetch", "origin", "gh-pages");
if (existsSync(pages)) git(root, "worktree", "remove", "--force", pages);
git(root, "worktree", "add", "--detach", pages, "origin/gh-pages");
for (const name of await readdir(pages)) if (name !== ".git") await rm(`${pages}/${name}`, { recursive: true, force: true });
await cp(dist, pages, { recursive: true });

git(pages, "add", "--all");
const site = git(root, "rev-parse", "--short", "HEAD");
const fly = flight.commit.slice(0, 7);
if (!git(pages, "status", "--porcelain")) {
  console.log("gh-pages already has this site.");
} else {
  git(pages, "commit", "--quiet", "-m", `Deploy the site at ${site} with the flight at ${fly}`);
  git(pages, "push", "origin", "HEAD:gh-pages");
  console.log(`Deployed the site at ${site} with the flight at fly ${fly} to gh-pages.`);
}
git(root, "worktree", "remove", pages);
