import { describe, expect, it } from "vitest";
import {
  angleForRadius,
  bodyToLocal,
  colourAtElevation,
  computeAttitudeScene,
  createAttitudeProjection,
  radiusForAngle,
  type AttitudeMarkerKind,
  type AttitudeState,
} from "./attitudeIndicator";

const DEG = Math.PI / 180;
const projection = createAttitudeProjection(220, 96);
const CENTRE = 110;

function state(overrides: Partial<AttitudeState> = {}): AttitudeState {
  return {
    rollRad: 0, pitchRad: 0, headingRad: 0,
    northVelocityFps: 200, eastVelocityFps: 0, verticalSpeedFps: 0,
    ...overrides,
  };
}

function marker(kind: AttitudeMarkerKind, overrides: Partial<AttitudeState> = {}) {
  return computeAttitudeScene(state(overrides), projection).markers.find(item => item.kind === kind);
}

describe("attitude projection", () => {
  it("puts 90° from the nose at the edges and most of the way behind at the corners", () => {
    expect(radiusForAngle(projection, 90 * DEG)).toBeCloseTo(96, 6);
    expect(radiusForAngle(projection, 165 * DEG)).toBeCloseTo(96 * Math.SQRT2, 6);
  });

  it("spends more of the square near the nose than near the edges", () => {
    const inner = radiusForAngle(projection, 10 * DEG);
    const outer = radiusForAngle(projection, 90 * DEG) - radiusForAngle(projection, 80 * DEG);
    expect(inner).toBeGreaterThan(1.5 * outer);
  });

  it("inverts exactly, so each pixel's colour matches where the lines are drawn", () => {
    for (const deg of [0, 5, 45, 90, 140, 165]) {
      expect(angleForRadius(projection, radiusForAngle(projection, deg * DEG))).toBeCloseTo(deg * DEG, 9);
    }
  });
});

