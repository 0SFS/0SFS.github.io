export interface RunwaySample {
  timeSec: number;
  northFps: number;
  eastFps: number;
  anyWheelOnGround: boolean;
  clearanceFt: number;
}

export interface RunwayEvent {
  kind: "brake-release" | "threshold" | "liftoff" | "touchdown" | "screen-height" | "stop";
  timeSec: number;
  distanceFt: number;
  timingBasis: "sample" | "height-interpolation";
}

/** Measures signed distance along the fixed runway, not curved path length. */
export class RunwayMeasurement {
  #phase: "takeoff" | "landing";
  #previous: RunwaySample;
  #north: number;
  #east: number;
  #distance = 0;
  #crossTrack = 0;
  #airborneCandidate: RunwayEvent | null = null;
  #stopCandidate: RunwayEvent | null = null;
  #liftoff: RunwayEvent | null = null;
  #touchdown: RunwayEvent | null = null;
  #screen: RunwayEvent | null = null;
  #stop: RunwayEvent | null = null;
  #events: RunwayEvent[];
  #bounces = 0;

  constructor(phase: "takeoff" | "landing", runwayHeadingDeg: number, initial: RunwaySample) {
    this.#validate(initial);
    if (!Number.isFinite(runwayHeadingDeg)) throw new RangeError("Runway heading must be finite.");
    if (phase === "takeoff" && !initial.anyWheelOnGround) throw new Error("Takeoff measurement must begin on the runway.");
    if (phase === "landing" && (initial.anyWheelOnGround || Math.abs(initial.clearanceFt - 50) > 0.02)) {
      throw new Error("Landing measurement must begin airborne at the declared 50-foot datum.");
    }
    this.#phase = phase;
    this.#previous = { ...initial };
    this.#north = Math.cos(runwayHeadingDeg * Math.PI / 180);
    this.#east = Math.sin(runwayHeadingDeg * Math.PI / 180);
    this.#events = [{ kind: phase === "takeoff" ? "brake-release" : "threshold",
      timeSec: initial.timeSec, distanceFt: 0, timingBasis: "sample" }];
  }

  push(next: RunwaySample): void {
    this.#validate(next);
    const previous = this.#previous;
    const dt = next.timeSec - previous.timeSec;
    if (dt <= 0) throw new Error("Runway samples must advance in simulation time.");
    const priorDistance = this.#distance;
    const north = (previous.northFps + next.northFps) * 0.5 * dt;
    const east = (previous.eastFps + next.eastFps) * 0.5 * dt;
    this.#distance += north * this.#north + east * this.#east;
    this.#crossTrack += east * this.#north - north * this.#east;
    const event = (kind: RunwayEvent["kind"]): RunwayEvent =>
      ({ kind, timeSec: next.timeSec, distanceFt: this.#distance, timingBasis: "sample" });

    if (this.#phase === "takeoff") {
      if (!this.#liftoff) {
        if (next.anyWheelOnGround) this.#airborneCandidate = null;
        else {
          this.#airborneCandidate ??= event("liftoff");
          if (next.timeSec - this.#airborneCandidate.timeSec >= 0.2 - 1e-10) {
            // Confirm sustained flight, but retain the FIRST no-contact sample.
            this.#liftoff = this.#airborneCandidate;
            this.#events.push(this.#liftoff);
          }
        }
      }
      if (!this.#screen && previous.clearanceFt < 50 && next.clearanceFt >= 50) {
        const fraction = (50 - previous.clearanceFt) / (next.clearanceFt - previous.clearanceFt);
        this.#screen = { kind: "screen-height", timeSec: previous.timeSec + fraction * dt,
          distanceFt: priorDistance + fraction * (this.#distance - priorDistance), timingBasis: "height-interpolation" };
        this.#events.push(this.#screen);
      }
    } else {
      if (!this.#touchdown && next.anyWheelOnGround) {
        this.#touchdown = event("touchdown");
        this.#events.push(this.#touchdown);
      }
      if (this.#touchdown && previous.anyWheelOnGround && !next.anyWheelOnGround) this.#bounces++;
      const groundSpeed = Math.hypot(next.northFps, next.eastFps);
      if (this.#touchdown && next.anyWheelOnGround && groundSpeed < 1) {
        this.#stopCandidate ??= event("stop");
        if (!this.#stop && next.timeSec - this.#stopCandidate.timeSec >= 0.5 - 1e-10) {
          this.#stop = this.#stopCandidate;
          this.#events.push(this.#stop);
        }
      } else this.#stopCandidate = null;
    }
    this.#previous = { ...next };
  }

  snapshot() {
    const total = this.#phase === "takeoff" ? this.#screen?.distanceFt ?? null : this.#stop?.distanceFt ?? null;
    const groundRoll = this.#phase === "takeoff" ? this.#liftoff?.distanceFt ?? null :
      this.#touchdown && this.#stop ? this.#stop.distanceFt - this.#touchdown.distanceFt : null;
    return { alongRunwayFt: this.#distance, crossTrackFt: this.#crossTrack,
      groundRollFt: groundRoll, totalDistanceFt: total,
      completed: groundRoll !== null && total !== null,
      bounces: this.#bounces, events: this.#events.map(event => ({ ...event })) };
  }

  #validate(sample: RunwaySample): void {
    for (const value of [sample.timeSec, sample.northFps, sample.eastFps, sample.clearanceFt]) {
      if (!Number.isFinite(value)) throw new RangeError("Runway sample must contain finite values.");
    }
  }
}
