import {FRONT_COLORS} from './wavefronts.js';
const COLORS = { P: '#8cf3cf', S: '#f4b76c', PKIKP: '#c4adff' };
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fixed = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const signed = value => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}` : '—';
const clock = value => `${value < 0 ? '−' : ''}${String(Math.floor(Math.abs(value) / 60)).padStart(2, '0')}:${String(Math.floor(Math.abs(value) % 60)).padStart(2, '0')}`;

export function createPanels(root, callbacks) {
  root.innerHTML = `
    <header class="masthead">
      <a class="wordmark" href="./"><svg viewBox="0 0 36 30" aria-hidden="true"><path d="M1 16h7l5-12 6 23 5-16 4 5h7"/></svg><span>EARTHQUAKE <b>LAB</b></span></a>
      <label class="event-picker"><span>INVESTIGATE AN EARTHQUAKE</span><select id="event" aria-label="Earthquake investigation"></select></label>
      <button id="share" type="button">Share experiment <span aria-hidden="true">↗</span></button>
    </header>
    <nav class="stages" aria-label="Investigation stages"><button data-mode="replay" type="button"><span>01</span> Replay the event</button><button data-mode="locate" type="button"><span>02</span> Find its source</button><button data-mode="explore" type="button"><span>03</span> Look inside Earth</button></nav>
    <main class="lab-layout">
      <section class="mission" aria-labelledby="mission-title"><div><p class="eyebrow" id="stage-eyebrow"></p><h1 id="mission-title"></h1><p class="intro" id="stage-intro"></p></div><div class="event-facts"><div class="magnitude"><span>MAGNITUDE</span><strong id="event-magnitude"></strong></div><div class="event-fact-detail"><strong id="event-title"></strong><span id="event-date"></span><span id="event-depth"></span></div></div></section>
      <section class="workspace" aria-label="Earth and linked recording">
        <div class="scene-heading"><div><p class="eyebrow" id="scene-label">GLOBAL REPLAY</p><h2 id="scene-title"></h2></div><div id="interior-options" class="segmented" aria-label="Interior visualization" hidden><button type="button" data-interior="section">Ray section</button><button type="button" data-interior="globe">3D globe</button></div><button id="core-example" type="button">Trace the inner core ↗</button><div class="scene-buttons"><button id="wavefronts" type="button" aria-pressed="true">Wavefronts on</button><button id="cutaway" type="button" aria-pressed="false">Open Earth</button><button id="reset-camera" type="button" aria-label="Reset camera">↺ <span>Reset view</span></button></div></div>
        <div class="route-controls"><label class="station-select"><span>Recording station</span><select id="station" aria-label="Recording station"></select></label><label><span>Seismic phase</span><select id="phase" aria-label="Seismic phase"><option value="P">P · compressional</option><option value="S">S · shear</option><option value="PKIKP">PKIKP · inner core</option></select></label><label id="branch-control"><span>Arrival branch</span><select id="branch" aria-label="Arrival branch"></select></label></div>
        <div class="playback"><button id="play" type="button" class="primary" aria-label="Play earthquake replay"><span aria-hidden="true">▶</span> <span id="play-label">Play earthquake</span></button><div class="replay-clock"><output id="clock" aria-label="Replay clock">00:00</output><span>AFTER ORIGIN</span></div><input id="time" aria-label="Replay time in seconds after catalog origin" type="range" min="-60" max="2700" value="0" step="0.1"><select id="speed" aria-label="Playback speed"><option value="1">1×</option><option value="10">10×</option><option value="30">30×</option><option value="60" selected>60×</option><option value="120">120×</option></select></div>
        <div class="visual-stage"><div id="globe-view"><div class="globe-frame"><canvas id="earth-globe" role="img" aria-label="Interactive Earth. Drag to rotate. Select a station. Numeric source controls below provide a keyboard alternative."></canvas><div class="globe-key"><span><i class="source-dot"></i>Source</span><span><i class="station-dot"></i>Station</span><span><i class="ray-dot"></i>Calculated ray</span></div><span class="globe-hint" id="globe-hint">Drag to rotate · Select a station</span><div class="globe-engine" id="engine-status" role="status">Opening the local calculation engine…</div></div><div class="earth-reading"><div class="earth-layers" id="earth-layers"><span><i class="mantle-swatch"></i><strong>Crust and mantle</strong><small>0–2,889 km</small></span><span><i class="outer-swatch"></i><strong>Liquid outer core</strong><small>2,889–5,154 km</small></span><span><i class="inner-swatch"></i><strong>Solid inner core</strong><small>5,154–6,371 km</small></span></div><div class="front-reading"><div class="front-key"><span style="--front-color:#7be5bc">P · compression</span><span style="--front-color:#ffc174">S · shear</span><span style="--front-color:#d2b1ff">PKIKP · inner core</span></div><p id="wavefront-status" role="status"></p><p class="earth-path-key"><strong>One earthquake. One clock.</strong> The sheets join equal-time positions on supported downward rays. Bright contours reveal the cut face. Stations pulse at their exact model arrivals; the recordings and archived picks keep their own timing.</p><p class="front-limit">X-ray view · sampled P, S and PKIKP fronts, not shaking amplitude or a complete wavefield. Gaps and expired rays stay absent.</p></div><p class="earth-credit">Surface <a href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/" target="_blank" rel="noreferrer">NASA Earth Observatory</a> · July 2004 composite, not event-time weather.</p></div></div><div id="section-view" class="section-frame" hidden></div></div>
        <div id="station-arrivals" class="station-arrivals" aria-label="Exact arrivals at recording stations"></div><div class="path-summary"><div class="phase-mark" id="phase-mark">P</div><p id="path-summary">Calculating the station path.</p></div>
        <section class="recording" aria-labelledby="recording-title"><div class="recording-head"><div><p class="eyebrow">THE SELECTED RECORDING</p><h3 id="recording-title">Loading station</h3><p id="recording-place"></p></div><span class="recording-badge">REAL INSTRUMENTAL COUNTS</span></div><p class="scenario-note" id="scenario-note"></p><div class="wave-key"><span><i class="observed-key"></i>Filtered counts</span><span><i class="manual-key"></i>Archived manual P</span><span><i class="model-key"></i>Modeled arrival</span><button id="wave-window" type="button">Zoom to arrival</button></div><div class="wave-frame"><svg id="waveform" role="img" aria-label="Real instrumental recording, archived manual pick, modeled arrivals and synchronized playhead" viewBox="0 0 1000 190" preserveAspectRatio="none"></svg></div><p class="wave-caption" id="wave-caption"></p></section>
      </section>
      <section id="challenge-unavailable" class="challenge-unavailable" hidden><div><p class="eyebrow">FOLLOW THE AVAILABLE EVIDENCE</p><h2>Replay this event. Explore its paths.</h2><p>No validated source-location exercise is provided for this earthquake. The Tohoku investigation has eight independently archived observations and a checked location workflow.</p></div><button id="tohoku-challenge" type="button">Open Tohoku source challenge ↗</button></section>
      <section class="status-area" aria-live="polite"><p id="notice" class="notice" hidden></p><div id="error" class="error" role="alert" hidden><span id="error-text"></span><button id="retry" type="button">Retry calculation</button></div><div id="progress-wrap" class="progress-wrap" hidden><progress id="progress"></progress><span id="progress-label"></span></div><div id="share-result" class="share-result" hidden><label>Reproducible experiment URL<input id="share-url" readonly></label><p id="share-status"></p></div></section>
      <section class="investigation-controls" id="locate-controls" hidden><div class="section-heading"><div><p class="eyebrow">PLACE A SOURCE. TEST ITS ARRIVALS.</p><h2>Let the stations disagree.</h2></div><span class="fixed-depth" id="fixed-depth"></span></div><div class="candidate-grid"><form id="candidate-form"><div class="coordinate-row"><label>Candidate latitude <span>° N</span><input id="latitude" name="latitude" type="number" min="20" max="55" step="any" required value="35"></label><label>Candidate longitude <span>° E</span><input id="longitude" name="longitude" type="number" min="120" max="165" step="any" required value="148"></label></div><button id="calculate" type="submit">Calculate candidate</button><p id="region-note" class="fine"></p></form><div class="fit-summary"><span class="eyebrow">CURRENT CANDIDATE MISMATCH</span><div class="score"><strong id="rms">—</strong><span>seconds RMS</span></div><p id="origin-offset">A common origin offset is fitted to the selected picks.</p><p id="ambiguity" class="fine"></p><div class="action-row"><button id="fit" class="primary" type="button">Fit source</button><button id="cancel" type="button" hidden>Cancel</button><button id="reveal" type="button">Reveal catalog</button></div></div><div class="residual-grid" id="residual-grid" aria-label="Signed station residuals"></div></div><p id="catalog-comparison" class="catalog-comparison" hidden></p><div id="fit-evidence" class="fit-evidence" hidden></div><p class="scientific-note">Lower RMS means closer agreement with these picks under IASP91. It does not mean a more accurate historical location. The score field is relative model mismatch, not a confidence interval.</p></section>
      <section class="explore-controls" id="explore-controls" hidden><div class="section-heading"><div><p class="eyebrow">THE PLANET LEAVES A SIGNATURE</p><h2>Different paths. Different arrivals.</h2></div></div><p id="absent-phases" class="fine"></p><div id="arrival-list" class="arrival-list" aria-label="Every calculated arrival"></div><details id="advanced"><summary>Advanced geometry experiment</summary><p>A virtual receiver follows the real station bearing. The selected recording never moves. Supported depth 0–700 km and distance 1–179°.</p><form id="radial-form"><label>Source depth <span>km</span><input id="depth" type="number" min="0" max="700" step="any" required></label><label>Receiver distance <span>degrees</span><input id="distance" type="number" min="1" max="179" step="any" required></label><button type="submit" id="calculate-radial">Calculate geometry</button><button type="button" id="reset-geometry">Use station geometry</button></form></details><div class="explanation-grid"><article><span>P</span><h3>The mantle bends a ray.</h3><p>Velocity changes with depth. A compressional wave follows a curved path, sometimes producing several arrivals at one station.</p></article><article><span>S</span><h3>A liquid blocks direct shear.</h3><p>The supported direct S phase stays in the mantle. An absent S result is about this phase, not a silent recording.</p></article><article><span>PKIKP</span><h3>A route through the inner core.</h3><p>This compressional path crosses the mantle, liquid outer core and solid inner core. Follow its calculated travel time.</p></article></div></section>
      <section class="linked-evidence" aria-labelledby="linked-evidence-title"><div class="section-heading"><div><p class="eyebrow">ONE EVENT. MANY WITNESSES.</p><h2 id="linked-evidence-title">Read across the evidence.</h2></div><div class="segmented" aria-label="Evidence visualization"><button data-evidence="records" type="button">Station recordings</button><button data-evidence="travel" type="button">Travel-time diagram</button></div></div><p class="evidence-intro" id="evidence-intro"></p><div id="evidence-views"></div></section>
      <section class="archive" aria-labelledby="archive-title"><div class="section-heading"><div><p class="eyebrow">THREE EARTHQUAKES. DIFFERENT EARTH.</p><h2 id="archive-title">Change the event. Keep investigating.</h2></div><span class="archive-count" id="archive-count"></span></div><div id="event-cards" class="event-cards"></div></section>
      <section class="evidence-section"><details id="evidence-details"><summary>Inspect observations and method <span id="observation-count"></span></summary><p id="observation-method"></p><div class="table-scroll"><table><thead><tr><th>Use in fit</th><th>Station</th><th>Archived P</th><th>Modeled P</th><th>Residual</th></tr></thead><tbody id="observation-rows"></tbody></table></div><p class="fine" id="residual-method"></p></details><details><summary>Recording processing and scientific limits</summary><p>Vertical BHZ recordings use a 0.02–0.2 Hz zero-phase display filter and are independently scaled. Units are instrumental counts. Instrument response is retained. These are not ground-motion measurements and amplitudes cannot be compared across stations. Zero-phase filtering can spread energy before an onset.</p><ol id="processing-list"></ol><p id="scientific-limits"></p></details><details><summary>Sources, reproducibility and local computation</summary><p id="credit"></p><div id="data-links" class="data-links"></div><p>Calculation runs locally in a module Worker using Rust and WebAssembly. It continues offline after loading. Shared links contain experiment settings and immutable data/model identity, never waveform samples or calculated answers.</p><dl class="identity-list" id="identities"></dl><p id="technical-status" class="fine"></p></details></section>
      <section class="exports"><div><p class="eyebrow">KEEP THE EVIDENCE</p><p>Export the current source, station, observations and every calculated path.</p></div><div class="action-row"><button id="export-json" type="button" disabled>Download JSON ↗</button><button id="export-csv" type="button" disabled>Download CSV ↗</button></div></section>
    </main><footer><span>EARTHQUAKE LAB <i></i> OPEN SOURCE</span><p>Read the Earth through the evidence. Question the model.</p><span id="footer-event"></span></footer>
