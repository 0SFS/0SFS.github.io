# Deploying to GitHub Pages

Redeploying the live site is one command:

```sh
npm run deploy
```

A minute or so later, https://0sfs.github.io/ serves the new build.

## What the command does

`npm run deploy` runs `deploy:gh-pages`, which is two steps:

1. `npm run build` — typechecks (`tsc -b`), then builds with Vite. Vite's default base of `/` is
   what this site needs: `0SFS.github.io` is an *organization site*, served from
   `https://0sfs.github.io/` rather than from a `/repo-name/` subpath. A project-site repository
   would have to pass its own name instead.
2. `gh-pages -d dist` — commits the contents of `dist/` to the `gh-pages` branch and pushes it.
   GitHub Pages serves that branch directly. Nothing on `main` is touched.

The deploy is manual and runs from your machine. There is no GitHub Actions workflow, so pushing to
`main` does **not** republish the site — you have to run the command.

## Before the first deploy on a new machine

- Node.js 22 or newer, plus the sibling `foss-earth` checkout and the built
  `Felipegalind0/gamepad-tools` checkout described in [Development](development.md#requirements).
- `npm install` at least once, so the `gh-pages` CLI is present.
- Push access to `origin`, with git credentials already working (the command pushes as you).

## Verifying

```sh
curl -o /dev/null -w '%{http_code}\n' https://0sfs.github.io/
curl -s https://0sfs.github.io/ | grep -o 'src="[^"]*"'
```

`200` means the page is up, but a blank page returns `200` too, so check the main script as well:
its path should start with `/assets/` and requesting it should also return `200`. Hard-refresh in
the browser — Pages caches aggressively and a normal reload will happily serve you the previous
build.

Before treating a release as done, open the deployed site and check flight mode, JSBSim loading, and
phone pairing on the public URL. Local `npm run dev` does not exercise the same asset paths or the
HTTPS-only parts of pairing. See [RELEASE_CHECKLIST.md](../RELEASE_CHECKLIST.md).

## Troubleshooting

**`spawn E2BIG` during publish.** The `gh-pages` publisher passes filenames as command arguments and
this project's `dist` is large enough to overflow the limit once its temporary checkout goes stale.
Clear it and retry:

```sh
npx gh-pages-clean
npm run deploy
```

**The deploy reports success but nothing changes.** Same cause — the cache in
`node_modules/.cache/gh-pages` is out of sync with the remote branch. `npx gh-pages-clean` fixes it.

**The page loads blank with 404s for `/assets/*.js`.** The build went out with a base path that does
not match where Pages serves it. This site is served from the domain root, so `dist/index.html` must
load `/assets/…`. Check `deploy:gh-pages` in `package.json` for a stray `--base` flag, and
`vite.config.ts` for the base it chooses.

**Phone pairing works locally but not on the deployed site.** The QR points at
`https://0sfs.github.io/?mode=remote` by default. A different static HTTPS deployment needs
`VITE_PHONE_CONTROLLER_URL` set to its base URL *at build time*.

## Deploying your own fork

A fork named `<user>.github.io` is served from the domain root, like this one, and needs no change.

A project-site fork, served from `https://<user>.github.io/<repo>/`, needs that path as its base:
change the build step of `deploy:gh-pages` in `package.json` to
`npm run build -- --base=/<repo-name>/`, then run `npm run deploy`. If you add a GitHub Actions build
instead, `vite.config.ts` picks the same base from the repository name. Set
`VITE_PHONE_CONTROLLER_URL` to your own base URL, or the QR will keep sending phones to the official
site. See [Development](development.md) for what running a fork involves.
