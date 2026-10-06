import { ENGINE_SECTIONS, enginePropertyApplies, discoverThermalBalanceRows, type EngineMonitorDefinition, type EngineReader, type EngineRow } from "./engineMonitorModel";

/** 0sfs owns native engine histories; these observations have no globe-only use. */
export interface EngineHistoryMetric extends EngineRow {
  engineIndex: number;
  title: string;
}

const HISTORY_PATHS = new Set([
  "propulsion/engine/n1", "propulsion/engine/n2", "propulsion/engine/engine-rpm",
  "propulsion/engine/thrust-lbs", "propulsion/engine/fuel-flow-rate-pps",
  "propulsion/engine/fuel-flow-rate-gph", "propulsion/engine/egt-degc",
  "propulsion/engine/egt-degF", "propulsion/engine/cht-degF",
  "propulsion/engine/thermal/nozzle-gas-temperature-k", "propulsion/engine/thermal/metal-temperature-k",
  "propulsion/engine/thermal/core/metal-temperature-k",
]);
const HISTORY_ROWS: readonly EngineRow[] = [
  ...ENGINE_SECTIONS.flatMap(section => section.rows).filter(row => HISTORY_PATHS.has(row.path)),
  { label: "Nozzle opening", path: "propulsion/engine/nozzle-pos-norm", unit: "%", scale: 100, digits: 1 },
  { label: "Afterburner", path: "propulsion/engine/augmentation", flag: true,
    description: "Actual native augmentation state, independently of the throttle command." },
  { label: "Running", path: "propulsion/engine/set-running", flag: true },
  { label: "Burned afterburner fuel", path: "propulsion/engine/thermal/afterburner-burned-fuel-flow-kg-sec", unit: "kg/s", digits: 4,
    validityProperties: ["propulsion/engine/thermal/valid"] },
];

/** Only published metrics and their published validity flags are admitted. */
export function discoverEngineHistoryMetrics(
  available: ReadonlySet<string>, definition?: EngineMonitorDefinition, includeThermalBalance = false,
): EngineHistoryMetric[] {
  const indices = new Set<number>();
  for (const path of available) {
    const match = /^propulsion\/engine(?:\[(\d+)\])?\//.exec(path);
    if (match) indices.add(Number(match[1] ?? 0));
  }
  const metrics: EngineHistoryMetric[] = [];
  for (const index of [...indices].sort((a, b) => a - b)) {
    const prefix = index === 0 ? "propulsion/engine" : `propulsion/engine[${index}]`;
    const indexed = (path: string): string => path.replace("propulsion/engine", prefix);
    for (const row of HISTORY_ROWS) {
      const path = indexed(row.path);
      const validityProperties = row.validityProperties?.map(indexed);
      if (!available.has(path) || !enginePropertyApplies(row.path, definition)
        || validityProperties?.some(flag => !available.has(flag))) continue;
      metrics.push({ ...row, path, validityProperties, engineIndex: index,
        title: `Engine ${index + 1} · ${row.label}` });
    }
    const throttlePath = index === 0 ? "fcs/throttle-cmd-norm" : `fcs/throttle-cmd-norm[${index}]`;
    if (available.has(throttlePath)) metrics.push({
      engineIndex: index, label: "Throttle command", title: `Engine ${index + 1} · Throttle command`,
      path: throttlePath, unit: "%", scale: 100, digits: 1,
    });
  }
  if (includeThermalBalance) for (const row of discoverThermalBalanceRows(available, definition)) {
    if (row.validityProperties?.some(path => !available.has(path))) continue;
    metrics.push({ ...row, title: `Engine ${row.engineIndex + 1} · ${row.label}` });
  }
  return metrics;
}

/** Reads use the monitor's per-update cache; absent/invalid measurements stay gaps. */
export function readEngineHistoryValues(reader: EngineReader, metrics: readonly EngineHistoryMetric[]): (number | null)[] {
  return metrics.map(metric => {
    if (metric.validityProperties?.some(path => {
      const flag = reader.getPropertyValue(path);
      return !Number.isFinite(flag) || flag <= .5;
    })) return null;
    const native = reader.getPropertyValue(metric.path);
    if (!Number.isFinite(native)) return null;
    const value = metric.flag ? (native > .5 ? 1 : 0) : native * (metric.scale ?? 1) + (metric.offset ?? 0);
    return Number.isFinite(value) ? value : null;
  });
}

export interface EngineHistoryFrame { time: number; values: readonly (number | null)[] }
export interface EngineHistorySettings { seconds: number; hz: number }
export interface EngineHistory {
  observe(time: number | null, held: boolean, readValues: () => readonly (number | null)[]): boolean;
  configure(settings: EngineHistorySettings): void;
  frames(): readonly EngineHistoryFrame[];
  revision(): number;
  clear(): void;
}

