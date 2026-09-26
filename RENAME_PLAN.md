# Rename record: `flight-sim` → 0SFS

0SFS means **Open Source Flight Simulator**. The product was renamed from `flight-sim` to OSFS, with the letter O, on 2026-09-09, and hosted as the 0SFS organization site so its public address is `https://0sfs.github.io/`.

On 2026-09-26 the name became 0SFS, with a zero, everywhere it is written: the site, the simulator, the phone controller, the Home Screen names, the README, the docs and the GitHub profiles. It now matches the address, so a search for the name finds the site ([Getting 0SFS found on Google](docs/search-visibility.md#spelling)). OSFS stays as an alternate name in the site's structured data, and in the dated records under `docs/old/` and `validation/evidence/`, which say what was written at the time.

## Completed changes

| Location | Current value | Required change |
| --- | --- | --- |
| Area | Result |
| --- | --- |
| Product labels | README, browser title, and phone controller now use 0SFS. |
| Package identity | Root package and lockfile names are `osfs`. |
| Repository | GitHub repository is `0SFS/0SFS.github.io`; the local `origin` matches it. |
| Deployment paths | Pages and controller defaults use the organization-site root `/`. |
| Preferences | New keys use `osfs.*`; the previous `flight-sim.*` keys remain readable for migration. |

## Required verification

| Area | Requirement |
| --- | --- | --- |
| GitHub Pages | Complete: Pages serves the `gh-pages` branch root at `https://0sfs.github.io/`. |
| Phone controller | Test desktop-to-phone pairing on `https://0sfs.github.io/`. |
| JSBSim assets | Confirm the production build requests `/jsbsim-data/manifest.json` and every listed XML file. |
| Old public URL | Configure a redirect if old links must continue to work. |

## Intentional legacy references

Historical audit notes, the former `/flight-sim/` production test record, and legacy local-storage keys remain to document migration history. Current product-facing material uses 0SFS.

## Must remain unchanged unless an API migration is planned

* TypeScript symbols such as `createFlightSimApp`, `FlightSimAppOptions`, and import paths under `src/flight/` are internal interfaces. Renaming them adds churn without changing the public product identity.
* Code names keep the letter O: `OSFS_PARAMETERS`, `OSFS_LEGACY_MIGRATIONS`, `OSFS_SOURCE_BASE`, the audio module's `OSFS_EXPORT` and `osfs_audio_*` exports, the `OSFS_JSBSIM_PACKAGE` and `OSFS_JSBSIM_DATA_ROOT` environment variables, and `__OSFS_LAN_ORIGIN__`. Names in C, TypeScript and the shell cannot begin with a digit. The package name `osfs` and the `osfs.*` settings and storage keys also keep it: renaming the keys would need migrations like the ones from `flight-sim.*`.
* The `foss-earth` dependency name and all of its import paths identify a separate package. They are not 0SFS branding and must not be mechanically renamed.
* Existing test assertions, old public URLs, and storage keys need deliberate compatibility changes rather than search-and-replace.

## Follow-up order

1. Deploy a staging build at the 0SFS path and verify JSBSim data, route selection, deep links, and phone pairing.
2. Keep legacy preference reads for at least one release.
3. Set an old-URL redirect if it is needed, then publish release links and notifications.
