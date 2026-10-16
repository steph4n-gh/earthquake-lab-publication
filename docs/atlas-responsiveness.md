# Responsiveness of the expanded atlas

This is a historical measurement of the linked-atlas milestone before the current globe and fronts. It does not qualify the current source preview. `sourceSnapshot` identifies the retained report SHA-256 `e0fee2fff16f76b99b7209933c05cae7184c5fea20f086899c131e2d07316de3` and numerical source SHA-256 `5553f974f40fca69b587f24019fb4e5f782e000db0c7fb5ce926383fa00564a8`. The full local timing report and profiles are not distributed in this source tree. [The verification guide](verification.md#measure-responsiveness-and-record-the-demo) gives the current reproduction procedure.

The earlier atlas kept the selected ray and full station network responsive in these Chrome measurements. The first Tohoku travel diagram at 29 km depth takes about 2 seconds because the local Worker calculates every supported root at 90 distances. Opening a completed diagram reuses its result.

Each table cell reports a median and range from five trials. Desktop and 390 px viewport order alternates between rounds. Each cold diagram starts with a new browser context and Worker. The warm diagram reopens the completed result in the same event lifetime.

| Operation | Desktop 1440×1080 | Mobile layout 390×844 |
| --- | --- | --- |
| First Tohoku 90-distance diagram | 1980.8 ms, 1964.4 to 1998.1 | 1981.4 ms, 1980.1 to 2013.7 |
| Reopen completed diagram | 14.8 ms, 14.5 to 15.2 | 15.7 ms, 14.6 to 16.2 |
| Open station record section | 15.1 ms, 14.7 to 15.4 | 14.9 ms, 14.7 to 15.5 |
| Switch to Maule | 157.6 ms, 157.1 to 160.9 | 157.6 ms, 156.3 to 158.8 |
| Switch to Okhotsk | 163.5 ms, 163.1 to 169.3 | 162.0 ms, 152.3 to 163.6 |
| Switch to Tohoku | 224.7 ms, 221.6 to 227.2 | 222.1 ms, 219.4 to 223.8 |

Twenty three-second playback windows cover five section and five 3D trials per viewport. The 3D replay retains nine actual geographic network rays and the selected full PKIKP path. Section playback retains the selected calculated path. Both retain the real recording and shared clock. Only visible frames with an actual interpolated packet count. All four groups have a 16.7 ms median animation-frame interval and 16.8 ms maximum. The 60 input operations and 20 playback windows record no browser or window errors and no main-thread tasks of at least 50 ms.

The retained local receipt binds every timed trial to the source, native model, WASM and production assets. It includes actual ray, station, recording and sample counts. A cache reopen completes zero numerical jobs. A cold chart completes one 90-distance job. Each event switch completes initialization and its exact network snapshot. Cache results describe different work and are not an implementation speedup comparison.

## Measurement boundary

The timer starts at the public button or selector event and ends at the next animation-frame opportunity after its actual diagram or event snapshot is ready. It includes computation, transfers, DOM changes and frame scheduling. Pending feedback is measured separately. Cold-diagram pending DOM appears after a median 4.1 ms desktop and 3.8 ms mobile; its next frame occurs after 34.6 ms and 34.2 ms. Event replacement includes synchronous presentation construction before that feedback.

No screenshots, video, tracing, native comparisons or full-state cloning run inside timed intervals. Frame intervals measure browser scheduling, not physical presentation latency, dropped compositor frames or INP. The host is an Apple M4 Pro with 12 logical CPUs, Chrome 155.0.8059.80 headless, Node 24.3.0 and DPR 1. Chrome reports ANGLE Metal on the M4 Pro. Host load starts at 6.22 and ends at 6.18 with other applications active. These are shared-host absolute measurements. The 390 px test uses this Mac, not a physical phone. The separate functional touch gate uses DPR 2.

## What limits preparation

Separate untimed CPU profiles identify the numerical work. The cold chart Worker has 1,864 samples, including 607 idle samples. `Layer::integral`, `Model::shoot` and `atan` account for 497, 456 and 243 samples. Layer integration and root shooting dominate active work. Serial calculation of 90 exact geometries and cooperative timer yields limit the first diagram. It does not fetch network data.

The separate selected-ray 3D main-thread profile has 2,458 idle samples out of 2,704. That profile is narrower than the timed full-network replay and is not a measured GPU utilization claim. Raw profiles remain beside the report. Profiling runs are excluded from the table.

## Reproduce

```sh
npm run build
node scripts/measure-atlas.mjs
node scripts/record-atlas.mjs
```

Both helpers own strict-port preview 4192 and their Chrome contexts, then clean up in `finally`. Run them sequentially. `TAUP_PORT` and `TAUP_EVIDENCE` isolate another run. The measurement defaults to five alternating rounds. The recording captures real public controls and saves an MP4, poster and source-bound action receipt under `.audit/atlas/walkthrough`. The first measurement setup failures remain in `.audit/atlas/performance/first-attempt` and `second-attempt`. They rejected incorrect harness assumptions about radial network paths and an ambiguous selector. Neither qualifies an app result.

[The earlier fit measurements](responsiveness.md) describe the previous Tohoku milestone. They time pending source fitting and retain separate source hashes. They are not a before-and-after benchmark for this visual expansion.
