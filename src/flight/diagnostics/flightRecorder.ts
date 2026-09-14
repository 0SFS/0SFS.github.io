/**
 * Flight data recorder for pilot evaluation.
 *
 * A pilot's comment ("the nose drops too far when the flaps come down") is
 * only useful if it can be tied to what the model did at that moment. This
 * records aircraft state and the control positions JSBSim actually received,
 * at a fixed simulation-time rate, and lets the pilot drop a mark. The CSV
 * carries the build version so every file names the model it came from.
 *
 * Samples come from JSBSim properties rather than the app's input objects, so
 * the record is what physics saw regardless of who was flying: keyboard,
 * gamepad, phone or autopilot.
 */

export interface FlightRecorderPropertyReader {
  getPropertyValue(property: string): number;
  /** Absent on stub backends; without it nothing is treated as available. */
  queryPropertyCatalog?(check: string): string;
}

export interface FlightRecorderChannel {
  /** CSV column name. */
  column: string;
  property: string;
  /** Multiplier applied to the property value before recording. */
  scale?: number;
}

export const FLIGHT_RECORDER_CHANNELS: readonly FlightRecorderChannel[] = [
  { column: "lat_deg", property: "position/lat-geod-deg" },
  { column: "lon_deg", property: "position/long-gc-deg" },
  { column: "alt_msl_ft", property: "position/h-sl-ft" },
  { column: "alt_agl_ft", property: "position/h-agl-ft" },
  { column: "pressure_alt_ft", property: "atmosphere/pressure-altitude" },
  { column: "oat_degR", property: "atmosphere/T-R" },
  { column: "kcas", property: "velocities/vc-kts" },
  { column: "ktas", property: "velocities/vtrue-kts" },
  { column: "mach", property: "velocities/mach" },
  { column: "vs_fpm", property: "velocities/v-down-fps", scale: -60 },
  { column: "pitch_deg", property: "attitude/theta-deg" },
  { column: "roll_deg", property: "attitude/phi-deg" },
  { column: "heading_deg", property: "attitude/psi-deg" },
  { column: "alpha_deg", property: "aero/alpha-deg" },
  { column: "beta_deg", property: "aero/beta-deg" },
  { column: "gamma_deg", property: "flight-path/gamma-deg" },
  { column: "p_deg_s", property: "velocities/p-rad_sec", scale: 180 / Math.PI },
  { column: "q_deg_s", property: "velocities/q-rad_sec", scale: 180 / Math.PI },
  { column: "r_deg_s", property: "velocities/r-rad_sec", scale: 180 / Math.PI },
  { column: "nz_g", property: "accelerations/Nz" },
  { column: "weight_lb", property: "inertia/weight-lbs" },
  { column: "fuel_lb", property: "propulsion/total-fuel-lbs" },
  { column: "n1_pct", property: "propulsion/engine[0]/n1" },
  { column: "n2_pct", property: "propulsion/engine[0]/n2" },
  { column: "rpm", property: "propulsion/engine[0]/engine-rpm" },
  { column: "thrust_lbf", property: "propulsion/engine[0]/thrust-lbs" },
  { column: "fuel_flow_gph", property: "propulsion/engine[0]/fuel-flow-rate-gph" },
  { column: "throttle_cmd", property: "fcs/throttle-cmd-norm" },
  { column: "elevator_cmd", property: "fcs/elevator-cmd-norm" },
  { column: "aileron_cmd", property: "fcs/aileron-cmd-norm" },
  { column: "rudder_cmd", property: "fcs/rudder-cmd-norm" },
  { column: "pitch_trim_cmd", property: "fcs/pitch-trim-cmd-norm" },
  { column: "roll_trim_cmd", property: "fcs/roll-trim-cmd-norm" },
  { column: "yaw_trim_cmd", property: "fcs/yaw-trim-cmd-norm" },
  { column: "flap_cmd", property: "fcs/flap-cmd-norm" },
  { column: "flap_pos", property: "fcs/flap-pos-norm" },
  { column: "gear_cmd", property: "gear/gear-cmd-norm" },
  { column: "gear_pos", property: "gear/gear-pos-norm" },
  { column: "brake_left", property: "fcs/left-brake-cmd-norm" },
  { column: "brake_right", property: "fcs/right-brake-cmd-norm" },
  { column: "wow", property: "gear/wow" },
  { column: "stall_warning", property: "fcs/stall-warning" },
  { column: "stick_pusher", property: "fcs/stick-pusher" },
  { column: "pusher_cmd", property: "fcs/pusher-cmd-norm" },
];

export interface FlightRecorderMark {
  /** 1-based, in the order the pilot pressed it. */
  number: number;
  simTimeSec: number;
  wallTimeMs: number;
  note: string;
}

export interface FlightRecorderOptions {
  sampleHz?: number;
  /** Oldest samples are discarded beyond this. */
  capacitySeconds?: number;
  metadata?: Readonly<Record<string, string>>;
  now?: () => number;
  channels?: readonly FlightRecorderChannel[];
}

export interface FlightRecorder {
  /**
   * Record one row if simulation time has advanced a full sample interval.
   * Call as often as convenient; paused time records nothing. Simulation time
   * running backwards (a reset or reposition) starts a new segment.
   */
  sample(reader: FlightRecorderPropertyReader): boolean;
  /** Mark the most recent sample. Returns null before anything is recorded. */
  mark(note?: string): FlightRecorderMark | null;
  setMetadata(key: string, value: string): void;
  getSampleCount(): number;
  /** Simulation seconds covered by the retained samples. */
  getDurationSec(): number;
  getMarks(): readonly FlightRecorderMark[];
  toCsv(): string;
  clear(): void;
}