describe("attitude scene", () => {
  it("has local up straight up the body when level", () => {
    const [x, y, z] = computeAttitudeScene(state(), projection).up;
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(-1, 9);
  });

  it("lowers the horizon by the pitch angle through the projection", () => {
    const scene = computeAttitudeScene(state({ pitchRad: 10 * DEG }), projection);
    const below = scene.horizon.flatMap(line => {
      const points: number[] = [];
      for (let index = 0; index < line.length; index += 2) {
        if (Math.abs(line[index] - CENTRE) < 1) points.push(line[index + 1]);
      }
      return points;
    });
    expect(below.length).toBeGreaterThan(0);
    expect(Math.min(...below.map(y => Math.abs(y - CENTRE - radiusForAngle(projection, 10 * DEG))))).toBeLessThan(0.5);
  });

  it("raises the horizon on the right in a right bank", () => {
    const scene = computeAttitudeScene(state({ rollRad: 30 * DEG }), projection);
    const line = scene.horizon.flat();
    const right: number[] = [];
    const left: number[] = [];
    for (let index = 0; index < line.length; index += 2) {
      const dx = line[index] - CENTRE;
      if (Math.abs(dx) > 20 && Math.abs(dx) < 40) (dx > 0 ? right : left).push(line[index + 1]);
    }
    expect(Math.max(...right)).toBeLessThan(CENTRE);
    expect(Math.min(...left)).toBeGreaterThan(CENTRE);
  });

  it("puts prograde on the nose when flying where it points, and hides retrograde behind", () => {
    const prograde = marker("prograde");
    expect(prograde?.x).toBeCloseTo(CENTRE, 6);
    expect(prograde?.y).toBeCloseTo(CENTRE, 6);
    expect(prograde?.pinned).toBe(false);
    expect(marker("retrograde")).toBeUndefined();
  });

  it("puts prograde below the nose by the angle of attack", () => {
    const prograde = marker("prograde", { pitchRad: 8 * DEG });
    expect(prograde?.x).toBeCloseTo(CENTRE, 6);
    expect(prograde!.y - CENTRE).toBeCloseTo(radiusForAngle(projection, 8 * DEG), 6);
  });

  it("puts prograde downwind of the nose when crabbing", () => {
    // Nose 12° left of the track: the aircraft goes to the right of where it points.
    const prograde = marker("prograde", { headingRad: -12 * DEG });
    expect(prograde!.x - CENTRE).toBeCloseTo(radiusForAngle(projection, 12 * DEG), 6);
    expect(prograde?.y).toBeCloseTo(CENTRE, 6);
  });

  it("puts normal left of the track and radial out above it, as in KSP", () => {
    const normal = marker("normal");
    const antiNormal = marker("anti-normal");
    const radialOut = marker("radial-out");
    const radialIn = marker("radial-in");
    expect(normal!.x).toBeLessThan(CENTRE - 80);
    expect(antiNormal!.x).toBeGreaterThan(CENTRE + 80);
    expect(radialOut!.y).toBeLessThan(CENTRE - 80);
    expect(radialIn!.y).toBeGreaterThan(CENTRE + 80);
    // Exactly 90° out lands on the edge; that is not "beyond" it.
    expect([normal, antiNormal, radialOut, radialIn].map(item => item?.pinned)).toEqual([false, false, false, false]);
  });

  it("pins prograde to the edge, dimmed, when the path is off the square", () => {
    // Falling almost straight down with the nose level: the path is ~80° below.
    const prograde = marker("prograde", {
      pitchRad: 0, northVelocityFps: 20, verticalSpeedFps: -200, rollRad: 0,
    });
    expect(prograde).toBeDefined();
    expect(Math.abs(prograde!.x - CENTRE)).toBeLessThan(96);
    expect(prograde!.y - CENTRE).toBeLessThanOrEqual(96);
    const falling = marker("prograde", { pitchRad: 60 * DEG, northVelocityFps: 5, verticalSpeedFps: -200 });
    expect(falling?.pinned).toBe(true);
    expect(Math.max(Math.abs(falling!.x - CENTRE), Math.abs(falling!.y - CENTRE))).toBeLessThan(96);
  });

  it("leaves the grid to the GPU when asked, keeping labels and markers", () => {
    const traced = computeAttitudeScene(state(), projection);
    const bare = computeAttitudeScene(state(), projection, { lines: false });
    expect(traced.horizon.length).toBeGreaterThan(0);
    expect([bare.horizon, bare.skyRings, bare.groundRings, bare.meridians, bare.cardinalMeridians].flat()).toEqual([]);
    expect(bare.ticks).toEqual([]);
    expect(bare.labels).toEqual(traced.labels);
    expect(bare.markers).toEqual(traced.markers);
  });

  it("draws no velocity markers when parked", () => {
    const scene = computeAttitudeScene(state({ northVelocityFps: 0.4, eastVelocityFps: -0.3 }), projection);
    expect(scene.markers).toEqual([]);
  });

  it("drops normal and radial flying straight up, where they have no direction", () => {
    const scene = computeAttitudeScene(state({ pitchRad: 89 * DEG, northVelocityFps: 0, verticalSpeedFps: 150 }), projection);
    expect(scene.markers.map(item => item.kind)).toEqual(["prograde"]);
  });

  it("labels headings in three digits and pitch in two, so they never read alike", () => {
    const labels = computeAttitudeScene(state({ headingRad: 45 * DEG }), projection).labels;
    const headings = labels.filter(label => label.kind === "heading").map(label => label.text);
    const pitches = labels.filter(label => label.kind === "pitch").map(label => label.text);
    expect(headings.length).toBeGreaterThan(0);
    expect(headings.every(text => /^\d{3}$/.test(text))).toBe(true);
    expect(pitches.length).toBeGreaterThan(0);
    expect(pitches.every(text => /^[1-8]0$/.test(text))).toBe(true);
    // Heading 045: north is to the left of the nose and east to the right.
    const north = labels.find(label => label.text === "N");
    const east = labels.find(label => label.text === "E");
    expect(north!.x).toBeLessThan(CENTRE);
    expect(east!.x).toBeGreaterThan(CENTRE);
  });

  it("keeps every label inside the frame", () => {
    for (const rollDeg of [0, 45, 120, 180]) {
      for (const label of computeAttitudeScene(state({ rollRad: rollDeg * DEG, pitchRad: 20 * DEG }), projection).labels) {
        expect(Math.abs(label.x - CENTRE)).toBeLessThan(96);
        expect(Math.abs(label.y - CENTRE)).toBeLessThan(96);
      }
    }
  });
});

