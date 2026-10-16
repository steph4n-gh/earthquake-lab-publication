import {greatCircleDeg} from './geography.js';

const MAX_ERROR_S = 0.05;
const CURVE_TARGET_S = 0.02;
const MIN_INTERVAL_DEG = 1 / 128;

export function residualsFor(source, stations, timeAtDistance, fitOrigin = true) {
  const predictions = stations.map(station => {
    const distanceDeg = greatCircleDeg(source, station.position);
    const predictedTimeS = timeAtDistance(distanceDeg);
    return {stationId: station.id, distanceDeg, observedOffsetS: station.observedPick.offsetS, predictedTimeS, residualS: null};
  });
  const unsupportedStationIds = predictions.filter(station => !Number.isFinite(station.predictedTimeS)).map(station => station.stationId);
  if (unsupportedStationIds.length) return {kind: 'incomplete', unsupportedStationIds, stations: predictions};
  const originOffsetS = fitOrigin ? predictions.reduce((sum, station) => sum + station.observedOffsetS - station.predictedTimeS, 0) / predictions.length : 0;
  for (const station of predictions) station.residualS = station.observedOffsetS - station.predictedTimeS - originOffsetS;
  const rmsS = Math.sqrt(predictions.reduce((sum, station) => sum + station.residualS ** 2, 0) / predictions.length);
  return {kind: 'supported', originOffsetS, rmsS, stations: predictions};
}

export async function prepareCurve(timeAtDistance, checkpoint, onProgress) {
  const values = new Map();
  const intervals = [];
  let queriedCount = 0;
  let testedCount = 0;
  let maxObservedErrorS = 0;
  const sample = async distance => {
    if (!values.has(distance)) {
      values.set(distance, timeAtDistance(distance));
      queriedCount++;
      if (queriedCount % 4 === 0) await checkpoint();
    }
    return values.get(distance);
  };
  const refine = async (left, right, force = false) => {
    const a = await sample(left);
    const b = await sample(right);
    const probes = [];
    for (const fraction of [0.25, 0.5, 0.75]) {
      const distance = left + (right - left) * fraction;
      const actual = await sample(distance);
      const predicted = Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * fraction : null;
      probes.push({actual, error: Number.isFinite(actual) && Number.isFinite(predicted) ? Math.abs(actual - predicted) : null});
    }
    testedCount += probes.length;
    const supported = Number.isFinite(a) && Number.isFinite(b) && probes.every(probe => Number.isFinite(probe.actual));
    const absent = a === null && b === null && probes.every(probe => probe.actual === null);
    const error = supported ? Math.max(...probes.map(probe => probe.error)) : Infinity;
    if (!force && (absent || supported && error <= CURVE_TARGET_S)) {
      intervals.push({left, right, a, b, supported});
      if (supported) maxObservedErrorS = Math.max(maxObservedErrorS, error);
      return;
    }
    if (right - left <= MIN_INTERVAL_DEG) {
      intervals.push({left, right, a, b, supported: supported && error <= MAX_ERROR_S});
      if (supported && error <= MAX_ERROR_S) maxObservedErrorS = Math.max(maxObservedErrorS, error);
      return;
    }
    const middle = (left + right) / 2;
    await refine(left, middle);
    await refine(middle, right);
  };
  for (let left = 1; left < 179; left++) {
    await refine(left, left + 1);
    onProgress({stage: 'Preparing checked first-P curve', done: left, total: 178});
  }
  intervals.sort((a, b) => a.left - b.left);
  let independentCount = 0;
  for (let pass = 0; pass < 3; pass++) {
    const failed = [];
    let checkedMaximum = 0;
    for (let index = 0; index < intervals.length; index++) {
      const interval = intervals[index];
      const fraction = (Math.sqrt(5) - 1) / 2;
      const distance = interval.left + (interval.right - interval.left) * fraction;
      const actual = await sample(distance);
      independentCount++;
      const predicted = interval.supported ? interval.a + (interval.b - interval.a) * fraction : null;
      if (Number.isFinite(predicted) && Number.isFinite(actual)) {
        const error = Math.abs(predicted - actual);
        checkedMaximum = Math.max(checkedMaximum, error);
        if (error > MAX_ERROR_S) failed.push(interval);
      } else if (Number.isFinite(predicted) !== Number.isFinite(actual)) {
        if (interval.right - interval.left > MIN_INTERVAL_DEG) failed.push(interval);
        else interval.supported = false;
      }
      onProgress({stage: 'Checking independent curve distances', done: index + 1, total: intervals.length});
    }
    if (!failed.length) {
      maxObservedErrorS = Math.max(maxObservedErrorS, checkedMaximum);
      break;
    }
    if (pass === 2) throw new Error('Independent runtime curve checks exceed 0.05 seconds after bounded refinement.');
    for (const interval of failed) {
      intervals.splice(intervals.indexOf(interval), 1);
      await refine(interval.left, interval.right, true);
    }
    intervals.sort((a, b) => a.left - b.left);
  }
  function at(distance) {
    if (values.has(distance)) return values.get(distance);
    if (distance < 1 || distance > 179) return null;
    let low = 0;
    let high = intervals.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const interval = intervals[middle];
      if (distance < interval.left) high = middle - 1;
      else if (distance > interval.right) low = middle + 1;
      else return interval.supported ? interval.a + (interval.b - interval.a) * (distance - interval.left) / (interval.right - interval.left) : null;
    }
    return null;
  }
  return {
    at,
    get check() { return {maxObservedErrorS, testedCount, independentCount, queriedCount}; },
    async refineAt(distance) {
      const index = intervals.findIndex(interval => distance >= interval.left && distance <= interval.right);
      if (index < 0) throw new Error('A confirmation distance falls outside the checked curve.');
      const [interval] = intervals.splice(index, 1);
      await refine(interval.left, interval.right, true);
      intervals.sort((a, b) => a.left - b.left);
    },
  };
}

