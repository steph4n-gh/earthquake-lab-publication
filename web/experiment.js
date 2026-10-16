import tohoku from '../fixtures/investigation/tohoku-investigation.json';
import legacy from '../fixtures/observed/tohoku-2011.json';
import caseManifest from '../fixtures/investigation/manifest.json';
import legacyManifest from '../fixtures/observed/manifest.json';
import maule from '../fixtures/events/maule-2010/case.json';
import mauleManifest from '../fixtures/events/maule-2010/manifest.json';
import okhotsk from '../fixtures/events/okhotsk-2013/case.json';
import okhotskManifest from '../fixtures/events/okhotsk-2013/manifest.json';
import modelProvenance from '../fixtures/provenance.json';

const PHASES = ['P', 'S', 'PKIKP'];
const SPEEDS = [1, 10, 30, 60, 120];
const COMMON = ['lab', 'identity', 'mode', 'station', 'phase', 'branch', 'time', 'speed', 'azimuth', 'elevation', 'camera', 'cutaway', 'window'];
const POLICY = 'earliest-uppercase-P-v1';

function readInvestigation(raw, { key, manifest, caseFile = 'case.json', legacyCase = null, title, shortTitle, summary, camera }) {
  const originS = preciseSeconds(raw.event.origin_time_utc);
  const source = { latitudeDeg: raw.event.latitude_deg, longitudeDeg: raw.event.longitude_deg, depthKm: raw.event.depth_km };
  if (!Number.isFinite(originS) || !validPosition(source) || !Number.isFinite(source.depthKm) || source.depthKm < 0 || source.depthKm > 700) throw new Error('The catalog source is outside the supported model.');
  const stations = raw.stations.map(station => {
    const pick = station.observed_pick;
    if (pick && (pick.evaluation_mode !== 'manual' || pick.phase !== 'P' || !Number.isFinite(pick.offset_s) || Math.abs((preciseSeconds(pick.time_utc) - originS) - pick.offset_s) > 0.00001)) throw new Error('The archived pick clock is inconsistent.');
    validateTrace(station.trace, originS);
    return {
      id: station.id, code: station.code, name: station.name,
      position: { latitudeDeg: station.latitude_deg, longitudeDeg: station.longitude_deg },
      observedPick: pick ? { phase: 'P', offsetS: pick.offset_s, timeUtc: pick.time_utc, uncertaintyS: pick.uncertainty_s, resourceId: pick.resource_id, sourceUrl: pick.source_url, recordingMatch: pick.recording_match } : null,
      trace: station.trace,
    };
  });
  if (legacyCase) {
    const lvc = legacyCase.traces.find(trace => trace.station === 'LVC');
    if (!lvc) throw new Error('The view-only core station is missing.');
    validateTrace(lvc, originS);
    stations.push({ id: lvc.id, code: 'LVC', name: lvc.station_name, position: { latitudeDeg: lvc.latitude_deg, longitudeDeg: lvc.longitude_deg }, observedPick: null, trace: lvc });
  }
  if (!stations.length || new Set(stations.map(station => station.id)).size !== stations.length || stations.some(station => !validPosition(station.position) || station.id !== station.trace.id)) throw new Error('The recording station set is inconsistent.');
  const challenge = raw.challenge ? {
    fixedDepthKm: raw.challenge.fixed_depth_km,
    region: { south: raw.challenge.region.latitude_min_deg, north: raw.challenge.region.latitude_max_deg, west: raw.challenge.region.longitude_min_deg, east: raw.challenge.region.longitude_max_deg },
    defaultStationIds: [...raw.challenge.default_station_ids], initialCandidate: { latitudeDeg: 35, longitudeDeg: 148 },
  } : null;
  if (challenge && challenge.defaultStationIds.some(id => !stations.some(station => station.id === id && station.observedPick))) throw new Error('The source exercise references an unavailable observation.');
  const caseSha256 = manifest.files[caseFile].sha256;
  const legacySha256 = legacyCase ? legacyManifest.files['tohoku-2011.json'].sha256 : null;
  const stationId = stations.find(station => station.code === 'ANMO')?.id;
  if (!stationId) throw new Error('The default recording station is missing.');
  return freeze({
    key, id: raw.event.id, event: raw.event, title, shortTitle, summary: summary ?? raw.event.summary,
    identity: `case:${caseSha256}${legacySha256 ? `|legacy:${legacySha256}` : ''}|model:${modelProvenance.model_sha256}|policy:${POLICY}`,
    source, originTimeUtc: raw.event.origin_time_utc, stations, challenge,
    replayBounds: { startS: Math.floor(Math.min(...stations.map(station => station.trace.start_offset_s))), endS: Math.ceil(Math.max(...stations.map(station => station.trace.start_offset_s + (station.trace.samples.length - 1) / station.trace.sample_rate_hz))) },
    defaults: { stationId, phase: 'P', camera },
    provenance: { ...raw.provenance, limitations: raw.challenge?.limitations ?? raw.provenance.limitations, model: modelProvenance, caseSha256, legacySha256 },
  });
}

