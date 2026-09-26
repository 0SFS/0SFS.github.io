import type { LegacyMigration, ParameterValue } from "foss-earth/settings";
import { AUDIO_SETTINGS_STORAGE_KEY, migrateAudioSettings } from "../audio/audioSettings";
import { AUTOPILOT_SETTINGS_STORAGE_KEY, migrateAutopilotSettings } from "../autopilot/autopilotSettings";
import { migratePhoneCameraTuning, PHONE_CAMERA_TUNING_STORAGE_KEY } from "../remote/phoneCameraTuning";
import { GROUND_SETTINGS_STORAGE_KEY, migrateGroundSettings } from "./groundInteractionSettings";
import type { FlightParameterId, FlightParameterValues } from "./flightParameters";

// Migration: each old key fills the parameters it held, once. The old keys stay
// for one release, for rollback.

function parseJson(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function onOff(id: FlightParameterId) {
  return (raw: string): Record<string, ParameterValue> | null =>
    raw === "on" ? { [id]: true } : raw === "off" ? { [id]: false } : null;
}

/** Copies the fields of an old JSON record into parameters, leaving validation to the registry. */
function fields(mapping: Readonly<Record<string, FlightParameterId>>) {
  return (raw: string): Record<string, ParameterValue> | null => {
    const record = parseJson(raw);
    if (!record) return null;
    const values: Record<string, ParameterValue> = {};
    for (const [field, id] of Object.entries(mapping)) {
      const value = record[field];
      if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") values[id] = value;
    }
    return values;
  };
}

/** A store's own parser for its old record. */
function record(parse: (raw: string) => Partial<FlightParameterValues> | null) {
  return (raw: string): Record<string, ParameterValue> | null => parse(raw) as Record<string, ParameterValue> | null;
}

const KEYBOARD_FIELDS = [
  "mode", "expo", "smoothResponseSec", "smoothReturnSec", "rateTimeToFull", "rateTimeToCenter",
  "rateAccelAfterSec", "rateAccelMultiplier", "rateMaxDeflection", "assistRollRateDeg",
  "assistPitchRateDeg", "assistYawRateDeg", "assistKp", "assistKi", "assistKd", "assistMaxDeflection",
] as const;

export const OSFS_LEGACY_MIGRATIONS: readonly LegacyMigration[] = [
  {
    key: "osfs.flight-terrain-requirement",
    migrate: raw => raw.trim() === "" ? null : { "osfs.flight.minimum": Number(raw) },
  },
  {
    key: "osfs.terrain-detail-anchor",
    migrate: raw => raw === "aircraft" ? { "map.focus.refineFrom": "focus" } : raw === "camera" ? { "map.focus.refineFrom": "camera" } : null,
  },
  {
    key: "osfs.attitude-renderer",
    migrate: raw => ({ "osfs.renderer.attitudeIndicator": raw }),
  },
  { key: "osfs.arcade-ground-launches", migrate: onOff("osfs.ground.arcadeLaunches") },
  { key: GROUND_SETTINGS_STORAGE_KEY, migrate: record(migrateGroundSettings) },
  { key: "osfs.auto-trim", migrate: onOff("osfs.assist.autoTrim") },
  { key: "osfs.auto-roll-trim", migrate: onOff("osfs.assist.autoRollTrim") },
  {
    key: "osfs.gamepad-polling-rate",
    migrate: raw => ({ "osfs.input.gamepadPollingRate": raw === "frame" ? "frame" : Number(raw) }),
  },
  {
    key: "osfs.gamepad-response",
    migrate: fields({
      mode: "osfs.input.gamepadResponse",
      responseTimeSec: "osfs.input.gamepadResponseTime",
      deadzoneMode: "osfs.input.gamepadDeadzoneMode",
    }),
  },
  {
    key: "osfs.keyboard-stick",
    migrate: fields(Object.fromEntries(KEYBOARD_FIELDS.map(field => [field, `osfs.input.keyboard.${field}` as FlightParameterId]))),
  },
  { key: AUTOPILOT_SETTINGS_STORAGE_KEY, migrate: record(migrateAutopilotSettings) },
  { key: PHONE_CAMERA_TUNING_STORAGE_KEY, migrate: record(migratePhoneCameraTuning) },
  { key: AUDIO_SETTINGS_STORAGE_KEY, migrate: record(migrateAudioSettings) },
  // Only the unit: which engine sections are open stays in this key, as the panel's memory.
  { key: "osfs.engineMonitor.v1", migrate: fields({ flowUnit: "osfs.engineMonitor.fuelFlowUnit" }) },
  // The newer key of each pair comes first: the first to fill a parameter wins.
  { key: "osfs.aircraft", migrate: raw => ({ "osfs.aircraft.id": raw }) },
  { key: "flight-sim.aircraft", migrate: raw => ({ "osfs.aircraft.id": raw }) },
  { key: "osfs.aircraft-generation", migrate: raw => raw === "" ? null : { "osfs.aircraft.generation": raw } },
  { key: "osfs.aircraft-lod", migrate: raw => ({ "osfs.aircraft.lod": raw }) },
  { key: "flight-sim.aircraft-lod", migrate: raw => ({ "osfs.aircraft.lod": raw }) },
  { key: "osfs.aircraft-opt-in-lods", migrate: onOff("osfs.aircraft.optInLods") },
];
