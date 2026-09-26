import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pageHtmlFor } from "./pages-html.mjs";

const home = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("pageHtmlFor", () => {
  it("gives /fly/ its own title and canonical address, without the WebSite data", () => {
    const fly = pageHtmlFor("fly", home);
    expect(fly).toContain("<title>Fly — 0SFS</title>");
    expect(fly).toContain('<link rel="canonical" href="https://0sfs.github.io/fly/" />');
    expect(fly).toContain('<meta property="og:url" content="https://0sfs.github.io/fly/"');
    expect(fly).not.toContain("application/ld+json");
    expect(fly).not.toContain("noindex");
  });

  it("keeps /rc/ out of search", () => {
    const rc = pageHtmlFor("rc", home);
    expect(rc).toContain('<meta name="robots" content="noindex" />');
    expect(rc).not.toContain('rel="canonical"');
    expect(rc).not.toContain("application/ld+json");
    expect(rc).toContain("<title>0SFS RC — Phone Controller</title>");
  });

  it("leaves the home page's tags for the home page", () => {
    expect(home).toContain('<link rel="canonical" href="https://0sfs.github.io/" />');
    expect(home).toContain("application/ld+json");
  });

  it("fails the build when index.html loses a tag it rewrites", () => {
    expect(() => pageHtmlFor("fly", home.replace(/<link rel="canonical"[^>]*>/, ""))).toThrow(/canonical/);
  });
});
