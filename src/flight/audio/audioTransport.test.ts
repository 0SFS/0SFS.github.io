import { describe, expect, it } from "vitest";
import {
  AUDIO_BATCH_HEADER, AUDIO_BATCH_LENGTH, AUDIO_BATCH_SNAPSHOTS, AUDIO_EVENT, AUDIO_EVENT_CAPACITY,
  AUDIO_EVENT_SIZE, AUDIO_SNAPSHOT_SIZE, AVAILABILITY, readAudioSnapshotField, type AudioSnapshotInit,
} from "./audioSnapshot";
import { createPortTransport, createSabTransport, isSharedMemoryAvailable } from "./audioTransport";
import { createDspHarness } from "./dspHarness";

const EVENT_BASE = AUDIO_BATCH_HEADER + AUDIO_BATCH_SNAPSHOTS * AUDIO_SNAPSHOT_SIZE;

function snapshot(simTimeS: number, n1Pct = 50): AudioSnapshotInit {
  return {
    sequence: Math.round(simTimeS * 60), epoch: 1, simTimeS, availability: AVAILABILITY.N1,
    n1Pct, n2Pct: 0, thrustLbf: 0, fuelFlowPps: 0, throttleNorm: 0,
    combustion: false, running: false, starter: false, cutoff: true,
    kias: 0, gearNorm: 1, flapNorm: 0, source: [0, 0, 1], exterior: 0,
    soundSpeedMps: 343, groundReflectionM: -1,
  };
}

/** Records what would cross the thread boundary. A real port would also detach the buffer. */
function fakePort() {
  const sent: { message: { type: string; buffer: ArrayBuffer }; transfer: Transferable[] }[] = [];
  const port = {
    postMessage(message: unknown, transfer: Transferable[] = []) {
      sent.push({ message: message as { type: string; buffer: ArrayBuffer }, transfer });
    },
  } as unknown as MessagePort;
  return { port, sent };
}

