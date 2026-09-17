// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createInfoPage } from "./createInfoPage";

describe("createInfoPage", () => {
  it("links Start flying to /fly/ and keeps existing query parameters", () => {
    window.history.replaceState(null, "", "/?renderer=webgl2");
    const root = document.createElement("div");
    createInfoPage(root);
    expect(root.querySelector(".info-page__start")?.getAttribute("href")).toBe("/fly/?renderer=webgl2");
    expect(root.querySelector("h1")?.textContent).toBe("Open Source Flight Simulator");
  });
});
