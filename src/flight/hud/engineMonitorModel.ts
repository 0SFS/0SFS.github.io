import type { FlightRecorderPropertyReader } from "../diagnostics/flightRecorder";

/**
 * What the loaded engine publishes, and what JSBSim is doing with it.
 *
 * Kept free of the DOM so the phase rules can be checked against the real SDK.
 * JSBSim does not publish a turbine's internal phase, so `deriveEnginePhase`
 * mirrors the rules in FGTurbine::Calculate from the flags it does publish.
 * The result is a reading of those rules, marked `derived`, not a value
 * JSBSim reports.
 */

export type EngineReader = FlightRecorderPropertyReader;

/** Catalog prefixes the monitor discovers. Everything readable under them is listed. */
export const ENGINE_CATALOG_QUERIES: readonly string[] = [
  "propulsion", "fcs/throttle", "fcs/mixture", "aero/qbar-psf", "velocities/vc-kts", "simulation/sim-time-sec",
];

/** Fuel flow above this counts as burning: the same threshold as the audio adapter's combustion rule. */
export const BURNING_FUEL_PPS = 1e-4;

/** Catalog names, which list engine 0 without its "[0]". */
export const ENGINE_PATHS = {
  simTime: "simulation/sim-time-sec",
  n1: "propulsion/engine/n1",
  n2: "propulsion/engine/n2",
  rpm: "propulsion/engine/engine-rpm",
  thrust: "propulsion/engine/thrust-lbs",
  fuelFlowPps: "propulsion/engine/fuel-flow-rate-pps",
  fuelFlowGph: "propulsion/engine/fuel-flow-rate-gph",
  running: "propulsion/engine/set-running",
  starter: "propulsion/starter_cmd",
  cutoff: "propulsion/cutoff_cmd",
  seized: "propulsion/engine/seized",
  stalled: "propulsion/engine/stalled",
  totalFuel: "propulsion/total-fuel-lbs",
  qbar: "aero/qbar-psf",
  throttle: "fcs/throttle-cmd-norm",
  kcas: "velocities/vc-kts",
} as const;

export function discoverReadableProperties(
  reader: EngineReader, queries: readonly string[] = ENGINE_CATALOG_QUERIES,
): string[] {
  if (typeof reader.queryPropertyCatalog !== "function") return [];
  const names = new Set<string>();
  for (const query of queries) {
    let text: string;
    try { text = reader.queryPropertyCatalog(query); } catch { continue; }
    for (const line of text.split("\n")) {
      const match = /^(\S+)\s+\(([RW]+)\)\s*$/.exec(line.trim());
      // Write-only properties (JSBSim's global set-running, magneto_cmd) cannot be read back.
      if (match && match[1].startsWith(query) && match[2].includes("R")) names.add(match[1]);
    }
  }
  return [...names].sort();
}

/** One reading. `null` means the model does not publish that value, never zero. */
export interface EngineSample {
  simTimeS: number | null;
  n1Pct: number | null;
  n2Pct: number | null;
  rpm: number | null;
  thrustLbf: number | null;
  fuelFlowPps: number | null;
  fuelFlowGph: number | null;
  running: boolean | null;
  starter: boolean | null;
  cutoff: boolean | null;
  seized: boolean | null;
  stalled: boolean | null;
  totalFuelLbs: number | null;
  qbarPsf: number | null;
  throttleNorm: number | null;
  kcas: number | null;
}

export function readEngineSample(reader: EngineReader, available: ReadonlySet<string>): EngineSample {
  const number = (path: string): number | null => {
    if (!available.has(path)) return null;
    const value = reader.getPropertyValue(path);
    return Number.isFinite(value) ? value : null;
  };
  const flag = (path: string): boolean | null => {
    const value = number(path);
    return value === null ? null : value > 0.5;
  };
  return {
    simTimeS: number(ENGINE_PATHS.simTime),
    n1Pct: number(ENGINE_PATHS.n1),
    n2Pct: number(ENGINE_PATHS.n2),
    rpm: number(ENGINE_PATHS.rpm),
    thrustLbf: number(ENGINE_PATHS.thrust),
    fuelFlowPps: number(ENGINE_PATHS.fuelFlowPps),
    fuelFlowGph: number(ENGINE_PATHS.fuelFlowGph),
    running: flag(ENGINE_PATHS.running),
    starter: flag(ENGINE_PATHS.starter),
    cutoff: flag(ENGINE_PATHS.cutoff),
    seized: flag(ENGINE_PATHS.seized),
    stalled: flag(ENGINE_PATHS.stalled),
    totalFuelLbs: number(ENGINE_PATHS.totalFuel),
    qbarPsf: number(ENGINE_PATHS.qbar),
    throttleNorm: number(ENGINE_PATHS.throttle),
    kcas: number(ENGINE_PATHS.kcas),
  };
}

