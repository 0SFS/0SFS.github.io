import type { FrameProfiler } from "foss-earth/perf";
import {
  ATTITUDE_TICK_HALF_LENGTH,
  GROUND_STOPS,
  SKY_STOPS,
  allAttitudeLabels,
  attitudeArtScale,
  bodyToLocal,
  labelFontPx,
  type AttitudeMarkerKind,
  type AttitudeScene,
  type AttitudeState,
  type Rgb,
} from "./attitudeIndicator";
import {
  PINNED_ALPHA,
  STICK_CROSSHAIR_ALPHA,
  aircraftSymbolReach,
  attitudeFrameCorner,
  drawAircraftSymbolGlyph,
  drawLabelGlyph,
  drawMarkerGlyph,
  drawStickKnobGlyph,
  labelFont,
  markerReach,
  stickKnobReach,
  stickShown,
  type AttitudeStick,
} from "./attitudeCanvas";

/**
 * The attitude indicator on the GPU, drawn with the globe's own WebGPU device.
 *
 * One pass, two draws. A full-screen fragment shader works out, per pixel,
 * where that pixel looks, and colours it: the sky and ground colourmap, the
 * pitch rings, heading meridians and ticks, the horizon, and the rounded
 * frame, all antialiased from screen-space derivatives. Then one instanced
 * draw places every label, marker, the aircraft symbol and the stick from a
 * texture atlas lettered once. A frame's CPU work is the label placement and
 * two small buffer writes.
 */

const DEG = Math.PI / 180;
/** centre xy, half size xy, atlas uv rect, cos/sin of the turn, alpha, padding. */
const SPRITE_FLOATS = 12;
const MAX_SPRITES = 128;
const FRAME_FLOATS = 20;

function colourmapWgsl(name: string, stops: [number, Rgb][]): string {
  const vec = ([r, g, b]: Rgb): string => `vec3f(${[r, g, b].map(value => (value / 255).toFixed(6)).join(", ")})`;
  const lines = [`fn ${name}(deg: f32) -> vec3f {`, `  var colour = ${vec(stops[0][1])};`];
  for (let index = 1; index < stops.length; index++) {
    const [fromDeg] = stops[index - 1];
    const [toDeg, to] = stops[index];
    lines.push(`  colour = mix(colour, ${vec(to)}, clamp((deg - ${fromDeg.toFixed(1)}) / ${(toDeg - fromDeg).toFixed(1)}, 0.0, 1.0));`);
  }
  lines.push("  return colour;", "}");
  return lines.join("\n");
}

