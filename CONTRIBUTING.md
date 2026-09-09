# Contributing to OSFS

Thank you for improving OSFS. Before opening a pull request, discuss material new features or large changes in an issue so the implementation fits the project's direction.

## Development

OSFS currently expects Node.js 22+, npm, and a sibling checkout of `foss-earth`; see the README for the directory layout. Install dependencies with `npm install`, then run:

```sh
npm run lint
npm run test
npm run build
```

Use TypeScript's strict types, follow the existing formatting and lint rules, keep changes focused, and add meaningful tests for behavior changes. Do not add generated build output, credentials, API keys, vendor copies, or unrelated formatting changes.

## Rights and licensing

By submitting a contribution, you confirm that you have the right to submit it under the repository's applicable licensing terms and that it does not include confidential, proprietary, or copied material without permission. Identify all third-party code, data, models, textures, sounds, fonts, and references in the pull request.

Aircraft and other creative assets need an explicit provenance record as described in [ASSET_LICENSES.md](ASSET_LICENSES.md). Do not submit a model or reference merely because it is publicly downloadable.

## Pull requests

Explain the user-visible result, relevant tests, and any limitations. Update documentation when public behavior, setup, data sources, or licensing changes. Maintainers may request a smaller change, more tests, or provenance evidence before merge.
