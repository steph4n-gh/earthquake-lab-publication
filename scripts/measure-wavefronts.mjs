#!/usr/bin/env node
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripVTControlCharacters} from 'node:util';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';

const evidenceDir = path.resolve(process.env.TAUP_EVIDENCE || '.audit/wavefronts/performance');
const port = Number(process.env.TAUP_PORT || 5196);
const rounds = Number(process.env.TAUP_ROUNDS ?? 5);
assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 20);
const url = `http://127.0.0.1:${port}/`;
fs.mkdirSync(evidenceDir, {recursive: true});
if (fs.existsSync(path.join(evidenceDir, 'report.json'))) {
  const prior = path.join(evidenceDir, 'attempts', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(prior, {recursive: true});
  for (const entry of fs.readdirSync(evidenceDir)) if (entry !== 'attempts') fs.renameSync(path.join(evidenceDir, entry), path.join(prior, entry));
}
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files = ['index.html', 'package.json', 'package-lock.json', 'scripts/measure-wavefronts.mjs', 'crates/taup-core/src/lib.rs', 'fixtures/iasp91.json', 'fixtures/investigation/tohoku-investigation.json'];
function addFiles(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) addFiles(file);
    else files.push(file);
  }
}
addFiles('web'); addFiles('dist'); addFiles('fixtures/earth');
const sourceHashes = Object.fromEntries([...new Set(files)].sort().map(file => [file, hash(file)]));
const busyProcesses = () => spawnSync('ps', ['-axo', 'pid,pcpu,comm'], {encoding: 'utf8'}).stdout.trim().split('\n').slice(1).map(line => line.trim().match(/^(\d+)\s+([\d.]+)\s+(.+)$/)).filter(Boolean).map(([, pid, cpuPercent, executable]) => ({pid: Number(pid), cpuPercent: Number(cpuPercent), executable})).sort((a, b) => b.cpuPercent - a.cpuPercent).slice(0, 12);
const summary = values => {
  const sorted = values.toSorted((a, b) => a - b);
  return {count: sorted.length, median: sorted[Math.floor(sorted.length / 2)] ?? null, minimum: sorted[0] ?? null, maximum: sorted.at(-1) ?? null, p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))] ?? null};
};
const canonicalTime = time => String(Math.round(time * 10) / 10);
const scenarios = [
  {name: 'spreading-P-and-S', station: 'IU.ANMO.00.BHZ', phase: 'P', startS: 180, requiredPhases: ['P', 'S']},
  {name: 'inner-core-PKIKP', station: 'IU.LVC.00.BHZ', phase: 'PKIKP', requiredPhases: ['PKIKP']},
];
const report = {
  claim: 'The production textured Earth remains responsive while actual modeled wavefront surfaces and cut-plane contours spread on the recording clock, and while public seek and orbit controls update them. This is an absolute same-host browser measurement, with no speedup comparison.',
  startedAt: new Date().toISOString(), url, sourceHashes, scenarios,
  environment: {platform: process.platform, architecture: process.arch, cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, loadBefore: os.loadavg(), busiestProcessesBefore: busyProcesses(), uptime: spawnSync('uptime', {encoding: 'utf8'}).stdout.trim(), node: process.version, headless: true, deviceScaleFactor: 1, physicalMobileDevice: false},
  method: {
    repetitionsPerViewport: rounds,
    order: 'Desktop then 390 px in even rounds, 390 px then desktop in odd rounds. Fresh browser context and calculation Worker per viewport trial. Both scenarios reuse their source-depth fan.',
    playback: 'Three-second settled playback windows with wavefronts enabled, the open textured Earth at least half visible, actual positive mesh and contour draw counts, and native-position samples advancing. The real selected recording cursor must equal the catalog-origin front clock every sampled frame. No screenshot, profile, network wait or workbench.state clone occurs inside timing.',
    interaction: 'Trusted range input or globe pointerdown to the next animation frame with matching updated front clock or changed camera. These warm application frame opportunities exclude initial download, texture decode, shader compilation and fan preparation. They are not physical display latency or INP.',
    longTasks: 'Chrome PerformanceObserver longtask entries overlapping each interval, meaning main-thread tasks of at least 50 ms.',
    profile: 'Separate untimed main-thread CPU profile after all measurements. Browser scheduling cadence and mapped CPU hotspots bound interpretation. GPU completion is not independently measured.',
    limits: 'Production build, DPR 1, installed headless Chrome using this computer GPU. The 390 px context tests layout and same-host responsiveness. It does not qualify a physical phone or display FPS. The samples are bounded ray-theory time surfaces, not displacement or amplitude.',
  },
  preparation: [], operations: [], playback: [], arrivalChecks: [], errors: [], profile: null,
};
const log = fs.openSync(path.join(evidenceDir, 'server.log'), 'w');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {stdio: ['ignore', log, log]});
const contexts = new Set();
let browser;