export const investigations = Object.freeze([
  readInvestigation(tohoku, { key: 'tohoku-2011', manifest: caseManifest, caseFile: 'tohoku-investigation.json', legacyCase: legacy, title: 'Tohoku, Japan', shortTitle: 'Tohoku 2011', summary: 'A shallow megathrust earthquake, nine real recordings, and an independently sourced arrival-time investigation.', camera: { azimuthDeg: 142, elevationDeg: 28, distance: 3.3 } }),
  readInvestigation(maule, { key: 'maule-2010', manifest: mauleManifest, title: 'Maule, Chile', shortTitle: 'Maule 2010', camera: { azimuthDeg: -73, elevationDeg: -25, distance: 3.3 } }),
  readInvestigation(okhotsk, { key: 'okhotsk-2013', manifest: okhotskManifest, title: 'Sea of Okhotsk', shortTitle: 'Okhotsk 2013', camera: { azimuthDeg: 153, elevationDeg: 42, distance: 3.3 } }),
]);

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

function validPosition(position) {
  return Number.isFinite(position.latitudeDeg) && position.latitudeDeg >= -90 && position.latitudeDeg <= 90 && Number.isFinite(position.longitudeDeg) && position.longitudeDeg >= -180 && position.longitudeDeg <= 180;
}

function preciseSeconds(iso) {
  const fraction = iso.match(/\.(\d+)Z$/)?.[1] ?? '0';
  return Date.parse(iso.replace(/\.\d+Z$/, 'Z')) / 1000 + Number(`0.${fraction}`);
}

function validateTrace(trace, originS) {
  const startS = preciseSeconds(trace.start_time_utc);
  if (!trace.samples.length || !trace.samples.every(Number.isFinite) || !Number.isFinite(trace.sample_rate_hz) || trace.sample_rate_hz <= 0 || !Number.isFinite(startS) || !Number.isFinite(trace.start_offset_s) || Math.abs((startS - originS) - trace.start_offset_s) > 0.00001) throw new Error('The recording clock is inconsistent.');
}

export function defaultExperiment(investigation) {
  return { context: { kind: 'replay' }, stationId: investigation.defaults.stationId, phase: investigation.defaults.phase, branch: 0, timeS: 0, speed: 60, camera: { ...investigation.defaults.camera }, cutaway: false, waveWindow: 'full', evidenceView: 'records', interiorView: 'globe', wavefronts: true };
}

