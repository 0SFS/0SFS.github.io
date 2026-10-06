// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngineSpoolRenderer, type EngineSpoolConfiguration } from "./engineSpoolRenderer";
import { createEngineSpoolMotion } from "./engineSpoolMotion";

const CONFIG: EngineSpoolConfiguration = { preference: "auto", maxFps: 30, pixelRatio: 2, outerBlades: 22, innerBlades: 40 };
const STILL = { outerAngle: 0, innerAngle: 0 };
const TAU = 2 * Math.PI;
const forwardAngle = (from: number, to: number): number => ((to - from) % TAU + TAU) % TAU;
const renderedAngles = (gl: ReturnType<typeof fakeGl>): [number, number][] =>
  gl.uniform4f.mock.calls.filter((_, index) => index % 3 === 0)
    .map((call, index) => [call[1], gl.uniform4f.mock.calls[index * 3 + 1][1]]);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function fakeGl({ compile = true, link = true } = {}) {
  return {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, TRIANGLES: 8,
    createShader: vi.fn(() => ({})), shaderSource: vi.fn(), compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => compile), createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(), linkProgram: vi.fn(), getProgramParameter: vi.fn(() => link),
    getAttribLocation: vi.fn(() => 0), getUniformLocation: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({})), bindBuffer: vi.fn(), bufferData: vi.fn(), useProgram: vi.fn(),
    enableVertexAttribArray: vi.fn(), vertexAttribPointer: vi.fn(), viewport: vi.fn(),
    uniform4f: vi.fn(), drawArrays: vi.fn(), deleteBuffer: vi.fn(), deleteProgram: vi.fn(), deleteShader: vi.fn(),
    getExtension: vi.fn(() => null),
  };
}

function fakeGpu() {
  vi.stubGlobal("GPUBufferUsage", { UNIFORM: 64, COPY_DST: 8 });
  const loss = deferred<GPUDeviceLostInfo>();
  const pass = { setPipeline: vi.fn(), setBindGroup: vi.fn(), draw: vi.fn(), end: vi.fn() };
  const buffer = { destroy: vi.fn() };
  const encoder = { beginRenderPass: vi.fn(() => pass), finish: vi.fn(() => ({})) };
  const device = {
    lost: loss.promise, createShaderModule: vi.fn(() => ({})),
    createRenderPipelineAsync: vi.fn(async () => ({ getBindGroupLayout: () => ({}) })),
    createBuffer: vi.fn(() => buffer), createBindGroup: vi.fn(() => ({})),
    createCommandEncoder: vi.fn(() => encoder),
    queue: { writeBuffer: vi.fn(), submit: vi.fn() }, destroy: vi.fn(),
  };
  const context = {
    configure: vi.fn(), unconfigure: vi.fn(), getCurrentTexture: vi.fn(() => ({ createView: () => ({}) })),
  };
  const requestDevice = vi.fn(async () => device);
  const requestAdapter = vi.fn(async () => ({ requestDevice }));
  Object.defineProperty(navigator, "gpu", {
    configurable: true, value: { getPreferredCanvasFormat: () => "bgra8unorm", requestAdapter },
  });
  return { device: device as unknown as GPUDevice, raw: device, context, buffer, loss, pass, requestAdapter, requestDevice };
}

function fixture(contexts: Record<string, unknown>) {
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  const contextsByCanvas = new Map<HTMLCanvasElement, string>();
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement, kind: string) {
    const existing = contextsByCanvas.get(this);
    if (existing && existing !== kind) throw new Error("A canvas cannot switch context APIs.");
    const result = contexts[kind] ?? null;
    if (result) contextsByCanvas.set(this, kind);
    return result;
  } as never);
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { configurable: true, get: () => 100 });
  document.body.append(host);
  return { host, getContext, contextsByCanvas, canvas: () => host.querySelector("canvas")! };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "gpu");
  Reflect.deleteProperty(document, "hidden");
});

