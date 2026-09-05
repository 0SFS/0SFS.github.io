import { Matrix, Vector3 } from "@babylonjs/core";
import { geodeticToEcef } from "foss-earth/cameraMath";

/**
 * Maps local ENU (X=east, Y=north, Z=up) into Babylon's right-handed Y-up frame
 * (X=east, Y=up, Z=north).
 */
export function buildEnuToBabylonMatrix(): Matrix {
  return Matrix.FromValues(
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, 1, 0, 0,
    0, 0, 0, 1,
  );
}

/**
 * Build a 4×4 matrix that maps ECEF coordinates into a local ENU frame at the
 * given geodetic reference. East = +X, North = +Y, Up = +Z.
 */
export function buildEcefToEnuMatrix(latRad: number, lonRad: number): Matrix {
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);

  const eastX = -sinLon;
  const eastY = cosLon;
  const eastZ = 0;

  const northX = -sinLat * cosLon;
  const northY = -sinLat * sinLon;
  const northZ = cosLat;

  const upX = cosLat * cosLon;
  const upY = cosLat * sinLon;
  const upZ = sinLat;

  return Matrix.FromValues(
    eastX, eastY, eastZ, 0,
    northX, northY, northZ, 0,
    upX, upY, upZ, 0,
    0, 0, 0, 1,
  );
}

export function ecefToEnuPosition(
  ecef: { x: number; y: number; z: number },
  latRad: number,
  lonRad: number,
  altMeters: number,
): Vector3 {
  const ref = geodeticToEcef(latRad, lonRad, altMeters);
  const dx = ecef.x - ref.x;
  const dy = ecef.y - ref.y;
  const dz = ecef.z - ref.z;
  const m = buildEcefToEnuMatrix(latRad, lonRad);
  return Vector3.TransformCoordinates(new Vector3(dx, dy, dz), m);
}

/**
 * Compose the world-shift matrix applied to the tile root so that the reference
 * geodetic position maps to the scene origin in ENU coordinates.
 */
export function buildWorldShiftMatrix(latRad: number, lonRad: number, altMeters: number): Matrix {
  const ecefToEnu = buildEcefToEnuMatrix(latRad, lonRad);
  const ecefToBabylon = buildEnuToBabylonMatrix().multiply(ecefToEnu);
  const ref = geodeticToEcef(latRad, lonRad, altMeters);
  const refVec = new Vector3(ref.x, ref.y, ref.z);
  const translation = Vector3.TransformCoordinates(refVec, ecefToBabylon).scale(-1);
  const result = ecefToBabylon.clone();
  result.setTranslation(translation);
  return result;
}
