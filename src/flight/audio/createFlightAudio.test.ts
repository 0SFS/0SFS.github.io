import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FreeCamera, NullEngine, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { AUDIO_BATCH_HEADER, AUDIO_BATCH_SNAPSHOTS, AUDIO_EVENT, AUDIO_EVENT_SIZE, AUDIO_SNAPSHOT_SIZE, AUDIO_SNAPSHOT_SLOT, AVAILABILITY } from "./audioSnapshot";
import { flightParameterDefaults } from "../settings/flightParameters";
import { audioSettingsValues, createAudioSettingsStore, DEFAULT_AUDIO_SETTINGS, patchAudioSettings } from "./audioSettings";
import { createFlightAudio, type FlightAudioHandle } from "./createFlightAudio";
import type { AudioAdapter, AudioAdapterReading } from "./jsbsimAudioAdapter";
import { acousticProfileValues, getAircraftAudioProfile } from "./aircraftAudioProfiles";
import type { AudioBankInstallBand, AudioBankInstallation } from "./audioBank";
import { QUALIFIED_PROFILES, type AudioQualificationContext, type QualifiedProfile } from "./audioQuality";

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

function fakeAdapter(logDisposal = true) {
  const reading: AudioAdapterReading = {
    simTimeS: 0, availability: 0, n1Pct: 20, n2Pct: 45, thrustLbf: 0, fuelFlowPps: 0, throttleNorm: 0,
    combustion: false, running: false, starter: true, cutoff: true, kias: 0, gearNorm: 1, flapNorm: 0,
    velocity: [0, 0, 0], soundSpeedMps: 343, augmentation: false,
  };
  const dispose = vi.fn(() => { if (logDisposal) log.push("adapter.dispose"); });
  const adapter: AudioAdapter = {
    read: () => reading,
    diagnostics: { missing: [], combustionSource: "fuel-flow", sourceOffset: [0, 2, -2],
      profile: getAircraftAudioProfile("cirrus-vision-jet"), telemetryAvailable: true,
      engineIndex: 0, sourceId: "main-exhaust" },
    dispose,
  };
  return { adapter, reading, dispose };
}

const handles: FlightAudioHandle[] = [];
const qualificationRecords = QUALIFIED_PROFILES as QualifiedProfile[];
const realQualificationCount = qualificationRecords.length;
function create(options: {
  stored?: object; inGesture?: boolean; unlockTarget?: EventTarget; loadWasm?: () => Promise<BufferSource>;
  suspendDelayMs?: number;
  qualificationContext?: () => AudioQualificationContext | undefined;
} = {}) {
  const store = createAudioSettingsStore(savedParameters(options.stored));
  const audio = createFlightAudio({
    settings: store,
    suspendDelayMs: options.suspendDelayMs,
    qualificationContext: options.qualificationContext,
    unlockTarget: options.unlockTarget ?? null,
    loadWasm: options.loadWasm ?? (async () => wasm),
    workletModuleUrl: "dspProcessor.js",
    capabilityOverrides: { audioWorklet: true, webAssembly: true },
    inGesture: () => options.inGesture ?? true,
  });
  handles.push(audio);
  audio.attachAdapter(fakeAdapter(false).adapter);
  return { audio, store };
}

function bank(bands: readonly AudioBankInstallBand[]): AudioBankInstallation {
  return { engineDefinitionId: "fj33-reference", rendererId: "procedural-jet-v1", bands };
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
  qualificationRecords.splice(realQualificationCount);
});

