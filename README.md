# 0SFS website

The GitHub Pages site for 0SFS, https://0sfs.github.io/. This repository holds the landing page, the
site build that serves [fly](https://github.com/0SFS/fly)'s simulator at `/fly/` and phone controller
at `/rc/`, and the site's `robots.txt`, sitemap and preview image. It holds no simulator code: the
flight it publishes is a fly build, named by its commit.

- `index.html` and `landing.css` are the landing page, static HTML with two small inline scripts:
  one sends links from before `/fly/` and `/rc/` existed (`?mode=flight`, `?mode=remote`) to them, and
  one keeps the address's settings, such as `?renderer=webgl2`, on the Start flying link and
  controls the silent flight preview, respecting reduced motion and data-saving preferences.
- `public/` is copied to the site's root as it is. `images/` holds artwork the page does not use
  yet, so it is not published.
- `scripts/build.mjs` makes `dist/` from fly's `dist/` and this repository, and checks it.
- `scripts/serve.mjs` previews `dist/` at http://127.0.0.1:4175/.
- `scripts/check-landing-page.mjs` checks the built site in headless Chrome.
- `scripts/deploy.mjs` builds and checks the site and publishes it to `gh-pages`: the landing page,
  the flight, or both, keeping the part it does not publish as it is there.

The landing page uses a responsive feature grid across the available laptop width. It introduces
the scenery, WebGPU rendering, JSBSim physics, Rust world-computation cores, phone controls,
physical sky and astronomy, systems, sound and the two-pilot multiplayer preview. ArduPilot and
larger multiplayer sessions are explicitly planned. The copy's evidence and limits are recorded in the
[25 October comparison](https://github.com/0SFS/research/blob/main/browser-flight-sim-positioning-2026-10-25.md)
and the [feature-grid design and local review](docs/proposals/landing-feature-grid.md).
Aircraft descriptions and technical qualifications open through compact native **?**
help controls. Essential status, including the F-35B's Experimental badge, stays visible.
The [supplementary-copy policy](docs/proposals/supplementary-copy-policy.md) explains the split.

The world card plays a five-second real F-35B flight over Google Photorealistic 3D Tiles
beside UMN. Its WebM, MP4 fallback and still poster are in `public/media/`. The
[capture guide](docs/proposals/landing-hero-video.md) explains the scripted scene, tuning,
timing and verification. Regenerate and install the checked assets locally with:

```sh
cd ~/gh/0sfs/0sfs.github.io
npm run tune:hero # paused start; adjust Sky time, then enter save and quit
npm run capture:hero
npm run check:hero -- --install
```

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

For landing-page review with an existing `../fly/dist/`, `npm run dev` builds the site and starts
that local preview in one command. `npm run llm-dev` serves an already-built site for automated
checks. The page needs no dependency installation. Neither command publishes anything.

For work on the simulator itself, fly's `npm run dev` serves `/fly/` and `/rc/`; its `/` goes to
`/fly/`, since the landing page lives here.

## Community

- [Code of conduct](https://github.com/0SFS/.github/blob/main/CODE_OF_CONDUCT.md)
- [Contributing](https://github.com/0SFS/.github/blob/main/CONTRIBUTING.md)
- [License](LICENSE)
- [Security](https://github.com/0SFS/.github/blob/main/SECURITY.md)
