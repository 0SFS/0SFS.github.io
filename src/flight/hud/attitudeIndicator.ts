import type { FlightState } from "../physics/flightState";

/**
 * The attitude indicator: a KSP navball flattened onto a square.
 *
 * Everything on it — sky and ground, pitch rings, heading meridians, the
 * velocity markers — is a direction around the aircraft drawn where it lies
 * relative to the nose, through one projection. Nothing fakes its own geometry,
 * so it stays right looking straight up, inverted or sliding backwards, the
 * way a flat pitch ladder does not.
 *
 * The nose is the centre, and a direction's distance from it grows with its
 * angle from the nose: quickly near the middle, where pitch is read, and more
 * slowly outwards, so the middle of each edge is 90° from the nose and the
 * corners reach most of the way behind.
 */

export type Vec3 = [number, number, number];

const DEG = Math.PI / 180;
const EDGE_ANGLE = 90 * DEG;
const CORNER_ANGLE = 165 * DEG;
/** Lines stop short of the point behind the tail, where every direction meets. */
const TRACE_LIMIT = 175 * DEG;
/** Past this a marker is too near the tail to say which edge it is beyond. */
const MARKER_LIMIT = 150 * DEG;
/** Below this ground speed the velocity has no direction worth drawing. */
const MIN_MARKER_SPEED_FPS = 3;
/** The artwork is drawn for an instrument this many CSS px across its half. */
const DESIGN_HALF = 96;
/** How far a heading tick reaches either side of the horizon, CSS px at design size. */
export const ATTITUDE_TICK_HALF_LENGTH = 4;

export interface AttitudeProjection {
  /** The canvas side in CSS px; the instrument is centred in it. */
  size: number;
  /** Half the instrument's side in CSS px. */
  half: number;
  /** px from the centre for θ radians from the nose: a·θ / (1 + b·θ). */
  a: number;
  b: number;
}

export function createAttitudeProjection(size: number, half: number): AttitudeProjection {
  // Solved so r(EDGE_ANGLE) = half and r(CORNER_ANGLE) = half·√2.
  const b = (CORNER_ANGLE - Math.SQRT2 * EDGE_ANGLE) / (CORNER_ANGLE * EDGE_ANGLE * (Math.SQRT2 - 1));
  const a = half * (1 + b * EDGE_ANGLE) / EDGE_ANGLE;
  return { size, half, a, b };
}

export function radiusForAngle(projection: AttitudeProjection, angle: number): number {
  return projection.a * angle / (1 + projection.b * angle);
}

export function angleForRadius(projection: AttitudeProjection, radius: number): number {
  return radius / (projection.a - projection.b * radius);
}

/** JSBSim's body-to-local rotation, local being north/east/down, for its 3-2-1 Euler angles. Row-major. */
export function bodyToLocal(rollRad: number, pitchRad: number, headingRad: number): number[] {
  const sf = Math.sin(rollRad), cf = Math.cos(rollRad);
  const st = Math.sin(pitchRad), ct = Math.cos(pitchRad);
  const sp = Math.sin(headingRad), cp = Math.cos(headingRad);
  return [
    ct * cp, sf * st * cp - cf * sp, cf * st * cp + sf * sp,
    ct * sp, sf * st * sp + cf * cp, cf * st * sp - sf * cp,
    -st, sf * ct, cf * ct,
  ];
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** Angle from the nose, radians. */
  angle: number;
}

export type AttitudeState = Pick<FlightState,
  "rollRad" | "pitchRad" | "headingRad" | "northVelocityFps" | "eastVelocityFps" | "verticalSpeedFps">;

interface View {
  /** Where a local north/east/down direction lands. */
  local(north: number, east: number, down: number): ScreenPoint;
  /** Where the direction at this elevation and true azimuth lands. */
  sphere(elevation: number, azimuth: number): ScreenPoint;
  up: Vec3;
}

