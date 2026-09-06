Investigate how this work app implements FOSS Earth render-on-demand and the GPU/renderer button’s green fill with blue outline. Start with a read-only code investigation; do not start a dev, preview, or watch server.

Please identify:

1. The exact FOSS Earth package/source revision used by this app, including any wrapper, fork, or locally copied runtime code.
2. The component, CSS classes, and subscriptions that drive the GPU button. Does green mean WebGPU capability, active rendering, or something else? Does the blue outline indicate rendering, tile streaming, or both? Include precise file paths and relevant snippets.
3. The render scheduler and every caller of requestRender, beginContinuous, endContinuous, and setPaused. Explain how continuous holds are released, including startup, tile errors/fallback, inertia, animations, visibility changes, and disposal.
4. Whether a stationary, settled scene actually stops calling scene.render / submitting frames. Distinguish a running CSS animation or stale FPS display from active scene rendering. Use existing tests or available instrumentation; if browser verification needs a server, provide the exact command for me to start.
5. Which pieces belong in core FOSS Earth and which are specific to this work app. Return a minimal proposed shared API/patch and regression tests; do not copy work-app-specific code into the library yet.

Context from the personal Flight Sim/FOSS Earth checkout:

- The root route loads createGlobeApp; ?mode=flight loads Flight Sim through foss-earth/runtime.
- FOSS Earth already has requestRender(), isRendering(), and onActiveRenderChange(), plus separate isStreamingTiles()/onTilesStreamingChange() signals.
- The original local createGlobeApp wired render activity to the FPS group’s .is-active and streaming to the map-source chip’s .is-streaming. Its GPU button only showed renderer capability and never subscribed to activity.
- Flight Sim’s simMode previously both forced shouldKeepRendering to true and acquired an unreleased continuous hold. Local changes now use setSimRunning(false) to let paused simulation frames settle, and explicitly request frames for camera changes. Keyboard/UI resume wakes the scheduler immediately.
- Local changes also release tile-streaming holds on fallback, report hidden-tab rendering as inactive, and provide a shared attachRendererActivity helper with .hud-chip--gpu.is-rendering styling: green fill and a static blue outline while the scheduler is active. Idle has no activity animation.
- These are local fixes, not proof of how this work app behaves. Compare their semantics with the actual implementation here before recommending alignment.

Relevant personal-checkout paths to look for equivalents of: src/engine/babylon/renderScheduler.ts, createBabylonRuntime.ts, src/app/createGlobeApp.ts, src/styles/hud.css, and src/shell/rendererActivity.ts.

Please return an evidence-backed explanation and a concise handoff I can paste into my personal laptop’s session.
