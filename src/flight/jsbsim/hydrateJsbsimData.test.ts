import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadJsbsimData, hydrateJsbsimData, resolveAircraftDataFiles } from "./hydrateJsbsimData";

const dataRoot = path.resolve("public/jsbsim-data");
const manifest = JSON.parse(readFileSync(path.join(dataRoot, "manifest.json"), "utf8"));

afterEach(() => { vi.unstubAllGlobals(); });

describe("F-35B flight data hydration", () => {
  it("downloads and writes the real F-35B package without loading another aircraft", async () => {
    const packageFiles = resolveAircraftDataFiles(manifest, "f-35b");
    expect(packageFiles).toContain("aircraft/F-35B-jsbsim/F-35B-jsbsim.xml");
    expect(packageFiles).toContain("aircraft/F-35B-jsbsim/Engines/F135-PW-600.xml");
    expect(packageFiles.every(file => file.startsWith("aircraft/F-35B-jsbsim/"))).toBe(true);
    const baseUrl = "/f35b-hydration-test";
    const fetch = vi.fn(async (url: string) => {
      if (url === `${baseUrl}/manifest.json`) return new Response(JSON.stringify(manifest));
      const relativePath = url.slice(baseUrl.length + 1);
      expect(packageFiles).toContain(relativePath);
      return new Response(readFileSync(path.join(dataRoot, relativePath), "utf8"));
    });
    vi.stubGlobal("fetch", fetch);
    const files = await downloadJsbsimData(baseUrl, undefined, "f-35b");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      `${baseUrl}/manifest.json`, ...packageFiles.map(file => `${baseUrl}/${file}`),
    ]);
    expect(files.map(file => file.path)).toEqual(packageFiles);
    expect(files.every(file => file.contents.length > 0)).toBe(true);
    const writeDataFile = vi.fn();
    await hydrateJsbsimData({ writeDataFile } as never, baseUrl, "f-35b");
    expect(writeDataFile.mock.calls).toEqual(files.map(file => [file.path, file.contents]));
    // Hydration consumes the already acquired package, without fetching it again.
    expect(fetch).toHaveBeenCalledTimes(packageFiles.length + 1);
  });
});

describe("F-35B empirical engine package", () => {
  it("holds the empirical model's own files and only the F-35B thruster and pushback it shares", () => {
    const files = resolveAircraftDataFiles(manifest, "f-35b-empirical-engine");
    expect(files.filter(file => !file.startsWith("aircraft/F-35B-jsbsim-empirical/"))).toEqual([
      "aircraft/F-35B-jsbsim/Engines/direct.xml", "aircraft/F-35B-jsbsim/Systems/pushback.xml",
    ]);
    expect(files).toContain("aircraft/F-35B-jsbsim-empirical/F-35B-jsbsim-empirical.xml");
    for (const file of files) expect(readFileSync(path.join(dataRoot, file), "utf8").length, file).toBeGreaterThan(0);
  });
});
