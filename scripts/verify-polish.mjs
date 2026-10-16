#!/usr/bin/env node
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';

const evidenceDir = path.resolve(process.env.TAUP_EVIDENCE || '.audit/open-source-readiness/polish');
const port = Number(process.env.TAUP_PORT || 5198);
const url = `http://127.0.0.1:${port}/`;
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const filesIn = directory => fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => entry.isDirectory() ? filesIn(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const sources = ['scripts/verify-polish.mjs', 'target/release/taup', 'crates/taup-core/src/lib.rs', 'web/pkg/taup_core_bg.wasm', 'fixtures/investigation/tohoku-investigation.json', 'fixtures/observed/tohoku-2011.json', ...filesIn('web').filter(file => /\.(js|css)$/.test(file))];
const fixture = JSON.parse(fs.readFileSync('fixtures/investigation/tohoku-investigation.json'));
const legacy = JSON.parse(fs.readFileSync('fixtures/observed/tohoku-2011.json'));
const stations = new Map(fixture.stations.map(station => [station.id, station]));
for (const trace of legacy.traces) if (!stations.has(trace.id)) stations.set(trace.id, {id: trace.id, trace});
const nativeCache = new Map();
const report = {
  startedAt: new Date().toISOString(), url, steps: [], errors: [], nativeChecks: [],
  hashes: Object.fromEntries(sources.map(file => [file, sha256(fs.readFileSync(file))])),
  assets: Object.fromEntries(filesIn('dist').map(file => [file, sha256(fs.readFileSync(file))])),
  contracts: {
    markers: 'Every in-window native arrival keeps its original catalog-relative time and baseline linear SVG projection. Branch ordinals are phase-local.',
    waveform: 'The displayed path and archived pick are compared with the frozen recording through the pre-repair normalization, bounds, and projection formula.',
    interaction: 'All selection changes use the public station, phase, branch, window, and geometry controls. The pending snapshot is read in the same task as the native geometry-button click.',
  },
  limitations: ['Touch-enabled desktop Chrome does not measure physical-phone performance.', 'This focused label check does not replace the investigation, globe, atlas, wavefront, or numerical reference suites.'],
};
fs.mkdirSync(evidenceDir, {recursive: true});
const log = fs.openSync(path.join(evidenceDir, 'server.log'), 'w');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {stdio: ['ignore', log, log]});
let browser;
const contexts = new Set();

