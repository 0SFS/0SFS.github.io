const SITE_URL = "https://0sfs.github.io/";

/**
 * The home page's built index.html, retagged for /fly/ or /rc/. Only the home page
 * carries the WebSite data, /fly/ is its own search result, and /rc/ is kept out of
 * search: see docs/search-visibility.md.
 *
 * @param {"fly" | "rc"} route
 * @param {string} html
 * @returns {string}
 */
export function pageHtmlFor(route, html) {
  const title = route === "fly" ? "Fly — 0SFS" : "0SFS RC — Phone Controller";
  const url = `${SITE_URL}${route}/`;
  /** @type {Array<[RegExp, string]>} */
  const replacements = [
    [/<title>[^<]*<\/title>/, `<title>${title}</title>`],
    [/(<meta property="og:title" content=")[^"]*"/, `$1${title}"`],
    [/(<meta property="og:url" content=")[^"]*"/, `$1${url}"`],
    [/\n\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, ""],
    route === "fly"
      ? [/(<link rel="canonical" href=")[^"]*"/, `$1${url}"`]
      : [/<link rel="canonical" href="[^"]*" ?\/?>/, '<meta name="robots" content="noindex" />'],
  ];
  return replacements.reduce((page, [pattern, replacement]) => {
    if (!pattern.test(page)) throw new Error(`index.html has no match for ${pattern} to retag for /${route}/`);
    return page.replace(pattern, replacement);
  }, html);
}