function createView(state: AttitudeState, projection: AttitudeProjection): View {
  const m = bodyToLocal(state.rollRad, state.pitchRad, state.headingRad);
  const centre = projection.size / 2;
  const local = (north: number, east: number, down: number): ScreenPoint => {
    // Body axes: x out the nose, y out the right wing, z down through the floor.
    const y = m[1] * north + m[4] * east + m[7] * down;
    const z = m[2] * north + m[5] * east + m[8] * down;
    const x = m[0] * north + m[3] * east + m[6] * down;
    const lateral = Math.hypot(y, z);
    const angle = Math.atan2(lateral, x);
    if (lateral < 1e-12) return { x: centre, y: centre, angle };
    const scale = radiusForAngle(projection, angle) / lateral;
    return { x: centre + y * scale, y: centre + z * scale, angle };
  };
  return {
    local,
    sphere(elevation, azimuth) {
      const level = Math.cos(elevation);
      return local(level * Math.cos(azimuth), level * Math.sin(azimuth), -Math.sin(elevation));
    },
    up: [-m[6], -m[7], -m[8]],
  };
}

export type AttitudeMarkerKind = "prograde" | "retrograde" | "normal" | "anti-normal" | "radial-out" | "radial-in";

export interface AttitudeMarker {
  kind: AttitudeMarkerKind;
  x: number;
  y: number;
  /** Beyond the frame, and drawn pinned to its edge. */
  pinned: boolean;
}

export interface AttitudeLabel {
  text: string;
  x: number;
  y: number;
  /** Rotation of the text baseline, radians clockwise on screen. */
  angle: number;
  kind: "pitch" | "heading" | "cardinal";
}

export interface AttitudeScene {
  projection: AttitudeProjection;
  /** Local up in body axes; the sky and ground colours follow from it. */
  up: Vec3;
  horizon: number[][];
  skyRings: number[][];
  groundRings: number[][];
  meridians: number[][];
  cardinalMeridians: number[][];
  /** Heading ticks across the horizon, four numbers each. */
  ticks: number[];
  labels: AttitudeLabel[];
  markers: AttitudeMarker[];
}

/** Artwork scale: the phone layout shrinks the instrument, and its strokes shrink less. */
export function attitudeArtScale(projection: AttitudeProjection): number {
  return Math.max(0.75, projection.half / DESIGN_HALF);
}

export function labelFontPx(projection: AttitudeProjection): number {
  return Math.max(8, Math.round(9 * projection.half / DESIGN_HALF));
}

/**
 * Polylines through the points, split wherever they pass too near the tail
 * and trimmed to the frame: most of every ring is off the square, and the
 * canvas strokes whatever it is given, visible or not.
 */
function trace(projection: AttitudeProjection, count: number, point: (index: number) => ScreenPoint, out: number[][]): void {
  const centre = projection.size / 2;
  const reach = projection.half + 1;
  let line: number[] = [];
  let previous: ScreenPoint | null = null;
  let previousInside = false;
  const finish = (): void => {
    if (line.length >= 4) out.push(line);
    line = [];
  };
  for (let index = 0; index <= count; index++) {
    const at = point(index);
    if (!(at.angle <= TRACE_LIMIT)) {
      finish();
      previous = null;
      previousInside = false;
      continue;
    }
    const inside = Math.abs(at.x - centre) <= reach && Math.abs(at.y - centre) <= reach;
    // The first point outside on either side is kept, so the line reaches the edge.
    if (inside && line.length === 0 && previous) line.push(previous.x, previous.y);
    if (inside || previousInside) line.push(at.x, at.y);
    if (!inside && previousInside) finish();
    previous = at;
    previousInside = inside;
  }
  finish();
}

const CARDINALS: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: "W" };

function headingText(deg: number): string {
  // Three digits, as on the HDG readout, so a heading never reads as a pitch.
  return CARDINALS[deg] ?? String(deg).padStart(3, "0");
}

/** Every label the scene can hold, for a renderer that letters them ahead of time. */
export function allAttitudeLabels(): Pick<AttitudeLabel, "text" | "kind">[] {
  const labels: Pick<AttitudeLabel, "text" | "kind">[] = [];
  for (let deg = 0; deg < 360; deg += 30) labels.push({ text: headingText(deg), kind: deg in CARDINALS ? "cardinal" : "heading" });
  for (let deg = 10; deg <= 80; deg += 10) labels.push({ text: String(deg), kind: "pitch" });
  return labels;
}

