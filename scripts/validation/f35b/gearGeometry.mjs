// 0sfs owns this F-35B validation-only geometry helper. Not a bay-volume solver.
import { Vector3, VertexBuffer } from "@babylonjs/core";

export const F35B_SKIN_NAMES = Object.freeze([
  "fuselage", "canopy", "leftDoor", "rightDoor", "leftNoseDoor", "rightNoseDoor",
]);

/** Read actual mesh vertices regardless of visibility, enabled state or material. */
export function worldVertices(node) {
  const matrix = node.computeWorldMatrix(true);
  const local = node.getVerticesData(VertexBuffer.PositionKind);
  if (!local?.length) throw new Error(`Missing vertex geometry: ${node.name}`);
  const result = [];
  for (let i = 0; i < local.length; i += 3) {
    result.push(Vector3.TransformCoordinates(new Vector3(local[i], local[i + 1], local[i + 2]), matrix));
  }
  return result;
}

/** Selected exterior surfaces at their current pose, including posed bay doors. */
export function buildSkinTriangles(byName) {
  return F35B_SKIN_NAMES.flatMap(name => {
    const node = byName.get(name);
    if (!node) throw new Error(`Missing exterior skin node: ${name}`);
    const points = worldVertices(node), indices = node.getIndices(), result = [];
    if (!indices?.length) throw new Error(`Missing indexed skin geometry: ${name}`);
    for (let index = 0; index < indices.length; index += 3) {
      result.push({ name, a: points[indices[index]], b: points[indices[index + 1]], c: points[indices[index + 2]] });
    }
    return result;
  });
}

/**
 * Vertical silhouette extrema. Concave gaps and stacked surfaces may look
 * inside even without a cavity; triangle interiors of the gear aren't sampled.
 * Zero violations is therefore not proof of internal bay containment.
 */
export function classifySkinEnvelope(points, skin) {
  const result = { above: 0, below: 0, inside: 0, insufficientIntersections: 0,
    worstAboveMeters: 0, worstBelowMeters: 0, examples: [] };
  for (const point of points) {
    const hits = [];
    for (const { name, a, b, c } of skin) {
      const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(denominator) < 1e-12) continue;
      const u = ((b.z - c.z) * (point.x - c.x) + (c.x - b.x) * (point.z - c.z)) / denominator;
      const v = ((c.z - a.z) * (point.x - c.x) + (a.x - c.x) * (point.z - c.z)) / denominator;
      if (u < -1e-8 || v < -1e-8 || u + v > 1 + 1e-8) continue;
      const y = u * a.y + v * b.y + (1 - u - v) * c.y;
      if (!hits.some(hit => Math.abs(hit.y - y) < 1e-6)) hits.push({ y, name });
    }
    hits.sort((a, b) => a.y - b.y);
    if (hits.length < 2) { result.insufficientIntersections += 1; continue; }
    const low = hits[0], high = hits[hits.length - 1];
    const above = point.y - high.y, below = low.y - point.y;
    if (above > 1e-5 || below > 1e-5) {
      result[above > below ? "above" : "below"] += 1;
      result.worstAboveMeters = Math.max(result.worstAboveMeters, above);
      result.worstBelowMeters = Math.max(result.worstBelowMeters, below);
      if (result.examples.length < 8) result.examples.push({ vertex: point.asArray(), bottom: low, top: high });
    } else result.inside += 1;
  }
  return result;
}

export function hasEnvelopeViolation(result) {
  return result.above > 0 || result.below > 0 || result.insufficientIntersections > 0;
}
