# Preview qualification

Earthquake Lab 0.1.0 is an open-source educational preview in [steph4n-gh/earthquake-lab-publication](https://github.com/steph4n-gh/earthquake-lab-publication), with a [public hosted lab](https://quakes.steph4n.dev/). It supports the three curated events and the complete Tohoku investigation described in [the user guide](investigation-guide.md). The repository and Site opened together on October 16, 2026; the original development repository and full archive remain private.

The measurements and media below describe the original private development candidate. They remain historical evidence until a new candidate has its own exact-commit qualification. For clean publication deployments, `DEPLOYMENT.json` identifies the exact hosted publication commit and its immutable corresponding-source URL. The historical media below do not identify the current deployment.

## Clean-clone qualification

The October 15, 2026 qualification used a fresh GitHub clone of implementation revision `5a0f4ea2e6beaed8c35f63e8100405535fce274c`. The clone began without `node_modules`, `target`, `web/pkg`, `dist`, `.audit`, or a Python environment. It installed locked npm dependencies and built native Rust and WebAssembly from source. All sixteen qualification commands passed and the working tree remained clean.

| Gate | Observed result |
| --- | --- |
| Source and metadata | Project metadata and portable local documentation targets passed. Rust formatting and Clippy with warnings denied passed. |
| Numerical core | Six analytical/core tests and two frozen-corpus tests passed. Base and boundary checks retained 635 arrivals across 260 queries and unchanged tolerances. |
| JavaScript and release checks | Front interpolation, expiry, rewind and station-cue controls passed. All twenty isolated project/notice CLI controls passed. |
| Production distribution | Frozen input hashes, locked WASM build, Vite production build and read-only byte-identical notice checks passed. |
| Tohoku investigation | Seventeen browser journeys passed, including fitting, signed residuals, exports, shared state, cancellation and stale-answer handling. |
| Event atlas | Twenty-two journeys passed with 292 native geometry comparisons. |
| Textured Earth | Twelve journeys passed with five native calculations, exact texture bytes and dimensions, cutaway paths, orbit and touch gestures. |
| Spreading wavefronts | Seventeen journeys passed with five native fans and 44 native geometries, actual submitted buffers, exact station clocks, rewind and offline recomputation. |
| Recording polish | Seventy-five focused checks passed across desktop, intermediate and 390 px layouts while retaining every exact prediction marker. |

The four investigation suites total 68 journeys. The 75 label checks are separate focused checks. Captured browser and window error counts were zero. Source and built-asset identities were retained with the generated reports.

The local tools were Node.js 24.3.0, npm 11.4.2, Rust/Cargo 1.99.0, wasm-bindgen CLI 0.2.129, Python 3.14.4 and installed Google Chrome on macOS. Touch-enabled desktop layouts qualify the tested browser environment. They do not establish physical-phone or Safari compatibility.

This initial clean clone includes the final sprint rendering repair and final license-file arrangement. The complete upstream combined license is retained byte for byte, and both complete GPL and LGPL texts remain in the distribution. Later preview-startup parsing corrections and refreshed media require their own qualification. The exact current commit's Actions result below is authoritative; the earlier clone receipt does not qualify changed helpers.

## Final sprint

The final sprint repairs unnecessary rendering during numerical preparation. A progress-only Worker message updates the existing panels without redrawing unchanged Earth or evidence geometry. A bounded software-rendering diagnostic observed the same 424 progress callbacks before and after the repair, with 5,936 WebGL draw calls before and zero during progress afterward. This is a count of removed work, not a universal speedup. Real trusted cancellation, Retry and subsequent exact-confirmed fitting passed separately under software rendering and fourfold CPU throttling. All seventeen local Tohoku browser journeys passed against the repaired application.

Two browser helpers also passed their intended readiness timeout as an unused predicate argument. They now supply the existing 60-second value in Playwright's options argument. Action timeouts, cancellation assertions and numerical tolerances remain unchanged. The numerical source, model and frozen observations are unchanged.

Earlier Linux runs failed before Cancel could receive activation. Their traces remain retained. The final candidate requires the complete clean-build and browser gates on its own commit; the Actions result below is authoritative. The project-local verification skill lists all five helpers.

The next Linux run completed all seventeen Tohoku journeys, then exposed a verifier portability issue before the atlas opened. Vite inserted ANSI formatting inside its startup URL and `Local:` label. The affected helpers now strip terminal control sequences before applying their existing startup checks. They retain owned-server checks, strict ports, HTTP checks, readiness timeouts and all workflow assertions. A frozen earlier checkout reproduces the colored-log failure; current qualification explicitly enables colored output. This changes preview detection, not application or scientific behavior.

A later Linux run reached the atlas event-race checks but collected only five consistent observations inside a fixed 2.5-second window. A software-rendering probe reproduced the sample-count failure and traced the delay to cold WebGL setup. The observer now retains the original minimum windows and at least ten samples, and also requires the final event to be ready within the existing 60-second readiness budget. Every source, plot, section and recording invariant remains checked. Startup observation begins before the real event switches. This repairs verification coverage; it is not a rendering speedup.

The following Linux run passed that sample-count gate but missed the travel diagram's transient pending state. The test had begun watching after awaiting the start click. Lifecycle observation now starts before the control activates. A separate capture-phase witness requires the old case to remain pending when the actual event selector changes. Fit and travel switches also require an unresolved numerical Worker request at that instant. The continuous publication checks remain in place. A historical pending receipt alone cannot satisfy this gate.

That stronger witness also rejected a local startup race whose fixed 350 ms download delay had ended before selection. Startup verification now holds the first real Worker script request until the first event switch, then releases the original response. Cleanup also releases it. This checks a genuine delayed-startup boundary without replacing observations, calculations or application state.

A complete progress-callback census then found three preparation paths still redrawing unchanged geometry. Initialization and wavefront preparation now update their visible panels. Travel sampling refreshes the technical request counter on its first progress message and retains later diagnostic progress without rendering. A real-control review found the counter otherwise stayed at zero during the active request. In the same software-rendering and fourfold CPU-throttling diagnostic, all 567 progress callbacks remained, while their WebGL draw count fell from 5,953 to zero. All 90 travel-time samples and the fitted source, RMS and exact-ray check were identical. Begin, completion, error and cancellation renders remain. This establishes removed work under the recorded conditions and does not promise a general speedup.

## Check the actual candidate revision

[GitHub Actions](https://github.com/steph4n-gh/earthquake-lab-publication/actions/workflows/verify.yml) records the authoritative result for each pushed commit. Select the run whose head matches `git rev-parse HEAD`. A green result for a different commit does not qualify a changed checkout. The workflow performs a fresh Linux checkout, locked builds, numerical checks, distribution checks and all five browser suites. It retains generated workflow evidence for seven days.

The [verification guide](verification.md) gives reproducible commands. The [verification skill](../.cursor/skills/verify-taup-workbench/SKILL.md) maps checks to user workflows. Raw local audit trees are excluded from Git. [Curated scientific evidence](evidence/README.md) preserves historical reference checks and their negative results with explicit identities.

## Responsiveness and demonstration

The [current preview measurement](preview-responsiveness.md) records twenty actual-front playback windows, twenty warm inputs and ten exact arrival/rewind checks. Every playback trial had a 16.7 ms median callback interval on the measured Mac. A separate profile and explicit source/build hashes bound that result. It is not physical display FPS, GPU completion time, a speedup comparison or a physical-phone measurement.

The [48.32-second recorded walkthrough](media/wavefront-walkthrough.mp4) demonstrates twelve checked public-control actions, all three events, a genuine source fit with catalog mismatch, and exact shared-state restoration. Recording ran separately from timing. The source snapshot and media hashes are recorded beside the measurement.

## Scientific and public-opening limits

The [numerical contract](numerical-contract.md) describes the limited spherical IASP91 phase and depth domain. The strict held-out enumeration diagnostic retains eight failing groups and sixteen extra close rays, with a separate bounded upstream-shooting reconciliation. This is not complete TauP parity or physical Earth validation.

The fixed-depth Tohoku location control retains about 0.476 s residual RMS and about 41.9 km catalog mismatch. Archived pick uncertainty and channel identity are absent. Real instrumental recordings, archived picks, model predictions and display interpolation remain distinct.

This independent publication uses a [narrow factual distribution](publication-data.md). It excludes full source aggregates and original development history. The original private archive is preserved. The [release checklist](../RELEASE_CHECKLIST.md) requires exact source, history and offline-reproduction qualification. Code licensing and data rights remain separate.

The [hosted demo](https://quakes.steph4n.dev/) is public. There is no registry package or operational earthquake service. Physical phones, Safari, cold network loading, battery use and physical display timing need separate qualification before those claims expand.
