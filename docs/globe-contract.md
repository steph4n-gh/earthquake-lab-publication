# 3D Earth investigation

The globe owns display geometry and pointer interaction. Main owns experiment intent and the replay clock. The existing Worker supplies every calculated path. The `createGlobe` interface keeps those responsibilities separate.

## Fixed quarter cutaway

The fixed quarter cutaway derives from the selected source and receiver. The first radial wall contains the exact ray plane. The second wall is perpendicular to it. Its normal points toward the shortest arc's midpoint, keeping that complete arc on one half of the ray plane. Both planes pass through the Earth center. Their directions depend on geographic geometry, never camera position or orbit history.

The surface, atmosphere and spherical core shells remove the same quarter with intersection clipping. Each interior wall keeps only the appropriate half-disc. Faces stay on the exact plane. Polygon offset resolves coplanar rendering without moving physical coordinates.

The Earth radius is 6371 km. The core boundaries remain 2889 km and 5153.9 km deep. Layer colors, shading, ray widths and luminous packets aid reading. They do not model temperature, wave amplitude, energy or event-time illumination. Paths shown through retained Earth have an explicit X-ray explanation.

Geographic north stays camera up. Orbit rotates the view of the fixed cut Earth. There is no independently adjustable cut angle. The current camera azimuth, elevation and distance therefore reproduce the view without a new shared-state field. Explicit Focus changes the camera. Rendering and link restoration never silently refocus it.

## Surface and paths

The app serves the NASA July 2004 monthly composite locally. Its documented equirectangular orientation matches the existing sphere UV coordinates without rotation or reversal. The imagery credit and its historical composite role stay visible. The asset gate checks both original and derivative hashes. An asynchronous texture completion after disposal releases its texture.

Selected paths retain exact projected samples and cumulative path time. A subdued complete guide shows the destination. A separate bright elapsed trail reaches the interpolated packet in every mode. The single shared replay clock controls the guide, trail, packet, and [modeled fronts](wavefront-contract.md). The packet and front interpolate Cartesian endpoints of native path segments at cumulative time. Depth and material labels derive from the displayed point. The fronts show bounded supported ray families and do not claim a complete wavefield.

Explore, the inner-core example and sampled travel roots enter the 3D view. Explicit section links and the Ray section control still work. Replay and Locate keep their existing station selection and source-placement workflows.

## Read-only inspection

Read-only packet, source, and camera diagnostics describe the current view. `data-earth-texture` exposes loading, ready, or error state. `data-cut-normals` contains both actual clipping-plane normals in rendered Three.js coordinates. `data-selected-path` reports the phase, full point count, guide segment count and elapsed segment count from rendered geometry. The packet includes its projected CSS-pixel screen position and whether it projects inside the canvas. These observations must not set app state. `data-wavefronts` adds compact front and station-cue observations. The on-demand read-only `window.workbench.frontGeometry()` returns actual position, index, and cut-contour buffers for independent verification. It does not run during ordinary playback.

The public-control browser helper checks native ray interpolation, both stable cut normals across orbit, deep-source placement, loaded local imagery, sharing, legacy section intent, offline calculation and touch gestures. Visual captures judge readability. Browser measurements describe the tested host and viewport, without claiming physical phone performance.
