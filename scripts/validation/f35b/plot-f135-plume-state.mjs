#!/usr/bin/env node
// 0sfs owns standalone figures for its native F135 plume-source diagnosis.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { newOutputDirectory } from '../../outputDirectory.mjs';

const args=process.argv.slice(2);
if(args.includes('--help')){console.log('Usage: node scripts/validation/f35b/plot-f135-plume-state.mjs --report=<report.json> [--out=build/new-directory] [--python=python3] (requires Matplotlib)');process.exit(0);}
assert.ok(args.every(a=>/^(--report=|--out=|--python=)/.test(a)));
const option=name=>{const values=args.filter(a=>a.startsWith(name+'='));assert.ok(values.length<=1);return values[0]?.slice(name.length+1);};
assert.ok(option('--report'));
const root=fileURLToPath(new URL('../../../',import.meta.url)),input=path.resolve(option('--report')),trace=path.join(path.dirname(input),'trace.csv');
const out=option('--out')?path.resolve(option('--out')):newOutputDirectory('validation','f135-plume-plots');
assert.ok(out.startsWith(path.join(root,'build')+path.sep));if(option('--out'))await mkdir(out);
const code=String.raw`
import json,csv,pathlib,sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
report=json.load(open(sys.argv[1]));rows=list(csv.DictReader(open(sys.argv[2])));out=pathlib.Path(sys.argv[3])
assert report['pass']
for row in rows:
    for key in row:
        if key not in ['scenario','phase']:row[key]=float(row[key])
plt.rcParams.update({'font.size':10,'axes.grid':True,'grid.alpha':.22,'svg.fonttype':'none'})
def save(fig,name):
    fig.savefig(out/(name+'.svg'),bbox_inches='tight',metadata={'Date':None});fig.savefig(out/(name+'.png'),bbox_inches='tight',dpi=150);plt.close(fig)
def line(ax,data,column,label,color=None,x='timeS',log=False):
    values=[max(r[column],1e-12) if log else r[column] for r in data]
    ax.plot([r[x] for r in data],values,label=label,color=color)
data=[r for r in rows if r['scenario']=='cold-cycle']
fig,axs=plt.subplots(3,1,figsize=(11,8),sharex=True,layout='constrained')
for col,label,color in [('gasK','Gas proxy','#777777'),('coreK','Core solid','#cb572e'),('linerK','Liner solid','#2867aa')]:line(axs[0],data,col,label,color)
axs[0].set(ylabel='Temperature (K)',title='Installed native state and the frozen uniform-source plume model');axs[0].legend(ncols=3)
for col,label,color in [('fuelKgSec','Total fuel','#237e89'),('suppliedAbKgSec','Supplied AB fuel','#d58a20'),('burnedAbKgSec','Burned AB fuel','#a4569b')]:line(axs[1],data,col,label,color)
axs[1].set(ylabel='Fuel (kg/s)');axs[1].legend(ncols=3)
for col,label,color in [('continuumYcdM3','Particle continuum','#c66c1e'),('excitedYcdM3','Excited bands','#5565b5')]:line(axs[2],data,col,label,color,log=True)
axs[2].set(yscale='log',ylim=(1e-8,1e6),ylabel='Source luminance (cd/m³)',xlabel='Native simulation time (s)');axs[2].legend(ncols=2)
fig.supxlabel('Fuel staging is native. Particle temperature/loading and band-power allocation remain provisional optical assumptions.',fontsize=9)
save(fig,'baseline-native-cycle')

ab=[r for r in data if r['phase']=='afterburner' and r['phaseTimeS']<=10]
cutoff_start=min(r['timeS'] for r in data if r['phase']=='dry99-after-ab')-1/120
cutoff=[dict(r,relativeTime=r['timeS']-cutoff_start) for r in data if cutoff_start-1<=r['timeS']<=cutoff_start+5]
fig,axs=plt.subplots(2,2,figsize=(12,7),layout='constrained')
for col,label,color in [('continuumYcdM3','Continuum','#c66c1e'),('excitedYcdM3','Excited bands','#5565b5')]:
    line(axs[0,0],ab,col,label,color,x='phaseTimeS',log=True);line(axs[0,1],cutoff,col,label,color,x='relativeTime',log=True)
for ax in axs[0]:ax.set(yscale='log',ylim=(.03,1e6),ylabel='Source luminance (cd/m³)');ax.legend()
axs[0,0].set(title='AB onset: faint continuum, then rising thermal emission',xlabel='Time since AB command (s)')
axs[0,1].set(title='AB cutoff: no downstream state or travel time',xlabel='Time relative to cutoff (s)');axs[0,1].axvline(0,color='black',lw=.7)
for col,label,color in [('sourceRcdM3','R','#b8322d'),('sourceGcdM3','G','#268248'),('sourceBcdM3','B','#315dba')]:line(axs[1,0],ab,col,label,color,x='phaseTimeS',log=True)
axs[1,0].set(yscale='log',ylim=(.003,1e6),ylabel='Absolute RGB source (cd/m³)',xlabel='Time since AB command (s)');axs[1,0].legend(ncols=3)
for col,label,color in [('gasK','Gas proxy','#777777'),('coreK','Core solid','#cb572e'),('linerK','Liner solid','#2867aa')]:line(axs[1,1],cutoff,col,label,color,x='relativeTime')
axs[1,1].set(ylabel='Temperature (K)',xlabel='Time relative to cutoff (s)');axs[1,1].legend()
fig.supxlabel('Zeros fall below the logarithmic axes. Same source RGB is applied everywhere in this retained baseline; these are not rendered colors.',fontsize=9)
save(fig,'baseline-ab-transitions')

cycle=next(s for s in report['summaries'] if s['name']=='cold-cycle')['result'];lift=next(s for s in report['summaries'] if s['name']=='powered-lift')['result']['lifted']
early=min(ab,key=lambda r:abs(r['phaseTimeS']-.233333333333333))
samples=[cycle['idle'],cycle['dry'],lift,early,cycle['ab']];labels=['Idle','99% dry','Dry VTOL','AB +0.233 s','Sustained AB']
fig,axs=plt.subplots(1,2,figsize=(12,4.5),layout='constrained')
for i,(key,label,color) in enumerate([('rearAxisRadianceYcdM2','Rear axis','#287aac'),('rearOffsetRadianceYcdM2','Rear offset','#bc6439'),('sideNearExitRadianceYcdM2','Side near exit','#548d56')]):
    axs[0].plot(labels,[r[key] for r in samples],marker='o',label=label,color=color)
axs[0].set(yscale='log',ylabel='Unoccluded physical ray luminance (cd/m²)',title='Actual baseline PNG density integrated on three rays');axs[0].legend()
axs[1].bar(labels,[r['lengthM'] for r in samples],color='#7a8798');axs[1].set(ylabel='Declared support length (m)',title='Dry support is short; AB switches it immediately')
for ax in axs:ax.tick_params(axis='x',rotation=20)
fig.supxlabel('No hardware/depth, scene, camera, exposure or GPU is simulated. Default display white is 1000 cd/m²; radiance is not a captured pixel.',fontsize=9)
save(fig,'baseline-rays-and-support')
print(json.dumps({'matplotlib':matplotlib.__version__,'plots':['baseline-native-cycle','baseline-ab-transitions','baseline-rays-and-support']}))
`;
const{stdout,stderr}=await promisify(execFile)(option('--python')??'python3',['-c',code,input,trace,out],{env:{...process.env,MPLCONFIGDIR:path.join(out,'matplotlib-config'),PYTHONDONTWRITEBYTECODE:'1'}});
if(stderr)process.stderr.write(stderr);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const result={schemaVersion:1,...JSON.parse(stdout),inputReport:path.relative(root,input),reportSha256:hash(await readFile(input)),traceSha256:hash(await readFile(trace)),scriptSha256:hash(await readFile(fileURLToPath(import.meta.url))),scope:'Matplotlib plots of retained native state and frozen uniform optical baseline; no physics rerun or rendered appearance evidence.'};
await writeFile(path.join(out,'plot-provenance.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({out,...result},null,2));