describe("engine spool GPU renderer", () => {
  it("shares the supplied WebGPU device, draws one triangle and never requests or destroys another device", async () => {
    const gpu = fakeGpu();
    const t = fixture({ webgpu: gpu.context });
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, device: gpu.device });
    renderer.draw(STILL, 0);
    await expect(renderer.ready).resolves.toBe("webgpu");
    expect(gpu.requestAdapter).not.toHaveBeenCalled();
    expect(gpu.pass.draw).toHaveBeenCalledExactlyOnceWith(3);
    expect(gpu.raw.queue.writeBuffer).toHaveBeenCalledOnce();
    const data = gpu.raw.queue.writeBuffer.mock.calls[0]?.[2] as unknown as Float32Array;
    expect(data[0]).toBe(0);
    expect(data[2]).toBe(22);
    expect(data[4]).toBe(0);
    expect(data[6]).toBe(40);
    expect(data[9]).toBe(-1);
    expect(t.canvas().getAttribute("aria-hidden")).toBe("true");
    expect(t.canvas().style.pointerEvents).toBe("none");
    renderer.destroy();
    expect(gpu.buffer.destroy).toHaveBeenCalledOnce();
    expect(gpu.context.unconfigure).toHaveBeenCalledOnce();
    expect(gpu.raw.destroy).not.toHaveBeenCalled();
  });

  it("reconfigures a stopped rotor's blade count without replacing the GPU resources", async () => {
    const gl = fakeGl();
    const t = fixture({ webgl2: gl });
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, device: null });
    await renderer.ready;
    renderer.draw(STILL, 0);
    renderer.configure({ ...CONFIG, outerBlades: 16, innerBlades: 37 });
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    expect(gl.uniform4f.mock.calls.at(-3)?.slice(1, 4)).toEqual([0, expect.closeTo(.48 / 1.08), 16]);
    expect(gl.uniform4f.mock.calls.at(-2)?.slice(1, 4)).toEqual([0, expect.closeTo(.28 / 1.08), 37]);
    expect(gl.createProgram).toHaveBeenCalledOnce();
    renderer.configure({ ...CONFIG, outerBlades: 16.1, innerBlades: 37.2 });
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    renderer.destroy();
  });

  it.each([1, 2, 16, 40, 128])("packs %i equally sized blades into a ring with gaps through their antialias footprint", async count => {
    const gl = fakeGl();
    const t = fixture({ webgl2: gl });
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, outerBlades: count, innerBlades: count, device: null });
    await renderer.ready;
    renderer.draw({ outerAngle: 7, innerAngle: -1 }, 0);
    const rings = gl.uniform4f.mock.calls.slice(0, 2).map(call => call.slice(1));
    expect(rings[0][0]).toBeCloseTo(7 - 2 * Math.PI);
    expect(rings[1][0]).toBeCloseTo(2 * Math.PI - 1);
    for (const [, radius, blades, markerRadius] of rings) {
      expect(blades).toBe(count);
      expect(markerRadius).toBeGreaterThan(0);
      if (count > 1) {
        const neighbourDistance = 2 * radius * Math.sin(Math.PI / count);
        // AA never exceeds 45% of the marker radius, even at a subpixel spacing.
        expect(2 * markerRadius * 1.45).toBeLessThan(neighbourDistance);
      }
    }
    expect(gl.drawArrays).toHaveBeenCalledExactlyOnceWith(gl.TRIANGLES, 0, 3);
    renderer.destroy();
  });

  it("allocates no GPU resources for missing blade data, wakes on known counts and releases them when removed", async () => {
    const gl = fakeGl();
    const t = fixture({ webgl2: gl });
    const renderer = createEngineSpoolRenderer(t.host, {
      preference: "webgl2", maxFps: 30, pixelRatio: 2, device: null,
    });
    await expect(renderer.ready).resolves.toBe("off");
    renderer.draw(STILL, 0);
    expect(t.getContext).not.toHaveBeenCalled();
    expect(t.canvas()).toBeNull();
    renderer.draw({ outerAngle: 1, innerAngle: 2 }, 50);
    expect(gl.drawArrays).not.toHaveBeenCalled();
    renderer.configure({ ...CONFIG, preference: "webgl2", outerBlades: Infinity, innerBlades: -5 });
    expect(t.getContext).not.toHaveBeenCalled();
    renderer.configure({ ...CONFIG, preference: "webgl2", outerBlades: 1000, innerBlades: 13.7 });
    await expect(renderer.ready).resolves.toBe("webgl2");
    expect(gl.drawArrays).toHaveBeenCalledOnce();
    expect(gl.uniform4f.mock.calls.at(-3)?.[1]).toBe(1);
    expect(gl.uniform4f.mock.calls.at(-3)?.[3]).toBe(128);
    expect(gl.uniform4f.mock.calls.at(-2)?.[3]).toBe(14);
    renderer.draw({ outerAngle: 1, innerAngle: null }, 100);
    expect(gl.uniform4f.mock.calls.at(-2)?.[3]).toBe(0);
    renderer.configure({ ...CONFIG, preference: "webgl2", outerBlades: 0, innerBlades: 0 });
    await expect(renderer.ready).resolves.toBe("off");
    expect(gl.deleteBuffer).toHaveBeenCalledOnce();
    expect(t.canvas()).toBeNull();
    renderer.destroy();
  });

  it("does not request an owned device for absent counts and disposes a late device when counts disappear", async () => {
    const gpu = fakeGpu();
    const pending = deferred<typeof gpu.raw>();
    gpu.requestDevice.mockReturnValueOnce(pending.promise);
    const t = fixture({ webgpu: gpu.context });
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, outerBlades: 0, innerBlades: 0 });
    await expect(renderer.ready).resolves.toBe("off");
    expect(gpu.requestAdapter).not.toHaveBeenCalled();
    renderer.configure(CONFIG);
    await Promise.resolve();
    expect(gpu.requestDevice).toHaveBeenCalledOnce();
    const becomingReady = renderer.ready;
    renderer.configure({ ...CONFIG, outerBlades: 0, innerBlades: 0 });
    pending.resolve(gpu.raw);
    await expect(becomingReady).resolves.toBe("off");
    expect(gpu.raw.destroy).toHaveBeenCalledOnce();
    expect(t.getContext).not.toHaveBeenCalled();
    expect(t.canvas()).toBeNull();
    renderer.destroy();
    expect(gpu.raw.destroy).toHaveBeenCalledOnce();
  });

  it("caps changed frames, skips identical frames and never installs an animation loop", async () => {
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const gl = fakeGl();
    const t = fixture({ webgl2: gl });
    const width = vi.spyOn(t.host, "clientWidth", "get");
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, device: null });
    await renderer.ready;
    renderer.draw(STILL, 0);
    renderer.draw(STILL, 50);
    renderer.draw({ outerAngle: .1, innerAngle: .2 }, 10);
    renderer.configure(CONFIG);
    expect(gl.drawArrays).toHaveBeenCalledOnce();
    renderer.draw({ outerAngle: .2, innerAngle: .3 }, 34);
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    expect(width).toHaveBeenCalledOnce();
    expect(raf).not.toHaveBeenCalled();
    expect(gl.bufferData).toHaveBeenCalledOnce();
    renderer.destroy();
  });

  it.each([
    [60, 60], [120, 120], [144, 144], [60, 240], [120, 240], [144, 240], [240, 240],
  ])("draws every %i Hz frame within a %i FPS cap despite timestamp roundoff", async (refreshRate, maxFps) => {
    const gl = fakeGl();
    const t = fixture({ webgl2: gl });
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, maxFps, device: null });
    await renderer.ready;
    for (let index = 0; index <= refreshRate * 3; index++) {
      renderer.draw({ outerAngle: index / 1000, innerAngle: index / 2000 }, index * 1000 / refreshRate);
    }
    expect(gl.drawArrays).toHaveBeenCalledTimes(refreshRate * 3 + 1);
    renderer.destroy();
  });

  it("carries the timing remainder across jitter instead of dropping below the selected cadence", async () => {
    const gl = fakeGl();
    const t = fixture({ webgl2: gl });
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, maxFps: 30, device: null });
    await renderer.ready;
    const jitter = [0, .2, -.2, .1, -.1];
    for (let index = 0; index <= 180; index++) {
      renderer.draw({ outerAngle: index / 1000, innerAngle: null }, index * 1000 / 60 + jitter[index % jitter.length]);
    }
    // Three seconds at a 30 FPS cap, allowing one slot at either endpoint.
    expect(gl.drawArrays.mock.calls.length).toBeGreaterThanOrEqual(90);
    expect(gl.drawArrays.mock.calls.length).toBeLessThanOrEqual(91);
    renderer.destroy();
  });

  it("discards all missed draw slots after a stall instead of accumulating catch-up work", async () => {
    const gl = fakeGl();
    const t = fixture({ webgl2: gl });
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, maxFps: 60, device: null });
    await renderer.ready;
    renderer.draw(STILL, 0);
    renderer.draw({ outerAngle: 1, innerAngle: 2 }, 2000);
    for (let index = 1; index <= 10; index++) {
      renderer.draw({ outerAngle: 1 + index / 100, innerAngle: 2 }, 2000 + index / 10);
    }
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    renderer.draw({ outerAngle: 2, innerAngle: 3 }, 2000 + 1000 / 60);
    expect(gl.drawArrays).toHaveBeenCalledTimes(3);
    renderer.destroy();
  });

  it("applies an increased frame cap without waiting for the previous interval", async () => {
    const gl = fakeGl();
    const t = fixture({ webgl2: gl });
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, maxFps: 1, device: null });
    await renderer.ready;
    renderer.draw(STILL, 0);
    renderer.configure({ ...CONFIG, maxFps: 120 });
    renderer.draw({ outerAngle: .1, innerAngle: .2 }, 1000 / 120);
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    expect(gl.createProgram).toHaveBeenCalledOnce();
    renderer.destroy();
  });

  it.each([[60, 22, 36], [120, 22, 36], [60, 23, 37], [120, 23, 37]])(
    "uses %i accepted FPS with %i/%i blades and preserves 50% versus 99% RPM", async (refreshRate, outerBlades, innerBlades) => {
    const gl = fakeGl();
    const t = fixture({ webgl2: gl });
    const renderer = createEngineSpoolRenderer(t.host, {
      ...CONFIG, maxFps: 1000, outerBlades, innerBlades, maxPatternStep: .45, device: null,
    });
    const motion = createEngineSpoolMotion();
    await renderer.ready;
    for (let index = 0; index <= refreshRate; index++) {
      renderer.draw(motion.update(index / refreshRate, { outer: .5, inner: .99 }, 60), index * 1000 / refreshRate);
    }
    const frames = renderedAngles(gl);
    expect(frames).toHaveLength(refreshRate + 1);
    for (let index = 1; index < frames.length; index++) {
      const outer = forwardAngle(frames[index - 1][0], frames[index][0]);
      const inner = forwardAngle(frames[index - 1][1], frames[index][1]);
      expect(outer).toBeCloseTo(TAU * .45 / 2 * .5, 5);
      expect(inner).toBeCloseTo(TAU * .45 / 2 * .99, 5);
      expect(outer / inner).toBeCloseTo(.5 / .99, 4);
      expect(inner * 2 / TAU).toBeLessThan(.5);
    }
    expect(renderer.getMotionStatus()).toEqual({
      fps: expect.closeTo(refreshRate), maxTurnsPerSecond: expect.closeTo(refreshRate * .45 / 2), limited: true,
    });
    renderer.destroy();
  });

  it("limits consecutive accepted draws at a 30 FPS cap on a 120 Hz client", async () => {
    const gl = fakeGl();
    const t = fixture({ webgl2: gl });
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, innerBlades: 36, device: null });
    const motion = createEngineSpoolMotion();
    await renderer.ready;
    for (let index = 0; index <= 120; index++) {
      renderer.draw(motion.update(index / 120, { outer: .5, inner: 1 }, 60), index * 1000 / 120);
    }
    const frames = renderedAngles(gl);
    expect(frames).toHaveLength(31);
    for (let index = 1; index < frames.length; index++) {
      expect(forwardAngle(frames[index - 1][0], frames[index][0])).toBeCloseTo(TAU * .45 / 2 * .5, 5);
      expect(forwardAngle(frames[index - 1][1], frames[index][1])).toBeCloseTo(TAU * .45 / 2, 5);
    }
    expect(renderer.getMotionStatus()).toEqual({
      fps: expect.closeTo(30), maxTurnsPerSecond: expect.closeTo(6.75), limited: true,
    });
    renderer.destroy();
  });

  it("keeps every jittered or stalled frame forward and discards excess rotation", async () => {
    const gl = fakeGl();
    const t = fixture({ webgl2: gl });
    const renderer = createEngineSpoolRenderer(t.host, {
      ...CONFIG, maxFps: 1000, innerBlades: 36, maxPatternStep: .3, device: null,
    });
    const motion = createEngineSpoolMotion();
    await renderer.ready;
    const timestamps = [0, 16, 33.7, 49, 1000, 1017, 1033];
    for (const at of timestamps) renderer.draw(motion.update(at / 1000, { outer: .6, inner: 1 }, 60), at);
    const frames = renderedAngles(gl);
    expect(frames).toHaveLength(timestamps.length);
    for (let index = 1; index < frames.length; index++) {
      const outer = forwardAngle(frames[index - 1][0], frames[index][0]);
      const inner = forwardAngle(frames[index - 1][1], frames[index][1]);
      expect(inner).toBeCloseTo(TAU * .3 / 2, 5);
      expect(outer / inner).toBeCloseTo(.6, 4);
    }
    // A slower new command after the stall does not replay the discarded turns.
    const maxAngle = TAU * 60 * 1.033;
    renderer.draw({ outerAngle: maxAngle * .6 + .0006, innerAngle: maxAngle + .001, maxAngle: maxAngle + .001 }, 1050);
    const following = renderedAngles(gl).at(-1)!;
    expect(forwardAngle(frames.at(-1)![1], following[1])).toBeCloseTo(.001, 5);
    expect(renderer.getMotionStatus().limited).toBe(false);
    renderer.destroy();
  });

  it.each([2, 22, 23, 36, 37])("keeps the selected speed with %i blades when the two-lobe pattern permits it", async count => {
    const gl = fakeGl();
    const t = fixture({ webgl2: gl });
    const renderer = createEngineSpoolRenderer(t.host, {
      ...CONFIG, maxFps: 1000, outerBlades: count, innerBlades: 0, device: null,
    });
    const motion = createEngineSpoolMotion();
    await renderer.ready;
    renderer.draw(motion.update(0, { outer: .99, inner: null }, 2), 0);
    renderer.draw(motion.update(1 / 60, { outer: .99, inner: null }, 2), 1000 / 60);
    expect(renderedAngles(gl).at(-1)![0]).toBeCloseTo(TAU * 2 * .99 / 60);
    expect(renderer.getMotionStatus()).toEqual({ fps: expect.closeTo(60), maxTurnsPerSecond: expect.closeTo(2), limited: false });
    renderer.destroy();
  });

  it("retains full-turn information in huge requested angles while packing only wrapped display phases", async () => {
    const gl = fakeGl();
    const t = fixture({ webgl2: gl });
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, maxFps: 1000, innerBlades: 36, device: null });
    await renderer.ready;
    const start = TAU * 1e6 + .25;
    renderer.draw({ outerAngle: start * .5, innerAngle: start, maxAngle: start }, 0);
    renderer.draw({ outerAngle: start * .5 + 5 * TAU, innerAngle: start + 10 * TAU, maxAngle: start + 10 * TAU }, 1000 / 60);
    const frames = renderedAngles(gl);
    expect(forwardAngle(frames[0][0], frames[1][0])).toBeCloseTo(TAU * .45 / 2 * .5, 5);
    expect(forwardAngle(frames[0][1], frames[1][1])).toBeCloseTo(TAU * .45 / 2, 5);
    for (const frame of frames) for (const angle of frame) {
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(TAU);
    }
    renderer.destroy();
  });

  it("limits legacy frames without a full-scale reference and rebases reset phases without reversing", async () => {
    const gl = fakeGl();
    const t = fixture({ webgl2: gl });
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, maxFps: 1000, innerBlades: 36, device: null });
    await renderer.ready;
    renderer.draw(STILL, 0);
    renderer.draw({ outerAngle: 5, innerAngle: 10 }, 17);
    const frame = renderedAngles(gl).at(-1)!;
    expect(frame[0]).toBeCloseTo(TAU * .45 / 2 * .5, 5);
    expect(frame[1]).toBeCloseTo(TAU * .45 / 2, 5);
    expect(renderer.getMotionStatus().maxTurnsPerSecond).toBeNull();
    renderer.draw(STILL, 1);
    expect(renderedAngles(gl)).toHaveLength(2);
    renderer.draw({ outerAngle: .01, innerAngle: .02 }, 18);
    const next = renderedAngles(gl).at(-1)!;
    expect(forwardAngle(frame[0], next[0])).toBeCloseTo(.01, 5);
    expect(forwardAngle(frame[1], next[1])).toBeCloseTo(.02, 5);
    renderer.destroy();
  });

  it("redraws changed geometry without advancing the displayed phase or its measured cadence", async () => {
    const gl = fakeGl();
    const t = fixture({ webgl2: gl });
    vi.stubGlobal("devicePixelRatio", 2);
    const settings = { ...CONFIG, maxFps: 1000, innerBlades: 36, device: null };
    const renderer = createEngineSpoolRenderer(t.host, settings);
    const motion = createEngineSpoolMotion();
    await renderer.ready;
    renderer.draw(motion.update(0, { outer: .5, inner: .99 }, 60), 0);
    renderer.draw(motion.update(1 / 60, { outer: .5, inner: .99 }, 60), 1000 / 60);
    const previous = renderedAngles(gl).at(-1);
    const status = renderer.getMotionStatus();
    renderer.configure({ ...settings, pixelRatio: 1 });
    expect(renderedAngles(gl)).toHaveLength(3);
    expect(renderedAngles(gl).at(-1)).toEqual(previous);
    expect(renderer.getMotionStatus()).toEqual(status);
    renderer.draw(motion.update(2 / 60, { outer: .5, inner: .99 }, 60), 2000 / 60);
    expect(forwardAngle(previous![1], renderedAngles(gl).at(-1)![1])).toBeCloseTo(TAU * .45 / 2 * .99, 5);
    expect(renderer.getMotionStatus().fps).toBeCloseTo(60);
    renderer.destroy();
  });

  it("does not consume a skipped motion request when a forced geometry redraw occurs", async () => {
    const gl = fakeGl();
    const t = fixture({ webgl2: gl });
    vi.stubGlobal("devicePixelRatio", 2);
    const settings = { ...CONFIG, innerBlades: 36, device: null };
    const renderer = createEngineSpoolRenderer(t.host, settings);
    const motion = createEngineSpoolMotion();
    await renderer.ready;
    renderer.draw(motion.update(0, { outer: .5, inner: .99 }, 60), 0);
    renderer.draw(motion.update(.01, { outer: .5, inner: .99 }, 60), 10);
    expect(renderedAngles(gl)).toHaveLength(1);
    const status = renderer.getMotionStatus();
    renderer.configure({ ...settings, pixelRatio: 1 });
    expect(renderedAngles(gl)).toEqual([[0, 0], [0, 0]]);
    expect(renderer.getMotionStatus()).toEqual(status);
    // The forced draw neither consumes the pending rotation nor shifts the FPS
    // deadline from 33.33 ms to 43.33 ms.
    renderer.draw(motion.update(.034, { outer: .5, inner: .99 }, 60), 34);
    const frames = renderedAngles(gl);
    expect(frames).toHaveLength(3);
    expect(frames[2][0]).toBeCloseTo(TAU * .45 / 2 * .5, 5);
    expect(frames[2][1]).toBeCloseTo(TAU * .45 / 2 * .99, 5);
    expect(renderer.getMotionStatus().fps).toBeCloseTo(1000 / 34);
    renderer.destroy();
  });

  it.each(["webgl2", "webgl1"] as const)("updates both shaft colors through the existing %s uniforms without changing their phases or geometry", async preference => {
    const gl = fakeGl();
    const t = fixture({ [preference === "webgl1" ? "webgl" : "webgl2"]: gl });
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, preference, device: null });
    await renderer.ready;
    renderer.draw({ outerAngle: .7, innerAngle: 1.1, maxAngle: 2 }, 0);
    const rings = gl.uniform4f.mock.calls.slice(0, 2).map(call => call.slice(1));
    const status = renderer.getMotionStatus();
    renderer.setAccentColor("#Ff8000");
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    expect(gl.uniform4f.mock.calls.slice(-3, -1).map(call => call.slice(1))).toEqual(rings);
    expect(gl.uniform4f.mock.calls.at(-1)?.slice(1)).toEqual([
      108, 1, expect.closeTo(128 / 255), 0,
    ]);
    expect(renderer.getMotionStatus()).toEqual(status);
    renderer.setAccentColor("#ff8000");
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    renderer.setAccentColor("#abc");
    expect(gl.drawArrays).toHaveBeenCalledTimes(3);
    expect(gl.uniform4f.mock.calls.at(-1)?.slice(1)).toEqual([108, -1, 0, 0]);
    for (const color of ["orange", "#1234567", " #123456", "#gg0000", null]) renderer.setAccentColor(color);
    expect(gl.drawArrays).toHaveBeenCalledTimes(3);
    renderer.setAccentColor("#000000");
    expect(gl.uniform4f.mock.calls.at(-1)?.slice(1)).toEqual([108, 0, 0, 0]);
    renderer.setAccentColor(null);
    expect(gl.drawArrays).toHaveBeenCalledTimes(5);
    expect(gl.uniform4f.mock.calls.slice(-3, -1).map(call => call.slice(1))).toEqual(rings);
    expect(gl.createProgram).toHaveBeenCalledOnce();
    expect(gl.bufferData).toHaveBeenCalledOnce();
    renderer.destroy();
    renderer.setAccentColor("#123456");
    expect(gl.drawArrays).toHaveBeenCalledTimes(5);
  });

  it("packs a pending accent into the existing 48-byte WebGPU uniform allocation", async () => {
    const gpu = fakeGpu();
    const t = fixture({ webgpu: gpu.context });
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, device: gpu.device });
    renderer.setAccentColor("#2468ac");
    renderer.draw(STILL, 0);
    await renderer.ready;
    expect(gpu.raw.createBuffer).toHaveBeenCalledExactlyOnceWith({ size: 48, usage: 64 | 8 });
    const data = gpu.raw.queue.writeBuffer.mock.calls.at(-1)?.[2] as unknown as Float32Array;
    expect(data.byteLength).toBe(48);
    expect([...data.slice(9)]).toEqual([expect.closeTo(36 / 255), expect.closeTo(104 / 255), expect.closeTo(172 / 255)]);
    expect(gpu.pass.draw).toHaveBeenCalledExactlyOnceWith(3);
    renderer.setAccentColor("#2468AC");
    expect(gpu.raw.queue.writeBuffer).toHaveBeenCalledOnce();
    renderer.setAccentColor(null);
    expect([...data.slice(9)]).toEqual([-1, 0, 0]);
    expect(gpu.raw.queue.writeBuffer).toHaveBeenCalledTimes(2);
    expect(gpu.raw.createBuffer).toHaveBeenCalledOnce();
    renderer.destroy();
  });

  it("changes only color while a motion request is waiting for its FPS deadline", async () => {
    const gl = fakeGl();
    const t = fixture({ webgl2: gl });
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, device: null });
    const motion = createEngineSpoolMotion();
    await renderer.ready;
    renderer.draw(motion.update(0, { outer: .5, inner: .99 }, 60), 0);
    renderer.draw(motion.update(.01, { outer: .5, inner: .99 }, 60), 10);
    const status = renderer.getMotionStatus();
    expect(renderedAngles(gl)).toEqual([[0, 0]]);
    renderer.setAccentColor("#ff6600");
    expect(renderedAngles(gl)).toEqual([[0, 0], [0, 0]]);
    expect(renderer.getMotionStatus()).toEqual(status);
    renderer.draw(motion.update(.034, { outer: .5, inner: .99 }, 60), 34);
    const moving = renderedAngles(gl).at(-1)!;
    expect(renderedAngles(gl)).toHaveLength(3);
    expect(moving[0]).toBeCloseTo(TAU * .45 / 2 * .5, 5);
    expect(moving[1]).toBeCloseTo(TAU * .45 / 2 * .99, 5);
    expect(renderer.getMotionStatus().fps).toBeCloseTo(1000 / 34);
    const movingStatus = renderer.getMotionStatus();
    renderer.setAccentColor(null);
    expect(renderedAngles(gl).at(-1)).toEqual(moving);
    expect(renderer.getMotionStatus()).toEqual(movingStatus);
    renderer.draw(motion.update(.05, { outer: .5, inner: .99 }, 60), 50);
    expect(renderedAngles(gl)).toHaveLength(4);
    renderer.draw(motion.update(.067, { outer: .5, inner: .99 }, 60), 67);
    expect(renderedAngles(gl)).toHaveLength(5);
    expect(forwardAngle(moving[1], renderedAngles(gl).at(-1)![1])).toBeCloseTo(TAU * .45 / 2 * .99, 5);
    renderer.destroy();
  });

  it("falls through a rejected GPU pipeline and GL2 compile failure to GL1 on fresh canvases", async () => {
    const gpu = fakeGpu();
    gpu.raw.createRenderPipelineAsync.mockRejectedValueOnce(new Error("GPU unavailable"));
    const gl2 = fakeGl({ compile: false });
    const gl1 = fakeGl();
    const t = fixture({ webgpu: gpu.context, webgl2: gl2, webgl: gl1 });
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, device: gpu.device });
    renderer.draw(STILL, 0);
    await expect(renderer.ready).resolves.toBe("webgl1");
    expect(t.host.querySelectorAll("canvas")).toHaveLength(1);
    expect(gl2.deleteShader).toHaveBeenCalledOnce();
    expect(gl1.drawArrays).toHaveBeenCalledOnce();
    expect(renderer.status.reason).toContain("unavailable");
    expect(gpu.raw.destroy).not.toHaveBeenCalled();
    renderer.destroy();
  });

  it("cleans a failed GL link and retains numeric DOM when every backend is unavailable", async () => {
    const gl = fakeGl({ link: false });
    const t = fixture({ webgl2: gl });
    t.host.append("N1 30%");
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, device: null });
    await expect(renderer.ready).resolves.toBe("off");
    renderer.draw(STILL, 0);
    expect(gl.deleteProgram).toHaveBeenCalledOnce();
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(t.host.textContent).toBe("N1 30%");
    expect(t.canvas()).toBeNull();
    renderer.destroy();
  });

  it("skips hidden, detached and background displays and resumes with the current frame", async () => {
    const gl = fakeGl();
    const t = fixture({ webgl2: gl });
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, device: null });
    await renderer.ready;
    t.host.hidden = true;
    renderer.draw(STILL, 0);
    t.host.hidden = false;
    t.host.remove();
    renderer.draw({ outerAngle: .1, innerAngle: .2 }, 50);
    document.body.append(t.host);
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    renderer.draw({ outerAngle: .2, innerAngle: .3 }, 100);
    expect(gl.drawArrays).not.toHaveBeenCalled();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(gl.drawArrays).toHaveBeenCalledOnce();
    expect(gl.uniform4f.mock.calls[0][1]).toBeCloseTo(.2);
    renderer.destroy();
  });

  it("uses cached observer sizing and visibility, and redraws a paused frame after resize", async () => {
    let resized!: ResizeObserverCallback;
    let intersected!: IntersectionObserverCallback;
    const disconnectResize = vi.fn();
    const disconnectIntersection = vi.fn();
    vi.stubGlobal("ResizeObserver", class { constructor(cb: ResizeObserverCallback) { resized = cb; } observe() {} disconnect = disconnectResize; });
    vi.stubGlobal("IntersectionObserver", class { constructor(cb: IntersectionObserverCallback) { intersected = cb; } observe() {} disconnect = disconnectIntersection; });
    const gl = fakeGl();
    const t = fixture({ webgl2: gl });
    vi.stubGlobal("devicePixelRatio", 3);
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, device: null });
    await renderer.ready;
    renderer.draw(STILL, 0);
    expect(t.canvas().width).toBe(216);
    expect(renderer.canDraw()).toBe(true);
    intersected([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(renderer.canDraw()).toBe(false);
    renderer.draw({ outerAngle: .5, innerAngle: null }, 50);
    expect(gl.drawArrays).toHaveBeenCalledOnce();
    resized([{ contentRect: { width: 200, height: 200 } } as ResizeObserverEntry], {} as ResizeObserver);
    expect(gl.drawArrays).toHaveBeenCalledOnce();
    intersected([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(renderer.canDraw()).toBe(true);
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    expect(t.canvas().width).toBe(432);
    expect(gl.uniform4f.mock.calls.at(-1)?.slice(1)).toEqual([432, -1, 0, 0]);
    renderer.destroy();
    expect(renderer.canDraw()).toBe(false);
    expect(disconnectResize).toHaveBeenCalledOnce();
    expect(disconnectIntersection).toHaveBeenCalledOnce();
  });

  it("releases resources at zero FPS, then restarts with the latest held frame", async () => {
    const gl = fakeGl();
    const t = fixture({ webgl2: gl });
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, device: null });
    await renderer.ready;
    renderer.draw(STILL, 0);
    const old = t.canvas();
    renderer.configure({ ...CONFIG, maxFps: 0 });
    await expect(renderer.ready).resolves.toBe("off");
    expect(gl.deleteBuffer).toHaveBeenCalledOnce();
    expect(t.canvas()).toBeNull();
    renderer.draw({ outerAngle: 1, innerAngle: null }, 50);
    expect(gl.drawArrays).toHaveBeenCalledOnce();
    renderer.configure(CONFIG);
    await expect(renderer.ready).resolves.toBe("webgl2");
    expect(t.canvas()).not.toBe(old);
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    renderer.destroy();
  });

  it("downgrades a lost borrowed WebGPU device and then a lost GL2 context", async () => {
    const gpu = fakeGpu();
    const gl2 = fakeGl();
    const gl1 = fakeGl();
    const t = fixture({ webgpu: gpu.context, webgl2: gl2, webgl: gl1 });
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, device: gpu.device });
    await renderer.ready;
    renderer.draw(STILL, 0);
    const gpuCanvas = t.canvas();
    gpu.loss.resolve({ reason: "unknown", message: "device lost" });
    await Promise.resolve();
    await expect(renderer.ready).resolves.toBe("webgl2");
    expect(t.canvas()).not.toBe(gpuCanvas);
    const glCanvas = t.canvas();
    glCanvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    await expect(renderer.ready).resolves.toBe("webgl1");
    expect(t.canvas()).not.toBe(glCanvas);
    expect(gpu.raw.destroy).not.toHaveBeenCalled();
    expect(gl1.drawArrays).toHaveBeenCalledOnce();
    renderer.destroy();
  });

  it("requests one phone-owned device and releases it when drawing is turned off", async () => {
    const gpu = fakeGpu();
    const t = fixture({ webgpu: gpu.context });
    const renderer = createEngineSpoolRenderer(t.host, CONFIG);
    await renderer.ready;
    renderer.draw(STILL, 0);
    renderer.configure({ ...CONFIG, pixelRatio: 1 });
    expect(gpu.requestAdapter).toHaveBeenCalledOnce();
    expect(gpu.requestDevice).toHaveBeenCalledOnce();
    renderer.configure({ ...CONFIG, preference: "off" });
    await renderer.ready;
    expect(gpu.raw.destroy).toHaveBeenCalledOnce();
    renderer.destroy();
    expect(gpu.raw.destroy).toHaveBeenCalledOnce();
  });

  it("cleans late pipeline creation after disposal without attaching a canvas", async () => {
    const gpu = fakeGpu();
    const pending = deferred<{ getBindGroupLayout(): object }>();
    gpu.raw.createRenderPipelineAsync.mockReturnValueOnce(pending.promise);
    const t = fixture({ webgpu: gpu.context });
    const renderer = createEngineSpoolRenderer(t.host, { ...CONFIG, device: gpu.device });
    await Promise.resolve();
    renderer.destroy();
    pending.resolve({ getBindGroupLayout: () => ({}) });
    await expect(renderer.ready).resolves.toBe("off");
    expect(t.canvas()).toBeNull();
    expect(gpu.buffer.destroy).toHaveBeenCalledOnce();
    expect(gpu.raw.destroy).not.toHaveBeenCalled();
  });
});