const DEFAULT_SAMPLE_HZ = 20;
const DEFAULT_CAPACITY_SECONDS = 30 * 60;
// Leading columns stored with each row, ahead of the channels.
const SIM_TIME = 0;
const WALL_TIME = 1;
const SEGMENT = 2;
const FIXED_COLUMNS = 3;

/**
 * JSBSim returns 0 for a property that does not exist, so availability has to
 * come from the catalog. The catalog lists index 0 without its "[0]".
 */
export function propertyInCatalog(reader: FlightRecorderPropertyReader, property: string): boolean {
  if (typeof reader.queryPropertyCatalog !== "function") return false;
  const name = property.replace(/\[0\]/g, "");
  return reader.queryPropertyCatalog(name.split("/").pop() ?? name)
    .split("\n")
    .some((line) => (line.trim().split(/\s+/)[0] ?? "") === name);
}

export function createFlightRecorder(options: FlightRecorderOptions = {}): FlightRecorder {
  const channels = options.channels ?? FLIGHT_RECORDER_CHANNELS;
  const sampleHz = options.sampleHz ?? DEFAULT_SAMPLE_HZ;
  const interval = 1 / sampleHz;
  const capacity = Math.max(1, Math.round((options.capacitySeconds ?? DEFAULT_CAPACITY_SECONDS) * sampleHz));
  const width = FIXED_COLUMNS + channels.length;
  const now = options.now ?? (() => Date.now());
  const metadata = new Map(Object.entries(options.metadata ?? {}));

  let rows = new Float64Array(capacity * width);
  let start = 0;
  let count = 0;
  let segment = 0;
  let lastSimTime: number | null = null;
  let available: boolean[] | null = null;
  // Marks keyed by the absolute row number they label, so ring overwrite can drop them.
  let written = 0;
  const marks: { row: number; mark: FlightRecorderMark }[] = [];

  const rowOffset = (index: number): number => ((start + index) % capacity) * width;

  return {
    sample(reader: FlightRecorderPropertyReader): boolean {
      const simTime = reader.getPropertyValue("simulation/sim-time-sec");
      if (!Number.isFinite(simTime)) return false;
      if (lastSimTime !== null) {
        if (simTime < lastSimTime - 1e-9) segment += 1;
        else if (simTime - lastSimTime < interval - 1e-9) return false;
      }
      // Property sets differ by aircraft and are fixed once a model is loaded.
      available ??= channels.map((channel) => propertyInCatalog(reader, channel.property));
      const offset = count < capacity ? ((start + count) % capacity) * width : start * width;
      if (count === capacity) start = (start + 1) % capacity;
      else count += 1;
      rows[offset + SIM_TIME] = simTime;
      rows[offset + WALL_TIME] = now();
      rows[offset + SEGMENT] = segment;
      channels.forEach((channel, i) => {
        rows[offset + FIXED_COLUMNS + i] = available![i]
          ? reader.getPropertyValue(channel.property) * (channel.scale ?? 1)
          : Number.NaN;
      });
      lastSimTime = simTime;
      written += 1;
      while (marks.length > 0 && marks[0].row < written - count) marks.shift();
      return true;
    },
    mark(note = ""): FlightRecorderMark | null {
      if (count === 0) return null;
      const offset = rowOffset(count - 1);
      const mark: FlightRecorderMark = {
        number: (marks.at(-1)?.mark.number ?? 0) + 1,
        simTimeSec: rows[offset + SIM_TIME],
        wallTimeMs: now(),
        note: note.replace(/[\r\n,"]+/g, " ").trim(),
      };
      marks.push({ row: written - 1, mark });
      return mark;
    },
    setMetadata(key: string, value: string): void {
      metadata.set(key, value);
    },
    getSampleCount: () => count,
    getDurationSec(): number {
      if (count < 2) return 0;
      return rows[rowOffset(count - 1) + SIM_TIME] - rows[rowOffset(0) + SIM_TIME];
    },
    getMarks: () => marks.map((entry) => entry.mark),
    toCsv(): string {
      const lines: string[] = [];
      metadata.forEach((value, key) => lines.push(`# ${key}: ${value.replace(/[\r\n]+/g, " ")}`));
      lines.push(`# sample_hz: ${sampleHz}`);
      marks.forEach(({ mark }) => lines.push(
        `# mark ${mark.number}: sim_time_sec ${mark.simTimeSec.toFixed(3)}${mark.note ? ` ${mark.note}` : ""}`,
      ));
      lines.push(["sim_time_sec", "wall_time_utc", "segment", ...channels.map((c) => c.column), "mark"].join(","));
      const firstRow = written - count;
      const markByRow = new Map(marks.map(({ row, mark }) => [row, mark]));
      for (let i = 0; i < count; i += 1) {
        const offset = rowOffset(i);
        const mark = markByRow.get(firstRow + i);
        const cells = [
          rows[offset + SIM_TIME].toFixed(3),
          new Date(rows[offset + WALL_TIME]).toISOString(),
          String(rows[offset + SEGMENT]),
        ];
        for (let c = 0; c < channels.length; c += 1) {
          const value = rows[offset + FIXED_COLUMNS + c];
          cells.push(Number.isFinite(value) ? String(Math.round(value * 1e6) / 1e6) : "");
        }
        cells.push(mark ? `${mark.number}${mark.note ? ` ${mark.note}` : ""}` : "");
        lines.push(cells.join(","));
      }
      return lines.join("\n") + "\n";
    },
    clear(): void {
      rows = new Float64Array(capacity * width);
      start = 0;
      count = 0;
      written = 0;
      segment = 0;
      lastSimTime = null;
      available = null;
      marks.length = 0;
    },
  };
}
