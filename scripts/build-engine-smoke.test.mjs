import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateEngineSmokeSprite } from "./build-engine-smoke.mjs";

describe("precompiled aircraft smoke sprite", () => {
  it("reproduces the small installed original flipbook and retains its assumptions/provenance", () => {
    const artifacts = generateEngineSmokeSprite();
    const again = generateEngineSmokeSprite();
    for (const [name, bytes] of Object.entries(artifacts)) {
      expect(bytes.equals(again[name])).toBe(true);
      expect(bytes.equals(readFileSync(new URL(`../src/flight/aircraft/generated/${name}`, import.meta.url)))).toBe(true);
    }
    const manifest = JSON.parse(artifacts["engine-smoke-flipbook.manifest.json"]);
    expect(manifest.outputs[0]).toMatchObject({ width: 128, height: 128, columns: 4, rows: 4 });
    expect(manifest.assumptions.join(" ")).toContain("not a measured F135");
    expect(artifacts["engine-smoke-flipbook.png"].length).toBeLessThan(16000);
  });
});
