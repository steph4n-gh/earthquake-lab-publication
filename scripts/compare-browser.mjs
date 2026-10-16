import { chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const expected = {
  60: [['P', 602.9503561860411], ['S', 1093.648135181093]],
  150: [['PKIKP', 1180.9988664288821]],
};
function check(distance, arrivals) {
  assert.equal(arrivals.length, expected[distance].length);
  for (let i = 0; i < arrivals.length; i++) {
    const arrival = arrivals[i];
    assert.equal(arrival.phase, expected[distance][i][0]);
    assert.ok(Math.abs(arrival.time_s - expected[distance][i][1]) < 0.1);
    assert.ok(arrival.path.length > 100);
    const end = arrival.path.at(-1);
    const angle = end.distance_rad === undefined ? end.distance_deg : end.distance_rad * 180 / Math.PI;
    assert.ok(Math.abs(angle - distance) < 1e-5);
    assert.ok(Math.abs(end.depth_km) < 1e-8);
  }
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = {
  claim: 'Compare the implemented three-phase Rust package with the pinned available ObsPy browser deployment. This is not a general Rust-versus-Python claim.',
  host: { model: os.cpus()[0].model, cpus: os.cpus().length, loadAverage: os.loadavg() },
  browser: browser.version(), samples: [], failures: [],
  rustSourceSha256: crypto.createHash('sha256').update(fs.readFileSync('crates/taup-core/src/lib.rs')).digest('hex'),
};
try {
  for (let round = 0; round < 5; round++) {
    const order = round % 2 ? ['rust', 'obspy'] : ['obspy', 'rust'];
    for (const implementation of order) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      const handle = implementation === 'rust' ? 'engine' : 'baseline';
      const responses = [];
      page.on('response', response => { if (response.status() >= 400) responses.push({ url: response.url(), status: response.status() }); });
      const start = performance.now();
      await page.goto(`http://127.0.0.1:4178/scripts/${implementation === 'rust' ? 'engine' : 'baseline'}.html`);
      await page.waitForFunction(name => window[name]?.ready || window[name]?.error, handle, { timeout: 120000 });
      assert.equal(await page.evaluate(name => window[name].error, handle), null);
      const first = await page.evaluate(async name => await window[name].query(35, 60), handle);
      check(60, first);
      const coldFirstCorrectMs = performance.now() - start;
      const warm = [];
      for (let i = 0; i < 10; i++) {
        const distance = i % 2 ? 150 : 60;
        const sample = await page.evaluate(async ({ name, distance }) => {
          const start = performance.now();
          const arrivals = await window[name].query(35, distance);
          return { elapsedMs: performance.now() - start, arrivals };
        }, { name: handle, distance });
        check(distance, sample.arrivals);
        warm.push({ distance, elapsedMs: sample.elapsedMs, arrivals: sample.arrivals.length, pathPoints: sample.arrivals.reduce((n, a) => n + a.path.length, 0) });
      }
      const evidence = await page.evaluate(name => ({ heapBytes: window[name].heapBytes(), resources: performance.getEntriesByType('resource').map(r => ({ url: r.name, transferred: r.transferSize, bodyBytes: r.encodedBodySize })) }), handle);
      assert.equal(responses.length, 0, JSON.stringify(responses));
      report.samples.push({ round, implementation, coldFirstCorrectMs, warm, ...evidence });
      await context.close();
    }
    process.stdout.write(`Compared round ${round + 1}/5.\n`);
  }
} catch (error) {
  report.failures.push(String(error));
} finally {
  await browser.close();
}
const stats = values => {
  const sorted = values.toSorted((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], min: sorted[0], max: sorted.at(-1), n: sorted.length };
};
report.summary = {};
for (const name of ['rust', 'obspy']) {
  const samples = report.samples.filter(s => s.implementation === name);
  report.summary[name] = {
    coldFirstCorrectMs: stats(samples.map(s => s.coldFirstCorrectMs)),
    warm60Ms: stats(samples.flatMap(s => s.warm.filter(w => w.distance === 60).map(w => w.elapsedMs))),
    warm150Ms: stats(samples.flatMap(s => s.warm.filter(w => w.distance === 150).map(w => w.elapsedMs))),
    allocatedWasmBytes: samples.map(s => s.heapBytes),
  };
}
report.rustArtifacts = fs.readdirSync('web/pkg').map(name => {
  const bytes = fs.readFileSync(`web/pkg/${name}`);
  return { name, bytes: bytes.length, gzipBytes: zlib.gzipSync(bytes).length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
});
fs.writeFileSync('.audit/browser-comparison.json', JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify({ summary: report.summary, failures: report.failures, rustArtifacts: report.rustArtifacts }, null, 2) + '\n');
if (report.failures.length || report.samples.length !== 10) process.exitCode = 1;
