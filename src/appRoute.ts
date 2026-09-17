export type AppRoute = "info" | "flight" | "globe" | "remote";

export const FOSS_EARTH_URL = "https://foss-earth.github.io/";

function defaultBase(): string {
  return import.meta.env.BASE_URL;
}

function basePrefix(base: string): string {
  const basePath = new URL(base, "https://example.invalid").pathname;
  return basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
}

/**
 * Pathname relative to the Vite base, always starting with `/` and without a
 * trailing slash except for the site root.
 */
export function pathAfterBase(pathname: string, base = defaultBase()): string {
  const prefix = basePrefix(base);
  let rest: string;
  if (prefix && pathname !== prefix && !pathname.startsWith(`${prefix}/`)) {
    return "/";
  }
  if (!prefix) {
    rest = pathname;
  } else if (pathname === prefix) {
    rest = "/";
  } else {
    rest = pathname.slice(prefix.length) || "/";
  }
  if (rest.length > 1 && rest.endsWith("/")) rest = rest.slice(0, -1);
  return rest === "" ? "/" : rest;
}

export function isAppPath(pathname: string, segment: "fly" | "rc", base = defaultBase()): boolean {
  return pathAfterBase(pathname, base) === `/${segment}`;
}

export function appRouteFrom(url: URL, base = defaultBase()): AppRoute {
  const mode = url.searchParams.get("mode");
  if (mode === "remote" || isAppPath(url.pathname, "rc", base)) return "remote";
  if (mode === "globe") return "globe";
  if (mode === "flight" || isAppPath(url.pathname, "fly", base)) return "flight";
  return "info";
}

/** Same-origin path + search + hash for `/fly/` or `/rc/`, dropping `mode`. */
export function appHref(segment: "fly" | "rc", from: URL, base = defaultBase()): string {
  const url = new URL(`${segment}/`, new URL(base, from.origin));
  const params = new URLSearchParams(from.search);
  params.delete("mode");
  url.search = params.toString();
  url.hash = from.hash;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function flightHref(from: URL, base = defaultBase()): string {
  return appHref("fly", from, base);
}

/** Canonical `/fly/` or `/rc/` URL when the current location still uses a query mode. */
export function canonicalAppLocation(from: URL, base = defaultBase()): string | null {
  const route = appRouteFrom(from, base);
  if (route === "remote" && !isAppPath(from.pathname, "rc", base)) return appHref("rc", from, base);
  if (route === "flight" && !isAppPath(from.pathname, "fly", base)) return appHref("fly", from, base);
  return null;
}
