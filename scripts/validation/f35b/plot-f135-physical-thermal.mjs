#!/usr/bin/env node
// 0sfs owns plots for the aircraft-specific native thermal experiment.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { newOutputDirectory } from '../../outputDirectory.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/validation/f35b/plot-f135-physical-thermal.mjs --report=<report.json> [--out=build/new-directory] [--python=python3] (requires Matplotlib)');
  process.exit(0);
}
assert.ok(args.every(a => /^(--report=|--out=|--python=)/.test(a)));
const option = name => { const items = args.filter(a => a.startsWith(name + '=')); assert.ok(items.length <= 1); return items[0]?.slice(name.length + 1); };
assert.ok(option('--report'));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const input = path.resolve(option('--report')), trace = path.join(path.dirname(input), 'trace.csv');
const out = option('--out') ? path.resolve(option('--out')) : newOutputDirectory('validation', 'f135-thermal-plots');
assert.ok(out.startsWith(path.join(root, 'build') + path.sep));
if (option('--out')) await mkdir(out);
const code = String.raw`
import csv,json,sys,pathlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
report=json.load(open(sys.argv[1])); rows=list(csv.DictReader(open(sys.argv[2]))); out=pathlib.Path(sys.argv[3])
assert report['pass'] and report['sourceIdentityStable']
plt.rcParams.update({'font.size':10,'axes.grid':True,'grid.alpha':.2,'svg.fonttype':'none'})
colors={'gasK':'#777777','core.temperatureK':'#ce5928','liner.temperatureK':'#2666a8','ambientK':'#348157'}
def series(ax, data, columns):
    for column,label in columns:
        ax.plot([float(r['timeS']) for r in data],[float(r[column]) for r in data],label=label,color=colors.get(column))
def save(fig,name):
    fig.savefig(out/(name+'.svg'),bbox_inches='tight',metadata={'Date':None})
    fig.savefig(out/(name+'.png'),bbox_inches='tight',dpi=150)
    plt.close(fig)
data=[r for r in rows if r['scenario']=='cold-cycle']
fig,axs=plt.subplots(3,1,figsize=(11,8),sharex=True,layout='constrained')
series(axs[0],data,[('gasK','Nozzle gas bath'),('core.temperatureK','Core solid'),('liner.temperatureK','Liner solid'),('ambientK','Ambient')])
axs[0].set(ylabel='Temperature (K)',title='Installed F135 reduced thermal model: true cold start to shutdown');axs[0].legend(ncols=4)
series(axs[1],data,[('fuelKgSec','Total native fuel'),('burnedAbKgSec','Burned AB fuel')]);axs[1].set(ylabel='Fuel flow (kg/s)');axs[1].legend(ncols=2)
series(axs[2],data,[('n1Pct','N1'),('n2Pct','N2')]);axs[2].set(ylabel='Shaft speed (%)',xlabel='Native simulation time (s)');axs[2].legend(ncols=2)
prior=None
for row in data:
    if row['phase']!=prior:
        t=float(row['timeS']);axs[0].axvline(t,color='#aaaaaa',lw=.7)
        if row['phase'] not in ['initial-zero-time','cold-soak','shutdown']:
            axs[0].text(t+1,2500,row['phase'],rotation=90,va='top',fontsize=8)
        prior=row['phase']
axs[0].set_ylim(230,2600)
fig.supxlabel('Prescribed baths and provisional effective capacities; software verification, not measured F135 temperature calibration.',fontsize=9)
save(fig,'thermal-cycle')

fig,axs=plt.subplots(1,3,figsize=(13,4),layout='constrained')
for ax,name,title,limit in zip(axs,['cold-cycle','running-initialization','hot-restart'],['Cold stopped start','Explicit already-running initialization','Hot shutdown and real restart'],[95,11,217]):
    data=[r for r in rows if r['scenario']==name and float(r['timeS'])<=limit]
    if name=='cold-cycle':data=[r for r in data if r['phase'] in ['initial-zero-time','cold-soak','starter','idle']]
    if name=='hot-restart':data=[r for r in data if float(r['timeS'])>=135]
    series(ax,data,[('core.temperatureK','Core'),('liner.temperatureK','Liner'),('gasK','Nozzle gas')]);ax.set(title=title,xlabel='Native time (s)',ylabel='Temperature (K)');ax.legend()
    if name=='running-initialization':ax.text(.04,.96,'First accepted step assigns initial energy;\nno transient heat is integrated.',transform=ax.transAxes,va='top',fontsize=8)
fig.suptitle('Three distinct initialization paths, each recorded independently')
save(fig,'startup-paths')

cycle=next(s for s in report['summaries'] if s['name']=='cold-cycle')
fig,axs=plt.subplots(1,2,figsize=(12,4),layout='constrained')
labels=['Gas','Coolant','Surroundings','Flame','Stored change','Sum of heat']
for ax,name in zip(axs,['core','liner']):
    t=cycle['totals'][name]
    values=[t['signedGasJ'],t['signedCoolantJ'],t['signedSurroundingsJ'],t['signedFlameJ'],t['storedJ'],t['transferredJ']]
    ax.bar(labels,[v/1e6 for v in values],color=['#dd744c','#3c9ea5','#6684bc','#b36185','#555555','#aaaaaa'])
    ax.axhline(0,color='black',lw=.8);ax.tick_params(axis='x',rotation=25)
    ax.set(title=name.capitalize()+' solid: cold cycle',ylabel='Signed energy (MJ), positive into solid')
    ax.text(.03,.96,f"Integrated residual: {t['accumulatedResidualJ']:.3g} J\nAssigned initial energy: {t['initializationJ']:.6g} J (separate)",transform=ax.transAxes,va='top',fontsize=9)
fig.supxlabel('All 120 Hz accepted steps accumulated; plotted values are not reconstructed by integrating decimated CSV samples.',fontsize=9)
save(fig,'heat-balance')

c=report['convergence'];fig,ax=plt.subplots(figsize=(7,4.5),layout='constrained')
for name,color in [('core','#ce5928'),('liner','#2666a8')]:
    ax.loglog([1/r['hz'] for r in c['numerical']],[r[name+'ErrorK'] for r in c['numerical']],marker='o',label=name.capitalize(),color=color)
ax.set(xlabel='Native timestep (s)',ylabel='Absolute endpoint temperature error (K)',title='30 s cooldown: native backward Euler versus independent RK4');ax.legend()
fig.supxlabel('Actual F135 constant-bath equations, initially 1000 K. RK4 reference separately refined from 1920 to 3840 Hz.',fontsize=9)
save(fig,'cooldown-convergence')
print(json.dumps({'matplotlib':matplotlib.__version__,'plots':['thermal-cycle','startup-paths','heat-balance','cooldown-convergence']}))
`;
const { stdout, stderr } = await promisify(execFile)(option('--python') ?? 'python3', ['-c', code, input, trace, out], {
  env: { ...process.env, MPLCONFIGDIR: path.join(out, 'matplotlib-config'), PYTHONDONTWRITEBYTECODE: '1' },
});
if (stderr) process.stderr.write(stderr);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const record = { schemaVersion: 1, ...JSON.parse(stdout), inputReport: path.relative(root,input),
  reportSha256: sha256(await readFile(input)), traceSha256: sha256(await readFile(trace)),
  scriptSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  scope: 'Standalone Matplotlib plots from retained native data; no physics rerun, browser or GPU rendering.' };
await writeFile(path.join(out,'plot-provenance.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({out,...record},null,2));
