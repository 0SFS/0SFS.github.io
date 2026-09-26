import {
  normalizeGamepadResponseSettings,
  type GamepadResponseController,
  type GamepadResponseSettings,
} from "@felipegalind0/gamepad-tools/core";
import type { FlightParameterStore } from "../settings/flightParameters";

/**
 * gamepad-tools' response preference, kept in the osfs.input.gamepadResponse*
 * parameters instead of its own storage key. It applies to every binding
 * profile, and never to the keyboard, the on-screen stick or the phone.
 */
export function createGamepadResponseSetting(parameters: FlightParameterStore): GamepadResponseController & { dispose(): void } {
  const read = (): Readonly<GamepadResponseSettings> => Object.freeze(normalizeGamepadResponseSettings({
    mode: parameters.get("osfs.input.gamepadResponse"),
    responseTimeSec: parameters.get("osfs.input.gamepadResponseTime"),
    deadzoneMode: parameters.get("osfs.input.gamepadDeadzoneMode"),
  }));
  let settings = read();
  const listeners = new Set<() => void>();
  const refresh = (): void => {
    const next = read();
    if (next.mode === settings.mode && next.responseTimeSec === settings.responseTimeSec
      && next.deadzoneMode === settings.deadzoneMode) return;
    settings = next;
    for (const listener of [...listeners]) listener();
  };
  const stops = [
    parameters.watch("osfs.input.gamepadResponse", refresh),
    parameters.watch("osfs.input.gamepadResponseTime", refresh),
    parameters.watch("osfs.input.gamepadDeadzoneMode", refresh),
  ];
  return {
    getSettings: () => settings,
    setSettings(partial) {
      parameters.setMany({
        ...(partial.mode !== undefined ? { "osfs.input.gamepadResponse": partial.mode } : {}),
        ...(partial.responseTimeSec !== undefined ? { "osfs.input.gamepadResponseTime": partial.responseTimeSec } : {}),
        ...(partial.deadzoneMode !== undefined ? { "osfs.input.gamepadDeadzoneMode": partial.deadzoneMode } : {}),
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      for (const stop of stops) stop();
      listeners.clear();
    },
  };
}
