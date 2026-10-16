#!/usr/bin/env node
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripVTControlCharacters} from 'node:util';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';

const evidenceDir = path.resolve(process.env.TAUP_EVIDENCE || '.audit/globe/walkthrough');
const port = Number(process.env.TAUP_PORT || 5195);
const url = `http://127.0.0.1:${port}/`;
fs.mkdirSync(evidenceDir, {recursive: true});
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files = ['index.html', 'package.json', 'package-lock.json', 'scripts/record-globe.mjs', 'crates/taup-core/src/lib.rs', 'fixtures/iasp91.json', 'fixtures/investigation/tohoku-investigation.json', 'fixtures/events/okhotsk-2013/case.json'];
function addFiles(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) addFiles(file);
    else files.push(file);
  }
}
addFiles('web'); addFiles('dist'); addFiles('fixtures/earth');
const report = {startedAt: new Date().toISOString(), url, viewport: {width: 1440, height: 1080}, method: 'Continuous recording of public controls in the production build. The textured Earth, actual ray paths, deep source and shared state are the running application. No state setters or postproduction UI replacement. H.264 encode without audio.', sourceHashes: Object.fromEntries([...new Set(files)].sort().map(file => [file, hash(file)])), actions: [], errors: []};
const log = fs.openSync(path.join(evidenceDir, 'server.log'), 'w');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {stdio: ['ignore', log, log]});
let browser, context, page, video, began;
const pause = ms => page.waitForTimeout(ms);
const showScene = () => page.locator('.scene-heading').evaluate(element => element.scrollIntoView({block: 'start', behavior: 'instant'}));
async function ready(event) {
  await page.waitForFunction(key => (window.workbench?.ready || window.workbench?.error) && (!key || window.workbench.state.investigation.key === key), event, {timeout: 60000});
  assert.equal(await page.evaluate(() => window.workbench.error), null);
  await page.waitForFunction(() => document.getElementById('earth-globe')?.dataset.earthTexture === 'ready', undefined, {timeout: 30000});
}
async function note(action) {
  const result = await page.evaluate(() => {
    const state = window.workbench.state;
    return {event: state.investigation.key, identity: state.investigation.identity, experiment: state.experiment, playing: state.playing, source: state.snapshot?.source, receiver: state.snapshot?.receiver, distanceDeg: state.snapshot?.distanceDeg, arrivals: state.snapshot?.arrivals.map(arrival => ({phase: arrival.phase, timeS: arrival.time_s, turningDepthKm: arrival.turning_depth_km, pathSamples: arrival.path.length})), networkRays: state.snapshot?.networkRays.length, render: {...document.getElementById('earth-globe').dataset}};
  });
  report.actions.push({atS: (Date.now() - began) / 1000, action, ...result});
  console.log(`${report.actions.at(-1).atS.toFixed(1)} s ${action}`);
}
async function play(startS, durationMs, speed = '30') {
  await page.getByLabel('Replay time in seconds after catalog origin').fill(String(Math.round(startS * 10) / 10));
  await page.getByLabel('Playback speed', {exact: true}).selectOption(speed);
  await page.getByRole('button', {name: 'Play earthquake replay', exact: true}).click();
  await showScene(); await pause(durationMs);
  const packet = await page.locator('#earth-globe').evaluate(canvas => canvas.dataset.selectedPacket);
  assert.ok(packet, 'An actual selected ray packet must remain visible.');
  assert.equal(JSON.parse(packet).onScreen, true, 'The calculated packet must be inside the camera view.');
  await page.getByRole('button', {name: 'Pause earthquake replay', exact: true}).click(); await showScene();
}
async function orbit() {
  const canvas = page.locator('#earth-globe');
  const before = await canvas.evaluate(element => ({...element.dataset}));
  const bounds = await canvas.boundingBox();
  const start = {x: bounds.x + bounds.width * .57, y: bounds.y + bounds.height * .52};
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  for (let step = 1; step <= 30; step++) {
    await page.mouse.move(start.x + step * 4, start.y - step * 1.3); await pause(55);
  }
  await page.mouse.up(); await pause(1000);
  const after = await canvas.evaluate(element => ({...element.dataset}));
  assert.notEqual(after.cameraAzimuth, before.cameraAzimuth);
  assert.ok(before.cutNormals, 'The actual cut geometry must be recorded.');
  assert.equal(after.cutNormals, before.cutNormals, 'The cut remains fixed while the camera orbits.');
  return {before, after};
}

