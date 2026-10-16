#!/usr/bin/env node
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripVTControlCharacters} from 'node:util';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';

const evidenceDir = path.resolve(process.env.TAUP_EVIDENCE || '.audit/globe/performance');
const port = Number(process.env.TAUP_PORT || 5195);
const rounds = Number(process.env.TAUP_ROUNDS ?? 5);
assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 20);
const url = `http://127.0.0.1:${port}/`;
fs.mkdirSync(evidenceDir, {recursive: true});
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files = ['index.html', 'package.json', 'package-lock.json', 'scripts/measure-globe.mjs', 'crates/taup-core/src/lib.rs', 'fixtures/iasp91.json', 'fixtures/investigation/tohoku-investigation.json', 'fixtures/events/okhotsk-2013/case.json'];
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
const scenarios = [
  {name: 'mantle-P', event: 'tohoku-2011', station: 'IU.ANMO.00.BHZ', phase: 'P', fraction: .35},
  {name: 'mantle-S', event: 'tohoku-2011', station: 'IU.ANMO.00.BHZ', phase: 'S', fraction: .35},
  {name: 'inner-core-PKIKP', event: 'tohoku-2011', station: 'IU.LVC.00.BHZ', phase: 'PKIKP', fraction: .45},
];
const report = {
  claim: 'The release 3D Earth remains responsive during visible, textured cutaway playback of actual P, S and PKIKP packets and during a public camera drag. This is an absolute same-host browser measurement with no speedup comparison.',
  startedAt: new Date().toISOString(), url, sourceHashes, scenarios,
  environment: {platform: process.platform, architecture: process.arch, cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, loadBefore: os.loadavg(), busiestProcessesBefore: busyProcesses(), uptime: spawnSync('uptime', {encoding: 'utf8'}).stdout.trim(), node: process.version, headless: true, deviceScaleFactor: 1, physicalMobileDevice: false},
  method: {
    repetitionsPerViewport: rounds,
    order: 'Desktop then 390 px in even rounds, 390 px then desktop in odd rounds. Fresh context and calculation Worker per viewport trial. Scenarios use the same completed numerical snapshot until station selection requires a new one.',
    playback: 'Three-second settled playback windows. A sample requires the textured 3D canvas to be at least half in the viewport, replay active, an actual interpolated selected packet, and open cutaway. No screenshots, tracing or state cloning occurs during a timed window. Read-only rendering diagnostics establish work.',
    interaction: 'Trusted Open Earth click to the next requestAnimationFrame after the pressed state changed. Camera drag starts at the trusted pointerdown and finishes at the first requestAnimationFrame with changed camera diagnostics. These are application frame opportunities, not physical display latency or INP.',
    longTasks: 'Chrome PerformanceObserver longtask entries overlapping each interval. Main-thread tasks of at least 50 ms.',
    profile: 'A separate untimed CPU profile runs only after all measurements. Browser frame cadence and JS CPU hotspots bound interpretation. GPU completion is not independently measured.',
    limits: 'Production release build, DPR 1, headless installed Chrome using the host GPU. A 390 px viewport is a layout and responsiveness check on this computer, not a physical phone result. A frame cadence near 16.7 ms is browser scheduling evidence, not proof of GPU headroom or physical 60 fps.',
  },
  operations: [], playback: [], errors: [], profile: null,
};
const log = fs.openSync(path.join(evidenceDir, 'server.log'), 'w');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {stdio: ['ignore', log, log]});
const contexts = new Set();
let browser;

async function ready(page, event) {
  await page.waitForFunction(key => (window.workbench?.ready || window.workbench?.error) && (!key || window.workbench.state.investigation.key === key), event, {timeout: 60000});
  assert.equal(await page.evaluate(() => window.workbench.error), null);
  await page.waitForFunction(() => document.getElementById('earth-globe')?.dataset.earthTexture === 'ready', undefined, {timeout: 30000});
}

