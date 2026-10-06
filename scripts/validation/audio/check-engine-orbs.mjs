// Shader / presentation correctness only. No server, frame timing, or device qualification.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import { evaluate, openHeadlessChrome } from "../../headless-chrome.mjs";
import { newOutputDirectory } from "../../outputDirectory.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const out = newOutputDirectory("validation", "engine-orbs-gpu");
const fixture = path.join(out, "fixture");
await mkdir(fixture);
const source = `
import {createEngineSummary} from ${JSON.stringify(path.join(root, "src/flight/hud/engineSummary.ts"))};
import {createEngineSpoolRenderer} from ${JSON.stringify(path.join(root, "src/flight/hud/engineSpoolRenderer.ts"))};
import {C172_ROTOR_BLADES,FJ33_ROTOR_BLADES,F135_ROTOR_BLADES} from ${JSON.stringify(path.join(root, "src/flight/aircraft/engineRotorDefinitions.ts"))};
window.checkEngineOrbs = async () => {
  const errors = [], cases = [], renderers = [];
  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();
  device?.addEventListener('uncapturederror', event => errors.push(event.error.message));
  window.releaseEngineOrbs = () => { for (const renderer of renderers) renderer.destroy(); device?.destroy(); };
  const gpu = adapter ? {vendor:adapter.info.vendor, architecture:adapter.info.architecture, device:adapter.info.device, description:adapter.info.description} : null;
  const nextFrame = () => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  // Count disconnected alpha islands on the real rendered surface. This is
  // independent of the shader's angular formula and catches satellite dots,
  // missing/merged blades, and a different small/large-marker population.
  const countMarkers = canvas => {
    const copy=document.createElement('canvas'); copy.width=canvas.width; copy.height=canvas.height;
    const ctx=copy.getContext('2d'); ctx.drawImage(canvas,0,0);
    const pixels=ctx.getImageData(0,0,copy.width,copy.height).data;
    const visited=new Uint8Array(copy.width*copy.height), groups={outer:[],inner:[]};
    for(let i=0;i<visited.length;i++) {
      if(visited[i] || pixels[i*4+3]<128) continue;
      const pending=[i];visited[i]=1;let area=0;
      const kind=pixels[i*4]>pixels[i*4+2]?'inner':'outer';
      while(pending.length) {
        const at=pending.pop();area++;
        const x=at%copy.width;
        for(const adjacent of [x>0?at-1:-1,x+1<copy.width?at+1:-1,at-copy.width,at+copy.width]) {
          if(adjacent<0||adjacent>=visited.length||visited[adjacent]||pixels[adjacent*4+3]<128)continue;
          visited[adjacent]=1;pending.push(adjacent);
        }
      }
      groups[kind].push(area);
    }
    return Object.fromEntries(Object.entries(groups).map(([key,areas])=>[key,{count:areas.length,minArea:areas.length?Math.min(...areas):0,maxArea:areas.length?Math.max(...areas):0}]));
  };
  for (const preference of ['webgpu','webgl2','webgl1']) {
    const row = document.createElement('section');
    row.className='flight-engine'; row.style.cssText='display:flex;gap:28px;align-items:center;margin:24px';
    const label = document.createElement('span'); label.textContent=preference; label.style.width='70px'; row.append(label);
    document.body.append(row);
    for (const [label,rotorBlades,piston] of [['F-35B',F135_ROTOR_BLADES,false],['SF50',FJ33_ROTOR_BLADES,false],['C172',C172_ROTOR_BLADES,true]]) {
      const summary = createEngineSummary();
      row.append(summary.diagram,summary.values);
      summary.render({kind:piston?'piston':'turbine',rotorBlades,phase:'running',label,n1Pct:piston?null:30,n2Pct:piston?null:60,rpm:piston?1350:null,maxRpm:2700,maxN1Pct:100,maxN2Pct:100,thrustLbf:1900,fuelFlowPph:120,fuelFlowGph:null},'lb/h');
      const renderer = createEngineSpoolRenderer(summary.spools,{device:device??null,preference,maxFps:30,pixelRatio:2,outerBlades:rotorBlades.outer,innerBlades:rotorBlades.inner??0});
      renderers.push(renderer);
      const backend = await renderer.ready;
      // Enlarge only for exact connected-component counts; restore the real
      // HUD size for the presentation screenshot below.
      summary.spools.style.width=summary.spools.style.height='400px';
      await nextFrame();
      renderer.draw({outerAngle:1.1,innerAngle:piston?null:4.2},performance.now());
      // Copy in the same task as submission: WebGPU expires a canvas's
      // current texture at presentation, even though its last image remains
      // visible to the compositor. A later-task drawImage can read blank.
      const markers=countMarkers(summary.spools.querySelector('canvas'));
      await device?.queue.onSubmittedWorkDone();
      summary.spools.style.width=summary.spools.style.height='';
      await nextFrame();
      renderer.draw({outerAngle:1.1,innerAngle:piston?null:4.2},performance.now());
      await device?.queue.onSubmittedWorkDone();
      cases.push({requested:preference,label,piston,rotorBlades,markers,backend,status:renderer.status,canvases:summary.spools.querySelectorAll('canvas').length,
        outerSize:summary.spools.clientWidth,innerVisible:getComputedStyle(summary.spools.querySelector('.flight-engine__spool--n2')).display!=='none',
        rpmVisible:getComputedStyle(summary.spools.querySelector('.flight-engine__rpm')).display!=='none'});
    }
  }
  return {gpu,cases,errors};
};
`;
await writeFile(path.join(fixture, "entry.js"), source);
const built = await build({
  root, configFile: false, publicDir: false, logLevel: "warn",
  build: { write: false, minify: false, lib: { entry: path.join(fixture, "entry.js"), formats: ["iife"], name: "EngineOrbCheck" } },
});
const output = (Array.isArray(built) ? built[0] : built).output;
const chunk = output.find(item => item.type === "chunk");
const css = output.filter(item => item.type === "asset" && item.fileName.endsWith(".css")).map(item => item.source).join("\n");
await writeFile(path.join(out, "bundle.js"), chunk.code);
await writeFile(path.join(out, "index.html"), `<!doctype html><meta charset="utf-8"><title>Engine orb validation</title><style>body{background:#171d24;color:#eee}${css}</style><script src="bundle.js"></script>`);

