import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTireAudio, createTireAudioGraph, fillTireNoise, tireAudioParameters } from "./createTireAudio";

class FakeParameter {
  value = 0;
  cancelScheduledValues = vi.fn();
  setTargetAtTime = vi.fn((value: number) => { this.value = value; });
  setValueAtTime = vi.fn((value: number) => { this.value = value; });
}

class FakeNode {
  buffer: unknown = null;
  loop = false;
  type = "";
  Q = new FakeParameter();
  frequency = new FakeParameter();
  gain = new FakeParameter();
  connect = vi.fn((destination: FakeNode) => destination);
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  sampleRate = 1_000;
  currentTime = 0;
  state: AudioContextState = "suspended";
  destination = new FakeNode();
  nodes: FakeNode[] = [];
  gains: FakeNode[] = [];
  sources: FakeNode[] = [];
  resume = vi.fn(async () => { this.state = "running"; });
  suspend = vi.fn(async () => { this.state = "suspended"; });
  close = vi.fn(async () => { this.state = "closed"; });
  constructor() { FakeAudioContext.instances.push(this); }
  createBuffer(_channels: number, length: number) {
    const samples = new Float32Array(length);
    return { getChannelData: () => samples };
  }
  createNode() {
    const node = new FakeNode();
    this.nodes.push(node);
    return node;
  }
  createGain() {
    const node = this.createNode();
    this.gains.push(node);
    return node;
  }
  createBiquadFilter() { return this.createNode(); }
  createBufferSource() {
    const node = this.createNode();
    this.sources.push(node);
    return node;
  }
  createOscillator() { return this.createBufferSource(); }
}

class FakeDocument extends EventTarget {
  visibilityState = "visible";
  setHidden(hidden: boolean) {
    this.visibilityState = hidden ? "hidden" : "visible";
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("tire audio synthesis", () => {
  it("has no cue at pure rolling, bounds loud impacts, and rejects invalid power", () => {
    for (const power of [0, 2, -1, NaN, Infinity, -Infinity]) {
      expect(tireAudioParameters(power).noiseGain).toBe(0);
      expect(tireAudioParameters(power).squealGain).toBe(0);
    }
    const soft = tireAudioParameters(100);
    const loud = tireAudioParameters(15_000);
    expect(soft.noiseGain).toBeGreaterThan(0);
    expect(soft.noiseGain).toBeLessThan(loud.noiseGain);
    expect(tireAudioParameters(Number.MAX_VALUE)).toEqual(loud);
    expect(loud.noiseGain + loud.squealGain).toBeLessThan(0.1);
    expect(loud.filterFrequencyHz).toBeLessThan(3_000);
  });

  it("fills finite, bounded, reproducible noise without a DC offset", () => {
    const a = new Float32Array(16_000);
    const b = new Float32Array(a.length);
    const c = new Float32Array(a.length);
    fillTireNoise(a);
    fillTireNoise(b);
    fillTireNoise(c, 123);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a.every((sample) => Number.isFinite(sample) && sample >= -1 && sample <= 1)).toBe(true);
    expect(Math.abs(a.reduce((sum, sample) => sum + sample, 0) / a.length)).toBeLessThan(0.02);
  });

  it("attacks rapidly, releases smoothly, silences immediately, and disposes once", () => {
    const context = new FakeAudioContext();
    const graph = createTireAudioGraph(context as never);
    expect(context.gains.map((node) => node.gain.value)).toEqual([0, 0]);
    graph.update(2_000, 1);
    expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(
      tireAudioParameters(2_000).noiseGain, 1, 0.005,
    );
    graph.update(0, 2);
    expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 2, 0.035);
    graph.silence(3);
    for (const node of context.gains) {
      expect(node.gain.cancelScheduledValues).toHaveBeenLastCalledWith(3);
      expect(node.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 3);
    }
    graph.dispose();
    graph.dispose();
    graph.update(100, 4);
    for (const node of context.sources) expect(node.stop).toHaveBeenCalledTimes(1);
    for (const node of context.nodes) expect(node.disconnect).toHaveBeenCalledTimes(1);
    expect(context.gains.every((node) => node.gain.value === 0)).toBe(true);
  });
});

