import { describe, expect, it } from "vitest";
import {
  createTransitionLog, deriveEnginePhase, discoverReadableProperties, discreteEngineState, formatRowValue,
  formatValue, tankRows, type EngineSample,
} from "./engineMonitorModel";

const sample = (overrides: Partial<EngineSample> = {}): EngineSample => ({
  simTimeS: 10, n1Pct: 24.3, n2Pct: 53.4, rpm: null, thrustLbf: 90, fuelFlowPps: 0.0211, fuelFlowGph: 11.2,
  running: true, starter: false, cutoff: false, seized: false, stalled: false,
  totalFuelLbs: 900, qbarPsf: 60, throttleNorm: 0, kcas: 130, ...overrides,
});

describe("engine catalog discovery", () => {
  it("lists every readable property under the queried prefixes and skips write-only ones", () => {
    const catalog: Record<string, string> = {
      propulsion: "propulsion/engine/n1 (RW)\npropulsion/set-running (W)\npropulsion/tank/contents-lbs (RW)\n",
      "fcs/throttle": "fcs/throttle-cmd-norm (RW)\nfcs/throttle-pos-norm (R)\n",
      "aero/qbar-psf": "No matches found\n",
    };
    const reader = { getPropertyValue: () => 0, queryPropertyCatalog: (query: string) => catalog[query] ?? "" };
    expect(discoverReadableProperties(reader, ["propulsion", "fcs/throttle", "aero/qbar-psf"])).toEqual([
      "fcs/throttle-cmd-norm", "fcs/throttle-pos-norm", "propulsion/engine/n1", "propulsion/tank/contents-lbs",
    ]);
  });

  it("returns nothing, rather than throwing, for a reader without a usable catalog", () => {
    expect(discoverReadableProperties({ getPropertyValue: () => 0 })).toEqual([]);
    expect(discoverReadableProperties({
      getPropertyValue: () => 0,
      queryPropertyCatalog: () => { throw new Error("no catalog"); },
    })).toEqual([]);
  });
});

describe("derived engine phase (mirrors FGTurbine::Calculate)", () => {
  it.each([
    ["running", {}, "running"],
    ["fuel burning before running latches", { running: false, fuelFlowPps: 0.012 }, "starting"],
    ["starter with fuel cut off", { running: false, fuelFlowPps: 0, cutoff: true, starter: true, n2Pct: 25 }, "motoring"],
    ["off with the spools turning", { running: false, fuelFlowPps: 0, cutoff: true, n1Pct: 6, n2Pct: 4 }, "windmilling"],
    ["off and still", { running: false, fuelFlowPps: 0, cutoff: true, n1Pct: 0, n2Pct: 0 }, "off"],
    ["no fuel on board", { totalFuelLbs: 0 }, "starved"],
    ["stall flag", { stalled: true }, "stalled"],
    ["seize outranks stall", { stalled: true, seized: true }, "seized"],
  ] as const)("%s", (_name, overrides: Partial<EngineSample>, phase) => {
    expect(deriveEnginePhase(sample(overrides)).phase).toBe(phase);
  });

  it("explains a windmilling engine with its airspeed targets and why it has not relit", () => {
    const cut = deriveEnginePhase(sample({ running: false, fuelFlowPps: 0, cutoff: true, n1Pct: 8, n2Pct: 5, qbarPsf: 60 }));
    expect(cut.detail).toMatch(/N1 → qbar\/10 ≈ 6\.0%/);
    expect(cut.detail).toMatch(/cutoff_cmd = 1/);
    expect(cut.derived).toBe(true);
    expect(deriveEnginePhase(sample({ running: false, fuelFlowPps: 0, n1Pct: 8, n2Pct: 5 })).detail)
      .toMatch(/below the 15%/);
    expect(deriveEnginePhase(sample({ running: false, fuelFlowPps: 0, n1Pct: 30, n2Pct: 40, qbarPsf: 10 })).detail)
      .toMatch(/Neither the starter nor enough ram air/);
  });

  it("reads a piston engine from its running flag and crankshaft speed", () => {
    const piston = (overrides: Partial<EngineSample>) => sample({ n1Pct: null, n2Pct: null, rpm: 2400, ...overrides });
    expect(deriveEnginePhase(piston({}))).toMatchObject({ phase: "running", derived: false });
    expect(deriveEnginePhase(piston({ running: false, rpm: 600 })).phase).toBe("turning");
    expect(deriveEnginePhase(piston({ running: false, rpm: 0 })).phase).toBe("off");
    expect(deriveEnginePhase(sample({ n1Pct: null, n2Pct: null, rpm: null, running: null })).phase).toBe("unknown");
  });
});

describe("transition log", () => {
  it("records each discrete change with its simulation time, newest first", () => {
    const log = createTransitionLog();
    expect(log.observe(1, discreteEngineState(sample(), deriveEnginePhase(sample())))).toBe(false);
    const stopped = sample({ running: false, fuelFlowPps: 0, cutoff: true, n1Pct: 20 });
    expect(log.observe(2.5, discreteEngineState(stopped, deriveEnginePhase(stopped)))).toBe(true);
    expect(log.entries().map((entry) => entry.text)).toEqual(expect.arrayContaining([
      "phase: RUNNING → WINDMILLING", "running: 1 → 0", "cutoff: 0 → 1", "fuel burning: yes → no",
    ]));
    expect(log.entries()[0].simTimeS).toBe(2.5);
  });

  it("keeps keys a sample left out, notes a rewind and stays within capacity", () => {
    const log = createTransitionLog(3);
    log.observe(5, { "sound epoch": "1", phase: "RUNNING" });
    log.observe(5.1, { phase: "RUNNING" });
    log.observe(5.2, { "sound epoch": "2" });
    expect(log.entries()[0].text).toBe("sound epoch: 1 → 2");
    log.observe(0.5, {});
    expect(log.entries()[0].text).toMatch(/rewound from 5\.20 s/);
    for (let i = 0; i < 5; i += 1) log.observe(1 + i, { phase: String(i) });
    expect(log.entries()).toHaveLength(3);
    log.clear();
    expect(log.entries()).toEqual([]);
  });
});

describe("formatting", () => {
  it("keeps precision for small values and wastes none on large ones", () => {
    expect(formatValue(Number.NaN)).toBe("n/a");
    expect(formatValue(3)).toBe("3");
    expect(formatValue(1234.567)).toBe("1235");
    expect(formatValue(212.5864)).toBe("212.6");
    expect(formatValue(0.0474441)).toBe("0.0474");
    expect(formatRowValue({ label: "Fuel flow", path: "p", unit: "lb/h", scale: 3600, digits: 0 }, 0.0474441))
      .toBe("171 lb/h");
    expect(formatRowValue({ label: "Cutoff", path: "p", flag: true }, 1)).toBe("on");
  });

  it("labels whatever tanks the catalog lists", () => {
    expect(tankRows(["propulsion/tank/contents-lbs", "propulsion/tank[1]/pct-full", "propulsion/tank/x-position"])
      .map((row) => row.label)).toEqual(["Tank 1 contents", "Tank 2 full"]);
  });
});
