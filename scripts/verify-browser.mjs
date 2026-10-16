#!/usr/bin/env node
import {chromium, expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {verificationTarget} from './verification-target.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';

const evidenceDir = path.resolve(process.env.TAUP_EVIDENCE || '.audit/lab/browser');
fs.mkdirSync(evidenceDir, {recursive: true});
const port = Number(process.env.TAUP_PORT || 4180);
const verification = await verificationTarget(port);
const url = verification.url;
const log = fs.openSync(path.join(evidenceDir, 'server.log'), 'w');
const server = verification.hosted ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {stdio: ['ignore', log, log]});
const report = {startedAt: new Date().toISOString(), url, steps: [], errors: [], hashes: {}};
const fixture = JSON.parse(fs.readFileSync('fixtures/investigation/tohoku-investigation.json'));
for (const file of ['scripts/verification-target.mjs', 'crates/taup-core/src/lib.rs', 'web/main.js', 'web/experiment.js', 'web/compute.js', 'web/compute-worker.js', 'web/location.js', 'web/globe.js', 'web/section.js', 'web/evidence.js', 'web/panels.js', 'web/style.css', 'index.html', 'web/pkg/taup_core_bg.wasm']) report.hashes[file] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let browser, context;
const native = (depth, distance) => {
  const run = spawnSync('target/release/taup', [String(depth), String(distance)], {encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
};
const compareArrivals = (actual, expected) => {
  const order = (a, b) => a.phase.localeCompare(b.phase) || a.ray_param_s_rad - b.ray_param_s_rad;
  const a = actual.toSorted(order), b = expected.toSorted(order);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].phase, b[i].phase);
    assert.ok(Math.abs(a[i].time_s - b[i].time_s) < 1e-7);
    assert.ok(Math.abs(a[i].ray_param_s_rad - b[i].ray_param_s_rad) < 1e-6);
    assert.equal(a[i].path.length, b[i].path.length);
  }
};
const haversine = (a, b) => {
  const r = Math.PI / 180;
  return 2 * Math.asin(Math.min(1, Math.sqrt(Math.sin((a.latitudeDeg - b.latitudeDeg) * r / 2) ** 2 + Math.cos(a.latitudeDeg * r) * Math.cos(b.latitudeDeg * r) * Math.sin((a.longitudeDeg - b.longitudeDeg) * r / 2) ** 2))) / r;
};
const checkResiduals = state => {
  const residuals = state.snapshot.residuals;
  assert.equal(residuals.kind, 'supported');
  const times = residuals.stations.map(item => {
    const station = fixture.stations.find(station => station.id === item.stationId);
    assert.equal(item.observedOffsetS, station.observed_pick.offset_s);
    const distance = haversine(state.snapshot.source, {latitudeDeg: station.latitude_deg, longitudeDeg: station.longitude_deg});
    assert.ok(Math.abs(distance - item.distanceDeg) < 1e-10);
    const predicted = native(29, distance).find(arrival => arrival.phase === 'P').time_s;
    assert.ok(Math.abs(predicted - item.predictedTimeS) < 1e-7);
    return {observed: station.observed_pick.offset_s, predicted, residual: item.residualS};
  });
  const origin = times.reduce((sum, item) => sum + item.observed - item.predicted, 0) / times.length;
  const rms = Math.sqrt(times.reduce((sum, item) => sum + (item.observed - item.predicted - origin) ** 2, 0) / times.length);
  assert.ok(Math.abs(origin - state.snapshot.originOffsetS) < 1e-7);
  assert.ok(Math.abs(rms - residuals.rmsS) < 1e-7);
  for (const item of times) assert.ok(Math.abs(item.observed - item.predicted - origin - item.residual) < 1e-7);
};
const note = (action, state, extra = {}) => report.steps.push({action, experiment: state.experiment, source: state.snapshot?.source, distanceDeg: state.snapshot?.distanceDeg, arrivals: state.snapshot?.arrivals.map(a => ({phase: a.phase, timeS: a.time_s})), ...extra});

report.verificationAccess = verification.evidenceScope;

