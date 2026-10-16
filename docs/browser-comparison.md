# Browser comparison

This is a historical measurement of the restricted numerical runtime before the investigation application. It does not qualify the current source preview. `sourceSnapshot` identifies the retained report SHA-256 `1cf129167126ac74725824ddd810ec8f4afbd6bbf14df60d10755e5b3ec4c70d` and numerical source SHA-256 `4ee534ce0d356f4626f8dfeba6ee1b2cb404083ef22ac81ce74f0bec87d10610`. The full local timing report and profiles are not distributed in this source tree. [The verification guide](verification.md#measure-responsiveness-and-record-the-demo) gives the current reproduction procedure.

The historical comparison supported continuing the restricted Rust port for its small embedded runtime and direct JavaScript integration. The result concerns its three-phase subset and the pinned available ObsPy distribution. Browser TauP execution already existed. These byte and timing figures do not describe the expanded Earthquake Lab application.

## Measured work

`scripts/compare-browser.mjs` alternates implementation order across five rounds. Each measurement starts in a fresh Chrome context with HTTP cache disabled. Both implementations calculate IASP91 at 35 km source depth with phase requests P, S and PKIKP. Distance 60° returns P and S; distance 150° returns PKIKP. Every query awaits a complete result, checks phase/count/time and confirms each returned path closes at the receiver. Each round has ten alternating warm queries.

The comparison uses a loopback server with uncompressed files. Cold means navigation to the first checked result in a fresh context, not a fresh browser process, download over the internet or a rendered workbench. Warm measurement includes engine calculation, output serialization/transport through its browser adapter and JavaScript parsing. Neither side uses precomputed arrival answers.

The host is a shared 12-core Apple M4 Pro. Chrome reports 155.0.8059.80. Other work was running on the machine. No CPU quota or thermal isolation was applied. Raw observations, initial host load, source/WASM hashes and resource records are in `.audit/browser-comparison.json`. The pinned baseline and its broader capability scope are documented in [baseline.md](baseline.md).

## Results

| Measurement | Restricted Rust/WASM | Pinned ObsPy browser |
| --- | --- | --- |
| Runtime files before HTTP compression | 258,786 bytes | 75,316,190 bytes |
| Estimated compressed runtime files | 95,963 bytes | 62,115,264 bytes |
| Allocated WASM linear memory after queries | 1,376,256 bytes | 139,198,464 bytes |
| Cold first checked result, median of 5 | 45.3ms | 4,318.0ms |
| Cold range | 44.0 to 50.4ms | 4,254.6 to 4,523.4ms |
| Warm 60° median of 25 | 16.4ms | 34.6ms |
| Warm 60° range | 16.2 to 16.8ms | 32.1 to 43.3ms |
| Warm 150° median of 25 | 16.5ms | 23.1ms |
| Warm 150° range | 16.2 to 16.8ms | 21.1 to 25.4ms |

The Rust runtime count includes the WASM and JavaScript adapter, excluding TypeScript declarations. Compressed sizes use gzip estimates; the baseline's package archives are already compressed. These are artifact calculations, not measured internet transfer. WASM linear memory is allocated addressable memory, not used memory or browser-process RSS. That early workbench additionally contained its UI and a compact observed-recording JSON. The current application includes a larger UI, three cases, the Earth texture, and wavefront data.

All ten runs and 100 warm queries completed without recorded HTTP or computation errors. This is evidence for these two workloads on this host. It does not establish statistical confidence, general Rust-versus-Python performance, or superiority over a custom reduced ObsPy build. ObsPy supplies many phase families and scientific functions absent from this core. Its shipped runtime is not a lower bound for equivalent functionality.

## Explain the cost

An untimed Chrome CPU profile of 40 alternating real Rust queries contains 5,137 samples. The dominant release functions are model shooting, Bullen layer integration and arctangent math. JSON serialization appears at a much smaller sample count. This identifies the current warm query cost as numerical work rather than a lookup or artificial wait. The raw profile and summary are `.audit/rust.cpuprofile` and `.audit/rust-profile.json`.

The independent baseline profile attributes most warm computation to TauPyModel ray tracing, Brent arrival refinement, shooting and slowness integration. Extraction and Python imports account for its larger cold startup. Profiled runs are excluded from the measurements above. These profiles identify current costs; they do not prove an irreducible performance limit.

## Replay

Build Rust/WASM with `npm run build`. Prepare and start the pinned baseline using [baseline-replay.md](baseline-replay.md). While its server owns port 4178, run these commands from the repository root.

```sh
node scripts/compare-browser.mjs
node scripts/profile-rust.mjs
```

Do not accept a comparison with an incomplete run, unconfirmed result or different source/artifact hashes. Rebuild and rerun after core changes. The app's interface makes no performance claim.
