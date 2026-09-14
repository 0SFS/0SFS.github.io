import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadSweep, readAbi, renderSweep, RESULT_SCHEMA } from "./renderSweep.mjs";

// Smoke test for the offline benchmark tooling, on a short slice of the sweep.
// It checks that the tool reports honestly; it does not produce evidence.

const schema = JSON.parse(readFileSync("benchmarks/audio/result.schema.json", "utf8"));

/** Minimal check of the schema's `required` keys, recursively through `properties`. */
function missingRequired(value, node, at = "$") {
  const missing = [];
  for (const key of node.required ?? []) if (!(key in (value ?? {}))) missing.push(`${at}.${key}`);
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    if (value && key in value && child.type === "object") missing.push(...missingRequired(value[key], child, `${at}.${key}`));
    if (value && Array.isArray(value[key]) && child.items) {
      value[key].forEach((item, index) => missing.push(...missingRequired(item, child.items, `${at}.${key}[${index}]`)));
    }
  }
  return missing;
}

describe("offline sweep renderer", () => {
  it("reads the wire format from snapshot.h", () => {
    const abi = readAbi();
    expect(abi.snapshotSize).toBe(29);
    expect(abi.slot.n1Pct).toBe(5);
    expect(abi.batchLength).toBe(2 + 8 * 29 + 32 * 4);
  });

  it("generates the 240 s, 60 Hz sweep deterministically", () => {
    const first = loadSweep();
    expect(first.rows).toHaveLength(240 * 60);
    expect(first.rows[12 * 60]).toMatchObject({ combustion: true, cutoff: false });
    expect(loadSweep().sha256).toBe(first.sha256);
  });

  it("reports proxy timings, bounded output, and an unknown dropout count", async () => {
    const report = await renderSweep({ tiers: ["off", "low"], rates: [48_000], seconds: 15 });
    expect(report.schema).toBe(RESULT_SCHEMA);
    expect(missingRequired(report, schema)).toEqual([]);
    expect(report.dropouts.count).toBeNull();
    const off = report.runs.find((run) => run.tier === "off");
    expect(off.output.peak).toBe(0);
    const low = report.runs.find((run) => run.tier === "low" && run.pass === "sweep");
    expect(low.output.nonFiniteSamples).toBe(0);
    expect(low.output.peakWithinLimiterCeiling).toBe(true);
    // Motoring is quieter than idle once the burner lights.
    expect(low.output.rmsBySegment["light-off-and-idle"]).toBeGreaterThan(low.output.rmsBySegment.motoring);
    // The first 15 s hold two transitions: starter on at 5 s, light-off at 12 s.
    expect(low.core.eventsIn).toBe(2);
    expect(low.timing.aggregate.samples).toBeGreaterThan(0);
    const capacity = report.runs.find((run) => run.tier === "low" && run.pass === "capacity");
    expect(capacity.tireSlipWatts).toBe(15_000);
  }, 60_000);

  it("survives labelled fault injection with bounded output and counters that show each fault", async () => {
    const report = await renderSweep({ tiers: ["low"], rates: [48_000], seconds: 75, passes: ["fault-injection"] });
    const [run] = report.runs;
    expect(run.pass).toBe("fault-injection");
    expect(run.faults.map((fault) => fault.kind)).toEqual(["seek", "stale-input", "non-finite-snapshot"]);
    expect(run.output.nonFiniteSamples).toBe(0);
    expect(run.output.peakWithinLimiterCeiling).toBe(true);
    expect(run.core.epoch).toBe(2);
    expect(run.core.staleFades).toBeGreaterThan(0);
    expect(run.core.nonFinite).toBe(1);
  }, 60_000);
});
