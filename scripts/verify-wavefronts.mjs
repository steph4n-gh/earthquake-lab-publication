#!/usr/bin/env node
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {stripVTControlCharacters} from 'node:util';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';

const evidenceDir = path.resolve(process.env.TAUP_EVIDENCE || '.audit/wavefronts/browser');
const port = Number(process.env.TAUP_PORT || 5197);
const url = `http://127.0.0.1:${port}/`;
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const filesIn = directory => fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesIn(path.join(directory, entry.name)) : [path.join(directory, entry.name)]) : [];
const sourceFiles = ['scripts/verify-wavefronts.mjs', 'scripts/verify-assets.mjs', 'package.json', 'package-lock.json', 'index.html', 'fixtures/iasp91.json', 'fixtures/investigation/tohoku-investigation.json', 'fixtures/investigation/manifest.json', 'fixtures/observed/tohoku-2011.json', 'fixtures/observed/manifest.json', 'fixtures/events/maule-2010/case.json', 'fixtures/events/maule-2010/manifest.json', 'fixtures/events/okhotsk-2013/case.json', 'fixtures/events/okhotsk-2013/manifest.json', 'crates/taup-core/src/lib.rs', 'crates/taup-core/src/bin/taup.rs', 'target/release/taup', 'web/pkg/taup_core_bg.wasm', ...filesIn('web').filter(file => /\.(js|css)$/.test(file)), ...filesIn('fixtures/earth')];
fs.mkdirSync(evidenceDir, { recursive: true });
const report = {
  startedAt: new Date().toISOString(), url, steps: [], errors: [], windowErrors: [], nativeFans: [],
  hashes: Object.fromEntries(sourceFiles.map(file => [file, sha256(fs.readFileSync(file))])),
  assets: Object.fromEntries(filesIn('dist').map(file => [file, sha256(fs.readFileSync(file))])),
  contracts: {
    geometry: 'Rendered vertex coordinates are compared with an independently executed native ray-parameter fan at the same source depth. Independent ObsPy qualification belongs to the separate reference gate.',
    clock: 'The catalog-origin clock drives the real waveform cursor, record-section cursor, exact model station cues, and origin-adjusted front time.',
    gaps: 'Only adjacent live rays in one native legal segment can form a surface. Explicit omitted intervals and expired rays break adjacency.',
  },
  limitations: ['A 390-pixel touch-enabled desktop Chrome context is not a physical-phone test.', 'This focused check does not replace the original investigation, atlas, globe, or frozen numerical gates.'],
};
const cases = Object.fromEntries([['tohoku-2011', 'fixtures/investigation/tohoku-investigation.json'], ['maule-2010', 'fixtures/events/maule-2010/case.json'], ['okhotsk-2013', 'fixtures/events/okhotsk-2013/case.json']].map(([key, file]) => [key, JSON.parse(fs.readFileSync(file))]));
const legacyCoreStation = JSON.parse(fs.readFileSync('fixtures/observed/tohoku-2011.json')).traces.find(trace => trace.station === 'LVC');
cases['tohoku-2011'].stations.push(legacyCoreStation);
const nativeCache = new Map();
const nativeRootCache = new Map();
function nativeRoots(depthKm, distanceDeg) {
  const key = `${depthKm}/${distanceDeg}`;
  if (!nativeRootCache.has(key)) {
    const result = spawnSync('target/release/taup', [String(depthKm), String(distanceDeg)], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr);
    nativeRootCache.set(key, JSON.parse(result.stdout));
  }
  return nativeRootCache.get(key);
}
function nativeFan(depthKm) {
  if (!nativeCache.has(depthKm)) {
    const result = spawnSync('target/release/taup', ['--wavefront-fan', String(depthKm)], { encoding: 'utf8', maxBuffer: 96 * 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr);
    const fan = JSON.parse(result.stdout);
    assert.equal(fan.depth_km, depthKm);
    const file = `native-fan-${String(depthKm).replace('.', '-')}.json`;
    fs.writeFileSync(path.join(evidenceDir, file), result.stdout);
    report.nativeFans.push({ depthKm, file, sha256: sha256(result.stdout), segments: fan.segments.length, rays: fan.segments.reduce((sum, segment) => sum + segment.rays.length, 0), gaps: fan.gaps.length });
    nativeCache.set(depthKm, fan);
  }
  return nativeCache.get(depthKm);
}
function near(actual, expected, tolerance = 1e-8, label = 'value') {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label} is ${actual}; expected ${expected} within ${tolerance}.`);
}
function unit(position) {
  const latitude = position.latitudeDeg * Math.PI / 180;
  const longitude = position.longitudeDeg * Math.PI / 180;
  return [Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), Math.cos(latitude) * Math.sin(longitude)];
}
function raySample(ray, timeS) {
  assert.ok(timeS >= 0 && timeS <= ray.time_s, 'A sampled ray must not exist outside its finite lifetime.');
  const index = ray.path.findIndex(point => point.time_s >= timeS);
  assert.ok(index >= 0, 'The native cumulative path brackets the rendered time.');
  const left = ray.path[Math.max(0, index - 1)], right = ray.path[index];
  const fraction = right.time_s > left.time_s ? (timeS - left.time_s) / (right.time_s - left.time_s) : 0;
  const radiusLeft = (6371 - left.depth_km) / 6371, radiusRight = (6371 - right.depth_km) / 6371;
  const axialLeft = radiusLeft * Math.cos(left.distance_rad), axialRight = radiusRight * Math.cos(right.distance_rad);
  const radialLeft = radiusLeft * Math.sin(left.distance_rad), radialRight = radiusRight * Math.sin(right.distance_rad);
  const axial = axialLeft + fraction * (axialRight - axialLeft), radial = radialLeft + fraction * (radialRight - radialLeft);
  return { distanceRad: Math.atan2(radial, axial), depthKm: 6371 * (1 - Math.hypot(axial, radial)), pathDistanceRad: left.distance_rad + fraction * (right.distance_rad - left.distance_rad), pathDepthKm: left.depth_km + fraction * (right.depth_km - left.depth_km) };
}
function note(action, state, proof = {}) {
  report.steps.push({ action, event: state.investigation.key, experiment: state.experiment, source: state.snapshot?.source, ...proof });
}
let browser, page, context;
const contexts = new Set();
const log = fs.openSync(path.join(evidenceDir, 'server.log'), 'w');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', log, log] });
async function newContext(name, mobile = false, viewport) {
  const owned = await browser.newContext({ viewport: viewport ?? (mobile ? { width: 390, height: 844 } : { width: 1440, height: 1080 }), isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  contexts.add(owned);
  await owned.addInitScript(() => addEventListener('error', event => console.error('[wavefront-window-error]', event.message, event.filename, event.lineno)));
  await owned.tracing.start({ screenshots: true, snapshots: true });
  const target = await owned.newPage();
  target.on('pageerror', error => report.errors.push(String(error)));
  target.on('console', message => {
    if (message.type() !== 'error') return;
    if (message.text().startsWith('[wavefront-window-error]')) report.windowErrors.push(message.text());
    else report.errors.push(message.text());
  });
  owned.proofName = name;
  return { context: owned, page: target };
}
async function closeContext(owned) {
  await owned.tracing.stop({ path: path.join(evidenceDir, `${owned.proofName}-trace.zip`) });
  await owned.close();
  contexts.delete(owned);
}
async function ready(target = page, eventKey) {
  await target.waitForFunction(key => (window.workbench?.ready || window.workbench?.error) && (!key || window.workbench.state.investigation.key === key), eventKey, { timeout: 60000 });
  assert.equal(await target.evaluate(() => window.workbench.error), null);
  return target.evaluate(() => window.workbench.state);
}
async function globeReady(target = page) {
  const state = await ready(target);
  await expect(target.locator('#earth-globe')).toBeVisible();
  await expect(target.locator('#earth-globe')).toHaveAttribute('data-globe-status', 'ready');
  await expect(target.locator('#earth-globe')).toHaveAttribute('data-earth-texture', 'ready', { timeout: 30000 });
  await target.evaluate(() => document.fonts.ready);
  return state;
}
async function front(target = page) {
  return target.locator('#earth-globe').evaluate(canvas => JSON.parse(canvas.dataset.wavefronts));
}
async function scrub(timeS, target = page) {
  const rounded = Math.round(timeS * 10) / 10;
  await target.getByLabel('Replay time in seconds after catalog origin', { exact: true }).fill(String(rounded));
  const state = await ready(target);
  near(state.experiment.timeS, rounded, 1e-10, 'shared playback clock');
  near(Number(await target.locator('#earth-globe').getAttribute('data-playback-time-s')), rounded, 1e-10, 'globe playback clock');
  near(Number(await target.locator('#wave-cursor').getAttribute('data-time-s')), rounded, 1e-10, 'selected recording clock');
  near(Number(await target.locator('[data-kind="record-cursor"]').getAttribute('data-time-s')), rounded, 1e-10, 'record-section clock');
  return state;
}
async function capture(name, target = page) {
  await target.mouse.move(2, 2);
  await target.locator('#earth-globe').screenshot({ path: path.join(evidenceDir, `${name}-globe.png`) });
  await target.screenshot({ path: path.join(evidenceDir, `${name}.png`), fullPage: true });
}
async function switchEvent(key, target = page) {
  await target.getByLabel('Earthquake investigation', { exact: true }).selectOption(key);
  const state = await ready(target, key);
  assert.equal(state.experiment.context.kind, 'replay');
  return state;
}
async function share(target = page) {
  const state = await ready(target);
  await target.getByRole('button', { name: 'Share experiment', exact: false }).click();
  await expect(target.getByLabel('Reproducible experiment URL')).toHaveValue(target.url());
  return { state, url: await target.getByLabel('Reproducible experiment URL').inputValue() };
}
async function overflow(target = page) {
  const sizes = await target.evaluate(() => ({ viewport: innerWidth, client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.equal(sizes.scroll, sizes.client, 'The complete page must not scroll horizontally.');
  return sizes;
}
async function orbit(target = page, touch = false) {
  const canvas = target.locator('#earth-globe');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  const x = box.x + box.width * 0.36, y = box.y + box.height * 0.54;
  const before = await canvas.getAttribute('data-camera-azimuth');
  if (touch) {
    const session = await target.context().newCDPSession(target);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 12; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + box.width * 0.27 * step / 12, y: y + 18 * step / 12 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await target.mouse.move(x, y);
    await target.mouse.down();
    await target.mouse.move(x + box.width * 0.27, y + 18, { steps: 12 });
    await target.mouse.up();
  }
  const after = await canvas.getAttribute('data-camera-azimuth');
  assert.ok(Math.abs(Number(after) - Number(before)) > 10, 'A real gesture must rotate the globe.');
  return { before: Number(before), after: Number(after) };
}
function stationDistance(state, stationId) {
  const station = cases[state.investigation.key].stations.find(station => station.id === stationId);
  assert.ok(station, 'The station has immutable independently retained geographic metadata.');
  const a = unit(state.snapshot.source), b = unit({latitudeDeg: station.latitude_deg, longitudeDeg: station.longitude_deg});
  const dot = a.reduce((sum, value, axis) => sum + value * b[axis], 0);
  const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return Math.atan2(Math.hypot(...cross), dot) * 180 / Math.PI;
}
function nativeAnchors(state) {
  return [...state.snapshot.stationArrivals.flatMap(station => {
    const distance = stationDistance(state, station.stationId);
    near(station.distanceDeg, distance, 1e-9, 'independent source-to-real-station angle');
    const roots = nativeRoots(state.snapshot.source.depthKm, station.distanceDeg);
    assert.equal(station.arrivals.length, roots.length, 'Every exact real-station root remains present.');
    const branches = {};
    roots.forEach((root, index) => {
      const arrival = station.arrivals[index];
      assert.equal(arrival.phase, root.phase);
      assert.equal(arrival.branch, branches[root.phase] ?? 0); branches[root.phase] = (branches[root.phase] ?? 0) + 1;
      near(arrival.timeS, root.time_s, 1e-7, 'independent real-station travel time');
    });
    return roots;
  }), ...nativeRoots(state.snapshot.source.depthKm, state.snapshot.distanceDeg)];
}
function mergedSegments(fan, anchors) {
  return fan.segments.map(segment => {
    const minimum = segment.rays[0].ray_param_s_rad, maximum = segment.rays.at(-1).ray_param_s_rad;
    const rays = [...segment.rays, ...anchors.filter(ray => ray.phase === segment.phase && ray.ray_param_s_rad >= minimum && ray.ray_param_s_rad <= maximum && !fan.gaps.some(gap => gap.phase === ray.phase && ray.ray_param_s_rad > gap.lower_p_s_rad && ray.ray_param_s_rad < gap.upper_p_s_rad))].sort((a, b) => a.ray_param_s_rad - b.ray_param_s_rad);
    return { phase: segment.phase, rays: rays.filter((ray, index) => !index || ray.ray_param_s_rad - rays[index - 1].ray_param_s_rad > 1e-9) };
  });
}
function positionAt(source, receiver, sample, azimuth = 0) {
  const start = unit(source), end = unit(receiver);
  const cosine = start.reduce((sum, value, axis) => sum + value * end[axis], 0);
  const direction = end.map((value, axis) => value - cosine * start[axis]);
  const length = Math.hypot(...direction);
  const along = direction.map(value => value / length);
  const across = [start[1] * along[2] - start[2] * along[1], start[2] * along[0] - start[0] * along[2], start[0] * along[1] - start[1] * along[0]];
  const radius = (6371 - sample.depthKm) / 6371;
  return start.map((value, axis) => radius * (Math.cos(sample.distanceRad) * value + Math.sin(sample.distanceRad) * (Math.cos(azimuth) * along[axis] - Math.sin(azimuth) * across[axis])));
}
function cutContours(source, receiver, left, right) {
  const start = unit(source), end = unit(receiver);
  const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
  const cosine = dot(start, end);
  const direction = end.map((value, axis) => value - cosine * start[axis]);
  const along = direction.map(value => value / Math.hypot(...direction));
  const normal = [along[1] * start[2] - along[2] * start[1], along[2] * start[0] - along[0] * start[2], along[0] * start[1] - along[1] * start[0]];
  const middleVector = start.map((value, axis) => value + end[axis]);
  const middle = middleVector.map(value => value / Math.hypot(...middleVector));
  const result = [];
  function append(face, firstAzimuth, secondAzimuth) {
    if (!Number.isFinite(firstAzimuth) || !Number.isFinite(secondAzimuth)) return;
    const a = positionAt(source, receiver, left, firstAzimuth), b = positionAt(source, receiver, right, secondAzimuth);
    const keep = face === 0 ? middle : normal;
    if (dot(a, keep) < -1e-8 || dot(b, keep) < -1e-8) return;
    result.push({face, azimuths: [firstAzimuth, secondAzimuth], start: a, end: b});
  }
  append(0, 0, 0); append(0, Math.PI, Math.PI);
  const wallAzimuth = sample => {
    const constant = Math.cos(sample.distanceRad) * dot(start, middle);
    const coefficient = Math.sin(sample.distanceRad) * dot(along, middle);
    const cosine = -constant / coefficient;
    return Math.abs(cosine) <= 1 ? Math.acos(cosine) : NaN;
  };
  const first = wallAzimuth(left), second = wallAzimuth(right);
  append(1, first, second); append(1, -first, -second);
  return result;
}
function checkCompactGeometry(state, render) {
  const fan = nativeFan(state.snapshot.source.depthKm);
  const segments = mergedSegments(fan, nativeAnchors(state));
  near(render.catalogTimeS, state.experiment.timeS, 1e-9, 'front catalog time');
  near(render.timeS, state.experiment.timeS - state.snapshot.originOffsetS, 1e-9, 'origin-adjusted front time');
  assert.equal(render.depthKm, fan.depth_km);
  assert.equal(render.policy, fan.policy);
  assert.equal(render.rayCount, fan.segments.reduce((sum, segment) => sum + segment.rays.length, 0));
  assert.equal(render.modelIdentity, '2a64bd69790c69168c61a7de0d8048af5ce1e26064efedc6e7d89f9dfbc72971');
  assert.deepEqual(render.phases.map(item => item.phase), ['P', 'S', 'PKIKP']);
  let checkedSamples = 0;
  let activeRays = 0;
  let triangles = 0;
  let contours = 0;
  for (const phase of render.phases) {
    const matching = segments.filter(segment => segment.phase === phase.phase);
    const expectedActive = matching.reduce((sum, segment) => sum + segment.rays.filter(ray => render.timeS >= 0 && render.timeS <= ray.time_s).length, 0);
    const expectedAdjacent = matching.reduce((sum, segment) => sum + segment.rays.slice(1).filter((ray, index) => render.timeS >= 0 && render.timeS <= ray.time_s && render.timeS <= segment.rays[index].time_s).length, 0);
    assert.equal(phase.activeRayCount, expectedActive, `${phase.phase} active rays must expire individually.`);
    assert.equal(phase.triangleCount, render.visible ? expectedAdjacent * 48 * 2 : 0, `${phase.phase} mesh triangle count follows legal live adjacency.`);
    const expectedContours = !render.visible || !state.experiment.cutaway ? 0 : matching.reduce((sum, segment) => sum + segment.rays.slice(1).reduce((count, ray, index) => count + (render.timeS >= 0 && render.timeS <= ray.time_s && render.timeS <= segment.rays[index].time_s ? cutContours(state.snapshot.source, state.snapshot.receiver, raySample(segment.rays[index], render.timeS), raySample(ray, render.timeS)).length : 0), 0), 0);
    assert.equal(phase.contourSegmentCount, expectedContours, `${phase.phase} contours intersect both cut walls using legal live adjacency.`);
    for (const sample of phase.samples) {
      const segment = segments[sample.segmentIndex];
      assert.equal(segment.phase, phase.phase);
      const ray = segment.rays.find(ray => Math.abs(ray.ray_param_s_rad - sample.rayParamSRad) < 1e-6);
      assert.ok(ray, 'The rendered sample comes from an independently executed native fan or station anchor.');
      const expected = raySample(ray, render.timeS);
      near(sample.timeS, render.timeS, 1e-9, 'sample clock');
      near(sample.endTimeS, ray.time_s, 1e-6, 'sample expiry');
      near(sample.distanceRad, expected.distanceRad, 1e-7, 'native sample angle');
      near(sample.depthKm, expected.depthKm, 0.001, 'rendered Cartesian chord depth');
      near(sample.pathDepthKm, expected.pathDepthKm, 1e-6, 'separate polar path-data depth');
      near(sample.pathDistanceRad, expected.pathDistanceRad, 1e-9, 'separate polar path-data angle');
      near(sample.renderedRadius, Math.hypot(...sample.modelPosition), 1e-9, 'actual vertex radius');
      const position = positionAt(state.snapshot.source, state.snapshot.receiver, expected);
      position.forEach((coordinate, axis) => near(sample.modelPosition[axis], coordinate, 3e-7, 'actual Float32 front vertex'));
      checkedSamples++;
    }
    for (const edge of phase.adjacencies) {
      const segment = segments[edge.segmentIndex];
      assert.equal(segment.phase, phase.phase);
      const left = segment.rays.findIndex(ray => Math.abs(ray.ray_param_s_rad - edge.parameters[0]) < 1e-6);
      assert.ok(left >= 0 && left + 1 < segment.rays.length, 'A rendered edge belongs to one native legal segment.');
      near(edge.parameters[1], segment.rays[left + 1].ray_param_s_rad, 1e-6, 'native adjacent ray parameter');
      edge.endTimesS.forEach(time => assert.ok(time >= render.timeS, 'An expired ray must not be attached to a live ray.'));
    }
    activeRays += expectedActive; triangles += phase.triangleCount; contours += phase.contourSegmentCount;
  }
  return { depthKm: fan.depth_km, rayTimeS: render.timeS, activeRays, triangles, contours, checkedSamples, explicitGaps: fan.gaps.length };
}
async function recordingEvidence(target = page) {
  return target.evaluate(() => ({
    waveformPath: [...document.querySelectorAll('#waveform > path')].map(node => node.getAttribute('d')),
    manual: [...document.querySelectorAll('[data-kind="manual-pick"], [data-kind="archived-pick"]')].map(node => ({ kind: node.dataset.kind, stationId: node.dataset.stationId ?? null, timeS: node.dataset.timeS })),
    recordPaths: [...document.querySelectorAll('[data-kind="recording-counts"]')].map(node => ({stationId: node.parentElement.dataset.stationId, path: node.getAttribute('d')})),
  }));
}
function cueFor(render, stationId, phase, branch) {
  const cue = render.stationCues.find(cue => cue.stationId === stationId && cue.phase === phase && cue.branch === branch);
  assert.ok(cue, `Exact ${stationId} ${phase} branch ${branch} station cue is present.`);
  return cue;
}
function checkCue(cue, timeS, travelTimeS, originOffsetS) {
  const catalogTimeS = travelTimeS + originOffsetS;
  near(cue.travelTimeS, travelTimeS, 1e-8, 'exact station travel time');
  near(cue.catalogTimeS, catalogTimeS, 1e-8, 'catalog-relative station arrival');
  const elapsed = timeS - catalogTimeS;
  assert.equal(cue.reached, elapsed >= 0, 'The reached state is derived from the current clock.');
  near(cue.pulse, elapsed >= 0 && elapsed < 24 ? 1 - elapsed / 24 : 0, 1e-9, 'station pulse envelope');
}
async function checkBuffers(name, state, render, target = page) {
  const fan = nativeFan(state.snapshot.source.depthKm);
  const expected = mergedSegments(fan, nativeAnchors(state));
  const actual = await target.evaluate(() => window.workbench.frontGeometry());
  assert.equal(actual.length, expected.length, 'Every legal native segment has its own geometry.');
  let vertices = 0, triangles = 0, contours = 0;
  for (const item of actual) {
    const segment = expected[item.segmentIndex];
    assert.equal(item.phase, segment.phase);
    assert.equal(item.rings, 49);
    assert.equal(item.azimuthSteps, 48);
    assert.equal(item.rays.length, segment.rays.length, 'The surface contains the native fan plus independently checked station anchors.');
    assert.equal(item.positions.length, segment.rays.length * 49 * 3);
    for (let index = 0; index < item.rays.length; index++) {
      const ray = segment.rays[index];
      const observed = item.rays[index];
      near(observed.rayParamSRad, ray.ray_param_s_rad, 1e-6, 'actual buffer ray parameter');
      near(observed.endTimeS, ray.time_s, 1e-6, 'actual buffer expiry');
      const active = render.timeS >= 0 && render.timeS <= ray.time_s;
      assert.equal(observed.active, active, 'Actual vertex activity honors each native endpoint.');
      if (!active) continue;
      const sample = raySample(ray, render.timeS);
      for (let azimuth = 0; azimuth <= 48; azimuth++) {
        const position = positionAt(state.snapshot.source, state.snapshot.receiver, sample, azimuth / 48 * Math.PI * 2);
        const offset = (index * 49 + azimuth) * 3;
        position.forEach((value, axis) => near(axis === 2 ? -item.positions[offset + axis] : item.positions[offset + axis], value, 3e-7, 'actual uploaded front vertex'));
        vertices++;
      }
    }
    const expectedIndices = [];
    const expectedContours = [];
    for (let index = 1; index < segment.rays.length; index++) {
      if (render.timeS < 0 || render.timeS > segment.rays[index - 1].time_s || render.timeS > segment.rays[index].time_s) continue;
      if (render.visible) for (let azimuth = 0; azimuth < 48; azimuth++) {
        const a = (index - 1) * 49 + azimuth, b = index * 49 + azimuth;
        expectedIndices.push(a, b, a + 1, a + 1, b, b + 1);
      }
      if (render.visible && state.experiment.cutaway) for (const contour of cutContours(state.snapshot.source, state.snapshot.receiver, raySample(segment.rays[index - 1], render.timeS), raySample(segment.rays[index], render.timeS))) expectedContours.push({...contour, rayIndices: [index - 1, index]});
    }
    assert.equal(item.drawRange.start, 0);
    assert.equal(item.drawRange.count, expectedIndices.length);
    assert.deepEqual(item.indices, expectedIndices, 'Every actual triangle joins immediate live neighbors within one legal native segment.');
    assert.equal(item.contourCount, expectedContours.length);
    assert.equal(item.contours.length, expectedContours.length);
    item.contours.forEach((contour, index) => {
      assert.equal(contour.face, expectedContours[index].face, 'Actual contour belongs to the independently intersected cut wall.');
      assert.deepEqual(contour.rayIndices, expectedContours[index].rayIndices);
      contour.azimuths.forEach((value, axis) => near(value, expectedContours[index].azimuths[axis], 1e-8, 'cut-wall intersection azimuth'));
      for (const endpoint of ['start', 'end']) expectedContours[index][endpoint].forEach((value, axis) => near(axis === 2 ? -contour[endpoint][axis] : contour[endpoint][axis], value, 3e-7, 'actual cut-contour buffer endpoint'));
    });
    triangles += item.indices.length / 3; contours += item.contourCount;
  }
  const bytes = gzipSync(JSON.stringify(actual));
  const file = `${name}-buffers.json.gz`;
  fs.writeFileSync(path.join(evidenceDir, file), bytes);
  return { segments: actual.length, vertices, triangles, contours, file, sha256: sha256(bytes) };
}
async function checkRecordingCue(state, stationId, phase, branch, target = page) {
  const summary = state.snapshot.stationArrivals.find(station => station.stationId === stationId);
  const arrival = summary.arrivals.find(arrival => arrival.phase === phase && arrival.branch === branch);
  near(summary.distanceDeg, stationDistance(state, stationId), 1e-9, 'independent cue station angle');
  const native = nativeRoots(state.snapshot.source.depthKm, summary.distanceDeg).filter(arrival => arrival.phase === phase)[branch];
  assert.ok(native, 'The cue branch exists in the independently executed native model.');
  near(arrival.timeS, native.time_s, 1e-7, 'independent cue travel time');
  const render = await front(target);
  const cue = cueFor(render, stationId, phase, branch);
  checkCue(cue, state.experiment.timeS, arrival.timeS, state.snapshot.originOffsetS);
  const button = target.locator(`[data-station-arrival][data-station-id="${stationId}"][data-phase="${phase}"]`);
  near(Number(await button.getAttribute('data-time-s')), cue.catalogTimeS, 1e-8, 'public arrival time');
  near(Number(await button.getAttribute('data-pulse')), cue.pulse, 1e-9, 'visible arrival pulse');
  await expect(button).toHaveAttribute('data-reached', String(cue.reached));
  const recordPrediction = target.locator(`[data-kind="record-prediction"][data-station-id="${stationId}"][data-phase="${phase}"][data-branch="${branch}"]`);
  near(Number(await recordPrediction.getAttribute('data-time-s')), cue.catalogTimeS, 1e-8, 'record-section exact arrival time');
  await expect(recordPrediction).toHaveAttribute('data-reached', String(cue.reached));
  const waveformPrediction = target.locator(`#waveform [data-kind="prediction"][data-phase="${phase}"]`).first();
  near(Number(await waveformPrediction.getAttribute('data-time-s')), cue.catalogTimeS, 1e-8, 'selected waveform exact arrival time');
  const expectedPulse = Math.max(0, ...summary.arrivals.map(arrival => {
    const elapsed = state.experiment.timeS - state.snapshot.originOffsetS - arrival.timeS;
    return elapsed >= 0 && elapsed < 24 ? 1 - elapsed / 24 : 0;
  }));
  const row = target.locator(`[data-kind="record-row"][data-station-id="${stationId}"]`);
  near(Number(await row.getAttribute('data-pulse')), expectedPulse, 1e-9, 'real recording row pulse');
  return cue;
}
async function geometry(name, state, target = page) {
  const render = await front(target);
  const compact = checkCompactGeometry(state, render);
  const buffers = await checkBuffers(name, state, render, target);
  return { render, proof: { ...compact, buffers } };
}
async function radial(depthKm, distanceDeg, target = page, wait = true) {
  if (await target.locator('#advanced').getAttribute('open') === null) await target.locator('#advanced > summary').click();
  await target.getByLabel('Source depth', { exact: false }).fill(String(depthKm));
  await target.getByLabel('Receiver distance', { exact: false }).fill(String(distanceDeg));
  await target.getByRole('button', { name: 'Calculate geometry', exact: true }).click();
  return wait ? ready(target) : null;
}
async function observeReplacement(target, duration = 90) {
  return target.evaluate(async duration => {
    const rows = [];
    for (let frame = 0; frame < duration; frame++) {
      const state = window.workbench?.state;
      const canvas = document.querySelector('#earth-globe');
      if (state && canvas) {
        const render = canvas.dataset.wavefronts ? JSON.parse(canvas.dataset.wavefronts) : null;
        rows.push({ event: state.investigation.key, ready: window.workbench.ready, pending: state.pending, fanPending: state.fanPending, contextDepth: state.experiment.context.depthKm, source: state.snapshot?.source ?? null, fanDepth: state.fan?.depthKm ?? null, visible: render?.visible ?? false, renderDepth: render?.depthKm ?? null, preparationCount: state.fanPreparationCount, stats: state.stats });
      }
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return rows;
  }, duration);
}
function checkReplacement(rows, finalEvent) {
  assert.ok(rows.length > 20, 'Replacement observation includes actual browser frames.');
  for (const row of rows) {
    if (row.visible) {
      assert.ok(row.source, 'A visible front has a current atomic source snapshot.');
      near(row.renderDepth, row.source.depthKm, 1e-9, 'no stale rendered front depth');
      near(row.fanDepth, row.source.depthKm, 1e-9, 'no stale prepared front depth');
    }
    if (row.ready) assert.ok(row.source && row.fanDepth === row.source.depthKm, 'Ready includes the current front depth.');
  }
  for (const row of rows) if (row.source) {
    near(row.source.latitudeDeg, cases[row.event].event.latitude_deg, 1e-9, 'current event source latitude');
    near(row.source.longitudeDeg, cases[row.event].event.longitude_deg, 1e-9, 'current event source longitude');
  }
  assert.equal(rows.at(-1).event, finalEvent);
}

try {
  for (let attempt = 0; ; attempt++) {
    assert.equal(server.exitCode, null, 'The owned preview exited. Inspect server.log.');
    if (stripVTControlCharacters(fs.readFileSync(path.join(evidenceDir, 'server.log'), 'utf8')).includes('Local:')) {
      const response = await fetch(url);
      assert.equal(response.status, 200);
      assert.ok((await response.text()).includes('Earthquake Lab'));
      break;
    }
    assert.ok(attempt < 100, 'The owned preview did not become ready.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  report.runtime = { node: process.version, chrome: browser.version(), platform: process.platform, architecture: process.arch, desktop: { width: 1440, height: 1080, dpr: 1 }, touch: { width: 390, height: 844, dpr: 1 }, physicalMobile: false };
  ({ context, page } = await newContext('desktop'));
  await page.goto(url);
  let state = await globeReady();
  assert.equal(state.investigation.key, 'tohoku-2011');
  assert.equal(state.experiment.wavefronts, true);
  await expect(page.locator('#wavefronts')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#wavefront-status')).toContainText('sampled rays');
  await page.getByRole('button', { name: 'Open Earth', exact: true }).click();
  state = await scrub(320);
  let checked = await geometry('desktop-320', state);
  assert.ok(checked.proof.triangles > 10000 && checked.proof.contours > 100, 'The actual front has substantial visible surfaces and cut-plane contours.');
  await capture('desktop-320');
  note('Open a textured cut Earth and compare every submitted front vertex, triangle, and contour with independent native calculations', state, checked.proof);

  const rewindGeometry = checked.render.phases;
  const timeProofs = [];
  for (const timeS of [-1, 120, 520, 900]) {
    state = await scrub(timeS);
    checked = await geometry(`desktop-time-${String(timeS).replace('-', 'minus')}`, state);
    if (timeS < 0) assert.equal(checked.proof.triangles, 0);
    if (timeS === 900) await capture('desktop-late');
    timeProofs.push(checked.proof);
  }
  const fan = nativeFan(state.snapshot.source.depthKm);
  const expiryTime = fan.segments.filter(segment => segment.phase === 'P').flatMap(segment => segment.rays).map(ray => ray.time_s).filter(time => time > 5 && time < 1000).sort((a, b) => a - b)[0];
  for (const timeS of [Math.floor(expiryTime * 10) / 10 - 0.1, Math.ceil(expiryTime * 10) / 10 + 0.1]) {
    state = await scrub(timeS);
    checked = await geometry(`desktop-expiry-${state.experiment.timeS}`, state);
    timeProofs.push(checked.proof);
  }
  state = await scrub(320);
  checked = await geometry('desktop-rewind', state);
  assert.deepEqual(checked.render.phases, rewindGeometry, 'Seeking backward exactly restores the prior front geometry.');
  note('Preserve gaps before origin, expire actual rays at individual surface endpoints, and rebuild the same front after rewind', state, { expiryTime, times: timeProofs, rewind: checked.proof });

  const prepared = await front();
  const calculationCount = state.stats.completed;
  await page.getByLabel('Playback speed', { exact: true }).selectOption('30');
  await page.getByRole('button', { name: 'Play earthquake replay', exact: true }).click();
  await page.waitForFunction(time => window.workbench.state.experiment.timeS > time + 5, state.experiment.timeS);
  await page.getByRole('button', { name: 'Pause earthquake replay', exact: true }).click();
  state = await ready();
  near((await front()).timeS, state.experiment.timeS - state.snapshot.originOffsetS, 1e-9, 'live front shared clock');
  near(Number(await page.locator('#wave-cursor').getAttribute('data-time-s')), state.experiment.timeS, 1e-9, 'live waveform shared clock');
  near(Number(await page.locator('[data-kind="record-cursor"]').getAttribute('data-time-s')), state.experiment.timeS, 1e-9, 'live record-section shared clock');
  assert.equal(state.stats.completed, calculationCount, 'Playback performs no additional numerical jobs.');
  const orbitProof = await orbit();
  assert.equal((await front()).preparationCount, prepared.preparationCount, 'Orbit reuses the prepared fan.');
  note('Advance one clock across front and real recordings without further numerical work, then orbit the cut Earth', state, { orbit: orbitProof, preparationCount: prepared.preparationCount });

  for (const phase of ['P', 'S', 'PKIKP']) {
    state = await ready();
    const summary = state.snapshot.stationArrivals.find(station => station.arrivals.some(arrival => arrival.phase === phase));
    const arrival = summary.arrivals.find(arrival => arrival.phase === phase);
    const button = page.locator(`[data-station-arrival][data-station-id="${summary.stationId}"][data-phase="${phase}"]`);
    await button.click();
    state = await ready();
    assert.equal(state.experiment.stationId, summary.stationId);
    assert.equal(state.experiment.phase, phase);
    assert.equal(state.experiment.branch, arrival.branch);
    near(state.experiment.timeS, arrival.timeS + state.snapshot.originOffsetS, 1e-8, 'arrival navigation exact seek');
    const atArrival = await checkRecordingCue(state, summary.stationId, phase, arrival.branch);
    near(atArrival.pulse, 1, 1e-9, 'exact arrival pulse');
    const proofs = [atArrival];
    for (const timeS of [Math.floor(atArrival.catalogTimeS * 10) / 10 - 0.1, Math.ceil(atArrival.catalogTimeS * 10) / 10 + 1, atArrival.catalogTimeS + 25, Math.floor(atArrival.catalogTimeS * 10) / 10 - 0.1]) {
      state = await scrub(timeS);
      proofs.push(await checkRecordingCue(state, summary.stationId, phase, arrival.branch));
    }
    assert.equal((await front()).preparationCount, prepared.preparationCount, 'Station and phase selection reuse the source-depth fan.');
    await capture(`desktop-arrival-${phase.toLowerCase()}`);
    note(`Follow the exact ${phase} arrival to a real station and synchronize its waveform and record-section cues through forward and backward seeks`, state, { stationId: summary.stationId, cues: proofs });
  }

  await page.getByLabel('Recording station', { exact: true }).selectOption('IU.ANMO.00.BHZ');
  state = await ready();
  const historical = await recordingEvidence();
  await page.locator('button[data-mode="locate"]').click();
  state = await ready();
  assert.ok(Math.abs(state.snapshot.originOffsetS) > 0.1, 'The candidate establishes a real nonzero modeled origin offset.');
  assert.deepEqual(await recordingEvidence(), historical, 'Candidate predictions do not move historical samples or archived pick times.');
  state = await scrub(320);
  checked = await geometry('desktop-candidate-origin', state);
  const candidateSummary = state.snapshot.stationArrivals.find(station => station.stationId === state.experiment.stationId);
  const candidateP = candidateSummary.arrivals.find(arrival => arrival.phase === 'P');
  state = await scrub(candidateP.timeS + state.snapshot.originOffsetS + 1);
  const candidateCue = await checkRecordingCue(state, state.experiment.stationId, 'P', candidateP.branch);
  await capture('desktop-candidate-origin');
  note('Apply the modeled origin offset to fronts and exact station cues while preserving independent recording samples and manual picks', state, { originOffsetS: state.snapshot.originOffsetS, geometry: checked.proof, cue: candidateCue, historicalSha256: sha256(JSON.stringify(historical)) });

  await page.locator('button[data-mode="explore"]').click();
  state = await globeReady();
  state = await scrub(520);
  await orbit();
  const sharedOn = await share();
  const originalFront = await front();
  const shared = await newContext('shared');
  await shared.page.goto(sharedOn.url);
  let restored = await globeReady(shared.page);
  assert.deepEqual(restored.experiment, sharedOn.state.experiment);
  assert.equal(restored.playing, false);
  assert.deepEqual((await front(shared.page)).phases, originalFront.phases);
  checked = await geometry('shared-on', restored, shared.page);
  await capture('shared-on', shared.page);
  note('Restore a paused, orbited, visible-front experiment in a fresh browser context', restored, checked.proof);
  await shared.page.locator('#wavefronts').click();
  restored = await ready(shared.page);
  assert.equal(restored.experiment.wavefronts, false);
  const sharedOff = await share(shared.page);
  await shared.page.goto(sharedOff.url);
  restored = await globeReady(shared.page);
  assert.deepEqual(restored.experiment, sharedOff.state.experiment);
  assert.equal((await front(shared.page)).visible, false);
  const legacy = new URL(sharedOn.url);
  const fields = new URLSearchParams(legacy.hash.slice(1)); fields.delete('fronts'); legacy.hash = fields.toString();
  await shared.page.goto(legacy.href);
  restored = await globeReady(shared.page);
  assert.deepEqual(restored.experiment, sharedOn.state.experiment, 'A historical link without the new field keeps all prior intent and enables the default fronts.');
  note('Restore fronts hidden and accept a historical link without the new visibility field', restored, { onUrl: sharedOn.url, offUrl: sharedOff.url, legacyUrl: legacy.href });
  await closeContext(shared.context);

  const narrow = await newContext('desktop-993', false, {width: 993, height: 900});
  await narrow.page.goto(sharedOn.url);
  restored = await globeReady(narrow.page);
  await narrow.page.locator('#earth-globe').scrollIntoViewIfNeeded();
  await narrow.page.mouse.move(980, 450);
  await narrow.page.mouse.wheel(0, 150);
  await narrow.page.waitForFunction(() => ['#earth-globe', '#waveform'].every(selector => {const bounds = document.querySelector(selector).getBoundingClientRect(); return bounds.top >= 0 && bounds.bottom <= innerHeight;}));
  const canvasBounds = await narrow.page.locator('#earth-globe').boundingBox();
  const recordingBounds = await narrow.page.locator('#waveform').boundingBox();
  assert.ok(canvasBounds.x + canvasBounds.width <= recordingBounds.x, 'At 993 pixels the globe and recording occupy neighboring columns.');
  for (const [name, bounds] of [['Earth', canvasBounds], ['recording', recordingBounds]]) assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 900, `${name} fits in the same actual browser viewport.`);
  const narrowSizes = await overflow(narrow.page);
  await narrow.page.screenshot({path: path.join(evidenceDir, 'desktop-993-viewport.png')});
  await capture('desktop-993', narrow.page);
  note('Show the Earth and selected real recording together in a 993-pixel desktop pane without horizontal overflow', restored, {canvasBounds, recordingBounds, sizes: narrowSizes});
  await closeContext(narrow.context);

  let sampling = observeReplacement(page);
  await page.getByLabel('Earthquake investigation', { exact: true }).selectOption('okhotsk-2013');
  await page.getByLabel('Earthquake investigation', { exact: true }).selectOption('tohoku-2011');
  await page.getByLabel('Earthquake investigation', { exact: true }).selectOption('maule-2010');
  state = await ready(page, 'maule-2010');
  const eventRows = await sampling;
  checkReplacement(eventRows, 'maule-2010');
  await page.getByRole('button', { name: 'Open Earth', exact: true }).click();
  state = await scrub(320);
  checked = await geometry('desktop-maule', state);
  note('Rapidly replace events and retain only the current source, station predictions, and source-depth fan', state, { observed: eventRows, geometry: checked.proof });

  await page.locator('button[data-mode="explore"]').click();
  state = await ready();
  sampling = observeReplacement(page, 180);
  await radial(322.25, 76.43, page, false);
  await radial(137.25, 81.43, page, false);
  await radial(237.125, 86.43, page, false);
  state = await ready();
  const depthRows = await sampling;
  checkReplacement(depthRows, 'maule-2010');
  near(state.snapshot.source.depthKm, 237.125, 1e-9, 'final replacement depth');
  assert.ok(state.stats.cancelled > 0, 'Rapid public geometry changes cancel superseded numerical work.');
  state = await scrub(520);
  checked = await geometry('desktop-depth-replacement', state);
  note('Replace source depths through public controls, cancel superseded work, and reject stale visible geometry', state, { observed: depthRows, cancelled: state.stats.cancelled, geometry: checked.proof });

  await context.setOffline(true);
  state = await radial(411.125, 131.375);
  near(state.snapshot.source.depthKm, 411.125, 1e-9, 'unseen offline source depth');
  state = await scrub(520);
  checked = await geometry('desktop-offline-unseen', state);
  await capture('desktop-offline-unseen');
  note('Prepare an unseen source-depth fan and exact station paths offline, then verify their actual rendered buffers against native calculations', state, checked.proof);
  await context.setOffline(false);

  const mobile = await newContext('touch', true);
  await mobile.page.goto(url);
  for (const eventKey of ['tohoku-2011', 'maule-2010', 'okhotsk-2013']) {
    state = eventKey === 'tohoku-2011' ? await globeReady(mobile.page) : await switchEvent(eventKey, mobile.page);
    await mobile.page.getByRole('button', { name: 'Open Earth', exact: true }).click();
    state = await scrub(320, mobile.page);
    checked = await geometry(`touch-${eventKey}`, state, mobile.page);
    assert.ok(checked.proof.triangles > 10000 && checked.proof.contours > 100);
    const touchOrbit = await orbit(mobile.page, true);
    await mobile.page.locator('#wavefronts').click();
    assert.equal((await front(mobile.page)).visible, false);
    await mobile.page.locator('#wavefronts').click();
    state = await ready(mobile.page);
    await mobile.page.getByLabel('Playback speed', { exact: true }).selectOption('30');
    await mobile.page.getByRole('button', { name: 'Play earthquake replay', exact: true }).click();
    await mobile.page.waitForFunction(time => window.workbench.state.experiment.timeS > time + 3, state.experiment.timeS);
    await mobile.page.getByRole('button', { name: 'Pause earthquake replay', exact: true }).click();
    state = await scrub(120, mobile.page);
    checkCompactGeometry(state, await front(mobile.page));
    const sizes = await overflow(mobile.page);
    await capture(`touch-${eventKey}`, mobile.page);
    note(`Use visible ${eventKey} fronts with a real touch orbit, toggle, playback, and backward seek on a narrow screen`, state, { geometry: checked.proof, touchOrbit, sizes });
  }
  await mobile.page.locator('button[data-mode="explore"]').click();
  state = await ready(mobile.page);
  await mobile.page.locator('[data-interior="section"]').click();
  await expect(mobile.page.locator('#section-view')).toBeVisible();
  await expect(mobile.page.locator('#earth-globe')).toBeHidden();
  await expect(mobile.page.locator('#wavefronts')).toBeHidden();
  assert.equal((await ready(mobile.page)).experiment.interiorView, 'section');
  await mobile.page.locator('[data-interior="globe"]').click();
  state = await globeReady(mobile.page);
  await expect(mobile.page.locator('#wavefronts')).toBeVisible();
  note('Retain the explicit Ray section and return to the globe without losing front intent', state);
  await closeContext(mobile.context);
  assert.deepEqual(report.errors, [], 'No browser errors are permitted.');
  assert.deepEqual(report.windowErrors, [], 'No window or ResizeObserver errors are permitted.');
  report.nativeGeometryCount = nativeRootCache.size;
  report.nativeFanCount = nativeCache.size;
  report.verdict = 'PASS';
} catch (error) {
  report.verdict = 'FAIL';
  report.failure = String(error.stack || error);
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(evidenceDir, 'failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  for (const owned of [...contexts]) await closeContext(owned).catch(error => report.errors.push(`Cleanup failed. ${error}`));
  await browser?.close();
  server.kill('SIGTERM');
  await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); });
  fs.closeSync(log);
  if (report.errors.length || report.windowErrors.length) {report.verdict = 'FAIL'; process.exitCode = 1;}
  report.finishedAt = new Date().toISOString();
  report.finalHashes = Object.fromEntries(sourceFiles.map(file => [file, sha256(fs.readFileSync(file))]));
  if (JSON.stringify(report.hashes) !== JSON.stringify(report.finalHashes)) {report.verdict = 'FAIL'; report.failure = `${report.failure || ''}\nSource changed during verification.`.trim(); process.exitCode = 1;}
  report.finalAssets = Object.fromEntries(filesIn('dist').map(file => [file, sha256(fs.readFileSync(file))]));
  if (JSON.stringify(report.assets) !== JSON.stringify(report.finalAssets)) {report.verdict = 'FAIL'; report.failure = `${report.failure || ''}\nBuilt assets changed during verification.`.trim(); process.exitCode = 1;}
  fs.writeFileSync(path.join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, steps: report.steps.length, errors: report.errors.length, windowErrors: report.windowErrors.length, nativeFans: report.nativeFanCount, nativeGeometries: report.nativeGeometryCount, failure: report.failure, evidenceDir }));
}
