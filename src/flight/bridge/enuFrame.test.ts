import { NullEngine, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { describe, expect, it } from "vitest";
import { geodeticToEcef } from "foss-earth/cameraMath";
import { buildEcefToEnuMatrix, buildWorldShiftFrame, buildWorldShiftMatrix } from "./enuFrame";
import { createFloatingOrigin } from "./floatingOrigin";
import type { FlightState } from "../physics/flightState";

describe("enuFrame", () => {
  it("lazily caches one precise frame per applied aircraft state and clears it on disposal", () => {
    const engine = new NullEngine();
    try {
      const scene = new Scene(engine);
      const origin = createFloatingOrigin(scene, new TransformNode("world", scene));
      expect(origin.getWorldFromEcef()).toBeNull();
      const state = { latDeg: 44.9, lonDeg: -93.2, altMeters: 500, rollRad: 0, pitchRad: 0, headingRad: 0 } as FlightState;
      origin.apply(state);
      const first = origin.getWorldFromEcef()!;
      expect(first.m).toBeInstanceOf(Float64Array);
      expect(origin.getWorldFromEcef()).toBe(first);
      origin.apply({ ...state, altMeters: 500.031 });
      const next = origin.getWorldFromEcef()!;
      expect(next).not.toBe(first);
      expect(origin.getWorldFromEcef()).toBe(next);
      expect(next.m[13] - first.m[13]).toBeCloseTo(-0.031, 7);
      origin.dispose();
      expect(origin.getWorldFromEcef()).toBeNull();
    } finally { engine.dispose(); }
  });
  it("preserves centimetre offsets and orientation before an Earth-radius Float32 matrix rounding", () => {
    const latitude = 0.71123456789, longitude = -1.6323456789, altitude = 256.1234;
    const origin = geodeticToEcef(latitude, longitude, altitude);
    const frame = buildWorldShiftFrame(latitude, longitude, altitude);
    const east = [-Math.sin(longitude), Math.cos(longitude), 0];
    const up = [Math.cos(latitude) * Math.cos(longitude), Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude)];
    const south = [Math.sin(latitude) * Math.cos(longitude), Math.sin(latitude) * Math.sin(longitude), -Math.cos(latitude)];
    const ecef = [origin.x, origin.y, origin.z].map((value, index) => value + 0.031 * east[index] + 0.047 * up[index] - 0.019 * south[index]);
    const m = frame.m;
    const projected = [0, 1, 2].map(row => m[row] * ecef[0] + m[4 + row] * ecef[1] + m[8 + row] * ecef[2] + m[12 + row]);
    expect(m).toBeInstanceOf(Float64Array);
    expect(projected[0]).toBeCloseTo(0.031, 8);
    expect(projected[1]).toBeCloseTo(0.047, 8);
    expect(projected[2]).toBeCloseTo(-0.019, 8);
    const rendered = buildWorldShiftMatrix(latitude, longitude, altitude);
    for (const index of [0, 1, 2, 4, 5, 6, 8, 9, 10]) expect(m[index]).toBeCloseTo(rendered.m[index], 6);
  });
  it.each([[0, 0], [0.7, -1.2], [-0.6, 2.4]])(
    "preserves orientation and maps geographic directions at %s, %s",
    (latRad, lonRad) => {
      const east = new Vector3(-Math.sin(lonRad), Math.cos(lonRad), 0);
      const north = new Vector3(-Math.sin(latRad) * Math.cos(lonRad), -Math.sin(latRad) * Math.sin(lonRad), Math.cos(latRad));
      const up = new Vector3(Math.cos(latRad) * Math.cos(lonRad), Math.cos(latRad) * Math.sin(lonRad), Math.sin(latRad));
      const enu = buildEcefToEnuMatrix(latRad, lonRad);
      const shift = buildWorldShiftMatrix(latRad, lonRad, 3048);
      expect(shift.determinant()).toBeCloseTo(1, 5);
      for (const [direction, expectedEnu, expectedWorld] of [
        [east, new Vector3(1, 0, 0), new Vector3(1, 0, 0)],
        [north, new Vector3(0, 1, 0), new Vector3(0, 0, -1)],
        [up, new Vector3(0, 0, 1), new Vector3(0, 1, 0)],
      ]) {
        expect(Vector3.Distance(Vector3.TransformNormal(direction, enu), expectedEnu)).toBeLessThan(1e-6);
        expect(Vector3.Distance(Vector3.TransformNormal(direction, shift), expectedWorld)).toBeLessThan(1e-6);
      }
    },
  );

  it("maps the reference ECEF position to the origin", () => {
    const latRad = (44.977753 * Math.PI) / 180;
    const lonRad = (-93.265011 * Math.PI) / 180;
    const altMeters = 256;
    const ref = geodeticToEcef(latRad, lonRad, altMeters);
    const shift = buildWorldShiftMatrix(latRad, lonRad, altMeters);
    const local = Vector3.TransformCoordinates(new Vector3(ref.x, ref.y, ref.z), shift);
    expect(local.x).toBeCloseTo(0, 0);
    expect(local.y).toBeCloseTo(0, 0);
    expect(local.z).toBeCloseTo(0, 0);
  });

  it("produces orthonormal ENU basis vectors", () => {
    const m = buildEcefToEnuMatrix(0.7, -1.2);
    const east = new Vector3(m.m[0], m.m[1], m.m[2]);
    const north = new Vector3(m.m[4], m.m[5], m.m[6]);
    const up = new Vector3(m.m[8], m.m[9], m.m[10]);
    expect(east.length()).toBeCloseTo(1, 5);
    expect(north.length()).toBeCloseTo(1, 5);
    expect(up.length()).toBeCloseTo(1, 5);
    expect(Vector3.Dot(east, north)).toBeCloseTo(0, 5);
    expect(Vector3.Dot(east, up)).toBeCloseTo(0, 5);
    expect(Vector3.Dot(north, up)).toBeCloseTo(0, 5);
  });

  it("places ground below the aircraft in Babylon Y-up space", () => {
    const latRad = (44.977753 * Math.PI) / 180;
    const lonRad = (-93.265011 * Math.PI) / 180;
    const altMeters = 3048;
    const shift = buildWorldShiftMatrix(latRad, lonRad, altMeters);
    const ground = geodeticToEcef(latRad, lonRad, 0);
    const localGround = Vector3.TransformCoordinates(new Vector3(ground.x, ground.y, ground.z), shift);
    expect(localGround.x).toBeCloseTo(0, 0);
    expect(localGround.y).toBeCloseTo(-altMeters, 0);
    expect(localGround.z).toBeCloseTo(0, 0);
  });
});
