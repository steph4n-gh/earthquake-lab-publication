#!/usr/bin/env node
import {chromium, expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';

const evidenceDir = path.resolve(process.env.TAUP_EVIDENCE || '.audit/atlas/walkthrough');
const port = Number(process.env.TAUP_PORT || 4192);
const url = `http://127.0.0.1:${port}/`;
fs.mkdirSync(evidenceDir, {recursive: true});
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files = ['index.html', 'package.json', 'package-lock.json', 'scripts/record-atlas.mjs', 'crates/taup-core/src/lib.rs', 'web/pkg/taup_core_bg.wasm', 'fixtures/investigation/tohoku-investigation.json', 'fixtures/observed/tohoku-2011.json', 'fixtures/events/maule-2010/case.json', 'fixtures/events/okhotsk-2013/case.json', ...fs.readdirSync('web').filter(file => /\.(js|css)$/.test(file)).map(file => `web/${file}`), ...fs.readdirSync('dist/assets').map(file => `dist/assets/${file}`)];
const report = {startedAt: new Date().toISOString(), url, viewport: {width: 1440, height: 1080}, method: 'Continuous browser recording of public controls in the production build. No state setters, synthetic physics or postproduction replacement of the UI. Encoded to H.264 without audio.', sourceHashes: Object.fromEntries(files.sort().map(file => [file, hash(file)])), actions: [], errors: []};
const log = fs.openSync(path.join(evidenceDir, 'server.log'), 'w');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {stdio: ['ignore', log, log]});
let browser, context, page, video, began;
const pause = ms => page.waitForTimeout(ms);
const showScene = () => page.locator('.scene-heading').evaluate(element => element.scrollIntoView({block: 'start', behavior: 'instant'}));
async function ready(event) {
  await page.waitForFunction(key => (window.workbench?.ready || window.workbench?.error) && (!key || window.workbench.state.investigation.key === key), event, {timeout: 60000});
  assert.equal(await page.evaluate(() => window.workbench.error), null);
}
async function note(action) {
  const result = await page.evaluate(() => {
    const state = window.workbench.state;
    return {event: state.investigation.key, identity: state.investigation.identity, experiment: state.experiment, playing: state.playing, stats: state.stats, source: state.snapshot?.source, receiver: state.snapshot?.receiver, distanceDeg: state.snapshot?.distanceDeg, arrivals: state.snapshot?.arrivals.map(arrival => ({phase: arrival.phase, timeS: arrival.time_s, turningDepthKm: arrival.turning_depth_km, pathSamples: arrival.path.length})), networkRays: state.snapshot?.networkRays.length, fit: state.fit && {best: state.fit.best, rmsS: state.fit.rmsS, directCheck: state.fit.directCheck}, diagram: state.diagram && {depthKm: state.diagram.depthKm, samples: state.diagram.samples.length, roots: state.diagram.samples.reduce((sum, sample) => sum + sample.arrivals.length, 0)}, displayed: {recordRows: document.querySelectorAll('#record-section [data-kind="record-row"]').length, sampledRoots: document.querySelectorAll('#travel-time-diagram [data-kind="sampled-root"]').length, sectionPacket: document.getElementById('section-view')?.dataset.selectedPacket, globePacket: document.getElementById('earth-globe')?.dataset.selectedPacket}};
  });
  report.actions.push({atS: (Date.now() - began) / 1000, action, ...result});
  console.log(`${report.actions.at(-1).atS.toFixed(1)} s ${action}`);
}
async function play(startS, durationMs, speed = '30') {
  await page.getByLabel('Replay time in seconds after catalog origin').fill(String(startS));
  await page.getByLabel('Playback speed', {exact: true}).selectOption(speed);
  await page.getByRole('button', {name: 'Play earthquake replay', exact: true}).click();
  await showScene();
  await pause(durationMs);
  await page.getByRole('button', {name: 'Pause earthquake replay', exact: true}).click();
  await showScene();
}

