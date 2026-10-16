#!/usr/bin/env node
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';

const evidenceDir = path.resolve(process.env.TAUP_EVIDENCE || '.audit/atlas/performance');
const port = Number(process.env.TAUP_PORT || 4192);
const rounds = Number(process.env.TAUP_ROUNDS ?? 5);
assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 20);
const url = `http://127.0.0.1:${port}/`;
fs.mkdirSync(evidenceDir, {recursive: true});
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files = ['index.html', 'package.json', 'package-lock.json', 'docs/atlas-contract.md', 'scripts/measure-atlas.mjs', 'crates/taup-core/src/lib.rs', 'fixtures/iasp91.json', 'fixtures/investigation/tohoku-investigation.json', 'fixtures/observed/tohoku-2011.json', 'fixtures/events/maule-2010/case.json', 'fixtures/events/okhotsk-2013/case.json'];
function addFiles(directory, filter) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) addFiles(file, filter);
    else if (filter(file)) files.push(file);
  }
}
addFiles('web', file => /\.(js|css|wasm)$/.test(file));
addFiles('dist', () => true);
const sourceHashes = Object.fromEntries([...new Set(files)].sort().map(file => [file, hash(file)]));
const busyProcesses = () => spawnSync('ps', ['-axo', 'pid,pcpu,comm'], {encoding: 'utf8'}).stdout.trim().split('\n').slice(1).map(line => line.trim().match(/^(\d+)\s+([\d.]+)\s+(.+)$/)).filter(Boolean).map(([, pid, cpuPercent, executable]) => ({pid: Number(pid), cpuPercent: Number(cpuPercent), executable})).sort((a, b) => b.cpuPercent - a.cpuPercent).slice(0, 12);
const summary = values => {
  const sorted = values.toSorted((a, b) => a - b);
  return {count: sorted.length, median: sorted[Math.floor(sorted.length / 2)] ?? null, minimum: sorted[0] ?? null, maximum: sorted.at(-1) ?? null, p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))] ?? null};
};
const report = {
  claim: 'The production earthquake atlas is measured while actual calculated rays and synchronized packets remain visible. First travel-time preparation, cached diagrams, record-section rendering, and whole-event switches have separate costs.',
  startedAt: new Date().toISOString(), url, sourceHashes,
  environment: {platform: process.platform, architecture: process.arch, cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, loadBefore: os.loadavg(), busiestProcessesBefore: busyProcesses(), uptime: spawnSync('uptime', {encoding: 'utf8'}).stdout.trim(), node: process.version, headless: true, deviceScaleFactor: 1, physicalMobileDevice: false},
  method: {repetitionsPerViewport: rounds, order: 'Desktop then mobile in even rounds, mobile then desktop in odd rounds. New context and Worker for every cold diagram. Warm diagram reuses completed diagram in the same case lifetime. OS and browser executable caches are not flushed.', playback: 'Three-second steady windows after the trusted Play action and viewport settling. A frame counts only when at least half the selected globe or section is visible, replay is active, and an actual interpolated selected packet exists. Full ray paths remain present. No trace, screenshot or state cloning occurs in timed windows.', feedback: 'Trusted button click or public select change-event capture to pending/selected DOM mutation, then its next requestAnimationFrame opportunity. Playwright selectOption emits the public change event. This is not physical display or INP latency.', endToEnd: 'Public input event to first animation-frame opportunity with its actual plot or new event recording network settled. Includes Worker computation, transfers, DOM rendering and frame scheduling.', longTasks: 'Chrome PerformanceObserver longtask entries overlapping each interval. Chrome reports main-thread tasks of at least 50 ms.', isolation: 'Production release build. Same host and headless Chrome for desktop and 390 px viewport. This is not a physical phone measurement. No speedup comparison with the previous fit benchmark is claimed.'},
  operations: [], playback: [], errors: [], profiles: {},
};
const log = fs.openSync(path.join(evidenceDir, 'server.log'), 'w');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {stdio: ['ignore', log, log]});
const contexts = new Set();
let browser;

async function ready(page) {
  await page.waitForFunction(() => window.workbench?.ready || window.workbench?.error, undefined, {timeout: 60000});
  assert.equal(await page.evaluate(() => window.workbench.error), null);
}

