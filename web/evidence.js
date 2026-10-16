import {stationPhaseState} from './wavefronts.js';
import {greatCircleDeg} from './geography.js';

const PHASES = {
  P: {color: '#68ddde', name: 'P · compressional'},
  S: {color: '#ffb47e', name: 'S · shear'},
  PKIKP: {color: '#d1adff', name: 'PKIKP · inner core'},
};
const esc = value => String(value).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
const fixed = (value, digits = 1) => value.toFixed(digits);
const clock = seconds => `${seconds < 0 ? '−' : ''}${Math.floor(Math.abs(seconds) / 60)}:${String(Math.floor(Math.abs(seconds) % 60)).padStart(2, '0')}`;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function timeTicks(minimum, maximum, count) {
  const firstMinute = minimum / 60;
  const lastMinute = maximum / 60;
  const rough = (lastMinute - firstMinute) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].find(value => value * magnitude >= rough) * magnitude;
  const result = [];
  for (let value = Math.ceil(firstMinute / step) * step; value <= lastMinute; value += step) result.push(value * 60);
  return result;
}

function waveformPath(trace, x, center, amplitude, pixelWidth) {
  const peak = trace.samples.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 1);
  const step = Math.max(1, Math.ceil(trace.samples.length / (pixelWidth * 2)));
  const points = [];
  for (let index = 0; index < trace.samples.length; index += step) {
    let low = index;
    let high = index;
    for (let cursor = index + 1; cursor < Math.min(index + step, trace.samples.length); cursor++) {
      if (trace.samples[cursor] < trace.samples[low]) low = cursor;
      if (trace.samples[cursor] > trace.samples[high]) high = cursor;
    }
    for (const sample of low === high ? [low] : [Math.min(low, high), Math.max(low, high)]) {
      points.push(`${points.length ? 'L' : 'M'}${fixed(x(trace.start_offset_s + sample / trace.sample_rate_hz), 2)},${fixed(center - trace.samples[sample] / peak * amplitude, 2)}`);
    }
  }
  return points.join(' ');
}

function cross(x, y, size = 5) {
  return `M${x - size},${y}H${x + size}M${x},${y - size}V${y + size}`;
}

function diamond(x, y, size = 5) {
  return `M${x},${y - size}L${x + size},${y}L${x},${y + size}L${x - size},${y}Z`;
}