try {
  if (verification.hosted) await verification.probe();
  else for (let attempt = 0; ; attempt++) {
    assert.equal(server.exitCode, null, 'Our preview exited; inspect server.log for a port conflict.');
    try { const response = await fetch(url); if (response.ok && (await response.text()).includes('Earthquake Lab')) break; } catch {}
    assert.ok(attempt < 80, 'Preview did not become ready.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({channel: 'chrome', headless: true, ignoreDefaultArgs: ['--disable-back-forward-cache']});
  context = await verification.newContext(browser, {viewport: {width: 1440, height: 1080}, acceptDownloads: true});
  await verification.startTrace(context, {screenshots: true, snapshots: true});
  await context.addInitScript(() => { addEventListener('pageshow', event => { window.verificationCacheRestored = event.persisted; }); });
  let page = await context.newPage();
  const watch = page => {
    page.on('pageerror', error => report.errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  };
  watch(page);
  const ready = async (target = page) => {
    await target.waitForFunction(() => window.workbench?.ready || window.workbench?.error, null, {timeout: 60000});
    assert.equal(await target.evaluate(() => window.workbench.error), null);
    return target.evaluate(() => window.workbench.state);
  };
  const wave = target => target.locator('#waveform > path[fill="none"]').getAttribute('d');
  const mode = async kind => { await page.locator(`[data-mode="${kind}"]`).click(); return ready(); };
  const geometry = async (depth, distance) => {
    await page.locator('#depth').fill(String(depth)); await page.locator('#distance').fill(String(distance));
    await page.getByRole('button', {name: 'Calculate geometry', exact: true}).click();
    const state = await ready();
    assert.equal(state.experiment.context.depthKm, depth); assert.equal(state.snapshot.distanceDeg, distance);
    compareArrivals(state.snapshot.arrivals, native(depth, distance));
    return state;
  };
  await page.goto(url);
  let state = await ready();
  assert.equal(state.experiment.context.kind, 'replay'); assert.equal(state.experiment.stationId, 'IU.ANMO.00.BHZ');
  assert.equal(state.snapshot.networkRays.length, 9);
  compareArrivals(state.snapshot.arrivals, native(29, state.snapshot.distanceDeg));
  note('Open real event with nine recordings and exact linked station paths', state);
  await page.screenshot({path: path.join(evidenceDir, 'desktop.png'), fullPage: true});
  const initialWave = await wave(page);
  await page.getByRole('link', {name: 'Skip to earthquake replay', exact: true}).press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'play');
  assert.equal((await ready()).notice, '');
  const completed = state.stats.completed;
  await page.getByRole('button', {name: 'Play earthquake replay', exact: true}).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', {name: 'Pause earthquake replay', exact: true}).click();
  state = await ready(); assert.ok(state.experiment.timeS > 10); assert.equal(state.stats.completed, completed);
  await page.getByLabel('Replay time in seconds after catalog origin').fill('400');
  state = await ready();
  const packet = JSON.parse(await page.locator('#earth-globe').getAttribute('data-selected-packet'));
  const ray = state.snapshot.arrivals.find(arrival => arrival.phase === 'P');
  assert.equal(packet.timeS, 400); assert.equal(ray.path[packet.index].time_s >= 400, true);
  const unit = point => { const lat = point.latitudeDeg * Math.PI / 180, lon = point.longitudeDeg * Math.PI / 180; return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)]; };
  const u = unit(state.snapshot.source), v = unit(state.snapshot.receiver), dot = u.reduce((sum, x, i) => sum + x * v[i], 0);
  const tangent = v.map((x, i) => x - dot * u[i]); const length = Math.hypot(...tangent);
  const position = point => u.map((x, i) => (1 - point.depth_km / 6371) * (x * Math.cos(point.distance_rad) + tangent[i] / length * Math.sin(point.distance_rad)));
  const left = ray.path[packet.index - 1], right = ray.path[packet.index];
  const fraction = (400 - left.time_s) / (right.time_s - left.time_s);
  const a = position(left), b = position(right);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(packet.modelPosition[i] - a[i] - fraction * (b[i] - a[i])) < 1e-10);
  await page.getByLabel('Replay time in seconds after catalog origin').fill('742.5');
  state = await ready(); assert.equal(state.experiment.timeS, 742.5);
  assert.equal(await wave(page), initialWave);
  assert.ok(Math.abs(Number(await page.locator('#earth-globe').getAttribute('data-playback-time-s')) - 742.5) < 1e-6);
  assert.ok(Math.abs(Number(await page.locator('#wave-cursor').getAttribute('data-time-s')) - 742.5) < 1e-6);
  const pick = await page.locator('[data-kind="manual-pick"]').first().getAttribute('data-time-s');
  assert.equal(Number(pick), 742.49);
  note('Play, pause and scrub synchronized actual waveform and ray clock without recalculation', state);
  await page.getByLabel('Recording station', {exact: true}).selectOption('IU.LVC.00.BHZ');
  await ready();
  await page.getByLabel('Recording station', {exact: true}).selectOption('IU.ANMO.00.BHZ');
  state = await ready(); assert.equal(state.experiment.phase, 'P'); assert.ok(state.snapshot.arrivals.some(arrival => arrival.phase === state.experiment.phase));
  await page.getByLabel('Recording station', {exact: true}).selectOption('IU.TATO.00.BHZ');
  state = await ready(); assert.notEqual(await wave(page), initialWave);
  await page.getByRole('button', {name: 'Zoom to arrival', exact: true}).click();
  const zoomed = await wave(page);
  await page.getByRole('button', {name: 'Show full recording', exact: true}).click(); assert.notEqual(await wave(page), zoomed);
  note('Switch and zoom an independently sourced recording', state);

  state = await mode('locate');
  assert.equal(state.snapshot.residuals.stations.length, 8); checkResiduals(state);
  const beforeCandidateWave = await wave(page);
  await page.locator('#latitude').fill('41.125'); await page.locator('#longitude').fill('146.875');
  await page.getByRole('button', {name: 'Calculate candidate', exact: true}).click();
  state = await ready(); checkResiduals(state); assert.equal(await wave(page), beforeCandidateWave);
  note('Calculate noncatalog source and reconstruct every residual with the native solver and archived picks', state);
  await page.getByRole('button', {name: 'Fit source', exact: true}).click();
  const cancelButton = page.getByRole('button', {name: 'Cancel', exact: true});
  await expect(cancelButton).toBeVisible();
  await expect(cancelButton).toBeEnabled();
  await cancelButton.evaluate(button => {
    button.addEventListener('click', event => {
      const {pending, fit, experiment, stats} = window.workbench.state;
      button.verificationActivation = {trusted: event.isTrusted, pending, fit, candidate: experiment.context.candidate, stats};
    }, {capture: true, once: true});
  });
  await cancelButton.press('Enter');
  const cancelActivation = await page.locator('#cancel').evaluate(button => {
    const activation = button.verificationActivation;
    delete button.verificationActivation;
    return activation;
  });
  assert.equal(cancelActivation.trusted, true);
  assert.equal(cancelActivation.pending, true);
  assert.equal(cancelActivation.fit, null);
  assert.ok(cancelActivation.stats.pending > 0);
  assert.deepEqual(cancelActivation.candidate, state.experiment.context.candidate);
  await expect(page.locator('#error-text')).toContainText('cancelled');
  const cancelledState = await page.evaluate(() => window.workbench.state);
  assert.equal(cancelledState.stats.cancelled, cancelActivation.stats.cancelled + 1);
  assert.equal(cancelledState.stats.pending, 0);
  assert.equal(cancelledState.stats.completed, cancelActivation.stats.completed);
  assert.equal(cancelledState.fit, null); assert.equal(cancelledState.snapshot, null);
  await page.getByRole('button', {name: 'Retry calculation', exact: true}).click(); state = await ready();
  assert.equal(state.stats.cancelled, cancelledState.stats.cancelled); assert.equal(state.fit, null);
  assert.deepEqual(state.experiment.context.candidate, cancelActivation.candidate);
  checkResiduals(state);
  note('Cancel actual worker preparation and recover through Retry', state, {cancelActivation, cancelledStats: cancelledState.stats});
  await page.getByRole('button', {name: 'Fit source', exact: true}).click();
  state = await ready(); assert.ok(state.fit?.directCheck.exactConfirmed); checkResiduals(state);
  assert.ok(Math.abs(state.fit.best.latitudeDeg - 37.92666413347411) < 0.01);
  assert.ok(Math.abs(state.fit.best.longitudeDeg - 142.45957475680265) < 0.01);
  assert.ok(Math.abs(state.fit.rmsS - 0.4756682224678171) < 0.01);
  assert.ok(state.fit.directCheck.maxStationTimeErrorS <= 0.05);
  const candidate = structuredClone(state.experiment.context.candidate);
  await page.getByRole('button', {name: 'Reveal catalog', exact: true}).click(); state = await ready();
  assert.deepEqual(state.experiment.context.candidate, candidate);
  await expect(page.locator('#catalog-comparison')).toContainText('41.9 km');
  note('Fit actual observations, confirm independently and preserve catalog mismatch on reveal', state, {fit: state.fit});
  await page.screenshot({path: path.join(evidenceDir, 'location.png'), fullPage: true});
  await page.locator('#evidence-details > summary').click();
  for (const code of ['TATO', 'GUMO', 'CTAO', 'KEV', 'KONO', 'ANMO']) {
    await page.getByLabel(`Use ${code} observation`, {exact: true}).uncheck(); await ready();
  }
  state = await ready(); assert.equal(state.snapshot.residuals.stations.length, 2);
  await expect(page.getByRole('button', {name: 'Fit source', exact: true})).toBeDisabled();
  await expect(page.locator('#ambiguity')).toContainText('ambiguous');
  note('Use two observations and expose ambiguity instead of accepting a unique fit', state);
  for (const code of ['TATO', 'GUMO']) { await page.getByLabel(`Use ${code} observation`, {exact: true}).check(); await ready(); }
  await page.getByRole('button', {name: 'Fit source', exact: true}).click(); state = await ready();
  assert.equal(state.snapshot.residuals.stations.length, 4); checkResiduals(state);
  assert.ok(state.fit.directCheck.exactConfirmed);
  note('Refit a changed four-station set and directly verify every retained observation', state);

  state = await mode('explore');
  await page.getByRole('button', {name: 'Trace the inner core', exact: false}).click(); state = await ready();
  assert.equal(state.experiment.stationId, 'IU.LVC.00.BHZ'); assert.equal(state.experiment.phase, 'PKIKP'); assert.equal(state.experiment.cutaway, true);
  assert.equal(state.snapshot.arrivals.length, 1); assert.equal(state.snapshot.arrivals[0].phase, 'PKIKP');
  assert.ok(state.snapshot.arrivals[0].turning_depth_km > 5153.9);
  await page.screenshot({path: path.join(evidenceDir, 'inner-core.png'), fullPage: true});
  await page.locator('#advanced > summary').click();
  const lvcWave = await wave(page);
  state = await geometry(137.25, 76.43); assert.equal(await wave(page), lvcWave);
  await page.getByLabel('Seismic phase', {exact: true}).selectOption('S'); state = await ready(); assert.equal(state.experiment.phase, 'S');
  await expect(page.locator('#scenario-note')).toContainText('Hypothetical');
  note('Explore nonfixture depth/distance with a virtual receiver and a fixed actual recording', state);
  for (const format of ['JSON', 'CSV']) {
    const download = page.waitForEvent('download'); await page.getByRole('button', {name: `Download ${format}`, exact: false}).click();
    const result = await download; const file = path.join(evidenceDir, `scenario.${format.toLowerCase()}`); await result.saveAs(file);
    const content = fs.readFileSync(file, 'utf8');
    if (format === 'JSON') {
      const payload = JSON.parse(content); assert.equal(payload.geometry.source_depth_km, 137.25); assert.equal(payload.geometry.distance_deg, 76.43);
      assert.deepEqual(payload.arrivals, state.snapshot.arrivals); assert.equal(payload.recording.id, 'IU.LVC.00.BHZ'); assert.ok(payload.scientific_identity.includes('case:'));
    } else { assert.equal(content.trim().split('\n').length, state.snapshot.arrivals.length + 1); assert.ok(content.includes('ray_param_s_rad')); assert.ok(content.includes('137.25')); }
    note(`Download and inspect ${format} evidence`, state);
  }
  state = await geometry(0, 20); assert.ok(state.snapshot.arrivals.filter(a => a.phase === 'P').length > 1);
  state = await geometry(0, 14.277354176720932); assert.equal(state.snapshot.arrivals.filter(a => a.phase === 'P').length, 5);
  assert.equal(state.snapshot.arrivals.filter(a => a.phase === 'P' && a.ray_param_s_rad > 767 && a.ray_param_s_rad < 768).length, 2);
  state = await geometry(100, 5); assert.equal(state.snapshot.arrivals.length, 0);
  await expect(page.locator('#path-summary')).toContainText('No supported');
  const emptyDownload = page.waitForEvent('download'); await page.getByRole('button', {name: 'Download CSV', exact: false}).click();
  await (await emptyDownload).saveAs(path.join(evidenceDir, 'empty-scenario.csv'));
  const emptyCsv = fs.readFileSync(path.join(evidenceDir, 'empty-scenario.csv'), 'utf8'); assert.equal(emptyCsv.trim().split('\n').length, 2); assert.ok(emptyCsv.includes('100')); assert.ok(emptyCsv.includes('IU.LVC.00.BHZ'));
  note('Preserve multiple, caustic and absent arrival behavior, including empty CSV geometry', state);
  await page.locator('#depth').fill('701'); await page.getByRole('button', {name: 'Calculate geometry', exact: true}).click();
  assert.equal(await page.locator('#depth').evaluate(input => input.validity.valid), false); await expect(page.locator('#export-json')).toBeDisabled(); await expect(page.locator('#export-csv')).toBeDisabled(); assert.equal((await ready()).snapshot.source.depthKm, 100);
  await page.locator('#depth').fill('100');
  await context.setOffline(true);
  const requests = []; page.on('request', request => requests.push(request.url()));
  state = await geometry(411.125, 131.375); assert.ok(state.snapshot.arrivals.length); assert.deepEqual(requests, []);
  await context.setOffline(false); note('Reject invalid geometry and recompute unseen geometry offline', state);

  await page.getByRole('button', {name: '3D globe', exact: true}).click();
  const canvas = page.locator('#earth-globe'); await canvas.scrollIntoViewIfNeeded(); const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 65, box.y + box.height / 2 + 25, {steps: 8}); await page.mouse.up();
  state = await ready(); assert.notEqual(state.experiment.camera.azimuthDeg, 142);
  await page.getByLabel('Replay time in seconds after catalog origin').fill('913.7');
  await page.getByLabel('Playback speed', {exact: true}).selectOption('30');
  await page.getByRole('button', {name: 'Share experiment', exact: false}).click(); state = await ready();
  const sharedUrl = await page.getByLabel('Reproducible experiment URL').inputValue(); assert.ok(sharedUrl.includes('#lab=2'));
  const shared = await context.newPage(); watch(shared); await shared.goto(sharedUrl); const restored = await ready(shared);
  assert.deepEqual(restored.experiment, state.experiment); assert.equal(restored.playing, false);
  compareArrivals(restored.snapshot.arrivals, state.snapshot.arrivals);
  for (const [key, value] of [['data-camera-azimuth', state.experiment.camera.azimuthDeg], ['data-camera-elevation', state.experiment.camera.elevationDeg], ['data-camera-distance', state.experiment.camera.distance]]) assert.ok(Math.abs(Number(await shared.locator('#earth-globe').getAttribute(key)) - value) < 1e-6);
  await shared.screenshot({path: path.join(evidenceDir, 'shared-experiment.png'), fullPage: true}); await shared.close();
  note('Reopen complete experiment with its actual camera pose and paused clock', state, {sharedUrl});
  await page.goto(url + '#'); await ready();
  await page.goto(sharedUrl); const hashRestored = await ready();
  assert.deepEqual(hashRestored.experiment, state.experiment);
  assert.ok(Math.abs(Number(await page.locator('#earth-globe').getAttribute('data-camera-azimuth')) - state.experiment.camera.azimuthDeg) < 1e-6);
  await page.goto('about:blank'); await page.goBack({waitUntil: 'commit'});
  const cached = await ready();
  assert.equal(await page.evaluate(() => window.verificationCacheRestored), true, 'Exercise the real back-forward cache.');
  assert.equal(cached.stats.ready, true); assert.equal(await page.locator('#earth-globe').getAttribute('data-globe-status'), 'ready');
  compareArrivals(await page.evaluate(() => window.workbench.query(29, 82)), native(29, 82));
  await page.getByLabel('Recording station', {exact: true}).selectOption('IU.ANMO.00.BHZ'); await ready();
  note('Restore a same-document camera link and resume actual worker/globe after browser Back', cached);
  for (const invalid of ['#lab=1&mode=locate', `${new URL(sharedUrl).hash}&time=12`, new URL(sharedUrl).hash.replace(/identity=[^&]+/, 'identity=changed'), `#lab=${'x'.repeat(4100)}`]) {
    await page.goto(url + invalid, {waitUntil: 'commit'}); state = await ready(); assert.equal(state.experiment.context.kind, 'replay'); await expect(page.locator('#notice')).toContainText('complete link was reset');
  }
  note('Atomically reset malformed, duplicate, wrong-identity and oversized links', state);
  await verification.stopTrace(context, {path: path.join(evidenceDir, 'desktop-trace.zip')});
  await context.close();
  context = await verification.newContext(browser, {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 2, acceptDownloads: true});
  await verification.startTrace(context, {screenshots: true, snapshots: true});
  page = await context.newPage(); watch(page);
  await page.goto(url); await ready();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const playBox = await page.locator('#play').boundingBox(); assert.ok(playBox.y + playBox.height <= 844, 'Mobile primary action must fit the initial viewport.');
  await page.getByRole('button', {name: 'Play earthquake replay', exact: true}).click(); await page.waitForTimeout(350); await page.getByRole('button', {name: 'Pause earthquake replay', exact: true}).click();
  await page.screenshot({path: path.join(evidenceDir, 'mobile.png'), fullPage: true});
  state = await mode('locate');
  await page.locator('#earth-globe').scrollIntoViewIfNeeded(); const touchBox = await page.locator('#earth-globe').boundingBox();
  await page.touchscreen.tap(touchBox.x + touchBox.width / 2, touchBox.y + touchBox.height / 2); state = await ready();
  assert.ok(Math.abs(state.experiment.context.candidate.latitudeDeg - 28) < 0.1); assert.ok(Math.abs(state.experiment.context.candidate.longitudeDeg - 142) < 0.1);
  await page.locator('#latitude').fill('38.1'); await page.locator('#longitude').fill('142.6'); await page.getByRole('button', {name: 'Calculate candidate', exact: true}).click(); state = await ready(); checkResiduals(state);
  await context.setOffline(true);
  const offlineFitRequests = []; page.on('request', request => offlineFitRequests.push(request.url()));
  await page.getByRole('button', {name: 'Fit source', exact: true}).click(); state = await ready(); assert.ok(state.fit.directCheck.exactConfirmed);
  assert.deepEqual(offlineFitRequests, []); await context.setOffline(false);
  await page.getByRole('button', {name: 'Reveal catalog', exact: true}).click(); await expect(page.locator('#catalog-comparison')).toContainText('41.9 km');
  await page.getByRole('button', {name: 'Share experiment', exact: false}).click(); state = await ready();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  note('Complete the mobile layout location and sharing journey with real controls', state);
  assert.deepEqual(report.errors, []); report.verdict = 'PASS';
} catch (error) {
  report.verdict = 'FAIL'; report.errors.push(error.stack || String(error)); process.exitCode = 1;
} finally {
  if (context) { await verification.stopTrace(context, {path: path.join(evidenceDir, 'trace.zip')}); await context.close(); }
  if (browser) await browser.close();
  if (server?.exitCode === null) { const ended = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await ended; }
  fs.closeSync(log); report.finishedAt = new Date().toISOString(); report.serverExitCode = server?.exitCode ?? null; report.serverSignal = server?.signalCode ?? null;
  fs.writeFileSync(path.join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({verdict: report.verdict, steps: report.steps.length, errors: report.errors, evidenceDir}, null, 2));
}