describe("flight audio lifecycle (synthetic fakes)", () => {
  it.each([false, true])("checks qualification against the compiled bytes (matching hash: %s)", async matching => {
    // SYNTHETIC qualification fixture, removed after this case; no device claim.
    const identified: AudioQualificationContext = {
      device: "fixture", browserBuild: "fixture", osBuild: "fixture", outputRoute: "fixture",
      sampleRateHz: 48_000, transport: "port", engineDefinitionId: "fj33-reference", rendererId: "procedural-jet-v1",
      dspSha256: matching ? createHash("sha256").update(wasm).digest("hex") : "0".repeat(64),
    };
    qualificationRecords.push({ ...identified, tier: "high", evidence: "synthetic unit-test record only" });
    const { audio } = create({ stored: { requested: "auto" }, qualificationContext: () => identified });
    audio.setEnabled(true);
    await booted();
    expect(audio.getStatus().effective).toBe(matching ? "high" : "low");
    expect(audio.getStatus().availability.high.state).toBe(matching ? "available" : "unvalidated");
  });

  it("applies the saved afterburner mix at boot and live without replacing setup or native augmentation", async () => {
    const { audio, store } = create({ stored: { afterburnerVolume: 0.3, masterVolume: 3 } });
    const { adapter, reading } = fakeAdapter();
    adapter.diagnostics.profile = getAircraftAudioProfile("f-35b");
    Object.assign(reading, { augmentation: true, availability: AVAILABILITY.AUGMENTATION });
    audio.attachAdapter(adapter);
    audio.setEnabled(true);
    const node = await booted();
    expect(node.options.processorOptions.initial).toMatchObject({ gains: { afterburner: 0.3, master: 3 } });
    const profileMessages = node.port.ofType("profile").length;
    const resets = node.port.ofType("reset").length;
    audio.patchSettings({ afterburnerVolume: 0, masterVolume: 8 });
    expect(node.port.last("gains")).toMatchObject({ afterburner: 0, engine: 0.8, airframe: 0.6, master: 8 });
    audio.publishStep();
    const snapshot = new Float64Array(node.port.last("batch")!.buffer as ArrayBuffer);
    expect(snapshot[AUDIO_BATCH_HEADER + AUDIO_SNAPSHOT_SLOT.augmentation]).toBe(1);
    store.update({ afterburnerVolume: 0.75, engineVolume: 3.5, masterVolume: 6 });
    audio.followSettings();
    expect(node.port.last("gains")).toMatchObject({ afterburner: 0.75, engine: 3.5, master: 6 });
    audio.patchSettings({ engineMuted: true });
    expect(node.port.last("gains")).toMatchObject({ engine: 0, afterburner: 0.75 });
    expect(node.port.ofType("profile")).toHaveLength(profileMessages);
    expect(node.port.ofType("reset")).toHaveLength(resets);
    expect(FakeWorkletNode.instances).toHaveLength(1);
  });

  it("uses the cockpit by default and follows live and imported listener blends in published poses", async () => {
    const engine = new NullEngine();
    try {
      const scene = new Scene(engine);
      const camera = new FreeCamera("chase", new Vector3(0, 0, -100), scene);
      const cockpitCamera = new FreeCamera("cockpit", new Vector3(0, 0, 5), scene);
      const aircraftRoot = new TransformNode("aircraft", scene);
      const { audio, store } = create();
      const { adapter, reading } = fakeAdapter();
      audio.attachAdapter(adapter);
      audio.setEnabled(true);
      const node = await booted();
      const publish = () => {
        audio.updateView({ camera, cockpitCamera, aircraftRoot, exterior: 1, heightAboveGroundM: null });
        audio.publishStep();
        reading.simTimeS += 1 / 60;
        return new Float64Array(node.port.last("batch")!.buffer as ArrayBuffer);
      };
      const cockpit = publish();
      expect(cockpit[AUDIO_BATCH_HEADER + AUDIO_SNAPSHOT_SLOT.sourceZ]).toBeCloseTo(-7);
      expect(cockpit[AUDIO_BATCH_HEADER + AUDIO_SNAPSHOT_SLOT.exterior]).toBe(0);
      audio.patchSettings({ listenerCockpitBlend: 0 });
      const chase = publish();
      expect(chase[AUDIO_BATCH_HEADER + AUDIO_SNAPSHOT_SLOT.sourceZ]).toBeCloseTo(98);
      expect(chase[AUDIO_BATCH_HEADER + AUDIO_SNAPSHOT_SLOT.exterior]).toBe(1);
      store.update({ listenerCockpitBlend: 0.5 });
      audio.followSettings();
      const middle = publish();
      expect(middle[AUDIO_BATCH_HEADER + AUDIO_SNAPSHOT_SLOT.sourceZ]).toBeCloseTo(45.5);
      expect(middle[AUDIO_BATCH_HEADER + AUDIO_SNAPSHOT_SLOT.exterior]).toBe(0.5);
    } finally {
      engine.dispose();
    }
  });

  it("configures F135 separately and transports native engine telemetry", async () => {
    const { audio } = create();
    audio.setEnabled(true);
    const node = await booted();
    const { adapter, reading } = fakeAdapter();
    adapter.diagnostics.profile = getAircraftAudioProfile("f-35b");
    Object.assign(reading, { simTimeS: 0, n1Pct: 75, n2Pct: 85, thrustLbf: 14_000, fuelFlowPps: 4, combustion: true, running: true });
    audio.attachAdapter(adapter);
    audio.publishStep();
    const view = new Float64Array(node.port.last("batch")!.buffer as ArrayBuffer);
    expect(view[AUDIO_BATCH_HEADER + AUDIO_SNAPSHOT_SLOT.thrustLbf]).toBe(14_000);
    expect(view[AUDIO_BATCH_HEADER + AUDIO_SNAPSHOT_SLOT.fuelFlowPps]).toBe(4);
    expect(view[AUDIO_BATCH_HEADER + AUDIO_SNAPSHOT_SLOT.n1Pct]).toBe(75);
    expect(audio.getStatus().engine).toMatchObject({ n1Pct: 75, n2Pct: 85, fuelFlowPps: 4 });
    expect(audio.getStatus().telemetry).toMatchObject({ profileLabel: "Approximate F135 procedural sound" });
    expect(node.port.last("profile")).toEqual({ type: "profile", values: acousticProfileValues(adapter.diagnostics.profile) });
    audio.attachAdapter(fakeAdapter().adapter);
    expect(node.port.last("profile")).toEqual({ type: "profile", values: acousticProfileValues() });
  });

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
    expect(node.options.processorOptions.initial).toMatchObject({ tier: 2, gains: { master: 2, engine: 0.8 } });
    expect(node.options.processorOptions.initial).toMatchObject({ profile: acousticProfileValues() });
    // Med is the default, and runs although no device has qualified it.
    expect(node.port.last("tier")).toEqual({ type: "tier", tier: 2 });
    expect(node.port.last("gains")).toMatchObject({ master: 2, engine: 0.8, airframe: 0.6, tire: 0 });
    expect(audio.getStatus()).toMatchObject({ effective: "med", requested: "med", mode: "sound", gestureLocked: false });
  });

  it("runs Med the moment it is chosen, with no further step, and still calls it unvalidated", async () => {
    const { audio, store } = create({ stored: { requested: "low" } });
    audio.setEnabled(true);
    const node = await booted();
    expect(node.port.last("tier")).toEqual({ type: "tier", tier: 1 });
    audio.setQuality("med");
    expect(node.port.last("tier")).toEqual({ type: "tier", tier: 2 });
    expect(audio.getStatus()).toMatchObject({ requested: "med", effective: "med" });
    expect(audio.getStatus().availability.med.state).toBe("unvalidated");
    expect(store.settings.requested).toBe("med");
  });

  it("keeps Auto at Low while no device has qualified a higher tier", async () => {
    const { audio } = create({ stored: { requested: "auto" } });
    audio.setEnabled(true);
    const node = await booted();
    expect(node.port.last("tier")).toEqual({ type: "tier", tier: 1 });
    expect(audio.getStatus()).toMatchObject({ requested: "auto", effective: "low" });
  });

  it("waits for a gesture instead of autoplaying a restored preference", async () => {
    const target = new EventTarget();
    const { audio } = create({ stored: { enabled: true }, unlockTarget: target, inGesture: false });
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
    expect(node.port.last("tier")).toEqual({ type: "tier", tier: 2 });
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
    expect(node.port.last("gains")).toMatchObject({ master: 2, engine: 0.8, tire: 0.4 });
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

  it("publishes a copied native source axis only while its pose marks it available", async () => {
    const { audio } = create();
    audio.setEnabled(true);
    const node = await booted();
    const { adapter, reading } = fakeAdapter();
    audio.attachAdapter(adapter);
    const axis: [number, number, number] = [0, 0, -1];
    reading.sourceAxis = [0, 0, -1];
    const next = { source: [0, 0, 2] as [number, number, number], sourceAxis: axis, sourceAxisValid: true,
      sourceVelocity: [0, 0, 0] as [number, number, number], listenerVelocity: [0, 0, 0] as [number, number, number],
      exterior: 1, groundReflectionM: -1, valid: true };
    audio.setListenerPose(next);
    axis[2] = 1;
    audio.publishStep();
    let buffer = node.port.last("batch")!.buffer as ArrayBuffer;
    let snapshot = new Float64Array(buffer);
    expect(snapshot[AUDIO_BATCH_HEADER + AUDIO_SNAPSHOT_SLOT.sourceAxisZ]).toBe(-1);
    expect(snapshot[AUDIO_BATCH_HEADER + AUDIO_SNAPSHOT_SLOT.availability] & AVAILABILITY.SOURCE_AXIS).toBe(AVAILABILITY.SOURCE_AXIS);
    node.port.deliver({ type: "recycle", buffer });
    audio.setListenerPose({ ...next, sourceAxisValid: false });
    reading.simTimeS = 1 / 60;
    audio.publishStep();
    buffer = node.port.last("batch")!.buffer as ArrayBuffer;
    snapshot = new Float64Array(buffer);
    expect(snapshot[AUDIO_BATCH_HEADER + AUDIO_SNAPSHOT_SLOT.availability] & AVAILABILITY.SOURCE_AXIS).toBe(0);
    node.port.deliver({ type: "recycle", buffer });
    // A native observer becoming unavailable cannot reuse the prior frame's axis.
    audio.setListenerPose(next);
    reading.sourceAxis = [Number.NaN, 0, -1];
    reading.simTimeS += 1 / 60;
    audio.publishStep();
    buffer = node.port.last("batch")!.buffer as ArrayBuffer;
    snapshot = new Float64Array(buffer);
    expect(snapshot[AUDIO_BATCH_HEADER + AUDIO_SNAPSHOT_SLOT.availability] & AVAILABILITY.SOURCE_AXIS).toBe(0);
    node.port.deliver({ type: "recycle", buffer });
    reading.sourceAxis = [0, 0, -1];
    audio.beginEpoch();
    reading.simTimeS += 1 / 60;
    audio.publishStep();
    snapshot = new Float64Array(node.port.last("batch")!.buffer as ArrayBuffer);
    expect(snapshot[AUDIO_BATCH_HEADER + AUDIO_SNAPSHOT_SLOT.availability] & (AVAILABILITY.SOURCE_AXIS | AVAILABILITY.POSE)).toBe(0);
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

  it.each(["cirrus-vision-jet", "f-35b"] as const)("runs procedural High for %s without installing a sample bank", async (aircraft) => {
    const { audio } = create({ stored: { requested: "high" } });
    const { adapter } = fakeAdapter();
    adapter.diagnostics.profile = getAircraftAudioProfile(aircraft);
    audio.attachAdapter(adapter);
    audio.setEnabled(true);
    const node = await booted();
    expect(audio.getStatus()).toMatchObject({ requested: "high", effective: "high",
      availability: { high: { state: "unvalidated" } } });
    expect(node.port.last("tier")).toMatchObject({ tier: 3 });
    expect(node.port.ofType("band")).toHaveLength(0);
    audio.setQuality("med");
    expect(audio.getStatus().effective).toBe("med");
    audio.setQuality("auto");
    expect(audio.getStatus().effective).toBe("low");
  });

  it("rejects legacy full-recording banks without changing procedural High or transferring PCM", async () => {
    const { audio } = create({ stored: { requested: "high" } });
    audio.setEnabled(true);
    const node = await booted();
    const installation = bank([{ index: 0, samples: new Float32Array(480), n1: 0.5, exterior: 0 }]);
    for (const candidate of [installation, { ...installation, engineDefinitionId: "f135-approximation" },
      { ...installation, rendererId: "another-binary" }]) {
      await expect(audio.installBank(candidate)).resolves.toBe(false);
    }
    node.port.deliver({ type: "band", index: 0, requestId: 1, accepted: true });
    expect(node.port.ofType("band")).toHaveLength(0);
    expect(audio.getStatus()).toMatchObject({ effective: "high", availability: { high: { state: "unvalidated" } } });
  });

  it("retains procedural High when replacing supported engines, with no recording readiness to inherit", async () => {
    const { audio } = create({ stored: { requested: "high" } });
    audio.setEnabled(true);
    const node = await booted();
    const { adapter } = fakeAdapter();
    adapter.diagnostics.profile = getAircraftAudioProfile("f-35b");
    audio.attachAdapter(adapter);
    expect(node.port.ofType("bandClear")).toHaveLength(1);
    expect(node.port.ofType("band")).toHaveLength(0);
    expect(audio.getStatus().effective).toBe("high");
  });

  it("continues reading after unavailable required telemetry and recovers engine publication", async () => {
    const { audio } = create();
    const { adapter, reading } = fakeAdapter();
    const read = vi.fn(() => reading);
    adapter.read = read;
    audio.attachAdapter(adapter);
    audio.setEnabled(true);
    const node = await booted();
    Object.assign(reading, { availability: AVAILABILITY.N1 | AVAILABILITY.N2 | AVAILABILITY.THRUST
      | AVAILABILITY.FUEL_FLOW | AVAILABILITY.COMBUSTION | AVAILABILITY.RUNNING,
    combustion: true, running: true, fuelFlowPps: 0.2, thrustLbf: 1000 });
    adapter.diagnostics.telemetryAvailable = false;
    audio.publishStep();
    let view = new Float64Array(node.port.last("batch")!.buffer as ArrayBuffer);
    expect(view[AUDIO_BATCH_HEADER + AUDIO_SNAPSHOT_SLOT.availability] & AVAILABILITY.COMBUSTION).toBe(0);
    expect(audio.isEngineActive()).toBe(false);
    adapter.diagnostics.telemetryAvailable = true;
    reading.simTimeS = 1 / 60;
    audio.publishStep();
    view = new Float64Array(node.port.last("batch")!.buffer as ArrayBuffer);
    expect(view[AUDIO_BATCH_HEADER + AUDIO_SNAPSHOT_SLOT.availability] & AVAILABILITY.COMBUSTION).toBe(AVAILABILITY.COMBUSTION);
    expect(read).toHaveBeenCalledTimes(2);
    expect(audio.isEngineActive()).toBe(true);
  });

  it("refuses an engine without explicit acoustic setup instead of using the reference sound", async () => {
    const { audio } = create();
    const { adapter, dispose } = fakeAdapter();
    adapter.diagnostics.profile = undefined;
    audio.setEnabled(true);
    audio.attachAdapter(adapter);
    expect(FakeWorkletNode.instances).toHaveLength(0);
    expect(audio.getStatus().message).toMatch(/explicit definition/);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("drops a tier on a counted underrun and keeps the downgrade until re-test", async () => {
    const { audio, store } = create({ stored: { requested: "auto" } });
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

  it("drops the default Med to Low on a counted underrun, and Low keeps playing until re-test", async () => {
    const { audio, store } = create();
    audio.setEnabled(true);
    const node = await booted();
    const context = FakeAudioContext.instances[0] as FakeAudioContext & { playbackStats: { underrunEvents: number } };
    context.playbackStats = { underrunEvents: 0 };
    node.port.deliver({ type: "stats", values: new Array(20).fill(0) });
    context.playbackStats.underrunEvents = 1;
    node.port.deliver({ type: "stats", values: new Array(20).fill(0) });
    expect(store.settings).toMatchObject({ requested: "low", downgradedFrom: "med" });
    expect(node.port.last("tier")).toEqual({ type: "tier", tier: 1 });
    expect(node.disconnect).not.toHaveBeenCalled();
    audio.retest();
    expect(store.settings).toMatchObject({ requested: "med", downgradedFrom: null });
    expect(node.port.last("tier")).toEqual({ type: "tier", tier: 2 });
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