function near(actual, expected, tolerance = 1e-8) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected} by more than ${tolerance}.`);
}

function compareNative(state) {
  const key = `${state.snapshot.source.depthKm}/${state.snapshot.distanceDeg}`;
  if (!nativeCache.has(key)) {
    const result = spawnSync('target/release/taup', [String(state.snapshot.source.depthKm), String(state.snapshot.distanceDeg)], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
    assert.equal(result.status, 0, result.stderr);
    nativeCache.set(key, JSON.parse(result.stdout));
    report.nativeChecks.push({geometry: key, sha256: sha256(result.stdout), arrivalCount: nativeCache.get(key).length});
  }
  const order = (a, b) => a.phase.localeCompare(b.phase) || a.ray_param_s_rad - b.ray_param_s_rad;
  const actual = state.snapshot.arrivals.toSorted(order), expected = nativeCache.get(key).toSorted(order);
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < actual.length; index++) {
    assert.equal(actual[index].phase, expected[index].phase);
    near(actual[index].time_s, expected[index].time_s, 1e-7);
    near(actual[index].ray_param_s_rad, expected[index].ray_param_s_rad, 1e-6);
    assert.equal(actual[index].path.length, expected[index].path.length);
  }
}

async function ready(page) {
  await page.waitForFunction(() => window.workbench?.ready || window.workbench?.error, null, {timeout: 60000});
  assert.equal(await page.evaluate(() => window.workbench.error), null);
  return page.evaluate(() => window.workbench.state);
}

async function inspect(page) {
  return page.locator('#waveform').evaluate(svg => {
    const bounds = element => {const box = element.getBBox(); return {x: box.x, y: box.y, width: box.width, height: box.height};};
    const fields = element => ({phase: element.dataset.phase, branch: Number(element.dataset.branch), timeS: Number(element.dataset.timeS)});
    return {
      width: svg.clientWidth, viewWidth: svg.viewBox.baseVal.width,
      labels: [...svg.querySelectorAll('[data-kind="prediction-label"]')].map(element => ({...fields(element), text: element.textContent, bounds: bounds(element)})),
      texts: [...svg.querySelectorAll('text')].map(element => ({text: element.textContent, bounds: bounds(element)})),
      markers: [...svg.querySelectorAll('[data-kind="prediction"]')].map(element => ({...fields(element), x1: Number(element.getAttribute('x1')), x2: Number(element.getAttribute('x2')), y1: Number(element.getAttribute('y1')), y2: Number(element.getAttribute('y2')), width: Number(element.getAttribute('stroke-width')), opacity: Number(element.getAttribute('stroke-opacity')), title: element.querySelector('title')?.textContent})),
      path: svg.querySelector('path[fill="none"]').getAttribute('d'),
      pick: [...svg.querySelectorAll('[data-kind="manual-pick"]')].map(element => ({timeS: Number(element.dataset.timeS), x1: Number(element.getAttribute('x1')), x2: Number(element.getAttribute('x2')), y1: Number(element.getAttribute('y1')), y2: Number(element.getAttribute('y2'))})),
      clock: Number(svg.querySelector('#wave-cursor').dataset.timeS),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
}

async function verifyRecording(page, state, name) {
  compareNative(state);
  const actual = await inspect(page);
  const station = stations.get(state.experiment.stationId), trace = station.trace;
  const phaseArrivals = state.snapshot.arrivals.filter(arrival => arrival.phase === state.experiment.phase);
  const selected = phaseArrivals[state.experiment.branch];
  const origin = state.snapshot.originOffsetS ?? 0;
  const focus = selected ? selected.time_s + origin : station.observed_pick?.offset_s ?? 600;
  const start = trace.start_offset_s, end = start + (trace.samples.length - 1) / trace.sample_rate_hz;
  const [min, max] = state.experiment.waveWindow === 'arrival' ? [Math.max(start, focus - 100), Math.min(end, focus + 160)] : [start, end];
  const width = Math.max(280, actual.width), x = time => 14 + (time - min) / (max - min) * (width - 28);
  const samples = trace.samples.map((value, index) => [start + index / trace.sample_rate_hz, value]).filter(([time]) => time >= min && time <= max);
  const peak = Math.max(1, ...samples.map(([, value]) => Math.abs(value)));
  const expectedPath = samples.map(([time, value], index) => `${index ? 'L' : 'M'}${x(time).toFixed(2)},${(83 - value / peak * 58).toFixed(2)}`).join(' ');
  assert.equal(actual.path, expectedPath, 'The exact pre-repair waveform projection must remain unchanged.');
  assert.equal(actual.viewWidth, width);
  assert.equal(actual.overflow, false);
  assert.equal(actual.clock, state.experiment.timeS);
  const counts = {};
  const expectedMarkers = state.snapshot.arrivals.map(arrival => {
    const branch = counts[arrival.phase] ?? 0;
    counts[arrival.phase] = branch + 1;
    return {phase: arrival.phase, branch, timeS: arrival.time_s + origin};
  }).filter(marker => marker.timeS >= min && marker.timeS <= max);
  assert.deepEqual(actual.markers.map(({phase, branch, timeS}) => ({phase, branch, timeS})), expectedMarkers);
  for (const marker of actual.markers) {
    near(marker.x1, x(marker.timeS)); near(marker.x2, x(marker.timeS));
    assert.equal(marker.y1, 20); assert.equal(marker.y2, 147);
    assert.equal(marker.title, `Model ${marker.phase} · branch ${marker.branch + 1} · ${marker.timeS} s after catalog origin`);
    const chosen = marker.phase === state.experiment.phase && marker.branch === state.experiment.branch;
    assert.equal(marker.width, chosen ? 2.5 : 1.5); assert.equal(marker.opacity, chosen ? 1 : 0.6);
  }
  const pick = station.observed_pick;
  const visiblePick = pick && pick.offset_s >= min && pick.offset_s <= max;
  assert.deepEqual(actual.pick, visiblePick ? [{timeS: pick.offset_s, x1: x(pick.offset_s), x2: x(pick.offset_s), y1: 29, y2: 147}] : []);
  assert.equal(actual.labels.length, 1);
  const label = actual.labels[0];
  const selectedTimeS = selected ? selected.time_s + origin : null;
  const inWindow = selected && selectedTimeS >= min && selectedTimeS <= max;
  const expectedText = !selected ? `No model ${state.experiment.phase} arrival` : !inWindow ? `Model ${state.experiment.phase} outside window` : `Model ${state.experiment.phase} · branch ${state.experiment.branch + 1} of ${phaseArrivals.length}`;
  assert.equal(label.text, expectedText);
  if (selected) {
    assert.equal(label.phase, state.experiment.phase); assert.equal(label.branch, state.experiment.branch); assert.equal(label.timeS, selectedTimeS);
  }
  assert.ok(label.bounds.x >= 0 && label.bounds.y >= 0 && label.bounds.x + label.bounds.width <= width && label.bounds.y + label.bounds.height <= 190, 'The full caption must fit inside the waveform SVG.');
  for (let left = 0; left < actual.texts.length; left++) for (let right = left + 1; right < actual.texts.length; right++) {
    const a = actual.texts[left].bounds, b = actual.texts[right].bounds;
    assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, `${actual.texts[left].text} overlaps ${actual.texts[right].text}.`);
  }
  report.steps.push({name, viewport: page.viewportSize(), stationId: station.id, phase: state.experiment.phase, branch: state.experiment.branch, window: state.experiment.waveWindow, caption: label, markerCount: actual.markers.length, markerHash: sha256(JSON.stringify(expectedMarkers)), waveformHash: sha256(actual.path), pick: actual.pick, clock: actual.clock});
  return actual;
}

try {
  for (let attempt = 0; ; attempt++) {
    assert.equal(server.exitCode, null, 'Our preview exited. Inspect server.log for a port conflict.');
    try {if ((await fetch(url)).ok) break;} catch {}
    assert.ok(attempt < 80, 'Preview did not become ready.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({channel: 'chrome', headless: true});
  for (const width of [1440, 993, 390]) {
    const context = await browser.newContext({viewport: {width, height: width === 390 ? 844 : 1080}, isMobile: width === 390, hasTouch: width === 390, deviceScaleFactor: 1});
    contexts.add(context);
    await context.tracing.start({screenshots: true, snapshots: true});
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(String(error)));
    page.on('console', message => {if (message.type() === 'error') report.errors.push(message.text());});
    await page.goto(url); await ready(page);
    await page.getByLabel('Recording station', {exact: true}).selectOption('IU.TATO.00.BHZ');
    let state = await ready(page);
    assert.equal(state.snapshot.arrivals.filter(arrival => arrival.phase === 'P').length, 3);
    assert.equal(state.snapshot.arrivals.filter(arrival => arrival.phase === 'S').length, 7);
    for (const waveWindow of ['full', 'arrival']) {
      if (state.experiment.waveWindow !== waveWindow) {await page.locator('#wave-window').click(); state = await ready(page);}
      for (const [phase, branchCount] of [['P', 3], ['S', 7]]) {
        await page.getByLabel('Seismic phase', {exact: true}).selectOption(phase); state = await ready(page);
        assert.equal(await page.locator('#branch option').count(), branchCount);
        for (let branch = 0; branch < branchCount; branch++) {
          await page.getByLabel('Arrival branch', {exact: true}).selectOption(String(branch)); state = await ready(page);
          assert.equal(state.experiment.branch, branch);
          await verifyRecording(page, state, `TATO ${phase} branch ${branch + 1}, ${waveWindow}`);
        }
      }
      await page.locator('#waveform').screenshot({path: path.join(evidenceDir, `${width}-tato-${waveWindow}.png`)});
    }
    await page.locator('[data-mode="explore"]').click(); await ready(page);
    await page.locator('#core-example').click(); state = await ready(page);
    assert.equal(state.experiment.phase, 'PKIKP');
    assert.equal(state.experiment.stationId, 'IU.LVC.00.BHZ');
    for (const waveWindow of ['full', 'arrival']) {
      if (state.experiment.waveWindow !== waveWindow) {await page.locator('#wave-window').click(); state = await ready(page);}
      await verifyRecording(page, state, `PKIKP longest phase caption, ${waveWindow}`);
    }
    await page.locator('#waveform').screenshot({path: path.join(evidenceDir, `${width}-pkikp.png`)});
    await page.getByLabel('Seismic phase', {exact: true}).selectOption('S'); state = await ready(page);
    await verifyRecording(page, state, 'Unsupported S preserves recording and does not borrow another phase');
    if (state.experiment.waveWindow !== 'full') {await page.locator('#wave-window').click(); state = await ready(page);}
    await page.getByLabel('Replay time in seconds after catalog origin', {exact: true}).fill('620'); await ready(page);
    const before = await inspect(page);
    await page.locator('#advanced summary').click();
    await page.locator('#depth').fill('29'); await page.locator('#distance').fill('110');
    const pending = await page.locator('#calculate-radial').evaluate(button => {
      button.click();
      const svg = document.getElementById('waveform');
      return {pending: window.workbench.state.pending, labels: [...svg.querySelectorAll('[data-kind="prediction-label"]')].map(label => ({text: label.textContent, phase: label.dataset.phase, timeS: label.dataset.timeS})), markerCount: svg.querySelectorAll('[data-kind="prediction"]').length, path: svg.querySelector('path[fill="none"]').getAttribute('d'), clock: Number(svg.querySelector('#wave-cursor').dataset.timeS)};
    });
    assert.equal(pending.pending, true); assert.equal(pending.markerCount, 0);
    assert.deepEqual(pending.labels, [{text: 'Updating model…', phase: undefined, timeS: undefined}]);
    assert.equal(pending.path, before.path); assert.equal(pending.clock, 620);
    report.steps.push({name: 'Pending calculation suppresses stale model labels and exact lines', viewport: page.viewportSize(), waveformHash: sha256(pending.path), clock: pending.clock});
    state = await ready(page); await verifyRecording(page, state, 'Completed empty geometry preserves trace and explicit absent-phase caption');
    await context.tracing.stop({path: path.join(evidenceDir, `${width}-trace.zip`)});
    await context.close(); contexts.delete(context);
  }
  assert.deepEqual(report.errors, []);
  report.verdict = 'PASS';
} catch (error) {
  report.verdict = 'FAIL'; report.errors.push(error.stack || String(error)); process.exitCode = 1;
} finally {
  for (const context of contexts) {
    await context.tracing.stop({path: path.join(evidenceDir, 'failure-trace.zip')});
    await context.close();
  }
  if (browser) await browser.close();
  if (server.exitCode === null) {const exited = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await exited;}
  fs.closeSync(log);
  report.finishedAt = new Date().toISOString(); report.serverExitCode = server.exitCode; report.serverSignal = server.signalCode;
  fs.writeFileSync(path.join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({verdict: report.verdict, checks: report.steps.length, errors: report.errors, evidenceDir}, null, 2));
}
