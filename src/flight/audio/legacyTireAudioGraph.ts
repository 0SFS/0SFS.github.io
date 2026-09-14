import { tireAudioParameters } from "./createTireAudio";

/**
 * REFERENCE ONLY — not used at runtime.
 *
 * The original Web Audio tire cue graph, kept so the offline benchmark can
 * render the pre-migration sound for side-by-side comparison with the shared
 * WASM core (sound.md §2 moved the cue into that core). Nothing in the flight
 * app imports this module; it owns no AudioContext of its own.
 */

/** Reproducible noise lets offline comparisons use identical input. */
export function fillTireNoise(samples: Float32Array, seed = 0x74697265): void {
  let state = (seed | 0) || 1;
  for (let i = 0; i < samples.length; i += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    samples[i] = (state >>> 0) / 0x80000000 - 1;
  }
}

export function createTireAudioGraph(
  context: BaseAudioContext,
  destination: AudioNode = context.destination,
) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 2), context.sampleRate);
  fillTireNoise(buffer.getChannelData(0));
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.8;
  const noiseGain = context.createGain();
  const squeal = context.createOscillator();
  squeal.type = "sine";
  const squealGain = context.createGain();
  noiseGain.gain.value = 0;
  squealGain.gain.value = 0;
  noise.connect(filter).connect(noiseGain).connect(destination);
  squeal.connect(squealGain).connect(destination);
  noise.start();
  squeal.start();
  let disposed = false;

  function setTarget(parameter: AudioParam, value: number, time: number, decay: number) {
    parameter.cancelScheduledValues(time);
    parameter.setTargetAtTime(value, time, decay);
  }

  function silence(time = context.currentTime) {
    if (disposed) return;
    for (const parameter of [noiseGain.gain, squealGain.gain]) {
      parameter.cancelScheduledValues(time);
      parameter.setValueAtTime(0, time);
    }
  }

  return {
    update(slipPowerWatts: number, time = context.currentTime, volume = 1) {
      if (disposed) return;
      const parameters = tireAudioParameters(slipPowerWatts, volume);
      const decay = parameters.noiseGain > 0 ? 0.005 : 0.035;
      setTarget(noiseGain.gain, parameters.noiseGain, time, decay);
      setTarget(squealGain.gain, parameters.squealGain, time, decay);
      setTarget(filter.frequency, parameters.filterFrequencyHz, time, 0.015);
      setTarget(squeal.frequency, parameters.squealFrequencyHz, time, 0.015);
    },
    silence,
    dispose() {
      if (disposed) return;
      silence();
      disposed = true;
      noise.stop();
      squeal.stop();
      for (const node of [noise, filter, noiseGain, squeal, squealGain]) node.disconnect();
    },
  };
}
