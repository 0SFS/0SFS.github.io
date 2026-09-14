/**
 * Asset URLs for the audio module.
 *
 * Both are resolved through `new URL(..., import.meta.url)` so the bundler
 * emits content-hashed files and rewrites the reference for whatever `base`
 * the deployment uses. Nothing here hard-codes `/audio/...`, which would break
 * the project's own non-root GitHub Pages publication.
 */

/** Standalone WASM DSP core; see dsp/audio-dsp.provenance.json. */
export const audioDspWasmUrl = new URL("./dsp/audio-dsp.wasm", import.meta.url);

/** AudioWorkletProcessor module, loaded with `audioWorklet.addModule()`. */
export const audioWorkletUrl = new URL("./worklet/dspProcessor.js", import.meta.url);