async function watchWindowErrors(context) {
  await context.addInitScript(() => {
    window.__atlasWindowErrors = [];
    window.addEventListener('error', event => window.__atlasWindowErrors.push({message: event.message, filename: event.filename, line: event.lineno, column: event.colno}));
  });
}

async function collectWindowErrors(page) {
  for (const error of await page.evaluate(() => window.__atlasWindowErrors)) report.errors.push(`window error: ${JSON.stringify(error)}`);
}

async function instrument(page) {
  await page.evaluate(() => {
    const data = {operation: null, playback: null, tasks: []};
    let config = null;
    let lastFrame = null;
    const visible = element => {
      if (!element || element.hidden || getComputedStyle(element).display === 'none') return false;
      const bounds = element.getBoundingClientRect();
      const area = bounds.width * bounds.height;
      return area > 0 && Math.max(0, Math.min(innerWidth, bounds.right) - Math.max(0, bounds.left)) * Math.max(0, Math.min(innerHeight, bounds.bottom) - Math.max(0, bounds.top)) >= area * .5;
    };
    const taskObserver = new PerformanceObserver(list => data.tasks.push(...list.getEntries().map(item => ({startTime: item.startTime, duration: item.duration}))));
    taskObserver.observe({type: 'longtask', buffered: true});
    const matches = event => config && (config.kind === 'event' ? event.type === 'change' && event.target.id === 'event' : event.isTrusted && event.type === 'click' && event.target.closest(`[data-evidence="${config.view}"]`));
    const begin = event => {
      if (!matches(event)) return;
      data.operation = {...config, start: performance.now(), feedbackDomMs: null, feedbackFrameMs: null, endToEndMs: null};
      config = null;
    };
    document.addEventListener('click', begin, true);
    document.addEventListener('change', begin, true);
    new MutationObserver(() => {
      const item = data.operation;
      if (!item || item.feedbackDomMs !== null) return;
      const feedback = item.kind === 'event' ? document.querySelector('.workspace.calculating') || document.getElementById('event')?.value === item.event : document.querySelector(`[data-evidence="${item.view}"]`)?.getAttribute('aria-pressed') === 'true';
      if (feedback) {
        item.feedbackDomMs = performance.now() - item.start;
        requestAnimationFrame(() => { item.feedbackFrameMs = performance.now() - item.start; });
      }
    }).observe(document.getElementById('app'), {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden', 'aria-pressed']});
    function frame(now) {
      const item = data.operation;
      if (item && item.endToEndMs === null && item.feedbackDomMs !== null) {
        const target = item.kind === 'event' || item.view === 'records' ? document.getElementById('record-section') : document.getElementById('travel-time-diagram');
        const eventMatches = item.kind !== 'event' || document.getElementById('event')?.value === item.event;
        const count = item.kind === 'event' || item.view === 'records' ? target?.querySelectorAll('[data-kind="record-row"]').length : target?.querySelectorAll('[data-kind="sampled-root"]').length;
        if (window.workbench?.ready && target && count >= item.minimumCount && eventMatches) {
          item.end = performance.now(); item.endToEndMs = item.end - item.start; item.workCount = count;
          item.longTasks = data.tasks.filter(task => task.startTime < item.end && task.startTime + task.duration > item.start);
        }
      }
      const playback = data.playback;
      if (playback && !playback.end) {
        const target = document.getElementById(playback.target);
        const active = document.getElementById('play')?.getAttribute('aria-label') === 'Pause earthquake replay';
        if (active && visible(target) && target.dataset.selectedPacket) {
          if (lastFrame !== null) playback.gaps.push(now - lastFrame);
          lastFrame = now; playback.samples++;
          const time = Number(target.dataset.playbackTimeS);
          playback.firstClockS ??= time; playback.lastClockS = time;
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
    Object.defineProperty(window, '__atlasMeasurement', {value: {
      data,
      arm(value) { config = value; data.operation = null; },
      playback(target, durationMs) { data.playback = {target, durationMs, start: performance.now(), gaps: [], samples: 0, skippedFrames: 0}; lastFrame = null; },
    }});
  });
}

async function operation(page, viewport, round, config, act) {
  const before = await page.evaluate(() => window.workbench.state.stats);
  await page.evaluate(value => window.__atlasMeasurement.arm(value), config);
  await act();
  await page.waitForFunction(() => window.__atlasMeasurement.data.operation?.endToEndMs !== null && window.__atlasMeasurement.data.operation?.endToEndMs !== undefined, undefined, {timeout: 60000});
  const result = await page.evaluate(() => ({timing: window.__atlasMeasurement.data.operation, state: window.workbench.state}));
  assert.equal(result.state.error, '');
  assert.equal(result.state.diagramError, '');
  assert.ok(result.timing.feedbackDomMs !== null && result.timing.feedbackFrameMs !== null);
  const samples = result.state.diagram?.samples;
  const roots = samples?.reduce((sum, sample) => sum + sample.arrivals.length, 0) ?? 0;
  if (config.view === 'travel') {
    assert.equal(samples.length, 90); assert.equal(samples[0].distanceDeg, 1); assert.equal(samples.at(-1).distanceDeg, 179);
    assert.equal(result.timing.workCount, roots);
    assert.ok(samples.some(sample => !sample.arrivals.length), 'Empty sampled geometries remain represented.');
  }
  const completedJobs = config.kind === 'event' ? result.state.stats.completed : result.state.stats.completed - before.completed;
  if (config.cache === 'cold') assert.ok(completedJobs >= 1, 'A cold diagram must complete numerical Worker work.');
  if (config.cache === 'warm') assert.equal(completedJobs, 0, 'A retained diagram must not claim new numerical work.');
  const item = {viewport, round: round + 1, ...result.timing, completedJobs, longTaskCount: result.timing.longTasks.length, longestTaskMs: Math.max(0, ...result.timing.longTasks.map(task => task.duration)), investigation: result.state.investigation, source: result.state.snapshot.source, stations: result.state.snapshot.stationArrivals.length, networkRays: result.state.snapshot.networkRays.length, samples: samples?.length ?? 0, roots, diagramWorkerMs: result.state.diagram?.elapsedMs ?? null};
  report.operations.push(item);
  console.log(`${viewport} ${round + 1} ${config.kind}/${config.cache ?? config.view ?? config.event}: ${item.endToEndMs.toFixed(1)} ms; feedback frame ${item.feedbackFrameMs.toFixed(1)} ms; ${item.workCount} outputs`);
}

async function playback(page, viewport, round, view) {
  await page.locator(`button[data-mode="${view === 'section' ? 'explore' : 'replay'}"]`).click(); await ready(page);
  await page.getByLabel('Recording station', {exact: true}).selectOption('IU.LVC.00.BHZ'); await ready(page);
  await page.getByLabel('Seismic phase', {exact: true}).selectOption('PKIKP');
  if (view === 'section') await page.locator('[data-interior="section"]').click();
  else if (await page.locator('#cutaway').getAttribute('aria-pressed') !== 'true') await page.locator('#cutaway').click();
  await page.getByLabel('Replay time in seconds after catalog origin').fill('400');
  await page.getByLabel('Playback speed', {exact: true}).selectOption('30');
  await page.getByRole('button', {name: 'Play earthquake replay', exact: true}).click();
  const target = view === 'globe' ? 'earth-globe' : 'section-view';
  await page.locator(`#${target}`).scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => window.workbench.state);
  const selected = before.snapshot.arrivals.filter(arrival => arrival.phase === before.experiment.phase)[before.experiment.branch];
  assert.equal(before.experiment.phase, 'PKIKP'); assert.ok(selected.path.length > 100);
  assert.equal(before.snapshot.networkRays.length, view === 'globe' ? 9 : 0);
  await page.evaluate(id => window.__atlasMeasurement.playback(id, 3000), target);
  await page.waitForFunction(() => window.__atlasMeasurement.data.playback?.end);
  const timing = await page.evaluate(() => window.__atlasMeasurement.data.playback);
  await page.getByRole('button', {name: 'Pause earthquake replay', exact: true}).click();
  assert.ok(timing.samples > 100, 'Actual visible path packets must be sampled for most of the playback window.');
  assert.ok(timing.lastClockS - timing.firstClockS > 70, 'The shared model time must advance during measured playback.');
  const after = await page.evaluate(() => window.workbench.state);
  assert.equal(after.stats.completed, before.stats.completed, 'Steady playback must reuse actual calculated paths.');
  const item = {viewport, round: round + 1, view, ...timing, frameGapsMs: summary(timing.gaps), longTaskCount: timing.longTasks.length, longestTaskMs: Math.max(0, ...timing.longTasks.map(task => task.duration)), rayPhase: selected.phase, rayPathSamples: selected.path.length, networkRays: before.snapshot.networkRays.length, stationSummaries: before.snapshot.stationArrivals.length, completedJobs: after.stats.completed - before.stats.completed, clockAdvancedS: timing.lastClockS - timing.firstClockS};
  report.playback.push(item);
  console.log(`${viewport} ${round + 1} visible ${view}: ${item.frameGapsMs.median.toFixed(1)} ms median; ${item.frameGapsMs.maximum.toFixed(1)} ms max; ${item.samples} actual packets`);
}

async function profile() {
  const context = await browser.newContext({viewport: {width: 1440, height: 1080}}); contexts.add(context);
  await watchWindowErrors(context);
  const page = await context.newPage(); await page.goto(url); await ready(page);
  const cdp = await browser.newBrowserCDPSession();
  const {targetInfos} = await cdp.send('Target.getTargets');
  const target = targetInfos.find(info => info.type === 'worker' && info.url.includes('compute-worker'));
  assert.ok(target, 'Profile the actual production numerical Worker.');
  const {sessionId} = await cdp.send('Target.attachToTarget', {targetId: target.targetId, flatten: false});
  let sequence = 0;
  const requests = new Map();
  cdp.on('Target.receivedMessageFromTarget', event => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message); const request = requests.get(message.id);
    if (!request) return; requests.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result);
  });
  function send(method) {
    return new Promise((resolve, reject) => {
      const id = ++sequence; requests.set(id, {resolve, reject});
      cdp.send('Target.sendMessageToTarget', {sessionId, message: JSON.stringify({id, method})}).catch(reject);
    });
  }
  await send('Profiler.enable'); await send('Profiler.start');
  await page.locator('[data-evidence="travel"]').click();
  await page.waitForSelector('#travel-time-diagram');
  const workerProfile = (await send('Profiler.stop')).profile;
  fs.writeFileSync(path.join(evidenceDir, 'travel-worker.cpuprofile'), JSON.stringify(workerProfile));
  function hotspots(profile) {
    const nodes = new Map(profile.nodes.map(node => [node.id, node.callFrame]));
    const counts = new Map();
    for (const sample of profile.samples ?? []) counts.set(sample, (counts.get(sample) ?? 0) + 1);
    return [...counts].map(([id, samples]) => ({samples, ...nodes.get(id)})).sort((a, b) => b.samples - a.samples).slice(0, 25);
  }
  const state = await page.evaluate(() => window.workbench.state);
  report.profiles.worker = {purpose: 'Separate untimed cold 90-distance chart preparation. Not included in timing samples.', samples: workerProfile.samples?.length, hotspots: hotspots(workerProfile), roots: state.diagram.samples.reduce((sum, sample) => sum + sample.arrivals.length, 0), workerMs: state.diagram.elapsedMs};
  await page.locator('button[data-mode="explore"]').click(); await ready(page);
  await page.getByRole('button', {name: 'Trace the inner core', exact: false}).click(); await ready(page);
  await page.locator('[data-interior="globe"]').click();
  await page.getByLabel('Replay time in seconds after catalog origin').fill('400');
  await page.getByLabel('Playback speed', {exact: true}).selectOption('30');
  await page.getByRole('button', {name: 'Play earthquake replay', exact: true}).click();
  await page.locator('#earth-globe').scrollIntoViewIfNeeded();
  const mainCdp = await context.newCDPSession(page);
  await mainCdp.send('Profiler.enable'); await mainCdp.send('Profiler.start');
  await page.waitForTimeout(3500);
  const mainProfile = (await mainCdp.send('Profiler.stop')).profile;
  fs.writeFileSync(path.join(evidenceDir, 'globe-main.cpuprofile'), JSON.stringify(mainProfile));
  report.profiles.main = {purpose: 'Separate untimed visible full-ray 3D playback. Not included in timing samples.', samples: mainProfile.samples?.length, hotspots: hotspots(mainProfile)};
  await collectWindowErrors(page); await context.close(); contexts.delete(context);
}

try {
  for (let attempt = 0; ; attempt++) {
    assert.equal(server.exitCode, null, 'Owned preview exited. Inspect server.log for a port conflict.');
    try { if ((await fetch(url)).ok) break; } catch {}
    assert.ok(attempt < 80); await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({channel: 'chrome', headless: true}); report.environment.chrome = browser.version();
  const systemCdp = await browser.newBrowserCDPSession();
  const systemInfo = await systemCdp.send('SystemInfo.getInfo');
  report.environment.gpu = {devices: systemInfo.gpu.devices, featureStatus: systemInfo.gpu.featureStatus, renderer: systemInfo.gpu.auxAttributes?.glRenderer, displayType: systemInfo.gpu.auxAttributes?.displayType};
  await systemCdp.detach();
  for (let round = 0; round < rounds; round++) for (const viewport of round % 2 ? ['mobile', 'desktop'] : ['desktop', 'mobile']) {
    const dimensions = viewport === 'desktop' ? {width: 1440, height: 1080} : {width: 390, height: 844};
    const context = await browser.newContext({viewport: dimensions, deviceScaleFactor: 1}); contexts.add(context);
    await watchWindowErrors(context);
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    await page.goto(url); await ready(page); await instrument(page);
    await operation(page, viewport, round, {kind: 'diagram', view: 'travel', cache: 'cold', minimumCount: 1}, () => page.locator('[data-evidence="travel"]').click());
    await operation(page, viewport, round, {kind: 'records', view: 'records', minimumCount: 9}, () => page.locator('[data-evidence="records"]').click());
    await operation(page, viewport, round, {kind: 'diagram', view: 'travel', cache: 'warm', minimumCount: 1}, () => page.locator('[data-evidence="travel"]').click());
    await page.locator('[data-evidence="records"]').click();
    for (const [event, count] of [['maule-2010', 6], ['okhotsk-2013', 6], ['tohoku-2011', 9]]) {
      await operation(page, viewport, round, {kind: 'event', event, minimumCount: count}, () => page.getByLabel('Earthquake investigation', {exact: true}).selectOption(event));
    }
    for (const view of round % 2 ? ['globe', 'section'] : ['section', 'globe']) await playback(page, viewport, round, view);
    if (!round) await page.screenshot({path: path.join(evidenceDir, `${viewport}-actual-ray.png`)});
    await collectWindowErrors(page); await context.close(); contexts.delete(context);
  }
  await profile();
  report.summary = {operations: {}, playback: {}};
  for (const viewport of ['desktop', 'mobile']) {
    for (const label of ['diagram-cold', 'diagram-warm', 'records', 'event-maule-2010', 'event-okhotsk-2013', 'event-tohoku-2011']) {
      const trials = report.operations.filter(item => item.viewport === viewport && (item.kind === 'diagram' ? `diagram-${item.cache}` : item.kind === 'event' ? `event-${item.event}` : item.kind) === label);
      report.summary.operations[`${viewport}-${label}`] = {endToEndMs: summary(trials.map(item => item.endToEndMs)), feedbackDomMs: summary(trials.map(item => item.feedbackDomMs)), feedbackFrameMs: summary(trials.map(item => item.feedbackFrameMs)), longTasks: trials.reduce((sum, item) => sum + item.longTaskCount, 0), completedJobs: trials.map(item => item.completedJobs)};
    }
    for (const view of ['section', 'globe']) {
      const trials = report.playback.filter(item => item.viewport === viewport && item.view === view);
      report.summary.playback[`${viewport}-${view}`] = {pooledFrameGapsMs: summary(trials.flatMap(item => item.gaps)), trialMaximumFrameGapMs: summary(trials.map(item => item.frameGapsMs.maximum)), longTasks: trials.reduce((sum, item) => sum + item.longTaskCount, 0), actualPacketSamples: trials.reduce((sum, item) => sum + item.samples, 0)};
    }
  }
  for (const [file, digest] of Object.entries(sourceHashes)) assert.equal(hash(file), digest, `Source changed during run: ${file}`);
  assert.deepEqual(report.errors, []); report.verdict = 'PASS';
} catch (error) {
  report.errors.push(error.stack || String(error)); report.verdict = 'FAIL'; process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close();
  if (browser) await browser.close();
  if (server.exitCode === null) { const ended = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await ended; }
  fs.closeSync(log); report.finishedAt = new Date().toISOString(); report.environment.loadAfter = os.loadavg(); report.environment.busiestProcessesAfter = busyProcesses(); report.serverExitCode = server.exitCode; report.serverSignal = server.signalCode;
  fs.writeFileSync(path.join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({verdict: report.verdict, operations: report.operations.length, playback: report.playback.length, summary: report.summary, errors: report.errors, evidenceDir}, null, 2));
}
