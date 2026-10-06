import { describe, expect, it } from "vitest";
import { engineGasSectionPoint, type EngineGasSection } from "./engineGasSupport";
import { engineGasSectionShaderData } from "./engineGasSupportShader";

describe("posed gas shader broad phase", () => {
  it("bounds ruled sections and retains their inverse roots when radius and orientation change together", () => {
    for (const tilt of [0, 0.4, 1.1]) for (const endRadius of [0.25, 0.6, 1.2]) {
      const section: EngineGasSection = { id: "ruled", startCenter: [2, -1, 3], endCenter: [2.4, -1, 5],
        startU: [1, 0, 0], endU: [Math.cos(tilt), 0, -Math.sin(tilt)], radialV: [0, 1, 0],
        startRadius: 0.6, endRadius, startDistance: -2, endDistance: 0, startAreaFactor: 1,
        endAreaFactor: 1, innerRadiusKnots: [], nozzleSealClip: false };
      const coefficients = engineGasSectionShaderData(section);
      for (const t of [0, 0.1, 0.5, 0.9, 1]) for (let i = 0; i < 32; i++) {
        const point = engineGasSectionPoint(section, t, 1, i * Math.PI / 16);
        for (let axis = 0; axis < 3; axis++) {
          expect(point[axis]).toBeGreaterThanOrEqual(coefficients.minimum[axis]);
          expect(point[axis]).toBeLessThanOrEqual(coefficients.maximum[axis]);
        }
        const p = point.map((v, axis) => v - section.startCenter[axis]);
        const a = coefficients.inverseA[3];
        const b = p.reduce((sum, v, axis) => sum + v * coefficients.inverseA[axis], coefficients.inverseB[3]);
        const c = p.reduce((sum, v, axis) => sum + v * coefficients.inverseB[axis], 0);
        expect(a * t * t + b * t + c).toBeCloseTo(0, 12);
      }
    }
  });
});
