import {
  angleForRadius,
  attitudeArtScale,
  colourAtElevation,
  labelFontPx,
  type AttitudeLabel,
  type AttitudeMarkerKind,
  type AttitudeProjection,
  type AttitudeScene,
  type Vec3,
} from "./attitudeIndicator";

/**
 * The attitude indicator's artwork in Canvas 2D: every glyph drawn about the
 * origin, for the WebGPU renderer to letter into its atlas once, and a
 * painter that draws the whole instrument with them where WebGPU is missing.
 */

const DEG = Math.PI / 180;

export const PROGRADE = "#e4f23c";
export const NORMAL = "#d65cf6";
export const RADIAL = "#42dcf2";
export const SYMBOL = "#ffa21f";
export const OUTLINE = "rgba(0, 0, 0, 0.6)";
/** Headings warm, pitch white: the two sets of numbers cross each other all over the ball. */
export const LABEL_COLOURS: Record<AttitudeLabel["kind"], string> = {
  cardinal: "#ffd36b",
  heading: "#ffe9b0",
  pitch: "rgba(255, 255, 255, 0.95)",
};
const FONT = '"SF Mono", "Menlo", "Consolas", monospace';
/** A marker drawn off the frame's edge is dimmed to this. */
export const PINNED_ALPHA = 0.55;
/** The stick crosshair's opacity; its lines are one CSS px wide. */
export const STICK_CROSSHAIR_ALPHA = 0.18;

export interface AttitudeStick {
  /** Deflection, -1..1 each way; y is down. */
  x: number;
  y: number;
  active: boolean;
}

export function stickShown(stick: AttitudeStick): boolean {
  return stick.active || stick.x !== 0 || stick.y !== 0;
}

export function labelFont(kind: AttitudeLabel["kind"], fontPx: number): string {
  return kind === "cardinal" ? `800 ${fontPx + 1}px ${FONT}` : `600 ${fontPx}px ${FONT}`;
}

/** Strokes a glyph twice, dark under colour, so it reads on sky and ground alike. */
function outlined(ctx: CanvasRenderingContext2D, colour: string, width: number, path: () => void): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [style, lineWidth] of [[OUTLINE, width + 2], [colour, width]] as const) {
    ctx.strokeStyle = style;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    path();
    ctx.stroke();
  }
}

function spokes(ctx: CanvasRenderingContext2D, angles: number[], from: number, to: number): void {
  for (const angle of angles) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    ctx.moveTo(dx * from, dy * from);
    ctx.lineTo(dx * to, dy * to);
  }
}

