import { ArcRotateCamera, Engine, HemisphericLight, MeshBuilder, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { createTireAudioGraph } from "../../src/flight/audio/createTireAudio";
import { createWheelSpinDebugOverlay } from "../../src/flight/diagnostics/createWheelSpinDebugOverlay";
import { createWheelSpinState, stepWheelSpin, WHEEL_SPIN_CONFIGS } from "../../src/flight/physics/wheelSpin";

const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
};
const summary = (values: number[]) => ({ n: values.length, p50: quantile(values, 0.5), p95: quantile(values, 0.95),
  mean: values.reduce((sum, value) => sum + value, 0) / values.length });

/** Mean slip power per 60 Hz frame from the real finite-inertia model over a scripted gentle touchdown. */
function touchdownPowerTrace(seconds: number): number[] {
  const states = WHEEL_SPIN_CONFIGS.map(() => createWheelSpinState());
  const frames: number[] = [];
  let energy = 0;
  for (let step = 0; step < seconds * 120; step++) {
    const time = step / 120;
    WHEEL_SPIN_CONFIGS.forEach((config, wheel) => {
      const touch = wheel === 0 ? 1 : 0.5;
      const onGround = time >= touch;
      stepWheelSpin(states[wheel], config, { onGround, rollMetersSec: 30, normalLoadNewtons: onGround ? (wheel === 0 ? 900 : 2_400) : 0,
        compressionMeters: onGround ? 0.04 : 0, steeringRad: 0, brake: 0 }, 1 / 120, "inertia");
      energy += states[wheel].slipPowerWatts / 120;
    });
    if (step % 2 === 1) { frames.push(energy * 60); energy = 0; }
  }
  return frames;
}

async function renderOffline(seconds: number, sampleRate: number, trace: number[] | null) {
  const context = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
  let updateMs = 0;
  if (trace) {
    const graph = createTireAudioGraph(context);
    const start = performance.now();
    for (let frame = 0; frame < trace.length; frame++) graph.update(trace[frame], frame / 60, 0.7);
    updateMs = performance.now() - start;
  }
  const start = performance.now();
  await context.startRendering();
  return { renderMs: performance.now() - start, updateMs };
}

declare global {
  interface Window {
    measureTireAudio(options: { seconds: number; sampleRate: number; repeats: number }): Promise<unknown>;
    measureWheelOverlay(options: { frames: number; blocks: number; batch: number }): Promise<unknown>;
  }
}

window.measureTireAudio = async ({ seconds, sampleRate, repeats }) => {
  const trace = touchdownPowerTrace(seconds);
  const silent = trace.map(() => 0);
  const cases: Record<string, { renderMs: number[]; updateUsPerFrame: number[] }> = {
    "empty-context": { renderMs: [], updateUsPerFrame: [] },
    "tire-graph-silent": { renderMs: [], updateUsPerFrame: [] },
    "tire-graph-touchdown": { renderMs: [], updateUsPerFrame: [] },
  };
  await renderOffline(1, sampleRate, trace.slice(0, 60)); // warm-up
  for (let repeat = 0; repeat < repeats; repeat++) {
    const order = repeat % 2 ? ["tire-graph-touchdown", "tire-graph-silent", "empty-context"] : Object.keys(cases);
    for (const name of order) {
      const result = await renderOffline(seconds, sampleRate,
        name === "empty-context" ? null : name === "tire-graph-silent" ? silent : trace);
      cases[name].renderMs.push(result.renderMs);
      if (name !== "empty-context") cases[name].updateUsPerFrame.push(result.updateMs * 1000 / trace.length);
    }
  }
  return {
    crossOriginIsolated: globalThis.crossOriginIsolated,
    renderedSeconds: seconds, sampleRate, framesPerRender: trace.length,
    peakTracePowerW: Math.max(...trace),
    cases: Object.fromEntries(Object.entries(cases).map(([name, value]) => [name, {
      renderMsPerRenderedSecond: summary(value.renderMs.map(ms => ms / seconds)),
      mainThreadUpdateMicrosecondsPerFrame: value.updateUsPerFrame.length ? summary(value.updateUsPerFrame) : null,
    }])),
  };
};