function tangentAngle(before: ScreenPoint, after: ScreenPoint): number {
  return Math.atan2(after.y - before.y, after.x - before.x);
}

function candidateLabels(view: View, state: AttitudeState, projection: AttitudeProjection): AttitudeLabel[] {
  const labels: AttitudeLabel[] = [];
  const fontPx = labelFontPx(projection);
  const nudge = 0.5 * DEG;
  for (let deg = 0; deg < 360; deg += 30) {
    const azimuth = deg * DEG;
    const at = view.sphere(0, azimuth);
    if (!(at.angle <= EDGE_ANGLE * 1.6)) continue;
    const above = view.sphere(DEG, azimuth);
    const lift = Math.hypot(above.x - at.x, above.y - at.y);
    if (!(lift > 1e-6)) continue;
    // Clear of the wings, so the heading under the nose shows above the symbol.
    const offset = fontPx * 0.5 + 4.5;
    labels.push({
      text: headingText(deg),
      x: at.x + (above.x - at.x) / lift * offset,
      y: at.y + (above.y - at.y) / lift * offset,
      angle: tangentAngle(view.sphere(0, azimuth - nudge), view.sphere(0, azimuth + nudge)),
      kind: deg in CARDINALS ? "cardinal" : "heading",
    });
  }
  // Pitch numbers sit on their ring either side of the nose's heading, like
  // the ends of a pitch ladder, and turn with the ring.
  const aside = 40 * attitudeArtScale(projection) / projection.a;
  for (let deg = -80; deg <= 80; deg += 10) {
    if (deg === 0) continue;
    const elevation = deg * DEG;
    const spread = Math.min(Math.PI / 2, aside / Math.cos(elevation));
    for (const side of [-1, 1]) {
      const azimuth = state.headingRad + side * spread;
      const at = view.sphere(elevation, azimuth);
      if (!(at.angle <= EDGE_ANGLE * 1.6)) continue;
      labels.push({
        text: String(Math.abs(deg)),
        x: at.x,
        y: at.y,
        angle: tangentAngle(view.sphere(elevation, azimuth - nudge), view.sphere(elevation, azimuth + nudge)),
        kind: "pitch",
      });
    }
  }
  return labels;
}

/** A label's footprint: its centre, its axes, and its four corners, x then y. */
interface Box {
  x: number;
  y: number;
  cos: number;
  sin: number;
  /** Half the diagonal: past twice this apart, two boxes cannot touch. */
  reach: number;
  corners: Float64Array;
}

function makeBox(x: number, y: number, angle: number, halfWidth: number, halfHeight: number): Box {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const ax = halfWidth * cos, ay = halfWidth * sin;
  const bx = -halfHeight * sin, by = halfHeight * cos;
  const corners = new Float64Array(8);
  corners[0] = x - ax - bx; corners[1] = y - ay - by;
  corners[2] = x + ax - bx; corners[3] = y + ay - by;
  corners[4] = x + ax + bx; corners[5] = y + ay + by;
  corners[6] = x - ax + bx; corners[7] = y - ay + by;
  return { x, y, cos, sin, reach: Math.hypot(halfWidth, halfHeight), corners };
}

function splitAlong(axisX: number, axisY: number, first: Box, second: Box): boolean {
  let firstMin = Infinity, firstMax = -Infinity, secondMin = Infinity, secondMax = -Infinity;
  for (let index = 0; index < 8; index += 2) {
    const a = first.corners[index] * axisX + first.corners[index + 1] * axisY;
    const b = second.corners[index] * axisX + second.corners[index + 1] * axisY;
    if (a < firstMin) firstMin = a;
    if (a > firstMax) firstMax = a;
    if (b < secondMin) secondMin = b;
    if (b > secondMax) secondMax = b;
  }
  return firstMax <= secondMin || secondMax <= firstMin;
}

