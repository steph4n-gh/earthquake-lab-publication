# Corresponding source for Earthquake Lab

The application and numerical adaptation use LGPL-3.0-only. Data, imagery, and dependencies have separate terms recorded in `THIRD_PARTY.md` and `licenses/`. The included `LICENSE` contains the complete LGPL version 3 text. `licenses/obspy-LICENSE.txt` preserves the complete upstream GPL version 3 and LGPL version 3 texts unchanged.

The public source repository is https://github.com/steph4n-gh/earthquake-lab-publication.

Before distributing a compiled build, provide recipients with its matching corresponding source under the applicable license terms. Include the Rust and JavaScript sources, fixture inputs, Cargo.lock, package-lock.json, build scripts, notices, and instructions. Record the exact source commit. Do not substitute a moving default branch for the source that produced a binary. Preserve modifications and upstream attribution.

## Build the application

Use Git, Node.js 24 or later, standard-library Python 3, Rust with Cargo, the wasm32-unknown-unknown target, and wasm-bindgen CLI 0.2.129. The preview was developed with Rust 1.99.0. A browser needs WebGL2 and module Worker support.

For an unpacked source archive without a `.git` directory, run `git init` in its root first. Project checks use Git to detect ignored documentation targets.

From the corresponding source root, run these commands.

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.129 --locked
npm ci
cargo build --release --locked
npm run build
npm run verify:distribution
npm run preview -- --port 4181 --strictPort
```

Open http://127.0.0.1:4181/. No account, database, server API, Python, or Java runtime is needed by the browser app. Source builds and tests require standard-library Python 3 for publication checks. The separate pinned scientific Python environment is optional for observation regeneration and independent reference calculations.

The source repository's `docs/development.md`, `docs/verification.md`, and fixture manifests describe development, checks, and scientific inputs. The build copies this file and the legal notices into `dist`. It does not automatically create or deliver a corresponding-source archive.

This independent publication candidate excludes the full multi-agency catalog responses and original development history. The original private archive remains preserved separately. See [the publication-data record](docs/publication-data.md) for the exact factual scope and reproduction path.

## Hosted source revision

The public hosted lab includes `DEPLOYMENT.json` with the exact publication repository commit and its immutable source URL. Use that commit when reproducing the deployed build. The Site wrapper records the completed distribution hashes separately. Its managed internal source history and the original development repository and full-catalog archive remain private; this independent GitHub repository provides the corresponding source for the clean publication.
