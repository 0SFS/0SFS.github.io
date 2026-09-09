# OSFS release checklist

Use this for a specific tagged release; do not mark an item complete based only on intent.

- [ ] Canonical OSFS name, repository slug, public URL, and Pages base path are decided.
- [ ] Rename plan has been applied without breaking historical URLs, phone pairing, or stored preferences.
- [x] Baseline lint, tests, and production builds passed in OSFS and FOSS Earth on 2026-09-09.
- [x] Runtime `npm audit --omit=dev` reported zero known vulnerabilities for both repositories on 2026-09-09.
- [ ] Build is tested at the real public deployment path, including JSBSim manifest/XML loads.
- [ ] Official unmodified AGPLv3 text is installed for cleared core code, with identified copyright holders.
- [ ] FOSS Earth has a compatible license and immutable/pinned release dependency.
- [ ] Third-party notices, LGPL corresponding source/build information, and a generated complete SBOM/license report are included.
- [ ] Every shipped asset and JSBSim definition has source, copyright, license/permission, and attribution evidence.
- [ ] Unclear/proprietary/reference-only Cessna and Cirrus materials are removed from the release artefact or cleared in writing.
- [ ] Google/provider terms, attribution, API-key restrictions, privacy handling, and service-rate limits are verified.
- [ ] README, contributor, conduct, security, asset, commercial, and notification documents are reviewed.
- [ ] No accidental secrets, proprietary files, or unsupported claims are included.
- [ ] Release tag, changelog, repository URL, playable URL, and support/security contact are final.
- [ ] Notification drafts have real links and are approved before posting.
