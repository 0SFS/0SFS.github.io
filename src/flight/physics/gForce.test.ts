import { describe, expect, it } from "vitest";
import {
  ALERT_PILOT,
  CLEAR_G_VISION,
  drawSecondsOut,
  gVisionTarget,
  PILOT_NORMAL_ACCELERATION,
  readPilotG,
  stepGVision,
  stepPilot,
  type GVisionSettings,
  type PassOutSettings,
  type PilotState,
} from "./gForce";

const SETTINGS: GVisionSettings = {
  blackout: { min: 5, max: 9 },
  redout: { min: -3, max: -2 },
  onsetSeconds: 5,
  recoverySeconds: 2,
};

const reader = (value: number) => ({ getPropertyValue: (property: string) => property === PILOT_NORMAL_ACCELERATION ? value : 0 });

describe("the load at the pilot's seat", () => {
  it("reads 1 g in level flight, where body Z, which points down, reads -1", () => {
    expect(readPilotG(reader(-1))).toBe(1);
    expect(readPilotG(reader(-6.5))).toBe(6.5);
    expect(readPilotG(reader(2))).toBe(-2);
  });

  it("reads 1 g when the flight model has no number to give", () => {
    expect(readPilotG(reader(Number.NaN))).toBe(1);
    expect(readPilotG(reader(Number.POSITIVE_INFINITY))).toBe(1);
  });
});

describe("where sight settles under a load", () => {
  it("is clear from the redout's start to the blackout's", () => {
    for (const g of [-2, 0, 1, 5]) expect(gVisionTarget(g, SETTINGS)).toEqual(CLEAR_G_VISION);
  });

  it("closes black in proportion between the blackout's two loads, and stays closed past them", () => {
    expect(gVisionTarget(7, SETTINGS)).toEqual({ blackout: 0.5, redout: 0 });
    expect(gVisionTarget(9, SETTINGS)).toEqual({ blackout: 1, redout: 0 });
    expect(gVisionTarget(12, SETTINGS)).toEqual({ blackout: 1, redout: 0 });
  });

  it("closes red in proportion between the redout's two loads, and stays closed past them", () => {
    expect(gVisionTarget(-2.5, SETTINGS)).toEqual({ blackout: 0, redout: 0.5 });
    expect(gVisionTarget(-3, SETTINGS)).toEqual({ blackout: 0, redout: 1 });
    expect(gVisionTarget(-8, SETTINGS)).toEqual({ blackout: 0, redout: 1 });
  });

  it("closes at once at a range whose two ends are the same load", () => {
    const sharp = { ...SETTINGS, blackout: { min: 6, max: 6 }, redout: { min: -2, max: -2 } };
    expect(gVisionTarget(5.9, sharp).blackout).toBe(0);
    expect(gVisionTarget(6, sharp).blackout).toBe(1);
    expect(gVisionTarget(-1.9, sharp).redout).toBe(0);
    expect(gVisionTarget(-2, sharp).redout).toBe(1);
  });
});

describe("sight following the load", () => {
  const hold = (g: number, seconds: number, from = CLEAR_G_VISION, settings = SETTINGS) => {
    let vision = from;
    for (let step = 0; step < Math.round(seconds * 60); step += 1) vision = stepGVision(vision, g, 1 / 60, settings);
    return vision;
  };

  it("is within 5% of where it settles after the onset time, and not before", () => {
    expect(hold(9, 2.5).blackout).toBeLessThan(0.8);
    const after = hold(9, 5).blackout;
    expect(after).toBeGreaterThan(0.94);
    expect(after).toBeLessThan(0.96);
  });

  it("comes back within 5% after the recovery time, and to exactly clear", () => {
    const dark = { blackout: 1, redout: 0 };
    const after = hold(1, 2, dark).blackout;
    expect(after).toBeGreaterThan(0.04);
    expect(after).toBeLessThan(0.06);
    expect(hold(1, 20, dark)).toEqual(CLEAR_G_VISION);
  });

  it("does not notice a load that lasts one step, such as a touchdown", () => {
    expect(stepGVision(CLEAR_G_VISION, 30, 1 / 120, SETTINGS).blackout).toBeLessThan(0.01);
  });

  it("reaches the same level whatever the frame rate", () => {
    let coarse = CLEAR_G_VISION;
    for (let step = 0; step < 20; step += 1) coarse = stepGVision(coarse, 9, 0.1, SETTINGS);
    expect(coarse.blackout).toBeCloseTo(hold(9, 2).blackout, 6);
  });

  it("lets the red close while the black is still clearing", () => {
    const vision = hold(-3, 0.5, { blackout: 1, redout: 0 });
    expect(vision.blackout).toBeGreaterThan(0);
    expect(vision.blackout).toBeLessThan(1);
    expect(vision.redout).toBeGreaterThan(0);
  });

  it("follows at once with no onset or recovery time", () => {
    const instant = { ...SETTINGS, onsetSeconds: 0, recoverySeconds: 0 };
    expect(stepGVision(CLEAR_G_VISION, 7, 1 / 60, instant).blackout).toBe(0.5);
    expect(stepGVision({ blackout: 1, redout: 1 }, 1, 1 / 60, instant)).toEqual(CLEAR_G_VISION);
  });

  it("holds while no simulated time passes", () => {
    const vision = { blackout: 0.4, redout: 0 };
    expect(stepGVision(vision, 9, 0, SETTINGS)).toBe(vision);
  });
});

