import type { C172BootstrapOptions } from "./jsbsim/bootstrapC172";

export type EngineTestStandInitialState = "cold" | "running";

/** An explicit warm shortcut is never confused with an ordinary cold start. */
export function engineTestStandInitialState(search: string | URLSearchParams): EngineTestStandInitialState {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return params.get("engineStart") === "running" ? "running" : "cold";
}

/** This page's test-stand mode is a URL choice, never a saved flight setting. */
export function isEngineTestStandRequested(search: string | URLSearchParams): boolean {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return params.get("engineTest") === "1";
}

/** Change only the test-stand choice, retaining the selected aircraft and route. */
export function makeEngineTestStandUrl(url: URL, active: boolean, initialState: EngineTestStandInitialState = "cold"): URL {
  const next = new URL(url.href);
  if (active) {
    next.searchParams.set("engineTest", "1");
    next.searchParams.set("engineStart", initialState);
  } else {
    next.searchParams.delete("engineTest");
    next.searchParams.delete("engineStart");
  }
  return next;
}

/**
 * A cold-soaked, stopped engine at MSP runway 35's threshold, independent of the saved
 * flight. The loaded terrain supplies final placement and aircraft clearance;
 * subsequent moves use the same Locations UI as a flight.
 *
 * FAA AIP, AD 2.12 runway 35: 44-51-58.2366N / 93-14-11.9205W,
 * threshold elevation 833.3 ft, true bearing 350 degrees (read 2026-10-06).
 * https://www.faa.gov/air_traffic/publications/atpubs/aip_html/part3_ad_2.0_minnesota.html
 *
 * Bootstrap must apply native setHoldDown(true) after loading the aircraft and
 * before RunIC. Hold-down constrains aircraft motion; accepted fixed steps still
 * advance engine spool, fuel and thermal state. Pause, suspended integration and
 * a zero timestep cannot substitute for it. The app owns standard atmosphere,
 * zero wind and the exclusion of flight assists.
 */
export function engineTestStandBootstrapOptions(initialState: EngineTestStandInitialState = "cold"): C172BootstrapOptions {
  return {
    latDeg: 44 + 51 / 60 + 58.2366 / 3600,
    lonDeg: -(93 + 14 / 60 + 11.9205 / 3600),
    altFt: 833.3,
    headingDeg: 350,
    airspeedKts: 0,
    throttleNorm: 0,
    engineRunning: initialState === "running",
    holdDown: true,
  };
}
