import { describe, expect, it } from "vitest";
import {
  SF50_DRY_PAVED_SURFACE, surveySf50Runway, auditSf50Surface, Sf50RunwayConditionMonitor,
} from "./sf50RunwayConditions";

const surface = {
  groundSolid: 1, groundBumpiness: 0, groundStaticFrictionFactor: 1,
  groundRollingFrictionFactor: 1, groundMaximumForceLb: Number.MAX_VALUE,
};
const origin = { latitudeDeg: 34, longitudeDeg: -118, terrainElevationFt: 5000, headingDeg: 0 };
const probe = (position: { latitudeDeg: number; longitudeDeg: number; altitudeMslFt: number; terrainElevationFt: number }) => ({
  simTimeSec: 0, latitudeDeg: position.latitudeDeg, longitudeDeg: position.longitudeDeg,
  altitudeAglFt: position.altitudeMslFt - position.terrainElevationFt,
  temperatureC: 15 - 0.0019812 * position.altitudeMslFt,
  diagnostics: { ...surface, terrainElevationFt: position.terrainElevationFt, nativePressureAltitudeFt: position.altitudeMslFt },
});

describe("SF50 runway condition evidence", () => {
  it("uses measured runway-level native pressure altitude and retains the probe offset", () => {
    const survey = surveySf50Runway(probe, origin);
    expect(survey.probes).toHaveLength(5);
    expect(survey.conditions.pressureAltitudeFt).toBe(5001);
    expect(survey.probes[0]!.aircraftAglFt).toBe(1);
    expect(survey.conditions.runwaySlopePercent).toBe(0);
    expect(survey.blockers).toEqual([]);
  });
  it("does not fill missing pressure evidence from the requested altitude", () => {
    const survey = surveySf50Runway(position => ({
      ...probe(position), diagnostics: { ...surface, terrainElevationFt: position.terrainElevationFt },
    }), origin);
    expect(survey.conditions.pressureAltitudeFt).toBeUndefined();
    expect(survey.blockers.join(" ")).toMatch(/native pressure altitude/);
  });
  it("retains non-ISA pressure evidence instead of substituting geometric altitude", () => {
    const survey = surveySf50Runway(position => ({
      ...probe(position), diagnostics: { ...probe(position).diagnostics, nativePressureAltitudeFt: 5200 },
    }), origin);
    expect(survey.conditions.pressureAltitudeFt).toBe(5200);
  });
  it("rejects any atmospheric probe that advances simulation time", () => {
    expect(() => surveySf50Runway(position => ({ ...probe(position), simTimeSec: 1 }), origin)).toThrow(/zero-time/);
  });
  it("does not average opposing terrain grades into a level runway", () => {
    let index = 0;
    const elevations = [5000, 5020, 5000, 5020, 5000];
    const survey = surveySf50Runway(position => ({
      ...probe(position), diagnostics: { ...surface, nativePressureAltitudeFt: 5001, terrainElevationFt: elevations[index++]! },
    }), origin);
    expect(Math.abs(survey.conditions.runwaySlopePercent!)).toBe(1);
  });
  it("requires native terrain readings to establish runway slope", () => {
    const survey = surveySf50Runway(position => ({
      ...probe(position), diagnostics: { ...surface, nativePressureAltitudeFt: 5001 },
    }), origin);
    expect(survey.conditions.runwaySlopePercent).toBeUndefined();
    expect(survey.blockers.join(" ")).toMatch(/terrain elevations/);
  });
  it("labels matched surface readbacks as configured, not friction-calibrated", () => {
    const result = auditSf50Surface(surface);
    expect(result.state).toBe("configured");
    expect(result.conditions.runwaySurface).toBe("dry-paved");
    expect(result.frictionCalibration).toBe("unvalidated");
    expect(SF50_DRY_PAVED_SURFACE.staticFrictionFactor).toBe(1);
  });
  it.each([
    { ...surface, groundStaticFrictionFactor: 0.5 },
    { ...surface, groundSolid: 0 },
    { ...surface, groundMaximumForceLb: 100 },
    {},
  ])("does not claim a configured surface when native settings are missing or different", diagnostics => {
    const result = auditSf50Surface(diagnostics);
    expect(result.state).toBe("unconfirmed");
    expect(result.conditions.runwaySurface).toBeUndefined();
    expect(result.blockers.length).toBeGreaterThan(0);
  });
  it("tracks surface/terrain changes and coverage throughout a measured run", () => {
    const monitor = new Sf50RunwayConditionMonitor(surveySf50Runway(probe, origin));
    monitor.observe({ ...surface, terrainElevationFt: 5000 }, 0);
    expect(monitor.snapshot().blockers).toEqual([]);
    monitor.observe({ ...surface, groundRollingFrictionFactor: 2, terrainElevationFt: 5001 }, 8100);
    expect(monitor.snapshot().observedSamples).toBe(2);
    expect(monitor.snapshot().blockers.join(" ")).toMatch(/rollingFrictionFactor/);
    expect(monitor.snapshot().blockers.join(" ")).toMatch(/level-runway/);
    expect(monitor.snapshot().blockers.join(" ")).toMatch(/coverage/);
  });
});
