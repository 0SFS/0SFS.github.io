# Delegation prompt: supplementary copy behind “?”

Define a clear policy and implementation handoff for keeping supplementary text behind compact **?** controls, starting with the 0SFS landing-page aircraft cards. The main agent is integrating media and will apply your final card markup to avoid concurrent edits of the page.

## Context and ownership

Website: `/Users/felg/gh/0sfs/0sfs.github.io`. Shared organization instructions: `/Users/felg/gh/0sfs/.github`. Shared UI specification: `/Users/felg/gh/foss-earth/docs/docs/ui-layout.md`.

Read the applicable `AGENTS.md` files. The existing policy already says to use compact **?** help for supplementary explanations and keep decision-critical state visible. Extend/clarify it rather than creating a conflicting duplicate. Preserve unrelated uncommitted work. Do not commit, push or deploy.

You own:

- The relevant UI-policy paragraph in `0sfs/.github/agent-reference.md`, with a concise pointer in its `AGENTS.md` only if necessary.
- `0sfs.github.io/docs/proposals/supplementary-copy-policy.md`, including concrete implementation snippets and verification instructions.

**Do not edit the landing page, its CSS, package files, catalogue/build checks or simulator source.** Those files have active changes and will be integrated by the main agent. Inspect them read-only to make your proposal concrete and compatible.

## Requested behavior

On the landing page, show the aircraft's image and name with a compact, accessible **?** control. Hide the longer description and implementation detail by default. The user specifically asked to move this whole Cirrus block behind help:

> Single-engine personal jet. G1, G2, G2+ and G3 variants.
>
> G1, G2 and G3 have separate runtime packages. G2+ is currently mapped to the G2 runtime while separate physics/package support is not yet implemented. Choosing a generation does not provide calibrated generation-specific performance, a new cabin or complete generation-specific avionics.

Apply the same principle consistently across aircraft cards. Preserve all the underlying catalogue text and qualification details. Keep a short **Experimental** status visible for the F-35B, because it materially affects interpretation, while its longer explanation can live inside help. Do not invent a new capability claim to replace hidden text.

## Policy and implementation handoff

1. Define what belongs in the primary surface: identity, the primary action, essential terse state, errors, pending changes and information needed for a meaningful decision.
2. Define what belongs behind **?**: extended descriptions, implementation mapping, provenance, rationale, technical caveats and secondary explanation. The user should be able to read the main page without those paragraphs dominating its layout.
3. Specify click/tap and keyboard behavior, accessible names, Escape/outside dismissal if using a popover, focus behavior, mobile wrapping and positioning that avoids clipping inside the rounded cards.
4. Favor existing native HTML or the shared help pattern. The landing page is static HTML/CSS with two existing inline scripts; do not introduce a frontend framework or load the simulator/shared 3D engine just for help. Supply minimal concrete HTML/CSS/JS snippets for the main agent to integrate.
5. Inspect `scripts/build.mjs` and `scripts/build.test.mjs` read-only. They currently check aircraft labels, summaries and qualifications against the shipped catalogue, so moving text into help must retain that check. State the smallest required parser/test adjustment; do not remove the validation or rewrite unrelated tests. These files may already contain other uncommitted work.
6. Identify meaningful browser checks: help hidden by default, usable by keyboard and touch, full text retained, no narrow-screen overflow, experimental status still visible, and source/catalogue validation still passing.

## Handoff

Deliver the actual shared policy edit and the finished implementation handoff document, including exact proposed card markup and parser changes. Summarize the rule briefly enough to be useful in future tasks. The main agent will integrate it into the active landing-page files.
