# Application contract

Earthquake Lab keeps historical observations, user experiment settings, and derived model answers separate. `web/main.js` coordinates those objects and owns one catalog-relative playback clock. A dedicated module Worker owns numerical work. Renderers receive current answers and time without solving physics or creating another clock.

[The atlas contract](atlas-contract.md) specifies event and linked-plot details. [The 3D Earth contract](globe-contract.md) defines the fixed quarter cutaway. [The wavefront contract](wavefront-contract.md) defines finite equal-time surfaces and exact station cues.

## Scientific inputs

`web/experiment.js` normalizes and freezes three cases. Each investigation contains a catalog source, an origin time, station geography, real recording traces, optional archived manual P picks, provenance, replay bounds, and defaults. A challenge is either Tohoku's fixed-depth regional exercise or null.

Tohoku composes its eight-station investigation with legacy LVC once. LVC is a ninth view-only recording with no fit observation. Maule and Okhotsk each retain six recordings. Pick absence remains distinct from unsupported model output.

The scientific identity contains case, optional legacy-recording, and model content hashes plus the phase-policy version. The build checks frozen source and derivative hashes before bundling. It does not regenerate scientific inputs to hide a mismatch.

## Experiment intent

`Experiment.context` distinguishes three states.

| Context | Additional intent |
| --- | --- |
| `replay` | Historical catalog source. |
| `locate` | Candidate latitude and longitude, selected observation IDs, and catalog-reveal state. |
| `explore` | Hypothetical source depth and virtual receiver distance. |

Every experiment also holds station ID, phase, phase-local branch index, catalog-relative time, playback speed, camera, cutaway visibility, front visibility, recording window, evidence view, and interior view.

`defaultExperiment(investigation)` creates replay intent. `requestFor(experiment, investigation)` derives either a geographic or radial numerical request. Changing phase, branch, time, or camera reuses current prepared numerical results. Changing source, geometry, or observations requests new results.

`encodeExperiment(experiment, investigation)` writes version-two intent into a URL fragment. `decodeExperiment(fragment)` returns the investigation, complete experiment, and warning. Existing version-one Tohoku links and older links without the optional `fronts` field remain accepted under their defined policy.

The decoder rejects malformed or oversized fragments, repeated or unknown fields, mismatched scientific identity, unsupported values, and unavailable observation sets. It resets the whole link to default Tohoku with a visible warning. An unavailable calculated branch resets separately with a notice. Shared links open paused and recompute answers. They contain neither recording samples nor saved numerical answers or fit grids.

## Numerical boundary

`openEngine(investigation, onProgress)` in `web/compute.js` creates one module Worker. Only source, station geography, archived picks, challenge, and identity cross the initialization boundary. Recording samples stay on the main thread.

The facade exposes these operations.

| Operation | Result |
| --- | --- |
| `evaluate(request, options)` | An atomic snapshot for the requested source and receiver, all selected arrivals, exact station predictions and paths, and optional residuals. |
| `locate(stationIds, options)` | A bounded regional fit with direct station confirmation and finite curve-check evidence. |
| `wavefronts(depthKm, options)` | A packed source-depth fan with separate legal segments and omitted intervals. |
| `travelTimes(depthKm, options)` | Exact supported roots at 90 distances, prepared on demand. |
| `stats` | Read-only readiness, pending, completed, and cancellation counts. |
| `dispose()` | Rejection of pending requests and termination of the owned Worker. |

Request IDs correlate replies. Abort signals reject pending work and send cancellation to the Worker. Worker checkpoints yield between bounded synchronous WebAssembly calls. Cancellation cannot interrupt one call already executing. A 45-second watchdog discards a failed or hung Worker. Explicit Retry starts a fresh owned Worker.

`evaluate` preserves every selected observation. A missing first P produces an incomplete residual set rather than silently dropping a station. Exact real-station arrival summaries and station paths remain separate from a hypothetical radial receiver.

## Location search

The objective and independent controls are specified in [the location experiment](location-experiment.md). The initial exercise fixes depth at 29 km, bounds latitude and longitude to the Japan region, and fits a common origin offset. At least four manual picks are required for automated fitting.

`web/location.js` generates a first-P curve from the current engine, retains unsupported intervals, and checks interstitial distances against a 0.05 s finite target. The search evaluates a regional grid and refines separated basins. Final candidates receive exact station confirmation. Excess error triggers bounded refinement and then explicit failure rather than an unconfirmed success.

The first-P scalar adapter uses the full solver's P roots without path construction. It reduces curve-preparation work without replacing calculations with a shipped answer table. Independent fit coordinates remain verification references rather than answer constants or optimizer seeds.

## Event and answer lifetime

An event change pauses replay, aborts pending work, advances generation and request revisions, disposes the prior engine and graphics, clears old answers, and creates the new investigation lifetime. Hash navigation uses the same activation path. Late startup results dispose themselves.

A primary calculation clears prior current answers while pending. Main accepts only a snapshot matching the latest generation and revision. Lazy travel-time work yields to primary actions. Source-depth fans are cached in the Worker with a bounded two-depth cache. Returning an old event or geometry cannot overwrite newer intent.

## One clock and geography

Main owns `timeS` relative to catalog origin. Real recording cursors and archived picks use preserved historical clocks. Modeled packets and fronts use `timeS - originOffsetS`. Exact modeled station cues use travel time plus the current modeled origin offset.

`web/geography.js` projects geographic positions and native path samples into Earth coordinates. North is positive Y. The globe's radius and layer boundaries remain proportional to the IASP91 geometry. Advanced radial exploration keeps the catalog latitude and longitude and derives a virtual receiver along the selected real station bearing. The real station and its recording stay fixed.

Packets and fronts interpolate Cartesian endpoints at cumulative path time. The [front contract](wavefront-contract.md) documents finite interpolation, legal adjacency, and expiry. Front mesh intersections do not determine scientific station-arrival times.

## Presentation and exports

`web/panels.js` owns page controls and the selected recording. `web/globe.js` owns Three.js resources and pointer interaction. `web/section.js` owns the analytical selected-ray section. `web/evidence.js` owns the record section and travel-time diagram. Each renderer accepts the current experiment, calculation snapshot, and time. Static waveform paths rebuild only when scientific inputs, window, or viewport change.

A paused view has no continuous replay loop. Orbit controls can request a redraw without advancing time. Numeric latitude and longitude inputs complement the globe's tap-to-place candidate action. Missing and multiple arrivals retain visible controls and explicit empty states.

JSON export includes the current context, scientific identity, observations, selected recording context, calculated paths, and derived evidence under a schema version. CSV summarizes every supported arrival at the selected geometry and writes an explicit empty-result row. CSV branch numbers start at one. Internal selection and shared branch indices start at zero.

Read-only `window.workbench` diagnostics support actual-output inspection. `query(depth, distance)` computes through the existing engine. `frontGeometry()` copies actual submitted front buffers on demand. Diagnostics expose no state setters and are not the user workflow.

## Runtime choice and proof

One module Worker supplies local numerical work off the UI thread. [The runtime decision](local-runtime.md) explains why the current demo does not require an embedded V8 host or an untrusted scripting interface.

[The verification guide](verification.md) retains separate numerical, observation, and public-control gates. A frozen reference match does not establish physical Earth accuracy. A touch-enabled desktop browser does not establish physical-phone performance.
