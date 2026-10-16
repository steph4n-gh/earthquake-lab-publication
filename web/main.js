import { investigations, defaultExperiment, decodeExperiment, encodeExperiment, requestFor } from './experiment.js';
import { createPanels } from './panels.js';
import { openEngine } from './compute.js';
import { createGlobe } from './globe.js';
import { createSection } from './section.js';
import { createEvidenceViews } from './evidence.js';
import { greatCircleDeg } from './geography.js';

let investigation;
const state = { experiment: null, snapshot: null, fit: null, playing: false, pending: false, progress: null, error: '', notice: '', geometryDirty: false, diagram: null, diagramPending: false, diagramError: '', diagramProgress: null, fan: null, fanPending: false, fanError: '', fanProgress: null, fanRevision: 0, fanPreparationCount: 0 };
let engine;
let panels;
let globe;
let section;
let evidence;
let controller;
let diagramController;
let fanController;
let fanRevision = 0;
let generation = 0;
let revision = 0;
let diagramRevision = 0;
let frame;
let previousFrame = null;
let disposed = false;
let chooseAvailablePhase = false;

const callbacks = {
  event(key) {
    const next = investigations.find(item => item.key === key);
    if (!next) return;
    const experiment = defaultExperiment(next);
    history.replaceState(null, '', encodeExperiment(experiment, next));
    activate(next, experiment, '', { focusEvent: true, selectAvailablePhase: true });
  },
  tohokuChallenge() {
    const next = investigations[0];
    const experiment = defaultExperiment(next);
    experiment.context = initialContext('locate', next, experiment.stationId);
    history.replaceState(null, '', encodeExperiment(experiment, next));
    activate(next, experiment, 'The Tohoku source-location exercise uses eight independently archived manual P picks.');
  },
  mode(kind) {
    if (kind === 'locate' && !investigation.challenge) {
      state.notice = 'This event supports replay and path exploration. Open the Tohoku source challenge for the validated location exercise.';
      render(); return;
    }
    pause();
    state.experiment = { ...state.experiment, context: initialContext(kind, investigation, state.experiment.stationId), branch: 0, cutaway: kind === 'explore', interiorView: kind === 'explore' ? 'globe' : state.experiment.interiorView, timeS: 0 };
    state.fit = null; state.notice = ''; evaluate({ focusSection: kind === 'explore' });
  },
  play() {
    if (state.playing) pause();
    else { if (state.experiment.timeS >= investigation.replayBounds.endS) state.experiment.timeS = 0; state.playing = true; previousFrame = null; scheduleFrame(); }
    render();
  },
  time: setTime,
  speed(speed) { state.experiment.speed = speed; previousFrame = null; render(); },
  station: selectStation,
  phase(phase) { chooseAvailablePhase = false; state.experiment.phase = phase; state.experiment.branch = 0; render(); },
  branch(branch) { state.experiment.branch = branch; render(); },
  arrival(phase, branch) { chooseAvailablePhase = false; state.experiment.phase = phase; state.experiment.branch = branch; render(); },
  evidence(view) {
    state.experiment.evidenceView = view;
    if (view !== 'travel') cancelDiagram();
    render();
    if (view === 'travel') prepareTravelDiagram();
  },
  interior(view) {
    state.experiment.interiorView = view; render();
    if (view === 'globe') globe.resize();
  },
  cutaway() { state.experiment.cutaway = !state.experiment.cutaway; render(); if (state.experiment.cutaway) globe.focusSection(); },
  wavefronts() { state.experiment.wavefronts = !state.experiment.wavefronts; render(); if (state.experiment.wavefronts) prepareWavefronts(); },
  stationArrival({stationId, phase, branch, timeS}) {
    pause(); chooseAvailablePhase = false;
    state.experiment.stationId = stationId; state.experiment.phase = phase; state.experiment.branch = branch;
    state.experiment.timeS = timeS;
    if (state.experiment.context.kind === 'explore') state.experiment.context.distanceDeg = state.snapshot.stationArrivals.find(summary => summary.stationId === stationId).distanceDeg;
    evaluate();
  },
  resetCamera() { state.experiment.camera = defaultExperiment(investigation).camera; render(); },
  candidate: setCandidate,
  observation(stationId, checked) {
    if (state.experiment.context.kind !== 'locate') return;
    const active = state.experiment.context.activeStationIds;
    const next = checked ? [...active, stationId] : active.filter(id => id !== stationId);
    if (next.length < 2) { state.notice = 'Keep at least two observations to inspect source ambiguity.'; render(); return; }
    state.experiment.context.activeStationIds = investigation.challenge.defaultStationIds.filter(id => next.includes(id));
    state.fit = null; evaluate();
  },
  fit: locate,
  cancel,
  reveal() { if (state.experiment.context.kind === 'locate') state.experiment.context.revealed = !state.experiment.context.revealed; render(); },
  retry() { if (engine) evaluate(); else bootEngine(generation); },
  radialDraft() { state.geometryDirty = true; state.notice = 'Geometry edits are not calculated. Calculate geometry before exporting.'; },
  radial(depthKm, distanceDeg) {
    if (!Number.isFinite(depthKm) || !Number.isFinite(distanceDeg) || depthKm < 0 || depthKm > 700 || distanceDeg < 1 || distanceDeg > 179) { state.notice = 'Use depth 0–700 km and receiver distance 1–179°.'; render(); return; }
    state.experiment.context = { kind: 'explore', depthKm, distanceDeg }; state.experiment.branch = 0; state.fit = null; evaluate();
  },
  resetGeometry() {
    const station = investigation.stations.find(item => item.id === state.experiment.stationId);
    state.experiment.context = { kind: 'explore', depthKm: investigation.source.depthKm, distanceDeg: greatCircleDeg(investigation.source, station.position) }; state.experiment.branch = 0; evaluate();
  },
  coreExample() {
    const core = state.snapshot?.stationArrivals.find(item => item.arrivals.some(arrival => arrival.phase === 'PKIKP'));
    if (!core) { state.notice = state.pending ? 'Wait for the exact station paths before choosing the inner-core example.' : 'No included real station has a supported inner-core path at this geometry.'; render(); return; }
    const station = investigation.stations.find(item => item.id === core.stationId);
    chooseAvailablePhase = false;
    state.experiment = { ...state.experiment, stationId: station.id, phase: 'PKIKP', branch: 0, context: { kind: 'explore', depthKm: state.snapshot.source.depthKm, distanceDeg: core.distanceDeg }, interiorView: 'globe', cutaway: true, timeS: 0 };
    state.fit = null; evaluate({ focusSection: true });
  },
  waveWindow() { state.experiment.waveWindow = state.experiment.waveWindow === 'full' ? 'arrival' : 'full'; render(); },
  share,
  export: exportCalculation,
};

