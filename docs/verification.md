# Verify a change

Run these procedures from the repository root after [installing the toolchain](development.md). A passing build does not qualify the investigation. Numerical, observation, browser, and performance checks answer different questions.

## Run the standard gates

```sh
npm ci
npm run check:project
npm run verify:publication
cargo test --release --locked
cargo clippy --all-targets --all-features -- -D warnings
npm test
cargo build --release --locked
npm run build
npm run verify:distribution
npm run verify
```

`check:project` checks release metadata and documentation consistency. Rust tests include analytical controls and frozen base and boundary corpora. `npm test` exercises reversible front sampling, station cues, and project-metadata rejection controls. `build` checks frozen inputs and regenerates WASM and the production bundle.

`npm run verify` runs the four investigation browser suites and the focused polish check sequentially. Installed Google Chrome is required. Each browser helper owns a strict-port preview, its browser contexts, and generated output. `verify:distribution` checks the production legal and corresponding-source bundle. Keep the complete report from a failed attempt before changing a helper or app.

| Command | Main behavior checked | Default output | Default port |
| --- | --- | --- | --- |
| `npm run verify:browser` | Tohoku observations, source fitting, exact residuals, exports, links, cancellation, and stale answers. | `.audit/lab/browser/` | 4180 |
| `npm run verify:atlas` | Event replacement, all recordings, exact travel-time roots, lifecycle, and shared state. | `.audit/atlas/browser/` | 4193 |
| `npm run verify:globe` | Local texture, cut planes, exact ray packets, orbit, and touch gestures. | `.audit/globe/browser/` | 5194 |
| `npm run verify:wavefronts` | Actual front buffers, legal gaps, expiry, exact station clocks, rewind, visibility, replacement, and offline geometry. | `.audit/wavefronts/browser/` | 5197 |

Set `TAUP_PORT` and `TAUP_EVIDENCE` to isolate another run. Do not run several helpers against one output directory. The focused `npm run verify:polish` check covers selected recording labels while preserving every exact marker. The [verification skill](../.cursor/skills/verify-taup-workbench/SKILL.md) maps controls and expected behavior in detail.

The helpers use public controls. Read-only application diagnostics expose calculated outputs and submitted graphics buffers for assertions. They do not create test state. Reports retain source and compiled-asset hashes, errors, screenshots, traces, and inspected downloads.

## Check frozen numerical outputs

With the release native executable built, run these standard-library Python checks.

```sh
python3 scripts/verify_numerics.py
python3 scripts/verify_numerics.py --corpus fixtures/reference-boundaries.json
```

The 176 base and 84 boundary queries contain 635 arrivals. These gates compare phase counts, sorted ray parameters, times, turning depth, endpoint closure, and sampled paths. Keep the [frozen numerical tolerances](numerical-contract.md) unchanged.

Run the strict held-out diagnostic separately.

```sh
python3 scripts/verify_numerics.py --corpus fixtures/reference-held-out.json
```

This diagnostic is expected to exit with failure in eight phase groups. Rust returns 16 additional close rays while matching all 1,211 listed reference arrivals. Do not turn the expected negative result into a generic passing parity badge. Inspect [the original diagnostic](evidence/held-out-original.json) and [the bounded reconciliation](evidence/held-out-reconciliation.json), then reproduce the independent shooting check below. Missing listed rays or an unconfirmed extra ray are failures.

## Reproduce observations and reference calculations

