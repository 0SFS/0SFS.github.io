#!/usr/bin/env node
// 0sfs owns offline optical observations of its retained aircraft trace.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { rolldown } from 'rolldown';
import { newOutputDirectory } from '../../outputDirectory.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) { console.log('Usage: node scripts/validation/f35b/recompute-f135-trace-optics.mjs --trace=<trace.csv> [--out=build/new-directory]'); process.exit(0); }
assert.ok(args.every(a => /^(--trace=|--out=)/.test(a)));
const option = name => { const items = args.filter(a => a.startsWith(name + '=')); assert.ok(items.length <= 1); return items[0]?.slice(name.length + 1); };
assert.ok(option('--trace'));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const input = path.resolve(option('--trace')), original = await readFile(input, 'utf8');
const out = option('--out') ? path.resolve(option('--out')) : newOutputDirectory('validation', 'f135-trace-optics');
assert.ok(out.startsWith(path.join(root,'build') + path.sep)); if (option('--out')) await mkdir(out);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const entry = path.join(out,'helpers.ts'), exports = [
  ['nozzleApertureGeometry','src/flight/aircraft/engineNozzleRig.ts'],
  ['F135_ENGINE_GEOMETRY','src/flight/aircraft/generated/f135EngineData.ts'],
  ['evaluateEngineGasOptics,interpolateAbsoluteEmission','src/flight/aircraft/engineGasOptics.ts'],
];
await writeFile(entry,exports.map(([names,file])=>`export {${names}} from ${JSON.stringify(path.join(root,file))};`).join('\n'));
const builder = await rolldown({input:entry,external:id=>!id.startsWith('.')&&!path.isAbsolute(id)});
let built; try { built=await builder.write({file:path.join(out,'helpers.mjs'),format:'esm'}); } finally { await builder.close(); }
const sourceFiles=[...new Set(built.output.flatMap(c=>c.type==='chunk'?Object.keys(c.modules):[]))].filter(f=>path.isAbsolute(f)&&f.startsWith(root)&&!f.startsWith(out));
const sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[path.relative(root,f),sha256(await readFile(f))])));
const helpers=await import(pathToFileURL(path.join(out,'helpers.mjs')).href);
const profileFile='src/flight/aircraft/generated/f135-exhaust-lut.manifest.json',profileBytes=await readFile(path.join(root,profileFile));
sourceHashes[profileFile]=sha256(profileBytes);const profile=JSON.parse(profileBytes).profile;
const lines=original.trimEnd().split('\n'), columns=lines.shift().split(','), changes={};
assert.ok(columns.includes('optical.sourcePowerBoundW'));
const output=[columns.join(',')];let rows=0;
for(const line of lines){
  const cells=line.split(',');assert.equal(cells.length,columns.length);
  const old=Object.fromEntries(columns.map((name,i)=>[name,cells[i]]));const number=name=>Number(old[name]);
  const geometry=helpers.nozzleApertureGeometry(number('nozzleNorm'),helpers.F135_ENGINE_GEOMETRY.aperture);
  const gas=helpers.evaluateEngineGasOptics(profile,{temperatureKelvin:number('gasK'),augmentation:Boolean(number('augmentation')),
    fuelFlowKgPerSecond:number('fuelKgSec'),afterburnerBurnedFuelFlowKgPerSecond:number('burnedAbKgSec'),
    radiusMeters:geometry.exitRadius,lengthMeters:6*(number('augmentation')?.7+.3*Math.min(1,Math.max(0,number('n2Pct')/100)):.2)});
  const optical={mode:gas.mode,valid:Number(gas.valid),radiusM:geometry.exitRadius,throatAreaM2:geometry.throatArea,exitAreaM2:geometry.exitArea,
    absorptionPerMeter:gas.absorptionPerMeter,emittingVolumeM3:gas.emittingVolumeM3,fuelPowerW:gas.fuelPowerW,
    particlePowerBoundW:gas.particlePowerUpperBoundW,excitedPowerW:gas.excitedPowerW,sourcePowerBoundW:gas.totalSourcePowerUpperBoundW,
    sourceCdM3R:gas.sourceRgbCdPerM3[0],sourceCdM3G:gas.sourceRgbCdPerM3[1],sourceCdM3B:gas.sourceRgbCdPerM3[2]};
  const replacement=Object.fromEntries(Object.entries(optical).map(([name,value])=>['optical.'+name,value]));
  for(const solid of ['core','liner']){
    const rgb=helpers.interpolateAbsoluteEmission(profile.surfaceEmission,number(solid+'.temperatureK'))??[0,0,0];
    for(const [i,c] of ['R','G','B'].entries())replacement[solid+'.emissionCdM2'+c]=rgb[i];
    replacement[solid+'.emissionLuminanceCdM2']=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  }
  for(const [name,value] of Object.entries(replacement)){
    if(typeof value==='number'){
      assert.ok(Number.isFinite(value));const previous=number(name),diff=Math.abs(value-previous);
      changes[name]??={maxAbsoluteDifference:0,maxRelativeDifference:0,changedRows:0};
      changes[name].maxAbsoluteDifference=Math.max(changes[name].maxAbsoluteDifference,diff);
      changes[name].maxRelativeDifference=Math.max(changes[name].maxRelativeDifference,diff/Math.max(Math.abs(value),Math.abs(previous),1e-300));
      if(diff>0)changes[name].changedRows++;
    }else assert.equal(value,old[name]);
  }
  // Byte-for-byte preservation of every native observation and accounting field.
  output.push(columns.map((name,i)=>Object.hasOwn(replacement,name)?replacement[name]:cells[i]).join(','));rows++;
}
const finalSourceHashes=Object.fromEntries(await Promise.all(Object.keys(sourceHashes).map(async f=>[f,sha256(await readFile(path.join(root,f)))])));
assert.deepEqual(finalSourceHashes,sourceHashes,'Optical inputs changed during reevaluation');
const csv=output.join('\n')+'\n';await writeFile(path.join(out,'optical-trace.csv'),csv);
const report={schemaVersion:1,inputTrace:path.relative(root,input),inputSha256:sha256(original),outputSha256:sha256(csv),rows,sourceHashes,
  scriptSha256:sha256(await readFile(fileURLToPath(import.meta.url))),apertureProfile:helpers.F135_ENGINE_GEOMETRY.aperture,changes,
  nativeFieldsPreservedExactly:true,thermalStepsRerun:0,
  interpretation:'Recomputed optical observations only. Same retained temperatures, fuel/staging, shaft speed and heat receipts. Geometric area remains an approximation, not a native A8/A9 schedule or heat capacity. No exposure enters physical power.',
  scope:'Pure CPU optical/geometry evaluation, not an image, camera response or GPU qualification.'};
await writeFile(path.join(out,'optical-recheck.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({out,rows,changes},null,2));