window.measureWheelOverlay = async ({ frames, blocks, batch }) => {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  document.body.append(canvas);
  const engine = new Engine(canvas, false, { preserveDrawingBuffer: false, stencil: true, antialias: true });
  const gl = (engine as unknown as { _gl: WebGL2RenderingContext })._gl;
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  const vendor = debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR));
  const scene = new Scene(engine);
  const camera = new ArcRotateCamera("camera", -Math.PI / 2.3, Math.PI / 2.6, 12, Vector3.Zero(), scene);
  camera.minZ = 0.1;
  new HemisphericLight("light", new Vector3(0, 1, 0), scene);
  const ground = MeshBuilder.CreateGround("ground", { width: 200, height: 200, subdivisions: 32 }, scene);
  ground.position.y = -1.2;
  const aircraft = new TransformNode("aircraft", scene);
  // A small stand-in airframe so the overlay is measured against some scene work, not an empty frame.
  for (const [name, size, position] of [["fuselage", [1.2, 1.3, 7.5], [0, 0, 0]], ["wing", [11, 0.15, 1.6], [0, 0.8, 0.4]],
    ["tail", [3.4, 0.1, 1], [0, 0.5, -3.4]]] as const) {
    const box = MeshBuilder.CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, scene);
    box.position.set(position[0], position[1], position[2]);
    box.parent = aircraft;
  }
  const states = WHEEL_SPIN_CONFIGS.map(() => ({ ...createWheelSpinState(), onGround: true, compressionMeters: 0.04 }));
  const sdk = { getPropertyValue: (name: string) => name === "inertia/cg-x-in" ? 41 : name === "inertia/cg-z-in" ? 36.5 : 0 };
  const overlay = createWheelSpinDebugOverlay(scene, aircraft, sdk as never, () => states);
  const frame = (withOverlay: boolean, finish: boolean) => {
    for (const state of states) state.angleRad = (state.angleRad + 0.3) % (2 * Math.PI);
    const start = performance.now();
    if (withOverlay) overlay.update();
    scene.render();
    const submitted = performance.now();
    if (finish) gl.finish();
    return { submitMs: submitted - start, finishMs: performance.now() - start };
  };
  // Babylon marks shaders ready via timer polling: yield so they compile, then prove draws happen.
  const settle = async () => {
    await scene.whenReadyAsync();
    for (let index = 0; index < 5; index++) { scene.render(); await new Promise(resolve => setTimeout(resolve, 20)); }
  };
  const countDraws = () => {
    let draws = 0;
    const context = gl as unknown as Record<string, (...args: unknown[]) => unknown>;
    const originals = ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"].map(name => [name, context[name]] as const);
    for (const [name, original] of originals) context[name] = (...args: unknown[]) => { draws += 1; return original.apply(gl, args); };
    scene.render();
    for (const [name, original] of originals) context[name] = original;
    return draws;
  };
  const drawsPerFrame: Record<string, number> = {};
  type Samples = { submitMs: number[]; finishMs: number[]; batchSubmitMs: number[]; batchFinishMs: number[] };
  const empty = (): Samples => ({ submitMs: [], finishMs: [], batchSubmitMs: [], batchFinishMs: [] });
  const results: Record<string, Samples> = { "overlay-off": empty(), "overlay-on": empty() };
  await settle();
  for (let warm = 0; warm < 120; warm++) frame(false, true);
  drawsPerFrame["overlay-off"] = countDraws();
  overlay.setEnabled(true);
  await settle();
  for (let warm = 0; warm < 120; warm++) frame(true, true);
  drawsPerFrame["overlay-on"] = countDraws();
  for (let block = 0; block < blocks; block++) {
    for (const name of block % 2 ? ["overlay-on", "overlay-off"] : ["overlay-off", "overlay-on"]) {
      const on = name === "overlay-on";
      overlay.setEnabled(on);
      await new Promise(resolve => setTimeout(resolve, 0));
      let submitSum = 0, finishSum = 0;
      for (let index = 0; index < frames; index++) {
        const sample = frame(on, true);
        results[name].submitMs.push(sample.submitMs);
        results[name].finishMs.push(sample.finishMs);
        submitSum += sample.submitMs;
        finishSum += sample.finishMs;
        if ((index + 1) % batch === 0) {
          results[name].batchSubmitMs.push(submitSum / batch);
          results[name].batchFinishMs.push(finishSum / batch);
          submitSum = finishSum = 0;
        }
      }
    }
  }
  const drawInfo = { meshes: scene.meshes.length, drawsPerFrame };
  overlay.dispose();
  scene.dispose();
  engine.dispose();
  return {
    renderer, vendor, webgl: engine.webGLVersion, crossOriginIsolated: globalThis.crossOriginIsolated,
    canvas: [canvas.width, canvas.height], drawInfo,
    timerNote: globalThis.crossOriginIsolated ? "cross-origin isolated timers" : "coarse (non-isolated) timers: use batch means only",
    cases: Object.fromEntries(Object.entries(results).map(([name, value]) => [name, {
      batchMeanCpuSubmitMs: summary(value.batchSubmitMs), batchMeanSubmitPlusGlFinishMs: summary(value.batchFinishMs),
      perFrameCpuSubmitMs: summary(value.submitMs), perFrameSubmitPlusGlFinishMs: summary(value.finishMs) }])),
  };
};
