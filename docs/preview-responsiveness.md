# Private preview responsiveness and walkthrough

The final 0.1.0 production preview passed an absolute same-host browser check on October 16, 2026, at 00:37 to 00:38 EDT. Every measured playback trial had a 16.7 ms median animation-frame callback interval. This qualifies the tested build and workload on this computer. It does not establish a speedup, physical display FPS, GPU completion time or physical-phone performance.

The [recorded walkthrough](media/wavefront-walkthrough.mp4) shows the same production build through public controls, including all three earthquakes and the Tohoku location exercise. The [investigation guide](investigation-guide.md) explains the complete exercise. The [verification guide](verification.md#measure-responsiveness-and-record-the-demo) gives prerequisites and reproduction commands.

## Measured work

[`scripts/measure-wavefronts.mjs`](../scripts/measure-wavefronts.mjs) ran twenty settled three-second playback windows. There were five repetitions for each combination of desktop or 390 px layout and spreading P/S or inner-core PKIKP fronts. Viewport order alternated between rounds. Desktop used 1440 × 1080 pixels. The narrow layout used 390 × 844 pixels. Both used DPR 1 and fresh browser contexts and calculation Workers per viewport trial.

| Playback workload | Trials | Median callback interval | Observed interval range |
| --- | ---: | ---: | ---: |
| Desktop P and S | 5 | 16.7 ms | 16.5 to 16.8 ms |
| Desktop PKIKP | 5 | 16.7 ms | 16.5 to 16.8 ms |
| 390 px P and S | 5 | 16.7 ms | 16.5 to 16.8 ms |
| 390 px PKIKP | 5 | 16.7 ms | 16.5 to 16.8 ms |

These windows checked 3,620 actual-front samples and 3,600 callback intervals. There were zero skipped samples, zero overlapping main-thread tasks of at least 50 ms and zero captured browser, window or HTTP error responses. The recording cursor and catalog-relative front clock agreed exactly in every sampled frame. Each window advanced the earthquake clock by more than 20 seconds at 10× playback speed.

The timed cutaway contained positive surface and contour draw counts, multiple active rays and changing submitted vertex positions. PKIKP samples entered the solid inner core. The source-depth fan contained 354 rays and 3,441,144 bytes. Its revision and preparation count stayed fixed. Completed numerical jobs did not increase during playback. This checks that the visible work occurred while timing. It does not measure GPU completion. Screenshots, CPU profiling, network waits and full application-state cloning stayed outside the timed windows.

## Warm controls

Twenty trusted inputs measured time to the next application frame with a matching updated front clock or changed orbit camera. Each row contains five repetitions.

| Viewport and control | Median | Observed range |
| --- | ---: | ---: |
| Desktop seek | 4.1 ms | 4.0 to 12.4 ms |
| Desktop orbit | 19.0 ms | 18.2 to 19.4 ms |
| 390 px seek | 8.9 ms | 3.6 to 11.2 ms |
| 390 px orbit | 19.4 ms | 17.2 to 20.3 ms |

No overlapping main-thread task of at least 50 ms occurred in these intervals. Ten additional exact station-arrival and rewind checks passed. The selected TATO prediction, recording marker, front clock and reached-station cue agreed. Seeking one second earlier then cleared that cue.

These are warm application-frame opportunities. They exclude initial downloads, texture decoding, shader compilation and fan preparation. They are neither INP nor physical input-to-display latency. Fresh browser contexts do not imply a cold operating-system, browser-process or GPU cache. These measurements do not time source fitting or the initial loading experience.

## Host and limiter

The host was an Apple M4 Pro Mac with twelve logical CPUs, Node.js 24.3.0 and installed headless Chrome 155.0.8059.80. Chrome reported ANGLE Metal on Apple M4 Pro with WebGL enabled. One-minute load was 4.42 before measurement and 3.96 afterward. Ordinary user applications, Spotlight indexing, Arq, the window server and background services remained running. The project's correctness checks and builds finished before this measurement. Independent project browser qualification resumed only after timing finished.

A separate, untimed 3.5-second main-thread profile contained 2,403 samples, including 1,912 idle samples. Grouping identical call frames, the largest application hotspot was the globe's `draw` function with 84 samples. Front-coordinate `point` contributed 71 samples and wavefront `render` contributed 29. These map to [`web/globe.js`](../web/globe.js) and [`web/wavefront-geometry.js`](../web/wavefront-geometry.js). A Three.js vertex-attribute binding check contributed 36 samples. Globe label placement contributed 11. The profile was not pooled into any timing result.

Stable 16.7 ms callback spacing together with idle main-thread samples supports the bounded inference that browser animation scheduling limited the observed callback cadence. It does not establish GPU headroom or predict how much more geometry another device can handle. The warm measurement has no before-and-after performance comparison or improvement claim.

An earlier verifier diagnostic used SwiftShader software rendering and fourfold CPU throttling during a real event change. Cold WebGL context, shader and texture setup produced a main-thread task of about 1.14 seconds. Diagnostic state reads took at most 3 ms. This adverse setup is outside the warm measurements above and identifies event initialization as a remaining bottleneck.

A separate before-and-after census under the same adverse conditions found unnecessary scene draws in numerical progress callbacks. All 567 actual Worker progress callbacks still ran after the repair. Their WebGL draws changed from 5,953 to zero. Other scene draws, the exact confirmed source fit, and all 90 actual travel-time sample arrays stayed unchanged. Initialization and wavefront preparation now update their existing progress panels. Travel sampling refreshes the panel once to show the active request, then records progress without redrawing the scene. Results and actual scene changes still render normally. Tracing and callback instrumentation add overhead, so this establishes removed work under diagnostic conditions. It is not a general product speedup. The lifecycle verifier also observes pending before the click completes and proves that a case change happens while the old request is still unresolved.

## Recorded demonstration

[`scripts/record-wavefronts.mjs`](../scripts/record-wavefronts.mjs) ran separately after measurement. Its twelve checked actions show P/S spreading from Tohoku, opening and rotating Earth, jumping to TATO's exact modeled arrival, replaying and rewinding the station cue, following PKIKP into the inner core, and restoring the shared experiment URL. The restored experiment matched the saved state and remained paused.

The recording then switches to Maule 2010 and Okhotsk 2013. Each uses its own catalog source and real recordings. Okhotsk's 598.1 km depth and exact inner-core path contrast with the shallow events. The final Tohoku location exercise fits eight independently archived P picks at fixed depth. An exact-ray check confirms the fit while all observed pick times stay unchanged. Revealing the catalog preserves the fitted candidate and its 41.9 km discrepancy, despite a 0.476 s RMS. The finite-search and model-mismatch explanations remain visible. Browser, window and HTTP error counts were zero.

The continuous silent H.264 video is 47.76 seconds long at 1440 × 1400 pixels, encoded as 1,194 frames at 25 frames per second with FFmpeg 9.0.2. This encoding rate is not a measurement of application rendering FPS. The Earth and original recording fit together during the globe stages. Inspection of encoded full-size TATO, PKIKP and fitted-source frames confirmed readable phase/branch captions, model and archived-pick markers, the layer legend, catalog discrepancy and scientific caveats. Desktop and 390 px captures were also inspected. The poster is an unedited screenshot of the mantle-front stage from this successful run.

There are no synthetic waveforms, injected UI replacements or inferred earthquake audio in the recording. The surfaces are finite sampled ray-theory time fronts. They do not represent shaking amplitude or a complete wavefield. The [wavefront contract](wavefront-contract.md) defines their gaps and limits.

## Snapshot and reproduction

Each run hashed 82 source and built files and checked that their bytes stayed unchanged through completion. Both runs used the same application, Worker, WebAssembly, styles and Earth texture. The following SHA-256 values identify the measured application, numerical engine and retained media. The raw local timing report and CPU profile are not distributed. The commands below generate new receipts for a checkout.

| Artifact | SHA-256 |
| --- | --- |
| Production application JavaScript `index-CNHgHXWp.js` | `d4a74043094e1415d34aabf026bca3ac36163691fc47989febfa837e308478f6` |
| Production numerical Worker `compute-worker-BtcNPnpz.js` | `b40e52573a5e79f89c1bef981c062a9703da9df4fe4d73a56be4bdbc2faf1a16` |
| Production WebAssembly | `6c8ec3ed2ca9e3fab51f9b41f3b51dcbbb381f120ab10f3554edae4749334c25` |
| Numerical source `crates/taup-core/src/lib.rs` | `d1ebdadf016a8c5b81bc47c7498e4e6b6e9ac91610ed996005f3be288a93e2ec` |
| Recording panel `web/panels.js` | `848ec13275fe69e2e6f3419217c8045ff82821353b129586db4b27baa05225e1` |
| Measurement helper | `c64c44dbfe23188522f8a4a6bb65dab41d7f476166aa79143077cdc4928bbf28` |
| Recording helper | `844d1b43efd6177bdd334efa1fe380a212b34a4e4e678c4fa5537d006def5396` |
| Retained local measurement report | `a918d6a7a3c90c80104865ee46221200f6a3a6be5469780aa9574b982e1ea574` |
| Walkthrough MP4 | `9292655704635c91cd67b7d25ffe67755dfff4cd5cc4078fcf8b8ee2fae09439` |
| Mantle-front poster | `752ca6baff3d88e7a825a16ada4e2203390c728ea7b96741749707db53014174` |

Both helpers passed with `FORCE_COLOR=1` and inherited `NO_COLOR` removed. Their raw Vite logs contained ANSI controls inside the URL. The readiness checks stripped those controls while retaining the owned-process and HTTP checks. The production bytes remained unchanged.

Build the checkout with the [documented toolchain](development.md). Then run these commands sequentially because both helpers own preview port 5196 by default.

```sh
npm run measure
npm run record
```

`TAUP_EVIDENCE` selects an output directory. `TAUP_PORT` selects an unused preview port. The recording also requires `ffmpeg` and `ffprobe` on PATH. Each helper closes its browser and owned preview in `finally`. This run used port 5296 and left no listener there. It did not change the existing development server or user experiment.

Physical phones, other browsers and GPUs, background tabs, cold network loading, battery use, GPU completion and physical display timing remain unmeasured. The independent [numerical checks](numerical-contract.md) and complete browser workflows qualify different properties and are required separately.
