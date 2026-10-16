#!/usr/bin/env node
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const evidenceDir = path.resolve(process.env.TAUP_EVIDENCE || '.audit/lab/walkthrough');
const port = Number(process.env.TAUP_PORT || 4188);
const url = `http://127.0.0.1:${port}/`;
fs.mkdirSync(evidenceDir, { recursive: true });
const report = { startedAt: new Date().toISOString(), url, viewport: { width: 1440, height: 1080 }, sourceHashes: {}, actions: [], errors: [] };
for (const file of ['index.html', 'web/main.js', 'web/panels.js', 'web/globe.js', 'web/style.css', 'web/experiment.js', 'web/compute.js', 'web/compute-worker.js', 'web/location.js', 'web/geography.js', 'crates/taup-core/src/lib.rs', 'web/pkg/taup_core_bg.wasm', 'fixtures/investigation/tohoku-investigation.json']) report.sourceHashes[file] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const log = fs.openSync(path.join(evidenceDir, 'server.log'), 'w');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', log, log] });
let browser, context, page, video;
let began;
async function ready() {
  await page.waitForFunction(() => window.workbench?.ready || window.workbench?.error, { timeout: 60000 });
  assert.equal(await page.evaluate(() => window.workbench.error), null);
}
async function note(action) {
  const state = await page.evaluate(() => {
    const s = window.workbench.state;
    return { experiment: s.experiment, playing: s.playing, stats: s.stats, source: s.snapshot?.source, receiver: s.snapshot?.receiver, distanceDeg: s.snapshot?.distanceDeg, residualRmsS: s.snapshot?.residuals?.rmsS, arrivals: s.snapshot?.arrivals.map(a => ({ phase: a.phase, timeS: a.time_s, turningDepthKm: a.turning_depth_km })), fit: s.fit && { best: s.fit.best, rmsS: s.fit.rmsS, directCheck: s.fit.directCheck }, clockS: document.getElementById('wave-cursor')?.getAttribute('data-time-s'), globeClockS: document.getElementById('earth-globe')?.getAttribute('data-playback-time-s') };
  });
  report.actions.push({ atS: (Date.now() - began) / 1000, action, ...state });
  console.log(`${report.actions.at(-1).atS.toFixed(1)} s ${action}`);
}
async function pause(ms) { await page.waitForTimeout(ms); }
async function showGlobe() { await page.locator('.workspace').scrollIntoViewIfNeeded(); }

