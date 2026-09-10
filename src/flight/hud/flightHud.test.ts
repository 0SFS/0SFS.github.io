// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFlightHud, type FlightHudControls } from "./flightHud";
import type { FlightState } from "../physics/flightState";

const STATE: FlightState = {
  latDeg: 0, lonDeg: 0, altMeters: 1000,
  rollRad: 0, pitchRad: 0, headingRad: 0,
  airspeedKts: 120, verticalSpeedFps: 0, throttleNorm: 0.5,
} as FlightState;

const CONTROLS: FlightHudControls = {
  pitchTrim: 0, flaps: 0, rudder: 0, aileron: 0, elevator: 0,
};

// jsdom ships no 2D canvas, and the attitude indicator insists on one. These
// tests are about the gear button, so a stub that records nothing is enough.
function stubCanvas(): void {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    new Proxy({}, { get: () => () => undefined }) as unknown as CanvasRenderingContext2D,
  );
}

function mount() {
  stubCanvas();
  const host = document.createElement("div");
  document.body.append(host);
  const onGearChange = vi.fn();
  const hud = createFlightHud(host, {
    onGearChange,
    onThrottleChange: vi.fn(),
    onPitchTrimChange: vi.fn(),
    onFlapsChange: vi.fn(),
    onRudderChange: vi.fn(),
    onStickChange: vi.fn(),
  });
  const gear = host.querySelector<HTMLButtonElement>('[data-control="gear"]')!;
  return { host, hud, gear, onGearChange };
}

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe("flight HUD gear button", () => {
  it("starts down, and asks for the opposite of where it is", () => {
    const t = mount();
    expect(t.gear.getAttribute("aria-pressed")).toBe("true");
    expect(t.gear.classList.contains("is-down")).toBe(true);
    t.gear.click();
    // It reports the wanted position rather than toggling itself: the input
    // manager owns the lever, and the button follows it back through update().
    expect(t.onGearChange).toHaveBeenCalledWith(false);
    expect(t.gear.classList.contains("is-down")).toBe(true);
    t.hud.destroy();
  });

  it("follows the lever when the key moves it", () => {
    const t = mount();
    t.hud.setGearDown(false);
    expect(t.gear.getAttribute("aria-pressed")).toBe("false");
    expect(t.gear.classList.contains("is-down")).toBe(false);
    expect(t.gear.title).toContain("up");
    t.hud.update(STATE, CONTROLS, true);
    expect(t.gear.classList.contains("is-down")).toBe(true);
    t.hud.destroy();
  });

  it("sits with the instrument tapes, so both read in one glance", () => {
    const t = mount();
    expect(t.gear.parentElement?.className).toBe("flight-hud__tapes");
    const metrics = [...t.host.querySelectorAll("[data-metric]")].map(
      (element) => (element as HTMLElement).dataset.metric,
    );
    expect(metrics).toEqual(["ias", "alt", "hdg", "vs"]);
    t.hud.destroy();
  });

  it("keeps every value a fixed width, so the row cannot shunt sideways", () => {
    const t = mount();
    const widths = new Set<number>();
    const vsWidths = new Set<number>();
    for (const [altMeters, verticalSpeedFps] of [[30, 12.3], [3048, -12.3], [3048, 0], [152.4, -0.1]]) {
      t.hud.update({ ...STATE, altMeters, verticalSpeedFps }, CONTROLS, true);
      widths.add(t.host.querySelector<HTMLElement>('[data-metric="alt"]')!.textContent!.length);
      vsWidths.add(t.host.querySelector<HTMLElement>('[data-metric="vs"]')!.textContent!.length);
    }
    expect([...widths]).toEqual([5]);
    expect([...vsWidths]).toEqual([5]);
    t.hud.destroy();
  });

  it("stops answering clicks once destroyed", () => {
    const t = mount();
    const gear = t.gear;
    t.hud.destroy();
    gear.click();
    expect(t.onGearChange).not.toHaveBeenCalled();
  });
});
