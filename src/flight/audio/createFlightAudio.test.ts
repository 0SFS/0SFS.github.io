import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUDIO_BATCH_HEADER, AUDIO_BATCH_SNAPSHOTS, AUDIO_EVENT, AUDIO_EVENT_SIZE, AUDIO_SNAPSHOT_SIZE } from "./audioSnapshot";
import { flightParameterDefaults } from "../settings/flightParameters";
import { audioSettingsValues, createAudioSettingsStore, DEFAULT_AUDIO_SETTINGS, patchAudioSettings } from "./audioSettings";
import { createFlightAudio, type FlightAudioHandle } from "./createFlightAudio";
import type { AudioAdapter, AudioAdapterReading } from "./jsbsimAudioAdapter";

/**
 * SYNTHETIC Web Audio fakes. These check the facade's lifecycle decisions —
 * what is allocated when, what is sent, what wins a race — not audio output.
 * Output is covered against the real WASM in dspCore.test.ts. Nothing here
 * stands in for a browser, an output route or a device.
 */

type Posted = { type: string; [key: string]: unknown };
const EVENT_BASE = AUDIO_BATCH_HEADER + AUDIO_BATCH_SNAPSHOTS * AUDIO_SNAPSHOT_SIZE;
const log: string[] = [];

class FakePort {
  messages: Posted[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage(message: Posted) { this.messages.push(message); }
  deliver(data: unknown) { this.onmessage?.({ data } as MessageEvent); }
  ofType(type: string) { return this.messages.filter(message => message.type === type); }
  last(type: string) { return this.ofType(type).at(-1); }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  sampleRate = 48_000;
  state: AudioContextState = "suspended";
  destination = {};
  audioWorklet = { addModule: vi.fn(async () => undefined) };
  resume = vi.fn(async () => { this.state = "running"; });
  suspend = vi.fn(async () => { this.state = "suspended"; });
  close = vi.fn(async () => { log.push("context.close"); this.state = "closed"; });
  constructor() { FakeAudioContext.instances.push(this); }
}

class FakeWorkletNode {
  static instances: FakeWorkletNode[] = [];
  port = new FakePort();
  onprocessorerror: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  constructor(
    public context: FakeAudioContext, public name: string,
    public options: { processorOptions: Record<string, unknown> },
  ) { FakeWorkletNode.instances.push(this); }
}

const wasm = readFileSync("src/flight/audio/dsp/audio-dsp.wasm");

/** The sound parameters as a saved record would leave them. */
function savedParameters(initial?: object) {
  if (!initial) return flightParameterDefaults();
  return flightParameterDefaults(audioSettingsValues(patchAudioSettings(DEFAULT_AUDIO_SETTINGS, initial)));
}

function fakeAdapter() {
  const reading: AudioAdapterReading = {
    simTimeS: 0, availability: 0, n1Pct: 20, n2Pct: 45, thrustLbf: 0, fuelFlowPps: 0, throttleNorm: 0,
    combustion: false, running: false, starter: true, cutoff: true, kias: 0, gearNorm: 1, flapNorm: 0,
    velocity: [0, 0, 0], soundSpeedMps: 343,
  };
  const dispose = vi.fn(() => { log.push("adapter.dispose"); });
  const adapter: AudioAdapter = {
    read: () => reading,
    diagnostics: { missing: [], combustionSource: "fuel-flow", sourceOffset: [0, 2, -2] },
    dispose,
  };
  return { adapter, reading, dispose };
}

const handles: FlightAudioHandle[] = [];
function create(options: {
  stored?: object; inGesture?: boolean; unlockTarget?: EventTarget; loadWasm?: () => Promise<BufferSource>;
  suspendDelayMs?: number;
} = {}) {
  const store = createAudioSettingsStore(savedParameters(options.stored));
  const audio = createFlightAudio({
    settings: store,
    suspendDelayMs: options.suspendDelayMs,
    unlockTarget: options.unlockTarget ?? null,
    loadWasm: options.loadWasm ?? (async () => wasm),
    workletModuleUrl: "dspProcessor.js",
    capabilityOverrides: { audioWorklet: true, webAssembly: true },
    inGesture: () => options.inGesture ?? true,
  });
  handles.push(audio);
  return { audio, store };
}

async function booted(count = 1): Promise<FakeWorkletNode> {
  await vi.waitFor(() => expect(FakeWorkletNode.instances).toHaveLength(count));
  return FakeWorkletNode.instances[count - 1];
}

beforeEach(() => {
  FakeAudioContext.instances = [];
  FakeWorkletNode.instances = [];
  log.length = 0;
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("AudioWorkletNode", FakeWorkletNode);
});
afterEach(() => {
  for (const handle of handles.splice(0)) handle.dispose();
  vi.unstubAllGlobals();
});

describe("flight audio lifecycle (synthetic fakes)", () => {
  it("allocates nothing until sound is asked for", () => {
    const { audio } = create();
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(audio.getStatus()).toMatchObject({ enabled: false, effective: "off", mode: "off" });
  });

  it("creates and resumes the context inside the enabling gesture, then boots the core", async () => {
    const { audio } = create();
    audio.setEnabled(true);
    // Synchronous: by the time the click handler returns, the context exists.
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0].resume).toHaveBeenCalledOnce();
    const node = await booted();
    expect(node.name).toBe("osfs-dsp");
    expect(node.options.processorOptions.module).toBeInstanceOf(WebAssembly.Module);
    // The first quantum must not wait on a port message for its tier and gains.
    expect(node.options.processorOptions.initial).toMatchObject({ tier: 1, gains: { master: 0.7, engine: 0.8 } });
    // Auto with no qualification evidence resolves to Low.
    expect(node.port.last("tier")).toEqual({ type: "tier", tier: 1 });
    expect(node.port.last("gains")).toMatchObject({ master: 0.7, engine: 0.8, airframe: 0.6, tire: 0 });
    expect(audio.getStatus()).toMatchObject({ effective: "low", requested: "auto", mode: "sound", gestureLocked: false });
  });

