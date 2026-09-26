// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tierAvailability, type AudioCapabilities } from "../audio/audioQuality";
import { DEFAULT_AUDIO_SETTINGS, type AudioQualityId } from "../audio/audioSettings";
import type { FlightAudioStatus } from "../audio/createFlightAudio";
import { SoundSettingsPanel, type SoundAction } from "./SoundSettingsPanel";

const roots: Root[] = [];
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => {
  await act(async () => { for (const root of roots.splice(0)) root.unmount(); });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const CAPABLE: AudioCapabilities = { audioWorklet: true, webAssembly: true, bankReady: false, loadObservable: false };

function status(requested: AudioQualityId, overrides: Partial<FlightAudioStatus> = {}): FlightAudioStatus {
  return {
    enabled: true, requested, effective: "low", mode: "sound", gestureLocked: false, message: null, tireMessage: null,
    availability: {
      off: tierAvailability("off", CAPABLE), low: tierAvailability("low", CAPABLE),
      med: tierAvailability("med", CAPABLE), high: tierAvailability("high", CAPABLE),
    },
    stats: "Audio: low (requested auto)", transport: "port", sampleRateHz: 48_000, held: false,
    settings: { ...DEFAULT_AUDIO_SETTINGS, enabled: true, requested }, readOnlyReason: null,
    allowUnvalidated: false, engine: null, core: null, running: null, telemetry: null,
    ...overrides,
  };
}

async function mount(state: FlightAudioStatus) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const onAction = vi.fn<(action: SoundAction) => void>();
  await act(async () => root.render(<SoundSettingsPanel state={state} onAction={onAction} />));
  const button = (text: string) => [...host.querySelectorAll("button")].find((item) => item.textContent?.includes(text));
  return { host, onAction, button };
}

describe("sound settings panel", () => {
  it("offers to run an unvalidated Med request right where it was chosen", async () => {
    const panel = await mount(status("med"));
    expect(panel.host.textContent).toMatch(/Med has no device validation yet, so it is running as Low/);
    const run = panel.button("Run Med anyway");
    expect(run).toBeDefined();
    await act(async () => run!.click());
    expect(panel.onAction).toHaveBeenCalledWith({ type: "allow-unvalidated", allowed: true });
  });

  it("shows the testing state, and a way out, once Med runs unvalidated", async () => {
    const panel = await mount(status("med", { allowUnvalidated: true, effective: "med" }));
    expect(panel.host.textContent).toMatch(/Testing unvalidated Med this session/);
    expect(panel.button("Run Med anyway")).toBeUndefined();
    await act(async () => panel.button("Stop testing")!.click());
    expect(panel.onAction).toHaveBeenCalledWith({ type: "allow-unvalidated", allowed: false });
  });

  it("never offers the test for Auto, and says Auto ignores it", async () => {
    expect((await mount(status("auto"))).button("anyway")).toBeUndefined();
    expect((await mount(status("auto", { allowUnvalidated: true }))).host.textContent)
      .toMatch(/Auto only picks validated tiers/);
  });

  it("keeps Med selectable and High disabled, with the exact availability labels", async () => {
    const panel = await mount(status("low"));
    const options = [...panel.host.querySelectorAll<HTMLOptionElement>('select[aria-label="Sound quality"] option')];
    const med = options.find((option) => option.value === "med")!;
    const high = options.find((option) => option.value === "high")!;
    expect(med.disabled).toBe(false);
    expect(med.textContent).toBe("Med — Not yet validated");
    expect(high.disabled).toBe(true);
    expect(high.textContent).toBe("High — Audio pack unavailable");
  });

  it("sends airframe wind volume on its own", async () => {
    const panel = await mount(status("low"));
    const slider = panel.host.querySelector<HTMLInputElement>('input[aria-label="Airframe wind volume"]')!;
    await act(async () => {
      // React tracks the value; set it through the native setter so the change is seen.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, "0.25");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(panel.onAction).toHaveBeenCalledWith({ type: "settings", patch: { airframeVolume: 0.25 } });
  });
});
