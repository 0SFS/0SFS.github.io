/**
 * The one contract shared by the app publisher, both transports and the WASM
 * DSP core. Field order is an ABI: `dsp/snapshot.h` declares the same names in
 * the same order and `audioSnapshot.test.ts` fails if the two drift.
 *
 * Everything is a `number` in a `Float64Array`. Simulation time needs the
 * mantissa, and one uniform element type keeps the transport a single copy.
 */

export const AUDIO_SNAPSHOT_VERSION = 1;

/**
 * Slot order. Renaming, reordering or inserting a field is a breaking ABI
 * change: bump `AUDIO_SNAPSHOT_VERSION` and rebuild the WASM core.
 *
 * Pose vectors are in **listener-local metres**: +X right, +Y up, +Z forward.
 * Expressing the source *and* both velocities in that one frame keeps azimuth,
 * distance and the Doppler radial terms self-consistent, so the worklet never
 * has to know the world frame the app happens to use.
 */
export const AUDIO_SNAPSHOT_FIELDS = [
  "version",
  "sequence",
  "epoch",
  /** JSBSim `simulation/sim-time-sec` for this accepted step. */
  "simTimeS",
  /** Bitmask of AVAILABILITY_*; a clear bit means "not published", never "zero". */
  "availability",

  "n1Pct",
  "n2Pct",
  "thrustLbf",
  "fuelFlowPps",
  "throttleNorm",
  /** 1 when the adapter trusts that fuel is burning, else 0. Not `set-running`. */
  "combustion",
  /** Native `propulsion/engine[0]/set-running`, reported but never trusted alone. */
  "running",
  "starter",
  "cutoff",

  "kias",
  "gearNorm",
  "flapNorm",

  "sourceX", "sourceY", "sourceZ",
  "sourceVelX", "sourceVelY", "sourceVelZ",
  "listenerVelX", "listenerVelY", "listenerVelZ",
  "soundSpeedMps",
  /** 0 = cockpit (interior), 1 = exterior. Fractional values crossfade. */
  "exterior",
  /** Ground-image reflection path difference in metres; <0 means unavailable. */
  "groundReflectionM",
] as const;

export type AudioSnapshotField = typeof AUDIO_SNAPSHOT_FIELDS[number];

export const AUDIO_SNAPSHOT_SLOT = Object.freeze(
  Object.fromEntries(AUDIO_SNAPSHOT_FIELDS.map((name, index) => [name, index])),
) as Readonly<Record<AudioSnapshotField, number>>;

export const AUDIO_SNAPSHOT_SIZE = AUDIO_SNAPSHOT_FIELDS.length;

/** Availability bits. A field whose bit is clear is unavailable, not zero. */
export const AVAILABILITY = Object.freeze({
  N1: 1 << 0,
  N2: 1 << 1,
  THRUST: 1 << 2,
  FUEL_FLOW: 1 << 3,
  COMBUSTION: 1 << 4,
  RUNNING: 1 << 5,
  COMMANDS: 1 << 6,
  AIRSPEED: 1 << 7,
  CONFIG: 1 << 8,
  POSE: 1 << 9,
});

/**
 * Discrete transitions that must not be interpolated or lost. Ignition and
 * shutdown are the two the spec calls out by name.
 */
export const AUDIO_EVENT = Object.freeze({
  /** Epoch restart: drop queued state and rebase the clock under a fade. */
  EPOCH: 0,
  STARTER_ON: 1,
  STARTER_OFF: 2,
  LIGHT_OFF: 3,
  FLAMEOUT: 4,
  RUNNING_ON: 5,
  RUNNING_OFF: 6,
  /** Producer overflowed its queue; the consumer must resynchronize. */
  RESYNC: 7,
});

export type AudioEventType = typeof AUDIO_EVENT[keyof typeof AUDIO_EVENT];

/** `[type, simTimeS, epoch, payload]`. */
export const AUDIO_EVENT_SIZE = 4;

/**
 * Bounded queue capacity from sound.md §2. Overflow raises RESYNC; it never
 * silently drops an ignition or a shutdown.
 */
export const AUDIO_EVENT_CAPACITY = 32;