`;

  const $ = id => root.querySelector(`#${id}`);
  root.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => callbacks.mode(button.dataset.mode)));
  for (const [id, callback] of Object.entries({ play: 'play', wavefronts: 'wavefronts', cutaway: 'cutaway', 'reset-camera': 'resetCamera', fit: 'fit', cancel: 'cancel', reveal: 'reveal', retry: 'retry', share: 'share', 'wave-window': 'waveWindow', 'core-example': 'coreExample', 'reset-geometry': 'resetGeometry' })) $(id).addEventListener('click', () => callbacks[callback]());
  $('time').addEventListener('input', event => callbacks.time(Number(event.target.value)));
  $('speed').addEventListener('change', event => callbacks.speed(Number(event.target.value)));
  $('event').addEventListener('change', event => callbacks.event(event.target.value));
  $('event-cards').addEventListener('click', event => { const button = event.target.closest('[data-event]'); if (button) callbacks.event(button.dataset.event); });
  $('tohoku-challenge').addEventListener('click', () => callbacks.tohokuChallenge());
  root.querySelectorAll('[data-evidence]').forEach(button => button.addEventListener('click', () => callbacks.evidence(button.dataset.evidence)));
  root.querySelectorAll('[data-interior]').forEach(button => button.addEventListener('click', () => callbacks.interior(button.dataset.interior)));
  $('station').addEventListener('change', event => callbacks.station(event.target.value));
  $('phase').addEventListener('change', event => callbacks.phase(event.target.value));
  $('branch').addEventListener('change', event => callbacks.branch(Number(event.target.value)));
  $('candidate-form').addEventListener('submit', event => { event.preventDefault(); callbacks.candidate({ latitudeDeg: Number($('latitude').value), longitudeDeg: Number($('longitude').value) }); });
  for (const id of ['depth', 'distance']) $(id).addEventListener('input', () => {
    callbacks.radialDraft();
    $('export-json').disabled = true; $('export-csv').disabled = true;
    $('notice').hidden = false; $('notice').textContent = 'Geometry edits are not calculated. Calculate geometry before exporting.';
    $('scenario-note').textContent = 'Uncalculated geometry edits. The displayed result still belongs to the previous calculation.';
  });
  $('radial-form').addEventListener('submit', event => { event.preventDefault(); callbacks.radial(Number($('depth').value), Number($('distance').value)); });
  for (const format of ['json', 'csv']) $(`export-${format}`).addEventListener('click', () => callbacks.export(format));
  $('observation-rows').addEventListener('change', event => { if (event.target.dataset.observation) callbacks.observation(event.target.dataset.observation, event.target.checked); });
  $('residual-grid').addEventListener('click', event => { const button = event.target.closest('[data-station]'); if (button) callbacks.station(button.dataset.station); });
  $('arrival-list').addEventListener('click', event => { const button = event.target.closest('[data-phase]'); if (button) callbacks.arrival(button.dataset.phase, Number(button.dataset.branch)); });
  $('station-arrivals').addEventListener('click', event => {const button = event.target.closest('[data-station-arrival]'); if (button) callbacks.stationArrival({stationId: button.dataset.stationId, phase: button.dataset.phase, branch: Number(button.dataset.branch), timeS: Number(button.dataset.timeS)});});
  $('share-url').addEventListener('click', event => event.target.select());

  let latest;
  let initialized = false;
  let waveformKey = '';
  let waveBounds = [-60, 2700];
  let waveWidth = 1000;
  let cursor;
  let stationArrivalIdentity;
  let resizeObserver = new ResizeObserver(() => { waveformKey = ''; if (latest) { renderWave(latest); renderTime(latest.experiment.timeS); } });
  resizeObserver.observe($('waveform'));

  function render(view) {
    latest = view;
    const { investigation, experiment, snapshot, pending, fit } = view;
    const mode = experiment.context.kind;
    const station = investigation.stations.find(item => item.id === experiment.stationId);
    if (!initialized) {
      const archive = view.investigations ?? [investigation];
      $('event').innerHTML = archive.map(item => `<option value="${esc(item.key)}">${esc(item.shortTitle)} · M ${item.event.magnitude} · ${item.source.depthKm} km deep</option>`).join('');
      $('event-cards').innerHTML = archive.map(item => `<button type="button" data-event="${esc(item.key)}" aria-label="Investigate ${esc(item.shortTitle)}"><span class="event-card-top"><span class="eyebrow">${esc(dateLabel(item.originTimeUtc))}</span><span class="event-card-magnitude">M ${item.event.magnitude}</span></span><strong>${esc(item.title)}</strong><span class="event-card-summary">${esc(item.summary)}</span><span class="event-card-facts">${item.source.depthKm} km deep <i></i> ${item.stations.length} recordings <span aria-hidden="true">↗</span></span></button>`).join('');
      $('archive-count').textContent = `${archive.reduce((total, item) => total + item.stations.length, 0)} real recordings`;
      $('station').innerHTML = investigation.stations.map(item => `<option value="${esc(item.id)}">${esc(item.code)} · ${esc(item.name)}</option>`).join('');
      $('credit').textContent = investigation.provenance.credit;
      $('identities').innerHTML = `<dt>Investigation SHA-256</dt><dd>${esc(investigation.provenance.caseSha256)}</dd>${investigation.provenance.legacySha256 ? `<dt>Legacy recording SHA-256</dt><dd>${esc(investigation.provenance.legacySha256)}</dd>` : ''}<dt>Model SHA-256</dt><dd>${esc(investigation.provenance.model.model_sha256)}</dd>`;
      initialized = true;
    }
    const story = storyFor(investigation, mode);
    for (const [id, value] of Object.entries({ 'stage-eyebrow': story.eyebrow, 'mission-title': story.title, 'stage-intro': story.intro, 'scene-title': story.scene })) $(id).textContent = value;
    $('event').value = investigation.key;
    $('event-magnitude').textContent = `M ${investigation.event.magnitude}`;
    $('event-title').textContent = investigation.title;
    $('event-date').textContent = `${dateLabel(investigation.originTimeUtc)} · ${investigation.originTimeUtc.slice(11, 19)} UTC`;
    $('event-depth').textContent = `${investigation.source.depthKm} km source depth · ${investigation.stations.length} recordings`;
    $('footer-event').textContent = `IASP91 · ${investigation.shortTitle.toUpperCase()}`;
    root.dataset.mode = mode;
    $('challenge-unavailable').hidden = Boolean(investigation.challenge);
    root.querySelectorAll('[data-event]').forEach(button => { button.classList.toggle('selected', button.dataset.event === investigation.key); button.setAttribute('aria-pressed', String(button.dataset.event === investigation.key)); });
    const sectionVisible = mode === 'explore' && experiment.interiorView === 'section';
    $('interior-options').hidden = mode !== 'explore';
    $('core-example').hidden = mode !== 'explore';
    $('cutaway').hidden = sectionVisible;
    $('wavefronts').hidden = sectionVisible;
    $('wavefronts').textContent = experiment.wavefronts ? 'Wavefronts on' : 'Wavefronts off';
    $('wavefronts').setAttribute('aria-pressed', String(experiment.wavefronts));
    $('wavefront-status').textContent = view.fanError ? `Wavefront preparation failed. ${view.fanError} Toggle wavefronts to retry.` : view.fanPending ? progressText(view.fanProgress) : view.fan ? `${view.fan.rayCount} sampled rays · ${view.fan.segments.length} separate legal segments · local IASP91` : experiment.wavefronts ? 'Preparing supported spreading fronts…' : 'Wavefronts hidden. Recordings and exact station predictions remain linked.';
    if (stationArrivalIdentity !== snapshot) {
      stationArrivalIdentity = snapshot;
      $('station-arrivals').innerHTML = `<div class="station-arrivals-heading"><span class="eyebrow">FOLLOW THE ARRIVALS</span><span>Choose a model arrival to inspect that recording.</span></div><div class="station-arrival-grid">${investigation.stations.map(item => {const summary = snapshot?.stationArrivals.find(value => value.stationId === item.id); const phases = ['P','S','PKIKP'].map(phase => summary?.arrivals.find(arrival => arrival.phase === phase)).filter(Boolean); return `<article data-station-cue="${esc(item.id)}"><strong>${esc(item.code)}</strong><div>${phases.length ? phases.map(arrival => `<button type="button" data-station-arrival data-station-id="${esc(item.id)}" data-phase="${arrival.phase}" data-branch="${arrival.branch}" data-travel-time-s="${arrival.timeS}" data-time-s="${arrival.timeS + (snapshot.originOffsetS ?? 0)}" style="--front-color:${FRONT_COLORS[arrival.phase]}" aria-label="Jump to ${esc(item.code)} model ${arrival.phase} arrival at ${fixed(arrival.timeS + (snapshot.originOffsetS ?? 0))} seconds"><span>${arrival.phase}</span><time>${clock(arrival.timeS + (snapshot.originOffsetS ?? 0))}</time></button>`).join('') : `<small>${snapshot ? 'No supported phase' : 'Calculating…'}</small>`}</div></article>`;}).join('')}</div>`;
    }
    $('reset-camera').hidden = sectionVisible;
    root.querySelectorAll('[data-interior]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.interior === experiment.interiorView)));
    root.querySelectorAll('[data-evidence]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.evidence === experiment.evidenceView)));
    $('evidence-intro').textContent = experiment.evidenceView === 'records' ? 'Compare real station recordings on one clock. Each trace is scaled independently. Select a row to follow its path.' : 'Explore every sampled P, S and PKIKP arrival in the current Earth model. Select a calculated point to investigate its path.';
    $('time').min = investigation.replayBounds.startS;
    $('time').max = investigation.replayBounds.endS;
    root.querySelectorAll('[data-mode]').forEach(button => { button.classList.toggle('active', button.dataset.mode === mode); button.setAttribute('aria-current', button.dataset.mode === mode ? 'step' : 'false'); });
    $('locate-controls').hidden = mode !== 'locate' || !investigation.challenge; $('explore-controls').hidden = mode !== 'explore';
    $('scene-label').textContent = sectionVisible ? 'EXACT RAY SECTION / LAYERS TO SCALE' : experiment.cutaway ? '3D EARTH CUTAWAY / LAYERS TO SCALE' : mode === 'locate' ? 'REGIONAL SOURCE INVESTIGATION' : 'GLOBAL REPLAY';
    $('globe-hint').textContent = mode === 'locate' ? 'Drag to rotate · Tap Japan region to place a source' : experiment.cutaway ? 'Drag to orbit the cutaway · Scroll or pinch to zoom' : 'Drag to rotate · Select a station';
    $('earth-layers').hidden = !experiment.cutaway;
    $('cutaway').setAttribute('aria-pressed', String(experiment.cutaway)); $('cutaway').textContent = experiment.cutaway ? 'Close Earth' : 'Open Earth';
    $('play-label').textContent = view.playing ? 'Pause' : 'Play earthquake'; $('play').setAttribute('aria-label', view.playing ? 'Pause earthquake replay' : 'Play earthquake replay');
    $('play').firstElementChild.textContent = view.playing ? 'Ⅱ' : '▶';
    $('station').value = experiment.stationId; $('phase').value = experiment.phase; $('speed').value = String(experiment.speed);
    $('recording-title').textContent = station.id; $('recording-place').textContent = station.name;
    $('scenario-note').textContent = snapshot?.hypothetical ? 'Hypothetical source/receiver geometry. The actual recording and archived pick stay fixed.' : mode === 'locate' ? 'Candidate predictions over a fixed historical recording. Archived manual pick and model marker are separate evidence.' : station.observedPick ? 'Actual historical recording. The archived manual P pick is independently sourced.' : 'Actual historical recording. No archived manual pick is included for this view-only station.';
    $('scenario-note').classList.toggle('hypothetical', Boolean(snapshot?.hypothetical || mode === 'locate'));
    $('engine-status').textContent = pending ? progressText(view.progress) : view.error ? 'Calculation needs attention' : snapshot ? `${snapshot.distanceDeg.toFixed(2)}° source to receiver · IASP91` : 'Opening the local calculation engine…';
    root.querySelector('.workspace').classList.toggle('calculating', Boolean(pending));
    const arrivals = snapshot?.arrivals ?? [];
    const selected = arrivals.filter(arrival => arrival.phase === experiment.phase);
    $('branch').innerHTML = selected.length ? selected.map((arrival, index) => `<option value="${index}">Branch ${index + 1} · ${fixed(arrival.time_s, 2)} s</option>`).join('') : '<option value="0">No supported arrival</option>';
    $('branch').value = String(experiment.branch); $('branch').disabled = pending || !selected.length;
    $('absent-phases').textContent = snapshot ? `${['P', 'S', 'PKIKP'].filter(phase => !arrivals.some(arrival => arrival.phase === phase)).join(', ') || 'No phase'} absent in the supported phase set at this geometry.` : 'Calculation pending.';
    const counts = {};
    $('arrival-list').innerHTML = arrivals.length ? arrivals.map(arrival => { const branch = counts[arrival.phase] ?? 0; counts[arrival.phase] = branch + 1; return `<button type="button" data-phase="${arrival.phase}" data-branch="${branch}" class="${arrival.phase === experiment.phase && branch === experiment.branch ? 'selected' : ''}" ${pending ? 'disabled' : ''}><span style="color:${COLORS[arrival.phase]}">${arrival.phase}${branch ? ` · ${branch + 1}` : ''}</span><strong>${fixed(arrival.time_s)} s</strong><small>${fixed(arrival.turning_depth_km, 0)} km turning depth</small></button>`; }).join('') : '<p class="empty-result">No supported P, S or PKIKP arrival at this geometry. The real trace remains visible.</p>';
    const arrival = selected[experiment.branch];
    $('phase-mark').textContent = experiment.phase; $('phase-mark').style.color = COLORS[experiment.phase];
    $('path-summary').textContent = pending ? 'Updating the linked calculation. Previous answers are not current.' : arrival ? `${experiment.phase}${selected.length > 1 ? ` branch ${experiment.branch + 1} of ${selected.length}` : ''} reaches ${snapshot.hypothetical ? 'the virtual receiver' : station.code} after ${fixed(arrival.time_s)} s of ray travel, turning ${fixed(arrival.turning_depth_km, 0)} km below the surface. ${experiment.phase === 'PKIKP' ? 'Its path crosses the liquid outer core and solid inner core.' : experiment.phase === 'S' ? 'This direct shear path stays in the mantle.' : 'This compressional path bends through the mantle.'}` : `No supported ${experiment.phase} arrival for this geometry. Try another phase or geometry.`;
    $('wave-window').textContent = experiment.waveWindow === 'full' ? 'Zoom to arrival' : 'Show full recording'; $('wave-window').setAttribute('aria-pressed', String(experiment.waveWindow === 'arrival'));
    $('processing-list').innerHTML = station.trace.processing.map(item => `<li>${esc(item)}</li>`).join('');
    $('data-links').innerHTML = `<a href="${esc(investigation.provenance.pick_source_url)}" target="_blank" rel="noreferrer">USGS archived phase picks ↗</a><a href="${esc(station.trace.source.waveform_url)}" target="_blank" rel="noreferrer">${esc(station.code)} raw recording ↗</a><a href="${esc(station.trace.source.station_url)}" target="_blank" rel="noreferrer">Station response metadata ↗</a><a href="https://doi.org/10.7914/SN/IU" target="_blank" rel="noreferrer">GSN IU network DOI ↗</a><a href="https://github.com/obspy/obspy/tree/1.5.1/obspy/taup" target="_blank" rel="noreferrer">Numerical source lineage ↗</a>`;
    const picked = investigation.stations.filter(item => item.observedPick);
    $('observation-count').textContent = `${picked.length} manual picks · ${investigation.stations.length} recordings`;
    $('observation-method').textContent = `These ${picked.length} manual P picks came from archived USGS phase data. Displayed IU BHZ recordings were matched by station code and event-time metadata. The archive may report network IR without channel or location; this does not identify a specific displayed BHZ sensor. Missing numeric pick uncertainty remains unknown.${investigation.challenge ? ' Choose observations in the source challenge.' : ' This event has no validated source-location exercise.'}`;
    $('residual-method').textContent = mode === 'locate' ? 'Residual = observed offset − predicted travel time − fitted common origin offset. Missing supported P makes a candidate inadmissible. At least four observations are needed for automated fit.' : 'The archived pick and the modeled P arrival are independent. A missing supported P remains visible. No source-location fit is calculated in replay.';
    $('scientific-limits').textContent = `IASP91 is a spherical, one-dimensional Earth model with surface receivers. Supported phases are P, S and PKIKP. Animated lights illustrate calculated ray travel time, not wave amplitude or a full wavefield. ${investigation.challenge ? `The regional location exercise fixes depth at ${investigation.challenge.fixedDepthKm} km and freely fits origin time.` : 'This event supports replay and path exploration. Its historical catalog source is a reference, not a fitted answer.'}`;
    const active = mode === 'locate' ? experiment.context.activeStationIds : investigation.challenge?.defaultStationIds ?? [];
    const residuals = snapshot?.residuals;
    const predictions = new Map((residuals?.stations ?? []).map(item => [item.stationId, item]));
    $('observation-rows').innerHTML = investigation.stations.map(item => { const prediction = predictions.get(item.id); return `<tr class="${item.id === station.id ? 'selected-row' : ''}"><td>${item.observedPick ? `<input type="checkbox" data-observation="${esc(item.id)}" aria-label="Use ${esc(item.code)} observation" ${active.includes(item.id) ? 'checked' : ''} ${mode !== 'locate' ? 'disabled' : ''}>` : 'View only'}</td><th scope="row">${esc(item.code)}</th><td>${item.observedPick ? `${fixed(item.observedPick.offsetS)} s` : 'No pick'}</td><td>${prediction ? `${fixed(prediction.predictedTimeS)} s` : '—'}</td><td>${prediction ? `${signed(prediction.residualS)} s` : '—'}</td></tr>`; }).join('');
    if (mode === 'locate' && investigation.challenge) {
      const { region, fixedDepthKm } = investigation.challenge;
      $('fixed-depth').textContent = `Depth fixed at ${fixedDepthKm} km`;
      $('latitude').min = region.south; $('latitude').max = region.north;
      $('longitude').min = region.west; $('longitude').max = region.east;
      $('region-note').textContent = `Search region ${region.south}–${region.north}° N, ${region.west}–${region.east}° E. Tap the globe to place a candidate. Two stations can leave many plausible locations.`;
      if (document.activeElement !== $('latitude')) $('latitude').value = experiment.context.candidate.latitudeDeg;
      if (document.activeElement !== $('longitude')) $('longitude').value = experiment.context.candidate.longitudeDeg;
      $('rms').textContent = pending ? '…' : residuals?.kind === 'supported' ? fixed(residuals.rmsS) : '—';
      $('origin-offset').textContent = residuals?.kind === 'supported' && !pending ? `Fitted origin ${signed(residuals.originOffsetS)} s relative to catalog origin. ${active.length} equally weighted picks.` : residuals?.kind === 'incomplete' ? `No supported P for ${residuals.unsupportedStationIds.map(id => id.split('.')[1]).join(', ')}. Candidate is inadmissible.` : 'A common origin offset is fitted to the selected picks.';
      $('ambiguity').textContent = active.length < 4 ? `${active.length} observations. Inspect residuals, but the source remains ambiguous. Select at least four to fit.` : 'The bounded regional fit tests multiple sampled basins. A low score is model agreement, not certainty.';
      $('fit').disabled = pending || active.length < 4; $('calculate').disabled = pending; $('reveal').disabled = pending;
      $('residual-grid').innerHTML = investigation.stations.filter(item => item.observedPick).map(item => { const prediction = predictions.get(item.id); return `<button type="button" data-station="${esc(item.id)}" aria-label="View ${esc(item.code)} residual" class="${active.includes(item.id) ? '' : 'excluded'} ${item.id === station.id ? 'selected' : ''}"><span>${item.code}</span><strong>${pending || !active.includes(item.id) ? '—' : `${signed(prediction?.residualS)} s`}</strong></button>`; }).join('');
      $('catalog-comparison').hidden = !experiment.context.revealed;
      if (experiment.context.revealed) $('catalog-comparison').textContent = `Catalog source ${investigation.source.latitudeDeg}° N, ${investigation.source.longitudeDeg}° E. Your current candidate is ${fixed(catalogDistance(experiment.context.candidate, investigation.source), 1)} km away. Revealing keeps your candidate in place. Differences include one-dimensional model error, fixed depth and observation mismatch.`;
      $('fit-evidence').hidden = !fit;
      if (fit) $('fit-evidence').innerHTML = `<div><p class="eyebrow">RUNTIME FIT / EXACT RAY CHECK</p><strong>${fixed(fit.best.latitudeDeg, 5)}° N, ${fixed(fit.best.longitudeDeg, 5)}° E</strong><p>${fixed(fit.rmsS, 3)} s RMS · origin ${signed(fit.originOffsetS)} s · ${fit.iterations} search evaluations</p><p class="fine">Final per-station interpolation difference ≤ ${fixed(fit.directCheck.maxStationTimeErrorS, 4)} s. ${Number.isFinite(fit.directCheck.nextDistinctBasinRmsS) ? `Next distinct sampled basin ${fixed(fit.directCheck.nextDistinctBasinRmsS, 3)} s RMS.` : 'No additional distinct basin was retained in this finite search.'} Finite search checks are not a proof of global optimality.</p></div>${misfitMap(fit)}`;
    }
    if (mode === 'explore' && !view.geometryDirty) {
      if (document.activeElement !== $('depth')) $('depth').value = experiment.context.depthKm;
      if (document.activeElement !== $('distance')) $('distance').value = experiment.context.distanceDeg;
    }
    $('cancel').hidden = !pending; $('cancel').disabled = !pending;
    $('notice').hidden = !view.notice; $('notice').textContent = view.notice || '';
    $('error').hidden = !view.error; $('error-text').textContent = view.error || ''; $('retry').disabled = pending;
    $('progress-wrap').hidden = !pending; $('progress-label').textContent = progressText(view.progress);
    if (view.progress?.total) { $('progress').max = view.progress.total; $('progress').value = view.progress.done; } else $('progress').removeAttribute('value');
    $('technical-status').textContent = view.stats ? `Worker ready ${view.stats.ready}. Pending ${view.stats.pending}. Completed ${view.stats.completed}. Cancelled ${view.stats.cancelled}. Current exact evaluation ${fixed(snapshot?.elapsedMs, 1)} ms.` : 'Opening the worker.';
    for (const format of ['json', 'csv']) $(`export-${format}`).disabled = pending || !snapshot || view.geometryDirty;
    renderWave(view); renderTime(experiment.timeS);
  }

  function renderWave(view) {
    const { investigation, experiment, snapshot, pending } = view;
    const station = investigation.stations.find(item => item.id === experiment.stationId);
    const trace = station.trace;
    const arrivals = snapshot?.arrivals ?? [];
    const phaseArrivals = arrivals.filter(arrival => arrival.phase === experiment.phase);
    const selected = phaseArrivals[experiment.branch];
    const origin = snapshot?.originOffsetS ?? 0;
    const focus = selected ? selected.time_s + origin : station.observedPick?.offsetS ?? 600;
    const start = trace.start_offset_s;
    const end = start + (trace.samples.length - 1) / trace.sample_rate_hz;
    waveBounds = experiment.waveWindow === 'arrival' ? [Math.max(start, focus - 100), Math.min(end, focus + 160)] : [start, end];
    const key = JSON.stringify([investigation.identity, station.id, experiment.waveWindow, waveBounds, arrivals.map(arrival => [arrival.phase, arrival.time_s]), origin, experiment.phase, experiment.branch, pending, $('waveform').clientWidth]);
    if (key === waveformKey) return;
    waveformKey = key;
    const [min, max] = waveBounds;
    waveWidth = Math.max(280, $('waveform').clientWidth);
    $('waveform').setAttribute('viewBox', `0 0 ${waveWidth} 190`);
    const x = time => 14 + (time - min) / (max - min) * (waveWidth - 28);
    const samples = trace.samples.map((value, index) => [start + index / trace.sample_rate_hz, value]).filter(point => point[0] >= min && point[0] <= max);
    const peak = Math.max(1, ...samples.map(point => Math.abs(point[1])));
    const path = samples.map(([time, value], index) => `${index ? 'L' : 'M'}${x(time).toFixed(2)},${(83 - value / peak * 58).toFixed(2)}`).join(' ');
    const ticks = Array.from({ length: 6 }, (_, index) => min + (max - min) * index / 5);
    const branchCounts = {};
    const markers = pending ? '' : arrivals.map(arrival => {
      const branch = branchCounts[arrival.phase] ?? 0;
      branchCounts[arrival.phase] = branch + 1;
      const timeS = arrival.time_s + origin;
      if (timeS < min || timeS > max) return '';
      return `<line data-kind="prediction" data-phase="${arrival.phase}" data-branch="${branch}" data-time-s="${timeS}" x1="${x(timeS)}" x2="${x(timeS)}" y1="20" y2="147" stroke="${COLORS[arrival.phase]}" stroke-width="${arrival === selected ? 2.5 : 1.5}" stroke-opacity="${arrival === selected ? 1 : 0.6}" stroke-dasharray="5 4"><title>Model ${arrival.phase} · branch ${branch + 1} · ${timeS} s after catalog origin</title></line>`;
    }).join('');
    const selectedTimeS = selected ? selected.time_s + origin : null;
    const selectedInWindow = selected && selectedTimeS >= min && selectedTimeS <= max;
    const modelCaption = pending ? 'Updating model…' : !selected ? `No model ${experiment.phase} arrival` : !selectedInWindow ? `Model ${experiment.phase} outside window` : `Model ${experiment.phase} · branch ${experiment.branch + 1} of ${phaseArrivals.length}`;
    const modelLabel = `<text data-kind="prediction-label"${!pending && selected ? ` data-phase="${experiment.phase}" data-branch="${experiment.branch}" data-time-s="${selectedTimeS}"` : ''} x="14" y="16" fill="${pending || !selected ? '#9aadb9' : COLORS[experiment.phase]}" font-size="11">${modelCaption}</text>`;
    const pick = station.observedPick;
    const pickMarker = pick && pick.offsetS >= min && pick.offsetS <= max ? `<line data-kind="manual-pick" data-time-s="${pick.offsetS}" x1="${x(pick.offsetS)}" x2="${x(pick.offsetS)}" y1="29" y2="147" stroke="#f4bc76" stroke-width="2"/><text x="${Math.min(waveWidth - 65, x(pick.offsetS) + 5)}" y="160" fill="#f4bc76" font-size="10">Archived P</text>` : '';
    $('waveform').innerHTML = `<title>${esc(station.id)} recording and modeled arrivals</title><desc>Filtered instrumental counts normalized for display. Gold solid marker is the archived manual P pick. Dashed colored markers are predictions. The pale playhead follows the replay clock.</desc>${ticks.map(time => `<line x1="${x(time)}" x2="${x(time)}" y1="25" y2="147" stroke="#283642"/><text x="${x(time)}" y="181" font-size="10" fill="#9aadb9" text-anchor="${time === min ? 'start' : time === max ? 'end' : 'middle'}">${clock(time)}</text>`).join('')}<path d="M14 83H${waveWidth - 14}" stroke="#3a4a56"/><path d="${path}" fill="none" stroke="#bed0d5" stroke-width="1.05" vector-effect="non-scaling-stroke"/>${markers}${modelLabel}${pickMarker}<g id="wave-cursor"><line y1="22" y2="148" stroke="#f4e7c7" stroke-width="2"/><circle cy="25" r="3" fill="#f4e7c7"/></g>`;
    cursor = $('wave-cursor');
    $('wave-caption').textContent = `${station.id} · ${trace.samples.length.toLocaleString()} displayed samples at ${trace.sample_rate_hz} Hz · instrumental counts, independently scaled · time after catalog origin. ${pick ? `Archived manual P at ${fixed(pick.offsetS)} s.` : 'No archived pick is included.'}`;
  }

  function renderTime(timeS) {
    $('clock').textContent = clock(timeS); $('time').value = timeS;
    for (const button of $('station-arrivals').querySelectorAll('[data-station-arrival]')) {
      const elapsed = timeS - Number(button.dataset.timeS);
      button.dataset.reached = String(elapsed >= 0); button.dataset.pulse = String(elapsed >= 0 && elapsed < 24 ? 1 - elapsed / 24 : 0);
      button.classList.toggle('reached', elapsed >= 0);
      button.classList.toggle('arriving', elapsed >= 0 && elapsed < 24);
      button.setAttribute('aria-pressed', String(button.dataset.stationId === latest.experiment.stationId && button.dataset.phase === latest.experiment.phase));
    }
    if (cursor) { const x = 14 + (timeS - waveBounds[0]) / (waveBounds[1] - waveBounds[0]) * (waveWidth - 28); cursor.setAttribute('data-time-s', String(timeS)); cursor.setAttribute('transform', `translate(${x},0)`); cursor.style.display = x < 14 || x > waveWidth - 14 ? 'none' : ''; }
  }

  return {
    canvas: $('earth-globe'), globeHost: $('globe-view'), sectionHost: $('section-view'), evidenceHost: $('evidence-views'), render, renderTime,
    share(url, message) { $('share-result').hidden = false; $('share-url').value = url; $('share-status').textContent = message; $('share-url').focus(); $('share-url').select(); },
    dispose() { resizeObserver.disconnect(); },
  };
}

function progressText(progress) {
  return progress ? `${progress.stage}${progress.total ? ` · ${progress.done}/${progress.total}` : ''}` : 'Calculating exact ray paths…';
}

function catalogDistance(a, b) {
  const rad = Math.PI / 180;
  const latitude = (b.latitudeDeg - a.latitudeDeg) * rad;
  const longitude = (b.longitudeDeg - a.longitudeDeg) * rad;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(Math.sin(latitude / 2) ** 2 + Math.cos(a.latitudeDeg * rad) * Math.cos(b.latitudeDeg * rad) * Math.sin(longitude / 2) ** 2)));
}