export type EnginePhase =
  | "running" | "starting" | "motoring" | "windmilling" | "off" | "starved" | "stalled" | "seized"
  | "turning" | "unknown";

export const ENGINE_PHASE_LABELS: Record<EnginePhase, string> = {
  running: "RUNNING",
  starting: "STARTING",
  motoring: "MOTORING",
  windmilling: "WINDMILLING",
  off: "OFF",
  starved: "STARVED",
  stalled: "STALLED",
  seized: "SEIZED",
  turning: "TURNING",
  unknown: "UNKNOWN",
};

export interface EnginePhaseReading {
  phase: EnginePhase;
  label: string;
  detail: string;
  /** True when the phase is inferred from JSBSim's rules rather than read from a property. */
  derived: boolean;
}

export function deriveEnginePhase(sample: EngineSample): EnginePhaseReading {
  const reading = (phase: EnginePhase, detail: string, derived = true): EnginePhaseReading =>
    ({ phase, label: ENGINE_PHASE_LABELS[phase], detail, derived });
  const turbine = sample.n1Pct !== null || sample.n2Pct !== null;

  if (!turbine) {
    if (sample.running === null && sample.rpm === null) {
      return reading("unknown", "This model publishes neither a running flag nor a shaft speed.", false);
    }
    if (sample.running) return reading("running", "JSBSim reports the engine running.", false);
    if (sample.rpm !== null && sample.rpm > 50) {
      return reading("turning", "Not running, but the crankshaft is turning (starter or a windmilling propeller).", false);
    }
    return reading("off", "Not running and not turning.", false);
  }

  // Same precedence as FGTurbine::Calculate: seize, then stall, then starvation override everything.
  if (sample.seized) {
    return reading("seized", "JSBSim's seized flag is set: N2 is held at 0 and N1 follows airspeed toward qbar/20.");
  }
  if (sample.stalled) {
    return reading("stalled",
      "JSBSim's stall flag is set: fuel at idle flow, spools decaying toward airspeed. It clears with the throttle at idle.");
  }
  if (sample.totalFuelLbs !== null && sample.totalFuelLbs <= 0) {
    return reading("starved", "No fuel on board. JSBSim forces a starved engine off.");
  }
  if (sample.running) return reading("running", "JSBSim reports the engine running (set-running = 1).");

  const n1 = sample.n1Pct ?? 0;
  const n2 = sample.n2Pct ?? 0;
  const burning = sample.fuelFlowPps !== null && sample.fuelFlowPps > BURNING_FUEL_PPS;
  if (burning && !sample.cutoff) {
    return reading("starting",
      "Fuel is burning but JSBSim has not set running yet. It does when N2 reaches idle.");
  }
  if (sample.cutoff && sample.starter) {
    return reading("motoring",
      "The starter is turning the core with fuel cut off. Releasing cutoff lights it once N2 is above 15%.");
  }

  // FGTurbine::Calculate enters its start phase when cutoff is off, N2 > 15 %
  // and either the starter or ram air (qbar > 30 psf) is turning the core.
  const qbar = sample.qbarPsf;
  const relight = sample.cutoff
    ? "Fuel is cut off (cutoff_cmd = 1), so it will not relight."
    : n2 <= 15
      ? "N2 is below the 15% a start needs."
      : !sample.starter && (qbar ?? 0) <= 30
        ? "Neither the starter nor enough ram air (qbar > 30 psf) is turning it for a start."
        : "The relight conditions are met, so JSBSim should enter its start phase on the next step.";
  if (n1 > 1 || n2 > 1) {
    const targets = qbar === null ? ""
      : ` Spools settle toward airspeed: N1 → qbar/10 ≈ ${(qbar / 10).toFixed(1)}%, N2 → qbar/15 ≈ ${(qbar / 15).toFixed(1)}%.`;
    return reading("windmilling", `Engine off.${targets} ${relight}`);
  }
  return reading("off", `Engine off and not turning. ${relight}`);
}

