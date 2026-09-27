import type { SettingsPreset } from "foss-earth/settings";

/**
 * The flight's presets, one JSON file each in src/flight/presets/, in
 * file-name order after FOSS Earth's. They are lists of values, applied by
 * copying in Settings → Presets; no code branches on a preset's name.
 */
const files = import.meta.glob<SettingsPreset>("../presets/*.json", { eager: true, import: "default" });

export const FLIGHT_PRESETS: readonly SettingsPreset[] = Object.keys(files)
  .sort()
  .map(path => files[path]);
