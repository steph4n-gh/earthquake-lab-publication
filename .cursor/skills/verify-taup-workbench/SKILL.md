---
name: verify-taup-workbench
description: Verify TauP's production 3D Earth, modeled wavefronts, timed ray paths, curated earthquake evidence, source-location exercise, shared experiments and exports through public browser controls and independent native calculations.
---

# Verify Earthquake Lab

Use the browser as the primary surface. The native CLI and frozen real observations independently check displayed predictions. Read [the feature map](features/README.md) before choosing a focused journey. Run all five browser helpers for full coverage. Read [the 3D Earth contract](../../../docs/globe-contract.md) when verifying cut geometry, surface imagery, or timed paths.

## Launch

Use Git, Node.js, standard-library Python 3, Rust, the `wasm32-unknown-unknown` target, wasm-bindgen CLI 0.2.129 and installed Google Chrome. Exact prerequisites are in the [developer guide](../../../docs/development.md).

```sh
npm ci
npm run verify:publication
cargo build --release --locked
npm run build
npm run verify:browser
npm run verify:atlas
node scripts/verify-globe.mjs
node scripts/verify-wavefronts.mjs
npm run verify:polish
npm run verify:distribution
```

The original helper owns preview port 4180. The atlas helper owns 4193. The globe helper owns 5194. The wavefront helper owns 5197. Each opens fresh Chrome contexts and stops its owned resources in `finally`. Set `TAUP_PORT` and `TAUP_EVIDENCE` to isolate another run and preserve its receipt. Do not drive or kill an existing user or agent instance. A ready server requires the actual numerical Worker to return the historical ANMO snapshot, not just an HTTP response. Globe readiness also requires the local Earth texture to load.

## Doctor

For a manual preview started by this run:

```sh
npm run preview -- --port 4181 --strictPort
curl --fail --silent http://127.0.0.1:4181/ | rg '<title>Earthquake Lab'
```

Inspect the read-only `window.workbench.ready`, `error` and `state`. `state.snapshot` must contain exact arrivals and nine linked geographic network rays at the default event. `state.stats.ready` must be true. `window.workbench.query(depth,distance)` is an asynchronous read-only diagnostic returning the same solver's arrivals, not a UI setter. The complete helper performs these readiness checks.

If launch fails, inspect the owned evidence directory's `server.log` for a port conflict. Pick a free port. Never kill a process by name. A numerical timeout requires the visible Retry calculation action, which recreates only the owned Worker.

## Drive

```sh
node scripts/verify-browser.mjs
```

The original helper retains Tohoku fitting, residual reconstruction, cancellation, ambiguity, numerical boundaries, offline calculation, exports, sharing and browser Back. The atlas helper adds all three cases, event lifecycle races, exact station and sampled travel predictions, record sections, section packets and touch controls. The wavefront helper checks sampled front vertices, legal gaps and expiry, origin-adjusted timing, station and recording cues, backward seeking, event and depth replacement, old and new links, and offline preparation. The globe helper adds the 3D default, loaded texture, fixed cutaway, exact guides and trails, deep source, native packet interpolation, touch orbit and reproduced rendering. Use public controls. Read-only diagnostics may inspect results, but internal setters or test-only endpoints must not create state.

Main controls use exact ARIA labels `Recording station`, `Playback speed`, `Replay time in seconds after catalog origin`, `Seismic phase` and `Arrival branch`. Stage buttons have `data-mode="replay"`, `locate` and `explore`. Candidate inputs are `#latitude` and `#longitude`; submit `Calculate candidate`. Advanced inputs are labeled `Source depth` and `Receiver distance`; submit `Calculate geometry`. Fit selection uses `Use TATO observation` and the corresponding station code. See feature files for resulting-state assertions.

After any production edit, rebuild before driving. For solver changes also run:

```sh
cargo test --release --locked
cargo clippy --all-targets --all-features -- -D warnings
python3 scripts/verify_numerics.py
python3 scripts/verify_numerics.py --corpus fixtures/reference-boundaries.json
```

For wavefront numerical changes also read [the front journey](features/wavefronts.md) and run the independent arbitrary-parameter reference check. It qualifies the exported finite ray sample, not a complete wavefield.

With the pinned scientific Python environment, `scripts/investigation-data/prepare.py --verify` and `scripts/fetch_waveforms.py --verify` check retained source, derivative and producer-dependency hashes and exact offline reproduction. Both use compact Tohoku catalog facts. Full catalog captures are not required. The numerical contract documents the strict held-out count diagnostic. It intentionally fails in eight frozen groups. An unexplained difference is a failure; never turn the known diagnostic into a claim of full TauP parity.

`./.venv/bin/python scripts/prepare-events.py --verify` independently checks retained inputs and producer dependencies, then reproduces the two additional cases byte for byte without network access. `npm run build` checks frozen data, model, cartography, Earth imagery and producer hashes. The reports state the current counts. New cases have null challenges even when manual picks exist.

## Verify publication data

Run `npm run verify:publication` against a complete checkout of the intended independent publication history. The gate checks working files, staged blobs and every object reachable from all refs. Shallow history, object alternates and full catalog aggregates fail. `npm test` includes the isolated history controls.

