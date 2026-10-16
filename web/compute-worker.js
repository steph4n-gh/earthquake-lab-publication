import init, {calculate_json, first_p_time_json, wavefront_fan_json} from './pkg/taup_core.js';
import {bearingDeg, destination, greatCircleDeg} from './geography.js';
import {packFan} from './wavefronts.js';
import {locateSource, prepareCurve, residualsFor} from './location.js';

let investigation;
let curve;
let diagram;
const arrivalCache = new Map();
const scalarCache = new Map();
const fanCache = new Map();
const cancelled = new Set();
const queue = [];
let processing = false;

function checkCancelled(id) {
  if (cancelled.has(id)) throw new DOMException('Calculation cancelled.', 'AbortError');
}

async function checkpoint(id) {
  checkCancelled(id);
  await new Promise(resolve => setTimeout(resolve, 0));
  checkCancelled(id);
}

function arrivals(depthKm, distanceDeg) {
  if (distanceDeg < 1 || distanceDeg > 179) return [];
  const key = `${depthKm}/${distanceDeg}`;
  if (!arrivalCache.has(key)) {
    const result = JSON.parse(calculate_json(depthKm, distanceDeg));
    if (arrivalCache.size >= 128) arrivalCache.delete(arrivalCache.keys().next().value);
    arrivalCache.set(key, result);
  }
  return arrivalCache.get(key);
}

function firstPTime(distanceDeg) {
  if (distanceDeg < 1 || distanceDeg > 179) return null;
  if (!scalarCache.has(distanceDeg)) {
    const time = JSON.parse(first_p_time_json(investigation.challenge.fixedDepthKm, distanceDeg));
    scalarCache.set(distanceDeg, Number.isFinite(time) ? time : null);
  }
  return scalarCache.get(distanceDeg);
}

function getStation(id) {
  const station = investigation.stations.find(candidate => candidate.id === id);
  if (!station) throw new Error('Unknown station.');
  return station;
}

function pickStations(ids) {
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length) throw new Error('Observation station IDs must be a unique array.');
  return ids.map(id => {
    const station = getStation(id);
    if (!station.observedPick || station.observedPick.phase !== 'P') throw new Error('Every selected observation requires a manual P pick.');
    return station;
  });
}

