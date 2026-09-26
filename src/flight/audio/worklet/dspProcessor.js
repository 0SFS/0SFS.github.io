// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 the 0sfs authors.
//
// Thin wrapper around the WASM DSP core. Every synthesis decision lives in
// core.cpp; this file only moves bytes and calls exports. It is plain
// JavaScript because AudioWorkletGlobalScope loads the file as written: there
// is no bundler step between `addModule()` and this code.
//
// AudioWorkletGlobalScope has no fetch and no dynamic import, so the compiled
// WebAssembly.Module arrives by postMessage and is instantiated synchronously.

/** Kept in sync with ../audioSnapshot.ts by audioSnapshot.test.ts. */
const SNAPSHOT_SIZE = 29;
const EVENT_SIZE = 4;
const EVENT_CAPACITY = 32;
const BATCH_SNAPSHOTS = 8;
const BATCH_HEADER = 2;
const BATCH_LENGTH = BATCH_HEADER + BATCH_SNAPSHOTS * SNAPSHOT_SIZE + EVENT_CAPACITY * EVENT_SIZE;

/** Control-word layout of the optional SharedArrayBuffer ring. */
const SAB_WRITE = 0;
const SAB_READ = 1;
const SAB_SLOTS = 2;
const SAB_CONTROL_WORDS = 8;

class OsfsDspProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const settings = (options && options.processorOptions) || {};
    this.ready = false;
    this.failure = null;
    this.exports = null;
    this.batch = null;
    this.outputs = null;
    this.stats = null;
    this.sab = null;
    this.sabControl = null;
    this.sabData = null;
    this.sabSlots = 0;
    this.statsIntervalFrames = Math.max(1, Math.round(sampleRate));
    this.framesSinceStats = 0;
    this.pendingGains = null;
    this.pendingTier = null;
    this.pendingLimits = null;
    this.silentBlocks = 0;

    this.port.onmessage = (event) => this.onMessage(event);
    if (settings.module) this.boot(settings);
  }

  boot(settings) {
    try {
      const instance = new WebAssembly.Instance(settings.module, {
        env: { emscripten_notify_memory_growth: () => this.refreshViews() },
      });
      this.exports = instance.exports;
      // Reactor build: run static constructors before any export is called.
      if (typeof this.exports._initialize === "function") this.exports._initialize();
      const blockHint = Number(settings.maxBlockFrames) || 128;
      const seed = (Number(settings.seed) >>> 0) || 0x53463530;
      if (!this.exports.osfs_audio_init(sampleRate, blockHint, seed)) {
        throw new Error("osfs_audio_init rejected sampleRate " + sampleRate);
      }
      if (this.exports.osfs_audio_snapshot_size() !== SNAPSHOT_SIZE
        || this.exports.osfs_audio_batch_length() !== BATCH_LENGTH) {
        throw new Error("Snapshot ABI mismatch between the worklet and the WASM core");
      }
      this.refreshViews();
      if (settings.sab) this.attachSab(settings.sab);
      // Initial state rides in with the module, so the first rendered quantum
      // already has it; a port message can land after rendering has begun.
      const initial = settings.initial || null;
      if (initial) {
        if (initial.gains) this.applyGains(initial.gains);
        if (initial.limits) this.applyLimits(initial.limits);
        if (typeof initial.tier === "number") this.exports.osfs_audio_set_tier(initial.tier);
        if (typeof initial.tireWatts === "number") this.exports.osfs_audio_set_tire(initial.tireWatts);
      }
      if (this.pendingGains) this.applyGains(this.pendingGains);
      if (this.pendingLimits) this.applyLimits(this.pendingLimits);
      if (this.pendingTier !== null) this.exports.osfs_audio_set_tier(this.pendingTier);
      this.ready = true;
      this.port.postMessage({ type: "ready", sampleRate });
    } catch (error) {
      this.failure = String((error && error.message) || error);
      this.port.postMessage({ type: "failed", reason: this.failure });
    }
  }

  /**
   * Memory growth detaches the old ArrayBuffer, so every view has to be rebuilt.
   * Growth only ever happens from a setup call, never from process().
   */
  refreshViews() {
    if (!this.exports) return;
    const memory = this.exports.memory.buffer;
    this.batch = new Float64Array(memory, this.exports.osfs_audio_batch_ptr(), BATCH_LENGTH);
    this.outputs = [
      new Float32Array(memory, this.exports.osfs_audio_out(0), 1024),
      new Float32Array(memory, this.exports.osfs_audio_out(1), 1024),
    ];
    this.stats = new Float64Array(memory, this.exports.osfs_audio_stats(),
      this.exports.osfs_audio_stats_count());
  }

  attachSab(sab) {
    this.sab = sab;
    this.sabControl = new Int32Array(sab, 0, SAB_CONTROL_WORDS);
    this.sabSlots = Atomics.load(this.sabControl, SAB_SLOTS);
    this.sabData = new Float64Array(sab, SAB_CONTROL_WORDS * 4);
  }

  applyGains(gains) {
    const airframe = typeof gains.airframe === "number" ? gains.airframe : gains.engine;
    this.exports.osfs_audio_set_gains(gains.master, gains.engine, gains.tire, airframe, gains.reducedRange);
  }

  /** The pilot's limits for each tier, by tier index (osfs.sound.<tier>.*). */
  applyLimits(limits) {
    for (const entry of limits) {
      this.exports.osfs_audio_set_limits(entry.tier, entry.partials, entry.noiseBands, entry.grains,
        entry.startsPerSecond, entry.irMilliseconds);
    }
  }

  onMessage(event) {
    const message = event.data;
    if (!message) return;
    switch (message.type) {
      case "boot":
        if (!this.exports) this.boot(message);
        return;
      case "gains":
        if (this.exports) this.applyGains(message); else this.pendingGains = message;
        return;
      case "tier":
        if (this.exports) this.exports.osfs_audio_set_tier(message.tier);
        else this.pendingTier = message.tier;
        return;
      case "shed":
        if (this.exports) this.exports.osfs_audio_set_shed(message.level);
        return;
      case "limits":
        if (this.exports) this.applyLimits(message.limits); else this.pendingLimits = message.limits;
        return;
      case "epoch":
        if (this.exports) {
          // Anchor simulation time to the frame the epoch is heard at, not to
          // the frame this message happens to be delivered on.
          this.exports.osfs_audio_set_epoch(message.epoch, message.simTimeS,
            currentFrame + Math.round(message.leadSeconds * sampleRate));
        }
        return;
      case "tire":
        if (this.exports) this.exports.osfs_audio_set_tire(message.watts);
        return;
      case "reset":
        if (this.exports) this.exports.osfs_audio_reset();
        return;
      case "batch":
        this.ingest(message.buffer);
        return;
      case "band": {
        // Setup-path only; may grow memory, which is why views are rebuilt.
        if (!this.exports) return;
        const pointer = this.exports.osfs_audio_band_alloc(
          message.index, message.frames, message.n1, message.exterior);
        this.refreshViews();
        if (pointer) {
          new Float32Array(this.exports.memory.buffer, pointer, message.frames)
            .set(new Float32Array(message.samples));
        }
        this.port.postMessage({ type: "band", index: message.index, accepted: Boolean(pointer) });
        return;
      }
      case "bandClear":
        if (this.exports) { this.exports.osfs_audio_band_clear(); this.refreshViews(); }
        return;
      default:
        return;
    }
  }

  /** Copies one transferred batch into WASM and hands the buffer straight back. */
  ingest(buffer) {
    if (!buffer) return;
    if (this.exports && this.batch) {
      const incoming = new Float64Array(buffer);
      const length = Math.min(incoming.length, BATCH_LENGTH);
      this.batch.set(incoming.subarray(0, length));
      this.exports.osfs_audio_commit_batch();
    }
    // Ownership returns even when the core is not ready, or the producer
    // silently runs out of buffers and stops publishing.
    this.port.postMessage({ type: "recycle", buffer }, [buffer]);
  }

  /** Drains the optional SAB ring. Bounded, never waits, never spins. */
  drainSab() {
    if (!this.sabControl || !this.batch) return;
    let read = Atomics.load(this.sabControl, SAB_READ);
    const write = Atomics.load(this.sabControl, SAB_WRITE);
    let guard = this.sabSlots;
    while (read !== write && guard-- > 0) {
      const offset = (read % this.sabSlots) * BATCH_LENGTH;
      this.batch.set(this.sabData.subarray(offset, offset + BATCH_LENGTH));
      this.exports.osfs_audio_commit_batch();
      read = (read + 1) | 0;
      Atomics.store(this.sabControl, SAB_READ, read);
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const frames = output[0].length;

    if (!this.ready || !this.exports) {
      for (let channel = 0; channel < output.length; channel += 1) output[channel].fill(0);
      return this.failure === null;
    }

    if (this.sabControl) this.drainSab();
    this.exports.osfs_audio_process(currentFrame, frames);

    const left = this.outputs[0].subarray(0, frames);
    const right = this.outputs[1].subarray(0, frames);
    output[0].set(left);
    if (output.length > 1) output[1].set(right);
    for (let channel = 2; channel < output.length; channel += 1) output[channel].set(left);

    this.framesSinceStats += frames;
    if (this.framesSinceStats >= this.statsIntervalFrames) {
      this.framesSinceStats = 0;
      this.port.postMessage({ type: "stats", values: Array.from(this.stats) });
      // Peak is a per-interval observation, not a lifetime maximum.
      this.stats[8] = 0;
    }
    return true;
  }
}

registerProcessor("osfs-dsp", OsfsDspProcessor);
