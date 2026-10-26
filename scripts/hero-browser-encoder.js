/* Browser-native encoders: frame timestamps come from the scenario, not wall time. */
window.__osfsHeroEncoder = {
  async init(config) {
    this.frames = 0;
    this.failures = [];
    this.outputs = [];
    const choices = [
      { name: 'vp9', codec: 'vp09.00.10.08', bitrate: config.video.vp9BitsPerSecond },
      { name: 'h264', codec: 'avc1.42001f', bitrate: config.video.h264BitsPerSecond, avc: { format: 'avc' } },
    ];
    for (const { name, ...options } of choices) {
      const settings = { ...options, width: config.video.width, height: config.video.height, framerate: config.timeline.fps, latencyMode: 'realtime', bitrateMode: 'variable' };
      const support = await VideoEncoder.isConfigSupported(settings);
      if (!support.supported) throw new Error(`This Chrome cannot encode ${name}.`);
      const output = { name, chunks: [], description: null, config: settings };
      output.encoder = new VideoEncoder({
        error: error => this.failures.push(`${name}: ${error.message}`),
        output: (chunk, metadata) => {
          const bytes = new Uint8Array(chunk.byteLength);
          chunk.copyTo(bytes);
          output.chunks.push({ bytes, timestamp: chunk.timestamp, key: chunk.type === 'key' });
          if (metadata?.decoderConfig?.description) output.description = new Uint8Array(metadata.decoderConfig.description);
        },
      });
      output.encoder.configure(settings);
      this.outputs.push(output);
    }
  },
  async frame(base64, index, fps) {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const frame = new VideoFrame(image, { timestamp: Math.round(index * 1e6 / fps), duration: Math.round(1e6 / fps) });
    try {
      for (const output of this.outputs) {
        output.encoder.encode(frame, { keyFrame: index === 0 });
        if (output.encoder.encodeQueueSize > 4) await output.encoder.flush();
      }
    } finally { frame.close(); image.close(); }
    this.frames++;
    if (this.failures.length) throw new Error(this.failures.join('; '));
  },
  async finish() {
    const base64 = bytes => {
      let text = '';
      for (let start = 0; start < bytes.length; start += 16384) text += String.fromCharCode(...bytes.subarray(start, start + 16384));
      return btoa(text);
    };
    for (const output of this.outputs) await output.encoder.flush();
    if (this.failures.length) throw new Error(this.failures.join('; '));
    return this.outputs.map(output => {
      output.encoder.close();
      return { name: output.name, config: output.config, description: output.description ? base64(output.description) : null,
        chunks: output.chunks.map(chunk => ({ ...chunk, bytes: base64(chunk.bytes) })) };
    });
  },
};
