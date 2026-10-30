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
const SNAPSHOT_SIZE = 107;
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
    this.voice = null;
    this.voiceCount = 1;
    this.voiceInput = null;
    this.voiceOutput = null;
    this.hostVoiceInput = null;
    this.hostVoiceOutput = null;
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
    this.pendingProfile = null;
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
      this.voiceCount = (initial && initial.voiceCount) || 1;
      if (settings.voiceModule) {
        this.voice = new WebAssembly.Instance(settings.voiceModule, {}).exports;
        if (typeof this.voice._initialize === "function") this.voice._initialize();
        if (this.voice.osfs_voice_abi_version() !== 1 || !this.voice.osfs_voice_init(sampleRate, 1024, seed, this.voiceCount)) throw new Error("Engine voice ABI or setup mismatch");
        this.voiceInput = new Float64Array(this.voice.memory.buffer, this.voice.osfs_voice_input_ptr(), 4 * 1024 * 32);
        this.voiceOutput = new Float64Array(this.voice.memory.buffer, this.voice.osfs_voice_output_ptr(), 4 * 2 * 1024);
      }
      this.hostVoiceInput = new Float64Array(this.exports.memory.buffer, this.exports.osfs_audio_voice_input_ptr(), 4 * 1024 * 32);
      this.hostVoiceOutput = new Float64Array(this.exports.memory.buffer, this.exports.osfs_audio_voice_output_ptr(), 4 * 2 * 1024);

      if (initial) {
        this.applySources(initial.sources, this.voiceCount);
        if (initial.profiles || initial.profile) this.applyProfile(initial.profiles || [initial.profile]);
        if (initial.gains) this.applyGains(initial.gains);
        if (initial.limits) this.applyLimits(initial.limits);
        if (typeof initial.tier === "number") this.exports.osfs_audio_set_tier(initial.tier);
        if (typeof initial.tireWatts === "number") this.exports.osfs_audio_set_tire(initial.tireWatts);
      }
      if (this.pendingGains) this.applyGains(this.pendingGains);
      if (this.pendingProfile) this.applyProfile(this.pendingProfile);
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
    // A separate runtime control keeps native augmentation and engine setup
    // intact. The core smooths this gain without restarting the voice.
    this.exports.osfs_audio_set_afterburner_volume(
      typeof gains.afterburner === "number" ? gains.afterburner : 1);
  }

  /** Setup only: fixed size, no allocation or memory growth in the DSP. */
  applySources(sources, count) {
    const color = sources || {};
    this.exports.osfs_audio_set_source_type(color.sourceType === "electric" ? 1 : 0);
    this.exports.osfs_audio_set_sources(count || 1, color.interiorGain ?? 0.12589254117941673,
      color.interiorHz ?? 1200, color.highInteriorGain ?? color.interiorGain ?? 0.12589254117941673,
      color.highInteriorHz ?? color.interiorHz ?? 1400);
  }

  applyProfile(profiles) {
    if (!this.voice) throw new Error("No engine voice module is installed");
    if (!Array.isArray(profiles) || !Array.isArray(profiles[0])) profiles = [profiles];
    if (profiles.length !== this.voiceCount) throw new Error("Engine voice profile count mismatch");
    const size = this.voice.osfs_voice_profile_size();
    for (let voice = 0; voice < profiles.length; voice += 1) {
      const values = profiles[voice];
      if (!Array.isArray(values) || values.length !== size) throw new Error("Acoustic profile ABI mismatch");
      new Float64Array(this.voice.memory.buffer, this.voice.osfs_voice_profile_ptr(voice), size).set(values);
      if (!this.voice.osfs_voice_commit_profile(voice)) throw new Error("Invalid acoustic profile");
    }
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
      case "profile":
        if (this.exports) {
          try { this.applySources(message.sources, message.voiceCount || this.voiceCount); this.applyProfile(message.profiles || message.values); } catch (error) {
            this.failure = String((error && error.message) || error);
            this.ready = false;
            this.port.postMessage({ type: "failed", reason: this.failure });
          }
        } else this.pendingProfile = message.profiles || message.values;
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
        if (this.voice) this.voice.osfs_voice_reset();
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
        this.port.postMessage({ type: "band", requestId: message.requestId, index: message.index, accepted: Boolean(pointer) });
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
      for (let i = 0; i < BATCH_LENGTH; i += 1) this.batch[i] = this.sabData[offset + i];
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
    this.exports.osfs_audio_prepare(currentFrame, frames);
    if (this.voice) {
      // Bounded copies between independent linear memories; no sample-wise WASM calls or allocations.
      for (let voice = 0; voice < this.voiceCount; voice += 1) {
        const inputBase = voice * 1024 * 32;
        for (let i = 0; i < frames * 32; i += 1) this.voiceInput[inputBase + i] = this.hostVoiceInput[inputBase + i];
      }
      if (!this.voice.osfs_voice_process(frames)) {
        for (let channel = 0; channel < output.length; channel += 1) output[channel].fill(0);
        this.failure = "Engine voice rejected an audio block";
        this.port.postMessage({type: "failed", reason: this.failure});
        return false;
      }
      for (let voice = 0; voice < this.voiceCount; voice += 1) for (let bus = 0; bus < 2; bus += 1) {
        const outputBase = (voice * 2 + bus) * 1024;
        for (let i = 0; i < frames; i += 1) this.hostVoiceOutput[outputBase + i] = this.voiceOutput[outputBase + i];
      }
    }
    this.exports.osfs_audio_mix(currentFrame, frames);

    // Copy into browser-owned channel buffers without allocating typed-array views.
    for (let channel = 0; channel < output.length; channel += 1) {
      const source = this.outputs[channel === 1 ? 1 : 0];
      for (let frame = 0; frame < frames; frame += 1) output[channel][frame] = source[frame];
    }

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
