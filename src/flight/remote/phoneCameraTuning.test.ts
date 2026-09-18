import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHONE_CAMERA_TUNING, RECOMMENDED_PHONE_CAMERA_TUNING, describePhoneCameraTuning, loadPhoneCameraTuning,
  normalizePhoneCameraTuning, savePhoneCameraTuning, samePhoneCameraTuning,
} from "./phoneCameraTuning";

describe("phone camera tuning", () => {
  it("defaults to the original behaviour and keeps only offered values", () => {
    expect(DEFAULT_PHONE_CAMERA_TUNING).toMatchObject({ send: "timer", source: "delta", present: "arrival", chaseFrame: "attitude" });
    expect(normalizePhoneCameraTuning(null)).toEqual(DEFAULT_PHONE_CAMERA_TUNING);
    expect(normalizePhoneCameraTuning({ send: "sometimes", bufferMs: 13, catchUp: 2, predictMs: 16, chaseFrame: "heading" } as never))
      .toEqual({ ...DEFAULT_PHONE_CAMERA_TUNING, predictMs: 16, chaseFrame: "heading" });
  });

  it("persists through storage and survives a corrupt entry", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
    savePhoneCameraTuning({ ...RECOMMENDED_PHONE_CAMERA_TUNING, bufferMs: 16 }, storage);
    expect(loadPhoneCameraTuning(storage)).toEqual({ ...RECOMMENDED_PHONE_CAMERA_TUNING, bufferMs: 16 });
    store.set("osfs.phone-camera-tuning", "{not json");
    expect(loadPhoneCameraTuning(storage)).toEqual(DEFAULT_PHONE_CAMERA_TUNING);
  });

  it("names a combination so a trace can be split by it", () => {
    expect(describePhoneCameraTuning(DEFAULT_PHONE_CAMERA_TUNING)).toBe("timer · delta · arrival · attitude");
    expect(describePhoneCameraTuning({ ...RECOMMENDED_PHONE_CAMERA_TUNING, catchUp: 0, predictMs: 8 }))
      .toBe("batch · total · playout 12ms jump predict8 · attitude");
    expect(samePhoneCameraTuning(DEFAULT_PHONE_CAMERA_TUNING, { ...DEFAULT_PHONE_CAMERA_TUNING })).toBe(true);
    expect(samePhoneCameraTuning(DEFAULT_PHONE_CAMERA_TUNING, RECOMMENDED_PHONE_CAMERA_TUNING)).toBe(false);
  });
});