const chrome = await openHeadlessChrome(path.join(out, "profile"));
let report;
try {
  const { targetId } = await chrome.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await chrome.send("Target.attachToTarget", { targetId, flatten: true });
  await chrome.send("Page.enable", {}, sessionId);
  await chrome.send("Emulation.setDeviceMetricsOverride", { width: 620, height: 600, deviceScaleFactor: 2, mobile: false }, sessionId);
  await chrome.send("Page.navigate", { url: pathToFileURL(path.join(out, "index.html")).href }, sessionId);
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(chrome, sessionId, "typeof window.checkEngineOrbs === 'function'")) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  report = await evaluate(chrome, sessionId, "window.checkEngineOrbs()");
  const screenshot = await chrome.send("Page.captureScreenshot", { format: "png" }, sessionId);
  await writeFile(path.join(out, "engine-orbs.png"), Buffer.from(screenshot.data, "base64"));
  report.browser = await chrome.send("Browser.getVersion");
  report.kind = "untimed-engine-orb-shader-and-presentation-check";
  report.createdUtc = new Date().toISOString();
  report.limitations = "No frame/GPU timing or device performance qualification. Screenshot requires visual review.";
  report.pass = report.errors.length === 0 && report.cases.every(item => item.backend === item.requested
    && item.canvases === 1 && item.outerSize > 0 && item.rpmVisible === item.piston && item.innerVisible !== item.piston
    && item.markers.outer.count === item.rotorBlades.outer && item.markers.inner.count === (item.rotorBlades.inner??0)
    && item.markers.outer.maxArea <= 1.15*item.markers.outer.minArea
    && item.markers.inner.maxArea <= 1.15*item.markers.inner.minArea);
  await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await evaluate(chrome, sessionId, "window.releaseEngineOrbs()");
} finally {
  // The legacy helper signals after its timeout; this check only closes cleanly and observes exit.
  await chrome.send("Browser.close").catch(() => {});
  await chrome.waitForExit();
}
console.log(await readFile(path.join(out, "report.json"), "utf8"));
console.log(out);
if (!report.pass) process.exitCode = 1;
