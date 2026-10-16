# Modeled wavefront contract

The fronts show equal-time positions along supported downward P, S, and PKIKP rays in the frozen IASP91 model. They make simultaneous propagation visible while real recordings retain their own measured samples. They do not show displacement, shaking amplitude, attenuation, finite rupture, all seismic energy, or a complete wavefield.

## Source-depth fan

The native fan contains a source depth, a sampling policy, explicit legal ray-parameter segments, and omitted intervals. Each segment owns ordered `Arrival` rays with cumulative path time. A failed shooting sample breaks adjacency. A physical velocity discontinuity can contain several zero-thickness slowness sublayers. Those sublayers form one open omitted interval at that depth. No surface joins samples across that interval.

Source depth and the frozen model identify a fan. Selecting a station, selecting a phase, or orbiting the camera reuses the prepared fan. Moving the geographic source changes its projection. A new source depth requires preparation in the numerical Worker. Generation and request checks prevent an old result from entering a newer investigation. Cancellation is cooperative at bounded preparation checkpoints.

## Shared clock

Main owns one replay clock relative to catalog origin. A front uses that clock minus the current modeled origin offset. The display interpolates Cartesian endpoints of each native path segment at its cumulative time, matching the established selected packet. It does not claim exact continuous ray coordinates between samples. A rendered point's radius can differ from separately interpolating the path's polar depth. The independent path-data reference limits remain unchanged. Each ray expires at its own surface endpoint. An expired ray cannot remain attached to a surviving neighbor. Before modeled origin, no front has propagated. Seeking backward reconstructs positions and reached states from the current clock.

Real-station cues use exact station predictions from the current snapshot. Their catalog-relative arrival time is the exact model travel time plus the modeled origin offset. A sampled front intersection does not set a station's arrival. Recorded samples and independent manual picks keep their historical times when the modeled source or origin changes.

A visible modeled cue can disagree with an archived pick. That mismatch remains evidence. A missing supported phase does not imply silence in a real recording.

## Geometry and presentation

The production globe retains its fixed quarter cutaway, proportional layers, geographic source, real stations, and selected exact path. The front surfaces and their cut-plane contours use the same source and model coordinates. P, S, and PKIKP remain distinguishable. The selected path is the precise connection to a recording station.

The single front visibility control changes presentation. Its value belongs to reproducible experiment state. Older links without the field remain accepted. The analytical Ray section remains available with its existing calculations and timed packet.

## Qualification

`scripts/verify-wavefront-reference.py` compares native arbitrary-parameter rays with independent ObsPy shots and analytic constant-velocity controls. It checks the explicit discontinuity gaps and keeps the frozen travel-time, turning-depth, and sampled-path tolerances. The finite comparison does not establish complete phase coverage.

`scripts/verify-wavefronts.mjs` drives the built application through public controls in fresh desktop and touch-enabled Chrome contexts. It compares rendered vertex data with a separately executed native fan, inspects legal adjacency and expiry, checks station and recording clocks, seeks backward, exercises event and source-depth replacement, restores shared state, and calculates unseen geometry offline. Read-only diagnostics inspect results. They do not create state.

The original investigation, atlas, and globe helpers retain their existing assertions. A new front check does not replace those checks. Traces, captures, source hashes, built asset hashes, and failed attempts belong to the evidence. A 390-pixel touch-enabled desktop browser is not a physical-phone test.
