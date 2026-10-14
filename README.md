# 0SFS website

The GitHub Pages site for 0SFS, https://0sfs.github.io/. This repository holds the landing page, the
site build that serves [fly](https://github.com/0SFS/fly)'s simulator at `/fly/` and phone controller
at `/rc/`, and the site's `robots.txt`, sitemap and preview image. It holds no simulator code: the
flight it publishes is a fly build, named by its commit.

- `index.html` and `landing.css` are the landing page, static HTML with two small inline scripts:
  one sends links from before `/fly/` and `/rc/` existed (`?mode=flight`, `?mode=remote`) to them, and
  one keeps the address's settings, such as `?renderer=webgl2`, on the Start flying link.
- `public/` is copied to the site's root as it is. `images/` holds artwork the page does not use
  yet, so it is not published.
- `scripts/build.mjs` makes `dist/` from fly's `dist/` and this repository, and checks it.
- `scripts/serve.mjs` previews `dist/` at http://127.0.0.1:4175/.
- `scripts/check-landing-page.mjs` checks the built site in headless Chrome.
- `scripts/deploy.mjs` builds fly and this site, checks them, and publishes `dist/` to `gh-pages`.

## Building and previewing the whole site

With fly checked out beside this repository and set up as its
[development guide](https://github.com/0SFS/fly/blob/main/docs/development.md) describes:

```sh
cd fly && npm run build && cd ..
cd 0sfs.github.io
npm run build
npm run preview
```

Then open http://127.0.0.1:4175/. `npm test` runs this repository's tests, and `npm run check`
the headless check of the built site. [Deploying](docs/deploying.md) covers publishing.

For work on the simulator itself, fly's `npm run dev` serves `/fly/` and `/rc/`; its `/` goes to
`/fly/`, since the landing page lives here.

## Community

- [Code of conduct](https://github.com/0SFS/.github/blob/main/CODE_OF_CONDUCT.md)
- [Contributing](https://github.com/0SFS/.github/blob/main/CONTRIBUTING.md)
- [License](LICENSE)
- [Security](https://github.com/0SFS/.github/blob/main/SECURITY.md)
