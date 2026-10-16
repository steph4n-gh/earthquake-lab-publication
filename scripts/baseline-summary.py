#!/usr/bin/env python3
import gzip
import json
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parents[1]

def stats(values):
    return {'median': statistics.median(values), 'minimum': min(values), 'maximum': max(values)}

measurement = json.loads((ROOT / '.audit/baseline/browser-benchmark.json').read_text())
lock = json.loads((ROOT / 'docs/baseline-lock.json').read_text())
assert len(measurement['samples']) >= 5, 'Wait for five complete runs before summarizing.'
summary = {
    'verdict': 'Baseline works. A pairwise Rust performance verdict is not established here.',
    'conditions': 'Shared host. Localhost without compression. Fresh browser contexts and HTTP cache disabled.',
    'cold_first_correct_ms': stats([sample['coldFirstCorrectMs'] for sample in measurement['samples']]),
    'warm_recompute_ms': {str(distance): stats([warm['elapsedMs'] for sample in measurement['samples'] for warm in sample['warm'] if warm['distance'] == distance]) for distance in [60, 150]},
    'runs': len(measurement['samples']),
    'warm_queries_per_distance': len(measurement['samples']) * 5,
    'failures': len(measurement['errors']),
    'allocated_wasm_heap_bytes': measurement['samples'][0]['heapBytes'],
    'browser': measurement['browser'],
    'host': measurement['host'],
    'versions': measurement['samples'][0]['versions'],
    'assets_raw_bytes': sum(asset['bytes'] for asset in lock['assets']),
    'assets_gzip_js_wasm_estimated_bytes': sum(len(gzip.compress((ROOT / '.cache/baseline/runtime' / asset['path']).read_bytes(), mtime=0)) if asset['path'].endswith(('.js', '.wasm')) else asset['bytes'] for asset in lock['assets']),
}
(ROOT / '.audit/baseline/summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
