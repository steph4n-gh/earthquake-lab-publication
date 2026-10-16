# Reproducible experiments

## Sub-features

The URL stores complete experiment intent with immutable case, legacy recording and model identity. It stores neither answers nor raw samples. Reopening recomputes locally and starts paused.

## How to get to it (user POV)

Set a source or radial geometry, station, phase, branch, time, speed, camera, cutaway, front visibility, and waveform window. Select Share experiment. Copy its URL or use the selectable field if clipboard access fails.

## Driving it with Playwright

Change the camera through an actual canvas drag. Scrub to 913.7 s and set30×. Click Share experiment and read `Reproducible experiment URL`. Open it in a fresh page. Compare the complete `state.experiment`, resulting arrivals, paused status and actual rendered camera attributes. A URL camera tuple alone does not prove camera replay.

Append a duplicate time field, change identity, omit fields, or use a fragment over 4096 characters. Each must reset the entire experiment to Replay with a visible notice. No partially applied source or station survives. Hash navigation must cancel older numerical work. An unavailable branch resets visibly after calculation.

The optional `fronts` field stores front visibility as `0` or `1`. A historical link without it enables the default fronts and preserves the other fields. The focused [front journey](wavefronts.md) verifies both values and the omitted-field path in a fresh context.

## Gotchas

A local origin remains part of the URL. A link from localhost requires the same locally served project; it is not a hosted public share service. Changed identity resets safely. Fit grids are derived evidence and regenerate through Fit source; the shared candidate and exact predictions reproduce without embedding an optimizer answer.