function misfitMap(fit) {
  const grid = fit.grid;
  if (!grid?.rmsS?.length) return '';
  const values = grid.rmsS.filter(Number.isFinite);
  const low = Math.min(...values); const high = Math.max(low + 1, ...values);
  const width = 280; const height = 150;
  const cells = grid.rmsS.map((value, index) => { const row = Math.floor(index / grid.columns); const column = index % grid.columns; const strength = Number.isFinite(value) ? 15 + 80 * Math.sqrt((value - low) / (high - low)) : 98; return `<rect x="${column * width / grid.columns}" y="${height - (row + 1) * height / grid.rows}" width="${width / grid.columns + 0.2}" height="${height / grid.rows + 0.2}" fill="hsl(153 24% ${strength}%)"/>`; }).join('');
  const x = (fit.best.longitudeDeg - grid.bounds.west) / (grid.bounds.east - grid.bounds.west) * width;
  const y = height - (fit.best.latitudeDeg - grid.bounds.south) / (grid.bounds.north - grid.bounds.south) * height;
  return `<figure><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Regional RMS mismatch field. Darker cells fit the selected observations more closely. This is not a probability map.">${cells}<circle cx="${x}" cy="${y}" r="4" fill="#e9b35a" stroke="#fff" stroke-width="1.5"/></svg><figcaption>Regional model mismatch · darker is lower RMS<br>20–55° N / 120–165° E · not confidence</figcaption></figure>`;
}

function dateLabel(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function storyFor(investigation, mode) {
  const picks = investigation.stations.filter(station => station.observedPick).length;
  return {
    replay: { eyebrow: '01 / REPLAY A REAL EARTHQUAKE', title: 'A planet set in motion.', intro: investigation.summary, scene: `${investigation.title} → the world` },
    locate: { eyebrow: '02 / FOLLOW THE OBSERVATIONS', title: 'Where did it begin?', intro: `${picks} archived arrival times. Move a candidate source, test the mismatch, then compare with the historical catalog.`, scene: 'A source, constrained by observations.' },
    explore: { eyebrow: '03 / LOOK INSIDE THE PLANET', title: 'A journey through Earth.', intro: 'Trace a calculated path through the mantle and core. Follow its travel time, then compare the prediction with a real recording.', scene: 'Beneath the surface.' },
  }[mode];
}
