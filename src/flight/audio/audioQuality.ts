import type { AudioQualityId } from "./audioSettings";

/**
 * Tier caps, admission rules, the shedding controller and the status line.
 *
 * The load-bearing idea here is that *unmeasured is not passing and not
 * failing*. sound.md §1 says an untested profile is "unverified", never a
 * fabricated performance failure, and §5 says a missing dropout count is
 * "unknown", never zero. Every type below keeps those three states apart.
 */

export type TierId = "off" | "low" | "med" | "high";

export const TIER_ORDER: readonly TierId[] = ["off", "low", "med", "high"];
export const TIER_INDEX: Record<TierId, number> = { off: 0, low: 1, med: 2, high: 3 };

/** The sound.md §1 envelope table. These are proposed budgets, not measurements. */
export interface TierBudget {
  oscillators: number;
  noiseSources: number;
  biquads: number;
  grains: number;
  irMilliseconds: number;
  coldBytes: number;
  residentMiB: number;
  loadingPeakMiB: number;
  /** p95 per 128 frames. */
  quantumP95Ms: number;
}

export const TIER_BUDGETS: Record<TierId, TierBudget> = {
  off: { oscillators: 0, noiseSources: 0, biquads: 0, grains: 0, irMilliseconds: 0,
    coldBytes: 0, residentMiB: 0, loadingPeakMiB: 0, quantumP95Ms: 0 },
  low: { oscillators: 5, noiseSources: 5, biquads: 8, grains: 0, irMilliseconds: 0,
    coldBytes: 160 * 1024, residentMiB: 8, loadingPeakMiB: 12, quantumP95Ms: 0.12 },
  med: { oscillators: 13, noiseSources: 6, biquads: 16, grains: 0, irMilliseconds: 20,
    coldBytes: 256 * 1024, residentMiB: 12, loadingPeakMiB: 20, quantumP95Ms: 0.25 },
  high: { oscillators: 13, noiseSources: 6, biquads: 16, grains: 12, irMilliseconds: 40,
    coldBytes: 1792 * 1024, residentMiB: 32, loadingPeakMiB: 64, quantumP95Ms: 0.45 },
};

/** `Q = 1000 * frames / sampleRate`; read the real block length, never assume 128. */
export function quantumMilliseconds(sampleRate: number, frames = 128): number {
  return sampleRate > 0 ? (1000 * frames) / sampleRate : Number.NaN;
}

export type TierAvailability =
  | { state: "available" }
  /** A concrete missing capability or a failed qualification run. */
  | { state: "unsupported"; reason: string }
  /** No device evidence exists yet. Not a failure. */
  | { state: "unvalidated"; reason: string }
  /** The licensed asset pack is absent. */
  | { state: "pack-unavailable"; reason: string };

export const AVAILABILITY_LABELS = {
  unsupported: "Unsupported on this device",
  unvalidated: "Not yet validated",
  "pack-unavailable": "Audio pack unavailable",
  locked: "Enable sound",
} as const;

/**
 * A device/browser/route/rate/transport combination that has actually passed
 * the §5 protocol.
 *
 * DELIBERATELY EMPTY. sound.md §5 requires named devices, recorded OS/browser
 * builds, a real output route and a validated dropout detector before any entry
 * here. None of that has been run, so Med and High report "Not yet validated"
 * rather than silently admitting themselves. Perf owns filling this in; a
 * user-agent string must never produce an entry.
 */
export interface QualifiedProfile {
  device: string;
  browserBuild: string;
  osBuild: string;
  outputRoute: string;
  sampleRateHz: number;
  transport: "port" | "sab";
  tier: TierId;
  evidence: string;
}

export const QUALIFIED_PROFILES: readonly QualifiedProfile[] = [];

export interface AudioCapabilities {
  audioWorklet: boolean;
  webAssembly: boolean;
  /** True only when the licensed Tier 3 bank is present and decoded. */
  bankReady: boolean;
  /** False when no portable per-block timing or underrun counter exists. */
  loadObservable: boolean;
}

/**
 * Admission. Low needs only the two hard capabilities; Med and High also need a
 * qualified profile, and in High's case a cleared bank as well.
 */
export function tierAvailability(
  tier: TierId, capabilities: AudioCapabilities,
  profiles: readonly QualifiedProfile[] = QUALIFIED_PROFILES,
): TierAvailability {
  if (tier === "off") return { state: "available" };
  if (!capabilities.audioWorklet) {
    return { state: "unsupported", reason: "This browser has no AudioWorklet." };
  }
  if (!capabilities.webAssembly) {
    return { state: "unsupported", reason: "This browser cannot run WebAssembly." };
  }
  if (tier === "low") return { state: "available" };
  if (tier === "high" && !capabilities.bankReady) {
    return {
      state: "pack-unavailable",
      reason: "High needs a licensed FJ33 sample bank. None is cleared for redistribution yet.",
    };
  }
  const qualified = profiles.some((profile) => profile.tier === tier);
  if (!qualified) {
    return {
      state: "unvalidated",
      reason: `${tier === "med" ? "Med" : "High"} has no device qualification evidence yet, `
        + "so it stays off by default. Low is unaffected.",
    };
  }
  return { state: "available" };
}

