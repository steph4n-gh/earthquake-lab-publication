export const FRONT_PHASES = ['P', 'S', 'PKIKP'];
export const FRONT_COLORS = { P: '#7be5bc', S: '#ffc174', PKIKP: '#d2b1ff' };

export function packFan(fan, modelIdentity) {
  let pointCount = 0;
  for (const segment of fan.segments) for (const ray of segment.rays) pointCount += ray.path.length;
  const samples = new Float64Array(pointCount * 3);
  let offset = 0;
  const segments = fan.segments.map(segment => ({ phase: segment.phase, rays: segment.rays.map(ray => {
    const start = offset;
    for (const point of ray.path) { samples[offset++] = point.time_s; samples[offset++] = point.distance_rad; samples[offset++] = point.depth_km; }
    return { phase: ray.phase, timeS: ray.time_s, rayParamSRad: ray.ray_param_s_rad, turningDepthKm: ray.turning_depth_km, anchor: ray.anchor, offset: start, count: ray.path.length };
  }) }));
  return { depthKm: fan.depth_km, modelIdentity, policy: fan.policy, segments, gaps: fan.gaps, samples, pointCount, rayCount: segments.reduce((sum, segment) => sum + segment.rays.length, 0), byteLength: samples.byteLength };
}

export function sampleRay(samples, ray, timeS, output) {
  if (timeS < 0 || timeS > ray.timeS) return false;
  let low = 0;
  let high = ray.count - 1;
  while (low < high) { const middle = (low + high) >> 1; if (samples[ray.offset + middle * 3] < timeS) low = middle + 1; else high = middle; }
  const end = ray.offset + low * 3;
  const start = ray.offset + Math.max(0, low - 1) * 3;
  const duration = samples[end] - samples[start];
  const fraction = duration > 0 ? (timeS - samples[start]) / duration : 0;
  output[0] = samples[start + 1] + fraction * (samples[end + 1] - samples[start + 1]);
  output[1] = samples[start + 2] + fraction * (samples[end + 2] - samples[start + 2]);
  const firstRadius = 1 - samples[start + 2] / 6371;
  const lastRadius = 1 - samples[end + 2] / 6371;
  output[2] = firstRadius * Math.cos(samples[start + 1]) * (1 - fraction) + lastRadius * Math.cos(samples[end + 1]) * fraction;
  output[3] = firstRadius * Math.sin(samples[start + 1]) * (1 - fraction) + lastRadius * Math.sin(samples[end + 1]) * fraction;
  return true;
}

export function stationPhaseState(arrivals, timeS, originOffsetS = 0) {
  const reached = [];
  let pulse = 0;
  let phase;
  for (const arrival of arrivals ?? []) {
    const elapsed = timeS - originOffsetS - arrival.timeS;
    if (elapsed >= 0 && !reached.includes(arrival.phase)) reached.push(arrival.phase);
    const strength = elapsed >= 0 && elapsed < 24 ? 1 - elapsed / 24 : 0;
    if (strength > pulse) { pulse = strength; phase = arrival.phase; }
  }
  return { reached, pulse, phase };
}
