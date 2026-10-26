# Parallel work on the bento prototype

Each linked document is a self-contained delegation prompt. Give one prompt to each agent. They deliberately avoid concurrent edits to the landing page.

| Task | Prompt | Owned result |
|---|---|---|
| Smartphone artwork | [Real interfaces on 3D phones](delegate-smartphone-renderings.md) | Phone model/render scripts, real screen captures, two finished static assets |
| Physical sunset | [FOSS Earth orbital sunset](delegate-orbital-sunset.md) | Reusable scene screenshot script, a real sunset image, retained comparison illustration |
| Supplementary text | [“?” copy policy](delegate-supplementary-copy-policy.md) | Shared policy clarification and concrete aircraft-card/help/parser handoff |

The main thread retains the five-second F-35B flight capture and final website integration: hero video/poster, phone assets, Sunset / Illustration switching, aircraft help, accessibility and responsive QA. Do not edit those shared files concurrently.

Current flight: Google Photorealistic 3D Tiles over the Mississippi by UMN; due-west climb; 25 October 2026 at 17:16 America/Chicago; throttle 90% to 100% at two seconds; five-second output. Capture source is under `scripts/capture-hero.mjs`, `scripts/hero-*`. The finished, decoded WebM/MP4 and poster are installed in `public/media/f35-westbound-umn*`; clean original frames are under ignored `build/hero/f35-westbound-umn-final/`. See [the capture guide](landing-hero-video.md) for tuning and the real engine's ignition delay.

Agents should return exact changed paths, regeneration commands and inspected artifact paths, plus any remaining limitations. Keep scratch data under ignored `build/`; do not commit, push or deploy.
