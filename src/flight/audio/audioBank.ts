import { TIER_BUDGETS } from "./audioQuality";

/**
 * Experimental V2 bank helpers: integrity, cache and bounded PCM preparation.
 *
 * No bank ships or is admitted by a production renderer. High is procedural.
 * V2 describes full recordings, not source-separated residuals; these helpers
 * do not establish the missing residual/propagation contract or acoustic rights.
 *
 * Band payloads are raw little-endian float32 mono PCM. That avoids a decoder
 * dependency. A future compressed format requires its own schema and explicit
 * decode/resource accounting; V2 must never masquerade as an Opus loader.
 */

export const AUDIO_BANK_MANIFEST_VERSION = 2;
/** Mirrors kMaxBands in dsp/granular.h: three operating bands per view, two views. */
export const AUDIO_BANK_MAX_BANDS = 6;
/** Historical experimental pack ceiling, separate from the procedural code budget. */
export const AUDIO_BANK_MAX_DOWNLOAD_BYTES = 1536 * 1024;
const MAX_BANDS_PER_VIEW = 3;
/** osfs_audio_band_alloc's own ceiling. */
const MAX_BAND_FRAMES = 60 * 96_000;

export interface AudioBankBand {
  file: string;
  sha256: string;
  bytes: number;
  frames: number;
  sampleRateHz: number;
  /** Operating point this band represents, as N1 in 0..1. */
  n1: number;
  view: "cockpit" | "exterior";
}

export interface AudioBankLicense {
  /** Bumping this invalidates every cached band: a licence change is revalidated, never reused. */
  manifestVersion: number;
  spdx: string;
  rightsHolder: string;
  source: string;
  /** Must be true. A bank without an explicit redistribution right is never admitted. */
  redistribution: boolean;
  /** Where the signed release or licence evidence is kept. */
  evidence: string;
}

export interface AudioBankManifestV2 {
  version: 2;
  id: string;
  revision: string;
  engineDefinitionId: string;
  rendererId: string;
  license: AudioBankLicense;
  bands: AudioBankBand[];
}

export type AudioBankManifestCheck =
  | { ok: true; manifest: AudioBankManifestV2; totalBytes: number }
  | { ok: false; reason: string };

export class AudioBankError extends Error {}

const SHA256 = /^[0-9a-f]{64}$/;
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const integer = (value: unknown, min: number, max: number): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const fail = (reason: string): AudioBankManifestCheck => ({ ok: false, reason });

