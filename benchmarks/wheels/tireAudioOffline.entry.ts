import { createTireAudioGraph } from "../../src/flight/audio/createTireAudio";

type AudioComparison = {
  durationSeconds: number;
  sampleRate: number;
  scenarios: {
    name: string;
    samples: { timeSeconds: number; slipPowerWatts: number }[];
    silenceAtSeconds?: number;
  }[];
};

function wavBase64(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const data = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) data.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  data.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, 1, true);
  data.setUint32(24, sampleRate, true);
  data.setUint32(28, sampleRate * 2, true);
  data.setUint16(32, 2, true);
  data.setUint16(34, 16, true);
  text(36, "data");
  data.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    data.setInt16(44 + 2 * i, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function renderTireAudioComparison(comparison: AudioComparison) {
  const results = [];
  for (const scenario of comparison.scenarios) {
    const context = new OfflineAudioContext(
      1, Math.ceil(comparison.durationSeconds * comparison.sampleRate), comparison.sampleRate,
    );
    const graph = createTireAudioGraph(context);
    for (const sample of scenario.samples) graph.update(sample.slipPowerWatts, sample.timeSeconds);
    if (scenario.silenceAtSeconds !== undefined) graph.silence(scenario.silenceAtSeconds);
    const rendered = await context.startRendering();
    const samples = rendered.getChannelData(0);
    const rms = (start: number, end: number) => {
      const segment = samples.subarray(Math.floor(start * samples.length), Math.floor(end * samples.length));
      return Math.sqrt(segment.reduce((sum, sample) => sum + sample * sample, 0) / segment.length);
    };
    results.push({
      name: scenario.name,
      peak: samples.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0),
      rms: rms(0, 1),
      earlyRms: rms(0, 0.05),
      lateRms: rms(0.75, 1),
      finite: samples.every(Number.isFinite),
      wavBase64: wavBase64(samples, rendered.sampleRate),
    });
    graph.dispose();
  }
  return results;
}

Object.assign(window, { renderTireAudioComparison });