export function createEvidenceViews(host, callbacks) {
  host.innerHTML = `<style>
    #evidence-views .ev-card{background:#10262e;color:#e7f2ef;border:1px solid #36545a;border-radius:20px;padding:clamp(18px,3vw,32px);overflow:hidden}
    #evidence-views .ev-heading{display:flex;align-items:start;justify-content:space-between;gap:18px;margin-bottom:16px}
    #evidence-views .ev-eyebrow{font-size:12px!important;letter-spacing:.12em;color:#8cb4b6;margin:0 0 8px}
    #evidence-views .ev-heading h3{font-size:clamp(24px,3vw,34px);line-height:1.15;font-weight:500;color:#f2f6ec;margin:0}
    #evidence-views .ev-count{font-size:12px;line-height:1.5;text-align:right;color:#b4cfce;white-space:nowrap;padding-top:5px}
    #evidence-views .ev-intro,#evidence-views .ev-caption,#evidence-views .ev-status{font-size:13px;line-height:1.6;color:#bed0d0;margin:12px 0}
    #evidence-views .ev-status{border-left:3px solid #68ddde;padding:8px 12px;background:#17343c}
    #evidence-views .ev-status[data-error=true]{border-color:#ffb47e;color:#ffe0cb}
    #evidence-views .ev-legend{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;font-size:12px;color:#bed0d0;margin:16px 0}
    #evidence-views .ev-legend span{display:inline-flex;align-items:center;gap:7px}
    #evidence-views .ev-legend i{display:inline-block;width:15px;height:3px;background:var(--ev-color);vertical-align:middle}
    #evidence-views .ev-legend button{min-height:44px;padding:9px 13px;border-radius:999px;background:#17343c;border:1px solid #446269;color:#d1e0df;font:inherit;font-size:12px;cursor:pointer}
    #evidence-views .ev-legend button[aria-pressed=true]{border-color:var(--ev-color);box-shadow:inset 0 0 0 1px var(--ev-color);color:#fff}
    #evidence-views .ev-legend button:focus-visible{outline:3px solid #f7cd78;outline-offset:3px}
    #evidence-views svg{display:block;width:100%;overflow:visible;touch-action:pan-y;font-family:inherit}
    #evidence-views svg text{font-family:inherit;font-size:12px;fill:#a8c3c7}
    #evidence-views svg .ev-station-name{fill:#ecf3ec;font-size:13px;font-weight:650}
    #evidence-views svg [role=button]{cursor:pointer;outline:none}
    #evidence-views svg [role=button]:focus-visible .ev-hit{stroke:#f7cd78;stroke-width:3;fill:#f7cd7822}
    #evidence-views svg [data-kind=record-row]:focus-visible .ev-row-background{stroke:#f7cd78;stroke-width:2}
    #evidence-views .ev-screen-note{font-size:12px;color:#b4cfce;margin:12px 0 0}
    #evidence-views .ev-empty{padding:40px 12px;border:1px dashed #446269;border-radius:12px;color:#bed0d0;font-size:14px}
    @media(max-width:600px){#evidence-views .ev-heading{gap:10px}#evidence-views .ev-count{white-space:normal;max-width:90px}#evidence-views .ev-card{border-radius:14px}}
  </style><section class="ev-card" aria-labelledby="evidence-view-title"><div class="ev-heading"><div><p class="ev-eyebrow" id="evidence-view-eyebrow"></p><h3 id="evidence-view-title"></h3></div><div class="ev-count" id="evidence-view-count"></div></div><p class="ev-intro" id="evidence-view-intro"></p><div class="ev-legend" id="evidence-view-legend"></div><p class="ev-status" id="evidence-view-status" role="status" hidden></p><div id="evidence-view-plot"></div><p class="ev-caption" id="evidence-view-caption"></p></section>`;
  const find = id => host.querySelector(`#${id}`);
  const plot = find('evidence-view-plot');
  const legend = find('evidence-view-legend');
  let latest;
  let lastRender;
  let waveformCache;
  let cursors = [];
  let recordScale;
  let width = Math.max(200, plot.clientWidth);
  let disposed = false;
  let resizeFrame = null;

  function activate(target, event) {
    const phase = target.closest('[data-action-phase]');
    if (phase) { callbacks.phase(phase.dataset.actionPhase); return; }
    let sample = target.closest('[data-kind="sampled-root"]');
    if (sample && event?.clientX != null) {
      const svg = sample.ownerSVGElement;
      const bounds = svg.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width * svg.viewBox.baseVal.width;
      const y = (event.clientY - bounds.top) / bounds.height * svg.viewBox.baseVal.height;
      let nearestDistance = Infinity;
      for (const root of svg.querySelectorAll('[data-kind="sampled-root"]')) {
        const point = root.querySelector('circle');
        const distance = (Number(point.getAttribute('cx')) - x) ** 2 + (Number(point.getAttribute('cy')) - y) ** 2;
        if (distance < nearestDistance) { sample = root; nearestDistance = distance; }
      }
    }
    if (sample) {
      callbacks.sample({depthKm: Number(sample.dataset.depthKm), distanceDeg: Number(sample.dataset.distanceDeg), phase: sample.dataset.phase, branch: Number(sample.dataset.branch)});
      return;
    }
    const station = target.closest('[data-station-id]');
    if (!station) return;
    callbacks.station(station.dataset.stationId);
    if (station.dataset.phase) callbacks.arrival(station.dataset.phase, Number(station.dataset.branch));
    if (station.dataset.kind === 'record-row' && event?.clientX != null && recordScale) {
      const bounds = station.ownerSVGElement.getBoundingClientRect();
      const point = (event.clientX - bounds.left) / bounds.width * recordScale.width;
      if (point >= recordScale.left && point <= recordScale.right) callbacks.time(clamp(recordScale.invert(point), recordScale.minimum, recordScale.maximum));
    } else if (station.dataset.timeS != null) callbacks.time(Number(station.dataset.timeS));
  }

  const click = event => activate(event.target, event);
  const keydown = event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const control = event.target.closest('svg [role="button"]');
    if (!control) return;
    event.preventDefault();
    activate(control);
  };
  host.addEventListener('click', click);
  host.addEventListener('keydown', keydown);

  function status(message, error = false) {
    const element = find('evidence-view-status');
    element.hidden = !message;
    element.textContent = message;
    element.dataset.error = String(error);
  }

  function recordSection({investigation, experiment, snapshot}) {
    const {startS: minimum, endS: maximum} = investigation.replayBounds;
    const left = width < 500 ? 64 : 88;
    const right = width - 12;
    const top = 38;
    const rowHeight = 72;
    const rows = investigation.stations.map(station => ({station, distance: greatCircleDeg(investigation.source, station.position)})).sort((a, b) => a.distance - b.distance);
    const bottom = top + rows.length * rowHeight;
    const height = bottom + 42;
    const x = time => left + (time - minimum) / (maximum - minimum) * (right - left);
    recordScale = {minimum, maximum, width, left, right, invert: point => minimum + (point - left) / (right - left) * (maximum - minimum)};
    const cacheKey = `${investigation.identity}/${width}/${minimum}/${maximum}`;
    if (waveformCache?.key !== cacheKey) waveformCache = {key: cacheKey, paths: rows.map(({station}, index) => waveformPath(station.trace, x, top + index * rowHeight + 35, 23, right - left))};
    const summaries = new Map((snapshot?.stationArrivals ?? []).map(station => [station.stationId, station]));
    const origin = snapshot?.originOffsetS ?? 0;
    const grid = timeTicks(minimum, maximum, width < 500 ? 4 : 8).map(time => `<line x1="${x(time)}" x2="${x(time)}" y1="${top - 8}" y2="${bottom}" stroke="#31505a" stroke-dasharray="2 5"/><text x="${x(time)}" y="${bottom + 24}" text-anchor="middle">${clock(time)}</text>`).join('');
    const markup = rows.map(({station, distance}, index) => {
      const center = top + index * rowHeight + 35;
      const summary = summaries.get(station.id);
      const selected = station.id === experiment.stationId;
      const markers = (summary?.arrivals ?? []).filter(arrival => arrival.timeS + origin >= minimum && arrival.timeS + origin <= maximum).map(arrival => {
        const time = arrival.timeS + origin;
        return `<g data-kind="record-prediction" data-station-id="${esc(station.id)}" data-distance-deg="${summary.distanceDeg}" data-travel-time-s="${arrival.timeS}" data-phase="${arrival.phase}" data-branch="${arrival.branch}" data-time-s="${time}"><line x1="${x(time)}" x2="${x(time)}" y1="${center - 27}" y2="${center + 26}" stroke="${PHASES[arrival.phase].color}" stroke-width="${arrival.phase === experiment.phase ? 2 : 1}" stroke-dasharray="4 4" opacity="${arrival.phase === experiment.phase ? 1 : 0.45}"/><title>Exact model ${arrival.phase}, branch ${arrival.branch + 1}, ${fixed(time)} seconds after catalog origin</title></g>`;
      }).join('');
      const pick = station.observedPick;
      const pickMarker = pick && pick.offsetS >= minimum && pick.offsetS <= maximum ? `<g data-kind="archived-pick" data-station-id="${esc(station.id)}" data-time-s="${pick.offsetS}" role="button" tabindex="0" aria-label="${esc(station.code)} archived manual P at ${fixed(pick.offsetS)} seconds"><path d="${cross(x(pick.offsetS), center - 26, 5)}" stroke="#f7cd78" stroke-width="2.5" fill="none"/><circle class="ev-hit" cx="${x(pick.offsetS)}" cy="${center - 26}" r="12" fill="transparent"/><title>Archived manual P, ${fixed(pick.offsetS)} s. Independent analyst pick, not a model prediction.</title></g>` : '';
      const availability = !snapshot ? 'Model pending' : !summary ? 'Model unavailable' : summary.arrivals.length ? '' : 'No supported P / S / PKIKP';
      return `<g data-kind="record-row" data-station-id="${esc(station.id)}" data-distance-deg="${distance}" role="button" tabindex="0" aria-label="Select ${esc(station.code)} recording, catalog distance ${fixed(distance)} degrees${availability ? `, ${availability}` : ''}"><rect class="ev-row-background" x="0" y="${center - 32}" width="${width}" height="64" rx="8" fill="${selected ? '#24444d' : index % 2 ? '#142e37' : '#10262e'}"/><circle data-kind="station-arrival-cue" cx="47" cy="${center - 7}" r="3" fill="#7b9196"/><text class="ev-station-name" x="8" y="${center - 3}">${esc(station.code)}</text><text x="8" y="${center + 17}">${fixed(distance)}°</text><path d="M${left},${center}H${right}" stroke="#3c5b62"/><path data-kind="recording-counts" d="${waveformCache.paths[index]}" fill="none" stroke="${selected ? '#e7f2ef' : '#94b9bf'}" stroke-width="1.1" vector-effect="non-scaling-stroke"/>${markers}${pickMarker}${availability ? `<text x="${right - 5}" y="${center + 25}" text-anchor="end" fill="#f4cb91">${availability}</text>` : ''}</g>`;
    }).join('');
    plot.innerHTML = `<svg id="record-section" data-event-key="${esc(investigation.key)}" data-identity="${esc(investigation.identity)}" data-depth-km="${snapshot?.source.depthKm ?? investigation.source.depthKm}" viewBox="0 0 ${width} ${height}" aria-label="All real station recordings ordered by catalog distance, with exact model arrivals and independent archived picks"><title>One earthquake, ${rows.length} instrumental recordings</title><desc>Each row is independently scaled filtered instrumental counts. Dashed phase-colored lines are exact model predictions. Gold crosses are independent archived manual P picks. Click a station or a recording time to link the globe and replay.</desc>${grid}<text x="8" y="18">Catalog Δ</text><text x="${right}" y="18" text-anchor="end">Time after catalog origin</text>${markup}<g data-kind="record-cursor" pointer-events="none"><line y1="${top - 8}" y2="${bottom}" stroke="#fff3d3" stroke-width="2"/><path d="M-5,${top - 11}H5L0,${top - 4}Z" fill="#fff3d3"/></g></svg>`;
    cursors = [{element: plot.querySelector('[data-kind="record-cursor"]'), scale: x, minimum, maximum, axis: 'x'}];
    find('evidence-view-eyebrow').textContent = 'THE STATION NETWORK';
    find('evidence-view-title').textContent = 'One event. Different witnesses.';
    find('evidence-view-count').textContent = `${rows.length} real recordings · ${rows.filter(row => row.station.observedPick).length} archived picks`;
    find('evidence-view-intro').textContent = 'Read the earthquake across the network. Select a row to follow that station. Tap a trace to move the shared replay clock.';
    legend.innerHTML = `<span><i style="--ev-color:#c5dcdf"></i>Filtered counts</span><span style="color:#f7cd78">✚ Archived manual P</span>${Object.entries(PHASES).map(([phase, item]) => `<span><i style="--ev-color:${item.color}"></i>Model ${phase}</span>`).join('')}`;
    find('evidence-view-caption').textContent = `Each trace is independently normalized instrumental counts. Amplitudes cannot be compared between stations. Rows retain historical catalog distances. ${snapshot?.request.kind === 'radial' ? 'Predictions use the chosen source depth and each real station. The virtual receiver is separate from these recordings.' : snapshot?.hypothetical ? 'Model markers use the candidate source and its common origin offset. Historical recordings and archived picks stay fixed.' : 'Dashed markers show all supported model roots at each station. Gold crosses retain independent pick times.'} An empty model result does not imply a silent recording.`;
    status(snapshot ? '' : 'Preparing exact station predictions. Historical recordings and archived picks remain visible.');
  }

  function travelDiagram({investigation, experiment, snapshot, diagram, diagramPending, diagramError}) {
    recordScale = null;
    const depth = snapshot?.source.depthKm ?? (experiment.context.kind === 'explore' ? experiment.context.depthKm : investigation.source.depthKm);
    if (diagram?.depthKm !== depth) diagram = null;
    find('evidence-view-eyebrow').textContent = 'CALCULATED TRAVEL TIMES';
    find('evidence-view-title').textContent = 'Distance changes the route.';
    find('evidence-view-intro').textContent = 'Every dot is an independently calculated model root. Select a phase, a station, or a sampled root to inspect its actual ray through Earth.';
    const counts = Object.fromEntries(Object.keys(PHASES).map(phase => [phase, (diagram?.samples ?? []).reduce((count, sample) => count + sample.arrivals.filter(arrival => arrival.phase === phase).length, 0)]));
    legend.innerHTML = Object.entries(PHASES).map(([phase, item]) => `<button type="button" data-action-phase="${phase}" aria-label="Emphasize ${phase} travel times" aria-pressed="${experiment.phase === phase}" style="--ev-color:${item.color}"><i style="--ev-color:${item.color}"></i> ${item.name} · ${counts[phase]}</button>`).join('') + '<span>◇ Exact station prediction</span><span style="color:#f7cd78">✚ Archived manual P</span>';
    find('evidence-view-count').textContent = `${fixed(depth)} km source · ${diagram?.samples.length ?? 0} sampled distances`;
    status(diagramError ? `Travel-time preparation failed. ${diagramError.message ?? diagramError}` : diagramPending ? 'Calculating all supported roots in the local numerical Worker. Existing station evidence stays available.' : !diagram ? 'Travel-time sampling will begin when the numerical Worker is ready.' : '', Boolean(diagramError));
    if (!diagram) {
      plot.innerHTML = '<div class="ev-empty">The diagram needs exact calculations at 90 distances. No interpolated locator curve is used.</div>';
      cursors = [];
      find('evidence-view-caption').textContent = 'IASP91 · P, S and PKIKP · receivers at the surface · calculated locally. A missing supported phase says nothing about other energy in the real recording.';
      return;
    }
    const origin = snapshot?.originOffsetS ?? 0;
    const summaries = snapshot?.stationArrivals ?? [];
    const times = [0, ...diagram.samples.flatMap(sample => sample.arrivals.map(arrival => arrival.timeS + origin)), ...summaries.flatMap(station => station.arrivals.map(arrival => arrival.timeS + origin)), ...investigation.stations.filter(station => station.observedPick).map(station => station.observedPick.offsetS)];
    const minimum = Math.min(0, ...times);
    const maximum = Math.ceil(Math.max(1, ...times) / 300) * 300;
    const left = width < 500 ? 46 : 62;
    const right = width - 15;
    const top = 25;
    const bottom = width < 500 ? 385 : 440;
    const height = bottom + 52;
    const x = angle => left + angle / 180 * (right - left);
    const y = time => bottom - (time - minimum) / (maximum - minimum) * (bottom - top);
    const grid = [0, 30, 60, 90, 120, 150, 180].map(angle => `<line x1="${x(angle)}" x2="${x(angle)}" y1="${top}" y2="${bottom}" stroke="#31505a"/><text x="${x(angle)}" y="${bottom + 22}" text-anchor="middle">${angle}°</text>`).join('') + timeTicks(minimum, maximum, 6).map(time => `<line x1="${left}" x2="${right}" y1="${y(time)}" y2="${y(time)}" stroke="#31505a"/><text x="${left - 9}" y="${y(time) + 4}" text-anchor="end">${clock(time)}</text>`).join('');
    const roots = diagram.samples.map(sample => `<g data-kind="sampled-distance" data-distance-deg="${sample.distanceDeg}" data-root-count="${sample.arrivals.length}">${sample.arrivals.map(arrival => {
      const time = arrival.timeS + origin;
      return `<g data-kind="sampled-root" data-depth-km="${diagram.depthKm}" data-distance-deg="${sample.distanceDeg}" data-phase="${arrival.phase}" data-branch="${arrival.branch}" data-travel-time-s="${arrival.timeS}" data-time-s="${time}" role="button" tabindex="0" aria-label="Inspect ${arrival.phase} branch ${arrival.branch + 1} at ${sample.distanceDeg} degrees, ${fixed(arrival.timeS)} seconds travel time" opacity="${arrival.phase === experiment.phase ? 1 : 0.35}"><circle cx="${x(sample.distanceDeg)}" cy="${y(time)}" r="${arrival.phase === experiment.phase ? 3 : 2.4}" fill="${PHASES[arrival.phase].color}"/><circle class="ev-hit" cx="${x(sample.distanceDeg)}" cy="${y(time)}" r="7" fill="transparent"/><title>${arrival.phase} · root ${arrival.branch + 1} · ${sample.distanceDeg}° · ${fixed(arrival.timeS)} s travel time</title></g>`;
    }).join('')}</g>`).join('');
    const overlay = summaries.map(summary => {
      const station = investigation.stations.find(item => item.id === summary.stationId);
      if (!station) return '';
      const selected = station.id === experiment.stationId;
      const predictions = summary.arrivals.map(arrival => {
        const time = arrival.timeS + origin;
        return `<g data-kind="station-prediction" data-station-id="${esc(station.id)}" data-distance-deg="${summary.distanceDeg}" data-phase="${arrival.phase}" data-branch="${arrival.branch}" data-travel-time-s="${arrival.timeS}" data-time-s="${time}" role="button" tabindex="0" aria-label="Select ${esc(station.code)} model ${arrival.phase} at ${fixed(time)} seconds"><path d="${diamond(x(summary.distanceDeg), y(time), selected ? 7 : 5)}" fill="#10262e" stroke="${PHASES[arrival.phase].color}" stroke-width="${selected ? 2.5 : 1.8}"/><circle class="ev-hit" cx="${x(summary.distanceDeg)}" cy="${y(time)}" r="10" fill="transparent"/><title>${esc(station.code)} exact station ${arrival.phase} · ${fixed(summary.distanceDeg)}° · ${fixed(time)} s after catalog origin</title></g>`;
      }).join('');
      const pick = station.observedPick;
      const manual = pick ? `<g data-kind="archived-pick" data-station-id="${esc(station.id)}" data-distance-deg="${summary.distanceDeg}" data-time-s="${pick.offsetS}" role="button" tabindex="0" aria-label="Select ${esc(station.code)} archived P at ${fixed(pick.offsetS)} seconds"><path d="${cross(x(summary.distanceDeg), y(pick.offsetS), selected ? 7 : 5)}" fill="none" stroke="#f7cd78" stroke-width="2.5"/><circle class="ev-hit" cx="${x(summary.distanceDeg)}" cy="${y(pick.offsetS)}" r="10" fill="transparent"/><title>${esc(station.code)} independent archived P · ${fixed(pick.offsetS)} s after catalog origin</title></g>` : '';
      const labelTime = pick?.offsetS ?? summary.arrivals[0]?.timeS + origin;
      const label = selected && Number.isFinite(labelTime) ? `<text x="${clamp(x(summary.distanceDeg) + 10, left + 8, right - 45)}" y="${clamp(y(labelTime) - 12, top + 12, bottom - 12)}" fill="#fff3d3" class="ev-station-name" paint-order="stroke" stroke="#10262e" stroke-width="4">${esc(station.code)}</text>` : '';
      return predictions + manual + label;
    }).join('');
    const virtual = snapshot?.request.kind === 'radial' ? snapshot.arrivals.map((arrival, index) => {
      const selected = arrival.phase === experiment.phase && snapshot.arrivals.filter(item => item.phase === experiment.phase).indexOf(arrival) === experiment.branch;
      return `<g data-kind="virtual-receiver" data-distance-deg="${snapshot.distanceDeg}" data-travel-time-s="${arrival.time_s}" data-phase="${arrival.phase}" data-time-s="${arrival.time_s}"><circle cx="${x(snapshot.distanceDeg)}" cy="${y(arrival.time_s)}" r="${selected ? 9 : 6}" fill="none" stroke="#fff3d3" stroke-width="2" stroke-dasharray="3 2"/><title>Virtual receiver ${arrival.phase} · ${fixed(snapshot.distanceDeg)}° · ${fixed(arrival.time_s)} s. This is not a historical station.</title>${selected || index === 0 ? `<text x="${clamp(x(snapshot.distanceDeg) + 11, left + 8, right - 105)}" y="${clamp(y(arrival.time_s) + 19, top + 12, bottom - 5)}" fill="#fff3d3" paint-order="stroke" stroke="#10262e" stroke-width="4">Virtual receiver</text>` : ''}</g>`;
    }).join('') : '';
    plot.innerHTML = `<svg id="travel-time-diagram" data-event-key="${esc(investigation.key)}" data-identity="${esc(investigation.identity)}" data-depth-km="${diagram.depthKm}" viewBox="0 0 ${width} ${height}" aria-label="Sampled exact IASP91 travel times for P S and PKIKP, with independent picks and exact station predictions"><title>Exact sampled travel times at ${fixed(diagram.depthKm)} km source depth</title><desc>All calculated roots are individual dots. No lines join branch indices between distances. Diamonds are exact real station predictions. Gold crosses are independent archived manual P picks. Dashed white rings identify a hypothetical virtual receiver.</desc>${grid}<text x="${left}" y="12">Time after catalog origin</text><text x="${right}" y="${bottom + 46}" text-anchor="end">Source–receiver angle</text>${roots}${overlay}${virtual}<g data-kind="travel-cursor" pointer-events="none"><line x1="${left}" x2="${right}" stroke="#fff3d3" stroke-width="1.5" stroke-dasharray="6 4"/><text x="${right - 3}" y="-6" text-anchor="end" fill="#fff3d3" paint-order="stroke" stroke="#10262e" stroke-width="4"></text></g></svg>`;
    cursors = [{element: plot.querySelector('[data-kind="travel-cursor"]'), scale: y, minimum, maximum, axis: 'y'}];
    const missing = summaries.filter(summary => !summary.arrivals.length).map(summary => investigation.stations.find(station => station.id === summary.stationId)?.code).filter(Boolean);
    find('evidence-view-caption').textContent = `IASP91 at ${fixed(diagram.depthKm)} km. Exact roots sampled every ${diagram.policy.distanceStepDeg}°. Gaps are preserved. Root indices are local to each geometry, so dots are not joined into invented branches. Station angles follow the modeled geographic source; archived pick times stay fixed. ${snapshot?.request.kind === 'radial' ? 'White dashed rings are the virtual receiver, separate from every real recording. ' : ''}${missing.length ? `${missing.join(', ')} has no supported P, S or PKIKP root at its exact geometry. ` : ''}A 1D Earth model and an analyst pick need not agree.`;
  }

  function render(state) {
    if (disposed) return;
    latest = state;
    const settings = JSON.stringify([state.investigation.identity, state.experiment.evidenceView, state.experiment.stationId, state.experiment.phase, state.experiment.branch, state.experiment.context.kind, width, state.diagramPending, state.diagramError?.message ?? state.diagramError]);
    if (lastRender?.settings !== settings || lastRender.snapshot !== state.snapshot || lastRender.diagram !== state.diagram) {
      lastRender = {settings, snapshot: state.snapshot, diagram: state.diagram};
      if (state.experiment.evidenceView === 'travel') travelDiagram(state);
      else recordSection(state);
    }
    renderTime(state.experiment.timeS);
  }

  function renderTime(timeS) {
    if (disposed) return;
    for (const row of plot.querySelectorAll('[data-kind="record-row"]')) {
      const summary = latest?.snapshot?.stationArrivals.find(item => item.stationId === row.dataset.stationId);
      const cue = stationPhaseState(summary?.arrivals, timeS, latest?.snapshot?.originOffsetS ?? 0);
      row.dataset.reachedPhases = cue.reached.join(','); row.dataset.pulse = String(cue.pulse);
      const marker = row.querySelector('[data-kind="station-arrival-cue"]');
      if (marker) {marker.setAttribute('r', String(3 + cue.pulse * 4)); marker.setAttribute('fill', cue.phase ? PHASES[cue.phase].color : cue.reached.length ? PHASES[cue.reached.at(-1)].color : '#7b9196');}
      for (const prediction of row.querySelectorAll('[data-kind="record-prediction"]')) {prediction.dataset.reached = String(timeS >= Number(prediction.dataset.timeS));}
    }
    for (const {element, scale, minimum, maximum, axis} of cursors) {
      element.dataset.timeS = String(timeS);
      element.style.display = timeS < minimum || timeS > maximum ? 'none' : '';
      element.setAttribute('transform', axis === 'x' ? `translate(${scale(timeS)},0)` : `translate(0,${scale(timeS)})`);
      const label = element.querySelector('text');
      if (label) label.textContent = clock(timeS);
    }
  }

  const observer = new ResizeObserver(entries => {
    const nextWidth = Math.max(200, Math.floor(entries[0].contentRect.width));
    if (width === nextWidth) return;
    width = nextWidth;
    if (!resizeFrame) resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      lastRender = null;
      if (latest) render(latest);
    });
  });
  observer.observe(plot);

  return {render, renderTime, dispose() { disposed = true; observer.disconnect(); if (resizeFrame) cancelAnimationFrame(resizeFrame); host.removeEventListener('click', click); host.removeEventListener('keydown', keydown); host.replaceChildren(); }};
}
