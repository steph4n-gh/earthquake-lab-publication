import { projectPath } from './geography.js';

const RADIUS_KM = 6371;
const CORE_DEPTH_KM = 2889;
const INNER_DEPTH_KM = 5153.9;
const PHASE_COLORS = { P: '#49d7b0', S: '#ee9856', PKIKP: '#b99af5' };
const LAYERS = [
  { name: 'Mantle', color: '#c58a51', depth: '0–2,889 km', anchorDepth: 1700, angle: 2.35 },
  { name: 'Liquid outer core', color: '#efb962', depth: '2,889–5,153.9 km', anchorDepth: 3900, angle: 0.65 },
  { name: 'Solid inner core', color: '#ffe2a4', depth: '5,153.9–6,371 km', anchorDepth: 5950, angle: 2.05 },
];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function svgElement(name, attributes = {}, text) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}

function pathIndex(path, timeS) {
  let low = 0;
  let high = path.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (path[middle].time_s < timeS) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function createSection(host) {
  const endpoints = document.createElement('div');
  endpoints.className = 'section-endpoints';
  const sourceLabel = document.createElement('span');
  sourceLabel.className = 'section-source';
  const receiverLabel = document.createElement('span');
  receiverLabel.className = 'section-receiver';
  endpoints.append(sourceLabel, receiverLabel);
  const svg = svgElement('svg', { class: 'section-diagram', role: 'img', 'aria-label': 'Selected seismic ray through a proportional Earth section' });
  const metrics = document.createElement('div');
  metrics.className = 'section-metrics';
  metrics.setAttribute('role', 'status');
  metrics.setAttribute('aria-live', 'off');
  const key = document.createElement('div');
  key.className = 'section-key';
  for (const [index, layer] of LAYERS.entries()) {
    const item = document.createElement('div');
    const number = document.createElement('span');
    number.className = 'section-key-number';
    number.textContent = String(index + 1);
    number.style.background = layer.color;
    const text = document.createElement('span');
    text.className = 'section-key-label';
    text.textContent = `${layer.name} · ${layer.depth}`;
    item.append(number, text);
    key.append(item);
  }
  const caption = document.createElement('p');
  caption.className = 'section-caption';
  host.append(endpoints, svg, metrics, key, caption);
  host.dataset.earthRadiusKm = String(RADIUS_KM);
  host.dataset.coreBoundaryDepthKm = String(CORE_DEPTH_KM);
  host.dataset.innerBoundaryDepthKm = String(INNER_DEPTH_KM);
  let view;
  let width = 0;
  let identity;
  let selection;
  let geometry;
  let playbackTimeS = 0;
  let disposed = false;
  let resizeFrame;

  function rebuild() {
    if (!view || disposed) return;
    const { investigation, experiment, snapshot } = view;
    const station = investigation.stations.find(value => value.id === experiment.stationId);
    const arrival = snapshot?.arrivals.filter(value => value.phase === experiment.phase)[experiment.branch];
    const radius = Math.min((width - 30) / 2, 280);
    const center = { x: width / 2, y: radius + 10 };
    const totalAngle = snapshot ? snapshot.distanceDeg * Math.PI / 180 : 0;
    const startAngle = -Math.PI / 2 - totalAngle / 2;
    const pointAt = point => {
      const angle = startAngle + point.distance_rad;
      const radial = (1 - point.depth_km / RADIUS_KM) * radius;
      return { x: center.x + Math.cos(angle) * radial, y: center.y + Math.sin(angle) * radial };
    };
    svg.setAttribute('viewBox', `0 0 ${width} ${radius * 2 + 20}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', radius * 2 + 20);
    host.dataset.sectionProjection = JSON.stringify({ center, radius, startAngle });
    svg.replaceChildren();
    const add = (name, attributes, text) => {
      const element = svgElement(name, attributes, text);
      svg.append(element);
      return element;
    };
    add('title', {}, `${experiment.phase} ray from ${investigation.shortTitle || investigation.title} to ${snapshot?.hypothetical ? 'a hypothetical receiver' : station?.code || 'selected station'}`);
    add('circle', { cx: center.x, cy: center.y, r: radius, fill: LAYERS[0].color, stroke: '#d7b982', 'stroke-width': 1 });
    add('circle', { cx: center.x, cy: center.y, r: radius * (1 - 660 / RADIUS_KM), fill: '#b47845', stroke: '#593d2d', 'stroke-opacity': 0.3, 'stroke-width': 1 });
    add('circle', { cx: center.x, cy: center.y, r: radius * (1 - CORE_DEPTH_KM / RADIUS_KM), fill: LAYERS[1].color, stroke: '#5c422a', 'stroke-width': 1.2, 'data-boundary-depth-km': CORE_DEPTH_KM });
    add('circle', { cx: center.x, cy: center.y, r: radius * (1 - INNER_DEPTH_KM / RADIUS_KM), fill: LAYERS[2].color, stroke: '#74502d', 'stroke-width': 1.2, 'data-boundary-depth-km': INNER_DEPTH_KM });
    const color = PHASE_COLORS[experiment.phase];
    geometry = null;
    if (arrival) {
      const points = arrival.path.map(pointAt);
      const lengths = [0];
      for (let index = 1; index < points.length; index++) lengths.push(lengths[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y));
      const d = points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
      add('path', { d, fill: 'none', stroke: '#172d34', 'stroke-width': 6.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'data-section-ray-outline': '' });
      add('path', { d, fill: 'none', stroke: color, 'stroke-width': 3.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: 0.62, 'data-section-ray': '', 'data-phase': arrival.phase, 'data-arrival-time-s': arrival.time_s });
      const progress = add('path', { d, fill: 'none', stroke: color, 'stroke-width': 3.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': '0 1', 'data-section-progress': '' });
      const packet = add('circle', { r: 6, fill: color, stroke: '#122b35', 'stroke-width': 3, visibility: 'hidden', 'data-section-packet': '' });
      geometry = { arrival, points, lengths, progress, packet, modelPositions: projectPath(snapshot.source, snapshot.receiver, arrival.path) };
    }
    if (snapshot) {
      const start = pointAt({ distance_rad: 0, depth_km: snapshot.source.depthKm });
      const end = pointAt({ distance_rad: totalAngle, depth_km: 0 });
      for (const [point, edge, text, endpointColor] of [[start, 16, 'Source', '#ffdf99'], [end, width - 16, 'Receiver', color]]) {
        add('path', { d: `M${point.x},${point.y} L${edge},5`, fill: 'none', stroke: '#f0e2bb', 'stroke-width': 1.1, 'stroke-opacity': 0.6 });
        add('circle', { cx: point.x, cy: point.y, r: 5, fill: endpointColor, stroke: '#122b35', 'stroke-width': 2 });
        add('text', { x: edge, y: 15, fill: '#f8edcf', 'text-anchor': text === 'Source' ? 'start' : 'end', 'font-size': 12, 'font-family': 'sans-serif' }, text);
      }
    }
    for (const [index, layer] of LAYERS.entries()) {
      const radial = (1 - layer.anchorDepth / RADIUS_KM) * radius;
      const x = center.x + Math.cos(layer.angle) * radial;
      const y = center.y + Math.sin(layer.angle) * radial;
      add('circle', { cx: x, cy: y, r: 10, fill: '#172d34', stroke: '#f8e3ba', 'stroke-width': 1, 'fill-opacity': 0.92 });
      add('text', { x, y: y + 4, fill: '#fff3d4', 'text-anchor': 'middle', 'font-size': 12, 'font-family': 'sans-serif', 'font-weight': 600 }, String(index + 1));
    }
    const sourceName = experiment.context.kind === 'locate' ? 'Candidate source' : investigation.shortTitle || investigation.title || 'Earthquake source';
    sourceLabel.textContent = `Source · ${sourceName} · ${snapshot ? snapshot.source.depthKm.toFixed(1) : investigation.source.depthKm.toFixed(1)} km deep`;
    receiverLabel.textContent = `Receiver · ${snapshot?.hypothetical ? 'Hypothetical receiver' : station?.code || 'Selected station'}${snapshot ? ` · ${snapshot.distanceDeg.toFixed(1)}° away` : ''}`;
    host.dataset.sectionEvent = investigation.key || investigation.id;
    host.dataset.sectionPhase = experiment.phase;
    host.dataset.sectionStatus = snapshot ? arrival ? 'ready' : 'no-arrival' : 'pending';
    caption.textContent = !snapshot ? 'Calculating the selected path.' : !arrival ? `No ${experiment.phase} arrival is supported at this depth and distance. Choose another station, phase or geometry.` : 'Earth and ray drawn to scale. This plane is rotated between source and receiver, so north is not up. Use the globe for geography.';
    renderTime(playbackTimeS);
  }

  function renderTime(timeS) {
    if (!view || disposed) return;
    playbackTimeS = timeS;
    const rayTime = timeS - (view.snapshot?.originOffsetS || 0);
    host.dataset.playbackTimeS = String(timeS);
    host.dataset.rayTimeS = String(rayTime);
    delete host.dataset.selectedPacket;
    if (!geometry) {
      delete host.dataset.packetDepthKm;
      delete host.dataset.packetMaterial;
      metrics.textContent = view.snapshot ? `No ${view.experiment.phase} ray at this geometry` : 'Preparing the Earth section';
      return;
    }
    const { arrival, points, lengths, progress, packet, modelPositions } = geometry;
    const { path } = arrival;
    const index = pathIndex(path, rayTime);
    const previous = Math.max(0, index - 1);
    const fraction = index === 0 ? 0 : clamp((rayTime - path[previous].time_s) / (path[index].time_s - path[previous].time_s), 0, 1);
    const x = points[previous].x + (points[index].x - points[previous].x) * fraction;
    const y = points[previous].y + (points[index].y - points[previous].y) * fraction;
    const depthKm = path[previous].depth_km + (path[index].depth_km - path[previous].depth_km) * fraction;
    const distanceRad = path[previous].distance_rad + (path[index].distance_rad - path[previous].distance_rad) * fraction;
    const material = depthKm >= INNER_DEPTH_KM ? 'Solid inner core' : depthKm >= CORE_DEPTH_KM ? 'Liquid outer core' : 'Mantle';
    const visible = rayTime >= 0 && rayTime <= arrival.time_s;
    packet.setAttribute('cx', x);
    packet.setAttribute('cy', y);
    packet.setAttribute('visibility', visible ? 'visible' : 'hidden');
    const completedLength = rayTime < 0 ? 0 : rayTime >= arrival.time_s ? lengths.at(-1) : lengths[previous] + (lengths[index] - lengths[previous]) * fraction;
    progress.setAttribute('stroke-dasharray', `${completedLength / lengths.at(-1)} 1`);
    const modelPosition = modelPositions[previous].map((value, axis) => value + (modelPositions[index][axis] - value) * fraction);
    if (visible) host.dataset.selectedPacket = JSON.stringify({ phase: arrival.phase, timeS: rayTime, index, fraction, depthKm, distanceRad, material, sectionPosition: [x, y], modelPosition });
    host.dataset.packetDepthKm = String(depthKm);
    host.dataset.packetMaterial = material;
    metrics.textContent = rayTime < 0 ? `${arrival.phase} · Before model source time` : rayTime > arrival.time_s ? `${arrival.phase} · Arrived at ${arrival.time_s.toFixed(1)} s · Surface receiver` : `${arrival.phase} · ${rayTime.toFixed(1)} s · ${depthKm.toFixed(0)} km deep · ${material}`;
  }

  function resize() {
    const style = getComputedStyle(host);
    const nextWidth = Math.max(250, Math.round(host.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)));
    if (width === nextWidth) return;
    width = nextWidth;
    rebuild();
  }
  const observer = new ResizeObserver(() => {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(() => { resizeFrame = null; resize(); });
  });
  observer.observe(host);
  resize();
  return {
    render(nextView) {
      if (disposed) return;
      view = nextView;
      playbackTimeS = view.playbackTimeS;
      const nextSelection = `${view.investigation.id}/${view.experiment.stationId}/${view.experiment.phase}/${view.experiment.branch}`;
      if (identity !== view.snapshot || selection !== nextSelection) {
        identity = view.snapshot;
        selection = nextSelection;
        rebuild();
      } else renderTime(view.playbackTimeS);
    },
    renderTime,
    dispose() {
      disposed = true;
      observer.disconnect();
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      endpoints.remove();
      svg.remove();
      metrics.remove();
      key.remove();
      caption.remove();
    },
  };
}