export function attitudeShaderSource(): string {
  return /* wgsl */ `
struct Frame {
  // Body-to-local rotation, local being north/east/down, one row each.
  rowNorth: vec4f,
  rowEast: vec4f,
  rowDown: vec4f,
  // Canvas side in CSS px, device px per CSS px, centre, half the instrument's side.
  view: vec4f,
  // The lens, r = a·θ / (1 + b·θ); artwork scale; frame corner radius.
  lens: vec4f,
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(1) @binding(0) var atlasSampler: sampler;
@group(1) @binding(1) var atlas: texture_2d<f32>;

const DEG_PER_RAD = 57.29577951308232;

${colourmapWgsl("sky", SKY_STOPS)}

${colourmapWgsl("ground", GROUND_STOPS)}

/** Coverage of a line this many device px wide either side, this far away. */
fn cover(distancePx: f32, halfWidthPx: f32) -> f32 {
  return clamp(halfWidthPx + 0.5 - distancePx, 0.0, 1.0);
}

@vertex
fn fullscreen(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn ball(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let pxPerCss = frame.view.y;
  let d = position.xy / pxPerCss - vec2f(frame.view.z);
  let a = frame.lens.x;
  let b = frame.lens.y;
  let art = frame.lens.z;

  // Where this pixel looks: the lens inverted, then body axes to local.
  let r = length(d);
  let theta = r / (a - b * r);
  let lateral = select(0.0, sin(theta) / r, r > 1e-4);
  let body = vec3f(cos(theta), d.x * lateral, d.y * lateral);
  let local = vec3f(dot(frame.rowNorth.xyz, body), dot(frame.rowEast.xyz, body), dot(frame.rowDown.xyz, body));
  let elevation = atan2(-local.z, length(local.xy)) * DEG_PER_RAD;
  let azimuth = atan2(local.y, local.x) * DEG_PER_RAD;
  let behind = atan2(-local.y, -local.x) * DEG_PER_RAD;

  // Degrees per device pixel, taken before anything branches. Azimuth jumps
  // at ±180°; measured from behind it jumps somewhere else, so the smaller
  // of the two rates is the true one.
  let elevationRate = max(length(vec2f(dpdx(elevation), dpdy(elevation))), 1e-6);
  let azimuthRate = max(min(length(vec2f(dpdx(azimuth), dpdy(azimuth))),
    length(vec2f(dpdx(behind), dpdy(behind)))), 1e-6);
  let hairline = 0.5 * pxPerCss;

  var colour = select(ground(-elevation), sky(elevation), elevation >= 0.0);

  let ring = round(elevation / 10.0);
  let onRing = cover(abs(elevation - ring * 10.0) / elevationRate, hairline)
    * select(0.0, 1.0, ring != 0.0 && abs(ring) <= 8.0);
  colour = mix(colour, select(vec3f(1.0, 0.925, 0.839), vec3f(1.0), ring > 0.0), onRing * select(0.28, 0.3, ring > 0.0));

  let meridian = round(azimuth / 30.0);
  let onMeridian = cover(abs(azimuth - meridian * 30.0) / azimuthRate, hairline);
  colour = mix(colour, vec3f(1.0), onMeridian * select(0.2, 0.42, abs(meridian) % 3.0 == 0.0));

  let tick = round(azimuth / 10.0);
  let onTick = cover(abs(azimuth - tick * 10.0) / azimuthRate, 0.625 * pxPerCss)
    * cover(abs(elevation) / elevationRate, ${ATTITUDE_TICK_HALF_LENGTH.toFixed(1)} * art * pxPerCss)
    * select(1.0, 0.0, abs(tick) % 3.0 == 0.0);
  colour = mix(colour, vec3f(1.0), 0.75 * onTick);

  colour = mix(colour, vec3f(1.0), 0.95 * cover(abs(elevation) / elevationRate, art * pxPerCss));

  // The rounded frame: coverage inside it, then its border across the edge.
  let corner = frame.lens.w;
  let q = abs(d) - vec2f(frame.view.w - corner);
  let edge = (length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - corner) * pxPerCss;
  let inside = clamp(0.5 - edge, 0.0, 1.0);
  let border = 0.7 * cover(abs(edge), 0.75 * pxPerCss);
  return vec4f(colour * inside, inside) * (1.0 - border) + vec4f(border);
}

struct Sprite {
  @location(0) centre: vec2f,
  @location(1) halfSize: vec2f,
  @location(2) uv: vec4f,
  @location(3) turn: vec2f,
  @location(4) alpha: f32,
};

struct Placed {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) alpha: f32,
};

@vertex
fn spriteVertex(@builtin(vertex_index) index: u32, sprite: Sprite) -> Placed {
  let corner = vec2f(f32(index & 1u), f32(index >> 1u));
  let offset = (corner * 2.0 - 1.0) * sprite.halfSize;
  let turned = vec2f(offset.x * sprite.turn.x - offset.y * sprite.turn.y, offset.x * sprite.turn.y + offset.y * sprite.turn.x);
  let at = (sprite.centre + turned) / frame.view.x;
  var placed: Placed;
  placed.position = vec4f(at.x * 2.0 - 1.0, 1.0 - at.y * 2.0, 0.0, 1.0);
  placed.uv = mix(sprite.uv.xy, sprite.uv.zw, corner);
  placed.alpha = sprite.alpha;
  return placed;
}

@fragment
fn spriteFragment(placed: Placed) -> @location(0) vec4f {
  return textureSample(atlas, atlasSampler, placed.uv) * placed.alpha;
}
`;
}

interface AtlasEntry {
  uv: [number, number, number, number];
  /** Half the sprite's size in CSS px, exactly its cell in device px. */
  halfWidth: number;
  halfHeight: number;
}

interface AtlasSprite {
  key: string;
  halfWidth: number;
  halfHeight: number;
  draw(ctx: CanvasRenderingContext2D): void;
}

const MARKER_KINDS: AttitudeMarkerKind[] = ["prograde", "retrograde", "normal", "anti-normal", "radial-out", "radial-in"];

