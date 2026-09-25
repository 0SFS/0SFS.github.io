#!/usr/bin/env python3
"""Run every shipped script in isolated directories and compare every data file.

Example: python3 compare_scripts.py --source /path/to/jsbsim --binary base=/.../JSBSim
  --binary head=/.../JSBSim --binary candidate=/.../JSBSim
Raw output defaults to a new dated directory in the source repository's build/.
stdout/stderr are retained separately: elapsed time/build banners are not data.
No scripts or aircraft definitions are modified. No shortened simulation times.
"""
import argparse
import concurrent.futures
import csv
import datetime
import hashlib
import itertools
import json
import math
import os
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET


def digest(p):
    with p.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def numeric_difference(a, b):
    result = {'different_rows': 0, 'max_abs_by_column': {}, 'nonfinite_mismatches': 0}
    with a.open(errors='replace') as fa, b.open(errors='replace') as fb:
        ra, rb = csv.reader(fa), csv.reader(fb)
        ha, hb = next(ra, []), next(rb, [])
        if ha != hb:
            return {'headers_differ': True}
        count = 0
        for count, (xa, xb) in enumerate(itertools.zip_longest(ra, rb), 1):
            if xa == xb:
                continue
            result['different_rows'] += 1
            if 'first_different_row' not in result:
                result['first_different_row'] = count
                result['first_different_time'] = (xa or xb or [''])[0]
            if xa is None or xb is None or len(xa) != len(xb):
                result['shape_mismatch'] = True
                continue
            for i, (va, vb) in enumerate(zip(xa, xb)):
                if va == vb:
                    continue
                try:
                    na, nb = float(va), float(vb)
                except ValueError:
                    result['text_mismatch'] = True
                    continue
                if not math.isfinite(na) or not math.isfinite(nb):
                    result['nonfinite_mismatches'] += 1
                    continue
                k = ha[i].strip() if i < len(ha) else str(i)
                result['max_abs_by_column'][k] = max(result['max_abs_by_column'].get(k, 0), abs(na-nb))
        result['rows'] = count
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--binary', action='append', required=True)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--jobs', type=int, default=8)
    parser.add_argument('--timeout', type=int, default=600)
    parser.add_argument('--only', action='append', help='Optional script stems for diagnostic repeats')
    parser.add_argument('--trace', action='store_true', help='Append a per-step state/gear output to runscript inputs')
    args = parser.parse_args()
    source = args.source.resolve()
    binaries = {k: Path(v).resolve() for k, v in (item.split('=', 1) for item in args.binary)}
    stamp = datetime.datetime.now().strftime('%Y-%m-%d_%H%M%S')
    output = (args.output or source / 'build' / 'wheel-spin-review' / stamp).resolve()
    output.mkdir(parents=True, exist_ok=False)
    scripts = sorted((source / 'scripts').glob('*.xml'))
    if args.only:
        scripts = [p for p in scripts if p.stem in args.only]
    manifest = {'source': str(source), 'source_commit': subprocess.check_output(
        ['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip(),
        'binaries': {k: {'path': str(v), 'sha256': digest(v)} for k, v in binaries.items()},
        'trace': args.trace,
        'scripts': {p.name: {'sha256': digest(p), 'xml_root': ET.parse(p).getroot().tag} for p in scripts},
        'runs': [], 'comparisons': []}
    traces = output / 'directives'
    if args.trace:
        traces.mkdir()
        properties = ['position/lat-geod-deg', 'position/long-gc-deg', 'position/h-sl-ft',
                      'velocities/u-fps', 'velocities/v-fps', 'velocities/w-fps',
                      'velocities/p-rad_sec', 'velocities/q-rad_sec', 'velocities/r-rad_sec',
                      'attitude/phi-rad', 'attitude/theta-rad', 'attitude/psi-rad',
                      'forces/fbx-gear-lbs', 'forces/fby-gear-lbs', 'forces/fbz-gear-lbs',
                      'moments/l-gear-lbsft', 'moments/m-gear-lbsft', 'moments/n-gear-lbsft']
        for script in scripts:
            xml = ET.parse(script).getroot()
            if xml.tag != 'runscript':
                continue
            dt = float(xml.find('run').get('dt', '0.008333333333333333'))
            assert dt >= 0.001, (script, 'Output rate cap prevents per-step logging', dt)
            (traces / script.name).write_text(
                '<output name="review-trace.csv" type="CSV" rate="' + str(1.0/dt) + '">\n' +
                ''.join('  <property>' + p + '</property>\n' for p in properties) + '</output>\n')

    def run(label, script):
        directory = output / label / script.stem
        directory.mkdir(parents=True)
        command = [str(binaries[label]), '--root=' + str(source), '--script=' + str(script),
                   '--outputpath=' + str(directory), '--nohighlight']
        if args.trace and ET.parse(script).getroot().tag == 'runscript':
            command.append('--logdirectivefile=' + str(traces / script.name))
        with (directory / 'console.stdout').open('wb') as stdout, (directory / 'console.stderr').open('wb') as stderr:
            try:
                p = subprocess.run(command, cwd=directory, stdout=stdout, stderr=stderr,
                                   env={**os.environ, 'JSBSIM_DEBUG': '0'}, timeout=args.timeout)
                status = p.returncode
            except subprocess.TimeoutExpired:
                status = 'timeout'
        files = {str(p.relative_to(directory)): {'sha256': digest(p), 'bytes': p.stat().st_size}
                 for p in sorted(directory.rglob('*')) if p.is_file() and not p.name.startswith('console.')}
        return {'label': label, 'script': script.name, 'exit': status, 'command': command, 'files': files}

    with concurrent.futures.ThreadPoolExecutor(args.jobs) as pool:
        futures = [pool.submit(run, label, script) for label in binaries for script in scripts]
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            manifest['runs'].append(result)
            print(result['label'], result['script'], result['exit'], len(result['files']), flush=True)
    manifest['runs'].sort(key=lambda r: (r['label'], r['script']))
    lookup = {(r['label'], r['script']): r for r in manifest['runs']}
    labels = list(binaries)
    for left, right in itertools.combinations(labels, 2):
        for script in scripts:
            a, b = lookup[left, script.name], lookup[right, script.name]
            comparison = {'left': left, 'right': right, 'script': script.name,
                          'exit_equal': a['exit'] == b['exit'], 'files_equal': a['files'] == b['files'], 'changed': {}}
            for name in sorted(a['files'].keys() | b['files'].keys()):
                if a['files'].get(name) == b['files'].get(name):
                    continue
                if name not in a['files'] or name not in b['files']:
                    comparison['changed'][name] = {'missing': True}
                else:
                    pa, pb = output / left / script.stem / name, output / right / script.stem / name
                    comparison['changed'][name] = numeric_difference(pa, pb)
            manifest['comparisons'].append(comparison)
    (output / 'summary.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('SUMMARY', output / 'summary.json', flush=True)


if __name__ == '__main__':
    main()