function initialContext(kind, selected, stationId) {
  if (kind === 'locate') return { kind, candidate: { ...selected.challenge.initialCandidate }, activeStationIds: [...selected.challenge.defaultStationIds], revealed: false };
  if (kind === 'explore') return { kind, depthKm: selected.source.depthKm, distanceDeg: greatCircleDeg(selected.source, selected.stations.find(station => station.id === stationId).position) };
  return { kind: 'replay' };
}

async function activate(nextInvestigation, experiment, notice = '', { focusEvent = false, selectAvailablePhase = false } = {}) {
  pause(); controller?.abort(); cancelDiagram(); cancelFan(); ++revision;
  const currentGeneration = ++generation;
  engine?.dispose(); engine = null;
  globe?.dispose(); section?.dispose(); evidence?.dispose(); panels?.dispose();
  investigation = nextInvestigation;
  chooseAvailablePhase = selectAvailablePhase;
  Object.assign(state, { experiment, snapshot: null, fit: null, playing: false, pending: true, progress: null, error: '', notice, geometryDirty: false, diagram: null, diagramPending: false, diagramError: '', diagramProgress: null, fan: null, fanPending: false, fanError: '', fanProgress: null, fanRevision: 0, fanPreparationCount: 0 });
  panels = createPanels(document.getElementById('app'), callbacks);
  globe = createGlobe(panels.canvas, investigation, { onStation: selectStation, onCandidate: setCandidate, onCamera(camera) { state.experiment.camera = camera; } });
  section = createSection(panels.sectionHost);
  evidence = createEvidenceViews(panels.evidenceHost, {
    station: selectStation, phase: callbacks.phase, arrival: callbacks.arrival, time: setTime,
    sample({ depthKm, distanceDeg, phase, branch }) {
      pause();
      chooseAvailablePhase = false;
      state.experiment = { ...state.experiment, context: { kind: 'explore', depthKm, distanceDeg }, phase, branch, interiorView: 'globe', cutaway: true };
      state.fit = null; evaluate();
      document.querySelector('.workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  });
  render();
  if (focusEvent) document.querySelector('[aria-label="Earthquake investigation"]')?.focus();
  await bootEngine(currentGeneration);
}

Object.defineProperty(window, 'workbench', { value: Object.freeze({
  get ready() { return Boolean(engine && state.snapshot && !state.pending && !state.error && (!state.experiment.wavefronts || state.fan?.depthKm === state.snapshot.source.depthKm)); },
  get error() { return state.error || null; },
  get state() { const {fan, ...compact} = state; return structuredClone({ ...compact, fan: fan ? {depthKm: fan.depthKm, modelIdentity: fan.modelIdentity, policy: fan.policy, rayCount: fan.rayCount, pointCount: fan.pointCount, byteLength: fan.byteLength, segments: fan.segments.map(segment => ({phase: segment.phase, rayCount: segment.rays.length, minimumP: segment.rays[0].rayParamSRad, maximumP: segment.rays.at(-1).rayParamSRad})), gaps: fan.gaps} : null, investigation: { key: investigation.key, id: investigation.id, identity: investigation.identity, stationIds: investigation.stations.map(station => station.id) }, stats: engine?.stats ?? null }); },
  frontGeometry() {return globe?.inspectFronts() ?? [];},
  async query(depthKm, distanceDeg) {
    if (!engine) throw new Error('The worker is not ready.');
    const result = await engine.evaluate({ kind: 'radial', depthKm, distanceDeg, stationId: state.experiment.stationId });
    return result.arrivals;
  },
}), writable: false, configurable: false });

document.querySelector('.skip-link').addEventListener('click', event => {
  event.preventDefault(); document.getElementById('play').focus();
});

function selectStation(stationId) {
  const station = investigation.stations.find(item => item.id === stationId);
  state.experiment.stationId = stationId; state.experiment.branch = 0;
  if (state.experiment.context.kind === 'explore') state.experiment.context.distanceDeg = greatCircleDeg(investigation.source, station.position);
  evaluate({ selectAvailablePhase: true });
}

function setTime(timeS) {
  state.experiment.timeS = Math.max(investigation.replayBounds.startS, Math.min(investigation.replayBounds.endS, timeS));
  previousFrame = null; render();
}

function render() {
  panels.render({ ...state, investigation, investigations, stats: engine?.stats });
  const showSection = state.experiment.context.kind === 'explore' && state.experiment.interiorView === 'section';
  const globeHost = panels.globeHost ?? panels.canvas.closest('.globe-frame');
  const visibilityChanged = globeHost.hidden !== showSection;
  globeHost.hidden = showSection; panels.sectionHost.hidden = !showSection;
  if (visibilityChanged && !showSection) globe.resize();
  section.render({ investigation, experiment: state.experiment, snapshot: state.snapshot, playbackTimeS: state.experiment.timeS });
  evidence.render({ investigation, experiment: state.experiment, snapshot: state.snapshot, diagram: state.diagram, diagramPending: state.diagramPending, diagramError: state.diagramError, diagramProgress: state.diagramProgress });
  globe.render(globeView());
}

function globeView() { return {experiment: state.experiment, snapshot: state.snapshot, playbackTimeS: state.experiment.timeS, fit: state.fit, fan: state.fan, fanRevision: state.fanRevision, fanPreparationCount: state.fanPreparationCount}; }

function scheduleFrame() {
  if (!frame && state.playing) frame = requestAnimationFrame(tick);
}

function tick(now) {
  frame = null;
  if (!state.playing || disposed) return;
  const endS = investigation.replayBounds.endS;
  if (previousFrame !== null) state.experiment.timeS = Math.min(endS, state.experiment.timeS + Math.min(0.25, (now - previousFrame) / 1000) * state.experiment.speed);
  previousFrame = now;
  panels.renderTime(state.experiment.timeS); section.renderTime(state.experiment.timeS); evidence.renderTime(state.experiment.timeS);
  if (state.experiment.context.kind !== 'explore' || state.experiment.interiorView === 'globe') globe.render(globeView());
  if (state.experiment.timeS >= endS) { pause(); render(); } else scheduleFrame();
}

function pause() {
  state.playing = false; previousFrame = null;
  if (frame) cancelAnimationFrame(frame);
  frame = null;
}

function setCandidate(point) {
  if (state.experiment.context.kind !== 'locate') return;
  const region = investigation.challenge.region;
  if (!Number.isFinite(point.latitudeDeg) || !Number.isFinite(point.longitudeDeg) || point.latitudeDeg < region.south || point.latitudeDeg > region.north || point.longitudeDeg < region.west || point.longitudeDeg > region.east) {
    state.notice = `Place a candidate inside ${region.south}–${region.north}° N and ${region.west}–${region.east}° E. The search region is part of this exercise.`; render(); return;
  }
  state.experiment.context.candidate = point; state.experiment.branch = 0; state.fit = null; evaluate();
}

function cancelDiagram() {
  diagramController?.abort(); diagramController = null; ++diagramRevision;
  state.diagramPending = false; state.diagramProgress = null;
}

function startJob(stage) {
  cancelDiagram(); cancelFan(); controller?.abort(); controller = new AbortController();
  state.geometryDirty = false;
  state.pending = true; state.snapshot = null; state.error = ''; state.progress = { stage, done: 0, total: 0 };
  const current = ++revision;
  const currentGeneration = generation;
  render();
  return { current, generation: currentGeneration, signal: controller.signal, onProgress(progress) { if (generation === currentGeneration && revision === current) { state.progress = progress; panels.render({ ...state, investigation, investigations, stats: engine?.stats }); } } };
}

function currentJob(job) {
  return !disposed && job.generation === generation && job.current === revision && !job.signal.aborted;
}

async function evaluate({ focusSection = false, selectAvailablePhase = false } = {}) {
  if (selectAvailablePhase) chooseAvailablePhase = true;
  if (!engine) return;
  const selectPhase = chooseAvailablePhase;
  chooseAvailablePhase = false;
  const currentEngine = engine;
  const requestedPhase = state.experiment.phase;
  const request = requestFor(state.experiment, investigation);
  const job = startJob('Calculating linked paths');
  try {
    const snapshot = await currentEngine.evaluate(request, { signal: job.signal, onProgress: job.onProgress });
    if (!currentJob(job)) return;
    state.snapshot = snapshot;
    if (state.diagram?.depthKm !== snapshot.source.depthKm) { state.diagram = null; state.diagramError = ''; }
    if (selectPhase && state.experiment.phase === requestedPhase && !snapshot.arrivals.some(arrival => arrival.phase === state.experiment.phase)) state.experiment.phase = ['P', 'PKIKP', 'S'].find(phase => snapshot.arrivals.some(arrival => arrival.phase === phase)) ?? state.experiment.phase;
    const available = snapshot.arrivals.filter(arrival => arrival.phase === state.experiment.phase).length;
    if (state.experiment.branch >= Math.max(1, available)) {
      state.experiment.branch = 0; state.notice = 'The shared arrival branch is unavailable at this geometry. Selection reset to the first branch.';
    }
  } catch (error) {
    if (!currentJob(job)) return;
    state.error = error.message || String(error);
  } finally {
    if (currentJob(job)) {
      state.pending = false; state.progress = null; render();
      if (focusSection && state.snapshot) globe.focusSection();
      prepareWavefronts();
      prepareTravelDiagram();
    }
  }
}

function cancelFan() {
  fanController?.abort(); fanController = null; ++fanRevision;
  state.fanPending = false; state.fanProgress = null;
}

async function prepareWavefronts() {
  if (!engine || state.pending || !state.snapshot || !state.experiment.wavefronts || state.fanPending) return;
  const depthKm = state.snapshot.source.depthKm;
  if (state.fan?.depthKm === depthKm) return;
  cancelFan(); state.fan = null; state.fanPending = true; state.fanError = '';
  fanController = new AbortController();
  const signal = fanController.signal;
  const token = fanRevision;
  const currentGeneration = generation;
  const currentEngine = engine;
  const current = () => !disposed && generation === currentGeneration && token === fanRevision && !signal.aborted && state.snapshot?.source.depthKm === depthKm;
  render();
  try {
    const fan = await currentEngine.wavefronts(depthKm, {signal, onProgress(progress) {if (current()) {state.fanProgress = progress; panels.render({ ...state, investigation, investigations, stats: engine?.stats });}}});
    if (current()) {state.fan = fan; state.fanRevision++; state.fanPreparationCount++;}
  } catch (error) { if (current()) state.fanError = error.message || String(error); }
  finally {if (current()) {state.fanPending = false; state.fanProgress = null; fanController = null; render();}}
}

async function prepareTravelDiagram() {
  if (!engine || state.pending || !state.snapshot || state.experiment.evidenceView !== 'travel' || state.diagramPending) return;
  const depthKm = state.snapshot.source.depthKm;
  if (state.diagram?.depthKm === depthKm) return;
  cancelDiagram(); state.diagram = null; state.diagramError = ''; state.diagramPending = true;
  diagramController = new AbortController();
  const signal = diagramController.signal;
  const token = diagramRevision;
  const currentGeneration = generation;
  const currentEngine = engine;
  const isCurrent = () => !disposed && generation === currentGeneration && diagramRevision === token && !signal.aborted;
  render();
  try {
    const diagram = await currentEngine.travelTimes(depthKm, { signal, onProgress(progress) { if (isCurrent()) { if (!state.diagramProgress) panels.render({ ...state, investigation, investigations, stats: engine?.stats }); state.diagramProgress = progress; } } });
    if (isCurrent()) state.diagram = diagram;
  } catch (error) {
    if (isCurrent()) state.diagramError = error.message || String(error);
  } finally {
    if (isCurrent()) { state.diagramPending = false; state.diagramProgress = null; diagramController = null; render(); }
  }
}

async function locate() {
  if (!engine || state.experiment.context.kind !== 'locate' || !investigation.challenge) return;
  const ids = [...state.experiment.context.activeStationIds];
  if (ids.length < 4) { state.notice = 'Select at least four manual P observations to fit a source.'; render(); return; }
  state.fit = null;
  const currentEngine = engine;
  const job = startJob('Preparing first-P curves from the current engine');
  try {
    const fit = await currentEngine.locate(ids, { signal: job.signal, onProgress: job.onProgress });
    if (!currentJob(job)) return;
    if (!fit.directCheck.exactConfirmed) throw new Error('The final source did not pass exact per-station ray checks.');
    state.fit = fit; state.experiment.context.candidate = { ...fit.best };
    state.notice = 'The bounded regional fit is complete. Reveal the catalog to compare, then try removing observations.';
    state.pending = false; await evaluate();
  } catch (error) {
    if (!currentJob(job)) return;
    state.error = error.message || String(error);
  } finally {
    if (currentJob(job)) { state.pending = false; state.progress = null; render(); }
  }
}

function cancel() {
  controller?.abort(); cancelDiagram(); cancelFan(); ++revision;
  state.pending = false; state.snapshot = null; state.progress = null; state.fit = null;
  state.error = 'Calculation cancelled. Retry to calculate the current experiment.'; render();
}

async function share() {
  pause();
  const hash = encodeExperiment(state.experiment, investigation);
  const canonical = decodeExperiment(hash);
  if (canonical.warning) { state.notice = canonical.warning; render(); return; }
  state.experiment = canonical.experiment; history.replaceState(null, '', hash);
  const currentGeneration = generation;
  let message = 'Experiment link ready. It opens paused with the same earthquake, data, model and settings.';
  try { await navigator.clipboard.writeText(location.href); message = `Copied. ${message}`; } catch { message = `Select and copy the URL below. ${message}`; }
  if (currentGeneration !== generation) return;
  render(); panels.share(location.href, message);
}

window.addEventListener('hashchange', () => {
  const restored = decodeExperiment(location.hash);
  activate(restored.investigation, restored.experiment, restored.warning || 'Shared experiment restored, paused.');
});
window.addEventListener('resize', () => { globe?.resize(); });
window.addEventListener('pagehide', event => {
  pause();
  if (event.persisted) return;
  disposed = true; controller?.abort(); cancelDiagram(); cancelFan(); ++generation; ++revision;
  engine?.dispose(); globe?.dispose(); section?.dispose(); evidence?.dispose(); panels?.dispose();
});
window.addEventListener('pageshow', event => { if (event.persisted) { globe.resize(); render(); } });

function exportCalculation(format) {
  if (!state.snapshot || state.pending || state.geometryDirty) return;
  const station = investigation.stations.find(item => item.id === state.experiment.stationId);
  const payload = {
    schema_version: 3, event: investigation.event, investigation_key: investigation.key, scientific_identity: investigation.identity,
    experiment: structuredClone(state.experiment), request: state.snapshot.request,
    geometry: { source_depth_km: state.snapshot.source.depthKm, distance_deg: state.snapshot.distanceDeg, historical_geometry: !state.snapshot.hypothetical, source: state.snapshot.source, receiver: state.snapshot.receiver },
    recording: { id: station.id, units: station.trace.units, start_time_utc: station.trace.start_time_utc, start_offset_s: station.trace.start_offset_s, sample_rate_hz: station.trace.sample_rate_hz, source: station.trace.source, note: 'Fixed historical recording. Instrumental counts, no response removal.' },
    arrivals: state.snapshot.arrivals, station_arrivals: state.snapshot.stationArrivals, origin_offset_s: state.snapshot.originOffsetS,
    observations: investigation.stations.filter(item => item.observedPick).map(item => ({ station_id: item.id, ...item.observedPick })),
    residuals: state.snapshot.residuals, location_fit: state.fit, sampled_travel_times: state.diagram,
    assumptions: investigation.provenance.limitations,
  };
  let content;
  if (format === 'json') content = JSON.stringify(payload, null, 2);
  else {
    const rows = [['phase', 'branch', 'time_s', 'ray_param_s_rad', 'turning_depth_km', 'source_depth_km', 'distance_deg', 'recording_id', 'historical_geometry', 'origin_offset_s', 'investigation_key', 'scientific_identity']];
    const branches = {};
    const geometry = [state.snapshot.source.depthKm, state.snapshot.distanceDeg, station.id, !state.snapshot.hypothetical, state.snapshot.originOffsetS, investigation.key, investigation.identity];
    for (const arrival of state.snapshot.arrivals) {
      branches[arrival.phase] = (branches[arrival.phase] ?? 0) + 1;
      rows.push([arrival.phase, branches[arrival.phase], arrival.time_s, arrival.ray_param_s_rad, arrival.turning_depth_km, ...geometry]);
    }
    if (!state.snapshot.arrivals.length) rows.push(['', '', '', '', '', ...geometry]);
    content = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
  }
  const url = URL.createObjectURL(new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${investigation.key}-${state.experiment.context.kind}-${station.code}.${format}`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function bootEngine(currentGeneration) {
  const bootRevision = revision;
  state.error = ''; state.pending = true; render();
  try {
    const opened = await openEngine(investigation, progress => { if (!disposed && generation === currentGeneration && revision === bootRevision) { state.progress = progress; panels.render({ ...state, investigation, investigations, stats: engine?.stats }); } });
    if (disposed || generation !== currentGeneration || revision !== bootRevision) { opened.dispose(); return; }
    engine = opened;
    if (revision === bootRevision) await evaluate();
  } catch (error) {
    if (disposed || generation !== currentGeneration || revision !== bootRevision) return;
    state.pending = false; state.progress = null; state.error = error.message || String(error); render();
  }
}

const decoded = decodeExperiment(location.hash);
await activate(decoded.investigation, decoded.experiment, decoded.warning);