export function decodeExperiment(fragment) {
  const fallback = { investigation: investigations[0], experiment: defaultExperiment(investigations[0]), warning: '' };
  if (!fragment || fragment === '#') return fallback;
  try {
    if (fragment.length > 4096 || !fragment.startsWith('#lab=')) throw new Error('Unknown or oversized experiment link.');
    const fields = new URLSearchParams(fragment.slice(1));
    const version = fields.get('lab');
    if (!['1', '2'].includes(version)) throw new Error('Unknown experiment link version.');
    const investigation = version === '1' ? investigations[0] : investigations.find(item => item.key === fields.get('event'));
    if (!investigation) throw new Error('Unknown earthquake investigation.');
    const mode = fields.get('mode');
    const extra = mode === 'locate' ? ['latitude', 'longitude', 'active', 'revealed'] : mode === 'explore' ? ['depth', 'distance'] : [];
    const optionalFronts = fields.has('fronts') ? ['fronts'] : [];
    const allowed = new Set([...COMMON, ...optionalFronts, ...(version === '2' ? ['event', 'view', 'interior'] : []), ...extra]);
    for (const key of fields.keys()) if (!allowed.has(key) || fields.getAll(key).length !== 1) throw new Error('The experiment link has unknown or repeated fields.');
    if (fields.size !== allowed.size || fields.get('identity') !== investigation.identity) throw new Error('The experiment uses a different data or model version.');
    if (!['replay', 'locate', 'explore'].includes(mode)) throw new Error('Unknown investigation stage.');
    const stationId = fields.get('station');
    if (!investigation.stations.some(station => station.id === stationId)) throw new Error('Unknown station.');
    const phase = fields.get('phase');
    if (!PHASES.includes(phase)) throw new Error('Unsupported phase.');
    const numeric = (key, min, max, integer = false) => {
      const token = fields.get(key);
      if (!token || !/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(token)) throw new Error(`Invalid ${key}.`);
      const value = Number(token);
      if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(`Out of range ${key}.`);
      return value;
    };
    const boolean = key => { if (!['0', '1'].includes(fields.get(key))) throw new Error(`Invalid ${key}.`); return fields.get(key) === '1'; };
    const speed = numeric('speed', 1, 120);
    if (!SPEEDS.includes(speed) || !['full', 'arrival'].includes(fields.get('window'))) throw new Error('Invalid playback option.');
    const evidenceView = version === '1' ? 'records' : fields.get('view');
    const interiorView = version === '1' ? 'section' : fields.get('interior');
    if (!['records', 'travel'].includes(evidenceView) || !['section', 'globe'].includes(interiorView)) throw new Error('Unknown evidence or interior view.');
    let context = { kind: mode };
    if (mode === 'locate') {
      if (!investigation.challenge) throw new Error('This earthquake has no validated source-location exercise.');
      const region = investigation.challenge.region;
      const activeStationIds = fields.get('active') ? fields.get('active').split(',') : [];
      if (activeStationIds.length < 2 || new Set(activeStationIds).size !== activeStationIds.length || activeStationIds.some(id => !investigation.stations.some(station => station.id === id && station.observedPick))) throw new Error('Invalid observation set.');
      context = { kind: mode, candidate: { latitudeDeg: numeric('latitude', region.south, region.north), longitudeDeg: numeric('longitude', region.west, region.east) }, activeStationIds, revealed: boolean('revealed') };
    } else if (mode === 'explore') context = { kind: mode, depthKm: numeric('depth', 0, 700), distanceDeg: numeric('distance', 1, 179) };
    return { investigation, experiment: { context, stationId, phase, branch: numeric('branch', 0, 100, true), timeS: numeric('time', investigation.replayBounds.startS, investigation.replayBounds.endS), speed, camera: { azimuthDeg: numeric('azimuth', -360, 360), elevationDeg: numeric('elevation', -89, 89), distance: numeric('camera', 1.5, 8) }, cutaway: boolean('cutaway'), waveWindow: fields.get('window'), evidenceView, interiorView, wavefronts: fields.has('fronts') ? boolean('fronts') : true }, warning: '' };
  } catch (error) {
    return { ...fallback, warning: `${error.message} The complete link was reset to the default Tohoku replay.` };
  }
}

export function encodeExperiment(experiment, investigation) {
  const fields = new URLSearchParams({ lab: '2', event: investigation.key, identity: investigation.identity, mode: experiment.context.kind, station: experiment.stationId, phase: experiment.phase, branch: String(experiment.branch), time: String(experiment.timeS), speed: String(experiment.speed), azimuth: String(experiment.camera.azimuthDeg), elevation: String(experiment.camera.elevationDeg), camera: String(experiment.camera.distance), cutaway: experiment.cutaway ? '1' : '0', window: experiment.waveWindow, view: experiment.evidenceView, interior: experiment.interiorView, fronts: experiment.wavefronts ? '1' : '0' });
  if (experiment.context.kind === 'locate') {
    const context = experiment.context;
    fields.set('latitude', String(context.candidate.latitudeDeg)); fields.set('longitude', String(context.candidate.longitudeDeg)); fields.set('active', context.activeStationIds.join(',')); fields.set('revealed', context.revealed ? '1' : '0');
  } else if (experiment.context.kind === 'explore') { fields.set('depth', String(experiment.context.depthKm)); fields.set('distance', String(experiment.context.distanceDeg)); }
  return `#${fields}`;
}

export function requestFor(experiment, investigation) {
  const context = experiment.context;
  if (context.kind === 'explore') return { kind: 'radial', depthKm: context.depthKm, distanceDeg: context.distanceDeg, stationId: experiment.stationId };
  if (context.kind === 'locate' && !investigation.challenge) throw new Error('This earthquake has no validated source-location exercise.');
  return { kind: 'geographic', source: context.kind === 'locate' ? { ...context.candidate, depthKm: investigation.challenge.fixedDepthKm } : { ...investigation.source }, stationId: experiment.stationId, pickStationIds: context.kind === 'locate' ? [...context.activeStationIds] : [], origin: context.kind === 'locate' ? 'fit' : 'catalog' };
}
