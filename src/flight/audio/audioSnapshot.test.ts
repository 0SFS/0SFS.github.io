import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AUDIO_BATCH_HEADER, AUDIO_BATCH_LENGTH, AUDIO_BATCH_SNAPSHOTS, AUDIO_EVENT,
  AUDIO_EVENT_CAPACITY, AUDIO_EVENT_SIZE, AUDIO_SNAPSHOT_FIELDS, AUDIO_SNAPSHOT_SIZE,
  AUDIO_SNAPSHOT_SLOT, AUDIO_SNAPSHOT_VERSION, AVAILABILITY, writeAudioSnapshot,
} from "./audioSnapshot";

const header = readFileSync("src/flight/audio/dsp/snapshot.h", "utf8");

/** Reads an enum body delimited by `// NAME` ... `// END NAME` comments. */
function enumNames(marker: string): string[] {
  const block = header.split(`// ${marker}\n`)[1]?.split(`// END ${marker}`)[0] ?? "";
  // Names share lines in the C++ enum ("kSourceX, kSourceY, kSourceZ,"), so
  // match every identifier rather than one per line.
  return [...block.matchAll(/\bk([A-Z][A-Za-z0-9]*)\s*(?:=[^,]*)?[,\n]/g)].map((match) => match[1]);
}

const lowerFirst = (value: string): string => value.charAt(0).toLowerCase() + value.slice(1);

describe("audio snapshot ABI", () => {
  it("declares the same fields, in the same order, as the C++ core", () => {
    const cpp = enumNames("AUDIO_SNAPSHOT_FIELDS").filter((name) => name !== "SnapshotSize");
    expect(cpp.map(lowerFirst)).toEqual([...AUDIO_SNAPSHOT_FIELDS]);
  });

  it("keeps the slot indices the C++ side computes", () => {
    expect(AUDIO_SNAPSHOT_SIZE).toBe(AUDIO_SNAPSHOT_FIELDS.length);
    expect(AUDIO_SNAPSHOT_SLOT.version).toBe(0);
    expect(AUDIO_SNAPSHOT_SLOT.simTimeS).toBe(3);
    expect(header).toContain("kSnapshotSize,");
    expect(header).toContain(`constexpr int kSnapshotVersion = ${AUDIO_SNAPSHOT_VERSION};`);
  });

  it("agrees on the bounded queue and batch sizes", () => {
    expect(header).toContain(`constexpr int kEventSize = ${AUDIO_EVENT_SIZE};`);
    expect(header).toContain(`constexpr int kEventCapacity = ${AUDIO_EVENT_CAPACITY};`);
    expect(header).toContain(`constexpr int kBatchSnapshots = ${AUDIO_BATCH_SNAPSHOTS};`);
    expect(header).toContain(`constexpr int kBatchHeader = ${AUDIO_BATCH_HEADER};`);
    expect(AUDIO_BATCH_LENGTH).toBe(
      AUDIO_BATCH_HEADER + AUDIO_BATCH_SNAPSHOTS * AUDIO_SNAPSHOT_SIZE
      + AUDIO_EVENT_CAPACITY * AUDIO_EVENT_SIZE);
  });

  it("declares the same availability bits and event types", () => {
    const availability = enumNames("AVAILABILITY").map((name) => name.replace(/^Avail/, ""));
    expect(availability.map((name) => name.toUpperCase()))
      .toEqual(Object.keys(AVAILABILITY).map((name) => name.replace(/_/g, "")));
    const events = enumNames("AUDIO_EVENT").map((name) => name.replace(/^Event/, ""));
    expect(events.map((name) => name.toUpperCase()))
      .toEqual(Object.keys(AUDIO_EVENT).map((name) => name.replace(/_/g, "")));
  });

  it("matches the worklet's copy of the constants", () => {
    const worklet = readFileSync("src/flight/audio/worklet/dspProcessor.js", "utf8");
    expect(worklet).toContain(`const SNAPSHOT_SIZE = ${AUDIO_SNAPSHOT_SIZE};`);
    expect(worklet).toContain(`const EVENT_SIZE = ${AUDIO_EVENT_SIZE};`);
    expect(worklet).toContain(`const EVENT_CAPACITY = ${AUDIO_EVENT_CAPACITY};`);
    expect(worklet).toContain(`const BATCH_SNAPSHOTS = ${AUDIO_BATCH_SNAPSHOTS};`);
  });
});

describe("writeAudioSnapshot", () => {
  it("normalizes a valid exhaust axis and clears its bit for missing or invalid orientation", () => {
    const target = new Float64Array(AUDIO_SNAPSHOT_SIZE);
    const write = (sourceAxis?: readonly [number, number, number]) => {
      writeAudioSnapshot(target, 0, {
        sequence: 1, epoch: 1, simTimeS: 0, availability: AVAILABILITY.SOURCE_AXIS | AVAILABILITY.N1,
        sourceAxis,
      });
    };
    write([0, -3, -4]);
    expect(target[AUDIO_SNAPSHOT_SLOT.sourceAxisY]).toBeCloseTo(-0.6);
    expect(target[AUDIO_SNAPSHOT_SLOT.sourceAxisZ]).toBeCloseTo(-0.8);
    expect(target[AUDIO_SNAPSHOT_SLOT.availability] & AVAILABILITY.SOURCE_AXIS).not.toBe(0);
    for (const axis of [undefined, [0, 0, 0], [0, Number.NaN, -1], [0, 0, Number.POSITIVE_INFINITY]] as const) {
      write(axis);
      expect(target[AUDIO_SNAPSHOT_SLOT.availability]).toBe(AVAILABILITY.N1);
      expect(target[AUDIO_SNAPSHOT_SLOT.sourceAxisX]).toBe(0);
      expect(target[AUDIO_SNAPSHOT_SLOT.sourceAxisY]).toBe(0);
      expect(target[AUDIO_SNAPSHOT_SLOT.sourceAxisZ]).toBe(0);
    }
  });

  it("refuses non-finite input instead of writing NaN into the core", () => {
    const target = new Float64Array(AUDIO_SNAPSHOT_SIZE * 2).fill(-1);
    writeAudioSnapshot(target, AUDIO_SNAPSHOT_SIZE, {
      sequence: Number.NaN, epoch: 2, simTimeS: Number.POSITIVE_INFINITY, availability: 0,
      n1Pct: Number.NaN, source: [1, Number.NaN, 3],
      augmentation: true,
    });
    const at = (field: keyof typeof AUDIO_SNAPSHOT_SLOT): number =>
      target[AUDIO_SNAPSHOT_SIZE + AUDIO_SNAPSHOT_SLOT[field]];
    expect(target.every(Number.isFinite)).toBe(true);
    expect(at("version")).toBe(AUDIO_SNAPSHOT_VERSION);
    expect(at("sequence")).toBe(0);
    expect(at("simTimeS")).toBe(0);
    expect(at("epoch")).toBe(2);
    expect(at("sourceX")).toBe(1);
    expect(at("sourceY")).toBe(0);
    expect(at("sourceZ")).toBe(3);
    // An unwritten field defaults, and the neighbouring snapshot is untouched.
    expect(at("soundSpeedMps")).toBe(343);
    expect(at("groundReflectionM")).toBe(-1);
    expect(at("augmentation")).toBe(1);
    expect(target[0]).toBe(-1);
  });
});