describe("MessagePort transport", () => {
  it("hands over one batch per flush and transfers the buffer it carries", () => {
    const { port, sent } = fakePort();
    const transport = createPortTransport(port);
    transport.flush();
    expect(sent).toHaveLength(0);

    transport.publish(snapshot(0.5, 42));
    transport.publishEvent(AUDIO_EVENT.LIGHT_OFF, 0.51, 1, 7);
    transport.flush();
    expect(sent).toHaveLength(1);
    const { message, transfer } = sent[0];
    expect(message.type).toBe("batch");
    expect(transfer).toEqual([message.buffer]);
    const view = new Float64Array(message.buffer);
    expect(view.length).toBe(AUDIO_BATCH_LENGTH);
    expect([view[0], view[1]]).toEqual([1, 1]);
    expect(readAudioSnapshotField(view, AUDIO_BATCH_HEADER, "n1Pct")).toBe(42);
    expect(Array.from(view.subarray(EVENT_BASE, EVENT_BASE + AUDIO_EVENT_SIZE)))
      .toEqual([AUDIO_EVENT.LIGHT_OFF, 0.51, 1, 7]);
    expect(transport.stats).toMatchObject({ delivered: 1, inFlight: 1 });
  });

  it("coalesces continuous state but keeps every event while all buffers are in flight", () => {
    const { port, sent } = fakePort();
    const transport = createPortTransport(port, { buffers: 3 });
    for (let i = 0; i < 3; i += 1) {
      transport.publish(snapshot(i));
      transport.flush();
    }
    expect(sent).toHaveLength(3);

    for (let i = 0; i < 20; i += 1) transport.publish(snapshot(3 + i / 60, 60 + i));
    transport.publishEvent(AUDIO_EVENT.FLAMEOUT, 3.2, 1);
    transport.flush();
    expect(sent).toHaveLength(3);
    expect(transport.stats.coalesced).toBe(20 - AUDIO_BATCH_SNAPSHOTS);

    // The worklet returns a buffer and the staged batch leaves on it at once.
    expect(transport.handleMessage({ type: "recycle", buffer: sent[0].message.buffer })).toBe(true);
    expect(sent).toHaveLength(4);
    const view = new Float64Array(sent[3].message.buffer);
    expect(view[0]).toBe(AUDIO_BATCH_SNAPSHOTS);
    expect(view[1]).toBe(1);
    const lastSlot = AUDIO_BATCH_HEADER + (AUDIO_BATCH_SNAPSHOTS - 1) * AUDIO_SNAPSHOT_SIZE;
    expect(readAudioSnapshotField(view, lastSlot, "n1Pct")).toBe(79);
    expect(view[EVENT_BASE]).toBe(AUDIO_EVENT.FLAMEOUT);
    expect(transport.handleMessage({ type: "stats" })).toBe(false);
  });

  it("marks an event overflow with a resync instead of losing it silently", () => {
    const { port, sent } = fakePort();
    const transport = createPortTransport(port);
    for (let i = 0; i < AUDIO_EVENT_CAPACITY + 5; i += 1) {
      transport.publishEvent(AUDIO_EVENT.STARTER_ON, i, 1);
    }
    transport.flush();
    const view = new Float64Array(sent[0].message.buffer);
    expect(view[1]).toBe(AUDIO_EVENT_CAPACITY);
    expect(view[EVENT_BASE + (AUDIO_EVENT_CAPACITY - 1) * AUDIO_EVENT_SIZE]).toBe(AUDIO_EVENT.RESYNC);
    expect(transport.stats.eventOverflows).toBe(6);
  });

  it("stops publishing after dispose", () => {
    const { port, sent } = fakePort();
    const transport = createPortTransport(port);
    transport.dispose();
    transport.publish(snapshot(1));
    transport.flush();
    expect(sent).toHaveLength(0);
  });

  it("delivers batches the compiled core accepts", async () => {
    const { port, sent } = fakePort();
    const harness = await createDspHarness();
    harness.anchor(1, 0);
    const transport = createPortTransport(port);
    transport.publish(snapshot(0.1));
    transport.publish(snapshot(0.2));
    transport.publishEvent(AUDIO_EVENT.LIGHT_OFF, 0.15, 1);
    transport.flush();
    new Float64Array(harness.exports.memory.buffer, harness.exports.osfs_audio_batch_ptr(), AUDIO_BATCH_LENGTH)
      .set(new Float64Array(sent[0].message.buffer));
    harness.exports.osfs_audio_commit_batch();
    expect(harness.stats()).toMatchObject({ snapshotsIn: 2, eventsIn: 1, snapshotsDropped: 0 });
  });
});

describe("SharedArrayBuffer transport", () => {
  it("never overwrites a slot the consumer has not read", () => {
    const transport = createSabTransport({ slots: 2 });
    const control = new Int32Array(transport.sharedBuffer!, 0, 8);
    const data = new Float64Array(transport.sharedBuffer!, 8 * 4);
    transport.publish(snapshot(0, 10));
    transport.flush();
    transport.publish(snapshot(1, 20));
    transport.flush();
    expect(Atomics.load(control, 0)).toBe(2);

    transport.publish(snapshot(2, 30));
    transport.flush();
    expect(Atomics.load(control, 0)).toBe(2);
    expect(readAudioSnapshotField(data, AUDIO_BATCH_HEADER, "n1Pct")).toBe(10);

    // The consumer finishes slot 0; only now may it be reused.
    Atomics.store(control, 1, 1);
    transport.flush();
    expect(Atomics.load(control, 0)).toBe(3);
    expect(readAudioSnapshotField(data, AUDIO_BATCH_HEADER, "n1Pct")).toBe(30);
    expect(transport.stats.inFlight).toBe(2);
  });

  it("is offered only when the page really is cross-origin isolated", () => {
    expect(isSharedMemoryAvailable({ crossOriginIsolated: false } as unknown as typeof globalThis)).toBe(false);
    expect(isSharedMemoryAvailable({} as unknown as typeof globalThis)).toBe(false);
    expect(isSharedMemoryAvailable({ crossOriginIsolated: true } as unknown as typeof globalThis)).toBe(true);
  });
});