/**
 * Separating axes: two rectangles are apart if some edge direction of either
 * one splits them. Most pairs are far apart and never get that far.
 */
function boxesOverlap(first: Box, second: Box): boolean {
  const dx = first.x - second.x, dy = first.y - second.y;
  const reach = first.reach + second.reach;
  if (dx * dx + dy * dy >= reach * reach) return false;
  return !(splitAlong(first.cos, first.sin, first, second) || splitAlong(-first.sin, first.cos, first, second)
    || splitAlong(second.cos, second.sin, first, second) || splitAlong(-second.sin, second.cos, first, second));
}

/**
 * Keeps the labels that fit: inside the frame, off the aircraft symbol, and
 * clear of every label kept before them. Headings go first, then pitch numbers
 * nearest the nose, so where the rings crowd towards the edges it is the outer
 * numbers that go. This runs every frame, so it allocates as little as it can.
 */
function placeLabels(candidates: AttitudeLabel[], projection: AttitudeProjection): AttitudeLabel[] {
  const centre = projection.size / 2;
  const fontPx = labelFontPx(projection);
  const scale = attitudeArtScale(projection);
  const limit = projection.half - 2;
  const ranks = new Map<AttitudeLabel, number>();
  for (const label of candidates) {
    ranks.set(label, (label.kind === "pitch" ? 1e6 : 0) + Math.hypot(label.x - centre, label.y - centre));
  }
  candidates.sort((left, right) => ranks.get(left)! - ranks.get(right)!);
  // The aircraft symbol, as drawn: wings from -25 to 25, the chevron down to 10.
  const taken: Box[] = [makeBox(centre, centre + 3.5 * scale, 0, 25.5 * scale, 6 * scale)];
  const placed: AttitudeLabel[] = [];
  for (const label of candidates) {
    const box = makeBox(label.x, label.y, label.angle, label.text.length * fontPx * 0.31 + 1.5, fontPx * 0.5 + 0.5);
    let inside = true;
    for (let index = 0; index < 8 && inside; index++) inside = Math.abs(box.corners[index] - centre) <= limit;
    if (!inside) continue;
    let clear = true;
    for (let index = 0; index < taken.length && clear; index++) clear = !boxesOverlap(box, taken[index]);
    if (!clear) continue;
    taken.push(box);
    placed.push(label);
  }
  return placed;
}

/** KSP's surface-mode markers, from the velocity over the ground. */
function velocityMarkers(view: View, state: AttitudeState, projection: AttitudeProjection): AttitudeMarker[] {
  const north = state.northVelocityFps, east = state.eastVelocityFps, down = -state.verticalSpeedFps;
  const speed = Math.hypot(north, east, down);
  if (!(speed >= MIN_MARKER_SPEED_FPS)) return [];
  const prograde: Vec3 = [north / speed, east / speed, down / speed];
  const directions: [AttitudeMarkerKind, Vec3][] = [
    ["prograde", prograde],
    ["retrograde", [-prograde[0], -prograde[1], -prograde[2]]],
  ];
  // Normal is up × prograde, left of the track; radial out is up with the
  // prograde part taken out. Both are undefined flying straight up or down.
  const across = Math.hypot(prograde[0], prograde[1]);
  if (across > 1e-3) {
    const normal: Vec3 = [prograde[1] / across, -prograde[0] / across, 0];
    const climb = -prograde[2];
    const radial: Vec3 = [
      -climb * prograde[0] / across,
      -climb * prograde[1] / across,
      (-1 - climb * prograde[2]) / across,
    ];
    directions.push(
      ["normal", normal],
      ["anti-normal", [-normal[0], -normal[1], 0]],
      ["radial-out", radial],
      ["radial-in", [-radial[0], -radial[1], -radial[2]]],
    );
  }
  const centre = projection.size / 2;
  const reach = projection.half - 9 * attitudeArtScale(projection);
  const markers: AttitudeMarker[] = [];
  for (const [kind, direction] of directions) {
    const at = view.local(direction[0], direction[1], direction[2]);
    if (!(at.angle <= MARKER_LIMIT)) continue;
    let dx = at.x - centre;
    let dy = at.y - centre;
    const extent = Math.max(Math.abs(dx), Math.abs(dy));
    if (extent > reach) {
      dx *= reach / extent;
      dy *= reach / extent;
    }
    // A pixel's grace, so the markers exactly 90° out in level flight do not flicker.
    markers.push({ kind, x: centre + dx, y: centre + dy, pinned: extent > projection.half + 1 });
  }
  return markers;
}

