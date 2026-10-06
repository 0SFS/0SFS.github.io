import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderTopViews, TOP_VIEWS_OUTPUT } from "./build-aircraft-top-views.mjs";

describe("aircraft top views", () => {
  it("match a fresh trace of the exterior models; run the script again when a model moves", () => {
    expect(readFileSync(TOP_VIEWS_OUTPUT, "utf8")).toBe(renderTopViews());
  });
});