try {
  for (let attempt = 0; ; attempt++) {
    assert.equal(server.exitCode, null, 'Our preview exited. Inspect server.log for a port conflict.');
    try { if ((await fetch(url)).ok) break; } catch {}
    assert.ok(attempt < 80, 'Preview did not become ready.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  report.chrome = browser.version();
  context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1, recordVideo: { dir: path.join(evidenceDir, 'raw'), size: report.viewport } });
  page = await context.newPage(); video = page.video(); began = Date.now();
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.goto(url); await ready(); await pause(2500);
  await note('Open the Tohoku investigation with actual ANMO recording and linked station paths.');
  await page.getByLabel('Replay time in seconds after catalog origin').fill('660');
  await page.getByLabel('Playback speed', { exact: true }).selectOption('30');
  await page.getByRole('button', { name: 'Zoom to arrival', exact: true }).click();
  await page.getByRole('button', { name: 'Play earthquake replay', exact: true }).click(); await pause(3200);
  await page.getByRole('button', { name: 'Pause earthquake replay', exact: true }).click();
  await note('Play through the archived manual P pick. Recording cursor and calculated rays share the clock.');
  await page.getByLabel('Recording station', { exact: true }).selectOption('IU.TATO.00.BHZ'); await ready();
  await page.getByLabel('Replay time in seconds after catalog origin').fill('280');
  await page.getByRole('button', { name: 'Play earthquake replay', exact: true }).click(); await pause(2000);
  await page.getByRole('button', { name: 'Pause earthquake replay', exact: true }).click(); await pause(1600);
  await note('Switch to the independently matched TATO recording.');
  await page.screenshot({ path: path.join(evidenceDir, 'replay.png') });

  await page.locator('[data-mode="locate"]').click(); await ready(); await pause(1700);
  await page.locator('#latitude').fill('41.125'); await pause(400);
  await page.locator('#longitude').fill('146.875'); await pause(400);
  await page.getByRole('button', { name: 'Calculate candidate', exact: true }).click(); await ready();
  await page.locator('#locate-controls').scrollIntoViewIfNeeded(); await pause(2400);
  await note('Test a noncatalog candidate against eight manual P arrival times.');
  await page.getByRole('button', { name: 'Fit source', exact: true }).click();
  await page.locator('#progress-wrap').scrollIntoViewIfNeeded();
  await ready();
  await page.locator('#locate-controls').scrollIntoViewIfNeeded(); await pause(1900);
  const fitted = await page.evaluate(() => window.workbench.state.fit);
  assert.equal(fitted.directCheck.exactConfirmed, true); assert.ok(Math.abs(fitted.rmsS - 0.4756682224678171) < 0.01);
  await note('Run the local source fit and exact per-station ray confirmation.');
  await page.getByRole('button', { name: 'Reveal catalog', exact: true }).click();
  await expect(page.locator('#catalog-comparison')).toContainText('41.9 km');
  await page.locator('#catalog-comparison').scrollIntoViewIfNeeded(); await pause(4200);
  await note('Reveal the 41.9 km model/catalog mismatch without replacing the fitted candidate.');
  await page.screenshot({ path: path.join(evidenceDir, 'location.png') });

  await page.locator('[data-mode="explore"]').click(); await ready();
  await page.getByRole('button', { name: 'Trace the inner core', exact: false }).click(); await ready();
  await page.getByRole('button', { name: 'Focus selected ray section', exact: true }).click();
  await page.getByLabel('Replay time in seconds after catalog origin').fill('800');
  await page.getByLabel('Playback speed', { exact: true }).selectOption('60');
  await showGlobe(); await pause(1900);
  await page.screenshot({ path: path.join(evidenceDir, 'poster.png') });
  await note('Open the true cutaway and focus the calculated PKIKP path to LVC in Chile.');
  await page.getByRole('button', { name: 'Play earthquake replay', exact: true }).click(); await pause(6800);
  await page.getByRole('button', { name: 'Pause earthquake replay', exact: true }).click(); await pause(1700);
  const state = await page.evaluate(() => window.workbench.state);
  assert.equal(state.experiment.phase, 'PKIKP'); assert.equal(state.experiment.stationId, 'IU.LVC.00.BHZ'); assert.ok(state.experiment.timeS > 1180.4);
  await note('Replay from 800 seconds through the calculated Chile arrival across mantle and core.');
  await page.getByRole('button', { name: 'Share experiment', exact: false }).click();
  await page.getByLabel('Reproducible experiment URL').scrollIntoViewIfNeeded(); await pause(2200);
  const sharedUrl = await page.getByLabel('Reproducible experiment URL').inputValue();
  assert.ok(sharedUrl.includes('#lab=1')); report.sharedUrl = sharedUrl;
  const expected = await page.evaluate(() => window.workbench.state.experiment);
  await note('Create a reproducible link containing the event/model identity, camera and paused clock.');
  await page.reload({ waitUntil: 'commit' }); await ready(); await showGlobe(); await pause(2500);
  const restored = await page.evaluate(() => window.workbench.state);
  assert.deepEqual(restored.experiment, expected); assert.equal(restored.playing, false);
  await note('Reopen the experiment with the same section view, station and clock.');
  await page.screenshot({ path: path.join(evidenceDir, 'shared.png') });
  assert.deepEqual(report.errors, []); report.verdict = 'PASS';
} catch (error) {
  report.errors.push(error.stack || String(error)); report.verdict = 'FAIL'; process.exitCode = 1;
} finally {
  if (context) await context.close();
  if (video) {
    const rawPath = path.join(evidenceDir, 'walkthrough.webm'); await video.saveAs(rawPath); report.rawVideo = rawPath;
    const mp4 = path.join(evidenceDir, 'walkthrough.mp4');
    const encoded = spawnSync('/opt/homebrew/bin/ffmpeg', ['-y', '-i', rawPath, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { encoding: 'utf8' });
    fs.writeFileSync(path.join(evidenceDir, 'encoding.log'), encoded.stderr);
    if (encoded.status === 0) {
      report.video = mp4;
      const probe = spawnSync('/opt/homebrew/bin/ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', mp4], { encoding: 'utf8' });
      report.videoMetadata = JSON.parse(probe.stdout);
    } else { report.errors.push('Video encoding failed. Inspect encoding.log.'); report.verdict = 'FAIL'; process.exitCode = 1; }
  }
  if (browser) await browser.close();
  if (server.exitCode === null) { const ended = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await ended; }
  fs.closeSync(log); report.finishedAt = new Date().toISOString(); report.serverExitCode = server.exitCode; report.serverSignal = server.signalCode;
  fs.writeFileSync(path.join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ verdict: report.verdict, actions: report.actions.length, video: report.video, durationS: report.videoMetadata?.format.duration, errors: report.errors, evidenceDir }, null, 2));
}
