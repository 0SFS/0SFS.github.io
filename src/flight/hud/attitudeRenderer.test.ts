// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAttitudeRenderer, describeAttitudeRendererStatus } from "./attitudeRenderer";
import type { AttitudeState } from "./attitudeIndicator";

const LEVEL: AttitudeState = {
  rollRad: 0, pitchRad: 0, headingRad: 0, northVelocityFps: 200, eastVelocityFps: 0, verticalSpeedFps: 0,
};
const CENTRED = { x: 0, y: 0, active: false };

/** jsdom has no canvas; this one counts what is asked of it. */
function stubCanvas() {
  const calls: string[] = [];
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((kind: string) => {
    if (kind !== "2d") return null;
    return new Proxy({}, {
      get: (_, name) => (...args: unknown[]) => {
        calls.push(String(name));
        if (name === "createImageData") return { data: new Uint8ClampedArray(Number(args[0]) * Number(args[1]) * 4) };
        if (name === "measureText") return { width: 10 };
        return undefined;
      },
    });
  }) as never);
  const host = document.createElement("div");
  document.body.append(host);
  return {
    host, calls, getContext,
    canvas: () => host.querySelector("canvas")!,
    frames: () => calls.filter(name => name === "clearRect").length,
  };
}

/** A device that gets as far as building pipelines, and fails there. */
function failingDevice(): GPUDevice {
  vi.stubGlobal("GPUShaderStage", { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 });
  Object.defineProperty(navigator, "gpu", { configurable: true, value: { getPreferredCanvasFormat: () => "bgra8unorm" } });
  return {
    createShaderModule: () => ({}),
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    createRenderPipelineAsync: () => Promise.reject(new Error("pipeline rejected")),
  } as unknown as GPUDevice;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "gpu");
});

describe("attitude renderer", () => {
  it("draws with Canvas 2D when the globe has no WebGPU device", async () => {
    const t = stubCanvas();
    const renderer = createAttitudeRenderer(t.host);
    await expect(renderer.ready).resolves.toBe("canvas2d");
    renderer.draw(LEVEL, CENTRED);
    expect(t.frames()).toBe(1);
    renderer.destroy();
  });

  it("skips a frame that would draw the same picture", async () => {
    const t = stubCanvas();
    const renderer = createAttitudeRenderer(t.host);
    await renderer.ready;
    renderer.draw(LEVEL, CENTRED);
    renderer.draw({ ...LEVEL }, { ...CENTRED });
    expect(t.frames()).toBe(1);
    renderer.draw({ ...LEVEL, rollRad: 0.1 }, CENTRED);
    renderer.draw({ ...LEVEL, rollRad: 0.1 }, { x: 0.2, y: 0, active: true });
    expect(t.frames()).toBe(3);
    renderer.destroy();
  });

  it("falls back to Canvas 2D, and draws the frame it was holding, when WebGPU cannot build", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = stubCanvas();
    const renderer = createAttitudeRenderer(t.host, { device: failingDevice() });
    // Asked to draw before the backend is known: held, not dropped.
    renderer.draw(LEVEL, CENTRED);
    expect(t.frames()).toBe(0);
    await expect(renderer.ready).resolves.toBe("canvas2d");
    expect(t.frames()).toBe(1);
    // The canvas was never claimed for WebGPU, or 2D could not have it.
    expect(t.getContext.mock.calls.map(([kind]) => kind)).not.toContain("webgpu");
    renderer.destroy();
  });

  it("sizes the backing store to the screen's pixel density", async () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const t = stubCanvas();
    const renderer = createAttitudeRenderer(t.host);
    await renderer.ready;
    renderer.draw(LEVEL, CENTRED);
    expect([t.canvas().width, t.canvas().height]).toEqual([440, 440]);
    renderer.destroy();
  });

  it("draws into a canvas of its own, which the host keeps the pointer for", async () => {
    const t = stubCanvas();
    const renderer = createAttitudeRenderer(t.host);
    await renderer.ready;
    expect(t.host.children).toHaveLength(1);
    expect(t.canvas().style.pointerEvents).toBe("none");
    renderer.destroy();
    expect(t.host.children).toHaveLength(0);
  });

  it("switches backend on a fresh canvas and redraws the last frame, even while paused", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = stubCanvas();
    const statuses: unknown[] = [];
    const renderer = createAttitudeRenderer(t.host, { device: failingDevice(), preference: "canvas2d", onStatusChange: status => statuses.push(status) });
    await renderer.ready;
    renderer.draw(LEVEL, CENTRED);
    const first = t.canvas();
    renderer.setPreference("webgpu");
    await expect(renderer.ready).resolves.toBe("canvas2d");
    expect(t.canvas()).not.toBe(first);
    expect(t.host.querySelectorAll("canvas")).toHaveLength(1);
    // No new draw call came in, yet the new canvas shows the aircraft.
    expect(t.frames()).toBe(2);
    expect(renderer.status).toEqual({
      preference: "webgpu", backend: "canvas2d", reason: "WebGPU could not build the instrument's pipelines here.",
    });
    expect(statuses.at(-1)).toEqual(renderer.status);
    renderer.destroy();
  });

  it("says why when WebGPU is asked for and the globe runs on WebGL", async () => {
    const t = stubCanvas();
    const renderer = createAttitudeRenderer(t.host, { preference: "webgpu" });
    await expect(renderer.ready).resolves.toBe("canvas2d");
    expect(renderer.status.reason).toMatch(/WebGL/);
    renderer.destroy();
  });

  it("draws nothing once destroyed", async () => {
    const t = stubCanvas();
    const renderer = createAttitudeRenderer(t.host);
    await renderer.ready;
    renderer.destroy();
    renderer.draw(LEVEL, CENTRED);
    expect(t.frames()).toBe(0);
  });
});

describe("attitude renderer status note", () => {
  it("says what draws, and why it is not what was asked for", () => {
    expect(describeAttitudeRendererStatus({ preference: "auto", backend: null, reason: null })).toBeNull();
    expect(describeAttitudeRendererStatus({ preference: "auto", backend: "webgpu", reason: null }))
      .toBe("Drawing with WebGPU, on the globe's GPU device.");
    expect(describeAttitudeRendererStatus({ preference: "webgpu", backend: "canvas2d", reason: "WebGPU is unavailable." }))
      .toBe("Drawing with Canvas 2D. WebGPU is unavailable.");
  });
});
