import {
  AUDIO_BATCH_HEADER, AUDIO_BATCH_LENGTH, AUDIO_BATCH_SNAPSHOTS, AUDIO_EVENT,
  AUDIO_EVENT_CAPACITY, AUDIO_EVENT_SIZE, AUDIO_SNAPSHOT_SIZE,
  writeAudioSnapshot, type AudioEventType, type AudioSnapshotInit,
} from "./audioSnapshot";

/**
 * Main-thread to audio-thread transport.
 *
 * The MessagePort path is the shipping baseline because it needs nothing from
 * the host: sound.md §2 requires the static-host deployment to work without
 * cross-origin isolation. The SharedArrayBuffer path is an optional upgrade for
 * deployments that have actually verified COOP/COEP; neither path may lose a
 * shutdown event or spin waiting for physics.
 */

export type AudioTransportKind = "port" | "sab";

export interface AudioTransport {
  readonly kind: AudioTransportKind;
  /** Shared ring for the worklet constructor, or null on the port path. */
  readonly sharedBuffer: SharedArrayBuffer | null;
  publish(snapshot: AudioSnapshotInit): void;
  publishEvent(type: AudioEventType, simTimeS: number, epoch: number, payload?: number): void;
  /** Hands staged data over. Safe to call when nothing is staged. */
  flush(): void;
  /** Returns true when the message belonged to this transport. */
  handleMessage(message: unknown): boolean;
  readonly stats: AudioTransportStats;
  dispose(): void;
}

export interface AudioTransportStats {
  /** Snapshots merged because no buffer or ring slot was free. */
  coalesced: number;
  /** Batches actually handed to the worklet. */
  delivered: number;
  /** Times the bounded event queue overflowed and forced a resynchronisation. */
  eventOverflows: number;
  /** Buffers currently owned by the worklet (port path only). */
  inFlight: number;
}

/**
 * One batch under construction. Continuous state coalesces — the newest
 * snapshot wins — but discrete events accumulate, because losing an ignition
 * or a shutdown is exactly what sound.md §2 forbids.
 */
function createStaging() {
  const values = new Float64Array(AUDIO_BATCH_LENGTH);
  const eventBase = AUDIO_BATCH_HEADER + AUDIO_BATCH_SNAPSHOTS * AUDIO_SNAPSHOT_SIZE;
  let snapshots = 0;
  let events = 0;
  let coalesced = 0;
  let overflows = 0;
  let resyncPending = false;

  return {
    get empty(): boolean { return snapshots === 0 && events === 0; },
    get coalesced(): number { return coalesced; },
    get overflows(): number { return overflows; },
    addSnapshot(snapshot: AudioSnapshotInit): void {
      // A full batch keeps the newest continuous state rather than the oldest:
      // stale telemetry has no value once fresher telemetry exists.
      const slot = snapshots < AUDIO_BATCH_SNAPSHOTS ? snapshots : AUDIO_BATCH_SNAPSHOTS - 1;
      if (snapshots >= AUDIO_BATCH_SNAPSHOTS) coalesced += 1;
      else snapshots += 1;
      writeAudioSnapshot(values, AUDIO_BATCH_HEADER + slot * AUDIO_SNAPSHOT_SIZE, snapshot);
    },
    addEvent(type: AudioEventType, simTimeS: number, epoch: number, payload: number): void {
      // The last slot is reserved for the RESYNC marker: an overflow that left
      // no room to say so would be exactly the silent loss §2 forbids.
      if (events >= AUDIO_EVENT_CAPACITY - 1) {
        overflows += 1;
        resyncPending = true;
        return;
      }
      const offset = eventBase + events * AUDIO_EVENT_SIZE;
      values[offset] = type;
      values[offset + 1] = Number.isFinite(simTimeS) ? simTimeS : 0;
      values[offset + 2] = epoch;
      values[offset + 3] = Number.isFinite(payload) ? payload : 0;
      events += 1;
    },
    /** Writes the header and returns the finished batch, then starts a new one. */
    take(target: Float64Array, offset: number): void {
      if (resyncPending && events < AUDIO_EVENT_CAPACITY) {
        const eventOffset = eventBase + events * AUDIO_EVENT_SIZE;
        values[eventOffset] = AUDIO_EVENT.RESYNC;
        values[eventOffset + 1] = 0;
        values[eventOffset + 2] = 0;
        values[eventOffset + 3] = 0;
        events += 1;
      }
      values[0] = snapshots;
      values[1] = events;
      target.set(values, offset);
      snapshots = 0;
      events = 0;
      resyncPending = false;
    },
  };
}

export interface PortTransportOptions {
  /** sound.md §2 specifies three buffers: producer, consumer and in flight. */
  buffers?: number;
}

/**
 * Three transferable ArrayBuffers cycling between the threads. Exclusive
 * ownership is the whole point: a buffer is either ours or the worklet's, never
 * both, so no lock and no atomic is needed on either side.
 */
