# Tau-Gate review helpers

`pr_review.py`, `npm_evidence.py`, and `github_pr_approval.py` match the published [Tau-Gate v4.3.0-beta.1](https://github.com/steph4n-gh/tau-gate/releases/tag/v4.3.0-beta.1) archive at commit `70d21b51454fecd6d37bf4fffa21ed0a70e9220d`. They are licensed under Apache-2.0; see `TAU_GATE_LICENSE` and `TAU_GATE_NOTICE`.

The workflow uses the trusted base commit's helpers and policy. Repository administrators pin the beta archive URL and SHA256 in `TAU_GATE_ARCHIVE_URL` and `TAU_GATE_ARCHIVE_SHA256` Actions variables. The published archive SHA256 is `9b42c00212fe4e652e73e99a005186cdbe1066551f1859436405eb6e60f958d5`. The Rust checker is not vendored. Review candidate fingerprints before adding them to `tau-gate.approvals.json`. A missing or incomplete report is not approval.