/**
 * Snapshots carried by one transport batch. Publication is 60 Hz and the
 * worklet drains at the quantum rate (≥340 Hz at 44.1 kHz), so a consumer that
 * keeps up never fills this; it exists to survive a scheduling hiccup.
 */
export const AUDIO_BATCH_SNAPSHOTS = 8;

/** `[snapshotCount, eventCount]` ahead of the snapshot and event payloads. */
export const AUDIO_BATCH_HEADER = 2;

export const AUDIO_BATCH_LENGTH = AUDIO_BATCH_HEADER
  + AUDIO_BATCH_SNAPSHOTS * AUDIO_SNAPSHOT_SIZE
  + AUDIO_EVENT_CAPACITY * AUDIO_EVENT_SIZE;

/** Human-readable snapshot, used by tests, fixtures and the sweep harness. */
export interface AudioSnapshotInit {
  sequence: number;
  epoch: number;
  simTimeS: number;
  availability: number;
  n1Pct?: number;
  n2Pct?: number;
  thrustLbf?: number;
  fuelFlowPps?: number;
  throttleNorm?: number;
  combustion?: boolean;
  running?: boolean;
  starter?: boolean;
  cutoff?: boolean;
  kias?: number;
  gearNorm?: number;
  flapNorm?: number;
  source?: readonly [number, number, number];
  sourceVelocity?: readonly [number, number, number];
  listenerVelocity?: readonly [number, number, number];
  soundSpeedMps?: number;
  exterior?: number;
  groundReflectionM?: number;
}

/** Non-finite input is refused rather than written: a NaN target de-tunes the core. */
function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function writeAudioSnapshot(target: Float64Array, offset: number, init: AudioSnapshotInit): void {
  const s = AUDIO_SNAPSHOT_SLOT;
  target[offset + s.version] = AUDIO_SNAPSHOT_VERSION;
  target[offset + s.sequence] = finite(init.sequence, 0);
  target[offset + s.epoch] = finite(init.epoch, 0);
  target[offset + s.simTimeS] = finite(init.simTimeS, 0);
  target[offset + s.availability] = finite(init.availability, 0);
  target[offset + s.n1Pct] = finite(init.n1Pct, 0);
  target[offset + s.n2Pct] = finite(init.n2Pct, 0);
  target[offset + s.thrustLbf] = finite(init.thrustLbf, 0);
  target[offset + s.fuelFlowPps] = finite(init.fuelFlowPps, 0);
  target[offset + s.throttleNorm] = finite(init.throttleNorm, 0);
  target[offset + s.combustion] = init.combustion ? 1 : 0;
  target[offset + s.running] = init.running ? 1 : 0;
  target[offset + s.starter] = init.starter ? 1 : 0;
  target[offset + s.cutoff] = init.cutoff ? 1 : 0;
  target[offset + s.kias] = finite(init.kias, 0);
  target[offset + s.gearNorm] = finite(init.gearNorm, 0);
  target[offset + s.flapNorm] = finite(init.flapNorm, 0);
  const source = init.source ?? [0, 0, 0];
  target[offset + s.sourceX] = finite(source[0], 0);
  target[offset + s.sourceY] = finite(source[1], 0);
  target[offset + s.sourceZ] = finite(source[2], 0);
  const sourceVelocity = init.sourceVelocity ?? [0, 0, 0];
  target[offset + s.sourceVelX] = finite(sourceVelocity[0], 0);
  target[offset + s.sourceVelY] = finite(sourceVelocity[1], 0);
  target[offset + s.sourceVelZ] = finite(sourceVelocity[2], 0);
  const listenerVelocity = init.listenerVelocity ?? [0, 0, 0];
  target[offset + s.listenerVelX] = finite(listenerVelocity[0], 0);
  target[offset + s.listenerVelY] = finite(listenerVelocity[1], 0);
  target[offset + s.listenerVelZ] = finite(listenerVelocity[2], 0);
  target[offset + s.soundSpeedMps] = finite(init.soundSpeedMps, 343);
  target[offset + s.exterior] = finite(init.exterior, 0);
  target[offset + s.groundReflectionM] = finite(init.groundReflectionM, -1);
}

export function readAudioSnapshotField(
  source: Float64Array, offset: number, field: AudioSnapshotField,
): number {
  return source[offset + AUDIO_SNAPSHOT_SLOT[field]];
}
