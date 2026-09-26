import { readFileSync } from "node:fs";
import {
  AUDIO_BATCH_HEADER, AUDIO_BATCH_LENGTH, AUDIO_BATCH_SNAPSHOTS, AUDIO_EVENT_SIZE,
  AUDIO_SNAPSHOT_SIZE, writeAudioSnapshot, type AudioEventType, type AudioSnapshotInit,
} from "./audioSnapshot";

/**
 * Node-side driver for the ACTUAL compiled WASM core.
 *
 * Tests that exercise synthesis run the shipped binary through this, not a
 * JavaScript re-implementation: sound.md's acceptance list is about what the
 * DSP does, and a mock cannot answer that. Only the Web Audio plumbing around
 * it is faked, and those tests say so.
 */

export interface DspExports {
  memory: WebAssembly.Memory;
  _initialize(): void;
  osfs_audio_init(sampleRate: number, maxBlockFrames: number, seed: number): number;
  osfs_audio_reset(): void;
  osfs_audio_set_tier(tier: number): void;
  osfs_audio_get_tier(): number;
  osfs_audio_set_shed(level: number): void;
  osfs_audio_set_limits(tier: number, partials: number, noiseBands: number, grains: number,
    startsPerSecond: number, irMilliseconds: number): void;
  osfs_audio_get_shed(): number;
  osfs_audio_set_gains(master: number, engine: number, tire: number, airframe: number, reduced: number): void;
  osfs_audio_set_epoch(epoch: number, simTimeS: number, audioFrame: number): void;
  osfs_audio_batch_ptr(): number;
  osfs_audio_batch_length(): number;
  osfs_audio_snapshot_size(): number;
  osfs_audio_commit_batch(): void;
  osfs_audio_set_tire(watts: number): void;
  osfs_audio_out(channel: number): number;
  osfs_audio_stats(): number;
  osfs_audio_stats_count(): number;
  osfs_audio_band_alloc(index: number, frames: number, n1: number, exterior: number): number;
  osfs_audio_band_clear(): void;
  osfs_audio_bands_ready(): number;
  osfs_audio_process(blockStartFrame: number, frames: number): void;
}

export const TIER = { off: 0, low: 1, med: 2, high: 3 } as const;

/** Stat slots, mirroring the `Stat` enum in core.cpp. */
export const STAT = {
  snapshotsIn: 0, snapshotsDropped: 1, eventsIn: 2, eventsDropped: 3, resyncs: 4,
  staleFades: 5, blocks: 6, frames: 7, peak: 8, telemetryAge: 9, activeGrains: 10,
  grainDrops: 11, nonFinite: 12, queueDepth: 13, fade: 14, doppler: 15, distance: 16,
  tier: 17, shed: 18, epoch: 19,
  partials: 20, noiseBands: 21, grainCap: 22, grainStarts: 23, irMs: 24,
} as const;

let cached: WebAssembly.Module | null = null;

export async function loadDspModule(): Promise<WebAssembly.Module> {
  cached ??= await WebAssembly.compile(readFileSync("src/flight/audio/dsp/audio-dsp.wasm"));
  return cached;
}

export interface DspHarness {
  exports: DspExports;
  sampleRate: number;
  frame: number;
  /** Renders `frames` samples and returns interleaved-free channel views. */
  render(frames: number): { left: Float32Array; right: Float32Array };
  /** Renders `seconds` and returns the concatenated left/right channels. */
  renderSeconds(seconds: number, onBlock?: (frame: number) => void):
  { left: Float32Array; right: Float32Array };
  pushSnapshot(snapshot: AudioSnapshotInit): void;
  pushEvent(type: AudioEventType, simTimeS: number, epoch: number, payload?: number): void;
  anchor(epoch: number, simTimeS: number): void;
  stats(): Record<keyof typeof STAT, number>;
  loadBand(index: number, samples: Float32Array, n1: number, exterior: number): boolean;
}