describe("attitude colourmap", () => {
  it("shades sky blue and ground brown, deepening away from the horizon", () => {
    const [skyR, , skyB] = colourAtElevation(5);
    const [groundR, , groundB] = colourAtElevation(-5);
    expect(skyB).toBeGreaterThan(skyR);
    expect(groundR).toBeGreaterThan(groundB);
    const brightness = ([r, g, b]: number[]): number => r + g + b;
    expect(brightness(colourAtElevation(80))).toBeLessThan(brightness(colourAtElevation(10)));
    expect(brightness(colourAtElevation(-80))).toBeLessThan(brightness(colourAtElevation(-10)));
  });
});

/**
 * Drawn from the 3D camera, the ball turns with the view as the camera orbits,
 * and the aircraft symbol shows the nose and the wings against it: the
 * default since 2026-10-07 (Renderer → Instruments → Attitude indicator view).
 */
describe("attitude indicator drawn from the camera", () => {
  /** A level camera looking along `headingDeg`. */
  const camera = (headingDeg: number) => bodyToLocal(0, 0, headingDeg * DEG);

  it("is the aircraft's own instrument when drawn from the aircraft's frame", () => {
    const flying = state({ rollRad: 25 * DEG, pitchRad: 8 * DEG, headingRad: 40 * DEG });
    const own = computeAttitudeScene(flying, projection);
    expect(own.symbol).toEqual({ x: CENTRE, y: CENTRE, angle: 0, pinned: false });
    expect(own.view).toEqual(bodyToLocal(25 * DEG, 8 * DEG, 40 * DEG));
    const same = computeAttitudeScene(flying, projection, { view: own.view });
    expect(same.symbol!.x).toBeCloseTo(CENTRE, 6);
    expect(same.symbol!.y).toBeCloseTo(CENTRE, 6);
    expect(same.symbol!.angle).toBeCloseTo(0, 6);
    expect(same.horizon).toEqual(own.horizon);
  });

  it("keeps the camera's horizon level and turns the wings as the aircraft banks", () => {
    const banked = computeAttitudeScene(state({ rollRad: 30 * DEG }), projection, { view: camera(0) });
    // The horizon runs straight across, at the centre.
    for (const line of banked.horizon) for (let index = 1; index < line.length; index += 2) expect(line[index]).toBeCloseTo(CENTRE, 6);
    // The nose straight ahead; the right wing down, turned clockwise on screen.
    expect(banked.symbol!.x).toBeCloseTo(CENTRE, 6);
    expect(banked.symbol!.y).toBeCloseTo(CENTRE, 6);
    expect(banked.symbol!.angle / DEG).toBeCloseTo(30, 1);
    expect(banked.up[1]).toBeCloseTo(0, 6);
  });

  it("moves the symbol to where the nose points: left of a camera that looks east, as the aircraft heads north", () => {
    const aside = computeAttitudeScene(state(), projection, { view: camera(90) });
    expect(aside.symbol!.x).toBeLessThan(CENTRE - 80);
    expect(aside.symbol!.y).toBeCloseTo(CENTRE, 6);
    // Pitched up 20° under a level camera ahead, the nose is above the centre.
    const climbing = computeAttitudeScene(state({ pitchRad: 20 * DEG }), projection, { view: camera(0) });
    expect(climbing.symbol!.y).toBeLessThan(CENTRE - 20);
  });

  it("pins the symbol to the edge, dimmed, where the nose points out of the frame, and hides it straight behind", () => {
    const behindAside = computeAttitudeScene(state(), projection, { view: camera(130) });
    expect(behindAside.symbol!.pinned).toBe(true);
    expect(Math.max(Math.abs(behindAside.symbol!.x - CENTRE), Math.abs(behindAside.symbol!.y - CENTRE))).toBeLessThanOrEqual(96);
    expect(computeAttitudeScene(state(), projection, { view: camera(180) }).symbol).toBeNull();
  });

  it("draws the velocity markers against the camera's view too", () => {
    const prograde = computeAttitudeScene(state(), projection, { view: camera(90) }).markers.find(item => item.kind === "prograde")!;
    expect(prograde.x).toBeLessThan(CENTRE - 80);
  });
});
