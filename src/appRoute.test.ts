import { describe, expect, it } from "vitest";
import {
  appHref,
  appRouteFrom,
  canonicalAppLocation,
  flightHref,
  FOSS_EARTH_URL,
  isAppPath,
  pathAfterBase,
} from "./appRoute";

describe("pathAfterBase", () => {
  it("strips a domain-root base", () => {
    expect(pathAfterBase("/", "/")).toBe("/");
    expect(pathAfterBase("/fly", "/")).toBe("/fly");
    expect(pathAfterBase("/fly/", "/")).toBe("/fly");
    expect(pathAfterBase("/rc/", "/")).toBe("/rc");
  });

  it("strips a project-site base", () => {
    expect(pathAfterBase("/repo/", "/repo/")).toBe("/");
    expect(pathAfterBase("/repo", "/repo/")).toBe("/");
    expect(pathAfterBase("/repo/fly/", "/repo/")).toBe("/fly");
    expect(pathAfterBase("/repo/rc", "/repo/")).toBe("/rc");
  });

  it("treats paths outside the base as the site root", () => {
    expect(pathAfterBase("/fly", "/repo/")).toBe("/");
  });
});

describe("appRouteFrom", () => {
  it.each([
    ["https://0sfs.github.io/", "info"],
    ["https://0sfs.github.io/?mode=unknown", "info"],
    ["https://0sfs.github.io/fly", "flight"],
    ["https://0sfs.github.io/fly/", "flight"],
    ["https://0sfs.github.io/?mode=flight", "flight"],
    ["https://0sfs.github.io/?mode=flight&renderer=webgl2", "flight"],
    ["https://0sfs.github.io/rc", "remote"],
    ["https://0sfs.github.io/rc/", "remote"],
    ["https://0sfs.github.io/?mode=remote", "remote"],
    ["https://0sfs.github.io/?mode=remote#v=1&peer=desktop&join=secret", "remote"],
    ["https://0sfs.github.io/fly/?mode=remote", "remote"],
    ["https://0sfs.github.io/?mode=globe", "globe"],
  ] as const)("%s → %s", (href, route) => {
    expect(appRouteFrom(new URL(href))).toBe(route);
  });

  it("names the FOSS Earth site for the globe redirect", () => {
    expect(FOSS_EARTH_URL).toBe("https://foss-earth.github.io/");
  });

  it("resolves /repo/fly and /repo/rc under a project-site base", () => {
    expect(appRouteFrom(new URL("https://example.test/repo/"), "/repo/")).toBe("info");
    expect(appRouteFrom(new URL("https://example.test/repo/fly/"), "/repo/")).toBe("flight");
    expect(appRouteFrom(new URL("https://example.test/repo/rc/"), "/repo/")).toBe("remote");
  });
});

describe("appHref", () => {
  it("builds /fly/ and keeps query parameters other than mode", () => {
    expect(flightHref(new URL("https://0sfs.github.io/?renderer=webgl2&mode=flight&key=abc"))).toBe(
      "/fly/?renderer=webgl2&key=abc",
    );
    expect(appHref("rc", new URL("https://0sfs.github.io/?mode=remote#v=1&peer=d&join=s"))).toBe(
      "/rc/#v=1&peer=d&join=s",
    );
  });

  it("prefixes a project-site base", () => {
    expect(flightHref(new URL("https://example.test/repo/?mapSource=osm-standard"), "/repo/")).toBe(
      "/repo/fly/?mapSource=osm-standard",
    );
  });
});

describe("canonicalAppLocation", () => {
  it("rewrites query modes onto /fly/ and /rc/ without dropping the hash", () => {
    expect(canonicalAppLocation(new URL("https://0sfs.github.io/?mode=flight&key=k"))).toBe("/fly/?key=k");
    expect(canonicalAppLocation(new URL("https://0sfs.github.io/?mode=remote#v=1&peer=d&join=s"))).toBe(
      "/rc/#v=1&peer=d&join=s",
    );
    expect(canonicalAppLocation(new URL("https://0sfs.github.io/fly/"))).toBeNull();
    expect(canonicalAppLocation(new URL("https://0sfs.github.io/rc/"))).toBeNull();
    expect(canonicalAppLocation(new URL("https://0sfs.github.io/"))).toBeNull();
  });

  it("recognizes fly and rc pathnames with or without a trailing slash", () => {
    expect(isAppPath("/fly", "fly")).toBe(true);
    expect(isAppPath("/fly/", "fly")).toBe(true);
    expect(isAppPath("/rc", "rc")).toBe(true);
    expect(isAppPath("/", "fly")).toBe(false);
  });
});
