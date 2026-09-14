import { describe, expect, it, vi } from "vitest";
import {
  AUDIO_BANK_MAX_BANDS, bankCacheKey, clearAudioBankDownloads, loadAudioBank, prepareBankForContext,
  sha256Hex, validateAudioBankManifest, type AudioBankBand, type AudioBankManifestV1, type AudioBankStore,
} from "./audioBank";

/**
 * ORIGINAL SYNTHETIC FIXTURES: seeded noise generated here. Not a recording,
 * not a licensed bank, and not something High could ever ship.
 */
function noise(seed: number, frames = 4_800): Float32Array {
  const samples = new Float32Array(frames);
  let state = seed;
  for (let i = 0; i < frames; i += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    samples[i] = (state / 2 ** 32 - 0.5) * 0.2;
  }
  return samples;
}

async function fixture(options: { bands?: number; manifestVersion?: number; sharePayload?: boolean } = {}) {
  const payloads = new Map<string, ArrayBuffer>();
  const bands: AudioBankBand[] = [];
  for (let i = 0; i < (options.bands ?? 2); i += 1) {
    const file = options.sharePayload ? "shared.f32" : `band-${i}.f32`;
    const bytes = noise(options.sharePayload ? 7 : i + 1).buffer as ArrayBuffer;
    payloads.set(file, bytes);
    bands.push({
      file, sha256: await sha256Hex(bytes), bytes: bytes.byteLength, frames: bytes.byteLength / 4,
      sampleRateHz: 48_000, n1: 0.3 + 0.2 * i, view: i % 2 ? "exterior" : "cockpit",
    });
  }
  const manifest: AudioBankManifestV1 = {
    version: 1, id: "synthetic-fixture", revision: "1",
    license: {
      manifestVersion: options.manifestVersion ?? 1, spdx: "AGPL-3.0-only", rightsHolder: "0sfs test fixture",
      source: "generated in audioBank.test.ts", redistribution: true, evidence: "synthetic, no recording",
    },
    bands,
  };
  const fetchBand = vi.fn(async (band: AudioBankBand) => payloads.get(band.file)!.slice(0));
  return { manifest, fetchBand };
}

function memoryStore(): AudioBankStore & { data: Map<string, ArrayBuffer> } {
  const data = new Map<string, ArrayBuffer>();
  return {
    data,
    get: async (key) => data.get(key),
    put: async (key, bytes) => { data.set(key, bytes); },
    delete: async (key) => { data.delete(key); },
    keys: async () => [...data.keys()],
  };
}

describe("bank manifest gate", () => {
  it("accepts a complete manifest and totals its download", async () => {
    const { manifest } = await fixture();
    expect(validateAudioBankManifest(manifest)).toMatchObject({ ok: true, totalBytes: 2 * 4_800 * 4 });
  });

  it("admits nothing without an explicit redistribution right", async () => {
    const { manifest } = await fixture();
    const check = validateAudioBankManifest({ ...manifest, license: { ...manifest.license, redistribution: false } });
    expect(check).toMatchObject({ ok: false, reason: expect.stringMatching(/redistribution/) });
  });

  it("excludes the Recordist library whatever else the record says", async () => {
    const { manifest } = await fixture();
    const check = validateAudioBankManifest({
      ...manifest, license: { ...manifest.license, source: "The Recordist — Cirrus Vision SF50" },
    });
    expect(check).toMatchObject({ ok: false, reason: expect.stringMatching(/Recordist/) });
  });

  it("enforces the band cap, hash format, PCM length, views and download budget", async () => {
    const { manifest } = await fixture();
    const band = manifest.bands[0];
    const variants: [string, unknown][] = [
      ["cap", { ...manifest, bands: Array.from({ length: AUDIO_BANK_MAX_BANDS + 1 }, () => band) }],
      ["hash", { ...manifest, bands: [{ ...band, sha256: band.sha256.toUpperCase() }] }],
      ["length", { ...manifest, bands: [{ ...band, bytes: band.bytes + 1 }] }],
      ["view", { ...manifest, bands: [{ ...band, view: "wing" }] }],
      ["per-view", { ...manifest, bands: [0, 1, 2, 3].map((i) => ({ ...band, sha256: String(i).repeat(64) })) }],
      ["budget", { ...manifest, bands: [{ ...band, frames: 600_000, bytes: 2_400_000 }] }],
      ["licence", { ...manifest, license: { ...manifest.license, evidence: "" } }],
      ["version", { ...manifest, version: 2 }],
    ];
    for (const [name, value] of variants) expect(validateAudioBankManifest(value).ok, name).toBe(false);
  });
});

