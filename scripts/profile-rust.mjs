import { chromium } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4178/scripts/engine.html');
  await page.waitForFunction(() => window.engine?.ready || window.engine?.error);
  assert.equal(await page.evaluate(() => window.engine.error), null);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await cdp.send('Profiler.start');
  const counts = await page.evaluate(() => {
    const counts = [];
    for (let i = 0; i < 40; i++) {
      const distance = i % 2 ? 150 : 60;
      const arrivals = window.engine.query(35, distance);
      counts.push(arrivals.length);
    }
    return counts;
  });
  const { profile } = await cdp.send('Profiler.stop');
  assert.deepEqual(counts, Array.from({ length: 40 }, (_, i) => i % 2 ? 1 : 2));
  fs.writeFileSync('.audit/rust.cpuprofile', JSON.stringify(profile));
  const summary = {
    note: 'Untimed sample profile, excluded from browser benchmark. Function names may be stripped in the release artifact.',
    verifiedCounts: counts,
    sampleCount: profile.samples?.length,
    topSelfSamples: profile.nodes.filter(node => node.hitCount).toSorted((a, b) => b.hitCount - a.hitCount).slice(0, 20).map(node => ({ function: node.callFrame.functionName, url: node.callFrame.url, samples: node.hitCount })),
  };
  fs.writeFileSync('.audit/rust-profile.json', JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
}
