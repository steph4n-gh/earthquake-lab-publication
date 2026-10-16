# Replay and recordings

## Sub-features

Nine real vertical recordings share one clock with calculated rays. Eight have independently archived manual P picks. LVC is view-only for the core example. The waveform display does not generate picks or simulated ground motion. Sampled geometric fronts share that clock. Exact model arrivals pulse real station cues and recording rows. The [front journey](wavefronts.md) checks their origin-adjusted timing and backward seeks.

## How to get to it (user POV)

Open the lab and press Play earthquake. Choose a recording station. Scrub or zoom to the arrival.

## Driving it with Playwright

Use `Play earthquake replay`, then `Pause earthquake replay`. `Replay time in seconds after catalog origin` controls the clock. Select `IU.TATO.00.BHZ` with `Recording station`. Use `Zoom to arrival` and `Show full recording`.

Prove clock advancement and that camera/playback do not increment worker calculation count. A paused scrub must agree with actual `#wave-cursor[data-time-s]` and `#earth-globe[data-playback-time-s]`. The selected packet's time and model position are observational canvas attributes. Verify them against cumulative path-time interpolation. The manual-pick marker retains its archived offset when source predictions change. The raw trace path remains unchanged for the same station/full window.

## Gotchas

The displayed amplitudes are filtered counts, independently scaled. No response removal occurs. Zero-phase filtering can spread energy before an onset. The archived pick does not identify the displayed BHZ channel. Playing before a calculation finishes advances the same clock but cannot show a current path until the atomic snapshot arrives.