export interface TierResolveOptions {
  /**
   * Session-only testing override: run an explicitly requested tier that has no
   * device evidence yet. Qualification itself needs this, since a tier cannot be
   * measured without running it. Auto never uses it, and a missing bank or a
   * missing capability still blocks.
   */
  allowUnvalidated?: boolean;
}

/** Auto starts at Low and only climbs to a tier that is actually available. */
export function resolveRequestedTier(
  requested: AudioQualityId, capabilities: AudioCapabilities,
  profiles: readonly QualifiedProfile[] = QUALIFIED_PROFILES,
  options: TierResolveOptions = {},
): { tier: TierId; reason: string | null } {
  if (requested === "off") return { tier: "off", reason: null };
  if (requested === "auto") {
    let best: TierId = "off";
    for (const tier of TIER_ORDER) {
      if (tier === "off") continue;
      if (tierAvailability(tier, capabilities, profiles).state === "available") best = tier;
    }
    return {
      tier: best,
      reason: best === "off" ? "No audible tier is available on this device." : null,
    };
  }
  const availability = tierAvailability(requested, capabilities, profiles);
  if (availability.state === "available") return { tier: requested, reason: null };
  if (availability.state === "unvalidated" && options.allowUnvalidated) {
    return {
      tier: requested,
      reason: `${requested === "med" ? "Med" : "High"} is running without device evidence, for testing this session.`,
    };
  }
  // Fall back to the best tier below the request rather than to silence.
  for (let index = TIER_INDEX[requested] - 1; index >= 1; index -= 1) {
    const candidate = TIER_ORDER[index];
    if (tierAvailability(candidate, capabilities, profiles).state === "available") {
      return { tier: candidate, reason: availability.reason };
    }
  }
  return { tier: "off", reason: availability.reason };
}

/* --------------------------------------------------------------- fallback */

export interface LoadObservation {
  timeMs: number;
  /** Measured DSP time for one quantum, or null when unmeasurable here. */
  dspMs: number | null;
  /** Cumulative underruns from a real counter, or null when none exists. */
  underruns: number | null;
  /** A processor error or a comparable hard fault. */
  fault?: boolean;
}

export type FallbackAction =
  | { kind: "shed"; level: number; reason: string }
  | { kind: "drop"; tier: TierId; reason: string };

export interface FallbackController {
  /** Returns an action when this observation changes the running state. */
  observe(observation: LoadObservation): FallbackAction | null;
  /** Explicit pilot re-test; clears the lockout and the shed level. */
  retest(tier: TierId, timeMs: number): void;
  readonly tier: TierId;
  readonly shed: number;
  /** Milliseconds until an upgrade may be offered again, 0 when clear. */
  lockoutRemainingMs(timeMs: number): number;
  readonly lastP95Ms: number | null;
  readonly lastMaxMs: number | null;
  readonly observedUnderruns: number | null;
}

/** Highest shed stage before a tier drop; matches the ladder in core.cpp. */
const MAX_SHED = 6;
const WINDOW_MS = 2000;
const UPGRADE_LOCKOUT_MS = 60_000;

export interface FallbackOptions {
  tier: TierId;
  sampleRate: number;
  /** Overrides the tier's p95 budget; used by fixtures. */
  budgetMs?: number;
}

/**
 * sound.md §1's controller. Two consecutive over-budget 2-second windows shed
 * one stage; an observed deadline miss or an actual output underrun drops a
 * tier immediately and skips the incremental ladder. The upgrade lockout never
 * delays a downgrade — that ordering is the whole point of keeping them apart.
 */
