# 3D Earth responsiveness

This is a historical measurement of the textured-globe milestone before spreading fronts. It does not qualify the current source preview. `sourceSnapshot` identifies the retained report SHA-256 `d9739e55915872abfb905d7ddb7bd5e8fc378b1b993a89818dc26f5ae1955f01` and numerical source SHA-256 `5553f974f40fca69b587f24019fb4e5f782e000db0c7fb5ce926383fa00564a8`. The full local timing report and profiles are not distributed in this source tree. [The verification guide](verification.md#measure-responsiveness-and-record-the-demo) gives the current reproduction procedure.

The earlier production globe recorded a 16.7 ms median browser animation-frame interval in every one of 30 visible-path playback windows. Observed intervals ranged from 16.5 to 16.8 ms. All 5,430 samples contained an on-screen calculated packet, with no skipped frames. The 30 playback windows and 20 measured cutaway or orbit interactions recorded zero browser errors and zero main-thread tasks lasting at least 50 ms.

These are absolute measurements on one computer. They are not a speedup comparison, physical display frame rate, GPU-completion measurement, or phone qualification.

## Public interaction results

The intervals below run from a trusted public input to its next application animation-frame opportunity. Opening the cutaway includes its pressed-state change. Orbit starts with pointerdown and completes after actual camera diagnostics change. The browser driver and frame scheduling contribute to these intervals.

These are warm interactions after the case and its cutaway have already been displayed. They exclude initial downloads, image decoding, solver startup and first shader compilation.

| Interaction | Trials | Median ms | Range ms |
| --- | ---: | ---: | ---: |
| Desktop, open cutaway | 5 | 15.3 | 14.1 to 16.5 |
| Desktop, start orbit | 5 | 16.6 | 15.0 to 17.6 |
| 390 px, open cutaway | 5 | 15.4 | 15.0 to 16.6 |
| 390 px, start orbit | 5 | 17.3 | 14.4 to 18.3 |

## Work and method

`scripts/measure-globe.mjs` starts an owned production preview on port 5195. Five repetitions per phase and viewport alternate the viewport order. The viewports are 1440 by 1080 and 390 by 844, both at device pixel ratio 1. Each trial opens a fresh browser context and calculation Worker. Operating-system and executable caches are not flushed.

Every three-second playback window requires the decoded local NASA texture, an open cutaway, at least half the canvas in view, a real on-screen packet, a complete guide and a nonempty elapsed trail. The shared clock advances, model positions change, and completed numerical-job counts stay fixed. P and S use Tohoku to ANMO. PKIKP uses Tohoku to LVC and remains below the inner-core boundary throughout timing. Camera drags change the camera while preserving both cut normals.

No screenshot, trace or full state clone runs inside a timing window. A separate untimed CPU profile follows the measurements. It contains 2,327 samples, of which 1,957 are idle. The leading application frames map to `draw()` and `label()` in `web/globe.js`; the next graphics frame maps to Three.js attribute binding. This supports a browser-scheduling limit for the observed interval. It does not establish GPU headroom.

The host is an Apple M4 Pro with 12 logical CPUs. Installed headless Chrome is 155.0.8059.80, using ANGLE Metal. The one-minute system load moved from 5.76 to 4.18. Other user applications remained running. The test does not emulate a slower handset or measure a physical touch screen.

## Receipts and reproduction

The measured report retains every trial, packet, camera operation, long-task count, environment and source/build hash. The separate profile retains the untimed samples. The initial range-input helper failure happened before any playback measurement and remains under `performance/attempts/range-step/`. The successful run uses the control's supported 0.1-second step.

`node scripts/measure-globe.mjs` reproduces this procedure. Other automated browser work must be closed during measurement. The recording helper also owns port 5195 and runs afterward. [The full verification skill](../.cursor/skills/verify-taup-workbench/SKILL.md) checks the source-location exercise, numerical paths, all events, sharing, offline work and touch interactions separately.

[The older atlas measurements](atlas-responsiveness.md) retain a different workload and source milestone. This historical result does not claim an improvement over them. Physical phone performance and physical presentation latency remain unmeasured.