try {
  for (let attempt = 0; ; attempt++) {
    assert.equal(server.exitCode, null, 'Owned preview exited. Inspect server.log for a port conflict.');
    try {
      if (stripVTControlCharacters(fs.readFileSync(path.join(evidenceDir, 'server.log'), 'utf8')).includes(url) && (await fetch(url)).ok) break;
    } catch {}
    assert.ok(attempt < 80); await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({channel: 'chrome', headless: true}); report.chrome = browser.version();
  context = await browser.newContext({viewport: report.viewport, deviceScaleFactor: 1, recordVideo: {dir: path.join(evidenceDir, 'raw'), size: report.viewport}});
  await context.addInitScript(() => { window.__globeWindowErrors = []; window.addEventListener('error', event => window.__globeWindowErrors.push({message: event.message, filename: event.filename, line: event.lineno, column: event.colno})); });
  page = await context.newPage(); video = page.video(); began = Date.now();
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(url); await ready('tohoku-2011');
  if (await page.locator('#cutaway').getAttribute('aria-pressed') === 'true') await page.locator('#cutaway').click();
  await showScene(); await pause(2600);
  await page.screenshot({path: path.join(evidenceDir, 'surface.png')});
  await note('Inspect the locally served Earth texture and the real Tohoku station network.');

  await page.locator('button[data-mode="explore"]').click(); await ready();
  await page.locator('[data-interior="globe"]').click();
  if (await page.locator('#cutaway').getAttribute('aria-pressed') !== 'true') await page.locator('#cutaway').click();
  await page.getByLabel('Recording station', {exact: true}).selectOption('IU.ANMO.00.BHZ'); await ready();
  await page.getByLabel('Seismic phase', {exact: true}).selectOption('P');
  await page.getByRole('button', {name: 'Focus selected ray section', exact: true}).click();
  await play(190, 4600, '30');
  await page.screenshot({path: path.join(evidenceDir, 'cutaway.png')});
  await note('Open the stable cutaway and follow the actual compressional P packet on the common replay clock.');
  report.orbit = await orbit();
  await page.screenshot({path: path.join(evidenceDir, 'orbit.png')});
  await note('Rotate the camera around the physical cutaway. Its Earth-coordinate opening stays fixed.');

  await page.getByLabel('Seismic phase', {exact: true}).selectOption('S');
  await page.getByRole('button', {name: 'Focus selected ray section', exact: true}).click();
  await play(400, 4000, '30');
  await note('Compare the S packet that stays in the solid mantle.');

  await page.getByRole('button', {name: 'Trace the inner core', exact: false}).click(); await ready();
  await page.locator('[data-interior="globe"]').click();
  const core = await page.evaluate(() => {
    const state = window.workbench.state;
    const selected = state.snapshot.arrivals.filter(arrival => arrival.phase === 'PKIKP')[state.experiment.branch];
    const points = selected?.path.filter(point => point.depth_km > 5154);
    return {timeS: points?.[0]?.time_s, points: points?.length, pathSamples: selected?.path.length};
  });
  assert.ok(core.points > 2 && core.pathSamples > 100);
  await play(core.timeS - 35, 5700, '30');
  await page.getByLabel('Replay time in seconds after catalog origin').fill(String(Math.round((core.timeS + 20) * 10) / 10));
  await showScene(); await pause(700);
  await page.screenshot({path: path.join(evidenceDir, 'poster.png')});
  await page.screenshot({path: path.join(evidenceDir, 'inner-core.png')});
  await note('Trace the calculated PKIKP path through mantle, liquid outer core and solid inner core.');

  await page.getByLabel('Earthquake investigation', {exact: true}).selectOption('okhotsk-2013'); await ready('okhotsk-2013');
  await page.locator('button[data-mode="explore"]').click(); await ready();
  await page.locator('[data-interior="globe"]').click();
  await page.getByLabel('Recording station', {exact: true}).selectOption('IU.ANMO.00.BHZ'); await ready();
  await page.getByLabel('Seismic phase', {exact: true}).selectOption('P');
  await page.getByRole('button', {name: 'Focus selected ray section', exact: true}).click();
  await play(90, 4400, '30');
  const source = await page.evaluate(() => window.workbench.state.snapshot.source);
  assert.equal(source.depthKm, 598.1);
  const drawnSource = await page.locator('#earth-globe').evaluate(canvas => ({kind: canvas.dataset.sourceKind, position: JSON.parse(canvas.dataset.sourcePosition)}));
  assert.equal(drawnSource.kind, 'source');
  assert.ok(Math.abs(Math.hypot(...drawnSource.position) - (1 - 598.1 / 6371)) < 1e-9, 'The displayed source must be at its real subsurface radius.');
  await page.screenshot({path: path.join(evidenceDir, 'deep-source.png')});
  await note('Explore the real 598.1 km deep Okhotsk source and its calculated ray.');

  await page.getByRole('button', {name: 'Share experiment', exact: false}).click();
  await page.waitForFunction(() => document.getElementById('share-url')?.value.includes('#lab=2'));
  report.sharedUrl = await page.getByLabel('Reproducible experiment URL').inputValue();
  assert.ok(report.sharedUrl.includes('#lab=2'));
  const expected = await page.evaluate(() => window.workbench.state.experiment);
  for (const error of await page.evaluate(() => window.__globeWindowErrors)) report.errors.push(`window error before reload ${JSON.stringify(error)}`);
  await page.reload({waitUntil: 'commit'}); await ready('okhotsk-2013');
  await showScene(); await pause(1200);
  const restored = await page.evaluate(() => window.workbench.state);
  assert.deepEqual(restored.experiment, expected); assert.equal(restored.playing, false);
  await page.screenshot({path: path.join(evidenceDir, 'shared.png')});
  await note('Reload the experiment link with the same event, selected ray, camera, cutaway and paused clock.');
  await pause(Math.max(0, 41000 - (Date.now() - began)));
  for (const [file, digest] of Object.entries(report.sourceHashes)) assert.equal(hash(file), digest, `Source changed while recording ${file}`);
  for (const error of await page.evaluate(() => window.__globeWindowErrors)) report.errors.push(`window error after reload ${JSON.stringify(error)}`);
  assert.deepEqual(report.errors, []); report.verdict = 'PASS';
} catch (error) { report.errors.push(error.stack || String(error)); report.verdict = 'FAIL'; process.exitCode = 1; }
finally {
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
