// The fixed telemetry script from docs/sound.md §5, saved at its proposed path.
// Run from the repository root: node benchmarks/audio/generate-sweep.mjs > sweep.jsonl
//
// SYNTHETIC STRESS INPUT, not an FJ33 procedure or a validated response. The
// keyframe table is read from sound.md itself, so editing the table without
// versioning the fixture fails loudly instead of silently changing results.
import { readFileSync } from "node:fs";
const doc = readFileSync("docs/sound.md", "utf8");
const rows = [...doc.matchAll(/^\| (\d+) \| ([\d.]+) \/ ([\d.]+) \| ([\d.]+) \/ ([\d.]+) \| ([\d.]+) \|/gm)]
  .map(m => m.slice(1).map(Number));
if (rows.length !== 13 || rows[0][0] !== 0 || rows.at(-1)[0] !== 240)
  throw new Error("Unexpected sweep table; revise/version the fixture explicitly");
const ramp = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
for (let i = 0, j = 0; i < 240 * 60; i++) {
  const time = i / 60;
  while (j + 1 < rows.length - 1 && time >= rows[j + 1][0]) j++;
  const a = rows[j], b = rows[j + 1], u = ramp(time, a[0], b[0]);
  const [n1, n2, flow, thrustLbf, kias] = a.slice(1).map((v, k) => v + u * (b[k + 1] - v));
  const combustion = time >= 12 && time < 180;
  const cycle = ramp(time, 160, 170) - ramp(time, 170, 180);
  const exterior = time >= 140 && time < 160;
  const throttle = time < 100 ? ramp(time, 40, 80)
    : time < 120 ? 0 : time < 180 ? 1 - 0.3 * ramp(time, 120, 140) : 0;
  process.stdout.write(JSON.stringify({
    sequence: i, epoch: 1, time, seed: 0x53463530,
    n1, n2, thrustLbf, kias, fuelLbPerSec: combustion ? flow / 3600 : 0,
    starter: time >= 5 && time < 20, cutoff: !combustion,
    combustion, running: time >= 20 && time < 180, throttle,
    gear: 1 - ramp(time, 60, 70) + cycle, flap: cycle,
    view: exterior ? "exterior" : "cockpit",
    // Fixed bench coordinates; cockpit listener follows this emitter.
    sourceMetres: exterior ? [-1000 + 100 * (time - 140), 10, 50] : [0, 10, 50],
    sourceVelocityMps: exterior ? [100, 0, 0] : [0, 0, 0],
    soundSpeedMps: 343,
  }) + "\n");
}
