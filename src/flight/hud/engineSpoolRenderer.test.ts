// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngineSpoolRenderer, type EngineSpoolConfiguration } from "./engineSpoolRenderer";

const CONFIG: EngineSpoolConfiguration = { preference: "auto", maxFps: 30, pixelRatio: 2, outerBlades: 22, innerBlades: 40 };
const STILL = { outerAngle: 0, innerAngle: 0 };

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
    expect(data[9]).toBe(0);
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
    intersected([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    renderer.draw({ outerAngle: .5, innerAngle: null }, 50);
    expect(gl.drawArrays).toHaveBeenCalledOnce();
    resized([{ contentRect: { width: 200, height: 200 } } as ResizeObserverEntry], {} as ResizeObserver);
    expect(gl.drawArrays).toHaveBeenCalledOnce();
    intersected([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    expect(t.canvas().width).toBe(432);
    expect(gl.uniform4f.mock.calls.at(-1)?.slice(1)).toEqual([432, 0, 0, 0]);
    renderer.destroy();
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
