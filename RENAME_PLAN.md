# Rename record: `flight-sim` → OSFS

OSFS means **Open Source Flight Simulator**. The product and GitHub repository were renamed to OSFS on 2026-09-09. This document records the completed migration and the remaining deployment verification.

## Completed changes

| Location | Current value | Required change |
| --- | --- | --- |
| Area | Result |
| --- | --- |
| Product labels | README, browser title, and phone controller now use OSFS. |
| Package identity | Root package and lockfile names are `osfs`. |
| Repository | GitHub repository is `Felipegalind0/OSFS`; the local `origin` matches it. |
| Deployment paths | Pages and controller defaults use `/OSFS/`. |
| Preferences | New keys use `osfs.*`; the previous `flight-sim.*` keys remain readable for migration. |

## Required verification

| Area | Requirement |
| --- | --- | --- |
| GitHub Pages | Confirm the configured Pages source serves the renamed `/OSFS/` path. |
| Phone controller | Test desktop-to-phone pairing on `https://felipegalind0.io/OSFS/`. |
| JSBSim assets | Confirm the production build requests `/OSFS/jsbsim-data/manifest.json` and every listed XML file. |
| Old public URL | Keep or configure a redirect if old links must continue to work. |

## Intentional legacy references

Historical audit notes, the former `/flight-sim/` production test record, and legacy local-storage keys remain to document migration history. Current product-facing material uses OSFS.

## Must remain unchanged unless an API migration is planned

* TypeScript symbols such as `createFlightSimApp`, `FlightSimAppOptions`, and import paths under `src/flight/` are internal interfaces. Renaming them adds churn without changing the public product identity.
* The `foss-earth` dependency name and all of its import paths identify a separate package. They are not OSFS branding and must not be mechanically renamed.
* Existing test assertions, old public URLs, and storage keys need deliberate compatibility changes rather than search-and-replace.

## Follow-up order

1. Deploy a staging build at the OSFS path and verify JSBSim data, route selection, deep links, and phone pairing.
2. Keep legacy preference reads for at least one release.
3. Set an old-URL redirect if it is needed, then publish release links and notifications.
