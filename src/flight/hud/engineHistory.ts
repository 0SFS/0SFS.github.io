import { type EngineMonitorDefinition, type EngineReader, type EngineRow } from "./engineMonitorModel";
import { discoverEngineVariables } from "./engineVariables";

/** 0sfs owns native engine histories; these observations have no globe-only use. */
export interface EngineHistoryMetric extends EngineRow {
  engineIndex: number;
  title: string;
  unavailableReason?: string;
  staleProperties?: readonly string[];
}

/** Legacy recording-default view of the authoritative registry, with optional thermal accounting. */
export function discoverEngineHistoryMetrics(
  available: ReadonlySet<string>, definition?: EngineMonitorDefinition, includeThermalBalance = false,
): EngineHistoryMetric[] {
  return discoverEngineVariables(available, definition).filter(variable => variable.historyEligible
    && (variable.recordByDefault || includeThermalBalance && variable.thermalAccounting)
    && !variable.validityProperties?.some(path => !available.has(path)));
}

/** Reads use the monitor's per-update cache; absent/invalid measurements stay gaps. */
export function readEngineHistoryValues(reader: EngineReader, metrics: readonly EngineHistoryMetric[]): (number | null)[] {
  return metrics.map(metric => {
    if (metric.unavailableReason) return null;
    if (metric.staleProperties?.some(path => {
      const flag = reader.getPropertyValue(path);
      return Number.isFinite(flag) && flag > .5;
    })) return null;
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

export interface EngineHistoryFrame { time: number; values: readonly (number | null)[]; breakBefore?: boolean }
export interface EngineHistorySettings {
  seconds: number;
  hz: number;
  /** Fixes the column allocation; omission allows legacy callers to establish it from samples. */
  columns?: number;
}
export interface EngineHistory {
  observe(time: number | null, held: boolean, readValues: () => readonly (number | null)[]): boolean;
  configure(settings: EngineHistorySettings): void;
  frames(): readonly EngineHistoryFrame[];
  revision(): number;
  size(): number;
  /** Exact allocated numeric payload. DOM and temporary frame/export objects are separate. */
  allocatedBytes(): number;
  /** Marks capture interruption without fabricating or discarding the next genuine sample. */
  breakBeforeNextSample(): void;
  clear(): void;
}

/** A bounded ring; capture is an upper rate limit, with no fabricated catch-up samples. */
export function createEngineHistory(initial: EngineHistorySettings): EngineHistory {
  let settings = initial;
  let capacity = 0;
  let columns = initial.columns ?? 0;
  let times = new Float64Array(0);
  let values = new Float64Array(0);
  let breaks = new Uint8Array(0);
  let start = 0;
  let count = 0;
  let version = 0;
  let lastSeen: number | null = null;
  let lastCaptured: number | null = null;
  let pendingBreak = false;
  const frames = (): EngineHistoryFrame[] => Array.from({ length: count }, (_, i) => {
    const at = (start + i) % capacity;
    return { time: times[at], values: Array.from(values.subarray(at * columns, (at + 1) * columns), value => Number.isFinite(value) ? value : null),
      ...(breaks[at] ? { breakBefore: true } : {}) };
  });
  const allocate = (nextCapacity: number, nextColumns: number, retained: readonly EngineHistoryFrame[]): void => {
    capacity = nextCapacity; columns = nextColumns;
    times = new Float64Array(capacity);
    values = new Float64Array(capacity * columns);
    breaks = new Uint8Array(capacity);
    values.fill(Number.NaN);
    start = count = 0;
    for (const frame of retained.slice(-capacity)) {
      times[count] = frame.time;
      breaks[count] = frame.breakBefore ? 1 : 0;
      for (let column = 0; column < columns; column++) values[count * columns + column] = frame.values[column] ?? Number.NaN;
      count++;
    }
  };
  const prune = (time: number): void => {
    while (count && times[start] < time - settings.seconds) {
      start = (start + 1) % capacity;
      count--; version++;
    }
  };
  const clear = (): void => {
    if (count) { values.fill(Number.NaN); start = count = 0; version++; }
    lastCaptured = lastSeen; // A clear during pause stays clear until native time advances.
    pendingBreak = false;
  };
  const configure = (next: EngineHistorySettings): void => {
    if (!Number.isFinite(next.seconds) || next.seconds <= 0 || !Number.isFinite(next.hz) || next.hz < 0
      || next.columns !== undefined && (!Number.isInteger(next.columns) || next.columns < 1)) {
      throw new Error("Engine history requires positive seconds and nonnegative Hz");
    }
    const retained = frames();
    settings = { ...next };
    // Turning capture off preserves the bounded allocation and recorded data.
    allocate(next.hz > 0 ? Math.max(1, Math.ceil(next.seconds * next.hz) + 1) : capacity || 1,
      next.columns ?? columns, retained);
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
      const observation = readValues();
      if (observation.length > columns) {
        if (settings.columns !== undefined) throw new Error("Engine history sample exceeds its allocated column count");
        allocate(capacity, observation.length, frames());
      }
      const at = count === capacity ? start : (start + count++) % capacity;
      times[at] = time;
      breaks[at] = pendingBreak ? 1 : 0;
      pendingBreak = false;
      for (let column = 0; column < columns; column++) {
        const value = observation[column];
        values[at * columns + column] = typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
      }
      if (count === capacity && at === start) start = (start + 1) % capacity;
      lastCaptured = time;
      version++;
      return true;
    },
    configure, frames, revision: () => version, size: () => count,
    allocatedBytes: () => times.byteLength + values.byteLength + breaks.byteLength,
    breakBeforeNextSample: () => { pendingBreak = true; }, clear,
  };
}

export interface EngineHistoryPlot {
  path: string;
  minimum: number | null;
  maximum: number | null;
  latest: number | null;
  firstTime: number | null;
  lastTime: number | null;
  axisMinimum: number | null;
  axisMaximum: number | null;
}

/** Fixed SVG coordinates are presentation; vertices are bounded by user-selected history. */
export function engineHistoryPlot(
  frames: readonly EngineHistoryFrame[], index: number, flag = false, axis?: readonly [number, number],
): EngineHistoryPlot {
  let minimum: number | null = null;
  let maximum: number | null = null;
  for (const frame of frames) {
    const value = frame.values[index];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    minimum = minimum === null ? value : Math.min(minimum, value);
    maximum = maximum === null ? value : Math.max(maximum, value);
  }
  const firstTime = frames[0]?.time ?? null;
  const lastTime = frames.at(-1)?.time ?? null;
  const lastValue = frames.at(-1)?.values[index];
  const latest = typeof lastValue === "number" && Number.isFinite(lastValue) ? lastValue : null;
  const suppliedAxis = axis && axis.every(Number.isFinite) && axis[1] > axis[0] ? axis : undefined;
  const low = suppliedAxis?.[0] ?? (flag ? 0 : minimum);
  const high = suppliedAxis?.[1] ?? (flag ? 1 : maximum);
  if (minimum === null || maximum === null || low === null || high === null) return {
    path: "", minimum, maximum, latest, firstTime, lastTime, axisMinimum: low, axisMaximum: high,
  };
  const range = high - low;
  const duration = lastTime! - firstTime!;
  let path = "";
  let previousY: number | null = null;
  for (const frame of frames) {
    if (frame.breakBefore) previousY = null;
    const value = frame.values[index];
    if (value === null || value === undefined || !Number.isFinite(value)) { previousY = null; continue; }
    const x = duration > 0 ? (frame.time - firstTime!) / duration * 300 : 150;
    const y = range > 0 ? 60 - (value - low) / range * 56 : 32;
    path += previousY === null ? `M${x.toFixed(2)},${y.toFixed(2)}`
      : flag ? `H${x.toFixed(2)}V${y.toFixed(2)}` : `L${x.toFixed(2)},${y.toFixed(2)}`;
    previousY = y;
  }
  return { path, minimum, maximum, latest, firstTime, lastTime, axisMinimum: low, axisMaximum: high };
}

export function engineHistoryCsv(metrics: readonly EngineHistoryMetric[], frames: readonly EngineHistoryFrame[]): string {
  const quote = (text: string): string => `"${text.replaceAll('"', '""')}"`;
  const hasBreaks = frames.some(frame => frame.breakBefore);
  return [
    [quote("Simulation time (s)"), ...metrics.map(metric => quote(`${metric.title}${metric.unit ? ` (${metric.unit})` : ""}`)),
      ...(hasBreaks ? [quote("Capture interruption before sample")] : [])].join(","),
    ...frames.map(frame => [frame.time, ...frame.values.map(value => typeof value === "number" && Number.isFinite(value) ? value : ""),
      ...(hasBreaks ? [frame.breakBefore ? 1 : 0] : [])].join(",")),
  ].join("\r\n") + "\r\n";
}