export function createPortTransport(port: MessagePort, options: PortTransportOptions = {}): AudioTransport {
  const count = Math.max(1, Math.min(8, options.buffers ?? 3));
  const free: ArrayBuffer[] = Array.from({ length: count },
    () => new ArrayBuffer(AUDIO_BATCH_LENGTH * Float64Array.BYTES_PER_ELEMENT));
  const staging = createStaging();
  let inFlight = 0;
  let delivered = 0;
  let disposed = false;

  const flush = (): void => {
    if (disposed || staging.empty) return;
    const buffer = free.pop();
    // Nothing free means every buffer is with the worklet. Staging keeps
    // accumulating and coalescing; the next recycle drains it.
    if (!buffer) return;
    const view = new Float64Array(buffer);
    staging.take(view, 0);
    inFlight += 1;
    delivered += 1;
    port.postMessage({ type: "batch", buffer }, [buffer]);
  };

  return {
    kind: "port",
    sharedBuffer: null,
    publish(snapshot) { if (!disposed) staging.addSnapshot(snapshot); },
    publishEvent(type, simTimeS, epoch, payload = 0) {
      if (!disposed) staging.addEvent(type, simTimeS, epoch, payload);
    },
    flush,
    handleMessage(message) {
      const data = message as { type?: string; buffer?: ArrayBuffer } | null;
      if (!data || data.type !== "recycle" || !data.buffer) return false;
      inFlight = Math.max(0, inFlight - 1);
      if (!disposed) {
        free.push(data.buffer);
        flush();
      }
      return true;
    },
    get stats(): AudioTransportStats {
      return {
        coalesced: staging.coalesced, delivered,
        eventOverflows: staging.overflows, inFlight,
      };
    },
    dispose() { disposed = true; free.length = 0; },
  };
}

/** Control-word layout of the shared ring. Mirrored in worklet/dspProcessor.js. */
const SAB_WRITE = 0;
const SAB_READ = 1;
const SAB_SLOTS = 2;
const SAB_CONTROL_WORDS = 8;

export interface SabTransportOptions {
  slots?: number;
}

/**
 * Cross-origin isolation is a deployment property, not a browser feature: the
 * headers come from the host or CDN and an HTML meta tag does not substitute.
 * This only reports what the page actually got.
 */
export function isSharedMemoryAvailable(scope: typeof globalThis = globalThis): boolean {
  const host = scope as typeof globalThis & { crossOriginIsolated?: boolean };
  return typeof SharedArrayBuffer !== "undefined" && host.crossOriginIsolated === true;
}

/**
 * Bounded single-producer / single-consumer ring. Indices move through integer
 * Atomics only; the producer never overwrites a slot the consumer is reading
 * and the consumer never calls `Atomics.wait()` — waiting on the audio thread
 * is what sound.md §2 rules out outright.
 */
export function createSabTransport(options: SabTransportOptions = {}): AudioTransport {
  const slots = Math.max(2, Math.min(32, options.slots ?? 8));
  const bytes = SAB_CONTROL_WORDS * 4 + slots * AUDIO_BATCH_LENGTH * 8;
  const shared = new SharedArrayBuffer(bytes);
  const control = new Int32Array(shared, 0, SAB_CONTROL_WORDS);
  const data = new Float64Array(shared, SAB_CONTROL_WORDS * 4);
  Atomics.store(control, SAB_SLOTS, slots);
  const staging = createStaging();
  let delivered = 0;
  let disposed = false;

  const flush = (): void => {
    if (disposed || staging.empty) return;
    const write = Atomics.load(control, SAB_WRITE);
    const read = Atomics.load(control, SAB_READ);
    // A full ring means the consumer is behind; staging coalesces rather than
    // clobbering a slot that may be mid-copy on the audio thread.
    if (write - read >= slots) return;
    staging.take(data, (write % slots) * AUDIO_BATCH_LENGTH);
    // The payload is written before the index is published, so a consumer that
    // observes the new index always observes complete data.
    Atomics.store(control, SAB_WRITE, (write + 1) | 0);
    delivered += 1;
  };

  return {
    kind: "sab",
    sharedBuffer: shared,
    publish(snapshot) { if (!disposed) staging.addSnapshot(snapshot); },
    publishEvent(type, simTimeS, epoch, payload = 0) {
      if (!disposed) staging.addEvent(type, simTimeS, epoch, payload);
    },
    flush,
    handleMessage() { return false; },
    get stats(): AudioTransportStats {
      return {
        coalesced: staging.coalesced, delivered,
        eventOverflows: staging.overflows,
        inFlight: Atomics.load(control, SAB_WRITE) - Atomics.load(control, SAB_READ),
      };
    },
    dispose() { disposed = true; },
  };
}