Use the pinned [optional Python environment](development.md#prepare-optional-scientific-tools). Build the release native executable first.

```sh
.venv/bin/python scripts/investigation-data/prepare.py --verify
.venv/bin/python scripts/fetch_waveforms.py --verify
.venv/bin/python scripts/prepare-events.py --verify
.venv/bin/python scripts/investigation-data/check_location.py
.venv/bin/python scripts/reconcile_caustics.py
mkdir -p .audit/wavefronts/reference
./target/release/taup --wavefront-reference > .audit/wavefronts/reference/fan.json
.venv/bin/python scripts/verify-wavefront-reference.py
.venv/bin/python scripts/verify-wavefront-checker-controls.py
```

The three data commands with `--verify` check compact factual inputs, frozen recordings, metadata and producer dependencies, then reproduce processed derivatives offline. Run `.venv/bin/python scripts/test_catalog_facts.py` to exercise factual-input rejection controls. They do not require full event archives or network access. The [publication-data record](publication-data.md) describes the narrower inputs and separate historical archive check. The location check reruns exact-ray multistart fits, station dropouts, two-station ambiguity, and native comparisons. Its scientific assumptions remain in [the location method](location-experiment.md).

The caustic reconciliation samples upstream ray-parameter brackets on a fixed grid, then refines roots independently of Rust's candidate parameters. The front reference check compares arbitrary-parameter native rays with ObsPy shooting, all path samples, 21 time quantiles, physical discontinuity gaps, and constant-velocity controls.

The [retained front snapshot](evidence/wavefront-reference.json) checks 1,883 IASP91 rays and ten constant-velocity controls. [Checker controls](evidence/wavefront-checker-controls.json) record positive and deliberately invalid inputs. These finite related-implementation comparisons do not establish physical Earth accuracy or complete root enumeration.

Keep new generated output under `.audit/`. Preserve failed diagnostics and their source identities. Refreshing observations, changing the Earth model, or replacing reference corpora is a separate scientific change.

## Measure responsiveness and record the demo

Run measurements only after functional checks pass. Close other automated browser workloads and record host conditions. Use a newly built production bundle.

```sh
node scripts/measure-wavefronts.mjs
node scripts/record-wavefronts.mjs
```

Run these commands sequentially. Both own port 5196. The measurement defaults to `.audit/wavefronts/performance/`. The recording defaults to `.audit/wavefronts/walkthrough/` and needs `ffmpeg` and `ffprobe` on `PATH`.

The measurement uses repeated actual front playback and warm seek and orbit interactions. Confirm that sampled vertices advance, contours are drawn, the recording clock agrees, and numerical-job counts stay stable during playback. Keep screenshots, profiles, recordings, and full-state copies outside timed windows. Record a separate profile to explain the cost.

Report browser callback intervals as callback intervals. Do not call them physical display FPS, GPU completion time, physical input latency, or INP. A touch-enabled desktop viewport is not a physical-phone measurement. Network-cold startup, background tabs, and untested browser engines need separate qualification.

The committed [walkthrough](media/wavefront-walkthrough.mp4) demonstrates its recorded source snapshot. It is not a performance measurement. [The preview responsiveness page](preview-responsiveness.md) records the private preview measurement. [The historical responsiveness page](wavefront-responsiveness.md) describes an earlier timing run. Neither qualifies a changed build.

## Review evidence for a release

1. Record the exact source revision and tool versions.
2. Build from a clean source checkout using the lockfiles.
3. Run the standard gates and inspect their actual reports.
4. Confirm that every report's source and asset hashes match the tested checkout and bundle.
5. Inspect the desktop and touch-layout captures and watch the recorded workflow.
6. Preserve the strict held-out negative result and its separate reconciliation.
7. List untested targets and scientific limits beside the result.

The committed [evidence directory](evidence/README.md) contains curated historical scientific snapshots. Generated local receipts and prior performance numbers are not evidence that fresh CI is green. A future public opening also requires the [public-release checklist](../RELEASE_CHECKLIST.md).

Exact observation-byte regeneration has a platform boundary. The [retained Linux negative result](evidence/observation-reproduction-linux.json) records display-rounding differences from the unchanged scientific preparation. The producer assertions remain exact. The macOS ARM64 CI job qualifies reference regeneration separately from Linux application and numerical checks. See [the reproduction scope](evidence/README.md#observation-reproduction-differs-across-platforms).