try {
  for (let attempt = 0; ; attempt++) {
    assert.equal(server.exitCode, null, 'Owned preview exited. Inspect server.log for a port conflict.');
    try { if ((await fetch(url)).ok) break; } catch {}
    assert.ok(attempt < 80); await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({channel: 'chrome', headless: true}); report.chrome = browser.version();
  context = await browser.newContext({viewport: report.viewport, deviceScaleFactor: 1, recordVideo: {dir: path.join(evidenceDir, 'raw'), size: report.viewport}});
  await context.addInitScript(() => {
    window.__atlasWindowErrors = [];
    window.addEventListener('error', event => window.__atlasWindowErrors.push({message: event.message, filename: event.filename, line: event.lineno, column: event.colno}));
  });
  page = await context.newPage(); video = page.video(); began = Date.now();
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.goto(url); await ready(); await pause(2100);
  await note('Open Tohoku with real station recordings and a local calculated network.');
  await page.locator('button[data-mode="explore"]').click(); await ready();
  await page.getByRole('button', {name: 'Trace the inner core', exact: false}).click(); await ready();
  await page.locator('.visual-stage').scrollIntoViewIfNeeded(); await pause(1200);
  await page.getByLabel('Replay time in seconds after catalog origin').fill('800');
  await showScene();
  await page.screenshot({path: path.join(evidenceDir, 'poster.png')});
  await note('Read the proportional mantle, liquid outer core and solid inner core in the annotated section.');
  await play(700, 5000, '60');
  await note('Follow the actual PKIKP packet through Earth on the shared cumulative ray clock.');
  await page.locator('[data-interior="globe"]').click();
  await play(400, 4300, '60');
  await note('Keep geographic context in the true 3D cutaway with the same computed ray.');
  await page.screenshot({path: path.join(evidenceDir, 'globe.png')});
  await page.locator('[data-evidence="records"]').click();
  await page.locator('#record-section').scrollIntoViewIfNeeded(); await pause(2400);
  await page.locator('#record-section [data-kind="record-row"][data-station-id="IU.TATO.00.BHZ"]').click({position: {x: 32, y: 30}}); await ready();
  await page.locator('#record-section').scrollIntoViewIfNeeded(); await pause(1900);
  await note('Select TATO in the real multi-station record section. Pick crosses remain distinct from model markers.');
  await page.locator('[data-evidence="travel"]').click();
  await page.locator('#evidence-views').scrollIntoViewIfNeeded();
  await page.waitForSelector('#travel-time-diagram'); await pause(1600);
  await page.getByRole('button', {name: 'Emphasize S travel times', exact: true}).click();
  await page.locator('#travel-time-diagram').scrollIntoViewIfNeeded(); await pause(2100);
  await note('Inspect all supported P, S and PKIKP roots at 90 distances. Gaps stay empty and no branch lines are invented.');
  await page.screenshot({path: path.join(evidenceDir, 'travel.png')});
  await page.locator('#travel-time-diagram [data-kind="sampled-root"][data-phase="S"][data-distance-deg="81"]').first().click(); await ready();
  await page.locator('.visual-stage').scrollIntoViewIfNeeded(); await pause(1600);
  await play(450, 2500, '60');
  await note('Open a sampled S root as a labeled virtual-receiver experiment and trace its actual mantle path.');

  await page.getByLabel('Earthquake investigation', {exact: true}).selectOption('maule-2010'); await ready('maule-2010');
  await page.locator('.mission').scrollIntoViewIfNeeded(); await pause(2300);
  await note('Switch to shallow Maule with six real recordings and an explicit replay-only scientific scope.');
  await page.locator('button[data-mode="explore"]').click(); await ready();
  await page.getByLabel('Seismic phase', {exact: true}).selectOption('P');
  await play(50, 2400, '30');
  await note('Inspect a shallow-source P ray in the same proportional section.');
  await page.screenshot({path: path.join(evidenceDir, 'maule.png')});
  await page.getByLabel('Earthquake investigation', {exact: true}).selectOption('okhotsk-2013'); await ready('okhotsk-2013');
  await page.locator('.mission').scrollIntoViewIfNeeded(); await pause(2000);
  await page.locator('button[data-mode="explore"]').click(); await ready();
  await page.getByLabel('Recording station', {exact: true}).selectOption('IU.ANMO.00.BHZ'); await ready();
  await page.getByLabel('Seismic phase', {exact: true}).selectOption('P');
  await play(120, 3000, '30');
  await note('Contrast the 598.1 km deep Okhotsk source with shallow Maule. Recordings remain historical evidence.');
  await page.screenshot({path: path.join(evidenceDir, 'okhotsk.png')});

  await page.getByRole('button', {name: 'Open Tohoku source challenge', exact: false}).click(); await ready('tohoku-2011');
  await page.locator('#locate-controls').scrollIntoViewIfNeeded(); await pause(1600);
  await page.getByRole('button', {name: 'Fit source', exact: true}).click();
  await page.locator('#progress-wrap').scrollIntoViewIfNeeded(); await ready();
  await page.getByRole('button', {name: 'Reveal catalog', exact: true}).click();
  await expect(page.locator('#catalog-comparison')).toContainText('41.9 km');
  await page.locator('#catalog-comparison').scrollIntoViewIfNeeded(); await pause(3300);
  const fit = await page.evaluate(() => window.workbench.state.fit);
  assert.equal(fit.directCheck.exactConfirmed, true); assert.ok(Math.abs(fit.rmsS - .4756682224678171) < .01);
  await note('Run the independently grounded Tohoku location exercise and preserve the 41.9 km model/catalog mismatch.');
  await page.locator('button[data-mode="explore"]').click(); await ready();
  await page.getByRole('button', {name: 'Trace the inner core', exact: false}).click(); await ready();
  await page.getByLabel('Replay time in seconds after catalog origin').fill('800');
  await page.locator('.visual-stage').scrollIntoViewIfNeeded(); await pause(1000);
  await page.getByRole('button', {name: 'Share experiment', exact: false}).click();
  const shared = page.getByLabel('Reproducible experiment URL'); await shared.scrollIntoViewIfNeeded(); await pause(1800);
  report.sharedUrl = await shared.inputValue(); assert.ok(report.sharedUrl.includes('#lab=2'));
  const expected = await page.evaluate(() => window.workbench.state.experiment);
  for (const error of await page.evaluate(() => window.__atlasWindowErrors)) report.errors.push(`window error before reload: ${JSON.stringify(error)}`);
  await page.reload({waitUntil: 'commit'}); await ready();
  await page.locator('.visual-stage').scrollIntoViewIfNeeded(); await pause(1800);
  const restored = await page.evaluate(() => window.workbench.state);
  assert.deepEqual(restored.experiment, expected); assert.equal(restored.playing, false);
  await note('Reopen the versioned experiment link with identical event, model identity, selected ray, view and paused clock.');
  await page.screenshot({path: path.join(evidenceDir, 'shared.png')});
  for (const [file, digest] of Object.entries(report.sourceHashes)) assert.equal(hash(file), digest, `Source changed while recording: ${file}`);
  for (const error of await page.evaluate(() => window.__atlasWindowErrors)) report.errors.push(`window error after reload: ${JSON.stringify(error)}`);
  assert.deepEqual(report.errors, []); report.verdict = 'PASS';
} catch (error) {
  report.errors.push(error.stack || String(error)); report.verdict = 'FAIL'; process.exitCode = 1;
} finally {
  if (context) await context.close();
  if (video) {
    const rawPath = path.join(evidenceDir, 'walkthrough.webm'); await video.saveAs(rawPath); report.rawVideo = rawPath;
    const mp4 = path.join(evidenceDir, 'walkthrough.mp4');
    const encoded = spawnSync('/opt/homebrew/bin/ffmpeg', ['-y', '-i', rawPath, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], {encoding: 'utf8'});
    fs.writeFileSync(path.join(evidenceDir, 'encoding.log'), encoded.stderr);
    if (encoded.status === 0) {
      report.video = mp4;
      const probe = spawnSync('/opt/homebrew/bin/ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', mp4], {encoding: 'utf8'});
      report.videoMetadata = JSON.parse(probe.stdout);
    } else { report.errors.push('Video encoding failed. Inspect encoding.log.'); report.verdict = 'FAIL'; process.exitCode = 1; }
  }
  if (browser) await browser.close();
  if (server.exitCode === null) { const ended = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await ended; }
  fs.closeSync(log); report.finishedAt = new Date().toISOString(); report.serverExitCode = server.exitCode; report.serverSignal = server.signalCode;
  fs.writeFileSync(path.join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({verdict: report.verdict, actions: report.actions.length, video: report.video, durationS: report.videoMetadata?.format.duration, errors: report.errors, evidenceDir}, null, 2));
}
