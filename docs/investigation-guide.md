# Complete the Tohoku investigation

We will replay Tohoku across real station recordings, estimate a source from archived arrival picks, and follow a calculated path through the inner core. Start the app with the [developer guide](development.md).

## Watch the earthquake spread

1. Choose **Tohoku 2011** in **Earthquake investigation**. Open **Replay the event**. The page shows the historical source and nine real recordings.
2. Press **Open Earth**. The surface opens into a quarter cutaway with layers drawn to scale.
3. Keep **Wavefronts on** and press **Play earthquake**. Green P and amber S fronts expand through the mantle. Violet PKIKP fronts follow supported paths through the inner core.
4. Drag the Earth to orbit the cutaway. Scroll or pinch to zoom. The cut itself stays fixed to the source and receiver geometry.
5. Pause. Move **Replay time in seconds after catalog origin** backward. The fronts and reached-station states return to that earlier time.

The colored surfaces show modeled equal-time positions along sampled rays. Their brightness does not encode shaking strength. The [wavefront contract](wavefront-contract.md) defines the display.

## Compare a model arrival with a recording

1. Choose a P arrival in **Follow the arrivals**. The lab selects that station and jumps the clock to its exact model arrival.
2. Read the recording beside the Earth. The pale playhead and the station cue share that catalog-relative time.
3. Choose **TATO** in **Recording station**. The recording includes a gold archived manual P marker and colored dashed model markers.
4. Choose **P** in **Seismic phase**. If **Arrival branch** offers several roots, choose each one. The selected label and path identify that exact branch.
5. Open **Station recordings** below the primary view. The rows align on the same clock. Compare timing across stations rather than line height.

The model and the archived pick can disagree. Each recording scales independently and retains instrument response. The pick archive does not identify the exact displayed BHZ sensor or provide numeric uncertainty.

## Locate a source from the picks

1. Open **Find its source**. Tohoku's exercise starts with eight archived P observations and fixed 29 km depth.
2. Enter a candidate latitude and longitude within the displayed Japan region. Press **Calculate candidate**. The signed residuals show each observation's timing mismatch after a common origin offset is fitted.
3. Press **Fit source**. Wait for curve preparation, regional search, and exact station confirmation. The result shows a fitted candidate and its residual RMS.
4. Press **Reveal catalog**. The fitted point remains visible beside the historical catalog epicenter.
5. Inspect the separation. The retained independent control has about 0.476 s RMS while sitting about 41.9 km from the catalog. A tighter residual is not proof of a more accurate historical location.
6. Remove one observation in the table and fit again. The candidate changes because the observations constrain the result. Restore all eight observations for the original exercise.

At least four observations are required for automated fitting. Two or three observations still permit candidate residual inspection and display an ambiguity warning. The colored score field shows model sensitivity rather than a confidence region. Read [the location method](location-experiment.md) for the independent controls and omitted physics.

## Follow the inner-core path

1. Open **Look inside Earth**. Press **Trace the inner core**. Tohoku selects LVC, a real view-only recording station, and the calculated PKIKP path.
2. Press **Play earthquake**. Follow the moving packet down through the mantle, through the outer and inner core, and back toward the station.
3. Choose the LVC PKIKP station-arrival button to jump to its exact predicted arrival. The real recording cursor follows the same clock.
4. Switch to **Ray section** to inspect the selected path in a flat section. Return to **3D globe** to orbit it.
5. Open **Travel-time diagram**. The Worker calculates supported roots at 90 distances. Select a point to inspect its exact geometry and branch.

**Advanced geometry experiment** changes modeled depth and virtual receiver distance. The historical recording does not move. An absent supported phase is a model result and does not mean the recording contains no seismic energy.

## Keep the experiment

1. Pause at a useful view. Press **Share experiment**. Copy the displayed URL if the clipboard is unavailable.
2. Open the URL where the same compatible app is served. The case, model identity, station, phase, branch, clock, and camera restore. The app recomputes the calculation and opens paused.
3. Press **Download JSON** to save detailed calculation output and provenance. Use **Download CSV** for an arrival summary.

A share link stores settings rather than waveform data or a saved fit grid. A localhost link needs a local app at that origin. Invalid or incompatible links reset completely with a visible warning.

## Compare other earthquakes

Choose Maule to compare another shallow megathrust event with six real recordings. Choose Okhotsk to follow a deep source with six recordings and different paths. Both support replay and exploration. Their **Find its source** page explains that the qualified challenge is Tohoku's.
