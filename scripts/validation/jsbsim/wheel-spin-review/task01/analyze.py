#!/usr/bin/env python3
"""Summarize a task-01 compare_scripts.py run against the recorded planning run.

Usage: analyze.py <new summary.json> <recorded per-step-summary.json>
"""
import collections
import json
import sys

new = json.load(open(sys.argv[1]))
rec = json.load(open(sys.argv[2]))

print('source_commit', new['source_commit'], 'trace', new['trace'])
for k, v in new['binaries'].items():
    print('binary', k, v['sha256'])
print('recorded base/probe hashes equal:',
      new['binaries']['base']['sha256'] == rec['binaries']['base']['sha256'],
      new['binaries']['probe']['sha256'] == rec['binaries']['probe']['sha256'])
print('script corpus hashes equal to recorded:', new['scripts'] == rec['scripts'])

roots = collections.Counter(v['xml_root'] for v in new['scripts'].values())
print('xml inputs', len(new['scripts']), dict(roots))

runs = {(r['label'], r['script']): r for r in new['runs']}
recruns = {(r['label'], r['script']): r for r in rec['runs']}
for label in new['binaries']:
    outcome = collections.Counter()
    for name, meta in new['scripts'].items():
        outcome[(meta['xml_root'], runs[label, name]['exit'])] += 1
    nfiles = sum(len(runs[label, n]['files']) for n in new['scripts'])
    print('outcomes', label, dict(outcome), 'data files', nfiles)

for name, meta in sorted(new['scripts'].items()):
    e = {l: runs[l, name]['exit'] for l in new['binaries']}
    if any(v != 0 for v in e.values()):
        print('  nonzero exit', name, meta['xml_root'], e,
              'files', {l: sorted(runs[l, name]['files']) for l in new['binaries']})


def compare(pairs_label, get_a, get_b):
    diff_files, diff_exit, total_files = [], [], 0
    for name in sorted(new['scripts']):
        a, b = get_a(name), get_b(name)
        if a['exit'] != b['exit']:
            diff_exit.append(name)
        total_files += len(a['files'])
        for f in sorted(a['files'].keys() | b['files'].keys()):
            if a['files'].get(f) != b['files'].get(f):
                diff_files.append((name, f))
    print(pairs_label, 'files compared', total_files,
          'differing files', len(diff_files), 'differing exits', len(diff_exit))
    return diff_files, diff_exit


compare('candidate vs probe (this run):',
        lambda n: runs['candidate', n], lambda n: runs['probe', n])
compare('candidate vs probe (recorded):',
        lambda n: runs['candidate', n], lambda n: recruns['probe', n])
compare('probe (this run) vs probe (recorded):',
        lambda n: runs['probe', n], lambda n: recruns['probe', n])
compare('base (this run) vs base (recorded):',
        lambda n: runs['base', n], lambda n: recruns['base', n])
diff_files, diff_exit = compare('base vs candidate (this run):',
                                lambda n: runs['base', n], lambda n: runs['candidate', n])

changed_scripts = sorted({n for n, _ in diff_files})
successful = [n for n in changed_scripts if runs['base', n]['exit'] == 0]
print('base vs candidate: scripts with changed files', len(changed_scripts),
      'of which exit 0', len(successful))
cmp = {c['script']: c for c in new['comparisons'] if (c['left'], c['right']) == ('base', 'candidate')}
shape = nonfinite = headers = text = 0
for n in changed_scripts:
    for f, d in cmp[n]['changed'].items():
        shape += bool(d.get('shape_mismatch'))
        nonfinite += d.get('nonfinite_mismatches', 0)
        headers += bool(d.get('headers_differ'))
        text += bool(d.get('text_mismatch'))
        if f == 'review-trace.csv':
            m = d.get('max_abs_by_column', {})
            print('  %-28s rows %-8s diff rows %-8s first t %-10s max|du| %-10.3g max|Fx| %.3g' % (
                n, d.get('rows'), d.get('different_rows'), d.get('first_different_time'),
                m.get('/fdm/jsbsim/velocities/u-fps', 0.0), m.get('/fdm/jsbsim/forces/fbx-gear-lbs', 0.0)))
print('base vs candidate: shape mismatches', shape, 'nonfinite mismatches', nonfinite,
      'header diffs', headers, 'text mismatches', text)
recprobe = {c['script'] for c in rec['comparisons']
            if (c['left'], c['right']) == ('base', 'probe') and not c['files_equal']}
print('base-vs-candidate changed scripts == recorded base-vs-probe changed scripts:',
      set(changed_scripts) == recprobe, len(recprobe))
