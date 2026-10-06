#!/usr/bin/env node
// Aircraft-specific retained numerical figures; no renderer/GPU qualification.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newOutputDirectory } from '../../outputDirectory.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url)), args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/validation/f35b/plot-f135-emission-correction.mjs --report=<report.json> [--out=build/new-directory] [--python=python3]');
  process.exit(0);
}
assert.ok(args.every(v => /^(--report=|--out=|--python=)/.test(v)));
const option = name => { const entries = args.filter(v => v.startsWith(name + '=')); assert.ok(entries.length <= 1); return entries[0]?.slice(name.length + 1); };
assert.ok(option('--report'));
const reportFile = path.resolve(option('--report'));
const out = option('--out') ? path.resolve(option('--out')) : newOutputDirectory('validation', 'f135-emission-correction-plots');
assert.ok(out.startsWith(path.join(root, 'build') + path.sep));
if (option('--out')) mkdirSync(out);
const python = option('--python') ?? 'python3';
const script = String.raw`
import json,sys,pathlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
report=json.loads(pathlib.Path(sys.argv[1]).read_text()); out=pathlib.Path(sys.argv[2])
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'svg.fonttype':'none'})
names=[c['name'] for c in report['cases']]; x=np.arange(len(names))
old=np.array([c['previousSpatial']['sourcePhotopicIntensityCd'] for c in report['cases']])
integrals={i['name']:i for i in report['integrals']}
external=np.array([integrals.get(n,{}).get('exteriorIsotropicIntensityCd',0) for n in names])
internal=np.array([integrals.get(n,{}).get('interiorIsotropicIntensityCd',0) for n in names])
fig,ax=plt.subplots(figsize=(11,6))
for delta,values,label,color in [(-.25,old,'Previous spatial exterior','#4163a5'),(0,external,'Corrected exterior','#d58433'),(.25,internal,'Corrected interior (hardware may occlude)','#875746')]:
    ax.bar(x+delta,np.where(values>0,values,np.nan),width=.23,label=label,color=color)
ax.set_yscale('log');ax.set_ylim(1e-12,1e5);ax.set_xticks(x,names,rotation=20,ha='right')
ax.set_xlim(-.6,len(names)-.4)
ax.set_ylabel('Unattenuated source-volume intensity, photopic cd');ax.grid(True,axis='y',alpha=.2)
ax.set_title('Same retained engine observations; different optical hypotheses')
ax.legend(loc='upper left',fontsize=9)
for i,n in enumerate(names):
    if old[i]==0 and external[i]==0 and internal[i]==0:ax.text(i,3e-12,'source off',ha='center',rotation=90,color='#555555')
fig.text(.06,.025,'Internal and external fields share a source bound; only the exterior supplies the approximate scene light.\nThese integrated sources are not escaped flux, observed engine spectra or image appearance.',fontsize=9)
fig.subplots_adjust(bottom=.24,left=.09,right=.98,top=.91)
for suffix in ['svg','png']:fig.savefig(out/f'source-comparison.{suffix}',dpi=170)
plt.close(fig)
receiver=report['receiver']; bounds={b['region']:b for b in receiver['thermalBounds']}
values=[receiver['exteriorReceiver']['diffuseReceiverRadianceUpperBoundCdPerM2']]+[bounds[k]['diffuseReceiverRadianceCdPerM2'] for k in ['gas','core','liner']]
labels=['Modeled exterior gas above receiver','Hypothetical filled aperture at gas bath K','Hypothetical filled aperture at core metal K','Hypothetical filled aperture at liner metal K']
fig,ax=plt.subplots(figsize=(11,5.5)); y=np.arange(len(values))
ax.barh(y,values,color=['#4163a5','#d58433','#875746','#777777']);ax.set_yticks(y,labels);ax.invert_yaxis()
ax.set_xscale('log');ax.set_xlim(1e-8,1);ax.grid(True,axis='x',alpha=.2)
ax.set_xlabel('Upper bound on diffuse reflected luminance, cd/m²')
ax.set_title(f'Dry powered lift: hypothetical ρ=0.2 receiver, {receiver["exitPlaneDistanceMeters"]:.3f} m below exit')
for i,v in enumerate(values):ax.text(v*1.2,i,f'{v:.4g}',va='center',fontsize=9)
fig.text(.035,.025,'Gas integral ignores self-absorption and opaque obstruction; filled-aperture alternatives are not added together.\nNo deck heating, impingement, actual receiver material or GPU pixels are modeled.',fontsize=9)
fig.subplots_adjust(bottom=.19,left=.40,right=.98,top=.89)
for suffix in ['svg','png']:fig.savefig(out/f'receiver-bounds.{suffix}',dpi=170)
plt.close(fig)
print(json.dumps({'matplotlib':matplotlib.__version__,'figures':['source-comparison','receiver-bounds']}))
`;
const result = spawnSync(python, ['-c', script, reportFile, out], {
  encoding: 'utf8', env: { ...process.env, MPLCONFIGDIR: path.join(out, 'matplotlib-config') },
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
assert.equal(result.status, 0, 'Matplotlib figure creation failed');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
writeFileSync(path.join(out, 'plot-provenance.json'), JSON.stringify({ report: reportFile,
  reportSha256: hash(readFileSync(reportFile)), scriptSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
  python, renderer: 'Matplotlib; scientific data figures, not flight-app screenshots' }, null, 2) + '\n');
