// Checked edits to development responses only; the production simulator is untouched.
function replaceOnce(source, pattern, replacement, label) {
  if ([...source.matchAll(pattern)].length !== 1) throw new Error(`Simulator ${label} anchor changed; update capture before recording.`);
  return source.replace(pattern, replacement);
}

export function instrumentFlight(source, driver, clearance) {
  source = replaceOnce(source, /runtime\.setSimTick\(\(deltaSeconds\)\s*=>\s*\{/g, 'const landingCaptureTick = (deltaSeconds) => {', 'tick');
  source = replaceOnce(source, /\n\s*\}\);\s*\n\s*const revealAircraft\s*=/g, `\n};\n${driver}\nconst revealAircraft =`, 'capture');
  source = replaceOnce(source, /altitudeMeters: preview\.altMeters,/g,
    '...(window.__osfsHero?.spawnRequest ? { altitudeAboveGroundMeters: window.__osfsHero.spawnRequest } : { altitudeMeters: preview.altMeters }),', 'relocation height');
  return replaceOnce(source, /clearanceMeters:\s*benchmarkRoute\s*\?\s*0\s*:\s*(?:1000|1e\+?3)\b/g, `clearanceMeters: benchmarkRoute ? 0 : ${clearance}`, 'spawn-clearance');
}

export function instrumentVideoTab(source) {
  // Reuse Vite's JSX factory; no production tab or React dependency is added to the landing page.
  const factory = source.match(/const (\w+) = [^;\n]+\["jsxDEV"\]/)?.[1]
    ?? source.match(/import\s*\{\s*jsxDEV\s+as\s+(\w+)\s*\}\s*from/)?.[1];
  if (!factory) throw new Error('Simulator JSX factory anchor changed.');
  source = `const heroVideoPortal = () => ${factory}("div", { ref: window.__osfsHero.mountTab }, undefined, false, undefined, undefined);\n` + source;
  source = replaceOnce(source, /const TAB_DEFINITIONS = \[/g, 'const TAB_DEFINITIONS = [{ id: "hero-video", label: "Video" },', 'tab definitions');
  return replaceOnce(source, /renderAdditionalTab:\s*\(tabId\)\s*=>\s*\{/g,
    'renderAdditionalTab: (tabId) => { if (tabId === "hero-video") return heroVideoPortal();', 'tab renderer');
}
