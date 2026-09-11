import { describe, expect, it, vi } from "vitest";
import { createWheelSpinState, type WheelSpinState } from "../physics/wheelSpin";
import {
  createGamepadHapticOutput, createHapticAggregator, createHapticsController,
  HAPTIC_INTERVAL_MS, HAPTIC_MAX_DURATION_MS, type GamepadLike, type HapticOutput,
} from "./haptics";
import { createWheelCueBus, type WheelName } from "./wheelCueBus";

const NAMES: WheelName[] = ["NOSE", "LEFT_MAIN", "RIGHT_MAIN"];
const DT = 1 / 120;

function wheels(onGround: boolean[], loadN = 0, slipW = 0): WheelSpinState[] {
  return onGround.map(ground => ({ ...createWheelSpinState(), onGround: ground,
    normalLoadNewtons: ground ? loadN : 0, slipPowerWatts: ground ? slipW : 0, treadTravelMeters: ground ? 0.25 : 0 }));
}

function recorder(): HapticOutput & { plays: unknown[]; cancels: number } {
  const output = { plays: [] as unknown[], cancels: 0,
    play(envelope: unknown) { output.plays.push(envelope); }, cancel() { output.cancels += 1; } };
  return output;
}

describe("haptic aggregation", () => {
  it("maps a touchdown to one bounded low-frequency envelope and ignores sitting on the ground after reset", () => {
    const bus = createWheelCueBus(NAMES);
    const aggregator = createHapticAggregator();
    bus.subscribe(aggregator);
    bus.publish(0, DT, wheels([true, true, true], 4_000));
    expect(aggregator.take(1)).toBeNull();
    bus.publish(DT, DT, wheels([false, false, false]));
    for (let step = 0; step < 6; step++) bus.publish(DT * (step + 2), DT, wheels([false, true, true], 4_000, 20_000));
    const envelope = aggregator.take(1)!;
    expect(envelope.durationMs).toBe(HAPTIC_MAX_DURATION_MS);
    expect(envelope.strong).toBeGreaterThan(0.25);
    expect(envelope.strong).toBeLessThanOrEqual(1);
    expect(envelope.weak).toBeGreaterThan(0);
    // The window is cleared: no stale replay.
    expect(aggregator.take(1)).toBeNull();
  });

  it("pulses for spin-up slip but not for a sustained skid long after contact", () => {
    const bus = createWheelCueBus(NAMES);
    const aggregator = createHapticAggregator();
    bus.subscribe(aggregator);
    bus.publish(0, DT, wheels([false, false, false]));
    for (let step = 0; step < 60; step++) bus.publish(DT * (step + 1), DT, wheels([true, true, true], 4_000, 20_000));
    expect(aggregator.take(1)?.weak).toBeGreaterThan(0);
    for (let step = 0; step < 6; step++) bus.publish(1 + DT * step, DT, wheels([true, true, true], 4_000, 50_000));
    expect(aggregator.take(1)).toBeNull();
  });

  it("scales by strength, rejects invalid strength and never exceeds unit magnitude", () => {
    const aggregator = createHapticAggregator();
    const bus = createWheelCueBus(NAMES);
    bus.subscribe(aggregator);
    const burst = () => {
      bus.publish(0, DT, wheels([false, false, false]));
      bus.publish(DT, DT, wheels([true, true, true], 1e9, 1e12));
    };
    burst();
    expect(aggregator.take(0.5)).toEqual({ durationMs: 60, strong: 0.5, weak: 0.5 });
    bus.invalidate("reset");
    burst();
    expect(aggregator.take(NaN)).toBeNull();
  });
});

