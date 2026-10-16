# Feature map

Run `npm run verify` for all four investigation suites and the focused recording-label check. A focused manual check starts an owned production preview and follows the relevant file.

| Feature | Journey |
| --- | --- |
| [Replay and recordings](replay.md) | Play/pause/scrub, switch actual station, compare independent pick and model, zoom |
| [Source investigation](locate.md) | Candidate, actual residuals, cancel/retry, fit, reveal, changed observations |
| [3D Earth, analytical section and numerical controls](interior.md) | Local texture, fixed quarter cutaway, exact guide and elapsed trail, native P/S/PKIKP packets, deep source, touch orbit, section, nonfixture geometry, absent/close roots, offline |
| [Spreading modeled fronts](wavefronts.md) | Native front vertices, gaps, expiry, rewind, exact station and recording timing, lifecycle replacement, links, offline preparation, touch orbit |
| [Reproducible experiments](sharing.md) | Share complete intent, restore camera/clock, reject invalid identity atomically |
| [Evidence exports](exports.md) | Inspect downloaded full JSON, summary CSV and empty-result geometry |
| [Curated atlas and linked plots](atlas.md) | Switch real events, preserve missing phases, inspect record sections and travel samples, restore event identity, race and touch checks |

The globe helper owns port 5194 and writes `.audit/globe/browser/`. Current spreading-front measurement and recording use `npm run measure` and `npm run record` sequentially on port 5196. The earlier globe and atlas helpers preserve their historical milestones. Geometry and display ownership are in [the 3D Earth contract](../../../../docs/globe-contract.md).

The wavefront helper owns port 5197 and writes `.audit/wavefronts/browser/`. Its sampled geometric fronts and exact station cues are defined in [the wavefront contract](../../../../docs/wavefront-contract.md). The independent reference helper retains its own input, source, and oracle hashes.

Use [selected recording and release polish](polish.md) for the compact branch caption, metadata, documentation links, and completed distribution notices.
