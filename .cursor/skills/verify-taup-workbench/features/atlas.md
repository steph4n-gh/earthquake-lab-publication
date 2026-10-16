# Curated atlas and linked plots

Use the `Earthquake investigation` selector. Three options represent Tohoku 2011, Maule 2010 and Okhotsk 2013. Tohoku has nine recordings and eight manual picks. Maule has six and three. Okhotsk has six and five. Only Tohoku supports fitting. The new cases show an explicit explanation and `Open Tohoku source challenge` action.

Run `npm run verify:atlas` against a rebuilt production app. The helper owns port 4193 by default. `TAUP_PORT` and `TAUP_EVIDENCE` isolate another run.

## Event evidence

Compare each station's exact snapshot with the native CLI at its real distance and catalog depth. Source data remain in `fixtures/events/<key>/case.json`. Check actual waveform start offsets, sample rates, samples, UTC origins and manual pick markers. Missing picks remain absent. Maule LVC retains three P paths. Maule KIP has an archived P label without a supported modeled P. Maule CTAO has a real recording and no supported P, S or PKIKP. Okhotsk's source is 598.1 km deep and its LVC station has a supported inner-core path.

Switch events during Worker startup, Fit and travel sampling. The last selected case must own every snapshot, trace, pick, label, export and diagram. Retired progress or errors must not replace it. Repeated switches must leave the UI usable. Recompute after loading offline.

Start lifecycle observation before changing events. Keep at least ten timestamped samples, a minimum 2.5-second window for fitting and travel sampling or 1.2 seconds for startup, and a final sample with the selected event ready. Check every captured source, plot, section and recording against its case. The existing 60-second readiness budget bounds observation; sample count is not a rendering-performance measurement.

Arm the pending observer before activating Fit or Travel. Capture the actual event selector change before the application handler runs. Require the previous case to remain pending at that moment, with an unresolved numerical Worker request for Fit and Travel. Retain both timestamps and identities. A pending state seen earlier does not prove an in-flight switch. The helper's form-selection API dispatches input/change through the real control; it does not claim those change events are trusted physical input.

For startup, hold the first actual Worker script request until after the first event switch, then release the unmodified response. A fixed download delay cannot establish that startup remained pending during activation. Always release the held request in cleanup as well.

## Linked views

Select `Station recordings`. Rows sort by real angular distance. Each filtered count trace scales independently. Archived manual P and exact modeled predictions use different marks. Select a row and verify the shared station and playback cursor. Candidate and virtual geometry must never move the historical pick or recording.

Select `Travel-time diagram`. Require 90 exact samples from 1 through 179 degrees in 2 degree steps, including empty arrays. Compare every sampled phase, local branch, time, ray parameter and turning depth with native results. Never infer branch continuity from numbered roots. Select a point to request that actual distance, phase and local branch. Keep the virtual receiver visibly distinct from real station predictions.

Open `Look inside Earth`, then `Trace the inner core`. Require the default `3D globe`, open cutaway, LVC and PKIKP. Select `Ray section` explicitly to inspect its proportional mantle, liquid outer core and solid inner core. Confirm actual ray and packet positions from cumulative-time path interpolation. Check the visible material and depth readout. Switch to `3D globe`, focus the ray section and orbit. Both views consume the same station, phase, branch and clock. The [interior journey](interior.md) adds the two fixed cut normals, local texture and separate guide and elapsed trail checks.

## Sharing and mobile

Share a nondefault event, view, geometry and camera. Version2 links include event, immutable identity, evidence view and interior view. Open the link in a new page and compare the complete experiment and exact outputs. A strict historical version1 Tohoku link must retain its original intent. Unknown event, mismatched identity and an unsupported location exercise must reset atomically to default Tohoku with a visible reason.

Repeat event switching, section playback, record selection, travel selection and sharing at 390 by 844 with touch enabled. Require the visible 3D default before explicitly choosing Ray section for its size assertion. Confirm no horizontal overflow, readable labels, available selectors and visible initial Play. This qualifies a touch browser layout on the host, not a physical phone.