/** Letters every sprite the instrument can show into one canvas, at the screen's pixel density. */
function letterAtlas(doc: Document, fontPx: number, scale: number, pixelRatio: number) {
  const measure = doc.createElement("canvas").getContext("2d");
  const sprites: AtlasSprite[] = [];
  for (const { text, kind } of allAttitudeLabels()) {
    let width = text.length * fontPx * 0.62;
    if (measure) {
      measure.font = labelFont(kind, fontPx);
      width = measure.measureText(text).width;
    }
    sprites.push({
      key: `label:${kind}:${text}`, halfWidth: width / 2 + 2, halfHeight: fontPx / 2 + 3,
      draw: ctx => drawLabelGlyph(ctx, text, kind, fontPx),
    });
  }
  for (const kind of MARKER_KINDS) {
    const reach = markerReach(scale);
    sprites.push({ key: `marker:${kind}`, halfWidth: reach, halfHeight: reach, draw: ctx => drawMarkerGlyph(ctx, kind, scale) });
  }
  const symbol = aircraftSymbolReach(scale);
  sprites.push({
    key: "symbol", halfWidth: symbol.x, halfHeight: Math.max(symbol.up, symbol.down),
    draw: ctx => drawAircraftSymbolGlyph(ctx, scale),
  });
  for (const active of [false, true]) {
    const reach = stickKnobReach(scale);
    sprites.push({ key: `knob:${active}`, halfWidth: reach, halfHeight: reach, draw: ctx => drawStickKnobGlyph(ctx, scale, active) });
  }
  sprites.push({
    key: "white", halfWidth: 2 / pixelRatio, halfHeight: 2 / pixelRatio,
    draw: ctx => { ctx.fillStyle = "#fff"; ctx.fillRect(-2, -2, 4, 4); },
  });

  // Shelves, two device px apart so filtering never reaches a neighbour.
  const gap = 2;
  const cells = sprites.map(sprite => ({
    sprite,
    width: Math.ceil(sprite.halfWidth * 2 * pixelRatio),
    height: Math.ceil(sprite.halfHeight * 2 * pixelRatio),
    x: 0,
    y: 0,
  }));
  const atlasWidth = Math.max(512, ...cells.map(cell => cell.width + 2 * gap));
  let x = gap, y = gap, shelf = 0;
  for (const cell of cells) {
    if (x + cell.width + gap > atlasWidth) {
      x = gap;
      y += shelf + gap;
      shelf = 0;
    }
    cell.x = x;
    cell.y = y;
    x += cell.width + gap;
    shelf = Math.max(shelf, cell.height);
  }
  const atlasHeight = y + shelf + gap;
  const canvas = doc.createElement("canvas");
  canvas.width = atlasWidth;
  canvas.height = atlasHeight;
  const ctx = canvas.getContext("2d");
  const entries = new Map<string, AtlasEntry>();
  for (const cell of cells) {
    if (ctx) {
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, cell.x + cell.width / 2, cell.y + cell.height / 2);
      cell.sprite.draw(ctx);
    }
    // The white cell is sampled at its middle only, so its edges never blur in.
    const inset = cell.sprite.key === "white" ? 1.5 : 0;
    entries.set(cell.sprite.key, {
      uv: [
        (cell.x + inset) / atlasWidth, (cell.y + inset) / atlasHeight,
        (cell.x + cell.width - inset) / atlasWidth, (cell.y + cell.height - inset) / atlasHeight,
      ],
      halfWidth: cell.width / (2 * pixelRatio),
      halfHeight: cell.height / (2 * pixelRatio),
    });
  }
  return { canvas, entries };
}

export interface WebGpuAttitude {
  render(scene: AttitudeScene, state: AttitudeState, stick: AttitudeStick, pixelRatio: number): void;
  destroy(): void;
}

/**
 * Builds the pipelines on the given device before touching the canvas, so a
 * failure leaves the canvas free for the Canvas 2D fallback. Null if WebGPU
 * cannot draw here.
 */
export interface WebGpuAttitudeOptions {
  /** Receives the GPU time of the instrument's pass while profiling, where the device can time it. */
  profiler?: FrameProfiler | null;
  section?: string;
}