/** The discrete state the transition log watches. Numbers are left out; they change every step. */
export function discreteEngineState(sample: EngineSample, phase: EnginePhaseReading): Record<string, string> {
  const state: Record<string, string> = { phase: phase.label };
  const flag = (key: string, value: boolean | null): void => { if (value !== null) state[key] = value ? "1" : "0"; };
  flag("running", sample.running);
  flag("starter", sample.starter);
  flag("cutoff", sample.cutoff);
  flag("seized", sample.seized);
  flag("stalled", sample.stalled);
  if (sample.fuelFlowPps !== null) state["fuel burning"] = sample.fuelFlowPps > BURNING_FUEL_PPS ? "yes" : "no";
  if (sample.totalFuelLbs !== null) state["fuel on board"] = sample.totalFuelLbs > 0 ? "yes" : "no";
  return state;
}

export interface EngineTransition {
  simTimeS: number | null;
  text: string;
}

export interface TransitionLog {
  /** Returns true when something was logged. Keys a call leaves out keep their last value. */
  observe(simTimeS: number | null, state: Readonly<Record<string, string>>): boolean;
  /** Newest first. */
  entries(): readonly EngineTransition[];
  clear(): void;
}

export function createTransitionLog(capacity = 60): TransitionLog {
  const last = new Map<string, string>();
  const log: EngineTransition[] = [];
  let lastSimTime: number | null = null;
  const push = (simTimeS: number | null, text: string): void => {
    log.push({ simTimeS, text });
    if (log.length > capacity) log.shift();
  };
  return {
    observe(simTimeS, state) {
      let logged = false;
      if (simTimeS !== null) {
        if (lastSimTime !== null && simTimeS < lastSimTime - 1e-6) {
          push(simTimeS, `sim time rewound from ${lastSimTime.toFixed(2)} s`);
          logged = true;
        }
        lastSimTime = simTimeS;
      }
      for (const [key, value] of Object.entries(state)) {
        const previous = last.get(key);
        if (previous !== undefined && previous !== value) {
          push(simTimeS, `${key}: ${previous} → ${value}`);
          logged = true;
        }
        last.set(key, value);
      }
      return logged;
    },
    entries: () => [...log].reverse(),
    clear() { log.length = 0; },
  };
}

/** Generic formatting for the full property list: enough digits for small values, none wasted on large ones. */
export function formatValue(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  if (Number.isInteger(value) && Math.abs(value) < 1e6) return String(value);
  const magnitude = Math.abs(value);
  return value.toFixed(magnitude >= 1000 ? 0 : magnitude >= 100 ? 1 : magnitude >= 1 ? 2 : 4);
}

export interface EngineRow {
  label: string;
  path: string;
  unit?: string;
  /** Multiplier applied before display, e.g. lbm/s to lb/h. */
  scale?: number;
  digits?: number;
  flag?: boolean;
}

export function formatRowValue(row: EngineRow, value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  if (row.flag) return value > 0.5 ? "on" : "off";
  const text = (value * (row.scale ?? 1)).toFixed(row.digits ?? 2);
  return row.unit ? `${text} ${row.unit}` : text;
}

