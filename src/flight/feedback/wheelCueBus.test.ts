import { describe, expect, it, vi } from "vitest";
import { createWheelSpinState, stepWheelSpin, WHEEL_SPIN_CONFIGS, type WheelSpinState } from "../physics/wheelSpin";
import { createSlipAudioSink, createWheelCueBus, type WheelCue, type WheelName } from "./wheelCueBus";

const NAMES = WHEEL_SPIN_CONFIGS.map(config => config.name) as WheelName[];
const DT = 1 / 120;

function grounded(slipPowerWatts = 0, treadTravelMeters = 0.25): WheelSpinState[] {
  return NAMES.map(() => ({ ...createWheelSpinState(), onGround: true, normalLoadNewtons: 3_000, slipPowerWatts, treadTravelMeters }));
}

describe("wheel cue bus", () => {
  it("publishes one cue per wheel with sequence, distance-domain travel and step work", () => {
    const bus = createWheelCueBus(NAMES);
    const seen: WheelCue[][] = [];
    bus.subscribe({ accept: cues => seen.push(cues.map(cue => ({ ...cue }))), reset: vi.fn() });
    bus.publish(1, DT, grounded(1_200, 0.25));
    bus.publish(1 + DT, DT, grounded(1_200, -0.25));
    expect(seen).toHaveLength(2);
    expect(seen[1].map(cue => cue.wheel)).toEqual(NAMES);
    expect(seen[1][1]).toMatchObject({ epoch: 0, sequence: 2, onGround: true, rollingDistanceM: 0.5,
      normalLoadN: 3_000, supportConfidence: 0, supportDeltaM: 0 });
    expect(seen[1][1].normalImpulseNs).toBeCloseTo(3_000 * DT, 12);
    expect(seen[1][1].slipDissipatedJ).toBeCloseTo(10, 12);
  });

  it("flags contact entry only after an observed airborne step within the epoch", () => {
    const bus = createWheelCueBus(NAMES);
    const entered: boolean[] = [];
    bus.subscribe({ accept: cues => entered.push(cues[1].contactEntered), reset: vi.fn() });
    bus.publish(0, DT, grounded());
    bus.publish(DT, DT, NAMES.map(() => createWheelSpinState()));
    bus.publish(2 * DT, DT, grounded());
    bus.publish(3 * DT, DT, grounded());
    bus.invalidate("teleport");
    bus.publish(4 * DT, DT, grounded());
    expect(entered).toEqual([false, false, true, false, false]);
  });

  it("advances the epoch and resets sinks on invalidation or a new terrain revision", () => {
    const bus = createWheelCueBus(NAMES);
    const reset = vi.fn();
    const cues: WheelCue[] = [];
    bus.subscribe({ accept: batch => cues.push({ ...batch[0] }), reset });
    bus.publish(0, DT, grounded());
    bus.invalidate("pause");
    bus.setGroundRevision(1);
    bus.setGroundRevision(1);
    bus.publish(DT, DT, grounded());
    expect(reset.mock.calls).toEqual([["pause"], ["ground-revision"]]);
    expect(cues[1]).toMatchObject({ epoch: 2, sequence: 1, groundRevision: 1, rollingDistanceM: 0.25 });
  });

  it("rejects invalid steps and non-finite state without poisoning totals", () => {
    const bus = createWheelCueBus(NAMES);
    const accept = vi.fn();
    bus.subscribe({ accept, reset: vi.fn() });
    bus.publish(NaN, DT, grounded());
    bus.publish(0, 0, grounded());
    bus.publish(0, DT, grounded().slice(0, 2));
    expect(accept).not.toHaveBeenCalled();
    const bad = grounded();
    bad[0] = { ...bad[0], normalLoadNewtons: NaN, slipPowerWatts: Infinity, treadTravelMeters: NaN };
    bus.publish(0, DT, bad);
    const cue = accept.mock.calls[0][0][0] as WheelCue;
    expect([cue.normalLoadN, cue.slipDissipatedJ, cue.rollingDistanceM]).toEqual([0, 0, 0]);
  });

  it("detaches a throwing sink without interrupting the publisher or other sinks", () => {
    const onError = vi.fn();
    const bus = createWheelCueBus(NAMES, onError);
    const good = vi.fn();
    bus.subscribe({ accept: () => { throw new Error("boom"); }, reset: vi.fn() });
    bus.subscribe({ accept: good, reset: vi.fn() });
    expect(() => { bus.publish(0, DT, grounded()); bus.publish(DT, DT, grounded()); }).not.toThrow();
    expect(onError).toHaveBeenCalledOnce();
    expect(good).toHaveBeenCalledTimes(2);
  });

  it("gives the slip audio sink the same mean power as the prior direct accumulation", () => {
    const bus = createWheelCueBus(NAMES);
    const sink = createSlipAudioSink();
    bus.subscribe(sink);
    const states = NAMES.map(() => createWheelSpinState());
    let directEnergy = 0;
    let directSeconds = 0;
    for (let step = 0; step < 7; step++) {
      WHEEL_SPIN_CONFIGS.forEach((config, index) => stepWheelSpin(states[index], config, {
        onGround: true, rollMetersSec: 30, normalLoadNewtons: 3_000, compressionMeters: 0.04, steeringRad: 0, brake: 0,
      }, DT, "inertia"));
      for (const wheel of states) directEnergy += wheel.slipPowerWatts * DT;
      directSeconds += DT;
      bus.publish(step * DT, DT, states);
    }
    expect(sink.takeMeanPowerWatts()).toBeCloseTo(directEnergy / directSeconds, 9);
    expect(sink.takeMeanPowerWatts()).toBeNull();
    bus.publish(0, DT, grounded(5_000));
    bus.invalidate("reset");
    expect(sink.takeMeanPowerWatts()).toBeNull();
  });
});