function dot(ctx: CanvasRenderingContext2D, colour: string, radius: number): void {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** Half the side of the square every marker glyph fits in, outline included. */
export function markerReach(scale: number): number {
  return 11.5 * scale + 2;
}

export function drawMarkerGlyph(ctx: CanvasRenderingContext2D, kind: AttitudeMarkerKind, scale: number): void {
  const r = 6.5 * scale;
  const width = 1.75 * scale;
  const circle = (): void => { ctx.moveTo(r, 0); ctx.arc(0, 0, r, 0, Math.PI * 2); };
  const triangle = (pointing: number): void => {
    for (let corner = 0; corner <= 3; corner++) {
      const angle = pointing + corner * 2 * Math.PI / 3;
      if (corner === 0) ctx.moveTo(Math.cos(angle) * r * 1.15, Math.sin(angle) * r * 1.15);
      else ctx.lineTo(Math.cos(angle) * r * 1.15, Math.sin(angle) * r * 1.15);
    }
  };
  const diagonals = [45, 135, 225, 315].map(deg => deg * DEG);
  switch (kind) {
    case "prograde":
      outlined(ctx, PROGRADE, width, () => { circle(); spokes(ctx, [-90 * DEG, 0, 180 * DEG], r, r + 5 * scale); });
      dot(ctx, PROGRADE, 1.5 * scale);
      break;
    case "retrograde":
      outlined(ctx, PROGRADE, width, () => {
        circle();
        spokes(ctx, diagonals, 0, r * 0.7);
        spokes(ctx, [90 * DEG, 210 * DEG, 330 * DEG], r, r + 5 * scale);
      });
      break;
    case "normal":
      outlined(ctx, NORMAL, width, () => triangle(-90 * DEG));
      dot(ctx, NORMAL, 1.5 * scale);
      break;
    case "anti-normal":
      outlined(ctx, NORMAL, width, () => {
        triangle(90 * DEG);
        spokes(ctx, [90, 210, 330].map(deg => deg * DEG), r * 1.15, r * 1.15 + 4 * scale);
      });
      break;
    case "radial-out":
      outlined(ctx, RADIAL, width, () => { circle(); spokes(ctx, diagonals, r, r * 0.45); });
      dot(ctx, RADIAL, 1.5 * scale);
      break;
    case "radial-in":
      outlined(ctx, RADIAL, width, () => { circle(); spokes(ctx, diagonals, r, r + 4.5 * scale); });
      break;
  }
}

/** Half extents of the aircraft symbol about the nose, outline included. */
export function aircraftSymbolReach(scale: number): { x: number; up: number; down: number } {
  return { x: 24 * scale + 2.5, up: 2.6 * scale + 1, down: 8 * scale + 2.5 };
}

/** The fixed aircraft symbol about the nose: wings, a chevron under it, and the nose itself as a dot. */
export function drawAircraftSymbolGlyph(ctx: CanvasRenderingContext2D, scale: number): void {
  outlined(ctx, SYMBOL, 2.5 * scale, () => {
    ctx.moveTo(-24 * scale, 0);
    ctx.lineTo(-10 * scale, 0);
    ctx.lineTo(0, 8 * scale);
    ctx.lineTo(10 * scale, 0);
    ctx.lineTo(24 * scale, 0);
  });
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.arc(0, 0, 2.6 * scale, 0, Math.PI * 2);
  ctx.fill();
  dot(ctx, SYMBOL, 1.7 * scale);
}

/** A label centred on the origin, along +x. */
export function drawLabelGlyph(ctx: CanvasRenderingContext2D, text: string, kind: AttitudeLabel["kind"], fontPx: number): void {
  ctx.font = labelFont(kind, fontPx);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.5;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = LABEL_COLOURS[kind];
  ctx.fillText(text, 0, 0);
}

export function stickKnobReach(scale: number): number {
  return 11 * scale + 1;
}

/** The pitch/roll stick's knob. White, not yellow: the markers and the aircraft symbol own the warm colours. */
export function drawStickKnobGlyph(ctx: CanvasRenderingContext2D, scale: number, active: boolean): void {
  ctx.beginPath();
  ctx.fillStyle = active ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.2)";
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2 * scale;
  ctx.arc(0, 0, 10 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/** Indexed by the sine of the elevation, which is all a pixel needs to work out. */
const COLOURMAP_STEPS = 1024;
let colourmap: Uint32Array | null = null;
function getColourmap(): Uint32Array {
  if (colourmap) return colourmap;
  colourmap = new Uint32Array(COLOURMAP_STEPS + 1);
  // Written as bytes, so the words come out in whatever order ImageData wants.
  const bytes = new Uint8Array(colourmap.buffer);
  for (let index = 0; index <= COLOURMAP_STEPS; index++) {
    const sine = index / COLOURMAP_STEPS * 2 - 1;
    const [r, g, b] = colourAtElevation(Math.asin(Math.max(-1, Math.min(1, sine))) / DEG);
    bytes.set([r, g, b, 255], index * 4);
  }
  return colourmap;
}

/**
 * Paints sky and ground on the CPU, one pixel per CSS px. Each pixel's
 * direction in body axes never changes, so it is worked out once; a frame is
 * then one dot product with local up and a colourmap lookup per pixel.
 */
function createSkyField(doc: Document) {
  const canvas = doc.createElement("canvas");
  const ctx = canvas.getContext("2d");
  let key = "";
  let forward = new Float32Array(0);
  let right = new Float32Array(0);
  let down = new Float32Array(0);
  let image: ImageData | null = null;
  let pixels = new Uint32Array(0);

  const rebuild = (projection: AttitudeProjection, side: number): void => {
    canvas.width = side;
    canvas.height = side;
    const count = side * side;
    forward = new Float32Array(count);
    right = new Float32Array(count);
    down = new Float32Array(count);
    const pxPerCell = 2 * projection.half / side;
    for (let row = 0; row < side; row++) {
      for (let column = 0; column < side; column++) {
        const u = (column + 0.5 - side / 2) * pxPerCell;
        const v = (row + 0.5 - side / 2) * pxPerCell;
        const radius = Math.hypot(u, v);
        const angle = angleForRadius(projection, radius);
        const index = row * side + column;
        const lateral = radius > 0 ? Math.sin(angle) / radius : 0;
        forward[index] = Math.cos(angle);
        right[index] = u * lateral;
        down[index] = v * lateral;
      }
    }
    image = ctx?.createImageData(side, side) ?? null;
    pixels = image ? new Uint32Array(image.data.buffer) : new Uint32Array(0);
  };

  return (projection: AttitudeProjection, up: Vec3): HTMLCanvasElement | null => {
    if (!ctx) return null;
    const side = Math.max(1, Math.ceil(2 * projection.half));
    const nextKey = `${side}:${projection.a}:${projection.b}`;
    if (nextKey !== key) {
      key = nextKey;
      rebuild(projection, side);
    }
    if (!image) return null;
    const lookup = getColourmap();
    const half = COLOURMAP_STEPS / 2;
    const [ux, uy, uz] = up;
    for (let index = 0; index < pixels.length; index++) {
      const sine = forward[index] * ux + right[index] * uy + down[index] * uz;
      pixels[index] = lookup[Math.max(0, Math.min(COLOURMAP_STEPS, Math.round((sine + 1) * half)))];
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  };
}

function strokeLines(ctx: CanvasRenderingContext2D, lines: number[][], style: string, width: number): void {
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (const line of lines) {
    ctx.moveTo(line[0], line[1]);
    for (let index = 2; index < line.length; index += 2) ctx.lineTo(line[index], line[index + 1]);
  }
  ctx.stroke();
}

function frame(ctx: CanvasRenderingContext2D, projection: AttitudeProjection, radius: number): void {
  const left = projection.size / 2 - projection.half;
  const side = projection.half * 2;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(left, left, side, side, radius);
  else ctx.rect(left, left, side, side);
}

export function attitudeFrameCorner(projection: AttitudeProjection): number {
  return 6 * attitudeArtScale(projection);
}

export type CanvasAttitudePainter = (ctx: CanvasRenderingContext2D, scene: AttitudeScene, stick: AttitudeStick) => void;

/** The whole instrument in Canvas 2D, for browsers without WebGPU. Expects a scene traced with lines. */
export function createCanvasAttitudePainter(doc: Document): CanvasAttitudePainter {
  const skyField = createSkyField(doc);
  return (ctx, scene, stick) => {
    const { projection } = scene;
    const centre = projection.size / 2;
    const scale = attitudeArtScale(projection);
    const corner = attitudeFrameCorner(projection);
    ctx.save();
    frame(ctx, projection, corner);
    ctx.clip();
    const field = skyField(projection, scene.up);
    if (field) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(field, centre - projection.half, centre - projection.half, projection.half * 2, projection.half * 2);
    }
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    strokeLines(ctx, scene.groundRings, "rgba(255, 236, 214, 0.28)", 1);
    strokeLines(ctx, scene.skyRings, "rgba(255, 255, 255, 0.3)", 1);
    strokeLines(ctx, scene.meridians, "rgba(255, 255, 255, 0.2)", 1);
    strokeLines(ctx, scene.cardinalMeridians, "rgba(255, 255, 255, 0.42)", 1);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (let index = 0; index < scene.ticks.length; index += 4) {
      ctx.moveTo(scene.ticks[index], scene.ticks[index + 1]);
      ctx.lineTo(scene.ticks[index + 2], scene.ticks[index + 3]);
    }
    ctx.stroke();
    strokeLines(ctx, scene.horizon, "rgba(255, 255, 255, 0.95)", 2 * scale);
    ctx.restore();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 1.5;
    frame(ctx, projection, corner);
    ctx.stroke();

    // Placement already keeps all of these inside the frame.
    const fontPx = labelFontPx(projection);
    for (const label of scene.labels) {
      ctx.save();
      ctx.translate(label.x, label.y);
      // Whole degrees: Chrome rasterises glyphs afresh for every new angle, and
      // a label turning smoothly with the ball made one at every frame. Half a
      // degree moves the end of a label a tenth of a pixel.
      ctx.rotate(Math.round(label.angle / DEG) * DEG);
      drawLabelGlyph(ctx, label.text, label.kind, fontPx);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(centre, centre);
    drawAircraftSymbolGlyph(ctx, scale);
    ctx.restore();
    for (const marker of scene.markers) {
      ctx.save();
      ctx.translate(marker.x, marker.y);
      ctx.globalAlpha = marker.pinned ? PINNED_ALPHA : 1;
      drawMarkerGlyph(ctx, marker.kind, scale);
      ctx.restore();
    }

    if (!stickShown(stick)) return;
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${STICK_CROSSHAIR_ALPHA})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centre - projection.half, centre);
    ctx.lineTo(centre + projection.half, centre);
    ctx.moveTo(centre, centre - projection.half);
    ctx.lineTo(centre, centre + projection.half);
    ctx.stroke();
    ctx.translate(centre + stick.x * projection.half, centre + stick.y * projection.half);
    drawStickKnobGlyph(ctx, scale, stick.active);
    ctx.restore();
  };
}