async function ready(page) {
  await page.waitForFunction(() => window.workbench?.ready || window.workbench?.error, undefined, {timeout: 90000});
  assert.equal(await page.evaluate(() => window.workbench.error), null);
  await page.waitForFunction(() => document.getElementById('earth-globe')?.dataset.earthTexture === 'ready', undefined, {timeout: 30000});
}
async function frontState(page) {
  return page.evaluate(() => ({front: JSON.parse(document.getElementById('earth-globe').dataset.wavefronts), camera: ['cameraAzimuth', 'cameraElevation', 'cameraDistance'].map(key => document.getElementById('earth-globe').dataset[key]), cutNormals: document.getElementById('earth-globe').dataset.cutNormals, stats: window.workbench.state.stats}));
}
async function enableFronts(page) {
  if (await page.locator('#wavefronts').getAttribute('aria-pressed') !== 'true') await page.locator('#wavefronts').click();
  await ready(page);
  await page.waitForFunction(() => JSON.parse(document.getElementById('earth-globe').dataset.wavefronts).visible);
}
async function instrument(page) {
  await page.evaluate(() => {
    const data = {tasks: [], operation: null, playback: null};
    let armed = null;
    let lastFrame = null;
    const canvas = document.getElementById('earth-globe');
    const read = () => JSON.parse(canvas.dataset.wavefronts);
    const camera = () => ['cameraAzimuth', 'cameraElevation', 'cameraDistance'].map(key => canvas.dataset[key]).join('|');
    const visible = () => {
      const bounds = canvas.getBoundingClientRect();
      const area = bounds.width * bounds.height;
      return area > 0 && !canvas.closest('[hidden]') && Math.max(0, Math.min(innerWidth, bounds.right) - Math.max(0, bounds.left)) * Math.max(0, Math.min(innerHeight, bounds.bottom) - Math.max(0, bounds.top)) >= area * .5;
    };
    const visibleSample = sample => {
      const bounds = canvas.getBoundingClientRect();
      const [x, y] = sample.screenPosition ?? [];
      return sample.onScreen && Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= bounds.width && y >= 0 && y <= bounds.height && x + bounds.left >= 0 && x + bounds.left <= innerWidth && y + bounds.top >= 0 && y + bounds.top <= innerHeight;
    };
    new PerformanceObserver(list => data.tasks.push(...list.getEntries().map(item => ({startTime: item.startTime, duration: item.duration})))).observe({type: 'longtask', buffered: true});
    function begin(event) {
      if (!armed || !event.isTrusted) return;
      if (armed.kind === 'seek' ? event.type !== 'input' || event.target.id !== 'time' : event.type !== 'pointerdown' || event.target.id !== 'earth-globe') return;
      const front = read();
      data.operation = {...armed, start: performance.now(), targetTimeS: Number(document.getElementById('time').value), beforeCamera: camera(), beforeCutNormals: canvas.dataset.cutNormals, fanRevision: front.fanRevision, preparationCount: front.preparationCount, feedbackFrameMs: null};
      armed = null;
    }
    document.addEventListener('input', begin, true);
    document.addEventListener('pointerdown', begin, true);
    function frame(now) {
      const operation = data.operation;
      if (operation && operation.feedbackFrameMs === null) {
        const front = read();
        const ready = operation.kind === 'seek' ? Math.abs(front.catalogTimeS - operation.targetTimeS) < 1e-7 && Math.abs(Number(document.getElementById('wave-cursor').dataset.timeS) - operation.targetTimeS) < 1e-7 : camera() !== operation.beforeCamera;
        if (ready && front.visible && front.phases.some(phase => phase.triangleCount > 0 && phase.contourSegmentCount > 0)) {
          operation.end = performance.now(); operation.feedbackFrameMs = operation.end - operation.start;
          operation.afterCamera = camera(); operation.afterCutNormals = canvas.dataset.cutNormals;
          operation.front = front;
          operation.longTasks = data.tasks.filter(task => task.startTime < operation.end && task.startTime + task.duration > operation.start);
        }
      }
      const playback = data.playback;
      if (playback && !playback.end) {
        const front = read();
        const active = document.getElementById('play').getAttribute('aria-label') === 'Pause earthquake replay';
        const phases = playback.requiredPhases.map(name => front.phases.find(phase => phase.phase === name));
        const hasGeometry = phases.every(phase => phase?.triangleCount > 0 && phase?.contourSegmentCount > 0 && phase?.activeRayCount > 1 && phase.samples?.length);
        const anySampleVisible = phases.some(phase => phase?.samples?.some(visibleSample));
        const cursorS = Number(document.getElementById('wave-cursor').dataset.timeS);
        const synchronized = Math.abs(cursorS - front.catalogTimeS) < 1e-7;
        const actualCore = !playback.requiredPhases.includes('PKIKP') || phases.some(phase => phase?.samples?.some(sample => sample.depthKm > 5153.9));
        if (active && visible() && front.visible && hasGeometry && anySampleVisible && synchronized && actualCore && document.getElementById('cutaway').getAttribute('aria-pressed') === 'true') {
          if (lastFrame !== null) playback.gaps.push(now - lastFrame);
          lastFrame = now; playback.samples++;
          playback.firstClockS ??= front.catalogTimeS; playback.lastClockS = front.catalogTimeS;
          playback.firstFront ??= front; playback.lastFront = front;
          playback.maximumClockErrorS = Math.max(playback.maximumClockErrorS, Math.abs(cursorS - front.catalogTimeS));
        } else {
          lastFrame = null; playback.skippedFrames++;
          playback.rejected[!active ? 'paused' : !visible() ? 'canvasOutsideViewport' : !front.visible ? 'frontsHidden' : !hasGeometry ? 'missingGeometry' : !anySampleVisible ? 'samplesOutsideViewport' : !synchronized ? 'clockMismatch' : !actualCore ? 'coreNotReached' : 'cutawayClosed']++;
        }
        if (performance.now() - playback.start >= playback.durationMs) {
          playback.end = performance.now(); playback.elapsedMs = playback.end - playback.start;
          playback.longTasks = data.tasks.filter(task => task.startTime < playback.end && task.startTime + task.duration > playback.start);
          lastFrame = null;
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    Object.defineProperty(window, '__wavefrontMeasurement', {value: {data, arm(kind) { armed = {kind}; data.operation = null; }, playback(requiredPhases, durationMs) { data.playback = {requiredPhases, durationMs, start: performance.now(), gaps: [], samples: 0, skippedFrames: 0, maximumClockErrorS: 0, rejected: {paused: 0, canvasOutsideViewport: 0, frontsHidden: 0, missingGeometry: 0, samplesOutsideViewport: 0, clockMismatch: 0, coreNotReached: 0, cutawayClosed: 0}}; lastFrame = null; }}});
  });
}
async function selectScenario(page, scenario) {
  await page.locator('button[data-mode="replay"]').click(); await ready(page);
  await page.getByLabel('Recording station', {exact: true}).selectOption(scenario.station); await ready(page);
  await page.getByLabel('Seismic phase', {exact: true}).selectOption(scenario.phase);
  await enableFronts(page);
  if (await page.locator('#cutaway').getAttribute('aria-pressed') !== 'true') await page.locator('#cutaway').click();
  await page.getByRole('button', {name: 'Focus selected ray section', exact: true}).click();
  const state = await page.evaluate(() => window.workbench.state);
  const selected = state.snapshot.arrivals.filter(arrival => arrival.phase === scenario.phase)[state.experiment.branch];
  assert.ok(selected?.path.length > 30);
  let startS = scenario.startS;
  if (scenario.phase === 'PKIKP') {
    const core = selected.path.filter(point => point.depth_km > 5154);
    assert.ok(core.length > 2 && core.at(-1).time_s - core[0].time_s > 35);
    startS = core[0].time_s + 5;
  }
  await page.getByLabel('Replay time in seconds after catalog origin').fill(canonicalTime(startS));
  return {selected, startS, state};
}
async function operation(page, viewport, round, kind) {
  const canvas = page.locator('#earth-globe');
  await page.getByLabel('Replay time in seconds after catalog origin').fill('180');
  if (kind === 'orbit') await canvas.scrollIntoViewIfNeeded();
  else await page.locator('#time').focus();
  await page.evaluate(value => window.__wavefrontMeasurement.arm(value), kind);
  if (kind === 'seek') await page.locator('#time').press('ArrowRight');
  else {
    const bounds = await canvas.boundingBox();
    const start = {x: bounds.x + bounds.width * .65, y: bounds.y + bounds.height * .55};
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(start.x + Math.min(70, bounds.width * .15), start.y - 20, {steps: 10}); await page.mouse.up();
  }
  await page.waitForFunction(() => window.__wavefrontMeasurement.data.operation?.feedbackFrameMs != null);
  const timing = await page.evaluate(() => window.__wavefrontMeasurement.data.operation);
  assert.ok(timing.feedbackFrameMs > 0);
  assert.equal(timing.front.fanRevision, timing.fanRevision);
  assert.equal(timing.front.preparationCount, timing.preparationCount);
  if (kind === 'orbit') { assert.notEqual(timing.beforeCamera, timing.afterCamera); assert.ok(timing.beforeCutNormals); assert.equal(timing.beforeCutNormals, timing.afterCutNormals); }
  else assert.equal(timing.front.catalogTimeS, 180.1);
  report.operations.push({viewport, round: round + 1, ...timing, longTaskCount: timing.longTasks.length});
}
async function playback(page, viewport, round, scenario) {
  const {selected, startS} = await selectScenario(page, scenario);
  await page.getByLabel('Playback speed', {exact: true}).selectOption('10');
  await page.getByRole('button', {name: 'Play earthquake replay', exact: true}).click();
  await page.locator('#earth-globe').scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
  const before = await frontState(page);
  await page.evaluate(phases => window.__wavefrontMeasurement.playback(phases, 3000), scenario.requiredPhases);
  await page.waitForFunction(() => window.__wavefrontMeasurement.data.playback?.end);
  const timing = await page.evaluate(() => window.__wavefrontMeasurement.data.playback);
  await page.getByRole('button', {name: 'Pause earthquake replay', exact: true}).click();
  const after = await frontState(page);
  assert.ok(timing.samples > 100, `Actual visible fronts must cover the window. ${JSON.stringify(timing.rejected)}`);
  assert.equal(timing.skippedFrames, 0, `Every timed frame must contain the required actual geometry. ${JSON.stringify(timing.rejected)}`);
  assert.ok(timing.lastClockS - timing.firstClockS > 20);
  assert.equal(timing.maximumClockErrorS, 0);
  for (const phase of scenario.requiredPhases) {
    const first = timing.firstFront.phases.find(item => item.phase === phase);
    const last = timing.lastFront.phases.find(item => item.phase === phase);
    assert.notDeepEqual(first.samples.map(sample => sample.modelPosition), last.samples.map(sample => sample.modelPosition), `${phase} actual GPU vertices must advance.`);
    for (const frame of [first, last]) for (const sample of frame.samples) {
      assert.ok(sample.timeS >= 0 && sample.timeS <= sample.endTimeS);
      assert.ok(Math.abs(6371 * (1 - Math.hypot(...sample.modelPosition)) - sample.depthKm) < 1e-3);
    }
  }
  assert.equal(after.stats.completed, before.stats.completed, 'Completed numerical jobs must not increase during playback.');
  assert.equal(after.front.fanRevision, before.front.fanRevision);
  assert.equal(after.front.preparationCount, before.front.preparationCount);
  assert.equal(after.cutNormals, before.cutNormals);
  report.playback.push({viewport, round: round + 1, scenario: scenario.name, startS, ...timing, frameGapsMs: summary(timing.gaps), longTaskCount: timing.longTasks.length, longestTaskMs: Math.max(0, ...timing.longTasks.map(task => task.duration)), exactSelectedPathSamples: selected.path.length, selectedTurningDepthKm: selected.turning_depth_km, completedJobs: after.stats.completed - before.stats.completed, before, after});
  console.log(`${viewport} ${round + 1} ${scenario.name}: ${summary(timing.gaps).median.toFixed(1)} ms median, ${summary(timing.gaps).maximum.toFixed(1)} ms maximum, ${timing.samples} actual front samples`);
  if (!round) { await page.locator('#earth-globe').scrollIntoViewIfNeeded(); await page.screenshot({path: path.join(evidenceDir, `${viewport}-${scenario.name}.png`)}); }
}
async function arrivalCheck(page, viewport, round) {
  const button = page.locator('[data-station-arrival][data-station-id="IU.TATO.00.BHZ"][data-phase="P"]').first();
  const arrivalS = Number(await button.getAttribute('data-time-s'));
  assert.ok(arrivalS > 0);
  await button.click(); await ready(page);
  const state = await page.evaluate(() => window.workbench.state);
  assert.equal(state.experiment.stationId, 'IU.TATO.00.BHZ'); assert.equal(state.experiment.phase, 'P');
  assert.equal(state.experiment.timeS, arrivalS);
  const exact = state.snapshot.arrivals.filter(arrival => arrival.phase === 'P')[state.experiment.branch];
  assert.ok(Math.abs(exact.time_s + state.snapshot.originOffsetS - arrivalS) < 1e-7);
  const front = await frontState(page);
  const cursorS = Number(await page.locator('#wave-cursor').getAttribute('data-time-s'));
  assert.equal(cursorS, arrivalS); assert.equal(front.front.catalogTimeS, arrivalS);
  const markerTimes = await page.locator('#waveform [data-kind="prediction"][data-phase="P"]').evaluateAll(markers => markers.map(marker => Number(marker.dataset.timeS)));
  assert.ok(markerTimes.some(timeS => Math.abs(timeS - arrivalS) < 1e-7));
  const reachedCue = front.front.stationCues.find(cue => cue.stationId === state.experiment.stationId && cue.phase === 'P' && cue.branch === state.experiment.branch);
  assert.equal(reachedCue.reached, true); assert.equal(reachedCue.pulse, 1);
  assert.equal(await button.getAttribute('data-reached'), 'true');
  await page.getByLabel('Replay time in seconds after catalog origin').fill(canonicalTime(arrivalS - 1));
  const rewound = await frontState(page);
  const rewoundCue = rewound.front.stationCues.find(cue => cue.stationId === state.experiment.stationId && cue.phase === 'P' && cue.branch === state.experiment.branch);
  assert.equal(rewoundCue.reached, false); assert.equal(rewoundCue.pulse, 0);
  assert.equal(await button.getAttribute('data-reached'), 'false');
  report.arrivalChecks.push({viewport, round: round + 1, station: state.experiment.stationId, phase: state.experiment.phase, exactTravelTimeS: exact.time_s, arrivalS, cursorS, frontClockS: front.front.catalogTimeS, reachedCue, rewoundCue});
}
async function profile() {
  const context = await browser.newContext({viewport: {width: 1440, height: 1080}, deviceScaleFactor: 1}); contexts.add(context);
  await context.addInitScript(() => { window.__wavefrontWindowErrors = []; window.addEventListener('error', event => window.__wavefrontWindowErrors.push({message: event.message, filename: event.filename, line: event.lineno})); });
  const page = await context.newPage(); watch(page);
  await page.goto(url); await ready(page); await selectScenario(page, scenarios[1]);
  await page.getByLabel('Playback speed', {exact: true}).selectOption('10');
  await page.getByRole('button', {name: 'Play earthquake replay', exact: true}).click(); await page.locator('#earth-globe').scrollIntoViewIfNeeded();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
  await page.waitForTimeout(3500);
  const result = (await cdp.send('Profiler.stop')).profile;
  fs.writeFileSync(path.join(evidenceDir, 'wavefronts-main.cpuprofile'), JSON.stringify(result));
  const nodes = new Map(result.nodes.map(node => [node.id, node.callFrame])); const counts = new Map();
  for (const sample of result.samples ?? []) counts.set(sample, (counts.get(sample) ?? 0) + 1);
  report.profile = {purpose: 'Separate untimed visible native PKIKP front playback. Excluded from all timing samples.', samples: result.samples?.length, hotspots: [...counts].map(([id, samples]) => ({samples, ...nodes.get(id)})).sort((a, b) => b.samples - a.samples).slice(0, 35), render: await frontState(page)};
  for (const error of await page.evaluate(() => window.__wavefrontWindowErrors)) report.errors.push(`profile window error ${JSON.stringify(error)}`);
  await context.close(); contexts.delete(context);
}
function watch(page) {
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
}
try {
  for (let attempt = 0; ; attempt++) {
    assert.equal(server.exitCode, null, 'Owned preview exited. Inspect server.log for a port conflict.');
    try { if (stripVTControlCharacters(fs.readFileSync(path.join(evidenceDir, 'server.log'), 'utf8')).includes(url) && (await fetch(url)).ok) break; } catch {}
    assert.ok(attempt < 80); await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({channel: 'chrome', headless: true}); report.environment.chrome = browser.version();
  const cdp = await browser.newBrowserCDPSession(); const systemInfo = await cdp.send('SystemInfo.getInfo');
  report.environment.gpu = {devices: systemInfo.gpu.devices, featureStatus: systemInfo.gpu.featureStatus, renderer: systemInfo.gpu.auxAttributes?.glRenderer, displayType: systemInfo.gpu.auxAttributes?.displayType}; await cdp.detach();
  for (let round = 0; round < rounds; round++) for (const viewport of round % 2 ? ['mobile', 'desktop'] : ['desktop', 'mobile']) {
    const context = await browser.newContext({viewport: viewport === 'desktop' ? {width: 1440, height: 1080} : {width: 390, height: 844}, deviceScaleFactor: 1}); contexts.add(context);
    await context.addInitScript(() => { window.__wavefrontWindowErrors = []; window.addEventListener('error', event => window.__wavefrontWindowErrors.push({message: event.message, filename: event.filename, line: event.lineno})); });
    const page = await context.newPage(); watch(page); const navigationStarted = Date.now();
    await page.goto(url); await ready(page); await enableFronts(page);
    report.preparation.push({viewport, round: round + 1, firstReadyWallMs: Date.now() - navigationStarted, label: 'One initial navigation per fresh context. Includes app, texture, paths and fan preparation. Not an isolated fan benchmark or warm interaction.', render: await frontState(page)});
    await instrument(page); await selectScenario(page, scenarios[0]);
    await operation(page, viewport, round, 'seek'); await operation(page, viewport, round, 'orbit');
    for (const scenario of scenarios) await playback(page, viewport, round, scenario);
    await arrivalCheck(page, viewport, round);
    for (const error of await page.evaluate(() => window.__wavefrontWindowErrors)) report.errors.push(`window error ${JSON.stringify(error)}`);
    await context.close(); contexts.delete(context);
  }
  await profile(); report.summary = {interaction: {}, playback: {}};
  for (const viewport of ['desktop', 'mobile']) {
    for (const kind of ['seek', 'orbit']) {
      const trials = report.operations.filter(item => item.viewport === viewport && item.kind === kind);
      report.summary.interaction[`${viewport}-${kind}`] = {feedbackFrameMs: summary(trials.map(item => item.feedbackFrameMs)), longTasks: trials.reduce((sum, item) => sum + item.longTaskCount, 0)};
    }
    for (const scenario of scenarios) {
      const trials = report.playback.filter(item => item.viewport === viewport && item.scenario === scenario.name);
      report.summary.playback[`${viewport}-${scenario.name}`] = {pooledFrameGapsMs: summary(trials.flatMap(item => item.gaps)), trialMedianFrameGapMs: summary(trials.map(item => item.frameGapsMs.median)), trialMaximumFrameGapMs: summary(trials.map(item => item.frameGapsMs.maximum)), longTasks: trials.reduce((sum, item) => sum + item.longTaskCount, 0), actualFrontSamples: trials.reduce((sum, item) => sum + item.samples, 0), skippedFrames: trials.reduce((sum, item) => sum + item.skippedFrames, 0)};
    }
  }
  for (const [file, digest] of Object.entries(sourceHashes)) assert.equal(hash(file), digest, `Source changed during run ${file}`);
  assert.deepEqual(report.errors, []); report.verdict = 'PASS';
} catch (error) { report.errors.push(error.stack || String(error)); report.verdict = 'FAIL'; process.exitCode = 1; }
finally {
  for (const context of contexts) await context.close();
  if (browser) await browser.close();
  if (server.exitCode === null) { const ended = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await ended; }
  fs.closeSync(log); report.finishedAt = new Date().toISOString(); report.environment.loadAfter = os.loadavg(); report.environment.busiestProcessesAfter = busyProcesses(); report.serverExitCode = server.exitCode; report.serverSignal = server.signalCode;
  fs.writeFileSync(path.join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({verdict: report.verdict, operations: report.operations.length, playback: report.playback.length, arrivalChecks: report.arrivalChecks.length, summary: report.summary, errors: report.errors, evidenceDir}, null, 2));
}
