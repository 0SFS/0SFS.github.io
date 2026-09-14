import { describe, expect, it, vi } from "vitest";
import { tireAudioParameters } from "./createTireAudio";
import { createTireAudioGraph, fillTireNoise } from "./legacyTireAudioGraph";

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
  sampleRate = 1_000;
  currentTime = 0;
  destination = new FakeNode();
  nodes: FakeNode[] = [];
  gains: FakeNode[] = [];
  sources: FakeNode[] = [];
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

describe("legacy tire graph (benchmark reference only)", () => {
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
