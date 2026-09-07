import { Vector3 } from "@babylonjs/core";
import { describe, expect, it } from "vitest";
import { geodeticToEcef } from "foss-earth/cameraMath";
import { buildEcefToEnuMatrix, buildWorldShiftMatrix } from "./enuFrame";

describe("enuFrame", () => {
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
