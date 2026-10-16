# Recorded Tohoku waveform provenance

This document describes the original two-station Tohoku fixture in `fixtures/observed/`. Its source snapshots were retrieved on October 15, 2026. That fixture has actual recordings and no observed arrival picks. The [Tohoku investigation](location-experiment.md) adds independently archived picks and eight station recordings. The [earthquake cases](earthquake-cases.md) describe the combined 21-recording atlas.

## Event and stations

The [USGS event record](https://earthquake.usgs.gov/earthquakes/eventpage/official20110311054624120_30) identifies the 2011 Great Tohoku earthquake with these preferred parameters.

| Field | Value |
| --- | --- |
| Event identifier | `official20110311054624120_30` |
| Origin time | `2011-03-11T05:46:24.120Z` |
| Latitude | 38.297 degrees north |
| Longitude | 142.373 degrees east |
| Depth | 29 km |
| Magnitude | 9.1 `mww` |

The compact factual input in `fixtures/investigation/catalog-facts.json` retains the preferred event parameters and original acquisition receipts. The fetch script rejects a change in those parameters. Full catalog responses are excluded from this publication candidate and its Git history. The original private archive remains preserved separately.

| Trace | Station | Latitude | Longitude | Distance from event | Browser sample count |
| --- | --- | --- | --- | --- | --- |
| `IU.ANMO.00.BHZ` | Albuquerque, New Mexico, USA | 34.945981 | -106.457133 | 82.9537792701 degrees | 2,760 |
| `IU.LVC.00.BHZ` | Limon Verde, Chile | -22.6127 | -68.9111 | 149.0291368208 degrees | 2,760 |

The coordinates come from each channel's StationXML epoch active at the event origin. Distance uses spherical geographic coordinates without a geocentric latitude correction. Azimuth uses the same spherical convention. The code does not substitute station names or positions from a current inventory.

ANMO supports comparison with mantle P and S predictions. LVC supports comparison with an inner-core-transiting PKIKP prediction. Neither role identifies an observed phase pick. A vertical component alone does not guarantee a distinct S onset.

## Source files and hashes

`fixtures/observed/manifest.json` records the exact request URLs, redirected response URLs, UTC acquisition times, byte lengths, SHA256 values, and processing package versions.

Each station has a raw MiniSEED file and StationXML response metadata. Both raw traces contain one uninterrupted sequence of 55,200 samples at 20 Hz. The requested interval extends from 60 seconds before the origin to 2,700 seconds after it. The first returned samples occur about 0.04954 seconds after the requested start. The browser preserves that timing offset.

Requests to `service.iris.edu` redirected to the EarthScope-operated `service.earthscope.org` endpoints. These specific public requests succeeded without authentication at capture time. The bundled app does not need access to that service.

The captured tool versions are Python 3.13.5, ObsPy 1.5.1, NumPy 2.5.4, and SciPy 1.18.1. The manifest is the source of truth if the fixture is deliberately refreshed.

## Display processing and units

The browser JSON is a compact derivative of the raw observations. Both traces use the same operations.

1. Convert the integer instrumental counts to 64-bit floating point values.
2. Remove the least-squares linear trend over the full trace.
3. Apply a cosine taper to two percent at each end, limited to 30 seconds.
4. Apply a four-corner, zero-phase Butterworth bandpass from 0.02 to 0.2 Hz.
5. Resample from 20 Hz to 1 Hz with SciPy's polyphase resampler and its Kaiser-window anti-alias filter.
6. Round browser samples to one decimal count with decimal half-even rounding. Round derived distance and azimuth metadata to ten decimal degrees. Raw coordinates and all clocks remain unchanged.

These values remain filtered instrumental counts. The instrument response is preserved in StationXML but is not removed. The amplitudes do not represent displacement, velocity, or acceleration. Do not compare the amplitudes between stations as calibrated ground motion.

Zero-phase filtering can spread energy before an onset. The displayed trace is appropriate for exploring predicted time windows. It is not a source of reviewed onset times. The finite earthquake rupture, three-dimensional Earth structure, instrument response, and other signals can all separate a visible waveform feature from a one-dimensional ray prediction.

`start_offset_s + index / sample_rate_hz` gives each sample's time in seconds after the captured origin. `start_time_utc` retains the corresponding absolute time. The historical waveform stays fixed when the user changes a hypothetical source depth or receiver location. Such inputs change the prediction, not the observation.

## Data rights and attribution

The [IU network DOI](https://doi.org/10.7914/SN/IU) identifies Albuquerque Seismological Laboratory/USGS as the dataset creator. The raw DOI metadata is preserved in [iu-network-doi.json](../fixtures/observed/iu-network-doi.json). The [USGS copyright statement](https://www.usgs.gov/faqs/are-usgs-reportspublications-copyrighted) places USGS-produced data in the U.S. public domain and distinguishes third-party material. That producer identity and policy are the documented reuse basis for these IU observations with attribution. The DOI metadata has an empty `rightsList`, so the project does not infer a Creative Commons license for the data.

The StationXML marks both stations and channels as open. Public access alone is not the redistribution basis. The [USGS GSN data page](https://www.usgs.gov/programs/earthquake-hazards/science/gsn-data) documents the archive relationship. The [EarthScope citation instructions](https://www.earthscope.org/how-to-cite/) request credit to the recording network as well as the archive.

Credit the data as follows.

> Albuquerque Seismological Laboratory/USGS (1988). Global Seismograph Network (GSN - IRIS/USGS). International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/IU. Accessed through the EarthScope-operated IRIS Data Management Center on October 15, 2026.

The processed browser traces are modified versions of those observations. The project code license does not replace the data's source policy. USGS event metadata retains USGS attribution. This fixture contains no downloaded third-party photographs or product images from the event page.

Data access used EarthScope Consortium's NSF National Geophysical Facility archive, supported by NSF award 2435260. The [current archive acknowledgement](https://www.earthscope.org/how-to-cite/) credits the facility and its sponsor. It does not claim that NSF funded Earthquake Lab or change the observations' terms.

## Public-release caveat for event aggregates

The original private development repository contains complete GeoJSON and QuakeML responses with unused multi-agency origins, magnitudes, amplitudes, moment tensors and embedded prose. Applicable unrestricted redistribution terms were not established for that full historical scope. This publication candidate excludes all seven full capture paths and their original blobs from its source and history. The original private repository and archives remain intact.

Three compact factual inputs retain only the preferred event facts, 16 selected manual P-pick facts, explicit missing picks, historical pick counts and source receipts needed to reproduce the app. They include original URLs, retrieval timestamps, byte counts and SHA256 fingerprints. The selected picks report network IR and station code. Their creator, channel, location and timing uncertainty remain unknown. A US ANSS resource ID does not establish a separate per-pick author or license.

The [U.S. Copyright Office](https://www.copyright.gov/help/faq/faq-protect.html) distinguishes facts from protected expression. [USGS data-licensing guidance](https://www.usgs.gov/data-management/data-licensing) distinguishes underlying facts from protected compilations. Those sources support the narrow factual-data approach. The project does not assign the code's LGPL to third-party observations, claim a new Creative Commons grant, or certify every downstream use in every jurisdiction.

The [publication-data record](publication-data.md) defines the distributed scope and history checks. Ordinary offline verification uses the compact facts, actual MiniSEED recordings and StationXML metadata. Optional archive comparison checks the historical source separately. Live reacquisition is unnecessary for offline verification and may encounter upstream changes.

The IU producer-based reuse basis and separate [NASA imagery policy](earth-imagery.md) remain unchanged.

## Reproduce and verify the fixture

Run this command from the project directory with the recorded processing package versions.

```sh
	./.venv/bin/python scripts/fetch_waveforms.py --verify
```

The command makes no network requests and writes no files. It checks retained input and producer hashes, validates the trace grids and active station epochs, and reproduces the browser JSON byte for byte. Full event archives are not required.

The default command reuses the captured files and regenerates the derivative. It rejects a cached hash mismatch. To request new waveform, StationXML and DOI snapshots, use `--refresh` instead. Catalog facts remain frozen and need separate extraction and review. Upstream StationXML and DOI responses can change, so refreshing need not produce the original hashes. Review the resulting manifest changes before accepting them.

```sh
	./.venv/bin/python scripts/fetch_waveforms.py --refresh
```

A refresh replaces only this fixture's source snapshots and derivative. If a download fails before its acquisition record is written, use `--refresh` to obtain a complete new capture. Each request has a 30-second timeout.

The [historical Linux negative result](evidence/observation-reproduction-linux.json) records why the earlier display format failed exact regeneration. Current [display precision](observation-precision.md) uses an explicit decimal rounding rule. All three producer assertions remain exact, and both Linux and macOS CI run them. Read each actual run before claiming a platform is qualified.