describe("haptics controller", () => {
  it("emits at most one envelope per 50 ms and replaces rather than queues", () => {
    const output = recorder();
    const controller = createHapticsController([output]);
    const bus = createWheelCueBus(NAMES);
    bus.subscribe(controller);
    controller.setEnabled(true);
    controller.setStrength(1);
    for (let frame = 0; frame < 30; frame++) {
      bus.publish(frame * DT, DT, wheels([false, false, false]));
      bus.publish(frame * DT, DT, wheels([true, true, true], 4_000, 20_000));
      controller.tick(frame * 10, true);
    }
    // 300 ms of 100 Hz ticks: 0, 50, …, 250 ms.
    expect(output.plays).toHaveLength(Math.floor(290 / HAPTIC_INTERVAL_MS) + 1);
    expect(output.plays.every(envelope => (envelope as { durationMs: number }).durationMs <= 60)).toBe(true);
  });

  it("does no work while disabled and cancels on every lifecycle stop without later output", () => {
    const output = recorder();
    const controller = createHapticsController([output]);
    const bus = createWheelCueBus(NAMES);
    bus.subscribe(controller);
    const touchdown = () => {
      bus.publish(0, DT, wheels([false, false, false]));
      bus.publish(DT, DT, wheels([true, true, true], 4_000, 20_000));
    };
    touchdown();
    controller.tick(0, true);
    expect(output.plays).toHaveLength(0);
    controller.setEnabled(true);
    let now = 0;
    for (const stop of [
      () => controller.tick(now, false), // paused / hidden / terrain hold
      () => bus.invalidate("reset"),
      () => bus.invalidate("teleport"),
      () => bus.setGroundRevision(now),
      () => controller.cancel(), // disconnect
      () => controller.setEnabled(false),
    ]) {
      controller.setEnabled(true);
      touchdown();
      now += 100;
      controller.tick(now, true);
      const before = output.cancels;
      const plays = output.plays.length;
      expect(plays).toBeGreaterThan(0);
      stop();
      expect(output.cancels).toBe(before + 1);
      now += 100;
      controller.tick(now, true);
      expect(output.plays).toHaveLength(plays);
    }
    controller.setEnabled(true);
    touchdown();
    controller.dispose();
    controller.tick(now + 100, true);
    expect(output.plays.length).toBeGreaterThan(0);
  });

  it("isolates a throwing output from the others", () => {
    const good = recorder();
    const controller = createHapticsController([{ play() { throw new Error("gone"); }, cancel() { throw new Error("gone"); } }, good]);
    controller.setEnabled(true);
    const bus = createWheelCueBus(NAMES);
    bus.subscribe(controller);
    bus.publish(0, DT, wheels([false, false, false]));
    bus.publish(DT, DT, wheels([true, true, true], 4_000));
    expect(() => controller.tick(0, true)).not.toThrow();
    expect(good.plays).toHaveLength(1);
    expect(() => controller.cancel()).not.toThrow();
    expect(good.cancels).toBe(1);
  });
});

describe("gamepad haptic output", () => {
  const envelope = { durationMs: 60, strong: 0.8, weak: 0.2 };

  it("reports unsupported devices without throwing or vibrating", () => {
    expect(createGamepadHapticOutput({ getGamepads: null, events: null }).describe()).toBe("Unavailable on this device");
    const noPad = createGamepadHapticOutput({ getGamepads: () => [], events: null });
    expect(noPad.describe()).toBe("No controller connected");
    const plain = createGamepadHapticOutput({ getGamepads: () => [{ index: 0 }], events: null });
    expect(plain.describe()).toBe("Unavailable on this device");
    expect(() => plain.play(envelope)).not.toThrow();
    const noDualRumble = createGamepadHapticOutput({ events: null,
      getGamepads: () => [{ index: 0, vibrationActuator: { effects: ["trigger-rumble"], playEffect: vi.fn() } }] });
    expect(noDualRumble.status()).toBe("unsupported");
  });

  it("plays bounded dual-rumble, resets on cancel/disconnect, and disables itself after a rejection", async () => {
    const actuator = {
      effects: ["dual-rumble"],
      playEffect: vi.fn(async () => "complete"),
      reset: vi.fn(async () => "complete"),
    };
    const events = new EventTarget();
    const pad: GamepadLike = { index: 0, connected: true, vibrationActuator: actuator };
    const onChange = vi.fn();
    const output = createGamepadHapticOutput({ getGamepads: () => [pad], events, onChange });
    expect(output.describe()).toBe("Ready");
    output.play({ durationMs: 500, strong: 4, weak: -1 });
    expect(actuator.playEffect).toHaveBeenLastCalledWith("dual-rumble",
      { startDelay: 0, duration: 60, strongMagnitude: 1, weakMagnitude: 0 });
    output.cancel();
    expect(actuator.reset).toHaveBeenCalledTimes(1);
    output.play(envelope);
    events.dispatchEvent(new Event("gamepaddisconnected"));
    expect(actuator.reset).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalled();

    actuator.playEffect.mockImplementationOnce(async () => { throw new DOMException("hidden", "InvalidStateError"); });
    output.play(envelope);
    await Promise.resolve(); await Promise.resolve();
    expect(output.status()).toBe("failed");
    const calls = actuator.playEffect.mock.calls.length;
    output.play(envelope);
    expect(actuator.playEffect).toHaveBeenCalledTimes(calls);
    output.dispose();
  });
});
