# Spreading modeled fronts

## Sub-features

P, S, and PKIKP fronts show equal-time positions on legal downward ray families. Translucent surfaces show propagation through the volume. Bright contours show their intersections with the fixed quarter cutaway. Real stations and recording plots use exact model arrival times. The historical samples and manual picks stay fixed.

## How to get to it

Open Earth and press Play earthquake. Drag to orbit the cutaway. Use the wavefront visibility control to compare the fronts with the selected exact ray. Select a modeled station arrival to inspect its station, phase, branch, and catalog-relative time. Choose Look inside Earth for an adjustable source depth and virtual receiver. Ray section remains the analytical view.

## Drive the built application

Run `node scripts/verify-wavefronts.mjs` after rebuilding. It owns a fresh production preview on port 5197 and retains evidence in `.audit/wavefronts/browser/`. Read [the wavefront contract](../../../../docs/wavefront-contract.md) before judging what the fronts imply.

Use public controls. Read-only `window.workbench.state` and `#earth-globe[data-wavefronts]` expose completed calculations and rendered geometry. They may inspect state, but they must not create it. Require a current source-depth fan when fronts are visible. A ready page must include completed front preparation, not just completed station paths.

At Tohoku, inspect fronts at several positive clock values and after modeled origin. Compare actual rendered sample positions and phase counts with a separately executed native fan. Interpolate native Cartesian path endpoints at cumulative time, matching the selected packet, then revolve that point around the source axis. Do not compare the displayed chord radius with a separately interpolated polar depth or widen the independent path-data limits. Require legal native adjacency. No triangle may join rays across an omitted parameter interval. Before origin, require no propagated front. At each ray's surface endpoint, expire that ray without leaving it attached to surviving rays. Seek back and require the earlier geometry and station states to return.

For each available P, S, and PKIKP station cue, compare its exact travel time with the current station summary. Add the snapshot's origin offset to get the cue's catalog-relative time. Seek before and after that time. Check the station cue, selected recording cue, record-section cue, and actual replay cursors. Use a candidate in the Tohoku source exercise to require a nonzero modeled origin offset. Compare the manual-pick positions and waveform path before and after the change. They must remain fixed.

Station selection, phase selection, and camera orbit must reuse the fan for the same source depth. Rapid event replacement and rapid source-depth replacement must not display a stale fan, source, or station summary. A canceled preparation must not install its result later. Keep the actual replacement sequence and observed states in the receipt.

Share a paused, orbited front view. Restore it in a fresh context and compare complete experiment state and rendered front geometry. Share with fronts hidden and require that state to restore too. Remove only the new front field from a valid link and require the historical link to restore with its documented default. Existing identity validation remains in the original helper.

Disconnect a warmed context and calculate an unseen source depth. Require the native-matching front and station calculations to complete locally. A network failure must not turn into a fallback front.

Use a 1440 by 1080 desktop context, a 993 by 900 desktop pane, and a 390 by 844 touch context. In the 993-pixel pane, require the globe and selected waveform to fit together in one viewport. Perform a real touch drag, toggle fronts, play, scrub backward, and switch cases. Require visible surfaces or contours, synchronized clocks, and no horizontal overflow. Retain screenshots and Playwright traces. A touch-enabled desktop browser does not qualify a physical phone.

## Check arbitrary-parameter paths independently

Export the native reference cases and run the pinned scientific Python checker.

```sh
mkdir -p .audit/wavefronts/reference
target/release/taup --wavefront-reference > .audit/wavefronts/reference/fan.json
.venv/bin/python scripts/verify-wavefront-reference.py --input .audit/wavefronts/reference/fan.json --output .audit/wavefronts/reference/report.json
```

Require PASS with source, input, model, native binary, and independent ObsPy hashes. The checker calls ObsPy's direct parameter shooting and path calculation, checks omitted physical discontinuity intervals, and verifies constant-velocity controls. It keeps the original 0.1-second travel-time, 0.5-kilometer turning-depth, and 2-kilometer sampled-depth limits. Finite checks do not prove complete wave coverage.

## Keep the older journeys

Run the original investigation, atlas, and globe helpers after the focused front check. Preserve their assertions and tolerances. Use isolated `TAUP_EVIDENCE` paths for this milestone. The selected packet remains an exact station or virtual-receiver path. The Ray section, source fit, archived picks, exports, offline calculations, and older shared links remain qualified separately.
