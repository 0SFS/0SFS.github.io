# Deploying to GitHub Pages

https://0sfs.github.io/ is this repository's built site, published on its `gh-pages` branch:

- `/` is the landing page: `index.html` and `landing.css` here.
- `/fly/` is the simulator and `/rc/` is the phone controller. Both come from
  [fly](https://github.com/0SFS/fly)'s build, with the files they load.
- `robots.txt`, `sitemap.xml` and `preview.jpg` come from `public/` here.

## Deploying

Check out fly, the repositories it links and the FOSS Earth checkout beside this one, as
[fly's development guide](https://github.com/0SFS/fly/blob/main/docs/development.md) describes. Then:

```sh
cd fly
npm install
cd ../0sfs.github.io
npm run deploy
```

A minute or so later the site serves the new build. `npm run deploy` refuses to start while this
repository has uncommitted changes. Then it runs these steps, in order:

1. It records the commit of each checkout fly is built from in `fly/deployed-from.json`, and commits
   and pushes it in fly when one moved, so new code in FOSS Earth or another linked checkout is a new
   version of the flight (FOSS Earth About's record; see
   [CONTRIBUTING](https://github.com/foss-earth/.github/blob/main/CONTRIBUTING.md#versions)). It stops
   if fly's branch lacks commits its remote has.
2. `npm run build` in fly typechecks and builds the flight into `fly/dist/`, for the site's root.
   `0SFS.github.io` is an *organization site*, served from `https://0sfs.github.io/` rather than
   from a `/repo-name/` subpath.
3. `npm run build` here makes `dist/`: fly's build without fly's own root page, then the landing
   page and `public/`. It stops if a file would be in both, if the landing page links a file the site
   lacks, or if its aircraft are not the flight's: the same families, in the flight's order, with its
   names, summaries and notes. It leaves out dotfiles, as the old `gh-pages` deploy did. It ends by
   naming the fly commit the flight was built from.
4. `npm run check` opens `dist/` in headless Chrome: the landing page, Start flying, the flight up to
   a loaded aircraft, and `/rc/`. It needs Chrome, and fly's checkout for its Chrome helpers. Its
   screenshots and report go in `build/validation/landing/`.
5. It replaces everything on `gh-pages` with `dist/`, commits it as
   `Deploy the site at <this commit> with the flight at <fly commit>`, and pushes. It refuses when
   the flight was built from a fly checkout with uncommitted or unpushed changes: the site publishes
   a fly commit anyone can look up.

The deploy is manual and runs from your machine. There is no GitHub Actions workflow, so pushing to
`main`, here or in fly, does **not** republish the site.

## Before the first deploy on a new machine

- Node.js 22.18 or newer, and what fly's build needs (its development guide).
- This repository's `origin` is `https://github.com/0SFS/0SFS.github.io.git`, with push access and
  git credentials that work: the deploy fetches and pushes `gh-pages` as you. It works in a git
  worktree under `build/gh-pages`, which it removes when it is done.
- Nothing to install here: the scripts use Node alone.

## Previewing

```sh
npm run preview
```

serves `dist/` at http://127.0.0.1:4175/ the way GitHub Pages does: a folder's `index.html` at its
address with a slash, a redirect to that address from the one without, and no fallback page. Pass
`-- --port <n>` for another port. It listens on 127.0.0.1 only.

## Verifying

```sh
curl -o /dev/null -w '%{http_code}\n' https://0sfs.github.io/
curl -o /dev/null -w '%{http_code}\n' https://0sfs.github.io/fly/
curl -o /dev/null -w '%{http_code}\n' https://0sfs.github.io/rc/
curl -s https://0sfs.github.io/fly/ | grep -o 'src="[^"]*"'
```

`200` means the page is up, but a blank page returns `200` too, so check the flight's main script as
well: its path should start with `/assets/` and requesting it should also return `200`. `/fly/` and
`/rc/` are real folders in the build (`dist/fly/index.html` and `dist/rc/index.html`); GitHub Pages has
no SPA fallback, so those copies are what make a hard refresh work. Hard-refresh in the browser —
Pages caches aggressively and a normal reload will happily serve you the previous build.

Before treating a release as done, open the deployed site and check the landing page, the flight on
`/fly/`, JSBSim loading, and phone pairing on `/rc/`. The preview does not exercise the HTTPS-only
parts of pairing. See the
[release checklist](https://github.com/0SFS/docs/blob/main/release/RELEASE_CHECKLIST.md).

## Troubleshooting

**`npm run build` here says the flight build is not for the site's root.** fly was built for a
subpath. Its build uses `/` unless it runs in GitHub Actions for a repository not named
`<owner>.github.io`. Rebuild it without a base.

**The page loads blank with 404s for `/assets/*.js`.** The site went out with a flight built for
another path. `npm run build` here refuses such a build, so the cause is a `dist/` assembled by other
means. Rebuild fly, then this site, then deploy.

**Phone pairing works locally but not on the deployed site.** The QR points at
`https://0sfs.github.io/rc/` by default. A different static HTTPS deployment needs
`VITE_PHONE_CONTROLLER_URL` set to its base URL when fly is built (the build appends `rc/`).

**Phone pairing reaches the QR but never connects.** Open **Connection details** on either end — both
sides record the whole attempt and name the cause. If the report shows candidates on both sides but no
selected pair, there is no direct path between the two devices and the deployment needs a TURN relay:
build fly with `VITE_ICE_SERVERS` set to a JSON array of `RTCIceServer` entries. One build-time setting
reaches both devices, since they load the same bundle. See
[Phone controller](https://github.com/0SFS/rc/blob/main/docs/phone-controller.md#adding-a-turn-relay).

**`/fly/` or `/rc/` shows a different page.** Keep GitHub Pages off in the 0SFS `fly` and `rc`
repositories: a project site there is served at `https://0sfs.github.io/fly/` or `/rc/`, the
addresses of this site's pages.

## Deploying your own fork

A fork of this repository named `<user>.github.io` is served from the domain root, like this one, and
builds as above. Change the canonical and preview addresses in `index.html`, and `public/robots.txt`
and `public/sitemap.xml`, to its own address.

A project-site fork, served from `https://<user>.github.io/<repo>/`, needs fly built for that path. In
fly, run `npm run build`, then `npx vite build --configLoader native --base=/<repo>/` to build the
pages again for it. Then here, `npm run build -- --base=/<repo>/`. The landing page's own links are
relative and work from any path. Set `VITE_PHONE_CONTROLLER_URL` to your own base URL when you build
fly, or the QR will keep sending phones to the official site.
