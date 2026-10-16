# Build and develop locally

The application is static and needs no service credentials. With access to [the private source repository](https://github.com/steph4n-gh/earthquake-lab-publication), clone it with GitHub CLI.

```sh
gh repo clone steph4n-gh/earthquake-lab-publication
cd earthquake-lab-publication
```

Run the remaining commands from that repository root. For an unpacked source archive without `.git`, run `git init` first. Static documentation checks use Git ignore rules.

## Install the application toolchain

The development environment uses Node.js 24.3.0, Rust 1.99.0, and wasm-bindgen CLI 0.2.129. These are observed development versions, not a claim that every operating system is qualified. Install Git, Node.js, Python 3 available as `python3`, and a Rust toolchain with the platform's usual compiler and linker. The publication gate in `npm run build` and the history controls in `npm test` use only Python's standard library.

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.129 --locked
npm ci
```

The wasm-bindgen CLI version must match the crate in `Cargo.lock`. A mismatched CLI rejects the generated WASM. Do not update only one side.

## Build and open the lab

```sh
npm run check:project
npm run build
npm run dev -- --port 5173 --strictPort
```

Open [the local lab](http://127.0.0.1:5173/). The first build creates `web/pkg/`, then Vite produces `dist/`. Frozen asset hashes are checked before compilation. Stop the development server with Control-C.

To inspect the production bundle, run this command after a successful build.

```sh
npm run preview -- --port 4181 --strictPort
```

Open [the production preview](http://127.0.0.1:4181/). A source change requires a new build before production verification. No deployment is part of this procedure.

## Use the numerical core

```sh
cargo build --release --locked
./target/release/taup 137.25 76.43
./target/release/taup --wavefront-fan 29
```

The first query prints supported arrivals and paths for source depth in kilometers and receiver distance in degrees. `--wavefront-fan` prints downward ray samples divided into legal intervals. `--wavefront-reference` exports the finite scientific qualification inputs.

Rust consumers use the `taup-core` crate within the workspace.

```rust
use taup_core::{calculate, first_p_time, Phase};

let arrivals = calculate(29.0, 82.95377927009868, &[Phase::P, Phase::S]).unwrap();
let earliest_p_seconds = first_p_time(29.0, 82.95377927009868).unwrap();
```

After asynchronous initialization, the generated WebAssembly module exposes `calculate_json(depthKm, distanceDeg)`, `first_p_time_json(depthKm, distanceDeg)`, and `wavefront_fan_json(depthKm, phaseIndex)`. The scalar P call returns a JSON number or null. It uses the full solver's P roots without constructing paths. See [the numerical contract](numerical-contract.md) for units, bounds, and exclusions.

## Prepare browser verification

Install Google Chrome through its normal installer. The five browser helpers use Playwright's installed `chrome` channel. `npm ci` supplies the driver but does not install Chrome.

```sh
cargo build --release --locked
npm run build
npm run verify
```

Run the browser suites sequentially. Each helper starts a strict-port production preview and closes its owned preview and browser contexts. A conflicting port is an error. Set `TAUP_PORT` and `TAUP_EVIDENCE` for a separate run. See [verification](verification.md) for each suite and evidence output.

A touch-enabled 390-pixel desktop Chrome context qualifies that layout and its simulated gestures. It does not qualify a physical phone, Safari, or every mobile browser.

## Prepare optional scientific tools

The source build and history controls already need standard-library Python 3. The separate pinned environment below adds packages for optional data-derivative and reference checks. Python is not loaded by the application.

```sh
python3.13 -m venv .venv
.venv/bin/python -m pip install -r requirements-reference.txt
```

The pinned environment includes ObsPy 1.5.1 and SciPy 1.18.1. Both Linux and macOS CI require exact derivative regeneration. The [display-precision contract](observation-precision.md) records the decimal rule and historical platform failures. Run the [scientific checks](verification.md#reproduce-observations-and-reference-calculations) before changing frozen inputs. Data verification uses retained compact catalog facts, captured recordings and station metadata. Refresh flags acquire replacement recordings and metadata. Catalog facts require the separate extraction and review procedure in the [publication-data record](publication-data.md).

## Prepare optional recording tools

Install `ffmpeg` and `ffprobe` on `PATH` before running the current walkthrough helper. Keep measurement and recording separate.

```sh
ffmpeg -version
ffprobe -version
node scripts/record-wavefronts.mjs
```

The walkthrough uses public controls and records the built app. The committed [walkthrough](media/wavefront-walkthrough.mp4) is a retained demo, not a new performance measurement of your machine.

## Find the code

| Area | Files |
| --- | --- |
| Frozen cases and shared state | `web/experiment.js` and `fixtures/` |
| App intent, lifecycle, and one clock | `web/main.js` |
| Controls and selected recording | `web/panels.js` and `web/style.css` |
| Worker facade and jobs | `web/compute.js` and `web/compute-worker.js` |
| Source fit | `web/location.js` |
| Earth and modeled fronts | `web/globe.js`, `web/wavefronts.js`, and `web/wavefront-geometry.js` |
| Linked plots and section | `web/evidence.js` and `web/section.js` |
| Numerical core and CLI | `crates/taup-core/src/` |

Generated directories include `node_modules/`, `target/`, `web/pkg/`, `dist/`, and `.audit/`. They are not source inputs. Keep approved scientific fixtures, compact facts, manifests, lockfiles and generation recipes under version control. Full event catalogs belong only in an ignored local cache or the preserved private archive.

## Resolve common setup errors

- If the build reports a missing target, run `rustup target add wasm32-unknown-unknown`.
- If wasm-bindgen reports a schema mismatch, install the exact CLI version shown above and rebuild.
- If a frozen hash fails, preserve the fixture and inspect the manifest. Do not regenerate a manifest merely to silence the check.
- If Chrome cannot launch, confirm that Google Chrome is installed. A Playwright-managed Chromium download is not the channel used by these helpers.
- If a preview port is busy, stop your owned preview or use another `TAUP_PORT`. Do not terminate unrelated processes.
- If a shared link resets, inspect its visible warning. Different case or model identity is rejected deliberately.

Historical baseline tools have separate prerequisites and macOS-specific browser paths. They are optional research procedures documented in [baseline replay](baseline-replay.md).
