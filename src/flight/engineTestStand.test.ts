import { describe, expect, it } from "vitest";
import { engineTestStandBootstrapOptions, engineTestStandInitialState, isEngineTestStandRequested, makeEngineTestStandUrl } from "./engineTestStand";

describe("engine test stand", () => {
  it("requires the explicit URL flag rather than a truthy-looking value", () => {
    for (const search of ["", "?engineTest", "?engineTest=0", "?engineTest=true", "?engineTest=01", "?engineTest=2", "?EngineTest=1"]) {
      expect(isEngineTestStandRequested(search)).toBe(false);
    }
    expect(isEngineTestStandRequested("?aircraft=f-35b&engineTest=1")).toBe(true);
    const search = new URLSearchParams("engineTest=1&aircraft=cirrus-vision-jet");
    expect(isEngineTestStandRequested(search)).toBe(true);
    expect(search.toString()).toBe("engineTest=1&aircraft=cirrus-vision-jet");
  });

  it("enters and leaves the stand without changing the aircraft, route or input URL", () => {
    const source = new URL("https://example.test/fly?aircraft=f-35b&view=nozzle#engine");
    const entered = makeEngineTestStandUrl(source, true);
    expect(entered.href).toBe("https://example.test/fly?aircraft=f-35b&view=nozzle&engineTest=1&engineStart=cold#engine");
    expect(source.href).toBe("https://example.test/fly?aircraft=f-35b&view=nozzle#engine");
    const left = makeEngineTestStandUrl(entered, false);
    expect(left.href).toBe(source.href);
    expect(entered.searchParams.get("engineTest")).toBe("1");
  });

  it("canonicalizes or removes duplicate mode flags while preserving other repeated parameters", () => {
    const source = new URL("https://example.test/rc?engineTest=0&tag=a&engineTest=1&tag=b");
    const entered = makeEngineTestStandUrl(source, true);
    expect(entered.searchParams.getAll("engineTest")).toEqual(["1"]);
    expect(entered.searchParams.getAll("tag")).toEqual(["a", "b"]);
    expect(makeEngineTestStandUrl(source, false).searchParams.has("engineTest")).toBe(false);
    expect(source.searchParams.getAll("engineTest")).toEqual(["0", "1"]);
  });

  it("starts at MSP runway 35 cold-soaked and stopped with zero airspeed and native hold-down", () => {
    expect(engineTestStandBootstrapOptions()).toEqual({
      latDeg: 44.866176833333334,
      lonDeg: -93.23664458333333,
      headingDeg: 350,
      altFt: 833.3,
      airspeedKts: 0,
      throttleNorm: 0,
      engineRunning: false,
      holdDown: true,
    });
  });

  it("requires explicit already-running initialization and keeps it separate from ordinary cold starts", () => {
    for (const query of ["", "?engineStart=cold", "?engineStart=true", "?engineStart=hot"]) {
      expect(engineTestStandInitialState(query)).toBe("cold");
    }
    expect(engineTestStandInitialState("?engineStart=running")).toBe("running");
    expect(engineTestStandBootstrapOptions("running").engineRunning).toBe(true);
    const source = new URL("https://example.test/?aircraft=f-35b");
    const warm = makeEngineTestStandUrl(source, true, "running");
    expect(warm.searchParams.get("engineStart")).toBe("running");
    expect(makeEngineTestStandUrl(warm, false).href).toBe(source.href);
  });

  it("returns independent initial conditions so a move does not rewrite the next stand's runway default", () => {
    const moved = engineTestStandBootstrapOptions();
    moved.latDeg = 0;
    moved.altFt = 5000;
    expect(engineTestStandBootstrapOptions()).toMatchObject({ latDeg: 44.866176833333334, altFt: 833.3 });
  });
});
