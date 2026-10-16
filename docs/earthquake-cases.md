# Curated earthquake observations

The atlas freezes three catalog events and 21 actual vertical recordings. Only Tohoku has a validated source-location exercise.

| Case | Catalog origin UTC | Magnitude | Depth | Recordings | Manual P picks | Location exercise |
| --- | --- | --- | --- | --- | --- | --- |
| Tohoku 2011 | 2011-03-11 05:46:24.120 | 9.1 | 29 km | 9 | 8 | Fixed-depth regional exercise |
| Maule 2010 | 2010-02-27 06:34:11.530 | 8.8 | 22.9 km | 6 | 3 | Unavailable |
| Okhotsk 2013 | 2013-05-24 05:44:48.980 | 8.3 | 598.1 km | 6 | 5 | Unavailable |

The archived preferred origins govern these displays. Older publications may report different depths. The [Maule snapshot](https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/official20100227063411530_30.geojson) and [Okhotsk snapshot](https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/usb000h4jh.geojson) retain the exact selected USGS products. The [Tohoku location method](location-experiment.md) documents its independent exercise.

## New replay packs

Maule contains LVC, ANMO, KIP, KONO, CTAO and TATO. Okhotsk contains MAJO, TATO, COLA, KIP, ANMO and LVC. The station lists were fixed for geographic coverage before examining residuals. Every selected station remains, including unsupported predictions.

All twelve new recordings use IU.00.BHZ with event-time response StationXML. Each raw recording has 55,200 contiguous samples at 20 Hz. Display traces contain 2,760 samples at 1 Hz with their actual fractional UTC offsets. Processing removes a linear trend, applies a 2 percent cosine taper limited to 30 seconds, filters 0.02 to 0.2 Hz with a four-corner zero-phase bandpass, and resamples with SciPy polyphase filtering. Response removal is not applied. Each chart row scales its own filtered instrumental counts. These amplitudes cannot compare ground motion between stations.

USGS [Maule phase data](https://earthquake.usgs.gov/product/phase-data/official20100227063411530_30/official/1478119680198/quakeml.xml) supplies three selected manual P labels. [Okhotsk phase data](https://earthquake.usgs.gov/product/phase-data/usb000h4jh/us/1415325053714/quakeml.xml) supplies five. The archive identifies network IR and station code but omits the displayed sensor's channel and location. Match provenance preserves that limitation. Missing pick uncertainty remains null. An absent pick remains null.

Maule KIP and CTAO retain archived P labels where the limited local solver returns no uppercase P. CTAO has none of the supported P, S or PKIKP arrivals. A missing modeled arrival does not imply a silent recording. KONO and TATO have modeled inner-core paths. Okhotsk LVC also has a modeled inner-core path.

The station record section and sampled travel-time diagram use the same exact solver. Travel samples cover 1 through 179 degrees in 2 degree steps and retain every calculated root at each sample. The plot does not join local root indices across distances or establish continuous branch completeness between samples. Historical picks stay fixed when a hypothetical source or receiver changes.

## Reproduction and rights

`scripts/prepare-events.py --verify` checks frozen factual, recording, metadata, producer and derivative hashes, validates the raw clocks and channel epochs, and reproduces both cases byte for byte without network requests or writes. Each event directory retains its manifest, MiniSEED, StationXML, compact catalog facts, acquisition receipts and network DOI metadata. Maule CTAO contains a zero-sample MiniSEED control record, which the producer excludes before checking contiguity. It fills no gaps.

Credit Albuquerque Seismological Laboratory/USGS (1988), Global Seismograph Network, [doi:10.7914/SN/IU](https://doi.org/10.7914/SN/IU). Recordings were accessed through EarthScope's IRIS Data Management Center on October 15, 2026. USGS ANSS supplies the selected event parameters and manual P labels. The documented reuse basis for IU observations relies on the identified USGS producer and [USGS public-domain statement](https://www.usgs.gov/faqs/are-usgs-reportspublications-copyrighted). An empty DOI rights list is not a Creative Commons license.

Full event and QuakeML aggregates remain in the original private archive. This publication candidate distributes only the factual event fields and selected picks used by the app. The [publication-data record](publication-data.md) describes that scope and its history gate. Data policies remain separate from the code license.
