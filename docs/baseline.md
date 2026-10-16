# ObsPy browser baseline

This is historical research evidence from the initial restricted-engine comparison. It does not measure the current Earthquake Lab app. `sourceSnapshot` is the pinned binary-asset set in [baseline-lock.json](baseline-lock.json), with inspected source revision `cac66b289a36a61592cbce911c968c74f951b9cb`. The binary set was not matched to a verified reproducible source build.

The existing ObsPy baseline computes IASP91 arrivals and ray paths inside Chromium through WebAssembly. Browser TauP execution is already available. The Rust port must justify its narrower engine through integration, shipped size, or measured interaction cost.

The baseline comes from the [MMesch pyjs-obspy demo](https://github.com/MMesch/pyjs-obspy), which includes a TauP ray-path interface. Its [deployed environment](https://mmesch.com/pyjs-obspy/) ran successfully before the local replay was created. No native Python process supplies browser results.

`baseline-lock.json` pins every downloaded runtime and package archive by SHA-256. The inspected source revision is `cac66b289a36a61592cbce911c968c74f951b9cb`. A matching source revision for the deployed binaries was not verified. This is a replay of pinned binary assets, not an audited reproducible source build.

The browser runtime reports `sys.platform == 'emscripten'`. Its package versions are ObsPy 1.5.0, Python 3.13.1, NumPy 2.4.4, SciPy 1.17.1, and pyjs 4.0.3. The Emscripten ABI package is 4.0.9. The baseline uses the declared dependency closure for ObsPy, Python, and pyjs-rt. This removes the demo's development packages, pip, and HTTP patch package. The resulting closure contains 43 packages.

The local replay uses the pyjs bootstrap option `skip_loading_shared_libs`. Required libraries load when imported. Both queries still pass. Allocated WebAssembly linear memory is 139,198,464 bytes after the queries. Eager loading allocated 200,474,624 bytes in a separate control. These values exclude the browser's other memory.

## Numerical parity

The native comparison uses ObsPy 1.5.1. Both implementations use the IASP91 model and source depth 35 km. The requested phase names are P, S, and PKIKP.

| Distance | Returned arrivals | Time in seconds | Path points |
| --- | --- | --- | --- |
| 60 degrees | P | 602.950356186041 | 277 |
| 60 degrees | S | 1093.648135181093 | 284 |
| 150 degrees | PKIKP | 1180.998866428882 | 671 |

All 1,232 path points were compared. Maximum absolute errors were 4.55e-13 seconds for arrival times, 5.16e-11 seconds for path times, 4.00e-12 degrees for path distance, and 1.73e-11 km for path depth. This establishes implementation agreement on these two queries. It is not independent scientific validation or evidence about other phase regimes.

The original deployed demo was also queried for PKP at 150 degrees. It returned two arrivals at 1186.2437173706344 and 1191.973313463219 seconds. Those branches are outside the selected first Rust scope.

## Standalone measurements

These measurements establish a working baseline. They do not establish a Rust performance advantage. Five fresh browser contexts ran without HTTP caching against an uncompressed localhost server. Each context then alternated ten warm queries between 60 and 150 degrees. Every measured query awaited the computation, parsed all path output, checked arrival names and times, and checked endpoint distance and depth. The run recorded no HTTP, transport, or page errors.

The host was an Apple M4 Pro with 12 cores. Chrome reported version 155.0.8059.80. The host was shared with concurrent project work. Initial one-minute load average was 7.93. The measurements did not interleave with Rust runs.

| Measurement | Median | Range | Samples |
| --- | --- | --- | --- |
| Cold navigation to first verified result | 4436.54 ms | 4421.93 to 4610.07 ms | 5 |
| Warm 60-degree query with complete paths | 35.10 ms | 32.30 to 40.30 ms | 25 |
| Warm 150-degree query with complete path | 23.50 ms | 22.30 to 25.80 ms | 25 |

The downloaded runtime and package files total 75,316,190 bytes. Gzip compression of the JavaScript and WebAssembly files would reduce that total to an estimated 62,115,264 bytes. Package archives are already compressed. The latter number is an artifact-size calculation, not a measured network transfer or internet cold-load time.

The baseline is a general ObsPy package closure. It includes many scientific functions that the three-phase Rust core does not support. These bytes are not a lower bound for a custom, reduced ObsPy distribution.

A separate Python profile covered twenty actual queries. `TauPyModel.get_ray_paths` consumed 0.483 of 0.529 profiled seconds. Arrival refinement through `scipy.optimize.brentq`, `shoot_ray`, and slowness-layer integration dominated computation. Package extraction and Python imports dominate cold startup. Profiled timings are excluded from the reported benchmark samples.

## Evidence

The `.audit/baseline/` directory contains the original deployed-browser probe, five-run raw measurements, all returned path points, the native parity report, the profile, and the generated summary. `baseline-lock.json` records the recoverable asset URLs and checksums. The replay procedure is in [baseline-replay.md](baseline-replay.md). The subsequent interleaved Rust comparison is documented in [browser-comparison.md](browser-comparison.md).

The upstream demo is MIT licensed. ObsPy's distribution identifies LGPL v3.0. Downloaded dependencies remain in the ignored cache. Any redistribution must retain the applicable package licenses and source obligations.