describe("tire audio lifecycle", () => {
  let page: FakeDocument;
  const audioInstances: ReturnType<typeof createTireAudio>[] = [];
  const create = () => {
    const audio = createTireAudio();
    audioInstances.push(audio);
    return audio;
  };
  beforeEach(() => {
    FakeAudioContext.instances = [];
    page = new FakeDocument();
    vi.stubGlobal("document", page);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("webkitAudioContext", undefined);
  });
  afterEach(() => {
    for (const audio of audioInstances.splice(0)) audio.dispose();
    vi.unstubAllGlobals();
  });

  it("allocates only on enable, unlocks synchronously, and reuses its context", async () => {
    const audio = create();
    audio.update(10_000);
    audio.setPaused(true);
    audio.setPaused(false);
    audio.setEnabled(false);
    expect(FakeAudioContext.instances).toHaveLength(0);
    audio.setEnabled(true);
    const context = FakeAudioContext.instances[0];
    expect(context.resume).toHaveBeenCalledTimes(1);
    await flushPromises();
    audio.update(2_000);
    expect(context.gains[0].gain.value).toBeGreaterThan(0);
    audio.setEnabled(false);
    expect(context.gains.map((node) => node.gain.value)).toEqual([0, 0]);
    expect(context.suspend).toHaveBeenCalledTimes(1);
    audio.update(10_000);
    expect(context.gains.map((node) => node.gain.value)).toEqual([0, 0]);
    audio.setEnabled(true);
    await flushPromises();
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(context.gains.map((node) => node.gain.value)).toEqual([0, 0]);
  });

  it("unlocks during enable while paused without playing sound", async () => {
    const audio = create();
    audio.setPaused(true);
    audio.setEnabled(true);
    const context = FakeAudioContext.instances[0];
    expect(context.resume).toHaveBeenCalledTimes(1);
    audio.update(15_000);
    await flushPromises();
    expect(context.suspend).toHaveBeenCalledTimes(1);
    expect(context.gains.map((node) => node.gain.value)).toEqual([0, 0]);
    audio.setPaused(false);
    await flushPromises();
    audio.update(15_000);
    expect(context.gains[0].gain.value).toBeGreaterThan(0);
  });

  it("immediately silences pause and background tabs, discarding stale slip", async () => {
    const removeListener = vi.spyOn(page, "removeEventListener");
    const audio = create();
    audio.setEnabled(true);
    await flushPromises();
    const context = FakeAudioContext.instances[0];
    for (const setInactive of [
      (inactive: boolean) => audio.setPaused(inactive),
      (inactive: boolean) => page.setHidden(inactive),
    ]) {
      audio.update(15_000);
      expect(context.gains[0].gain.value).toBeGreaterThan(0);
      setInactive(true);
      expect(context.gains.map((node) => node.gain.value)).toEqual([0, 0]);
      audio.update(15_000);
      setInactive(false);
      await flushPromises();
      expect(context.gains.map((node) => node.gain.value)).toEqual([0, 0]);
    }
    audio.dispose();
    audio.dispose();
    const resumes = context.resume.mock.calls.length;
    page.setHidden(true);
    page.setHidden(false);
    audio.setEnabled(true);
    audio.update(15_000);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(context.resume).toHaveBeenCalledTimes(resumes);
    expect(removeListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });

  it("keeps a pending resume silent if disabled, and ignores completion after disposal", async () => {
    const audio = create();
    audio.setEnabled(true);
    await flushPromises();
    const context = FakeAudioContext.instances[0];
    audio.setEnabled(false);
    let finishResume: (() => void) | undefined;
    context.resume.mockImplementation(() => new Promise<void>((resolve) => {
      finishResume = () => { context.state = "running"; resolve(); };
    }));
    audio.setEnabled(true);
    audio.update(15_000);
    audio.setEnabled(false);
    finishResume!();
    await flushPromises();
    expect(context.state).toBe("suspended");
    expect(context.gains.map((node) => node.gain.value)).toEqual([0, 0]);
    audio.setEnabled(true);
    audio.dispose();
    const targetCalls = context.gains[0].gain.setTargetAtTime.mock.calls.length;
    finishResume!();
    await flushPromises();
    expect(context.gains[0].gain.setTargetAtTime).toHaveBeenCalledTimes(targetCalls);
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it("reports unsupported or rejected playback and permits an explicit retry", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const unsupported = create();
    unsupported.setEnabled(true);
    expect(unsupported.getStatus()).toContain("unavailable");
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const audio = create();
    audio.setEnabled(true);
    await flushPromises();
    const context = FakeAudioContext.instances[0];
    audio.setEnabled(false);
    context.resume.mockRejectedValueOnce(new Error("Autoplay denied"));
    audio.setEnabled(true);
    await flushPromises();
    expect(audio.getStatus()).toContain("could not start");
    expect(context.gains.map((node) => node.gain.value)).toEqual([0, 0]);
    audio.setEnabled(false);
    audio.setEnabled(true);
    await flushPromises();
    expect(audio.getStatus()).toBeNull();
    audio.update(NaN);
    expect(context.gains.map((node) => node.gain.value)).toEqual([0, 0]);
  });

  it("cleans up a context when graph construction fails", () => {
    vi.stubGlobal("AudioContext", class extends FakeAudioContext {
      createGain(): FakeNode { throw new Error("Audio resources unavailable"); }
    });
    const audio = create();
    audio.setEnabled(true);
    expect(audio.getStatus()).toContain("could not start");
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalledTimes(1);
  });
});