/** Times the instrument's render pass on the GPU, a few frames late, without ever waiting on it. */
function createPassTimer(device: GPUDevice, profiler: FrameProfiler, section: string) {
  const querySet = device.createQuerySet({ type: "timestamp", count: 2 });
  const resolved = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
  // A few readbacks in flight, so a slow map never makes the pass go untimed for long.
  const idle = [0, 1, 2].map(() => device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }));
  let destroyed = false;
  return {
    /** The pass's timestamp writes, or undefined when this frame goes untimed. */
    writes(): GPURenderPassTimestampWrites | undefined {
      return profiler.enabled && idle.length > 0 ? { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } : undefined;
    },
    /** After the pass: copies the timestamps out, to read once the GPU is done. */
    collect(encoder: GPUCommandEncoder): (() => void) | null {
      const readback = idle.pop();
      if (!readback) return null;
      encoder.resolveQuerySet(querySet, 0, 2, resolved, 0);
      encoder.copyBufferToBuffer(resolved, 0, readback, 0, 16);
      return () => {
        readback.mapAsync(GPUMapMode.READ).then(() => {
          if (destroyed) return;
          const [begin, end] = new BigUint64Array(readback.getMappedRange());
          readback.unmap();
          idle.push(readback);
          // Chrome rounds timestamps to 0.1 ms unless its developer features are on;
          // rounded at random points, they still average to the true time.
          if (end >= begin) profiler.addDuration(section, Number(end - begin) / 1e6);
        }, () => {});
      };
    },
    destroy() {
      destroyed = true;
      querySet.destroy();
      resolved.destroy();
      for (const buffer of idle) buffer.destroy();
    },
  };
}

