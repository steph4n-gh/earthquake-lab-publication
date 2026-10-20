# Tau-Gate review helpers

`pr_review.py` and `npm_evidence.py` are copied without modification from Tau-Gate commit [`6c333b490747d79e51920a8d266bac22f0dcf777`](https://github.com/steph4n-gh/tau-gate/tree/6c333b490747d79e51920a8d266bac22f0dcf777). They are licensed under Apache-2.0; see `TAU_GATE_LICENSE` and `TAU_GATE_NOTICE`.

The workflow uses the trusted base commit's helper and policy. Repository administrators pin the v4.2.1 archive URL and SHA256 in `TAU_GATE_ARCHIVE_URL` and `TAU_GATE_ARCHIVE_SHA256` Actions variables. The Rust checker is not vendored. Review candidate fingerprints before adding them to `tau-gate.approvals.json`. A missing or incomplete report is not approval.
