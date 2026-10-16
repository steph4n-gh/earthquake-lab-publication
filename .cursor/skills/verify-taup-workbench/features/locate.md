# Source investigation

## Sub-features

Inspect a candidate, choose observations, fit a regional source, cancel work and compare the result with the catalog without overwriting the candidate.

## How to get to it (user POV)

Choose Find its source. Enter coordinates or tap the Japan region on the globe. Calculate candidate. Fit source, then Reveal catalog. Open Inspect observations and method to change the network.

## Driving it with Playwright

Fill `#latitude` and `#longitude`, then click `Calculate candidate`. Use a noncatalog point such as 41.125N,146.875E. Independently reconstruct great-circle distances, earliest native uppercase P, common mean origin offset and RMS from the frozen manual picks. Every selected station remains present.

Click `Fit source`, then `Cancel` during actual curve preparation. Retry calculation must restore a current candidate snapshot. Repeat Fit source and require `state.fit.directCheck.exactConfirmed`, per-station error at most 0.05 s, and agreement with the separate exact ObsPy/SciPy control within 0.01 degree and 0.01 s RMS. Reveal keeps candidate coordinates unchanged and displays approximately 41.9 km from the catalog.

Open `#evidence-details > summary`. Uncheck observations using `Use TATO observation` and equivalent labels. Two retained stations must disable Fit and expose ambiguity. Restore a different four-station subset, fit and independently reconstruct every residual. No outlier may silently disappear.

## Gotchas

Depth is fixed 29 km. Origin time is fitted. Search is bounded20–55N,120–165E. Equal weights reflect missing uncertainty, not known equal precision. The misfit map is not confidence. Catalog agreement does not independently validate accuracy. Changing candidate or observations cancels older work and clears its fit evidence.