/**
 * The grid, as the WebGPU shader draws it per pixel: rings every 10° of
 * elevation, meridians every 30° of heading, the horizon, and heading ticks
 * every 10° across it.
 */
function traceGrid(view: View, projection: AttitudeProjection, scene: AttitudeScene): void {
  trace(projection, 180, index => view.sphere(0, index * 2 * DEG), scene.horizon);
  for (let deg = -80; deg <= 80; deg += 10) {
    if (deg === 0) continue;
    trace(projection, 90, index => view.sphere(deg * DEG, index * 4 * DEG), deg > 0 ? scene.skyRings : scene.groundRings);
  }
  for (let deg = 0; deg < 360; deg += 30) {
    trace(projection, 60, index => view.sphere((index * 3 - 90) * DEG, deg * DEG),
      deg % 90 === 0 ? scene.cardinalMeridians : scene.meridians);
  }
  const tick = ATTITUDE_TICK_HALF_LENGTH * attitudeArtScale(projection) / projection.a;
  for (let deg = 10; deg < 360; deg += 10) {
    if (deg % 30 === 0) continue;
    const below = view.sphere(-tick, deg * DEG);
    const above = view.sphere(tick, deg * DEG);
    if (below.angle <= TRACE_LIMIT && above.angle <= TRACE_LIMIT) scene.ticks.push(below.x, below.y, above.x, above.y);
  }
}

export interface AttitudeSceneOptions {
  /**
   * Trace the grid as polylines. The WebGPU renderer draws the grid per pixel
   * and leaves this off, skipping the few thousand projections it costs.
   */
  lines?: boolean;
}

export function computeAttitudeScene(
  state: AttitudeState,
  projection: AttitudeProjection,
  { lines = true }: AttitudeSceneOptions = {},
): AttitudeScene {
  const view = createView(state, projection);
  const scene: AttitudeScene = {
    projection,
    up: view.up,
    horizon: [],
    skyRings: [],
    groundRings: [],
    meridians: [],
    cardinalMeridians: [],
    ticks: [],
    labels: [],
    markers: [],
  };
  if (lines) traceGrid(view, projection, scene);
  scene.labels = placeLabels(candidateLabels(view, state, projection), projection);
  scene.markers = velocityMarkers(view, state, projection);
  return scene;
}

export type Rgb = [number, number, number];

/** Colour by elevation, degrees from the horizon: pale at the horizon, deepening towards zenith and nadir. */
export const SKY_STOPS: [number, Rgb][] = [[0, [132, 194, 236]], [10, [98, 168, 226]], [30, [54, 120, 196]], [60, [28, 74, 150]], [90, [12, 36, 94]]];
export const GROUND_STOPS: [number, Rgb][] = [[0, [192, 138, 86]], [10, [162, 110, 64]], [30, [122, 80, 44]], [60, [84, 52, 28]], [90, [46, 27, 13]]];

export function colourAtElevation(elevationDeg: number): Rgb {
  const stops = elevationDeg >= 0 ? SKY_STOPS : GROUND_STOPS;
  const deg = Math.min(90, Math.abs(elevationDeg));
  let index = 1;
  while (index < stops.length - 1 && stops[index][0] < deg) index++;
  const [fromDeg, from] = stops[index - 1];
  const [toDeg, to] = stops[index];
  const t = (deg - fromDeg) / (toDeg - fromDeg);
  return [0, 1, 2].map(channel => Math.round(from[channel] + (to[channel] - from[channel]) * t)) as Rgb;
}
