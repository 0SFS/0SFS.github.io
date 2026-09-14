import type { FlightAudioHandle } from "./createFlightAudio";

/**
 * The slip-work tire cue curve. The WASM core's TireVoice (dsp/turbofan.h)
 * implements exactly this mapping, so moving the cue into the shared core was a
 * move, not a redesign. Kept here as the reference the core is checked against.
 */
export function tireAudioParameters(slipPowerWatts: number, volume = 1) {
  const power = Number.isFinite(slipPowerWatts) ? Math.max(0, slipPowerWatts) : 0;
  const level = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0;
  // Ignore tiny numerical slip; saturation bounds the volume of hard impacts.
  const intensity = power <= 2 ? 0 : Math.min(1, Math.sqrt(power / 15_000));
  return {
    noiseGain: 0.075 * intensity * level,
    squealGain: 0.012 * intensity * intensity * level,
    filterFrequencyHz: 1_100 + 900 * intensity,
    squealFrequencyHz: 1_450 + 550 * intensity,
  };
}

export interface TireAudioHandle {
  setEnabled(enabled: boolean): void;
  setPaused(paused: boolean): void;
  /** Immediate; does not reset the wheel state or restart the graph. */
  setVolume(volume: number): void;
  update(slipPowerWatts: number): void;
  getStatus(): string | null;
  dispose(): void;
}

export interface TireAudioOptions {
  audio: FlightAudioHandle;
}

/**
 * The tire cue's app-facing lifecycle, now a view onto the shared sound runtime.
 *
 * It used to own a private AudioContext and Web Audio graph. It now plays
 * through the same worklet and WASM core as the engine, so one context, one
 * limiter and one set of pause/background/fault holds cover both. The method
 * surface is unchanged, so the ground-interaction wiring did not have to move.
 */
export function createTireAudio(options: TireAudioOptions): TireAudioHandle {
  const { audio } = options;
  let enabled = false;
  let volume = 1;
  let paused = false;
  let disposed = false;

  return {
    setEnabled(value) {
      if (disposed) return;
      enabled = value;
      // Synchronous, so a checkbox gesture still unlocks audio.
      audio.setTireCue(enabled, volume);
    },
    setPaused(value) {
      if (disposed || value === paused) return;
      paused = value;
      // Tire feedback holds (pause, blocked terrain, contact fault) silence the
      // cue alone. Engine sound is held by the app for pause and loading, and
      // otherwise follows telemetry, so a flickering contact cannot chop it.
      audio.setTireHeld(value);
    },
    setVolume(value) {
      if (disposed) return;
      volume = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
      audio.setTireCue(enabled, volume);
    },
    update(slipPowerWatts) {
      if (disposed || !enabled || paused) return;
      audio.setTireSlipWatts(slipPowerWatts);
    },
    getStatus: () => (disposed ? null : audio.getStatus().tireMessage),
    dispose() {
      if (disposed) return;
      disposed = true;
      audio.setTireCue(false, volume);
    },
  };
}