const PASS_OUT: PassOutSettings = { meanSeconds: 11.9, spreadSeconds: 4 };

/** Uniform draws in turn, as `Math.random` gives them. */
const draws = (...values: number[]) => {
  let next = 0;
  return () => values[next++ % values.length]!;
};
/** The two uniform draws Box–Muller turns into this standard normal draw. */
const normal = (z: number) => [1 - Math.exp(-z * z / 2), z >= 0 ? 0 : 0.5];

/** A small seeded generator (mulberry32), so a bell curve's statistics are the same every run. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe("the time out after passing out", () => {
  it("is the mean plus the spread times a standard normal draw", () => {
    expect(drawSecondsOut(PASS_OUT, draws(...normal(1)))).toBeCloseTo(15.9, 9);
    expect(drawSecondsOut(PASS_OUT, draws(...normal(-2)))).toBeCloseTo(3.9, 9);
  });

  it("is always the mean with no spread", () => {
    expect(drawSecondsOut({ meanSeconds: 11.9, spreadSeconds: 0 }, seeded(1))).toBe(11.9);
  });

  it("draws again below zero, and gives the mean if every draw is", () => {
    const settings = { meanSeconds: 2, spreadSeconds: 1 };
    expect(drawSecondsOut(settings, draws(...normal(-4), ...normal(1)))).toBeCloseTo(3, 9);
    expect(drawSecondsOut(settings, draws(...normal(-4)))).toBe(2);
  });

  it("falls on a bell curve around the mean, with the spread as its standard deviation", () => {
    const random = seeded(7);
    const times = Array.from({ length: 20000 }, () => drawSecondsOut(PASS_OUT, random));
    const mean = times.reduce((sum, time) => sum + time, 0) / times.length;
    const deviation = Math.sqrt(times.reduce((sum, time) => sum + (time - mean) ** 2, 0) / times.length);
    expect(mean).toBeCloseTo(11.9, 1);
    expect(deviation).toBeGreaterThan(3.9);
    expect(deviation).toBeLessThan(4.1);
    const withinOne = times.filter(time => Math.abs(time - 11.9) < 4).length / times.length;
    expect(withinOne).toBeGreaterThan(0.67);
    expect(withinOne).toBeLessThan(0.70);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(0);
  });
});

describe("passing out", () => {
  const fly = (g: number, seconds: number, from: PilotState = ALERT_PILOT, passOut: PassOutSettings | null = PASS_OUT,
    random = draws(...normal(0))) => {
    let pilot = from;
    for (let step = 0; step < Math.round(seconds * 60); step += 1) pilot = stepPilot(pilot, g, 1 / 60, SETTINGS, passOut, random);
    return pilot;
  };
  const out: PilotState = { vision: { blackout: 1, redout: 0 }, secondsOut: 11.9 };

  it("never happens unless the person opts in", () => {
    const pilot = fly(12, 60, ALERT_PILOT, null);
    expect(pilot.vision.blackout).toBe(1);
    expect(pilot.secondsOut).toBe(0);
  });

  it("happens when the black closes completely, about three onset times at the top of the range", () => {
    expect(fly(9, 15.3).secondsOut).toBe(0);
    const pilot = fly(9, 15.4);
    expect(pilot.secondsOut).toBeGreaterThan(11.8);
    expect(pilot.secondsOut).toBeLessThanOrEqual(11.9);
  });

  it("never happens below the top of the blackout range, however long the load is held", () => {
    const pilot = fly(8.9, 120);
    expect(pilot.vision.blackout).toBeGreaterThan(0.97);
    expect(pilot.secondsOut).toBe(0);
  });

  it("keeps sight black and counts down in simulated time while out", () => {
    const pilot = fly(1, 5, out);
    expect(pilot.vision).toEqual({ blackout: 1, redout: 0 });
    expect(pilot.secondsOut).toBeCloseTo(6.9, 6);
    expect(stepPilot(pilot, 1, 0, SETTINGS, PASS_OUT)).toBe(pilot);
  });

  it("comes to after the time out, with sight returning from black over the recovery time", () => {
    const awake = fly(1, 12, out);
    expect(awake.secondsOut).toBe(0);
    expect(awake.vision.blackout).toBeLessThan(1);
    const after = fly(1, 2, { vision: { blackout: 1, redout: 0 }, secondsOut: 0 });
    expect(after.vision.blackout).toBeGreaterThan(0.04);
    expect(after.vision.blackout).toBeLessThan(0.06);
  });

  it("spends what is left of a step after coming to on sight returning", () => {
    const pilot = stepPilot({ vision: { blackout: 1, redout: 0 }, secondsOut: 0.01 }, 1, 0.1, SETTINGS, PASS_OUT);
    expect(pilot.secondsOut).toBe(0);
    expect(pilot.vision.blackout).toBeCloseTo(Math.exp(-0.09 * 3 / 2), 9);
  });

  it("passes out again at once if the load is still at the top of the range on coming to", () => {
    const pilot = stepPilot({ vision: { blackout: 1, redout: 0 }, secondsOut: 0.01 }, 9, 0.1, SETTINGS, PASS_OUT,
      draws(...normal(1)));
    expect(pilot.secondsOut).toBeCloseTo(15.9, 9);
  });
});
