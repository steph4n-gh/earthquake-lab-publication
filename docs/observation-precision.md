# Observation display precision

The source observations retain their original MiniSEED counts, StationXML, archived pick times and missing uncertainty. This contract changes how computed display values are rounded after the existing detrending, taper, bandpass and resampling steps.

## Decimal output rule

Displayed samples use decimal half-even rounding to one decimal count. A value exactly between two tenths rounds to the even tenth. Derived event-to-station distance and azimuth use the same rule at ten decimal degrees. A rounded zero is serialized as positive `0.0`. Raw event and station coordinates, recording clocks, analyst picks, model and solver tolerances remain unchanged.

The shared `scripts/display_quantization.py` applies this rule to computed values. It does not look up frozen output or correct individual stations or samples. The three producers retain strict byte-for-byte `--verify` assertions. A different output remains a failure.

## Why the format changed

The earlier three-decimal output passed on a local Mac but failed on both Linux and another Mac runner despite pinned Python and package versions. The [historical Linux receipt](evidence/observation-reproduction-linux.json) preserves nine differing displayed samples and three geographic last-bit differences. The actual scientific processing uses platform-specific numerical libraries. Package pins alone did not establish identical output bytes.

Complete derivative probes compared decimal half-even output at three, two and one sample decimals. Three and two decimals still differed between the tested local Mac and Linux environments. One decimal produced the same four complete outputs in that probe. The lowest peak in the retained traces was 128761.914 counts. The largest displayed change from the prior three-decimal pack was approximately 0.05 count. The raw signal, timing and picks did not change.

This is an explicit change to display precision. It is not a new measurement, a calibrated error bound, an uncertainty estimate or a claim that every numerical platform is identical. Current Linux and macOS CI must actually reproduce all four frozen derivative files before a candidate qualifies.

## Experiment identity and historical evidence

The four derived JSON files change their hashes. New experiment links carry the new case and legacy identities. Old links opened against a different dataset receive the existing visible version warning and reset to the default experiment. The preserved private original deployment and source continue to identify their original data.

Original recordings, full private catalogs and earlier negative results remain preserved. Earlier walkthroughs and performance receipts describe their recorded source and data. They do not qualify a changed dataset. New functional checks bind their source and built assets to the candidate under review.