function validNumber(value, minimum, maximum, label) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} is outside its supported range.`);
}

function summarizeArrivals(exact) {
  const branches = new Map();
  return exact.map(arrival => {
    const branch = branches.get(arrival.phase) ?? 0;
    branches.set(arrival.phase, branch + 1);
    return {phase: arrival.phase, branch, timeS: arrival.time_s, rayParamSRad: arrival.ray_param_s_rad, turningDepthKm: arrival.turning_depth_km};
  });
}

async function stationPredictions(source, id, progress) {
  const predictions = new Map();
  const networkRays = [];
  const stationArrivals = [];
  const stationRays = [];
  for (let index = 0; index < investigation.stations.length; index++) {
    const receiver = investigation.stations[index];
    const distanceDeg = greatCircleDeg(source, receiver.position);
    const exact = arrivals(source.depthKm, distanceDeg);
    stationRays.push({stationId: receiver.id, arrivals: exact});
    const firstP = exact.find(arrival => arrival.phase === 'P');
    const ray = firstP ?? exact.find(arrival => arrival.phase === 'PKIKP') ?? exact.find(arrival => arrival.phase === 'S');
    if (ray) networkRays.push({stationId: receiver.id, source, receiver: receiver.position, arrival: ray});
    predictions.set(distanceDeg, firstP?.time_s ?? null);
    stationArrivals.push({stationId: receiver.id, distanceDeg, arrivals: summarizeArrivals(exact)});
    progress({stage: 'Calculating linked station paths', done: index + 1, total: investigation.stations.length});
    await checkpoint(id);
  }
  return {predictions, networkRays, stationArrivals, stationRays};
}

async function travelTimes(depthKm, id, progress) {
  validNumber(depthKm, 0, 700, 'Depth');
  const start = performance.now();
  if (diagram?.depthKm === depthKm) return {...diagram, elapsedMs: performance.now() - start};
  const samples = [];
  for (let distanceDeg = 1; distanceDeg <= 179; distanceDeg += 2) {
    samples.push({distanceDeg, arrivals: summarizeArrivals(arrivals(depthKm, distanceDeg))});
    progress({stage: 'Sampling exact travel times', done: samples.length, total: 90});
    await checkpoint(id);
  }
  diagram = {depthKm, samples, policy: {model: 'iasp91', distanceStepDeg: 2, rootPolicy: 'all-current-engine-roots'}};
  return {...diagram, elapsedMs: performance.now() - start};
}

async function evaluate(request, id, progress) {
  const start = performance.now();
  const station = getStation(request.stationId);
  if (request.kind === 'radial') {
    validNumber(request.depthKm, 0, 700, 'Depth');
    validNumber(request.distanceDeg, 1, 179, 'Distance');
    const source = {...investigation.source, depthKm: request.depthKm};
    const receiver = destination(source, bearingDeg(source, station.position), request.distanceDeg);
    const result = arrivals(request.depthKm, request.distanceDeg);
    const {stationArrivals, stationRays} = await stationPredictions(source, id, progress);
    return {request, source, receiver, hypothetical: true, arrivals: result, distanceDeg: request.distanceDeg, originOffsetS: 0, residuals: null, networkRays: [], stationArrivals, stationRays, elapsedMs: performance.now() - start};
  }
  if (request.kind !== 'geographic') throw new Error('Unsupported calculation request.');
  validNumber(request.source?.latitudeDeg, -90, 90, 'Latitude');
  validNumber(request.source?.longitudeDeg, -180, 180, 'Longitude');
  validNumber(request.source?.depthKm, 0, 700, 'Depth');
  if (request.origin !== 'catalog' && request.origin !== 'fit') throw new Error('Unknown origin-time policy.');
  if (request.origin === 'fit') {
    if (!investigation.challenge) throw new Error('This investigation has no validated source-location exercise.');
    if (request.source.depthKm !== investigation.challenge.fixedDepthKm) throw new Error('Location inspection uses the fixed challenge depth.');
    const bounds = investigation.challenge.region;
    if (request.source.latitudeDeg < bounds.south || request.source.latitudeDeg > bounds.north || request.source.longitudeDeg < bounds.west || request.source.longitudeDeg > bounds.east) throw new Error('Location inspection is limited to the declared regional domain.');
  }
  const selected = pickStations(request.pickStationIds);
  if (request.origin === 'fit' && !selected.length) throw new Error('Select at least one manual P observation.');
  const distanceDeg = greatCircleDeg(request.source, station.position);
  const selectedArrivals = arrivals(request.source.depthKm, distanceDeg);
  const {predictions, networkRays, stationArrivals, stationRays} = await stationPredictions(request.source, id, progress);
  const residuals = selected.length ? residualsFor(request.source, selected, distance => predictions.get(distance), request.origin === 'fit') : null;
  const originOffsetS = residuals?.kind === 'supported' ? residuals.originOffsetS : 0;
  const hypothetical = request.origin === 'fit' || request.source.latitudeDeg !== investigation.source.latitudeDeg || request.source.longitudeDeg !== investigation.source.longitudeDeg || request.source.depthKm !== investigation.source.depthKm;
  return {request, source: request.source, receiver: station.position, hypothetical, arrivals: selectedArrivals, distanceDeg, originOffsetS, residuals, networkRays, stationArrivals, stationRays, elapsedMs: performance.now() - start};
}

async function execute({id, type, payload}) {
  const progress = value => { if (!cancelled.has(id)) self.postMessage({id, type: 'progress', progress: value}); };
  if (type === 'initialize') {
    investigation = payload;
    progress({stage: 'Loading Rust/WASM in numerical worker', done: 0, total: 1});
    await init();
    progress({stage: 'Rust/WASM ready', done: 1, total: 1});
    return true;
  }
  if (!investigation) throw new Error('Numerical worker is not initialized.');
  if (type === 'evaluate') return evaluate(payload, id, progress);
  if (type === 'wavefronts') {
    validNumber(payload, 0, 700, 'Depth');
    if (!fanCache.has(payload)) {
      const fan = {depth_km: payload, segments: [], gaps: []};
      for (let phase = 0; phase < 3; phase++) {
        const part = JSON.parse(wavefront_fan_json(payload, phase));
        fan.segments.push(...part.segments); fan.gaps.push(...part.gaps); fan.policy = part.policy;
        progress({stage: 'Preparing spreading wavefronts', done: phase + 1, total: 3});
        await checkpoint(id);
      }
      if (fanCache.size >= 2) fanCache.delete(fanCache.keys().next().value);
      fanCache.set(payload, packFan(fan, investigation.identity.split('|model:')[1].split('|')[0]));
    }
    const fan = fanCache.get(payload);
    return {...fan, samples: fan.samples.slice()};
  }
  if (type === 'travelTimes') return travelTimes(payload, id, progress);
  if (type === 'locate') {
    if (!investigation.challenge) throw new Error('This investigation has no validated source-location exercise.');
    const stations = pickStations(payload);
    if (stations.length < 4) throw new Error('Fit source requires at least four manual P observations.');
    if (!curve) curve = await prepareCurve(firstPTime, () => checkpoint(id), progress);
    return locateSource(stations, investigation.challenge.region, curve, firstPTime, () => checkpoint(id), progress);
  }
  throw new Error('Unknown numerical operation.');
}

async function drain() {
  if (processing) return;
  processing = true;
  while (queue.length) {
    const request = queue.shift();
    try {
      checkCancelled(request.id);
      const result = await execute(request);
      checkCancelled(request.id);
      self.postMessage({id: request.id, type: 'result', result}, result?.samples instanceof Float64Array ? [result.samples.buffer] : []);
    } catch (error) {
      self.postMessage({id: request.id, type: 'error', error: {name: error.name ?? 'Error', message: error.message ?? String(error)}});
    } finally {
      cancelled.delete(request.id);
    }
  }
  processing = false;
}

self.onmessage = ({data}) => {
  if (data.type === 'cancel') cancelled.add(data.id);
  else {
    queue.push(data);
    void drain();
  }
};
