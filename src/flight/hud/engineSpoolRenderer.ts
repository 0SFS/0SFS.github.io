/** Aircraft shaft markers: one small transparent GPU draw, driven by the existing HUD tick. */
export type EngineSpoolPreference = "auto" | "webgpu" | "webgl2" | "webgl1" | "off";
export type EngineSpoolBackend = "webgpu" | "webgl2" | "webgl1" | "off";
export interface EngineSpoolFrame { outerAngle: number; innerAngle: number | null }
export interface EngineSpoolConfiguration {
  preference: EngineSpoolPreference;
  maxFps: number;
  pixelRatio: number;
  /** One marker per represented rotating blade. Missing counts draw no markers. */
  outerBlades?: number;
  innerBlades?: number;
}
export interface EngineSpoolStatus {
  preference: EngineSpoolPreference;
  backend: EngineSpoolBackend | null;
  reason: string | null;
}
export type EngineSpoolRendererStatus = EngineSpoolStatus;
export interface EngineSpoolOptions extends EngineSpoolConfiguration {
  /** A borrowed globe device; null forbids a second device. Undefined permits one phone-owned device. */
  device?: GPUDevice | null;
  onStatus?(status: EngineSpoolStatus): void;
}
export interface EngineSpoolRenderer {
  readonly ready: Promise<EngineSpoolBackend>;
  readonly status: EngineSpoolStatus;
  draw(frame: EngineSpoolFrame, nowMs: number): void;
  configure(configuration: EngineSpoolConfiguration): void;
  destroy(): void;
}

interface Painter {
  kind: Exclude<EngineSpoolBackend, "off">;
  canvas: HTMLCanvasElement;
  paint(data: Float32Array<ArrayBuffer>, side: number): void;
  destroy(): void;
}

// Leave room for markers straddling the outer circle instead of clipping them at the canvas edge.
const CANVAS_SCALE = 1.08;
const TAU = 2 * Math.PI;
const bladeCount = (count: number | undefined): number => typeof count === "number" && Number.isFinite(count)
  ? Math.min(128, Math.max(0, Math.round(count))) : 0;
const drawingDisabled = (config: EngineSpoolConfiguration): boolean => config.preference === "off" || config.maxFps <= 0
  || ((config.outerBlades ?? 0) === 0 && (config.innerBlades ?? 0) === 0);

// Three vec4s: each ring's phase/radius/blade count/marker radius, then backing side.
// The nearest angular sector identifies a single marker in constant work, whatever the blade count.
const GPU_SHADER = `
struct Frame { outer: vec4f, inner: vec4f, view: vec4f }
@group(0) @binding(0) var<uniform> frame: Frame;
@vertex fn vertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = array<vec2f, 3>(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
  return vec4f(p[i], 0., 1.);
}
fn blades(p: vec2f, ring: vec4f) -> f32 {
  if (ring.z < .5) { return 0.; }
  let aa = min(1. / frame.view.x, ring.w * .45);
  if (abs(length(p) - ring.y) > ring.w + aa) { return 0.; }
  let sectorAngle = 6.28318530718 / ring.z;
  let angle = floor((atan2(p.x, -p.y) - ring.x) / sectorAngle + .5) * sectorAngle + ring.x;
  let centre = vec2f(sin(angle), -cos(angle)) * ring.y;
  return 1. - smoothstep(ring.w - aa, ring.w + aa, distance(p, centre));
}
@fragment fn fragment(@builtin(position) at: vec4f) -> @location(0) vec4f {
  let p = at.xy / frame.view.x - vec2f(.5);
  let a = blades(p, frame.outer);
  let b = blades(p, frame.inner);
  let rgb = vec3f(.74, .84, .91) * a + vec3f(.91, .71, .28) * b * (1. - a);
  return vec4f(rgb, a + b * (1. - a));
}`;

function glSources(webgl2: boolean): [string, string] {
  const version = webgl2 ? "#version 300 es\n" : "";
  return [
    `${version}${webgl2 ? "in" : "attribute"} vec2 vertex;
void main() { gl_Position = vec4(vertex, 0.0, 1.0); }`,
    `${version}#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec4 outerRing;
uniform vec4 innerRing;
uniform vec4 view;
${webgl2 ? "out vec4 colour;" : ""}
float blades(vec2 p, vec4 ring) {
  if (ring.z < .5) { return 0.0; }
  float aa = min(1.0 / view.x, ring.w * .45);
  if (abs(length(p) - ring.y) > ring.w + aa) { return 0.0; }
  float sectorAngle = 6.28318530718 / ring.z;
  float angle = floor((atan(p.x, -p.y) - ring.x) / sectorAngle + .5) * sectorAngle + ring.x;
  vec2 centre = vec2(sin(angle), -cos(angle)) * ring.y;
  return 1.0 - smoothstep(ring.w - aa, ring.w + aa, distance(p, centre));
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, view.x - gl_FragCoord.y) / view.x - vec2(0.5);
  float a = blades(p, outerRing);
  float b = blades(p, innerRing);
  vec3 rgb = vec3(.74, .84, .91) * a + vec3(.91, .71, .28) * b * (1.0 - a);
  ${webgl2 ? "colour" : "gl_FragColor"} = vec4(rgb, a + b * (1.0 - a));
}`,
  ];
}