export function validateAudioBankManifest(value: unknown): AudioBankManifestCheck {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fail("The manifest must be an object.");
  const manifest = value as Record<string, unknown>;
  if (manifest.version !== AUDIO_BANK_MANIFEST_VERSION) {
    return fail(`Unsupported bank manifest version ${String(manifest.version)}.`);
  }
  if (!text(manifest.id) || !text(manifest.revision)) return fail("The manifest needs an id and a revision.");
  if (!text(manifest.engineDefinitionId) || !text(manifest.rendererId)) return fail("The bank needs an engine acoustic definition and renderer target.");

  const license = manifest.license as Partial<AudioBankLicense> | undefined;
  if (!license || !integer(license.manifestVersion, 1, Number.MAX_SAFE_INTEGER) || !text(license.spdx)
    || !text(license.rightsHolder) || !text(license.source) || !text(license.evidence)) {
    return fail("The bank's licence record is incomplete.");
  }
  if (license.redistribution !== true) {
    return fail("The experimental bank has no recorded redistribution right (sound.md §4).");
  }
  if (/recordist/i.test(`${license.source} ${license.rightsHolder}`)) {
    return fail("Recordist recordings are excluded from embedding and redistribution (sound.md §4).");
  }

  const bands = manifest.bands;
  if (!Array.isArray(bands) || bands.length === 0 || bands.length > AUDIO_BANK_MAX_BANDS) {
    return fail(`A bank has between 1 and ${AUDIO_BANK_MAX_BANDS} bands.`);
  }
  const perView = { cockpit: 0, exterior: 0 };
  let totalBytes: number;
  try { totalBytes = new TextEncoder().encode(JSON.stringify(manifest)).byteLength; }
  catch { return fail("The manifest must be JSON serializable."); }
  const counted = new Map<string, { frames: number; sampleRateHz: number }>();
  const operatingPoints = new Set<string>();
  for (const [index, entry] of bands.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return fail(`Band ${index} must be an object.`);
    const band = entry as Partial<AudioBankBand>;
    if (!text(band.file) || typeof band.sha256 !== "string" || !SHA256.test(band.sha256)) {
      return fail(`Band ${index} needs a file name and a lowercase hex SHA-256.`);
    }
    if (!integer(band.frames, 1, MAX_BAND_FRAMES) || !integer(band.sampleRateHz, 8_000, 96_000)) {
      return fail(`Band ${index} has an invalid length or sample rate.`);
    }
    if (band.bytes !== band.frames * 4) {
      return fail(`Band ${index} must hold ${band.frames} float32 frames, ${band.frames * 4} bytes.`);
    }
    if (typeof band.n1 !== "number" || !(band.n1 >= 0 && band.n1 <= 1)) {
      return fail(`Band ${index} needs an N1 operating point between 0 and 1.`);
    }
    if (band.view !== "cockpit" && band.view !== "exterior") return fail(`Band ${index} needs a view.`);
    if (band.frames! < Math.ceil(band.sampleRateHz! * 0.06)) return fail(`Band ${index} cannot hold a 60 ms grain.`);
    const operatingPoint = `${band.view}/${band.n1}`;
    if (operatingPoints.has(operatingPoint)) return fail(`Band ${index} repeats an operating point in the same view.`);
    operatingPoints.add(operatingPoint);
    perView[band.view] += 1;
    // A payload shared by two slots downloads once, so it counts once.
    const duplicate = counted.get(band.sha256);
    if (duplicate && (duplicate.frames !== band.frames || duplicate.sampleRateHz !== band.sampleRateHz)) {
      return fail(`Band ${index} gives conflicting PCM metadata for a shared payload.`);
    }
    if (!duplicate) {
      counted.set(band.sha256, { frames: band.frames!, sampleRateHz: band.sampleRateHz! });
      totalBytes += band.bytes;
    }
  }
  if (perView.cockpit > MAX_BANDS_PER_VIEW || perView.exterior > MAX_BANDS_PER_VIEW) {
    return fail(`At most ${MAX_BANDS_PER_VIEW} bands per view.`);
  }
  if (perView.cockpit === 0 || perView.exterior === 0) return fail("An experimental V2 bank must cover both cockpit and exterior views.");
  if (totalBytes > AUDIO_BANK_MAX_DOWNLOAD_BYTES) {
    return fail(`The bank including its manifest is ${totalBytes} bytes, over the ${AUDIO_BANK_MAX_DOWNLOAD_BYTES}-byte experimental pack budget.`);
  }
  return { ok: true, manifest: manifest as unknown as AudioBankManifestV2, totalBytes };
}

/* ------------------------------------------------------------------ cache */

