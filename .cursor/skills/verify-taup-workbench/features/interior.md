# 3D Earth, analytical section and numerical controls

## Sub-features

The 3D globe is the primary interior view. A fixed quarter cutaway, proportional core shells and two radial walls show actual P, S and PKIKP paths. The faint guide retains the complete path. A separate bright trail reaches the current timed packet. The Ray section remains a secondary analytical view. [Modeled fronts](wavefronts.md) add simultaneous equal-time surfaces and cut-plane contours without changing the selected exact path. Advanced radial experiments preserve multiple and absent arrivals.

## How to get to it (user POV)

Choose Look inside Earth. The 3D globe opens with its cutaway. Drag the Earth to orbit it, then use Focus section or Reset camera. Try Trace the inner core. Select Ray section for the proportional diagram. Open Advanced geometry experiment for depth and distance.

## Driving it with Playwright

Run `node scripts/verify-globe.mjs` after rebuilding. The helper owns port 5194 and writes `.audit/globe/browser/`. Read [the 3D Earth contract](../../../../docs/globe-contract.md) before judging the cutaway. Main owns the shared clock. The globe projects Worker paths and owns camera interaction.

At Tohoku, click `button[data-mode="explore"]`. Require `interiorView` to equal `globe`, a visible `#earth-globe`, a hidden `#section-view` and an open cutaway. Require `data-earth-texture="ready"`. Check the actual same-origin image response is 4096 by 2048 and its byte hash matches a built artifact. The July 2004 NASA composite is geographic context, not event-time imagery.

Use ANMO and select P, then S. Scrub between actual cumulative-time path samples. Compare browser roots and packet coordinates with the independently executed native CLI. Check `data-selected-path` retains exactly `path.length - 1` guide segments. Its elapsed segment count must end at the current interpolated packet. Before origin and after arrival, the full guide remains while the packet is absent. Check the common globe and recording clock values.

Click Trace the inner core. Require the 3D view, LVC, PKIKP, an open cutaway and a turning depth greater than 5153.9 km. Inspect a packet between actual inner-core samples. Focus selected ray section, then drag across both sides of the ray plane. Require camera changes and exactly two unchanged unit normals in `data-cut-normals`. Rendering, orbit history and link restoration must not change the Earth-coordinate opening. The camera tuple alone reproduces the view.

Switch to Okhotsk and repeat its core example. Compare the source position with the 598.1 km deep hypocenter. Its radius must equal 0.9061214879924659. Close Earth and require the surface epicenter representation. Reopen Earth and require the actual source representation.

Share a paused, orbited deep-source experiment. Open it in a fresh context. Compare the full experiment, native arrivals, actual camera diagnostics, both cut normals, packet and rendered segment counts. Keep physical packet fields exactly equal across sharing. Compare projected CSS coordinates within 1e-8 pixels to allow projection roundoff. Compare the globe captures with at most 0.005 changed-pixel fraction using the helper's 12-level channel tolerance. Select Ray section, share again, and require the explicit section intent to restore with the globe hidden.

Use a 390 by 844 touch context for all three events. Require the 3D default before selecting another view. Tap the core example, scrub a real packet, perform an actual touch drag, and tap Close Earth and Open Earth. Confirm the cut normals stay fixed and the document has no horizontal overflow. Retain captures and traces. In the atlas helper, explicitly select Ray section before its existing packet, label and size assertions. Preserve those section checks.

Open `#advanced > summary`. Enter source 137.25 km, distance 76.43 degrees and Calculate geometry. Compare all arrivals, ray parameters and path lengths with the native CLI. The actual station trace stays fixed. Select S using `Seismic phase`. At 0 km and 20 degrees preserve multiple P branches. At 0 km and 14.277354176720932 degrees preserve exactly five P arrivals and two roots with ray parameter between 767 and 768 s/rad. At 100 km and 5 degrees show no supported arrivals. Invalid 701 km must fail input validity and disable stale exports. Disconnect after loading and calculate unseen 411.125 km and 131.375 degrees. Follow its actual packet and orbit without a network request.

## Gotchas

The advanced receiver is virtual along a real station bearing. It must be labeled hypothetical. Candidate source changes in Locate leave receivers real. The solver supports only uppercase P, S, PKIKP, surface receivers, depth 0–700 km and distance 1–179 degrees. No missing phase may be invented for visual effect.

Ray colors, luminous packets and shell shading do not represent wave amplitude, energy, temperature or a full wavefield. Paths visible through retained Earth use the stated X-ray presentation. A touch-enabled desktop browser is not a physical-phone test. Use `scripts/measure-globe.mjs` for current visible-packet responsiveness and `scripts/record-globe.mjs` for the current walkthrough. Both own port 5195, so run them sequentially.
