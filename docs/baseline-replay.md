# Replay the historical browser baseline

This optional research procedure replays the pinned baseline assets rather than the current application. It requires network downloads and historical helpers with macOS-specific Chrome paths. Use [the verification guide](verification.md) for the supported project checks.

Run these commands from the repository root. Use Node.js, Python, and Google Chrome on macOS. The native parity command also requires the project's `.venv` with ObsPy.

1. Install the isolated browser driver.

   ```sh
   npm install --prefix .cache/baseline playwright@1.58.2
   ```

2. Download and verify the pinned runtime assets.

   ```sh
   python3 scripts/baseline-prepare.py
   ```

3. Start the local server in a terminal.

   ```sh
   python3 -m http.server 4178 --bind 127.0.0.1
   ```

4. Run the browser benchmark in another terminal.

   ```sh
   node scripts/baseline-benchmark.mjs
   python3 scripts/baseline-summary.py
   ```

5. Compare every browser path point with native ObsPy.

   ```sh
   node scripts/baseline-parity.mjs
   ```

6. Collect a separate profile.

   ```sh
   node scripts/baseline-profile.mjs
   ```

Open `http://127.0.0.1:4178/scripts/baseline.html` for the diagnostic page. Its `window.baseline.query(depthKm, distanceDeg)` function returns a promise containing arrivals with all path points. `window.baseline.heapBytes()` returns allocated WebAssembly linear memory.

To inspect eager shared-library loading, append `?eager=1` to the diagnostic URL. To preserve an alternative measurement, set `BASELINE_URL`, `BASELINE_RUNS`, and `BASELINE_OUTPUT` before the benchmark command. The summary command requires at least five complete runs.

Stop the local server with Control-C when finished. A checksum mismatch during asset preparation means the upstream asset changed. Preserve the existing lock and report the failed URL before choosing a replacement.
