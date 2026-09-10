/** A quiet, procedural tire cue driven by contact slip work. */
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

/** Shared by live playback and OfflineAudioContext comparison recordings. */
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

type AudioContextConstructor = new () => AudioContext;

export interface TireAudioOptions {
  /**
   * Receives the next click/key/touch when enabled audio is still locked, e.g.
   * a saved Slip cue restored at startup without a user gesture.
   */
  unlockTarget?: EventTarget | null;
}

const UNLOCK_EVENTS = ["pointerdown", "keydown", "touchend"] as const;

/**
 * Muted until setEnabled(true). Audio is suspended while disabled, paused, or
 * in a background tab. Failures never trigger retries; a locked context only
 * retries on the pilot's next gesture.
 */
export function createTireAudio(options: TireAudioOptions = {}) {
  const page = typeof document === "undefined" ? null : document;
  const unlockTarget = options.unlockTarget !== undefined ? options.unlockTarget
    : typeof window === "undefined" ? null : window;
  let context: AudioContext | null = null;
  let graph: ReturnType<typeof createTireAudioGraph> | null = null;
  let enabled = false;
  let paused = false;
  let disposed = false;
  let latestPower = 0;
  let volume = 1;
  // Last power scheduled at the current volume; avoids re-scheduling silence every frame.
  let scheduledPower: number | null = null;
  let status: string | null = null;
  let playbackRevision = 0;
  let unlockArmed = false;

  const canPlay = () => enabled && !paused && page?.visibilityState !== "hidden" && !disposed;

  function schedule(power: number) {
    if (!graph || (power === 0 && scheduledPower === 0)) return;
    graph.update(power, undefined, volume);
    scheduledPower = power;
  }

  function silenceGraph() {
    graph?.silence();
    scheduledPower = 0;
  }

  function onUnlockGesture() {
    disarmUnlock();
    if (!disposed && enabled) syncPlayback(true);
  }
  function armUnlock() {
    if (unlockArmed || !unlockTarget || disposed) return;
    unlockArmed = true;
    for (const type of UNLOCK_EVENTS) unlockTarget.addEventListener(type, onUnlockGesture, { capture: true });
  }
  function disarmUnlock() {
    if (!unlockArmed || !unlockTarget) return;
    unlockArmed = false;
    for (const type of UNLOCK_EVENTS) unlockTarget.removeEventListener(type, onUnlockGesture, { capture: true });
  }

  function suspend(current: AudioContext) {
    if (current.state === "closed") return;
    // Also queue suspension when resume is pending; its completion checks again.
    void current.suspend().catch(() => {
      // Gains are already zero even if the browser refuses to suspend.
    });
  }

  function syncPlayback(unlock = false) {
    const revision = ++playbackRevision;
    const current = context;
    if (!current || !graph) return;
    if (!canPlay()) {
      latestPower = 0;
      silenceGraph();
      if (!unlock || current.state === "running") {
        suspend(current);
        return;
      }
    }
    if (current.state === "running") {
      status = null;
      disarmUnlock();
      schedule(latestPower);
      return;
    }
    // Synchronous invocation preserves activation from the checkbox event.
    void current.resume().then(() => {
      if (disposed || context !== current) return;
      if (!canPlay()) {
        silenceGraph();
        suspend(current);
      } else if (revision === playbackRevision) {
        if (current.state === "running") {
          status = null;
          disarmUnlock();
          schedule(latestPower);
        } else {
          status = "Tire sound starts after your next click or key press.";
          armUnlock();
        }
      }
    }).catch(() => {
      if (!disposed && revision === playbackRevision && enabled) {
        status = "Tire sound could not start. Try switching it off and on.";
        silenceGraph();
        armUnlock();
      }
    });
  }

  function onVisibilityChange() {
    if (!disposed) syncPlayback();
  }
  page?.addEventListener("visibilitychange", onVisibilityChange);

  return {
    setEnabled(value: boolean) {
      if (disposed) return;
      enabled = value;
      status = null;
      if (!enabled) disarmUnlock();
      if (enabled && !context) {
        const browser = globalThis as typeof globalThis & { webkitAudioContext?: AudioContextConstructor };
        const Constructor = browser.AudioContext ?? browser.webkitAudioContext;
        if (!Constructor) {
          status = "Tire sound is unavailable in this browser.";
          return;
        }
        try {
          context = new Constructor();
          graph = createTireAudioGraph(context);
        } catch {
          if (context) void context.close().catch(() => { /* Already unusable. */ });
          context = null;
          graph = null;
          status = "Tire sound could not start in this browser.";
          return;
        }
      }
      // Unlock during this gesture even when paused, with gains held at zero.
      syncPlayback(enabled);
    },
    setPaused(value: boolean) {
      if (disposed || paused === value) return;
      paused = value;
      syncPlayback();
    },
    /** Immediate; does not reset the wheel state or restart the graph. */
    setVolume(value: number) {
      const next = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
      if (disposed || next === volume) return;
      volume = next;
      scheduledPower = null;
      if (canPlay() && context?.state === "running") schedule(latestPower);
    },
    update(slipPowerWatts: number) {
      if (!canPlay()) return;
      latestPower = Number.isFinite(slipPowerWatts) ? Math.max(0, slipPowerWatts) : 0;
      if (context?.state === "running") schedule(latestPower);
    },
    getStatus: () => status,
    dispose() {
      if (disposed) return;
      disposed = true;
      playbackRevision += 1;
      disarmUnlock();
      page?.removeEventListener("visibilitychange", onVisibilityChange);
      graph?.dispose();
      graph = null;
      if (context) void context.close().catch(() => { /* Disposal remains final. */ });
      context = null;
    },
  };
}
