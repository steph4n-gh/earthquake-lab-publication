#!/usr/bin/env node
import {chromium, expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripVTControlCharacters} from 'node:util';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';

const evidenceDir = path.resolve(process.env.TAUP_EVIDENCE || '.audit/atlas/browser');
fs.mkdirSync(evidenceDir, {recursive: true});
const port = Number(process.env.TAUP_PORT || 4193);
const url = `http://127.0.0.1:${port}/`;
const report = {startedAt: new Date().toISOString(), url, steps: [], errors: [], windowErrors: [], hashes: {}, nativeQueries: 0};
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const sourceFiles = ['scripts/verify-atlas.mjs', 'package.json', 'package-lock.json', 'fixtures/iasp91.json', 'target/release/taup', 'crates/taup-core/src/lib.rs', ...fs.readdirSync('web').filter(file => /\.(js|css)$/.test(file)).map(file => `web/${file}`), 'index.html', 'web/pkg/taup_core_bg.wasm', 'fixtures/investigation/tohoku-investigation.json', 'fixtures/observed/tohoku-2011.json', 'fixtures/events/maule-2010/case.json', 'fixtures/events/okhotsk-2013/case.json'];
for (const file of sourceFiles) report.hashes[file] = hash(fs.readFileSync(file));
report.assets = Object.fromEntries(fs.readdirSync('dist/assets').map(file => [file, hash(fs.readFileSync(`dist/assets/${file}`))]));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const tohoku = read('fixtures/investigation/tohoku-investigation.json');
const legacy = read('fixtures/observed/tohoku-2011.json');
const lvc = legacy.traces.find(trace => trace.station === 'LVC');
const cases = new Map([
  ['tohoku-2011', {...tohoku, stations: [...tohoku.stations, {id: lvc.id, code: 'LVC', name: lvc.station_name, latitude_deg: lvc.latitude_deg, longitude_deg: lvc.longitude_deg, observed_pick: null, trace: lvc}]}],
  ['maule-2010', read('fixtures/events/maule-2010/case.json')],
  ['okhotsk-2013', read('fixtures/events/okhotsk-2013/case.json')],
]);
const nativeCache = new Map();
function native(depth, distance) {
  const key = `${depth}/${distance}`;
  if (!nativeCache.has(key)) {
    const result = spawnSync('target/release/taup', [String(depth), String(distance)], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    nativeCache.set(key, JSON.parse(result.stdout));
    report.nativeQueries++;
  }
  return nativeCache.get(key);
}
function near(actual, expected, tolerance = 1e-7, label = '') {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} versus ${expected}, tolerance ${tolerance}`);
}
function compareArrivals(actual, expected) {
  assert.equal(actual.length, expected.length, 'Every native root must survive the browser query.');
  for (let index = 0; index < actual.length; index++) {
    const a = actual[index], b = expected[index];
    assert.equal(a.phase, b.phase);
    near(a.time_s, b.time_s, 1e-7, 'arrival time');
    near(a.ray_param_s_rad, b.ray_param_s_rad, 1e-6, 'ray parameter');
    near(a.turning_depth_km, b.turning_depth_km, 1e-6, 'turning depth');
    assert.equal(a.path.length, b.path.length);
  }
}
function compareSummaries(actual, expected) {
  assert.equal(actual.length, expected.length);
  const branches = new Map();
  for (let index = 0; index < actual.length; index++) {
    const a = actual[index], b = expected[index];
    const branch = branches.get(b.phase) || 0;
    branches.set(b.phase, branch + 1);
    assert.equal(a.phase, b.phase); assert.equal(a.branch, branch);
    near(a.timeS, b.time_s); near(a.rayParamSRad, b.ray_param_s_rad, 1e-6); near(a.turningDepthKm, b.turning_depth_km, 1e-6);
  }
}
function haversine(a, b) {
  const r = Math.PI / 180;
  return 2 * Math.asin(Math.min(1, Math.sqrt(Math.sin((a.latitudeDeg - b.latitude_deg) * r / 2) ** 2 + Math.cos(a.latitudeDeg * r) * Math.cos(b.latitude_deg * r) * Math.sin((a.longitudeDeg - b.longitude_deg) * r / 2) ** 2))) / r;
}
function checkSnapshot(state) {
  const investigation = cases.get(state.investigation.key);
  assert.equal(state.investigation.id, investigation.event.id);
  const snapshot = state.snapshot;
  assert.equal(snapshot.source.depthKm, state.experiment.context.kind === 'explore' ? state.experiment.context.depthKm : investigation.event.depth_km);
  compareArrivals(snapshot.arrivals, native(snapshot.source.depthKm, snapshot.distanceDeg));
  assert.equal(snapshot.stationArrivals.length, investigation.stations.length);
  let supported = 0;
  for (const result of snapshot.stationArrivals) {
    const station = investigation.stations.find(station => station.id === result.stationId);
    assert.ok(station, 'A station summary cannot belong to another earthquake.');
    const expectedDistance = haversine(snapshot.source, station);
    near(result.distanceDeg, expectedDistance, 1e-10);
    const expected = native(snapshot.source.depthKm, result.distanceDeg);
    compareSummaries(result.arrivals, expected);
    if (expected.length) supported++;
  }
  assert.equal(snapshot.networkRays.length, supported);
  return investigation;
}
function note(action, state, extra = {}) {
  report.steps.push({action, event: state.investigation.key, experiment: state.experiment, source: state.snapshot?.source, arrivals: state.snapshot?.arrivals.map(arrival => ({phase: arrival.phase, timeS: arrival.time_s})), stats: state.stats, ...extra});
}
const log = fs.openSync(path.join(evidenceDir, 'server.log'), 'w');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {stdio: ['ignore', log, log]});
let browser, context, page, releaseBootHold, releaseStartupHold;
const watch = target => {
  target.on('pageerror', error => report.errors.push(String(error)));
  target.on('console', message => {
    if (message.type() !== 'error') return;
    if (message.text().startsWith('[atlas-window-error]')) report.windowErrors.push(message.text());
    else report.errors.push(message.text());
  });
};
async function ready(target = page, eventKey) {
  await target.waitForFunction(key => (window.workbench?.ready || window.workbench?.error) && (!key || window.workbench.state.investigation.key === key), eventKey, {timeout: 60000});
  assert.equal(await target.evaluate(() => window.workbench.error), null);
  return target.evaluate(() => window.workbench.state);
}
async function event(key) {
  await page.getByLabel('Earthquake investigation', {exact: true}).selectOption(key);
  const state = await ready(page, key);
  assert.equal(state.experiment.context.kind, 'replay');
  assert.equal(state.fit, null); assert.equal(state.diagram, null);
  checkSnapshot(state);
  return state;
}
async function station(code) {
  await page.getByLabel('Recording station', {exact: true}).selectOption(`IU.${code}.00.BHZ`);
  const state = await ready(); assert.equal(state.experiment.stationId, `IU.${code}.00.BHZ`);
  checkSnapshot(state); return state;
}
async function mode(kind) {
  await page.locator(`[data-mode="${kind}"]`).click();
  return ready();
}
async function scrub(time) {
  time = Math.round(time * 10) / 10;
  await page.getByLabel('Replay time in seconds after catalog origin').fill(String(time));
  const state = await ready(); assert.equal(state.experiment.timeS, time);
  near(Number(await page.locator('#wave-cursor').getAttribute('data-time-s')), time);
  return state;
}
async function checkWave(state) {
  const fixture = cases.get(state.investigation.key);
  const station = fixture.stations.find(item => item.id === state.experiment.stationId);
  const trace = station.trace;
  await expect(page.locator('#recording-title')).toHaveText(station.id);
  await expect(page.locator('#wave-caption')).toContainText(`${trace.samples.length.toLocaleString('en-US')} displayed samples`);
  const values = await page.locator('#waveform').evaluate(svg => ({width: svg.viewBox.baseVal.width, d: svg.querySelector('path[fill="none"]').getAttribute('d'), predictions: [...svg.querySelectorAll('[data-kind="prediction"]')].map(marker => ({phase: marker.dataset.phase, timeS: Number(marker.dataset.timeS)})), picks: [...svg.querySelectorAll('[data-kind="manual-pick"]')].map(marker => Number(marker.dataset.timeS))}));
  const points = [...values.d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(match => [Number(match[1]), Number(match[2])]);
  assert.equal(state.experiment.waveWindow, 'full');
  assert.equal(points.length, trace.samples.length);
  const peak = Math.max(1, ...trace.samples.map(Math.abs));
  for (const index of [0, 1, 37, 199, 500, 1100, 2000, trace.samples.length - 1]) {
    near(points[index][0], 14 + index / (trace.samples.length - 1) * (values.width - 28), 0.006, 'recording sample clock');
    near(points[index][1], 83 - trace.samples[index] / peak * 58, 0.006, 'recording sample amplitude');
  }
  assert.deepEqual(values.picks, station.observed_pick ? [station.observed_pick.offset_s] : []);
  assert.equal(values.predictions.length, state.snapshot.arrivals.length);
  for (let index = 0; index < values.predictions.length; index++) {
    assert.equal(values.predictions[index].phase, state.snapshot.arrivals[index].phase);
    near(values.predictions[index].timeS, state.snapshot.arrivals[index].time_s + state.snapshot.originOffsetS);
  }
  return {stationId: station.id, displayedSamples: trace.samples.length, waveformSha256: hash(values.d), manualPickS: values.picks[0] ?? null, modelMarkers: values.predictions};
}
function modelPositions(snapshot, ray) {
  const vector = point => { const lat = point.latitudeDeg * Math.PI / 180, lon = point.longitudeDeg * Math.PI / 180; return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)]; };
  const u = vector(snapshot.source), v = vector(snapshot.receiver);
  const dot = u.reduce((sum, value, index) => sum + value * v[index], 0);
  const tangent = v.map((value, index) => value - dot * u[index]);
  const norm = Math.hypot(...tangent);
  return ray.path.map(point => u.map((value, index) => (1 - point.depth_km / 6371) * (value * Math.cos(point.distance_rad) + tangent[index] / norm * Math.sin(point.distance_rad))));
}
async function checkSection(state, timeS, material) {
  state = await scrub(timeS);
  const host = page.locator('#section-view');
  await expect(host).toBeVisible();
  assert.equal(await host.getAttribute('data-section-event'), state.investigation.key);
  assert.equal(await host.getAttribute('data-section-status'), 'ready');
  const ray = state.snapshot.arrivals.filter(arrival => arrival.phase === state.experiment.phase)[state.experiment.branch];
  const packet = JSON.parse(await host.getAttribute('data-selected-packet'));
  const projection = JSON.parse(await host.getAttribute('data-section-projection'));
  const rayTime = state.experiment.timeS - state.snapshot.originOffsetS;
  let index = ray.path.findIndex(point => point.time_s >= rayTime); if (index < 0) index = ray.path.length - 1;
  const previous = Math.max(0, index - 1);
  const a = ray.path[previous], b = ray.path[index];
  const fraction = index === 0 ? 0 : Math.max(0, Math.min(1, (rayTime - a.time_s) / (b.time_s - a.time_s)));
  assert.equal(packet.phase, state.experiment.phase); assert.equal(packet.index, index); near(packet.fraction, fraction, 1e-10);
  near(packet.timeS, rayTime); near(packet.depthKm, a.depth_km + fraction * (b.depth_km - a.depth_km), 1e-9); near(packet.distanceRad, a.distance_rad + fraction * (b.distance_rad - a.distance_rad), 1e-10);
  assert.equal(packet.material, material);
  const model = modelPositions(state.snapshot, ray);
  for (let axis = 0; axis < 3; axis++) near(packet.modelPosition[axis], model[previous][axis] + fraction * (model[index][axis] - model[previous][axis]), 1e-10);
  const planar = point => [projection.center.x + Math.cos(projection.startAngle + point.distance_rad) * (1 - point.depth_km / 6371) * projection.radius, projection.center.y + Math.sin(projection.startAngle + point.distance_rad) * (1 - point.depth_km / 6371) * projection.radius];
  const left = planar(a), right = planar(b);
  for (let axis = 0; axis < 2; axis++) near(packet.sectionPosition[axis], left[axis] + fraction * (right[axis] - left[axis]), 1e-9);
  const dot = host.locator('[data-section-packet]');
  near(Number(await dot.getAttribute('cx')), packet.sectionPosition[0]); near(Number(await dot.getAttribute('cy')), packet.sectionPosition[1]);
  assert.equal(await dot.getAttribute('visibility'), 'visible');
  await expect(host.locator('.section-metrics')).toContainText(material);
  for (const depth of [2889, 5153.9]) {
    const radius = Number(await host.locator(`[data-boundary-depth-km="${depth}"]`).getAttribute('r'));
    near(radius / projection.radius, 1 - depth / 6371, 1e-10);
  }
  return packet;
}
async function checkRecords(state) {
  const fixture = cases.get(state.investigation.key);
  const plot = page.locator('#record-section');
  await expect(plot).toBeVisible();
  assert.equal(await plot.getAttribute('data-event-key'), state.investigation.key);
  assert.equal(await plot.getAttribute('data-identity'), state.investigation.identity);
  const rows = await plot.locator('[data-kind="record-row"]').evaluateAll(rows => rows.map(row => ({id: row.dataset.stationId, distance: Number(row.dataset.distanceDeg), baseline: row.querySelector('path:not([data-kind])').getAttribute('d'), d: row.querySelector('[data-kind="recording-counts"]').getAttribute('d'), predictions: [...row.querySelectorAll('[data-kind="record-prediction"]')].map(marker => ({stationId: marker.dataset.stationId, distance: Number(marker.dataset.distanceDeg), phase: marker.dataset.phase, branch: Number(marker.dataset.branch), timeS: Number(marker.dataset.timeS), travelTimeS: Number(marker.dataset.travelTimeS)})), picks: [...row.querySelectorAll('[data-kind="archived-pick"]')].map(marker => Number(marker.dataset.timeS))})));
  assert.equal(rows.length, fixture.stations.length);
  const minimum = Math.floor(Math.min(...fixture.stations.map(station => station.trace.start_offset_s)));
  const maximum = Math.ceil(Math.max(...fixture.stations.map(station => station.trace.start_offset_s + (station.trace.samples.length - 1) / station.trace.sample_rate_hz)));
  let previousDistance = -1;
  let samplesChecked = 0;
  for (const row of rows) {
    const station = fixture.stations.find(station => station.id === row.id);
    near(row.distance, haversine({latitudeDeg: fixture.event.latitude_deg, longitudeDeg: fixture.event.longitude_deg}, station), 1e-10);
    assert.ok(row.distance >= previousDistance); previousDistance = row.distance;
    const baseline = row.baseline.match(/^M([\d.]+),([\d.]+)H([\d.]+)$/);
    assert.ok(baseline);
    const [, left, center, right] = baseline.map(Number);
    const trace = station.trace;
    const peak = Math.max(1, ...trace.samples.map(Math.abs));
    const points = [...row.d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(match => [Number(match[1]), Number(match[2])]);
    assert.ok(points.length >= 200, 'The record section must show actual signal samples.');
    for (const [x, y] of points) {
      const time = minimum + (x - left) / (right - left) * (maximum - minimum);
      const index = Math.max(0, Math.min(trace.samples.length - 1, Math.round((time - trace.start_offset_s) * trace.sample_rate_hz)));
      near(x, left + (trace.start_offset_s + index / trace.sample_rate_hz - minimum) / (maximum - minimum) * (right - left), 0.006);
      near(y, center - trace.samples[index] / peak * 23, 0.006, 'record section raw count');
      samplesChecked++;
    }
    assert.deepEqual(row.picks, station.observed_pick ? [station.observed_pick.offset_s] : []);
    const summary = state.snapshot.stationArrivals.find(item => item.stationId === station.id);
    assert.equal(row.predictions.length, summary.arrivals.length);
    for (let index = 0; index < row.predictions.length; index++) {
      const marker = row.predictions[index], arrival = summary.arrivals[index];
      assert.equal(marker.stationId, station.id); near(marker.distance, summary.distanceDeg, 1e-10);
      assert.equal(marker.phase, arrival.phase); assert.equal(marker.branch, arrival.branch);
      near(marker.travelTimeS, arrival.timeS); near(marker.timeS, arrival.timeS + state.snapshot.originOffsetS);
    }
  }
  near(Number(await plot.locator('[data-kind="record-cursor"]').getAttribute('data-time-s')), state.experiment.timeS);
  return {rows: rows.length, samplesChecked, modelMarkers: rows.reduce((count, row) => count + row.predictions.length, 0), archivedPicks: rows.reduce((count, row) => count + row.picks.length, 0)};
}
async function travel(state) {
  await page.locator('[data-evidence="travel"]').click();
  await page.waitForFunction(() => window.workbench.state.diagram || window.workbench.state.diagramError, null, {timeout: 60000});
  state = await ready();
  assert.equal(state.diagramError, ''); assert.equal(state.diagramPending, false);
  const diagram = state.diagram;
  assert.equal(diagram.samples.length, 90);
  assert.equal(diagram.depthKm, state.snapshot.source.depthKm);
  assert.equal(diagram.policy.distanceStepDeg, 2);
  const plot = page.locator('#travel-time-diagram');
  await expect(plot).toBeVisible();
  assert.equal(await plot.getAttribute('data-event-key'), state.investigation.key);
  assert.equal(await plot.getAttribute('data-identity'), state.investigation.identity);
  const sampled = await plot.locator('[data-kind="sampled-distance"]').evaluateAll(groups => groups.map(group => ({distanceDeg: Number(group.dataset.distanceDeg), count: Number(group.dataset.rootCount), roots: [...group.querySelectorAll('[data-kind="sampled-root"]')].map(root => ({phase: root.dataset.phase, branch: Number(root.dataset.branch), distance: Number(root.dataset.distanceDeg), depth: Number(root.dataset.depthKm), travelTimeS: Number(root.dataset.travelTimeS), timeS: Number(root.dataset.timeS), paths: root.querySelectorAll('path').length}))})));
  assert.equal(sampled.length, 90);
  let roots = 0, empty = 0;
  for (let index = 0; index < diagram.samples.length; index++) {
    const sample = diagram.samples[index], group = sampled[index];
    assert.equal(sample.distanceDeg, 1 + index * 2); assert.equal(group.distanceDeg, sample.distanceDeg);
    const expected = native(diagram.depthKm, sample.distanceDeg);
    compareSummaries(sample.arrivals, expected);
    assert.equal(group.count, expected.length); assert.equal(group.roots.length, expected.length);
    if (!expected.length) empty++;
    for (let root = 0; root < expected.length; root++) {
      const glyph = group.roots[root], actual = expected[root];
      assert.equal(glyph.phase, actual.phase); assert.equal(glyph.branch, sample.arrivals[root].branch);
      assert.equal(glyph.distance, sample.distanceDeg); assert.equal(glyph.depth, diagram.depthKm);
      near(glyph.travelTimeS, actual.time_s); near(glyph.timeS, actual.time_s + state.snapshot.originOffsetS);
      assert.equal(glyph.paths, 0, 'Sampled roots remain dots rather than invented branch lines.'); roots++;
    }
  }
  assert.ok(empty >= 1, 'The actual phase-set shadow gap must remain empty.');
  const stationMarkers = await plot.locator('[data-kind="station-prediction"]').evaluateAll(markers => markers.map(marker => ({id: marker.dataset.stationId, distance: Number(marker.dataset.distanceDeg), phase: marker.dataset.phase, branch: Number(marker.dataset.branch), time: Number(marker.dataset.timeS)})));
  const expectedMarkers = state.snapshot.stationArrivals.flatMap(station => station.arrivals.map(arrival => ({id: station.stationId, distance: station.distanceDeg, phase: arrival.phase, branch: arrival.branch, time: arrival.timeS + state.snapshot.originOffsetS})));
  assert.deepEqual(stationMarkers, expectedMarkers);
  const picks = await plot.locator('[data-kind="archived-pick"]').evaluateAll(markers => markers.map(marker => ({id: marker.dataset.stationId, time: Number(marker.dataset.timeS)})));
  assert.deepEqual(picks, cases.get(state.investigation.key).stations.filter(station => station.observed_pick).map(station => ({id: station.id, time: station.observed_pick.offset_s})));
  note('Display all 90 exact sampled geometries, every native root, independent picks and preserved gaps', state, {sampledDistances: sampled.length, roots, emptyDistances: empty, stationMarkers: stationMarkers.length, archivedPicks: picks.length});
  return state;
}
function parseCsv(text) {
  return text.trim().split('\n').map(line => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match => match[1].replaceAll('""', '"')));
}
async function download(format, filename) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', {name: `Download ${format}`, exact: false}).click();
  const result = await pending; const file = path.join(evidenceDir, filename); await result.saveAs(file);
  return fs.readFileSync(file, 'utf8');
}

try {
  for (let attempt = 0; ; attempt++) {
    assert.equal(server.exitCode, null, 'Owned preview exited. Inspect server.log.');
    if (stripVTControlCharacters(fs.readFileSync(path.join(evidenceDir, 'server.log'), 'utf8')).includes('Local:')) {
      const response = await fetch(url);
      assert.ok(response.ok); assert.ok((await response.text()).includes('Earthquake Lab'));
      assert.equal(server.exitCode, null, 'Our preview must still own its port.');
      break;
    }
    assert.ok(attempt < 80, 'Owned preview did not become ready.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({channel: 'chrome', headless: true, ignoreDefaultArgs: ['--disable-back-forward-cache']});
  report.runtime = {node: process.version, chrome: browser.version(), platform: process.platform, architecture: process.arch, physicalMobile: false};
  context = await browser.newContext({viewport: {width: 1440, height: 1080}, acceptDownloads: true});
  await context.addInitScript(() => addEventListener('error', event => console.error('[atlas-window-error]', event.message, event.filename, event.lineno)));
  await context.tracing.start({screenshots: true, snapshots: true});
  page = await context.newPage(); watch(page);
  await page.goto(url);
  let state = await ready(); checkSnapshot(state);
  await page.screenshot({path: path.join(evidenceDir, 'desktop.png'), fullPage: true});
  note('Open exact Tohoku replay from the built production artifact', state);

  const recordings = [];
  for (const key of cases.keys()) {
    state = await event(key);
    assert.equal(state.snapshot.source.depthKm, cases.get(key).event.depth_km);
    for (const item of cases.get(key).stations) {
      state = await station(item.code);
      const proof = await checkWave(state);
      const time = item.observed_pick?.offset_s ?? 400.25;
      state = await scrub(time);
      const records = await checkRecords(state);
      recordings.push({event: key, ...proof});
      assert.equal(records.archivedPicks, cases.get(key).stations.filter(station => station.observed_pick).length);
    }
    const completed = state.stats.completed;
    await page.getByRole('button', {name: 'Play earthquake replay', exact: true}).click();
    await page.waitForTimeout(250);
    await page.getByRole('button', {name: 'Pause earthquake replay', exact: true}).click();
    const played = await ready(); assert.ok(played.experiment.timeS > state.experiment.timeS); assert.equal(played.stats.completed, completed);
    state = await travel(played);
    await page.screenshot({path: path.join(evidenceDir, `${key}-travel.png`), fullPage: true});
    await page.locator('[data-evidence="records"]').click();
    state = await ready();
    note('Select every real station and verify actual counts, manual picks, modeled markers and one playback clock', state, {recordings: recordings.filter(record => record.event === key), ...await checkRecords(state)});
  }

  state = await event('maule-2010');
  state = await station('LVC');
  assert.equal(state.snapshot.arrivals.filter(arrival => arrival.phase === 'P').length, 3);
  assert.equal(state.experiment.phase, 'P');
  state = await travel(state);
  await page.locator('[data-kind="station-prediction"][data-station-id="IU.LVC.00.BHZ"][data-phase="P"][data-branch="2"]').press('Enter');
  state = await ready(); assert.equal(state.experiment.stationId, 'IU.LVC.00.BHZ'); assert.equal(state.experiment.phase, 'P'); assert.equal(state.experiment.branch, 2);
  near(state.snapshot.arrivals.filter(arrival => arrival.phase === 'P')[2].time_s, 204.03345911080785, 1e-6);
  checkSnapshot(state);
  note('Activate the third Maule LVC P root from its exact station marker without losing its local branch', state);
  await page.locator('[data-evidence="records"]').click();
  state = await station('KIP'); assert.equal(state.snapshot.arrivals.filter(arrival => arrival.phase === 'P').length, 0);
  assert.ok(state.snapshot.arrivals.some(arrival => arrival.phase === state.experiment.phase));
  assert.ok(!['P'].includes(state.experiment.phase));
  state = await station('CTAO'); assert.equal(state.snapshot.arrivals.length, 0);
  await expect(page.locator('#path-summary')).toContainText('No supported');
  const emptyCsv = parseCsv(await download('CSV', 'maule-empty.csv'));
  assert.equal(emptyCsv.length, 2);
  assert.equal(emptyCsv[1][emptyCsv[0].indexOf('investigation_key')], 'maule-2010');
  assert.equal(emptyCsv[1][emptyCsv[0].indexOf('scientific_identity')], state.investigation.identity);
  assert.equal(emptyCsv[1][emptyCsv[0].indexOf('recording_id')], 'IU.CTAO.00.BHZ');
  await page.locator('[data-mode="locate"]').click();
  state = await ready(); assert.equal(state.experiment.context.kind, 'replay');
  await expect(page.locator('#challenge-unavailable')).toBeVisible();
  await expect(page.locator('#challenge-unavailable')).toContainText('No validated source-location exercise');
  await page.getByRole('button', {name: 'Open Tohoku source challenge', exact: false}).click();
  state = await ready(page, 'tohoku-2011'); assert.equal(state.experiment.context.kind, 'locate');
  assert.equal(state.snapshot.residuals.stations.length, 8);
  note('Preserve three Maule P roots, unsupported KIP P and absent CTAO roots; explain the missing challenge and open validated Tohoku exercise', state, {emptyCsv});

  state = await event('okhotsk-2013'); state = await mode('explore');
  await page.getByRole('button', {name: 'Trace the inner core', exact: false}).click();
  state = await ready(); assert.equal(state.snapshot.source.depthKm, 598.1); assert.equal(state.experiment.stationId, 'IU.LVC.00.BHZ'); assert.equal(state.experiment.phase, 'PKIKP');
  assert.equal(state.experiment.interiorView, 'globe');
  await expect(page.locator('#earth-globe')).toBeVisible();
  await expect(page.locator('#section-view')).toBeHidden();
  await page.locator('[data-interior="section"]').click();
  state = await ready(); assert.equal(state.experiment.interiorView, 'section');
  const core = state.snapshot.arrivals.find(arrival => arrival.phase === 'PKIKP'); assert.ok(core.turning_depth_km > 5153.9);
  const packets = [];
  for (const [low, high, material] of [[500, 2000, 'Mantle'], [3500, 4500, 'Liquid outer core'], [5153.9, 6371, 'Solid inner core']]) {
    const index = core.path.findIndex((point, index) => index > 0 && point.depth_km > low && point.depth_km < high && core.path[index - 1].depth_km >= low && point.time_s - core.path[index - 1].time_s > 0.001);
    assert.ok(index > 0);
    const timeS = (core.path[index - 1].time_s + core.path[index].time_s) / 2;
    packets.push(await checkSection(state, timeS, material));
    state = await ready();
  }
  const sectionSize = await page.locator('#section-view .section-diagram').boundingBox();
  assert.ok(sectionSize.height >= 420, 'Desktop interior gets a legible Earth-sized section.');
  const labels = await page.locator('#section-view .section-key, #section-view .section-endpoints').evaluateAll(nodes => nodes.map(node => ({fontSize: parseFloat(getComputedStyle(node).fontSize), width: node.getBoundingClientRect().width, scrollWidth: node.scrollWidth})));
  for (const label of labels) { assert.ok(label.fontSize >= 12); assert.ok(label.scrollWidth <= Math.ceil(label.width) + 1); }
  await page.screenshot({path: path.join(evidenceDir, 'okhotsk-interior.png'), fullPage: true});
  await page.locator('[data-interior="globe"]').click();
  state = await ready(); assert.equal(state.experiment.interiorView, 'globe');
  await expect(page.locator('#earth-globe')).toBeVisible();
  await expect(page.locator('#section-view')).toBeHidden();
  const focus = page.getByRole('button', {name: 'Focus selected ray section', exact: true});
  await focus.click(); state = await ready();
  assert.equal(await page.locator('#earth-globe').getAttribute('data-globe-status'), 'ready');
  await expect(page.locator('[data-globe-overlay]')).toContainText('Okhotsk 2013');
  await page.screenshot({path: path.join(evidenceDir, 'okhotsk-globe.png'), fullPage: true});
  note('Follow the exact deep-earthquake packet through mantle and both cores in a large section, then inspect the linked 3D globe', state, {packets, sectionSize, labels});

  state = await travel(state);
  const sample = state.diagram.samples.find(sample => sample.distanceDeg === 75).arrivals.find(arrival => arrival.phase === 'S');
  assert.ok(sample);
  const unchangedWave = await page.locator('#waveform > path[fill="none"]').getAttribute('d');
  await page.locator('[data-kind="sampled-root"][data-distance-deg="75"][data-phase="S"][data-branch="0"]').press('Enter');
  state = await ready(); assert.equal(state.experiment.context.kind, 'explore'); assert.equal(state.experiment.context.distanceDeg, 75); assert.equal(state.experiment.phase, 'S');
  compareArrivals(state.snapshot.arrivals, native(598.1, 75));
  assert.equal(await page.locator('#waveform > path[fill="none"]').getAttribute('d'), unchangedWave);
  await expect(page.locator('#scenario-note')).toContainText('Hypothetical');
  await expect(page.locator('[data-kind="virtual-receiver"]').first()).toBeVisible();
  state = await scrub(411.125);
  await page.getByLabel('Playback speed', {exact: true}).selectOption('30');
  await page.locator('[data-interior="globe"]').click();
  const canvas = page.locator('#earth-globe'); await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 58, box.y + box.height / 2 + 19, {steps: 8}); await page.mouse.up();
  await page.getByRole('button', {name: 'Share experiment', exact: false}).click(); state = await ready();
  await expect(page.getByLabel('Reproducible experiment URL')).toHaveValue(/^http:\/\//);
  const sharedUrl = await page.getByLabel('Reproducible experiment URL').inputValue();
  assert.ok(sharedUrl.includes('#lab=2&event=okhotsk-2013'));
  const shared = await context.newPage(); watch(shared); await shared.goto(sharedUrl); const restored = await ready(shared, 'okhotsk-2013');
  assert.deepEqual(restored.experiment, state.experiment); assert.equal(restored.playing, false);
  compareArrivals(restored.snapshot.arrivals, state.snapshot.arrivals);
  await shared.waitForFunction(() => Boolean(window.workbench.state.diagram), null, {timeout: 60000});
  assert.equal((await ready(shared)).diagram.depthKm, 598.1);
  for (const [attribute, expected] of [['data-camera-azimuth', state.experiment.camera.azimuthDeg], ['data-camera-elevation', state.experiment.camera.elevationDeg], ['data-camera-distance', state.experiment.camera.distance]]) near(Number(await shared.locator('#earth-globe').getAttribute(attribute)), expected, 1e-6);
  await shared.screenshot({path: path.join(evidenceDir, 'shared.png'), fullPage: true}); await shared.close();
  const payload = JSON.parse(await download('JSON', 'okhotsk-experiment.json'));
  assert.equal(payload.investigation_key, 'okhotsk-2013'); assert.equal(payload.scientific_identity, state.investigation.identity);
  assert.equal(payload.event.id, 'usb000h4jh'); assert.deepEqual(payload.arrivals, state.snapshot.arrivals);
  assert.equal(payload.recording.id, 'IU.LVC.00.BHZ'); assert.equal(payload.sampled_travel_times.samples.length, 90);
  assert.equal(payload.observations.length, 5); for (const pick of payload.observations) { assert.equal(pick.uncertaintyS, null); assert.ok(pick.recordingMatch.includes('does not identify this particular BHZ')); }
  const csv = parseCsv(await download('CSV', 'okhotsk-experiment.csv'));
  assert.equal(csv.length, state.snapshot.arrivals.length + 1);
  for (const row of csv.slice(1)) { assert.equal(row[csv[0].indexOf('investigation_key')], 'okhotsk-2013'); assert.equal(row[csv[0].indexOf('scientific_identity')], state.investigation.identity); }
  note('Inspect a sampled root through keyboard interaction, preserve historical recording, restore complete lab2 event/view/camera intent and download bound evidence', state, {sharedUrl});

  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await context.setOffline(true);
  await page.locator('#advanced > summary').click();
  await page.locator('#depth').fill('411.125'); await page.locator('#distance').fill('131.375');
  await page.getByRole('button', {name: 'Calculate geometry', exact: true}).click();
  state = await ready(); compareArrivals(state.snapshot.arrivals, native(411.125, 131.375));
  await page.waitForFunction(() => window.workbench.state.diagram?.depthKm === 411.125, null, {timeout: 60000});
  assert.deepEqual(requests, []); await context.setOffline(false);
  note('Compute unseen geometry and a full new travel-time depth offline with zero requests', await ready());

  state = await event('tohoku-2011');
  await page.getByRole('button', {name: 'Share experiment', exact: false}).click();
  await expect(page.getByLabel('Reproducible experiment URL')).toHaveValue(/^http:\/\//);
  const tohokuUrl = new URL(await page.getByLabel('Reproducible experiment URL').inputValue());
  const oldFields = new URLSearchParams(tohokuUrl.hash.slice(1)); oldFields.set('lab', '1'); oldFields.set('phase', 'S'); oldFields.set('time', '321.7'); for (const key of ['event', 'view', 'interior']) oldFields.delete(key);
  await page.goto(url + '#' + oldFields); state = await ready(page, 'tohoku-2011');
  await page.waitForFunction(() => window.workbench.ready && window.workbench.state.experiment.phase === 'S' && window.workbench.state.experiment.timeS === 321.7); state = await ready();
  assert.ok(state.notice.includes('Shared experiment restored')); assert.equal(state.experiment.context.kind, 'replay'); assert.equal(state.experiment.evidenceView, 'records');
  compareArrivals(state.snapshot.arrivals, native(29, state.snapshot.distanceDeg));
  const invalid = new URL(sharedUrl); invalid.hash = invalid.hash.replace(/identity=[^&]+/, 'identity=changed');
  await page.goto(invalid.href); state = await ready(page, 'tohoku-2011');
  assert.equal(state.experiment.context.kind, 'replay'); assert.equal(state.experiment.stationId, 'IU.ANMO.00.BHZ'); assert.equal(state.experiment.evidenceView, 'records');
  await expect(page.locator('#notice')).toContainText('complete link was reset');
  note('Accept the frozen legacy lab1 identity and atomically reset a mismatched lab2 event identity', state, {legacyUrl: url + '#' + oldFields});

  async function publications(durationMs, finalKey) {
    return page.evaluate(async ({duration, finalKey}) => {
      const receipts = [];
      const start = performance.now();
      while (receipts.length < 10 || receipts.at(-1)?.elapsedMs < duration || receipts.at(-1)?.event !== finalKey || !receipts.at(-1)?.ready) {
        if (performance.now() - start > 60000) throw new Error('Publication observation exceeded the existing readiness budget.');
        const state = window.workbench?.state;
        if (state) receipts.push({elapsedMs: performance.now() - start, ready: window.workbench.ready, event: state.investigation.key, pending: state.pending, context: state.experiment.context.kind, source: state.snapshot?.source ?? null, fit: state.fit?.best ?? null, diagramDepth: state.diagram?.depthKm ?? null, plotEvents: [...document.querySelectorAll('[data-event-key]')].map(node => node.dataset.eventKey), sectionEvent: document.querySelector('#section-view')?.dataset.sectionEvent, recording: document.querySelector('#recording-title')?.textContent});
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return receipts;
    }, {duration: durationMs, finalKey});
  }
  function checkPublications(receipts, finalKey, minimumMs) {
    assert.ok(receipts.length >= 10);
    assert.ok(receipts.at(-1).elapsedMs >= minimumMs);
    assert.equal(receipts.at(-1).ready, true);
    for (const receipt of receipts) {
      const fixture = cases.get(receipt.event);
      assert.ok(fixture);
      for (const event of receipt.plotEvents) assert.equal(event, receipt.event);
      if (receipt.sectionEvent) assert.equal(receipt.sectionEvent, receipt.event);
      if (receipt.source && receipt.context === 'replay') assert.deepEqual(receipt.source, {latitudeDeg: fixture.event.latitude_deg, longitudeDeg: fixture.event.longitude_deg, depthKm: fixture.event.depth_km});
      if (receipt.event !== 'tohoku-2011') assert.equal(receipt.fit, null);
      if (receipt.diagramDepth != null && receipt.source) assert.equal(receipt.diagramDepth, receipt.source.depthKm);
      assert.ok(fixture.stations.some(station => station.id === receipt.recording));
    }
    assert.equal(receipts.at(-1).event, finalKey);
    return {samples: receipts.length, elapsedMs: receipts.at(-1).elapsedMs, events: [...new Set(receipts.map(receipt => receipt.event))], receipts};
  }
  async function armSwitch(kind) {
    await page.evaluate(kind => {
      const read = () => {
        const state = window.workbench.state;
        return {at: performance.now(), event: state.investigation.key, identity: state.investigation.identity, pending: kind === 'travel' ? state.diagramPending : state.pending && !state.snapshot, stats: state.stats};
      };
      const receipt = window.atlasSwitch = {kind, began: null, activation: null};
      const observe = () => { const state = read(); if (state.pending && !receipt.began) { receipt.began = state; observer.disconnect(); } };
      const observer = new MutationObserver(observe);
      observer.observe(document.body, {subtree: true, childList: true, attributes: true, characterData: true});
      observe();
      document.addEventListener('change', function changed(event) {
        if (event.target.id !== 'event') return;
        receipt.activation = {...read(), selected: event.target.value, trusted: event.isTrusted};
        observer.disconnect(); document.removeEventListener('change', changed, true);
      }, true);
    }, kind);
  }
  async function checkSwitch() {
    const receipt = await page.evaluate(() => window.atlasSwitch);
    assert.equal(receipt.began?.pending, true, 'Observe actual work before switching.');
    assert.equal(receipt.began.event, 'tohoku-2011');
    assert.equal(receipt.activation?.pending, true, 'The old job must still be pending when the event selector changes.');
    assert.equal(receipt.activation.event, 'tohoku-2011');
    assert.equal(receipt.activation.selected, 'maule-2010');
    if (receipt.kind !== 'startup') assert.ok(receipt.activation.stats.pending > 0, 'A real numerical Worker request must remain unresolved at selection activation.');
    assert.ok(receipt.activation.at >= receipt.began.at);
    return receipt;
  }
  state = await mode('locate');
  await armSwitch('fit');
  const fittingClick = page.getByRole('button', {name: 'Fit source', exact: true}).click();
  await page.waitForFunction(() => window.atlasSwitch.began);
  const fitting = publications(2500, 'maule-2010');
  await page.getByLabel('Earthquake investigation', {exact: true}).selectOption('maule-2010'); state = await ready(page, 'maule-2010');
  await fittingClick;
  const fitRace = {...checkPublications(await fitting, 'maule-2010', 2500), inFlight: await checkSwitch()};
  state = await event('tohoku-2011');
  await armSwitch('travel');
  const chartClick = page.locator('[data-evidence="travel"]').click();
  await page.waitForFunction(() => window.atlasSwitch.began);
  const charting = publications(2500, 'okhotsk-2013');
  await page.getByLabel('Earthquake investigation', {exact: true}).selectOption('maule-2010');
  await page.getByLabel('Earthquake investigation', {exact: true}).selectOption('okhotsk-2013'); state = await ready(page, 'okhotsk-2013');
  await chartClick;
  const chartRace = {...checkPublications(await charting, 'okhotsk-2013', 2500), inFlight: await checkSwitch()};
  let delayedBootRequests = 0;
  const holdStartup = new Promise(resolve => { releaseStartupHold = resolve; });
  const workerRoute = '**/compute-worker-*.js';
  await context.route(workerRoute, async route => { delayedBootRequests++; if (delayedBootRequests === 1) await holdStartup; await route.continue().catch(() => {}); });
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  await expect.poll(() => delayedBootRequests, {timeout: 5000}).toBe(1);
  await page.waitForFunction(() => window.workbench?.state.pending && !window.workbench.state.snapshot, null, {timeout: 5000});
  await armSwitch('startup');
  const starting = publications(1200, 'okhotsk-2013');
  await page.getByLabel('Earthquake investigation', {exact: true}).selectOption('maule-2010');
  releaseStartupHold();
  await page.getByLabel('Earthquake investigation', {exact: true}).selectOption('okhotsk-2013');
  state = await ready(page, 'okhotsk-2013');
  const startupRace = {...checkPublications(await starting, 'okhotsk-2013', 1200), inFlight: await checkSwitch(), delayedWorkerBootRequests: delayedBootRequests};
  assert.ok(delayedBootRequests >= 1); await context.unroute(workerRoute);
  checkSnapshot(state);
  note('Switch events during real source fitting, travel sampling and engine startup; observe no old-case answers or labels', state, {fitRace, chartRace, startupRace});
  state = await event('tohoku-2011'); state = await mode('locate');
  await page.getByRole('button', {name: 'Share experiment', exact: false}).click();
  await expect(page.getByLabel('Reproducible experiment URL')).toHaveValue(/^http:\/\//);
  const bootUrl = await page.getByLabel('Reproducible experiment URL').inputValue();
  await context.tracing.stop({path: path.join(evidenceDir, 'desktop-trace.zip')}); await context.close(); await browser.close();
  browser = await chromium.launch({channel: 'chrome', headless: true, ignoreDefaultArgs: ['--disable-back-forward-cache']});
  context = await browser.newContext({viewport: {width: 1440, height: 1080}, acceptDownloads: true});
  await context.addInitScript(() => addEventListener('error', event => console.error('[atlas-window-error]', event.message, event.filename, event.lineno)));
  await context.tracing.start({screenshots: true, snapshots: true});
  page = await context.newPage(); watch(page);
  let wasmRequests = 0;
  let firstHeld;
  const firstRequested = new Promise(resolve => { firstHeld = resolve; });
  const holdFirst = new Promise(resolve => { releaseBootHold = resolve; });
  const wasmRoute = '**/taup_core_bg-*.wasm';
  await context.route(wasmRoute, async route => {
    wasmRequests++;
    if (wasmRequests === 1) { firstHeld(); await holdFirst; }
    await route.continue().catch(() => {});
  });
  await page.goto(bootUrl, {waitUntil: 'commit'});
  await Promise.race([firstRequested, new Promise((_, reject) => setTimeout(() => reject(new Error('The first real WASM request was not held.')), 10000))]);
  await expect(page.getByRole('button', {name: 'Cancel', exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(page.locator('#error-text')).toContainText('cancelled');
  await page.getByRole('button', {name: 'Retry calculation', exact: true}).click();
  state = await ready(page, 'tohoku-2011');
  assert.ok(wasmRequests >= 2); assert.equal(page.workers().length, 2, 'The deliberately held obsolete startup is still alive before release.');
  const retryStats = structuredClone(state.stats);
  assert.equal(retryStats.ready, true); assert.equal(retryStats.completed, 3, 'Ready after Retry includes exactly initialization, linked-path evaluation, and fan preparation.');
  releaseBootHold();
  await expect.poll(() => page.workers().length, {timeout: 10000}).toBe(1);
  await page.waitForTimeout(100);
  state = await ready(); assert.deepEqual(state.stats, retryStats);
  assert.equal(state.experiment.context.kind, 'locate'); assert.equal(state.snapshot.residuals.stations.length, 8);
  await context.unroute(wasmRoute);
  state = await event('maule-2010'); await expect.poll(() => page.workers().length, {timeout: 10000}).toBe(1);
  note('Cancel the first real WASM startup, retry before releasing it, dispose the late obsolete Worker and keep one Worker after the next event', state, {heldWasmRequests: wasmRequests, retryStats, completedOperations: ['initialize', 'evaluate', 'wavefronts'], finalWorkerCount: page.workers().length});

  await context.tracing.stop({path: path.join(evidenceDir, 'boot-trace.zip')}); await context.close(); context = null;

  context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 2, acceptDownloads: true});
  await context.addInitScript(() => addEventListener('error', event => console.error('[atlas-window-error]', event.message, event.filename, event.lineno)));
  await context.tracing.start({screenshots: true, snapshots: true});
  page = await context.newPage(); watch(page); await page.goto(url); await ready();
  for (const key of cases.keys()) {
    state = await event(key);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The mobile document must not overflow horizontally.');
    const playBox = await page.locator('#play').boundingBox(); assert.ok(playBox.y + playBox.height <= 844, 'Mobile replay action fits in the first viewport.');
    await page.getByRole('button', {name: 'Play earthquake replay', exact: true}).tap(); await page.waitForTimeout(180); await page.getByRole('button', {name: 'Pause earthquake replay', exact: true}).tap();
    state = await station(key === 'maule-2010' ? 'LVC' : 'ANMO');
    await checkWave(state); state = await scrub(400.5); await checkRecords(state);
    await page.locator('[data-mode="explore"]').tap(); state = await ready();
    assert.equal(state.experiment.interiorView, 'globe');
    await expect(page.locator('#earth-globe')).toBeVisible();
    await expect(page.locator('#section-view')).toBeHidden();
    await page.locator('[data-interior="section"]').tap(); state = await ready();
    assert.equal(state.experiment.interiorView, 'section');
    await expect(page.locator('#section-view')).toBeVisible();
    await expect.poll(async () => (await page.locator('#section-view .section-diagram').boundingBox())?.height || 0).toBeGreaterThanOrEqual(270);
    const size = await page.locator('#section-view .section-diagram').boundingBox(); assert.ok(size.height >= 270);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({path: path.join(evidenceDir, `${key}-mobile.png`), fullPage: true});
    note('Use real touch-context event, replay, station and section controls at390px without horizontal overflow', state, {sectionSize: size});
  }
  state = await travel(state);
  await page.locator('[data-kind="sampled-root"][data-distance-deg="75"][data-phase="P"][data-branch="0"]').press('Enter');
  state = await ready(); assert.equal(state.experiment.context.distanceDeg, 75); compareArrivals(state.snapshot.arrivals, native(598.1, 75));
  await page.locator('[data-evidence="records"]').tap(); state = await ready();
  const row = page.locator('[data-kind="record-row"][data-station-id="IU.TATO.00.BHZ"]');
  await row.scrollIntoViewIfNeeded(); const rowBox = await row.boundingBox();
  await page.touchscreen.tap(rowBox.x + 25, rowBox.y + rowBox.height / 2);
  state = await ready(); assert.equal(state.experiment.stationId, 'IU.TATO.00.BHZ');
  await page.screenshot({path: path.join(evidenceDir, 'mobile-linked-records.png'), fullPage: true});
  note('Select sampled geometry and a real station from linked visualizations in a touch context', state);
  assert.deepEqual(report.errors, []); assert.deepEqual(report.windowErrors, []);
  for (const [file, expected] of Object.entries(report.hashes)) assert.equal(hash(fs.readFileSync(file)), expected, `Source changed during verification: ${file}`);
  report.recordings = recordings;
  report.verdict = 'PASS';

} catch (error) {
  report.verdict = 'FAIL'; report.failure = String(error.stack || error);
  if (page && !page.isClosed()) await page.screenshot({path: path.join(evidenceDir, 'failure.png'), fullPage: true}).catch(() => {});
  process.exitCode = 1;
} finally {
  releaseStartupHold?.();
  releaseBootHold?.();
  if (context) await context.tracing.stop({path: path.join(evidenceDir, 'trace.zip')}).catch(() => {});
  await context?.close(); await browser?.close();
  server.kill('SIGTERM'); await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); });
  fs.closeSync(log);
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({verdict: report.verdict, steps: report.steps.length, errors: report.errors.length, windowErrors: report.windowErrors.length, nativeQueries: report.nativeQueries, evidenceDir, failure: report.failure}));
}
