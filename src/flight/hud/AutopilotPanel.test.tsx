// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutopilotPanel, type AutopilotPanelState } from "./AutopilotPanel";
import { DEFAULT_AUTOPILOT_SETTINGS } from "../autopilot/autopilotSettings";
import { DISCONNECTED_ARDUPILOT_STATUS } from "../autopilot/ardupilotStatus";
import type { AutopilotOwners } from "../autopilot/controlArbiter";

const roots: Root[] = [];
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => {
  await act(async () => { for (const root of roots.splice(0)) root.unmount(); });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const PILOT_OWNERS: AutopilotOwners = {
  roll: "pilot", pitch: "pilot", yaw: "pilot", throttle: "pilot", gear: "pilot", flaps: "pilot",
};

function panelState(overrides: Partial<AutopilotPanelState> = {}): AutopilotPanelState {
  return {
    settings: { ...DEFAULT_AUTOPILOT_SETTINGS, axes: { ...DEFAULT_AUTOPILOT_SETTINGS.axes } },
    engaged: false,
    owners: PILOT_OWNERS,
    ardupilot: DISCONNECTED_ARDUPILOT_STATUS,
    blockedReason: null,
    readOnlyReason: null,
    ...overrides,
  };
}

async function mount(state = panelState()) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const onSettingsChange = vi.fn();
  const onEngageChange = vi.fn();
  await act(async () => root.render(
    <AutopilotPanel state={state} onSettingsChange={onSettingsChange} onEngageChange={onEngageChange} />,
  ));
  return { host, onSettingsChange, onEngageChange };
}

describe("Autopilot panel", () => {
  it("selects a backend, toggles axes, and engages the configured package", async () => {
    const t = await mount();
    const ours = t.host.querySelector<HTMLButtonElement>('[aria-label="Autopilot backend"] [aria-pressed="true"]')!;
    expect(ours.textContent).toBe("Our AP");
    await act(async () => {
      t.host.querySelectorAll<HTMLButtonElement>('[aria-label="Autopilot backend"] button')[1].click();
    });
    expect(t.onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ backend: "ardupilot" }));
    await act(async () => t.host.querySelector<HTMLInputElement>('[aria-label="Automate Roll"]')!.click());
    expect(t.onSettingsChange.mock.calls.at(-1)![0].axes.roll).toBe(false);
    await act(async () => t.host.querySelector<HTMLButtonElement>('[aria-label="Autopilot master engage"]')!.click());
    expect(t.onEngageChange).toHaveBeenCalledWith(true);
  });

  it("keeps ArduPilot connect disabled and states that SITL is not connected", async () => {
    const t = await mount(panelState({
      settings: { ...DEFAULT_AUTOPILOT_SETTINGS, backend: "ardupilot", axes: { ...DEFAULT_AUTOPILOT_SETTINGS.axes } },
      blockedReason: DISCONNECTED_ARDUPILOT_STATUS.detail,
    }));
    expect(t.host.querySelector('[aria-label="ArduPilot status"]')!.textContent).toMatch(/Not connected/);
    expect(t.host.querySelector('[aria-label="ArduPilot status"]')!.textContent).toMatch(/LOITER/);
    const connect = Array.from(t.host.querySelectorAll("button")).find((button) => button.textContent === "Connect SITL")!;
    expect(connect.disabled).toBe(true);
    expect(t.host.textContent).toMatch(/not connected/i);
  });

  it("offers a control-everything restore when an axis was left to the pilot", async () => {
    const t = await mount(panelState({
      settings: {
        ...DEFAULT_AUTOPILOT_SETTINGS,
        axes: { ...DEFAULT_AUTOPILOT_SETTINGS.axes, gear: false },
      },
    }));
    const restore = Array.from(t.host.querySelectorAll("button")).find(
      (button) => button.textContent === "Control everything our AP can own",
    )!;
    expect(restore.disabled).toBe(false);
    await act(async () => restore.click());
    expect(t.onSettingsChange.mock.calls.at(-1)![0].axes.gear).toBe(true);
  });
});
