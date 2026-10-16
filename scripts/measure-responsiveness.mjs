#!/usr/bin/env node
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const evidenceDir = path.resolve(process.env.TAUP_EVIDENCE || '.audit/lab/performance');
const port = Number(process.env.TAUP_PORT || 4188);
const rounds = Number(process.env.TAUP_FIT_ROUNDS ?? 5);
assert.ok(Number.isInteger(rounds) && rounds >= 0 && rounds <= 20, 'TAUP_FIT_ROUNDS must be an integer from 0 to 20.');
const url = `http://127.0.0.1:${port}/`;
fs.mkdirSync(evidenceDir, { recursive: true });
const report = {
  claim: 'The production investigation keeps playback responsive during a real eight-station source fit. First-fit preparation and cached-curve fits have separate end-to-end costs.',
  startedAt: new Date().toISOString(), url,
  environment: { platform: process.platform, architecture: process.arch, cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, loadBefore: os.loadavg(), node: process.version, uptime: spawnSync('uptime', { encoding: 'utf8' }).stdout.trim(), headless: true, deviceScaleFactor: 1, physicalMobileDevice: false },
  method: { repetitionsPerViewport: rounds, cache: 'New browser context and worker for every cold fit. Warm fit reuses that same worker and its checked runtime curve. Browser binary and OS caches are not flushed.', feedback: 'Trusted click capture to the first animation-frame opportunity after the pending DOM mutation. This is a browser rendering opportunity, not physical display latency.', frames: 'Animation-frame timestamps only while a fit is pending, playback is active, and at least half the globe is visible. No screenshot, trace, native solver, or state cloning runs inside the timed fit interval.', longTasks: 'PerformanceObserver longtask entries overlapping the fit interval. Chrome reports main-thread tasks of at least 50 ms.', endToEnd: 'Trusted Fit click to the first frame after the final linked exact snapshot is ready. Includes curve generation, search, exact confirmation, final station paths, UI updates, and rendering work.', errors: 'Browser page and console errors plus explicit fit/output assertions. Cancellation is an expected user action.' },
  sourceHashes: {}, trials: [], cancellations: [], errors: [],
};
for (const file of ['index.html', 'web/main.js', 'web/panels.js', 'web/globe.js', 'web/style.css', 'web/experiment.js', 'web/compute.js', 'web/compute-worker.js', 'web/location.js', 'web/geography.js', 'crates/taup-core/src/lib.rs', 'web/pkg/taup_core_bg.wasm', 'fixtures/investigation/tohoku-investigation.json']) report.sourceHashes[file] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const log = fs.openSync(path.join(evidenceDir, 'server.log'), 'w');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', log, log] });
let browser;
const contexts = new Set();
const summarize = values => {
  const sorted = values.toSorted((a, b) => a - b);
  return { count: sorted.length, median: sorted[Math.floor(sorted.length / 2)], minimum: sorted[0], maximum: sorted.at(-1) };
};

