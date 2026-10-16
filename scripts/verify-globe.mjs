#!/usr/bin/env node
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import {verificationTarget} from './verification-target.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {stripVTControlCharacters} from 'node:util';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const evidenceDir = path.resolve(process.env.TAUP_EVIDENCE || '.audit/globe/browser');
const port = Number(process.env.TAUP_PORT || 5194);
const verification = await verificationTarget(port);
const url = verification.url;
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const filesIn = directory => fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesIn(path.join(directory, entry.name)) : [path.join(directory, entry.name)]) : [];
const sourceFiles = ['scripts/verification-target.mjs', 'scripts/verify-globe.mjs', 'scripts/verify-assets.mjs', 'package.json', 'package-lock.json', 'index.html', 'fixtures/iasp91.json', 'fixtures/investigation/tohoku-investigation.json', 'fixtures/investigation/manifest.json', 'fixtures/observed/tohoku-2011.json', 'fixtures/observed/manifest.json', 'fixtures/events/maule-2010/case.json', 'fixtures/events/maule-2010/manifest.json', 'fixtures/events/okhotsk-2013/case.json', 'fixtures/events/okhotsk-2013/manifest.json', 'crates/taup-core/src/lib.rs', 'target/release/taup', 'web/pkg/taup_core_bg.wasm', ...filesIn('web').filter(file => /\.(js|css)$/.test(file)), ...filesIn('fixtures/earth')];
fs.mkdirSync(evidenceDir, { recursive: true });
const report = {
  startedAt: new Date().toISOString(), url, steps: [], errors: [], windowErrors: [], textureResponses: [], faviconResponses: [],
  hashes: Object.fromEntries(sourceFiles.map(file => [file, sha256(fs.readFileSync(file))])),
  assets: Object.fromEntries(filesIn('dist').map(file => [file, sha256(fs.readFileSync(file))])),
  contracts: {
    cutNormals: 'Rendered Three.js coordinates. Orbit the fixed cut Earth without changing these Earth-coordinate normals.',
    selectedPath: 'fullPointCount is the selected native path length. guideSegmentCount is the full faint guide. completedSegmentCount is the separate elapsed bright trail.',
    selectedPacket: 'Unreflected model coordinates. Interpolate the independently executed native path using its cumulative ray time.',
    texture: 'The ready diagnostic must accompany a successful same-origin 4096 by 2048 JPEG response whose bytes match a built artifact.',
  },
  limitations: ['A touch-enabled desktop Chrome context is not a physical-phone test.', 'Read-only render diagnostics prove calculated geometry and rendered segment counts. Retained screenshots separately support visual inspection.', 'This focused check does not replace the full investigation, atlas, or numerical checks.'],
};
const earthTextureHash = JSON.parse(fs.readFileSync('fixtures/earth/manifest.json', 'utf8')).files['blue-marble-2004-07-4096.jpg'].sha256;
const earthTextureAsset = Object.keys(report.assets).find(file => report.assets[file] === earthTextureHash);
assert.ok(earthTextureAsset, 'The frozen Earth texture must be present in the built artifacts.');
const nativeCache = new Map();
function native(depthKm, distanceDeg) {
  const key = `${depthKm}/${distanceDeg}`;
  if (!nativeCache.has(key)) {
    const result = spawnSync('target/release/taup', [String(depthKm), String(distanceDeg)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    nativeCache.set(key, JSON.parse(result.stdout));
  }
  return nativeCache.get(key);
}
function near(actual, expected, tolerance = 1e-8, label = 'value') {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label} is ${actual}; expected ${expected} within ${tolerance}.`);
}
function unit(position) {
  const latitude = position.latitudeDeg * Math.PI / 180;
  const longitude = position.longitudeDeg * Math.PI / 180;
  return [Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), Math.cos(latitude) * Math.sin(longitude)];
}
function positionAt(source, receiver, point) {
  const start = unit(source), end = unit(receiver);
  const cosine = start.reduce((sum, value, axis) => sum + value * end[axis], 0);
  const direction = end.map((value, axis) => value - cosine * start[axis]);
  const length = Math.hypot(...direction);
  assert.ok(length > 0.001, 'The checked geometry has a unique source-receiver plane.');
  const radius = (6371 - point.depth_km) / 6371;
  return start.map((value, axis) => radius * (Math.cos(point.distance_rad) * value + Math.sin(point.distance_rad) * direction[axis] / length));
}
function selectedNative(state) {
  const expected = native(state.snapshot.source.depthKm, state.snapshot.distanceDeg);
  assert.equal(state.snapshot.arrivals.length, expected.length, 'The browser must retain every independently executed native root.');
  expected.forEach((arrival, index) => {
    const actual = state.snapshot.arrivals[index];
    assert.equal(actual.phase, arrival.phase);
    near(actual.time_s, arrival.time_s, 1e-7, 'native arrival time');
    near(actual.ray_param_s_rad, arrival.ray_param_s_rad, 1e-6, 'native ray parameter');
    assert.equal(actual.path.length, arrival.path.length);
  });
  const arrival = expected.filter(item => item.phase === state.experiment.phase)[state.experiment.branch];
  assert.ok(arrival, `The selected ${state.experiment.phase} branch must be a real native root.`);
  return arrival;
}
function note(action, state, proof = {}) {
  report.steps.push({ action, event: state.investigation.key, experiment: state.experiment, source: state.snapshot?.source, ...proof });
}
let browser, context, page;
const contexts = new Set();
const imageTasks = [];
const log = fs.openSync(path.join(evidenceDir, 'server.log'), 'w');
const server = verification.hosted ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', log, log] });
function watch(target) {
  target.on('pageerror', error => report.errors.push(String(error)));
  target.on('console', message => {
    if (message.type() !== 'error') return;
    if (message.text().startsWith('[globe-window-error]')) report.windowErrors.push(message.text());
    else report.errors.push(message.text());
  });
  target.on('response', response => {
    const contentType = response.headers()['content-type']?.split(';')[0];
    if (!contentType?.startsWith('image/')) return;
    imageTasks.push((async () => {
      const bytes = await response.body();
      const responseUrl = new URL(response.url());
      const asset = path.posix.join('dist', responseUrl.pathname);
      const receipt = { url: response.url(), status: response.status(), sha256: sha256(bytes), bytes: bytes.length, contentType };
      assert.equal(responseUrl.origin, new URL(url).origin, 'Every observed image must come from the local preview.');
      assert.equal(receipt.status, 200, `Image request failed. ${receipt.url}`);
      assert.equal(receipt.sha256, report.assets[asset], `Image bytes must match the built artifact. ${asset}`);
      if (asset === 'dist/favicon.svg') {
        assert.equal(contentType, 'image/svg+xml');
        report.faviconResponses.push(receipt);
        return;
      }
      assert.equal(asset, earthTextureAsset, `Unexpected image response. ${receipt.url}`);
      assert.equal(contentType, 'image/jpeg');
      const dimensions = await target.evaluate(async ({ base64, contentType }) => {
        const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
        const image = await createImageBitmap(new Blob([bytes], { type: contentType }));
        const dimensions = { width: image.width, height: image.height };
        image.close();
        return dimensions;
      }, { base64: bytes.toString('base64'), contentType });
      report.textureResponses.push({ ...receipt, ...dimensions });
    })().catch(error => report.errors.push(`Image receipt failed. ${error}`)));
  });
}
async function newContext(name, mobile = false) {
  const owned = await verification.newContext(browser, { viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1080 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  contexts.add(owned);
  await owned.addInitScript(() => addEventListener('error', event => console.error('[globe-window-error]', event.message, event.filename, event.lineno)));
  await verification.startTrace(owned, { screenshots: true, snapshots: true });
  const target = await owned.newPage();
  watch(target);
  owned.proofName = name;
  return { context: owned, page: target };
}
async function closeContext(owned) {
  await Promise.all(imageTasks);
  await verification.stopTrace(owned, { path: path.join(evidenceDir, `${owned.proofName}-trace.zip`) });
  await owned.close();
  contexts.delete(owned);
}
async function ready(target = page, eventKey) {
  await target.waitForFunction(key => (window.workbench?.ready || window.workbench?.error) && (!key || window.workbench.state.investigation.key === key), eventKey, { timeout: 60000 });
  assert.equal(await target.evaluate(() => window.workbench.error), null);
  return target.evaluate(() => window.workbench.state);
}
async function globeReady(target = page) {
  await expect(target.locator('#earth-globe')).toBeVisible();
  await expect(target.locator('#earth-globe')).toHaveAttribute('data-globe-status', 'ready');
  await expect(target.locator('#earth-globe')).toHaveAttribute('data-earth-texture', 'ready', { timeout: 30000 });
  await target.evaluate(() => document.fonts.ready);
  return ready(target);
}
async function event(key) {
  await page.getByLabel('Earthquake investigation', { exact: true }).selectOption(key);
  const state = await ready(page, key);
  assert.equal(state.experiment.context.kind, 'replay');
  await globeReady();
  return state;
}
async function explore() {
  await page.locator('button[data-mode="explore"]').click();
  const state = await globeReady();
  assert.equal(state.experiment.context.kind, 'explore');
  assert.equal(state.experiment.interiorView, 'globe');
  assert.equal(state.experiment.cutaway, true);
  await expect(page.locator('#section-view')).toBeHidden();
  return state;
}
async function scrub(timeS, target = page) {
  const rounded = Math.round(timeS * 10) / 10;
  await target.getByLabel('Replay time in seconds after catalog origin', { exact: true }).fill(String(rounded));
  const state = await ready(target);
  near(state.experiment.timeS, rounded, 1e-10, 'shared playback clock');
  near(Number(await target.locator('#earth-globe').getAttribute('data-playback-time-s')), rounded, 1e-10, 'globe playback clock');
  near(Number(await target.locator('#wave-cursor').getAttribute('data-time-s')), rounded, 1e-10, 'recording playback clock');
  return state;
}
async function diagnostics(target = page) {
  return target.locator('#earth-globe').evaluate(canvas => ({
    cutNormals: JSON.parse(canvas.dataset.cutNormals),
    path: canvas.dataset.selectedPath ? JSON.parse(canvas.dataset.selectedPath) : null,
    packet: canvas.dataset.selectedPacket ? JSON.parse(canvas.dataset.selectedPacket) : null,
    sourcePosition: JSON.parse(canvas.dataset.sourcePosition), sourceKind: canvas.dataset.sourceKind,
    camera: { azimuthDeg: Number(canvas.dataset.cameraAzimuth), elevationDeg: Number(canvas.dataset.cameraElevation), distance: Number(canvas.dataset.cameraDistance) },
  }));
}
function checkPathCount(render, ray, timeS) {
  const index = ray.path.findIndex(point => point.time_s >= timeS);
  const completed = timeS < 0 ? 0 : index < 0 ? ray.path.length - 1 : index;
  assert.equal(render.path.phase, ray.phase);
  assert.equal(render.path.fullPointCount, ray.path.length);
  assert.equal(render.path.guideSegmentCount, ray.path.length - 1, 'The full guide remains visible beyond the packet.');
  assert.equal(render.path.completedSegmentCount, completed, 'The bright trail ends at the current packet.');
  return completed;
}
async function packet(timeS, target = page) {
  const state = await scrub(timeS, target);
  const ray = selectedNative(state);
  const render = await diagnostics(target);
  const rayTime = state.experiment.timeS - state.snapshot.originOffsetS;
  const index = ray.path.findIndex(point => point.time_s >= rayTime);
  assert.ok(index > 0 && index < ray.path.length - 1, 'The checked packet is between real path endpoints.');
  const previous = ray.path[index - 1], next = ray.path[index];
  const fraction = (rayTime - previous.time_s) / (next.time_s - previous.time_s);
  const left = positionAt(state.snapshot.source, state.snapshot.receiver, previous), right = positionAt(state.snapshot.source, state.snapshot.receiver, next);
  assert.equal(render.packet.phase, state.experiment.phase);
  assert.equal(render.packet.index, index);
  near(render.packet.fraction, fraction, 1e-9, 'packet interpolation fraction');
  near(render.packet.timeS, rayTime, 1e-9, 'packet ray time');
  for (let axis = 0; axis < 3; axis++) near(render.packet.modelPosition[axis], left[axis] + fraction * (right[axis] - left[axis]), 1e-9, 'packet physical coordinate');
  assert.equal(render.sourceKind, 'source');
  const source = unit(state.snapshot.source).map(value => value * (6371 - state.snapshot.source.depthKm) / 6371);
  for (let axis = 0; axis < 3; axis++) near(render.sourcePosition[axis], source[axis], 1e-10, 'hypocenter physical coordinate');
  checkPathCount(render, ray, rayTime);
  return { state, proof: { packet: render.packet, path: render.path, sourceRadius: Math.hypot(...render.sourcePosition) } };
}
async function capture(name, target = page) {
  await target.mouse.move(2, 2);
  await target.locator('#earth-globe').screenshot({ path: path.join(evidenceDir, `${name}-globe.png`) });
  await target.screenshot({ path: path.join(evidenceDir, `${name}.png`), fullPage: true });
}
async function orbit(target = page, touch = false, fraction = 0.27) {
  const canvas = target.locator('#earth-globe');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  const x = box.x + box.width * 0.36, y = box.y + box.height * 0.54;
  const before = await diagnostics(target);
  if (touch) {
    const session = await target.context().newCDPSession(target);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 12; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + box.width * fraction * step / 12, y: y + 18 * step / 12 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await target.mouse.move(x, y);
    await target.mouse.down();
    await target.mouse.move(x + box.width * fraction, y + 18, { steps: 12 });
    await target.mouse.up();
  }
  const after = await diagnostics(target);
  assert.ok(Math.abs(after.camera.azimuthDeg - before.camera.azimuthDeg) > 10, 'An actual pointer drag must rotate the Earth camera.');
  assert.deepEqual(after.cutNormals, before.cutNormals, 'Orbiting must not flip or turn the cut geometry.');
  return { before, after };
}
async function compareScreenshots(target, left, right) {
  return target.evaluate(async ({ left, right }) => {
    async function pixels(base64) {
      const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
      const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      image.close();
      return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
    }
    const a = await pixels(left), b = await pixels(right);
    if (a.width !== b.width || a.height !== b.height) return { sizeMatch: false, left: [a.width, a.height], right: [b.width, b.height] };
    let changed = 0;
    for (let index = 0; index < a.data.length; index += 4) if (Math.max(...[0, 1, 2].map(offset => Math.abs(a.data[index + offset] - b.data[index + offset]))) > 12) changed++;
    return { sizeMatch: true, width: a.width, height: a.height, changedPixels: changed, changedFraction: changed / (a.width * a.height), channelTolerance: 12 };
  }, { left: left.toString('base64'), right: right.toString('base64') });
}

report.verificationAccess = verification.evidenceScope;

try {
  if (verification.hosted) await verification.probe();
  else for (let attempt = 0; ; attempt++) {
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
  assert.equal(state.experiment.context.kind, 'replay');
  selectedNative(state);
  await capture('desktop-replay');
  note('Open a locally textured, calculated Tohoku replay from the production build', state);
  await page.getByRole('button', { name: 'Open Earth', exact: true }).click();
  state = await ready();
  const replayRay = selectedNative(state);
  const replayPacket = await packet(replayRay.time_s * 0.43);
  state = replayPacket.state;
  await capture('desktop-replay-cutaway');
  note('Open the replay cutaway and retain a complete faint guide around the timed P packet and its elapsed trail', state, replayPacket.proof);

  state = await explore();
  await page.getByLabel('Recording station', { exact: true }).selectOption('IU.ANMO.00.BHZ');
  state = await ready();
  for (const phase of ['P', 'S']) {
    await page.getByLabel('Seismic phase', { exact: true }).selectOption(phase);
    state = await ready();
    const ray = selectedNative(state);
    const checked = await packet(ray.time_s * 0.43 + state.snapshot.originOffsetS);
    state = checked.state;
    await capture(`desktop-${phase.toLowerCase()}`);
    note(`Follow the ${phase} packet on its independently executed native path and retain the complete guide`, state, checked.proof);
  }

  await page.getByRole('button', { name: 'Trace the inner core', exact: false }).click();
  state = await globeReady();
  assert.equal(state.experiment.interiorView, 'globe');
  assert.equal(state.experiment.stationId, 'IU.LVC.00.BHZ');
  assert.equal(state.experiment.phase, 'PKIKP');
  assert.equal(state.experiment.cutaway, true);
  const coreRay = selectedNative(state);
  const coreSegment = coreRay.path.findIndex((point, index) => index > 0 && point.depth_km > 5300 && coreRay.path[index - 1].depth_km > 5153.9 && point.time_s > coreRay.path[index - 1].time_s);
  assert.ok(coreSegment > 0, 'The chosen core path has actual samples in the solid inner core.');
  const coreChecked = await packet((coreRay.path[coreSegment - 1].time_s + coreRay.path[coreSegment].time_s) / 2);
  state = coreChecked.state;
  const before = await scrub(-1);
  let render = await diagnostics();
  assert.equal(render.packet, null);
  checkPathCount(render, coreRay, -1);
  state = await scrub(coreRay.time_s + 1);
  render = await diagnostics();
  assert.equal(render.packet, null);
  checkPathCount(render, coreRay, state.experiment.timeS);
  state = (await packet(coreRay.time_s * 0.48)).state;
  await page.getByRole('button', { name: 'Focus selected ray section', exact: true }).click();
  const focused = await diagnostics();
  assert.equal(focused.cutNormals.length, 2, 'The fixed quarter cutaway has exactly two clipping planes.');
  focused.cutNormals.forEach(normal => { assert.equal(normal.length, 3); near(Math.hypot(...normal), 1, 1e-9, 'unit cut normal'); });
  const orbits = [];
  for (let index = 0; index < 3; index++) orbits.push(await orbit());
  const sideSigns = [focused, ...orbits.map(result => result.after)].map(result => {
    const camera = unit({ latitudeDeg: result.camera.elevationDeg, longitudeDeg: result.camera.azimuthDeg });
    camera[2] *= -1;
    return Math.sign(result.cutNormals[0].reduce((sum, value, axis) => sum + value * camera[axis], 0));
  });
  assert.ok(sideSigns.includes(1) && sideSigns.includes(-1), 'The actual camera must cross the cut plane without replacing the cut Earth.');
  state = await ready();
  await capture('desktop-rotated-core');
  note('Open the inner-core example in 3D, retain the guide before and after arrival, and orbit across the fixed cut plane', state, { corePacket: coreChecked.proof, beforeOriginTimeS: before.experiment.timeS, focused, orbits, sideSigns });

  state = await event('okhotsk-2013');
  state = await explore();
  await page.getByRole('button', { name: 'Trace the inner core', exact: false }).click();
  state = await globeReady();
  assert.equal(state.snapshot.source.depthKm, 598.1);
  const deepRay = selectedNative(state);
  const deep = await packet(deepRay.time_s * 0.44);
  state = deep.state;
  near(deep.proof.sourceRadius, 0.9061214879924659, 1e-12, '598.1 km source radius');
  await capture('desktop-deep-source');
  note('Keep the 598.1 km Okhotsk hypocenter inside Earth while following a real core path', state, deep.proof);

  await page.getByLabel('Playback speed', { exact: true }).selectOption('30');
  await page.getByRole('button', { name: 'Play earthquake replay', exact: true }).click();
  const startTime = state.experiment.timeS;
  await page.waitForFunction(timeS => window.workbench.state.experiment.timeS > timeS + 3, startTime);
  await page.getByRole('button', { name: 'Pause earthquake replay', exact: true }).click();
  state = await ready();
  await packet(state.experiment.timeS);
  await orbit();
  state = await ready();
  await page.getByRole('button', { name: 'Share experiment', exact: false }).click();
  await expect(page.getByLabel('Reproducible experiment URL')).toHaveValue(page.url());
  const sharedUrl = await page.getByLabel('Reproducible experiment URL').inputValue();
  assert.ok(sharedUrl.startsWith(`${url}#lab=2&event=okhotsk-2013&`));
  await page.mouse.move(2, 2);
  const originalImage = await page.locator('#earth-globe').screenshot({ path: path.join(evidenceDir, 'shared-original-globe.png') });
  const originalRender = await diagnostics();
  const shared = await newContext('shared');
  await shared.page.goto(sharedUrl);
  const restored = await globeReady(shared.page);
  assert.deepEqual(restored.experiment, state.experiment);
  assert.equal(restored.playing, false);
  assert.deepEqual(restored.snapshot.arrivals, state.snapshot.arrivals);
  const restoredRender = await diagnostics(shared.page);
  assert.deepEqual(restoredRender.cutNormals, originalRender.cutNormals);
  const {screenPosition: restoredScreenPosition, ...restoredPacket} = restoredRender.packet;
  const {screenPosition: originalScreenPosition, ...originalPacket} = originalRender.packet;
  assert.deepEqual(restoredPacket, originalPacket);
  restoredScreenPosition.forEach((value, axis) => near(value, originalScreenPosition[axis], 1e-8, 'restored packet CSS coordinate'));
  assert.deepEqual(restoredRender.path, originalRender.path);
  for (const key of ['azimuthDeg', 'elevationDeg', 'distance']) near(restoredRender.camera[key], originalRender.camera[key], 1e-8, `restored camera ${key}`);
  await shared.page.mouse.move(2, 2);
  const restoredImage = await shared.page.locator('#earth-globe').screenshot({ path: path.join(evidenceDir, 'shared-restored-globe.png') });
  const screenshotComparison = await compareScreenshots(shared.page, originalImage, restoredImage);
  assert.equal(screenshotComparison.sizeMatch, true);
  assert.ok(screenshotComparison.changedFraction <= 0.005, `Restored globe differs in ${screenshotComparison.changedFraction} of pixels.`);
  await capture('shared', shared.page);
  note('Play and pause one synchronized clock, orbit the cut Earth, then reproduce station, phase, camera, clock and cut geometry in a fresh browser context', restored, { sharedUrl, screenshotComparison, originalRender, restoredRender });
  await closeContext(shared.context);

  await page.locator('button[data-interior="section"]').click();
  state = await ready();
  assert.equal(state.experiment.interiorView, 'section');
  await expect(page.locator('#section-view')).toBeVisible();
  await page.getByRole('button', { name: 'Share experiment', exact: false }).click();
  await expect(page.getByLabel('Reproducible experiment URL')).toHaveValue(page.url());
  const sectionUrl = await page.getByLabel('Reproducible experiment URL').inputValue();
  const section = await newContext('section');
  await section.page.goto(sectionUrl);
  const sectionState = await ready(section.page, 'okhotsk-2013');
  assert.deepEqual(sectionState.experiment, state.experiment);
  await expect(section.page.locator('#section-view')).toBeVisible();
  await expect(section.page.locator('#globe-view')).toBeHidden();
  note('Keep the explicit analytical section and restore its existing shared intent', sectionState, { sectionUrl });
  await closeContext(section.context);
  await page.locator('button[data-interior="globe"]').click();
  await globeReady();

  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await context.setOffline(true);
  await page.locator('#advanced > summary').click();
  await page.getByLabel('Source depth', { exact: false }).fill('411.125');
  await page.getByLabel('Receiver distance', { exact: false }).fill('131.375');
  await page.getByRole('button', { name: 'Calculate geometry', exact: true }).click();
  state = await ready();
  assert.equal(state.snapshot.source.depthKm, 411.125);
  near(state.snapshot.distanceDeg, 131.375, 1e-10);
  const offlineRay = selectedNative(state);
  const offline = await packet(offlineRay.time_s * 0.43);
  state = offline.state;
  await orbit();
  assert.deepEqual(requests, [], 'New geometry and rotation must work locally after loading.');
  await context.setOffline(false);
  await capture('offline-geometry');
  note('Compute an unseen depth and distance, follow its packet and orbit its cutaway offline with zero requests', state, offline.proof);

  await closeContext(context);
  ({ context, page } = await newContext('mobile', true));
  await page.goto(url);
  await globeReady();
  for (const key of ['tohoku-2011', 'maule-2010', 'okhotsk-2013']) {
    state = await event(key);
    state = await explore();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The 390 px document must not overflow horizontally.');
    const box = await page.locator('#earth-globe').boundingBox();
    assert.ok(box.width >= 330 && box.height >= 300, 'The mobile globe must remain a usable central instrument.');
    await page.getByRole('button', { name: 'Trace the inner core', exact: false }).tap();
    state = await globeReady();
    assert.equal(state.experiment.interiorView, 'globe');
    const ray = selectedNative(state);
    const checked = await packet(ray.time_s * 0.45);
    state = checked.state;
    const rotation = await orbit(page, true, 0.28);
    await page.getByRole('button', { name: 'Close Earth', exact: true }).tap();
    state = await ready();
    assert.equal(state.experiment.cutaway, false);
    assert.equal((await diagnostics()).sourceKind, 'epicenter');
    await page.getByRole('button', { name: 'Open Earth', exact: true }).tap();
    state = await ready();
    assert.equal(state.experiment.cutaway, true);
    await packet(state.experiment.timeS);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const labelClearance = await page.locator('[data-globe-overlay]').evaluate(overlay => {
      const bounds = element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      const visible = element => !element.hidden && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden';
      const hud = overlay.querySelector('.ray-position');
      const packetHud = { visible: visible(hud), ...bounds(hud) };
      const labels = [...overlay.children].filter(element => element.tagName === 'DIV' && element.style.position === 'absolute' && visible(element)).map(element => ({ text: element.textContent, ...bounds(element) }));
      const intersections = labels.filter(label => label.left < packetHud.right && label.right > packetHud.left && label.top < packetHud.bottom && label.bottom > packetHud.top);
      return { packetHud, labels, intersections };
    });
    assert.ok(labelClearance.packetHud.visible && labelClearance.packetHud.width > 0 && labelClearance.packetHud.height > 0, 'The actual mobile packet readout must be visible.');
    assert.ok(labelClearance.labels.length > 0, 'The mobile globe must retain projected source and station labels.');
    assert.deepEqual(labelClearance.intersections, [], 'Visible projected labels must not overlap the mobile packet readout.');
    await capture(`${key}-mobile`);
    note('Use the globe, core example, real touch orbit and open-close controls at 390 px without horizontal overflow', state, { box, rotation, packet: checked.proof, labelClearance });
  }
  await Promise.all(imageTasks);
  const texture = report.textureResponses.find(item => item.status === 200 && new URL(item.url).origin === new URL(url).origin && item.width === 4096 && item.height === 2048 && item.sha256 === earthTextureHash && Object.values(report.assets).includes(item.sha256));
  assert.ok(texture, 'A real, locally served 4096 by 2048 texture must match the built asset bytes.');
  report.localTexture = texture;
  assert.ok(report.faviconResponses.length > 0, 'The SVG favicon must have a successful same-origin response that matches its built bytes.');
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.windowErrors, []);
  for (const [file, expected] of Object.entries(report.hashes)) assert.equal(sha256(fs.readFileSync(file)), expected, `Source changed during verification. ${file}`);
  for (const [file, expected] of Object.entries(report.assets)) assert.equal(sha256(fs.readFileSync(file)), expected, `Built asset changed during verification. ${file}`);
  report.verdict = 'PASS';
} catch (error) {
  report.verdict = 'FAIL';
  report.failure = String(error.stack || error);
  process.exitCode = 1;
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(evidenceDir, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  await Promise.all(imageTasks);
  for (const owned of contexts) await closeContext(owned).catch(error => report.errors.push(`Cleanup failed. ${error}`));
  await browser?.close();
  if (server) { server.kill('SIGTERM'); await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); }); }
  fs.closeSync(log);
  report.nativeQueries = nativeCache.size;
  report.finishedAt = new Date().toISOString();
  if (report.errors.length || report.windowErrors.length) { report.verdict = 'FAIL'; process.exitCode = 1; }
  fs.writeFileSync(path.join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ verdict: report.verdict, steps: report.steps.length, errors: report.errors.length, windowErrors: report.windowErrors.length, nativeQueries: report.nativeQueries, evidenceDir, failure: report.failure }));
}
