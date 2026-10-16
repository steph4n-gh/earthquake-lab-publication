# Tohoku location experiment

Eight archived manual P picks and eight obtainable vertical recordings support a bounded educational source-location exercise. The [frozen case](../fixtures/investigation/tohoku-investigation.json) pairs independent USGS pick times with recordings. The display does not generate or repick those observations.

## Observations and station selection

The selected stations are TATO, GUMO, COLA, KIP, CTAO, KEV, KONO, and ANMO. Their catalog distances span 22.12 to 82.95 degrees. Their largest azimuthal gap is 98.306 degrees. Selection used geographic coverage and recording availability before the source fit. No selected station was removed after inspecting its residual.

The ninth displayed station, LVC, comes from the original recording pack. It supplies an inner-core exploration route and has no observation in the location fit. ANMO appears once in the composed investigation.

The upstream QuakeML snapshot contains 695 picks, including 602 P picks marked manual. All eight selected picks are marked manual. Their waveform IDs use network `IR` and omit channel and location. Station codes are matched to open `IU.00.BHZ` channels with event-time StationXML epochs. This establishes the documented station and epoch match, not the exact sensor that supplied the pick.

The selected pick records state no time, lower, or upper uncertainty. Those fields remain null. Equal weighting does not create an uncertainty model.

## Recording processing

Each requested trace covers 60 seconds before to 2700 seconds after catalog origin. Each has 55,200 actual samples at 20 Hz. CTAO contains zero-sample MiniSEED records and exactly contiguous positive-sample groups. Processing discards the zero-sample records and joins the contiguous groups without filling gaps. The other seven recordings each parse as one positive-sample trace.

The deterministic derivative removes a linear trend, applies a 2 percent cosine taper limited to 30 seconds, and uses a four-corner zero-phase Butterworth filter from 0.02 to 0.2 Hz. Polyphase anti-alias resampling produces 1 Hz display data. Display samples are rounded to 0.001 counts. Raw MiniSEED and response StationXML remain available beside the acquisition manifest.

The display shows filtered instrumental counts without instrument-response removal. Amplitudes cannot be compared as physical ground motion between sensors. Zero-phase filtering can spread energy before an onset. Archived manual picks retain their own clocks independently of this display processing.

## Fixed-depth objective

Depth stays fixed at 29 km. Latitude and longitude vary within 20 to 55 degrees north and 120 to 165 degrees east. Each candidate predicts the earliest supported downward uppercase P arrival at every selected station. Missing P makes the candidate inadmissible.

For observed offsets `o_i` and model travel times `t_i`, the fitted common origin offset is `mean(o_i - t_i)`. Each signed residual is `o_i - t_i - origin_offset`. The objective is the root mean square of these equally weighted residuals.

Automated fitting requires at least four manual observations. Two or three observations retain candidate residual inspection with an ambiguity warning. The regional search boundary, fixed depth, phase policy, and freely fitted origin all constrain the answer.

## Browser fit

The Worker generates a first-P travel-time curve from the current Rust and WebAssembly engine. It checks and adaptively refines the curve with independent interstitial distances. Unsupported intervals remain unsupported. The target finite per-station discrepancy is 0.05 s.

A regional grid and refinements retain several separated basins. Final candidates receive exact station calculations. The fit refines affected curve intervals if exact confirmation exceeds the bound. Bounded failure replaces a false success when confirmation cannot pass. The browser does not load the independent result as an answer or use it as an optimizer seed.

Finite checks and exact final confirmation bound the tested approximation error. They do not prove a continuous global optimum. The displayed misfit field shows sensitivity under this model, not a statistical confidence region.

## Independent controls

A separate ObsPy 1.5.1 and SciPy 1.18.1 calculation uses exact `TauPyModel('iasp91')` rays at every optimizer evaluation. Its geographic distances use a separate haversine implementation. Three regional starts converge to the same eight-station result in the [retained location snapshot](evidence/location-feasibility.json).

| Quantity | Independent result |
| --- | --- |
| Latitude | 37.926664 degrees north |
| Longitude | 142.459575 degrees east |
| Fitted origin offset | +0.072677 s |
| RMS residual | 0.475668 s |
| Distance from catalog epicenter | 41.870 km |
| RMS at catalog geometry and catalog origin | 2.197736 s |
| RMS at catalog geometry after origin fit | 2.197298 s |
| Maximum leave-one-out displacement from full fit | 6.805 km |

The retained native comparison reproduces 16 first-P times at the catalog and fitted positions. Its maximum difference from ObsPy is about 5.7e-13 s. This is a finite implementation comparison.

Two-station fits using COLA and KIP reach residuals below 0.1 s at points separated by about 1639 km. A low residual alone does not establish a unique source. The eight leave-one-out results and the ambiguity control remain in the receipt.

The fit's roughly 41.9 km catalog separation despite roughly 0.476 s RMS is part of the demonstration. The catalog may use related observations, so catalog agreement is descriptive and does not independently validate physical accuracy.

## Physical limits

IASP91 is a spherical one-dimensional Earth model. Receivers sit on the model surface. The exercise omits station elevation, sensor depth, geocentric correction, and lateral Earth variation. Tohoku was an extended rupture, but the model uses a point source. Rays represent travel time and path geometry rather than amplitude, attenuation, finite-fault rupture, or the full wavefield.

## Reproduction

From the repository root, use the pinned [scientific Python environment](development.md#prepare-optional-scientific-tools) and build the release native executable.

```sh
.venv/bin/python scripts/investigation-data/prepare.py --verify
.venv/bin/python scripts/investigation-data/check_location.py
```

The first command performs no network requests or writes. It checks 20 file hashes, the producer script hash, and exact offline regeneration of the display case. The second reruns independent exact-ray fits, station dropouts, ambiguity, and native comparisons. It writes a new local receipt under `.audit/lab/`.

Without flags, `prepare.py` reuses captured sources and regenerates the case and manifest. `--refresh` deliberately reacquires upstream snapshots and records new hashes. Review source changes before adopting them. The [curated evidence guide](evidence/README.md) distinguishes historical snapshots from fresh qualification.

## Sources

Manual picks come from [USGS phase data](https://earthquake.usgs.gov/product/phase-data/official20110311054624120_30/official/1478119914480/quakeml.xml). Event geometry comes from [the USGS event detail](https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/official20110311054624120_30.geojson). Recordings and event-time StationXML come from the EarthScope-operated FDSN service through the legacy IRIS endpoint. [The acquisition manifest](../fixtures/investigation/manifest.json) retains requested URLs, redirects, capture times, processing versions, and content hashes.

Credit Albuquerque Seismological Laboratory/USGS, Global Seismograph Network, [doi:10.7914/SN/IU](https://doi.org/10.7914/SN/IU). The captured DOI metadata identifies the creator but has an empty rights list. No Creative Commons license is inferred. [THIRD_PARTY.md](../THIRD_PARTY.md) keeps code licensing, data producer policy, archive acknowledgement, and aggregate-source review separate.