async function installMeasurements(page) {
  await page.evaluate(() => {
    const data = { fits: [], cancels: [], longTasks: [] };
    let active = null;
    let visible = false;
    let lastFrame = null;
    new IntersectionObserver(entries => { visible = entries.at(-1).intersectionRatio >= 0.5; if (!visible) lastFrame = null; }, { threshold: [0, 0.5, 1] }).observe(document.getElementById('earth-globe'));
    const observer = new PerformanceObserver(list => data.longTasks.push(...list.getEntries().map(entry => ({ startTime: entry.startTime, duration: entry.duration }))));
    observer.observe({ type: 'longtask', buffered: true });
    document.addEventListener('click', event => {
      if (!event.isTrusted) return;
      const id = event.target.closest('button')?.id;
      if (id === 'fit') {
        active = { start: performance.now(), feedbackDomMs: null, feedbackFrameMs: null, endToEndMs: null, frameGapsMs: [], stageBoundaries: [] };
        data.fits.push(active); lastFrame = null;
      }
      if (id === 'cancel') {
        const item = { start: performance.now(), domMs: null, frameMs: null };
        data.cancels.push(item);
        active = null; lastFrame = null;
      }
    }, true);
    let previousStage = '';
    new MutationObserver(() => {
      const cancelled = data.cancels.at(-1);
      if (cancelled && cancelled.domMs === null && !document.getElementById('error').hidden && document.getElementById('error-text').textContent.includes('cancelled')) {
        cancelled.domMs = performance.now() - cancelled.start;
        requestAnimationFrame(() => { cancelled.frameMs = performance.now() - cancelled.start; });
      }
      if (!active) return;
      if (document.querySelector('.workspace').classList.contains('calculating') && active.feedbackDomMs === null) {
        active.feedbackDomMs = performance.now() - active.start;
        const item = active;
        requestAnimationFrame(() => { item.feedbackFrameMs = performance.now() - item.start; });
      }
      const stage = document.getElementById('progress-label').textContent;
      if (stage && stage !== previousStage) { previousStage = stage; active.stageBoundaries.push({ elapsedMs: performance.now() - active.start, label: stage }); }
    }).observe(document.getElementById('app'), { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    function frame(now) {
      if (active) {
        const pending = document.querySelector('.workspace').classList.contains('calculating');
        const playing = document.getElementById('play').getAttribute('aria-label') === 'Pause earthquake replay';
        if (pending && playing && visible) { if (lastFrame !== null) active.frameGapsMs.push(now - lastFrame); lastFrame = now; } else lastFrame = null;
        if (active.feedbackDomMs !== null && !pending && window.workbench.ready) {
          active.end = performance.now(); active.endToEndMs = active.end - active.start;
          active.longTasks = data.longTasks.filter(task => task.startTime < active.end && task.startTime + task.duration > active.start);
          active = null; lastFrame = null;
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    Object.defineProperty(window, '__taupMeasurement', { value: data });
  });
}

async function ready(page) {
  await page.waitForFunction(() => window.workbench?.ready || window.workbench?.error, { timeout: 60000 });
  assert.equal(await page.evaluate(() => window.workbench.error), null);
}

async function fit(page, viewport, round, cache) {
  const before = await page.evaluate(() => ({ stats: window.workbench.state.stats, time: window.workbench.state.experiment.timeS }));
  await page.getByRole('button', { name: 'Fit source', exact: true }).click();
  await page.locator('#earth-globe').scrollIntoViewIfNeeded();
  await ready(page);
  await page.waitForFunction(() => window.__taupMeasurement.fits.at(-1)?.endToEndMs !== null);
  const result = await page.evaluate(() => ({ timing: window.__taupMeasurement.fits.at(-1), state: window.workbench.state }));
  const { state, timing } = result;
  assert.equal(state.fit.directCheck.exactConfirmed, true);
  assert.ok(Math.abs(state.fit.rmsS - 0.4756682224678171) < 0.01);
  assert.equal(state.snapshot.residuals.stations.length, 8);
  assert.equal(state.snapshot.networkRays.length, 9);
  assert.ok(state.stats.completed - before.stats.completed >= 2, 'The fit and final linked snapshot must both finish.');
  assert.ok(state.experiment.timeS > before.time, 'The real replay must advance during the fit.');
  assert.ok(timing.frameGapsMs.length > (cache === 'cold' ? 30 : 1), 'Collect real visible-globe frames during worker computation.');
  assert.ok(timing.feedbackDomMs !== null && timing.feedbackFrameMs !== null);
  const gaps = timing.frameGapsMs;
  report.trials.push({ viewport, round, cache, ...timing, visibleFrameGaps: { count: gaps.length, median: summarize(gaps).median, p95: gaps.toSorted((a,b) => a-b)[Math.floor(gaps.length * 0.95)], maximum: Math.max(...gaps), over50Ms: gaps.filter(gap => gap > 50).length }, longTaskCount: timing.longTasks.length, longestTaskMs: Math.max(0, ...timing.longTasks.map(item => item.duration)), completedJobs: state.stats.completed - before.stats.completed, cancelledJobs: state.stats.cancelled - before.stats.cancelled, replayAdvancedS: state.experiment.timeS - before.time, rmsS: state.fit.rmsS, best: state.fit.best, directCheck: state.fit.directCheck, curveCheck: state.fit.curveCheck, searchEvaluations: state.fit.iterations, retainedObservations: state.snapshot.residuals.stations.length, networkRays: state.snapshot.networkRays.length, finalEvaluationMs: state.snapshot.elapsedMs });
  console.log(`${viewport} round ${round + 1} ${cache}: ${timing.endToEndMs.toFixed(1)} ms, feedback ${timing.feedbackFrameMs.toFixed(1)} ms, visible frame max ${Math.max(...gaps).toFixed(1)} ms`);
}

try {
  for (let attempt = 0; ; attempt++) {
    assert.equal(server.exitCode, null, 'Our preview exited. Inspect server.log for a port conflict.');
    try { if ((await fetch(url)).ok) break; } catch {}
    assert.ok(attempt < 80, 'Preview did not become ready.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  report.environment.chrome = browser.version();
  for (let round = 0; round < rounds; round++) {
    for (const viewport of round % 2 ? ['mobile', 'desktop'] : ['desktop', 'mobile']) {
      const dimensions = viewport === 'desktop' ? { width: 1440, height: 1080 } : { width: 390, height: 844 };
      const context = await browser.newContext({ viewport: dimensions, deviceScaleFactor: 1 }); contexts.add(context);
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
      await page.goto(url); await ready(page);
      await page.locator('[data-mode="locate"]').click(); await ready(page);
      await page.locator('#latitude').fill('41.125'); await page.locator('#longitude').fill('146.875');
      await page.getByRole('button', { name: 'Calculate candidate', exact: true }).click(); await ready(page);
      await page.getByRole('button', { name: 'Play earthquake replay', exact: true }).click();
      await installMeasurements(page);
      await fit(page, viewport, round, 'cold');
      await fit(page, viewport, round, 'warm');
      if (round === 0) await page.screenshot({ path: path.join(evidenceDir, `${viewport}-fit.png`), fullPage: true });
      await context.close(); contexts.delete(context);
    }
  }
  for (const [viewport, dimensions] of [['desktop', { width: 1440, height: 1080 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport: dimensions }); contexts.add(context);
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    await page.goto(url); await ready(page); await page.locator('[data-mode="locate"]').click(); await ready(page);
    await installMeasurements(page);
    await page.getByRole('button', { name: 'Fit source', exact: true }).click();
    await expect(page.locator('#progress-label')).toContainText('curve');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('#error-text')).toContainText('cancelled');
    await page.waitForFunction(() => window.__taupMeasurement.cancels.at(-1)?.frameMs !== null);
    const cancelled = await page.evaluate(() => ({ timing: window.__taupMeasurement.cancels.at(-1), state: window.workbench.state }));
    assert.ok(cancelled.state.stats.cancelled > 0); assert.equal(cancelled.state.fit, null);
    report.cancellations.push({ viewport, ...cancelled.timing, cancelledJobs: cancelled.state.stats.cancelled });
    await page.getByRole('button', { name: 'Retry calculation', exact: true }).click(); await ready(page);
    await context.close(); contexts.delete(context);
  }
  report.summary = {};
  for (const viewport of ['desktop', 'mobile']) for (const cache of ['cold', 'warm']) {
    const trials = report.trials.filter(item => item.viewport === viewport && item.cache === cache);
    if (!trials.length) continue;
    report.summary[`${viewport}-${cache}`] = { endToEndMs: summarize(trials.map(item => item.endToEndMs)), feedbackFrameMs: summarize(trials.map(item => item.feedbackFrameMs)), feedbackDomMs: summarize(trials.map(item => item.feedbackDomMs)), maximumVisibleFrameGapMs: summarize(trials.map(item => item.visibleFrameGaps.maximum)), pooledVisibleFrameGapMs: { ...summarize(trials.flatMap(item => item.frameGapsMs)), p95: trials.flatMap(item => item.frameGapsMs).toSorted((a,b) => a-b)[Math.floor(trials.flatMap(item => item.frameGapsMs).length * 0.95)] }, longTasks: trials.reduce((sum, item) => sum + item.longTaskCount, 0), errors: report.errors.length };
  }
  assert.deepEqual(report.errors, []);
  report.verdict = 'PASS';
} catch (error) {
  report.errors.push(error.stack || String(error)); report.verdict = 'FAIL'; process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close();
  if (browser) await browser.close();
  if (server.exitCode === null) { const ended = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await ended; }
  fs.closeSync(log); report.finishedAt = new Date().toISOString(); report.environment.loadAfter = os.loadavg(); report.serverExitCode = server.exitCode; report.serverSignal = server.signalCode;
  fs.writeFileSync(path.join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ verdict: report.verdict, trials: report.trials.length, summary: report.summary, errors: report.errors, evidenceDir }, null, 2));
}
