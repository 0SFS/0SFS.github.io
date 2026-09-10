import { build } from "vite";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const moduleName = process.env.PLAYWRIGHT_MODULE;
let chromium;
try {
  ({ chromium } = await import(moduleName ? pathToFileURL(path.resolve(moduleName)).href : "playwright"));
} catch (error) {
  throw new Error("Install Playwright separately and set PLAYWRIGHT_MODULE to its index.mjs, or install playwright in this project.", { cause: error });
}

const scriptedChirp = [
  { timeSeconds: 0, slipPowerWatts: 0 },
  ...Array.from({ length: 36 }, (_, i) => ({ timeSeconds: 0.15 + i / 120, slipPowerWatts: 15_000 * Math.exp(-i / 5) })),
  { timeSeconds: 0.45, slipPowerWatts: 0 },
];
const suppliedManifest = process.argv[2];
const comparison = suppliedManifest ? JSON.parse(readFileSync(suppliedManifest, "utf8")) : {
  durationSeconds: 2,
  sampleRate: 48_000,
  scenarios: [
    { name: "A-pure-rolling", samples: [{ timeSeconds: 0, slipPowerWatts: 0 }] },
    { name: "B-scripted-spinup", samples: scriptedChirp },
    { name: "B-repeat", samples: scriptedChirp },
    { name: "pause-silence", samples: [{ timeSeconds: 0.15, slipPowerWatts: 15_000 }], silenceAtSeconds: 0.4 },
    { name: "bounded-loud-input", samples: [{ timeSeconds: 0, slipPowerWatts: 1e30 }] },
  ],
};
const outputDirectory = process.argv[3] ? path.resolve(process.argv[3]) : mkdtempSync(path.join(tmpdir(), "tire-audio-check-"));
mkdirSync(outputDirectory, { recursive: true });
const result = await build({
  root,
  configFile: false,
  publicDir: false,
  logLevel: "warn",
  build: {
    write: false,
    minify: false,
    lib: { entry: fileURLToPath(new URL("tireAudioOffline.entry.ts", import.meta.url)), formats: ["iife"], name: "TireAudioOffline" },
  },
});
const output = (Array.isArray(result) ? result[0] : result).output;
writeFileSync(path.join(outputDirectory, "bundle.js"), output.find((item) => item.type === "chunk").code);
writeFileSync(path.join(outputDirectory, "index.html"), "<!doctype html><meta charset=\"utf-8\"><title>Offline tire audio check</title><body></body>");
const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(outputDirectory, "index.html")).href);
  await page.addScriptTag({ path: path.join(outputDirectory, "bundle.js") });
  const rendered = await page.evaluate((input) => window.renderTireAudioComparison(input), comparison);
  if (errors.length) throw new Error(errors.join("\n"));
  for (const row of rendered) {
    if (!row.finite || row.peak >= 0.1) throw new Error(`Invalid or excessive output: ${row.name}, peak=${row.peak}`);
  }
  if (!suppliedManifest) {
    const [silent, chirp, repeat, pause] = rendered;
    if (silent.peak !== 0 || chirp.peak < 1e-5 || chirp.earlyRms !== 0 || chirp.lateRms >= 1e-6 || pause.lateRms !== 0) {
      throw new Error("Expected rolling silence, an isolated spin-up chirp, and immediate pause silence.");
    }
    if (chirp.wavBase64 !== repeat.wavBase64) throw new Error("Offline repeated renders were not deterministic.");
  }
  const report = {
    environment: { browserVersion: browser.version(), mode: "OfflineAudioContext in isolated headless Chromium; file URL; no speakers or server" },
    input: comparison,
    results: rendered.map(({ wavBase64, ...metrics }) => {
      const filename = `${metrics.name.replace(/[^a-zA-Z0-9_-]/g, "-")}.wav`;
      writeFileSync(path.join(outputDirectory, filename), Buffer.from(wavBase64, "base64"));
      return { ...metrics, wavFile: filename };
    }),
  };
  writeFileSync(path.join(outputDirectory, "results.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outputDirectory, environment: report.environment, results: report.results }, null, 2));
} finally {
  await browser.close();
}
