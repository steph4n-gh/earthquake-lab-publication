#!/usr/bin/env python3
import concurrent.futures
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://mmesch.com/pyjs-obspy/'
CACHE = ROOT / '.cache/baseline/runtime'
LOCK = ROOT / 'docs/baseline-lock.json'

def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()

def digest(data):
    return hashlib.sha256(data).hexdigest()

def prepare(item):
    target = CACHE / item['path']
    if target.exists() and digest(target.read_bytes()) == item['sha256']:
        return
    data = fetch(item['url'])
    if digest(data) != item['sha256']:
        raise ValueError('Baseline asset changed: ' + item['url'])
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)

if not LOCK.exists():
    metadata_bytes = fetch(BASE + 'empack_env_meta.json')
    metadata = json.loads(metadata_bytes)
    lookup = {item['name'].replace('_', '-'): item for item in metadata['packages']}
    selected = set()
    pending = ['obspy', 'python', 'pyjs-rt']
    while pending:
        name = pending.pop().replace('_', '-')
        if name in selected:
            continue
        selected.add(name)
        pending.extend(dep.split()[0] for dep in lookup[name]['depends'])
    metadata['packages'] = [item for item in metadata['packages'] if item['name'].replace('_', '-') in selected]
    paths = ['pyjs_runtime_browser.js', 'pyjs_runtime_browser.wasm'] + ['packages/' + item['filename'] for item in metadata['packages']]
    def download(path):
        data = fetch(BASE + path)
        return {'path': path, 'url': BASE + path, 'bytes': len(data), 'sha256': digest(data)}, data
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(download, paths))
    lock = {'source_repository': 'https://github.com/MMesch/pyjs-obspy', 'source_revision': 'cac66b289a36a61592cbce911c968c74f951b9cb', 'metadata_url': BASE + 'empack_env_meta.json', 'original_metadata_sha256': digest(metadata_bytes), 'packages': metadata, 'assets': [result[0] for result in results]}
    LOCK.write_text(json.dumps(lock, indent=2) + '\n')
    for item, data in results:
        target = CACHE / item['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
else:
    lock = json.loads(LOCK.read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(prepare, lock['assets']))
(CACHE / 'empack_env_meta.json').write_text(json.dumps(lock['packages'], indent=2) + '\n')
print(json.dumps({'packages': len(lock['packages']['packages']), 'asset_bytes': sum(item['bytes'] for item in lock['assets']), 'cache': str(CACHE)}))
