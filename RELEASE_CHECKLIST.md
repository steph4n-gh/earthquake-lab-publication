# Release qualification

Version 0.1.0 is a public educational preview. The independent publication repository and hosted lab opened together on October 16, 2026, on explicit maintainer instruction, with private vulnerability reporting enabled. The original development repository and full archive remain private. A source license and passing tests do not automatically establish permission to republish every bundled source archive.

## Qualify a preview

- Build and verify a fresh clone using the [development guide](docs/development.md).
- Run the [verification procedures](docs/verification.md) against the exact candidate commit.
- Inspect the desktop and touch-enabled layouts, complete investigation, shared state, and exports.
- Keep observed and modeled timing distinct. Retain missing uncertainty, catalog mismatch, and known numerical exceptions.
- Check the package, Cargo, browser, citation, and GitHub metadata.
- Inspect the exact tracked files for secrets, personal paths, generated output, and oversized development artifacts.
- Confirm that `dist` contains byte-identical notices, dependency licenses, and corresponding-source instructions.
- Confirm that CI passes on the candidate commit. Keep performance evidence separate from CI correctness.
- Preserve the selected GitHub and Site audience. A visibility change requires explicit maintainer instruction.

The current run's outcome is recorded in the [preview qualification](docs/preview-status.md). Generated raw checks remain outside Git and can be reproduced from source.

## Before making the repository public

1. Qualify the [narrow factual distribution](docs/publication-data.md) and run `npm run verify:publication` against every intended publication ref. Keep full multi-agency captures and original development history private. Do not import old refs or Git objects into this independent candidate. Ordinary observation reproduction must pass without original aggregates. See [data rights and credits](THIRD_PARTY.md).
2. Review the exact files and Git history intended for public access. Recheck secrets and personal data after any new commits.
3. Provide matching corresponding source with any compiled distribution. Preserve notices and separate data and media terms.
4. Requalify the actual public candidate commit. Report browser and hardware coverage as tested. Physical phones and Safari require their own checks before compatibility claims expand.
5. Review the existing Site at [quakes.steph4n.dev](https://quakes.steph4n.dev/) with the matching candidate source and verify its selected audience. Verify the canonical and social image URLs against the public destination. Read the hosted `DEPLOYMENT.json` and confirm its immutable corresponding-source URL. Change its audience only with the maintainer's explicit coordinated-launch instruction.
6. Enable GitHub private vulnerability reporting and verify its public instructions before announcing. This was enabled during the coordinated opening. Recheck the setting for later releases.
7. Change repository visibility only on the maintainer's explicit instruction.

The coordinated opening publishes the clean repository and hosted lab. npm and crate publication, release tags, and announcements are separate maintainer decisions.
