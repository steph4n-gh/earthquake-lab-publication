# Earthquake Lab documentation

Start with the investigation guide to use the lab. Use the developer and verification guides to change or reproduce it.

## Use the lab

- [Complete the Tohoku investigation](investigation-guide.md). Replay recordings, fit a source, explore the inner core, and share the result.
- [Curated earthquake cases](earthquake-cases.md). Compare Tohoku, Maule, and Okhotsk and inspect their observation coverage.

## Build and verify

- [Private preview qualification](preview-status.md). Inspect the finished candidate's actual checks and remaining coverage limits.
- [Preview responsiveness](preview-responsiveness.md). Inspect the current source snapshot, repeated playback and warm interactions, and measurement limits.
- [Maintain the private hosted preview](hosting.md). Preserve Site identity, owner-only access, source provenance and DNS.
- [Build and develop locally](development.md). Install the toolchain, run the browser app or native core, and prepare optional scientific tools.
- [Verify a change](verification.md). Run numerical, data, browser, recording, and responsiveness procedures.
- [Curated scientific evidence](evidence/README.md). Inspect retained negative results and bounded reference checks with their source identities.
- [Project verification skill](../.cursor/skills/verify-taup-workbench/SKILL.md). Follow checks tied to individual controls and workflows.

## Understand the calculations and data

- [Numerical contract](numerical-contract.md). Supported phases, domains, units, frozen tolerances, and held-out enumeration limits.
- [Location experiment](location-experiment.md). Archived picks, station selection, processing, fixed-depth fitting, and model mismatch.
- [Recording provenance](data-provenance.md). The original two-station Tohoku pack and its retained raw sources.
- [Earth imagery](earth-imagery.md). NASA source composite, orientation, derivatives, and attribution.
- [Third-party notices](../THIRD_PARTY.md). Code lineage, scientific citations, observation sources, and separate asset terms.

## Understand the application

- [Application contract](lab-contract.md). Scientific inputs, experiment state, Worker requests, one clock, lifecycle, and exports.
- [Atlas contract](atlas-contract.md). Event replacement, exact station predictions, and linked evidence plots.
- [3D Earth contract](globe-contract.md). Camera, fixed quarter cutaway, local texture, and timed exact paths.
- [Wavefront contract](wavefront-contract.md). Legal ray segments, reversible front sampling, station cues, and finite display interpolation.
- [Local runtime and V8 decision](local-runtime.md). Why one module Worker supplies the demonstrated capability.

## Historical measurements

These pages describe earlier source snapshots. They are not current release-performance claims or physical-phone qualifications. Use [the current procedure](verification.md#measure-responsiveness-and-record-the-demo) to collect new results.

- [Wavefront responsiveness](wavefront-responsiveness.md). The most recent retained visual workload.
- [3D Earth responsiveness](globe-responsiveness.md). Exact selected paths before spreading fronts.
- [Atlas responsiveness](atlas-responsiveness.md). Event switching and linked plots before the current globe.
- [Source-fit responsiveness](responsiveness.md). The earlier Tohoku-only investigation.
- [Browser comparison](browser-comparison.md). A restricted numerical runtime compared with a pinned ObsPy browser distribution.
- [ObsPy browser baseline](baseline.md) and [baseline replay](baseline-replay.md). The broader existing browser implementation and its pinned assets.

The [publication-data record](publication-data.md) explains the narrow factual dataset and independent history. The [archive-comparison procedure](reproduce-catalog-facts.md) checks its facts against optional private captures.
