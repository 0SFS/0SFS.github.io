# Deploying to GitHub Pages

Redeploying the live site is one command:

```sh
npm run deploy
```

A minute or so later, https://0sfs.github.io/ serves the new build.

## What the command does

`npm run deploy` runs `deploy:gh-pages`, which is two steps:

1. `npm run build -- --base=/` — typechecks (`tsc -b`), then builds with Vite. The base is the
   domain root because `0SFS.github.io` is an *organization site*, served from `https://0sfs.github.io/`
   rather than from a `/repo-name/` subpath. A project-site repository would need its own name here.
2. `gh-pages -d dist` — commits the contents of `dist/` to the `gh-pages` branch and pushes it.
   GitHub Pages serves that branch directly. Nothing on `main` is touched.

The deploy is manual and runs from your machine. There is no GitHub Actions workflow, so pushing to
`main` does **not** republish the site — you have to run the command.

## Before the first deploy on a new machine

- Node.js 22 or newer, and the sibling `foss-earth` checkout described in [Development](development.md).
- `npm install` at least once, so the `gh-pages` CLI is present.
- Push access to `origin`, with git credentials already working (the command pushes as you).

## Verifying

```sh
curl -o /dev/null -w '%{http_code}\n' https://0sfs.github.io/
```

`200` means the site is up. Hard-refresh in the browser — Pages caches aggressively and a normal
reload will happily serve you the previous build.

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

**The page loads blank with 404s for `/assets/*.js`.** The build went out with the wrong base path.
Use `npm run deploy` rather than running `gh-pages -d dist` against some other build.

**Phone pairing works locally but not on the deployed site.** The QR points at
`https://0sfs.github.io/?mode=remote` by default. A different static HTTPS deployment needs
`VITE_PHONE_CONTROLLER_URL` set to its base URL *at build time*.

## Deploying your own fork

For a project-site fork (`https://<user>.github.io/<repo>/`), change `--base=/` to
`--base=/<repo-name>/` in the `deploy:gh-pages` script in `package.json`, then run `npm run deploy`.
Set `VITE_PHONE_CONTROLLER_URL` to your own base URL, or the QR will keep sending phones to the
official site. See [Development](development.md) for what running a fork involves.
