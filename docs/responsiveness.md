# Responsiveness in the complete investigation

This is a historical measurement of the Tohoku-only source-fit milestone. It does not qualify the current source preview. `sourceSnapshot` identifies the retained report SHA-256 `6db92ffbb87d04222c4889373e594cf194182af59383aa2662a9e135788c1662` and numerical source SHA-256 `5553f974f40fca69b587f24019fb4e5f782e000db0c7fb5ce926383fa00564a8`. The full local timing report and profiles are not distributed in this source tree. [The verification guide](verification.md#measure-responsiveness-and-record-the-demo) gives the current reproduction procedure.

These figures describe the earlier Tohoku milestone at its retained source hashes. [The later atlas measurement](atlas-responsiveness.md) covers event switching and travel diagrams. The two measurements cover different work and do not establish a speedup.

The earlier lab kept its replay clock and visible globe responsive during the measured source fits. The first fit takes about eight seconds because it builds and checks travel-time curves locally. Repeated fits reuse those curves and still run the regional search and exact final checks.

The figures below are medians of five runs per row. Each cold fit opens a new browser context and worker. Its warm fit runs immediately afterward. Desktop and mobile viewport order alternates between rounds.

| Viewport | Curve cache | Fit to final rendered result | Range | Pending feedback at next frame | Largest visible frame gap |
| --- | --- | --- | --- | --- | --- |
| 1440 × 1080 | Empty | 8.165 s | 8.132 to 8.249 s | 14.6 ms | 16.8 ms |
| 1440 × 1080 | Reused | 0.598 s | 0.582 to 0.602 s | 14.2 ms | 16.8 ms |
| 390 × 844 | Empty | 8.215 s | 8.182 to 8.265 s | 14.6 ms | 16.8 ms |
| 390 × 844 | Reused | 0.591 s | 0.573 to 0.603 s | 14.5 ms | 16.8 ms |

The pending DOM appears after a median 2.0 to 2.1 ms. The pooled visible animation-frame interval has a 16.7 ms median and 95th percentile in every row. Chrome reports zero main-thread tasks of at least 50 ms during the 20 measured fits. Cancellation reaches its error message in 2.0 ms on desktop and 2.4 ms at the mobile viewport. Its next frame occurs after 15.9 ms and 15.0 ms, respectively. Cancellation has one observation per viewport.

The machine is an Apple M4 Pro with 12 logical CPUs, running Chrome 155.0.8059.80 headless and Node 24.3.0 on macOS arm64. The one-minute host load average starts at 5.10 and ends at 6.13. Other work runs on this shared host. There is no CPU throttle or dedicated CPU allocation. Device scale is 1. The 390 × 844 result tests the mobile layout on this Mac. It is not a measurement on a physical phone.

## What the timer includes

The timer starts in a capture listener for a trusted click on **Fit source**. It ends at the first animation-frame callback after the exact linked result is ready. The interval includes curve construction, finite curve checks, regional search, direct confirmation, final station paths, DOM updates, and globe rendering. Both cold and warm runs retain all eight manual picks and return nine linked station paths. Every trial completes two worker jobs, confirms its fit against exact ray calculations, and returns 0.475672 s RMS.

The feedback measurement observes the pending DOM mutation and the following animation-frame opportunity. It is not INP or physical display latency. Frame samples count only when the fit is pending, replay is playing, and at least half of the globe is visible. The script scrolls back to the globe after the Fit button receives its real click. It does not time offscreen rendering as visible work.

The app clears previous calculated answers during a pending job. The measured display therefore has the globe, real recording, and moving clock while current ray answers are unavailable. It does not render stale rays to make the pending scene look complete. The final snapshot and recordings are checked after the timer stops.

No screenshot, tracing session, native solver, or full diagnostic-state copy runs inside a measured fit. The observer uses animation-frame timestamps, DOM mutations, and Chrome's long-task observer. The readiness check reads the existing read-only `window.workbench.ready` property. The helper never changes app state through diagnostics.

## Why the first fit takes longer

A separate untimed Worker CPU profile identified the numerical work. `Layer::integral` accounts for about 39.4% of nonidle samples, `Model::shoot` for 37.3%, and `atan` for 19.1%. The profile has about 22% idle samples overall. Its timing is excluded from the reported trials. The profile summary preserves sample counts.

The first fit queries 981 travel-time distances and performs 642 adaptive probes and 196 separate interstitial checks. Those calculations use the current Rust/WASM engine. They are not a shipped answer table. Numerical shooting and layer integration dominate preparation. Cooperative worker yields also contribute elapsed time. Repeating a fit avoids rebuilding the checked curve, but it still searches and confirms the result. Cold and warm figures describe different cache states, not a speedup between competing implementations.

## Reproduce the measurement

Build the production bundle, then run the helper from the repository root.

```sh
npm run build
node scripts/measure-responsiveness.mjs
```

The helper starts its own strict-port preview on 4188 and closes that preview and its own browser. `TAUP_PORT` changes the port. `TAUP_EVIDENCE` changes the output directory. `TAUP_FIT_ROUNDS` sets the number of fresh-context rounds and defaults to 5. A value of 0 runs only the two cancellation checks.

The retained local measurement receipt contains every timed trial, frame intervals, progress transitions, correctness checks, environment, and source hashes. Its original 20 completed fit trials are retained. The original helper then missed a cancellation mutation because it checked a capture-phase microtask before the app's target handler. That failed timer remains in the original receipt. The cancellation observer was corrected, and a separate recheck passes with the same app and numerical hashes. The combined receipt identifies both sources. Earlier interrupted runs remain excluded.

## Record the investigation

```sh
node scripts/record-walkthrough.mjs
```

The recording uses actual public controls. It plays two real station recordings, calculates a different candidate, fits the eight observations, reveals the 41.9 km catalog discrepancy, opens the LVC inner-core section, plays through its calculated arrival, and reloads a shared experiment. The helper preserves screenshots, an action receipt, a WebM, and an MP4 under `.audit/lab/walkthrough`. This historical helper used a macOS-specific video-tool path. Use `scripts/record-wavefronts.mjs` for the current demo route. No synthetic overlay or modified app screenshot appears in the video.
