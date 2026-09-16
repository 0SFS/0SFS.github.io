import { describe, expect, it } from "vitest";
import { createFlightRecorder, propertyInCatalog, type FlightRecorderPropertyReader } from "./flightRecorder";

function reader(values: Record<string, number>, catalog = Object.keys(values)): FlightRecorderPropertyReader & { set(p: string, v: number): void } {
  const state = { ...values };
  return {
    // JSBSim answers 0 for an unknown property rather than failing.
    getPropertyValue: (property) => state[property] ?? 0,
    queryPropertyCatalog: (check) => {
      const hits = catalog.map((p) => p.replace(/\[0\]/g, "")).filter((p) => p.includes(check));
      return hits.length ? hits.map((p) => `${p} (R)`).join("\n") + "\n" : "No matches found\n";
    },
    set: (property, value) => { state[property] = value; },
  };
}

const CHANNELS = [
  { column: "kcas", property: "velocities/vc-kts" },
  { column: "n1_pct", property: "propulsion/engine[0]/n1" },
  { column: "vs_fpm", property: "velocities/v-down-fps", scale: -60 },
];

describe("flight recorder", () => {
  it("finds index-0 properties the way the JSBSim catalog lists them", () => {
    const r = reader({ "propulsion/engine[0]/n1": 90 });
    expect(propertyInCatalog(r, "propulsion/engine[0]/n1")).toBe(true);
    expect(propertyInCatalog(r, "fcs/stick-pusher")).toBe(false);
  });

  it("records nothing until start() and ignores samples after stop()", () => {
    const rec = createFlightRecorder({ sampleHz: 10, channels: CHANNELS, now: () => 0 });
    const r = reader({ "simulation/sim-time-sec": 0, "velocities/vc-kts": 100 });
    expect(rec.isRecording()).toBe(false);
    expect(rec.sample(r)).toBe(false);
    expect(rec.getSampleCount()).toBe(0);
    rec.start();
    expect(rec.isRecording()).toBe(true);
    expect(rec.sample(r)).toBe(true);
    rec.stop();
    r.set("simulation/sim-time-sec", 0.1);
    expect(rec.sample(r)).toBe(false);
    expect(rec.getSampleCount()).toBe(1);
  });

  it("samples at the simulation-time rate and records nothing while time stands still", () => {
    const rec = createFlightRecorder({ sampleHz: 10, channels: CHANNELS, now: () => 0 });
    rec.start();
    const r = reader({ "simulation/sim-time-sec": 0, "velocities/vc-kts": 100 });
    expect(rec.sample(r)).toBe(true);
    expect(rec.sample(r)).toBe(false);
    r.set("simulation/sim-time-sec", 1 / 120);
    expect(rec.sample(r)).toBe(false);
    r.set("simulation/sim-time-sec", 0.1);
    expect(rec.sample(r)).toBe(true);
    expect(rec.getSampleCount()).toBe(2);
    expect(rec.getDurationSec()).toBeCloseTo(0.1);
  });

  it("leaves a channel empty on aircraft that lack it, and applies scales", () => {
    const rec = createFlightRecorder({ channels: CHANNELS, now: () => 0 });
    rec.start();
    rec.sample(reader({ "simulation/sim-time-sec": 1, "velocities/vc-kts": 120, "velocities/v-down-fps": -10 }));
    const [header, row] = rec.toCsv().trim().split("\n").filter((line) => !line.startsWith("#"));
    expect(header).toBe("sim_time_sec,wall_time_utc,segment,kcas,n1_pct,vs_fpm,mark");
    expect(row.split(",").slice(3)).toEqual(["120", "", "600", ""]);
  });

  it("starts a new segment when the simulation is reset", () => {
    const rec = createFlightRecorder({ sampleHz: 10, channels: CHANNELS, now: () => 0 });
    rec.start();
    const r = reader({ "simulation/sim-time-sec": 5 });
    rec.sample(r);
    r.set("simulation/sim-time-sec", 0);
    rec.sample(r);
    const rows = rec.toCsv().trim().split("\n").filter((l) => !l.startsWith("#")).slice(1);
    expect(rows.map((l) => l.split(",")[2])).toEqual(["0", "1"]);
  });

  it("puts metadata, marks and notes in the file", () => {
    const rec = createFlightRecorder({ sampleHz: 10, channels: CHANNELS, now: () => Date.UTC(2026, 8, 14),
      metadata: { build: "abc123", aircraft: "cirrus-vision-jet" } });
    expect(rec.mark()).toBeNull();
    const r = reader({ "simulation/sim-time-sec": 2 });
    rec.start();
    rec.sample(r);
    expect(rec.mark("nose drops, with flaps")?.number).toBe(1);
    const csv = rec.toCsv();
    expect(csv).toContain("# build: abc123");
    expect(csv).toContain("# aircraft: cirrus-vision-jet");
    expect(csv).toContain("# mark 1: sim_time_sec 2.000 nose drops  with flaps");
    expect(csv.trim().split("\n").at(-1)).toMatch(/,1 nose drops {2}with flaps$/);
  });

  it("drops the oldest samples, and their marks, beyond capacity", () => {
    const rec = createFlightRecorder({ sampleHz: 1, capacitySeconds: 3, channels: CHANNELS, now: () => 0 });
    rec.start();
    const r = reader({ "simulation/sim-time-sec": 0 });
    rec.sample(r);
    rec.mark("first");
    for (let t = 1; t <= 4; t += 1) {
      r.set("simulation/sim-time-sec", t);
      rec.sample(r);
    }
    rec.mark("last");
    expect(rec.getSampleCount()).toBe(3);
    expect(rec.getMarks().map((m) => m.note)).toEqual(["last"]);
    const rows = rec.toCsv().trim().split("\n").filter((l) => !l.startsWith("#")).slice(1);
    expect(rows.map((l) => l.split(",")[0])).toEqual(["2.000", "3.000", "4.000"]);
  });
});
