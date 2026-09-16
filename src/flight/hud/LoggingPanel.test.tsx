// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFlightRecorder, type FlightRecorderPropertyReader } from "../diagnostics/flightRecorder";
import {
  LOGGING_CLOSE_WARNING,
  LoggingPanel,
  allowCloseLoggingTab,
  bindRecorderMarkHotkey,
  formatRecorderClock,
} from "./LoggingPanel";

function reader(values: Record<string, number>): FlightRecorderPropertyReader {
  return {
    getPropertyValue: (property) => values[property] ?? 0,
    queryPropertyCatalog: () => "simulation/sim-time-sec (R)\n",
  };
}

describe("logging panel", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("formats the recorder clock", () => {
    expect(formatRecorderClock(12)).toBe("00:12");
    expect(formatRecorderClock(3723)).toBe("1:02:03");
  });

  it("starts idle and only records after Record", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onAction = vi.fn();
    await act(async () => root.render(<LoggingPanel
      state={{ recording: false, sampleCount: 0, durationSec: 0, markCount: 0 }}
      onAction={onAction}
    />));
    expect(host.textContent).toContain("Idle");
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Start recording"]')!.click());
    expect(onAction).toHaveBeenCalledWith({ type: "start" });
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Save CSV"]')!.disabled).toBe(true);
    await act(async () => root.unmount());
  });

  it("exposes stop, mark, and save while a recording has samples", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onAction = vi.fn();
    await act(async () => root.render(<LoggingPanel
      state={{ recording: true, sampleCount: 40, durationSec: 2, markCount: 1 }}
      onAction={onAction}
    />));
    expect(host.textContent).toContain("Recording");
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Stop recording"]')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Mark sample"]')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Save CSV"]')!.click());
    expect(onAction.mock.calls.map((call) => call[0])).toEqual([
      { type: "stop" },
      { type: "mark" },
      { type: "save" },
    ]);
    await act(async () => root.unmount());
  });

  it("closes without a warning when nothing was recorded", () => {
    const rec = createFlightRecorder();
    const confirmFn = vi.fn(() => false);
    expect(allowCloseLoggingTab(rec, confirmFn)).toBe(true);
    expect(confirmFn).not.toHaveBeenCalled();
  });

  it("warns, then stops and clears, when closing an active or saved log", () => {
    const rec = createFlightRecorder({ sampleHz: 10, channels: [], now: () => 0 });
    rec.start();
    rec.sample(reader({ "simulation/sim-time-sec": 1 }));
    const cancel = vi.fn(() => false);
    expect(allowCloseLoggingTab(rec, cancel)).toBe(false);
    expect(cancel).toHaveBeenCalledWith(LOGGING_CLOSE_WARNING);
    expect(rec.isRecording()).toBe(true);
    expect(rec.getSampleCount()).toBe(1);
    expect(allowCloseLoggingTab(rec, () => true)).toBe(true);
    expect(rec.isRecording()).toBe(false);
    expect(rec.getSampleCount()).toBe(0);
  });

  it("marks from M only while recording, and not while typing", () => {
    const rec = createFlightRecorder({ sampleHz: 10, channels: [], now: () => 0 });
    rec.start();
    rec.sample(reader({ "simulation/sim-time-sec": 1 }));
    const unbind = bindRecorderMarkHotkey(rec);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyM" }));
    expect(rec.getMarks()).toHaveLength(1);
    rec.stop();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyM" }));
    expect(rec.getMarks()).toHaveLength(1);
    rec.start();
    const input = document.createElement("input");
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyM", bubbles: true }));
    expect(rec.getMarks()).toHaveLength(1);
    unbind();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyM" }));
    expect(rec.getMarks()).toHaveLength(1);
  });
});
