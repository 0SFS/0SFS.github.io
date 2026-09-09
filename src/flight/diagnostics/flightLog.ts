/**
 * A small in-memory event log for things the simulator does on its own —
 * faults, pauses, recoveries, asset loads.
 *
 * The simulator pauses itself when the physics loop faults. Without a record of
 * why, that is indistinguishable from the pause button not working, so every
 * automatic state change should leave an entry here with the numbers that
 * caused it.
 */

export type FlightLogLevel = "info" | "warn" | "error";

export interface FlightLogEntry {
  id: number;
  /** Milliseconds since the log was created. */
  atMs: number;
  level: FlightLogLevel;
  source: string;
  message: string;
  detail?: Record<string, unknown>;
}

export interface FlightLog {
  push(level: FlightLogLevel, source: string, message: string, detail?: Record<string, unknown>): void;
  info(source: string, message: string, detail?: Record<string, unknown>): void;
  warn(source: string, message: string, detail?: Record<string, unknown>): void;
  error(source: string, message: string, detail?: Record<string, unknown>): void;
  /** Newest first. */
  entries(): readonly FlightLogEntry[];
  subscribe(listener: (entries: readonly FlightLogEntry[]) => void): () => void;
  clear(): void;
}

export interface FlightLogOptions {
  capacity?: number;
  /** Mirror to the browser console so entries survive a reload. */
  console?: Pick<Console, "log" | "warn" | "error"> | null;
  now?(): number;
}

const CONSOLE_METHOD: Record<FlightLogLevel, "log" | "warn" | "error"> = {
  info: "log", warn: "warn", error: "error",
};

export function createFlightLog(options: FlightLogOptions = {}): FlightLog {
  const capacity = options.capacity ?? 200;
  const sink = options.console === undefined ? globalThis.console : options.console;
  const start = (options.now ?? (() => Date.now()))();
  const now = options.now ?? (() => Date.now());

  let entries: FlightLogEntry[] = [];
  let nextId = 1;
  const listeners = new Set<(entries: readonly FlightLogEntry[]) => void>();

  const push = (
    level: FlightLogLevel,
    source: string,
    message: string,
    detail?: Record<string, unknown>,
  ): void => {
    const entry: FlightLogEntry = {
      id: nextId++, atMs: now() - start, level, source, message,
      ...(detail ? { detail } : {}),
    };
    entries = [entry, ...entries].slice(0, capacity);
    if (sink) {
      const args: unknown[] = [`[${source}] ${message}`];
      if (detail) args.push(detail);
      sink[CONSOLE_METHOD[level]](...args);
    }
    for (const listener of listeners) listener(entries);
  };

  return {
    push,
    info: (source, message, detail) => push("info", source, message, detail),
    warn: (source, message, detail) => push("warn", source, message, detail),
    error: (source, message, detail) => push("error", source, message, detail),
    entries: () => entries,
    subscribe(listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    clear(): void {
      entries = [];
      for (const listener of listeners) listener(entries);
    },
  };
}

/**
 * Shared log. Physics runs deep inside the fixed-step loop, and threading a
 * logger through every call site would obscure more than it documents.
 */
export const flightLog: FlightLog = createFlightLog();
