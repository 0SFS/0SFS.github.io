// Runs inside headless Chromium: the real worklet/dspProcessor.js in a real
// AudioWorkletGlobalScope, instantiating the real audio-dsp.wasm, rendered by an
// OfflineAudioContext. It proves the load path works in a browser; it measures
// no real-time performance and touches no physical output route.

export interface WorkletCheckInput {
  wasmBase64: string;
  workletSource: string;
  sampleRate: number;
  seconds: number;
  tier: number;
  tireWatts: number;
}

export async function runWorkletCheck(input: WorkletCheckInput) {
  const bytes = Uint8Array.from(atob(input.wasmBase64), (char) => char.charCodeAt(0));
  const module = await WebAssembly.compile(bytes);
  const context = new OfflineAudioContext(2, Math.round(input.sampleRate * input.seconds), input.sampleRate);
  const url = URL.createObjectURL(new Blob([input.workletSource], { type: "text/javascript" }));
  await context.audioWorklet.addModule(url);
  const messages: string[] = [];
  const node = new AudioWorkletNode(context, "osfs-dsp", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: {
      module, maxBlockFrames: 128, seed: 0x53463530,
      initial: { tier: input.tier, gains: { master: 1, engine: 1, tire: 1, reducedRange: 0 }, tireWatts: input.tireWatts },
    },
  });
  node.port.onmessage = (event) => messages.push(String((event.data as { type?: string })?.type));
  node.onprocessorerror = () => messages.push("processorerror");
  node.connect(context.destination);
  const rendered = await context.startRendering();
  let peak = 0;
  let nonFinite = 0;
  let energy = 0;
  const half = Math.floor(rendered.length / 2);
  for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
    const data = rendered.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      if (!Number.isFinite(data[i])) { nonFinite += 1; continue; }
      peak = Math.max(peak, Math.abs(data[i]));
      if (i >= half) energy += data[i] * data[i];
    }
  }
  // Let the port deliver the processor's boot message before reporting.
  await new Promise((resolve) => setTimeout(resolve, 50));
  URL.revokeObjectURL(url);
  return {
    sampleRate: rendered.sampleRate,
    frames: rendered.length,
    peak,
    secondHalfRms: Math.sqrt(energy / Math.max(1, (rendered.length - half) * rendered.numberOfChannels)),
    nonFinite,
    messages,
  };
}

(window as unknown as { runWorkletCheck: typeof runWorkletCheck }).runWorkletCheck = runWorkletCheck;
