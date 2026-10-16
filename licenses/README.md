# Retained third-party notices

These files preserve notices for the numerical source and locked dependencies. They do not replace the application license in [LICENSE](../LICENSE). Data and imagery policies are described in [THIRD_PARTY.md](../THIRD_PARTY.md).

| Material | Retained notice | Provenance |
| --- | --- | --- |
| ObsPy 1.5.1 TauP | [Original README](obspy-taup-README.txt) and [complete upstream GPL/LGPL texts](obspy-LICENSE.txt). | [Pinned source URLs and SHA-256 values](obspy-taup-provenance.json). |
| Three.js 0.186.1 | [MIT license](three.txt). | Version is locked in `package-lock.json`. |
| Locked Rust dependencies | Exact package license files in `rust/`. | [Per-package version, checksum, SPDX declaration, and file hashes](rust/manifest.json). |

The ObsPy package header declares LGPL version 3. Its README contains the different literal label `GLPv3`. The README is retained unchanged so that attribution and the discrepancy remain reviewable. The application keeps its existing `LGPL-3.0-only` declaration. The combined upstream file retains the complete GPL and LGPL texts from pinned ObsPy. The root license contains its complete verbatim LGPL version 3 section. Both files are copied into the production distribution.

The Rust inventory covers all 19 external packages in `Cargo.lock`, including build-time crates. It retains all license alternatives supplied by those packages. The inventory does not imply that every listed crate contributes code to every compiled output. The Unicode-3.0 text required alongside `unicode-ident`'s other declaration is retained separately.

Each Rust notice was copied byte for byte from the locally cached registry package for its locked version. The registry package checksum and each copied file's SHA-256 are recorded. No registry source or development environment is vendored by this notice directory.