Run `.venv/bin/python scripts/test_catalog_facts.py` and all three producer `--verify` commands with the pinned scientific environment. Missing picks and unknown creator, channel and uncertainty remain explicit. The four browser derivatives must reproduce exactly without network access or excluded source captures in both Linux and macOS CI. Preserve the [historical Linux negative result](../../../docs/evidence/observation-reproduction-linux.json). The [display-precision contract](../../../docs/observation-precision.md) records the format change. Do not relax equality or infer universal platform identity from the tested environments. Use [the archive-comparison procedure](../../../docs/reproduce-catalog-facts.md) only for an optional historical source audit. Reacquisition drift must fail without overwriting frozen facts. The [publication-data record](../../../docs/publication-data.md) defines the retained scope and privacy boundary.

## Hosted target

The production Site is public. Follow the [public hosted procedure](../../../docs/verification.md#public-hosted-verification) using fresh anonymous browser contexts, without service authorization or saved identity. Verify both domains, source/deployment identities, all mapped controls and exports, and the continued privacy of the original repository and archive.

For a private target, the same five helpers support `TAUP_URL` with a Site service credential through hidden stdin. Read the [private hosted procedure](../../../docs/verification.md#private-hosted-verification). Keep credentials out of arguments, environment variables, reports, traces, HAR and saved browser state. Hosted mode retains the application assertions, screenshots and downloads but disables traces. Run `npm run verify:target` for two-origin dummy-credential controls. Require anonymous denial and native owner-only policy only when the selected audience is private. Service access verifies neither anonymous public access nor completed owner OAuth.

## Evidence

Default proof goes to `.audit/lab/browser/`. Require `report.json` with `verdict: PASS`, complete coverage of the mapped journeys and zero errors. Read the resulting experiment, exact residuals and fit receipt, not just a screenshot. Retain `trace.zip`, desktop/location/inner-core/mobile/shared captures, actual downloaded `scenario.json`, `scenario.csv` and `empty-scenario.csv`. The report binds the run to source and WASM hashes.

Atlas evidence goes to `.audit/atlas/browser/`. Require its PASS report, all mapped case and plot journeys, retained captures, trace and downloads. Recompute each recorded source hash against current files after any repair. A historical PASS does not qualify changed source.

Globe evidence goes to `.audit/globe/browser/`. Require its PASS report, zero browser and window errors, native comparisons, same-origin texture bytes matching the built image, retained desktop and touch captures, and traces. Inspect both stable cut normals, the full guide, the elapsed trail, and the source radius. Compare the fresh shared globe capture with the original. See [the interior journey](features/interior.md) for exact assertions.

Wavefront evidence goes to `.audit/wavefronts/browser/`. Require a PASS report, zero browser and window errors, retained native fan exports, actual vertex and contour comparisons, desktop and touch captures, and traces. Run [the front journey](features/wavefronts.md) for exact control and numerical assertions. Keep prior investigation, atlas, and globe reports in their own evidence directories.

For current spreading-front responsiveness run `npm run measure`. For its recorded demonstration run `npm run record`. Run these sequentially because both own port 5196 by default. Their evidence goes to `.audit/wavefronts/performance/` and `.audit/wavefronts/walkthrough/`. The recording needs FFmpeg and ffprobe on PATH. Keep visible textured P, S and PKIKP packets inside the viewport during measured playback. Inspect the per-trial frame gaps, long tasks, host load, rendering diagnostics and separate CPU profile. The recording must preserve actual public-control actions and shared-state reload. These receipts do not replace the assertions above. A 390 px desktop browser test does not qualify a physical phone.

`scripts/measure-atlas.mjs` and `scripts/record-atlas.mjs` retain the prior atlas milestone's measurement and recording procedures on port 4192. They do not qualify the current 3D upgrade. Earlier Tohoku helpers remain historical too.

The fitted source is a bounded regional result at fixed 29 km depth with free origin time. Its approximately 41.9 km catalog difference stays visible. Missing pick uncertainty stays null. The archive identifies a station but no specific displayed BHZ sensor. Do not report calibrated confidence, exact hypocenter accuracy, simulated waveform amplitudes or complete TauP parity.

## Cleanup

The helper stops its own preview and Chrome context on success or failure. It never deletes evidence. For manual runs, stop only the process handle created by that run. Confirm the report, trace and downloads still exist after teardown. Leave other local servers and user tabs alone.

## Selected recording and release checks

Read [the polish journey](features/polish.md) when changing recording labels, project metadata, source instructions, or distribution notices. One fixed caption identifies the selected phase-local branch. Every exact model line retains its time, branch, and title. The caption is not a substitute for checking all original markers.

`npm run check:project` validates metadata and local documentation targets. `npm test` includes rejection controls for project and distribution checks. `npm run verify:distribution` reads completed output without repairing it.

## Helpers

Invoke repository helpers through the interpreter or npm command shown above. Use Playwright Trace Viewer on the retained `trace.zip` to inspect a failed journey. Read the matching feature file before changing an assertion. Keep controls, feature map and harness aligned. `/maintain-verification-skill` provides the maintenance loop when the UI changes.