async function gpuPainter(canvas: HTMLCanvasElement, device: GPUDevice): Promise<Painter> {
  const gpu = navigator.gpu;
  if (!gpu) throw new Error("WebGPU is unavailable.");
  const format = gpu.getPreferredCanvasFormat();
  const module = device.createShaderModule({ label: "engine shaft orbs", code: GPU_SHADER });
  // Build before claiming the canvas; every fallback still gets a fresh canvas.
  const pipeline = await device.createRenderPipelineAsync({
    label: "engine shaft orbs", layout: "auto",
    vertex: { module, entryPoint: "vertex" },
    fragment: { module, entryPoint: "fragment", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });
  const context = canvas.getContext("webgpu");
  if (!context) throw new Error("WebGPU canvas is unavailable.");
  let buffer: GPUBuffer | null = null;
  try {
    context.configure({ device, format, alphaMode: "premultiplied" });
    buffer = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    // Babylon and @webgpu/types declare the same browser object with different nominal brands.
    const layout = pipeline.getBindGroupLayout(0) as GPUBindGroupLayout;
    const group = device.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer } }] });
    const uniforms = buffer;
    return {
      kind: "webgpu", canvas,
      paint(data) {
        device.queue.writeBuffer(uniforms, 0, data);
        const encoder = device.createCommandEncoder({ label: "engine shaft orbs" });
        const pass = encoder.beginRenderPass({ colorAttachments: [{
          view: context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear", storeOp: "store",
        }] });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, group);
        pass.draw(3);
        pass.end();
        device.queue.submit([encoder.finish()]);
      },
      destroy() { uniforms.destroy(); context.unconfigure(); },
    };
  } catch (error) {
    buffer?.destroy();
    context.unconfigure();
    throw error;
  }
}