export async function createWebGpuAttitude(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
  { profiler = null, section = "gpu/attitude indicator" }: WebGpuAttitudeOptions = {},
): Promise<WebGpuAttitude | null> {
  const gpu = globalThis.navigator?.gpu;
  if (!gpu) return null;
  const format = gpu.getPreferredCanvasFormat();
  const module = device.createShaderModule({ code: attitudeShaderSource() });
  const frameLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }],
  });
  const atlasLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
    ],
  });
  const premultiplied: GPUBlendComponent = { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" };
  let ballPipeline: GPURenderPipeline;
  let spritePipeline: GPURenderPipeline;
  try {
    [ballPipeline, spritePipeline] = await Promise.all([
      device.createRenderPipelineAsync({
        layout: device.createPipelineLayout({ bindGroupLayouts: [frameLayout] }),
        vertex: { module, entryPoint: "fullscreen" },
        fragment: { module, entryPoint: "ball", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      }),
      device.createRenderPipelineAsync({
        layout: device.createPipelineLayout({ bindGroupLayouts: [frameLayout, atlasLayout] }),
        vertex: {
          module,
          entryPoint: "spriteVertex",
          buffers: [{
            arrayStride: SPRITE_FLOATS * 4,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              { shaderLocation: 1, offset: 8, format: "float32x2" },
              { shaderLocation: 2, offset: 16, format: "float32x4" },
              { shaderLocation: 3, offset: 32, format: "float32x2" },
              { shaderLocation: 4, offset: 40, format: "float32" },
            ],
          }],
        },
        fragment: { module, entryPoint: "spriteFragment", targets: [{ format, blend: { color: premultiplied, alpha: premultiplied } }] },
        primitive: { topology: "triangle-strip" },
      }),
    ]);
  } catch (error) {
    console.warn("Attitude indicator: WebGPU pipelines failed; drawing with Canvas 2D instead.", error);
    return null;
  }
  const context = canvas.getContext("webgpu");
  if (!context) return null;
  context.configure({ device, format, alphaMode: "premultiplied" });

  const frameBuffer = device.createBuffer({ size: FRAME_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const spriteBuffer = device.createBuffer({ size: MAX_SPRITES * SPRITE_FLOATS * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  const frameGroup = device.createBindGroup({ layout: frameLayout, entries: [{ binding: 0, resource: { buffer: frameBuffer } }] });
  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
  const frameData = new Float32Array(FRAME_FLOATS);
  const spriteData = new Float32Array(MAX_SPRITES * SPRITE_FLOATS);
  let atlas: { key: string; texture: GPUTexture; group: GPUBindGroup; entries: Map<string, AtlasEntry> } | null = null;
  let lost = false;
  void device.lost.then(() => { lost = true; });
  const passTimer = profiler && device.features.has("timestamp-query") ? createPassTimer(device, profiler, section) : null;

  const ensureAtlas = (fontPx: number, scale: number, pixelRatio: number) => {
    const key = `${fontPx}:${scale}:${pixelRatio}`;
    if (atlas?.key === key) return atlas;
    atlas?.texture.destroy();
    const lettered = letterAtlas(canvas.ownerDocument, fontPx, scale, pixelRatio);
    const texture = device.createTexture({
      size: [lettered.canvas.width, lettered.canvas.height],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture(
      { source: lettered.canvas },
      { texture, premultipliedAlpha: true },
      [lettered.canvas.width, lettered.canvas.height],
    );
    const group = device.createBindGroup({
      layout: atlasLayout,
      entries: [{ binding: 0, resource: sampler }, { binding: 1, resource: texture.createView() }],
    });
    atlas = { key, texture, group, entries: lettered.entries };
    return atlas;
  };

  return {
    render(scene, state, stick, pixelRatio) {
      if (lost) return;
      const { projection } = scene;
      const centre = projection.size / 2;
      const scale = attitudeArtScale(projection);
      const lettering = ensureAtlas(labelFontPx(projection), scale, pixelRatio);

      const m = bodyToLocal(state.rollRad, state.pitchRad, state.headingRad);
      frameData.set([m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0]);
      frameData.set([projection.size, pixelRatio, centre, projection.half], 12);
      frameData.set([projection.a, projection.b, scale, attitudeFrameCorner(projection)], 16);
      device.queue.writeBuffer(frameBuffer, 0, frameData);

      let count = 0;
      // Upright sprites sit on whole device pixels, where their texels land one to one.
      const snap = (value: number, half: number): number => Math.round((value - half) * pixelRatio) / pixelRatio + half;
      const place = (key: string, x: number, y: number, angle: number, alpha: number, halfWidth?: number, halfHeight?: number): void => {
        const entry = lettering.entries.get(key);
        if (!entry || count >= MAX_SPRITES) return;
        const width = halfWidth ?? entry.halfWidth;
        const height = halfHeight ?? entry.halfHeight;
        const upright = Math.abs(angle) < 0.5 * DEG;
        const offset = count * SPRITE_FLOATS;
        spriteData[offset] = upright ? snap(x, width) : x;
        spriteData[offset + 1] = upright ? snap(y, height) : y;
        spriteData[offset + 2] = width;
        spriteData[offset + 3] = height;
        spriteData.set(entry.uv, offset + 4);
        spriteData[offset + 8] = upright ? 1 : Math.cos(angle);
        spriteData[offset + 9] = upright ? 0 : Math.sin(angle);
        spriteData[offset + 10] = alpha;
        count++;
      };
      for (const label of scene.labels) place(`label:${label.kind}:${label.text}`, label.x, label.y, label.angle, 1);
      place("symbol", centre, centre, 0, 1);
      for (const marker of scene.markers) place(`marker:${marker.kind}`, marker.x, marker.y, 0, marker.pinned ? PINNED_ALPHA : 1);
      if (stickShown(stick)) {
        place("white", centre, centre, 0, STICK_CROSSHAIR_ALPHA, projection.half, 0.5);
        place("white", centre, centre, 0, STICK_CROSSHAIR_ALPHA, 0.5, projection.half);
        place(`knob:${stick.active}`, centre + stick.x * projection.half, centre + stick.y * projection.half, 0, 1);
      }
      device.queue.writeBuffer(spriteBuffer, 0, spriteData, 0, count * SPRITE_FLOATS);

      const encoder = device.createCommandEncoder({ label: "attitude indicator" });
      const timestampWrites = passTimer?.writes();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        }],
        ...(timestampWrites ? { timestampWrites } : {}),
      });
      pass.setBindGroup(0, frameGroup);
      pass.setPipeline(ballPipeline);
      pass.draw(3);
      if (count > 0) {
        pass.setPipeline(spritePipeline);
        pass.setBindGroup(1, lettering.group);
        pass.setVertexBuffer(0, spriteBuffer);
        pass.draw(4, count);
      }
      pass.end();
      const read = timestampWrites ? passTimer?.collect(encoder) : null;
      device.queue.submit([encoder.finish()]);
      read?.();
    },
    destroy() {
      // The device is the globe's; only what was made here is released.
      context.unconfigure();
      passTimer?.destroy();
      frameBuffer.destroy();
      spriteBuffer.destroy();
      atlas?.texture.destroy();
      atlas = null;
    },
  };
}
