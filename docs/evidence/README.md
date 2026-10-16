# Scientific evidence snapshots

This directory retains six original historical receipts and one annotated observation-reproduction failure. They preserve useful results and failures without publishing the local browser videos, traces, caches, or full audit directory. [manifest.json](manifest.json) records each original path, original SHA-256, curated SHA-256, and permitted interpretation.

The six original JSON receipts are byte-identical copies of their local sources. None contained a personal absolute path. The later Linux reproduction receipt adds source and environment annotations. Its manifest records both original and curated hashes. Embedded source, binary, helper, and contract hashes describe the historical run. They are not assertions about the current checkout. Some input paths identify local artifacts that are not included in this directory. A file hash identifies omitted bytes but does not make those bytes available.

## What each receipt establishes

| Receipt | Recorded result | Limit |
| --- | --- | --- |
| [Original held-out comparison](held-out-original.json) | `NOT VERIFIED`. Eight exact-count groups differ across 276 cases and 1,211 reference arrivals. | Small scalar errors do not repair a failed enumeration check. |
| [Held-out reconciliation](held-out-reconciliation.json) | A fixed 65-point upstream shooting grid recovers 16 extra Rust rays inside sampled upstream brackets. All 1,211 original arrivals match. | This diagnoses an upstream search limitation. The original failure remains, and completeness outside those finite brackets is unproved. |
| [Boundary comparison](boundaries.json) | 84 cases and 208 reference arrivals pass the recorded limits. | This is a frozen finite comparison at the stated source and binary hashes. |
| [Location feasibility](location-feasibility.json) | Independently archived picks and obtainable recordings support the fixed-depth Tohoku exercise. | The fit differs from the catalog epicenter. Missing pick uncertainty prevents a calibrated confidence claim. |
| [Wavefront reference](wavefront-reference.json) | 1,883 native IASP91 rays and 10 actual-engine constant-velocity controls pass their checks. | This checks sampled travel-time paths, not a full wavefield, amplitudes, arbitrary fan interpolation, or phase completeness. |
| [Wavefront checker controls](wavefront-checker-controls.json) | Ten synthetic and self-reference controls pass expected acceptance or rejection. | This tests checker sensitivity. It does not independently validate the Rust engine. |

The location receipt retains the 41.8702610613365 km catalog offset and 0.4756682224678171 s best-fit RMS. It also retains all station-dropout results and the 1639.2013047203518 km two-station ambiguity. A low residual alone does not establish a unique source. The [location method](../location-experiment.md) explains the model and observation assumptions.

The [numerical contract](../numerical-contract.md) and [wavefront contract](../wavefront-contract.md) define the current supported subset. Comparisons with related implementations check software behavior. Observed recordings and archived picks provide different evidence and retain their timing and provenance.

## Receipt modes

The files in this directory are historical snapshots. A fresh run produces a current receipt in the ignored local `.audit/` directory. The scripts do not update these published snapshots. A new report can have different source and binary hashes even when the scientific results agree.

The manifest checks the integrity of the selected snapshots. It does not turn them into current-run attestations. Build and browser workflow reports belong to their own verification run. They are deliberately outside this scientific selection.

## Reproduce the checks

Run these commands from the repository root after installing the pinned reference environment in [the setup guide](../development.md) and building the native CLI. The Python packages are listed in [requirements-reference.txt](../../requirements-reference.txt).

```sh
	cargo build --release --locked -p taup-core --bin taup
	.venv/bin/python scripts/verify_numerics.py
	.venv/bin/python scripts/verify_numerics.py --corpus fixtures/reference-boundaries.json
```

The held-out exact-count command intentionally exits with code 1 while its known enumeration differences remain. Read its report and retain that failure. Do not weaken the count check to make it green. Run the separate reconciliation to diagnose the finite extra-root groups.

```sh
	.venv/bin/python scripts/verify_numerics.py --corpus fixtures/reference-held-out.json
	.venv/bin/python scripts/reconcile_caustics.py
```

The comparison writes `.audit/numerics-reference-held-out.json`. The reconciliation writes `.audit/caustic-validation.json`. The historical reconciliation here was retained from a prior lab verification run. The current helper records the current source and executable hashes.

Run the independent location experiment against the frozen observations.

```sh
	.venv/bin/python scripts/investigation-data/prepare.py --verify
	.venv/bin/python scripts/investigation-data/check_location.py
```

The location helper writes `.audit/lab/data-feasibility.json`. The first command checks offline observation reproduction. The second reruns exact-ray fits, station dropouts, two-station ambiguity, and native comparisons. It does not replace the browser's own solver with the independent answer.

Generate native fan inputs before checking the wavefront rays. The reference command exports the required five source depths and actual-engine constant-velocity controls.

```sh
	mkdir -p .audit/wavefronts/reference
	target/release/taup --wavefront-reference > .audit/wavefronts/reference/fan.json
	.venv/bin/python scripts/verify-wavefront-reference.py
	.venv/bin/python scripts/verify-wavefront-checker-controls.py
```

The reference helper uses exact arbitrary ray-parameter ObsPy shots and records its oracle source hash. It also writes a separate oracle JSON. The checker-control helper exercises time corruption, nonfinite coordinates, omitted discontinuity metadata, incorrectly joined segments, and corrupted analytic coordinates. Both report paths remain under `.audit/wavefronts/reference/`.

Raw native fans, independent oracle paths, and the original executable are not bundled with these snapshots. The commands generate fresh versions. Reference package versions and build toolchains can affect resulting binary hashes. Keep new evidence labeled with its actual inputs and scope.

## Observation reproduction differs across platforms

The [Linux observation-reproduction result](observation-reproduction-linux.json) preserves a failed exact-byte comparison from the publication repair. That historical run used the original three-decimal processing. Nine displayed waveform samples differ by one 0.001-count rounding unit, and three geographic scalars differ near 1e-14 degrees. The selected picks, recording clocks and other metadata match. The legacy two-station pack reproduces exactly.

The three producer `--verify` commands retain exact equality checks. That historical Linux output still fails the old dataset comparison. Current [display precision](../observation-precision.md) is an explicit format change that must reproduce exactly in both Linux and macOS CI. Neither historical failure is relabeled as a pass. Read the [verification guide](../verification.md) and the current exact-commit CI before claiming qualification.