function glPainter(canvas: HTMLCanvasElement, kind: "webgl2" | "webgl1", onLoss: () => void): Painter {
  const gl = canvas.getContext(kind === "webgl2" ? "webgl2" : "webgl", {
    alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
    // A stopped engine must retain its last markers without another draw.
    preserveDrawingBuffer: true,
  }) as WebGLRenderingContext | WebGL2RenderingContext | null;
  if (!gl) throw new Error(`${kind} is unavailable.`);
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let released = false;
  const lost = (event: Event): void => { event.preventDefault(); onLoss(); };
  const release = (): void => {
    if (released) return;
    released = true;
    canvas.removeEventListener("webglcontextlost", lost);
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
  try {
    const sources = glSources(kind === "webgl2");
    for (const [index, source] of sources.entries()) {
      const shader = gl.createShader(index === 0 ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER);
      if (!shader) throw new Error("Could not allocate orb shader.");
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Could not compile orb shader.");
    }
    program = gl.createProgram();
    if (!program) throw new Error("Could not allocate orb program.");
    for (const shader of shaders) gl.attachShader(program, shader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Could not link orb program.");
    const position = gl.getAttribLocation(program, "vertex");
    const outer = gl.getUniformLocation(program, "outerRing");
    const inner = gl.getUniformLocation(program, "innerRing");
    const view = gl.getUniformLocation(program, "view");
    if (position < 0 || !outer || !inner || !view) throw new Error("Orb shader inputs are unavailable.");
    buffer = gl.createBuffer();
    if (!buffer) throw new Error("Could not allocate orb triangle.");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.useProgram(program);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    canvas.addEventListener("webglcontextlost", lost);
    return {
      kind, canvas,
      paint(data, side) {
        gl.viewport(0, 0, side, side);
        gl.uniform4f(outer, data[0], data[1], data[2], data[3]);
        gl.uniform4f(inner, data[4], data[5], data[6], data[7]);
        gl.uniform4f(view, data[8], data[9], 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      destroy: release,
    };
  } catch (error) { release(); throw error; }
}

/** No RAF or timer: callers own simulation time and the existing HUD frame cadence. */
export function createEngineSpoolRenderer(host: HTMLElement, options: EngineSpoolOptions): EngineSpoolRenderer {
  let config: EngineSpoolConfiguration = { ...options, outerBlades: bladeCount(options.outerBlades), innerBlades: bladeCount(options.innerBlades) };
  let status: EngineSpoolStatus = { preference: config.preference, backend: null, reason: null };
  let painter: Painter | null = null;
  let generation = 0;
  let destroyed = false;
  let cssSize = host.clientWidth || 68;
  let inView = true;
  let last: { frame: EngineSpoolFrame; now: number } | null = null;
  let lastDrawTime = Number.NEGATIVE_INFINITY;
  let drawnOuter = NaN;
  let drawnInner: number | null = NaN;
  let drawnSide = 0;
  let drawnOuterBlades = -1;
  let drawnInnerBlades = -1;
  let ownedDevice: GPUDevice | null = null;
  let devicePromise: Promise<GPUDevice | null> | null = null;
  let gpuUnavailable = false;
  const data = new Float32Array(12);
  const ring = (angle: number, radius: number, count: number, offset: number): void => {
    const scaledRadius = radius / CANVAS_SCALE;
    data[offset] = ((angle % TAU) + TAU) % TAU;
    data[offset + 1] = scaledRadius;
    data[offset + 2] = count;
    // Dense blade rows retain gaps, including the antialias footprint. Every blade in a row is equal.
    data[offset + 3] = Math.min(.035 / CANVAS_SCALE, scaledRadius * Math.sin(Math.PI / Math.max(2, count)) * .64);
  };
  const releaseOwnedDevice = (): void => {
    if (!ownedDevice) return;
    ownedDevice.destroy();
    ownedDevice = null;
    devicePromise = null;
  };

  const publish = (backend: EngineSpoolBackend | null, reason: string | null): void => {
    status = { preference: config.preference, backend, reason };
    options.onStatus?.({ ...status });
  };
  const release = (): void => {
    const old = painter;
    painter = null;
    if (old) { old.destroy(); old.canvas.remove(); }
    drawnOuter = NaN;
    drawnInner = NaN;
    drawnSide = 0;
    drawnOuterBlades = drawnInnerBlades = -1;
    lastDrawTime = Number.NEGATIVE_INFINITY;
  };
  const freshCanvas = (): HTMLCanvasElement => {
    const canvas = host.ownerDocument.createElement("canvas");
    canvas.className = "flight-engine__orb-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;inset:-4%;width:108%;height:108%;pointer-events:none;z-index:2";
    return canvas;
  };
  const visible = (): boolean => host.isConnected && !host.ownerDocument.hidden && inView
    && cssSize > 0 && !host.closest("[hidden]");
  const draw = (frame: EngineSpoolFrame, now: number, force = false): void => {
    if (destroyed || !Number.isFinite(now) || !Number.isFinite(frame.outerAngle)
      || (frame.innerAngle !== null && !Number.isFinite(frame.innerAngle))) return;
    if (last) { last.frame.outerAngle = frame.outerAngle; last.frame.innerAngle = frame.innerAngle; last.now = now; }
    else last = { frame: { ...frame }, now };
    if (!painter || config.maxFps <= 0 || !visible()) return;
    const ratio = Math.min(Math.max(.1, globalThis.devicePixelRatio || 1), Math.max(.1, config.pixelRatio));
    const side = Math.max(1, Math.round(cssSize * CANVAS_SCALE * ratio));
    const outerBlades = config.outerBlades ?? 0;
    const innerBlades = frame.innerAngle === null ? 0 : config.innerBlades ?? 0;
    const outerAngle = outerBlades ? frame.outerAngle : 0;
    const innerAngle = innerBlades ? frame.innerAngle : null;
    if (drawnOuter === outerAngle && drawnInner === innerAngle && drawnSide === side
      && drawnOuterBlades === outerBlades && drawnInnerBlades === innerBlades) return;
    if (!force && now >= lastDrawTime && now - lastDrawTime < 1000 / config.maxFps) return;
    ring(outerAngle, .48, outerBlades, 0);
    ring(innerAngle ?? 0, .28, innerBlades, 4);
    data[8] = side;
    if (painter.canvas.width !== side || painter.canvas.height !== side) {
      painter.canvas.width = painter.canvas.height = side;
    }
    try { painter.paint(data, side); } catch {
      downgrade(painter.kind);
      return;
    }
    drawnOuter = outerAngle;
    drawnInner = innerAngle;
    drawnSide = side;
    drawnOuterBlades = outerBlades;
    drawnInnerBlades = innerBlades;
    lastDrawTime = now;
  };
  const redraw = (): void => { if (last) draw(last.frame, last.now, true); };

  const getDevice = (): Promise<GPUDevice | null> => {
    if (gpuUnavailable) return Promise.resolve(null);
    if (options.device !== undefined) return Promise.resolve(options.device);
    if (devicePromise) return devicePromise;
    const pending = (async () => {
      const adapter = await navigator.gpu?.requestAdapter();
      // Normalize the DOM's duplicate WebGPU declaration at this browser boundary.
      const device = (await adapter?.requestDevice() ?? null) as GPUDevice | null;
      if (destroyed || drawingDisabled(config) || config.preference === "webgl2" || config.preference === "webgl1") {
        device?.destroy(); devicePromise = null; return null;
      }
      ownedDevice = device;
      return device;
    })().catch(() => null);
    devicePromise = pending;
    return pending;
  };

  const choose = async (start?: "webgl2" | "webgl1" | "off"): Promise<EngineSpoolBackend> => {
    const mine = ++generation;
    release();
    if (destroyed) return "off";
    if (drawingDisabled(config) || start === "off") {
      releaseOwnedDevice();
      publish("off", start === "off" ? "GPU drawing is unavailable; numeric readings remain visible." : null);
      return "off";
    }
    publish(null, null);
    const requested = start ?? config.preference;
    const candidates: Exclude<EngineSpoolBackend, "off">[] = requested === "webgl1" ? ["webgl1"]
      : requested === "webgl2" ? ["webgl2", "webgl1"] : ["webgpu", "webgl2", "webgl1"];
    for (const kind of candidates) {
      if (destroyed || mine !== generation) return "off";
      const canvas = freshCanvas();
      let created: Painter | null = null;
      try {
        if (kind === "webgpu") {
          const device = await getDevice();
          if (destroyed || mine !== generation) return "off";
          if (!device) continue;
          created = await gpuPainter(canvas, device);
          // A shared device is only observed, never destroyed by this widget.
          void device.lost.then(() => {
            if (destroyed || mine !== generation) return;
            gpuUnavailable = true;
            if (painter?.kind === "webgpu") downgrade("webgpu");
          });
        } else {
          releaseOwnedDevice();
          created = glPainter(canvas, kind, () => {
            if (!destroyed && mine === generation) downgrade(kind);
          });
        }
        if (destroyed || mine !== generation) { created.destroy(); return "off"; }
        painter = created;
        host.append(canvas);
        publish(kind, kind !== candidates[0] || start
          ? `Drawing with ${kind}; a higher GPU backend was unavailable.` : null);
        redraw();
        return kind;
      } catch { created?.destroy(); canvas.remove(); }
    }
    if (!destroyed && mine === generation) {
      releaseOwnedDevice();
      publish("off", "GPU drawing is unavailable; numeric readings remain visible.");
    }
    return "off";
  };
  const downgrade = (kind: Exclude<EngineSpoolBackend, "off">): void => {
    if (kind === "webgpu") gpuUnavailable = true;
    ready = choose(kind === "webgpu" ? "webgl2" : kind === "webgl2" ? "webgl1" : "off");
  };
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(entries => {
    const entry = entries[0];
    if (!entry) return;
    cssSize = Math.max(0, Math.min(entry.contentRect.width, entry.contentRect.height || entry.contentRect.width));
    redraw();
  }) : null;
  resize?.observe(host);
  const intersection = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => {
    if (!entries[0]) return;
    inView = entries[0].isIntersecting;
    if (inView) redraw();
  }) : null;
  intersection?.observe(host);
  const onVisibility = (): void => { if (!host.ownerDocument.hidden) redraw(); };
  host.ownerDocument.addEventListener("visibilitychange", onVisibility);
  let ready = choose();
  return {
    get ready() { return ready; },
    get status() { return { ...status }; },
    draw,
    configure(next) {
      if (destroyed) return;
      const nextOuterBlades = bladeCount(next.outerBlades);
      const nextInnerBlades = bladeCount(next.innerBlades);
      if (config.preference === next.preference && config.maxFps === next.maxFps && config.pixelRatio === next.pixelRatio
        && config.outerBlades === nextOuterBlades && config.innerBlades === nextInnerBlades) return;
      const nextConfig = { ...next, outerBlades: nextOuterBlades, innerBlades: nextInnerBlades };
      const wasDisabled = drawingDisabled(config);
      const disabled = drawingDisabled(nextConfig);
      const switchBackend = config.preference !== next.preference || wasDisabled !== disabled;
      config = nextConfig;
      if (switchBackend) ready = choose();
      else redraw();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      generation++;
      resize?.disconnect();
      intersection?.disconnect();
      host.ownerDocument.removeEventListener("visibilitychange", onVisibility);
      release();
      releaseOwnedDevice();
      last = null;
    },
  };
}