const inBounds = (point, bounds) => point.latitudeDeg >= bounds.south && point.latitudeDeg <= bounds.north && point.longitudeDeg >= bounds.west && point.longitudeDeg <= bounds.east;

async function search(stations, bounds, curve, checkpoint, onProgress) {
  let iterations = 0;
  const score = point => {
    iterations++;
    if (!inBounds(point, bounds)) return {point, rmsS: Infinity};
    const residuals = residualsFor(point, stations, curve.at);
    return {point, rmsS: residuals.kind === 'supported' ? residuals.rmsS : Infinity, residuals};
  };
  const rows = Math.ceil(bounds.north - bounds.south) + 1;
  const columns = Math.ceil(bounds.east - bounds.west) + 1;
  const grid = {bounds, rows, columns, rmsS: []};
  const candidates = [];
  for (let row = 0; row < rows; row++) {
    const latitudeDeg = bounds.south + row * (bounds.north - bounds.south) / (rows - 1);
    for (let column = 0; column < columns; column++) {
      const longitudeDeg = bounds.west + column * (bounds.east - bounds.west) / (columns - 1);
      const candidate = score({latitudeDeg, longitudeDeg});
      grid.rmsS.push(Number.isFinite(candidate.rmsS) ? candidate.rmsS : null);
      if (Number.isFinite(candidate.rmsS)) candidates.push(candidate);
    }
    onProgress({stage: 'Searching declared regional grid', done: row + 1, total: rows});
    await checkpoint();
  }
  candidates.sort((a, b) => a.rmsS - b.rmsS);
  const seeds = [];
  for (const candidate of candidates) {
    if (seeds.every(seed => greatCircleDeg(seed.point, candidate.point) >= 2)) seeds.push(candidate);
    if (seeds.length === 5) break;
  }
  if (!seeds.length) throw new Error('No supported P solution exists for every selected station in this regional grid.');
  const refined = [];
  for (let basin = 0; basin < seeds.length; basin++) {
    let best = seeds[basin];
    let step = 0.5;
    for (let round = 0; round < 160 && step > 0.00001; round++) {
      let next = best;
      for (const north of [-1, 0, 1]) for (const east of [-1, 0, 1]) {
        if (!north && !east) continue;
        const trial = score({latitudeDeg: best.point.latitudeDeg + north * step, longitudeDeg: best.point.longitudeDeg + east * step});
        if (trial.rmsS < next.rmsS) next = trial;
      }
      if (next === best) step /= 2;
      else best = next;
      if (round % 8 === 0) await checkpoint();
    }
    refined.push(best);
    onProgress({stage: 'Refining separated sampled starts', done: basin + 1, total: seeds.length});
  }
  refined.sort((a, b) => a.rmsS - b.rmsS);
  return {best: refined[0], refined, grid, iterations, seeds};
}

export async function locateSource(stations, bounds, curve, exactTime, checkpoint, onProgress) {
  if (stations.length < 4) throw new Error('Fit source requires at least four manual P observations.');
  let iterations = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await search(stations, bounds, curve, checkpoint, onProgress);
    iterations += result.iterations;
    const checks = [];
    const refineDistances = [];
    for (const candidate of result.refined) {
      const times = new Map();
      for (const station of stations) {
        const distance = greatCircleDeg(candidate.point, station.position);
        times.set(distance, exactTime(distance));
        await checkpoint();
      }
      const direct = residualsFor(candidate.point, stations, distance => times.get(distance));
      let maximum = 0;
      for (const station of candidate.residuals.stations) {
        const exact = times.get(station.distanceDeg);
        const error = Number.isFinite(exact) ? Math.abs(exact - station.predictedTimeS) : Infinity;
        maximum = Math.max(maximum, error);
        if (error > MAX_ERROR_S) refineDistances.push(station.distanceDeg);
      }
      checks.push({...candidate, direct, maximum});
    }
    if (refineDistances.length) {
      onProgress({stage: 'Refining intervals after exact confirmation', done: attempt, total: 3});
      for (const distance of refineDistances) await curve.refineAt(distance);
      continue;
    }
    checks.sort((a, b) => a.direct.rmsS - b.direct.rmsS);
    const best = checks[0];
    const distinct = checks.find(candidate => greatCircleDeg(best.point, candidate.point) >= 0.5);
    return {
      best: best.point,
      originOffsetS: best.direct.originOffsetS,
      rmsS: best.direct.rmsS,
      residuals: best.direct,
      grid: result.grid,
      bounds,
      iterations,
      directCheck: {
        exactConfirmed: true,
        interpolatedRmsS: best.rmsS,
        directRmsS: best.direct.rmsS,
        maxStationTimeErrorS: best.maximum,
        nextDistinctBasinRmsS: distinct?.direct.rmsS ?? null,
        sampledStartCount: result.seeds.length,
        checkedCandidateCount: checks.length,
        confirmationPasses: attempt + 1,
      },
      curveCheck: curve.check,
    };
  }
  throw new Error('Runtime curve could not confirm every station within 0.05 seconds after three refinement passes. No fit is accepted.');
}
