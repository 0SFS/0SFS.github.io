# Release notification drafts

These are drafts for a release that has passed the blockers in
[RELEASE_AUDIT.md](../RELEASE_AUDIT.md). Replace the bracketed values only after
the public repository, license, release tag, and playable URL are final. Do not
present unreleased features, unverified assets, or unreviewed license claims as
finished work.

## JSBSim community — GitHub Discussions “Show and tell”

**Title:** OSFS: a browser flight simulator using JSBSim through WebAssembly

Hello JSBSim community — we are releasing [OSFS (Open Source Flight
Simulator)]([repository URL]), a browser-based flight-simulation project.

OSFS runs JSBSim locally in the browser through the `@0x62/jsbsim-wasm` SDK. We
load aircraft/engine XML into Emscripten MEMFS, bootstrap a C172P, and advance
the FDM in a fixed-step flight loop while Babylon.js renders the visual world.
The integration notes, including the Vite/WASM loading details, are here:
[JSBSim WASM documentation URL].

Release: [tag URL] · Playable build: [URL] · Source: [repository URL] · License
and third-party notices: [URL]

We would appreciate feedback on the browser/WASM integration and on our plan to
make aircraft-definition provenance explicit. Thank you to the JSBSim
maintainers and contributors for the flight-dynamics work this builds on.

## Babylon.js forum — Demos and projects

**Title:** OSFS — an open-source browser flight simulator with Babylon.js and JSBSim WASM

We have released [OSFS]([repository URL]), an open-source browser flight
simulator built with Babylon.js. It combines a Babylon-rendered globe and
aircraft view with JSBSim flight dynamics running locally in WebAssembly. The
current release includes [verified feature list], optional map sources, and a
phone-controller route using WebRTC.

Try it: [playable URL]

Source and license: [repository URL]

The architecture graph is at [graph URL]. We would welcome rendering and
large-world feedback from the community. [Add a screenshot or short capture.]

The Babylon forum's Demos and projects category explicitly invites project
showcases; include the accurate license and a working demo before posting.

## 3d-tiles-renderer maintainers — GitHub Discussion or issue only if appropriate

**Title:** OSFS release using 3d-tiles-renderer with Babylon.js

Hello — we are releasing [OSFS]([repository URL]), which uses
`3d-tiles-renderer`'s Babylon.js integration to render optional Google
Photorealistic 3D Tiles. The project, attribution approach, and dependency
graph are documented at [URL].

This is a thank-you and visibility note, not a support request. If this
repository prefers project announcements somewhere else, please point us to the
right venue. We will follow provider API/data terms and preserve the required
software notices.

## Maintainer-owned release note

**OSFS [version] is out.** Open Source Flight Simulator is a browser-based
flight simulation platform built with Babylon.js, JSBSim through WebAssembly,
and web technologies. This release is available at [playable URL] with source,
release notes, and third-party notices at [repository/release URL].

Known limits: [only verified limitations]. Please report bugs at [issue URL] and
review the asset and license notices before redistributing aircraft content.
