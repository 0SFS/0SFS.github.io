import {
  chooseDeviceHintErrorTarget,
  GOOGLE_DETAIL_KEY,
  GOOGLE_ERROR_TARGET_BOUNDS,
  type DeviceHints,
  type GoogleDetailPolicy,
} from "foss-earth/mapDetailPolicy";
import type { MapDetailController, MapDetailRequirement } from "foss-earth/shell";

/**
 * World detail in flight: the shared detail controller owns the saved Google
 * range and the HUD rail. The flight keeps what only it needs: its minimum for
 * low spawns, the detail anchor and the session waiver, and a temporary
 * requirement that holds Google mesh finer while a low spawn is prepared.
 */

/** The pre-controller World detail target: a number of px, or "auto". Kept for rollback. */
export const LEGACY_WORLD_DETAIL_KEY = "osfs.world-detail-target";
export const FLIGHT_TERRAIN_REQUIREMENT_KEY = "osfs.flight-terrain-requirement";
/** Set once the legacy World detail has been written into the shared record. */
export const WORLD_DETAIL_IMPORT_KEY = "osfs.world-detail-import";
export const DEFAULT_FLIGHT_TERRAIN_REQUIREMENT = 4_096;

/** A low spawn prepares detail below this height above the ground, in metres. */
export const LOW_SPAWN_METERS = 100;
/** The requirement ends after this long at least LOW_SPAWN_METERS up, in simulated seconds. */
export const DEPARTURE_SECONDS = 1;

type ReadableStorage = Pick<Storage, "getItem" | "setItem">;

export function isErrorTarget(value: number): boolean {
  return Number.isFinite(value) && value >= GOOGLE_ERROR_TARGET_BOUNDS.finest && value <= GOOGLE_ERROR_TARGET_BOUNDS.coarsest;
}

function read(storage: ReadableStorage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function readFlightTerrainRequirement(storage: ReadableStorage | null): number {
  const stored = read(storage, FLIGHT_TERRAIN_REQUIREMENT_KEY);
  const value = Number(stored);
  return stored !== null && isErrorTarget(value) ? value : DEFAULT_FLIGHT_TERRAIN_REQUIREMENT;
}

export type LegacyImportResult = "imported" | "skipped" | "retry";

/**
 * Seeds the shared Google policy from the flight's old World detail keys, once.
 * The old target becomes the saved default, "auto" keeps the device-hint
 * recommendation, and the range spans the old target and the flight minimum,
 * as the old rail did. A valid new policy is never imported over. The legacy
 * keys stay for rollback; a write that fails leaves the import to retry.
 */
export function importLegacyWorldDetail(
  controller: MapDetailController,
  storage: ReadableStorage | null,
  context: { rendererMode: string; deviceHints: DeviceHints },
): LegacyImportResult {
  const markDone = (): boolean => {
    try {
      storage?.setItem(WORLD_DETAIL_IMPORT_KEY, "1");
      return storage !== null;
    } catch {
      return false;
    }
  };
  if (read(storage, WORLD_DETAIL_IMPORT_KEY) === "1") return "skipped";
  if (controller.hasSavedPolicy(GOOGLE_DETAIL_KEY)) {
    markDone();
    return "skipped";
  }
  const stored = read(storage, LEGACY_WORLD_DETAIL_KEY);
  const legacyTarget = stored !== null && stored !== "auto" && isErrorTarget(Number(stored)) ? Number(stored) : null;
  const requirement = readFlightTerrainRequirement(storage);
  const configured = legacyTarget ?? chooseDeviceHintErrorTarget(context.rendererMode, context.deviceHints);
  const policy: GoogleDetailPolicy = {
    kind: "google",
    finestErrorPx: Math.min(configured, requirement),
    coarsestErrorPx: Math.max(configured, requirement),
    defaultValue: legacyTarget ?? { mode: "recommended", policy: "device-hints" },
  };
  const result = controller.seedPolicy(GOOGLE_DETAIL_KEY, policy);
  if (result === "saved") return markDone() ? "imported" : "retry";
  if (result === "exists" || result === "forced") {
    markDone();
    return "skipped";
  }
  return "retry";
}

export interface PreparationLease {
  /** The preparation finished: this lease now stands for the prepared spawn. */
  complete(): void;
  /** The preparation failed or was cancelled: release this lease only. */
  cancel(): void;
}

export interface FlightDetailRequirements {
  /**
   * A preparation that needs Google mesh at `errorPx` or finer. The new lease
   * holds alongside any earlier one until it completes, so a relocation never
   * shows a coarse frame in between.
   */
  begin(errorPx: number): PreparationLease;
  /**
   * A preparation that needed no lease finished: the aircraft is somewhere
   * new, so an earlier spawn's lease ends.
   */
  supersede(): void;
  /** Editing Flight minimum updates held leases at once. */
  setRequirement(errorPx: number): void;
  /**
   * One flight tick. `aboveGroundMeters` must come from the current adopted
   * surface under the aircraft this tick; null for a missing, stale or
   * non-finite sample, which restarts the departure interval.
   */
  observe(tick: { deltaSeconds: number; paused: boolean; aboveGroundMeters: number | null }): void;
  /** The waiver or disposal: end every lease. */
  releaseAll(): void;
  isHeld(): boolean;
}

export function createFlightDetailRequirements(controller: MapDetailController): FlightDetailRequirements {
  let settled: MapDetailRequirement | null = null;
  const pending = new Set<MapDetailRequirement>();
  let clearSeconds = 0;

  const dropInactive = (): void => {
    if (settled && !settled.active) settled = null;
    for (const lease of pending) if (!lease.active) pending.delete(lease);
  };

  return {
    begin(errorPx) {
      const lease = controller.acquireRequirement(errorPx);
      pending.add(lease);
      let finished = false;
      return {
        complete() {
          if (finished) return;
          finished = true;
          pending.delete(lease);
          if (!lease.active) return;
          // Acquired before the old one is released: no coarse frame between them.
          if (settled && settled !== lease) settled.release();
          settled = lease;
          clearSeconds = 0;
        },
        cancel() {
          if (finished) return;
          finished = true;
          pending.delete(lease);
          lease.release();
        },
      };
    },
    supersede() {
      settled?.release();
      settled = null;
      clearSeconds = 0;
    },
    setRequirement(errorPx) {
      dropInactive();
      settled?.update(errorPx);
      for (const lease of pending) lease.update(errorPx);
    },
    observe({ deltaSeconds, paused, aboveGroundMeters }) {
      dropInactive();
      if (!settled) return;
      if (aboveGroundMeters === null || !Number.isFinite(aboveGroundMeters) || aboveGroundMeters < LOW_SPAWN_METERS) {
        clearSeconds = 0;
        return;
      }
      // Only simulated time counts: a pause neither advances nor breaks the interval.
      if (paused || !(deltaSeconds > 0)) return;
      clearSeconds += deltaSeconds;
      if (clearSeconds >= DEPARTURE_SECONDS) {
        settled.release();
        settled = null;
        clearSeconds = 0;
      }
    },
    releaseAll() {
      settled?.release();
      settled = null;
      for (const lease of pending) lease.release();
      pending.clear();
      clearSeconds = 0;
    },
    isHeld() {
      dropInactive();
      return settled !== null || pending.size > 0;
    },
  };
}
