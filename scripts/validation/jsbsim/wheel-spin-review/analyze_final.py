#!/usr/bin/env python3
"""Scratch helper: check a four-binary compare_scripts.py --trace summary against
the retained three-binary per-step-summary.json. Reads only; prints JSON.

Usage: analyze_final.py <new summary.json> <retained per-step-summary.json>
"""
import json
import sys
from collections import Counter

new = json.load(open(sys.argv[1]))
old = json.load(open(sys.argv[2]))
out = {'checks': {}, 'failures': []}


def check(name, ok, detail=None):
    out['checks'][name] = {'ok': bool(ok), **({'detail': detail} if detail is not None else {})}
    if not ok:
        out['failures'].append(name)


labels = ['base', 'head', 'probe', 'candidate']
check('labels', list(new['binaries']) == labels, list(new['binaries']))
check('trace_enabled', new['trace'] is True)
check('script_set_and_hashes_equal_retained', new['scripts'] == old['scripts'],
      {'new': len(new['scripts']), 'retained': len(old['scripts'])})

runs = {(r['label'], r['script']): r for r in new['runs']}
old_runs = {(r['label'], r['script']): r for r in old['runs']}
check('run_count', len(new['runs']) == 4 * 61 and len(runs) == 244, len(new['runs']))

expected_exit = {s: 0 for s in new['scripts']}
expected_exit['737_cruise_steady_turn_simplex.xml'] = 1
for s in ('kml_output.xml', 'unitconversions.xml', 'plotfile.xml'):
    expected_exit[s] = 255
exit_counts = {}
for label in labels:
    c = Counter(runs[label, s]['exit'] for s in new['scripts'])
    exit_counts[label] = {str(k): v for k, v in sorted(c.items(), key=lambda kv: str(kv[0]))}
    bad = {s: runs[label, s]['exit'] for s in new['scripts'] if runs[label, s]['exit'] != expected_exit[s]}
    check(f'exit_classification_{label}', not bad, bad or exit_counts[label])
check('no_timeouts', all(r['exit'] != 'timeout' for r in new['runs']))

file_counts = {label: sum(len(runs[label, s]['files']) for s in new['scripts']) for label in labels}
for label in labels:
    check(f'file_count_{label}', file_counts[label] == 102, file_counts[label])

# Every runscript has a nonempty trace for every binary.
runscripts = [s for s, v in new['scripts'].items() if v['xml_root'] == 'runscript']
check('runscript_count', len(runscripts) == 58, len(runscripts))
missing_trace = [(l, s) for l in labels for s in runscripts
                 if runs[l, s]['files'].get('review-trace.csv', {}).get('bytes', 0) == 0]
check('nonempty_trace_every_runscript', not missing_trace, missing_trace)

# base/head/probe per-script file hashes, sizes and exits equal to the retained run.
for label in ('base', 'head', 'probe'):
    diff = [s for s in new['scripts']
            if runs[label, s]['files'] != old_runs[label, s]['files'] or runs[label, s]['exit'] != old_runs[label, s]['exit']]
    check(f'{label}_files_and_exits_equal_retained_{label}', not diff, diff)
diff = [s for s in new['scripts']
        if runs['candidate', s]['files'] != old_runs['probe', s]['files'] or runs['candidate', s]['exit'] != old_runs['probe', s]['exit']]
check('candidate_files_and_exits_equal_retained_probe', not diff, diff)

comps = {(c['left'], c['right'], c['script']): c for c in new['comparisons']}
old_comps = {(c['left'], c['right'], c['script']): c for c in old['comparisons']}
check('comparison_count', len(new['comparisons']) == 6 * 61, len(new['comparisons']))


def pair_summary(left, right):
    cs = [comps[left, right, s] for s in new['scripts']]
    changed_files = sum(len(c['changed']) for c in cs)
    changed_scripts = [c['script'] for c in cs if not c['files_equal']]
    changed_success = [s for s in changed_scripts if expected_exit[s] == 0]
    return {'exit_equal_all': all(c['exit_equal'] for c in cs), 'files_equal_scripts': sum(c['files_equal'] for c in cs),
            'changed_files': changed_files, 'changed_scripts': len(changed_scripts),
            'changed_successful_runs': len(changed_success)}


pairs = {f'{l}/{r}': pair_summary(l, r) for l, r in
         [('base', 'head'), ('base', 'probe'), ('base', 'candidate'), ('head', 'probe'), ('head', 'candidate'), ('probe', 'candidate')]}
out['pairs'] = pairs
check('base_head_all_byte_identical', pairs['base/head']['files_equal_scripts'] == 61 and pairs['base/head']['exit_equal_all'], pairs['base/head'])
check('probe_candidate_all_byte_identical', pairs['probe/candidate']['files_equal_scripts'] == 61 and pairs['probe/candidate']['exit_equal_all'], pairs['probe/candidate'])
check('base_candidate_60_files_31_runs', pairs['base/candidate']['changed_files'] == 60 and pairs['base/candidate']['changed_successful_runs'] == 31
      and pairs['base/candidate']['changed_scripts'] == 31 and pairs['base/candidate']['exit_equal_all'], pairs['base/candidate'])

# Every per-file diagnostic equal to the retained comparison.
for new_pair, old_pair in [(('base', 'candidate'), ('base', 'probe')), (('head', 'candidate'), ('head', 'probe')),
                           (('base', 'probe'), ('base', 'probe')), (('head', 'probe'), ('head', 'probe')),
                           (('base', 'head'), ('base', 'head'))]:
    diff = []
    for s in new['scripts']:
        a, b = comps[(*new_pair, s)], old_comps[(*old_pair, s)]
        if (a['changed'], a['exit_equal'], a['files_equal']) != (b['changed'], b['exit_equal'], b['files_equal']):
            diff.append(s)
    check(f'diagnostics_{new_pair[0]}_{new_pair[1]}_equal_retained_{old_pair[0]}_{old_pair[1]}', not diff, diff)

# No shape, header, missing-file or nonfinite mismatch in any pair; list text mismatches.
flags = []
text = []
for c in new['comparisons']:
    for name, d in c['changed'].items():
        if d.get('missing') or d.get('headers_differ') or d.get('shape_mismatch') or d.get('nonfinite_mismatches', 0):
            flags.append((c['left'], c['right'], c['script'], name, d))
        if d.get('text_mismatch'):
            text.append((c['left'], c['right'], c['script'], name))
check('no_shape_header_missing_or_nonfinite_mismatch', not flags, flags)
out['text_mismatches'] = text

# Changed file list for base/candidate, grouped by script.
out['base_candidate_changed'] = {s: sorted(comps['base', 'candidate', s]['changed'])
                                 for s in new['scripts'] if comps['base', 'candidate', s]['changed']}

# Representative runs: full base/candidate per-file diagnostics.
rep = {}
for s in ('c172_cross_wind.xml', 'c1723.xml', 'ZLT-NT-moored-1.xml', 'f16_test.xml'):
    rep[s] = comps['base', 'candidate', s]['changed']
out['representative_base_candidate'] = rep

out['binaries'] = new['binaries']
out['source_commit'] = new['source_commit']
out['exit_counts'] = exit_counts
out['file_counts'] = file_counts
out['result'] = 'ALL CHECKS PASS' if not out['failures'] else 'FAILURES: ' + ', '.join(out['failures'])
print(json.dumps(out, indent=2))