export function createFallbackController(options: FallbackOptions): FallbackController {
  let tier = options.tier;
  let shed = 0;
  let windowStart: number | null = null;
  let samples: number[] = [];
  let consecutiveOver = 0;
  let lockoutUntil = 0;
  let baselineUnderruns: number | null = null;
  let observedUnderruns: number | null = null;
  let lastP95: number | null = null;
  let lastMax: number | null = null;

  const budget = () => options.budgetMs ?? TIER_BUDGETS[tier].quantumP95Ms;
  const quantum = quantumMilliseconds(options.sampleRate);

  const percentile = (values: number[], fraction: number): number => {
    const sorted = [...values].sort((a, b) => a - b);
    // Nearest-rank on the observations themselves; §5 forbids averaging
    // percentiles, and this is the raw distribution, not a summary of summaries.
    const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
    return sorted[rank];
  };

  const drop = (reason: string, timeMs: number): FallbackAction | null => {
    const index = TIER_INDEX[tier];
    if (index <= 0) return null;
    tier = TIER_ORDER[index - 1];
    shed = 0;
    consecutiveOver = 0;
    samples = [];
    windowStart = timeMs;
    lockoutUntil = timeMs + UPGRADE_LOCKOUT_MS;
    return { kind: "drop", tier, reason };
  };

  return {
    get tier() { return tier; },
    get shed() { return shed; },
    get lastP95Ms() { return lastP95; },
    get lastMaxMs() { return lastMax; },
    get observedUnderruns() { return observedUnderruns; },
    lockoutRemainingMs(timeMs) { return Math.max(0, lockoutUntil - timeMs); },
    retest(next, timeMs) {
      tier = next;
      shed = 0;
      consecutiveOver = 0;
      samples = [];
      windowStart = timeMs;
      lockoutUntil = 0;
      baselineUnderruns = null;
    },
    observe(observation) {
      const { timeMs } = observation;
      if (observation.fault) {
        lockoutUntil = timeMs + UPGRADE_LOCKOUT_MS;
        return drop("A processor fault was reported.", timeMs);
      }

      if (observation.underruns !== null) {
        if (baselineUnderruns === null) {
          baselineUnderruns = observation.underruns;
          // A real counter that has seen nothing new is a measured zero; only
          // the absence of a counter is "unknown".
          observedUnderruns ??= 0;
        }
        const delta = observation.underruns - baselineUnderruns;
        if (delta > 0) {
          observedUnderruns = (observedUnderruns ?? 0) + delta;
          baselineUnderruns = observation.underruns;
          // An actual underrun is evidence of a missed deadline, so it skips
          // the incremental ladder entirely.
          lockoutUntil = timeMs + UPGRADE_LOCKOUT_MS;
          return drop(`${delta} output underrun${delta === 1 ? " was" : "s were"} counted.`, timeMs);
        }
      }

      // Without per-block timing there is nothing to shed on. That is a known
      // observability gap (§1), not a reason to invent a measurement.
      if (observation.dspMs === null || !Number.isFinite(observation.dspMs)) return null;

      if (observation.dspMs > quantum) {
        lockoutUntil = timeMs + UPGRADE_LOCKOUT_MS;
        return drop(`A render took ${observation.dspMs.toFixed(2)} ms, past the `
          + `${quantum.toFixed(2)} ms quantum.`, timeMs);
      }

      windowStart ??= timeMs;
      samples.push(observation.dspMs);
      if (timeMs - windowStart < WINDOW_MS) return null;

      lastP95 = percentile(samples, 0.95);
      lastMax = Math.max(...samples);
      const over = lastP95 > budget();
      consecutiveOver = over ? consecutiveOver + 1 : 0;
      samples = [];
      windowStart = timeMs;
      if (consecutiveOver < 2) return null;

      consecutiveOver = 0;
      lockoutUntil = timeMs + UPGRADE_LOCKOUT_MS;
      if (shed >= MAX_SHED) {
        return drop(`p95 stayed above the ${budget().toFixed(2)} ms budget with detail already shed.`,
          timeMs);
      }
      shed += 1;
      return {
        kind: "shed", level: shed,
        reason: `p95 ${lastP95.toFixed(2)} ms exceeded the ${budget().toFixed(2)} ms budget twice.`,
      };
    },
  };
}

/* ---------------------------------------------------------------- status */

export interface AudioStatsLine {
  effective: TierId;
  requested: AudioQualityId;
  sampleRate: number;
  /** null renders as "n/a" — a measurement that does not exist, not a zero. */
  dspP95Ms: number | null;
  dspMaxMs: number | null;
  /** null renders as "unknown": no validated detector on this profile. */
  underruns: number | null;
  residentMiB: number | null;
  transport: "port" | "sab";
  reason: string;
}

const show = (value: number | null, digits: number): string =>
  value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(digits);

/** The exact 1 Hz format from sound.md §6. */
export function formatAudioStats(line: AudioStatsLine): string {
  const q = quantumMilliseconds(line.sampleRate);
  const percent = line.dspP95Ms === null || !Number.isFinite(q) || q <= 0
    ? "n/a" : ((line.dspP95Ms / q) * 100).toFixed(1);
  return `Audio: ${line.effective} (requested ${line.requested}) | `
    + `DSP p95 ${show(line.dspP95Ms, 2)}/${show(q, 3)} ms (${percent}%) | `
    + `max ${show(line.dspMaxMs, 2)} ms | `
    + `underruns ${line.underruns === null ? "unknown" : line.underruns} | `
    + `RAM ${show(line.residentMiB, 1)} | Fs ${Math.round(line.sampleRate)} | `
    + `bridge ${line.transport === "sab" ? "SAB" : "port"} | ${line.reason}`;
}