export interface AudioBankStore {
  get(key: string): Promise<ArrayBuffer | undefined>;
  put(key: string, bytes: ArrayBuffer): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface LoadedAudioBank {
  manifest: AudioBankManifestV2;
  bands: { band: AudioBankBand; samples: Float32Array }[];
  cacheHits: number;
  downloadedBytes: number;
  /** Writes the store refused (quota, private mode). The bank still loads for this session. */
  cacheWriteFailures: number;
}

export interface AudioBankLoadOptions {
  store: AudioBankStore | null;
  fetchBand(band: AudioBankBand): Promise<ArrayBuffer>;
  digest?(bytes: ArrayBuffer): Promise<string>;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const bankCacheKey = (manifest: AudioBankManifestV2, band: AudioBankBand): string =>
  `v${manifest.license.manifestVersion}/${band.sha256}`;

/**
 * Validates the manifest, then fetches or reuses each band, verifying every
 * byte against the manifest hash either way. Eviction, read errors and
 * corrupted entries are cache misses; quota failures leave the bank usable.
 */
export async function loadAudioBank(manifestValue: unknown, options: AudioBankLoadOptions): Promise<LoadedAudioBank> {
  const check = validateAudioBankManifest(manifestValue);
  if (!check.ok) throw new AudioBankError(check.reason);
  const { manifest } = check;
  const digest = options.digest ?? sha256Hex;
  const store = options.store;
  const payloads = new Map<string, ArrayBuffer>();
  const verified = async (bytes: ArrayBuffer | undefined, band: AudioBankBand): Promise<boolean> =>
    bytes !== undefined && bytes.byteLength === band.bytes && await digest(bytes) === band.sha256;

  let cacheHits = 0;
  let downloadedBytes = 0;
  let cacheWriteFailures = 0;
  for (const band of manifest.bands) {
    if (payloads.has(band.sha256)) continue;
    const key = bankCacheKey(manifest, band);
    let bytes: ArrayBuffer | undefined;
    try { bytes = await store?.get(key); } catch { bytes = undefined; }
    if (bytes !== undefined && !await verified(bytes, band)) {
      try { await store?.delete(key); } catch { /* Still a miss. */ }
      bytes = undefined;
    }
    if (bytes !== undefined) {
      cacheHits += 1;
    } else {
      bytes = await options.fetchBand(band);
      if (!await verified(bytes, band)) {
        throw new AudioBankError(`Band ${band.file} failed its integrity check; the experimental bank is rejected.`);
      }
      downloadedBytes += bytes.byteLength;
      try { await store?.put(key, bytes); } catch { cacheWriteFailures += 1; }
    }
    payloads.set(band.sha256, bytes);
  }

  if (store) {
    // Entries from an older licence manifest or a retired band are never reused.
    try {
      const wanted = new Set(manifest.bands.map((band) => bankCacheKey(manifest, band)));
      for (const key of await store.keys()) if (!wanted.has(key)) await store.delete(key);
    } catch { /* Best effort: stale entries can never verify under a new key anyway. */ }
  }

  const bands = manifest.bands.map((band) => ({ band, samples: new Float32Array(payloads.get(band.sha256)!) }));
  const checked = new Set<ArrayBufferLike>();
  for (const { band, samples } of bands) {
    if (checked.has(samples.buffer)) continue;
    if (!samples.every(Number.isFinite)) throw new AudioBankError(`Band ${band.file} contains non-finite PCM.`);
    checked.add(samples.buffer);
  }
  return {
    manifest, cacheHits, downloadedBytes, cacheWriteFailures,
    // Slots that share a payload share one sample buffer: no duplicate decoded bank.
    bands,
  };
}

/** The settings panel's "clear downloads". Returns how many entries were removed. */
export async function clearAudioBankDownloads(store: AudioBankStore): Promise<number> {
  const keys = await store.keys();
  for (const key of keys) await store.delete(key);
  return keys.length;
}

/* ------------------------------------------------------- context install */

export interface AudioBankInstallBand {
  index: number;
  samples: Float32Array;
  n1: number;
  exterior: 0 | 1;
}
export interface AudioBankInstallation {
  readonly engineDefinitionId: string;
  readonly rendererId: string;
  readonly bands: readonly AudioBankInstallBand[];
}

export type AudioBankResampler = (samples: Float32Array, fromRate: number, toRate: number) => Promise<Float32Array>;

/** Conservative accounting before resampling allocates anything. Includes retained
 * input, prepared PCM, future per-slot WASM copies and peak transfer/offline scratch.
 * This is a bound for the experiment, not a measured browser-memory result. */
export function preflightBankForContext(bank: LoadedAudioBank, contextRate: number): void {
  if (!Number.isInteger(contextRate) || contextRate < 8_000 || contextRate > 96_000) {
    throw new AudioBankError("Unsupported experimental bank context rate.");
  }
  const check = validateAudioBankManifest(bank.manifest);
  if (!check.ok) throw new AudioBankError(check.reason);
  if (bank.bands.length !== bank.manifest.bands.length) throw new AudioBankError("The loaded bank is incomplete.");
  const inputs = new Set<ArrayBufferLike>();
  const prepared = new Set<string>();
  let inputBytes = 0, preparedBytes = 0, installedBytes = 0, largestPreparedBytes = 0;
  for (const [index, { band, samples }] of bank.bands.entries()) {
    const declared = bank.manifest.bands[index];
    if (JSON.stringify(band) !== JSON.stringify(declared) || samples.length !== band.frames) {
      throw new AudioBankError("Loaded PCM does not match the experimental manifest.");
    }
    if (!inputs.has(samples.buffer)) {
      inputs.add(samples.buffer);
      inputBytes += samples.buffer.byteLength;
    }
    const frames = Math.max(1, Math.round(samples.length * contextRate / band.sampleRateHz));
    if (frames > MAX_BAND_FRAMES) throw new AudioBankError("Resampled band exceeds the per-band allocation cap.");
    const bytes = frames * Float32Array.BYTES_PER_ELEMENT;
    installedBytes += bytes;
    largestPreparedBytes = Math.max(largestPreparedBytes, bytes);
    if (band.sampleRateHz !== contextRate && !prepared.has(band.sha256)) {
      prepared.add(band.sha256);
      preparedBytes += bytes;
    }
  }
  const resident = TIER_BUDGETS.med.residentMiB * 1024 ** 2 + inputBytes + preparedBytes + installedBytes;
  const peak = resident + installedBytes + 3 * largestPreparedBytes;
  if (resident > TIER_BUDGETS.high.residentMiB * 1024 ** 2 || peak > TIER_BUDGETS.high.loadingPeakMiB * 1024 ** 2) {
    throw new AudioBankError("Decoded experimental bank exceeds the resident or loading-peak memory budget.");
  }
}

/** sound.md §3: resample to the ACTUAL context rate before activation, never after. */
export async function prepareBankForContext(
  bank: LoadedAudioBank, contextRate: number, resample: AudioBankResampler,
): Promise<AudioBankInstallation> {
  preflightBankForContext(bank, contextRate);
  const prepared: AudioBankInstallBand[] = [];
  const payloads = new Map<string, Float32Array>();
  for (const [index, { band, samples }] of bank.bands.entries()) {
    let converted = payloads.get(band.sha256);
    if (!converted) {
      converted = band.sampleRateHz === contextRate ? samples : await resample(samples, band.sampleRateHz, contextRate);
      const expectedFrames = Math.max(1, Math.round(samples.length * contextRate / band.sampleRateHz));
      if (converted.length !== expectedFrames || !converted.every(Number.isFinite)) {
        throw new AudioBankError("Resampler returned invalid experimental bank PCM.");
      }
      payloads.set(band.sha256, converted);
    }
    prepared.push({
      index,
      samples: converted,
      n1: band.n1,
      exterior: band.view === "exterior" ? 1 : 0,
    });
  }
  return { engineDefinitionId: bank.manifest.engineDefinitionId, rendererId: bank.manifest.rendererId, bands: prepared };
}

/** The browser's own offline renderer does the resampling, so no hand-rolled filter decides the timbre. */
export async function resampleWithOfflineContext(
  samples: Float32Array, fromRate: number, toRate: number,
): Promise<Float32Array> {
  const frames = Math.max(1, Math.round((samples.length * toRate) / fromRate));
  const context = new OfflineAudioContext(1, frames, toRate);
  const buffer = context.createBuffer(1, samples.length, fromRate);
  buffer.getChannelData(0).set(samples);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
  return (await context.startRendering()).getChannelData(0);
}

/**
 * IndexedDB store keyed by licence version and hash. Browser-only; the Node
 * tests exercise the loader through an in-memory store with the same contract.
 */
export function createIndexedDbBankStore(factory: IDBFactory, name = "osfs-audio-bank"): AudioBankStore {
  const STORE = "bands";
  const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const run = async <T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest): Promise<T> => {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = body(transaction.objectStore(STORE));
        let result: T;
        request.onsuccess = () => { result = request.result as T; };
        // Resolve on commit, not on request success: a write is not durable until then.
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error ?? request.error);
        transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
      });
    } finally {
      db.close();
    }
  };
  return {
    get: (key) => run<ArrayBuffer | undefined>("readonly", (store) => store.get(key)),
    put: async (key, bytes) => { await run("readwrite", (store) => store.put(bytes, key)); },
    delete: async (key) => { await run("readwrite", (store) => store.delete(key)); },
    keys: async () => (await run<IDBValidKey[]>("readonly", (store) => store.getAllKeys())).map(String),
  };
}