describe("bank loader and cache", () => {
  it("downloads and verifies, then serves the next load from cache", async () => {
    const { manifest, fetchBand } = await fixture();
    const store = memoryStore();
    const first = await loadAudioBank(manifest, { store, fetchBand });
    expect(first).toMatchObject({ cacheHits: 0, downloadedBytes: 2 * 4_800 * 4, cacheWriteFailures: 0 });
    expect(first.bands[1].samples).toEqual(noise(2));
    const second = await loadAudioBank(manifest, { store, fetchBand });
    expect(fetchBand).toHaveBeenCalledTimes(2);
    expect(second).toMatchObject({ cacheHits: 2, downloadedBytes: 0 });
  });

  it("treats a corrupted cache entry as a miss and replaces it", async () => {
    const { manifest, fetchBand } = await fixture();
    const store = memoryStore();
    await loadAudioBank(manifest, { store, fetchBand });
    const key = bankCacheKey(manifest, manifest.bands[0]);
    new Float32Array(store.data.get(key)!)[10] = 0.9;
    const reloaded = await loadAudioBank(manifest, { store, fetchBand });
    expect(reloaded.cacheHits).toBe(1);
    expect(fetchBand).toHaveBeenCalledTimes(3);
    expect(reloaded.bands[0].samples).toEqual(noise(1));
  });

  it("refuses a download that fails its integrity check", async () => {
    const { manifest } = await fixture();
    const tampered = vi.fn(async () => noise(99).buffer as ArrayBuffer);
    await expect(loadAudioBank(manifest, { store: null, fetchBand: tampered })).rejects.toThrow(/integrity/);
  });

  it("keeps the bank usable when storage refuses writes or reads", async () => {
    const { manifest, fetchBand } = await fixture();
    const broken: AudioBankStore = {
      get: async () => { throw new Error("evicted"); },
      put: async () => { throw new DOMException("quota", "QuotaExceededError"); },
      delete: async () => undefined,
      keys: async () => [],
    };
    const loaded = await loadAudioBank(manifest, { store: broken, fetchBand });
    expect(loaded).toMatchObject({ cacheHits: 0, cacheWriteFailures: 2 });
    expect(loaded.bands).toHaveLength(2);
  });

  it("never reuses entries across a licence manifest change", async () => {
    const store = memoryStore();
    const v1 = await fixture({ manifestVersion: 1 });
    await loadAudioBank(v1.manifest, { store, fetchBand: v1.fetchBand });
    const v2 = await fixture({ manifestVersion: 2 });
    const reloaded = await loadAudioBank(v2.manifest, { store, fetchBand: v2.fetchBand });
    expect(reloaded.cacheHits).toBe(0);
    expect([...store.data.keys()].every((key) => key.startsWith("v2/"))).toBe(true);
  });

  it("downloads a payload shared by two slots once and keeps one copy", async () => {
    const { manifest, fetchBand } = await fixture({ sharePayload: true });
    const loaded = await loadAudioBank(manifest, { store: null, fetchBand });
    expect(fetchBand).toHaveBeenCalledOnce();
    expect(loaded.bands[0].samples.buffer).toBe(loaded.bands[1].samples.buffer);
  });

  it("clears downloads", async () => {
    const { manifest, fetchBand } = await fixture();
    const store = memoryStore();
    await loadAudioBank(manifest, { store, fetchBand });
    expect(await clearAudioBankDownloads(store)).toBe(2);
    expect(await store.keys()).toEqual([]);
  });

  it("resamples only bands whose rate differs from the context, before install", async () => {
    const { manifest, fetchBand } = await fixture();
    manifest.bands[1] = { ...manifest.bands[1], sampleRateHz: 44_100 };
    const loaded = await loadAudioBank(manifest, { store: null, fetchBand });
    const resample = vi.fn(async (samples: Float32Array) => samples.slice(0, 10));
    const prepared = await prepareBankForContext(loaded, 48_000, resample);
    expect(resample).toHaveBeenCalledOnce();
    expect(resample).toHaveBeenCalledWith(expect.any(Float32Array), 44_100, 48_000);
    expect(prepared.map(({ index, exterior }) => [index, exterior])).toEqual([[0, 0], [1, 1]]);
    expect(prepared[1].samples).toHaveLength(10);
  });
});
