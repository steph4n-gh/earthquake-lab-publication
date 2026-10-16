#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build --release --locked --target wasm32-unknown-unknown -p taup-core --features wasm
wasm-bindgen target/wasm32-unknown-unknown/release/taup_core.wasm --out-dir web/pkg --target web