/** A bounded ring; capture is an upper rate limit, with no fabricated catch-up samples. */
export function createEngineHistory(initial: EngineHistorySettings): EngineHistory {
  let settings = initial;
  let capacity = 0;
  let ring: (EngineHistoryFrame | undefined)[] = [];
  let start = 0;
  let count = 0;
  let version = 0;
  let lastSeen: number | null = null;
  let lastCaptured: number | null = null;
  const frames = (): EngineHistoryFrame[] => Array.from({ length: count }, (_, i) => ring[(start + i) % capacity]!);
  const prune = (time: number): void => {
    while (count && ring[start]!.time < time - settings.seconds) {
      ring[start] = undefined;
      start = (start + 1) % capacity;
      count--; version++;
    }
  };
  const clear = (): void => {
    if (count) { ring.fill(undefined); start = count = 0; version++; }
    lastCaptured = lastSeen; // A clear during pause stays clear until native time advances.
  };
  const configure = (next: EngineHistorySettings): void => {
    if (!Number.isFinite(next.seconds) || next.seconds <= 0 || !Number.isFinite(next.hz) || next.hz < 0) {
      throw new Error("Engine history requires positive seconds and nonnegative Hz");
    }
    const retained = next.hz > 0 ? frames() : [];
    settings = { ...next };
    capacity = Math.max(1, Math.ceil(next.seconds * next.hz) + 1);
    ring = new Array(capacity);
    start = count = 0;
    for (const frame of retained.slice(-capacity)) ring[count++] = frame;
    if (lastSeen !== null) prune(lastSeen);
    version++;
  };
  configure(initial);
  return {
    observe(time, held, readValues) {
      if (time === null || !Number.isFinite(time)) return false;
      if (lastSeen !== null && time < lastSeen) { clear(); lastCaptured = null; }
      lastSeen = time;
      if (held || settings.hz === 0) return false;
      prune(time);
      if (lastCaptured !== null && (time <= lastCaptured || time - lastCaptured + 1e-9 < 1 / settings.hz)) return false;
      const frame = { time, values: [...readValues()] };
      if (count === capacity) { ring[start] = frame; start = (start + 1) % capacity; }
      else ring[(start + count++) % capacity] = frame;
      lastCaptured = time;
      version++;
      return true;
    },
    configure, frames, revision: () => version, clear,
  };
}

export interface EngineHistoryPlot {
  path: string;
  minimum: number | null;
  maximum: number | null;
  latest: number | null;
  firstTime: number | null;
  lastTime: number | null;
}

/** Fixed SVG coordinates are presentation; vertices are bounded by user-selected history. */
export function engineHistoryPlot(frames: readonly EngineHistoryFrame[], index: number, flag = false): EngineHistoryPlot {
  const values = frames.map(frame => frame.values[index]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const minimum = values.length ? Math.min(...values) : null;
  const maximum = values.length ? Math.max(...values) : null;
  const firstTime = frames[0]?.time ?? null;
  const lastTime = frames.at(-1)?.time ?? null;
  const latest = frames.at(-1)?.values[index] ?? null;
  if (minimum === null || maximum === null) return { path: "", minimum, maximum, latest, firstTime, lastTime };
  const low = flag ? 0 : minimum;
  const high = flag ? 1 : maximum;
  const range = high - low;
  const duration = lastTime! - firstTime!;
  let path = "";
  let previousY: number | null = null;
  for (const frame of frames) {
    const value = frame.values[index];
    if (value === null || value === undefined || !Number.isFinite(value)) { previousY = null; continue; }
    const x = duration > 0 ? (frame.time - firstTime!) / duration * 300 : 150;
    const y = range > 0 ? 60 - (value - low) / range * 56 : 32;
    path += previousY === null ? `M${x.toFixed(2)},${y.toFixed(2)}`
      : flag ? `H${x.toFixed(2)}V${y.toFixed(2)}` : `L${x.toFixed(2)},${y.toFixed(2)}`;
    previousY = y;
  }
  return { path, minimum, maximum, latest, firstTime, lastTime };
}

export function engineHistoryCsv(metrics: readonly EngineHistoryMetric[], frames: readonly EngineHistoryFrame[]): string {
  const quote = (text: string): string => `"${text.replaceAll('"', '""')}"`;
  return [
    [quote("Simulation time (s)"), ...metrics.map(metric => quote(`${metric.title}${metric.unit ? ` (${metric.unit})` : ""}`))].join(","),
    ...frames.map(frame => [frame.time, ...frame.values.map(value => value ?? "")].join(",")),
  ].join("\r\n") + "\r\n";
}
