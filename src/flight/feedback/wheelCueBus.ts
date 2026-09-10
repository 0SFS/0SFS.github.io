import type { WheelSpinConfig, WheelSpinState } from "../physics/wheelSpin";

export type WheelName = WheelSpinConfig["name"];

/**
 * One wheel's accepted fixed-step contact summary. Presentation only: audio,
 * haptics and visuals may read it; nothing reads it back into flight physics.
 * With the current one-way adapter, load/impulse are strut spring/damper
 * estimates and there is no per-wheel support geometry (confidence 0).
 */
export interface WheelCue {
  epoch: number;
  sequence: number;
  simTimeS: number;
  stepSeconds: number;
  wheel: WheelName;
  onGround: boolean;
  /** First grounded step after an airborne step within this epoch. */
  contactEntered: boolean;
  /** Cumulative |tread travel| since the epoch began. Distance-domain, render-rate independent. */
  rollingDistanceM: number;
  normalLoadN: number;
  normalImpulseNs: number;
  slipDissipatedJ: number;
  supportDeltaM: number;
  supportConfidence: number;
  groundRevision: number;
}

export type WheelCueResetReason =
  | "pause" | "reset" | "fault" | "teleport" | "mode" | "ground-revision" | "disabled" | "dispose";

export interface WheelCueSink {
  /** Called once per accepted step with every wheel. Must not retain the array or cues. */
  accept(cues: readonly WheelCue[]): void;
  /** Discard partial aggregates; stale cues must never leak into a new epoch. */
  reset(reason: WheelCueResetReason): void;
}

export interface WheelCueBus {
  publish(simTimeS: number, stepSeconds: number, wheels: readonly WheelSpinState[]): void;
  invalidate(reason: WheelCueResetReason): void;
  setGroundRevision(revision: number): void;
  subscribe(sink: WheelCueSink): () => void;
  getEpoch(): number;
  getSequence(): number;
}

/**
 * Latest-value fan-out with no queue: sinks aggregate at their own rate, so a
 * slow consumer cannot build a backlog. Sink exceptions are contained; they
 * detach that sink rather than interrupting the physics step that published.
 */
export function createWheelCueBus(names: readonly WheelName[], onSinkError?: (error: unknown) => void): WheelCueBus {
  let epoch = 0;
  let sequence = 0;
  let groundRevision = 0;
  const sinks = new Set<WheelCueSink>();
  const previousGround: (boolean | null)[] = names.map(() => null);
  const distance = names.map(() => 0);
  const cues: WheelCue[] = names.map(wheel => ({
    epoch, sequence, simTimeS: 0, stepSeconds: 0, wheel, onGround: false, contactEntered: false, rollingDistanceM: 0,
    normalLoadN: 0, normalImpulseNs: 0, slipDissipatedJ: 0, supportDeltaM: 0, supportConfidence: 0, groundRevision,
  }));

  const deliver = (visit: (sink: WheelCueSink) => void) => {
    for (const sink of [...sinks]) {
      try { visit(sink); } catch (error) { sinks.delete(sink); onSinkError?.(error); }
    }
  };
  const invalidate = (reason: WheelCueResetReason) => {
    epoch += 1;
    sequence = 0;
    previousGround.fill(null);
    distance.fill(0);
    deliver(sink => sink.reset(reason));
  };

  return {
    publish(simTimeS, stepSeconds, wheels) {
      if (!Number.isFinite(simTimeS) || !Number.isFinite(stepSeconds) || stepSeconds <= 0
        || wheels.length !== names.length) return;
      sequence += 1;
      for (let index = 0; index < names.length; index++) {
        const state = wheels[index];
        const cue = cues[index];
        const load = Number.isFinite(state.normalLoadNewtons) ? Math.max(0, state.normalLoadNewtons) : 0;
        const travel = Number.isFinite(state.treadTravelMeters) ? Math.abs(state.treadTravelMeters) : 0;
        const slip = Number.isFinite(state.slipPowerWatts) ? Math.max(0, state.slipPowerWatts) : 0;
        distance[index] += travel;
        cue.epoch = epoch;
        cue.sequence = sequence;
        cue.simTimeS = simTimeS;
        cue.stepSeconds = stepSeconds;
        cue.onGround = state.onGround;
        cue.contactEntered = state.onGround && previousGround[index] === false;
        cue.rollingDistanceM = distance[index];
        cue.normalLoadN = state.onGround ? load : 0;
        cue.normalImpulseNs = cue.normalLoadN * stepSeconds;
        cue.slipDissipatedJ = slip * stepSeconds;
        cue.supportDeltaM = 0;
        cue.supportConfidence = 0;
        cue.groundRevision = groundRevision;
        previousGround[index] = state.onGround;
      }
      if (sinks.size > 0) deliver(sink => sink.accept(cues));
    },
    invalidate,
    setGroundRevision(revision) {
      if (revision === groundRevision) return;
      groundRevision = revision;
      invalidate("ground-revision");
    },
    subscribe(sink) {
      sinks.add(sink);
      return () => { sinks.delete(sink); };
    },
    getEpoch: () => epoch,
    getSequence: () => sequence,
  };
}

/** Accumulates slip work between render frames for the existing slip audio graph. */
export function createSlipAudioSink() {
  let energyJ = 0;
  let seconds = 0;
  return {
    accept(cues: readonly WheelCue[]) {
      if (cues.length === 0) return;
      for (const cue of cues) energyJ += cue.slipDissipatedJ;
      seconds += cues[0].stepSeconds;
    },
    reset() { energyJ = seconds = 0; },
    /** Mean slip power over the accepted steps since the last take, or null when none ran. */
    takeMeanPowerWatts(): number | null {
      if (seconds <= 0) return null;
      const power = energyJ / seconds;
      energyJ = seconds = 0;
      return power;
    },
  } satisfies WheelCueSink & { takeMeanPowerWatts(): number | null };
}