export async function createDspHarness(options: {
  sampleRate?: number; block?: number; seed?: number;
} = {}): Promise<DspHarness> {
  const sampleRate = options.sampleRate ?? 48_000;
  const block = options.block ?? 128;
  const module = await loadDspModule();
  const instance = new WebAssembly.Instance(module, {
    env: { emscripten_notify_memory_growth: () => { /* Views are rebuilt on demand. */ } },
  });
  const exports = instance.exports as unknown as DspExports;
  exports._initialize();
  if (!exports.osfs_audio_init(sampleRate, block, options.seed ?? 0x53463530)) {
    throw new Error(`osfs_audio_init refused sampleRate ${sampleRate}`);
  }

  const batchView = (): Float64Array =>
    new Float64Array(exports.memory.buffer, exports.osfs_audio_batch_ptr(), AUDIO_BATCH_LENGTH);
  const eventBase = AUDIO_BATCH_HEADER + AUDIO_BATCH_SNAPSHOTS * AUDIO_SNAPSHOT_SIZE;

  const harness: DspHarness = {
    exports,
    sampleRate,
    frame: 0,
    render(frames) {
      exports.osfs_audio_process(harness.frame, frames);
      harness.frame += frames;
      const memory = exports.memory.buffer;
      return {
        left: new Float32Array(memory, exports.osfs_audio_out(0), frames).slice(),
        right: new Float32Array(memory, exports.osfs_audio_out(1), frames).slice(),
      };
    },
    renderSeconds(seconds, onBlock) {
      const total = Math.round(seconds * sampleRate);
      const left = new Float32Array(total);
      const right = new Float32Array(total);
      for (let offset = 0; offset < total; offset += block) {
        const frames = Math.min(block, total - offset);
        onBlock?.(harness.frame);
        const rendered = harness.render(frames);
        left.set(rendered.left, offset);
        right.set(rendered.right, offset);
      }
      return { left, right };
    },
    pushSnapshot(snapshot) {
      const batch = batchView();
      batch.fill(0);
      batch[0] = 1;
      batch[1] = 0;
      writeAudioSnapshot(batch, AUDIO_BATCH_HEADER, snapshot);
      exports.osfs_audio_commit_batch();
    },
    pushEvent(type, simTimeS, epoch, payload = 0) {
      const batch = batchView();
      batch.fill(0);
      batch[0] = 0;
      batch[1] = 1;
      batch[eventBase] = type;
      batch[eventBase + 1] = simTimeS;
      batch[eventBase + 2] = epoch;
      batch[eventBase + 3] = payload;
      exports.osfs_audio_commit_batch();
    },
    anchor(epoch, simTimeS) {
      exports.osfs_audio_set_epoch(epoch, simTimeS, harness.frame);
    },
    stats() {
      const values = new Float64Array(exports.memory.buffer, exports.osfs_audio_stats(),
        exports.osfs_audio_stats_count());
      return Object.fromEntries(
        Object.entries(STAT).map(([name, index]) => [name, values[index]]),
      ) as Record<keyof typeof STAT, number>;
    },
    loadBand(index, samples, n1, exterior) {
      const pointer = exports.osfs_audio_band_alloc(index, samples.length, n1, exterior);
      if (!pointer) return false;
      new Float32Array(exports.memory.buffer, pointer, samples.length).set(samples);
      return true;
    },
  };
  return harness;
}

/** Root-mean-square of a channel, or of a slice of one. */
export function rms(samples: Float32Array, from = 0, to = samples.length): number {
  let sum = 0;
  for (let i = from; i < to; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, to - from));
}

export function peak(samples: Float32Array): number {
  let best = 0;
  for (const sample of samples) best = Math.max(best, Math.abs(sample));
  return best;
}

/** Normalised single-bin DFT power at one frequency. Test-only. */
function binPower(samples: Float32Array, sampleRate: number, frequency: number): number {
  let re = 0;
  let im = 0;
  const omega = (2 * Math.PI * frequency) / sampleRate;
  for (let i = 0; i < samples.length; i += 1) {
    re += samples[i] * Math.cos(omega * i);
    im += samples[i] * Math.sin(omega * i);
  }
  const n = Math.max(1, samples.length);
  return (re * re + im * im) / (n * n);
}

/** Dominant frequency by naive DFT over a coarse bin sweep. Test-only. */
export function dominantFrequency(
  samples: Float32Array, sampleRate: number, low: number, high: number, step = 5,
): number {
  let bestFrequency = low;
  let bestPower = -1;
  for (let frequency = low; frequency <= high; frequency += step) {
    const power = binPower(samples, sampleRate, frequency);
    if (power > bestPower) { bestPower = power; bestFrequency = frequency; }
  }
  return bestFrequency;
}

/** Mean bin power across [low, high]. Only meaningful compared like with like. */
export function bandPower(
  samples: Float32Array, sampleRate: number, low: number, high: number, step = 5,
): number {
  let total = 0;
  let bins = 0;
  for (let frequency = low; frequency <= high; frequency += step) {
    total += binPower(samples, sampleRate, frequency);
    bins += 1;
  }
  return total / Math.max(1, bins);
}

/** Sample-wise a - b. Same seed and inputs cancel exactly, so what remains is the change. */
export function difference(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(Math.min(a.length, b.length));
  for (let i = 0; i < out.length; i += 1) out[i] = a[i] - b[i];
  return out;
}

export const AUDIO_EVENT_STRIDE = AUDIO_EVENT_SIZE;
