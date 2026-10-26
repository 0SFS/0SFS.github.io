/** Preserve address settings and feedback fragments when entering the flight. */
export function flightHref(href, basemap) {
  const current = new URL(href);
  const next = new URL("fly/", current);
  next.search = current.search;
  next.searchParams.delete("mode");
  next.searchParams.set("set.map.source.basemap", basemap);
  return next.pathname + next.search + current.hash;
}
