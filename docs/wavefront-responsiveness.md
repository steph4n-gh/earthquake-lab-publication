# Wavefront responsiveness

This is a historical measurement of the spreading-wavefront milestone before the private-preview finishing changes. It does not qualify the current source preview. `sourceSnapshot` identifies the retained report SHA-256 `5d44382ff03f10443bbff85e43bc14f65eb630bb773eb3c0a84d85ddb23b0969` and numerical source SHA-256 `d1ebdadf016a8c5b81bc47c7498e4e6b6e9ac91610ed996005f3be288a93e2ec`. The full local timing report and profiles are not distributed in this source tree. [The verification guide](verification.md#measure-responsiveness-and-record-the-demo) gives the current reproduction procedure.

The retained wavefront build passed the absolute browser responsiveness check on an Apple M4 Pro Mac. This is a same-host qualification, not a speedup comparison or a physical-phone result.

## Playback

`node scripts/measure-wavefronts.mjs` runs twenty three-second windows. Five repetitions cover each combination of desktop or 390 px layout and spreading P and S or inner-core PKIKP fronts. Viewport order alternates between rounds. Desktop uses 1440 by 1080 pixels. The touch-enabled layout uses 390 by 844 pixels. Both use DPR 1.

Every window has a 16.7 ms median browser animation-frame interval. All observed intervals lie between 16.5 ms and 16.8 ms. The run checks 3620 actual-front samples, with no skipped browser frame intervals, no overlapping main-thread task of at least 50 ms, and no captured browser or window error. These are callback intervals, not independently measured display FPS.

The timed work has a visible textured cutaway and positive actual surface and contour draw counts. Rendered vertex positions advance. PKIKP includes submitted vertices inside the inner core. The recording playhead equals the catalog-relative front clock on every sampled frame. Fan revision, preparation count and completed numerical jobs remain unchanged during playback. No screenshot, profile or full state clone runs inside the timed intervals.

## Warm controls

Each control has five repetitions. Timing starts with a trusted range input or globe pointer event. It ends at the next application frame with the requested front time or changed camera. Initial downloads, texture decoding, shader compilation and fan preparation are outside these warm measurements.

| Viewport and control | Median | Observed range |
| --- | --- | --- |
| Desktop seek | 11.9 ms | 4.1 to 13.1 ms |
| Desktop orbit | 18.3 ms | 17.1 to 19.0 ms |
| 390 px seek | 9.8 ms | 8.0 to 15.4 ms |
| 390 px orbit | 18.2 ms | 17.7 to 18.7 ms |

These twenty interactions have no overlapping main-thread task of at least 50 ms. Ten additional exact station-arrival and rewind checks pass. The control values describe application frame opportunities, not physical input-to-display latency or INP.

## Host and interpretation

The host has twelve logical CPUs and runs installed headless Chrome 155.0.8059.80 with ANGLE Metal on Apple M4 Pro. One-minute host load is 4.46 before the run and 4.70 afterward. Other user applications remain running. The report retains all three load averages, busy-process snapshots, GPU configuration, source hashes and trial-level values. Browser QA contexts are stopped before measurement begins.

A separate untimed main-thread profile contains 2845 samples, including 2343 idle samples. Together with stable callback intervals, this supports the bounded inference that browser scheduling cadence limits the observed result while JavaScript has idle time. It does not establish GPU headroom or completion time. The profile interpretation maps the application hotspots to their measured source snapshot.

## Evidence and reproduction

The retained local performance report contains all trials and work checks. The separate CPU profile is excluded from reported timing. `scripts/record-wavefronts.mjs` records public controls separately. Run measurement and recording sequentially because each owns preview port 5196.

The [wavefront contract](wavefront-contract.md) defines the segmented model, shared clock and display interpolation. Frozen receiver-arrival checks and independent arbitrary-parameter ray checks qualify numerical outputs separately from browser responsiveness. A finite sampled front is neither a complete wavefield nor an amplitude prediction. Physical phones, background-tab operation, network-cold performance and physical display FPS remain unmeasured.
