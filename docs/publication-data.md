# Narrow factual publication data

This independent source candidate keeps the app's three earthquakes, 21 real event-station recordings and 16 selected manual P picks. It changes the catalog input representation. The original private development repository, full captures and historical verification remain preserved separately.

## Distributed scope

Each event pack contains a compact `catalog-facts.json`. It retains preferred event time, position, depth, magnitude and identifiers. It retains only selected P-pick times and their reported metadata, explicit absent picks, historical source-pick counts and acquisition receipts. The legacy Tohoku producer shares the investigation's factual input.

The inputs exclude unused origins, magnitudes, moment tensors, amplitudes, embedded descriptions and full catalog responses. Each receipt identifies the original response by URL, UTC retrieval time, byte count and SHA256. A fingerprint identifies source bytes. It is not a license declaration.

The selected picks report network IR and station code. Unknown creator, channel, location and uncertainty remain unknown. The separately recorded IU.00.BHZ trace is a station-based match. It is not proof that an analyst picked that sensor. Missing picks remain missing.

The actual IU MiniSEED observations, event-time StationXML, DOI attribution, original processing and frozen numerical inputs remain distributed under their documented source policies. See [data provenance](data-provenance.md), [third-party terms](../THIRD_PARTY.md) and [numerical scope](numerical-contract.md).

## Factual-data rationale

[USGS copyright policy](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) distinguishes its own material from third-party contributions. It does not establish a blanket license for every nested contribution in a catalog response. The [Copyright Office](https://www.copyright.gov/help/faq/faq-protect.html) distinguishes facts from protected expression. [USGS licensing guidance](https://www.usgs.gov/data-management/data-licensing) distinguishes underlying facts from a potentially protected compilation.

These distinctions support distributing the small factual subset required by the app. The project does not redistribute the original multi-agency compilation, assign LGPL to third-party data, invent a Creative Commons license or offer a worldwide legal guarantee. The original full-archive reuse question remains relevant to the preserved private archive. It does not justify importing that archive into this candidate.

The [IU network DOI](https://doi.org/10.7914/SN/IU) identifies Albuquerque Seismological Laboratory/USGS. That producer identity and the USGS policy remain the reuse basis for the recordings. Its empty DOI rights list remains empty. Data access used EarthScope Consortium's NSF National Geophysical Facility archive, supported by NSF award 2435260. [EarthScope citation guidance](https://www.earthscope.org/how-to-cite/) supplies the archive acknowledgement.

## Independent history

The candidate begins with a new Git root. It is not a fork, clone with shared objects, or rewritten branch of the original repository. The original `steph4n-gh/earthquake-lab` stays private. Old commit and CI links continue to refer to it.

`npm run verify:publication` checks distributed working files and every object reachable from all local Git refs. It rejects the seven excluded capture paths, known original archive contents under renamed paths, full event-product JSON and QuakeML catalog shapes. It rejects shared object alternates and shallow history. Its isolated controls include a bad file removed from the latest tree but still reachable in history.

This gate addresses the identified archive scope. It does not identify every possible license issue in arbitrary future material. New data still need their own source review. Before public opening, fetch and inspect every intended ref, rerun the gate, and confirm the remote is an independent repository with the expected refs.

## Reproduce the application facts

The ordinary [offline observation commands](verification.md#reproduce-observations-and-reference-calculations) use compact facts, actual recordings and station metadata. They reproduce the four browser JSON derivatives exactly. They need neither the original private repository nor full catalog captures.

The optional catalog extraction command compares the retained facts with the historical full captures. Keep those captures outside distributed source, under `.cache/source-archives/` or in the original private archive. Live reacquisition uses original request URLs and may return changed bytes. A changed response requires review. It cannot silently replace the qualified facts.

The [archive-comparison procedure](reproduce-catalog-facts.md) gives exact commands. The extraction CLI's `--help` lists comparison and reacquisition modes. No ordinary build or offline verification fetches the original catalogs.

## Publication boundary

The repository and existing hosted preview remain private. A passing factual-data gate does not change visibility or authorize a public release. The [release checklist](../RELEASE_CHECKLIST.md) retains explicit coordinated-launch approval and exact-source qualification. Current browser and physical-device limitations remain visible.