/** Curated sections. A row appears only when the loaded model publishes its property. */
export const ENGINE_SECTIONS: readonly { id: string; title: string; rows: readonly EngineRow[] }[] = [
  {
    id: "spools", title: "Spools and thrust", rows: [
      { label: "N1", path: "propulsion/engine/n1", unit: "%", digits: 1 },
      { label: "N2", path: "propulsion/engine/n2", unit: "%", digits: 1 },
      { label: "Engine RPM", path: "propulsion/engine/engine-rpm", unit: "rpm", digits: 0 },
      { label: "Propeller RPM", path: "propulsion/engine/propeller-rpm", unit: "rpm", digits: 0 },
      { label: "Thrust", path: "propulsion/engine/thrust-lbs", unit: "lbf", digits: 0 },
      { label: "Power", path: "propulsion/engine/power-hp", unit: "hp", digits: 0 },
      { label: "Manifold pressure", path: "propulsion/engine/map-inhg", unit: "inHg", digits: 1 },
      { label: "Max N1", path: "propulsion/engine/MaxN1", unit: "%", digits: 1 },
      { label: "Max N2", path: "propulsion/engine/MaxN2", unit: "%", digits: 1 },
      { label: "TSFC", path: "propulsion/engine/tsfc", unit: "lb/(lbf·h)", digits: 3 },
      { label: "Bleed factor", path: "propulsion/engine/bleed-factor", digits: 2 },
      { label: "Water injection", path: "propulsion/engine/injection_cmd", flag: true },
    ],
  },
  {
    id: "temperatures", title: "Temperatures and oil", rows: [
      { label: "EGT", path: "propulsion/engine/egt-degF", unit: "°F", digits: 0 },
      { label: "CHT", path: "propulsion/engine/cht-degF", unit: "°F", digits: 0 },
      { label: "Oil temperature", path: "propulsion/engine/oil-temperature-degF", unit: "°F", digits: 0 },
      { label: "Oil pressure", path: "propulsion/engine/oil-pressure-psi", unit: "psi", digits: 0 },
      { label: "Air/fuel ratio", path: "propulsion/engine/AFR", digits: 1 },
      { label: "Total air temperature", path: "propulsion/tat-c", unit: "°C", digits: 1 },
    ],
  },
  {
    id: "fuel", title: "Fuel", rows: [
      { label: "Fuel flow", path: "propulsion/engine/fuel-flow-rate-pps", unit: "lb/h", scale: 3600, digits: 0 },
      { label: "Fuel flow (volume)", path: "propulsion/engine/fuel-flow-rate-gph", unit: "gph", digits: 1 },
      { label: "Fuel used", path: "propulsion/engine/fuel-used-lbs", unit: "lb", digits: 2 },
      { label: "Total fuel", path: "propulsion/total-fuel-lbs", unit: "lb", digits: 1 },
    ],
  },
  {
    id: "controls", title: "Commands and flags", rows: [
      { label: "Throttle command", path: "fcs/throttle-cmd-norm", unit: "%", scale: 100, digits: 0 },
      { label: "Throttle position", path: "fcs/throttle-pos-norm", unit: "%", scale: 100, digits: 0 },
      { label: "Mixture command", path: "fcs/mixture-cmd-norm", unit: "%", scale: 100, digits: 0 },
      { label: "Starter command", path: "propulsion/starter_cmd", flag: true },
      { label: "Cutoff command", path: "propulsion/cutoff_cmd", flag: true },
      { label: "Running flag", path: "propulsion/engine/set-running", flag: true },
      { label: "Starter (piston)", path: "propulsion/engine/starter-norm", digits: 2 },
      { label: "Seized", path: "propulsion/engine/seized", flag: true },
      { label: "Stalled", path: "propulsion/engine/stalled", flag: true },
    ],
  },
  {
    id: "air", title: "Air data", rows: [
      { label: "Calibrated airspeed", path: "velocities/vc-kts", unit: "kt", digits: 0 },
      { label: "Dynamic pressure", path: "aero/qbar-psf", unit: "psf", digits: 1 },
      { label: "Total pressure", path: "propulsion/pt-lbs_sqft", unit: "psf", digits: 0 },
    ],
  },
];

/** Per-tank rows from whatever tanks the catalog lists. */
export function tankRows(properties: readonly string[]): EngineRow[] {
  const rows: EngineRow[] = [];
  for (const path of properties) {
    const match = /^propulsion\/tank(?:\[(\d+)\])?\/(contents-lbs|pct-full)$/.exec(path);
    if (!match) continue;
    const tank = Number(match[1] ?? 0) + 1;
    rows.push(match[2] === "contents-lbs"
      ? { label: `Tank ${tank} contents`, path, unit: "lb", digits: 1 }
      : { label: `Tank ${tank} full`, path, unit: "%", digits: 1 });
  }
  return rows;
}