async function instrument(page) {
  await page.evaluate(() => {
    const data = {tasks: [], operation: null, playback: null};
    let armed = null;
    let lastFrame = null;
    const visible = element => {
      if (!element || element.hidden || getComputedStyle(element).display === 'none') return false;
      const bounds = element.getBoundingClientRect();
      const area = bounds.width * bounds.height;
      return area > 0 && Math.max(0, Math.min(innerWidth, bounds.right) - Math.max(0, bounds.left)) * Math.max(0, Math.min(innerHeight, bounds.bottom) - Math.max(0, bounds.top)) >= area * .5;
    };
    new PerformanceObserver(list => data.tasks.push(...list.getEntries().map(item => ({startTime: item.startTime, duration: item.duration})))).observe({type: 'longtask', buffered: true});
    const camera = () => {
      const value = document.getElementById('earth-globe').dataset;
      return [value.cameraAzimuth, value.cameraElevation, value.cameraDistance].join('|');
    };
    function begin(event) {
      if (!armed || !event.isTrusted) return;
      const match = armed.kind === 'cutaway' ? event.type === 'click' && event.target.closest('#cutaway') : event.type === 'pointerdown' && event.target.id === 'earth-globe';
      if (!match) return;
      data.operation = {...armed, start: performance.now(), beforeCamera: camera(), beforeCutNormals: document.getElementById('earth-globe').dataset.cutNormals, feedbackDomMs: null, feedbackFrameMs: null};
      armed = null;
    }
    document.addEventListener('click', begin, true);
    document.addEventListener('pointerdown', begin, true);
    new MutationObserver(() => {
      const operation = data.operation;
      if (!operation || operation.feedbackDomMs !== null) return;
      const done = operation.kind === 'cutaway' ? document.getElementById('cutaway').getAttribute('aria-pressed') === 'true' : camera() !== operation.beforeCamera;
      if (done) {
        operation.feedbackDomMs = performance.now() - operation.start;
        requestAnimationFrame(() => {
          operation.end = performance.now(); operation.feedbackFrameMs = operation.end - operation.start;
          operation.afterCamera = camera(); operation.afterCutNormals = document.getElementById('earth-globe').dataset.cutNormals;
          operation.longTasks = data.tasks.filter(task => task.startTime < operation.end && task.startTime + task.duration > operation.start);
        });
      }
    }).observe(document.getElementById('app'), {subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'data-camera-azimuth', 'data-camera-elevation', 'data-camera-distance']});
    function frame(now) {
      const playback = data.playback;
      if (playback && !playback.end) {
        const canvas = document.getElementById('earth-globe');
        const active = document.getElementById('play').getAttribute('aria-label') === 'Pause earthquake replay';
        if (active && visible(canvas) && canvas.dataset.selectedPacket && document.getElementById('cutaway').getAttribute('aria-pressed') === 'true') {
          const packet = JSON.parse(canvas.dataset.selectedPacket);
          const bounds = canvas.getBoundingClientRect();
          const [screenX, screenY] = packet.screenPosition ?? [NaN, NaN];
          const packetVisible = packet.onScreen && screenX + bounds.left >= 0 && screenX + bounds.left <= innerWidth && screenY + bounds.top >= 0 && screenY + bounds.top <= innerHeight;
          if (packet.phase === playback.phase && packetVisible) {
            if (lastFrame !== null) playback.gaps.push(now - lastFrame);
            lastFrame = now; playback.samples++;
            playback.firstClockS ??= Number(canvas.dataset.playbackTimeS); playback.lastClockS = Number(canvas.dataset.playbackTimeS);
            playback.firstPacket ??= packet; playback.lastPacket = packet;
          } else { lastFrame = null; playback.skippedFrames++; }
        } else { lastFrame = null; playback.skippedFrames++; }
        if (performance.now() - playback.start >= playback.durationMs) {
          playback.end = performance.now(); playback.elapsedMs = playback.end - playback.start;
          playback.longTasks = data.tasks.filter(task => task.startTime < playback.end && task.startTime + task.duration > playback.start);
          lastFrame = null;
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    Object.defineProperty(window, '__globeMeasurement', {value: {data, arm(value) { armed = value; data.operation = null; }, playback(phase, durationMs) { data.playback = {phase, durationMs, start: performance.now(), gaps: [], samples: 0, skippedFrames: 0}; lastFrame = null; }}});
  });
}

async function selectScenario(page, scenario) {
  const selectedEvent = await page.getByLabel('Earthquake investigation', {exact: true}).inputValue();
  if (selectedEvent !== scenario.event) { await page.getByLabel('Earthquake investigation', {exact: true}).selectOption(scenario.event); await ready(page, scenario.event); }
  await page.locator('button[data-mode="explore"]').click(); await ready(page);
  await page.locator('[data-interior="globe"]').click();
  await page.getByLabel('Recording station', {exact: true}).selectOption(scenario.station); await ready(page);
  await page.getByLabel('Seismic phase', {exact: true}).selectOption(scenario.phase);
  await page.getByRole('button', {name: 'Focus selected ray section', exact: true}).click();
  const state = await page.evaluate(() => window.workbench.state);
  const selected = state.snapshot.arrivals.filter(arrival => arrival.phase === scenario.phase)[state.experiment.branch];
  assert.ok(selected && selected.path.length > 30, `${scenario.name} must have an actual calculated path.`);
  assert.equal(state.error, '');
  return {state, selected};
}

async function operation(page, viewport, round, kind) {
  if (kind === 'cutaway' && await page.locator('#cutaway').getAttribute('aria-pressed') === 'true') await page.locator('#cutaway').click();
  const canvas = page.locator('#earth-globe');
  if (kind === 'orbit') await canvas.scrollIntoViewIfNeeded();
  await page.evaluate(value => window.__globeMeasurement.arm({kind: value}), kind);
  if (kind === 'cutaway') await page.locator('#cutaway').click();
  else {
    const bounds = await canvas.boundingBox();
    const start = {x: bounds.x + bounds.width * .65, y: bounds.y + bounds.height * .55};
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(start.x + Math.min(100, bounds.width * .2), start.y - 35, {steps: 12}); await page.mouse.up();
  }
  await page.waitForFunction(() => window.__globeMeasurement.data.operation?.feedbackFrameMs !== null && window.__globeMeasurement.data.operation?.feedbackFrameMs !== undefined);
  const timing = await page.evaluate(() => window.__globeMeasurement.data.operation);
  assert.ok(timing.feedbackFrameMs > 0);
  if (kind === 'orbit') {
    assert.notEqual(timing.beforeCamera, timing.afterCamera);
    assert.ok(timing.beforeCutNormals, 'An actual Earth-coordinate cut opening must exist.');
    assert.equal(timing.beforeCutNormals, timing.afterCutNormals, 'Camera motion must not rotate the cut geometry.');
  }
  report.operations.push({viewport, round: round + 1, ...timing, longTaskCount: timing.longTasks.length});
}

async function playback(page, viewport, round, scenario) {
  const {state, selected} = await selectScenario(page, scenario);
  if (await page.locator('#cutaway').getAttribute('aria-pressed') !== 'true') await page.locator('#cutaway').click();
  let startS = selected.time_s * scenario.fraction;
  if (scenario.phase === 'PKIKP') {
    const core = selected.path.filter(point => point.depth_km > 5154);
    assert.ok(core.length > 2, 'PKIKP must cross the inner core.');
    startS = core[0].time_s;
  }
  await page.getByLabel('Replay time in seconds after catalog origin').fill((Math.round(startS * 10) / 10).toFixed(1));
  await page.getByLabel('Playback speed', {exact: true}).selectOption('10');
  await page.getByRole('button', {name: 'Play earthquake replay', exact: true}).click();
  await page.locator('#earth-globe').scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
  const before = await page.evaluate(() => ({stats: window.workbench.state.stats, dataset: {...document.getElementById('earth-globe').dataset}}));
  assert.equal(before.dataset.earthTexture, 'ready', 'The local Earth texture must be decoded and used.');
  assert.ok(before.dataset.selectedPacket, 'An actual packet must be visible before timing.');
  assert.equal(JSON.parse(before.dataset.selectedPacket).onScreen, true);
  const drawnPath = JSON.parse(before.dataset.selectedPath);
  assert.equal(drawnPath.phase, scenario.phase);
  assert.equal(drawnPath.fullPointCount, selected.path.length);
  assert.equal(drawnPath.guideSegmentCount, selected.path.length - 1);
  assert.ok(drawnPath.completedSegmentCount > 0 && drawnPath.completedSegmentCount < selected.path.length);
  await page.evaluate(phase => window.__globeMeasurement.playback(phase, 3000), scenario.phase);
  await page.waitForFunction(() => window.__globeMeasurement.data.playback?.end);
  const timing = await page.evaluate(() => window.__globeMeasurement.data.playback);
  await page.getByRole('button', {name: 'Pause earthquake replay', exact: true}).click();
  const after = await page.evaluate(() => ({stats: window.workbench.state.stats, dataset: {...document.getElementById('earth-globe').dataset}}));
  assert.ok(timing.samples > 100, 'Visible actual packets must cover most of the window.');
  assert.ok(timing.lastClockS - timing.firstClockS > 20, 'The shared replay clock must advance.');
  assert.notDeepEqual(timing.firstPacket.modelPosition, timing.lastPacket.modelPosition, 'The calculated packet must move.');
  for (const packet of [timing.firstPacket, timing.lastPacket]) {
    assert.ok(packet.index > 0 && packet.index < selected.path.length);
    assert.ok(packet.timeS >= selected.path[packet.index - 1].time_s && packet.timeS <= selected.path[packet.index].time_s);
    const depthKm = 6371 * (1 - Math.hypot(...packet.modelPosition));
    assert.ok(depthKm >= 0 && depthKm <= selected.turning_depth_km + 1, 'The packet must remain within its physical ray depth.');
    if (scenario.name === 'inner-core-PKIKP') assert.ok(depthKm > 5153.9, 'The timed PKIKP packet must cross the actual inner core.');
  }
  assert.equal(after.stats.completed, before.stats.completed, 'Playback reuses the completed scientific path.');
  report.playback.push({viewport, round: round + 1, scenario: scenario.name, ...timing, frameGapsMs: summary(timing.gaps), longTaskCount: timing.longTasks.length, longestTaskMs: Math.max(0, ...timing.longTasks.map(task => task.duration)), pathSamples: selected.path.length, turningDepthKm: selected.turning_depth_km, stationSummaries: state.snapshot.stationArrivals.length, networkRays: state.snapshot.networkRays.length, completedJobs: after.stats.completed - before.stats.completed, renderBefore: before.dataset, renderAfter: after.dataset});
  console.log(`${viewport} ${round + 1} ${scenario.name}: ${summary(timing.gaps).median.toFixed(1)} ms median, ${summary(timing.gaps).maximum.toFixed(1)} ms maximum, ${timing.samples} actual packets`);
  if (!round) { await page.locator('#earth-globe').scrollIntoViewIfNeeded(); await page.screenshot({path: path.join(evidenceDir, `${viewport}-${scenario.name}.png`)}); }
}

async function profile() {
  const context = await browser.newContext({viewport: {width: 1440, height: 1080}, deviceScaleFactor: 1}); contexts.add(context);
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(url); await ready(page);
  await selectScenario(page, scenarios[2]);
  if (await page.locator('#cutaway').getAttribute('aria-pressed') !== 'true') await page.locator('#cutaway').click();
  await page.getByLabel('Replay time in seconds after catalog origin').fill('700');
  await page.getByLabel('Playback speed', {exact: true}).selectOption('10');
  await page.getByRole('button', {name: 'Play earthquake replay', exact: true}).click();
  await page.locator('#earth-globe').scrollIntoViewIfNeeded();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
  await page.waitForTimeout(3500);
  const result = (await cdp.send('Profiler.stop')).profile;
  fs.writeFileSync(path.join(evidenceDir, 'globe-main.cpuprofile'), JSON.stringify(result));
  const nodes = new Map(result.nodes.map(node => [node.id, node.callFrame]));
  const counts = new Map();
  for (const sample of result.samples ?? []) counts.set(sample, (counts.get(sample) ?? 0) + 1);
  report.profile = {purpose: 'Separate untimed actual textured 3D PKIKP cutaway playback. Excluded from all timing samples.', samples: result.samples?.length, hotspots: [...counts].map(([id, samples]) => ({samples, ...nodes.get(id)})).sort((a, b) => b.samples - a.samples).slice(0, 30), render: await page.locator('#earth-globe').evaluate(canvas => ({...canvas.dataset}))};
  await context.close(); contexts.delete(context);
}

try {
  for (let attempt = 0; ; attempt++) {
    assert.equal(server.exitCode, null, 'Owned preview exited. Inspect server.log for a port conflict.');
    try {
      if (stripVTControlCharacters(fs.readFileSync(path.join(evidenceDir, 'server.log'), 'utf8')).includes(url) && (await fetch(url)).ok) break;
    } catch {}
    assert.ok(attempt < 80); await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({channel: 'chrome', headless: true}); report.environment.chrome = browser.version();
  const cdp = await browser.newBrowserCDPSession();
  const systemInfo = await cdp.send('SystemInfo.getInfo');
  report.environment.gpu = {devices: systemInfo.gpu.devices, featureStatus: systemInfo.gpu.featureStatus, renderer: systemInfo.gpu.auxAttributes?.glRenderer, displayType: systemInfo.gpu.auxAttributes?.displayType}; await cdp.detach();
  for (let round = 0; round < rounds; round++) for (const viewport of round % 2 ? ['mobile', 'desktop'] : ['desktop', 'mobile']) {
    const context = await browser.newContext({viewport: viewport === 'desktop' ? {width: 1440, height: 1080} : {width: 390, height: 844}, deviceScaleFactor: 1}); contexts.add(context);
    await context.addInitScript(() => { window.__globeWindowErrors = []; window.addEventListener('error', event => window.__globeWindowErrors.push({message: event.message, filename: event.filename, line: event.lineno})); });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(url); await ready(page); await instrument(page);
    await selectScenario(page, scenarios[0]);
    await operation(page, viewport, round, 'cutaway'); await operation(page, viewport, round, 'orbit');
    for (const scenario of scenarios) await playback(page, viewport, round, scenario);
    for (const error of await page.evaluate(() => window.__globeWindowErrors)) report.errors.push(`window error ${JSON.stringify(error)}`);
    await context.close(); contexts.delete(context);
  }
  await profile();
  report.summary = {interaction: {}, playback: {}};
  for (const viewport of ['desktop', 'mobile']) {
    for (const kind of ['cutaway', 'orbit']) {
      const trials = report.operations.filter(item => item.viewport === viewport && item.kind === kind);
      report.summary.interaction[`${viewport}-${kind}`] = {feedbackFrameMs: summary(trials.map(item => item.feedbackFrameMs)), longTasks: trials.reduce((sum, item) => sum + item.longTaskCount, 0)};
    }
    for (const scenario of scenarios) {
      const trials = report.playback.filter(item => item.viewport === viewport && item.scenario === scenario.name);
      report.summary.playback[`${viewport}-${scenario.name}`] = {pooledFrameGapsMs: summary(trials.flatMap(item => item.gaps)), trialMaximumFrameGapMs: summary(trials.map(item => item.frameGapsMs.maximum)), longTasks: trials.reduce((sum, item) => sum + item.longTaskCount, 0), actualPacketSamples: trials.reduce((sum, item) => sum + item.samples, 0)};
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
  console.log(JSON.stringify({verdict: report.verdict, operations: report.operations.length, playback: report.playback.length, summary: report.summary, errors: report.errors, evidenceDir}, null, 2));
}
