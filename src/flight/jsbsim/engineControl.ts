import type { FdmProfile } from "./fdmProfiles";

/**
 * Starts and stops the aircraft's engines the way the throttle lever asks.
 *
 * Holding the lever while the engines are off turns them over until JSBSim
 * calls them running: a piston gets its magnetos and the starter, a turbine
 * spins up on the starter with fuel cut off and is given fuel once N2 can
 * light it. Letting go first abandons the start. Holding the lever at idle
 * shuts them down: fuel off for a turbine, magnetos off for a piston.
 *
 * It also keeps a stopped engine stopped, whatever stopped it, so nothing
 * relights it but the pilot, and it repeats a shutdown until JSBSim has
 * obeyed it: the first step after a reinitialization sets a turbine's cutoff
 * from whether it was running, which would otherwise undo one.
 */

export type EngineRunState = "running" | "starting" | "stopped";

export interface EngineControlReading {
  state: EngineRunState;
  /** How far the start has got, 0 to 1. It reaches 1 only once the engines run. */
  startProgress: number;
  /** Why a start cannot finish now, or null. */
  blocked: string | null;
}

export interface EngineControlSdk {
  getPropertyValue(property: string): number;
  setPropertyValue(property: string, value: number): void;
  queryPropertyCatalog?(check: string): string;
}

export interface EngineControl {
  /**
   * Once before every physics step. `startHeld`: the pilot is holding the
   * lever to start. Returns the reading that step was taken with.
   */
  step(startHeld: boolean): EngineControlReading;
  /** The pilot held the lever at idle until the ring filled. */
  shutdown(): void;
  /** The last reading, without stepping. */
  reading(): EngineControlReading;
}

/** FGTurbine starts only above 15% N2; below it the starter spins the core dry. */
export const LIGHT_OFF_N2_PCT = 15;
/** Short of running, the ring stops here, so only a finished start fills it. */
const MAX_PROGRESS_BEFORE_RUNNING = 0.96;

/** JSBSim spells engine 0 without brackets in its catalogue. */
export function engineIndices(sdk: Pick<EngineControlSdk, "queryPropertyCatalog">): number[] {
  if (typeof sdk.queryPropertyCatalog !== "function") return [0];
  let text: string;
  try { text = sdk.queryPropertyCatalog("propulsion/engine"); } catch { return [0]; }
  const indices = new Set<number>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^propulsion\/engine(?:\[(\d+)\])?\/set-running\b/.exec(line.trim());
    if (match) indices.add(Number(match[1] ?? 0));
  }
  return indices.size ? [...indices].sort((a, b) => a - b) : [0];
}

export function createEngineControl(
  sdk: EngineControlSdk,
  profile: Pick<FdmProfile, "engine" | "startSpeed">,
): EngineControl {
  const engines = engineIndices(sdk);
  const turbine = profile.engine === "turbine";
  const read = (property: string): number => sdk.getPropertyValue(property);
  const isRunning = (index: number): boolean => read(`propulsion/engine[${index}]/set-running`) > 0.5;
  const allRunning = (): boolean => engines.every(isRunning);
  const anyRunning = (): boolean => engines.some(isRunning);
  const setStarter = (on: boolean): void => sdk.setPropertyValue("propulsion/starter_cmd", on ? 1 : 0);
  /** Fuel for a turbine, spark for a piston. magneto_cmd cannot be read back, so it is only ever written. */
  const setIgnition = (on: boolean): void => {
    if (turbine) sdk.setPropertyValue("propulsion/cutoff_cmd", on ? 0 : 1);
    else sdk.setPropertyValue("propulsion/magneto_cmd", on ? 3 : 0);
  };
  const stop = (): void => { setStarter(false); setIgnition(false); };

  let held = false;
  let shutdownPending = false;
  let wasRunning: boolean | null = null;
  let last: EngineControlReading = { state: allRunning() ? "running" : "stopped", startProgress: 0, blocked: null };

  const progress = (running: boolean): number => {
    if (running) return 1;
    const speed = read(profile.startSpeed.property);
    if (!Number.isFinite(speed) || profile.startSpeed.runningAt <= 0) return 0;
    return Math.min(MAX_PROGRESS_BEFORE_RUNNING, Math.max(0, speed / profile.startSpeed.runningAt));
  };

  const turnOver = (): void => {
    if (read("propulsion/starter_cmd") < 0.5) {
      setStarter(true);
      // A piston needs spark the whole start; a reset can take the magnetos away.
      if (!turbine) setIgnition(true);
    }
    if (!turbine) return;
    // Fuel only once N2 can light it: with fuel on and N2 below 15%, JSBSim
    // leaves the engine off and never spins it up.
    const lightable = read(profile.startSpeed.property) > LIGHT_OFF_N2_PCT;
    const cutoff = read("propulsion/cutoff_cmd") > 0.5;
    if (lightable === cutoff) setIgnition(lightable);
  };

  return {
    step(startHeld) {
      const running = allRunning();
      if (shutdownPending) {
        if (anyRunning()) stop();
        else shutdownPending = false;
      }
      const starting = startHeld && !shutdownPending;
      if (starting && !running) turnOver();
      // A piston keeps its starter turning until told; a turbine lets go at idle by itself.
      else if (starting && !turbine && read("propulsion/starter_cmd") > 0.5) setStarter(false);
      // Let go before it ran: the start is abandoned. Stopped by anything
      // else: it stays stopped until the pilot starts it.
      else if (!starting && !running && (held || wasRunning !== false)) stop();
      held = starting;
      wasRunning = running;
      const fuel = read("propulsion/total-fuel-lbs");
      last = {
        state: shutdownPending ? "stopped" : running ? "running" : starting ? "starting" : "stopped",
        startProgress: starting ? progress(running) : running ? 1 : 0,
        blocked: !running && Number.isFinite(fuel) && fuel <= 0 ? "No fuel on board" : null,
      };
      return last;
    },
    shutdown() {
      shutdownPending = true;
      stop();
      last = { ...last, state: "stopped", startProgress: 0 };
    },
    reading: () => last,
  };
}
