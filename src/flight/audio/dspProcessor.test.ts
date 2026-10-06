import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { acousticProfileValues, getAircraftAudioProfile } from "./aircraftAudioProfiles";

/** Real plain-JS wrapper + shipped WASM in Node, not an audio-thread/device check. */
async function create(initial?: number[]) {
  const module = await WebAssembly.compile(readFileSync("src/flight/audio/dsp/audio-dsp.wasm"));
  let Processor: new (options: object) => {
    ready: boolean;
    failure: string | null;
    exports: { memory: WebAssembly.Memory; osfs_audio_profile_ptr(): number; osfs_audio_profile_size(): number };
    onMessage(event: { data: object }): void;
    process(inputs: unknown[], outputs: Float32Array[][]): boolean;
  };
  const messages: object[] = [];
  class AudioWorkletProcessor {
    port = { onmessage: null, postMessage(message: object) { messages.push(message); } };
  }
  runInNewContext(readFileSync("src/flight/audio/worklet/dspProcessor.js", "utf8"), {
    AudioWorkletProcessor, WebAssembly, Float32Array, Float64Array, Int32Array,
    sampleRate: 48_000, currentFrame: 0,
    registerProcessor(_name: string, implementation: typeof Processor) { Processor = implementation; },
  });
  const processor = new Processor!({ processorOptions: { module, initial: {
    profile: initial, tier: 1,
    gains: { master: 0.7, engine: 0.8, airframe: 0.6, tire: 0, reducedRange: 0, afterburner: 0.5 },
  } } });
  return { processor, messages };
}

describe("real worklet setup wrapper with actual WASM (Node, no device qualification)", () => {
  it("applies F135 setup before the first quantum and restores FJ33 on replacement", async () => {
    const fighter = acousticProfileValues(getAircraftAudioProfile("f-35b"));
    const { processor, messages } = await create(fighter);
    expect(processor.ready).toBe(true);
    expect(messages).toContainEqual({ type: "ready", sampleRate: 48_000 });
    const setup = () => [...new Float64Array(processor.exports.memory.buffer,
      processor.exports.osfs_audio_profile_ptr(), processor.exports.osfs_audio_profile_size())];
    expect(setup()).toEqual(fighter);
    const output = [[new Float32Array(128), new Float32Array(128)]];
    expect(processor.process([], output)).toBe(true);
    expect(output[0][0].every(Number.isFinite)).toBe(true);
    processor.onMessage({ data: { type: "gains", master: 0.7, engine: 0.8,
      airframe: 0.6, tire: 0, reducedRange: 0, afterburner: 0 } });
    expect(setup()).toEqual(fighter);
    expect(processor.process([], output)).toBe(true);
    processor.onMessage({ data: { type: "profile", values: acousticProfileValues() } });
    expect(setup()).toEqual(acousticProfileValues());
  });

  it("refuses a mismatched setup ABI during boot", async () => {
    const { processor, messages } = await create([1, 2, 3]);
    expect(processor.ready).toBe(false);
    expect(processor.failure).toMatch(/profile ABI mismatch/);
    expect(messages).toContainEqual({ type: "failed", reason: "Acoustic profile ABI mismatch" });
  });

  it("stops output rather than retaining the old engine after an invalid replacement", async () => {
    const { processor, messages } = await create(acousticProfileValues());
    const invalid = acousticProfileValues(getAircraftAudioProfile("f-35b"));
    invalid[0] = 100;
    processor.onMessage({ data: { type: "profile", values: invalid } });
    expect(processor.ready).toBe(false);
    expect(messages).toContainEqual({ type: "failed", reason: "Invalid acoustic profile" });
    const output = [[new Float32Array(128).fill(1), new Float32Array(128).fill(1)]];
    expect(processor.process([], output)).toBe(false);
    expect(output[0][0].every(value => value === 0)).toBe(true);
  });

  it("echoes the bank request identity with the actual native allocation result", async () => {
    const { processor, messages } = await create(acousticProfileValues());
    processor.onMessage({ data: { type: "band", requestId: 41, index: 0, frames: 10, n1: 0.5,
      exterior: 0, samples: new Float32Array(10).buffer } });
    expect(messages).toContainEqual({ type: "band", requestId: 41, index: 0, accepted: true });
    processor.onMessage({ data: { type: "band", requestId: 42, index: 6, frames: 10, n1: 0.5,
      exterior: 0, samples: new Float32Array(10).buffer } });
    expect(messages).toContainEqual({ type: "band", requestId: 42, index: 6, accepted: false });
  });
});