  it("runs an unvalidated Med request as Low and keeps the request visible", async () => {
    const { audio } = create({ stored: { requested: "med" } });
    audio.setEnabled(true);
    const node = await booted();
    expect(node.port.last("tier")).toEqual({ type: "tier", tier: 1 });
    expect(audio.getStatus()).toMatchObject({ requested: "med", effective: "low" });
    expect(audio.getStatus().availability.med.state).toBe("unvalidated");
  });

  it("waits for a gesture instead of autoplaying a restored preference", async () => {
    const target = new EventTarget();
    const { audio } = create({ stored: { enabled: true }, unlockTarget: target });
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(audio.getStatus()).toMatchObject({ gestureLocked: true, effective: "off" });
    target.dispatchEvent(new Event("pointerdown"));
    expect(FakeAudioContext.instances).toHaveLength(1);
    await booted();
  });

  it("lets a disable that lands while the core is loading win over the late completion", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const { audio } = create({ loadWasm: async () => { await gate; return wasm; } });
    audio.setEnabled(true);
    audio.setEnabled(false);
    release();
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(FakeWorkletNode.instances).toHaveLength(0);
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalled();
    expect(audio.getStatus().effective).toBe("off");
  });

  it("counts holds per reason, and a release opens a new epoch", async () => {
    const { audio } = create();
    audio.setEnabled(true);
    const node = await booted();
    audio.setHeld(true, "pause");
    audio.setHeld(true, "background");
    expect(node.port.last("tier")).toEqual({ type: "tier", tier: 0 });
    audio.setHeld(false, "background");
    expect(audio.getStatus().held).toBe(true);
    expect(node.port.last("tier")).toEqual({ type: "tier", tier: 0 });
    const resets = node.port.ofType("reset").length;
    audio.setHeld(false, "pause");
    expect(audio.getStatus().held).toBe(false);
    expect(node.port.last("tier")).toEqual({ type: "tier", tier: 1 });
    expect(node.port.ofType("reset")).toHaveLength(resets + 1);
  });

  it("plays the tire cue alone, and switching engine sound off keeps it", async () => {
    const { audio } = create();
    audio.setTireCue(true, 0.4);
    const node = await booted();
    expect(node.port.last("gains")).toMatchObject({ master: 1, engine: 0, tire: 0.4 });
    expect(audio.getStatus()).toMatchObject({ mode: "tire-only", enabled: false, effective: "low" });
    audio.setTireSlipWatts(900);
    expect(node.port.last("tire")).toEqual({ type: "tire", watts: 900 });

    audio.setEnabled(true);
    expect(node.port.last("gains")).toMatchObject({ master: 0.7, engine: 0.8, tire: 0.4 });
    audio.setEnabled(false);
    expect(node.disconnect).not.toHaveBeenCalled();
    expect(node.port.last("gains")).toMatchObject({ master: 1, engine: 0, tire: 0.4 });
    audio.setTireCue(false, 0.4);
    expect(node.disconnect).toHaveBeenCalled();
  });

  it("arms an unlock rather than starting when the tire cue is restored outside a gesture", async () => {
    const target = new EventTarget();
    const { audio } = create({ inGesture: false, unlockTarget: target });
    audio.setTireCue(true, 0.5);
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(audio.getStatus().tireMessage).toMatch(/next click/);
    target.dispatchEvent(new Event("keydown"));
    await booted();
  });

  it("publishes 60 Hz snapshots from 120 Hz steps, never decimates a light-off, and rebases on a rewind", async () => {
    const { audio } = create();
    audio.setEnabled(true);
    const node = await booted();
    const { adapter, reading } = fakeAdapter();
    audio.attachAdapter(adapter);

    let snapshots = 0;
    const events: number[] = [];
    let consumed = 0;
    const drain = () => {
      const batches = node.port.ofType("batch");
      for (; consumed < batches.length; consumed += 1) {
        const buffer = batches[consumed].buffer as ArrayBuffer;
        const view = new Float64Array(buffer);
        snapshots += view[0];
        for (let e = 0; e < view[1]; e += 1) events.push(view[EVENT_BASE + e * AUDIO_EVENT_SIZE]);
        node.port.deliver({ type: "recycle", buffer });
      }
    };
    for (let i = 0; i <= 120; i += 1) {
      reading.simTimeS = 10 + i / 120;
      // Light-off on an odd step, which the 60 Hz decimation skips.
      if (i === 3) { reading.combustion = true; reading.fuelFlowPps = 0.01; }
      audio.publishStep();
      drain();
    }
    expect(node.port.ofType("epoch")[0]).toMatchObject({ simTimeS: 10 });
    expect(snapshots).toBe(61);
    expect(events.filter(type => type === AUDIO_EVENT.LIGHT_OFF)).toHaveLength(1);
    // The panel's live readout shows what the core is hearing.
    expect(audio.getStatus().engine).toMatchObject({ n1Pct: 20, n2Pct: 45, combustion: true, running: false });
    node.port.deliver({ type: "stats", values: Array.from({ length: 20 }, (_, i) => (i === 19 ? 3 : i === 4 ? 1 : 0)) });
    expect(audio.getStatus().core).toMatchObject({ epoch: 3, resyncs: 1 });

    const epochs = node.port.ofType("epoch").length;
    const resets = node.port.ofType("reset").length;
    reading.simTimeS = 0.5;
    audio.publishStep();
    expect(node.port.ofType("reset")).toHaveLength(resets + 1);
    expect(node.port.ofType("epoch")).toHaveLength(epochs + 1);
    expect(node.port.last("epoch")).toMatchObject({ simTimeS: 0.5 });
  });

  it("drops to Off on a processor fault and restarts only when the pilot switches sound again", async () => {
    const target = new EventTarget();
    const { audio } = create({ unlockTarget: target });
    audio.setEnabled(true);
    const node = await booted();
    node.onprocessorerror?.();
    expect(audio.getStatus().effective).toBe("off");
    expect(audio.getStatus().message).toMatch(/processor fault/);
    target.dispatchEvent(new Event("pointerdown"));
    expect(FakeAudioContext.instances).toHaveLength(1);
    audio.setEnabled(false);
    audio.setEnabled(true);
    expect(FakeAudioContext.instances).toHaveLength(2);
    await booted(2);
  });

  it("installs a bank into the running core, yet a bank alone does not admit High", async () => {
    const { audio } = create();
    audio.setEnabled(true);
    const node = await booted();
    expect(audio.getStatus().availability.high.state).toBe("pack-unavailable");
    // ORIGINAL SYNTHETIC FIXTURE: two short noise bands, not a recording.
    const bands = [0, 1].map((index) => ({
      index, samples: new Float32Array(480).fill(0.01 * (index + 1)), n1: 0.5, exterior: index as 0 | 1,
    }));
    const installing = audio.installBank(bands);
    expect(node.port.ofType("bandClear")).toHaveLength(1);
    for (const message of node.port.ofType("band")) {
      node.port.deliver({ type: "band", index: message.index, accepted: true });
    }
    await expect(installing).resolves.toBe(true);
    expect(bands[1].samples[0]).toBeCloseTo(0.02);
    // With no qualified profile, High moves from "Audio pack unavailable" to "Not yet validated".
    expect(audio.getStatus().availability.high.state).toBe("unvalidated");
    audio.setEnabled(false);
    expect(audio.getStatus().availability.high.state).toBe("pack-unavailable");
  });

  it("clears a partially accepted bank", async () => {
    const { audio } = create();
    audio.setEnabled(true);
    const node = await booted();
    const installing = audio.installBank([
      { index: 0, samples: new Float32Array(10), n1: 0.2, exterior: 0 },
      { index: 1, samples: new Float32Array(10), n1: 0.8, exterior: 0 },
    ]);
    node.port.deliver({ type: "band", index: 0, accepted: true });
    node.port.deliver({ type: "band", index: 1, accepted: false });
    await expect(installing).resolves.toBe(false);
    expect(node.port.ofType("bandClear")).toHaveLength(2);
    expect(audio.getStatus().availability.high.state).toBe("pack-unavailable");
  });

  it("drops a tier on a counted underrun and keeps the downgrade until re-test", async () => {
    const { audio, store } = create();
    audio.setEnabled(true);
    const node = await booted();
    const context = FakeAudioContext.instances[0] as FakeAudioContext & { playbackStats: { underrunEvents: number } };
    context.playbackStats = { underrunEvents: 0 };
    node.port.deliver({ type: "stats", values: new Array(20).fill(0) });
    expect(audio.getStatus().stats).toMatch(/underruns 0 .*underrun counter not validated/);
    context.playbackStats.underrunEvents = 3;
    node.port.deliver({ type: "stats", values: new Array(20).fill(0) });
    // Low was the effective tier, so the next step down is Off: "Low eventually mutes".
    expect(store.settings).toMatchObject({ requested: "off", downgradedFrom: "auto" });
    expect(audio.getStatus().message).toMatch(/dropped to off: 3 output underruns were counted/);
    expect(node.disconnect).toHaveBeenCalled();
    audio.retest();
    expect(store.settings).toMatchObject({ requested: "auto", downgradedFrom: null });
    await booted(2);
  });

  it("keeps the context running through a brief hold and suspends only when the hold persists", async () => {
    const { audio } = create({ suspendDelayMs: 30 });
    audio.setEnabled(true);
    const node = await booted();
    const context = FakeAudioContext.instances[0];
    audio.setHeld(true, "pause");
    expect(node.port.last("tier")).toEqual({ type: "tier", tier: 0 });
    audio.setHeld(false, "pause");
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(context.suspend).not.toHaveBeenCalled();
    audio.setHeld(true, "pause");
    await vi.waitFor(() => expect(context.suspend).toHaveBeenCalledOnce());
  });

  it("silences only the tire cue on a tire hold", async () => {
    const { audio } = create();
    audio.setTireCue(true, 0.5);
    audio.setEnabled(true);
    const node = await booted();
    const tiers = node.port.ofType("tier").length;
    audio.setTireHeld(true);
    expect(node.port.last("tire")).toEqual({ type: "tire", watts: 0 });
    audio.setTireSlipWatts(5_000);
    expect(node.port.last("tire")).toEqual({ type: "tire", watts: 0 });
    expect(node.port.ofType("tier")).toHaveLength(tiers);
    expect(audio.getStatus().held).toBe(false);
    audio.setTireHeld(false);
    audio.setTireSlipWatts(5_000);
    expect(node.port.last("tire")).toEqual({ type: "tire", watts: 5_000 });
  });

  it("runs Med only while unvalidated tiers are allowed this session, and never saves that", async () => {
    const { audio, store } = create({ stored: { requested: "med" } });
    audio.setEnabled(true);
    const node = await booted();
    expect(node.port.last("tier")).toEqual({ type: "tier", tier: 1 });
    audio.setAllowUnvalidated(true);
    expect(node.port.last("tier")).toEqual({ type: "tier", tier: 2 });
    expect(audio.getStatus()).toMatchObject({ effective: "med", allowUnvalidated: true });
    expect(JSON.stringify(store.settings)).not.toMatch(/unvalidated/i);
    audio.setAllowUnvalidated(false);
    expect(node.port.last("tier")).toEqual({ type: "tier", tier: 1 });
  });

  it("restores a downgraded request only on an explicit re-test", () => {
    const { audio, store } = create({ stored: { requested: "low", downgradedFrom: "med" } });
    expect(store.settings).toMatchObject({ requested: "low", downgradedFrom: "med" });
    audio.retest();
    expect(store.settings).toMatchObject({ requested: "med", downgradedFrom: null });
  });

  it("disposes the telemetry reader before closing the context, exactly once", async () => {
    const { audio } = create();
    audio.setEnabled(true);
    await booted();
    const { adapter, dispose } = fakeAdapter();
    audio.attachAdapter(adapter);
    audio.dispose();
    audio.dispose();
    expect(log).toEqual(["adapter.dispose", "context.close"]);
    expect(dispose).toHaveBeenCalledOnce();
  });
});
