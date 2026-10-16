# Evidence exports

## Sub-features

JSON retains experiment, geometry, observation provenance, every actual path and fit evidence. CSV contains one summary row per arrival. A zero-arrival result retains one geometry row.

## How to get to it (user POV)

Calculate an experiment, then choose Download JSON or Download CSV near the bottom. Uncalculated advanced edits disable exports until calculation.

## Driving it with Playwright

Register the download event before clicking the visible download control. Save the actual file in the evidence directory. Parse JSON and check scientific identity, source 137.25 km, distance 76.43 degrees, fixed recording ID and complete arrivals against the current snapshot and native CLI.

Check the CSV header contains units through field names including `time_s`, `ray_param_s_rad`, `turning_depth_km`. Require one data row per arrival. At100 km/5 degrees require exactly a header and one row retaining depth, distance and recording ID with blank arrival fields. A download event or filename alone is insufficient proof.

## Gotchas

CSV is a summary; use JSON for paths and complete experiment evidence. Historical recordings stay fixed under hypothetical geometry. Never export old results as though they belong to unsubmitted controls or a pending calculation.
