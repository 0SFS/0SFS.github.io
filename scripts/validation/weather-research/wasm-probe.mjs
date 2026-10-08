// Research observation, not a performance benchmark or aircraft qualification.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {JSBSimSdk, buildIdentity} from '@felipegalind0/jsbsim';
import {wasmModuleUrl, wasmBinaryUrl} from '@felipegalind0/jsbsim/wasm';
import {newOutputDirectory} from '../../outputDirectory.mjs';
import {verifyInstalledSdk} from '../../verify-jsbsim-artifact.mjs';
const output=newOutputDirectory('research','weather-wasm');
const artifact=await verifyInstalledSdk();
const manifest=JSON.parse(await readFile('public/jsbsim-data/manifest.json','utf8'));
const files=Object.fromEntries(await Promise.all(manifest.aircraft['cirrus-vision-jet'].map(async n=>[n,await readFile('public/jsbsim-data/'+n,'utf8')])));
const properties=['simulation/sim-time-sec','position/h-sl-ft','position/h-agl-ft','atmosphere/T-R','atmosphere/P-psf','atmosphere/rho-slugs_ft3','atmosphere/a-fps','atmosphere/RH','atmosphere/dew-point-R','atmosphere/pressure-altitude','atmosphere/density-altitude','atmosphere/psiw-rad','atmosphere/total-wind-north-fps','atmosphere/total-wind-east-fps','atmosphere/total-wind-down-fps','atmosphere/turb-north-fps','atmosphere/turb-east-fps','atmosphere/turb-down-fps','atmosphere/p-turb-rad_sec','atmosphere/q-turb-rad_sec','atmosphere/r-turb-rad_sec','velocities/u-fps','velocities/vtrue-fps','aero/alpha-rad','aero/qbar-psf','propulsion/engine[0]/thrust-lbs'];
let catalog;
async function run(name,settings={},options={}){
 const sdk=await JSBSimSdk.create({moduleUrl:wasmModuleUrl,wasmUrl:wasmBinaryUrl,log:{console:false}});
 try {
  for(const [n,v] of Object.entries(files))sdk.writeDataFile(n,v);
  assert(sdk.loadModel('sf50'));sdk.setDt(1/120);
  catalog??=sdk.queryPropertyCatalog('');
  for(const [n,v] of Object.entries({'ic/lat-geod-deg':44.8852,'ic/long-gc-deg':-93.2313,'ic/h-sl-ft':1000,'ic/terrain-elevation-ft':0,'ic/vc-kts':130,'ic/psi-true-deg':0,'atmosphere/turb-type':0,...options.initial}))sdk.setPropertyValue(n,v);
  assert(sdk.runIc());sdk.setPropertyValue('propulsion/set-running',-1);sdk.setPropertyValue('fcs/throttle-cmd-norm',0.5);assert(sdk.runIc());
  const samples=[];const record=step=>samples.push({step,values:properties.map(p=>sdk.getPropertyValue(p))});record(0);
  for(const [n,v] of Object.entries(settings))sdk.setPropertyValue(n,v);
  const series=[];
  for(let i=1;i<=(options.steps??240);i++){
   if(options.change && i===options.change.step)for(const [n,v] of Object.entries(options.change.settings))sdk.setPropertyValue(n,v);
   assert(sdk.run());
   const wind=['north','east','down'].map(a=>sdk.getPropertyValue(`atmosphere/turb-${a}-fps`));
   series.push(wind);
   if(i<=3||i%60===0||i===options.change?.step)record(i);
  }
  return {name,settings,options,samples,seriesHash:createHash('sha256').update(JSON.stringify(series)).digest('hex'),windRms:[0,1,2].map(a=>Math.sqrt(series.reduce((s,w)=>s+w[a]**2,0)/series.length)),finite:samples.every(s=>s.values.every(Number.isFinite))};
 }finally{sdk.destroy();}
}
const cases=[];
cases.push(await run('baseline'));
cases.push(await run('steady-and-gust',{'atmosphere/wind-north-fps':10,'atmosphere/wind-east-fps':5,'atmosphere/wind-down-fps':-2,'atmosphere/gust-north-fps':3,'atmosphere/gust-east-fps':-1,'atmosphere/gust-down-fps':-4}));
cases.push(await run('temperature-bias',{'atmosphere/delta-T':18}));
cases.push(await run('graded-temperature',{'atmosphere/SL-graded-delta-T':18}));
cases.push(await run('low-pressure',{'atmosphere/P-sl-psf':2000}));
for(const [name,p,v] of [['humidity','atmosphere/RH',80],['dewpoint','atmosphere/dew-point-R',500],['vapor-pressure','atmosphere/vapor-pressure-psf',20],['vapor-fraction','atmosphere/vapor-fraction-ppm',10000]])cases.push(await run(name,{[p]:v}));
cases.push(await run('point-override',{'atmosphere/override/temperature':500,'atmosphere/override/pressure':1900}));
cases.push(await run('density-override',{'atmosphere/override/density':0.002}));
cases.push(await run('shear-step',{}, {change:{step:120,settings:{'atmosphere/wind-north-fps':20}}}));
for(let type=1;type<=4;type++)for(let repetition=0;repetition<2;repetition++)cases.push(await run(`turb-${type}-${repetition}`,{'atmosphere/randomseed':12345,'atmosphere/turb-type':type,'atmosphere/turb-gain':0.5,'atmosphere/turbulence/milspec/severity':3,'atmosphere/turbulence/milspec/windspeed_at_20ft_AGL-fps':20},{steps:1200}));
cases.push(await run('turb-off-after-tustin',{'atmosphere/randomseed':12345,'atmosphere/turb-type':4,'atmosphere/turbulence/milspec/severity':3,'atmosphere/turbulence/milspec/windspeed_at_20ft_AGL-fps':20},{change:{step:120,settings:{'atmosphere/turb-type':0}}}));
cases.push(await run('cosine-gust',{'atmosphere/cosine-gust/startup-duration-sec':0.5,'atmosphere/cosine-gust/steady-duration-sec':0.5,'atmosphere/cosine-gust/end-duration-sec':0.5,'atmosphere/cosine-gust/magnitude-ft_sec':20,'atmosphere/cosine-gust/frame':3,'atmosphere/cosine-gust/X-velocity-ft_sec':0,'atmosphere/cosine-gust/Y-velocity-ft_sec':0,'atmosphere/cosine-gust/Z-velocity-ft_sec':-1,'atmosphere/cosine-gust/start':1}));
cases.push(await run('updown-count',{'atmosphere/updownburst/number-of-cells':1}));
cases.push(await run('pure-east-heading',{'atmosphere/wind-east-fps':20}));
cases.push(await run('dryden-high-terrain',{'atmosphere/randomseed':12345,'atmosphere/turb-type':4,'atmosphere/turbulence/milspec/severity':3,'atmosphere/turbulence/milspec/windspeed_at_20ft_AGL-fps':20},{steps:3,initial:{'ic/h-sl-ft':5000,'ic/terrain-elevation-ft':4900}}));
cases.push(await run('dryden-sea-terrain',{'atmosphere/randomseed':12345,'atmosphere/turb-type':4,'atmosphere/turbulence/milspec/severity':3,'atmosphere/turbulence/milspec/windspeed_at_20ft_AGL-fps':20},{steps:3,initial:{'ic/h-sl-ft':5000,'ic/terrain-elevation-ft':0}}));
cases.push(await run('severity-zero-after-tustin',{'atmosphere/randomseed':12345,'atmosphere/turb-type':4,'atmosphere/turbulence/milspec/severity':3,'atmosphere/turbulence/milspec/windspeed_at_20ft_AGL-fps':20},{change:{step:120,settings:{'atmosphere/turbulence/milspec/severity':0}}}));
const report={date:'2026-10-08',command:'node scripts/validation/weather-research/wasm-probe.mjs',scope:'functional observations only; untrimmed SF50, no performance qualification',buildIdentity,artifact,dt:1/120,properties,aircraftHashes:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')])),cases};
await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');await writeFile(output+'/catalog.txt',catalog);
console.log(JSON.stringify({output,cases:cases.map(c=>({name:c.name,finite:c.finite,windRms:c.windRms,seriesHash:c.seriesHash}))},null,2));
