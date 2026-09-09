import { describe, expect, it, vi } from "vitest";
import { createFlightLog } from "./flightLog";

const silent = { log: () => {}, warn: () => {}, error: () => {} };

describe("flight log", () => {
  it("keeps newest first and records level, source and detail", () => {
    const log = createFlightLog({ console: silent, now: () => 1000 });
    log.info("sim", "Paused");
    log.error("physics", "Faulted after stepping", { stepMeters: 4210.5 });

    const entries = log.entries();
    expect(entries).toHaveLength(2);
    expect(entries[0].message).toBe("Faulted after stepping");
    expect(entries[0].level).toBe("error");
    expect(entries[0].source).toBe("physics");
    expect(entries[0].detail).toEqual({ stepMeters: 4210.5 });
    expect(entries[1].message).toBe("Paused");
  });

  it("timestamps relative to the log's creation", () => {
    let clock = 5_000;
    const log = createFlightLog({ console: silent, now: () => clock });
    clock = 7_500;
    log.info("sim", "Resume requested");
    expect(log.entries()[0].atMs).toBe(2_500);
  });

  it("drops the oldest entries past capacity", () => {
    const log = createFlightLog({ capacity: 3, console: silent });
    for (let i = 0; i < 5; i += 1) log.info("sim", `event ${i}`);
    expect(log.entries().map((entry) => entry.message)).toEqual(["event 4", "event 3", "event 2"]);
  });

  it("mirrors to the console at the matching severity, so entries survive a reload", () => {
    const sink = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const log = createFlightLog({ console: sink });
    log.info("sim", "a");
    log.warn("sim", "b");
    log.error("physics", "c", { failed: ["airspeedKts is NaN"] });
    expect(sink.log).toHaveBeenCalledWith("[sim] a");
    expect(sink.warn).toHaveBeenCalledWith("[sim] b");
    expect(sink.error).toHaveBeenCalledWith("[physics] c", { failed: ["airspeedKts is NaN"] });
  });

  it("notifies subscribers until they unsubscribe", () => {
    const log = createFlightLog({ console: silent });
    const seen: number[] = [];
    const stop = log.subscribe((entries) => seen.push(entries.length));
    log.info("sim", "a");
    log.info("sim", "b");
    stop();
    log.info("sim", "c");
    expect(seen).toEqual([1, 2]);
  });

  it("clears and tells subscribers", () => {
    const log = createFlightLog({ console: silent });
    log.info("sim", "a");
    const seen: number[] = [];
    log.subscribe((entries) => seen.push(entries.length));
    log.clear();
    expect(log.entries()).toHaveLength(0);
    expect(seen).toEqual([0]);
  });
});
