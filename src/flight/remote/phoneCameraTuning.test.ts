import { describe, expect, it } from "vitest";
import { flightParameterDefaults } from "../settings/flightParameters";
import {
  DEFAULT_PHONE_CAMERA_TUNING, describePhoneCameraTuning, migratePhoneCameraTuning,
  normalizePhoneCameraTuning, phoneCameraTuningValues, readPhoneCameraTuning, type PhoneCameraTuning,
} from "./phoneCameraTuning";

/** The Phone camera: recommended preset's combination. */
const RECOMMENDED: PhoneCameraTuning = { ...DEFAULT_PHONE_CAMERA_TUNING, send: "batch", source: "total", present: "playout" };
/** How it first worked: drawn on arrival, for the lowest delay. */
const ORIGINAL: PhoneCameraTuning = { ...DEFAULT_PHONE_CAMERA_TUNING, send: "timer", source: "delta", present: "arrival" };

describe("phone camera tuning", () => {
  it("defaults to smooth, paced drawing and keeps only valid values", () => {
    expect(DEFAULT_PHONE_CAMERA_TUNING).toEqual({ ...RECOMMENDED, bufferMs: 12, catchUp: 2, predictMs: 0, chaseFrame: "attitude" });
    expect(normalizePhoneCameraTuning(null)).toEqual(DEFAULT_PHONE_CAMERA_TUNING);
    expect(normalizePhoneCameraTuning({ send: "sometimes", bufferMs: 13, catchUp: 2, predictMs: 160, chaseFrame: "heading" } as never))
      .toEqual({ ...DEFAULT_PHONE_CAMERA_TUNING, bufferMs: 13, chaseFrame: "heading" });
  });

  it("lives in the osfs.camera parameters, with a catch-up of 0 kept as Jump", () => {
    const parameters = flightParameterDefaults();
    parameters.setMany(phoneCameraTuningValues({ ...RECOMMENDED, bufferMs: 16, catchUp: 0 }));
    expect(parameters.get("osfs.camera.phone.catchUp")).toBe("jump");
    expect(readPhoneCameraTuning(parameters)).toEqual({ ...RECOMMENDED, bufferMs: 16, catchUp: 0 });
  });

  it("migrates the old record once, and ignores a corrupt one", () => {
    expect(migratePhoneCameraTuning(JSON.stringify({ ...RECOMMENDED, chaseFrame: "no-roll" })))
      .toMatchObject({ "osfs.camera.phone.send": "batch", "osfs.camera.phone.bufferMs": 12, "osfs.camera.chaseFrame": "no-roll" });
    expect(migratePhoneCameraTuning("{not json")).toBeNull();
  });

  it("names a combination so a trace can be split by it", () => {
    expect(describePhoneCameraTuning(ORIGINAL)).toBe("timer · delta · arrival · attitude");
    expect(describePhoneCameraTuning({ ...RECOMMENDED, catchUp: 0, predictMs: 8 }))
      .toBe("batch · total · playout 12ms jump predict8 · attitude");
  });
});
