#!/usr/bin/env node
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripVTControlCharacters} from 'node:util';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';

for (const command of ['ffmpeg', 'ffprobe']) {
  const result = spawnSync(command, ['-version'], {encoding: 'utf8'});
  if (result.error || result.status !== 0) {
    console.error(`Recording requires ${command} on PATH. Install FFmpeg and ensure both ffmpeg and ffprobe are available before running this helper.`);
    process.exit(1);
  }
}

const evidenceDir = path.resolve(process.env.TAUP_EVIDENCE || '.audit/wavefronts/walkthrough');
const port = Number(process.env.TAUP_PORT || 5196);
const url = `http://127.0.0.1:${port}/`;
fs.mkdirSync(evidenceDir, {recursive: true});
if (fs.existsSync(path.join(evidenceDir, 'report.json'))) {
  const prior = path.join(evidenceDir, 'attempts', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(prior, {recursive: true});
  for (const entry of fs.readdirSync(evidenceDir)) if (entry !== 'attempts') fs.renameSync(path.join(evidenceDir, entry), path.join(prior, entry));
}
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const canonicalTime = time => String(Math.round(time * 10) / 10);
const files = ['index.html', 'package.json', 'package-lock.json', 'scripts/record-wavefronts.mjs', 'crates/taup-core/src/lib.rs', 'fixtures/iasp91.json', 'fixtures/investigation/tohoku-investigation.json'];
function addFiles(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) addFiles(file);
    else files.push(file);
  }
}
addFiles('web'); addFiles('dist'); addFiles('fixtures/earth');
const report = {startedAt: new Date().toISOString(), url, viewport: {width: 1440, height: 1400}, method: 'Continuous recording of public controls in the production build. Real modeled front buffers, ray packets, station arrival cues, original instrumental recording and shared state belong to the running application. No state setters, injected UI, synthetic waveform or postproduction UI replacement. H.264 encode without audio. A tall desktop viewport keeps Earth and selected recording visible together.', sourceHashes: Object.fromEntries([...new Set(files)].sort().map(file => [file, hash(file)])), actions: [], errors: []};
const log = fs.openSync(path.join(evidenceDir, 'server.log'), 'w');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {stdio: ['ignore', log, log]});
let browser, context, page, video, began;
const pause = ms => page.waitForTimeout(ms);
async function showInvestigation() {
  return page.evaluate(() => {
    const heading = document.querySelector('.scene-heading').getBoundingClientRect();
    const wave = document.getElementById('waveform').getBoundingClientRect();
    const top = Math.max(heading.top + scrollY - 15, wave.bottom + scrollY + 25 - innerHeight);
    scrollTo({top: Math.max(0, top), behavior: 'instant'});
    const canvas = document.getElementById('earth-globe').getBoundingClientRect();
    const recording = document.getElementById('waveform').getBoundingClientRect();
    return {canvas: {x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height}, recording: {x: recording.x, y: recording.y, width: recording.width, height: recording.height}, viewport: {width: innerWidth, height: innerHeight}};
  });
}
async function ready() {
  await page.waitForFunction(() => window.workbench?.ready || window.workbench?.error, undefined, {timeout: 90000});
  assert.equal(await page.evaluate(() => window.workbench.error), null);
  await page.waitForFunction(() => document.getElementById('earth-globe')?.dataset.earthTexture === 'ready', undefined, {timeout: 30000});
}
async function fronts() {
  const {front, cursorS} = await page.evaluate(() => ({front: JSON.parse(document.getElementById('earth-globe').dataset.wavefronts), cursorS: Number(document.getElementById('wave-cursor').dataset.timeS)}));
  assert.equal(front.visible, true);
  assert.ok(front.rayCount > 0 && front.byteLength > 0);
  assert.ok(Math.abs(cursorS - front.catalogTimeS) < 1e-7);
  return front;
}
async function note(action, requiredPhases = []) {
  const result = await page.evaluate(() => {
    const state = window.workbench.state;
    return {event: state.investigation.key, identity: state.investigation.identity, experiment: state.experiment, playing: state.playing, source: state.snapshot?.source, receiver: state.snapshot?.receiver, originOffsetS: state.snapshot?.originOffsetS, arrivals: state.snapshot?.arrivals.map(arrival => ({phase: arrival.phase, timeS: arrival.time_s, turningDepthKm: arrival.turning_depth_km, pathSamples: arrival.path.length})), fit: state.fit ? {best: state.fit.best, rmsS: state.fit.rmsS, directCheck: state.fit.directCheck, iterations: state.fit.iterations} : null, residuals: state.snapshot?.residuals, recordingTitle: document.getElementById('recording-title').textContent, catalogComparison: document.getElementById('catalog-comparison').textContent, front: JSON.parse(document.getElementById('earth-globe').dataset.wavefronts), cursorS: Number(document.getElementById('wave-cursor').dataset.timeS), cutNormals: document.getElementById('earth-globe').dataset.cutNormals, camera: ['cameraAzimuth', 'cameraElevation', 'cameraDistance'].map(key => document.getElementById('earth-globe').dataset[key])};
  });
  assert.equal(result.front.visible, true);
  assert.ok(Math.abs(result.front.catalogTimeS - result.cursorS) < 1e-7);
  for (const phase of requiredPhases) {
    const geometry = result.front.phases.find(item => item.phase === phase);
    assert.ok(geometry?.triangleCount > 0 && (!result.experiment.cutaway || geometry.contourSegmentCount > 0) && geometry.samples.length > 0, `${phase} must contain actual drawn surfaces, cutaway contours and GPU samples.`);
  }
  report.actions.push({atS: (Date.now() - began) / 1000, action, ...result});
  console.log(`${report.actions.at(-1).atS.toFixed(1)} s ${action}`);
}
async function play(startS, durationMs, speed = '30') {
  await page.getByLabel('Replay time in seconds after catalog origin').fill(canonicalTime(startS));
  await page.getByLabel('Playback speed', {exact: true}).selectOption(speed);
  await page.getByRole('button', {name: 'Play earthquake replay', exact: true}).click();
  const before = await fronts();
  await showInvestigation(); await pause(durationMs);
  await page.getByRole('button', {name: 'Pause earthquake replay', exact: true}).click(); await showInvestigation();
  const after = await fronts();
  assert.ok(after.catalogTimeS > before.catalogTimeS + durationMs / 1000, 'Actual front clock must advance during playback.');
  assert.equal(after.fanRevision, before.fanRevision); assert.equal(after.preparationCount, before.preparationCount);
  return {before, after};
}
async function orbit() {
  const canvas = page.locator('#earth-globe');
  const before = await canvas.evaluate(element => ({...element.dataset}));
  const bounds = await canvas.boundingBox(); const start = {x: bounds.x + bounds.width * .57, y: bounds.y + bounds.height * .52};
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  for (let step = 1; step <= 25; step++) { await page.mouse.move(start.x + step * 4, start.y - step * 1.2); await pause(55); }
  await page.mouse.up(); await pause(650);
  const after = await canvas.evaluate(element => ({...element.dataset}));
  assert.notEqual(after.cameraAzimuth, before.cameraAzimuth); assert.equal(after.cutNormals, before.cutNormals);
  assert.equal(JSON.parse(after.wavefronts).fanRevision, JSON.parse(before.wavefronts).fanRevision);
  return {before, after};
}
try {
  for (let attempt = 0; ; attempt++) {
    assert.equal(server.exitCode, null, 'Owned preview exited. Inspect server.log for a port conflict.');
    try { if (stripVTControlCharacters(fs.readFileSync(path.join(evidenceDir, 'server.log'), 'utf8')).includes(url) && (await fetch(url)).ok) break; } catch {}
    assert.ok(attempt < 80); await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({channel: 'chrome', headless: true}); report.chrome = browser.version();
  context = await browser.newContext({viewport: report.viewport, deviceScaleFactor: 1, recordVideo: {dir: path.join(evidenceDir, 'raw'), size: report.viewport}});
  await context.addInitScript(() => { window.__wavefrontWindowErrors = []; window.addEventListener('error', event => window.__wavefrontWindowErrors.push({message: event.message, filename: event.filename, line: event.lineno, column: event.colno})); });
  page = await context.newPage(); video = page.video(); began = Date.now();
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(url); await ready();
  await page.screenshot({path: path.join(evidenceDir, 'desktop.png')});
  if (await page.locator('#wavefronts').getAttribute('aria-pressed') !== 'true') { await page.locator('#wavefronts').click(); await ready(); }
  if (await page.locator('#cutaway').getAttribute('aria-pressed') === 'true') await page.locator('#cutaway').click();
  await page.getByLabel('Recording station', {exact: true}).selectOption('IU.TATO.00.BHZ'); await ready();
  await page.getByLabel('Seismic phase', {exact: true}).selectOption('P');
  report.initialPlayback = await play(0, 4700, '30');
  await page.screenshot({path: path.join(evidenceDir, 'surface-fronts.png')});
  await note('Watch the modeled P and S fronts leave the real Tohoku source on the recording clock.', ['P', 'S']);

  await page.locator('#cutaway').click();
  await page.getByRole('button', {name: 'Focus selected ray section', exact: true}).click();
  report.mantlePlayback = await play(180, 4200, '30');
  await page.screenshot({path: path.join(evidenceDir, 'mantle-fronts.png')});
  await note('Open Earth to see the faster P and slower S time surfaces and their bright cut-plane contours.', ['P', 'S']);
  report.orbit = await orbit(); await showInvestigation();
  await page.screenshot({path: path.join(evidenceDir, 'rotated-fronts.png')});
  await note('Rotate the cutaway while the modeled fronts and section contours stay in Earth coordinates.', ['P', 'S']);

  const arrivalButton = page.locator('[data-station-arrival][data-station-id="IU.TATO.00.BHZ"][data-phase="P"]').first();
  const arrivalS = Number(await arrivalButton.getAttribute('data-time-s'));
  await arrivalButton.click(); await ready();
  assert.equal(await page.getByLabel('Recording station', {exact: true}).inputValue(), 'IU.TATO.00.BHZ');
  const arrivalFront = await fronts(); assert.ok(Math.abs(arrivalFront.catalogTimeS - arrivalS) < 1e-7);
  const arrivalCue = arrivalFront.stationCues.find(cue => cue.stationId === 'IU.TATO.00.BHZ' && cue.phase === 'P');
  assert.equal(arrivalCue.reached, true); assert.equal(arrivalCue.pulse, 1);
  assert.equal(await arrivalButton.getAttribute('data-reached'), 'true');
  assert.ok((await page.locator('#recording-title').textContent()).includes('TATO'));
  const markerTimes = await page.locator('#waveform [data-kind="prediction"][data-phase="P"]').evaluateAll(markers => markers.map(marker => Number(marker.dataset.timeS)));
  assert.ok(markerTimes.some(time => Math.abs(time - arrivalS) < 1e-7));
  if (await page.locator('#wave-window').getAttribute('aria-pressed') !== 'true') await page.locator('#wave-window').click();
  await showInvestigation(); await pause(900);
  await page.screenshot({path: path.join(evidenceDir, 'station-arrival.png')});
  await note('Jump to the exact TATO P prediction. Its cue, model marker and original recording share one time.');
  report.stationPlayback = await play(arrivalS - 8, 2600, '10');
  await page.screenshot({path: path.join(evidenceDir, 'reached-station.png')});
  await note('Replay the modeled arrival at the real station while retaining the independent archived pick and instrumental trace.');

  await page.getByLabel('Replay time in seconds after catalog origin').fill('180'); await showInvestigation(); await pause(1100);
  const rewoundFront = await fronts();
  assert.equal(rewoundFront.stationCues.find(cue => cue.stationId === 'IU.TATO.00.BHZ' && cue.phase === 'P').reached, false);
  assert.equal(await arrivalButton.getAttribute('data-reached'), 'false');
  await page.screenshot({path: path.join(evidenceDir, 'rewound-fronts.png')});
  await note('Rewind. Reached-station state and front positions return to the earlier time.', ['P', 'S']);

  await page.locator('button[data-mode="explore"]').click(); await ready();
  await page.getByRole('button', {name: 'Trace the inner core', exact: false}).click(); await ready();
  await page.locator('[data-interior="globe"]').click();
  const core = await page.evaluate(() => {
    const state = window.workbench.state;
    const selected = state.snapshot.arrivals.filter(arrival => arrival.phase === 'PKIKP')[state.experiment.branch];
    const points = selected?.path.filter(point => point.depth_km > 5154);
    return {timeS: points?.[0]?.time_s, points: points?.length, pathSamples: selected?.path.length};
  });
  assert.ok(core.points > 2 && core.pathSamples > 100);
  report.corePlayback = await play(core.timeS + 5, 5000, '10');
  const coreFront = await fronts();
  assert.ok(coreFront.phases.find(phase => phase.phase === 'PKIKP')?.samples.some(sample => sample.depthKm > 5153.9));
  await page.screenshot({path: path.join(evidenceDir, 'poster.png')});
  await page.screenshot({path: path.join(evidenceDir, 'inner-core-front.png')});
  await note('Follow supported PKIKP time surfaces into the solid inner core. This is ray theory, not a complete wavefield.', ['PKIKP']);

  await page.getByRole('button', {name: 'Share experiment', exact: false}).click();
  await page.waitForFunction(() => document.getElementById('share-url')?.value === location.href && location.hash.includes('#lab=2'));
  report.sharedUrl = await page.getByLabel('Reproducible experiment URL').inputValue();
  const expected = await page.evaluate(() => window.workbench.state.experiment);
  for (const error of await page.evaluate(() => window.__wavefrontWindowErrors)) report.errors.push(`window error before reload ${JSON.stringify(error)}`);
  await page.reload({waitUntil: 'commit'}); await ready(); await showInvestigation(); await pause(1000);
  const restored = await page.evaluate(() => window.workbench.state);
  assert.deepEqual(restored.experiment, expected); assert.equal(restored.playing, false);
  assert.equal(await page.locator('#wavefronts').getAttribute('aria-pressed'), 'true');
  await page.screenshot({path: path.join(evidenceDir, 'shared-fronts.png')});
  await note('Reload the experiment link. The same enabled fronts, phase, cutaway, camera and paused recording clock return.', ['PKIKP']);
  report.finalFraming = await showInvestigation();
  assert.ok(report.finalFraming.canvas.y >= -10 && report.finalFraming.recording.y + report.finalFraming.recording.height <= report.viewport.height, 'The Earth and original waveform must appear together.');

  await page.getByLabel('Earthquake investigation', {exact: true}).selectOption('maule-2010'); await ready();
  assert.equal(await page.evaluate(() => window.workbench.state.investigation.key), 'maule-2010');
  assert.equal(await page.evaluate(() => window.workbench.state.snapshot.source.depthKm), 22.9);
  await page.locator('.mission').scrollIntoViewIfNeeded(); await pause(1200);
  await page.screenshot({path: path.join(evidenceDir, 'maule-context.png')});
  report.maulePlayback = await play(180, 2200, '30');
  await note('Compare Maule 2010. Its own catalog source and real station recordings replace Tohoku.');

  await page.getByLabel('Earthquake investigation', {exact: true}).selectOption('okhotsk-2013'); await ready();
  assert.equal(await page.evaluate(() => window.workbench.state.snapshot.source.depthKm), 598.1);
  await page.locator('.mission').scrollIntoViewIfNeeded(); await pause(1200);
  await page.screenshot({path: path.join(evidenceDir, 'deep-event-context.png')});
  await page.locator('button[data-mode="explore"]').click(); await ready();
  await page.getByRole('button', {name: 'Trace the inner core', exact: false}).click(); await ready();
  const deepCoreTime = await page.evaluate(() => window.workbench.state.snapshot.arrivals.find(arrival => arrival.phase === 'PKIKP').path.find(point => point.depth_km > 5154).time_s);
  report.deepPlayback = await play(deepCoreTime + 5, 2400, '10');
  await page.screenshot({path: path.join(evidenceDir, 'deep-event-globe.png')});
  await note('Explore Okhotsk 2013 from 598.1 km deep, using that event’s exact PKIKP path and independently retained recording.', ['PKIKP']);

  await page.getByLabel('Earthquake investigation', {exact: true}).selectOption('tohoku-2011'); await ready();
  await page.locator('button[data-mode="locate"]').click(); await ready();
  const initialCandidate = await page.evaluate(() => window.workbench.state.snapshot.residuals);
  assert.equal(initialCandidate.stations.length, 8);
  await page.locator('#locate-controls').scrollIntoViewIfNeeded(); await pause(1400);
  await page.screenshot({path: path.join(evidenceDir, 'source-candidate.png')});
  await note('Place a Tohoku source candidate against eight independently archived P picks at fixed depth.');
  await page.getByRole('button', {name: 'Fit source', exact: true}).click(); await ready();
  const fitted = await page.evaluate(() => window.workbench.state);
  assert.equal(fitted.fit.directCheck.exactConfirmed, true);
  assert.ok(Math.abs(fitted.fit.rmsS - 0.4756682224678171) < 0.01);
  assert.ok(fitted.fit.directCheck.maxStationTimeErrorS <= 0.05);
  assert.ok(initialCandidate.stations.every(station => Number.isFinite(station.observedOffsetS)));
  assert.deepEqual(fitted.snapshot.residuals.stations.map(station => station.observedOffsetS), initialCandidate.stations.map(station => station.observedOffsetS));
  const fittedCandidate = fitted.experiment.context.candidate;
  await page.getByRole('button', {name: 'Reveal catalog', exact: true}).click(); await ready();
  assert.deepEqual(await page.evaluate(() => window.workbench.state.experiment.context.candidate), fittedCandidate);
  assert.ok((await page.locator('#catalog-comparison').textContent()).includes('41.9 km'));
  await page.locator('#fit-evidence').scrollIntoViewIfNeeded(); await pause(3000);
  await page.screenshot({path: path.join(evidenceDir, 'source-fit.png')});
  await note('Fit the real observations, verify exact rays, then retain the 41.9 km catalog mismatch despite a 0.476 s RMS.');
  for (const [file, digest] of Object.entries(report.sourceHashes)) assert.equal(hash(file), digest, `Source changed while recording ${file}`);
  for (const error of await page.evaluate(() => window.__wavefrontWindowErrors)) report.errors.push(`window error after reload ${JSON.stringify(error)}`);
  assert.deepEqual(report.errors, []); report.verdict = 'PASS';
} catch (error) { report.errors.push(error.stack || String(error)); report.verdict = 'FAIL'; process.exitCode = 1; }
finally {
  if (context) await context.close();
  if (video) {
    const rawPath = path.join(evidenceDir, 'walkthrough.webm'); await video.saveAs(rawPath); report.rawVideo = rawPath;
    const mp4 = path.join(evidenceDir, 'walkthrough.mp4');
    const encoded = spawnSync('ffmpeg', ['-y', '-i', rawPath, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], {encoding: 'utf8'});
    fs.writeFileSync(path.join(evidenceDir, 'encoding.log'), encoded.stderr);
    if (encoded.status === 0) {
      report.video = mp4; report.videoBytes = fs.statSync(mp4).size; report.videoSha256 = hash(mp4);
      const probe = spawnSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', mp4], {encoding: 'utf8'}); report.videoMetadata = JSON.parse(probe.stdout);
      const contact = path.join(evidenceDir, 'contact-sheet.jpg');
      const duration = Number(report.videoMetadata.format.duration);
      const sheet = spawnSync('ffmpeg', ['-y', '-i', mp4, '-vf', `fps=6/${duration},scale=480:-1,tile=3x2`, '-frames:v', '1', '-update', '1', contact], {encoding: 'utf8'});
      fs.writeFileSync(path.join(evidenceDir, 'contact-sheet.log'), sheet.stderr);
      if (sheet.status === 0 && fs.existsSync(contact)) report.contactSheet = {path: contact, sha256: hash(contact)};
      else { report.errors.push('Contact sheet extraction failed.'); report.verdict = 'FAIL'; process.exitCode = 1; }
    } else { report.errors.push('Video encoding failed. Inspect encoding.log.'); report.verdict = 'FAIL'; process.exitCode = 1; }
  }
  if (browser) await browser.close();
  if (server.exitCode === null) { const ended = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await ended; }
  fs.closeSync(log); report.finishedAt = new Date().toISOString(); report.serverExitCode = server.exitCode; report.serverSignal = server.signalCode;
  fs.writeFileSync(path.join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({verdict: report.verdict, actions: report.actions.length, video: report.video, durationS: report.videoMetadata?.format.duration, errors: report.errors, evidenceDir}, null, 2));
}
