// Shader / presentation correctness only. No server, frame timing, or device qualification.
import { mkdir, writeFile } from "node:fs/promises";
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
import {DEFAULT_MAX_PATTERN_STEP} from ${JSON.stringify(path.join(root, "src/flight/hud/engineSpoolMotion.ts"))};
import {C172_ROTOR_BLADES,FJ33_ROTOR_BLADES,F135_ROTOR_BLADES} from ${JSON.stringify(path.join(root, "src/flight/aircraft/engineRotorDefinitions.ts"))};
import {f135ExhaustOpticalData} from ${JSON.stringify(path.join(root, "src/flight/aircraft/generated/f135ExhaustOpticalData.ts"))};
window.checkEngineOrbs = async () => {
  const errors = [], cases = [], accentRoundTrips = [], renderers = [];
  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();
  device?.addEventListener('uncapturederror', event => errors.push(event.error.message));
  window.releaseEngineOrbs = () => { for (const renderer of renderers) renderer.destroy(); device?.destroy(); };
  const gpu = adapter ? {vendor:adapter.info.vendor, architecture:adapter.info.architecture, device:adapter.info.device, description:adapter.info.description} : null;
  const nextFrame = () => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  // Count disconnected alpha islands on the real rendered surface. This is
  // independent of the shader's angular formula and catches satellite dots,
  // missing/merged blades, and a different small/large-marker population.
  const normalPalette={outer:[.74,.84,.91],inner:[.91,.71,.28]};
  const accentHex=f135ExhaustOpticalData.hudAccentHex;
  const accentRgb=[1,3,5].map(start=>parseInt(accentHex.slice(start,start+2),16)/255);
  const accentPalette={outer:accentRgb,inner:accentRgb};
  const countMarkers = (canvas,expectedAngles,baseRgb=normalPalette) => {
    const copy=document.createElement('canvas'); copy.width=canvas.width; copy.height=canvas.height;
    const ctx=copy.getContext('2d'); ctx.drawImage(canvas,0,0);
    const pixels=ctx.getImageData(0,0,copy.width,copy.height).data;
    const visited=new Uint8Array(copy.width*copy.height), groups={outer:[],inner:[]};
    let alphaHash=2166136261;
    for(let at=3;at<pixels.length;at+=4)alphaHash=Math.imul(alphaHash^pixels[at],16777619)>>>0;
    for(let i=0;i<visited.length;i++) {
      if(visited[i] || pixels[i*4+3]<128) continue;
      const pending=[i];visited[i]=1;let area=0,interiorPixels=0,sumX=0,sumY=0;
      const minRgb=[255,255,255],maxRgb=[0,0,0],sumRgb=[0,0,0];
      while(pending.length) {
        const at=pending.pop();area++;
        const x=at%copy.width;
        sumX+=x+.5;sumY+=Math.floor(at/copy.width)+.5;
        // Opaque interiors exclude antialiased edges. A blade keeps its own
        // rotor-local brightness while the two opposite hotspots turn.
        if(pixels[at*4+3]>=254) {
          interiorPixels++;
          for(let channel=0;channel<3;channel++) {
            minRgb[channel]=Math.min(minRgb[channel],pixels[at*4+channel]);
            maxRgb[channel]=Math.max(maxRgb[channel],pixels[at*4+channel]);
            sumRgb[channel]+=pixels[at*4+channel];
          }
        }
        for(const adjacent of [x>0?at-1:-1,x+1<copy.width?at+1:-1,at-copy.width,at+copy.width]) {
          if(adjacent<0||adjacent>=visited.length||visited[adjacent]||pixels[adjacent*4+3]<128)continue;
          visited[adjacent]=1;pending.push(adjacent);
        }
      }
      const x=sumX/area-copy.width/2,y=copy.height/2-sumY/area;
      const radius=Math.hypot(x,y)/copy.width;
      // Both rings share the exhaust hue during augmentation, so classify
      // by geometry rather than RGB (midpoint between .48/1.08 and .28/1.08).
      const kind=radius>.38/1.08?'outer':'inner';
      groups[kind].push({area,angle:Math.atan2(x,y),radius,interiorPixels,
        minRgb:interiorPixels?minRgb:null,maxRgb:interiorPixels?maxRgb:null,
        meanRgb:interiorPixels?sumRgb.map(value=>value/interiorPixels):null});
    }
    const result=Object.fromEntries(Object.entries(groups).map(([key,components])=>{
      // A brightness-weighted second angular harmonic tracks the two opposite
      // hotspots. This comes from the rendered pixels; individual blade dots
      // are allowed to alias. The C172's two blades also have this symmetry.
      const weight=component=>component.meanRgb?.reduce((sum,value)=>sum+value,0)??0;
      const totalWeight=components.reduce((sum,component)=>sum+weight(component),0);
      const sumCos=components.reduce((sum,component)=>sum+Math.cos(component.angle*2)*weight(component),0);
      const sumSin=components.reduce((sum,component)=>sum+Math.sin(component.angle*2)*weight(component),0);
      const sectorAngle=2*Math.PI/components.length;
      for(const component of components) {
        const bladeIndex=Math.round((component.angle-expectedAngles[key])/sectorAngle);
        component.bladeIndex=((bladeIndex%components.length)+components.length)%components.length;
        component.expectedBrightness=.65+.35*Math.cos(2*component.bladeIndex*sectorAngle);
        component.expectedRgb=baseRgb[key].map(value=>255*value*component.expectedBrightness);
        component.maxChannelError=component.meanRgb?Math.max(...component.meanRgb.map((value,channel)=>Math.abs(value-component.expectedRgb[channel]))):null;
        component.maxWithinMarkerChannelDifference=component.minRgb?Math.max(...component.maxRgb.map((value,channel)=>value-component.minRgb[channel])):null;
      }
      const areas=components.map(component=>component.area),radii=components.map(component=>component.radius);
      return [key,{count:components.length,minArea:areas.length?Math.min(...areas):0,maxArea:areas.length?Math.max(...areas):0,
        minRadius:radii.length?Math.min(...radii):0,maxRadius:radii.length?Math.max(...radii):0,
        patternPhase:totalWeight?Math.atan2(sumSin,sumCos):null,
        patternStrength:totalWeight?Math.hypot(sumCos,sumSin)/totalWeight:null,
        interiorPixels:components.reduce((sum,component)=>sum+component.interiorPixels,0),
        interiorMarkers:components.filter(component=>component.interiorPixels>0).length,
        uniqueBladeIndices:new Set(components.map(component=>component.bladeIndex)).size,components}];
    }));
    result.alphaHash=alphaHash;
    return result;
  };
  const simulatedIntervalS=.1,normalizedSpeed=.99,turnsPerSecond=6;
  const fullReferenceAdvance=2*Math.PI*turnsPerSecond*simulatedIntervalS;
  const requestedAdvance=fullReferenceAdvance*normalizedSpeed;
  const measuredAdvance=(before,after)=>{
    if(before.patternPhase===null||after.patternPhase===null||before.count!==after.count)return null;
    const phaseDelta=after.patternPhase-before.patternPhase;
    return Math.atan2(Math.sin(phaseDelta),Math.cos(phaseDelta))/2;
  };
  const fixedBladeColours=(before,after)=>{
    let maxChannelDifference=0;
    for(const component of before.components) {
      const moved=after.components.find(candidate=>candidate.bladeIndex===component.bladeIndex);
      if(!moved?.meanRgb||!component.meanRgb)return {maxChannelDifference:null};
      maxChannelDifference=Math.max(maxChannelDifference,...component.meanRgb.map((value,channel)=>Math.abs(value-moved.meanRgb[channel])));
    }
    return {maxChannelDifference};
  };
  const fixedGeometry=(before,after)=>before.alphaHash===after.alphaHash && ['outer','inner'].every(ring=>
    before[ring].count===after[ring].count && before[ring].components.every(component=>{
      const next=after[ring].components.find(candidate=>candidate.bladeIndex===component.bladeIndex);
      return next && next.area===component.area && next.angle===component.angle && next.radius===component.radius
        && next.interiorPixels===component.interiorPixels;
    }));
  for (const preference of ['webgpu','webgl2','webgl1']) {
    const row = document.createElement('section');
    row.className='flight-engine'; row.style.cssText='display:flex;gap:28px;align-items:center;margin:24px';
    const label = document.createElement('span'); label.textContent=preference; label.style.width='70px'; row.append(label);
    document.body.append(row);
    // Odd counts deliberately sample the full 360-degree brightness field
    // without requiring a blade to land on both hotspot centres.
    for (const [label,rotorBlades,piston] of [
      ['F-35B',F135_ROTOR_BLADES,false],['SF50',FJ33_ROTOR_BLADES,false],['C172',C172_ROTOR_BLADES,true],
      ['Synthetic 23/37',{outer:23,inner:37,outerEstimated:true,innerEstimated:true},false],
    ]) {
      const summary = createEngineSummary();
      row.append(summary.diagram,summary.values);
      summary.render({kind:piston?'piston':'turbine',rotorBlades,phase:'running',label,n1Pct:piston?null:30,n2Pct:piston?null:60,rpm:piston?1350:null,maxRpm:2700,maxN1Pct:100,maxN2Pct:100,thrustLbf:1900,fuelFlowPph:120,fuelFlowGph:null},'lb/h');
      const renderer = createEngineSpoolRenderer(summary.spools,{device:device??null,preference,maxFps:30,pixelRatio:2,outerBlades:rotorBlades.outer,innerBlades:rotorBlades.inner??0,maxPatternStep:DEFAULT_MAX_PATTERN_STEP});
      renderers.push(renderer);
      const backend = await renderer.ready;
      // Enlarge only for exact connected-component counts; restore the real
      // HUD size for the presentation screenshot below.
      summary.spools.style.width=summary.spools.style.height='400px';
      await nextFrame();
      const drawTime=performance.now();
      renderer.draw({outerAngle:1.1,innerAngle:piston?null:4.2,maxAngle:0},drawTime);
      // Copy in the same task as submission: WebGPU expires a canvas's
      // current texture at presentation, even though its last image remains
      // visible to the compositor. A later-task drawImage can read blank.
      const markers=countMarkers(summary.spools.querySelector('canvas'),{outer:1.1,inner:4.2});
      await device?.queue.onSubmittedWorkDone();
      // A deterministic 100 ms timestamp interval models a 10 FPS client;
      // it does not measure this device's cadence. Request 99% of 6 rev/s
      // and verify that the hotspots advance positively by the shared limit
      // (less than half the twofold pattern pitch). Each blade retains its
      // own brightness, hue, radius and size while its position changes.
      const movedFrame={outerAngle:1.1+requestedAdvance,innerAngle:piston?null:4.2+requestedAdvance,maxAngle:fullReferenceAdvance};
      const expectedReferenceAdvance=Math.min(fullReferenceAdvance,DEFAULT_MAX_PATTERN_STEP*2*Math.PI/2);
      const expectedAdvance=expectedReferenceAdvance*normalizedSpeed;
      renderer.draw(movedFrame,drawTime+100);
      const movedMarkers=countMarkers(summary.spools.querySelector('canvas'),{outer:1.1+expectedAdvance,inner:4.2+expectedAdvance});
      const motion={simulatedIntervalS,syntheticAcceptedIntervalMs:100,normalizedSpeed,turnsPerSecond,
        patternsPerRevolution:2,maxPatternStep:DEFAULT_MAX_PATTERN_STEP,fullReferenceAdvance,requestedAdvance,expectedReferenceAdvance,
        expectedAdvance,angularTolerance:.002,
        measuredAdvance:{outer:measuredAdvance(markers.outer,movedMarkers.outer),inner:piston?null:measuredAdvance(markers.inner,movedMarkers.inner)},
        status:renderer.getMotionStatus()};
      const fixedBladeColour={outer:fixedBladeColours(markers.outer,movedMarkers.outer),inner:piston?null:fixedBladeColours(markers.inner,movedMarkers.inner)};
      await device?.queue.onSubmittedWorkDone();
      if(label==='F-35B') {
        const expectedAngles={outer:1.1+expectedAdvance,inner:4.2+expectedAdvance};
        // Change palette at exactly the same shaft phase: the RGB update
        // must repaint without moving, resizing or changing marker opacity.
        renderer.setAccentColor(accentHex);
        renderer.draw(movedFrame,drawTime+200);
        const active=countMarkers(summary.spools.querySelector('canvas'),expectedAngles,accentPalette);
        await device?.queue.onSubmittedWorkDone();
        renderer.setAccentColor(null);
        renderer.draw(movedFrame,drawTime+300);
        const restored=countMarkers(summary.spools.querySelector('canvas'),expectedAngles);
        await device?.queue.onSubmittedWorkDone();
        accentRoundTrips.push({requested:preference,backend,label,profileId:f135ExhaustOpticalData.id,accentHex,
          before:movedMarkers,active,restored,
          unchangedActiveGeometry:fixedGeometry(movedMarkers,active),unchangedRestoredGeometry:fixedGeometry(movedMarkers,restored),
          restoredColour:{outer:fixedBladeColours(movedMarkers.outer,restored.outer),inner:fixedBladeColours(movedMarkers.inner,restored.inner)}});
        // Leave the native-size F-35 preview showing the active exhaust color.
        renderer.setAccentColor(accentHex);
      }
      summary.spools.style.width=summary.spools.style.height='';
      await nextFrame();
      renderer.draw(movedFrame,Math.max(performance.now(),drawTime+400));
      await device?.queue.onSubmittedWorkDone();
      cases.push({requested:preference,label,synthetic:label==='Synthetic 23/37',piston,rotorBlades,markers,movedMarkers,motion,fixedBladeColour,backend,status:renderer.status,canvases:summary.spools.querySelectorAll('canvas').length,
        outerSize:summary.spools.clientWidth,innerVisible:getComputedStyle(summary.spools.querySelector('.flight-engine__spool--n2')).display!=='none',
        rpmVisible:getComputedStyle(summary.spools.querySelector('.flight-engine__rpm')).display!=='none'});
    }
  }
  return {gpu,cases,accentRoundTrips,errors};
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
  await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 600, deviceScaleFactor: 2, mobile: false }, sessionId);
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
  report.limitations = "Synthetic 100 ms draw timestamps; no frame/GPU timing or device performance qualification. Tracks the twofold brightness pattern; individual blade dots may alias. Screenshot shows native 68 px widgets with the F-35 exhaust accent active and requires visual review.";
  for (const item of report.cases) {
    const phases=[item.markers,item.movedMarkers],rings=item.piston?['outer']:['outer','inner'];
    const checks={
      backend:item.backend===item.requested,
      widgetLayout:item.canvases===1 && item.outerSize===68 && item.rpmVisible===item.piston && item.innerVisible!==item.piston,
      bladeCounts:phases.every(markers=>markers.outer.count===item.rotorBlades.outer && markers.inner.count===(item.rotorBlades.inner??0)),
      equalAndFixedSizes:['outer','inner'].every(ring=>Math.max(...phases.map(markers=>markers[ring].maxArea))
        <=1.15*Math.min(...phases.map(markers=>markers[ring].minArea))),
      opaqueInteriors:phases.every(markers=>['outer','inner'].every(ring=>markers[ring].interiorMarkers===markers[ring].count)),
      bladeIdentities:phases.every(markers=>['outer','inner'].every(ring=>markers[ring].uniqueBladeIndices===markers[ring].count)),
      // Allow two byte values for canvas premultiplication/unpremultiplication rounding.
      expectedBladeRgb:phases.every(markers=>rings.every(ring=>markers[ring].components.every(component=>component.maxChannelError!==null
        && component.maxChannelError<=2 && component.maxWithinMarkerChannelDifference!==null && component.maxWithinMarkerChannelDifference<=2))),
      fixedBladeRgb:rings.every(ring=>item.fixedBladeColour[ring].maxChannelDifference!==null && item.fixedBladeColour[ring].maxChannelDifference<=2),
      // Pixel centroids use the complete canvas side; the canvas extends 4%
      // beyond the widget on every edge, so normalize UI radii by 1.08.
      fixedRadius:rings.every(ring=>phases.every(markers=>Math.abs(markers[ring].minRadius-(ring === 'outer' ? .48 : .28)/1.08)<.001
        && Math.abs(markers[ring].maxRadius-(ring === 'outer' ? .48 : .28)/1.08)<.001)),
      forwardHotspotMotion:rings.every(ring=>item.motion.measuredAdvance[ring]>0
        && Math.abs(item.motion.measuredAdvance[ring]-item.motion.expectedAdvance)<=item.motion.angularTolerance),
      hotspotContrast:rings.every(ring=>phases.every(markers=>markers[ring].patternStrength>=.2)),
      limitedStatus:item.motion.status.limited===(item.motion.expectedReferenceAdvance<item.motion.fullReferenceAdvance),
      syntheticCadence:Math.abs(item.motion.status.fps-1000/item.motion.syntheticAcceptedIntervalMs)<1e-9,
      effectiveMaxRate:Math.abs(item.motion.status.maxTurnsPerSecond-item.motion.expectedReferenceAdvance/(2*Math.PI)/(item.motion.syntheticAcceptedIntervalMs/1000))<1e-9,
    };
    item.failures=Object.entries(checks).filter(([,passed])=>!passed).map(([name])=>name);
    item.pass=item.failures.length===0;
  }
  for(const item of report.accentRoundTrips) {
    const rings=['outer','inner'],phases=[item.active,item.restored];
    const checks={
      backend:item.backend===item.requested,
      countsAndBladeIdentities:phases.every(markers=>rings.every(ring=>markers[ring].count===item.before[ring].count
        && markers[ring].uniqueBladeIndices===item.before[ring].count)),
      expectedAccentAndRestoredRgb:phases.every(markers=>rings.every(ring=>markers[ring].components.every(component=>component.maxChannelError!==null
        && component.maxChannelError<=2 && component.maxWithinMarkerChannelDifference!==null && component.maxWithinMarkerChannelDifference<=2))),
      unchangedActiveGeometryAndAlpha:item.unchangedActiveGeometry,
      unchangedRestoredGeometryAndAlpha:item.unchangedRestoredGeometry,
      restoredPalette:rings.every(ring=>item.restoredColour[ring].maxChannelDifference!==null && item.restoredColour[ring].maxChannelDifference<=2),
      retainedHotspots:phases.every(markers=>rings.every(ring=>markers[ring].patternStrength>=.2)),
    };
    item.failures=Object.entries(checks).filter(([,passed])=>!passed).map(([name])=>name);
    item.pass=item.failures.length===0;
  }
  report.pass=report.errors.length===0 && report.cases.every(item=>item.pass)
    && report.accentRoundTrips.length===3 && report.accentRoundTrips.every(item=>item.pass);
  await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await evaluate(chrome, sessionId, "window.releaseEngineOrbs()");
} finally {
  // The legacy helper signals after its timeout; this check only closes cleanly and observes exit.
  await chrome.send("Browser.close").catch(() => {});
  await chrome.waitForExit();
}
console.log(JSON.stringify({pass:report.pass,passedCases:report.cases.filter(item=>item.pass).length,totalCases:report.cases.length,
  passedAccentRoundTrips:report.accentRoundTrips.filter(item=>item.pass).length,totalAccentRoundTrips:report.accentRoundTrips.length,errors:report.errors}));
for(const item of report.cases) console.log(`${item.requested} ${item.label}: ${item.pass?'PASS':item.failures.join(', ')}`);
for(const item of report.accentRoundTrips) console.log(`${item.requested} ${item.label} accent on/off: ${item.pass?'PASS':item.failures.join(', ')}`);
console.log(`Detailed report and native-size preview: ${out}`);
if (!report.pass) process.exitCode = 1;
