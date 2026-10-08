import { describe, expect, it } from "vitest";
import { AIRCRAFT_IDS } from "./aircraftIds";
import { AIRCRAFT_LIGHTS, ANTI_COLLISION, beamIntensityCd, BEAMS, flash, lightColour, navigationIntensityCd } from "./aircraftLights";

const RAD = Math.PI / 180;
/** A unit vector at a bearing from dead ahead, positive to the left, and an elevation, degrees, in body axes (+X left, +Y up, +Z nose). */
const toward = (bearingDeg: number, elevationDeg = 0): [number, number, number] => [
  Math.cos(elevationDeg * RAD) * Math.sin(bearingDeg * RAD),
  Math.sin(elevationDeg * RAD),
  Math.cos(elevationDeg * RAD) * Math.cos(bearingDeg * RAD),
];

describe("aircraft lights", () => {
  it("give navigation lights the intensities 14 CFR 25.1391 to 25.1395 require, each in its own sector", () => {
    // Red on the left: 40 cd ahead, 30 to 20°, 5 to 110° left, nothing to the right or behind.
    expect(navigationIntensityCd("position-left", toward(5))).toBeCloseTo(40, 6);
    expect(navigationIntensityCd("position-left", toward(15))).toBeCloseTo(30, 6);
    expect(navigationIntensityCd("position-left", toward(60))).toBeCloseTo(5, 6);
    expect(navigationIntensityCd("position-left", toward(-30))).toBe(0);
    expect(navigationIntensityCd("position-left", toward(150))).toBe(0);
    // Green on the right, the mirror of it.
    expect(navigationIntensityCd("position-right", toward(-5))).toBeCloseTo(40, 6);
    expect(navigationIntensityCd("position-right", toward(30))).toBe(0);
    // White behind: 20 cd within 70° of dead aft, nothing ahead.
    expect(navigationIntensityCd("position-tail", toward(180))).toBeCloseTo(20, 6);
    expect(navigationIntensityCd("position-tail", toward(-120))).toBeCloseTo(20, 6);
    expect(navigationIntensityCd("position-tail", toward(60))).toBe(0);
    // Above and below the horizontal, a share of it, never under 25.1391's minimum for the range: 0.8 from 5° to 10°, 0.3 from 20° to 30°.
    expect(navigationIntensityCd("position-left", toward(5, 7))).toBeCloseTo(40 * 0.86, 6);
    expect(navigationIntensityCd("position-left", toward(5, -25))).toBeCloseTo(40 * 0.4, 6);
    for (const [elevation, minimum] of [[3, 0.9], [7, 0.8], [12, 0.7], [18, 0.5], [25, 0.3], [35, 0.1], [60, 0.05]] as const) {
      expect(navigationIntensityCd("position-tail", toward(180, elevation)) / 20).toBeGreaterThanOrEqual(minimum - 1e-12);
    }
    // Sector edges are soft, never a step: the light fades over two degrees.
    const across = [-1.5, -0.5, 0, 0.5, 1.5].map(bearing => navigationIntensityCd("position-left", toward(bearing)));
    for (let index = 1; index < across.length; index++) expect(across[index]).toBeGreaterThanOrEqual(across[index - 1]);
    expect(across[2]).toBeCloseTo(20, 6);
  });

  it("flash anti-collision lights at the 400 cd effective intensity 25.1401 requires, by the Blondel-Rey relation", () => {
    for (const kind of ["strobe", "beacon"] as const) {
      const { flashSeconds, periodSeconds, phaseSeconds } = ANTI_COLLISION[kind];
      const { peakCd } = flash(kind, 0);
      expect((peakCd * flashSeconds) / (0.2 + flashSeconds)).toBeCloseTo(400, 9);
      // Lit for the flash, dark for the rest of the period, and the next change is when it says.
      const start = phaseSeconds + periodSeconds * 3;
      expect(flash(kind, start + flashSeconds / 2).lit).toBe(true);
      expect(flash(kind, start + flashSeconds * 1.5).lit).toBe(false);
      expect(flash(kind, start + flashSeconds / 2).nextChangeSeconds).toBeCloseTo(start + flashSeconds, 9);
      expect(flash(kind, start + flashSeconds * 1.5).nextChangeSeconds).toBeCloseTo(start + periodSeconds, 9);
      expect(60 / periodSeconds).toBeGreaterThanOrEqual(40);
      expect(60 / periodSeconds).toBeLessThanOrEqual(100);
    }
    // The beacon flashes between the strobes' flashes.
    expect(flash("strobe", ANTI_COLLISION.beacon.phaseSeconds).lit).toBe(false);
  });

  it("send a beam's light along its axis, and the lens's glow to the side from in front only", () => {
    expect(beamIntensityCd("landing", 1)).toBe(BEAMS.landing.peakCd);
    expect(beamIntensityCd("landing", Math.cos(20 * RAD))).toBeCloseTo(BEAMS.landing.peakCd * BEAMS.lensGlowShare * Math.cos(20 * RAD), 6);
    expect(beamIntensityCd("taxi", Math.cos(10 * RAD))).toBe(BEAMS.taxi.peakCd);
    expect(beamIntensityCd("landing", -0.5)).toBe(0);
  });

  it("are placed on every aircraft: red on the left wingtip at +X, green on the right, white behind, beams forward", () => {
    for (const id of AIRCRAFT_IDS) {
      const lights = AIRCRAFT_LIGHTS[id];
      const left = lights.find(light => light.kind === "position-left")!;
      const right = lights.find(light => light.kind === "position-right")!;
      expect(left.position[0]).toBeGreaterThan(5);
      expect(right.position[0]).toBeLessThan(-5);
      expect(left.position[1]).toBe(right.position[1]);
      for (const tail of lights.filter(light => light.kind === "position-tail")) expect(tail.position[2]).toBeLessThan(-4);
      expect(lights.filter(light => light.kind === "strobe")).toHaveLength(2);
      for (const beam of lights.filter(light => light.kind === "landing" || light.kind === "taxi")) {
        expect(beam.direction![2]).toBeGreaterThan(0.99);
        expect(beam.direction![1]).toBeLessThan(0);
      }
      // Shares of one light's duty add up to it.
      const tails = lights.filter(light => light.kind === "position-tail");
      expect(tails.reduce((sum, light) => sum + (light.share ?? 1), 0)).toBeCloseTo(1, 9);
    }
    // The F-35B's landing and taxi lamps are on its nose gear leg.
    expect(AIRCRAFT_LIGHTS["f-35b"].filter(light => light.onGear).map(light => light.kind)).toEqual(["landing", "taxi"]);
    // Colours keep their luminance: a candela of red is a candela.
    for (const kind of ["position-left", "position-right", "landing"] as const) {
      const [r, g, b] = lightColour(kind);
      expect(0.2126 * r + 0.7152 * g + 0.0722 * b).toBeCloseTo(1, 12);
    }
    expect(lightColour("position-left")[0]).toBeGreaterThan(lightColour("position-left")[1] * 10);
  });
});
